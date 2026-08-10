const HOUR_MS = 3_600_000;

export function recencyTimestamp(record) {
  const activityAt = Date.parse(record?.activityAt);
  if (Number.isFinite(activityAt)) return activityAt;
  return Date.parse(record?.publishedAt);
}

export function compareByRecency(a, b) {
  const difference = recencyTimestamp(b) - recencyTimestamp(a);
  if (Number.isFinite(difference) && difference !== 0) return difference;
  return Number(b?.sourcePriority ?? 0) - Number(a?.sourcePriority ?? 0);
}

export function freshnessScore(record, now = Date.now(), halfLifeHours = 72) {
  const timestamp = recencyTimestamp(record);
  if (!Number.isFinite(timestamp)) return 0;
  return Math.round(100 * Math.exp(-Math.log(2) * (now - timestamp) / HOUR_MS / halfLifeHours));
}
