import { describe, expect, it } from 'vitest';
import { ingestionFailureCode, ingestionHttpStatus } from '../scripts/lib/ingestion-errors.mjs';

describe('sanitized ingestion failure diagnostics', () => {
  it('extracts only a numeric public HTTP status and maps rate limiting separately', () => {
    expect(ingestionHttpStatus(new Error('resource HTTP 403'))).toBe(403);
    expect(ingestionFailureCode(new Error('resource HTTP 403'))).toBe('http_status');
    expect(ingestionHttpStatus(new Error('resource HTTP 429'))).toBe(429);
    expect(ingestionFailureCode(new Error('resource HTTP 429'))).toBe('rate_limited');
  });

  it('does not treat arbitrary numbers, URLs, or provider text as an HTTP status', () => {
    expect(ingestionHttpStatus(new Error('timeout at https://secret.example/500?token=canary'))).toBeNull();
    expect(ingestionFailureCode(new Error('timeout at https://secret.example/500?token=canary'))).toBe('timeout');
  });
});
