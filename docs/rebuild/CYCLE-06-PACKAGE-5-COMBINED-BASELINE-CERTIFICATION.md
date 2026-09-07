# Package 5 — R01 artifact repair and combined baseline certification

**R01 PATCH ARTIFACTS: VALID. LATE BASELINE CHANGE: COMPATIBLE. COMBINED BASELINE CERTIFIED: YES.** The two malformed relay patches were regenerated from exact documented base/result bytes. Only four hunk-header lines changed; payload and resulting PHP remain unchanged. No production file, runtime source, schema or migration was changed.

Accepted entry: `73fdfacf93085f76e801d01555728dd1ac4a9ee5`. Existing isolated `/tmp/maya-b29-contour`, branch `contour/b29-remediation`, was clean. Fetch passed; HEAD equalled `origin/codex/maya-brain-systemic-release-20260815`; dirty files and unpushed commits were zero. The protected main 24 entries, 22 file hashes and 86 inventory/schema hashes are unchanged. The 17 old databases were not accessed. No proof database, worktree, production staging directory or persistent process was created.

## Exact source of truth

For both relay artifacts:

- **Expected base commit:** `456888862a037f0866138fe9d69f218bbae52a95`, the parent of the original R01 implementation.
- **Certified R01 result:** `654028dd8115450723f466a7c79cbe5bedc50398`, matching the original R01 result SHA-256 in the existing report/manifest.
- **Intended repaired-patch result:** the exact corresponding PHP file in upstream `7ee1e670ed4fc503c632d2fc200c34dccd1561f8`, whose compatibility the owner accepted at this checkpoint. Current canonical PHP files match these Git objects and the accepted 631-case-per-relay compatibility evidence.

