"""Send an OTP SMS through MSG91. Owner: Devansh.

APP_ENV != production: nothing is sent, the code is printed to the log.
Swap the provider here and nothing else changes (otp.py only calls send_otp).
"""
import logging
import os

import httpx

log = logging.getLogger("sms")

APP_ENV = os.getenv("APP_ENV", "dev")
MSG91_AUTH_KEY = os.getenv("MSG91_AUTH_KEY", "")
MSG91_TEMPLATE_ID = os.getenv("MSG91_TEMPLATE_ID", "")
MSG91_OTP_URL = "https://control.msg91.com/api/v5/otp"


def is_production() -> bool:
    return APP_ENV == "production"


def send_otp(phone_e164: str, code: str) -> None:
    """phone_e164 like +919876543210. Raises RuntimeError if MSG91 refuses."""
    if not is_production():
        log.warning("DEV OTP for %s: %s (no SMS sent)", phone_e164, code)
        return
    if not (MSG91_AUTH_KEY and MSG91_TEMPLATE_ID):
        raise RuntimeError("MSG91_AUTH_KEY or MSG91_TEMPLATE_ID missing in backend/.env")
    r = httpx.post(
        MSG91_OTP_URL,
        params={"template_id": MSG91_TEMPLATE_ID, "mobile": phone_e164.lstrip("+"), "otp": code,
                "otp_expiry": 5},
        headers={"authkey": MSG91_AUTH_KEY},
        timeout=10,
    )
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    if r.status_code != 200 or body.get("type") != "success":
        raise RuntimeError(f"MSG91 refused: {r.status_code} {body.get('message') or r.text[:200]}")
