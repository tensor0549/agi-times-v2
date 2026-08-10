import { d1 } from './lib/d1-feedback.mjs';
import { registeredProbe } from './lib/feedback-classification.mjs';
import { canTransition } from './lib/feedback-verification.mjs';

const args=Object.fromEntries(process.argv.slice(2).map((value,index,list)=>value.startsWith('--')?[value.slice(2),list[index+1]?.startsWith('--')?'true':list[index+1]]:null).filter(Boolean));
const id=args.id;
if(!/^[0-9a-f-]{36}$/i.test(id??'')) throw new Error('--id <feedback-uuid> is required');
const rows=await d1(`SELECT * FROM feedback_handoffs WHERE feedback_id=?`,[id]);
if(!rows.length) throw new Error('Feedback handoff not found');
const current=rows[0];
const actor=String(args.owner??process.env.AGENT_NAME??'resident-agent').slice(0,100);
const audit=async(from,to,event,evidence={})=>d1(`INSERT INTO feedback_handoff_audit(feedback_id,from_status,to_status,actor,event,evidence_json) VALUES(?,?,?,?,?,?)`,[id,from,to,actor,event,JSON.stringify(evidence)]);

if(args.action==='claim'){
  if(!canTransition(current,'claim')) throw new Error('Only new handoffs can be claimed');
  if(!args.owner) throw new Error('--owner is required');
  const changed=await d1(`UPDATE feedback_handoffs SET status='reviewing',owner=?,reviewed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE feedback_id=? AND status='new' RETURNING feedback_id`,[args.owner,id]);
  if(changed.length) await audit('new','reviewing','claimed');
}else if(args.action==='configure-probe'){
  if(!canTransition(current,'configure-probe')) throw new Error('Probe configuration requires reviewing status');
  if(!/^[0-9a-f]{40}$/i.test(args['fix-sha']??'')) throw new Error('--fix-sha must be a 40-character SHA');
  const probeId=String(args['probe-id']??'');
  const probe=registeredProbe(probeId);
  if(!probe) throw new Error('--probe-id must name a registered probe');
  await d1(`UPDATE feedback_handoffs SET fix_sha=?,probe_method=?,probe_path=?,expected_status_min=?,expected_status_max=?,verification_ready=1,verified_at=NULL,deployed_sha=NULL,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE feedback_id=? AND status='reviewing'`,[args['fix-sha'],probe.method,probe.path,probe.min,probe.max,id]);
  await audit('reviewing','reviewing','probe_configured',{fixSha:args['fix-sha'],probeId,method:probe.method,probePath:probe.path});
}else if(args.action==='resolve'){
  if(current.status==='resolved'){console.log(JSON.stringify({event:'feedback_review_noop',opaqueId:id,action:'resolve'}));process.exit(0);}
  if(!canTransition(current,'resolve')) throw new Error('Resolution requires recorded successful canonical deploy and probe evidence for the fix SHA');
  const changed=await d1(`UPDATE feedback_handoffs SET status='resolved',resolution_note=?,updated_at=CURRENT_TIMESTAMP WHERE feedback_id=? AND status='reviewing' RETURNING feedback_id`,[String(args.note??'verified fix').slice(0,1000),id]);
  if(changed.length){await d1(`UPDATE feedback SET status='resolved' WHERE id=?`,[id]);await audit('reviewing','resolved','manually_resolved',{fixSha:current.fix_sha,deployedSha:current.deployed_sha});}
}else if(args.action==='non-actionable'){
  if(current.status==='non_actionable'){console.log(JSON.stringify({event:'feedback_review_noop',opaqueId:id,action:'non-actionable'}));process.exit(0);}
  if(!canTransition(current,'non-actionable')||!args.owner||!args.note) throw new Error('Non-actionable requires new/reviewing status, --owner and --note');
  const changed=await d1(`UPDATE feedback_handoffs SET status='non_actionable',owner=COALESCE(owner,?),reviewed_at=COALESCE(reviewed_at,CURRENT_TIMESTAMP),resolution_note=?,updated_at=CURRENT_TIMESTAMP WHERE feedback_id=? AND status IN ('new','reviewing') RETURNING feedback_id`,[args.owner,String(args.note).slice(0,1000),id]);
  if(changed.length){await d1(`UPDATE feedback SET status='closed' WHERE id=?`,[id]);await audit(current.status,'non_actionable','marked_non_actionable');}
}else throw new Error('--action claim|configure-probe|resolve|non-actionable is required');
console.log(JSON.stringify({event:'feedback_review_updated',opaqueId:id,action:args.action}));
