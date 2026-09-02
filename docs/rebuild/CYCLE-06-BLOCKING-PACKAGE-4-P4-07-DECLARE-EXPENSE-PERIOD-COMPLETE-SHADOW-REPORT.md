# CYCLE 06 BLOCKING PACKAGE 4 — P4-07 DECLARE EXPENSE PERIOD COMPLETE SHADOW

Status: **PASS — non-executable Shadow; production not changed**

Source checkpoint: `537a001c`

The `declare_expense_period_complete` Shadow accepts only an explicit active
tenant/business owner, a valid whole-tenant interval of at most 366 inclusive
days, and a server-read complete ledger snapshot. Its identity binds tenant,
exact days, sorted immutable expense facts, snapshot hash, actor, policy, and
the explicit owner assertion.

Repeated/concurrent initiators and restart retain the same logical identity.
Branch declarations, forged dates, non-owner authority, and unbounded periods
fail closed. A later ledger mutation produces a different snapshot identity;
the Shadow itself creates or updates no declaration.

`P4-07 SHADOW ACTION CLASS: declare_expense_period_complete`

`CANONICAL SHADOW WIRED: YES`

`SHADOW DIVERGENCES: 0`

`DECLARATIONS CREATED BY NEW PATH: 0`

`EXPENSE/DECLARATION/VALUE WRITES BY NEW PATH: 0`

`P4-07 ACTION CLASSES SHADOW-MIGRATED: 3/3`

`EXECUTABLE CUTOVER: NO`
