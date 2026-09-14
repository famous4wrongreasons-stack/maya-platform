# Package 5 — B34 production PASS; fresh Final Gate STOP at B35

Approved Option A checkpoint: `7a2cc296`. Runtime/ratchet commit: `d2dd1e5d`.
Published checkpoint: `6f6745f2` (subsequent patch-evidence formatting only).
Active release: `/opt/maya-saas/releases/20260906-p5-b34-6f6745f2`.
Verification completed 2026-09-07 Europe/Moscow. B29–B33 remain accepted.

## B34 completed retirement

Legacy Python review import/sync is retired. The two compatibility routes return
410 `LEGACY_REVIEW_SOURCE_RETIRED`. Import, public fetch/refresh, snapshot,
SQLite upsert and technical metadata helpers cannot write. The review notifier
is disabled and the monitor startup registration is removed. There is no
provider/card-to-tenant inference, replacement/correction fallback or new owner.
Optional reputation summaries explicitly report an unavailable source.

Canonical Maya-authenticated review ingress and `Package5Wave4ReviewFactService`
remain unchanged. AC4 accepts tenant/provider/external-id facts once; identical
payload replays, changed business evidence conflicts, original evidence remains
immutable. Review acceptance does not require a fabricated ActionExecution.
New models, fields, action classes, schema migrations and backfill: **0**.

The new backend AST guard restricts canonical review mutation to AC4. The active
Python guard pins retired handlers/helpers and scans import, job, fallback and
SQL sites, including nested active modules. Historical deployment archives are
excluded as inactive data; active imports/execution of archives are rejected.
No old archive was deleted. [Local implementation and limits](CYCLE-06-BLOCKING-PACKAGE-5-B34-RUNTIME-LOCAL-GATE.md).

## Local gates and production verification

Targeted 3 suites / 18 tests, review/booking 51 / 439, architecture 80 / 438,
lint, both typechecks, build, schema validation/status/diff and clean replay of
81 migrations PASS. Final mandatory backend: **376 suites / 3078 tests PASS**.
The documented deployment independently repeated that complete mandatory suite
(214.506 seconds), lint/types/build, preflight, drift check and spare-port smoke.
An earlier native Node SIGSEGV has no PASS verdict and is retained in local
evidence; the successful complete runs followed it without waiving any check.

The real owned PostgreSQL AC4 proof covers authenticated controller/service
composition, exact replay, changed text/rating/time/branch/staff conflict,
authorization rejection, 12 identical concurrent submissions, competing payloads
and fresh-process replay. Original encrypted rows remain identical. Synthetic
principals are composed locally; this is not a live JWT/HTTP/provider test.
Ten Python retirement/parser tests and 33 optional consumer regressions PASS.
The exact production overlay also passed all ten retirement/parser tests.

Backend deployment PASS. Independent read-only verification matched **580/580
compiled JavaScript artifacts**. Five Python artifacts match their reviewed
manifest. Four narrow webhook function overlays preserve the production-only
launcher; the existing direct review notifier is fully retired. Function hashes
were compared using the same source-segment/newline convention; whole-file
hashes also match. [Runtime evidence](evidence/package5-b34-deployed-recheck.json),
[active retirement](evidence/package5-b34-active-retirement.json).

Backend and request-only PWA services are active; full legacy bot is inactive.
Health/readiness PASS, error-priority entries 0, spare port 3199 closed. Active
Package 4/5 guards PASS, including `b34LegacyReviewOwners: 0`. No review monitor
reference/start remains. Pending migrations 0; drift NONE; 81 repository
migrations and 84 accounted historical database entries. No new migration ran.

All **312 historical SQLite external-review rows** retain the exact pre-cutover
fingerprint. The check opened SQLite read-only and emitted only count/hash.
No row contents, credentials or customer data were copied into evidence.
[Schema/history evidence](evidence/package5-b34-production-schema-history.json).

No real review, appointment, broadcast, provider or other business mutation was
invoked for production proof. Runtime publication/restart and the documented
idempotent deployment checks were the only production changes in this cycle.
PWA/PHP bundles were not changed.

## Fresh all-family Final Gate

The gate restarted after B34 production PASS. Fresh source inventory covers
564 non-spec backend modules, 224 HTTP decorator sites and 1,345 mutation-like
AST calls. This broader scanner includes dispatch/set/save/protocol calls; its
call count is not directly comparable with the older narrower 518-site scanner,
and is not a count of business writers.

