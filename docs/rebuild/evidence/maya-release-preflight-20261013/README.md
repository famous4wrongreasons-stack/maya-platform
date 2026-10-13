# Release preflight after local single-operator AR-1

2026-10-13. Branch `codex/maya-local-crm-setup-20261010`.
Current code/test candidate: `27c410255783feac7a5044f6331eabf1fb25a164`.

**Preflight and test-maintenance evidence only. No new certificate or real grant.**
The preceding staging implementation remains documented in
`../maya-native-booking-lifecycle-20261013/LOCAL-STAGING-RESULT.md`.

## Scope and provenance

Starting checkpoint `495a4b92a65a37996be93682eb91617085efc315` is retained.
This pass changes tests, finite test transforms, mutation declarations and the
release evidence verifier (a transitive-import omission was repaired).
Backend product, Client authority, booking, Action Engine, runtime, React,
packaging and schema sources are unchanged. No merge, push or real execution.

- `4ee85cfc`: reconciles 19 obsolete anchors across ten mutation batteries with
  existing canonical owners. IDs, order, killers, expectations and closed-input
  profile boundaries are unchanged. The collector fixture now includes the two
  already-registered READ capabilities, with missing/substitution negatives.
- `7849dd23`: types existing synthetic fixtures without disabling lint rules.
  URL/body checks reflect the actual synthetic fetch inputs.
- `c09f07be`: adds precisely four transitive policy module filenames to the
  finite ESM test transformer. Real dependency traversal and foreign/launcher/
  runtime import refusals prove the boundary. No general ESM allowlist.
- `5e15fd97`: reconciles D-6 with the documented owned-preview fix `8bd701e5`.
  The three imports are restricted to the existing booking-preview adapter;
  three foreign-adapter overlays remain refused. No product behavior changed.

## Failures retained

The first complete backend run on `c09f07be`, Node 24.15.0, was red: 9,799 tests
passed, one D-6 assertion failed, and another suite failed to load after a
SIGSEGV. The native crash report for PID 12704 points into V8 garbage collection;
only selected non-sensitive crash metadata is archived. The unchanged Gate 4
suite passed separately (12 tests). This isolated pass does not turn the full
run green or establish universal absence of an environment fault.

The fresh replacement run uses a separately downloaded official Node 22.23.3
arm64 archive, matching the major used by Platform CI. SHA256 was verified
against the official versioned SHASUMS256.txt. The system Node installation is
untouched. Timeout budgets and assertions were not relaxed.

Earlier preflight failures are also retained: a 3 GiB lint heap exhausted; the
subsequent full lint exposed 75 fixture typing errors; the synthetic owner-chat
proof first used the wrong Jest configuration, then its finite transformer
correctly refused four newly required imports. Those failures are not counted
as product defects or mutation kills. The isolated lint heap is 6 GiB, other
Node processes remain at 3 GiB, and Jest has one recycled worker.

## Qualification boundary

The 19 anchor mutations are a targeted BUILD diagnostic with selected suites,
not the complete 545-declaration release corpus. Their report identifies its
actual source HEAD and then-uncommitted test declaration changes. The 545-anchor
dry-run verifies matching text and named killers, not successful fault killing.
The current conformance audit retains 163 unqualified applicable duties plus
two global HANDOFF STOP duties; it is not a count of 163 known code defects.
No historical certificate, receipt or U scope is promoted to the current SHA.

Real salon data, saved provider keys and the retained owner database were not
opened or copied. Migrations apply only to new disposable test clusters. No
production, entitlement grant for a real tenant, OTP/SMS, YCLIENTS/model calls,
booking, message, iPhone installation, design change or C10 work occurred.

## Subsequent HTTP diagnosis and repairs

On committed `5e15fd97`, official Node 22.23.3: full backend **9,815/9,815**,
724 suites passed. Full HTTP was red: **673 passed / 3 failed**, 59 suites.
No later binary, carrier or mutation stage was credited from that failed run.
All owned test database clusters stopped.

- Three diagnostic helpers had been placed under canonical evidence support.
  They were relocated into the existing `widgets-diagnostics/support` boundary;
  no override allowlist was enlarged. Direct/nested claim attempts using these
  exact helpers remain inadmissible.
