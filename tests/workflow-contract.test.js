import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const publisher = fs.readFileSync('.github/workflows/content-refresh.yml', 'utf8');
const deploy = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');

describe('single-owner atomic content deployment workflow', () => {
  it('shares production concurrency and skips bot commits in the general deploy workflow', () => {
    expect(publisher).toMatch(/group: production/);
    expect(deploy).toMatch(/group: production/);
    expect(deploy).toContain("github.event.head_commit.author.name != 'agi-times-publisher[bot]'");
  });

  it('guards expanded ingestion and runs config, health, ingest, classify, acceptance, then exact health sync before writer input', () => {
    expect(publisher).toContain('expanded_sources:');
    expect(publisher).toContain('publish_expanded:');
    expect(publisher).toContain("default: false");
    expect(publisher).toContain("vars.EXPANDED_INGESTION_ENABLED == 'true'");
    expect(publisher).toContain("vars.EXPANDED_PUBLICATION_ENABLED == 'true'");
    expect(publisher).toContain("OPENROUTER_CLASSIFIER_MODEL: ${{ vars.OPENROUTER_CLASSIFIER_MODEL || 'openai/gpt-4.1-mini' }}");
    const configIndex = publisher.indexOf('content:config-validate');
    const fetchHealthIndex = publisher.indexOf('source-health:fetch:remote');
    const ingestIndex = publisher.indexOf('content:ingest:expanded');
    const classifyIndex = publisher.indexOf('content:classify');
    const acceptIndex = publisher.indexOf('content:ingest:accept');
    const syncHealthIndex = publisher.indexOf('source-health:sync:remote');
    const summaryIndex = publisher.indexOf('summarize-expanded-ingestion.mjs');
    const countIndex = publisher.indexOf('Count genuinely unseen candidates');
    expect([configIndex, fetchHealthIndex, ingestIndex, classifyIndex, acceptIndex, syncHealthIndex, summaryIndex, countIndex].every((index) => index > 0)).toBe(true);
    expect(configIndex).toBeLessThan(fetchHealthIndex);
    expect(fetchHealthIndex).toBeLessThan(ingestIndex);
    expect(ingestIndex).toBeLessThan(classifyIndex);
    expect(classifyIndex).toBeLessThan(acceptIndex);
    expect(acceptIndex).toBeLessThan(syncHealthIndex);
    expect(syncHealthIndex).toBeLessThan(summaryIndex);
    expect(summaryIndex).toBeLessThan(countIndex);
    expect(publisher).toContain("if: env.EXPANDED_INGESTION != 'true' || env.EXPANDED_PUBLICATION == 'true'\n        id: candidates");
    const publicationGuard = "(env.EXPANDED_INGESTION != 'true' || env.EXPANDED_PUBLICATION == 'true')";
    expect(publisher).toContain(`steps.candidates.outputs.publish == 'true' && ${publicationGuard}`);
    for (const step of ['Generate bilingual current content', 'Reject non-incremental, duplicate, unsupported, or unnatural output', 'Run reproducible publication gates', 'Audit generated diff']) {
      const index = publisher.indexOf(`- name: ${step}`);
      expect(publisher.slice(index, index + 300)).toContain(publicationGuard);
    }
    for (const step of ['Verify existing daily Insight on a no-op run', 'Production health check']) {
      const index = publisher.indexOf(`- name: ${step}`);
      expect(publisher.slice(index, index + 260)).toContain(publicationGuard);
    }
  });

  it('deploys and verifies static content before D1 sync without running migrations', () => {
    const deployIndex = publisher.indexOf('npx wrangler deploy');
    const staticIndex = publisher.indexOf('verify-production-content.mjs --static');
    const syncIndex = publisher.indexOf('content:sync:remote');
    const allIndex = publisher.lastIndexOf('verify-production-content.mjs');
    expect(deployIndex).toBeGreaterThan(0);
    expect(staticIndex).toBeGreaterThan(deployIndex);
    expect(syncIndex).toBeGreaterThan(staticIndex);
    expect(allIndex).toBeGreaterThan(syncIndex);
    expect(publisher).not.toContain('d1 migrations apply');
  });
});
