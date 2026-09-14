# Package 5 Wave R-C — approved schema foundation

Owner authorization: accepted checkpoint `0ad0eef2`, all eight Option A decisions in [the Owner Decision Pack](CYCLE-06-PACKAGE-5-OWNER-DECISION-PACK.md). This is a local schema checkpoint inside the authorized implementation wave; runtime acceptance and coordinated production cutover remain pending.

The [exact mapping, migration digests and PostgreSQL evidence](evidence/package5-wave-rc-schema-foundation.json) cover 11 new models, 188 columns in those models and 9 nullable ActionExecution binding columns: **197 new physical fields**. Relations add no physical columns. The approved runtime registry envelope remains 13 Action Engine plus 8 AC6 classes; this schema checkpoint does not claim their runtime acceptance.

| Package | Models | Physical fields | Schema change |
| --- | ---: | ---: | --- |
| R05 | 0 | 0 | Existing OwnerReportRun report-kind CHECK extended forward for the two approved morning plans |
| R06 | 1 | 14 | OperationalAlertRun and its two AE bindings |
| R08 | 2 | 41 | NativeFeedbackRequest / Revision and three AE bindings |
| R09 | 2 | 36 | PublicCommunityComment / Interaction |
| R11 | 1 | 12 | TenantBusinessConfigurationRevision |
| R12 | 2 | 46 | TeamMessage / Attachment and two AE bindings |
| R13 | 2 | 30 | ExpenseReminderRun / IntakeBinding and two AE bindings |
| R14 | 1 | 18 | CashDeclaration |

Nine ordered migrations contain the R05 CHECK extension, shared constraints/functions once, and seven package foundations. No historical migration is edited. No new OwnerReportRun or repeated B36 migration is introduced. FK/unique/CHECK constraints, composite tenant ownership, immutable identity/content, atomic owner receipts and exact AC6 payload claims are verified in a newly created private PostgreSQL cluster. All synthetic historical timestamps belong to expressly manufactured test fixtures, never inferred or backfilled production facts.

Validation: Prisma validation PASS; clean replay of all **92 canonical migrations PASS**; schema comparison **no difference detected**; combined executable PostgreSQL constraints proof PASS. The proof includes conflicting first requests, exact predecessor races, cross-tenant denials, atomic delivery-slot admission, unresolved AE/CD retention holds, claimed payload-only erasure for all eight approved AC6 classes, and deferred feedback/attachment owner receipts. The full existing B36 schema proof also passes against the combined schema.

The existing Prisma pg adapter requires UTC session interpretation for the approved timestamptz columns. New owners use a transaction-scoped UTC setting; production/pool timezone and unrelated runtime transactions remain unchanged. The constraint proof runs with Europe/Moscow as the session default and verifies that the setting does not escape its transaction.

Read-only production preflight observed the accepted R-B release, existing OwnerReportRun with zero rows, no R-C tables, and the previously documented migration ledger state. A fresh compatibility/drift/data preflight remains mandatory immediately before the single coordinated production migration and runtime release. Nothing in this checkpoint authorizes activating incomplete package runtime.

```text
SCHEMA MATCHES APPROVED DECISION SHEETS: YES
NEW MODELS: 11
NEW PHYSICAL FIELDS: 197
UNAPPROVED FIELDS: 0
NEW MIGRATIONS: 9
FAKE HISTORICAL BACKFILL: 0
B36 SCHEMA: ALREADY APPLIED
B36 REPEAT SCHEMA MIGRATION: NO
COMBINED LOCAL SCHEMA PROOF: PASS
PRODUCTION MIGRATION: NOT STARTED
PRODUCTION RUNTIME CUTOVER: NOT STARTED
PACKAGE LOCAL ACCEPTANCE: PENDING
PACKAGE 5 FINAL GATE RUN: NO
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
PRODUCTION BUSINESS/PROVIDER/MESSAGE MUTATIONS: 0
MAIN DIRTY WORKTREE TOUCHED: NO
PRE-EXISTING DATABASES TOUCHED: 0
```

Implementation continues in the same isolated worktree. The private proof cluster remains owned by this active wave and must be removed before its final hygiene claim; no zero-process claim is made at this intermediate checkpoint.
