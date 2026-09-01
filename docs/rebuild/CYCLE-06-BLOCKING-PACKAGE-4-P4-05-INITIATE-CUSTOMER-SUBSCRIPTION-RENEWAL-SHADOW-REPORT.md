# CYCLE 06 BLOCKING PACKAGE 4 — P4-05 INITIATE_CUSTOMER_SUBSCRIPTION_RENEWAL SHADOW REPORT

Status: third P4-05 canonical Shadow slice complete; no provider dispatch,
subscription mutation, or executable cutover

Source checkpoint: `a8fc15c2`

Report date: 2026-09-01

## 1. Exact slice and legacy boundary

This step implements only the approved non-executable Shadow for:

`initiate_customer_subscription_renewal`.

The completed purchase and initial activation Shadow slices were not changed.
The current production owner remains the legacy Telegram/PWA purchase flow,
legacy pending-payment row, and direct YooKassa checkout creation. This slice
does not wire its disposable bridge into `bot.py`, `webhook_server.py`, or the
legacy subscription database adapter.

Renewal remains distinct from initial purchase and activation:

| Fact | Canonical meaning in this slice |
|---|---|
| exact active predecessor plus explicit customer renewal intent | may produce one deterministic Shadow checkout plan inside the renewal window |
| provider checkout later returns known `pending` | known checkout state; not `UNKNOWN`; still no successor term |
| provider dispatch may have crossed but its result was lost | future executable checkout becomes `UNKNOWN` and requires same-identity reconciliation |
| provider payment later proves `succeeded` | evidence for the separate `activate_customer_subscription_renewal` capability |
| successor activation | creates a new term with `previousSubscriptionId`; never changes the predecessor |

No provider dispatch occurs in this Shadow, so it does not invent `UNKNOWN`.

## 2. Server-derived renewal contract

Before planning, the canonical service derives and verifies:

- tenant from the server-bound provider/company integration;
- exact same-tenant, active, unmerged canonical Client;
- absence of an active `UnresolvedClientIdentityHold`, including P02/P03;
- one exact same-tenant `CustomerSubscription` predecessor owned by that
  Client;
- predecessor status `active` and current time inside the server-owned final
  three-day renewal window inherited from the accepted legacy product;
- absence of an existing canonical successor for the predecessor;
- an exact active server-owned offer whose plan, immutable snapshot, service
  scope, price, currency, and allowance match the predecessor;
- renewal intent identity from tenant + Client + predecessor + predecessor
  term identity + opaque explicit intent reference;
- checkout identity from tenant + Client + predecessor + renewal intent +
  frozen plan/value facts + renewal checkout-contract version;
- YooKassa provider request seed from the canonical checkout identity;
- policy profile, renewal-window policy, eligibility, and approval requirement
  server-side.

The bridge payload contains only provider/Client identity, predecessor id, and
an opaque explicit renewal-intent reference. It cannot provide plan, price,
currency, term dates, eligibility, entitlement, approval, autonomy, policy, or
executor authority.

## 3. Predecessor and next-term semantics

The Shadow plan records the predecessor's immutable term identity and exact
boundaries. It represents the intended successor through:

- `checkoutMode = renewal`;
- exact predecessor `CustomerSubscription` and term identity;
- current server-owned offer snapshot and value;
- `minimumNextTermStartsAt = predecessor.termEndsAt`;
- `nextTermStartRule = later_of_predecessor_end_or_payment_succeeded_at`;
- a 30-day server-owned duration from the frozen offer;
- `activatesSubscription = false`;
- `mutatesPredecessor = false`.

Exact successor dates are not caller input and are not prematurely fixed by
checkout initiation. The separate renewal activation will derive the actual
start as the later of predecessor end and authoritative payment-success time.
The current predecessor row is read only and remains historically immutable.

Fail-closed outcomes cover missing/cross-tenant predecessor, Client mismatch,
merged or unresolved identity, inactive/expired/canceled/revoked predecessor,
renewal outside the allowed window, catalog mismatch, existing successor, and
a conflicting open checkout identity. Same logical retries, restarts, and
Telegram/PWA initiators converge through the same ActionExecution identity.

## 4. Action Engine and side-effect boundary

