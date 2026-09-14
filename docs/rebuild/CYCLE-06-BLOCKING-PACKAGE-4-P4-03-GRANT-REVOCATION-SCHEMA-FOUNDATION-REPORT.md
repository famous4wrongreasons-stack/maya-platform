# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 GRANT REVOCATION SCHEMA FOUNDATION REPORT

Status: **SCHEMA FOUNDATION COMPLETE; PRODUCTION MIGRATION NOT APPLIED**
Source checkpoint: `e7534e5b`
Report date: 2026-08-30

## 1. Scope And Domain Decision

This step implements only the accepted
`LoyaltyRedemptionGrantRevocation` proposal. P4-03 remains Shadow-complete at
`8/8`; no runtime capability, executor, initiator, provider path, or production
service was changed.

Revocation is represented as a separate append-only terminal fact, not a
mutable boolean or status on `LoyaltyRedemptionGrant`:

- grant -> revocation is `0..1`;
- revoke `ActionExecution` -> revocation is `1..1`;
- `tenantId`, `grantId`, and `actionExecutionId` are all required;
- grant and execution relations are tenant-qualified composite FKs;
- `reasonCode` is limited to the five accepted server-derived values;
- every update or delete of a revocation fact is rejected;
- no nullable legacy execution binding or historical revocation backfill was
  introduced.

`ACTIVE`, `EXPIRED`, `REVOKED`, and `CONSUMED` remain derived from distinct
facts. Expiry is not rewritten as revocation. A consumed or expired grant
cannot acquire a revocation fact.

## 2. Additive Migration

Migration:
`prisma/migrations/20260830100000_loyalty_redemption_grant_revocation/migration.sql`.

It performs only the accepted schema work:

- creates `LoyaltyRedemptionGrantRevocation`;
- adds the direct tenant FK plus composite tenant-qualified grant and
  execution FKs;
- adds one unique grant claim and one unique execution binding;
- adds the tenant/revocation-time lookup index and bounded reason check;
- adds an append-only update/delete trigger;
- adds symmetric insert guards for revocation and redemption.

Both terminal insert guards lock the same tenant-qualified parent grant with
`SELECT ... FOR UPDATE`. This serializes duplicate revokes and concurrent
consume/revoke attempts. The first terminal fact may commit; the other attempt
fails closed. Runtime prechecks are not relied upon for this invariant.

The migration contains no `INSERT`, data `UPDATE`, data `DELETE`, fake
revocation, raw code, generic workflow, or unrelated Package 4 schema.

## 3. Sequential PostgreSQL Proof

All live structural checks ran on one disposable local PostgreSQL database
created from a clean replay of all repository migrations.

| Check                                             | Result                                      |
| ------------------------------------------------- | ------------------------------------------- |
| Valid active-grant revoke                         | PASS — one immutable fact created           |
| Duplicate revoke through another execution        | REJECTED by unique grant claim              |
| Cross-tenant execution binding                    | REJECTED by composite FK                    |
| Missing/wrong grant                               | REJECTED by composite FK                    |
| Clear established execution binding               | REJECTED by append-only trigger             |
| Replace established execution binding             | REJECTED by append-only trigger             |
| Delete revocation fact                            | REJECTED by append-only trigger             |
| Revoke consumed grant                             | REJECTED by terminal-state guard            |
| Consume revoked grant                             | REJECTED by terminal-state guard            |
| Revoke expired grant                              | REJECTED; no revocation row created         |
| Consume expired grant through canonical execution | REJECTED                                    |
| Historical grant without revocation               | PRESERVED — zero fake revocation rows       |
| Expired vs revoked distinction                    | PASS — expired grant has no revocation fact |

## 4. Concurrent PostgreSQL Proof

The only parallel database activity was the bounded two-session concurrency
proof required by the accepted proposal. Both sessions were joined before the
next check and before database cleanup.

| Race                                       | Result                                              |
| ------------------------------------------ | --------------------------------------------------- |
| Two revoke executions for one active grant | exactly one revocation committed; loser rejected    |
| Revoke vs consume for one active grant     | exactly one terminal fact committed; loser rejected |

The resulting counts were `1` revocation winner and `1` combined terminal
winner respectively. Duplicate value or grant mutation was not performed.

## 5. Verification Summary

| Verification                                   | Result                                        |
| ---------------------------------------------- | --------------------------------------------- |
| Targeted schema ratchet                        | PASS — 1 suite / 7 tests                      |
| Targeted ESLint                                | PASS                                          |
| Prisma validate                                | PASS                                          |
| Clean migration replay                         | PASS — all 61 migrations                      |
| Migration status                               | up to date                                    |
| Migrated database vs `schema.prisma` drift     | NONE                                          |
| Tenant-qualified revocation FKs                | PASS — 3                                      |
| Required grant/execution unique claims         | PASS — 2                                      |
| Revocation DB guards                           | PASS — active-claim plus append-only triggers |
| Redemption terminal-state guard                | PASS                                          |
| `git diff --check`                             | PASS                                          |
| Temporary structural/drift databases remaining | 0                                             |

The full backend suite, all-eight executable proof, full lint, typecheck, and
build were intentionally not run. The only TypeScript change is the targeted
structural Jest ratchet, which compiled through the test transform.

## 6. Safety Boundary

- The migration was applied only to the disposable local verification
  database and removed with that database.
- It was not applied to production or any persistent project database.
- No P4-03 runtime, Shadow slice, legacy executor, Canonical Ingress wiring,
  loyalty balance, ledger, grant issuance/consumption runtime, or YClients
  boundary was changed.
- No real loyalty, value, or provider side effect occurred.
- YClients write from consume remains forbidden.
- P4-02 was not changed; A08 payment write remains disabled.
- The next Package 4 family, Package 5, and Chapter 7 were not started.

## 7. Verdict

`GRANT REVOCATION DURABLE: YES`

`APPEND-ONLY REVOCATION: YES`

`CROSS-TENANT REVOCATION POSSIBLE: NO`

`DUPLICATE REVOCATION POSSIBLE: NO`

`FAKE HISTORICAL REVOCATION BACKFILL: NO`

`PRODUCTION MIGRATION APPLIED: NO`

`P4-03 EXECUTABLE PROOF CAN RESUME: NO`

`P4-03 RUNTIME CHANGED: NO`

`P4-03 SHADOW ACTION CLASSES PRESERVED: 8/8`

`YCLIENTS WRITE FROM CONSUME: FORBIDDEN`

`REAL LOYALTY/VALUE/PROVIDER SIDE EFFECTS: 0`

`NEXT PACKAGE 4 FAMILY STARTED: NO`

STOP. The production migration and any later runtime/executable-proof step
require a separate explicit instruction.
