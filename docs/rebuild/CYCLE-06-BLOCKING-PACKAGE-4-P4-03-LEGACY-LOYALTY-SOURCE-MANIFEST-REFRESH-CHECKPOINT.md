# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 LEGACY LOYALTY SOURCE MANIFEST REFRESH

Status: **PASS — 124-ROW SOURCE RECONCILED; SAFE DRY-RUN MAY RESUME**

Date: `2026-08-31`

Source checkpoint: `059b4780`

Branch: `codex/maya-brain-systemic-release-20260815`

## 1. Scope and write boundary

This checkpoint refreshed only read-only production evidence from:

- the live legacy SQLite ledger;
- the complete YClients client registry;
- canonical PostgreSQL identity, account, integration, and hold rows;
- the legacy scheduler log for the three newly observed source rows.

It did not write SQLite or PostgreSQL, create or update a loyalty balance,
create a ledger row or grant, invoke a provider mutation, deploy runtime code,
freeze a service, or begin P4-03 cutover.

Raw client ids, provider ids, Telegram ids, names, phone numbers, encrypted PII,
and free-text reasons are absent from this report. Stable source, principal,
provider, visit, and reason evidence is represented only by SHA-256 references.

## 2. Refreshed exact source snapshot

The live SQLite database was opened through a read-only URI. The 124 rows were
ordered by immutable source row id and reduced independently both directly and
per principal.

| Snapshot fact | Result |
| --- | ---: |
| Ledger rows | `124` |
| Current points | `65,161` |
| Legacy principals | `25` |
| Non-zero balances | `22` |
| Unique deterministic source identities | `124/124` |
| Missing client foreign rows | `0` |

Per-kind reconciliation:

| Legacy kind | Rows | Net points |
| --- | ---: | ---: |
| `earn` | `77` | `8,485` |
| `backfill` | `11` | `32,890` |
| `yc_import` | `21` | `48,296` |
| `redeem` | `4` | `-1,800` |
| `refund` | `3` | `1,000` |
| `welcome_cap_adjust` | `8` | `-23,710` |
| **Total** | **124** | **65,161** |

The prior 121-row set was reconstructed by removing only the three final
append-only rows. Its row count, `64,801` points, and every per-kind count/sum
exactly reproduce the accepted Production Data Continuity Gate. No deletion,
rewrite, or kind change is needed to explain the source drift.

## 3. Deterministic manifest contract

Namespace remains:

`legacy-sqlite:barbershop-bot-production:v1`

Every refreshed row binds:

- deterministic source-row identity;
- stable hashed legacy principal reference and P01-P25 audit alias;
- exact hashed provider-card reference;
- `SAFE` or `HOLD` partition;
- legacy kind and delta;
- source timestamp;
- hashed visit/reference identity when present;
- hash of the source reason.

Row identity remains compatible with the approved FULL_LEDGER idempotency
contract:

```text
SHA-256(
  "p4-03.full-ledger.v1" + NUL +
  "legacy-sqlite:barbershop-bot-production:v1" + NUL +
  legacy loyalty_transactions.id
)
```

The refreshed manifest envelope is:

`p4-03.legacy-loyalty-source-manifest.v2`

`REFRESHED MANIFEST SHA-256: e57f2114ac51d382daef0747e50fbb8315a792ee0fd24968d3f2991727cbf0e8`

An independent source-facts-only checksum is:

`SOURCE FACTS SHA-256: 7d15603d44ff6d6104f09662c244b8827e7b6c4cf79b9a11788c1258d859d3e9`

The current high-water source identity is:

`2944e3ed407ee75d722923ce4f3e2859beac58f99024f4c9a8f1f1173f9985df`

A final independent source re-read after the report was assembled reproduced
the same `124 / 65,161`, source-facts checksum, and high-water identity.

The high-water value is a verification marker under the freeze contract in
section 8. It is not permission to migrate while the writer keeps running.

## 4. Per-principal reconciliation

Aliases preserve the exact P01-P25 ordering from the accepted identity Gate.
They do not derive authority from balance, name, or phone similarity.

