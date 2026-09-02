# CYCLE 06 BLOCKING PACKAGE 4 — PRODUCTION MIGRATION PROVENANCE RECONCILIATION GATE

Status: **PASS — CLASSIFICATION A; EXACT ARTIFACT RECOVERED**

Date: `2026-09-03`

Input checkpoint: `a43c1e1e`

Canonical branch: `codex/maya-brain-systemic-release-20260815`

Migration:

`20260903020000_enable_core_notifications`

## 1. Production fact

The production migration journal and the active release were inspected
read-only. No `_prisma_migrations` row was changed.

| Fact | Result |
| --- | --- |
| Active release | `/opt/maya-saas/releases/20260903-telegram-reports-c1fccfcc` |
| Production journal checksum | `6f94dfa6335f11dd61bf13a7514606a2efa65baccbdbe2a45942c7af0094bf6a` |
| Active-release file checksum | exact match |
| Started at | `2026-09-02T21:42:12.301Z` |
| Finished at | `2026-09-02T21:42:12.353Z` |
| Rolled back | `NO` |
| Applied steps | `1` |
| Migration logs | empty |
| Execution status | `SUCCEEDED` |
| Previous successful migration | `20260902230000_p4_09_immutable_offer_value_version` |
| Next successful migration | none |

The resulting production facts are three enabled `notifications.core`
entitlements, one for each standard plan: `solo`, `business`, and
`business_plus`. No tenant, customer, payment, certificate, offer or other PII
was selected or printed.

## 2. Exact SQL and schema impact

The migration is a bounded data migration:

- select the three named standard `SubscriptionPlan` rows;
- insert a deterministic `PlanEntitlement` identity for
  `notifications.core`;
- converge an existing `(planId, featureKey)` row by setting `enabled = true`.

It contains no `CREATE`, `ALTER`, `DROP`, `TRUNCATE` or `DELETE`. It creates no
table, column, index, foreign key, trigger or constraint.

| Surface | Impact |
| --- | --- |
| `PlanEntitlement` data | bounded insert/update for three standard plans |
| P4-09 offer/version/lineage schema | `NONE` |
| `ActionExecution` | `NONE` |
| P4-02 through P4-08 durable facts | `NONE` |
| Destructive operations | `NO` |

Prisma drift is structural, so this data-only migration cannot itself create a
Prisma schema difference. A reconciled candidate release compared with
production showed only the expected, still-pending P4-09 replacement-lineage
surface: `supersedesOfferId`, its tenant-qualified foreign key and indexes, and
replacement of the old unconditional template unique index. The notifications
migration contributed no schema diff.

## 3. Git provenance

The exact artifact exists in Git history:

| Fact | Result |
| --- | --- |
| Source commit | `c1fccfcc8ca78b516a0b14f1c1e78ef4f534d3eb` |
| Commit subject | `fix(reports): restore Telegram owner delivery` |
| Source branch | `codex/telegram-reports-hotfix-20260903` |
| Remote ref | `origin/codex/telegram-reports-hotfix-20260903` |
| Source blob | `707eb0ebd950f888d4239384c7269d66a9c0d739` |
| Source file SHA-256 | `6f94dfa6335f11dd61bf13a7514606a2efa65baccbdbe2a45942c7af0094bf6a` |
| Production/source byte comparison | exact |
| Release/source correspondence | active release suffix is source commit `c1fccfcc` |

The source commit is a notifications/owner-report hotfix on a branch that
diverged from the canonical P4 branch at `1876811b`. It also changes feature
catalog and owner-report runtime files. Those unrelated runtime changes were
not merged or copied by this reconciliation.

## 4. Classification

Classification: **A — LEGITIMATE KNOWN MIGRATION**.

This classification is based on all of the following, not on the migration
name:

1. the exact production file remains present in the active release;
2. the exact source file is reachable from local and remote Git refs;
3. production journal, active release and source commit checksums are equal;
4. the active release name identifies that source commit;
5. the bounded SQL effect matches the surrounding notifications/report work;
6. the migration completed successfully with no rollback or log output.

## 5. Canonical repository reconciliation

The exact source artifact was restored at its original path and byte content:

`maya-saas-backend/prisma/migrations/20260903020000_enable_core_notifications/migration.sql`

It was not recreated from a description and was not placed in the historical
allowlist. The canonical release preflight must continue matching its exact
name and checksum.

A narrow provenance ratchet asserts:

- the recovered file SHA-256 equals the production/source checksum;
- the recoverable migration is absent from the lost-artifact baseline;
- the SQL remains the bounded `PlanEntitlement` upsert;
- destructive DDL/DML remains absent;
- P4-09 offer lineage and `ActionExecution` remain untouched.

## 6. Verification

| Verification | Result |
| --- | --- |
| Source file vs recovered file | byte-identical |
| Provenance ratchet | `1/1` suite, `4/4` tests PASS |
| Clean replay | `69/69` repository migrations PASS |
| Notifications entitlements after clean replay | `3` |
| Prisma migration status on replay DB | up to date |
| Replay DB vs Prisma schema | no difference |
| Prisma validate | PASS |
| Targeted ESLint | PASS |
| Reconciled production release preflight | PASS |
| Applied migrations recognized by preflight | `71` |
| Pending repository migrations | exactly `1` |
| Exact pending migration | `20260903010000_p4_09_offer_replacement_lineage` |
| Production lineage journal rows | `0` |

The generic Prisma CLI still lists the three intentionally absent historical
migrations already covered by the exact checksum baseline. The project release
preflight is the strict authority for that known history and now passes without
adding any exception for `20260903020000_enable_core_notifications`.

## 7. Production boundary

This reconciliation did not:

- alter production schema or migration journal;
- apply the pending P4-09 lineage migration;
- change production entitlements or configuration;
- start P4-09 runtime alignment, Shadow or executable proof;
- perform a provider write;
- change P4-02 through P4-08.

The temporary inactive verification release was removed after read-only
preflight. The production service remained active and healthy.

## 8. Verdict

`UNEXPECTED PRODUCTION MIGRATION ANALYZED: YES`

`MIGRATION: 20260903020000_enable_core_notifications`

`PROVENANCE: KNOWN`

`SOURCE COMMIT: c1fccfcc8ca78b516a0b14f1c1e78ef4f534d3eb`

`PRODUCTION/SOURCE CHECKSUM MATCH: YES`

`P4-09 SCHEMA IMPACT: NONE`

`ACTIONEXECUTION IMPACT: NONE`

`DESTRUCTIVE OPERATIONS: NO`

`CANONICAL REPOSITORY HISTORY RECONCILED: YES`

`PRODUCTION WRITES DURING RECONCILIATION: 0`

`APPROVED LINEAGE MIGRATION APPLIED: NO`

`P4-09 RUNTIME ALIGNMENT STARTED: NO`

`P4-09 SHADOW ACTION CLASSES: 0/7`

`READY TO RE-RUN P4-09 LINEAGE MIGRATION GATE: YES`

## 9. Process hygiene

All build, test, dependency-install, Prisma and database commands were owned
and awaited. One clean-replay database was created and removed. No watcher,
application server, browser, Playwright or Chrome process was started.

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0`

`TEMP DATABASES REMAINING: 0`

Package 5 and Chapter 7 remain unstarted.
