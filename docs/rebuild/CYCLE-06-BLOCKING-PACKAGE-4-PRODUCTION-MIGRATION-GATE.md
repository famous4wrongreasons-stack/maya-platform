# CYCLE 06 BLOCKING PACKAGE 4 — PRODUCTION MIGRATION GATE

Status: PASS — five currently pending Package 4 migrations are safe to apply
Source checkpoint: `ce71086a`
Gate date: 2026-08-29

## 1. Scope And Production Boundary

This gate verifies the complete Package 4 schema-foundation migration set
without applying a migration to production and without starting runtime
implementation.

Read-only production inventory found an important pre-existing fact: the first
three Package 4 binding migrations had already been applied together at
`2026-08-29T12:33:30Z`, before this gate. Their migration checksums match the
committed files, there are no incomplete journal rows, and their historical
data remains compatible. This gate performed no production write and does not
rewrite or reapply those migrations.

The exact production state at the gate is therefore:

- complete Package 4 migration set: `8`;
- already applied before this gate: `3`;
- currently pending: `5`;
- production migrations applied by this gate: `0`.

The `READY TO APPLY` verdict below refers only to the five migrations that are
actually pending. Runtime cutover is outside this gate.

## 2. Exact Migration Set

All eight migrations are additive. None drops, renames, truncates, deletes,
updates, or backfills a production row.

| Migration / SHA-256 | Production state | Tables | FK / unique / index / trigger result | Historical rows | Lock and data risk |
|---|---|---|---|---|---|
| `20260829180000_billing_payment_action_binding`<br>`4b64c901fb0c47576d790375b33286ef52d88357744228fcd869c7cd59dd0631` | applied before gate | alters `BillingPayment` | nullable column; 1 tenant-qualified FK; 1 unique 1:1 index; 1 immutable-binding trigger | existing rows remain `NULL`; no backfill | additive catalog change plus non-concurrent index/FK validation requires brief table locks; already applied |
| `20260829200000_loyalty_transaction_action_binding`<br>`45785d33d96bd76d694c78b56a9d681175a66da3df6a72f8d8f95ef3d9d89828` | applied before gate | alters `LoyaltyTransaction` | nullable column; 1 tenant-qualified FK; non-unique 1:N lookup index; 1 immutable-binding trigger | existing rows remain `NULL`; no backfill | brief table locks and index scan; deliberately no unique action claim; already applied |
| `20260829220000_expense_action_binding`<br>`ea43d813a3c40c7e792110244baf518a2b54b10cebab6b58c7aae30c227e2548` | applied before gate | alters `Expense` | nullable column; 1 tenant-qualified FK; 1 unique 1:1 index; 1 immutable-binding trigger | existing rows remain `NULL`; no backfill | brief table locks and index/FK validation; already applied |
| `20260829230000_expense_period_declaration_action_binding`<br>`18113754d4c8d8f7dc6c1222d3acdaef1c7585d8c9ace3f767f7232e392a97bb` | pending | alters `ExpensePeriodDeclaration` | nullable column; 1 tenant-qualified FK; 1 unique 1:1 index; 1 immutable-binding trigger | existing rows remain `NULL`; no backfill | nullable column is metadata-only; unique index and FK are non-concurrent and briefly lock/scan the table; production row count is `0` |
| `20260829233000_loyalty_redemption_grant`<br>`66eee4b69f7a52ac52f61ac2e3edc5044169d9e5cb460b3b468278431c160c65` | pending | creates `LoyaltyRedemptionGrant`, `LoyaltyRedemption` | 6 tenant-qualified FKs, including 2 execution FKs; 8 unique claims; 2 lookup indexes; 2 immutable-binding/value triggers | both tables are new; nullable execution bindings remain available for correlated history; no fake rows | no existing table rewrite; FK creation takes brief locks on referenced tenant/client/execution tables; new tables are empty |
| `20260829234500_referral_reward_fulfillment`<br>`69076581cbf4339f866cde5778735c85b3813f8c2511b51b93c3d8ffe74a3575` | pending | creates `CustomerReferral`, `ReferralRewardIssuance`, `ReferralReward`, `ReferralRewardFulfillment` | 14 tenant-qualified FKs, including 4 execution FKs; 16 unique claims; 5 lookup indexes; 5 qualification/immutability triggers | all four tables are new; nullable execution bindings are not backfilled | no data rewrite; only new-table index builds; referenced client/tenant/execution tables receive brief FK-definition locks |
| `20260829235900_customer_subscription`<br>`34a224bbd39cd4f16098e8092cbd912779026efd4ad537f5a4dd94cb2b076e40` | pending | creates `CustomerSubscription`, `CustomerSubscriptionUsage` | 8 tenant-qualified FKs, including 3 execution FKs; 10 unique claims; 4 lookup indexes; 4 renewal/immutability/capacity triggers | both tables are new; historical rows require explicit legacy correlation when action binding is null | no existing data scan/rewrite; brief FK locks on referenced tenant/client/execution tables; capacity locking exists only for later runtime claims |
| `20260830001000_gift_certificate`<br>`ec52588b60f652565f39f0d7022f4788d217e8b4a40efa8c6af32beb59eae04c` | pending | creates `GiftCertificate`, `GiftCertificateRedemption` | 5 tenant-qualified FKs, including 2 execution FKs; 10 unique claims; 3 lookup indexes; 3 payment/one-time/immutability triggers | both tables are new; historical rows require explicit legacy correlation when action binding is null | no existing data scan/rewrite; brief FK locks on referenced tables; redemption row locking activates only on future runtime inserts |

