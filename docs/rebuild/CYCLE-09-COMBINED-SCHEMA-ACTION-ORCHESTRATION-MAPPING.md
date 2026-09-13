# Chapter 9 — combined schema / action / orchestration mapping

Status: **ENVELOPE PROPOSED FOR APPROVAL; IMPLEMENTATION NOT STARTED.**

Baseline inspected: `b9402e39d6aaab63104bfce868a636c60beb8cc5`, canonical branch `codex/maya-brain-systemic-release-20260815`. Owner has now approved **D1–D16 Option A**, including exact source receipts, BI read-only, finite limits, 24h maximum validity, 365d new-derived retention and no online peer training. The historical preflight/decision documents retain their original “approval pending” statements as publication history; this document records the subsequent owner approval. Approval of product decisions is **not approval of this new physical envelope**.

Sources: [owner decisions](CYCLE-09-OWNER-DECISION-PACK.md), [Q01–Q30 / P01–P06 / 32 surfaces](CYCLE-09-PREFLIGHT-AND-SCOPE.md), [Orchestrator gate §§3,5,8,10–14,18–21](MAYA-ORCHESTRATOR-AGENTS-ARCHITECTURE-GATE.md), [service-business architecture](../architecture/README.md), [C8 retention/source-reference precedent §§4,8](CYCLE-08-COMBINED-SCHEMA-MODEL-EVALUATION-MAPPING.md). No source runtime, Prisma schema, migration or production state is changed in this cycle.

## 1. Envelope and ownership

**5 new models / 123 physical fields / 2 altered existing models / 0 new Action Engine classes / 1 AC6 class / 1 migration / 0 backfills.** One Orchestrator and four agents remain fixed. Registry is **HYBRID: versioned code definitions + persisted immutable version references; no database-authored registry**.

| New model | Fields | Purpose / canonical owner |
|---|---:|---|
| C9Run | 28 | Explicit request, nonrenewing lifetime and shared coordination resource budget |
| C9StrategyRevision | 27 | Immutable objective/options/evidence and review binding; no source approval authority |
| C9PlanStep | 26 | Separate bounded deterministic plan nodes/dependencies and dispatch claims |
| C9StepBinding | 16 | Exact references to existing assignment/approval/execution/outcome owners |
| C9WorkReceipt | 26 | Bounded reasoning/read/handoff reservation and usage evidence; not billing or business execution |

The five entities share one request and one policy/registry lineage. There is no per-agent database, generic business executor, duplicate campaign/audience, period/evidence source table, payment ledger, vector memory, model-training store or universal AI approval. Typed small JSON **inside a named contract** carries variable scope/limits/alternatives; actual Plan nodes and source Action bindings are relationally separate, not an opaque Strategy+Plan+Action blob.

Why five: collapsing the run and revision would either reset budgets on edits or overwrite history; collapsing steps into proposals loses atomic per-step claims/dependencies; embedding mutable owner execution state makes C9 an effect owner; embedding concurrent call reservations into textual history cannot prove pre-dispatch cost admission. Reuse of AgentTask or AiBrainSession.planJson would change their semantics. No alternative new schema per P02–P06 is proposed.

## 2. Existing foundations inspected and reused

Paths below are repository-relative; source fingerprints/line anchors are in `evidence/chapter9-mapping/source-evidence.json`. Reuse count remains the preflight's **28 foundation groups**, not the number of models or a claim all C9 requirements already exist.

| ID | Foundation | Exact reuse / protected boundary |
|---|---|---|
| F01 | Canonical Client / channel provenance — `maya-saas-backend/prisma/schema.prisma` | Client/ClientChannelLink; C6 B31/B32/A18 |
| F02 | Staff/User/Membership authority — `maya-saas-backend/src/auth` | R02/R03/R04 + CrmStaffAccess |
| F03 | BusinessState canonical read — `maya-saas-backend/src/business-state/business-state.service.ts` | computed facts, no new arithmetic |
| F04 | C7 MeasurementRevision — `maya-saas-backend/src/measurement` | fact/current/as-reported distinction |
| F05 | C8 result/policy/ranking — `maya-saas-backend/src/valuation/c8.read.ts` | qualified limited-data safe projection |
| F06 | C8 model/evaluation readiness — `maya-saas-backend/src/valuation` | 0/8 active does not imply error |
| F07 | Opportunity lifecycle — `maya-saas-backend/src/opportunities` | semantic identity/qualification/expiry |
| F08 | AgentTask durable assignment — `maya-saas-backend/prisma/schema.prisma` | assignment only, not strategy runtime |
| F09 | AE registry/identity/executor — `maya-saas-backend/src/action-engine` | one business effect owner |
| F10 | AE approval/policy/durable resume — `maya-saas-backend/src/action-engine/action-engine.approval-binding.ts` | fresh policy; same execution; UNKNOWN |
| F11 | R10 tool receipt / AiApprovalRequest — `maya-saas-backend/src/ai-tools/ai-tool-receipt.service.ts` | scoped encrypted exact tool receipt |
| F12 | B31/B33 booking identities — `maya-saas-backend/src/action-engine` | verified own/internal/CRM create and confirmation |
| F13 | Communication Delivery — `maya-saas-backend/src/communication-delivery` | policy/routes/effect receipt/reconciliation |
| F14 | B35 bulk audience/campaign — `maya-saas-backend/src/marketing/canonical-bulk.service.ts` | immutable Client audience/slot/partial resume |
| F15 | A22 config revisions — `maya-saas-backend/src/package5-wave1/governed-settings.contract.ts` | four admitted namespaces; not arbitrary config |
| F16 | Entitlements/readiness — `maya-saas-backend/src/entitlements` | server deny-wins feature checks |
| F17 | Tool catalog/validator/policy/runtime — `maya-saas-backend/src/ai-tools/ai-tool.catalog.ts` | 47 definitions, not 47 enabled capabilities |
| F18 | Existing AiCore and brain router — `maya-saas-backend/src/ai-tools/ai-core.service.ts` | one pipeline; 3-step configurable loop |
| F19 | Conversation Intelligence plan — `maya-saas-backend/src/conversation-intelligence` | semantic decomposition not durable approval |
| F20 | Confirmed onboarding and secure CRM — `maya-saas-backend/src/onboarding` | draft/token/receipt; secure integration separate |
| F21 | OwnerReportRun/A12/download — `maya-saas-backend/src/owner-reports` | immutable report plan and authorized snapshot |
| F22 | P407 expense / finance source owners — `maya-saas-backend/src/expenses` | facts and confirmed mutations remain canonical |
| F23 | Review/NativeFeedback — `maya-saas-backend/prisma/schema.prisma` | source/scale/author authority; no auto publication |
| F24 | Package4 value owners — `maya-saas-backend/src/action-engine` | no agent creates credit/discount/loyalty independently |
| F25 | Audit and safe C7/C8 access — `maya-saas-backend/src/measurement` | tenant owner audit allowlist and finance scope |
| F26 | AC6 retention leaves — `maya-saas-backend/src/package5-wave6` | holds/lifecycle/source protection; no new retention autoapproval |
| F27 | Explicit user memory — `maya-saas-backend/src/ai-tools/ai-memory.service.ts` | human note not fact/policy, existing retention untouched |
| F28 | Existing release/CI evaluation/guards — `maya-saas-backend/package.json` | mandatory .spec; finite production preservation |

Concrete schema checks: Opportunity has semantic identity/revision/evidence/expiry; AgentTask is explicitly an **assignment, not execution job** and is unique per Opportunity/domain. ActionExecution owns immutable input/identity, policy/approval, lease and UNKNOWN/reconciliation. AiApprovalRequest has tenant idempotency and exact encrypted arguments; AiToolExecution/R10 stores an encrypted `maya.ai-canonical-receipt/1` with exact admitted executions. Its local status is not effect truth; `AiToolExecution` currently has no `(id,tenantId)` unique key, so this proposal does not pretend a composite FK already exists. B35 has immutable audience/intent/confirmation and root/slot semantics. OwnerReportRun already owns date/type/version/timezone/expiry/recipient/channel plan. A22 revisions own confirmed configuration, not chat history. MaintenanceRun/ItemClaim own scoped cleanup claims; they are not strategy jobs. AuditLog is evidence, not an idempotent approval owner. Existing explicit notes are untrusted context, not durable source facts.

Source owners are reused by exact adapters, not by taking their models as generic storage. C9 does not alter AgentTask, AiApprovalRequest, AiToolExecution, ActionExecution, Opportunity, MarketingCampaign/Audience, CommunicationDelivery, OwnerReportRun, MeasurementRevision, C8ResultRevision, AuditLog or MaintenanceRun physical fields.

## 3. Q01–Q30 exact reuse/gap mapping

“SUFFICIENT” means sufficient for the **whole named requirement without a new C9 contract**, not whether the underlying C6–C8 owner is valid. A NO identifies the new coordination/consumer contract; it does not reopen the existing source owner. Executable proof named in the original manifest remains required after implementation.

