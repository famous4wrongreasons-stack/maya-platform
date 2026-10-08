# Independent static review: BI + Lifecycle

Qualified PASS for this finite explicit-request development slice. No blocking correctness or authority finding remains in the reviewed snapshot. This is a code/test-source review, not execution or release acceptance.

Baseline: `a34f37cde27bf1af78a91ef434bd32e7d5884e20`. Snapshot: `2026-10-08T14:38:00.988211+00:00`; 11 uncommitted source/test files. The reviewer did not edit repository files or run tests, services, HTTP, PostgreSQL, models, or providers. Read-only `git diff --check` was clean. Parent-reported green results are not independently re-executed by this review.

## Reviewed behavior

- `owner-review-plan.ts` admits only the existing BI + Occupancy pair or BI + Lifecycle, optionally their existing recommendation intent. Duplicate intents and a third domain are refused. The two clarification scopes/questions differ; restore verifies the marker against the actual exact task pair. Requested period, branch and other unresolved entities remain in the semantic context until correction/acceptance.
- AiCore delegates the entire admitted pair through the existing C9 owner route, before generic tool execution. The model service admits the same finite null-tool planning response; the final combined reply is composed from source-owned facts rather than another model turn. Current owner, surface, permissions and ready-task guards remain in place.
- `reviewBusinessAndClientReturn` uses one `c9.client_value` run and the existing two-domain/read budget. Both source authorizers run before preparation. Preparation settles the two separate work receipts before exposure; current authorizers run again afterward. Held work remains held, with no loop or alternate dispatch.
- The final transaction locks the live run and exact exposed source refs, validates them under the current principal, then repeats the source-owned C8 `lifecycleSignal` eligibility check. This catches `current=false`/`available=false` even where publication metadata still says PUBLISHED. It checks source/root expiry after the awaited snapshots. Withheld C8 findings are not revived by this check.
- The persisted proposal remains exclusively Lifecycle. Its exact C8 refs stay in the source-capped revision; validity now also caps at C8 retention. The work receipt contains the revision locator/digest and bounded metadata, not the C8 subject refs. Financial evidence remains in its separate existing receipt. The response explicitly separates observation periods and does not claim customer value, revenue causality, return probability, an audience or contact permission.
- Replay uses the exact saved revision and refs, performs current authorization/qualification, and does not discover replacements. Erased or unavailable exact evidence is not replaced by a newer version. The standalone Lifecycle entry point uses the extracted preparation/exposure path; its existing output and no-action boundaries are retained.

## Test-source and evidence qualification

Reviewed additions exercise exact scope/restore, third-domain refusal, actual planner parsing with scripted transport, currentness/revocation, source retention, held work, erased revision, replay and concurrent copies. The new in-process test traverses actual `AiCoreService.chat` into real C9/agents/strategy with scripted planning, fake timeline/current-source ports and a substituted digest seam; it asserts one turn/reply, two settlements, one proposal and no generic runtime execution. Durable maps and recreated service instances are not PostgreSQL/process-restart proof. Mock source invalidation cases do not establish real C7/C8 dependency transactions. No real-model, HTTP/current React, live YCLIENTS, autonomous C10 or production acceptance is claimed. Root owns subsequent source-bound gate results.

No new authority decision is required by these read-only changes. This review grants no mutation, outbound, background trigger, service-rename write, schema or retention-policy authority.

## Final freeze addendum

Final source/hash refresh: `2026-10-08T14:40:59.295394+00:00`. The original report is preserved byte-for-byte as `independent-review-original-snapshot.md` (SHA-256 `3d6098c7dd539faecf897559b4a0627e7ea724f630eb67275f1f62c7a73e550e`). Four files differ from that first snapshot; all 11 hashes below now describe the final freeze.

The refreshed static review confirms the runtime lint change removes only the unnecessary `plan.semanticPlan!` type assertion in `ai-core-model.service.ts`; final C9 source fencing and all other reviewed runtime files are byte-identical to the original report. The three changed test files use explicit string narrowing before parsing the mocked fetch body, safe matcher/property assertions, removal of an unnecessary cast and unused mock parameters. These changes preserve the intended assertions. The final test source also explicitly drives `Date.now()` across each root/C7/C8 expiry during the final awaited currentness call, restoring the clock in `finally`; this is synthetic clock proof, not a real-time/source transaction experiment. No new blocking finding.

Changed snapshot files:
- `maya-saas-backend/src/ai-tools/ai-core-model.service.spec.ts`
- `maya-saas-backend/src/ai-tools/ai-core-model.service.ts`
- `maya-saas-backend/src/ai-tools/ai-core.occupancy.spec.ts`
- `maya-saas-backend/src/orchestration/c9.business-lifecycle.spec.ts`

No tests/services were run by this reviewer; parent green3/green4 results remain separately owned evidence. The read-only `git diff --check` remained clean. The qualified PASS and all execution/acceptance limits above remain unchanged.

## Exact reviewed bytes

| File | SHA-256 |
| --- | --- |
| `maya-saas-backend/src/ai-tools/ai-core-model.service.spec.ts` | `f422354d51d3879a8d54bf0317896ba57df53c641da5404ce529dde7c5899fa3` |
| `maya-saas-backend/src/ai-tools/ai-core-model.service.ts` | `837b5f346a72703fe348db57d01c9901318ce370bd8b1d0d097d36b4390b1f12` |
| `maya-saas-backend/src/ai-tools/ai-core.occupancy.spec.ts` | `db75c66b4e99ec0265426f8eb1a510a51a30bd6ce3629d60d96f6cf6f931672b` |
| `maya-saas-backend/src/ai-tools/ai-core.service.ts` | `9d1a62ef5a241670f781dce9f165b8789a5e8d591bc9b26bc280b0216dce8512` |
| `maya-saas-backend/src/ai-tools/owner-review-plan.spec.ts` | `9df45839593d464e7dae09e4841add195969d5bcaabfd48ddfb509d48600f68e` |
| `maya-saas-backend/src/ai-tools/owner-review-plan.ts` | `3d726be1b4565328cedf45ec6b140c3ff4258c8d65e2c6af90a548237387804c` |
| `maya-saas-backend/src/orchestration/c9.business-lifecycle.spec.ts` | `e702fde9aa111dd8a5ed6dec68179c24eede109ad77047dde57f1b6fbf128e84` |
| `maya-saas-backend/src/orchestration/c9.lifecycle-source.spec.ts` | `a0e5b4ad9ca77d850fdb620fe56289b3f5e491afd25874584bbe57dcf84f62e0` |
| `maya-saas-backend/src/orchestration/c9.lifecycle-source.ts` | `22ec1a3034dc0615df2c0c7136ef6be302ce7ae6634d10e26b642d72556fe74b` |
| `maya-saas-backend/src/orchestration/c9.orchestrator.ts` | `03078383856a6c4254df1f059561cdb8fe8e327f28cd7f0ef2b8ebdaf0f53d2d` |
| `maya-saas-backend/src/orchestration/c9.store.ts` | `2b22a7ce2dae9d9d045ba3bb14514ff88ff0f402381649ca7482b0b679225674` |
