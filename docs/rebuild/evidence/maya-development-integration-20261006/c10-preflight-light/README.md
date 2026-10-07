# C10 preflight light evidence — 2026-10-07

Prepared follow-up from `3f0dd856`; full unit/types/HTTP/PG/browser validation is pending while website owns the local heavy slot.

- `driver-tests.log`: six actual Node tests at 256 MB, including one owned 64 MB child that ignores TERM and is killed after the bounded grace period. No database or listener. Run from backend: `node --max-old-space-size=256 --test scripts/c9-occupancy-proof.test.mjs`.
- `response-examples.json`: synthetic pure BI/Lifecycle C9 AgentResult validation and multi-currency display bounds. Exact source timestamps retained. First ad hoc PARTIAL BI input without limitations was rejected; the fixture was corrected, the guard was not changed, and the negative remains observed. No HTTP or model.
- `source-date-cases.json`: source precision, DST fold and historical second-offset cases from the actual formatter. Durable Jest regressions are in `src/common/source-instant-text.spec.ts`; the full Jest runner has not run for this follow-up.
- `syntax-check.json`: TypeScript transpile diagnostics for nine changed files. This is not dependency resolution or a production typecheck. Browser probe/driver JavaScript syntax was also checked with Node.

Independent review closed three P2 preparation issues: canonical fingerprint prefix, owned launcher cancellation cleanup, and visible date precision. New background authority, C6 execution, canonical MeasurementRevision, real-model/provider acceptance and C10 closure are not claimed.
