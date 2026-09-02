# CYCLE 06 BLOCKING PACKAGE 4 — P4-08 SCHEDULER AND ENTITLEMENT OWNERSHIP CONTRACT PROPOSAL

Status: **PROPOSED — APPROVAL REQUIRED; NOT IMPLEMENTED**

Source Gate: `CYCLE-06-BLOCKING-PACKAGE-4-P4-08-TENANT-BILLING-VALUE-CONVERGENCE-RUNTIME-CONTRACT-GATE.md`

Proposal date: 2026-09-02

## 1. Decision boundary

The P4-08 Runtime Contract Gate found no durable schema gap. It found three
payment-policy decisions that cannot be chosen by implementation convenience:

1. exact recurring scheduler blast-radius limits;
2. plan-change behavior while a paid window is active;
3. ownership of fields that represent payment-derived access.

This proposal makes one minimal, fail-closed recommendation for those gaps. It
does not modify runtime, schema, migration, configuration, production state,
payments, tenant access, or provider state.

## 2. Proposed recurring scheduler envelope

### 2.1 Identity and fan-out

One scheduler tick creates or reuses a non-value envelope identified by:

`policy version + UTC hourly window + sorted eligible tenant/due-window identities`.

The envelope may fan out to at most **25** exact
`charge_tenant_billing_recurring` child ActionExecutions. A child identity is:

`tenant + exact due-window end + frozen plan/amount/currency + recurring contract version`.

Restart resumes missing or non-terminal children. Reordering or repeating the
candidate set creates no new charge capacity. A second scheduler instance
converges on the same durable executions rather than relying on an in-memory
`running` flag.

### 2.2 Proposed monetary caps

The repository's canonical public plan baseline tops out at 2,990 RUB/month,
or 299,000 kopecks. To avoid silently authorizing a new higher automatic
charge, approve these version-1 hard limits:

| Limit | Proposed value | Behavior on breach |
| --- | ---: | --- |
| per recurring payment | `300,000` kopecks | fail closed before provider dispatch; explicit policy revision/approval required |
| aggregate new recurring dispatch per hourly envelope | `7,500,000` kopecks | stop before the first child that would exceed the cap; remaining children wait for a later envelope |
| recurring children per envelope | `25` | bounded partial fan-out; remaining candidates wait |

The limits are server-owned constants/configuration with a versioned policy
snapshot. An initiator, scheduler request, plan row, or environment value may
not raise them without the same reviewed policy version. A lower operational
limit is allowed; a higher value requires a new approval.

The aggregate cap authorizes only the sum of newly dispatched recurring
charges. Provider-status reconciliation never dispatches a new key and does
not consume new-charge capacity.

### 2.3 Approval

- a normal recurring child within all version-1 caps may execute under the
  approved automatic billing policy;
- a platform-owner manual charge still uses the same exact due-window child
  identity and cannot duplicate the scheduler charge;
- any payment or envelope above a cap fails closed; it is not split into a
  different idempotency key to evade the limit;
- approval cannot turn an `UNKNOWN` attempt into permission to redispatch.

## 3. Proposed active-window plan rule

P4-08 version 1 does not implement proration, immediate upgrades/downgrades,
or scheduled future plan changes.

Approve:

1. when no paid window is active, checkout may select any server-public plan;
2. while a paid window is active, an additional checkout is allowed only for
   the same plan and extends from the existing window end after proven
   successful payment;
3. a different-plan checkout during an active paid window fails closed with
   `billing_plan_change_contract_required` before provider dispatch;
4. no payment success may change `Tenant.planId` before the exact purchased
   window begins;
5. future upgrade/downgrade/proration semantics require a separate approved
   contract and, if necessary, durable future-term schema.

This preserves paid history without inventing proration or granting a new
entitlement early.

## 4. Proposed ownership fence

After P4-08 cutover, payment-derived fields have one owner: the P4-08 canonical
executors.

Approve the following restrictions:

- `TenantAccessStateService` and equivalent lazy guards may evaluate state and
  submit `transition_tenant_billing_past_due`; they may not update billing
  fields directly;
- generic tenant PATCH may not set `planId`, `currentPeriodStart`,
  `currentPeriodEnd`, `pastDueAt`, `graceEndsAt`, or `billingMethodId`, even
  for a platform owner;
- `PAST_DUE` is written only by the canonical past-due action;
- payment success is the only P4-08 path that grants/extends paid `ACTIVE`
  access;
- security suspension remains an A26 action because it removes access and
  does not claim payment success;
- generic tenant activation may not fabricate paid access. It may return to an
  eligible state only when server-derived paid/trial evidence already proves
  that state; otherwise it fails closed pending the later A26 contract;
- onboarding trial creation remains outside P4-08, but it may not write a paid
  period or saved billing method.

The future P4-08 architectural ratchet must enumerate narrow authorized
writers rather than exclude all tenant administration paths by directory.
Introducing a direct `BillingPayment` write, YooKassa payment create, paid
window update, or past-due update outside the canonical executor must fail the
ratchet.

## 5. Provider and UNKNOWN contract retained

These decisions do not alter the already complete provider contract:

- `PENDING` is a known provider state;
- ambiguous post-dispatch transport outcome is `UNKNOWN`, not `FAILED`;
- the exact original idempotence key and byte-equivalent request are retained;
- no different-key retry follows `UNKNOWN`;
- provider reference GET is preferred; same-key reconciliation is used only
  when the reference was not captured;
- inconclusive reconciliation remains `UNKNOWN`/manual-required;
- webhook payload is a hint; authoritative provider evidence owns status;
- terminal outcome application is one local transactional claim.

## 6. Schema impact

No schema change is proposed.

The envelope and cap facts fit in retained ActionExecution normalized input,
policy evidence, and safe result. Per-payment dispatch and reconciliation use
ActionAttempt. BillingPayment keeps its existing immutable execution binding
and one-time provider/idempotence claims.

## 7. Acceptance criteria

After explicit approval, the P4-08 safe local cycle may start with four
non-executable Shadows and continue through targeted/adversarial PostgreSQL
proof. The cycle must prove:

- deterministic manual/scheduler convergence;
- caps enforced before provider dispatch;
- no additional charge capacity on restart;
- different-plan active-window checkout rejected;
- lazy/admin paths cannot mutate payment-derived fields directly;
- `PENDING != UNKNOWN`;
- no blind retry after `UNKNOWN`;
- provider reconciliation with the original request;
- duplicate webhook/payment cannot apply entitlement twice;
- no production payment, provider write, or billing mutation for proof.

## 8. Proposal verdict

`P4-08 CONTRACT PROPOSAL READY: YES`

`RECURRING CHILD CAP PROPOSED: 25`

`PER-PAYMENT CAP PROPOSED: 300000 KOPECKS`

`AGGREGATE ENVELOPE CAP PROPOSED: 7500000 KOPECKS`

`SCHEDULER ENVELOPE DETERMINISTIC: YES`

`ACTIVE-WINDOW DIFFERENT-PLAN CHECKOUT: FAIL CLOSED`

`PAYMENT-DERIVED ENTITLEMENT OWNER: P4-08 ACTION ENGINE EXECUTORS`

`GENERIC ADMIN/LAZY BILLING FIELD WRITES AFTER CUTOVER: FORBIDDEN`

`ADDITIONAL SCHEMA REQUIRED: NO`

`PRODUCTION PAYMENT/VALUE MUTATIONS: 0`

`P4-08 SHADOW AUTHORIZED: NO — EXPLICIT PROPOSAL APPROVAL REQUIRED`

STOP.
