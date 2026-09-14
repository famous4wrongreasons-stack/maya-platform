# CYCLE 06 BLOCKING PACKAGE 4 — BILLING ACTION BINDING SCHEMA FOUNDATION REPORT

Status: schema foundation complete; runtime not started
Source checkpoint: `bb07b45f`
Report date: 2026-08-29

## 1. Authorized Gate Item

The accepted Package 4 Gate requires, first:

> a tenant-qualified, immutable binding from each financial/value domain
> operation to its `ActionExecution` (composite tenant/execution identity,
> unique where the business operation is one-to-one)

This step implements only the first domain-limited instance of that foundation:
`BillingPayment` -> `ActionExecution`.

It does not attempt to migrate A19, A20, A21, A24 runtime, A27-V, or A32
together. It does not create a generic financial workflow or a second action
kernel. `ActionExecution` and `ActionAttempt` remain the only generic execution
lifecycle.

## 2. Additive Schema Foundation

The Prisma model and migration add:

- nullable `BillingPayment.actionExecutionId` for historical-row compatibility;
- a composite tenant-qualified foreign key
  `(actionExecutionId, tenantId) -> ActionExecution(id, tenantId)`;
- `ON DELETE RESTRICT` and `ON UPDATE RESTRICT` for the referenced execution;
- a composite unique index so one logical execution cannot own two billing
  payment rows;
- a database trigger that permits the initial `NULL -> ActionExecution`
  binding but rejects replacement, clearing, or tenant movement after the
  binding is established;
- the inverse optional one-to-one Prisma relation on `ActionExecution`.

Migration:
`prisma/migrations/20260829180000_billing_payment_action_binding/migration.sql`.

Historical `BillingPayment` rows are neither backfilled nor updated. The new
column is nullable and no runtime writes it in this step.

## 3. Invariants Now Representable

| Invariant | Foundation proof |
|---|---|
| Tenant isolation | Composite FK rejects an execution belonging to another tenant |
| One billing payment per logical execution | Composite unique index rejects a second payment bound to the same execution |
| Immutable forensic identity | DB trigger rejects clearing or replacing an established binding |
| Historical compatibility | Existing and newly inserted legacy-shape rows may keep a null binding |
| Canonical lifecycle reuse | Relation points to existing `ActionExecution`; no new workflow table exists |
| Safe rollback of application code | Additive nullable column may remain while older code ignores it |

This foundation makes identity and ownership representable. It does **not** yet
make billing an Action Engine-owned runtime path. It also does not by itself
solve provider-id-less reconciliation or the current billing create-time
`UNKNOWN` classification gap; those remain later Package 4 runtime/domain
steps and are not silently claimed complete here.

## 4. Structural Verification

All checks ran sequentially and locally.

| Check | Result |
|---|---|
| Targeted schema ratchet | PASS — 1 suite / 4 tests |
| Clean database migration replay | PASS — all 53 repository migrations |
| Historical null binding | PASS |
| Initial null-to-execution binding | PASS |
| Cross-tenant execution binding | REJECTED by composite FK |
| Duplicate execution binding | REJECTED by unique index |
| Established binding clear/replacement | REJECTED by DB trigger |
| FK present after migration | PASS — exactly 1 |
| Trigger present after migration | PASS — exactly 1 |
| Prisma schema validation | PASS |
| Migrated database vs `schema.prisma` drift | NONE |
| Targeted ESLint for the new structural spec | PASS |
| `git diff --check` | PASS |
| Temporary structural/drift databases remaining | 0 |

The full backend suite was intentionally not run. Application and scripts
typecheck were not run because no application/runtime TypeScript or scripts
were changed; the only TypeScript addition is the targeted Jest structural
spec, which compiled and passed through the project test transform.

## 5. Safety Boundary

- The migration was applied only to disposable local empty databases and was
  removed with them after verification.
- The migration was not applied to production or any persistent project
  database.
- No billing controller, service, scheduler, webhook, provider client,
  resolver, ingress, executor, loyalty, expense, subscription, certificate,
  referral, catalog, or commerce runtime was connected or changed.
- No payment, charge, loyalty mutation, expense, subscription, certificate,
  recurring charge, credential change, or external financial side effect was
  performed.
- Package 3 policy/approval fields and runtime remain unchanged.
- Canonical Action Ingress, server-derived policy/entitlement, approval
  binding, `UNKNOWN != FAILED`, no blind retry, durable idempotency, and L2.5
  Shadow boundaries remain unchanged.
- A08 `pay_visit` remains physically disabled and registry `DENY`.

## 6. Checkpoint Verdict

`PACKAGE 4 FIRST SCHEMA FOUNDATION COMPLETE: YES`

`GATE FOUNDATION ITEM IMPLEMENTED: 1`

`DOMAIN MODEL EXTENDED: BillingPayment`

`TENANT-QUALIFIED ACTION BINDING: YES`

`ONE-TO-ONE BINDING: YES`

`ESTABLISHED BINDING IMMUTABLE AT DB LEVEL: YES`

`HISTORICAL ROWS COMPATIBLE: YES`

`GENERIC FINANCIAL WORKFLOW CREATED: NO`

`PRODUCTION MIGRATION APPLIED: NO`

`PACKAGE 4 RUNTIME IMPLEMENTATION STARTED: NO`

`PACKAGE 4 COMPLETE: NO`

`A08 PAYMENT WRITE: DISABLED`

`EXTERNAL FINANCIAL SIDE EFFECTS: 0`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP.
