# Client value compound HTTP / current React proof protocol

Design protocol; actual execution status is recorded in each immutable attempt manifest. Two Jest processes with an owned PostgreSQL restart; no production, real model, provider network, business mutation or outbound acceptance.

Backend fixture: maya-saas-backend/test/widgets-live/client-value-restart.probe-spec.ts.
Environment: JEST_CLIENT_VALUE_STAGE=prepare|resume, JEST_CLIENT_VALUE_RECEIPT (private mode 0600), JEST_CLIENT_VALUE_OUTPUT (public report directory). Existing guarded c9occ database only. Parent launcher controls resources and execution.

IPC: browser sends {type:'ready'}; fixture returns {type:'start',stage,backendOrigin,output,email,notBefore,firstReply,clarification,prompts}. Each browser checkpoint sends {type:'checkpoint',name,response?,notBefore?}; response is the actual chat body, kept only in IPC/private restart receipt. Fixture acknowledges {type:'continue:'+name}. Public browser reports use reduced safe fields only. No auth values, private client references, or restart receipt enter public reports.

Exact prompts:
- overview: Объясни последний опубликованный финансовый отчёт и проверь оценки давности визитов гостей
- scoped: Объясни финансовый отчёт за 2026-10-01 по филиалу «Синтетический Север» и проверь оценки давности визитов гостей
- corrected: Нет, за 2026-10-02 по филиалу «Синтетический Юг»
- accept: Да, такой ограниченный обзор без дополнительных условий

Prepare checkpoint order: initial, scoped, corrected, reload-restored.
Resume checkpoint order: restart-restored, accepted, unavailable.

initial/accepted: actual compound reply, coordination scope explicit_business_lifecycle, domains BUSINESS_INTELLIGENCE and CLIENT_LIFECYCLE, revision 1, current false. Separate analysis (BI) and recommendation (Lifecycle), different durable work receipts. Financial published facts and maximum three rule evaluations are distinct, not causal/revenue-churn claims. No widget or effect authority; noSideEffects true, executionAuthority false, canContact false. Initial lifecycle outcome PARTIAL.

scoped/corrected: exact CLIENT_VALUE_CLARIFICATION.question, no coordination/analysis/recommendation. No run or source read added. Replacement period 2026-10-02 and replacement branch are retained in server conversation context. Model receives branch as redacted reference, not raw private name.

reload-restored/restart-restored: saved clarification visible; no chat submission, model selection, C9 work or source discovery. Preserve real email login cooldown via notBefore. Only explicit accept starts a new compound run.

After accepted is asserted, fixture publishes an explicit new canonical C8 policy revision with empty dormancyRules through Package5 owner. This is separately counted fixture setup, not a chat effect. unavailable repeats overview: published BI still present; C8 outcome UNAVAILABLE, findings empty, no stale claim or contact authority.

Actual native YCLIENTS transport is finite synthetic GET-only for C7 publication; actual CrmAdapterFactory, C7 snapshot, C8 policy + compute, C9, guards and stores remain unchanged. Scripted model emits only semantic selection, parsed through actual planning validation. C7/C8 revisions are not seeded directly.

HTTP additions: tenant/role/revocation isolation; missing C7 and unconfigured C8; exact saved-version replay after process/PG restart and newer C7 publication with unchanged original refs, version and receipt identities. Runtime recorder and business-state hashes exclude explicitly declared fixture setup changes.

Limits: C7 fixes expiry at 365 days from fresh admission; C8 caps it at 365 days and legitimate evidence expiry. This fixture has no naturally short-lived dependency scenario. No fake expiry rows/clock. HELD work is not injected through a C9/store override in this proof; held/expired outcomes remain unproven by this fixture. This does not claim real-model, live-provider, deployment or C10 completion.

Final clarification of expiry limitation: the parent considered isolated expiry-column fixture changes, but stopped that exact action after inspection. C7 migration 20260908153000_chapter7_measurement_foundation/migration.sql:76 requires expiresAt = admittedAt + 31536000 seconds; :202 rejects updates to PUBLISHED rows, trigger :263. C8 migration 20260913093000_chapter8_valuation_foundation/migration.sql:142 requires admittedAt < expiresAt and t0 <= admittedAt; :299-300 rejects PUBLISHED result changes, trigger :497. No rewrite, clock substitution or constraint bypass is attempted. HTTP expired-source cases remain explicitly NOT EXECUTED.

Final replay sequence: resume publishes a newer financial snapshot and a second canonical C8 result from a separately labelled synthetic client/appointment. Actual UI restores pending clarification, then explicit acceptance reads the current two C8 results. Inside accepted checkpoint, actual HTTP replay of original request verifies HISTORICAL outcome and identical old run/version/source refs with no extra work receipts. Then canonical policy revision removes dormancy rules; UI explicit overview yields UNAVAILABLE C8. After browser exit, another original replay proves STALE with immutable saved evidence. Direct replay is HTTP-only, not represented as a browser gesture.

Existing fixture identity helper generates @widgets-live.test email; no new identity/auth seam. Browser IPC start additionally includes initialReply, pendingQuestion, correctedPrompt, initialRunId and conversationId. Browser response is reduced projection including actual request_id; initial request/version IDs remain in the private receipt only. Public reports hash those locators.

Fixture corrections: role tests provide a valid financial period before asserting 403. The second historical visit uses a distinct day and respects the internal overlap exclusion. Exact replay omits audience just as React does; revoked membership is rejected by current JWT membership validation with 401 and Active tenant membership is required.
