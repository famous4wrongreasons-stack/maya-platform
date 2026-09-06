# B32 — Client action actor/principal contract assessment and Owner Decision

> Subsequent Owner decision: **Option A APPROVED** on 2026-09-06 after checkpoint
> `b49c5c15`. The Stage 1 assessment below remains historical. Approved wiring
> and validation: [B32 local gate](CYCLE-06-BLOCKING-PACKAGE-5-B32-PRINCIPAL-LOCAL-GATE.md).

Date: 2026-09-06. Stage 1 only. Baseline: `70f37ba18343dd279895e2c410bf70e279434302`.
**Recommendation: Option A, a bounded extension of the existing Client principal
contract using existing immutable evidence storage. No database schema change.**
This B32 option has not been approved; the earlier B31 Option A approval does
not approve it. Runtime remediation remains stopped pending that decision.

## Baseline and evidence boundary

Canonical repository: `/Users/stanislavmosin/Desktop/Projects/maya-platform`.
Work performed only in the existing clean `/tmp/maya-b29-contour`, branch
`contour/b29-remediation`. Fetch completed; HEAD and
`origin/codex/maya-brain-systemic-release-20260815` matched, divergence 0/0,
unpushed commits 0. Main checkout's 24 pre-existing status entries were preserved.

The accepted [B31 production report](CYCLE-06-BLOCKING-PACKAGE-5-B31-DEPLOYED-FINAL-GATE-STOP-REPORT.md)
and [current remainder](CYCLE-06-BLOCKING-PACKAGE-5-POST-B31-REMAINDER-CHECKPOINT.md)
remain authoritative. B29/B30/B31 production PASS is not reopened.
The committed [B32 proof](evidence/package5-b32-channel-create-authority.proof.json)
uses the actual compiled controller, bridge resolver, signed channel authenticator,
Client resolver, canonical policy/kernel and isolated PostgreSQL. Both fixtures
(Client with and without `Client.userId`) resolve the verified Client, enter
`runAsPublicTenant`, and submit `authenticated_request` with `actorUserId = null`.
Each produces one `NOT_EXECUTED` execution with `DENY / actor_required`, zero
Appointments, zero provider calls and zero immutable booking bindings. Retry
returns the same denied execution. This is the proven B32 defect.

This assessment is a source/contract reconstruction, not a new runtime or
production test. It does not claim that channel duplicates reach a production
provider. The old channel create path has also not yet been connected to B31's
immutable intent admission; the desired chain is the remediation destination,
not a claim that every link is already wired in the channel path.

## Answers to the six contract questions

1. **`actorUserId` means a Maya User identity, not necessarily staff.** In
   `TrustedActionSourceV1` it is optional. In `ActionExecution` its relation is
   `actorMembership`: `(actorUserId, tenantId)` references
   `Membership(userId, tenantId)`. It cannot contain a Client ID or chat ID.
   User activity, membership, role and tenant scope are checked by policy.
2. **Policy has a broader principal concept, but the source contract does not
   have a generic principal field.** `resolveActorPermission()` returns
   `principalKind: 'actor' | 'trusted_service' | 'client_channel'`. This is an
   in-memory discriminant, persisted as `policyEvidenceJson.actor.kind`; it is
   not an `ActionExecution.principalKind` column. `actorPolicy` is a registered
   policy rule, not caller authority. No generic `actorKind`, `initiatorType`,
   `authorityRef` or Client actor FK exists on ActionExecution.
3. **An approved Client representation exists for bounded actions.**
   `VERIFIED_CLIENT_CHANNEL` uses `ConsentChannelBinding` and a durable active
   `ClientChannelLink`, returns principal kind `client_channel`, role `client`,
   and no membership requirement. It supports a Client without Maya User.
   It is not yet a general Client-to-arbitrary-target authority contract.
4. **Preferences, habits, wanted-slot registration and channel consent use that
   representation without requiring a Maya User.** Their action target is the
   Client ID and their normalized input contains `consentChannel`. Optional
   `identity.userId` is not what authorizes their Client principal. Subscription
   purchase has a different, explicitly scoped verified-channel-to-trusted-bridge
   adapter; it is not a generic Client principal exception. Details below.
