# CYCLE 06 — A18 Client Link Challenge Foundation

Status: **FOUNDATION + PRODUCTION MIGRATION PASS — RUNTIME REMEDIATION BLOCKED BY NEW AI ONBOARDING BYPASS**

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

## Production migration applied

The expected-only migration gate passed from pushed source
`77c611c79248fce887c6aa22fb817958ef672c8d`. The candidate is
`/opt/maya-saas/schema-releases/20260904-a18-client-link-challenge-77c611c7`.
Pre-apply drift was NONE against the already-applied ClientChannelLink schema
artifact from `ae3f7438`, not against the older immutable runtime schema.

`20260904100000_a18_client_link_challenge_v1` was applied successfully at the
2026-09-04 09:22 UTC verification. The database has 75 finished migration records
(72 repository migrations plus 3 previously acknowledged records), pending 0,
and post-apply drift NONE against the approved candidate. Read-only verification
found the exact 14 columns, both enabled lifecycle/outcome triggers, three
RESTRICT FKs and required uniqueness. ClientLinkChallenge and ClientChannelLink
row counts remained 0; no historical facts were backfilled.

Health/readiness remained PASS. The production runtime stayed at
`20260904-c06-p5-wave6-cutover-3b545671`, PID 1470307, NRestarts 0; it was neither
replaced nor restarted. This cycle applied one authorized schema migration and
performed zero real production business/provider mutations for proof.

## Continuation and STOP

Work continued into A18 runtime alignment after apply. The undeployed candidate
has real Maya-session / signed Telegram channel authentication, verified-link
consent authority with optional User and local PostgreSQL proof 21/21 PASS.
It does not yet replace the Python `/api/consent/submit` initiator. Its production
cold-start trusted Client resolution has not been proved by synthetic fixtures.

While tracing the shared A26 bootstrap callers, read-only production inspection
confirmed another reachable bypass: AI onboarding confirmation directly mutates
A28 provider/service/availability state and A26 branding after tenant creation,
and its compensation resets TrialActivation and physically deletes the tenant.
The user's explicit new-bypass STOP boundary applies before runtime deployment.
See `CYCLE-06-BLOCKING-PACKAGE-5-A18-CHALLENGE-APPLY-AND-AI-BYPASS-STOP-REPORT.md`.

All owned PostgreSQL proof clusters/processes have been stopped and removed.
No watchers/browsers were started. The 17 pre-existing databases were untouched.
Waves 1–6 remain accepted. No Wave 7, Chapter 7, full final-gate rerun or automatic
Chapter 6 completion occurred.
