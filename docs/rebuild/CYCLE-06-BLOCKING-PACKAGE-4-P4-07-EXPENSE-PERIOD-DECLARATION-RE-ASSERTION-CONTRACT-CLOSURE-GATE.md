# CYCLE 06 BLOCKING PACKAGE 4 — P4-07 EXPENSE PERIOD DECLARATION RE-ASSERTION CONTRACT CLOSURE GATE

Status: **COMPLETE — schema change required; runtime closure not started**

Source checkpoint: `40ed3497`

Gate date: 2026-09-02

## 1. Scope

This Gate closes only the declaration lifecycle ambiguity discovered by the
P4-07 ALL-3 executable proof:

```text
declare -> invalidate -> re-declare
```

The accepted P4-07 Shadow `3/3`, create contract, physical delete contract,
pure PostgreSQL outcome semantics, approval rules and pre-cutover legacy
owners remain unchanged. No runtime, migration, schema, production data or
Expense value was changed in this Gate.

## 2. Canonical declaration lifecycle

An expense-period declaration is the **current assertion within one durable
declaration epoch**. Its business identity is:

```text
tenant
+ exact whole-tenant period
+ server-derived declaration epoch
+ exact expense-ledger snapshot hash
+ declaration contract version
```

The epoch is not a caller request id, random UUID, timestamp, mutable counter
held in memory, actor-supplied revision or ledger balance. It is a
tenant-and-period-qualified lifecycle generation owned by PostgreSQL.

- The first canonical declaration for a tenant/period uses epoch `0`.
- Retry, restart or another delivery while that declaration remains current
  sees the same epoch and snapshot and converges to the same execution.
- A canonical create/delete that changes a day inside the period atomically
  records one immutable invalidation fact, advances the period to the next
  epoch and removes the current declaration.
- Re-declaration reads the new epoch server-side. Even if later physical
  deletion restores the exact old ledger snapshot, the higher epoch produces
  a new logical identity and cannot resolve to the old succeeded execution.
- Repeated re-declaration without another invalidation remains in the same
  epoch and cannot create a third declaration.

Only invalidation of an actually materialized current declaration advances
the epoch. Ordinary ledger mutations while no declaration exists do not each
create artificial declaration generations; their current facts remain covered
by the ledger snapshot hash.

## 3. Invalidation is the epoch source of truth

The epoch boundary is one immutable `ExpensePeriodDeclarationInvalidation`
fact written in the same tenant-ledger transaction as:

1. the canonical create/delete mutation;
2. deletion of the exact current declaration;
3. invalidation audit evidence;
4. completion of the invalidating ActionExecution.

The invalidation fact binds the exact tenant, period, old declaration id, old
declaration ActionExecution, invalidating create/delete ActionExecution,
previous epoch, next epoch and canonical reason. The next epoch must equal the
previous epoch plus one.

No separate public `invalidate` action is introduced. The fact remains a
derived atomic effect of `create_expense` or `delete_expense` as defined by the
original P4-07 Gate.

## 4. Why existing durable state is insufficient

The current schema cannot honestly derive this lifecycle generation:

- `ExpensePeriodDeclaration` is physically deleted and has no epoch,
  generation, invalidated-at or durable tombstone field;
- its old ActionExecution remains uniquely `SUCCEEDED`, so a restored ledger
  snapshot reproduces the old identity;
- `Expense` rows cannot provide history after accepted physical delete;
- current `AuditLog` metadata is optional JSON, is not tenant-qualified to an
  ActionExecution by FK, has no per-period sequence constraint, and is not
  protected as append-only by a database trigger;
- timestamps, CUID/UUID ordering and PostgreSQL transaction ids are not an
  approved business generation contract;
- an in-memory counter or initiator-provided epoch would fail restart,
  concurrency and authority requirements.

Treating an audit convention as the sole current-value owner would therefore
weaken, rather than close, the contract.

`CAN EXISTING DURABLE STATE DERIVE DECLARATION EPOCH: NO`

`ADDITIONAL SCHEMA REQUIRED: YES`

## 5. Concurrency and idempotency contract

All declaration, create and delete executors continue to acquire the same
tenant expense-ledger transaction lock.

- Concurrent first declarations derive epoch `0`; one current declaration is
  allowed and duplicate delivery converges through the canonical action and
  database unique claims.
- Invalidation locks the current declaration, writes exactly one next-epoch
  fact, deletes that declaration and commits all effects atomically.
- A planner that read epoch `n` before concurrent invalidation must re-check
  the current epoch and snapshot under the lock and fail closed as stale.
- A planner after invalidation derives `n + 1`.
- Concurrent re-assertions for `n + 1` permit one current declaration.
- A second invalidation/re-assertion cycle produces `n + 2`; it cannot collide
  with any prior succeeded execution.
- Missing, duplicated, non-contiguous or cross-tenant epoch facts fail closed.

The initiator never supplies `declarationEpoch`, `previousEpoch`,
`nextEpoch`, invalidation execution ids or epoch identity. Canonical Ingress
receives only the server-resolved form.

## 6. Historical compatibility

Historical declarations may retain a nullable epoch binding until a
controlled reconciliation decision. No fake epoch or invalidation event is
backfilled. The P4-07 Gate found zero production declarations and zero
production expenses at its read-only checkpoint, but the migration must still
be additive and preserve any rows that appear before application.

A historical declaration with no epoch cannot be silently treated as epoch
`0` and invalidated canonically. It must fail closed for explicit correlation,
or remain under the pre-cutover legacy owner until the separately approved
cutover procedure handles it.

## 7. Required executable regressions after schema foundation

1. first declaration creates one execution and one epoch-`0` declaration;
2. retry and restart before invalidation return that execution;
3. concurrent first declaration leaves one current row;
4. invalidation records one immutable `0 -> 1` fact and removes the row;
5. re-declaration uses epoch `1`, even when the ledger snapshot equals epoch
   `0`;
6. retry/restart in epoch `1` returns the epoch-`1` execution;
7. a second re-declare without invalidation creates nothing;
8. repeated cycles produce contiguous distinct generations;
9. forged or stale generation fails before mutation;
10. wrong tenant/period/declaration/execution bindings fail;
11. concurrent create/delete/invalidate/re-declare leaves one valid outcome;
12. no `UNKNOWN`, provider write or production value mutation is introduced.

## 8. Verdict

`DECLARATION RE-ASSERTION CONTRACT: COMPLETE`

`DECLARATION EPOCH SOURCE OF TRUTH: DURABLE INVALIDATION GENERATION`

`DECLARATION EPOCH SERVER-DERIVED: YES`

`OLD SUCCEEDED EXECUTION CAN MASK NEW DECLARATION: NO — AFTER SCHEMA/RUNTIME FOUNDATION`

`CAN EXISTING DURABLE STATE DERIVE DECLARATION EPOCH: NO`

`ADDITIONAL SCHEMA REQUIRED: YES`

`P4-07 SHADOW ACTION CLASSES: 3/3 PRESERVED`

`P4-07 ALL-3 EXECUTABLE PROOF: NOT RESUMED`

`PRODUCTION EXPENSE/VALUE MUTATIONS: 0`

`READY FOR DECLARATION EPOCH SCHEMA FOUNDATION: YES`

`READY FOR P4-07 PRODUCTION CUTOVER: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

## 9. Process hygiene

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0`

`TEMP DATABASES REMAINING: 0`
