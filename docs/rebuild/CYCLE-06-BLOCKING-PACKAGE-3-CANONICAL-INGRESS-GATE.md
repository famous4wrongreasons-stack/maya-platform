# CYCLE 06 — BLOCKING PACKAGE 3 — CANONICAL INGRESS GATE

Status: COMPLETE (pre-implementation gate only)
Repository HEAD inspected: `2f6d24b1`
Review date: 2026-08-29
Package order: 3 of 5
Package 3 application-code migration started: NO
External side effects performed: 0

## Exact Package From Remainder Review

**Canonical policy, approval, ActionIntent, and entitlement ingress**

Completion criterion from `CYCLE-06-REMAINDER-REVIEW.md`:

> Establish one decision owner; retire or migrate old AI approvals; bind server-derived access/autonomy/entitlements to durable execution.

This gate answers the first required implementation question: whether the current durable contract can prove that one exact action was allowed by current server-derived permission, autonomy, and entitlement facts and that any approval was bound to that complete decision.

## Scope Boundary

This step changed no application code, Prisma schema, migration, database, production data, runtime agent, provider, message, appointment, billing, loyalty, or customer state.

It inspected only the current decision and ingress surfaces needed for Package 3:

- `prisma/schema.prisma`;
- `src/action-engine/action-engine.contract.ts`;
- `src/action-engine/action-engine.kernel.ts`;
- `src/action-engine/action-engine.registry.ts`;
- `src/action-engine/action-engine.runtime.ts`;
- `src/ai-tools/ai-tool-policy.service.ts`;
- `src/ai-tools/ai-tool-runtime.service.ts`;
- `src/ai-tools/ai-tool-handler.service.ts`;
- `src/ai-tools/ai-tool.catalog.ts`;
- `src/entitlements/entitlements.service.ts`;
- `src/entitlements/feature.guard.ts`;
- `src/opportunities/opportunity.contract.ts`;
- `src/opportunities/opportunity.engine.ts`.

## Current Decision Surfaces

There is not one canonical production decision owner.

| Surface | Current responsibility | Durable decision truth | Package 3 verdict |
|---|---|---|---|
| Action Capability Registry | Static source allowlist, risk, policy decision, autonomy label, approval requirement, retry and executor selection | Copied into `ActionExecution` | Necessary registry, but not an actor/tenant-specific policy evaluator |
| Action Engine Kernel | Source validation, initial state, durable approval fields, claim and outcome lifecycle | `ActionExecution` / `ActionAttempt` | Canonical lifecycle exists, but current policy evidence is incomplete |
| AI Tool Policy Service | Role, surface and feature checks for the AI catalog | No durable Action Engine decision | Second policy owner |
| AI Tool Runtime | `AiApprovalRequest`, `AiToolExecution`, timeout and direct handler dispatch | Legacy AI tables | Second approval/execution lifecycle |
| Entitlements Service / Feature Guard | Effective plan, trial and override feature access | Recomputed response only | Canonical feature source, but no action-bound attestation |
| HTTP/domain guards and services | Route-specific role, tenant, target and feature checks | Domain-specific | Fragmented decision surfaces remain |
| Chapter 5 Opportunity/AgentTask/ActionIntent | Safe dry-run proposal and allowlist context | Opportunity/AgentTask lifecycle | Proposal source only; no generic executable ingress |
| Schedulers and legacy bridges | Initiator-specific eligibility checks | Fragmented | Must become callers of the same canonical resolver |

The AI catalog still exposes 12 ACTION tools. The three own-appointment tools now reach the canonical Action Engine executor through the appointment service, but the outer AI approval and execution lifecycle remains separate. The other nine ACTION tools still use the legacy AI runtime and direct domain handlers pending their capability packages.

## What The Current Action Engine Already Proves

The existing durable kernel is reusable and must not be replaced.

It already proves:

- tenant-qualified logical action identity;
- registered capability and normalized input hash;
- trusted source-type allowlisting;
- active actor membership when an actor is present;
- current AgentTask and Opportunity for `agent_task` sources;
- policy key/version/decision and autonomy labels pinned on the execution row;
- tenant-qualified approver membership;
- approval expiry and normalized-input binding;
- durable claim, attempt, `UNKNOWN`, reconciliation, and no-blind-retry semantics;
- one canonical executor per registered capability.

