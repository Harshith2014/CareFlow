import { api, tzOffset } from "../api";
import type { Auth, Page, Slot, User } from "../api";
import { Badge, Empty, Field, Pager } from "../components";

interface Props {
  auth: Auth;
  staff: User[];
  doctors: User[];
  upcomingSlots: Page<Slot & { available: boolean }>;
  slotsPage: number;
  busy: boolean;
  formatTime: (t: string) => string;
  doctorName: (id: string) => string;
  setSlotsPage: (p: number) => void;
  run: (work: () => Promise<void>, success?: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export default function StaffSlotsScreen({
  auth,
  staff,
  doctors,
  upcomingSlots,
  slotsPage,
  busy,
  formatTime,
  doctorName,
  setSlotsPage,
  run,
  refresh,
}: Props) {
  return (
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
              <input name="name" required minLength={2} maxLength={100} />
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
            Enter the clinic date and time in {auth.timezone}. Starts must be on
            the hour or half hour.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              void run(async () => {
                await api("/slots", "POST", {
                  doctor_id: data.get("doctor_id"),
                  starts_at: `${data.get("starts_at")}:00${tzOffset(String(data.get("starts_at")), auth.timezone)}`,
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
            Clinic timezone is {auth.timezone}. Existing slots are preserved for
            booking history.
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
                      <option value="administrator">Administrator</option>
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
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Upcoming slots</h2>
            <p className="muted">
              Available slots can be deleted. Booked slots cannot.
            </p>
          </div>
          <Badge>{upcomingSlots.total} total</Badge>
        </div>
        {upcomingSlots.total === 0 ? (
          <Empty text="No upcoming slots. Create slots above." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date &amp; time</th>
                  <th>Doctor</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {upcomingSlots.items.map((s) => (
                  <tr key={s.id}>
                    <td>{formatTime(s.starts_at)}</td>
                    <td>{doctorName(s.doctor_id)}</td>
                    <td>
                      <Badge>{s.available ? "available" : "booked"}</Badge>
                    </td>
                    <td>
                      {s.available ? (
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => {
                            if (
                              confirm(
                                `Delete this slot (${formatTime(s.starts_at)})? This cannot be undone.`,
                              )
                            )
                              void run(async () => {
                                await api(`/slots/${s.id}`, "DELETE");
                                await refresh();
                              }, "Slot deleted.");
                          }}
                        >
                          Delete
                        </button>
                      ) : (
                        <span className="muted">Booked</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager
          page={slotsPage}
          total={upcomingSlots.total}
          change={setSlotsPage}
        />
      </section>
    </>
  );
}
