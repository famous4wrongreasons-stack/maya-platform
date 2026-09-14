# B37 Stage 1 — weekly expense reminder / Telegram expense intent

**PROPOSAL — NOT APPROVED; implementation STOP.** Reconstructed against
accepted checkpoint `7201f7bd`. Fetch completed; isolated
`contour/b29-remediation` HEAD = canonical origin, ahead/behind 0/0,
unpushed 0, dirty 0 before this documentation/evidence change.

This separates two capabilities. Receiving a reminder never grants permission
to create an expense. B35 remains accepted. B36's approved daily-report owner,
schema and INBOX → TELEGRAM → APNS order remain unchanged; its production
schema is applied, but runtime proof is FAIL and runtime is not deployed.

## 1. Exact reconstruction

| Capability | Current flow | Missing boundary |
| --- | --- | --- |
| **B37-A: scheduled weekly reminder** | Python `post_init` registers `_anton_expense_reminder_job`, Sunday 20:00, scheduler timezone Europe/Moscow. Direct `app.bot.send_message(ANTON_CHAT_ID, ...)`, then `_anton_expense_awaiting.add(...)`. | Canonical reminder owner/period, recipient authority, durable admission/plan/receipt; no cross-process idempotency or UNKNOWN preservation. |
| **B37-B: expense create / replacement interface** | `handle_message` tests raw sender + process-local set, discards the flag, then `_save_anton_expenses`. `/rashod` checks the same raw sender, clears the whole legacy date, then accepts inline text or arms that set. | Current staff principal and tenant, action-specific authority, exact reply context, immutable expense intent and replay identity before any write. |

The reminder asks for expenses **this week**. The legacy writer stamps **server
today** on every parsed item, not the expense's actual date. It stores integer
rubles and a free-text item; it does not supply canonical category, exact date,
tenant, actor or confirmation. The next ordinary message from the raw sender
can be consumed: `reply_to_message` is not checked by this path. The successful
Telegram message ID is not saved by this job. `/rashod` is not an existing
canonical update action; it deletes the legacy period before replacement input.

Accepted production evidence is reused, not portrayed as a fresh production
probe: [source/launcher snapshot](evidence/package5-b37-production-source.json),
[exact-source local reproduction](evidence/package5-b37-expense-background.proof.json),
[prior STOP report](CYCLE-06-BLOCKING-PACKAGE-5-B36-SCHEMA-APPLIED-B37-STOP-REPORT.md).
The reproduction established 6 synthetic deliveries, repeated legacy expense
rows and period deletion without canonical admission. Stage 1 makes no new
production calls and opens no database.

## 2. B37-A — communication contract

**Classification: `operational_single`**, a staff/business request to provide
expense information. It is not Client marketing, appointment transactional
delivery or a financial mutation. This is a reconstructed classification;
`weekly_expense_reminder` is not an admitted message type in current runtime.

**Existing canonical weekly-reminder owner: NOT FOUND.** The Python scheduled
function is an initiator. `ExpensesService` owns the relevant business domain;
`OwnerReportsService` owns daily business reports, not expense intake.

**B36 OwnerReportRun reusable: NO.** Exact evidence:

- Applied migration `20260907180000_b36_owner_report_run`, constraint
  `B36_report_contract_check`: `reportType = 'daily_report' AND reportVersion = 1`.
- `OwnerReportPlan` and `normalizeOwnerReportPlan` enforce the same type/version,
  a single local-day range, `daily_brief` policy and daily report content/roles.
- The root's execution binding permits only A12 `deliver_report_briefing`.
  Changing its type, period, preference, recipients or SQL constraint would
  extend the approved B36 business contract. It is not a technical reuse.

**Communication Delivery primitives: sufficient YES; complete B37-A foundation:
NO.** Existing SINGLE envelopes and `ActionExecution`/attempts already provide
leases, protected dispatch, recipient receipts and bounded reconciliation.
They do not define which expense reminder exists or freeze its staff audience.

