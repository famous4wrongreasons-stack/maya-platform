# First Client binding: current Telegram path and historical decisions

## Current owner decision and implementation — 2026-10-11

The owner clarified the intended first-client journey: Telegram login shares the
verified phone, Maya finds that person's card in the selected salon, and the
person can read their own card/history. The subsequent “работай по плану”
authorizes implementing this bounded path. This supersedes the earlier claim
that a trusted initial source is still entirely undecided. SMS is not a required
step for this **initial** path. It does not replace the historical SB-1 successor
contract or authorize restoring a revoked binding.

Canonical resolver: `a18.telegram-oidc-phone.initial.v1` in
`maya-saas-backend/src/auth/telegram-client-binding.service.ts`. Only the existing
Telegram OAuth completion owner calls it, after signature/issuer/audience/expiry
validation, single-use state claim and session issuance. The fresh signed token
must explicitly carry `phone_number_verified: true` and a complete international
phone; missing, false, string-valued or numeric flags do not authorize binding.
The token's issuance must be within ten minutes and after the login flow began
(with the bounded 30-second clock skew). There is no client-supplied Client id,
provider subject, tenant, destination, phone or stored-profile fallback at this
new entry. A skipped binding attempt does not revoke an existing link.

The server reuses the current complete tenant CRM registry, compares full
normalized numbers (not the last-ten-digit index), and requires exactly one
card. The existing CRM registrar resolves/observes that card by exact
provider/external id; it can register a Maya identity for an already existing
CRM card, but creates no new CRM customer and does not merge people by phone.
Missing or duplicate cards remain unresolved. Account-registration geography
is unchanged: existing new-account phone validation remains Russia-only.

Before persistence, the coordinator rechecks the current session, active
membership, exact Telegram identity, claimed unexpired login flow and unchanged
CRM integration. The source snapshot must remain within 60 seconds. Existing
identity locks plus a serializable transaction protect the canonical initial
link and mandatory AuditLog together. Retryable serialization/unique-link races
reread the winner. Another account's Client, an unresolved identity hold, a
merged card, a changed mapping/source, or a revoked Maya/Telegram tip cannot be
adopted. No predecessor is mutated. No new table, SQL column or migration.

`ClientChannelLinkService` remains the sole link writer. Evidence records hashes
of the signed token/session/flow and the exact source resolution; it contains no
raw phone, OTP, provider token or customer name. The audit preserves the actual
account, session and role. `TENANT_OWNER != CLIENT`: personal context still has
to be explicitly selected and resolved through the existing personal-context
owner. Login creates no privacy/marketing consent, confirmation, entitlement,
appointment or messaging permission. Missing optional CustomerProfile preferences
do not suppress an already verified personal link in `/api/me`; access is derived
from the existing verified profile reader's Client resolution.

The matching rule intentionally trusts the verified Telegram number and the
salon's unique current phone attribution for an as-yet-unbound CRM card. It
cannot independently detect a wrongly entered CRM number or number recycling.
Duplicate/currently or historically bound cards are refused rather than silently
chosen. The source currently reads a complete registry; its cost at large salon
sizes has not been qualified. No cached/raw phone shortcut was added.

Verification receipts will be recorded in
`docs/rebuild/evidence/maya-telegram-client-binding-20261011/`. Qualification is
synthetic signed Telegram + synthetic CRM source, real local HTTP/PostgreSQL.
It is not a real Telegram/CRM acceptance or a release certificate. Existing
private-card/history readers remain owners; local mirrored history is tested,
not a new import of the salon's entire remote history. The automatic login path
adds no React design or presentation behavior. Actual account acceptance,
full current CRM history synchronization, and messenger delivery remain separate
checks. The former owner's revoked episode is not repaired by this first-link unit.

