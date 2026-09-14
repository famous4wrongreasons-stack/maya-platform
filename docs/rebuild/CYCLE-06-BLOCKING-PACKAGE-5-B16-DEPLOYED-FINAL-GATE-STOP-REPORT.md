# Package 5 B16 deployed remediation and fresh Final Gate STOP

Status: **B16 production remediation PASS; Package 5 Final Adversarial
Verification FAIL at new B17 Client record identity/action bypass**.

Accepted checkpoint: `7faab8d3`.

Runtime commit: `a3a12f26d56d942863368c762acd9dc0b809b435`.

Backend production release:
`/opt/maya-saas/releases/20260905-p5-b16-a3a12f26`.

No schema or migration was added. Production has 78 repository migrations and
81 accepted migration records. Pending migrations are `0`; an independent
Prisma comparison reports `No difference detected`.

## B16 production result

`POST /api/booking/prefill` is now a read-only canonical Client projection.

1. The original Telegram or Maya channel proof is authenticated by the
   canonical backend. The runtime requires exactly one active, version-1,
   tenant/provider/subject-qualified `ClientChannelLink` before reading a
   Client or any PII.
2. Raw `chat_id`, phone, legacy session identity and caller-supplied `clientId`
   cannot select the Client. Unexpected identity fields fail closed with an
   unlinked, empty prefill response.
3. A missing, revoked, ambiguous, cross-tenant or merged Client binding returns
   no stored name or phone. Consent is read only after identity resolution; a
   missing privacy decision returns no PII.
4. A verified Client with a Maya User may use that tenant-qualified profile.
   A verified Client without a Maya User may use exactly one active
   `CrmClientLink` and its exact provider registry record. Provider failure,
   missing record, duplicate match or provider mismatch produces an empty
   prefill and never a legacy fallback.
5. The endpoint creates no Client, `ClientChannelLink`, consent fact or other
   business record. Repeated and concurrent reads do not change durable state.
6. The published proxy forwards the original Maya bearer when present; the
   proxy does not resolve a Client. No production PII endpoint was invoked for
   smoke verification.

Exact deployed B16 artifacts:

- active webhook SHA-256:
  `f6a1cc18de88f0636868a7ba8b268200f651a068af92badfdfb4403cc8942f7e`;
- active client bridge SHA-256:
  `8cd71ec944aa707cdb6e795727a7b399c416d8c0084e91ef168e101b91829692`;
- active Package 5 guard SHA-256:
  `9bc7a0db9e3fc7007676338e913476df8cb3c5a368ce7449957995a938f35343`;
- published proxy SHA-256:
  `769555a5beaf9a27a00ccadeba267ffc8ee855e68db266771d83848ec278a57b`;
- published application SHA-256:
  `fe804992306c50d5e8544a48d59d496c75664dd0af542b13b0e1f7810e59ebc`.

## Proof and deployment

- targeted B16 Python proof: PASS — 8 tests;
- Package 5 active guard regression: PASS — 20 tests;
- B16 service and architecture proof: PASS — 13 tests;
- Prisma validate, lint, application typecheck and script typecheck: PASS;
- build and release-preflight compilation: PASS;
- mandatory deployment regression: PASS — 342 suites / 2811 tests;
- active Package 4 runtime guard: PASS;
- active Package 5 B13–B16 runtime guard: PASS;
- backend candidate startup and production health/readiness: PASS;
- request-only PWA restart and published PHP 8.4 syntax: PASS;
- backend and PWA error-priority logs after activation: `0`;
- candidate port 3199 after deployment: closed;
- real production Client, link, consent, PII or provider mutations used for
  proof: `0`.

The active PWA candidate was assembled from the exact B15 production file and
only the reviewed B16 handler was replaced. Unrelated local working-tree
changes were not deployed. The published proxy candidate was assembled from
the exact production file and adds only forwarding of the existing
`Authorization` header for `booking_prefill`.

## Fresh Package 5 Final Gate inventory

After structural verification, the Final Gate restarted from the beginning. It
inspected all 13 family foundations, the exact deployed backend release, 537
production TypeScript files, 218 HTTP decorators, 500 Prisma mutation-like
calls, 89 active-root Python files, 69 non-test Python files, 94 non-OPTIONS
Python HTTP routes, 93 distinct handlers, the request-only PWA launcher, the
published proxy/application, background/event paths and Package 4
cross-package guards.

B16 passed the new PII-projection scan. The inventory then stopped at the
first new production-reachable blocker, B17. Final aggregate certification was
not started after that finding.

