from datetime import date, datetime, timezone
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Login(Input):
    email: str
    password: str


class PatientInput(Input):
    name: str = Field(min_length=2, max_length=100)
    date_of_birth: date
    contact: str = Field(min_length=3, max_length=200)

    @field_validator("date_of_birth")
    @classmethod
    def valid_birth(cls, value):
        if not date(1900, 1, 1) <= value <= date.today():
            raise ValueError("Date of birth must be between 1900 and today")
        return value


class Booking(Input):
    slot_id: str
    patient_id: str


class Cancellation(Input):
    reason: str = Field(min_length=3, max_length=300)
    version: int | None = Field(default=None, ge=1)


class Reschedule(Input):
    target_slot_id: str = Field(min_length=1, max_length=36)
    reason: str = Field(min_length=3, max_length=300)
    version: int = Field(ge=1)
    request_id: UUID


class StructuredNote(Input):
    reported_concern: str = Field(default="Not documented", min_length=1, max_length=8000)
    relevant_history: str = Field(default="Not documented", min_length=1, max_length=8000)
    documented_observations: str = Field(default="Not documented", min_length=1, max_length=8000)
    documented_plan: str = Field(default="Not documented", min_length=1, max_length=8000)


class NoteUpdate(Input):
    version: int = Field(ge=1)
    rough_note: str = Field(max_length=8000)
    reviewed_note: StructuredNote


class Version(Input):
    version: int = Field(ge=1)


class StaffInput(Input):
    email: str = Field(pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$", max_length=200)
    name: str = Field(min_length=2, max_length=100)
    password: str = Field(min_length=12, max_length=128)
    role: Literal["doctor", "receptionist", "administrator"]


class StaffUpdate(Input):
    role: Literal["doctor", "receptionist", "administrator"]
    active: bool


class SlotInput(Input):
    doctor_id: str
    starts_at: datetime

    @field_validator("starts_at")
    @classmethod
    def valid_start(cls, value):
        if value.tzinfo is None or value <= datetime.now(timezone.utc):
            raise ValueError("Use a future timestamp with a timezone")
        if value.minute not in (0, 30) or value.second or value.microsecond:
            raise ValueError("Slots start on the hour or half hour")
        return value
