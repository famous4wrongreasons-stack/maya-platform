# Package 5 — B33 production PASS; fresh Final Gate STOP at B34

Owner-approved decision checkpoint: `8a5bd92c`, Option A. Schema commit:
`3e27bc9c`. Runtime commit: `0636e559`. Active release:
`/opt/maya-saas/releases/20260906-p5-b33-0636e559`.

## B33 completed scope

Exactly one new `ClientBookingConfirmation` model and eight persisted fields:
`id`, `tenantId`, `clientId`, `clientChannelLinkId`, `actionNamespace`,
`confirmationEvidenceJson`, `confirmationEvidenceHash`, `acceptedAt`.
No new action class or historical backfill. The additive migration has exact
Client/tenant/link foreign keys, immutable receipt guards and one global event
identity. Source acceptance rechecks the verified channel/Client inside its
transaction. Raw channel credentials and source text are not stored in evidence.

An explicit PWA confirmation persists its event identity before the first send.
A repeated gesture for the same pending offer, normal/stream fallback and page
restart retain that identity. A new explicit offer can allocate a new event;
existing duplicate-booking policy remains in force. Unavailable durable browser
storage fails closed. The common backend accepts the durable receipt before
model interpretation. Reprocessing uses its original source context.

The deterministic key binds receipt identity, exact tenant, canonical Client
and `maya.chat-confirmation/1:crm.appointment.create.v1`; regenerated model
parameters never enter the key. B31 still owns the normalized business intent
fingerprint. B32 still owns `client_channel` authority. The existing canonical
appointment action/Action Engine owns internal and CRM execution. HTTP and AI
continue using the same B31 create foundation; B33 adds no parallel executor.

Same receipt/same intent restores the execution/outcome. Changed time, service
or staff conflicts under the same key, including after UNKNOWN or SUCCEEDED.
A lost provider response continues through existing reconciliation; B33 cannot
escape UNKNOWN by rekeying the same confirmation. Client without Maya User works.
Historical chat events are not assigned fabricated receipts after cutover.

[Schema gate](CYCLE-06-BLOCKING-PACKAGE-5-B33-SCHEMA-LOCAL-GATE.md),
[runtime gate](CYCLE-06-BLOCKING-PACKAGE-5-B33-RUNTIME-LOCAL-GATE.md),
[receipt proof](evidence/package5-b33-receipt-schema.proof.json),
[runtime proof](evidence/package5-b33-runtime.proof.json),
[normal/stream proof](evidence/package5-b33-chat-confirmation.proof.json).

The owned real PostgreSQL proof includes 12 concurrent receipt submissions,
one receipt/key, competing intents, current authorization/revocation, and actual
child SIGKILL after receipt/before model, after synthetic model/before binding,
and after B31 binding/before execution result. The final crash leaves the same
EXECUTING execution; changed intent conflicts without another execution.
Python normal and streaming handlers both execute with synthetic model results
A/A/B. This is a composed local proof, not a live LLM/provider/HTTP-server test.
PWA durable sender behavior is exercised with a VM and synthetic storage.

## Mandatory local gates and production verification

Before runtime publication: targeted 6 suites / 50 tests; booking/appointment
41 / 385; architectural guards 79 / 429; Python booking 8, bridge 10 and routing
48 tests PASS. Lint, both typechecks, build, Prisma validation, migration status,
structural diff and full mandatory backend **375 suites / 3069 tests PASS**.
The documented deployment process repeated its complete mandatory gates. The
already documented installed Node 24.19 override avoided the known Node 24.15
V8 issue; no required check was skipped.

The schema was applied first after additive migration/replay, expected-only
pending set, drift NONE and production readiness checks. The new table had zero
receipts before runtime cutover. Post-apply pending 0, drift NONE; 81 repository
migrations and 84 accounted historical database entries. [Migration evidence](evidence/package5-b33-production-migration.json).

