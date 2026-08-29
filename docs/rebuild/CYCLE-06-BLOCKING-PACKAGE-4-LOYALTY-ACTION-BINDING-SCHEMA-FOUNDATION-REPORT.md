# CYCLE 06 BLOCKING PACKAGE 4 — LOYALTY ACTION BINDING SCHEMA FOUNDATION REPORT

Status: second schema foundation complete; runtime not started
Source checkpoint: `2539b128`
Report date: 2026-08-29

## 1. Authorized Gate Item And Model Order

The accepted Package 4 Gate requires:

> a tenant-qualified, immutable binding from each financial/value domain
> operation to its `ActionExecution` (composite tenant/execution identity,
> unique where the business operation is one-to-one)

The Gate then names the existing sound domain contracts in this order:
`BillingPayment`, `LoyaltyTransaction`, `Expense`, and
`ExpensePeriodDeclaration`.

`BillingPayment` was completed at checkpoint `2539b128`. The next and only
model in this step is therefore `LoyaltyTransaction`.

## 2. Relationship Decision

The `LoyaltyTransaction` binding is **one-to-many** from `ActionExecution` to
ledger rows.

One logical value action can legitimately create more than one ledger entry.
For example, fulfillment of one referral outcome can grant value to both the
inviter and invitee, while one controlled correction can require paired
entries. A unique constraint on `actionExecutionId` would falsely forbid that
domain result.

Each individual ledger row may have at most one execution binding, and that
binding becomes immutable after it is set. Multiple rows of the same tenant
may intentionally reference the same execution.

Historical loyalty rows remain compatible with `actionExecutionId = NULL`.
No historical row is backfilled with an invented execution.

## 3. Additive Schema Foundation

The Prisma model and migration add only:

- nullable `LoyaltyTransaction.actionExecutionId`;
- a composite tenant-qualified foreign key
  `(actionExecutionId, tenantId) -> ActionExecution(id, tenantId)`;
- `ON DELETE RESTRICT` and `ON UPDATE RESTRICT` for the referenced execution;
- a non-unique lookup index on `(tenantId, actionExecutionId)`;
- the inverse `ActionExecution.loyaltyTransactions` collection relation;
- a database trigger that permits initial binding but rejects replacement,
  clearing, or tenant movement after binding.

Migration:
`prisma/migrations/20260829200000_loyalty_transaction_action_binding/migration.sql`.

No unique execution-binding index was added. Existing
`@@unique([tenantId, idempotencyKey])` remains the business idempotency boundary
for individual ledger entries.

## 4. Invariants Now Representable

| Invariant | Foundation proof |
|---|---|
| Tenant isolation | Composite FK rejects an execution from another tenant |
| One execution may produce several entries | Two rows bound to the same execution are accepted |
| One row cannot silently change execution | DB trigger rejects clearing or replacing an established binding |
| Historical compatibility | Existing and new legacy-shape rows may retain a null binding |
| Canonical lifecycle reuse | Rows reference existing `ActionExecution`; no generic value workflow exists |
| Domain idempotency retained | Existing tenant/idempotency unique key is unchanged |

This foundation makes canonical ownership representable but does not migrate
the loyalty HTTP route, legacy AI Tool Runtime, Python loyalty jobs, external
authority, balance mutation, reconciliation, or runtime execution.

## 5. Structural Verification

All checks ran sequentially on local disposable databases.

| Check | Result |
|---|---|
| Targeted loyalty schema ratchet | PASS — 1 suite / 5 tests |
| Clean database migration replay | PASS — all 54 repository migrations |
| Historical null binding | PASS |
| Initial null-to-execution binding | PASS |
| Two ledger rows for one execution | PASS — 2 rows accepted |
| Cross-tenant execution binding | REJECTED by composite FK |
| Established binding clear | REJECTED by DB trigger |
| Established binding replacement | REJECTED by DB trigger |
| FK present after migration | PASS — exactly 1 |
| Trigger present after migration | PASS — exactly 1 |
| Unique execution-binding index | ABSENT — exactly 0 |
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

- The new migration was applied only to disposable local empty databases.
- It was not applied to production or any persistent project database.
- No loyalty service, controller, AI tool, Python job, resolver, ingress,
  executor, billing, expense, subscription, certificate, referral, catalog, or
  commerce runtime was connected or modified.
- No payment, loyalty mutation, expense, subscription, certificate, recurring
  charge, credential change, or external financial/value side effect occurred.
- Package 3 and the completed `BillingPayment` schema foundation remain
  unchanged.
- Canonical Action Ingress, server-derived policy/entitlement, approval
  binding, tenant isolation, `UNKNOWN != FAILED`, no blind retry, durable
  idempotency, no runtime legacy fallback, and L2.5 Shadow boundaries remain
  unchanged.
- A08 `pay_visit` remains physically disabled and registry `DENY`.

## 7. Checkpoint Verdict

`PACKAGE 4 SECOND SCHEMA FOUNDATION COMPLETE: YES`

`DOMAIN MODEL EXTENDED: LoyaltyTransaction`

`RELATIONSHIP: ACTIONEXECUTION ONE-TO-MANY LOYALTYTRANSACTION`

`TENANT-QUALIFIED ACTION BINDING: YES`

`UNIQUE ACTION BINDING: NO (INTENTIONALLY)`

`ESTABLISHED ROW BINDING IMMUTABLE AT DB LEVEL: YES`

`HISTORICAL NULL ROWS COMPATIBLE: YES`

`GENERIC FINANCIAL WORKFLOW CREATED: NO`

`PRODUCTION MIGRATION APPLIED: NO`

`PACKAGE 4 RUNTIME IMPLEMENTATION STARTED: NO`

`PACKAGE 4 COMPLETE: NO`

`A08 PAYMENT WRITE: DISABLED`

`EXTERNAL FINANCIAL/VALUE SIDE EFFECTS: 0`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP.
