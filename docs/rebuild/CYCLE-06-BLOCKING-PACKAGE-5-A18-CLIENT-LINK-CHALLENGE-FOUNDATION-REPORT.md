# CYCLE 06 — A18 Client Link Challenge Foundation

Status: **LOCAL FOUNDATION PASS — AUTHORIZED MIGRATION GATE/APPLY NEXT**

Date: 2026-09-04. The user accepted `84696bc9`, approved the exact 14-field
ClientLinkChallenge Schema V1 and TTL V1 = 600 seconds, and authorized conditional
migration apply followed by continued A18/A26 remediation and full Final Gate.

## Implementation and local proof

Exactly one new model and migration:
`20260904100000_a18_client_link_challenge_v1`. It creates an empty table,
tenant-qualified Client/outcome FKs, immutable issuance guards, exact SQL TTL
and a deferred correlated-outcome constraint. No business data or historical
challenge/link backfill. Existing ClientChannelLink fields/lifecycle are retained.

`ClientLinkChallengeService` issues a cryptographically random 32-byte opaque
token only after its server authority dependency resolves an exact Client with
evidence. The database stores the purpose/tenant-qualified HMAC only. All dates
are database-derived UTC; TTL cannot be overridden by caller or tenant config.

Consumption authenticates the channel, locks its identity and challenge, then
uses the existing canonical link writer in the same serializable transaction.
The conditional consume and link receipt commit together or both roll back.
Post-commit replay is rejected; a new service instance can retry a rolled-back
attempt. The existing standalone link/rebind receipt behavior is preserved.
No challenge cleanup or A30 allowlist/predicate change is introduced.

Local results:

- PostgreSQL adversarial/concurrency proof: **49/49 PASS**.
- Schema/owner ratchets plus existing link command checks: **33/33 PASS**.
- Separate clean replay: **72 migrations PASS**, both link/challenge tables
  empty, schema drift NONE.
- Prisma validate, application and script typechecks, project ESLint: PASS.
- Release-preflight script build: PASS.

Proof exercises actual token generation, HMAC storage, SQL guards and atomic
consumer. Resolver and channel-authenticator inputs are explicitly **synthetic
isolated fixtures**. This is not a claim that production PWA/Telegram authentication,
challenge issuance routes or A18 consent execution are already integrated.

The 49 checks include all approved boundary cases, 8 concurrent same-token
consumers, cross-provider competition, two Client tokens competing for one
subject, exact TTL and expiry after lock wait, raw-HMAC rejection, P02/P03 hold,
immutable fields/JSON-null protection and rollback before consumption and at
the deferred Client-A/Client-B correlation guard. No tests ran in production.
An initial hold fixture used an invalid reason code; it was corrected to the
existing approved value without changing the hold constraint.

Reproducible script:
`maya-saas-backend/scripts/package5-a18-client-link-challenge-proof.ts`.
It refuses databases outside `127.0.0.1:55487/maya_c06_a18_challenge_v1_*`.
`--replay-only` asserts empty challenge and link tables after clean migration.

## Migration and continuation boundary

No production migration or runtime deployment has occurred at this source
checkpoint. Next gate requires only the new migration pending, additive DDL,
health/readiness PASS and pre-apply drift NONE against the already-applied
ClientChannelLink schema candidate from `ae3f7438`. The unchanged live Wave 6
runtime's older schema file is not the current migrated schema baseline.

After authorized apply, verify pending 0, approved-candidate drift NONE,
challenge rows/backfill 0, exact guards/FKs/indexes and healthy unchanged runtime.
Then **continue**, without another schema-only stopping point, through A18
canonical consent and both A26 endpoints, their adversarial proof, required
deployment gates, read-only production verification and the complete 13-family
Final Package 5 Gate. Stop only at an applicable new blocker/gate boundary.

All owned PostgreSQL proof clusters/processes have been stopped and removed.
No watchers/browsers were started. The 17 pre-existing databases were untouched.
Real production business/provider mutations for proof: 0. Waves 1–6 are accepted;
no Wave 7, Chapter 7 or automatic Chapter 6 completion.
