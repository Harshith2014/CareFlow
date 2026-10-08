# Verification record

Release 2 verification on September 28, 2026. Reported earlier results were rechecked before changes: **21 backend tests and four browser tests passed** against the original application. These are separate from the new release results.

| Check | Exact command / configuration | Observed result |
|---|---|---|
| Python lint / formatting | `python -m ruff check .`; `python -m ruff format --check .`, from backend | Passed; 23 files formatted |
| Windows PostgreSQL regression | `..\.venv\Scripts\python.exe -m pytest -q`; TEST_DATABASE_URL pointing to isolated PostgreSQL 18 on port 55432, database careflow_test_release | 46 passed in 39.70s |
| Linux PostgreSQL regression | `docker compose exec -T -e TEST_DATABASE_URL=postgresql+psycopg://careflow:careflow-local-only@db:5432/careflow_test_release backend python -m pytest -q` | 46 passed in 27.99s |
| Migration preservation / drift | `python scripts/check_migrations.py`; DATABASE_URL pointing to a new careflow_test_migration_release on port 55432 | 001 → 002 preserved seeded booking; no new upgrade operations |
| Frontend formatting | `npm run format:check` | Passed |
| Frontend lint | `npm run lint` | Passed |
| TypeScript | `npm run typecheck` | Passed |
| Production build | `npm run build`; Docker build runs `npm ci` and production build on Node 24 | Passed locally and in Linux image |
| Matching browser installation | `npm install --save-dev --save-exact @playwright/test@1.58.2`; `npx playwright install chromium` | Installed; matching Chromium 1208, no executable override |
| Browser suite | `$env:BASE_URL='http://localhost:5173'; npm run test:e2e` | Six passed in 32.1s; final screenshot/review-example rerun six passed in 35.7s |
| Compose upgrade | `docker compose up --build -d` | Started updated backend/frontend against retained PostgreSQL volume |
| Demo seed | `docker compose exec -T backend python -m app.seed` | Existing accounts retained; current eight days of fictional slots added |
| Mock evaluation | `python -m evaluation.run` | 25 cases recorded, including rejected inputs; blank human-review CSV generated |
| No-network live plan | `python -m evaluation.run --plan` | Configuration/pricing/request plan generated; no calls |
| Live evaluation | No authorized provider requests | **NOT RUN** |
| Hosted GitHub Actions | Workflow configured; initial repository push skips CI | **NOT RUN** |
| Demonstration recording | `npm run demo:record` | Saved actual WebM, 2:59.92 at 1440×1000; metadata records real 409/403, finalization, source preservation, and manual save with AI disabled |

The Windows shell uses `.venv\Scripts\python.exe` (one directory up from backend); Unix uses the installed `python`. The test fixture applies Alembic migrations, then clears only the explicitly selected `careflow_test*` database per test. It does not reset the application database. A legacy metadata-created test database initially produced duplicate-table migration errors; a new disposable database was created instead of modifying existing records.

## Behavior verified

Original tests cover authentication/logout/expiry/CSRF, direct role and record permissions, care relationships, five concurrent bookings with one winner, cancellation history, validation, stale notes, immutable finalization, transaction rollback, malformed/timeout/rate-limit AI responses, input gates, manual fallback, stale source/generation sequence, and audit events.

Twenty new rescheduling cases cover same-identity success, old-slot release, new-slot occupancy, retained history/audit, unavailable-target rollback, role denials, started/canceled/completed rejection, invalid/past/same/other-doctor targets, inactive doctors, two appointments competing, two edits to one appointment, cancellation/encounter races, identical concurrent retries, later historical response replay, changed-payload key refusal, and injected audit failure rollback. Races use independent clients and PostgreSQL connections.

Five evaluation tests cover the 25-case schema, a key not constituting spending permission, bounded requests/budget with blank review cells, unstructured provider request shape/output cap, and three-attempt interactive retry bound. HTTP fakes never contact OpenAI.

Three browser scenarios run on desktop and mobile: registration → booking → rescheduling → unstructured source → mock draft → doctor edit → finalization; a real independent session takes the displayed move target and the original booking/history remain unchanged; and administrator staff/role/slot/audit/logout workflows. The first conflict test assertion omitted the actual “already booked” phrase; it was corrected, and all six checks passed. Tests were not disabled.

