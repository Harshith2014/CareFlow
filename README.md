# CareFlow

**AI-Assisted Clinic Workflow Manager** — an independent software engineering portfolio project, not an official ModMed product.

CareFlow connects a fictional clinic's front desk and doctor workflow: register → book/reschedule → document → generate a separate draft → review → explicitly finalize. It demonstrates backend authorization, PostgreSQL concurrency, transactional state changes, and cautious AI integration. It is not intended for clinical use and makes no HIPAA, diagnostic-accuracy, or measured time-savings claims.

## Run with Docker Compose

Verified screenshots: [desktop encounter](docs/screenshots/desktop-encounter.png), [mobile encounter](docs/screenshots/mobile-encounter.png). Actual test results are recorded in [verification.md](docs/verification.md).

Prerequisites: Docker Desktop with the Linux-container engine running, Docker Compose, and free local ports 5173 and 8000. No API key or Codex is needed. Run the following commands yourself in **PowerShell**. Commands shown in separate blocks are separate steps.

### 1. Open Docker Desktop and the project folder

Open Docker Desktop from the Windows Start menu and wait for its engine to start. Then open PowerShell:

```powershell
cd "C:\Users\M Harshith\Desktop\CareFlow"
docker info
```

If `docker info` cannot connect, wait for Docker Desktop to finish starting before continuing. These instructions use your existing project folder; cloning the repository again is unnecessary.

### 2. Build and start CareFlow

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
docker compose up --build -d
docker compose ps
```

The first command creates `.env` only when missing, preserving existing settings. The build starts the frontend, backend, and PostgreSQL. The first build may take several minutes. If a command reports an error, resolve it before continuing.

### 3. Create demo accounts and refresh appointment slots

```powershell
docker compose exec -T backend python -m app.seed
```

If the backend is still starting or applying migrations, inspect `docker compose logs --tail 50 backend` and retry seeding after startup completes. Seeding preserves existing patients and bookings. It adds missing demo accounts and slots for the next eight clinic dates.

### 4. Open CareFlow in your browser

Type this **separate command** in PowerShell:

```powershell
Start-Process "http://localhost:5173"
```

**`docker compose up -d` does not print a Vite-style link or open a browser. You must run `Start-Process` yourself**, or type **http://localhost:5173** into your browser's address bar. Bookmark this address for later use. Closing PowerShell does not stop containers started with `-d`.

Use `localhost`, matching `APP_ORIGIN`; using `127.0.0.1` in the browser will fail the origin check. API documentation: **http://localhost:8000/docs**. The backend applies Alembic migrations on startup. PostgreSQL data persists in the `pgdata` named volume.

On macOS/Linux, change into your own project directory, use `test -f .env || cp .env.example .env` to create configuration, and run the same Docker commands. Open the URL manually instead of using the Windows-only `Start-Process` command.

For an existing installation, run `docker compose up --build -d`; keep your `.env` and volume. Migration `002` adds appointment versions, rescheduling history, and audit details without replacing existing records. Do not use `down -v`. Receptionists can reschedule a scheduled visit before an encounter starts, choose a future slot for the same doctor, enter a reason, review both times, and confirm. A conflict retains the original booking. Same-doctor restriction and all eligibility rules are enforced by the backend.

Demo seeding is explicit, repeatable, and blocked unless `ENVIRONMENT=development`. It creates accounts and eight days of slots; patients are registered through the application. Rerun the seed to add current dates when returning later.

### 5. Sign in and try the workflow

| Role | Local demo email | Password |
|---|---|---|
| Receptionist | reception@careflow.demo | CareFlow-Demo-2026! |
| Doctor | doctor@careflow.demo | CareFlow-Demo-2026! |
| Second doctor | doctor2@careflow.demo | CareFlow-Demo-2026! |
| Administrator | admin@careflow.demo | CareFlow-Demo-2026! |

These are public **local demonstration credentials**, not production credentials. There is no public registration endpoint.

As receptionist, register a fictional patient, book a future slot for Dr. Mira Demo, and try rescheduling before an encounter starts. Sign out and sign in as the doctor; select the appointment's clinic date, open the encounter, save a rough note, generate a mock draft, review/edit the fields, save, and explicitly finalize. The administrator account manages staff/slots and views operational audit metadata.

### 6. Stop CareFlow when finished

From PowerShell in the project folder:

```powershell
cd "C:\Users\M Harshith\Desktop\CareFlow"
docker compose stop
```

This stops the application and preserves database records. `docker compose down` also preserves the named database volume while removing the containers. **Do not add `-v`** unless you intentionally want to delete the database volume.

### 7. Start it again next time

Open Docker Desktop first, then run:

```powershell
cd "C:\Users\M Harshith\Desktop\CareFlow"
docker compose up -d
docker compose exec -T backend python -m app.seed
Start-Process "http://localhost:5173"
```

Use `docker compose up --build -d` instead when application code or dependencies have changed. Refreshing the seed is useful when returning on a later date.

### Optional: use npm run dev and see Vite's link

The simplest way to run the entire app is Docker Compose above. For frontend development, install Node.js 24, keep Docker Desktop running, and run:

```powershell
cd "C:\Users\M Harshith\Desktop\CareFlow"
docker compose stop frontend
docker compose up -d db backend
docker compose exec -T backend python -m app.seed
cd frontend
npm ci
npm run dev -- --port 5173 --strictPort
```

The Vite terminal prints its local address and must stay open. Open **http://localhost:5173** for CareFlow even if Vite prints `127.0.0.1`; the login origin must match `APP_ORIGIN`. `--strictPort` prevents silently switching to a port that the backend does not allow. Stopping the Docker frontend first frees port 5173. `npm run dev` starts only the frontend; Docker still runs the backend and database. This project has no `npm start` script.

To return to the full Docker application, press **Ctrl+C** in the Vite terminal, then:

```powershell
cd "C:\Users\M Harshith\Desktop\CareFlow"
docker compose up -d
Start-Process "http://localhost:5173"
```

### If something does not start

Run these from the project folder:

```powershell
docker compose ps
docker compose logs --tail 50 backend frontend db
Invoke-RestMethod "http://localhost:8000/api/health"
```

- **Docker connection error:** open Docker Desktop and wait for its engine, then retry.
- **No configuration file found:** change into the CareFlow folder containing `docker-compose.yml`.
- **Port 5173 already in use:** stop the Vite terminal with Ctrl+C before starting the Docker frontend, or stop the Docker frontend before starting Vite.
- **Browser cannot connect:** check container status and logs; wait for startup/migrations, then reload `http://localhost:5173`.
- **No upcoming slots:** rerun the explicit demo seed and choose a future date for the selected doctor.
- **Invalid request origin:** use `http://localhost:5173` with the default configuration. Custom ports must also match `APP_ORIGIN` in `.env`.

