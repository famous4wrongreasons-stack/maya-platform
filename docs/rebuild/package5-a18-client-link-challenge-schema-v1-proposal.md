# A18 — ClientLinkChallenge Schema Proposal V1

Status: **APPROVED after `84696bc9` — foundation implementation in progress**

The user explicitly approved this exact model and TTL V1 = 600 seconds, with
conditional migration apply and continuation through A18/A26 remediation and the
full final gate. The original proposal below is retained as the design record;
its proposal-only STOP and pending-approval statements are superseded. Current
implementation evidence is in the Client Link Challenge Foundation Report.

Date: 2026-09-04. Accepted checkpoint: `813107da`.
The user's **A18 FIRST CLIENT-CHANNEL LINK AUTHORITY — APPROVED** decision is
accepted. A server-issued, short-lived, single-use challenge is the approved
first-link mechanism. This proposal supplies its missing durable representation.
The existing approved/applied `ClientChannelLink` foundation remains unchanged.

## Why another model is necessary

Current schema has 89 models; the read-only production catalog contains those
89 tables plus `_prisma_migrations`. There is no unmodeled challenge table.

| Existing model | Reusable foundation | Missing or conflicting semantics |
| --- | --- | --- |
| AuthFlowState | Tenant scope, expiry, conditional consume | OAuth state/redirect/PKCE contract; no Client FK, trusted resolution evidence or linked outcome; raw state; A30 cleanup allowlist |
| PhoneAuthCode / EmailAuthCode | Hashed secret and conditional consume | Contact-qualified mutable upsert; no canonical Client/consumed-link relation; contact authentication is not Client authority |
| AuthSession / AuthRefreshToken / AuthIdentity | Current channel/account authentication | Required User/session ownership; account protocol, no account-optional Client challenge |
| TrialActivation | Opaque-token digest and durable outcome pattern | Authority to create a tenant; no exact existing Client; A26 contract cannot become client-link storage |
| ClientChannelLink | Completed verified link, immutable evidence, active-subject uniqueness | A verified episode cannot be used as a pending challenge; explicitly forbidden by the user |
| AuditLog / ActionExecution | Supporting audit/execution references | No challenge secret, Client-bound expiry or atomic redemption contract; arbitrary JSON does not supply these invariants |

Reusing OAuth strings/JSON as encoded Client state would bypass domain constraints
and couple linking to unrelated cleanup. Propose **one new model only**:
`ClientLinkChallenge`. No second pending-link or identity table.

## Authority boundary

Canonical issuance is:

`trusted server-side Client resolution → issue challenge for exact tenant/Client`.

The issuer accepts only the trusted resolver's verified result and evidence.
A public caller cannot supply authoritative Client, tenant, resolution evidence,
expiry, policy version or issuer role. An admin role or server signature around
an arbitrary Client id does not replace trusted resolution.

Already proven Maya User↔Client provenance may supply the resolver result. A bare
User FK, phone/contact/name/CRM-id match, Telegram signature or combination of
heuristics may not. Missing/ambiguous resolution or P02/P03 hold means **no
challenge issued**. The challenge must be delivered through the trusted issuance
context; selecting a Client and returning its token to an unverified caller is
forbidden. No automatic enrollment/backfill is introduced.

Guest Clients need no User or Membership FK. At consumption, current PWA or
Telegram authentication proves only the consuming channel; possession of the
valid Client-bound challenge supplies the approved linking authorization.
This schema approval would not authorize a heuristic resolver implementation.

## Exact proposed fields — 14

Times are server-derived UTC, consistent with the existing foundation.

