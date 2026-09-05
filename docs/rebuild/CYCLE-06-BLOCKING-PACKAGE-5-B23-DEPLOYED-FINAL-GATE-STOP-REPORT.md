# Package 5 B23 deployed remediation — fresh Final Gate STOP at B24

**B23 production remediation: PASS. Package 5 Final Adversarial Verification: FAIL. Package 5 complete: NO.**

Accepted owner checkpoint: `9c6ee8bf`, Option A. Runtime candidate: `68e0048f9189365a34a06f6adc5bd85cb49c372f`. Production release: `/opt/maya-saas/releases/20260906-p5-b23-68e0048f`.

## B23 completed behavior

`POST /api/chat/delete` and the proxy `chat_delete` compatibility case return the same fixed HTTP 410 body: `{"ok":false,"error":"FEATURE_NOT_AVAILABLE"}`. The handler does not parse caller input, authenticate a legacy session, resolve a raw channel, load history, assign message IDs, write storage or return saved history/PII. Verified Clients receive the same unsupported outcome. An unsupported request cannot reveal whether a conversation exists.

Both published PWA variants and maintained source bundles no longer call the server-delete endpoint. Unsupported legacy deletion cannot optimistically hide messages, clear history caches or report success. Existing separately scoped local SaaS/inbox hiding remains available and is labelled as hiding on this device, with explicit notice that server history remains. The local iOS mirror received the same narrow change; Capacitor sync and source/public byte comparison passed. Unrelated dirty iOS work was preserved and not staged.

Historical conversations, audit/evidence, ownership and cache files were not accessed or changed to implement this retirement. No fake deletion facts, lazy migration or historical backfill were introduced. No schema, model, migration or action class was added. B15 authorized reads and B21 ephemeral voice remain unchanged. D7-A/AC6 scope was not expanded.

This is the approved temporary Chapter 6 limitation, not a permanent ban on user deletion. A future separately approved conversation lifecycle can restore deletion after defining ownership, voice/text/Telegram unification, user-requested deletion, retention, legal/audit preservation, employee access, privacy, limits and cross-channel identity. B23 implements none of that future subsystem.

Only `chat_delete_handler` changed in the active webhook module; normalized AST comparison proved every other function and statement unchanged. The runtime guard was extended separately. Active database and request-only launcher hashes match the pre-deploy baseline. All thirteen accepted family foundation source and deployed JavaScript hashes match the prior production baseline; Waves 1–6 were not reopened.

## Verification and deployment

- Targeted Python proof/regressions: **21 tests PASS**, including 144 synthetic identity/selector/retry/concurrent unsupported calls, byte-equivalent history and immutable evidence, and negative backend/PWA/proxy ratchets.
- Targeted backend architecture suite: **4 tests PASS**. Published PWA variants and iOS mirror passed executable inert-UI checks and inline-script parsing (26/28/28 blocks).
- Proxy compatibility case executed in an isolated PHP 8.3 process: fixed 410, no upstream request; full staged and active proxy syntax PASS.
- Prisma validate, mandatory project lint, application/script typechecks, build and server deployment gates: PASS.
- Mandatory deployment regression: **353 suites / 2884 tests PASS** on the already approved installed Node 24.19 gate runtime. No deployment gate was skipped or weakened. During local test authoring, the lint rule rejected a Function constructor in the new test; it was replaced by the standard VM Script parser before the complete deployment gate.
- Production release preflight: 78 repository migrations, 81 accepted production records, **pending 0**, independent schema diff **NONE**.
- Health/readiness PASS; `maya-saas` and request-only `barbershop-pwa` active; full legacy bot inactive. Post-start service errors: **0**. Public PWA returns HTTP 200. No spare port 3199 listener remains; the temporary readiness process was terminated and reaped.
- Post-deploy Package 4 and Package 5 B13–B23 runtime guards PASS. Freshly downloaded active source/PWA/proxy hashes equal the gated candidate hashes.
- No live Client history, delete, PII, subscription, message or provider endpoint was invoked for smoke/proof. Real production business/provider/value mutations for proof: **0**.

## Full Final Gate restarted

The new scan began after B23 production structural/read-only verification. It inventoried A15, A16, A17, A18, A22, A23, A25, A26, reduced A27, A28, A29, A30 and A31 from the Entry Gate and their fresh deployed foundations. A30 remains owned by the approved AC6 maintenance coordinator.

Fresh inventory: 537 non-spec TypeScript sources, 218 HTTP decorators, 516 TypeScript mutation-like indicators, 537 deployed backend JavaScript files, 89 active-root Python files (69 non-test), 99 root route registrations (94 webhook routes), and 625 Python mutation-like indicators. Scope includes backend, both active PWA bundles, proxy, realtime/voice, cabinet, chat/stream/history, AI/journal, event/background modules, Communication Delivery and Package 4 boundaries. These are syntactic inventory counters, not certification of every indicator as a business write or reachable owner.

Family inventory coverage is **13/13**. Aggregate verification stopped at the first newly confirmed blocker below. No claim of all-family bypass freedom or final aggregate regression PASS is made.

## B24 / A18 — legacy Web Push subscription identity/storage authority

