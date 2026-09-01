# CYCLE 06 BLOCKING PACKAGE 4 — P4-04 CONTRACT-TO-VALUE CLOSURE GATE

Status: **CONTRACT COMPLETE — minimal schema foundation required before executable proof**
Source checkpoint: `c343e957`
Report date: 2026-09-01

## 1. Scope and immutable baseline

This Gate closes only the four contract-to-value gaps found by the P4-04
ALL-4 executable preflight. The accepted four Shadow slices remain unchanged:

1. `create_customer_referral`;
2. `resolve_customer_referral`;
3. `issue_referral_rewards`;
4. `fulfill_referral_reward`.

No runtime was wired, no migration was created or applied, no production data
was read or written, and no referral, reward, loyalty, payment, provider, or
communication action was executed. P4-02 and P4-03 remain immutable; A08
payment write remains physically disabled.

## 2. Canonical reward denomination

### 2.1 Evidence and accepted value domain

The source has two real referral reward representations:

- legacy `referral.py` issues a `15%` discount code, valid for 30 days and
  presented to an administrator at the next visit;
- canonical `ReferralProgram` currently configures fixed minor-currency-unit
  rewards through `inviterRewardKopecks`, `inviteeRewardKopecks`, and
  `currency`;
- `ReferralReward` already distinguishes fixed money
  (`amountKopecks + currency`) from percentage (`percentBasisPoints`).

`LoyaltyAccount.balance` and `LoyaltyTransaction.delta` are points. There is no
accepted kopeck-to-point or percentage-to-point conversion policy. Therefore
the canonical P4-04 value is a **discount entitlement**, not loyalty points.
P4-04 fulfillment must not create a `LoyaltyTransaction` merely to force a
discount into the points ledger.

Accepted reward types are:

| Canonical type | Frozen issuance fact | Fulfillment calculation |
|---|---|---|
| `FIXED_MONEY_DISCOUNT` | exact `amountKopecks`, currency, and maximum liability | `min(frozen amount, exact eligible target amount)` |
| `PERCENT_DISCOUNT` | exact basis points, liability currency, and maximum liability | integer minor-unit `floor(eligible target amount * basis points / 10_000)`, capped by the frozen maximum liability and eligible target amount |

`points`, an unspecified `money`, and a generic value conversion are not
P4-04 reward types. A future points reward requires a separately accepted
versioned policy and schema decision.

### 2.2 Authority and freezing

The server-side `ReferralProgram` and its versioned policy profile are the only
reward authority. The initiator cannot choose the type, amount, percentage,
currency, cap, expiry, or recipient.

Issuance freezes on the immutable `ReferralReward`:

- reward type and exact amount or basis points;
- liability currency and maximum applied amount;
- recipient and slot;
- issue/expiry timestamps;
- `ReferralRewardIssuance.policySnapshotHash`;
- presentation-key version and claim lookup.

Changing `ReferralProgram` after issuance must not alter an issued reward.
Fulfillment applies the frozen facts and the exact eligible target snapshot;
it does not re-run the reward policy.

`REWARD→LOYALTY VALUE CONTRACT DEFINED: YES — DISCOUNT ENTITLEMENT; LOYALTY POINTS MUTATION = 0`

## 3. Exact fulfillment target contract

The only accepted P4-04 target is an exact visit/payment context:

`appointment_visit_payment.v1`

Its server-derived identity binds:

- tenant;
- reward recipient canonical `Client`;
- canonical `Appointment`;
- CRM provider and exact provider record identity;
- exact provider visit identity when present;
- sorted service identity set;
- eligible gross amount in minor units and currency;
- target-contract and application-policy versions.

These facts form one canonical `targetIdentityHash`. The raw provider payload
is not authority. The target must resolve tenant-locally, the appointment's
canonical client must equal the reward recipient, and P02/P03 or any other
unresolved identity hold fails closed.

For a canonical fulfillment, the durable fact must retain:

- exact appointment binding;
- target identity hash;
- eligible amount;
- final applied discount amount;
- currency;
- the existing immutable reward and `ActionExecution` bindings.

One exact target may accept at most one referral reward because the legacy
contract says referral promos do not stack. Retry of the same logical
fulfillment converges; a changed visit, record, service set, eligible amount,
currency, recipient, or reward is a different input and cannot reuse the
execution or fulfillment.

