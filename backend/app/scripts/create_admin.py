from getpass import getpass

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import func, or_, select

from app.database import Base, SessionLocal, engine
from app.models import Role, User
from app.security import hash_password


ROLE_DEFINITIONS = {
    "system_user": (
        "Standard catalogue portal user with permissions assigned by a superadmin."
    ),
    "superadmin": (
        "Full system administrator with user, role and configuration access."
    ),
    "catalogue_editor": "Edits catalogue content and submits changes for approval.",
    "catalogue_approver": "Reviews, approves and publishes catalogue changes.",
    "catalogue_admin": "Manages catalogue content, users and system configuration.",
    "viewer": "Can view catalogue management data and reports.",
}


def prompt_non_empty(label: str) -> str:
    while True:
        value = input(label).strip()
        if value:
            return value
        print("This value is required.")


def main() -> None:
    Base.metadata.create_all(bind=engine)
    print("Create the initial Catalogue Superadmin")
    full_name = prompt_non_empty("Full name: ")
    username = prompt_non_empty("Username: ")

    while True:
        email_input = prompt_non_empty("Email: ")
        try:
            email = validate_email(email_input, check_deliverability=False).normalized
            break
        except EmailNotValidError as exc:
            print(f"Invalid email: {exc}")

    while True:
        password = getpass("Password (at least 12 characters): ")
        confirmation = getpass("Confirm password: ")
        if len(password) < 12:
            print("Use at least 12 characters.")
        elif password != confirmation:
            print("Passwords do not match.")
        else:
            break

    with SessionLocal() as db:
        existing = db.scalar(
            select(User).where(
                or_(
                    func.lower(User.username) == username.casefold(),
                    func.lower(User.email) == email.casefold(),
                )
            )
        )
        if existing:
            raise SystemExit("A user with that username or email already exists.")

        roles: dict[str, Role] = {}
        for name, description in ROLE_DEFINITIONS.items():
            role = db.scalar(select(Role).where(Role.name == name))
            if not role:
                role = Role(name=name, description=description)
                db.add(role)
                db.flush()
            roles[name] = role

        admin = User(
            username=username,
            email=email,
            full_name=full_name,
            password_hash=hash_password(password),
            roles=[roles["superadmin"]],
        )
        db.add(admin)
        db.commit()

    print(f"Superadmin '{username}' created successfully.")


if __name__ == "__main__":
    main()
