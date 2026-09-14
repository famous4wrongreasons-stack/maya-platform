# R10 / B50 — canonical AI receipt implementation and local proof

Baseline: `45688886`. Scope remains the accepted R10 package, **B50 only**: AI timeout/error/status/resume wrappers preserve the same lower execution and its canonical truth. This report records package-local acceptance; coordinated wave verification, production cutover and B36 WIP exclusion belong to the wave report.

```text
PACKAGE: R10
BLOCKERS INCLUDED: [B50]
CANONICAL OWNER: AI invocation/approval compatibility receipt over existing ActionExecution
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
R10 LOCAL EXECUTABLE PROOF: PASS
R10 PERMANENT ARCHITECTURAL RATCHET: PASS
READY FOR WAVE AGGREGATE: YES
PRODUCTION DEPLOYMENT BY PACKAGE AGENT: NOT STARTED
```

## Final behavior and existing schema reuse

`AiToolExecution` remains a compatibility/audit record. The existing tenant/key unique identity, actor, tool, surface and normalized input hash reject mismatched retries. Its existing `encryptedResult` stores a versioned encrypted receipt containing the original normalized AI arguments, opaque canonical execution references, canonical identity/input hashes and a trusted request descriptor with `input: null`. The normalized/provider payload remains in the existing canonical encrypted payload and is read through `ActionEngineKernel`; a missing retained payload fails closed. No raw business/provider arguments enter unencrypted metadata.

An async context carries the receipt attachment callback through the existing handler. Canonical ingress remains responsible for policy resolution and ActionExecution creation. The callback locks the exact tenant-qualified AI row, admits the canonical execution and appends the binding in the **same PostgreSQL transaction**, and returns only after that transaction completes. A receipt persistence failure rolls back admission and starts no effect. Existing Wave 1 and Wave 3 resume paths attach their existing execution before continuing because these paths can return/resume without fresh ingress. No second AI executor, lease, provider claim, approval owner or retry engine is introduced.

An opaque admission token in that same encrypted receipt fences appends to the live invocation which committed its first binding. It is compatibility append correlation, not a canonical action claim. The original live multi-step handler can append subsequent slots only after all prior canonical actions succeed. A competing first caller or restarted invocation can only observe/resume already-bound slots; it cannot append a changed route or a new logical action after mutable state changes. This also prevents a slow concurrent caller that initially saw an empty receipt from expanding the admitted set.

READY resumes reconstruct the original request using canonical retained input and re-enter existing policy resolution; the execution ID must remain identical. Nonterminal and UNKNOWN results come from the same ActionExecution. Reconciliation, leases, manual-required policy and execution-attempt limits remain lower-owner decisions. Canonical UNKNOWN projects API `unknown` and legacy compatibility status `executing`; it never becomes a failed retry tombstone. Proven FAILED/NOT_EXECUTED project terminal failure without authorizing a new dispatch.

Timeout observes the still-running operation. Late canonical completion can finish the same receipt. Completion audit failure cannot overwrite a canonical success. The original approval row receives the compatibility projection, while existing current requester/approver/tenant/role/payload checks remain in force and do not rewrite an already-admitted physical outcome when authorization later changes.

A `settled` marker is written with the encrypted result only after the awaited handler returns and all associated canonical actions have proved success. A successful prefix or a lost presentation result does **not** imply whole invocation completion: return canonical SUCCEEDED receipts with `unknown`, `invocation_completed: false` and `continuation: manual_required`; a retry does not rerun the handler or invent the missing later slot. Historical unresolved rows without a provable receipt fail closed. Historical completed output remains readable. There is no historical receipt/fingerprint backfill.

## Executable acceptance

The [machine-readable evidence](package5-wave-ra-r10-implementation-proof.json) contains exact commands, working directories, raw result hashes, tested source hashes, phase PIDs and canonical execution references.

- **11 suites / 143 tests PASS**: the actual wrapper/receipt/Action Engine boundary, existing AI authorization and money regression suites, canonical ingress/kernel/concurrency and B31 idempotency foundations, plus the permanent R10 ratchet.
- **23 hermetic acceptance/ratchet cases PASS**, with socket, TLS, fetch and child-process effects blocked, optional Jest watchman discovery disabled, and **zero blocked IO attempts**. The new [acceptance runner](package5-wave-ra-r10-local-acceptance.cjs) is separate from the historical Stage 1 probe; the latter is byte-for-byte preserved from `45688886`.
- Owned-file lint **PASS, zero warnings**. Both backend and scripts typechecks **PASS**.
- **Nine PostgreSQL phases PASS in nine separate Node processes**, using only the parent-owned fresh database `maya_ra_r10` on loopback port `55507`. All phases contain the same frozen runtime hashes and exact fixture hash.

