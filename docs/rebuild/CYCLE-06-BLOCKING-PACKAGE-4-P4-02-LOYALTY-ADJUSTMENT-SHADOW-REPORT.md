# CYCLE 06 BLOCKING PACKAGE 4 — P4-02 LOYALTY ADJUSTMENT SHADOW REPORT

Status: PASS — canonical shadow wired locally; executable cutover not started
Source checkpoint: `16bbc700`
Report date: 2026-08-29

## 1. Completed Boundary

The first runtime family selected by the approved Package 4 Gate is
`P4-02 / A19 — Nest internal loyalty balance adjustment`, exact action class
`adjust_internal_loyalty`.

The preceding P4-01/A08 payment write remains physically disabled and is not a
runtime migration candidate. A20-L legacy loyalty, referral, subscription,
certificate, expense, billing, value configuration, and payment-credential
families were not started.

Because P4-02 changes customer value, this step implemented only the required
pre-cutover L2.5 Shadow/structural proof. It did not register an executable
loyalty executor, bind a ledger mutation to a shadow execution, deploy to
production, or cut over a production owner.

The factual pre-checkpoint is recorded separately in
`CYCLE-06-BLOCKING-PACKAGE-4-P4-02-LOYALTY-ADJUSTMENT-RUNTIME-PRECHECKPOINT.md`.

## 2. Canonical Shadow Contract

The Action Engine registry now owns
`loyalty.internal-adjust.shadow.v1` with:

- action class: `adjust_internal_loyalty`;
- target kind: `loyalty_account`;
- source type: authenticated server request only;
- policy: `SHADOW_ONLY`;
- autonomy: `L2_5_SHADOW`;
- executor: `shadow.none`;
- execution attempts: `1` with no retry;
- external execution permission: none;
- normalized input: only integer `delta` and trimmed bounded `reason`;
- unexpected authority-like fields such as `approved` rejected.

The canonical policy registry derives server-side:

- tenant and active access state;
- authenticated membership and actor role;
- exact allowed roles: tenant owner, business owner, tenant admin, or
  administrator;
- required `loyalty` entitlement;
- policy context, evidence, validity, and approval-binding attestation fields.

Client or model data cannot select the capability, executor, policy decision,
autonomy, entitlement, approval state, or binding hash.

## 3. Runtime Wiring

Both current production initiators now carry a fixed server source identity:

- admin HTTP: `http.admin-loyalty.adjust`;
- approved AI tool: `ai-tool.loyalty.internal.adjust`.

`LoyaltyService.adjustInternalBalance` creates the canonical shadow execution
after tenant, internal-calendar authority, target user, and actor validation,
but before entering the serializable ledger transaction. A canonical policy or
entitlement failure therefore fails closed before the value mutation.

The shadow request binds:

- trusted tenant and actor;
- target user as canonical `targetRef`;
- normalized delta and reason;
- caller UUID under server-selected scope `loyalty.internal-adjust`;
- stable occurrence scope derived from that UUID.

The resulting shadow execution is durably `NOT_EXECUTED`. The later legacy
domain transaction deliberately does **not** set
`LoyaltyTransaction.actionExecutionId`, because binding a real mutation to a
non-executing shadow would falsely claim canonical execution. Its shadow
execution id is included only in the existing audit metadata for correlation.

## 4. Idempotency, UNKNOWN, And Reconciliation Boundary

The existing unique domain claim `(tenantId, idempotencyKey)` remains intact.
Canonical shadow identity uses the same UUID and additionally binds target,
actor policy context, normalized payload, and source.

There is no provider dispatch in P4-02. A later executable implementation can
become `UNKNOWN` only if the local serializable transaction commits but the
process loses acknowledgement before Action Engine finalization. That later
cutover must reconcile by tenant and domain idempotency key, verify the exact
account/actor/delta/reason/execution binding, and only retry after authoritative
absence proves non-execution. No UNKNOWN state or retry path is activated by
this shadow-only step.

The additive Package 4 schema is sufficient for that later cutover:
`LoyaltyTransaction.actionExecutionId` is nullable for history,
tenant-qualified, immutable after establishment, and intentionally non-unique
for a possible execution-to-ledger-row 1:N result. No new schema Gate is
required.

## 5. Current Owner And Bypass Verdict

Static production-source inspection found exactly one direct ledger mutation
owner: `loyalty.service.ts`. The two initiators do not write the ledger
directly.

This Shadow is not counted as executable convergence. Until a separate
approval/reconciliation proof authorizes local executable cutover,
`LoyaltyService` remains one direct Action Engine bypass group. There is no
runtime legacy fallback added by this step; the pre-existing owner is retained
explicitly rather than mislabeled as canonical.

## 6. Targeted Verification

| Check | Result |
|---|---|
| Capability normalizer and server policy | PASS |
| Authority-like payload rejection | PASS |
| L2.5 `shadow.none` / no execution permission | PASS |
| HTTP and AI fixed server source refs | PASS |
| Shadow ordered before ledger transaction | PASS |
| Canonical policy failure blocks ledger transaction | PASS |
| Shadow execution not bound to real ledger row | PASS |
| Direct ledger mutation owners | PASS — exactly `1` |
| Targeted Jest | PASS — `3` suites / `27` tests |
| Targeted ESLint | PASS |
| Application typecheck | PASS |
| Full suite | not run; reserved for production cutover/closure |

All value-mutation fixtures were mocked. Production was not accessed or
changed, and no real loyalty value was granted, consumed, or adjusted.

## 7. Verdict

`PACKAGE 4 FIRST RUNTIME FAMILY: P4-02 / A19 LOYALTY ADJUSTMENT`

`CANONICAL SHADOW INGRESS WIRED: YES`

`SERVER-DERIVED POLICY/ENTITLEMENT: YES`

`L2.5 CAN EXECUTE EXTERNALLY: NO`

`EXECUTABLE LOYALTY CUTOVER: NO`

`DIRECT BYPASS GROUPS REMAINING FOR FAMILY: 1`

`ADDITIONAL SCHEMA GATE REQUIRED: NO`

`REAL LOYALTY/VALUE SIDE EFFECTS: 0`

`PRODUCTION DEPLOYMENT/CUTOVER: NO`

`A08 PAYMENT WRITE: DISABLED`

`NEXT PACKAGE 4 FAMILY STARTED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP.