Desktop/mobile rescheduling screenshots, desktop encounter and mobile conflict were visually inspected for readable layout, visible focus, labels, stacked controls, and confirmation summary. Screenshots are in `docs/screenshots/`. Two frames extracted from the saved WebM were inspected for the move review and actual disabled-AI manual documentation. The recording is silent, with chapter metadata in `docs/demo/recording.json`; it is not a narrated live-model demonstration. Mobile is browser emulation, not physical-device certification or a full accessibility audit.

## CI reproducibility and hosted status

`.github/workflows/ci.yml` installs committed Python pins and npm lockfile, checks formatting/lint, creates separate PostgreSQL databases for regression tests, migration preservation, and browser data, builds the frontend, installs the locked Playwright browser, and polls backend health before browser checks. No live evaluation or provider secrets are used. The job has a 20-minute timeout and cancels superseded runs.

Failure screenshots and fictional UI screenshots are uploaded for seven days. Traces remain local and ignored: trace archives can contain session cookies/CSRF values and are deliberately excluded from hosted artifacts. Logs and environment files are not uploaded.

Local equivalent checks passed. **This is not evidence of a hosted workflow passing.** The supplied GitHub repository is private; the initial push uses `[skip ci]` to avoid initiating potentially billable runs without separate authorization. After authorizing Actions usage, run:

GitHub documents the commit-message behavior for push and pull-request workflows in [Skipping workflow runs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs). It does not disable the workflow; an explicitly authorized manual dispatch can run it.

```text
gh workflow run ci.yml --repo Harshith2014/CareFlow --ref main
gh run list --repo Harshith2014/CareFlow --workflow ci.yml --limit 5
gh run watch RUN_ID --repo Harshith2014/CareFlow --exit-status
gh run view RUN_ID --repo Harshith2014/CareFlow --json headSha,conclusion,url
```

Only a successful run tied to its commit SHA supports a hosted-green claim.

## Environment limits

The newer Playwright Chromium 1243 download timed out repeatedly; pinning Playwright 1.58.2 restored a matching installed/browser-download pair. Tests used that matching pair without CHROMIUM_PATH. Vite and pytest temporary-directory access required approved execution outside the Windows sandbox; failures caused by that boundary are not reported as application passes.

Starlette reports its existing TestClient/httpx deprecation warning; the pinned suite passes. Windows pytest also reported an existing cache-directory warning; Linux had only the Starlette warning. The local host uses Node 25.8; the Docker production build uses the documented Node 24. No live quality evaluation, clinical assessment, load benchmark, penetration test, compliance claim, or measured business benefit is asserted.

## Free hosting preparation — October 8, 2026

- `python -m pytest -q` against the dedicated local PostgreSQL database: **52 passed in 41.53s** (the previous 46 plus six hosting/bootstrap tests). After automatic Render-origin handling was added, `python -m pytest -q tests/test_hosting.py`: **6 passed in 4.91s**.
- `python -m ruff check .` and `python -m ruff format --check .`: passed (27 Python files).
- Frontend `npm run format:check`, `npm run lint`, `npm run typecheck`, and `npm run build`: passed. `npm update source-map-js` changed only 1.2.1 → 1.2.2; `npm audit --json` reports zero known vulnerabilities.
- `docker build -t careflow-hosted:local .`: passed with the committed lockfile and Node 24 build stage. Image has the built frontend, runs as UID 1000, and does not contain local .env/.env.hosting files.
- Started that image on local port 5175, attached to a **new careflow_hosting_check** PostgreSQL database; migrations and health readiness polling passed. Development mode was explicitly used for this local HTTP check; cloud configuration stays production/HTTPS.
- `BASE_URL=http://localhost:5175 npm run test:e2e` (PowerShell sets the environment separately): **six passed in 33.7s** against the combined image, covering desktop/mobile workflows and rescheduling conflicts. Screenshots were refreshed from this local hosted-image check.
- Existing Compose database and records were not reset. The temporary hosted-image service is stopped after verification; its separate fictional test database is retained.
- **Not verified:** actual Render deployment, provider account access, Neon connectivity, public TLS, hosted workflows, or live AI quality. No cloud resource was created and no paid API call occurred. Account sign-in/private database configuration is the remaining deployment blocker, not a failing local test.
