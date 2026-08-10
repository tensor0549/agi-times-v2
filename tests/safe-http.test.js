import { describe, expect, it, vi } from 'vitest';
import { assertPublicHttps, safeFetchHtml } from '../scripts/lib/safe-http.mjs';

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

describe('safe article enrichment fetch', () => {
  it('rejects non-HTTPS and direct private destinations', async () => {
    await expect(assertPublicHttps('http://example.com/post', publicLookup)).rejects.toThrow(/Only HTTPS/);
    await expect(assertPublicHttps('https://127.0.0.1/post')).rejects.toThrow(/private|non-routable/);
    await expect(assertPublicHttps('https://metadata.google.internal/latest', publicLookup)).rejects.toThrow(/Blocked enrichment hostname/);
  });

  it('revalidates every redirect and rejects metadata/private redirect targets', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://169.254.169.254/latest/meta-data' } }));
    await expect(safeFetchHtml('https://example.com/post', { fetchImpl, lookupImpl: publicLookup })).rejects.toThrow(/private|non-routable/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
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
