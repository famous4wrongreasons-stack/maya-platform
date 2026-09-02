# CYCLE 06 BLOCKING PACKAGE 4 — P4-09 OFFER REPLACEMENT LINEAGE PRODUCTION MIGRATION GATE/APPLY

Status: **PASS — ONE APPROVED ADDITIVE MIGRATION APPLIED; RUNTIME UNCHANGED**

Date: `2026-09-03`

Source checkpoint: `bd424535`

Branch: `codex/maya-brain-systemic-release-20260815`

## 1. Scope

This Gate applied only:

`20260903010000_p4_09_offer_replacement_lineage`

Migration SHA-256:

`1c273ff3526726a308cbd65904c6d91bd3517dd3f5a61c9555eaf135b5cf431f`

The reconciled notifications migration remained an already-applied historical
fact with its exact source/production checksum. No runtime release switch,
service restart, offer configuration mutation or customer-value mutation was
part of this schema Gate.

## 2. Production preflight

| Check | Result |
| --- | --- |
| Local `HEAD` / origin | `bd424535` / exact match |
| Repository/staged migration directories | `69 / 69` |
| Lineage migration checksum | exact local/staged match |
| Notifications migration checksum | exact production/source match |
| Strict reconciled release preflight | PASS |
| Recognized applied migrations | `71` |
| Pending repository migrations | exactly `1` |
| Exact pending migration | `20260903010000_p4_09_offer_replacement_lineage` |
| Genuine unfinished migrations | `0` |
| Target rows before apply | `0` |
| TenantCatalogItem / offer-version rows | `0 / 0` |
| ReferralProgram / referral-version rows | `0 / 0` |
| Existing subscription/certificate/referral reward rows | `0 / 0 / 0` |
| Active/idle-in-transaction competing DB sessions | `0` |
| Competing deploy/migration processes | `0` |
| Production service | active |
| Health/readiness | HTTP `200 / 200` |

No PII, customer identity, raw value configuration or secret was selected or
printed.

## 3. Structural production clone

A disposable local PostgreSQL database was restored from a production
schema-only dump plus the non-business Prisma migration journal. Production
business rows and PII copied to the clone: `0`.

| Clone proof | Result |
| --- | --- |
| Target rows before apply | `0` |
| Migration applied | exactly the approved lineage migration |
| Target rows after apply | `1` |
| Historical offer/version counts | preserved at `0 / 0` |
| Fake replacement backfill | `0` |
| Active offer identity immutable | YES |
| Retired offer preserved | YES |
| Replacement gets a new identity | YES |
| Replacement chain | `A → B → C` PASS |
| Active template authorities | exactly `1` |
| Concurrent replacement winners | exactly `1` |
| Concurrent first-identity winners | exactly `1` |
| Frozen subscription value | preserved |
| Frozen certificate value | preserved |
| Frozen referral reward value | preserved |
| Cross-tenant lineage | rejected |
| `externalRef` as canonical identity | NO |
| Resulting Prisma drift | NONE |

The clone and schema-dump working directory were removed and verified absent
before production apply.

## 4. Production apply

Immediately before apply, the staged release repeated strict preflight with
pending migrations allowed. It again reported exactly one pending migration,
zero target rows, HTTP `200 / 200`, and no competing deployment or migration
process.

The committed migration was applied through the standard Prisma mechanism
with bounded lock and statement timeouts. No manual production DDL or business
DML was issued outside the migration.

## 5. Post-apply verification

| Check | Result |
| --- | --- |
| Local repository migrations | `69` |
| Recognized completed production migrations | `72` |
| Target journal rows | `1` |
| Target journal checksum | exact match |
| Pending migrations | `0` |
| Strict release preflight | PASS — ready |
| Post-apply drift | NONE |
| `supersedesOfferId` column | present |
| Lineage triggers | `3 / 3` |
| TenantCatalogItem / offer-version rows | unchanged at `0 / 0` |
| Fake replacement backfill | `0` |
| Active runtime symlink | unchanged |
| Service PID | unchanged |
| Production health/readiness | HTTP `200 / 200` |
| Recent priority service errors | `0` |

## 6. Verdict

`PENDING MIGRATIONS: 0`

`POST-APPLY DRIFT: NONE`

`OFFER REPLACEMENT LINEAGE DURABLE IN PRODUCTION: YES`

`HISTORICAL OFFERS/VERSIONS PRESERVED: YES`

`FAKE REPLACEMENT BACKFILL: NO`

`PRODUCTION CONFIG/VALUE MUTATIONS: 0`

`PRODUCTION HEALTH/READINESS: PASS`

`PRODUCTION RUNTIME CUTOVER: NO`

## 7. Process hygiene

All build, dependency-install, dump, migration and proof processes were owned
and awaited. No application server, watcher, browser, Playwright or Chrome
process was started. The one disposable structural-clone database and its dump
directory were removed.

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0`

`TEMP DATABASES REMAINING: 0`

P4-02 through P4-08, Package 5 and Chapter 7 remain unchanged.
