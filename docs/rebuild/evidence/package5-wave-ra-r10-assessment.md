# Wave R-A Stage 1 — R10 assessment

Entry checkpoint: `4a253449`. Scope is exactly R10/B50 from the accepted [final master](package5-remainder-inventory-final.json): **AI invocation/approval receipt owner over existing ActionExecution**; runtime scope is “AI timeout/error/status/resume wrapper preserves UNKNOWN and same lower execution.” No dependencies. No inventory reopening, runtime change, schema change, deployment or provider operation is part of this assessment.

```text
PACKAGE: R10
BLOCKERS INCLUDED: [B50]
CANONICAL OWNER: AI invocation/approval receipt owner over existing ActionExecution
EXISTING FOUNDATION SUFFICIENT: YES
BUSINESS DECISION REQUIRED: NO
SCHEMA REQUIRED: NO
NEW MODELS: 0
NEW FIELDS: 0
NEW ACTION CLASSES: 0
MIGRATION REQUIRED: NO
BACKFILL REQUIRED: NO
RUNTIME-ONLY: YES
DEPENDENCIES SATISFIED: YES
READY FOR IMPLEMENTATION: YES
READY FOR PRODUCTION: NO
IMPLEMENTATION THIS STAGE: NOT STARTED
LOCAL FOUNDATION PROOF: PASS
BASELINE B50 DEFECT: REPRODUCED
REMEDIATION ACCEPTANCE: NOT RUN
```

The existing approved contract fully determines outcome truth. No new decision sheet is required. The [Package 3 canonical ingress contract](../CYCLE-06-BLOCKING-PACKAGE-3-CANONICAL-INGRESS-GATE.md), “Legacy AI Convergence Rule,” makes ActionExecution/ActionAttempt the business approval/execution truth; legacy AI tables are compatibility/audit records. A compatibility timeout cannot override canonical UNKNOWN, and an old approval cannot be silently promoted into canonical authorization. The accepted B50 inventory permits reuse of existing encrypted AI result/input fields for compatibility receipts; it does not approve a second AI action lifecycle.

## Evidence and exact remaining defect

| Existing path | Evidence | Consequence |
| --- | --- | --- |
| HTTP/AI execution and approval | `maya-saas-backend/src/ai-tools/ai-tool-runtime.service.ts:182`, `:426`, `:482` | Existing tenant/actor/tool/surface/input-hash checks and tenant/key uniqueness are available; approval replay recognizes completed only. |
| Wrapper timeout | Same file `:931` | Promise.race does not cancel the domain handler. Timeout emits `ai_tool_timeout_unknown` while the handler can still complete. |
| Wrapper catch and repeated key | Same file `:640`, `:515` | Any exception writes execution and approval failed; retry reports `ai_tool_previous_execution_failed`, losing current lower execution truth. |
| Post-effect persistence/audit failure | Same file `:582`–`:663` | The catch also encloses result persistence and completion audit; an audit failure after a successful effect can overwrite completed with failed. This is an internal case of B50, not a new production path or blocker. |
| Canonical admission/continuation | `maya-saas-backend/src/action-engine/action-engine.runtime.ts:256`, `:282` | The same admitted execution is restored, observed, recovered or reconciled. No replacement business owner is needed. |
| Canonical receipt and UNKNOWN | Same file `:83`, `:208`, `:347`, `:471`, `:525` | Existing safe receipt, tenant-qualified read, error attachment, manual-required distinction and expired-claim recovery exist. |
| Loss in presentation adaptation | `maya-saas-backend/src/appointments/client-appointment-create.service.ts:339`; `appointments/appointments.service.ts:93`; `ai-tools/ai-tool-handler.service.ts:3134` | The existing creator has a receipt, but account presentation can translate UNKNOWN into an HTTP error and omit receipt in success output. R10 must bind at the canonical boundary before these transformations. |

## Schema reuse and durable correlation mechanics

This section describes the required **future runtime implementation**, not functionality proven to exist in today's wrapper.

| Purpose | Existing fields/contract | Required reuse |
| --- | --- | --- |
| Immutable invocation identity | `AiToolExecution.(tenantId,idempotencyKey)` unique; `actorUserId`, `toolName`, `surface`, `inputHash` | Retain exact tenant/principal/tool/surface/normalized-input binding. Same key with changed binding conflicts before execution. These fields are compatibility identity, not authority to mutate. |
| Approved input for presentation | `AiApprovalRequest.payloadHash`, `encryptedArguments`, tenant-qualified approval/execution relation | Retain encrypted original approved arguments and hash. Canonical policy and approval binding still decide permission; no historic approval promotion. |
| Durable receipt pointer | Existing `AiToolExecution.encryptedResult` | Store an encrypted, versioned compatibility receipt carrying exact canonical execution ID(s) and safe result/projection. No raw arguments/contact/provider data in unencrypted metadata, no replacement UNKNOWN/retry engine in this row. |
| Business truth | `ActionExecution.id/tenantId`, `state`, `normalizedInputContract/Hash/Encrypted`, `safeResultSummaryJson`, policy/approval binding, source and evidence references | Read the exact admitted execution by `(id,tenantId)` and restore/reconcile its existing normalized action. The wrapper must not infer business success/failure from transport exceptions. |
| Stable caller identity | Existing `idempotencyScope`, `requestIdempotencyKeyHash` and canonical identity fingerprint; B31 `ActionExecutionIdempotencyBinding` for Client booking only | Keep each owner's existing caller identity and immutable intent rules. Do not generalize the Client-specific B31 alias model into a new global AI idempotency owner. |
| Concurrency/recovery | Existing ActionExecution revision/lease and ActionAttempt ledger | Canonical claims and outcome reconciliation remain the only effect authority; process-local waiting is never the durable binding. |

