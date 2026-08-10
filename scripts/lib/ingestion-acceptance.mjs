const DAY_MS = 86_400_000;
const HEALTH_STATUSES = new Set(['healthy', 'degraded', 'failed', 'backoff']);
const SAFE_FAILURE_CODES = /^[a-z][a-z0-9_]{2,63}$/;
const ACCEPTED_CLASSIFICATIONS = new Set(['core_ai', 'transferable_research', 'material_ai_industry']);
const HEALTH_FIELDS = new Set(['ingestionId', 'sourceId', 'sourceType', 'status', 'lastAttemptAt', 'lastSuccessAt', 'latestItemAt', 'itemsSeen', 'itemsNew', 'withinWindow', 'dedupedExisting', 'enriched', 'latencyMs', 'httpStatus', 'rateRemaining', 'consecutiveFailures', 'nextRetryAt', 'backoffUntil', 'failureCode']);
const FAILURE_FIELDS = new Set(['ingestionId', 'failureCode', 'stage']);

const parseTime = (value) => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const canonicalUrl = (value) => {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('unsafe URL');
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (key.startsWith('utm_') || ['ref', 'source', 'campaign'].includes(key)) url.searchParams.delete(key);
  url.pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
  url.searchParams.sort();
  return url.href;
};

const isSpecificItemUrl = (value, source, registrySource) => {
  try {
    const canonical = new URL(canonicalUrl(value));
    const generics = [source?.url, source?.healthUrl, registrySource?.url].filter(Boolean).map((url) => new URL(canonicalUrl(url)));
    const allowedHosts = new Set([...generics.map((url) => url.hostname), ...(source?.itemHosts ?? [])]);
    if (!allowedHosts.has(canonical.hostname)) return false;
    if (generics.some((generic) => canonical.href === generic.href)) return false;
    const segments = canonical.pathname.split('/').filter(Boolean);
    if (segments.length === 0 || /^(?:news|blog|blogs|category|categories|search|tag|tags|topic|topics|articles?|help|recent)$/i.test(segments.at(-1))) return false;
    if (source?.itemPathPattern && !(new RegExp(source.itemPathPattern).test(canonical.pathname))) return false;
    return true;
  } catch {
    return false;
  }
};

