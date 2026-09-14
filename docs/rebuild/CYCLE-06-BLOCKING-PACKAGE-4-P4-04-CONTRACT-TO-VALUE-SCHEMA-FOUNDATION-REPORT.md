# CYCLE 06 BLOCKING PACKAGE 4 — P4-04 CONTRACT-TO-VALUE SCHEMA FOUNDATION REPORT

Status: **COMPLETE — production migration not applied; runtime unchanged**
Source checkpoint: `7565d0f5`
Report date: 2026-09-01

## 1. Scope

This step implements only the durable facts authorized by:

`CYCLE-06-BLOCKING-PACKAGE-4-P4-04-CONTRACT-TO-VALUE-SCHEMA-PROPOSAL.md`.

The implementation does not add a reward type, points conversion, generic
financial workflow, payment/provider operation, scheduler table, runtime
executor, ingress path, or production write. The accepted P4-04 Shadow 4/4,
P4-02, and immutable P4-03 baseline remain unchanged.

Migration:

`prisma/migrations/20260901130000_p4_04_contract_to_value/migration.sql`.

## 2. Implemented durable facts

### `ReferralProgram`

The authoritative tenant policy can now represent percentage rewards without
using a legacy constant or caller payload:

- `inviterRewardPercentBasisPoints`;
- `inviteeRewardPercentBasisPoints`;
- `inviterRewardLiabilityCapKopecks`;
- `inviteeRewardLiabilityCapKopecks`.

Per-slot database checks permit only disabled, positive fixed-money, or
percentage-with-exact-liability-cap states. Money and percentage cannot be
combined in one slot. No points field or kopeck-to-point conversion exists.

### `ReferralReward`

Each new canonical issued reward must freeze:

- `liabilityCapKopecks`;
- `liabilityCurrency`;
- `presentationKeyVersion`.

The insert guard rejects a new reward without the complete tuple. The existing
reward-wide immutable trigger also protects these fields, so changing policy
or rotating the current presentation key cannot alter an issued reward.

The existing tenant-qualified `codeHash` remains the only stored bearer
lookup. No raw bearer, presentation secret, key material, or plaintext code is
persisted. The key version is sufficient to re-derive the same artifact from
the approved server-side key ring after restart/response loss; a repeated
presentation does not create another issuance because the existing referral
issuance and reward-slot uniqueness remain authoritative.

### `ReferralRewardFulfillment`

The append-only fulfillment now has an optional-for-history, mandatory-on-new
canonical target tuple:

- tenant-qualified `targetAppointmentId`;
- `targetIdentityHash`;
- `eligibleAmountKopecks`;
- `appliedAmountKopecks`;
- `currency`.

An additive `(Appointment.id, Appointment.tenantId)` unique key supports the
tenant-qualified target FK. A unique `(tenantId, targetIdentityHash)` claim
implements the approved non-stacking rule.

The insert guard locks and validates the exact reward and Appointment. It
rejects:

- wrong tenant or missing target;
- Appointment Client different from reward recipient;
- missing exact provider identity;
- an active `UnresolvedClientIdentityHold`, including P02/P03 semantics;
- expired/not-yet-issued reward;
- currency mismatch;
- applied value above eligible value or frozen liability;
- applied value different from the frozen fixed-money or percentage formula.

The existing fulfillment immutable function was extended so target, target
hash, eligible/final value, and currency cannot be cleared, replaced, or
transferred after insertion. One-time reward fulfillment and ActionExecution
bindings remain intact.

### Scheduler envelope and aggregate caps

No new batch table or ActionExecution field was added. This is intentional and
matches the approved Proposal.

The existing `ActionExecution` durably binds the deterministic envelope
identity, normalized input, exact candidate-set evidence, risk facets,
policy/approval context, 25-referral / 50-recipient boundary, and 2,500,000
kopeck aggregate liability cap. Its tenant identity/idempotency unique claims
make restart converge to the same envelope instead of creating additional
value capacity. Each future referral/issuance remains a separately claimed
child execution; one envelope is not one cross-client value transaction.

## 3. Historical compatibility

All new domain columns are nullable at the storage level so rows that predate
this migration remain representable. Insert guards—not fake backfill—separate
historical rows from new canonical writes.

