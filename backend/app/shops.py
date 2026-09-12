"""Shop setup after first login. Owner: Devansh.

POST /api/v1/shops        {owner_name, name, type?, address?, city?, lat?, lng?, gstin?} -> {shop, access_token}
GET  /api/v1/shops/me                                    -> shop
PATCH /api/v1/shops/me    any of the fields above        -> shop

A user has one shop in v1. Creating it links the user and returns a fresh access
token that carries the shop claim, so the app swaps its token after setup.
"""
import re
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from . import db
from .auth import JWT_ALGORITHM, JWT_SECRET, get_current_user
from .otp import ACCESS_DAYS, audit

router = APIRouter(prefix="/api/v1/shops", tags=["shops"])

SHOP_TYPES = {"hardware", "electrical", "pharmacy", "kirana", "other"}
GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def gstin_valid(g: str) -> bool:
    """Format plus the official mod-36 check digit."""
    if not re.fullmatch(r"\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]", g):
        return False
    total = 0
    for i, ch in enumerate(g[:14]):
        p = GSTIN_CHARS.index(ch) * (2 if i % 2 else 1)
        total += p // 36 + p % 36
    return GSTIN_CHARS[(36 - total % 36) % 36] == g[14]


class ShopIn(BaseModel):
    name: str
    type: str = "other"
    owner_name: str | None = None
    address: str | None = None
    city: str | None = None
    lat: float | None = None
    lng: float | None = None
    gstin: str | None = None          # not on the setup screen for now; kept for the CA pack later
    ca_name: str | None = None
    ca_phone: str | None = None


def clean(body: ShopIn) -> dict:
    name = (body.name or "").strip()
    if len(name) < 2:
        raise HTTPException(400, "Enter the shop name.")
    if body.type not in SHOP_TYPES:
        raise HTTPException(400, f"type must be one of {sorted(SHOP_TYPES)}")
    gstin = (body.gstin or "").strip().upper() or None
    if gstin and not gstin_valid(gstin):
        raise HTTPException(400, "GSTIN does not look right. Check the 15 characters.")
    if body.lat is not None and not (-90 <= body.lat <= 90 and body.lng is not None and -180 <= body.lng <= 180):
        raise HTTPException(400, "Location does not look right.")
    return {"name": name, "type": body.type, "gstin": gstin,
            "scheme": "regular" if gstin else "unregistered",
            "state_code": gstin[:2] if gstin else None,
            "owner_name": (body.owner_name or "").strip() or None,
            "address": (body.address or "").strip() or None,
            "lat": body.lat, "lng": body.lng,
            "city": (body.city or "").strip() or None,
            "ca_name": (body.ca_name or "").strip() or None,
            "ca_phone": (body.ca_phone or "").strip() or None}


def access_token(user_id: str, shop_id: str, role: str) -> str:
    t = datetime.now(timezone.utc)
    return jwt.encode({"sub": user_id, "shop": shop_id, "role": role, "typ": "access",
                       "iat": int(t.timestamp()), "exp": int((t + timedelta(days=ACCESS_DAYS)).timestamp())},
                      JWT_SECRET, algorithm=JWT_ALGORITHM)


@router.post("")
def create_shop(body: ShopIn, user: dict = Depends(get_current_user)):
    if user.get("shop_id"):
        raise HTTPException(409, "This account already has a shop.")
    fields = clean(body)
    shop_id = str(uuid.uuid4())
    with db.connect() as conn:
        conn.execute(
            "INSERT INTO shops (id, name, type, gstin, scheme, state_code, address, lat, lng, city, ca_name, ca_phone, plan_until) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (shop_id, fields["name"], fields["type"], fields["gstin"], fields["scheme"], fields["state_code"],
             fields["address"], fields["lat"], fields["lng"], fields["city"], fields["ca_name"], fields["ca_phone"],
             (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%S")),
        )
        conn.execute("UPDATE users SET shop_id = ?, name = COALESCE(?, name) WHERE id = ?", (shop_id, fields["owner_name"], user["id"]))
        audit(conn, "shop.create", user["id"], shop_id, shop_id)
        shop = dict(conn.execute("SELECT * FROM shops WHERE id = ?", (shop_id,)).fetchone())
    return {"shop": shop, "owner_name": fields["owner_name"] or user.get("name"),
            "access_token": access_token(user["id"], shop_id, user.get("role") or "owner")}


@router.get("/me")
def my_shop(user: dict = Depends(get_current_user)):
    if not user.get("shop_id"):
        raise HTTPException(404, "No shop yet.")
    with db.connect() as conn:
        return dict(conn.execute("SELECT * FROM shops WHERE id = ?", (user["shop_id"],)).fetchone())


@router.patch("/me")
def update_shop(body: ShopIn, user: dict = Depends(get_current_user)):
    if not user.get("shop_id"):
        raise HTTPException(404, "No shop yet.")
    fields = clean(body)
    with db.connect() as conn:
        conn.execute(
            "UPDATE shops SET name=?, type=?, gstin=?, scheme=?, state_code=?, address=?, lat=?, lng=?, city=?, ca_name=?, ca_phone=? WHERE id=?",
            (*[fields[k] for k in ("name", "type", "gstin", "scheme", "state_code", "address", "lat", "lng", "city", "ca_name", "ca_phone")],
             user["shop_id"]),
        )
        if fields["owner_name"]:
            conn.execute("UPDATE users SET name = ? WHERE id = ?", (fields["owner_name"], user["id"]))
        audit(conn, "shop.update", user["id"], user["shop_id"], user["shop_id"])
        return dict(conn.execute("SELECT * FROM shops WHERE id = ?", (user["shop_id"],)).fetchone())
