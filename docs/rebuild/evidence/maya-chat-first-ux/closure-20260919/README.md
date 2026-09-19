# Wave 1 closure implementation evidence

These receipts are bound to `e28bfd042cb10b5a33bfda1d2e05b743cec78845`, the final runtime/test/workflow change. They are **pre-publication diagnostics**, not a waiver of the owner's final-HEAD requirement.

The commit publishing this directory is the final verification target. After publication, rerun every required local gate and collect all 19 complete Widgets Mutation artifacts and Platform CI on that exact HEAD. Do not mark an interrupted, cancelled or previous-HEAD run as the final receipt. The owner-facing closure verdict must identify those exact run IDs and SHA.

- `gate-results.json`: whole-commit-export commands, including full regression, live/BIN, actual seeded HTTP, Appointment/kernel PostgreSQL, contract and architectural gates.
- `test-summary.json`: backend 531 suites/5037 tests and live 12 suites/245 tests.
- `counterfactual-results.json`, `tx-counterfactual.json`, `inv30-counterfactual.json`: green controls and actual body-only/T-SRC-INV30 defect kills, not compiler failure substitutes.
- `python-dispositions.json`: all 64 original failing/error identifiers classified against approved retirements/authority. No Python runtime restored; 613 tests retained.
- `prepublication-ci-receipts.json`: real GitHub receipts, with each job/step conclusion. Mutation results intentionally absent until every final-HEAD shard completes.
- `contract-integrity.json`: unchanged Contract V1.1, audit and Decision Sheets 04–07.
- `local-proof-logs.json.gz`, `local-log-hashes.json`: proof output/hashes; seeded secrets and verbose raw HTTP payload logs excluded.

Source/business contracts and schema are not expanded. Three previously declared pending mutants remain pending; audit remains 0/15. Gate Wave 2 is not started.
