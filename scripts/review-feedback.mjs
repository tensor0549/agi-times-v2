import { d1 } from './lib/d1-feedback.mjs';

const args=Object.fromEntries(process.argv.slice(2).map((value,index,list)=>value.startsWith('--')?[value.slice(2),list[index+1]?.startsWith('--')?'true':list[index+1]]:null).filter(Boolean));
const id=args.id;
if(!/^[0-9a-f-]{36}$/i.test(id??'')) throw new Error('--id <feedback-uuid> is required');
const rows=await d1(`SELECT * FROM feedback_handoffs WHERE feedback_id=?`,[id]);
if(!rows.length) throw new Error('Feedback handoff not found');
const current=rows[0];

if(args.action==='claim'){
  if(current.status!=='new') throw new Error('Only new handoffs can be claimed');
  if(!args.owner) throw new Error('--owner is required');
  await d1(`UPDATE feedback_handoffs SET status='reviewing',owner=?,reviewed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE feedback_id=? AND status='new'`,[args.owner,id]);
}else if(args.action==='configure-probe'){
  if(current.status!=='reviewing') throw new Error('Probe configuration requires reviewing status');
  if(!/^[0-9a-f]{40}$/i.test(args['fix-sha']??'')) throw new Error('--fix-sha must be a 40-character SHA');
  const probePath=args['probe-path']; if(!probePath?.startsWith('/')||probePath.startsWith('//')) throw new Error('--probe-path must be same-origin relative');
  const method=args['probe-method']==='GET'?'GET':'HEAD';
  await d1(`UPDATE feedback_handoffs SET fix_sha=?,probe_method=?,probe_path=?,expected_status_min=?,expected_status_max=?,verification_ready=1,verified_at=NULL,deployed_sha=NULL,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE feedback_id=? AND status='reviewing'`,[args['fix-sha'],method,probePath,Number(args.min??200),Number(args.max??399),id]);
}else if(args.action==='resolve'){
  if(current.status!=='reviewing'||!current.verified_at||!current.deployed_sha||current.deployed_sha!==current.fix_sha) throw new Error('Resolution requires recorded successful deploy and probe evidence for the fix SHA');
  await d1(`UPDATE feedback_handoffs SET status='resolved',resolution_note=?,updated_at=CURRENT_TIMESTAMP WHERE feedback_id=? AND status='reviewing'`,[String(args.note??'verified fix'),id]);
  await d1(`UPDATE feedback SET status='resolved' WHERE id=?`,[id]);
}else if(args.action==='non-actionable'){
  if(!['new','reviewing'].includes(current.status)||!args.owner||!args.note) throw new Error('Non-actionable requires --owner and --note');
  await d1(`UPDATE feedback_handoffs SET status='non_actionable',owner=COALESCE(owner,?),reviewed_at=COALESCE(reviewed_at,CURRENT_TIMESTAMP),resolution_note=?,updated_at=CURRENT_TIMESTAMP WHERE feedback_id=?`,[args.owner,String(args.note).slice(0,1000),id]);
  await d1(`UPDATE feedback SET status='closed' WHERE id=?`,[id]);
}else throw new Error('--action claim|configure-probe|resolve|non-actionable is required');
console.log(JSON.stringify({event:'feedback_review_updated',opaqueId:id,action:args.action}));
