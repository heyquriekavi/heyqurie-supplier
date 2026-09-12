"""Qurie Supplier API. Owner: Divya.

The distributor's own backend. Nothing here is shared with the desktop product
or with the shop app: its own database (backend/.env), its own login, its own
port. Run:

    ../../backend/.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8001

Routes, all under /api/v1 except the health check:

  auth.py + otp.py   phone and OTP login, refresh, logout, me
  shops.py           the distributor's own business record
  ledger.py          shops and brands, bills with their lines and photo, payments, home
  bills.py           reading a bill photo
  voice_api.py       /voice (spoken) and /ask (typed), both answered by ask.py
  ask.py             retrieval: route the question, run our SQL, phrase the rows
  storage.py         where bill photos live
  migrate.py         applies migrations/*.sql at start, on Postgres and SQLite alike
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db, migrate
from .bills import router as bills_router
from .ledger import router as ledger_router
from .otp import router as otp_router
from .shops import router as shops_router
from .voice_api import router as voice_router

app = FastAPI(title="Qurie Supplier API")

# The phone app is served by Metro on another port, so every call it makes is
# cross-origin. Without this the browser blocks them before they are sent and
# the app can only report "network error". Local addresses only: this list must
# not grow a real domain without thinking about who else is on that domain.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+):\d+",
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(otp_router)     # /api/v1/auth/*
app.include_router(shops_router)   # /api/v1/shops
app.include_router(ledger_router)  # /api/v1/people, /bills, /payments, /home
app.include_router(bills_router)   # /api/v1/bills/read
app.include_router(voice_router)   # /api/v1/voice, /api/v1/ask

db.init_db()    # SQLite only: creates the base tables the first migration expects
migrate.run()


@app.get("/api/health")
def health():
    return {"ok": True}
