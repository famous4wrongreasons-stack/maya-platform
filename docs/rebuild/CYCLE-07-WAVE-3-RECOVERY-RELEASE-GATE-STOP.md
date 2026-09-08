# Chapter 7 — restored worktree and release-gate reproducibility STOP

**P03/P04 LOCAL PASS. WAVE 3 PRODUCTION CUTOVER: NO.** The interrupted run was recovered. The new blocker is a demonstrated inherited **RELEASE-GATE GAP**, not a new C7 schema/business decision or a new production surface.

## Recovery and current scope

The owner authorized replacement of `/tmp/maya-b29-contour`. It was created clean from exact canonical origin `cd157b66`, on `contour/c7-recovery-cd157b66`, tracking `codex/maya-brain-systemic-release-20260815`. All committed P03/P04 WIP is restored. Main checkout/index and its 24 dirty entries remain unchanged. No prior temporary runtime file was imported as authority. Dependencies were installed with the committed lockfile; synthetic fixtures came only from committed proof scripts and clean replay of the 94 repository migrations.

P01/P02/P05 production acceptance remains preserved: **10/22 requirements, 3/6 packages, 2/4 waves**. The approved one-model/37-field/one-migration/zero-backfill envelope is unchanged. P06 is not implemented; its bounded preparation remains in the preceding handoff. Chapter 8 has not started.

## Upstream reconciliation

| Commit | Exact change | Assessment |
|---|---|---|
| `2e7de86d` | Existing native Telegram control invokes the existing canonical OAuth bridge in SaaS context; loading fails closed. Adds four auth/PWA tests and updates example entry URL. | No new Client/User/Membership authority, measurement reader, finance/AI/audit permission, business executor, delivery owner or schema. Existing non-SaaS compatibility remains bounded by inherited guards. |
| `1ac62a51` | Adds a static maintenance page, environment switch and read-only Telegram handoff text; adds one Python test. | Existing S02/S03/Telegram surfaces, no new mutation capability. Both live Beget `/app/` responses exactly match the committed maintenance artifact, SHA-256 `cb27000739b179ddea6546fb4dd169fc9f1f397abca998acdcacf4dc1162c249`. Do not overwrite maintenance during backend work. |
| `7fb5f9ee` | Calls the existing registry refresh only when callable; otherwise logs capability unavailable. | Existing refresh target preserved, no new owner/source. No C7 schema or result rule changes. |

The last two commits arrived while the full gate was running. The gate completed on `cd157b66`; only afterward was the clean worktree fast-forwarded to `7fb5f9ee`. No source was changed under the running test process. The existing R01 wrapper expected exactly eight Python tests; it now expects nine because upstream added one maintenance test. No original test, invariant, timeout or lint setting was removed or relaxed.

Post-fast-forward auth/PWA/identity/tenant/C7/inherited owner checks: **39 suites / 432 tests PASS**. P01/P02/P05 and P03/P04 rule proofs are not invalidated by these diffs. New production surface: NO. Frozen C7 manifest defect: NO. The earlier maintenance clarification is resolved by the committed exact artifact evidence; no extra maintenance owner decision is requested.

## Restored executable proof

| Proof | Result |
|---|---|
| Initial auth/PWA + measurement + identity/tenant + inherited owner ratchets | 38 suites / 421 tests PASS |
| P03 outcomes/attribution/funnel PostgreSQL | 10 scenarios PASS |
| P04 salary/goals/authority PostgreSQL | 9 scenarios PASS |
| Shared MeasurementRevision PostgreSQL | 41 checks PASS |
| Source-owner FK correction/publication/concurrency | 18 checks PASS |
| Prisma clean replay / schema comparison | 94 migrations PASS; drift NONE |
| Lint / application typecheck / scripts typecheck | PASS |
| Build and release-preflight compilation | PASS |
| Production backend structural/read-only probe | Existing Wave 2 release/artifacts/schema/health PASS; pending 0; drift NONE |

The initial shared P01 proof was invoked after P03/P04 fixtures and correctly rejected its empty-database precondition (18 existing derived rows versus expected zero). The synthetic database was dumped, recreated with the same committed migrations, and that proof rerun on a clean database: all 41 checks PASS, followed by all 18 source-owner checks. No test assertion was weakened and no old database was used.

The full mandatory backend regression completed normally in 233.144 seconds: **423 suites PASS / 4 FAIL; 3578 tests PASS / 2 FAIL**. SIGTERM did not recur. Two failed suites cannot load, and two other suites have one failing case each. Every failure has the same missing-file cause below. The full gate must not be reported PASS from the successful package proofs or successful build.

## Exact release-gate gap

Missing file: `сайт и приложение/pwa-assets/tg-auth/api-proxy.php`.

