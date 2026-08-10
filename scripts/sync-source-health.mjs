import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { buildSourceHealthSql } from './lib/source-health-sql.mjs';

const root = path.resolve(import.meta.dirname, '..');
const file = path.join(root, 'content/drafts/source-health.json');
if (!fs.existsSync(file)) throw new Error('Missing source-health draft');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const isRemote = process.argv.includes('--remote');
const sql = buildSourceHealthSql(data, { transaction: !isRemote });
const temp = path.join(os.tmpdir(), `agi-source-health-${process.pid}.sql`);
fs.writeFileSync(temp, sql, { mode: 0o600 });
const remote = isRemote ? ['--remote'] : ['--local'];
try {
  const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler', 'd1', 'execute', 'agi-times-v2', ...remote, '--file', temp], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(`Atomically synced health for ${(data.sources ?? []).length} sources.`);
} finally { fs.rmSync(temp, { force: true }); }
