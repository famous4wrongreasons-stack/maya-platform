# CYCLE 06 — PACKAGE 5 A18 CLIENT CHANNEL LINK FOUNDATION

Status: **LOCAL FOUNDATION PASS — PRODUCTION MIGRATION GATE NEXT**

Date: 2026-09-04. Schema decision accepted at `55380a90` plus the user's explicit
ClientChannelLink Schema V1 approval. This is final-gate remediation, not Wave 7.

## Implemented scope

Exactly one model, `ClientChannelLink`, and migration
`20260904090000_a18_client_channel_link_v1`. Existing Client/account/CRM identity,
consent, A26 and A30 schema semantics are unchanged. The migration creates an
empty table and its constraints/guards; it contains no backfill or business DML.

The model implements tenant-qualified Client and predecessor FKs, one active
provider subject via partial unique index, unique verification/revocation
receipt identities and successor history. Verification fields cannot change;
revocation is one-way and historical deletion is rejected. Self/stale/foreign
predecessors and silent reassignment fail closed. Times are explicitly UTC,
including databases whose session timezone is not UTC.

The canonical link service accepts an opaque proof only. Client and provider
subject come from its server verifier dependency; caller fields cannot replace
them. It supports transactional exact retries, guarded guest resolution,
revocation and atomic verified rebind with rollback on failure. It creates no
Client, account or consent fact. No default/permissive verifier is supplied.

The service is not registered as a public production linking endpoint by this
foundation step. PostgreSQL proof uses a clearly marked **synthetic verifier**
inside an isolated database. This proves storage, command-boundary rejection and
transaction behavior; it does not claim a production Telegram/PWA challenge has
been executed or that A18 consent remediation is already complete.

## Local evidence

- PostgreSQL adversarial/concurrency foundation proof: **32/32 PASS**.
- Separate empty-database replay: **71 migrations PASS**, link rows **0**;
  Prisma schema diff: **NONE**.
- Prisma validate: PASS.
- Targeted command-boundary and architectural ratchets: **24/24 PASS**.
- Application typecheck and script typecheck: PASS.
- Project ESLint: PASS after removing two unnecessary `async` keywords in the
  synthetic proof verifier; no semantics change.
- Immutable release-preflight script build: PASS.

Proof includes guest Client without User, forged request Client/subject,
unverified/phone-only proof, cross-tenant Client/context, same and competing
concurrent claims, identity/transport version spoofing, exact retry/restart,
JSON-null proof bypass, immutable history, revocation and re-link, failed rebind
rollback, atomic rebind retry and serialization of consent-authority reads with
revocation. Raw negative fixtures are first proven valid in a rolled-back
transaction so unrelated constraints do not create false-positive proof.

The proof found and fixed two implementation issues before PASS: concurrent
unique-conflict recovery and database/session timezone conversion. Neither
required a new business decision, schema model or weakened invariant.

Reproducible proof: `maya-saas-backend/scripts/package5-a18-client-channel-link-proof.ts`.
It refuses any database outside `127.0.0.1:55487/maya_c06_a18_link_v1_*`.
`--replay-only` verifies the post-migration empty binding table without fixtures.

## Production boundary / next steps

No production schema migration, runtime deployment or consent/trial request has
occurred at this source checkpoint. Next is the authorized migration gate with
exact expected pending set `{20260904090000_a18_client_channel_link_v1}`, old
baseline drift NONE, health/readiness, migration-history integrity and additive
DDL verification. Apply is authorized only after all checks pass. Post-apply
verification must show pending 0, approved-schema drift NONE and link rows 0.

After green migration, continue A18 consent remediation and both A26 routes plus
physical-delete compensation. Then targeted proof, mandatory deployment gates,
read-only production verification and automatic full 13-family Final Package 5
Gate. Waves 1–6 remain accepted; no Chapter 6 completion is declared.

All owned PostgreSQL proof processes/clusters were stopped and removed. The 17
historical databases were untouched. No watcher, Playwright or Chrome process
was launched. Production business/provider mutations for proof: **0**.
