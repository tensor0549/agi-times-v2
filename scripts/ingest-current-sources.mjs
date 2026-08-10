import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { safeFetchHtml, safeFetchXml } from './lib/safe-http.mjs';

const root = path.resolve(import.meta.dirname, '..');
const feeds = [
  { sourceId: 'src_hugging-face', publisher: 'Hugging Face', url: 'https://huggingface.co/blog/feed.xml', reliability: 0.9, allowedHosts: ['huggingface.co'] },
  { sourceId: 'src_microsoft-research', publisher: 'Microsoft Research', url: 'https://www.microsoft.com/en-us/research/feed/', reliability: 0.92, allowedHosts: ['www.microsoft.com'] },
  { sourceId: 'src_nvidia-ai', publisher: 'NVIDIA AI', url: 'https://blogs.nvidia.com/blog/category/deep-learning/feed/', reliability: 0.92, allowedHosts: ['blogs.nvidia.com'] },
  { sourceId: 'src_google-research', publisher: 'Google Research', url: 'https://research.google/blog/rss/', reliability: 0.94, allowedHosts: ['research.google'] },
  { sourceId: 'src_arxiv-cs-ai', publisher: 'arXiv cs.AI', url: 'https://export.arxiv.org/rss/cs.AI', reliability: 0.86, academic: true, allowedHosts: ['export.arxiv.org'] },
];
const clean = (value) => String(value ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const valueOf = (block, names) => {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
    if (match) return clean(match[1]);
  }
  return '';
};
const canonical = (value) => {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) if (key.startsWith('utm_') || key === 'ref') url.searchParams.delete(key);
    url.hash = '';
    return url.href;
  } catch { return ''; }
};
const meta = (html, key) => {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return clean(html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)`, 'i'))?.[1]
    ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["']`, 'i'))?.[1]);
};
const enrichEvidence = async (url, allowedHosts) => {
  const { html } = await safeFetchHtml(url, { maxBytes: 500_000, timeoutMs: 20_000, maxRedirects: 4, allowedHosts });
  let description = meta(html, 'description') || meta(html, 'og:description') || meta(html, 'twitter:description');
  if (/^(?:we.re on a journey|a blog post by)\b/i.test(description)) description = '';
  if (!description) {
    for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const data = JSON.parse(match[1]);
        const records = Array.isArray(data) ? data : data?.['@graph'] ?? [data];
        description = clean(records.find((record) => record?.description)?.description);
        if (description) break;
      } catch { /* Ignore malformed publisher JSON-LD. */ }
    }
  }
  if (!description) {
    const heading = html.search(/<h1\b/i);
    const articleHtml = heading >= 0 ? html.slice(heading) : html;
    const paragraphs = [...articleHtml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((match) => clean(match[1])).filter((text) => text.length >= 30 && !/^(?:we.re on a journey|subscribe|sign up|discuss and provide feedback|run an?\b|extract text|share your)/i.test(text));
    description = paragraphs.slice(0, 3).join(' ');
  }
  return description.slice(0, 1_200);
};

const feedPath = path.join(root, 'content/feed.json');
const existing = fs.existsSync(feedPath) ? new Set(JSON.parse(fs.readFileSync(feedPath, 'utf8')).items.map((item) => item.canonicalUrl ?? item.url)) : new Set();
const candidates = [];
const failures = [];
const feedStats = [];
const cutoff = Date.now() - 14 * 86_400_000;

for (const feed of feeds) {
  const stats = { sourceId: feed.sourceId, entriesParsed: 0, withinWindow: 0, dedupedExisting: 0, enriched: 0, eligible: 0 };
  try {
    const { html: xml } = await safeFetchXml(feed.url, { maxBytes: 2_000_000, timeoutMs: 20_000, maxRedirects: 3, allowedHosts: feed.allowedHosts });
    const blocks = [...(xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? []), ...(xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [])].slice(0, 20);
    stats.entriesParsed = blocks.length;
    if (!blocks.length) throw new Error('parsed 0 RSS/Atom entries');
    for (const block of blocks) {
      const title = valueOf(block, ['title']);
      let url = valueOf(block, ['link', 'guid']);
      if (!url) url = block.match(/<link[^>]+href=["']([^"']+)/i)?.[1] ?? '';
      url = canonical(url);
      const timestamp = Date.parse(valueOf(block, ['pubDate', 'published', 'updated', 'dc:date']));
      if (!title || !url || !Number.isFinite(timestamp) || timestamp > Date.now() + 300_000 || timestamp < cutoff) continue;
      stats.withinWindow += 1;
      if (existing.has(url)) { stats.dedupedExisting += 1; continue; }
      let evidenceSnippet = valueOf(block, ['description', 'summary', 'content:encoded']);
      if (evidenceSnippet.length < 40) {
        try { evidenceSnippet = await enrichEvidence(url, feed.allowedHosts); if (evidenceSnippet.length >= 40) stats.enriched += 1; }
        catch (error) { failures.push({ feed: feed.url, item: url, error: `enrichment: ${error.message}` }); }
      }
      if (evidenceSnippet.length < 40) continue;
      const author = valueOf(block, ['dc:creator', 'creator', 'author']) || feed.publisher;
      candidates.push({
        id: `candidate_${crypto.createHash('sha256').update(url).digest('hex').slice(0, 24)}`,
        sourceId: feed.sourceId,
        publisher: feed.publisher,
        author,
        independenceKey: feed.academic ? `academic:${author.toLowerCase()}` : `publisher:${feed.publisher.toLowerCase()}`,
        url,
        title,
        publishedAt: new Date(timestamp).toISOString(),
        evidenceSnippet: evidenceSnippet.slice(0, 1_200),
        sourceReliability: feed.reliability,
        originalLanguage: 'en',
      });
      stats.eligible += 1;
    }
  } catch (error) {
    failures.push({ feed: feed.url, error: error.message });
  }
  feedStats.push(stats);
}

const unique = [...new Map(candidates.map((candidate) => [candidate.url, candidate])).values()].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
const successfulFeeds = feedStats.filter((stats) => stats.entriesParsed > 0).length;
if (successfulFeeds < 3) throw new Error(`Fail closed: only ${successfulFeeds} feeds parsed entries; failures=${JSON.stringify(failures)}`);
const checkedAt = new Date().toISOString();
const out = {
  schemaVersion: '1.1.0',
  status: unique.length === 0 ? 'no_change' : 'candidates_ready',
  reason: unique.length === 0 ? 'No genuinely new current candidates after deduplication' : null,
  successfulFeeds,
  checkedAt,
  generatedAt: checkedAt,
  windowDays: 14,
  feedStats,
  failures,
  candidates: unique.slice(0, 40),
};
fs.mkdirSync(path.join(root, 'content/drafts'), { recursive: true });
fs.writeFileSync(path.join(root, 'content/drafts/ingested.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(out.status === 'no_change' ? `No publishable change: ${out.reason}; ${successfulFeeds} feeds parsed successfully.` : `Ingested ${out.candidates.length} current item-level candidates from ${successfulFeeds} parsed feeds; ${feedStats.reduce((sum, stats) => sum + stats.enriched, 0)} enriched article excerpts.`);
console.log(JSON.stringify(feedStats));
