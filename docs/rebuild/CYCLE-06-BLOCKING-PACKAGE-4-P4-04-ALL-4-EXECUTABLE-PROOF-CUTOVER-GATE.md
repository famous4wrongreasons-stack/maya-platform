# CYCLE 06 BLOCKING PACKAGE 4 — P4-04 ALL-4 EXECUTABLE PROOF / CUTOVER GATE

Status: **PASS — executable proof complete; production cutover remains separate**
Source checkpoint: `f960f5ec`
Report date: 2026-09-01

## 1. Scope and accepted baseline

This Gate resumes the proof stopped at `c343e957` after the accepted
Contract-to-Value Closure Gate, production schema apply, and runtime alignment.
It does not redesign P4-04 or repeat the four accepted Shadow implementations.

The executable chain proven on a disposable PostgreSQL database is:

```text
create_customer_referral
  -> resolve_customer_referral
  -> issue_referral_rewards
  -> frozen fixed-money / percentage discount entitlement
  -> fulfill_referral_reward
  -> exact appointment/provider/service target
```

The accepted value is a discount entitlement. It is not silently converted to
loyalty points. The proof created no `LoyaltyTransaction` and changed no
`LoyaltyAccount` balance.

Production P4-04 initiators and legacy executors were not changed or deployed.
P4-02, immutable P4-03, A08, Package 5, and Chapter 7 were not modified.

## 2. Canonical executable owner

Four executable capability contracts now reuse the already approved strict
Shadow normalizers. They are registered with the Action Engine for isolated
proof, while the executor service remains outside the production referrals
module until the separately authorized cutover:

| Action class                | Canonical executor key         | Durable fact                                                          |
| --------------------------- | ------------------------------ | --------------------------------------------------------------------- |
| `create_customer_referral`  | `referrals.customer-referral`  | `CustomerReferral.createExecutionId`                                  |
| `resolve_customer_referral` | `referrals.customer-referral`  | `CustomerReferral.resolutionExecutionId`                              |
| `issue_referral_rewards`    | `referrals.reward-issuance`    | `ReferralRewardIssuance.actionExecutionId` plus immutable reward rows |
| `fulfill_referral_reward`   | `referrals.reward-fulfillment` | `ReferralRewardFulfillment.actionExecutionId`                         |

The executable service can only be entered with a trusted canonical request and
uses `ActionEngineRuntimeService.executeWithReceipt`. Caller-supplied policy,
entitlement, approval, frozen value, exact target, actor authority, executor,
or binding facts cannot bypass the existing strict canonical contracts.

## 3. Executable PostgreSQL proof

The proof applied all `64` repository migrations to a new disposable database
and executed the four actions as one chain.

### Relationship and qualification

- one relationship identity converged to one `CustomerReferral`;
- retry and restart returned the same logical execution/fact;
- resolution was accepted only for the exact referral and canonical clients;
- cross-tenant, self/ambiguous identity, and unresolved-hold inputs failed
  closed;
- P02/P03-style active `UnresolvedClientIdentityHold` prevented execution.

### Frozen reward issuance

- one qualified referral produced one deterministic issuance;
- the proof issuance produced two distinct reward slots without duplicate
  recipient value;
- fixed-money and percentage denominations stayed native and immutable;
- amount/percent, liability cap/currency, policy snapshot, expiry,
  presentation version, and lookup hash survived restart unchanged;
- a later policy change could not rewrite an issued reward;
- no implicit `kopecks -> points` or `% -> points` conversion exists.

### Crash-safe presentation

- raw bearer material was never stored in the database;
- the stored fact is the canonical lookup hash/reference;
- a synthetic crash after the issuance transaction committed but before the
  Action Engine success acknowledgement moved the execution through
  reconciliation to proven success;
- reconciliation found the execution-bound issuance and did not dispatch a
  second issuance;
- deterministic re-presentation returned the same claim material without
  creating a second issuance or reward.

### Exact one-time fulfillment

- fulfillment used the exact immutable appointment, tenant, recipient,
  provider visit, service set, eligible amount, and target hash;
- a changed appointment/target was rejected;
- two concurrent claims for one reward converged to one fulfillment;
- reward uniqueness plus the tenant-qualified execution binding prevented a
  second value application;
- a synthetic post-commit crash reconciled from the execution-bound
  fulfillment fact, so there was no second dispatch;
- local PostgreSQL commit/rollback remained deterministic; no provider write
  or artificial external `UNKNOWN` was introduced.

