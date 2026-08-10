import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { safeFetchHtml, safeFetchText, safeFetchXml } from './lib/safe-http.mjs';
import { compareByRecency } from './lib/content-recency.mjs';

const root = path.resolve(import.meta.dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'data/ingestion-sources.json'), 'utf8'));
const registry = JSON.parse(fs.readFileSync(path.join(root, 'content/registry.json'), 'utf8'));
const registryById = new Map(registry.sources.map((source) => [source.id, source]));
const sources = config.sources.filter((source) => source.enabled !== false);
const defaults = config.defaults ?? {};
const now = Date.now();
const windowDays = Number(defaults.windowDays) || 14;
const cutoff = now - windowDays * 86_400_000;
const feedPath = path.join(root, 'content/feed.json');
const existing = fs.existsSync(feedPath) ? new Set(JSON.parse(fs.readFileSync(feedPath, 'utf8')).items.map((item) => item.canonicalUrl ?? item.url)) : new Set();
const candidates = [];
const failures = [];
const health = [];
const priorHealthPath = path.join(root, 'content/drafts/source-health-prior.json');
const priorHealth = fs.existsSync(priorHealthPath) ? new Map(JSON.parse(fs.readFileSync(priorHealthPath, 'utf8')).sources.map((row) => [row.ingestion_id ?? row.ingestionId ?? row.source_id, row])) : new Map();
const errorCode = (error) => { const text=String(error?.message??error).toLowerCase(); if(text.includes('timeout')||text.includes('deadline'))return 'timeout'; if(text.includes('http'))return 'http_status'; if(text.includes('0 rss')||text.includes('parse'))return 'parse_failed'; if(text.includes('allowlist')||text.includes('hostname')||text.includes('globally routable'))return 'host_rejected'; if(text.includes('rate'))return 'rate_limited'; return 'fetch_failed'; };