The implementation must introduce a runtime receipt attachment boundary after canonical admission returns the exact ActionExecution and **before this invocation starts any canonical effect**. It must await durable attachment to the matching tenant-qualified compatibility invocation, with input/actor/tool checks and a compare-and-set preventing a different execution from silently replacing an existing attachment. A failed attachment cannot authorize dispatch. A shared in-process context or callback can carry that attachment through handler calls, but the context itself is not the durable receipt.

After attachment, timeout, disconnect or restart reads the same canonical ID and current result. Owner-specific resume adapters reuse the existing executor and the stored canonical normalized input; they do not rebuild a new action from current mutable business state. UNKNOWN invokes existing reconciliation or remains manual-required; it is never permission to call another provider operation or choose a new key. A confirmed outcome can be projected/replayed even if formatting, local result persistence or audit logging failed later. Existing multi-step handlers must retain all canonical receipts they own without overwriting an earlier unresolved receipt or starting a later effect past that unresolved boundary.

If a crash occurs after canonical admission but before receipt attachment, this invocation has not crossed the required dispatch boundary. Recovery must resolve the existing canonical owner/key identity and input binding first, then attach that execution. For B31 this is the existing exact Client/key alias; other capabilities retain their existing canonical identity/caller-key contract. An independently admitted caller may already have completed the same action: read its canonical outcome, never infer absence from a missing compatibility pointer. If an old row lacks enough evidence to recover an exact binding, fail closed/manual handling; do not invent a historical receipt or redispatch speculatively. No fake historical backfill and no schema migration are needed.

The proposed attachment/helper methods and compatibility representation are runtime wiring, not new models, fields, business policy or action classes. Their crash/concurrency behavior remains a mandatory implementation proof; the Stage 1 evidence does not establish it.

## Local executable assessment

Six existing suites pass **39/39 tests**: AI tool runtime 8; Action Engine runtime concurrency 4; canonical kernel 4; canonical ingress 6; Client booking idempotency kernel 10; canonical ingress architectural ratchet 7. Persistence, policy inputs and handlers are mocks/in-memory fixtures; no Prisma client, application bootstrap, provider call or database connection is created.

The [isolated local probe](package5-wave-ra-r10-local-probe.cjs) runs the actual current AiToolRuntimeService and ActionEngineRuntimeService against synthetic dependencies. Three baseline cases reproduce B50 without registering a failing regression:

1. Timeout marks the wrapper/approval failed; the non-cancelled synthetic effect completes; the same key remains a failed tombstone.
2. A genuine ActionExecutionResult with UNKNOWN survives on the thrown error but is not stored as a durable compatibility receipt; wrapper/approval become failed.
3. Successful handler and completed persistence followed by an audit exception produces completed → failed in the wrapper.

Two additional actual-engine checks pass: UNKNOWN/manual-required returns the same execution receipt on repeat with zero dispatch; UNKNOWN reconciled as applied restores and replays the same execution with one reconciliation and zero dispatch. The probe blocks network/process launch and records zero attempted prohibited I/O. Its counters are synthetic, not production effects.

Detailed results and source hashes: [proof JSON](package5-wave-ra-r10-proof.json). Limitations: no PostgreSQL locking/transaction proof, no real process crash, no completed R10 receipt-attachment implementation, no wave integration proof and no production acceptance.

## Implementation and permanent ratchet boundary

Expected implementation files are the AI runtime/handler/module and exact canonical runtime receipt-attachment/resume methods, plus owner-specific receipt adapters where presentation currently discards them. The existing Action Engine kernel remains the sole execution writer. Existing capability normalization, B31 identity, Package 4 value owners and provider policies must retain their contracts. Other packages' Python/proxy identity paths and B36 WIP are outside this package.

The permanent R10 guard must reject the violation class, not merely look for a renamed status literal:

- A write tool cannot enter a timeout/exception catch that treats unresolved canonical outcome as definitive failure or returns a stale read snapshot as mutation success.
- No effect may start before its tenant/actor/input-qualified canonical receipt is durably attached. A receipt-save failure, altered receipt target, cross-tenant/actor lookup or changed payload must fail before this invocation's effect.
- Same-key concurrent calls, timeout/late success and real restart use the same ActionExecution; UNKNOWN remains distinct and cannot create a new attempt outside existing safe-retry/reconciliation policy.
- Approval status/result is a projection of canonical approval/outcome; approved/executing/UNKNOWN retry must not be forced through a fresh legacy approval or manufacture authorization from an old row.
- Persistence/audit failure after canonical success cannot erase that success. Canonical FAILED/NOT_EXECUTED still project their proven terminal outcome accurately.
- The compatibility layer cannot create ActionExecution directly, mutate a domain/provider, use raw legacy identity as authority, or own a separate retry/reconciliation lifecycle.
- Multi-effect receipt order, historical unbound rows, retained/missing normalized payload and non-approved read-only fallback behavior receive explicit regression coverage.

The future ratchet belongs in an ordinary mandatory backend architectural suite, accompanied by behavioral timeout/concurrency/restart/receipt tests. It is specified here but not falsely reported as installed during an assessment-only stage.

```text
PRODUCTION MUTATIONS/MESSAGES: 0
DATABASE CONNECTIONS: 0
RUNTIME/SCHEMA/MIGRATION/DEPLOYMENT CHANGES: 0
OWNED BACKGROUND PROCESSES LEFT: 0
B36 SCHEMA: APPLIED — PRESERVED
B36 RUNTIME: NOT DEPLOYED — PRESERVED
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
```
