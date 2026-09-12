"""Bill reading end to end on one real receipt (Wine Town, Pune): one Sarvam extract call.

    backend/.venv/Scripts/python.exe test_bills.py
"""
import os
import sys
import tempfile
from pathlib import Path

os.environ["APP_ENV"] = "dev"
os.environ["DATABASE_URL"] = ""

from fastapi.testclient import TestClient  # noqa: E402

from app import db, migrate  # noqa: E402

db.DB_PATH = Path(tempfile.mkdtemp()) / "test.db"
db.init_db()
migrate.run()

from app.main import app  # noqa: E402
from app.bills import gstin_repair, parse_date, shape  # noqa: E402

c = TestClient(app)
BILL = Path(__file__).parent / "tools" / "bills" / "gh_example3.jpg"


def login():
    c.post("/api/v1/auth/otp/send", json={"phone": "9222222222"})
    tok = c.post("/api/v1/auth/otp/verify", json={"phone": "9222222222", "code": "123456"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_dates_parse():
    assert parse_date("16/2/24") == "2024-02-16"
    assert parse_date("2026-07-10") == "2026-07-10"
    assert parse_date("08May22") == "2022-05-08"
    assert parse_date("26/08/2026 10:21:25 AM") == "2026-08-26"
    assert parse_date("14:05 08May22") == "2022-05-08"
    assert parse_date("nonsense") is None


def test_gstin_repair():
    assert gstin_repair("27AAECT060601Z2") == "27AAECT0606Q1Z2"   # Starbucks: Q read as 0 (Phase 0 miss)
    assert gstin_repair("27AAXFB8846J1ZJ") is None                # already valid: nothing to repair
    assert gstin_repair("06AAAPG5928M1ZM") is None                # Quorum: three characters wrong, no single fix passes
    assert gstin_repair("INPUTHERE") is None
    f, c, w = shape({"seller_gstin": "27AAECT060601Z2"}, "printed")
    assert f["gstin"] == "27AAECT0606Q1Z2" and f["gstin_valid"] and "gstin_repaired" in w and c["gstin"] == 0.8
    f, c, w = shape({"seller_gstin": "INPUT HERE"}, "printed")
    assert f["gstin"] is None and "gstin_unreadable" in w and c["gstin"] == 0


def test_shape_validators():
    raw = {"seller_name": "X", "seller_gstin": "06AAAPG5928M1ZM", "invoice_number": "5", "bill_date": "1/1/25",
           "total_amount": 100, "items": [{"description": "a", "amount": 60}, {"description": "b", "amount": 30}]}
    fields, conf, warnings = shape(raw, "printed")
    assert fields["gstin_valid"] is False and "gstin_checksum_failed" in warnings and conf["gstin"] == 0.3
    assert "items_do_not_add_up" in warnings and conf["total"] == 0.6
    assert fields["total_paise"] == 10000 and fields["date"] == "2025-01-01"
    # items + tax = total is a bill that adds up (Wine Town: 1366 + 18.40 = 1384)
    _, conf, warnings = shape({"total_amount": 1384, "tax_amount": 18.4, "items": [{"description": "a", "amount": 1366}]}, "printed")
    assert "items_do_not_add_up" not in warnings and conf["total"] == 0.95


def test_read_real_bill():
    h = login()
    with open(BILL, "rb") as f:
        r = c.post("/api/v1/bills/read", files={"file": ("bill.jpg", f, "image/jpeg")}, data={"source": "printed"}, headers=h)
    assert r.status_code == 200, r.text
    b = r.json()
    f = b["fields"]
    print({k: f[k] for k in ("supplier_name", "gstin", "gstin_valid", "number", "date", "total_paise")}, "| items:", len(f["items"]), "| conf:", b["confidence"], "| warnings:", b["warnings"], "|", b["seconds"], "s")
    assert f["gstin"] == "27AAXFB8846J1ZJ" and f["gstin_valid"] is True
    assert f["total_paise"] == 138400 and f["date"] == "2022-04-09"
    assert len(f["items"]) == 3 and b["confidence"]["gstin"] == 0.95


if __name__ == "__main__":
    if not os.getenv("SARVAM_API_KEY"):
        print("no SARVAM_API_KEY; skipping"); sys.exit(0)
    tests = (test_dates_parse, test_gstin_repair, test_shape_validators, test_read_real_bill)
    if "--offline" in sys.argv:
        tests = tests[:-1]
    for t in tests:
        t(); print("PASS", t.__name__)
    print(f"{len(tests)} passed")
