# Production operations

## Schedules
- Cloudflare Cron (`*/15 * * * *`): checks database reachability, content freshness, recent ingestion failures, and untriaged feedback volume. Results are structured Worker logs/Cloudflare observability events.
- GitHub `content-refresh.yml` (`17 * * * *`): validates the committed content contract, imports approved registry/feed/insight JSON, redeploys only after the full quality gate, then checks production health.
- GitHub `daily-insight.yml` (`23 1 * * *`): validates that at least one sourced bilingual Insight was published in the preceding 26 hours. It opens a failure signal in Actions rather than publishing unsupported claims.
- Production deploy: every `main` push after tests/typecheck/build, with D1 migration first and a post-deploy health check.

GitHub cron is delayed occasionally; Cloudflare Cron provides independent 15-minute freshness/failure detection.

## Observability and failure handling
Cloudflare Workers observability is enabled at 100% during launch. Every API response has `x-request-id`; unhandled failures emit structured logs without request bodies or credentials. The scheduled check emits `ops_check` JSON with feed age, last ingestion failure, and new feedback count. CI/deploy failures remain visible in GitHub Actions.

## Feedback triage
Feedback is validated, size-bounded, stored in D1, and mirrored as the allowlisted `feedback_submitted` PostHog event with locale, page, content ID, viewport, and request ID. Email/message bodies are deliberately excluded from PostHog. Operators query D1 by `status='new'`; automation may use aggregate counts from scheduled logs. Any future automatic issue creation must redact email and free text before leaving D1.

## Secrets
- Worker: `POSTHOG_API_KEY` (and future source/model credentials) via `wrangler secret put`.
- GitHub: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` as environment secrets.
- `GITHUB_TOKEN` is the ephemeral Actions token; no personal token belongs in repository settings or files.
