# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 GRANT REVOCATION PRODUCTION MIGRATION GATE/APPLY REPORT

Status: **PASS — ONE APPROVED REVOCATION MIGRATION APPLIED**
Source checkpoint: `8550c8e1`
Apply date: 2026-08-30
Branch: `codex/maya-brain-systemic-release-20260815`

## 1. Scope And Boundary

This step gated and applied only:

`20260830100000_loyalty_redemption_grant_revocation`

SHA-256:
`5d801c5ebade3b1d45ecce2612ebdb73903fdf8464a557cdc1dafeccc716ede9`.

No P4-03 runtime, executor, initiator, Shadow slice, provider boundary, or
active release was changed. The All-8 executable proof was not run. No revoke,
consume, earn, redeem, refund, balance adjustment, ledger mutation, or
provider write was invoked.

## 2. Production Preflight

All checks ran sequentially before the production write.

| Check                                           | Result                                         |
| ----------------------------------------------- | ---------------------------------------------- |
| Local `HEAD`                                    | `8550c8e1f883e99d863098fd81605d87aa8a2e37`     |
| Origin branch                                   | same commit                                    |
| Local migration files                           | `61`                                           |
| Locally known migrations already applied        | `60`                                           |
| Approved historical baseline journal rows       | `3`                                            |
| Applied local checksum mismatches               | `0`                                            |
| Pending local migrations                        | exactly `1` — revocation migration             |
| Revocation migration checksum                   | exact committed SHA-256 above                  |
| Successful production journal rows before apply | `63`                                           |
| Incomplete production journal rows              | `0`                                            |
| Production DB readiness                         | PASS                                           |
| Non-idle sessions immediately before apply      | `0`                                            |
| Sessions idle in transaction                    | `0`                                            |
| Existing loyalty grants                         | `0`                                            |
| Existing loyalty redemptions                    | `0`                                            |
| Revocation table before apply                   | absent                                         |
| Current active-release schema drift             | NONE against its approved 60-migration schema  |
| Target drift before apply                       | only the approved revocation table/FKs/indexes |
| Release preflight with pending allowed          | PASS — `pending_migrations: 1`                 |
| Service / health / readiness                    | active / HTTP `200` / HTTP `200`               |

The pending set exactly matched the accepted instruction, so the mandatory
STOP condition did not trigger.

## 3. Structural Production Clone

A production schema-only dump and the non-business Prisma migration journal
were streamed to a disposable local PostgreSQL database. Production business
rows and PII copied to the clone: `0`.

The clone initially matched production:

- `LoyaltyRedemptionGrant`: `0` rows;
- `LoyaltyRedemption`: `0` rows;
- `LoyaltyRedemptionGrantRevocation`: absent;
- only the accepted revocation migration was pending.

The project-standard Prisma mechanism applied exactly that one migration to
the clone. Post-apply structural results were:

| Clone check                                     | Result                              |
| ----------------------------------------------- | ----------------------------------- |
| Grants preserved                                | `0 -> 0`                            |
| Redemptions preserved                           | `0 -> 0`                            |
| Fake revocations                                | `0`                                 |
| Tenant-qualified FKs                            | `3`                                 |
| Grant/execution one-to-one unique claims        | `2`                                 |
| Revocation active-claim + append-only triggers  | `2`                                 |
| Consume terminal-state guard                    | `1`                                 |
| Cross-tenant execution binding                  | REJECTED                            |
| Binding replacement                             | REJECTED                            |
| Revocation deletion                             | REJECTED                            |
| Revoke of consumed grant                        | REJECTED                            |
| Consume of revoked grant                        | REJECTED                            |
| Concurrent revoke/revoke                        | exactly one revocation committed    |
| Concurrent revoke/consume                       | exactly one terminal fact committed |
| Resulting Prisma drift                          | NONE                                |
| Temporary clone databases remaining             | `0`                                 |
| Temporary schema/journal output files remaining | `0`                                 |

All adversarial fixtures were synthetic and existed only inside the disposable
clone. They were removed with the clone.

## 4. Production Apply

An inactive schema-only artifact was created at:

`/opt/maya-saas/releases/20260830-c06-p4-p403-revocation-schema-8550c8e1`

Its migration count was `61`, its new migration checksum matched the accepted
commit, Prisma validation passed, and release preflight reported exactly one
pending migration.

Immediately before the write, production was rechecked: the migration was not
already applied, incomplete migrations were `0`, non-idle/idle-in-transaction
sessions were `0/0`, grants/redemptions remained `0/0`, and the revocation
table remained absent.

The standard production command `prisma migrate deploy`, with bounded
statement and lock timeouts, applied only
`20260830100000_loyalty_redemption_grant_revocation`. Prisma concluded:

`All migrations have been successfully applied.`

No manual SQL schema change, data DML, runtime deploy, service restart, or
release symlink switch accompanied the migration. The active runtime remained:

`/opt/maya-saas/releases/20260829-c06-p4-p402-loyalty-cutover-789a799a`

## 5. Production Post-Apply Verification

| Check                                                   | Result                   |
| ------------------------------------------------------- | ------------------------ |
| Strict release preflight                                | PASS — database `ready`  |
| Successful production journal rows                      | `64`                     |
| Incomplete journal rows                                 | `0`                      |
| Pending migrations                                      | `0`                      |
| Applied migration checksum                              | exact committed checksum |
| Post-apply Prisma drift                                 | NONE                     |
| Loyalty grants                                          | `0`, preserved           |
| Loyalty redemptions                                     | `0`, preserved           |
| Grant revocations                                       | `0`                      |
| Loyalty transactions                                    | `0`                      |
| Fake revocation backfill                                | `0`                      |
| Tenant-qualified FKs                                    | `3`                      |
| One-to-one unique claims                                | `2`                      |
| Revocation triggers                                     | `2`                      |
| Consume terminal-state guard                            | `1`                      |
| Non-idle / idle-in-transaction sessions                 | `0 / 0`                  |
| Service state                                           | active                   |
| `/api/health`                                           | HTTP `200`               |
| `/api/health/ready`                                     | HTTP `200`               |
| Priority service errors in observation window           | `0`                      |
| Error/exception/fatal log markers in observation window | `0`                      |

## 6. Safety Boundary

- Production migration writes were limited to the migration journal and the
  new empty schema objects.
- Historical grants and redemptions were not rewritten or backfilled.
- No revocation fact was fabricated.
- No production loyalty/value/provider operation occurred.
- YClients write from consume remains forbidden.
- P4-03 runtime and all eight accepted Shadow paths remain unchanged.
- P4-02 was not changed; A08 payment write remains disabled.
- The next Package 4 family, Package 5, and Chapter 7 were not started.

## 7. Verdict

`REVOCATION MIGRATION APPLIED: YES`

`PENDING MIGRATIONS: 0`

`POST-APPLY DRIFT: NONE`

`HISTORICAL GRANTS/REDEMPTIONS PRESERVED: YES`

`PRODUCTION REVOCATION ROWS: 0`

`FAKE REVOCATION BACKFILL: NO`

`PRODUCTION HEALTH/READINESS: PASS`

`PRODUCTION VALUE MUTATIONS: 0`

`P4-03 EXECUTABLE PROOF CAN RESUME: YES`

`ALL-8 EXECUTABLE PROOF RUN: NO`

`P4-03 RUNTIME CHANGED: NO`

`NEXT PACKAGE 4 FAMILY STARTED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP. The All-8 executable proof requires a separate explicit instruction.
