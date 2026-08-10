const exactKeys = (value, keys, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort(), expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} has unexpected or missing fields: ${actual.join(',')}`);
};

export function validateReviewerVerdict(verdict, expectedIds) {
  exactKeys(verdict, ['verdict', 'checks'], 'review verdict');
  if (!['pass', 'fail'].includes(verdict.verdict) || !Array.isArray(verdict.checks) || verdict.checks.length !== expectedIds.size) throw new Error('review verdict has invalid types or check count');
  for (const [index, check] of verdict.checks.entries()) {
    exactKeys(check, ['id', 'supported', 'agiRelevant', 'englishNatural', 'chineseNatural', 'reason'], `review check ${index}`);
    if (typeof check.id !== 'string' || typeof check.reason !== 'string' || ['supported', 'agiRelevant', 'englishNatural', 'chineseNatural'].some((key) => typeof check[key] !== 'boolean')) throw new Error(`review check ${index} has invalid field types`);
    if (!expectedIds.has(check.id)) throw new Error(`review check ${index} has unexpected ID ${check.id}`);
  }
  if (new Set(verdict.checks.map((check) => check.id)).size !== expectedIds.size) throw new Error('review checks contain duplicate or missing IDs');
  return verdict;
}
