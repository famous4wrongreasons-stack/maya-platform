# SB-1 successor verification: approved JSON V2

Owner decision: 2026-09-29, **APPROVE JSON V2**. Supersedes the schema STOP in the historical `reverification/SCHEMA-DECISION.md`. No new table or SQL column. No production migration, activation, SMS or YCLIENTS effect authorized. The additive migration changes checks and V2 outcome correlation only; it preserves the original V1 branch and lifecycle guard. No historical row rewrite/backfill.

## Authority and flow

An authenticated, tenant-qualified account explicitly selects `personal_client`. The backend resolves its unique unmerged Client from existing canonical User/Client lineage, and the exact latest revoked `maya_user` episode. Neither these rows nor phone equality grant authority. The canonical CRM registry supplies the phone for the active exact provider/externalId link. Ambiguity, holds, missing source or incomplete registry refuse issuance.

`POST /api/personal-client/reverification/challenge` accepts exactly `{}` and requires `x-maya-authority-context: personal_client`. It uses the existing strict SMS.ru delivery entry; debug/test/missing configuration fails closed. Response is `{challengeId, expiresAt}`; never OTP, phone, Client id, or predecessor authority. Delivery is outside the retryable database transaction.

`POST /api/personal-client/reverification/consume` accepts exactly `{challengeId, code}` with the same explicit context. It re-resolves the canonical channel, then rechecks the current session, membership, Client lineage and predecessor under the existing identity lock in a serializable transaction. No caller-selected authority fields are accepted. Successful channel-control proof creates exactly one successor through the existing ClientChannelLink writer, consumes the challenge, and writes the actual actor/session/membership/role audit in that same transaction. Failure rolls everything back. The revoked episode is not edited or reactivated.

## Immutable evidence

V1 JSON remains valid and immutable. V2 uses contract `a18.client-link-challenge.issue.v2`, policyVersion/tokenHashVersion 2 and the unchanged 600-second TTL. The original nine issuance members are retained with versioned resolver/contract. Four additional members are required:

- `mayaUserId`: current authenticated account, server-derived.
- `mayaSubjectHash`: canonical `maya_user` subject HMAC, server-derived.
- `verificationChannel`: exactly `{kind: "sms", crmLinkId, addressHash}`. The HMAC includes tenant, Client, exact CRM link/provider/externalId and normalized server-resolved phone. No raw phone is persisted in challenge evidence.
- `predecessorLinkId`: exact latest revoked same-tenant, same-Client, same-subject episode.

OTP: cryptographically random six-digit code. Stored tokenHash is a domain-separated HMAC over challenge UUID, immutable evidence digest and code; comparison uses timing-safe equality. JSONB property order is not relied upon: the coordinator rebuilds the fixed-order canonical envelope and compares exact structure plus digest. The current channel must match at consume. Possession of the authenticated account alone, historical revocation or a database phone match is insufficient.

Existing AuthRateLimitBucket persistence bounds issuance to 1/minute and 5/10 minutes per tenant/account; consume to 5 attempts per challenge and 10/10 minutes per tenant/account. Failed attempts survive verification rollback. No PhoneAuthCode repurposing or login-contract change.

## Integration and limits

The existing explicit personal-client booking route can consume the new active verified link. TENANT_OWNER remains distinct from CLIENT; CLIENT_ROLES and widgets.runtime readiness are unchanged. This unit does not activate booking entitlements or widgets. V2 schema checks must be applied through the ordinary reviewed migration workflow before this route is used in an environment; only the isolated local proof database is migrated in this task.

No production user has been reverified. The route has been exercised only with synthetic identities and intercepted/mocked SMS.ru delivery. Carrier implementation, 9.6 persisted turn identity, G6-6/G13-R8 receiver authority, AR-1 and Chapter 10 remain outside this unit.
