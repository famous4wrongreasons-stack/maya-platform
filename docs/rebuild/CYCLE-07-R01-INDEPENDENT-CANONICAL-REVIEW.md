# Independent canonical R01 review and proportional remediation

Date: 2026-09-12. Reviewed baseline: `6cc5d831` (HEAD = canonical origin at preflight).
Authority: owner's instruction “CHAPTER 7 — RETURN TO CANONICAL PLAN / INDEPENDENT REVIEW OF CONTOUR FINDINGS”. This supersedes the later full-provider-configuration prerequisite, not the R01 security contract.

## Independent findings

| Question | Verdict | Original requirement and exact evidence |
|---|---|---|
| Public api-proxy backup with direct book_record is a real R01 regression | **YES** | [R01 Stage 1](CYCLE-06-PACKAGE-5-WAVE-R-A-STAGE-1-ASSESSMENT.md), R01 owner and permanent-ratchet sections: all inventoried aliases and backup/test variants must converge or fail closed before provider operation; no backup-directory exemption. [R01 assessment](evidence/package5-wave-ra-r01-assessment.md), exact membership B38: close every inventoried direct `yc_post` / `records` / `book_record` create, including public legacy variants. [Public coverage report](CYCLE-07-R01-PUBLIC-RELAY-COVERAGE-REPORT.md), live source evidence: salon `app/backups/api-proxy-before-loyalty-20260721-2035.php`, SHA `8cc22eaf…`, direct provider writer, public HEAD 200. This is an existing coverage escape, not a newly invented capability. |
| Technical /records writer is a real R01 regression | **YES** | Same original R01 B38 membership explicitly includes `/records`, not merely the literal `book_record`. Public technical-root `api-proxy.php`, SHA `5904e859…`, create case uses phone/fullname and `yc_post` to `/records/{$company_id}`. See public coverage report “Exact unsafe state” and source classification evidence. HTTP 500 is not an authorization refusal. |
| Full internal Beget Nginx/Apache vhost config required by existing R01 contract | **NO** | Original R01 assessment (introduced at `45688886`), R01 local acceptance and [Wave R-A cutover plan](CYCLE-06-PACKAGE-5-WAVE-R-A-CUTOVER-PLAN.md) require exact inventoried aliases/artifacts and executable closure. They do not require exporting private provider configuration. Known routing must be accounted for; theoretical unknown aliases do not independently create this extra gate. |
| Full provider vhost proof required by frozen C7 completion gate | **NO** | [C7 preflight](CYCLE-07-PREFLIGHT-AND-SCOPE.md), §11 frozen 32-surface manifest and §12 finite completion gate require structural/read-only verification of exact release artifacts, active launchers/config/flags and enabled/retired paths. [C6 final report](CYCLE-06-FINAL-COMPLETION-REPORT.md), architectural-invariants and ratchet-wiring sections explicitly bound claims to approved contracts and the closed 32-surface manifest. Neither specifies full private hosting config export. |
| Contour introduced a new acceptance requirement | **YES** | The full effective-vhost/include-chain prerequisite appears in [public coverage report](CYCLE-07-R01-PUBLIC-RELAY-COVERAGE-REPORT.md), opening STOP and final prerequisite, [control-plane inventory](CYCLE-07-R01-BEGET-CONTROL-PLANE-READONLY-INVENTORY.md), opening missing-evidence section, and release runbook appended by `bb6c9c5c`. These are later than the frozen contracts. The owner did previously request finite control-plane evidence; the latest instruction expressly removes treating inaccessible provider internals as a release prerequisite. Earlier reports remain historical evidence, not a revised C7 specification. |

## What remains real

The main salon relay also still differs from its certified R01 result: `d5eeaa82…` instead of `b1006160…`, with direct book_record restored. Exact actor/upload command remains unproven. No canonical commit authorizing the restoration was found. Classification: **RUNTIME REGRESSION + RELEASE/RATCHET COVERAGE ESCAPE**. This does not prove an unsafe artifact passed the documented deployment process; out-of-band hosting upload remains possible. Original fixed-alias and fixture checks did not certify the omitted backup/technical writer, and a self-matching production hash is not semantic certification.

The versioned fixture already has the certified refusal. Whole-source semantic guards and candidate/recovery guards remain mandatory. No PHP booking implementation, new Client authority or new compatibility behavior is introduced.

## Bounded remediation / current release requirements

1. Restore only the main relay's exact certified R01 refusal; preserve every other raw byte. Candidate raw hash and sanitized-fixture equivalence are independently checked.
2. Deny HTTP access to the two proven legacy writers using exact filename rules in the technical root and salon backup directory. Preserve historical PHP bytes and private recovery evidence. No PWA backup or maintenance content is replaced.
3. Pin all **26** PHP artifacts found in the three authenticated-panel-bound public roots: **10** reviewed active PHP, **16** denied PHP/config/archive artifacts. Also pin five HTML artifacts, two PWA backups and nine local routing files (eight existing, one new exact denial). Total manifest entries: **42**. The six newly registered active helpers must pass the same whole-source provider-write guard. Denial is tested across all eight known apex/www host aliases and applicable HTTP/HTTPS origins, including redirects and PATH_INFO on the two retired writers.
4. Keep recursive known-root discovery, content/extension classification, unknown-file/symlink/error rejection and local routing-file drift detection. Authenticated panel mapping, local configuration and actual URL responses are sufficient for the bounded known-artifact claim. No assertion is made about inaccessible provider internals or all theoretical URLs.
5. Re-run affected release/fixture, R01/B31–B33/auth/PWA tests, mandatory regression, ratchets, lint, both typechecks, build and Prisma. Then controlled R01 remediation and read-only post-state proof. Backend deployment retains live R01 verification before upload, before activation and after activation.
6. Continue the approved backend-only P03/P04 Wave 3, then P06 and the one frozen C7 Final Gate. No Q23/Bxx, no unrestricted discovery loop, no new owner decision.

`FULL PRIVATE PROVIDER VHOST EXPORT AS RELEASE PREREQUISITE: NO`

`KNOWN PUBLIC DIRECT BOOKING BYPASSES: MUST BE 0 BEFORE BACKEND CUTOVER`

`C7 MANIFEST: 22 requirements / 6 packages / 4 waves / 32 surfaces — UNCHANGED`

This review is not production PASS. Remediation/gate receipts will record actual outcomes separately.
