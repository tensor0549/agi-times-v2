import fs from 'node:fs';

const paths = ['content/registry.json', 'content/feed.json', 'content/insights.json'];
const existing = paths.filter(fs.existsSync);
if (!existing.length) {
  console.log('No content bundle present yet; platform contract validation skipped.');
  process.exit(0);
}
const read = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const errors = [];
const now = Date.now();
const futureToleranceMs = 5 * 60 * 1000;
const localized = (value) => value?.en && value?.['zh-Hans'];
for (const path of existing) {
  try {
    const data = read(path);
    if (!data || typeof data !== 'object') errors.push(`${path}: root must be an object`);
    if (!Array.isArray(data.items ?? data.sources)) errors.push(`${path}: expected items[] or sources[]`);
  } catch (error) { errors.push(`${path}: ${error.message}`); }
}
if (fs.existsSync('content/feed.json')) {
  const feedIds = new Set();
  const feedUrls = new Set();
  const canonical = (value) => { try { const url = new URL(value); url.hash = ''; ['utm_source','utm_medium','utm_campaign','utm_content','ref'].forEach((key) => url.searchParams.delete(key)); return url.href.replace(/\/$/, ''); } catch { return value; } };
  for (const item of read('content/feed.json').items ?? []) {
    const itemUrl = item.canonicalUrl ?? item.url;
    if (!item.id || !itemUrl || !/^https:\/\//.test(itemUrl)) errors.push(`feed item ${item.id ?? '?'}: specific HTTPS URL required`);
    if (feedIds.has(item.id)) errors.push(`feed item ${item.id ?? '?'}: duplicate ID`); else feedIds.add(item.id);
    const normalizedUrl = canonical(itemUrl);
    if (feedUrls.has(normalizedUrl)) errors.push(`feed item ${item.id ?? '?'}: duplicate canonical URL ${normalizedUrl}`); else feedUrls.add(normalizedUrl);
    if (!localized(item.title) || !localized(item.summary)) errors.push(`feed item ${item.id ?? '?'}: canonical en + zh-Hans title/summary required`);
    if (!item.publishedAt || Number.isNaN(Date.parse(item.publishedAt))) errors.push(`feed item ${item.id ?? '?'}: valid publishedAt required`);
    else if (Date.parse(item.publishedAt) > now + futureToleranceMs) errors.push(`feed item ${item.id ?? '?'}: publishedAt is in the future`);
  }
}
if (fs.existsSync('content/insights.json')) {
  for (const insight of read('content/insights.json').items ?? []) {
    if (!insight.publishedAt || Number.isNaN(Date.parse(insight.publishedAt)) || Date.parse(insight.publishedAt) > now + futureToleranceMs) errors.push(`insight ${insight.id ?? '?'}: publishedAt is invalid or in the future`);
    if (!localized(insight.title) || !localized(insight.body)) errors.push(`insight ${insight.id ?? '?'}: canonical en + zh-Hans title/body required`);
    if (!((insight.sources ?? insight.citations)?.length > 0)) errors.push(`insight ${insight.id ?? '?'}: at least one source required`);
    const sourceIds = new Set((insight.sources ?? insight.citations ?? []).map((source) => source.id));
    for (const source of insight.sources ?? insight.citations ?? []) if (!/^https:\/\//.test(source.url ?? '')) errors.push(`insight ${insight.id ?? '?'}: source ${source.id ?? '?'} needs an HTTPS URL`);
    for (const claim of insight.claims ?? []) {
      const ids = claim.citationIds ?? claim.sourceIds ?? [];
      if (!ids.length) errors.push(`insight ${insight.id ?? '?'}: every claim needs citationIds`);
      for (const id of ids) if (!sourceIds.has(id)) errors.push(`insight ${insight.id ?? '?'}: claim references missing citation ${id}`);
    }
  }
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`Validated ${existing.join(', ')}`);
