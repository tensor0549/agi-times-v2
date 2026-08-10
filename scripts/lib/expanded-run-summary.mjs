const SAFE_FAILURE_CODE = /^[a-z0-9_]{1,64}$/;

export function buildExpandedRunSummary({ config, ingested, health, now = Date.now() }) {
  const configuredIds = config.sources.filter((source) => source.enabled === true).map((source) => source.id).sort();
  const healthIds = health.sources.map((source) => source.ingestionId).sort();
  const statuses = Object.fromEntries(['healthy', 'degraded', 'failed', 'backoff'].map((status) => [status, health.sources.filter((source) => source.status === status).length]));
  const failureCodes = {};
  for (const failure of ingested.failures ?? []) {
    if (!SAFE_FAILURE_CODE.test(failure.failureCode ?? '')) throw new Error('expanded_failure_code_rejected');
    failureCodes[failure.failureCode] = (failureCodes[failure.failureCode] ?? 0) + 1;
  }
  const maintenanceOnlyCandidates = (ingested.candidates ?? []).filter((candidate) =>
    (candidate.sourceKind === 'github_search_api' && candidate.metrics?.query !== 'new-rising') ||
    (candidate.sourceKind === 'huggingface_models_api' && Date.parse(candidate.publishedAt) < now - Number(ingested.windowDays ?? 14) * 86_400_000)
  ).length;
  const summary = {
    schemaVersion: '1.0.0', checkedAt: ingested.checkedAt,
    configuredEndpoints: configuredIds.length, healthEndpoints: healthIds.length,
    exactEndpointSet: JSON.stringify(configuredIds) === JSON.stringify(healthIds), statuses,
    candidateCounts: ingested.candidateCounts, acceptedCandidates: ingested.candidates?.length ?? 0,
    maintenanceOnlyCandidates, rejectionCount: ingested.classification?.rejected?.length ?? 0, failureCodes,
  };
  if (summary.configuredEndpoints !== 33 || !summary.exactEndpointSet || maintenanceOnlyCandidates !== 0) throw new Error('expanded_evidence_contract_failed');
  return summary;
}
