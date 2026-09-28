from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from .models import Appointment, Audit, Encounter, Slot


def audit(db, actor, action, record):
    db.add(Audit(actor_id=actor.id, action=action, record_id=record.id))


def commit(db):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Record conflict; refresh and try again") from None


def required(db, model, record_id):
    record = db.get(model, record_id)
    if not record:
        raise HTTPException(404, "Record not found")
    return record


def own_encounter(db, record_id, user, lock=False):
    query = select(Encounter).where(Encounter.id == record_id)
    if lock:
        query = query.with_for_update()
    encounter = db.scalar(query.execution_options(populate_existing=True))
    if not encounter:
        raise HTTPException(404, "Encounter not found")
    if encounter.doctor_id != user.id:
        raise HTTPException(403, "Encounter is assigned to another doctor")
    return encounter


def editable(encounter, version):
    if encounter.status == "finalized":
        raise HTTPException(409, "Finalized encounters are immutable")
    if encounter.version != version:
        raise HTTPException(409, "Stale note version; reload before editing")


def care_relationship(db, patient_id, doctor_id):
    return (
        db.scalar(
            select(Appointment.id)
            .join(Slot)
            .where(
                Appointment.patient_id == patient_id,
                Slot.doctor_id == doctor_id,
                Appointment.status != "canceled",
            )
            .limit(1)
        )
        is not None
    )
