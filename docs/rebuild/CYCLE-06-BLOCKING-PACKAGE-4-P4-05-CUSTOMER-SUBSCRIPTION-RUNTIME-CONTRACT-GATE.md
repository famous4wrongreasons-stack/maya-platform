# CYCLE 06 BLOCKING PACKAGE 4 — P4-05 CUSTOMER SUBSCRIPTION RUNTIME CONTRACT GATE

Status: **COMPLETE — contract only; runtime not started**

Source checkpoint: `c194abcc`

Gate date: 2026-09-01

## 1. Scope And Boundary

This Gate defines the runtime contract for `P4-05 / A20-S — Customer
Subscription Value Convergence`. It uses the accepted Package 4 remainder
review, the applied `CustomerSubscription` / `CustomerSubscriptionUsage`
foundation, the legacy SQLite and PostgreSQL implementations, and the actual
Telegram, PWA, poller, and scheduler entry points.

This step does not register an Action Engine capability, add an executor,
change Python or Nest runtime, create a migration, deploy, query or mutate
production, call YooKassa or YClients, create a checkout, activate or end a
term, consume allowance, or deliver a customer message. P4-02 through P4-04
remain immutable completion baselines. A08 remains disabled.

The current production-reachable family still has one broad bypass group and
four normalized direct-mutation subgroups:

1. checkout creation and provider-payment correlation;
2. payment-success activation and renewal value grant;
3. usage synchronization/consumption;
4. terminal lifecycle mutation.

`P4-05 GATE-LEVEL PRODUCTION BYPASS GROUPS: 1`

`P4-05 CONCRETE DIRECT-MUTATION SUBGROUPS: 4`

## 2. Current Production Owners

| Mutation boundary              | Current initiator/owner                                                                                       | Direct effect                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Initial or renewal checkout    | Telegram `_start_subscription_purchase` and PWA `sub_create_handler`, then `yukassa_api.create_payment`       | Creates a legacy `pending_payment` row, dispatches YooKassa payment creation, and attaches `yukassa_payment_id` |
| Payment outcome and activation | Bot startup poller, `_poll_subscription_payment`, `_activate_paid_subscription`, and legacy database adapters | Polls YooKassa and changes the legacy row to `active` or `refunded`                                             |
| Usage                          | Daily/manual subscription job and `sync_subscription_usage`                                                   | Reads YClients bookings and overwrites `visits_used`                                                            |
| Terminal lifecycle             | Daily/manual subscription job and `update_subscription_status`                                                | Changes an active legacy row to `expired`; the storage function can also write other terminal labels            |

`ai администратор/database.py` and
`ai администратор/saas_blueprint/pg/db_pg_full.py` contain equivalent direct
storage writers. The PostgreSQL blueprint adds tenant qualification and RLS,
but it remains a legacy execution owner: tenant isolation alone does not
provide ActionExecution ownership, immutable usage claims, or provider
dispatch certainty.

There is currently no P4-05 action class in the Action Engine registry and no
runtime writer for canonical `CustomerSubscription` or
`CustomerSubscriptionUsage`.

After eventual cutover, Telegram, PWA, provider webhooks/pollers, and the daily
scheduler may remain initiators or evidence sources only. They may not call a
provider or mutate subscription value outside Canonical Action Ingress and the
Action Engine, and they may not fall back to the legacy writers.

## 3. Exact Action Classes

The family contains **eight** action classes. The count follows distinct
business identities and policy boundaries rather than the four legacy code
groups.

| Order | Action class                              | Capability boundary                                                                                                      | External dispatch                                        |
| ----: | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
|     1 | `initiate_customer_subscription_purchase` | Create one initial-term provider checkout from an explicit authenticated customer intent; grants no subscription value   | YooKassa payment create                                  |
|     2 | `activate_customer_subscription`          | On authoritative payment success, atomically create exactly one initial active term                                      | None; provider evidence is read/verified before mutation |
|     3 | `initiate_customer_subscription_renewal`  | Create one successor-term provider checkout bound to one exact predecessor and explicit customer intent; grants no value | YooKassa payment create                                  |
|     4 | `activate_customer_subscription_renewal`  | On authoritative payment success, atomically create exactly one new successor term                                       | None; provider evidence is read/verified before mutation |
|     5 | `sync_customer_subscription_usage`        | Convert one exact provider observation for one term into zero or more immutable visit claims                             | Provider read only; no provider write                    |
|     6 | `expire_customer_subscription`            | End one active term because its immutable time window elapsed                                                            | None                                                     |
|     7 | `cancel_customer_subscription`            | End one active term from an authorized customer/staff cancellation decision                                              | None; any money refund is a different gated action       |
|     8 | `revoke_customer_subscription`            | End one active term from an approved owner/policy revocation decision                                                    | None                                                     |

