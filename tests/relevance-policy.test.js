import { describe, expect, it } from 'vitest';
import { isExcludedAcademicVertical } from '../scripts/lib/relevance-policy.mjs';

describe('deterministic academic vertical exclusions', () => {
  it.each(['degree pathway planning', 'generic community detection', 'molecular dynamics for polymers', 'clinical patient diagnosis', 'financial trading portfolio optimization', 'vehicle routing in supply chains', 'AI tutoring for students', 'spatial transcriptomics'])('excludes narrow vertical: %s', (text) => expect(isExcludedAcademicVertical(text)).toBe(true));
  it.each(['tokenizer-free mixture-of-experts architecture', 'general agent evaluation framework', 'inference-time safety classifier', 'world model attention mechanism'])('retains transferable core research: %s', (text) => expect(isExcludedAcademicVertical(text)).toBe(false));
});
