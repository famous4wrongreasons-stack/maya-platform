# Chapter 7 — Wave 3: measured outcomes and staff goals

Status: **P03 LOCAL PASS / P04 LOCAL PASS / PRODUCTION CUTOVER NOT STARTED**. Certified incoming release: `20260908-c7-wave2-4b03a29c`.

## Scope and ownership

P03 covers Q04/Q12/Q13/Q14/Q15; P04 covers Q08/Q09. Both reuse the deployed MeasurementRevision admission, leases, publication, current projection and retention. The applied P01 source-owner FK semantics remain unchanged. New models/fields/migrations/business actions/AC6 classes/backfills: **0**.

P03 reads exact canonical Appointment, B31 immutable binding, verified Action Engine input and effect receipts. The module supplies only the existing trusted input reader; no executor or decryption capability enters measurement. A successful action is not causal revenue. Missing exact lineage remains unattributed. A29 assignment and frozen windows remain source-labelled history, separate from current outcomes. Capacity requires the frozen original interval and exact outcome. Funnel stages retain their own admission clocks and distinguish logical recipients from transport slots, provider acceptance from delivery, and UNKNOWN from failure.

P04 reads confirmed payroll through the canonical CRM service and private A22 staff revenue targets through exact generation/execution/hash evidence. Salary is not a revenue target, a missing target is not zero, and Manager does not acquire business finance authority. Current source authority and A22 configuration are rechecked under existing owner locks before publication. Remote reads occur outside the publication transaction.

The shared publisher preserves the approved source correction behavior: Appointment Client corrections remain allowed; a stale pending Client assertion publishes only UNAVAILABLE, while historical published snapshots remain immutable. Source business facts, executions, delivery slots, configuration and consent are not changed by measurement.

## Proof and release boundary

Package executable PostgreSQL tests use only the owned loopback `maya_c7_replay` cluster and synthetic source transport. The old 17 databases are untouched. The shared schema clean replay and drift check are in [Wave 3 evidence](evidence/chapter7-wave3/implementation-manifest.json). The current Wave 2 production baseline was rechecked structurally and remains healthy, with zero pending migrations and no schema drift.

After both local packages pass, the unchanged documented release process must run Prisma, lint, both typechecks, full mandatory backend regression, build, schema preflight and canary before coordinated activation. Production proof is structural/read-only: no booking, provider, delivery, finance or other business mutation.

Production acceptance is not assigned by this initial report. P06 and the one final Chapter 7 22/22 Q + 32/32-surface gate remain outstanding. Chapter 8 is not started.

## Local acceptance

[P03](CYCLE-07-P03-OUTCOMES.md): 38 package tests and 10 real PostgreSQL scenarios PASS. [P04](CYCLE-07-P04-STAFF-GOALS.md): 38 package tests and 9 PostgreSQL scenarios PASS. The [combined suite](evidence/chapter7-wave3/combined-targeted-final.txt) passes **14 suites / 201 tests**; [adjacent owner guards](evidence/chapter7-wave3/shared-guard-precheck.txt) pass 4 suites / 34 tests. [Independent review](evidence/chapter7-wave3/independent-review.json) found no remaining concrete violations.

Q13 positive exact-capacity calculation is covered by deterministic fixtures; current real B31 admission has no AgentTask/Opportunity lineage, so its PostgreSQL outcome correctly remains NOT_MEASURED. External CRM credit also remains uncredited without frozen provider namespace evidence. These are the approved source-gap semantics, not fabricated links or new schema requests.

All seven Wave 3 requirement rules are locally covered. Production accounting remains unchanged until the coordinated gate and read-only verification pass.