| Requirement | Package | Existing model/owner/interface | Sufficient | Exact gap | Reuse / delta owner |
|---|---|---|---|---|---|
| Q01 Один Orchestrator: intent/period → routing → bounded delegation → response | P02 | AiCore router / F18–19 | NO | Durable bounded coordinator over existing entry; no second brain | P02 Orchestrator; C9Run + WorkReceipt |
| Q02 Четыре versioned agent domains и AgentResult@1 | P01 | AgentTask.agentDomain / F08, F17 | NO | Executable four-domain registry and validated AgentResult@1 | P01 code registry + WorkReceipt |
| Q03 Capability → tool → canonical owner mapping | P01 | AiToolDefinition.name/risk/approval / F09,F17 | NO | Compose exact capability/tool/owner contract | P01 registry; persist digest only |
| Q04 Effective availability/authority/entitlement intersection | P01 | Membership, CrmStaffAccess, Entitlements / F01–02,F16 | NO | One current deny-wins intersection, no permission from registry | Existing authority owners; P01 adapter |
| Q05 Trusted facts vs untrusted text/context profiles | P01 | BusinessState/C7/C8/provenance / F03–06 | NO | Field trust labels + minimized typed context | P01 validation; bounded source refs |
| Q06 Durable strategy revision/step/assignment/evidence links | P01 | Opportunity/AgentTask/AiApprovalRequest / F07–11 | NO | No Strategy revision/DAG in any existing owner | P01 shared five-model graph |
| Q07 Request/strategy/step identity and concurrent dedup | P01 | AE.identityFingerprint/R10.idempotencyKey / F09–12 | NO | Whole request/edit/plan identities and fenced continuation | P01 Run/Revision/Step/Binding/WorkReceipt |
| Q08 Validated confirmed policy changes through A22 | P03 | TenantBusinessConfigurationRevision.namespace/contentHash / F15 | NO | Closed typed C9 configuration namespace absent | P03 A22 c9_orchestration forward CHECK; no fields |
| Q09 Maya Admin front-office domain | P04 | Own booking B31–33 + catalog/Client / F01,F12,F17 | NO | Admin reasoning wrapper and context restrictions | P04 existing booking owner via P05 bindings |
| Q10 Client Lifecycle strategy domain | P04 | C8ResultRevision + B35 campaign/audience / F05,F14 | NO | Lifecycle strategy/known-benefit options, not automatic send | P04 same Revision/Step; B35 only executes |
| Q11 Occupancy domain | P04 | Availability/journal/schedule source owners / F03,F12,F17 | NO | Scoped occupancy option planner | P04 same Revision/Step; source controls writes |
| Q12 BI read-only specialist | P02 | C7 readers + C8ResultRevision / F03–06,F25 | NO | Read-only BI specialist/result contract | P02 code domain; no finance privilege escalation |
| Q13 C9 works without active C8 probabilities | P02 | C8ResultRevision qualification + model/evaluation / F05–06 | YES | Consumer must preserve 0/8 active and unavailable result | Existing C8 owner; P02 negative compatibility proof, no source delta |
| Q14 Bounded strategy options, tradeoffs and recommendation | P04 | No durable alternative owner; C7/C8 qualified evidence | NO | 1..3 strategies with tradeoffs, optional no-action | P04 Revision alternatives + separate Step DAGs |
| Q15 Exact immutable bounded approval | P05 | AiApprovalRequest, R10 encrypted receipt, AE approval / F10–11,F14 | NO | Exact strategy-to-source binding; review not effect authority | P05 C9StepBinding; existing owner confirms |
| Q16 Approved strategy handoff to existing owners | P05 | AE/CD/B35/A22/P407/P4 / F09–15,F22,F24 | NO | Finite canonical handoff adapters + crash attachment protocol | P05 bindings; zero new AE classes |
| Q17 Partial plan/restart/UNKNOWN continuation | P05 | AE/CD UNKNOWN and idempotency / F09–14 | NO | Cross-step dependencies; source states not copied | P05 Step/Binding + current source projections |
| Q18 Intent expiry, policy refresh, supersession/cancel | P05 | AE intentExpiresAt / C7,C8 revisions / F04–06,F10 | NO | Whole proposal expiry/material supersession/cancel fence | P05 Run/Revision validity + current source approval checks |
| Q19 Global bounded agent/tool/AI and business budgets | P02 | AiCore maxOutputTokens/timeouts; owner campaign cost fields | NO | No total request reserve/usage/active-wall budget | P02 Run budget + WorkReceipt; source spend remains source |
| Q20 Conversation edits become validated drafts | P03 | ConversationIntelligence + confirmed onboarding / F19–20 | NO | Typed edit key/materiality and separate confirmation | P03 Revision edit; A22 only for standing policy |
| Q21 Service-business profile and relevant onboarding | P03 | Tenant/Branch/timezone + A22/c8_valuation / F15,F20 | NO | Bounded confirmed service-business profile | P03 existing source refs + c9_orchestration payload |
| Q22 Safe secrets and external source capability intake | P03 | CRM secure integration/bindings / F20 | NO | URL reference vs qualified connected-source view | P03 A22 reference/status projection; no connector model |
| Q23 Confirmed report policy handoff | P03 | OwnerReportRun.reportType/intentHash + A12 / F21 | NO | Typed confirmed report preference and supported scheduler consumption | P03 A22 preferences; P05 existing report owner |
| Q24 Memory is not business state; minimal durable evidence | P01 | Explicit AiMemoryFact; AC6 MaintenanceRun/ItemClaim / F26–27 | NO | New minimized C9 history/365d aggregate lifecycle | P01 one AC6 leaf; existing notes/source retention unchanged |
| Q25 Versioned reasoning/skills and offline evaluation | P06 | Versioned prompts/evaluation scripts/release / F28 | NO | Four-domain corpus and fixed promotion rubric | P06 code/offline evidence; no evaluation database |
| Q26 Evidence-grounded explanations/status/cost visibility | P02 | AuditLog + C7 safe audit + evidence refs / F25 | NO | Grounded strategy explanation and bounded trace | P02/P06 safe projection; no raw prompt/CoT archive |
| Q27 Close exact carried tool/presentation limitations | P06 | Existing catalog/readers/CI consumers / F17–19 | NO | Six carried tool/context/presentation defects, explicit truncation | P06 adapter closure; no C7/C8 source rewrite |
| Q28 One consistent UI/chat/voice/Telegram/panel contract | P06 | Existing HTTP/chat/stream/voice/PWA/native surfaces | NO | Same strategy identity/receipt view across consumers | P06 existing surfaces, frozen 32-group manifest |
| Q29 Cross-tenant/Client/Staff/finance/AI security regression proof | P06 | Exact User/Membership/Client + safe audit/finance / F01–02,F25 | YES | No new authority required; wire/check all new C9 readers | Existing owners; P06 adversarial projection proof |
| Q30 Finite release/production/handoff gate; no C10 loop | P06 | C6–C8 release gates + C9 30/6/4/32 manifest / F28 | NO | Wire C9 ratchets and finite final acceptance | P06 mandatory specs/production structural proofs only |

## 4. Exact physical field mapping

`UUID` = Prisma String `@db.Uuid`; TEXT/CHAR(64) = String / `@db.Char(64)`; INT = Int; JSONB = Json; TIMESTAMPTZ(3) = DateTime `@db.Timestamptz(3)`. `?` alone means nullable; all other fields NOT NULL. UUIDs generated server-side; first-admission timestamps use the database clock. Hashes are lowercase SHA-256. Initial counters/generations are 0. Arrays/maps have explicit empty typed values, not missingness disguised as zero money.

All fields below are **derived coordination evidence**, conservatively personal when scoped to a principal/subject; retention is §12. NO = insert-only; ONCE = null→value once; CAS = exact counter/fence guarded transition; LEASE = paired monotone claim; MINIMIZE = encrypted payload→null only after durable owner binding or AC6 expiry, hash preserved. These labels are the exact write allowlist; `updatedAt` is not permission to rewrite immutable content.

### C9Run — 28 physical fields

| # | Field | Type | Write rule | Meaning |
|---:|---|---|---|---|
| 1 | `id` | UUID | NO | Server-generated primary key |
| 2 | `tenantId` | TEXT | NO | Exact authenticated tenant |
| 3 | `contractVersion` | INT | NO | 1 |
| 4 | `principalJson` | JSONB | NO | Typed exact User/Membership or Client/channel provenance refs; no contacts |
| 5 | `authorityHash` | CHAR(64) | NO | Canonical initial principal/scope fingerprint; not permanent authority |
| 6 | `requestKeyHash` | CHAR(64) | NO | Hash of caller durable request event identity |
| 7 | `requestHash` | CHAR(64) | NO | Normalized immutable initial request hash |
| 8 | `requestIntentJson` | JSONB | NO | Bounded minimized normalized initial question/objective/constraints and refs; no raw chat history/contacts |
| 9 | `entryKind` | TEXT | NO | EXPLICIT_REQUEST or SELECTED_OPPORTUNITY |
| 10 | `entryRefJson` | JSONB? | NO | Qualified Opportunity/AgentTask refs for selected entry, otherwise null |
| 11 | `admittedAt` | TIMESTAMPTZ(3) | NO | First accepted request time |
| 12 | `validUntil` | TIMESTAMPTZ(3) | NO | Nonrenewing maximum 24h/source bound for new orchestration work |
| 13 | `retentionUntil` | TIMESTAMPTZ(3) | NO | First admission +365d for minimal request identity/budget; expired child payloads purge sooner |
| 14 | `state` | TEXT | CAS | Coordination root state; never external outcome authority |
| 15 | `currentRevision` | INT | CAS | 0 before first proposed revision; monotone current revision number |
| 16 | `counterVersion` | INT | CAS | Optimistic budget/state revision, starts 0 |
| 17 | `budgetManifestHash` | CHAR(64) | NO | Hash of released ceilings, price evidence and confirmed tenant caps |
| 18 | `budgetManifestJson` | JSONB | NO | Typed fixed request ceiling/configuration; no credentials |
| 19 | `budgetStateJson` | JSONB | CAS | Exact reserved/settled/held call/token/cost vectors, reconciled with work receipts |
| 20 | `reasoningUsedMs` | INT | CAS | Charged active reasoning wall time, never decremented |
| 21 | `reasoningWindowStartedAt` | TIMESTAMPTZ(3)? | LEASE | Current reasoning window; null outside a window |
| 22 | `reasoningWindowDeadlineAt` | TIMESTAMPTZ(3)? | LEASE | Persisted deadline bounded by remaining 120s |
| 23 | `leaseTokenHash` | CHAR(64)? | LEASE | Fencing token hash, never raw token |
| 24 | `leaseUntil` | TIMESTAMPTZ(3)? | LEASE | Coordination lease bound |
| 25 | `leaseGeneration` | INT | CAS | Monotone fencing generation |
| 26 | `cancelKeyHash` | CHAR(64)? | ONCE | Exact first accepted coordination cancellation identity |
| 27 | `cancelledAt` | TIMESTAMPTZ(3)? | ONCE | Stops unstarted work, no source rollback |
| 28 | `updatedAt` | TIMESTAMPTZ(3) | CAS | Audit of coordination writes |
### C9StrategyRevision — 27 physical fields

| # | Field | Type | Write rule | Meaning |
|---:|---|---|---|---|
| 1 | `id` | UUID | NO | Revision identity |
| 2 | `tenantId` | TEXT | NO | Exact tenant |
| 3 | `runId` | UUID | NO | Shared request/budget owner |
| 4 | `revision` | INT | NO | 1-based monotone run sequence |
| 5 | `parentRevisionId` | UUID? | NO | Previous revision of the same run, null for first |
| 6 | `editKeyHash` | CHAR(64) | NO | Initial-proposal or explicit edit event; same event cannot produce different proposal |
| 7 | `inputHash` | CHAR(64) | NO | Material edit/input/evidence/registry identity |
| 8 | `snapshotHash` | CHAR(64) | NO | Canonical immutable strategy plus full ordered step graph digest |
| 9 | `state` | TEXT | CAS | Proposal/review/execution coordination lifecycle |
| 10 | `proposalContract` | TEXT | NO | maya.c9-strategy/1 |
| 11 | `registryHash` | CHAR(64) | NO | Released code capability registry digest |
| 12 | `skillVersionsJson` | JSONB | NO | Exact task/skill/prompt/model configuration manifests used |
| 13 | `objectiveJson` | JSONB | NO | Typed objective, permitted subject scope and success criteria refs |
| 14 | `constraintsJson` | JSONB | NO | One-off limits, source policy refs and budget/approval requirements |
| 15 | `alternativesJson` | JSONB | NO | 1..3 typed strategy summaries with keys, not embedded Plan/Action blobs |
| 16 | `evidenceRefsJson` | JSONB | NO | Bounded qualified evidence refs/status/asOf, no source row copies |
| 17 | `selectedOptionKey` | TEXT? | ONCE | Exact selected alternative on explicit strategy review |
| 18 | `reviewKeyHash` | CHAR(64)? | ONCE | Idempotent review event, not source effect permission |
| 19 | `reviewHash` | CHAR(64)? | ONCE | Hash of actor, snapshot, selected option, limits, validity |
| 20 | `reviewActorJson` | JSONB? | ONCE | Exact authenticated reviewing principal/scope; same initiator in v1 |
| 21 | `reviewedAt` | TIMESTAMPTZ(3)? | ONCE | Review timestamp |
| 22 | `reviewDecision` | TEXT? | ONCE | ACCEPTED or DECLINED; effect owners still require own receipts |
| 23 | `admittedAt` | TIMESTAMPTZ(3) | NO | Revision admission; cannot reset run deadlines |
| 24 | `validUntil` | TIMESTAMPTZ(3) | NO | Min of run validity and current source/quote/policy deadlines |
| 25 | `retentionUntil` | TIMESTAMPTZ(3) | NO | Same or shorter root retention cap |
| 26 | `terminalReason` | TEXT? | ONCE | Safe bounded coordination reason code |
| 27 | `terminalAt` | TIMESTAMPTZ(3)? | ONCE | Terminal coordination timestamp |
### C9PlanStep — 26 physical fields

