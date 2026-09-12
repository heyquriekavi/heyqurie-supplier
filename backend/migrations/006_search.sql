-- 006: finding a bill by what is on it. SQLite has no trigram index; LIKE over
-- the same columns is fast enough on one shop's data, so this file only adds
-- the plain indexes. See 006_search.pg.sql for the Postgres form.

CREATE INDEX IF NOT EXISTS bill_items_product ON bill_items (shop_id, product);
CREATE INDEX IF NOT EXISTS bills_shop_number ON bills (shop_id, number);
