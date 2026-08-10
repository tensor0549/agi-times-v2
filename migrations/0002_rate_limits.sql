CREATE TABLE IF NOT EXISTS api_rate_limits (
  key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (key, window_start)
) STRICT;
CREATE INDEX IF NOT EXISTS idx_rate_limit_window ON api_rate_limits(window_start);
