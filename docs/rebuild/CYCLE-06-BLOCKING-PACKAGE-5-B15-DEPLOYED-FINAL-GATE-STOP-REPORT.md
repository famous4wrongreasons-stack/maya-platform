# Package 5 B15 deployed remediation and fresh Final Gate STOP

Status: **B15 production remediation PASS; Package 5 Final Adversarial Verification FAIL at new B16 A18 identity/projection bypass**.

Accepted checkpoint: `d531fa75`.

Runtime commit: `8c186a54a4f206d4ce04a2a975eda4fb9587ab83`.

Backend production release:
`/opt/maya-saas/releases/20260905-p5-b15-8c186a54`.

No schema or migration was added. Production has 78 repository migrations and
81 accepted migration records. Pending migrations are `0`; independent Prisma
comparison reports `No difference detected`.

## B15 production result

`POST /api/chat/history` is now a read-only projection.

1. Client-mode history requires an authenticated channel and the canonical
   `ClientChannelLink` status reader. A missing or ambiguous link fails closed.
2. Privacy consent is read from the canonical Client-owned consent status. The
   handler no longer trusts SQLite consent resolved by raw `chat_id`.
3. The history read calls neither loyalty nor repeat-booking offer creation.
   Both old read-triggered hooks are fail-closed tombstones.
4. The handler does not call `memory.save_conversations`, does not persist a
   recommendation and does not rewrite historical messages. Legacy messages
   without a server ID receive a deterministic response-only index.
5. Repeated and concurrent reads leave the durable conversation bytes and
   Client count unchanged. Loyalty state remains a Package 4 read projection;
   history reads create no offer, Opportunity, Communication Delivery or value
   fact.

The active runtime guard now protects every function carrying the B15 read-only
marker against Client creation, conversation save, recommendation creation and
direct legacy database writers. Logging and operational telemetry are not
classified as business mutation writers by this check.

Exact deployed B15 artifacts:

- active webhook SHA-256:
  `77a33e03afa340ce08d1e2c3d4772992f48243c39b1a3e8a27acf2ab97028569`;
- active Package 5 guard SHA-256:
  `a9cc2af98a8ae5972e6fc96f83aeb991d778483bff3722169d8c8b4961d6c3a1`;
- `chat_history_handler`: lines 8807–8864, SHA-256
  `b1187f86f80717dd0d38a323a32e4ecb042beb4bdcb4ce296430f59206cf48c8`;
- response-only projection: lines 8581–8608, SHA-256
  `13b03315805f36d81e0281ef3303da91d9f113b4072c6afbcf1039975d53ca4b`.

## Proof and deployment

- targeted B15 Python proof and ratchet regression: PASS — 34 tests;
- B15 TypeScript architecture ratchet: PASS — 5/5;
- Prisma validate, lint, application typecheck and script typecheck: PASS;
- build and release-preflight compilation: PASS;
- mandatory deployment regression: PASS — 340 suites / 2798 tests;
- active Package 4 runtime guard: PASS;
- active Package 5 B13/B14/B15 runtime guard: PASS;
- backend candidate startup and production health/readiness: PASS;
- request-only PWA startup and unauthenticated fail-closed history probe: PASS;
- backend and PWA error-priority logs after activation: `0`;
- candidate port 3199 after deployment: closed;
- real production Client, history, recommendation, communication, value or
  provider mutations used for proof: `0`.

The active PWA candidate was assembled from the exact previously deployed B14
file and only the three reviewed B15 functions. Independent local working-tree
changes were not copied to production. The published application and proxy did
not require a B15 change and remain at SHA-256
`fe804992306c50d5e8544a48d59d496c75664dd0af542b13b0e1f7810e59ebc7`
and `886ca639708a766996716fcb4b1a6b85690c1c61baca35d6b5959495df4e75f5`.

## Fresh Package 5 Final Gate inventory

After structural verification, the Final Gate restarted from the beginning. It
inspected all 13 family foundations, the exact deployed backend release, 537
production TypeScript files, 218 HTTP decorators, 500 Prisma mutation-like
calls, 89 active-root Python files, 69 non-test Python files, 94 non-OPTIONS
Python HTTP routes, 93 distinct handlers, the request-only PWA launcher, the
published proxy/application and Package 4 cross-package guards.

