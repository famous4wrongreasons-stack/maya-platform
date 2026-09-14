# Cycle 06 / Package 5 — E2 Stage 1 assessment after Wave R-A

R01, R02 and R10 have production PASS in [the Wave R-A report](CYCLE-06-PACKAGE-5-WAVE-R-A-IMPLEMENTATION-PRODUCTION-REPORT.md). This is the next parallel group from the accepted [master dependency graph](CYCLE-06-BLOCKING-PACKAGE-5-EXHAUSTIVE-REMAINDER-INVENTORY-COMPLETE.md): R03, R04 and R07. Assessment baseline is `b1a937fe4cb1a179cec315c0b49ec4e384e52161`; verified R-A runtime source is `ef091875`, published release view `4891f5e7`.

All three packages can use existing approved contracts. No new owner decision or schema proposal is needed. This assessment neither implements them nor marks their four blockers remediated. It does not reopen the completed 32/32 inventory.

## Contract/schema assessment

| Field | R03 | R04 | R07 |
|---|---|---|---|
| BLOCKERS INCLUDED | B56 | B42 | B46, B57 |
| CANONICAL OWNER | A15 canonical StaffSchedule action | A23 OperationalWorkItem; A29/A31 fact/projection read boundaries | B35 canonical bulk marketing; P405 subscription eligibility |
| EXISTING FOUNDATION SUFFICIENT | YES | YES | YES |
| BUSINESS DECISION REQUIRED | NO | NO | NO |
| SCHEMA REQUIRED | NO | NO | NO |
| NEW MODELS | 0 | 0 | 0 |
| NEW FIELDS | 0 | 0 | 0 |
| NEW ACTION CLASSES | 0 | 0 | 0 |
| MIGRATION REQUIRED | NO | NO | NO |
| BACKFILL REQUIRED | NO | NO | NO |
| RUNTIME-ONLY | YES | YES | YES |
| DEPENDENCIES | R02 | R02 | R02 |
| DEPENDENCIES SATISFIED | YES | YES | YES |
| READY FOR IMPLEMENTATION | YES | YES | YES |
| READY FOR PRODUCTION | NO | NO | NO |
| IMPLEMENTATION THIS STAGE | NOT STARTED | NOT STARTED | NOT STARTED |

## Bounded implementation direction and permanent ratchets

**R03 — [full assessment and evidence](evidence/package5-remainder-e2-r03-assessment.md).** Replace native schedule mutation with the existing `update_external_staff_schedule_day` command/approval/Action Engine path, or a fail-closed handoff to its authenticated surface. Retire Python direct schedule PUT and history/private-boolean confirmation as authority. R02 does not mint a Maya session for native Telegram updates. Preserve exact Staff/tenant/branch/day, expected revision, immutable slot intent and existing succeeded/not-executed/still-unknown reconciliation. The permanent guard must trap the actual Python tool and provider leaf, including alias/delegation bypasses and adversarially reintroduced writes. Existing A15, R02 and R10 tests remain mandatory.

**R04 — [full assessment and evidence](evidence/package5-remainder-e2-r04-assessment.md).** Converge supported task commands to A23 `create_operational_task`, `complete_operational_task` and `request_administrator_contact`. Completion remains exact-assignee-only `OPEN → COMPLETED`. Retire the parallel mutable owner journal, read-time evaluation/DDL, autonomous task mutation, generic job launch and legacy assignment fanout. Unsupported transitions/role assignments are rejected, not implemented as a new contract. Keep historical journal data read-only without fabricated bindings. The permanent guard covers writers, reads, indirect/model/scheduler entry points and deployed UI wiring. B49/R06 delivery and B58/R12 conversation ownership remain separate known remainders; this adds no new dependency.

**R07 — [full assessment and evidence](evidence/package5-remainder-e2-r07-assessment.md).** Converge supported owner-reviewed manual campaigns to existing B35 preview → exact reviewed confirmation → same durable campaign resume. R02 staff authority is not campaign approval. Unapproved automatic/manual reactivation, cycle and renewal sends and legacy sent/reminder markers fail closed. Resolve explicit canonical Client selection; never broaden an unresolved targeted audience to all Clients. P405 remains the sole subscription eligibility/value authority. Preserve optional Maya User, consent/preferences, frozen routing, per-recipient identity, UNKNOWN and partial resume. The permanent guard covers actual producer/dispatcher/sender closure, including the known birthday exclusion without activating it.

R07 must use the hash-matched production producer evidence. Canonical `subscriptions.py` contains P405 tombstones absent from the already inventoried live version; R-A deliberately preserved that production file. The assessment records exact hashes and the existing B57 early-return/unchanged-usage path. This is not a new surface or new blocker. Test both canonical source and the composed deployment view so a local tombstone cannot mask a live bypass.

## Execution and verification order

1. Implement R03/R04/R07 as independent owner packages after the separate implementation instruction, with their own targeted authorization, idempotency/restart/UNKNOWN or read-purity proofs and permanent ratchets. No repeated contract approval is required for the decisions above.
2. Coordinate shared `bot.py`, `webhook_server.py` and native/provider integration hunks explicitly. Retain R01/R02/R10 invariants and each package's exact master membership; do not absorb other known remainder owners.
3. After all package-local acceptance passes, run the coordinated wave's ratchets, lint, both typechecks, build, schema/pending-migration checks and mandatory backend regression; then use the documented production cutover and structural/read-only verification. No production effects for proof.
4. Decision-gated E3 remains R05/R06/R08/R09/R11/R12/R13/R14 with its existing dependencies/approvals. It may overlap E2 after each package's decisions; E2 is not an invented global dependency. No E3 contract or schema is chosen in this report.
5. Run the full Package 5 Final Gate only after all 14 remediation packages have production PASS. Preserve B36 schema APPLIED, runtime NOT DEPLOYED, and its two known proof defects within R05.

## Consolidated status

```text
R03 STATUS: ASSESSED — READY FOR IMPLEMENTATION
R04 STATUS: ASSESSED — READY FOR IMPLEMENTATION
R07 STATUS: ASSESSED — READY FOR IMPLEMENTATION
DECISIONS REQUIRED FROM OWNER: 0
SCHEMA PROPOSALS REQUIRED: 0
PACKAGES READY FOR IMPLEMENTATION: R03, R04, R07
PACKAGES READY FOR PRODUCTION: NONE
BLOCKERS ASSESSED IN E2: 4/24
BLOCKERS REMEDIATED IN E2: 0
REMEDIATION PACKAGES ASSESSED CUMULATIVE: 6/14
REMEDIATION PACKAGES COMPLETE: 3/14
TOTAL BLOCKERS REMEDIATED: 6/24
REMAINING BLOCKERS: 18/24
PACKAGE 5 FINAL GATE RUN: NO
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
CHAPTER 7 STARTED: NO
ASSESSMENT RUNTIME/SCHEMA/MIGRATION/DEPLOYMENT CHANGES: 0
ASSESSMENT TESTS/DATABASE CONNECTIONS/PRODUCTION READS: 0/0/0
PRODUCTION MUTATIONS/MESSAGES FOR PROOF: 0
PROCESS HYGIENE: 0
```

This report and the three package assessments are documentation only. Historical inventory, protected main dirty worktree and the 17 old databases remain untouched. [Current progress ledger](evidence/package5-remainder-remediation-progress.json) separately records REMEDIATED status without rewriting historical findings. STOP after report/evidence commit and push.
