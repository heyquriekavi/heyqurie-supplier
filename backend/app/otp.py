"""Mobile login: phone number + 6-digit OTP. Owner: Devansh.

POST /api/v1/auth/otp/send    {phone}        -> {ok, retry_after_seconds, dev_code?}
POST /api/v1/auth/otp/verify  {phone, code}  -> {access_token, refresh_token, user, is_new}
POST /api/v1/auth/refresh     {refresh_token}-> {access_token, refresh_token}
POST /api/v1/auth/logout      {refresh_token}-> {ok}
GET  /api/v1/auth/me                          -> user (+ shop)

Rules: code lives 5 minutes; 3 sends per phone per 15 minutes; 5 wrong tries lock the
phone for 10 minutes; access token 30 days; refresh token 180 days, rotated on every use.
Dev mode (APP_ENV != production): the code is always 123456 and no SMS goes out.
"""
import hashlib
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from . import db, sms
from .auth import JWT_ALGORITHM, JWT_SECRET, get_current_user

router = APIRouter(prefix="/api/v1/auth", tags=["mobile auth"])

OTP_PEPPER = os.getenv("OTP_PEPPER", "")
DEV_CODE = "123456"
CODE_TTL = timedelta(minutes=5)
SEND_WINDOW, SEND_LIMIT = timedelta(minutes=15), 3
MAX_TRIES, LOCK_FOR = 5, timedelta(minutes=10)
RESEND_AFTER = 30
ACCESS_DAYS, REFRESH_DAYS = 30, 180


def now():
    return datetime.now(timezone.utc)


def iso(t):
    return t.strftime("%Y-%m-%dT%H:%M:%S")


