# Package 5 B24 deployed — full Final Gate STOP at B25 / A18

**B24 production remediation: PASS. Package 5 Final Adversarial Verification: FAIL. Package 5 complete: NO.**

Owner-approved checkpoint: `e068772c`. Runtime commit: `9c208d2bc95e8f94b35ca3ab752111028e80a74c`. Production release: `/opt/maya-saas/releases/20260906-p5-b24-9c208d2b`. Waves 1–6 and earlier remediation baselines remain accepted; no wave was reopened.

## B24 implementation and production result

Implemented one approved model, `ClientWebPushEndpoint`, with no new business action class or historical backfill. Registration/unsubscribe require an active, verified, tenant-qualified ClientChannelLink. Endpoint identity uses scoped HMAC; full endpoint/key material is encrypted. Endpoint/browser permission, phone, raw chat ID and legacy session never establish Client authority.

Server and PostgreSQL guards enforce five active endpoints maximum, exact retry convergence, no silent reassignment/eviction, owner-only unsubscribe, explicit replacement and immutable historical episodes. Only an exact durable permanent provider result invalidates its endpoint. Temporary/UNKNOWN outcomes do not revoke or authorize blind retry. Registration creates no Client, link or consent.

Web Push is a transport inside existing Communication Delivery. Bounded per-device outcomes belong to one logical intent. Its production entry uses an accepted canonical receipt and verified Client recipient; consent/preferences, current link/endpoint eligibility, deadline and tenant status gate dispatch. An old receipt cannot use a later Client binding or devices registered after its original intent. An initially empty device set remains empty on retry. B9 exact wanted-slot delivery stays separate and unchanged.

Legacy SQLite push registry/direct Python Web Push senders were removed or retired. Active Python bridge, both published PWA bundles and proxy use canonical registration/unsubscribe with explicit failure/limit responses. UI reports activation only after server confirmation; unsubscribe does not silently register again. Narrow iOS mirror/sync completed without staging unrelated work. Existing VAPID identity was reused without rotation; credential values are absent from evidence.

Migration `20260906120000_client_web_push_endpoint_v1` was applied after additive/expected-only preflight, approved baseline drift and health checks. Its new table has zero rows in the post-deploy aggregate check. Structural schema comparison after migration is now mandatory before activation, in addition to migration-history agreement.

The initial B24 candidate was deployed at `4e696272`. Final review identified historical-retry retargeting edge cases, fixed at `9c208d2b` within the same approved contract; the final candidate repeated all deployment gates and deployed successfully. Earlier staging was deliberately stopped before migration to add the structural drift gate. No failed gate was bypassed.

## Verification

- PostgreSQL clean replay and adversarial/security/concurrency proof: **25 cases PASS**, drift NONE. Includes 12 concurrent registrations bounded to five, lifecycle/UNKNOWN/privacy/isolation, five-device logical delivery and historical retry boundaries.
- Targeted architecture/transport/service tests: **20 PASS**, including Python/PWA checks and negative ratchets. Gated proxy/PWA overlays and isolated handler behavior passed.
- Final mandatory deployment: **356 suites / 2904 tests PASS**. Prisma validate, lint, application/script typechecks, build, release preflight and spare-port readiness passed sequentially.
- Production: **79 repository migrations / 82 accounted-for historical records; pending 0; drift NONE**. Health/readiness PASS; service errors 0; intended backend/PWA services active; request-only Python PWA preserved. Spare-port process reaped and port 3199 closed.
- All **545 deployed backend module hashes** match the compiled candidate; Python/PWA/proxy hashes match gated overlays. PHP syntax, public PWA availability, B13–B24 runtime protection and Package 4 cross-package guard pass.
- Mobile fixture inspected at 390×844, including limit/unsubscribe outcomes; owned browser/server closed. iOS mirror/sync/byte comparison passed. No production Client PII endpoint or real push registration/delivery was invoked for smoke.

## Fresh full Final Gate and new blocker

After final production verification, a new inventory was collected from scratch: 89 Python modules (69 production), 100 Python HTTP routes, 545 compiled backend modules, 14 compiled operational/proof scripts, 545 TypeScript production sources, 221 TypeScript route sites, active PWA/proxy calls and private projection/identity sites. Mutation-like indices contain 619 Python and 518 TypeScript syntactic sites. These are scan indices, not certified business-owner counts.

All 13 Entry Gate families were freshly registered against deployed foundation hashes: **A15, A16, A17, A18, A22, A23, A25, A26, reduced A27, A28, A29, A30, A31**. Accepted Wave 1–6 foundation source/compiled hashes are unchanged. This is inventory coverage; aggregate completion is not certified because the new blocker stops the Gate.

**B25 / A18 — the enabled appointment-reminder scheduler resolves private Client appointment recipients through phone matching.**

Production chain: `AppModule → AppointmentNotificationsModule → AppointmentNotificationsScheduler → tick → clientRecipientsByPhone → CRM detail.client_phone → User IDs → InboxService → canonical Package 2 Communication Delivery`.

