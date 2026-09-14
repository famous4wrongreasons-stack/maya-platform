# CYCLE 06 BLOCKING PACKAGE 4 — P4-07 EXPENSE PERIOD DECLARATION EPOCH SCHEMA PROPOSAL

Status: **PROPOSED — migration not created or applied**

Source Gate:
`CYCLE-06-BLOCKING-PACKAGE-4-P4-07-EXPENSE-PERIOD-DECLARATION-RE-ASSERTION-CONTRACT-CLOSURE-GATE.md`

Proposal date: 2026-09-02

## 1. Minimal additive change

Add one nullable historical-compatibility binding to the current declaration:

```prisma
model ExpensePeriodDeclaration {
  // existing fields remain unchanged
  declarationEpoch Int?
}
```

Add one append-only invalidation model:

```prisma
model ExpensePeriodDeclarationInvalidation {
  id                                    String   @id @default(uuid())
  tenantId                              String
  periodFromDay                         String
  periodToDay                           String
  invalidatedDeclarationId              String
  invalidatedDeclarationActionExecutionId String
  invalidationActionExecutionId         String
  previousDeclarationEpoch              Int
  nextDeclarationEpoch                  Int
  reasonCode                            String
  createdAt                             DateTime @default(now())

  tenant Tenant @relation(... tenant-qualified ...)
  invalidatedDeclarationActionExecution ActionExecution @relation(
    "ExpensePeriodInvalidatedDeclarationExecution", ... tenant-qualified ...
  )
  invalidationActionExecution ActionExecution @relation(
    "ExpensePeriodInvalidationExecution", ... tenant-qualified ...
  )

  @@unique([id, tenantId])
  @@unique([tenantId, invalidatedDeclarationActionExecutionId])
  @@unique([tenantId, periodFromDay, periodToDay, nextDeclarationEpoch])
  @@unique([tenantId, invalidationActionExecutionId, invalidatedDeclarationId])
  @@index([tenantId, periodFromDay, periodToDay, nextDeclarationEpoch])
}
```

Exact relation and constraint names may follow repository naming limits, but
their semantics may not be weakened.

No mutable `isInvalidated` boolean, random epoch token, provider field, Client
identity, new public action or value column is added.

## 2. Database constraints

The additive migration must enforce:

- `declarationEpoch >= 0` when non-null;
- `previousDeclarationEpoch >= 0`;
- `nextDeclarationEpoch = previousDeclarationEpoch + 1`;
- canonical reason is exactly `expense_ledger_changed:create` or
  `expense_ledger_changed:delete`;
- both execution relations are tenant-qualified composite foreign keys;
- invalidated execution belongs to
  `declare_expense_period_complete`;
- invalidating execution belongs to `create_expense` or `delete_expense`;
- one declaration ActionExecution can be invalidated once;
- one tenant/period/next epoch can be established once;
- an invalidation row cannot be updated or deleted;
- an established non-null declaration epoch cannot be cleared or changed.

A database trigger for canonical (`declarationEpoch IS NOT NULL`)
`ExpensePeriodDeclaration` deletion must require the matching invalidation row
to have been inserted in the same transaction. Historical null-epoch rows
remain compatible and receive no fake event.

The generation insert trigger must use the existing tenant expense-ledger
transaction lock and reject a non-contiguous `previous -> next` transition.
For the first invalidation the only valid transition is `0 -> 1`; later rows
must continue from the greatest durable next epoch for the exact tenant and
period.

## 3. Runtime use after migration

The declaration planner derives the current epoch server-side:

```text
MAX(nextDeclarationEpoch) for exact tenant/period, or 0 when none exists
```

The executor re-derives it under the tenant ledger lock. The executable
declaration input and logical identity must bind the exact epoch and ledger
snapshot. A stale or caller-supplied generation is rejected.

New canonical declarations always set `declarationEpoch`. Invalidation inserts
the event before deleting the matching declaration, all inside the same
transaction as the Expense create/delete and ActionExecution finalization.

## 4. Historical and migration behavior

- The migration is additive.
- Existing `Expense`, `ExpensePeriodDeclaration`, ActionExecution and audit
  rows are preserved.
- Existing declarations receive `declarationEpoch = NULL`.
- No invalidation rows are synthesized.
- No historical ActionExecution is invented.
- No Expense/value mutation occurs during migration.

## 5. Required structural proof

PostgreSQL tests must cover:

1. historical null declaration remains readable;
2. canonical epoch-`0` declaration is representable;
3. non-null epoch cannot be cleared/replaced;
4. valid `0 -> 1` invalidation permits exact declaration deletion;
5. missing invalidation blocks canonical declaration deletion;
6. duplicate/non-contiguous epoch transition fails;
7. invalidation update/delete fails;
8. wrong tenant, period, declaration execution or invalidating execution
   fails;
9. concurrent same invalidation yields one fact;
10. two complete invalidate/re-declare cycles yield epochs `1` and `2`;
11. clean replay of every migration and drift `NONE`;
12. no Expense, declaration-value or provider side effect.

## 6. Proposal verdict

`MINIMAL NEW MODEL: ExpensePeriodDeclarationInvalidation`

`MINIMAL EXISTING MODEL FIELD: ExpensePeriodDeclaration.declarationEpoch`

`APPEND-ONLY INVALIDATION FACT REQUIRED: YES`

`HISTORICAL FAKE BACKFILL: NO`

`RUNTIME IMPLEMENTATION INCLUDED: NO`

`MIGRATION CREATED: NO`

`PRODUCTION MIGRATION APPLIED: NO`

`PRODUCTION EXPENSE/VALUE MUTATIONS: 0`
