# AGI News Content Taxonomy and JSON Contracts

## 1. Controlled taxonomy

Use stable lowercase `snake_case` IDs. Labels are localized separately; never translate IDs.

### Primary topic (`topics[].id`, 1 required; max 3)

- `models_capabilities`: foundation models, reasoning, multimodal, benchmarks
- `agents_automation`: agents, tool use, autonomous workflows
- `robotics_embodied_ai`: robotics, world models, embodied systems
- `research_science`: papers, methods, datasets, scientific applications
- `compute_infrastructure`: chips, cloud, training/inference, energy
- `products_developer_ecosystem`: APIs, applications, open source, tooling
- `safety_security_alignment`: evaluations, alignment, misuse, incidents
- `policy_governance_law`: regulation, standards, courts, public policy
- `business_capital`: funding, M&A, partnerships, revenue, competition
- `society_economy_labor`: jobs, education, media, inequality, public opinion
- `agi_forecasting_debate`: definitions, timelines, expert forecasts

### Event type (`event_type`, exactly 1)

`model_release`, `product_release`, `research_result`, `benchmark_result`, `dataset_release`, `funding`, `acquisition`, `partnership`, `policy_action`, `legal_action`, `security_incident`, `safety_incident`, `personnel_change`, `infrastructure_update`, `commentary`, `forecast`, `correction`, `other`.

### Additional facets

- `content_kind`: `news`, `brief`, `analysis`, `explainer`, `interview`, `opinion`, `live_update`
- `entities[]`: canonical IDs for organizations, people, models/products, laws, benchmarks, and places
- `geographies[]`: ISO 3166-1 alpha-2; use `GLOBAL` for genuinely global items
- `audiences[]`: `general`, `research`, `engineering`, `policy`, `business`, `safety`
- `maturity`: `announced`, `preview`, `released`, `adopted`, `deprecated`, `disputed`
- `verification_status`: `verified`, `partially_verified`, `unverified`, `disputed`, `retracted`

Taxonomy governance: additive changes are allowed; renames require an alias map and migration. Unknown values fail publication rather than silently becoming tags.

## 2. Freshness, importance, and feed rank

All component inputs are in `[0,1]`; final scores are integers `0–100`.

### Freshness

```text
age_hours = max(0, now - effective_at)
freshness = round(100 * exp(-ln(2) * age_hours / half_life_hours))
```

`effective_at = published_at`, unless a material update changes the conclusion, facts, status, or consequences; then use `material_updated_at`. Typos and translation edits do not reset freshness.

Default half-lives:

| Event/content | Hours |
|---|---:|
| incident, legal/policy action, funding/M&A, release | 24 |
| benchmark, infrastructure, personnel, partnership | 48 |
| research result, interview | 72 |
| analysis, explainer, forecast | 168 |
| evergreen background | 720 |

### Importance

```text
importance = round(100 * (
  0.30 * impact +
  0.20 * agi_relevance +
  0.15 * strategic_consequence +
  0.15 * novelty +
  0.10 * audience_relevance +
  0.10 * evidence_strength
))
```

Scoring anchors:

- `impact`: 0 niche/no measurable effect; 0.5 sector-level; 1 cross-sector/global
- `agi_relevance`: 0 incidental AI mention; 0.5 meaningful capability/ecosystem effect; 1 changes AGI capability, control, or timeline assumptions
- `strategic_consequence`: 0 reversible/minor; 1 durable shift in access, power, safety, law, or economics
- `novelty`: 0 recap; 0.5 meaningful update; 1 first credible disclosure/result
- `audience_relevance`: weighted mean for configured target audiences
- `evidence_strength`: 0 rumor; 0.4 single secondary source; 0.7 primary source or two independent reliable sources; 1 reproducible/official evidence with corroboration

### Feed rank

