# Chapter 7 — Wave 3 interrupted release and preserved work

Status: **WORKTREE RESTORATION REQUIRED / WAVE 3 NOT DEPLOYED**. This is an external workspace interruption, not a new Chapter 7 design decision. The sender of SIGTERM and the actor that removed the worktree have not been established.

## Certified progress

P01 source-owner Option A is implemented and deployed. P02/P05 are deployed. Production remains `20260908-c7-wave2-4b03a29c`: **10/22 requirements, 3/6 packages, 2/4 waves**. P03/P04 are locally accepted, not production accepted. P06 has only bounded read preparation; Chapter 7 is not complete and Chapter 8 has not started.

P03 and P04 package commits `b41859b0` and `c27b9399`, shared integration `6de3ec6a`, and the proof-only lint correction `0e57f652` are all ancestors of current upstream `2e7de86db0871bbd30e35cbfda710f674d0c7457`. No committed Wave 3 work was lost. The shared [report](CYCLE-07-WAVE-3-P03-P04-REPORT.md), package reports, proofs, ratchets and migration are preserved in Git. The approved schema envelope remains one model / 37 physical fields / one applied migration / zero backfill; Wave 3 adds no schema.

## Exact interruption

The first release attempt failed at a proof-only lint error, corrected in `0e57f652`. The second attempt passed Prisma validation, lint, application typecheck and scripts typecheck. During full mandatory Jest regression the process received SIGTERM (15). There is no final mandatory regression result; it must not be recorded as PASS or as a demonstrated assertion failure. The deploy script exited before upload, build/canary/activation were not reached.

At the subsequent filesystem check `/tmp/maya-b29-contour` no longer existed and was absent from `git worktree list`. Its previous working branch was `contour/b29-remediation`. The protected main checkout is not a replacement execution workspace. No worktree has been recreated, and no reset/revert/stash/clean/force-push has been performed.

The owner's original repository instruction explicitly requires confirmation before creating a replacement when this worktree is absent. Execution is therefore paused for restoration authorization. This does not request another schema/product approval.

## Late upstream: exact static review

`0e57f652 → 2e7de86d` changes exactly three files:

| File | Change | Intersection |
|---|---|---|
| `сайт и приложение/app.html` | Existing login gate exposes a Telegram/Yandex OAuth bridge. In SaaS tenant context the native Telegram control clears the local legacy login state, invokes the canonical bridge, or fails closed while unavailable. Outside SaaS context the existing compatibility handshake remains. | Existing PWA/native authentication surface; eventual P06 consumer integration. |
| `maya-saas-backend/src/auth/native-owner-telegram-login.pwa.spec.ts` | Four tests for canonical tenant login, loading failure, existing non-SaaS compatibility and bridge wiring. | Mandatory auth/PWA regression; these new tests have not been executed in this cycle. |
| `ai администратор/config.example.py` | Example APP_URL points to canonical tenant entry. | Example configuration only; no claim about live configuration. |

Static diff contains no backend runtime, schema, migration, measurement source, consent writer, Action Engine executor or delivery writer change. It does not modify P03/P04 files or the approved C7 envelope. No new production surface or contract contradiction is established by this static review. **Combined baseline certification is pending targeted auth/PWA regression and live PWA artifact verification**, not inferred from the commit title. No upstream content is reverted or overwritten.

## Proofs preserved and remaining gates

- P03: 38 package tests and 10 executable PostgreSQL scenarios PASS.
- P04: 38 package tests and 9 executable PostgreSQL scenarios PASS.
- Combined package suite: 14 suites / 201 tests PASS. Adjacent guards: 4 suites / 34 tests PASS.
- Clean replay of 94 repository migrations and local schema drift check PASS; no new Wave 3 migrations.
- Q13 positive exact-capacity calculation has deterministic fixture coverage; real B31 source without AgentTask/Opportunity lineage remains NOT_MEASURED. External CRM outcomes without exact namespace evidence remain uncredited. These limitations remain explicit.
- Full mandatory Wave 3 regression: **INTERRUPTED / NOT CERTIFIED**. Build, canary, activation and Wave 3 production verification: NOT RUN.
- Preserve package proof receipts. After workspace restoration: inspect the then-current upstream, run its affected auth/PWA/authority ratchets, rerun the interrupted mandatory gate, then follow the unchanged approved release process. Do not rerun an unrestricted inventory or reopen approved C7 decisions.
- After Wave 3 production PASS, continue P06 with [bounded preparation](evidence/chapter7-wave3-interruption/p06-read-preparation.md), then the frozen final Chapter 7 gate. Preparation is not acceptance or implementation.

## Read-only production verification after interruption

The [structural receipt](evidence/chapter7-wave3-interruption/production-after-interruption.txt) verifies the same Wave 2 backend release, 14 compiled artifact hashes, MeasurementRevision's 37 columns / 16 checks / 8 FKs / 4 trigger bodies, zero measurement rows, the approved migration, pending migrations 0, drift NONE, and health/readiness PASS. Repository migration count 94; production applied count 97 includes the three previously approved historical entries. No backend upload/activation or additional production migration occurred. Live PWA certification for the late commit is outstanding.

Production business/provider/message mutations for proof: **0**.

## Preservation and hygiene

The protected main checkout's **24 entries and 22 file hashes** are unchanged. The 85 protected historical migration/inventory hashes were checked against upstream Git objects because the isolated worktree was absent. Main HEAD and index are not used for this report commit: the documentation is assembled with a separate temporary Git index against the upstream tree, preserving every upstream file and the main checkout/index.

The owned synthetic PostgreSQL database was dumped, its archive validated, then that exact database was dropped and its exact owned cluster stopped. No pre-existing database was touched. Dump: `work/chapter7-wave3-p03-p04/wave3-synthetic-proof-final.dump`; SHA-256 `4bc60766a5d72112e3341b4328f66b54d8a2d018e634032a4f0cceaaf7635656`. The dump and original logs remain in the task workspace; no synthetic database rows enter Git.

OWNED TEMP PROCESSES: 0  
OWNED WATCHERS: 0  
OWNED BROWSERS: 0  
OWNED TEMP DATABASES: 0  
PRE-EXISTING DATABASES TOUCHED: 0  
MAIN DIRTY WORKTREE TOUCHED: NO  
PROCESS HYGIENE: 0

## Resume boundary

Restore an authorized isolated workspace from the then-current canonical origin, preserving the pushed P03/P04 work and upstream login change. Verify affected compatibility before any Wave 3 cutover. A replacement worktree needs the owner's confirmation under the original workspace instruction; approved C7 contracts do not need reapproval.

P01/P02/P05 PRODUCTION: PASS  
P03/P04 LOCAL: PASS  
P03/P04 PRODUCTION: NOT DEPLOYED  
CHAPTER 7 REQUIREMENTS COMPLETE: 10/22  
CHAPTER 7 PACKAGES COMPLETE: 3/6  
CHAPTER 7 WAVES COMPLETE: 2/4  
COMBINED BASELINE CERTIFIED: NO — late PWA compatibility unverified  
CHAPTER 7 FINAL GATE RUN: NO  
CHAPTER 7 COMPLETE: NO  
CHAPTER 8 STARTED: NO
