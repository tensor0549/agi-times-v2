-- Remove legacy fingerprints derived from freeform feedback and requeue active
-- handoffs so deterministic-v2 can recompute safe category/route/probe hashes.
INSERT INTO feedback_handoff_audit(feedback_id,from_status,to_status,actor,event,evidence_json)
SELECT feedback_id,status,'new','migration-0007','privacy_reclassification_queued','{"classifier":"deterministic-v2"}'
FROM feedback_handoffs WHERE status IN ('new','reviewing');

UPDATE feedback
SET status='new'
WHERE id IN (
  SELECT feedback_id FROM feedback_handoffs WHERE status IN ('new','reviewing')
);

UPDATE feedback_handoffs
SET status='new',
    fingerprint=NULL,
    diagnosis_json='{}',
    probe_method=NULL,
    probe_path=NULL,
    expected_status_min=200,
    expected_status_max=399,
    verification_ready=0,
    fix_sha=NULL,
    deployed_sha=NULL,
    verified_at=NULL,
    attempt_count=0,
    last_probe_status=NULL,
    last_error=NULL,
    updated_at=CURRENT_TIMESTAMP
WHERE status IN ('new','reviewing');

-- Terminal dispositions remain terminal, but no legacy freeform-derived digest
-- is retained.
UPDATE feedback_handoffs
SET fingerprint=NULL,updated_at=CURRENT_TIMESTAMP
WHERE status IN ('resolved','non_actionable') AND fingerprint IS NOT NULL;
