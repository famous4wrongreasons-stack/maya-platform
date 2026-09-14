# R13 — expense reminder and immutable expense intake Decision Sheet

**PROPOSAL — NOT APPROVED. E3 Stage 1; documentation only.** Baseline `60e82664`, production runtime `42962475` after accepted Wave R-B. Scope is fixed by the [complete master inventory](CYCLE-06-BLOCKING-PACKAGE-5-EXHAUSTIVE-REMAINDER-INVENTORY-COMPLETE.md) and its [machine-readable package definitions](evidence/package5-remainder-inventory-final.json). No new discovery, runtime/schema/test implementation, DB access, production call or deployment occurred in this assessment. B36 remains applied schema / runtime not deployed, with its two known proof defects unchanged.

Counts below are **new persisted database columns, including columns in new models**. Prisma virtual relation properties are listed separately and are not counted as columns. New action totals include separately named AE and AC6 classes. Contract/enum additions to an existing class are explicit proposals, not implicit approval. Option B counts are all zero and require no migration/backfill; it retires the package's legacy behavior instead of preserving it.

## Options and recommendation

| Option | Contract | New models / DB columns / action classes | What user/business loses |
| --- | --- | --- | --- |
| **A — RECOMMENDED** | Expense-domain weekly reminder root + small verified source-to-existing-approval bindings. Reuse A13/CD for delivery and P407 + existing AI approval/R10 receipt for each confirmed expense. | **2 / 30 / 1**: 0 AE + 1 AC6 | No unconfirmed free-text ledger write, whole-day replacement or arbitrary next-message intake. Telegram v1 is limited to currently authorized owner/business-owner roles; each expense needs its own exact card. Weekly reminders require explicit opt-in and verified route. |
| B | Retire the reminder, `/rashod` legacy writes and next-message interception. Use existing canonical Expense UI/HTTP only. | **0 / 0 / 0** | Weekly prompts and Telegram expense intake disappear. Existing canonical expense create/delete/period-declaration remain available under their own rules. |

**WHY A:** the current ActionExecution/Communication Delivery kernel is sufficient for one admitted delivery, and P407 is sufficient for a confirmed expense. They do not own the weekly audience or prove which authenticated incoming message selected which immutable approval. Two bounded records close those gaps without adding an expense ledger, approval state machine or execution lifecycle. The earlier [B37 proposal](package5-b37-owner-contract-schema-proposal.md) was unapproved and left field allocation open. R10 has since repaired its historical wrapper crash gap; this proposal explicitly reuses that deployed receipt foundation.

## Exact reminder contract proposed for approval

`Expenses` domain owns `ExpenseReminderRun`; the scheduler is only an initiator. Type `weekly_expense_reminder/v1`, **A13 `deliver_business_alert` / operational_single**, Telegram-only, one verified route per eligible recipient. Add this typed A13 mapping; do not assume that accepting an opaque messageType already grants the business contract. B36 OwnerReportRun is limited to daily reports/A12 and must not be extended, duplicated or deployed here.

Audience: exact tenant, current active User/Membership, existing AI expense-write role `tenant_owner` or `business_owner`, current expense feature/access/AI policy, and explicit personal opt-in. Store opt-in by extending existing A22 `update_assistant_preferences` with allowlisted `weekly_expense_reminders` in `DashboardPreference(section='assistant').configJson.enabled_capabilities`. **Absent means OFF** even where other assistant capabilities have defaults; existing preferences do not imply consent. This is an explicit business/enum extension requiring this approval, with no new preference model or action class. It cannot grant expense authority. A22 receipts record opt-in; eligibility checks the current exact membership. Only one verified AuthIdentity route for the exact User/tenant is admissible; missing/ambiguous identity is ineligible, never replaced by a raw chat ID.

Schedule: Sunday 20:00 in the canonical tenant IANA timezone. Period is that Monday through Sunday; reminder requests unrecorded expenses **to date**, not a false completed week. UTC boundaries and timezone are frozen before admission. Expiry is midnight at the Monday following period end plus seven local calendar days, converted once to UTC. First-admission window is Sunday **20:00 inclusive to 21:00 exclusive** in that tenant timezone; a missing run outside this finite window is skipped, with no retrospective catch-up. An already admitted run may resume until its fixed expiry. First admission freezes sorted User/Membership/AuthIdentity recipients, exact route references, message content/version, slot keys and expiry. An empty audience still admits an empty immutable run; new opt-ins do not expand that week on retry.

