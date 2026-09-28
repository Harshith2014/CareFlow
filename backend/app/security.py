import hashlib
import secrets
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request
from pwdlib import PasswordHash
from sqlalchemy.orm import Session as DBSession

from .config import settings
from .db import get_db
from .models import Session, User

passwords = PasswordHash.recommended()
DUMMY_HASH = passwords.hash("unused-password-for-timing-only")


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def current_user(request: Request, db: DBSession = Depends(get_db)):
    token = request.cookies.get("careflow_session", "")
    session = db.get(Session, digest(token))
    if not session or session.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(401, "Please sign in")
    user = db.get(User, session.user_id)
    if not user or not user.active:
        raise HTTPException(401, "Account unavailable")
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        if request.headers.get("origin") != settings().app_origin:
            raise HTTPException(403, "Invalid request origin")
        if not secrets.compare_digest(request.headers.get("x-csrf-token", ""), session.csrf):
            raise HTTPException(403, "Invalid CSRF token")
    request.state.auth_session = session
    return user


def roles(*allowed):
    def check(user=Depends(current_user)):
        if user.role not in allowed:
            raise HTTPException(403, "This role cannot perform this action")
        return user

    return check
