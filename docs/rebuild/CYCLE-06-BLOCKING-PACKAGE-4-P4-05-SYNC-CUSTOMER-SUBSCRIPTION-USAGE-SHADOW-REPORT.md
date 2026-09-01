# CYCLE 06 BLOCKING PACKAGE 4 — P4-05 SYNC_CUSTOMER_SUBSCRIPTION_USAGE SHADOW REPORT

Status: fifth P4-05 canonical Shadow slice complete; no usage mutation or
executable cutover

Source checkpoint: `67c1cfd4`

Report date: 2026-09-01

## 1. Exact slice and boundary

This step implements only the approved non-executable Shadow for:

`sync_customer_subscription_usage`.

The first four subscription Shadow slices were not changed. The new path is:

`exact provider visit reference -> Canonical Action Ingress -> server-derived term/service/allowance evidence -> ActionExecution Shadow plan -> STOP BEFORE USAGE MUTATION`.

The disposable initiator submits only provider/company, exact provider Client,
subscription, and visit-record references. It cannot submit attendance,
service eligibility, quantity, remaining allowance, policy, entitlement,
approval, autonomy, executor, or mutation authority.

## 2. Server-derived evidence

Before planning, the canonical service derives and verifies:

- tenant from the server-bound provider/company integration;
- exact same-tenant, active, unmerged canonical Client;
- absence of an active `UnresolvedClientIdentityHold`, including P02/P03;
- exact same-tenant active `CustomerSubscription` owned by that Client;
- the one frozen offer whose price, currency, allowance,
  `serviceScopeHash`, and `planSnapshotHash` match the immutable term;
- a fresh read-only provider appointment for the supplied opaque record;
- exact provider Client equality and final `arrived` attendance;
- occurrence inside the immutable term window;
- one exact server-owned service-scope match and the frozen tier rule;
- an independently hashed provider record, visit observation, and service;
- prior immutable usage units and the DB-backed remaining allowance;
- absence of the subscription-qualified usage claim;
- server-owned policy profile, eligibility, and approval requirement.

Exact provider service names are mapped only by the fixed server catalog:
`Мужская стрижка` and `Моделирование бороды`. There is no fuzzy service match,
caller-supplied service id, or implicit quantity. One eligible attended visit
plans exactly one unit.

## 3. Deterministic identity and replay behavior

The claim identity binds:

`usage contract version + tenant + exact subscription term + provider + exact attended visit identity`.

The exact visit identity binds the tenant, provider, canonical provider Client,
opaque record reference, and occurrence time. The observation snapshot also
binds final attendance/status and sorted exact provider service evidence.

Retry, restart, scheduler/manual initiators, and concurrent planning therefore
converge on the same target and caller-idempotency key. An existing
`CustomerSubscriptionUsage` with the same subscription-qualified identity
returns `usage_already_claimed`; exhausted allowance returns
`entitlement_exhausted`. Neither path plans a second consumption.

## 4. Fail-closed semantics

No plan is created for:

- wrong tenant, Client, provider card, or unresolved identity hold;
- inactive, expired, canceled, or revoked subscription state;
- a changed/unprovable frozen plan or service scope;
- a visit outside the term;
- absent, non-final, non-arrived, or unreadable provider evidence;
- a service outside the frozen entitlement;
- a provider tier outside the frozen offer;
- an already claimed visit;
- exhausted allowance;
- caller-supplied quantity, service, attendance, remaining allowance, policy,
  approval, entitlement, autonomy, or executor fields.

Provider read failure occurs before any external dispatch or value mutation and
therefore fails closed without inventing `UNKNOWN`.

## 5. Action Engine and side-effect boundary

The registered capability is:

`customer-subscriptions.usage-sync.shadow.v1`.

It enforces:

- `actionClass = sync_customer_subscription_usage`;
- `policyDecision = SHADOW_ONLY`;
- `autonomyLevel = L2_5_SHADOW`;
- `executorKey = shadow.none`;
- approval `NONE`, derived by the server;
- one planning attempt;
- no executable retry or reconciliation redispatch.

The service calls only `ActionEngineRuntimeService.planShadow`. It performs no
`CustomerSubscriptionUsage` create, no subscription counter/entitlement
update, no payment change, no provider write, and no message. The legacy
subscription scheduler remains the actual owner during Shadow and was not
wired to the disposable bridge.

## 6. Targeted verification

All checks ran sequentially in low-load mode:

| Check | Result |
|---|---|
| New usage service, contract, and architecture suites | PASS — 3 suites / 13 tests |
| P4-05 purchase/activation/renewal/renewal-activation/usage plus registry and ingress regression set | PASS — 17 suites / 109 tests |
| Five P4-05 Python bridge unittest files | PASS — 10 tests |
| Targeted ESLint | PASS |
| Application TypeScript typecheck | PASS |
| `git diff --check` | PASS |

The tests cover exact planning, retry/restart, duplicate initiators,
concurrent planning, existing claims, allowance exhaustion, wrong service,
wrong term/window/Client/provider card, unresolved hold, provider failure,
missing attendance, and rejection of forged value/authority fields.

No full suite, build, browser, Playwright, provider write, production endpoint,
temporary database, usage claim, subscription mutation, payment, or customer
delivery was run. Provider evidence tests use isolated mocked reads;
production Shadow was not deployed.

## 7. Safety boundary

- No `CustomerSubscriptionUsage` was created.
- No subscription entitlement or term was changed.
- No BillingPayment or legacy subscription/payment row changed.
- No provider write or customer message occurred.
- The first four P4-05 Shadow slices were not changed.
- Expiry, cancellation, and revocation were not started.
- P4-02, P4-03, and P4-04 were not modified.
- A08 payment write remains disabled.
- P4-06, Package 5, and Chapter 7 were not started.

## 8. Verdict

`P4-05 SHADOW ACTION CLASS: sync_customer_subscription_usage`

`CANONICAL SHADOW WIRED: YES`

`SHADOW DIVERGENCES: 0`

`USAGE CLAIMS CREATED BY NEW PATH: 0`

`SUBSCRIPTION ENTITLEMENT MUTATIONS BY NEW PATH: 0`

`PROVIDER WRITES BY NEW PATH: 0`

`P4-05 ACTION CLASSES SHADOW-MIGRATED: 5/8`

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

STOP. The sixth P4-05 action class requires a separate explicit instruction.
