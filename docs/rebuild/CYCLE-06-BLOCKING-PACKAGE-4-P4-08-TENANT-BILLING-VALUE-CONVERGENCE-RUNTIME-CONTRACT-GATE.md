# CYCLE 06 BLOCKING PACKAGE 4 — P4-08 TENANT BILLING VALUE CONVERGENCE RUNTIME CONTRACT GATE

Status: **COMPLETE — CONTRACT DECISION REQUIRED BEFORE SHADOW**

Source checkpoint: `6b60a2e0`

Gate date: 2026-09-02

## 1. Scope and evidence boundary

This Gate analyzes `P4-08 / A24 — Tenant Billing Value Convergence` from the
accepted post-P4-07 remainder checkpoint. It covers MAYA tenant billing, not
customer subscriptions, gift certificates, appointment payments, or commerce
credential administration.

Evidence was taken from the production-reachable Nest billing paths:

- `src/billing/billing.controller.ts`;
- `src/billing/billing.service.ts`;
- `src/billing/billing-scheduler.service.ts`;
- `src/billing/billing-system.gateway.ts`;
- `src/billing/yookassa-client.service.ts`;
- `src/guards/subscription-access.guard.ts`;
- `src/tenants/tenant-access-state.service.ts`;
- `src/tenants/tenants.service.ts` and the platform administration boundary;
- Prisma `ActionExecution`, `ActionAttempt`, `BillingPayment`, `Tenant`, and
  `SubscriptionPlan`;
- the accepted Package 4 monetary/value gate and billing action-binding
  foundation.

No runtime, registry, controller, schema, migration, provider, production, or
value state changed during this Gate. P4-02 through P4-07 remain immutable
completion baselines. A08 remains physically disabled.

## 2. Current production owners and bypass inventory

The family is one broad production bypass group with four concrete mutation
subgroups.

| Subgroup | Production-reachable initiators | Current execution owner | Direct effect |
| --- | --- | --- | --- |
| checkout/provider intent | authenticated self-service and admin checkout HTTP | `BillingService.createCheckout` plus `YooKassaClientService` | creates an unbound `BillingPayment`, dispatches provider payment creation, and stores provider result |
| recurring provider charge | hourly scheduler and platform-owner manual charge/run-due HTTP | `BillingSchedulerService` / `BillingService.chargeTenant` | creates an unbound recurring `BillingPayment` and dispatches a saved-method charge |
| provider outcome application | public YooKassa webhook and pending-payment scheduler reconciliation | `BillingService.applyProviderPaymentIfFinal` | terminalizes a payment and, on success, mutates tenant plan, paid window, billing method, and access state |
| billing access-state transition | billing scheduler plus lazy access-state synchronization | `BillingService.markTenantPastDue`, `TenantAccessStateService.getAndSync`, and the equivalent tenant access path | mutates tenant status, trial access, past-due time, and grace window |

The scheduler's in-memory `running` flag is not a distributed claim. Its source
explicitly assumes one application instance. `listBillingCandidates()` is
unbounded. Pending reconciliation is bounded to 200 reads, but currently has
no canonical envelope identity or per-payment child ActionExecution.

There are also overlapping platform administration paths that can write
`planId`, paid-window dates, `billingMethodId`, and `ACTIVE`/`PAST_DUE` status
without payment evidence. They originated under the broader tenant-admin
family, but they write the same entitlement fields that P4-08 must claim. They
cannot remain an unqualified exception if P4-08 is later declared the sole
production owner of payment-derived access.

`P4-08 PRODUCTION BYPASS GROUPS: 1`

`P4-08 DIRECT-MUTATION SUBGROUPS: 4`

## 3. Exact action classes

P4-08 has four action classes. Webhook, polling, HTTP, and scheduler sources
are initiators or evidence channels; they do not create additional value
semantics.

