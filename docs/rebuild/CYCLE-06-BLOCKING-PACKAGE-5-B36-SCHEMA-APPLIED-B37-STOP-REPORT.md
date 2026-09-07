# Package 5 — B36 schema applied; runtime WIP; new B37 STOP

**STOP at a newly confirmed staff-expense authority/business boundary. B36
runtime is not deployed and is not declared complete.** The finding occurred
during the required B36 inventory of all scheduled/background communication,
**before** runtime deployment and the later full 13-family Final Gate. It must
not be represented as a post-B36 production Final Gate result.

The user's B36 owner, schema and channel-order approvals remain accepted.
Nothing in this STOP reopens INBOX → TELEGRAM → APNS or requires approval again
for already approved daily-report semantics. The user explicitly required STOP
for a genuinely new schema/business/security blocker.

## B36 state that must be preserved

Schema checkpoint **`d7794b31`** was committed/pushed after PostgreSQL proof,
actual database restart, clean replay of 83 migrations, targeted tests, lint,
both typechecks, build, schema/drift checks and **383 suites / 3139 tests PASS**.
The [schema mapping](package5-b36-schema-mapping-v1.md) has one OwnerReportRun,
14 persisted fields, zero new action classes and no historical backfill.

The authorized additive migration
`20260907180000_b36_owner_report_run` was applied in production. Its immutable
SHA-256 is `3572d6327a1f24f055370d44004c6ddfdebdfcc6746d3a2fbb33a14955a676f0`.
[Apply report](CYCLE-06-BLOCKING-PACKAGE-5-B36-PRODUCTION-SCHEMA-REPORT.md),
[fresh STOP read-only verification](evidence/package5-b36-stop-production-schema.json):
zero pending migrations, no drift against the new schema, zero OwnerReportRun
rows, zero populated execution bindings, health/readiness 200.

Active runtime remains the accepted B35 release
`/opt/maya-saas/releases/20260907-p5-b35-c8c7a8eb`; neither service was restarted.
B35 bulk remediation is not reopened. The current production baseline consists
of that runtime plus the explicitly approved additive B36 schema.

Local runtime work is saved as **WIP**, not a deployment candidate:

- OwnerReportsService admits/reloads the frozen root and slots, with sequential
  per-recipient execution and independent recipient continuation. It no longer
  uses any Inbox receipt as whole-report completion.
- Communication Delivery resolves the saved root/slot, then rechecks current
  authority and predecessor outcomes. Generic daily-report routes reject before
  execution. The Python daily job becomes an integration-bound trigger only.
- Existing assistant-preference read logic is shared unchanged; the extraction
  avoids a module cycle and lets admission read preferences in its transaction.
- Targeted report/Inbox/ingress/preferences regression: **11 suites / 96 tests
  PASS**. Both typechecks and full backend lint pass. The final report fixture
  rerun passes 1 suite / 25 tests. Diagnostic/test formatting and typing cleanup
  does not change runtime behavior after the B37 STOP.
- The initial real PostgreSQL + owner/Action Engine/Communication Delivery
  runtime proof **FAILS**: the first concurrent case observes 2 of 8 expected
  synthetic effects. It exposes `campaignIdempotencyKey must be a stable opaque
  code` and transient `TransactionWriteConflict` errors. The generic envelope
  key construction and concurrent continuation need investigation/fixing within
  the already approved B36 semantics. No failure is waived. Runtime restart
  proof, complete new ratchets, build/parity checks and full runtime mandatory
  regression have not completed. **Do not deploy this WIP.**

[Runtime WIP verification](evidence/package5-b36-runtime-wip-verification.json).
The historical schema-gate 383/3139 PASS is not relabeled as a final runtime
gate. The applied migration must not be edited, reset or rolled back to hide
unfinished runtime work.

## B37 — exact production evidence

[Read-only production source/launcher probe](evidence/package5-b37-production-source.probe.py)
and [snapshot](evidence/package5-b37-production-source.json) confirm the active
barbershop-bot process and current-start registration of
`_anton_expense_reminder_job`. The source registers the job as well. Fresh
`bot.py` and `database.py` hashes match the accepted B35 source inventory;
this is a newly discovered bypass in that source, not an unreviewed production
change or a claim that B35 bulk behavior regressed.

| Production boundary | Exact evidence |
| --- | --- |
| Recipient selector | `_bot_anton_chat_id` at production line 6336 reads the legacy `anton_chat_id` setting and has a numeric fallback. It does not establish current canonical User/Membership/tenant authority. No actual recipient value is copied into this report/evidence. |
| Scheduled effect | `_anton_expense_reminder_job` at line 6496 calls `app.bot.send_message(chat_id=ANTON_CHAT_ID, ...)` directly, then adds the raw ID to process-local `_anton_expense_awaiting`. Function SHA: `7a4835f123d48a273232106b82d0d26f58fe490a069bc9fcdfb2d6429024b6ed`. |
| Reply admission | `handle_message` at line 2845 accepts that raw ID/set membership, clears the in-memory flag and calls `_save_anton_expenses`. It has no canonical intake/execution binding. |
| Financial write | `_save_anton_expenses` at line 6412 parses free text and calls `database.add_salon_expense` for the server-local date, then tells the sender that the expenses are already in the owner's report. |
| Storage | `database.add_salon_expense` at line 2184 directly inserts into legacy SQLite `salon_expenses(date,item,amount,source,created_at)`, without canonical tenant/User/Expense/ActionExecution identity. |
| Replacement | `/rashod` at line 6437 checks only the raw ID and invokes `clear_salon_expenses`, whose line-2215 writer deletes the entire legacy date before new input is accepted. |

