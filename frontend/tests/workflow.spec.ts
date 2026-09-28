import { test, expect, request } from "@playwright/test";
import type { Page } from "@playwright/test";

async function login(page: Page, account: string) {
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

test("rescheduling conflict preserves the original booking", async ({
  page,
}, info) => {
  const baseURL = process.env.BASE_URL ?? "http://localhost:5173";
  const client = await request.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL },
  });
  const authResponse = await client.post("/api/auth/login", {
    data: { email: "reception@careflow.demo", password: "CareFlow-Demo-2026!" },
  });
  expect(authResponse.ok()).toBeTruthy();
  const auth = await authResponse.json();
  const headers = { "X-CSRF-Token": auth.csrf };
  const doctors = await (await client.get("/api/doctors")).json();
  const doctor = doctors.find(
    (d: { email: string }) => d.email === "doctor@careflow.demo",
  );
  const day = new Date(Date.now() + 86400000 * 2).toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  const slots = (
    await (
      await client.get(`/api/slots?day=${day}&doctor_id=${doctor.id}`)
    ).json()
  ).filter((s: { available: boolean }) => s.available);
  expect(slots.length).toBeGreaterThanOrEqual(2);
  const name = `Fictional Conflict ${Date.now()}`;
  const patient = await (
    await client.post("/api/patients", {
      headers,
      data: {
        name,
        date_of_birth: "2000-01-01",
        contact: "fictional@example.test",
      },
    })
  ).json();
  const bookingResponse = await client.post("/api/appointments", {
    headers,
    data: { patient_id: patient.id, slot_id: slots[0].id },
  });
  expect(bookingResponse.status()).toBe(201);
  const booking = await bookingResponse.json();
  await login(page, "reception");
  await page.getByRole("button", { name: "Appointments", exact: true }).click();
  await page.getByLabel("Clinic date").fill(day);
  await page
    .getByLabel("Doctor", { exact: true })
    .selectOption({ label: "Dr. Mira Demo" });
  await page
    .locator(".appointment-row")
    .filter({ hasText: name })
    .getByRole("button", { name: "Reschedule", exact: true })
    .click();
  await expect(page.getByLabel("New appointment time")).toBeEnabled();
  await page.getByLabel("New appointment time").selectOption(slots[1].id);
  await page
    .getByLabel("Rescheduling reason")
    .fill("Fictional request while another receptionist books");
  // A real independent session takes the target after the UI loaded availability.
  const competitor = await client.post("/api/appointments", {
    headers,
    data: { patient_id: patient.id, slot_id: slots[1].id },
  });
  expect(competitor.status()).toBe(201);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Confirm reschedule" }).click();
  await expect(page.getByRole("alert")).toContainText(
    /unavailable|taken|occupied|already booked/i,
  );
  const after = await (await client.get(`/api/appointments?day=${day}`)).json();
  expect(after.find((a: { id: string }) => a.id === booking.id).slot_id).toBe(
    slots[0].id,
  );
  expect(
    await (await client.get(`/api/appointments/${booking.id}/history`)).json(),
  ).toEqual([]);
  await page
    .getByRole("region", { name: "Reschedule appointment" })
    .screenshot({
      path: `../docs/screenshots/${info.project.name}-conflict.png`,
    });
  for (const id of [booking.id, (await competitor.json()).id]) {
    expect(
      (
        await client.post(`/api/appointments/${id}/cancel`, {
          headers,
          data: { reason: "Fictional browser fixture completed", version: 1 },
        })
      ).ok(),
    ).toBeTruthy();
  }
  await client.dispose();
});

