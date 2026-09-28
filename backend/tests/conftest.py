import os
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

test_url = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://careflow@127.0.0.1:55432/careflow_test"
)
if not test_url.rsplit("/", 1)[-1].startswith("careflow_test"):
    raise RuntimeError("Tests require a dedicated database named careflow_test*")
os.environ["DATABASE_URL"] = test_url
os.environ["APP_ORIGIN"] = "http://localhost:5173"
os.environ["AI_MODE"] = "mock"

from app.db import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Patient, Slot, User  # noqa: E402
from app.security import passwords  # noqa: E402

PASSWORD = "Test-Password-2026!"
ORIGIN = "http://localhost:5173"


@pytest.fixture(scope="session", autouse=True)
def migrate_test_database():
    from alembic import command
    from alembic.config import Config

    command.upgrade(Config("alembic.ini"), "head")


@pytest.fixture(autouse=True)
def database(migrate_test_database):
    with engine.begin() as connection:
        connection.execute(
            text(
                "TRUNCATE ai_drafts, encounters, appointments, slots, patients, sessions, audit_events, users CASCADE"
            )
        )
    with SessionLocal.begin() as db:
        for role, name in [
            ("receptionist", "reception"),
            ("doctor", "doctor"),
            ("doctor", "other"),
            ("administrator", "admin"),
        ]:
            db.add(
                User(
                    id=name,
                    name=name,
                    email=f"{name}@example.test",
                    role=role,
                    password_hash=passwords.hash(PASSWORD),
                )
            )
        db.flush()
        db.add(
            Patient(
                id="patient",
                name="Fictional Alex",
                date_of_birth=datetime(2000, 1, 1).date(),
                contact="fiction@example.test",
            )
        )
        start = (datetime.now(timezone.utc) + timedelta(days=1)).replace(
            hour=9, minute=0, second=0, microsecond=0
        )
        db.add(Slot(id="slot", doctor_id="doctor", starts_at=start))
    yield


def login(name="reception"):
    client = TestClient(app, base_url=ORIGIN)
    client.headers["Origin"] = ORIGIN
    response = client.post(
        "/api/auth/login", json={"email": f"{name}@example.test", "password": PASSWORD}
    )
    assert response.status_code == 200, response.text
    client.headers["X-CSRF-Token"] = response.json()["csrf"]
    return client


@pytest.fixture
def reception():
    with login() as client:
        yield client


@pytest.fixture
def doctor():
    with login("doctor") as client:
        yield client


@pytest.fixture
def encounter(reception, doctor):
    booking = reception.post("/api/appointments", json={"slot_id": "slot", "patient_id": "patient"})
    assert booking.status_code == 201, booking.text
    response = doctor.post(f"/api/appointments/{booking.json()['id']}/encounter")
    assert response.status_code == 200, response.text
    return response.json()