Canonical backend release deployment succeeded. Independent verification matched
**579/579 compiled JavaScript artifacts**. Backend and request-only PWA are active;
full legacy bot is inactive. Health/readiness PASS, error-priority entries 0,
spare port 3199 closed. Four Python artifacts, both published PWA variants and
proxy were checked against exact reviewed hashes. Three B33 Python functions
match repository source bytes. Both public PWA URLs return 200 (mayaos after its
existing redirect). PHP 8.3 syntax and all inline-script parsing PASS.

Production-only launcher code was preserved using narrow overlays. Beget rejected
`cp -p` while preparing a private backup, before any published file changed.
The retry verified all old hashes, used ordinary backup copies and mode-600
atomic candidates, then checked every new hash and PHP syntax. No verification
failure was waived. Source overlays and before/after hashes are committed.
[Deployed evidence](evidence/package5-b33-deployed-recheck.json).

No private booking endpoint, real appointment, provider write or business
mutation was invoked for production smoke. The approved schema migration and
runtime publication are the only production changes in this cycle.

## Fresh Final Gate: all 13 families inventoried

The gate restarted after B33 production PASS. Fresh inventory covers 563 non-spec
backend source modules, 224 HTTP decorator sites and 518 mutation-like AST call
sites. Counts include protocol/fact/hash/cache operations, not just business
writes. Wave implementation/fact foundations remain unchanged since B30.

| Family | Boundary covered by current inventory and local proof |
| --- | --- |
| A15 | Wave 3 staff-day intent, provider UNKNOWN and exact reread reconciliation |
| A16 | Wave 2 CRM access, canonical membership/target and source reducers |
| A17 | Wave 3 separate credential installation, activation, import and disconnect |
| A18 | Verified Client profile/consent/booking; B29–B33 and normal/stream initiators |
| A22 | Wave 1 settings/preferences and server-derived authority |
| A23 | Wave 1 work items; bounded inbox protocol/projections |
| A25 | Wave 2 explicit security actions; existing AC3 auth protocol |
| A26 | Wave 2 lifecycle and atomic TrialActivation; no tenant hard delete |
| reduced A27 | Wave 4 archive/inventory and canonical AC4 review owner; **B34 below** |
| A28 | Wave 4 prospective calendar configuration, accepted snapshots and object reconciliation |
| A29 | Wave 5 owner-approved corrections and immutable original evidence |
| A30 | Six approved AC6 maintenance classes, central policy, caps and fenced cleanup |
| A31 | Exact event/recovery/mirror facts, deduplication and one live reconciliation lease |

All six executable PostgreSQL proofs were rerun in newly created databases on
this cycle's owned port 55503. Each database clean-replayed all 81 migrations.
Results: Wave 1 6/6, Wave 2 13/13, Wave 3 8/8, Wave 4 12/12, Wave 5 1/1, Wave 6
6/6 PASS. Wave 6 includes 53 negative assertions, rollback/restart fencing,
concurrency, cascade bounds and immutable audit. Its runner changes only the
old disposable port literal 55486 to owned 55503 and separately asserts the
exact host/port/database before execution; no runtime retention rule changes.

The first Wave 3 run rejected its old bare-User consent fixture, correctly
following the previously accepted verified-channel contract. Only that proof
fixture was updated to seed synthetic verified link evidence and preserve a
negative bare-User case. The rerun passes all eight classes. Lint and script
typecheck passed after this proof-only edit; no deployed runtime changed.

Simultaneous cross-boundary/architectural regression passed **110 suites / 753
tests**. This includes Package 4 value boundaries, D1-A…D7-A constraints and
synthetic bypass rejection. It does not certify untested production paths.
[Fresh local results](evidence/package5-b33-final-local-checks.json),
[source inventory](evidence/package5-b33-fresh-final-inventory.json).

