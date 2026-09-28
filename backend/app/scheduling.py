"""Rescheduling is one transaction. External calls never occur in this service."""

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, OperationalError

from .models import Appointment, AppointmentMove, Audit, Encounter, Slot, User
from .responses import AppointmentOut


def reschedule(db, appointment_id, data, actor):
    try:
        booking = db.scalar(
            select(Appointment)
            .where(Appointment.id == appointment_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if not booking:
            raise HTTPException(404, "Appointment not found")
        previous = db.scalar(
            select(AppointmentMove).where(
                AppointmentMove.appointment_id == booking.id,
                AppointmentMove.request_id == str(data.request_id),
            )
        )
        if previous:
            if (
                previous.actor_id != actor.id
                or previous.new_slot_id != data.target_slot_id
                or previous.reason != data.reason
                or previous.expected_version != data.version
            ):
                raise HTTPException(
                    409, "Request ID already used with different rescheduling details"
                )
            # Return the original successful operation, even if the appointment changed later.
            return previous.result, previous, True
        if booking.version != data.version:
            raise HTTPException(409, "Appointment changed; reload before rescheduling")
        if booking.status != "scheduled" or db.scalar(
            select(Encounter.id).where(Encounter.appointment_id == booking.id)
        ):
            raise HTTPException(
                409, "Only scheduled appointments without an encounter can be rescheduled"
            )
        if booking.slot_id == data.target_slot_id:
            raise HTTPException(422, "Choose a different slot")
        # All moves lock their slot pair in ascending ID order. Appointment locks also
        # serialize cancellation and encounter creation; no route locks slots then appointments.
        slots = {
            slot.id: slot
            for slot in db.scalars(
                select(Slot)
                .where(Slot.id.in_([booking.slot_id, data.target_slot_id]))
                .order_by(Slot.id)
                .with_for_update()
            )
        }
        target = slots.get(data.target_slot_id)
        if not target:
            raise HTTPException(404, "Target slot not found")
        original = slots[booking.slot_id]
        if original.doctor_id != target.doctor_id:
            raise HTTPException(422, "Rescheduling must keep the same doctor")
        member = db.scalar(
            select(User).where(User.id == target.doctor_id).with_for_update(read=True)
        )
        if not member.active or member.role != "doctor":
            raise HTTPException(409, "Doctor is unavailable")
        if target.starts_at <= datetime.now(timezone.utc):
            raise HTTPException(422, "Choose a future slot")
        if db.scalar(
            select(Appointment.id).where(
                Appointment.slot_id == target.id, Appointment.status != "canceled"
            )
        ):
            raise HTTPException(409, "Target slot already booked; original appointment unchanged")
        old_id = booking.slot_id
        booking.slot_id = target.id
        booking.version += 1
        db.flush()  # The partial unique index also protects against concurrent new bookings.
        result = AppointmentOut.model_validate(booking, from_attributes=True).model_dump()
        change = AppointmentMove(
            appointment_id=booking.id,
            request_id=str(data.request_id),
            actor_id=actor.id,
            old_slot_id=old_id,
            new_slot_id=target.id,
            reason=data.reason,
            expected_version=data.version,
            result=result,
        )
        db.add(change)
        db.flush()
        db.add(
            Audit(
                actor_id=actor.id,
                action="appointment.rescheduled",
                record_id=booking.id,
                details={
                    "old_slot_id": old_id,
                    "new_slot_id": target.id,
                    "reason": data.reason,
                    "old_starts_at": original.starts_at.isoformat(),
                    "new_starts_at": target.starts_at.isoformat(),
                    "change_id": change.id,
                },
            )
        )
        db.commit()
        return result, change, False
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            409, "Target slot already booked; original appointment unchanged"
        ) from None
    except OperationalError as exc:
        db.rollback()
        if getattr(exc.orig, "sqlstate", None) in ("40P01", "40001", "55P03"):
            raise HTTPException(
                409, "Concurrent scheduling change; retry the same request"
            ) from None
        raise
