-- PDF Companion — Feature 1 schema
--
-- Portable between SQLite (dev) and Postgres/Supabase (prod):
-- no AUTOINCREMENT, no INSERT OR REPLACE, no SQLite-only types.
-- Timestamps are ISO-8601 UTC strings ('2026-09-01T11:45:00Z').
-- Ids are application-generated uuid4 strings.
--
-- SQLite needs `PRAGMA foreign_keys = ON` per connection or the
-- FOREIGN KEY clauses below are parsed and then ignored.


-- ============================================================
-- Identity
-- ============================================================

-- google_sub is the identity, email is only data.
-- Google's `sub` claim never changes; an email address does. Upserting
-- on email means a user who changes their Google address returns as a
-- stranger with none of their documents. `sub` ships in the same verified
-- ID token payload as name and email — no extra work to capture it.
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  google_sub  TEXT NOT NULL UNIQUE,
  email       TEXT NOT NULL,
  name        TEXT,
  picture     TEXT,
  created_at  TEXT NOT NULL
);


-- ============================================================
-- Document content — GLOBAL, keyed by content hash
--
-- No user_id anywhere in this block, by design: that is what makes
-- cross-user dedupe work. A paper processed once is processed forever.
-- Access is granted exclusively through user_documents below.
-- ============================================================

CREATE TABLE IF NOT EXISTS documents (
  hash          TEXT PRIMARY KEY,            -- sha256 of the raw file bytes
  title         TEXT,
  page_count    INTEGER,

  source        TEXT NOT NULL DEFAULT 'upload'
                CHECK (source IN ('upload', 'online')),
  status        TEXT NOT NULL DEFAULT 'processing'
                CHECK (status IN ('processing', 'ready', 'failed')),
  pages_done    INTEGER NOT NULL DEFAULT 0,  -- progress polling reads this
  error         TEXT,                        -- why a failed ingest failed

  summary       TEXT,
  outline_json  TEXT,

  -- Works cited, from the same ingest call. This is what lets the agent
  -- offer "want me to pull that one in?" — the entry point to Flow B.
  references_json TEXT,

  -- The exact string sent to Claude as the cached prefix, materialised
  -- once at ingest. Re-assembling this from doc_pages on every request
  -- risks join-order or whitespace drift, and prompt caching is a byte
  -- match — one stray character silently invalidates the cache and
  -- roughly 4x's the bill with no error raised. Store it once, send it
  -- verbatim, and the cache key cannot drift.
  full_text     TEXT,
  token_count   INTEGER,                     -- from messages.count_tokens

  ingested_at   TEXT
);

CREATE TABLE IF NOT EXISTS doc_pages (
  hash     TEXT NOT NULL,
  page_no  INTEGER NOT NULL,
  text     TEXT,
  ocr      INTEGER NOT NULL DEFAULT 0,       -- 1 = came from Claude vision
  PRIMARY KEY (hash, page_no),
  FOREIGN KEY (hash) REFERENCES documents(hash) ON DELETE CASCADE
);

-- AI-provided highlighting, produced by the same ingest call as the
-- summary. Global like doc_pages: the key claims of a paper are the
-- same for every reader.
--
-- Stored as an exact quote plus page number rather than character
-- offsets: offsets into our extracted text would not map onto the
-- frontend's PDF text layer, so the renderer locates the string on
-- the page instead.
CREATE TABLE IF NOT EXISTS doc_highlights (
  id       TEXT PRIMARY KEY,
  hash     TEXT NOT NULL,
  page_no  INTEGER NOT NULL,
  quote    TEXT NOT NULL,
  kind     TEXT CHECK (kind IN ('claim', 'method', 'result', 'limitation')),
  FOREIGN KEY (hash) REFERENCES documents(hash) ON DELETE CASCADE
);


-- Pre-training glossary — the 8-12 terms a reader needs before page one,
-- with their glosses generated in the same ingest call as the summary.
--
-- Global, unlike `glosses` below, and that distinction is the whole point:
-- what "attention head" means is the same for every reader, so it is paid
-- for once. `glosses` records what one particular person looked up.
--
-- This is what makes an inline lookup a ~5ms indexed read instead of a
-- Haiku round trip: check here first, and only call the model on a miss.
CREATE TABLE IF NOT EXISTS doc_glossary (
  hash      TEXT NOT NULL,
  term      TEXT NOT NULL,
  term_key  TEXT NOT NULL,               -- lower(term), what lookups match on
  gloss     TEXT NOT NULL,
  ord       INTEGER NOT NULL DEFAULT 0,  -- reading order for the pre-read panel
  PRIMARY KEY (hash, term_key),
  FOREIGN KEY (hash) REFERENCES documents(hash) ON DELETE CASCADE
);


