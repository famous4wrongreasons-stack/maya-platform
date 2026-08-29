# CYCLE 06 BLOCKING PACKAGE 4 — REFERRAL REWARD FULFILLMENT SCHEMA FOUNDATION REPORT

Status: sixth schema foundation complete; runtime not started
Source checkpoint: `bc581226`
Report date: 2026-08-29

## 1. Domain Decision

The accepted Package 4 remainder names referral plus reward fulfillment as the
next and only schema-foundation step.

This foundation keeps referral facts and value mutations in four distinct
domain models:

- `CustomerReferral` — the tenant-qualified referral relationship and its
  lifecycle fact;
- `ReferralRewardIssuance` — the immutable qualification-time reward issuance
  operation;
- `ReferralReward` — one immutable recipient/reward-slot value produced by an
  issuance;
- `ReferralRewardFulfillment` — the append-only, one-time fulfillment claim for
  one reward.

The business operations are deliberately separate:

- referral creation execution -> referral is **one-to-one**;
- a later qualification, expiry, or self-referral rejection is a
  mutation-of-existing-referral with its own **one-to-one** resolution
  execution binding;
- qualified referral -> reward issuance is **one-to-zero-or-one**;
- reward-issuance execution -> issuance is **one-to-one**;
- issuance -> reward rows is **one-to-many**, allowing distinct inviter and
  invitee reward slots without merging them into the referral fact;
- reward -> fulfillment is **one-to-zero-or-one**;
- fulfillment execution -> fulfillment claim is **one-to-one**.

Referral creation itself grants no value. Qualification is required before an
issuance row can exist. The separate fulfillment claim and its unique
tenant-qualified reward identity reject a second fulfillment even when a
different execution, request, process, or future runtime path attempts it.

Legacy referral/reward rows are not backfilled. A later safe correlation may
create historical rows with null action bindings and tenant-qualified legacy
source references; this step invents no historical execution.

## 2. Additive Schema Foundation

The migration creates only `CustomerReferral`, `ReferralRewardIssuance`,
`ReferralReward`, and `ReferralRewardFulfillment`.

The referral fact stores:

- tenant-qualified referrer and optional referred-client identities;
- server-derived identity, referred-subject, and referral-code hashes, never a
  raw bearer code;
- explicit lifecycle state and timestamps;
- separate optional immutable creation and resolution execution bindings;
- optional tenant-qualified legacy source reference.

The issuance and reward rows store:

- the tenant-qualified qualified referral identity;
- an immutable policy snapshot hash;
- one immutable reward per recipient/reward slot;
- either positive money facts or a positive percentage fact, with issue and
  optional expiry timestamps;
- optional immutable issuance-execution binding.

The fulfillment claim stores the tenant-qualified reward identity,
fulfillment time, optional immutable execution binding, and optional legacy
source reference.

Database guarantees include:

- composite tenant-qualified FKs for every referral, client, reward,
  fulfillment, and `ActionExecution` relation;
- unique referral identity and hashed code per tenant;
- unique creation, resolution, issuance, and fulfillment execution bindings;
- unique issuance per referral;
- unique reward slot per issuance and unique reward code hash per tenant;
- unique fulfillment per reward;
- a qualification guard that rejects reward issuance for a non-qualified
  referral;
- immutable established referral bindings and terminal resolution facts;
- immutable issuance identity, policy snapshot, and established binding;
- immutable reward identity and value facts;
- immutable fulfillment identity, time, and established binding.

Migration:
`prisma/migrations/20260829234500_referral_reward_fulfillment/migration.sql`.

No generic financial/value workflow, runtime handler, raw referral/reward code,
historical backfill, subscription, certificate, billing, loyalty, or expense
schema was added or changed.

## 3. Structural Verification

All checks ran sequentially on a disposable local PostgreSQL database.

