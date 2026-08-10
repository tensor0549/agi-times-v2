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
```

Registry inputs are `data/registry-candidates.json` plus the media/project lists in `scripts/build-content-registry.mjs`. Feed and Insight generators contain only reviewed first-party item URLs and exact source evidence snippets. Do not use `content:build` merely to refresh timestamps: update sources and editorial copy first.

## Publication gate (fail closed)
Publication is blocked when any of these are true:
- coverage is below 100 organizations, 10 media, 100 people, or 100 projects;
- IDs or canonical URLs are duplicated, source IDs do not resolve, dates are invalid/future, or an item URL is not specific HTTPS content;
- English or Simplified Chinese is absent/too short, contains banned generic AI filler, or shows repetitive sentence openings;
- a Feed item lacks a first-party evidence snippet;
- an Insight claim lacks one or more resolvable citation IDs, a citation has no item-level URL/evidence snippet, or editorial/prose screening metadata is not `passed`;
- the daily Insight is older than 26 hours.

## Bilingual AI-like prose screen
`validate-editorial-content.mjs` provides the reproducible heuristic layer. Editors additionally review:
1. Does every sentence carry a fact, implication, transition, or necessary qualification?
2. Are attribution and uncertainty concrete rather than vague?
3. Does Chinese read as edited Chinese rather than mirrored English syntax?
4. Do sentence length and openings vary naturally without canned transitions?
5. Are superlatives and conclusions no stronger than cited evidence?

The gate records `editorialGate.aiProseScreen`. Opaque detector scores are not treated as proof because false positives are common; they may be advisory only. Drafts and detector payloads are not published.

## Automation
- `.github/workflows/content-refresh.yml`: hourly validation, editorial gate, D1 sync, production health check.
- `.github/workflows/daily-insight.yml`: daily freshness/citation/localization gate.
- The workflows intentionally deploy only an already-reviewed bundle. Future ingestion/model generation must write a draft bundle and pass the same gates before promotion.
