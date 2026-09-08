# Native consent admitted-state repair — minimal schema / owner extension

2026-09-08. **PROPOSAL ONLY — NOT IMPLEMENTED OR APPROVED.**

The owner accepted checkpoint `e9d3d3a2` and approved the security outcome:
revoke the one proven bad link, invalidate the two grants for current authority,
preserve history, and require fresh verified consent. Those business decisions
remain approved. This sheet requests only the missing durable representation and
executable mapping. Keyless retirement Option A and all R-C decisions stay closed.

## Exact gap and reuse

**EXISTING CANONICAL SECURITY/CONSENT REMEDIATION OWNER SUFFICIENT: NO.**

| Existing component | Reusable foundation | Missing boundary |
| --- | --- | --- |
| `ClientChannelLinkService.revoke` | Exact subject lock, immutable verification evidence, first revocation tuple, replay identity | Runtime verifier is closed; no incident-authorized adapter or transaction composition with consent invalidation |
| `ClientConsentFact` | Append-only grant/revoke history; tenant/Client and original ActionExecution relations | No targeted security invalidation relation; decision CHECK permits only grant/revoke |
| `record_client_consent` | Keyed Client transitions through existing A18 / AC1 Action Engine | Requires verified Client consentChannel; writes `client_command`. A security repair must not impersonate a Client revoke |
| Existing Action Engine | Durable immutable admission, execution, claims, attempts, transaction outcome and retry | No registered security consent invalidation operation |
| B35 policy / compatibility projections | Current consent and preferences gates | No invalidation predicate; revoking a link alone does not invalidate historical consent |

`AuditLog` is audit, not a typed current-consent exclusion. AC6 `MaintenanceRun`
owns specific retention operations, not consent/security corrections. CRM identity
holds and expense invalidations have different owners and targets. Their presence
does not authorize encoding this repair in arbitrary JSON or a maintenance writer.

## Recommended Option A

Extend the **existing canonical A18 consent owner** with one narrowly registered
AC1 action, `invalidate_client_consent_authority`. It composes the existing A18
link revocation owner and an append-only `ClientConsentInvalidation` relation in
one local transaction. Existing `ActionExecution` is the durable remediation run;
there is no second run model, parallel business executor or provider operation.

The proposed action uses a separate versioned security input contract. It does
not widen the accepted actor, keys or payload of `record_client_consent`.

The first authorized manifest is **one exact tenant, one exact Client, one link,
two exact grant facts and their original executions**. No selector by phone,
User/Profile association, timestamp, native build or issuer family is executable.
The read-only issuer query located evidence; it is not the mutation selector.

Rejected shortcuts: editing/deleting grant facts; fabricating `client_command`
revokes; using ordinary link revocation as implicit consent invalidation; treating
AuditLog metadata or an expired challenge as the effective-consent owner. A
link-only revocation would also overreach if a different, valid grant used that
link: invalidation must identify each proven affected fact independently.

## Exact proposed schema: one model, twelve physical fields

All fields are required. Names below are the proposed mapping, not schema edits.
Prisma reverse relation fields are virtual and excluded from physical counts.

| # | Field | Type / semantics |
| --- | --- | --- |
| 1 | `id` | String UUID primary key |
| 2 | `tenantId` | Exact affected tenant |
| 3 | `clientId` | Exact affected canonical Client; Maya User is not required |
| 4 | `consentFactId` | Exact historical grant being invalidated |
| 5 | `invalidatedLinkId` | Exact link proven in that grant's original immutable execution input |
| 6 | `actionExecutionId` | New security remediation ActionExecution, shared by both invalidation rows |
| 7 | `authorizedByUserId` | Existing authenticated platform security actor; not the affected Client's User |
| 8 | `reasonCode` | V1 allowlist: `UNPROVEN_CLIENT_PROVENANCE` |
| 9 | `policyVersion` | Integer, V1 = 1 |
| 10 | `evidenceSetHash` | Canonical immutable incident manifest digest; lowercase SHA-256 hex |
| 11 | `authorityEvidenceJson` | Closed V1 verified admission snapshot described below; immutable |
| 12 | `invalidatedAt` | Server transaction timestamp; never caller supplied or backdated |

Constraints:

- Unique `(tenantId, consentFactId)`; a fact cannot receive duplicate security
  invalidations. Index `(tenantId, clientId, invalidatedAt)` and
  `(tenantId, actionExecutionId)` for audit/projection queries.
- Composite FK `(consentFactId, tenantId, clientId)` →
  `ClientConsentFact(id, tenantId, clientId)`. Add that unique reference key to
  the existing fact table: **zero additional columns and zero fact rewrites**.
