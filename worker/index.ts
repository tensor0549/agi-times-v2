import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { secureHeaders } from 'hono/secure-headers';
import { timing } from 'hono/timing';
import type { Bindings } from './types';
import { apiError, boundedInt, parseJson } from './lib/http';
import { capture, isAllowedEvent } from './lib/posthog';
import { isFirstPartyPage, rateLimit } from './lib/rate-limit';

type Variables = { requestId: string };
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use('*', async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set('requestId', requestId);
  await next();
  c.header('x-request-id', requestId);
  c.header('x-content-type-options', 'nosniff');
  if (c.req.path.startsWith('/api/')) c.header('cache-control', 'no-store');
});
app.use('*', secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"], imgSrc: ["'self'", 'https:', 'data:'],
    scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
    connectSrc: ["'self'", 'https://us.i.posthog.com', 'https://us.posthog.com'],
    fontSrc: ["'self'", 'data:'], objectSrc: ["'none'"], baseUri: ["'self'"], frameAncestors: ["'none'"],
  },
  referrerPolicy: 'strict-origin-when-cross-origin',
  strictTransportSecurity: 'max-age=31536000; includeSubDomains; preload',
}));
app.use('*', timing());
app.use('*', compress());

app.get('/api/v1/health', async (c) => {
  try {
    const db = await c.env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>();
    return c.json({ status: db?.ok === 1 ? 'ok' : 'degraded', service: 'agi-times-v2', environment: c.env.ENVIRONMENT });
  } catch {
    return apiError(c, 503, 'DATABASE_UNAVAILABLE', 'The service is temporarily unavailable.');
  }
});

app.get('/api/v1/feed', async (c) => {
  const limit = boundedInt(c.req.query('limit'), 24, 1, 100);
  const cursor = c.req.query('cursor');
  const kind = c.req.query('kind');
  const topic = c.req.query('topic');
  const conditions = ["ci.status = 'published'"];
  const values: unknown[] = [];
  if (cursor) { conditions.push('ci.published_at < ?'); values.push(cursor); }
  if (kind) { conditions.push('ci.kind = ?'); values.push(kind); }
  if (topic) { conditions.push('ci.topics_json LIKE ?'); values.push(`%${topic.replace(/[%_]/g, '')}%`); }
  values.push(limit + 1);
  try {
    const result = await c.env.DB.prepare(`SELECT ci.*, s.name AS source_name, s.kind AS source_kind
      FROM content_items ci JOIN sources s ON s.id=ci.source_id
      WHERE ${conditions.join(' AND ')} ORDER BY ci.featured DESC, ci.published_at DESC LIMIT ?`).bind(...values).all<Record<string, unknown>>();
    const rows = result.results;
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(toContentItem);
    const nextCursor = hasMore ? String(rows[limit - 1]?.published_at) : null;
    c.header('cache-control', 'public, max-age=60, stale-while-revalidate=300');
    return c.json({ items, nextCursor, generatedAt: new Date().toISOString() });
  } catch { return apiError(c, 503, 'FEED_UNAVAILABLE', 'The feed is temporarily unavailable.'); }
});