| Field | Type | Purpose |
| --- | --- | --- |
| id | String, UUID primary key | Immutable challenge identity |
| tenantId | String, required | Trusted tenant at issuance |
| clientId | String, required | Exact existing canonical Client, bound before delivery |
| tokenHash | String, required | HMAC of the opaque bearer under a fixed V1 purpose/tenant namespace; never the bearer |
| tokenHashVersion | Int, V1 = 1 | Pins the token canonicalization/hash contract |
| policyVersion | Int, V1 = 1 | Pins the separately approved challenge lifetime policy |
| issuedAt | DateTime, required | Actual database-derived issue instant |
| expiresAt | DateTime, required | Immutable `issuedAt + approved TTL`, server-only |
| issuanceEvidenceJson | Json, required | Bounded immutable trusted-resolution/issuance facts |
| issuanceEvidenceHash | String, required | Digest of canonical issuance facts |
| consumedAt | DateTime, nullable | One-way successful consumption instant |
| consumedLinkId | String, nullable, unique | Exact verified ClientChannelLink created by consumption |
| consumedProvider | String, nullable | Authenticated issuer: `maya_user` or `telegram` |
| consumedSubjectHash | String, nullable | Server-derived provider subject under existing link hash V1 |

No redundant mutable status or `updatedAt`, raw token, phone, account FK,
provisional ClientChannelLink, delivery queue or extra identity model is needed.
Pending means the consumption tuple is null and `serverNow < expiresAt`;
expired means it remains null and `serverNow >= expiresAt`; consumed is terminal.

## Token and evidence

Use a cryptographically random 32-byte token encoded as unpadded base64url.
This is an opaque high-entropy link token, not a short numeric OTP. Reuse the
existing `EncryptionService.opaqueReference` HMAC primitive with fixed purpose
`a18.client-link-challenge.token.v1` and unambiguous tenant/token input. Store
only the resulting 64-hex HMAC. The hash version is not a way to split identity
or rotate keys silently; any rotation needs an explicit migration protocol.

Return the bearer only through the approved issuance response/delivery. Do not
persist it in JSON, audit, URLs recorded by the server, traces or logs. The stored
HMAC is never accepted as a bearer token. A lost issuance response does not allow
reconstructing the token from its hash or extending that challenge; a new issue
requires a fresh authorized resolver result.

`issuanceEvidenceJson` has a closed, bounded shape: contract/version, allowlisted
resolver reference, resolution-evidence reference and digest, issuer-authority
digest, exact tenant/Client references, issue instant and policy version. No raw
bearer, OTP, phone, copied CRM record or arbitrary initiator JSON. A digest alone
does not prove resolution; the issuer must validate the referenced authority.

At redemption, existing ClientChannelLink immutable evidence records channel
control and the verified challenge issuance provenance. Its
`verificationIdentityHash` uses the challenge's purpose-qualified `tokenHash`
as the one-time receipt identity; its `clientAuthorityProofHash` equals the
challenge's `issuanceEvidenceHash`. The secret itself is never persisted.
Both PWA and Telegram first links use `explicit_verified_challenge` in this flow.
Historical ClientChannelLink verification methods/fields are not rewritten.

## Database constraints

1. Tenant FK and composite `(clientId, tenantId) → Client(id, tenantId)`, RESTRICT
   on update/delete. Guest support does not depend on account existence.
2. Unique `(id, tenantId)` and `(tenantId, tokenHash)`. Token hash version must be
   exactly 1 and is not part of a uniqueness escape hatch. Index
   `(tenantId, clientId)` and `(tenantId, expiresAt)` for bounded server lookups.
3. `consumedLinkId` unique. Composite nullable FK
   `(consumedLinkId, tenantId, consumedProvider, consumedSubjectHash)` references
   the **existing** unique key
   `ClientChannelLink(id, tenantId, provider, providerSubjectHash)`, with RESTRICT.
   Only reverse relation declarations are needed on existing Prisma models.
4. CHECK guards: valid digests/nonempty ids/closed evidence object; fixed policy
   and hash versions; `expiresAt > issuedAt`; all-or-none four-field consumption
   tuple; consumed provider allowlist; `issuedAt <= consumedAt < expiresAt`.
   JSON checks must reject NULL/unknown results explicitly, as in the applied
   ClientChannelLink guards.
5. An insert/update guard makes all issuance fields immutable and permits only
   the first complete consumption tuple. It verifies the approved TTL, actual
   server clock and that the target Client is tenant-qualified and unmerged.
   It rejects resetting consumption, changing Client/deadline/token or rewriting
   evidence. No deletion/cleanup route is added by this proposal.