- Composite FK `(invalidatedLinkId, tenantId, clientId)` → existing
  `ClientChannelLink(id, tenantId, clientId)`.
- Composite FK `(actionExecutionId, tenantId)` → `ActionExecution(id, tenantId)`;
  exact tenant/Client FKs and `authorizedByUserId` → existing `User(id)`.
  All new relations use RESTRICT for delete/update.
- Insert guard requires the new exact admitted action class, the same tenant,
  claimed canonical target and admitted manifest. Only `grant` facts with proven
  original execution/link correspondence qualify. No generic governed-execution
  check alone. Hash, reason, version and closed authority shape are validated.
- Append-only UPDATE/DELETE rejection. Both rows must correspond to the same
  admitted manifest and revocation receipt; no partially committed repair.

No columns are added to `ClientChannelLink`, `CustomerProfile`, `ActionExecution`
or consent facts. Existing link revocation fields are reused. No new enum or AC6
class. The migration is additive: empty table, constraints, indexes and guards.
**BACKFILL: NO.** The two future invalidations are actual security events admitted
through the executor, never migration data or invented historical corrections.

## Canonical authority and immutable admission

Reuse existing authenticated platform-owner authority: current verified session,
active existing User, `role=platform_owner`, platform scope, exact explicitly
authorized incident tenant/Client/manifest. The R02 account/session checks and
existing platform-action mapping are the foundations. No fake tenant Membership,
Client/User/link creation, raw Telegram identity, SSH access or caller-supplied
actor ID is proof of that authority. A verified tenant Client is the subject, not
the security actor. An absent current actor is rejected before admission.

`authorityEvidenceJson` has a closed versioned shape: contract, policy version,
authenticated actor ID, verified platform role/scope, verified session identity
digest, verification time, owner approval reference and approval material digest.
The server derives and verifies these values; arbitrary JSON or a copied hash
cannot authenticate an actor. Credentials/session tokens are never stored there.
The snapshot survives session expiration; it is not a continuing login grant.

Freeze a canonical normalized manifest containing policy/reason, tenant, Client,
link ID and verification digest, exact challenge ID/evidence digest, sorted fact IDs
and original execution IDs/input hashes, expected revocation state, effective
consent head identities and exact canonical projection identities where present.
Include the admitted authority/approval snapshot. Use explicit typed normalization,
UTC instants and stable key/array ordering with domain separation; no raw request
JSON or transport metadata hash contract. Store sensitive manifest/evidence in
the existing encrypted execution payload and protected incident snapshot.

The exact IDs stay in that access-controlled snapshot and admission; public Git
evidence contains fingerprints only. On this incident the target and both receipt
fingerprints must match the pinned [read-only evidence](evidence/native-consent-security-owner-production.json).
An unexpected extra/missing target or changed pre-state rejects the plan; no
automatic widening. A successful retry restores its receipt before applying
first-request pre-state checks to already repaired rows.

## Atomic effect, idempotency and restart

Use existing Action Engine caller identity scoped to this incident and exact
tenant/Client. Same identity + same manifest resumes one execution/outcome;
changed manifest conflicts. The manifest is persisted at admission, never rebuilt
from a new selection on retry. Do not generate a fresh random retry identity.
Fresh authentication on retry rechecks current authority separately; it must not
replace the frozen admission snapshot or change the logical repair identity.

Before effects, reuse the existing Client-channel identity lock and consent
target locks in deterministic order for both kinds, plus the canonical execution
claim. Compose revocation through a transaction-taking internal seam of the
existing link owner, following its existing challenge transaction-composition
pattern. It must retain all current exact-subject and evidence validation.

In one serializable transaction: recheck expected evidence and authority; write
the existing revocation tuple; append both invalidation rows; refresh only exact
canonically bound profile projections; record canonical audit/attempt/outcome;
commit. The server timestamp and execution bind the two rows and revocation.
Shared current-consent readers and final CD policy checks must participate in a
compatible locking/recheck boundary. Prove the ordering; merely choosing
SERIALIZABLE does not establish an external-delivery barrier.

Unrelated valid facts, links and consent are unchanged. Do not create a profile or
infer its ownership from `userId` to refresh a timestamp. An unbound legacy profile
cannot contribute effective consent; its existence is not authority. Canonical
projections must resolve the exact Client first. This avoids adopting the invalid
issuer's association while correcting its consequences.

Crash before commit leaves no partial security effect; the durable admitted
execution resumes. Commit with lost response restores the same recorded result.
Concurrent identical requests have one winner. A second identity targeting an
already-invalidated fact cannot append another outcome: return its existing
receipt for an identical proven repair, otherwise conflict. Serialization/unique
conflicts are resolved through the same execution/receipt, not a fresh operation.

