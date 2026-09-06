# Package 5 — B27 deployed; full Final Gate STOP at B28

Accepted checkpoint **47a91dbd** / B26 production baseline. B27 runtime commits **de1dfcc8**, **33d19c4a**. Production release: `/opt/maya-saas/releases/20260906-p5-b27-33d19c4a`.

## B27 completion

All production loyalty readers use verified Client authority. The shared reader authenticates the account/channel, requires one active versioned tenant-qualified ClientChannelLink, rejects merged/held identities, and selects canonical LoyaltyAccount/ledger by exact Client. PostgreSQL READ ONLY / RepeatableRead enforces the query boundary. Client without Maya User works through the signed channel bridge. Staff dossier reads retain their existing canonical staff authority and exact CRM target; they do not use phone selection.

A missing canonical account returns the already approved `409 loyalty_account_not_established` outcome without creating a row. GET no longer establishes an account, imports CRM balance, or falls back to User-owned/phone/raw-Telegram balance. Multiple CrmClientLinks do not replace the canonical account or require a new provider selection policy. Existing P4 explicit imports and value execution remain separate approved Action Engine operations.

Backend own-account, customer-portal **loyalty section**, ledger, manager/AI helpers and verified cabinet value queries use this boundary. Python AI balance and booking preparation call the verified read bridge; the old raw-Telegram internal snapshot endpoint returns `410 FEATURE_NOT_AVAILABLE` without disclosure. Shared backend/Python ratchets reject restored read writers and unverified loyalty selectors. No PWA/proxy/iOS, schema, new model, action class, provider adapter or canonical value executor change was needed. The separate CustomerProfile section is B28 below; no global cabinet projection guarantee is claimed.

## Verification and deployment

- Existing 79 migrations replayed on an owned isolated PostgreSQL; no schema added or historical data backfilled.
- **23 PostgreSQL scenarios PASS**: actual GET controller, guest Client, populated accounts/ledgers, duplicate phones with different CRM identities, multiple links, missing/revoked/ambiguous/forged/wrong-tenant identities, P02/P03 holds, provider/read failure, exact staff target and 20 concurrent reads. Every case compares before/after business/provider snapshots: byte-equivalent; private provider card reads/writes0.
- Targeted backend/cross-package checks **8 suites /77 tests PASS**; Python real-branch/bridge/retired-endpoint and adversarial checks **4/4 PASS**.
- The first deployment attempt stopped before upload at stale test/guard harness expectations. Sibling guard loading, override-only fixtures, read-only transaction mocks and the removed registration caller expectation were synchronized narrowly; no runtime protection was relaxed.
- The complete mandatory gate then passed: Prisma validate, project lint, production and script typechecks, **361 suites /2941 tests**, build, deployment preflight, no-op migrations and spare-port readiness. Existing P4 value executors/adjustment methods are unchanged by hash; P4 cross-package guards PASS.
- Backend deployment and the narrow verified Python overlay succeeded. The initial immediate post-restart PWA-state assertion failed; the same independent read-only verification subsequently passed without any runtime edits: health/readiness PASS, backend/PWA active, legacy bot inactive, service errors0, request-only PWA, spare port closed. All five changed Python hashes match. PHP proxy syntax PASS; public static PWA HTTP200.
- Production pending migrations **0**, drift **NONE**;79 repository migrations/82 accounted historical records. No real loyalty/private Client/PII endpoint or business/provider mutation was invoked for smoke.

## Fresh full Final Gate — B28

The Final Gate restarted after production verification with a new all-family inventory: **90 Python modules /70 production**,100 Python routes,**553 production backend source/compiled modules**,223 TS route sites,14 compiled scripts,517 TS and619 Python mutation-like sites, full identity/projection indices and freshly fetched active PWA/proxy. Backend, loyalty read/write, realtime/voice, cabinet, chat/stream/history, appointments, AI/journal, schedulers/workers, Communication Delivery and Package4 guards are included. All553 deployed modules and14 scripts match the gated candidate; all13 accepted Wave foundation source/deployed hashes remain unchanged. These inventory counts are not a successful aggregate ownership verdict.

