# CYCLE 06 BLOCKING PACKAGE 4 — P4-07 ALL-3 EXECUTABLE PROOF / CUTOVER GATE

Status: **BLOCKED — new period re-declaration identity contract gap; production cutover forbidden**

Source checkpoint: `537a001c`

Gate date: 2026-09-02

## 1. Safe local cycle completed

The three accepted non-executable Shadows are complete:

```text
create_expense
delete_expense
declare_expense_period_complete
```

Each Shadow enters through Canonical Action Ingress, uses server-derived
tenant/branch, actor, policy and immutable financial or period evidence, and
stops before domain mutation. The capabilities are `SHADOW_ONLY` with
`executorKey=shadow.none`. Targeted tests found zero divergence and zero
Expense, declaration, value or provider side effects.

`P4-07 SHADOW ACTION CLASSES: 3/3`

`SHADOW DIVERGENCES: 0`

## 2. Executable facts proven before the blocker

The isolated P4-07 executor is not wired into `ExpensesModule` or any
production mutation route. On disposable PostgreSQL it proved:

- concurrent/restarted create converges to one ActionExecution and one
  tenant-qualified Expense;
- Expense and ActionExecution are durably bound;
- delete locks and revalidates the exact immutable expense facts, physically
  deletes under the accepted Gate semantics, and writes pre-delete financial
  audit evidence in the same transaction;
- repeated delete returns the committed outcome without a second value
  effect;
- same-snapshot concurrent declarations converge;
- create/delete invalidate every overlapping current declaration atomically;
- tenant/branch injection and forged monetary facts fail closed;
- the local executor uses one serializable PostgreSQL transaction, the shared
  tenant expense-ledger advisory lock and only `NOT_CROSSED` attempts;
- no provider dispatch or legitimate `UNKNOWN` boundary exists.

The pre-cutover architecture ratchet still records one production bypass group
and four direct-mutation subgroups, detects a synthetic direct Prisma writer,
and narrowly keeps the disposable proof executor outside production wiring.

## 3. New contract gap

The final adversarial pass found a lifecycle case not defined by the accepted
Runtime Contract Gate:

1. owner declares exact period snapshot `S` complete;
2. a canonical expense mutation invalidates and physically removes that
   `ExpensePeriodDeclaration`;
3. later expense mutations can restore the ledger to the exact same rows and
   immutable facts `S` (for example create followed by the accepted physical
   delete);
4. a new explicit declaration computes the old logical identity because the
   current contract binds identity only to tenant, period and snapshot hash;
5. Canonical Ingress therefore returns the old `SUCCEEDED` ActionExecution;
6. the executor restores its old success result, but no current
   `ExpensePeriodDeclaration` row exists.

This is a false-success re-declaration: the period remains incomplete even
though the new assertion reports success. It cannot be dismissed as retry or
restart because an intervening durable invalidation ended the previous
declaration lifecycle.

The reproduction is retained in
`scripts/p4-07-all3-executable-proof.ts` and reports:

```text
status=BLOCKED
blocker=period_declaration_identity_repeats_after_snapshot_restoration
declarationReestablishmentAfterInvalidation=false
```

## 4. Required decision

P4-07 needs a narrow Contract Closure Gate for the identity of a declaration
cycle after invalidation. The decision must specify a deterministic durable
epoch/re-assertion identity that:

- makes retry/restart of one assertion converge;
- makes duplicate initiators for the same assertion converge;
- distinguishes a new assertion after durable invalidation even when the
  ledger later returns to an old snapshot;
- does not mutate or reuse the old succeeded ActionExecution as a new business
  event;
- preserves the physical invalidation semantics already approved.

Existing audit/action facts may or may not be sufficient to represent that
epoch. That is deliberately not decided here. Whether a schema change is
required remains a Contract Closure Gate verdict; inventing an epoch or adding
a migration inside this executable proof would exceed the approved Gate.

## 5. Verification

- clean disposable PostgreSQL replay: `65/65` migrations;
- executable create/delete/declaration and concurrency checks before the new
  adversarial case: PASS;
- declaration re-establishment after invalidation plus exact snapshot restore:
  BLOCKED as described above;
- targeted Jest: `7/7` suites, `64/64` assertions;
- application and scripts typecheck: PASS;
- targeted ESLint and Prisma validate: PASS;
- production Expense/value mutations: `0`;
- provider writes: `0`.

## 6. Verdict

`P4-07 ALL-3 EXECUTABLE PROOF: FAIL — CONTRACT GAP`

`ACTION CLASSES PROVEN: 2/3 COMPLETE; DECLARATION RE-ESTABLISHMENT BLOCKED`

`CREATE EXPENSE ONE-TIME: YES`

`EXECUTION↔EXPENSE BINDING: PROVEN`

`DELETE EXPENSE CONTRACT PROVEN: YES`

`DELETE PRE-FACT AUDIT: PROVEN`

`PERIOD DECLARATION CONTRACT PROVEN: NO`

`DECLARATION AFTER INVALIDATION CAN FALSE-SUCCEED: YES`

`DUPLICATE VALUE MUTATION POSSIBLE: NO`

`UNKNOWN REQUIRED: NO`

`LEGACY BYPASS RATCHET READY: YES`

`ADDITIONAL CONTRACT DECISION REQUIRED: YES`

`ADDITIONAL SCHEMA REQUIRED: UNDETERMINED`

`PRODUCTION EXPENSE/VALUE MUTATIONS: 0`

`PROVIDER WRITES: 0`

`PRODUCTION CUTOVER: NO`

`READY FOR P4-07 PRODUCTION CUTOVER: NO`

`NEXT PACKAGE 4 FAMILY STARTED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

## 7. Process hygiene

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0`

`TEMP DATABASES REMAINING: 0`
