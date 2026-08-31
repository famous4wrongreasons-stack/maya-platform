# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 SAFE FULL_LEDGER DRY-RUN RE-RUN

Status: **PASS — SAFE PARTITION READY FOR A SEPARATE FROZEN PRODUCTION APPLY**

Date: `2026-08-31`

Source checkpoint: `3ae75a01`

Branch: `codex/maya-brain-systemic-release-20260815`

## 1. Scope and authority

This step re-ran only the deterministic FULL_LEDGER dry-run. It used the
accepted refreshed source manifest:

`CYCLE-06-BLOCKING-PACKAGE-4-P4-03-LEGACY-LOYALTY-SOURCE-MANIFEST-REFRESH-CHECKPOINT.md`

as the current source authority. The earlier blocked dry-run remains preserved
as historical evidence; this report does not rewrite it.

The bounded scope was:

- `23` exact safe canonical Clients;
- `23` exact client-owned LoyaltyAccounts;
- `121` safe legacy ledger facts;
- `64,581` safe points.

P02/P03 and their live continuity hold were excluded before target planning:

- held principals: `2`;
- held rows: `3`;
- held value: `580` points.

No legacy or canonical database write, balance mutation, ledger insertion,
ActionExecution creation, grant, provider mutation, runtime enablement, service
freeze, deployment, or cutover occurred. Raw phone numbers, provider ids,
client ids, account ids, names, notes, and other PII are absent from this
report.

## 2. Current source and independent repeat

The legacy SQLite database was opened through a read-only URI with
`PRAGMA query_only = ON`. The complete provider registry was fetched through
the existing read-only adapter, and canonical PostgreSQL was inspected inside
a `SERIALIZABLE READ ONLY DEFERRABLE` transaction.

| Source fact | First run | Independent repeat |
| --- | ---: | ---: |
| Complete rows | `124` | `124` |
| Complete value | `65,161` | `65,161` |
| Principals | `25` | `25` |
| Safe rows | `121` | `121` |
| Safe value | `64,581` | `64,581` |
| Hold rows | `3` | `3` |
| Hold value | `580` | `580` |
| Provider registry pages | `29` | `29` |
| Provider cards observed | `5,618` | `5,618` |

The dry-run source-row envelope checksum was identical on both complete runs:

`b4870e5210da42ef8c9b2b879525f3ab4c333bb8d26f299b6504879597a5b766`

The current high-water migration identity exactly reproduced the accepted
refreshed checkpoint:

`2944e3ed407ee75d722923ce4f3e2859beac58f99024f4c9a8f1f1173f9985df`

No source fact changed during either run.

## 3. Exact source-to-target resolution

Each legacy principal first resolved to exactly one provider card using the
accepted deterministic identity contract. The provider external identity was
then resolved through the existing tenant-qualified `CrmClientLink`, followed
by the established `(tenantId, clientId)` LoyaltyAccount binding.

| Resolution edge | Result |
| --- | ---: |
| Safe principals with one exact provider identity | `23/23` |
| Safe provider identities with one active canonical link | `23/23` |
| Safe canonical Clients | `23/23` |
| Safe client-owned LoyaltyAccounts | `23/23` |
| Safe source rows with an exact target account | `121/121` |
| Merged safe Clients | `0` |
| Cross-tenant target resolutions | `0` |
| Ambiguous safe resolutions | `0` |
| Safe account opening aggregate | `0` |

All 23 accounts had balance `0` at dry-run time. The historical plan therefore
starts from the approved neutral account state; account establishment did not
preload or duplicate legacy value.

## 4. Historical row mapping

The plan keeps one target fact for every safe source fact, ordered by immutable
legacy row id. It preserves the accepted semantic mapping without generating
new business actions:

| Legacy kind | Canonical historical kind | Rows | Net points |
| --- | --- | ---: | ---: |
| `earn` | `earn` | `77` | `8,485` |
| `backfill` | `backfill` | `9` | `32,710` |
| `yc_import` | `import` | `20` | `47,896` |
| `redeem` | `redeem` | `4` | `-1,800` |
| `refund` | `refund` | `3` | `1,000` |
| `welcome_cap_adjust` | `legacy_cap_adjustment` | `8` | `-23,710` |
| **Total** |  | **121** | **64,581** |

