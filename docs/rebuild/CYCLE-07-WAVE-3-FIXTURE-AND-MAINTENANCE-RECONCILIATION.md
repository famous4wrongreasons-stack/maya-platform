# Chapter 7 — fixture recovery and PWA maintenance provenance

**PHP FIXTURE RECOVERY: PASS. MANDATORY REGRESSION: PASS.**
**STOP before production cutover — accepted PWA operational state / cutover scope unresolved.**

Scope is the owner's two decisions after `c5f1383e`: recover the certified PHP
test input without secrets, and identify the unexpected maintenance state without
altering production. P03/P04 implementation and C7 product/schema decisions are
preserved. This is not a new discovery or remediation wave.

## Exact repository / protected state

On 2026-09-12, fetch returned canonical origin `c5f1383e2c0813d168005a3160e4c8075ba37bd1`.
The isolated `contour/c7-recovery-cd157b66` worktree started clean, equal to
`origin/codex/maya-brain-systemic-release-20260815`, with no unpushed commits.
No new upstream commit appeared during the pause.

The protected main checkout now has **25**, not 24, dirty entries. The new external
entry is `сайт и приложение/app.html`, observed before this task's edits. All
original 24 entries and all 22 previously protected file hashes are unchanged.
The original protection script correctly refused its exact-count assertion; it
was not weakened or rewritten. [Evidence](evidence/chapter7-wave3-fixture-recovery/main-external-state-change.json).
This task neither changed nor restored the main checkout. No old database was used.

## Recovered PHP input

The source is exactly
`/home/m/mocine3388/muzhskayaestetika.rf/public_html/app/api-proxy.php` on Beget.
Its SHA-256 is `b1006160a28e66448886bdc4b520a2d94021121748259c2cd1aeefda5f1aaaa0`,
matching the certified R-C `candidate-5.php` in
`evidence/package5-rc-policy-approved/edge-manifest.json`. Read-only rechecks on
September 8 and 12 agree. The private original is not committed.

The versioned static fixture is
`maya-saas-backend/test/fixtures/beget/api-proxy.sanitized.php`, SHA-256
`5b5059f820b6337b59866fd6260f0b3fef87e65db8f969e7f4e7a9537619dd7e`.
Only the quoted values of `PARTNER_TOKEN` and `COMPANY_ID` are replaced. All other
bytes are identical, including public origins and proxy targets, method branches,
headers, auth forwarding, validation, refusal order and compatibility behavior.
External `tg-config.php` and environment files were not imported.

[Reproducible proof](evidence/chapter7-wave3-fixture-recovery/verify-fixture.py)
checks the exact original hash, the two substitutions, full byte equality and
credential signatures. PHP 8.4 syntax/token inspection parses both full programs
without running them: **21,665 tokens**, exactly two changed string tokens on
lines 96 and 97, all others identical. [Receipt](evidence/chapter7-wave3-fixture-recovery/fixture-equivalence.json).
No endpoint, application include, database operation or provider call was executed.

The four existing B13/B14/B16/B17 suites now read this versioned fixture. Their
assertions are preserved. The new mandatory `beget-relay-fixture.architecture.spec.ts`
pins provenance, guards credential placeholders/signatures and keeps those four
suites on the versioned input. There is no ignored-file fallback or skipped test.
The fixture is test input only and is not uploaded by the backend release process.

## Maintenance provenance — established, desired baseline still not accepted

The previous report confused matching bytes with approval. The current user
instruction takes precedence: **maintenance is unexpected in this task and is not
accepted as the desired Chapter 7 PWA baseline**. No historical instruction found
in another task is used to override that instruction.

The historical record identifies the exact independent operation:

| Question | Evidence / result |
| --- | --- |
| Originating task | `01a068b0-ad02-7582-bdc7-f96b9af49535`, «Выполнить Package 5 cutover» |
| Historical request | 2026-09-08 21:08:30 MSK: temporarily close PWA with a maintenance page and keep Telegram messages/reports |
| Artifact | `сайт и приложение/maintenance.html`, later committed as `1ac62a51` |
| Deployment | At 21:10:40, uploaded `.maintenance-incoming` to each domain; copied backups; a completion command at 21:10:59 moved both incoming files over `app/index.html` |
| Actual file replacement | Both live files have change timestamps near 21:11:01 MSK; identical 2,247-byte maintenance artifact |
| Beget flag | This was a file replacement, not evidence of a dynamic hosting-panel maintenance flag |
| Python handoff flag | `MAYA_PWA_MAINTENANCE_MODE=true`; active bot started 21:22:50 MSK on September 8 |
| Same mechanism across domains | YES — the same operation targeted both app index files |
| Backend/API | Existing Wave 2 backend independently healthy; release, compiled artifacts, schema, readiness match certified baseline |

