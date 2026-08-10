import { severityFor } from './lib/feedback-redaction.mjs';

const required = ['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID'];
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required`);
const databaseId = process.env.D1_DATABASE_ID || '6920c1d6-01bf-4ed5-b263-62c81f65fcba';
const cfHeaders = { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' };

async function d1(sql, params = []) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${databaseId}/query`, { method: 'POST', headers: cfHeaders, body: JSON.stringify({ sql, params }) });
  if (!response.ok) throw new Error(`D1 request failed: ${response.status}`);
  const payload = await response.json();
  if (!payload.success || payload.result?.some((result) => !result.success)) throw new Error(`D1 query failed: ${JSON.stringify(payload.errors ?? payload.result?.flatMap((x) => x.error ?? []))}`);
  return payload.result?.[0]?.results ?? [];
}

const feedback = await d1(`SELECT id,rating,created_at FROM feedback WHERE status='new' ORDER BY created_at ASC LIMIT 50`);
const handedOff = [];
for (const item of feedback) {
  const severity = severityFor(item);
  // The normalized handoff is durable and contains no user-authored content.
  await d1(`INSERT OR IGNORE INTO feedback_handoffs(feedback_id,category,severity,status) VALUES(?,'general-feedback',?,'new')`, [item.id, severity]);
  const result = await d1(`UPDATE feedback SET status='reviewing', context_json=json_set(context_json,'$.triageStore','d1:feedback_handoffs','$.triagedAt',?) WHERE id=? AND status='new' AND EXISTS(SELECT 1 FROM feedback_handoffs WHERE feedback_id=?) RETURNING id`, [new Date().toISOString(), item.id, item.id]);
  if (result.length) handedOff.push(item.id);
}
// Public Actions logs expose only aggregate counts and opaque record IDs.
console.log(JSON.stringify({ event: 'feedback_triage_complete', found: feedback.length, handedOff: handedOff.length, opaqueIds: handedOff }));
