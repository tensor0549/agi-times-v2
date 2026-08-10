import type { Context } from 'hono';

export function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export function boundedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function apiError(c: Context, status: 400 | 404 | 405 | 413 | 429 | 500 | 503, code: string, message: string) {
  return c.json({ error: { code, message }, requestId: c.get('requestId') }, status);
}
