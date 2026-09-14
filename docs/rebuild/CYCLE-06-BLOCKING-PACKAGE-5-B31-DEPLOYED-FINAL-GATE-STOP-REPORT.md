# Package 5 — B31 production PASS; Final Gate STOP at B32

Approved Option A checkpoint: `724d3ef6`. Schema: `05ea5c25`.
Production migration evidence: `25119d99`. Runtime: `2aeaacff`.
Active release: `/opt/maya-saas/releases/20260906-p5-b31-2aeaacff`.

## B31 completed scope

HTTP `POST /api/appointments` and AI `createOwnAppointment` now share:

authenticated account → existing verified Client binding → tenant-qualified
normalized booking intent → immutable key binding → existing
`crm.appointment.create.v1` / `create_appointment` → Action Engine.

Both internal-calendar and CRM-backed outcomes carry exact
`Appointment.mayaClientId + tenantId`. User/legacy `Appointment.clientId` is
not Client ownership authority. Missing/revoked/wrong Client/tenant contexts
fail before execution creation. A canonical Client without Client.userId is
supported through an existing verified account binding. Route and AI perform
no direct Appointment/provider writes or legacy fallback.

The approved versioned canonical HMAC covers business semantics after server
normalization. Every first/secondary key is durably bound to its immutable
intent and existing execution. Same key + changed intent returns
`IDEMPOTENCY_CONFLICT`; conflict creates no new execution, Appointment or
provider operation. Same-intent retries, independent-process concurrency,
crash/restart, terminal replay and provider UNKNOWN/reconciliation were proven
against real owned PostgreSQL with synthetic external I/O. No fake historical
fingerprint/backfill was performed. The new binding applies to new B31 create
intents after cutover, not historical executions or unrelated action classes.

[Local gate](CYCLE-06-BLOCKING-PACKAGE-5-B31-IMMUTABLE-IDEMPOTENCY-LOCAL-GATE.md)
and [runtime proof](evidence/package5-b31-immutable-idempotency.proof.json):
targeted 6 suites / 68 tests; appointment/booking 33 / 317; architecture 84 / 483;
lint, both typechecks, build, Prisma validation and structural diff PASS.
Mandatory backend and deployment regressions each passed **373 suites / 3046
tests**. The earlier local lint findings were corrected before deployment.

The unchanged documented `deploy/vps/deploy.sh` performed its complete gate,
fresh release dependency installation, preflight, empty migration stage,
candidate readiness, activation and owned smoke-process cleanup. Schema:
exactly the approved 1 model / 9 persisted columns / 0 new action classes;
80 repository migrations / 83 accounted historical entries; pending 0; drift
NONE. The approved applied migration checksum was not changed.

[Independent production recheck](evidence/package5-b31-deployed-recheck.json):
577/577 compiled artifacts match the gated build. Backend/PWA active; legacy
bot inactive; health/readiness PASS; service error-priority entries 0; spare
port 3199 closed; public PWA 200. B29 cancel, B30 reschedule and accepted reader
artifacts are unchanged. Eight accepted Python surface hashes match B30.
Python/PWA were not deployed by B31. No production private Client endpoint,
booking command, actual Appointment create or provider mutation was invoked
for smoke.

## Fresh full Package 5 Final Gate

The gate restarted after B31 production PASS. Fresh source/deployment inventory
covered all 13 families, all 561 non-spec source/compiled backend modules, 14
compiled scripts plus two tooling artifacts, 224 HTTP decorators and 516
mutation-like call sites. The latter is a fresh AST call-site inventory count,
not a count of bypasses or directly comparable to previous regex counts.
Accepted Wave foundations have no source changes since B30; registration
counts remain 6 / 13 / 8 / 12 / 1 and the six AC6 classes.

| Family | Existing owner inspected in the inventory |
| --- | --- |
| A15 | Wave 3 external staff schedule command/executor |
| A16 | Wave 2 CRM staff access |
| A17 | Wave 3 CRM lifecycle and source fact boundaries |
| A18 | Wave 3 Client profile/consent; account/channel read and appointment paths |
| A22 | Wave 1 settings/preferences |
| A23 | Wave 1 operational work; inbox projection/protocol |
| A25 | Wave 2 security commands; AC3 auth protocol |
| A26 | Wave 2 lifecycle and canonical trial bootstrap |
| reduced A27 | Wave 4 ordinary inventory and review facts |
| A28 | Wave 4 internal-calendar configuration/object storage |
| A29 | Wave 5 recovery corrections/facts |
| A30 | Approved AC6 maintenance coordinator and policy |
| A31 | Event store, reconciliation, mirror and recovery fact plane |

Active Python inventory: 90 root modules / 70 non-test modules. Read-only AST
inspection confirms both published chat routes reach the same finalizer and
`appointment-create` bridge command. All three selected function source
segments match the repository. Full deployed file hashes match the accepted
B30 baseline. No Python application module was imported to perform this audit.

Inventory coverage is **13/13**; it is not aggregate certification. The first
new confirmed blocker below stops the remaining aggregate adversarial/gate
steps. The preceding B31 mandatory regression PASS is not relabelled as a
Package 5 Final Gate PASS.

## Exact B32 / A18 — verified channel authority is not admitted by create policy

Production path:

`POST /api/chat` or `/api/chat/stream` → `_finalize_booking_for_chat` →
`POST /api/internal/legacy/client-commands/appointment-create` →
`LegacyClientChannelController.command` →
`ClientChannelRuntimeService.createClientAppointment` → existing canonical
create executor/policy/kernel.

1. The controller verifies the bridge credential and exact integration/tenant,
   then enters `runAsPublicTenant`, which deliberately has no `userId`.
2. The real channel authenticator verifies signed Telegram credentials. The
   runtime resolves one active versioned ClientChannelLink, exact Client,
   canonical consent and exact account/CRM contact. These checks succeed.
