# Package 5 remainder — E3 consolidated Stage 1 assessment

**Wave R-B is production PASS; the next dependency-eligible group is R05, R06, R08, R09, R11, R12, R13, R14.** Eight package Decision Sheets are prepared. Their recommendations are **proposals, not approvals**. No E3 runtime, schema, migration, tests, database proof or deployment was performed.

The [R-B production report](CYCLE-06-PACKAGE-5-WAVE-R-B-IMPLEMENTATION-PRODUCTION-REPORT.md), committed at `e2279392`, records R03/R04/R07 PASS and cumulative **10/24 blockers, 6/14 packages**. Verified production is release `/opt/maya-saas/releases/20260907-p5-rb-cb4fb27c`, clean release view `6ad559c3`, based on canonical runtime source `42962475` with the documented B36 WIP exclusion. The assessment reads repository contracts and the already captured, hash-matched production variants; it does not equate all canonical B36 WIP with deployed code.

Exact package membership and dependencies remain the [closed 32/32 master inventory](CYCLE-06-BLOCKING-PACKAGE-5-EXHAUSTIVE-REMAINDER-INVENTORY-COMPLETE.md). No new surface, Bxx ID, package or discovery cycle is introduced. Fourteen known blockers remain: nine decision-requiring blocker rows are grouped into **eight owner decisions**, because R11 resolves B51/B59 under one governed-configuration contract.

## Package decisions

Every row recommends **Option A** with a bounded supported contract, and offers **Option B** that retires the disputed behavior with explicit business losses and no new schema. No Option C is necessary. For the **recommended whole-package A**, existing foundation sufficient = **NO**, business decision = **YES**, schema/migration = **YES**, backfill = **NO**, runtime-only = **NO**. Technical integration prerequisites are **satisfied**; complete dependencies are **not satisfied until the package decision is approved**, plus R05's existing internal B36 proof-before-extension boundary. None of these whole packages is currently implementation/production-ready under an unapproved new contract.

Counts are proposed additions, not implemented changes. “Fields” means persisted columns across new and existing models; virtual Prisma relations and constraint-only changes are listed separately in each sheet. Action totals include **AE classes + explicitly named AC6 retention classes**. Existing execution/attempt/lease owners are reused.

| Package / Decision Sheet | Exact blockers | Canonical owner and recommended A direction | Models | Fields | AE + AC6 classes |
| --- | --- | --- | ---: | ---: | ---: |
| [R05](package5-remainder-e3-r05-decision-sheet.md) | B36, B43 | Existing OwnerReportRun/A12; extend its CHECK and encrypted manifest for finite owner/staff morning reports. B36 daily contract unchanged. | 0 | 0 | 0 + 0 |
| [R06](package5-remainder-e3-r06-decision-sheet.md) | B44, B45, B48, B49 | Existing producer/CD owners; new OperationalAlertRun only for canonical shift and wanted-interest Inbox plans. Other B44 delivery is explicitly retired. | 1 | 14 | 0 + 1 |
| [R08](package5-remainder-e3-r08-decision-sheet.md) | B47 | Native feedback request/revision owner, exact Client/Appointment binding; existing AE/CD slot bindings. Separate from B34 external reviews. | 2 | 41 | 3 + 1 |
| [R09](package5-remainder-e3-r09-decision-sheet.md) | B52 | Anonymous community source facts plus canonical human moderation. Reuse AE/ActionTargetMutation history; no second moderation journal. | 2 | 36 | 2 + 1 |
| [R11](package5-remainder-e3-r11-decision-sheet.md) | B51, B59 | A22 tenant configuration revisions and distinct personal staff Telegram mute in existing DashboardPreference. | 1 | 12 | 2 + 1 |
| [R12](package5-remainder-e3-r12-decision-sheet.md) | B53, B58 | Tenant team-message/private-attachment owner and existing AE/CD; Inbox-only notification. B53 erasure retirement unchanged. | 2 | 46 | 4 + 2 |
| [R13](package5-remainder-e3-r13-decision-sheet.md) | B37 | P407 plus immutable weekly reminder root and minimal source-event → existing approval binding; existing R10 receipts. | 2 | 30 | 0 + 1 |
| [R14](package5-remainder-e3-r14-decision-sheet.md) | B55 | Append-only human cash declaration/correction, distinct from Expense and provider accounting. | 1 | 18 | 2 + 1 |
| **Proposed A total** | **14 remaining blockers** | **8 package decisions** | **11** | **197** | **13 + 8 = 21** |

All eight A proposals require migration approval; R05 has **zero new fields/models but a forward constraint migration**. The others add their explicitly mapped models/columns/constraints. No migration or fake historical backfill is performed by this assessment. Nine proposed columns are on existing ActionExecution; the other 188 belong to the eleven proposed new models. Shared exact-Membership constraints must be applied once, not duplicated independently.

## What each recommendation changes for the business