- `.gitignore:9` excludes `api-proxy.php` under the secrets section.
- `git ls-files` has no entry; `git log --all -- <exact path>` has no reachable path history.
- Mandatory B13, B14, B16 and B17 architecture tests read that file directly. Their failures are ENOENT, not demonstrated runtime/authority assertion regressions.
- Existing R01/R02 relay artifacts are **partial patches** (78/103/107 lines), requiring an external exact base. They cannot reconstruct the complete file.
- The committed R01 overlay manifest explicitly says: “Exact live source captured by root; full source kept outside Git; supersedes redacted inventory proof copy.” The stored hash identifies bytes but does not supply those bytes.

| Failing mandatory suite | Missing-source dependency |
|---|---|
| `package5-b13-remediation.architecture.spec.ts` | module-level proxy read; GOD bearer/read-only boundary |
| `package5-b14-remediation.architecture.spec.ts` | module-level proxy read; retired billing mutation boundary |
| `package5-b16-remediation.architecture.spec.ts` | booking-prefill bearer forwarding boundary |
| `package5-b17-remediation.architecture.spec.ts` | signed Telegram/Maya session forwarding boundary |

[Machine-readable evidence](evidence/chapter7-wave3-recovery/missing-versioned-gate-artifact.json) and [complete mandatory result](evidence/chapter7-wave3-recovery/mandatory-gate.txt) preserve exact paths and line numbers. This proves a clean-checkout release dependency on an unversioned artifact. It does not on its own prove a production bypass or invalidate the already-applied measurement migration.

The current deployed salon relay was checked **by hash only**: SHA-256 `b1006160a28e66448886bdc4b520a2d94021121748259c2cd1aeefda5f1aaaa0` matches the certified `after` value in `evidence/package5-rc-policy-approved/edge-manifest.json`. Its source body was not imported. This identifies an exact candidate source for the narrow recovery repair and provides no evidence of a production relay regression.

## Why automatic repair stops here

The recovery authorization requires: “восстановить необходимые test fixtures/evidence только из committed repository artifacts”. Under that source constraint there is no exact full PHP input to restore. Reconstructing a stub from assertions, changing the tests to skip a missing file, claiming that a partial patch equals the complete runtime, or copying an unknown temporary file would conceal the gap. None was done. The protected main checkout was not used as a source.

The minimal next repair is a **versioned, secret-free exact relay source/fixture with documented provenance**, derived from an explicitly accepted exact source and separated from runtime secrets/configuration. Preserve the same four boundary checks and verify the sanitized mapping against the exact accepted source; then rerun the unchanged mandatory release gate. No C7 model, field, action, business policy or new Bxx is needed. If using current deployed bytes rather than committed file contents is accepted for this repair, that is a narrow relaxation of the recovery-source restriction; it is not another architecture approval. This report does not authorize or implement that substitution.

## Production and hygiene

Production backend remains `20260908-c7-wave2-4b03a29c`. Read-only proof matched 14 compiled artifact hashes, the approved MeasurementRevision schema/guard bodies, pending migrations 0, drift NONE and health/readiness PASS. VPS static retains its previously certified C6 hash. Beget maintenance is preserved. No upload, activation or production migration was performed in this recovery step.

Production proof business/provider/messages: **0**. The owned loopback PostgreSQL database was dumped and archive-validated, then dropped; only its owned cluster was stopped/removed. The final synthetic dump remains in the task workspace, with the checksum in [hygiene evidence](evidence/chapter7-wave3-recovery/recovery-hygiene.json). The 17 old databases were untouched. Owned processes/watchers/browsers/databases: **0**. Main 24 entries and 22 protected hashes are unchanged.

## Verdict and continuation

UPSTREAM COMMIT 2e7de86d REVIEWED: YES  
AUTH/PWA COMPATIBILITY: PASS  
NEW PRODUCTION SURFACE: NO  
CHAPTER 7 MANIFEST DEFECT: NO  
P01/P02/P05 INVALIDATED: NO  
P03/P04 LOCAL ACCEPTANCE: PASS  
COMBINED BASELINE CERTIFIED: NO — inherited release-gate source missing  
WAVE 3 READY FOR PRODUCTION: NO  
P03/P04 PRODUCTION: NOT DEPLOYED  
CHAPTER 7 REQUIREMENTS COMPLETE: 10/22  
CHAPTER 7 PACKAGES COMPLETE: 3/6  
CHAPTER 7 WAVES COMPLETE: 2/4  
CHAPTER 7 FINAL GATE RUN: NO  
CHAPTER 7 COMPLETE: NO  
CHAPTER 8 STARTED: NO  
PROCESS HYGIENE: 0

After the narrow release-source repair and mandatory PASS, continue the existing approved Wave 3 cutover, then P06/Wave 4 and the frozen final gate. No product/schema reapproval is required.
