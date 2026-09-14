# CYCLE 06 - ACTION ENGINE SCHEMA GATE

Status: schema decision only

Repository HEAD inspected: `88afcc72daa9548603957efa8ce4425b3b2e13d2`

Chapter 5 production closure: `20260821-c05-closure-final`

Scope boundary: no application code, Prisma schema, database, production data, runtime agent, migration, or external side-effect changes

## Executive Decision

Chapter 6 requires a durable, tenant-scoped execution lifecycle before any current execution owner can be moved behind one Action Engine.

The minimum new durable model is:

1. `ActionExecution` - one canonical lifecycle for one logical action;
2. `ActionAttempt` - one immutable record for each execution or reconciliation attempt.

`ActionIntentV1` remains a validated runtime proposal. It is not persisted as a third table in this gate. The Action Engine may accept an intent only after deterministic normalization, policy evaluation, identity construction, and expiry validation.

The existing `AiApprovalRequest` and `AiToolExecution` models are not suitable as the canonical Chapter 6 lifecycle. They are AI-runtime specific, mix approval and execution concerns, and cannot represent `UNKNOWN`, provider-boundary uncertainty, repeated attempts, or reconciliation.

The existing campaign recipient and delivery-attempt models are reusable as the specialist delivery ledger for bulk messaging. They must be linked to a parent `ActionExecution` and strengthened where necessary; they must not be replaced by generic `ActionAttempt` rows for every recipient.

This gate does not authorize implementation or execution.

## Decision Summary

| Decision | Result |
|---|---|
| New durable generic execution lifecycle | Required |
| New durable generic attempt ledger | Required |
| Durable `ActionIntent` table | Not required now |
| Canonical reuse of `AiApprovalRequest` | Rejected |
| Canonical reuse of `AiToolExecution` | Rejected |
| Specialist reuse of campaign delivery tables | Approved with extensions |
| Blind retry after ambiguous provider timeout | Forbidden |
| Generic global retry count or TTL | Forbidden |
| External side effects in this phase | Forbidden |

## Existing Schema Reuse

| Existing structure | Decision | Target treatment |
|---|---|---|
| `Opportunity` | REUSE | remains canonical upstream business-condition lifecycle |
| `AgentTask` | REUSE | remains canonical structured work item; may be a tenant-qualified execution source |
| runtime `ActionIntentV1` | KEEP SEPARATE | validated proposal accepted into a normalized execution; no intent table now |
| `AiApprovalRequest` | MIGRATE | legacy compatibility/audit only; new approvals live in the canonical execution lifecycle |
| `AiToolExecution` | MIGRATE | legacy audit only; new writes move capability-by-capability to `ActionExecution` |
| campaign/recipient/delivery models | EXTEND | specialist bulk-delivery subsystem under one parent `ActionExecution` |
| `Membership` | REUSE | tenant-qualified actor and approver identity |
| `AuditLog` | KEEP SEPARATE | security/human audit, never authoritative execution state |

### `Opportunity`

Reuse as the durable upstream business condition. It owns neither execution state nor action outcome. An Opportunity can be resolved, expired, or superseded independently of whether an action was proposed or executed.

### `AgentTask`

Reuse as the durable structured work item routed to an agent domain. It is not an execution job. Creating or completing an `AgentTask` does not prove that any external action happened.

`ActionExecution` may reference an `AgentTask` with a tenant-qualified foreign key. The task must be current and valid when the execution is created. A later task invalidation does not rewrite history, but policy must prevent an unclaimed action from starting when its source condition is no longer current.

### `ActionIntentV1`

Reuse as a runtime proposal only. It supplies typed intent data such as action class, capability, target, arguments, rationale, evidence references, and expiry. It is not durable execution truth.

The Action Engine must never persist the raw model response as the execution contract. It first converts the proposal into a deterministic, versioned capability input.

### `AiApprovalRequest`

Do not reuse as the canonical approval model.

Reasons:

- it is bound to AI tools and AI surfaces;
- it combines approval and execution statuses;
- it stores tool-specific encrypted arguments rather than a generic normalized action contract;
- it cannot represent policy denial, shadow-only decisions, external outcome uncertainty, or reconciliation;
- its relationships do not provide the complete tenant-qualified actor and approver invariants required by the Action Engine.

It remains a legacy compatibility record during migration. New Action Engine writes must not dual-execute through it.

### `AiToolExecution`

Do not reuse as the canonical execution lifecycle.

It records only a single AI-tool execution with `executing`, `completed`, or `failed`. It cannot distinguish definitive failure from `UNKNOWN`, cannot maintain an attempt ledger, and does not cover HTTP, scheduler, webhook, or legacy initiators.

Historical rows are not backfilled. They remain legacy audit evidence.

### Campaign Delivery Models

Reuse `MarketingCampaign`, `MarketingCampaignRecipient`, and `MarketingDeliveryAttempt` as the specialist campaign/delivery ledger.

Their responsibilities remain:

