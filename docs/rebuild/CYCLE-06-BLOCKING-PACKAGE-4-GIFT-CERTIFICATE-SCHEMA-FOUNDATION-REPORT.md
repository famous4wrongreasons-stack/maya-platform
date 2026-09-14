# CYCLE 06 BLOCKING PACKAGE 4 — GIFT CERTIFICATE SCHEMA FOUNDATION REPORT

Status: eighth and final schema foundation complete; runtime not started
Source checkpoint: `d529b38d`
Report date: 2026-08-29

## 1. Domain Decision

The accepted Package 4 Gate and remainder checkpoint name gift-certificate
issuance plus one-time redemption as the last schema-foundation step before
Package 4 runtime implementation.

The foundation uses two models with deliberately separate business identities:

- `GiftCertificate` — one tenant-owned issuance and its provider payment
  lifecycle;
- `GiftCertificateRedemption` — one append-only claim consuming that
  certificate in full.

The real legacy contract has a single `used_at` claim and no balance,
remaining-value, or partial-redemption ledger. The canonical foundation
therefore models one certificate to zero or one full redemption. It does not
invent partial-redemption semantics.

Execution cardinality is exact:

- one issuance `ActionExecution` creates at most one certificate;
- one certificate has exactly one issuance identity and at most one redemption;
- one redemption `ActionExecution` creates at most one redemption claim;
- issuance/payment reconciliation and redemption are different logical
  actions and cannot share a binding.

Historical correlated certificates and redemptions may retain null execution
bindings only with a non-empty tenant-qualified `legacySourceRef`. No historical
row is backfilled with an invented execution.

## 2. Additive Schema Foundation

The migration creates only `GiftCertificate` and
`GiftCertificateRedemption`.

`GiftCertificate` stores immutable:

- tenant-qualified issuance identity and optional issuance execution binding;
- server-derived bearer-code hash, never the raw code;
- recipient-subject and offer-snapshot hashes;
- nominal amount, currency, issue time, and expiry;
- provider name and hashed provider payment reference;
- provider-reconciled `pending_payment`, `paid`, or `canceled` state;
- optional explicit legacy correlation.

`GiftCertificateRedemption` stores immutable:

- tenant-qualified certificate identity;
- the exact consuming execution binding;
- target kind and hashed target reference;
- redemption time and optional explicit legacy correlation.

Database guarantees include:

- three composite tenant-qualified FKs: issuance execution, redeemed
  certificate, and redemption execution;
- unique issuance identity, bearer-code hash, issuance execution, and provider
  payment identity per tenant;
- immutable certificate denomination, subject, offer, expiry, legacy identity,
  and established execution/provider bindings;
- a one-way provider payment transition from pending to one terminal state;
- a unique certificate redemption claim and unique consuming execution;
- parent certificate locking before redemption so competing claims serialize;
- paid and unexpired status required at the redemption timestamp;
- immutable redemption identity, target, timestamp, legacy correlation, and
  established execution binding.

Migration:
`prisma/migrations/20260830001000_gift_certificate/migration.sql`.

No generic financial/value workflow, runtime handler, raw bearer secret, raw
provider payment reference, partial-value ledger, historical backfill, or
other Package 4 domain schema was added or changed.

## 3. Structural Verification

All database checks ran sequentially on one disposable local PostgreSQL
database. The only concurrency proof used two bounded database sessions for
the same certificate; both sessions completed before cleanup.

| Check | Result |
|---|---|
| Targeted schema ratchet | PASS — 1 suite / 7 tests |
| Clean database migration replay | PASS — all 60 repository migrations |
| Valid certificate issuance | PASS |
| Duplicate issuance identity | REJECTED by unique index |
| Duplicate bearer-code hash | REJECTED by unique index |
| Issuance execution reused | REJECTED by unique index |
| Provider payment identity reused | REJECTED by unique index |
| Cross-tenant issuance execution | REJECTED by composite FK |
| Established issuance binding clear/replacement | REJECTED by DB trigger |
| Immutable nominal amount changed | REJECTED by DB trigger |
| Pending-to-paid provider transition | PASS |
| Paid state changed to another terminal state | REJECTED by DB trigger |
| Valid paid/unexpired redemption | PASS |
| Second redemption through another execution | REJECTED by unique index |
| Same redemption execution reused | REJECTED by unique index |
| Concurrent second redemption | REJECTED; exactly one claim committed |
| Cross-tenant redeemed certificate | REJECTED by composite FK |
| Cross-tenant redemption execution | REJECTED by composite FK |
| Established redemption binding clear/replacement | REJECTED by DB trigger |
| Redemption target changed | REJECTED by DB trigger |
| Unpaid certificate redemption | REJECTED by paid-state guard |
| Expired certificate redemption | REJECTED by expiry guard |
| Historical null issuance/redemption bindings | PASS with legacy source |
| Partial/balance state introduced | NO |
| Required tenant-qualified composite FKs | PASS — exactly 3 |
| Immutability/one-time guards | PASS — exactly 3 |
| Prisma schema validation | PASS |
| Targeted ESLint | PASS |
| Migrated database vs `schema.prisma` drift | NONE |
| `git diff --check` before report | PASS |
| Temporary structural/drift databases remaining | 0 |

The full backend suite, full lint, typecheck, and build were intentionally not
run. No runtime TypeScript or scripts were changed; the added TypeScript is the
targeted structural Jest spec and was compiled by the project test transform.

## 4. Safety Boundary

- The migration was applied only to a disposable local database and removed
  with it after verification.
- The migration was not applied to production or any persistent project
  database.
- No certificate bot, webhook, payment provider, Python database, AI tool,
  ingress, executor, scheduler, billing, loyalty, referral, subscription, or
  other runtime path was connected or modified.
- No certificate, payment, redemption, or external value side effect occurred.
- A08 payment write remains disabled.
- Package 5 and Chapter 7 were not started.

## 5. Checkpoint Verdict

`PACKAGE 4 EIGHTH SCHEMA FOUNDATION COMPLETE: YES`

`DOMAIN MODELS CREATED: GiftCertificate, GiftCertificateRedemption`

`ISSUANCE AND REDEMPTION DISTINCT: YES`

`ISSUANCE EXECUTION TO CERTIFICATE: ONE-TO-ONE`

`CERTIFICATE TO REDEMPTION: ONE-TO-ZERO-OR-ONE`

`REDEMPTION EXECUTION TO CLAIM: ONE-TO-ONE`

`PARTIAL REDEMPTION MODELED: NO`

`ONE-TIME SECOND REDEMPTION: REJECTED`

`CONCURRENT SECOND REDEMPTION: REJECTED`

`TENANT-QUALIFIED ACTION BINDINGS: YES`

`HISTORICAL NULL BINDINGS COMPATIBLE: YES`

`ESTABLISHED BINDINGS IMMUTABLE AT DB LEVEL: YES`

`RAW CERTIFICATE CODE STORED: NO`

`RAW PROVIDER PAYMENT REFERENCE STORED: NO`

`GENERIC FINANCIAL/VALUE WORKFLOW CREATED: NO`

`PRODUCTION MIGRATION APPLIED: NO`

`PACKAGE 4 SCHEMA FOUNDATION STEPS REMAINING: 0`

`PACKAGE 4 RUNTIME IMPLEMENTATION STARTED: NO`

`A08 PAYMENT WRITE: DISABLED`

`EXTERNAL CERTIFICATE/VALUE SIDE EFFECTS: 0`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP.