[Historical request/command receipts](evidence/chapter7-wave3-fixture-recovery/maintenance-provenance.json)
are evidence only; their deployment commands were **not re-executed**.
[Current bot check](evidence/chapter7-wave3-fixture-recovery/maintenance-bot-readonly.json)
reads only the selected maintenance flag, service identity and file hashes.

Both backups remain at `app/index.html.pre-maintenance-20260908-211040`:

- Salon: SHA-256 `784b68630d659a5aceb9832d84f6ebd5c6519a1ecd0a15adcbe5e5dd029607b6`,
  exactly the certified R-C salon PWA.
- MayaOS: SHA-256 `b3278512ca71beee709b93c1de2892fa841ef0cb19ae965791d71dfcb2a65e6e`,
  exactly the repository `app.html` containing the reconciled `2e7de86d` login change.

[All nine inherited aliases](evidence/chapter7-wave3-fixture-recovery/nine-aliases.json)
were checked: four PHP aliases and three additional HTML aliases match the
certified R-C bytes (**7/9 match**). The remaining two are the known maintenance
replacements. Therefore **coverage is 9/9**, not a claim that all nine match the
desired PWA baseline. [Public responses](evidence/chapter7-wave3-fixture-recovery/public-maintenance.json)
confirm maintenance after following MayaOS's existing tenant redirect.

## Backend cutover / acceptance distinction

`maya-saas-backend/deploy/vps/deploy.sh` uploads only backend build/package/schema
inputs to `/opt/maya-saas/releases`; it uses Beget as an SSH jump, not a PWA upload
target. Its activation and cleanup concern the backend release directory and unit.
It does not replace Beget `/app/`, clear maintenance, or change the Python flag.
**Backend/PWA deployment separation is proved.**

That does not certify the desired active PWA baseline. The frozen C7 manifest
includes S02/S03 and current PWA consumers; the owner's latest instruction
explicitly rejects treating maintenance as desired. The existing release
documentation does not provide an exception substituting these disabled public
entries for the certified PWA baseline. The maintenance operation also changed
versioned PWA/Python behavior, so it cannot be described as a hosting-only event
unrelated to canonical runtime.

**BACKEND CUTOVER SAFE WHILE MAINTENANCE ACTIVE: UNKNOWN at acceptance level**
(physical deployment isolation: YES). No backend deployment is performed on the
assumption that physical isolation alone satisfies the owner's conditional gate.
The remaining issue is the accepted operational PWA state / cutover scope, not
P03/P04 architecture or another schema decision. No PWA restoration is authorized
or attempted here. No new production surface or C7 manifest defect is alleged.

## Gates and preserved accounting

| Required proof | Result / receipt |
| --- | --- |
| Four previously failing suites | **4/4 PASS**; with new fixture guard **5 suites / 26 tests PASS**, [targeted receipt](evidence/chapter7-wave3-fixture-recovery/four-plus-fixture-ratchet.txt) |
| Full mandatory backend regression | **428 suites / 3595 tests PASS**, no skip or SIGTERM; [full receipt](evidence/chapter7-wave3-fixture-recovery/mandatory-regression.txt) |
| Existing assertions | All four emitted test programs equal the prior programs after only substituting the fixture path; [comparison](evidence/chapter7-wave3-fixture-recovery/existing-assertions-preserved.json) |
| Lint | PASS after fixing nine formatting diagnostics in the five owned test files; configuration unchanged |
| Application / scripts typecheck | PASS / PASS |
| Build / Prisma validate | PASS / PASS |
| Production structural baseline | Wave 2 `20260908-c7-wave2-4b03a29c`, 14 compiled hashes and all MeasurementRevision constraints/guards match; [read-only probe](evidence/chapter7-wave3-fixture-recovery/production-structural.txt) |
| Production schema | 94 repository migrations / 97 applied including approved historical migrations; pending **0**, drift **NONE**, MeasurementRevision rows/backfill **0** |
| Health / readiness | PASS / PASS |

The full mandatory run completed before applying formatting. The subsequent
format-only change has identical emitted programs for all five files, proven in
[formatting equivalence](evidence/chapter7-wave3-fixture-recovery/formatting-program-equivalence.json).
The final fixture guard was rerun (**3/3 tests PASS**), then lint, both typechecks,
build and Prisma passed on the formatted files. No source was edited under the
running mandatory test process. [Final local gates](evidence/chapter7-wave3-fixture-recovery/local-gates.json).