- Those new counterfactuals exposed a genuine verifier defect: side-effect
  relative imports were absent from its transitive scan. Six red tests establish
  the before result. The scan now includes that static import form.
- A diagnostic pre-init callback had broken the historical adjacent boot-source
  assertion. It now refuses evidence-enabled execution and uses a permanently
  disabled writer when used diagnostically. A late flag change is tested through
  the actual mint sink: canonical boot records the refusal, diagnostic boot never
  gains capture. The ordinary owner-chat probe remains functional.
- The combined owner fixture still fabricated the old tool-only price decision.
  It now invokes the current canonical planning-response validator with scripted
  semantics; deliberately forged model service/price arguments must still be
  replaced by the exact utterance/catalog owner. Product code is unchanged.

Targeted restored results (then-uncommitted test patch): 184 HTTP tests, 60 pure
fixture tests and 3 owner-chat tests passed, with type and scoped lint checks.
The first restored attempt had six newly exposed import-scan failures and one
incorrect test-side filename expectation; it is retained as failed evidence.
The final pure formatting corrections do not change test logic.

Commits: `6aed399e` (current pricing fixture), `80a0d97d` (diagnostic boundary and
verifier correction). The fresh baseline runs on this committed candidate, with an unchanged clean
worktree. Final measured results are in `FRESH-BASELINE.json`.
A baseline is not the complete mutation/CI/FBE2E release programme.


## Captured-evidence baseline and diagnostic boot

The complete `80a0d97d` run passed all 9,815 backend tests but stopped after
HTTP: 665 passed / 21 failed, all 21 in `local-owner-telegram.live-spec.ts`.
The newly strict diagnostic-hook guard refused that synthetic local-session
middleware under the global evidence flag, before its callbacks ran. There was
no backend product failure or runtime-load error. The owned cluster stopped;
binary/carrier stages were not reached in that failed run.

Diagnostic callers now explicitly supply a disabled writer. The hook rejects
an enabled writer (including the default inherited from the global capture
flag) and replaces every accepted disabled writer with an immutable disabled
writer. A global capture flag elsewhere in the suite does not prevent the
explicit diagnostic test from running, and cannot activate its collector.
The actual sink is tested with both an ambient flag and a later flag change:
canonical boot records the refusal, diagnostic boot writes nothing. No test is
removed/skipped, and no diagnostic result is promoted to clause evidence.

## Native lifecycle source binding

Relocating the native synthetic provider helper also requires including its
exact new path in the existing source-hash/dirty-worktree checks of
`booking-confirmation-proof.mjs`. Two executable preflight counterfactuals
failed before the repair: the helper had no recorded hash, and a modification
of that committed helper did not refuse proof preparation. Both pass with the
exact new path included. The tests execute the real preflight prefix in a
fresh synthetic Git fixture and stop before databases, builds or browsers.
Commit: `5dab4020`. The post-run hash check uses the same scope.

Diagnostic boot repair commit: `27c41025`. Targeted pre-commit checks passed:
179 HTTP assertions including all 21 local Telegram cases, plus 3 owner-chat
assertions. Full types and final scoped lint passed. A line-length-only variable
extraction followed the targeted run; the complete clean candidate baseline
restarts afterward. Fresh source-binding and finite-transform tests also pass
on this committed candidate.


## Fresh committed-candidate results

All results below are measured on clean committed
`27c410255783feac7a5044f6331eabf1fb25a164`, with official Node 22.23.3.
The frozen worktree/HEAD checks passed. Later documentation-only commits do not
turn this baseline into a release certificate for any SHA.

| Surface | Fresh result |
| --- | --- |
| Backend unfiltered | 9,815 PASS, 724 suites, 0 FAIL |
| Widgets Live, complete configured suite with capture | 687 PASS, 59 suites, 0 FAIL |
| Release binary Jest suites | 4 PASS, 4 suites |
| Separate HTTP/BIN runner | 21 cases PASS; 47 captured mints, 0 malformed |
| New staging HTTP/compiled-binary | 17 PASS |
| Synthetic owner-chat probe | 3 PASS |
| Full runtime | 763 PASS, 7 explicit SKIP, 0 FAIL |
| React carrier configured full suite | 164 PASS |
| Strict mutation receipt collector | 60 PASS |
| New source-binding / finite-transform tests | 4 PASS |
| Current audit preparation tests | 6 PASS |
| Types, full lint, contract checker, K3, audit consistency/self-test | PASS |
| Complete mutation declaration preflight | 545 declarations / 47 batteries, DRY-RUN only |
| Fresh clause evidence verifier | 35 lines, 31 claims, 0 violations |