| Order | Action class | Business boundary | External write |
| ---: | --- | --- | --- |
| 1 | `initiate_tenant_billing_checkout` | one explicit, actor-authorized tenant checkout intent for one exact server catalog plan and amount | YooKassa payment create |
| 2 | `charge_tenant_billing_recurring` | one due tenant billing window charged against one exact saved provider method under scheduler/manual charge policy | YooKassa payment create |
| 3 | `apply_tenant_billing_payment_outcome` | one authoritative terminal provider outcome applied once to the bound `BillingPayment` and tenant entitlement | none; authoritative provider read precedes local mutation |
| 4 | `transition_tenant_billing_past_due` | one exact expired access boundary transitions locally to the canonical past-due/grace state | none |

Reconciliation is not a fifth value action. It is durable evidence recovery for
the original provider attempt and, when a terminal provider fact is proven,
an initiator of `apply_tenant_billing_payment_outcome`. A repeated webhook and
a poll for the same payment must converge on the same outcome execution.

Past-due transition is not payment failure. It has a separate local identity
because it may follow an expired trial, a due paid window with no billing
method, or an authoritative canceled recurring payment.

## 4. Canonical identities and server-derived facts

All authority is recomputed inside the canonical path. Initiator input may
carry an intent alias or provider notification reference, but never owns
tenant, plan, amount, currency, payment status, billing method, due window,
entitlement, approval, or retry policy.

### 4.1 Checkout

The normalized contract binds:

- authenticated tenant and actor;
- exact public/server-owned `SubscriptionPlan`;
- plan snapshot hash, monthly duration contract, amount in integer kopecks,
  and `RUB` currency;
- return/presentation policy and receipt policy version;
- intent identity and provider request bytes;
- risk, policy, approval, and transport versions.

Logical identity:

`tenant + canonical intent reference + plan snapshot + amount + currency + checkout contract version`.

The executor creates one `BillingPayment` bound to that ActionExecution before
dispatch. The provider idempotence key derives from the claimed execution. A
known provider `pending` payment makes checkout initiation `SUCCEEDED` with a
safe confirmation result; it does not grant a paid window.

### 4.2 Recurring charge

The normalized contract binds:

- tenant and exact due window;
- current server-owned plan snapshot, monthly amount, and currency;
- HMAC/reference to the exact saved provider payment method, never a raw
  payment credential in evidence or result;
- deterministic scheduler envelope and per-tenant child identity;
- risk, policy, approval, per-charge cap, and aggregate envelope cap.

Logical identity:

`tenant + exact due-window end + plan snapshot + amount + currency + recurring contract version`.

Manual and scheduler initiation of the same due window converge. A new random
UUID must never split the logical charge.

### 4.3 Provider outcome

The outcome identity binds:

`tenant + bound BillingPayment + originating checkout/charge execution + provider + provider-payment-reference hash + exact terminal outcome contract version`.

Before local mutation the executor independently reads and validates provider
identity, payment metadata, tenant, local payment, purpose, amount, currency,
and terminal status. Webhook claims such as `paid=true` are not authority.

One transaction claims the non-terminal `BillingPayment`, persists the
terminal outcome, and applies the resulting tenant paid window exactly once.
Concurrent webhook and polling paths have one winner. Duplicate provider
notifications return the existing result and cannot add another month.

### 4.4 Past due

The identity binds:

`tenant + exact trial/paid access-window end + past-due policy version + optional exact canceled recurring payment`.

The transition is allowed only when no pending or `UNKNOWN` payment execution
can still prove payment for the same window. It derives `pastDueAt` and
`graceEndsAt` server-side and commits locally. Lazy access checks may submit
this action; they may not update `Tenant` themselves.

## 5. Provider states, UNKNOWN, and reconciliation

Only checkout initiation and recurring charge cross an external mutation
boundary.

