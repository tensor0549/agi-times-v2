import type { Bindings } from '../types';

const CAPTURE_EVENTS = new Set([
  'page_viewed', 'article_opened', 'insight_opened', 'search_performed',
  'filter_changed', 'language_changed', 'theme_changed', 'source_link_clicked',
  'feedback_opened', 'feedback_submitted', 'error_seen'
]);
const PUBLIC_EVENTS = new Set([...CAPTURE_EVENTS].filter((event) => event !== 'feedback_submitted'));

export type AnalyticsEvent = { event: string; distinctId: string; properties?: Record<string, unknown> };

export function isAllowedEvent(event: string) { return PUBLIC_EVENTS.has(event); }
export function isOpaqueAnalyticsId(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }

export async function capture(env: Bindings, event: AnalyticsEvent, requestId: string): Promise<boolean> {
  if (!env.POSTHOG_API_KEY || !CAPTURE_EVENTS.has(event.event)) return false;
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
