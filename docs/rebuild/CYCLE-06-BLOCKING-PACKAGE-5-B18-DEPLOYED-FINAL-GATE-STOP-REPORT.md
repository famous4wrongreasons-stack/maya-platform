# Package 5 B18 deployed remediation and fresh Final Gate STOP

Status: **B18 all-six production remediation PASS; Package 5 Final
Adversarial Verification FAIL at new B19 chat-booking identity/local-owner
bypass**.

Accepted checkpoint: `9456a552`.

Runtime commit: `76936d0f41ec00deefca1051ab61f61b37ff53bc`.

Backend production release:
`/opt/maya-saas/releases/20260905-p5-b18-76936d0f`.

No schema or migration was added. Production has 78 repository migrations and
81 accepted migration records. Pending migrations are `0`; an independent
Prisma comparison reports `No difference detected`.

## B18 production result

The exact six active residual appointment provider owners are synchronized to
their existing canonical actions:

| Active helper | Canonical action |
|---|---|
| `update_booking` | `set_appointment_services` |
| `set_record_attendance` | `set_appointment_attendance` |
| `add_services_to_record` | `set_appointment_services` |
| `set_record_services` | `set_appointment_services` |
| `set_record_duration` | `set_appointment_duration` |
| `set_record_client_name` | `set_appointment_fields` |

All six helpers are bridge-only. They cannot call `self._put` or a provider
transport directly. Action Engine and the canonical CRM executor own provider
execution. The customer AI update/reschedule/cancel paths require the original
verified channel proof and canonical Client/Appointment authority. The five
legacy journal write handlers that previously reached the six active provider
sites now fail closed and direct staff to the authenticated SaaS journal backed
by `CrmStaffAccess`.

The canonical executor rechecks authority immediately before provider
dispatch. Deterministic identity, retry/concurrency convergence and the
existing `UNKNOWN`/reconciliation boundary remain intact. `UNKNOWN` is not
treated as failure and cannot trigger a blind retry or legacy fallback.

Production verification was structural/read-only. No real appointment or
provider mutation was performed for smoke proof.

Exact deployed B18 artifacts:

- backend Client channel runtime SHA-256:
  `e59cf210bf95bbb24e3d67f458c99886424f124775e68565db38004bec19de08`;
- backend Client channel controller SHA-256:
  `bf7b52c30e67f2d7bc580c7314560d82ef00bc72b14556b2b0f31ef841744e6e`;
- backend CRM service SHA-256:
  `ab0cce869990cf70b0e2c0db35b5b67885587b33bd8f81d22e66427dcfb0c797`;
- active webhook SHA-256:
  `305cd221498f99359cbda8797a5c7a6945ca8f13dcdebeb841e0991d77b622e0`;
- active YClients adapter SHA-256:
  `55cf23f02d6e81c91f1f79ae2ef21bda1307f07f6206212b14dd426395617b5a`;
- active AI runtime SHA-256:
  `a0906f3a6c8cec37bf97961625196f8bc0412b1304138ec3eede1b0d6d8436c9`;
- active Client command bridge SHA-256:
  `c12f00dd6c148f7da441a834928d6017ddb0237c3ee15a3c3f7fc4baf140db51`;
- active Package 5 guard SHA-256:
  `fc167cddd918a3f0118a519400a27034a119a4d1f7118fbd89fb97167bbc4d1e`;
- published proxy SHA-256:
  `1538ccf4aef8467a6af3ad4dab4ec17b0ea525d1334087464ef49f9d6043211e`;
- published application SHA-256:
  `fe804992306c50d5e8544a48d59d496c75664dd0af542b13b0e1f7810e59ebc7`.

## Proof and deployment

- all-six B18 contract inventory: PASS — 6/6 mapped;
- targeted Python B18 proof and guard regression: PASS — 74 tests;
- B18 TypeScript service and architecture proof: PASS — 5 suites / 73 tests;
- Prisma validate, lint, application typecheck and script typecheck: PASS;
- build and release-preflight compilation: PASS;
- mandatory deployment regression: PASS — 345 suites / 2839 tests;
- active Package 4 runtime guard: PASS;
- active Package 5 B13–B18 runtime guard: PASS;
- backend candidate startup and production health/readiness: PASS;
- request-only PWA restart and published edge verification: PASS;
- backend and PWA error-priority logs after activation: `0`;
- candidate port 3199 after deployment: closed;
- real production Client, appointment or provider mutations used for proof:
  `0`.

The first PWA candidate omitted an active request-only launcher compatibility
overlay. The health gate rejected it before backend cutover; the B17 files were
restored immediately and health returned to green. A corrected candidate was
then assembled from the exact active B17 webhook plus only the reviewed B18
handler changes and deployed successfully. No unrelated working-tree changes
were deployed.

## Fresh Package 5 Final Gate inventory