-- ============================================================
-- Access — the security boundary
--
-- Every query that returns document content joins through this table
-- for the requesting user. This is the precise form of the "scope by
-- user" rule: content tables are global, access is not.
-- ============================================================

CREATE TABLE IF NOT EXISTS user_documents (
  user_id         TEXT NOT NULL,
  hash            TEXT NOT NULL,
  added_at        TEXT NOT NULL,
  last_opened_at  TEXT,                      -- drives the session list order
  PRIMARY KEY (user_id, hash),
  FOREIGN KEY (user_id) REFERENCES users(id)      ON DELETE CASCADE,
  FOREIGN KEY (hash)    REFERENCES documents(hash) ON DELETE CASCADE
);


-- ============================================================
-- Sessions — one conversation per user per document
-- ============================================================

CREATE TABLE IF NOT EXISTS conversations (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  doc_hash    TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  FOREIGN KEY (user_id)  REFERENCES users(id)       ON DELETE CASCADE,
  FOREIGN KEY (doc_hash) REFERENCES documents(hash) ON DELETE CASCADE
);

-- Token columns are nullable and set on assistant rows only. They exist
-- so a caching regression is visible: if cache_read_tokens goes to zero
-- across a conversation, the prefix broke. Nothing errors when that
-- happens — the bill just quadruples — so this is the only ground truth.
CREATE TABLE IF NOT EXISTS messages (
  id                 TEXT PRIMARY KEY,
  conversation_id    TEXT NOT NULL,
  role               TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content            TEXT NOT NULL,
  created_at         TEXT NOT NULL,

  input_tokens       INTEGER,
  output_tokens      INTEGER,
  cache_read_tokens  INTEGER,

  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);


-- ============================================================
-- Glosses — per-user, unlike doc_highlights
--
-- Every gloss is a recorded "I did not know this". Cheap to store and
-- it is the feedstock for retrieval practice later: the words a reader
-- looked up are exactly the ones worth testing them on.
-- ============================================================

CREATE TABLE IF NOT EXISTS glosses (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL,
  doc_hash         TEXT NOT NULL,
  page_no          INTEGER,
  selected_text    TEXT NOT NULL,
  context_snippet  TEXT,
  explanation      TEXT,
  created_at       TEXT NOT NULL,
  FOREIGN KEY (user_id)  REFERENCES users(id)       ON DELETE CASCADE,
  FOREIGN KEY (doc_hash) REFERENCES documents(hash) ON DELETE CASCADE
);


-- ============================================================
-- Deferred — created now so they are never a migration.
-- Nothing in Feature 1 reads or writes either table.
-- ============================================================

-- Intervals follow the spacing research: ~1 day, ~1 week, ~3-4 weeks.
CREATE TABLE IF NOT EXISTS review_schedule (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL,
  doc_hash       TEXT NOT NULL,
  gloss_id       TEXT,
  due_at         TEXT NOT NULL,
  interval_days  INTEGER NOT NULL DEFAULT 1,
  ease           REAL NOT NULL DEFAULT 2.5,
  reviewed_at    TEXT,
  FOREIGN KEY (user_id)  REFERENCES users(id)       ON DELETE CASCADE,
  FOREIGN KEY (doc_hash) REFERENCES documents(hash) ON DELETE CASCADE,
  FOREIGN KEY (gloss_id) REFERENCES glosses(id)     ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS memories (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  type        TEXT NOT NULL,
  content     TEXT NOT NULL,
  confidence  REAL,
  updated_at  TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);


-- ============================================================
-- Indexes — one per hot query path, nothing speculative
-- ============================================================

-- Session list: user_documents WHERE user_id = ? ORDER BY last_opened_at DESC
CREATE INDEX IF NOT EXISTS idx_userdocs_recent
  ON user_documents (user_id, last_opened_at DESC);

-- Startup sweep: documents stuck in 'processing' after a reload killed the job
CREATE INDEX IF NOT EXISTS idx_documents_status
  ON documents (status);

-- Resolve the session for a document
CREATE INDEX IF NOT EXISTS idx_conversations_user_doc
  ON conversations (user_id, doc_hash);

-- Replay a conversation in order
CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages (conversation_id, created_at);

-- Render highlights for the page currently on screen
CREATE INDEX IF NOT EXISTS idx_highlights_page
  ON doc_highlights (hash, page_no);

-- Build a user's review queue for one document
CREATE INDEX IF NOT EXISTS idx_glosses_user_doc
  ON glosses (user_id, doc_hash);

-- What is due now
CREATE INDEX IF NOT EXISTS idx_review_due
  ON review_schedule (user_id, due_at);

-- Support lookups by email even though google_sub is the identity
CREATE INDEX IF NOT EXISTS idx_users_email
  ON users (email);

-- Render the pre-training glossary in order
CREATE INDEX IF NOT EXISTS idx_glossary_doc
  ON doc_glossary (hash, ord);
