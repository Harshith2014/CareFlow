// Records actual local application behavior. No HTTP interception or simulated outcomes.
import { chromium, request, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const output = path.join(root, "docs/demo");
const baseURL = "http://localhost:5173";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  baseURL,
  viewport: { width: 1440, height: 1000 },
  recordVideo: {
    dir: path.join(root, "frontend/test-results/recording"),
    size: { width: 1440, height: 1000 },
  },
});
const page = await context.newPage();
const video = page.video();
const api = await request.newContext({
  baseURL,
  extraHTTPHeaders: { Origin: baseURL },
});
let headers;
let backendChanged = false;
const started = Date.now();
const chapters = [];
const observed = {};
async function pauseUntil(seconds) {
  await page.evaluate(() => globalThis.scrollTo(0, 0));
  // Flush the compositor after fast updates so recorded pauses show the asserted DOM state.
  await page.screenshot();
  await page.mouse.move(1100, 70);
  const remaining = seconds * 1000 - (Date.now() - started);
  if (remaining > 0) await page.waitForTimeout(remaining); // Presentation pacing, not service readiness.
}
function chapter(title) {
  chapters.push({ seconds: (Date.now() - started) / 1000, title });
}
async function login(account) {
  await page.goto("/");
  await page.getByLabel("Email address").fill(`${account}@careflow.demo`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("CareFlow-Demo-2026!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Good to see you/ }),
  ).toBeVisible();
}
async function post(url, data, status = 201) {
  const response = await api.post(url, { headers, data });
  expect(response.status()).toBe(status);
  return response.json();
}
async function compose(mode) {
  await new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      ["compose", "up", "-d", "--force-recreate", "backend", "frontend"],
      {
        cwd: root,
        env: { ...process.env, AI_MODE: mode, AI_API_KEY: "" },
        windowsHide: true,
        stdio: "ignore",
      },
    );
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`Compose exited ${code}`)),
    );
  });
  await expect
    .poll(
      async () => {
        try {
          return (await api.get("/api/health")).status();
        } catch {
          return 0;
        }
      },
      { timeout: 60000, intervals: [250, 500, 1000] },
    )
    .toBe(200);
}
try {
  const auth = await (
    await api.post("/api/auth/login", {
      data: {
        email: "reception@careflow.demo",
        password: "CareFlow-Demo-2026!",
      },
    })
  ).json();
  expect(auth.ai_mode).toBe("mock");
  headers = { "X-CSRF-Token": auth.csrf };
  const day = new Date(Date.now() + 86400000 * 4).toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  const name = `Fictional Demo River ${Date.now()}`;
  chapter("Independent portfolio demonstration; fictional data; mock AI");
  await login("reception");
  await pauseUntil(10);
  chapter("Receptionist registers a fictional patient");
  await page
    .getByRole("button", { name: "Register patient", exact: true })
    .click();
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Date of birth", { exact: true }).fill("2001-04-12");
  await page.getByLabel("Contact information").fill("river@example.test");
  await pauseUntil(20);
  await page.getByRole("button", { name: "Save patient", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Patient registered");
  await page.getByLabel("Search patients").fill(name);
  await page
    .getByRole("row")
    .filter({ hasText: name })
    .getByRole("button", { name: "Book visit" })
    .click();
  await page.getByLabel("Clinic date").fill(day);
  await page
    .getByLabel("Doctor", { exact: true })
    .selectOption({ label: "Dr. Mira Demo" });
  await expect(
    page.getByRole("button", { name: /Book 30-minute visit/ }).first(),
  ).toBeEnabled();
  chapter("Book a future slot; PostgreSQL enforces one active booking");
  await page
    .getByRole("button", { name: /Book 30-minute visit/ })
    .first()
    .click();
  await expect(page.getByRole("status")).toContainText("Appointment booked");
  let bookings = await (await api.get(`/api/appointments?day=${day}`)).json();
  const appointment = bookings.find((a) => a.patient_name === name);
  observed.booked = appointment.id;
  await pauseUntil(35);
  chapter("Review old and new times, give a reason, confirm rescheduling");
  await page
    .locator(".appointment-row")
    .filter({ hasText: name })
    .getByRole("button", { name: "Reschedule", exact: true })
    .click();
  await expect(page.getByLabel("New appointment time")).toBeEnabled();
  await page.getByLabel("New appointment time").selectOption({ index: 1 });
  await page
    .getByLabel("Rescheduling reason")
    .fill("Fictional patient requested a later appointment");
  await pauseUntil(49);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Confirm reschedule" }).click();
  await expect(page.getByRole("status")).toContainText("rescheduled");
  bookings = await (await api.get(`/api/appointments?day=${day}`)).json();
  expect(bookings.find((a) => a.id === appointment.id).slot_id).not.toBe(
    appointment.slot_id,
  );
  observed.rescheduled_same_identity = true;
  await pauseUntil(56);
  chapter(
    "A real second session books the displayed slot: the stale click receives 409",
  );
  // The freed original slot is first in the displayed list. Occupy it through another session.
  const competitor = await post("/api/appointments", {
    patient_id: appointment.patient_id,
    slot_id: appointment.slot_id,
  });
  const conflictPromise = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/appointments") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: /Book 30-minute visit/ })
    .first()
    .click();
  observed.booking_conflict_status = (await conflictPromise).status();
  expect(observed.booking_conflict_status).toBe(409);
  await expect(page.getByRole("alert")).toBeVisible();
  await pauseUntil(69);
  await post(
    `/api/appointments/${competitor.id}/cancel`,
    { reason: "Fictional recording conflict fixture finished", version: 1 },
    200,
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  chapter("Assigned doctor enters an ordinary unstructured fictional note");
  await login("doctor");
  await page.getByLabel("Clinic date").fill(day);
  const encounterResponse = page.waitForResponse((r) =>
    r.url().endsWith(`/appointments/${appointment.id}/encounter`),
  );
  await page
    .locator(".appointment-row")
    .filter({ hasText: name })
    .getByRole("button", { name: "Open encounter" })
    .click();
  const encounter = await (await encounterResponse).json();
  const source =
    "Fictional patient reports a cough since yesterday and denies fever. No measurements supplied. Follow-up was discussed; no treatment was documented.";
  await page.getByLabel("Rough encounter note").fill(source);
  await page.getByRole("button", { name: "Save notes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Encounter saved");
  await pauseUntil(89);
  chapter(
    "Mock draft: deterministic copy, not live inference; doctor organizes and reviews",
  );
  await page
    .getByRole("button", { name: "Generate draft", exact: true })
    .click();
  await expect(page.getByText("Generated draft · succeeded")).toBeVisible();
  await page.getByRole("button", { name: "Use draft for review" }).click();
  await page
    .getByLabel("Reported concern", { exact: true })
    .fill("Reports a cough; denies fever.");
  await page
    .getByLabel("Relevant history", { exact: true })
    .fill("Started yesterday.");
  await page
    .getByLabel("Documented observations", { exact: true })
    .fill("Not documented");
  await page
    .getByLabel("Plan explicitly documented in the source", { exact: true })
    .fill("Follow-up was discussed; no treatment was documented.");
  await page.getByRole("button", { name: "Save notes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Encounter saved");
  await expect(page.getByLabel("Rough encounter note")).toHaveValue(source);
  observed.source_preserved = true;
  await pauseUntil(111);
  chapter(
    "Explicit human finalization; source and reviewed fields become immutable",
  );
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Finalize reviewed encounter" })
    .click();
  await expect(
    page.getByRole("button", { name: "Finalized", exact: true }),
  ).toBeDisabled();
  observed.finalized = true;
  await pauseUntil(121);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login("reception");
  chapter(
    "A direct clinical-record request by reception is denied by the backend",
  );
  const denied = await page.goto(`/api/encounters/${encounter.id}`);
  expect(denied.status()).toBe(403);
  observed.unauthorized_status = denied.status();
  await pauseUntil(132);
  // Create a second fictional encounter for visible manual-only fallback.
  const available = await (
    await api.get(`/api/slots?day=${day}&doctor_id=${appointment.doctor_id}`)
  ).json();
  const manual = await post("/api/appointments", {
    patient_id: appointment.patient_id,
    slot_id: available.find((s) => s.available).id,
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  chapter(
    "AI is genuinely disabled in the backend; manual documentation remains available",
  );
  backendChanged = true;
  await compose("disabled");
  await login("doctor");
  expect((await (await page.request.get("/api/auth/me")).json()).ai_mode).toBe(
    "disabled",
  );
  await page.getByLabel("Clinic date").fill(day);
  await page
    .locator(".appointment-row")
    .filter({ hasText: name })
    .getByRole("button", { name: "Open encounter", exact: true })
    .click();
  await page
    .getByLabel("Rough encounter note")
    .fill("Fictional manual-only visit. Patient reports no new concern.");
  await page
    .getByLabel("Reported concern", { exact: true })
    .fill("Patient reports no new concern.");
  await page.getByRole("button", { name: "Save notes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Encounter saved");
  await expect(
    page.getByRole("button", { name: "Generate draft", exact: true }),
  ).toBeDisabled();
  observed.manual_saved_with_ai_disabled = true;
  observed.manual_appointment = manual.id;
  await pauseUntil(180);
  observed.elapsed_seconds = (Date.now() - started) / 1000;
  await context.close();
  await video.saveAs(path.join(output, "careflow-demo.webm"));
  await writeFile(
    path.join(output, "recording.json"),
    JSON.stringify(
      {
        recorded_at: new Date().toISOString(),
        mode: "mock then disabled; no live calls",
        chapters,
        observed,
      },
      null,
      2,
    ),
  );
  console.log("Verified recording saved to docs/demo/careflow-demo.webm");
} finally {
  await context.close();
  await browser.close();
  if (backendChanged) await compose("mock");
  await api.dispose();
}
