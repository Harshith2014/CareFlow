import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { ReactElement, ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Check,
  ClipboardList,
  Clock3,
  LayoutDashboard,
  LogOut,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { api, clinicDay, labels, setCsrf } from "./api";
import ReschedulePanel from "./ReschedulePanel";
import type {
  Appointment,
  Audit,
  Auth,
  Draft,
  Encounter,
  Note,
  Page,
  Patient,
  Slot,
  User,
} from "./api";

function Field({
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
function Badge({ children }: { children: ReactNode }) {
  return (
    <span
      className={`badge ${children === "completed" || children === "finalized" ? "green" : ""}`}
    >
      {children}
    </span>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <ClipboardList size={28} />
      <p>{text}</p>
    </div>
  );
}
function Pager({
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

export default function App() {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [screen, setScreen] = useState("Overview");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
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
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [rough, setRough] = useState("");
  const [review, setReview] = useState<Note | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [staff, setStaff] = useState<User[]>([]);
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
      const [d, a, sl, p, team, history] = await Promise.all([
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
      ]);
      if (sequence !== refreshSequence.current) return;
      setDoctors(d);
      setAppointments(a);
      setSlots(sl);
      if (p) setPatients(p);
      if (team) setStaff(team);
      if (history) setAudit(history);
    } catch (error) {
      if (sequence === refreshSequence.current) {
        setSlots([]);
        throw error;
      }
    } finally {
      if (sequence === refreshSequence.current) setLoading(false);
    }
  }, [auth, day, doctorFilter, query, page, auditPage]);
  useEffect(() => {
    let active = true;
    refresh().catch((e) => {
      if (active) setError(e.message);
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
  function navigate(next: string) {
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
  const doctorName = (id: string) =>
    doctors.find((d) => d.id === id)?.name ?? "Assigned doctor";
  const appointmentList = (
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
  const filters = (
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
      <span className="muted">{auth.timezone} · 30-minute visits</span>
    </div>
  );

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
              onClick={() => navigate(name)}
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
              aria-label="Sign out"
              className="icon-button"
              onClick={() =>
                void run(async () => {
                  if (
                    dirty &&
                    !confirm("Sign out and discard unsaved changes?")
                  )
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
                  {filters}
                  {appointmentList}
                </section>
                <aside className="right-column">
                  <section className="callout">
                    <div className="callout-icon">
                      <Sparkles size={24} />
                    </div>
                    <span className="eyebrow">THOUGHTFUL DOCUMENTATION</span>
                    <h2>A draft is a starting point.</h2>
                    <p>
                      The assistant organizes supplied notes. A doctor reviews,
                      edits, and explicitly finalizes every encounter.
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
          )}

          {screen === "Patients" && (
            <>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Patient directory</h2>
                  <div className="search">
                    <Search size={17} />
                    <input
                      aria-label="Search patients"
                      placeholder="Search by name…"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                </div>
                {patients.items.length === 0 ? (
                  <Empty text="No matching patients. Try another name or register a fictional patient." />
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Patient</th>
                          <th>Date of birth</th>
                          <th>Contact</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {patients.items.map((p) => (
                          <tr key={p.id}>
                            <td>
                              <strong>{p.name}</strong>
                              <small className="mono">
                                CF-{p.id.slice(0, 8).toUpperCase()}
                              </small>
                            </td>
                            <td>{p.date_of_birth}</td>
                            <td>{p.contact}</td>
                            <td>
                              {role === "receptionist" ? (
                                <div className="actions">
                                  <button
                                    className="secondary"
                                    onClick={() => {
                                      setSelectedPatient(p);
                                      setScreen("Appointments");
                                    }}
                                  >
                                    Book visit
                                  </button>
                                  <button
                                    className="text-button"
                                    onClick={() => {
                                      setEditingPatient(p);
                                      setPatientForm(true);
                                    }}
                                  >
                                    Edit
                                  </button>
                                </div>
                              ) : (
                                <span className="muted">Care relationship</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <Pager page={page} total={patients.total} change={setPage} />
              </section>
              {patientForm && (
                <section className="panel form-panel">
                  <h2>
                    {editingPatient
                      ? "Update demographics"
                      : "Register a fictional patient"}
                  </h2>
                  <form
                    key={editingPatient?.id ?? "new"}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const data = Object.fromEntries(
                        new FormData(e.currentTarget),
                      );
                      void run(
                        async () => {
                          const p = await api<Patient>(
                            editingPatient
                              ? `/patients/${editingPatient.id}`
                              : "/patients",
                            editingPatient ? "PATCH" : "POST",
                            data,
                          );
                          setSelectedPatient(p);
                          setPatientForm(false);
                          await refresh();
                        },
                        editingPatient
                          ? "Demographics updated."
                          : "Patient registered. Choose Book visit to schedule an appointment.",
                      );
                    }}
                  >
                    <div className="form-grid">
                      <Field label="Full name">
                        <input
                          name="name"
                          defaultValue={editingPatient?.name}
                          minLength={2}
                          maxLength={100}
                          required
                          placeholder="Alex Fictional"
                        />
                      </Field>
                      <Field label="Date of birth">
                        <input
                          name="date_of_birth"
                          type="date"
                          defaultValue={editingPatient?.date_of_birth}
                          min="1900-01-01"
                          max={clinicDay(auth.timezone)}
                          required
                        />
                      </Field>
                      <Field label="Contact information">
                        <input
                          name="contact"
                          defaultValue={editingPatient?.contact}
                          minLength={3}
                          maxLength={200}
                          required
                          placeholder="alex@example.test"
                        />
                      </Field>
                    </div>
                    <div className="actions">
                      <button className="primary" disabled={busy}>
                        Save patient
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setPatientForm(false)}
                      >
                        Close
                      </button>
                    </div>
                  </form>
                </section>
              )}
            </>
          )}

          {screen === "Appointments" && (
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
                {filters}
                {appointmentList}
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
                    <button
                      className="secondary"
                      onClick={() => navigate("Patients")}
                    >
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
                          onClick={() =>
                            void run(async () => {
                              await api("/appointments", "POST", {
                                slot_id: s.id,
                                patient_id: selectedPatient?.id,
                              });
                              await refresh();
                            }, "Appointment booked.")
                          }
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
          )}

          {screen === "Encounter" && encounter && review && (
            <>
              <section className="encounter-banner">
                <div>
                  <Badge>{encounter.status}</Badge>
                  <span>
                    Version {encounter.version} {dirty && "· Unsaved changes"}
                  </span>
                </div>
                <span>
                  {locked
                    ? "Finalized record · Amendments are outside this demo"
                    : "Only the assigned doctor can edit this encounter"}
                </span>
              </section>
              <div className="editor-grid">
                <section className="panel form-panel">
                  <div className="panel-heading">
                    <h2>Original rough note</h2>
                    <Badge>Source</Badge>
                  </div>
                  <p className="muted">
                    Fictional information only.{" "}
                    {auth.ai_mode === "mock"
                      ? "This demonstration parser maps Concern:, History:, Observations:, and Plan: labels. Unlabeled notes are copied into Reported concern and need manual organization."
                      : auth.ai_mode === "live"
                        ? "Ordinary rough notes are accepted; section labels are optional. Review every generated field against your source."
                        : "AI is disabled. Save your source and organize the reviewed fields manually."}
                  </p>
                  <Field label="Rough encounter note">
                    <textarea
                      className="rough-note"
                      maxLength={8000}
                      value={rough}
                      disabled={locked || busy}
                      onChange={(e) => setRough(e.target.value)}
                      placeholder={
                        "Concern: Fictional patient reports a mild cough.\nHistory: Started yesterday.\nObservations: No measurements documented.\nPlan: Follow-up discussed."
                      }
                    />
                  </Field>
                  <small className="muted">
                    {rough.length} / 8000 characters
                  </small>
                  <div className="actions">
                    <button
                      className="primary"
                      disabled={busy || locked || !dirty}
                      onClick={() =>
                        void run(async () => {
                          await saveNote();
                        }, "Encounter saved.")
                      }
                    >
                      Save notes
                    </button>
                    <button
                      className="secondary"
                      disabled={
                        busy ||
                        locked ||
                        !rough.trim() ||
                        auth.ai_mode === "disabled"
                      }
                      title={
                        auth.ai_mode === "disabled"
                          ? "AI disabled; write the reviewed note manually"
                          : "Save changes and generate a separate draft"
                      }
                      onClick={() =>
                        void run(async () => {
                          const e = dirty ? await saveNote() : encounter;
                          if (!e) return;
                          const d = await api<Draft>(
                            `/encounters/${e.id}/generate`,
                            "POST",
                            { version: e.version },
                          );
                          setDraft(d);
                          if (d.status !== "succeeded")
                            throw new Error(
                              d.error ??
                                "This response is stale. Reload and generate again.",
                            );
                        })
                      }
                    >
                      <Sparkles size={16} />
                      Generate draft
                    </button>
                  </div>
                  <div className="notice">
                    {auth.ai_mode === "mock"
                      ? "Mock mode: deterministic label parsing, not model inference."
                      : `${auth.ai_mode} mode: generated output requires human review.`}{" "}
                    AI does not finalize or overwrite your original note.
                  </div>
                </section>
                <section className="panel form-panel">
                  <div className="panel-heading">
                    <h2>Doctor-reviewed documentation</h2>
                    <ShieldCheck size={21} />
                  </div>
                  <p className="muted">
                    Verify against the source. Prompt rules and schema
                    validation cannot guarantee factual correctness.
                  </p>
                  {draft && (
                    <div className="draft-preview">
                      <strong>Generated draft · {draft.status}</strong>
                      <small>
                        {draft.model} · Source version {draft.source_version}
                      </small>
                      {draft.output &&
                        Object.entries(labels).map(([key, label]) => (
                          <div key={key}>
                            <strong>{label}</strong>
                            <p>{draft.output?.[key as keyof Note]}</p>
                          </div>
                        ))}
                      {draft.status === "succeeded" && (
                        <button
                          className="secondary"
                          disabled={locked || busy}
                          onClick={() => {
                            if (draft.output) setReview(draft.output);
                          }}
                        >
                          Use draft for review
                        </button>
                      )}
                    </div>
                  )}
                  {Object.entries(labels).map(([key, label]) => (
                    <Field key={key} label={label}>
                      <textarea
                        value={review[key as keyof Note]}
                        disabled={locked || busy}
                        maxLength={8000}
                        onChange={(e) =>
                          setReview({ ...review, [key]: e.target.value })
                        }
                      />
                    </Field>
                  ))}
                  <button
                    className="primary wide"
                    disabled={busy || locked || dirty}
                    title={
                      dirty
                        ? "Save your edits before finalizing"
                        : "Finalization makes the encounter immutable"
                    }
                    onClick={() => {
                      if (
                        confirm(
                          "I have reviewed this documentation against the source. Finalize permanently and complete the appointment?",
                        )
                      )
                        void run(async () => {
                          const e = await api<Encounter>(
                            `/encounters/${encounter.id}/finalize`,
                            "POST",
                            { version: encounter.version },
                          );
                          setEncounter(e);
                          await refresh();
                        }, "Encounter finalized and appointment completed.");
                    }}
                  >
                    <Check size={17} />
                    {locked ? "Finalized" : "Finalize reviewed encounter"}
                  </button>
                  {dirty && (
                    <p className="muted">Save notes before finalizing.</p>
                  )}
                  <button
                    className="text-button"
                    onClick={() => {
                      if (
                        !dirty ||
                        confirm("Discard unsaved edits and reload?")
                      )
                        void run(async () => {
                          const e = await api<Encounter>(
                            `/encounters/${encounter.id}`,
                          );
                          setEncounter(e);
                          setRough(e.rough_note);
                          setReview(e.reviewed_note);
                          setDraft(null);
                        });
                    }}
                  >
                    Reload saved encounter
                  </button>
                </section>
              </div>
            </>
          )}

          {screen === "Staff & slots" && (
            <>
              <div className="editor-grid">
                <section className="panel form-panel">
                  <h2>Add staff account</h2>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      void run(async () => {
                        await api(
                          "/staff",
                          "POST",
                          Object.fromEntries(new FormData(form)),
                        );
                        form.reset();
                        await refresh();
                      }, "Staff account created.");
                    }}
                  >
                    <Field label="Staff name">
                      <input
                        name="name"
                        required
                        minLength={2}
                        maxLength={100}
                      />
                    </Field>
                    <Field label="Staff email">
                      <input name="email" type="email" required />
                    </Field>
                    <Field label="Initial password">
                      <input
                        name="password"
                        type="password"
                        minLength={12}
                        maxLength={128}
                        required
                        autoComplete="new-password"
                      />
                    </Field>
                    <Field label="Role">
                      <select name="role">
                        <option value="receptionist">Receptionist</option>
                        <option value="doctor">Doctor</option>
                        <option value="administrator">Administrator</option>
                      </select>
                    </Field>
                    <button className="primary" disabled={busy}>
                      Create account
                    </button>
                  </form>
                </section>
                <section className="panel form-panel">
                  <h2>Create a 30-minute slot</h2>
                  <p className="muted">
                    Enter the clinic date and time in {auth.timezone}. Starts
                    must be on the hour or half hour.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const data = new FormData(e.currentTarget);
                      void run(async () => {
                        await api("/slots", "POST", {
                          doctor_id: data.get("doctor_id"),
                          starts_at: `${data.get("starts_at")}:00+05:30`,
                        });
                        await refresh();
                      }, "Appointment slot created.");
                    }}
                  >
                    <Field label="Slot doctor">
                      <select name="doctor_id" required>
                        <option value="">Choose doctor</option>
                        {doctors.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Clinic start time">
                      <input
                        name="starts_at"
                        type="datetime-local"
                        step={1800}
                        required
                      />
                    </Field>
                    <button className="primary" disabled={busy}>
                      Create slot
                    </button>
                  </form>
                  <div className="notice">
                    Clinic timezone is Asia/Kolkata in this version. Existing
                    slots are preserved for booking history.
                  </div>
                </section>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Clinic team</h2>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Account</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staff.map((u) => (
                        <tr key={u.id}>
                          <td>{u.name}</td>
                          <td>{u.email}</td>
                          <td>
                            <select
                              aria-label={`Role for ${u.name}`}
                              value={u.role}
                              disabled={busy || u.id === auth.user.id}
                              onChange={(e) =>
                                void run(async () => {
                                  await api(`/staff/${u.id}`, "PATCH", {
                                    role: e.target.value,
                                    active: u.active,
                                  });
                                  await refresh();
                                }, "Staff permissions updated; sessions invalidated.")
                              }
                            >
                              <option value="receptionist">Receptionist</option>
                              <option value="doctor">Doctor</option>
                              <option value="administrator">
                                Administrator
                              </option>
                            </select>
                          </td>
                          <td>
                            <button
                              className="secondary"
                              disabled={busy || u.id === auth.user.id}
                              onClick={() =>
                                void run(async () => {
                                  await api(`/staff/${u.id}`, "PATCH", {
                                    role: u.role,
                                    active: !u.active,
                                  });
                                  await refresh();
                                }, "Account status updated.")
                              }
                            >
                              {u.active ? "Deactivate" : "Activate"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {screen === "Audit history" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Operational audit history</h2>
                  <p className="muted">
                    Append-only through the API. Metadata only; no clinical note
                    bodies.
                  </p>
                </div>
                <ShieldCheck />
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Action</th>
                      <th>Actor</th>
                      <th>Record</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.items.map((a) => (
                      <tr key={a.id}>
                        <td>
                          {new Date(a.created_at).toLocaleString("en-IN", {
                            timeZone: auth.timezone,
                          })}
                        </td>
                        <td>{a.action}</td>
                        <td>
                          {staff.find((u) => u.id === a.actor_id)?.name ??
                            a.actor_id}
                        </td>
                        <td className="mono">
                          {a.record_id}
                          {a.details?.reason && (
                            <details>
                              <summary>Rescheduling details</summary>
                              <p>{a.details.reason}</p>
                              <p>
                                From: {a.details.old_starts_at}
                                <br />
                                To: {a.details.new_starts_at}
                              </p>
                            </details>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {audit.items.length === 0 && (
                <Empty text="No audit events yet." />
              )}
              <Pager
                page={auditPage}
                total={audit.total}
                change={setAuditPage}
              />
            </section>
          )}
          <footer>
            CareFlow{" "}
            <span>
              Independent portfolio demonstration · No clinical use or
              compliance claims
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
