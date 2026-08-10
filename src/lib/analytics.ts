export type AnalyticsEvent =
  | 'page_viewed' | 'article_opened' | 'insight_opened' | 'search_performed'
  | 'filter_changed' | 'language_changed' | 'theme_changed' | 'source_link_clicked'
  | 'feedback_opened' | 'feedback_submitted' | 'error_seen';

const STORAGE_KEY = 'agi_times_anon_id';
function distinctId(): string {
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(STORAGE_KEY, id); }
    return id;
  } catch { return crypto.randomUUID(); }
}

export function track(event: AnalyticsEvent, properties: Record<string, string | number | boolean | null> = {}): void {
  const payload = JSON.stringify({ event, distinctId: distinctId(), properties: { ...properties, path: location.pathname, locale: document.documentElement.lang || 'en' } });
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/v1/events', new Blob([payload], { type: 'application/json' }));
  } else {
    void fetch('/api/v1/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, keepalive: true }).catch(() => undefined);
  }
}

export async function submitFeedback(input: { rating?: number; message?: string; email?: string; locale: 'en' | 'zh'; contentId?: string; context?: Record<string, string | number | boolean | null> }) {
  const response = await fetch('/api/v1/feedback', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...input, pageUrl: location.href, distinctId: distinctId(), context: { viewport: `${innerWidth}x${innerHeight}`, userAgent: navigator.userAgent.slice(0, 300), ...input.context } }),
  });
  if (!response.ok) throw new Error(`Feedback request failed (${response.status})`);
  return response.json() as Promise<{ id: string; status: 'received' }>;
}
