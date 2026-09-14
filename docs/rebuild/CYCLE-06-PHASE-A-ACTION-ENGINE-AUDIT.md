# CYCLE 06 - ACTION ENGINE

## PHASE A - SIDE-EFFECT & EXECUTION AUDIT

Status: inspect and plan only

Repository HEAD inspected: `88afcc72daa9548603957efa8ce4425b3b2e13d2`

Chapter 5 production closure: `20260821-c05-closure-final`

Scope boundary: no application, schema, database, production data, runtime agent, or external side-effect changes

## Executive Decision

MAYA does not have one Action Engine today.

The repository contains useful execution primitives, but execution semantics are split across four independently reachable owners:

1. the AI tool runtime;
2. direct HTTP controllers and their domain services;
3. schedulers and background loops;
4. the Python/PHP legacy bridge.

The active AI catalog contains 46 tools, not the previously documented 50. It contains 34 READ tools and 12 ACTION tools. The catalog is a policy and dispatch surface for one caller class; it is not a system-wide execution owner. Direct HTTP, scheduler, and legacy paths can execute without it.

The existing durable records cannot represent the minimum generic execution lifecycle required by Chapter 6. In particular, they cannot distinguish a definitive failure from an unknown external outcome, cannot durably record multiple attempts and reconciliation, and cannot cover non-AI request sources. A schema decision is therefore unavoidable.

Decision:

- `UNIFIED ACTION ENGINE EXISTS TODAY: NO`
- `CURRENT EXECUTION OWNERS: 4`
- `SCHEMA GATE REQUIRED: YES`
- implementation must stop before Phase B

## Audit Basis

The audit used repository code and current rebuild decisions rather than prior narrative alone. Primary evidence includes:

- `docs/rebuild/CARRY-FORWARD-REGISTER.md`
- `docs/rebuild/MAYA-ORCHESTRATOR-AGENTS-ARCHITECTURE-GATE.md`
- Chapter 1-5 completion and verification reports under `docs/rebuild/`
- `maya-saas-backend/src/ai-tools/ai-tool.catalog.ts`
- `maya-saas-backend/src/ai-tools/ai-tool-runtime.service.ts`
- `maya-saas-backend/src/ai-tools/ai-tool-policy.service.ts`
- `maya-saas-backend/src/ai-tools/ai-tools.controller.ts`
- `maya-saas-backend/src/opportunities/opportunity.contract.ts`
- `maya-saas-backend/prisma/schema.prisma`
- appointment, CRM, billing, inbox, marketing, scheduler, and reconciliation services under `maya-saas-backend/src/`
- production-reachable legacy processes under `ai администратор/`

No secret value, raw CRM payload, production personal data, or chain-of-thought was inspected or copied into this report.

## Side Effect Inventory

### Risk Facets

Risk must be a set of independent facets, not a single low/medium/high label:

- `REV`: reversible in the authoritative system;
- `EXT`: externally visible to a customer, employee, provider, or payment system;
- `FIN`: changes or can move money or monetary balances;
- `BULK`: can affect multiple recipients or records;
- `DES`: destructive or access-revoking;
- `PRI`: handles privacy, credentials, permissions, or security boundaries.

### Flow Inventory

| ID | Side effect | Entry point / caller | Current executor | External or authoritative system | Risk | Current consumers |
|---|---|---|---|---|---|---|
| S01 | Create appointment | AI tool and direct appointment/CRM HTTP routes | `AiToolRuntimeService` handler or appointment/CRM service | YClients/Altegio or internal calendar | EXT, PRI | clients, staff, admin, native/web/Telegram/voice |
| S02 | Reschedule appointment | AI tool and direct appointment/CRM HTTP routes | appointment handler/service | YClients/Altegio or internal calendar | REV, EXT, PRI | clients, staff, admin |
| S03 | Cancel appointment | AI tool and direct appointment/CRM HTTP routes | appointment handler/service | YClients/Altegio or internal calendar | REV, EXT, DES, PRI | clients, staff, admin |
| S04 | Attendance, duration, services, appointment status | direct CRM journal HTTP routes | CRM/application services | YClients/Altegio and canonical mirror | REV, EXT, FIN, PRI | staff and admin operations |
| S05 | Staff schedule, access, activation, role-like CRM team mutations | AI schedule tool plus CRM/admin HTTP routes | schedule/CRM/admin services | YClients/Altegio and local access state | REV, EXT, DES, PRI | owners, administrators, staff |
| S06 | CRM connect, disconnect, token replacement, import, branch activation | onboarding/admin/CRM HTTP routes | integration and onboarding services | CRM provider plus encrypted local credential store | DES, PRI | tenant owner and platform admin |
| S07 | Loyalty adjustment | AI tool and loyalty HTTP route | loyalty service | internal loyalty authority and optional CRM-derived context | REV, FIN, PRI | owner/admin and customer balance views |
| S08 | Expense, settings, dashboard preference, and task writes | AI tools and direct HTTP routes | domain services and Prisma | local canonical database | REV, FIN, PRI | owner/admin/staff |
| S09 | Inbox item and push notification | AI handlers, schedulers, reports, campaign code, HTTP ingest | inbox service plus push adapter | local inbox and APNs/push provider | EXT, PRI | customer and staff applications |
| S10 | Campaign and multi-recipient delivery | marketing service and legacy reactivation/reminder loops | marketing/legacy senders | inbox, push, Telegram, messaging provider | EXT, BULK, PRI | client lifecycle operations |
| S11 | Checkout, recurring charge, subscription change, payment application | billing HTTP routes, billing scheduler, provider webhook | billing service and YooKassa client | YooKassa and local subscription/payment state | EXT, FIN, DES, PRI | tenants and platform billing |
| S12 | Login, refresh, logout, session/device revocation | auth HTTP routes | auth/session services | local auth state and OAuth providers | DES, PRI | all authenticated users |
| S13 | Tenant, branch, branding, logo, user, and onboarding writes | onboarding/admin/branch/user HTTP routes | tenant/admin/onboarding services | local tenant state, object storage, CRM import | REV, DES, PRI | tenant owner and platform admin |
| S14 | Appointment reminders and owner/staff reports | in-process schedulers | reminder/report schedulers calling inbox/push | local inbox plus push provider | EXT, BULK, PRI | clients, owners, staff |
| S15 | CRM reconciliation and canonical ingestion | reconciliation scheduler and ingestion APIs | reconciliation/ingestion services | CRM read APIs and local canonical database | REV, PRI | WATCH, Business State, Opportunities |
| S16 | Retention/quarantine cleanup | retention scheduler | retention service | local database/object retention state | DES, PRI | system maintenance |
| S17 | Telegram, YClients, YooKassa, reminders, reactivation, waitlist and webhook legacy actions | Python webhooks, bot commands, startup loops | Python/PHP legacy functions | Telegram, YClients, YooKassa, messaging endpoints | EXT, FIN, BULK, DES, PRI | legacy client/staff/owner surfaces |
| S18 | Recovery attribution and operational touchpoints | appointment and recovery services | recovery attribution service | local canonical database | REV, FIN, PRI | reports and opportunity evidence |

