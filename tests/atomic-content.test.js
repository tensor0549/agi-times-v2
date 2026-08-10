import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { restoreContentSnapshot } from '../scripts/lib/atomic-content.mjs';

let directory;
afterEach(() => directory && fs.rmSync(directory, { recursive: true, force: true }));

describe('atomic reviewer rollback', () => {
  it('restores feed and Insight exact bytes together after mixed candidate mutation', () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-atomic-'));
    const feed = path.join(directory, 'feed.json'), insights = path.join(directory, 'insights.json');
    const baseFeed = Buffer.from('{"feed":"base"}\n'), baseInsights = Buffer.from('{"insights":"base"}\n');
    fs.writeFileSync(feed, '{"feed":"candidate"}\n');
    fs.writeFileSync(insights, '{"insights":"candidate"}\n');
    restoreContentSnapshot({ [feed]: baseFeed, [insights]: baseInsights });
    expect(fs.readFileSync(feed).equals(baseFeed)).toBe(true);
    expect(fs.readFileSync(insights).equals(baseInsights)).toBe(true);
  });

  it('removes candidate files when the base snapshot had no file', () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-atomic-'));
    const feed = path.join(directory, 'feed.json');
    fs.writeFileSync(feed, 'candidate');
    restoreContentSnapshot({ [feed]: null });
    expect(fs.existsSync(feed)).toBe(false);
  });
});
