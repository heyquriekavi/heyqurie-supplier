-- Mobile app login: shops, phone users, OTP codes, refresh tokens, audit log.
-- Same SQL on SQLite (dev) and Postgres (prod). Money in paise, ids are uuid text.

CREATE TABLE IF NOT EXISTS shops (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    type        TEXT DEFAULT 'other',          -- hardware | electrical | pharmacy | kirana | other
    gstin       TEXT,
    scheme      TEXT DEFAULT 'unregistered',   -- regular | composition | unregistered
    state_code  TEXT,
    city        TEXT,
    pin         TEXT,
    ca_name     TEXT,
    ca_phone    TEXT,
    ca_email    TEXT,
    plan        TEXT DEFAULT 'trial',          -- trial | bills | plus | free
    plan_until  TEXT,
    created_at  TEXT DEFAULT CURRENT_TIMESTAMP
);

-- users existed with email NOT NULL (desktop, Google). Rebuild so phone-only users fit.
CREATE TABLE users_new (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE,
    phone         TEXT UNIQUE,                 -- E.164, +91XXXXXXXXXX
    name          TEXT,
    picture       TEXT,
    role          TEXT DEFAULT 'owner',        -- owner | staff | ca | admin
    shop_id       TEXT REFERENCES shops(id),
    language      TEXT DEFAULT 'hi',           -- hi | en
    voice_replies INTEGER DEFAULT 0,
    created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
    last_seen_at  TEXT
);
INSERT INTO users_new (id, email, name, picture, created_at)
    SELECT id, email, name, picture, created_at FROM users;
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

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
