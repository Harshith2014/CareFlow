import secrets
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession

from . import ai, scheduling
from . import responses as out
from . import schemas as s
from .config import settings
from .db import get_db
from .hosting import mount_frontend
from .models import (
    AIDraft,
    Appointment,
    AppointmentMove,
    Audit,
    Encounter,
    Patient,
    Session,
    Slot,
    User,
)
from .security import DUMMY_HASH, current_user, digest, passwords, roles
from .services import audit, care_relationship, commit, editable, own_encounter, required

app = FastAPI(title="CareFlow", description="Independent portfolio demo. Fictional data only.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings().app_origin],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Content-Type", "X-CSRF-Token"],
)
DB = Depends(get_db)
reception = roles("receptionist")
doctor = roles("doctor")
admin = roles("administrator")


@app.middleware("http")
async def private_responses(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    if settings().static_dir and not request.url.path.startswith(("/docs", "/redoc")):
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; style-src 'self'; img-src 'self' data:; "
            "frame-ancestors 'none'; base-uri 'self'"
        )
    return response


def public_user(user):
    return {key: getattr(user, key) for key in ("id", "name", "email", "role", "active")}


def row(record):
    return {col.name: getattr(record, col.name) for col in record.__table__.columns}


@app.get("/api/health")
def health(db: DBSession = DB):
    db.execute(select(1))
    return {"status": "ok"}


@app.post("/api/auth/login", response_model=out.AuthOut)
def login(data: s.Login, request: Request, response: Response, db: DBSession = DB):
    if request.headers.get("origin") != settings().app_origin:
        raise HTTPException(403, "Invalid request origin")
    user = db.scalar(select(User).where(User.email == data.email.lower()))
    valid = passwords.verify(data.password, user.password_hash if user else DUMMY_HASH)
    if not valid or not user or not user.active:
        raise HTTPException(401, "Invalid email or password")
    old = request.cookies.get("careflow_session")
    if old:
        db.execute(delete(Session).where(Session.id == digest(old)))
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    db.add(
        Session(
            id=digest(token),
            user_id=user.id,
            csrf=csrf,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=settings().session_hours),
        )
    )
    commit(db)
    response.set_cookie(
        "careflow_session",
        token,
        httponly=True,
        samesite="strict",
        secure=settings().environment == "production",
        max_age=settings().session_hours * 3600,
        path="/api",
    )
    return {
        "user": public_user(user),
        "csrf": csrf,
        "ai_mode": settings().ai_mode,
        "timezone": settings().clinic_timezone,
    }


@app.get("/api/auth/me", response_model=out.AuthOut)
def me(request: Request, user=Depends(current_user)):
    return {
        "user": public_user(user),
        "csrf": request.state.auth_session.csrf,
        "ai_mode": settings().ai_mode,
        "timezone": settings().clinic_timezone,
    }


@app.post("/api/auth/logout")
def logout(request: Request, response: Response, user=Depends(current_user), db: DBSession = DB):
    db.delete(request.state.auth_session)
    commit(db)
    response.delete_cookie("careflow_session", path="/api")
    return {"message": "Signed out"}


@app.get("/api/doctors", response_model=list[out.UserOut])
def doctors(user=Depends(current_user), db: DBSession = DB):
    return [
        public_user(u) for u in db.scalars(select(User).where(User.role == "doctor", User.active))
    ]


@app.get("/api/patients", response_model=out.Page[out.PatientOut])
def patients(
    q: str = Query("", max_length=100),
    page: int = Query(1, ge=1),
    user=Depends(roles("receptionist", "doctor")),
    db: DBSession = DB,
):
    query = select(Patient).where(
        Patient.name.ilike("%" + q.replace("%", "").replace("_", "") + "%")
    )
    if user.role == "doctor":
        query = query.where(
            Patient.id.in_(
                select(Appointment.patient_id)
                .join(Slot)
                .where(Slot.doctor_id == user.id, Appointment.status != "canceled")
            )
        )
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    return {
        "items": [
            row(p)
            for p in db.scalars(
                query.order_by(Patient.name, Patient.id).offset((page - 1) * 20).limit(20)
            )
        ],
        "total": total,
        "page": page,
        "page_size": 20,
    }


