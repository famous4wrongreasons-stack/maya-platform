# Authentication Retention Maintenance Runbook

## Canonical Policy V1

Package 5 Wave 6 implements the explicitly approved central policy
`package5.a30.auth-retention`, version 1. It is a bounded AC6 maintenance
operation with durable MaintenanceRun / MaintenanceItemClaim audit. Automatic
runs do not fabricate ActionExecution records.

| Class | Eligible at frozen server evaluation time T |
| --- | --- |
| AuthSession | expiresAt < T − 30 days OR revokedAt < T − 30 days |
| PhoneAuthCode, EmailAuthCode, AuthFlowState | expiresAt < T − 24 hours OR consumedAt < T − 24 hours |
| AuthRateLimitBucket | windowEndsAt < T − 24 hours |
| AuthRefreshToken | Never independently selected; only a claimed eligible parent session's cascade |

Null terminal timestamps and exact-boundary timestamps do not qualify. Old
creation time alone does not qualify an active record. Consumed refresh-token
history belonging to an active session remains intact for replay detection.
No users, memberships, tenants, provider identities, consent or business audit
facts are deleted. Quarantine is a separate AC6 class using its declared expiry.

The policy is fixed in reviewed versioned code. AUTH_RETENTION_SESSION_DAYS,
AUTH_RETENTION_CHALLENGE_HOURS, AUTH_RETENTION_RATE_LIMIT_HOURS and the former
environment batch override no longer choose policy. Changes require a reviewed
new policy version; tenant-specific overrides are outside Chapter 6.

## Bounded operation

The CLI accepts no tenant, target, clock, cutoff or predicate selector. It is a
trusted platform initiator across tenant and legitimate null-tenant protocol
rows. Each class receives a separate durable run. Batch default is 1,000;
`--batch-size` may reduce it to 1–1,000. Each session AND each cascaded token
consumes a physical row slot. Oversized or unclaimed cascades fail closed.

Preparation commits only a bounded, hashed manifest and immutable run policy.
The executor claims a fenced lease, rechecks current eligibility under row
locks and commits deletion, terminal item outcomes and run finalization
atomically. Retry returns the same outcome. A process restart resumes a pending
older window using its frozen manifest, cutoff and limits. A changed batch
request cannot change an existing unfinished run's budget.

A crash before commit rolls back deletion. After lease expiry, another worker
may resume; the old token is fenced. A renewed/absent target is SKIPPED. There
is no legacy delete fallback and no provider mutation or UNKNOWN outcome.

## Commands and output

```bash
npm run auth:cleanup
npm run auth:cleanup -- --dry-run --batch-size 100
```

Dry-run is the default. It uses a read-only transaction and returns bounded
hash manifests, policy/version and cutoff metadata without creating runs,
claims or business effects. Do not interpret a bounded manifest as a total
backlog count.

A separately authorized destructive operation may use:

```bash
npm run auth:cleanup -- --execute --batch-size 100
```

Output contains `policyVersion`, `dryRun` and five `runs`. Execution results
contain durable run id/state, deleted/skipped counts, per-kind counts and
`replayed`. Replayed counts describe the original outcome, not another deletion.
A RUNNING result means another worker owns the current lease. No unbounded
retry loop is enabled. Errors fail closed and exit nonzero.

## Production boundary

The Wave 6 implementation checkpoint is **safe-local proof only**. Production
runtime cutover and real destructive apply are separate authorized boundaries.
Do not run execute to prove deployment. Use read-only structural checks and
health/readiness for cutover verification. The 17 historical Chapter 6 test
DBs are unrelated to runtime retention and must not be removed by this command.

See the Wave 6 approved Runtime Contract Gate and Safe Local Convergence Report
for exact policy approval, proof and remainder status.
