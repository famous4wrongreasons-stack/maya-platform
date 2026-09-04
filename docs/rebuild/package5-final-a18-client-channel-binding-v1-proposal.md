# Package 5 Final — A18 Client channel binding V1 proposal

Status: **PROPOSED — new identity-establishment contract; NOT approved or implemented**

Date: 2026-09-04. Source checkpoint: `ba9e9234`.

## Decision needed

Approve how an authenticated legacy PWA/Telegram subject becomes bound to one
tenant-qualified canonical Client without requiring a Maya User. D2-A already
approves Client ownership and optional User; neither decision is being reopened.
The missing decision is the authority and evidence for establishing that binding.

The active PWA authenticates Telegram identity or a local web session and yields
`chat_id`. Its SQLite `clients.id` is a different namespace from canonical
`Client.id`; neither `clients` nor `web_sessions` has a canonical Client binding.
`CrmClientLink` proves an external CRM identity, not control of a Telegram/web
subject. `AuthIdentity` and `AuthSession` require User. A bridge credential can
authenticate an installation/tenant, but cannot alone prove which Client is
giving consent. Phone/email matching cannot fill this gap.

## Recommended bounded contract

1. A server-configured, authenticated source installation is bound to one tenant
   through the existing strict integration resolver. Request body tenant, Client
   and User identifiers are assertions only and never select the principal.
2. A channel verifier proves control of a stable channel subject. Telegram uses
   its verified signed identity. Web sessions must retain the verified issuer and
   subject that established the session; a `chat_id` selected by phone matching
   is insufficient. Reject expired/revoked sessions and unverifiable provenance.
3. Resolve a durable `ClientChannelBinding` by exact tenant, installation,
   channel and opaque subject hash. The bound Client must exist in the same
   tenant, be unmerged and pass the applicable P02/P03 holds. User is optional.
4. Existing exact bindings may be used immediately. For an unbound subject,
   this proposal recommends **fail closed with `client_identity_unresolved`**.
   Do not auto-create another Client, auto-link by phone/email, repurpose
   `CrmClientLink`, or mass-backfill legacy records. Consent submission/read
   endpoints cannot establish or repair identity bindings.
5. Establishment of an existing guest's binding requires an explicit, separately
   reviewed provenance record demonstrating both channel control and exact
   canonical Client identity. A tenant operator may submit evidence but cannot
   substitute their authority for the Client's consent. A link with only a phone
   match, an operator-selected Client id, or the bridge secret is rejected.
   **The accepted evidence source / provisioning procedure must be named before
   implementation or production binding.** No such procedure has been found in
   the approved Package 5 contracts.
6. Consent stays AC1 through Canonical Action Ingress / Action Engine and the
   canonical A18 executor. A server-resolved Client principal carries a binding
   id/version and safe evidence hash. Actor User remains null for a guest.
   Revalidate binding, revocation, tenant, Client and holds at execution commit;
   do not merely remove the existing membership checks for every Wave 3 action.
7. Grant/revoke decisions remain append-only `ClientConsentFact` records, with
   deterministic retry identity and current profile projection in the same
   governed transaction. No historical consent is inferred from a new binding.

## Minimum proposed durable representation

`ClientChannelBinding` is a proposed name, not an applied schema model:

| Field / constraint | Purpose |
| --- | --- |
| id, tenantId, clientId | Immutable binding identity; composite Client FK enforces tenant isolation |
| sourceInstallationId, channel, subjectHash, hashVersion | Exact server-scoped authenticated subject, no raw channel id/token |
| provenanceType, provenanceHash, verifiedAt | Auditable evidence of binding establishment |
| bindingVersion, createdAt, revokedAt | Commit-time authority revalidation and durable revocation |
| Unique tenant + installation + channel + subject hash/version | One subject cannot concurrently claim two Clients |

No silent reassignment or subject-hash rotation that creates a second binding is
allowed in V1. Revocation remains durable; relinking/merge requires a separate
reviewed identity procedure. Evidence must be immutable and contain no raw
credentials or copied customer records. The final migration must be reviewed
after the establishment/provenance decision, with a clean replay and concurrency
proof. Existing ClientConsentFact/ActionExecution/ActionTargetMutation are reused.

## Approval boundary and resumption

This proposal asks for the exact binding/provenance contract, including the
accepted establishment evidence or an existing authoritative binding source.
It does not ask to approve optional User or Client consent ownership again.
The recommended unresolved-identity behavior is an explicit rejection until
there is a proven binding; that behavior must be accepted as part of the decision.

After the decision: finalize the minimal schema if necessary, implement and prove
the guest principal / binding checks, then complete the already authorized A18
and both A26 remediations. Test valid guest consent, revoked/stale/forged bindings,
cross-tenant substitution, retries and concurrency; retain every requested A26
proof and final ratchet. Run mandatory deployment gates, deploy only if green,
perform structural/read-only production verification, then restart the entire
13-family Package 5 Final Gate automatically. No real production consent/trial
mutation for proof, no tenant hard delete, no Wave 7 or Chapter 7.

```text
A18 CLIENT-OWNED CONSENT / OPTIONAL USER: ALREADY APPROVED
A18 CHANNEL-TO-CLIENT ESTABLISHMENT AUTHORITY: DECISION REQUIRED
A18 CLIENT CHANNEL BINDING V1: PROPOSED
ADDITIONAL SCHEMA: PROPOSED; NOT APPROVED/APPLIED
PHONE/EMAIL AS CANONICAL IDENTITY: FORBIDDEN
FAKE MAYA USER OR CRM LINK: FORBIDDEN
UNRESOLVED SUBJECT AUTO-LINK/REGISTRATION: NO IN PROPOSED V1
PRODUCTION REMEDIATION READY: NO
```