P4-04 performs no YClients/payment write. Provider/payment state is read-only
eligibility evidence. The local atomic fulfillment records the exact discount
application claim; A08 remains disabled. A provider read failure occurs before
mutation and fails closed. It is not an external-dispatch `UNKNOWN`.

`FULFILLMENT TARGET IDENTITY COMPLETE: YES`

## 4. Crash-safe issue-to-bearer presentation contract

Durable claim identity and bearer presentation are separate.

### 4.1 Versioned contracts

`ISSUE OUTPUT CONTRACT: referral-reward-presentation.v1`

- the issuer allocates the immutable reward id before commit;
- it chooses a server-side presentation key version;
- it derives a high-entropy bearer with a versioned server PRF over the
  contract name, tenant, reward id, issuance id, recipient, reward slot, and
  expiry;
- it returns or dispatches only that bearer after the issuance transaction
  commits.

`STORED LOOKUP CONTRACT: referralRewardClaimLookup.v1`

- only the existing keyed HMAC lookup (`codeHash`) and the presentation key
  version are persisted;
- the raw bearer is not stored in reward rows, ActionExecution input/evidence,
  communication payloads, logs, or reports;
- the lookup secret is domain-separated from the presentation PRF key.

`CONSUME INPUT CONTRACT: presented bearer → referralRewardClaimLookup.v1`

- fulfillment accepts the presented bearer, computes the same tenant-scoped
  lookup, and resolves exactly one unexpired, unfulfilled reward;
- reward id, issuance id, referral id, or execution id is never a substitute
  bearer credential.

### 4.2 Commit/response-loss and re-presentation

The bearer is deterministically re-derived from immutable reward facts and the
pinned key version. It is not derived from public identifiers alone. The key
ring retains an old version until every reward using it is expired plus the
required audit window; an unavailable version fails closed.

If the process crashes after issuance commit but before presentation, retry
finds the same issuance/reward and re-derives the same bearer. It creates no
second reward. A presentation retry or authorized re-presentation also returns
the same bearer and is not a second issuance.

For asynchronous delivery, the durable communication action stores only the
reward/presentation reference. The bearer is derived in memory immediately
before dispatch and is redacted from logs. Communication `UNKNOWN` is
reconciled by the communication execution; it never causes reward re-issuance.

Presentation is allowed only to the exact recipient or an independently
server-authorized actor. Forged requester/recipient/tenant/policy data fails
closed. The existing one-time fulfillment uniqueness remains authoritative.

`CRASH-SAFE BEARER PRESENTATION CONTRACT: COMPLETE`

## 5. Scheduler fan-out, caps, and approval

### 5.1 Two execution levels

The scheduler uses a non-mutating tenant-scoped envelope and independent
children:

`P4-04 batch envelope ActionExecution`

`→ per-referral resolve ActionExecution`

`→ per-qualified-referral issue ActionExecution`

`→ at most two immutable reward rows`.

The envelope never updates referrals or value itself. It binds the exact
tenant, sorted referral/evidence identity set, policy version, policy window,
maximum recipients, and maximum aggregate liability. Each child retains its
own logical identity, claim, terminal state, and domain binding.

### 5.2 Accepted profile

The P4-04 scheduler profile is deliberately derived from the already accepted
per-issuance limits rather than a cross-family generic cap:

| Limit | P4-04 value |
|---|---:|
| Maximum referrals per envelope | `25` |
| Maximum reward recipients per envelope | `50` |
| Maximum liability per reward | `50,000` kopecks |
| Maximum liability per qualified referral | `100,000` kopecks |
| Maximum aggregate liability per envelope | `2,500,000` kopecks |
| Approval threshold | any non-zero aggregate liability (`>= 1` kopeck) |
| Approval actor | tenant owner or an explicitly server-authorized equivalent role |
| Policy/approval window | `15 minutes` |

Percentage rewards participate in the same aggregate cap through their frozen
maximum liability, not by adding basis points to money. Mixed currencies may
not share one envelope; each currency gets a separate envelope and approval.
The tenant cannot be mixed under any circumstances.

