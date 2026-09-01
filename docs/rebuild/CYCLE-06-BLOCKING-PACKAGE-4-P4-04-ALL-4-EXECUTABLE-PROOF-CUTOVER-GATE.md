# CYCLE 06 BLOCKING PACKAGE 4 — P4-04 ALL-4 EXECUTABLE PROOF / CUTOVER GATE

Status: **FAIL — contract-to-value preconditions are incomplete; production cutover forbidden**
Source checkpoint: `03036ecd`
Report date: 2026-09-01

## 1. Scope and preserved Shadow baseline

All four accepted P4-04 Shadow slices remain complete and unchanged:

1. `create_customer_referral`;
2. `resolve_customer_referral`;
3. `issue_referral_rewards`;
4. `fulfill_referral_reward`.

This Gate did not register an executable capability, connect a production
initiator, alter a Shadow contract, disable a legacy owner, deploy code, or
perform a referral/reward/loyalty/provider mutation. P4-02 and immutable P4-03
were not modified. Package 5 and Chapter 7 were not started.

Static preflight stopped the executable PostgreSQL mutation matrix before any
disposable or production value write. The current contracts do not define the
last part of the requested chain:

`ReferralReward -> ReferralRewardFulfillment -> LoyaltyTransaction -> LoyaltyAccount.balance`.

Running that matrix now would require choosing new value units, application
semantics, target evidence, bearer recovery, and batch policy inside the proof
harness. That would be implementation by invention rather than proof of the
accepted P4-04 contract.

## 2. Blocking findings

### G1 — referral reward and loyalty ledger use different value units

The accepted issue Shadow fixes:

```text
rewardRepresentation = fixed_money_kopecks
ReferralReward.amountKopecks + currency
```

The schema also permits `percentBasisPoints`, matching the legacy 15% discount
semantics. By contrast, the canonical `LoyaltyAccount.balance` and
`LoyaltyTransaction.delta` are loyalty **points**. Neither schema nor the
accepted P4-04 contract defines:

- whether fulfillment grants points, spends points, or applies a monetary
  discount outside the loyalty ledger;
- a kopeck/percentage-to-points conversion and its immutable policy snapshot;
- the sign and exact ledger `kind` of the requested mutation;
- whether value is created at issuance or only applied at fulfillment;
- how a partial monetary application would be represented.

The final Shadow explicitly and correctly stops at
`valueApplication = REFERRAL_REWARD_CLAIM_ONLY`. Treating `1 kopeck = 1 point`,
or converting a percentage without an exact purchase amount, would silently
change the business contract. Therefore fulfillment/ledger/balance atomicity
cannot be honestly proved yet.

### G2 — exact reward-application target is absent

The accepted Runtime Contract Gate says executable fulfillment requires its
authenticated actor, exact purchase/visit/service target, and claim evidence.
The final Shadow proves actor and bearer evidence, but its DTO, normalized
input, target identity, and durable fulfillment fact contain no purchase,
visit, service, payment, or application identity.

Consequences:

- a valid bearer can identify one reward, but not the business event on which
  the reward is being applied;
- changed visit/service/payment evidence cannot be detected;
- duplicate application to two purchases cannot be distinguished from a
  retry of one purchase solely from the current normalized contract;
- reconciliation cannot compare one exact application target with one exact
  fulfillment/ledger fact.

The amended contract must decide whether an immutable target can be bound
durably through `ActionExecution` plus existing domain rows or whether
`ReferralRewardFulfillment` needs a minimal target/reference field. No schema
choice is made by this Gate.

### G3 — issue has lookup vocabulary but no crash-safe claim output contract

The final Shadow centralized `referralRewardClaimLookup`, so fulfillment can
HMAC a presented bearer and query `(tenantId, codeHash)`. However the issue
Shadow deliberately creates neither:

- a random claim artifact returned to the real initiator;
- the corresponding `codeHash` on a durable `ReferralReward`;
- a deterministic or durable way to re-present the same artifact after a
  commit/response-loss boundary.

The approved Runtime Contract Gate explicitly requires crash-safe presentation
or re-presentation without plaintext bearer persistence. The executable proof
cannot select between an immediate one-shot response, deterministic
server-secret derivation, or a protected delivery/outbox contract without a
separate decision. Reward id, referral id, or execution id remains forbidden
as a substitute bearer credential.

### G4 — per-issuance caps do not bound scheduler fan-out

The accepted issuance profile does prove:

- at most two recipients per referral;
- at most `50,000` kopecks per reward;
- at most `100,000` kopecks per issuance;
- owner approval above the `1`-kopeck threshold.

It does not define the executable resolver/scheduler envelope:

- maximum referrals resolved per run;
- maximum aggregate potential issuance value per run;
- policy window and audience identity;
- approval scope/TTL for the exact bounded batch;
- per-referral child execution fan-out contract.

