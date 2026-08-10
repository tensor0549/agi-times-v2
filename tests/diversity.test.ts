import { describe, expect, it } from 'vitest';
import { orderForProminence, parseOffsetCursor } from '../worker/lib/diversity';

const row = (id: string, source: string, topic: string) => ({ id, source_id: source, topics_json: JSON.stringify([topic]) });

describe('feed prominence ordering', () => {
  it('builds a capped leading set then appends every deferred row in original order', () => {
    const input = [
      row('a1','a','agents'), row('a2','a','agents'), row('a3','a','agents'),
      row('b1','b','agents'), row('c1','c','agents'), row('d1','d','models'),
      row('e1','e','safety'), row('f1','f','research'), row('g1','g','policy'), row('h1','h','models'),
    ];
    const output = orderForProminence(input);
    const leading = output.slice(0, 8);
    const sourceCounts = leading.reduce<Record<string,number>>((acc, item) => ({ ...acc, [String(item.source_id)]: (acc[String(item.source_id)] ?? 0) + 1 }), {});
    const topicCounts = leading.reduce<Record<string,number>>((acc, item) => { const topic=JSON.parse(String(item.topics_json))[0]; return { ...acc, [topic]: (acc[topic] ?? 0) + 1 }; }, {});
    expect(Math.max(...Object.values(sourceCounts))).toBeLessThanOrEqual(2);
    expect(Math.max(...Object.values(topicCounts))).toBeLessThanOrEqual(3);
    expect(new Set(output.map((item) => item.id))).toEqual(new Set(input.map((item) => item.id)));
    expect(output.slice(8).map((item) => item.id)).toEqual(['a3','c1']);
  });
  it('parses only bounded offset cursors', () => {
    expect(parseOffsetCursor('o:24')).toBe(24);
    expect(parseOffsetCursor('o:-1')).toBeNull();
    expect(parseOffsetCursor('2026-08-10T00:00:00Z')).toBeNull();
  });
});
