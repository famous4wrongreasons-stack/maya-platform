# CYCLE 06 BLOCKING PACKAGE 4 — MONETARY AND VALUE MUTATION CONVERGENCE — SCHEMA GATE

Status: pre-implementation schema gate
Checkpoint HEAD: `0052f4e6`
Review date: 2026-08-29

## 1. Gate Boundary

The accepted source of truth is
`docs/rebuild/CYCLE-06-REMAINDER-REVIEW.md`:

> **Monetary and value mutation convergence**
>
> Migrate billing, payments, loyalty, referral, subscription, commerce,
> certificate, and expense actions with provider reconciliation and hard
> blast-radius controls.

This checkpoint does not reopen or modify Blocking Package 3. It does not
change application code, Prisma schema, migrations, databases, production
data, provider state, credentials, payments, customer value, runtime agents,
Package 5, or Chapter 7.

The pre-implementation review was performed from `0052f4e6`, which equals
`origin/codex/maya-brain-systemic-release-20260815` at the start of the gate.

## 2. Exact Package 4 Action Scope

The old remainder inventory deliberately used broad normalized classes. This
gate keeps those IDs traceable, but decomposes their value-changing operations
far enough that one completed path cannot be used as proof for an adjacent
financial action.

| Gate ID | Remainder ID | Exact action class / operation slice | Current production owner | Direct Action Engine bypass |
|---|---|---|---|---:|
| P4-01 | A08 | Settle/close an appointment payment (`pay_visit`) | No reachable production executor; Action Engine registry is `DENY`, bridge and CRM paths are tombstoned | No — explicitly disabled |
| P4-02 | A19 | Adjust the Nest internal loyalty balance | Legacy AI Tool Runtime and direct HTTP -> `LoyaltyService` | Yes |
| P4-03 | A20-L | Earn, expire, redeem, refund, backfill, or consume legacy loyalty value/codes | Python loyalty jobs/handlers -> legacy database | Yes |
| P4-04 | A20-R | Create/resolve/expire a referral and issue its rewards | Python referral handler/resolver -> legacy database | Yes |
| P4-05 | A20-S | Create a customer subscription, attach/apply its payment, sync usage, expire it, or renew it | Python bot/webhook/subscription job -> legacy database and YooKassa client | Yes |
| P4-06 | A20-C | Issue, take payment for, reconcile/cancel, or redeem a gift certificate | Python bot/webhook/poller -> legacy database and YooKassa client | Yes |
| P4-07 | A21 | Create/delete an expense or declare/invalidate period completeness | Legacy AI Tool Runtime and direct HTTP -> `ExpensesService` | Yes |
| P4-08 | A24 | Create tenant billing checkout, perform recurring charge, apply webhook/reconciliation outcome, and mutate paid/past-due subscription state | HTTP/admin/scheduler/provider webhook -> `BillingService`/YooKassa client | Yes |
| P4-09 | A27-V | Change value-bearing certificate/membership offers or referral reward policy | Direct HTTP -> `BusinessContentService` | Yes |
| P4-10 | A32 | Connect, recheck, replace, or disconnect tenant commerce payment credentials | Direct HTTP -> `CommerceIntegrationService` | Yes |

P4-09 is only the value-bearing slice of A27. Ordinary inventory and other
non-value catalog CRUD remain in Package 5; Package 5 is not started by this
classification.

Provider webhooks and schedulers may remain initiators or evidence sources.
They may not remain execution owners that directly charge, grant value, or
apply a value outcome outside the canonical action lifecycle.

Package-specific scope groups: **10**.
Production-reachable bypass groups in this decomposition: **9**.
P4-01 remains non-executable and is not counted as a bypass.

## 3. Current Execution Evidence

### Canonical kernel

`ActionExecution` and `ActionAttempt` already provide the generic durable
lifecycle, tenant-qualified identity, policy and approval attestation,
attempt-level provider request identity, dispatch certainty, provider reference,
reconciliation state, lease/claim state, and `UNKNOWN != FAILED` semantics.

The Package 3 fields are sufficient for server-derived policy and approval
attestation:

- `policyContextContract`;
- `policyContextHash`;
- `policyEvidenceJson`;
- `policyEvaluatedAt`;
- `policyValidUntil`;
- `approvalBindingHash`.

Package 4 must reuse this kernel. It must not create a second generic action,
approval, retry, or provider-attempt engine.

### Current direct owners

- `maya-saas-backend/src/loyalty/loyalty.controller.ts` and
  `loyalty.service.ts` directly adjust the canonical Nest loyalty ledger.
- `maya-saas-backend/src/expenses/expenses.controller.ts`, the legacy AI Tool
  Runtime, and `expenses.service.ts` directly create/delete expenses and write
  period declarations.
- `maya-saas-backend/src/billing/billing.controller.ts`,
  `billing-scheduler.service.ts`, and `billing.service.ts` directly create
  provider payments, apply payment results, charge due tenants, and update
  subscription access state.
