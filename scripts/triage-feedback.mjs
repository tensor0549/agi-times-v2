import { classifyFeedback, publicLog } from './lib/feedback-classification.mjs';
import { boundedBatch, d1 } from './lib/d1-feedback.mjs';

if (process.env.FEEDBACK_TRIAGE_ENABLED === 'false') { console.log(JSON.stringify(publicLog('feedback_triage_disabled', []))); process.exit(0); }
const limit = boundedBatch(process.env.FEEDBACK_TRIAGE_BATCH);
const feedback = await d1(`SELECT id,rating,message,locale,page_url,content_id,created_at FROM feedback WHERE status='new' ORDER BY created_at ASC LIMIT ?`, [limit]);
const handedOff = [];
for (const item of feedback) {
  const result = classifyFeedback(item);
  await d1(`INSERT INTO feedback_handoffs(feedback_id,category,severity,status,fingerprint,diagnosis_json,probe_method,probe_path)
    VALUES(?,?,?,'new',?,?,?,?)
    ON CONFLICT(feedback_id) DO UPDATE SET category=excluded.category,severity=excluded.severity,fingerprint=excluded.fingerprint,
      diagnosis_json=excluded.diagnosis_json,probe_method=excluded.probe_method,probe_path=excluded.probe_path,
      updated_at=CURRENT_TIMESTAMP`,
    [item.id,result.category,result.severity,result.fingerprint,JSON.stringify(result.diagnosis),result.probeMethod,result.probePath]);
  const updated = await d1(`UPDATE feedback SET status='reviewing',context_json=json_set(context_json,'$.triageStore','d1:feedback_handoffs','$.triagedAt',?)
    WHERE id=? AND status='new' AND EXISTS(SELECT 1 FROM feedback_handoffs WHERE feedback_id=?) RETURNING id`, [new Date().toISOString(),item.id,item.id]);
  if (updated.length) {
    await d1(`INSERT INTO feedback_handoff_audit(feedback_id,from_status,to_status,actor,event,evidence_json) VALUES(?,NULL,'new','feedback-triage','handoff_created',?)`,[item.id,JSON.stringify({classifier:'deterministic-v1'})]);
    handedOff.push(item.id);
  }
}
console.log(JSON.stringify(publicLog('feedback_triage_complete', handedOff)));
