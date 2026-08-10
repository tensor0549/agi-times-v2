import { describe, expect, it } from 'vitest';
import { verifyIncrementalUpdate } from '../scripts/lib/publisher-gate.mjs';

const now = Date.parse('2026-08-10T12:00:00Z');
const localized = (en, zh) => ({ en, 'zh-Hans': zh });
const feedItem = (id, url, evidence) => ({
  id, url, canonicalUrl: url, publishedAt: '2026-08-10T08:00:00Z', discoveredAt: '2026-08-10T09:00:00Z', updatedAt: '2026-08-10T08:00:00Z',
  title: localized(`Current source title ${id}`, `当前来源标题 ${id}`), summary: localized(`A supported summary for ${id} with concrete details.`, `这是 ${id} 的有来源支持的具体摘要。`),
  citations: [{ url, evidenceSnippet: evidence }],
});
const first = feedItem('new-1', 'https://example.com/articles/one', 'The system improved accuracy by 20% in the published evaluation.');
const second = feedItem('new-2', 'https://example.org/research/two', 'A second publisher reported an independent deployment result.');
const insight = {
  id: 'insight-20260810', publishedAt: '2026-08-10T10:00:00Z', updatedAt: '2026-08-10T10:00:00Z',
  title: localized('Two current signals point in the same direction', '两个最新信号指向同一方向'), dek: localized('A concise evidence-based synthesis.', '一份基于证据的简明综合分析。'),
  body: localized('The evaluation reported a 20% improvement.[^candidate-1] A separate publisher supplied an independent signal.[^candidate-2]', '该评测报告提升了 20%。[^candidate-1] 另一家发布方提供了独立信号。[^candidate-2]'),
  topics: ['research_science'],
  claims: [
    { id: 'claim-1', type: 'fact', text: localized('The evaluation reported a 20% improvement.', '该评测报告提升了 20%。'), citationIds: ['candidate-1'] },
    { id: 'claim-2', type: 'inference', text: localized('The sources form two independent signals.', '这些来源构成两个独立信号。'), citationIds: ['candidate-1', 'candidate-2'] },
  ],
  sources: [
    { id: 'candidate-1', feedItemId: 'new-1', url: first.url, evidenceSnippet: first.citations[0].evidenceSnippet },
    { id: 'candidate-2', feedItemId: 'new-2', url: second.url, evidenceSnippet: second.citations[0].evidenceSnippet },
  ],
};

describe('incremental publisher gate', () => {
  it('accepts new, current, cited content without mutating history', () => {
    const result = verifyIncrementalUpdate({ baseFeed: { items: [] }, feed: { items: [first, second] }, baseInsights: { items: [] }, insights: { items: [insight] }, now });
    expect(result.newFeed.map((item) => item.id)).toEqual(['new-1', 'new-2']);
  });

  it('allows a feed-only hourly update when the daily Insight already exists', () => {
    const result = verifyIncrementalUpdate({ baseFeed: { items: [] }, feed: { items: [first] }, baseInsights: { items: [insight] }, insights: { items: [insight] }, now, requireInsight: false });
    expect(result.newFeed).toHaveLength(1);
    expect(result.changedInsights).toHaveLength(0);
  });

  it('rejects a feed-only update when the daily Insight is required', () => {
    expect(() => verifyIncrementalUpdate({ baseFeed: { items: [] }, feed: { items: [first] }, baseInsights: { items: [] }, insights: { items: [] }, now, requireInsight: true })).toThrow(/daily publication requires/);
  });

  it('rejects timestamp-only Insight freshness', () => {
    const retimestamped = { ...insight, publishedAt: '2026-08-10T11:00:00Z', updatedAt: '2026-08-10T11:00:00Z' };
    expect(() => verifyIncrementalUpdate({ baseFeed: { items: [] }, feed: { items: [first, second] }, baseInsights: { items: [insight] }, insights: { items: [retimestamped] }, now })).toThrow(/timestamps changed without an editorial change/);
  });

  it('rejects citations that do not resolve to a published feed item', () => {
    const broken = { ...insight, sources: insight.sources.map((source, index) => index ? source : { ...source, feedItemId: null }) };
    expect(() => verifyIncrementalUpdate({ baseFeed: { items: [] }, feed: { items: [first, second] }, baseInsights: { items: [] }, insights: { items: [broken] }, now })).toThrow(/citation must resolve/);
  });
});