No production function, job, bot sender, LLM call or business DB mutation was
executed for this evidence. The probe reads source and service/journal metadata
only and excludes raw configuration/recipient values.

## Executable local reproduction

The [local probe](evidence/package5-b37-expense-background.probe.py) verifies the
six selected function hashes and executes their exact deployed source with a
synthetic Telegram transport, synthetic parser result and a fresh SQLite
`:memory:` database. It imports no production application/config and closes
that database before exit. [Result](evidence/package5-b37-expense-background.proof.json):

- First/repeat, concurrent first calls, lost response after simulated dispatch
  and retry produce **6 synthetic Telegram effects**, with zero canonical
  admissions and zero canonical User/Membership/AuthIdentity bindings supplied.
  The timeout leaves no durable UNKNOWN receipt; retry sends again.
- The reply path inserts an expense directly. Repeated identical synthetic
  input creates **2 legacy expense rows**, with zero canonical Expense actions
  or tenant qualification.
- `/rashod` without canonical staff authority deletes both synthetic period
  rows. These are fixture effects only; no claim is made about modifying any
  production row or about actual provider acceptance.

## Why this is a new decision boundary

Existing canonical Expense primitives are available:
`ExpensesController` → `ExpensesService` →
`P407ExpenseCanonicalCutoverService` → `expenses.create.execute.v1` /
`P407ExpenseExecutableService`. They require a canonical authenticated tenant
and actor, feature/role access, typed expense input, intent identity and actor
confirmation. Canonical deletion identifies one expense. The legacy reminder,
process-local reply flag and period-wide replacement do not supply that contract.

The B36 approval is specifically a **daily report** owned by OwnerReportsService,
with a frozen daily period and staff report audience. It does not authorize
selecting the designated expense submitter, converting an unqualified Telegram
reply into a confirmed financial action, or deciding period-wide replacement.
Reusing `OwnerReportRun` for a weekly expense intake would change its approved
business contract and SQL report-type restriction. Simply forwarding the raw
ID to generic A12/A13 transport would preserve the authority bypass.

The separate B37 decision must establish whether to retire this legacy
reminder/intake path in favor of canonical Expense entry, or preserve its
business function through verified staff authority and the existing canonical
Expense action contract. No option, new schema/model/action, historical backfill
or replacement semantics has been chosen automatically. B37 was not fixed.

## Resume requirements and status

After the new B37 boundary is resolved, finish the existing B36 runtime work,
fix its failing PostgreSQL proof, complete all required authorization/order/
UNKNOWN/restart/retention cases and permanent background ratchets, then run the
full mandatory runtime gates. Only a completely green result permits the
documented production runtime deployment and structural/read-only verification.
The fresh full Package 5 Final Gate across all 13 families remains outstanding.

```text
B35 PRODUCTION RUNTIME BASELINE: PRESERVED — PASS
B36 OWNER / SCHEMA / CHANNEL ORDER APPROVALS: PRESERVED
B36 CHANNEL ORDER: INBOX → TELEGRAM → APNS
B36 PRODUCTION SCHEMA: PASS
B36 OwnerReportRun DURABLE IN PRODUCTION: YES — SCHEMA ONLY
B36 RUNTIME: WIP, NOT DEPLOYABLE
B36 RUNTIME POSTGRESQL PROOF: FAIL
B36 PRODUCTION RUNTIME DEPLOYMENT: NOT STARTED
B36 PRODUCTION REMEDIATION: NOT COMPLETE
NEW STOP BLOCKER: B37 — WEEKLY STAFF EXPENSE REMINDER / INTAKE AUTHORITY
B37 REMEDIATION: NOT STARTED
PACKAGE 4 COMPLETE: YES — ACCEPTED BASELINE, NOT A NEW GLOBAL RECHECK
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY: 13/13 — FRESH FINAL GATE NOT RUN
PACKAGE 5 COMPLETE: NO
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
CHAPTER 6 COMPLETE: DO NOT DECLARE
PRODUCTION REAL MESSAGES / BUSINESS / PROVIDER MUTATIONS FOR PROOF: 0 / 0 / 0
FAKE HISTORICAL BACKFILL: 0
```

The [final hygiene receipt](evidence/package5-b36-b37-stop-hygiene.json) confirms
24 main dirty entries/content hashes preserved, 17 old DBs untouched, all three
owned B36 DBs/the cluster and production staging removed: process hygiene **0**. Report,
evidence and explicit WIP checkpoint → commit/push → **STOP**.