The deterministic batch identity is derived from tenant, action family,
currency, policy/profile version, 15-minute window, sorted exact candidate
identity set, recipient ceiling, and aggregate-liability ceiling. The approval
binding covers that exact envelope. Each child proves membership in the
approved set and cannot increase its reward or liability beyond the approved
maximum.

Partial completion is expected: committed children remain committed, failed
children remain failed, and an ambiguous external read fails before mutation.
Restart resumes the same envelope and child identities. It does not replay
successful children or collapse all recipients into one mutable transaction.
No blind retry is introduced.

`SCHEDULER FAN-OUT ENVELOPE DEFINED: YES`

`AGGREGATE VALUE CAP DEFINED: YES`

## 6. Durable representation decision

Current durable schema cannot honestly represent all four accepted contracts:

| Contract | Current schema sufficient | Missing durable fact |
|---|---|---|
| Reward denomination | NO | authoritative percentage program slot and frozen monetary-liability cap |
| Exact fulfillment target | NO | appointment target, target identity hash, eligible/final applied amount, currency, and target uniqueness |
| Crash-safe bearer presentation | NO | immutable presentation key version for deterministic re-presentation across key rotation |
| Scheduler envelope/caps | YES | existing `ActionExecution`, policy/approval attestation, normalized identities, and per-child domain bindings are sufficient |

One minimal proposal, limited to those facts, is recorded in:

`docs/rebuild/CYCLE-06-BLOCKING-PACKAGE-4-P4-04-CONTRACT-TO-VALUE-SCHEMA-PROPOSAL.md`.

No migration is authorized by this Gate. The ALL-4 executable proof remains
stopped until the proposal is accepted, implemented, structurally verified,
and—under a separate production migration gate—applied where required.

## 7. Preserved invariants

- one reward has at most one immutable fulfillment;
- `Client` is the canonical business identity; client-owned LoyaltyAccount
  remains unchanged and receives no P4-04 points mutation;
- P02/P03 unresolved hold blocks referral and reward actions;
- all initiators pass Canonical Action Ingress;
- entitlement, policy, caps, approval, tenant, target, and value are
  server-derived;
- tenant isolation and exact identity matching remain mandatory;
- P4-03 has no legacy loyalty fallback;
- local PostgreSQL fulfillment uses commit/rollback semantics; external
  delivery keeps `UNKNOWN != FAILED` and forbids blind retry;
- A08 payment write remains disabled.

## 8. Targeted verification

| Check | Result |
|---|---|
| Four accepted Shadow reports/contracts | PASS — preserved `4/4` |
| Existing ALL-4 gap ratchet | PASS — `1` suite / `5` tests |
| Reward representations traced to legacy and canonical sources | PASS |
| Fulfillment target facts traced to Appointment/CRM read models | PASS |
| Current claim lookup and missing key-version durability inspected | PASS |
| Existing ActionExecution envelope/approval primitives inspected | PASS |
| Runtime/schema/migration changes | `0` |
| Production writes/value mutations/provider writes | `0 / 0 / 0` |

The passing gap ratchet is expected: it confirms that implementation has not
silently invented any of the four decisions before the proposed schema is
accepted. Full tests, typecheck, build, executable PostgreSQL proof, and
production verification are intentionally outside this decision-only step.

## 9. Verdict

`REWARD→LOYALTY VALUE CONTRACT DEFINED: YES`

`FULFILLMENT TARGET IDENTITY COMPLETE: YES`

`CRASH-SAFE BEARER PRESENTATION CONTRACT: COMPLETE`

`SCHEDULER FAN-OUT ENVELOPE DEFINED: YES`

`AGGREGATE VALUE CAP DEFINED: YES`

`ADDITIONAL SCHEMA REQUIRED: YES`

`P4-04 EXECUTABLE PROOF CAN RESUME: NO`

`PRODUCTION VALUE MUTATIONS: 0`

`PRODUCTION WRITES: 0`

`P4-04 SHADOW SLICES MODIFIED: NO`

`P4-02/P4-03 MODIFIED: NO`

`A08 PAYMENT WRITE: DISABLED`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

## 10. Permanent process hygiene

All inspection and document-generation commands were foreground and
self-terminating. No browser, Playwright, watcher, server, worker, or temporary
database was started.

`TEMP PROCESSES STARTED: 0`

`TEMP PROCESSES TERMINATED: 0`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES REMAINING: 0`
