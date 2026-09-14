# Package 5 B24 / A18 — Web Push Delivery Endpoint Schema Proposal V1

**PROPOSED — OWNER APPROVAL REQUIRED. No runtime, schema or migration implementation.**

Accepted checkpoint: `b40e2474`. B23 production remediation remains accepted. The user's B24 schema/lifecycle STOP boundary applies: the existing identity foundation is reusable, but its delivery field cannot represent a Web Push subscription honestly. A Client device-count/replacement policy is also not yet approved.

## Owner decision: one device or several?

**A — recommended: MULTIPLE VERIFIED DEVICE ENDPOINTS.** Клиент может получать разрешённые Web Push уведомления на телефоне и в desktop/PWA. Предлагаемый предел V1 — **5 активных endpoints на tenant-qualified Client**, максимум 5 отдельных доставок одного разрешённого communication intent. Шестая регистрация отклоняется явно и атомарно; старое устройство автоматически не вытесняется. Замена выбранной собственной подписки выполняется явно и атомарно, не увеличивая число активных endpoints.

**B — ONE ACTIVE PUSH ENDPOINT PER CLIENT.** У клиента работает только одно устройство. Регистрация второго требует явной замены первого; прежняя подписка деактивируется. Сам факт входа с нового устройства ничего не перепривязывает. Уведомления одновременно на телефоне и компьютере недоступны.

**RECOMMENDED: A.** Legacy уже допускает несколько браузерных подписок, поэтому A сохраняет сценарий нескольких устройств. Явный предел ограничивает fan-out и хранение; автоматическое удаление действующих подписок не требуется. Число **5 — новое предложение**, а не найденная утверждённая policy или ограничение Web Push стандарта.

**WHAT BUSINESS/USER LOSES WITH A:** работа более чем пяти активных endpoints одновременно; подписки, известные только legacy registry, должны быть зарегистрированы заново после verified Client linking. Никакие исторические subscriptions автоматически не становятся canonical.

Both options use the same proposed single model. Neither option is approved by this document. Approval must cover the chosen device policy and the lifecycle/storage contract below, including bounded fan-out. No additional outreach or consent authority is proposed.

## 1. Exact reconstructed subscription and active behavior

| Concern | Observed implementation | Canonical interpretation required |
| --- | --- | --- |
| `endpoint` | Browser `PushSubscription.toJSON()` supplies a URL; SQLite stores it plaintext and globally unique. Only truthiness is validated. | Delivery address/capability, never Client identity. Nonreversible lookup key; full address encrypted. |
| `keys.p256dh` | Persisted inside the full unchecked plaintext `subscription_json`. | Browser subscription encryption public key, not Client authority. |
| `keys.auth` | Persisted in the same JSON. | Subscription encryption authentication secret; encrypted at rest, never evidence/log content. |
| `expirationTime` | Optional browser value buried in unchecked JSON; no canonical expiry lifecycle. | Nullable browser/provider metadata. It cannot extend authority, link validity or consent. No invented auth-retention TTL. |
| Browser/device | Service-worker registration plus browser subscription; raw user-agent stored as a hint. No durable device identifier. | Endpoint episode identifies a delivery capability, not hardware or a person. No new fingerprint/device identity owner. |
| Tenant/Client | No tenant, canonical Client or ClientChannelLink columns. `_authed_chat_id` resolves Telegram channel or legacy session; no-staff branch is labelled `client`. | Tenant and Client come exclusively from the active verified channel link. User/account remains optional. |
| Channel/provider | Web Push material and raw Telegram identity share a legacy registry. | Transport is `web_push`; authorizing identity provider remains the link's `maya_user` or `telegram`. These are different concepts. |
| Repeat/replacement | `ON CONFLICT(endpoint)` overwrites staff/raw identity, material and timestamp. New endpoint adds another row. | Same-owner exact repeat is a no-op. Material refresh/replacement needs explicit same-owner concurrency checks. No cross-owner reassignment. |
| Revocation | Sender physically deletes SQLite rows for selected provider errors; no durable endpoint lifecycle. | Terminal endpoint transition with sanitized evidence tied to the exact attempted episode; never change Client/link identity. |
| Send | Registration itself sends nothing. Legacy senders subsequently query raw identities and invoke `pywebpush` directly. | Only an independently authorized canonical Communication Delivery may send. Registration creates no consent or communication intent. |

