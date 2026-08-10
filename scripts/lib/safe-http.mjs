import dns from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';
import { Readable } from 'node:stream';

const blockedHostnames = new Set(['localhost', 'localhost.localdomain', 'metadata.google.internal', 'metadata', 'instance-data']);
const isPrivateV4 = (address) => {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return true;
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 0) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
};
const mappedV4 = (address) => {
  const dotted = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (dotted) return dotted;
  const hex = address.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return null;
  const value = (parseInt(hex[1], 16) << 16) | parseInt(hex[2], 16);
  return [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.');
};
const isPrivateIp = (address) => {
  const normalized = String(address).toLowerCase().split('%')[0];
  const family = net.isIP(normalized);
  if (family === 4) return isPrivateV4(normalized);
  if (family !== 6) return true;
  const mapped = mappedV4(normalized);
  if (mapped) return isPrivateV4(mapped);
  return normalized === '::' || normalized === '::1' || /^f[cd]/.test(normalized) || /^fe[89ab]/.test(normalized) || /^ff/.test(normalized) || /^2001:db8(?::|$)/.test(normalized);
};

export async function assertPublicHttps(value, lookupImpl = dns.lookup, allowedHosts) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error(`Only HTTPS enrichment URLs are allowed: ${url.protocol}`);
  if (url.username || url.password) throw new Error('Credentialed enrichment URLs are forbidden');
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!hostname || blockedHostnames.has(hostname) || hostname.endsWith('.localhost') || hostname.endsWith('.internal') || hostname.endsWith('.local')) throw new Error(`Blocked enrichment hostname: ${hostname}`);
  if (allowedHosts?.length && !allowedHosts.map((host) => host.toLowerCase().replace(/\.$/, '')).includes(hostname)) throw new Error(`Enrichment hostname is outside source allowlist: ${hostname}`);
  const resolved = net.isIP(hostname) ? [{ address: hostname, family: net.isIP(hostname) }] : await lookupImpl(hostname, { all: true, verbatim: true });
  if (!resolved.length || resolved.some(({ address }) => isPrivateIp(address))) throw new Error(`Blocked private or non-routable enrichment address for ${hostname}`);
  return { url, addresses: resolved.map(({ address, family }) => ({ address, family: family || net.isIP(address) })) };
}

export function pinnedHttpsRequest(url, validatedAddress, options = {}) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: 'GET', signal: options.signal, headers: options.headers,
      lookup: (_hostname, lookupOptions, callback) => lookupOptions?.all ? callback(null, [validatedAddress]) : callback(null, validatedAddress.address, validatedAddress.family),
    }, (response) => resolve({
      status: response.statusCode ?? 0,
      ok: (response.statusCode ?? 0) >= 200 && (response.statusCode ?? 0) < 300,
      url: url.href,
      headers: new Headers(Object.entries(response.headers).flatMap(([key, value]) => value == null ? [] : [[key, Array.isArray(value) ? value.join(', ') : value]])),
      body: Readable.toWeb(response),
    }));
    request.on('error', reject);
    request.end();
  });
}

export async function safeFetchText(value, options = {}) {
  const { maxBytes = 500_000, timeoutMs = 20_000, maxRedirects = 4, requestImpl, fetchImpl, lookupImpl = dns.lookup, allowedHosts, allowedContentTypes = ['text/html', 'application/xhtml+xml'], userAgent = 'AGITimesBot/1.0 (+https://agitime.ai)' } = options;
  let validated = await assertPublicHttps(value, lookupImpl, allowedHosts);
  for (let redirects = 0; redirects <= maxRedirects; redirects++) {
    const requestOptions = { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': userAgent, accept: 'text/html,application/xhtml+xml' } };
    const response = requestImpl
      ? await requestImpl(validated.url, validated.addresses[0], requestOptions)
      : fetchImpl
        ? await fetchImpl(validated.url, requestOptions)
        : await pinnedHttpsRequest(validated.url, validated.addresses[0], requestOptions);
    if (response.status >= 300 && response.status < 400) {
      if (redirects === maxRedirects) throw new Error(`Too many redirects (>${maxRedirects})`);
      const location = response.headers.get('location');
      if (!location) throw new Error(`Redirect ${response.status} has no Location`);
      try { await response.body?.cancel?.('redirect'); } catch { /* best effort */ }
      validated = await assertPublicHttps(new URL(location, validated.url).href, lookupImpl, allowedHosts);
      continue;
    }
    if (!response.ok) throw new Error(`resource HTTP ${response.status}`);
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!allowedContentTypes.some((allowed) => contentType.includes(allowed))) throw new Error(`Unsupported resource content type: ${contentType || 'missing'}`);
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes) throw new Error(`Resource exceeds ${maxBytes} byte limit`);
    if (!response.body) throw new Error('Article response has no body');
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      total += chunk.byteLength;
      if (total > maxBytes) { await reader.cancel('byte limit exceeded'); throw new Error(`Resource exceeds ${maxBytes} byte limit`); }
      chunks.push(chunk);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { url: response.url || validated.url.href, html: new TextDecoder().decode(bytes) };
  }
  throw new Error('Unreachable redirect state');
}

export const safeFetchHtml = (value, options = {}) => safeFetchText(value, { ...options, allowedContentTypes: ['text/html', 'application/xhtml+xml'] });
export const safeFetchXml = (value, options = {}) => safeFetchText(value, { ...options, allowedContentTypes: ['application/rss+xml', 'application/atom+xml', 'application/xml', 'text/xml', 'text/plain'] });