- **R05:** morning reports remain; duplicate legacy growth/director pushes converge or stop. Arbitrary-period raw-SQL PDFs and Telegram document delivery become authorized snapshot/static-help downloads. B36's existing order is not reopened.
- **R06:** only the two finite B44 canonical occurrences retain Inbox delivery. Raw founder/GOD/dual-role, unresolved lead/waitlist, community and retired staff-request notifications stop. Existing B45/B48/B49 approved appointment/work/marketing delivery contracts retain their own routes.
- **R08:** private feedback requires verified Client authority and proven canonical attendance. Unverifiable/internal appointments without that fact are ineligible. Legacy callbacks/next-message capture stop; invitation consent, explicit response/correction/withdrawal and per-recipient retry become durable. Client without Maya User remains supported.
- **R09:** guest submissions stay anonymous; model auto-publication/brand replies and direct owner Telegram alerts stop. Humans moderate through a durable read queue. Legacy unprovable comments/counters do not become canonical public content.
- **R11:** tenant guidance/provider choice cannot affect other tenants or grant platform authority; secrets remain outside these commands. Personal mute is bounded Telegram-only suppression with fixed policy exemptions, not tenant policy or Client consent.
- **R12:** team conversation/media remain, with private authorized reads and explicit lifetime/withdrawal. External notification fan-out, automatic MAYA team replies and in-place editing stop. Unattributed historical media/messages are not promoted.
- **R13:** weekly reminders require opt-in and exact verified route; each expense requires its existing canonical approval card. Free-text direct ledger writes, date-wide replacement and arbitrary next-message intake stop. Partial confirmation stays partial.
- **R14:** a human branch/day cash observation remains available with immutable correction. The unsupported second cash value and false reconciliation disappear. No opening balance, payment-method attribution or Expense/provider cash mutation is inferred.

The full sheets specify canonical authority, immutable fingerprints, first/retry/changed/concurrent semantics, UNKNOWN/reconciliation, lifecycle, schema mapping, alternatives, complete known-path dispositions and permanent ratchets. Selecting A means approving those stated restrictions and retention choices. A does not silently preserve every legacy behavior. Selecting B requires an explicit business choice; implementation must not choose retirement merely to avoid schema work.

## Already approved work and execution order

**Five remaining blocker subscopes already have sufficient approved contracts:** B36 runtime defect repair within R05; B45/B48/B49 convergence within R06; B53 erasure retirement within R12. They require no repeated owner/schema approval. This assessment marks them ready and does not implement them. No remaining whole package is runtime-only, because each also contains a decision-gated member.

**B36 SCHEMA: APPLIED; B36 RUNTIME: NOT DEPLOYED; PROOF DEFECTS: IDEMPOTENCY KEY + CONCURRENT WRITE CONFLICT.** Its owner/schema/INBOX → TELEGRAM → APNS decisions remain approved. No second B36 schema is proposed. Its repair/proof must precede acceptance of R05's B43 extension; it is not an extra dependency for the seven unrelated packages.

1. Review the eight package sheets in parallel and approve each chosen contract/schema as a package. R01/R02 integration dependencies are already production PASS. R-A/R-B need not be reopened.
2. Begin approved package work independently with explicit ownership of shared schema/registry/Python/PHP hunks. R05 first repairs/proves B36 before extending it. The five already-approved subscopes can be prepared without choosing their package's unapproved behavior.
3. Coordinate shared ActionExecution binding additions, the single exact-Membership constraint, A22 preference namespaces and finite AC6 policy extensions. R11 staff Telegram mute is a shared eligibility checkpoint for R05/R06/R12/R13 where applicable; it cannot reopen UNKNOWN/terminal slots, expand a plan or create fallback. Inbox-only proposed R06/R12 plans remain Inbox-only. This coordination adds no new master dependency.
4. Each package must pass its own authority/idempotency/real local PostgreSQL/restart/lifecycle proof and permanent actual-source ratchet. Preserve production-only known variants through bounded overlays. New schema requires documented migration proof/clean replay/preflight. Combine completed approved packages into coordinated cutovers only after their aggregate mandatory gates pass; production proof remains structural/read-only with zero real business/provider/message effects.
5. Run the full Package 5 Final Gate **once after all 14 packages have production PASS**. Chapter 6 still needs its separate final acceptance cycle. No Chapter 7 work is started.

## Consolidated state

[Machine-readable E3 summary](evidence/package5-remainder-e3-stage1-summary.json) cross-checks all package memberships, model/column/action counts and proposal fingerprints. [Documentation verification](evidence/package5-remainder-e3-documentation-verification.json) records the checks and protected scope. [Progress ledger](evidence/package5-remainder-remediation-progress.json) preserves historical inventory and records the six remediated packages separately.

```text
REMEDIATION PACKAGES ASSESSED CUMULATIVE: 14/14
REMEDIATION PACKAGES COMPLETE: 6/14
REMEDIATION PACKAGES REMAINING: 8/14
TOTAL BLOCKERS REMEDIATED: 10/24
KNOWN REMAINING BLOCKERS: 14
NEXT ELIGIBLE PACKAGES: R05, R06, R08, R09, R11, R12, R13, R14
NEXT PACKAGES REQUIRING OWNER DECISION: R05, R06, R08, R09, R11, R12, R13, R14
NEXT PACKAGES REQUIRING SCHEMA APPROVAL: R05, R06, R08, R09, R11, R12, R13, R14
PACKAGE DECISION SHEETS: 8
SCHEMA PROPOSALS: 8 — recommended A
WHOLE PACKAGES READY FOR IMPLEMENTATION: NONE — proposed contracts await approval
ALREADY APPROVED RUNTIME SUBSCOPES READY: B36, B45, B48, B49, B53
PACKAGES READY FOR PRODUCTION IN E3: NONE
NEW DISCOVERY / INVENTORY REOPEN / NEW BXX: NO / NO / 0
E3 RUNTIME / SCHEMA / MIGRATION / TEST / DEPLOYMENT CHANGES: 0 / 0 / 0 / 0 / 0
PACKAGE 5 FINAL GATE RUN: NO
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
CHAPTER 7 STARTED: NO
PRODUCTION MUTATIONS/MESSAGES FOR PROOF: 0
PROCESS HYGIENE: 0
```

Report/proposals → commit/push → STOP. Protected main 24 dirty entries and the 17 old databases remain untouched.
