# Package 5 B17 deployed remediation and fresh Final Gate STOP

Status: **B17 production remediation PASS; Package 5 Final Adversarial
Verification FAIL at new B18 appointment identity/provider-owner bypass**.

Accepted checkpoint: `f69bf0f9`.

Runtime commit: `eb17dff458ae39511f023f5eede308dd73128f90`.

Backend production release:
`/opt/maya-saas/releases/20260905-p5-b17-eb17dff4`.

No schema or migration was added. Production has 78 repository migrations and
81 accepted migration records. Pending migrations are `0`; an independent
Prisma comparison reports `No difference detected`.

## B17 production result

`POST /api/client/cancel-record` and
`POST /api/client/reschedule-record` now use the approved canonical Client and
appointment execution boundary.

1. The PWA passes only the original signed channel proof. Raw `chat_id`, phone,
   legacy session identity and caller-supplied `clientId`, tenant, staff or
   service identity cannot select the Client or appointment owner.
2. The canonical backend resolves exactly one active tenant/provider/subject
   qualified `ClientChannelLink`, then proves that the exact canonical
   `Appointment` belongs to that exact Client and is still eligible for the
   requested operation.
3. Cancel delegates to `cancel_appointment`; reschedule delegates to
   `reschedule_appointment`. Both execute through Action Engine and the
   existing canonical CRM executor. The Python endpoint no longer owns a
   provider mutation and writes no legacy cancel/reschedule actor marker.
4. The executor repeats the verified channel and appointment-ownership check
   immediately before provider dispatch. A link revocation, tenant mismatch or
   appointment ownership change between ingress and dispatch fails closed.
5. Idempotency is server-derived from tenant, Client, operation and exact
   appointment/change material. `UNKNOWN` remains `UNKNOWN`, returns HTTP 202
   with `retry_allowed=false`, and cannot become a blind retry or direct
   fallback.
6. Production verification was structural/read-only. No real appointment was
   cancelled or rescheduled for smoke proof.

Exact deployed B17 artifacts:

- backend Client channel runtime SHA-256:
  `9a0f03f34d689dfc5c1967e1e87a72d85b4083bcef16f893b469b110bcd875cb`;
- backend Client channel controller SHA-256:
  `092aebab426ed895829e6e214bbb5ac26ee8664c46892388420e2cbea18b9eea`;
- backend CRM service SHA-256:
  `daab700ce0f5be57e85c02ceafd80bc1118ff0714d676c84a07ecf179348ea6d`;
- active webhook SHA-256:
  `4ed1ba82ea61f4131c45c3d47133c2950fefdacf06c5929d4eaa01822db64a40`;
- active Client record validator SHA-256:
  `fbab221191169fdd0e6ec4615f699ce6041a99407a30445d62358481c7f84048`;
- active Client command bridge SHA-256:
  `3b480772474f9b43767c12c750112c94567a972b3b8b8503a5537d10c27f717d`;
- active Package 5 guard SHA-256:
  `a5137ab694ac17d2ee077e975b81542aeaf48fc0d93eeacb68f5b1906cfa1db3`;
- published proxy SHA-256:
  `1538ccf4aef8467a6af3ad4dab4ec17b0ea525d1334087464ef49f9d6043211e`;
- published application SHA-256:
  `fe804992306c50d5e8544a48d59d496c75664dd0af542b13b0e1f7810e59ebc7`.

## Proof and deployment

- targeted B17 Python proof and guard regression: PASS — 35 tests;
- B17 TypeScript service and architecture proof: PASS — 18 tests;
- Prisma validate, lint, application typecheck and script typecheck: PASS;
- build and release-preflight compilation: PASS;
- mandatory deployment regression: PASS — 344 suites / 2829 tests;
- active Package 4 runtime guard: PASS;
- active Package 5 B13–B17 runtime guard: PASS;
- backend candidate startup and production health/readiness: PASS;
- request-only PWA restart and published PHP 8.4 syntax: PASS;
- backend and PWA error-priority logs after activation: `0`;
- candidate port 3199 after deployment: closed;
- real production Client, appointment or provider mutations used for proof:
  `0`.

The active PWA candidate was assembled from the exact B16 production webhook
and only the reviewed B17 function region was replaced. Unrelated local
working-tree changes were not deployed. The published proxy candidate was
assembled from the exact production file and only forwards an existing bearer
for the two B17 actions.

## Fresh Package 5 Final Gate inventory

After structural verification, the Final Gate restarted from the beginning. It
inspected all 13 family foundations, the exact deployed backend release, 537
production TypeScript files, 218 HTTP decorators, 500 Prisma mutation-like
calls, 89 active-root Python files, 69 non-test Python files, 94 non-OPTIONS
Python HTTP routes, 93 distinct handlers, the request-only PWA launcher, the
published proxy/application, active AI tools, background/event paths and
Package 4 cross-package guards.

