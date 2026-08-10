ALTER TABLE source_ingestion_health RENAME TO source_ingestion_health_v1;
CREATE TABLE source_ingestion_health (
  ingestion_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'feed' CHECK (source_type IN ('feed','api')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  last_attempt_at TEXT,last_success_at TEXT,latest_item_at TEXT,
  last_status TEXT NOT NULL DEFAULT 'degraded' CHECK (last_status IN ('healthy','degraded','failed','backoff')),
  http_status INTEGER,error_count INTEGER NOT NULL DEFAULT 0,consecutive_failures INTEGER NOT NULL DEFAULT 0,
  backoff_until TEXT,items_seen INTEGER NOT NULL DEFAULT 0,items_new INTEGER NOT NULL DEFAULT 0,
  within_window INTEGER NOT NULL DEFAULT 0,deduped_existing INTEGER NOT NULL DEFAULT 0,enriched INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER,error_summary TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
INSERT INTO source_ingestion_health(ingestion_id,source_id,source_type,enabled,last_attempt_at,last_success_at,latest_item_at,last_status,http_status,error_count,consecutive_failures,backoff_until,items_seen,items_new,within_window,deduped_existing,enriched,latency_ms,error_summary,updated_at)
SELECT source_id,source_id,source_type,0,last_attempt_at,last_success_at,latest_item_at,last_status,http_status,error_count,consecutive_failures,backoff_until,items_seen,items_new,within_window,deduped_existing,enriched,latency_ms,error_summary,updated_at FROM source_ingestion_health_v1;
DROP TABLE source_ingestion_health_v1;
CREATE INDEX idx_source_health_source ON source_ingestion_health(source_id,enabled,last_status);
CREATE INDEX idx_source_health_status ON source_ingestion_health(enabled,last_status,updated_at);
CREATE INDEX idx_source_health_success ON source_ingestion_health(enabled,last_success_at);
