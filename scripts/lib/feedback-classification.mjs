import crypto from 'node:crypto';

const patterns = {
  error: [/\b(?:error|crash|broken|bug|fail(?:ed|ure)?|not work(?:ing)?)\b/i, /(?:错误|崩溃|坏了|无法|不能|失效)/],
  content: [/\b(?:source|citation|article|translation|incorrect|outdated|missing)\b/i, /(?:来源|引用|文章|翻译|不正确|过时|遗漏)/],
};

export function probePath(pageUrl) {
  try {
    const url = new URL(String(pageUrl));
    if (!['agitime.ai','www.agitime.ai'].includes(url.hostname)) return '/';
    return url.pathname.slice(0, 1000);
  } catch { return '/'; }
}

export function classifyFeedback(feedback) {
  const message = String(feedback.message ?? '');
  const matches = Object.entries(patterns).filter(([, expressions]) => expressions.some((expression) => expression.test(message))).map(([name]) => name);
  const category = matches.includes('error') ? 'bug' : matches.includes('content') ? 'content-quality' : 'general-feedback';
  const severity = feedback.rating != null && Number(feedback.rating) <= 2 ? 'high' : 'normal';
  const path = probePath(feedback.page_url);
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ message: message.trim().toLowerCase(), path, contentId: feedback.content_id ?? null })).digest('hex');
  return {
    fingerprint, category, severity, probeMethod: path.startsWith('/api/') ? 'GET' : 'HEAD', probePath: path,
    diagnosis: { classifier: 'deterministic-v1', category, severity, keywordClasses: matches, locale: feedback.locale ?? 'unknown', contentIdPresent: Boolean(feedback.content_id), messageLength: message.length },
  };
}

export function publicLog(event, ids) { return { event, count: ids.length, opaqueIds: ids }; }
