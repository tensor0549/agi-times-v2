import fs from 'node:fs';
import path from 'node:path';
import { buildExpandedRunSummary } from './lib/expanded-run-summary.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, 'content/drafts', name), 'utf8'));
const summary = buildExpandedRunSummary({
  config: JSON.parse(fs.readFileSync(path.join(root, 'data/ingestion-sources.json'), 'utf8')),
  ingested: read('ingested.json'),
  health: read('source-health.json'),
});
const file = path.join(root, 'content/drafts/expanded-run-summary.json');
fs.writeFileSync(file, `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify(summary));