The Action Engine registry now contains:

`customer-subscriptions.renewal-purchase.shadow.v1`.

Its enforced properties are:

- `actionClass = initiate_customer_subscription_renewal`;
- target = exact predecessor-qualified renewal checkout;
- `policyDecision = SHADOW_ONLY`;
- `autonomyLevel = L2_5_SHADOW`;
- `executorKey = shadow.none`;
- one planning attempt;
- no external dispatch or executable retry;
- no reconciliation redispatch;
- approval `NONE`, derived by the server for an explicit authenticated intent.

The service calls only `ActionEngineRuntimeService.planShadow` after read-only
identity, predecessor, catalog, window, successor, and conflict checks. It
does not create a checkout/payment, call YooKassa, write a
`CustomerSubscription`, change the predecessor, activate a successor, or send
a message.

## 5. Targeted proof

Targeted tests prove:

1. exact active predecessor in the renewal window produces the exact
   server-derived renewal checkout plan;
2. retry, process restart, Telegram, and PWA initiators preserve one identity;
3. predecessor facts are unchanged by planning;
4. next-term rule and minimum boundary are server-derived;
5. renewal too early or after the predecessor end is rejected;
6. expired, canceled, and revoked predecessors are rejected;
7. wrong tenant, wrong Client, missing predecessor, or merged Client is
   rejected;
8. active unresolved identity hold fails closed;
9. predecessor facts that no longer match the active server catalog are
   rejected;
10. an existing successor or different open renewal identity is rejected,
    while an exact retry converges;
11. forged price, currency, plan, dates, eligibility, entitlement, approval,
    autonomy, policy, and executor fields are rejected;
12. the Shadow capability is physically non-executable L2.5;
13. the disposable bridge contains no database/provider/message mutation path;
14. the new path creates no checkout, payment, term, provider write, or
    communication side effect.

## 6. Verification

All checks ran sequentially in low-load mode:

| Check | Result |
|---|---|
| P4-05 purchase/activation/renewal service, contract, architecture, registry and ingress suites | PASS — 11 suites / 76 tests |
| Purchase + activation + renewal Python bridge unittests | PASS — 6 tests |
| Targeted ESLint | PASS |
| Application TypeScript typecheck | PASS |
| `git diff --check` | PASS |

No full suite, build, browser, Playwright, provider write, production endpoint,
temporary database, checkout, payment, renewal, activation, usage, terminal
mutation, or customer delivery was run. Production Shadow was not deployed.

## 7. Safety boundary

- No provider checkout or payment was created.
- No `CustomerSubscription` was created, renewed, activated, changed, or
  ended.
- No `CustomerSubscriptionUsage` was created.
- No billing/payment state changed.
- No provider write or message occurred.
- The legacy renewal executor remains the production owner.
- Purchase Shadow 1/8 and activation Shadow 2/8 remain unchanged.
- Renewal activation, usage, expiry, cancel, and revoke were not started.
- P4-02, P4-03, and P4-04 were not modified.
- A08 payment write remains disabled.
- P4-06, Package 5, and Chapter 7 were not started.

## 8. Verdict

`P4-05 SHADOW ACTION CLASS: initiate_customer_subscription_renewal`

`CANONICAL SHADOW WIRED: YES`

`SHADOW DIVERGENCES: 0`

`RENEWAL CHECKOUTS CREATED BY NEW PATH: 0`

`SUBSCRIPTION TERM MUTATIONS BY NEW PATH: 0`

`PAYMENT/PROVIDER WRITES BY NEW PATH: 0`

`MESSAGES SENT BY NEW PATH: 0`

`P4-05 ACTION CLASSES SHADOW-MIGRATED: 3/8`

`EXECUTABLE CUTOVER: NO`

`PRODUCTION SHADOW DEPLOYED: NO`

`NEXT P4-05 ACTION STARTED: NO`

## 9. Permanent process hygiene

All commands were foreground and self-terminating. No background process,
watcher, browser, Playwright process, or temporary database was started.

`TEMP PROCESSES STARTED: 0`

`TEMP PROCESSES TERMINATED: 0`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES REMAINING: 0`

STOP. The fourth P4-05 action class requires a separate explicit instruction.