- campaign lifecycle and lease;
- recipient selection and per-recipient state;
- delivery attempts, provider acknowledgement, delivery, failure, and unknown counts.

They do not replace `ActionExecution`. The parent execution represents the authorized orchestration of the campaign action. Recipient delivery truth stays in the campaign domain.

### `Membership`

Reuse for actor and approver identity. Every actor/approver relationship must use the composite tenant-qualified membership identity, not a bare user ID.

### `AuditLog`

Reuse only for human/security audit events. It must not become the authoritative action state machine or attempt ledger.

## Minimal Durable Model

Only two generic models are proposed:

### `ActionExecution`

One row per logical action identity. It owns:

- tenant and source identity;
- immutable normalized action contract;
- idempotency identity;
- policy and approval snapshots;
- current execution state;
- claim lease and optimistic revision;
- retry and reconciliation policy snapshots;
- final safe outcome and retention metadata.

### `ActionAttempt`

One immutable row per execution or reconciliation attempt. It owns:

- attempt number and kind;
- executor identity and version;
- provider-boundary crossing state;
- provider correlation hashes/references;
- safe result or error classification;
- retry/reconciliation decision;
- start and finish timestamps.

No third generic `Approval`, `ActionIntent`, `ProviderResponse`, or `RetryJob` model is introduced by this gate.

## ActionExecution Contract

The canonical contract is constructed by trusted server code, never accepted directly from an LLM or client request.

Required logical groups:

### Identity

- `id`
- `tenantId`
- `identityVersion`
- `identityFingerprint`
- optional `idempotencyScope`
- optional `requestIdempotencyKeyHash`

### Provenance

- `sourceType`: agent task, authenticated request, scheduler, webhook, or legacy bridge
- opaque `sourceRef`
- optional `agentTaskId`
- optional `actorUserId`, bound through tenant membership

### Capability

- `actionClass`
- `capability`
- `capabilityVersion`
- `targetKind`
- opaque normalized `targetRef`
- `normalizedInputContract`
- `normalizedInputHash`
- encrypted `normalizedInputEncrypted`
- minimal `evidenceRefsJson`
- `intentExpiresAt`
- `dryRun`

### Risk, Policy, and Approval

- versioned risk facets, not one subjective risk label
- `policyKey` and `policyVersion`
- `policyDecision`: allow, deny, or shadow-only
- `autonomyLevel` snapshot
- `approvalRequirement`
- `approvalDecision`
- `approvalInputHash`
- approval request/expiry/decision timestamps
- optional tenant-qualified approver membership

The catalog's current low/medium/high write tier is retained only as a compatibility input. Canonical risk is a versioned set of independent facets:

- reversible/local;
- externally visible;
- destructive;
- financial;
- bulk communication;
- security/access;
- privacy-sensitive.

The 12 current ACTION tools map as follows before any capability-specific review:

| Capability | Required risk facets |
|---|---|
| appointment create | externally visible, privacy-sensitive; reversible only through a separate governed cancellation |
| appointment reschedule | reversible, externally visible, privacy-sensitive |
| appointment cancel | reversible only through a new booking, externally visible, destructive, privacy-sensitive |
| staff schedule update | reversible, externally visible, privacy-sensitive |
| loyalty adjustment | reversible through compensating ledger entry, financial, privacy-sensitive |
| expense create | reversible through governed correction, financial, privacy-sensitive |
| expense period complete | reversible only by governed period reopening, financial |
| settings update | reversible; may add privacy/security facets for individual keys |
| task create | local, externally visible to the recipient, privacy-sensitive |
| task complete | local, reversible where domain policy allows, privacy-sensitive |
| appointment notification settings update | reversible, privacy-sensitive |
| contact-admin request | local persistence plus externally visible notification, privacy-sensitive |

The trusted capability registry may add facets; an LLM or caller may not remove them.

### Lifecycle

- `state`
- optional `notExecutedReasonCode`
- capability-specific retry policy key/version and maximum execution attempts
- `executionAttemptCount`
- optional `nextExecutionAttemptAt`
- reconciliation policy key/version and current reconciliation state
- lease owner, hashed lease token, lease expiry, and optimistic revision

### Outcome and Retention

- stable transport idempotency identity or derivation version
- optional final outcome code
- safe result summary only
- user-facing explanation code and safe parameters
- first-attempt and finalization timestamps
- encrypted payload retention deadline
- audit retention deadline
- created/updated timestamps

The row must not contain raw CRM payloads, complete Business State, prompts, model reasoning, provider credentials, or unrestricted provider responses.

## ActionAttempt Decision

A durable `ActionAttempt` is required.

A single status column on `ActionExecution` is not sufficient because the system must distinguish:

- a claim that crashed before transport;
- a request that may have crossed the provider boundary;
- a provider acknowledgement;
- a definitive provider rejection;
- a reconciliation read that proves execution;
- a reconciliation read that proves non-execution;
- repeated safe attempts under one logical action identity.

