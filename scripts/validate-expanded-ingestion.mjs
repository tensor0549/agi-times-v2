import fs from 'node:fs';
import { auditIngestionRun } from './lib/ingestion-acceptance.mjs';

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const result = auditIngestionRun({
  config: readJson('data/ingestion-sources.json'),
  registry: readJson('content/registry.json'),
  ingested: readJson('content/drafts/ingested.json'),
  health: readJson('content/drafts/source-health.json'),
});

if (!result.ok) {
  console.error(`Expanded ingestion acceptance failed (${result.errors.length} issues):`);
  for (const error of result.errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(JSON.stringify(result.summary));
