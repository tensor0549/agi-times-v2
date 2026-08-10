import { describe, expect, it } from 'vitest';
import { validateReviewerVerdict } from '../scripts/lib/reviewer-schema.mjs';

const check = { id: 'item-1', supported: true, agiRelevant: true, englishNatural: true, chineseNatural: true, reason: 'Supported and natural.' };

describe('independent reviewer response contract', () => {
  it('accepts only exact typed checks for every expected ID', () => {
    expect(validateReviewerVerdict({ verdict: 'pass', checks: [check] }, new Set(['item-1']))).toBeTruthy();
  });

  it('rejects truthy strings, extra fields, missing IDs, and duplicate IDs', () => {
    expect(() => validateReviewerVerdict({ verdict: 'pass', checks: [{ ...check, supported: 'false' }] }, new Set(['item-1']))).toThrow(/invalid field types/);
    expect(() => validateReviewerVerdict({ verdict: 'pass', checks: [{ ...check, extra: true }] }, new Set(['item-1']))).toThrow(/unexpected or missing fields/);
    expect(() => validateReviewerVerdict({ verdict: 'pass', checks: [{ ...check, id: 'wrong' }] }, new Set(['item-1']))).toThrow(/unexpected ID/);
    expect(() => validateReviewerVerdict({ verdict: 'pass', checks: [check, check] }, new Set(['item-1', 'item-2']))).toThrow(/duplicate or missing/);
  });
});