const clean = (value) => String(value ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const valueOf = (block, names) => {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
    if (match) return clean(match[1]);
  }
  return '';
};
const canonical = (value) => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    if (url.protocol === 'http:') url.protocol = 'https:';
    for (const key of [...url.searchParams.keys()]) if (key.startsWith('utm_') || ['ref', 'source', 'campaign'].includes(key)) url.searchParams.delete(key);
    url.hash = '';
    return url.href;
  } catch { return ''; }
};
const meta = (html, key) => {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return clean(html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)`, 'i'))?.[1] ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["']`, 'i'))?.[1]);
};
const extractEvidence = (html) => {
  let description = meta(html, 'description') || meta(html, 'og:description') || meta(html, 'twitter:description');
  if (/^(?:we.re on a journey|a blog post by)\b/i.test(description)) description = '';
  if (!description) {
    for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const data = JSON.parse(match[1]);
        const records = Array.isArray(data) ? data : data?.['@graph'] ?? [data];
        description = clean(records.find((record) => record?.description)?.description);
        if (description) break;
      } catch { /* malformed publisher JSON-LD */ }
    }
  }
  if (!description) {
    const heading = html.search(/<h1\b/i);
    const articleHtml = heading >= 0 ? html.slice(heading) : html;
    description = [...articleHtml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((match) => clean(match[1])).filter((text) => text.length >= 30 && !/^(?:we.re on a journey|subscribe|sign up|discuss and provide feedback|run an?\b|extract text|share your)/i.test(text)).slice(0, 3).join(' ');
  }
  return description.slice(0, 1_200);
};
const sourceInfo = (source) => {
  const registrySource = registryById.get(source.sourceId);
  return { publisher: registrySource?.name ?? source.sourceId, reliability: Number(registrySource?.priority ?? source.priority ?? 0.75), homepage: registrySource?.url };
};
const isCurrent = (timestamp) => Number.isFinite(timestamp) && timestamp >= cutoff && timestamp <= now + 300_000;
const aiKeyword = /\b(?:artificial intelligence|machine learning|deep learning|generative ai|foundation model|large language model|llm|multimodal|neural|agentic|ai agents?|robotics?|semiconductor|gpu|inference|alignment|model safety)\b/i;
const prefilterBroad = (source, title, evidence) => !source.requiresAiClassification || aiKeyword.test(`${title} ${evidence}`);
const candidateId = (url) => `candidate_${crypto.createHash('sha256').update(url).digest('hex').slice(0, 24)}`;
const sourceAllowedHosts = (source, itemUrl) => {
  const hosts = new Set([new URL(source.url).hostname]);
  const homepage = sourceInfo(source).homepage;
  if (homepage) try { hosts.add(new URL(homepage).hostname); } catch { /* invalid registry URL is caught elsewhere */ }
  const itemHost = new URL(itemUrl).hostname;
  return hosts.has(itemHost) ? [...hosts] : [];
};
const enrichEvidence = async (source, url) => {
  const allowedHosts = sourceAllowedHosts(source, url);
  if (!allowedHosts.length) throw new Error(`item host is outside configured source hosts: ${new URL(url).hostname}`);
  const { html } = await safeFetchHtml(url, { maxBytes: 500_000, timeoutMs: Number(source.timeoutMs ?? defaults.timeoutMs) || 20_000, maxRedirects: 4, allowedHosts });
  return extractEvidence(html);
};
const addCandidate = (source, record) => {
  const info = sourceInfo(source);
  candidates.push({
    id: candidateId(record.url), ingestionId: source.id, sourceId: source.sourceId, publisher: info.publisher, author: record.author || info.publisher,
    independenceKey: source.academic ? `academic:${String(record.author || info.publisher).toLowerCase()}` : `publisher:${info.publisher.toLowerCase()}`,
    url: record.url, title: record.title, publishedAt: new Date(record.timestamp).toISOString(), activityAt: record.activityAt ? new Date(record.activityAt).toISOString() : null, evidenceSnippet: record.evidenceSnippet.slice(0, 1_200),
    sourceReliability: info.reliability, sourcePriority: Number(source.priority) || 0.5, originalLanguage: source.language ?? 'en', scope: source.scope,
    requiresAiClassification: Boolean(source.requiresAiClassification), sourceKind: source.kind,
    metrics: record.metrics ?? {},
  });
};

