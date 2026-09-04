# Package 5 Final — A18 Client-Channel Binding Schema Proposal V1

Status: **PROPOSED SCHEMA — NOT IMPLEMENTED / NOT APPLIED**

Starting checkpoint: `9ae29bed`. Date: 2026-09-04.

The user's subsequent **A18 Client ↔ Authenticated Channel Binding V1 Decision**
completes the business contract. This document proposes only the missing durable
representation. It supersedes the schema sketch in
`package5-final-a18-client-channel-binding-v1-proposal.md`; the accepted decision
is recorded in the accompanying contract/schema assessment report.

## Verdict and minimum scope

Existing schema is insufficient for an account-optional, verified
`tenant + provider + provider subject → Client` relationship with durable
verification evidence, active uniqueness and auditable rebinding.

Propose **one new model: `ClientChannelLink`**, following the existing
`CrmClientLink` / `StaffProviderLink` domain vocabulary. The authenticated channel
identity is the immutable provider-qualified key inside the link; there is no
separate duplicate `AuthenticatedChannelIdentity` table. Each row records one
completed, verified binding episode. An unverified subject has no active link.

Reuse `Client`, `Tenant`, Client-owned `CustomerProfile` / `ClientConsentFact`,
Action Engine execution/evidence and the current P02/P03 holds. Keep account
authentication in `AuthIdentity` / `AuthSession`; making their required User
nullable would change existing account security and retention contracts.

## Approved resolution rules

- **PWA:** authenticate the live, unexpired/unrevoked session and exact
  tenant-qualified User; enforce current User/membership status. Reuse an
  existing *proven* User ↔ Client relationship as binding evidence. The new link
  can record that verified provenance in the authentication/linking boundary
  without requiring another challenge for an already proven association.
  A bare `Client.userId` value or phone-derived association is not retroactive
  verification evidence. Missing User, missing verified relationship, multiple
  Clients, or conflicting evidence requires explicit verified linking and a
  fail-closed consent result.
- **Telegram:** a verified Telegram user id proves only the Telegram subject;
  every command still requires valid current channel authentication.
  First linkage to Client requires explicit verified challenge, independently
  proving channel control and authority over the exact Client. The resulting
  durable link is reusable. Phone/contact sharing, CRM external id, name and
  any other heuristic alone cannot establish it.
- **Guest:** no User or Membership FK is required by the new link. A verified
  guest binding supports consent with `actorUserId = null`. This is schema and
  contract support, not a claim that the current runtime already supports it.
- **Consent:** resolves Client only from the durable verified binding. Consent
  execution and read surfaces do not create, infer, repair or rebind identity.
  No fake historical consent/profile facts or automatic Client creation.

## Proposed fields

Types follow existing PostgreSQL/Prisma conventions. All times are server-derived
UTC `DateTime`; all digests are nonempty, validated 64-character hex strings.

| Field | Type / nullability | Purpose |
| --- | --- | --- |
| `id` | String, primary key | Immutable binding episode id |
| `tenantId` | String, required | Server-resolved tenant |
| `clientId` | String, required | Exact existing canonical Client |
| `provider` | String, required | Canonical identity issuer, initially `maya_user` or `telegram` |
| `providerSubjectHash` | String, required | Stable keyed digest of the issuer-qualified authenticated subject |
| `subjectHashVersion` | Int, required, V1 fixed to 1 | Fixed canonicalization/hash contract |
| `verificationMethod` | String, required | `proven_user_client_link` or `explicit_verified_challenge` |
| `verificationVersion` | Int, required, V1 fixed to 1 | Version of the accepted verification contract |
| `verificationIdentityHash` | String, required | Tenant-scoped one-time verification receipt / idempotency identity |
| `verificationEvidenceJson` | Json, required | Bounded immutable safe proof facts, described below |
| `verificationEvidenceHash` | String, required | Digest of canonicalized proof facts |
| `verifiedAt` | DateTime, required | Actual completed verification time; never invented history |
| `createdAt` | DateTime, server default | Durable receipt insertion time |
| `supersedesLinkId` | String, optional | Prior episode for explicit re-link/rebind; absent on first link |
| `revokedAt` | DateTime, optional | Null while active; one-way terminal revocation |
| `revocationIdentityHash` | String, optional | Idempotency identity of explicit revocation/rebind operation |
| `revocationEvidenceJson` | Json, optional | Bounded safe revocation facts, set once |
| `revocationEvidenceHash` | String, optional | Immutable revocation proof digest |

State is derived: `verifiedAt` present and `revokedAt` null means verified-active;
`revokedAt` present means revoked. There is no redundant mutable `status` or
pending row that could accidentally become consent authority. Historical rows
remain addressable by id after revocation and rebinding.

Provider identity is not transport identity: the same Telegram subject used
through PWA and Telegram must occupy the same tenant/provider key. A bot,
installation, session, request or signing-key id cannot subdivide this key and
permit a second active Client. Those values belong in verification provenance.
Canonical provider values and subject normalization are server allowlisted.

V1 pins the subject hash scheme/key identity. Hash version is not part of the
active unique key. A key rotation must not silently change the digest and create
a second active mapping; it requires an explicit reviewed migration/alias and
collision protocol. This proposal does not authorize that rotation.

## Database constraints and lifecycle guards

1. Composite FK `(clientId, tenantId) → Client(id, tenantId)`, with RESTRICT on
   update/delete. `tenantId → Tenant(id)` also RESTRICT; binding evidence must
   not disappear in a tenant/User cascade. No required User, session, OTP or
   AuthFlowState FK; short-lived auth artifacts may expire under A30 normally.
