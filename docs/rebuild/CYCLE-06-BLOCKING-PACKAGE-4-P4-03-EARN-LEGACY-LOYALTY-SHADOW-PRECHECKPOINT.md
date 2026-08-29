# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 EARN LEGACY LOYALTY SHADOW PRE-CHECKPOINT

Status: pre-implementation boundary fixed
Source checkpoint: `6564aa25`
Report date: 2026-08-30

## Exact Slice

- **Action:** `earn_legacy_loyalty`, the first action class in the accepted
  P4-03 Contract Gate order.
- **Initiator:** the legacy Python daily scheduler or the existing
  administrator-triggered `run_earning_job`.
- **Current execution owner:** `ai администратор/loyalty.py` calculates the
  visit cashback and directly calls
  `database.add_loyalty_transaction`; `database.py` commits the legacy SQLite
  ledger row.
- **Canonical target identity:** the bridge credential is bound server-side to
  an exact provider/company integration; the provider client id already
  present in the observed YClients booking is resolved through
  `(tenantId, provider, externalId) -> CrmClientLink -> Client`. Phone and the
  local integer SQLite client id are not identity authority.
- **Server-derived idempotency:** SHA-256 identity over contract version,
  resolved tenant, provider, canonical client, and provider visit id. The
  caller cannot choose the scope/key. Repeating the same visit candidate after
  restart must address the same logical ActionExecution.
- **Durable model/binding:** this Shadow creates only a non-executable
  `ActionExecution`. The later executable result is represented by
  `LoyaltyAccount` plus a tenant-qualified execution-bound
  `LoyaltyTransaction`; no such value row is created in this step.
- **Policy/risk/approval:** `customer_value`, `financial_equivalent`, `bulk`,
  provider-evidence, and `shadow_only`; required feature `loyalty`; source is
  an authenticated, server-bound legacy bridge; policy is `SHADOW_ONLY`,
  autonomy `L2_5_SHADOW`, approval `NONE` because external execution permission
  is zero. Any later executable approval/cap contract remains outside this
  step.
- **External provider boundary:** YClients booking and attendance/amount are
  read-only evidence. The Shadow performs no YClients write and does not
  change provider loyalty balance.
- **Possible UNKNOWN:** an unreadable provider observation creates no
  candidate. The Shadow itself has no dispatch and cannot become ambiguous
  about a value/provider side effect. A later executable local commit may be
  ambiguous only if acknowledgement is lost after commit.
- **Reconciliation:** Shadow requires none and cannot retry execution. A later
  executable action must reconcile from the exact tenant/idempotency claim and
  execution-bound ledger row; only proven absence may permit redispatch.

The backend recalculates the intended cashback under the fixed v1 formula and
records a divergence when the legacy claimed points differ. That comparison is
not execution authority.

`P4-03 SHADOW ACTION CLASS: earn_legacy_loyalty`

`ADDITIONAL SCHEMA/CONTRACT GAP: NO`

`VALUE MUTATION AUTHORIZED: NO`

`PROVIDER WRITE AUTHORIZED: NO`

`P4-02 MODIFIED: NO`

`NEXT P4-03 ACTION STARTED: NO`
