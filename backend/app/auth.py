"""Who is calling. One job: turn the Bearer token into the user row.

Login itself lives in otp.py (phone + OTP). This module only reads tokens, it
never mints them - otp.py and shops.py do that, both with `typ: "access"`.

There is no router here on purpose. The Google sign-in and the admin-key
backdoor that used to live in this file came from a different product and were
never mounted by the supplier API; they are gone rather than dormant.
"""

import os

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from . import db

# Declaring the scheme is what puts an Authorize button on /docs.
bearer = HTTPBearer(auto_error=False)

JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = "HS256"


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    """Every route that touches shop data depends on this."""
    if not JWT_SECRET:
        raise HTTPException(500, "Server is missing JWT_SECRET in backend/.env")
    if not credentials:
        raise HTTPException(401, "Please sign in.")

    try:
        claims = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Your session expired. Please sign in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Please sign in.")

    # Only an access token opens a route. Refresh tokens are opaque strings and
    # never reach here, but a future second token type should not silently work.
    if claims.get("typ") != "access":
        raise HTTPException(401, "Please sign in.")

    # shop_id is read from the row, not from the token, so revoking someone's
    # access to a shop takes effect on their next request rather than in 30 days.
    user = db.get_user(claims.get("sub"))
    if not user:
        raise HTTPException(401, "Please sign in.")
    return user
