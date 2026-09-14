# CYCLE 06 BLOCKING PACKAGE 4 — P4-04 CREATE_CUSTOMER_REFERRAL SHADOW REPORT

Status: first P4-04 canonical Shadow slice complete; no executable cutover
Source checkpoint: `c0dcd0e4`
Report date: 2026-09-01

## 1. Exact slice

This step implements only the approved non-executable Shadow for:

`create_customer_referral`.

The production legacy owner remains `ai администратор/referral.py` plus its
legacy database helpers. `resolve_customer_referral`,
`issue_referral_rewards`, and `fulfill_referral_reward` were not started.

The server-derived Shadow contract is:

| Contract item | Decision |
|---|---|
| Initiator | authenticated legacy bridge evidence from Telegram referral start; enumerated webhook/background sources converge to the same logical relationship |
| Tenant | resolved from the bridge's server-bound provider/company integration, never from request tenant data |
| Referrer/referred identities | two active tenant-qualified `CrmClientLink` rows resolving to two distinct, unmerged canonical `Client` rows |
| Hold boundary | both provider identities are checked through the canonical `UnresolvedClientIdentityHold` guard before planning |
| Target | server-derived hash of tenant + canonical referrer + exact referred subject |
| Idempotency | `p4-04.create-customer-referral.shadow` + the same relationship hash |
| Policy | enabled server-side `ReferralProgram`, canonical `referrals` entitlement, versioned Shadow policy and immutable policy snapshot hash |
| Approval | `NONE`, server-owned; L2.5 remains non-executable |
| Intended mutation | one pending `CustomerReferral` plan only |
| UNKNOWN | not applicable: this slice has no external dispatch |
| Reconciliation | not required for non-executable Shadow |

## 2. Implementation

The Action Engine registry now contains only the Shadow capability
`referrals.customer-referral-create.shadow.v1`:

- `actionClass = create_customer_referral`;
- `policyDecision = SHADOW_ONLY`;
- `autonomyLevel = L2_5_SHADOW`;
- `executorKey = shadow.none`;
- one planning attempt, no executable retry, no reconciliation retry;
- server-derived `referrals` entitlement;
- no approval supplied by the initiator.

`ReferralCreateShadowService` performs the following read-only preparation
before calling `ActionEngineRuntimeService.planShadow`:

1. authenticates the bridge and binds it to one configured integration;
2. derives the tenant from that integration;
3. fails closed if either external identity is empty, held, unresolved,
   inactive, merged, cross-tenant, or resolves to the same Client;
4. reads the tenant's authoritative `ReferralProgram` and rejects a disabled
   or absent program;
5. derives provider identity hashes, referred-subject hash, relationship
   identity, reusable-code per-relationship binding, policy snapshot,
   eligibility, and intended pending state;
6. creates only a canonical Shadow `ActionExecution` plan.

The initiator discriminator is deliberately excluded from the canonical input
and occurrence identity. Telegram, webhook, retry, restart, or a background
initiator describing the same exact relationship therefore converge instead
of producing a second logical execution.

The local Python bridge submits only exact provider identities and contains no
database, referral, reward, messaging, or YClients mutation authority. It is
not imported by the unchanged production `referral.py`; no production Shadow
deployment was needed for this isolated proof.

## 3. Fail-closed and side-effect proof

Targeted tests prove:

1. a valid exact relationship produces the canonical pending-referral plan;
2. retry produces the same request identity;
3. service restart preserves that identity;
4. a cross-tenant/missing exact link is rejected;
5. identical provider or canonical Client identities are rejected as
   self-referral;
6. unresolved or merged Client identity is rejected;
7. active P02/P03-style hold and hold-lookup failure both fail closed;
8. tenant, entitlement, eligibility, approval, autonomy, policy decision,
   executor, and binding forgeries are rejected at the DTO/normalizer boundary;
9. different legacy initiators converge to one relationship identity;
10. disabled server policy/Shadow produces no execution.

Static architecture proof additionally rejects any referral/reward Prisma
write, executable Action Engine call, YClients mutator, notification sender,
or production legacy-owner wiring in the new slice.

The intended plan contains exact canonical Client ids and only hashed provider
identities. It contains no raw phone, invite code, reward code, or caller-owned
authority.

## 4. Targeted verification

All checks ran sequentially in low-load mode:

| Check | Result |
|---|---|
| P4-04 contract/service/architecture Jest suites | PASS — 3 suites / 16 tests |
| Existing Action Engine registry suite | PASS — 1 suite / 15 tests |
| Python bridge unittest | PASS — 2 tests |
| Targeted ESLint | PASS |
| Application TypeScript typecheck | PASS |
| `git diff --check` | PASS |

No full suite, build, browser, Playwright, provider client, temporary database,
or production endpoint was run.

## 5. Safety boundary

- No `CustomerReferral`, `ReferralRewardIssuance`, `ReferralReward`, or
  `ReferralRewardFulfillment` business row was created.
- No loyalty account or ledger value changed.
- No provider write or message delivery occurred.
- The Python legacy creator remains the factual execution owner.
- No runtime fallback or production cutover was added.
- P4-02 and immutable P4-03 were not modified.
- A08 payment write remains disabled.
- P4-05, Package 5, and Chapter 7 were not started.

## 6. Verdict

`P4-04 SHADOW ACTION CLASS: create_customer_referral`

`CANONICAL SHADOW WIRED: YES`

`SHADOW DIVERGENCES: 0`

`REFERRAL RELATIONSHIPS CREATED BY NEW PATH: 0`

`REWARD/VALUE MUTATIONS BY NEW PATH: 0`

`PROVIDER WRITES BY NEW PATH: 0`

`MESSAGES SENT BY NEW PATH: 0`

`P4-04 ACTION CLASSES SHADOW-MIGRATED: 1/4`

`EXECUTABLE CUTOVER: NO`

`PRODUCTION SHADOW DEPLOYED: NO`

`NEXT P4-04 ACTION STARTED: NO`

## 7. Permanent process hygiene

All commands were foreground and self-terminating. No background process,
watcher, browser, Playwright process, or temporary database was started.

`TEMP PROCESSES STARTED: 0`

`TEMP PROCESSES TERMINATED: 0`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES REMAINING: 0`

STOP. The next P4-04 action class requires a separate explicit instruction.
