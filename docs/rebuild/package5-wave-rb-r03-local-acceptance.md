# Wave R-B — R03 / B56 local acceptance

`R03 LOCAL ACCEPTANCE: PASS`

Exact scope: **B56**, existing A15 StaffSchedule owner, from the approved E2 assessment at `cb4fb27c`. R02 remains the canonical account authority dependency. No new business decision, model, field, action class, migration or backfill is introduced.

The legacy Python `manage_staff_schedule` tool now returns a handoff to the existing authenticated MAYA schedule/approval flow. It performs no staff-name resolution, schedule lookup, confirmation or provider write. Model `apply` flags and history-derived `_schedule_confirmation_verified` are no longer mutation authority. Old preview/applied/error tool payloads cannot manufacture a success/failure claim in the terminal renderer.

`YClientsAPI.change_staff_day_schedule(apply=True)` unconditionally refuses before date/Staff lookup, cache changes, or provider I/O. Its direct PUT implementation is removed. Read-only legacy preview calculations remain available; split-break and existing-reservation conflict behavior is preserved. Canonical authenticated commands continue through existing `StaffScheduleCommandService` → `AiApprovalRequest` → exact `staff.schedule.update` approval → Wave 3 **`update_external_staff_schedule_day`** → Action Engine/provider executor. No raw Telegram actor, detached principal dictionary or integration token is substituted for account authority.

The existing canonical chain retains exact tenant/Staff/provider/branch/day/revision/slot identity, current policy checks, durable execution, immutable approval, retry and reconciliation. Unsupported legacy native confirmation stays closed; this package does not invent a second native confirmation or authentication system. The B36 WIP remains untouched.

| Verification | Result |
|---|---|
| Existing A15, approval, R02 and R10 backend regressions, including the permanent ratchet | **9 suites / 136 tests PASS** |
| Actual native initiator/provider/renderer ASTs with effect dependencies trapped | **6 tests PASS**, including 24 concurrent legacy calls and adversarial writer/authority injection |
| The same actual-source suite against exact production-overlay candidates | **6 tests PASS** |
| Selected existing Python schedule/RBAC regressions | **9 tests PASS** |
| Existing all-eight Wave 3 proof on new owned PostgreSQL `maya_rb_r03` | **PASS**: eight classes/shadows, zero divergence, exact A15 durable replay/rebuilt-command resume, independent duplicate initiator, one provider dispatch despite simulated lost response and reconciliation |
| Targeted lint, Python syntax, diff whitespace | **PASS** |

The PostgreSQL gateway is synthetic; no provider API is called. The existing all-eight proof rebuilds/resumes within one process; wrapper restart/concurrent idempotency and changed-payload/actor rejection are covered separately by the existing R10/approval regressions. This distinction is retained in [machine-readable proof](evidence/package5-wave-rb-r03-local-proof.json).

Permanent protection combines `package5_staff_schedule_guard.py`, executable actual-source tests, and the existing Wave 3 architectural ratchet. It rejects a resurrected native schedule PUT (including aliases), provider delegation from the native tool, private/history confirmation authority, and any lookup/effect preceding the provider helper's unconditional apply refusal. The canonical TypeScript delegation remains pinned to the existing A15 owner.

Production preparation uses two bounded overlays over the coordinator's exact R-A post-cutover source and two new pure helper/guard files. Every unrelated deployed function remains intact; hashes and changed functions are in [the overlay manifest](evidence/package5-wave-rb-r03-overlay-manifest.json). Existing files are not published wholesale from the canonical checkout. [Ownership/staging evidence](evidence/package5-wave-rb-r03-hunk-ownership.json) identifies the R03-only shared `claude_ai.py` source reconstructed from `cb4fb27c`, so R04 changes can be committed independently.

`R03 PRODUCTION DEPLOYMENT: NOT PERFORMED BY THIS PACKAGE AGENT`

`PRODUCTION MUTATIONS/MESSAGES: 0`

`OLD DATABASES ACCESSED: 0`

`PROCESS HYGIENE: 0`

`PACKAGE 5 COMPLETE: NO`

`CHAPTER 6 COMPLETE: NO`

The wave coordinator owns mandatory aggregate gates, coordinated production cutover, final structural verification and commit/push. This local report does not declare production acceptance or reopen the completed inventory.