A scheduler retry first looks up the logical weekly identity and loads its frozen winner before recomposing audience, content, timezone or routes. Current opt-ins/devices/code defaults cannot turn resumption into a new plan. An explicit caller-proposed changed intent under an existing identity still conflicts; loading the winner is not permission to accept changes.

Run logical identity is `(tenant, weekly_expense_reminder, startLocalDate, endLocalDate)`, deliberately independent of content/version. Same identity/same manifest returns the same run; changed content, version, recipient, route, timezone or expiry conflicts. A new code version cannot create a second reminder for the same week. Root and all A13 executions commit atomically before any delivery effect; no late attachment or new slot after admission. Deterministic order is by immutable slot key, one Telegram slot per recipient; independent recipients may continue separately.

Slot key v1 is the domain-prefixed hash of tenant, type, week dates, canonical recipient User, exact AuthIdentity and TELEGRAM; it is computed once from the admitted plan. Execution references are fixed before admission and serialized into the manifest, never derived from a retry timestamp or result.

Current authority/opt-in/route revocation and the proposed R11 personal staff Telegram mute are checked again before an undispatched effect; revoked recipients are not replaced. The R11 consumer is a shared eligibility integration checkpoint, not a new master dependency or an exemption created by opting in. Confirmed slots skip, pending eligible slots continue, deterministic terminal failure remains terminal. UNKNOWN remains on the same A13 ActionExecution/attempt and existing bounded reconciliation/manual-required path; Telegram provides no assumed reliable readback. No blind resend, cross-channel fallback, route reselection, or new version to escape UNKNOWN. Reply arrival itself is not delivery-success proof. The root has no status/counter/lease: its progress is projected from existing executions.

## Exact native intake contract proposed for approval

Authenticated integration + R02 verified staff principal establishes tenant/User/Membership/AuthIdentity before accepting text. A secret/company ID or chat ID alone never supplies human authority. A reply must reference that recipient's admitted reminder via exact verified provider message correlation or an opaque server context handle bound to the same User/tenant/slot. The handle is context, not bearer permission. Forwarded/unrelated/expired replies are rejected. If UNKNOWN leaves no trustworthy message reference, require explicit authenticated context selection; never infer the last chat. Standalone `/rashod` has an explicit authenticated source-event identity and no reminder link; it does not arm a process-local next-message flag or delete any data.

The initial parse is a pure candidate step, with existing PII restrictions; no raw personal data is sent to a model. Missing exact date/category/amount/branch must be clarified before admission, not assigned server today. After deterministic server validation/normalization, freeze **1..10 complete single-expense cards** as one source-event admission bundle. Each card uses existing `AiApprovalRequest` encryptedArguments/payloadHash and normal 10-minute approval TTL; list membership is not approval. All source bindings + existing approval rows are committed atomically. No ledger effect occurs during draft construction. Existing AI roles remain owner/business-owner; administrator/accountant cannot acquire this narrower AI authority merely because canonical HTTP allows them.

`ExpenseIntakeBinding` is needed only for **verified source provenance and complete bundle membership**: existing approval UUID/hash does not prove bot integration, authenticated message, exact reminder slot, item ordering or original text. It stores those references/hashes and the existing approval FK. It deliberately stores no normalized arguments, expense amount, status, execution ID, result, retry count, lease or completion marker. Existing AiApprovalRequest owns the immutable card and confirmation; AiToolExecution encrypted receipt owns durable binding to the canonical action; ActionExecution/P407 owns the financial outcome. Thus this is an admission alias, not a second intake executor.

Replay looks up all bindings for the qualified source identity **before parsing** and reads their original approval cards. Same authenticated source identity/content uses exactly the admitted bundle. Edited source text under that identity is an explicit `IDEMPOTENCY_CONFLICT`; a fresh deliberate command is a new intent. The content digest is keyed over normalized NFC source text (no transport/trace metadata), not an excuse to hash raw JSON. The stable event digest is keyed over server-qualified bot/integration namespace, tenant, canonical actor and provider chat/message identity; those identifiers never authorize the action. Card UUIDs derive deterministically from that event and immutable item index, independently of amounts or a later model output.

