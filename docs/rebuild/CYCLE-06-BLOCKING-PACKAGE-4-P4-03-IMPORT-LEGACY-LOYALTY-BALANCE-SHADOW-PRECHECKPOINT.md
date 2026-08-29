# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 IMPORT LEGACY LOYALTY BALANCE SHADOW PRE-CHECKPOINT

Status: pre-implementation boundary fixed
Source checkpoint: `35d05020`
Report date: 2026-08-30

## Exact Slice

- **Action:** `import_legacy_loyalty_balance`, the fifth action class in the
  accepted P4-03 Runtime Contract Gate order.
- **Initiator:** the legacy lazy first-access path after it observes an exact
  provider client reference. The isolated Python adapter remains
  observation-only and is not wired into production access paths in this
  step.
- **Legacy execution owner:** `ai администратор/loyalty.py` resolves a
  YClients card by phone, reads its balance, compares it with the process-local
  SQLite balance, and asks `database.py` to append the one-time `yc_import`
  row. It remains the actual value owner during Shadow.
- **Canonical target identity:** authoritative provider/company integration ->
  exact tenant; tenant-qualified `CrmClientLink` -> one active canonical
  Client/User and `LoyaltyAccount`; server-owned User phone -> provider
  evidence read; and the returned exact provider client/card identity. Phone,
  a local SQLite client id, caller-supplied card id, or caller-supplied balance
  is not identity authority. A missing, ambiguous, unlinked, merged, mismatched,
  or card-less identity fails closed.
- **Server-derived idempotency:** one logical identity over contract version,
  tenant, canonical Client, provider, exact provider card identity, and the
  fixed import-policy version. Provider balance and calculated delta are
  normalized evidence, not parts of a caller-controlled key; changed evidence
  under the same identity collides and fails closed rather than becoming a
  second import.
- **Durable model/binding:** Shadow creates only a non-executable
  `ActionExecution` plan. A future executable result is exactly one
  tenant-qualified `LoyaltyTransaction(kind = yc_import)` bound to that
  execution, correlated to the hashed provider/card identity, and allowed by
  the existing `(tenantId, idempotencyKey)` claim. The exact delta, durable
  binding, and resulting `LoyaltyAccount.balance` must commit atomically.
- **Policy/caps/approval:** `customer_value`, `financial_equivalent`,
  `provider_evidence`, `one_time`, and `shadow_only`; feature `loyalty`; policy
  `SHADOW_ONLY`; autonomy `L2_5_SHADOW`; approval `NONE` only because this
  slice grants zero execution permission. A future import may be automatic
  only from exact provider evidence within a server-owned per-action cap. A
  cap, amount, current balance, provider result, or approval supplied by the
  initiator is never authority.
- **Provider boundary:** Shadow performs one server-side provider **read** to
  obtain the exact client/card balance snapshot. It performs no provider
  write. The Python bridge cannot submit a phone, card id, provider balance,
  policy decision, or executable permission as authority.
- **Possible `UNKNOWN`:** none in Shadow. A provider timeout, malformed
  snapshot, or missing card is unresolved evidence and creates no
  ActionExecution. In a future executable path, acknowledgement loss around
  the atomic ledger/balance commit is `UNKNOWN`, never `FAILED`.
- **Reconciliation:** none for Shadow and no retry. A future import reconciles
  from the exact execution-bound `yc_import` row, its provider/card
  correlation, and the resulting account balance. Proven absence after a
  rolled-back commit is required before any new dispatch; inconclusive
  evidence forbids blind retry.

The provider snapshot balance and canonical current account balance derive the
exact intended delta. Any legacy-claimed provider balance, local balance, or
delta is comparison evidence only. An existing exact canonical import creates
a no-mutation plan; contradictory, unbound, duplicate, or cross-card import
evidence fails closed.

`P4-03 SHADOW ACTION CLASS: import_legacy_loyalty_balance`

`IDENTITY/CONTRACT AMBIGUITY FOR ACCEPTED PATH: NO`

`INCOMPLETE IDENTITY/EVIDENCE CREATES ACTIONEXECUTION: NO`

`ADDITIONAL SCHEMA/CONTRACT GATE: NO`

`VALUE MUTATION AUTHORIZED: NO`

`PROVIDER WRITE AUTHORIZED: NO`

`PREVIOUS P4-03 SHADOWS MODIFIED: NO`

`P4-02 MODIFIED: NO`

`NEXT P4-03 ACTION STARTED: NO`