| # | Field | Type | Write rule | Meaning |
|---:|---|---|---|---|
| 1 | `id` | UUID | NO | Node identity |
| 2 | `tenantId` | TEXT | NO | Exact tenant |
| 3 | `revisionId` | UUID | NO | Exact immutable proposal graph |
| 4 | `optionKey` | TEXT | NO | One of the revision alternatives |
| 5 | `stepKey` | TEXT | NO | Stable key within option, not random per retry |
| 6 | `ordinal` | INT | NO | Deterministic tie order |
| 7 | `domain` | TEXT | NO | ADMIN, CLIENT_LIFECYCLE, OCCUPANCY or BUSINESS_INTELLIGENCE |
| 8 | `kind` | TEXT | NO | READ, PROPOSE, OWNER_HANDOFF or NO_ACTION |
| 9 | `capability` | TEXT | NO | Registered capability; BI cannot OWNER_HANDOFF |
| 10 | `registryHash` | CHAR(64) | NO | Same released registry as revision |
| 11 | `intentContract` | TEXT | NO | Registered bounded input contract version |
| 12 | `intentHash` | CHAR(64) | NO | Canonical material intent and dependency hash |
| 13 | `intentEncrypted` | TEXT? | MINIMIZE | Only necessary typed draft owner command; no credentials/customer database |
| 14 | `dependenciesJson` | JSONB | NO | Same-option earlier step keys and required resolved outcomes |
| 15 | `evidenceRefsJson` | JSONB | NO | Typed source/policy/previous result refs |
| 16 | `budgetSliceJson` | JSONB | NO | Bounded resource/exposure reservation references, not payment ledger |
| 17 | `state` | TEXT | CAS | WAITING, ELIGIBLE, CLAIMED, BOUND, RESOLVED or STOPPED |
| 18 | `leaseGeneration` | INT | CAS | Monotone claim generation |
| 19 | `leaseTokenHash` | CHAR(64)? | LEASE | Fenced dispatch identity |
| 20 | `leaseUntil` | TIMESTAMPTZ(3)? | LEASE | Claim deadline; expiry alone never authorizes duplicate effect |
| 21 | `admittedAt` | TIMESTAMPTZ(3) | NO | Same transaction as revision publication |
| 22 | `validUntil` | TIMESTAMPTZ(3) | NO | No later than revision/source intent validity |
| 23 | `retentionUntil` | TIMESTAMPTZ(3) | NO | No later than revision/root retention |
| 24 | `terminalAt` | TIMESTAMPTZ(3)? | ONCE | Coordination closure, source outcome is read separately |
| 25 | `stopReason` | TEXT? | ONCE | Safe deterministic reason |
| 26 | `updatedAt` | TIMESTAMPTZ(3) | CAS | Coordination update time |
### C9StepBinding — 16 physical fields

| # | Field | Type | Write rule | Meaning |
|---:|---|---|---|---|
| 1 | `id` | UUID | NO | Non-authoritative linkage identity |
| 2 | `tenantId` | TEXT | NO | Exact tenant |
| 3 | `stepId` | UUID | NO | Reviewed graph node |
| 4 | `slotKey` | TEXT | NO | Fixed owner receipt role/slot within step |
| 5 | `ownerKey` | TEXT | NO | Registered existing canonical owner |
| 6 | `bindingKind` | TEXT | NO | APPROVAL, EXECUTION, OUTCOME or ASSIGNMENT |
| 7 | `sourceType` | TEXT | NO | Closed registered source model/receipt contract |
| 8 | `sourceId` | TEXT | NO | Exact source identity; never contact/phone/raw channel id |
| 9 | `sourceIdentityHash` | CHAR(64) | NO | Source canonical identity fingerprint |
| 10 | `sourceIntentHash` | CHAR(64) | NO | Exact source input/plan hash |
| 11 | `sourceApprovalHash` | CHAR(64)? | NO | Verified source approval material binding, when required |
| 12 | `lineageJson` | JSONB | NO | Bounded typed tenant/subject/receipt lineage and authority proof refs |
| 13 | `bindingHash` | CHAR(64) | NO | Canonical complete binding digest |
| 14 | `boundAt` | TIMESTAMPTZ(3) | NO | Attachment admission time |
| 15 | `validUntil` | TIMESTAMPTZ(3)? | NO | Observed source use deadline; not a source extension |
| 16 | `retentionUntil` | TIMESTAMPTZ(3) | NO | Run/dependency retention cap |
### C9WorkReceipt — 26 physical fields

| # | Field | Type | Write rule | Meaning |
|---:|---|---|---|---|
| 1 | `id` | UUID | NO | A bounded reasoning/read invocation, not business ActionExecution |
| 2 | `tenantId` | TEXT | NO | Exact tenant |
| 3 | `runId` | UUID | NO | Shared unchanged budget owner |
| 4 | `revisionId` | UUID? | NO | Associated admitted revision when available, null for initial reasoning |
| 5 | `callKeyHash` | CHAR(64) | NO | Stable logical invocation identity |
| 6 | `domain` | TEXT | NO | Four domains or ORCHESTRATOR coordinator (not fifth agent) |
| 7 | `kind` | TEXT | NO | MODEL, TOOL_READ or OWNER_HANDOFF; last is dispatch-budget evidence, never the business executor |
| 8 | `taskKey` | TEXT | NO | Closed versioned registry task/capability |
| 9 | `registryHash` | CHAR(64) | NO | Released manifest digest |
| 10 | `skillHash` | CHAR(64)? | NO | Model task skill/prompt bundle digest |
| 11 | `inputHash` | CHAR(64) | NO | Normalized safe bounded inputs, no raw prompt persisted |
| 12 | `inputEvidenceRefsJson` | JSONB | NO | Qualified refs used at call admission |
| 13 | `providerModelKey` | TEXT? | NO | Exact existing provider/model for MODEL or priced tool, no secret |
| 14 | `priceBasisJson` | JSONB? | NO | Immutable verified quote/version/currency/unit/expiry; null only proved zero-cost work |
| 15 | `reservationJson` | JSONB | NO | Worst-case exact counters/tokens/cost reserved before dispatch |
| 16 | `usageJson` | JSONB? | ONCE | Verified provider usage/settlement, write once; null while HELD_UNKNOWN retains reservation |
| 17 | `state` | TEXT | CAS | RESERVED, DISPATCHED, SETTLED, HELD_UNKNOWN or ABORTED_BEFORE_DISPATCH |
| 18 | `resultJson` | JSONB? | ONCE | Validated minimized AgentResult@1/read envelope; no hidden reasoning |
| 19 | `resultHash` | CHAR(64)? | ONCE | Digest of validated safe result |
| 20 | `startedAt` | TIMESTAMPTZ(3)? | ONCE | Persisted dispatch marker before call |
| 21 | `settledAt` | TIMESTAMPTZ(3)? | ONCE | Verified settlement or proven pre-dispatch abort; null while uncertain |
| 22 | `admittedAt` | TIMESTAMPTZ(3) | NO | Reservation admission time |
| 23 | `retentionUntil` | TIMESTAMPTZ(3) | NO | Root and identifiable evidence expiry cap |
| 24 | `leaseGeneration` | INT | CAS | Monotone fence |
| 25 | `leaseTokenHash` | CHAR(64)? | LEASE | Owned dispatch token hash |
| 26 | `leaseUntil` | TIMESTAMPTZ(3)? | LEASE | Cannot turn dispatched timeout into retry authorization |

Only existing-model changes:

1. `Tenant`: five Prisma reverse collections (`c9Runs`, `c9StrategyRevisions`, `c9PlanSteps`, `c9StepBindings`, `c9WorkReceipts`); **0 physical columns**.
2. `TenantBusinessConfigurationRevision`: extend existing `R11_config_contract_check` namespace allowlist with **`c9_orchestration`** while retaining every existing predicate/namespace; **0 physical columns**, no weakening of A22 revision/admission guards. Its encrypted content is the versioned payload in §10. This is counted as one SQL-altered existing model, even though its Prisma columns do not change.

No nullability change to existing columns, destructive source alteration, source backfill or source trigger. Prospective five tables and one permissive CHECK extension form **one** future `chapter9_orchestration_foundation` migration; the timestamp will follow the repository's migration order at implementation, never precede an already-applied migration.


## 5. Exact constraints, indexes and lifecycle

Machine-readable exact field/name/constraint list: [schema-envelope.json](evidence/chapter9-mapping/schema-envelope.json). Counts: **5 PKs, 12 UNIQUE constraints, 1 partial UNIQUE index, 46 new CHECKs, 1 extended existing CHECK, 11 FKs, 7 additional nonunique indexes, 0 PostgreSQL/Prisma enums**. UNIQUE backing indexes are not counted again as additional indexes. All FKs below are ON DELETE/UPDATE RESTRICT. No physical FK points from C9 into Client/Appointment/Opportunity/AgentTask/AE/receipt/measurement/valuation/source facts; their independent correction/retention remains possible. Tenant FK is tenant lifecycle, not a derived Client assertion.

| Model | Exact keys and indexes | Exact FKs |
|---|---|---|
| C9Run | `C9Run_pkey` PK(id); `C9Run_1_key` (id, tenantId); `C9Run_2_key` (tenantId, requestKeyHash); `C9Run_1_idx` (tenantId, state, validUntil, id); `C9Run_2_idx` (tenantId, retentionUntil, id) | `C9Run_1_fkey` (tenantId) → Tenant(id) |
| C9StrategyRevision | `C9StrategyRevision_pkey` PK(id); `C9StrategyRevision_1_key` (id, tenantId); `C9StrategyRevision_2_key` (tenantId, runId, revision); `C9StrategyRevision_3_key` (tenantId, runId, editKeyHash); `C9StrategyRevision_1_idx` (tenantId, state, validUntil, id) | `C9StrategyRevision_1_fkey` (tenantId) → Tenant(id); `C9StrategyRevision_2_fkey` (runId, tenantId) → C9Run(id, tenantId); `C9StrategyRevision_3_fkey` (parentRevisionId, tenantId) → C9StrategyRevision(id, tenantId) |
| C9PlanStep | `C9PlanStep_pkey` PK(id); `C9PlanStep_1_key` (id, tenantId); `C9PlanStep_2_key` (tenantId, revisionId, optionKey, stepKey); `C9PlanStep_3_key` (tenantId, revisionId, optionKey, ordinal); `C9PlanStep_1_idx` (tenantId, state, validUntil, id) | `C9PlanStep_1_fkey` (tenantId) → Tenant(id); `C9PlanStep_2_fkey` (revisionId, tenantId) → C9StrategyRevision(id, tenantId) |
| C9StepBinding | `C9StepBinding_pkey` PK(id); `C9StepBinding_1_key` (id, tenantId); `C9StepBinding_2_key` (tenantId, stepId, bindingKind, slotKey); `C9StepBinding_1_idx` (tenantId, sourceType, sourceId) | `C9StepBinding_1_fkey` (tenantId) → Tenant(id); `C9StepBinding_2_fkey` (stepId, tenantId) → C9PlanStep(id, tenantId) |
| C9WorkReceipt | `C9WorkReceipt_pkey` PK(id); `C9WorkReceipt_1_key` (id, tenantId); `C9WorkReceipt_2_key` (tenantId, runId, callKeyHash); `C9WorkReceipt_1_idx` (tenantId, state, leaseUntil, id); `C9WorkReceipt_2_idx` (tenantId, runId, domain, kind) | `C9WorkReceipt_1_fkey` (tenantId) → Tenant(id); `C9WorkReceipt_2_fkey` (runId, tenantId) → C9Run(id, tenantId); `C9WorkReceipt_3_fkey` (revisionId, tenantId) → C9StrategyRevision(id, tenantId) |

Partial index: `C9StepBinding_one_execution_idx` UNIQUE `(tenantId,sourceType,sourceId)` WHERE `bindingKind='EXECUTION'`. A canonical execution has one owning C9 dispatch attachment; later strategies may reference the existing binding/outcome as evidence, not attach it as a second new effect. Compound B35/R10 descendants remain under their source root; C9 does not claim each provider slot as another plan action.

All bounded code enum values are stored as TEXT + CHECK, preserving repository migration conventions:

- `C9Run.state`: DRAFT, OPEN, WAITING, EXECUTING, PARTIAL, COMPLETED, STOPPED, CANCELLED, EXPIRED. DRAFT is an admitted request before an immutable proposal exists.
- `C9StrategyRevision.state`: PROPOSED, VALIDATED, AWAITING_APPROVAL, ADMITTED, EXECUTING, PARTIAL, COMPLETED, STOPPED, CANCELLED, EXPIRED, SUPERSEDED. `ADMITTED` means the selected **coordination** plan is reviewed/validated; each effect still waits for its own owner approval. It never grants blanket effect authority.
- `reviewDecision`: ACCEPTED or DECLINED, nullable until exact authenticated review. Decline closes the revision STOPPED; no separate business revoke fact.
- Domains: ADMIN, CLIENT_LIFECYCLE, OCCUPANCY, BUSINESS_INTELLIGENCE. `C9WorkReceipt.domain` additionally admits ORCHESTRATOR as coordinator accounting, not an agent.
- Step kind/state, binding kind and work kind/state are exactly the finite values in §4. Entry is EXPLICIT_REQUEST or SELECTED_OPPORTUNITY. No generic JSON “execute SQL/URL/code” kind.

CHECK names and required predicates:

| Model | Named CHECK suffixes (prefix = model name, suffix `_ck`) | Exact predicate groups |
|---|---|---|
| Run | contract, principal, identity, entry, time, state, budget, window, lease, cancellation | version=1; typed exclusive User/Membership or Client/channel principal; SHA-256 identities; entry/ref pairing; admission<validity≤admission+24h and root retention=admission+365d; closed state/currentRevision0..16/counter≥0; typed nonnegative integer budget vectors≤manifest ceilings; 0≤usedMs≤120000 and paired active window within remainder; paired fenced lease; cancel key/time pair |
| Revision | contract, identity, revision, state, strategy, evidence, review, time, terminal, bounds | fixed proposal contract/hashes; positive revision1..16 and parent iff revision>1; closed states; 1..3 uniquely keyed alternatives and typed objective/constraints; typed bounded refs; all review fields set together, selection exists, review≤validity, exact decision; parent/root deadlines; terminal reason/time pair; canonical serialized payload byte/array bounds |
| Step | identity, domain, kind, contract, graph, payload, budget, state, time | hashes and positive ordinal1..12; four domains and BI forbids OWNER_HANDOFF; closed kinds/state; registered version syntax; bounded unique dependency keys; bounded command/ref payload with encrypted nullable content; typed explicit budget slice; lease/terminal pairing by state; inherited deadlines |
| Binding | identity, contract, kind, source, hashes, lineage, time | hashes/key bounds; registered owner/receipt contract; closed binding kind; sourceType allowlist and nonempty opaque sourceId; intent/approval hash pairing; typed bounded tenant/subject/receipt lineage; inherited retention and nonextended observed validity |
| WorkReceipt | identity, domain, kind, contract, evidence, price, reservation, usage, state, time | hashes/call key; coordinator/four domains; closed three kinds; task/registry/model/skill pairing; bounded safe refs; verified price basis or explicit zero-cost proof; bounded integer reservation; usage≤reservation or overrun stops run and emits existing audit without negative balance; state/dispatch/lease/settlement/result pairing; inherited deadlines |

CHECK is **not** proof of current authority, source consent, encrypted R10 contents, acyclic graph or semantic JSON correctness. Five guard functions (`<Model>_guard`) each serve `<Model>_write_trg` BEFORE INSERT/UPDATE/DELETE and `<Model>_truncate_trg` BEFORE TRUNCATE: **10 triggers / 5 guard functions**. Three shared functions are proposed: `C9_validate_graph`, `C9_validate_budget`, `C9_retention_claim`; total **8 functions**. Immutable-field comparison uses explicit allowlists, not only a hash provided by the caller. TRUNCATE denied. DELETE requires matching existing AC6 claim/fence and correct aggregate scope.

Graph guard locks Run → Revision → Step in deterministic order; verifies same tenant/run on optional parent/revision refs, parent revision=n−1, current pointer corresponds to published graph, each option DAG has ≤12 nodes, edges target earlier nodes in **the same option**, no cycle/cross-option edge, ordinal/key uniqueness, digest equals actual immutable steps. Insert revision+all nodes atomically; a deferred constraint trigger is **not** needed if publication/finalization validates the complete graph before transition out of PROPOSED and no consumer can claim PROPOSED nodes. P01 admission transaction creates the full graph then validates before commit; direct partial graph inserts cannot become executable. Per-root max16 revisions is a proposed resource cap, not automatic strategy generation.

Budget guard locks Run and compares old/new receipt deltas; initial reservation, settlement and release are one transaction with the counters. It rejects counters that do not equal stored receipt/step reservation evidence, decreasing consumed counters, extra domains, unknown budget keys or another run's reservation. No direct mutable aggregate writer in agents. Application source validators perform current owner lookups/locks for exact tenant/subject/approval and decode R10 through its existing trusted reader. They do not claim PostgreSQL can decrypt/validate an encrypted receipt by checking its JSON shape.

C9 references to independent sources deliberately follow C8's non-owning reference model. References include `{sourceType,id,tenantId,subjectKind,subjectRef,contractVersion,identityHash,inputHash,observedAt,validUntil?,retentionUntil?}` as applicable. Allowed source models/contracts are registered, not arbitrary table names. Admission validates live exact scope; use revalidates current qualification. A source corrected/deleted/expired after admission makes a pending use unavailable/stale, never blocks the source owner and never rebinds a historical snapshot. Immutable historical refs remain references; they do not guarantee forever replay of expired facts.

## 6. Request, revision, plan and execution identities

Canonical hash contract `maya.c9-canonical/1`: a fixed ordered tuple per intent contract, NFC strings, normalized whitespace **only in schema-declared cosmetic fields**, exact case-sensitive opaque IDs, canonical UTC instants, explicit timezone/period semantics, ISO currency + decimal integer strings, enum spelling and explicit missing/null values. Sort sets by registered stable keys; preserve semantic sequence for plan steps/routes/alternatives. No floating money, undefined fields, raw transport headers, random retry value or raw JSON property-order hash. Store contract/version and test canonical vectors. A server-generated UUID identifies the row; it is not the caller's idempotency event.

| Identity | Exact scope and semantics |
|---|---|
| User request | UNIQUE `(tenantId,requestKeyHash)` binds canonical principal + normalized initial request/entry/one-off constraints. Same durable event + same request returns the same Run even after completion/restart. Different actor/material request under that key conflicts before any work. Current facts are requalified, not re-resolved into a new logical request key. Explicit material edit uses a distinct edit event on that Run. |
| Initial request recovery | `requestIntentJson` keeps only minimized normalized question/objective/period/constraints and safe refs, not chat transcript. Inputs unrepresentable without unnecessary PII are collected on existing secure surfaces or clarified. Same request retry does not need to fabricate original facts from current chat history. |
| Strategy revision | `(tenant,run,editKeyHash)` binds input/material delta/source-evidence/registry hash; `(tenant,run,revision)` gives serial order. Same event+same material → same revision; changed material under same edit key → conflict. Initial reasoning output is validated then admitted once; a competing different valid model output cannot replace the winner. |
| Plan | `(revisionId,optionKey,snapshotHash)`; one selected immutable option. The snapshot digest includes objective, evidence qualification, ordered step graph, dependencies, exact intended audience/content/route/offer, budget bounds and validity. No separate Plan table is needed. |
| Plan step | `(tenant,revision,optionKey,stepKey)` + intentHash. Stable source idempotency is derived from Run/revision/option/step/registered owner slot, never request timestamp or retry count. Same key changed owner intent conflicts. |
| Review | Review event binds exact reviewing principal, snapshotHash, selected option, material scope, all exposed limits and validity. In v1 the request principal reviews its own request under current authority; another user cannot acquire the plan via its ID. A source owner may separately accept its own authorized approver according to that existing contract. Cosmetic text can be rendered afresh without modifying snapshot; material edit creates a new revision. |
| Approval / action ref | `(stepId,bindingKind,slotKey)` + full bindingHash; verified actual owner source identity/input/approval digest. One source execution attachment, exact source admission event, no free-standing C9 permission. |
| Work | `(tenant,run,callKeyHash)` + task/domain/input/version/reservation hash. Replay returns settled safe result or explicit pending/held status; does not consume a fresh call or issue another paid request. A new explicit edit may allocate new slots only within remaining original limits. |

Source effect identity and C9 request identity remain distinct. Different C9 request keys with the same desired business action follow the **existing source duplicate policy**, not a new global C9 dedupe definition. Same source key/different intent remains source conflict. C9 cannot create a fresh owner key to escape that conflict.

Publication/claim: re-read principal/access, source policy, C7/C8 qualification and selected revision under root fence before publishing or handing off. Material stale evidence → require a new revision/review; immutable prior snapshot remains. An expired 24h root cannot be revived by a new child revision or a fresh policy check. A new explicit request after expiry is a new intent with its own review, not automatic retry. Already-admitted owner effects remain under their own lifetimes/reconciliation, including after the C9 proposal expires.

Concurrency/restart protocol:

1. Root unique insert chooses one request winner; lock root for revision sequence and resource admission.
2. Admit immutable revision/DAG, preserve prior review/evidence on material supersession. Cancel/supersede CAS fences unstarted steps; never rewrites original approval or owner execution.
3. Claim only selected-option eligible node under current authority, graph and budget. Lease expiry is a recovery signal, not proof no effect occurred.
4. Before a canonical owner can start an effect, persist its exact immutable request and durable admission receipt through the existing ingress/R10/B35 owner. Attach the C9 binding in the same supported admission transaction, or recover it from that **already durable** owner receipt using the same identity before any continuation. No interval where an effect has neither source receipt nor recoverable identity is permitted.
5. `withActionInvocationReceipt` nests by replacing context: do **not** install an outer/inner C9 hook that silently disables R10. Extend/combine its existing trusted admission observer where needed; source persist + R10 receipt commit remain atomic. C9 crash after that commit recovers from R10/owner receipt, not from a new handler invocation with new arguments. `normalizedInputHash` and registered route must match.
6. A worker losing its fence cannot dispatch. Cancellation racing owner admission serializes on the step/run fence; if the owner admission already committed, report the admitted effect and use only source-supported cancellation. No fabricated rollback.
7. Read source outcome every status/continue; confirmed success skips. UNKNOWN keeps the same execution and blocks dependent nodes. Independent already-approved branches can proceed within original caps. No new provider/channel/device/audience choice on recovery. Terminal deterministic failure closes descendants; changed strategy is a new owner-reviewed revision.

## 7. Approval and canonical action mapping

New Action Engine classes: **0**. Proposed C9 coordination endpoints may persist derived request/review/cancel/receipt state under the C9 owner; they are not a business mutation class and cannot write source models. Source effect approvals continue through their existing exact surfaces. New AC6 class is separate (§12).

