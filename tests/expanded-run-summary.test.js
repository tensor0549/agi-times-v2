import { describe, expect, it } from 'vitest';
import { buildExpandedRunSummary } from '../scripts/lib/expanded-run-summary.mjs';

const fixture = () => {
  const sources = Array.from({ length: 33 }, (_, index) => ({ id: `ingest_endpoint_${index}`, enabled: true }));
  return {
    config: { sources },
    health: { sources: sources.map((source) => ({ ingestionId: source.id, status: 'healthy', rawError: 'https://secret.example/token' })) },
    ingested: {
      checkedAt: '2026-08-10T20:00:00Z', windowDays: 14,
      candidateCounts: { beforeCanonicalDedupe: 2, afterCanonicalDedupe: 2, afterDiversityCap: 2, afterRelevanceClassification: 2 },
      candidates: [
        { sourceKind: 'rss', url: 'https://canary.example/private', title: 'CANARY PRIVATE TITLE', error: 'CANARY RAW ERROR' },
        { sourceKind: 'github_search_api', publishedAt: '2026-08-10T18:00:00Z', metrics: { query: 'new-rising' }, evidenceSnippet: 'CANARY SOURCE EXCERPT' },
      ],
      classification: { rejected: [{ id: 'candidate_secret', reason: 'CANARY REJECTION TEXT' }] },
      failures: [{ failureCode: 'timeout', rawError: 'CANARY FAILURE BODY' }],
    },
  };
};

describe('sanitized expanded ingestion evidence', () => {
  it('emits counts and allowlisted codes without candidate, URL, title, excerpt, rejection, or raw-error text', () => {
    const text = JSON.stringify(buildExpandedRunSummary({ ...fixture(), now: Date.parse('2026-08-10T20:00:00Z') }));
    expect(text).toContain('"configuredEndpoints":33');
    expect(text).toContain('"timeout":1');
    for (const canary of ['canary.example', 'CANARY PRIVATE TITLE', 'CANARY RAW ERROR', 'CANARY SOURCE EXCERPT', 'CANARY REJECTION TEXT', 'CANARY FAILURE BODY', 'secret.example']) expect(text).not.toContain(canary);
  });

  it('rejects non-allowlisted failure codes instead of echoing provider text', () => {
    const data = fixture();
    data.ingested.failures = [{ failureCode: 'HTTP 500 https://secret.example/raw' }];
    expect(() => buildExpandedRunSummary({ ...data, now: Date.parse('2026-08-10T20:00:00Z') })).toThrow('expanded_failure_code_rejected');
  });
});