5. **`actor_required` originates in `resolveActorPermission()`, not Client
   resolution.** Appointment capabilities are outside the verified-Client
   allowlist. Their policy is `OPTIONAL_TRUSTED_SERVICE`, but its allowed service
   types exclude `authenticated_request`. With no `actorUserId`, that source
   fails `serviceAllowed` and returns `['actor_required']`. Policy denies and
   the old channel path's kernel admission records `NOT_EXECUTED`.
6. **Principal authority serves authorization and audit attribution; it is not
   execution ownership.** The canonical resolver owns the permission decision
   and claim revalidation. The Action Engine owns execution/attempt/lease and
   reconciliation. Neither the worker's lease owner nor a provider adapter is
   a substitute for the initiating Client. `ActionTargetMutation` records an
   execution's effect, not an independent actor authority.

The comment “Omitted only for policy-registered services” on
`ActionPolicyResolutionRequestV1.actorUserId` predates the implemented
`VERIFIED_CLIENT_CHANNEL` exception. The actual resolver and accepted Client
cutover reports establish that exception; the comment is not a User requirement.

## Existing fields and exact runtime owners

All names in this section are existing at the baseline, not proposed schema.

| Concept | Existing representation and responsibility |
| --- | --- |
| Authenticated channel | Server channel authenticator; verified subject matched to `ClientChannelLink.provider`, `providerSubjectHash`, `subjectHashVersion`. Raw channel proof is transient input, not an actor field. |
| Canonical Client | `ClientChannelLink.clientId` with exact `tenantId` and composite Client FK. `Client.userId` is optional and does not define Client ownership. |
| Initiator/principal | User: `source.actorUserId` → active Membership. Client exception: normalized `consentChannel` → policy `client_channel`. Service: registered source type and sourceRef. |
| Authority evidence | `ConsentChannelBinding`: `linkId`, `provider`, `providerSubjectHash`, `verificationEvidenceHash`. Link adds immutable verification method/version, identity/evidence JSON/hash, verified timestamp and revocation history. |
| Durable source/audit | AE `sourceType`, `sourceRef`, optional `agentTaskId`, `actorUserId`, immutable `evidenceRefsJson`, encrypted normalized input, policy context/hash/evidence and approval binding. Policy evidence contains keyed references rather than raw identifiers. |
| Execution owner | AE `id`, `leaseOwner`, `leaseTokenHash`, `leaseExpiresAt`, attempts and registered executor/reconciliation. Maintenance has its separately approved coordinator owner. |
| Business target | AE `targetKind` / `targetRef`; create uses appointment target `create/<fingerprint>`, not Client ID. B31 normalized create `clientId` / intent `mayaClientId` identify the canonical Client; accepted Appointment ownership is `mayaClientId` + `tenantId`. |
| Mutation receipt | `ActionTargetMutation.executionId`, `tenantId`, target/generation and before/after hashes. No actor/source-authority column. |
| General audit | `AuditLog.userId` is nullable User attribution; `metadataJson` is not a generic policy authority source. It does not repair missing ingress authority. |

Source anchors (backend paths):

