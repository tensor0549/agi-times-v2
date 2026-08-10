import fs from 'node:fs';
import path from 'node:path';
import { d1 } from './lib/d1-feedback.mjs';

if (process.env.GITHUB_ACTIONS === 'true' || process.env.CI === 'true') throw new Error('Raw feedback inspection is forbidden in CI/Actions');
const id = process.argv[2];
if (!/^[0-9a-f-]{36}$/i.test(id ?? '')) throw new Error('Usage: node scripts/inspect-feedback-private.mjs <feedback-uuid>');
const rows = await d1(`SELECT h.*,f.rating,f.message,f.email,f.locale,f.page_url,f.content_id,f.context_json,f.created_at AS feedback_created_at
  FROM feedback_handoffs h JOIN feedback f ON f.id=h.feedback_id WHERE h.feedback_id=?`,[id]);
if (!rows.length) throw new Error('Feedback handoff not found');
const output = path.join('/tmp',`agi-times-feedback-${id}.json`);
fs.writeFileSync(output,JSON.stringify(rows[0],null,2)+'\n',{mode:0o600});
fs.chmodSync(output,0o600);
console.log(JSON.stringify({event:'private_feedback_exported',opaqueId:id,privatePath:output}));
