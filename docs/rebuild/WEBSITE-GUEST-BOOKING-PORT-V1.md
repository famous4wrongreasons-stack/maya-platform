# Website guest booking port v1 — implementation contract

Status: **IMPLEMENTED LOCALLY, NOT RELEASED**. Prepared for the existing styled wizard in
`/Users/stanislavmosin/Desktop/Projects/maya-web/app/booking/page.js`. Preserve that presentation.
This is a guest website port, not a MAYA chat redirect or a Client-login token. Frontend may build
an adapter and isolated fixtures against these shapes; production activation waits for backend
matching frontend integration proof and approved production configuration. The old `appointment-create` and retired raw
`create_record` routes are not changed or reopened by this proposal.

## Ownership and admission

- Existing availability/catalog owners supply current public-bookable staff, services and slots.
- Existing CRM appointment owner and Action Engine remain the only provider mutation path.
  `YclientsCrmAdapter.createAppointment` already uses `book_record/{companyId}` in client mode;
  a second direct HTTP implementation must not be added to the website or controller.
- At the proposal baseline no executable anonymous booking admission owner was found. Current canonical Client create
  requires a verified Client link; existing A18 issuance requires an active link and SB-1/V2
  requires a revoked predecessor. Neither is a guest admission mechanism.
- Implement a narrow **public booking intent** admission under the appointment owner, with a
  server-provisioned active public-site→tenant/branch mapping, public-booking entitlement/policy,
  fresh quote, submitted contact/consent, rate/abuse checks and one durable action. Extend the
  existing AE policy explicitly for this source. Never impersonate a User, create a fake verified
  ClientChannelLink, borrow owner credentials, or label an anonymous request authenticated.
- Entered name/phone are contact claims for this new booking only. They grant no existing Client
  identity, history, loyalty, appointments list, cancel or reschedule authority. Canonical Client
  reconciliation remains with its existing owner and exact provider identity evidence; no merge or
  attachment to an existing Client solely because phone/name match.

## Same-origin routes and closed shapes

The website calls a same-origin adapter; provider credentials and tenant IDs never reach the
browser. `siteKey` is a provisioned public site identifier, not caller-supplied tenant authority.
All responses are `Cache-Control: no-store`. JSON bodies reject unknown keys. All `*Ref` values are
opaque strings scoped to the current public booking session, never interpreted by the browser.

1. `POST /api/public-booking/sessions` with `{ "siteKey": "<public-site-key>" }`.
   Server sets a Secure/HttpOnly/SameSite guest-session cookie and returns:
   `{ "contract": "maya.website-guest-booking/1", "csrfToken": "<opaque>",
      "expiresAt": "<ISO instant>", "site": { "name": "...", "timezone": "Europe/Moscow" },
      "staff": [{ "staffRef": "...", "name": "...", "photoUrl": "https://..." }] }`.
   Proposed session lifetime: 24 hours, solely for this booking and outcome retrieval. Site mapping
   must validate the request origin; no arbitrary API base/tenant/branch selector is accepted.
2. `GET /api/public-booking/services?staffRef=<opaque>` returns
   `{ "services": [{ "serviceRef": "...", "name": "...", "durationMinutes": 30,
      "priceMinor": 150000, "currency": "RUB" }] }`.
3. `POST /api/public-booking/availability` with
   `{ "staffRef": "...", "serviceRefs": ["..."], "localDate": "YYYY-MM-DD" }` returns
   `{ "timezone": "Europe/Moscow", "slots": [{ "slotRef": "...", "startsAt": "<ISO offset>",
      "endsAt": "<ISO offset>", "label": "12:00" }] }`.
   An unavailable source is an error, never an empty available-slots result. Empty slots require a
   successfully verified source. Recheck active staff/service compatibility and tenant/branch scope.
4. `POST /api/public-booking/quotes` with `{ "slotRef": "..." }` returns
   `{ "quoteRef": "...", "expiresAt": "<ISO instant>", "staffName": "...",
      "serviceNames": ["..."], "startsAt": "<ISO offset>", "endsAt": "<ISO offset>",
      "timezone": "Europe/Moscow", "totalMinor": 150000, "currency": "RUB",
      "consent": { "documentVersion": "...", "documentUrl": "/privacy" } }`.
   Proposed quote lifetime: five minutes. Quote freezes exact server-selected facts. Changed price,
   duration, availability or source requires a new quote and visible confirmation before dispatch.
