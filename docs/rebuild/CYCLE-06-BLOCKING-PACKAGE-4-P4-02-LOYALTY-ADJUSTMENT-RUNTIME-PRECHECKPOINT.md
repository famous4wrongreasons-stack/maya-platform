# CYCLE 06 BLOCKING PACKAGE 4 — P4-02 LOYALTY ADJUSTMENT RUNTIME PRE-CHECKPOINT

Status: ready for shadow-only implementation
Source checkpoint: `16bbc700`
Review date: 2026-08-29

## First Runtime Family

1. **Action family:** `P4-02 / A19 — Nest internal loyalty balance adjustment`.
   A08 precedes it in the Gate but is physically disabled and is not a runtime
   migration candidate.
2. **Action classes:** one exact class, `adjust_internal_loyalty`, exposed as
   admin HTTP adjustment and the approved `loyalty.internal.adjust` AI tool.
   A20-L legacy earn/redeem/refund/expiry remains a later family.
3. **Current production owners:**
   `AdminLoyaltyController -> LoyaltyService.adjustInternalBalance` and
   `AiToolRuntime/AiToolHandler -> LoyaltyService.adjustInternalBalance`.
   The controller and AI runtime are initiators; `LoyaltyService` is the single
   domain execution owner.
4. **Current direct bypasses:** two production-reachable initiator paths feed
   one direct Action Engine bypass group. The service performs the serializable
   ledger transaction without Canonical Action Ingress.
5. **Durable binding already ready:** nullable
   `LoyaltyTransaction.actionExecutionId`, tenant-qualified composite FK to
   `ActionExecution`, immutable established-binding trigger, and non-unique
   lookup index for the intentional execution-to-ledger-row 1:N relation.
   Historical rows remain nullable.
6. **Idempotency:** the domain claim is unique
   `(tenantId, idempotencyKey)`. The canonical request must reuse the same
   UUID as caller idempotency under a server-selected loyalty scope and bind it
   to the normalized target, actor policy context, delta, and reason hash.
7. **Possible `UNKNOWN`:** there is no provider dispatch. Ambiguity exists only
   if the serializable database transaction commits but the process loses the
   acknowledgement before Action Engine finalization.
8. **Reconciliation:** read `LoyaltyTransaction` by tenant and domain
   idempotency key, verify target account, actor, delta, encrypted reason, and
   the immutable execution binding. A matching row proves success; a
   contradictory row is a definitive conflict; an absent row after the local
   transaction boundary proves non-execution before any retry.
9. **Approval/risk policy:** customer value mutation is high risk. The current
   AI path requires owner approval while direct HTTP relies only on manager
   roles. A later executable cutover must use server-derived loyalty
   entitlement and exact Package 3 approval binding; an upstream AI approval or
   client flag is not Action Engine authority.
10. **Shadow before cutover:** YES. This step may register and wire only a
    `SHADOW_ONLY` / `L2_5_SHADOW` capability. It must persist the canonical
    server-derived decision with `executorKey = shadow.none`, grant no external
    execution permission, and leave the existing domain mutation explicitly
    outside the shadow execution until a separately proven executable cutover.

## Step Boundary

The current Package 4 schema is sufficient; no additional schema Gate is
required for this family. The authorized implementation boundary is:

- Canonical Action Ingress shadow projection before the current domain owner;
- strict normalization that rejects authority-like or unexpected input;
- server-derived tenant, actor, entitlement, policy, and target;
- no `LoyaltyTransaction` binding to a `NOT_EXECUTED` shadow execution;
- no production deployment or cutover;
- no real loyalty mutation in proof fixtures.

`FIRST PACKAGE 4 RUNTIME FAMILY: P4-02 / A19 NEST INTERNAL LOYALTY ADJUSTMENT`

`CURRENT DIRECT BYPASS GROUPS FOR FAMILY: 1`

`ADDITIONAL SCHEMA GATE REQUIRED: NO`

`SHADOW REQUIRED BEFORE CUTOVER: YES`

`PRODUCTION CUTOVER AUTHORIZED: NO`

STOP PRE-CHECKPOINT; proceed only with the bounded shadow implementation.
