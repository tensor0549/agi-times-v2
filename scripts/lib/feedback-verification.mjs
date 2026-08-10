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
  if (!path.startsWith('/')||path.startsWith('//')) return { passed:false,error:'unsafe probe path' };
  const status=await dependencies.probe({path,method:row.probe_method==='GET'?'GET':'HEAD'});
  const passed=status>=Number(row.expected_status_min)&&status<=Number(row.expected_status_max);
  return passed?{passed:true,status,deployedSha:row.fix_sha}:{passed:false,status,error:'probe status outside expected range'};
}