Two initial parsers may produce candidates concurrently, but a tenant/source advisory transaction lock plus unique identity and complete-bundle constraints admits one set; every loser returns the winner's stored bundle without adding/removing/reordering cards. SQL guards require all bundle rows to have the same source/principal/context/hash/count and be inserted in the admitting transaction; a deferred count check proves exactly indices `0..count-1`. No later append is allowed. This removes the need for a third intake-plan/status model. Existing approval and binding insertion need one internal transactional admission adapter using existing validation/approval construction; it is proposed implementation work, not a claim that today's separate API calls are already atomic.

Confirming each card rechecks current authority, card hash and requester. P407 creates exactly one canonical Expense, declaration invalidation, audit and success in its local transaction; R10 durably attaches the existing execution before possible effect. Restart reuses the same approval/receipt/ActionExecution: confirmed cards skip; pending cards await their existing confirmation; expired/rejected cards do not silently gain a new approval. A partial list is honestly partial; no batch-complete assertion and no period completeness declaration. Financial DB uncertainty is resolved by reading the same P407 execution (no provider mutation, `unknownApplicable=false`); delivery UNKNOWN is never reused as expense status. R10's settled/incomplete receipt distinction remains intact after a crash.

Correction means exact-row existing P407 delete, with its current required authority/confirmation, then a separately confirmed new create if wanted. It is not atomic replacement; partial correction remains visible. No date-wide DELETE, silent update or automatic `declare_expense_period_complete`. Reports must read canonical Expense/period declaration projections, preserve incompleteness/unavailable truth, and never add legacy SQLite rows or fixed daily constants as newly accepted ledger facts. This changes B37-owned data inputs; it does not repair or deploy B36 daily-report runtime.

## Exact schema mapping — Option A

**New model `ExpenseReminderRun` — 13 persisted columns.**

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `String / text` | UUID primary key |
| `tenantId` | `String / text` | Exact canonical tenant |
| `reminderType` | `String / text` | weekly_expense_reminder only |
| `periodStartLocalDate` | `String / char(10)` | Monday YYYY-MM-DD |
| `periodEndLocalDate` | `String / char(10)` | Sunday YYYY-MM-DD |
| `contractVersion` | `Int / integer` | 1; includes content/policy normalization version |
| `timezone` | `String / text` | Frozen canonical IANA tenant timezone |
| `intentHash` | `String / char(64)` | Canonical complete immutable manifest hash |
| `intentEncrypted` | `String? / text` | Complete immutable recoverable manifest; purge-only nullable |
| `admittedAt` | `DateTime / timestamptz` | Server admission time |
| `expiresAt` | `DateTime / timestamptz` | Monday following period end +7 local days, converted once to UTC |
| `payloadRetentionUntil` | `DateTime / timestamptz` | Same as expiresAt; holds for live execution/reconciliation apply |
| `auditRetentionUntil` | `DateTime / timestamptz` | Admission +7 calendar years; minimum audit horizon, not deletion permission |

**New model `ExpenseIntakeBinding` — 15 persisted columns.**

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `String / text` | UUID primary key |
| `tenantId` | `String / text` | Exact canonical tenant |
| `actorUserId` | `String / text` | Current authenticated sender, not raw Telegram ID |
| `actorMembershipId` | `String / text` | Exact canonical membership |
| `authIdentityId` | `String / text` | Exact verified Telegram identity for that User/tenant |
| `sourceNamespace` | `String / text` | Non-secret server-bound bot/integration namespace |
| `sourceEventHash` | `String / char(64)` | Keyed digest of authenticated source message identity |
| `itemIndex` | `Int / integer` | Stable zero-based accepted card position |
| `sourceItemCount` | `Int / integer` | 1..10, identical across one atomic source-event bundle |
| `sourceContentHash` | `String / char(64)` | Keyed digest of normalized source text, never raw text |
| `reminderRunId` | `String? / text` | Null for explicit standalone command; otherwise immutable reminder context |
| `reminderSlotKey` | `String? / text` | Paired with run; exact admitted A13 slot |
| `approvalRequestId` | `String / text` | Existing AiApprovalRequest owns normalized arguments, hash and approval |
| `createdAt` | `DateTime / timestamptz` | Server admission time |
| `auditRetentionUntil` | `DateTime / timestamptz` | Admission +7 calendar years; no automatic deletion |