test("registration to human-reviewed finalization with mock AI", async ({
  page,
  browser,
}, info) => {
  await login(page, "reception");
  const name = `Fictional River ${Date.now()}`;
  await page
    .getByRole("button", { name: "Register patient", exact: true })
    .click();
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Date of birth", { exact: true }).fill("2001-04-12");
  await page.getByLabel("Contact information").fill("river@example.test");
  await page.getByRole("button", { name: "Save patient", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Patient registered");
  await page.getByLabel("Search patients").fill(name);
  await page
    .getByRole("row")
    .filter({ hasText: name })
    .getByRole("button", { name: "Book visit" })
    .click();
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  await page.getByLabel("Clinic date").fill(tomorrow);
  await page
    .getByLabel("Doctor", { exact: true })
    .selectOption({ label: "Dr. Mira Demo" });
  await expect(
    page.getByRole("button", { name: /Book 30-minute visit/ }).first(),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: /Book 30-minute visit/ })
    .first()
    .click();
  await expect(page.getByRole("status")).toContainText("Appointment booked");
  await page
    .locator(".appointment-row")
    .filter({ hasText: name })
    .getByRole("button", { name: "Reschedule", exact: true })
    .click();
  await expect(page.getByLabel("New appointment time")).toBeEnabled();
  await page.getByLabel("New appointment time").selectOption({ index: 1 });
  await page
    .getByLabel("Rescheduling reason")
    .fill("Fictional patient requested a later time");
  await page.screenshot({
    path: `../docs/screenshots/${info.project.name}-reschedule.png`,
    fullPage: true,
  });
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Confirm reschedule" }).click();
  await expect(page.getByRole("status")).toContainText("rescheduled");
  await page.screenshot({
    path: `../docs/screenshots/${info.project.name}-schedule.png`,
    fullPage: true,
  });
  const doctorContext = await browser.newContext({
    baseURL: process.env.BASE_URL ?? "http://localhost:5173",
    viewport:
      info.project.name === "mobile"
        ? { width: 393, height: 851 }
        : { width: 1440, height: 1000 },
  });
  const doctor = await doctorContext.newPage();
  await login(doctor, "doctor");
  await doctor.getByLabel("Clinic date").fill(tomorrow);
  await doctor
    .locator(".appointment-row")
    .filter({ hasText: name })
    .getByRole("button", { name: "Open encounter" })
    .click();
  await doctor
    .getByLabel("Rough encounter note")
    .fill(
      "Fictional patient reports a cough since yesterday and denies fever. No measurements supplied. Follow-up was discussed; no treatment was documented.",
    );
  await doctor.getByRole("button", { name: "Save notes", exact: true }).click();
  await expect(doctor.getByRole("status")).toContainText("Encounter saved");
  await doctor
    .getByRole("button", { name: "Generate draft", exact: true })
    .click();
  await expect(doctor.getByText("Generated draft · succeeded")).toBeVisible();
  await doctor.getByRole("button", { name: "Use draft for review" }).click();
  await doctor
    .getByLabel("Reported concern", { exact: true })
    .fill("Reports a cough; denies fever.");
  await doctor
    .getByLabel("Relevant history", { exact: true })
    .fill("Started yesterday. Reviewed against fictional source.");
  await doctor
    .getByLabel("Plan explicitly documented in the source", { exact: true })
    .fill("Follow-up was discussed; no treatment was documented.");
  await doctor.getByRole("button", { name: "Save notes", exact: true }).click();
  await expect(doctor.getByRole("status")).toContainText("Encounter saved");
  doctor.once("dialog", (d) => d.accept());
  await doctor
    .getByRole("button", { name: "Finalize reviewed encounter" })
    .click();
  await expect(
    doctor.getByRole("button", { name: "Finalized", exact: true }),
  ).toBeDisabled();
  await expect(doctor.getByLabel("Rough encounter note")).toBeDisabled();
  await doctor.screenshot({
    path: `../docs/screenshots/${info.project.name}-encounter.png`,
    fullPage: true,
  });
  expect(
    await doctor.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await doctorContext.close();
});

test("administrator staff, slots, and restricted audit screen", async ({
  page,
}, info) => {
  await login(page, "admin");
  await page
    .getByRole("button", { name: "Staff & slots", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Clinic team" }),
  ).toBeVisible();
  const staffName = `Demo Staff ${Date.now()}`;
  await page.getByLabel("Staff name").fill(staffName);
  await page.getByLabel("Staff email").fill(`staff-${Date.now()}@example.test`);
  await page.getByLabel("Initial password").fill("Fictional-Staff-2026!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Staff account created");
  await page.getByLabel(`Role for ${staffName}`).selectOption("doctor");
  await expect(page.getByRole("status")).toContainText(
    "Staff permissions updated",
  );
  await page.getByLabel("Slot doctor").selectOption({ label: staffName });
  const slotDay = new Date(Date.now() + 86400000 * 3).toLocaleDateString(
    "en-CA",
    { timeZone: "Asia/Kolkata" },
  );
  await page.getByLabel("Clinic start time").fill(`${slotDay}T18:00`);
  await page.getByRole("button", { name: "Create slot", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Appointment slot created",
  );
  await page
    .getByRole("button", { name: "Audit history", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Operational audit history" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("cell", { name: "staff.role_or_status_changed", exact: true })
      .first(),
  ).toBeVisible();
  await page.screenshot({
    path: `../docs/screenshots/${info.project.name}-audit.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
});
