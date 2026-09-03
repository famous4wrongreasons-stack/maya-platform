# CYCLE 06 — PACKAGE 5 WAVE 6 CANONICAL OWNER DECISION

Status: **APPROVED — owner mismatch resolved; resume cutover gates**

Date: 2026-09-04. The user accepts checkpoint `0577f472` and explicitly
supersedes the previous requirement to route A30 through Canonical Action
Ingress / Action Engine. The accepted runtime at `bf21d9d6` is unchanged.

```text
A30 CANONICAL EXECUTION OWNER: AC6 MAINTENANCE COORDINATOR
```

The approved flow is central/versioned retention policy → AC6 coordinator →
MaintenanceRun → bounded/claimed MaintenanceItemClaim → canonical A30 executor
→ deletion only after the exact Policy V1 predicate is rechecked. Cron and
schedulers initiate runs and never own deletion. Automatic runs do not fabricate
ActionExecution records. No additional ingress/engine integration is introduced.

The existing Wave 6 ratchet already classifies the coordinator as canonical.
Its production-wide direct-delete scan, exact single-coordinator exception,
run/claim/manifest/fence checks, initiator delegation, closed allowlist and
fail-closed Python/AI cleanup checks remain unchanged. Deployment expectations
now require the AC6 owner rather than Action Engine registration for A30.

Production build packaging includes the already accepted auth-retention and
fail-closed AI-maintenance CLI sources in tsconfig.preflight.json, so a release
installed without dev dependencies has immutable compiled entrypoints. This
changes packaging only; policy, executor, initiators and CLI semantics are
byte-identical to bf21d9d6. The compiled production auth entrypoint is
`node dist/scripts/auth-retention-cleanup.js`; never execute it for cutover smoke.

All six classes, standard auth 30 days, short-lived auth 24 hours, strict
expiresAt/consumedAt/revokedAt predicates, rate-limit windowEndsAt and quarantine
expiresAt remain unchanged. Central policy/version, server clock, item bounds,
durable claims, tenant authority and audit evidence remain mandatory.

The previous owner-mismatch STOP is resolved. Current preflight and mandatory
deployment gates must still pass sequentially. Runtime Gate, Shadow 6/6 and
the executable proof are not repeated. Production verification is structural
and read-only, without real auth deletion or provider writes for proof.

After successful cutover, report the exact AC6 owner and 6/6 waves, but do not
declare Package 5 complete. Final Package 5 and Final Chapter 6 gates remain
separate cycles. No Wave 7 or Chapter 7. Preserve the 17 pre-existing test DBs.
