# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 CONTROLLED SAFE FULL_LEDGER PRODUCTION MIGRATION

Status: **PASS — SAFE PARTITION MIGRATED; LEGACY WRITER REMAINS FROZEN**

Date: `2026-08-31`

Source checkpoint: `f7907346`

Branch: `codex/maya-brain-systemic-release-20260815`

## 1. Scope and safety boundary

This controlled window migrated only the accepted safe legacy loyalty
partition:

- `23` exact canonical Clients;
- `23` client-owned LoyaltyAccounts;
- `121` historical ledger facts;
- `64,581` points.

The live unresolved continuity hold remained the partition authority. P02/P03
and their `3 / 580` legacy partition were excluded before target planning and
before every target write.

This step did not perform P4-03 runtime cutover, create an ActionExecution,
correct the historical missing refund, issue or consume a grant, call a
provider write API, start Package 5, or start Chapter 7. Raw provider ids,
phone data, names, notes, Client ids, account ids, and other PII are absent
from this report.

## 2. Legacy writer inventory and freeze

The production process inventory was repeated before migration. The eight
P4-03 legacy mutating surfaces — scheduler, Python, bot/webhook/PWA entry
points and their loyalty helpers — are hosted by the single
`barbershop-bot.service` process. Its `bot.py` process imports the webhook
runtime; no second loyalty worker, mutation timer, cron entry, or other
production-reachable loyalty process was present.

Only this mutation owner was stopped. `maya-saas.service`, the read-only
organic observer, and telegram egress remained active.

| Freeze proof | Result |
| --- | --- |
| Legacy service | `barbershop-bot.service` |
| Stop result | graceful, exit status `0/SUCCESS` |
| ActiveState / SubState | `inactive / dead` |
| MainPID after stop | `0` |
| Remaining cgroup processes | `0` |
| Matching `bot.py` / webhook / loyalty writers | `0` |
| Separate loyalty timers or cron writers | `0` |

The writer was not restarted after migration.

`LEGACY LOYALTY WRITERS ACTIVE: 0`

## 3. Frozen manifest revalidation

After the writer was confirmed dead, the complete SQLite source was opened
read-only with `PRAGMA query_only = ON`. The provider registry was fetched
through the existing read-only adapter and the canonical target was inspected
in a read-only serializable transaction.

| Frozen input | Approved | Revalidated |
| --- | ---: | ---: |
| Total rows | `124` | `124` |
| Total value | `65,161` | `65,161` |
| Safe rows | `121` | `121` |
| Safe value | `64,581` | `64,581` |
| Hold rows | `3` | `3` |
| Hold value | `580` | `580` |
| Safe principals | `23` | `23` |
| Hold principals | `2` | `2` |
| Exact target Clients | `23` | `23` |
| Exact target accounts | `23` | `23` |

The exact approved fingerprints reproduced before the write:

- source facts checksum:
  `b4870e5210da42ef8c9b2b879525f3ab4c333bb8d26f299b6504879597a5b766`;
- high-water migration identity:
  `2944e3ed407ee75d722923ce4f3e2859beac58f99024f4c9a8f1f1173f9985df`;
- target-plan checksum:
  `2f7368d1ed7ce82fe0345cfe04cbcd66029bcbb70dc15f34e4eec39fd4c03ff2`.

An initial read-only validator revision serialized the exact same plan in a
different principal order and therefore failed the accepted plan checksum.
No write was attempted. The validator was aligned to the approved deterministic
principal ordering, then reproduced all three accepted fingerprints exactly.

`FROZEN MANIFEST MATCHED APPROVED SNAPSHOT: YES`

## 4. Transactional production apply

The apply used one PostgreSQL `SERIALIZABLE` transaction and a migration-scoped
advisory lock. Before insertion it asserted:

- exactly `121 / 64,581` planned facts;
- `121` unique deterministic migration identities;
- all `23` accounts exist under the same tenant as their plan rows;
- all `23` target accounts were locked;
- existing planned rows were exactly `0`;
- all target opening balances were `0`.

Each target row preserves the approved historical kind, delta, replayed
`balanceAfter`, source time converted to UTC, encrypted historical reason,
deterministic source identity, and namespaced provider-record reference where
present. Historical rows have `actionExecutionId = NULL` and no actor because
they are migration provenance, not invented runtime actions.

Within the same transaction:

- `121` LoyaltyTransaction rows were inserted in deterministic source order;
- the final balances of exactly `23` accounts were updated;
- any partial existing state, row-count mismatch, aggregate mismatch,
  target mismatch, or non-neutral opening account would have rolled the whole
  transaction back.