Protocol source: [Telegram Login/OIDC](https://core.telegram.org/bots/telegram-login),
inspected 2026-10-11. Phone sharing and permission for direct bot messages are
separate scopes. No real messenger/SMS/OTP or provider-business request was made
for this implementation.

## Historical inventory and SMS proposal — not the current first-login path


**Owner steering, 2026-10-11:** notifications must use messengers; SMS must not be
made a mandatory launch prerequisite. The initial-only SMS proposal below remains
historical and unapproved as the current path. Existing V2 code is preserved, not
executed. A new initial messenger trust source still needs an exact contract;
Telegram login alone is not ownership of a particular Client. The existing A18
transfer from an already verified exact Client channel remains independent of
this missing bootstrap. [Current development checkpoint](MAYA-CONVERSATION-FOLLOWUPS-20261011.md).

This is a code/contract inventory, not a new identity admission or production acceptance. It corrects the overly narrow first-link boundary in the earlier [owner React checkpoint](MAYA-PERSONAL-OWNER-REACT-CHECKPOINT-20261007.md): SB-1 V2 is not the only A18 path.

| Current evidence | Existing approved owner and result |
|---|---|
| Active verified exact `maya_user` link | `PersonalClientContextService.select(..., 'personal_client')` rechecks account/session/membership and that link. SB-1 personal booking is available independently of prior appointments. No reverification is required. |
| No prior Maya subject link episode (including revoked), but another active verified exact Client channel | A18 V1 `ClientChannelRuntimeService.resolve` (`a18.active-verified-client-channel.v1`) can issue a server challenge from that source channel. `ClientLinkChallengeService.consume` authenticates the destination Maya account and creates its initial link atomically through the existing link writer. This is an existing initial-binding mechanism, not a V2 successor. |
| Exact latest revoked Maya episode and the approved canonical CRM verification channel | [SB-1 V2](widget-release-programme/sb1-v2/CONTRACT.md) issues and consumes the subject-bound successor challenge through strict SMS verification. It never reactivates the revoked row. This is only for a former binding. |
| Never-linked Maya subject, no other verified Client channel and no V2 predecessor | The runtime V1 issuer cannot resolve trusted Client authority. An unlinked Maya JWT cannot bootstrap itself through `/client-channel/challenges`. V2 cannot supply an initial predecessor. The trusted initial Client-resolution source remains a product/identity decision. |

Existing V1 code: [runtime resolver](../../maya-saas-backend/src/crm/client-channel-runtime.service.ts), [challenge owner](../../maya-saas-backend/src/crm/client-link-challenge.service.ts), [link writer](../../maya-saas-backend/src/crm/client-channel-link.service.ts). The original [A18 assessment](CYCLE-06-BLOCKING-PACKAGE-5-A18-CLIENT-LINK-CHALLENGE-ASSESSMENT.md) defines trusted exact resolution followed by a one-time server challenge. Its historical schema/TTL STOP is not a current assertion that this later implemented mechanism is absent.

The missing product decision is precisely: **if a person has no verified MAYA Client channel, which trusted source proves that a particular same-tenant Client card belongs to that person?** A User row, `Client.userId`, phone/name equality, or an operator selecting a CRM card does not provide that authority. After selecting and approving the trusted resolver, the first-time carrier flow needs its explicit initiation, verification, refusal and audit evidence through A18. No schema change or new resolver is authorized by this note.

Do not send first-time visitors through predecessor reverification. The confirmed-Client personal booking development slice can continue while this bootstrap decision is open. No real SMS, new user linkage, production query or identity mutation was performed here.

## Decision brief: smallest reuse of an existing trusted proof owner

The existing proof is **successful entry of an OTP delivered by the strict SMS owner to a number freshly resolved through the exact canonical Client→CRM link**. It currently belongs to SB-1 V2 successor verification. This is more specific than choosing an unspecified new resolver.

`ClientReverificationCandidateService` selects the one unmerged Client associated with the authenticated User, resolves its active exact `CrmClientLink(provider, externalId)`, reads the complete current CRM registry, and rechecks lineage after that external read. The destination comes from the matching CRM card, not request input, `User.phone`, or a search by number. `PhoneAuthDeliveryService` supplies the strict delivery path without debug/test fallback. Delivery alone is not proof: successful subject-bound OTP consumption is required. User→Client lineage selects a candidate only; it does not grant Client authority.

The **missing entry** is an initial-only OTP challenge/consume branch for a Maya subject with no link episode. The current `/api/personal-client/reverification/challenge` and `/consume` require the latest revoked predecessor. Existing V1 `/api/client-channel/challenges` can transfer trust from an already verified channel but cannot establish absent trust. The signed Telegram bridge is another existing transport into V1; the bridge secret or Maya JWT alone does not prove Client ownership.

The minimum decision to approve or reject is:

> Permit first binding to the account's single existing Client card after a one-time SMS code sent to the number freshly obtained from that card's exact CRM linkage. This grants access to that Client's personal bookings/history. Refuse missing or ambiguous lineage, CRM linkage or destination, and any previous Maya binding. Do not search or merge Client cards by phone.

This proposal does **not** cover a person with no unambiguous User→Client lineage. That case stays closed. It does not force first-time visitors through the successor flow.

Approval would authorize a separate initial evidence/consumption branch in the existing A18 challenge owner and initial-only link writer, preserving tenant/subject binding, expiry, rate limits and atomic consumption. It would not authorize removing the V2 predecessor guard: [the V2 migration](../../maya-saas-backend/prisma/migrations/20260929190000_client_link_challenge_json_v2/migration.sql) requires and validates predecessor evidence. A new table has not been shown necessary, but an unchanged SQL constraint cannot be promised before the approved contract is designed. No such approval, schema change or initial issuer is implemented by this brief.

Source owners: [candidate resolver](../../maya-saas-backend/src/crm/client-reverification-candidate.service.ts), [strict delivery](../../maya-saas-backend/src/auth/phone-auth-delivery.service.ts), [existing channel endpoints](../../maya-saas-backend/src/crm/client-channel.controller.ts), [V2 contract](widget-release-programme/sb1-v2/CONTRACT.md). Independent read-only review confirmed this inventory; no provider/SMS or production test was performed.

## Recipient proof and remaining risk (2026-10-07)

For the proposed initial-only branch the minimum candidate chain is authenticated account → its single unmerged same-tenant Client → one active exact provider/externalId CRM link → one matching card in a complete freshly read registry. The OTP address is the normalized phone on that card. It is never supplied by the user or taken from `User.phone`. Consumption must repeat the current resolution and compare the tenant, subject, Client, CRM link and destination binding. Foreign-tenant, missing, changed or ambiguous lineage is a refusal, not a phone search or merge.

The current successor resolver selects by exact externalId; it **does not establish uniqueness of that phone across all CRM cards**. A valid OTP establishes present control of the destination number. It does not independently exclude a shared family phone, duplicate cards, a wrongly assigned CRM number or a recycled number now controlled by someone else. Tenant scoping prevents cross-tenant lookup but is not proof of personal ownership within a tenant. The prior revoked episode required by V2 supplies a different historical boundary and cannot be silently removed.

The one owner decision is whether the sole existing account→Client→CRM chain plus current OTP is sufficient for **initial access to this Client's bookings/history**, accepting those residual risks, or whether an existing verified Client channel remains mandatory. If uniqueness across cards or an independent corroborating proof is required, it must be specified in the initial-binding contract; the current code does not prove either. No initial issuer, authorization expansion, schema modification or real OTP delivery was performed.