The existing mapping is exact: A12
`communication.reports-briefings.execute.v1` / `deliver_report_briefing` handles
`daily_report`, `morning_brief`, `growth_plan`; A13
`communication.business-alerts.execute.v1` / `deliver_business_alert` handles
owner/birthday/review/lead alerts. Both allow a scheduler and use
`communication.package2.single`. The generic normalizer's acceptance of an
opaque message type is not an approved weekly-reminder business mapping.

**Proposed mapping, awaiting approval:** an expense-domain reminder planner
(`ExpenseReminderService`, under the existing Expenses module/domain), using
existing A13 `deliver_business_alert` and Communication Delivery. Add a typed
weekly-expense-reminder mapping; do not disguise it as `daily_report`. This
adds a domain adapter, not a new Action Engine action class.

Required future behavior: scheduler → exact tenant/period and canonical
recipient plan → atomic durable admission of all planned executions → commit
→ Communication Delivery. Scheduler/service identity cannot authorize B37-B.

- First accepted period/version freezes content, recipient User/Membership,
  verified AuthIdentity route, slot keys, policy, expiry and fingerprint.
- Same identity + same plan returns the same root/executions. Changed plan
  conflicts. Retry/restart/deployment never creates a revision or reselects a
  route/recipient. Concurrent admission has one accepted immutable plan.
- Confirmed slot: skip. Pending slot: continue only after current authority and
  policy checks. Deterministic terminal failure: terminal, no fallback.
- UNKNOWN: preserve the same execution and existing bounded reconciliation.
  Telegram has no general trustworthy read-back: inconclusive stays UNKNOWN /
  manual-required. No blind resend, new revision or cross-channel retry.
  Independent recipients can continue. A reply is not proof that delivery may
  be retried and is not automatically a delivery reconciliation receipt.

## 3. B37-B — existing canonical expense owner

**EXISTING CANONICAL EXPENSE MUTATION OWNER:**
`ExpensesService` → `P407ExpenseCanonicalCutoverService` →
`CanonicalActionIngressService` / Action Engine →
`P407ExpenseExecutableService` (`expenses.canonical-ledger`) → PostgreSQL
`Expense`, declaration invalidations and audit in one local transaction.

| Existing action | Exact capability / scope |
| --- | --- |
| Create one expense | `expenses.create.execute.v1` / `create_expense`; one Expense, unique tenant+execution and tenant+idempotency key. |
| Delete one expense | `expenses.delete.execute.v1` / `delete_expense`; exact expense ID + creation evidence, not date-wide deletion. |
| Declare a period complete | `expenses.period-declare.execute.v1` / `declare_expense_period_complete`; explicit owner assertion, epoch and ledger snapshot. It is not a zero expense or automatic consequence of replying. |
| Update / replace whole date | **NOT FOUND** in the registered P4-07 action classes. Do not emulate with unconfirmed delete/create loops. |

A22 is not the Expense owner. Its existing settings classes are
`update_assistant_preferences`, `update_finance_dashboard_preferences`,
`update_appointment_notification_settings`. Finance dashboard preferences do
not authorize ledger writes. Other monetary owners do not substitute for P4-07.

### Authority: available primitives, missing B37 composition

The required chain is authenticated channel → verified staff User → exact
tenant → current active User/Membership/access → expense-specific policy →
confirmed normalized expense action → Action Engine. Recheck when processing
the reply, when confirming and immediately before a new financial effect.

Existing evidence and limits:

- `SocialAuthService` verifies Telegram OAuth identity; `AuthIdentity` binds
  `(tenantId, provider, providerUserId)` to User and composite Membership.
  There is no `verifiedAt` field to invent. Provenance comes from the existing
  identity/link owner. A row/raw ID alone does not authenticate a current update.
- A16 canonical policy resolves active User/Membership, allowed actor role,
  tenant access and `expenses.core`. P4-07 planner checks active Membership and
  expense roles; executor rereads exact membership ID/status/role in its local
  transaction. These components exist, but B37 does not call them.
- Strict `BridgeSourceService.assertBridgeIntegrationBinding` +
  `resolveTenantByIntegration` can establish the authenticated integration's
  tenant. A secret or company ID does not establish the human actor.
- `ClientChannelAuthenticatorService` verifies Maya session / Telegram
  login/init-data; its Telegram result has `userId: null`. It is Client channel
  control, not a staff expense principal. B32/B33 Client links/confirmations
  cannot be repurposed as staff authority.