Fresh active Python inventory: 90 root modules / 70 non-test modules; 66 non-test
hashes unchanged since B32, with only the four B33 artifacts changed. The broader
read-only AST inventory records 100 route-registration sites, 817 mutation-like
calls and 121 SQL-mutation-like literals. Some literals are unreachable retired
bodies or documentation. Realtime/voice, cabinet, chat/stream/history, AI/journal,
worker/background startup, CommunicationDelivery and Package 4 surfaces were
included. Backend artifact hashes, active-root guards and both PWA/proxy variants
were checked. [Python hashes](evidence/package5-b33-final-production-python-inventory.json),
[Python call/route/SQL inventory](evidence/package5-b33-final-python-surface-inventory.json).

These are fresh inventory/local-proof results, **not aggregate certification**.
The first confirmed new blocker stops the remaining aggregate stages. Full
mandatory regression before B33 deployment is not relabelled as a Final Gate
PASS. Final aggregate regression was not run after B34 was confirmed.

## Exact B34 — parallel mutable review owner outside reduced A27 AC4

The accepted [Wave 4 contract](CYCLE-06-BLOCKING-PACKAGE-5-WAVE-4-A27-A28-RUNTIME-CONTRACT-GATE.md)
requires an authenticated, tenant + provider + external-review identity;
identical replay converges and changed evidence under that identity conflicts.
Review source facts remain immutable and text encrypted. This is an **AC4 fact
owner**, not a new Action Engine business action. Absence of an ActionExecution
alone is therefore not the blocker.

The active production route remains:

`POST /api/panel/external_reviews/import`
→ actual `_panel_auth` / legacy owner-role check
→ `reputation.import_reviews`
→ `database.upsert_external_review`
→ separate SQLite `external_reviews` row.

Exact active-source anchors:

1. `webhook_server.py:3646` implements the import handler; it
   checks signed owner credentials and directly calls `reputation.import_reviews`.
2. `reputation.py:518` normalizes the source/review and calls the SQLite writer at
   `:539`; there is no canonical review-fact adapter or tenant binding.
3. `database.py:2658` defines a lazy `external_reviews` table with uniqueness
   `(source, external_id)` and no tenant column. Text/rating are local row fields.
4. `database.py:2684` implements the writer; its SQL at `:2701` uses
   `ON CONFLICT(source, external_id) DO UPDATE`, replacing rating/text/date/state.
5. Existing canonical `Package5Wave4ReviewFactService.accept` at
   `maya-saas-backend/src/package5-wave4/package5-wave4.service.ts:1737` instead
   compares immutable tenant-qualified evidence and raises a source conflict.
   The fresh Wave 4 PostgreSQL proof separately confirms that behavior.

Reachability is established from the active service, route registration and
read-only Nginx configuration: `barbershop-pwa` launches `pwa_api.py`, and
`rt.malesthetic.pro` location `/` forwards to its listener on port 8080. No
business endpoint was invoked in production. The two PWA bundles/PHP convenience
switch do not expose a matching import button/action; the separately published
Python route still exists. The launcher explicitly sets
`start_background_tasks=False`; the reputation monitor loop is **not claimed
active**. The refresh handler shares this importer, but only the explicit import
handler is dynamically reproduced here. [Active anchors](evidence/package5-b34-production-anchors.json).

### Local reproduction and limits

The [probe](evidence/package5-b34-review-import.probe.py) executes the real handler,
Telegram Widget signature verifier, founder-role resolver, importer/normalizer,
SQLite connection helper and writer on an automatically removed owned SQLite
fixture. All ten executed function source hashes match active production.
Synthetic founder configuration and an empty admin registry provide controlled
identity data; no authentication or role result is replaced. A signed non-owner
is rejected. The response projection and anonymization of non-PII fixture text
are synthetic. Network access is disabled. No production config/database,
provider, canonical backend or live HTTP server is used.

