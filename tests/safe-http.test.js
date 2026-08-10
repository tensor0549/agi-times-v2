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

  it('propagates timeout aborts from a stalled fetch', async () => {
    const fetchImpl = (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
    await expect(safeFetchHtml('https://example.com/post', { timeoutMs: 10, lookupImpl: publicLookup, fetchImpl })).rejects.toThrow();
  });
});
