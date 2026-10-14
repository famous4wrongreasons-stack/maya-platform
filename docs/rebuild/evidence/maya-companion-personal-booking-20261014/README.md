# Companion personal booking evidence — 2026-10-14

Exact tested candidate: `26cd94b4ace838dc1cc692c0d8b521c6d7435fb5`. This archive is scoped local acceptance,
not a release certificate. Product predecessor: `610f98ec`; test-only final commit:
`26cd94b4`; emitted payload hashes are equal across these two commits.

- `summary.json`, `logs/`, `runner.py`: 13 fresh commands on clean final HEAD.
- `browsers/`: final chat/navigation/voice/schedule receipts; fixtures are synthetic.
- `personal-http/manifest.json`, `runner.mjs`: fresh clone, isolated test-only
  database, exact current AppModule + emitted React, prepare/restart/resume and cleanup.
- `personal-http/RESULTS.json`: safe selected observations from the original receipts.
  Scripted model and owned test provider, not real business/model acceptance.
- `screenshots/`: synthetic selected visuals, including a deliberately pending
  UNKNOWN result after restart. Scrollable form screenshots show a viewport, not
  the entire form or a claim that every field fits simultaneously.
- `development/`: failed outer-sandbox run, pre-settled-viewport failure and earlier
  scoped summary; none is counted as a final pass.
- `MANIFEST.json`: original/archived hashes, source paths, omitted raw artifacts
  and untouched owner design hashes.
- `SCAN.json`: scoped source/text/PII scan and reviewed synthetic false positives.

Counts: runtime 828 PASS / 7 SKIP; carrier 195; browser 333; NS-1 16;
packaging 18; full-stack prepare/resume 2 PASS plus 15 layout/focus checks.
Provider response-loss proof persisted exactly one synthetic ledger row and
performed zero additional dispatches after restart. All owned proof DBs stopped.

The whole RenderResult and existing close/return/authority owners remain intact.
See [checkpoint](../../MAYA-COMPANION-PERSONAL-BOOKING-CHECKPOINT-20261014.md)
for the separate calendar/free-window gaps and exact acceptance limits.
