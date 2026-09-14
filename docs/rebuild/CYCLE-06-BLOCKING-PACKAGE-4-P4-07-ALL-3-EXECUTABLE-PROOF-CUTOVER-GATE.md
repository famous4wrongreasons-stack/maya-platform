# CYCLE 06 BLOCKING PACKAGE 4 — P4-07 ALL-3 EXECUTABLE PROOF / CUTOVER GATE

Status: **PASS — DECLARATION EPOCH RUNTIME ALIGNED; PRODUCTION CUTOVER NOT STARTED**

Source checkpoints: `537a001c`, `40ed3497`, `69cd0b82`, `0756cd0a`

Gate date: `2026-09-02`

## 1. Scope and preserved baseline

The accepted P4-07 Shadow remains complete for all three actions:

```text
create_expense
delete_expense
declare_expense_period_complete
```

Each Shadow still enters through Canonical Action Ingress, derives tenant,
branch, actor, policy, financial facts and period evidence server-side, and
stops before domain mutation.

`P4-07 SHADOW ACTION CLASSES: 3/3`

`SHADOW DIVERGENCES: 0`

The executable service remains isolated from `ExpensesModule` and production
routes. This cycle did not perform the P4-07 runtime cutover and did not mutate
any production Expense or value row.

## 2. Declaration epoch runtime alignment

The declaration executable input contract is versioned as:

`maya.declare_expense_period_complete-input/2`

The canonical planner now derives the current epoch from the greatest durable
`nextDeclarationEpoch` for the exact tenant and period, or `0` when no
invalidation exists. The declaration identity binds:

```text
p4-07 declaration contract v2
+ tenant
+ exact whole-tenant period
+ server-derived declaration epoch
+ exact immutable ledger snapshot hash
```

No declaration epoch, previous epoch, next epoch, or invalidation identity is
accepted by the public DTO. The executor re-derives the current epoch and the
full declaration identity after acquiring the tenant expense-ledger advisory
lock. Stale or forged epochs fail before declaration mutation.

New canonical declarations persist their exact epoch. A create/delete that
touches a declared period now:

1. locks and revalidates the mutation in the existing serializable transaction;
2. inserts one exact append-only invalidation fact;
3. deletes that exact current canonical declaration;
4. writes the invalidation audit;
5. finalizes the invalidating ActionExecution in the same transaction.

An overlapping historical null-epoch declaration fails closed for explicit
correlation. It is not silently treated as epoch `0` and receives no synthetic
history.

`DECLARATION EPOCH RUNTIME ALIGNED: YES`

`OLD SUCCEEDED EXECUTION CAN MASK RE-DECLARATION: NO`

`DECLARATION EPOCH SERVER-DERIVED: YES`

## 3. Executable PostgreSQL proof

The proof ran after a clean `66/66` migration replay in a disposable local
PostgreSQL database. It exercised all three action classes through Canonical
Action Ingress and the isolated canonical executor.

### Create

- concurrent delivery creates one ActionExecution and one Expense;
- restart returns the same committed result;
- exact tenant/branch, immutable amount/category/currency/date and actor
  authority are revalidated;
- forged monetary facts and cross-tenant branch injection fail closed;
- Expense, audit, invalidation, attempt and execution outcome share one local
  transaction.

### Delete

- deletion claims one exact Expense and rechecks its immutable creation facts;
- accepted physical deletion retains pre-delete financial audit evidence;
- retry/restart returns the same committed deletion result;
- no second delete or value effect occurs;
- any current canonical declaration is invalidated durably before removal.

### Declare / invalidate / re-declare

- first declaration creates one epoch-`0` execution and declaration;
- retry, restart and concurrent delivery converge;
- invalidation advances `0 -> 1` and removes the current row atomically;
- a create followed by the accepted physical delete restores the exact old
  ledger snapshot, but re-declaration still gets a different epoch-`1`
  identity;