**New B28 / A18: `GET /api/customers/me/profile` → `CustomersService.getOwnProfile`, also used by `/api/customer-portal`.**

- `customers.controller.ts:38` passes authenticated User to the reader. `customers.service.ts:28-35` verifies tenant membership and selects CustomerProfile by `userId_tenantId`, with no verified ClientChannelLink or exact canonical Client predicate.
- `serializeOwnProfile` returns profile id, preferred locale and privacy/marketing consent timestamps. These timestamps remain compatibility projections, not fresh canonical consent evidence; their presence is not Client authority.
- `customer-portal.service.ts:20-25` includes the same profile even when its separately protected appointment and loyalty readers fail closed. Both active PWA surfaces call customer-portal. Registered controller/module and compiled reader hashes match production.
- A real compiled CustomersController/CustomersService/UsersService + PostgreSQL probe confirms: an active authenticated tenant member with no verified link receives the private Client-owned profile; a revoked link does not prevent disclosure; a channel verified to Client A still receives Client B's profile through the optional User association. The latter fixture uses schema-permitted independent historical User and verified-channel associations, without altering constraints. Twenty concurrent reads reproduce the disclosure while business state remains byte-equivalent.
- The real compiled customer-portal reader also exposes the profile with appointment/loyalty dependencies returning unavailable. Synthetic fixtures only; no real PII, Client population, HTTP auth bypass or cross-tenant access is claimed. Normal authenticated membership/feature prerequisites still apply. This is an identity/projection bypass, **not a newly demonstrated mutation writer**.

**STOP at B28**, as instructed. No B28 runtime/schema remediation started. The adjacent profile PATCH path is not certified or remediated here and belongs in the next authority reconstruction. Final aggregate regression was not rerun after the new blocker; B27 deployment regression remains PASS. Package5 and Chapter6 are not complete; accepted Waves1–6 remain closed.

## Verdict

```text
B27 PRODUCTION REMEDIATION: PASS
B27 VERIFIED CLIENT LOYALTY AUTHORITY: ENFORCED
B27 PHONE MATCH AS LOYALTY AUTHORITY: 0
B27 RAW TELEGRAM AUTHORITY: 0
B27 GET LoyaltyAccount MUTATIONS: 0
B27 CROSS-CLIENT LOYALTY PROJECTION: REJECTED BY VERIFIED READER
LOYALTY READ-SURFACE VALUE MUTATION BYPASSES: 0
PACKAGE 4 LOYALTY INVARIANTS: PRESERVED
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL
PACKAGE 5 COMPLETE: NO
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13
LEGACY IDENTITY/PROJECTION FALLBACKS: PRESENT — B28
GLOBAL MUTATION-OWNER INVENTORY VERDICT: NOT CERTIFIED — STOP AT B28
PACKAGE 4 CROSS-PACKAGE GUARDS: PASS
PENDING MIGRATIONS: 0
SCHEMA DRIFT: NONE
REMEDIATION FULL REGRESSION GATE: PASS — 361 SUITES / 2941 TESTS
FINAL AGGREGATE REGRESSION GATE: NOT RUN — STOP AT B28
REAL PRODUCTION MUTATIONS FOR FINAL PROOF: 0
PRODUCTION PRIVATE/PII ENDPOINTS INVOKED FOR SMOKE: 0
PACKAGE 4 REOPENED: NO
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

Evidence: [B27 local proof](evidence/package5-b27-local-proof.json), [deployed recheck](evidence/package5-b27-deployed-final-recheck.json), [fresh full inventory](evidence/package5-b27-fresh-production-inventory.json), [B28 executable probe](evidence/package5-b28-profile-read-authority.probe.cjs), [B28 result](evidence/package5-b28-profile-read-authority.proof.json).

The one owned PostgreSQL database (B27 proof and isolated B28 fixtures) was dropped; its process stopped and data directory removed. No browser/watcher was started. All17 pre-existing databases and unrelated processes were left untouched. Next cycle is B28 owner instruction/remediation followed by a new full Package5 Final Gate. Chapter6 acceptance remains a separate cycle after Package5 completion.
