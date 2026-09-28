# Three-minute walkthrough

This is an independent portfolio demonstration using fictional data. Keep mock mode visible and never call it live-model inference. A schema does not prove factual correctness.

## Preparation and recording

Start the documented Compose stack and explicitly refresh demo slots:

```powershell
docker compose up --build -d
docker compose exec -T backend python -m app.seed
cd frontend
npm ci
npx playwright install chromium
npm run demo:record
```

The recording script requires the local default origin `http://localhost:5173`, running Docker, the documented demo accounts, current future slots, and initial **mock** mode. It records actual browser interactions, asserts response statuses/state, and writes a silent WebM plus observed-result/chapter metadata under `docs/demo/`. It does not intercept responses or simulate success.

It temporarily recreates the local backend/frontend with `AI_MODE=disabled` and an empty provider key to demonstrate real manual fallback, then restores **mock** mode with an empty provider key in cleanup. Do not run while another local demonstration needs uninterrupted service. It never changes the database volume or overwrites .env. It creates new fictional records; an unfinalized manual demonstration encounter is intentionally retained. If interrupted before cleanup, restore mock mode with `$env:AI_MODE='mock'; $env:AI_API_KEY=''; docker compose up -d --force-recreate backend frontend`. For a custom origin or credentials, record manually using the sequence below rather than changing account passwords.

Presentation pauses are for readable playback, not service readiness; container restarts use health polling. No keys, environment files, or developer-console session values are filmed. Demo login passwords are the published fictional credentials.

## Walkthrough / narration

| Time | Actual action and explanation |
|---|---|
| 0:00–0:10 | Reception signs in. “CareFlow is my independent fictional clinic portfolio project. Role checks are enforced in the backend.” |
| 0:10–0:35 | Register Fictional Demo River, birth date 2001-04-12, contact river@example.test. Choose a future clinic date and Dr. Mira Demo, then book an available visit. |
| 0:35–0:56 | Open Reschedule. Choose another same-doctor slot and enter “Fictional patient requested a later appointment.” Compare old/new times and confirm. The ID remains the same and the original slot is released only on successful commit. |
| 0:56–1:09 | A second authenticated reception session takes the displayed freed slot. Click that stale slot in the visible browser: the API really returns 409. No duplicate active booking is created. |
| 1:09–1:29 | Sign in as doctor, open the moved visit, and save the unstructured fictional note below. |
| 1:29–1:51 | Generate a draft. Point out “Mock mode: deterministic label parsing, not model inference.” For unlabeled source the mock copies text into Reported concern; the doctor explicitly organizes the fields. Compare source/output and save reviewed changes. |
| 1:51–2:01 | Click Finalize reviewed encounter and accept confirmation. Fields become immutable and the appointment completes atomically. |
| 2:01–2:12 | Sign in as reception and navigate directly to the known encounter API URL. The server returns 403, demonstrating authorization even with a valid reception session. |
| 2:12–3:00 | Disable AI in the local backend, then doctor opens a second fictional visit. Manually write and save source/reviewed text. Generate is disabled, but saving works. Explain that provider failures also preserve notes; automated timeout/malformed-output tests verify those paths. |

Use this unstructured source:

```text
Fictional patient reports a cough since yesterday and denies fever. No measurements supplied. Follow-up was discussed; no treatment was documented.
```

After copying the mock draft for review, the doctor explicitly sets:
- Reported concern: Reports a cough; denies fever.
- Relevant history: Started yesterday.
- Documented observations: Not documented.
- Plan explicitly documented in the source: Follow-up was discussed; no treatment was documented.

These are human edits demonstrated in the UI, not evidence that the mock understood the source.

## Manual reproduction of conflict and denial

Use two separate browser profiles logged in as reception. Both load the same available slot before either books. Book in one, then click the stale slot in the other; observe the actual conflict message. For a **rescheduling** conflict, choose a target in one profile and book it from the other before confirming the move. The original booking stays unchanged; this is also covered by the browser suite.

After the doctor creates an encounter, copy only its UUID from the network response. In the reception browser visit `http://localhost:5173/api/encounters/ENCOUNTER_UUID`: observe a real 403 JSON response. No console tokens are needed and no note body is disclosed.

## Artifacts

- `docs/demo/careflow-demo.webm`: actual silent recording, 2:59.92, 1440×1000 (see recording.json for chapter timing and observed results).
- `docs/demo/recording.json`: timestamps, chapter labels, and observed status/state assertions; no credentials/session values.
- `docs/screenshots/desktop-reschedule.png` and `mobile-reschedule.png`: review UI.
- `docs/screenshots/desktop-conflict.png` and `mobile-conflict.png`: actual rejected move.
- Existing encounter, schedule, and audit screenshots are refreshed by browser checks.

A recording must only be claimed after the script successfully saves it. Live evaluation and hosted CI are separate and remain unrun unless explicitly reported otherwise in verification.md.