| Check | Result |
|---|---|
| Targeted schema ratchet | PASS — 1 suite / 7 tests |
| Clean database migration replay | PASS — all 58 repository migrations |
| Historical referral create/resolution bindings | PASS — nullable |
| Historical issuance/fulfillment bindings | PASS — nullable |
| Cross-tenant referral creation execution | REJECTED by composite FK |
| Referral creation execution reused | REJECTED by unique index |
| Established referral create binding clear/replacement | REJECTED by DB trigger |
| Established referral resolution binding replacement | REJECTED by DB trigger |
| Reward issuance before referral qualification | REJECTED by qualification guard |
| Second issuance for the same referral | REJECTED by unique index |
| Issuance execution reused | REJECTED by unique index |
| Cross-tenant issuance execution | REJECTED by composite FK |
| Established issuance binding clear/replacement | REJECTED by DB trigger |
| Two reward slots from one issuance | PASS |
| Duplicate reward slot in one issuance | REJECTED by unique index |
| Cross-tenant reward issuance/recipient | REJECTED by composite FK |
| Immutable reward value change | REJECTED by DB trigger |
| Second fulfillment of the same reward | REJECTED by unique index |
| Fulfillment execution reused | REJECTED by unique index |
| Cross-tenant fulfillment reward/execution | REJECTED by composite FK |
| Established fulfillment binding clear/replacement | REJECTED by DB trigger |
| Required tenant-qualified constraints | PASS — exactly 10 |
| Qualification/immutability guards | PASS — exactly 5 |
| Prisma schema validation | PASS |
| Targeted ESLint | PASS |
| Migrated database vs `schema.prisma` drift | NONE |
| `git diff --check` before report | PASS |
| Temporary structural/drift databases remaining | 0 |

The first disposable fixture attempt correctly stopped at the qualification
guard before reaching the intended cross-tenant FK assertion. Only the fixture
ordering was corrected; schema semantics were not weakened. The complete
clean replay and every structural assertion then passed.

The full backend suite, full lint, typecheck, and build were intentionally not
run. No runtime TypeScript or scripts were changed; the added TypeScript is the
targeted structural Jest spec and compiled through the project test transform.

## 4. Safety Boundary

- The migration was applied only to a disposable local database and removed
  with it after verification.
- The migration was not applied to production or any persistent project
  database.
- No referral handler/resolver, reward issuer, fulfillment path, Python job,
  AI tool, ingress, executor, scheduler, webhook, provider, billing,
  subscription, certificate, or other runtime path was connected or modified.
- No referral/reward/value mutation or external side effect occurred.
- A08 payment write remains disabled.
- Package 5 and Chapter 7 were not started.

## 5. Checkpoint Verdict

`PACKAGE 4 SIXTH SCHEMA FOUNDATION COMPLETE: YES`

`DOMAIN MODELS CREATED: CustomerReferral, ReferralRewardIssuance, ReferralReward, ReferralRewardFulfillment`

`REFERRAL CREATION AND RESOLUTION SEPARATE: YES`

`REWARD ISSUANCE SEPARATE FROM REFERRAL FACT: YES`

`ISSUANCE TO REWARDS: ONE-TO-MANY`

`REWARD TO FULFILLMENT: ONE-TO-ZERO-OR-ONE`

`TENANT-QUALIFIED ACTION BINDINGS: YES`

`HISTORICAL NULL BINDINGS COMPATIBLE: YES`

`DUPLICATE REWARD FULFILLMENT: REJECTED`

`ESTABLISHED BINDINGS IMMUTABLE AT DB LEVEL: YES`

`RAW REFERRAL/REWARD CODES STORED: NO`

`GENERIC VALUE WORKFLOW CREATED: NO`

`PRODUCTION MIGRATION APPLIED: NO`

`PACKAGE 4 RUNTIME IMPLEMENTATION STARTED: NO`

`PACKAGE 4 SCHEMA FOUNDATION STEPS REMAINING: 2`

`NEXT SCHEMA FOUNDATION: CUSTOMER SUBSCRIPTION`

`A08 PAYMENT WRITE: DISABLED`

`EXTERNAL REFERRAL/REWARD SIDE EFFECTS: 0`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP.