**Existing model `ActionExecution` — 2 added persisted columns.**

| Field | Type | Meaning |
| --- | --- | --- |
| `expenseReminderRunId` | `String? / text` | FK to ExpenseReminderRun(id,tenantId); immutable after admission |
| `expenseReminderSlotKey` | `String? / text` | Stable slot key, paired with run ID; no second delivery lifecycle |

**Total: 2 new models; 30 new DB columns.** New Prisma virtual relations (14, zero columns): `ExpenseReminderRun.tenant`, `Tenant.expenseReminderRuns`, `ExpenseReminderRun.executions`, `ActionExecution.expenseReminderRun`, `ExpenseIntakeBinding.tenant`, `Tenant.expenseIntakeBindings`, `ExpenseIntakeBinding.actorMembership`, `Membership.expenseIntakeBindings`, `ExpenseIntakeBinding.authIdentity`, `AuthIdentity.expenseIntakeBindings`, `ExpenseIntakeBinding.approval`, `AiApprovalRequest.expenseIntakeBinding`, `ExpenseIntakeBinding.reminderExecution`, `ActionExecution.expenseIntakeBindings`.

Run uniques: `(id,tenantId)` and `(tenantId,reminderType,periodStartLocalDate,periodEndLocalDate)`. Constraints enforce type/v1, valid Monday/Sunday seven-day interval and immutable encrypted-manifest hash/retention bounds. ActionExecution adds exactly the two nullable scalar columns above, paired nullability, composite FK `(expenseReminderRunId,tenantId)` and unique `(tenantId,expenseReminderRunId,expenseReminderSlotKey)`. A trigger permits only A13 weekly-reminder executions named in the immutable manifest in the same admitting transaction, and disallows late association/remapping. This is a separate named FK; existing B36 columns/constraints are untouched.

Intake uniques: `(id,tenantId)`, `(tenantId,sourceNamespace,sourceEventHash,itemIndex)` and `(tenantId,approvalRequestId)`. Composite FKs: exact Membership `(actorMembershipId,tenantId)`; AuthIdentity `(authIdentityId,tenantId)`; existing AiApprovalRequest `(approvalRequestId,tenantId)`; optional reminder execution `(tenantId,reminderRunId,reminderSlotKey)` to the new exact ActionExecution slot unique. Reminder context fields are both null or both set. Actor, identity, approval requester/tool/surface and slot recipient must agree. Add shared `Membership @@unique([id,tenantId])` constraint once; it adds no DB column. All new owner/binding FKs use RESTRICT. No rows/links can be rewritten or appended to a committed bundle; the existing approval lifecycle remains mutable only under its own owner.

**Fingerprint and retention.** Reminder hash covers typed normalized tenant, type/version, week dates/timezone/UTC boundaries, expiry, fixed content and sorted per-recipient exact canonical identities/routes/slot requests. A13 executions retain their own normalized intent and provider attempt evidence. Expense intent is the existing card/P407 canonical tuple: tenant/actor, category, integer kopecks, RUB, exact occurred day, canonical branch/null and normalized bounded note; source identity is separately bound, not smuggled into raw arguments. Object key/array ordering, Unicode, dates, nulls and units have a versioned fixed encoding before domain-prefixed SHA-256.

Proposed AC6 class `purge_expense_reminder_payloads` clears only new `ExpenseReminderRun.intentEncrypted` after its fixed deadline and no live lease/pending reconciliation; identity/hash/slot bindings and existing AE/AI retention remain under their owners. Run/binding audit horizon is **7 years minimum**, a proposed product retention choice rather than a legal assertion. This deliberately aligns linked reminder identity with expense intake, replacing the earlier unapproved 365-day run audit suggestion; no automatic row deletion is authorized. Existing AiApproval arguments/results are neither duplicated nor given a new purge permission by this class. Purged/expired contexts cannot reparse or resend. **Migration YES; backfill NO**: two models, two AE columns, exact constraints. No historical messages, old SQLite rows or unprovable executions are manufactured into contexts, approvals or fingerprints.

## Acceptance and permanent ratchet

