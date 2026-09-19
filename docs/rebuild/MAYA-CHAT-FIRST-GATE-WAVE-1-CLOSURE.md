# Gate-programme Wave 1 closure

This closes only the six outstanding duties accepted at `df2d175c`. Gate Wave 2 is not started. Recovery's 33 commits remain preserved. Widget Contract V1.1, the gate audit and later-wave holds are unchanged.

## Evidence status

This checkpoint publishes remediation for verification; **Wave 1 is not yet certified**. Final certification requires every mandatory gate on the published final HEAD, including actual Platform CI and all 19 Widgets Mutation shards. Earlier green results are diagnostic, not final-HEAD receipts.

## Disposition of the six gaps

| Gap | Classification and cause | Remediation / executable proof |
| --- | --- | --- |
| HTTP smoke | PRE-EXISTING STALE TEST / INVALID FIXTURE. The old request omitted required `expectedDraftRevision`, so DTO validation correctly preceded admission. B4 retired non-CRM AI onboarding. A completed CRM preview without a claim uses the existing `Trial activation claim required` response. | `scripts/http-smoke.ts` now proves invalid DTO, incomplete preview and missing claim separately, with zero new Tenant/User/Client/ActionExecution/link/confirmation receipts. The positive trial uses canonical A26 onboarding and A28 catalog commands; no CRM transport is configured. |
| Appointment PostgreSQL | PRE-EXISTING INVALID PROOF FIXTURE. An unactivated trial is not authorized for a CRM write. The old rejected-approval check also confused production's synthetic-capability fence with terminal execution state. | A synthetic full-access trial pre-state is admitted through unchanged production policy and actual appointment owners. Production rejects `kernel.test.*`; the real kernel separately proves rejected approval is terminal, with no attempt or dispatch. 20 checks, isolated provider fixture only. |
| Kernel architecture barrier | PRE-EXISTING REAL SOURCE-LAYER VIOLATION, not a reason to relax the barrier. The kernel imported a CRM-owned type; its registry imported pure bulk descriptors through the marketing module. No provider writer was imported. | Unchanged neutral channel-binding type moves to `common`; unchanged pure bulk-admission descriptors move to Action Engine. Old paths re-export for compatibility. The original `/crm/`, `/marketing/` and executor barriers remain unchanged. 26 PostgreSQL checks. |
| Platform CI | PRE-EXISTING failures confirmed at `a2f98a52`, recovered code and recovery checkpoint. Dependency findings are real current security defects. Frontend assertions include stale implementation literals and a real missing-session legacy-history fallback. Python's 64 failures/errors are stale retired-path expectations or invalid authority/module fixtures. | Minimal dependency patches; real SaaS history fail-closed guard in both versioned bundles; executable storage/entitlement/routing checks plus seven counterfactuals. Python tests follow approved C6/C8 dispositions, rather than restoring retired writers. No Python runtime is changed. |
| Mutation CI receipt | CONFIGURATION. Workflow existed only on the working branch, absent from GitHub's default-branch workflow registry; manual dispatch returned 404. | A push trigger for the exact canonical branch runs all 19 existing matrix shards. No repository settings/default-branch changes, no reduced matrix or altered mutant expectations. Actual receipt still required. |
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