```text
I = importance / 100
F = freshness / 100
Q = 0.6 * evidence_strength + 0.4 * source_quality
E = editorial_boost            # normally 0; max 1, requires reason + expiry
P = duplicate_penalty          # 0 or 0.10
  + rumor_penalty              # 0.15 if unverified
  + translation_staleness      # 0.05 if locale lags a material update

rank_score = round(100 * clamp(0.55*I + 0.30*F + 0.10*Q + 0.05*E - P, 0, 1))
```

Sort by `rank_score DESC`, then `effective_at DESC`, then `id ASC`. After scoring, apply diversity caps: no more than 3 of 10 items with the same primary topic and no more than 2 of 10 dominated by the same organization. Pinned items must be visibly labeled and have an expiry.

## 3. JSON field contracts

The two configured locales below are examples (`en`, `zh-Hans`); deployments may substitute any two BCP 47 tags. Published records require both locales unless explicitly marked `translation_status: "pending"` and the UI labels the missing translation.

### A. Source registry entry

```json
{
  "id": "src_openai",
  "schema_version": "1.0",
  "name": {"en": "OpenAI", "zh-Hans": "OpenAI"},
  "source_type": "primary_org",
  "homepage_url": "https://example.org/",
  "feed_urls": ["https://example.org/feed.xml"],
  "languages": ["en"],
  "publisher_country": "US",
  "ownership_or_affiliation": "Organization-owned publication",
  "source_quality": 0.85,
  "quality_rationale": "Primary for its own announcements; claims require external corroboration.",
  "enabled": true,
  "created_at": "2026-08-10T00:00:00Z",
  "reviewed_at": "2026-08-10T00:00:00Z"
}
```

Required: all fields except `feed_urls`, `publisher_country`, and `ownership_or_affiliation`. `source_type` enum: `primary_org`, `government`, `academic`, `journal`, `newsroom`, `industry`, `independent`, `social`, `aggregator`.

### B. Feed item

```json
{
  "id": "item_01jabc123",
  "schema_version": "1.0",
  "canonical_url": "https://example.org/story",
  "source_id": "src_openai",
  "source_item_id": "optional-publisher-id",
  "content_kind": "news",
  "event_type": "model_release",
  "topics": [{"id": "models_capabilities", "weight": 1.0}],
  "entities": [{"id": "org_openai", "type": "organization", "role": "subject"}],
  "geographies": ["GLOBAL"],
  "audiences": ["general", "research", "engineering"],
  "maturity": "released",
  "verification_status": "verified",
  "published_at": "2026-08-10T09:00:00Z",
  "material_updated_at": null,
  "ingested_at": "2026-08-10T09:05:00Z",
  "localized": {
    "en": {"title": "...", "dek": "...", "summary": "..."},
    "zh-Hans": {"title": "...", "dek": "...", "summary": "..."}
  },
  "source_language": "en",
  "translation_status": "complete",
  "translation_method": "human_reviewed_mt",
  "scores": {
    "impact": 0.8,
    "agi_relevance": 0.9,
    "strategic_consequence": 0.7,
    "novelty": 0.8,
    "audience_relevance": 0.8,
    "evidence_strength": 0.7,
    "freshness": 97,
    "importance": 80,
    "rank_score": 81,
    "scored_at": "2026-08-10T10:00:00Z",
    "formula_version": "rank-1.0"
  },
  "editorial": {
    "editorial_boost": 0,
    "boost_reason": null,
    "boost_expires_at": null,
    "duplicate_of": null,
    "correction_note": null,
    "material_update_note": null
  }
}
```

All top-level fields are required except `source_item_id`; nullable fields must still be present. `translation_status`: `complete`, `pending`, `stale`, `not_required`. `translation_method`: `original`, `human`, `human_reviewed_mt`, `machine`. Entity `type`: `organization`, `person`, `model`, `product`, `law`, `benchmark`, `place`; `role`: `subject`, `actor`, `affected`, `mentioned`.

### C. Insight with claim-level citations

