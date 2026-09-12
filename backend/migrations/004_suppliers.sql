-- 004: brands we buy from (the "suppliers" side of the distributor).

CREATE TABLE IF NOT EXISTS suppliers (
  id               TEXT PRIMARY KEY,
  shop_id          TEXT NOT NULL REFERENCES shops(id),
  name             TEXT NOT NULL,
  name_normalized  TEXT NOT NULL,
  phone            TEXT,
  gstin            TEXT,
  credit_days      INTEGER NOT NULL DEFAULT 30,
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (shop_id, name_normalized)
);

CREATE INDEX IF NOT EXISTS suppliers_gstin ON suppliers (shop_id, gstin);
