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

export function severityFor(feedback) {
  if (feedback.rating != null && Number(feedback.rating) <= 2) return 'high';
  return 'normal';
}

// First-stage handoff is intentionally opaque. No user-authored text, contact
// details, URLs, or browser context leave D1 before a separate review gate.
export function handoffRecord(feedback) {
  return { feedbackId: String(feedback.id), category: 'general-feedback', severity: severityFor(feedback) };
}
