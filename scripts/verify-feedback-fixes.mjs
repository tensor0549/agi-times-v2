import { publicLog } from './lib/feedback-classification.mjs';
import { boundedBatch, d1 } from './lib/d1-feedback.mjs';

if (process.env.FEEDBACK_VERIFY_ENABLED === 'false') { console.log(JSON.stringify(publicLog('feedback_verify_disabled', []))); process.exit(0); }
if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY) throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required');
const limit = boundedBatch(process.env.FEEDBACK_VERIFY_BATCH, 10, 25);
const rows = await d1(`SELECT feedback_id,probe_method,probe_path,expected_status_min,expected_status_max,fix_sha FROM feedback_handoffs
  WHERE status='reviewing' AND verification_ready=1 AND fix_sha IS NOT NULL AND probe_path IS NOT NULL ORDER BY updated_at ASC LIMIT ?`, [limit]);
const verified = [];
for (const row of rows) {
  try {
    const url = new URL(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/actions/runs`);
    url.searchParams.set('head_sha',row.fix_sha); url.searchParams.set('status','success'); url.searchParams.set('per_page','20');
    const runsResponse = await fetch(url,{headers:{authorization:`Bearer ${process.env.GITHUB_TOKEN}`,accept:'application/vnd.github+json','user-agent':'agi-times-feedback-verifier'}});
    if (!runsResponse.ok) throw new Error(`deploy lookup ${runsResponse.status}`);
    const runs = (await runsResponse.json()).workflow_runs ?? [];
    const deploy = runs.find((run) => run.name === 'Deploy production' && run.conclusion === 'success');
    if (!deploy) { await d1(`UPDATE feedback_handoffs SET attempt_count=attempt_count+1,last_error='successful production deploy not found',updated_at=CURRENT_TIMESTAMP WHERE feedback_id=?`,[row.feedback_id]); continue; }
    const path = String(row.probe_path);
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('unsafe probe path');
    const response = await fetch(`https://agitime.ai${path}`,{method:row.probe_method === 'GET' ? 'GET' : 'HEAD',redirect:'manual',signal:AbortSignal.timeout(15000)});
    const passed = response.status >= Number(row.expected_status_min) && response.status <= Number(row.expected_status_max);
    if (!passed) { await d1(`UPDATE feedback_handoffs SET attempt_count=attempt_count+1,last_probe_status=?,last_error='probe status outside expected range',updated_at=CURRENT_TIMESTAMP WHERE feedback_id=?`,[response.status,row.feedback_id]); continue; }
    const changed = await d1(`UPDATE feedback_handoffs SET deployed_sha=?,verified_at=CURRENT_TIMESTAMP,last_probe_status=?,last_error=NULL,attempt_count=attempt_count+1,updated_at=CURRENT_TIMESTAMP WHERE feedback_id=? AND status='reviewing' RETURNING feedback_id`,[row.fix_sha,response.status,row.feedback_id]);
    if (changed.length) verified.push(row.feedback_id);
  } catch (error) {
    await d1(`UPDATE feedback_handoffs SET attempt_count=attempt_count+1,last_error=?,updated_at=CURRENT_TIMESTAMP WHERE feedback_id=?`,[error instanceof Error ? error.message.slice(0,300) : 'unknown verifier error',row.feedback_id]);
  }
}
console.log(JSON.stringify(publicLog('feedback_verify_complete',verified)));