The fresh active `push_subscribe_handler` spans `webhook_server.py:10159–10203`, SHA-256 `1d79c5595f9eee65c994f90ada74441de2a9f92f4548c60193541f18ff2f5268`. Its route is registered at line 12426. Full active webhook SHA-256: `fc5fedeebff6cf742bc5c9206a7fa1907d8c5a23ef62646bcaa60c46665f22be`.

Production reachability:

1. Published salon PWA line 35834 and Maya PWA line 41504 call `action=push_subscribe`. Browser notification permission and a legacy authenticated request are the visible prerequisites; they are not canonical Client binding evidence.
2. Proxy `api-proxy.php:2762` forwards subscription plus legacy auth/session input to `/api/push/subscribe` at line 2770.
3. `_authed_chat_id` (6117–6136) accepts a verified Telegram channel identity or resolves a legacy web session to raw `chat_id`. It never resolves an active tenant-qualified `ClientChannelLink`.
4. The no-staff branch declares `role=client` and directly calls `_save_master_push_subscription_sqlite(None, chat_id, subscription, user_agent)`.
5. `_push_db` (368–392) creates/opens a legacy SQLite table with `telegram_chat_id`, nullable `staff_id`, plaintext `endpoint` and `subscription_json`. There is no canonical tenant/Client/link binding in that table.
6. The writer (395–426) performs `INSERT ... ON CONFLICT(endpoint) DO UPDATE`, replacing the raw identity and subscription. The raw-channel lookup (429–452) returns this data to the legacy delivery helper. The request-only launcher keeps the HTTP route reachable even with background jobs disabled.

The staff branch also uses legacy raw-channel staff lookup. The isolated confirmed finding focuses on the no-staff Client branch; this report does not infer new staff authority or reopen an accepted implementation wave. Existing tenant/User `DevicePushToken` and verified Client delivery foundations remain separate; this handler calls neither. Whether/how to reuse them for browser Web Push requires the next bounded remediation/contract assessment, not a mechanical copy into a canonical table.

An isolated reproduction executed the exact deployed handler, authentication resolver, staff lookup and SQLite writer/reader AST against a synthetic legacy session adapter and task-owned temporary SQLite file. It loaded no live config, real session or Client information and made no network/provider call.

Observed:

- bare unauthenticated caller `chat_id` → HTTP 401, no file created;
- valid legacy session with **no canonical Client or ClientChannelLink** → HTTP 200, `ok=true`, `role=client`, one durable SQLite subscription;
- endpoint and full synthetic subscription persisted in plaintext;
- repeated registration remains one row, but a second legacy session presenting the same endpoint changes that row to the second raw identity;
- legacy delivery lookup now returns the subscription for the new raw identity and none for the former one.

This is not a claim that an unauthenticated caller can impersonate any Client, that a real message was sent, or that the endpoint creates Client rows. The proven blocker is production-reachable registration/reassignment of Client delivery state using legacy identity and a separate SQLite owner, outside the approved canonical Client binding/delivery boundary. B24 was **not remediated**.

## Verdict

```text
B23 PRODUCTION REMEDIATION: PASS
B23 LEGACY SERVER CHAT DELETE: RETIRED
B23 LEGACY SESSION/chat_id DELETE AUTHORITY: 0
B23 HISTORY DISCLOSED ON DELETE FAILURE: NO
B23 PII DISCLOSED ON DELETE FAILURE: NO
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL
PACKAGE 5 COMPLETE: NO
NEW BLOCKER: B24 / A18 — /api/push/subscribe LEGACY CLIENT DELIVERY IDENTITY/STORAGE OWNER
PRODUCTION DIRECT BUSINESS/PROVIDER/VALUE MUTATION BYPASSES: PRESENT — B24
LEGACY IDENTITY/PROJECTION FALLBACKS: PRESENT — B24
LEGACY MUTATING OWNERS ACTIVE: PRESENT — B24
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13
D1-A…D7-A: ACCEPTED BASELINES PRESERVED; B24 CLIENT DELIVERY AUTHORITY GAP OPEN
PACKAGE 4 CROSS-PACKAGE GUARDS: PASS
PENDING MIGRATIONS: 0
SCHEMA DRIFT: NONE
REMEDIATION FULL REGRESSION GATE: PASS — 353 SUITES / 2884 TESTS
FINAL AGGREGATE REGRESSION GATE: NOT RUN — STOP AT NEW INVENTORY BLOCKER
REAL PRODUCTION MUTATIONS FOR FINAL PROOF: 0
P4-11 CREATED: NO
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
OWNED TEMP PROCESSES STILL RUNNING: 0
BACKGROUND WATCHERS LEFT: 0
OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0
OWNED TEMP DATABASES REMAINING: 0
```

All 17 protected pre-existing local test databases remain untouched. No PostgreSQL test database was created. Task-owned synthetic history/SQLite fixtures were removed; no owned watcher/browser remains. Existing unrelated processes were not stopped. Private code rollback copies are retained outside the public web root; they contain no new business records and run no processes.

Evidence: `evidence/package5-b23-local-remediation-proof.json`, `evidence/package5-b23-deployed-final-recheck.json`, `evidence/package5-b23-fresh-production-inventory.json`, `evidence/package5-b24-push-subscribe.probe.py`.

STOP at B24 per the owner's instruction after report/remainder commit and push. Package 5 and Chapter 6 are not declared complete. No next implementation wave or Chapter 6 acceptance cycle started.
