# AR-1 separate production execution contract

Owner-approved implementation unit following certified baseline
`4509d6f55df62da852740658c69613b113b5a1c1`. That baseline's certificate is not
inherited by this change. Fresh exact-candidate certification is mandatory.
Implementation approval does not issue a production authorization, configure
production trust, deploy, migrate, grant, deliver OTP or call YCLIENTS.

## Fixed authority boundary

The existing platform release controller, current global platform-owner session,
entitlement writer, locks, full-row CAS and atomic AuditLog remain the owners.
No new endpoint, database column, table, plan/trial path or client-side evaluator.
`validate`, `grant`, `revoke` and `status` retain their existing routes.

The production process must have both `NODE_ENV=production` and
`WIDGET_RELEASE_ENVIRONMENT=production`. This selects a parser, not authority.
`WIDGET_RELEASE_PRODUCTION_TRUST_JSON` is a separately provisioned server trust
store of Ed25519 public keys with the existing exact `principalId`, `purpose`
(`owner` or `security`) and `publicKey` shape. It defaults to empty. Production
never falls back to `WIDGET_RELEASE_TRUST_JSON`. No request can supply trust.

`WIDGET_RELEASE_PRODUCTION_TENANTS_JSON` is a server-owned nonempty array of
unique exact tenant identifiers. Wildcards, malformed identifiers, duplicates,
missing lists and tenants outside the list refuse grant and effective access.
Every signed command still names exactly one tenant. Removing a tenant disables
effective access immediately; an explicitly signed revoke remains available.

## V1 independent-review execution authorization (preserved)

Contract: `maya.widget-release-production-authorization/1`.
Canonical sorted JSON and Ed25519 verification use the existing AR-1 primitives.
All fields are mandatory; unrecognized fields refuse admission:

```
contract, authorizationId, operation, tenantId, environment,
candidateSha, buildDigest, certificateDigest,
operatorId, approverId, reviewerId, rollbackOwnerId, expectedVersion,
notBefore, expiresAt, grantExpiresAt,
releaseId, profileId, profileDigest, evidenceDigest
```

`environment` is literally `production`. `profileId` is literally
`closed-input.no-handoff@1`; `profileDigest` is the fixed server manifest digest.
`releaseId` identifies the release decision, while the globally unique
`authorizationId` identifies this one execution/revoke decision. The owner key's
principal equals `approverId`; the authenticated current platform actor equals
`operatorId`; the independent security key's principal equals `reviewerId`.
The reviewer cannot alias the approver or operator.

Grant requires a separate security-signed fixed-profile certificate with exact
candidate/build, certificate hash, evidence digest, profile id/digest and
production environment. Every applicable evidence duty remains mandatory.
Production full165 certification is not admitted. The two global HANDOFF STOP
rows stay STOP; no caller-selected exclusions exist.

The configured running SHA and freshly computed running backend/lockfile digest
must match. Production does not reuse the earlier cached build fingerprint.
Changing bytes after an earlier validation therefore refuses later admission.
Authorization time and grant duration are each bounded by 24 hours; the grant
cannot outlive the authorization or certificate. There is no auto-renewal.

Synthetic/staging retain the V1 authorization and their existing trust,
environment/database restrictions and timing semantics. A legacy authorization
cannot be replayed in production, even if its signing key were also trusted.

## Transaction, replay and rollback

The writer rechecks the session, signatures, current clock, tenant and candidate
after acquiring authorization/tenant/row locks. The expected entitlement
version must match the complete current row. Grant/revoke and the canonical
AuditLog write commit atomically. Production additionally verifies the audit
row in that same transaction, including actor, tenant, authorization hash and
exact receipt; a silently dropped audit rolls back the entitlement.

The receipt and persisted signed command retain the actual actor, approver,
reviewer, rollback owner, release id, production environment and profile/evidence
digests. Replaying an identical consumed authorization returns its historical
receipt only; it never reapplies a grant, including after revoke. A changed
command reusing the authorization id conflicts. Another authorization with stale
CAS conflicts. Renewal requires a new explicit valid signed decision and CAS.

Revoke requires a fresh owner-signed production authorization bound to the exact
stored release, candidate, build, certificate, profile and evidence. It can run
after allowlist removal, candidate replacement, certificate expiry or tenant
suspension; a broken release must remain revocable. It still requires current
platform authority, valid execution window, CAS and atomic audit. Effective
expiry and existing old-token refusal/profile admission remain mandatory.