Evidence: active `webhook_server.py` `_push_db` 368–392, writer 395–426, readers/deleter 429–464, senders 536–676, authentication 6117–6136, handler 10159–10203, route 12426. Published salon/Maya PWA calls are 35834/41504; published proxy `push_subscribe` is 2762/2770. The code hash was checked against the still-active B23 release during this assessment. Exact function hashes are in `evidence/package5-b24-contract-assessment.json`.

The accepted synthetic B24 probe already demonstrated legacy-session registration, plaintext persistence and endpoint reassignment. Bare unauthenticated `chat_id` was rejected. That proof was not rerun; no production subscription contents were inspected.

Protocol references clarify material semantics, not Maya business authority: [W3C Push API](https://www.w3.org/TR/2025/WD-push-api-20251201/) defines the serialized endpoint, nullable expiration and keys. [RFC 8291](https://www.rfc-editor.org/rfc/rfc8291.html) describes the subscription encryption keys/authentication secret and confidential distribution. Neither establishes a Maya Client binding.

## 2. Why the existing schema is insufficient

- **`ClientChannelLink` identity: reuse unchanged.** It provides exact tenant/Client binding, active uniqueness, verified evidence and explicit re-link history, including Clients without Maya User.
- **B9 `deliveryAddressEncrypted`: incompatible.** Its SQL envelope is bounded to 42–512 bytes. The runtime decrypts a Telegram subject or Maya User ID, validates that format and compares the recomputed *identity subject HMAC*. A Web Push JSON object is neither of those subjects. Reusing it would overwrite B9 routing and break its approved identity check. One identity link also lacks independent per-browser replacement/revocation.
- **`DevicePushToken`: insufficient as-is.** Required Maya User, plaintext token, tenant/token uniqueness and mutable User assignment do not provide Client-only ownership, verified-link evidence or encrypted full Web Push material. Extending it would mix the existing User transport contract with a different owner. Existing AC3 device registration is not reopened.
- **Delivery recipients/attempts: reuse execution foundation, not as a registry.** `MarketingCampaignRecipient` and `MarketingDeliveryAttempt` track delivery claims/outcomes; they do not register long-lived Client browser credentials.
- **EncryptionService: reuse primitives.** Existing AES-256-GCM envelope and namespaced `opaqueReference` HMAC can protect material and lookup identities. No new secret store or key-rotation policy. Identity-subject HMAC and endpoint/material HMAC must use separate namespaces.
- **Web Push transport is missing from canonical send wiring.** `package2SingleDeliveryNormalizer` currently allows inbox/APNS/Telegram. Web Push cannot masquerade as an APNS token. A reviewed Web Push transport profile/adapter within Communication Delivery is required before Web Push sending can resume; this document does not declare it already implemented or proven.

Sources: `maya-saas-backend/prisma/schema.prisma` (`ClientChannelLink`, `DevicePushToken`, delivery models); migrations `20260904090000_a18_client_channel_link_v1` and `20260905010000_client_channel_delivery_address_v1`; `src/crm/client-channel-runtime.service.ts`, `client-channel-authenticator.service.ts`, `client-channel-subject.ts`; `src/encryption/encryption.service.ts`; `src/action-engine/action-engine.registry.ts`; `src/communication-delivery/`.

## 3. Minimal proposed schema: one `ClientWebPushEndpoint` model

One row represents one immutable subscription-material episode. Replacement creates a successor and terminates the predecessor atomically; it does not overwrite historical ownership/material/evidence. No general contacts, device inventory, consent model or new identity provider is introduced.

| Proposed fields | Purpose / mutability |
| --- | --- |
| `id`, `tenantId`, `clientId`, `clientChannelLinkId` | Immutable episode and exact verified authorizing link. Composite restricted FKs to Client and `[link id, tenantId, clientId]`; no raw channel identifier or required User. |
| `endpointHash`, `hashVersion` | Immutable namespaced HMAC of the exact validated endpoint, globally comparable for conflict prevention. It is an endpoint lookup key only. |
| `subscriptionEncrypted`, `materialHash` | Immutable authenticated ciphertext of normalized full subscription and separate HMAC of that material. Encrypted envelope binds tenant, Client, link and episode. No plaintext URL/keys in other columns. |
| `registrationIdentityHash`, `policyVersion`, `createdAt` | Immutable server-derived deterministic registration identity, approved policy version and server timestamp. |
| `registrationEvidenceJson`, `registrationEvidenceHash` | Immutable sanitized proof references: verified link/evidence reference, operation identity, predecessor and material HMAC; no raw session, subject, endpoint, keys or user-agent. |
| `supersedesEndpointId` nullable | Immutable unique predecessor; exact same tenant/Client. Null on first registration. No cross-Client/tenant replacement. |
| `endedAt`, `endReason`, `terminationIdentityHash`, `terminationEvidenceJson`, `terminationEvidenceHash` nullable | First complete terminal transition only: explicit revoke, explicit replacement or confirmed permanent invalidation. All-null means active; all required terminal fields must be present together. No resurrection or physical deletion. |

Required DB guards: immutable core/evidence; complete terminal transition; composite ownership; unique registration identity; one active episode per endpoint HMAC; unique successor; no branched/reassigned history. Transaction locks on endpoint identity and tenant/Client serialize registration, replacement, limit checks and termination. All prior claims of an endpoint must belong to that same tenant/Client in V1; moving a browser to another Client requires a new browser subscription. A cross-Client endpoint transfer requires a separate future verified-rebind contract.

Proposed storage bounds V1: HTTPS endpoint at most **4096 UTF-8 bytes**, normalized plaintext subscription at most **8192 bytes**, persisted envelope at most **10963 bytes**. These are new B24 proposals, not inherited approval from B7. The envelope bound follows the existing 12-byte-IV/16-byte-tag/base64url format. Validate the standard P-256 key and auth-secret representation, required keys and finite/null expiration metadata; reject arbitrary extra fields and overflow atomically. No silent truncation, endpoint URL rewriting, compression or eviction. No plaintext request/error tracing. Encryption is performed at registration; plaintext is not recovered for ordinary reads and is decrypted only inside the delivery boundary.

`NEW MODELS PROPOSED: 1`; `NEW BUSINESS ACTION CLASSES PROPOSED: 0`; `BACKFILL: 0`. Registration/revocation/replacement are proposed narrow AC3 transport operations, consistent with the Authority Gate's separation of device registration from agent business actions. Sending remains Package 2-owned. The new transport profile is an explicit implementation requirement, not an extra business action or outreach authority.

## 4. Proposed registration, replacement and device policy

1. Reverify the authenticated channel and exactly one active tenant-qualified ClientChannelLink inside the operation. Missing, ambiguous, revoked, merged/ineligible Client or wrong tenant fails closed before persistence. A Client without Maya User uses its existing verified channel link.
2. The browser submits delivery material; it cannot select the authoritative Client, tenant, provider subject or ownership. Endpoint possession and browser Notification permission do not establish Client identity or consent. No fallback or automatic linking.
3. Validate material, compute separate HMACs and serialize ownership/limit checks. Same owner/link, endpoint and normalized material with no replacement request returns the same active episode: no ciphertext, timestamp, generation or evidence changes. Concurrent identical registrations converge.
4. Key/material refresh or changing the authorizing link requires explicit expected predecessor identity and verified same Client. It creates a successor; stale/conflicting requests fail. A new endpoint is either an additional device (A) or an explicitly selected replacement (A/B). Registration never silently selects which old device to remove.
5. Under A, cap active rows at 5 under the Client lock; under B, cap at 1. Conservatively count an unterminated row even if currently undeliverable through its link; no read lazily deactivates it. Explicit owner-authorized replacement/revocation can free that slot. Read/send eligibility still immediately rejects a revoked link.
6. Browser unsubscribe/replacement does not grant identity authority. Its canonical terminal operation requires current verified same-Client authority and exact episode. Confirmed provider invalidity can terminate only the episode referenced by its durable delivery attempt. Old failures cannot deactivate successors.

No historical SQLite migration/backfill, automatic endpoint reclamation, new retention period or AC6 cleanup scope is proposed. Historical legacy data remains untouched and cannot supply current Client ownership or delivery fallback. Key rotation must preserve identity under the existing foundation; a new rotation mechanism is outside this proposal.

## 5. Communication Delivery and invalidation

Registration sends **zero** notifications. A later existing approved communication intent must pass current consent/preferences/policy, then resolve eligible endpoints for its exact canonical Client. Enabling browser permission or creating a registry row is not consent.

Before sending, recheck the link, tenant/Client, endpoint episode and current communication authorization; decrypt and verify envelope scope, material HMAC and endpoint HMAC. A missing/invalid/decrypt-failed/revoked endpoint means no send. Unlike B9's reversible subject, the endpoint HMAC is never compared as or substituted for Client identity authority.

For proposed A, snapshot at most five eligible active endpoints ordered by server `createdAt, id`. Each child delivery identity includes canonical communication identity and endpoint episode; retry resumes the durable snapshot and outcomes, rather than adding newly registered devices. Do not send multiple episodes of the same endpoint for one intent. Registration remains independent of this fan-out and does not create a delivery.

The Web Push adapter must use canonical claim/dispatch/outcome and UNKNOWN/reconciliation handling. Network timeout/ambiguous provider acceptance is not FAILED and cannot trigger blind resend. Confirmed permanent invalidity yields a durable terminal endpoint result without Client/link reassignment. Generic auth/config failures are not endpoint revocation authority. [RFC 8030, section 7.3](https://www.rfc-editor.org/rfc/rfc8030.html#section-7.3) specifies 404 for an expired subscription; other statuses require their actual provider/operation context. Do not mechanically copy the legacy 403/404/410 deletion list.

The adapter must also validate delivery destinations and avoid arbitrary-URL/redirect access or credential logging. No subscription, address or keys enter ActionExecution, audit payloads, provider-error strings, public projection or proof artifacts. Canonical delivery evidence uses opaque identities and sanitized outcomes.

The legacy endpoint contains both Client and staff branches. This proposal authorizes a Client registry only; it must not convert staff/master identity into Client authority or silently repurpose DevicePushToken. Future active-path integration must fail closed for unsupported ownership and preserve existing approved canonical staff transports. All legacy Web Push consumers remain in the remediation inventory; merely patching the Client insert is insufficient.

## 6. Work after explicit approval — not performed here

Approve this minimal model/lifecycle/storage proposal and select A or B. Then implement additive schema with no backfill, guards, PostgreSQL concurrency/security proof, clean replay and required schema/deployment gates before migration apply. After apply, align runtime/PWA/proxy and the canonical Web Push transport; no production notification as smoke.

Required proof includes: all missing/revoked/ambiguous/forged/cross-tenant identity cases; User-less Client; exact repeat; same-endpoint races; conflicting owners; device limit races; explicit replacement and stale invalidation; plaintext absence; authenticated decryption; current consent gating; bounded durable fan-out; no legacy reads/writes; no endpoint-as-Client authority. Ratchets must cover backend, active PWA/proxy, delivery adapter and workers. The user's requested ratchets are pending implementation, not reported as enforced now.

After successful production structural/read-only verification, restart the entire 13-family Final Package 5 Gate with all requested active surfaces and Package 4 guards. Stop on a new bypass. No Wave 7/P4-11/Chapter 7, no automatic Chapter 6 completion.

```text
B24 CONTRACT RECONSTRUCTION: COMPLETE
EXISTING SCHEMA SUFFICIENT: NO
ADDITIONAL SCHEMA REQUIRED: YES
CLIENT MULTI-DEVICE POLICY ALREADY APPROVED: NO
OWNER DECISION REQUIRED: A / B + SCHEMA/LIFECYCLE V1
B24 RUNTIME REMEDIATION CAN RESUME: NO
RUNTIME/SCHEMA/MIGRATION CHANGES: 0
PRODUCTION MUTATIONS: 0
```
