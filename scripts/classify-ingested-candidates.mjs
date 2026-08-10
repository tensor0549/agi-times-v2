import fs from 'node:fs';

const file = 'content/drafts/ingested.json';
if (!fs.existsSync(file)) throw new Error('Ingested candidate draft is required');
if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is required for candidate classification');
const draft = JSON.parse(fs.readFileSync(file, 'utf8'));
const candidates = draft.candidates ?? [];
const toClassify = candidates.filter((candidate) => candidate.requiresAiClassification || ['github_search_api', 'huggingface_models_api'].includes(candidate.sourceKind));
if (!toClassify.length) { console.log('No broad/community candidates require classification.'); process.exit(0); }
const model = process.env.OPENROUTER_CLASSIFIER_MODEL ?? 'openai/gpt-4.1-mini';
const acceptedCodes = new Set(['core_ai', 'transferable_research', 'material_ai_industry']);
const decisions = new Map();

const parse = (raw) => {
  let content = raw?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) content = content.map((part) => part.text ?? '').join('');
  const text = String(content ?? '').trim();
  if (!text.startsWith('{') || !text.endsWith('}')) throw new Error('Classifier returned no exact JSON object');
  return JSON.parse(text);
};
for (let offset = 0; offset < toClassify.length; offset += 30) {
  const batch = toClassify.slice(offset, offset + 30);
  const records = batch.map((candidate) => ({ id: candidate.id, sourceId: candidate.sourceId, sourceKind: candidate.sourceKind, scope: candidate.scope, title: candidate.title, evidence: candidate.evidenceSnippet, metrics: candidate.metrics }));
  const prompt = `Classify whether each record is materially relevant to digital AGI and the general AI industry. Use only the supplied title, evidence and metrics. Core model/agent architecture, training, inference, evaluation, safety, compute and material AI-industry developments may pass. Reject unrelated politics/business, generic software, narrow vertical applications (education planning, legal/labour apps, medicine-only, finance-only, molecular-only), mirrors and repositories whose AI relevance is merely a topic tag. When uncertain, relevant must be false. Return one decision for every exact ID and no others.\nRECORDS:\n${JSON.stringify(records)}`;
  const schema = { name: 'agi_candidate_classification', strict: true, schema: { type: 'object', additionalProperties: false, required: ['decisions'], properties: { decisions: { type: 'array', minItems: batch.length, maxItems: batch.length, items: { type: 'object', additionalProperties: false, required: ['id', 'relevant', 'confidence', 'reasonCode'], properties: { id: { type: 'string' }, relevant: { type: 'boolean' }, confidence: { type: 'number', minimum: 0, maximum: 1 }, reasonCode: { type: 'string', enum: ['core_ai','transferable_research','material_ai_industry','vertical_application','non_ai','uncertain'] } } } } } } };
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'content-type': 'application/json', 'HTTP-Referer': 'https://agitime.ai', 'X-Title': 'AGI Times Candidate Classifier' }, body: JSON.stringify({ model, temperature: 0, max_tokens: 3_000, response_format: { type: 'json_schema', json_schema: schema }, messages: [{ role: 'user', content: prompt }] }), signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`OpenRouter classifier ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const verdict = parse(await response.json());
  if (!verdict || Object.keys(verdict).length !== 1 || !Array.isArray(verdict.decisions) || verdict.decisions.length !== batch.length) throw new Error('Classifier response has invalid shape');
  const expected = new Set(batch.map((candidate) => candidate.id));
  for (const decision of verdict.decisions) {
    const keys = Object.keys(decision).sort();
    if (JSON.stringify(keys) !== JSON.stringify(['confidence','id','reasonCode','relevant']) || !expected.has(decision.id) || decisions.has(decision.id) || typeof decision.relevant !== 'boolean' || typeof decision.confidence !== 'number' || typeof decision.reasonCode !== 'string') throw new Error(`Invalid or duplicate classifier decision ${decision.id ?? 'unknown'}`);
    decisions.set(decision.id, decision);
  }
}
const rejected = [];
const nextCandidates = candidates.filter((candidate) => {
  const decision = decisions.get(candidate.id);
  if (!decision) return true;
  const approved = decision.relevant === true && decision.confidence >= 0.8 && acceptedCodes.has(decision.reasonCode);
  if (!approved) rejected.push({ id: candidate.id, sourceId: candidate.sourceId, reasonCode: decision.reasonCode, confidence: decision.confidence });
  else candidate.classification = { model, relevant: true, confidence: decision.confidence, reasonCode: decision.reasonCode };
  return approved;
});
const next = { ...draft, classification: { model, checkedAt: new Date().toISOString(), reviewed: toClassify.length, accepted: toClassify.length - rejected.length, rejected }, candidates: nextCandidates };
const temp = `${file}.tmp`;
fs.writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`);
fs.renameSync(temp, file);
console.log(`Classified ${toClassify.length} broad/community candidates: ${toClassify.length - rejected.length} accepted, ${rejected.length} rejected fail-closed.`);
