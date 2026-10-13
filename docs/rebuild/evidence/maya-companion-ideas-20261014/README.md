# Companion Ideas — scoped evidence

Code candidate: `e9cd4ad2d7da61288e2026222835437b32ebd29c`.
Branch: `codex/maya-local-crm-setup-20261010`.
All 17 checks in `summary.json` ran fresh on this clean, unchanged committed SHA.

| Surface | Fresh result |
| --- | --- |
| Full runtime suite | 810 PASS, 7 SKIP, 0 FAIL |
| Full carrier suite | 179 PASS |
| Scoped backend/source suites (all C8 tests + existing retained reads/task owners) | 300 PASS / 22 suites |
| Ideas mutations | 14/14 killed, green baseline |
| Task actions / task reads / retained workspace mutations | 11 + 9 + 13 killed, green baselines |
| Runtime architectural ratchets | 68 refusal / 24 admission, 31 coverage, 2 write, 51 PWA, 8 bypass |
| Carrier architectural ratchets | 72 refusal / 45 admission |
| Actual emitted synthetic browsers | Ideas 42, chat 35, tasks 32, feed/library 52, task actions 28 = 189 PASS |
| Packaging tests | 18 PASS |
| Runtime reproducibility and PWA/Capacitor parity | PASS / 8 payload files; only approved endpoint substitution |

The mutation programme here is **47 scoped mutants**, not the complete release corpus.
No full backend Platform CI, production database, native Xcode signing/install or real
salon/model/provider acceptance was run. Seven skips remain skips. No release
certificate or production readiness is asserted.

`logs/` contains all successful command output. `browsers/` binds the five browser
receipts to exact emitted payload hashes. `screenshots/` contains the new Ideas
surface with artificial data only (320/393/427/1280 widths, detail, denial, empty).
Images inspected after final build: mobile 320, detail 393, desktop 1280.
`MANIFEST.json` records original/archived bytes, sizes, SHA-256, design reference
hashes and unchanged-surface screenshot hashes. Text trailing whitespace is normalized;
original hashes remain available. Raw provider data, customer PII and real keys were
not involved. A scoped high-confidence pattern scan passed; this is not an audit of
all historical repository secrets.

`runner.py` records the exact local orchestration. It reused only the preceding
checkpoint's command inventory, not its results; every executed command is recorded
in `summary.json`. Original local paths are provenance, not portable installation paths.
For a new machine, resolve those paths/runtime/tool dependencies before rerunning into
fresh output directories. The runner requires a clean committed candidate.

`prior-incomplete/` preserves the failed first final attempt: the scrubbed PATH lacked
`rg`, so a C8 consumer architecture check failed ENOENT. The successful rerun adds
`/opt/homebrew/bin` to that isolated PATH. Product sources, assertions and timeout
budgets are identical. No partial failed run is used as admission evidence.

Read-only source→runtime integration is exercised by the actual C8ReadService response
fed to the shipped `projectIdeas` through Node; persistence/viewer are synthetic.
C8 controller policy and product code were unchanged. See the checkpoint for source
limits and the explicit boundary before recommendations/plans/actions.
