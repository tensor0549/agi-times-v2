export function feedbackConfig() {
  const required = ['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID'];
  for (const name of required) if (!process.env[name]) throw new Error(`${name} is required`);
  return { databaseId: process.env.D1_DATABASE_ID || '6920c1d6-01bf-4ed5-b263-62c81f65fcba' };
}

export async function d1(sql, params = []) {
  const { databaseId } = feedbackConfig();
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${databaseId}/query`, {
    method: 'POST', headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ sql, params }),
  });
  if (!response.ok) throw new Error(`D1 request failed: ${response.status}`);
  const payload = await response.json();
  if (!payload.success || payload.result?.some((result) => !result.success)) throw new Error('D1 query failed');
  return payload.result?.[0]?.results ?? [];
}

export function boundedBatch(raw, fallback = 20, maximum = 50) {
  const value = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(value) ? Math.min(maximum, Math.max(1, value)) : fallback;
}
