# CYCLE 06 BLOCKING PACKAGE 4 — P4-06 PRESENTATION KEY VERSION PRODUCTION MIGRATION GATE/APPLY

Status: **PASS — ONE APPROVED ADDITIVE MIGRATION APPLIED; RUNTIME AND SHADOW UNCHANGED**

Date: `2026-09-02`

Source checkpoint: `d64eae2b`

Branch: `codex/maya-brain-systemic-release-20260815`

## 1. Scope

This step gated and applied only:

`20260902150000_gift_certificate_presentation_key_version`

Migration SHA-256:

`57a9c7cd3615776cab69180e413c7a60537c57418b1865b95fe7131a069b5243`

The inactive schema-authority release was prepared at:

`/opt/maya-saas/releases/20260902-c06-p4-p406-presentation-schema-d64eae2b`

The active runtime release remained unchanged at:

`/opt/maya-saas/releases/20260902-c06-p4-p405-final-cutover-0a89206a`

No P4-06 runtime, Shadow, certificate issue/redemption, payment/provider path,
P4-02 through P4-05 baseline, A08 write path, Package 5, or Chapter 7 work was
changed or started.

## 2. Production preflight

All production checks were read-only until the exact pending set, committed
checksum, database readiness, and structural clone had passed.

| Check | Result |
| --- | --- |
| Local `HEAD` / origin | `d64eae2b09e5562950ebd9dccd9717a6dbeb5582` / exact match |
| Local and staged migration directories | `65 / 65` |
| Approved target checksum | exact match locally and in staged release |
| Production completed journal rows before apply | `67` (`64` repository + `3` acknowledged historical) |
| Unfinished journal rows | `0` |
| Target journal rows before apply | `0` |
| Pending repository migrations | exactly `1` |
| Exact pending migration | `20260902150000_gift_certificate_presentation_key_version` |
| Active-release schema drift before apply | `NONE` |
| Competing non-idle / idle-in-transaction sessions | `0 / 0` |
| Existing GiftCertificates | `0` |
| Existing GiftCertificateRedemptions | `0` |
| Aggregate certificate nominal value | `0` |
| `maya-saas.service` | active |
| `/api/health` / `/api/health/ready` | HTTP `200 / 200` |

No PII or secret value was selected or printed.

## 3. Structural production clone

The passing clone was built from the production schema plus the non-business
Prisma migration journal. Production business rows and PII copied to the
clone: `0`.

Before the migration, a synthetic historical certificate/redemption pair with
a non-zero sentinel nominal value was inserted into the production-shaped
schema. Prisma then applied exactly the approved pending migration.

| Clone proof | Result |
| --- | --- |
| Pending set before apply | exactly the approved migration |
| Historical certificate | preserved |
| Historical redemption | preserved |
| Historical nominal value | unchanged |
| Historical `presentationKeyVersion` | `NULL` |
| Fake historical backfill | `0` |
| Exact non-secret key version assignment | PASS |
| Missing/invalid version on canonical issuance | REJECTED |
| Established version clear | REJECTED |
| Established version replacement | REJECTED |
| Cross-tenant execution binding | REJECTED |
| Restart reusing issuance execution for another certificate/version | REJECTED |
| Existing certificate/redemption invariants | preserved |
| Raw bearer/code/key-material columns introduced | `0` |
| Target column / check / guards | `1 / 1 / 2` |
| Prisma migration status after apply | up to date (`65/65`) |
| Target journal checksum | exact match |
| Resulting drift | `NONE` |

Two preliminary disposable clone attempts stopped safely before applying the
target: the first exposed a dump URL/stdin transport mismatch, and the second
exposed an unsupported local Prisma socket URL. A separate disposable
connection probe proved the corrected TCP form. All four disposable databases
were dropped and absence was verified before production apply. Migration
contents and constraints were not changed.

## 4. Production apply

Immediately before the schema write, the staged release repeated the
allow-pending preflight and exact pending-set query. The pending set was still
the single approved target; certificate/redemption counts and aggregate value
were still zero; unfinished and competing database sessions remained zero.

The project-standard bounded mechanism applied the target:

`prisma migrate deploy`

No manual SQL schema edit or business DML accompanied the migration. The
active runtime symlink was not switched and `maya-saas.service` was not
restarted.

## 5. Production post-apply verification

| Check | Result |
| --- | --- |
| Repository migrations | `65` |
| Production completed journal rows | `68` (`65` repository + `3` acknowledged historical) |
| Target completed journal rows | `1` |
| Target journal checksum | exact match |
| Pending migrations | `0` |
| Unfinished migrations | `0` |
| Strict release preflight | PASS — database ready |
| Post-apply schema drift | `NONE` |
| GiftCertificates | `0 -> 0` |
| GiftCertificateRedemptions | `0 -> 0` |
| Aggregate certificate nominal value | `0 -> 0` |
| Non-null presentation versions | `0` |
| Version column / check / insert guard / immutable guard | present / present / present / present |
| Raw bearer/code/key-material columns introduced | `0` |
| Service state / PID | active / unchanged |
| `/api/health` / `/api/health/ready` | HTTP `200 / 200` |
| Priority error lines during apply window | `0` |

Because the production certificate tables were empty and the approved
migration performs no business DML, no certificate, redemption, nominal value,
payment, or provider state changed. Historical compatibility and absence of
fake backfill were additionally proved against the synthetic production-shape
fixture on the disposable clone.

## 6. Verdict

`PENDING MIGRATIONS: 0`

`POST-APPLY DRIFT: NONE`

`HISTORICAL CERTIFICATES PRESERVED: YES`

`HISTORICAL REDEMPTIONS PRESERVED: YES`

`FAKE PRESENTATION KEY VERSION BACKFILL: NO`

`PRESENTATION KEY VERSION DURABLE IN PRODUCTION: YES`

`RAW BEARER/CODE/KEY PERSISTED: NO`

`PRODUCTION CERTIFICATE/VALUE MUTATIONS: 0`

`PROVIDER WRITES: 0`

`PRODUCTION HEALTH/READINESS: PASS`

`P4-06 SHADOW CAN START: YES`

`P4-06 RUNTIME MODIFIED: NO`

`P4-06 SHADOW STARTED: NO`

`A08 PAYMENT WRITE: DISABLED`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

## 7. Permanent process hygiene

All helpers ran sequentially. One foreground remote dependency-install
session outlived the first tool yield; its session ID was recorded, waited to
normal completion, and closed before the Gate continued. No watcher,
application server, browser, Chrome, Playwright, or background SSH process was
started.

`TEMP PROCESSES STARTED: 1`

`TEMP PROCESSES TERMINATED: 1`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES CREATED: 4`

`TEMP DATABASES REMOVED: 4`

`TEMP DATABASES REMAINING: 0`

STOP. The first P4-06 Shadow and all subsequent runtime work require a separate
explicit instruction.
