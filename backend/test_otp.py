"""Mobile OTP login, end to end on a throwaway SQLite file, in dev mode.

    backend/.venv/Scripts/python.exe test_otp.py      (tests run in file order)
"""
import os
import sys
import tempfile
from pathlib import Path

os.environ["JWT_SECRET"] = "test-secret-" + "x" * 40
os.environ["APP_ENV"] = "dev"
# SQLite on a temp file by default. QURIE_TEST_PG=1 runs the same checks on the Supabase
# database in backend/.env (it leaves test rows there; clean them with --clean-pg).
if os.environ.get("QURIE_TEST_PG") != "1":
    os.environ["DATABASE_URL"] = ""

from fastapi.testclient import TestClient  # noqa: E402

from app import db, migrate  # noqa: E402

if not db.IS_PG:
    db.DB_PATH = Path(tempfile.mkdtemp()) / "test.db"
db.init_db()
migrate.run()
TEST_PHONES = ("+919876543210", "+919123456789", "+919000000001", "+919000000002")


def clean_pg():
    """Remove what these tests leave behind on a shared database."""
    with db.connect() as conn:
        ids = [r[0] for r in conn.execute(
            f"SELECT id FROM users WHERE phone IN ({','.join('?' * len(TEST_PHONES))})", TEST_PHONES).fetchall()]
        for uid in ids:
            conn.execute("DELETE FROM refresh_tokens WHERE user_id = ?", (uid,))
            conn.execute("DELETE FROM audit_log WHERE user_id = ?", (uid,))
        shops = [r[0] for r in conn.execute(
            f"SELECT shop_id FROM users WHERE shop_id IS NOT NULL AND phone IN ({','.join('?' * len(TEST_PHONES))})", TEST_PHONES).fetchall()]
        conn.execute(f"DELETE FROM otp_codes WHERE phone IN ({','.join('?' * len(TEST_PHONES))})", TEST_PHONES)
        conn.execute(f"DELETE FROM users WHERE phone IN ({','.join('?' * len(TEST_PHONES))})", TEST_PHONES)
        for sid in shops:
            conn.execute("DELETE FROM audit_log WHERE shop_id = ?", (sid,))
            conn.execute("DELETE FROM shops WHERE id = ?", (sid,))
    print("cleaned", len(ids), "test users")


if db.IS_PG:
    clean_pg()  # start from a known state

from app.main import app  # noqa: E402

c = TestClient(app)
PHONE = "98765 43210"


def test_send_and_verify_new_user():
    r = c.post("/api/v1/auth/otp/send", json={"phone": PHONE})
    assert r.status_code == 200 and r.json()["dev_code"] == "123456"
    r = c.post("/api/v1/auth/otp/verify", json={"phone": PHONE, "code": "123456"})
    assert r.status_code == 200
    body = r.json()
    assert body["is_new"] is True and body["user"]["phone"] == "+919876543210"
    me = c.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200 and me.json()["phone"] == "+919876543210" and me.json()["shop_id"] is None


def test_code_is_single_use_and_user_is_reused():
    r = c.post("/api/v1/auth/otp/verify", json={"phone": PHONE, "code": "123456"})
    assert r.status_code == 400  # consumed
    c.post("/api/v1/auth/otp/send", json={"phone": PHONE})
    r = c.post("/api/v1/auth/otp/verify", json={"phone": PHONE, "code": "123456"})
    assert r.status_code == 200 and r.json()["is_new"] is False


