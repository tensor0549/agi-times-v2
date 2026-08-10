import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { buildSourceHealthSql } from '../scripts/lib/source-health-sql.mjs';

const schema = `CREATE TABLE source_ingestion_health (
  ingestion_id TEXT PRIMARY KEY, source_id TEXT NOT NULL, source_type TEXT NOT NULL,
  enabled INTEGER NOT NULL, last_attempt_at TEXT, last_success_at TEXT, latest_item_at TEXT,
  last_status TEXT NOT NULL, http_status INTEGER, error_count INTEGER NOT NULL DEFAULT 0,
  consecutive_failures INTEGER NOT NULL DEFAULT 0, backoff_until TEXT, items_seen INTEGER NOT NULL DEFAULT 0,
  items_new INTEGER NOT NULL DEFAULT 0, within_window INTEGER NOT NULL DEFAULT 0,
  deduped_existing INTEGER NOT NULL DEFAULT 0, enriched INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER, error_summary TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;`;

const healthRow = (index) => ({
  ingestionId: `ingest_endpoint_${index}`,
  sourceId: `src_endpoint-${index}`,
  sourceType: index < 31 ? 'feed' : 'api',
  status: 'healthy',
  lastAttemptAt: '2026-08-10T20:00:00Z',
  lastSuccessAt: '2026-08-10T19:59:59Z',
  latestItemAt: '2026-08-10T19:00:00Z',
  httpStatus: 200,
  itemsSeen: 1,
  itemsNew: 1,
  withinWindow: 1,
  dedupedExisting: 0,
  enriched: 0,
  latencyMs: 25,
});

describe('atomic source-health activation', () => {
  it('disables legacy/non-configured rows and enables exactly the 33 current endpoint IDs', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(schema);
    db.exec("INSERT INTO source_ingestion_health(ingestion_id,source_id,source_type,enabled,last_status) VALUES ('src_hugging-face','src_hugging-face','feed',1,'healthy'),('ingest_retired','src_retired','feed',1,'healthy');");
    const current = Array.from({ length: 33 }, (_, index) => healthRow(index));

    db.exec(buildSourceHealthSql({ sources: current }));

    const enabled = db.prepare('SELECT ingestion_id FROM source_ingestion_health WHERE enabled=1 ORDER BY ingestion_id').all();
    expect(enabled.map((row) => row.ingestion_id)).toEqual(current.map((row) => row.ingestionId).sort());
    expect(db.prepare("SELECT enabled FROM source_ingestion_health WHERE ingestion_id='src_hugging-face'").get()).toEqual({ enabled: 0 });
    expect(db.prepare("SELECT enabled FROM source_ingestion_health WHERE ingestion_id='ingest_retired'").get()).toEqual({ enabled: 0 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM source_ingestion_health WHERE enabled=1').get()).toEqual({ count: 33 });
    db.close();
  });
});
