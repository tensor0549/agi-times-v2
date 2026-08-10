import { describe, expect, it } from 'vitest';
import { auditIngestionRun } from '../scripts/lib/ingestion-acceptance.mjs';

const now = Date.parse('2026-08-10T20:00:00Z');
const makeFixture = () => {
  const sources = [];
  const registrySources = [];
  for (let index = 0; index < 100; index++) {
    registrySources.push({ id: `org_${index}`, kind: 'organization', url: `https://org${index}.example/news` });
    registrySources.push({ id: `person_${index}`, kind: 'person', url: `https://people.example/${index}` });
    registrySources.push({ id: `project_${index}`, kind: 'project', url: `https://github.com/example/project-${index}` });
  }
  for (let index = 0; index < 10; index++) registrySources.push({ id: `media_${index}`, kind: 'media', url: `https://media${index}.example/ai` });
  for (let index = 0; index < 25; index++) sources.push({ id: `feed_${index}`, sourceId: `org_${index}`, kind: 'rss', url: `https://org${index}.example/feed.xml`, healthUrl: `https://org${index}.example/feed.xml`, enabled: true });
  sources.push({ id: 'github', sourceId: 'project_0', kind: 'github_search_api', url: 'https://api.github.com/search/repositories', healthUrl: 'https://api.github.com/search/repositories', enabled: true });
  sources.push({ id: 'hf-models', sourceId: 'project_1', kind: 'huggingface_models_api', url: 'https://huggingface.co/api/models', healthUrl: 'https://huggingface.co/api/models', enabled: true });
  const health = sources.map((source) => ({ ingestionId: source.id, sourceId: source.sourceId, status: 'healthy', lastAttemptAt: '2026-08-10T19:59:02Z', lastSuccessAt: '2026-08-10T19:59:01Z', latestItemAt: '2026-08-10T18:00:00Z', itemsSeen: 1, httpStatus: 200, latencyMs: 25, consecutiveFailures: 0, ...(source.kind === 'github_search_api' ? { rateRemaining: 42 } : {}) }));
  return { config: { defaults: { windowDays: 14 }, sources }, registry: { sources: registrySources }, ingested: { windowDays: 14, failures: [], candidateCounts: { beforeCanonicalDedupe: 0, afterCanonicalDedupe: 0, afterRelevanceClassification: 0 }, candidates: [] }, health: { sources: health } };
};

