# CYCLE 06 BLOCKING PACKAGE 4 — P4-05 ALL-8 EXECUTABLE PROOF / CUTOVER GATE

Status: **PASS — executable proof complete; production cutover remains separate**

Source checkpoint: `ebdd04ec`

Report date: 2026-09-02

## 1. Scope and accepted baseline

This Gate proves the eight accepted P4-05 Shadow contracts together as one
executable customer-subscription lifecycle. It does not redesign or repeat the
eight Shadow slices, deploy their executor, switch a production initiator, or
perform a production payment or subscription mutation.

The isolated executable chain is:

```text
initiate_customer_subscription_purchase
  -> activate_customer_subscription
  -> initiate_customer_subscription_renewal
  -> activate_customer_subscription_renewal
  -> sync_customer_subscription_usage
  -> expire_customer_subscription | cancel_customer_subscription
     | revoke_customer_subscription
```

P4-02, P4-03, and P4-04 remain unchanged. P4-03 canonical loyalty state was
not read as subscription value or mutated. A08 payment write remains disabled.
P4-06, Package 5, and Chapter 7 were not started.

## 2. Canonical executable ownership

The executable capability registrations reuse the eight approved strict
Shadow normalizers. Each capability is entered through Canonical Action
Ingress and `ActionEngineRuntimeService`; the executor cannot accept a
caller-selected tenant, price, term, allowance, payment result, lifecycle
state, actor authority, policy, or approval as truth.

| Action class                              | Canonical executor                | Durable value fact                                                 |
| ----------------------------------------- | --------------------------------- | ------------------------------------------------------------------ |
| `initiate_customer_subscription_purchase` | `customer-subscriptions.checkout` | provider-bound `ActionAttempt`; no subscription value              |
| `activate_customer_subscription`          | `customer-subscriptions.term`     | `CustomerSubscription.activationExecutionId`                       |
| `initiate_customer_subscription_renewal`  | `customer-subscriptions.checkout` | provider-bound `ActionAttempt`; no successor term                  |
| `activate_customer_subscription_renewal`  | `customer-subscriptions.term`     | new `CustomerSubscription` with immutable `previousSubscriptionId` |
| `sync_customer_subscription_usage`        | `customer-subscriptions.usage`    | immutable `CustomerSubscriptionUsage.actionExecutionId` claim      |
| `expire_customer_subscription`            | `customer-subscriptions.terminal` | winning `endExecutionId` plus `expired` status                     |
| `cancel_customer_subscription`            | `customer-subscriptions.terminal` | winning `endExecutionId` plus `cancelled` status                   |
| `revoke_customer_subscription`            | `customer-subscriptions.terminal` | approved winning `endExecutionId` plus `revoked` status            |

The executable service is intentionally not wired into the production
customer-subscriptions module in this Gate. Production legacy owners remain in
place until a separate cutover authorization.

## 3. Payment checkout, `PENDING`, and `UNKNOWN`

The proof used an in-memory YooKassa-shaped provider double behind the real
Action Engine transition kernel. No provider network call occurred.

- checkout creation used the execution transport identity as the provider
  idempotency key;
- retry and restart converged to the same ActionExecution and provider intent;
- a known provider `pending` response finalized the checkout intent without
  creating subscription value;
- `PENDING` activation failed closed;
- response loss after a possibly crossed dispatch produced `UNKNOWN`, not
  `FAILED` or a new-key redispatch;
- an inconclusive provider read left the execution in manual reconciliation
  state and did not dispatch again;
- a conclusive provider read by the original idempotency identity recovered
  the canonical outcome after exactly one provider dispatch;
- provider references discovered during reconciliation were stored on the
  open reconciliation attempt, preserving immutable finished attempts;
- raw provider identifiers were not present in ActionExecution payloads or
  safe results; the durable attempt retained encrypted/reference-hash facts.