| Evidence | Canonical state |
| --- | --- |
| provider operation proven not dispatched or definitively rejected | `FAILED`/`NOT_EXECUTED` according to the retry policy |
| provider payment exists and status is `pending`/`waiting_for_capture` | originating action `SUCCEEDED`; `BillingPayment` remains known pending; no paid entitlement |
| transport interruption after dispatch may have crossed | attempt and execution `UNKNOWN`; payment is not relabeled failed; no new-key dispatch |
| provider proves `succeeded` | terminal outcome action may atomically apply payment and entitlement |
| provider proves `canceled` | terminal outcome action may close the payment; recurring access consequences use the separate past-due action |
| provider evidence remains inconclusive | remain `UNKNOWN`/manual-required |

Reconciliation uses the exact original attempt:

1. GET by encrypted/hash-bound provider payment reference when present;
2. otherwise the same YooKassa idempotence key and byte-equivalent request,
   matching the already accepted P4-05/P4-06 provider contract;
3. authoritative provider identity/status/amount/currency/metadata validation;
4. manual review if the provider cannot distinguish applied from not applied.

A same-key replay is an idempotent provider reconciliation operation, not a new
logical payment. A different key is forbidden. Poll timeout does not convert
`UNKNOWN` to `FAILED`. `PENDING` is a known business state and never aliases
transport ambiguity.

`PROVIDER UNKNOWN/RECONCILIATION CONTRACT: COMPLETE`

## 6. Atomicity, concurrency, and restart safety

The provider operation is not locally atomic. The domain boundaries are:

```text
ActionExecution claim + BillingPayment binding       -> local transaction
provider dispatch                                    -> durable ActionAttempt
terminal BillingPayment claim + tenant entitlement   -> local transaction
past-due state transition                            -> local transaction
```

If a local transaction rolls back, no domain result exists. If it commits and
the process dies before ActionExecution finalization, reconciliation finds the
exact execution-bound payment or exact tenant outcome and proves success.

The existing unique `BillingPayment.actionExecutionId`, unique
`providerPaymentId`, unique `idempotenceKey`, immutable execution binding, and
ActionExecution/ActionAttempt claims are sufficient. No new provider-operation
table is required.

## 7. Payment-to-entitlement contract

Successful payment may apply exactly one monthly access window. The exact
amount and plan snapshot are frozen at initiation and revalidated at outcome
application. The start is the later of authoritative paid time and the end of
an already-paid same-plan window; the end is one calendar month later under
the versioned monthly-term contract.

The current runtime permits checkout for a different plan while a paid window
is still active, then immediately changes `Tenant.planId` while extending the
new term from the old period end. This grants or removes plan entitlements
before the purchased next window starts. No accepted P4-08 decision says
whether a mid-window plan switch is immediate, deferred, prorated, or denied.

The safe proposal is to deny a different-plan checkout while a paid window is
active. Same-plan prepayment may extend the existing window. A future plan
change requires a separately approved business contract; P4-08 must not
invent proration or scheduled-plan semantics.

## 8. Policy, approval, scheduler, and blast radius

- self checkout: authenticated tenant owner/admin, one tenant and one plan;
- platform checkout: exact platform actor and tenant scope;
- manual recurring charge: platform-owner authority and one exact due window;
- provider outcome: system evidence action, no caller-supplied approval;
- past due: system lifecycle policy or exact platform decision;
- all provider amounts come from the frozen server plan snapshot;
- a scheduler is an envelope/fan-out initiator, never a payment owner.

The current recurring scheduler has no approved per-payment kopeck cap, no
approved aggregate kopeck cap, and no bounded candidate query. Its process
flag is not a durable envelope claim. Choosing financial limits is a business
decision, not a safe implementation inference.

The proposed safe contract uses one deterministic hourly envelope, at most 25
recurring child executions, a server-owned per-payment cap, a server-owned
aggregate cap, and partial restart/resume by child ActionExecution identity.
The exact monetary caps require approval before code.

Reconciliation may retain the existing bound of 200 provider reads per
envelope because it does not authorize a new dispatch. Each terminal outcome
still runs as its own claimed child execution.