After structural verification, the Final Gate restarted from the beginning. It
registered all 13 family foundations and inspected the exact deployed backend
release, 537 production TypeScript files, 218 HTTP decorators, 502 mutation-like
calls, 89 active-root Python files, 69 non-test Python files, 94 non-OPTIONS
Python HTTP routes, 93 distinct handlers, the request-only PWA launcher, the
published proxy/application, active AI tools, journal/history and
background/event paths, identity/PII/read/provider boundaries and Package 4
cross-package guards.

B18 passed its all-six provider-owner scan. The inventory then stopped at the
first new production-reachable blocker, B19. Final aggregate regression and
certification were not started after that finding.

## B19 / A18 — chat booking uses legacy Client authority and local writer

The published app sends client chat requests to `action=chat_stream` and falls
back to `action=chat`. The published proxy forwards those actions to the active
`POST /api/chat/stream` and `POST /api/chat` routes.

Both active handlers reduce Telegram/Login Widget/phone-session authentication
to a raw `chat_id`. When AI returns a booking request, both pass only that
`chat_id` to `_finalize_booking_for_chat`.

The finalizer then:

1. resolves a legacy SQLite Client with `database.get_client(chat_id)`;
2. treats the legacy Client name and phone as appointment presentation and
   reads legacy notification preferences by the same `chat_id`;
3. invokes the bridge-only `create_appointment` path with those values, but
   never proves an active tenant-qualified `ClientChannelLink` or exact
   canonical Client;
4. after success, writes a legacy booking fact with `database.save_booking`;
5. can additionally enter a legacy loyalty backfill/redemption branch when AI
   requests point payment.

The provider execution owner in this path is Action Engine, so B18's direct
provider-owner remediation remains valid. The ingress identity decision and
post-success business/value mutations remain outside the approved canonical
Client, appointment and Package 4 boundaries. A valid chat authentication or
legacy consent row is not proof of canonical Client authority.

Exact active evidence:

- `_finalize_booking_for_chat`: lines 6823–6926, SHA-256
  `77966045da2d4e68a4dd955d5bb190d6c08b96d199f6879e9e3385fefd9cd6b1`;
- non-stream handler finalizer call: line 9431;
- stream handler finalizer call: lines 10136–10137;
- route registrations: lines 12834 and 12836;
- published proxy forwarding: lines 2567–2599 and 2608–2644;
- published app stream/fallback calls: lines 16035 and 16127.

An isolated reproduction loaded the exact active finalizer and replaced its
database and appointment transports with recording doubles. A synthetic raw
`chat_id` caused, in order, a legacy Client lookup, legacy preference lookup,
appointment command and legacy booking write. No `ClientChannelLink` proof was
used. Network calls, provider calls and production mutations were all `0`.

No B19 remediation was attempted after the Final Gate found the blocker, as
required by the STOP boundary.

## Verdict

`B18 PRODUCTION REMEDIATION: PASS`

`B18 ACTIVE AI/JOURNAL DIRECT PROVIDER OWNERS: 0`

`B18 PROVIDER SITES PROVEN: 6/6`

`B18 UNKNOWN/RECONCILIATION: ENFORCED`

`B18 BLIND RETRY AFTER UNKNOWN: NO`

`ACTIVE AI/JOURNAL INCLUDED IN ARCHITECTURAL RATCHETS: YES`

`PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL`

`PACKAGE 5 COMPLETE: NO`

`NEW BLOCKER: B19 / A18 — CHAT BOOKING LEGACY CLIENT AUTHORITY AND LOCAL WRITER`

`B19 VERIFIED ClientChannelLink REQUIRED: NO`

`B19 RAW chat_id CLIENT AUTHORITY: PRESENT`

`B19 LEGACY BOOKING FACT WRITERS: PRESENT`

`B19 OPTIONAL LEGACY LOYALTY MUTATION PATH: PRESENT`

`PRODUCTION DIRECT BUSINESS/VALUE MUTATION BYPASSES: PRESENT — B19`

`LEGACY IDENTITY FALLBACKS: PRESENT — B19`

`LEGACY MUTATING OWNERS ACTIVE: PRESENT — B19`

`PACKAGE 5 WAVES COMPLETE: 6/6`

`PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13`

`D1-A…D7-A: ENFORCED OUTSIDE NEW B19 BLOCKER`

`PACKAGE 4 AUTOMATED CROSS-PACKAGE GUARD: PASS`

`PENDING MIGRATIONS: 0`

`SCHEMA DRIFT: NONE`

`REMEDIATION FULL REGRESSION GATE: PASS — 345 SUITES / 2839 TESTS`

`FINAL AGGREGATE REGRESSION GATE: NOT RUN — STOP AT NEW B19 INVENTORY BLOCKER`

`REAL PRODUCTION MUTATIONS FOR FINAL PROOF: 0`

`P4-11 CREATED: NO`

`WAVE 7 CREATED: NO`

`CHAPTER 7 STARTED: NO`

Chapter 6 was not declared complete. The 17 pre-existing local test databases
were not modified or deleted. Owned temporary processes, watchers, browser
processes and temporary databases are zero.

Machine-readable evidence:
`evidence/package5-b18-deployed-final-recheck.json`.
