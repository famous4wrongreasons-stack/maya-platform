# Internal journal service labels — evidence

Exact code candidate: `91916d52903ac8f18fb8df30ead2b8d3a7aef0f0`.
Branch: `codex/maya-local-crm-setup-20261010`.
Scope: local source/read correction; no release certification or production effects.

- [Checkpoint](../../MAYA-JOURNAL-SERVICE-NAMES-CHECKPOINT-20261014.md): behavior, limits and provenance.
- `RESULTS.json`: safe case names, 508 unit cases, 3 source scenarios, 4 killed
  mutations, 14-case restored baseline (a repeat), actual sealed titles/refs.
- `run-manifest.json`: commands, timestamps, log hashes, isolated DB lifecycle.
- `runner.mjs`: exact executed isolated-clone runner; it requires a clean committed
  source and fresh output directory. Its fixed local paths are provenance, not a
  portable CI entry point. For a repeat, choose a fresh disposable output path.
- `logs/*.txt`: complete safe diagnostics, including deliberately red mutations.
- `development/*`: prior attempts, explicitly superseded by the exact final run.
- `MANIFEST.json`: original and archived byte hashes, sizes and excluded raw receipts.
- `SCAN.json`: bounded secret/PII pattern review; no claim about all repository history.

Raw source observations include synthetic envelope/auth-related handles; only their
needed outcomes are retained here. No PG cluster, real client data, keys, tokens,
environment files or raw production material is archived. Original files unchanged.

The actual source test boots AppModule/HTTP/PostgreSQL and consumes its envelopes
with the emitted runtime/React renderer. It is not a real-provider or live-browser
test. The supplementary availability suite uses mocked transport under the same
loopback-only OS fence; exact command recorded in RESULTS. Previous release/browser
receipts do not substitute for current results.
