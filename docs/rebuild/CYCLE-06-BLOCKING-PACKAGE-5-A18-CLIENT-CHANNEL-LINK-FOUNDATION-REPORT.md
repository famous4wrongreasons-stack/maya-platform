# CYCLE 06 — PACKAGE 5 A18 CLIENT CHANNEL LINK FOUNDATION

Status: **FOUNDATION/APPLY PASS — A18 FIRST-LINK AUTHORITY VERIFIER DECISION REQUIRED**

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

## Production migration: PASS / APPLIED

Gated and pushed source: `ae3f743844430b1a5fa869da4ce075e16fa648ce`.
The migration candidate used a fresh production dependency install and generated
Prisma client, with source/schema/migration hashes pinned in its manifest.
Immediately before apply, the expected pending set was exactly
`{20260904090000_a18_client_channel_link_v1}`. The live database matched the old
production schema; health/readiness were PASS. Migration-history preflight was
green. The additive migration was then applied under the user's authorization.

Post-apply: **pending 0; drift NONE against the approved candidate schema;
ClientChannelLink rows 0; backfill 0**. Migration checksum, active-subject partial
unique index, enabled lifecycle trigger and three RESTRICT foreign keys were
independently verified using read-only queries. There are 71 repository migrations
and 74 applied records including the three previously acknowledged migrations.

Live runtime remains `20260904-c06-p5-wave6-cutover-3b545671`; PID `1470307`,
restart count 0. The live release symlink and its immutable schema artifact were
not replaced. The new schema is tracked in the separate immutable candidate
`/opt/maya-saas/schema-releases/20260904-a18-client-channel-link-ae3f7438`.
Production migration verification did not restart the service or invoke any
business/provider command. Health/readiness stayed green after apply.

Machine-readable evidence:
`evidence/package5-a18-link-foundation-production-apply.json`.

## Continued remediation and exact STOP

The approved migration was not treated as an automatic stopping point. The next
A18 runtime-authority review traced Client registration, account lookup, deployed
Python authentication/consent and all verifier references. It found no production
implementation or approved evidence source for the first-link verifier's
**exact Client authority** input. Channel authentication alone cannot supply it.

The one production `Client.userId` reference is not verification provenance.
The deployed Python session issuer can obtain a Telegram chat id by matching a
phone. Signed Telegram authentication proves channel control only. The new link
table correctly contains no historical or heuristic backfill. The only complete
verifier implementation is the explicitly synthetic, isolated proof fixture.

This is a missing first-link trust-source decision, not another schema model or
a request to reapprove the completed binding/storage invariants. The approved
proposal's “Verification evidence and owner boundary” expressly rejects phone,
operator-selected Client, a receipt digest or bridge secret alone. Implementing
a signer around such an input would not establish Client authority. An endpoint
that rejects every first link would not constitute the requested verified PWA/
Telegram consent-success proof either.

Accordingly, the user's Stage 4 instruction **“new business/schema blocker →
STOP”** applies. No A18 consent runtime workaround, A26 edit, runtime deployment
or final-gate rerun was performed. The three accepted bypass paths remain open.
The concrete decision and source evidence are in
`package5-final-a18-first-link-verifier-decision.md` and
`evidence/package5-a18-first-link-authority-blocker.json`.

Once the exact Client-authority source is approved, continue the same A18/A26
remediation, targeted proof and mandatory deployment gates. After green runtime
deployment/read-only verification, automatically restart the full 13-family
Final Package 5 Gate. Waves 1–6 remain accepted; no Chapter 6 completion is declared.

All owned PostgreSQL proof processes/clusters were stopped and removed. The 17
historical databases were untouched. No watcher, Playwright or Chrome process
was launched. Production business/provider mutations for proof: **0**.

```text
A18 CLIENT CHANNEL LINK SCHEMA V1: IMPLEMENTED
NEW SCHEMA MODELS: 1 — ClientChannelLink
A18 LOCAL FOUNDATION PROOF: PASS — 32/32
A18 TARGETED CHECKS: PASS — 24/24
SCHEMA FOUNDATION/APPLY: PASS
PENDING MIGRATIONS: 0
POST-APPLY DRIFT: NONE
FAKE CLIENT CHANNEL LINKS BACKFILLED: 0
CLIENT CHANNEL LINK DURABLE IN PRODUCTION: YES
FIRST-LINK CLIENT AUTHORITY VERIFIER: BLOCKED — TRUST SOURCE DECISION REQUIRED
A18 END-TO-END CONSENT REMEDIATION: NOT COMPLETE
A26 REMEDIATION: NOT STARTED — BLOCKERS RETAINED
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL — PRIOR VERDICT; NOT RERUN
PACKAGE 5 COMPLETE: NO
PACKAGE 5 WAVES COMPLETE: 6/6
WAVES REOPENED: 0
REAL PRODUCTION BUSINESS/PROVIDER MUTATIONS FOR PROOF: 0
PRODUCTION SCHEMA MIGRATIONS APPLIED THIS CYCLE: 1
PRODUCTION RUNTIME CUTOVER THIS CYCLE: NO
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
PRE-EXISTING LOCAL TEMP/TEST DATABASES: 17
OWNED BY THIS CYCLE: 0
OWNED TEMP PROCESSES STILL RUNNING: 0
BACKGROUND WATCHERS LEFT: 0
OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0
OWNED TEMP DATABASES REMAINING: 0
```
