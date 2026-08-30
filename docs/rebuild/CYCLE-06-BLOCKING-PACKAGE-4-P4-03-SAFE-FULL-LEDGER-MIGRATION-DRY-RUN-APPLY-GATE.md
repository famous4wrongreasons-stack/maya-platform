# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 SAFE FULL_LEDGER MIGRATION DRY-RUN / APPLY GATE

Status: **DRY-RUN COMPLETE — APPLY BLOCKED BY 22 MISSING CANONICAL LOYALTY ACCOUNT TARGETS**

Source checkpoint: `350ec007`

Date: 2026-08-31

Branch: `codex/maya-brain-systemic-release-20260815`

## 1. Scope and safety boundary

This Gate built a deterministic read-only FULL_LEDGER plan for only the 23
safe legacy principals. It did not create or update a LoyaltyAccount,
LoyaltyTransaction, ActionExecution, grant, redemption, Client,
CrmClientLink, hold, provider record, or legacy SQLite row.

The live P02/P03 collision identity and all of its `3 rows / 580 points` were
excluded before transaction planning. The active continuity hold remained
the authority for that exclusion.

No raw name, phone, Telegram principal, provider client id, provider record
id, note, or other personal data is included in this report. `P01` through
`P25` retain the report-local stable aliases established by the accepted
identity continuity reports; aliases are not migration identity.

## 2. Deterministic source snapshot

The dry-run reloaded the full 29-page provider registry and the legacy SQLite
source in query-only mode. Every source principal again resolved to exactly
one provider card. The live hold split that exact set into 23 safe singleton
provider identities and the two held collision principals.

| Source fact | Result |
| --- | ---: |
| Legacy principals | `25` |
| Complete legacy ledger | `121 rows / 64,801 points` |
| Safe principals | `23` |
| Safe partition | `118 rows / 64,221 points` |
| Held principals | `2` |
| Held partition | `3 rows / 580 points` |
| Exact safe Client mappings | `23/23` |
| Safe mapping ambiguity | `0` |
| P02/P03 CrmClientLinks | `0` |
| Active unresolved holds | `1` |

The source was read again after planning and produced the same manifest, row
count, and aggregate. Its non-PII manifest is:

`8f9f8182e9811ec988e4e9a019b97ed160c365a029f7857bcb2bfa0e1ff2a597`

All legacy `at` values are naive ISO timestamps emitted by the source
deployment's `datetime.now()`. The source host is configured as
`Europe/Moscow` (`MSK +0300`). The dry-run therefore binds each original
timestamp hash and converts that exact local instant to UTC for the intended
canonical `createdAt`; it does not reinterpret the wall time as UTC.

## 3. FULL_LEDGER row contract

The plan contains one historical fact for every safe source row in source-id
order. It preserves the accepted mapping:

| Legacy kind | Canonical historical kind | Rows | Net points |
| --- | --- | ---: | ---: |
| `earn` | `earn` | `74` | `8,125` |
| `backfill` | `backfill` | `9` | `32,710` |
| `yc_import` | `import` | `20` | `47,896` |
| `redeem` | `redeem` | `4` | `-1,800` |
| `refund` | `refund` | `3` | `1,000` |
| `welcome_cap_adjust` | `legacy_cap_adjustment` | `8` | `-23,710` |
| **Total** |  | **118** | **64,221** |

For every planned row the manifest binds:

- tenant and exact canonical Client;
- canonical LoyaltyAccount id when one exists;
- mapped kind and unchanged delta;
- replayed per-principal `balanceAfter`;
- source timestamp hash and canonical UTC instant;
- a namespaced provider-record reference where the source contains one
  (`81` rows);
- a hash of the source reason, which a later apply must encrypt rather than
  store in plaintext;
- `actionExecutionId = NULL` and no actor, because these are imported
  historical facts rather than new business actions.

The deterministic plan manifest is:

`36c0ebc89c3182a0c18e79da318e7883bc0a11b7a07ab434304370875c18a993`

Rebuilding the manifest from the same immutable inputs produced the same
checksum.

## 4. Idempotency proof

The accepted namespace remains:

`legacy-sqlite:barbershop-bot-production:v1`

Each row identity is:

```text
SHA-256(
  "p4-03.full-ledger.v1" + NUL +
  source namespace + NUL +
  legacy loyalty_transactions.id
)
```

The dry-run proved:

| Idempotency fact | Result |
| --- | ---: |
| Planned identities | `118` |
| Unique identities | `118` |
| Existing canonical rows with those identities | `0` |
| DB unique constraint on `(tenantId, idempotencyKey)` | present |
| Simulated first run new rows | `118` |
| Simulated replay new rows | `0` |
| Simulated replay balance change | `0` |

This proves the deterministic row-identity and DB convergence contract. It
does not override the missing target-account blocker and does not authorize
production inserts.

## 5. Exact Client mapping and target-account blocker

All 118 source rows resolve deterministically to one of the 23 established
canonical Clients. The next required edge does not exist for 22 of those
Clients:

```text
legacy row -> canonical Client                    PASS 118/118
canonical Client -> canonical LoyaltyAccount     PASS 1/23
                                                  MISSING 22/23
```

The current schema owns LoyaltyAccount by required `userId + tenantId` and a
required Membership. The safe set contains one account-bound control Client
and 22 deliberately guest Clients with `userId = NULL`. Creating a User,
Membership, or loyalty account principal from phone/provider/legacy identity
would exceed the accepted authority contract and was not attempted.

| Target readiness | Principals | Rows | Net points |
| --- | ---: | ---: | ---: |
| Exact Client and existing LoyaltyAccount | `1` | `11` | `0` |
| Exact Client but no authorized LoyaltyAccount | `22` | `107` | `64,221` |
| **Safe plan total** | **23** | **118** | **64,221** |