- Existing legacy value bridges demonstrate tenant-qualified AuthIdentity
  lookup, but no existing B37 staff-update → reminder → expense binding was
  found. `surface: telegram` in an authenticated AI request is a label, not
  evidence of a verified incoming Telegram sender.

Roles must not be conflated:

| Surface | Existing permitted roles / confirmation |
| --- | --- |
| HTTP `ExpensesController`, P4-07 and canonical expense policy | `tenant_owner`, `business_owner`, `tenant_admin`, `administrator`, `accountant`; `expenses.core`; create/delete require actor confirmation. The authenticated HTTP operation is the trusted confirmation boundary. |
| AI `expenses.create`, including declared `telegram` surface | **Only `tenant_owner`, `business_owner`**; relevant AI profile + `expenses.core`; `high_write`, `approvalPolicy: actor`, idempotency required. Exact immutable card must be confirmed by its requester. |

Do not silently grant an administrator/accountant access through the narrower
AI tool, or grant any expense role to the legacy named recipient. Reminder
receipt is not permanent authority; revoked membership/access means no new
expense, even for a previously valid reminder.

### Existing expense fields and validation

| Meaning | Canonical contract; no new Expense business fields proposed |
| --- | --- |
| Tenant / actor | Server-derived `tenantId`, `actorUserId`; normalized membership ID/role and policy evidence; persisted creator and tenant/execution binding. Never supplied by the model. |
| Amount | Integer `amountKopecks`, 1…1,000,000,000. AI `amount_rubles` is validated and converted by `rublesToKopecks`, not by an LLM. |
| Category | Manual slugs `rent`, `utilities`, `supplies`, `marketing`, `taxes`, `other`. Payroll is CRM-owned and rejected as manual input. |
| Currency | Existing tenant default; current P4-07 accepts RUB only. |
| Date | Exact `occurredAt`, normalized `occurredDay`. AI `occurred_on` resolves before approval, with tenant timezone/local-noon conversion. A weekly reminder does not establish each item's actual date. |
| Branch | Optional `branchId`, validated against exact tenant; absent is tenant scope. |
| Comment | DTO `note` ≤500 characters; existing AI note 2…160, without personal data. Persist `encryptedNote`; no invented plaintext description column. |
| Source / identity | Domain `source: manual`, `externalId: null`; HTTP/AI source namespace and stable source-intent ref in canonical request; intent hash, policy evidence and ActionExecution audit. Telegram update metadata is evidence, not a category/date or authority. |

### Idempotency and restart: what is already safe, what is not

P4-07 uses serializable ledger/execution locking; Expense insert, declaration
invalidation, audit and SUCCEEDED outcome commit together. Reusing the same
accepted execution restores its outcome. It performs no provider mutation and
reports `unknownApplicable: false`: after an uncertain DB response, reread that
same canonical execution; do not apply Telegram's delivery UNKNOWN to a local
ledger transaction or create another expense identity.

However, its create identity is derived from:
`p4-07.create-expense.v1`, tenant, HTTP/AI namespace, source intent ref,
category, amount, currency, UTC occurred day and branch. The derived identity is
also the caller key, occurrence scope and target. Therefore **the same source
ref with a changed amount produces a different key/target**. This layer alone
does not freeze the original Telegram input. It is not evidence of a newly
executed production duplicate; it is an exact contract limitation for B37 reuse.

`AiApprovalRequest` and `AiToolExecution` already have tenant-qualified unique
keys, encrypted arguments/results and payload hashes. Existing runtime rejects
changed tool/actor/surface/input under that key and rereads authority before
execution. These are useful existing components, not a missing approval model.
But B37 has no durable mapping from an authenticated update/context to that
key. The AI HTTP DTO expects a UUID, not a raw update number. Its in-progress
tool wrapper also fails closed; it is not a demonstrated whole Telegram
conversation recovery coordinator after a crash between financial commit and
wrapper completion. Resume must recover the existing P4-07 result and may not
generate a new approval/key to escape an in-progress state.