Initial purchase is not renewal: renewal must name one exact predecessor and
can produce only its one canonical successor. Expiry, cancellation, and
revocation share the one-time terminal row transition but remain distinct
action classes because their evidence, actor authority, and approval policies
differ.

### 3.1 Why checkout and activation are separate capabilities

`purchase -> provider checkout -> customer payment -> activation` is **not**
one long-lived ActionExecution. A successfully created checkout can remain
authoritatively `pending` for minutes; that known provider state is neither an
execution failure nor an ambiguous `UNKNOWN` outcome. The current kernel has
no need to mislabel it when the boundary is split honestly:

1. the checkout capability succeeds when the exact provider checkout is known
   to exist and returns its safe presentation result;
2. it becomes `UNKNOWN` only if payment creation may have crossed the external
   dispatch boundary without a conclusive response;
3. a later provider webhook/poller is only an evidence initiator;
4. the activation capability starts only from authoritative `succeeded`
   evidence and creates the value-bearing term in one PostgreSQL transaction.

Renewal uses the same two-phase shape but separate action classes and a
predecessor-bound identity. A canceled/expired provider checkout creates no
canonical subscription term and is not a terminal mutation of one.

## 4. Canonical Identities And Frozen Facts

All normalized inputs are built server-side. Caller-supplied tenant, Client,
plan, price, currency, allowance, service scope, provider status, payment
reference, entitlement, approval, autonomy, executor, or cap is never
authority.

### 4.1 Shared identities

- **Tenant:** authenticated tenant context.
- **Value owner:** exact canonical `Client` in the same tenant, resolved through
  Chapter 2 identity. A provider identity under an active
  `UnresolvedClientIdentityHold`, including P02/P03, fails closed with
  `client_identity_unresolved` before checkout dispatch or value mutation.
- **Plan:** server-owned plan code plus immutable plan snapshot hash.
- **Service scope:** exact canonical/provider service identities and tier rules
  in the activation execution's retained normalized contract; the term stores
  their immutable `serviceScopeHash`.
- **Price/currency:** server catalog amount in kopecks and ISO currency,
  snapshot-bound before provider dispatch and reverified before activation.
- **Allowance:** immutable positive unit count from the same plan snapshot.
- **Term:** deterministic `termIdentityHash`, one activation execution, one
  Client, one immutable window, and optional exact predecessor.

The normalized activation contract that owns the exact service-scope snapshot
must remain retained at least through the term, reconciliation, and audit
window. `planSnapshotHash` and `serviceScopeHash` prove that later usage uses
that frozen version rather than the current mutable catalog.

### 4.2 Deterministic logical identities

| Action class                              | Server-derived logical identity                                                                                                               |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `initiate_customer_subscription_purchase` | tenant + Client + initial-purchase intent reference + plan snapshot hash + price + currency + allowance + checkout-contract version           |
| `activate_customer_subscription`          | tenant + checkout execution + provider + provider-payment-reference hash + exact paid outcome + initial-term contract version                 |
| `initiate_customer_subscription_renewal`  | tenant + Client + predecessor term + renewal intent reference + plan snapshot hash + price + currency + allowance + checkout-contract version |
| `activate_customer_subscription_renewal`  | tenant + predecessor term + checkout execution + provider + provider-payment-reference hash + exact paid outcome + renewal-contract version   |
| `sync_customer_subscription_usage`        | tenant + subscription term + provider observation boundary/snapshot + usage-policy version                                                    |
| `expire_customer_subscription`            | tenant + subscription term + immutable term end + expiry-policy version                                                                       |
| `cancel_customer_subscription`            | tenant + subscription term + server-issued cancellation intent reference + actor identity + cancellation-policy version                       |
| `revoke_customer_subscription`            | tenant + subscription term + server-issued revocation decision reference + approval binding + revocation-policy version                       |

