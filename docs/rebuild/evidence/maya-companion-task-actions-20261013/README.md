# Companion task actions — scoped evidence

Code candidate: `88fa811644b59211d484a47816e44b604e4f1387`. Branch: `codex/maya-local-crm-setup-20261010`.
Predecessor checkpoint: `344fa6cd864599d15eafbf04d9d5a270e2e3b588`.
Implementation: `7df78d1fdcc4b49d9229c7b62b9e0eb0585511ad`; final bound/cap correction: `88fa811644b59211d484a47816e44b604e4f1387`.

`summary.json` contains fresh, clean, unchanged committed candidate receipts; every listed command exited 0.
`MANIFEST.json` records original paths, sizes and SHA-256 hashes plus archived hashes.
Text logs retain all lines with trailing whitespace normalized; original hashes remain available.
`browsers/` contains four fresh emitted-browser receipts with exact payload hashes and named checks.
`screenshots/` contains only artificial task examples; no real salon/user data or keys were used.
`runner.py` records the local orchestration, scrubbed environment, timeouts and clean-HEAD checks.
Its input is the preceding checkpoint's command inventory; no historical result is reused.

| Surface | Fresh result |
| --- | --- |
| Runtime full suite | 797 PASS, 7 SKIP, 0 FAIL |
| Carrier full suite | 176 PASS, 0 FAIL |
| Scoped backend/source + real Nest guards, mocked persistence | 80 PASS / 6 suites |
| Task action mutations | 11/11 killed, green baseline |
| Task read mutations | 9/9 killed, green baseline |
| Feed/library mutations | 13/13 killed, green baseline |
| Runtime architectural ratchets | 68 refuse / 24 admit; 31 coverage, 2 write, 51 PWA, 8 bypass probes |
| Carrier ratchets | 72 refuse / 45 admit |
| Emitted browsers | chat 35, tasks 32, feed/library 52, task actions 28 PASS |
| Packaging tests | 18 PASS |
| Runtime reproducibility + web/Capacitor parity | PASS, 8 files each |

The mutation corpus here is 33 scoped mutants, not the complete release mutation programme.
The 7 skips require a separate API fixture. No full Platform CI, real database lifecycle,
release admission/certificate, physical iPhone or voice acceptance is claimed.
Browser commands use a synthetic HTTP owner. Server authority/cutover checks are separate
Nest/unit suites with mocked persistence; they are not one live DB E2E.

`prior-incomplete-run.json` preserves the failed earlier run on `7df78d1f`:
the existing cap mutation refused its setup because the cap expression had two sites.
The final implementation uses one shared snapshot; the original mutation again kills
its named proof. Final receipts restart all listed checks on the new committed SHA.
During review the actual A23 executor's 160-character title bound was also enforced
in the form/runtime/net, while historical reads retain their existing 300-character limit.

No production, retained DB, Keychain, provider/model calls, messages, grants, migrations,
OTP/YCLIENTS, iPhone, push or merge. This evidence commit does not alter product bytes.