- `maya-saas-backend/src/business-content/business-content.service.ts`
  directly changes certificate/membership offer prices and referral rewards.
- `maya-saas-backend/src/commerce/commerce-integration.service.ts` directly
  verifies and replaces tenant payment credentials.
- `ai администратор/loyalty.py`, `referral.py`, `subscriptions.py`,
  `bot.py`, `webhook_server.py`, and the legacy database modules directly
  mutate loyalty, referral, customer subscription, certificate, and provider
  payment state.

No Package 4 capability other than the disabled A08 registry entry is
registered as a canonical Action Engine capability at this checkpoint.

### A08 boundary

The accepted A08 decision remains unchanged:

- payment status read is enabled;
- payment write is disabled;
- `crm.visit.payment.v1` / `pay_visit` has policy `DENY`;
- no bridge, CRM service, Python fallback, allowlist, or environment switch can
  dispatch it;
- no new production payment proof is authorized.

Package 4 may count A08 complete only while that physical non-reachability and
its ratchet remain true. Reopening it requires a separate provider capability
gate and explicit approval; Package 4 itself is not permission to do so.

## 4. Existing Storage Contracts

| Value family | Current storage | Useful existing guarantees | Blocking gap |
|---|---|---|---|
| Generic action lifecycle | Prisma `ActionExecution` + `ActionAttempt` | Tenant-qualified identity, policy/approval binding, DB claim, durable attempts, dispatch certainty, reconciliation | Domain value records are not consistently bound to the logical execution |
| Tenant billing | Prisma `BillingPayment` + tenant billing fields | Tenant id, provider payment id, idempotence key, amount/currency, status, transactional one-time successful application | No durable relation to `ActionExecution`; provider-create exception is written as `failed` even when external dispatch may be unknown; provider-id-less reconciliation is not proven |
| Nest loyalty | Prisma `LoyaltyAccount` + `LoyaltyTransaction` | Tenant-qualified account, atomic balance update, unique tenant idempotency key | Direct execution owner; no execution binding; external/legacy authority convergence is unresolved |
| Expenses | Prisma `Expense` + `ExpensePeriodDeclaration` | Tenant scope and domain idempotency keys | Direct execution owner; no execution binding; delete and declaration invalidation need their own logical identities |
| Commerce configuration | Prisma `CommerceIntegration`, `TenantCatalogItem`, `ReferralProgram` | Tenant scope; secrets encrypted; catalog/referral policy persisted | Direct execution owner; no versioned value-operation binding; credential replacement performs a provider call before canonical execution ownership |
| Customer certificates | Legacy Python database `gift_certificates` | Code, nominal amount, provider payment id, basic paid/redeemed fields | No canonical multi-tenant Prisma model, ActionExecution binding, or shared claim/reconciliation contract |
| Customer subscriptions | Legacy Python database `subscriptions` | Plan, price, provider payment id, usage and status | No canonical multi-tenant Prisma model, ActionExecution binding, or shared claim/reconciliation contract |
| Referral fulfillment | Legacy Python `referrals` / `referral_promos` | Basic relationship and status rows | No canonical tenant-qualified reward identity or one-award claim linked to ActionExecution |
| Legacy loyalty value | Legacy Python loyalty transactions/codes | Local transaction/code history | Separate authority and idempotency semantics; no tenant-qualified ActionExecution binding |

The legacy Python schema may be deployed per tenant in some environments, but
physical database separation is not a substitute for a tenant-qualified
canonical contract. Package 4 must not infer tenant identity from process,
filename, bot token, or deployment location.

## 5. Why This Blocks Chapter 6

Package 3 proved who may authorize and create an externally executable
`ActionExecution`. Package 4 remains blocked because monetary/value execution
can still occur without that execution:

1. the same business outcome has several direct owners across Nest, Python,
   schedulers, HTTP handlers, webhooks, and provider clients;
2. a provider create timeout can mean money moved while local billing marks the
   operation `failed`, enabling a new logical charge instead of reconciliation;
3. certificate, customer subscription, referral reward, and legacy loyalty
   state have no shared tenant-qualified durable execution identity;
4. one-time value consumption and reward issuance are protected by different
   local mechanisms rather than one DB-claimed execution contract;
5. offer/reward/price changes are not durably bound to the exact version used
   by a later financial execution;
6. a future AI, scheduler, webhook, HTTP route, or legacy bridge could still
   call the domain/provider owner directly even though canonical policy ingress
   now exists.

That prevents Chapter 6 from proving one capability -> one execution owner,
restart safety, `UNKNOWN != FAILED`, tenant isolation, and zero production
bypasses for the financial plane.

## 6. Schema Gate Decision

**Schema Gate is required. The current schema is insufficient for Package 4
runtime convergence.**