The four existing-table migrations allow the initial transition from `NULL` to
one execution and then make the established binding immutable. PostgreSQL
unique indexes admit multiple `NULL` historical values, so they do not turn
unknown history into a duplicate conflict.

The remaining migrations create only empty domain tables. Their CHECKs,
unique claims, FKs, and triggers restrict future mutations; they do not
reinterpret existing production data.

## 3. Production Read-Only Inventory

Inventory was executed with database-level read-only mode, statement and lock
timeouts, and aggregate queries only. No business field, identifier, payload,
note, code, credential, or PII value was selected or printed.

### Migration journal

| Check | Production result |
|---|---|
| Successfully applied journal rows | `58` |
| Incomplete journal rows | `0` |
| Applied local files with matching SHA-256 | `55` |
| Applied historical rows matching the approved exact baseline | `3` |
| Checksum mismatches | `0` |
| Unrecognized applied migrations | `0` |
| Package 4 migrations already applied | `3` |
| Local migrations pending | `5`, exactly the set from expense-period binding through gift certificate |

### Existing affected tables

| Table | Rows | Binding state | Total relation size | Compatibility |
|---|---:|---|---:|---|
| `BillingPayment` | `1` | `NULL: 1`, bound: `0` | `180224` bytes | compatible; the already-applied binding did not fabricate history |
| `LoyaltyTransaction` | `0` | `NULL: 0`, bound: `0` | `49152` bytes | compatible |
| `Expense` | `0` | `NULL: 0`, bound: `0` | `73728` bytes | compatible |
| `ExpensePeriodDeclaration` | `0` | pending binding column is absent | `40960` bytes | compatible; pending nullable column/index/FK have no rows to scan semantically |

The ten new domain tables were absent, as expected:
`LoyaltyRedemptionGrant`, `LoyaltyRedemption`, `CustomerReferral`,
`ReferralRewardIssuance`, `ReferralReward`, `ReferralRewardFulfillment`,
`CustomerSubscription`, `CustomerSubscriptionUsage`, `GiftCertificate`, and
`GiftCertificateRedemption`.

Related pre-existing structures were also inventoried:

- `ReferralProgram`: `0` rows;
- `TenantCatalogItem`: `0` rows;
- `CommerceIntegration`: `0` rows;
- platform `SubscriptionPlan`: `4` rows; it is not the new customer
  subscription aggregate;
- the only pre-existing referral/subscription/certificate-named tables were
  `ReferralProgram` and platform `SubscriptionPlan`.

At the inventory snapshot, other production database activity was:

```text
NON_IDLE_SESSIONS: 0
IDLE_IN_TRANSACTION: 0
MAX_OPEN_XACT_SECONDS: 0
```

This is favorable lock evidence, not a promise about a later deployment
instant. The same aggregate session check must run again immediately before an
actual migration.

## 4. Structural Production Clone

A schema-only production dump and the non-business Prisma migration journal
were streamed into a disposable local PostgreSQL database. Production rows and
PII copied to the clone: `0`.

The source schema requires `btree_gist`; it was installed only in the local
clone before restoring the production DDL.

