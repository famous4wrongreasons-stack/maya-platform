# CYCLE 06 BLOCKING PACKAGE 4 — EXPENSE PERIOD DECLARATION ACTION BINDING SCHEMA FOUNDATION REPORT

Status: fourth schema foundation complete; runtime not started
Source checkpoint: `eeef32e9`
Report date: 2026-08-29

## 1. Authorized Model And Semantics

The accepted Package 4 remainder checkpoint names
`ExpensePeriodDeclaration` as the next and only schema-foundation step.

The relation is **one-to-one** between the logical declaration action and the
current `ExpensePeriodDeclaration` row:

- one logical `expenses.period.complete` action owns at most one declaration;
- one declaration row has at most one creation execution;
- one execution cannot be reused for a declaration of another period;
- all historical rows remain compatible with `actionExecutionId = NULL` and
  receive no invented backfill;
- after the initial binding, neither execution id nor tenant can be changed or
  cleared.

The binding is creation provenance for the currently valid declaration. A
later expense mutation may still invalidate and delete that derived row. The
triggering immutable `ActionExecution` and audit evidence prove invalidation;
no declaration tombstone or delete binding was added.

## 2. Additive Schema Foundation

The Prisma model and migration add only:

- nullable `ExpensePeriodDeclaration.actionExecutionId`;
- composite tenant-qualified foreign key
  `(actionExecutionId, tenantId) -> ActionExecution(id, tenantId)`;
- `ON DELETE RESTRICT` and `ON UPDATE RESTRICT` for the execution;
- composite unique index `(actionExecutionId, tenantId)` for one-to-one
  execution ownership;
- inverse optional `ActionExecution.expensePeriodDeclaration` relation;
- database trigger permitting initial binding but rejecting replacement,
  clearing, or tenant movement after binding.

Migration:
`prisma/migrations/20260829230000_expense_period_declaration_action_binding/migration.sql`.

Existing declaration claims remain unchanged:

- `@@unique([tenantId, periodFromDay, periodToDay])`;
- `@@unique([tenantId, idempotencyKey])`.

No generic value workflow, operation table, tombstone, historical backfill, or
runtime path was added.

## 3. Structural Verification

All checks ran sequentially on a disposable local PostgreSQL database.

| Check | Result |
|---|---|
| Targeted schema ratchet | PASS — 1 suite / 4 tests |
| Clean database migration replay | PASS — all 56 repository migrations |
| Historical null binding | PASS |
| Initial null-to-execution binding | PASS |
| Cross-tenant execution binding | REJECTED by composite FK |
| Duplicate execution binding | REJECTED by composite unique index |
| Established binding clear | REJECTED by DB trigger |
| Established binding replacement | REJECTED by DB trigger |
| Tenant-qualified FK present | PASS — exactly 1 |
| Immutable-binding trigger present | PASS — exactly 1 |
| Prisma schema validation | PASS |
| Targeted ESLint | PASS |
| Migrated database vs `schema.prisma` drift | NONE |
| Temporary structural/drift databases remaining | 0 |
| `git diff --check` before report | PASS |

The full backend suite, full lint, typecheck, and build were intentionally not
run. No runtime TypeScript or scripts were changed; the added TypeScript is the
targeted structural Jest spec and compiled through the project test transform.

## 4. Safety Boundary

- The migration was applied only to disposable local databases and removed
  with them after verification.
- The migration was not applied to production or any persistent project
  database.
- No expense service/controller, AI tool, resolver, ingress, executor,
  billing, loyalty, subscription, certificate, referral, scheduler, webhook,
  provider, or other runtime path was connected or modified.
- No financial/value mutation or external side effect occurred.
- A08 payment write remains disabled.
- Package 5 and Chapter 7 were not started.

## 5. Checkpoint Verdict

`PACKAGE 4 FOURTH SCHEMA FOUNDATION COMPLETE: YES`

`DOMAIN MODEL EXTENDED: ExpensePeriodDeclaration`

`BINDING SEMANTIC: DECLARATION CREATION`

`RELATIONSHIP: ONE-TO-ONE`

`TENANT-QUALIFIED ACTION BINDING: YES`

`UNIQUE ACTION BINDING: YES`

`ESTABLISHED BINDING IMMUTABLE AT DB LEVEL: YES`

`HISTORICAL NULL ROWS COMPATIBLE: YES`

`INVALIDATION TOMBSTONE CREATED: NO`

`GENERIC FINANCIAL WORKFLOW CREATED: NO`

`PRODUCTION MIGRATION APPLIED: NO`

`PACKAGE 4 RUNTIME IMPLEMENTATION STARTED: NO`

`PACKAGE 4 SCHEMA FOUNDATION STEPS REMAINING: 4`

`NEXT SCHEMA FOUNDATION: LOYALTY REDEMPTION GRANT/CODE`

`A08 PAYMENT WRITE: DISABLED`

`EXTERNAL FINANCIAL/VALUE SIDE EFFECTS: 0`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP.