6. A transaction-level constraint guard requires the consumed link to have the
   exact same Client, tenant, provider, subject and V1 verification receipt, with
   `verificationMethod = explicit_verified_challenge` and matching issuance proof
   hash. The link creation/consumption timestamps must describe the same valid
   redemption. A link to Client B cannot consume Client A's challenge, even if
   a malformed writer supplied a tenant-correct link id.
7. Existing ClientChannelLink immutability, no-silent-rebind lifecycle and active
   subject partial uniqueness continue to apply. A challenge cannot relax them.

## Atomic consumption / replay semantics

The public consumer supplies the token and current authenticated channel proof.
It cannot override Client/tenant/provider subject/policy/evidence/deadline.
The server derives provider and subject, resolves the tenant and hashes the token.

Inside **one serializable database transaction**:

1. Acquire the existing canonical tenant/provider/subject identity lock, then
   lock the exact tenant/token challenge row. Use the same lock order for all
   consumers; waiters must recheck state and expiry after obtaining locks.
2. Require pending and unexpired at the actual database consume instant, exact
   Client, current channel authentication, no ambiguity/hold and no earlier link
   history for that provider identity. Active or revoked prior history cannot
   silently become a new first link.
3. Through the existing canonical ClientChannelLink writer, create the verified
   link and its immutable challenge/channel evidence. Do not open an independent
   nested transaction or introduce a second direct link writer.
4. Conditionally mark the challenge consumed and set its exact link/provider/
   subject tuple. Exactly one row must change. Constraints verify correlation;
   commit both effects together. Any error rolls back both effects.

Thus two consumers of one token have one winner, even with different channels;
multiple tokens competing for one provider subject still obey active uniqueness.
Link-create failure leaves no consumed challenge; consume failure leaves no link.
All transaction retries revalidate expiry and current authority.

**A new redemption of a committed token is rejected, including the same caller.**
Internal retries of an uncommitted serialization failure are not a second use.
After a lost response, a separately authenticated read can discover the existing
link outcome for the same subject; it cannot redeem again or create another link.
This does not change the underlying foundation's idempotent receipt semantics.

Rebinding/relinking remains the separately verified, audited existing lifecycle.
A first-link challenge is not a privileged shortcut to it. Consent reads and
commands consume an active verified link; they never issue/consume challenges.

## TTL and retention boundary

No existing approved policy sets a Client Linking Challenge TTL. The **separate**
`package5-a18-client-link-challenge-ttl-v1-proposal.md` proposes 600 seconds; this
number is not approved or implemented by preparing the schema proposal.
Schema/migration/runtime must wait for both approvals.

Token validity and deletion retention are different. A30's 24-hour terminal auth
retention is not a token lifetime and does not authorize deleting this new record
class. Keep A30 Policy V1 and its six-class allowlist unchanged. No challenge
purge scheduler, retention exception or permanent retention duration is chosen
here. Any future cleanup requires the central versioned policy boundary and must
preserve verification evidence already copied into ClientChannelLink. There is
no permanent FK from ClientChannelLink back to a transient challenge.

## Proof and migration plan after approval

Use a new isolated PostgreSQL cluster/database, never the 17 historical DBs.
Verify every user-required case: valid token→one link; committed replay rejected;
expired token rejected; forged Client rejected; phone-only and Telegram-only
authority rejected; wrong tenant; concurrent one winner; Client A/B substitution;
ambiguous resolver issues nothing; guest without User; silent rebind forbidden.

Also prove rollback at both partial-failure points, expiry while waiting for a
lock, two tokens competing for one subject, immutable issuance/consumption facts,
wrong linked receipt rejected, no raw token at rest and no read-side writes.
Tests must distinguish server-validated resolver/channel evidence from caller
JSON; synthetic fixture provenance must remain explicit.

Then clean replay, Prisma validate, targeted architectural ratchets, typechecks
and lint. A future migration creates one empty table with these constraints and
reverse relation declarations, no backfill. Apply only under the then-authorized
expected-only migration gate with drift NONE and health/readiness PASS. No proof
case, schema change or deployment has been executed in this proposal cycle.

After the challenge foundation is approved/proven, resume the same A18 consent →
A26 trial → A26 admin remediation, required deployment gates, read-only production
verification and full Package 5 Final Gate. Waves 1–6 remain accepted; no Wave 7.
