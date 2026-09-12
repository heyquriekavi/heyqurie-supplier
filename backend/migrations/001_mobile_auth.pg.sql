-- Postgres form of 001_mobile_auth.sql. On Supabase there is no desktop schema, so users
-- is created here directly in its final shape.

CREATE TABLE IF NOT EXISTS shops (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    type        TEXT DEFAULT 'other',
    gstin       TEXT,
    scheme      TEXT DEFAULT 'unregistered',
    state_code  TEXT,
    city        TEXT,
    pin         TEXT,
    ca_name     TEXT,
    ca_phone    TEXT,
    ca_email    TEXT,
    plan        TEXT DEFAULT 'trial',
    plan_until  TEXT,
    created_at  TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE,
    phone         TEXT UNIQUE,
    name          TEXT,
    picture       TEXT,
    role          TEXT DEFAULT 'owner',
    shop_id       TEXT REFERENCES shops(id),
    language      TEXT DEFAULT 'hi',
    voice_replies INTEGER DEFAULT 0,
    created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
    last_seen_at  TEXT
);

CREATE TABLE IF NOT EXISTS otp_codes (
    id           TEXT PRIMARY KEY,
    phone        TEXT NOT NULL,
    code_hash    TEXT NOT NULL,
    expires_at   TEXT NOT NULL,
    attempts     INTEGER DEFAULT 0,
    locked_until TEXT,
    consumed_at  TEXT,
    created_at   TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS otp_codes_phone ON otp_codes (phone, created_at);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id),
    token_hash  TEXT NOT NULL UNIQUE,
    expires_at  TEXT NOT NULL,
    revoked_at  TEXT,
    created_at  TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
    id          TEXT PRIMARY KEY,
    shop_id     TEXT,
    user_id     TEXT,
    action      TEXT NOT NULL,
    target_id   TEXT,
    meta        TEXT,
    created_at  TEXT DEFAULT CURRENT_TIMESTAMP
);
