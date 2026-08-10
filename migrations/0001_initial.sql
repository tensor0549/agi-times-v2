PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('organization','media','person','github','huggingface','community','other')),
  name TEXT NOT NULL,
  homepage_url TEXT NOT NULL,
  feed_url TEXT,
  language TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE IF NOT EXISTS content_items (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('article','video','release','project','post','interview','paper','event')),
  canonical_url TEXT NOT NULL UNIQUE,
  title_en TEXT NOT NULL,
  title_zh TEXT NOT NULL,
  summary_en TEXT NOT NULL,
  summary_zh TEXT NOT NULL,
  image_url TEXT,
  original_language TEXT,
  published_at TEXT NOT NULL,
  discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  topics_json TEXT NOT NULL DEFAULT '[]',
  entities_json TEXT NOT NULL DEFAULT '[]',
  metrics_json TEXT NOT NULL DEFAULT '{}',
  score REAL NOT NULL DEFAULT 0,
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0,1)),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_content_published ON content_items(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_source ON content_items(source_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_kind ON content_items(kind, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_score ON content_items(status, score DESC, published_at DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS content_search USING fts5(
  id UNINDEXED, title_en, title_zh, summary_en, summary_zh, topics,
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS content_ai AFTER INSERT ON content_items BEGIN
  INSERT INTO content_search(id,title_en,title_zh,summary_en,summary_zh,topics)
  VALUES(new.id,new.title_en,new.title_zh,new.summary_en,new.summary_zh,new.topics_json);
END;
CREATE TRIGGER IF NOT EXISTS content_au AFTER UPDATE ON content_items BEGIN
  DELETE FROM content_search WHERE id=old.id;
  INSERT INTO content_search(id,title_en,title_zh,summary_en,summary_zh,topics)
  VALUES(new.id,new.title_en,new.title_zh,new.summary_en,new.summary_zh,new.topics_json);
END;
CREATE TRIGGER IF NOT EXISTS content_ad AFTER DELETE ON content_items BEGIN
  DELETE FROM content_search WHERE id=old.id;
END;

CREATE TABLE IF NOT EXISTS insights (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title_en TEXT NOT NULL,
  title_zh TEXT NOT NULL,
  dek_en TEXT NOT NULL,
  dek_zh TEXT NOT NULL,
  body_en TEXT NOT NULL,
  body_zh TEXT NOT NULL,
  topics_json TEXT NOT NULL DEFAULT '[]',
  claims_json TEXT NOT NULL DEFAULT '[]',
  sources_json TEXT NOT NULL DEFAULT '[]',
  published_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_insights_published ON insights(status, published_at DESC);

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  message TEXT,
  email TEXT,
  locale TEXT CHECK (locale IN ('en','zh')),
  page_url TEXT NOT NULL,
  content_id TEXT,
  context_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewing','resolved','closed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, created_at DESC);

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id TEXT PRIMARY KEY,
  source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('started','succeeded','failed')),
  items_seen INTEGER NOT NULL DEFAULT 0,
  items_written INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
) STRICT;