### Control and Reliability Inventory

| ID | Authorization | Approval | Idempotency | Retry / timeout | Unknown outcome | Reconciliation | Audit and tenant isolation |
|---|---|---|---|---|---|---|---|
| S01 | role, tenant, feature in AI path; route guards in HTTP path | actor in AI path; route-specific outside it | AI key required; direct/provider path has no uniform provider identity | no AI retry; CRM request timeout | possible after provider accepted create | difficult without a stable provider correlation; local mirror may not contain orphan | AI execution audit only for AI path; service tenant scope varies by entry point |
| S02 | same split as S01 | actor only in AI path | AI key plus local execution dedup; no uniform provider idempotency | no automatic safe retry | possible after provider accepted mutation | generally possible by rereading appointment | no generic attempt/reconciliation audit |
| S03 | same split as S01 | actor only in AI path | AI key plus local execution dedup | no automatic safe retry | explicitly surfaced as CRM outcome unknown | possible by rereading appointment / record-gone handling | runtime currently persists unknown as failed |
| S04 | staff/admin route guards | route-level confirmation, not unified approval | endpoint-specific | provider timeout behavior | possible for every provider mutation | often possible by rereading appointment, but no common worker | controller/domain logs, no unified action audit |
| S05 | manager/owner roles | actor in AI schedule path; direct elsewhere | AI key and optimistic revision where used | no unified retry | possible for external CRM schedule/access mutation | provider reread is possible for many operations | split local/provider audit and tenant enforcement |
| S06 | owner/platform-admin controls | explicit UI/API action, no common approval object | endpoint-specific | provider-specific | token/import/connect may partly succeed | connection/status recheck exists, but not common Action Engine reconciliation | credential encryption exists; no generic execution record |
| S07 | owner/admin and feature policy | owner in AI path | AI key required in AI path | no retry | internal DB outcome normally definitive; provider coupling can add ambiguity | local ledger can be reread | AI audit only when AI initiated |
| S08 | role and tenant checks by domain | mixed: actor, none, or direct route | declared required for AI actions; three no-approval tools do not enforce caller key | no retry | local transaction mostly definitive | DB reread possible | fragmented domain audit |
| S09 | caller-specific | usually none | inbox storage key exists; delivery key does not | push is fire-and-forget | push delivery is unknown | no provider delivery reconciliation | inbox row is durable, push attempt is not |
| S10 | campaign/legacy policy | no unified bulk approval | campaign storage identity is not delivery identity | incomplete retry/lease path | recipient delivery can be unknown | rich schema exists but active sender does not fully use it | campaign schema is tenant scoped; legacy audit is fragmented |
| S11 | billing/admin authorization and provider webhook verification | purchase/contract flow, no common action approval | YooKassa key per payment request | provider timeout; recurring scheduler may run | timeout before provider id is stored can mean charged-but-marked-failed | only possible by provider id in current reconciler | strong webhook claim semantics, incomplete unknown-at-create audit |
| S12 | authenticated user/admin | user or admin intent | session/token-specific | local/provider-specific | OAuth boundary may fail between provider and local claim | session state can be reread | security audit exists outside generic action lifecycle |
| S13 | owner/platform admin | explicit route action | endpoint-specific | service-specific | object upload/CRM import can partially succeed | ad hoc status checks | tenant qualification is domain-specific |
| S14 | scheduler ownership | none | inbox storage dedup; push delivery not deduped | interval retry by next tick only | duplicate or missing push is possible | inbox can be checked; push cannot be proven | no distributed execution lease for all schedulers |
| S15 | system internal | none | cursor/event/current-state checks | scheduled rerun | read failures are safe; local write transaction definitive | this contour is itself reconciliation | DB lease exists for appointment reconciliation |
| S16 | system internal | none | repeated deletion is effectively idempotent | scheduled rerun | local transaction result is definitive | DB query verifies absence | internal maintenance audit only |
| S17 | bot/webhook/loop-specific | command/conversation specific | inconsistent and local-process specific | multiple independent loops/pollers | common for network operations | ad hoc polling in some billing paths only | tenant/security assumptions predate canonical Action Engine |
| S18 | service internal | none | best-effort attribution identity | best effort | missing attribution is silently possible | later reports may reveal gaps, not repair them | tenant-scoped local state, no action outcome record |