def parse(s):
    return datetime.strptime(s[:19].replace(" ", "T"), "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)


def normalise_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", raw or "")
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    if not re.fullmatch(r"[6-9]\d{9}", digits):
        raise HTTPException(400, "Enter a 10-digit Indian mobile number.")
    return "+91" + digits


def code_hash(phone: str, code: str) -> str:
    return hashlib.sha256(f"{OTP_PEPPER}|{phone}|{code}".encode()).hexdigest()


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class PhoneIn(BaseModel):
    phone: str


class VerifyIn(BaseModel):
    phone: str
    code: str


class RefreshIn(BaseModel):
    refresh_token: str


@router.post("/otp/send")
def send_otp(body: PhoneIn):
    phone = normalise_phone(body.phone)
    t = now()
    with db.connect() as conn:
        latest = conn.execute(
            "SELECT locked_until FROM otp_codes WHERE phone = ? ORDER BY created_at DESC LIMIT 1", (phone,)
        ).fetchone()
        if latest and latest["locked_until"] and parse(latest["locked_until"]) > t:
            raise HTTPException(423, "Too many wrong codes. Try again in 10 minutes.")
        sent = conn.execute(
            "SELECT COUNT(*) FROM otp_codes WHERE phone = ? AND created_at > ?",
            (phone, iso(t - SEND_WINDOW)),
        ).fetchone()[0]
        if sent >= SEND_LIMIT and sms.is_production():  # no send limit in dev; testing hits it in a minute
            raise HTTPException(429, "Too many codes sent. Try again in 15 minutes.")
        code = DEV_CODE if not sms.is_production() else f"{secrets.randbelow(10**6):06d}"
        conn.execute("UPDATE otp_codes SET consumed_at = ? WHERE phone = ? AND consumed_at IS NULL", (iso(t), phone))
        conn.execute(
            "INSERT INTO otp_codes (id, phone, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), phone, code_hash(phone, code), iso(t + CODE_TTL), iso(t)),
        )
    try:
        sms.send_otp(phone, code)
    except RuntimeError as e:
        raise HTTPException(502, f"SMS could not be sent. {e}")
    out = {"ok": True, "retry_after_seconds": RESEND_AFTER}
    if not sms.is_production():
        out["dev_code"] = code
    return out


def issue_tokens(conn, user: dict) -> dict:
    t = now()
    access = jwt.encode(
        {"sub": user["id"], "shop": user.get("shop_id"), "role": user.get("role") or "owner",
         "typ": "access", "iat": int(t.timestamp()), "exp": int((t + timedelta(days=ACCESS_DAYS)).timestamp())},
        JWT_SECRET, algorithm=JWT_ALGORITHM,
    )
    refresh = secrets.token_urlsafe(48)
    conn.execute(
        "INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), user["id"], token_hash(refresh), iso(t + timedelta(days=REFRESH_DAYS)), iso(t)),
    )
    return {"access_token": access, "refresh_token": refresh}


def audit(conn, action, user_id=None, shop_id=None, target_id=None, meta=None):
    conn.execute(
        "INSERT INTO audit_log (id, shop_id, user_id, action, target_id, meta) VALUES (?, ?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), shop_id, user_id, action, target_id, meta),
    )


@router.post("/otp/verify")
def verify_otp(body: VerifyIn):
    phone = normalise_phone(body.phone)
    code = re.sub(r"\D", "", body.code or "")
    t = now()
    with db.connect() as conn:
        row = conn.execute(
            "SELECT * FROM otp_codes WHERE phone = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1", (phone,)
        ).fetchone()
        if not row:
            raise HTTPException(400, "Ask for a code first.")
        if row["locked_until"] and parse(row["locked_until"]) > t:
            raise HTTPException(423, "Too many wrong codes. Try again in 10 minutes.")
        if parse(row["expires_at"]) < t:
            raise HTTPException(410, "Code expired. Ask for a new one.")
        if not secrets.compare_digest(row["code_hash"], code_hash(phone, code)):
            tries = row["attempts"] + 1
            locked = iso(t + LOCK_FOR) if tries >= MAX_TRIES else None
            conn.execute("UPDATE otp_codes SET attempts = ?, locked_until = ? WHERE id = ?", (tries, locked, row["id"]))
            conn.commit()  # the with-block rolls back on the raise below; the wrong try must stick
            if locked:
                raise HTTPException(423, "Too many wrong codes. Try again in 10 minutes.")
            raise HTTPException(400, f"Wrong code. {MAX_TRIES - tries} tries left.")
        conn.execute("UPDATE otp_codes SET consumed_at = ? WHERE id = ?", (iso(t), row["id"]))

        user = conn.execute("SELECT * FROM users WHERE phone = ?", (phone,)).fetchone()
        is_new = user is None
        if is_new:
            uid = str(uuid.uuid4())
            conn.execute("INSERT INTO users (id, phone, role, language, created_at) VALUES (?, ?, 'owner', 'hi', ?)", (uid, phone, iso(t)))
            user = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
        user = dict(user)
        conn.execute("UPDATE users SET last_seen_at = ? WHERE id = ?", (iso(t), user["id"]))
        tokens = issue_tokens(conn, user)
        audit(conn, "login", user["id"], user.get("shop_id"))
    return {**tokens, "user": public_user(user), "is_new": is_new}


@router.post("/refresh")
def refresh(body: RefreshIn):
    t = now()
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM refresh_tokens WHERE token_hash = ?", (token_hash(body.refresh_token),)).fetchone()
        if not row or row["revoked_at"] or parse(row["expires_at"]) < t:
            raise HTTPException(401, "Please sign in again.")
        conn.execute("UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?", (iso(t), row["id"]))
        user = conn.execute("SELECT * FROM users WHERE id = ?", (row["user_id"],)).fetchone()
        if not user:
            raise HTTPException(401, "Please sign in again.")
        return issue_tokens(conn, dict(user))


@router.post("/logout")
def logout(body: RefreshIn):
    with db.connect() as conn:
        conn.execute("UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL",
                     (iso(now()), token_hash(body.refresh_token)))
    return {"ok": True}


def public_user(u: dict) -> dict:
    return {k: u.get(k) for k in ("id", "phone", "name", "role", "shop_id", "language", "voice_replies")}


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    out = public_user(user)
    if user.get("shop_id"):
        with db.connect() as conn:
            shop = conn.execute("SELECT * FROM shops WHERE id = ?", (user["shop_id"],)).fetchone()
        out["shop"] = dict(shop) if shop else None
    return out