@app.get("/api/patients/{patient_id}", response_model=out.PatientOut)
def patient(patient_id: str, user=Depends(roles("receptionist", "doctor")), db: DBSession = DB):
    if user.role == "doctor" and not care_relationship(db, patient_id, user.id):
        raise HTTPException(403, "No care relationship")
    return row(required(db, Patient, patient_id))


@app.post("/api/patients", status_code=201, response_model=out.PatientOut)
def register(data: s.PatientInput, user=Depends(reception), db: DBSession = DB):
    patient = Patient(**data.model_dump())
    db.add(patient)
    db.flush()
    audit(db, user, "patient.registered", patient)
    commit(db)
    return row(patient)


@app.patch("/api/patients/{patient_id}", response_model=out.PatientOut)
def update_patient(
    patient_id: str, data: s.PatientInput, user=Depends(reception), db: DBSession = DB
):
    patient = required(db, Patient, patient_id)
    for key, value in data.model_dump().items():
        setattr(patient, key, value)
    patient.updated_at = datetime.now(timezone.utc)
    audit(db, user, "patient.updated", patient)
    commit(db)
    return row(patient)


def day_bounds(day):
    start = datetime.combine(day, datetime.min.time(), ZoneInfo(settings().clinic_timezone))
    return start, start + timedelta(days=1)


@app.get("/api/slots", response_model=list[out.AvailabilityOut])
def slots(day: date, doctor_id: str | None = None, user=Depends(current_user), db: DBSession = DB):
    start, end = day_bounds(day)
    query = select(Slot).where(Slot.starts_at >= start, Slot.starts_at < end)
    if user.role == "doctor":
        query = query.where(Slot.doctor_id == user.id)
    elif doctor_id:
        query = query.where(Slot.doctor_id == doctor_id)
    result = []
    for slot in db.scalars(query.order_by(Slot.starts_at).limit(500)):
        booking = db.scalar(
            select(Appointment.id).where(
                Appointment.slot_id == slot.id, Appointment.status != "canceled"
            )
        )
        result.append(
            {
                **row(slot),
                "available": booking is None and slot.starts_at > datetime.now(timezone.utc),
            }
        )
    return result


@app.post("/api/appointments", status_code=201, response_model=out.AppointmentOut)
def book(data: s.Booking, user=Depends(reception), db: DBSession = DB):
    slot = required(db, Slot, data.slot_id)
    required(db, Patient, data.patient_id)
    if not required(db, User, slot.doctor_id).active:
        raise HTTPException(409, "Doctor is unavailable")
    if slot.starts_at <= datetime.now(timezone.utc):
        raise HTTPException(422, "Cannot book a past slot")
    booking = Appointment(**data.model_dump())
    db.add(booking)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Slot already booked; choose another time") from None
    audit(db, user, "appointment.booked", booking)
    commit(db)
    return row(booking)


@app.get("/api/appointments", response_model=list[out.ScheduleOut])
def appointments(
    day: date, doctor_id: str | None = None, user=Depends(current_user), db: DBSession = DB
):
    start, end = day_bounds(day)
    query = (
        select(Appointment, Slot, Patient.name)
        .join(Slot)
        .join(Patient)
        .where(Slot.starts_at >= start, Slot.starts_at < end)
    )
    if user.role == "doctor":
        query = query.where(Slot.doctor_id == user.id)
    elif doctor_id:
        query = query.where(Slot.doctor_id == doctor_id)
    return [
        {
            **row(a),
            "starts_at": slot.starts_at,
            "doctor_id": slot.doctor_id,
            "patient_name": name if user.role != "administrator" else "Restricted",
            "can_reschedule": a.status == "scheduled"
            and not db.scalar(select(Encounter.id).where(Encounter.appointment_id == a.id)),
        }
        for a, slot, name in db.execute(query.order_by(Slot.starts_at).limit(500))
    ]


