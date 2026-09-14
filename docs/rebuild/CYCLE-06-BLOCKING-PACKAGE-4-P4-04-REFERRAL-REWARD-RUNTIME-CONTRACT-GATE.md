# CYCLE 06 BLOCKING PACKAGE 4 — P4-04 REFERRAL AND REWARD RUNTIME CONTRACT GATE

Status: pre-implementation contract gate; awaiting acceptance
Source checkpoint: `daac359f`
Report date: 2026-08-31

## 1. Immutable baseline and exact next family

P4-03 is an immutable production-complete baseline and is not reopened by this
gate:

- 8/8 loyalty action classes use Canonical Action Ingress and Action Engine;
- production direct-mutation subgroups are `0`;
- legacy mutating writers are inactive and no legacy runtime fallback exists;
- the canonical safe ledger remains 121 rows / 64,581 points;
- the P02/P03 hold remains active with 580 points preserved read-only.

The Package 4 ordering in the approved schema gate makes the exact next
unfinished runtime family:

**`P4-04 / A20-R — Referral relationship and reward convergence`.**

P4-05, Package 5, and Chapter 7 are not started.

| Pre-checkpoint item | Finding |
|---|---|
| Family | `P4-04 / A20-R` |
| Gate wording | Create, resolve, or expire a referral and issue its rewards |
| Current production execution owners | Python `referral.py` plus direct legacy `database.py` writes; bot `/start`, scheduler, manual admin command, and owner panel are initiators that currently reach those owners directly |
| Gate-level production bypass groups | `1` — the whole P4-04 family remains outside Action Engine |
| Concrete direct-mutation subgroups | `3` — referral creation, terminal resolution, and reward issuance; the legacy resolver performs resolution and issuance in one process flow |
| Existing reward-fulfillment owner | None — `referral_promos.used_at` has no production writer in the inspected runtime; fulfillment must not be enabled by assumption |
| Durable schema ready | `CustomerReferral`, `ReferralRewardIssuance`, `ReferralReward`, `ReferralRewardFulfillment`, plus `ActionExecution` / `ActionAttempt` |
| Shadow required | YES |
| Additional schema gate required now | NO |
| Additional runtime contract gate required | YES — this document |

## 2. Exact action classes

The schema has four distinct execution bindings. P4-04 must keep the matching
business actions distinct:

| Action class | Initiators | Durable outcome | Current owner/bypass |
|---|---|---|---|
| `create_customer_referral` | Telegram referral-link visit; future HTTP/AI entrypoints only as initiators | one pending `CustomerReferral` bound 1:1 to `createExecutionId` | `handle_referral_visit` -> legacy `create_referral` |
| `resolve_customer_referral` | daily scheduler or explicitly authorized admin run | one terminal outcome (`qualified`, `expired`, or `self_blocked`) on the existing referral, bound 1:1 to `resolutionExecutionId` | `run_referral_resolver_job` -> legacy identity/status updates |
| `issue_referral_rewards` | only a proven `qualified` resolution | one `ReferralRewardIssuance` bound 1:1 to its execution, with at most the `inviter` and `invitee` immutable reward slots | the legacy resolver creates two `referral_promos` rows and marks the referral `granted` |
| `fulfill_referral_reward` | an authenticated, policy-authorized future cashier/admin/client flow | one append-only `ReferralRewardFulfillment` claim for one exact reward | no current production owner; keep non-executable until its actor, purchase/visit target, and claim evidence are proven |

Qualification, expiry, and self-referral rejection are terminal outcomes of
one `resolve_customer_referral` contract, not caller-selectable shortcuts and
not three competing execution owners. Notification delivery is a downstream
communication action, not a fifth referral value action.

The reusable invite-link artifact is ingress evidence, not reward authority.
Generating or possessing a referral link cannot choose tenant, policy, value,
expiry, qualification, or execution permission.

## 3. Current direct ownership and unsafe coupling

Current source inspection establishes these production-reachable paths:

- `bot.py` handles `ref_...` start payloads and calls
  `referral.handle_referral_visit` directly;
- `bot.py` schedules the referral resolver daily and exposes an admin command
  that calls the same resolver;
- `webhook_server.py` exposes the resolver through the owner job panel;
- `referral.py` reads YClients visit evidence, updates referral identity and
  status, creates both reward codes, and sends Telegram notifications;
- `database.py` writes `referral_codes`, `referrals`, and `referral_promos`
  without an `ActionExecution` binding.