Attempt kinds:

- `EXECUTION`
- `RECONCILIATION`

Attempt states:

- `STARTED`
- `SUCCEEDED`
- `FAILED`
- `UNKNOWN`

External dispatch states:

- `NOT_APPLICABLE`
- `NOT_CROSSED`
- `MAY_HAVE_CROSSED`
- `ACKNOWLEDGED`

Before invoking any non-transactional external transport, the executor must durably move the current attempt to `MAY_HAVE_CROSSED`. A crash after that write is conservatively classified as `UNKNOWN`, never as a safe failure.

## State Machine

### Execution States

- `PENDING_APPROVAL`
- `READY`
- `EXECUTING`
- `UNKNOWN`
- `SUCCEEDED`
- `FAILED`
- `NOT_EXECUTED`

### Approval Decisions

- `NOT_REQUIRED`
- `PENDING`
- `APPROVED`
- `REJECTED`
- `EXPIRED`

### Policy Decisions

- `ALLOW`
- `DENY`
- `SHADOW_ONLY`

### Reconciliation States

- `NOT_REQUIRED`
- `REQUIRED`
- `IN_PROGRESS`
- `RESOLVED`
- `MANUAL_REQUIRED`

### Allowed Transitions

| From | To | Required proof |
|---|---|---|
| creation | `PENDING_APPROVAL` | policy allows and approval is required |
| creation | `READY` | policy allows and approval is not required/already valid |
| creation | `NOT_EXECUTED` | policy denies, shadow-only mode, expired intent, invalid source, or deterministic precondition denial |
| `PENDING_APPROVAL` | `READY` | approval binds the exact tenant, target, normalized input hash, actor, and unexpired policy snapshot |
| `PENDING_APPROVAL` | `NOT_EXECUTED` | rejected, expired, revoked, policy denied, or source condition no longer current |
| `READY` | `EXECUTING` | atomic claim succeeds and one open execution attempt is inserted |
| `EXECUTING` | `SUCCEEDED` | definitive local commit or authoritative provider proof |
| `EXECUTING` | `READY` | definitive proof that dispatch did not occur, failure is retryable, policy remains valid, and budget remains |
| `EXECUTING` | `FAILED` | definitive terminal failure with no safe retry |
| `EXECUTING` | `UNKNOWN` | dispatch may have crossed the boundary without a definitive result, or a lease expired without proof of non-dispatch |
| `UNKNOWN` | `SUCCEEDED` | reconciliation proves the intended effect occurred exactly once |
| `UNKNOWN` | `FAILED` | reconciliation proves a terminal failed outcome |
| `UNKNOWN` | `READY` | reconciliation proves the effect did not occur and retry is still safe, current, approved, and within policy |
| `UNKNOWN` | `NOT_EXECUTED` | non-execution is proven but expiry, policy, approval, revocation, or manual abandonment prevents retry |
| `UNKNOWN` | `UNKNOWN` | reconciliation is inconclusive; schedule another reconciliation or require manual handling |

`SUCCEEDED`, `FAILED`, and `NOT_EXECUTED` are terminal in v1. A later contradiction creates an incident/audit finding; it does not silently rewrite terminal history.

Creating an AgentTask does not resolve its Opportunity. Starting an action does not resolve its Opportunity. Resolution remains a function of current canonical evidence.

## UNKNOWN Semantics

`UNKNOWN` means the Action Engine cannot honestly prove whether the intended side effect occurred.

It is not:

- a generic error;
- a retry queue state;
- a temporary synonym for failed;
- permission to issue the same mutation again;
- a successful shadow action.

Rules:

1. Any timeout, connection loss, crash, or process termination after `MAY_HAVE_CROSSED` becomes `UNKNOWN` unless authoritative evidence proves the outcome.
2. `UNKNOWN` cannot transition directly to `READY` without a reconciliation attempt that records `PROVEN_NOT_EXECUTED`.
3. An inconclusive reconciliation remains `UNKNOWN`.
4. If the capability has no safe reconciliation strategy, the execution becomes `MANUAL_REQUIRED`; it is not blindly retried.
5. User-facing text must state that the outcome is being checked, not that the action failed or succeeded.
6. Metrics must report `UNKNOWN` separately from failure and success.

## Idempotency Model

Three identities are separate:

### Logical Action Identity

`identityFingerprint` is an HMAC over a versioned canonical tuple:

```text
tenant
+ action class
+ capability and capability version
+ normalized target
+ normalized input hash
+ stable occurrence/source scope
+ optional explicit key namespace/key
```

The fingerprint must not use discovery time as its identity. The same logical action recomputed after restart must resolve to the same `ActionExecution`.

Capability-specific identity builders define legitimate repeat semantics. For example, two independent expense entries with identical amounts can be valid distinct actions only when their stable request/occurrence scopes differ.

### Caller Request Identity

An optional caller idempotency key is stored only as a scoped hash. The database enforces uniqueness on:

