import type { Context } from 'hono';

export function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export function boundedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function utcTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(' ', 'T')}Z` : value;
  const time = Date.parse(normalized);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function latestTimestamp(values: unknown[], fallback: string | null = null): string | null {
  const valid = values.map(utcTimestamp).filter((value): value is string => value !== null);
  return valid.length ? valid.reduce((latest, value) => Date.parse(value) > Date.parse(latest) ? value : latest) : utcTimestamp(fallback);
}

export function apiError(c: Context, status: 400 | 404 | 405 | 413 | 429 | 500 | 503, code: string, message: string) {
  return c.json({ error: { code, message }, requestId: c.get('requestId') }, status);
}
