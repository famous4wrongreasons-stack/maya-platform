# CYCLE 06 BLOCKING PACKAGE 4 — P4-07 EXPENSE PERIOD DECLARATION EPOCH SCHEMA FOUNDATION REPORT

Status: **COMPLETE — production migration not applied; runtime unchanged**

Source checkpoint: `69cd0b82`

Report date: 2026-09-02

## 1. Scope

This cycle implements only the durable declaration-generation gap approved in:

`CYCLE-06-BLOCKING-PACKAGE-4-P4-07-EXPENSE-PERIOD-DECLARATION-EPOCH-SCHEMA-PROPOSAL.md`.

The additive foundation consists of:

- nullable-for-history `ExpensePeriodDeclaration.declarationEpoch`;
- append-only `ExpensePeriodDeclarationInvalidation` facts;
- tenant-and-exact-period-qualified contiguous generation claims;
- tenant-qualified immutable ActionExecution bindings;
- database guards coupling invalidation and current-declaration deletion in one
  transaction.

P4-07 runtime, the accepted Shadow `3/3`, the ALL-3 executable proof and
production execution owners were not changed. P4-02 through P4-06 were not
changed.

## 2. Durable generation contract

The first canonical declaration for an exact tenant/whole-tenant period uses
epoch `0`. PostgreSQL derives the only admissible current epoch under the
existing tenant expense-ledger transaction lock:

```text
MAX(nextDeclarationEpoch) for exact tenant/period, or 0
```

The declaration insert guard rejects a stale or forged epoch and requires the
exact same-tenant `declare_expense_period_complete` ActionExecution, exact
period target, allowed server policy, non-dry-run state and executable or
successful lifecycle state.

An invalidation fact binds:

- exact tenant and whole-tenant period;
- invalidated declaration id and declaration ActionExecution;
- invalidating create/delete ActionExecution;
- `previousDeclarationEpoch -> nextDeclarationEpoch`;
- canonical create/delete reason.

The generation must advance by exactly one. One declaration execution can be
invalidated once and one tenant/period/next epoch can be claimed once. The
invalidation row cannot be updated or deleted. A non-null declaration epoch,
tenant, period and ActionExecution binding cannot be cleared or replaced.

The schema deliberately has no branch column: the approved declaration
contract is `branchScope = whole_tenant`. Cross-branch declarations therefore
cannot be represented as independent epochs; tenant and exact period are the
complete scope.

## 3. Atomic invalidation boundary

Canonical declaration deletion requires its exact invalidation row to exist in
the same transaction. A deferred constraint trigger also requires the claimed
declaration to be absent before commit. Therefore neither half can commit
alone:

```text
durable invalidation fact + exact current declaration deletion
```

Both operations use the same tenant expense-ledger advisory lock. Concurrent
invalidation attempts serialize, and only the attempt claiming the still-current
declaration can commit.

The invalidating execution must be a same-tenant canonical
`create_expense` or `delete_expense` execution with matching reason. The
invalidated execution must be the successful declaration execution for the
exact current row. Foreign keys and triggers reject cross-tenant, cross-period,
wrong-action and stale-generation bindings.

## 4. Historical compatibility

The migration adds a nullable column with no default. A new canonical row with
an ActionExecution binding must set its epoch, while a pre-existing historical
row remains nullable. The migration performs no
historical `UPDATE`, creates no invalidation facts, invents no ActionExecution
and assigns no fake epoch.

Historical declarations with `declarationEpoch = NULL` remain readable and
retain the prior compatibility behavior. The new canonical constraints apply
only when a non-null epoch is established. Existing Expense and declaration
rows are preserved.

## 5. PostgreSQL adversarial proof

All database work ran against explicitly named disposable local PostgreSQL
databases. Each database was owned by a bounded foreground command, removed by
its cleanup trap on success or failure, and separately verified absent.

| Check | Result |
| --- | --- |
| Targeted schema ratchet | PASS — `1/1` suite, `7/7` assertions |
| Clean replay | PASS — `66/66` migrations |
| Prisma migration status | UP TO DATE |
| Migrated database vs Prisma schema drift | NONE |
| Prisma schema validation | PASS |
| Targeted ESLint | PASS |
| Scripts TypeScript check | PASS |
| Historical null epoch | COMPATIBLE |
| New canonical declaration without epoch | REJECTED |
| Initial declaration generation | `0` |
| Concurrent initial declaration | ONE WINNER |
| Retry before invalidation | SAME EXECUTION |
| Missing/partial invalidation | REJECTED / ROLLED BACK |
| Valid first invalidation | `0 -> 1` |
| Re-declaration | stable epoch `1` execution |
| Re-declare without new invalidation | REJECTED |
| Second cycle | `1 -> 2` then epoch `2` |
| Concurrent invalidation | ONE WINNER |
| Third generation | `2 -> 3` then epoch `3` |
| Invalidation update/delete | REJECTED |
| Established epoch clear/replace | REJECTED |
| Established execution rebinding | REJECTED |
| Wrong tenant/period/action binding | REJECTED |
| Old invalidated `SUCCEEDED` execution rebound | REJECTED |
| Expense rows created by structural proof | `0` |
| Provider writes | `0` |
| Fake historical epoch/invalidation backfill | `0` |

The proof used the same ledger snapshot across declaration generations while
binding each re-assertion to its durable epoch. Epochs `0`, `1`, `2` and `3`
remained distinct and contiguous, so an invalidated old `SUCCEEDED`
ActionExecution cannot mask a later valid declaration even when business
ledger facts return to the same snapshot.

## 6. Safety boundary

- production migration applied: `NO`;
- production database writes: `0`;
- production Expense/value mutations: `0`;
- provider writes: `0`;
- P4-07 runtime changed: `NO`;
- P4-07 ALL-3 executable proof resumed: `NO`;
- Package 5 and Chapter 7 started: `NO`.

The next step requires a separately approved production migration Gate. This
cycle does not authorize migration apply, runtime alignment, executable proof
resume or production cutover.

## 7. Verdict

`DECLARATION EPOCH DURABLE: YES`

`APPEND-ONLY INVALIDATION DURABLE: YES`

`CONTIGUOUS RE-ASSERTION GENERATIONS: YES`

`OLD SUCCEEDED EXECUTION CAN MASK NEW DECLARATION: NO`

`FORGED EPOCH POSSIBLE: NO`

`HISTORICAL NULL EPOCH COMPATIBLE: YES`

`FAKE HISTORICAL EPOCH BACKFILL: NO`

`PRODUCTION MIGRATION APPLIED: NO`

`PRODUCTION EXPENSE/VALUE MUTATIONS: 0`

`READY FOR P4-07 DECLARATION EPOCH PRODUCTION MIGRATION GATE: YES`

## 8. Permanent process hygiene

All verification commands ran sequentially. No watcher, application server,
browser, Playwright, Chrome or background worker was started. Every yielded
foreground command was waited to completion before the next heavy stage.

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0`

`TEMP DATABASES CREATED: 5`

`TEMP DATABASES REMOVED: 5`

`TEMP DATABASES REMAINING: 0`

STOP. Production migration, runtime alignment, ALL-3 proof resume, production
cutover, next Package 4 family, Package 5 and Chapter 7 were not started.
