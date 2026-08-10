import { utcTimestamp } from './http';

type HealthRow = Record<string, unknown> | null;
export function sourceHealthSummary(row: HealthRow) {
  const total=Number(row?.total ?? 0);
  return {
    status: total === 0 ? 'pending' : Number(row?.failed ?? 0)>0 || Number(row?.stale ?? 0)>0 ? 'degraded' : 'healthy',
    configured: total,
    feeds: Number(row?.feeds ?? 0), apis: Number(row?.apis ?? 0),
    healthy: Number(row?.healthy ?? 0), degraded: Number(row?.degraded ?? 0), failed: Number(row?.failed ?? 0), backoff: Number(row?.backoff ?? 0), stale: Number(row?.stale ?? 0),
    latestItemAt: utcTimestamp(row?.latest_item_at), lastSuccessAt: utcTimestamp(row?.last_success_at), lastAttemptAt: utcTimestamp(row?.last_attempt_at),
  };
}
export const sourceHealthSql=`SELECT COUNT(*) AS total,
  SUM(CASE WHEN source_type='feed' THEN 1 ELSE 0 END) AS feeds,
  SUM(CASE WHEN source_type='api' THEN 1 ELSE 0 END) AS apis,
  SUM(CASE WHEN last_status='healthy' THEN 1 ELSE 0 END) AS healthy,
  SUM(CASE WHEN last_status='degraded' THEN 1 ELSE 0 END) AS degraded,
  SUM(CASE WHEN last_status='failed' THEN 1 ELSE 0 END) AS failed,
  SUM(CASE WHEN last_status='backoff' THEN 1 ELSE 0 END) AS backoff,
  SUM(CASE WHEN last_success_at IS NULL OR last_success_at < datetime('now','-6 hours') THEN 1 ELSE 0 END) AS stale,
  MAX(latest_item_at) AS latest_item_at, MAX(last_success_at) AS last_success_at, MAX(last_attempt_at) AS last_attempt_at
  FROM source_ingestion_health WHERE enabled=1`;
