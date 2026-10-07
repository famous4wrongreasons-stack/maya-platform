# Current candidate: authenticated HTTP and bounded serializer checkpoint

**Useful result:** the unchanged development corpus now has actual authenticated HTTP bindings for all 24 dialogs / 8 groups / 33 user turns. The full current request body fits the unchanged **98,304-byte cap** without removing tools or intent rows. This is a qualified offline mechanics candidate, **not language-quality, real-model, YCLIENTS or C10 acceptance**. It continues the [binding research checkpoint](MAYA-CURRENT-CANDIDATE-HTTP-BINDINGS-CHECKPOINT-20261007.md) from committed base `1f1d4ea32ea97610760487a8abc2a397cd790819`.

The final report and source hashes are in [the evidence archive](evidence/maya-development-integration-20261006/current-candidate-http/archive.json). Runs execute the base commit plus the recorded source overlay; the base hash alone does not identify the tested code. The frozen corpus and its historical `NOT_IMPLEMENTED_FOR_THIS_MANIFEST` fixture requirements were not rewritten: a separately hashed HTTP binding overlay records the implemented fixtures. These are authored development cases, with zero independent holdout families.

## What runs through the application

Each case has its own synthetic tenant, user, real JWT login/membership, current feature grants, actor scope and finite source fixtures. Chat calls go through the actual auth/guards, `AiCoreService`, current runtime/policy tool filtering, PII handling and `AiCoreModelService` provider serializer. Call-through evidence records effective features, actual tools, tenant/actor policy scope, section sizes and full-body hashes. Only model transport is canned. Its fixed clarification does not select a case-specific intent or consume expected answers. CRM reads are finite synthetic adapter methods; unexpected adapter methods, external fetch and Action Engine execution are rejecting edges.

Independent HTTP preflights exercise catalog and availability, verified Client appointment ownership, own staff schedule, company hours, service-price approval preparation, C7 measurement revisions, C8 policy/result revisions, Opportunity/current availability and goods reads. Price preparation creates the existing approval artifact; it never executes the approval. C7/C8 references come from their canonical owners. Live CRM availability is not represented as a fabricated measurement revision.

The authored clock remains `2026-11-10T09:00:00Z` in the frozen corpus. Fixtures explicitly bind relative dates to the actual application/PostgreSQL clock in Europe/Moscow. The authored absolute October period remains October and is still open on the actual run date. It is not silently shifted or reported as a complete month.

## Why the request now fits

Actual authenticated Admin serialization first measured **120,791 bytes**, above the cap. The earlier role-only serializer measurement was not used as the actual HTTP result. The failed admission and every remaining `UNEXECUTED` turn are preserved in attempt 06.

The planner now interns identical complete tool input schemas, represents homogeneous tool descriptors and all **89** canonical intent rows as tables with explicit columns, and sends the previous plan once under the existing `semantic_plan` field. Every field, permission, readiness value, language hint, alias and policy remains represented. Tests restore the wire representation and compare it exactly with the original objects for all eight groups. Heterogeneous tools retain ordinary objects; an unexpected heterogeneous intent shape fails explicitly.

The Director prompt is partitioned by stage. Planning retains the core constraints and role, routing, period selection, compound selection, source selection, C7, expense and C8 instructions. Response tone, report structure and interpretation instructions stay in final response generation. The full final persona remains byte-for-byte identical; four existing persona/surface hashes are asserted. There is no second planner, intent-only bypass or changed authorization. Lossless field encoding and exact final prompt bytes do **not** prove equivalent real-model behavior.

A source preflight also exposed an unrelated presentation failure: a completed staff catalog without an inherited service, or an empty availability result, could become HTTP 500 when no valid selector could be minted. The completed-READ adapter now handles only the exact `booking_selector_source_unavailable` refusal and returns the canonical facts without a widget. Other errors and the shared selector's DRAFT/REFINE refusal remain intact. This does not authorize a booking.

## Executed evidence

Final attempt **10** completed all **24 dialogs / 33 turns**, with **29 canned planner transports**, 32 HTTP 201 responses and one expected revoked-session HTTP 401. No turn is UNEXECUTED. All **54** source-read / approval-preparation preflights matched their specified result, including the disclosed negative 500 below. The actual policy observations stay in the correct tenant and actor; no post-fixture Action Engine execution was added. Full request maximum is **93,222 bytes**, leaving **5,082 bytes** under the unchanged cap. The maximum local conservative input bound is **97,318**. Serialized request hashes and section sizes are retained without raw request bodies or credentials.

