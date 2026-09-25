import uuid
from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash

from app.config import settings


password_hash = PasswordHash.recommended()
DUMMY_PASSWORD_HASH = password_hash.hash("not-a-real-user-password")
ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, stored_hash: str) -> bool:
    return password_hash.verify(password, stored_hash)


def create_access_token(
    *,
    user_id: uuid.UUID,
    roles: list[str],
    remember_me: bool,
) -> tuple[str, int]:
    lifetime = (
        timedelta(days=settings.remember_me_days)
        if remember_me
        else timedelta(minutes=settings.access_token_minutes)
    )
    now = datetime.now(UTC)
    expires_at = now + lifetime
    payload = {
        "sub": str(user_id),
        "roles": roles,
        "iat": now,
        "exp": expires_at,
        "iss": settings.token_issuer,
    }
    token = jwt.encode(
        payload,
        settings.secret_key.get_secret_value(),
        algorithm=ALGORITHM,
    )
    return token, int(lifetime.total_seconds())


def decode_access_token(token: str) -> uuid.UUID:
    payload = jwt.decode(
        token,
        settings.secret_key.get_secret_value(),
        algorithms=[ALGORITHM],
        issuer=settings.token_issuer,
    )
    subject = payload.get("sub")
    if not subject:
        raise jwt.InvalidTokenError("Token subject is missing")
    return uuid.UUID(subject)