The complete manifest therefore has 118 intended row specifications, but only
11 rows currently have a real tenant-qualified account target. Applying the
11-row zero-net control fragment alone would violate the approved all-safe
partition boundary and was not performed.

## 6. Per-principal reconciliation

| Principal | Source rows | Source ending balance | Canonical LoyaltyAccount target | Current target balance |
| --- | ---: | ---: | --- | ---: |
| `P01` | 11 | 0 | present | 0 |
| `P04` | 10 | 8,900 | missing | — |
| `P05` | 1 | 0 | missing | — |
| `P06` | 1 | 0 | missing | — |
| `P07` | 5 | 1,300 | missing | — |
| `P08` | 6 | 1,618 | missing | — |
| `P09` | 5 | 5,148 | missing | — |
| `P10` | 8 | 3,482 | missing | — |
| `P11` | 7 | 2,375 | missing | — |
| `P12` | 7 | 1,570 | missing | — |
| `P13` | 7 | 2,590 | missing | — |
| `P14` | 1 | 90 | missing | — |
| `P15` | 10 | 3,516 | missing | — |
| `P16` | 4 | 2,333 | missing | — |
| `P17` | 5 | 469 | missing | — |
| `P18` | 6 | 3,993 | missing | — |
| `P19` | 5 | 4,504 | missing | — |
| `P20` | 3 | 5,102 | missing | — |
| `P21` | 2 | 3,925 | missing | — |
| `P22` | 2 | 1,992 | missing | — |
| `P23` | 7 | 8,564 | missing | — |
| `P24` | 1 | 100 | missing | — |
| `P25` | 4 | 2,650 | missing | — |
| **Total** | **118** | **64,221** | **1 present / 22 missing** | **0 materialized** |

The independent per-principal source calculation sums to 64,221. The one
existing account matches its source ending balance of zero. The other 22
balances cannot match a canonical target because no such target exists.
Aggregate equality alone is therefore insufficient and the apply Gate fails.

## 7. Collision isolation and the 800-point finding

P02/P03 were excluded before row planning:

`P02/P03 ROWS INCLUDED: 0`

`P02/P03 VALUE INCLUDED: 0`

`P02/P03 HOLD STILL ACTIVE: YES`

`UNRESOLVED VALUE PRESERVED: 580`

The historical unmatched 800-point redemption remains one exact P01 source
fact. Its original negative row, source timestamp, and provider-record
reference are present in the 118-row manifest. No synthetic refund is present.

`REFUND 800 CORRECTED: NO`

## 8. Independent no-write verification

Production counts before and after the dry-run were identical:

| Production structure | Before | After |
| --- | ---: | ---: |
| Client | 23 | 23 |
| CrmClientLink | 23 | 23 |
| LoyaltyAccount | 1 | 1 |
| LoyaltyAccount aggregate balance | 0 | 0 |
| LoyaltyTransaction | 0 | 0 |
| LoyaltyRedemptionGrant | 0 | 0 |
| LoyaltyRedemption | 0 | 0 |
| ActionExecution | 509 | 509 |
| Active unresolved hold | 1 | 1 |

An independent post-check again returned legacy `121 rows / 64,801 points`.
Production health/readiness remained `200/200`.

`PRODUCTION LOYALTY WRITES: 0`

`PROVIDER WRITES: 0`

`FAKE HISTORICAL ACTIONEXECUTIONS: 0`

`P4-03 EXECUTORS ENABLED: NO`

`LEGACY EXECUTION OWNERS CHANGED: NO`

## 9. Required next decision

The dry-run found a contract-to-target gap, not a source mapping or
idempotency gap. Before an apply can be reconsidered, a separate approved Gate
must decide how canonical loyalty value is owned for the 22 guest Clients:

1. establish independently authorized canonical User + Membership principals;
   or
2. explicitly amend the loyalty account ownership model so a guest Client can
   own value without inventing a User.

This Gate does not choose between those designs, create account principals, or
propose/apply schema changes.

## 10. Process hygiene

All commands ran sequentially in the foreground with bounded timeouts. The
two full dry-run attempts, their database children, the bounded anomaly
classification, and the independent database/legacy post-check all completed
and were waited. No watcher, browser, Playwright process, background server,
or temporary database was started.

`TEMP PROCESSES STARTED: 7`

`TEMP PROCESSES TERMINATED: 7`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES CREATED: 0`

`TEMP DATABASES REMAINING: 0`

## 11. Verdict

`SAFE LEDGER DRY-RUN: FAIL`

`SOURCE SAFE ROWS: 118`

`TARGET PLANNED ROWS: 118`

`TARGET-ACCOUNT-RESOLVABLE ROWS: 11/118`

`SOURCE SAFE VALUE: 64221`

`TARGET PLANNED VALUE: 64221`

`TARGET-ACCOUNT-RESOLVABLE VALUE: 0/64221`

`PER-CLIENT BALANCES MATCH: NO`

`P02/P03 ROWS INCLUDED: 0`

`P02/P03 VALUE INCLUDED: 0`

`UNRESOLVED VALUE PRESERVED: 580`

`MIGRATION IDEMPOTENCY PROVEN: YES — DRY-RUN/DB CONTRACT`

`FAKE HISTORICAL ACTIONEXECUTIONS: 0`

`REFUND 800 CORRECTED: NO`

`PRODUCTION LOYALTY WRITES: 0`

`READY FOR SAFE FULL_LEDGER PRODUCTION APPLY: NO`

`P4-03 CUTOVER STARTED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP. No production ledger migration was executed.