Every planned row contains deterministic migration identity, tenant-qualified
Client and account targets, unchanged delta, replayed `balanceAfter`, the
approved historical kind, original MSK instant converted to UTC, hashed source
reason, and a hashed/namespaced provider-record reference where present.

Historical rows deliberately plan:

`actionExecutionId = NULL`

`actorUserId = NULL`

They are imported provenance, not retroactively invented Action Engine
executions. A later apply must encrypt historical reason material and must not
persist plaintext source notes.

The deterministic target-plan checksum was identical on both complete runs:

`2f7368d1ed7ce82fe0345cfe04cbcd66029bcbb70dc15f34e4eec39fd4c03ff2`

## 5. Per-client reconciliation

The following aliases are the accepted non-PII P01-P25 audit aliases from the
refreshed manifest. P02/P03 are not present because they are held before target
planning.

| Principal | Source rows | Planned rows | Source balance | Planned balance | Exact account |
| --- | ---: | ---: | ---: | ---: | --- |
| P01 | 11 | 11 | 0 | 0 | yes |
| P04 | 10 | 10 | 8,900 | 8,900 | yes |
| P05 | 1 | 1 | 0 | 0 | yes |
| P06 | 1 | 1 | 0 | 0 | yes |
| P07 | 5 | 5 | 1,300 | 1,300 | yes |
| P08 | 6 | 6 | 1,618 | 1,618 | yes |
| P09 | 5 | 5 | 5,148 | 5,148 | yes |
| P10 | 8 | 8 | 3,482 | 3,482 | yes |
| P11 | 7 | 7 | 2,375 | 2,375 | yes |
| P12 | 7 | 7 | 1,570 | 1,570 | yes |
| P13 | 7 | 7 | 2,590 | 2,590 | yes |
| P14 | 1 | 1 | 90 | 90 | yes |
| P15 | 10 | 10 | 3,516 | 3,516 | yes |
| P16 | 5 | 5 | 2,433 | 2,433 | yes |
| P17 | 5 | 5 | 469 | 469 | yes |
| P18 | 7 | 7 | 4,093 | 4,093 | yes |
| P19 | 5 | 5 | 4,504 | 4,504 | yes |
| P20 | 3 | 3 | 5,102 | 5,102 | yes |
| P21 | 3 | 3 | 4,085 | 4,085 | yes |
| P22 | 2 | 2 | 1,992 | 1,992 | yes |
| P23 | 7 | 7 | 8,564 | 8,564 | yes |
| P24 | 1 | 1 | 100 | 100 | yes |
| P25 | 4 | 4 | 2,650 | 2,650 | yes |
| **Total** | **121** | **121** | **64,581** | **64,581** | **23/23** |

Per-client row counts and balances match, not only the aggregate.

## 6. Deterministic idempotency and replay

The approved namespace remains:

`legacy-sqlite:barbershop-bot-production:v1`

Each historical target identity is:

```text
SHA-256(
  "p4-03.full-ledger.v1" + NUL +
  "legacy-sqlite:barbershop-bot-production:v1" + NUL +
  legacy loyalty_transactions.id
)
```

| Idempotency proof | Result |
| --- | ---: |
| Planned identities | `121` |
| Unique planned identities | `121` |
| Existing canonical rows with a planned identity | `0` |
| DB uniqueness authority | `(tenantId, idempotencyKey)` present |
| Simulated first run new rows | `121` |
| Simulated replay new rows | `0` |
| Simulated replay balance change | `0` |

This proves deterministic convergence without performing the first run.

## 7. Hold isolation and historical 800-point finding

The live unresolved hold remained the partition authority:

`P02/P03 ROWS INCLUDED: 0`

`P02/P03 VALUE INCLUDED: 0`

