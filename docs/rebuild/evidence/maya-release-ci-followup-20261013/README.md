# Local AR-1 release preflight continuation — 2026-10-13

Tested code and test candidate: `a6d9c12d7b738c7bd3db37d29276a8905d270598`.
Branch: `codex/maya-local-crm-setup-20261010`.
This packet records fresh local checks, not hosted GitHub CI, a new release
certificate, a real salon grant or real provider acceptance.

## Why this candidate changed

The clean dependency audit on `e7aac44b` blocked CI. The minimal repair and
before/after proxy regression are recorded in
[dependency security preflight](../maya-dependency-security-20261013/README.md).
Four dependency families were patched; the fresh production-dependency audit
reports zero findings. No application implementation, authority, schema,
headless runtime or presentation source changed in this follow-up.
Dependency bytes changed, so older certification cannot be inherited.

## Fresh completed surfaces

All execution used the committed candidate in an isolated local clone, official
Node 22.23.3 and synthetic PostgreSQL 16 databases. The Platform CI workflow was
followed across backend, legacy Python and frontend jobs. This is a macOS local
equivalent, not a claim that GitHub's Ubuntu jobs ran. The complete backend suite
retained every test with one recycled worker (768 MiB idle cap), rather than one
accumulating in-band process. No assertion or timeout was relaxed.

| Surface | Result |
| --- | --- |
| Backend unfiltered | 9,819 PASS, 725 suites |
| e2e / events live | 1 / 4 PASS |
| Legacy Python 3.11 | 618 PASS; external network refused by OS sandbox |
| Frontend prepublication tests | 8 PASS |
| Types, script types, full lint, Prisma validate | PASS |
| K3 / K1 dossier | 10 / 15 PASS |
| Widget Contract | 31 checks PASS; 4 explicit pending later-package declarations |
| Fresh migration application and second replay | PASS; no pending migration on replay |
| Synthetic HTTP smoke | PASS |
| Full Widgets Live with capture | 687 PASS, 59 suites |
| Compiled release binary suites | 4 PASS |
| Separate HTTP/BIN runner | 21 cases PASS, 47 captured mints, 0 malformed |
| Staging HTTP / compiled binary | 17 PASS |
| Full runtime | 763 PASS, 7 explicit SKIP, 0 FAIL |
| React carrier full suite | 164 PASS |
| Release packaging tests | 18 PASS |
| Offline / compiled operator checks | 30 / 9 PASS |
| Strict mutation receipt collector | 60 PASS |
| Fresh clause evidence verifier | 35 lines, 31 claims, 0 violations |
| Local staging targeted mutations | 17/17 killed; 241 unit + 51 HTTP/binary controls green before and after |
| Synthetic native booking lifecycle | 11 checkpoints PASS; one test record; 9 concurrent replay refusals |

The seven runtime skips state `LOCAL API NOT GIVEN`. They are not PASS and are
not silently replaced by HTTP/BIN or the targeted synthetic browser proof.
Widget Contract's structural checks and validated captured evidence do not
promote the current conformance audit.

## Packaging and isolation

PWA, Capacitor www and the actual unsigned Xcode simulator app bundle passed
canonical React payload verification, including approved endpoint substitution.
The recorded hashes cover eight files per web/Capacitor payload. Empty generated
Cordova placeholders in the app bundle are governed by the existing verifier.
The exact verified payload was copied and hash-checked in the private
`release-payload-snapshot` before subsequent synthetic browser builds could
overwrite ignored dist files. No signing credential, provisioning, device
installation or deployment occurred.
The static packaged production endpoint was inspected as bytes, not contacted.

The original backend dependency symlink was preserved outside the checkout, then
replaced locally with a private install of this lock. The other worktree's shared
directory was not modified. `PRIVATE-DEPENDENCIES.json` records the preserved
link and exact lock hash. No owner database or saved key was opened or copied.
All owned proof clusters and the synthetic browser stopped after execution.

## Provenance and failed preparation

The original red dependency audit is retained. A first clean retry after the
repair installed successfully but stopped before starting PostgreSQL: its private
runner had loaded ts-node from the wrong working directory (TS5109). The runner
was corrected to select the backend directory, and the complete clean pass
restarted in a new output directory. This was a harness setup error, not a test
failure, product repair, mutation kill or omitted gate.

`FRESH-CI.json`, `WIDGETS-RUNTIME.json`, `TARGETED-STAGING-MUTATIONS.json`,
`NATIVE-LIFECYCLE.json` and `PACKAGING-HASHES.json` contain measured aggregates.
`RAW-MANIFEST.json` pins local raw receipts by path, size and SHA-256. Large builds,
synthetic database clusters, dependency directories and raw logs are not committed.
`DEPENDENCY-COUNTERFACTUALS.json` additionally records bounded cross-family subnet
and YAML empty-merge-budget comparisons; these diagnostics do not claim a Linux
Sharp exploit reproduction or an inspection of production configuration.

## Exact remaining boundary

The targeted 17-mutant programme (14 staging-specific faults and three existing
production compatibility faults) is not the complete release mutation corpus.
The 14 staging faults are in the separate targeted runner, not counted among
the registered 545 declarations.
The fresh declaration preflight resolves all 545 declarations in 47 batteries;
that is DRY-RUN, not 545 killed faults. The complete 68-job programme and full
applicable FBE2E qualification have not run on this candidate. The historically
parked V1.4 programme is not silently resumed or credited by these local checks.

The current audit remains: **163 applicable duties unqualified, two global
HANDOFF STOP; certificate NOT_ISSUED**. These are evidence/qualification states,
not a count of 163 product defects. No historical certificate, partial mutation
receipt, synthetic model result or structural pending branch is promoted.

Before actual local booking: exact-candidate release admission, a real global
platform session/operator-controlled signing, a separately approved staging
snapshot preserving identity/encryption lineage, and a bounded real-operation
permit including provider notification behavior. No real entitlement or external
business effect was executed here. No production, SMS/OTP, YCLIENTS/model call,
real booking, iPhone installation, design change or C10 work occurred.

Documentation commits after the tested SHA preserve this evidence without
creating a certificate for a different SHA.
