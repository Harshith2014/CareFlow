# CareFlow progress — release 2

## Plan and scope
1. Inspect existing implementation and establish baseline.
2. Add atomic same-doctor rescheduling with migration, versions, retries, history, UI, and races.
3. Prepare bounded live evaluation and repair reproducible CI.
4. Verify, inspect UI, record demo, update guides, and push to the user-supplied repository.

No prescribing, billing, voice, multi-clinic, timeline, or analytics features added. No applicable AGENTS.md found. Existing database records and original tests preserved.

## Completed
- Rechecked baseline: 21 backend tests and four browser checks passed.
- Implemented migration 002, appointment versions, transactional rescheduling, exact-request replay, restricted history/audit, and receptionist review UI.
- Expanded suite: 46 PostgreSQL tests pass on Windows and Linux; six browser checks pass using Playwright 1.58.2 and matching Chromium.
- Lint, formatting, TypeScript, production builds, migration preservation, and Alembic drift checks pass.
- Updated retained-volume Compose installation; explicitly refreshed fictional seed slots.
- Added 25-case evaluation set, bounded spending gate, verified pricing snapshot, reports, and blank human-review sheets. Mock evaluation and no-network plan generated.
- CI uses isolated databases, committed locks, matching browser, readiness polling, and secret-conscious artifacts.
- Desktop/mobile screenshots captured; rescheduling, encounter, and conflict screens inspected.
- Actual 2:59.92 silent WebM recording saved at docs/demo/careflow-demo.webm. It verifies booking 409, unauthorized 403, reviewed finalization, and saved manual documentation with AI genuinely disabled. Mock mode restored; final browser regression: six passed in 35.7s.

## Commands
From backend: `python -m ruff check .`, `python -m ruff format --check .`, `python -m pytest -q`, `python scripts/check_migrations.py`, `python -m evaluation.run --plan`, `python -m evaluation.run`.
From frontend: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run build`, `npx playwright install chromium`, `npm run test:e2e`, `npm run demo:record`.
Root: `docker compose up --build -d`; `docker compose exec -T backend python -m app.seed`.
See docs/verification.md for exact environments, timing, and results.

## Environment and remaining steps
The existing app database remains in the Compose volume. Tests use disposable careflow_test_release databases (separate local port 55432 cluster and Docker cluster). Migration verification used a new careflow_test_migration_release, with no reset/stamp of legacy databases. .env, .venv, .local-pg, logs, node_modules, and browser traces are ignored.

Local implementation, verification, demonstration recording, and guides are complete. Source release b8e54f5 was pushed to main at https://github.com/Harshith2014/CareFlow.git; the remote SHA matched and the repository remains private. The release skips CI, and GitHub reported no runs. Live evaluation is NOT RUN: no capped spending authorization or configured local key. Hosted Actions is NOT RUN pending authorization. No external deployment or paid model calls occurred. Remaining external steps are an explicitly authorized live evaluation and hosted CI run; all local work is complete.

## Free hosting follow-up — October 8, 2026

User selected **free hosting only**. Plan: retain FastAPI/PostgreSQL, package React and API at one HTTPS origin, verify locally, then deploy after provider account access is available.

Completed: root non-root Docker image, Render Free blueprint with automatic deployments off, automatic Render HTTPS origin, static serving with API precedence/security headers, interactive first-admin provisioning with no published password, six new hosting/bootstrap tests, and exact Render/Neon instructions in README. Local production demo seeding remains forbidden. Patched source-map-js 1.2.1 → 1.2.2 after a newly reported advisory.

Verification: 52 PostgreSQL tests passed; six focused hosting tests passed after the origin change; lint/format/types/build passed; npm audit reports zero known vulnerabilities; combined Docker image built and passed all six browser workflows on port 5175 with a separate fictional database. Original Compose data was preserved. See docs/verification.md for commands and limits.

Next: sign into/create Render and Neon Free accounts, connect the private GitHub repository, supply the Neon connection only through private configuration, deploy the free Blueprint, bootstrap a private administrator, and verify the actual HTTPS URL. No Render/Neon account connection is available in this session. **Not live yet.** No hosting resource or paid service was provisioned; no live AI calls or hosted GitHub Actions runs occurred.
