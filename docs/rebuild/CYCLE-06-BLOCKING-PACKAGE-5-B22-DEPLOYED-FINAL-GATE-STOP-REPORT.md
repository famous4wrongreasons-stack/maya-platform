# Package 5 B22 deployed remediation — fresh Final Gate STOP at B23

**B22 production remediation: PASS. Package 5 Final Adversarial Verification: FAIL. Package 5 complete: NO.**

Accepted owner checkpoint: `ab4bd333` (Option A). Runtime candidate: `a15741c06c3bcbab416a4a94aaa75626148a0d7d`; B22 runtime changes: `daa7f91a`. Production backend release: `/opt/maya-saas/releases/20260905-p5-b22-a15741c0`.

## B22 result

The external YClients tip-payment URL/page is preserved. Opening it or returning to Maya does not confirm payment. The active PWA no longer sends `tip_sent`, displays “Чаевые отправлены”, or offers the unsupported gratitude-message control. The published legacy PWA, Maya PWA, maintained source bundles and local iOS mirror were aligned. iOS sync and source/public byte comparison passed; unrelated iOS changes were preserved and were not committed.

`POST /api/tips/sent` and the proxy compatibility case return HTTP 410, `ok=false`, `tip_signal_retired`, and `payment_confirmed=false`. The handler does not parse or forward caller amount, record, Client, or staff fields. It cannot invoke identity creation, tip/value writes, Telegram, Web Push, or delivery outcomes.

`database.save_tip` fails closed. Both legacy SQLite financial projection functions also fail closed. Existing SQLite tip rows were not deleted, rewritten, or backfilled. Existing read-only YClients reports are a separate provider source; they were not converted into canonical Maya tip/payment facts. No new model, schema, migration, action class or tip lifecycle was introduced.

Only the B22 handler and three legacy database functions were replaced in the active webhook/database files; the architectural guard was extended separately. A normalized AST comparison proved every other function and module statement unchanged, preserving the request-only launcher and accepted B13–B21 overlays. Active hashes, candidate checks and the fresh scan are recorded in the evidence files below.

## Verification and deployment

- Targeted B22 proof: 1 TypeScript suite / 5 tests and 5 Python tests PASS. The Python proof includes 75 concurrent malformed/forged/repeated requests, unchanged synthetic SQLite bytes/totals/identity counts, and negative bypass injections.
- Existing control-plane guard proof: 31 tests PASS; chat/tips regressions: 5 tests PASS.
- Active/staged Package 5 B13–B22 guard and Package 4 runtime guard: PASS.
- Prisma validate, lint, application and script typechecks, build: PASS.
- Mandatory deployment regression: **352 suites / 2880 tests PASS**.
- Source inline-script parsing: 28/27/19 blocks; published PWA variants: 26/28; iOS: 28. Proxy PHP 8.3 syntax: PASS.
- Backend health/readiness: PASS. Request-only PWA service active on port 8080; full legacy bot inactive. Post-activation service errors: 0. Public PWA HTTP 200.
- Repository migrations: 78; accepted production migration records: 81; pending migrations: 0; independent schema comparison: `No difference detected`.
- Temporary backend readiness process on port 3199 was terminated/reaped; no listener remains.
- Production tip, Client, payment, Telegram, Web Push, or provider endpoints were not called to manufacture proof. No real production business mutations were used for smoke or Final Gate evidence.

Two local gate interruptions occurred before deployment: a `require-await` error in a new test adapter (corrected without semantic change), then a native Node 24.15 V8 garbage-collector SIGSEGV. The complete unchanged gate passed on installed Node 24.19. Deployment now accepts an optional installed local Node directory; the default behavior, gate list, production runtime and checks remain intact. PHP 5.6 was initially selected by the host CLI; the actual candidate passed syntax verification using installed PHP 8.3.

## Fresh 13-family Final Gate

The scan restarted after successful production verification. It inventoried all thirteen Entry Gate families and their deployed foundations: A15, A16, A17, A18, A22, A23, A25, A26, reduced A27, A28, A29, A30 and A31. All six accepted waves remain intact; AC6 remains A30's canonical execution owner.

Fresh inventory: 537 non-spec TypeScript source files, 218 HTTP decorators, 516 mutation-like TypeScript sites, 537 deployed backend JavaScript files, 89 active-root Python files (69 non-test), 99 root Python route registrations including 94 in the active webhook server, and 627 Python mutation-like sites. These are syntactic inventory counts, not assertions that every site is a business mutation or production owner.