```json
{
  "id": "insight_01jdef456",
  "schema_version": "1.0",
  "slug": "what-the-release-changes",
  "content_kind": "analysis",
  "topics": [{"id": "models_capabilities", "weight": 1.0}],
  "localized": {
    "en": {"title": "...", "thesis": "...", "body_markdown": "... [^clm_1]"},
    "zh-Hans": {"title": "...", "thesis": "...", "body_markdown": "... [^clm_1]"}
  },
  "claims": [
    {
      "id": "clm_1",
      "type": "fact",
      "risk": "high",
      "text": {"en": "...", "zh-Hans": "..."},
      "citation_ids": ["cit_1"],
      "confidence": 0.9
    }
  ],
  "citations": [
    {
      "id": "cit_1",
      "feed_item_id": "item_01jabc123",
      "source_id": "src_openai",
      "url": "https://example.org/source",
      "relation": "supports",
      "locator": {"type": "paragraph", "value": "12"},
      "quote": "Exact source-language excerpt.",
      "quote_language": "en",
      "accessed_at": "2026-08-10T10:00:00Z",
      "archive_url": "https://archive.example/..."
    }
  ],
  "published_at": "2026-08-10T12:00:00Z",
  "updated_at": "2026-08-10T12:00:00Z",
  "translation_status": "complete",
  "review": {"editor_id": "usr_editor01", "fact_checked_at": "2026-08-10T11:30:00Z"}
}
```

All top-level fields are required. Within a citation, `feed_item_id` and `archive_url` are optional; `source_id` must resolve to the registry. Within `review`, `editor_id` and `fact_checked_at` are required for publication.

`claims[].type`: `fact`, `inference`, `forecast`, `opinion`. `risk`: `low`, `medium`, `high`. `citations[].relation`: `supports`, `contradicts`, `context`. Locator types: `paragraph`, `page`, `section`, `timestamp`, `figure`, `table`.

## 4. Publication validation rules

1. IDs match `^[a-z][a-z0-9_:-]{2,127}$`; slugs match `^[a-z0-9]+(?:-[a-z0-9]+)*$`.
2. Timestamps are UTC RFC 3339. `published_at <= ingested_at`; future source dates over 5 minutes are quarantined.
3. URLs are absolute HTTPS, canonicalized, and stripped of tracking parameters. `canonical_url` is unique.
4. Registry references, entity IDs, taxonomy IDs, and citation references must resolve; no orphan IDs.
5. Exactly one primary topic has `weight = 1`; topic weights are `(0,1]`; max 3 topics and no duplicates.
6. Localized title: 8–140 characters; dek: max 240; summary: 40–600. HTML is rejected; Markdown is allowed only where specified.
7. Required locales use valid configured BCP 47 tags. Both localized versions preserve numbers, units, named entities, uncertainty, and claim IDs. Machine translation must be labeled.
8. Every `fact`, `inference`, or `forecast` claim has at least one citation. High-risk claims require either one authoritative primary source or two independent sources. Opinion claims must be attributed.
9. Every citation includes a stable URL, access time, source-language quote, and usable locator. The quote must occur in the captured source; `supports` citations must entail the claim rather than merely mention its subject.
10. Independence check: syndications, press-release rewrites, and outlets citing the same unnamed source count as one source.
11. `confidence`, scoring inputs, source quality, and boosts are within `[0,1]`; computed scores are `0–100` and must reproduce under `formula_version` within ±1 point.
12. `material_updated_at >= published_at`. Setting it requires an audit note describing the material change. Corrections never delete prior text from the audit log.
13. `retracted` items are excluded from normal ranking but retain a public correction/retraction record. `disputed` and `unverified` items display status labels.
14. Editorial boosts require a reason and future expiry (maximum 24 hours); they cannot override retraction or citation failures.
15. Duplicate detection uses normalized canonical URL plus title/entity similarity. Duplicates either set `duplicate_of` or receive the penalty; prefer the primary or most evidential source.