describe('expanded ingestion acceptance', () => {
  it('accepts endpoint-complete health and registry floors', () => {
    const result = auditIngestionRun({ ...makeFixture(), now });
    expect(result.errors).toEqual([]);
    expect(result.summary).toMatchObject({ configured: 27, attempted: 27, successful: 27, feeds: 25, apis: 2 });
  });

  it('detects endpoint identity loss when two endpoints share a registry source', () => {
    const fixture = makeFixture();
    fixture.config.sources.at(-1).sourceId = fixture.config.sources.at(-2).sourceId;
    fixture.health.sources.pop();
    const result = auditIngestionRun({ ...fixture, now });
    expect(result.errors).toContain('hf-models: missing endpoint-level health row');
    expect(result.errors).toContain('attempted source count mismatch: 26!=27');
  });

  it('requires freshness evidence and degrades a successful response with zero parsed items', () => {
    const fixture = makeFixture();
    fixture.health.sources[0].itemsSeen = 0;
    fixture.health.sources[0].latestItemAt = null;
    const result = auditIngestionRun({ ...fixture, now });
    expect(result.errors).toEqual(expect.arrayContaining([
      'feed_0: healthy source requires latestItemAt freshness evidence',
      'feed_0: zero parsed items must be degraded',
    ]));
  });

  it('requires GitHub rate-limit evidence and backoff when exhausted', () => {
    const fixture = makeFixture();
    const health = fixture.health.sources.find((row) => row.ingestionId === 'github');
    health.rateRemaining = 0;
    expect(auditIngestionRun({ ...fixture, now }).errors).toContain('github: exhausted GitHub rate limit must enter backoff');
    health.status = 'backoff'; health.nextRetryAt = '2026-08-10T21:00:00Z';
    expect(auditIngestionRun({ ...fixture, now }).errors).toEqual([]);
  });

  it('rejects homepage candidates, missing classification, raw failures and incomplete community metrics', () => {
    const fixture = makeFixture();
    const github = fixture.config.sources.find((source) => source.id === 'github');
    github.requiresAiClassification = true;
    fixture.ingested.candidates.push({ id: 'candidate_bad', ingestionId: 'github', sourceId: github.sourceId, url: 'https://github.com/example/project-0', publishedAt: '2026-08-10T19:00:00Z', metrics: { stars: 10 } });
    fixture.ingested.candidateCounts = { beforeCanonicalDedupe: 1, afterCanonicalDedupe: 1, afterRelevanceClassification: 1 };
    fixture.ingested.failures.push({ ingestionId: 'github', error: 'HTTP 500 at a private URL' });
    const result = auditIngestionRun({ ...fixture, now });
    expect(result.errors).toEqual(expect.arrayContaining([
      'candidate_bad: URL is not a specific HTTPS item on an allowed source host',
      'candidate_bad: accepted broad/community classification evidence required',
      'candidate_bad: stale/future/invalid project activity timestamp',
      'candidate_bad: GitHub creation and activity provenance required',
      'github: failureCode required',
      'github: unexpected failure fields: error',
    ]));
  });

  it('rejects off-domain items, canonical-equivalent duplicates and rejected classification codes', () => {
    const fixture = makeFixture();
    const feed = fixture.config.sources[0];
    fixture.ingested.candidates.push(
      { id: 'off_domain', ingestionId: feed.id, sourceId: feed.sourceId, url: 'https://attacker.example/story', publishedAt: '2026-08-10T18:30:00Z' },
      { id: 'first', ingestionId: feed.id, sourceId: feed.sourceId, url: 'https://org0.example/story?utm_source=x', publishedAt: '2026-08-10T18:30:00Z' },
      { id: 'duplicate', ingestionId: feed.id, sourceId: feed.sourceId, url: 'https://org0.example/story', publishedAt: '2026-08-10T18:30:00Z' },
    );
    fixture.ingested.candidateCounts = { beforeCanonicalDedupe: 3, afterCanonicalDedupe: 3, afterRelevanceClassification: 3 };
    const result = auditIngestionRun({ ...fixture, now });
    expect(result.errors).toEqual(expect.arrayContaining([
      'off_domain: URL is not a specific HTTPS item on an allowed source host',
      'duplicate: duplicate canonical URL',
      'classified candidate count mismatch: 3!=2',
    ]));
  });

  it('accepts Hugging Face creation separately from current model activity', () => {
    const fixture = makeFixture();
    const source = fixture.config.sources.find((entry) => entry.id === 'hf-models');
    fixture.ingested.candidates.push({ id: 'hf_ok', ingestionId: source.id, sourceId: source.sourceId, url: 'https://huggingface.co/owner/model', publishedAt: '2024-05-01T09:00:00Z', activityAt: '2026-08-10T17:00:00Z', classification: { relevant: true, confidence: 0.9, reasonCode: 'transferable_research' }, metrics: { likes: 50, downloads: 2000, trendingScore: 4, createdAt: '2024-05-01T09:00:00Z', lastModified: '2026-08-10T17:00:00Z' } });
    fixture.ingested.candidateCounts = { beforeCanonicalDedupe: 1, afterCanonicalDedupe: 1, afterRelevanceClassification: 1 };
    expect(auditIngestionRun({ ...fixture, now }).errors).toEqual([]);
  });

  it('accepts specific classified GitHub repository evidence with real trend timestamps', () => {
    const fixture = makeFixture();
    const github = fixture.config.sources.find((source) => source.id === 'github');
    github.requiresAiClassification = true;
    fixture.ingested.candidates.push({ id: 'candidate_ok', ingestionId: 'github', sourceId: github.sourceId, url: 'https://github.com/owner/new-ai-repo', publishedAt: '2025-01-15T10:00:00Z', activityAt: '2026-08-10T18:30:00Z', classification: { relevant: true, confidence: 0.91, reasonCode: 'core_ai' }, metrics: { stars: 250, forks: 20, createdAt: '2025-01-15T10:00:00Z', pushedAt: '2026-08-10T18:30:00Z' } });
    fixture.ingested.candidateCounts = { beforeCanonicalDedupe: 1, afterCanonicalDedupe: 1, afterRelevanceClassification: 1 };
    expect(auditIngestionRun({ ...fixture, now }).errors).toEqual([]);
  });
});
