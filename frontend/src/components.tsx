import { cloneElement, useId } from "react";
import type { ReactElement, ReactNode } from "react";
import { ArrowRight, ClipboardList } from "lucide-react";
import { api } from "./api";
import type { Appointment, Slot, User } from "./api";

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactElement<{ id?: string }>;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id })}
    </div>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span
      className={`badge ${children === "completed" || children === "finalized" ? "green" : ""}`}
    >
      {children}
    </span>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <ClipboardList size={28} />
      <p>{text}</p>
    </div>
  );
}

export function Pager({
  page,
  total,
  change,
}: {
  page: number;
  total: number;
  change: (p: number) => void;
}) {
  return (
    <div className="pager">
      <span>
        {total} records · Page {page}
      </span>
      <button
        className="secondary"
        disabled={page === 1}
        onClick={() => change(page - 1)}
      >
        Previous
      </button>
      <button
        className="secondary"
        disabled={page * 20 >= total}
        onClick={() => change(page + 1)}
      >
        Next
      </button>
    </div>
  );
}

export function AppointmentList({
  appointments,
  role,
  busy,
  loading,
  formatTime,
  doctorName,
  setRescheduling,
  setScreen,
  setMessage,
  run,
  refresh,
  openEncounter,
}: {
  appointments: Appointment[];
  role: string;
  busy: boolean;
  loading: boolean;
  formatTime: (t: string) => string;
  doctorName: (id: string) => string;
  setRescheduling: (a: Appointment | null) => void;
  setScreen: (s: string) => void;
  setMessage: (m: string) => void;
  run: (work: () => Promise<void>, success?: string) => Promise<void>;
  refresh: () => Promise<void>;
  openEncounter: (a: Appointment) => Promise<void>;
}) {
  return (
    <div className="appointment-list">
      {appointments.length === 0 ? (
        <Empty text="No appointments for this day. A little breathing room." />
      ) : (
        appointments.map((a) => (
          <div className="appointment-row" key={a.id}>
            <div className="time">
              {formatTime(a.starts_at)}
              <small>30 min</small>
            </div>
            <div className="avatar">
              {a.patient_name.slice(0, 2).toUpperCase()}
            </div>
            <div className="appointment-person">
              <strong>{a.patient_name}</strong>
              <small>{doctorName(a.doctor_id)}</small>
              {a.chief_complaint && (
                <small>Chief concern: {a.chief_complaint}</small>
              )}
              {a.cancellation_reason && (
                <small>Reason: {a.cancellation_reason}</small>
              )}
            </div>
            <Badge>{a.status}</Badge>
            {role === "receptionist" && a.status === "scheduled" && (
              <button
                className="secondary"
                disabled={busy || loading || !a.can_reschedule}
                title={
                  !a.can_reschedule
                    ? "An encounter has started; rescheduling is unavailable"
                    : "Move to another slot with the same doctor"
                }
                onClick={() => {
                  setRescheduling(a);
                  setScreen("Appointments");
                  setMessage("");
                }}
              >
                Reschedule
              </button>
            )}
            {role === "doctor" && a.status !== "canceled" && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void run(() => openEncounter(a))}
              >
                {a.status === "completed" ? "View encounter" : "Open encounter"}{" "}
                <ArrowRight size={15} />
              </button>
            )}
            {role === "receptionist" && a.status === "scheduled" && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  const reason = prompt(
                    "Cancel this appointment? Enter the cancellation reason (at least 3 characters).",
                  );
                  if (reason)
                    void run(async () => {
                      await api(`/appointments/${a.id}/cancel`, "POST", {
                        reason,
                        version: a.version,
                      });
                      await refresh();
                    }, "Appointment canceled. The slot is available again.");
                }}
              >
                Cancel
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}

export function ScheduleFilters({
  day,
  doctorFilter,
  role,
  doctors,
  timezone,
  setDay,
  setDoctorFilter,
  setLoading,
}: {
  day: string;
  doctorFilter: string;
  role: string;
  doctors: User[];
  timezone: string;
  setDay: (d: string) => void;
  setDoctorFilter: (id: string) => void;
  setLoading: (l: boolean) => void;
}) {
  return (
    <div className="filters">
      <Field label="Clinic date">
        <input
          type="date"
          value={day}
          onChange={(e) => {
            setLoading(true);
            setDay(e.target.value);
          }}
          required
        />
      </Field>
      {role !== "doctor" && (
        <Field label="Doctor">
          <select
            value={doctorFilter}
            onChange={(e) => {
              setLoading(true);
              setDoctorFilter(e.target.value);
            }}
          >
            <option value="">All doctors</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <span className="muted">{timezone} · 30-minute visits</span>
    </div>
  );
}

export type SlotWithAvailability = Slot & { available: boolean };
