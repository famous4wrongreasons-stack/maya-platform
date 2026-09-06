# Package 5 — B30 deployed; full Final Gate STOP at B31

Accepted checkpoint **22c00d2d** / B30 handoff. B30 runtime commit **ad1d91b9**. Production release: `/opt/maya-saas/releases/20260906-p5-b30-ad1d91b9`. Isolated worktree `/tmp/maya-b29-contour` on `contour/b29-remediation`. The main dirty worktree was not modified.

## B30 completion

`POST /api/appointments/:id/reschedule` is an initiator only.

Authenticated account → one active versioned `maya_user` ClientChannelLink → exact canonical Client → `Appointment.mayaClientId + tenantId` → existing `crm.appointment.reschedule.v1` / `reschedule_appointment` → Action Engine.

Missing, revoked and ambiguous bindings fail closed before Action Engine ingress. A verified Client A cannot reschedule Client B's Appointment. `Appointment.clientId`, phone and raw chat_id are not reschedule authority. Internal-calendar reschedule uses the same capability. CRM-backed reschedule keeps the accepted B17 UNKNOWN/reconciliation contract. AI `rescheduleOwnAppointment` uses the same initiator.

No schema, model or new action class was added.

## Proof and deployment

- Existing 79 migrations clean-replayed in owned isolated PostgreSQL `maya_c06_b30_fg` on `127.0.0.1:55501`; schema diff NONE.
- Deployed compiled reschedule path matches the candidate: `rescheduleForClient` uses `clientAppointmentRescheduler` and does not call `findForClient` / `updateForClient`.
- The same compiled controller/service/rescheduler against synthetic PostgreSQL now **rejects** the original B30 fixtures: missing/revoked → `client_link_required`; verified Client A vs Client B appointment → `not_found`. Appointment start stays unchanged. Action Engine reschedule calls 0. Provider calls 0. Owned internal reschedule and Client-without-Maya-User go through the existing action.
- Mandatory gate **367 suites / 2990 tests PASS**; Prisma validate, project lint, both typechecks and build PASS.
- Independent structural/read-only verification PASS: backend/PWA active, legacy bot inactive, health/readiness PASS, post-deploy service errors 0, spare port 3199 closed. Public PWA HTTP 200. Python hashes match the B28/B29 baseline. B30 did not deploy Python, PWA or the PHP proxy. No production Client/PII endpoint, real reschedule or provider write invoked for smoke.
- Production pending migrations **0**, drift **NONE**; 79 repository migrations / 82 accounted historical records. Package 4 and Package 5 active PWA/Python guards PASS.

## Fresh full Final Gate — B31 / A18

After production verification a new inventory covered all 13 families. Backend compiled modules **559** and scripts **14** match the candidate. Non-spec TypeScript sources **559**, TS route sites **224**. All 13 accepted Wave foundations remain hash-unchanged. Accepted B26/B27/B28/B29 readers, canceler and loyalty/profile services remain hash-unchanged except the B30 reschedule initiator/executor. Production Python hashes for the previously accepted surfaces match B28/B29. These are inventory counts, not aggregate ownership certification.

**Confirmed new blocker: `POST /api/appointments`.**

1. `appointments.controller.ts` still passes `user.userId` to `AppointmentsService.createForClient` as `clientId`. AI `createOwnAppointment` uses the same method. Published PWA surfaces contain `/appointments` callers.
2. `createForClient` authorizes with `UsersService.getTenantUserOrThrow` (Maya User) and writes through `TenantAppointmentRepository.createForClient`. That keys the new Appointment on User `clientId`. It does not require ClientChannelLink or set `Appointment.mayaClientId` to the verified Client.
3. For an internal appointment the route writes the Appointment directly. No ActionExecution is created. External CRM create still has an Action Engine executor, but the HTTP/AI initiator can reach local persistence after User-association authorization.

### Isolated reproduction

Actual compiled AppointmentsController, AppointmentsService and TenantAppointmentRepository run against real isolated PostgreSQL. Synthetic fixtures have active User/tenant membership, valid schema relations and internal calendar. The three B29/B30 binding cases were reused.

