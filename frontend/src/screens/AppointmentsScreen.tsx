import { ArrowRight } from "lucide-react";
import { api } from "../api";
import type { Appointment, Auth, Slot, User } from "../api";
import { AppointmentList, Empty, ScheduleFilters } from "../components";
import ReschedulePanel from "../ReschedulePanel";

interface Props {
  auth: Auth;
  appointments: Appointment[];
  slots: Slot[];
  doctors: User[];
  rescheduling: Appointment | null;
  selectedPatient: { id: string; name: string } | null;
  day: string;
  doctorFilter: string;
  busy: boolean;
  loading: boolean;
  formatTime: (t: string) => string;
  doctorName: (id: string) => string;
  setDay: (d: string) => void;
  setDoctorFilter: (id: string) => void;
  setLoading: (l: boolean) => void;
  setRescheduling: (a: Appointment | null) => void;
  setMessage: (m: string) => void;
  setScreen: (s: string) => void;
  run: (work: () => Promise<void>, success?: string) => Promise<void>;
  refresh: () => Promise<void>;
  openEncounter: (a: Appointment) => Promise<void>;
  goTo: (name: string) => void;
}

export default function AppointmentsScreen({
  auth,
  appointments,
  slots,
  doctors,
  rescheduling,
  selectedPatient,
  day,
  doctorFilter,
  busy,
  loading,
  formatTime,
  doctorName,
  setDay,
  setDoctorFilter,
  setLoading,
  setRescheduling,
  setMessage,
  setScreen,
  run,
  refresh,
  openEncounter,
  goTo,
}: Props) {
  const role = auth.user.role;
  return (
    <>
      {rescheduling && (
        <ReschedulePanel
          key={rescheduling.id}
          appointment={rescheduling}
          timezone={auth.timezone}
          onClose={() => setRescheduling(null)}
          onComplete={async (newDay) => {
            await refresh();
            setDay(newDay);
            setRescheduling(null);
            setMessage(
              "Appointment rescheduled. The original slot is available again.",
            );
          }}
        />
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>Day schedule</h2>
        </div>
        <ScheduleFilters
          day={day}
          doctorFilter={doctorFilter}
          role={role}
          doctors={doctors}
          timezone={auth.timezone}
          setDay={setDay}
          setDoctorFilter={setDoctorFilter}
          setLoading={setLoading}
        />
        <AppointmentList
          appointments={appointments}
          role={role}
          busy={busy}
          loading={loading}
          formatTime={formatTime}
          doctorName={doctorName}
          setRescheduling={setRescheduling}
          setScreen={setScreen}
          setMessage={setMessage}
          run={run}
          refresh={refresh}
          openEncounter={openEncounter}
        />
      </section>
      {role === "receptionist" && (
        <section className="panel form-panel">
          <div className="panel-heading">
            <div>
              <h2>Book an available appointment</h2>
              <p className="muted">
                {selectedPatient
                  ? `Booking for ${selectedPatient.name}`
                  : "Select a patient from the patient directory first."}
              </p>
            </div>
            <button className="secondary" onClick={() => goTo("Patients")}>
              Choose patient
            </button>
          </div>
          <div className="slot-grid">
            {slots.filter((s) => s.available).length === 0 && (
              <Empty text="No available slots for this selection." />
            )}
            {slots
              .filter((s) => s.available)
              .map((s) => (
                <button
                  className="slot"
                  disabled={!selectedPatient || busy || loading}
                  key={s.id}
                  onClick={() => {
                    const complaint = prompt(
                      "Chief complaint / reason for visit (optional, max 300 characters):",
                    );
                    if (complaint === null) return;
                    void run(async () => {
                      await api("/appointments", "POST", {
                        slot_id: s.id,
                        patient_id: selectedPatient?.id,
                        chief_complaint: complaint.trim() || null,
                      });
                      await refresh();
                    }, "Appointment booked.");
                  }}
                >
                  <strong>{formatTime(s.starts_at)}</strong>
                  <span>{doctorName(s.doctor_id)}</span>
                  <small>
                    Book 30-minute visit <ArrowRight size={13} />
                  </small>
                </button>
              ))}
          </div>
        </section>
      )}
    </>
  );
}
