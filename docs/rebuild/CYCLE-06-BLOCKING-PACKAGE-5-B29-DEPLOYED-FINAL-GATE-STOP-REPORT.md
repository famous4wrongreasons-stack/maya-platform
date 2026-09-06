# Package 5 — B29 deployed; full Final Gate STOP at B30

Accepted checkpoint **01f6d909** / B29 handoff. B29 runtime commit **6b3c32f2**. Production release: `/opt/maya-saas/releases/20260906-p5-b29-6b3c32f2`. Isolated worktree `/tmp/maya-b29-contour` on `contour/b29-remediation`. The main dirty worktree was not modified.

## B29 completion

`POST /api/appointments/:id/cancel` is an initiator only.

Authenticated account → one active versioned `maya_user` ClientChannelLink → exact canonical Client → `Appointment.mayaClientId + tenantId` → existing `crm.appointment.cancel.v1` / `cancel_appointment` → Action Engine.

Missing, revoked and ambiguous bindings fail closed before Action Engine ingress. A verified Client A cannot cancel Client B's Appointment. `Appointment.clientId`, phone and raw chat_id are not cancel authority. Internal-calendar cancel uses the same capability. CRM-backed cancel keeps the accepted B17 UNKNOWN/reconciliation contract. AI `cancelOwnAppointment` uses the same initiator.

No schema, model or new action class was added.

## Proof and deployment

- Existing 79 migrations clean-replayed in owned isolated PostgreSQL `maya_c06_b29_fg` on `127.0.0.1:55501`; schema diff NONE.
- Deployed compiled cancel path matches the candidate: `cancelForClient` uses `clientAppointmentCanceler` and does not call `findForClient` / `updateForClient`.
- The same compiled controller/service/canceler against synthetic PostgreSQL now **rejects** the original B29 fixtures: missing/revoked → `client_link_required`; verified Client A vs Client B appointment → `not_found`. Appointment status stays `confirmed`. Action Engine cancel calls 0. Provider calls 0.
- Mandatory gate **365 suites / 2970 tests PASS**; Prisma validate, project lint, both typechecks and build PASS. First `deploy.sh` Jest process segfaulted locally before upload; the identical suite and the complete deploy script then passed. Production was not touched by the failed attempt.
- Independent structural/read-only verification PASS: backend/PWA active, legacy bot inactive, health/readiness PASS, post-deploy service errors 0, spare port 3199 closed. Public PWA HTTP 200. Live `app.html` / `maya-app.html` hashes match the B28 baseline. No production Client/PII endpoint, real cancellation or provider write invoked for smoke.
- Production pending migrations **0**, drift **NONE**; 79 repository migrations / 82 accounted historical records. Package 4 and Package 5 active PWA/Python guards PASS.

## Fresh full Final Gate — B30 / A18

After production verification a new inventory covered all 13 families. Backend compiled modules **558** and scripts **14** match the candidate. Non-spec TypeScript sources **558**, TS route sites **224**. All 13 accepted Wave foundations remain hash-unchanged. Accepted B26/B27/B28 readers and loyalty/profile services remain hash-unchanged. Production Python/PWA hashes for the previously accepted surfaces match B28; B29 did not deploy Python, PWA or the PHP proxy. These are inventory counts, not aggregate ownership certification.

**Confirmed new blocker: `POST /api/appointments/:id/reschedule`.**

1. `appointments.controller.ts` still passes `user.userId` to `AppointmentsService.rescheduleForClient` as `clientId`. AI `rescheduleOwnAppointment` uses the same method. Both published PWA surfaces contain `/appointments/:id/reschedule` callers; live `app.html` hash is unchanged from B28.
2. `rescheduleForClient` authorizes with `TenantAppointmentRepository.findForClient` / later `updateForClient`. Those keys are tenant + appointment id + optional User field `Appointment.clientId`. They do not require ClientChannelLink or compare `Appointment.mayaClientId`.
3. For an internal appointment the route writes start/status/staff fields directly. No ActionExecution is created. External CRM reschedule still has an Action Engine executor, but the HTTP/AI initiator can reach it after User-association authorization.

