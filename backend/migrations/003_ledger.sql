-- 003: the ledger. Shops we sell to, brands we buy from, bills, payments.
-- Plain SQL that runs on SQLite (local) and Postgres (Supabase) unchanged.
-- Money in paise as integers. Dates as ISO text. Every table carries shop_id.

CREATE TABLE IF NOT EXISTS customers (
  id               TEXT PRIMARY KEY,
  shop_id          TEXT NOT NULL REFERENCES shops(id),
  name             TEXT NOT NULL,
  name_normalized  TEXT NOT NULL,
  phone            TEXT,
  gstin            TEXT,
  credit_days      INTEGER NOT NULL DEFAULT 21,
  paired           INTEGER NOT NULL DEFAULT 0,
  beat             TEXT,
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (shop_id, name_normalized)
);
