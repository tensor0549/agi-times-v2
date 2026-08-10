import { publicLog } from './lib/feedback-classification.mjs';
import { boundedBatch, d1 } from './lib/d1-feedback.mjs';
import { verifyCandidate } from './lib/feedback-verification.mjs';

if (process.env.FEEDBACK_VERIFY_ENABLED === 'false') { console.log(JSON.stringify(publicLog('feedback_verify_disabled', []))); process.exit(0); }
if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY) throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required');
const limit=boundedBatch(process.env.FEEDBACK_VERIFY_BATCH,10,25);
const rows=await d1(`SELECT feedback_id,probe_method,probe_path,expected_status_min,expected_status_max,fix_sha FROM feedback_handoffs WHERE status='reviewing' AND verification_ready=1 AND fix_sha IS NOT NULL AND probe_path IS NOT NULL ORDER BY updated_at ASC LIMIT ?`,[limit]);
const verified=[];
const dependencies={
  listDeployRuns:async(fixSha)=>{
    const url=new URL(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/actions/workflows/deploy.yml/runs`);
    url.searchParams.set('head_sha',fixSha); url.searchParams.set('event','push'); url.searchParams.set('branch','main'); url.searchParams.set('status','success'); url.searchParams.set('per_page','20');
    const response=await fetch(url,{headers:{authorization:`Bearer ${process.env.GITHUB_TOKEN}`,accept:'application/vnd.github+json','user-agent':'agi-times-feedback-verifier'}});
    if(!response.ok) throw new Error(`canonical deploy lookup ${response.status}`); return (await response.json()).workflow_runs??[];
  },
  probe:async({path,method})=>{const response=await fetch(`https://agitime.ai${path}`,{method,redirect:'manual',signal:AbortSignal.timeout(15000)});return response.status;},
};
const configWhere=`feedback_id=? AND status='reviewing' AND verification_ready=1 AND fix_sha=? AND probe_method IS ? AND probe_path=? AND expected_status_min=? AND expected_status_max=?`;
const configParams=(row)=>[row.feedback_id,row.fix_sha,row.probe_method,row.probe_path,row.expected_status_min,row.expected_status_max];
for(const row of rows){
 try{
  const result=await verifyCandidate(row,dependencies);
  if(!result.passed){
   await d1(`UPDATE feedback_handoffs SET attempt_count=attempt_count+1,last_probe_status=?,last_error=?,updated_at=CURRENT_TIMESTAMP WHERE ${configWhere}`,[result.status??null,result.error,...configParams(row)]);
   continue;
  }
  const changed=await d1(`UPDATE feedback_handoffs SET deployed_sha=?,verified_at=CURRENT_TIMESTAMP,last_probe_status=?,last_error=NULL,attempt_count=attempt_count+1,updated_at=CURRENT_TIMESTAMP WHERE ${configWhere} AND verified_at IS NULL RETURNING feedback_id`,[result.deployedSha,result.status,...configParams(row)]);
  if(changed.length){await d1(`INSERT INTO feedback_handoff_audit(feedback_id,from_status,to_status,actor,event,evidence_json) VALUES(?,'reviewing','reviewing','feedback-verifier','deploy_probe_verified',?)`,[row.feedback_id,JSON.stringify({deployedSha:result.deployedSha,probeStatus:result.status})]);verified.push(row.feedback_id);}
 }catch(error){
  await d1(`UPDATE feedback_handoffs SET attempt_count=attempt_count+1,last_error=?,updated_at=CURRENT_TIMESTAMP WHERE ${configWhere}`,[error instanceof Error?error.message.slice(0,300):'unknown verifier error',...configParams(row)]);
 }
}
console.log(JSON.stringify(publicLog('feedback_verify_complete',verified)));
