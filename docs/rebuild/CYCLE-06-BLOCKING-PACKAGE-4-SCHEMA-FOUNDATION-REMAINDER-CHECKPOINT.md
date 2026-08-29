# CYCLE 06 BLOCKING PACKAGE 4 — SCHEMA FOUNDATION REMAINDER CHECKPOINT

Status: read-only remainder decision; no schema or runtime change
Accepted checkpoint: `f4351b58`
Reviewed HEAD: `d684f543`
Review date: 2026-08-29

## 1. Boundary And Counting Rule

The approved source of truth is
`CYCLE-06-BLOCKING-PACKAGE-4-MONETARY-VALUE-CONVERGENCE-SCHEMA-GATE.md`.
The reviewed HEAD is one later commit than the accepted checkpoint because
`d684f543` is an unrelated billing-plan presentation hotfix. Package 4 schema
has not changed after `f4351b58`; the branch was not reset.

This checkpoint counts one schema-foundation step as one reviewable additive
migration candidate for one domain aggregate. It does not count runtime
normalizers, executors, architectural ratchets, or reconciliation code as
schema steps. It also does not count a separate tombstone or operation row
when the existing immutable `ActionExecution`, `ActionAttempt`, and audit
record can prove a mutation of an existing business row.

Already complete in the repository:

- `BillingPayment` creation/charge binding;
- `LoyaltyTransaction` ledger-entry binding;
- `Expense` creation binding.

## 2. Exact Remainder Matrix

| action class | business model | binding/state required | 1:1 / 1:N / mutation-of-existing-row | schema already sufficient YES/NO | next schema step required YES/NO |
|---|---|---|---|---|---|
| P4-01 / A08 `pay_visit` | No writable domain owner; Action Engine registry entry is `DENY` | Preserve physical disablement and ratchet only | mutation-of-existing-row, but unreachable | YES | NO |
| P4-02 / A19 Nest loyalty adjustment | `LoyaltyAccount` + `LoyaltyTransaction` | Existing tenant-qualified immutable transaction-to-execution binding and tenant idempotency key | 1:N execution -> ledger rows | YES | NO |
| P4-03 / A20-L earn, expire, redeem, refund, backfill | `LoyaltyAccount` + `LoyaltyTransaction` | Use server-derived deterministic idempotency key and `externalRef` for legacy correlation; bind every resulting ledger row to the execution | 1:N execution -> ledger rows | YES | NO |
| P4-03 / A20-L issue/consume loyalty redemption code | Canonical loyalty redemption grant/code model is absent | Tenant-qualified grant identity; immutable issued value/service and expiry; issue execution binding; atomic single-use claim and consuming execution binding | 1:1 issue plus one-time mutation-of-existing-row | NO | YES — foundation 2 |
| P4-04 / A20-R create/resolve/expire referral | Canonical tenant referral model is absent; `ReferralProgram` is policy only | Tenant-qualified referral identity, source correlation, lifecycle state, and immutable creation execution binding | 1:1 create; later mutation-of-existing-row | NO | YES — part of foundation 3 |
| P4-04 / A20-R issue referral rewards | Canonical referral reward/fulfillment model is absent | One reward identity per referral/recipient/reward slot; immutable amount/currency/policy snapshot; tenant-qualified execution binding; atomic one-award/one-use claim | 1:N resolution execution -> reward rows | NO | YES — part of foundation 3 |
| P4-05 / A20-S create/activate/expire/renew customer subscription and sync usage | Canonical customer-subscription aggregate is absent; platform `SubscriptionPlan` is not a customer subscription | Tenant-qualified customer subscription identity; immutable plan/price/currency/term facts; creation/renewal idempotency; provider correlation; durable current lifecycle/usage state; execution binding for one-time activation/renewal outcomes | 1:1 creation/term; later mutation-of-existing-row | NO | YES — foundation 4 |
| P4-06 / A20-C issue/pay/reconcile/cancel gift certificate | Canonical gift-certificate model is absent | Tenant-qualified certificate/code identity; immutable nominal amount/currency/subject/expiry; issue execution binding; provider correlation and payment state | 1:1 issue; later mutation-of-existing-row | NO | YES — foundation 5 |
| P4-06 / A20-C redeem gift certificate | Same canonical gift-certificate aggregate | Atomic one-time redemption claim and exact consuming execution binding; changed tenant/code/target must not reuse the grant | one-time mutation-of-existing-row | NO | YES — covered by foundation 5, not a sixth step |
| P4-07 / A21 `expenses.create` | `Expense` | Existing tenant-qualified immutable creation binding | 1:1 | YES | NO |
| P4-07 / A21 `expenses.delete` | `Expense` + `ActionExecution`/audit | Logical delete execution retains target id and immutable amount/currency evidence before the hard delete; no FK on a row that is intentionally removed | mutation-of-existing-row / destructive | YES | NO — no tombstone |
| P4-07 / A21 declare period complete | `ExpensePeriodDeclaration` | Nullable historical-compatible, tenant-qualified immutable binding from the current declaration row to its creating logical execution; existing tenant/period and tenant/idempotency unique claims remain | 1:1 declaration | NO | YES — foundation 1 |
| P4-07 / A21 invalidate period completeness | `ExpensePeriodDeclaration` + triggering expense execution/audit | Invalidation is deletion of derived completeness state; the triggering execution and audit retain the reason/period identity | mutation-of-existing-row / destructive | YES | NO — no invalidation tombstone |
| P4-08 / A24 checkout and recurring charge | `BillingPayment` + `ActionExecution` + `ActionAttempt` | Existing 1:1 payment binding; attempt request identity and dispatch state must be used at runtime instead of relabeling ambiguity as failure | 1:1 | YES | NO |
| P4-08 / A24 webhook and reconciliation outcome | Same bound `BillingPayment` and its attempts | Provider evidence updates the already-bound logical payment; transactional one-time outcome application remains the domain claim | mutation-of-existing-row | YES | NO |
| P4-09 / A27-V value-bearing catalog offer changes | `TenantCatalogItem` plus resulting certificate/subscription aggregate | Configuration mutation is recorded by its `ActionExecution`; a later financial execution carries a server-derived deterministic config snapshot/hash and copies immutable price/currency facts into its domain result | mutation-of-existing-row | YES | NO — consumer state arrives in foundations 4/5 |
| P4-09 / A27-V referral reward-policy changes | `ReferralProgram` plus referral reward aggregate | Configuration mutation is recorded by its `ActionExecution`; fulfillment copies immutable reward/policy facts into the reward row and binds them to the resolving execution | mutation-of-existing-row | YES | NO — consumer state arrives in foundation 3 |
| P4-10 / A32 connect/recheck/replace/disconnect payment credentials | `CommerceIntegration` + `ActionExecution`/`ActionAttempt` | Existing encrypted current credentials and verification state remain the business row; execution stores only server-derived credential/provider fingerprint evidence, never raw authority; replace/disconnect must fail closed while an old-credential execution is unresolved | mutation-of-existing-row / destructive disconnect | YES | NO — no credential-history table |
| Common provider dispatch/`UNKNOWN`/reconciliation | `ActionAttempt` under `ActionExecution` | `providerRequestIdentityHash`, encrypted/hashed provider reference, `externalDispatchState`, attempt state, and reconciliation state already provide the separate durable representation required by the Gate | 1:N execution -> attempts | YES | NO — no second provider-operation engine |

