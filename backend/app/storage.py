"""Where bill photos live. Owner: Divya.

Supabase Storage (private bucket, service key) when SUPABASE_URL and SUPABASE_SERVICE_KEY
are set; otherwise a folder under backend/uploads so local testing needs no keys.
Paths are bills/{shop_id}/{bill_id}/{n}.{ext}. The app never gets a bucket URL: it asks the
API for the bytes, so the bucket stays private and shop scoping is enforced here.
"""
import os
from pathlib import Path

import httpx

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
BUCKET = os.getenv("STORAGE_BUCKET", "bills")
LOCAL_DIR = Path(__file__).resolve().parent.parent / "uploads"

USE_SUPABASE = bool(SUPABASE_URL and SERVICE_KEY)


def where() -> str:
    return "supabase" if USE_SUPABASE else "local"


def put(path: str, data: bytes, mime: str) -> str:
    """Store bytes at a bucket-relative path; returns the path to keep on the bill row."""
    if USE_SUPABASE:
        r = httpx.post(
            f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{path}",
            headers={"Authorization": f"Bearer {SERVICE_KEY}", "Content-Type": mime, "x-upsert": "true"},
            content=data,
            timeout=60,
        )
        if r.status_code >= 300:
            raise RuntimeError(f"storage upload failed: {r.status_code} {r.text[:120]}")
        return path
    target = LOCAL_DIR / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return path


def get(path: str) -> bytes | None:
    if USE_SUPABASE:
        r = httpx.get(f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{path}",
                      headers={"Authorization": f"Bearer {SERVICE_KEY}"}, timeout=60)
        return r.content if r.status_code == 200 else None
    target = LOCAL_DIR / path
    return target.read_bytes() if target.exists() else None
