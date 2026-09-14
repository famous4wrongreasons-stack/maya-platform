# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 REFUND LEGACY LOYALTY SHADOW PRE-CHECKPOINT

Status: pre-implementation boundary fixed
Source checkpoint: `202ec835`
Report date: 2026-08-30

## Exact Slice

- **Action:** `refund_legacy_loyalty`, the fourth action class in the accepted
  P4-03 Runtime Contract Gate order.
- **Initiator:** the legacy provider `record.delete` webhook handler or the
  Telegram cancellation handler after cancellation is canonically proven. The
  isolated Python adapter is observation-only and is not wired into either
  production handler in this step.
- **Legacy execution owner:** `ai администратор/loyalty.py` reads every local
  SQLite `redeem` row for the unqualified YClients `record_id`, checks for any
  local refund for that client/record, and asks `database.py` to append the
  positive `refund` row. It remains the actual value owner during Shadow.
- **Canonical target identity:** server-bound provider/company -> exact tenant;
  tenant-qualified provider client link -> canonical Client/User/
  LoyaltyAccount; exact tenant/provider record -> canonical Appointment owned
  by that client; one original `redeem_legacy_loyalty` ActionExecution with
  exact tenant/account-bound negative `LoyaltyTransaction` rows correlated to
  that provider record; and an exact proven removal fact for that Appointment.
  Phone, local client id, bare record id, or caller-claimed original debit is
  not authority.
- **Server-derived idempotency:** one logical identity over contract version,
  tenant, original redemption execution, canonical Appointment/provider
  record removal fact, and fixed refund-policy version. A successful canonical
  cancel execution and an `appointment.removed` DomainEvent normalize to the
  same removal fact, so two evidence routes cannot authorize two refunds.
- **Durable model/binding:** Shadow creates only a non-executable
  `ActionExecution` plan. A future executable outcome is one positive,
  tenant-qualified `LoyaltyTransaction` bound to the refund execution and
  correlated to the original redemption; its delta is the server-derived sum
  of exact negative original ledger rows. The resulting `LoyaltyAccount`
  balance must commit atomically with that row.
- **Policy/caps/approval:** `customer_value`, `financial_equivalent`,
  `compensating`, `provider_evidence`, and `shadow_only`; feature `loyalty`;
  policy `SHADOW_ONLY`; autonomy `L2_5_SHADOW`; approval `NONE` because this
  slice has zero execution permission. Future automatic refund is eligible
  only from exact original-ledger plus cancellation evidence under the
  server-owned per-action cap; a cap or amount supplied by Python is never
  policy.
- **Provider boundary:** Shadow performs no provider read or write. It reads
  only the durable canonical cancellation ActionExecution or canonical
  `appointment.removed` DomainEvent already produced by the CRM boundary.
  Refund itself has no YClients write.
- **Possible `UNKNOWN`:** none in Shadow. The original redemption may remain
  `UNKNOWN` about its separate YClients projection, but an exact bound debit
  proves the local value effect and is required before any refund plan. A
  future lost acknowledgement of the atomic refund commit is `UNKNOWN`, never
  `FAILED`.
- **Reconciliation:** none for Shadow and no retry. A future refund reconciles
  from the exact refund-execution-bound positive ledger row and its correlation
  to the original redemption; only proven absence after rollback permits a new
  dispatch. An inconclusive database outcome never authorizes blind retry.

Missing or contradictory client/account/appointment/original-debit/cancellation
evidence creates no ActionExecution. Multiple original debit rows are one
original redemption result and produce one aggregate compensating intent; they
do not become caller-selectable refund actions.

`P4-03 SHADOW ACTION CLASS: refund_legacy_loyalty`

`IDENTITY/CONTRACT AMBIGUITY FOR ACCEPTED PATH: NO`

`INCOMPLETE IDENTITY/EVIDENCE CREATES ACTIONEXECUTION: NO`

`ADDITIONAL SCHEMA/CONTRACT GATE: NO`

`VALUE MUTATION AUTHORIZED: NO`

`PROVIDER WRITE AUTHORIZED: NO`

`PREVIOUS P4-03 SHADOWS MODIFIED: NO`

`P4-02 MODIFIED: NO`

`NEXT P4-03 ACTION STARTED: NO`