Telegram update identity or an HTTP idempotency token may seed an intent
reference, but Canonical Ingress scopes and hashes it; it is not plan, price,
payment, or approval authority. A restart or a second initiator carrying the
same logical intent converges on the same execution. A genuinely new customer
attempt receives a new intent reference and can start only if existing
open/active-term policy allows it.

Provider idempotence keys derive from the claimed checkout execution and never
from a mutable legacy row id. Activation computes the term window only after
authoritative payment success:

- initial term start = authoritative payment-success time;
- renewal term start = the later of predecessor end and authoritative
  payment-success time;
- term end = term start plus the versioned server-owned duration.

Renewal creates a new row with `previousSubscriptionId`; it never extends,
rewrites, reopens, or changes the predecessor.

## 5. Provider Payment, UNKNOWN, And Reconciliation

Only the two checkout initiation actions cross an external write boundary.
Before dispatch, the ActionAttempt persists the exact provider request
identity hash and the execution's transport idempotency key.

| Observation                                              | Canonical result                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Validation/provider failure proven before dispatch       | `NOT_EXECUTED` or retryable pre-dispatch failure under the same execution       |
| Provider returns payment id and known `pending` checkout | Checkout execution `SUCCEEDED`; no `CustomerSubscription` exists                |
| Timeout/connection loss after dispatch may have crossed  | Attempt and execution `UNKNOWN`, reconciliation required, no new-key redispatch |
| Provider proves the original request did not execute     | Only the same execution may retry under the existing policy and identity        |
| Provider returns `canceled`/`expired` before payment     | Checkout outcome is terminal without value; no canonical term is created        |
| Provider returns authoritative `succeeded`               | Evidence may initiate the matching activation action                            |

Reconciliation uses, in order:

1. the encrypted/hash-bound provider payment reference returned by the
   original attempt, when present;
2. the original YooKassa idempotence/request identity and byte-equivalent
   normalized request, never a new idempotence key;
3. authoritative provider GET/status evidence for amount, currency, status,
   metadata correlation, and payment identity;
4. manual review if the provider cannot distinguish applied from not applied.

An exact same-key provider operation may be used only as the provider's
documented idempotent reconciliation mechanism under the original execution;
it is not a blind new dispatch. If the outcome remains inconclusive, the
execution stays `UNKNOWN`/manual-required. `UNKNOWN` never becomes `FAILED`
merely because a poll deadline elapsed.

Activation rejects webhook or initiator claims such as `paid=true`. The
executor independently verifies the provider record, tenant-scoped checkout
execution, amount, currency, immutable plan facts, Client, mode
(initial/renewal), and predecessor. The unique provider-payment hash and unique
activation execution then make payment-to-term application one-time.

Provider status reads, YClients reads, and local PostgreSQL operations do not
invent `UNKNOWN`: a read failure before mutation fails closed, and a local
transaction has a deterministic commit or rollback result.

`PROVIDER UNKNOWN/RECONCILIATION CONTRACT: COMPLETE`

## 6. One-Time Activation And Renewal

Initial activation is one transaction that creates exactly one
`CustomerSubscription` with the exact `activationExecutionId`, provider
payment hash, frozen plan/value/scope facts, Client, and term window. A crash
before commit creates no term; a crash after commit converges through the
unique activation execution, provider payment identity, and term identity.

Renewal performs the same atomic create but additionally requires:

- one exact same-tenant predecessor;
- the same Client as the predecessor;
- a later non-overlapping term start;
- no existing child renewal for that predecessor;
- no mutation of predecessor plan, allowance, status, dates, or execution
  bindings.

The database's tenant-qualified FKs, unique activation execution, unique
provider payment identity, unique term identity, unique predecessor claim,
renewal guard, and immutable-facts trigger are sufficient DB claims.

`ONE-TIME ACTIVATION CONTRACT: COMPLETE`

`RENEWAL MUTATES PRIOR TERM: NO`

## 7. Usage Claim Contract

The scheduler does not overwrite a counter. For one exact term it reads
authoritative YClients history and plans zero or more immutable
`CustomerSubscriptionUsage` claims. One sync execution may own several claims,
but each claim is independently identified by:

`tenant + subscription term + provider + exact attended visit/record + usage-contract version`.

The exact target evidence also binds the canonical Client, provider Client,
record/visit identity, occurrence time, qualifying service identity, final
attendance state, and the frozen service-scope predicate. One business visit
consumes the plan-defined units once; multiple matching services in that visit
do not silently create duplicate claims unless the frozen plan explicitly
defines separate units.