```text
(tenantId, idempotencyScope, requestIdempotencyKeyHash)
```

Reusing one key with a changed normalized input hash is a conflict, not a new execution.

### Provider/Transport Identity

The provider idempotency identity is derived from the immutable execution ID plus provider namespace/version. It remains stable across execution retries. Storage deduplication is not delivery deduplication.

## Claim and Concurrency Model

The Action Engine uses database-backed distributed claims.

Execution claim protocol:

1. atomically update one eligible `READY` row to `EXECUTING` using state, revision, expiry, and lease predicates;
2. write lease owner, hashed lease token, lease expiry, and incremented revision;
3. insert exactly one `STARTED` execution attempt in the same database transaction;
4. before external I/O, update the attempt to `MAY_HAVE_CROSSED`;
5. finalize the attempt and execution using the same lease token/revision guard.

Only one open `STARTED` attempt is allowed per execution. A worker that loses its lease cannot finalize the execution.

An expired `EXECUTING` lease does not automatically return to `READY`. If the latest attempt reached `MAY_HAVE_CROSSED`, the execution becomes `UNKNOWN`. It may return to `READY` only after proof of non-execution.

Reconciliation claims keep the execution in `UNKNOWN`, move reconciliation state to `IN_PROGRESS`, and acquire a separate guarded lease. The same one-open-attempt invariant applies.

For local canonical writes, the domain write, attempt finalization, and execution finalization should occur in one database transaction. This removes avoidable `UNKNOWN` states.

## Approval and Policy Linkage

Approval is a decision attached to the immutable execution contract, not a permission to run arbitrary future payloads.

An approval must bind:

- tenant;
- requesting actor/membership;
- capability and version;
- normalized target;
- normalized input hash;
- policy version;
- approval expiry;
- risk facets.

If any bound field changes, the approval is invalid and a new logical execution/approval decision is required.

Policy and approval are separate:

- policy `DENY` cannot be overridden by approval;
- `SHADOW_ONLY` always becomes `NOT_EXECUTED` with zero execution attempts;
- approval does not bypass feature entitlements, tenant isolation, source freshness, or executor preconditions;
- autonomy is evaluated at minimum by tenant x agent domain x action class;
- Chapter 6 does not authorize an LLM to select its own autonomy level, approver, executor, or risk tier.

## Reconciliation Model

Every mutation capability must declare a versioned reconciliation strategy before cutover.

| Capability | Authoritative reconciliation | Honest success proof | Key risk |
|---|---|---|---|
| `appointments.own.cancel` | reread appointment/status | target appointment is cancelled or absent under documented provider semantics | provider accepted but response lost |
| `appointments.own.create` | provider idempotency/correlation lookup plus exact-match search | exactly one appointment with the execution correlation and intended normalized fields | duplicate booking after blind retry |
| `appointments.own.reschedule` | reread the same appointment | exact target time, staff, services, and revision match | partial provider mutation |
| `staff.schedule.update` | reread provider schedule/revision for the exact date/staff | normalized schedule matches intended revision | stale overwrite or ambiguous update |
| `loyalty.internal.adjust` | read immutable local ledger entry keyed to execution | one ledger entry exists for the execution | balance alone cannot prove one adjustment |
| `expenses.create` | read local expense row keyed to execution/request | exactly one matching durable row | semantically duplicate expense |
| `expenses.period.complete` | read unique tenant-period declaration | intended period is completed by this execution | repeat completion under random key |
| `settings.update` | read key/value and expected revision | intended value/revision is current | lost update |
| `tasks.create` | read inbox/task item with execution source identity | exactly one item exists | storage identity differs from delivery identity |
| `tasks.complete` | reread task state/version | target task is completed at intended revision | stale or unrelated completion |
| `notifications.appointments.update` | reread tenant setting/version | intended settings are current | lost update |
| `support.contact-admin.request` | read durable inbox/support item | durable contact request exists exactly once | push notification remains a separate delivery outcome |

If a capability cannot provide authoritative success/non-execution proof, it cannot advertise safe automatic retry.

## Retry Model

There is no global retry count, backoff, or TTL.

Each executor contract declares:

- retry policy key and version;
- maximum execution attempts;
- retryable definitive error classes;
- backoff schedule;
- reconciliation policy and schedule;
- expiry rule;
- whether provider idempotency is available;
- whether manual intervention is required after inconclusive reconciliation.

Rules:

- pre-dispatch definitive errors may retry when policy allows;
- timeout after possible dispatch becomes `UNKNOWN`, not a retry;
- provider throttling before dispatch may retry using the same logical and provider identity;
- retries never create a new ActionExecution;
- reconciliation attempts do not consume execution-attempt identity or masquerade as execution retries;
- expiry is capability-specific and does not erase historical attempts;
- an expired action cannot be claimed even if a retry timestamp has arrived.

## Executor Capability Contract

Every executor is registered by trusted server code and declares a versioned contract:

- action class and capability name;
- normalized input schema/version;
- allowed actor/source classes;
- risk facets;
- policy key/version;
- approval requirement;
- idempotency identity builder/version;
- transport identity builder/version;
- expiry rules;
- retry rules;
- reconciliation strategy;
- privacy classification and retention;
- expected authoritative system;
- safe result schema;
- user explanation codes;
- executor version.

An executor receives only the validated normalized contract and a server-built execution context. It must not receive untrusted role, tenant, policy, approval, executor, or credential choices from a model/client payload.

Canonical result returned to an agent or initiating surface:

```text
executionId
state
outcomeCode
safe external reference when allowed
reconciliationState
userExplanationCode + safe parameters
startedAt / finalizedAt
```

Raw provider responses and secrets are never returned to an agent.

## Campaign Integration

Bulk delivery remains a specialist hierarchy:

```text
ActionExecution
  -> MarketingCampaign
       -> MarketingCampaignRecipient
            -> MarketingDeliveryAttempt
```

The parent execution proves that an authorized campaign operation entered and completed its governed campaign lifecycle. It does not claim that every recipient received a message.

Recipient states remain the source for accepted, delivered, failed, and unknown counts. Provider acceptance must not be described as recipient delivery.

Required later extensions:

- optional tenant-qualified one-to-one linkage from `MarketingCampaign` to `ActionExecution`;
- database uniqueness for campaign delivery attempt identity;
- lease-expiry recovery for stuck `sending` work;
- parent `UNKNOWN`/reconciliation semantics when campaign orchestration is interrupted;
- no duplicate generic ActionAttempt row for each recipient delivery attempt.

The existing campaign delivery model is reusable only with these invariants and runtime adoption.

## Booking Integration

Booking create is the highest duplicate-risk capability because a timeout may happen after provider creation.

Requirements before cutover:

- stable provider correlation/idempotency where supported;
- exact-match reconciliation when provider idempotency is unavailable;
- no blind create retry after ambiguous timeout;
- cancel and reschedule reconcile by rereading the same appointment;
- target appointment identity is immutable within one ActionExecution;
- no delete-plus-create implementation for reschedule;
- provider payload omits fields that the user did not change.

Attendance/status/service/duration updates are direct booking mutations even though they are not among the current 12 AI ACTION tools. Their future executor must reread the exact appointment revision and changed fields, preserve every omitted field, and prove the intended provider state before reporting success. They require their own capability contracts and must not be smuggled through create/reschedule/cancel semantics.

Carry-forward finding 4.43 remains a blocker for CRM mutation cutover: absent attendance must not default to `0` in a YClients update. This gate records the risk but does not change the adapter.

## Messaging Integration

Messaging is split into explicit capabilities with distinct success semantics:

- durable inbox persistence;
- push/provider acceptance;
- recipient delivery when provider receipts support it.

An inbox row proves only durable application storage. A push API response may prove provider acceptance. Neither proves that the human read the message.

`tasks.create` and `support.contact-admin.request` can succeed when their durable inbox records commit. Any push is a separate execution/delivery outcome and must not cause the storage action to be repeated.

Storage idempotency keys and provider delivery idempotency keys remain separate.

## Four-Owner Migration Path

### AI Tool Runtime

Convert it from executor to initiator/compatibility adapter. ACTION tool requests become normalized Action Engine requests. Legacy `AiApprovalRequest` and `AiToolExecution` stay readable during migration but do not dual-execute.

### HTTP Controllers and Domain Services

Controllers become initiators. Each mutation capability has one registered executor. Direct service mutation paths are removed only after parity and adversarial verification for that capability.

### Schedulers and Background Loops

Schedulers detect conditions and request actions. They do not send, charge, delete, or mutate directly. Distributed database claims replace process-local flags.

### Python/PHP Legacy Bridge

Move one capability at a time behind an authenticated Action Engine proxy, verify parity and idempotency, then disable the direct legacy executor. No shared period where both old and new paths can independently execute the same logical action.

Cutover order should start with local, reversible, easily reconciled actions and end with booking create, bulk messaging, credential mutations, and payments.

## Security and Trust Boundary

1. Tenant identity comes from authenticated server context, never from the action payload.
2. Actor and approver use tenant-qualified membership references.
3. Capability, action class, executor, risk, policy, approval requirement, autonomy level, idempotency builder, and reconciliation strategy come from a trusted registry.
4. LLM output is untrusted proposal data and passes strict typed validation.
5. Approval binds the exact normalized input hash and expires.
6. Credentials are resolved just in time from the secret owner; they are not copied into ActionExecution or ActionAttempt.
7. Raw CRM payloads, full Business State, prompts, personal-data dossiers, and chain-of-thought are not persisted.
8. Minimal personal data required for execution is encrypted and removed under the declared retention policy.
9. Provider references are encrypted when sensitive; searchable correlation uses keyed hashes.
10. Unknown capability, stale version, invalid source, expired intent, missing tenant, missing entitlement, or missing reconciliation contract fails closed.
11. Action Engine modules must not allow an initiator to import and call side-effect adapters directly.