5. `POST /api/public-booking/attempts`, headers `X-CSRF-Token` and `Idempotency-Key` (UUID), with
   `{ "quoteRef": "...", "contact": { "name": "...", "phone": "+7..." },
      "consent": { "accepted": true, "documentVersion": "..." } }`.
   Response: `{ "attemptRef": "<same opaque idempotency key>",
      "state": "PENDING|SUCCEEDED|FAILED|UNKNOWN", "code": "<finite code>",
      "retryAfterSeconds": 3, "booking": null }`.
   `booking` is populated only on verified success with the quoted public facts and a receipt label;
   no bearer token, provider Client ID, private history or account grant. No success from HTTP 2xx
   alone. PENDING means admitted/in-progress; UNKNOWN means provider outcome not established.
6. `GET /api/public-booking/attempts/:attemptRef` reads that exact guest session's attempt, with the
   same response shape. It performs no new create. Another cookie/tenant or unknown reference returns
   a non-enumerating refusal. A missing local row does not establish provider failure.

All mutation-like POSTs after session creation carry the CSRF token. The backend validates trusted
origin, exact session, closed refs, bounded input and anti-abuse limits. PII goes only into the
existing protected booking payload/delivery path; never LLM context, URLs, diagnostics or browser
localStorage. Any provider-required phone challenge must be a declared guest-booking continuation,
not MAYA registration and not an invented verified Client episode.

## Idempotency, unknown outcomes and presentation

Generate the idempotency key once on the user's final confirmation, retain it through timeout,
reload and status polling, and never generate a replacement automatically. Server atomically binds
it to the immutable intent/contact hash inside the session before dispatch. Same key/different input
is 409 `IDEMPOTENCY_CONFLICT`; concurrent/same-input replay returns the same durable attempt. A
provider uncertainty remains UNKNOWN until source-qualified reconciliation resolves it. The existing
AE retry policy must prohibit another provider dispatch for UNKNOWN.

Network exceptions, lost/invalid response bodies, gateway timeouts and uncertain 5xx after dispatch
map to UNKNOWN in the website adapter. Keep the attempt locked, offer status refresh and a contact
route, and preserve the selected facts. Do not display “not booked” or invite an automatic duplicate.
Only explicit pre-dispatch validation refusal is safely retryable after correction. Expired guest
session does not authorize a new booking or anonymous access to a prior person's appointment.

Create-only guest authority does not imply guest own-list/reschedule/cancel. Those remain separate
verified or provider-issued appointment-management capabilities. The website release must state its
actual supported scope.

## Required implementation proof before enabling the existing wizard

Real isolated HTTP/PG admission→quote→confirmation→AE→synthetic provider outcome; stale price/slot;
foreign session/site refs; unknown fields; wrong consent version; concurrent duplicate POST; lost
provider response; reload/status recovery; no re-dispatch from UNKNOWN; exact provider readback;
no fabricated Client link or account; no raw PII in logs. A fake adapter cannot certify real YCLIENTS
delivery, notifications, guest-contact requirements or reconciliation. Production configuration,
schema migration and activation remain part of the separately approved release boundary.


## Implemented v1 additions and terminal reset (2026-10-05)

- All six routes exist under the existing AppointmentsModule. `PUBLIC_BOOKING_SITES` is a
  server-only JSON array of `{siteKey,tenantId,branchId,origins,consentVersion,consentUrl}`;
  unset/invalid mapping fails closed. Live booking mode plus `booking`, `booking.public`,
  `crm.integration`, active external YCLIENTS target and matching branch are mandatory.
- Secure/HttpOnly/SameSite=Strict cookie is `__Host-maya_guest_booking`, Path=/, lifetime 24h.
  Session bootstrap reuses a valid cookie; status lookup needs that same cookie, never login.
  Forward the exact trusted website Origin on **every** backend call, including GET; the
  same-origin server adapter must also forward Cookie and Set-Cookie without logging them.
  HTTP localhost/127.0.0.1 origins are accepted only in NODE_ENV=test for isolated previews.
- Bootstrap adds `dateWindow={from,through,availability:"query_required"}` (today through
  today+59 in tenant timezone). These are selectable dates, not claimed available dates.
  Per-date availability comes from existing CRM slot owner. No available-date calendar claim.
- Successful `booking` is exactly `{staffName,serviceNames,startsAt,endsAt,timezone,totalMinor,
  currency,receiptLabel}`. `receiptLabel` is a non-authorizing display string. No provider ID,
  name/phone/contact, Client ID, account grant or management credential is returned.
- `FAILED / REJECTED_BEFORE_DISPATCH` is the **only reset-safe failure**: a durable immutable
  nonce receipt establishes no provider entry and releases only the same-intent guard. The
  browser may explicitly clear its active attempt under its WebLock, fetch a fresh quote and
  request visible confirmation. The old nonce still returns that same refusal forever within
  the session; it never retries. This code is distinct from HTTP status.
