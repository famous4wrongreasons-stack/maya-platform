# Package 5 — B26 deployed; full Final Gate STOP at B27

Accepted checkpoint **cec7bdfd** / B25 production baseline. B26 runtime commit **e426e55749803c6eec82f65942102e050b2e290f**. Production release: `/opt/maya-saas/releases/20260906-p5-b26-e426e557`.

## B26 completion

`GET /api/appointments/my` uses the shared verified Client appointment reader. Authenticated account/active membership is a channel subject; the existing tenant-qualified active `maya_user` ClientChannelLink establishes Client authority. The channel bridge supports verified Telegram Clients without a Maya User. Neither User.phone, bare Client.userId, raw chat_id nor Appointment.clientId authorizes the projection.

The reader requires one active versioned link, rejects merged/unresolved Client identity, and selects only `Appointment.tenantId + mayaClientId`. The database transaction is READ ONLY / repeatable-read. The former lazy CRM phone lookup and Appointment import/update loop are removed. Missing local records return no fabricated appointments; canonical synchronization remains with existing mirror/reconciliation/event owners. Current public service/staff labels are optional; provider failure does not change canonical rows. Stored price/time/status are returned, and raw provider payload is excluded. Existing PWA response shape remains supported; unlinked reads fail closed.

Account cabinet and AI appointment reads share this reader. Their separate loyalty reader is the newly discovered B27 below; a global cabinet/value read guarantee is not claimed. B17/B25 use the same canonical Appointment→Client truth and are unchanged. No schema/model/action class was added; no Wave reopened.

## Verification

- 79 migrations cleanly replayed on this cycle's isolated PostgreSQL, schema diff NONE.
- 18 PostgreSQL read scenarios PASS, including 20 concurrent GETs and exact before/after serialized Appointment, Client, link, profile/consent, account and synthetic provider state equality. Missing/revoked/ambiguous identity, duplicate phones, forged identifiers, other Client/tenant, missing local/unmatched remote records, stale state and helper/provider failure covered.
- 6 targeted suites /72 tests PASS. Common production-source Client appointment read scanner and adversarial ratchet cases PASS; accepted B17/B20/B25 regression preserved.
- Mandatory deployment gates PASS: Prisma validate, project lint, both typechecks, **360 suites /2937 tests**, build, production preflight, pending0, drift NONE and spare-port readiness. Spare process reaped before cutover.
- Independent post-deploy health/readiness PASS; backend/PWA active, legacy background bot inactive, service errors0. PHP proxy syntax and public static PWA HTTP200. No production Client/Appointment/PII endpoint, real provider operation or real business mutation invoked for smoke.
- All **551 deployed compiled backend modules** and14 scripts match the gated candidate. All13 accepted family foundation source/deployed hashes match B25 baseline unchanged. Production has79 repository migrations /82 accounted historical records, pending0/drift NONE.

## Fresh full Final Gate — new B27

After B26 production verification, the full gate restarted with a new production inventory of all13 families: backend, active PWA/proxy, realtime/voice, cabinet, chat/stream/history, appointment read/write, AI/journal, background/event workers and Communication Delivery. Inventory:89 Python modules (69 production),100 Python routes,551 production TS/deployed backend modules,222 TS route sites,14 compiled scripts, complete mutation-like and identity/projection indices. Existing Package4 cross-package and accepted Package5 PWA/Python guards PASS. These checks did not cover the following read/identity gap.

**Primary path: `GET /api/loyalty/me` → `LoyaltyService.getForUser`.** Shared callers include `/api/customer-portal` loyalty section, `/api/admin/loyalty/:userId` and `getStateForUser` consumers.

