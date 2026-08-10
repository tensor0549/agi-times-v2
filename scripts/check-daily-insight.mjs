import fs from 'node:fs';
const path = 'content/insights.json';
if (!fs.existsSync(path)) throw new Error('content/insights.json is required for the daily insight gate');
const data = JSON.parse(fs.readFileSync(path, 'utf8'));
const cutoff = Date.now() - 26 * 60 * 60 * 1000;
const current = (data.items ?? []).filter((item) => Date.parse(item.publishedAt) >= cutoff && (item.citations?.length || item.sources?.length) && item.title?.en && item.title?.['zh-Hans'] && item.body?.en && item.body?.['zh-Hans']);
if (!current.length) throw new Error('No sourced bilingual Insight published within the last 26 hours');
console.log(`Daily insight gate passed with ${current.length} current insight(s)`);
