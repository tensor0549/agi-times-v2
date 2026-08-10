ALTER TABLE feedback_handoffs RENAME TO feedback_handoffs_v1;

CREATE TABLE feedback_handoffs (
  feedback_id TEXT PRIMARY KEY REFERENCES feedback(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'general-feedback',
  severity TEXT NOT NULL CHECK (severity IN ('normal','high')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewing','resolved','non_actionable')),
  owner TEXT,
  fingerprint TEXT,
  diagnosis_json TEXT NOT NULL DEFAULT '{}',
  probe_method TEXT CHECK (probe_method IN ('GET','HEAD')),
  probe_path TEXT,
  expected_status_min INTEGER NOT NULL DEFAULT 200,
  expected_status_max INTEGER NOT NULL DEFAULT 399,
  verification_ready INTEGER NOT NULL DEFAULT 0 CHECK (verification_ready IN (0,1)),
  fix_sha TEXT,
  deployed_sha TEXT,
  reviewed_at TEXT,
  verified_at TEXT,
  resolution_note TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_probe_status INTEGER,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

INSERT INTO feedback_handoffs(feedback_id,category,severity,status,created_at,updated_at)
SELECT feedback_id,category,severity,
  CASE status WHEN 'assigned' THEN 'reviewing' WHEN 'closed' THEN 'non_actionable' ELSE status END,
  created_at,updated_at FROM feedback_handoffs_v1;
DROP TABLE feedback_handoffs_v1;
CREATE INDEX idx_feedback_handoffs_status ON feedback_handoffs(status,created_at);
CREATE INDEX idx_feedback_verify ON feedback_handoffs(status,verification_ready,fix_sha);

CREATE TABLE feedback_handoff_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feedback_id TEXT NOT NULL REFERENCES feedback_handoffs(feedback_id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor TEXT NOT NULL,
  event TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
CREATE INDEX idx_feedback_audit_id ON feedback_handoff_audit(feedback_id,created_at);
