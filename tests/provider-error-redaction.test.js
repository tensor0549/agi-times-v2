import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const providerScripts = [
  'scripts/classify-ingested-candidates.mjs',
  'scripts/generate-current-content.mjs',
  'scripts/verify-incremental-publication.mjs',
];

describe('provider failure redaction', () => {
  it.each(providerScripts)('%s never includes a raw provider response body in thrown errors', (file) => {
    const source = fs.readFileSync(file, 'utf8');
    expect(source).not.toMatch(/await\s+(?:response|res)\.text\s*\(\s*\)/);
    expect(source).toMatch(/request failed with status/);
  });
});