| Apply result | Value |
| --- | ---: |
| Existing planned rows before apply | `0` |
| Inserted historical rows | `121` |
| Updated accounts | `23` |
| Provider writes | `0` |
| Fake historical ActionExecutions | `0` |

## 5. Immediate and independent reconciliation

The post-commit verifier rebuilt the plan from the still-frozen source and
independently compared every planned identity, target account, kind, delta,
`balanceAfter`, encrypted-reason plaintext, provider reference, actor binding,
and ActionExecution binding.

| Reconciliation proof | Result |
| --- | ---: |
| Canonical safe rows | `121/121` |
| Canonical safe value | `64,581/64,581` |
| Per-client final balances | match |
| Aggregate canonical account balance | `64,581` |
| Duplicate tenant/idempotency identities | `0` |
| Field mismatches | `0` |
| Held migration identities present | `0` |
| Held value migrated | `0` |
| Historical rows bound to ActionExecution | `0` |
| ActionExecution rows created by migration | `0` |

P02/P03 remain only in read-only legacy provenance under the live hold:

`P02/P03 CANONICAL ROWS: 0`

`P02/P03 HOLD VALUE: 580`

The existing missing-refund finding remains unchanged; no synthetic `+800`
fact was created.

`REFUND 800 CORRECTED: NO`

## 6. Idempotent rerun proof

After the successful transaction, the complete frozen manifest, provider
mapping, target plan, and canonical ledger were rebuilt in a separate process.
The same three fingerprints reproduced again.

| Replay assertion | Result |
| --- | ---: |
| Existing planned identities | `121` |
| Would insert rows | `0` |
| Would change account balances | `0` |
| Partial migration state | no |
| Duplicate migration rows | `0` |

`MIGRATION RE-RUN CREATES DUPLICATES: NO`

## 7. Production verification

The runtime and database checks ran after the independent replay proof.

| Check | Result |
| --- | --- |
| `maya-saas.service` | active |
| `/api/health` | HTTP `200` |
| `/api/health/ready` | HTTP `200` |
| Priority service warnings/errors after window start | `0` |
| Schema-authority release migrations | `63` |
| Production applied migration journal rows | `66` |
| Pending migrations | `0` |
| Prisma migration status | database schema up to date |
| Schema drift | NONE (`migrate diff` exit `0`) |
| P02/P03 hold partition | active and still classifies `3 / 580` |
| Legacy writer after all checks | `inactive / dead`, MainPID `0` |

The currently active runtime release predates the already approved additive
client-owned LoyaltyAccount migration, so its bundled release preflight
correctly reports that known migration as absent from that old artifact. The
accepted schema-authority release contains the complete migration set and
passes release preflight, migration status, and drift. No runtime release was
switched in this data-only step.

## 8. Continuing freeze and next boundary

`barbershop-bot.service` remains deliberately inactive. Read-only legacy
provenance remains available, but no legacy mutating execution owner was
re-enabled. This prevents SQLite from advancing after the canonical snapshot.

The next P4-03 step, if separately authorized, must perform its own current-HEAD
build/deploy gate and production cutover. It must make Canonical Ingress and
Action Engine the only execution owner before any initiator-only legacy service
can return. This report does not perform or authorize that cutover.

## 9. Process hygiene

All audit, SSH, provider-read, Python, psql, curl, journal, Prisma status, and
drift commands ran sequentially in the foreground with bounded waits. Every
helper exited and was waited before the next heavy operation. The one-time
local migration helper was deleted after verification. No temporary database,
watcher, local server, browser, Chrome, or Playwright process was started.

`TEMP PROCESSES STARTED: 0`

`TEMP PROCESSES TERMINATED: 0`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES REMAINING: 0`

## 10. Verdict

`LEGACY LOYALTY WRITERS FROZEN: YES`

`FROZEN MANIFEST MATCHED APPROVED SNAPSHOT: YES`

`SAFE FULL_LEDGER MIGRATION APPLIED: YES`

`CANONICAL SAFE ROWS: 121/121`

`CANONICAL SAFE VALUE: 64581/64581`

`PER-CLIENT BALANCES MATCH: YES`

`P02/P03 MIGRATED ROWS: 0`

`P02/P03 VALUE PRESERVED: 580`

`MIGRATION RE-RUN CREATES DUPLICATES: NO`

`FAKE HISTORICAL ACTIONEXECUTIONS: 0`

`LEGACY WRITERS RE-ENABLED: NO`

`PRODUCTION HEALTH/READINESS: PASS`

`READY FOR P4-03 PRODUCTION CUTOVER: YES — SEPARATE BUILD/DEPLOY GATE REQUIRED`

`P4-03 CUTOVER STARTED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP. The safe FULL_LEDGER migration is complete. The legacy mutating owner
remains frozen, and no runtime cutover was started.
