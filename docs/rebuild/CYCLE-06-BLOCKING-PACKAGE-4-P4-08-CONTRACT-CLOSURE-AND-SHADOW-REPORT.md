# CYCLE 06 BLOCKING PACKAGE 4 — P4-08 CONTRACT CLOSURE AND SHADOW REPORT

Status: **PASS — SAFE LOCAL CYCLE ONLY; PRODUCTION CUTOVER NOT PERFORMED**

Date: 2026-09-02

Sources of truth:

- `CYCLE-06-BLOCKING-PACKAGE-4-P4-08-TENANT-BILLING-VALUE-CONVERGENCE-RUNTIME-CONTRACT-GATE.md`;
- `CYCLE-06-BLOCKING-PACKAGE-4-P4-08-SCHEDULER-AND-ENTITLEMENT-OWNERSHIP-CONTRACT-PROPOSAL.md`;
- explicit approval at checkpoint `9057dff5`.

## 1. Contract closure

The approved version-1 safety policy is represented as server-owned constants
and normalized evidence, not as a price list:

| Contract | Enforced value |
| --- | ---: |
| recurring children per hourly envelope | `25` |
| one automatic payment | `300000` kopecks |
| aggregate newly dispatched value per envelope | `7500000` kopecks |
| active-window prepayment | same plan only |

The envelope identity is derived from the policy version, UTC hourly window,
and sorted exact child identities. Reordering or replaying a candidate set does
not create new charge capacity. Each child remains its own ActionExecution;
the envelope cannot dispatch a provider payment.

Generic admin and lazy-access writers are classified as pre-cutover bypasses,
not hidden by a broad source exclusion. The cutover ratchet enumerates those
surfaces and detects a newly introduced direct provider/payment/value writer.
They remain unchanged in this local-only cycle and must be removed as execution
owners by the separately authorized production cutover.

## 2. Canonical Shadow 4/4

The following strict SHADOW_ONLY capabilities are registered:

1. `initiate_tenant_billing_checkout`;
2. `charge_tenant_billing_recurring`;
3. `apply_tenant_billing_payment_outcome`;
4. `transition_tenant_billing_past_due`.

All four use `ActionEngineRuntimeService.planShadow`. They have
`executorKey=shadow.none`, persist a policy-denied dry-run ActionExecution, and
cannot call the P4-08 executable service. The production billing controller,
scheduler, and module do not reference the new executable service.

PostgreSQL proof observed for every Shadow:

- provider payments created: `0`;
- BillingPayment mutations: `0`;
- Tenant entitlement mutations: `0`;
- provider writes: `0`;
- divergences: `0`.

## 3. Server-derived safety evidence

- checkout amount is the server plan's RUB price converted to integer kopecks;
- a paid active window permits only same-plan prepayment;
- recurring charge requires the exact saved billing method, plan, and due
  window and is rejected outside all three approved caps;
- webhook state is not authority: the outcome action requires an authoritative
  provider read and exact payment/tenant/plan/amount/currency/purpose binding;
- `pending` and `unknown` are rejected by the value-applying outcome contract;
- past-due planning requires the exact expired access window and zero pending
  or UNKNOWN payment executions that could still prove value.

## 4. Verification

- targeted Jest: `4/4` suites, `22/22` tests — PASS;
- application TypeScript — PASS;
- scripts TypeScript — PASS;
- targeted ESLint — PASS;
- clean PostgreSQL replay: `66/66` migrations — PASS;
- disposable PostgreSQL Shadow/adversarial proof — PASS;
- temporary proof database removed and absence verified — PASS.

## 5. Verdict

`P4-08 CONTRACT CLOSURE: COMPLETE`

`P4-08 SHADOW ACTION CLASSES: 4/4`

`SHADOW DIVERGENCES: 0`

`SHADOW PROVIDER PAYMENTS CREATED: 0`

`SHADOW PAYMENT/ENTITLEMENT MUTATIONS: 0`

`SCHEDULER CHILD CAP: 25`

`AUTOMATIC PAYMENT CAP: 300000 KOPECKS`

`AGGREGATE ENVELOPE CAP: 7500000 KOPECKS`

`SAME-PLAN-ONLY PREPAYMENT: ENFORCED`

`PRODUCTION PAYMENT/VALUE MUTATIONS: 0`

`PRODUCTION CUTOVER PERFORMED: NO`
