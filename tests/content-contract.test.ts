import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

type Localized = { en?: string; 'zh-Hans'?: string };
const content = (name: string) => JSON.parse(fs.readFileSync(`content/${name}.json`, 'utf8'));
const bilingual = (value: Localized) => typeof value?.en === 'string' && value.en.length > 0 && typeof value?.['zh-Hans'] === 'string' && value['zh-Hans']!.length > 0;

describe('content contracts', () => {
  it('meets registry coverage floors with unique stable IDs', () => {
    const registry = content('registry');
    const ids = registry.sources.map((source: { id: string }) => source.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(registry.counts.organization).toBeGreaterThanOrEqual(100);
    expect(registry.counts.media).toBeGreaterThanOrEqual(10);
    expect(registry.counts.person).toBeGreaterThanOrEqual(100);
    expect(registry.counts.project).toBeGreaterThanOrEqual(100);
  });

  it('requires canonical BCP47 locales when feed and insights are present', () => {
    for (const name of ['feed', 'insights']) {
      if (!fs.existsSync(`content/${name}.json`)) continue;
      const payload = content(name);
      expect(payload.canonicalLocales).toEqual(expect.arrayContaining(['en', 'zh-Hans']));
      expect(payload.localeAliases?.zh).toBe('zh-Hans');
      for (const item of payload.items) {
        expect(bilingual(item.title)).toBe(true);
        expect(bilingual(name === 'feed' ? item.summary : item.body)).toBe(true);
      }
    }
  });
});
