-- Chat history, so a reload or a new phone does not lose the conversation.
-- Named chat_messages, not messages: db.py's SQLite schema already defines a
-- `messages` table with a different shape, and CREATE TABLE IF NOT EXISTS would
-- quietly do nothing against it.

CREATE TABLE IF NOT EXISTS chat_messages (
  id          TEXT PRIMARY KEY,            -- the id the phone made, so a resend is idempotent
  shop_id     TEXT NOT NULL REFERENCES shops(id),
  user_id     TEXT REFERENCES users(id),
  role        TEXT NOT NULL CHECK (role IN ('user', 'qurie')),
  at          TEXT NOT NULL,               -- when the phone said it, ISO
  text        TEXT,
  card        TEXT,                        -- JSON, the card that was shown
  attachment  TEXT,                        -- JSON: name, mime, kind. Never the bytes.
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS chat_messages_shop_at ON chat_messages (shop_id, at);