## Execution Owner Matrix

| Owner | Reachable callers | Owns execution semantics today | Durable lifecycle | Can bypass AI catalog | Verdict |
|---|---|---|---|---|---|
| AI tool runtime | native/web/Telegram/voice AI requests | policy, approval, dispatch, timeout wrapper, execution row | partial: approval plus executing/completed/failed | not applicable | useful facade, not system Action Engine |
| HTTP controllers and domain services | app, admin UI, webhooks, integrations | route validation followed by direct service invocation | domain-specific | yes | independent execution owner |
| Schedulers/background loops | timers and startup jobs | detection and, in several jobs, direct notification/charge/delete execution | mixed; some DB leases, some process flags only | yes | independent execution owner |
| Python/PHP legacy bridge | Telegram/webhooks/background loops | direct provider calls and local legacy state | fragmented | yes | independent execution owner and migration/security debt |

Provider webhooks are inputs to the HTTP/domain-service owner, not a fifth execution owner. They still require authenticated, idempotent claim and application semantics.

Target invariant:

> One capability has one execution owner. HTTP, AI, agent, scheduler, webhook, and legacy surfaces may request an action, but may not each redefine how it executes.

## Tool Catalog Audit

### Catalog Count Drift

The active catalog in `ai-tool.catalog.ts` contains:

- 46 tools total;
- 34 READ tools;
- 12 ACTION tools.

The Architecture Gate statement of 50 tools (36 READ + 14 ACTION) is stale. Marketing/campaign actions are not present in the active catalog. This is documentation/catalog drift, not evidence that those side effects disappeared from legacy or service code.

### READ Tools (34)

| Domain | Tools |
|---|---|
| Booking and own state (5) | `catalog.services.read`, `booking.availability.read`, `booking.group-availability.read`, `appointments.own.list`, `loyalty.own.read` |
| Analytics and reporting (7) | `analytics.employee.query`, `analytics.business.query`, `analytics.business.profit`, `analytics.revenue.forecast`, `analytics.team-kpi.read`, `analytics.branches.compare`, `reports.recovered` |
| Catalog, commerce and reviews (7) | `catalog.staff.read`, `inventory.stock.read`, `commerce.certificates.read`, `commerce.memberships.read`, `referrals.status.read`, `reviews.list.read`, `reviews.analyze` |
| Client intelligence (6) | `customers.count`, `clients.dormant.list`, `clients.retention.scan`, `clients.dossier.read`, `clients.high-value.read`, `clients.no-show-risk.read` |
| Operations and support (9) | `expenses.read`, `staff.schedule.read`, `staff.schedule.own.read`, `operations.journal.read`, `company.business-hours.read`, `settings.read`, `tasks.list`, `notifications.appointments.read`, `support.integration-status.read` |

READ tools must remain capability computations. They must never acquire hidden writes, notification sends, campaign starts, or implicit approval side effects.

### ACTION Tools (12)

| Tool | Declared risk | Approval | Declared idempotency | Actual key enforcement | Executor | Current outcome contract |
|---|---|---|---|---|---|---|
| `appointments.own.cancel` | medium_write | actor | required | enforced because approval is not `none` | appointment handler/service | completed or failed; CRM unknown is collapsed into failed |
| `appointments.own.create` | medium_write | actor | required | enforced because approval is not `none` | appointment handler/service | completed or failed; provider/local split outcome is not represented |
| `appointments.own.reschedule` | medium_write | actor | required | enforced because approval is not `none` | appointment handler/service | completed or failed; provider unknown is not durable |
| `staff.schedule.update` | medium_write | actor | required | enforced because approval is not `none` | schedule/CRM service | completed or failed; optimistic revision helps stale-write rejection |
| `loyalty.internal.adjust` | high_write | owner | required | enforced because approval is not `none` | loyalty service | completed or failed, no generic reconciliation state |
| `expenses.create` | high_write | actor | required | enforced because approval is not `none` | expense service | completed or failed, local DB result usually definitive |
| `expenses.period.complete` | low_write | none | required | **not enforced**; runtime creates a random UUID when omitted | expense service | completed or failed; duplicate semantic action is possible |
| `settings.update` | low_write | none | required | **not enforced**; runtime creates a random UUID when omitted | preferences/settings service | completed or failed; duplicate request is hidden rather than collapsed |
| `tasks.create` | medium_write | actor | required | enforced because approval is not `none` | inbox/task handler | completed or failed; inbox storage key helps only after dispatch |
| `tasks.complete` | low_write | none | required | **not enforced**; runtime creates a random UUID when omitted | direct Prisma task update | completed or failed; repeat may be harmless but is not proven by shared identity |
| `notifications.appointments.update` | medium_write | actor | required | enforced because approval is not `none` | notification settings service | completed or failed, local result definitive |
| `support.contact-admin.request` | medium_write | actor | required | enforced because approval is not `none` | inbox publisher | completed or failed; push delivery remains unknown |

All 12 declare `retryPolicy: none`. A no-retry policy is safer than blind retry for ambiguous external actions, but it is not sufficient: the system must preserve `UNKNOWN` and reconcile before deciding whether a retry is safe.