## Audit and Retention

The durable lifecycle must answer:

- who/what requested the action;
- under which tenant and policy version;
- what normalized action hash was approved;
- which executor/version attempted it;
- whether the provider boundary may have been crossed;
- how the outcome was proven;
- whether any retry or reconciliation occurred;
- what safe terminal outcome was shown.

Retention rules:

- active and `UNKNOWN` executions retain the encrypted normalized input and provider correlation needed for safe continuation;
- terminal executions delete encrypted payloads after a short capability/privacy-specific window;
- hashes, codes, timestamps, policy versions, minimal evidence references, and safe summaries may remain for bounded audit;
- Chapter 5's initial 180-day lifecycle horizon is a planning ceiling, not a legal default for every action class;
- financial/security records follow their legal/domain retention owner;
- raw provider responses, response bodies, stack traces, and secrets are not stored;
- tenant deletion cascades tenant-owned execution data according to legal holds;
- anonymized platform incident records are separate from tenant action truth.

## Chapter 7 Linkage

Chapter 7 may consume the immutable chain:

```text
Opportunity -> AgentTask -> ActionExecution -> ActionAttempt/outcome
```

It may evaluate proposal quality, policy decisions, execution reliability, reconciliation rate, user acceptance, and downstream evidence changes.

It must not infer causality or recovered monetary value merely from `SUCCEEDED`. A successful message send does not prove a returned client; a successful booking does not prove incremental revenue. Canonical attribution requires a separate evidence and valuation model.

## Prisma Proposal

The following is a schema proposal, not an applied schema. Exact names may be normalized during approved implementation, but semantics and invariants may not be weakened.

```prisma
enum ActionExecutionState {
  PENDING_APPROVAL
  READY
  EXECUTING
  UNKNOWN
  SUCCEEDED
  FAILED
  NOT_EXECUTED
}

enum ActionPolicyDecision {
  ALLOW
  DENY
  SHADOW_ONLY
}

enum ActionApprovalDecision {
  NOT_REQUIRED
  PENDING
  APPROVED
  REJECTED
  EXPIRED
}

enum ActionReconciliationState {
  NOT_REQUIRED
  REQUIRED
  IN_PROGRESS
  RESOLVED
  MANUAL_REQUIRED
}

enum ActionAttemptKind {
  EXECUTION
  RECONCILIATION
}

enum ActionAttemptState {
  STARTED
  SUCCEEDED
  FAILED
  UNKNOWN
}

enum ExternalDispatchState {
  NOT_APPLICABLE
  NOT_CROSSED
  MAY_HAVE_CROSSED
  ACKNOWLEDGED
}

model ActionExecution {
  id                              String   @id @default(uuid())
  tenantId                        String
  identityVersion                 Int
  identityFingerprint             String
  idempotencyScope                String?
  requestIdempotencyKeyHash       String?

  sourceType                      String
  sourceRef                       String?
  agentTaskId                     String?
  actorUserId                     String?

  actionClass                     String
  capability                      String
  capabilityVersion               Int
  targetKind                      String
  targetRef                       String
  normalizedInputContract         String
  normalizedInputHash             String
  normalizedInputEncrypted        String?
  evidenceRefsJson                Json
  intentExpiresAt                 DateTime?
  dryRun                          Boolean  @default(false)

  riskProfileVersion              Int
  riskFacetsJson                  Json
  policyKey                       String
  policyVersion                   Int
  policyDecision                  ActionPolicyDecision
  autonomyLevel                   String
  policyDecidedBy                 String

  approvalRequirement             String
  approvalDecision                ActionApprovalDecision
  approvalInputHash               String?
  approvalRequestedAt             DateTime?
  approvalExpiresAt               DateTime?
  approvalDecidedAt               DateTime?
  approvalDecidedByUserId         String?

  state                           ActionExecutionState
  notExecutedReasonCode           String?
  retryPolicyKey                  String
  retryPolicyVersion              Int
  maxExecutionAttempts            Int
  executionAttemptCount           Int      @default(0)
  nextExecutionAttemptAt          DateTime?
  reconciliationPolicyKey         String
  reconciliationPolicyVersion     Int
  reconciliationState             ActionReconciliationState

  leaseOwner                      String?
  leaseTokenHash                  String?
  leaseExpiresAt                  DateTime?
  revision                        Int      @default(0)

  transportIdentityVersion        Int
  transportIdempotencyKey         String
  finalOutcomeCode                String?
  safeResultSummaryJson           Json?
  userExplanationCode             String?
  userExplanationParamsJson       Json?
  firstAttemptedAt                DateTime?
  finalizedAt                     DateTime?
  payloadRetentionUntil           DateTime?
  auditRetentionUntil             DateTime?
  createdAt                       DateTime @default(now())
  updatedAt                       DateTime @updatedAt

  tenant                          Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  agentTask                       AgentTask? @relation(fields: [agentTaskId, tenantId], references: [id, tenantId])
  actorMembership                 Membership? @relation("ActionActor", fields: [actorUserId, tenantId], references: [userId, tenantId])
  approverMembership              Membership? @relation("ActionApprover", fields: [approvalDecidedByUserId, tenantId], references: [userId, tenantId])
  attempts                        ActionAttempt[]

  @@unique([id, tenantId])
  @@unique([tenantId, identityFingerprint])
  @@unique([tenantId, idempotencyScope, requestIdempotencyKeyHash])
  @@index([tenantId, state, nextExecutionAttemptAt])
  @@index([tenantId, reconciliationState, leaseExpiresAt])
  @@index([tenantId, agentTaskId])
  @@index([tenantId, createdAt])
}

model ActionAttempt {
  id                              String   @id @default(uuid())
  tenantId                        String
  actionExecutionId               String
  attemptNumber                   Int
  kind                            ActionAttemptKind
  state                           ActionAttemptState
  executorKey                     String
  executorVersion                 Int
  externalDispatchState           ExternalDispatchState
  providerRequestIdentityHash     String?
  providerReferenceEncrypted      String?
  providerReferenceHash           String?
  transportCode                   String?
  httpStatus                      Int?
  errorClass                      String?
  outcomeCode                     String?
  safeResultJson                  Json?
  retryDecisionCode               String?
  reconciliationRequired          Boolean  @default(false)
  startedAt                       DateTime @default(now())
  finishedAt                      DateTime?
  createdAt                       DateTime @default(now())

  tenant                          Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  execution                       ActionExecution @relation(fields: [actionExecutionId, tenantId], references: [id, tenantId], onDelete: Cascade)

  @@unique([id, tenantId])
  @@unique([tenantId, actionExecutionId, attemptNumber])
  @@index([tenantId, state, startedAt])
  @@index([tenantId, providerReferenceHash])
}
```