This is not a request for another generic execution table. The required design
must retain `ActionExecution`/`ActionAttempt` as the only generic execution
kernel and add only domain authority and binding that the kernel cannot encode.

Before implementation, one explicit additive migration plan must be reviewed
and approved. It must cover, at minimum:

1. a tenant-qualified, immutable binding from each financial/value domain
   operation to its `ActionExecution` (composite tenant/execution identity,
   unique where the business operation is one-to-one);
2. canonical multi-tenant domain records for customer certificates, customer
   subscriptions, and referral rewards/fulfillment, or an equivalently strict
   migration boundary that removes the legacy database as an execution owner;
3. unique business identities and DB-level claims for certificate redemption,
   subscription activation/renewal, referral reward issuance, loyalty
   earn/redeem/refund/expiry, expense create/delete/declaration, and billing
   outcome application;
4. immutable money/value facts: amount, currency, direction, tenant, subject,
   target, offer/reward version, and provider identity where applicable;
5. a provider-dispatch/reconciliation contract that preserves unknown
   dispatch, the original idempotency identity, and provider evidence without
   relabeling uncertainty as failure;
6. safe legacy-row correlation and migration provenance without trusting a
   process-local tenant assumption;
7. retention and encryption rules for provider references, recipient identity,
   payment credentials, and other sensitive evidence;
8. hard blast-radius data needed by policy (per-action amount, tenant/time
   windows, one-time-use state, and deterministic caps) without allowing a
   client-supplied cap or approval to become authority.

The schema design must prefer domain-specific models over a generic mutable
"value ledger" that would erase certificate, subscription, loyalty, expense,
and billing semantics. Existing `BillingPayment`, `LoyaltyTransaction`,
`Expense`, and `ExpensePeriodDeclaration` should be extended additively where
their domain contract is already sound. Historical rows must remain compatible.

No migration is created or applied by this gate.

## 7. Completion Criteria For Package 4

Package 4 can complete only when all of the following are proven:

1. every P4 action class is either owned by the canonical Action Engine or is
   physically production-unreachable with a maintained ratchet;
2. AI, HTTP, Python, schedulers, provider webhooks, and future agents are only
   initiators/evidence sources and cannot directly grant, consume, charge, or
   apply value;
3. tenant, requester, entitlement, autonomy, policy, approval, amount,
   currency, target, offer/reward version, and blast-radius decision are
   server-derived and bound to the logical action;
4. approval-required financial actions fail closed without the exact Package 3
   approval binding; L2.5 Shadow never receives external execution permission;
5. one logical action has one durable idempotency identity, one DB claim, and
   no blind retry after possible dispatch;
6. provider timeout/ambiguous response becomes `UNKNOWN` and reconciles using
   the original request identity/provider evidence; if the provider cannot
   prove non-execution, automatic redispatch remains forbidden;
7. payment, certificate, subscription, referral, loyalty, and expense outcomes
   are reconciled against authoritative domain/provider state before success;
8. one-time certificate/reward/redemption/renewal semantics resist concurrent,
   replayed, cross-tenant, cross-target, and changed-payload attempts;
9. legacy Python and Nest direct fallbacks are removed or proven unreachable;
10. A08 remains disabled unless its separate provider gate is explicitly
    reopened and completed;
11. A08 UNKNOWN/reconciliation semantics and all appointment/communication
    executors remain unchanged;
12. targeted tests, architecture ratchets, full sequential verification,
    migration safety/drift checks, controlled deployment, and read-only
    production verification pass before Package 4 is marked complete;
13. production-reachable Package 4 execution bypasses recompute to `0`.

No real charge, certificate purchase, reward grant, loyalty adjustment,
expense, credential replacement, or other monetary/value mutation may be
created merely to prove the package. Any indispensable real proof requires a
separate explicit owner instruction and a narrowly bounded safe plan.

## 8. Authorized Next Boundary

This gate stops before schema or runtime work. The next step, only after the
schema plan is explicitly accepted, is the additive Package 4 domain
authority/execution-binding migration candidate and its structural-clone
safety proof. That step must not perform runtime cutover or production writes.

`PACKAGE 4 PRE-IMPLEMENTATION CHECKPOINT COMPLETE: YES`

`PACKAGE 4 EXACT NAME: MONETARY AND VALUE MUTATION CONVERGENCE`

`PACKAGE 4 SCOPE GROUPS: 10`

`PRODUCTION-REACHABLE BYPASS GROUPS IN PACKAGE SCOPE: 9`

`A08 PAYMENT WRITE: DISABLED`

`SCHEMA GATE REQUIRED: YES`

`CURRENT SCHEMA SUFFICIENT: NO`

`PACKAGE 3 MODIFIED: NO`

`SCHEMA CHANGED: NO`

`MIGRATION CREATED: NO`

`RUNTIME IMPLEMENTATION STARTED: NO`

`PRODUCTION SIDE EFFECTS: 0`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP.