**REPLY CONTEXT FOUNDATION SUFFICIENT: NO.** Neither the process-local set,
generic conversation history, a delivery receipt nor an AiApproval row before
such an adapter exists supplies the complete reply→tenant/actor/action link.
An out-of-context or forwarded reply must not select a tenant. No original
intent may be inferred retrospectively from old SQLite rows or messages.

The [source-method diagnostic](evidence/package5-b37-contract-foundation.probe.cjs)
and [result](evidence/package5-b37-contract-foundation.proof.json) demonstrate
B36 rejecting weekly type, P4-07 same-input key stability / changed-amount key
change, revoked Membership rejection and AI approval changed-intent conflict.
These are synthetic read-dependency checks, not a PostgreSQL/runtime PASS.

## 4. One minimal preservation proposal — decisions not yet approved

**Recommended direction:** retain the weekly reminder as a separate expense
domain A13 operational notification; retain Telegram as an initiator for
explicitly confirmed single-expense cards; retire `/rashod`'s destructive
whole-date replacement. Reuse P4-07 and current approval/identity foundations.
Do not extend B36 or introduce a new ledger/action class.

The following is a concrete candidate for approval, not inferred authorization:

1. **Audience and route:** v1 uses the existing AI expense-write roles
   `tenant_owner` / `business_owner`, active exact-tenant User/Membership and
   applicable expense/AI/access policies; Telegram route must be the verified
   AuthIdentity of that User/tenant. No legacy named-person entitlement. Freeze
   the eligible set before admission. Missing/ambiguous route fails closed;
   no replacement recipient. Recipient designation/opt-in needs explicit
   authority: current `daily_brief` and `finance_analytics` settings do not
   mean “ask me to submit weekly expenses”. Recommend an explicit weekly
   reminder opt-in, initially off; do not reuse those switches silently.
2. **Schedule/period:** propose Sunday 20:00 in the tenant timezone, immutable
   Monday-start week with explicit local dates/UTC boundaries and version 1.
   This differs from the legacy globally fixed Moscow schedule for non-Moscow
   tenants and must be approved. The reminder requests expenses to date in
   that week; each confirmed expense still has its own explicit occurred date.
   Freeze expiry at week-end +7 days, no retrospective catch-up or backfill.
3. **Delivery:** Telegram-only v1, one frozen verified route per recipient;
   no Inbox/APNS fanout or fallback implied. Existing A13 SINGLE admission,
   protected Communication Delivery and UNKNOWN rules apply. B36 keeps its
   separately approved three-channel order unchanged.
4. **Reply / `/rashod`:** reply selects only an admitted, durable exact
   reminder context through a verified provider message reference and/or
   opaque server context handle. The handle is not a bearer permission: check
   current authenticated sender, User, tenant and authority again. If UNKNOWN
   left no trustworthy message/context correlation, do not guess from a last
   chat; require an explicit authenticated context selection. Standalone
   `/rashod` establishes an equally durable tenant/actor-bound command context;
   it does not delete anything. No implicit “next message” mutation.
5. **Intent/confirmation:** normalized candidate rows are frozen before any
   financial action. One existing actor-confirmed card per expense; a list is
   separate confirmed actions, not a new atomic batch. Missing category/date
   requires clarification; no “weekly total posted today” guess. Replay uses
   the saved normalization, not a fresh model parse/current date. Confirmed
   rows skip after restart; unfinished cards keep their identities and require
   their existing approval. A correction is an explicit supported exact-row
   operation, never automatic delete-all. Period completeness is not inferred.

**Business tradeoff:** the legacy single recipient loses automatic immediate
free-text expense writes and whole-day replacement. Non-owner staff cannot use
this proposed AI v1 solely because HTTP would permit their expense role; the
existing authenticated HTTP Expense interface remains available under its
existing contract. Weekly prompts require opt-in and verified identity. If
designated accountant/admin Telegram intake or automatic list replacement is
required, that is a different explicit contract decision, not a coding detail.

### Minimal durable schema responsibilities, not an approved field allocation

New durable schema is required **to preserve this B37-A + B37-B workflow**.
Schema allocation/counts remain NOT DETERMINED at this contract stage. The two
distinct responsibilities below are not a claim that two new tables are
necessarily required; existing AiApproval/ActionExecution storage must be
reused where it can enforce the approved relations/lifecycle.

