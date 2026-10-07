# Current candidate: bounded real-model qualification plan

Status: **PLAN ONLY / NOT AUTHORIZED / NOT EXECUTED**. One future candidate, one immutable corpus/fixture/rubric manifest, one budget ledger. The old paid pilot is closed; its permit, counters, fixtures and TTL are not reused. This plan does not establish that the owner's app, YCLIENTS integration, OCR or current model work in real use.

## Reusable evidence and actual gaps

The existing [qualification folder](../../maya-saas-backend/scripts/conversation-qualification/README.md) provides useful infrastructure. `budget-gate.mjs` reserves and fsyncs before every upstream attempt, includes retries, uses concurrency one, does not refund unknown usage, and fails closed on unsafe restart. `replay.mjs` feeds only user turns and actual previous responses into the authenticated chat route. It is explicitly `pilot_calibration_not_qualification`; its `not_evaluated` outcome is not a language grader. `http-live-pilot.ts` pins the old database/port and six Client cases. Enabling it again is not a new candidate run.

The saved 86-intent taxonomy predates `booking.prepare_personal`, `schedule.review_cancellation_windows` and `inventory.goods`. The 96 development variants cover 16 families and no employee role. The frozen six-case Client catalog follow-up derives from four known families: retain it as regression evidence, not an independent holdout. Existing scripted HTTP proofs validate source/authority/persistence paths but do not qualify model selection or natural language quality.

Before any new authorization, assemble a candidate manifest with exact Git SHA, runtime/registry hashes, all user turns, fixture facts, expected decisions, independent rubric and corpus provenance. Do not silently overwrite old datasets or count derived cases as new independent families. If this batch is used to tune the runtime, it becomes development evidence and a new holdout is needed.

## Proposed 24-dialog scope

Each group has three dialogs: ordinary use, clarification/correction, and a negative/source-boundary case. At most 64 user turns in total; exact turns must be frozen before approval.

| Group | Current route and required assertions |
|---|---|
| Client booking | Catalog binding, staff/service correction, current availability and canonical booking preview; real CRM writes blocked |
| Personal Client | Verified linkage, own bookings, already linked with no upcoming booking; no phone/name-derived identity |
| Admin consultation | Public salon/staff/address/hours and integration status; absent facts stay absent |
| Staff/configuration | Own schedule and existing price/schedule preview paths, using the integrated owners' final revisions |
| BI | Published C7 result, explicit period, incomplete data and unsupported numeric claim refusal |
| Lifecycle | Published C8 result, rule explanation, stale/revoked source handling |
| Occupancy | Explicit cancellation-window request through existing C9/current opportunity and CRM availability; expired/occupied states, no outbound notification or background initiation |
| Goods READ | Exact item, separate sale/cost/unit meanings and fractional quantities; missing/foreign source refused |

Each fixture pins actor role, tenant/branch, Client linkage if applicable, features, integration/source revision, allowed outcome and forbidden claims. Expected labels and gold text never enter model input. Zero-model deterministic paths remain product regression cases and contribute zero to real-model coverage.

**Excluded and reported BLOCKED/NOT_TESTED:** goods UI money COMMIT until its exact contract decision, real receipt admission until provider scope semantics are qualified, real OCR, provider writes, never-linked Client bootstrap, broad external staff/service management and background C10. An expected refusal proves the boundary, not the missing function. Goods catalog create/update and stock receipt are different operations.

## Proposed maximums, subject to a fresh explicit decision

| Limit | Proposed hard ceiling |
|---|---|
| Dialogs / user turns | 24 / 64 |
| Upstream attempts, including every retry | 96 |
| Aggregate pessimistic input reservation | 8,000,000 tokens |
| Output per request / aggregate | 2,048 / 196,608 tokens |
| Total ledger reserve | USD 12 |
| Concurrency / minimum interval | 1 / 6 seconds |
| Request timeout / whole batch | 30 seconds / 60 minutes |
| Serialized request body | 96 KiB |

All ceilings apply simultaneously. Exceeding any ceiling stops the batch; remaining cases are UNEXECUTED, not PASS. One user turn can invoke up to three tool steps and two attempts per model stage, so turn count is not upstream request count. The old gate does **not** implement the new aggregate token ceilings: implementing and offline-testing that enforcement is a prerequisite, not a completed item.

Candidate model identity must be frozen with the final runnable manifest. The current local pilot configuration names `deepseek-v4-pro`; that is a candidate identifier, not new paid authorization or proof of present provider availability. The repository's historical 2026-10-05 rates are USD 1.32/M input and 3.96/M output. At those historical rates the proposed token ceilings reserve USD 11.33856768. This is a calculation from saved configuration, not current price verification or an account-debit claim. Verify official current pricing and freeze its source/hash before proposing the final paid scope; if it exceeds USD 12, reduce scope or seek a changed ceiling, never silently raise it.

## Offline prerequisites and acceptance

1. Freeze one integrated candidate after real source/adapter paths are ready and exact blockers are recorded. Pricing/schedule remain with their owners. Run applicable types, domain and source tests serially, within the authorized local resource limits.
2. Execute each selected case with canned transport through the actual authenticated HTTP/serializer path. Verify payload size, actual-history flow, PII minimization and absence of expected answers in model input. Fixtures must match the frozen public staff/service facts.
3. Prepare a new isolated database and broker configuration; credentials stay in the broker. Independently block CRM effects, outbound notifications, payments and other network destinations even if model output requests them. No old pilot process/permit restart.
4. Prove budget exhaustion, every retry reservation, timeout/cancellation, malformed usage, process restart and no reset with offline tests. Add aggregate token accounting before dispatch. Record candidate/corpus/fixture/rubric hashes in the new ledger header.
5. Have an independent grader assess source fidelity, appropriate clarification, authority, correct state transition, coherent response, false-success claims and evidence. Report per-case outcomes and actual model-call count; HTTP 200 is not a quality pass. Any foreign-data disclosure, unauthorized effect or fabricated success fails the batch. Preserve unsuccessful cases and stop reasons.
6. Only then request one fresh bounded paid-run decision with exact candidate, model, prices, corpus, limits and isolation evidence. This document does not request or exercise that decision.

No model/API/network calls were made to prepare this plan. No existing paid ledger or permit was changed. Real-model qualification, real provider acceptance, React release certification and C10 completion remain separate claims.