A dedicated pre-migration PostgreSQL fixture created one historical:

- fixed-money `ReferralProgram`;
- `ReferralReward`;
- `ReferralRewardFulfillment`.

The new migration was then applied. All three rows remained present and every
new policy/liability/presentation/target/value field remained `NULL`. The
migration contains no `INSERT`, `UPDATE`, `DELETE`, or invented historical
ActionExecution.

## 4. PostgreSQL adversarial verification

All verification ran sequentially against explicitly named disposable local
PostgreSQL databases. Each database was dropped in the same command through a
trap, and absence was verified before continuing.

| Check | Result |
|---|---|
| Targeted schema/gap ratchets | PASS — `3` suites / `19` tests |
| Clean migration replay | PASS — all `64` migrations |
| Migration status on replay database | UP TO DATE |
| Existing fixed-money program | PRESERVED |
| Valid authoritative percentage policy with exact cap | PASS |
| Money + percentage in one slot | REJECTED |
| New reward without frozen liability/key version | REJECTED |
| Issued reward value/key version update | REJECTED |
| Later policy change alters issued reward | NO |
| Cross-tenant reward recipient | REJECTED |
| Exact tenant-qualified Appointment target | PASS |
| Wrong target Client | REJECTED |
| Cross-tenant target | REJECTED |
| Active unresolved identity target | REJECTED |
| Wrong/excess applied value | REJECTED |
| Fixed-money calculation | PASS |
| Percentage calculation with frozen cap | PASS |
| Fulfillment target/value replacement | REJECTED |
| Second reward on same target | REJECTED |
| Concurrent same-target claims | PASS — exactly `1` commit / `1` unique rejection |
| Deterministic batch envelope facts/caps persisted | PASS |
| Duplicate/restart envelope identity | REJECTED by tenant identity unique claim |
| Historical rows preserved | PASS |
| Fake historical backfill | NONE |
| Prisma schema validation | PASS |
| Targeted ESLint | PASS |
| Migrated database vs Prisma schema drift | NONE |
| Temporary verification databases remaining | `0` |

The first structural fixture attempt stopped before contract assertions because
raw SQL must explicitly populate Prisma's `@updatedAt` columns. Only the
fixture was corrected; schema and migration semantics were not weakened. The
complete structural proof was rerun successfully on a new disposable database.

The full backend suite, full lint, typecheck, build, ALL-4 executable proof,
and production verification were intentionally not run.

## 5. Safety boundary

- production migration applied: `NO`;
- production or persistent project DB writes: `0`;
- referral/reward/loyalty/payment/provider mutations: `0`;
- runtime P4-04 changes: `0`;
- P4-04 ALL-4 proof resumed: `NO`;
- implicit reward-to-points conversion: `NO`;
- P4-03 canonical loyalty and client-owned LoyaltyAccount unchanged;
- P02/P03 hold semantics preserved;
- A08 payment write remains disabled;
- Package 5 and Chapter 7 were not started.

## 6. Verdict

`P4-04 CONTRACT-TO-VALUE SCHEMA DURABLE: YES`

`FROZEN REWARD VALUE REPRESENTABLE: YES`

`EXACT FULFILLMENT TARGET DURABLE: YES`

`CRASH-SAFE PRESENTATION STATE DURABLE: YES`

`SCHEDULER ENVELOPE/CAP DURABLE: YES`

`IMPLICIT REWARD→POINTS CONVERSION: NO`

`PRODUCTION MIGRATION APPLIED: NO`

`PRODUCTION VALUE MUTATIONS: 0`

`READY FOR P4-04 SCHEMA PRODUCTION MIGRATION GATE: YES`

`P4-04 EXECUTABLE PROOF CAN RESUME: NO`

`P4-04 RUNTIME MODIFIED: NO`

`P4-02/P4-03 MODIFIED: NO`

`A08 PAYMENT WRITE: DISABLED`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

## 7. Permanent process hygiene

All helper commands were foreground and self-terminating. The one explicit
concurrency proof used two database connections inside one lifecycle-owned
Node process; both clients were closed in `finally`. The local PostgreSQL
server was already running and was neither started nor stopped by this step.

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES REMAINING: 0`
