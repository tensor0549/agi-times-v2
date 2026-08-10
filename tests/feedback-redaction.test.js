import { describe, expect, it } from 'vitest';
import { issueBody, redactText, safePageUrl } from '../scripts/lib/feedback-redaction.mjs';

describe('feedback triage redaction', () => {
  it('redacts email, phone and secret-shaped strings', () => {
    const output = redactText('me@example.com +1 (206) 555-0199 Bearer abcdefghijklmnopqrstuvwxyz');
    expect(output).not.toContain('me@example.com');
    expect(output).not.toContain('555-0199');
    expect(output).not.toContain('abcdefghijklmnopqrstuvwxyz');
  });
  it('drops URL queries and excludes email/raw user agent from issues', () => {
    expect(safePageUrl('https://agitime.ai/story?token=secret#x')).toBe('https://agitime.ai/story');
    const body = issueBody({ id:'abc', rating:5, locale:'en', page_url:'https://agitime.ai/?email=x@y.com', created_at:'2026-08-10', message:'hello x@y.com', context_json:JSON.stringify({ viewport:'100x100', userAgent:'fingerprint' }) });
    expect(body).toContain('[email redacted]');
    expect(body).not.toContain('fingerprint');
  });
});
