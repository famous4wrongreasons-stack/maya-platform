# Admin: qualified stored integration status, 2026-10-07

The existing semantic tool selection now yields a deterministic, source-qualified answer for `support.integration-status.read`: saved connection state, calendar source, exact saved check/sync/verification dates and the existing source-owned next action. The response always states that current CRM reachability was not tested. A historical verification never overrides a saved error; missing, invalid or unknown dates/actions are not invented. Stale results suppress the suggested next step.

The tool remains the same ADMIN capability through `C9Orchestrator.conversationRead` → current runtime/policy → `CrmService.getIntegrationStatus` (local database only). The source handler, roles, feature gates, actor/tenant scope and capability registry are unchanged. Server composition adds no agent, orchestrator, provider probe, regex command, schema, retention or execution authority. C9 retains its existing metadata receipt; no artificial C7 revision is created. No CRM mutation or outbound notification is introduced.

## Local qualification

- 272 targeted tests across eight suites pass, including stored Date/JSON date handling, malformed dates, unknown status/actions, stale outcomes, semantic selection with only this tool available, native/web responses, and canonical access denial.
- Production TypeScript passes. Scoped lint passes with two existing unsafe-argument warnings at the earlier schedule-command fixture, no errors.
- Actual HTTP and PostgreSQL proof passes: owner receives the saved error and historical dates; replay reuses the source receipt; a second tenant sees its own unconfigured state; foreign run access returns 400; direct Client and revoked-feature tool requests return 403. Deliberately selecting a tool absent from model permissions yields the existing 503 model-selection failure before source dispatch. That error is not presented as a successful status answer.
- One completed source read per tenant (two total), five scripted model selections, zero external fetch calls and zero ActionExecutions. The integration row remains identical. The owned cluster stopped; no postmaster PID file remains. This Admin proof did not include browser or process/PG restart.
- Independent read-only review found no blocking issue. Source and evidence hashes are in the [manifest](evidence/maya-development-integration-20261006/admin-status/manifest.json).

The first unit run had two wrong fixture expectations: a canonical ForbiddenException is not a textual answer; the existing Lifecycle source timestamp is 08:00 UTC. Two initial HTTP runs incorrectly expected a reply/403 from an intentionally invalid scripted tool selection; its actual pre-dispatch failure is 503. Tests now separately prove that path and the actual canonical policy's 403. RED artifacts are preserved, no runtime access check was loosened.

## Adjacent completed proof and next product gap

The prepared C5 → explicit owner C9 → C7 proof on `3f6b154b` now passes real HTTP, separate backend processes and PostgreSQL restart. [Archived evidence](evidence/maya-development-integration-20261006/c5-c9-c7-explicit/archive.json) proves repeated event dedupe, no new C9 from C5 repeats, conservative partial/unavailable handling, complete resolution/expiry, task invalidation, zero C6 admissions and qualified C7 current-state observations. This does not qualify proposal precision or recovered revenue.

Next unblocked map task: bring the existing semantic Lifecycle read's qualification and human-readable response up to the explicit C9 path. Its old formatter accepts a boolean without checking `qualification`, selects the first duplicate value and prints raw rule IDs. Reusing existing `lifecycleSignal` / `lifecycleStatement` closes that gap without adding new commands, audiences, computation, contact permission or campaigns.

All source facts and model selections in these proofs are synthetic. Real-model/provider acceptance, first Client binding and C10 background authority remain separate and unapproved. C10 is not complete. `NOT_ISSUED`.