Before inserting claims, the executor verifies:

- the term and Client are same-tenant and not unresolved;
- the term is active and the visit occurred within its immutable window;
- the service/tier satisfies the frozen scope rather than the current catalog;
- the provider observation is exact, final, and belongs to the same Client;
- proposed units do not exceed remaining immutable allowance.

The unique subscription-qualified usage identity rejects replay from another
execution. The capacity trigger locks the parent term and rejects concurrent
overspend. Claims and established execution bindings are immutable.

Provider read failure creates no claim. Re-observing the same visit after
restart converges on the existing claim; newly discovered visits under a new
observation boundary receive new claims without altering old ones.

`USAGE CLAIM CONTRACT: COMPLETE`

## 8. Terminal Lifecycle

All terminal actions require an active exact term and atomically set one of
`expired`, `canceled`, or `revoked` with `endedAt` and the same action's
`endExecutionId`. After that transition the status, terminal timestamp, and
binding are immutable; a competing terminal action loses the DB claim and
cannot reinterpret the term.

- **Expiry:** scheduler/system evidence that server time is strictly beyond
  the immutable term end; no caller date is trusted and no approval is needed.
- **Cancellation:** exact authenticated requester/staff authority and a
  server-issued cancellation intent; this action ends access only. A payment
  refund or provider write is outside P4-05 and requires its own approved
  financial action.
- **Revocation:** exact tenant-owner/admin authority, reason/evidence, and
  approval bound to this term and transition. It is never inferred from a
  payment or communication failure.

A provider checkout canceled before activation is a checkout outcome, not
`cancel_customer_subscription`, because no canonical value term exists.

`TERMINAL LIFECYCLE CONTRACT: COMPLETE`

## 9. Scheduler, Policy, Approval, And Blast Radius

P4-05 does not authorize automatic recurring card charges. The accepted
legacy product explicitly renews through a new customer-approved invoice.
Any future automatic recurring payment belongs to a separate provider-charge
contract and cannot be smuggled into the daily subscription job.

The daily job becomes a non-value tenant-scoped envelope that performs bounded
fan-out into independent per-term `sync_customer_subscription_usage` and
`expire_customer_subscription` executions. The envelope binds tenant, policy
version/window, sorted exact term/candidate hashes, candidate count, planned
claim count, and aggregate units. Existing ActionExecution normalized input,
policy/approval attestation, source reference, and per-term child executions
are sufficient; no batch table is required.

The initial executable profile is constrained as follows:

- one checkout action can create at most one payment for one Client, one plan,
  and one exact price/currency snapshot;
- one activation action can create at most one term;
- one usage child targets one term, and its maximum aggregate units are the
  term's DB-locked remaining allowance;
- scheduler fan-out is capped at 25 terms per tenant/envelope; larger sets are
  resumed as separate deterministic envelopes rather than one transaction;
- each child has its own DB claim, transaction, restart state, and outcome;
- expiry and exact usage need no owner approval within these deterministic
  bounds; manual backfill, changed evidence, or any proposed action outside
  the cap fails closed pending a separately approved policy;
- `revoke_customer_subscription` always requires exact owner approval;
- customer purchase/renewal requires authenticated explicit intent and an
  active server-owned offer, but not a caller-provided approval flag;
- L2.5 may plan every class but can dispatch no provider request and mutate no
  subscription value.

No scheduler tick spans tenants or creates one transaction across terms. A
child's logical identity is independent of which envelope discovered it, so
moving it to a restart batch cannot reapply the mutation.

## 10. Legacy Continuity Contract

The legacy `subscriptions` table mixes pending checkout and activated term
state. Canonical migration must classify rows rather than copy that shape:

- paid `active`/`expired` rows may become canonical terms only after exact
  tenant, Client, plan snapshot, provider payment, time window, and value
  correlation;
- correlated historical terms use a non-empty tenant-qualified
  `legacySourceRef` and may retain null execution bindings;
- no historical `ActionExecution` is invented;
- legacy `pending_payment`/`refunded` rows are not subscription value and are
  not imported as active terms;
- every live pending provider payment must be reconciled or explicitly held
  before legacy writer freeze/cutover;
- the mutable legacy `visits_used` counter is not itself an exact usage claim;
  historical usage is imported only from exact visit/source evidence with
  `legacySourceRef`, otherwise the row is a continuity finding that blocks
  destructive cutover rather than fabricated history.

