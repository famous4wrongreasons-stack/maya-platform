# Package 5 — B28 deployed; full Final Gate STOP at B29

Accepted checkpoint **866181f7** / B27 production baseline. B28 runtime commits **80b6d81b**, **c738bc1b**. Production release: `/opt/maya-saas/releases/20260906-p5-b28-c738bc1b`.

## B28 completion

The shared `ClientProfileReadService` requires authenticated account/channel → one active versioned tenant-qualified ClientChannelLink → exact canonical Client → `CustomerProfile.clientId == Client.id`. It rejects missing, revoked, ambiguous, merged/held and wrong-tenant identities. PostgreSQL READ ONLY / RepeatableRead covers identity validation and profile selection. A missing exact profile returns the existing nullable summary without creation or fallback.

`/api/customers/me/profile`, customer-portal's profile section and User profile-linked metadata use this boundary. Existing staff profile views retain canonical staff membership/role authority and require the target's verified Client binding. Profile command initiators resolve the verified target before delegating to existing canonical executors. User.phone, bare User association, raw Telegram identity and delivery address are not Client authority.

Client without Maya User is supported through the signed-channel bridge and verified ClientChannelLink. Own summary does not select/decrypt habits; B7 habit reads retain their separate verified Client boundary and limits. The architectural guard scans production CustomerProfile query methods, pins verified presentation owners/exact Client predicates and rejects read mutations/fallbacks. Existing named canonical command/delivery consumers remain separately guarded; no whole-file writer exemption was introduced.

No schema/model/action class, provider, historical backfill or Python/PWA/proxy/iOS change was needed. Accepted B5/B6/B7/B26/B27 runtime readers and Wave foundations remain unchanged by hash.

## Proof and deployment

- Existing79 migrations clean-replayed in owned isolated PostgreSQL; schema diff NONE.
- **27 PostgreSQL scenarios PASS**, actual compiled controllers/services and real signed channel authentication with synthetic fixtures: A/B ownership, missing/revoked/ambiguous/wrong-tenant bindings, duplicate phone, mismatched historical User association, guest Client, portal parity, staff authority, B7 encrypted preferences and20 concurrent reads. Each read compares Client/Profile/link/consent and other business state before/after: byte-equivalent. PostgreSQL READ ONLY rejects a restored writer.
- Targeted **5 suites /52 tests PASS**. Initial deployment stopped before upload at eight formatting diagnostics in two test fixtures. Narrow formatting correction changed no semantics; the complete deployment gate was then rerun.
- Mandatory gate **362 suites /2952 tests PASS**; Prisma validate, project lint, production/script typechecks and build PASS. Deployment preflight, no-op migration gate, spare-port health and production switch PASS.
- Independent structural/read-only verification PASS: backend/PWA active, legacy bot inactive, PWA request-only, health/readiness PASS, post-deploy service errors0, spare port closed, PHP proxy syntax PASS, public static PWA HTTP200. No production Client/PII endpoint invoked for smoke.
- Production pending migrations **0**, drift **NONE**;79 repository migrations/82 accounted historical records. Package4 active PWA/cross-package guards PASS. Real production business/provider proof mutations0.

## Fresh full Final Gate — B29 / A18

After production verification a new inventory covered all13 families: **90 Python modules /70 production**,100 Python routes,**556 source/deployed backend modules**,224 TS route sites,14 compiled scripts,517 TS and619 Python mutation-like sites, private projection indices and freshly fetched active PWA/proxy. Backend, profile/portal, loyalty, appointments, realtime/voice, cabinet, chat/history, AI/journal, schedulers/workers and Communication Delivery were included. All556 deployed modules and14 scripts match the candidate; all13 accepted Wave foundations remain unchanged. These are inventory counts, not aggregate ownership certification.

**Confirmed new blocker: `POST /api/appointments/:id/cancel`.**

1. `appointments.controller.ts:64-75` passes `user.userId` to `AppointmentsService.cancelForClient` as `clientId`. AppointmentsModule is registered in AppModule. Both deployed PWA surfaces call the endpoint; app.html:10556 and13246 include active callers.
2. `appointments.service.ts:426-437` calls `TenantAppointmentRepository.findForClient`; `tenant-appointment.repository.ts:129-139` checks tenant, appointment id and the optional **User** field `Appointment.clientId`. It does not require ClientChannelLink or compare the real canonical `Appointment.mayaClientId`.
3. The schema explicitly distinguishes these fields (`schema.prisma:2533-2555`,2603-2610): `clientId` is an account/cabinet association; `mayaClientId` is the tenant-qualified canonical Client. Historical account association does not prove current Client authority.
4. For an internal appointment, `appointments.service.ts:491-497` directly calls `updateForClient`, which writes status by that User-qualified key (`tenant-appointment.repository.ts:142-159`). No ActionExecution or verified Client check owns this branch.

