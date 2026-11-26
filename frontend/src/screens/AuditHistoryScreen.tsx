import { ShieldCheck } from "lucide-react";
import type { Audit, Auth, Page, User } from "../api";
import { Empty, Pager } from "../components";

interface Props {
  auth: Auth;
  audit: Page<Audit>;
  auditPage: number;
  staff: User[];
  setAuditPage: (p: number) => void;
}

export default function AuditHistoryScreen({
  auth,
  audit,
  auditPage,
  staff,
  setAuditPage,
}: Props) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Operational audit history</h2>
          <p className="muted">
            Append-only through the API. Metadata only; no clinical note bodies.
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
                  {staff.find((u) => u.id === a.actor_id)?.name ?? a.actor_id}
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
      {audit.items.length === 0 && <Empty text="No audit events yet." />}
      <Pager page={auditPage} total={audit.total} change={setAuditPage} />
    </section>
  );
}
