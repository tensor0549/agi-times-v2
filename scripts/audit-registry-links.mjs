import fs from 'node:fs';

const registry = JSON.parse(fs.readFileSync('content/registry.json', 'utf8'));
const concurrency = Math.max(1, Math.min(32, Number(process.env.REGISTRY_AUDIT_CONCURRENCY) || 12));
const timeout = Math.max(2_000, Number(process.env.REGISTRY_AUDIT_TIMEOUT_MS) || 12_000);
const allowBlocked = new Set([401, 403, 429, 999]);
const results = [];
let cursor = 0;

const soft404 = (url, title) => /\/(?:page-not-found|404)(?:[/?#]|$)/i.test(url) || /^(?:404\b|page not found\b|not found\b)|\b404\b.*\bnot found\b/i.test(title);
const titleOf = (html) => (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

async function inspect(source) {
  try {
    const response = await fetch(source.url, {
      redirect: 'follow',
      headers: { 'user-agent': 'AGITimesBot/1.0 registry-health', range: 'bytes=0-65535' },
      signal: AbortSignal.timeout(timeout),
    });
    const title = titleOf((await response.text()).slice(0, 65_536));
    const problem = response.status >= 400 && !allowBlocked.has(response.status)
      ? `HTTP ${response.status}`
      : soft404(response.url, title) ? 'soft-404' : null;
    results.push({ id: source.id, kind: source.kind, active: source.active !== false, url: source.url, finalUrl: response.url, status: response.status, title, problem });
  } catch (error) {
    results.push({ id: source.id, kind: source.kind, active: source.active !== false, url: source.url, status: 0, problem: 'network', error: error.message });
  }
}

async function worker() {
  while (cursor < registry.sources.length) await inspect(registry.sources[cursor++]);
}
await Promise.all(Array.from({ length: concurrency }, worker));
results.sort((a, b) => a.id.localeCompare(b.id));
const definitiveFailures = results.filter((item) => item.active && item.problem && item.problem !== 'network');
const networkUnverified = results.filter((item) => item.active && item.problem === 'network');
const report = { checkedAt: new Date().toISOString(), total: results.length, definitiveFailures: definitiveFailures.length, networkUnverified: networkUnverified.length, failures: definitiveFailures, unverified: networkUnverified, results };
if (process.env.REGISTRY_AUDIT_REPORT) fs.writeFileSync(process.env.REGISTRY_AUDIT_REPORT, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Registry link audit checked ${results.length} sources; ${definitiveFailures.length} definitive failures; ${networkUnverified.length} network-unverified.`);
for (const item of definitiveFailures) console.error(`${item.id}: ${item.problem} ${item.url}${item.finalUrl && item.finalUrl !== item.url ? ` -> ${item.finalUrl}` : ''}`);
for (const item of networkUnverified) console.warn(`${item.id}: network-unverified ${item.url}`);
if (definitiveFailures.length || (process.argv.includes('--strict-network') && networkUnverified.length)) process.exit(1);
