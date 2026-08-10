import { registeredProbeForRequest } from './feedback-classification.mjs';

export function isCanonicalDeploy(run, fixSha) {
  return run?.head_sha === fixSha && run?.event === 'push' && run?.head_branch === 'main' && run?.conclusion === 'success' && run?.path === '.github/workflows/deploy.yml';
}

export function selectCanonicalDeploy(runs, fixSha) { return (runs ?? []).find((run) => isCanonicalDeploy(run,fixSha)) ?? null; }

export function canTransition(current, action) {
  if (action === 'claim') return current.status === 'new';
  if (action === 'configure-probe') return current.status === 'reviewing';
  if (action === 'resolve') return current.status === 'reviewing' && Boolean(current.verified_at) && Boolean(current.deployed_sha) && current.deployed_sha === current.fix_sha;
  if (action === 'non-actionable') return ['new','reviewing'].includes(current.status);
  return false;
}

export async function verifyCandidate(row, dependencies) {
  const runs = await dependencies.listDeployRuns(row.fix_sha);
  const deploy = selectCanonicalDeploy(runs,row.fix_sha);
  if (!deploy) return { passed:false,error:'canonical successful production deploy not found' };
  const path=String(row.probe_path??'');
  const method=['GET','HEAD'].includes(row.probe_method) ? row.probe_method : null;
  if (!method) return { passed:false,error:'unregistered probe' };
  const registered=registeredProbeForRequest(path,method);
  if (!registered) return { passed:false,error:'unregistered probe' };
  const probe=registered[1];
  if (Number(row.expected_status_min)!==probe.min || Number(row.expected_status_max)!==probe.max) return { passed:false,error:'probe expectation mismatch' };
  const status=await dependencies.probe({path:probe.path,method:probe.method});
  const passed=status>=probe.min&&status<=probe.max;
  return passed?{passed:true,status,deployedSha:row.fix_sha}:{passed:false,status,error:'probe status outside expected range'};
}
