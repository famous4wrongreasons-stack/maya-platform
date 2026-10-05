# Website guest booking port v1 — implementation contract proposal

Status: **PROPOSED, NOT IMPLEMENTED OR RELEASED**. Prepared for the existing styled wizard in
`/Users/stanislavmosin/Desktop/Projects/maya-web/app/booking/page.js`. Preserve that presentation.
This is a guest website port, not a MAYA chat redirect or a Client-login token. Frontend may build
an adapter and isolated fixtures against these shapes; production activation waits for backend
implementation and matching integration proof. The old `appointment-create` and retired raw
`create_record` routes are not changed or reopened by this proposal.

## Ownership and admission

- Existing availability/catalog owners supply current public-bookable staff, services and slots.
- Existing CRM appointment owner and Action Engine remain the only provider mutation path.
  `YclientsCrmAdapter.createAppointment` already uses `book_record/{companyId}` in client mode;
  a second direct HTTP implementation must not be added to the website or controller.
- No executable anonymous booking admission owner was found. Current canonical Client create
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