| Existing receipt / owner | C9 attachment and supported approval | Compound boundary |
|---|---|---|
| ActionExecution | Existing exact inputHash/identityFingerprint, actor/tenant/policy/approval fields; attach verified execution and required approval refs | No generic all-plan permission. Existing class policy alone decides whether approval is required. |
| AiApprovalRequest + AiToolExecution/R10 | Exact approved tool/payloadHash/expiry + encrypted canonical receipt bindings; use existing approval/execution service | R10 can reference its already-admitted ordered canonical binding set. Handler incomplete is not tool success; adding a new binding after resumed settled plan is forbidden by existing receipt service. |
| B31/B33 own booking | Exact authenticated canonical Client/channel, immutable booking intent and existing confirmation receipt | Create/reschedule/cancel retain their own contracts. No phone/User-as-Client or staff action reinterpreted as Client consent. |
| B35 MarketingCampaign / audience | `campaignId`, immutable `bulkIntentHash`, exact previewed manifest and owner confirmationHash/ActionExecution | Existing root approval covers **that fixed B35 recipient/slot plan only**. C9 review does not call confirm for the owner; source confirmation requires actual source-authorized user event. No general compound C9 approval is found. |
| A22 configuration revision | `tenant_business_configuration` canonical operation, exact namespace/previous revision/content hash, owner confirmation and its AE | Confirmed typed C9 configuration through existing owner. Strategy constraint is not an A22 write until separately confirmed. |
| OwnerReportRun / A12 / CD | Exact immutable report type/day/version/timezone/intentHash and executions; access/download stays source-authorized | Existing Inbox→Telegram→APNS plan/recipient/device sequencing, partial resume and UNKNOWN unchanged. Report configuration approval does not authorize arbitrary one-off message/channel. |
| P407 / Package4 value / staff schedule / operational task owners | Registered existing capability's own exact command/approval receipt only | BI cannot dispatch writes. Unsupported action has no adapter and stays unavailable; existing source access is not broadened for a domain. |
| Opportunity / AgentTask | Exact qualified selected Opportunity and existing task fingerprint/domain/expiry as assignment evidence | Selecting Opportunity permits reasoning only. Reuse an existing matching AgentTask where its contract allows; do not invent an Opportunity merely to create an AgentTask for an explicit request. C9WorkReceipt provides run-local task accounting, not a second business task owner. |

Freshness caveat: `CanonicalApprovalBindingService.permitsDurablePolicyResume` is explicitly limited to approved existing R-C owner classes with NOT_REQUIRED approval and current policy; C9 cannot extend it to every plan/effect. A24h C9 review does not make a60s source approval permanent. Before each unstarted effect current source authorization/policy/consent must still pass. Required expired source approval is renewed by that owner and exact approver; it is not silently refreshed by Orchestrator. No old ALLOW overrides current revocation.

Paid audience/offer/source inputs may require a preview to obtain the immutable material hash. That preview is a named canonical preparatory step, with its own bounded resource accounting and no send. Source-created preview objects stay under their existing retention. Changes to audience/content/offer/channel/limits create new C9 revision and source preview/receipt, not an in-place modification or relabelled approval. Known completed effects are referenced as history and not repeated on a material edit.


## 8. One code registry, safe context and AgentResult@1

Registry manifest `maya.c9-capabilities/1` is released code, not a runtime-editable row. Persist its SHA-256 in the Run budget manifest, Revision, Step and WorkReceipt. Skill/task/prompt bundles are likewise code with immutable digests and offline evaluation references. Old manifest must remain interpretable for the retained historical result; current security revocation may block new work even if its old manifest allowed it. Removing a manifest never causes silent substitution of a new model/tool/owner. No fifth agent, downloadable executable skill, arbitrary code tool or database policy authoring.

Each entry has exactly: `capabilityKey`, `contractVersion`, `domains`, `mode` (READ/PROPOSE_ONLY/OWNER_HANDOFF), `toolOrInterface`, `ownerKey`, `inputContract`, `outputContract`, `principalKinds`, `scopeResolver`, `featureRefs`, `providerAvailabilityResolver`, `sourcePolicyResolver`, `approvalAdapter`, `idempotencyAdapter`, `resourceClass`, `timeoutMs`, `maxInputBytes`, `maxOutputBytes`, `evidencePolicy`, `taskBundleRef`. Names do not grant rights. Resolved availability = registry membership ∩ current principal/tenant/branch/Staff/Client authority ∩ source policy/consent ∩ provider support ∩ entitlements ∩ current budget. Any unknown required condition denies that capability with a safe reason.

Initial registry composes the **47 existing catalog definitions** (enumerated in `registry-mapping.json`) with existing typed interfaces for C7/C8 reads, B35 preview/status/confirm, governed A22 configuration and OwnerReport status/download. These are new **adapters**, not new source capabilities or Action Engine classes. No unrestricted provider URL or model-supplied tool name is executed. Every catalog write appears to an agent as **PROPOSE_ONLY**; only the Orchestrator's separately checked owner-handoff adapter can call its existing ingress. Unsupported existing definitions remain explicitly unavailable, not assigned a guessed executor.

Domain boundaries:

| Domain | Reads / proposal scope | Effect boundary |
|---|---|---|
| ADMIN | Catalog, own Client visits/loyalty, permitted consultation/availability; bounded existing operational/setup support | Own booking uses canonical Client proof/B31–33; operational/config mutations use exact existing staff/owner authority. Admin is not admin privilege. |
| CLIENT_LIFECYCLE | Qualified C7 history and C8 permitted value/dormancy/ranking, source-labelled reviews/loyalty where allowed | May propose B35 preview/return options. Value/rank is never consent/contact permission; exact B35 review/admission required. |
| OCCUPANCY | Permitted capacity/slots/staff schedule/journal and qualified C8 availability context | May propose supported existing invitation/schedule/booking actions; cannot transform staff authority into a Client confirmation. |
| BUSINESS_INTELLIGENCE | Existing authorized business/finance/staff measurements and C8 results; same denominators/basis/completeness | READ only, including expenses. Expense completion is a separate explicit existing-owner operation, never a BI tool call. |

Principal union is a new code contract over **existing** identities: authenticated User/Membership scope or supported verified ClientChannelLink principal. It must not fabricate a `userId` to satisfy current `AiToolPrincipal`'s User-based interface. For valid Client without Maya User, use the existing channel-qualified Client ingress/reader; User-only tool unavailable unless an existing canonical adapter supports that principal. Wrong/missing/revoked binding denies before any challenge/action/Client creation. Roles/IDs/tenant cannot be accepted from agent arguments.

Typed context `C9Context@1` separates: trusted principal/policy/version; exact qualified business facts with source refs/asOf/basis/completeness; untrusted user/provider text and explicit notes; output constraints. Raw identifiers in source refs become per-run opaque handles before LLM use, resolved back only by a trusted server map. No contacts, raw provider payload, credentials or hidden chain-of-thought. Aggregates are not labelled anonymous merely because names were removed. Finance-denied users cannot obtain financial rank/value indirectly through Lifecycle or a second agent. BI and all agents receive only the intersection, never the union, of requested and permitted scope.

`AgentResult@1` retains the gate §13 names; its minimum fields are not renamed away:

- `agent_id`: exact four-domain enum; `intent`: registered bounded intent key.
- `findings[]`: ≤20 `{statement≤800 chars,evidence_refs≤8}`; every factual clause resolves to permitted evidence. Suggestions explicitly labelled as such; statement alone is never fact authority.
- `facts_used[]`: ≤100 `{capability,status:measured|measured_incomplete|not_measured|unavailable,as_of,evidence_refs,completeness,basis?,currency?}`. Missingness is mandatory, not omitted because inconvenient.
- `confidence`: high/medium/low describes **grounding of this answer**, not return/no-show probability or causal uplift. Deterministic validator caps it low when essential facts are absent; high requires complete qualified essential evidence. It cannot change C8 eligibility.
- `limitations[]`: mandatory, ≤20 ×400 chars; explicit empty only when validator confirms none. `recommended_next_capability?`: registered currently permitted proposal, not automatic dispatch.
- `proposed_action_intents[]`: ≤12 typed existing contract intents with registered capability, safe handle arguments, source-derived risk/approval/reversibility, rationale, and required bounded `audience_size` for communication. BI must have `[]`. The deterministic adapter rejects forged risk/consent/approval claims. No discounts/offers absent existing supported contract.
- `presentation_hint?`: ≤400 chars, untrusted rendering suggestion.
- Required additional `completeness` envelope: `{status:COMPLETE|PARTIAL|UNAVAILABLE,requestedScopeHash,returnedCount,totalCount:null|integer,hasMore:boolean,cursorRef:null|opaque,truncated:boolean,reasonCodes[]}`. `evidence_refs` top-level ≤100 and `contract:'AgentResult@1'` required. Entire UTF-8 result ≤32KiB, unknown fields denied.

No `.slice(0,200)` may silently turn a partial source into “all clients/the top business list”. Adapt existing sanitization **before** destructive truncation: preserve source coverage/count/cursor, page≤100, total evidence processing within source cap + whole-run budget. Oversize result is rejected or explicitly returned PARTIAL with original source coverage. Never infer totalCount from capped length. Source authoritative aggregates can describe complete scope without loading full row lists; agent output truncation does not invalidate an independently complete aggregate but must be disclosed. C8 ranking retains its own admitted cohort/coverage and may not be relabelled complete after C9 truncation.

## 9. Resource budget and business exposure — exact proposed contract

All numbers here are **proposed technical ceilings for envelope approval**, not current implemented behavior or a claim about pricing. Owner-approved direction 2/6/12/120 is preserved. Stricter existing tool/model/tenant limits always win; C9 does not raise them.

| Resource | Hard v1 ceiling / accounting |
|---|---|
| Domains | ≤2 distinct delegated domains per Run, including across revisions/retries; Orchestrator is not a fifth/third domain |
| Tools | ≤6 dispatches per delegated domain, ≤12 total across domains + coordinator, including read and source-handoff invocations. Source-owned B35/CD internal slots are separately bounded business exposure, not another agent delegation. |
| Model invocations | ≤12 total, no more than2 concurrent delegated calls; coordinator synthesis is serialized after required results. No recursive agent-to-agent calls. Each call has a stable reserved identity. |
| Tokens | Per model request ≤8,000 total input tokens (system/tool definitions/context included), ≤4,000 output tokens; Run ≤96,000 input +48,000 output tokens. Actual existing provider/context/output caps may be lower. Released provider tokenizer or documented conservative upper-bound estimator required; unavailable bound → no paid call. Truncation never hides omitted evidence. |
| Time | ≤120,000ms **charged active reasoning wall time** for whole Run. One root reasoning window may host the two domains concurrently; wall time charged once, not double-counted as CPU time. Owner review/source reconciliation wait is excluded, but does not grant a new120s allowance. |
| Individual timeout | min(existing registered tool/model timeout, current remaining window). Provider timeout is not proof a dispatched mutation/call did not occur. |
| DAG/options/revisions | ≤3 options, ≤12 nodes/option, ≤16 revisions/root; only reviewed selected option executes. These are resource bounds, not a reason to pad alternatives or initiate16 revisions automatically. |
| Size | Root canonical request≤16KiB, principal≤4KiB, budget manifest/state≤16KiB each; revision canonical payload≤64KiB; step encrypted normalized command≤16KiB and total refs≤16KiB; binding lineage≤8KiB; work inputs refs≤16KiB/result≤32KiB. All typed evidence arrays≤100 unless a smaller field bound applies. Source-owned cohorts are referenced, not copied into these limits. |
| AI monetary ceiling | **No invented numerical default.** Required approved finite `aiCostCapMicros` (integer string) + one supported ISO currency + immutable currently valid provider/task price basis. Missing/zero paid allowance → paid work not started. Deterministic zero-charge reads may continue. Configuration and price admission semantics below are exact; no production price is claimed by this document. |

Budget JSON is a closed contract, not arbitrary ledger data:

