import { describe, expect, it } from 'vitest';
import { handoffRecord, redactText, safePageUrl } from '../scripts/lib/feedback-redaction.mjs';
import { classifyFeedback, probePath, publicLog } from '../scripts/lib/feedback-classification.mjs';

describe('feedback triage privacy', () => {
  it('redacts email, phone and secret-shaped strings', () => {
    const output = redactText('me@example.com +1 (206) 555-0199 Bearer abcdefghijklmnopqrstuvwxyz');
    expect(output).not.toContain('me@example.com'); expect(output).not.toContain('555-0199'); expect(output).not.toContain('abcdefghijklmnopqrstuvwxyz');
  });
  it('keeps only allowlisted same-origin probe paths', () => {
    expect(safePageUrl('https://agitime.ai/story?token=secret#x')).toBe('https://agitime.ai/story');
    expect(probePath('https://agitime.ai/api/v1/health')).toBe('/api/v1/health');
    expect(probePath('https://evil.example/private')).toBe('/');
  });
  it('creates opaque handoff and diagnostic structures with no user text', () => {
    const feedback = { id:'abc-123',rating:1,message:'Site is broken, private x@y.com',page_url:'https://agitime.ai/private?token=x',context_json:'{"userAgent":"browser-fingerprint-value"}',locale:'en' };
    expect(handoffRecord(feedback)).toEqual({ feedbackId:'abc-123',category:'general-feedback',severity:'high' });
    const diagnosis=classifyFeedback(feedback);
    expect(diagnosis.category).toBe('bug'); expect(diagnosis.severity).toBe('high'); expect(diagnosis.probePath).toBe('/private');
    const serialized=JSON.stringify(diagnosis);
    expect(serialized).not.toContain('x@y.com'); expect(serialized).not.toContain('browser-fingerprint-value'); expect(serialized).not.toContain('Site is broken');
  });
  it('emits canary-safe public logs containing only aggregate and opaque IDs', () => {
    const log=JSON.stringify(publicLog('feedback_triage_complete',['abc-123']));
    expect(log).toBe('{"event":"feedback_triage_complete","count":1,"opaqueIds":["abc-123"]}');
    expect(log).not.toMatch(/message|email|context|page/i);
  });
});