## 3. Required Foundations Before Runtime

Exactly **5** schema-foundation steps remain:

1. bind `ExpensePeriodDeclaration` to the logical declaration execution;
2. add the canonical loyalty one-time redemption grant/code contract;
3. add the canonical referral plus reward/fulfillment aggregate;
4. add the canonical customer-subscription aggregate;
5. add the canonical gift-certificate aggregate, including its one-time
   redemption claim.

Foundations 3-5 may contain more than one tightly related table where the
domain aggregate requires it, but they must remain separate reviewable domain
steps. This count does not authorize combining them into one migration or
implementing them concurrently.

No standalone schema step is required for expense deletion, period
invalidation, billing webhook/reconciliation, A27-V configuration mutation,
A32 credential mutation, or generic provider-operation identity. Their missing
work is runtime ownership, exact normalized contracts, atomic transition
logic, reconciliation, and bypass ratchets—not another generic table.

## 4. Verification And Safety

- The approved Gate, all three Package 4 foundation reports, current Prisma
  models, the three existing binding migrations, and the targeted Nest/Python
  domain storage paths were reviewed.
- No Prisma schema, migration, application code, test, database, provider, or
  production state was changed or queried by this checkpoint.
- No full or targeted test suite was run because this is a documentation-only
  read-only decision.
- Package 4 runtime was not started. Package 5 and Chapter 7 were not started.
- A08 payment write remains disabled by the existing contract; this checkpoint
  does not reopen it.

`PACKAGE 4 SCHEMA FOUNDATION REMAINDER CHECK COMPLETE: YES`

`SCHEMA FOUNDATION STEPS ALREADY COMPLETE: 3`

`SCHEMA FOUNDATION STEPS REMAINING: 5`

`NEXT SCHEMA FOUNDATION MODEL: ExpensePeriodDeclaration`

`SEPARATE PROVIDER OPERATION MODEL REQUIRED: NO`

`EXPENSE DELETE TOMBSTONE REQUIRED: NO`

`PERIOD INVALIDATION TOMBSTONE REQUIRED: NO`

`A27-V STANDALONE REVISION TABLE REQUIRED: NO`

`A32 CREDENTIAL HISTORY TABLE REQUIRED: NO`

`SCHEMA CHANGED: NO`

`MIGRATION CREATED: NO`

`PRODUCTION TOUCHED: NO`

`PACKAGE 4 RUNTIME STARTED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP.
