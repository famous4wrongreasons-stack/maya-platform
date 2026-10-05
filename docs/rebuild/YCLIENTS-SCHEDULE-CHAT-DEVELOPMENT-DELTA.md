# YCLIENTS schedule chat — isolated development delta

Status: **narrow implementation and synthetic end-to-end proof complete; development only, not a booking release or production promotion**.

## Isolation and source

Source SHA: `dcba8c8f4d230de31fb93f3d613f7524c3310df9`.
Stable checkout `/Users/stanislavmosin/Documents/Codex/2026-10-05/task-3/maya-platform` remains clean at that SHA.
Development clone `/Users/stanislavmosin/Documents/Codex/2026-10-05/task-10/maya-platform-dev`, branch `development/yclients-schedule-chat`.
Initial preview/parser delta: `f22df56848768ceaf0e4da490c3b1642b0f37c76`; historical report/archive commit: `13d8ce2a38af81b59e38c90f998b7bcef57a9a12`. Subsequent bridge commit on this branch contains the completed implementation below.
Backend and React dependencies were reused through local read-only-use symlinks; no install or generate modified the source checkout.
Read AGENTS.md and canonical docs; no repository `.agents` or SKILL.md found. Canonical carrier is React over headless shell.

## Implementation

Existing single-day commands (`close_day`, `set_break`, `set_hours`) accept web/native, resolve real tenant staff and current slots, clarify missing material across contiguous turns, and preserve existing appointment conflict facts. Questions continue through the ordinary model/tool route. Owner accounts in client audience cannot invoke schedule writes.

The missing link was more than parser/catalog: canonical carrier drops legacy `action.approval`. Added exact server-owned `commit.schedule.day@1` SETTINGS_DRAFT emission with immutable approval/hash handles. Generic intent mint remains closed. Chat returns the existing resolution envelope; React renders current/proposed times and confirmation, and its existing SubmissionPort posts the sealed intent. App/native and web use the same PWA presentation carrier while runtime retains the actual tool surface.

Execution remains:
`StaffScheduleCommandService → AiToolRuntime approval → staff.schedule.update → AiToolHandler → Package5Wave3CanonicalCutoverService.updateExternalStaffScheduleDay → update_staff_schedule_day → existing provider adapter`.
No executor, action capability, schema migration, raw API, mass schedule, new absence type, or inferred staff/branch was added. StaffProviderLink, active branch, current role, entitlement, revision and immutable payload checks remain with existing owners.

The presentation adapter only calls existing approval execution. Receipt observation never approve/resume/dispatches. UNKNOWN/timeout and divergent readback remain unconfirmed; late canonical success appears on subsequent widget resolution. Observation preserves failed pre-admission executions. Carrier renders schedule-specific failure lines on clicks; typed confirmation uses the same owner. Existing restricted booking profile digest is unchanged; the new template is refused by that profile. Full admissible release scopes can use it. Architecture inventories enumerate only the exact new boundary/validator/fact-container sites, with tests.

## Evidence

All logs below are under `docs/rebuild/evidence/yclients-schedule-chat-dev/`.

- `live-final.txt`: 16/16 real HTTP/auth/PostgreSQL cases. Stateful synthetic provider only; actual carrier child process and React SSR rendering, including immediate chat response projection. Off-day, web break, native hours, multi-turn material, tenant/client denial, owner client audience, role downgrade, confirmed appointment conflict, missing provider link, sequential/concurrent idempotency, expiry, stale revision observed twice, 15-second timeout then late success without another write, divergent readback, typed web/native confirmation.
- `focused-final.txt`: 11 suites / 186 tests passed.
- `architecture.txt`: 4 suites / 102 tests passed (included in focused final where applicable).
- `typecheck-final.txt`: backend production typecheck passed.
- `shell-targeted.txt`: 142 carrier net/intents tests passed. `shell-typecheck.txt`: passed.
- `react.txt`: 93 canonical React carrier tests passed.
- `broad-final.txt`: widgets/ai-tools 144 suites, 134 passed / 10 failed; 1950 tests passed / 16 failed. Exact same 10 failing suite names and 16 failures as pre-bridge baseline in `baseline-unit-tests.txt` (142 suites, 1937 passed / 16 failed); 13 added tests, no new broad failures.
- `independent-review-final.txt`: read-only independent source review found no new blockers; its earlier findings were fixed.

No live model was called. The model fixture rejects unexpected model invocation. This proves bounded runtime mechanics and the named free-language/scripted cases, **not real-model 99% language understanding**. No production CRM, real notification, secret/key access, deployment, push or merge.

## Remaining promotion limitations

Full repository acceptance is not green at the source baseline. Existing backend failures include stale C9/schema/denial inventories, encryption import/hash inventories, and legacy store expectations. The unchanged release-profile contract test also fails on the pre-existing business.rules.read registry discrepancy (`baseline-profile.txt`). The live test typecheck fails on unchanged `public-booking.live-spec.ts:153`, identically in baseline and branch (`baseline-live-typecheck.txt`, `live-typecheck.txt`). Production source typecheck is green.

Full shell run was interrupted after named failures and lingering suites; no full-suite pass claimed (`shell-final.txt`). Its self-test fixture shape mismatches and session-revocation test's missing `/api/ai/conversation` expectation reproduce on the isolated baseline (`baseline-shell-selftest.txt`, `baseline-shell-dom.txt`). Focused changed shell tests and React tests pass. A real browser/device visual pass and live YCLIENTS/model qualification were not performed.

Promotion must preserve the restricted booking profile, carry backend + headless carrier changes together, resolve or explicitly disposition source-baseline release failures, and rebuild the React payload. This task does not authorize promotion or production qualification.

## Local environment record

Original unprivileged initdb failed `shmget: Operation not permitted`. Parent explicitly authorized normal escalation of the same local test command; initdb, proof-only pg_ctl/createdb and migrate deploy then succeeded. Database: `maya_widget_gate_proof_schedule_chat`, loopback `127.0.0.1:55627`; 105 migrations applied. Environment harness scrubs credentials and uses synthetic literals. No IPC workaround or OS/security changes.
A later `ps` inspection was denied by the sandbox; that exact action stopped and was not retried or bypassed. Evidence was read through test sessions/logs instead.

Historical `bridge-wip.patch` and older logs remain an archive of the earlier incomplete attempt; they are superseded by current source and the final logs above.

## Reproduction

Build the existing React test harness first (`cd maya-carrier-react && node test/build-harness.mjs`). Against an initialized isolated database accepted by the existing proof guard, run from backend:

```sh
DATABASE_URL=postgresql://LOCAL_USER@127.0.0.1:55627/maya_widget_gate_proof_schedule_chat DOTENV_CONFIG_PATH=/dev/null node node_modules/jest/bin/jest.js --config test/jest-widgets-live.json --runInBand --runTestsByPath test/widgets-live/schedule-chat.live-spec.ts
```

Use normal environment permission approval if loopback/PostgreSQL is sandbox-blocked. Do not point this suite at another or production database.
