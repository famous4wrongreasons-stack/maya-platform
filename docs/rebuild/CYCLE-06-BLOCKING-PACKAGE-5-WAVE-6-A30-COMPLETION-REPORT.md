# CYCLE 06 — PACKAGE 5 WAVE 6 A30 PRODUCTION COMPLETION

Status: **WAVE 6 COMPLETE IN PRODUCTION — all six approved waves complete; Package 5 final gate remains pending**

Date: 2026-09-04. Accepted local runtime/proof: `bf21d9d6`. The user accepted
`0577f472` and explicitly resolved its owner mismatch in favor of AC6. Gated
deployment source: `3b54567174a0f7de45e4444241d74fba261bf0c3`.

Production release:
`/opt/maya-saas/releases/20260904-c06-p5-wave6-cutover-3b545671`.
Live application started at `2026-09-03T22:41:18.715Z`.

## 1. Canonical owner and scope

All six A30 classes now use the accepted AC6 owner:

| Class | Exact approved Policy V1 predicate at frozen server time T |
| --- | --- |
| purge_auth_sessions | expiresAt < T − 30 days OR revokedAt < T − 30 days |
| purge_phone_auth_codes | expiresAt < T − 24 hours OR consumedAt < T − 24 hours |
| purge_email_auth_codes | expiresAt < T − 24 hours OR consumedAt < T − 24 hours |
| purge_auth_flow_states | expiresAt < T − 24 hours OR consumedAt < T − 24 hours |
| purge_auth_rate_limit_buckets | windowEndsAt < T − 24 hours |
| purge_ingestion_quarantine | expiresAt < T |

Approved/versioned retention policy → AC6 maintenance coordinator →
MaintenanceRun → bounded/claimed MaintenanceItemClaim → canonical A30 executor
→ deletion only after the exact approved predicate and authority are rechecked.

AuthRefreshToken is only a claimed eligible-session cascade; it is never an
independent cleanup class. Null timestamps, exact-boundary timestamps and old
creation time alone do not establish eligibility. Default budget is 1,000
physical row effects including cascades; an initiator may only reduce it.

Auth CLI and quarantine scheduler remain initiators. The coordinator owns
durable preparation, leases/fencing, transaction and final outcomes. No new
Canonical Action Ingress / Action Engine route or ActionExecution history was
added. This preserves the explicitly approved AC6 exception and bf21d9d6 runtime.

## 2. Synchronization and deployment packaging

The existing ratchet already classifies AC6 correctly. Its exact coordinator
exception and direct-delete detection were retained without modification.
Existing regression cases still reject actual ORM/raw-SQL deletion; the
production scan includes schedulers. Compiled structural checks additionally
confirm that the scheduler delegates to EventStore and contains no Prisma,
transaction or deletion owner.

```text
AC6 MAINTENANCE COORDINATOR CLASSIFIED CANONICAL: YES
DIRECT DELETION BYPASS STILL DETECTED: YES
SCHEDULER/CRON AS DELETION OWNER POSSIBLE: NO
ARCHITECTURAL BYPASS PROTECTION WEAKENED: NO
```

The only backend source-tree change in this cycle is build packaging:
tsconfig.preflight.json now includes the two already accepted maintenance CLI
sources. Production can use `node dist/scripts/auth-retention-cleanup.js`
without dev dependencies; the compiled AI cleanup execute path fails closed.
Policy, coordinator, adapters, CLI logic, Python functions and ratchet are
byte-identical to the accepted bf21d9d6 versions.

## 3. Gates and preservation

All required local gates ran sequentially, followed by server deployment gates.
Runtime Contract Gate, Shadow 6/6 and PostgreSQL executable proof were not
repeated. Their accepted results remain the behavioral/concurrency evidence.

| Gate | Result |
| --- | --- |
| HEAD = fetched origin before cutover | 3b54567174a0f7de45e4444241d74fba261bf0c3 |
| Scoped backend/source cleanliness | PASS; unrelated worktree changes preserved |
| Wave 6 architectural ratchet / exact Policy V1 checks | 5/5 + 3/3 PASS |
| Production preflight, health/readiness | PASS |
| Pending migrations / independent schema drift | 0 / NONE |
| Common Foundation guards | All five MaintenanceRun/ItemClaim guards present |
| Prisma schema validation | PASS |
| Project lint | PASS |
| Application / scripts typecheck | PASS / PASS |
| Full regression | 322/322 suites, 2675/2675 tests PASS |
| Nest build / compiled preflight and CLI packaging | PASS |
| Fresh release npm ci, bcrypt load, Prisma generation | PASS |
| Strict release preflight before migration stage | PASS; expected pending set empty |
| Migration stage | No pending migrations to apply |
| Strict post-migration preflight / generated client load | PASS |
| Local/uploaded artifact checksums | 533/533 MATCH |
| Candidate readiness / owned process cleanup | PASS / PASS; port 3199 empty |
| Python replacement preflight | PASS; exact source and function hashes pinned |
| Final current-source/artifact/schema checks before switch | PASS |
| Atomic Nest release switch and live health/readiness | PASS |

The candidate readiness process explicitly disabled all five background
schedulers and used a connection with default_transaction_read_only=on. It
was stopped and waited before live cutover. Live scheduler configuration was
preserved; no maintenance run was manually requested for verification.