The resolver is not atomic across those legacy operations. A crash after one
promo insert, after two inserts but before status update, or after value commit
but before notification can leave facts that a restart cannot distinguish
from a wholly unexecuted operation. That path cannot be adopted as the
canonical executor.

After cutover, bot, scheduler, admin command, owner panel, HTTP, AI, and future
agents may initiate only. Python database helpers and direct notification calls
may not remain execution owners or fallbacks.

## 4. Prepared durable representation

No new schema is required before the first Shadow slice:

- `CustomerReferral` stores tenant-qualified referrer/referred identities,
  identity hashes, lifecycle state, timestamps, and separate immutable create
  and resolution execution bindings;
- `ReferralRewardIssuance` stores one immutable issuance per qualified
  referral, the exact policy snapshot hash, and a 1:1 execution binding;
- `ReferralReward` stores distinct inviter/invitee slots, exact percentage or
  money facts, expiry, recipient, and only a code hash;
- `ReferralRewardFulfillment` is an append-only one-time claim with a 1:1
  execution binding;
- composite foreign keys enforce tenant isolation; unique indexes and database
  guards reject duplicate issuance, duplicate reward slots, second
  fulfillment, cross-tenant binding, and replacement of established facts;
- `ActionExecution` / `ActionAttempt` supply canonical identity, DB claim,
  policy/approval attestation, restart state, and reconciliation evidence.

Historical nullable bindings and `legacySourceRef` support an explicit later
continuity decision without inventing historical executions. No historical
backfill is authorized by this gate.

## 5. Canonical identity and idempotency

All identities are server-derived. Initiator-supplied tenant, client,
entitlement, autonomy, approval, policy, reward amount, expiry, status,
executor, or binding hash is never authority.

| Action | Required logical identity / DB claim |
|---|---|
| Create referral | tenant + canonical referrer Client + exact referred-subject identity hash + referral-contract version |
| Resolve referral | tenant + immutable referral id + resolution-policy version + evidence evaluation window |
| Issue rewards | tenant + qualified referral id + immutable reward-policy snapshot hash |
| Fulfill reward | tenant + immutable reward id + exact claim lookup + authorized actor + exact visit/purchase/service target when that target is required |

The normalized input hash binds all target and policy facts. Reusing an
idempotency key with a changed referrer, referred subject, referral, reward,
recipient, reward slot, value, expiry, policy snapshot, or fulfillment target
fails closed.

The legacy reusable `REF-...` link may be accepted only as read-only
compatibility evidence after exact tenant/referrer resolution. Canonical
storage must not persist a raw invite or reward bearer. For a reusable invite,
`CustomerReferral.referralCodeHash` must be a per-referral binding (including
the referred-subject identity), not a globally unique hash of the shared raw
invite code. New link issuance requires one versioned server-verifiable claim
contract; the legacy `referral_codes` writer cannot survive cutover.

Reward issuance must produce the one-time presentation artifact from the same
versioned server secret/claim contract used by fulfillment. Only its HMAC/hash
is stored. A reward id, referral id, or execution id is not a bearer
credential. If a crash-safe way to present or re-present the artifact cannot be
proven without persisting the raw bearer, implementation must stop with an
amended contract gate; it must not fall back to plaintext legacy promo rows.

## 6. Provider, UNKNOWN, and reconciliation boundary

YClients is read-only evidence for referral qualification in the current
family. The canonical resolver must bind the exact provider client and exact
attended visit/record reference, not merely a phone and date-range match.

- provider read timeout, unavailable card, missing stable visit identity, or
  malformed evidence means **no terminal resolution and no reward issuance**;
- a read failure does not become an external-write `UNKNOWN`, because no
  provider mutation was dispatched;
- canonical PostgreSQL referral/reward writes are local atomic actions and
  reconcile from their execution-bound rows: commit proves success; proven
  rollback/no row proves not executed; contradictory or unavailable evidence
  fails closed;
- notification delivery happens only after committed issuance through the
  canonical communication path. Delivery `UNKNOWN` belongs to that
  communication execution and must never cause reward re-issuance;
- `fulfill_referral_reward` is local-only unless a later accepted contract
  names an external provider operation with a stable reconciliation identity.
  No YClients write is authorized by this gate.

Resolution and issuance must either be separately committed canonical actions
with a deterministic dependency or be coordinated so a qualified referral can
converge to its single issuance after restart. They must never be simulated as
one opaque legacy transaction.

