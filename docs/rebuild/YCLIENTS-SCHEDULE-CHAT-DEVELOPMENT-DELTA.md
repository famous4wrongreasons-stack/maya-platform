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


## Continuation attempt: actual environment denial and independent review

On the explicitly authorized continuation, a minimal exact A15 SETTINGS_DRAFT
bridge was implemented as WIP: a closed `commit.schedule.day@1` recipe, server
approval ID/payload-hash handles, real runtime.approve delegation, noun owner
read, and AiCore→widget minter connection. No second AE or UI raw invocation.
Build typecheck passed; seven new exact-template tests passed.

**Actual permission denial:** starting a new isolated proof PostgreSQL cluster
using `initdb -D /tmp/maya-schedule-chat-pg -A trust --no-locale` failed with
`FATAL: could not create shared memory segment: Operation not permitted`,
`shmget(key=164255987, size=56, 03600)`. `initdb` removed its new directory. No
server started. Per explicit instruction, no escalation, alternate shared-memory
mode, external database, or other workaround was attempted. Actual-carrier →
confirmation → synthetic-provider E2E is therefore not executed.

Independent static review (subagent `schedule_bridge_review`) found:

- P1: adding schedule to the global registry digest without a matching restricted
  profile update breaks existing `closed-input.no-handoff@1` widget admission.
  Its exact profile also forbids HANDOFF, while SETTINGS_DRAFT requires an editor
  handoff. This is a restricted-profile conflict, not a universal prohibition:
  full release infrastructure exists. Preserve the restricted booking profile;
  use a properly evidenced admissible development scope for this bridge.
- P1: UNKNOWN needs durable approval/AE linkage and later reconciliation into
  the same carrier card. A consumed token and pending-only noun resolution are
  insufficient. Carrier does not render owner_decision directly.
- P2: blanket catch around runtime.approve must not label uncertain post-dispatch
  infrastructure faults as authority denial.
- P2: add schedule-specific terminal presentation; current terminal persistence
  targets BOOKING_CONFIRMATION, not SETTINGS_DRAFT. Do not reuse booking wording.
- Preview field mismatch (`slots` vs actual `proposed_slots`) was found and fixed
  in the saved WIP before review concluded.

No general contract/product prohibition of this bridge was found. The immediate
execution blocker is the environment permission denial; implementation also has
these unresolved review findings and is **not promoteable**.

To keep the active development tree free of this incomplete bridge, its entire
source/test diff is preserved in `evidence/yclients-schedule-chat-dev/bridge-wip.patch`
and in a local Git stash named `WIP schedule canonical bridge before PostgreSQL
permission denial`. It is not applied. Do not promote or apply without completing
review corrections and E2E.

Affected unit run during WIP: 142 suites, 13 failing / 129 passing, 20 failing /
1933 passing tests. Isolated f22df568 baseline run: 142 suites, 10 failing / 132
passing, 16 failing / 1937 passing tests. Thus there are pre-existing failures,
plus WIP regressions; neither run is a green acceptance gate. Full logs are
retained. Source stable checkout was not changed or used as a test workspace.