Earlier real PostgreSQL proofs remain preserved: P03 10 scenarios, P04 9, shared
measurement 41 checks and source-owner correction/concurrency 18 checks. No
runtime/schema change in this step invalidates them. No additional production
migration or synthetic database was needed for this recovery.

P01/P02/P05 production PASS and P03/P04 local PASS remain preserved. Production
accounting is still **10/22 requirements, 3/6 packages, 2/4 waves**. P03/P04 are not
deployed; P06 implementation and the Chapter 7 Final Gate have not started.
Chapter 7 is incomplete; Chapter 8 has not started.

## Remaining operational decision and continuation

The concrete pending operation is **backend-only P03/P04 Wave 3 cutover through
the unchanged documented release process**, with zero new migrations, keeping
both maintenance pages and the Python maintenance flag unchanged. The release
would rerun its mandatory gates and canary, then verify the deployed compiled
measurement artifacts/schema/health read-only. It would not restore PWA or change
Beget configuration. This scope needs explicit acceptance while the user's
current desired-PWA-baseline instruction remains unresolved; alternatively the
owner can authorize a separate PWA-state reconciliation. Neither choice is
assumed here. No C7 schema, product or package-owner decision is reopened.

After that operational boundary is resolved, continue existing Wave 3, then
P06/Wave 4 under the same frozen 22-requirement/6-package/4-wave/32-surface plan.
The current fixture repair is complete and does not need to be redesigned.

**Documentation handoff addendum, 2026-09-12:** continuation and the eventual C7
completion report must reference the
[permanent service-business principles](../architecture/README.md#service-business-principles)
and [C7 compatibility / future-chapter mapping](CYCLE-07-PREFLIGHT-AND-SCOPE.md#service-business-handoff).
They preserve the approved C7 owners/envelope and record C8–C10 prerequisites;
they do not resolve the operational approval above, permit deployment or start
a new feature wave. The ratchets are specified here by reference, not implemented
or claimed as newly executed tests.

## Final status / hygiene

PRODUCTION PHP HASH RECORDED: YES  
SECRET SCAN: PASS  
SECRETS IN VERSIONED FIXTURE: 0  
STRUCTURAL EQUIVALENCE: PASS  
SECURITY SEMANTICS EQUIVALENCE: PASS  
ALIASES COVERED: 9/9 — 7 certified matches, 2 identified maintenance replacements  
PREVIOUS FAILING SUITES: 4/4 PASS  
MANDATORY REGRESSION: 428 suites / 3595 tests PASS  
MAINTENANCE PROVENANCE: ESTABLISHED  
MAINTENANCE DESIRED CHAPTER 7 BASELINE: NO  
PWA PRODUCTION BASELINE CERTIFIED: NO  
BACKEND DEPLOYMENT ISOLATED FROM PWA FILES: YES  
BACKEND CUTOVER SAFE WHILE MAINTENANCE ACTIVE: UNKNOWN — acceptance scope unresolved  
P03 LOCAL: PASS  
P04 LOCAL: PASS  
WAVE 3 PRODUCTION CUTOVER: NO  
COMBINED BASELINE CERTIFIED: NO — operational PWA scope, not the repaired PHP input  
NEW C7 BUSINESS/SCHEMA CONTRACT GAP: NO  
NEW PRODUCTION SURFACE / MANIFEST DEFECT: NO  
CHAPTER 7 REQUIREMENTS COMPLETE: 10/22  
CHAPTER 7 PACKAGES COMPLETE: 3/6  
CHAPTER 7 WAVES COMPLETE: 2/4  
CHAPTER 7 FINAL GATE RUN: NO  
CHAPTER 7 COMPLETE: NO  
CHAPTER 8 STARTED: NO  
RUNTIME / SCHEMA / MIGRATION CHANGES THIS STEP: 0  
PRODUCTION EFFECTS / MESSAGES / BUSINESS MUTATIONS: 0  
MAIN DIRTY WORKTREE TOUCHED: NO  
ORIGINAL 24 DIRTY ENTRIES PRESERVED: YES — external additional entry separately recorded  
PRE-EXISTING DATABASES TOUCHED: 0  
OWNED TEMP PROCESSES / WATCHERS / BROWSERS / DATABASES: 0  
PROCESS HYGIENE: 0

[Hygiene evidence](evidence/chapter7-wave3-fixture-recovery/hygiene.json) records
unchanged main state since resumption, preserved original hashes and all 85
historical migration/inventory hashes. The newly fetched private PHP source and
redundant recovery candidate were removed after proof. Evidence and the previously
preserved synthetic database dumps remain; no production file was deleted.
