# CYCLE 06 — BLOCKING PACKAGE 3 — CANONICAL INGRESS RUNTIME WIRING REPORT

Status: COMPLETE (local runtime wiring; production cutover not performed)
Repository HEAD before implementation: `c3d4ba7a`
Review date: 2026-08-29
Production deployment/cutover: NO
Production migration applied: NO
External side effects performed: 0

## Scope

This step wires the existing Package 3 policy resolver and approval binding to
the local Action Engine module, runtime creation path, durable kernel creation,
and execution claim boundary.

It does not deploy application code, apply a migration, alter production data,
run a production action, rewrite appointment or communication executors, enable
the A08 payment write, migrate the remaining legacy AI approval lifecycle,
start Package 4, or start Chapter 7.

## Canonical Runtime Chain

The local code path is now:

```text
AI / HTTP / scheduler / legacy bridge / future agent
  -> CanonicalActionIngressService
  -> CanonicalActionPolicyResolver
  -> CanonicalApprovalBindingService
  -> ActionExecution
  -> ActionEngineKernel / ActionEngineRuntimeService
```

`ActionEngineRuntimeService.preview()`, `planShadow()`, and
`executeWithReceipt()` no longer ask the kernel to create an execution
directly. Preview and both durable creation paths go through
`CanonicalActionIngressService`.

`ActionEngineModule` now composes and injects:

- `EntitlementsService` through `EntitlementsModule`;
- one `ActionCapabilityRegistry`;
- one production `CanonicalActionPolicyRegistry`;
- one `CanonicalActionPolicyResolver` with the server attestation secret;
- one guarded `ActionEngineKernel`;
- one `CanonicalActionIngressService`;
- `ActionEngineRuntimeService` over that ingress and kernel.

No alternate production provider constructs a second runtime or kernel.

## Initiator Boundary

Canonical ingress accepts only the trusted versioned action request fields. It
rejects unknown or authority-bearing top-level/source fields before policy or
database reads. Tests explicitly reject caller-supplied:

- `entitled` / entitlement claims;
- `approved` / approval decisions;
- autonomy values;
- policy decisions;
- executor selection;
- `approvalBindingHash` and `policyContextHash`;
- caller-selected role on the source.

Tenant, actor identity, and durable source reference may only arrive through a
trusted server adapter. The resolver then independently loads tenant access,
tenant-qualified membership, current role/branch, user status, and effective
entitlements. The initiator cannot supply those decisions.

Every non-fixture registered capability has one server-owned production policy
profile. `kernel.test.*` capabilities are excluded from the production policy
registry.

## Durable Kernel Gate

The former public `createExecution()` bypass no longer exists.

The production method is `createCanonicalExecution(request, policy)`. Before a
transaction can create a row, the kernel:

1. normalizes capability, target, input, idempotency, and logical identity with
   the existing trusted registry and identity service;
2. reconstructs the exact policy subject;
3. verifies the evidence HMAC and complete `approvalBindingHash` using the
   server resolver;
4. verifies that evidence and top-level decision fields agree;
5. verifies capability/version, action class, target kind, policy/risk version,
   autonomy, approval requirement, approver policy, and validity horizon;
6. persists the six Package 3 attestation fields with the existing execution
   lifecycle fields.

A forged binding fails before the create transaction. A valid evidence HMAC
with a modified top-level policy decision also fails before creation.

Dynamic server denial produces `NOT_EXECUTED`; it cannot be upgraded to
`READY`. `SHADOW_ONLY` persists only as `dryRun + NOT_EXECUTED + shadow_only`.

## Claim-Time Policy And Approval

The kernel still obtains the existing database row lock before claim. Inside
that same transaction boundary it now requires canonical attestation for every
non-fixture execution, including approval-free actions.

Claim-time verification:

- reconstructs the action subject only from durable execution fields;
- re-resolves current tenant, membership role/branch, entitlement, autonomy,
  capability, and policy facts server-side;
- cryptographically verifies the persisted evidence and binding;
- compares current material policy evidence to the approved/persisted context;
- checks persisted and current validity horizons;
- for required approval, requires `READY + APPROVED`, approval actor/time,
  unexpired exact binding, revision, and one atomic locked claim;
- for approval-free actions, requires canonical execution attestation but does
  not manufacture an approval dependency.

