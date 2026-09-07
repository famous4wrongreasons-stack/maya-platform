# E2 Stage 1 — R03 StaffSchedule assessment

```text
PACKAGE: R03
BLOCKERS INCLUDED: [B56]
CANONICAL OWNER: A15 canonical StaffSchedule action owner
EXISTING FOUNDATION SUFFICIENT: YES
BUSINESS DECISION REQUIRED: NO
SCHEMA REQUIRED: NO
NEW MODELS: 0
NEW FIELDS: 0
NEW ACTION CLASSES: 0
MIGRATION REQUIRED: NO
BACKFILL REQUIRED: NO
RUNTIME-ONLY: YES
DEPENDENCIES SATISFIED: YES — R02 / B41 production PASS in Wave R-A
REMEDIATION SIZE: M
READY FOR IMPLEMENTATION: YES — separate E2 implementation instruction required
READY FOR PRODUCTION: NO — assessment only
```

Scope is exactly the R03/B56 rows in [the completed master inventory](package5-remainder-inventory-final.json) and [its package table](../CYCLE-06-BLOCKING-PACKAGE-5-EXHAUSTIVE-REMAINDER-INVENTORY-COMPLETE.md). No new surface, blocker, action, or owner is introduced. R02 production acceptance is supplied by the wave coordinator for `20260907-p5-ra-d8049d47`; this assessment performs no additional production reads.

## Existing defect and sufficient approved foundation

| Layer | Exact current repository evidence | Assessment |
|---|---|---|
| Python initiator | `ai администратор/claude_ai.py:1856` (`manage_staff_schedule`), `:1868` (provider helper), `:4587` (prose confirmation), `:4814` (private flag supplied from history) | Staff names/global provider projection and a history-derived boolean still select the legacy write path. That flag is not canonical immutable approval. R02 removes raw-native staff authority but does not make this provider leaf an A15 execution. |
| Direct provider leaf | `ai администратор/yclients.py:419` (`change_staff_day_schedule`), `:591` (`_put(company/.../staff/schedule)`), `:594` (exception becomes `schedule_update_failed`) | `apply=True` remains executable outside the Action Engine; ambiguous dispatch is collapsed to failure. Retire this write capability, including direct/restarted callers, rather than placing only a UI/role gate above it. |
| Canonical principal | `ai администратор/canonical_staff_access.py:54` (`current`), `:74` (bounded synchronous callback), `:156` (middleware) | R02 provides current, request-bound canonical account authority with no raw-chat fallback. Native Telegram updates carry no accepted Maya session and cannot acquire this context. An absent/expired principal must remain fail closed and hand off to the existing authenticated MAYA surface. |
| Existing command/approval | `maya-saas-backend/src/ai-tools/staff-schedule-command.service.ts:146` (`tryHandle`), `:243` (canonical tool request); `ai-tool-registry.service.ts:393` (normalized immutable schedule input); `ai-tools.controller.ts:28` (execute), `:47` (approve) | Existing `staff.schedule.update` requests produce `AiApprovalRequest`; approval checks the exact payload hash, actor, tenant, status and expiry. No separate native approval store or prose-to-approval bridge is needed. |
| Canonical action/target | `maya-saas-backend/src/ai-tools/ai-tool-handler.service.ts:1738`; `package5-wave3/package5-wave3-canonical-cutover.service.ts:68`; `package5-wave3.service.ts:536` and `:572` | Existing action class **`update_external_staff_schedule_day`** resolves exact provider-qualified active Staff, branch and local day; server revalidates membership, expected provider revision and normalized slot intent. No synthetic User/Staff or global company authority is acceptable. |
| Provider execution/recovery | `maya-saas-backend/src/package5-wave3/package5-wave3.service.ts:1039` (`executeExternal`); `package5-wave3-production-gateway.service.ts:36` / `:56` (`replaceStaffDay` / `reconcileStaffDay`) | Existing durable ActionExecution/ActionAttempt and provider identity own dispatch, concurrent winner, replay and exact staff/day reconciliation. Preserve `PROVEN_SUCCEEDED`, `PROVEN_NOT_EXECUTED`, `STILL_UNKNOWN`; no blind redispatch. |

