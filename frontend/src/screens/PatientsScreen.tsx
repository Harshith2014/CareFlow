import { Search } from "lucide-react";
import { api, clinicDay } from "../api";
import type { Auth, Page, Patient, PatientAppointment } from "../api";
import { Badge, Empty, Field, Pager } from "../components";

interface Props {
  auth: Auth;
  patients: Page<Patient>;
  page: number;
  query: string;
  busy: boolean;
  patientForm: boolean;
  editingPatient: Patient | null;
  patientHistory: {
    patient: Patient;
    items: Page<PatientAppointment>;
    page: number;
  } | null;
  formatTime: (t: string) => string;
  doctorName: (id: string) => string;
  setQuery: (q: string) => void;
  setPage: (p: number) => void;
  setPatientForm: (v: boolean) => void;
  setEditingPatient: (p: Patient | null) => void;
  setPatientHistory: (
    h: { patient: Patient; items: Page<PatientAppointment>; page: number } | null,
  ) => void;
  setSelectedPatient: (p: Patient | null) => void;
  setScreen: (s: string) => void;
  run: (work: () => Promise<void>, success?: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export default function PatientsScreen({
  auth,
  patients,
  page,
  query,
  busy,
  patientForm,
  editingPatient,
  patientHistory,
  formatTime,
  doctorName,
  setQuery,
  setPage,
  setPatientForm,
  setEditingPatient,
  setPatientHistory,
  setSelectedPatient,
  setScreen,
  run,
  refresh,
}: Props) {
  const role = auth.user.role;
  return (
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
                      <div className="actions">
                        {role === "receptionist" && (
                          <>
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
                          </>
                        )}
                        <button
                          className="text-button"
                          onClick={() =>
                            void run(async () => {
                              const items = await api<Page<PatientAppointment>>(
                                `/patients/${p.id}/appointments?page=1`,
                              );
                              setPatientHistory({ patient: p, items, page: 1 });
                              setPatientForm(false);
                            })
                          }
                        >
                          History
                        </button>
                      </div>
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
            {editingPatient ? "Update demographics" : "Register a fictional patient"}
          </h2>
          <form
            key={editingPatient?.id ?? "new"}
            onSubmit={(e) => {
              e.preventDefault();
              const data = Object.fromEntries(new FormData(e.currentTarget));
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
      {patientHistory && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Appointment history</h2>
              <p className="muted">{patientHistory.patient.name}</p>
            </div>
            <button
              className="secondary"
              onClick={() => setPatientHistory(null)}
            >
              Close
            </button>
          </div>
          {patientHistory.items.total === 0 ? (
            <Empty text="No appointments on record for this patient." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date &amp; time</th>
                    <th>Doctor</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {patientHistory.items.items.map((a) => (
                    <tr key={a.id}>
                      <td>{formatTime(a.starts_at)}</td>
                      <td>{doctorName(a.doctor_id)}</td>
                      <td>
                        <Badge>{a.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager
            page={patientHistory.page}
            total={patientHistory.items.total}
            change={(p) =>
              void run(async () => {
                const items = await api<Page<PatientAppointment>>(
                  `/patients/${patientHistory.patient.id}/appointments?page=${p}`,
                );
                setPatientHistory({ ...patientHistory, items, page: p });
              })
            }
          />
        </section>
      )}
    </>
  );
}