Thus one issuance is bounded, but one scheduler tick is not yet proven to be a
bounded tenant-scoped set of independent child executions. The requested
caps/approval/blast-radius proof cannot pass for the family as a whole.

## 3. What the existing foundation still proves

These blockers do not invalidate the schema foundation or four Shadow slices:

- referral creation and resolution have separate immutable 1:1 execution
  bindings;
- one qualified referral can have at most one issuance;
- one issuance has at most one immutable reward per slot;
- `(tenantId, codeHash)` is the exact claim lookup;
- one reward can have at most one tenant-qualified fulfillment;
- one fulfillment can bind to one exact `ActionExecution` and cannot be
  silently moved or cleared;
- a future local executor can place fulfillment, an execution-bound ledger
  row, and balance update in one serializable PostgreSQL transaction once the
  value/target contract is accepted;
- P02/P03 unresolved Client identity remains fail-closed through the existing
  canonical hold guard;
- provider writes remain unauthorized and `UNKNOWN` is not invented for a
  local-only transaction.

The DB one-time claim prevents two fulfillment rows for one reward. It does not
by itself define or prove the missing reward-to-loyalty value mutation.

## 4. Schema and contract decision required

An amended P4-04 Contract/Schema Gate must decide only:

1. the canonical value domain:
   - monetary/percentage discount applied to an exact payment, or
   - loyalty points with an immutable point amount/conversion snapshot;
2. the exact application target and its durable identity;
3. issue output, stored lookup, response-loss, and re-presentation semantics;
4. the bounded scheduler envelope, aggregate cap, policy window, and approval
   binding.

If the accepted value remains monetary/percentage, the loyalty points ledger
must not be used merely to satisfy a test shape. If the accepted value becomes
points, the Gate must determine whether current fields are sufficient or a
minimal immutable points fact is required. No field or migration is added in
this step.

`ADDITIONAL CONTRACT GATE REQUIRED: YES`

`ADDITIONAL SCHEMA DECISION REQUIRED: YES`

`ADDITIONAL MIGRATION AUTHORIZED: NO`

## 5. Verification performed

Verification intentionally stopped before executable PostgreSQL writes because
the preconditions above are red.

| Check | Result |
|---|---|
| Four completed Shadow capability/contracts | PASS — preserved `4/4` |
| Reward value unit -> loyalty ledger unit | FAIL — no accepted mapping |
| Exact purchase/visit/service application target | FAIL — absent |
| Crash-safe issue -> bearer presentation contract | FAIL — absent |
| Scheduler fan-out cap/approval envelope | FAIL — absent |
| Tenant-qualified one-time fulfillment schema | PASS |
| Targeted gap ratchet | PASS — 1 suite / 5 tests |
| Four Shadow contract/service/architecture preservation set | PASS — 12 suites / 69 tests |
| Combined targeted P4-04 set | PASS — 13 suites / 74 tests |
| Targeted ESLint | PASS |
| Application TypeScript typecheck | PASS |
| Executable PostgreSQL value proof | NOT RUN — blocked before mutation |
| Production referral/value mutations | `0` |
| Provider writes | `0` |

No production endpoint, production database, provider client, browser, or
Playwright process was used.

## 6. Verdict

`P4-04 ALL-4 EXECUTABLE PROOF: FAIL`

`ACTION CLASSES PROVEN: 0/4 EXECUTABLE (4/4 SHADOW REMAIN COMPLETE)`

`FULL REFERRAL→REWARD→VALUE CHAIN PROVEN: NO`

`FULFILLMENT/LEDGER/BALANCE ATOMICITY: NOT PROVEN — VALUE/TARGET CONTRACT MISSING`

`DUPLICATE REWARD VALUE POSSIBLE: NOT YET RULED OUT BY EXECUTABLE PROOF`

`ONE-TIME FULFILLMENT ENFORCED: YES — DOMAIN CLAIM ONLY`

`TENANT ISOLATION FOUNDATION: PRESENT`

`P02/P03 HOLD FOUNDATION: PRESENT`

`POLICY/APPROVAL/CAPS COMPLETE FOR ALL-4: NO`

`LEGACY BYPASS RATCHET READY: NO`

`REAL PRODUCTION VALUE MUTATIONS: 0`

`PROVIDER WRITES: 0`

`PRODUCTION CUTOVER: NO`

`READY FOR P4-04 PRODUCTION CUTOVER: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

## 7. Permanent process hygiene

All commands were foreground and self-terminating. No background process,
watcher, browser, Playwright process, or temporary database was started.

`TEMP PROCESSES STARTED: 0`

`TEMP PROCESSES TERMINATED: 0`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES REMAINING: 0`

STOP. Executable proof and production cutover remain forbidden until the
amended Contract/Schema Gate is explicitly accepted.
