# Security
Report vulnerabilities privately to the repository owner rather than opening a public issue.

## Controls
- Browser telemetry is accepted only through an allowlisted same-origin proxy; the PostHog key is a Worker secret.
- API inputs are bounded, validated, and parameterized before D1 queries.
- Security headers and a restrictive CSP are applied at the edge.
- `.env`, `.dev.vars`, build output, and local Wrangler state are ignored.
- GitHub Actions receives deploy credentials only through environment secrets.
