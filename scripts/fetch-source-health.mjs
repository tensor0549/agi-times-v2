import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const remote = process.argv.includes('--remote') ? ['--remote'] : ['--local'];
const sql = `SELECT source_id,source_type,last_attempt_at,last_success_at,latest_item_at,last_status,http_status,error_count,consecutive_failures,backoff_until,items_seen,items_new,within_window,deduped_existing,enriched,latency_ms FROM source_ingestion_health;`;
const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler', 'd1', 'execute', 'agi-times-v2', ...remote, '--command', sql, '--json'], { encoding: 'utf8' });
if (result.status !== 0) throw new Error(`Unable to read source health from D1 (wrangler exit ${result.status ?? 'unknown'})`);
const start = result.stdout.indexOf('[');
if (start < 0) throw new Error('D1 source health returned no JSON result');
const payload = JSON.parse(result.stdout.slice(start));
const rows = payload.flatMap((entry) => entry.results ?? entry.result?.results ?? []);
const root = path.resolve(import.meta.dirname, '..');
const draftDir = path.join(root, 'content/drafts');
fs.mkdirSync(draftDir, { recursive: true });
fs.writeFileSync(path.join(draftDir, 'source-health-prior.json'), `${JSON.stringify({ fetchedAt: new Date().toISOString(), sources: rows }, null, 2)}\n`, { mode: 0o600 });
console.log(`Loaded prior health for ${rows.length} ingestion sources.`);
