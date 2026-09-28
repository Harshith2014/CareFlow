# CareFlow

**AI-Assisted Clinic Workflow Manager** — an independent software engineering portfolio project, not an official ModMed product.

CareFlow connects a fictional clinic's front desk and doctor workflow: register → book/reschedule → document → generate a separate draft → review → explicitly finalize. It demonstrates backend authorization, PostgreSQL concurrency, transactional state changes, and cautious AI integration. It is not intended for clinical use and makes no HIPAA, diagnostic-accuracy, or measured time-savings claims.

## Run with Docker Compose

Verified screenshots: [desktop encounter](docs/screenshots/desktop-encounter.png), [mobile encounter](docs/screenshots/mobile-encounter.png). Actual test results are recorded in [verification.md](docs/verification.md).

Prerequisites: Docker Desktop with the Linux-container engine running, Docker Compose, and free local ports 5173 and 8000. No API key is needed.

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
docker compose up --build -d
docker compose exec backend python -m app.seed
```

On macOS/Linux use `test -f .env || cp .env.example .env` for the first command. Open **http://localhost:5173**. Use `localhost`, matching `APP_ORIGIN`; using `127.0.0.1` in the browser will fail the origin check. API documentation: **http://localhost:8000/docs**. The backend applies Alembic migrations on startup. PostgreSQL data persists in the `pgdata` named volume. `docker compose down` stops the stack without deleting that volume.

For an existing installation, run `docker compose up --build -d`; keep your `.env` and volume. Migration `002` adds appointment versions, rescheduling history, and audit details without replacing existing records. Do not use `down -v`. Receptionists can reschedule a scheduled visit before an encounter starts, choose a future slot for the same doctor, enter a reason, review both times, and confirm. A conflict retains the original booking. Same-doctor restriction and all eligibility rules are enforced by the backend.

Demo seeding is explicit, repeatable, and blocked unless `ENVIRONMENT=development`. It creates accounts and eight days of slots; patients are registered through the application. Rerun the seed to add current dates when returning later.

| Role | Local demo email | Password |
|---|---|---|
| Receptionist | reception@careflow.demo | CareFlow-Demo-2026! |
| Doctor | doctor@careflow.demo | CareFlow-Demo-2026! |
| Second doctor | doctor2@careflow.demo | CareFlow-Demo-2026! |
| Administrator | admin@careflow.demo | CareFlow-Demo-2026! |

These are public **local demonstration credentials**, not production credentials. There is no public registration endpoint.

## Architecture and main files

```text
React + TypeScript + Vite + Tailwind
             │ same-origin /api, HttpOnly cookie + CSRF header
             ▼
FastAPI → authorization + workflow services → SQLAlchemy → PostgreSQL
             │                                     ▲
             └─ mock parser / optional OpenAI       Alembic
