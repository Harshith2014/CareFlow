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
