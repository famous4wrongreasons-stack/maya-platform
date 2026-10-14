# Companion voice sheet: scoped local evidence

Tested product candidate `b34e3513801a55a98489603c60e798453d2f03dd`.
Branch `codex/maya-local-crm-setup-20261010`.
This is local presentation/integration evidence, not release certification.

- `summary.json`: 21 fresh commands, exact clean/unchanged candidate and exits.
- `runner.py` and `logs/`: executed scrubbed-environment runner and full output.
- `browsers/`: seven final emitted-payload receipts, intercepted synthetic HTTP.
- `screenshots/`: voice sheet states/layout, synthetic audio/data only.
- `MANIFEST.json`: source/archive hashes, sizes, reference hashes, omitted screenshots.
- `development/`: three harness failures and corrected run; not final receipts.
- `SCAN.json`: new-material secret/PII pattern scan; synthetic fixtures reviewed.

Browser checks: {"chat-browser": 35, "ideas-browser": 68, "navigation-browser": 123, "task-actions-browser": 54, "tasks-browser": 32, "voice-browser": 56, "workspace-browser": 116}; total 484.
Runtime 828 PASS / 7 SKIP; carrier 194 PASS; scoped backend 355 PASS / 23 suites;
existing scoped mutations 79 killed with green baselines; packaging 18 PASS.
PWA/Capacitor parity: 8 files, existing endpoint substitution only.

Audio APIs are replaced before emitted application code, not delegated to real
capture. No retained DB, Keychain, real microphone, providers or production used.
No native build/install, paid model call or full release certification is claimed.
