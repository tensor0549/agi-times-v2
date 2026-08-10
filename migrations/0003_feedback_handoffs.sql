CREATE TABLE IF NOT EXISTS feedback_handoffs (
  feedback_id TEXT PRIMARY KEY REFERENCES feedback(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'general-feedback',
  severity TEXT NOT NULL CHECK (severity IN ('normal','high')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','assigned','resolved','closed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
CREATE INDEX IF NOT EXISTS idx_feedback_handoffs_status ON feedback_handoffs(status, created_at);