| Durable responsibility | Required invariant / existing reuse |
| --- | --- |
| Expense reminder admission + recipient selection | Tenant/weekly identity/version unique independently of content; frozen recoverable encrypted content, recipients, route and policy; stable slot→existing A13 execution bindings; no expansion after admission. Canonical opt-in/assignment owner and fields need explicit mapping. `OwnerReportRun` is excluded. |
| Incoming command/reply → immutable expense intent | Unique tenant + authenticated bot/integration namespace + verified principal + source update/message identity, bound to exact reminder or standalone command context. Stable per-item canonical key, normalized intent hash and encrypted arguments; exact existing approval/execution references. Same event/intent converges; changed intent conflicts; concurrent first inputs have one winner. Source identifiers qualify the identity, never grant authority. |

Exact Prisma/SQL model/field names, FK/unique/immutability enforcement, reply
context representation and opt-in storage need a schema mapping after these
business choices. Do not invent placeholder fields or add models now. A new
Action Engine action class is not needed for this proposed direction: A13 and
`create_expense` already exist; their adapters/type/policy mappings need explicit
review. No unsupported update/bulk-replacement action is proposed.

Proposed retention follows the existing owners: reminder payload 7 days / audit
identity 365 days; expense intent payload 30 days / audit 7 years, with the
existing short approval TTL rather than treating a reminder's lifetime as
approval. A reminder's purge must not erase the tenant-qualified financial
source/intent binding. Purged or expired contexts cannot reparse and resend;
retain enough non-sensitive identity evidence to reject/recover exact retries.
Exact lifecycle constraints belong in the subsequent mapping, not fake backfill.

Migration is required for a preservation design. **BACKFILL REQUIRED: NO.**
Prospective admission only; old reminder/messages/SQLite expense rows and
historical executions do not become manufactured verified contexts. Retiring
both legacy capabilities instead could avoid new schema but would remove the
weekly/reply functionality; that alternative has not been selected or executed.

## 5. Required implementation gates after approval

Permanent scan must cover active scheduled/background jobs and registered
handler/helper chains, including aliases, not just one function name:

- Background direct Telegram → FAIL; effect before canonical admission → FAIL.
- Raw Telegram ID / legacy chat ID as business mutation authority → FAIL.
- Legacy expense write outside canonical owner → FAIL.
- Reply without exact tenant/actor/action context → FAIL.
- `/rashod` direct expense write or date-wide clear → FAIL.
- Expense mutation without Action Engine → FAIL: P4-07 is the existing owner.

Regression/proof must include no/ambiguous recipient, inactive User, revoked
Membership/access after reminder, wrong tenant, forwarded/unbound/stale reply,
replayed/concurrent/changed updates, normalization frozen across restart,
changed intent conflict, explicit confirmation, exact expense execution reuse,
crash before/after admission and financial commit, independent partial progress,
UNKNOWN without new operation/fallback, expiry/retention and no historical
backfill. Scan/proofs are requirements here, not newly implemented ratchets.

## 6. Preserved B36 remainder and exact Stage 1 verdict

Mandatory B36 runtime blockers remain **both**:

1. `campaignIdempotencyKey must be a stable opaque code`.
2. `TransactionWriteConflict` during concurrent continuation.

The first runtime PostgreSQL case observed 2/8 expected synthetic effects.
After B37 is resolved, fix both within the already approved B36 semantics,
repeat PostgreSQL/order/restart proof, complete runtime ratchets and all
mandatory gates, then deploy only on PASS. No B36 runtime PASS, deployment or
fresh full 13-family Package 5 Gate is claimed by this document.

Source navigation (all inspected at the accepted checkpoint):

