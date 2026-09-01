# CYCLE 06 BLOCKING PACKAGE 4 — P4-05 INITIATE_CUSTOMER_SUBSCRIPTION_PURCHASE SHADOW REPORT

Status: first P4-05 canonical Shadow slice complete; no provider dispatch or
executable cutover

Source checkpoint: `98d16524`

Report date: 2026-09-01

## 1. Exact slice and pre-code contract

This step implements only the approved non-executable Shadow for:

`initiate_customer_subscription_purchase`.

Checkout initiation and subscription activation remain separate capabilities.
The Shadow creates one canonical ActionExecution plan and stops before the
YooKassa boundary. It cannot create or activate a `CustomerSubscription`.

| Contract item | Decision |
|---|---|
| Initiator | enumerated Telegram or PWA legacy-bridge customer intent; neither is authority for price, plan facts, policy, or execution |
| Current execution owner | legacy Telegram/PWA handlers in `bot.py` and `webhook_server.py`, including their legacy database and YooKassa calls |
| Tenant | resolved server-side from the bridge-bound provider/company integration |
| Client | one exact, active, unmerged tenant-qualified `CrmClientLink -> Client` resolution |
| Identity hold | canonical registration guard is checked before planning; P02/P03-style unresolved identity fails closed |
| Product selection | caller may identify one offer code, but the plan, tier, price, currency, allowance, term and service scope come only from the fixed server catalog |
| Logical identity | tenant + Client + hashed purchase-intent reference + plan snapshot + exact price/currency/allowance + checkout contract version |
| Checkout conflict | same identity converges; a different active checkout for the same Client fails closed |
| Active term | fails closed because an initial purchase must not impersonate the distinct renewal capability |
| Payment provider | server-selected `yookassa`; only an intended provider operation is included in the plan |
| Policy/approval | server-owned Shadow policy, eligibility and `NONE`; L2.5 has no external execution permission |
| `PENDING` | the future known provider checkout state, not `UNKNOWN` |
| `UNKNOWN` | not applicable to this Shadow because no dispatch is attempted |
| Reconciliation | not invoked by this non-executable slice |

The server-owned catalog faithfully snapshots the six currently approved
legacy offers (`haircut`, `complex`, and `beard`, each at `senior` or `top`),
with exact kopeck prices, `RUB`, two visits, a 30-day term, and deterministic
service-scope references. The bridge never sends price, currency, allowance,
entitlement, approval, autonomy, policy decision, executor, or tenant.

## 2. Implementation

The Action Engine registry now contains the isolated capability:

`customer-subscriptions.purchase.shadow.v1`.

Its immutable execution boundary is:

- `actionClass = initiate_customer_subscription_purchase`;
- `policyDecision = SHADOW_ONLY`;
- `autonomyLevel = L2_5_SHADOW`;
- `executorKey = shadow.none`;
- one planning attempt;
- no executable retry and no reconciliation redispatch;
- `externalSideEffects = 0` through `planShadow`.

`CustomerSubscriptionPurchaseShadowService` performs only read-only
preparation before `ActionEngineRuntimeService.planShadow`:

1. authenticates and binds the bridge integration;
2. derives the tenant;
3. validates the requested offer against the server catalog;
4. checks the unresolved-identity guard;
5. resolves the exact same-tenant canonical Client;
6. rejects an active subscription because renewal is a different action;
7. derives provider-client, purchase-intent, service-scope, plan-snapshot,
   checkout, provider-request-seed, and policy-snapshot hashes;
8. rejects a different active checkout identity for the same Client while
   allowing the exact identity to converge;
9. persists only the non-executable Shadow ActionExecution.

The local Python bridge is a disposable adapter fixture. It contains no
database, payment, subscription, YooKassa, provider, or messaging mutation
authority and is not imported by the unchanged production legacy handlers.
The Nest module is available in local code but is disabled unless the explicit
Shadow flag and bridge bindings are configured. No production Shadow was
deployed for this proof.

## 3. Fail-closed and side-effect proof

Targeted tests prove:

1. exact Client + valid offer produces one deterministic Shadow checkout
   intent;
2. retry produces the same logical request;
3. service restart preserves the same identity;
4. missing/cross-tenant or merged Client resolution is rejected;
5. P02/P03-style active hold is rejected;
6. hold lookup failure is rejected;
7. an offer absent from the server catalog is rejected;
8. an active subscription is rejected instead of entering the renewal
   boundary;
9. a different active checkout identity fails closed while the same identity
   converges;
10. forged price, currency, entitlement, approval, autonomy, policy decision,
    and executor are rejected by DTO/Action Engine contract boundaries;
11. incomplete Client or purchase-intent evidence creates no execution;
12. the feature is fail-closed when the Shadow flag is disabled;
13. `PENDING` remains a known intended provider state and external `UNKNOWN`
    is never synthesized without dispatch;
14. provider checkout, payment, subscription, message, and value mutations by
    the new path remain exactly zero.

The architectural ratchets also prove that the service contains no direct
`CustomerSubscription` or `BillingPayment` mutation, no executable Action
Engine call, no YooKassa call, and no production legacy-owner wiring.

## 4. Targeted verification

All checks ran sequentially in low-load mode:

| Check | Result |
|---|---|
| P4-05 service/contract/architecture + registry/ingress ratchets | PASS — 5 suites / 39 tests |
| Python bridge unittest | PASS — 2 tests |
| Targeted ESLint | PASS |
| Application TypeScript typecheck | PASS |
| `git diff --check` | PASS |

No full suite, build, browser, Playwright, provider client, production endpoint,
temporary database, checkout, payment, or subscription mutation was run.

## 5. Safety boundary

- Production legacy Telegram/PWA paths remain the factual execution owner.
- No YooKassa/provider request was issued.
- No `CustomerSubscription` or renewal row was created or activated.
- No `BillingPayment` or legacy pending-payment row was created or changed.
- No customer message was sent.
- Checkout activation, renewal, usage, expiry, cancel, and revoke actions were
  not started.
- P4-02, P4-03, and P4-04 were not modified.
- A08 payment write remains disabled.
- P4-06, Package 5, and Chapter 7 were not started.

## 6. Verdict

`P4-05 SHADOW ACTION CLASS: initiate_customer_subscription_purchase`

`CANONICAL SHADOW WIRED: YES`

`SHADOW DIVERGENCES: 0`

`PROVIDER CHECKOUTS CREATED BY NEW PATH: 0`

`PAYMENT MUTATIONS BY NEW PATH: 0`

`SUBSCRIPTIONS CREATED/ACTIVATED BY NEW PATH: 0`

`PROVIDER WRITES BY NEW PATH: 0`

`MESSAGES SENT BY NEW PATH: 0`

`P4-05 ACTION CLASSES SHADOW-MIGRATED: 1/8`

`EXECUTABLE CUTOVER: NO`

`PRODUCTION SHADOW DEPLOYED: NO`

`NEXT P4-05 ACTION STARTED: NO`

## 7. Permanent process hygiene

All commands were foreground and self-terminating. No background process,
watcher, browser, Playwright process, or temporary database was started.

`TEMP PROCESSES STARTED: 0`

`TEMP PROCESSES TERMINATED: 0`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES REMAINING: 0`

STOP. The second P4-05 action class requires a separate explicit instruction.