| Family | Current boundary covered |
| --- | --- |
| A15 | Wave 3 staff-day intent, provider UNKNOWN, exact reconciliation |
| A16 | Wave 2 CRM access, membership/target authority, AC5 reducers |
| A17 | Separate credential installation, activation, import and disconnect |
| A18 | Verified Client profile/consent/booking; B29–B33 and normal/stream initiators |
| A22 | Wave 1 settings/preferences and server-derived authority |
| A23 | OperationalWorkItem commands and bounded inbox protocol/projection |
| A25 | Explicit security actions and exact AC3 authentication protocols |
| A26 | Governed administration and atomic TrialActivation; no tenant hard delete |
| reduced A27 | Inventory/archive and sole AC4 review owner; B34 retired legacy source |
| A28 | Prospective calendar configuration, frozen appointments, object reconciliation |
| A29 | Corrections with immutable original evidence |
| A30 | Six approved AC6 classes, central policy, caps, fenced maintenance |
| A31 | Deduplicated events/recovery/mirror facts and one live reconciliation lease |

All six real PostgreSQL wave proofs reran in new databases on owned port 55504,
each with a clean 81-migration replay. Wave results: **6/6, 13/13, 8/8, 12/12,
1/1, 6/6 PASS**. Wave 6 includes 53 negative checks, rollback/restart fences,
concurrency and cascade/audit boundaries. Its old disposable port literal was
adapted only in the proof runner, with exact host/port/database assertions.

Fresh cross-boundary/architectural regression: **111 suites / 762 tests PASS**.
This includes Package 4 boundaries, D1-A…D7-A, UNKNOWN/reconciliation, Client
identity, confirmation, inbox and recovery coverage. It does not certify paths
outside the assertions. [Local gate results](evidence/package5-b34-final-local-checks.json),
[source inventory](evidence/package5-b34-fresh-final-inventory.json).

Fresh production Python inventory: 91 root modules / 71 non-test modules,
100 route-registration sites, 802 mutation-like calls and 117 SQL-like literals.
Exactly the five reviewed B34 artifacts differ from B33; other root-module
hashes are unchanged. Some counted sites are retired functions or technical
protocols, not active business writes. Chat/stream/history, realtime/voice,
cabinet, journal/AI, startup/jobs and cross-package producers were included.
[Hashes](evidence/package5-b34-final-production-python-inventory.json),
[routes/calls/SQL](evidence/package5-b34-final-python-surface-inventory.json).

The first new confirmed blocker below stops aggregate certification. The
cross-boundary run finished before interruption; the subsequent aggregate lint
process was terminated under the STOP rule (exit -15, not PASS). Later aggregate
typechecks/build/schema/full mandatory regression and remaining frontend checks
were not completed. Earlier successful B34 deployment gates are not relabelled
as a fresh Final Gate PASS.

## Exact B35 — published legacy bulk Telegram sender outside Package 2 owner

This is a cross-package preservation failure discovered during the full Package
5 gate, **not a B34 review regression**. The accepted
[Package 2 communication contract](CYCLE-06-BLOCKING-PACKAGE-2-COMMUNICATION-CONVERGENCE-REPORT.md)
requires A14 bulk campaign execution through Action Engine → Communication
Delivery, exact audience identity-set equivalence, one durable recipient claim
and no blind retry after an ambiguous provider outcome.

The published path is:

`POST /api/panel/broadcast`, `mode=send`
→ signed `_panel_auth` / `_panel_resolve_role` marketing permission
→ `_panel_broadcast_recipients`
→ `broadcast_send_to_base`
→ direct `bot.send_message`
→ local `client_marketing_last` update.

Fresh active-source anchors:

- `webhook_server.py:3736`: handler authenticates the legacy owner and starts the
  sender as an asyncio task at `:3779`; route registration is at `:12078`.
- `webhook_server.py:3656`: broadcast loop reads legacy recipient selectors,
  canonical consent/preferences and directly sends at `:3686`; its BadRequest
  branch contains another direct send. The dynamic proof below uses timeout,
  not the BadRequest branch.
- `database.py:2431`: recipient selection reads local connected Telegram rows.
  Consent and preferences now use verified canonical read adapters. Those
  successful read checks do not create or authorize a bulk execution.
- `database.py:1245`: local last-sent metadata is written after success. The
  existing frequency check applies only when an explicit frequency override is
  present; it is not a durable campaign/recipient idempotency claim.
- The launcher builds a Telegram Application even with background jobs disabled.
  Its installed mirror invokes the original send first, then schedules an
  observation; this post-send mirror cannot supply prior bulk policy/claim.

The request-only PWA service and Nginx upstream remain reachable. No live
broadcast endpoint was invoked. [Reachability](evidence/package5-b35-production-reachability.json).
The source line/hash map matches **all 22 executed production functions**.
[Function hashes](evidence/package5-b35-production-function-hashes.json).

The existing canonical `MarketingService` constructs and verifies a durable
audience before `CommunicationDeliveryService.deliverBulkCampaign`; the legacy
sender calls neither owner. Existing Python communication ratchets name selected
A11–A13 producers and protected executors; their producer list omits
`panel_broadcast_handler` / `broadcast_send_to_base`. Passing the backend and
active-root guards therefore did not establish absence of this A14 path.

