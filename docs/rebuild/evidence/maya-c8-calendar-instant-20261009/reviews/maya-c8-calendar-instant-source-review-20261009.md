# Independent C8 calendar instant source review — 2026-10-09

Verdict: **QUALIFIED_NO_REMAINING_SOURCE_BLOCKERS**.

Reviewed uncommitted candidate atop `5babbc22dd5980c8df4bc3eadf844da4ec1679df`: four production files, six constructor sites in four scripts, and three component specs. Exact byte hashes are in the adjacent JSON. No source edits, tests, services or network were performed by this reviewer.

The C8-local inverse checks every integral-second offset within the explicit ±24h support domain, preserving local seconds and caller milliseconds. It refuses gaps/folds rather than choosing a shift/earlier/later policy. Gregorian AD1..9999, month-end and elapsed-day boundaries remain explicit. The bounded256 cache contains only pure whole-second inversions or refusals, never source/actor authority.

The producer catches only the typed calendar error and terminalizes the same PENDING lease via existing fenced unavailable. Database, configuration and fence failures remain errors. The PUBLISHED dormancy guard reads the canonical governed policy under the existing lock, checks immutable input feasibility and withholds current use without modifying saved values/history. Existing recursive references and depth bound propagate this refusal; manual constructor wiring reuses the canonical reader without a C8Sources/store cycle.

The authored specs exercise actual methods with synthetic SQL/ACL/configuration ports. Earlier overlapping gate reports (RED10/7, GREEN24, GREEN35, broad328/20) are preserved and not summed or attributed to the final new store spec. Final consolidated validation was pending when reviewed.

Limitations:

- No HTTP/PG, encryption integration, real SQL fence/rollback, DI boot, restart or deployment acceptance.
- The parent-owned ~108–115ms single cold inverse benchmark does not qualify maximum cohorts, dependency fan-out or transaction/lease latency;5000-row Opportunity paths and256-entry cache remain a performance evidence boundary.
- Pre-admission value/prediction callers may refuse before any PENDING row exists. Published historical tightening here covers dormancy and existing dependencies, not every value/prediction horizon.
- No all-zone/all-history claim, new DST preference, policy/schema change, historical rewrite, named cohort, real model quality or full MAYA/C10 completion. Original81 evidence remains unchanged.

Canonical basis: P01 foundation lines11/21; limited-data decision lines25/34; current closed policy window/dormancy schema lacks disambiguation. A refusal enforces the existing promise without inventing a new selected instant.