`UNRESOLVED VALUE PRESERVED: 580`

No held provider identity resolved to a safe Client or LoyaltyAccount. No
fallback target or shared provider-card merge was introduced.

The P01 missing-refund finding remains historical evidence only. The dry-run
plans the four existing redeem facts and three existing refund facts exactly as
they exist. It creates no synthetic `+800` fact and does not modify P01.

`REFUND 800 CORRECTED: NO`

## 8. Production apply boundary contract

The legacy writer is still active, so this PASS does not authorize an apply
against a moving source. A later, separately authorized production apply must:

1. gracefully stop the exact `barbershop-bot.service` writer and record its
   MainPID/process tree;
2. wait for that exact process tree to terminate and verify it is dead;
3. keep the writer frozen through manifest verification, migration,
   reconciliation, and ownership cutover;
4. re-read the source in read-only mode and reproduce exact source bytes, count,
   aggregate, row identities, checksum, and high-water identity;
5. require equality with the approved refreshed manifest and this plan;
6. reject production apply if even one row is added, removed, or changed;
7. migrate only the `121 / 64,581` safe partition and leave P02/P03 read-only;
8. prove target `121 / 64,581`, per-client equality, and replay `0` before
   allowing canonical ownership;
9. restart only initiator-only legacy code with no mutating fallback.

The dry-run boundary comparator was exercised with both the repeated identical
snapshot and a one-row changed fixture:

| Boundary assertion | Result |
| --- | --- |
| Byte-equal immediate source reread | pass |
| Count-equal immediate source reread | pass |
| Checksum-equal immediate source reread | pass |
| One-row delta rejected | pass |
| Apply allowed when frozen manifest differs | no |

`LEGACY WRITER FREEZE REQUIRED FOR APPLY: YES`

## 9. Independent no-write proof

Both complete runs independently returned the same canonical baseline:

| Canonical structure | Result |
| --- | ---: |
| LoyaltyAccounts | `23` |
| LoyaltyAccount aggregate balance | `0` |
| LoyaltyTransactions | `0` |
| ActionExecutions | `528` |

The two successful runs and one initial local connection-string parsing failure
performed no database write. The failure occurred before a canonical query and
before plan construction. Provider access consisted only of the existing full
registry read.

`PRODUCTION LOYALTY WRITES: 0`

`PROVIDER WRITES: 0`

`FAKE HISTORICAL ACTIONEXECUTIONS: 0`

`P4-03 CUTOVER STARTED: NO`

## 10. Process hygiene

All helper commands ran sequentially in the foreground with bounded waits.
The failed dry-run exited before a database query; both successful complete
runs and their SSH/provider/database children exited and were waited. The
one-time local audit source is deleted after report verification. No watcher,
browser, Playwright process, local server, or temporary database was started.

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES REMAINING: 0`

## 11. Verdict

`SAFE LEDGER DRY-RUN: PASS`

`SOURCE SAFE ROWS: 121`

`TARGET PLANNED ROWS: 121`

`SOURCE SAFE VALUE: 64581`

`TARGET PLANNED VALUE: 64581`

`PER-CLIENT BALANCES MATCH: YES`

`SAFE TARGET ACCOUNTS RESOLVABLE: 23/23`

`P02/P03 ROWS INCLUDED: 0`

`P02/P03 VALUE INCLUDED: 0`

`UNRESOLVED VALUE PRESERVED: 580`

`MIGRATION IDEMPOTENCY PROVEN: YES`

`LEGACY WRITER FREEZE REQUIRED FOR APPLY: YES`

`FAKE HISTORICAL ACTIONEXECUTIONS: 0`

`REFUND 800 CORRECTED: NO`

`PRODUCTION LOYALTY WRITES: 0`

`READY FOR SAFE FULL_LEDGER PRODUCTION APPLY: YES — ONLY AFTER EXACT FROZEN MANIFEST REVALIDATION`

`READY FOR P4-03 CUTOVER: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP. Production ledger migration and P4-03 cutover were not started.