## 9. Overlapping tenant-field writers

P4-08 cannot claim sole payment-entitlement ownership while general tenant
administration or lazy access synchronization can independently write the
same payment-derived fields.

The contract proposal therefore requires:

- lazy access paths submit `transition_tenant_billing_past_due` and become
  read-only with respect to billing fields;
- generic tenant PATCH must not set payment-derived plan/window/method fields,
  even for a platform owner;
- security suspension may remain outside A24 because it only removes access;
- generic `activate` must not fabricate paid access. Re-enabling access must
  prove an existing paid/trial entitlement or wait for its later A26 contract.

This is a contract/ownership fence, not evidence for an additional schema
model.

## 10. Schema verdict

Current durable storage can represent all four action contracts:

- `ActionExecution` owns logical identity, normalized evidence, policy,
  approval, retry, final outcome, and reconciliation;
- `ActionAttempt` owns provider request identity, dispatch state, encrypted
  provider reference, and `UNKNOWN` evidence;
- `BillingPayment` owns immutable amount/currency/purpose/provider correlation
  and has an immutable tenant-qualified 1:1 execution binding;
- `Tenant` owns the current billing entitlement projection;
- `SubscriptionPlan` plus the retained execution input owns the server plan
  snapshot used by payment.

No schema migration is required for the safe restricted semantics. A scheduled
future plan change or prorated plan transition would be a different contract
and may require its own durable term model; it is explicitly not inferred
here.

`CANONICAL SCHEMA SUFFICIENT: YES`

`ADDITIONAL SCHEMA REQUIRED: NO`

## 11. Blocking contract decisions

Three decisions remain intentionally unimplemented:

1. approve exact per-payment and aggregate recurring scheduler caps;
2. approve fail-closed same-plan-only behavior during an active paid window;
3. approve the ownership fence for general admin and lazy access-state writers.

They are specified in
`CYCLE-06-BLOCKING-PACKAGE-4-P4-08-SCHEDULER-AND-ENTITLEMENT-OWNERSHIP-CONTRACT-PROPOSAL.md`.
Until approved, starting Shadows would encode unapproved payment policy and a
future cutover could not truthfully reduce direct entitlement writers to zero.

## 12. Gate verdict

`P4-08 RUNTIME CONTRACT GATE COMPLETE: YES`

`P4-08 EXACT ACTION CLASSES: 4 — initiate_tenant_billing_checkout / charge_tenant_billing_recurring / apply_tenant_billing_payment_outcome / transition_tenant_billing_past_due`

`P4-08 PRODUCTION BYPASS GROUPS: 1`

`P4-08 DIRECT-MUTATION SUBGROUPS: 4`

`CANONICAL SCHEMA SUFFICIENT: YES`

`ADDITIONAL SCHEMA REQUIRED: NO`

`PROVIDER UNKNOWN/RECONCILIATION CONTRACT: COMPLETE`

`P4-08 SHADOW ACTION CLASSES: 0/4`

`P4-08 EXECUTABLE PROOF: NOT RUN`

`DUPLICATE PAYMENT POSSIBLE: YES — CURRENT LEGACY OWNER REMAINS ACTIVE`

`PENDING != UNKNOWN: NOT ENFORCED BY CURRENT OWNER`

`BLIND RETRY AFTER UNKNOWN: NOT YET PREVENTED BY CURRENT OWNER`

`PROVIDER RECONCILIATION: CONTRACT DEFINED / NOT YET PROVEN`

`LEGACY BYPASS RATCHET READY: NO`

`REAL PRODUCTION PAYMENT/VALUE MUTATIONS: 0`

`READY FOR P4-08 PRODUCTION CUTOVER: NO`

`P4-08 SHADOW CAN START: NO — CONTRACT PROPOSAL APPROVAL REQUIRED`

`P4-09 STARTED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP.