app.get('/api/v1/search', async (c) => {
  const query = (c.req.query('q') ?? '').trim().slice(0, 200);
  if (query.length < 2) return apiError(c, 400, 'INVALID_QUERY', 'Search query must contain at least 2 characters.');
  const limit = boundedInt(c.req.query('limit'), 20, 1, 50);
  const tokens = query.replace(/["'():*+-]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 10);
  if (!tokens.length) return c.json({ items: [], query });
  try {
    const ftsQuery = tokens.map((token) => `"${token}"*`).join(' AND ');
    const result = await c.env.DB.prepare(`SELECT ci.*, s.name AS source_name, s.kind AS source_kind, bm25(content_search) AS rank
      FROM content_search JOIN content_items ci ON ci.id=content_search.id JOIN sources s ON s.id=ci.source_id
      WHERE content_search MATCH ? AND ci.status='published' ORDER BY rank, ci.published_at DESC LIMIT ?`)
      .bind(ftsQuery, limit).all<Record<string, unknown>>();
    c.header('cache-control', 'public, max-age=30, stale-while-revalidate=120');
    return c.json({ items: result.results.map(toContentItem), query });
  } catch { return apiError(c, 503, 'SEARCH_UNAVAILABLE', 'Search is temporarily unavailable.'); }
});

app.get('/api/v1/insights', async (c) => {
  const limit = boundedInt(c.req.query('limit'), 10, 1, 50);
  try {
    const result = await c.env.DB.prepare(`SELECT * FROM insights WHERE status='published' ORDER BY published_at DESC LIMIT ?`).bind(limit).all<Record<string, unknown>>();
    const items = result.results.map((row) => ({
      id: row.id, slug: row.slug, title: { en: row.title_en, zh: row.title_zh }, dek: { en: row.dek_en, zh: row.dek_zh },
      body: { en: row.body_en, zh: row.body_zh }, topics: parseJson(String(row.topics_json), []),
      claims: parseJson(String(row.claims_json), []), sources: parseJson(String(row.sources_json), []),
      publishedAt: row.published_at, updatedAt: row.updated_at,
    }));
    c.header('cache-control', 'public, max-age=120, stale-while-revalidate=600');
    return c.json({ items, generatedAt: new Date().toISOString() });
  } catch { return apiError(c, 503, 'INSIGHTS_UNAVAILABLE', 'Insights are temporarily unavailable.'); }
});

app.get('/api/v1/insights/:slug', async (c) => {
  try {
    const row = await c.env.DB.prepare(`SELECT * FROM insights WHERE slug=? AND status='published'`).bind(c.req.param('slug')).first<Record<string, unknown>>();
    if (!row) return apiError(c, 404, 'NOT_FOUND', 'Insight not found.');
    c.header('cache-control', 'public, max-age=120, stale-while-revalidate=600');
    return c.json({ id: row.id, slug: row.slug, title: { en: row.title_en, zh: row.title_zh }, dek: { en: row.dek_en, zh: row.dek_zh }, body: { en: row.body_en, zh: row.body_zh }, topics: parseJson(String(row.topics_json), []), claims: parseJson(String(row.claims_json), []), sources: parseJson(String(row.sources_json), []), publishedAt: row.published_at, updatedAt: row.updated_at });
  } catch { return apiError(c, 503, 'INSIGHT_UNAVAILABLE', 'The insight is temporarily unavailable.'); }
});

app.post('/api/v1/events', async (c) => {
  if (Number(c.req.header('content-length') ?? 0) > 16_384) return apiError(c, 413, 'PAYLOAD_TOO_LARGE', 'Payload is too large.');
  let body: { event?: string; distinctId?: string; properties?: Record<string, unknown> };
  try { body = await c.req.json(); } catch { return apiError(c, 400, 'INVALID_JSON', 'A valid JSON body is required.'); }
  if (!body.event || !isAllowedEvent(body.event) || !body.distinctId) return apiError(c, 400, 'INVALID_EVENT', 'Event name or distinct ID is invalid.');
  const limit = await rateLimit(c.env, c.req.raw, 'events', 120, 60, body.distinctId);
  if (!limit.allowed) { c.header('retry-after', String(limit.retryAfter)); return apiError(c, 429, 'RATE_LIMITED', 'Too many events. Please retry later.'); }
  const properties = sanitizeProperties(body.properties);
  c.executionCtx.waitUntil(capture(c.env, { event: body.event, distinctId: body.distinctId, properties }, c.get('requestId')));
  return c.body(null, 202);
});

app.post('/api/v1/feedback', async (c) => {
  if (Number(c.req.header('content-length') ?? 0) > 32_768) return apiError(c, 413, 'PAYLOAD_TOO_LARGE', 'Payload is too large.');
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return apiError(c, 400, 'INVALID_JSON', 'A valid JSON body is required.'); }
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 4000) : '';
  const rating = typeof body.rating === 'number' && body.rating >= 1 && body.rating <= 5 ? Math.round(body.rating) : null;
  const pageUrl = typeof body.pageUrl === 'string' ? body.pageUrl.slice(0, 2048) : '';
  const locale = body.locale === 'zh' ? 'zh' : 'en';
  if (!message && !rating) return apiError(c, 400, 'INVALID_FEEDBACK', 'A message or rating is required.');
  if (!isFirstPartyPage(pageUrl) && c.env.ENVIRONMENT === 'production') return apiError(c, 400, 'INVALID_PAGE', 'Page URL must belong to AGI Times.');
  const sessionId = typeof body.distinctId === 'string' ? body.distinctId : '';
  const limit = await rateLimit(c.env, c.req.raw, 'feedback', 5, 3600, sessionId);
  if (!limit.allowed) { c.header('retry-after', String(limit.retryAfter)); return apiError(c, 429, 'RATE_LIMITED', 'Too much feedback was submitted. Please retry later.'); }
  const id = crypto.randomUUID();
  const context = sanitizeProperties(typeof body.context === 'object' ? body.context as Record<string, unknown> : {});
  try {
    await c.env.DB.prepare(`INSERT INTO feedback (id,rating,message,email,locale,page_url,content_id,context_json) VALUES (?,?,?,?,?,?,?,?)`)
      .bind(id, rating, message || null, typeof body.email === 'string' ? body.email.slice(0, 320) : null, locale, pageUrl, typeof body.contentId === 'string' ? body.contentId.slice(0, 128) : null, JSON.stringify(context)).run();
  } catch { return apiError(c, 503, 'FEEDBACK_UNAVAILABLE', 'Feedback could not be saved. Please try again.'); }
  const distinctId = typeof body.distinctId === 'string' ? body.distinctId : id;
  c.executionCtx.waitUntil(capture(c.env, { event: 'feedback_submitted', distinctId, properties: { feedback_id: id, rating, locale, page_url: pageUrl, content_id: body.contentId, ...context } }, c.get('requestId')));
  return c.json({ id, status: 'received' }, 201);
});

