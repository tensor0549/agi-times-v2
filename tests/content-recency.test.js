import { describe, expect, it } from 'vitest';
import { compareByRecency, freshnessScore, recencyTimestamp } from '../scripts/lib/content-recency.mjs';

describe('project activity recency', () => {
  it('ranks an established project by current activity rather than its old creation date', () => {
    const establishedActive = {
      id: 'established-active',
      publishedAt: '2024-01-01T00:00:00Z',
      activityAt: '2026-08-10T19:30:00Z',
      sourcePriority: 0.8,
    };
    const newlyCreatedButStale = {
      id: 'newer-created-stale',
      publishedAt: '2026-08-10T18:00:00Z',
      activityAt: '2026-08-01T00:00:00Z',
      sourcePriority: 0.9,
    };

    expect([newlyCreatedButStale, establishedActive].sort(compareByRecency).map((item) => item.id))
      .toEqual(['established-active', 'newer-created-stale']);
  });

  it('uses activityAt for project freshness while retaining publishedAt as creation time', () => {
    const now = Date.parse('2026-08-10T20:00:00Z');
    const project = { publishedAt: '2024-01-01T00:00:00Z', activityAt: '2026-08-10T19:00:00Z' };
    const article = { publishedAt: '2026-08-07T20:00:00Z' };

    expect(recencyTimestamp(project)).toBe(Date.parse(project.activityAt));
    expect(freshnessScore(project, now)).toBeGreaterThan(freshnessScore(article, now));
    expect(project.publishedAt).toBe('2024-01-01T00:00:00Z');
  });

  it('falls back to publication time for feed records without activityAt', () => {
    const article = { publishedAt: '2026-08-10T18:00:00Z' };
    expect(recencyTimestamp(article)).toBe(Date.parse(article.publishedAt));
  });
});