B17 passed the new Client appointment endpoint scan. The inventory then
stopped at the first new production-reachable blocker, B18. Final aggregate
regression/certification was not started after that finding.

## B18 — active AI/journal appointment owners bypass canonical authority

The exact active PWA `yclients.py` has SHA-256
`31ba0990ed39929b068017fa71c6749043dc54f6887d60bf00cb72d114ccd876`.
It is an older runtime than the repository's canonical source at
`55cf23f02d6e81c91f1f79ae2ef21bda1307f07f6206212b14dd426395617b5a`.
The active artifact still performs direct `self._put(...)` provider writes in:

- `update_booking` at lines 1308–1344;
- `set_record_attendance` at lines 1346–1392;
- `add_services_to_record` at lines 1914–1998;
- `set_record_services` at lines 2000–2098;
- `set_record_duration` at lines 2100–2152;
- `set_record_client_name` at lines 2154–2223.

The observation hook runs only after the provider write. It does not make
Action Engine the execution owner and cannot supply durable idempotency,
`UNKNOWN` or reconciliation for the preceding direct mutation.

Two production-reachable surfaces reach these owners:

1. Published `api-proxy.php case chat` (lines 2567–2575) reaches
   `POST /api/chat`, then the active AI appointment tools. The AI resolves the
   appointment through `database.get_client(user_id)` and a legacy Client
   phone (`claude_ai.py:1590–1695`). `reschedule_booking`, `update_booking` and
   `cancel_booking` use this phone/chat-derived authority at lines 2466–2515.
   Reschedule/cancel reach canonical provider execution only after the wrong
   identity decision; `update_booking` reaches the active direct provider
   writer.
2. Published journal actions reach the active attendance, add-service,
   set-services and Client-data handlers. Those handlers call the active
   `_yc.set_record_*`/`add_services_to_record` methods, whose direct provider
   writes occur outside Action Engine. The registered duration route has the
   same owner.

An isolated reproduction loaded the exact active `yclients.py`, replaced the
network `_put` transport with a recording double and invoked all six methods.
Every method reached one direct provider PUT branch. Network provider calls and
production mutations were both `0`.

The repository already contains bridge-only wrappers for these residual
appointment action classes, but the active production artifact is not that
source. No synchronization or remediation was attempted after the Final Gate
found B18, as required by the STOP boundary.

## Verdict

`B17 PRODUCTION REMEDIATION: PASS`

`B17 VERIFIED ClientChannelLink REQUIRED: YES`

`B17 LEGACY PHONE/SESSION APPOINTMENT AUTHORITY: 0 — TARGETED ENDPOINTS`

`B17 CANCEL/RESCHEDULE EXECUTION OWNER: ACTION ENGINE`

`B17 DIRECT PROVIDER MUTATION BYPASSES: 0 — TARGETED ENDPOINTS`

`B17 UNKNOWN/RECONCILIATION: ENFORCED`

`PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL`

`PACKAGE 5 COMPLETE: NO`

`NEW BLOCKER: B18 — ACTIVE AI/JOURNAL APPOINTMENT IDENTITY AND DIRECT PROVIDER OWNERS`

`AI PHONE/chat_id APPOINTMENT AUTHORITY: PRESENT`

`ACTIVE RESIDUAL APPOINTMENT DIRECT PROVIDER PUT OWNERS: 6`

`PRODUCTION DIRECT BUSINESS/PROVIDER MUTATION BYPASSES: PRESENT — B18`

`LEGACY IDENTITY/PROVIDER OWNERS ACTIVE: PRESENT — B18`

`PACKAGE 5 WAVES COMPLETE: 6/6`

`PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13`

`D1-A…D7-A: ENFORCED OUTSIDE NEW B18 BLOCKER`

`PACKAGE 4 CROSS-PACKAGE GUARDS: PASS`

`PENDING MIGRATIONS: 0`

`SCHEMA DRIFT: NONE`

`REMEDIATION FULL REGRESSION GATE: PASS — 344 SUITES / 2829 TESTS`

`FINAL AGGREGATE REGRESSION GATE: NOT RUN — STOP AT NEW B18 INVENTORY BLOCKER`

`REAL PRODUCTION MUTATIONS FOR FINAL PROOF: 0`

`P4-11 CREATED: NO`

`WAVE 7 CREATED: NO`

`CHAPTER 7 STARTED: NO`

Chapter 6 was not declared complete. The 17 pre-existing local test databases
were not modified or deleted. Owned temporary processes, watchers, browser
processes and temporary databases are zero.

Machine-readable evidence:
`evidence/package5-b17-deployed-final-recheck.json`.
