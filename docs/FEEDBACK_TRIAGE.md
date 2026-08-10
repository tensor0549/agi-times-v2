# Private feedback triage runbook

Raw feedback stays in Cloudflare D1. Public GitHub Actions logs contain only aggregate counts and opaque UUIDs. No issue, artifact, commit, chat message, or log may contain a user's message, email, page query, user agent, or raw context.

## State flow

1. `/api/v1/feedback` stores raw input as `feedback.status='new'`.
2. The scheduled `Feedback triage` Action writes an opaque, deterministic `feedback_handoffs` record with status `new`. Only after that durable insert does it set the raw record to `reviewing`.
3. A resident agent privately exports a selected record to a mode-0600 file under `/tmp`, diagnoses/reproduces it, and claims it (`new → reviewing`). Raw inspection is hard-disabled in CI/GitHub Actions.
4. After a fix ships, the resident records the exact 40-character fix SHA and an explicit same-origin probe, setting `verification_ready=1`.
5. The verifier records `deployed_sha`, response status, and `verified_at` only after it finds a successful `Deploy production` run for the exact SHA and the bounded probe passes. **It never resolves feedback automatically.**
6. A resident reviews the evidence and manually transitions `reviewing → resolved`, or records `new/reviewing → non_actionable` with an owner and private note.

Kill switches: repository variables `FEEDBACK_TRIAGE_ENABLED=false` and `FEEDBACK_VERIFY_ENABLED=false`. Batches are bounded to 50 triage / 25 verification records.

## Safe queue polling

This query contains no user text and is suitable for each quality-ops mission cycle:

```bash
npx wrangler d1 execute agi-times-v2 --remote --command \
  "SELECT feedback_id,category,severity,status,owner,probe_method,probe_path,fix_sha,deployed_sha,verified_at,last_error FROM feedback_handoffs WHERE status IN ('new','reviewing') ORDER BY created_at"
```

## Private inspection and state updates

Export one raw record only inside a secured resident-agent session:

```bash
node scripts/inspect-feedback-private.mjs '<opaque-uuid>'
# Writes /tmp/agi-times-feedback-<uuid>.json with mode 0600.
# Delete it immediately after diagnosis.
```

Claim it:

```bash
node scripts/review-feedback.mjs --id '<uuid>' --action claim --owner quality-ops
```

After the fix is merged, configure a purpose-built probe:

```bash
node scripts/review-feedback.mjs --id '<uuid>' --action configure-probe \
  --fix-sha '<40-char-sha>' --probe-method GET --probe-path '/api/v1/regression-check' --min 200 --max 299
```

Never use a generic homepage probe unless it directly reproduces the report. The verifier runs on schedule. After it records matching `fix_sha`, `deployed_sha`, and `verified_at`, resolve manually:

```bash
node scripts/review-feedback.mjs --id '<uuid>' --action resolve --note 'Verified by regression probe'
```

Or close a non-actionable report privately:

```bash
node scripts/review-feedback.mjs --id '<uuid>' --action non-actionable --owner quality-ops --note 'Duplicate of <opaque-id>'
```

Delete the private export with `rm -f /tmp/agi-times-feedback-<uuid>.json`.

## Synthetic public-issue cleanup

Early synthetic QA handoffs accidentally created public issues `tensor0549/agi-times-v2#3` and `#4`. They contain only synthetic verification text and no real user PII. Available automation PATs cannot edit/delete them (GitHub 403). A repository owner should delete them or replace title/body with opaque IDs using owner-capable UI/auth. Production automation never creates GitHub issues.
