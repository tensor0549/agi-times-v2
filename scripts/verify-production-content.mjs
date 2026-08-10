import fs from 'node:fs';

const mode = process.argv.includes('--static') ? 'static' : 'all';
const origin = process.env.PRODUCTION_ORIGIN ?? 'https://agitime.ai';
const feed = JSON.parse(fs.readFileSync('content/feed.json', 'utf8'));
const insights = JSON.parse(fs.readFileSync('content/insights.json', 'utf8'));
const expectedFeedId = feed.items?.[0]?.id;
const expectedInsightId = insights.items?.[0]?.id;
if (!expectedFeedId || !expectedInsightId) throw new Error('Expected content bundle is empty');

const get = async (url) => {
  const response = await fetch(url, { headers: { 'cache-control': 'no-cache', 'user-agent': 'AGI-Times-Publisher-Consistency/1.0' }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response;
};
const retry = async (label, check) => {
  let last;
  for (let attempt = 1; attempt <= 12; attempt++) {
    try { await check(); console.log(`${label} passed on attempt ${attempt}`); return; }
    catch (error) { last = error; if (attempt < 12) await new Promise((resolve) => setTimeout(resolve, 10_000)); }
  }
  throw last;
};

await retry('deployed static bundle consistency', async () => {
  const html = await (await get(`${origin}/?publisher_check=${Date.now()}`)).text();
  const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map((match) => new URL(match[1], origin).href);
  if (!scripts.length) throw new Error('No deployed JavaScript bundle found');
  const javascript = (await Promise.all(scripts.map(async (url) => (await get(`${url}${url.includes('?') ? '&' : '?'}publisher_check=${Date.now()}`)).text()))).join('\n');
  if (!javascript.includes(expectedFeedId)) throw new Error(`Deployed UI bundle is missing feed ID ${expectedFeedId}`);
  if (!javascript.includes(expectedInsightId)) throw new Error(`Deployed UI bundle is missing Insight ID ${expectedInsightId}`);
});

if (mode === 'all') await retry('API and UI content consistency', async () => {
  const apiFeed = await (await get(`${origin}/api/v1/feed?limit=100&publisher_check=${Date.now()}`)).json();
  const apiInsights = await (await get(`${origin}/api/v1/insights?limit=50&publisher_check=${Date.now()}`)).json();
  if (!(apiFeed.items ?? []).some((item) => item.id === expectedFeedId)) throw new Error(`API feed is missing deployed ID ${expectedFeedId}`);
  if (!(apiInsights.items ?? []).some((item) => item.id === expectedInsightId)) throw new Error(`API Insights are missing deployed ID ${expectedInsightId}`);
});