- `budgetManifestJson`: `{contract:'maya.c9-budget/1',registryHash,limitVersion,domainsMax,toolCallsMax,toolCallsPerDomainMax,modelCallsMax,inputTokensMax,outputTokensMax,inputTokensPerCallMax,outputTokensPerCallMax,reasoningMsMax,parallelDomainsMax,aiCost:{currency,capMicros,priceManifestHash,validUntil}|null,tenantConfigRef|null}`. Omitted AI cost config means **no paid allowance**, never infinity. Caps can be tightened by confirmed A22/release policy; an increase requires a new explicit request/configuration, not mutation of the running manifest.
- `budgetStateJson`: `{contract:'maya.c9-budget-state/1',domains:sorted enum set,tool:{reserved,settled,held,byDomain},model:{reserved,settled,held},tokens:{input:{reserved,settled,held},output:{reserved,settled,held}},aiCostMicros:{reserved,settled,held},dispatchExposureRefs:[...]}`. Counts/costs nonnegative exact integers, no IEEE floating currency. Monetary integer strings are bounded to signed64-bit nonnegative range (0..9223372036854775807); this is representation safety, not a commercial allowance. `domains` never shrinks to evade2-domain limit. Sum of held+settled+reserved≤immutable cap. Counters retained across all revisions.
- `priceBasisJson`: `{contract,providerModelKey,taskKey,currency,unitScale:1000000,priceVersion,sourceEvidenceRef,verifiedAt,validUntil,inputRate:{numerator,denominator,tokenUnit},outputRate:{...},fixedFeeMicros,maxAdditionalFeeMicros,hash}`. Existing current provider/billing configuration supplies evidence; an LLM, user-supplied URL or historical constant does not verify it. If all possible billable components cannot be upper-bounded, paid dispatch denied. Nonzero values are supplied/verified at activation, not fabricated in this mapping. No credentials stored. Single run currency; incompatible quote currency unavailable, no FX conversion introduced.
- `reservationJson`: `{contract,toolCalls,modelCalls,domain,inputTokens,outputTokens,costMicros,priceHash|null,zeroCostEvidenceRef|null,stepRef|null}`. Reserve full token bound and `ceil(inputBound×rate + outputBound×rate + all maximum fees)` in microcurrency using integer rational arithmetic. Cache discounts not assumed; free work requires positive zero-charge evidence, not missing price. Priced external tools also reserve their fixed upper bound.
- `usageJson`: `{contract,usageReceiptRef,verifiedAt,inputTokens,outputTokens,costMicros,priceHash,completionKind:CONFIRMED|ABORTED_BEFORE_DISPATCH}` once verified. It does not claim a payment/refund. Provider-reported usage above a cap is an incident/stop via existing audit, not silently clamped; no further paid work until reconciled by the existing provider/billing owner.

Transaction protocol: reserve under Run lock **before dispatch**, insert WorkReceipt with unique call key and increment counters atomically; duplicate same input returns it. Persist DISPATCHED before call. Confirmed response validates safe result and settles once, returning only proven unused reservation; consumed call identity never becomes reusable. Crash before proven dispatch may safely abort/release cost under fence while keeping the attempt history/count. Crash/timeout after dispatch → HELD_UNKNOWN; hold worst-case tokens/cost, no automatic resend. If a later verified provider receipt resolves it, settle same row once. If provider cannot reconcile, remain held/partial; do not invent a refund or a new random request. Model failure cannot trigger a paid fallback provider without its own permitted reserved slot and original cap; it never substitutes a business action.

Reasoning window: record start/deadline before active reasoning; pause/checkpoint charges elapsed wall and clears pair atomically. On uncertain worker death charge the **entire unclosed reserved window** conservatively before any resume, not0. This may exhaust120s and return a useful partial result; a retry cannot recover an unproven unused interval. Waiting for human/source outcome does not run a heartbeat model. Source reconciliation uses the existing owner, not an autonomous strategy loop. Existing dispatch timeouts remain unchanged.

Business exposure is distinct from AI spend: each selected option/step fixes source preview refs and bounded `{maxActions,maxRecipients,maxMessages,providerCost:{currency,maxMinorUnits,quoteRef}|verifiedZeroCost,offerRef|null,maxDiscountMinorUnits|maxDiscountBps|null}` under an exact existing supported contract. Audience/route/content hash is included. No cap/quote for a paid component → step ineligible. B35 root+slot recipient/channel/device plan and existing MarketingPolicy limits are consumed by reference; its `costEstimateStatus=unavailable` cannot mean zero. Discount null means **no proposed discount**, not unlimited. Independent branches reserve against the original selected total; revisions cannot reset already consumed business exposure. Never sum currencies or count provider messages from reasoning token counters. Actual invoices/charges/value mutations remain with billing/P4/source owners. No C9 payment class or financial journal.

Operational activation boundary: envelope can be implemented/tested with synthetic priced/zero-price fixtures after approval, but **paid production reasoning stays unavailable until a valid configured cap and verified price manifest exist**. This is the already-approved D10 fail-closed branch, not another schema decision or guessed commercial tariff. No live prices were fetched or changed during this documentation cycle.

## 10. A22 profile / source / report mapping (P03)

One added existing-owner namespace: **`c9_orchestration`**, payload contract `maya.c9-tenant-context/1`. The existing A22 `contractVersion=1` and immutable revision predecessor/approval semantics remain. Server validation rejects extra keys and unsafe free-form policy code. This payload is confirmed configuration under A22 retention, **not** a new C9-derived365d row; C9 proposals/reference snapshots retain only its id/hash/version. No historical chat/default is backfilled as a confirmed configuration.

Exact payload keys:

| Key | Typed contract / bound | Existing source / use |
|---|---|---|
| `contract` | fixed `maya.c9-tenant-context/1` | Discriminator inside existing encryptedContent |
| `profile` | `{vertical:barbershop|beauty|dental|auto_service|service_business,staffing:solo|team|multi_branch,branchRefs:[]≤100,timezoneSourceRef,serviceCatalogSourceRef}` | Confirmed contextual classifications and exact existing Tenant/Branch/catalog refs. This does not create clinical/vehicle records or mutate timezone/catalog through C9. Solo intake skips payroll/team questions. |
| `strategyConstraints` | `{discounts:forbidden|existing_owner_only,allowedObjectiveKeys:[]≤12,valuationPolicyRef:null|exact A22 c8_valuation revision,businessRuleRefs:[]≤40}` | No universal dormant/value/cadence number. Standing policy changes to C8/billing/business_rules go to their original namespaces/owners; one-off “без скидки” need not write this configuration. Missing enum/objective remains explicit unset/unavailable, not inferred by model. |
| `sourceReferences` | ≤20 `{key,kind:reference_only|existing_connector_ref,url:null|normalized safe URL,connectorRef:null|exact existing integration ref,purpose:business_context|existing_report_source}` | Owner confirms a reference, **not** access/qualification. URL has no credentials/userinfo/fragments/secret query; no network fetch. Only allowed existing connector adapter may obtain facts. Supported/unsupported/expired qualification is derived live, not editable “verified:true”. New scraper/OAuth provider is out of scope. |
| `reportPreferences` | ≤3 uniquely typed `{reportType:daily_report|morning_owner|morning_staff,enabled:boolean,localHour:integer0..23,timezoneSourceRef,scope:existing_eligible_owner|existing_eligible_staff}` | Existing OwnerReportRun/A12/CD owner resolves recipients, allowed snapshot and fixed channel order. No raw recipient/device/channel IDs or custom SQL/PDF report. Staff scope means that owner's existing eligible Staff, not arbitrary audience. |
| `resourceLimits` | null or `{domainsMax:1..2,toolCallsPerDomainMax:1..6,toolCallsMax:1..12,modelCallsMax:1..12,inputTokensMax:1..96000,outputTokensMax:1..48000,reasoningMsMax:1..120000,aiCost:{currency,capMicros,priceManifestRef}|null}` | Owner may explicitly set a tighter supported coordination ceiling. Price manifest is verified release/provider evidence, not an owner-authored fake unit price. Missing AI cost config closes paid reasoning only. Effective min of registry/release/tenant bound is frozen at Run admission. |
| `exposurePolicyRefs` | `{marketingPolicyRef:null|exact current owner ref,offerPolicyRefs:[]≤12}` | References to existing validated limits/offer owners; no second MarketingPolicy/discount ledger. |

Payload ≤32KiB after normalization, no contacts/secrets/arbitrary prose rules. Existing `business_rules` holds already-approved bounded human instructions separately, treated as data constrained by deterministic policy. New namespace may not weaken `businessRuleContainsKnownPii`/A22 permissions.

Report integration is narrow: existing `OwnerReportsService.tick` currently chooses `OWNER_REPORTS_MORNING_HOUR`/`EVENING_HOUR` (8/21 defaults) while source-run identity is type/date/version. After a confirmed C9 report preference, that existing owner uses the permitted tenant local hour for **future eligible occurrences**. An already-admitted same-date report is not regenerated or re-routed; a schedule edit does not create another logical daily run. No confirmed preference means the existing independently authorized report baseline remains as-is and is displayed as existing configuration/default, never “confirmed from chat”. Existing user/global enabled and communication preference denials still win. No new scheduler, recurrent strategy or report sender is added.

Typed conversational flow: extract draft with uncertain fields → render material diff → validate current permitted source refs + A22 predecessor → exact owner confirmation on existing A22 ingress → source execution/revision receipt → current configuration reader. Unsupported requested configuration returns its unsupported field/capability; it is not stuffed into an untyped JSON fallback. Credentials route directly to existing integration/OAuth screens without entering LLM context, C9Run or logs.

## 11. Security, entry APIs and safe readers

Proposed code location: one `src/orchestration/` module integrated into the existing `AiCoreService` entry/router. Names in this document are **implementation targets**, not files claimed to exist now. Existing HTTP/chat/stream/native/Telegram/voice consumers become initiators of this owner. No alternate Orchestrator behind Python/history/realtime or role-based fork.

Finite coordination API mapping (same existing authenticated backend surface groups, no new public provider surface):

- `POST /api/orchestration/request-identity`: current authenticated principal obtains a purpose-bound expiring C9 request event envelope; no business effect and no authority grant.
- `POST /api/orchestration/runs`: exact valid event + bounded normalized initial request or explicitly selected currently eligible Opportunity. No timer/Opportunity creation hook initiates it.
- `POST /api/orchestration/runs/:id/revisions`: explicit stable edit event, base revision and material typed delta; cannot reset root budget/deadlines.
- `POST /api/orchestration/runs/:id/review`: exact snapshot/option/review event, current principal and limits; records coordination review only. Source owner approvals are submitted to their existing supported surfaces by the actual authorized actor.
- `POST /api/orchestration/runs/:id/continue` and `/cancel`: exact run/revision/event and current authority; continue resumes bound work only, not autonomous replanning.
- `GET /api/orchestration/runs/:id` / `/revisions/:revision`: permitted minimized state/evidence/receipt projection with source qualification. History pages≤50, bounded date window≤365d, no raw payload download.

Retention-safe event identity: new C9 coordination envelope is signed with purpose-separated existing server identity/crypto primitives, `{purpose:c9_request_v1,eventId,tenantId,principalHash,issuedAt,expiresAt}`; maximum24h, no bearer authority without current authentication. The client retains it across retries, not reminted per HTTP attempt. Envelope hash + issued/expiry are part of `requestIntentJson`/requestHash. Signing key/version reference follows existing secure configuration, never LLM/Git secret. This is a C9 request-age proof, **not a replacement for B31/B33/R10/source approval tokens**. After Run cleanup, an old signed event is expired and rejected **before insert**, so erasing365d derived history cannot turn an ancient retry into a new business outcome. Reissuing an envelope requires a new explicit user request event; it cannot silently stand in for a failed retry. New-purpose signer/validator tests are P01 scope; no new table/field or business action. Key rotation which prevents old envelope verification fails closed; it never creates a new event automatically.

Authorization is live on every read/review/claim, including after changing chat mode. Source ownership checks are not replaced by C9 principalJson/authorityHash. Membership revocation, wrong Client/tenant, expired ClientChannelLink, staff branch/scope change or finance denial prevents new access/effect. Existing principal may validly have no Maya User only through the supported Client binding path. C9 does not create hidden User/Client/link or infer authority from phone/name/session.

