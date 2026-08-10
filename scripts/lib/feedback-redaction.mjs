const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE = /(?<!\w)(?:\+?\d[\d .()-]{7,}\d)(?!\w)/g;
const SECRET = /\b(?:sk|ghp|github_pat|phc|Bearer)[-_ A-Za-z0-9]{12,}\b/gi;

export function redactText(value, maxLength = 1800) {
  if (typeof value !== 'string') return '';
  return value.slice(0, maxLength).replace(EMAIL, '[email redacted]').replace(PHONE, '[phone redacted]').replace(SECRET, '[secret redacted]');
}

export function safePageUrl(value) {
  try { const url = new URL(String(value)); return `${url.origin}${url.pathname}`.slice(0, 500); }
  catch { return '[invalid page URL]'; }
}

export function safeContext(value) {
  let input = {};
  try { input = typeof value === 'string' ? JSON.parse(value) : value ?? {}; } catch { return {}; }
  const allowed = ['theme','viewport','language','locale','content_id','commit','verification'];
  return Object.fromEntries(allowed.filter((key) => ['string','number','boolean'].includes(typeof input[key])).map((key) => [key, redactText(String(input[key]), 200)]));
}

export function issueBody(feedback) {
  const context = safeContext(feedback.context_json);
  return [
    '## Redacted user feedback',
    '',
    `- Rating: ${feedback.rating ?? 'not provided'}`,
    `- Locale: ${feedback.locale ?? 'unknown'}`,
    `- Page: ${safePageUrl(feedback.page_url)}`,
    `- Created: ${feedback.created_at}`,
    '',
    '### Message (PII-redacted)',
    redactText(feedback.message) || '_No text message._',
    '',
    '### Safe context',
    '```json', JSON.stringify(context, null, 2), '```',
    '',
    `<!-- feedback-id:${feedback.id} -->`,
    '',
    '> Raw feedback and optional contact details remain only in D1 under the retention policy. Do not paste them into this issue.',
  ].join('\n');
}