| Request using one `source + external_id` | Result | Durable local fact |
| --- | --- | --- |
| No credentials / signed non-owner | 401 / 403 | No database created |
| Signed owner, original rating/text | 200 | One original row |
| Exact repeat | 200 | Same row identity and content |
| Same source/id, changed rating/text | **200** | **Original row overwritten; no conflict** |

The primary violation is parallel mutable evidence ownership. No cross-tenant
exploit or affected production population is asserted merely from the absent
tenant column. No real customer review was read or changed for the proof.
[Observed results](evidence/package5-b34-review-import.proof.json).

Existing active-root guards pass because this importer/writer is outside their
specific retired-owner checks. This gap is now documented, not silently excluded
from coverage. No B34 runtime fix, migration, new model, adapter contract or new
action class is introduced. The next cycle must establish the exact source and
tenant authority for this legacy import, then decide reuse/retirement within the
existing approved AC4 contract. B29–B33 remain accepted and are not reopened.

## STOP and hygiene

All seven PostgreSQL proof databases belong to this cycle's dedicated cluster:
`maya_c06_b33_proof` and `maya_c06_p5_wave{1..6}_b33_final_20260906` on port 55503.
They were dropped, the dedicated server stopped, and its data/socket/venv removed.
Owned SQLite fixtures removed themselves. Owned production staging/backup
folders were removed after verified publication. No browser/watcher was started.
Main checkout's 24 status entries and recorded dirty-file hashes are unchanged;
none of the 17 pre-existing databases was accessed.
[Hygiene evidence](evidence/package5-b33-final-hygiene.json).

```text
B33 STABLE CONFIRMATION IDENTITY: ENFORCED
B33 SAME CONFIRMATION → SAME KEY: ENFORCED
B33 CHANGED MODEL INTENT: IDEMPOTENCY_CONFLICT
B33 UNKNOWN ESCAPE VIA NEW KEY: IMPOSSIBLE FOR THE SAME CONFIRMATION
B33 CLIENT WITHOUT MAYA USER: SUPPORTED
B33 PRODUCTION REMEDIATION: PASS
B31 IMMUTABLE IDEMPOTENCY: PRESERVED
B32 CLIENT_CHANNEL PRINCIPAL: PRESERVED
B29 / B30 / B31 / B32 PRODUCTION REMEDIATION: PASS
NEW MODELS / PERSISTED FIELDS / ACTION CLASSES: 1 / 8 / 0 — approved B33
MIGRATION APPLIED: YES — expected additive B33 migration only
FAKE HISTORICAL CONFIRMATION BACKFILL: 0
PENDING MIGRATIONS: 0
SCHEMA DRIFT: NONE
PACKAGE 4 COMPLETE: YES
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL — B34
PACKAGE 5 COMPLETE: NO
ACTIVE BLOCKER: B34 / REDUCED A27 LEGACY REVIEW FACT OWNER
B34 IMPLEMENTATION / DEPLOYMENT: NOT STARTED
AGGREGATE CERTIFICATION: NOT COMPLETED — STOP AT B34
FINAL AGGREGATE REGRESSION: NOT RUN AFTER B34
REAL PRODUCTION APPOINTMENT CREATES FOR PROOF: 0
REAL PRODUCTION PROVIDER WRITES FOR PROOF: 0
REAL PRODUCTION BUSINESS MUTATIONS FOR PROOF: 0
MAIN DIRTY WORKTREE TOUCHED: NO
MAIN PRE-EXISTING DIRTY FILES PRESERVED: YES — 24
PRE-EXISTING DATABASES TOUCHED: 0 — all 17 preserved
OWNED TEMP PROCESSES / WATCHERS / BROWSERS / DATABASES REMAINING: 0
PROCESS HYGIENE: 0
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
CHAPTER 6 COMPLETE: NO
```

Report/evidence/remainder → commit/push → STOP. Chapter 6 final acceptance remains
a separate cycle after a future clean Package 5 Final Gate.
