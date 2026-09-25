"""Small dependency-light authentication smoke test.

Run from ``backend`` with:
    python -m tests.smoke_auth
"""

import os
from datetime import datetime, timedelta

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "smoke-test-secret-not-used-outside-this-process")
os.environ.setdefault("AUTO_CREATE_TABLES", "false")

from fastapi import HTTPException, Request, Response
from sqlalchemy import func, select

from app.auth import get_current_user, login, logout, register
from app.database import Base, SessionLocal, engine
from app.models import AuditLog, Role, User
from app.schemas import LoginRequest, RegisterRequest
from app.security import hash_password


def request_for(path: str) -> Request:
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": path,
            "headers": [(b"user-agent", b"catalogue-smoke-test")],
            "client": ("127.0.0.1", 50000),
            "scheme": "http",
            "server": ("testserver", 80),
            "query_string": b"",
        }
    )


def main() -> None:
    Base.metadata.create_all(bind=engine)

    with SessionLocal() as db:
        role = Role(name="superadmin", description="Test superadmin")
        user = User(
            username="catalogue.admin",
            email="catalogue.admin@example.com",
            full_name="Catalogue Administrator",
            password_hash=hash_password("StrongPassword123!"),
            roles=[role],
        )
        db.add(user)
        db.commit()

        registration_response = Response()
        registration = register(
            RegisterRequest(
                full_name="Catalogue Viewer",
                username="catalogue.viewer",
                email="catalogue.viewer@example.com",
                password="ViewerPassword123!",
            ),
            request_for("/api/auth/register"),
            registration_response,
            db,
        )
        assert registration.message == "Account created and signed in."
        assert registration.user.username == "catalogue.viewer"
        registered_user = db.scalar(
            select(User).where(User.username == "catalogue.viewer")
        )
        assert registered_user is not None
        assert [role.name for role in registered_user.roles] == ["system_user"]

        registration_cookie = registration_response.headers["set-cookie"]
        assert "HttpOnly" in registration_cookie
        registration_token = registration_cookie.split(
            "catalogue_session=", 1
        )[1].split(";", 1)[0]
        registered_session_user = get_current_user(
            session_token=registration_token,
            db=db,
        )
        assert registered_session_user.id == registered_user.id

        registered_login = login(
            LoginRequest(
                identifier="CATALOGUE.VIEWER@EXAMPLE.COM",
                password="ViewerPassword123!",
                remember_me=False,
            ),
            request_for("/api/auth/login"),
            Response(),
            db,
        )
        assert registered_login.user.username == "catalogue.viewer"
        assert registered_login.user.roles == ["system_user"]

        response = Response()
        authenticated = login(
            LoginRequest(
                identifier="catalogue.admin",
                password="StrongPassword123!",
                remember_me=True,
            ),
            request_for("/api/auth/login"),
            response,
            db,
        )
        assert authenticated.user.username == "catalogue.admin"
        assert authenticated.user.roles == ["superadmin"]

        cookie_header = response.headers["set-cookie"]
        assert "HttpOnly" in cookie_header
        token = cookie_header.split("catalogue_session=", 1)[1].split(";", 1)[0]
        current_user = get_current_user(session_token=token, db=db)
        assert current_user.id == user.id

        try:
            login(
                LoginRequest(
                    identifier="catalogue.admin",
                    password="incorrect-password",
                    remember_me=False,
                ),
                request_for("/api/auth/login"),
                Response(),
                db,
            )
        except HTTPException as exc:
            assert exc.status_code == 401
        else:
            raise AssertionError("An invalid password was accepted")

        db.refresh(user)
        assert user.failed_login_attempts == 1

        # SQLite returns naive datetimes even for timezone-aware model columns.
        user.locked_until = datetime.now() + timedelta(minutes=1)
        db.commit()
        try:
            login(
                LoginRequest(
                    identifier="catalogue.admin",
                    password="StrongPassword123!",
                    remember_me=False,
                ),
                request_for("/api/auth/login"),
                Response(),
                db,
            )
        except HTTPException as exc:
            assert exc.status_code == 429
        else:
            raise AssertionError("A locked account was allowed to sign in")

        user.locked_until = None
        user.failed_login_attempts = 0
        db.commit()

        logout_response = Response()
        logout(
            request_for("/api/auth/logout"),
            logout_response,
            user,
            db,
        )
        assert "Max-Age=0" in logout_response.headers["set-cookie"]

        audit_count = db.scalar(select(func.count()).select_from(AuditLog))
        assert audit_count == 6

    print("Authentication smoke test: OK")


if __name__ == "__main__":
    main()
