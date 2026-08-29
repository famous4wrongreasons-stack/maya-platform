# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 REDEEM LEGACY LOYALTY SHADOW PRE-CHECKPOINT

Status: pre-implementation boundary fixed
Source checkpoint: `f538aa60`
Report date: 2026-08-30

## Exact Slice

- **Action:** `redeem_legacy_loyalty`, the third action class in the accepted
  P4-03 Runtime Contract Gate order.
- **Initiator:** the authenticated PWA loyalty-booking flow or the Telegram/
  legacy chat booking flow after the existing canonical appointment bridge
  reports one successful `create_appointment` execution. The isolated Python
  adapter is observation-only and is not wired into those production flows in
  this step.
- **Current execution owner:** `ai администратор/loyalty.py` selects the legacy
  care quote and calls `database.py` to reserve/finalize/directly debit the
  process-local SQLite ledger; it then calls YClients directly to zero the
  service price and append a comment. That owner remains unchanged for Shadow.
- **Canonical target identity:** server-bound provider/company -> exact tenant;
  `(tenantId, provider, external client id)` -> `CrmClientLink` -> canonical
  Client/User/LoyaltyAccount; successful tenant-qualified canonical
  `create_appointment` ActionExecution -> exact provider record and service;
  `(tenantId, provider, provider record)` -> Appointment with the same
  canonical client and service. Phone, local SQLite client id, title, caller
  tenant, or an unproven record id is not identity authority.
- **Server-derived idempotency:** one logical identity over contract version,
  tenant, canonical client, successful appointment execution, exact provider
  record, exact provider service, opaque redemption-request occurrence, and
  fixed redemption-policy version. The occurrence is caller evidence; the
  server binds it to every canonical fact before deriving the execution key.
- **Durable model/binding:** this step creates only a non-executable
  `ActionExecution` plan. A later executable operation is one logical redeem
  execution whose reservation/final debit/release-compensation ledger rows are
  1:N tenant-qualified `LoyaltyTransaction` results bound to that execution and
  whose balance commits atomically. It is not a one-time-code grant flow.
- **Policy/caps/approval:** `customer_value`, `financial_equivalent`,
  `destructive`, `external_crm`, and `shadow_only`; feature `loyalty`; policy
  `SHADOW_ONLY`; autonomy `L2_5_SHADOW`; approval `NONE` only because execution
  permission and external side effects are zero. Points and the per-action cap
  come from the server-owned versioned service-points policy, never from the
  initiator. A future executable redemption requires the exact authenticated
  client/staff request evidence bound to the same logical action.
- **Provider boundary:** Shadow performs no provider read or write. Exact
  appointment success and services are read from the durable canonical
  ActionExecution safe result and Appointment mirror. The future YClients
  record projection is a separate attempt after the atomic local value result.
- **Possible `UNKNOWN`:** none in Shadow because there is no dispatch. In a
  future executable path, lost acknowledgement of the local atomic commit is
  reconciled from execution-bound ledger and balance; timeout after the
  YClients projection dispatch is `UNKNOWN`, never `FAILED`.
- **Reconciliation:** none for Shadow and no retry. Future local reconciliation
  reads the exact execution-bound ledger result. Future provider reconciliation
  reads the exact record and compares service cost/comment evidence; an
  inconclusive read forbids redispatch and requires manual resolution.

Incomplete or contradictory tenant/client/appointment/service/request/policy
evidence creates no ActionExecution. A caller-supplied amount, title,
entitlement, approval, autonomy, policy decision, executor, binding, provider
outcome, or appointment success is never accepted as authority.

`P4-03 SHADOW ACTION CLASS: redeem_legacy_loyalty`

`IDENTITY/CONTRACT AMBIGUITY FOR ACCEPTED PATH: NO`

`INCOMPLETE IDENTITY/EVIDENCE CREATES ACTIONEXECUTION: NO`

`ADDITIONAL SCHEMA/CONTRACT GATE: NO`

`VALUE MUTATION AUTHORIZED: NO`

`PROVIDER WRITE AUTHORIZED: NO`

`PREVIOUS P4-03 SHADOWS MODIFIED: NO`

`P4-02 MODIFIED: NO`

`NEXT P4-03 ACTION STARTED: NO`