The schema already contains the correct generic execution and attempt models. Package 3 does not need a new generic approval table, ActionIntent table, policy-decision table, or entitlement table.

## Gaps That Block Package 3

### Static registry decision is not a complete policy decision

`initialDecision()` copies `policyDecision`, `autonomyLevel`, and `approvalRequirement` from the registered capability. New rows record `policyDecidedBy = trusted_capability_registry`.

The registry is authoritative for capability invariants, but it does not resolve the current requesting principal, role/branch scope, tenant access state, entitlement state, target permission, or tenant-specific autonomy setting. A static `ALLOW` therefore cannot by itself prove that a specific actor may request the specific target now.

### Actor validation is too narrow

`validateSource()` rejects a missing or inactive membership. It does not bind or persist:

- the membership role and branch scope used for permission;
- the tenant access/status decision;
- capability-specific target ownership or scope;
- required feature keys and the effective entitlement result;
- the source of the autonomy decision;
- a validity horizon for mutable policy evidence.

### Claim-time freshness is incomplete

Before claim, the kernel rechecks intent expiry, approval expiry, and current AgentTask/Opportunity state. For non-AgentTask sources it does not re-resolve actor permission, tenant access, entitlement, or autonomy. Revocation between creation and claim is therefore not represented by one canonical currentness check.

### Approval binding is incomplete as an explicit contract

The approval lives on the exact tenant-qualified `ActionExecution` row, and the row stores capability, target, actor, policy, risk, and input fields. That is a strong base.

However, `approvalInputHash` explicitly hashes only normalized input. There is no explicit approval binding hash over tenant, actor, capability/version, target, normalized input, policy context, risk, and expiry. The current kernel also uses one broad hard-coded approver-role set rather than a capability policy result.

### Legacy AI lifecycle is still authoritative for AI surfaces

The AI runtime separately:

1. evaluates role, surface, and entitlements;
2. persists `AiApprovalRequest`;
3. persists `AiToolExecution`;
4. invokes the domain handler;
5. records a timeout with code `ai_tool_timeout_unknown` as legacy status `failed`.

This path cannot become the canonical Package 3 lifecycle. It has no Action Attempt ledger, does not preserve canonical `UNKNOWN`, and remains a separate decision/approval owner even when its handler eventually reaches an Action Engine-owned appointment executor.

### ActionIntent has no generic executable ingress

`ActionIntentV1` is correctly constrained to `dryRun: true` and `state: proposed`, and its arguments reject keys that could smuggle permission, autonomy, capability, identity, messages, credentials, or unrestricted payloads.

`createFromChapter5Intent()` is also correctly restricted to registered `SHADOW_ONLY` capabilities. No production service exposes a generic adapter that resolves a proposed intent with current server-derived actor, permission, entitlement, autonomy, and approval evidence. This restriction must remain until the canonical resolver exists.

### Entitlements are computed but not attested to an action

`EntitlementsService` is the current effective feature source across plan entitlements, trial access, tenant overrides, expiry, and feature dependencies. Its result is not versioned or hashed into an `ActionExecution`, and the Action Engine does not call it before create or claim.

The Action Engine must consume this service's server-derived decision. It must not accept `hasFeature`, plan, role, autonomy, or entitlement booleans from an ActionIntent, client, scheduler, webhook, or legacy bridge.

## Schema Decision

`SCHEMA GATE REQUIRED: YES`

`NEW GENERIC TABLE REQUIRED: NO`

The existing `ActionExecution` model is the canonical owner, but it needs a minimal policy-attestation extension before Package 3 can claim one durable decision chain.

Add nullable rollout fields to `ActionExecution`:

| Field | Purpose |
|---|---|
| `policyContextContract` | Versioned contract for canonical server-derived decision input/evidence |
| `policyContextHash` | Keyed hash binding the complete normalized policy context to the execution |
| `policyEvidenceJson` | Safe codes and hashed/versioned evidence references; no secrets, raw PII, or client assertions |
| `policyEvaluatedAt` | Time of canonical policy resolution |
| `policyValidUntil` | Maximum time the mutable decision may be claimed without a new resolution |
| `approvalBindingHash` | Keyed hash over the complete immutable approval subject, not input alone |

