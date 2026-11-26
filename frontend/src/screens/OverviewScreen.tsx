import { CalendarDays, Check, ClipboardList, Clock3, Sparkles } from "lucide-react";
import type { Appointment, Auth, Slot, User } from "../api";
import { AppointmentList, Badge, ScheduleFilters } from "../components";

interface Props {
  auth: Auth;
  appointments: Appointment[];
  slots: Slot[];
  doctors: User[];
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
  setScreen: (s: string) => void;
  setMessage: (m: string) => void;
  run: (work: () => Promise<void>, success?: string) => Promise<void>;
  refresh: () => Promise<void>;
  openEncounter: (a: Appointment) => Promise<void>;
}

export default function OverviewScreen({
  auth,
  appointments,
  slots,
  doctors,
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
  setScreen,
  setMessage,
  run,
  refresh,
  openEncounter,
}: Props) {
  const role = auth.user.role;
  return (
    <>
      <div className="stats">
        {[
          ["Appointments", appointments.length, CalendarDays],
          [
            "Scheduled",
            appointments.filter((a) => a.status === "scheduled").length,
            Clock3,
          ],
          [
            "Completed",
            appointments.filter((a) => a.status === "completed").length,
            Check,
          ],
          [
            "Available slots",
            slots.filter((s) => s.available).length,
            ClipboardList,
          ],
        ].map(([label, count, Icon]) => {
          const StatIcon = Icon as typeof CalendarDays;
          return (
            <section className="stat" key={String(label)}>
              <div>
                <span>{String(label)}</span>
                <StatIcon size={19} />
              </div>
              <strong>{String(count)}</strong>
              <small>For the selected clinic day</small>
            </section>
          );
        })}
      </div>
      <div className="overview-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>The day's appointments</h2>
              <p className="muted">Every visit, in one place.</p>
            </div>
            <Badge>{appointments.length} visits</Badge>
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
        <aside className="right-column">
          <section className="callout">
            <div className="callout-icon">
              <Sparkles size={24} />
            </div>
            <span className="eyebrow">THOUGHTFUL DOCUMENTATION</span>
            <h2>A draft is a starting point.</h2>
            <p>
              The assistant organizes supplied notes. A doctor reviews, edits,
              and explicitly finalizes every encounter.
            </p>
            <Badge>
              {auth.ai_mode === "mock"
                ? "Mock mode · deterministic parser"
                : `${auth.ai_mode} mode`}
            </Badge>
          </section>
          <section className="panel workflow">
            <h3>A simple path to completion</h3>
            {[
              "Register a fictional patient",
              "Book an available slot",
              "Document & review the encounter",
              "Doctor finalizes the record",
            ].map((text, i) => (
              <div key={text}>
                <span>{i + 1}</span>
                {text}
              </div>
            ))}
          </section>
        </aside>
      </div>
    </>
  );
}
