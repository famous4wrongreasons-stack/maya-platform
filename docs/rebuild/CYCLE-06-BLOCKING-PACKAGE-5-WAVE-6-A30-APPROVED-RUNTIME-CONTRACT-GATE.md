# CYCLE 06 — PACKAGE 5 WAVE 6 A30 APPROVED RUNTIME CONTRACT GATE

Status: **PASS — Policy V1 explicitly approved; runtime/schema contracts sufficient**

Date: 2026-09-04. Accepted checkpoint: `178b39f2` plus the user's explicit Auth
Retention Policy V1 approval. This report supersedes the earlier contract STOP.
The existing POST-WAVE-5 remainder, Authority Gate AC6/A30, D1-A…D7-A and Common
Foundation remain authoritative. Waves 1–5 are not reopened.

## Exact scope and policy

Wave 6 contains **A30 only**, with these **six AC6 classes**:

| Class | Subject | Exact V1 predicate at server-derived frozen evaluation time T |
| --- | --- | --- |
| purge_auth_sessions | AuthSession; dependent AuthRefreshToken cascade only | expiresAt < T − 30 days OR revokedAt < T − 30 days |
| purge_phone_auth_codes | PhoneAuthCode | expiresAt < T − 24 hours OR consumedAt < T − 24 hours |
| purge_email_auth_codes | EmailAuthCode | expiresAt < T − 24 hours OR consumedAt < T − 24 hours |
| purge_auth_flow_states | AuthFlowState | expiresAt < T − 24 hours OR consumedAt < T − 24 hours |
| purge_auth_rate_limit_buckets | AuthRateLimitBucket | windowEndsAt < T − 24 hours |
| purge_ingestion_quarantine | IngestionQuarantine | expiresAt < T |

The comparison is strictly `<`; exact-boundary and null terminal timestamps do
not qualify. Old creation time alone never qualifies a row. Expiration,
consumption and revocation are exactly the approved terminal predicates.
Refresh tokens are never selected for independent deletion; active-session
replay-detection history remains intact.

Auth policy key is `package5.a30.auth-retention`, version 1. Quarantine uses
`package5.a30.quarantine-expiry`, version 1, preserving its declared row expiry.
The rules and map are frozen at runtime. The V1 policy digest is pinned at
`9fc9734d27a82ce042ec46eb26b454329749ea877811733dbc70c06bf799f9e7`.
A change requires a reviewed version; old environment duration overrides have
no authority. No tenant-configurable retention or future legal override is added.

## Authority, ownership and boundaries

AC6 owns these bounded system-maintenance operations. Automatic runs do not
fabricate ActionExecution records. There is no new HTTP/AI human command
endpoint. The internal coordinator accepts only class and a batch reduction;
clock, deadline, predicates, targets, tenant, scope, policy version and limits
cannot be supplied as request authority.

- Trusted standalone maintenance is platform scope, including legitimate
  null-tenant auth/quarantine rows.
- Existing system-tenant context derives an exact tenant scope. Human,
  public/auth-principal and unresolved request contexts fail closed.
- Branch, staff, Client and User selectors are not added to maintenance
  authority. Client profile/consent and identity holds remain untouched.
- A tenant cannot resume a platform or another tenant's envelope; a platform
  handle cannot silently widen a tenant envelope.

The local candidate connects both initiators to
`Package5Wave6MaintenanceService`: auth CLI → auth facade → coordinator, and
quarantine scheduler → EventStore maintenance adapter → coordinator. The five
legacy parent deletes and unbounded quarantine delete are removed locally.
The sole allowlisted deletion site is in the coordinator's checked transaction.
Event ingestion, DomainEvent acceptance and recovery fact/projection ownership
remain unchanged; only the A30 purge method in EventStore is replaced.

The seven write branches of `ai-runtime-maintenance.ts` are removed; execute
fails before opening the database, while dry-run remains a reader. Both
committed Python `rotate_old_pii` implementations fail closed before any SQL.
Their Client and certificate anonymization classes are not added to the
allowlist. The existing scheduler caller can no longer acquire mutation
ownership through those functions. There is no mutating legacy fallback.