- [Schema: ActionExecution and actor Membership](../../maya-saas-backend/prisma/schema.prisma#L365),
  [mutation receipt](../../maya-saas-backend/prisma/schema.prisma#L547),
  [ClientChannelLink](../../maya-saas-backend/prisma/schema.prisma#L2147),
  [AuditLog](../../maya-saas-backend/prisma/schema.prisma#L2530),
  [MaintenanceRun](../../maya-saas-backend/prisma/schema.prisma#L2844).
- [Trusted source/request](../../maya-saas-backend/src/action-engine/action-engine.contract.ts#L21),
  [ingress key guards and policy extraction](../../maya-saas-backend/src/action-engine/action-engine.ingress.ts#L19),
  [policy selection](../../maya-saas-backend/src/action-engine/action-engine.policy-registry.ts#L130),
  [principal resolution](../../maya-saas-backend/src/action-engine/action-engine.policy-resolver.ts#L578),
  [audit evidence](../../maya-saas-backend/src/action-engine/action-engine.policy-resolver.ts#L710).
- [Client capability allowlist](../../maya-saas-backend/src/action-engine/client-preferences.contract.ts#L77),
  [exact binding assertion](../../maya-saas-backend/src/crm/client-consent-authority.ts#L6),
  [durable admission](../../maya-saas-backend/src/action-engine/action-engine.kernel.ts#L328),
  [kernel policy request](../../maya-saas-backend/src/action-engine/action-engine.kernel.ts#L1510),
  [claim reconstruction](../../maya-saas-backend/src/action-engine/action-engine.kernel.ts#L2167).
- [AE immutable evidence/source guard](../../maya-saas-backend/prisma/migrations/20260821190000_action_execution_kernel/migration.sql#L572),
  [Link immutable verification/revocation guard](../../maya-saas-backend/prisma/migrations/20260905010000_client_channel_delivery_address_v1/migration.sql#L19).

## Cross-action reconstruction

These are source observations and previously accepted proofs, not new end-to-end
certification of every path or new blockers beyond B32.

| Initiator/action | Current authority path and B32 consequence |
| --- | --- |
| HTTP create / AI `createOwnAppointment` | `appointments/client-appointment-create.service.ts:94` resolves the authenticated account's verified Client link; `crm/crm.service.ts:2674` supplies the actual context User to policy. B31 supports `Client.userId = null`, which is different from having no authenticated account actor. B31 PASS stays closed. |
| Verified channel create | `crm/client-channel-runtime.service.ts:896` resolves Client, sends `authenticated_request`, sourceRef = link evidence and old secondary idempotency scope. `crm.service.ts:1032` / `:2674` receives no User from public context. Proven B32 denial. |
| Cancel / reschedule | Account services retain B29/B30 verified ownership and actual account actor. Channel methods at `client-channel-runtime.service.ts:1074`, `:1089`, shared invocation `:1130` use the same actorless authenticated source pattern. Static candidate for the same principal gap; not a new production proof or reopening of B29/B30. Their target is an Appointment/provider record; Client authority must prove exact canonical mirror ownership, not compare targetRef directly with Client ID. |
| Preferences / visit mood | `crm/client-preferences.service.ts:355`: Client target, normalized consentChannel, canonical ingress, executor rechecks Client and owned Appointment for mood. Affecting an Appointment here does not make targetRef an Appointment ID. Accepted [B5/B6 report](CYCLE-06-BLOCKING-PACKAGE-5-B5-B6-DEPLOYED-FINAL-GATE-STOP-REPORT.md). |
| Channel consent | `package5-wave3/package5-wave3-canonical-cutover.service.ts:309`: exact channel link and binding; existing `record-client-consent` capability and consent facts. Consent remains a separate permission from booking or preferences. |
| Client habits | `crm/client-habits.service.ts:199`: Client target + consentChannel; no User requirement. Accepted [B7/B8 guest Client proof](CYCLE-06-BLOCKING-PACKAGE-5-B7-B8-DEPLOYED-FINAL-GATE-STOP-REPORT.md). |
| Wanted-slot registration | `crm/client-wanted-slot.service.ts:181`: Client principal. Availability match at `:453` is instead a webhook/system occurrence against an interest target. Delivery uses the existing Communication owner. Accepted [B9 report](CYCLE-06-BLOCKING-PACKAGE-5-B9-DEPLOYED-FINAL-GATE-STOP-REPORT.md). |
| Value initiation | `customer-subscriptions/customer-subscription-purchase-cutover.service.ts:124` verifies Client; at `:155` submits the bounded purchase capability as `legacy_bridge`, carrying canonical Client and resolution evidence. This authorizes a purchase intent, not arbitrary loyalty adjustment, grant consumption or value movement. Existing policy role/eligibility rules stay capability-specific. |
| Communication requests | `communication-delivery.service.ts:1656` privacy reply is an explicit bridge delivery; `:466` reminders are scheduler events; `:1287` campaign submission carries a User actor. Delivery recipient/endpoint is not initiating authority. A Telegram target here does not establish permission to put raw chat_id in any actor field. Do not grant Clients a generic send/campaign capability. |
| User/staff and platform/admin | `admin/admin.service.ts:94` calls Wave 2 with the real User. `package5-wave2.service.ts:538` validates tenant Membership or a real active platform User; `:397`/`:456` uses authenticated source with actorUserId for membership, or the approved platform bridge with normalized `actorIdentityHash`, `actorRole`, `actorMembershipId`. Executor `:1450` rechecks that authority. No fabricated tenant membership. This scoped platform path is not a Client shortcut. |
| Maintenance coordinator | `package5-wave6.service.ts:49` permits internal platform/system tenant scope. `MaintenanceRun.authorityType = SYSTEM_POLICY`, run/claim/lease fields own AC6 processing; current coordinator rejects requester/approver/AE claims. Do not force AC6 into Client or Action Engine authority. |

## Foundation verdict and exact missing contract

```text
EXISTING BOUNDED CLIENT PRINCIPAL REPRESENTATION: YES
EXISTING IMMUTABLE STORAGE PRIMITIVES SUFFICIENT: YES
B32 EXISTING GENERIC ACTOR/PRINCIPAL FOUNDATION SUFFICIENT: NO
```

This is not merely a missing argument:

1. The resolver passes `request.targetRef` as `clientId` to the binding assertion.
   An appointment create target is `create/<fingerprint>`; replacing it with a
   Client ID would change existing action identity and target semantics.
2. Client authority is extracted only for the explicit allowlist in ingress,
   kernel policy admission and claim reconstruction. Appointment normalizers
   return only their booking/mutation fields; adding `consentChannel` to raw
   create input would be discarded, not durably restored on restart.
3. Merely adding appointments to that allowlist would select a Client-only
   policy in place of existing account/staff/service policy, disrupting accepted
   paths. Existing Client policies do not define a union of those authority modes
   for the same appointment capability.
4. A durable link/source reference is evidence, not by itself a caller's right
   to act. The contract must bind authenticated channel → Client principal →
   separately resolved business target at admission and before effects.
5. Authority metadata must not become part of B31's business intent fingerprint.
   Changing channel, transport proof or worker must not create a second intent
   or bypass an existing UNKNOWN execution.

Missing owner decision: approve one common, server-derived Client authority
contract independent of business target, its persistence/reconstruction, and
capability-specific authorization alongside existing principals. Database
extensibility alone does not constitute that approval.

## Owner options (A/B only; proposed, not implemented)

| Decision dimension | A — reuse immutable evidence references (recommended) | B — typed Client/link references on ActionExecution |
| --- | --- | --- |
| Principal | Extend existing `client_channel` principal: canonical Client acts through a verified link; distinct from business target. | Same principal contract and resolver; different persistence only. |
| User relation | User/account is optional and independently verified when present. Never derive/create a User from Client, phone or channel. `actorUserId` retains its existing meaning. | Same; new Client columns do not replace or overload actorUserId. |
| Link relation | One versioned reserved reference in immutable `evidenceRefsJson` points to the existing immutable ClientChannelLink episode. Resolver validates exact tenant, Client, provider/subject and verification tuple. | Proposed nullable `initiatorClientId` and `initiatorClientChannelLinkId`; composite FK `(initiatorClientChannelLinkId, tenantId, initiatorClientId)` → existing Link `(id, tenantId, clientId)`, Restrict. |
| Tenant scope | AE tenant = link tenant = Client tenant = target/intent tenant, checked before admission and effects. | Same runtime checks plus composite FK for persisted attribution. |
| Audit | AE ID + immutable reference → retained link → Client and verification evidence. Existing policy evidence/hash records keyed principal/evidence references and decision. | AE ID + typed FK → same link/evidence; same policy attestation. |
| AE persistence | Existing source/evidence fields only; authority references are separate from encrypted business input and booking hash. | Two nullable scalar columns, paired-presence check, immutable after insert, composite FK/index; existing policy fields. |
| Policy | Common server parser/resolver with explicit allowed principal modes and capability-specific Client-to-target assertion. Existing User/service modes preserved. No blanket Client allowlist or trusted-service relabel. | Same. Columns do not themselves confer permission; all admission/claim checks still required. |
| Replay/idempotency | Restore original authority from immutable evidence. Reauthenticate each caller; keep first execution/intent/authority. Existing B31 identity, duplicate policy and UNKNOWN rules unchanged. | Same; restore from columns/link rather than reserved reference. |
| Background/system | Existing registered trusted-service and AC6 owners unchanged; their worker identity is not Client. | Same; new columns stay null for non-Client initiators. |
| Schema / models / fields | No schema or migration. **0 models, 0 persisted fields.** New runtime contract/parser and policy behavior still require Owner approval. | **0 models, 2 persisted nullable fields**, plus 2 Prisma navigation fields (AE relation and Link reverse relation). Proposed names above are not existing fields. |
| Migration/backfill | No migration or backfill. New authority contract only on newly admitted Client-principal actions; existing proven authority paths retain their contracts. | Additive migration required; historical fields remain null. No fabricated historical actor/link backfill. |
| New action classes | **0**. Reuse canonical action classes/executors. | **0**. |
| Safety and tradeoff | Reuses the already approved principal, immutable evidence storage and immutable Link history; no parallel authority registry. Link presence/association is enforced by canonical runtime, not a new FK on AE. | Adds relational attribution guarantees and queryability, but costs a migration and new schema surface without removing the runtime contract work. |

Choose B only if relational enforcement of every new Client attribution is an
additional Owner requirement. B32's stated audit requirement can be met by A's
immutable execution reference plus immutable link evidence; a new model is not
justified. Neither option automatically changes already working Client actions.

## Proposed Option A contract boundaries

The following is a decision proposal, not a description of deployed behavior.

- Use one reserved, versioned opaque evidence-reference format, proposed as
  `client-authority:v1:<link-id>` (exactly one for a new Client-principal action).
  It fits the existing bounded opaque-reference contract. The server constructs
  it only after authenticating the current channel and validating the full
  `ConsentChannelBinding`; possession of a link ID or caller-supplied evidence
  string is never authentication. Reject malformed, duplicate, conflicting or
  unregistered authority references rather than treating them as ordinary tags.
- The trusted resolver derives Client from that exact link, checks its original
  verification tuple and current revocation/eligibility, and resolves authority
  against the capability's separately identified business subject. For create,
  require Client = existing normalized canonical `clientId` = B31 descriptor
  `mayaClientId`, exact tenant and canonical client booking options. For an
  existing Appointment mutation, require exact `Appointment.mayaClientId` and
  tenant using the existing ownership resolver. A raw external record ID,
  legacy `Appointment.clientId` or phone match cannot prove this relation.
- The existing policy resolver remains the only decision owner. Register the
  Client alternative only for an explicitly approved capability/path. Preserve
  existing User/staff and trusted-service alternatives and their checks; a
  failed Client authority check cannot fall through to a more privileged mode.
  An authenticated public channel remains `authenticated_request`.
- Persist the original reserved reference atomically with AE admission. Its
  referenced Link already stores provider, subject HMAC, verification version,
  evidence hash/JSON and original Client/tenant. Bind keyed versions of those
  facts into existing policy evidence/context and approval binding. Do not put
  raw channel credentials, chat IDs, phone numbers or delivery addresses in the
  authority reference or policy audit. Delivery ciphertext is not authority.
- Use the same authority reconstruction at ingress, kernel admission and claim;
  recheck mutable tenant/link/Client/target eligibility before effects. Existing
  Client consent/preferences contracts can be adapted by a compatibility reader
  to the same internal principal representation without rewriting their input,
  identities or historical rows. No widening of their permissions is implied.
- Connect the channel initiator to the accepted canonical B31 create admission,
  including the existing immutable intent binding, and existing internal/CRM
  Action Engine executors. Do not repair policy while leaving the channel on
  its older secondary-idempotency-only create path. This is future B32 work,
  not a B31 schema or business-contract redesign.

### First request, replay, revocation and UNKNOWN

Authenticate/resolve current Client before considering a retry. Admission must
validate authority and target before creating a new accepted execution/binding.
Concurrent same identity + same canonical intent converges through B31's existing
atomic binding to one execution. The first accepted execution retains its
original source and authority evidence; later contenders do not overwrite it.
Changed intent under that identity is `IDEMPOTENCY_CONFLICT`, including UNKNOWN.
Different keys with the same intent follow existing duplicate-booking policy.

Channel/link/credential metadata stays outside the B31 booking fingerprint.
A currently verified different channel for the same exact Client may identify
the same owned execution/outcome; it cannot relabel its original initiator or
substitute its own link into the execution's claim authority. Resuming a pending
effect still validates the original authority contract. If that link is revoked
or its Client/target eligibility no longer holds, fail closed for new effects;
do not start another execution or synthesize a replacement actor. Revocation
does not erase historical attribution or an already completed outcome.

A retry of an existing B31 account execution likewise preserves that execution's
original account authority. It may continue only through its existing authorized
executor path, not by attaching a new Client principal to an old row. Historical
channel `NOT_EXECUTED` records are terminal evidence, not records to rewrite to
ALLOW. No automatic replay migration, policy-version identity escape, rebooking
or historical authority backfill is proposed by this decision.

After a crash, reconstruction uses persisted evidence and intent, not a retained
raw channel token or a new worker identity. UNKNOWN remains attached to the same
execution/provider operation. Existing reconciliation may read that operation
and record its proven outcome even when the original channel cannot authorize a
new write. Any retry dispatch after proven non-execution must still pass the
original authority and existing retry policy. A changed intent cannot bypass
UNKNOWN, and missing/revoked authority cannot authorize another provider attempt.

Audit reconstruction is: AE ID/tenant → immutable authority reference → exact
Link/Client and original verification evidence → keyed policy attestation →
ActionAttempt and result. Existing link history is immutable (ordinary delete
is guarded); existing payload/audit retention and tenant-purge rules remain.
No separate TTL may recycle an idempotency key or erase required unresolved
execution evidence. This is original accepted-initiator attribution, not a new
ledger of every transport retry. If the Owner requires a durable per-retry
channel audit, that is additional scope and must not be silently inferred.

## Verification and STOP

Stage 1 validation: source anchors and cited reports inspected; prior B32 proof
checked; all 32 local links across the three changed documents and their source
line anchors resolve. Whitespace and documentation-only changed-file scope pass. No
runtime/schema/migration files changed. Runtime tests, build, schema gates,
production deployment and Final Completion Gate were not rerun for this
documentation-only decision. Their prior accepted results are not presented as
new B32 PASS evidence.

No production access or mutations, database access, temporary server, watcher,
browser, or new database was needed. The 17 pre-existing databases and main
dirty checkout were not touched. Owned resource hygiene is 0.

```text
B32 CONTRACT RECONSTRUCTION: COMPLETE
B32 EXISTING ACTOR/PRINCIPAL FOUNDATION SUFFICIENT: NO — generic extension needs Owner decision
RECOMMENDED OPTION: A
CLIENT WITHOUT MAYA USER PRESERVED: YES
FAKE USER CREATION REQUIRED: NO
RAW chat_id AS ACTOR: NO
NEW SCHEMA REQUIRED: NO — recommended Option A
NEW MODELS: 0
NEW FIELDS: 0 — persisted schema fields; new runtime contract semantics are proposed
NEW ACTION CLASSES: 0
MIGRATION REQUIRED: NO
BACKFILL REQUIRED: NO
B32 RUNTIME REMEDIATION CAN RESUME: NO — pending B32 Option A/B approval
B32 IMPLEMENTATION CAN RESUME AFTER OWNER APPROVAL: YES
B32 RUNTIME IMPLEMENTATION / DEPLOYMENT: NOT STARTED
B29 / B30 / B31 PRODUCTION REMEDIATION: PASS
PRODUCTION MUTATIONS: 0
PACKAGE 4 COMPLETE: YES
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13
PACKAGE 5 COMPLETE: NO
ACTIVE BLOCKER: B32
CHAPTER 6 COMPLETE: NO
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
PROCESS HYGIENE — OWNED SCOPE: 0
```

Report/remainder → commit/push → STOP. No implementation authorized by this sheet.