This action has **no provider or delivery effect**. An uncertain DB response is
resolved by reading the original execution and exact rows; no inverse correction,
blind new operation or cross-channel retry is allowed. Existing CD UNKNOWN and
reconciliation remain unchanged; this repair cannot unsend a prior delivery.

## Effective consent and history

Keep the existing consent ordering and equal-effective-time conflict policy.
Resolve the current consent head first, then apply its explicit invalidation.
**Do not filter invalidated facts away and fall back to an older grant.**
For these two invalidated grants, effective consent is false. Profile timestamps,
audience membership and owner approval cannot override that decision.

B35 marketing remains denied until a later independently verified, explicit keyed
grant through the existing Client command qualifies under the existing ordering
policy. Each consent kind needs its own grant; a new link alone grants neither.
Replaying the historical successful grant returns history and cannot refresh its
effective projection or erase invalidation. A later grant creates a new fact and
logical transition; it never edits the old fact or invalidation.

Current read projections and policy consumers (B6/B25/B35, CD, supported native/
PWA and the affected R06/R08 consumers) must share that rule. Privacy/audit history
is not hidden or deleted when privacy consent becomes ineffective. Original
grants, successful executions, immutable inputs and link verification evidence
remain historical facts. The new record says who invalidated authority, why and
when; it does not claim the grant never happened.

Retain this incident's fact/link/execution evidence and invalidations together.
No automatic purge, TTL or cascading deletion is introduced; existing maintenance
must not erase this pinned audit set. Session cleanup may retain only its digest
and verified snapshot in the correction record. Releasing incident audit retention
is outside this repair; no invented legal retention duration or extra purge class.

## Required proof and production ordering after approval

Synthetic PostgreSQL proof must cover exact bad link revoked; unrelated link
unchanged; original verification/grants/executions/inputs preserved; both grants
ineffective; unrelated valid consent effective; B35 denied; same-key and concurrent
retry; changed manifest conflict; crash before/after commit; wrong tenant/Client/
actor rejected; new verified grant works; old grant/keyless replay cannot restore
authority; no hidden Client/User/link/profile creation. Also prove latest-head
invalidation does not resurrect older grants and receipt replay does not reproject.

Ratchets must reject direct invalidation writers, Client impersonation for security
revoke, history rewrite, authority from User/Profile matches, missing exact
fact/link/execution scope, consent readers ignoring invalidation, and ungoverned
profile repairs. Run the approved provenance/lifecycle/125-test, identity/link,
B6/B25/B35/CD/AE, PWA/native and R06/R08 proofs plus normal mandatory gates.

Before the actual authorized production correction: encrypted backup/evidence
snapshot; exact IDs/digests and expected pre-state; verified actor; frozen canonical
admission/idempotency identity; recovery record. New schema and invalidation-aware
readers/executor must be available **before** the marker can affect live policy.
Use the documented coordinated maintenance/cutover boundary so the old issuer or
old consumers cannot run between security correction and G1/G2 release. No mixed
version may ignore invalidation, and no message/provider operation is a proof.
This deployment dependency must be proved locally before any production mutation.

The runtime cutover must not roll back to an issuer/consumer that trusts the bad
authority. Recovery is retry/forward repair with the same receipt; it does not
unrevoke, delete invalidations, auto-regrant or restore a stale live DB snapshot.
After commit, read-only exact post-state verification precedes certification and
the already approved R-C resumption. This sheet authorizes none of these steps
until the new schema/action mapping is approved and its implementation proves safe.

## Decision summary

```text
ADMITTED-STATE BUSINESS OUTCOME: ALREADY APPROVED
EXISTING CANONICAL SECURITY/CONSENT REMEDIATION OWNER SUFFICIENT: NO
RECOMMENDED OPTION: A
CANONICAL OWNER: EXISTING A18 CONSENT OWNER + EXISTING LINK OWNER + ACTION ENGINE
NEW MODELS: 1
NEW PHYSICAL FIELDS: 12
NEW ACTION CLASSES: 1
NEW AC6 CLASSES: 0
MIGRATION REQUIRED: YES
BACKFILL REQUIRED: NO
HISTORICAL FACT / EXECUTION / INPUT REWRITE: NO
CLIENT WITHOUT MAYA USER: SUPPORTED
AUTO-REGRANT: NO
NEW VERIFIED CONSENT REQUIRED: YES
R-C APPROVED SCHEMA ENVELOPE: UNCHANGED; THIS IS A SEPARATE BASELINE PROPOSAL
SCHEMA/ACTION MAPPING APPROVED: NO
PRODUCTION REMEDIATION PERFORMED: NO
COMBINED BASELINE CERTIFIED: NO
```