### Local executable reproduction and limits

[Probe](evidence/package5-b35-broadcast.probe.py),
[observed result](evidence/package5-b35-broadcast.proof.json).

The probe executes the real signed-widget verifier, founder-role resolver,
handler, broadcast loop, SQLite recipient/throttle functions and canonical-read
wrappers. Synthetic founder configuration and an empty admin registry supply
identity fixtures. Positive/negative canonical consent/preferences responses
are explicit service-boundary doubles; this proof does **not** retest their
canonical Client/link resolver. Decryption, Request/response envelopes and
Telegram are controlled synthetic fixtures. Network access is forbidden.

| Case | Observed result |
| --- | --- |
| No signature / signed non-owner | 401 / 403, zero sends |
| Unlinked/ineligible canonical response | Zero sends |
| Eligible signed-owner first request | 200, one synthetic provider operation |
| Identical repeated request | 200, a second provider operation |
| Four concurrent identical requests | Four additional provider operations |
| Provider commits, then response is lost | 200 / `ok:true`, `errors:1`; no canonical UNKNOWN execution |
| Repeat after lost response | Another provider operation |
| Fresh Python process, same request | Another provider operation |

Total synthetic provider operations: 9. Canonical calls observed are only
`delivery-consent` and `delivery-read`; canonical execution/delivery command and
bulk audience-equivalence calls: 0. No claim is made that every ordinary repeated
campaign gesture must be deduplicated without an approved occurrence contract.
The decisive violation is dispatch outside that contract, and inability to
retain/reconcile the same canonical recipient execution after a lost response.

The Telegram double records its accepted operations in owned SQLite. The SDK
and post-send shadow mirror are not executed by the dynamic proof. Their active
source was inspected; the mirror does not precede or govern the original send.
No real customer population, cross-tenant exploit or production duplicate count
is inferred from this synthetic reproduction. The fixture removes itself.

## STOP, continuation and hygiene

B35 runtime/schema/contract changes are **not implemented**. Next separately
authorized cycle must establish the exact panel-broadcast actor/tenant,
campaign occurrence, recipient and channel authority against the existing A14
contract, then decide reuse or retirement. No heuristic tenant binding, new
schema, business action, throttle policy or automatic fallback is approved here.
B29–B34 and the six wave contracts are not reopened.

All seven owned PostgreSQL databases were dropped; the dedicated server, data,
socket and venv were removed. Owned production staging/backups were removed
after verified publication. The interrupted aggregate process and its children
are gone. No browser or watcher was started. The main checkout's 24 entries and
recorded dirty-file hashes are unchanged. None of the 17 old databases was
accessed. [Hygiene](evidence/package5-b34-final-hygiene.json).

```text
B34 PRODUCTION REMEDIATION: PASS
B34 LEGACY REVIEW IMPORT/SYNC: RETIRED
B34 LEGACY PROVIDER/CARD TENANT AUTHORITY: 0
B34 RETROACTIVE REVIEW MUTATION: 0
B34 SAME SOURCE/ID CHANGED PAYLOAD: CONFLICT — canonical AC4 ingress
B34 ORIGINAL REVIEW IMMUTABLE: YES
AC4 CANONICAL REVIEW OWNER: ENFORCED
LEGACY IMPORT CANONICAL REVIEW MUTATIONS: 0
AC4 CANONICAL INGRESS REGRESSION: PASS
B29 / B30 / B31 / B32 / B33: PRESERVED
NEW MODELS / FIELDS / ACTION CLASSES: 0 / 0 / 0
MIGRATION / BACKFILL: 0 / 0
PENDING MIGRATIONS: 0
SCHEMA DRIFT: NONE
PACKAGE 4 COMPLETE: YES
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL — B35
PACKAGE 5 COMPLETE: NO
ACTIVE BLOCKER: B35 / LEGACY PANEL BULK TELEGRAM SENDER
B35 IMPLEMENTATION / DEPLOYMENT: NOT STARTED
FINAL AGGREGATE REGRESSION: NOT RUN AFTER B35
REAL PRODUCTION REVIEW / APPOINTMENT / MESSAGE / PROVIDER MUTATIONS FOR PROOF: 0
MAIN DIRTY WORKTREE TOUCHED: NO
MAIN PRE-EXISTING DIRTY FILES PRESERVED: YES — 24 entries
PRE-EXISTING DATABASES TOUCHED: 0 — 17 protected
OWNED TEMP PROCESSES STILL RUNNING: 0
BACKGROUND WATCHERS LEFT: 0
OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0
OWNED TEMP DATABASES REMAINING: 0
PROCESS HYGIENE: 0
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
CHAPTER 6 COMPLETE: NO
```

Report/evidence/remainder → commit/push → STOP. Chapter 6 final acceptance remains
a separate cycle after a later clean Package 5 gate.
