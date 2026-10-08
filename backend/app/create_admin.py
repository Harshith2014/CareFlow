"""Interactive first administrator provisioning; no public signup or default password."""

from getpass import getpass

from pydantic import ValidationError
from sqlalchemy import select, text

from .db import SessionLocal
from .models import Audit, User
from .schemas import StaffInput
from .security import passwords


def create_initial_admin(data):
    if data.role != "administrator":
        raise ValueError("Initial account must be an administrator")
    with SessionLocal.begin() as db:
        db.execute(text("SELECT pg_advisory_xact_lock(742061029)"))
        if db.scalar(select(User.id).limit(1)):
            raise ValueError(
                "Staff already exist; use an existing administrator to manage accounts"
            )
        member = User(
            name=data.name,
            email=data.email.lower(),
            role=data.role,
            password_hash=passwords.hash(data.password),
        )
        db.add(member)
        db.flush()
        db.add(Audit(actor_id=member.id, action="staff.initial_admin_created", record_id=member.id))


def main():
    email = input("Administrator email: ").strip()
    name = input("Administrator display name: ").strip()
    password = getpass("New password (12-128 characters; hidden): ")
    if password != getpass("Confirm password (hidden): "):
        raise SystemExit("Passwords do not match")
    try:
        data = StaffInput(email=email, name=name, password=password, role="administrator")
        create_initial_admin(data)
    except ValidationError:
        # Validation errors contain input values; never print them for credential fields.
        raise SystemExit(
            "Use a valid email, a 2-100 character name, and a 12-128 character password"
        ) from None
    except ValueError as exc:
        raise SystemExit(str(exc)) from None
    print("Initial administrator created. Sign in to create staff and future slots.")


if __name__ == "__main__":
    main()