Rollout fields are nullable only for existing execution rows and rollback compatibility. Every new capability/policy contract version participating in Package 3 must require them before it can reach `READY` or `PENDING_APPROVAL`.

`approvalInputHash` remains readable during transition but is not sufficient for the new approval contract. Historical `AiApprovalRequest` and `AiToolExecution` rows remain legacy audit records and are not backfilled or treated as Action Engine history.

No durable raw `ActionIntent` is added. The normalized execution contract remains the durable truth.

## Canonical Policy Context

Trusted server code must build a versioned context containing, at minimum:

- tenant id and current tenant access/status evidence;
- source type and durable source reference;
- actor's tenant-qualified membership reference, status, role and applicable branch scope;
- registered capability, capability version, action class, target kind and normalized target reference;
- normalized input hash;
- risk profile version and risk facets;
- required permission/scope codes and their server-derived decisions;
- required feature keys and the effective entitlement decision;
- autonomy policy source and resolved autonomy level;
- approval requirement and approver policy;
- policy key/version, evaluation time, and validity horizon.

The persisted evidence JSON contains only stable codes, versions, timestamps, and opaque/hash references needed for audit. It must not contain access tokens, plan secrets, raw CRM payloads, prompts, names, phone numbers, email addresses, or model reasoning.

The context hash participates in logical policy identity and approval binding. A changed actor role, target scope, entitlement, autonomy rule, policy version, risk profile, or normalized action invalidates the old decision.

## Approval Binding

`approvalBindingHash` must bind all of the following:

- tenant;
- requesting actor membership;
- source type/reference;
- capability and capability version;
- action class;
- target kind/reference;
- normalized input hash;
- policy key/version/context hash;
- risk profile version/facets;
- approval requirement and expiry.

Approval may move one exact execution from `PENDING_APPROVAL` to `READY`. It cannot authorize a later payload, a different target, a different tenant, a different actor, a changed policy context, or a different capability.

The approver policy comes from the canonical resolver and registered capability contract. A caller may supply only an authenticated approver identity and decision, never the required role or approval scope.

## Canonical Ingress Order

The required order is:

1. authenticate and resolve tenant/source on the server;
2. resolve the exact registered capability from deterministic routing;
3. normalize target and input with the trusted capability normalizer;
4. resolve current membership, permission, tenant access, entitlement, and autonomy facts;
5. construct and hash the canonical policy context;
6. persist or converge to one `ActionExecution`;
7. obtain approval when required, bound to the complete execution and policy context;
8. re-resolve mutable policy facts before claim;
9. dispatch only through the capability's one registered executor.

ActionIntent, HTTP, AI tool, scheduler, webhook, and legacy bridge entry points may differ only before step 1. They may not own alternative policy, approval, idempotency, retry, or execution semantics.

## ActionIntent Boundary

The future generic adapter may accept only:

- a trusted tenant context;
- a durable, current AgentTask/Opportunity projection;
- a registered capability and action class that match the task allowlist;
- typed proposal arguments accepted by the capability normalizer;
- opaque target and evidence references;
- an unexpired dry-run proposal.

It must independently resolve actor, membership, target permission, entitlements, autonomy, approval requirement, risk, executor, credentials, and policy version. Any attempt by proposal data to select those values fails closed.

Until this adapter and policy resolver are implemented and verified, executable `agent_task` ingress remains disabled. Current Chapter 5 `SHADOW_ONLY -> shadow.none` behavior remains the safe production boundary.

## Legacy AI Convergence Rule

For a migrated AI ACTION capability:

- the AI tool catalog may remain a presentation and typed-input surface;
- `AiToolPolicyService` may temporarily act only as a compatibility caller of the canonical resolver, not as an independent final decision owner;
- new approval and execution truth is written only to `ActionExecution` / `ActionAttempt`;
- `AiApprovalRequest` / `AiToolExecution` may be read for historical audit and compatibility responses only;
- the handler must submit the canonical request and cannot directly invoke the domain mutation as fallback;
- a missing resolver, missing attestation, or Action Engine rejection fails closed;
- legacy timeout-as-`failed` cannot override canonical `UNKNOWN`.