## 7. Risk, approval, and blast radius

- `create_customer_referral` is non-value but identity-sensitive; self-referral,
  duplicate-subject, wrong-tenant, and forged-link attempts fail closed.
- `resolve_customer_referral` is system-driven and may terminate eligibility;
  exact visit evidence and a versioned pending-expiry policy are mandatory.
- `issue_referral_rewards` grants financial-equivalent value. It requires a
  qualified referral, server-derived reward policy, exact policy snapshot,
  maximum two fixed recipient slots, and per-reward/per-run caps.
- `fulfill_referral_reward` consumes value once and requires a separate
  authenticated actor/policy decision where a human applies the reward.
- scheduler fan-out creates one resolution execution per referral and, after
  qualification, one issuance execution per referral. A scheduler tick is a
  bounded batch envelope, not one mutable execution over all tenants.
- cross-tenant fan-out is forbidden. Caps and approval are tenant-scoped and
  server-derived.
- L2.5 may create a Shadow plan but cannot create or resolve a referral, issue
  or fulfill a reward, generate a usable bearer, send a reward notification,
  or receive external execution permission.

The legacy 15% / 30-day / 60-day constants are compatibility evidence, not
authority. Before executable proof, one versioned P4-04 policy profile must
bind the accepted reward representation, TTL, expiry window, per-run cap, and
approval threshold. P4-09 remains the later family for changing value-bearing
policy; it is not started here.

## 8. Required Shadow and cutover boundaries

Shadow is mandatory. The first and only safe implementation slice after an
explicit acceptance of this gate is `create_customer_referral` Shadow:

`legacy referral-link initiator`

`→ Canonical Action Ingress`

`→ server-derived identity/policy`

`→ SHADOW_ONLY ActionExecution + normalized plan`

`→ STOP BEFORE CustomerReferral OR LEGACY DATABASE WRITE`.

It must prove same logical referral convergence, tenant isolation, exact
referrer/referred identity, forged authority rejection, restart identity,
L2.5 non-executability, and zero value/provider/communication side effects.
The legacy creator remains the actual owner during that isolated Shadow step.

Later slices require separate Shadow proof for resolution, issuance, and
fulfillment. A green creation Shadow is not proof for value issuance. Before
production cutover the family also needs:

1. a read-only legacy referral/promo continuity inventory;
2. exact correlation or explicit quarantine of ambiguous rows;
3. atomic/restart/concurrency proof on executable PostgreSQL;
4. accepted numeric caps and approval profile;
5. a ratchet that rejects all production-reachable direct referral/reward
   mutations while still allowing canonical executors called only by Action
   Engine;
6. sequential build/deployment gates and structural production verification;
7. no artificial referral or reward value mutation for smoke proof.

## 9. Gate verdict

`NEXT PACKAGE 4 RUNTIME FAMILY: P4-04 / A20-R REFERRAL RELATIONSHIP AND REWARD CONVERGENCE`

`P4-04 ACTION CLASSES: 4`

`P4-04 GATE-LEVEL PRODUCTION BYPASS GROUPS: 1`

`P4-04 CONCRETE DIRECT-MUTATION SUBGROUPS: 3`

`P4-04 CANONICAL PRODUCTION ACTION CLASSES: 0/4`

`DURABLE REFERRAL/REWARD SCHEMA READY: YES`

`ADDITIONAL SCHEMA GATE REQUIRED NOW: NO`

`RUNTIME CONTRACT GATE REQUIRED: YES`

`RUNTIME CONTRACT GATE PREPARED: YES`

`SHADOW REQUIRED: YES`

`FIRST SAFE SHADOW SLICE: create_customer_referral`

`P4-04 RUNTIME IMPLEMENTATION STARTED: NO`

`PRODUCTION REFERRAL/REWARD WRITES: 0`

`A08 PAYMENT WRITE: DISABLED`

`P4-02 MODIFIED: NO`

`P4-03 MODIFIED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

## 10. Process hygiene

All inspection commands were foreground and self-terminating. No test server,
watcher, browser, Playwright process, temporary database, or background worker
was started.

`TEMP PROCESSES STARTED: 0`

`TEMP PROCESSES TERMINATED: 0`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES REMAINING: 0`

STOP. Await explicit acceptance of this runtime contract gate before any
P4-04 code, Shadow, legacy continuity action, or production change.