After approval prove: opt-in default off and current role/feature; exact tenant/route and empty audience; fixed local week/expiry; one concurrent root, atomic full slot admission, restart with same slots; no direct scheduled Telegram, no delivery before admission; UNKNOWN/no alternate route and independent recipients; unrelated/forwarded/revoked/expired reply rejection; standalone command no deletion; same/edited/concurrent source bundles, no late item append, no reparse on restart; per-card confirmation, narrower AI role preserved; crash before/after P407 commit and partially confirmed list; exact canonical expense creator/tenant; no period-complete inference; legacy financial report inputs rejected.

Permanent AST/call-graph ratchet covers scheduler registration, `_anton_expense_reminder_job`, `handle_message`, `cmd_rashod`, `_save_anton_expenses`, database expense helpers and report input readers, plus canonical intake/receipt admission ordering. It must reject aliased/direct Telegram or legacy SQL, next-message state as authority, delete-by-date, receipt attachment after effect, regenerated key/slot/card on retry, and raw-route fallback. Adversarial fixtures mutate actual current producer bodies, including an extra writer before/after valid delegation; source-marker checks alone do not pass. Existing P407, R02, R10, A13/CD and AI approval regressions remain mandatory package proof. This assessment executes no tests or DB proof.

## Evidence and assessment

This assessment uses accepted local source captures, not a new production scan. R-B verification: [production proof](evidence/package5-wave-rb-production-proof.json). Exact per-file hashes and source-view distinction are in [package assessment](evidence/package5-remainder-e3-r13-assessment.json). Current R02 principal checks are acknowledged; legacy raw-principal descriptions in old inventory are not claimed to be unchanged. The remaining owner/write gap is still the same inventoried blocker.

- Captured production `bot.py:4806` — Direct per-item legacy expense insert and server-today stamping.
- Captured production `bot.py:4831` — Current R02 admin check but date-wide deletion remains.
- Captured production `bot.py:4890` — Direct weekly Telegram reminder and process-local awaiting flag.
- Captured production `bot.py:2420` — handle_message consumes awaiting input without durable reply context.
- Captured production `database.py:2155` — Legacy expense insert and date-wide clear.
- Repository `docs/rebuild/package5-b37-owner-contract-schema-proposal.md:1` — Earlier unapproved business proposal; no exact schema allocation.
- Repository `maya-saas-backend/src/expenses/expense-canonical-shadow.service.ts:166` — Existing normalized P407 create identity includes business input.
- Repository `maya-saas-backend/src/expenses/p4-07-expense-executable.service.ts:152` — Existing P407 canonical create execution.
- Repository `maya-saas-backend/src/ai-tools/ai-tool.catalog.ts:909` — Existing owner/business-owner AI expense tool and confirmation policy.
- Repository `maya-saas-backend/src/ai-tools/ai-tool-runtime.service.ts:366` — Existing approval idempotency/argument ownership.
- Repository `maya-saas-backend/src/ai-tools/ai-tool-receipt.service.ts:196` — R10 settled versus partial receipt truth.
- Repository `maya-saas-backend/prisma/schema.prisma:1764` — Existing AiApprovalRequest encrypted intent and unique key.
- Repository `maya-saas-backend/prisma/schema.prisma:3194` — B36 exact daily report foundation, excluded from reuse.
- Captured production `webhook_server.py:4466` — Existing financial report consumes legacy salon_expenses as profit input.

```text
PACKAGE: R13
BLOCKERS INCLUDED: [B37]
CANONICAL OWNER: P407 expense declaration owner plus durable reminder/reply intent owner; A13/CD and R10 own existing execution lifecycles
RECOMMENDED OPTION: A
EXISTING FOUNDATION SUFFICIENT: NO
BUSINESS DECISION REQUIRED: YES
SCHEMA REQUIRED: YES
NEW MODELS: 2
NEW FIELDS: 30
NEW ACTION CLASSES: 1 (0 AE + 1 AC6)
MIGRATION REQUIRED: YES
BACKFILL REQUIRED: NO
RUNTIME-ONLY: NO
TECHNICAL PREREQUISITES SATISFIED: YES (R02 production PASS; existing AE/owner primitives available)
DEPENDENCIES SATISFIED: NO (the package's explicit owner/schema approval is pending)
IMPLEMENTATION READY AFTER APPROVAL: YES
IMPLEMENTATION STARTED: NO
PRODUCTION READY: NO
PRODUCTION MUTATIONS/MESSAGES: 0
DATABASE CONNECTIONS: 0
PROCESS HYGIENE: 0
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
```
