import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const config = JSON.parse(fs.readFileSync('data/ingestion-sources.json', 'utf8'));
const registry = JSON.parse(fs.readFileSync('content/registry.json', 'utf8'));
const byIngestionId = new Map(config.sources.map((source) => [source.id, source]));
const registryIds = new Set(registry.sources.map((source) => source.id));

const restoredPeople = [
  'src_nathan-lambert', 'src_dean-w-ball', 'src_miles-brundage', 'src_jacob-steinhardt',
  'src_scott-aaronson', 'src_hamel-husain', 'src_nicholas-carlini', 'src_eric-jang',
];

describe('runner-compatible source replacement wave', () => {
  it('preserves all eight previously verified person records', () => {
    for (const id of restoredPeople) expect(registryIds.has(id), id).toBe(true);
    expect(registry.counts.person).toBeGreaterThanOrEqual(136);
  });

  it('disables runner-blocked feeds and replaces them with verified people feeds', () => {
    expect(byIngestionId.get('ingest_epoch')).toMatchObject({ enabled: false, disabledReason: 'github_actions_http_403' });
    expect(byIngestionId.get('ingest_chinai')).toMatchObject({ enabled: false, disabledReason: 'github_actions_http_403' });
    expect(byIngestionId.get('ingest_scott_aaronson')).toMatchObject({ enabled: true, sourceId: 'src_scott-aaronson', requiresAiClassification: true });
    expect(byIngestionId.get('ingest_jacob_steinhardt')).toMatchObject({ enabled: true, sourceId: 'src_jacob-steinhardt' });
    expect(config.sources.filter((source) => source.enabled === true)).toHaveLength(33);
  });

  it('uses Import AI first-party canonical feed instead of the blocked newsletter host', () => {
    expect(byIngestionId.get('ingest_import_ai')).toMatchObject({ enabled: true, url: 'https://jack-clark.net/feed/', healthUrl: 'https://jack-clark.net/feed/' });
    expect(registry.sources.find((source) => source.id === 'src_import-ai')?.url).toBe('https://jack-clark.net/');
  });
});