1. Internal calendar branch (`loyalty.service.ts:68`) calls `loyaltyAccount.upsert` directly from GET, creating an account with User association and NULL canonical Client. It is outside ActionExecution. In a real PostgreSQL reproduction, two GETs create one account with no verified Client links or executions. The database intentionally permits nullable historical Client ownership, so the write succeeds; a zero initial balance does not make account creation read-only. This branch is conditional on calendar configuration; no assertion about live internal-tenant counts is made.
2. External branch (`:66,773`) uses User.phone → `CrmService.getClientLoyaltyEvidenceReadOnly` (`crm.service.ts:3083`) → `YclientsCRMAdapter.getClientLoyalty` (`yclients-crm.adapter.ts:2444`). The adapter iterates phone-matched CRM Clients until a card is found. This caller does not require ClientChannelLink or compare the returned card to exact canonical CrmClientLink. The real compiled reader/adapter with synthetic provider responses returns Client202's private balance despite the account's canonical Client mapping to CRM101, with zero verified channel links. No provider write is involved in this path.
3. Configured legacy bridge (`loyalty.service.ts:835,899`) uses raw `AuthIdentity.providerUserId` as `telegram_user_id`. Active Python `internal_loyalty_snapshot_handler` (`webhook_server.py:1688`) uses legacy `database.get_client` and the legacy ledger. No ClientChannelLink or canonical Client authority is required. A separate synthetic bridge response is accepted with zero verified Client links. This branch depends on configured bridge token/tenant allowlist; no secret or real balance was read. Server-only transport authentication is not canonical Client authority.

Both active PWA surfaces contain `/loyalty/me` and customer-portal callers; backend controller/module and all relevant compiled files match production. The reproduction invokes real compiled controller, loyalty service, CRM evidence reader and YClients candidate-selection method, with a newly owned PostgreSQL database and synthetic providers/bridge. It does not bypass tenant membership prerequisites, invoke production PII endpoints or claim anonymous/cross-tenant HTTP access. The legacy Python selector is additionally confirmed by its fresh deployed source.

**STOP at B27.** No B27 runtime/schema remediation was started. The final aggregate regression was not rerun after discovering the new blocker; the B26 deployment regression remains PASS. Family inventory13/13 is not a global canonical-owner verdict. Package5 and Chapter6 are not complete.

## Verdict

```text
B26 PRODUCTION REMEDIATION: PASS
B26 VERIFIED CLIENT AUTHORITY: ENFORCED
B26 PHONE MATCH AS APPOINTMENT AUTHORITY: 0
B26 GET APPOINTMENT MUTATIONS: 0
B26 CROSS-CLIENT PRIVATE APPOINTMENT PROJECTION: IMPOSSIBLE IN VERIFIED READER
B26 CLIENT WITHOUT MAYA USER: SUPPORTED
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL
PACKAGE 5 COMPLETE: NO
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13
PRODUCTION DIRECT BUSINESS/VALUE MUTATION BYPASSES: PRESENT — B27
LEGACY IDENTITY/PROJECTION FALLBACKS: PRESENT — B27
LEGACY MUTATING OWNERS ACTIVE: PRESENT — B27
PACKAGE 4 EXISTING CROSS-PACKAGE GUARDS: PASS
PENDING MIGRATIONS: 0
SCHEMA DRIFT: NONE
REMEDIATION FULL REGRESSION GATE: PASS — 360 SUITES / 2937 TESTS
FINAL AGGREGATE REGRESSION GATE: NOT RUN — STOP AT B27
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

Evidence: [B26 local proof](evidence/package5-b26-local-proof.json), [deployed recheck](evidence/package5-b26-deployed-final-recheck.json), [fresh full inventory](evidence/package5-b26-fresh-production-inventory.json), [B27 executable probe](evidence/package5-b27-loyalty-read-authority.probe.cjs), [B27 result](evidence/package5-b27-loyalty-read-authority.proof.json).

Both owned databases were dropped; both isolated PostgreSQL processes stopped and data directories removed. No browser/watcher was started; all17 old databases and unrelated processes remain untouched. Next cycle: B27 owner instruction/remediation, then a new all-family Final Gate. Chapter6 acceptance remains separate after Package5 completion.
