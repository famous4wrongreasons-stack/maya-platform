# CYCLE 06 BLOCKING PACKAGE 4 — P4-05 ACTIVATE_CUSTOMER_SUBSCRIPTION_RENEWAL SHADOW REPORT

Status: fourth P4-05 canonical Shadow slice complete; no subscription mutation
or executable cutover

Source checkpoint: `4393a870`

Report date: 2026-09-01

## 1. Exact slice and evidence boundary

This step implements only the approved non-executable Shadow for:

`activate_customer_subscription_renewal`.

The completed purchase, initial activation, and renewal checkout Shadow slices
were not changed. Renewal checkout, provider payment success, and successor
term activation remain separate facts:

| Evidence state | Renewal activation result |
|---|---|
| renewal checkout is missing, Shadow-only, non-successful, non-ALLOW, or lacks the acknowledged provider attempt | fail closed |
| renewal checkout ActionExecution is `UNKNOWN` | `payment_unknown`; no successor plan |
| provider read says `pending` | `payment_pending`; known state, not `UNKNOWN`, no successor plan |
| provider read says failed/canceled/expired | `payment_not_succeeded`; no successor plan |
| provider read is unavailable | fail closed before planning; no local `UNKNOWN` is invented |
| provider read is successful but payment/client/predecessor/metadata/amount/currency differ | `payment_evidence_mismatch` |
| exact executable renewal checkout plus authoritative `succeeded`, `paid=true` evidence | deterministic non-executable successor-term plan |

The initiator payload contains only the exact checkout execution id and CRM
Client identity. It cannot assert payment success, predecessor, plan, price,
currency, term dates, entitlement, approval, policy, or executor authority.

## 2. Server-derived renewal activation contract

Before planning, the canonical service derives and verifies:

- tenant from the server-bound provider/company integration;
- exact same-tenant, active, unmerged canonical Client;
- absence of an active `UnresolvedClientIdentityHold`, including P02/P03;
- one non-dry-run `SUCCEEDED` renewal checkout ActionExecution with policy
  `ALLOW` and outcome `provider_checkout_created`;
- checkout mode `renewal`, exact predecessor id/term identity, and the frozen
  Client, offer, plan, tier, service scope, price, currency, allowance, term
  duration, and provider-request identity;
- one exact tenant-qualified predecessor `CustomerSubscription` with unchanged
  Client, term identity, plan/value/scope facts, and immutable boundaries;
- predecessor lifecycle state `active` or historically `expired`; a canceled
  or revoked predecessor fails closed;
- one acknowledged successful checkout ActionAttempt with encrypted provider
  reference and matching provider request identity;
- a fresh read-only YooKassa result whose id, `succeeded`/paid state, amount,
  currency, tenant, checkout, checkout identity, Client, and predecessor
  metadata all match the durable checkout facts;
- provider payment identity from the durable provider-reference hash;
- activation identity from tenant + predecessor term + checkout + provider +
  payment identity + exact succeeded outcome;
- absence of any existing successor, payment claim, or term claim;
- server-owned Shadow policy, one-time eligibility, and approval requirement.

The raw provider payment id is decrypted only in memory for the read. The
ActionExecution retains only durable provider request/payment identity hashes.

## 3. New-term and predecessor semantics

The intended successor records:

- `previousSubscriptionId = exact predecessor`;
- the same canonical Client and frozen offer facts;
- `termStartsAt = max(predecessor.termEndsAt, providerPaidAt)`;
- `termEndsAt = termStartsAt + frozen termDays`;
- one deterministic activation and term identity;
- `status = active`;
- `mutatesPredecessor = false`;
- `writesPerformed = false`.

Payment before predecessor expiry queues a non-overlapping successor boundary
at the predecessor end. Payment after expiry starts the successor at exact
payment-success time. An expired predecessor therefore remains usable as
immutable history when a correctly initiated renewal settles late; canceled
and revoked predecessors remain ineligible.

The service performs no update on the predecessor. PostgreSQL's future
executable path retains the existing unique predecessor claim, tenant-qualified
FK, one activation execution, one provider payment identity, one term identity,
renewal guard, and immutable-facts trigger as the one-time DB boundary.

## 4. Action Engine and side-effect boundary

The Action Engine registry now contains:

`customer-subscriptions.renewal-activation.shadow.v1`.

Its enforced properties are:

- `actionClass = activate_customer_subscription_renewal`;
- target = deterministic successor subscription term;
- `policyDecision = SHADOW_ONLY`;
- `autonomyLevel = L2_5_SHADOW`;
- `executorKey = shadow.none`;
- one planning attempt;
- no external dispatch or executable retry;
- no reconciliation redispatch;
- approval `NONE`, derived by the server.

The service performs one read-only provider lookup only after exact durable
identity, checkout, predecessor, and acknowledged-attempt prerequisites pass.
It then calls only `ActionEngineRuntimeService.planShadow`. It creates no
successor, changes no predecessor, writes no payment/provider state, creates no
usage, and sends no message.

The disposable Python bridge is not wired into production Telegram/PWA paths.
It carries no payment outcome or term authority and has no database, provider,
subscription, usage, or message mutation path.

## 5. Targeted proof

Targeted tests prove:

1. exact renewal checkout plus authoritative successful payment produces the
   exact successor-term plan;
2. payment before predecessor end starts the successor at predecessor end;
3. late payment starts the successor at exact payment-success time;
4. retry, restart, webhook, poller, and startup reconciliation converge on one
   activation identity;
5. `PENDING` and both checkout/provider `UNKNOWN` produce no activation plan;
6. failed, canceled, and expired payment outcomes produce no plan;
7. initial-purchase, dry-run, wrong Client, or changed checkout evidence is
   rejected;
8. provider id, amount, currency, tenant, checkout, Client, or predecessor
   metadata mismatch is rejected;
9. wrong tenant, missing/merged Client, and unresolved identity hold fail
   closed;
10. missing, changed, canceled, or revoked predecessor evidence fails closed;
11. an unchanged expired predecessor supports a late settled renewal without
    mutation;
12. existing successor, payment claim, or term claim blocks duplicate value;
13. missing acknowledged attempt or provider read failure fails closed;
14. forged success, value, predecessor, dates, entitlement, approval,
    autonomy, policy, and executor fields are rejected;
15. only exact acknowledged provider evidence is read before planning;
16. the new path contains no successor, predecessor, payment, provider, usage,
    or message mutation.

## 6. Verification

All checks ran sequentially in low-load mode:

| Check | Result |
|---|---|
| P4-05 purchase/activation/renewal/renewal-activation service, contract, architecture, registry and ingress suites | PASS — 14 suites / 97 tests |
| Four P4-05 Python bridge unittest files | PASS — 8 tests |
| Targeted ESLint | PASS |
| Application TypeScript typecheck | PASS |
| `git diff --check` | PASS |

No full suite, build, browser, Playwright, provider write, production endpoint,
temporary database, checkout, payment, renewal, activation, usage, terminal
mutation, or customer delivery was run. Provider evidence tests use isolated
mocked reads; production Shadow was not deployed.

## 7. Safety boundary

- No `CustomerSubscription` was created, activated, renewed, changed, or
  ended.
- No predecessor term was mutated.
- No `CustomerSubscriptionUsage` was created.
- No BillingPayment or legacy subscription/payment row changed.
- No provider write or message occurred.
- The legacy renewal activation owner remains unchanged.
- P4-05 Shadow slices 1/8 through 3/8 remain unchanged.
- Usage, expiry, cancel, and revoke were not started.
- P4-02, P4-03, and P4-04 were not modified.
- A08 payment write remains disabled.
- P4-06, Package 5, and Chapter 7 were not started.

## 8. Verdict

`P4-05 SHADOW ACTION CLASS: activate_customer_subscription_renewal`

`CANONICAL SHADOW WIRED: YES`

`SHADOW DIVERGENCES: 0`

`SUBSCRIPTIONS CREATED/ACTIVATED BY NEW PATH: 0`

`PREDECESSOR TERM MUTATIONS BY NEW PATH: 0`

`PAYMENT/PROVIDER WRITES BY NEW PATH: 0`

`USAGE CLAIMS CREATED BY NEW PATH: 0`

`MESSAGES SENT BY NEW PATH: 0`

`P4-05 ACTION CLASSES SHADOW-MIGRATED: 4/8`

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

STOP. The fifth P4-05 action class requires a separate explicit instruction.