Clone before applying pending migrations:

- public base tables: `69`;
- journal rows: `58`;
- Package 4 migrations already applied: `3`;
- Prisma drift against the 60-migration target: present and expected.

Two synthetic `ExpensePeriodDeclaration` rows were inserted before migration
to represent historical rows in the only existing table changed by the
pending set. Their digest and business fields were identical after migration,
and both new action bindings remained `NULL`.

Exactly these five pending migrations were then applied:

1. `20260829230000_expense_period_declaration_action_binding`
2. `20260829233000_loyalty_redemption_grant`
3. `20260829234500_referral_reward_fulfillment`
4. `20260829235900_customer_subscription`
5. `20260830001000_gift_certificate`

Clone after apply:

| Check | Result |
|---|---|
| Package 4 journal rows complete | `8/8` |
| Public base tables | `79` — exactly 10 new domain tables |
| Synthetic historical rows preserved | `2/2` |
| Synthetic historical bindings still `NULL` | `2/2` |
| Package 4 tenant-qualified execution FKs | `15` |
| Package 4 guard triggers | `18` |
| Prisma drift | none |
| Package 4 catalog equals independent clean 60-migration replay | YES |
| Package 4 normalized catalog SHA-256 | `680379e39863c05fbf8cb163d89e559a5327a2996063ccac2d30b79675db46fc` |

No DML statement exists in any Package 4 migration. Actual production
evidence for the already-applied subset and synthetic pre-migration clone
evidence for the pending existing-table change therefore converge: historical
rows are preserved and no execution identity is invented.

## 5. Adversarial DB Proof

All fixtures were synthetic and existed only on the disposable clone. No
executor, provider, runtime service, payment, loyalty operation, expense,
subscription, referral, reward, or certificate side effect was invoked.

The proof passed `9/9` assertions:

1. cross-tenant `ActionExecution` binding rejected by composite FK;
2. established execution binding replacement rejected by DB trigger;
3. one-to-one execution reuse rejected by unique claim;
4. one execution produced two distinct subscription usage claims where 1:N is intended;
5. a loyalty grant could not be redeemed by a second execution;
6. a gift certificate could not be redeemed by a second execution;
7. a referral reward could not be fulfilled by a second execution;
8. a subscription usage identity could not be applied by a second execution;
9. historical null action bindings remained accepted.

After verification:

- temporary clone databases remaining: `0`;
- temporary production schema/journal dumps remaining: `0`.

The first restore calibrations stopped before migrations because a fresh local
database already contained `public`, and then because the schema-filtered dump
does not carry `btree_gist`. Both attempts were immediately cleaned up. A
catalog query was also rerun after an explicit PostgreSQL `char -> text` cast
fixed its proof harness. The accepted results above come only from the final
successful restore, apply, non-empty catalog comparison, and adversarial run.

## 6. Safety And Operational Verdict

The pending set has no destructive DDL, row rewrite, data conversion, or
backfill. The only existing-table change targets an empty, small production
table. New-table FK creation can briefly lock referenced tables for DDL
coordination, so an actual migration must retain a lock timeout and recheck
open transactions immediately before apply. No structural or data blocker was
found.

- production database queries in this gate: read-only aggregates/schema dump;
- production schema/data writes in this gate: `0`;
- production migrations applied in this gate: `0`;
- runtime implementation started: NO;
- financial/value external side effects: `0`;
- Package 5 and Chapter 7 started: NO.

`PACKAGE 4 MIGRATION SET IDENTIFIED: YES`

`PRODUCTION DATA COMPATIBLE: YES`

`STRUCTURAL CLONE APPLY: PASS`

`HISTORICAL ROWS PRESERVED: YES`

`FAKE BACKFILL: NO`

`POST-MIGRATION DRIFT ON CLONE: NONE`

`PRE-EXISTING PACKAGE 4 MIGRATIONS ON PRODUCTION: 3`

`PACKAGE 4 MIGRATIONS PENDING ON PRODUCTION: 5`

`PRODUCTION MIGRATION APPLIED: NO`

`READY TO APPLY PACKAGE 4 MIGRATIONS TO PRODUCTION: YES`

`READY SET: FIVE CURRENTLY PENDING MIGRATIONS ONLY`

`PACKAGE 4 RUNTIME IMPLEMENTATION STARTED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP.