| Contract evidence | Repository source |
| --- | --- |
| B36 daily-only schema | [applied migration](../../maya-saas-backend/prisma/migrations/20260907180000_b36_owner_report_run/migration.sql), [manifest normalizer](../../maya-saas-backend/src/owner-reports/owner-report.contract.ts) |
| A12/A13 capability and delivery type mapping | [registry](../../maya-saas-backend/src/action-engine/action-engine.registry.ts), [Communication Delivery](../../maya-saas-backend/src/communication-delivery/communication-delivery.service.ts) |
| Expense input / HTTP authority | [DTO](../../maya-saas-backend/src/expenses/dto/create-expense.dto.ts), [controller](../../maya-saas-backend/src/expenses/expenses.controller.ts), [service](../../maya-saas-backend/src/expenses/expenses.service.ts) |
| Financial identity, confirmation and atomic owner | [planner](../../maya-saas-backend/src/expenses/expense-canonical-shadow.service.ts), [cutover](../../maya-saas-backend/src/expenses/p4-07-expense-canonical-cutover.service.ts), [executor](../../maya-saas-backend/src/expenses/p4-07-expense-executable.service.ts), [action contracts](../../maya-saas-backend/src/action-engine/p4-07-expense-executable.contract.ts) |
| A16 and A22 boundaries | [policy registry](../../maya-saas-backend/src/action-engine/action-engine.policy-registry.ts), [resolver](../../maya-saas-backend/src/action-engine/action-engine.policy-resolver.ts), [Wave 1 contract](../../maya-saas-backend/src/action-engine/package5-wave1-executable.contract.ts) |
| Existing AI confirmation and narrower roles | [catalog](../../maya-saas-backend/src/ai-tools/ai-tool.catalog.ts), [runtime](../../maya-saas-backend/src/ai-tools/ai-tool-runtime.service.ts), [handler](../../maya-saas-backend/src/ai-tools/ai-tool-handler.service.ts) |
| Identity, tenant and durable storage limits | [social auth](../../maya-saas-backend/src/auth/social-auth.service.ts), [channel authenticator](../../maya-saas-backend/src/crm/client-channel-authenticator.service.ts), [bridge binding](../../maya-saas-backend/src/tenancy/bridge-source.service.ts), [schema](../../maya-saas-backend/prisma/schema.prisma) |
| Preferences are not expense-intake opt-in | [assistant capability catalog](../../maya-saas-backend/src/dashboard-preferences/assistant-capabilities.constants.ts) |

```text
B37-A CLASSIFICATION: operational_single
B37-A CANONICAL OWNER: NOT FOUND
B37-A B36 OwnerReportRun REUSABLE: NO
B37-A COMMUNICATION FOUNDATION SUFFICIENT: NO
B37-A EXISTING COMMUNICATION DELIVERY PRIMITIVES SUFFICIENT: YES
B37-B CANONICAL EXPENSE OWNER: ExpensesService → P407ExpenseCanonicalCutoverService → Action Engine → P407ExpenseExecutableService
B37-B ACTOR/TENANT FOUNDATION SUFFICIENT: NO
B37-B IDEMPOTENCY FOUNDATION SUFFICIENT: NO
B37-B REPLY CONTEXT FOUNDATION SUFFICIENT: NO
NEW SCHEMA REQUIRED: YES
NEW MODELS: NOT DETERMINED
NEW FIELDS: NOT DETERMINED
NEW ACTION CLASSES: 0
MIGRATION REQUIRED: YES
BACKFILL REQUIRED: NO
B37 IMPLEMENTATION CAN RESUME: NO
REMINDER RECIPIENT == PERMANENT EXPENSE AUTHORITY: NO
B36 PRODUCTION SCHEMA: PASS
B36 RUNTIME PROOF: FAIL
B36 RUNTIME DEPLOYMENT: NO
ACTIVE BLOCKER: B37
PACKAGE 5 COMPLETE: NO
PRODUCTION MESSAGES: 0
PRODUCTION EXPENSE MUTATIONS: 0
PROCESS HYGIENE: 0
```

The NO foundation verdicts concern the complete B37 path, not the absence of
canonical identity, approval, expense or delivery primitives. Schema/count
verdicts describe the proposed preservation scope; they are not implementation
authorization. No runtime/schema/migration changes in this Stage 1. Main 24
dirty entries and 17 old databases preserved. No Wave 7/Chapter 7; Chapter 6
completion is not declared. Proposal/evidence/remainder → commit/push → STOP.

[Stage 1 verification and hygiene receipt](evidence/package5-b37-stage1-verification.json).