Approval decisions without the six-field canonical attestation and binding
fail with `CANONICAL_APPROVAL_BINDING_REQUIRED`. The canonical approver policy
is read from signed server evidence; `tenant-owner` accepts only its registered
server-side roles. A caller cannot supply approver scope.

The locked execution transition to `EXECUTING`, attempt creation, and lease
remain the one-time approval consumption boundary. Repeated or stale claims
cannot reuse approval.

## Architectural Ratchet

`canonical-action-ingress.architecture.spec.ts` enforces:

- the only production `actionExecution.create()` is inside the guarded kernel;
- the only production caller of `createCanonicalExecution()` is canonical
  ingress;
- runtime contains two durable ingress calls and zero direct kernel creation
  calls;
- migrated CRM, communication delivery, and communication shadow services do
  not import the kernel or create `ActionExecution` directly;
- module wiring contains resolver, entitlements, ingress, kernel, and runtime;
- direct proof creation is available only through the explicit
  `createExecutionForControlledFixture()` method with
  `controlledFixtureMode: true`;
- the A08 payment write remains disabled before any Action Engine dispatch.

Measured result in production source and tested migrated paths:

```text
PRODUCTION ACTIONEXECUTION CREATE OWNERS: 1 (guarded kernel)
PRODUCTION CANONICAL KERNEL CREATE CALLERS: 1 (canonical ingress)
RUNTIME DIRECT KERNEL CREATE CALLS: 0
EXECUTABLE ACTIONEXECUTION BYPASS IN TESTED PATHS: 0
```

## Migrated Path Adjustments

Appointment and communication executors were not rewritten.

- CRM appointment requests continue to use `ActionEngineRuntimeService`; the
  authenticated actor id now comes from `TenantContextService` whenever a
  server-authenticated user exists, independent of whether the cached context
  carries a membership id. Membership, role, and branch are still loaded by
  the resolver.
- Bulk communication now binds the authenticated campaign actor id into the
  source before ingress. The resolver performs the tenant membership decision.
- Scheduler, webhook, legacy bridge, and AgentTask sources are actorless only
  when the exact source type is registered as a trusted server source for that
  capability.
- Legacy appointment shadow preview remains zero-side-effect and passes the
  canonical resolver boundary.

## Preserved Action Engine Semantics

Existing logical identity, caller idempotency, duplicate convergence, durable
claim/lease, execution-attempt counting, dispatch-crossing truth, `UNKNOWN`,
reconciliation, no-blind-retry, and executor selection code was not replaced.
The new claim gate runs before the existing claim/attempt transition. No legacy
fallback was added.

The A08 `crm.visit.payment.v1` registry decision remains `DENY`, and
`executePayVisitWithReceipt()` still returns
`visit_payment_write_provider_contract_deferred` without dispatch.

## Schema Decision

The existing gate is sufficient. No schema or migration file changed.

The local Prisma client was regenerated from the already committed schema so
TypeScript could see the six existing fields. This did not connect to a
database and did not apply any migration.

## Verification

- targeted Package 3, registry, appointment boundary, and migrated legacy
  suites: **9 suites / 80 tests passed**;
- architectural bypass ratchet: passed;
- targeted ESLint for every changed backend/script file: passed;
- application TypeScript typecheck: passed;
- proof/script TypeScript typecheck: passed;
- `git diff --check`: passed;
- full Jest suite: not run under the low-load constraint;
- production deployment/cutover: not performed;
- production migration: not applied;
- production database/provider/message/CRM side effect: none.

## Boundary After This Step

Canonical ingress is wired to local module/runtime/kernel and migrated Action
Engine paths. Production deployment/cutover remains deliberately unperformed.
The remaining Package 3 work includes production rollout proof and convergence
of still-legacy AI approval/execution surfaces; it was not started here.

```text
CANONICAL INGRESS WIRED TO RUNTIME: YES
EXECUTABLE ACTIONEXECUTION BYPASS IN TESTED PATHS: 0
POLICY/APPROVAL SERVER-DERIVED: YES
L2.5 CAN EXECUTE EXTERNALLY: NO
PRODUCTION CUTOVER: NO
SCHEMA EXPANDED: NO
MIGRATION APPLIED: NO
PACKAGE 3 COMPLETE: NO
PACKAGE 4 STARTED: NO
CHAPTER 7 STARTED: NO
EXTERNAL SIDE EFFECTS: 0
```