async function scheduled(controller: ScheduledController, env: Bindings): Promise<void> {
  const now = new Date().toISOString();
  try {
    const stats = await env.DB.prepare(`SELECT
      (SELECT MAX(published_at) FROM content_items WHERE status='published') AS latest_content,
      (SELECT COUNT(*) FROM feedback WHERE status='new') AS new_feedback,
      (SELECT COUNT(*) FROM ingestion_runs WHERE status='failed' AND started_at >= datetime('now','-1 day')) AS recent_failures`).first<Record<string, unknown>>();
    console.log(JSON.stringify({ level: 'info', event: 'ops_check', scheduledTime: controller.scheduledTime, checkedAt: now, ...stats }));
    await env.DB.prepare('DELETE FROM api_rate_limits WHERE window_start < ?').bind(Math.floor(Date.now()/1000)-86400).run();
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'ops_check_failed', checkedAt: now, message: error instanceof Error ? error.message : 'unknown' }));
    throw error;
  }
}

app.notFound((c) => c.req.path.startsWith('/api/') ? apiError(c, 404, 'NOT_FOUND', 'API endpoint not found.') : c.env.ASSETS.fetch(c.req.raw));
app.onError((error, c) => { console.error(JSON.stringify({ level: 'error', requestId: c.get('requestId'), path: c.req.path, message: error.message })); return apiError(c, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.'); });

function sanitizeProperties(input: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!input) return {};
  return Object.fromEntries(Object.entries(input).slice(0, 40).filter(([key, value]) => key.length <= 64 && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null)).map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 1000) : value]));
}

function toContentItem(row: Record<string, unknown>) {
  return { id: row.id, type: row.kind, url: row.canonical_url, title: { en: row.title_en, zh: row.title_zh }, summary: { en: row.summary_en, zh: row.summary_zh }, source: { id: row.source_id, name: row.source_name, kind: row.source_kind }, imageUrl: row.image_url, originalLanguage: row.original_language, publishedAt: row.published_at, discoveredAt: row.discovered_at, topics: parseJson(String(row.topics_json), []), entities: parseJson(String(row.entities_json), []), metrics: parseJson(String(row.metrics_json), {}), score: row.score, featured: Boolean(row.featured) };
}

export default { fetch: app.fetch, scheduled };