| Source | Evidence |
| --- | --- |
| `src/app.module.ts:93` | Module is registered in the production application. |
| `src/appointment-notifications/appointment-notifications.scheduler.ts:34` | Automatic startup/periodic tick; enabled in the current production process configuration. |
| `src/appointment-notifications/appointment-notifications.service.ts:134` | Builds recipient map from same-tenant active client/customer memberships and User.phone. |
| Same service, `:182` | CRM detail phone selects every matching account. |
| Same service, `:189` | Publishes service/staff/time/record projection to selected accounts. |
| Same service, `:234` | Membership/phone read does not prove canonical Client or ClientChannelLink ownership. |
| `src/inbox/inbox.service.ts:384` | These recipients enter existing canonical inbox delivery. |
| `src/communication-delivery/communication-delivery.service.ts:874` | `server_recipient_resolution / ALLOW` does not establish the missing Client binding. |

The isolated reproduction executes actual compiled reminder and Inbox services with synthetic database reads and a capture at Communication Delivery. With **zero canonical Client/link records**, one matching active account produces one private reminder command; two accounts sharing that phone produce two. A nonmatching phone produces zero. No Client/link/consent/preference resolution occurs. Existing source-event dedup suppresses a later tick when an outcome exists, but does not repair recipient authority.

This is an **upstream Client identity/private projection bypass**, not a direct Web Push or transport-ownership bypass. Reminder/Inbox files were unchanged by B24. The B24 Web Push adapter rejects receipts lacking its explicit verified Client identity reference. An eligible tenant and active matching account are prerequisites; bare unauthenticated input and cross-tenant escape are not claimed. No real message, production PII read or production business mutation was used to reproduce it.

**STOP at B25 follows the user's explicit new-bypass boundary.** B25 runtime/schema was not changed. Final aggregate regression was not run after the inventory blocker; green deployment regression above is deployment evidence.

## Checkpoint verdict

```text
B24 PRODUCTION REMEDIATION: PASS
B24 VERIFIED ClientChannelLink REQUIRED: YES
B24 ClientWebPushEndpoint: ENFORCED
B24 MAX ACTIVE ENDPOINTS PER CLIENT: 5
B24 PLAINTEXT PUSH MATERIAL: 0
B24 SILENT CROSS-CLIENT REASSIGNMENT: IMPOSSIBLE
B24 LEGACY SQLITE SUBSCRIPTION WRITER: 0
B24 WEB PUSH OWNER: COMMUNICATION DELIVERY
FAKE HISTORICAL WEB PUSH BACKFILL: 0
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL — B25 / A18
PACKAGE 5 COMPLETE: NO
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13
LEGACY IDENTITY/PROJECTION FALLBACKS: PRESENT — B25 PHONE MATCHING
PRODUCTION DIRECT BUSINESS/PROVIDER/VALUE MUTATION BYPASSES: NOT CERTIFIED — STOP AT B25
LEGACY MUTATING OWNERS ACTIVE: NOT CERTIFIED — B25 IS UPSTREAM RECIPIENT AUTHORITY
D1-A…D7-A GLOBAL ENFORCEMENT: NOT CERTIFIED — B25 CLIENT AUTHORITY BLOCKER
PACKAGE 4 CROSS-PACKAGE GUARDS: PASS
PENDING MIGRATIONS: 0
SCHEMA DRIFT: NONE
B24 FULL DEPLOYMENT REGRESSION GATE: PASS — 356 SUITES / 2904 TESTS
FINAL AGGREGATE REGRESSION GATE: NOT RUN — STOP AT NEW INVENTORY BLOCKER
REAL PRODUCTION MUTATIONS FOR FINAL PROOF: 0
REAL PUSH NOTIFICATIONS FOR SMOKE: 0
P4-11 CREATED: NO
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
CHAPTER 6 COMPLETE DECLARED: NO
PRE-EXISTING LOCAL TEMP/TEST DATABASES: 17 — PROTECTED BASELINE
PRE-EXISTING DATABASES DELETED: 0
OWNED TEMP PROCESSES STILL RUNNING: 0
BACKGROUND WATCHERS LEFT: 0
OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0
OWNED TEMP DATABASES REMAINING: 0
```

Only the cycle-owned isolated PostgreSQL database was dropped; its server stopped and data directory removed. Owned browser/server/test/deployment processes ended. Unrelated local processes/worktrees and all 17 old databases were preserved. Production services intentionally remain running.

Evidence: [deployed recheck](evidence/package5-b24-deployed-final-recheck.json), [fresh full inventory](evidence/package5-b24-fresh-production-inventory.json), [B24 local proof](evidence/package5-b24-local-proof.json), [B25 reproduction](evidence/package5-b25-appointment-phone-authority.probe.cjs), [B25 result](evidence/package5-b25-appointment-phone-authority.proof.json). Run the reproduction with Node and the compiled backend directory as its sole argument; it performs no database/network operation.

Commit/push report and remainder, confirm HEAD=origin, then STOP. B25 remediation is the next authorized cycle. Package 5 completion and later Chapter 6 acceptance remain unachieved.
