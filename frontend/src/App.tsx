import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Check,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Plus,
  ShieldCheck,
  Users,
} from "lucide-react";
import { api, clinicDay, onExpired, setCsrf } from "./api";
import type {
  Appointment,
  Audit,
  Auth,
  Draft,
  Encounter,
  Note,
  Page,
  Patient,
  PatientAppointment,
  Slot,
  User,
} from "./api";
import { Field } from "./components";
import OverviewScreen from "./screens/OverviewScreen";
import PatientsScreen from "./screens/PatientsScreen";
import AppointmentsScreen from "./screens/AppointmentsScreen";
import EncounterScreen from "./screens/EncounterScreen";
import StaffSlotsScreen from "./screens/StaffSlotsScreen";
import AuditHistoryScreen from "./screens/AuditHistoryScreen";

const ROUTES: Record<string, string> = {
  "/": "Overview",
  "/patients": "Patients",
  "/appointments": "Appointments",
  "/encounter": "Encounter",
  "/staff": "Staff & slots",
  "/audit": "Audit history",
};
const PATHS: Record<string, string> = Object.fromEntries(
  Object.entries(ROUTES).map(([k, v]) => [v, k]),
);

export default function App() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const screen = ROUTES[pathname] ?? "Overview";
  const setScreen = (name: string) => navigate(PATHS[name] ?? "/");
  const [auth, setAuth] = useState<Auth | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const refreshSequence = useRef(0);
  const [day, setDay] = useState(clinicDay());
  const [doctorFilter, setDoctorFilter] = useState("");
  const [doctors, setDoctors] = useState<User[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [patients, setPatients] = useState<Page<Patient>>({
    items: [],
    total: 0,
    page: 1,
    page_size: 20,
  });
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [patientForm, setPatientForm] = useState(false);
  const [patientHistory, setPatientHistory] = useState<{
    patient: Patient;
    items: Page<PatientAppointment>;
    page: number;
  } | null>(null);
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [rough, setRough] = useState("");
  const [review, setReview] = useState<Note | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [staff, setStaff] = useState<User[]>([]);
  const [upcomingSlots, setUpcomingSlots] = useState<
    Page<Slot & { available: boolean }>
  >({ items: [], total: 0, page: 1, page_size: 20 });
  const [slotsPage, setSlotsPage] = useState(1);
  const [audit, setAudit] = useState<Page<Audit>>({
    items: [],
    total: 0,
    page: 1,
    page_size: 20,
  });
  const [auditPage, setAuditPage] = useState(1);
  const role = auth?.user.role;
  const formatTime = (time: string) =>
    new Intl.DateTimeFormat("en-IN", {
      timeZone: auth?.timezone ?? "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(time));

  useEffect(() => {
    onExpired(() => {
      setAuth(null);
      setCsrf("");
      setEncounter(null);
      setSelectedPatient(null);
    });
    api<Auth>("/auth/me")
      .then((a) => {
        setCsrf(a.csrf);
        setAuth(a);
      })
      .catch(() => {})
      .finally(() => setInitializing(false));
  }, []);

  const refresh = useCallback(async () => {
    if (!auth) return;
    const sequence = ++refreshSequence.current;
    setLoading(true);
    const filter = `?day=${day}&doctor_id=${doctorFilter}`;
    try {
      const [d, a, sl, p, team, history, upcoming] = await Promise.all([
        api<User[]>("/doctors"),
        api<Appointment[]>("/appointments" + filter),
        api<Slot[]>("/slots" + filter),
        auth.user.role !== "administrator"
          ? api<Page<Patient>>(
              `/patients?q=${encodeURIComponent(query)}&page=${page}`,
            )
          : Promise.resolve(null),
        auth.user.role === "administrator"
          ? api<User[]>("/staff")
          : Promise.resolve(null),
        auth.user.role === "administrator"
          ? api<Page<Audit>>(`/audit?page=${auditPage}`)
          : Promise.resolve(null),
        auth.user.role === "administrator"
          ? api<Page<Slot & { available: boolean }>>(
              `/slots/upcoming?page=${slotsPage}`,
            )
          : Promise.resolve(null),
      ]);
      if (sequence !== refreshSequence.current) return;
      setDoctors(d);
      setAppointments(a);
      setSlots(sl);
      if (p) setPatients(p);
      if (team) setStaff(team);
      if (history) setAudit(history);
      if (upcoming) setUpcomingSlots(upcoming);
    } catch (err) {
      if (sequence === refreshSequence.current) {
        setSlots([]);
        throw err;
      }
    } finally {
      if (sequence === refreshSequence.current) setLoading(false);
    }
  }, [auth, day, doctorFilter, query, page, auditPage, slotsPage]);

  useEffect(() => {
    let active = true;
    refresh().catch((e) => {
      if (active) setError((e as Error).message);
    });
    return () => {
      active = false;
    };
  }, [refresh]);

  async function run(work: () => Promise<void>, success = "") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
      if (success) setMessage(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  function goTo(next: string) {
    if (
      encounter &&
      (rough !== encounter.rough_note ||
        JSON.stringify(review) !== JSON.stringify(encounter.reviewed_note)) &&
      !confirm("Leave this encounter and discard unsaved changes?")
    )
      return;
    setScreen(next);
    setRescheduling(null);
    setEncounter(null);
    setError("");
    setMessage("");
  }

  async function openEncounter(appointment: Appointment) {
    const e = await api<Encounter>(
      `/appointments/${appointment.id}/encounter`,
      "POST",
    );
    const full = await api<Encounter>(`/encounters/${e.id}`);
    setEncounter(full);
    setRough(full.rough_note);
    setReview(full.reviewed_note);
    setDraft(
      full.drafts?.find(
        (d) => d.status === "succeeded" && d.source_version === full.version,
      ) ?? null,
    );
    setScreen("Encounter");
  }

  async function saveNote() {
    if (!encounter || !review) return null;
    const saved = await api<Encounter>(`/encounters/${encounter.id}`, "PATCH", {
      version: encounter.version,
      rough_note: rough,
      reviewed_note: review,
    });
    setEncounter(saved);
    setDraft(null);
    return saved;
  }

  const dirty =
    !!encounter &&
    (rough !== encounter.rough_note ||
      JSON.stringify(review) !== JSON.stringify(encounter.reviewed_note));
  const locked = encounter?.status === "finalized";

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const doctorName = (id: string) =>
    doctors.find((d) => d.id === id)?.name ?? "Assigned doctor";

  if (initializing) return <div className="loading">Opening CareFlow…</div>;
  if (!auth)
    return (
      <main className="login">
        <section className="login-story">
          <div className="brand">
            <Activity /> CareFlow
          </div>
          <div>
            <span className="eyebrow">A LITTLE MORE ROOM FOR CARE</span>
            <h1>
              A clear path through
              <br />
              the clinic day.
            </h1>
            <p>
              From the first appointment to the final note.
              <br />
              One thoughtful workspace for your team.
            </p>
            <div className="story-line">
              <Check /> Schedule with confidence
            </div>
            <div className="story-line">
              <Check /> Keep documentation in the doctor's hands
            </div>
            <div className="story-line">
              <Check /> Make every handoff clear
            </div>
          </div>
          <small>
            Independent portfolio project · Not affiliated with ModMed
          </small>
        </section>
        <section className="login-form">
          <div className="demo">Demo — fictional data</div>
          <h2>Welcome to your workspace</h2>
          <p className="muted">Sign in with your clinic staff account.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              void run(async () => {
                const a = await api<Auth>(
                  "/auth/login",
                  "POST",
                  Object.fromEntries(data),
                );
                setCsrf(a.csrf);
                setAuth(a);
                setScreen("Overview");
              }, "");
            }}
          >
            <Field label="Email address">
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                placeholder="reception@careflow.demo"
              />
            </Field>
            <Field label="Password">
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
            {error && (
              <div role="alert" className="error">
                {error}
              </div>
            )}
            <button disabled={busy} className="primary wide">
              {busy ? "Signing in…" : "Sign in"} <ArrowRight size={17} />
            </button>
          </form>
          <p className="login-note">
            <ShieldCheck size={20} /> Fictional data only. This demonstration is
            not intended for clinical use.
          </p>
        </section>
      </main>
    );

  const navigation =
    role === "administrator"
      ? ([
          ["Overview", LayoutDashboard],
          ["Staff & slots", Users],
          ["Audit history", ShieldCheck],
        ] as const)
      : ([
          ["Overview", LayoutDashboard],
          ["Patients", Users],
          ["Appointments", CalendarDays],
        ] as const);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Activity /> CareFlow
          <span className="brand-dot" />
        </div>
        <div className="workspace-label">CLINIC WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map(([name, Icon]) => (
            <button
              key={name}
              className={screen === name ? "nav-item active" : "nav-item"}
              onClick={() => goTo(name)}
            >
              <Icon size={19} />
              {name}
              {screen === name && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="safety-note">
            <ShieldCheck size={21} />
            <strong>Designed for demonstration</strong>
            <p>
              Fictional patients.
              <br />
              Human-reviewed documentation.
            </p>
          </div>
          <div className="profile">
            <div className="avatar dark">{auth.user.name.slice(0, 1)}</div>
            <div>
              <strong>{auth.user.name}</strong>
              <small>{role}</small>
            </div>
            <button
              aria-label="Change password"
              className="icon-button"
              title="Change password"
              onClick={() => setChangingPassword((v) => !v)}
            >
              <KeyRound size={18} />
            </button>
            <button
              aria-label="Sign out"
              className="icon-button"
              onClick={() =>
                void run(async () => {
                  if (dirty && !confirm("Sign out and discard unsaved changes?"))
                    return;
                  await api("/auth/logout", "POST");
                  setAuth(null);
                  setCsrf("");
                  setEncounter(null);
                  setSelectedPatient(null);
                })
              }
            >
              <LogOut size={18} />
            </button>
          </div>
          {changingPassword && (
            <form
              className="password-form"
              onSubmit={(e) => {
                e.preventDefault();
                const data = Object.fromEntries(new FormData(e.currentTarget));
                void run(async () => {
                  if (data.new_password !== data.confirm_password)
                    throw new Error("New passwords do not match");
                  const a = await api<Auth>("/auth/password", "PATCH", {
                    current_password: data.current_password,
                    new_password: data.new_password,
                  });
                  setCsrf(a.csrf);
                  setChangingPassword(false);
                }, "Password changed. Other sessions have been signed out.");
                (e.target as HTMLFormElement).reset();
              }}
            >
              <strong>Change password</strong>
              <input
                name="current_password"
                type="password"
                placeholder="Current password"
                autoComplete="current-password"
                required
                minLength={1}
              />
              <input
                name="new_password"
                type="password"
                placeholder="New password (12+ characters)"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
              <input
                name="confirm_password"
                type="password"
                placeholder="Confirm new password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
              <div className="actions">
                <button className="primary" disabled={busy}>
                  Save
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setChangingPassword(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            CareFlow clinic <span className="divider">/</span>{" "}
            <strong>{screen}</strong>
          </span>
          <span className="demo">
            <span /> Demo — fictional data
          </span>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {role === "doctor"
                  ? "YOUR CARE WORKSPACE"
                  : role === "administrator"
                    ? "CLINIC OPERATIONS"
                    : "KEEP THE DAY MOVING"}
              </span>
              <h1>
                {screen === "Overview"
                  ? `Good to see you, ${auth.user.name.split(" ")[0]}.`
                  : screen === "Encounter"
                    ? "Encounter workspace"
                    : screen}
              </h1>
              <p className="muted">
                {screen === "Overview"
                  ? "A clear view of the day, so you can focus on what comes next."
                  : screen === "Encounter"
                    ? "Organize the source. Review every field. Finalize with intention."
                    : "The right information, ready when your team needs it."}
              </p>
            </div>
            {role === "receptionist" && screen !== "Encounter" && (
              <button
                className="primary"
                onClick={() => {
                  setEditingPatient(null);
                  setPatientForm(true);
                  setScreen("Patients");
                }}
              >
                <Plus size={18} /> Register patient
              </button>
            )}
          </div>
          {error && (
            <div className="error" role="alert">
              {error}{" "}
              <button className="text-button" onClick={() => void run(refresh)}>
                Refresh data
              </button>
            </div>
          )}
          {message && (
            <div className="success" role="status">
              <Check size={17} />
              {message}
            </div>
          )}
          {(busy || loading) && (
            <div className="working" role="status">
              {busy ? "Working…" : "Loading clinic data…"}
            </div>
          )}

          {screen === "Overview" && (
            <OverviewScreen
              auth={auth}
              appointments={appointments}
              slots={slots}
              doctors={doctors}
              day={day}
              doctorFilter={doctorFilter}
              busy={busy}
              loading={loading}
              formatTime={formatTime}
              doctorName={doctorName}
              setDay={setDay}
              setDoctorFilter={setDoctorFilter}
              setLoading={setLoading}
              setRescheduling={setRescheduling}
              setScreen={setScreen}
              setMessage={setMessage}
              run={run}
              refresh={refresh}
              openEncounter={openEncounter}
            />
          )}

          {screen === "Patients" && (
            <PatientsScreen
              auth={auth}
              patients={patients}
              page={page}
              query={query}
              busy={busy}
              patientForm={patientForm}
              editingPatient={editingPatient}
              patientHistory={patientHistory}
              formatTime={formatTime}
              doctorName={doctorName}
              setQuery={setQuery}
              setPage={setPage}
              setPatientForm={setPatientForm}
              setEditingPatient={setEditingPatient}
              setPatientHistory={setPatientHistory}
              setSelectedPatient={setSelectedPatient}
              setScreen={setScreen}
              run={run}
              refresh={refresh}
            />
          )}

          {screen === "Appointments" && (
            <AppointmentsScreen
              auth={auth}
              appointments={appointments}
              slots={slots}
              doctors={doctors}
              rescheduling={rescheduling}
              selectedPatient={selectedPatient}
              day={day}
              doctorFilter={doctorFilter}
              busy={busy}
              loading={loading}
              formatTime={formatTime}
              doctorName={doctorName}
              setDay={setDay}
              setDoctorFilter={setDoctorFilter}
              setLoading={setLoading}
              setRescheduling={setRescheduling}
              setMessage={setMessage}
              setScreen={setScreen}
              run={run}
              refresh={refresh}
              openEncounter={openEncounter}
              goTo={goTo}
            />
          )}

          {screen === "Encounter" && encounter && review && (
            <EncounterScreen
              auth={auth}
              encounter={encounter}
              rough={rough}
              review={review}
              draft={draft}
              busy={busy}
              dirty={dirty}
              locked={!!locked}
              setRough={setRough}
              setReview={setReview}
              setDraft={setDraft}
              setEncounter={setEncounter}
              run={run}
              refresh={refresh}
              saveNote={saveNote}
            />
          )}

          {screen === "Staff & slots" && (
            <StaffSlotsScreen
              auth={auth}
              staff={staff}
              doctors={doctors}
              upcomingSlots={upcomingSlots}
              slotsPage={slotsPage}
              busy={busy}
              formatTime={formatTime}
              doctorName={doctorName}
              setSlotsPage={setSlotsPage}
              run={run}
              refresh={refresh}
            />
          )}

          {screen === "Audit history" && (
            <AuditHistoryScreen
              auth={auth}
              audit={audit}
              auditPage={auditPage}
              staff={staff}
              setAuditPage={setAuditPage}
            />
          )}

          <footer>
            CareFlow{" "}
            <span>
              Independent portfolio demonstration · No clinical use or compliance
              claims
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
