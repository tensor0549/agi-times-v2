import { describe, expect, it } from 'vitest';
import { handoffRecord, redactText, safePageUrl } from '../scripts/lib/feedback-redaction.mjs';

describe('feedback triage privacy', () => {
  it('redacts email, phone and secret-shaped strings', () => {
    const output = redactText('me@example.com +1 (206) 555-0199 Bearer abcdefghijklmnopqrstuvwxyz');
    expect(output).not.toContain('me@example.com');
    expect(output).not.toContain('555-0199');
    expect(output).not.toContain('abcdefghijklmnopqrstuvwxyz');
  });
  it('drops URL queries', () => {
    expect(safePageUrl('https://agitime.ai/story?token=secret#x')).toBe('https://agitime.ai/story');
  });
  it('creates an opaque first-stage record with no user-authored fields', () => {
    const feedback = { id:'abc-123', rating:1, message:'private x@y.com', page_url:'https://agitime.ai/private', context_json:'{"userAgent":"fingerprint"}' };
    const record = handoffRecord(feedback);
    expect(record).toEqual({ feedbackId:'abc-123', category:'general-feedback', severity:'high' });
    expect(JSON.stringify(record)).not.toContain('private x@y.com');
    expect(JSON.stringify(record)).not.toContain('agitime.ai/private');
    expect(JSON.stringify(record)).not.toContain('fingerprint');
  });
});
