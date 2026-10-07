# Current candidate offline prerequisite: bounded harness and a real size blocker

The actual `AiCoreModelService` serializer cannot complete the proposed 24-dialog batch under the proposed 96 KiB request cap with the probe's current role-allowed web descriptors. Its first Admin planner request is **124,386 bytes**, above **98,304**. It is refused before reservation or injected transport. Do not propose this batch as ready for paid authorization or raise the bound merely to obtain a pass.

This is a concrete result for a **role-only descriptor selection with all features assumed**, not proof that every real Admin HTTP request is this size. The next source-dependent task is to bind the cases through authenticated HTTP with their actual features, current sources and registry filtering, then measure those exact requests. No production tool filtering, prompt narrowing, MONEY exception or model limit was changed.

## Delivered

- `datasets/conversation-intelligence/current-candidate-development-20261007.json`: 24 authored development variants, eight groups, 33 user turns, including an employee case. Three variants per group: ordinary, correction/clarification, negative. Related historical corpus SHA and existing source-proof paths are recorded. These are not 24 independent families or a holdout. Fixture requirements and grading rubric are separate from user text; HTTP seed bindings are explicitly not implemented for this manifest.
- `current-candidate.mjs`: immutable manifest binding candidate commit, source/corpus/proof hashes, limits and rubric. It reuses the existing replay mechanics; expected decisions/gold assistant answers never enter its request projection. `expectedIntents:[]` is only compatibility with the existing manifest type. HTTP 200 and expected refusal are not evidence that a missing feature works.
- `current-candidate-budget.mjs`: finite **offline-only**, injected-transport gate. Limits are 24 dialogs, 64 turns, 96 attempts, 8M pessimistic input reservation, 196,608 output reservation, 2,048 output per attempt, historical USD 12 reserve, 60 minutes, 30 seconds per attempt, six-second spacing, 96 KiB input and 1 MiB response. URL/body/signal snapshot binds admission to dispatch across waits. Full ledger record is written and fsynced before dispatch, including partial-write handling. Zero-progress/disk errors halt; exclusive creation prevents counter reset or resume. Cancellation/deadline covers response-body reading; unresolved dispatch halts the batch, even if the injected transport ignores cancellation. No refund from provider usage fields. Original headers are not forwarded or journaled.
- `current-candidate-offline.mjs`: network-disabled replay/transport mechanics, with a new exclusive output directory. All 24 dialogs/33 turns complete with actual previous canned replies in history; 33 injected calls, zero HTTP/model/provider effects. It does not exercise the actual model serializer.
- `current-candidate-serializer.ts`: invokes the actual model service, current role-allowed registry descriptors, planner/final serialization and response parsers. Closed configuration uses a literal offline placeholder and never falls back to provider secrets. Global fetch goes only to the finite gate and canned response function. No AppModule/auth/domain sources, PII sanitizer or tool execution are exercised.

The serializer probe completed six Client dialogs/nine turns (18 canned planner/final calls) and stopped at the next Admin planner: **19 attempted serializations, 18 admitted injected calls**. Maximum admitted body: **87,611 bytes**; maximum attempted body: **124,386 bytes**. Remaining cases/turns are UNEXECUTED. Canned planner output is deliberately unrelated to the expected domain decision, so this is parser/size evidence, not natural-language quality.

## Evidence and remaining prerequisites

[Archive](evidence/maya-development-integration-20261006/current-candidate-offline/archive.json) binds exact sources and separate mechanics/serializer reports. **33 focused tests PASS** (19 new, 14 existing qualification/broker/replay tests); full script typecheck and scoped serializer lint PASS. The final serializer probe exits **1 / BLOCKED_BY_BODY_LIMIT**, preserved as negative evidence. Old pilot source files, permits, ledgers and limits were not changed. No PG or HTTP service was started for this work.

Independent read-only review found and rechecked the request-mutation and partial-ledger-write fixes. It also checked the early-wakeup guard, distinct attempted/admitted metrics and declaration compatibility. No remaining blocking harness defect was found; the body-size and unimplemented HTTP-bindings prerequisites remain.

Proposed provider/model stays DeepSeek / `deepseek-v4-pro`; availability and current prices are not verified. Historic 2026-10-05 prices support arithmetic only. Full UTF-8 request bytes plus 4,096 framing tokens is a pessimistic local reservation, not measured provider token usage or a qualified tokenizer ceiling. This offline implementation does not authorize a real broker call. A future broker must keep its provider key server-side, receive a fresh scoped permit and enforce the final reviewed limits. The old pilot is closed.

Still needed before requesting a paid run: actual per-case HTTP/source/feature bindings, actual serializer size reconciliation, PII/authority tests at that boundary, an independent grading procedure, current model/pricing verification, and a new bounded broker admission. Goods UI/provider rights, real OCR and background C10 are separate blockers, not enabled by this harness. No external requests, real model calls, CRM mutations, push, merge or certificate. **NOT_ISSUED**.

Reproduce from the backend with a new output directory:

```sh
node --max-old-space-size=256 --test --test-concurrency=1 scripts/conversation-qualification/current-candidate.test.mjs
node --max-old-space-size=256 scripts/conversation-qualification/current-candidate-offline.mjs /tmp/<new-mechanics-directory>
node --max-old-space-size=1536 node_modules/ts-node/dist/bin.js --project tsconfig.scripts.json --transpile-only scripts/conversation-qualification/current-candidate-serializer.ts /tmp/<new-serializer-directory>
```

The last command currently reports the size blocker and returns nonzero; that is not a successful full qualification run.
