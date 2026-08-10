import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { handoffRecord, redactText, safePageUrl } from '../scripts/lib/feedback-redaction.mjs';
import { CLASSIFIER_VERSION, classifyFeedback, normalizedRoute, probePath, publicLog, registeredProbe, structuredFeedbackType } from '../scripts/lib/feedback-classification.mjs';

describe('feedback triage privacy', () => {
  it('redacts email, phone and secret-shaped strings', () => {
    const output = redactText('me@example.com +1 (206) 555-0199 Bearer abcdefghijklmnopqrstuvwxyz');
    expect(output).not.toContain('me@example.com'); expect(output).not.toContain('555-0199'); expect(output).not.toContain('abcdefghijklmnopqrstuvwxyz');
  });
  it('normalizes routes and returns only registered fixed probes', () => {
    expect(safePageUrl('https://agitime.ai/story?token=secret#x')).toBe('https://agitime.ai/story');
    expect(normalizedRoute('https://agitime.ai/story/private-token?email=x@y.com')).toBe('other');
    expect(normalizedRoute('https://evil.example/private')).toBe('invalid');
    expect(probePath('https://agitime.ai/api/v1/health')).toBe('/api/v1/health');
    expect(probePath('https://agitime.ai/private')).toBeNull();
    expect(probePath('https://evil.example/private')).toBeNull();
    expect(registeredProbe('health.ok')).toEqual({path:'/api/v1/health',method:'GET',min:200,max:299,route:'api.health'});
    expect(registeredProbe('attacker.command')).toBeNull();
  });
  it('creates opaque handoff and diagnostic structures with no user text', () => {
    const feedback = { id:'abc-123',rating:1,message:'Site is broken, private x@y.com',page_url:'https://agitime.ai/private?token=x',context_json:'{"userAgent":"browser-fingerprint-value"}',locale:'en' };
    expect(handoffRecord(feedback)).toEqual({ feedbackId:'abc-123',category:'general-feedback',severity:'high' });
    const diagnosis=classifyFeedback(feedback);
    expect(diagnosis.category).toBe('site_defect'); expect(diagnosis.severity).toBe('high'); expect(diagnosis.probePath).toBeNull();
    const serialized=JSON.stringify(diagnosis);
    expect(serialized).not.toContain('x@y.com'); expect(serialized).not.toContain('browser-fingerprint-value'); expect(serialized).not.toContain('Site is broken');
  });
  it('uses only the allowlisted structured feedback type from private context', () => {
    expect(structuredFeedbackType('{"feedbackType":"idea","userAgent":"private-browser-value"}')).toBe('idea');
    expect(structuredFeedbackType('{"feedbackType":"unexpected","message":"private"}')).toBeNull();
    expect(structuredFeedbackType('{not-json')).toBeNull();
    const idea=classifyFeedback({message:'A note without keywords',page_url:'https://agitime.ai/',context_json:'{"feedbackType":"idea","userAgent":"private-browser-value"}'});
    expect(idea.category).toBe('feature_request');
    expect(idea.diagnosis.feedbackType).toBe('idea');
    expect(JSON.stringify(idea)).not.toContain('private-browser-value');
  });
  it('uses one classifier scheme for fingerprint, diagnosis, audit, and migration requeue evidence', () => {
    const classified=classifyFeedback({message:'broken',page_url:'https://agitime.ai/',locale:'en'});
    expect(CLASSIFIER_VERSION).toBe('deterministic-v2');
    expect(classified.diagnosis.classifier).toBe(CLASSIFIER_VERSION);
    const triage=fs.readFileSync(new URL('../scripts/triage-feedback.mjs',import.meta.url),'utf8');
    const migration=fs.readFileSync(new URL('../migrations/0007_feedback_privacy_hardening.sql',import.meta.url),'utf8');
    expect(triage).toContain('JSON.stringify({classifier:CLASSIFIER_VERSION})');
    expect(triage).not.toContain('deterministic-v1');
    expect(migration).toContain(`{"classifier":"${CLASSIFIER_VERSION}"}`);
  });
  it('fingerprints only classification, route bucket and stable probe code', () => {
    const first=classifyFeedback({message:'Site is broken, contact first@example.com',page_url:'https://agitime.ai/private/a',locale:'en'});
    const second=classifyFeedback({message:'Completely different crash report with token abcdefghijklmnopqrstuvwxyz',page_url:'https://agitime.ai/private/b',locale:'zh'});
    const differentCategory=classifyFeedback({message:'Please add a feature',page_url:'https://agitime.ai/private/a',locale:'en'});
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.fingerprint).not.toBe(differentCategory.fingerprint);
    expect(first.diagnosis.normalizedRoute).toBe('other');
  });
  it('emits canary-safe public logs containing only aggregate and opaque IDs', () => {
    const log=JSON.stringify(publicLog('feedback_triage_complete',['abc-123']));
    expect(log).toBe('{"event":"feedback_triage_complete","count":1,"opaqueIds":["abc-123"]}');
    expect(log).not.toMatch(/message|email|context|page/i);
  });
});