The [PostgreSQL fixture](package5-wave-ra-r10-postgres.proof.cjs) exercises the actual Prisma transaction, canonical policy resolver, ingress, kernel, Action Engine runtime, AI wrapper, encrypted receipt and existing registered `kernel.test.safe-retry` synthetic capability. It never bootstraps application schedulers or a real provider. Synthetic effects are fixture AuditLog markers written only inside the canonical executor.

| PostgreSQL case | Proven result |
| --- | --- |
| Six concurrent same-key callers | One canonical execution, one execution attempt and one synthetic effect; eventual same completed outcome. |
| Receipt persistence rejection | Zero ActionExecution and zero effects. |
| Timeout followed by late completion | Same receipt completes; one effect. |
| Audit failure after success | Canonical completed outcome remains completed. |
| Lost presentation after canonical success | Canonical success remains visible; whole invocation stays unconfirmed; no repeated effect. |
| Process exits after READY admission | A distinct process resumes the same execution, then performs exactly one effect. |
| Process exits after successful first slot before second admission | A distinct process returns the same successful prefix with manual continuation; **zero new slots**. |
| Process exits during claimed UNKNOWN reconciliation | A distinct process follows the existing inconclusive-attempt policy to MANUAL_REQUIRED on the same execution; no redispatch. |
| Process exits after durable UNKNOWN before reconciliation | A distinct process reconciles PROVEN_SUCCEEDED on the same execution, with one EXECUTION attempt and one successful RECONCILIATION attempt. |

The separate [read-only owned-database attestation](package5-wave-ra-r10-postgres-attestation.cjs) verifies the full final fixture tenant: **9 invocation rows, 8 canonical executions, 8 synthetic effects**, including the rejected receipt case with no execution/effect. Each accepted identity has exactly one execution attempt. The four crash/resume pairs retain exact execution IDs across distinct processes. PostgreSQL itself was never restarted by R10; no prior test database was used.

Proof-only setup corrections are retained in the evidence ledger: an initial 10 ms reconciliation lease expired during finalization; a temporary inline-comment typo affected a fixture declaration; optional Jest watchman discovery attempted a blocked subprocess. Final proof uses a 1000 ms lease, a clean new fixture manifest and disabled watchman, and all final checks pass. These corrections did not alter canonical runtime semantics.

## Permanent ratchet

`ai-invocation-receipt.architecture.spec.ts` performs AST checks against the actual write method, canonical ingress and receipt transaction. It requires mutation handler invocation inside the receipt callback tied to the awaited operation, same replay key, awaited policy resolution, canonical persistence in the attachment callback, the same transaction, and awaited receipt persistence before return. Mutations of the real methods must fail for early/detached handler execution, terminal timeout/audit tombstones, fresh replay keys, detached admission, missing policy await, lost transaction, missing persistence await and early return. Behavioral tests separately prove atomic rollback, timeout/UNKNOWN truth, completed-prefix safety, same/changed input concurrency, append fencing, historical rows, missing retained payload and cross-tenant receipt rejection.

## Scope and handoff

The production changes are limited to the AI runtime/module, new receipt/context helpers, canonical ingress wiring and the two existing resume attachments. AI handlers do not become business executors. Kernel/Action Engine semantics, Prisma schema and migrations remain unchanged. No B36 implementation is included in R10; the canonical tree still carries its previously known WIP, to be excluded by the parent's coordinated deployment projection.

```text
B36 SCHEMA: APPLIED — PRESERVED
B36 RUNTIME: NOT DEPLOYED — PRESERVED
PRODUCTION READS: 0
PRODUCTION MUTATIONS/MESSAGES: 0
PROVIDER CALLS: 0
OLD DATABASES TOUCHED: 0
MAIN WORKTREE TOUCHED: NO
OWNED BACKGROUND PROCESSES LEFT: 0
PROCESS HYGIENE: 0
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
```