- retry of epoch `1` returns that new declaration;
- the next invalidation advances `1 -> 2`;
- re-declaration at epoch `2` is stable, and a second re-declare without
  invalidation creates nothing;
- a forged epoch `99` is rejected by executor re-derivation;
- durable invalidation generations are exactly contiguous `[0 -> 1, 1 -> 2]`.

The separate schema adversarial proof also exercised three full invalidation
cycles and reported re-assertion epochs `[1, 2, 3]`, one winner for concurrent
invalidation, immutable invalidation facts, historical null compatibility and
zero fake backfill.

## 4. Transaction and outcome boundary

All P4-07 mutations are pure PostgreSQL operations. The canonical executor
uses serializable transactions and the shared tenant expense-ledger advisory
lock. Action attempts remain `NOT_CROSSED`; success is recorded only in the
same transaction as domain and audit facts.

There is no provider dispatch in P4-07, so PostgreSQL commit/rollback is the
truth. No `UNKNOWN` state or reconciliation workflow is invented.

`UNKNOWN REQUIRED: NO`

## 5. Legacy bypass ratchet

The accepted pre-cutover baseline remains:

`1 production bypass group / 4 direct-mutation subgroups`

The ratchet still detects the legacy `Expense.create`, `Expense.delete`,
declaration upsert and declaration removal ownership. It also proves a
synthetic direct writer is caught and narrowly classifies the isolated proof
executor as non-production because neither `ExpensesModule` nor its controller
wires it.

`LEGACY BYPASS RATCHET READY: YES`

Production legacy owners remain unchanged until a separately approved cutover.

## 6. Verification

| Verification | Result |
| --- | --- |
| Production declaration-epoch migration | applied, pending `0`, drift `NONE` |
| Clean local migration replay | PASS — `66/66` |
| PostgreSQL declaration schema proof | PASS |
| PostgreSQL ALL-3 executable proof | PASS — `3/3` |
| Targeted Jest | PASS — `9/9` suites, `76/76` assertions |
| Application typecheck | PASS |
| Scripts typecheck | PASS |
| Targeted ESLint | PASS |
| Prisma validate | PASS |
| Production health/readiness | HTTP `200 / 200` |
| Production Expense/declaration/invalidation rows | unchanged at `0 / 0 / 0` |
| Production Expense/value mutations | `0` |
| Provider writes | `0` |

## 7. Verdict

`P4-07 SHADOW ACTION CLASSES: 3/3`

`DECLARATION EPOCH RUNTIME ALIGNED: YES`

`P4-07 ALL-3 EXECUTABLE PROOF: PASS`

`ACTION CLASSES PROVEN: 3/3`

`CREATE EXPENSE ONE-TIME: YES`

`DELETE EXPENSE CONTRACT PROVEN: YES`

`PERIOD DECLARATION CONTRACT PROVEN: YES`

`OLD SUCCEEDED EXECUTION CAN MASK RE-DECLARATION: NO`

`DUPLICATE VALUE MUTATION POSSIBLE: NO`

`UNKNOWN REQUIRED: NO`

`LEGACY BYPASS RATCHET READY: YES`

`PRODUCTION EXPENSE/VALUE MUTATIONS: 0`

`READY FOR P4-07 PRODUCTION CUTOVER: YES`

`PRODUCTION CUTOVER PERFORMED: NO`

`P4-02–P4-06 MODIFIED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

## 8. Process hygiene

All test, typecheck, migration replay, proof and remote verification commands
ran sequentially. One ALL-3 database was created and removed after use; one
first schema-proof database failed safely on the newly required input field,
was removed, and the corrected second schema-proof database passed and was
removed. Together with the three structural-clone attempts, six temporary
databases were created and all six were deleted. No browser, Playwright,
watcher, background server, or orphaned test worker remains.

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0`

`TEMP DATABASES CREATED: 6`

`TEMP DATABASES REMOVED: 6`

`TEMP DATABASES REMAINING: 0`

STOP. P4-07 production runtime cutover requires a separate explicit approval.