D9/C7 access carries through: tenant owner/business owner alone may use bounded tenant-audit safe allowlist; no platform rows/raw payloads. Manager is not automatically finance-authorized. Staff sees own permitted scope; Client sees own allowed facts, not business ranking. LLM projections exclude raw Client PII and necessary source IDs are opaque handles. User-provided URLs, reviews, notes and provider prose cannot set recipient/approval/policy/tool identities. Structured requests do not bypass current source consent. No C9 mass contact-list/PDF export; existing authorized OwnerReport snapshot download remains under its owner.

A source receipt referenced by another principal is not a sharing permission. If source authorization cannot confirm the caller's ability to inspect it, C9 status exposes only unavailable/denied safe reason, not leaked arguments/outcome amounts. Historical display says source status as-of when appropriate; it never asserts an expired/deleted source is current.

## 12. Retention / holds / AC6 / tenant deletion

One new **AC6** action class: `expire_c9_orchestration_runs`, policy `chapter9.orchestration-retention`, version1, through existing MaintenanceRun/ItemClaim/coordinator/fenced execution. This is the only new lifecycle class, not a new Action Engine business class. It owns the five-table derived aggregate; it must not call any canonical business/source delete method.

| Entity / every field | Derived or source / personal | Expiry and retention | Hold / deletion / FK semantics |
|---|---|---|---|
| C9Run | Derived request/resource evidence; principal-sensitive, never a source fact | New reasoning/handoff validity≤24h; minimal root identity/budget≤firstAdmission+365d; earlier-expiring child payloads deleted separately | Matching AC6 root claim; future use stops even if deletion held. Tenant RESTRICT. Delete last. |
| C9StrategyRevision | Derived objective, evidence refs, minimal public rationale and exact review; personal when subject-linked | Child admission does not reset root retention/validity. Superseded review/history immutable until scoped cleanup | All children removed first under same aggregate claim; previous-revision self-FK removed reverse revision order. No rewrite to fit new source association. |
| C9PlanStep | Derived typed intent/dependency/budget and claim; possible necessary encrypted draft content | Same/earlier root cap; minimize `intentEncrypted` once source intent binding makes duplicate payload unnecessary, keeping hash | RESTRICT own parent; no FK/source mutation. Pending payload removal makes that step unavailable, never regenerated from model memory. |
| C9StepBinding | Derived exact reference to source/approval/assignment/outcome; sensitive metadata | Same/earlier root cap and identifiable dependency deadline; source has separate independent retention | Immutable reference is not evidence source copy. No FK into source; deletion cannot delete source execution/consent/payment/history. |
| C9WorkReceipt | Derived minimized safe result, model version and request resource reserve/usage; potentially personal | Same/earlier root cap and retained input dependency deadline | Billing/source evidence, where needed, already belongs to its existing owner. C9 cannot erase invoice/audit or preserve raw prompts as a “budget log”. |
| Code registry, skills, evaluation definitions | Nonpersonal versioned release artifacts | Normal repository/release history, not C9 personal row retention | No live personal training corpus committed; old approved version identity remains inspectable. |
| Confirmed A22 config / source receipts / existing notes | Existing owners, **not new C9 derived models** | Existing contracts unchanged | C9 has no deletion/retention extension authority over them. |

Same C8 precedent: **no new hold field or hold authority**. An unresolved/denied canonical MaintenanceRun claim retains the exact aggregate fail-closed with existing evidence; this is not an owner-configurable forever hold. Existing legal/security/source retention takes precedence through its own authorized owner. C9 cannot invent a legal hold or duplicate security evidence to bypass365d. Expired C9 use stays forbidden while a deletion hold is unresolved. Admission of a known earlier-expiring personal derived dependency caps child retention; only opaque source references may remain where their existing contract permits, never a copied Client dataset under a later date.

Cleanup protocol: select a Run whose own deadline **or any child deadline** is due under bounded existing AC6 policy. Claim exact root id/tenant/requestHash plus due-item identity/deadline/cutoff and fence; block new C9 work. Delete only due WorkReceipts/StepBindings/Steps/Revisions and their due descendants in FK-safe order (revisions newest first); child deadlines cannot exceed parent deadlines. If any evidence/budget receipt needed for continuation is purged, root becomes STOPPED with unavailable history and cannot resume reasoning/handoff. Source executions still reconcile independently. Keep minimal root request identity/budget until its own365d deadline; it contains no copied C7/C8 values or contact database. Delete Run last, only at its own deadline after children are gone. This prevents earlier child expiry from erasing an unexpired request identity. Retrying an old event while this root remains returns STOPPED, not a recreated request. Retries of cleanup continue the same MaintenanceRun/ItemClaim using stable due-set identity and cursor. Five deletion guards verify the same root claim and owned item, not arbitrary “maintenance=true”. Concurrent claims have one winner. No CASCADE to or from business facts. Removing C9 must not interrupt already-admitted source UNKNOWN reconciliation; those immutable inputs/identity/receipts remain independently durable in the source owner.

Tenant deletion waits for applicable canonical hold disposition and scoped C9 cleanup, then follows existing tenant/source lifecycle. RESTRICT prevents accidental disappearance, not permission to ignore retention. No promise of deleting legally retained finance/security/consent audit with a derived root. Request event expiry (§11) closes old retry after cleanup without an indefinite C9 tombstone.

## 13. Evaluation and permanent release ratchets (P06)

This is a **proposed finite release-quality contract**, not measured PASS. No online training, new training model/table, auto prompt promotion or fifth critic agent. C8 numeric calibration remains C8. Reviewed code/skill/prompt/model-task digests plus safe offline evaluation evidence are stored as repository artifacts; production outcomes are not copied into an uncontrolled corpus.

Initial corpus: **120 named scenario cells = 4 domains ×4 verticals ×5 outcome contexts**. Verticals: barbershop, beauty, dental, auto service. Contexts: sufficient qualified facts; limited/unknown C8; denied/revoked authority/consent; material edit/approval expiry; partial failure/restart/UNKNOWN. Each cell supplies fixed permitted evidence/source states, requested intent, allowed/prohibited capabilities, expected completeness, review requirements and deterministic assertions. Add **30 adversarial cross-domain cells**, one per Q, for injection/finance/Client/source/time/budget/history/parallelism/retired paths. Total **150 base cells**, versioned before implementation acceptance; no production personal records/provider calls.

For every changed model/task/prompt bundle, run each applicable cell **3 times** with frozen inputs/provider configuration (450 samples for the full roster). These counts are a bounded regression corpus proposal, **not a statistical confidence claim or C8 calibration threshold**. All security/authority/consent/idempotency/budget/UNKNOWN/schema/completeness/grounding assertions must pass in **every sample**; no average can hide one unsafe call. Deterministic integration tests independently prove the actual effects/denials; passing a model transcript cannot certify authority.

Public rationale rubric: evidence traceability; explicit missingness; feasibility under existing capabilities; material costs/limits/review visibility; correct vertical scope; useful non-fabricated explanation. Score each0=wrong/omitted,1=usable with limitation,2=complete. Candidate must have **no0**, total≥10/12 for each scenario response, and no regression of a previously passing paired canonical scenario to fail. Human review resolves contested scores and signs release promotion; optional model critic can flag concerns, never be sole security/approval oracle. If this candidate fails, fix/retest owned scope; do not relax thresholds because a model output was inconvenient. No claims of “expected revenue lift” or calibrated confidence from this rubric.

Task classes in code: `c9.route`, `c9.admin`, `c9.client_lifecycle`, `c9.occupancy`, `c9.bi`, `c9.compose`. These are **reasoning task keys**, not six agents or new AE classes. Existing supported model-provider configuration may select a reviewed model for a task; model change requires the same budget/price/quality proof. Corpus and result evidence omit raw Client data/hidden reasoning; synthetic fixtures and safe public rationales only.

Permanent proposed specs under `src/orchestration/` (all end in `.spec.ts` so existing mandatory Jest includes them):

| Spec / owner package | Violation class / required proof |
|---|---|
| `c9.registry.architecture.spec.ts` / P01 | Four domains, one coordinator; outside-registry tool denied; retired roster/hidden AiBrainSession strategy owner forbidden; no dynamic skills/eval/SQL provider code |
| `c9.source-boundaries.architecture.spec.ts` / P01/P05 | Orchestrator/provider direct writes and agents/source model mutation forbidden across HTTP/PWA/AI/Python/background/admin; only finite canonical ingress adapters |
| `c9.identity.spec.ts` / P01 | Same request/edit same outcome; changed intent conflict; concurrent admission; signed age/retry after retention; exact Client without Maya User; no phone/User association as authority |
| `c9.approval.spec.ts` / P05 | Strategy review cannot satisfy source approval; B35 compound limited to fixed root; material edit cannot reuse old permission; R10 observer composition/atomic receipt recovery |
| `c9.resume.spec.ts` / P05 | Same source execution after restart; success skip; UNKNOWN dependent wait/independent continue; cancellation race; expiry cannot trigger substitution or fake rollback |
| `c9.budget.spec.ts` / P02 | Atomic reservation,2/6/12/120 limits, token ceiling, unknown paid usage held, no price/cap denied, concurrent claims/lease death, retry/edit never resets counters/exposure |
| `c9.context-and-bi.spec.ts` / P02/P06 | BI no writes; manager no automatic finance; raw PII denied; current scope intersection; untrusted notes/chat/provider cannot become policy/approval/business facts |
| `c9.limited-data-and-strategy.spec.ts` / P04 | 0/8 C8 works honestly; no LLM replacement prediction; ≤3 feasible options, no padding, no-value/no-visit unknown, score≠consent, before/after source correction |
| `c9.policy-and-sources.spec.ts` / P03 | A22 exact owner confirmation, stale predecessor conflict, secret path bypasses model, URL≠access, unsupported sources explicit, report prefs don't duplicate/re-route admitted OwnerReportRun |
| `c9.retention.spec.ts` / P01 | 365d nonrenewal, child source cap, held deletion/use expiry, bounded aggregate AC6 retry, source/history unchanged, tenant cleanup ordering |
| `c9.consumers.architecture.spec.ts` / P06 | No silent cap200, by-category/period/result-card/journal compatibility, same identity on native/web/chat/history/voice, no contact export or alternate effect path |
| `c9.release.spec.ts` / P06 | Q30/6packages/4waves/32surfaces manifest, all above wired; no self-modifying prompt/policy, C10 self-initiation, recurring orchestration or retired Python auto-effects |

SQL proof in a new owned disposable PostgreSQL database must separately test all FKs/uniques/checks/guards, source correction/deletion, immutable revisions/review, tenant crossover, arbitrary receipt pointers, concurrent root/step/budget/cleanup claims, R10 admission crash points and AC6 source preservation. These are **future proofs after approval**; no schema or database tests were run or labelled PASS in this mapping cycle.

Existing Jest `package.json.testRegex=.*\\.spec\\.ts$` covers the proposed colocated specs; mandatory backend suite remains the release authority. Quality corpus execution must be added to the same documented release gate, not a standalone optional script. Preserve all inherited C6/C7/C8 architectural guards and finite relay artifact verification; no unrestricted infrastructure discovery. Gate wiring acceptance proves test-list inclusion and a synthetic negative fixture fails when each ratchet's violation is introduced.

## 14. Shared JSON contracts and remaining-schema exclusion

The physical JSON columns are not permission to introduce undeclared business fields at implementation. Closed v1 shapes, all with extra keys rejected:

- `principalJson` / `reviewActorJson`: `{kind:USER|CLIENT_CHANNEL,tenantId,userId:null|opaque,membershipId:null|opaque,clientId:null|opaque,channelLinkId:null|opaque,branchRefs:[]≤100,staffRef:null|opaque,proofHash}`. USER requires existing exact user/membership; CLIENT_CHANNEL requires exact Client/link, no invented User. Membership optional only where an existing canonical platform/authenticated contract proves that scoped operation; it is never an inferred legacy fallback. Current permissions are resolved again, not copied from branchRefs as authority.
- `requestIntentJson`: `{contract:'maya.c9-request/1',eventEnvelopeHash,eventIssuedAt,eventExpiresAt,objectiveKey,safeQuestion,period:null|existing normalized period,subjectRefs:[]≤100,oneOffConstraints,entryRef:null|qualified Opportunity/AgentTask ref}`. safeQuestion≤2000chars after minimization; raw chat/PII rejected. `oneOffConstraints` uses the same typed supported keys as Revision constraints, with no model-generated standing policy.
- `entryRefJson`: `{opportunityRef,agentTaskRef:null|ref}` only for selected Opportunity; both qualified same tenant/current domain, not fabricated for explicit requests.
- `skillVersionsJson`: ≤6 `{taskKey,skillHash,promptHash,modelConfigHash,evaluationManifestHash}`; code digests not scripts/secrets/prompts stored in database.
- `objectiveJson`: `{key,safeDescription≤1000chars,subjectScopeHash,successCriteria:[{metricKey,sourceCapability,comparison:null|registered comparator,target:null|explicit owner value,basis,currency:null|ISO}]≤8}`. C7 measurement owns actual outcome; LLM target is proposed policy, never measured value or causal guarantee.
- `constraintsJson`: `{scopeRefs,oneOff:{discounts:null|forbidden|existing_owner_only,branchRefs,serviceRefs,requestedPeriod:null|normalized period},sourcePolicyRefs,budgetManifestHash,exposure,requiredApprovalAdapters}`. All refs bounded and registry-qualified; `exposure` is §9's exact currency/quote/action/audience/message/offer structure. No arbitrary evaluator or executable expression.
- `alternativesJson`: 1..3 `{key,title≤120chars,kind:ACTION_PLAN|NO_ACTION,why≤1500chars,evidenceRefs:[]≤20,scopeHash,knownBenefit:{factRefs:[]≤20,proposalText≤1000chars},unknowns:[]≤20,risks:[]≤20,costSummary:{reservationRefs,sourceQuoteRefs,unavailableReasons},approvalAdapterRefs:[]≤12,recommended:boolean}`. At most one recommended. Financial benefit/probability must be an eligible C7/C8/source reference, never numeric LLM invention. NO_ACTION has an explicit `c9.no_action` pure coordination node or empty effect set; it creates no ActionExecution.
- `dependenciesJson`: ≤12 `{stepKey,requires:RESOLVED_SUCCESS|QUALIFIED_READ}` in earlier same-option ordinal. No executable condition language or alternative-provider edge. `budgetSliceJson`: `{callReservationKey,exposure,sourcePreviewRefs}`; source preview may be null only before eligible handoff, not before an effect requiring its fixed material hash. Material completion of a preview produces a newly reviewed immutable revision if it changes what was reviewed; never fills immutable fields in place.
- `evidenceRefsJson`, `inputEvidenceRefsJson`, `lineageJson`: §5 exact typed reference records, `status`, `asOf`, `completeness`, optional bounded unavailable reason; bindings additionally include `{sourceActorRef,sourcePolicyRef,sourceApprovalRef:null|ref,sourceExecutionRefs:[]≤12,ownerRootRef:null|ref}`. Source-owned B35 descendants are reached through ownerRootRef, not an unbounded copied C9 list.
- `intentEncrypted`: existing encryption primitive applied to `{contract:registered input contract,arguments:strict typed owner args,sourceProofRefs}`. Only source-required data, no credentials or copied Client contact database. Owner supplies current trusted actor/tenant/proof; model cannot populate them. Hash normalization occurs before encryption; IV randomness never affects material identity.
- Work `resultJson`: exact AgentResult@1 for MODEL; for TOOL_READ, `{contract:registered output envelope,evidenceRefs,completeness,safeData}` under existing reader schema; for OWNER_HANDOFF, `{contract:'maya.c9-handoff-receipt/1',bindingRefs,dispatchStatus}` only. Source status remains live-owner truth.

No C9 separate models for alternatives, period/finance, review authority, user memory, campaign audience, provider outcome, domain profiles or evaluations. There is no material source-state column to backfill. No alteration of source-owner immutable intent/approval/retention contracts is required by this proposal.

## 15. Package allocation, migration proof and waves

| Package / exact Q membership | Schema allocated | Runtime / acceptance after approval | Dependencies / parallel |
|---|---|---|---|
| P01 — Q02–07,Q24 (7) | All five shared models/123 fields; Tenant five reverse relations; A22 CHECK forward extension;46CHECK/12UNIQUE/11FK/7indexes/1partialUNIQUE; one migration, one AC6 class | Four-domain registry/context/result schemas, signed request age/idempotency, shared immutable graph/claims/retention, PostgreSQL isolation/source safety. P01 provides typed interfaces; no newly enabled agent effects. | Wave1. Shared schema up front avoids later incompatible per-package changes. |
| P02 — Q01,Q12,Q13,Q19,Q26 (5) | 0 new/altered models/fields,0 actions/AC6/migrations | One Orchestrator + BI, budget reserve/usage/time,0/8 C8, grounded safe response. Initial deterministic-only behavior without cost basis is an explicit supported result; paid adapter additionally needs configured valid price/cap. | P01; Wave2 parallel P03. |
| P03 — Q08,Q20–23 (5) | 0 later physical changes; semantic owner of the A22 extension already migrated in P01 | Confirmed profile/policy/source/report intake, material edits, credentials excluded, four verticals, no duplicate reports or chat-derived schedules. | P01; Wave2 parallel P02. No dependency on probabilistic predictions. |
| P04 — Q09–11,Q14 (4) | 0/0/0/0/0 | Admin/Lifecycle/Occupancy reasoning, up to3 feasible strategies, source authority and qualified facts. No second strategy table. | P02+P03; Wave3 parallel P05 using frozen P01 step/binding interfaces. Local pure proposals do not require unfinished effect runtime. |
| P05 — Q15–18 (4) | 0/0/0/0/0 | Exact approvals/owner handoff, source receipts/partial/UNKNOWN/restart, cancelled/superseded work. Combined Wave3 proof composes P04 proposals with P05 execution. | P02+P03; Wave3 parallel P04. No provider work before source admission. |
| P06 — Q25,Q27–30 (5) | 0/0/0/0/0 | Existing consumer integration/carry fixes, safe audit/download,150-cell quality corpus, release ratchet wiring and final32surface proof. | P04+P05; Wave4. |

All **2 altered existing models** are counted once under P01's physical migration even though P03 owns A22 behavior. All packages reuse the same field/constraint/version envelope. Total: **P01–P06 6/6, Q01–Q30 30/30, four waves unchanged**:

1. P01 schema/shared foundation.
2. P02 + P03.
3. P04 + P05; coordinated cutover after both local PASS.
4. P06 + one frozen C9 Final Gate.

Migration order inside the one future migration: acquire documented migration lock → verify expected existing A22 constraint exactly → extend allowlist as strict superset → create root/revision/step/binding/work tables in dependency order → create keys/FKs/indexes/functions/guards → Prisma validation/clean replay → combined PostgreSQL proof. No table/source row UPDATE, invented historical strategy, fabricated receipt/backfill or old identity rewrite. Existing rows satisfy the unchanged predicates; compare pre/post existing constraint definition and rows read-only. Any unexpected production drift/constraint incompatibility is a baseline conflict, not permission to silently repair data.

After approval, required proofs before migration/cutover: exact123columns/5tables/2existingmodelchanges; deterministic replay; all nullability/typed CHECKs; no circular required relations; same-tenant links; source Client/Appointment correction not blocked; independent source expiration; exact immutable strategy/step/review; unique request/edit/call/effect bindings; concurrent claims and budget settlement; source owner admission/receipt crash boundary; signed expired event cannot recreate a purged Run; AC6 cannot delete facts. New schema itself does not activate any agent/provider effect. Existing schema/migration gate and read-only production drift/readiness remain mandatory.

Package gates → wave integration/mandatory backend regression/ratchets/lint/both typechecks/build/Prisma/migration drift → documented coordinated production cutover → structural/read-only verification. Do not run the full Chapter9FinalGate after every package. Only after6/6 production PASS: Q01–Q30,32 inherited surface groups,C9 owner decisions16/16, all schema approvals, all version/quality evidence, WIP0, unresolved canonical decisions0, pendingmigrations0,driftNONE,healthPASS,productionproofeffects0. C10 remains unstarted.

The frozen32surface list is imported unchanged from `evidence/chapter9-preflight/manifest.json`; P06 must record per-surface implementation or preservation/retirement proof, not assert that six backend modules prove all consumers. Maintenance pages and PWA backups keep their separately approved state. No new unrestricted infrastructure inventory or rewritten historical C6/C7/C8 completion.

## 16. Legacy disposition, approval boundary and handoff

L01 historical10-agent roster → history only, four executable domains. L02 AiBrainSession.planJson → no revival as Strategy. L03 ephemeral semantic plan → parser/draft only. L04 unqualified aliases/readiness → live deny-wins registry intersection. L05 silent cap200 → explicit bounded completeness before truncation. L06 carried arithmetic/period/card/journal presentation → C7/C8 reader adapter fixes, no parallel calculations. L07 retired Python auto-effects → remain retired. L08 explicit memory/chat → untrusted notes/context, not source fact/policy/approval. L09 BI expense-write ambiguity → BI read-only; any confirmed expense effect remains separate source-owner handoff. All9 approved dispositions are preserved.

C9 loyal/dormant journey: explicit authorized request → C7 facts → qualified deterministic C8 value/dormancy/ranking with unknowns → selected permitted scope → up to3 feasible strategies → exact material review/owner receipts → bounded existing source execution → C7 outcome refs. Absent probability stays absent. Value/rank is never consent. No autonomous replan/repeated proactive scan, PushSMS connector, contact export, fake expected lift or live agent training is pulled into C9.

**Requested next approval:** this exact five-model/123-field/one-migration/one-AC6 envelope, its typed namespace/identity/registry/budget/result/retention/evaluation mapping, and unchanged4waves. No fresh product choice among D1–D16 is requested. Operational paid-work caps/prices are explicitly required configuration; they are not assumed approved numerical values. Without them the approved deterministic/unavailable branch stays available and paid work stays closed.

Current cycle result: mapping complete, approval-ready **YES**; schema/runtime implementation authorized by this document **NO**. No executable proof or production deployment is claimed. Only documentation/evidence validations were performed. Production baseline evidence is inherited from the accepted preflight, not represented as a new live verification this cycle.

```text
OWNER DECISIONS APPROVED: 16/16
Q01–Q30 MAPPING COMPLETE: YES
EXISTING FOUNDATIONS REUSED: 28
NEW MODELS: 5
ALTERED MODELS: 2
NEW PHYSICAL FIELDS: 123
NEW ACTION CLASSES: 0
NEW AC6 CLASSES: 1
MIGRATIONS EXPECTED: 1
BACKFILLS: 0
CAPABILITY REGISTRY: HYBRID — CODE + IMMUTABLE VERSION REFERENCES
CANONICAL ORCHESTRATOR: 1
CANONICAL AGENTS: 4
P01–P06 COVERED: 6/6
IMPLEMENTATION WAVES: 4
C9 ENVELOPE READY FOR APPROVAL: YES
RUNTIME/SCHEMA/MIGRATION CHANGES: 0
PRODUCTION MUTATIONS: 0
CHAPTER 9 IMPLEMENTATION STARTED: NO
```

Git equality and documentation/hygiene validation are recorded in the accompanying evidence and final response after commit/push. Main pre-existing dirty entries, native workspace and17oldDB are outside this documentation task. No owned server/browser/watcher/database was created. STOP after publishing this proposal; no implementation until envelope approval.
