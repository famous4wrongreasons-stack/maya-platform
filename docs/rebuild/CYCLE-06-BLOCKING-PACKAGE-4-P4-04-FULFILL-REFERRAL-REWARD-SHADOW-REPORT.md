# CYCLE 06 BLOCKING PACKAGE 4 — P4-04 FULFILL_REFERRAL_REWARD SHADOW REPORT

Status: fourth and final P4-04 canonical Shadow slice complete; no executable cutover
Source checkpoint: `da0f8c98`
Report date: 2026-09-01

## 1. Exact Gate-ordered slice

The fourth action class in the approved P4-04 Runtime Contract Gate is:

`fulfill_referral_reward`.

This step implements only its non-executable canonical Shadow. The completed
`create_customer_referral`, `resolve_customer_referral`, and
`issue_referral_rewards` slices are unchanged.

The pre-implementation contract is:

| Contract item | Server-derived decision |
|---|---|
| Exact reward | one tenant-qualified `ReferralReward`, resolved only by the canonical HMAC lookup of the transient bearer |
| Recipient | the exact active, unmerged canonical Client bound to the reward and to the submitted tenant/provider Client identity |
| Loyalty owner | the exact tenant-qualified client-owned `LoyaltyAccount`; missing account fails closed |
| Origin | one qualified `CustomerReferral` and its immutable `ReferralRewardIssuance`, backed by a successful policy-allowed `issue_referral_rewards` execution |
| Value | fixed money in kopecks and currency from the durable reward; caller values are comparison evidence only |
| Fulfillment identity | tenant + exact reward/claim/account identities + fulfillment policy; requester cannot choose it |
| One-time claim | one fulfillment per tenant/reward and one fulfillment per tenant/execution, protected by prepared DB uniqueness and immutable binding |
| Actor policy | authenticated active admin, server-allowlisted cashier, or exact reward-recipient Client; owner and requester remain separate identities |
| Approval | no new owner approval is invented when claiming an already-issued reward; server-derived actor authorization remains mandatory |
| Provider boundary | `LOCAL_ONLY`; no YClients or other provider dispatch exists |
| UNKNOWN | not applicable because the Shadow stops before mutation and the future fulfillment boundary is a local PostgreSQL transaction |
| Reconciliation | exact reward + one-time fulfillment + client-owned LoyaltyAccount state under `p4-04.local-fulfillment-account-reconciliation.v1` |

## 2. Canonical claim and authority contract

The claim contract remains
`p4-04.referral-reward-claim.v1` and now has one centralized lookup function:

- the raw bearer is accepted only as transient bridge/HTTP input;
- it is normalized and converted to HMAC-SHA256 in
  `referralRewardClaimLookup`;
- only the stored HMAC lookup is used to resolve the reward;
- neither the bearer nor the stored `codeHash` enters the normalized
  `ActionExecution` input, target, idempotency key, evidence refs, or report;
- reward id or execution id cannot substitute for bearer possession;
- wrong bearer, wrong tenant, wrong recipient, expired reward, existing
  fulfillment, held/unresolved Client, or missing account fails closed.

Caller-provided entitlement, approval, autonomy, policy decision, executor,
reward id, reward amount, fulfillment state, binding hash, or claim lookup is
rejected at the HTTP boundary. The server derives reward, value, recipient,
account, actor authority, policy, and logical identity from canonical state.

## 3. Canonical implementation

The Action Engine registry now contains the isolated capability
`referrals.referral-reward-fulfill.shadow.v1`:

- `actionClass = fulfill_referral_reward`;
- `policyDecision = SHADOW_ONLY`;
- `autonomyLevel = L2_5_SHADOW`;
- `executorKey = shadow.none`;
- local, financial-equivalent, customer-value, one-time-claim, actor-authorized,
  and Shadow-only risk facets;
- one planning attempt, no dispatch retry, and no reconciliation retry.

`ReferralRewardFulfillShadowService` performs only tenant-qualified reads and
one `ActionEngineRuntimeService.planShadow` call:

1. authenticates the internal bridge and derives tenant from the server-bound
   provider/company integration;
2. resolves an active requester identity and membership;
3. converts the transient bearer with the centralized claim lookup and reads
   the exact tenant reward;
4. validates the recipient Client/provider identity, immutable issuance,
   qualified referral, successful canonical issuance execution, fixed reward
   facts, and expiry;
