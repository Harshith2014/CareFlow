export type User = {
  id: string;
  name: string;
  email: string;
  role: "doctor" | "receptionist" | "administrator";
  active: boolean;
};
export type Auth = {
  user: User;
  csrf: string;
  ai_mode: string;
  timezone: string;
};
export type Patient = {
  id: string;
  name: string;
  date_of_birth: string;
  contact: string;
  created_at: string;
  updated_at: string;
};
export type Slot = {
  id: string;
  doctor_id: string;
  starts_at: string;
  available: boolean;
};
export type Appointment = {
  id: string;
  patient_id: string;
  patient_name: string;
  starts_at: string;
  doctor_id: string;
  status: string;
  cancellation_reason: string | null;
  slot_id: string;
  version: number;
  can_reschedule: boolean;
};
export const labels = {
  reported_concern: "Reported concern",
  relevant_history: "Relevant history",
  documented_observations: "Documented observations",
  documented_plan: "Plan explicitly documented in the source",
};
export type Note = Record<keyof typeof labels, string>;
export type Draft = {
  id: string;
  source_version: number;
  model: string;
  status: string;
  output: Note | null;
  error: string | null;
};
export type Encounter = {
  id: string;
  version: number;
  status: string;
  rough_note: string;
  reviewed_note: Note;
  drafts?: Draft[];
};
export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
};
export type Audit = {
  id: string;
  actor_id: string;
  action: string;
  record_id: string;
  created_at: string;
  details: {
    old_starts_at?: string;
    new_starts_at?: string;
    reason?: string;
  } | null;
};
let csrf = "";
export function setCsrf(value: string) {
  csrf = value;
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.detail;
    throw new Error(
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail
              .map(
                (d: { loc: string[]; msg: string }) =>
                  `${d.loc.slice(1).join(".")}: ${d.msg}`,
              )
              .join("; ")
          : "The server could not complete this request. Try again.",
    );
  }
  return data;
}
export function clinicDay(timezone = "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
