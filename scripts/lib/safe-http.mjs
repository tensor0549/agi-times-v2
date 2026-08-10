import dns from 'node:dns/promises';
import net from 'node:net';

const blockedHostnames = new Set(['localhost', 'localhost.localdomain', 'metadata.google.internal', 'metadata', 'instance-data']);
const isPrivateV4 = (address) => {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return true;
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 0) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
};
const isPrivateIp = (address) => {
  const normalized = String(address).toLowerCase().split('%')[0];
  const family = net.isIP(normalized);
  if (family === 4) return isPrivateV4(normalized);
  if (family !== 6) return true;
  if (normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mapped ? isPrivateV4(mapped) : false;
};

export async function assertPublicHttps(value, lookupImpl = dns.lookup) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error(`Only HTTPS enrichment URLs are allowed: ${url.protocol}`);
  if (url.username || url.password) throw new Error('Credentialed enrichment URLs are forbidden');
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname || blockedHostnames.has(hostname) || hostname.endsWith('.localhost') || hostname.endsWith('.internal') || hostname.endsWith('.local')) throw new Error(`Blocked enrichment hostname: ${hostname}`);
  const literal = net.isIP(hostname) ? [{ address: hostname }] : await lookupImpl(hostname, { all: true, verbatim: true });
  if (!literal.length || literal.some(({ address }) => isPrivateIp(address))) throw new Error(`Blocked private or non-routable enrichment address for ${hostname}`);
  return url;
}

export async function safeFetchHtml(value, options = {}) {
  const { maxBytes = 500_000, timeoutMs = 20_000, maxRedirects = 4, fetchImpl = fetch, lookupImpl = dns.lookup, userAgent = 'AGITimesBot/1.0 (+https://agitime.ai)' } = options;
  let url = await assertPublicHttps(value, lookupImpl);
  for (let redirects = 0; redirects <= maxRedirects; redirects++) {
    const response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': userAgent, accept: 'text/html,application/xhtml+xml' } });
    if (response.status >= 300 && response.status < 400) {
      if (redirects === maxRedirects) throw new Error(`Too many redirects (>${maxRedirects})`);
      const location = response.headers.get('location');
      if (!location) throw new Error(`Redirect ${response.status} has no Location`);
      url = await assertPublicHttps(new URL(location, url).href, lookupImpl);
      continue;
    }
    if (!response.ok) throw new Error(`article HTTP ${response.status}`);
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) throw new Error(`Unsupported article content type: ${contentType || 'missing'}`);
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes) throw new Error(`Article exceeds ${maxBytes} byte limit`);
    if (!response.body) throw new Error('Article response has no body');
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      total += chunk.byteLength;
      if (total > maxBytes) { await reader.cancel('byte limit exceeded'); throw new Error(`Article exceeds ${maxBytes} byte limit`); }
      chunks.push(chunk);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { url: response.url || url.href, html: new TextDecoder().decode(bytes) };
  }
  throw new Error('Unreachable redirect state');
}
