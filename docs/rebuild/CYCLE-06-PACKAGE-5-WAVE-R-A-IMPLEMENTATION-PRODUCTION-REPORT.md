# Cycle 06 / Package 5 — Wave R-A implementation and coordinated cutover

Owner authorization: checkpoint `45688886`. Scope remains exactly R01 (B38/B39/B54), R02 (B40/B41), R10 (B50) from the closed 32/32 inventory. No new discovery or Package 5 Final Gate was run.

## Outcome

```text
R01 LOCAL ACCEPTANCE: PASS
R02 LOCAL ACCEPTANCE: PASS
R10 LOCAL ACCEPTANCE: PASS
WAVE R-A AGGREGATE GATE: PASS
R01 PRODUCTION REMEDIATION: PASS
R02 PRODUCTION REMEDIATION: PASS
R10 PRODUCTION REMEDIATION: PASS
BLOCKERS REMEDIATED THIS WAVE: 6
TOTAL BLOCKERS REMEDIATED: 6/24
REMEDIATION PACKAGES COMPLETE: 3/14
NEXT ELIGIBLE PACKAGES: R03, R04, R07
PRODUCTION MUTATIONS/MESSAGES FOR PROOF: 0
```

Production PASS here is supported by local executable proofs over the exact release view plus production structural/read-only verification. No live booking, provider mutation or message was sent to manufacture proof.

## Independent package changes and acceptance

| Package | Blockers | Canonical owner and resulting behavior | Local acceptance | Production acceptance |
|---|---|---|---|---|
| R01 | B38, B39, B54 | Verified Client/profile/Appointment owners and B31–B33 ingress; raw native/legacy create entry retires to verified canonical admission; HTTP idempotency identity survives both relays | PASS | PASS |
| R02 | B40, B41 | User → current AuthSession/Membership → CrmStaffAccess/platform authority; legacy identity cannot grant access; CRM presentation reference follows canonical StaffId through the exact active StaffProviderLink | PASS | PASS |
| R10 | B50 | AI invocation/approval receipt binds canonical ActionExecution durably before dispatch; retries/restarts project the same execution and preserve UNKNOWN/reconciliation | PASS | PASS |

Independent initial commits: R01 `654028dd`, R02 `cec204c7`, R10 `438f577a`. R02 boundary correction `ef091875` preserves the original architectural guard and adds no exception. Publication plan/tooling are separate commits `d8049d47`, `95288970` and `b1a937fe`.

No new models, persisted fields, action classes or migrations. No new business contract was selected. The six blockers are marked REMEDIATED in a separate progress ledger; historical inventory is retained unchanged.

## Evidence and mandatory gates

[Aggregate gate evidence](evidence/package5-wave-ra-aggregate-gate.json) records all stage exits, source fingerprints and log hashes:

| Gate | Canonical runtime `ef091875` | Actual release `4891f5e7` |
|---|---|---|
| Architectural ratchets | PASS — 86 suites / 491 tests | PASS — 86 suites / 491 tests |
| Lint | PASS | PASS |
| Application typecheck | PASS | PASS |
| Scripts typecheck | PASS | PASS |
| Build | PASS | PASS |
| Schema validate / migration status / schema diff | PASS / pending 0 / drift NONE | PASS / pending 0 / drift NONE |
| Full mandatory backend regression | PASS — 389 suites / 3207 tests | PASS — 388 suites / 3200 tests |
| Source unchanged during gate | YES | YES |

Zero failed or skipped tests in the successful runs. The release excludes the known B36 runtime WIP suite (one suite/seven tests); this is not B36 acceptance. The unchanged documented deployment script independently repeated the actual release's full mandatory gate: 388 suites / 3200 tests PASS.

The first release-view guard run lacked an existing ignored PHP fixture used by historical B13/B14/B16/B17 static tests. The exact isolated-worktree dependency was supplied only to the release build, SHA-256 `92699e64844091d1925f62328534928768d75a0f20e44d901046974e12f97a41`. No test/guard was weakened, and this fixture was not published. R10's PostgreSQL crash/restart/UNKNOWN proof was also rerun against the actual release view, with unchanged kernel/runtime/receipt/schema hashes before and after.

The first aggregate architectural run found the new R02 auth controller selecting a legacy external staff reference. This owned implementation defect was fixed before any production publication: authorization now uses canonical StaffId; the exact CRM link is resolved only at the CRM boundary. The original guard and its exception list are unchanged. The successful repeated gate supersedes that failed run; it is not hidden or labelled PASS.

Package evidence:

- [R01 local acceptance](package5-wave-ra-r01-local-acceptance.md) and [proof](evidence/package5-wave-ra-r01-implementation-proof.json): 10 Jest suites/130 tests, native AST executable proofs, 48 pure PHP checks, actual compiled B31/B32 controller/policy/Action Engine against fresh owned PostgreSQL and synthetic providers.
- [R02 local acceptance](evidence/package5-wave-ra-r02-implementation.md) and [proof](evidence/package5-wave-ra-r02-local-proof.json): 7 suites/53 tests including 22 Python cases after boundary correction; actual HTTP authorization matrix, six PWA variants/24 checks and 15 pure PHP checks.
- [R10 local acceptance](evidence/package5-wave-ra-r10-implementation.md) and [proof](evidence/package5-wave-ra-r10-implementation-proof.json): 11 suites/143 tests, 23 hermetic cases, distinct-process PostgreSQL crash/restart/UNKNOWN proofs and read-only attestation.
- Permanent ratchets are included in each package. Real provider/message/business proof effects are zero. Legacy create and unauthenticated historical staff variants fail closed; no synthesized authority is introduced.

## Exact release boundary and publication