The already approved [Wave 3 runtime contract](../CYCLE-06-BLOCKING-PACKAGE-5-WAVE-3-A15-A17-A18-RUNTIME-CONTRACT-GATE.md) fixes A15 as AC2 with tenant + provider-qualified Staff + branch + local day + expected revision + normalized slot hash. Its [completion report](../CYCLE-06-BLOCKING-PACKAGE-5-WAVE-3-A15-A17-A18-COMPLETION-REPORT.md) records production convergence and the three reconciliation outcomes. Existing `AiApprovalRequest`, `ActionExecution`, `ActionAttempt`, `ActionExecutionIdempotencyBinding`, `ActionTargetMutation` and `StaffProviderLink` already hold the required durable facts. This is an initiator/provider-leaf integration gap, not an owner/schema gap.

## Bounded implementation plan — not executed

1. Replace the Python `manage_staff_schedule` apply path with the existing A15 command/approval entry. A request must retain current canonical authentication and exact tenant scope; a detached principal dictionary, raw chat ID, staff-name match, global company setting, or integration token alone cannot authorize it. If the legacy transport cannot carry the existing canonical authentication/approval interaction, return a fail-closed handoff to that existing authenticated entry. Do not invent native credentials or another confirmation lifecycle.
2. Retire `_schedule_confirmation_verified` as mutation authority and reject model/history `apply` or private-flag attempts. Preserve ordinary schedule reads. Canonical preview, pending approval, explicit exact approval and accepted execution remain distinct; existing reservations are never moved or deleted by this command.
3. Make Python `YClientsAPI.change_staff_day_schedule(apply=True)` unconditionally refuse before provider I/O, so old direct calls/cards/restarts cannot reopen the bypass. All supported mutations reach the existing TypeScript A15 provider executor. No second provider writer, approval mechanism, idempotency table or action class.
4. Preserve R10 receipts throughout any adapter: same approved request resumes the same execution; `UNKNOWN` remains unresolved and uses existing reconciliation. A transport failure cannot imply either confirmed success or deterministic non-execution. No new provider operation or new approval identity merely because the response was lost.

## Package-local acceptance and permanent ratchet

- Verified eligible canonical actor requests a preview for one exact Staff/branch/day and creates only the existing pending approval; provider writes before approval = 0. Canonical approval reaches one existing A15 ActionExecution and provider executor, retaining exact tenant/Staff/revision/slots and existing appointments.
- Missing, revoked, expired, detached or cross-tenant principal; unauthorized role; missing/ambiguous/unlinked Staff provider identity; wrong branch; forged raw chat/company/staff ID; stale revision; conflicting existing appointments: no accepted schedule write/provider call. History prose, `apply=True` and `_schedule_confirmation_verified=True` cannot authorize a write.
- Same immutable approval/key on repeat, concurrent requests and process restart converges to the same execution/outcome. Changed Staff/day/slots/revision under the same identity conflicts. Expired/rejected/mismatched approval is rejected; no invented native retry identity.
- Provider response loss stays `UNKNOWN`; exact reread exercises succeeded/not-executed/still-unknown recovery with no blind second PUT. Surface replies preserve the existing canonical receipt rather than claim failure or success from transport alone.
- Permanent executable Python guard extracts the actual `manage_staff_schedule` and provider helper bodies with DB/provider dependencies trapped; adversarially injected provider calls or private/history confirmation must fail the guard. Scan the known Python AI/provider files for schedule mutation sinks, including alias/delegation forms, without whole-directory or backup exemptions. Ensure the TypeScript tool still delegates only to canonical Wave 3 A15; extend the existing `action-engine/package5-wave3-bypass-ratchet.architecture.spec.ts` for this exact Python boundary.
- Reuse existing `staff-schedule-command.service.spec.ts`, `ai-tool-registry.service.spec.ts`, `ai-tool-runtime.service.spec.ts`, `ai-tool-handler.service.spec.ts`, `package5-wave3-canonical-cutover.service.spec.ts`, `action-engine/package5-wave3-executable.contract.spec.ts` and the R02 principal/R10 receipt regressions. During implementation, add only the bounded missing native/direct-leaf/authorization/replay cases; then run package/wave mandatory gates. Production proof remains structural/read-only.

`IMPLEMENTATION/TEST EXECUTION THIS ASSESSMENT: NONE`

`PRODUCTION MUTATIONS/MESSAGES: 0` / `DATABASE CONNECTIONS: 0`

`PACKAGE 5 COMPLETE: NO` / `CHAPTER 6 COMPLETE: NO`

`PROCESS HYGIENE: 0`
