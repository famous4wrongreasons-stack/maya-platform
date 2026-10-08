# Independent checkpoint review — 2026-10-08

Candidate: `da9db9e27fc891d566d2361fa7f5a15ac0f9cb34`. Qualified PASS for this finite development slice; no live-provider, real-model, real-A18 or overall MAYA/C10 acceptance.

## Review boundaries

- `checkpoint_review` authored the AE delta; its review is independent for root-owned CRM/widget/fixture changes and final artifacts, not for its own AE implementation. It found proof gaps subsequently covered by native restart, foreign-tenant and revoked status checks.
- `receipt_read_shell` authored shell transport/browser changes; it independently reviewed root-owned backend changes and the other agent's AE implementation. The catalogue-await authority race, source revalidation, status read after original start time, expired lease and null DTO findings were fixed before final gates. Final AE code review confirms current tenant/Client/original action checks, one bounded reconciliation, no ingress/executor, no READY dispatch and preserved lease/manual budgets. Its final native ID review found no blocker.
- Root inspected the final current React screenshots and the failing native mirror evidence, implemented the fixes and ran the final gates. This is not an independent review of root-authored code.

## Artifact review

`checkpoint_review` independently compared 1,663 restart and 1,730 browser source-hash entries with committed Git blobs at the candidate. All matched, including each aggregate source hash. All 16 source hashes in local attempt 5 also matched the candidate. Local report: 215 tests / 10 suites, zero skips. Final browser report: 1 test / 34 checkpoints. Restart prepare/resume: one passing test each, zero skips.

The restart uses backend PIDs 40058 then 40140 and PostgreSQL start times `2026-10-08T06:00:02.483Z` then `2026-10-08T06:00:08.642Z`, with an observed stop/start log. Native reschedule retains original evidence/action/receipt: UNKNOWN then SUCCEEDED, one setup create POST and one reschedule PUT. The mirror is asserted at the new time. Foreign tenant before positive readback and revoked Client after completion add no provider reads; completed rereads add none. Revocation before successful readback is covered by unit boundaries, not this HTTP negative case.

The final browser verifies 14:30→15:00, UNKNOWN then one canonical CONFIRMED result, repeated status and reload without another COMMIT, stale refusal without dispatch. Historical UNKNOWN wording remains above CONFIRMED before reload; reload restores one confirmed line. All owned process groups closed/disappeared; both clusters stopped; source/harness hashes stayed unchanged.

Root subsequently captured the exact final-candidate shell checks in `shell/`: 186 tests, 6 guard tests and typecheck PASS. Earlier agent-run shell tests existed only in tool transcripts and are not substituted for these archived logs.

## Qualification of retained evidence

Only finite synthetic native YCLIENTS transport and scripted planner decisions were used; A18 Client verification is synthetic. The native reschedule schedule source is explicitly fixture-emitted; this does not establish a model-generated reschedule conversation. READY pre-claim seams are test failures after canonical authorization, not production crash equivalence.

The inherited `historyErasure` field in restart `resume.json` describes that older selector fixture's absent erasure path; it is not an assessment of the current privacy owner. The later canonical privacy checkpoints remain authoritative for erasure. This slice makes no new erasure or RT8 claim.

Failed attempts remain under `excluded/`. In particular restart attempt 3 exposed a real native domain-ID/mirror mismatch and stays failed. Its production fix and regression tests precede final passing gates. Browser attempt 5 passed an earlier candidate but is excluded from final-candidate acceptance. Archived launchers retain their original isolated local paths and hashes; moving them elsewhere requires explicit path adaptation, not a claim of byte-identical harness execution.

Archive formatting exception: the byte-preserved `launchers/local-gates.mjs` contains one trailing space and `launchers/owned-stage.mjs` one blank line at EOF. The all-file staged whitespace check reports exactly those two inherited harness lines; they are retained to preserve executed harness hashes. Authored checkpoint/map prose passes its scoped whitespace check.
