# CYCLE 06 BLOCKING PACKAGE 4 — EXPENSE ACTION BINDING SCHEMA FOUNDATION REPORT

Status: third schema foundation complete; runtime not started
Source checkpoint: `297e236b`
Report date: 2026-08-29

## 1. Authorized Model And Order

The accepted Package 4 Gate requires:

> a tenant-qualified, immutable binding from each financial/value domain
> operation to its `ActionExecution` (composite tenant/execution identity,
> unique where the business operation is one-to-one)

For existing sound domain contracts the Gate gives this order:
`BillingPayment`, `LoyaltyTransaction`, `Expense`, and
`ExpensePeriodDeclaration`.

The first two foundations were already complete at checkpoint `297e236b`.
This step therefore changes only `Expense`.

## 2. Relationship Decision

The binding is **one-to-one** between an `expenses.create` logical action and
the `Expense` record created by that action:

- one logical create action creates one expense row;
- one expense row has at most one canonical creation execution;
- one creation execution cannot be reused for a second expense row;
- after initial binding, neither the execution id nor tenant may be changed or
  cleared.

All historical expense rows remain compatible with
`actionExecutionId = NULL`. No historical row is assigned an invented
execution.

This column is explicitly the creation binding. It is not claimed as a binding
for the separate `expenses.delete` action. Durable delete evidence/identity is
a later Package 4 domain decision and is not implemented or inferred here.

## 3. Additive Schema Foundation

The Prisma model and migration add only:

- nullable `Expense.actionExecutionId`;
- composite tenant-qualified foreign key
  `(actionExecutionId, tenantId) -> ActionExecution(id, tenantId)`;
- `ON DELETE RESTRICT` and `ON UPDATE RESTRICT` for the execution;
- composite unique index `(actionExecutionId, tenantId)`;
- inverse optional `ActionExecution.expense` relation;
- database trigger permitting initial binding but rejecting replacement,
  clearing, or tenant movement after binding.

Migration:
`prisma/migrations/20260829220000_expense_action_binding/migration.sql`.

Existing expense business identities remain unchanged:

- `@@unique([tenantId, externalId])`;
- `@@unique([tenantId, idempotencyKey])`.

No generic financial workflow, operation table, backfill, or runtime path was
added.

## 4. Invariants Now Representable

| Invariant | Foundation proof |
|---|---|
| Tenant isolation | Composite FK rejects an execution from another tenant |
| One create execution -> one expense | Composite unique index rejects reuse for another expense row |
| Immutable creation provenance | Trigger rejects clearing or replacing an established binding |
| Historical compatibility | Legacy rows remain valid with null binding |
| Existing idempotency retained | Tenant/external and tenant/idempotency unique keys are unchanged |
| Canonical lifecycle reuse | Relation points to `ActionExecution`; no second execution kernel exists |

This foundation makes canonical creation ownership representable. It does not
migrate the expense HTTP routes, legacy AI Tool Runtime, delete behavior,
period declarations, approval flow, or any runtime execution.

## 5. Structural Verification

All checks ran sequentially on local disposable databases.

| Check | Result |
|---|---|
| Targeted expense schema ratchet | PASS — 1 suite / 4 tests |
| Clean database migration replay | PASS — all 55 repository migrations |
| Historical null binding | PASS |
| Initial null-to-execution binding | PASS |
| Cross-tenant execution binding | REJECTED by composite FK |
| Duplicate execution binding | REJECTED by unique index |
| Established binding clear | REJECTED by DB trigger |
| Established binding replacement | REJECTED by DB trigger |
| FK present after migration | PASS — exactly 1 |
| Trigger present after migration | PASS — exactly 1 |
| Unique execution-binding index | PASS — exactly 1 |
| Prisma schema validation | PASS |
| Migrated database vs `schema.prisma` drift | NONE |
| Targeted ESLint for the new structural spec | PASS |
| `git diff --check` | PASS |
| Temporary structural/drift databases remaining | 0 |

The full backend suite was intentionally not run. Application and scripts
typecheck were not run because no application/runtime TypeScript or scripts
were changed. The added TypeScript is a targeted Jest structural spec and was
compiled by the project test transform.

## 6. Safety Boundary

- The migration was applied only to disposable local empty databases.
- It was not applied to production or any persistent project database.
- No expense service/controller, AI tool, resolver, ingress, executor, billing,
  loyalty, subscription, certificate, referral, catalog, commerce, scheduler,
  webhook, or provider runtime was connected or modified.
- No payment, loyalty mutation, expense, subscription, certificate, recurring
  charge, credential change, or external financial/value side effect occurred.
- The completed `BillingPayment` and `LoyaltyTransaction` foundations and all
  Package 3 code remain unchanged.
- Canonical Action Ingress, server-derived policy/entitlement, approval
  binding, tenant isolation, `UNKNOWN != FAILED`, no blind retry, durable
  idempotency, no runtime legacy fallback, and L2.5 Shadow boundaries remain
  unchanged.
- A08 `pay_visit` remains physically disabled and registry `DENY`.

## 7. Checkpoint Verdict

`PACKAGE 4 THIRD SCHEMA FOUNDATION COMPLETE: YES`

`DOMAIN MODEL EXTENDED: Expense`

`BINDING SEMANTIC: EXPENSE CREATION`

`RELATIONSHIP: ONE-TO-ONE`

`TENANT-QUALIFIED ACTION BINDING: YES`

`UNIQUE ACTION BINDING: YES`

`ESTABLISHED BINDING IMMUTABLE AT DB LEVEL: YES`

`HISTORICAL NULL ROWS COMPATIBLE: YES`

`EXPENSE DELETE BINDING IMPLEMENTED: NO`

`GENERIC FINANCIAL WORKFLOW CREATED: NO`

`PRODUCTION MIGRATION APPLIED: NO`

`PACKAGE 4 RUNTIME IMPLEMENTATION STARTED: NO`

`PACKAGE 4 COMPLETE: NO`

`A08 PAYMENT WRITE: DISABLED`

`EXTERNAL FINANCIAL/VALUE SIDE EFFECTS: 0`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP.
