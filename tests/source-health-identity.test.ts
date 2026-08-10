import fs from 'node:fs';import {describe,expect,it} from 'vitest';
const sql=fs.readFileSync('migrations/0006_source_health_identity.sql','utf8');
describe('ingestion endpoint health identity',()=>{
 it('uses unique ingestion config ID while preserving registry source ID',()=>{expect(sql).toContain('ingestion_id TEXT PRIMARY KEY');expect(sql).toContain('source_id TEXT NOT NULL');expect(sql).toContain('idx_source_health_source');});
 it('migrates legacy rows without data loss',()=>{expect(sql).toContain('SELECT source_id,source_id,source_type');expect(sql).toContain('source_ingestion_health_v1');});
});
