import crypto from 'node:crypto';

export const CLASSIFIER_VERSION = 'deterministic-v2';

const patterns = {
  site_defect: [/\b(?:error|crash|broken|bug|fail(?:ed|ure)?|not work(?:ing)?)\b/i, /(?:错误|崩溃|坏了|无法|不能|失效)/],
  dead_link: [/\b(?:dead|broken|invalid)\s+link\b/i, /(?:死链|坏链|链接失效|链接打不开)/],
  content_error: [/\b(?:citation|article|translation|incorrect|outdated|missing)\b/i, /(?:引用|文章|翻译|不正确|过时|遗漏)/],
  source_request: [/\b(?:add|include|cover|missing)\s+(?:a\s+)?source\b/i, /(?:新增|添加|收录|补充).{0,8}(?:来源|信源)/],
  feature_request: [/\b(?:feature request|please add|would like|it would be useful)\b/i, /(?:功能建议|希望增加|建议增加|可以增加)/],
};

export const PROBE_REGISTRY = Object.freeze({
  'root.available': Object.freeze({ path: '/', method: 'HEAD', min: 200, max: 299, route: 'root' }),
  'health.ok': Object.freeze({ path: '/api/v1/health', method: 'GET', min: 200, max: 299, route: 'api.health' }),
  'feed.valid': Object.freeze({ path: '/api/v1/feed?limit=10', method: 'GET', min: 200, max: 299, route: 'api.feed' }),
  'insights.valid': Object.freeze({ path: '/api/v1/insights?limit=10', method: 'GET', min: 200, max: 299, route: 'api.insights' }),
  'search.basic': Object.freeze({ path: '/api/v1/search?q=agent&limit=10', method: 'GET', min: 200, max: 299, route: 'api.search' }),
});

export function registeredProbe(probeId) { return PROBE_REGISTRY[probeId] ?? null; }
export function registeredProbeForRequest(path, method) {
  return Object.entries(PROBE_REGISTRY).find(([, probe]) => probe.path === path && probe.method === method) ?? null;
}

function firstPartyUrl(pageUrl) {
  try {
    const url = new URL(String(pageUrl));
    if (url.protocol !== 'https:' || !['agitime.ai', 'www.agitime.ai'].includes(url.hostname)) return null;
    return url;
  } catch { return null; }
}

export function normalizedRoute(pageUrl) {
  const url = firstPartyUrl(pageUrl);
  if (!url) return 'invalid';
  if (url.pathname === '/') return 'root';
  if (url.pathname === '/api/v1/health') return 'api.health';
  if (url.pathname === '/api/v1/feed') return 'api.feed';
  if (url.pathname === '/api/v1/insights' || url.pathname.startsWith('/api/v1/insights/')) return 'api.insights';
  if (url.pathname === '/api/v1/search') return 'api.search';
  return 'other';
}

export function probeForPage(pageUrl) {
  const route = normalizedRoute(pageUrl);
  return Object.entries(PROBE_REGISTRY).find(([, probe]) => probe.route === route) ?? null;
}

export function structuredFeedbackType(contextJson) {
  try {
    const context = typeof contextJson === 'string' ? JSON.parse(contextJson) : contextJson;
    return ['bug', 'idea', 'source', 'other'].includes(context?.feedbackType) ? context.feedbackType : null;
  } catch { return null; }
}

// Backward-compatible helper: returns only a registered, fixed probe path.
export function probePath(pageUrl) { return probeForPage(pageUrl)?.[1].path ?? null; }

export function classifyFeedback(feedback) {
  const message = String(feedback.message ?? '');
  const matches = Object.entries(patterns)
    .filter(([, expressions]) => expressions.some((expression) => expression.test(message)))
    .map(([name]) => name);
  const keywordCategory = ['dead_link', 'site_defect', 'content_error', 'source_request', 'feature_request'].find((name) => matches.includes(name)) ?? 'other';
  const feedbackType = structuredFeedbackType(feedback.context_json);
  const category = feedbackType === 'idea' ? 'feature_request'
    : feedbackType === 'source' ? 'source_request'
      : feedbackType === 'bug' ? (keywordCategory === 'dead_link' ? 'dead_link' : 'site_defect')
        : keywordCategory;
  const severity = feedback.rating != null && Number(feedback.rating) <= 2 ? 'high' : 'normal';
  const route = normalizedRoute(feedback.page_url);
  const probeEntry = probeForPage(feedback.page_url);
  const probeId = probeEntry?.[0] ?? null;
  const probe = probeEntry?.[1] ?? null;
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ classifier: CLASSIFIER_VERSION, category, route, probeCode: probeId ?? 'unprobed' })).digest('hex');
  return {
    fingerprint, category, severity, probeMethod: probe?.method ?? null, probePath: probe?.path ?? null,
    diagnosis: { classifier: CLASSIFIER_VERSION, category, severity, keywordClasses: matches, feedbackType, normalizedRoute: route, probeId, locale: ['en','zh'].includes(feedback.locale) ? feedback.locale : 'unknown', contentIdPresent: Boolean(feedback.content_id), messageLength: message.length },
  };
}

export function publicLog(event, ids) { return { event, count: ids.length, opaqueIds: ids }; }