Only authoritative `succeeded` plus `paid` provider evidence, matching exact
tenant, Client, checkout execution, amount, currency, and metadata, could
initiate activation. Forged success, price, term, or payment correlation
failed closed.

## 4. Initial activation and renewal

Initial activation ran in a serializable PostgreSQL transaction and wrote the
new term with its tenant-qualified activation execution binding. The proof
verified:

- one successful checkout/payment produced one initial term;
- concurrent/repeated activation converged on that same bound term;
- a synthetic loss after the term commit reconciled from the durable domain
  fact instead of creating another term;
- `PENDING`, `UNKNOWN`, mismatched, or cross-tenant evidence created no term.

Renewal preserved the separate business identities of checkout and
activation. It created a new successor row with `previousSubscriptionId` and
never extended, reopened, or changed the predecessor. Two concurrent renewal
activations produced one successor. The predecessor snapshot, lifecycle
state, window, allowance, and update timestamp remained unchanged.

Duplicate payment/webhook evidence therefore cannot create a second initial
or renewal term.

## 5. Exact one-time usage

Usage was proven with exact tenant, Client, subscription term, provider visit,
provider record, service, quantity, and source identity. The claim and its
ActionExecution binding committed together in a serializable transaction.

- two concurrent executions for the same visit/service converged to one row;
- replay/restart found the existing execution-bound claim;
- a second distinct exact claim consumed only its own quantity;
- the database capacity guard rejected an overspend even when attempted below
  the service layer;
- wrong term, service, Client, tenant, exhausted allowance, or unresolved
  identity failed closed;
- no provider write is part of usage synchronization.

## 6. Terminal lifecycle race

Expiry, cancellation, and revocation retained separate evidence and policy
contracts but shared the single terminal state boundary. Each mutation locked
the exact term and could write only from `active` to its own terminal state.

The proof executed all three classes independently and then raced all three
against one active term. Exactly one transition won. The other actions failed
closed and could not rewrite the terminal outcome. Retry/restart of the winner
returned the same execution-bound result. Revocation additionally required
the exact approved ActionExecution; forged actor/authority or missing approval
was rejected.

Pure PostgreSQL lifecycle mutations use deterministic commit/rollback. They do
not invent an external `UNKNOWN` state.

## 7. Scheduler envelope, policy, and blast radius

The scheduler is a non-value envelope and fan-out initiator, not a payment or
subscription execution owner. The accepted proof contract enforces:

- deterministic tenant and hourly policy-window batch identity;
- at most `25` exact terms per envelope;
- at most `50` aggregate planned usage units;
- unique per-term child identities;
- child ActionExecutions for exact usage or expiry mutations;
- partial completion restart/resume from the remaining child identities;
- no auto-renewal provider charge and no provider-payment ownership.

A duplicated or reordered candidate set creates no additional capacity. Work
outside the caps fails before child execution. Revocation remains separately
approval-bound; all other capabilities retain their server-derived policy and
actor requirements.

## 8. Atomicity and restart safety

The value-bearing transaction boundaries are deliberately local:

```text
initial/successor term + activationExecutionId       -> one serializable tx
usage claim + actionExecutionId + capacity check     -> one serializable tx
terminal status + endExecutionId                     -> one serializable tx
```

If the domain transaction rolls back, reconciliation proves no fact exists.
If it commits before Action Engine final-state acknowledgement, reconciliation
finds the exact tenant-qualified execution-bound fact and proves success. This
prevents blind mutation retry while keeping provider payment dispatch outside
any fictional local atomic transaction.

## 9. Tenant, unresolved identity, and cross-family safety

The proof used exact canonical `Client` plus active CRM link evidence. A
P02/P03-shaped active `UnresolvedClientIdentityHold` blocked checkout before
provider dispatch and blocked every value mutation. Cross-tenant Client and
term references failed closed. No fake user or membership was created for a
Client value owner; human terminal actions still required a separate exact
actor where the contract requires one.