### Isolated reproduction

Actual compiled AppointmentsController, AppointmentsService, TenantAppointmentRepository, ClientAppointmentCancelService, UsersService, AuditLogService and the accepted B26 reader run against real isolated PostgreSQL. Synthetic fixtures have active User/tenant membership, valid schema relations and a future internal appointment. The legacy User association points to the authenticated account while the canonical owner is Client B. In the verified case the account has a valid active link to Client A.

| Binding | Accepted B26 appointment read | B29 cancel | B30 reschedule | Durable result |
| --- | --- | --- | --- | --- |
| Missing | Rejects | Rejects (`client_link_required`) | Succeeds | Client B appointment start changes; 0 ActionExecution |
| Revoked | Rejects | Rejects (`client_link_required`) | Succeeds | Client B appointment start changes; 0 ActionExecution |
| Active, verified to Client A | No Client B appointment returned | Rejects (`not_found`) | Succeeds | Client B appointment start changes; 0 ActionExecution |

Client/link/profile/consent state remains unchanged. Inbox delivery is intercepted. Provider calls 0. This is an authenticated Client-authority and internal appointment mutation-owner bypass, not anonymous access.

HTTP create still uses the historical User-shaped input and was **not executed** in this probe. It is not certified here.

**STOP at B30.** No B30 runtime/schema remediation. Aggregate Final Gate FAIL; aggregate regression not rerun after the new blocker. B29 deployment regression remains PASS. Package 5 and Chapter 6 remain incomplete.

## Verdict

```text
B29 PRODUCTION REMEDIATION: PASS
B29 VERIFIED CLIENT CANCEL AUTHORITY: ENFORCED
B29 LEGACY USER ASSOCIATION AS CANCEL AUTHORITY: NO
B29 CROSS-CLIENT APPOINTMENT CANCEL: IMPOSSIBLE IN VERIFIED CANCELER
B29 ACCEPTED CANCEL WITHOUT ActionExecution: 0
B29 CANCEL EXECUTION OWNER: ACTION ENGINE
B29 CLIENT WITHOUT MAYA USER: SUPPORTED
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL
PACKAGE 5 COMPLETE: NO
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13
PRODUCTION CLIENT COMMAND AUTHORITY BYPASSES: PRESENT — B30
PRODUCTION DIRECT BUSINESS MUTATION BYPASSES: PRESENT — B30 INTERNAL RESCHEDULE
LEGACY MUTATING OWNERS ACTIVE: PRESENT — B30
AGGREGATE D1-A…D7-A ENFORCEMENT: NOT CERTIFIED — STOP AT B30
PACKAGE 4 CROSS-PACKAGE GUARDS: PASS
PENDING MIGRATIONS: 0
SCHEMA DRIFT: NONE
REMEDIATION FULL REGRESSION GATE: PASS — 365 SUITES / 2970 TESTS
FINAL AGGREGATE REGRESSION GATE: NOT RUN — STOP AT B30
REAL CANCELLATION MUTATIONS: 0
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

Evidence: [B29 local gate](CYCLE-06-BLOCKING-PACKAGE-5-B29-REMEDIATION-LOCAL-GATE.md), [deployed recheck](evidence/package5-b29-deployed-final-recheck.json), [fresh inventory](evidence/package5-b29-fresh-production-inventory.json), [B29/B30 probe](evidence/package5-b29-b30-final-gate.probe.cjs), [B29/B30 proof](evidence/package5-b29-b30-final-gate.proof.json).

Next cycle: B30 owner instruction/remediation for verified Client authority on appointment reschedule (and mapping/evidence before touching create), then a new all-family Final Gate. Chapter 6 acceptance remains separate after Package 5 completion.