```

The production frontend container serves static assets through Nginx and proxies `/api`. Vite does the same during development. There is one backend and one database; no queues, vector store, or microservices.

Study these files in order:

1. `backend/app/models.py` and `migrations/versions/001_initial.py`: relational model and frozen schema migration.
2. `backend/app/security.py`: sessions, password hashing, role and CSRF checks.
3. `backend/app/main.py`, `services.py`, and `scheduling.py`: routes, transactions, record ownership, versions, and rescheduling retries.
4. `backend/app/ai.py`: provider boundary, bounded retries, schema validation.
5. `frontend/src/App.tsx`, `ReschedulePanel.tsx`, and `api.ts`: role workflows and cookie-based API requests.
6. `backend/tests/test_workflows.py` and `test_rescheduling.py`: adversarial cases and concurrency; `frontend/tests/workflow.spec.ts`: browser workflow.

## Local development without Docker

Use Python 3.14, Node 24, and PostgreSQL 18. Create dedicated databases named `careflow` and `careflow_test` using a local PostgreSQL account. Do not point tests at personal data: tests truncate tables and require a database name starting with `careflow_test`.

From the repository root, in PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
$env:DATABASE_URL='postgresql+psycopg://careflow:YOUR_LOCAL_PASSWORD@localhost:5432/careflow'
$env:APP_ORIGIN='http://localhost:5173'
cd backend
..\.venv\Scripts\python.exe -m alembic upgrade head
..\.venv\Scripts\python.exe -m app.seed
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In another terminal:

```powershell
cd frontend
npm ci
npm run dev
```

`DATABASE_URL` is a backend environment variable. Compose constructs it automatically. The backend reads `.env` relative to its working directory; for direct development, use environment variables as above. Dependencies are pinned transitively in `backend/requirements.txt` and `frontend/package-lock.json`.

## Configuration

| Variable | Default / purpose |
|---|---|
| ENVIRONMENT | development; production uses Secure session cookies and refuses demo seeding |
| POSTGRES_PASSWORD | Local Compose database password; URL-encode special characters if customizing |
| APP_ORIGIN | http://localhost:5173; exact allowed browser origin |
| FRONTEND_PORT / BACKEND_PORT | Optional Compose overrides; defaults 5173 / 8000; APP_ORIGIN must match the frontend port |
| CLINIC_TIMEZONE | Asia/Kolkata; the only supported clinic timezone in v1 |
| SESSION_HOURS | 8; absolute session lifetime |
| AI_MODE | mock, live, or disabled |
| AI_MODEL | gpt-4.1-mini; configurable structured-output-capable model |
| AI_API_KEY | Optional OpenAI key, backend only |
| AI_TIMEOUT | 20 seconds per network attempt; at most three attempts |
| AI_MAX_OUTPUT_TOKENS | 1024; bounded between 128 and 4096 |

Production mode is a security configuration, **not a claim of production readiness**. It requires HTTPS; the supplied local Compose setup uses HTTP. Do not enable production mode and expect its Secure cookie to work over ordinary remote HTTP.

## Mock and live AI

Mock mode is a deterministic parser, not genuine inference. For predictable demonstration results use:

```text
Concern: Fictional patient reports a cough.
History: Started yesterday.
Observations: No measurements supplied.
Plan: Follow-up discussed.
```

Each recognized label maps to a structured field; repeated labels retain their text. Unspecified fields become `Not documented`. Unlabeled input is copied as the reported concern; the parser cannot understand clinical meaning or guarantee correct categorization. It never adds advice. Generated output remains separate from source and reviewed notes.

Optional live mode uses the OpenAI Chat Completions structured-output interface. Configure `AI_MODE=live`, `AI_API_KEY`, and `AI_MODEL` in `.env`, then `docker compose up -d --force-recreate backend frontend` (recreating Nginx refreshes its backend address). This may incur provider charges; no live request was required or automatically made for this project. Do not send real patient information. Provider availability depends on the configured account and model. The implementation follows [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs). Prompt boundaries and output schemas do not guarantee factual correctness. A doctor must review all fields.

The live prompt accepts ordinary unstructured notes without section labels and asks for preservation of negation, uncertainty, attribution, and contradictions. This is an implemented request contract, **not verified live-model quality**. Keep keys only in local environment variables or gitignored `.env`, never in chat or source control. Normal CI uses mock AI and no key. The separate [evaluation guide](docs/evaluation-report.md) explains the 25 fictional cases, blank human-review sheet, no-network planning, and explicit capped-spending gate.

Use `AI_MODE=disabled` for manual-only documentation. On provider failure the original note stays available and editable. Draft records include model, status, source version, and generation sequence.

## Verification commands

From `backend` with the virtual environment installed:

```powershell
$env:TEST_DATABASE_URL='postgresql+psycopg://careflow:YOUR_LOCAL_PASSWORD@localhost:5432/careflow_test'
..\.venv\Scripts\python.exe -m ruff check .
..\.venv\Scripts\python.exe -m ruff format --check .
..\.venv\Scripts\python.exe -m pytest -q
..\.venv\Scripts\python.exe -m evaluation.run
```

Tests migrate their dedicated database through Alembic. Use a fresh `careflow_test*` database if a legacy test database was created using model metadata; do not reset or stamp an existing application database to bypass migration errors. For the upgrade-preservation check, create a **new empty** database named `careflow_test_migration_release`, set `DATABASE_URL` to it, and run `python scripts/check_migrations.py` from `backend`. It applies 001, inserts a fictional booking, upgrades to head, verifies preservation and default version, and checks schema drift. It refuses a nonempty database. Restore your development `DATABASE_URL` afterward. For Linux use the activated environment's `python` instead of the Windows executable path.

From `frontend`:

```powershell
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

Browser tests need a running backend with the explicit demo seed. Playwright starts Vite automatically. Set `BASE_URL=http://localhost:5173` to test an already running Compose frontend. Tests register uniquely named fictional patients and retain their records. They run on desktop and an emulated mobile viewport. See `docs/verification.md` for actual results and limitations; CI configuration is provided but a hosted run is not implied.

Playwright is pinned to `1.58.2`; `npx playwright install chromium` installs its matching browser. Release verification uses the matching browser without `CHROMIUM_PATH`. An explicit executable override is available for troubleshooting but is not equivalent evidence. See [API examples](docs/api.md) for authenticated requests and error contracts.

## Release verification and demonstration

Release 2 has 46 passing PostgreSQL backend tests and six passing desktop/mobile browser checks locally. Formatting, linting, TypeScript, production build, migration preservation and drift checks passed; see [exact verification evidence](docs/verification.md). GitHub Actions is configured with isolated PostgreSQL databases and readiness polling. A hosted green run is **not claimed**; the initial push uses `[skip ci]` pending authorization for potentially billable private-repository Actions usage.

Updated screenshots include [desktop rescheduling](docs/screenshots/desktop-reschedule.png), [mobile rescheduling](docs/screenshots/mobile-reschedule.png), and [conflict handling](docs/screenshots/desktop-conflict.png). The [demo script](docs/demo-script.md) includes the recording command and artifact details. Run `npm run demo:record` from `frontend` only against the local fictional Compose installation; it temporarily disables AI and restores mock mode in cleanup.

## Scope and limitations

- One fictional clinic; Asia/Kolkata timezone; fixed 30-minute slots; no billing, prescribing, diagnoses, amendments, multi-clinic tenancy, or real patient data.
- Finalized encounters are immutable through the application. Doctors can access their own encounters and patients with a non-canceled assigned appointment; administrators have no note access.
- Audit events are append-only through APIs, not tamper-proof against database administrators.
- This local portfolio app has no MFA, password reset, login throttling, production monitoring, or operational backup policy. Do not expose it publicly as a clinical system.
- A process crash can leave an AI generation marked pending; it cannot overwrite a note. A later generation is allowed. Background recovery is outside v1.
- Appointment lists are bounded to 500 rows per day; patient and audit directories use 20-row pagination.
- Compose runtime, live-model evaluation, and browser evidence are reported separately in `docs/verification.md`.

Further reading: [architecture](docs/architecture.md), [three-minute demo](docs/demo-script.md), [interview guide](docs/interview-guide.md), [AI development log](docs/ai-development-log.md), [resume bullets](docs/resume-bullets.md), and [evaluation guide](docs/evaluation-report.md).
