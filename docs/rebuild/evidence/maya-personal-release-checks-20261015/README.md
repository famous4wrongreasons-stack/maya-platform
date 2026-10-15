# Personal booking path and fresh local release checks

Tested source: `4a4e5e3d833999dd15d236d492dd987c6f865083` on
`codex/maya-local-crm-setup-20261010`. This checkpoint preserves completed local
checks; it is not a release certificate or a deployed update.

The new commit changes two test files only. Full CI previously stopped on 24 lint
errors in Companion HTTP/C8 fixtures. Typed parsed values and matchers, validated
projection shape and Promise-returning mocks fix those errors without removing
assertions, disabling lint rules or changing product/runtime code. The entire
backend suite passes: **9,912 tests, 729 suites, zero failures or skips**.

All four Platform CI jobs were exercised locally: backend, first operator,
legacy Python (618 tests) and frontend. These are fresh macOS executions, not
GitHub-hosted CI. Clean migration replay used owned artificial databases only.

Runtime on Node 22 and 24: **846 passed, 7 explicitly skipped on each**. Skips
are recorded separately and are not passes. Carrier: 200 passed. Canonical
release packaging: 18 passed. The actual unsigned simulator app and a separate
unsigned iphoneos app were verified against React AChat bytes. The device build
uses the explicit phone-test API target; neither app was signed or installed.

The real React/HTTP/PostgreSQL personal-catalog scenario passes 14 checkpoints
across application/database restart. Its artificial provider ledger has exactly
one appointment before and after restart. Current-authority revocation, changed
facts and UNKNOWN outcome remain covered. The model and provider in this proof
are synthetic; it does not prove real DeepSeek understanding or a real booking.

`RESULT.json` contains the complete measured counts and limitations. The strict
widget collector accepts the offered provenance; coverage spans 155 clause IDs.
Eight applicable price/goods approval source duties still lack admissible claims:
G7-FR6d, G11-I4/I5/I6/I10 and G13-I1/I2/I9. Existing scripted model proofs cannot
be relabelled under D-15. G6-6 and G13-R8 remain global HANDOFF STOP.

The 545-mutant declaration preflight passes; **the complete mutation corpus has
not run**. Six separate phone-catalog restriction mutants were killed with green
baseline and restored controls; they do not replace the 545-mutant programme.
The committed audit remains unpromoted (163 false/unqualified, two STOP duties).
No old certificate or historical mutation receipt is inherited.

Earlier e049ac1f failures remain in `LOCAL-ARTIFACTS.json`: the first packaging
runner omitted the canonical release rebuild and compared stale endpoint targets;
the corrected runner passed. The subsequent CI failure was the test lint problem
fixed by the tested commit. Failed attempts are not counted as passes. The old
surface runner's inherited `signingKeysCreated:false` field was too broad: release
tests use ephemeral synthetic keys. The fresh runner explicitly distinguishes
those from production private keys, which were never created or accessed.

`LOCAL-ARTIFACTS.json` records hashes of local raw receipts. Selected manifests,
executed runners and nonidentifying summaries are preserved here; large raw logs,
sealed test payloads, databases, dependencies and build binaries stay local.
All owned proof databases were stopped. No server, real account, grant, provider,
model, OTP or installed phone state changed. The next release still needs source
evidence, complete mutation admission and separately authorized operator/update
execution. No Telegram rebinding is required.
