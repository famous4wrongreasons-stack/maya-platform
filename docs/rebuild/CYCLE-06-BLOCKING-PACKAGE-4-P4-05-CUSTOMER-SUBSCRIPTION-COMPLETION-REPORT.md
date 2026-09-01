# CYCLE 06 BLOCKING PACKAGE 4 — P4-05 CUSTOMER SUBSCRIPTION COMPLETION

Status: **COMPLETE — production cutover verified without payment/value smoke**

Accepted ALL-8 executable proof: `9730925e`

Cutover runtime commit: `0a89206a`

Production release: `20260902-c06-p4-p405-final-cutover-0a89206a`

Report date: 2026-09-02

## 1. Scope and boundary

P4-05 closes the eight approved customer-subscription action classes:

1. `initiate_customer_subscription_purchase`;
2. `activate_customer_subscription`;
3. `initiate_customer_subscription_renewal`;
4. `activate_customer_subscription_renewal`;
5. `sync_customer_subscription_usage`;
6. `expire_customer_subscription`;
7. `cancel_customer_subscription`;
8. `revoke_customer_subscription`.

The accepted Runtime Contract Gate, Shadow 8/8, and ALL-8 executable proof
were not redesigned or rerun. The cutover added only production executor and
provider wiring, fail-closed legacy ownership guards, the activated
architectural ratchet, deployment, and read-only production verification.

No real checkout, payment, activation, renewal, usage, terminal transition,
provider write, or customer message was created for this cutover. P4-06,
Package 5, and Chapter 7 were not started.

## 2. Final preflight

Before the active release changed, the following were established read-only:

- accepted checkpoint and remote branch matched at `9730925e`;
- production health/readiness: `200 / 200`;
- pending migrations: `0`;
- schema drift: `NONE`;
- canonical P4-03 ledger: `121` rows / `64581` points;
- client-owned loyalty accounts: `23` / aggregate balance `64581`;
- P4-04 referral/issuance/reward/fulfillment rows: `0 / 0 / 0 / 0`;
- active P02/P03 identity hold: `1` group / `2` principals;
- canonical P4-05 subscriptions/usages: `0 / 0`;
- legacy subscription source: `7` historical rows, all `refunded`, with no
  active or pending payment/value row;
- legacy `barbershop-bot`: inactive and disabled;
- required YooKassa and Action Engine key material: present, with values never
  printed or copied.

The P4-05 targeted matrix passed `29/29` suites and `166/166` assertions. The
P4-03/P4-04/identity-hold cross-family ratchets then passed `3/3` suites and
`16/16` assertions. A narrow ratchet update classifies the physically
disposable P4-05 PostgreSQL proof as test-only only when both its exact
database-prefix guard and refusal marker are present; synthetic production
registration owners remain rejected.

## 3. Canonical production owner

`CustomerSubscriptionsModule` now registers and exports
`P405CustomerSubscriptionExecutableService`. All eight capabilities and the
bounded scheduler envelope execute only through
`ActionEngineRuntimeService.executeWithReceipt`.

No caller-authoritative raw P4-05 executable controller was added. The eight
existing Shadow controllers remain non-executable planners.

The active provider adapter preserves the accepted payment contract:

- checkout requests use the ActionExecution transport identity as the sole
  YooKassa idempotence key;
- provider ambiguity reconciles only by the same key and byte-equivalent
  request; no new key or blind redispatch exists;
- an inconclusive reconciliation remains `UNKNOWN`;
- known `pending`/`waiting_for_capture` remains `PENDING`, not `UNKNOWN`;
- provider payment references are encrypted and separately HMAC-bound before
  later activation evidence reads;
- authoritative payment GET must prove `succeeded`, paid, exact amount,
  currency, tenant, Client, checkout, and immutable plan facts before any term
  can be created;
- the safe checkout result can return the provider presentation URL without
  making it activation evidence.

Provider payment is never treated as locally atomic. Initial/new-term
creation, usage claims, and terminal transitions retain their proven local
PostgreSQL transaction boundaries.

## 4. Legacy ownership removal

The repository legacy entry points now fail closed before each former direct
mutation:

- checkout creation and provider correlation;
- successful-payment activation;
- usage consumption;
- terminal lifecycle mutation.

The activated ratchet reports all four direct-mutation subgroups as zero and
still detects a synthetic direct usage owner when its accepted guard is
removed. Python source can remain an initiator only after a future trusted
canonical bridge is supplied; it has no mutating fallback. In production the
legacy Python service remains disabled and inactive, so none of its old code
is production-reachable.

No recurring scheduler owns provider dispatch. The legacy subscription
scheduler remains disabled rather than falling back; the canonical bounded
envelope is the only approved fan-out contract.

## 5. Mandatory deployment gate

The standard production deployment mechanism ran sequentially and passed:

| Gate | Result |
|---|---|
| Prisma validate | PASS |
| ESLint | PASS |
| Application typecheck | PASS |
| Scripts typecheck | PASS |
| Full backend suite | PASS — `263/263` suites, `2266/2266` tests |
| Nest build and build preflight | PASS |
| Server release preflight | PASS |
| Pending migration check | PASS — `0` |
| Strict post-migration preflight | PASS |
| Fresh Prisma Client generation | PASS |
| Isolated-port readiness smoke | PASS |
| Atomic release switch | PASS |

The isolated smoke PID was terminated, waited, reaped, verified dead, and its
temporary log removed before the release switch completed.

## 6. Read-only production verification

| Check | Result |
|---|---|
| Active release | `20260902-c06-p4-p405-final-cutover-0a89206a` |
| Service health/readiness | PASS — `200 / 200` |
| Service errors/warnings since cutover | `0 / 0` |
| Service restart count | `0` |
| Pending migrations | `0` |
| Post-deploy schema drift | `NONE` |
| Canonical P4-05 executor wired | YES |
| Same-key provider reconciliation wired | YES |
| Production direct-mutation subgroups | `0` |
| Legacy bot active/enabled | `NO / NO` |
| Canonical subscriptions/usages | unchanged — `0 / 0` |
| P4-03 ledger | unchanged — `121 / 64581` |
| P4-03 client accounts | unchanged — `23 / 64581` |
| P4-04 business rows | unchanged — `0 / 0 / 0 / 0` |
| P02/P03 hold | unchanged — `1 / 2` |
| Real payment/value mutations | `0` |
| Provider writes | `0` |

## 7. Completion verdict

`P4-05 COMPLETE: YES`

`SUBSCRIPTION ACTION CLASSES CUTOVER: 8/8`

`PRODUCTION EXECUTION OWNER: ACTION ENGINE`

`PRODUCTION DIRECT MUTATION SUBGROUPS: 0`

`LEGACY MUTATING OWNER ACTIVE: NO`

`LEGACY FALLBACK: NO`

`PURCHASE→ACTIVATION CHAIN: ENFORCED`

`RENEWAL→NEW TERM CHAIN: ENFORCED`

`PREDECESSOR TERM IMMUTABLE: YES`

`ONE-TIME USAGE CLAIM: ENFORCED`

`TERMINAL RACE SAFE: YES`

`PENDING != UNKNOWN: ENFORCED`

`BLIND RETRY AFTER UNKNOWN: NO`

`PROVIDER RECONCILIATION: ENFORCED`

`DUPLICATE PAYMENT/SUBSCRIPTION POSSIBLE: NO`

`P4-03 CANONICAL LOYALTY PRESERVED: YES`

`P4-04 REFERRAL/REWARD PRESERVED: YES`

`P02/P03 HOLD PRESERVED: YES`

`REAL PRODUCTION PAYMENT/VALUE MUTATIONS FOR CUTOVER PROOF: 0`

`PROVIDER WRITES FOR CUTOVER PROOF: 0`

`NEXT PACKAGE 4 FAMILY STARTED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

## 8. Permanent process hygiene

All local verification commands were foreground and self-terminating. The
only background process was the deployment script's owned remote smoke; its
PID lifecycle was fully closed. No browser, Playwright, watcher, or temporary
database was started.

`TEMP PROCESSES STARTED: 1`

`TEMP PROCESSES TERMINATED: 1`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES REMAINING: 0`

STOP. P4-06 was not started.