export function auditIngestionRun({ config, registry, ingested, health, now = Date.now() }) {
  const errors = [];
  const enabled = (config.sources ?? []).filter((source) => source.enabled === true);
  const feedCount = enabled.filter((source) => ['rss', 'atom'].includes(source.kind)).length;
  const apiCount = enabled.filter((source) => source.kind?.endsWith('_api')).length;
  if (feedCount < 25) errors.push(`enabled feed floor not met: ${feedCount}<25`);
  if (apiCount < 2) errors.push(`enabled community API floor not met: ${apiCount}<2`);

  const registrySources = new Map((registry.sources ?? []).map((source) => [source.id, source]));
  const ingestionIds = new Set();
  for (const source of enabled) {
    if (!source.id || ingestionIds.has(source.id)) errors.push(`duplicate/missing ingestion id: ${source.id ?? 'unknown'}`);
    ingestionIds.add(source.id);
    if (!registrySources.has(source.sourceId)) errors.push(`${source.id}: unresolved registry sourceId`);
    if (source.healthUrl !== source.url) errors.push(`${source.id}: healthUrl must equal the exact endpoint`);
    if (source.itemHosts != null && (!Array.isArray(source.itemHosts) || source.itemHosts.some((host) => !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(host)))) errors.push(`${source.id}: itemHosts must contain bare DNS hostnames`);
    if (source.itemPathPattern != null) try { new RegExp(source.itemPathPattern); } catch { errors.push(`${source.id}: invalid itemPathPattern`); }
  }

  const counts = {};
  for (const source of registry.sources ?? []) counts[source.kind] = (counts[source.kind] ?? 0) + 1;
  for (const [kind, floor] of Object.entries({ organization: 100, media: 10, person: 100, project: 100 })) {
    if ((counts[kind] ?? 0) < floor) errors.push(`${kind} registry floor not met: ${counts[kind] ?? 0}<${floor}`);
  }

  const healthRows = health.sources ?? [];
  const healthById = new Map();
  for (const row of healthRows) {
    const unexpectedFields = Object.keys(row).filter((field) => !HEALTH_FIELDS.has(field));
    if (unexpectedFields.length) errors.push(`${row.ingestionId ?? 'unknown'}: unexpected health fields: ${unexpectedFields.join(',')}`);
    if (!row.ingestionId || healthById.has(row.ingestionId)) errors.push(`duplicate/missing health ingestionId: ${row.ingestionId ?? 'unknown'}`);
    else healthById.set(row.ingestionId, row);
    const configured = enabled.find((source) => source.id === row.ingestionId);
    if (configured && row.sourceId !== configured.sourceId) errors.push(`${row.ingestionId}: health sourceId does not match config`);
    if (!HEALTH_STATUSES.has(row.status)) errors.push(`${row.ingestionId ?? 'unknown'}: invalid health status`);
    const attemptAt = parseTime(row.lastAttemptAt);
    const successAt = parseTime(row.lastSuccessAt);
    const latestAt = parseTime(row.latestItemAt);
    if (!attemptAt) errors.push(`${row.ingestionId ?? 'unknown'}: lastAttemptAt required`);
    else if (attemptAt > now + 300_000) errors.push(`${row.ingestionId ?? 'unknown'}: future lastAttemptAt`);
    if (row.status === 'healthy' && !successAt) errors.push(`${row.ingestionId ?? 'unknown'}: healthy source requires lastSuccessAt`);
    if (successAt && (successAt > now + 300_000 || (attemptAt && successAt > attemptAt + 300_000))) errors.push(`${row.ingestionId ?? 'unknown'}: invalid/future lastSuccessAt`);
    if (row.status === 'healthy' && !latestAt) errors.push(`${row.ingestionId ?? 'unknown'}: healthy source requires latestItemAt freshness evidence`);
    if (latestAt && latestAt > now + 300_000) errors.push(`${row.ingestionId ?? 'unknown'}: future latestItemAt`);
    if (row.status === 'healthy' && Number(row.itemsSeen) === 0) errors.push(`${row.ingestionId ?? 'unknown'}: zero parsed items must be degraded`);
    if (row.status === 'healthy' && (!Number.isInteger(row.httpStatus) || row.httpStatus < 200 || row.httpStatus >= 300)) errors.push(`${row.ingestionId ?? 'unknown'}: healthy source requires 2xx httpStatus`);
    if (!Number.isFinite(row.latencyMs) || row.latencyMs < 0) errors.push(`${row.ingestionId ?? 'unknown'}: nonnegative latencyMs required`);
    if (!Number.isInteger(row.consecutiveFailures) || row.consecutiveFailures < 0) errors.push(`${row.ingestionId ?? 'unknown'}: consecutiveFailures must be a nonnegative integer`);
    const retryAt = parseTime(row.nextRetryAt ?? row.backoffUntil);
    if (row.status === 'failed' && (!retryAt || retryAt <= (attemptAt ?? 0))) errors.push(`${row.ingestionId ?? 'unknown'}: failed source requires nextRetryAt after lastAttemptAt`);
    if (row.status === 'backoff' && (!retryAt || retryAt <= now)) errors.push(`${row.ingestionId ?? 'unknown'}: backed-off source requires a future nextRetryAt`);
    if (row.nextRetryAt && row.backoffUntil && row.nextRetryAt !== row.backoffUntil) errors.push(`${row.ingestionId ?? 'unknown'}: nextRetryAt and backoffUntil must match`);
    if (configured?.kind === 'github_search_api') {
      if (!Number.isFinite(row.rateRemaining) || row.rateRemaining < 0) errors.push(`${row.ingestionId}: GitHub rateRemaining required`);
      if (row.rateRemaining === 0 && row.status !== 'backoff') errors.push(`${row.ingestionId}: exhausted GitHub rate limit must enter backoff`);
    }
    if (row.failureCode != null && !SAFE_FAILURE_CODES.test(row.failureCode)) errors.push(`${row.ingestionId ?? 'unknown'}: invalid failureCode`);
  }
  for (const source of enabled) if (!healthById.has(source.id)) errors.push(`${source.id}: missing endpoint-level health row`);
  for (const id of healthById.keys()) if (!ingestionIds.has(id)) errors.push(`${id}: health row is not configured/enabled`);

  const candidateCounts = ingested.candidateCounts;
  for (const field of ['beforeCanonicalDedupe', 'afterCanonicalDedupe', 'afterDiversityCap', 'afterRelevanceClassification']) {
    if (!Number.isInteger(candidateCounts?.[field]) || candidateCounts[field] < 0) errors.push(`candidateCounts.${field} must be a nonnegative integer`);
  }
  if (candidateCounts && (candidateCounts.beforeCanonicalDedupe < candidateCounts.afterCanonicalDedupe || candidateCounts.afterCanonicalDedupe < candidateCounts.afterDiversityCap || candidateCounts.afterDiversityCap < candidateCounts.afterRelevanceClassification)) errors.push('candidateCounts must be monotonically nonincreasing');
  if (candidateCounts?.afterDiversityCap > 120) errors.push('candidateCounts.afterDiversityCap exceeds the supervised cap of 120');

  const candidateUrls = new Set();
  for (const candidate of ingested.candidates ?? []) {
    const source = enabled.find((entry) => entry.id === candidate.ingestionId);
    if (!source) { errors.push(`${candidate.id ?? 'candidate'}: missing/unknown ingestionId`); continue; }
    if (candidate.sourceId !== source.sourceId) errors.push(`${candidate.id ?? 'candidate'}: sourceId does not match ingestion endpoint`);
    if (!isSpecificItemUrl(candidate.url, source, registrySources.get(source.sourceId))) errors.push(`${candidate.id ?? 'candidate'}: URL is not a specific HTTPS item on an allowed source host`);
    let canonicalCandidate;
    try { canonicalCandidate = canonicalUrl(candidate.url); } catch { canonicalCandidate = candidate.url; }
    if (candidateUrls.has(canonicalCandidate)) errors.push(`${candidate.id ?? 'candidate'}: duplicate canonical URL`);
    candidateUrls.add(canonicalCandidate);
    const publishedAt = parseTime(candidate.publishedAt);
    const activityAt = parseTime(candidate.activityAt);
    const windowMs = Number(ingested.windowDays ?? config.defaults?.windowDays ?? 14) * DAY_MS;
    if (!publishedAt || publishedAt > now + 300_000) errors.push(`${candidate.id ?? 'candidate'}: future/invalid publication timestamp`);
    if (['github_search_api', 'huggingface_models_api'].includes(source.kind)) {
      if (!activityAt || activityAt > now + 300_000 || activityAt < now - windowMs) errors.push(`${candidate.id ?? 'candidate'}: stale/future/invalid project activity timestamp`);
    } else if (publishedAt && publishedAt < now - windowMs) errors.push(`${candidate.id ?? 'candidate'}: stale feed publication timestamp`);
    const classificationRequired = source.requiresAiClassification || ['github_search_api', 'huggingface_models_api'].includes(source.kind);
    if (classificationRequired && !(candidate.classification?.relevant === true && candidate.classification?.confidence >= 0.8 && candidate.classification?.confidence <= 1 && ACCEPTED_CLASSIFICATIONS.has(candidate.classification?.reasonCode))) errors.push(`${candidate.id ?? 'candidate'}: accepted broad/community classification evidence required`);
    if (source.kind === 'github_search_api') {
      const pushedAt = parseTime(candidate.metrics?.pushedAt);
      const createdAt = parseTime(candidate.metrics?.createdAt);
      if (!(Number.isFinite(candidate.metrics?.stars) && candidate.metrics.stars >= 0 && Number.isFinite(candidate.metrics?.forks) && candidate.metrics.forks >= 0 && pushedAt && createdAt && createdAt <= pushedAt && Math.abs(pushedAt - activityAt) <= 1_000 && Math.abs(createdAt - publishedAt) <= 1_000)) errors.push(`${candidate.id ?? 'candidate'}: GitHub creation and activity provenance required`);
      if (candidate.metrics?.query !== 'new-rising' || !publishedAt || publishedAt < now - windowMs) errors.push(`${candidate.id ?? 'candidate'}: routine GitHub activity is not publishable without a current creation event`);
    }
    if (source.kind === 'huggingface_models_api') {
      const modifiedAt = parseTime(candidate.metrics?.lastModified);
      const createdAt = parseTime(candidate.metrics?.createdAt);
      if (!(Number.isFinite(candidate.metrics?.likes) && candidate.metrics.likes >= 0 && Number.isFinite(candidate.metrics?.downloads) && candidate.metrics.downloads >= 0 && Number.isFinite(candidate.metrics?.trendingScore) && candidate.metrics.trendingScore >= 0 && modifiedAt && createdAt && createdAt <= modifiedAt && Math.abs(modifiedAt - activityAt) <= 1_000 && Math.abs(createdAt - publishedAt) <= 1_000)) errors.push(`${candidate.id ?? 'candidate'}: Hugging Face creation and activity provenance required`);
      if (!publishedAt || publishedAt < now - windowMs) errors.push(`${candidate.id ?? 'candidate'}: routine Hugging Face modification is not publishable without a current creation event`);
    }
  }

  for (const failure of ingested.failures ?? []) {
    const unexpectedFields = Object.keys(failure).filter((field) => !FAILURE_FIELDS.has(field));
    if (unexpectedFields.length) errors.push(`${failure.ingestionId ?? 'unknown'}: unexpected failure fields: ${unexpectedFields.join(',')}`);
    if (!failure.ingestionId || !ingestionIds.has(failure.ingestionId)) errors.push('failure record requires a configured ingestionId');
    if (!SAFE_FAILURE_CODES.test(failure.failureCode ?? '')) errors.push(`${failure.ingestionId ?? 'unknown'}: failureCode required`);
  }

  if (Number.isInteger(candidateCounts?.afterRelevanceClassification) && candidateCounts.afterRelevanceClassification !== candidateUrls.size) errors.push(`classified candidate count mismatch: ${candidateCounts.afterRelevanceClassification}!=${candidateUrls.size}`);

  const attempted = healthRows.filter((row) => parseTime(row.lastAttemptAt)).length;
  const stale = healthRows.filter((row) => {
    const latest = parseTime(row.latestItemAt);
    return latest == null || now - latest > 30 * DAY_MS;
  }).length;
  const summary = {
    configured: enabled.length,
    attempted,
    successful: healthRows.filter((row) => row.status === 'healthy').length,
    degraded: healthRows.filter((row) => row.status === 'degraded').length,
    failed: healthRows.filter((row) => row.status === 'failed').length,
    backedOff: healthRows.filter((row) => row.status === 'backoff').length,
    stale,
    feeds: feedCount,
    apis: apiCount,
    candidatesBeforeDedupe: candidateCounts?.beforeCanonicalDedupe ?? null,
    candidatesAfterDedupe: candidateCounts?.afterCanonicalDedupe ?? null,
    candidatesAfterDiversityCap: candidateCounts?.afterDiversityCap ?? null,
    candidatesAfterDedupeAndClassification: candidateUrls.size,
  };
  if (attempted !== enabled.length) errors.push(`attempted source count mismatch: ${attempted}!=${enabled.length}`);
  return { ok: errors.length === 0, errors, summary };
}
