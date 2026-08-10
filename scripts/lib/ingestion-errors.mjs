export function ingestionHttpStatus(error) {
  const match = String(error?.message ?? error).match(/\bHTTP\s+(\d{3})\b/i);
  const status = Number(match?.[1]);
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
}

export function ingestionFailureCode(error) {
  const text = String(error?.message ?? error).toLowerCase();
  const status = ingestionHttpStatus(error);
  if (status === 429) return 'rate_limited';
  if (text.includes('timeout') || text.includes('deadline')) return 'timeout';
  if (status != null || text.includes('http')) return 'http_status';
  if (text.includes('0 rss') || text.includes('parse')) return 'parse_failed';
  if (text.includes('allowlist') || text.includes('hostname') || text.includes('globally routable')) return 'host_rejected';
  if (text.includes('rate')) return 'rate_limited';
  return 'fetch_failed';
}
