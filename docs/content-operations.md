# Content operations

## Canonical locale contract
Storage uses `en` and BCP 47 `zh-Hans`. Payloads declare `localeAliases: {"zh":"zh-Hans"}`. UI/API code may accept `zh` only through an explicit boundary mapping; validators fail on missing canonical locales.

## Reproducible build and gates

```bash
npm run content:build                 # registry + reviewed seed + daily Insight
npm run content:validate              # structural contract
npm run content:editorial-validate    # counts, dates, duplicates, citations, bilingual prose
npm run content:links                 # same gates plus live checks of every published/cited item URL
npm run insight:daily-check           # sourced bilingual Insight inside 26-hour window
node scripts/audit-registry-links.mjs       # full registry hard/soft-404 audit
node scripts/validate-ingestion-sources.mjs # enabled-source coverage/freshness contract
```

Registry inputs are `data/registry-candidates.json` plus the media/project lists in `scripts/build-content-registry.mjs`. Live-ingestion configuration is stored in `data/ingestion-sources.json`; its initial verified wave contains 30 enabled RSS/Atom endpoints and two community APIs (GitHub repository search and Hugging Face trending models). Feed and Insight generators contain only reviewed item URLs and exact captured evidence snippets. Do not use `content:build` merely to refresh timestamps: update sources and editorial copy first.

## Publication gate (fail closed)
Publication is blocked when any of these are true:
- coverage is below 100 organizations, 10 media, 100 people, or 100 projects;
- IDs or canonical URLs are duplicated, source IDs do not resolve, dates are invalid/future, or an item URL is not specific HTTPS content;
- English or Simplified Chinese is absent/too short, contains banned generic AI filler, or shows repetitive sentence openings;
- a Feed item lacks a first-party evidence snippet;
- an Insight claim lacks one or more resolvable citation IDs, a citation has no item-level URL/evidence snippet, or editorial/prose screening metadata is not `passed`;
- the daily Insight is older than 26 hours.

## Selection, relevance and diversity

Freshness is necessary but cannot override relevance or source diversity.

- The first 10 feed positions may contain at most two records from one publisher/organization and at most three records with the same primary topic when alternatives exist.
- A single autonomous publication batch may add at most two records from the same source and should represent at least three publishers when the candidate pool permits.
- Academic repositories such as arXiv are distribution hosts, not independent asserting publishers. Capture paper authors/institutions and evaluate independence by research team.
- Academic items require `agiRelevance >= 0.70` and importance `>= 70`. They must materially advance transferable foundation-model, agent, world-model/embodied, compute, evaluation, safety or governance capabilities.
- Narrow vertical applications—such as one institution's degree planning or generic domain classification—do not qualify merely because they use an LLM or agent.
- A newer low-relevance item must not displace a slightly older, authoritative frontier-model or safety development solely because of its date.

## Bilingual AI-like prose screen
`validate-editorial-content.mjs` provides the reproducible heuristic layer. Editors additionally review:
1. Does every sentence carry a fact, implication, transition, or necessary qualification?
2. Are attribution and uncertainty concrete rather than vague?
3. Does Chinese read as edited Chinese rather than mirrored English syntax?
4. Do sentence length and openings vary naturally without canned transitions?
5. Are superlatives and conclusions no stronger than cited evidence?

The gate records `editorialGate.aiProseScreen`. Opaque detector scores are not treated as proof because false positives are common; they may be advisory only. Drafts and detector payloads are not published.

## Automation
- `.github/workflows/content-refresh.yml`: hourly current-source ingestion and feed publication. It deploys the exact reviewed Git commit first, verifies the static bundle, then mutates D1 and verifies UI/API content-ID parity.
- `.github/workflows/daily-insight.yml`: daily current-source Insight generation plus freshness/citation/localization gates.
- Feed-only hourly runs must leave `insights.json` byte-identical when a current UTC-day Insight already exists.
- Description-less RSS records may be enriched only from their exact item URL using captured metadata/article lead text.
- A successful feed fetch with no diverse publishable candidates is a safe no-op: it must not change content timestamps.

### Expanded-ingestion acceptance

Before enabling a new source wave, a dry run must report:

- configured, attempted, successful, degraded, backed-off and stale source counts;
- per-source `lastAttemptAt`, `lastSuccessAt`, `latestItemAt`, HTTP/status, latency, consecutive failures and next retry;
- candidate counts before and after canonical-URL dedupe and relevance filtering;
- explicit classification evidence for every `requiresAiClassification` source;
- GitHub/Hugging Face project metrics and a real source timestamp, never the request time;
- no more than two candidates per source entering a publication batch.

Run `npm run content:ingest:accept` after ingestion and broad/community classification. The acceptance gate keys health by the ingestion config `id`, not by registry `sourceId`: multiple endpoints may intentionally belong to one registry source (for example, a publisher blog and its community API), and collapsing them would hide endpoint failures. Health records must use safe failure codes rather than raw errors or item URLs.

A source returning valid HTTP but zero parsed entries is degraded, not healthy. Broad feeds may not enter the writer prompt until AI relevance classification passes. Runtime health belongs in private D1/operational state; do not rewrite configuration timestamps to simulate success.