Declared policy differs from runtime enforcement for three tools. The reason is structural: `requireIdempotencyKey()` is called only when `approvalPolicy !== none`, even though idempotency and approval are separate concerns.

## Approval Matrix

### Separation of Concerns

| Concern | Question | Current owner | Current problem | Target owner |
|---|---|---|---|---|
| Permission | May this actor request this capability for this tenant and target? | AI policy service or route/domain guards | duplicated and inconsistent by entry point | shared policy evaluation before claim |
| Approval | Has the required human accepted this specific normalized action? | `AiApprovalRequest` for AI tools; ad hoc UI confirmation elsewhere | AI-only and mixed with execution status | durable approval reference independent of executor |
| Autonomy | May this tenant allow this agent/action class to proceed without immediate approval? | not implemented as the approved tenant x agent x action-class policy | no L2.5-to-execution boundary yet | Chapter 10 policy, consumed by Action Engine |
| Execution | Did the capability attempt the side effect, and what happened? | four execution owners | no shared attempt or outcome model | deterministic Action Engine plus one executor per capability |

### Current Approval/Execution Status Mixture

`AiApprovalRequest` contains approval states and execution states in one record:

- approval semantics: pending, approved, rejected, expired;
- execution semantics: executing, completed, failed.

`AiToolExecution` separately contains executing, completed, and failed. Therefore current state is both duplicated and incomplete. It is unclear which record is authoritative after approval, and neither can represent an unknown provider outcome or reconciliation.

Approval must bind to the normalized action hash, tenant, requester, target, and expiry. Changing any executable argument after approval must invalidate the approval.

### Minimum Approval Rules by Risk

| Action class | Permission | Approval expectation | Autonomy ceiling before Chapter 10 |
|---|---|---|---|
| Internal reversible preference/task update | role + tenant + target | explicit user request may be sufficient | no agent auto-execution in Chapter 6 |
| Own booking create/reschedule/cancel | authenticated subject ownership | actor confirmation | no agent auto-execution in Chapter 6 |
| Staff schedule or CRM record mutation | manager/owner scope | actor or owner depending target/risk | shadow/proposal only |
| Loyalty or monetary balance write | finance/owner permission | owner approval | proposal only |
| One consent-safe customer message | authorized operational role | approval based on content and legal basis | proposal only |
| Bulk campaign | campaign permission, consent policy, recipient cap | separate bulk approval with frozen audience/content | proposal only |
| Payment/subscription charge | billing authority and contract basis | payment/mandate-specific approval | never inferred from chat text |
| Session/access revocation | security/admin authority | explicit actor/admin approval | proposal only |
| Destructive data operation | narrow platform authority | explicit high-risk approval | never agent-autonomous in initial engine |

One message and a campaign to 500 recipients are not the same action class.

## Idempotency Matrix

| Action family | Current identity | What happens if executed twice | Finding | Required Chapter 6 rule |
|---|---|---|---|---|
| AI appointment actions | tenant + supplied key in `AiToolExecution` | completed result can replay; failed request can be retried under a new key and re-execute | local dedup exists, external identity is incomplete | stable semantic identity must reach executor/provider or reconciliation |
| Direct HTTP appointment actions | endpoint-specific request data | duplicate provider mutation is possible | AI key does not protect direct route | HTTP must submit the same execution request contract |
| No-approval AI writes | runtime-generated UUID when caller omits key | same semantic request creates a new execution | declared `required` is not enforced | idempotency enforcement must not depend on approval policy |
| CRM schedule/access writes | tool key or endpoint-specific | duplicate/stale mutation may apply; revision protects only some schedule updates | inconsistent | normalized target + version + stable request identity |
| Loyalty adjustment | AI key/local ledger context | duplicate may change balance twice outside protected path | high financial risk | ledger identity and authoritative reconciliation |
| Expense create | AI key or direct route | duplicate expense row is possible through new key/direct route | financial reporting risk | tenant + semantic source identity, explicit intentional duplicate escape hatch |
| Inbox storage | tenant + user + type + sourceEventId | row upsert collapses storage duplicate | good storage dedup | retain |
| Push delivery | none durable | repeated publish can send duplicate push even if inbox row is deduped | storage dedup is not delivery dedup | durable delivery attempt and provider correlation |
| Marketing campaign | campaign/idempotency fields exist; active service underuses recipient attempt schema | duplicate recipient notification or stuck sending is possible | schema and runtime diverge | freeze audience, one recipient delivery identity, lease and attempts |
| YooKassa payment | generated key per local payment request | provider collapses same key; retry with a new local payment/key can charge again | good provider primitive, unsafe unknown handling | keep same key through reconciliation and retry decision |
| Auth/session revocation | token/session identity | repeated revoke is generally idempotent | acceptable domain property | still audit requester/target/outcome |
| Scheduler notification | sourceEventId helps inbox row | repeated job can re-trigger push | process flag is not distributed idempotency | scheduler produces intent; engine owns one delivery identity |
| Legacy sends/mutations | function-specific | duplicate behavior varies | cannot prove invariant | migrate or wrap every legacy capability before closure |

HTTP/CORS acceptance of `Idempotency-Key` is not proof of enforcement. The value must be consumed at every initiating surface and bound to a normalized semantic action.

## Unknown Outcome Matrix

Unknown outcome means the request may have reached the external system, but MAYA did not receive a definitive response. Unknown is not failure.