5. applies the unresolved Client hold guard;
6. requires the exact client-owned LoyaltyAccount;
7. derives admin, allowlisted-cashier, or reward-recipient actor authority;
8. creates deterministic reward, issuance, claim, recipient, account,
   requester, and fulfillment evidence hashes;
9. persists only a non-executable Shadow `ActionExecution` plan and stops.

The intended Shadow value application is recorded as
`REFERRAL_REWARD_CLAIM_ONLY`. No conversion from money kopecks to loyalty
points is invented by this step. Future all-four executable proof must bind the
actual local value mutation atomically to `ReferralRewardFulfillment`; this
Shadow does not claim executable atomicity.

The local Python bridge carries the bearer only in the transient request. It is
not imported by production `referral.py` and contains no database, fulfillment,
loyalty, provider-write, or messaging authority. Production Shadow deployment
was unnecessary for this structural proof.

## 4. Mandatory proof

Targeted tests prove:

1. a valid issued reward produces the exact local-only Shadow fulfillment
   plan;
2. one reward/claim/account contract produces one deterministic fulfillment
   identity;
3. retry, service restart, and concurrent identical claims converge to the
   same Action Engine request;
4. prepared tenant-qualified DB uniqueness permits only one fulfillment per
   reward and immutable execution binding;
5. an already fulfilled reward fails closed and cannot plan second value;
6. wrong bearer, tenant, recipient, merged/malformed evidence, or canonical
   issuance mismatch fails closed;
7. unresolved/held identity and guard failure fail closed;
8. expired reward and missing exact LoyaltyAccount fail closed;
9. authenticated actor authority is separate from the recipient value owner;
10. forged cashier, reward, amount, policy, approval, autonomy, executor, or
    binding authority is ignored as comparison evidence or rejected;
11. no fulfillment, reward, ledger, balance, provider, or message side effect
    is reachable from the new path.

Clean canonical fixtures produced `SHADOW DIVERGENCES: 0`. Explicit legacy
comparison mismatches produced divergence signals only and did not change the
canonical reward plan.

## 5. Targeted verification

All checks ran sequentially in low-load mode:

| Check | Result |
|---|---|
| P4-04 fulfillment contract/service/architecture Jest suites | PASS — 3 suites / 17 tests |
| Existing Action Engine registry suite | PASS — 1 suite / 15 tests |
| Combined targeted Jest set | PASS — 4 suites / 32 tests |
| Python bridge unittest | PASS — 2 tests |
| Targeted ESLint | PASS |
| Application TypeScript typecheck | PASS |
| `git diff --check` | PASS |

No full suite, build, browser, Playwright, provider client, temporary database,
production endpoint, or production Shadow was run.

## 6. Scope boundary

- `ReferralRewardFulfillment` rows created by the new path: `0`.
- Reward state changes by the new path: `0`.
- Loyalty ledger/balance/value mutations by the new path: `0`.
- Provider writes and messages by the new path: `0`.
- The legacy executor remains the actual fulfillment execution owner.
- No executable cutover or production deployment occurred.
- The first three P4-04 Shadow slices, P4-02, and immutable P4-03 were not
  changed.
- A08 payment write remains disabled.
- No next P4-04 action exists or was started; the family-wide executable proof
  requires a separate explicit instruction.
- Package 5 and Chapter 7 were not started.

## 7. Verdict

`P4-04 SHADOW ACTION CLASS: fulfill_referral_reward`

`CANONICAL SHADOW WIRED: YES`

`SHADOW DIVERGENCES: 0`

`FULFILLMENTS CREATED BY NEW PATH: 0`

`LOYALTY VALUE MUTATIONS BY NEW PATH: 0`

`PROVIDER WRITES BY NEW PATH: 0`

`MESSAGES SENT BY NEW PATH: 0`

`P4-04 ACTION CLASSES SHADOW-MIGRATED: 4/4`

`EXECUTABLE CUTOVER: NO`

`PRODUCTION SHADOW DEPLOYED: NO`

`NEXT P4-04 ACTION STARTED: NO`

## 8. Permanent process hygiene

All commands were foreground and self-terminating. No background process,
watcher, browser, Playwright process, or temporary database was started.

`TEMP PROCESSES STARTED: 0`

`TEMP PROCESSES TERMINATED: 0`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES REMAINING: 0`

STOP. P4-04 family-wide executable proof requires a separate explicit
instruction.
