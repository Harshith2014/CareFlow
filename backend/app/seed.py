"""Explicit local-only demo seed: python -m app.seed"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select

from .config import settings
from .db import SessionLocal
from .models import Slot, User
from .security import passwords


def seed():
    if settings().environment != "development":
        raise SystemExit("Demo seeding is allowed only in development mode")
    with SessionLocal.begin() as db:
        for name, email, role in [
            ("Demo Reception", "reception@careflow.demo", "receptionist"),
            ("Dr. Mira Demo", "doctor@careflow.demo", "doctor"),
            ("Dr. Arun Demo", "doctor2@careflow.demo", "doctor"),
            ("Demo Administrator", "admin@careflow.demo", "administrator"),
        ]:
            if not db.scalar(select(User).where(User.email == email)):
                db.add(
                    User(
                        name=name,
                        email=email,
                        role=role,
                        password_hash=passwords.hash("CareFlow-Demo-2026!"),
                    )
                )
        db.flush()
        doctors = list(db.scalars(select(User).where(User.role == "doctor")))
        today = datetime.now(ZoneInfo(settings().clinic_timezone)).replace(
            hour=9, minute=0, second=0, microsecond=0
        )
        for doctor in doctors:
            for day in range(8):
                for half_hour in range(18):
                    start = today + timedelta(days=day, minutes=30 * half_hour)
                    if not db.scalar(
                        select(Slot.id).where(Slot.doctor_id == doctor.id, Slot.starts_at == start)
                    ):
                        db.add(Slot(doctor_id=doctor.id, starts_at=start))
    print("Local demo accounts and eight days of slots seeded. Password: CareFlow-Demo-2026!")


if __name__ == "__main__":
    seed()
