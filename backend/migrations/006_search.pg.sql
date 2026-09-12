-- 006 (Postgres): trigram search, so "which bill had the brufen" finds
-- BRUFEN-400 without an exact match, and a misspelled shop name still lands.
-- Trigrams, not embeddings: item and party names are short and controlled, so
-- character overlap beats semantic similarity and costs nothing per query.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS bill_items_product_trgm ON bill_items USING gin (product gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_name_trgm ON customers USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS suppliers_name_trgm ON suppliers USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS bills_shop_number ON bills (shop_id, number);
