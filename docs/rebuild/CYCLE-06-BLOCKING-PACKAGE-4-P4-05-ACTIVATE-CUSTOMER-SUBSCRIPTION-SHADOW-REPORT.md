# CYCLE 06 BLOCKING PACKAGE 4 — P4-05 ACTIVATE_CUSTOMER_SUBSCRIPTION SHADOW REPORT

Status: second P4-05 canonical Shadow slice complete; no subscription mutation
or executable cutover

Source checkpoint: `ae410578`

Report date: 2026-09-01

## 1. Exact slice and evidence boundary

This step implements only the approved non-executable Shadow for:

`activate_customer_subscription`.

The completed `initiate_customer_subscription_purchase` Shadow was not
changed. Checkout existence, provider checkout creation, successful payment,
and subscription activation remain distinct facts:

| Evidence state | Activation result |
|---|---|
| checkout ActionExecution is Shadow-only, pending approval, ready, failed, or otherwise not executable-success | fail closed |
| checkout ActionExecution is `UNKNOWN` | `payment_unknown`; no activation plan |
| provider read says `pending` | `payment_pending`; known state, not `UNKNOWN`, no activation plan |
| provider read says failed/cancelled | `payment_not_succeeded`; no activation plan |
| provider read is unavailable | fail closed before mutation; no local `UNKNOWN` is invented |
| provider read is successful but payment/client/metadata/amount/currency differ from checkout | `payment_evidence_mismatch` |
| exact executable checkout plus authoritative `succeeded`, `paid=true` provider evidence | deterministic non-executable activation plan |

The initiator payload contains only the exact checkout execution id and CRM
Client identity. It cannot provide payment status, paid flag, provider payment
reference, price, currency, plan, term, entitlement, approval, policy, or
executor authority.

## 2. Server-derived activation contract

Before planning, the canonical service derives and verifies:

- tenant from the server-bound provider/company integration;
- exact same-tenant, active, unmerged canonical Client;
- absence of an active `UnresolvedClientIdentityHold` through the Chapter 2
  guard;
- one non-dry-run `SUCCEEDED` checkout ActionExecution with policy `ALLOW` and
  outcome `provider_checkout_created`;
- the checkout's frozen Client, offer, plan, tier, plan snapshot, service scope,
  price, currency, allowance, term duration, and provider-request identity;
- one acknowledged successful checkout ActionAttempt with encrypted provider
  reference and matching provider request identity;
- a fresh read-only YooKassa result whose id, `succeeded`/paid state, amount,
  currency, tenant, checkout execution, checkout identity, and Client metadata
  all match the durable checkout facts;
- provider payment identity from the durable provider-reference hash;
- activation identity from tenant + checkout + provider + payment identity +
  exact succeeded outcome;
- term start from authoritative provider capture time and term end from the
  frozen server-owned duration;
- term identity from Client + activation + plan snapshot + exact boundaries;
- absence of an already claimed provider payment or term identity;
- server-owned Shadow policy, eligibility, and approval requirement.

No raw provider payment id is placed in the activation ActionExecution. The
encrypted reference is decrypted only in memory to perform the provider read;
the Shadow input retains only the durable provider payment identity hash.

## 3. Implementation boundary

The Action Engine registry now contains:

`customer-subscriptions.activation.shadow.v1`.

Its enforced properties are:

- `actionClass = activate_customer_subscription`;
- `policyDecision = SHADOW_ONLY`;
- `autonomyLevel = L2_5_SHADOW`;
- `executorKey = shadow.none`;
- one planning attempt;
- no external dispatch or executable retry;
- no reconciliation redispatch;
- approval `NONE`, derived by the server.

The service may perform one read-only `getPayment` after every durable checkout
and identity prerequisite passes. It then calls only
`ActionEngineRuntimeService.planShadow`. The resulting intended term has status
`active`, exact immutable value/scope facts, exact paid-time boundaries, and a
one-time eligibility statement, but `writesPerformed = false`.

The disposable Python bridge is not wired into `bot.py` or
`webhook_server.py`. It submits no provider/payment outcome and contains no
database, payment, subscription, usage, provider-write, or messaging
authority. A Shadow-only checkout from the first slice is explicitly rejected;
therefore no production activation can arise from the current 1/8 Shadow
fixture.

## 4. Targeted proof

Targeted tests prove:

1. exact executable checkout plus authoritative successful provider payment
   produces the exact activation plan;
2. retry and process restart preserve the activation identity;
3. webhook, poller, and startup-reconciliation initiators converge;
4. known `pending` payment produces no plan;
5. checkout/provider `UNKNOWN` produces no plan;
6. failed/cancelled payment produces no plan;
7. provider id, checkout metadata, amount, or currency mismatch is rejected;
8. wrong tenant, wrong Client, missing Client, merged Client, or active identity
   hold is rejected;
9. forged success, price, currency, plan, entitlement, approval, autonomy, and
   executor fields are rejected at the DTO/Action Engine boundaries;
10. a provider-payment or term identity already claimed by a
    `CustomerSubscription` cannot produce a second activation;
11. provider read failure fails closed before planning;
12. only an acknowledged successful checkout attempt can supply the encrypted
    payment reference;
13. the activation contract rejects changed term boundaries and value facts;
14. the new path contains no subscription, payment, usage, provider-write, or
    message mutation.

## 5. Verification

All checks ran sequentially in low-load mode:

| Check | Result |
|---|---|
| P4-05 purchase/activation service, contract, architecture, registry and ingress suites | PASS — 8 suites / 59 tests |
| Purchase + activation Python bridge unittests | PASS — 4 tests |
| Targeted ESLint | PASS |
| Application TypeScript typecheck | PASS |
| `git diff --check` | PASS |

No full suite, build, browser, Playwright, provider write, production endpoint,
temporary database, payment, activation, usage, or customer delivery was run.
The provider evidence tests use an isolated mocked read; production Shadow was
not deployed.

## 6. Safety boundary

- No `CustomerSubscription` was created, activated, changed, or ended.
- No `CustomerSubscriptionUsage` was created.
- No `BillingPayment` or legacy subscription/payment row changed.
- No provider checkout or payment write occurred.
- No message was sent.
- The legacy activation owner remains unchanged.
- Purchase Shadow 1/8 remains unchanged.
- Renewal purchase/activation, usage, expiry, cancel, and revoke were not
  started.
- P4-02, P4-03, and P4-04 were not modified.
- A08 payment write remains disabled.
- P4-06, Package 5, and Chapter 7 were not started.

## 7. Verdict

`P4-05 SHADOW ACTION CLASS: activate_customer_subscription`

`CANONICAL SHADOW WIRED: YES`

`SHADOW DIVERGENCES: 0`

`SUBSCRIPTIONS CREATED/ACTIVATED BY NEW PATH: 0`

`PAYMENT MUTATIONS BY NEW PATH: 0`

`PROVIDER WRITES BY NEW PATH: 0`

`USAGE CLAIMS CREATED BY NEW PATH: 0`

`MESSAGES SENT BY NEW PATH: 0`

`P4-05 ACTION CLASSES SHADOW-MIGRATED: 2/8`

`EXECUTABLE CUTOVER: NO`

`PRODUCTION SHADOW DEPLOYED: NO`

`NEXT P4-05 ACTION STARTED: NO`

## 8. Permanent process hygiene

All commands were foreground and self-terminating. No background process,
watcher, browser, Playwright process, or temporary database was started.

`TEMP PROCESSES STARTED: 0`

`TEMP PROCESSES TERMINATED: 0`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES REMAINING: 0`

STOP. The third P4-05 action class requires a separate explicit instruction.
