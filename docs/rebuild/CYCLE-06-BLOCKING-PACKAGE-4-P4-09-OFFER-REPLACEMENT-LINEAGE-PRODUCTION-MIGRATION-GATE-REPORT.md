# CYCLE 06 BLOCKING PACKAGE 4 — P4-09 OFFER REPLACEMENT LINEAGE PRODUCTION MIGRATION GATE

Status: **STOP — PRODUCTION MIGRATION HISTORY DIVERGED BEFORE APPLY**

Date: `2026-09-03`

Source checkpoint: `6a62e49c`

Branch: `codex/maya-brain-systemic-release-20260815`

## 1. Authorized scope

The Gate was authorized to apply only:

`20260903010000_p4_09_offer_replacement_lineage`

Approved migration SHA-256:

`1c273ff3526726a308cbd65904c6d91bd3517dd3f5a61c9555eaf135b5cf431f`

No P4-09 runtime alignment, Shadow, executable proof, bypass-ratchet change,
production configuration mutation or production value mutation was authorized
before this migration Gate passed.

## 2. Local and production preflight

| Check | Result |
| --- | --- |
| Local `HEAD` / origin | `6a62e49c` / exact match |
| Approved local migration checksum | exact match |
| Production service | active |
| `/api/health` / `/api/health/ready` | HTTP `200 / 200` |
| Recent priority service errors | `0` |
| Genuine unfinished production migrations | `0` |
| Approved target journal rows | `0` |
| Existing TenantCatalogItem rows | `0` |
| Existing offer-version rows | `0` |
| Replacement-lineage column before apply | absent, as expected |
| Competing deploy/migration processes | `0` |

The candidate was built locally and staged as an inactive release. The active
production symlink was not changed and the service was not restarted.

## 3. Blocking migration-history divergence

The staged release preflight failed before any database write:

`Database has 1 migration(s) absent from this release and from the historical baseline: 20260903020000_enable_core_notifications`

Production already contains that completed migration through the active
release:

`/opt/maya-saas/releases/20260903-telegram-reports-c1fccfcc`

Its production migration SHA-256 is:

`6f94dfa6335f11dd61bf13a7514606a2efa65baccbdbe2a45942c7af0094bf6a`

The accepted P4-09 source checkpoint does not contain that migration. The
candidate release therefore cannot prove a production migration history whose
only difference is the approved lineage migration. Treating the production-only
migration as historical or copying it into this branch without an explicit
synchronization decision would exceed this Gate.

The active runtime release is also not a valid drift authority for P4-09: it
predates the already-applied immutable offer-version schema. Its schema diff
therefore correctly reports those already-durable P4-09 tables and columns as
database-only. No attempt was made to hide either divergence.

Per the approved STOP rule, the structural clone was not started and the
lineage migration was not applied.

## 4. Production non-mutation proof

Post-stop verification showed:

| Check | Result |
| --- | --- |
| Approved lineage migration applied | `NO` (`0` journal rows) |
| `supersedesOfferId` present | `NO` |
| TenantCatalogItem / offer-version counts | unchanged at `0 / 0` |
| Production runtime symlink switched | `NO` |
| Production service restarted | `NO` |
| Production health/readiness | PASS (`200 / 200`) |
| Production configuration/value mutations | `0` |
| Provider writes | `0` |

The inactive candidate release created for this failed Gate was removed after
verification so it cannot be mistaken for an approved deploy artifact.

## 5. Required next decision

Before this Gate can be retried, the accepted P4-09 branch and production
migration history must be synchronized with the already-applied
`20260903020000_enable_core_notifications` migration through an explicitly
reviewed, non-destructive source synchronization step. That step must preserve
the exact production checksum and verify that it introduces no unrelated
runtime cutover or production write.

## 6. Verdict

`P4-09 REPLACEMENT LINEAGE PRODUCTION MIGRATION GATE: FAIL`

`EXPECTED-ONLY PENDING SET CERTIFIED: NO`

`PRODUCTION-ONLY APPLIED MIGRATIONS ABSENT FROM RELEASE: 1`

`BLOCKING MIGRATION: 20260903020000_enable_core_notifications`

`APPROVED LINEAGE MIGRATION APPLIED: NO`

`PRODUCTION CONFIG/VALUE MUTATIONS: 0`

`PROVIDER WRITES: 0`

`P4-09 RUNTIME CONTRACT ALIGNMENT: NOT STARTED`

`P4-09 SHADOW ACTION CLASSES: 0/7`

`READY FOR P4-09 PRODUCTION CUTOVER: NO`

## 7. Process hygiene

The local build and remote dependency installation ran in the foreground and
were waited to completion. No application server, watcher, browser,
Playwright process or temporary PostgreSQL database was started. The inactive
staged release was removed after the Gate stopped.

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0`

`TEMP DATABASES REMAINING: 0`

P4-02 through P4-08, Package 5 and Chapter 7 remain unchanged.
