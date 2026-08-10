import type { Bindings } from '../types';

const ALLOWED_EVENTS = new Set([
  'page_viewed', 'article_opened', 'insight_opened', 'search_performed',
  'filter_changed', 'language_changed', 'theme_changed', 'source_link_clicked',
  'feedback_submitted', 'error_seen'
]);

export type AnalyticsEvent = { event: string; distinctId: string; properties?: Record<string, unknown> };

export function isAllowedEvent(event: string) { return ALLOWED_EVENTS.has(event); }

export async function capture(env: Bindings, event: AnalyticsEvent, requestId: string): Promise<boolean> {
  if (!env.POSTHOG_API_KEY || !isAllowedEvent(event.event)) return false;
  const host = env.POSTHOG_HOST || 'https://us.i.posthog.com';
  const body = {
    api_key: env.POSTHOG_API_KEY,
    event: event.event,
    properties: {
      distinct_id: event.distinctId.slice(0, 128),
      ...event.properties,
      request_id: requestId,
      environment: env.ENVIRONMENT,
      $lib: 'agi-times-worker',
    },
    timestamp: new Date().toISOString(),
  };
  try {
    const response = await fetch(`${host}/capture/`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!response.ok) console.error(JSON.stringify({ level: 'error', event: 'posthog_delivery_failed', status: response.status, requestId }));
    return response.ok;
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'posthog_delivery_failed', message: error instanceof Error ? error.message : 'unknown', requestId }));
    return false;
  }
}
