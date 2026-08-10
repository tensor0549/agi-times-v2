import fs from 'node:fs';import {describe,expect,it} from 'vitest';
const migration=fs.readFileSync('migrations/0006_source_health_identity.sql','utf8');
const cleanup=fs.readFileSync('migrations/0007_disable_legacy_source_health.sql','utf8');
const sync=fs.readFileSync('scripts/lib/source-health-sql.mjs','utf8');
describe('ingestion endpoint health identity',()=>{
 it('uses unique ingestion config ID while preserving registry source ID',()=>{expect(migration).toContain('ingestion_id TEXT PRIMARY KEY');expect(migration).toContain('source_id TEXT NOT NULL');expect(migration).toContain('idx_source_health_source');});
 it('retains legacy history disabled rather than claiming endpoint health',()=>{expect(migration).toContain('SELECT source_id,source_id,source_type,0,');expect(cleanup).toContain('WHERE ingestion_id = source_id');expect(cleanup).toContain('SET enabled = 0');});
 it('atomically disables the prior active set before enabling exact configured endpoint IDs',()=>{expect(sync).toContain("transaction ? 'BEGIN IMMEDIATE;\\nUPDATE source_ingestion_health SET enabled=0;\\n' : 'UPDATE source_ingestion_health SET enabled=0;\\n'");expect(sync).toContain('ON CONFLICT(ingestion_id) DO UPDATE');expect(sync).toContain('enabled=1');expect(sync).toContain("transaction ? `${sql}COMMIT;\\n` : sql");});
});