No old approval row is silently converted into a valid canonical approval. A live pending approval must be re-created against the complete Package 3 binding or expire safely.

## Claim-Time Revalidation

Before the first execution claim and every safe pre-dispatch retry, the canonical resolver must recheck mutable facts:

- actor membership is active and retains the required role/scope;
- tenant access state permits the capability;
- required entitlements remain enabled and unexpired;
- target ownership/scope remains valid;
- source and intent remain current;
- autonomy and policy version remain valid;
- required approval is present, unexpired, and matches `approvalBindingHash`.

If a mutable fact changed before dispatch, the action becomes `NOT_EXECUTED` with a stable reason code. It is not silently re-authorized and does not fall back to a legacy executor.

After external dispatch may have crossed, policy revocation cannot rewrite physical history. The execution preserves `UNKNOWN`/outcome truth and follows reconciliation or manual handling without blind retry.

## Adversarial Verification Required For Implementation

| Attempted falsification | Required result |
|---|---|
| Initiator supplies tenant, role, plan, entitlement, autonomy, approver scope, risk, or executor | Rejected; server-derived values win |
| Actor belongs to another tenant | Rejected before execution creation |
| Actor membership becomes inactive before claim | `NOT_EXECUTED`; zero dispatch |
| Actor role/branch scope changes before claim | Decision invalidated; zero dispatch |
| Tenant entitlement expires or is revoked before claim | Decision invalidated; zero dispatch |
| Counts/features match but policy evidence hash changes | Old approval rejected |
| Approval is replayed for changed target/input/capability | Binding mismatch; rejected |
| Policy or risk version changes after approval | Old approval rejected or execution requires a new decision |
| ActionIntent tries to choose an executable capability or autonomy outside its AgentTask allowlist | Rejected |
| AI compatibility path calls a domain mutation after Action Engine rejection | Ratchet failure; no fallback |
| Legacy AI timeout is classified as definitive failure after dispatch may have crossed | Rejected; canonical `UNKNOWN` preserved |
| Two ingress surfaces submit the same logical action | One `ActionExecution`; no dual dispatch |
| Old `AiApprovalRequest` is treated as canonical approval without rebinding | Rejected |

## Package 3 Implementation Completion Criteria

Package 3 is complete only when all of the following are proven:

1. one canonical server-side policy resolver owns permission, tenant access, entitlement, autonomy, risk, and approval requirement for Action Engine requests;
2. the new policy context and approval binding are durable and claim-time current;
3. ActionIntent ingress cannot accept client/model-selected decision fields and remains non-executable unless the registered policy permits it;
4. migrated AI ACTION paths create/approve/execute only through `ActionExecution` / `ActionAttempt`;
5. old AI approval/execution tables are compatibility/audit only for migrated capabilities;
6. no runtime fallback invokes a legacy domain mutation after denial, approval failure, resolver failure, or `UNKNOWN`;
7. tenant, role/scope, entitlement, approval, stale-policy, idempotency, concurrency, restart, and no-fallback ratchets pass;
8. production side effects generated by verification remain zero.

## Final Verdict

```text
PACKAGE 3 PRE-IMPLEMENTATION GATE COMPLETE: YES
CURRENT CANONICAL POLICY RESOLVER EXISTS: NO
CURRENT GENERIC EXECUTABLE ACTIONINTENT INGRESS EXISTS: NO
OLD AI APPROVAL/EXECUTION LIFECYCLE REMAINS: YES
ACTIONEXECUTION MODEL REUSED: YES
NEW GENERIC TABLE REQUIRED: NO
ACTIONEXECUTION POLICY-ATTESTATION EXTENSION REQUIRED: YES
SCHEMA GATE REQUIRED: YES
PACKAGE 3 APPLICATION-CODE MIGRATION STARTED: NO
EXTERNAL SIDE EFFECTS: 0
```