| External action | Unknown trigger | Current behavior | Duplicate risk on retry | Required behavior |
|---|---|---|---|---|
| YClients appointment create | timeout/connection loss after provider receives request | adapter raises outcome-unknown; runtime records failed; local row may not exist | high: provider orphan plus second booking | persist UNKNOWN; search provider using stable correlation/evidence before retry |
| YClients reschedule | response lost after mutation | failed to caller/runtime | high: second move or conflict | reread appointment and compare target time/services |
| YClients cancel | response lost after cancel | `crm_outcome_unknown`, local state unchanged, execution failed | medium/high: repeat mutation and confusing user state | reread; record reconciled success or definitive failure |
| Attendance/status/service mutation | response lost | endpoint/service-specific error | medium | reread authoritative appointment/status before retry |
| CRM staff/schedule/access mutation | response lost | endpoint-specific error | medium/high, especially access | reread provider state; never blind retry security mutation |
| YooKassa payment creation/charge | timeout before provider payment id is stored | local payment can be marked failed | critical: charged externally but retried with new key | retain UNKNOWN with original idempotence key; reconcile by key/provider support |
| Inbox DB write | database transaction result | generally definitive | low | transaction outcome remains local definitive |
| APNs/push send | provider response missing or fire-and-forget failure | only log; no attempt record | duplicate or missing notification | durable delivery attempt; UNKNOWN if provider acceptance cannot be proven |
| Telegram/message send | timeout/connection loss | legacy/provider-specific | duplicate message | provider message correlation or conservative no-retry/manual resolution |
| Campaign recipient send | process death or provider ambiguity | campaign count/status can diverge | bulk duplicate risk | recipient-level UNKNOWN and reconciliation/controlled retry |
| Object/logo upload | upload succeeds but response/local commit fails | route-specific partial state | duplicate orphan object | object key identity and head/read reconciliation |

The current AI timeout wrapper uses `Promise.race` and does not cancel the underlying work. A timeout can therefore be followed by a real side effect completing in the background while the execution is persisted as failed. This is a critical reason not to reuse `FAILED` for unknown outcomes.

## Reconciliation Matrix

| Action class | Can authoritative state be checked? | Reconciliation evidence | Current implementation | Gap |
|---|---|---|---|---|
| Appointment cancel | yes | appointment missing/cancelled/status | partial record-gone handling | no durable reconciliation job tied to execution |
| Appointment reschedule | yes | appointment start/end/staff/services | ad hoc reread is possible | no generic reconciler or outcome transition |
| Appointment create | partly | provider appointment matching stable correlation/customer/time | no reliable common correlation after lost response | provider-specific identity/search design required |
| Attendance/status/duration/services | yes | provider appointment fields | domain read APIs exist | no action-attempt linkage |
| Staff schedule | yes | provider schedule for staff/date | read capability exists | no automatic reconcile after unknown |
| CRM access/team mutation | usually | provider staff/access state | status/recheck paths exist | security-sensitive reconciliation not unified |
| Loyalty internal write | yes | local ledger/balance entry | local reread possible | external CRM loyalty authority, if enabled, needs separate semantics |
| Expense/settings/task | yes | local row/version | local DB reads | generic action outcome still absent |
| Payment with provider id | yes | provider payment status | pending-payment reconciliation exists | incomplete if provider id was never received |
| Payment only by idempotence key | provider dependent | provider lookup/support by original key | not proven in current reconciler | must be resolved in Schema Gate/design before financial pilot |
| Inbox storage | yes | unique inbox row | upsert provides proof | does not prove delivery |
| Push delivery | generally no final device proof | provider acceptance only | no durable attempt | distinguish accepted from delivered; do not claim user receipt |
| Telegram/message | provider dependent | provider message id/status | legacy-specific | no canonical reconciliation contract |
| Campaign | recipient/provider dependent | recipient attempt plus provider id/status | rich tables exist, runtime underuses them | complete existing campaign lifecycle before new engine |
| Session revocation | yes | session revoked/absent | local read possible | needs canonical audit only |

If authoritative reconciliation is impossible, the engine must preserve UNKNOWN and require manual resolution or a provider-specific conservative policy. It must not convert uncertainty to success or blindly retry.

## Campaign Delivery Audit

### Existing Durable Assets

The Prisma schema already contains substantial campaign-specific structures:

- `MarketingPolicy`;
- `MarketingAudienceRecipient`;
- `MarketingCampaignRecipient`;
- `MarketingConsentEvidence`;
- `MarketingDeliveryAttempt`;
- `MarketingCampaign` fields for counts, idempotency, scheduling, lease, retry, provider state, failure, skipped, and unknown outcomes.

This is enough evidence to reject building a second campaign persistence model before the existing one is completed and validated.

### Runtime Findings

The current marketing service:

- claims a draft campaign as `sending`;
- revalidates consent and recency;
- publishes tenant/user inbox items;
- triggers push as fire-and-forget;
- stores aggregate counts;
- does not fully drive `MarketingCampaignRecipient` and `MarketingDeliveryAttempt` as the execution source of truth;
- does not provide a complete lease renewal/reclaim path;
- does not recover a process that dies after changing the campaign to `sending`;
- does not prove recipient-level provider delivery idempotency;
- is not clearly wired as an active Nest production module, while legacy Python paths can still send.

### Stuck `sending` Finding

Current sequence can be:

1. campaign state changes from draft to sending;
2. process dies before recipients finish;
3. next call sees campaign busy;
4. no complete lease/attempt reconciliation resumes it.