async function ingestFeed(source, stats) {
  const response = await safeFetchXml(source.url, { maxBytes: Number(source.maxBytes ?? 2_000_000), timeoutMs: Number(source.timeoutMs ?? defaults.timeoutMs) || 20_000, maxRedirects: 3, allowedHosts: sourceAllowedHosts(source, source.url) });
  stats.httpStatus = response.status;
  const xml = response.html;
  const blocks = [...(xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? []), ...(xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [])].slice(0, Number(source.maxItems ?? defaults.maxItems) || 40);
  stats.itemsSeen = blocks.length;
  if (!blocks.length) throw new Error('parsed 0 RSS/Atom entries');
  for (const block of blocks) {
    const title = valueOf(block, ['title']);
    let url = valueOf(block, ['link', 'guid']);
    if (!url) url = block.match(/<link[^>]+href=["']([^"']+)/i)?.[1] ?? '';
    url = canonical(url);
    const timestamp = Date.parse(valueOf(block, ['pubDate', 'published', 'updated', 'dc:date']));
    if (!title || !url || !Number.isFinite(timestamp) || timestamp > now + 300_000) continue;
    stats.latestItemAt = !stats.latestItemAt || timestamp > Date.parse(stats.latestItemAt) ? new Date(timestamp).toISOString() : stats.latestItemAt;
    if (!isCurrent(timestamp)) continue;
    stats.withinWindow += 1;
    if (existing.has(url)) { stats.dedupedExisting += 1; continue; }
    let evidenceSnippet = valueOf(block, ['description', 'summary', 'content:encoded']);
    if (evidenceSnippet.length < 40 && source.enrichMissingDescription) {
      try { evidenceSnippet = await enrichEvidence(source, url); if (evidenceSnippet.length >= 40) stats.enriched += 1; }
      catch (error) { failures.push({ ingestionId: source.id, failureCode: errorCode(error), stage: 'enrichment' }); }
    }
    if (evidenceSnippet.length < 40 || !prefilterBroad(source, title, evidenceSnippet)) continue;
    addCandidate(source, { url, title, timestamp, evidenceSnippet, author: valueOf(block, ['dc:creator', 'creator', 'author']) });
    stats.itemsNew += 1;
  }
}

const safeJson = async (url, options) => {
  const target = new URL(url);
  const response = await safeFetchText(url, { ...options, allowedHosts: [target.hostname], allowedContentTypes: ['application/json'] });
  return { data: JSON.parse(response.html), status: response.status, headers: response.headers }; 
};
async function ingestGithub(source, stats) {
  const token = process.env[source.authEnv ?? 'GITHUB_TOKEN'];
  if (!token) throw new Error(`${source.authEnv ?? 'GITHUB_TOKEN'} required for GitHub ingestion`);
  const windowStart = new Date(cutoff).toISOString().slice(0, 10);
  const seen = new Set();
  for (const query of source.queries ?? []) {
    const url = new URL(source.url);
    for (const [key, value] of Object.entries(query)) if (key !== 'id') url.searchParams.set(key, String(value).replaceAll('{windowStart}', windowStart));
    const response = await safeJson(url.href, { maxBytes: 2_000_000, timeoutMs: defaults.timeoutMs, headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' } });
    stats.httpStatus = response.status;
    stats.rateRemaining = Number(response.headers.get(source.rateLimitHeader ?? 'x-ratelimit-remaining'));
    const retryAfter = Number(response.headers.get('retry-after'));
    const rateReset = Number(response.headers.get('x-ratelimit-reset'));
    if (Number.isFinite(retryAfter) && retryAfter > 0) stats.backoffUntil = new Date(Date.now() + retryAfter * 1000).toISOString();
    else if (stats.rateRemaining === 0 && Number.isFinite(rateReset)) stats.backoffUntil = new Date(rateReset * 1000).toISOString();
    for (const repo of response.data.items ?? []) {
      stats.itemsSeen += 1;

      if (seen.has(repo.id) || repo.fork || repo.archived || repo.disabled || Number(repo.stargazers_count) < Number(source.eligibility?.minimumStars ?? 25)) continue;
      seen.add(repo.id);
      if (query.id === 'new-rising' && source.eligibility?.requireLicenseForNewRising && !repo.license?.spdx_id) continue;
      const activityAt = Date.parse(repo.pushed_at);
      const timestamp = Date.parse(repo.created_at);
      if (!isCurrent(activityAt) || !Number.isFinite(timestamp) || timestamp > now + 300_000) continue;
      const text = `${repo.name} ${repo.description ?? ''} ${(repo.topics ?? []).join(' ')}`;
      if (!aiKeyword.test(text)) continue;
      const urlValue = canonical(repo.html_url);
      if (!urlValue || existing.has(urlValue)) continue;
      addCandidate(source, { url: urlValue, title: repo.full_name, timestamp, activityAt, evidenceSnippet: `${repo.description ?? 'AI repository'}. GitHub reports ${repo.stargazers_count} stars, ${repo.forks_count} forks, latest push ${repo.pushed_at}, license ${repo.license?.spdx_id ?? 'not specified'}.`, author: repo.owner?.login, metrics: { stars: repo.stargazers_count, forks: repo.forks_count, pushedAt: repo.pushed_at, createdAt: repo.created_at, query: query.id } });
      stats.withinWindow += 1; stats.itemsNew += 1; stats.latestItemAt = new Date(activityAt).toISOString();
    }
  }
  if (stats.backoffUntil && Date.parse(stats.backoffUntil) > Date.now()) stats.status = 'backoff';
}
async function ingestHuggingFace(source, stats) {
  const listUrl = new URL(source.url);
  for (const [key, value] of Object.entries(source.query ?? {})) listUrl.searchParams.set(key, String(value));
  const listResponse = await safeJson(listUrl.href, { maxBytes: 3_000_000, timeoutMs: defaults.timeoutMs });
  stats.httpStatus = listResponse.status;
  const baseModels = new Set();
  for (const summary of listResponse.data.slice(0, 20)) {
    stats.itemsSeen += 1;
    const id = summary.id;
    if (!id || summary.private || Number(summary.likes) < Number(source.eligibility?.minimumLikes ?? 20) || (source.eligibility?.requirePipelineTag && !summary.pipeline_tag)) continue;
    const detailUrl = source.detailUrlTemplate.replace('{modelId}', id.split('/').map(encodeURIComponent).join('/'));
    const detailResponse = await safeJson(detailUrl, { maxBytes: 1_000_000, timeoutMs: defaults.timeoutMs });
    const detail = detailResponse.data;
    const tags = detail.tags ?? []; 
    const baseModel = tags.find((tag) => tag.startsWith('base_model:'))?.slice('base_model:'.length);
    if (baseModel && baseModels.has(baseModel)) continue;
    if (baseModel) baseModels.add(baseModel);
    const timestamp = Date.parse(detail.createdAt);
    const activityAt = Date.parse(detail.lastModified ?? detail.createdAt);
    if (!Number.isFinite(timestamp) || timestamp > now + 300_000 || !isCurrent(activityAt)) continue;
    const text = `${id} ${detail.cardData?.model_name ?? ''} ${detail.pipeline_tag ?? ''} ${tags.join(' ')}`;
    if (!aiKeyword.test(text)) continue;
    const urlValue = canonical(`https://huggingface.co/${id}`);
    if (existing.has(urlValue)) continue;
    addCandidate(source, { url: urlValue, title: id, timestamp, activityAt, evidenceSnippet: `Hugging Face reports model ${id}, pipeline ${detail.pipeline_tag}, ${detail.likes ?? 0} likes, ${detail.downloads ?? 0} downloads, trending score ${summary.trendingScore ?? 0}, last modified ${detail.lastModified ?? detail.createdAt}.`, author: id.split('/')[0], metrics: { likes: detail.likes, downloads: detail.downloads, trendingScore: summary.trendingScore, pipelineTag: detail.pipeline_tag, lastModified: detail.lastModified, createdAt: detail.createdAt, baseModel } });
    stats.withinWindow += 1; stats.itemsNew += 1; stats.latestItemAt = new Date(activityAt).toISOString();
  }
}

for (const source of sources) {
  const started = Date.now();
  const stats = { ingestionId: source.id, sourceId: source.sourceId, sourceType: source.kind.includes('api') ? 'api' : 'feed', status: 'healthy', lastAttemptAt: new Date().toISOString(), lastSuccessAt: null, latestItemAt: null, itemsSeen: 0, itemsNew: 0, withinWindow: 0, dedupedExisting: 0, enriched: 0, latencyMs: 0, httpStatus: null, rateRemaining: null, backoffUntil: null, nextRetryAt: null, consecutiveFailures: 0, failureCode: null };
  const prior = priorHealth.get(source.id);
  if (prior?.backoff_until && Date.parse(prior.backoff_until) > Date.now()) {
    stats.status = 'backoff'; stats.backoffUntil = prior.backoff_until; stats.nextRetryAt = prior.backoff_until; stats.consecutiveFailures = Number(prior.consecutive_failures) || 0; stats.lastSuccessAt = prior.last_success_at; stats.latestItemAt = prior.latest_item_at; stats.latencyMs = Date.now() - started; health.push(stats); continue;
  }
  try {
    if (['rss', 'atom'].includes(source.kind)) await ingestFeed(source, stats);
    else if (source.kind === 'github_search_api') await ingestGithub(source, stats);
    else if (source.kind === 'huggingface_models_api') await ingestHuggingFace(source, stats);
    else throw new Error(`unsupported ingestion kind ${source.kind}`);
    stats.lastSuccessAt = new Date().toISOString();
    if (stats.status === 'backoff') {
      stats.consecutiveFailures = Number(prior?.consecutive_failures) || 0;
      stats.nextRetryAt = stats.backoffUntil;
    } else stats.consecutiveFailures = 0;
    if (failures.some((failure) => failure.ingestionId === source.id)) { stats.status = 'degraded'; stats.failureCode = 'item_processing_degraded'; }
  } catch (error) {
    stats.status = 'failed'; stats.failureCode = errorCode(error); stats.consecutiveFailures = (Number(prior?.consecutive_failures) || 0) + 1; const delay=Math.min(6*3600_000,(Number(defaults.retry?.baseDelayMs)||1000)*2**Math.min(stats.consecutiveFailures,12)); stats.nextRetryAt=new Date(Date.now()+delay).toISOString(); stats.backoffUntil=stats.nextRetryAt; failures.push({ ingestionId: source.id, failureCode: stats.failureCode, stage: 'fetch' });
  }
  stats.latencyMs = Date.now() - started;
  health.push(stats);
}

const unique = [...new Map(candidates.map((candidate) => [candidate.url, candidate])).values()].sort(compareByRecency);
const grouped = new Map(); for (const candidate of unique) { const items = grouped.get(candidate.sourceId) ?? []; items.push(candidate); grouped.set(candidate.sourceId, items); }
const groups = [...grouped.entries()].map(([sourceId, items]) => ({ sourceId, priority: Math.max(...items.map((item) => item.sourcePriority)), items: items.slice(0, 12) })).sort((a, b) => b.priority - a.priority);
const diverseCandidates = [];
for (let index = 0; diverseCandidates.length < 120 && groups.some((group) => index < group.items.length); index++) for (const group of groups) { if (diverseCandidates.length >= 120) break; if (group.items[index]) diverseCandidates.push(group.items[index]); }
const successfulSources = health.filter((entry) => entry.status !== 'failed').length;
if (successfulSources < 5) throw new Error(`Fail closed: only ${successfulSources} sources succeeded; failures=${JSON.stringify(failures)}`);
const checkedAt = new Date().toISOString();
const healthRows = health;
const out = { schemaVersion: '2.0.0', status: unique.length === 0 ? 'no_change' : 'candidates_ready', candidateCounts: { beforeCanonicalDedupe: candidates.length, afterCanonicalDedupe: unique.length, afterDiversityCap: diverseCandidates.length, afterRelevanceClassification: diverseCandidates.length }, reason: unique.length === 0 ? 'No genuinely new current candidates after deduplication' : null, successfulSources, checkedAt, generatedAt: checkedAt, windowDays, failures, candidates: diverseCandidates };
const drafts = path.join(root, 'content/drafts');
fs.mkdirSync(drafts, { recursive: true });
fs.writeFileSync(path.join(drafts, 'ingested.json'), `${JSON.stringify(out, null, 2)}\n`);
fs.writeFileSync(path.join(drafts, 'source-health.json'), `${JSON.stringify({ schemaVersion: '1.0.0', checkedAt, sources: healthRows }, null, 2)}\n`);
console.log(`Ingested ${out.candidates.length} candidates from ${successfulSources}/${sources.length} successful sources; ${health.reduce((sum, entry) => sum + entry.enriched, 0)} enriched excerpts.`);
console.log(JSON.stringify(health.map(({ ingestionId, sourceId, sourceType, status, itemsSeen, itemsNew, withinWindow, dedupedExisting, enriched, latencyMs, latestItemAt, httpStatus, rateRemaining, backoffUntil, consecutiveFailures, nextRetryAt, failureCode }) => ({ ingestionId, sourceId, sourceType, status, itemsSeen, itemsNew, withinWindow, dedupedExisting, enriched, latencyMs, latestItemAt, httpStatus, rateRemaining, backoffUntil, consecutiveFailures, nextRetryAt, failureCode }))));
