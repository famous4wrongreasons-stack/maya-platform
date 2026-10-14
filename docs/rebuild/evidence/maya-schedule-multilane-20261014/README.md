# Interleaved masters in SCHEDULE — evidence

Exact tested code: `9208d779df7f8c0d94f696e2011db66c43bfadee`.
Branch: `codex/maya-local-crm-setup-20261010`.
Local development after C9. No release certificate, provider or production acceptance.

- [Checkpoint](../../MAYA-SCHEDULE-MULTILANE-CHECKPOINT-20261014.md): root cause,
  bounded correction, current results and remaining work.
- `RESULTS.json`: counts, actual source's safe labels/order and mutation outcomes.
- `summary.json`, `logs/*.txt`, `runner.py`: full runtime/carrier, builds/ratchets,
  packaging and four browser suites on this clean committed candidate.
- `source/`: fresh AppModule/HTTP/isolated PostgreSQL with emitted runtime/React;
  four modes (personal, empty journal, one master, interleaved three masters).
  The carrier check uses actual React markup; it is **not Chrome over that backend**.
- `browsers/`, `screenshots/`: emitted React/runtime in Chrome with finite synthetic
  HTTP interception and external-request refusal. This is separate from source/.
- `mutations/`: baseline 7 PASS; original grouping restored — 3 FAIL / 4 PASS;
  restored candidate — 7 PASS. One targeted mutation, not the full release corpus.
- `development/`: actual source before correction fails at mode=prose, plus unit
  red/green diagnostics. Historical developmental receipts do not replace final ones.
- `MANIFEST.json`: original/copy SHA-256, size and omitted raw observations.
  Text copies remove trailing whitespace only; originals are unchanged.
- `SCAN.json`: bounded secret/PII scan of this change and copied text, with reviewed
  synthetic fixtures. This is not a scan of all historical Git data.

Runner paths record exactly what ran on this Mac. For another execution choose new
output paths and a clean committed candidate; they are not portable CI commands.
No databases, environments, real customer data, keys or unfiltered auth observations
are included. Both disposable PostgreSQL clusters are stopped. Source assertions
retain roles, entry identities and Appointment rows unchanged for journal reads.

Screenshots were reviewed at 320px/393px and enlarged text; layout remains scrollable,
controls preserve sealed order, and repeated master labels stay with their entries.
PWA/Capacitor byte equivalence passed; native installation/device acceptance was not run.
