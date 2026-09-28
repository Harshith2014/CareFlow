from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from uuid import uuid4

import pytest
from conftest import login
from sqlalchemy import event, func, select

from app.db import SessionLocal
from app.models import Appointment, AppointmentMove, Audit, Encounter, Slot, User


@pytest.fixture
def booked(reception):
    with SessionLocal.begin() as db:
        start = db.get(Slot, "slot").starts_at
        for identifier, hours, doctor in [
            ("target", 1, "doctor"),
            ("third", 2, "doctor"),
            ("fourth", 3, "doctor"),
            ("other-slot", 1, "other"),
            ("past", -72, "doctor"),
        ]:
            db.add(Slot(id=identifier, doctor_id=doctor, starts_at=start + timedelta(hours=hours)))
    response = reception.post(
        "/api/appointments", json={"slot_id": "slot", "patient_id": "patient"}
    )
    assert response.status_code == 201
    return response.json()


def payload(target="target", version=1):
    return {
        "target_slot_id": target,
        "reason": "Fictional patient requested a later visit",
        "version": version,
        "request_id": str(uuid4()),
    }


def move(client, booking, body=None):
    return client.post(f"/api/appointments/{booking['id']}/reschedule", json=body or payload())


def test_success_identity_availability_history_audit(reception, booked):
    response = move(reception, booked)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["appointment"]["id"] == booked["id"]
    assert result["appointment"]["slot_id"] == "target"
    assert result["appointment"]["version"] == 2
    with SessionLocal() as db:
        date = db.get(Slot, "slot").starts_at.date().isoformat()
        audit = db.scalar(select(Audit).where(Audit.action == "appointment.rescheduled"))
        assert audit.actor_id == "reception" and audit.record_id == booked["id"]
        assert audit.details["old_slot_id"] == "slot"
        assert audit.details["new_slot_id"] == "target"
        assert audit.details["reason"] == payload()["reason"]
        assert audit.created_at and audit.details["old_starts_at"]
    available = {
        s["id"]: s["available"] for s in reception.get("/api/slots", params={"day": date}).json()
    }
    assert available["slot"] is True and available["target"] is False
    history = reception.get(f"/api/appointments/{booked['id']}/history").json()
    assert len(history) == 1 and history[0]["old_slot_id"] == "slot"
    assert history[0]["actor_id"] == "reception" and history[0]["created_at"]
    assert (
        reception.post(
            "/api/appointments", json={"slot_id": "slot", "patient_id": "patient"}
        ).status_code
        == 201
    )


def test_taken_target_preserves_original(reception, booked):
    reception.post("/api/appointments", json={"slot_id": "target", "patient_id": "patient"})
    assert move(reception, booked).status_code == 409
    with SessionLocal() as db:
        assert db.get(Appointment, booked["id"]).slot_id == "slot"
        assert db.get(Appointment, booked["id"]).version == 1
        assert db.scalar(select(func.count()).select_from(AppointmentMove)) == 0


@pytest.mark.parametrize("role", ["doctor", "other", "admin"])
def test_direct_role_denials(role, reception, booked):
    with login(role) as client:
        assert move(client, booked).status_code == 403
        if role != "admin":
            assert client.get(f"/api/appointments/{booked['id']}/history").status_code == 403


@pytest.mark.parametrize("state", ["started", "canceled", "completed"])
def test_ineligible_state(state, reception, doctor, booked):
    version = 1
    if state == "canceled":
        reception.post(
            f"/api/appointments/{booked['id']}/cancel", json={"reason": "Fictional cancellation"}
        )
        version = 2
    else:
        encounter = doctor.post(f"/api/appointments/{booked['id']}/encounter").json()
        version = 2
        if state == "completed":
            from test_workflows import note

            doctor.patch(f"/api/encounters/{encounter['id']}", json=note(1))
            doctor.post(f"/api/encounters/{encounter['id']}/finalize", json={"version": 2})
            version = 3
    assert move(reception, booked, payload(version=version)).status_code == 409


@pytest.mark.parametrize(
    ("target", "status"), [("slot", 422), ("past", 422), ("missing", 404), ("other-slot", 422)]
)
def test_invalid_targets(target, status, reception, booked):
    assert move(reception, booked, payload(target)).status_code == status


def test_inactive_doctor_and_invalid_request(reception, booked):
    assert move(reception, booked, {**payload(), "reason": " "}).status_code == 422
    assert move(reception, booked, {**payload(), "request_id": "invalid"}).status_code == 422
    with SessionLocal.begin() as db:
        db.get(User, "doctor").active = False
    assert move(reception, booked).status_code == 409


