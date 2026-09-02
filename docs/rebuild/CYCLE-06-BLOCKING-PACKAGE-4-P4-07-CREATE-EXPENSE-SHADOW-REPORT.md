# CYCLE 06 BLOCKING PACKAGE 4 — P4-07 CREATE EXPENSE SHADOW

Status: **PASS — non-executable Shadow; production not changed**

Source checkpoint: `537a001c`

The `create_expense` Shadow now derives tenant, active actor membership, exact
same-tenant branch, canonical manual category, bounded minor-unit amount,
tenant RUB currency, occurrence day, encrypted note evidence, stable source
intent, policy snapshot, and approval requirement before submitting a
`SHADOW_ONLY` request through Canonical Action Ingress.

Retry, restart, and HTTP/AI duplicate delivery retain one logical identity.
Payroll, foreign currency, cross-tenant branch, inactive/unauthorized actor,
and caller monetary authority fail closed. The capability uses
`executorKey=shadow.none`; it cannot insert an Expense or invalidate a period.

`P4-07 SHADOW ACTION CLASS: create_expense`

`CANONICAL SHADOW WIRED: YES`

`SHADOW DIVERGENCES: 0`

`EXPENSES CREATED BY NEW PATH: 0`

`DECLARATIONS INVALIDATED BY NEW PATH: 0`

`PROVIDER/VALUE WRITES BY NEW PATH: 0`

`P4-07 ACTION CLASSES SHADOW-MIGRATED: 1/3`

`EXECUTABLE CUTOVER: NO`
