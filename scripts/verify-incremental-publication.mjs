import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { verifyIncrementalUpdate } from './lib/publisher-gate.mjs';

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const fromGit = (ref, file) => {
  const result = spawnSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8' });
  if (result.status !== 0) return { items: [] };
  return JSON.parse(result.stdout);
};
const parseJsonResponse = (raw) => {
  const choice = raw?.choices?.[0];
  if (choice?.message?.parsed && typeof choice.message.parsed === 'object') return choice.message.parsed;
  let text = choice?.message?.content;
  if (Array.isArray(text)) text = text.map((part) => part.text ?? '').join('');
  if (text && typeof text === 'object') return text;
  const match = String(text ?? '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`OpenRouter reviewer returned no JSON object (finish_reason=${choice?.finish_reason ?? 'missing'}, message_fields=${Object.keys(choice?.message ?? {}).join(',') || 'missing'})`);
  return JSON.parse(match[0]);
};

const baseRef = process.env.PUBLISH_BASE_REF ?? 'HEAD';
const result = verifyIncrementalUpdate({
  baseFeed: fromGit(baseRef, 'content/feed.json'),
  feed: read('content/feed.json'),
  baseInsights: fromGit(baseRef, 'content/insights.json'),
  insights: read('content/insights.json'),
});

if (process.env.PUBLISH_VERIFY_SKIP_MODEL === '1') {
  console.log(`Deterministic incremental gate passed for ${result.newFeed.length} feed items and ${result.changedInsights.length} Insight(s); model review skipped explicitly.`);
  process.exit(0);
}
if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is required for independent editorial verification');

const schema = {
  name: 'agi_times_editorial_verdict',
  strict: true,
  schema: {
    type: 'object', additionalProperties: false, required: ['verdict', 'checks'],
    properties: {
      verdict: { type: 'string', enum: ['pass', 'fail'] },
      checks: {
        type: 'array', minItems: result.newFeed.length + result.changedInsights.length,
        items: {
          type: 'object', additionalProperties: false, required: ['id', 'supported', 'englishNatural', 'chineseNatural', 'reason'],
          properties: {
            id: { type: 'string' }, supported: { type: 'boolean' }, englishNatural: { type: 'boolean' }, chineseNatural: { type: 'boolean' }, reason: { type: 'string' },
          },
        },
      },
    },
  },
};
const prompt = `Act as an independent publication gate, not the writer. Review only the supplied records. For each feed item, every factual clause in both titles and summaries must be directly supported by its evidence excerpt. For each Insight, every factual claim and analytical inference must be warranted by the cited source excerpts; inferences must not be presented as facts. English must read as concise edited English and Simplified Chinese as natural edited Chinese, not literal translation. Explicitly reject claims that tooling, external training infrastructure, reusable experience, agent-harness optimization, or benchmark gains prove 'self-improving AI', agents that 'evolve themselves', architecture self-redesign, an AGI characteristic, or a fundamental/major shift unless those exact propositions appear in the excerpts. Return fail if evidence is insufficient, a citation is misleading, either language is unnatural, or any record is missing. Do not repair the copy.\n\nRECORDS:\n${JSON.stringify(result.reviewPayload)}`;
const model = process.env.OPENROUTER_REVIEW_MODEL ?? process.env.OPENROUTER_MODEL ?? 'anthropic/claude-sonnet-4';
const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'content-type': 'application/json',
    'HTTP-Referer': 'https://agitime.ai',
    'X-Title': 'AGI Times Independent Editorial Gate',
  },
  body: JSON.stringify({
    model,
    temperature: 0,
    max_tokens: 3000,
    response_format: { type: 'json_schema', json_schema: schema },
    messages: [{ role: 'user', content: prompt }],
  }),
  signal: AbortSignal.timeout(120_000),
});
if (!response.ok) throw new Error(`OpenRouter reviewer ${response.status}: ${(await response.text()).slice(0, 500)}`);
const verdict = parseJsonResponse(await response.json());
const expectedIds = new Set([...result.newFeed, ...result.changedInsights].map((item) => item.id));
const seen = new Set();
const failures = [];
for (const check of verdict.checks ?? []) {
  if (!expectedIds.has(check.id) || seen.has(check.id)) failures.push(`unexpected or duplicate review result ${check.id}`);
  seen.add(check.id);
  if (!check.supported || !check.englishNatural || !check.chineseNatural) failures.push(`${check.id}: ${check.reason}`);
}
for (const id of expectedIds) if (!seen.has(id)) failures.push(`${id}: independent review result missing`);
if (verdict.verdict !== 'pass') failures.push('independent reviewer returned a failing verdict');
if (failures.length) throw new Error(`Fail closed: independent editorial review rejected publication\n${failures.join('\n')}`);
console.log(`Independent ${model} gate passed ${result.newFeed.length} feed items and ${result.changedInsights.length} Insight(s).`);
