"""Chat history. Owner: Divya.

GET    /api/v1/chat?since=&limit=   -> {messages: [...]}
POST   /api/v1/chat  {messages: []} -> {saved: n}      idempotent on the phone's id
DELETE /api/v1/chat                 -> {deleted: n}

The phone keeps its own copy and reads from it first; this is the durable one,
so a reinstall or a second device gets the conversation back. Only the shop the
token names is ever read or written.
"""
import json

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from . import db
from .auth import get_current_user
from .ledger import shop_of

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])

MAX_BATCH = 200
MAX_TEXT = 4000
MAX_JSON = 4000
PAGE = 400


class MessageIn(BaseModel):
    id: str
    role: str
    at: str
    text: str | None = None
    card: dict | None = None
    attachment: dict | None = None


class Batch(BaseModel):
    messages: list[MessageIn]


def as_json(value, limit: int = MAX_JSON) -> str | None:
    """A card or attachment as text. Oversized means something is wrong; drop it
    rather than store it, since history is worth less than a working write."""
    if not value:
        return None
    out = json.dumps(value, separators=(",", ":"))
    return out if len(out) <= limit else None


@router.get("")
def history(since: str | None = Query(None), limit: int = Query(PAGE, ge=1, le=PAGE),
            user: dict = Depends(get_current_user)):
    shop_id = shop_of(user)
    with db.connect() as conn:
        if since:
            rows = conn.execute(
                "SELECT * FROM chat_messages WHERE shop_id = ? AND at > ? ORDER BY at LIMIT ?",
                (shop_id, since, limit),
            ).fetchall()
        else:
            # The tail, oldest-first once reversed: opening the app wants the end.
            rows = conn.execute(
                "SELECT * FROM chat_messages WHERE shop_id = ? ORDER BY at DESC LIMIT ?",
                (shop_id, limit),
            ).fetchall()
            rows = list(reversed(rows))
    out = []
    for r in rows:
        d = dict(r)
        out.append({
            "id": d["id"], "role": d["role"], "at": d["at"], "text": d["text"],
            "card": json.loads(d["card"]) if d["card"] else None,
            "attachment": json.loads(d["attachment"]) if d["attachment"] else None,
        })
    return {"messages": out}


@router.post("")
def save(body: Batch, user: dict = Depends(get_current_user)):
    shop_id = shop_of(user)
    if len(body.messages) > MAX_BATCH:
        raise HTTPException(413, f"Send at most {MAX_BATCH} messages at a time.")
    saved = 0
    with db.connect() as conn:
        for m in body.messages:
            if m.role not in ("user", "qurie") or not m.id or not m.at:
                continue
            row = (m.id, shop_id, user["id"], m.role, m.at, (m.text or "")[:MAX_TEXT] or None,
                   as_json(m.card), as_json(m.attachment))
            if db.IS_PG:
                conn.execute(
                    "INSERT INTO chat_messages (id, shop_id, user_id, role, at, text, card, attachment) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET "
                    "text = EXCLUDED.text, card = EXCLUDED.card, attachment = EXCLUDED.attachment", row)
            else:
                conn.execute(
                    "INSERT OR REPLACE INTO chat_messages (id, shop_id, user_id, role, at, text, card, attachment) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)", row)
            saved += 1
    return {"saved": saved}


@router.delete("")
def clear(user: dict = Depends(get_current_user)):
    shop_id = shop_of(user)
    with db.connect() as conn:
        before = conn.execute("SELECT COUNT(*) FROM chat_messages WHERE shop_id = ?", (shop_id,)).fetchone()[0]
        conn.execute("DELETE FROM chat_messages WHERE shop_id = ?", (shop_id,))
    return {"deleted": before}
