import fs from 'node:fs';

const paths = ['content/registry.json', 'content/feed.json', 'content/insights.json'];
const existing = paths.filter(fs.existsSync);
if (!existing.length) {
  console.log('No content bundle present yet; platform contract validation skipped.');
  process.exit(0);
}
const read = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const errors = [];
for (const path of existing) {
  try {
    const data = read(path);
    if (!data || typeof data !== 'object') errors.push(`${path}: root must be an object`);
    if (!Array.isArray(data.items ?? data.sources)) errors.push(`${path}: expected items[] or sources[]`);
  } catch (error) { errors.push(`${path}: ${error.message}`); }
}
if (fs.existsSync('content/feed.json')) {
  for (const item of read('content/feed.json').items ?? []) {
    if (!item.id || !item.url || !/^https:\/\//.test(item.url)) errors.push(`feed item ${item.id ?? '?'}: specific HTTPS URL required`);
    if (!item.title?.en || !item.title?.zh || !item.summary?.en || !item.summary?.zh) errors.push(`feed item ${item.id ?? '?'}: bilingual title/summary required`);
    if (!item.publishedAt || Number.isNaN(Date.parse(item.publishedAt))) errors.push(`feed item ${item.id ?? '?'}: valid publishedAt required`);
  }
}
if (fs.existsSync('content/insights.json')) {
  for (const insight of read('content/insights.json').items ?? []) {
    if (!insight.title?.en || !insight.title?.zh || !insight.body?.en || !insight.body?.zh) errors.push(`insight ${insight.id ?? '?'}: bilingual title/body required`);
    if (!(insight.sources?.length > 0)) errors.push(`insight ${insight.id ?? '?'}: at least one source required`);
    for (const claim of insight.claims ?? []) if (!(claim.sourceIds?.length > 0)) errors.push(`insight ${insight.id ?? '?'}: every claim needs sourceIds`);
  }
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`Validated ${existing.join(', ')}`);