3. The channel initiator supplies `sourceType: authenticated_request` and a
   verified-link source reference. `CrmService.appointmentActionRequest` adds
   `actorUserId` only from the current tenant context; here it is absent.
4. The create policy does not belong to `verifiedClientChannelCapability`.
   Its optional trusted-service sources explicitly exclude
   `authenticated_request`. With no actor, the real policy resolves
   **DENY / actor_required**. The kernel creates a terminal **NOT_EXECUTED**
   execution with `policy_denied`; the provider executor never dispatches.
5. The channel response still has `accepted: true`, but its execution is
   NOT_EXECUTED. The Python finalizer reports the non-success explanation.
   Retrying reaches the same denied execution. Valid verified channel booking
   therefore cannot complete through this published route.

[Reproduction](evidence/package5-b32-channel-create-authority.probe.cjs) uses
the actual compiled bridge controller, real bridge secret/integration resolver,
real signed Telegram authenticator, real verified Client resolver, real policy,
kernel, Prisma and PostgreSQL. Only fixture credentials and external provider/
catalog I/O are synthetic; no policy or executor result is mocked. The same
case is proven for a Client with a Maya User and a Client without one.

| Fixture | Verified channel / Client / consent / entitlement | Result | Appointment / provider creates |
| --- | --- | --- | --- |
| Client with optional Maya User | PASS | DENY; actor_required; NOT_EXECUTED | 0 / 0 |
| Client without Maya User, exact CRM link | PASS | DENY; actor_required; NOT_EXECUTED | 0 / 0 |

Each fixture creates one denied ActionExecution; first-key replay and a second
equivalent key reuse it. This is a canonical authority propagation/eligibility
gap, not a demonstrated anonymous access or provider-write bypass. No affected
production population was queried.

The initial isolated service-only audit could exercise the old secondary-alias
gap when an authenticated User context was supplied. The real published
controller removes that context and denies before provider dispatch. Therefore
**a production channel duplicate-provider exploit is not claimed** from that
service-only result. The committed B32 proof is the actual controller result.
The channel's separate old scope and absent immutable binding remain evidence
to consider in a separately authorized repair; they were not changed here.

Existing B19 unit tests mock `executeCreateAppointmentWithReceipt`, so they
cannot reveal this real canonical-policy denial. No guard was weakened or test
changed to make the Final Gate pass. No B32 runtime/schema/actor-policy change
was implemented. A future B32 cycle must resolve the verified Client → existing
create-policy authority contract; it must not manufacture a Maya User or mark
the request as a trusted service merely to bypass the policy. Preserve the
B31 immutable-intent and UNKNOWN rules when deciding how that channel enters
the shared create flow.

## STOP and hygiene

All three owned synthetic databases were dropped, the owned PostgreSQL process
stopped, data/socket removed and port 55501 closed. The owned remote schema
tooling stage was removed. No owned watcher or browser process was created.
Main checkout changes were not edited/staged/reset/stashed/cleaned; its original
24 status entries remain. The 17 pre-existing test databases were not touched.

```text
B31 PRODUCTION REMEDIATION: PASS
B31 IMMUTABLE IDEMPOTENCY BINDING: ENFORCED — HTTP/AI CREATE
B31 SAME KEY + CHANGED INTENT: IDEMPOTENCY_CONFLICT
B31 DUPLICATE APPOINTMENT FROM SAME IDEMPOTENCY IDENTITY: NO IN VERIFIED B31 FLOW
B31 VERIFIED CLIENT CREATE AUTHORITY: ENFORCED
B31 Appointment.mayaClientId: REQUIRED
B31 CREATE EXECUTION OWNER: ACTION ENGINE
B29 PRODUCTION REMEDIATION: PASS
B30 PRODUCTION REMEDIATION: PASS
PACKAGE 4 COMPLETE: YES
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL — B32
ACTIVE BLOCKER: B32 / A18 CHANNEL CREATE ACTOR POLICY
CLIENT APPOINTMENT MUTATION SURFACE COVERAGE: NOT COMPLETE — B32 CHANNEL PATH
PACKAGE 5 COMPLETE: NO
AGGREGATE D1-A…D7-A CERTIFICATION: NOT COMPLETED — STOP AT B32
FINAL AGGREGATE REGRESSION: NOT RUN AFTER B32
PENDING MIGRATIONS: 0
SCHEMA DRIFT: NONE
FAKE HISTORICAL BACKFILL: 0
B32 IMPLEMENTATION / DEPLOYMENT: NOT STARTED
REAL PRODUCTION APPOINTMENT CREATES FOR PROOF: 0
REAL PRODUCTION PROVIDER WRITES FOR PROOF: 0
PRODUCTION PRIVATE/PII ENDPOINTS INVOKED FOR SMOKE: 0
MAIN DIRTY WORKTREE TOUCHED: NO
MAIN PRE-EXISTING DIRTY FILES PRESERVED: YES
PRE-EXISTING DATABASES TOUCHED: 0
OWNED TEMP PROCESSES STILL RUNNING: 0
BACKGROUND WATCHERS LEFT: 0
OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0
OWNED TEMP DATABASES REMAINING: 0
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
CHAPTER 6 COMPLETE: NO
```

Evidence: [deployed recheck](evidence/package5-b31-deployed-recheck.json),
[all-family inventory and exact runtime hashes](evidence/package5-b31-fresh-final-inventory.json),
[active Python inventory](evidence/package5-b31-final-production-python-inventory.json),
[B32 result](evidence/package5-b32-channel-create-authority.proof.json).
Commit/push this report, evidence and remainder, then STOP. Chapter 6 acceptance
remains a separate cycle after a future clean Package 5 Final Gate.
