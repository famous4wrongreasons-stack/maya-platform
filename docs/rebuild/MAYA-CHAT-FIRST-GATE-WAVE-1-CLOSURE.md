# Gate-programme Wave 1 closure

This closes only the six outstanding duties accepted at `df2d175c`. Gate Wave 2 is not started. Recovery's 33 commits remain preserved. Widget Contract V1.1, the gate audit and later-wave holds are unchanged.

## Evidence status

This document records the remediation and the acceptance boundary. Certification is made **after publication**, from the exact published HEAD: every mandatory local gate, actual Platform CI, and all 19 complete Widgets Mutation batteries must pass. The final owner-facing report identifies that SHA and the completed CI run IDs. The pre-publication results below never substitute for final-HEAD receipts.

## Disposition of the six gaps

| Gap | Classification and cause | Remediation / executable proof |
| --- | --- | --- |
| HTTP smoke | PRE-EXISTING STALE TEST / INVALID FIXTURE. The old request omitted required `expectedDraftRevision`, so DTO validation correctly preceded admission. B4 retired non-CRM AI onboarding. A completed CRM preview without a claim uses the existing `Trial activation claim required` response. | `scripts/http-smoke.ts` now proves invalid DTO, incomplete preview and missing claim separately, with zero new Tenant/User/Client/ActionExecution/link/confirmation receipts. The positive trial uses canonical A26 onboarding and A28 catalog commands; no CRM transport is configured. |
| Appointment PostgreSQL | PRE-EXISTING INVALID PROOF FIXTURE. An unactivated trial is not authorized for a CRM write. The old rejected-approval check also confused production's synthetic-capability fence with terminal execution state. | A synthetic full-access trial pre-state is admitted through unchanged production policy and actual appointment owners. Production rejects `kernel.test.*`; the real kernel separately proves rejected approval is terminal, with no attempt or dispatch. 20 checks, isolated provider fixture only. |
| Kernel architecture barrier | PRE-EXISTING REAL SOURCE-LAYER VIOLATION, not a reason to relax the barrier. The kernel imported a CRM-owned type; its registry imported pure bulk descriptors through the marketing module. No provider writer was imported. | Unchanged neutral channel-binding type moves to `common`; unchanged pure bulk-admission descriptors move to Action Engine. Old paths re-export for compatibility. The original `/crm/`, `/marketing/` and executor barriers remain unchanged. 26 PostgreSQL checks. |
| Platform CI | PRE-EXISTING failures confirmed at `a2f98a52`, recovered code and recovery checkpoint. Dependency findings are real current security defects. Frontend assertions include stale implementation literals and a real missing-session legacy-history fallback. Python's 64 failures/errors are stale retired-path expectations or invalid authority/module fixtures. | Minimal dependency patches; real SaaS history fail-closed guard in both versioned bundles; executable storage/entitlement/routing checks plus seven counterfactuals. Python tests follow approved C6/C8 dispositions, rather than restoring retired writers. No Python runtime is changed. |
| Mutation CI receipt | CONFIGURATION. Workflow existed only on the working branch, absent from GitHub's default-branch workflow registry; manual dispatch returned 404. | A push trigger for the exact canonical branch runs all 19 declared batteries. No repository settings/default-branch changes, no reduced matrix or altered mutant expectations. Actual receipt still required. |
| Gate 7 counterfactual | RECOVERED REVIEW COVERAGE DEBT. `T-SRC-INV30` existed but Gate 7 had no separate executable mutant. | `gate7.json` adds `M7-INV30`: a real submission `profileId` read grants a pass. `T-SRC-INV30-b` must kill it, with a green unmutated control. This is a new declaration inside the existing Gate 7 battery, not a twentieth battery. |

The HTTP sweep also exposed a narrow current defect: AI argument validation rejected canonical internal Appointment IDs (`appointment-action:<UUID>`). The registry now accepts only that exact additional syntax for cancel/reschedule. B29/B30 tenant/Client ownership, approval and executor checks still decide authority. Positive and malformed-ID tests plus the actual HTTP approval/retry lifecycle cover it.

The first published closure attempt (`d4dac79a`) correctly failed the Package 4 writer ratchet: the new guarded fixture was not registered among the exact controlled proofs. The correction retains the production owner list and every existing negative assertion, adds only this exact guarded fixture, and executes a new boundary suite against its actual guard. It denies non-test mode, non-PostgreSQL/remote/production databases, `maya_ci` outside GitHub Actions, external servers and malformed API targets before Prisma construction. The empty loyalty account is explicit synthetic pre-state, **not a claim that HTTP GET creates an account or that account bootstrap is being implemented**.

A second independently reproduced environment gap was hidden behind the old CI failures: Platform CI's HTTP step omitted AppModule's required referral/gift/loyalty boot settings. With exactly its old environment the application fails at the real referral boot validator. The HTTP step now declares the same nine public prerequisite literals already approved by Widgets Live; job-level HAR-4 literals remain unchanged, and an additional HAR-4 equality check prevents drift. No boot validator is weakened. The corrected exact CI environment passes the same HTTP smoke.