Result: a campaign can remain stuck in `sending`.

### Storage vs Delivery

An inbox upsert proves only that a durable app message exists. It does not prove:

- APNs accepted the notification once;
- the device received it;
- Telegram/provider accepted it once;
- the recipient was not contacted twice through another channel.

Chapter 6 must model recipient execution separately from message-of-record storage.

### Campaign Decision

Do not build a new campaign engine. Complete and route the existing campaign recipient/attempt/lease model through the unified execution boundary after the generic Schema Gate. Bulk approval, audience freezing, consent evidence, rate limits, quiet hours, per-recipient identity, and UNKNOWN handling are mandatory.

## Scheduler Audit

| Scheduler/loop | Detects | Executes today | Coordination | Bypass finding | Target |
|---|---|---|---|---|---|
| Appointment reminders | due reminders | inbox upsert and push | in-process running flag | yes; detector owns notification execution | emit a notification ActionIntent/request only |
| Billing scheduler | due subscriptions and pending payments | reconciliation and recurring charge | in-process guard; documented one-instance assumption | yes; financial execution outside shared owner | detection may request charge; Action Engine owns charge and reconciliation |
| Appointment reconciliation | CRM/canonical drift | canonical mirror/opportunity updates only | database lease | acceptable read/reconciliation contour | remain detector/reconciler, not external side-effect executor |
| Ingestion retention | expired quarantine data | destructive local cleanup | scheduled rerun | maintenance bypass | register as restricted system action or explicitly exempt with durable audit |
| Owner/staff reports | business-state signals | inbox/push publication | in-process flag | yes; detection and delivery mixed | detector produces intent; delivery executes centrally |
| Legacy startup loops | reminders, retention, reviews, shifts, waitlist, reputation | Telegram/message/provider actions | process-local loops | yes; broad bypass | migrate, disable, or wrap capabilities before Chapter 6 closure |

Scheduler rule:

> A scheduler may decide that an action should be considered. It may not become an alternate execution engine.

The one exception to route explicitly is internal housekeeping that has no external side effect. Even then, destructive/privacy maintenance must have a named owner, tenant/system scope, idempotency, and durable audit.

## Direct Bypass Inventory

| Bypass family | Examples | Why it bypasses | Required closure |
|---|---|---|---|
| Appointment HTTP routes | create/cancel/reschedule and CRM journal mutations | controller invokes domain/provider service directly | controller submits canonical execution request |
| CRM admin routes | connect/disconnect, attendance, duration, services, access, activation | route owns mutation semantics | capability executor becomes sole mutation owner |
| Loyalty/expense/customer routes | balance adjust, expense create/delete, profile/notes | direct domain writes outside AI runtime | classify and route or explicitly exempt pure internal canonical writes |
| Billing routes and scheduler | checkout, recurring charge, provider webhook application | billing has separate action lifecycle | integrate initiation/outcome while retaining provider-specific ledger logic |
| Inbox/report/reminder paths | direct `publishForTenant` and push | delivery is called by many services | one delivery executor; inbox storage remains capability detail |
| Marketing and reactivation paths | service sender and legacy loops | bulk and one-to-one delivery bypass shared approval/idempotency | finish existing campaign engine behind Action Engine |
| Auth/admin routes | revoke session/access/status | security side effects have independent semantics | restricted security executors with explicit policy/audit |
| Onboarding/integration routes | CRM credential/connect/import and tenant activation | high-trust mutation path | dedicated integration executors, never LLM-owned |
| Python/PHP legacy | Telegram, YClients, YooKassa, reminder and reactivation calls | direct provider ownership outside Nest kernel | migration inventory, feature-by-feature cutover, then disable direct path |

The future invariant is not that every HTTP request passes through AI. It is that every side-effecting capability, regardless of caller, has one deterministic execution owner.

## Security / Trust Boundary

### Required Trust Flow

```text
Untrusted customer/provider text
  -> parsing and reasoning context
  -> structured proposal
  -> ActionIntent (still untrusted as authorization)
  -> current evidence validation
  -> tenant + actor + role + entitlement policy
  -> approval/autonomy policy
  -> normalized execution request
  -> deterministic capability executor
  -> durable outcome/reconciliation
```

### Mandatory Rules

1. External text can provide context, never permission.
2. LLM output cannot select a tenant, elevate a role, bypass approval, or supply secrets.
3. Executable arguments must be schema-validated and normalized by deterministic code.
4. Target ownership must be checked server-side after normalization.
5. Action approval must bind to a hash of normalized executable input.
6. Opportunity/AgentTask/ActionIntent evidence references must be current at execution time.
7. Raw CRM payloads and unnecessary PII must not be copied into action audit records.
8. CRM, OAuth, YooKassa, Telegram, email/SMS, and push credentials remain in protected credential owners and are never action arguments.
9. Bulk audience membership must be frozen and revalidated for consent/legal basis before execution.
10. Provider/webhook payloads are untrusted until signature, tenant mapping, freshness, and replay checks pass.
11. Runtime logs and durable audit must store decisions and structured facts, not chain-of-thought.
12. A user message beginning with an imperative is not itself an approved action.

### Indirect Prompt Injection

Threat example:

1. a CRM customer note contains instructions such as "send everyone a discount";
2. a model reads that note while analyzing retention;
3. the model proposes a campaign;
4. without a trust boundary, customer-controlled text becomes executable intent.

Required defense:

