# CYCLE 06 BLOCKING PACKAGE 4 — P4-05 EXPIRE_CUSTOMER_SUBSCRIPTION SHADOW REPORT

Status: sixth P4-05 canonical Shadow slice complete; no terminal mutation or
executable cutover

Source checkpoint: `028a3948`

Report date: 2026-09-02

## 1. Exact slice and boundary

This step implements only the approved non-executable Shadow for:

`expire_customer_subscription`.

The first five subscription Shadow slices were not changed. The new path is:

`exact subscription reference -> Canonical Action Ingress -> server-derived immutable term/time/lifecycle evidence -> ActionExecution Shadow plan -> STOP BEFORE SUBSCRIPTION MUTATION`.

The disposable initiator submits only provider/company, exact provider Client,
and subscription references. It cannot submit current time, term end, status,
pending-renewal decision, policy, entitlement, approval, autonomy, executor, or
terminal mutation authority.

## 2. Server-derived lifecycle evidence

Before planning, the canonical service derives and verifies:

- tenant from the server-bound provider/company integration;
- exact same-tenant, active, unmerged canonical Client;
- absence of an active `UnresolvedClientIdentityHold`, including P02/P03;
- exact same-tenant `CustomerSubscription` owned by that Client;
- current lifecycle state `active` with no `endedAt` or `endExecutionId` claim;
- an internally consistent immutable term and activation boundary;
- trusted backend time strictly later than immutable `termEndsAt`;
- deterministic eligibility boundary `termEndsAt + 1ms`;
- intended terminal status `expired` and deterministic `endedAt = termEndsAt`;
- server-owned expiry policy and approval requirement `NONE`.

The current clock is used only as a server-side eligibility check. It is not
accepted from the caller and is not added to the logical identity, so retries
on a later scheduler tick cannot split one term expiry into new logical
actions.

## 3. Deterministic identity and one-time transition

The expiry identity binds:

`expiry contract version + tenant + exact subscription + term identity + immutable term end`.

Retry, restart, the daily scheduler, and startup reconciliation therefore
converge on the same target and caller-idempotency key. An existing terminal
status, `endedAt`, or `endExecutionId` fails closed as
`terminal_already_claimed`; no second terminal transition is planned.

The intended mutation changes only lifecycle status and terminal binding in a
future executable transaction. It explicitly records:

- immutable term fields are not rewritten;
- no renewal is created;
- no payment or provider state is changed;
- no usage claim is created or changed.

## 4. Pending renewal semantics

A pending renewal checkout is payment intent and creates no subscription
value. The approved Gate therefore does not let it keep an elapsed predecessor
term active. The normalized contract fixes:

`pendingRenewalBlocksExpiry = false`.

An activated successor remains a separate immutable term. Expiring the
predecessor neither creates nor mutates that successor.

## 5. Fail-closed semantics

No plan is created for:

- a term whose server-proven time window has not strictly elapsed;
- wrong tenant, subscription, Client, or provider identity;
- unresolved identity hold;
- expired, canceled, revoked, or otherwise already claimed terminal state;
- invalid term ordering or activation evidence;
- caller-supplied time, term end, lifecycle, pending-renewal decision, policy,
  approval, entitlement, autonomy, or executor fields.

Expiry has no provider dispatch. A local evidence failure is definitive before
mutation and does not invent `UNKNOWN` or reconciliation work.

## 6. Action Engine and side-effect boundary

The registered capability is:

`customer-subscriptions.expiry.shadow.v1`.

It enforces:

- `actionClass = expire_customer_subscription`;
- `policyDecision = SHADOW_ONLY`;
- `autonomyLevel = L2_5_SHADOW`;
- `executorKey = shadow.none`;
- approval `NONE`, derived by the server;
- one planning attempt;
- no executable retry or reconciliation redispatch.

The service calls only `ActionEngineRuntimeService.planShadow`. It performs no
subscription update, term rewrite, renewal create, payment/usage mutation,
provider write, or message. The legacy daily job remains the actual owner
during Shadow and was not wired to the disposable bridge.

## 7. Targeted verification

All checks ran sequentially in low-load mode:

| Check | Result |
|---|---|
| New expiry service, contract, and architecture suites | PASS — 3 suites / 14 tests |
| P4-05 six-Shadow regression set plus registry and ingress | PASS — 20 suites / 123 tests |
| Six P4-05 Python bridge unittest files | PASS — 12 tests |
| Targeted ESLint | PASS |
| Application TypeScript typecheck | PASS |
| `git diff --check` | PASS |

The tests cover genuinely elapsed and still-active terms, retry/restart,
duplicate scheduler calls, all terminal states and bindings, wrong
subscription/Client/term evidence, unresolved hold, pending renewal semantics,
and rejection of forged time/lifecycle/authority fields.

No full suite, build, browser, Playwright, provider write, production endpoint,
temporary database, expiry, renewal, payment, usage mutation, or customer
delivery was run. Production Shadow was not deployed.

## 8. Safety boundary

- No `CustomerSubscription` status or terminal binding was changed.
- No immutable term fact was rewritten.
- No renewal or payment was created.
- No `CustomerSubscriptionUsage` was created or changed.
- No provider write or customer message occurred.
- The first five P4-05 Shadow slices were not changed.
- Cancellation and revocation were not started.
- P4-02, P4-03, and P4-04 were not modified.
- A08 payment write remains disabled.
- P4-06, Package 5, and Chapter 7 were not started.

## 9. Verdict

`P4-05 SHADOW ACTION CLASS: expire_customer_subscription`

`CANONICAL SHADOW WIRED: YES`

`SHADOW DIVERGENCES: 0`

`SUBSCRIPTIONS EXPIRED BY NEW PATH: 0`

`TERM MUTATIONS BY NEW PATH: 0`

`PAYMENT/PROVIDER WRITES BY NEW PATH: 0`

`P4-05 ACTION CLASSES SHADOW-MIGRATED: 6/8`

`EXECUTABLE CUTOVER: NO`

`PRODUCTION SHADOW DEPLOYED: NO`

`NEXT P4-05 ACTION STARTED: NO`

## 10. Permanent process hygiene

All commands were foreground and self-terminating. No background process,
watcher, browser, Playwright process, or temporary database was started.

`TEMP PROCESSES STARTED: 0`

`TEMP PROCESSES TERMINATED: 0`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES REMAINING: 0`

STOP. The seventh P4-05 action class requires a separate explicit instruction.
