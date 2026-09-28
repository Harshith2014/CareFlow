# Discussing CareFlow in a junior engineering interview

## A short explanation

“I built a single-clinic portfolio application with React/TypeScript, FastAPI, and PostgreSQL. Reception registers fictional patients and books fixed slots. Assigned doctors document visits, optionally generate structured drafts, review them, and explicitly finalize. Administrators manage staff and see restricted operational audit data. The interesting engineering work is backend authorization, concurrent booking protection, stale-update rejection, and keeping external AI failures separate from the clinical workflow.”

Use only verified claims from `verification.md`. Mock mode is not model inference. Do not describe this as HIPAA-compliant, clinically validated, used by clinics, or saving a measured amount of time.

## Trace a booking request

1. `frontend/src/App.tsx` renders available slot buttons for the selected patient, doctor, and clinic day.
2. `api.ts` sends `POST /api/appointments` with `slot_id` and `patient_id`. The browser supplies the HttpOnly cookie. JavaScript supplies the CSRF header from memory.
3. FastAPI validates `Booking`. `security.py` loads the hashed session, checks expiry and active staff, checks Origin and CSRF, and restricts the route to reception.
4. The route verifies referenced patient and future slot and inserts an appointment. PostgreSQL's partial unique index decides whether the slot is still available.
5. On success, an audit event and booking commit together. `AppointmentOut` defines the response. The UI refreshes and shows success.
6. If another request won, SQLAlchemy raises `IntegrityError`; the route rolls back and returns 409. The UI displays that conflict. A UI availability check alone could not ensure correctness.

## Concepts grounded in the code

**Authentication versus authorization.** Authentication asks who has a valid session. Authorization asks whether that user may perform this action on this record. Reception has a valid session but receives 403 for encounters. Doctor ownership checks still apply after a role check.

**Transactions.** Finalization changes encounter state, appointment state, and audit history. They must all happen or none must happen. The rollback test deliberately flushes SQL and then raises during auditing; an independent session verifies both states stayed unchanged.

**Concurrency.** Booking uses a database unique index because different workers or clients can pass application checks simultaneously. Encounter editing uses an expected version; the server locks the row, checks version, and increments it. This prevents lost updates instead of silently applying the last request.

**Migrations.** SQLAlchemy models represent the current application. A frozen Alembic revision records how to create the schema reproducibly. `alembic check` detects model/schema drift. Future changes need a new reviewed migration, never rewriting an applied revision.

**AI as an unreliable dependency.** The provider interface separates deterministic mock behavior and live HTTP calls. Calls run after the pending draft transaction commits. On response, source version and generation sequence are checked again. A stale response is retained as stale history, never silently applied.

**Testing levels.** Pytest uses real PostgreSQL for constraints, locks, commits, and independent concurrent requests. HTTP provider fakes simulate failures without cost. Playwright checks registration through finalization in a real browser on desktop/mobile viewports. Live-model evaluation is a separate opt-in process, not a unit-test accuracy claim.

## Likely questions

**Why PostgreSQL rather than SQLite?** The required guarantee depends on PostgreSQL's actual partial unique index and concurrent transactions. A SQLite test could verify a different locking behavior and give false confidence.

**What if a user changes an ID in a request?** Each clinical endpoint checks doctor role and ownership. Patient reads check a care relationship. UI hiding is only a convenience, not the security boundary.

**Why sessions instead of JWTs in localStorage?** The app needs easy logout and role-change revocation. Server-side sessions provide that directly. HttpOnly cookies reduce JavaScript access to credentials; cookies require CSRF protection, so writes validate Origin and a session token.

**Can two AI requests overwrite each other?** Each generation increments a sequence. A response only succeeds if its sequence is still latest, its source version is unchanged, and the encounter remains a draft. Different records retain generation history; original and reviewed notes are never automatically overwritten.

**What happens when AI fails?** A failed draft stores a sanitized reason; source and reviewed fields remain. Manual writing and explicit finalization continue to work. A crashed process can leave pending history; this demo has no recovery worker.

**Does structured output prevent hallucinations?** No. It helps field shape and validation, not factual truth. Instructions prohibit new advice and inference, but human source comparison remains necessary. Literal evaluation checks are limited and reported separately from human factuality review.

**Why no queue or microservices?** A small portfolio clinic does not justify that operational complexity. A synchronous provider adapter is understandable and sufficient for the demo. A real workload would need measured capacity planning, time budgets, monitoring, and possibly jobs; none is claimed here.

**What does cancellation do to history?** It marks the existing booking canceled with a reason. The partial index excludes that row, permitting a new booking. No record is deleted. Once documentation starts, cancellation is blocked.

**What would you improve next?** Password lifecycle and throttling, stronger operational controls, amendment workflows, safer admin provisioning, clinician coverage rules, query efficiency, and extracting larger UI components as complexity grows. Prioritize based on concrete requirements, not infrastructure fashion.

**How did AI help development?** Refer to the actual mistakes and checks in `ai-development-log.md`. Explain an example you understand: broad HTTP mocking accidentally intercepted the application's test client; a provider-only factory fixed the test boundary. Be prepared to walk through the code yourself.

## Release 2: trace a rescheduling request

`ReschedulePanel.tsx` fetches future slots for the appointment's doctor and shows old/new times and a required operational reason. It sends `POST /appointments/{id}/reschedule` with the current version and a UUID identifying this intent. The role dependency permits reception only. `scheduling.py` locks the appointment, handles exact retries, checks state/version, locks the sorted slot pair and doctor, and validates the target. PostgreSQL's partial unique index arbitrates remaining booking races. Slot change, version increment, history, and audit commit together. The UI refreshes availability and the day list after success.

**Why preserve the appointment ID?** It represents the same intended visit. A separate move record stores old/new slots and reason, avoiding cancellation/replacement identities and preserving relationships.

**Why both a row lock and a version?** The lock makes validation and writes atomic against other transactions. The version tells us whether a human edited stale state. Two different requests with version 1 cannot silently become two moves.

**What if the response is lost?** Retry the same UUID and payload. The saved response is replayed without duplicate history/audit. It describes that original successful operation, even if later changes occurred, so refresh the current schedule. A changed payload with the old UUID returns 409. The browser remembers the UUID only while the unchanged panel remains open.

**What if cancellation or encounter creation races?** They share the appointment lock. Versioned cancellation and rescheduling produce one winner. An encounter starting first blocks a move; if the move happens first, starting the encounter afterward is a valid serial order. Tests verify these outcomes with independent PostgreSQL connections.

**Why not call word matching an AI accuracy score?** A paraphrase may preserve a fact without matching, while a misleading negation can contain all expected words. The evaluator records hints and a blank review sheet. Live evaluation requires authorized bounded spending, and remains unrun. Mock unstructured output visibly requires manual categorization.

**Is CI green?** Local equivalent checks passed; a workflow is configured. A hosted green result requires an actual successful GitHub run tied to a commit. Those statements are deliberately separated in verification.md.

## Practice exercises

- Trace `finalize` from the button to `commit` and explain which exceptions roll back.
- Find the partial index in the migration and describe two concurrent transactions.
- Explain why an AI call cannot remain inside the locked transaction.
- Add a new patient validation rule with a meaningful negative test.
- Draw the permission matrix from memory and identify why administrators do not inherit doctor permissions.