@app.post("/api/appointments/{appointment_id}/cancel", response_model=out.AppointmentOut)
def cancel(appointment_id: str, data: s.Cancellation, user=Depends(reception), db: DBSession = DB):
    booking = db.scalar(
        select(Appointment).where(Appointment.id == appointment_id).with_for_update()
    )
    if not booking:
        raise HTTPException(404, "Appointment not found")
    if data.version is not None and data.version != booking.version:
        raise HTTPException(409, "Appointment changed; reload before canceling")
    if booking.status != "scheduled" or db.scalar(
        select(Encounter.id).where(Encounter.appointment_id == booking.id)
    ):
        raise HTTPException(409, "Only scheduled appointments without encounters can be canceled")
    booking.status, booking.cancellation_reason = "canceled", data.reason
    booking.version += 1
    audit(db, user, "appointment.canceled", booking)
    commit(db)
    return row(booking)


@app.post("/api/appointments/{appointment_id}/reschedule", response_model=out.RescheduleOut)
def reschedule_appointment(
    appointment_id: str, data: s.Reschedule, user=Depends(reception), db: DBSession = DB
):
    result, change, replayed = scheduling.reschedule(db, appointment_id, data, user)
    return {"appointment": result, "change": row(change), "replayed": replayed}


@app.get("/api/appointments/{appointment_id}/history", response_model=list[out.MoveOut])
def appointment_history(
    appointment_id: str, user=Depends(roles("receptionist", "administrator")), db: DBSession = DB
):
    required(db, Appointment, appointment_id)
    return [
        row(move)
        for move in db.scalars(
            select(AppointmentMove)
            .where(AppointmentMove.appointment_id == appointment_id)
            .order_by(AppointmentMove.created_at, AppointmentMove.id)
        )
    ]


@app.post("/api/appointments/{appointment_id}/encounter", response_model=out.EncounterOut)
def start_encounter(appointment_id: str, user=Depends(doctor), db: DBSession = DB):
    booking = db.scalar(
        select(Appointment).where(Appointment.id == appointment_id).with_for_update()
    )
    if not booking:
        raise HTTPException(404, "Appointment not found")
    slot = required(db, Slot, booking.slot_id)
    if slot.doctor_id != user.id:
        raise HTTPException(403, "Appointment belongs to another doctor")
    existing = db.scalar(select(Encounter).where(Encounter.appointment_id == booking.id))
    if existing:
        return row(existing)
    if booking.status != "scheduled":
        raise HTTPException(409, "Appointment is not scheduled")
    encounter = Encounter(
        appointment_id=booking.id, doctor_id=user.id, reviewed_note=s.StructuredNote().model_dump()
    )
    booking.version += 1
    db.add(encounter)
    db.flush()
    audit(db, user, "encounter.created", encounter)
    commit(db)
    return row(encounter)


@app.get("/api/encounters/{encounter_id}", response_model=out.EncounterDetail)
def get_encounter(encounter_id: str, user=Depends(doctor), db: DBSession = DB):
    encounter = own_encounter(db, encounter_id, user)
    drafts = db.scalars(
        select(AIDraft)
        .where(AIDraft.encounter_id == encounter.id)
        .order_by(AIDraft.generation_seq.desc())
        .limit(20)
    )
    return {**row(encounter), "drafts": [row(d) for d in drafts]}


@app.patch("/api/encounters/{encounter_id}", response_model=out.EncounterOut)
def save_encounter(encounter_id: str, data: s.NoteUpdate, user=Depends(doctor), db: DBSession = DB):
    encounter = own_encounter(db, encounter_id, user, lock=True)
    editable(encounter, data.version)
    encounter.rough_note = data.rough_note
    encounter.reviewed_note = data.reviewed_note.model_dump()
    encounter.version += 1
    commit(db)
    return row(encounter)


@app.post("/api/encounters/{encounter_id}/finalize", response_model=out.EncounterOut)
def finalize(encounter_id: str, data: s.Version, user=Depends(doctor), db: DBSession = DB):
    encounter = own_encounter(db, encounter_id, user, lock=True)
    editable(encounter, data.version)
    reviewed = s.StructuredNote.model_validate(encounter.reviewed_note)
    if all(v == "Not documented" for v in reviewed.model_dump().values()):
        raise HTTPException(422, "Review and document at least one field before finalizing")
    encounter.status = "finalized"
    encounter.finalized_at = datetime.now(timezone.utc)
    encounter.version += 1
    booking = required(db, Appointment, encounter.appointment_id)
    booking.status = "completed"
    booking.version += 1
    audit(db, user, "encounter.finalized", encounter)
    commit(db)
    return row(encounter)