| Group | Maximum full serialized request bytes |
| --- | ---: |
| Booking | 67,851 |
| Personal Client | 67,911 |
| Admin | 77,959 |
| Staff / configuration | 79,774 |
| BI | 85,200 |
| Lifecycle | 86,240 |
| Occupancy | 93,222 |
| Goods | 74,305 |

The two actual explicit C9 first turns return `AVAILABLE`, `PROPOSED`, current revision **1**, two evidence references and two options. Their run, revision and work-receipt hashes are recorded. Each uses deterministic reasoning with zero model calls, `noSideEffects: true` and `executionAuthority: false`. Current reads and persistence use the existing C9/Opportunity owners. This records two separate first proposals; it does not claim a revision-2 correction, replay or restart test in this particular corpus run.

The final ledger reserves **2,344,092** input tokens and **34,800** output tokens (29 actual planner limits of 1,200), equivalent to **$3.23200944** under its conservative rates. That is offline bookkeeping, not provider usage or spend. Paid calls, external fetch and provider writes are all **0**. The runner records the owned PostgreSQL cluster stopped; its PID file is absent.

Focused checks pass: **103 tests / 6 Jest suites**, **33 Node mechanics/budget/broker-contract tests**, production and complete widgets-live TypeScript checks, scoped ESLint and `git diff --check`. The final HTTP probe is one Jest test containing the corpus and 54 preflights. Its prerequisite HAR-13 diagnostic placement filter runs two tests; the other 143 harness tests are visibly skipped and are not claimed as coverage. No aggregate heavy gate was run.

Negative evidence remains immutable. Attempt **06** stopped before dispatch of the 120,791-byte Admin body, leaving **23 UNEXECUTED** turns. Attempt **08** stopped on an early real-timer wake (`candidate_spacing_not_elapsed`) after two transports, leaving **30 UNEXECUTED** turns. A 25 ms wait margin fixes that timer edge while retaining the absolute 6-second admission check and the test that refuses injected early wakeups. Historical 06/08 outer manifests say `passed` because their diagnostics wrote reports successfully; their HTTP reports explicitly say `STOPPED_REMAINING_UNEXECUTED`, which is the corpus result. The final launcher rejects such a stopped report, records its corpus status, and stops owned services in `finally`. Attempts 07 and 09 completed mechanics but lacked the corrected top-level C9 evidence capture; attempt 10 supersedes them for this checkpoint.

## Qualification limits

- Canned responses exercise admission, serialization and current HTTP authority. They do not qualify natural-language selection, model-selected domain reads, final synthesis or helpfulness. Provider serializer unit tests cover later planning with synthetic source projections separately.
- Two explicit first turns use the existing deterministic C9 Occupancy path and save a proposal/version with evidence. The second correction turn has a locally occupied fixture, but uses canned planning; it does not prove a natural-language occupied-window recheck.
- The revoked lifecycle session is refused before model/source calls. The first Admin correction turn is blocked by the existing grounding/access-or-missing-source precheck; it is not successful language coverage.
- Public availability has no tested membership-branch denial contract. Its outside-membership-branch preflight is an observation only. The separate service-price preparation branch denial does not qualify public schedule branch denial.
- Goods-source unavailability currently returns HTTP 500. The fixture proves failure without substitution/effect, not acceptable error UX.
- No real provider/model/OCR, paid call, outbound notification, background initiator, new schema/retention, production/website change, phone, push or merge is part of this checkpoint. Provider permission-scope semantics remain open in the [YCLIENTS receipt checkpoint](MAYA-YCLIENTS-RECEIPT-ADAPTER-CHECKPOINT-20261007.md).

## Fresh pricing proposal, not authorization

[Official DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/) was checked on 2026-10-07: `deepseek-v4-pro`, documented version `DeepSeek-V4-Pro-0813`, text only, peak cache-miss input **$1.32/M** and output **$3.96/M**. No cache/off-peak discount is assumed. No authenticated account/model-list or broker availability was checked.

The [machine-readable proposal](evidence/maya-development-integration-20261006/current-candidate-http/pricing-proposal.json) retains 24 dialogs, at most 64 turns / 96 attempts, 8,000,000 reserved input tokens, 196,608 output tokens, 2,048 output tokens per attempt, concurrency 1, at least 6 seconds between attempts, 30-second timeout, 1-hour batch, 98,304-byte requests and 1,048,576-byte responses. At both token ceilings the exact peak cost is **$11.33856768**, within the **$12** monetary ceiling. All limits apply jointly; reaching one can stop the batch before completion.

The local input reservation is full serialized UTF-8 bytes plus 4,096, a conservative bound rather than tokenizer/provider-measured tokens. Historical ledgers keep their original pricing labels; the fresh public-price record does not retroactively authorize them. Paid calls remain **0**, the broker is **not rearmed**, and this proposal is not an executable permit.