def test_refresh_rotates_and_old_token_dies():
    c.post("/api/v1/auth/otp/send", json={"phone": PHONE})
    first = c.post("/api/v1/auth/otp/verify", json={"phone": PHONE, "code": "123456"}).json()
    r = c.post("/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert r.status_code == 200 and r.json()["refresh_token"] != first["refresh_token"]
    again = c.post("/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert again.status_code == 401
    assert c.post("/api/v1/auth/logout", json={"refresh_token": r.json()["refresh_token"]}).status_code == 200
    assert c.post("/api/v1/auth/refresh", json={"refresh_token": r.json()["refresh_token"]}).status_code == 401


def test_send_limit_three_per_window_in_production_only():
    from app import sms
    r = c.post("/api/v1/auth/otp/send", json={"phone": PHONE})
    assert r.status_code == 200  # dev: no limit
    sms.APP_ENV = "production"
    try:
        r = c.post("/api/v1/auth/otp/send", json={"phone": PHONE})
        assert r.status_code == 429  # more than 3 in 15 minutes
    finally:
        sms.APP_ENV = "dev"


def test_five_wrong_codes_lock():
    other = "9123456789"
    c.post("/api/v1/auth/otp/send", json={"phone": other})
    for left in (4, 3, 2, 1):
        r = c.post("/api/v1/auth/otp/verify", json={"phone": other, "code": "000000"})
        assert r.status_code == 400 and f"{left} tries left" in r.json()["detail"]
    r = c.post("/api/v1/auth/otp/verify", json={"phone": other, "code": "000000"})
    assert r.status_code == 423
    assert c.post("/api/v1/auth/otp/verify", json={"phone": other, "code": "123456"}).status_code == 423
    assert c.post("/api/v1/auth/otp/send", json={"phone": other}).status_code == 423


def test_bad_phone_and_refresh_token_not_accepted_as_access():
    assert c.post("/api/v1/auth/otp/send", json={"phone": "12345"}).status_code == 400
    assert c.post("/api/v1/auth/otp/send", json={"phone": "+44 7700 900123"}).status_code == 400
    c.post("/api/v1/auth/otp/send", json={"phone": "9000000001"})
    tok = c.post("/api/v1/auth/otp/verify", json={"phone": "9000000001", "code": "123456"}).json()
    r = c.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {tok['refresh_token']}"})
    assert r.status_code == 401


def test_shop_setup_links_user_and_reissues_token():
    c.post("/api/v1/auth/otp/send", json={"phone": "9000000002"})
    tok = c.post("/api/v1/auth/otp/verify", json={"phone": "9000000002", "code": "123456"}).json()
    h = {"Authorization": f"Bearer {tok['access_token']}"}
    assert c.get("/api/v1/shops/me", headers=h).status_code == 404
    bad = c.post("/api/v1/shops", json={"name": "Sharma Hardware", "type": "hardware", "gstin": "27AAECT060601Z2"}, headers=h)
    assert bad.status_code == 400  # fails the check digit
    r = c.post("/api/v1/shops", json={"owner_name": "Ramesh Sharma", "name": "Sharma Hardware", "type": "hardware",
                                      "gstin": "27aaxfb8846j1zj", "address": "12 MG Road, Pune", "city": "Pune",
                                      "lat": 18.52, "lng": 73.85}, headers=h)
    assert r.status_code == 200
    shop = r.json()["shop"]
    assert shop["gstin"] == "27AAXFB8846J1ZJ" and shop["scheme"] == "regular" and shop["state_code"] == "27"
    assert shop["address"] == "12 MG Road, Pune" and shop["lat"] == 18.52
    h2 = {"Authorization": f"Bearer {r.json()['access_token']}"}
    me = c.get("/api/v1/auth/me", headers=h2).json()
    assert me["shop_id"] == shop["id"] and me["shop"]["name"] == "Sharma Hardware" and me["name"] == "Ramesh Sharma"
    assert c.post("/api/v1/shops", json={"name": "X", "lat": 95, "lng": 0}, headers=h).status_code in (400, 409)
    assert c.post("/api/v1/shops", json={"name": "Second"}, headers=h2).status_code == 409
    assert c.patch("/api/v1/shops/me", json={"name": "Sharma Hardware & Paints", "type": "hardware"}, headers=h2).json()["name"] == "Sharma Hardware & Paints"


if __name__ == "__main__":
    if "--clean-pg" in sys.argv:
        clean_pg(); raise SystemExit
    tests = sorted((f for n, f in globals().items() if n.startswith("test_")), key=lambda f: f.__code__.co_firstlineno)
    for f in tests:
        f(); print("PASS", f.__name__)
    print(f"{len(tests)} passed")
