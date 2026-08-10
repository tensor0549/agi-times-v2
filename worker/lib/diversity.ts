import { parseJson } from './http';

type Row = Record<string, unknown>;

/**
 * Builds a diverse leading pool without deleting content. Input must already be
 * sorted by freshness/importance. Deferred rows retain that relative order.
 */
export function orderForProminence(rows: Row[], leadingLimit = 8, maxPerSource = 2, maxPerTopic = 3): Row[] {
  const leading: Row[] = [];
  const deferred: Row[] = [];
  const sources = new Map<string, number>();
  const topics = new Map<string, number>();

  for (const row of rows) {
    const source = String(row.source_id ?? 'unknown');
    const primaryTopic = String(parseJson<unknown[]>(String(row.topics_json ?? '[]'), [])[0] ?? 'uncategorized');
    const eligible = leading.length < leadingLimit && (sources.get(source) ?? 0) < maxPerSource && (topics.get(primaryTopic) ?? 0) < maxPerTopic;
    if (eligible) {
      leading.push(row);
      sources.set(source, (sources.get(source) ?? 0) + 1);
      topics.set(primaryTopic, (topics.get(primaryTopic) ?? 0) + 1);
    } else deferred.push(row);
  }
  return [...leading, ...deferred];
}

export function parseOffsetCursor(cursor: string | undefined): number | null {
  if (!cursor?.startsWith('o:')) return null;
  const offset = Number.parseInt(cursor.slice(2), 10);
  return Number.isSafeInteger(offset) && offset >= 0 ? offset : null;
}