## Durable identity, limits and concurrency

One run binds one class, one scope, policy/version, cutoff, server minute
window and fixed batch budget. The default is 1,000 physical row effects;
initiators may only reduce it. The common schema's hard ceiling remains
10,000, but larger/manual envelopes are not enabled by this policy version.
Session and every dependent refresh token count against the same run budget.
Oversized or newly unclaimed cascade effects fail closed.

Preparation fixes a bounded manifest in immutable per-run item identities and
a manifest hash. Item hashes include run identity, kind, row id and creation
(or quarantine receipt) timestamp; no raw subject data is stored. Repeated
preparation uses the same run. A restarted initiator finds an unfinished older
window and resumes its frozen cutoff, budget and manifest; it does not create
replacement work with a new deadline. Changing that pending run's budget fails.
Shadow reads the same durable manifest when such a run already exists.

A row-locked lease has an unpredictable fencing token and expiry. Takeover
increments each unfinished claim generation; the former token cannot commit.
Class advisory locks provide consistent ordering across tenant/platform runs.
The executor locks exact claimed row incarnations, rechecks tenant and current
terminal eligibility, validates all cascade claims, deletes and writes every
terminal item outcome plus run finalization in one transaction. Missing or
renewed items are SKIPPED. Overlapping runs can record distinct bounded
attempts, but exactly one may record the physical deletion as successful.

Policy/authority/limits, item identities and terminal outcomes are protected by
the existing Common Foundation constraints and triggers. Only policy,
non-PII hashes, counters and stable outcome codes survive. No fake historical
facts or deleted PII are copied into maintenance audit.

## Schema and provider boundary

No additional schema or migration is needed. The approved unique A30
MaintenanceRun/MaintenanceItemClaim models are already applied in production
under migration `20260903120000_package5_common_authority_foundation`, checksum
`4166dcdaa50d88b715617c6a4018cb22db7e6713c09c76107d1130d60cfb0244`.
Read-only production verification confirms pending 0, drift NONE and the five
maintenance guards. The local proof clean-replays all 70 repository migrations.
No schema apply or historical backfill is performed in this cycle.

All effects are local transactional effects. No provider request or write is
needed; UNKNOWN and provider reconciliation are not applicable. Tenant hard
delete, business-value cleanup, source evidence and consent facts are outside
the allowlist. Packages 1–4, P02/P03 holds and D1-A…D7-A are preserved.

## Final-wave scope accounting

| Wave | Families | Owner boundary |
| --- | --- | --- |
| 1 | A22, A23 | Accepted production canonical owners |
| 2 | A16, A25, A26 | Accepted canonical/protocol owners |
| 3 | A15, A17, A18 | Accepted command/source owners |
| 4 | reduced A27, A28 | Accepted canonical owners |
| 5 | A29, A31 | Accepted correction and fact-plane owners |
| 6 | A30 | Six AC6 classes; non-allowlisted legacy cleanup fails closed |

The set equals the exact 13-family Entry Gate inventory, missing 0, extra 0.
After the planned Wave 6 cutover, no family needs another implementation wave.
The candidate has no production-reachable direct A30 maintenance delete owner
outside the narrow AC6 coordinator. This is local readiness, not a claim that
production has already switched. Production remains 5/6 waves until its separate
cutover. No Wave 7 or Final Package 5 Gate is created by this report.

```text
PACKAGE 5 WAVE 6 RUNTIME CONTRACT GATE: PASS
WAVE 6 FAMILIES: A30
WAVE 6 ACTION CLASSES: 6
AUTH RETENTION POLICY V1: APPROVED
ADDITIONAL SCHEMA REQUIRED: NO
SCHEMA FOUNDATION/APPLY: EXISTING APPROVED FOUNDATION REUSED; NO NEW APPLY
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13
PACKAGE 5 FAMILIES REMAINING AFTER WAVE 6: 0
```
