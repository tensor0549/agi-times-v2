import { describe, expect, it, vi } from 'vitest';
import { assertPublicHttps, safeFetchHtml } from '../scripts/lib/safe-http.mjs';

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

describe('safe article enrichment fetch', () => {
  it('rejects non-HTTPS and direct private destinations', async () => {
    await expect(assertPublicHttps('http://example.com/post', publicLookup)).rejects.toThrow(/Only HTTPS/);
    await expect(assertPublicHttps('https://127.0.0.1/post')).rejects.toThrow(/private|non-routable/);
    await expect(assertPublicHttps('https://metadata.google.internal/latest', publicLookup)).rejects.toThrow(/Blocked enrichment hostname/);
    await expect(assertPublicHttps('https://[::ffff:7f00:1]/post')).rejects.toThrow(/private|non-routable/);
    await expect(assertPublicHttps('https://[ff02::1]/post')).rejects.toThrow(/private|non-routable/);
    await expect(assertPublicHttps('https://[2001:db8::1]/post')).rejects.toThrow(/private|non-routable/);
    await expect(assertPublicHttps('https://198.51.100.8/post')).rejects.toThrow(/private|non-routable/);
    await expect(assertPublicHttps('https://203.0.113.8/post')).rejects.toThrow(/private|non-routable/);
    for (const address of ['::a9fe:a9fe', '::127.0.0.1', '::7f00:1', '64:ff9b::a9fe:a9fe', '64:ff9b::7f00:1', '2002:a9fe:a9fe::', '2002:7f00:1::']) await expect(assertPublicHttps(`https://[${address}]/post`)).rejects.toThrow(/private|non-routable/);
    await expect(assertPublicHttps('https://evil.example/post', publicLookup, ['example.com'])).rejects.toThrow(/allowlist/);
  });

  it('revalidates every redirect and rejects metadata/private redirect targets', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://169.254.169.254/latest/meta-data' } }));
    await expect(safeFetchHtml('https://example.com/post', { fetchImpl, lookupImpl: publicLookup })).rejects.toThrow(/private|non-routable/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('pins the validated DNS address into the actual request and detects redirect loops', async () => {
    let lookups = 0;
    const lookupImpl = async () => { lookups += 1; return [{ address: lookups === 1 ? '93.184.216.34' : '127.0.0.1', family: 4 }]; };
    const requestImpl = vi.fn(async (_url, address) => {
      expect(address.address).toBe('93.184.216.34');
      return new Response('<html>ok</html>', { headers: { 'content-type': 'text/html' } });
    });
    await expect(safeFetchHtml('https://example.com/post', { lookupImpl, requestImpl, allowedHosts: ['example.com'] })).resolves.toMatchObject({ html: '<html>ok</html>' });
    expect(lookups).toBe(1);
    const loop = async () => new Response(null, { status: 302, headers: { location: '/again' } });
    await expect(safeFetchHtml('https://example.com/post', { maxRedirects: 2, lookupImpl: publicLookup, fetchImpl: loop, allowedHosts: ['example.com'] })).rejects.toThrow(/Too many redirects/);
  });

  it('enforces streamed and declared byte caps and HTML content types', async () => {
    const chunks = [new Uint8Array(40), new Uint8Array(40)];
    const stream = new ReadableStream({ pull(controller) { const chunk = chunks.shift(); chunk ? controller.enqueue(chunk) : controller.close(); } });
    await expect(safeFetchHtml('https://example.com/post', { maxBytes: 64, lookupImpl: publicLookup, fetchImpl: async () => new Response(stream, { headers: { 'content-type': 'text/html' } }) })).rejects.toThrow(/byte limit/);
    await expect(safeFetchHtml('https://example.com/post', { maxBytes: 64, lookupImpl: publicLookup, fetchImpl: async () => new Response('ok', { headers: { 'content-type': 'text/html', 'content-length': '1000' } }) })).rejects.toThrow(/byte limit/);
    await expect(safeFetchHtml('https://example.com/post', { lookupImpl: publicLookup, fetchImpl: async () => new Response('{}', { headers: { 'content-type': 'application/json' } }) })).rejects.toThrow(/content type/);
  });

  it('uses one end-to-end deadline for initial DNS, redirect DNS, requests and body', async () => {
    const stalledLookup = () => new Promise(() => {});
    await expect(safeFetchHtml('https://example.com/post', { timeoutMs: 15, lookupImpl: stalledLookup, fetchImpl: vi.fn() })).rejects.toThrow(/deadline/);
    let lookups = 0;
    const redirectLookup = () => ++lookups === 1 ? Promise.resolve([{ address: '93.184.216.34', family: 4 }]) : new Promise(() => {});
    await expect(safeFetchHtml('https://example.com/post', { timeoutMs: 20, lookupImpl: redirectLookup, allowedHosts: ['example.com'], fetchImpl: async () => new Response(null, { status: 302, headers: { location: '/next' } }) })).rejects.toThrow(/deadline/);
    const slowRedirect = async () => { await new Promise((resolve) => setTimeout(resolve, 12)); return new Response(null, { status: 302, headers: { location: '/again' } }); };
    await expect(safeFetchHtml('https://example.com/post', { timeoutMs: 25, maxRedirects: 5, lookupImpl: publicLookup, allowedHosts: ['example.com'], fetchImpl: slowRedirect })).rejects.toThrow(/deadline/);
    const stalledBody = new ReadableStream({ start() {} });
    await expect(safeFetchHtml('https://example.com/post', { timeoutMs: 15, lookupImpl: publicLookup, fetchImpl: async () => new Response(stalledBody, { headers: { 'content-type': 'text/html' } }) })).rejects.toThrow(/deadline/);
  });
});
