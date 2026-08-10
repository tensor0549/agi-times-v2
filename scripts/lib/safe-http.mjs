import dns from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';
import { Readable } from 'node:stream';
import ipaddr from 'ipaddr.js';

const blockedHostnames = new Set(['localhost', 'localhost.localdomain', 'metadata.google.internal', 'metadata', 'instance-data']);
const isGlobalV4 = (address) => {
  try { const parsed = ipaddr.parse(address); return parsed.kind() === 'ipv4' && parsed.range() === 'unicast'; }
  catch { return false; }
};
const embeddedV4 = (parts) => `${parts[6] >>> 8}.${parts[6] & 255}.${parts[7] >>> 8}.${parts[7] & 255}`;
const isPrivateIp = (address) => {
  const normalized = String(address).toLowerCase().split('%')[0];
  try {
    const parsed = ipaddr.parse(normalized);
    if (parsed.kind() === 'ipv4') return !isGlobalV4(normalized);
    const parts = parsed.parts;
    if (parsed.isIPv4MappedAddress?.()) return !isGlobalV4(parsed.toIPv4Address().toString());
    if (parsed.range() !== 'unicast') return true;
    if (parts[0] === 0x2002) return !isGlobalV4(`${parts[1] >>> 8}.${parts[1] & 255}.${parts[2] >>> 8}.${parts[2] & 255}`);
    if ((parts[0] === 0x64 && parts[1] === 0xff9b) || parts.slice(0, 6).every((part) => part === 0) || (parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff)) return !isGlobalV4(embeddedV4(parts));
    return false;
  } catch { return true; }
};
const withDeadline = async (promise, deadlineAt, label) => {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) throw new DOMException(`${label} exceeded end-to-end deadline`, 'TimeoutError');
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new DOMException(`${label} exceeded end-to-end deadline`, 'TimeoutError')), remaining); })]); }
  finally { clearTimeout(timer); }
};

export async function assertPublicHttps(value, lookupImpl = dns.lookup, allowedHosts, deadlineAt = Date.now() + 20_000) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error(`Only HTTPS enrichment URLs are allowed: ${url.protocol}`);
  if (url.username || url.password) throw new Error('Credentialed enrichment URLs are forbidden');
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!hostname || blockedHostnames.has(hostname) || hostname.endsWith('.localhost') || hostname.endsWith('.internal') || hostname.endsWith('.local')) throw new Error(`Blocked enrichment hostname: ${hostname}`);
  if (allowedHosts?.length && !allowedHosts.map((host) => host.toLowerCase().replace(/\.$/, '')).includes(hostname)) throw new Error(`Enrichment hostname is outside source allowlist: ${hostname}`);
  const resolved = net.isIP(hostname) ? [{ address: hostname, family: net.isIP(hostname) }] : await withDeadline(Promise.resolve().then(() => lookupImpl(hostname, { all: true, verbatim: true })), deadlineAt, `DNS lookup for ${hostname}`);
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
  const deadlineAt = Date.now() + timeoutMs;
  let validated = await assertPublicHttps(value, lookupImpl, allowedHosts, deadlineAt);
  for (let redirects = 0; redirects <= maxRedirects; redirects++) {
    const remaining = deadlineAt - Date.now();
    if (remaining <= 0) throw new DOMException('Fetch exceeded end-to-end deadline', 'TimeoutError');
    const requestOptions = { redirect: 'manual', signal: AbortSignal.timeout(remaining), headers: { 'user-agent': userAgent, accept: 'text/html,application/xhtml+xml' } };
    const responsePromise = requestImpl
      ? requestImpl(validated.url, validated.addresses[0], requestOptions)
      : fetchImpl
        ? fetchImpl(validated.url, requestOptions)
        : pinnedHttpsRequest(validated.url, validated.addresses[0], requestOptions);
    const response = await withDeadline(responsePromise, deadlineAt, 'HTTPS request');
    if (response.status >= 300 && response.status < 400) {
      if (redirects === maxRedirects) throw new Error(`Too many redirects (>${maxRedirects})`);
      const location = response.headers.get('location');
      if (!location) throw new Error(`Redirect ${response.status} has no Location`);
      try { await response.body?.cancel?.('redirect'); } catch { /* best effort */ }
      validated = await assertPublicHttps(new URL(location, validated.url).href, lookupImpl, allowedHosts, deadlineAt);
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
      const { done, value: chunk } = await withDeadline(reader.read(), deadlineAt, 'Response body');
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
