# Package 5 — B25 deployed; full Final Gate STOP at B26

Owner checkpoint **43007f03** accepted D1-A / D2-A. Runtime commit **c22668ac6f5a61ddf4db75b08265a21e8fada405**. Production release: `/opt/maya-saas/releases/20260906-p5-b25-c22668ac`.

## B25 completion

The appointment reminder scheduler uses exact `Appointment.mayaClientId + tenantId`, never CRM phone or User.phone. Client identity, tenant access and communication policy are checked independently. No Client/link creation or repair is performed by the reminder. A Client without Maya User is supported through verified Telegram or Client Web Push.

The existing `deliver_appointment_reminder` ActionExecution fixes the selected primary route and device plan before the first delivery effect. Inbox → Telegram → Web Push-only is deterministic; competing planners reload the winning encrypted immutable input. APNs/Web Push children belong to the same logical reminder. There is no primary fallback on UNKNOWN, deterministic failure or revocation, and Web Push-only has no fabricated parent receipt. Dispatch rechecks current Appointment owner/status/schedule/window, tenant access, consent/preferences and exact verified recipient. Cancelled/rescheduled/expired occurrences fail closed. Device endpoints remain bound to the frozen plan, with maximum five Web Push devices.

Client NULL/absent reminder hours inherit tenant policy; explicit 1..48 hours replace its list. Zero is invalid; Client reminder=false and tenant disable prevent sending. The current policy version has at most four occurrences (one with explicit Client hours). Private content is minimized to own appointment time and existing record navigation, after recipient verification. No schema/model/action class was added. B24, B9, Waves1–6, P02/P03 and the accepted Package1–4 foundations are preserved.

## Verification

- Clean replay of 79 migrations on a newly owned isolated PostgreSQL database, schema diff NONE.
- 20 PostgreSQL executable adversarial/concurrency cases PASS, including real canonical ActionExecution/Communication Delivery with synthetic transports; 6 targeted suites / 47 tests PASS.
- Mandatory deployment gates all PASS: Prisma validate, lint, both typechecks, **358 suites / 2924 tests**, build, release preflight, expected pending0, structural drift check, spare-port readiness, cutover.
- Production health/readiness PASS; backend and request-only Python PWA active; post-start service errors0. Spare smoke process reaped/port3199 closed. No real reminder, Client, provider or value operation was initiated for proof.
- Fresh post-deploy preflight: pending0, drift NONE; 79 repo migrations / 82 accounted historical records. Package4 and accepted active Package5 Python/PWA guards PASS.
- All **549 deployed compiled backend modules** match the gated candidate. All 13 accepted wave foundation source and deployed hashes remain unchanged.

## Fresh full Final Gate: B26 / A18

The full gate restarted after B25 production verification. It inventoried all13 families and backend, active PWA/proxy, realtime/voice, cabinet, chat/stream/history, AI/journal, background/event paths and Communication Delivery. Inventory: 89 Python modules (69 production), 100 Python routes, 549 production TS sources/compiled modules, 221 TS route sites, 14 compiled scripts, complete mutation-like and identity/projection indices. Active PWA/proxy hashes were obtained again; this was not just a B25 recheck.

**Confirmed new blocker: `GET /api/appointments/my`.**

1. `AppointmentsController.listMyAppointments` forwards the authenticated User ID. `AppointmentsService.listClientAppointments` (`appointments.service.ts:420`) loads that account and uses `profile.phone` (`:431`) to fetch CRM appointments.
2. `CrmService.getClientAppointments` → YClients adapter (`yclients-crm.adapter.ts:893`) selects the provider Client by phone. No verified ClientChannelLink or exact canonical Appointment Client authority is required.
3. The GET invokes `syncExternalClientAppointments` (`appointments.service.ts:453`) → `TenantAppointmentRepository.createForClient/updateForClient`. Direct Prisma writes are at `tenant-appointment.repository.ts:75,149,184`. `repairExternalMirror` can attach the requesting User to an existing mirror whose account association is NULL, without checking its distinct `mayaClientId`.
4. The response serializes private appointment details (time, services, staff, price/status and provider metadata). Active PWA widgets contain `/appointments/my` callers on both deployed surfaces. The controller/module and service/repository compiled artifacts match production.

A synthetic reproduction runs the **real compiled controller, service and repository**, with captured in-memory Prisma writes and synthetic CRM data. With zero verified links, two GET calls produce one create + one update for a missing mirror, or two updates for a pre-existing mirror with another canonical Client and no User association. Both cases return private appointment details and set the account association; canonical Client/link/consent reads remain0. It does not call a production PII endpoint, real database or provider. Existing authenticated same-tenant account/booking access are prerequisites; anonymous or cross-tenant HTTP access is not claimed. The database's account membership guard does not establish business Client authority.

**STOP at B26 as instructed.** B26 was not remediated. No additional final aggregate regression is claimed after discovery; the deployment regression above is PASS. Family inventory13/13 does not certify all production paths canonical. Package5 and Chapter6 are not declared complete.

## Verdict

```text
B25 PRODUCTION REMEDIATION: PASS
B25 PHONE MATCH AS REMINDER AUTHORITY: 0
B25 CANONICAL APPOINTMENT CLIENT AUTHORITY: ENFORCED
B25 CLIENT WITHOUT MAYA USER: SUPPORTED
B25 DETERMINISTIC PRIMARY ROUTE: ENFORCED
B25 CROSS-CHANNEL RETRY AFTER UNKNOWN: NO
B25 CLIENT OVERRIDE REPLACES TENANT SCHEDULE: YES
B25 DUPLICATE LOGICAL REMINDER POSSIBLE: NO
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL
PACKAGE 5 COMPLETE: NO
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13
PRODUCTION DIRECT BUSINESS MUTATION BYPASSES: PRESENT — B26
LEGACY IDENTITY/PROJECTION FALLBACKS: PRESENT — B26
LEGACY MUTATING OWNERS ACTIVE: PRESENT — B26
PACKAGE 4 CROSS-PACKAGE GUARDS: PASS
PENDING MIGRATIONS: 0
SCHEMA DRIFT: NONE
REMEDIATION FULL REGRESSION GATE: PASS — 358 SUITES / 2924 TESTS
FINAL AGGREGATE REGRESSION GATE: NOT RUN — STOP AT B26
REAL PRODUCTION MUTATIONS FOR FINAL PROOF: 0
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

Evidence: [local proof](evidence/package5-b25-local-proof.json), [deployed recheck](evidence/package5-b25-deployed-final-recheck.json), [fresh full inventory](evidence/package5-b25-fresh-production-inventory.json), [B26 probe](evidence/package5-b26-appointments-read-authority.probe.cjs), [B26 result](evidence/package5-b26-appointments-read-authority.proof.json). The owned DB was dropped, isolated PostgreSQL stopped and data directory removed. No browser/watcher was started. Unrelated processes and all17 old databases were preserved.

Next controlled cycle is B26 contract/authority remediation after owner instruction, then a new all-family Final Gate. No Wave7/P4-11/Chapter7. Chapter6 Final Completion / Acceptance remains a separate gate after Package5 PASS.