The first actual CI backend run also exposed `spawnSync rg ENOENT` in the unchanged C8 consumer ratchet. This is an explicit missing runner prerequisite, not an assertion failure or reason to exclude C8. Platform backend and mutation jobs now install `ripgrep` when absent. The existing scanner and its exact assertions are unchanged. The superseded mutation run is cancelled after these known baseline defects are established; its partial results are not final evidence.

## Python disposition and authority

The original 64 identifiers remain in recovery evidence. The full suite still contains 613 tests; no suite is excluded.

| Test group | Canonical disposition |
| --- | --- |
| RBAC, finance routing, staff advice, memory and owner history | R02 requires authenticated User → Membership → exact channel/staff principal. A new test helper enters the real request middleware and substitutes only the authenticated backend read port. Raw-ID denial tests stay negative. |
| Legacy loyalty backfill/redemption | P4-03 retired these writers. Existing scenario inputs now prove the exact retirement error, unchanged transactions and retry refusal; price/source read tests remain. |
| Owner AI scoring/retention/goals/command center | C8 D16/L01–L08 retired unqualified derived predictions; R04/A22 owns operational goals. Tests preserve source schedule/booking facts and prove unavailable/null derived values, no fabricated score, no legacy work creation or contact export. |
| Background reports, operational alerts, community/reviews and bulk | R05 owner-report trigger; R06 operational-alert trigger; B34 and R06 retired raw pushes; B35 retired raw bulk send. Tests assert exact approved owner calls or no calls, retaining the direct-send bans. |
| Telegram chat mirror | Canonical communication/history ownership forbids a raw Telegram send from creating canonical history. The negative assertion replaces the obsolete side effect. |
| Appointment bridge and payment UNKNOWN | R01 retired three client raw initiators; remaining bridge origins are still exact. Payment tests target the real bridge module and extract the exact production tombstone methods to avoid test-loader `sys.modules` pollution. |
| PHP God boundary | Read the committed sanitized canonical fixture, not an absent unversioned production secret file. Security assertions unchanged. |

Canonical sources: `CYCLE-06-BLOCKING-PACKAGE-4-P4-03-COMPLETION-REPORT.md`, `CYCLE-06-PACKAGE-5-WAVE-R-A-IMPLEMENTATION-PRODUCTION-REPORT.md`, `CYCLE-06-PACKAGE-5-WAVE-R-B-IMPLEMENTATION-PRODUCTION-REPORT.md`, `CYCLE-06-BLOCKING-PACKAGE-5-B34-DEPLOYED-FINAL-GATE-STOP-REPORT.md`, `CYCLE-06-BLOCKING-PACKAGE-5-FINAL-COMPLETION-REPORT.md`, `CYCLE-08-OWNER-DECISION-PACK.md` D16 and `CYCLE-08-FINAL-COMPLETION-REPORT.md`.

## Dependency remediation

Audit's twelve reported dependency nodes map to patched `nodemailer`, `sharp`, `fast-uri`, `multer`, `mysql2`, `qs` and `deepmerge-ts`. No force fix, Nest major change or Prisma downgrade is used. The scoped `@prisma/config` override uses `deepmerge-ts` 8.0.2 for plain config records; the affected Prisma caller does not use the changed Map merge semantics. Prisma validate/generate and clean replay remain mandatory.