def race(calls):
    barrier = Barrier(len(calls))

    def run(call):
        with login(call[0]) as client:
            barrier.wait(timeout=10)
            return client.post(call[1], json=call[2])

    with ThreadPoolExecutor(max_workers=len(calls)) as executor:
        return list(executor.map(run, calls))


def test_two_appointments_one_target(reception, booked):
    second = reception.post(
        "/api/appointments", json={"slot_id": "third", "patient_id": "patient"}
    ).json()
    responses = race(
        [
            ("reception", f"/api/appointments/{b['id']}/reschedule", payload())
            for b in [booked, second]
        ]
    )
    assert sorted(r.status_code for r in responses) == [200, 409]
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(AppointmentMove)) == 1
        assert (
            db.scalar(
                select(func.count()).select_from(Appointment).where(Appointment.slot_id == "target")
            )
            == 1
        )
        loser = booked if responses[0].status_code == 409 else second
        assert db.get(Appointment, loser["id"]).slot_id == loser["slot_id"]


def test_same_appointment_concurrent_edits(reception, booked):
    path = f"/api/appointments/{booked['id']}/reschedule"
    responses = race(
        [("reception", path, payload("target")), ("reception", path, payload("third"))]
    )
    assert sorted(r.status_code for r in responses) == [200, 409]
    with SessionLocal() as db:
        assert db.get(Appointment, booked["id"]).version == 2
        assert db.scalar(select(func.count()).select_from(AppointmentMove)) == 1


@pytest.mark.parametrize("operation", ["cancel", "encounter"])
def test_lifecycle_race(operation, reception, booked):
    path = f"/api/appointments/{booked['id']}"
    other = (
        ("reception", path + "/cancel", {"reason": "Fictional cancellation", "version": 1})
        if operation == "cancel"
        else ("doctor", path + "/encounter", None)
    )
    moved, changed = race([("reception", path + "/reschedule", payload()), other])
    assert moved.status_code in (200, 409) and changed.status_code in (200, 409)
    assert 200 in (moved.status_code, changed.status_code)
    with SessionLocal() as db:
        booking = db.get(Appointment, booked["id"])
        history = list(db.scalars(select(AppointmentMove)))
        assert len(history) == (1 if moved.status_code == 200 else 0)
        if operation == "cancel":
            assert sorted([moved.status_code, changed.status_code]) == [200, 409]
            assert booking.status == ("canceled" if changed.status_code == 200 else "scheduled")
        else:
            assert changed.status_code == 200
            assert db.scalar(select(Encounter).where(Encounter.appointment_id == booking.id))
            assert booking.status == "scheduled"
            assert move(reception, booked, payload("fourth", booking.version)).status_code == 409


def test_retry_same_key_no_duplicate_and_reuse_rejected(reception, booked):
    body = payload()
    first = move(reception, booked, body).json()
    replay = move(reception, booked, body).json()
    assert replay["replayed"] is True
    assert replay["appointment"] == first["appointment"]
    assert replay["change"]["id"] == first["change"]["id"]
    assert move(reception, booked, {**body, "reason": "Different reason"}).status_code == 409
    assert move(reception, booked, payload("third", 2)).status_code == 200
    assert move(reception, booked, body).json()["appointment"] == first["appointment"]
    with SessionLocal() as db:
        assert db.get(Appointment, booked["id"]).slot_id == "third"
        assert db.scalar(select(func.count()).select_from(AppointmentMove)) == 2
        assert (
            db.scalar(
                select(func.count())
                .select_from(Audit)
                .where(Audit.action == "appointment.rescheduled")
            )
            == 2
        )


def test_simultaneous_identical_retry(reception, booked):
    body = payload()
    path = f"/api/appointments/{booked['id']}/reschedule"
    results = race([("reception", path, body), ("reception", path, body)])
    assert [r.status_code for r in results] == [200, 200]
    assert sorted(r.json()["replayed"] for r in results) == [False, True]
    assert results[0].json()["change"]["id"] == results[1].json()["change"]["id"]


def test_failure_rolls_back_history_and_move(reception, booked):
    def fail(mapper, connection, target):
        if target.action == "appointment.rescheduled":
            raise RuntimeError("Injected audit failure")

    event.listen(Audit, "before_insert", fail)
    try:
        with pytest.raises(RuntimeError, match="Injected"):
            move(reception, booked)
    finally:
        event.remove(Audit, "before_insert", fail)
    with SessionLocal() as db:
        assert db.get(Appointment, booked["id"]).slot_id == "slot"
        assert db.get(Appointment, booked["id"]).version == 1
        assert db.scalar(select(func.count()).select_from(AppointmentMove)) == 0
