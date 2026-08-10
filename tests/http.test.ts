import { describe, expect, it } from 'vitest';
import { boundedInt, latestTimestamp, parseJson, utcTimestamp } from '../worker/lib/http';
import { isAllowedEvent } from '../worker/lib/posthog';
import { isSameOriginPage } from '../worker/lib/rate-limit';

describe('HTTP helpers', () => {
  it('bounds pagination values', () => {
    expect(boundedInt('1000', 20, 1, 100)).toBe(100);
    expect(boundedInt('-2', 20, 1, 100)).toBe(1);
    expect(boundedInt('bad', 20, 1, 100)).toBe(20);
  });
  it('parses JSON safely', () => {
    expect(parseJson('["models"]', [])).toEqual(['models']);
    expect(parseJson('invalid', [])).toEqual([]);
  });
  it('normalizes SQLite timestamps and keeps bundle generation stable', () => {
    expect(utcTimestamp('2026-08-10 17:32:11')).toBe('2026-08-10T17:32:11.000Z');
    expect(utcTimestamp('2026-08-10T04:00:00Z')).toBe('2026-08-10T04:00:00.000Z');
    const values = ['2026-08-10 17:32:11', '2026-08-10T04:00:00Z'];
    expect(latestTimestamp(values)).toBe('2026-08-10T17:32:11.000Z');
    expect(latestTimestamp(values)).toBe(latestTimestamp(values));
  });
  it('only permits defined analytics events', () => {
    expect(isAllowedEvent('search_performed')).toBe(true);
    expect(isAllowedEvent('$identify')).toBe(false);
  });
  it('accepts feedback context only from the request origin', () => {
    expect(isSameOriginPage('https://agitime.ai/story/1', 'https://agitime.ai/api/v1/feedback')).toBe(true);
    expect(isSameOriginPage('http://localhost:5173/story/1', 'http://localhost:5173/api/v1/feedback')).toBe(true);
    expect(isSameOriginPage('https://evil.example/story/1', 'https://agitime.ai/api/v1/feedback')).toBe(false);
  });
});
