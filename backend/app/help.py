"""Help. Owner: Divya.

POST /api/v1/help  {text} -> the stored message
GET  /api/v1/help         -> this owner's messages, newest first

The owner sees a number to call and a box to type in. What they type is kept in
help_messages with their phone number attached, so it can be answered without
them having to repeat who they are.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from . import db
from .auth import get_current_user

router = APIRouter(prefix="/api/v1/help", tags=["help"])

MAX_TEXT = 2000
# Enough to stop a stuck retry filling the table, loose enough to never block
# someone with a real problem writing two or three times.
MAX_PER_DAY = 20


class HelpIn(BaseModel):
    text: str


@router.post("")
def send_help(body: HelpIn, user: dict = Depends(get_current_user)):
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(400, "Type a message first.")
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    row = {
        "id": str(uuid.uuid4()), "user_id": user["id"], "shop_id": user.get("shop_id"),
        "phone": user.get("phone"), "text": text[:MAX_TEXT],
        "created_at": now.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    with db.connect() as conn:
        sent = conn.execute(
            "SELECT COUNT(*) FROM help_messages WHERE user_id = ? AND created_at >= ?",
            (user["id"], today),
        ).fetchone()[0]
        if sent >= MAX_PER_DAY:
            raise HTTPException(429, "That is a lot of messages today. Call us instead and we will sort it out.")
        conn.execute(
            "INSERT INTO help_messages (id, user_id, shop_id, phone, text, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (row["id"], row["user_id"], row["shop_id"], row["phone"], row["text"], row["created_at"]),
        )
    print(f"[help] {row['phone']}: {text[:120]!r}", flush=True)
    return row


@router.get("")
def my_help(user: dict = Depends(get_current_user)):
    with db.connect() as conn:
        rows = conn.execute(
            "SELECT id, text, answered_at, created_at FROM help_messages WHERE user_id = ? "
            "ORDER BY created_at DESC LIMIT 100",
            (user["id"],),
        ).fetchall()
    return [dict(r) for r in rows]
