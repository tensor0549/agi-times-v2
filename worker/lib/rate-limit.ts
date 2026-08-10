import type { Bindings } from '../types';

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function rateLimit(env: Bindings, request: Request, scope: string, max: number, windowSeconds: number, sessionId = ''): Promise<{ allowed: boolean; retryAfter: number }> {
  if (!env.RATE_LIMIT_SALT) return { allowed: false, retryAfter: windowSeconds };
  const ip = request.headers.get('cf-connecting-ip') ?? 'local';
  const identity = await sha256(`${env.RATE_LIMIT_SALT}:${scope}:${ip}:${sessionId.slice(0, 128)}`);
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / windowSeconds) * windowSeconds;
  await env.DB.prepare(`INSERT INTO api_rate_limits (key,window_start,count) VALUES (?,?,1)
    ON CONFLICT(key,window_start) DO UPDATE SET count=count+1`).bind(identity, windowStart).run();
  const row = await env.DB.prepare('SELECT count FROM api_rate_limits WHERE key=? AND window_start=?').bind(identity, windowStart).first<{ count: number }>();
  return { allowed: (row?.count ?? max + 1) <= max, retryAfter: windowStart + windowSeconds - now };
}

export function isSameOriginPage(raw: string, requestUrl: string): boolean {
  try {
    const page = new URL(raw);
    const request = new URL(requestUrl);
    return page.origin === request.origin && (page.protocol === 'https:' || page.hostname === 'localhost' || page.hostname === '127.0.0.1');
  } catch { return false; }
}