### Isolated reproduction

Actual compiled AppointmentsController, AppointmentsService, TenantAppointmentRepository, UsersService, AuditLogService and the accepted B26 reader run against real isolated PostgreSQL. Synthetic fixtures have active User/tenant membership, valid schema relations and future appointments. The legacy User association points to the authenticated account while the canonical appointment owner is Client B. In the verified case the account has a valid active link to Client A. Constraints and database result identities were not altered.

| Binding | Accepted B26 appointment read | Cancel command | Durable result |
| --- | --- | --- | --- |
| Missing | Rejects | Succeeds | Client B appointment becomes canceled |
| Revoked | Rejects | Succeeds | Client B appointment becomes canceled |
| Active, verified to Client A | No Client B appointment returned | Succeeds | Client B appointment becomes canceled |

All3 cases create a normal cancellation audit row but **zero ActionExecution rows**. Client/link/profile/consent state remains unchanged. Repeat cancellation rejects after the first unauthorized business change. Catalog reads and inbox delivery are intercepted; provider calls0. An initial fixture setup used nonexistent User.name and failed before invoking the controller; using the existing encryptedName field allowed the complete3-case reproduction. No runtime was changed for this probe.

This is a **Client-authority and internal appointment mutation-owner bypass**, not anonymous access. Normal authentication, tenant membership and booking-feature prerequisites still apply; no real affected population is asserted. External CRM cancellation, rescheduling and creation were not executed. Adjacent create/reschedule methods use the same User-shaped input and require reconstruction in the next cycle; they are not certified or repaired here. Canonical provider executors and accepted B26/B27/B28 readers were not reopened.

**STOP at B29**, as instructed. No B29 runtime/schema remediation. Aggregate Final Gate FAIL; aggregate regression not rerun after the new blocker. B28 deployment regression remains PASS. Package5 and Chapter6 remain incomplete.

## Verdict

```text
B28 PRODUCTION REMEDIATION: PASS
B28 VERIFIED CLIENT PROFILE AUTHORITY: ENFORCED
B28 USER-ONLY CUSTOMERPROFILE AUTHORITY: 0
B28 CROSS-CLIENT CUSTOMERPROFILE PROJECTION: REJECTED BY VERIFIED READER
B28 MISSING/REVOKED LINK PROFILE DISCLOSURE: 0
B28 CUSTOMER PROFILE READ MUTATIONS: 0
B28 CLIENT WITHOUT MAYA USER: SUPPORTED
CUSTOMER PROFILE ENDPOINT AUTHORITY PARITY: YES
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL
PACKAGE 5 COMPLETE: NO
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13
PRODUCTION CLIENT COMMAND AUTHORITY BYPASSES: PRESENT — B29
PRODUCTION DIRECT BUSINESS MUTATION BYPASSES: PRESENT — B29 INTERNAL CANCELLATION
LEGACY MUTATING OWNERS ACTIVE: PRESENT — B29
AGGREGATE D1-A…D7-A ENFORCEMENT: NOT CERTIFIED — STOP AT B29
PACKAGE 4 CROSS-PACKAGE GUARDS: PASS
PENDING MIGRATIONS: 0
SCHEMA DRIFT: NONE
REMEDIATION FULL REGRESSION GATE: PASS — 362 SUITES / 2952 TESTS
FINAL AGGREGATE REGRESSION GATE: NOT RUN — STOP AT B29
REAL PRODUCTION MUTATIONS FOR FINAL PROOF: 0
PRODUCTION PRIVATE/PII ENDPOINTS INVOKED FOR SMOKE: 0
P4-11 CREATED: NO
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
PRE-EXISTING LOCAL TEMP/TEST DATABASES: 17
PRE-EXISTING DATABASES TOUCHED: 0
OWNED TEMP PROCESSES STILL RUNNING: 0
BACKGROUND WATCHERS LEFT: 0
OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0
OWNED TEMP DATABASES REMAINING: 0
```

Evidence: [B28 local proof](evidence/package5-b28-verified-profile-read.proof.json), [deployed recheck](evidence/package5-b28-deployed-final-recheck.json), [fresh inventory](evidence/package5-b28-fresh-production-inventory.json), [B29 executable probe](evidence/package5-b29-appointment-command-authority.probe.cjs), [B29 result](evidence/package5-b29-appointment-command-authority.proof.json).

Owned database maya_c06_b28_owned was dropped after both proofs; PostgreSQL PID41079 stopped, port55498 closed and its owned data directory removed. No watcher/browser started. All17 pre-existing databases and unrelated processes untouched. Next: B29 owner instruction, remediation and a fresh all13-family Final Gate. Chapter6 acceptance is separate after Package5 completion.
