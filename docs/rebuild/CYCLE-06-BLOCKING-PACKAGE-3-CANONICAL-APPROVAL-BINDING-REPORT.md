# CYCLE 06 — BLOCKING PACKAGE 3 — CANONICAL APPROVAL BINDING REPORT

Status: COMPLETE (approval-binding-only step; no runtime cutover)
Repository HEAD before implementation: `c3bf8763`
Review date: 2026-08-29
Production migration applied: NO
External side effects performed: 0

## Scope

This step implements and isolates the canonical approval-binding authority on
top of `CanonicalActionPolicyResolver` and the existing
`approvalBindingHash` attestation.

It does not register a production provider, implement a Prisma repository,
change `ActionEngineKernel` or `ActionEngineRuntimeService`, connect any
AI/HTTP/Python/scheduler ingress, apply the pending migration, dispatch an
action, start Package 4, or start Chapter 7.

## Server-Side Authority

`CanonicalApprovalBindingService.authorizeForClaim()` accepts only the
versioned server contract, one durable execution id, and the existing
server-derived policy-resolution request. Unknown top-level keys are rejected.
The nested resolver request already rejects caller-provided authority such as
`approved`, approval decisions, entitlements, autonomy, policy decisions, role,
or a binding hash before reading server state.

The service never treats an approval flag or hash in an initiator payload as
evidence. It re-resolves the current policy from server-owned tenant,
membership, entitlement, registry, and source facts, then loads the approval
from a tenant-qualified durable `ActionExecution` projection.

`CanonicalActionPolicyResolver.verifyApprovalBinding()` now verifies both HMAC
layers with the server-only attestation secret:

1. the persisted evidence document must reproduce `policyContextHash`;
2. the exact tenant, requester membership, source, capability/version, action
   class, target, normalized payload hash, policy context, risk contract,
   approval requirement, approver policy, and expiry must reproduce
   `approvalBindingHash`.

Hash comparison is constant-time. A row marked `APPROVED` with a forged binding
or changed evidence remains unauthorized.

## Current-Policy Revalidation

The persisted attestation is verified cryptographically at its original
evaluation time. Current server-owned policy facts are independently resolved
again before authorization. Material evidence must still match; changes to
tenant, requester membership, entitlement/plan context, capability contract,
target, payload, or policy context invalidate the approval.

Evaluation timestamps and their derived horizons are not compared as material
identity because a later re-evaluation necessarily has a later timestamp.
Both the persisted approval/policy expiry and the current policy validity are
checked separately. A test proves that unchanged facts remain valid across
evaluation-time drift while changed policy context fails closed.

## One-Time Use

Approval is not emitted as a reusable token. A required approval authorizes
only the exact durable execution row in `READY + APPROVED` state. The repository
contract requires one atomic compare-and-swap at the execution-claim boundary,
guarded by:

- tenant and execution id;
- `READY` state and `APPROVED` decision;
- execution revision;
- exact `policyContextHash`;
- exact `approvalBindingHash`.

Only one claimant can consume that approval. A second claimant, a stale
revision, or a row that already left `READY` receives
`APPROVAL_ALREADY_CONSUMED_OR_STALE` and no external execution permission.
The production database adapter and runtime claim integration intentionally
remain unimplemented in this isolated step.

## Approval-Free And Shadow Behavior

- An `ALLOW` capability whose canonical requirement is `NONE` returns
  `NOT_REQUIRED` without reading or consuming an approval row. No artificial
  approval dependency is created.
- `DENY` and `SHADOW_ONLY` stop before approval lookup and always return
  `externalExecutionAllowed: false`.
- L2.5 Shadow can therefore produce a complete policy/approval calculation but
  cannot acquire permission for an external execution.

## Schema Sufficiency

No schema expansion is required. The six Package 3 attestation fields hold the
policy evidence and binding, while existing fields already hold approval
decision/expiry and exact execution state:

- `policyContextContract`, `policyContextHash`, `policyEvidenceJson`;
- `policyEvaluatedAt`, `policyValidUntil`, `approvalBindingHash`;
- existing `approvalDecision`, `approvalExpiresAt`, approval actor/time;
- existing `state`, `revision`, tenant id, execution id, action subject fields.

Revocation is represented by the existing durable non-approved state
`approvalDecision = REJECTED`; an expired approval uses `EXPIRED` or an elapsed
`approvalExpiresAt`. Both fail before claim. Runtime revocation/cutover was not
implemented here. The migration already present from the schema-foundation step
was not changed or applied.

## Adversarial Verification

| Case | Isolated result |
|---|---|
| valid approval | binding cryptographically matches; one atomic consume succeeds |
| changed target | rejected; no consume |
| changed normalized payload | rejected; no consume |
| wrong tenant | rejected even if a repository leaks the old row |
| different requester | membership-bound evidence changes; rejected |
| different capability/action class | resolver-derived subject changes; rejected |
| changed policy context | material server-derived evidence changes; rejected |
| expired approval | rejected before consume |
| revoked/rejected approval | rejected before binding use |
| caller-forged `approved` or binding | contract rejection before repository read |
| forged durable binding | HMAC verification fails |
| approval not required | succeeds without approval lookup or consume |
| L2.5 Shadow | policy computed; external permission remains false |
| repeated one-time use | first claimant wins; second is rejected as stale/consumed |
| evaluation-time drift only | unchanged material context remains valid |

## Verification

- targeted approval-binding and policy-resolver suites: **2 suites / 20 tests
  passed**;
- targeted ESLint for changed Action Engine files: passed;
- TypeScript typecheck: passed;
- `git diff --check`: passed;
- full Jest suite: not run for this isolated step;
- Prisma schema/migration changes in this step: none;
- migration applied: no;
- production database or external action: none.

## Boundary After This Step

Canonical approval binding is implemented and proven as an isolated Package 3
component. Runtime ingress/cutover, a production repository adapter, module
wiring, claim integration, and producer convergence remain unstarted. Package 3
is not complete.

```text
CANONICAL APPROVAL BINDING IMPLEMENTED: YES
VALID APPROVAL BINDS EXACT LOGICAL ACTION: YES
CALLER-SUPPLIED APPROVAL AUTHORITY ACCEPTED: NO
FORGED OR CHANGED BINDING ACCEPTED: NO
EXPIRED OR REVOKED APPROVAL ACCEPTED: NO
ONE-TIME APPROVAL REUSABLE: NO
APPROVAL-FREE ACTION ARTIFICIALLY BLOCKED: NO
L2.5 SHADOW EXTERNAL EXECUTION ALLOWED: NO
SCHEMA EXPANDED: NO
RUNTIME CUTOVER STARTED: NO
MIGRATION APPLIED: NO
PACKAGE 3 COMPLETE: NO
PACKAGE 4 STARTED: NO
CHAPTER 7 STARTED: NO
EXTERNAL SIDE EFFECTS: 0
```