The seven runtime skips explicitly report `LOCAL API NOT GIVEN`. They cover
live API sign-in, persisted-message bounds, an approval-gated tool, debug email
OTP, logout/providerless transcription, trial expiry and relay rate limiting.
They are SKIP, not PASS. The separate HTTP/BIN runner and isolated native browser
probe below do not silently replace those seven cases.

The clause verifier observed 325 HTTP and 47 BIN mints, 657 records captured
before teardown and 40 scanned support files. Valid offered evidence is not
complete conformance: the current 163 applicable unqualified duties and two
HANDOFF STOP duties were not promoted by this pass. `NOT_ISSUED` is unchanged.

The after-repair native lifecycle also passed on this SHA through current React,
runtime and real backend owners with a synthetic YCLIENTS transport. Eleven
checkpoints cover slot selection, previews, commits and reload. The single test
provider record is created once, rescheduled once, canceled once, and remains
the same record; nine concurrent consumed-intent submissions are refused.
Real provider/model calls: zero. The relocated helper is present in the recorded
source hashes; all source bytes are unchanged at cleanup. The owned browser
closed and both final baseline/native PostgreSQL clusters stopped, with absent
postmaster PID files. See `NATIVE-LIFECYCLE.json` for measured aggregates.

## Exact remaining release boundary

This completes the **local staging implementation/preflight continuation**, not
full release qualification or real salon booking acceptance. No behavior of the
Maya product, schema, frontend or runtime was changed in this maintenance pass.

Still not executed for this candidate: the complete 545-declaration mutation
corpus with unrestricted fresh controls and strict release assembly; the complete
Platform CI surface (including dependency audit, seed/e2e/events/HTTP smoke,
legacy Python and frontend prepublication checks); full applicable FBE2E; and
release PWA/Capacitor/iOS packaging verification. Ordinary carrier parity tests
are not a substitute for release payload byte-equivalence verification.

The approved staging implementation has its separate 17-mutant results on
`98761bc6` in the preceding local-staging packet. Those are explicitly historical
here; no full-corpus kill or current release certificate is inferred from them.

## Later committed-candidate follow-up

The [fresh CI and packaging follow-up](../maya-release-ci-followup-20261013/README.md)
records the subsequent dependency repair and complete local Platform CI equivalent,
release payload/iOS verification, fresh widget/runtime baseline, 17 targeted AR-1
mutations and synthetic native lifecycle on committed `a6d9c12d`. These complete
the previously unexecuted CI/packaging surfaces for that newer candidate without
rewriting this packet's `27c41025` results. Full release qualification remains
unissued; the 545-declaration corpus was checked in DRY-RUN only.
The 19 repaired-anchor diagnostics in this folder likewise retain their actual
pre-commit/source provenance. Nothing is labeled 545/545 killed.

Before owner-data execution, the existing decision packet still requires fresh
exact-candidate release admission, a genuine global platform session and
operator-controlled staging signing, a separately authorized private staging
snapshot, and a bounded real business-effect permit. Availability of those real
credentials was not investigated here. No permission request for real execution
is made by this report.

Raw logs, synthetic receipt bodies and controllers remain at the exact local
paths in `RAW-MANIFEST.json`, with sizes and SHA256. Only aggregate evidence and
selected non-sensitive crash/runtime metadata are archived. No real credentials,
private signing material, owner database or raw customer data are included.

The archived 19-anchor diagnostic explicitly sets `archival_only: true` and
`release_admissible: false`. The real collector rejects that exact archive
before assembly; `ARCHIVE-REFUSAL.json` records the executable negative and
artifact hash. This extra documentation check issues no certificate.