The disposable database retained `0` `LoyaltyTransaction` rows throughout the
proof. P4-03 loyalty value and the P02/P03 continuity hold were not modified.

## 10. Legacy bypass ratchet readiness

The pre-cutover ratchet locks the accepted baseline of one production bypass
group and four direct-mutation subgroups in the Python legacy runtime:

1. checkout/provider intent creation;
2. payment-success activation/renewal mutation;
3. usage mutation;
4. terminal lifecycle mutation.

It explicitly distinguishes the isolated Action Engine executor from a
production route/module owner and proves that a synthetic direct subscription
writer still violates the rule. The post-cutover zero-bypass mode is prepared,
but production legacy owners were intentionally not disabled in this Gate.

## 11. Verification

| Check                                   | Result                                     |
| --------------------------------------- | ------------------------------------------ |
| Disposable PostgreSQL clean replay      | PASS — `64/64` migrations                  |
| ALL-8 executable matrix                 | PASS — `16/16` proof assertions            |
| Actions proven                          | PASS — `8/8`                               |
| Targeted P4-05 Jest set                 | PASS — `28/28` suites, `162/162` tests     |
| Legacy Python bridge regressions        | PASS — `16/16` tests                       |
| Shadow preservation                     | PASS — `8/8` remains non-executable        |
| Legacy bypass ratchet                   | PASS — 1 group / 4 subgroups locked        |
| Targeted ESLint                         | PASS                                       |
| Application TypeScript typecheck        | PASS                                       |
| Scripts TypeScript typecheck            | PASS                                       |
| Full suite/build                        | NOT RUN — outside this targeted proof Gate |
| Production payments                     | `0`                                        |
| Production subscription/value mutations | `0`                                        |
| Provider writes                         | `0`                                        |

No production database, production provider, browser, Chrome, Playwright, or
Computer Use surface was used. Production cutover was not performed.

## 12. Verdict

`P4-05 ALL-8 EXECUTABLE PROOF: PASS`

`ACTION CLASSES PROVEN: 8/8`

`PURCHASE→ACTIVATION CHAIN PROVEN: YES`

`RENEWAL→NEW TERM CHAIN PROVEN: YES`

`PREDECESSOR TERM IMMUTABLE: YES`

`ONE-TIME USAGE CLAIM ENFORCED: YES`

`TERMINAL RACE SAFE: YES`

`PENDING != UNKNOWN: ENFORCED`

`BLIND RETRY AFTER UNKNOWN: NO`

`PROVIDER RECONCILIATION PROVEN: YES`

`DUPLICATE PAYMENT/SUBSCRIPTION POSSIBLE: NO`

`TENANT ISOLATION: ENFORCED`

`P02/P03 HOLD FAIL-CLOSED: YES`

`SERVER-DERIVED POLICY/ENTITLEMENT/APPROVAL: ENFORCED`

`P4-03 LOYALTY STATE MUTATIONS: 0`

`A08 PAYMENT WRITE: DISABLED`

`LEGACY BYPASS RATCHET READY: YES`

`REAL PRODUCTION PAYMENT/VALUE MUTATIONS: 0`

`PROVIDER WRITES: 0`

`PRODUCTION CUTOVER: NO`

`READY FOR P4-05 PRODUCTION CUTOVER: YES`

`NEXT PACKAGE 4 FAMILY STARTED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

## 13. Permanent process hygiene

All verification commands were foreground and self-terminating. The existing
local PostgreSQL server was not started or owned by this task. Three disposable
proof databases were created during proof isolation, and all three were
removed before continuing.

`TEMP PROCESSES STARTED: 0`

`TEMP PROCESSES TERMINATED: 0`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES CREATED: 3`

`TEMP DATABASES REMOVED: 3`

`TEMP DATABASES REMAINING: 0`

STOP. Production cutover and the next Package 4 family were not started.
