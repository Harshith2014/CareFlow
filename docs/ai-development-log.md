# Actual AI-assisted development log

This repository was implemented with a coding assistant from an empty workspace. These entries describe observed work and errors in this session. The student should reproduce the checks before claiming personal understanding in an interview.

## Decisions and verification

- Inspected the workspace and parent paths for `AGENTS.md`; none were found. Selected the requested monorepo stack.
- Designed the eight entity groups before the interface. Chose a PostgreSQL partial unique index instead of an availability read as the booking guarantee. Five concurrent test clients observed one 201 and four 409 results.
- Added expected encounter versions and a generation sequence. Two AI requests can share a source version but finish in reverse order, so source version alone is insufficient.
- Verified the optional provider's request shape against official OpenAI structured-output documentation. Removed wire-schema defaults and required every field. Added local validation that refuses missing output keys.
- Labeled mock mode as deterministic parsing. No live provider requests were made. Live evaluation refused to run without an API key.

## Mistakes discovered and corrected

1. **Overbroad HTTP mocking.** Initially patching `httpx.Client.post` also intercepted application test requests. Three tests failed for the wrong reason. Added a provider-specific factory and corrected a nested-class name-scoping error in its fake. The corrected tests exercise the FastAPI endpoint.
2. **Mutable migration.** The first migration referenced current model metadata. Replaced it with frozen Alembic operations so future model edits cannot change old revisions. Lint caught generated JSONB's unqualified `Text()`; corrected it to `sa.Text()`. Fresh-database migration and drift checks passed.
3. **Unused frontend import.** TypeScript and ESLint rejected an unused `FormEvent` import. Removed it before the successful production build.
4. **Mobile logout visibility.** Responsive CSS initially hid the profile/logout area. Restored those controls on mobile.
5. **Null provider output.** Review found null content from a refusal could raise `TypeError`. Added sanitized invalid-output handling and tests for null and missing-field output.
6. **Evaluation output directory.** The first evaluation run failed before documentation directories existed. Created them and reran; did not claim an incomplete report as a result.

## Environment findings

Browser tests subsequently exposed two more issues: implicit select labels included option text, fixed with explicit `htmlFor`/`id` associations; and changing a doctor filter briefly left old slot buttons enabled, fixed with a loading gate and refresh sequence. All four desktop/mobile tests then passed against Compose. Final backend verification passed 21 tests on both Windows and container PostgreSQL, and a database container restart preserved the fictional patients.

- Package downloads needed scoped approval outside the Windows sandbox. Resolved dependencies were locked.
- The installed PostgreSQL server required credentials. Created an isolated workspace cluster on port 55432 with separate demonstration, test, and migration databases. Did not change the installed server's data or authentication.
- Vite needed filesystem access outside sandbox directory-enumeration restrictions; the approved build succeeded.
- Playwright's requested Chromium download timed out. Browser verification uses an explicitly selected existing Chromium where documented. Final evidence is in `verification.md`.

## Release 2 — September 28, 2026

- Re-read the existing implementation and reran its baseline instead of trusting the supplied summary: 21 backend tests and four browser checks passed.
- Reused the existing live-provider adapter. Added an unlabeled-source prompt contract and output-token cap; did not replace the mock with heuristics and then claim model capability. Consulted official structured-output and model-pricing documentation. No paid call was made.
- Added appointment versions and a dedicated move table. Chose one transactional slot change, with the existing unique index, instead of cancel-then-book. Added a UUID response replay contract so network retries do not duplicate history or audit.
- Found that a legacy test database had tables created from metadata and no Alembic revision. The migration-enabled fixture correctly refused duplicate tables. Created a new disposable test database rather than stamping or resetting existing records. Added a 001-to-002 preservation/drift script.
- Found that checking for an existing live report after running evaluation could spend before refusing overwrite. Moved that check before evaluation. Added key-without-authorization and request/budget bound tests, using fakes only.
- The latest locked Playwright browser download repeatedly timed out. Pinned Playwright 1.58.2, installed its matching Chromium, and reran without an executable override.
- New browser conflict assertions initially accepted “taken”/“occupied” but omitted the actual “already booked” error. Inspected the real UI response, corrected the assertion, and obtained six passes. The backend behavior was already correct; no check was disabled.
- The recording's chosen day initially had no seeded slots because the existing seed was several days old. Refreshed the explicit fictional seed without deleting records. This is a setup precondition, not a model or database correctness result.
- Video inspection then found a stale “Working…” frame during a pause even though DOM assertions had passed. Added a real screenshot/compositor flush before presentation pauses and reran the recording; did not manufacture a replacement success frame.
- Verified 46 PostgreSQL tests on Windows and Linux, including rescheduling races and rollback. Desktop/mobile rescheduling screenshots were inspected. Updated AI-mode help to distinguish unlabeled live input from the mock parser's limitations.
- Kept normal CI free of live evaluation and excluded trace archives from upload because browser traces may include session material. Prepared a private-repository push with CI skipped pending separate Actions spending authorization.

## Rejected shortcuts

No client-only authorization, SELECT-then-INSERT booking guarantee, localStorage tokens, automatic finalization, mock-based live-model quality claims, real patients, or invented clinical/business impact. Hosted CI and Docker runtime verification are reported only when actually run.