The inventory includes backend, both published PWA variants, proxy, request-only launcher, realtime/voice, cabinet, chat/stream, AI/journal/history, event/background modules, Communication Delivery and Package 4 boundaries. Full family inventory coverage is 13/13. Aggregate completion certification stopped at the first new confirmed blocker below; neither all-family bypass freedom nor a final aggregate regression PASS is claimed.

## B23 — Client chat deletion and history projection without verified Client binding

The active `POST /api/chat/delete` route is registered at `webhook_server.py:12508`. Its handler spans lines 8642–8738, SHA-256 `61cbf4bba790583425fb34cb2f0dfc4361aac0e48c35714758064f57dca7650d`.

Reachability is concrete:

1. Published PWA actions at lines 15806 and 15833 call `action=chat_delete`; the Maya PWA also contains the compatibility calls at lines 19472 and 19505. The SaaS local-only UI branch is separate and does not make the public compatibility API unreachable.
2. Proxy case `api-proxy.php:2545` forwards legacy `session_token`/Telegram proof and caller deletion selectors to `/api/chat/delete`.
3. `_resolve_chat_tg_user` at line 8280 accepts a valid legacy web session or Telegram channel identity. `chat_delete_handler` never resolves or verifies a canonical `ClientChannelLink`, exact tenant-qualified Client or canonical Client history command authority.
4. The handler derives the durable history key directly as `pwa:client:<chat_id>`, calls legacy `load_conversations`, then writes through `memory.save_conversations` (lines 565–574). The writer replaces the legacy conversation file directly.
5. Clear-all erases that history. Even a nonexistent message selector calls the durable writer and returns saved private history through `_chat_history_payload`.

This is distinct from the accepted B15 read-history remediation and B21 ephemeral realtime context. Those baselines were not reopened. A channel-authenticated session is not proof of canonical Client authority under the approved identity contract.

An isolated reproduction executed the exact deployed handler, resolver, mode/key, message-ID and serialization AST against a synthetic legacy session and a task-owned temporary history file. The actual memory load/save functions were used; their source hash matched active production. Text formatting and authentication adapters were synthetic. No production conversation file, database, endpoint, real session or private message was accessed by the reproduction.

Observed without a verified Client binding:

- nonexistent message ID → HTTP 200, `deleted=false`, one private synthetic message returned, one durable history-save call;
- clear-all → HTTP 200, history erased, one durable history-save call.

The owned fixture was removed. B23 runtime/schema was not changed. The next cycle must establish canonical Client authority and approved history/deletion semantics for this endpoint before remediation; no new history owner or schema is inferred here.

## Verdict

```text
B22 PRODUCTION REMEDIATION: PASS
B22 UNVERIFIED TIP SIGNAL: RETIRED
B22 EXTERNAL TIP PAYMENT: PRESERVED
B22 CALLER-SUPPLIED VALUE AUTHORITY: 0
B22 DIRECT SQLITE TIP FACT WRITERS: 0
B22 DIRECT TELEGRAM DELIVERY: 0
B22 DIRECT WEB PUSH DELIVERY: 0
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL
PACKAGE 5 COMPLETE: NO
NEW BLOCKER: B23 — /api/chat/delete CLIENT HISTORY MUTATION/PROJECTION AUTHORITY
PRODUCTION DIRECT BUSINESS MUTATION BYPASSES: PRESENT — B23
LEGACY IDENTITY/PROJECTION FALLBACKS: PRESENT — B23
LEGACY MUTATING OWNERS ACTIVE: PRESENT — B23
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13
D1-A…D7-A: ACCEPTED BASELINES PRESERVED; B23 CLIENT AUTHORITY GAP OPEN
PACKAGE 4 CROSS-PACKAGE GUARDS: PASS
PENDING MIGRATIONS: 0
SCHEMA DRIFT: NONE
REMEDIATION FULL REGRESSION GATE: PASS — 352 SUITES / 2880 TESTS
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

The accepted inventory of 17 pre-existing test databases remains protected; no database was deleted. No PostgreSQL test database was created by this cycle; synthetic SQLite/history fixtures were automatically removed. Chapter 6 is not declared complete.

Evidence: `evidence/package5-b22-deployed-final-recheck.json`, `evidence/package5-b22-fresh-production-inventory.json`, `evidence/package5-b23-chat-delete.probe.py`.

STOP at B23 after report/remainder commit and push. No further implementation wave or acceptance gate started.