2. Unique `(id, tenantId)` and `(id, tenantId, provider, providerSubjectHash)`
   support tenant-/identity-qualified references. `supersedesLinkId` uses the
   latter composite identity FK and RESTRICT. Reject self-reference/cycles.
3. **One active mapping per tenant/provider identity**, enforced by a PostgreSQL
   partial unique index (explicit migration SQL, not application-only checking):

   ```sql
   CREATE UNIQUE INDEX "ClientChannelLink_active_subject_key"
     ON "ClientChannelLink" ("tenantId", "provider", "providerSubjectHash")
     WHERE "revokedAt" IS NULL;
   ```

4. Unique `(tenantId, verificationIdentityHash)` survives revocation, so replay
   cannot create another episode. Require identical target and proof material
   for a retry; altered material fails closed. Unique non-null
   `(tenantId, revocationIdentityHash)` gives one revocation outcome.
   A unique non-null `supersedesLinkId` prevents divergent successor histories.
5. CHECK guards validate provider/method/version allowlists, nonempty ids,
   digest shapes, server-time order and all-or-none revocation fields. Evidence
   must be an object with a bounded shape. These checks validate storage
   integrity; they do **not** make arbitrary JSON or a digest proof of identity.
6. An immutability trigger forbids changing the original tenant, provider,
   subject, Client, verification fields, predecessor and creation time. Only
   a first complete revocation tuple may be added. Revocation cannot be erased
   or rewritten; DELETE is rejected. Rebinding creates a new verified row.
7. The link/revoke/rebind writer locks the exact tenant/provider subject in a
   serializable transaction. Initial linkage requires no history. Any subsequent
   episode must name the latest prior episode and use a fresh verified operation;
   the insert guard rejects missing/stale predecessors or an unrevoked prior row.
   Revocation plus successor insertion and audit commit atomically for rebind.
8. Consent commit must share that identity-lock protocol and revalidate active
   link id, Client, evidence hash, authenticated subject, tenant and applicable
   holds. A revocation/rebind that wins first invalidates the planned command;
   a consent commit that wins first keeps its truthful historical evidence.

The partial index is the concurrent active-identity backstop; the transaction
and historical guards prevent stale, cyclic or silently reassigned links.
No `ON CONFLICT UPDATE clientId`, blind overwrite or fallback authority is allowed.

## Verification evidence and owner boundary

`verificationEvidenceJson` contains only the verification method/version,
verifier/issuer reference, channel-control proof digest, exact Client-authority
proof digest, challenge/receipt identity, bound tenant/provider/subject/Client
references or their safe digests, and actual verification/validity times.
It is generated by the server verifier; public payload evidence is not trusted.
For PWA, preserve the proven User↔Client provenance without requiring that User
to remain present forever. For a guest, do not fabricate a User actor.

The explicit linking verifier must verify both channel control and exact Client
authority. A signed Telegram login proves only the first. A receipt hash, OTP
phone match, CRM external id, operator-selected Client or bridge secret alone
cannot satisfy the second. If the required proof cannot be obtained, leave the
subject unbound and require verified linking. This schema does not waive that
verification or choose an unapproved challenge shortcut.

The new row preserves verification evidence independently of expiring challenge
records. No raw OTP, token, Telegram initData, phone/name/email, signed bearer
proof or copied customer record is stored in the evidence JSON. Auditing may
reference the immutable row and digest; an AuditLog JSON entry alone is not the
binding authority. Existing ActionExecution trusted input can reference link id
and evidence hash for consent; no new consent model or fake action is needed.

`ClientChannelLink` is the completed-link foundation. Pending challenge transport
is not consent authority. `AuthFlowState` cannot be used as the sole permanent
receipt because A30 may purge it; no lifetime FK or retention exception is added.
If a concrete linking implementation needs additional durable challenge schema,
that is a new explicit schema decision, not hidden inside an OAuth field.

## Additive migration and verification plan after approval

Create one empty table, its foreign keys, indexes and lifecycle guards, plus
Prisma reverse relations on Client/Tenant. No changes to existing account,
consent, CRM-link, TrialActivation or A30 models/policies. No backfill from phone,
account references, CRM observations or historical consent timestamps.

Before apply: schema validation, isolated PostgreSQL clean replay, exact
expected-only pending migration set, drift NONE and mandatory migration gates.
Required adversarial proof covers tenant/provider isolation, guest rows without
User, one winner for concurrent linking, single-use verification, exact retries,
changed-material replay rejection, revoke/consent races, explicit rebind history,
immutable proof/deletion rejection, and no second identity via transport/hash
version changes. Verifier tests must reject phone-only and forged evidence.

New link/evidence rows are **outside A30 Policy V1's deletion allowlist**. Do not
apply 24-hour/30-day auth cleanup to them or add a cascade from an auth artifact.
No retention policy change, broader cleanup, real production proof mutation or
tenant hard delete is authorized here.

This cycle stops at the proposal. There is no generated migration, schema.prisma
edit, runtime implementation, deployment or mutation-based smoke. After approval
and a proven binding foundation, return to the same A18/A26 Final Remediation
cycle, then its authorized full Final Package 5 Gate. A26's three remaining
concerns stay in the remainder; Waves 1–6 are not reopened.

```text
A18 CLIENT-CHANNEL BINDING CONTRACT: COMPLETE
EXISTING SCHEMA SUFFICIENT: NO
ADDITIONAL SCHEMA REQUIRED: YES
PROPOSED NEW MODELS: 1 — ClientChannelLink
SCHEMA PROPOSAL: READY FOR REVIEW
SCHEMA IMPLEMENTED/APPLIED: NO
A18 CONSENT REMEDIATION CAN RESUME: NO
PRODUCTION MUTATIONS: 0
```