The resulting proof database contained exactly `1` referral, `1` issuance,
`2` frozen rewards, `2` one-time fulfillments, and `0` loyalty transactions.

## 4. Scheduler envelope, caps, and approval

The executable scheduler envelope is a non-value ActionExecution separate from
the per-referral/per-reward child executions. The proof verified:

- deterministic tenant-scoped batch identity and policy window;
- required owner approval for the exact envelope;
- recipient and aggregate liability caps;
- the per-reward and per-issuance caps preserved by issuance;
- bounded child identities rather than one cross-customer value transaction;
- partial completion restart/resume returns only remaining child identities;
- replay cannot create additional value capacity.

## 5. Atomicity, idempotency, and `UNKNOWN`

Every domain mutation runs in a serializable PostgreSQL transaction. The
domain fact and its tenant-qualified `ActionExecution` binding commit together.
Action Engine final-state persistence can be reconciled after response loss
from that immutable bound fact:

```text
domain transaction absent  -> PROVEN_NOT_EXECUTED
execution-bound fact exists -> PROVEN_SUCCEEDED
```

This proves crash/restart safety without treating `UNKNOWN` as `FAILED` and
without blind retry after the dispatch boundary. There is no external provider
dispatch in the accepted P4-04 fulfillment contract; provider/YClients reads
fail closed before mutation.

## 6. Legacy bypass ratchet readiness

The current pre-cutover legacy owner remains
`ai администратор/referral.py`. It contains exactly one P4-04 family bypass
group with three direct-mutation subgroups:

1. referral relationship write;
2. referral resolution write;
3. reward issue/fulfillment write.

The prepared ratchet distinguishes the isolated canonical executor behind
Action Engine from a direct owner, locks the three known subgroups, and proves
with a synthetic direct owner that the same mutation patterns still fail the
rule. It is ready to become the post-cutover zero-bypass ratchet; the legacy
owner is intentionally not disabled in this Gate.

## 7. Verification

| Check                                   | Result                                     |
| --------------------------------------- | ------------------------------------------ |
| Disposable PostgreSQL apply             | PASS — clean replay of `64/64` migrations  |
| ALL-4 executable matrix                 | PASS — `19/19` proof assertions            |
| Actions proven                          | PASS — `4/4`                               |
| Targeted P4-04 Jest set                 | PASS — `22/22` suites, `120/120` tests     |
| Shadow preservation                     | PASS — `4/4` remains non-executable        |
| Legacy bypass ratchet readiness         | PASS — 1 group / 3 subgroups locked        |
| Targeted ESLint                         | PASS                                       |
| Application TypeScript typecheck        | PASS                                       |
| Scripts TypeScript typecheck            | PASS                                       |
| Full suite/build                        | NOT RUN — outside this targeted proof Gate |
| Production referral/reward/value writes | `0`                                        |
| Provider writes                         | `0`                                        |

No production endpoint, production database mutation, provider client,
browser, Chrome, or Playwright process was used. Production cutover was not
performed.

## 8. Verdict

`P4-04 ALL-4 EXECUTABLE PROOF: PASS`

`ACTION CLASSES PROVEN: 4/4`

`FULL REFERRAL→REWARD→VALUE CHAIN PROVEN: YES`

`FROZEN REWARD VALUE PRESERVED: YES`

`EXACT FULFILLMENT TARGET ENFORCED: YES`

`CRASH-SAFE PRESENTATION PROVEN: YES`

`FULFILLMENT/ENTITLEMENT ATOMICITY: PROVEN`

`DUPLICATE REWARD VALUE POSSIBLE: NO`

`ONE-TIME FULFILLMENT ENFORCED: YES`

`SCHEDULER CAPS/BLAST-RADIUS ENFORCED: YES`

`TENANT ISOLATION: ENFORCED`

`P02/P03 HOLD FAIL-CLOSED: YES`

`FORGED POLICY/VALUE/AUTHORITY ACCEPTED: NO`

`BLIND RETRY AFTER UNKNOWN: NO`

`LEGACY BYPASS RATCHET READY: YES`

`REAL PRODUCTION VALUE MUTATIONS: 0`

`PROVIDER WRITES: 0`

`PRODUCTION CUTOVER: NO`

`READY FOR P4-04 PRODUCTION CUTOVER: YES`

`NEXT PACKAGE 4 FAMILY STARTED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

## 9. Permanent process hygiene

All verification commands were foreground and self-terminating. Each
disposable PostgreSQL database used while isolating and proving the chain was
removed before the next step.

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES REMAINING: 0`

STOP. Production cutover and the next Package 4 family were not started.
