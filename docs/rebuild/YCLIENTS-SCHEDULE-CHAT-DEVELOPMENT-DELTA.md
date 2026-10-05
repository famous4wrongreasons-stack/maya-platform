# YCLIENTS schedule chat — isolated development delta

Status: **INCOMPLETE / NOT READY TO PROMOTE**. No deployment, push, merge, real
CRM writes, notifications, credentials or paid model calls.

## Isolation

- Source: `dcba8c8f4d230de31fb93f3d613f7524c3310df9`.
- Source checkout: `/Users/stanislavmosin/Documents/Codex/2026-10-05/task-3/maya-platform`.
- Separate clone/checkout (no source Git metadata mutations), branch
  `development/yclients-schedule-chat`:
  `/Users/stanislavmosin/Documents/Codex/2026-10-05/task-10/maya-platform-dev`.
- Source was clean at entry. No source files were edited. Local dependencies are
  a read-only-use symlink to the installed source backend node_modules; no install
  or generate was performed.
- Read AGENTS.md, docs/README.md, docs/Engineering/README.md,
  docs/AI/README.md and docs/product/native-staff-schedule-chat.md.
  No repository `.agents` directory or SKILL.md was found.

## Implemented development changes

The existing StaffScheduleCommandService now accepts web/native and passes the
actual surface into tool listing and execution. The existing catalog permits
those two surfaces with unchanged roles, booking entitlement, actor approval,
required idempotency, timeout and no-retry policy. No executor or raw API added.

A contiguous exchange of existing material-clarification prompts can supply date,
staff and time over multiple turns. It is draft text only; the tenant staff list,
current schedule, conflicts, revision and immutable approval are resolved afresh.
Finished previews, unrelated assistant replies and cancellation do not revive a
previous draft. Common exit-day wording and question-vs-command handling improved.
Client audience is now passed CLIENT authority at the schedule boundary even when
the authenticated account has owner privileges.

## Critical finding: parser/catalog was not the only missing link

The canonical carrier is `maya-carrier-react` over `maya-chat-shell`, per AGENTS.
It deliberately drops `action.approval` in `src/net/project.ts` and accepts only
`action_status`. `src/shell/conversation.ts` shows `approval_not_here` on an
approval response. `maya-chat-shell/build.mjs` forbids `/ai/approvals` routes.
Its tests explicitly enforce this contract (V2-5 / SH-06).

The existing widget `ApprovalRequestAdapter` delegates only
`communication.bulk-campaign.admit.v2` to CanonicalBulkService. The widget
intent-template registry refuses generic REQUEST_APPROVAL/COMMIT; booking has
its own exact approved templates. There is no schedule confirmation mint/owner
bridge in this source commit. Therefore opening web in the backend alone cannot
satisfy canonical app/web preview → confirmation → AE → outcome.

Do not restore a retired approval endpoint in the carrier or repurpose bulk or
booking authority. A next development delta must provide an exact schedule
widget template/mint and bounded bridge to the existing immutable approval and
Wave3 owner, then prove Gate/actor/tenant/surface/payload binding and outcome
projection. This is still the existing execution owner, not a new executor.
No architecture gate was bypassed in this patch.

## Evidence and limits

- `StaffScheduleCommandService`: 26 tests passed (web/native preview, all three
  existing operations, missing material multi-turn, role denial, no invented
  staff, questions, cancellation, appointment conflicts).
- Combined final run: 9 focused suites, 254 tests passed, including added controller→AiCore→real
  schedule service→runtime-boundary preview regressions and client audience denial.
- Backend typecheck (`tsc --noEmit --project tsconfig.build.json --incremental false`) passed.
- Existing focused coverage also includes registry/policy/runtime, canonical
  receipts (idempotency/timeout/UNKNOWN), handler Wave3 delegation, provider
  adapter readback/conflicts, Wave3 canonical cutover and ambiguous reconciliation.
- The new controller tests use an in-memory CRM and mocked runtime approval.
  They are NOT HTTP auth tests and NOT a complete conversation-to-provider write
  proof. Existing receipt/adapter coverage is separate; it must not be conflated
  with a new end-to-end schedule confirmation test.
- No live model was called. These tests establish runtime mechanics only, not
  arbitrary-language model quality or a real-model 99% result.

## Remaining acceptance gates

1. Canonical carrier schedule confirmation bridge and bounded templates.
2. App/web conversation-route regression through confirmation and actual existing
   AE owner to synthetic provider side effects, including branch identity and
   StaffProviderLink failure, tenant/role/entitlement denial, material ambiguity,
   duplicate requests, UNKNOWN, late timeout and exact readback facts.
3. Broader free-language/scripted-model cases without replacing ordinary reasoning
   with an intent-only bot; safe handling of multiple dates/staff and corrections.
4. Full backend/carrier checks before promotion; this branch is not a booking
   release candidate.

Logs: `docs/rebuild/evidence/yclients-schedule-chat-dev/`.
