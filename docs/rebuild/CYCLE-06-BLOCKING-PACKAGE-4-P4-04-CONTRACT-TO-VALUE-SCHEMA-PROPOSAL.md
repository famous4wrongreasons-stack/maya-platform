# CYCLE 06 BLOCKING PACKAGE 4 — P4-04 CONTRACT-TO-VALUE SCHEMA PROPOSAL

Status: **PROPOSAL ONLY — not authorized for implementation or migration**
Source: `CYCLE-06-BLOCKING-PACKAGE-4-P4-04-CONTRACT-TO-VALUE-CLOSURE-GATE.md`
Report date: 2026-09-01

## 1. Purpose and exclusions

This is the one minimal schema proposal required by the accepted P4-04
contract decisions. It represents only:

1. authoritative fixed-money or percentage reward configuration;
2. a frozen maximum monetary liability for every issued reward;
3. a versioned, restart-safe bearer presentation contract;
4. the exact visit/payment target and final applied discount.

It does **not** create a generic financial workflow, a points-conversion
engine, a payment write, a provider operation, a new batch table, or a second
loyalty ledger. It does not alter P4-02/P4-03, P02/P03 holds, or A08.

## 2. `ReferralProgram` — authoritative percentage slots

Add nullable fields:

```prisma
inviterRewardPercentBasisPoints    Int?
inviteeRewardPercentBasisPoints    Int?
inviterRewardLiabilityCapKopecks   Int?
inviteeRewardLiabilityCapKopecks   Int?
```

For each inviter/invitee slot, database constraints permit exactly one of:

1. disabled: money, percentage, and percentage cap are all absent;
2. fixed money: existing `*RewardKopecks > 0`, percentage and percentage cap
   are absent;
3. percentage: existing `*RewardKopecks` is absent,
   `percentBasisPoints BETWEEN 1 AND 10000`, and
   `liabilityCapKopecks BETWEEN 1 AND 50000`.

Existing fixed-money rows remain valid. The existing `currency` is the
program's liability currency for both representations. No historical row is
backfilled with invented percentage or cap values.

Why required: `ReferralReward` can already store a percentage reward, but
`ReferralProgram` cannot currently authorize one server-side. A legacy
constant or initiator payload cannot be canonical policy authority.

## 3. `ReferralReward` — frozen liability and presentation version

Add nullable-for-history fields:

```prisma
liabilityCapKopecks  Int?
liabilityCurrency   String?
presentationKeyVersion String?
```

New canonical issuance requires all three fields. Historical rows may keep all
three `NULL` until a separately proved continuity decision; there is no fake
backfill.

Database rules for new canonical rewards:

- `liabilityCapKopecks BETWEEN 1 AND 50000`;
- `liabilityCurrency` is a normalized non-empty ISO currency code;
- `presentationKeyVersion` is non-empty;
- fixed money: liability cap equals `amountKopecks`, and liability currency
  equals the reward currency;
- percentage: the cap and liability currency are present even though the
  existing percentage representation has no fixed applied amount;
- the existing immutable reward trigger is extended to prevent clearing or
  replacing any of these facts.

`codeHash` remains the unique tenant-qualified claim lookup. The raw bearer is
never persisted. `presentationKeyVersion` selects the server-side PRF key used
to reproduce the same bearer after response loss or restart; key material is
not stored in the database.

## 4. `ReferralRewardFulfillment` — exact application fact

Add nullable-for-history fields and relation:

```prisma
targetAppointmentId    String?
targetIdentityHash     String?
eligibleAmountKopecks  Int?
appliedAmountKopecks   Int?
currency               String?
targetAppointment      Appointment? @relation(fields: [targetAppointmentId, tenantId], references: [id, tenantId])
```

Add the supporting tenant-qualified target key:

```prisma
model Appointment {
  @@unique([id, tenantId])
}
```

Add:

```prisma
@@unique([tenantId, targetIdentityHash])
@@index([tenantId, targetAppointmentId])
```

The target uniqueness encodes the accepted non-stacking rule: one exact
visit/payment target cannot consume two referral rewards. A retry of the same
logical fulfillment converges through existing reward/execution uniqueness.

Historical compatibility uses an all-or-none rule: all five new fulfillment
facts may be `NULL` together for existing rows, but a canonical row must set
all five. No historical target is invented.

Extend the append-only fulfillment guard so the new facts cannot be cleared,
replaced, or transferred. The insert-time tenant-qualified validation must
lock/read the target appointment and reward and reject unless:

- appointment tenant equals fulfillment tenant;
- appointment canonical client equals reward recipient;
- exact target evidence hashes to `targetIdentityHash` under the accepted
  `appointment_visit_payment.v1` contract;
- currency matches reward liability currency;
- `eligibleAmountKopecks > 0`;
- `appliedAmountKopecks > 0` and does not exceed eligible amount or frozen
  reward liability cap;
- the reward is neither expired nor previously fulfilled;
- no unresolved identity hold applies.

The canonical executor also verifies the fixed-money or percentage formula
inside the same serializable transaction. The database owns one-time claim,
tenant/recipient binding, cap, and immutable final fact; it does not call a
provider.

## 5. Scheduler envelope — no new table

No batch/envelope schema is proposed. Existing durable primitives are
sufficient:

- one `ActionExecution` represents the non-mutating tenant/currency/policy
  envelope and its approval binding;
- normalized input and evidence bind the exact sorted candidate set and caps;
- each referral resolution and reward issuance has its own ActionExecution and
  existing immutable domain binding;
- retry/resume converges through those identities.

A new generic batch table would duplicate ActionExecution ownership without a
demonstrated durable gap.

## 6. Migration and structural proof requirements

If this proposal is accepted, the next step is only an additive schema
foundation and structural verification. The migration must prove on
PostgreSQL:

1. existing fixed-money programs remain valid;
2. percentage policy requires an exact liability cap;
3. money/percentage slot XOR and numeric bounds;
4. historical reward/fulfillment `NULL` compatibility and no fake backfill;
5. new canonical reward requires frozen liability and key version;
6. reward liability/key binding cannot be cleared or replaced;
7. exact tenant-qualified appointment target;
8. changed/wrong-tenant/wrong-recipient target rejection;
9. duplicate/non-stacking target rejection, including concurrency;
10. applied value cannot exceed target value or frozen liability;
11. fulfillment target/value binding cannot be cleared or replaced;
12. clean replay, Prisma validation, and zero drift.

The production migration remains a later, separately authorized gate. Runtime
alignment, bearer delivery, executable proof, and cutover remain prohibited
until that schema foundation is accepted and applied through their own steps.

## 7. Proposal verdict

`SCHEMA PROPOSAL SCOPE: P4-04 CONTRACT-TO-VALUE ONLY`

`REFERRALPROGRAM PERCENT AUTHORITY REQUIRED: YES`

`REFERRALREWARD FROZEN LIABILITY REQUIRED: YES`

`REFERRALREWARD PRESENTATION KEY VERSION REQUIRED: YES`

`FULFILLMENT EXACT TARGET/APPLIED VALUE REQUIRED: YES`

`NEW SCHEDULER/BATCH TABLE REQUIRED: NO`

`LOYALTY POINTS CONVERSION SCHEMA REQUIRED: NO`

`RAW BEARER PERSISTENCE REQUIRED: NO`

`ADDITIVE MIGRATION REQUIRED: YES`

`MIGRATION CREATED: NO`

`PRODUCTION MIGRATION APPLIED: NO`

`RUNTIME MODIFIED: NO`

`PRODUCTION VALUE MUTATIONS: 0`
