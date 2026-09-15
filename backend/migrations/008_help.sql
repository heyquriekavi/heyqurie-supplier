-- What an owner types on the Help screen lands here, for us to read and answer
-- by phone or WhatsApp. Same shape as the retail backend's, so one query reads
-- both if they are ever put side by side.
CREATE TABLE IF NOT EXISTS help_messages (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    shop_id     TEXT,
    phone       TEXT,
    text        TEXT NOT NULL,
    answered_at TEXT,
    created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS help_messages_new ON help_messages (created_at);