The inventory stopped at the first new production-reachable blocker, B16.
Final aggregate regression/certification was not started after that finding.

## B16 / A18 — booking prefill trusts legacy channel identity

The public proxy still accepts action `booking_prefill` and forwards it to
`POST /api/booking/prefill`. The active handler authenticates a legacy Telegram
or web session to a numeric `chat_id`, then directly calls:

- `database.get_client(chat_id)`;
- `database.has_valid_consent_by_chat_id(chat_id)`.

On that basis it returns the legacy Client name and full phone number. It never
authenticates the original channel through the canonical bridge and never
requires exactly one active `ClientChannelLink`. A legacy phone-derived session
or raw channel binding can therefore act as current Client/PII projection
authority, contrary to D2-A and the approved B8/B9 identity contracts.

Exact deployed evidence:

- public proxy action: `api-proxy.php:993`;
- active route registration: `webhook_server.py:12901`;
- `_authed_chat_id`: lines 6331–6350, SHA-256
  `2ddfb7cc82ef17e876860be27757419ac72e31e14e13282f604c6c9bdcad679f`;
- `booking_prefill_handler`: lines 6520–6575, SHA-256
  `040816ac534c47cf997e601eefbf5a117f2fbe9e520d7d255280fa50900e5c41`.

An isolated reproduction compiled the exact deployed handler and supplied a
legacy session resolved to `chat_id=777`. The handler performed one legacy
Client read and one legacy consent read, then returned a non-empty name and
full phone with HTTP 200. No production endpoint was invoked and production
mutations were `0`.

Remediation requires a verified canonical Client before any prefill projection.
The legacy phone/name fields must not be copied mechanically into a new owner.
If no approved canonical Client-owned contact presentation already exists, an
owner/schema decision is required before implementation. Missing or ambiguous
Client identity must fail closed or return empty/unavailable without PII.

## Verdict

`B15 PRODUCTION REMEDIATION: PASS`

`CHAT HISTORY READ BUSINESS MUTATIONS: 0`

`CHAT HISTORY CLIENT CREATION: 0`

`CHAT HISTORY COMMUNICATION CREATION: 0`

`CHAT HISTORY HISTORICAL REWRITE: 0`

`CHAT HISTORY VALUE MUTATIONS: 0`

`CHAT HISTORY RAW chat_id CLIENT AUTHORITY: 0`

`PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL`

`PACKAGE 5 COMPLETE: NO`

`NEW BLOCKER: B16 / A18 — BOOKING PREFILL LEGACY CLIENT/PII PROJECTION AUTHORITY`

`BOOKING PREFILL VERIFIED ClientChannelLink REQUIRED: NO — BLOCKER`

`PHONE/LEGACY SESSION AS CLIENT PROJECTION AUTHORITY: PRESENT — /api/booking/prefill`

`LEGACY IDENTITY/PROJECTION FALLBACKS: PRESENT`

`PACKAGE 5 WAVES COMPLETE: 6/6`

`PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13`

`D1-A…D7-A: ENFORCED OUTSIDE NEW B16 BLOCKER`

`PACKAGE 4 CROSS-PACKAGE GUARDS: PASS`

`PENDING MIGRATIONS: 0`

`SCHEMA DRIFT: NONE`

`REMEDIATION FULL REGRESSION GATE: PASS — 340 SUITES / 2798 TESTS`

`FINAL AGGREGATE REGRESSION GATE: NOT RUN — STOP AT NEW B16 INVENTORY BLOCKER`

`REAL PRODUCTION MUTATIONS FOR FINAL PROOF: 0`

`P4-11 CREATED: NO`

`WAVE 7 CREATED: NO`

`CHAPTER 7 STARTED: NO`

Chapter 6 was not declared complete. The 17 pre-existing local test databases
were not modified or deleted. Owned temporary processes, watchers, browser
processes and temporary databases are zero.

Machine-readable evidence:
`evidence/package5-b15-deployed-final-recheck.json`.
