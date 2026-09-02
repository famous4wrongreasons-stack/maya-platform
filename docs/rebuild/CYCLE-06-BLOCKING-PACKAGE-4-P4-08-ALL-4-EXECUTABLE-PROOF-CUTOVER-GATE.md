# CYCLE 06 BLOCKING PACKAGE 4 — P4-08 ALL-4 EXECUTABLE PROOF / CUTOVER GATE

Status: **PASS — READY FOR A SEPARATELY AUTHORIZED PRODUCTION CUTOVER**

Date: 2026-09-02

## 1. Executable boundary

The isolated canonical executor proves these four Action Engine boundaries on
a disposable PostgreSQL database:

1. `initiate_tenant_billing_checkout` creates/reuses one execution-bound
   pending BillingPayment before provider dispatch and grants no entitlement;
2. `charge_tenant_billing_recurring` uses the exact due-window identity and
   the bounded scheduler envelope;
3. `apply_tenant_billing_payment_outcome` independently reads the provider,
   claims the terminal BillingPayment, and changes paid entitlement once in a
   serializable transaction;
4. `transition_tenant_billing_past_due` is a separate local ActionExecution
   and fails closed while any pending/UNKNOWN payment can still succeed.

Production routes are not wired to this executor in this Gate.

## 2. Provider state and reconciliation proof

The proof exercised both a known pending response and a connection loss after
the provider had accepted the recurring payment request.

- known `PENDING` made the origin ActionExecution `SUCCEEDED` while leaving the
  BillingPayment pending and the tenant entitlement unchanged;
- ambiguous post-dispatch loss produced an UNKNOWN ActionAttempt;
- the executor did not dispatch a different key;
- reconciliation reused the exact original provider request identity and
  recovered the provider payment;
- the reconciled origin remained a payment intent, not an entitlement grant;
- only the separate authoritative terminal outcome applied entitlement.

`PENDING != UNKNOWN` and `UNKNOWN != FAILED` are therefore durable observed
states, not comments. Inconclusive reconciliation remains unknown/manual; it
does not authorize blind redispatch.

## 3. Idempotency, concurrency, and value ownership

- retry/restart returns the same ActionExecution and BillingPayment;
- one ActionExecution has at most one BillingPayment through the existing
  tenant-qualified unique binding;
- one provider id and one transport idempotence key remain unique;
- two concurrent outcome initiators converge on one logical outcome;
- the BillingPayment terminal claim and Tenant paid-window change occur in one
  serializable local transaction;
- duplicate outcome delivery does not add a second paid month;
- provider payment creation is not represented as locally atomic;
- local past-due transition uses PostgreSQL commit/rollback truth and does not
  invent a provider UNKNOWN boundary.

The new executable path is the only payment-derived entitlement owner inside
the proven canonical chain. Existing direct BillingService/admin/lazy writers
remain the explicitly enumerated pre-cutover baseline and are forbidden after
cutover by the approved contract.

## 4. Scheduler and policy proof

- hourly candidate order does not affect envelope identity;
- duplicate children are rejected;
- more than 25 children is rejected before dispatch;
- an automatic child over 300000 kopecks is rejected before dispatch;
- aggregate new dispatch over 7500000 kopecks is rejected before dispatch;
- restart reuses envelope and child identities rather than adding capacity;
- manual and scheduler initiation use the same exact due-window child
  identity;
- different-plan active-window checkout fails before provider dispatch;
- no input can raise the approved caps or replace the server policy version.

## 5. Architectural ratchet

The targeted ratchet:

- registers all four Shadow and executable capabilities;
- keeps Shadows physically non-executable;
- classifies the proof script as disposable/test-only;
- enumerates the current production bypass group rather than excluding the
  billing directory;
- detects an injected direct YooKassa mutation bypass;
- requires canonical UNKNOWN/reconciliation and serializable entitlement
  application markers.

It is ready to change its accepted pre-cutover baseline to zero in the future
production cutover commit.

## 6. Verification evidence

- targeted Jest: `4/4` suites, `22/22` tests — PASS;
- application TypeScript — PASS;
- scripts TypeScript — PASS;
- targeted ESLint — PASS;
- clean migration replay: `66/66` — PASS;
- executable PostgreSQL proof: PASS;
- production payment/provider/entitlement operations: `0`.

## 7. Gate verdict

`P4-08 RUNTIME CONTRACT GATE COMPLETE: YES`

`P4-08 EXACT ACTION CLASSES: 4 — initiate_tenant_billing_checkout / charge_tenant_billing_recurring / apply_tenant_billing_payment_outcome / transition_tenant_billing_past_due`

`CANONICAL SCHEMA SUFFICIENT: YES`

`PROVIDER UNKNOWN/RECONCILIATION CONTRACT: COMPLETE`

`P4-08 SHADOW ACTION CLASSES: 4/4`

`P4-08 EXECUTABLE PROOF: PASS`

`DUPLICATE PAYMENT POSSIBLE: NO`

`PENDING != UNKNOWN: ENFORCED`

`BLIND RETRY AFTER UNKNOWN: NO`

`PROVIDER RECONCILIATION: PROVEN`

`PAYMENT-DERIVED ENTITLEMENT OWNER: ACTION ENGINE`

`SCHEDULER CAPS: ENFORCED`

`LEGACY BYPASS RATCHET READY: YES`

`REAL PRODUCTION PAYMENT/VALUE MUTATIONS: 0`

`READY FOR P4-08 PRODUCTION CUTOVER: YES`

`P4-09 STARTED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP.