[Production evidence](evidence/package5-wave-ra-production-proof.json) and safe [before](evidence/package5-wave-ra-production-before-metadata.json)/[after](evidence/package5-wave-ra-production-after-metadata.json) metadata pin the result:

- Canonical runtime source: `ef091875b1734188c05a51032cb4babd31e943b8`.
- Exact pushed release view: `4891f5e758a51bf7f680d0ba27aee490b413dc93`, tree `791ae533cf9929841bc4622bb3a3ed8f655d0628`, branch `release/wave-ra-20260907-ef091875`.
- Publication mapping/metadata-preservation tooling: `b1a937fe4cb1a179cec315c0b49ec4e384e52161`.
- Production release: `/opt/maya-saas/releases/20260907-p5-ra-d8049d47`. Its label was chosen during planning; the exact source is the release commit above, not inferred from the label.
- Before deployment: canonical HEAD matched origin; release view clean and pushed; pending migrations 0, schema drift NONE, health/readiness PASS. R-A added no migration.
- Publication sequence: four Beget PHP artifacts → documented backend release → twelve VPS/Python artifacts → five Beget PWA artifacts. Final verification checked all nine Beget and thirteen VPS/Python targets, including the unchanged Python API file.
- Production matches all 95 expected Python hashes and all 593 compiled JavaScript hashes. Four active Python guards PASS. Backend and bot are active/running and own their listening sockets; health/readiness both HTTP 200. Unrelated services and runtime flags are preserved.

A staging-only path check initially used the bot directory for the VPS PWA alias. The accepted inventory already identifies `/var/www/maya-platform/app.html`; its baseline hash matched. Commit `b1a937fe` corrected that exact mapping and preserved root ownership before publication. No new surface was discovered. The five-case offline publication/rollback proof was repeated, including ownership preservation. Final proof confirms no bot-root `app.html` was created and the existing OAuth callback/service worker hashes are unchanged.

The [artifact verifier](evidence/package5-wave-ra-verify-artifacts.py) compares captured metadata with the exact scoped overlay and compiled release. Its `--evidence-root` points to the retained owned local evidence directory containing `production-baseline.json` and `stage-python/manifest.json`; inputs and published results are hash-pinned in the evidence.

Canonical history includes known B36 runtime WIP. The [documented release view](evidence/package5-wave-ra-release-view.py) excludes only the exact 20 B36 WIP runtime paths and matching schema-proof constructor adjustment, retaining the applied schema and compatible d779 schema proof. This projection has an immutable pushed commit; canonical source history and worktree are never reset or rewritten. Both source and release tree receive full mandatory gates.

```text
B36 SCHEMA: APPLIED
B36 RUNTIME: NOT DEPLOYED
B36 PROOF DEFECT 1: IDEMPOTENCY KEY
B36 PROOF DEFECT 2: CONCURRENT WRITE CONFLICT
```

The report service/scheduler/module compiled artifacts are byte-identical to pre-R-A production. Python `_daily_report_job` has the same AST fingerprint. The already applied B36 schema remains present, with zero OwnerReportRun rows and zero populated new binding fields at verification. The schema proof's 14 columns describe that existing B36 migration; R-A adds zero fields or migrations. B36 preservation PASS is not B36 runtime proof PASS.

Publication uses the existing deploy/vps/deploy.sh unchanged, including fresh server npm ci, generated Prisma client, strict preflight, no-op migration deploy, structural schema diff, bounded spare-port readiness process, atomic backend switch and health/readiness checks. Exact scoped Python/PWA/PHP overlays preserve unrelated deployed variants. All publication files are hash-pinned; offline copy/restart failure simulations prove bounded restoration. No full secret-bearing deployed PHP source is committed.

## Next wave and accounting

The [separate progress ledger](evidence/package5-remainder-remediation-progress.json) marks only B38/B39/B40/B41/B50/B54 and R01/R02/R10 REMEDIATED. Counts are **6/24 blockers, 3/14 packages complete, 18 blockers remaining**. All original 24 findings, package memberships and dependencies remain unchanged in the closed inventory.

The requested next parallel group assessment is complete: [E2 consolidated Stage 1](CYCLE-06-PACKAGE-5-REMAINDER-E2-STAGE-1-ASSESSMENT.md), with exact evidence for R03/B56, R04/B42 and R07/B46+B57. All three have sufficient existing foundations, satisfied R02 dependencies, zero new owner decisions, schema proposals, models, fields, action classes or migrations. All are ready for implementation; none has been implemented or marked production-ready in this stage. The four E2 blockers remain unremediated. Decision-gated E3 retains its original approvals/dependencies; this report selects no new contract.

## Protected state and hygiene

[Cleanup and protected-scope evidence](evidence/package5-wave-ra-cleanup-proof.json) confirms:

- Main worktree: the same 24 dirty entries and 22 file hashes; status SHA-256 `c28307f97e02975799f0cd9fcbe854d97285a5c344e25af50c67f60fbfca2c25`. No reset, stash, clean or user-file changes.
- The same 86 protected schema/migration/inventory hashes; all 17 pre-existing databases untouched.
- All five newly owned proof databases dropped; their isolated PostgreSQL cluster stopped, owned PID gone and owned data/socket directories removed. No old database was connected to for proof.
- Three owned Beget/VPS staging directories removed. Spare readiness process killed/reaped; no port-3199 listener, smoke log or publication temporary file remains.
- Clean pushed release worktree and private local candidate/original evidence retained for audit/recovery. No full secret-bearing PHP source is placed in Git. No owned proof/deployment process remains running.

```text
PROCESS HYGIENE: 0
PRODUCTION MUTATIONS/MESSAGES FOR PROOF: 0
```

PACKAGE 5 FINAL GATE RUN: NO
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
CHAPTER 7 STARTED: NO

STOP after report/evidence commit and push.
