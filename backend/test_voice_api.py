"""Qurie's voice loop end to end: Bulbul makes a Hindi clip, /api/v1/voice hears it with
Saaras, answers with the brain, and speaks back. About 4 Sarvam calls and 1 brain call.

    backend/.venv/Scripts/python.exe test_voice_api.py
"""
import base64
import os
import re
import sys
import tempfile
from pathlib import Path

os.environ["APP_ENV"] = "dev"
os.environ["DATABASE_URL"] = ""  # SQLite on a temp file; this test is about voice, not the database

from fastapi.testclient import TestClient  # noqa: E402

from app import db, migrate  # noqa: E402

db.DB_PATH = Path(tempfile.mkdtemp()) / "test.db"
db.init_db()
migrate.run()

from app.main import app  # noqa: E402
from app import voice_api  # noqa: E402

c = TestClient(app)


def login():
    c.post("/api/v1/auth/otp/send", json={"phone": "9111111111"})
    tok = c.post("/api/v1/auth/otp/verify", json={"phone": "9111111111", "code": "123456"}).json()
    h = {"Authorization": f"Bearer {tok['access_token']}"}
    r = c.post("/api/v1/shops", json={"owner_name": "Ramesh", "name": "Sharma Hardware", "type": "hardware", "city": "Pune"}, headers=h)
    if r.status_code == 200:  # first login makes the shop; later logins already have it
        h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return h


def test_voice_round_trip():
    h = login()
    clip = base64.b64decode(voice_api.speak("नमस्ते Qurie, शर्मा को कितना देना है?", "hi-IN"))
    assert len(clip) > 2000, "Bulbul returned no audio"
    r = c.post("/api/v1/voice", files={"audio": ("clip.mp3", clip, "audio/mpeg")}, data={"history": "[]"}, headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    print("transcript:", body["transcript"], "| language:", body["language"])
    print("answer:", body["answer"])
    assert body["transcript"], "Saaras heard nothing"
    assert "शर्मा" in body["transcript"] or "sharma" in body["transcript"].lower()
    assert body["answer"] and body["audio_b64"] and len(body["audio_b64"]) > 1000


def test_silence_returns_empty():
    h = login()
    r = c.post("/api/v1/voice", files={"audio": ("clip.wav", b"\0" * 500, "audio/wav")}, headers=h)
    assert r.status_code == 200 and r.json()["transcript"] == "" and r.json()["audio_b64"] is None


def test_ask_with_notebook():
    """The brain answers a date question from the phone's notebook, and names the person the answer is about."""
    h = login()
    context = {
        "today": "2026-09-11",
        "people": [{"id": "prasad", "kind": "supplier", "name": "Prasad Lubricants", "phone": "0836-2234567", "creditDays": 21},
                   {"id": "ramesh", "kind": "customer", "name": "Ramesh", "phone": "", "creditDays": 30}],
        "txns": [{"id": "t1", "personId": "prasad", "date": "2026-09-09T13:22:00+05:30", "kind": "bill", "number": "PL-4471",
                  "description": "Printed bill", "amountPaise": 2121300, "status": "outstanding"},
                 {"id": "t2", "personId": "ramesh", "date": "2026-09-10T10:00:00+05:30", "kind": "bill", "description": "Udhaar",
                  "amountPaise": 50000, "status": "outstanding", "dueDate": "2026-10-10"}],
    }
    r = c.post("/api/v1/ask", json={"text": "when was the bill issued for prasad", "language": "en-IN", "context": context}, headers=h)
    assert r.status_code == 200, r.text
    b = r.json()
    print("ask with notebook:", b["answer"], "| person_id:", b["person_id"])
    a = b["answer"].lower()
    assert any(x in a for x in ("9 sep", "09 sep", "2026-09-09", "9th sep", "09/09", "9/9", "september 9", "9 सितंबर")), a
    assert not re.search(r"[ऀ-ॿ]", a), "English question, so an English answer: " + a
    assert "2027" not in a and "due" not in a.replace("due to", "")  # no invented due date
    r = c.post("/api/v1/ask", json={"text": "how much does Mohan owe me", "language": "en-IN", "context": context}, headers=h)
    a = r.json()["answer"].lower()
    print("ask unknown name:", r.json()["answer"])
    assert "mohan" in a and not any(x in a for x in ("500", "21,213", "21213"))  # not in the notebook: say so, invent nothing


def test_ask_text():
    h = login()
    r = c.post("/api/v1/ask", json={"text": "What can you do?", "language": "en-IN"}, headers=h)
    assert r.status_code == 200 and r.json()["answer"]
    print("ask:", r.json()["answer"])


if __name__ == "__main__":
    if not os.getenv("SARVAM_API_KEY"):
        print("no SARVAM_API_KEY; skipping"); sys.exit(0)
    tests = (test_silence_returns_empty, test_ask_text, test_ask_with_notebook, test_voice_round_trip)
    for f in tests:
        f(); print("PASS", f.__name__)
    print(f"{len(tests)} passed")
