import { useEffect, useRef, useState } from "react";
import { api, clinicDay } from "./api";
import type { Appointment, Slot } from "./api";

type Move = {
  id: string;
  reason: string;
  old_slot_id: string;
  new_slot_id: string;
  created_at: string;
};
export default function ReschedulePanel({
  appointment,
  timezone,
  onClose,
  onComplete,
}: {
  appointment: Appointment;
  timezone: string;
  onClose: () => void;
  onComplete: (day: string) => Promise<void>;
}) {
  const [day, setDay] = useState(
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
      new Date(appointment.starts_at),
    ),
  );
  const [slots, setSlots] = useState<Slot[]>([]);
  const [targetId, setTargetId] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<Move[]>([]);
  const [reload, setReload] = useState(0);
  const pending = useRef<{ fingerprint: string; request_id: string } | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      api<Slot[]>(`/slots?day=${day}&doctor_id=${appointment.doctor_id}`),
      api<Move[]>(`/appointments/${appointment.id}/history`),
    ])
      .then(([available, moves]) => {
        if (active) {
          setSlots(available);
          setHistory(moves);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setSlots([]);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [day, appointment.id, appointment.doctor_id, reload]);
  const target = slots.find((slot) => slot.id === targetId);
  const dateTime = (value: string) =>
    new Intl.DateTimeFormat("en-IN", {
      timeZone: timezone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  async function submit() {
    if (!target || !target.available || reason.trim().length < 3) return;
    if (
      !confirm(
        `Move this appointment from ${dateTime(appointment.starts_at)} to ${dateTime(target.starts_at)}?\nReason: ${reason.trim()}`,
      )
    )
      return;
    const payload = {
      target_slot_id: target.id,
      reason: reason.trim(),
      version: appointment.version,
    };
    const fingerprint = JSON.stringify(payload);
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = { fingerprint, request_id: crypto.randomUUID() };
    setSaving(true);
    setError("");
    try {
      await api(`/appointments/${appointment.id}/reschedule`, "POST", {
        ...payload,
        request_id: pending.current.request_id,
      });
      await onComplete(day);
    } catch (e) {
      setError(
        `${e instanceof Error ? e.message : "Request failed"}. If the response was lost, retry without changing the details. For a stale version, close and reopen this appointment.`,
      );
      // Retain the UUID and payload for an exact replay after a lost response.
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="panel form-panel" aria-label="Reschedule appointment">
      <div className="panel-heading">
        <div>
          <h2>Reschedule appointment</h2>
          <p>
            {appointment.patient_name} · Same doctor only · {timezone}
          </p>
        </div>
        <button className="secondary" disabled={saving} onClick={onClose}>
          Close rescheduling
        </button>
      </div>
      <p>
        <strong>Current appointment:</strong> {dateTime(appointment.starts_at)}
      </p>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="form-grid">
          <div className="field">
            <label htmlFor="move-day">New clinic date</label>
            <input
              id="move-day"
              type="date"
              min={clinicDay(timezone)}
              required
              value={day}
              disabled={saving}
              onChange={(e) => {
                setLoading(true);
                setDay(e.target.value);
                setTargetId("");
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="move-slot">New appointment time</label>
            <select
              id="move-slot"
              required
              value={targetId}
              disabled={loading || saving}
              onChange={(e) => setTargetId(e.target.value)}
            >
              <option value="">
                {loading ? "Loading availability…" : "Choose a future slot"}
              </option>
              {slots
                .filter((s) => s.available && s.id !== appointment.slot_id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {dateTime(s.starts_at)}
                  </option>
                ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="move-reason">Rescheduling reason</label>
            <input
              id="move-reason"
              required
              minLength={3}
              maxLength={300}
              value={reason}
              disabled={saving}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Fictional patient requested another time"
            />
          </div>
        </div>
        {!loading &&
          !slots.some((s) => s.available && s.id !== appointment.slot_id) && (
            <p>No available future slots for this date. Choose another date.</p>
          )}
        {target && (
          <div className="notice">
            <strong>Review change</strong>
            <p>
              From {dateTime(appointment.starts_at)}
              <br />
              To {dateTime(target.starts_at)}
              <br />
              Reason: {reason || "Enter a reason above"}
            </p>
            The appointment ID and doctor remain unchanged. The original slot is
            released only if the new booking succeeds.
          </div>
        )}
        <div className="actions">
          <button
            className="primary"
            disabled={
              loading ||
              saving ||
              !target ||
              !target.available ||
              reason.trim().length < 3
            }
          >
            {saving ? "Rescheduling…" : "Confirm reschedule"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={saving}
            onClick={() => setReload((r) => r + 1)}
          >
            Refresh availability
          </button>
        </div>
      </form>
      <details>
        <summary>Previous rescheduling changes ({history.length})</summary>
        {history.length === 0 ? (
          <p>No previous changes.</p>
        ) : (
          history.map((h) => (
            <p key={h.id}>
              {dateTime(h.created_at)} — {h.reason}
              <br />
              <small>
                From slot {h.old_slot_id} to {h.new_slot_id}
              </small>
            </p>
          ))
        )}
      </details>
    </section>
  );
}