@app.post("/api/encounters/{encounter_id}/generate", response_model=out.DraftOut)
def generate(encounter_id: str, data: s.Version, user=Depends(doctor), db: DBSession = DB):
    encounter = own_encounter(db, encounter_id, user, lock=True)
    editable(encounter, data.version)
    if not encounter.rough_note.strip():
        raise HTTPException(422, "Write and save a rough note first")
    encounter.generation_seq += 1
    source, version, seq = encounter.rough_note, encounter.version, encounter.generation_seq
    draft = AIDraft(
        encounter_id=encounter.id,
        source_version=version,
        generation_seq=seq,
        model="mock-label-parser-v1" if settings().ai_mode == "mock" else settings().ai_model,
        status="pending",
    )
    db.add(draft)
    commit(db)  # Release the transaction before any external call.
    error, output = None, None
    try:
        output = ai.get_provider().generate(source).model_dump()
    except ai.ProviderError as exc:
        error = str(exc)
    encounter = own_encounter(db, encounter_id, user, lock=True)
    stale = (
        encounter.version != version
        or encounter.generation_seq != seq
        or encounter.status != "draft"
    )
    draft.status = "stale" if stale else ("failed" if error else "succeeded")
    draft.error, draft.output = error, output
    commit(db)
    return row(draft)


@app.get("/api/staff", response_model=list[out.UserOut])
def staff(user=Depends(admin), db: DBSession = DB):
    return [public_user(u) for u in db.scalars(select(User).order_by(User.name))]


@app.post("/api/staff", status_code=201, response_model=out.UserOut)
def create_staff(data: s.StaffInput, user=Depends(admin), db: DBSession = DB):
    member = User(
        email=data.email.lower(),
        name=data.name,
        role=data.role,
        password_hash=passwords.hash(data.password),
    )
    db.add(member)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Staff account could not be created") from None
    audit(db, user, "staff.created", member)
    commit(db)
    return public_user(member)


@app.patch("/api/staff/{staff_id}", response_model=out.UserOut)
def change_staff(staff_id: str, data: s.StaffUpdate, user=Depends(admin), db: DBSession = DB):
    if staff_id == user.id:
        raise HTTPException(409, "Cannot change your own administrator account")
    member = required(db, User, staff_id)
    if (
        member.role == "doctor"
        and data.role != "doctor"
        and db.scalar(select(Slot.id).where(Slot.doctor_id == member.id).limit(1))
    ):
        raise HTTPException(
            409, "Doctor has assigned slots; retain the role and deactivate if needed"
        )
    member.role, member.active = data.role, data.active
    db.execute(delete(Session).where(Session.user_id == member.id))
    audit(db, user, "staff.role_or_status_changed", member)
    commit(db)
    return public_user(member)


@app.post("/api/slots", status_code=201, response_model=out.SlotOut)
def create_slot(data: s.SlotInput, user=Depends(admin), db: DBSession = DB):
    member = required(db, User, data.doctor_id)
    if member.role != "doctor" or not member.active:
        raise HTTPException(422, "Select an active doctor")
    slot = Slot(**data.model_dump())
    db.add(slot)
    commit(db)
    return row(slot)


@app.get("/api/audit", response_model=out.Page[out.AuditOut])
def audits(page: int = Query(1, ge=1), user=Depends(admin), db: DBSession = DB):
    return {
        "items": [
            row(a)
            for a in db.scalars(
                select(Audit)
                .order_by(Audit.created_at.desc(), Audit.id)
                .offset((page - 1) * 20)
                .limit(20)
            )
        ],
        "total": db.scalar(select(func.count()).select_from(Audit)),
        "page": page,
        "page_size": 20,
    }


# Mount last so API and OpenAPI routes retain precedence.
mount_frontend(app, settings().static_dir)
