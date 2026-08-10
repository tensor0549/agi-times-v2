-- Legacy rows used source_id as a pseudo endpoint identity. Retain their history,
-- but never count them as current endpoint-level health after the identity migration.
UPDATE source_ingestion_health
SET enabled = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE ingestion_id = source_id;