Comparison with the prior production release found **522 unchanged compiled
files**, exactly three changed A30 adapters (auth repository, auth service,
EventStore) and four additions (coordinator, policy, two CLIs). Thus the compiled
Packages 1–4 and Waves 1–5 implementations outside the intended A30 method
remain unchanged. Existing Wave 1–5 registrations remain 6 / 13 / 8 / 12 / 1.
The full regression also retains their existing baseline tests.

## 4. Python and launcher ownership

Read-only inventory covered relevant systemd definitions/drop-ins, cron
locations, active processes and maintenance references under the deployed bot
root. The active PWA entrypoint is pwa_api.py. It imports selected bot helpers
without initializing the bot scheduler; the four dynamic database lookups in
webhook_server use fixed unrelated function-name lists. The only rotation
scheduler is in bot.post_init, and the barbershop-bot unit is inactive.

Only the deployed database.py rotate_old_pii function was replaced atomically
with the accepted fail-closed body, after checking the exact original file and
function hashes. Prefix and suffix hashes confirm that all other production
Python code is unchanged. The replacement function hash is
`7fbb537e2abfea9c88f4e36007737a21b1fedae99319938ad39545e237ed8d3f`.
No Python module was imported or cleanup function executed for proof. The bot
was not started; the unrelated active PWA service was not restarted.

The alternate committed PostgreSQL blueprint implementation is also fail-closed
at bf21d9d6 and is not deployed as a current launcher. The historical
.deploy-loyalty snapshot and prior Nest release are archival/rollback artifacts,
not active imports, schedulers or mutating runtime fallbacks. They were not
deleted or used as fallback. Production-wide historical artifact cleanup is not
part of this wave.

## 5. Post-deploy structural/read-only verification

- Active release and health/readiness match the new Wave 6 release.
- Service active, automatic restart count 0; error-priority entries since
  activation 0 at the verification checkpoint.
- Pending migrations 0, drift NONE; 70 repository migrations and the 73 accepted
  applied-history records retained. No new schema or backfill.
- All six class/policy mappings and the pinned V1 digest verified in compiled
  production code: `9fc9734d27a82ce042ec46eb26b454329749ea877811733dbc70c06bf799f9e7`.
- All eight selected AC6 compiled artifacts exactly match the local gated build.
- Scan of 513 compiled production source files: direct A30 deletion outside
  the canonical coordinator 0. Both CLI entrypoints checked separately.
- Durable run/item creation, manifest/claim bounds, fencing, tenant scope,
  terminal predicate recheck and atomic outcome wiring verified structurally.
- Python legacy writer verified fail-closed by AST and exact function hash.
- **34/34 before/after control entries unchanged**, including auth records,
  recovery/source facts, business records, identity holds and maintenance audit.
  MaintenanceRun / MaintenanceItemClaim remained 0 / 0 at the checkpoint.

Only read-only snapshots and structural checks were used. No auth deletion,
anonymization, business command or provider write was performed for proof.
Normal future scheduled execution remains governed by the approved policy.

Central/versioned/allowlisted retention, server-derived clocks, no tenant
override, immutable audit, retry/restart/concurrency guarantees and no wider
cleanup are retained. The duplicate-deletion verdict relies on the accepted
local proof plus exact deployed runtime correspondence, not a production
destructive test. P02/P03 holds, no tenant hard delete, Client-owned
profile/consent, prospective configuration and immutable recovery evidence
remain preserved.

## 6. Completion and remainder

```text
PACKAGE 5 WAVE 6 COMPLETE: YES
WAVE 6 FAMILIES CUTOVER: A30
WAVE 6 ACTION CLASSES CUTOVER: 6/6
PRODUCTION EXECUTION OWNER: AC6 MAINTENANCE COORDINATOR
MAINTENANCE RUN/ITEM CLAIM OWNERSHIP: ENFORCED
PRODUCTION DIRECT DELETION BYPASSES: 0
LEGACY MUTATING OWNER ACTIVE: NO
LEGACY FALLBACK: NO
AUTH RETENTION POLICY V1: ENFORCED
DUPLICATE DELETION POSSIBLE: NO
TENANT/AUTHORITY ISOLATION: ENFORCED
REAL PRODUCTION BUSINESS/PROVIDER MUTATIONS FOR CUTOVER PROOF: 0
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY COVERAGE: 13/13
PACKAGE 5 FAMILIES REMAINING: 0
WAVE 7 CREATED: NO
PACKAGE 5 COMPLETE: NOT DECLARED — FINAL GATE PENDING
FINAL PACKAGE 5 GATE STARTED: NO
CHAPTER 7 STARTED: NO
PRE-EXISTING LOCAL TEMP/TEST DATABASES: 17
OWNED BY THIS CYCLE: 0
OWNED TEMP PROCESSES STILL RUNNING: 0
BACKGROUND WATCHERS LEFT: 0
OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0
OWNED TEMP DATABASES REMAINING: 0
```

See the POST-WAVE-6 REMAINDER CHECKPOINT. The next separately initiated cycle is
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION / COMPLETION GATE, followed by the
separate Final Chapter 6 Gate. No further implementation wave is created.
The 17 pre-existing local test DBs remain untouched; their provenance/cleanup
audit remains after Chapter 6. All owned local/SSH/test/candidate processes
finished, and no watcher or browser was started.
