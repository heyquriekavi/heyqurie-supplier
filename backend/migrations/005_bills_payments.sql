-- 005: bills (invoices to shops, purchase bills from brands) and payments against them.

CREATE TABLE IF NOT EXISTS bills (
  id                TEXT PRIMARY KEY,
  shop_id           TEXT NOT NULL REFERENCES shops(id),
  kind              TEXT NOT NULL DEFAULT 'sale'
                    CHECK (kind IN ('sale', 'purchase')),
  customer_id       TEXT REFERENCES customers(id),
  supplier_id       TEXT REFERENCES suppliers(id),

  -- the two parties as printed on the bill, kept even if the master record changes later
  seller_name       TEXT,
  seller_gstin      TEXT,
  seller_licence    TEXT,
  seller_phone      TEXT,
  buyer_name        TEXT,
  buyer_gstin       TEXT,
  buyer_licence     TEXT,

  number            TEXT,
  bill_date         TEXT NOT NULL,
  due_date          TEXT,
  salesman          TEXT,
  order_number      TEXT,

  subtotal_paise    INTEGER,
  discount_paise    INTEGER NOT NULL DEFAULT 0,
  sgst_paise        INTEGER NOT NULL DEFAULT 0,
  cgst_paise        INTEGER NOT NULL DEFAULT 0,
  igst_paise        INTEGER NOT NULL DEFAULT 0,
  adjust_paise      INTEGER NOT NULL DEFAULT 0,
  total_paise       INTEGER NOT NULL,

  status            TEXT NOT NULL DEFAULT 'confirmed'
                    CHECK (status IN ('draft', 'confirmed', 'rejected')),
  payment_status    TEXT NOT NULL DEFAULT 'unpaid'
                    CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  source            TEXT,
  image_path        TEXT,
  terms             TEXT,
  confirmed_at      TEXT,
  deleted_at        TEXT,
  created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS bills_shop_date     ON bills (shop_id, kind, bill_date);
CREATE INDEX IF NOT EXISTS bills_shop_customer ON bills (shop_id, customer_id);
CREATE INDEX IF NOT EXISTS bills_shop_supplier ON bills (shop_id, supplier_id);
CREATE INDEX IF NOT EXISTS bills_shop_due      ON bills (shop_id, due_date);

CREATE TABLE IF NOT EXISTS bill_items (
  id             TEXT PRIMARY KEY,
  shop_id        TEXT NOT NULL REFERENCES shops(id),
  bill_id        TEXT NOT NULL REFERENCES bills(id),
  line_no        INTEGER NOT NULL,
  qty            REAL NOT NULL,
  free_qty       REAL NOT NULL DEFAULT 0,
  pack           TEXT,
  product        TEXT NOT NULL,
  batch          TEXT,
  expiry         TEXT,
  hsn            TEXT,
  mrp_paise      INTEGER,
  rate_paise     INTEGER,
  discount_pct   REAL NOT NULL DEFAULT 0,
  sgst_pct       REAL NOT NULL DEFAULT 0,
  cgst_pct       REAL NOT NULL DEFAULT 0,
  igst_pct       REAL NOT NULL DEFAULT 0,
  amount_paise   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS bill_items_bill ON bill_items (shop_id, bill_id, line_no);

CREATE TABLE IF NOT EXISTS payments (
  id            TEXT PRIMARY KEY,
  shop_id       TEXT NOT NULL REFERENCES shops(id),
  bill_id       TEXT REFERENCES bills(id),
  customer_id   TEXT REFERENCES customers(id),
  supplier_id   TEXT REFERENCES suppliers(id),
  direction     TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  amount_paise  INTEGER NOT NULL,
  paid_on       TEXT NOT NULL,
  mode          TEXT CHECK (mode IN ('cash', 'upi', 'bank', 'cheque', 'other')),
  reference     TEXT,
  note          TEXT,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS payments_shop_bill ON payments (shop_id, bill_id);