This Gate authorizes neither a data inventory nor migration. A separate
read-only continuity/dry-run step is mandatory before production cutover.

## 11. Communication Boundary

Checkout presentation and renewal offers are communication effects, not
subscription value. After a canonical checkout or value transition commits,
the initiator may request already-canonical Package 2 delivery with a distinct
communication identity.

- message failure cannot roll back or duplicate checkout, activation,
  renewal, usage, or terminal state;
- message success cannot be evidence of payment or activation;
- renewal reminders never create a renewal execution until an authenticated
  customer expresses a new purchase intent;
- Telegram/PWA delivery must not call a legacy value writer as fallback.

`COMMUNICATION BOUNDARY PRESERVED: YES`

## 12. Schema Verdict

The applied schema can honestly represent every required durable fact:

- `ActionExecution` / `ActionAttempt` provide canonical identity, DB claim,
  policy/approval, transport idempotency, provider request/reference evidence,
  `UNKNOWN`, reconciliation, and restart state for checkout operations;
- `CustomerSubscription` provides one activated term, frozen plan/value/scope,
  provider-payment correlation, activation binding, predecessor renewal,
  terminal binding, and historical provenance;
- `CustomerSubscriptionUsage` provides one execution to many immutable exact
  usage claims with duplicate, term-window, and allowance guards;
- `UnresolvedClientIdentityHold` and the canonical Client path provide the
  fail-closed identity boundary;
- a scheduler envelope is representable in existing ActionExecution contracts
  and does not require a generic workflow or batch table.

The term need not store a pending checkout state. The checkout execution and
attempt are the durable pending/provider object; a `CustomerSubscription` row
exists only after authoritative paid activation. The provider payment hash on
the term plus activation evidence preserves their exact correlation.

No indispensable fact requires a new column, table, trigger, or migration.

`CANONICAL SCHEMA SUFFICIENT: YES`

`ADDITIONAL SCHEMA REQUIRED: NO`

## 13. Required Shadow Sequence

Shadow is required because the family contains a real payment-provider write
and multiple legacy execution owners. Each Shadow must stop before provider or
value mutation. The approved order for later separately authorized steps is:

1. `initiate_customer_subscription_purchase`;
2. `activate_customer_subscription`;
3. `initiate_customer_subscription_renewal`;
4. `activate_customer_subscription_renewal`;
5. `sync_customer_subscription_usage`;
6. `expire_customer_subscription`;
7. `cancel_customer_subscription`;
8. `revoke_customer_subscription`.

Provider checkout Shadows derive the exact request and reconciliation identity
but do not call YooKassa. Activation Shadows verify fixture/read-only evidence
and stop before term creation. Usage and terminal Shadows stop before claims or
status transitions. No production checkout or customer value proof is needed.

## 14. Gate Verdict

`P4-05 RUNTIME CONTRACT GATE COMPLETE: YES`

`P4-05 EXACT ACTION CLASSES: 8 / initiate_customer_subscription_purchase, activate_customer_subscription, initiate_customer_subscription_renewal, activate_customer_subscription_renewal, sync_customer_subscription_usage, expire_customer_subscription, cancel_customer_subscription, revoke_customer_subscription`

`P4-05 PRODUCTION BYPASS GROUPS: 1`

`P4-05 DIRECT-MUTATION SUBGROUPS: 4`

`CANONICAL SCHEMA SUFFICIENT: YES`

`ADDITIONAL SCHEMA REQUIRED: NO`

`PROVIDER UNKNOWN/RECONCILIATION CONTRACT: COMPLETE`

`ONE-TIME ACTIVATION CONTRACT: COMPLETE`

`RENEWAL MUTATES PRIOR TERM: NO`

`USAGE CLAIM CONTRACT: COMPLETE`

`TERMINAL LIFECYCLE CONTRACT: COMPLETE`

`COMMUNICATION BOUNDARY PRESERVED: YES`

`P4-05 SHADOW REQUIRED: YES`

`P4-05 SHADOW CAN START: YES`

`PRODUCTION PAYMENTS: 0`

`PRODUCTION VALUE MUTATIONS: 0`

`PROVIDER WRITES: 0`

`P4-05 RUNTIME STARTED: NO`

`P4-06 STARTED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP. No Shadow, runtime implementation, migration, build/deploy, production
cutover, or next Package 4 family was started by this Gate.
