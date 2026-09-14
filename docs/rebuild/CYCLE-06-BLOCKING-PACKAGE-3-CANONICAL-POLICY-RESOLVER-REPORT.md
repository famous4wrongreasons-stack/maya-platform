# CYCLE 06 — BLOCKING PACKAGE 3 — CANONICAL POLICY RESOLVER REPORT

Status: COMPLETE (resolver-only step; no runtime cutover)
Repository HEAD before implementation: `e8fe96fa`
Review date: 2026-08-29
Production migration applied: NO
External side effects performed: 0

## Scope

This step implements only the isolated canonical server-side policy and
entitlement resolver required by Blocking Package 3.

It does not connect the resolver to Action Engine creation or claim, does not
change an AI/HTTP/Python/scheduler producer, does not activate an ActionIntent,
does not replace legacy AI approval, does not apply the Package 3 migration,
and does not dispatch or reconcile an action.

## Canonical Inputs

The resolver accepts only the versioned server contract
`maya.action-policy-resolution-request/1`:

- server-resolved tenant id;
- deterministic registered capability key;
- registered source type and durable source reference;
- authenticated actor id when the registered policy requires an actor;
- opaque target reference;
- normalized input HMAC produced by the trusted capability normalizer.

The request has no authority fields. Runtime validation rejects every unknown
key before reading tenant state. Tests explicitly reject caller-provided
entitlement, approval, autonomy, policy-decision, role, risk, executor, and
tenant-status values.

## Server-Derived Decision

`CanonicalActionPolicyResolver` derives the decision from server-owned sources:

| Decision fact | Authoritative source |
|---|---|
| capability, action class, source allowlist, risk, autonomy, approval requirement | `ActionCapabilityRegistry` |
| permission codes, allowed actor roles, actor/service rule, required feature keys, approver policy, validity TTL | `CanonicalActionPolicyRegistry` supplied by trusted server code |
| tenant access and mutable access horizon | tenant row plus canonical `evaluateTenantAccessState()` |
| actor role, status and branch scope | tenant-qualified `Membership` and current user status |
| plan/trial/override entitlements | `EntitlementsService.resolveFeatureRequirements()` |

An absent canonical policy profile fails closed before any database decision is
created. An actorless source is allowed only when its exact source type is
registered as a trusted service source in the server policy. An authenticated
request cannot use that exception.

Tenant suspension, missing/inactive membership, inactive user, disallowed role,
or missing entitlement produces a server-derived `DENY` with stable reason
codes. Static capability `DENY` and `SHADOW_ONLY` decisions remain authoritative.

## Durable Attestation Output

The resolver returns values ready for the nullable rollout fields introduced at
`e8fe96fa`:

- `policyContextContract`;
- `policyContextHash`;
- `policyEvidenceJson`;
- `policyEvaluatedAt`;
- `policyValidUntil`;
- `approvalBindingHash`.

It also returns the server-derived policy key/version/decision, decision owner,
autonomy, risk profile, approval requirement, approver policy key, stable reason
codes, and the maximum approval-binding horizon.

The policy validity horizon is the earliest of the registered short TTL,
tenant access-window transition, trial/grace expiry, and effective entitlement
expiry. The evidence JSON contains stable codes, timestamps, feature decisions,
and keyed opaque references. Raw tenant, actor, membership, branch, target,
source, and plan identifiers are not persisted in the evidence document.

`approvalBindingHash` binds tenant, actor and membership scope, source,
capability/version, action class, target, normalized input, policy context,
risk, approval requirement, approver policy, and expiry. This step computes the
binding but does not make the existing approval lifecycle consume or enforce it.

## Entitlement Contract

`EntitlementsService.resolveFeatureRequirements()` reuses the existing
plan/trial/tenant-override calculation and returns only the exact registered
feature requirements, their server-derived booleans, the aggregate decision,
evaluation time, and earliest known expiry. Existing entitlement callers and
their response shape are unchanged.

## No-Cutover Proof

- `CanonicalActionPolicyResolver` is not a provider in `ActionEngineModule`;
- `ActionEngineKernel` and `ActionEngineRuntimeService` do not call it;
- AI tools, HTTP controllers, communication/CRM paths, Python bridges and
  schedulers are unchanged by this step;
- no production policy profile is instantiated by a runtime module;
- the Prisma schema and migration ledger are unchanged by this step;
- the migration created at `e8fe96fa` was not applied.

## Verification

- targeted resolver and entitlement suites: **2 suites / 14 tests passed**;
- targeted ESLint: passed;
- TypeScript typecheck: passed;
- `git diff --check`: passed;
- full Jest suite: not run for this isolated step;
- production database or external action: none.

## Boundary After This Step

The resolver contract exists and can produce the complete Package 3 policy
attestation. Runtime cutover, persistence into new `ActionExecution` rows,
claim-time revalidation, approval lifecycle enforcement/rebinding,
capability-specific target authorization, and legacy AI convergence remain
unstarted. Package 3 is not complete.

```text
CANONICAL SERVER-SIDE POLICY RESOLVER IMPLEMENTED: YES
CALLER-SUPPLIED AUTHORITY ACCEPTED: NO
SERVER-DERIVED ENTITLEMENT DECISION: YES
POLICY ATTESTATION OUTPUT COMPLETE: YES
APPROVAL BINDING COMPUTED: YES
APPROVAL BINDING ENFORCED: NO
RUNTIME CUTOVER STARTED: NO
MIGRATION APPLIED: NO
PACKAGE 3 COMPLETE: NO
PACKAGE 4 STARTED: NO
CHAPTER 7 STARTED: NO
EXTERNAL SIDE EFFECTS: 0
```