Required relation additions during implementation:

- `Tenant.actionExecutions` and `Tenant.actionAttempts`;
- `AgentTask.actionExecutions`;
- named `Membership` back-relations for requester and approver;
- optional tenant-qualified `MarketingCampaign.actionExecutionId`, unique per parent execution.

Required raw SQL invariants that Prisma cannot fully express:

- partial unique index allowing one open `STARTED` attempt per execution;
- state-dependent `CHECK` constraints;
- legal-transition trigger;
- immutable identity/input/policy fields after first attempt;
- immutable finished attempts;
- `UNKNOWN -> READY` only after latest reconciliation proves non-execution;
- shadow-only implies `NOT_EXECUTED` and zero execution attempts;
- terminal state requires finalization and appropriate attempt/proof;
- nonblank/version-positive constraints;
- source type and source reference consistency;
- approval hash equals the immutable normalized input hash;
- no cross-tenant task, attempt, actor, approver, supersession, or campaign linkage.

The campaign implementation package must validate production-clone data before adding a delivery-attempt uniqueness constraint such as:

```text
(tenantId, campaignId, batchKey, attemptNumber)
```

No guessed deduplication or destructive cleanup is allowed if existing data violates the proposed invariant.

## Migration Plan

The future migration is additive and must follow a separate approved implementation phase.

1. Re-read current production schema and release tooling at implementation time.
2. Add enums, `ActionExecution`, and `ActionAttempt` with all tenant-qualified keys.
3. Add relation fields/back-relations without changing existing execution behavior.
4. Add SQL checks, partial uniqueness, and transition/immutability triggers in the migration.
5. Add optional campaign linkage only after its package validates existing campaign data.
6. Do not backfill historical AI executions, approvals, campaign attempts, or legacy actions.
7. Generate Prisma client and validate migration reproducibility on a clean database.
8. Apply migrations to a structural clone of production and run the full invariant/adversarial matrix.
9. Prove Prisma drift is zero. Stop on unexplained drift; do not guess a fix.
10. Deploy schema with no action executors enabled.
11. Implement and cut over one capability package at a time, beginning with local transactional writes.
12. During each cutover, use one execution owner only. Never dual-execute from legacy and Action Engine.
13. Keep legacy tables readable for audit until retention policy permits retirement.
14. Production verification remains shadow/read-only until the capability-specific execution gate is approved.

Rollback must disable new readers/writers first. The additive tables may remain; destructive rollback is not required.

## Adversarial DB Matrix

