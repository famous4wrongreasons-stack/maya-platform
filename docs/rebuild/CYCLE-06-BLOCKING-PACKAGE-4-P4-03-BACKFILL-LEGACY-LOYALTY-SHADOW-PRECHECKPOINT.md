# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 BACKFILL LEGACY LOYALTY SHADOW PRE-CHECKPOINT

Status: pre-implementation boundary fixed
Source checkpoint: `1c5b44e7`
Report date: 2026-08-30

## Exact Slice

- **Action:** `backfill_legacy_loyalty`, the sixth action class in the accepted
  P4-03 Runtime Contract Gate order.
- **Initiators:** lazy first access from Telegram/PWA/legacy AI and the
  owner-triggered admin batch job. They are two candidate sources for the same
  per-client logical operation, not separate value capabilities. The isolated
  Python adapter is observation-only and is not wired into either production
  path in this step.
- **Legacy execution owner:** `ai администратор/loyalty.py` searches YClients
  by phone, derives a welcome grant as 5% of reported lifetime spend capped at
  `WELCOME_CAP`, and asks `database.py` to append a direct SQLite `backfill`
  row. `run_backfill_job` performs the same mutation for every listed client;
  the Python function and SQLite writer remain the actual owners during
  Shadow.
- **Canonical target identity:** authoritative provider/company integration ->
  exact tenant; tenant-qualified active `CrmClientLink` -> one unmerged
  canonical Client/User and existing `LoyaltyAccount`; server-owned User phone
  is used only to acquire provider evidence; the result must contain the exact
  linked provider client id. Phone, Telegram id, local SQLite client id, or a
  caller-selected provider row is not identity authority.
- **Server-derived idempotency:** one logical identity over contract version,
  tenant, canonical Client, approved welcome-program version, and fixed
  backfill-policy version. Lazy and batch candidates for the same client
  converge on this identity. Provider LTV and intended points are normalized
  evidence; changed facts under the same identity collide and fail closed
  rather than becoming a second grant.
- **Durable model/binding:** Shadow creates only a non-executable
  `ActionExecution` plan. A future executable result is exactly one positive,
  tenant-qualified `LoyaltyTransaction(kind = backfill)` bound to that
  execution, correlated to the program/client identity, and protected by the
  tenant idempotency claim. The row, execution binding, and resulting
  `LoyaltyAccount.balance` must commit atomically.
- **Policy/caps/approval:** `customer_value`, `financial_equivalent`, `bulk`,
  `provider_evidence`, `one_time`, and `shadow_only`; feature `loyalty`; policy
  `SHADOW_ONLY`; autonomy `L2_5_SHADOW`; approval `NONE` only because this
  slice grants zero execution permission. The per-client and per-run caps are
  mandatory server configuration. Future batch execution additionally
  requires exact tenant-owner approval unless a separately accepted,
  versioned migration policy proves an equivalent boundary; this Shadow does
  not claim that approval is satisfied.
- **Provider boundary:** Shadow performs one server-side, read-only CRM client
  search and accepts lifetime-spend evidence only from the exact provider
  client linked to the canonical Client. It performs no provider write and no
  identity-registration write. A provider timeout, empty/malformed result,
  missing LTV, or mismatched client leaves evidence unresolved.
- **Possible `UNKNOWN`:** none in Shadow. Provider-read failure is unresolved
  evidence and creates no ActionExecution. In a future executable path,
  acknowledgement loss around the atomic ledger/balance commit is `UNKNOWN`,
  never `FAILED`.
- **Reconciliation:** none for Shadow and no retry. A future backfill
  reconciles from the exact execution-bound `backfill` ledger row, its
  program/client correlation, and the resulting balance. Proven absence after
  rollback is required before any new dispatch; inconclusive evidence forbids
  blind retry. The provider boundary is read-only and has no write to
  reconcile.

The provider lifetime-spend value, approved 5% calculation, and server caps
derive the intended grant. Legacy-claimed spend, points, trigger, cap, approval,
or run totals are comparison evidence at most. An exact existing canonical
backfill or prior canonical YClients balance import creates a no-grant plan;
contradictory, unbound, duplicate, or cross-correlation evidence fails closed.

`P4-03 SHADOW ACTION CLASS: backfill_legacy_loyalty`

`IDENTITY/CONTRACT AMBIGUITY FOR ACCEPTED PATH: NO`

`INCOMPLETE IDENTITY/EVIDENCE CREATES ACTIONEXECUTION: NO`

`ADDITIONAL SCHEMA/CONTRACT GATE: NO`

`VALUE MUTATION AUTHORIZED: NO`

`PROVIDER WRITE AUTHORIZED: NO`

`BATCH APPROVAL SATISFIED BY SHADOW: NO`

`PREVIOUS P4-03 SHADOWS MODIFIED: NO`

`P4-02 MODIFIED: NO`

`NEXT P4-03 ACTION STARTED: NO`
