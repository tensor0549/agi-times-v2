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