## Executable evidence, not execution approval

`widget-release-production.spec.ts` exercises signatures, separate trust,
environment, required fields, time windows, exact bindings, byte reread and
allowlist removal. `widget-production.live-spec.ts` uses guarded PostgreSQL and
full HTTP guards to prove dry-run, grant/revoke, concurrent/replayed requests,
stale CAS, audit rollback/no-op, rollback bindings, old-token and HANDOFF refusal.
`widget-production.binary-spec.ts` boots two built backend processes with actual
production configuration validation, ephemeral proof identities and only a
guarded loopback proof database; both observe grant/revoke/expiry consistently.
Phone/email transports are disabled. These signatures authorize synthetic proof
subjects only and are inadmissible for any real tenant or release.

The twelve `gatePU.json` mutations complement the unchanged AR-1, plan/trial,
profile, source and revocation corpus. A complete fresh corpus and CI/FBE2E
programme on the committed candidate are required before declaring this unit
certified. L23 and L26 owner acceptances remain explicit; historical reports
remain inadmissible. Production execution still needs a separate owner decision.


## V2 single-operator governance — owner decision, 2026-10-03

Certified checkpoint `77ecb3f5696583389e75592141f46fd0664d33d8` remains historical and unchanged. The owner authorizes this minimal governance extension, not production execution. A new candidate must pass fresh release admission. No prior certificate is inherited.

`maya.widget-release-production-authorization/2` uses the same controller, policy, writer, current global platform User/AuthSession, locks, CAS, TenantEntitlement configJson and atomic AuditLog. There is no schema change and no second release engine. The sole signer is the actual global platform operator: `approverId = operatorId = installed owner-key principalId`. The exact mandatory additional fields are `governance: "single-operator"` and `independentHumanReview: false`; `reviewerId` is explicitly `null`. Omitted disclosure, claimed independent review, fabricated reviewer or a second self-signature are refused.

The V2 grant command is exactly `{authorization: <one owner-signed V2 wrapper>, certificate: <raw canonical ProfileCertificate>}`. The certificate is the existing production fixed-profile shape. It has no security-signature wrapper in V2. The owner execution signature binds `certificateDigest = releaseHash(rawCertificate)`, the full certificate contents, all reviewed fresh evidence, the exact candidate/build/profile, one tenant, CAS and time window. This is an explicit single-operator attestation, not independent security review. An unsigned certificate or caller-authored JSON alone never grants authority. The strict fresh evidence collector remains the only release-admission evidence path; historical/unverified reports remain inadmissible.

All V1 production restrictions apply: exact running bytes reread, production-only trust (no staging fallback), current server allowlist, max 24 hours, no auto-renew, no plan/trial grants, HANDOFF unavailable, only the two approved HANDOFF duties outside the profile threshold. Every other applicable clause is mandatory. Synthetic/staging and V1 independent-review behavior are unchanged.

V2 status, dry-run, receipt and audit explicitly retain single-operator governance and absence of independent human review. Receipt `reviewerId` is null; actor, approver, operator, session identity hash and rollback owner remain real and auditable. Revoke uses a fresh signed V2 authorization and current CAS bound to the exact stored V2 release and its identities/disclosure. It cannot use a V1 authorization to revoke a V2 release or vice versa. Revoke after allowlist removal/build change, effective expiry and old-token refusal remain available and mandatory.

Maya remains multi-tenant. No real founder or salon ID is embedded in this implementation. A global platform operator can authorize separate releases for separate ordinary tenants, each with its own signed authorization, CAS and audit; no command transfers between tenants. The single-tenant offline preparation check is explicitly the first-launch operational boundary. It does not replace the server's multi-tenant authority model. A product tenant_owner never gains platform privileges, including when the same human operates the platform.

Executable evidence: `widget-release-single-operator.spec.ts`, `widget-single-operator.live-spec.ts`, `widget-single-operator.binary-spec.ts`, operator CLI tests and `gateSO.json` supplement the preserved V1/AR1/profile/plan/trial corpus. Only ephemeral test signers, synthetic identities and guarded loopback proof databases are used. No real production key/signature/session is generated by these tests.
