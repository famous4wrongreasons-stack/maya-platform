# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 EXPIRE LEGACY LOYALTY SHADOW PRE-CHECKPOINT

Status: pre-implementation boundary fixed
Source checkpoint: `3fa1d3ee`
Report date: 2026-08-30

## Exact Slice

- **Action:** `expire_legacy_loyalty`, the second action class in the accepted
  P4-03 Contract Gate order.
- **Initiator:** the legacy Python daily scheduler or the existing
  administrator-triggered `run_expiry_job`.
- **Current execution owner:** `ai администратор/loyalty.py` calculates
  inactivity and the full-balance debit, then `database.py` writes an
  `expire` row to the process-local SQLite ledger.
- **Canonical target identity:** exact provider/company binding resolves the
  tenant; exact provider client id resolves through
  `(tenantId, provider, externalId) -> CrmClientLink -> Client -> User ->
  LoyaltyAccount`. Phone and the local SQLite client id are never authority.
  A missing/merged/unmapped identity or missing canonical account creates no
  ActionExecution.
- **Server-derived idempotency:** one logical identity over contract version,
  resolved tenant, canonical client, fixed expiry-policy version, and the
  server-derived evaluation window. A restart within the same policy window
  addresses the same ActionExecution.
- **Durable model/binding:** Shadow creates only a non-executable
  `ActionExecution`. A later executable result would be one or more
  tenant-qualified execution-bound negative `LoyaltyTransaction` rows plus
  the atomic resulting `LoyaltyAccount.balance`; this step creates neither.
- **Policy/risk/approval:** `customer_value`, `financial_equivalent`,
  `destructive`, `bulk`, and `shadow_only`; feature `loyalty`; policy
  `SHADOW_ONLY`; autonomy `L2_5_SHADOW`; approval `NONE` only because external
  execution permission is zero. Future executable expiry remains forbidden
  until versioned effective date/window, per-client and per-run caps, and the
  accepted tenant-owner approval rule are enforced.
- **Provider boundary:** no provider read or write occurs in the new path.
  Canonical eligibility uses `LoyaltyAccount` plus the appointment mirror.
  Absence of a recent attended visit is accepted only when a completed,
  full-coverage `ReconciliationRun` covers the entire inactivity window;
  missing coverage fails closed without a plan.
- **Possible UNKNOWN:** Shadow has no dispatch, so it cannot become UNKNOWN
  about a value/provider effect. Missing/partial evidence is
  `evidence_unresolved`, not `FAILED`. A later atomic PostgreSQL debit may be
  uncertain only if acknowledgement is lost after commit.
- **Reconciliation:** none for Shadow and no retry. A future executable action
  must reconcile from the exact execution-bound ledger row and resulting
  account balance; only proven absence after rollback may allow redispatch.

The legacy expiry candidate currently originates from phone/local-SQLite
state. That is not sufficient identity. The isolated bridge contract therefore
requires an exact provider client id; candidates that cannot obtain an
authoritative correlation remain quarantined and are not silently joined.
This is a fail-closed coverage case, not permission to infer identity.

`P4-03 SHADOW ACTION CLASS: expire_legacy_loyalty`

`IDENTITY/CONTRACT AMBIGUITY FOR ACCEPTED PATH: NO`

`UNRESOLVED IDENTITY/COVERAGE CREATES ACTIONEXECUTION: NO`

`ADDITIONAL SCHEMA/CONTRACT GATE: NO`

`VALUE MUTATION AUTHORIZED: NO`

`PROVIDER WRITE AUTHORIZED: NO`

`EARN LEGACY LOYALTY MODIFIED: NO`

`P4-02 MODIFIED: NO`

`NEXT P4-03 ACTION STARTED: NO`