Primary advisories: [deepmerge-ts](https://github.com/advisories/GHSA-ggr8-5vv4-36mx), [multer](https://github.com/advisories/GHSA-wc9g-mqfw-jrwm), [mysql2](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3), [sharp](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c), [nodemailer](https://github.com/advisories/GHSA-8m3c-c648-2xjj), [qs](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g), [fast-uri](https://github.com/advisories/GHSA-f65p-4m7j-42xc).

## Evidence boundaries

- CI workflows explicitly select Node 22; local proof runtime is Node 22.23.2. The existing Dockerfile selects Node 24. These are different declared environments, not a universal Node 22 claim. The reproduced Node 24 Jest worker SIGSEGV remains a known compatibility defect, cause unresolved; no runtime version or timeout was changed to hide it.
- Three existing later-wave declarations remain **pending**, not killed: Gate 6 M17b/M18b and P-principal P-M11. The expected final battery total is 204: 114 build-killed, 87 live-killed and three pending. Every status must be checked; these are expected counts, not results.
- Synthetic HTTP/BIN widget records do not acquire production-trigger mint provenance. L/L-T conformance is not inferred from entry tags. The gate audit remains 0/15; Wave 1 closure is not whole-programme completion.
- Contract V1.1 and Decision Sheets 04–07 are not rewritten. Later-wave open decisions/holds remain as documented by recovery.
- No schema/migration changes, deployment, production effects, messages or provider calls. Only newly owned loopback proof databases may be written. Protected main and the pre-existing databases remain outside this work.

## Required final receipts

Contract/static checks; architectural ratchets; live suites and evidence verifier; production-binary suites; 19/19 complete mutation batteries; the independent transaction-body and Gate 7 counterfactuals; Appointment/kernel PostgreSQL proofs; seeded HTTP smoke; Platform CI; Widgets Mutation CI; full backend/e2e/Python regression; lint, both application/scripts plus live typechecks, build, Prisma and clean migration replay. No earlier-HEAD result substitutes for these.

## Pre-publication checkpoint and final-head handoff

`e28bfd042cb10b5a33bfda1d2e05b743cec78845` has a complete passing local queue: backend **531 suites / 5037 tests**, live **12 suites / 245 tests**, binary **10/10**, Appointment **20/20**, kernel **26/26**, HTTP, e2e, all contract/static and historical regression gates, three typechecks, lint (0 errors, 9 unchanged warnings), build, Prisma, 98-migration clean replay and no drift. Production dependency audit reports **0** vulnerabilities. Independent TX-body and Gate 7 INV30 counterfactuals pass with their exact killers; runner self-tests pass.

Actual pre-publication [Platform CI](https://github.com/famous4wrongreasons-stack/maya-platform/actions/runs/35453092417), [Widgets Live](https://github.com/famous4wrongreasons-stack/maya-platform/actions/runs/35453092390), [Widget Contract](https://github.com/famous4wrongreasons-stack/maya-platform/actions/runs/35453092415) and [Chat Shell](https://github.com/famous4wrongreasons-stack/maya-platform/actions/runs/35453092416) pass. Python runs **613 tests** in 758.262 seconds in CI. Every step is checked, including non-blocking workflow steps. The 19-shard mutation run is not certified from partial completion.

See [bound evidence index](evidence/maya-chat-first-ux/closure-20260919/README.md). The publication commit changes documentation/evidence only. Its exact HEAD is still rerun through the full mandatory gate, including all 19 CI shards; code identity is not used to excuse that rerun. Final receipt artifacts remain attached to the corresponding GitHub Actions run and final local output is retained in the isolated closure evidence directory. No further runtime/test edit may be hidden behind these receipts.

The superseded `989a82f8` run passed full regression but failed scripts typecheck on an optional environment value in the newly added guard test. `e28bfd04` corrects the type to `Record<string, string | undefined>`; it does not cast away the error or change the test. Superseded runs, including explicitly cancelled mutation matrices, remain non-acceptance evidence.

The protected main status and all recorded dirty-file hashes remain unchanged. All local database writes belong to the new closure cluster; proof databases must be dumped/dropped and that cluster stopped after final-head verification. No deployment, production proof effects or Gate Wave 2 implementation is authorized by this report.

## Mutation CI execution budget reconciliation

The complete recovered Gate 7 report in `evidence/maya-chat-first-ux/recovery-20260919/mutation-reports.json.gz` records `2026-09-19T09:24:58.828Z` → `12:58:40.025Z` (214 minutes), already longer than the existing 180-minute CI job budget. This is measured infrastructure cost, not a failed assertion. The published `e537103b` Platform CI run [35454150121](https://github.com/famous4wrongreasons-stack/maya-platform/actions/runs/35454150121) passed all backend, Python and frontend gates; its backend unit suite alone took 806.915 seconds. The superseded mutation run [35454150138](https://github.com/famous4wrongreasons-stack/maya-platform/actions/runs/35454150138) is not accepted from partial results.

The CI scheduler now partitions **Gate 7 mutants into four disjoint parts**, with independent baseline/neutraliser controls and the original complete, unfiltered suites and default steps in each part. The other 18 batteries remain whole. There are 22 execution jobs, still exactly 19 battery declarations and 204 mutants. No timeout, test selection, declared expectation, killer, architectural assertion or business contract is relaxed. No production code changes in this scheduling correction.

A partial runner report is explicitly `PARTITION-AS-DECLARED`, never a complete battery receipt. A mandatory final job reconstructs each declared battery and fails on missing/duplicate mutants or parts, stale source HEAD/declaration hashes, reduced steps, filtered tests, missing/red baseline controls, crashes, vacuous kills or unexpected outcomes. Only complete assembled reports use `AS-DECLARED`. Every raw part and final receipt remains a CI artifact. The fail-closed assembler has executable counterfactual tests and is itself a prerequisite in the workflow. A manual requested subset cannot count as all 19 batteries; the canonical push always schedules all declarations.

This correction requires a fresh final-HEAD run of every mandatory gate. The previous green Platform CI/local results above remain diagnostics, not the final certification receipt. Node 24 SIGSEGV remains unresolved, and the control-plane guard is unchanged; a private performance experiment was not adopted.