| Principal | Partition | Rows | Ending balance | New rows |
| --- | --- | ---: | ---: | ---: |
| P01 | SAFE | 11 | 0 | 0 |
| P02 | HOLD | 2 | 490 | 0 |
| P03 | HOLD | 1 | 90 | 0 |
| P04 | SAFE | 10 | 8,900 | 0 |
| P05 | SAFE | 1 | 0 | 0 |
| P06 | SAFE | 1 | 0 | 0 |
| P07 | SAFE | 5 | 1,300 | 0 |
| P08 | SAFE | 6 | 1,618 | 0 |
| P09 | SAFE | 5 | 5,148 | 0 |
| P10 | SAFE | 8 | 3,482 | 0 |
| P11 | SAFE | 7 | 2,375 | 0 |
| P12 | SAFE | 7 | 1,570 | 0 |
| P13 | SAFE | 7 | 2,590 | 0 |
| P14 | SAFE | 1 | 90 | 0 |
| P15 | SAFE | 10 | 3,516 | 0 |
| P16 | SAFE | 5 | 2,433 | 1 |
| P17 | SAFE | 5 | 469 | 0 |
| P18 | SAFE | 7 | 4,093 | 1 |
| P19 | SAFE | 5 | 4,504 | 0 |
| P20 | SAFE | 3 | 5,102 | 0 |
| P21 | SAFE | 3 | 4,085 | 1 |
| P22 | SAFE | 2 | 1,992 | 0 |
| P23 | SAFE | 7 | 8,564 | 0 |
| P24 | SAFE | 1 | 100 | 0 |
| P25 | SAFE | 4 | 2,650 | 0 |
| **Total** | **23 SAFE + 2 HOLD** | **124** | **65,161** | **3** |

Direct total and the sum of all 25 ending balances both equal `65,161`.

## 5. Classification of the three appended rows

All three rows belong to the same exact tenant, represented here as `T01`:
the tenant resolved by the one active `yclients` `CrmIntegration` for this
legacy deployment. No tenant slug or inferred tenant was used.

| Source identity | Principal | Tenant | Time (MSK) | Delta | Source/reason | Partition | Duplicate/replay |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| `1de382916c59c9c944b8da72139ef9b6748c368d988e21af5d122be8f3684a89` | P16 | T01 | `2026-08-31 12:30:19` | `+100` | scheduled attended-visit cashback; visit and reason hash bound | SAFE | no; same client/visit/kind count `1` |
| `ed5798255dabebc56ddee0d91ef939f351e878aa6c16a0cee7cabe09cd76dcca` | P18 | T01 | `2026-08-31 12:30:20` | `+100` | scheduled attended-visit cashback; visit and reason hash bound | SAFE | no; same client/visit/kind count `1` |
| `2944e3ed407ee75d722923ce4f3e2859beac58f99024f4c9a8f1f1173f9985df` | P21 | T01 | `2026-08-31 12:30:22` | `+160` | scheduled attended-visit cashback; visit and reason hash bound | SAFE | no; same client/visit/kind count `1` |

The rows match the current legacy `run_earning_job` contract:

- they were created during the configured daily `12:30 MSK` loyalty job;
- each is `earn`, has a distinct non-null provider visit reference, and has
  the exact standard attended-visit cashback reason shape;
- the partial unique index
  `idx_loyalty_tx_earn_unique(client_id, visit_record_id, type)` is present;
- scheduler evidence for the same run reports
  `clients=26`, `earned_points=360`, `care_offers=3`, `skipped_sub=0`,
  and `errors=0`;
- the three deltas sum exactly to the scheduler's `360`.

The evidence therefore classifies all three as normal post-snapshot legacy
runtime facts, not retries, duplicate visits, manual corrections, imports, or
hold-partition mutations.

## 6. Refreshed partition

| Partition | Principals | Rows | Net points |
| --- | ---: | ---: | ---: |
| Safe exact identities | `23` | `121` | `64,581` |
| P02/P03 continuity hold | `2` | `3` | `580` |
| **Total** | **25** | **124** | **65,161** |

`121 + 3 = 124`

`64,581 + 580 = 65,161`

The P02/P03 rows and balances are unchanged. None of the three new rows belongs
to their shared provider identity.

## 7. Identity and account coverage

The provider registry was refreshed completely through the production
read-only adapter:

| Provider/identity fact | Result |
| --- | ---: |
| Registry pages completed | `29` |
| Provider cards observed | `5,618` |
| Legacy principals with exactly one card candidate | `25/25` |
| Missing / multiple candidate matches | `0 / 0` |
| Unique provider identities | `24` |
| Collision groups | `1`, exactly P02/P03 |

Canonical PostgreSQL was checked in one read-only transaction:

| Canonical coverage | Result |
| --- | ---: |
| Active exact CRM integrations / tenants | `1 / 1` |
| Safe provider links | `23/23` |
| Safe canonical Clients | `23/23` |
| Safe LoyaltyAccounts | `23/23` |
| Merged safe Clients | `0` |
| Active hold / represented principals | `1 / 2` |
| Link or account for held provider identity | `0 / 0` |
| New row in unresolved identity without hold | `0` |

Every safe source row, including the three new rows, therefore has exactly one
canonical Client and exactly one zero/opening-state LoyaltyAccount target.
P02/P03 remain fail-closed under the live durable hold.

## 8. Explicit production migration snapshot boundary

`BOUNDARY METHOD: FULL LEGACY WRITER FREEZE + FINAL MANIFEST/HIGH-WATER CHECK`

High-water alone is rejected because the legacy scheduler could append a row
after the snapshot but before ownership cutover. The later production migration
apply must use this exact sequence:

1. prepare and verify the canonical migration and cutover artifacts before the
   maintenance window;
2. stop `barbershop-bot.service` gracefully and verify its exact MainPID and
   child tree are dead; do not use broad `pkill`/`killall`;
3. keep the legacy writer stopped from before the final source read until the
   canonical owner and initiator-only legacy runtime are verified;
4. while frozen, reopen SQLite read-only and recompute row count, points,
   per-kind/per-principal reconciliation, row identities, manifest SHA-256,
   source-facts SHA-256, and high-water source identity;
5. require exact equality with this approved checkpoint. Any additional,
   missing, or changed row causes STOP and a new manifest refresh before target
   writes;
6. migrate only the 121-row SAFE partition in deterministic source-row order
   inside the approved PostgreSQL transaction, preserving all 124 source facts
   as evidence while leaving the three HOLD rows unmigrated and immutable;
7. reconcile target safe rows and balances to `121 / 64,581`, keep canonical
   historical `actionExecutionId = NULL`, and prove replay produces zero new
   rows/value;
8. do not release the freeze if the canonical direct-mutation ratchet,
   P02/P03 fail-closed hold, migration reconciliation, or cutover verification
   is red;
9. restart the legacy service only from an artifact in which it is an
   initiator/bridge and cannot write the legacy loyalty ledger directly. No
   mutating fallback is permitted after ownership cutover.

This is a decision contract only. The service was not stopped or changed in
this refresh.

## 9. Historical 800-point finding

The missing refund remains a separate historical finding on P01. This refresh
preserves the existing four redeem and three refund facts exactly. It did not
create a synthetic `+800`, modify the control balance, or authorize a later
correction.

`REFUND 800 CORRECTED: NO`

## 10. Side effects and process hygiene

`PRODUCTION LOYALTY WRITES: 0`

`CANONICAL LEDGER MIGRATION: 0`

`PROVIDER WRITES: 0`

`P4-03 CUTOVER: NO`

Eighteen bounded helper command groups ran sequentially. They covered local
contract reads, read-only SQLite snapshots, complete provider registry reads,
one read-only PostgreSQL coverage transaction, scheduler-log evidence, and
manifest computation. One local quoting failure stopped before SSH and before
opening the source. Every started helper exited and was waited; no background
service, watcher, browser, Playwright process, or temporary database was
created.

`TEMP PROCESSES STARTED: 18`

`TEMP PROCESSES TERMINATED: 18`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES CREATED: 0`

`TEMP DATABASES REMAINING: 0`

## 11. Verdict

`LEGACY SOURCE MANIFEST REFRESHED: YES`

`LEGACY LEDGER ROWS: 124`

`LEGACY TOTAL POINTS: 65161`

`NEW ROWS CLASSIFIED: 3/3`

`SAFE ROWS: 121`

`SAFE POINTS: 64581`

`HOLD ROWS: 3`

`HOLD POINTS: 580`

`SAFE TARGET CLIENTS RESOLVABLE: YES — 23/23`

`SAFE TARGET LOYALTYACCOUNTS RESOLVABLE: YES — 23/23`

`MIGRATION SNAPSHOT BOUNDARY DEFINED: YES`

`PRODUCTION LOYALTY WRITES: 0`

`READY TO RE-RUN SAFE FULL_LEDGER DRY-RUN: YES`

`READY FOR P4-03 CUTOVER: NO`

STOP. FULL_LEDGER migration, P4-03 cutover, Package 5, and Chapter 7 were not
started.
