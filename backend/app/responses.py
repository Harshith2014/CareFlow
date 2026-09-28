"""Explicit public response contracts; never serialize password or session records."""

from datetime import date, datetime
from typing import Generic, TypeVar

from pydantic import BaseModel

from .schemas import StructuredNote

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    role: str
    active: bool


class AuthOut(BaseModel):
    user: UserOut
    csrf: str
    ai_mode: str
    timezone: str


class PatientOut(BaseModel):
    id: str
    name: str
    date_of_birth: date
    contact: str
    created_at: datetime
    updated_at: datetime


class SlotOut(BaseModel):
    id: str
    doctor_id: str
    starts_at: datetime


class AvailabilityOut(SlotOut):
    available: bool


class AppointmentOut(BaseModel):
    id: str
    slot_id: str
    patient_id: str
    status: str
    cancellation_reason: str | None
    version: int


class ScheduleOut(AppointmentOut):
    starts_at: datetime
    doctor_id: str
    patient_name: str
    can_reschedule: bool


class DraftOut(BaseModel):
    id: str
    encounter_id: str
    source_version: int
    generation_seq: int
    model: str
    status: str
    output: StructuredNote | None
    error: str | None
    created_at: datetime


class EncounterOut(BaseModel):
    id: str
    appointment_id: str
    doctor_id: str
    rough_note: str
    reviewed_note: StructuredNote
    version: int
    generation_seq: int
    status: str
    finalized_at: datetime | None


class EncounterDetail(EncounterOut):
    drafts: list[DraftOut]


class AuditOut(BaseModel):
    id: str
    actor_id: str
    action: str
    record_id: str
    created_at: datetime
    details: dict | None


class MoveOut(BaseModel):
    id: str
    appointment_id: str
    request_id: str
    actor_id: str
    old_slot_id: str
    new_slot_id: str
    reason: str
    expected_version: int
    result: AppointmentOut
    created_at: datetime


class RescheduleOut(BaseModel):
    appointment: AppointmentOut
    change: MoveOut
    replayed: bool