The base hashes were checked against [R01's documented manifest](evidence/package5-wave-ra-r01-overlay-manifest.json), not inferred by editing counts. The current relay rows now record exact base/result commits, expected result hashes and retained `historicalR01CandidateSha256` values. The old R01 implementation/production evidence and prior STOP reports remain unchanged. Other manifest rows are unchanged.

| Patch / Git source | Base SHA-256 | Historical R01 result SHA-256 | Intended result SHA-256 |
| --- | --- | --- | --- |
| `r01/mayaos__maya-platform-api.php.patch` → `maya-saas-backend/deploy/platform/beget-edge/maya-platform-api.php` | `cc9c7ca4f3f95428b62877bf5799190277f4fa1f007cdbc0ae21086f1611476f` | `ca9e7bd28fd62822816cc9eacf21f06db401740e376dd03c2c5f594799c40d46` | `0f33e067495b40ab64b91e4aa1eb179f7403903ccc404bac1872e025671dfb50` |
| `r01/salon__app__maya-native-api.php.patch` → `сайт и приложение/maya-native-api.php` | `ae371c9bfd514f7e8f300f4c9d45fa657ddd4b5d1ba9eb92bf455d8e680b5952` | `91429681ea3118a158e37fe42be9a0306062f06fb8f2926935391d6081ea4391` | `7c46765b03dd82f86e11c4018c76481db7c3b8e4584f8b2cb2378279f8d89b60` |

Zero-context diffs were regenerated from those base/result bytes. Both `+70,29` headers become `+70,31`; the subsequent MayaOS output line moves from 100 to 102 and the salon insertion from 105 to 107. Removing only hunk-header lines makes the malformed and repaired patch byte streams identical. This proves no payload difference was disguised as formatting.

The historical R01 PHP result differs syntactically from the current upstream result by the already accepted PHP 5.6 compatibility change. Therefore **raw byte delta from historical R01 is not claimed zero**. Semantic delta is zero by the accepted compatibility proof; byte delta introduced by this repair is zero for the intended result and zero for patch payload.

## Executable artifact proof

[Reproducible proof](evidence/package5-r01-patch-artifact.proof.py) loads the exact Git objects, validates manifest hashes, then creates one disposable local exact-base fixture per patch. Each fixture includes an unrelated sentinel. It checks parsing and no-write apply validation, applies the patch, compares the complete output to the pinned expected Git object and checks that only the intended alias changed. The malformed upstream versions are negative controls. Both fixtures were automatically removed; no real PHP relay was executed or overwritten.

| Required property | MayaOS patch | Salon native patch |
| --- | --- | --- |
| PATCH PARSES | YES | YES |
| `git apply --check --unidiff-zero` | PASS | PASS |
| `git apply --unidiff-zero` on disposable exact base | PASS | PASS |
| RESULT == EXPECTED R01 CONTENT (accepted upstream-compatible result) | YES | YES |
| UNEXPECTED FILE CHANGES | 0 | 0 |
| PATCH SEMANTIC DELTA FROM APPROVED R01 | 0 | 0 |
| Malformed negative control | REJECTED | REJECTED |
| Disposable fixture remaining | NO | NO |

Exact output: [artifact repair proof](evidence/package5-r01-patch-artifact-repair-proof.json). This proof is retained as the executable release-artifact check for these patches; it does not depend on a marker-only Jest assertion. Future changes to this replay contract must continue to pass it. The earlier 73fdfacf proof describes the historical malformed artifacts and is not rewritten to pretend they passed.

## Combined baseline verification

- Fresh read-only production hash check: **9/9 aliases match the accepted combined baseline**. The live MayaOS relay is the exact upstream result. The live salon native relay remains the certified historical R01 result. Repairing its replay artifact does **not** claim to have deployed the newer source there. The seven other aliases are unchanged.
- Exact alias/source guards: **9/9 PASS**, using the already inventoried artifacts and existing R01 retirement boundaries. No new surface or discovery pass.
- Targeted regression and relevant architectural ratchets: **5 suites / 32 tests PASS** — Client initiator boundary, legacy staff principal, Client booking idempotency, AI invocation receipt and Client channel appointment create. No full Package 5 Final Gate.
- Exact upstream comparison: both canonical PHP files remain byte-equal to `7ee1e670` and to the accepted compatibility-proof hashes. Runtime compatibility was **not reopened** and no PHP edits occurred.
- Fresh structural runtime readback: existing R-B release, **101 Python files**, **594 compiled backend files**, flags, service states and PIDs remain unchanged. No runtime deployment, restart, database write, message, booking or provider effect.

Machine record: [combined certification](evidence/package5-combined-baseline-certification.json). This resolves the execution hold in [73fdfacf reconciliation STOP](CYCLE-06-PACKAGE-5-LATE-BASELINE-RECONCILIATION-STOP.md); historical R-A/R-B production PASS and 6/14 packages, 10/24 blockers are preserved.

## Stage 2 result and limits

After certification, all eight prepared sheets were read and consolidated into the [Owner Decision Pack](CYCLE-06-PACKAGE-5-OWNER-DECISION-PACK.md). All eight original sheet/assessment hashes are unchanged. The pack proposes one dependency-compatible Wave R-C after batch approval, with explicit package proof and shared integration/cutover barriers. No owner choice is recorded as approved; no R05–R14 runtime/schema implementation started.

```text
R01 PATCH ARTIFACTS: VALID
LATE BASELINE CHANGE: COMPATIBLE
COMBINED BASELINE CERTIFIED: YES
PACKAGES COMPLETE: 6/14
PACKAGES REMAINING: 8/14
BLOCKERS REMEDIATED: 10/24
BLOCKERS REMAINING: 14/24
OWNER DECISIONS PRESENTED: 8/8
OWNER DECISIONS APPROVED IN THIS CHECKPOINT: 0
PROPOSED REMEDIATION WAVES REMAINING: 1
WAVE R-C: R05, R06, R08, R09, R11, R12, R13, R14
WAVE R-D: NOT REQUIRED BY CURRENT GRAPH
WAVE R-E: NOT REQUIRED BY CURRENT GRAPH
B36 SCHEMA: ALREADY APPLIED
B36 RUNTIME: NOT DEPLOYED
B36 PROOF DEFECT: IDEMPOTENCY KEY
B36 PROOF DEFECT: CONCURRENT WRITE CONFLICT
B36 REPEAT SCHEMA MIGRATION: NO
PACKAGE 5 FINAL GATE RUN: NO
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
CHAPTER 7 STARTED: NO
PRODUCTION MUTATIONS/MESSAGES FOR PROOF: 0
PRODUCTION DEPLOYMENT: NO
PROCESS HYGIENE: 0
```

Patch metadata + certification/evidence + Owner Decision Pack → commit/push → STOP. Post-push HEAD/origin equality and clean isolated worktree are verified at completion.
