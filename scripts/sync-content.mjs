import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const required = ['content/registry.json', 'content/feed.json', 'content/insights.json'];
if (required.some((file) => !fs.existsSync(file))) {
  console.log('Complete content bundle is not present; nothing to sync.');
  process.exit(0);
}
const registry = JSON.parse(fs.readFileSync(required[0], 'utf8'));
const feed = JSON.parse(fs.readFileSync(required[1], 'utf8'));
const insights = JSON.parse(fs.readFileSync(required[2], 'utf8'));
const q = (value) => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const j = (value) => q(JSON.stringify(value ?? null));
const locale = (value, code) => { const key = code === 'zh' ? 'zh-Hans' : code; if (!value?.[key]) throw new Error(`Missing canonical locale ${key}`); return value[key]; };
const sourceType = (source) => { const kind = source.kind ?? source.type; return kind === 'org' ? 'organization' : kind === 'project' ? (source.platform === 'huggingface' ? 'huggingface' : 'github') : kind; };
const isRemote = process.argv.includes('--remote');
// Wrangler's remote bulk execution is atomic and rejects explicit SQL transactions.
let sql = `PRAGMA foreign_keys=ON;\n${isRemote ? '' : 'BEGIN TRANSACTION;\n'}`;
for (const source of registry.sources ?? []) sql += `INSERT INTO sources(id,kind,name,homepage_url,language,metadata_json,active,updated_at) VALUES(${q(source.id)},${q(sourceType(source))},${q(source.name)},${q(source.url)},${q((source.languages??[]).join(','))},${j({platform:source.platform,topics:source.topics,priority:source.priority})},${source.active===false?0:1},CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,name=excluded.name,homepage_url=excluded.homepage_url,language=excluded.language,metadata_json=excluded.metadata_json,active=excluded.active,updated_at=CURRENT_TIMESTAMP;\n`;
for (const item of feed.items ?? []) sql += `INSERT INTO content_items(id,source_id,kind,canonical_url,title_en,title_zh,summary_en,summary_zh,original_language,published_at,discovered_at,topics_json,entities_json,metrics_json,score,featured,status) VALUES(${q(item.id)},${q(item.sourceId)},${q(item.type)},${q(item.canonicalUrl ?? item.url)},${q(locale(item.title,'en'))},${q(locale(item.title,'zh'))},${q(locale(item.summary,'en'))},${q(locale(item.summary,'zh'))},${q(item.originalLanguage ?? item.languageOriginal ?? item.language)},${q(item.publishedAt)},${q(item.discoveredAt ?? item.publishedAt)},${j(item.topics??[])},${j(item.entities??[])},${j({verification:item.verification,citations:item.citations,sourceReliability:item.sourceReliability,freshnessScore:item.freshnessScore})},${Number(item.importanceScore ?? item.importance)||0},${item.featured?1:0},'published') ON CONFLICT(id) DO UPDATE SET source_id=excluded.source_id,kind=excluded.kind,canonical_url=excluded.canonical_url,title_en=excluded.title_en,title_zh=excluded.title_zh,summary_en=excluded.summary_en,summary_zh=excluded.summary_zh,original_language=excluded.original_language,published_at=excluded.published_at,discovered_at=excluded.discovered_at,topics_json=excluded.topics_json,entities_json=excluded.entities_json,metrics_json=excluded.metrics_json,score=excluded.score,featured=excluded.featured,updated_at=CURRENT_TIMESTAMP;\n`;
for (const item of insights.items ?? []) sql += `INSERT INTO insights(id,slug,title_en,title_zh,dek_en,dek_zh,body_en,body_zh,topics_json,claims_json,sources_json,published_at,updated_at,status) VALUES(${q(item.id)},${q(item.slug)},${q(locale(item.title,'en'))},${q(locale(item.title,'zh'))},${q(locale(item.dek,'en'))},${q(locale(item.dek,'zh'))},${q(typeof locale(item.body,'en')==='string'?locale(item.body,'en'):JSON.stringify(locale(item.body,'en')))},${q(typeof locale(item.body,'zh')==='string'?locale(item.body,'zh'):JSON.stringify(locale(item.body,'zh')))},${j(item.topics??[])},${j(item.claims??[])},${j(item.sources ?? item.citations ?? [])},${q(item.publishedAt)},${q(item.updatedAt??item.publishedAt)},'published') ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,title_en=excluded.title_en,title_zh=excluded.title_zh,dek_en=excluded.dek_en,dek_zh=excluded.dek_zh,body_en=excluded.body_en,body_zh=excluded.body_zh,topics_json=excluded.topics_json,claims_json=excluded.claims_json,sources_json=excluded.sources_json,published_at=excluded.published_at,updated_at=excluded.updated_at,status='published';\n`;
sql += `INSERT INTO ingestion_runs(id,status,items_seen,items_written,started_at,finished_at) VALUES(${q(crypto.randomUUID())},'succeeded',${(feed.items??[]).length},${(feed.items??[]).length},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);\n${isRemote ? '' : 'COMMIT;\n'}`;
const tmp = path.join(os.tmpdir(), `agi-times-content-${process.pid}.sql`);
fs.writeFileSync(tmp, sql, { mode: 0o600 });
const remote = isRemote ? ['--remote'] : ['--local'];
try {
  const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler','d1','execute','agi-times-v2',...remote,'--file',tmp], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(`Synced ${(registry.sources??[]).length} sources, ${(feed.items??[]).length} feed items, ${(insights.items??[]).length} insights.`);
} finally { fs.rmSync(tmp, { force: true }); }