| Test | Expected database result |
|---|---|
| same logical identity, same tenant | one execution; duplicate insert collapses or conflicts deterministically |
| same identity, another tenant | allowed as a separate execution |
| same caller key, same payload | same execution |
| same caller key, changed payload | conflict, never second execution |
| AgentTask from another tenant | rejected by FK |
| actor/approver from another tenant | rejected by FK |
| attempt linked across tenants | rejected by FK |
| campaign linked across tenants | rejected by FK |
| two workers claim one `READY` row | exactly one claim succeeds |
| two open attempts for one execution | rejected by partial unique index |
| worker without current lease finalizes | rejected by guarded update |
| lease expires before dispatch | deterministic retry only when attempt proves `NOT_CROSSED` |
| lease expires after boundary may be crossed | execution becomes/remains `UNKNOWN` |
| blind `UNKNOWN -> READY` | rejected |
| reconciliation proves no execution | `UNKNOWN -> READY` allowed only if approval/policy/expiry still valid |
| reconciliation remains inconclusive | remains `UNKNOWN` or `MANUAL_REQUIRED` |
| terminal row rewritten | rejected |
| finished attempt mutated | rejected |
| shadow action creates attempt | rejected |
| denied/expired action claimed | rejected |
| changed payload after approval | rejected; approval invalid |
| stale/invalid AgentTask starts action | rejected by service + DB/source invariant where expressible |
| process restart after durable intent acceptance | same execution identity, no duplicate current execution |
| process restart after `MAY_HAVE_CROSSED` | `UNKNOWN` reconciliation path, no execution retry |
| provider returns success after local timeout | reconciliation finalizes original execution as success |
| provider reports two booking matches | `UNKNOWN`/manual incident, never fabricated success |
| campaign parent completes with failed recipients | parent result reports campaign outcome; does not claim all delivered |
| raw CRM payload or secret written to summary | privacy validation rejects/redacts |
| Action Engine imports direct unregistered side-effect owner | architecture test fails |

## Phase B Implementation Packages

Phase B is not started by this document. If this gate is approved, implementation should be split into reviewable packages:

### Package 1 - Schema and Database Invariants

- additive Prisma models/enums;
- SQL checks, partial indexes, transition and immutability triggers;
- tenant-FK, clean-DB, production-clone, reproducibility, and drift proof;
- no executor enabled.

### Package 2 - Contracts and Trusted Registry

- normalized action, result, policy, approval, idempotency, retry, reconciliation, and executor contracts;
- strict validation and privacy classification;
- architecture import barriers;
- no side effects.

### Package 3 - Lifecycle Repository and Claims

- get-or-create logical execution;
- atomic claims and lease recovery;
- attempt ledger;
- terminal/unknown transition enforcement;
- restart/concurrency adversarial tests;
- no external executor.

### Package 4 - Policy and Approval Adapter

- deterministic policy snapshot;
- exact-input approval binding;
- legacy AI approval compatibility reader;
- deny, expiry, revocation, and shadow-only proofs;
- no action execution.

### Package 5 - Local Transactional Pilot

- one low-risk, local, reversible capability such as a settings or task state write;
- single database transaction for domain write plus action finalization;
- direct legacy path disabled for pilot scope;
- E2E idempotency/restart/tenant proof.

### Package 6 - Reconciliation Framework

- capability-specific reconciliation claims and scheduling;
- `UNKNOWN` handling and manual-required escalation;
- no generic blind retry.

### Package 7 - Booking Mutations

- fix carry-forward 4.43 before cutover;
- cancel, reschedule, then create in increasing ambiguity order;
- provider correlation and duplicate adversarial tests.

### Package 8 - Inbox and Messaging

- separate durable inbox from provider delivery;
- one owner per capability;
- honest accepted/delivered/unknown semantics.

### Package 9 - Campaign Integration

- parent ActionExecution linkage;
- recipient attempt uniqueness and lease recovery;
- specialist delivery state preserved;
- bulk approval and privacy verification.

### Package 10 - Remaining Owner Cutovers

- HTTP mutation surfaces;
- schedulers;
- Python/PHP legacy bridge;
- capability-by-capability disablement of direct executors;
- final proof that one capability has one execution owner.

Payments, credential rotation, destructive access changes, and broad bulk messaging require separate high-risk gates even after the generic engine exists.

## Risks and Blockers

- Current provider mutation APIs do not all expose stable idempotency or correlation identities.
- Booking create can remain `UNKNOWN` without exact provider reconciliation.
- Campaign runtime does not yet fully exercise its rich durable schema.
- Push acceptance is not recipient delivery.
- Legacy Python/PHP paths can bypass a new engine until individually disabled.
- Existing AI approval/execution rows cannot be safely treated as canonical history.
- Carry-forward 4.43 can overwrite attendance during CRM mutation and blocks booking adapter cutover.
- Retention periods require legal/security approval before production enforcement.
- No action capability may enter production until its own executor, reconciliation, privacy, and adversarial package is approved.

## Gate Result

SCHEMA GATE READY: YES

DURABLE ACTION EXECUTION REQUIRED: YES

DURABLE ACTION ATTEMPT REQUIRED: YES

EXISTING APPROVAL MODEL REUSABLE: NO

EXISTING CAMPAIGN DELIVERY MODEL REUSABLE: YES

UNKNOWN OUTCOME REPRESENTABLE: YES

PRODUCTION DATABASE CHANGED: NO

READY FOR SCHEMA APPROVAL: YES

WAITING FOR APPROVAL