## Free hosting: Render + Neon

This deployment keeps the existing React/FastAPI/PostgreSQL application. One **Render Free web service** serves the built frontend and API at the same HTTPS origin; a separate **Neon Free PostgreSQL** project stores data. The local Compose installation is unchanged. AI stays in **mock** mode.

**Status:** deployment files are prepared; a public deployment is not yet verified. Account sign-in and private database configuration are required. No hosting resource has been purchased or provisioned by this coding session.

### 1. Create the free accounts and database

1. Sign in at [Render](https://dashboard.render.com/) and [Neon](https://console.neon.tech/). Use their free plans.
2. In Neon, create a separate project such as **careflow-demo**. Use only fictional records; do not upload your local database.
3. Open **Connect**, choose a direct PostgreSQL connection (connection pooling off), and copy the connection string privately.
4. Change only its leading `postgresql://` to `postgresql+psycopg://`. Preserve the username, encoded password, hostname, database name, and SSL query parameters. Do not paste the connection string into chat or commit it.

Do not upgrade plans, add a paid database/disk, buy a domain, or authorize overages. Use an account without a payment method for this free-only demonstration. If a provider requires a payment method or paid service to continue, stop that setup and choose another free option.

### 2. Deploy the repository on Render

1. Choose **New → Blueprint** and connect GitHub. Grant Render access to the private **Harshith2014/CareFlow** repository; the repository does not need to become public.
2. Select branch **main** and the root `render.yaml` file.
3. Confirm the preview contains exactly one **Free web service**, no Render database, disk, or paid resource.
4. Set the prompted **DATABASE_URL** secret to your privately copied Neon SQLAlchemy connection string.
5. Create/deploy the Blueprint and wait for the service to become healthy.

The root Dockerfile builds React, copies it into the Python image, and runs as an unprivileged user. Startup validates configuration, applies Alembic migrations, and listens on Render's assigned `PORT`. `APP_ORIGIN` is automatically populated from Render's `RENDER_EXTERNAL_URL`, preserving exact-origin CSRF checks. HTTPS and production-mode Secure cookies are required. The Blueprint sets `AI_MODE=mock` and does not configure an AI key.

Use the actual **https://…onrender.com** link shown in Render; it is not known until your service exists. Open that address and `https://YOUR-ACTUAL-HOST/api/health`; health should return `{"status":"ok"}`. If you deliberately override `APP_ORIGIN`, use that exact HTTPS origin without a trailing slash. Automatic deployments are off to conserve free build usage; use Render's **Manual Deploy → Deploy latest commit** for future updates.

### 3. Create your private online administrator

The published local demo password is **not** used online. `python -m app.seed` continues to refuse production mode. Render's free service has no interactive shell, so run the bootstrap command from your own computer after Render has applied migrations.

Open PowerShell:

```powershell
cd "C:\Users\M Harshith\Desktop\CareFlow"
docker build -t careflow-hosted:local .
notepad .env.hosting
```

In Notepad, save this configuration with your actual values. Keep the file named **.env.hosting**, without a .txt extension:

```dotenv
ENVIRONMENT=production
AI_MODE=mock
DATABASE_URL=postgresql+psycopg://YOUR_NEON_CONNECTION_WITH_SSL
APP_ORIGIN=https://YOUR-ACTUAL-HOST.onrender.com
```

The file is gitignored and excluded from Docker builds. Keep it private. Then run:

```powershell
docker run --rm -it --env-file .env.hosting careflow-hosted:local python -m app.create_admin
```

Enter an administrator email, display name, and a new password when prompted. Password entry is hidden. The command refuses a database that already has staff and uses a PostgreSQL transaction/advisory lock to prevent duplicate initial accounts. It never prints the password. It does not reset existing records.

Sign in at the online URL using the account you just created. In **Staff & slots**, create a receptionist and doctor with separate private passwords, then create future 30-minute doctor slots. Use the receptionist to register fictional patients and book visits. Do not publish the administrator credentials. The localhost demo accounts remain available only in your separately seeded local installation.

### 4. Verify before sharing the URL

- Reception: register a fictional patient, book a future slot, and reschedule it.
- Doctor: open that visit, save a source note, generate a clearly labeled mock draft, review/edit, save, and finalize.
- Confirm the final record is immutable and the appointment is completed.
- Reception: directly request the encounter API URL and confirm 403.
- Sign out and confirm the session no longer works.
- Reload after a service restart and confirm the fictional records remain in Neon.

A successful local container test does not prove the hosted deployment or Neon connectivity. Record actual hosted results and the URL only after these checks succeed. This remains a portfolio demo with private staff access, not a clinically ready service. Existing omissions such as login throttling and password recovery still apply.

### Free-tier behavior and costs

Render's free service sleeps after 15 minutes of inactivity and takes about a minute to wake. Free instance hours, bandwidth, and build limits apply; without a payment method, excess usage can suspend service/builds instead of purchasing extra capacity. Render's free PostgreSQL expires after 30 days, which is why this setup uses Neon Free. [Render free-tier documentation](https://render.com/docs/free).

Neon has its own free storage/compute limits and idle suspension; check the current dashboard before creating the project. Free limits and terms can change; no forever-free or uptime guarantee is claimed. [Neon free-plan announcement](https://neon.com/blog/neon-free-plan-1-gb-per-project). Do not add artificial keep-alive traffic to avoid sleeping.

Deployment configuration follows [Render Docker hosting](https://render.com/docs/docker), [Blueprint fields](https://render.com/docs/blueprint-spec), and [default environment variables](https://render.com/docs/environment-variables). Verified against these documents on October 8, 2026.

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