## B17 — Client cancellation/reschedule trusts legacy identity and owner

The published application calls `client_cancel_record`; the public proxy also
exposes both `client_cancel_record` and `client_reschedule_record`, forwarding
to:

- `POST /api/client/cancel-record`;
- `POST /api/client/reschedule-record`.

Both handlers share `_client_record_request_context`, which:

1. accepts `_authed_chat_id` from Telegram or a legacy web session;
2. treats legacy `database.has_valid_consent_by_chat_id(chat_id)` as an
   authority gate;
3. resolves the Client through `database.get_client(chat_id)`;
4. uses the resulting legacy phone to decide ownership of the provider record.

The handlers then call `client_record_actions.cancel_for_client` or
`reschedule_for_client`. Those helpers directly call YClients
`cancel_booking`/`reschedule_booking`, while the handlers also write legacy
cancel/reschedule actor markers. They do not require a verified
`ClientChannelLink`, a tenant-qualified canonical Client or the approved
canonical appointment action owner.

Exact deployed evidence:

- public proxy cases: `api-proxy.php:1074–1078`;
- published application cancel action: `index.html:13235`;
- active route registrations: `webhook_server.py:12915` and `:12917`;
- `_client_record_request_context`: lines 6374–6417, SHA-256
  `9a050913beb81570a78d2c811472819a483fc0f668ad374f5c9710e7e5880e6f`;
- `client_cancel_record_handler`: lines 6420–6460, SHA-256
  `baf2c1eb7ff48d72a2c9c4369354c262af0275478541a86ff946fb9d4debe48d`;
- `client_reschedule_record_handler`: lines 6463–6505, SHA-256
  `3ce785f0f80e93d960348b9754d0de78ced4b271b608a3ddea2d933cae383190`;
- `cancel_for_client`: SHA-256
  `24c5724ab3d296696396fbd6424af6342f6c999eccae1b5ca24aa74517ba411f`;
- `reschedule_for_client`: SHA-256
  `c6d88bbc0c5302c9c7b7eab3fb183795f53ca63efeff8870859f934f12f4cf5d`.

An isolated reproduction supplied a legacy session resolving to `chat_id=777`
and a legacy Client phone. Both handlers reached their mutating helper and
returned success. The helpers were replaced by record-only doubles, so no
provider call or production mutation occurred.

Remediation must first bind the original authenticated channel to exactly one
canonical Client. Record ownership must be derived from durable canonical
Client/appointment identity, and cancel/reschedule must use the already
approved canonical action/provider boundary with existing UNKNOWN and
reconciliation rules. Legacy phone comparison, actor-marker ownership and
direct provider mutation cannot remain fallback authorities.

## Verdict

`B16 BOOKING PREFILL VERIFIED ClientChannelLink: ENFORCED`

`B16 LEGACY chat_id CLIENT AUTHORITY: 0`

`B16 UNVERIFIED CLIENT PII PROJECTION: 0`

`B16 READ-SURFACE BUSINESS MUTATIONS: 0`

`PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL`

`PACKAGE 5 COMPLETE: NO`

`NEW BLOCKER: B17 — CLIENT RECORD CANCEL/RESCHEDULE LEGACY IDENTITY AND MUTATION OWNER`

`CLIENT RECORD VERIFIED ClientChannelLink REQUIRED: NO — BLOCKER`

`LEGACY PHONE/SESSION AS APPOINTMENT AUTHORITY: PRESENT`

`DIRECT LEGACY PROVIDER MUTATION OWNER: PRESENT`

`PACKAGE 5 WAVES COMPLETE: 6/6`

`PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13`

`D1-A…D7-A: ENFORCED OUTSIDE NEW B17 BLOCKER`

`PACKAGE 4 CROSS-PACKAGE GUARDS: PASS`

`PENDING MIGRATIONS: 0`

`SCHEMA DRIFT: NONE`

`REMEDIATION FULL REGRESSION GATE: PASS — 342 SUITES / 2811 TESTS`

`FINAL AGGREGATE REGRESSION GATE: NOT RUN — STOP AT NEW B17 INVENTORY BLOCKER`

`REAL PRODUCTION MUTATIONS FOR FINAL PROOF: 0`

`P4-11 CREATED: NO`

`WAVE 7 CREATED: NO`

`CHAPTER 7 STARTED: NO`

Chapter 6 was not declared complete. The 17 pre-existing local test databases
were not modified or deleted. Owned temporary processes, watchers, browser
processes and temporary databases are zero.

Machine-readable evidence:
`evidence/package5-b16-deployed-final-recheck.json`.
