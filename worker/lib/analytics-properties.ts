const EVENT_KEYS: Record<string, ReadonlySet<string>> = {
  page_viewed: new Set(['theme', 'language', 'path', 'locale']),
  article_opened: new Set(['path', 'locale']),
  insight_opened: new Set(['placement', 'path', 'locale']),
  search_performed: new Set(['query_length', 'remote_result_count', 'provider', 'path', 'locale']),
  filter_changed: new Set(['category', 'placement', 'path', 'locale']),
  language_changed: new Set(['from', 'to', 'path', 'locale']),
  theme_changed: new Set(['from', 'to', 'path', 'locale']),
  source_link_clicked: new Set(['source_kind', 'target', 'placement', 'path', 'locale']),
  feedback_opened: new Set(['placement', 'path', 'locale']),
  error_seen: new Set(['area', 'fallback', 'path', 'locale']),
};

const ENUMS: Record<string, ReadonlySet<string>> = {
  theme: new Set(['light', 'dark', 'system']),
  language: new Set(['en', 'zh']),
  locale: new Set(['en', 'zh', 'zh-Hans']),
  from: new Set(['en', 'zh', 'light', 'dark', 'system']),
  to: new Set(['en', 'zh', 'light', 'dark', 'system']),
  category: new Set(['all', 'models', 'research', 'products', 'industry', 'policy', 'open-source']),
  placement: new Set(['footer', 'floating_button', 'navigation', 'archive']),
  provider: new Set(['api']),
  source_kind: new Set(['organization', 'media', 'person', 'project']),
  target: new Set(['source_directory']),
  area: new Set(['content_api', 'search_api', 'feed_pagination']),
};

const COUNT_KEYS = new Set(['query_length', 'remote_result_count']);

function safeRoute(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value === '/' ? 'root' : 'other';
}

function safeValue(key: string, value: unknown): string | number | boolean | null | undefined {
  if (key === 'path') return safeRoute(value) ?? undefined;
  if (COUNT_KEYS.has(key)) return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(100_000, Math.round(value)) : undefined;
  if (key === 'fallback') return typeof value === 'boolean' ? value : undefined;
  const allowed = ENUMS[key];
  return allowed && typeof value === 'string' && allowed.has(value) ? value : undefined;
}

export function safeAnalyticsProperties(event: string, input: Record<string, unknown> | undefined): Record<string, unknown> {
  const allowed = EVENT_KEYS[event];
  if (!allowed || !input) return {};
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.has(key)) continue;
    const safe = safeValue(key, value);
    if (safe !== undefined) output[key] = safe;
  }
  return output;
}

export function safeFeedbackAnalytics(context: Record<string, unknown>, pageUrl: string): Record<string, unknown> {
  const feedbackType = ['bug', 'idea', 'source', 'other'].includes(String(context.feedbackType)) ? String(context.feedbackType) : 'other';
  const theme = ['light', 'dark', 'system'].includes(String(context.theme)) ? String(context.theme) : 'system';
  let viewportBucket = 'unknown';
  const match = /^(\d{2,5})x(\d{2,5})$/.exec(String(context.viewport ?? ''));
  if (match) {
    const width = Number(match[1]);
    viewportBucket = width < 640 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop';
  }
  let route = 'other';
  try { route = safeRoute(new URL(pageUrl).pathname) ?? 'other'; } catch { /* same-origin validation happens before this helper */ }
  return { feedback_type: feedbackType, theme, viewport_bucket: viewportBucket, route };
}

export function feedbackPostHogEvent(feedbackId: string, rating: number | null, locale: 'en' | 'zh', context: Record<string, unknown>, pageUrl: string) {
  return {
    event: 'feedback_submitted',
    distinctId: feedbackId,
    properties: { feedback_id: feedbackId, rating, locale, ...safeFeedbackAnalytics(context,pageUrl) },
  };
}