| Binding | Accepted B26 appointment read | B29 cancel | B30 reschedule | B31 create | Durable result |
| --- | --- | --- | --- | --- | --- |
| Missing | Rejects | Rejects | Rejects | Succeeds | New Appointment with `clientId` = authenticated User; `mayaClientId` null; 0 ActionExecution |
| Revoked | Rejects | Rejects | Rejects | Succeeds | Same |
| Active, verified to Client A | No Client B appointment returned | Rejects | Rejects | Succeeds | Same; verified Client A is not the Appointment owner |

Client/link/profile/consent state remains unchanged. Inbox delivery is intercepted. Provider calls 0. This is an authenticated Client-authority and internal appointment mutation-owner bypass, not anonymous access.

B17 channel create, B29 cancel and B30 reschedule were not rewritten in this Final Gate. HTTP preview remains User-shaped and was **not executed**.

**STOP at B31.** No B31 runtime/schema remediation. Aggregate Final Gate FAIL; aggregate regression not rerun after the new blocker. B30 deployment regression remains PASS. Package 5 and Chapter 6 remain incomplete.

## Verdict

```text
B30 PRODUCTION REMEDIATION: PASS
B30 VERIFIED CLIENT RESCHEDULE AUTHORITY: ENFORCED
B30 LEGACY USER ASSOCIATION AS RESCHEDULE AUTHORITY: NO
B30 CROSS-CLIENT APPOINTMENT RESCHEDULE: IMPOSSIBLE IN VERIFIED RESCHEDULER
B30 ACCEPTED RESCHEDULE WITHOUT ActionExecution: 0
B30 RESCHEDULE EXECUTION OWNER: ACTION ENGINE
B30 CLIENT WITHOUT MAYA USER: SUPPORTED
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL
PACKAGE 5 COMPLETE: NO
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13
PRODUCTION CLIENT COMMAND AUTHORITY BYPASSES: PRESENT — B31
PRODUCTION DIRECT BUSINESS MUTATION BYPASSES: PRESENT — B31 INTERNAL CREATE
LEGACY MUTATING OWNERS ACTIVE: PRESENT — B31
AGGREGATE D1-A…D7-A ENFORCEMENT: NOT CERTIFIED — STOP AT B31
PACKAGE 4 CROSS-PACKAGE GUARDS: PASS
PENDING MIGRATIONS: 0
SCHEMA DRIFT: NONE
REMEDIATION FULL REGRESSION GATE: PASS — 367 SUITES / 2990 TESTS
FINAL AGGREGATE REGRESSION GATE: NOT RUN — STOP AT B31
REAL RESCHEDULE MUTATIONS: 0
REAL PROVIDER WRITES: 0
REAL PRODUCTION MUTATIONS FOR FINAL PROOF: 0
PRODUCTION PRIVATE/PII ENDPOINTS INVOKED FOR SMOKE: 0
P4-11 CREATED: NO
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
CHAPTER 6 COMPLETE: NO
PRE-EXISTING LOCAL TEMP/TEST DATABASES: 17
PRE-EXISTING DATABASES TOUCHED: 0
MAIN DIRTY WORKTREE TOUCHED: NO
MAIN PRE-EXISTING DIRTY FILES PRESERVED: YES
OWNED TEMP PROCESSES STILL RUNNING: 0
BACKGROUND WATCHERS LEFT: 0
OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0
OWNED TEMP DATABASES REMAINING: 0
```

Evidence: [B30 local gate](CYCLE-06-BLOCKING-PACKAGE-5-B30-REMEDIATION-LOCAL-GATE.md), [deployed recheck](evidence/package5-b30-deployed-final-recheck.json), [fresh inventory](evidence/package5-b30-fresh-production-inventory.json), [B30 synthetic proof](evidence/package5-b30-reschedule-authority.proof.json), [B31 probe](evidence/package5-b31-appointment-create-authority.probe.cjs), [B31 result](evidence/package5-b31-appointment-create-authority.proof.json).

Next cycle: B31 owner instruction/remediation for verified Client authority on appointment create (HTTP/AI), then a new all-family Final Gate. Chapter 6 acceptance remains separate after Package 5 completion.
