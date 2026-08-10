import { issueBody, redactText } from './lib/feedback-redaction.mjs';

const required = ['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','GITHUB_TOKEN','GITHUB_REPOSITORY'];
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required`);
const databaseId = process.env.D1_DATABASE_ID || '6920c1d6-01bf-4ed5-b263-62c81f65fcba';
const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
const cfHeaders = { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' };
const ghHeaders = { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'user-agent': 'agi-times-feedback-triage', 'x-github-api-version': '2022-11-28' };

async function d1(sql, params = []) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${databaseId}/query`, { method: 'POST', headers: cfHeaders, body: JSON.stringify({ sql, params }) });
  if (!response.ok) throw new Error(`D1 request failed: ${response.status}`);
  const payload = await response.json();
  if (!payload.success || payload.result?.some((result) => !result.success)) throw new Error(`D1 query failed: ${JSON.stringify(payload.errors ?? payload.result?.flatMap((x) => x.error ?? []))}`);
  return payload.result?.[0]?.results ?? [];
}

async function github(path, init = {}) {
  const response = await fetch(`https://api.github.com${path}`, { ...init, headers: ghHeaders });
  if (!response.ok) throw new Error(`GitHub ${path} failed: ${response.status} ${(await response.text()).slice(0,300)}`);
  return response.status === 204 ? null : response.json();
}

async function ensureLabel() {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/labels/user-feedback`, { headers: ghHeaders });
  if (response.ok) return true;
  if (response.status === 404) {
    const created = await fetch(`https://api.github.com/repos/${owner}/${repo}/labels`, { method: 'POST', headers: ghHeaders, body: JSON.stringify({ name: 'user-feedback', color: '6f42c1', description: 'PII-redacted user feedback triage' }) });
    if (created.ok) return true;
    if (created.status !== 403) throw new Error(`Unable to create feedback label: ${created.status}`);
  } else if (response.status !== 403) throw new Error(`Unable to verify feedback label: ${response.status}`);
  console.warn('Feedback label unavailable to this token; continuing with marker-based idempotency.');
  return false;
}

async function existingIssue(id, hasLabel) {
  const query = hasLabel ? 'state=all&labels=user-feedback&per_page=100' : 'state=all&per_page=100';
  const issues = await github(`/repos/${owner}/${repo}/issues?${query}`);
  return issues.find((issue) => String(issue.body ?? '').includes(`feedback-id:${id}`));
}

const hasLabel = await ensureLabel();
const feedback = await d1(`SELECT id,rating,message,locale,page_url,content_id,context_json,created_at FROM feedback WHERE status='new' ORDER BY created_at ASC LIMIT 20`);
let handedOff = 0;
for (const item of feedback) {
  let issue = await existingIssue(item.id, hasLabel);
  if (!issue) issue = await github(`/repos/${owner}/${repo}/issues`, { method: 'POST', body: JSON.stringify({ title: `[Feedback] ${redactText(item.message, 72) || `Rating ${item.rating ?? 'n/a'}`} · ${item.id.slice(0,8)}`, body: issueBody(item), ...(hasLabel ? { labels: ['user-feedback'] } : {}) }) });
  const triagedAt = new Date().toISOString();
  const result = await d1(`UPDATE feedback SET status='reviewing', context_json=json_set(context_json,'$.triageIssueNumber',?,'$.triageIssueUrl',?,'$.triagedAt',?) WHERE id=? AND status='new' RETURNING id`, [issue.number, issue.html_url, triagedAt, item.id]);
  if (result.length) handedOff += 1;
}
console.log(JSON.stringify({ event: 'feedback_triage_complete', found: feedback.length, handedOff }));
