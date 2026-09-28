# API examples

Interactive OpenAPI: http://localhost:8000/docs. Input contracts are in `app/schemas.py`; output contracts in `app/responses.py`. All API paths begin `/api`.

Errors use FastAPI's `detail`: a string for domain errors or a list of field errors for validation. 401 means absent/expired credentials; 403 means role/ownership/CSRF/Origin denied; 404 means unknown record; 409 means booking or state/version conflict; 422 means invalid input. Patient and audit pages return `items`, `total`, `page`, and `page_size` (20). Day lists require ISO dates and are bounded to 500 records.

Run this from an installed Python environment against the local fictional demo:

```python
import httpx

with httpx.Client(base_url='http://localhost:5173/api',
                  headers={'Origin': 'http://localhost:5173'}) as client:
    auth = client.post('/auth/login', json={
        'email': 'reception@careflow.demo', 'password': 'CareFlow-Demo-2026!'
    })
    auth.raise_for_status()
    client.headers['X-CSRF-Token'] = auth.json()['csrf']
    patient = client.post('/patients', json={
        'name': 'Fictional API Patient', 'date_of_birth': '2000-01-01',
        'contact': 'fictional@example.test'
    })
    patient.raise_for_status()
    print(patient.json()['id'])
    print(client.get('/patients', params={'q': 'Fictional', 'page': 1}).json())
    client.post('/auth/logout').raise_for_status()
```

For booking, `POST /appointments` takes `{ "slot_id": "…", "patient_id": "…" }`; a taken slot returns 409. Cancellation is `POST /appointments/{id}/cancel` with `{ "reason": "Fictional schedule change", "version": 1 }`. The UI supplies the appointment version; it remains optional for legacy clients, whose cancellation serializes against the latest state.

## Same-doctor rescheduling

`GET /appointments?day=YYYY-MM-DD&doctor_id=UUID` returns `slot_id`, `version`, and `can_reschedule` in addition to schedule fields. Fetch availability from `GET /slots` with the same filters. Only reception can submit:

```http
POST /api/appointments/APPOINTMENT_UUID/reschedule
Content-Type: application/json
X-CSRF-Token: SESSION_CSRF
Origin: http://localhost:5173

{
  "target_slot_id": "NEW_SLOT_UUID",
  "reason": "Fictional patient requested a later time",
  "version": 1,
  "request_id": "77c1f7ca-24a6-40a1-8e2c-506caf3c0d50"
}
```

Generate a fresh UUID for each new intent. Preserve it and the exact payload when retrying after a lost response. Authentication still requires the session cookie. A 200 response has `appointment` (ID unchanged, new slot and incremented version), `change` (actor, timestamp, old/new slot IDs, reason, expected version, request ID, saved result), and `replayed: false`. An exact successful retry returns the same saved result/change with `replayed: true`; no duplicate writes occur. A historical replay can differ from the current appointment, so refresh its schedule after success.

| Response | Meaning |
|---|---|
| 401 / 403 | Session invalid or caller is not a permitted receptionist; invalid CSRF/Origin also yields 403 |
| 404 | Appointment or target slot does not exist |
| 409 | Stale version, target taken, inactive doctor, canceled/completed/started appointment, reused key with changed payload, or retryable database scheduling conflict |
| 422 | Same/current slot, another doctor's slot, past target, invalid UUID/request fields, or reason outside 3–300 characters |

On every failed move, the original booking and previous history remain unchanged. `GET /appointments/{id}/history` is available only to reception and administrators and returns move records in chronological order, without clinical notes. Audit viewers also see the old/new appointment times and reason. Original booking retries continue to return 409 on a taken slot; rescheduling's response replay is a separate contract.

As the assigned doctor, start with `POST /appointments/{id}/encounter`. Save using `PATCH /encounters/{id}` with `version`, `rough_note`, and `reviewed_note` (all four structured fields). Generate and finalize use `POST /encounters/{id}/generate` and `/finalize`, each with `{ "version": CURRENT_VERSION }`. Generation returns a separate draft record and never changes the note. Save increments version; finalization increments it again. On 409, reload the saved record and review differences instead of blindly retrying.

The documentation UI does not bypass sessions, Origin checks, or role checks. Use browser requests from the configured frontend origin or the explicit example above; API clients must preserve cookies and send both Origin and CSRF on authenticated writes.