- `VALIDATION_REFUSED` (before durable admission) and `ACTION_REJECTED` are fail-closed UI codes;
  do not infer safe reset from them, generic FAILED, 4xx, 5xx, missing status row or timeout.
  `IDEMPOTENCY_CONFLICT` (409) also preserves the lock. Unknown/non-enumerating status returns
  404 `PUBLIC_BOOKING_ATTEMPT_UNAVAILABLE`, without a fabricated failure envelope.
- PENDING/UNKNOWN (`OUTCOME_UNRESOLVED`) remain locked. GET status never dispatches. Every
  exception after guest provider entry, including malformed response, is conservatively UNKNOWN.
  Phone/time matching cannot prove this request did not execute, so guest reconciliation never
  returns PROVEN_NOT_EXECUTED from an empty phone lookup. Exact provider-correlated positive readback
  recovery is implemented; missing or ambiguous evidence still requires owner/provider investigation.
- SUCCEEDED (`BOOKED`) preserves the receipt. A separate explicit “Новая запись” may archive
  the public terminal receipt and atomically clear the browser active pointer under the same
  WebLock. A different nonce for the same still-active session/phone/staff/services/time/source
  intent remains blocked server-side; changing quote alone cannot bypass UNKNOWN/duplicate guard.
- Staff-specific YCLIENTS `book_services` supplies duration and fixed price. Range/discounted prices,
  invalid duration and required/unknown prepayment policies are not offered. Paid checkout and
  provider phone challenge are not synthesized by this guest create-only release.

Local synthetic integration preview (from `maya-saas-backend`, no provider credentials):

```sh
DATABASE_URL=postgresql://maya_b35_proof@127.0.0.1:55539/maya_widget_gate_proof_b35_completion npx ts-node --project tsconfig.scripts.json --transpile-only scripts/public-booking-preview.ts http://localhost:3000
```

It emits its random loopback baseURL, siteKey `proof-site`, and one synthetic available date.
Use synthetic contact data only. It scrubs inherited secrets, refuses dotenv, blocks outbound fetch,
creates its own proof tenant, and cleans it up on SIGINT/SIGTERM or after 30 minutes. It is an
integration fixture, never a production server or evidence of real YCLIENTS booking acceptance.


## Positive UNKNOWN recovery addition

GET status can now perform a bounded provider **read-only** reconciliation (at most two reads
per minute per attempt through the durable rate-limit owner). It never issues create/cancel/move.
A full HMAC correlation marker plus numeric api_id, frozen company and exact record facts can
finalize the existing UNKNOWN ActionExecution as SUCCEEDED after reload/server restart, including
an earlier MANUAL_REQUIRED state. No match, duplicates, truncated/unavailable reads, deleted or
changed record, changed source or missing old correlation stay UNKNOWN. Provider readback creates
only the existing AE reconciliation receipt; it creates no User/Client/link or new appointment.

The synthetic preview accepts optional `--lose-first-reply`: its first create persists one synthetic
record and loses the response, then status recovers the receipt without a second dispatch.
See [provider acceptance and release gates](WEBSITE-GUEST-BOOKING-RELEASE-GATES.md) for official
schema conflicts, exact prerequisites, migration diff and evidence-preserving rollback.


## Integrated-QA field bounds and local same-origin proxy

`WEBSITE-GUEST-BOOKING-FIELDS-V1.schema.json` freezes the field-specific transport bounds:
`staffRef`, `serviceRef`, `slotRef` are nonempty opaque ASCII `[A-Za-z0-9_.-]` strings up to
4096 characters. Do not apply this bound to every identifier: quoteRef/attemptRef remain exact
36-character UUIDv4 values. Backend emits no selection ref beyond that limit. The actual slot
fixture is 346 characters; a 256-character frontend cap rejects valid availability.

`staff[].photoUrl` is **null or an HTTPS URL up to 2048 characters, without URL credentials**.
Null means use the existing portrait fallback, not refuse the session. Unsafe/missing source images
are normalized to null. The frontend may validate these exact cases without loosening authority,
UUID, origin, consent, quote or attempt checks.

A separate local-only proxy is available for actual same-origin browser integration:

```sh
node scripts/public-booking-local-proxy.mjs http://127.0.0.1:BACKEND_PORT http://localhost:FRONTEND_PORT http://localhost:PROXY_PORT
```

Run the backend synthetic preview with that exact browser proxy origin. The proxy binds only
127.0.0.1, admits only explicit HTTP loopback upstreams, forwards only the six permitted guest
routes/methods to backend and sends other paths to the local frontend. It supplies the trusted
browser origin on GET, preserves CSRF/nonce and Secure/HttpOnly/SameSite/Path cookie flags,
forwards only the guest cookie to backend and strips Authorization. Cross-origin guest writes
and unknown guest routes are refused. It changes no production proxy or website source and stops
after 30 minutes. Do not weaken cookie security to make a browser fixture pass.
