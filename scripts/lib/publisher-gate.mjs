const DAY_MS = 86_400_000;

const stable = (value) => JSON.stringify(value);
const editorialView = (insight) => ({
  title: insight.title,
  dek: insight.dek,
  body: insight.body,
  topics: insight.topics,
  claims: insight.claims,
  sources: insight.sources,
});
const markers = (body) => new Set([...String(body ?? '').matchAll(/\[\^([^\]]+)\]/g)].map((match) => match[1]));
const numbers = (text) => [...String(text ?? '').matchAll(/\b\d[\d,.]*(?:%|\b)/g)].map((match) => match[0].replaceAll(',', ''));

export function verifyIncrementalUpdate({ baseFeed, feed, baseInsights, insights, now = Date.now(), requireInsight = false }) {
  const errors = [];
  const oldFeed = new Map((baseFeed?.items ?? []).map((item) => [item.id, item]));
  const nextFeed = new Map((feed?.items ?? []).map((item) => [item.id, item]));
  const newFeed = (feed?.items ?? []).filter((item) => !oldFeed.has(item.id));
  const allIds = new Set();
  const allUrls = new Set();
  const normalizeUrl = (value) => { const url = new URL(value); for (const key of [...url.searchParams.keys()]) if (key.startsWith('utm_') || key === 'ref') url.searchParams.delete(key); url.hash = ''; return url.href.replace(/\/$/, ''); };
  for (const item of feed?.items ?? []) {
    if (allIds.has(item.id)) errors.push(`${item.id}: duplicate feed ID`); else allIds.add(item.id);
    let url; try { url = normalizeUrl(item.canonicalUrl ?? item.url); } catch { errors.push(`${item.id}: invalid canonical URL`); continue; }
    if (allUrls.has(url)) errors.push(`${item.id}: duplicate canonical URL ${url}`); else allUrls.add(url);
  }

  const topSourceCounts = new Map();
  for (const item of (feed?.items ?? []).slice(0, 10)) {
    const key = item.sourceId ?? item.source?.id ?? 'unknown';
    topSourceCounts.set(key, (topSourceCounts.get(key) ?? 0) + 1);
  }
  for (const [sourceId, count] of topSourceCounts) if (count > 2) errors.push(`top 10 contains ${count} items from ${sourceId}; maximum is 2`);

  if (newFeed.length < 1) errors.push('incremental publication requires at least 1 new feed item');
  for (const [id, previous] of oldFeed) {
    const current = nextFeed.get(id);
    if (!current) continue; // Retention may remove the oldest records.
    const comparablePrevious = { ...previous };
    if (previous.featured === true && (!previous.featuredUntil || Date.parse(previous.featuredUntil) <= now || Date.parse(previous.featuredUntil) > Date.parse(previous.publishedAt) + DAY_MS)) comparablePrevious.featured = false;
    if (stable(comparablePrevious) !== stable(current)) errors.push(`${id}: existing feed item was mutated`);
  }

  const oldUrls = new Set((baseFeed?.items ?? []).map((item) => item.canonicalUrl ?? item.url));
  for (const item of newFeed) {
    const url = item.canonicalUrl ?? item.url;
    const published = Date.parse(item.publishedAt);
    const discovered = Date.parse(item.discoveredAt);
    if (oldUrls.has(url)) errors.push(`${item.id}: URL already existed in the base feed`);
    if (!Number.isFinite(published) || published > now + 300_000 || published < now - 14 * DAY_MS) errors.push(`${item.id}: source date is stale, future, or invalid`);
    if (!Number.isFinite(discovered) || discovered > now + 300_000) errors.push(`${item.id}: discovery date is future or invalid`);
    if (item.updatedAt !== item.publishedAt) errors.push(`${item.id}: updatedAt must preserve the source timestamp`);
    if (item.citations?.length !== 1 || item.citations[0].url !== url || !item.citations[0].evidenceSnippet) errors.push(`${item.id}: one exact item-level evidence citation is required`);
    if (item.type === 'paper' && (Number(item.importanceScore) < 70 || Number(item.agiRelevanceScore) < 70)) errors.push(`${item.id}: academic items require importanceScore and agiRelevanceScore >= 70`);
  }

  const oldInsights = new Map((baseInsights?.items ?? []).map((item) => [item.id, item]));
  const changedInsights = [];
  for (const insight of insights?.items ?? []) {
    const previous = oldInsights.get(insight.id);
    if (!previous) changedInsights.push(insight);
    else if (stable(editorialView(previous)) !== stable(editorialView(insight))) {
      changedInsights.push(insight);
      if (insight.publishedAt !== previous.publishedAt) errors.push(`${insight.id}: an existing Insight changed publishedAt`);
      if (!(Date.parse(insight.updatedAt) > Date.parse(previous.updatedAt))) errors.push(`${insight.id}: editorial changes require a later updatedAt`);
    } else if (insight.publishedAt !== previous.publishedAt || insight.updatedAt !== previous.updatedAt) {
      errors.push(`${insight.id}: timestamps changed without an editorial change`);
    }
  }
  if (requireInsight && !changedInsights.length) errors.push('daily publication requires a new or materially updated Insight');

  for (const insight of changedInsights) {
    const published = Date.parse(insight.publishedAt);
    if (!Number.isFinite(published) || published > now + 300_000 || published < now - 26 * 60 * 60 * 1000) errors.push(`${insight.id}: daily Insight date is stale, future, or invalid`);
    const sourceMap = new Map((insight.sources ?? []).map((source) => [source.id, source]));
    const enMarkers = markers(insight.body?.en);
    const zhMarkers = markers(insight.body?.['zh-Hans']);
    for (const marker of new Set([...enMarkers, ...zhMarkers])) if (!sourceMap.has(marker)) errors.push(`${insight.id}: body uses unresolved citation marker ${marker}`);
    for (const source of sourceMap.values()) {
      const feedItem = nextFeed.get(source.feedItemId);
      if (!feedItem) errors.push(`${insight.id}/${source.id}: citation must resolve to a published feed item`);
      else if ((feedItem.canonicalUrl ?? feedItem.url) !== source.url) errors.push(`${insight.id}/${source.id}: feed item and citation URL differ`);
      if (!source.evidenceSnippet) errors.push(`${insight.id}/${source.id}: evidence snippet is required`);
    }
    for (const claim of insight.claims ?? []) {
      if (!claim.citationIds?.length) errors.push(`${insight.id}/${claim.id}: unsupported claim`);
      for (const citationId of claim.citationIds ?? []) {
        if (!sourceMap.has(citationId)) errors.push(`${insight.id}/${claim.id}: unresolved citation ${citationId}`);
        if (!enMarkers.has(citationId) || !zhMarkers.has(citationId)) errors.push(`${insight.id}/${claim.id}: both bodies must display citation ${citationId}`);
      }
      if (claim.type === 'fact') {
        const evidence = (claim.citationIds ?? []).map((id) => sourceMap.get(id)?.evidenceSnippet ?? '').join(' ').replaceAll(',', '');
        for (const number of new Set([...numbers(claim.text?.en), ...numbers(claim.text?.['zh-Hans'])])) {
          if (!evidence.includes(number)) errors.push(`${insight.id}/${claim.id}: numeric claim ${number} is absent from cited evidence`);
        }
      }
    }
  }

  if (errors.length) throw new Error(errors.join('\n'));
  return {
    newFeed,
    changedInsights,
    reviewPayload: {
      feedItems: newFeed.map((item) => ({ id: item.id, title: item.title, summary: item.summary, evidence: item.citations[0].evidenceSnippet, url: item.url })),
      insights: changedInsights.map((item) => ({ id: item.id, title: item.title, dek: item.dek, body: item.body, claims: item.claims, sources: item.sources })),
    },
  };
}
