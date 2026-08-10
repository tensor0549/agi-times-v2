# AGI Times v2

A brand-new bilingual AGI intelligence product built for Cloudflare Workers, Static Assets, and D1. This repository is intentionally separate from all earlier AGI Times work.

## Stack
- React + Vite + TypeScript frontend
- Hono Worker API at `/api/v1/*`
- Cloudflare D1 with bilingual normalized content, FTS5 search, insights/citations, feedback, and ingestion audit tables
- Server-proxied PostHog capture with an event allowlist and contextual feedback

## Local development
```bash
npm ci
npm run db:migrate:local
# Add POSTHOG_API_KEY only to .dev.vars if analytics delivery is needed locally
npm run dev
```
Then open `http://localhost:5173`. Verify `GET /api/v1/health`.

## Quality gate
```bash
npm run check
```

## Production
`wrangler.jsonc` binds the production D1 database and provisions custom domains for `agitime.ai` and `www.agitime.ai`. Set the Worker secret once:
```bash
printf '%s' "$POSTHOG_API_KEY" | npx wrangler secret put POSTHOG_API_KEY
npm run db:migrate:remote
npm run deploy
```
GitHub Actions requires repository/environment secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Never commit credentials.

## APIs
- `GET /api/v1/health`
- `GET /api/v1/feed?limit=&cursor=&kind=&topic=`
- `GET /api/v1/search?q=&limit=`
- `GET /api/v1/insights` and `/api/v1/insights/:slug`
- `POST /api/v1/events`
- `POST /api/v1/feedback`

PostHog event names: `page_viewed`, `article_opened`, `insight_opened`, `search_performed`, `filter_changed`, `language_changed`, `theme_changed`, `source_link_clicked`, `feedback_submitted`, `error_seen`.