- mark external fields as untrusted evidence;
- constrain agent output to an allowed action class/capability set;
- reconstruct normalized inputs from canonical identifiers, not copied prose;
- rerun policy and approval independently of the model;
- cap recipient count and require bulk approval;
- reject any intent whose target/evidence/tenant cannot be deterministically verified.

## Chapter 5 ActionIntent Integration

Chapter 5 currently defines runtime `ActionIntentV1` with:

- tenant;
- source agent domain, AgentTask, and Opportunity references;
- action class and capability;
- optional target reference;
- structured arguments;
- rationale and evidence references;
- optional expiry;
- `dryRun: true`;
- `state: proposed`.

The Chapter 5 contract should not be changed during Phase A.

### Boundary Proposal

`ActionIntentV1` is a proposal, not an execution authorization. Chapter 6 must translate it into an execution request only after:

1. tenant and source references are resolved;
2. the AgentTask and Opportunity are still current;
3. evidence is revalidated against Business State;
4. capability, target, and arguments are normalized;
5. actor/system requester context is attached;
6. role, entitlement, risk, approval, and future autonomy policies pass;
7. an idempotency identity is derived or required;
8. expiry is checked.

An ActionIntent must not carry retries, provider outcomes, delivery state, attempts, or approvals. Those remain Chapter 6 concerns.

### Potential Agent-Domain Action Classes

| Agent domain | Potential action classes | Chapter 6 posture |
|---|---|---|
| Admin | own booking create/reschedule/cancel, task creation, settings update, contact admin, schedule-change proposal | user-requested/approved execution only; CRM access mutations restricted |
| Client Lifecycle | one-to-one consent-safe contact, reactivation candidate contact, loyalty adjustment proposal, campaign proposal | no direct send; bulk is a separate high-risk class |
| Occupancy | cancellation recovery contact, free-slot contact, booking proposal | detect/propose; no direct booking or messaging |
| Business Intelligence | report, anomaly explanation, forecast, recommendation | read-only in initial Action Engine |

Runtime agents are not created in this phase.

## Durable Audit Minimum

For every execution request, durable audit must be able to answer:

- who or what requested it;
- tenant and actor/system scope;
- source type and source reference;
- action class and capability;
- normalized target identity;
- normalized input hash and safe redacted input;
- risk facets and policy decision;
- approval requirement, approver, decision, input hash, and expiry;
- idempotency identity;
- each execution attempt and executor/provider correlation;
- timeout/error classification;
- definitive or unknown outcome;
- reconciliation attempt, evidence, decision, and timestamp;
- final state and consumer-visible result.

Do not persist chain-of-thought, hidden model reasoning, raw credentials, full Business State, or raw CRM payloads.

## Persistence Decision

### Existing Schema

Relevant current durable models include:

- `AiApprovalRequest`;
- `AiToolExecution`;
- Chapter 5 `Opportunity` and `AgentTask`;
- marketing campaign, recipient, consent, and delivery-attempt models;
- domain-specific payments, inbox, sessions, and canonical records.

### Why Existing Models Are Insufficient

`AiToolExecution` is scoped to AI tool execution and lacks the generic source/target/action contract required for HTTP, scheduler, system, webhook, agent, and legacy callers. It also lacks:

- an explicit unknown outcome;
- multiple durable execution attempts;
- provider correlation per attempt;
- reconciliation lifecycle and evidence;
- safe-retry decision;
- generic normalized target and action class;
- separation from AI approval records.

`AiApprovalRequest` mixes approval and execution states.

Marketing tables are specialized for campaigns and must not be forced into appointment, billing, access, or CRM mutation semantics.

Chapter 5 deliberately has no durable ActionIntent table, and this audit does not require one.

### Decision

The minimum durable execution lifecycle cannot be implemented correctly without an additive schema decision.

`SCHEMA GATE REQUIRED: YES`

Per the Phase A instruction, implementation must stop here. This document does not propose final Prisma names, columns, enums, indexes, or migrations. The next approved work must be a dedicated Action Engine Schema Gate proving status semantics, uniqueness, tenant-qualified relationships, attempt identity, unknown outcome, reconciliation, retention, and migration invariants.

## Proposed Action Engine Contract

This is a logical contract proposal, not a schema or implementation.

### ActionExecutionRequestV1

Minimum logical fields:

- contract version;
- tenant id;
- requester type and requester reference;
- actor context when a human initiated the action;
- source type and source reference (`user`, `agent_task`, `scheduler`, `http`, `webhook`, `system`, `legacy_bridge`);
- action class;
- capability;
- normalized target reference;
- normalized executable arguments;
- evidence references;
- risk facets;
- policy decision reference;
- approval reference when required;
- idempotency identity;
- request/intent expiry;
- dry-run flag.

### Deterministic Kernel Sequence

1. Validate contract and tenant.
2. Resolve requester, actor, source, and target within the same tenant.
3. Revalidate current evidence and expiry.
4. Evaluate permission and entitlement.
5. Evaluate risk and approval requirement.
6. Evaluate future tenant x agent x action-class autonomy policy.
7. Require or derive a stable idempotency identity.
8. Claim one current execution for that identity.
9. Select exactly one registered capability executor.
10. Persist an attempt before external I/O.
11. Execute with provider-specific timeout/cancellation semantics.
12. Persist definitive success/failure or UNKNOWN.
13. If UNKNOWN, reconcile before any retry.
14. Retry only when the executor declares it safe and identity is preserved.
15. Publish a consumer result from durable state.

### Executor Contract

Each executor must declare:

- capability name and accepted action class;
- risk facets;
- normalized input/target schema;
- whether external idempotency is available;
- timeout behavior;
- possible definitive and unknown outcomes;
- reconciliation support;
- safe retry conditions;
- redaction rules;
- tenant isolation checks.

The executor computes no business truth and makes no autonomy decision. It performs one approved deterministic capability.

## Phase B Packages

Phase B is not ready until the Schema Gate is approved.

### Gate 06-G1 - Action Execution Lifecycle Schema Gate

- exact separation of request, approval, execution, attempt, outcome, and reconciliation;
- status-transition matrix including UNKNOWN;
- tenant-qualified uniqueness and foreign keys;
- idempotency and one-current-execution invariants;
- provider-correlation and attempt rules;
- retention/redaction rules;
- compatibility and migration validation;
- explicit decision on reuse/evolution of `AiToolExecution` and `AiApprovalRequest`.

### Proposed Implementation Packages After Gate

| Package | Scope | Exit proof |
|---|---|---|
| 06-B1 | deterministic kernel and registry over existing capabilities | all callers use one request/policy/claim lifecycle in tests; no provider pilot yet |
| 06-B2 | approval and idempotency enforcement unification | approval independent of idempotency; no-approval writes still require stable identity |
| 06-B3 | appointment cancel pilot | timeout becomes UNKNOWN, reread reconciles, restart cannot duplicate |
| 06-B4 | appointment create/reschedule and CRM mutation reconcilers | provider/local split outcomes and safe retry proven adversarially |
| 06-B5 | complete existing campaign recipient/attempt/lease runtime | stuck `sending` recovery, consent revalidation, delivery identity, bulk approval |
| 06-B6 | notification/report scheduler cutover | schedulers detect/request; one executor owns inbox/push delivery |
| 06-B7 | billing and restricted security integration | provider-id/idempotence-key unknown path and revocation audit proven |
| 06-B8 | HTTP and legacy bypass closure | one capability -> one owner; legacy direct mutation/send paths disabled or wrapped |
| 06-B9 | adversarial and shadow production verification | duplicate, timeout, restart, tenant, approval, prompt-injection, and zero-unapproved-side-effect proofs |

Runtime agents and autonomy remain outside these initial packages. Chapter 6 should first make execution safe for user and system callers.

## Carry-Forward Mapping

| Finding | Destination | Required treatment |
|---|---|---|
| cancellation unknown outcome | Gate 06-G1, 06-B3 | UNKNOWN state, appointment reread, reconcile-before-retry |
| required idempotency key not enforced for no-approval tools | 06-B2 | decouple approval from key enforcement |
| HTTP/CORS key acceptance does not prove consumption | 06-B1, 06-B8 | one normalized request contract at every surface |
| storage dedup is not delivery dedup | 06-B5, 06-B6 | recipient/delivery attempt identity |
| campaign stuck in `sending` | 06-B5 | lease, reclaim, attempts, recipient-level terminal/unknown state |
| direct HTTP controller bypasses | 06-B8 | HTTP initiates but does not own execution semantics |
| scheduler detect/execute mixing | 06-B6 | detection-only scheduler boundary |
| entitlement/permission duplication | 06-B1, 06-B2 | shared policy evaluation and fail-closed decision |
| Telegram/Python/PHP legacy security debt | 06-B8 and security debt | per-capability migration and direct-path shutdown |
| indirect prompt injection | 06-B1, 06-B9 | untrusted evidence, deterministic normalization, policy/approval |
| payment timeout marked failed | Gate 06-G1, 06-B7 | financial UNKNOWN and provider reconciliation with original key |
| loyalty authority/reconciliation ambiguity | later Chapter 6 capability package | explicit authority and ledger reconciliation before external write |
| attendance/deleted-record semantics | 06-B4 | provider-specific definitive vs unknown/reconciled outcomes |
| provider rate limit/timeout behavior | Gate 06-G1, executor contracts | error taxonomy, no blind retry |
| attribution and recovered-value correctness | Chapter 7 | canonical post-action attribution, not engine-estimated value |
| predictions and opportunity valuation | Chapter 8 | canonical prediction/valuation model; never invented by executor |
| runtime specialized agents | Chapter 9 | agents consume safe execution boundary only after Chapter 6 |
| tenant x agent x action-class autonomy | Chapter 10 | autonomy policy consumes risk/approval model; no early autopilot |

## Risks and Blockers

1. A generic implementation without the Schema Gate would repeat the Chapter 5 mistake that the durable lifecycle work was designed to prevent.
2. Appointment create has the hardest reconciliation case because a lost provider response can precede a local/provider correlation id.
3. Financial action retry is unsafe until provider lookup by original idempotence identity is proven.
4. Existing campaign schema is richer than its runtime; replacing it would create duplicate lifecycle owners.
5. In-process scheduler flags are not distributed locks and cannot support horizontal execution safely.
6. Legacy loops can silently preserve bypasses after Nest-side migration unless each capability is explicitly cut over and disabled.
7. A single low/medium/high tier cannot model bulk, financial, destructive, privacy, reversible, and externally visible differences.
8. AI model quality cannot compensate for missing deterministic policy, idempotency, reconciliation, or audit.

## Phase A Exit

PHASE A COMPLETE

APPLICATION CODE CHANGED: NO

DATABASE CHANGED: NO

CURRENT EXECUTION OWNERS: 4

UNIFIED ACTION ENGINE EXISTS TODAY: NO

SCHEMA GATE REQUIRED: YES

READY FOR CYCLE 06 PHASE B: NO

WAITING FOR APPROVAL
