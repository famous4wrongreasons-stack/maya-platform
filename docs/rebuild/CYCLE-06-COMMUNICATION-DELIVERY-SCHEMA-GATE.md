# CYCLE 06 — COMMUNICATION DELIVERY SCHEMA GATE

Дата: 2026-08-22.

Ветка: `codex/maya-brain-systemic-release-20260815`.

Проверенный HEAD до подготовки документа: `d72e498b`.

Production baseline: `20260822-c06-b22-appointment-cutover`.

Статус документа: предложение схемы для отдельного утверждения. Prisma schema,
миграции, application runtime и production database этим шагом не изменяются.

## 1. Executive decision

Существующая communication persistence **пригодна для расширения**. Новая
очередь и новые таблицы не требуются.

Минимальный target:

```text
ActionExecution
  -> MarketingCampaign (communication envelope: SINGLE или BULK)
    -> MarketingCampaignRecipient (одна logical delivery)
      -> MarketingDeliveryAttempt (execution/reconciliation attempts)
```

Техническое имя `MarketingCampaign` остаётся ради безопасной миграции, но в
canonical runtime таблица становится общим communication envelope. Для
одиночного operational/security сообщения создаётся envelope с одним
recipient. Для массовой кампании создаётся тот же envelope с audience и
несколькими recipient rows. Отдельная single-message queue запрещена.

Главный invariant:

> Для каждого recipient Maya обязана durable ответить: сообщение точно не
> отправлено, принято провайдером/доставлено, детерминированно не отправлено или
> исход неизвестен.

`UNKNOWN` является самостоятельным состоянием. Оно не является `FAILED`, не
делает recipient снова sendable и не разрешает blind retry.

## 2. Scope and non-goals

Этот gate определяет только schema contract для recipient-level delivery,
deduplication, restart safety, reconciliation и deterministic campaign
aggregation.

В scope:

- существующие `MarketingCampaign`, `MarketingCampaignRecipient` и
  `MarketingDeliveryAttempt`;
- один delivery primitive для single и bulk;
- связь с canonical `ActionExecution`;
- recipient-level identity, claim, lease, outcome и reconciliation;
- campaign aggregation из recipient truth;
- tenant-qualified references;
- privacy, retention, legacy compatibility и DB adversarial proof plan.

Вне scope:

- Prisma/schema/migration implementation;
- production data changes;
- отправка external messages;
- communication cutover;
- runtime agents;
- создание новой marketing policy;
- attendance;
- Chapter 7;
- утверждение, что provider acceptance равно прочтению пользователем.

## 3. Existing schema audit

### 3.1 Classification legend

| Class | Meaning |
| --- | --- |
| `REUSE` | Поле уже имеет подходящую canonical ответственность. |
| `EXTEND` | Поле сохраняется, но требует constraint, relation или соседнего versioned metadata. |
| `DEPRECATE` | Поле остаётся для legacy compatibility, но перестаёт быть canonical truth/control. |
| `KEEP SEPARATE` | Поле корректно, но относится к другому уровню и не должно управлять delivery lifecycle. |

### 3.2 Current topology

Текущая БД уже содержит:

```text
MarketingPolicy
MarketingAudience
  -> MarketingAudienceRecipient
MarketingCampaign
  -> MarketingCampaignRecipient
    -> MarketingDeliveryAttempt
MarketingConsentEvidence
InboxItem
DevicePushToken
ActionExecution
  -> ActionAttempt
```

Проблема не в отсутствии таблиц, а в отсутствии соединённого lifecycle:

- active sender не использует recipient/attempt rows как owner доставки;
- campaign `status` меняется независимо от recipient truth;
- campaign lease не защищает конкретного recipient;
- `InboxItem` dedup защищает строку, но не повторный APNs dispatch;
- post-dispatch timeout/crash нельзя durable представить как `UNKNOWN`;
- `ActionExecution` не связан с campaign envelope.

### 3.3 `MarketingPolicy`

| Current field | Decision | Canonical use |
| --- | --- | --- |
| `tenantId` | `REUSE` | Tenant owner и PK policy. |
| `provider` | `KEEP SEPARATE` | Tenant preference; не доказательство provider capability или delivery outcome. |
| `enabled` | `REUSE` | Policy gate до создания/исполнения campaign action. |
| `dailyRecipientLimit` | `REUSE` | Bulk limit input. |
| `monthlyRecipientLimit` | `REUSE` | Bulk limit input. |
| `maxCampaignRecipients` | `REUSE` | Bulk approval/risk input. |
| `maxCampaignCostKopecks` | `KEEP SEPARATE` | Cost guard; не delivery state. |
| `createdAt`, `updatedAt` | `REUSE` | Policy audit timestamps. |
| `tenant` | `REUSE` | Tenant-qualified owner relation. |

`MarketingPolicy` не заменяет frozen `ActionExecution` policy decision. Она
является входом policy evaluation, а не разрешением на конкретную отправку.

### 3.4 `MarketingAudience`

| Current field | Decision | Canonical use |
| --- | --- | --- |
| `id`, `tenantId` | `REUSE` | Durable tenant-scoped audience identity. |
| `createdByUserId` | `EXTEND` | Добавить tenant-qualified membership relation; system-generated audience не подменять фиктивным user. |
| `ruleJson` | `REUSE` | Frozen server-owned selection rule. |
| `recipientUserIdsJson` | `DEPRECATE` | Не использовать как execution truth; recipients принадлежат rows. |
| `candidateCount`, `eligibleCount`, `unavailableCount` | `REUSE` | Snapshot counters, не delivery counters. |
| `expiresAt` | `REUSE` | Audience validity boundary. |
| `createdAt` | `REUSE` | Snapshot audit. |
| `provider` | `KEEP SEPARATE` | Audience source/preference; actual delivery provider frozen в envelope capability. |
| `status` | `KEEP SEPARATE` | Audience lifecycle, не campaign/delivery state. |
| `snapshotHash` | `REUSE` | Immutable audience identity/evidence. |
| `exclusionReasonsJson` | `REUSE` | Aggregated audience exclusions. |
| `tenant` | `REUSE` | Tenant owner. |
| `campaigns` | `EXTEND` | Campaign FK должен включать `tenantId`. |
| `recipients` | `REUSE` | Durable audience membership. |

### 3.5 `MarketingAudienceRecipient`

| Current field | Decision | Canonical use |
| --- | --- | --- |
| `id`, `tenantId`, `audienceId` | `REUSE` | Tenant-qualified snapshot membership. |
| `externalClientId` | `REUSE` | Server-side CRM subject ref; не передавать в LLM и не использовать без tenant/provider context. |
| `internalUserId` | `EXTEND` | Если заполнен, relation должна быть tenant-qualified. |
| `eligibilityStatus` | `REUSE` | Eligibility на момент audience snapshot. |
| `exclusionReason` | `REUSE` | Почему candidate не вошёл. |
| `consentSource`, `consentRecordedAt` | `KEEP SEPARATE` | Snapshot hint; не является достаточной just-in-time delivery authorization. |
| `metricsJson` | `KEEP SEPARATE` | Selection evidence; не delivery state и не invented valuation. |
| `createdAt` | `REUSE` | Snapshot audit. |
| `tenant`, `audience` | `REUSE` | Уже tenant-qualified. |

Audience eligibility не гарантирует eligibility в момент dispatch. Consent,
opt-out, membership, destination и entitlement должны проверяться повторно до
recipient claim.

### 3.6 `MarketingCampaign`

| Current field | Decision | Canonical use |
| --- | --- | --- |
| `id`, `tenantId` | `REUSE` | Communication envelope identity. |
| `createdByUserId` | `EXTEND` | Tenant-qualified membership; nullable для system initiator, который уже доказан в `ActionExecution`. |
| `audienceId` | `EXTEND` | Tenant-qualified FK; nullable только для `SINGLE`, required для `BULK`. |
| `channel` | `REUSE` | Frozen channel для envelope. |
| `status` | `DEPRECATE` | Legacy compatibility only; новый typed `aggregateState` является canonical. |
| `message` | `DEPRECATE` | Legacy/raw presentation body; canonical identity — template/content ref + hash, body подлежит redaction. |
| `recipientUserIdsJson` | `DEPRECATE` | Не является recipient execution truth. |
| `recipientCount` | `REUSE` | Cached planned count; rows остаются authority. |
| `sentCount` | `DEPRECATE` | Не различает accepted, delivered и unknown. |
| `idempotencyKey` | `REUSE` | Envelope/action request identity, tenant-unique. |
| `expiresAt` | `REUSE` | Pre-dispatch validity boundary. |
| `sentAt` | `DEPRECATE` | Ambiguous legacy timestamp; не заменяет recipient outcomes. |
| `createdAt`, `updatedAt` | `REUSE` | Envelope audit. |
| `provider` | `REUSE` | Frozen provider key, проверяемый capability registry. |
| `audienceSnapshotHash` | `REUSE` | Approved audience snapshot identity. |
| `messageSnapshotHash` | `REUSE` | Canonical normalized template/content identity. |
| `confirmationHash` | `REUSE` | Compact approval input proof; full approval остаётся в `ActionExecution`. |
| `confirmedAt`, `confirmedByUserId` | `EXTEND` | Tenant-qualified approver relation; compatibility projection from `ActionExecution`. |
| `costEstimateKopecks`, `costEstimateStatus`, `costCurrency` | `KEEP SEPARATE` | Pre-send estimate/risk metadata; не outcome и не recovered revenue. |
| `scheduledFor`, `queuedAt`, `startedAt` | `REUSE` | Envelope planning/coordinator timestamps. |
| `completedAt`, `cancelledAt` | `REUSE` | Set only from deterministic aggregate transition. |
| `leaseOwner`, `leaseExpiresAt` | `EXTEND` | Envelope coordination only; add token/revision. Не заменяет recipient lease. |
| `retryCount` | `DEPRECATE` | Telemetry only; запрещено использовать как `retryCount < 3` policy. |
| `lastErrorCode` | `KEEP SEPARATE` | Aggregate explanation cache, не recipient truth. |
| `acceptedCount`, `failedCount`, `skippedCount`, `unknownCount` | `REUSE` | Recomputed cached projections from recipient rows. |
| `tenant` | `REUSE` | Tenant owner. |
| `audience` | `EXTEND` | Исправить relation на `[audienceId, tenantId]`. |
| `recipients`, `deliveryAttempts` | `REUSE` | Existing delivery hierarchy. |

### 3.7 `MarketingCampaignRecipient`

Это целевой shared delivery primitive. Таблица не должна оставаться только
маркетинговой по runtime semantics.

| Current field | Decision | Canonical use |
| --- | --- | --- |
| `id`, `tenantId`, `campaignId` | `REUSE` | Одна delivery внутри одного tenant-scoped envelope. |
| `externalClientId` | `EXTEND` | Legacy/server target ref; canonical identity добавляет non-PII `recipientRefHash`. |
| `internalUserId` | `EXTEND` | Tenant-qualified membership relation для in-app/internal recipient. |
| `idempotencyKey` | `EXTEND` | Для lifecycle v1 становится versioned logical-delivery fingerprint; timestamp запрещён. |
| `status` | `DEPRECATE` | Legacy free-form state; новый typed `deliveryState` является authority. |
| `attemptCount` | `REUSE` | Derived attempt telemetry, не retry permission. |
| `nextAttemptAt` | `EXTEND` | Заполняется только после channel policy decision и никогда при unresolved `UNKNOWN`. |
| `acceptedAt`, `deliveredAt`, `failedAt` | `REUSE` | Outcome timestamps с точной semantics. |
| `providerMessageId` | `DEPRECATE` | Latest compatibility projection; immutable provider refs принадлежат attempts. |
| `providerStatus` | `DEPRECATE` | Latest compatibility projection; normalized outcome принадлежит typed state/attempt. |
| `lastErrorCode` | `KEEP SEPARATE` | Safe latest diagnostic projection. |
| `createdAt`, `updatedAt` | `REUSE` | Delivery audit timestamps. |
| `tenant`, `campaign` | `REUSE` | Tenant-qualified parent relations. |
| `deliveryAttempts` | `REUSE` | Immutable sequence under the same logical delivery. |

### 3.8 `MarketingDeliveryAttempt`

Существующей attempt table достаточно; новую создавать не нужно.

| Current field | Decision | Canonical use |
| --- | --- | --- |
| `id`, `tenantId`, `campaignId` | `REUSE` | Attempt audit scope. |
| `recipientId` | `EXTEND` | Nullable только для legacy; required для lifecycle v1. |
| `batchKey` | `KEEP SEPARATE` | Provider batching/correlation, не logical delivery identity. |
| `attemptNumber` | `EXTEND` | Добавить tenant+recipient uniqueness; monotonic across execution/reconciliation. |
| `status` | `DEPRECATE` | Legacy free-form state; заменить typed `kind`, `state`, `externalDispatchState`. |
| `httpStatus` | `REUSE` | Transport evidence; не business outcome. |
| `providerResponseCode` | `REUSE` | Safe provider response code. |
| `errorCode` | `REUSE` | Normalized safe diagnostic. |
| `startedAt` | `REUSE` | Claim/attempt start. |
| `completedAt` | `EXTEND` | Attempt finish; добавить отдельные dispatch/response timestamps. |
| `createdAt` | `REUSE` | Immutable audit timestamp. |
| `tenant` | `REUSE` | Tenant owner. |
| `campaign` | `EXTEND` | Должен совпадать с campaign recipient на уровне composite FK. |
| `recipient` | `EXTEND` | Canonical rows require tenant+campaign-qualified recipient relation. |

### 3.9 `MarketingConsentEvidence`

| Current field | Decision | Canonical use |
| --- | --- | --- |
| `id`, `tenantId` | `EXTEND` | Добавить composite unique `[id, tenantId]` для safe delivery FK. |
| `externalClientId`, `channel` | `REUSE` | Tenant/channel-scoped consent subject. |
| `status`, `source`, `evidenceRef` | `REUSE` | Current consent/opt-out evidence. |
| `grantedAt`, `revokedAt`, `expiresAt` | `REUSE` | Consent validity timeline. |
| `createdAt`, `updatedAt` | `REUSE` | Consent audit. |
| `tenant` | `REUSE` | Tenant owner. |

Current authority is fragmented: active sender checks
`CustomerProfile.marketingConsentAt`, while the richer
`MarketingConsentEvidence` contains revocation/expiry. Before any external
marketing cutover one authoritative consent contract must be selected and used
both at audience construction and immediately before claim. This is an
implementation blocker, not a reason for another table.

### 3.10 `InboxItem` and `DevicePushToken`

| Current field/group | Decision | Canonical use |
| --- | --- | --- |
| `InboxItem.(tenantId,userId,type,sourceEventId)` unique key | `REUSE` | Exact in-app storage dedup only. |
| `InboxItem.bodyText`, `payloadJson` | `EXTEND` | Apply payload retention/redaction; never treat as external delivery proof. |
| `InboxItem.readAt`, `archivedAt`, `deletedAt` | `KEEP SEPARATE` | User interaction/content lifecycle, not send outcome. |
| `DevicePushToken.(tenantId,token)` unique key | `REUSE` | Destination registry. |
| `DevicePushToken.token` | `EXTEND` | Secret-like destination data: encrypted/limited access in a later security package. |

`InboxItem` row existence can prove in-app persistence. It cannot prove APNs
acceptance or device delivery. In-app storage and APNs announcement therefore
become separate recipient-channel deliveries under the same approved action.

### 3.11 `ActionExecution` and `ActionAttempt`

| Existing owner | Decision | Boundary |
| --- | --- | --- |
| `ActionExecution` identity/idempotency | `REUSE` | One authorized communication action. |
| `ActionExecution` policy/approval/risk | `REUSE` | Full authorization truth. |
| `ActionExecution` lease/retry/reconciliation | `KEEP SEPARATE` | Action-level lifecycle; cannot replace recipient lifecycle. |
| `ActionAttempt` | `KEEP SEPARATE` | Action executor attempt; cannot represent hundreds of recipient outcomes. |
| Existing `ExternalDispatchState` enum | `REUSE` | Also suitable for delivery attempts. |
| Existing action attempt/reconciliation enums | `REUSE` | Shared vocabulary, separate rows and truth owners. |

`ActionExecution.SUCCEEDED` never means “recipient read the message”. It means
the communication action reached its policy-defined aggregate terminal result.
Recipient truth remains in recipient/attempt rows.

## 4. Storage dedup and delivery dedup

These guarantees are different:

| Guarantee | Owner | Proof |
| --- | --- | --- |
| No duplicate inbox row | `InboxItem` | Existing unique storage key. |
| No duplicate logical delivery row | `MarketingCampaignRecipient` | Tenant-scoped logical delivery unique key. |
| No two workers dispatch same recipient concurrently | Recipient claim/lease | Atomic DB claim with lease token and revision. |
| No second Maya dispatch after uncertain first dispatch | Recipient state machine | `UNKNOWN` is not claimable and has no `nextAttemptAt`. |
| Provider exactly-once delivery | Provider | Only possible when provider offers a documented idempotency contract. |

For providers without idempotency Maya can guarantee **no second application
dispatch after uncertainty**, not external exactly-once delivery. Safety is
obtained by accepting possible non-delivery instead of risking duplicate
delivery.

## 5. Minimal schema extension

### 5.1 Table decision

| Table | Decision | Reason |
| --- | --- | --- |
| `MarketingCampaign` | Extend | Generic communication envelope for `SINGLE` and `BULK`. |
| `MarketingCampaignRecipient` | Extend | Shared recipient-level delivery primitive. |
| `MarketingDeliveryAttempt` | Extend | Execution and reconciliation attempts. |
| `MarketingAudience*` | Reuse | Bulk audience only. |
| `MarketingConsentEvidence` | Extend relation constraints | Existing consent candidate is sufficient structurally. |
| New `CommunicationDelivery` table | Reject | Would create a second queue beside an already suitable recipient table. |
| New `SingleMessage` table | Reject | Single is a one-recipient envelope. |
| New `DeliveryReconciliation` table | Reject now | Reconciliation is an attempt kind under the same delivery. |

No database table rename is required. A future Prisma-only model alias with
`@@map("MarketingCampaignRecipient")` may improve terminology, but it is
technical debt and not part of this gate.

### 5.2 Typed states

Conceptual enums, not applied:

```prisma
enum CommunicationScope {
  SINGLE
  BULK
}

enum CommunicationDeliveryState {
  NOT_SENT
  ACCEPTED
  DELIVERED
  FAILED
  UNKNOWN
  SKIPPED
}

enum CommunicationCampaignState {
  DRAFT
  READY
  RUNNING
  UNRESOLVED
  COMPLETED
  PARTIAL
  FAILED
  SKIPPED
  CANCELLED
  EXPIRED
  LEGACY_UNRESOLVED
}
```

`ACCEPTED` means only what the provider contract proves: the provider accepted
or created the message. `DELIVERED` is set only when the provider offers
trustworthy delivery evidence. Neither state means “read”.

`SKIPPED` means Maya proved before dispatch that the recipient must not be
sent: consent revoked, destination unavailable, policy denied, entitlement
absent, campaign cancelled or envelope expired.

### 5.3 Conceptual `MarketingCampaign` delta

```prisma
model MarketingCampaign {
  // Existing fields stay. These are conceptual deltas only.
  lifecycleVersion            Int                         @default(0)
  scope                       CommunicationScope?
  actionExecutionId           String?
  aggregateState              CommunicationCampaignState?

  contentRef                  String?
  deliveryCapabilityKey       String?
  deliveryCapabilityVersion   Int?
  retryPolicyKey              String?
  retryPolicyVersion          Int?
  reconciliationPolicyKey     String?
  reconciliationPolicyVersion Int?

  leaseTokenHash              String?
  revision                    Int                         @default(0)
  payloadRetentionUntil       DateTime?
  auditRetentionUntil         DateTime?

  // Broaden existing constraints for system/single communication.
  createdByUserId             String?
  audienceId                  String?

  actionExecution ActionExecution? @relation(
    fields: [actionExecutionId, tenantId],
    references: [id, tenantId],
    onDelete: Restrict
  )
  audience MarketingAudience? @relation(
    fields: [audienceId, tenantId],
    references: [id, tenantId],
    onDelete: Restrict
  )

  @@unique([tenantId, actionExecutionId])
  @@index([tenantId, aggregateState, scheduledFor, leaseExpiresAt])
}
```

Rules:

| Rule | Required behavior |
| --- | --- |
| `lifecycleVersion = 0` | Legacy row; typed fields may be null and canonical worker cannot dispatch it. |
| `lifecycleVersion = 1` | `scope`, `actionExecutionId`, `aggregateState`, capability and policy versions are required. |
| `scope = SINGLE` | `audienceId` is null; exactly one recipient is created in the same transaction. |
| `scope = BULK` | `audienceId` and `audienceSnapshotHash` are required. |
| `messageSnapshotHash` | Required and non-empty for lifecycle v1. |
| `confirmationHash` | Required when ActionExecution approval is `APPROVED`; not a replacement for ActionExecution. |
| Campaign lease | Coordinator/aggregation only; it never authorizes recipient dispatch. |

### 5.4 Conceptual `MarketingCampaignRecipient` delta

The existing `idempotencyKey` is reused as the durable logical-delivery
fingerprint for lifecycle v1. Existing legacy values remain untouched.

```prisma
model MarketingCampaignRecipient {
  // Existing fields stay. These are conceptual deltas only.
  lifecycleVersion          Int                        @default(0)
  identityVersion           Int?
  recipientKind             String?
  recipientRefHash          String?
  contentIdentityHash       String?

  deliveryState             CommunicationDeliveryState?
  externalDispatchState     ExternalDispatchState?
  reconciliationState       ActionReconciliationState?

  eligibilityBasis          String?
  eligibilityDecision       String?
  eligibilityPolicyVersion  Int?
  eligibilityEvidenceRef    String?
  eligibilityEvidenceHash   String?
  eligibilityCheckedAt      DateTime?
  consentEvidenceId         String?

  leaseOwner                String?
  leaseTokenHash            String?
  leaseExpiresAt            DateTime?
  revision                  Int                        @default(0)

  dispatchedAt              DateTime?
  responseReceivedAt        DateTime?
  unknownAt                 DateTime?
  terminalAt                DateTime?
  terminalReasonCode        String?
  payloadRetentionUntil     DateTime?
  auditRetentionUntil       DateTime?

  internalMembership Membership? @relation(
    fields: [internalUserId, tenantId],
    references: [userId, tenantId],
    onDelete: Restrict
  )
  consentEvidence MarketingConsentEvidence? @relation(
    fields: [consentEvidenceId, tenantId],
    references: [id, tenantId],
    onDelete: Restrict
  )

  @@unique([id, tenantId, campaignId])
  @@index([tenantId, campaignId, deliveryState, nextAttemptAt])
  @@index([tenantId, reconciliationState, leaseExpiresAt])
}
```

The existing unique constraint `(tenantId, idempotencyKey)` remains the
delivery dedup barrier. For lifecycle v1 `idempotencyKey` is not a caller label;
it is the deterministic HMAC fingerprint defined in section 7.

### 5.5 Conceptual `MarketingDeliveryAttempt` delta

```prisma
model MarketingDeliveryAttempt {
  // Existing fields stay. These are conceptual deltas only.
  lifecycleVersion             Int                    @default(0)
  kind                         ActionAttemptKind?
  state                        ActionAttemptState?
  externalDispatchState        ExternalDispatchState?

  providerRequestIdentityHash  String?
  providerIdempotencyKeyHash   String?
  providerReferenceEncrypted   String?
  providerReferenceHash        String?
  outcomeCode                  String?
  retryDecisionCode            String?
  reconciliationRequired       Boolean?

  dispatchedAt                 DateTime?
  responseReceivedAt           DateTime?
  payloadRetentionUntil        DateTime?

  recipient MarketingCampaignRecipient? @relation(
    fields: [recipientId, tenantId, campaignId],
    references: [id, tenantId, campaignId],
    onDelete: Cascade
  )

  @@unique([tenantId, recipientId, attemptNumber])
  @@index([tenantId, state, startedAt])
  @@index([tenantId, providerReferenceHash])
}
```

Canonical lifecycle v1 requires non-null `recipientId`, `kind`, `state`,
`externalDispatchState` and `reconciliationRequired`. The nullable shape exists
only so production legacy rows remain truthful.

### 5.6 Required DB constraints not fully expressible in Prisma

The migration implementation must add explicit PostgreSQL constraints:

| Constraint | Purpose |
| --- | --- |
| Campaign lifecycle-v1 completeness | Typed state, ActionExecution and frozen capability/policy versions cannot be null. |
| Campaign scope check | `SINGLE` has no audience; `BULK` has tenant-qualified audience. |
| Recipient lifecycle-v1 completeness | Typed state, identity, evidence decision and dispatch/reconciliation states cannot be null. |
| Recipient lease tuple | `leaseOwner`, `leaseTokenHash`, `leaseExpiresAt` are all null or all non-null. |
| Recipient `UNKNOWN` | Requires `MAY_HAVE_CROSSED`, reconciliation not `NOT_REQUIRED`, `nextAttemptAt IS NULL`. |
| Recipient terminal state | Terminal timestamp required; active lease forbidden. |
| Recipient `DELIVERED` | `deliveredAt` required. |
| Recipient `ACCEPTED` | `acceptedAt` required. |
| Recipient `FAILED` | `failedAt` required. |
| Attempt lifecycle-v1 completeness | Recipient, kind, typed state and dispatch state required. |
| Attempt numbering | `attemptNumber >= 1`; unique per tenant+recipient. |
| Attempt `UNKNOWN` | Requires `MAY_HAVE_CROSSED` and `reconciliationRequired = true`. |
| Tenant/action relation | Campaign ActionExecution must share tenant. |
| Tenant/campaign/recipient relation | Recipient and attempt must share tenant and campaign. |
| Consent relation | Referenced consent evidence must share tenant. |

Exactly-one-recipient for `SINGLE` is created transactionally. The adversarial
suite must also query for cardinality violations. If DB-only enforcement is
required after load testing, add a narrowly scoped deferred trigger in a later
approved migration; this gate does not hide one in application code.

## 6. Logical delivery identity

### 6.1 Identity material

For lifecycle v1:

```text
idempotencyKey = HMAC-SHA-256(
  identityVersion
  | tenantId
  | ActionExecution.identityFingerprint
  | campaign.idempotencyKey
  | recipientKind
  | recipientRefHash
  | channel
  | contentIdentityHash
)
```

Rules:

- `recipientRefHash` is generated from a stable tenant/provider-qualified
  subject reference, never a raw phone or email;
- `contentIdentityHash` includes normalized template id/version and normalized
  recipient variables, or a normalized body hash when no template exists;
- `campaign.idempotencyKey` distinguishes two separately approved bulk sends;
- ActionExecution identity distinguishes a newly authorized action from replay;
- timestamp, worker id, retry number and provider response id are excluded;
- a caller-supplied provider idempotency key, when supported, is derived from
  this identity and stored as a hash on the attempt;
- a provider-assigned message id is correlation evidence, not logical identity.

### 6.2 Dedup behavior

| Scenario | Result |
| --- | --- |
| Same tenant, action, recipient, channel and content | Existing recipient row is returned; no new claim or dispatch. |
| Same recipient, new approved ActionExecution | New logical delivery is allowed. |
| Same content, different recipient | New logical delivery is allowed. |
| Same fingerprint material in another tenant | Allowed because uniqueness is tenant-qualified. |
| Retry/reconciliation | New attempt under the same recipient row. |

The application must not catch a uniqueness conflict and then create a random
key. It must load the existing row and continue its current state.

## 7. Recipient delivery state machine

### 7.1 States

| State | Meaning | Terminal |
| --- | --- | ---: |
| `NOT_SENT` | Maya has no evidence that dispatch crossed the external boundary. | No, unless skipped separately. |
| `ACCEPTED` | Provider acknowledged/created the message. | Provider-capability dependent. |
| `DELIVERED` | Provider supplied trustworthy delivery evidence. | Yes. |
| `FAILED` | Deterministic terminal rejection or safe pre-dispatch attempts exhausted. | Yes. |
| `UNKNOWN` | Provider may have accepted, but Maya cannot prove accepted or not sent. | No; blocked pending reconciliation/manual resolution. |
| `SKIPPED` | Policy/consent/expiry/destination prevented dispatch. | Yes. |

`terminalAt`, rather than only the state name, tells aggregation whether
`ACCEPTED` is terminal for the frozen provider capability.

### 7.2 Allowed transitions

```text
NOT_SENT
  -> SKIPPED
  -> FAILED
  -> ACCEPTED
  -> UNKNOWN

ACCEPTED
  -> DELIVERED
  -> FAILED          (later trustworthy provider outcome)
  -> UNKNOWN         (reconciliation lost/ambiguous before terminal)

UNKNOWN
  -> ACCEPTED
  -> DELIVERED
  -> FAILED
  -> NOT_SENT        (only provider proof that dispatch did not occur)
  -> UNKNOWN         (still unresolved)
```

Forbidden transitions:

- `UNKNOWN -> NOT_SENT` based only on timeout, restart or expired lease;
- `UNKNOWN -> new execution attempt` without reconciliation proof;
- terminal state -> `NOT_SENT`;
- `SKIPPED -> send` under the same ActionExecution;
- recipient task creation changing outcome;
- aggregate campaign status changing recipient truth.

## 8. Attempt model and dispatch boundary

### 8.1 Claim and attempt start

Recipient claim and attempt creation happen in one DB transaction:

1. lock/claim one eligible `NOT_SENT` recipient;
2. assign owner, random lease token hash, expiry and increment revision;
3. create the next unique attempt with `kind=EXECUTION`, `state=STARTED` and
   `externalDispatchState=NOT_CROSSED`;
4. commit before any network operation.

Two workers must use an atomic compare-and-set or `FOR UPDATE SKIP LOCKED`.
Reading then updating in separate transactions is forbidden.

### 8.2 Before network dispatch

Immediately before the transport call, one transaction records:

```text
attempt.externalDispatchState = MAY_HAVE_CROSSED
attempt.dispatchedAt = now()
recipient.externalDispatchState = MAY_HAVE_CROSSED
recipient.dispatchedAt = now()
```

This conservative boundary can create a false `UNKNOWN` if the process dies
between commit and socket write. That is acceptable: a missed message is safer
than an unprovable duplicate.

### 8.3 Known response

| Provider result | Attempt | Recipient |
| --- | --- | --- |
| Accepted/created | `SUCCEEDED`, `ACKNOWLEDGED` | `ACCEPTED`; terminal only if capability says so. |
| Delivered status | reconciliation attempt `SUCCEEDED` | `DELIVERED`, terminal. |
| Deterministic reject | `FAILED`, `ACKNOWLEDGED` | `FAILED`, terminal. |
| Safe pre-dispatch failure | `FAILED`, `NOT_CROSSED` | remains `NOT_SENT`; policy may set `nextAttemptAt`. |
| Timeout/connection loss after boundary | `UNKNOWN`, `MAY_HAVE_CROSSED` | `UNKNOWN`; reconciliation required; no retry time. |

### 8.4 Crash recovery

| Expired lease evidence | Recovery |
| --- | --- |
| Latest attempt `NOT_CROSSED` | Lease can be reclaimed under the same delivery identity. |
| Latest attempt `MAY_HAVE_CROSSED` with no known response | Mark attempt and recipient `UNKNOWN`; do not resend. |
| Latest attempt `ACKNOWLEDGED`, recipient nonterminal | Start reconciliation if capability permits. |
| Recipient terminal | Clear stale lease; never dispatch again. |

## 9. UNKNOWN semantics

`UNKNOWN` is mandatory when all of these are true:

1. Maya crossed or may have crossed the dispatch boundary;
2. no trustworthy provider response was durably recorded;
3. provider acceptance/non-acceptance cannot currently be proved.

Consequences:

- no `nextAttemptAt`;
- recipient is excluded from execution claim query;
- campaign aggregate is `UNRESOLVED`;
- ActionExecution reconciliation becomes required/manual as appropriate;
- no success, failure, sent count or recovered outcome is invented;
- manual operator action cannot silently reset to sendable; it must record a
  versioned reconciliation decision and reason.

## 10. Reconciliation

Reconciliation is another `MarketingDeliveryAttempt` with
`kind=RECONCILIATION`. It does not resend content.

| Reconciliation result | Recipient transition | Retry allowed |
| --- | --- | ---: |
| Provider proves accepted | `UNKNOWN -> ACCEPTED` | No. |
| Provider proves delivered | `UNKNOWN/ACCEPTED -> DELIVERED` | No. |
| Provider proves deterministic failure | `UNKNOWN/ACCEPTED -> FAILED` | No under same action. |
| Provider proves request did not occur | `UNKNOWN -> NOT_SENT` | Yes, under frozen channel policy and same identity. |
| Provider still cannot decide | stays `UNKNOWN` | No. |
| Provider has no reconciliation capability | stays `UNKNOWN`, `MANUAL_REQUIRED` | No. |

Provider reference and request identity are stored only when required for
status lookup. Raw provider payloads and credentials are forbidden.

## 11. Provider capability limits

The capability registry must freeze behavior by provider/version. A provider
name or HTTP success alone is insufficient.

| Channel/provider | Provider reference after success | Status reconciliation | Proof of non-send after timeout | Provider idempotency | Safe post-timeout retry |
| --- | --- | --- | --- | --- | --- |
| Maya in-app inbox | `InboxItem.id` | Exact DB lookup | Yes, via transaction/unique row | Internal unique key | Yes before commit; after commit row already exists. |
| APNs | `apns-id` request/response correlation | Production per-message delivery query is not a general runtime contract | No | No documented exact-send idempotency; collapse id is coalescing, not proof | No. |
| Telegram Bot API | Returned `Message.message_id` on success | No general outgoing-message delivery-status query in `sendMessage` contract | No when response is lost | No documented `sendMessage` idempotency key | No. |
| SMS.ru | `sms_id` when response is received | Yes by `sms_id`, plus provider webhook | No if timeout occurred before `sms_id` was captured | No documented request idempotency key | Only after provider proves not sent. |
| SMTP/email | SMTP response, optional `Message-ID`/DSN envelope id | DSN only when supported and received | No after ambiguous DATA/connection result | `Message-ID` is not send idempotency | No. |
| `yclients_sms` | Not proven by current runtime | Not proven | Not proven | Not proven | Disabled until an official adapter contract is verified. |

Evidence:

- Apple documents `apns-id`, HTTP response status and best-effort delivery;
  production delivery is not equivalent to a `200` response:
  [Sending notification requests to APNs](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns),
  [Handling notification responses from APNs](https://developer.apple.com/documentation/usernotifications/handling-notification-responses-from-apns),
  [Viewing push status](https://developer.apple.com/documentation/usernotifications/viewing-the-status-of-push-notifications-using-metrics-and-apns).
- Telegram documents that successful `sendMessage` returns a `Message`, but
  the method has no request idempotency parameter:
  [Telegram Bot API — sendMessage](https://core.telegram.org/bots/api#sendmessage).
- SMS.ru documents a returned send result and a separate status lookup by
  `sms_id`:
  [SMS.ru send](https://sms.ru/docs/api/api_group_sms/send),
  [SMS.ru status](https://sms.ru/docs/api/api_group_sms/status).
- SMTP acceptance and optional DSN are transport semantics, not an exact-once
  user-delivery contract:
  [RFC 5321](https://www.rfc-editor.org/rfc/rfc5321),
  [RFC 3461](https://www.rfc-editor.org/rfc/rfc3461).

Absence of a documented idempotency/status method is treated conservatively as
unsupported. It is not inferred from a provider id or a successful response.

## 12. Campaign aggregate state

Recipient rows are authority. Campaign state and counters are a projection
recomputed transactionally or by an idempotent projector.

### 12.1 Deterministic precedence

| Condition | Aggregate state |
| --- | --- |
| Legacy row lacks canonical recipient truth | `LEGACY_UNRESOLVED`. |
| Any recipient is `UNKNOWN` | `UNRESOLVED`. |
| Any recipient has an expired post-dispatch lease | First normalize recipient to `UNKNOWN`, then `UNRESOLVED`. |
| Any recipient is nonterminal/claimable/in-flight and none is `UNKNOWN` | `RUNNING`. |
| All terminal and all successful (`ACCEPTED` terminal or `DELIVERED`) | `COMPLETED`. |
| All terminal and all `FAILED` | `FAILED`. |
| All terminal and all `SKIPPED` due cancellation | `CANCELLED`. |
| All terminal and all `SKIPPED` due pre-dispatch expiry | `EXPIRED`. |
| All terminal and all other `SKIPPED` | `SKIPPED`. |
| All terminal with mixed success/failure/skipped | `PARTIAL`. |

`COMPLETED` is forbidden while a recipient has:

- `UNKNOWN`;
- an active claim;
- a safe retry scheduled;
- `ACCEPTED` without `terminalAt`;
- a reconciliation requirement not resolved.

### 12.2 Counters

Cached counters are derived as follows:

```text
recipientCount = count(all recipient rows)
acceptedCount  = count(ACCEPTED or DELIVERED)
failedCount    = count(FAILED)
skippedCount   = count(SKIPPED)
unknownCount   = count(UNKNOWN)
```

`sentCount` remains a legacy compatibility field and cannot drive state. A
transaction that updates aggregate state must compute from recipient rows in
the same tenant/campaign scope and use revision compare-and-set.

## 13. Stuck-sending recovery

There is no permanent `sending` lock in lifecycle v1.

Restart recovery:

1. find lifecycle-v1 envelopes in `RUNNING` or legacy `status=sending`;
2. inspect every recipient lease and latest attempt;
3. reclaim only expired `NOT_CROSSED` recipients;
4. convert expired `MAY_HAVE_CROSSED` recipients to durable `UNKNOWN`;
5. leave terminal recipients unchanged;
6. recompute counts and aggregate state;
7. mark envelopes with unresolved recipients `UNRESOLVED`;
8. quarantine legacy `sending` rows without canonical evidence as
   `LEGACY_UNRESOLVED` in the reader, never as sent/failed.

Campaign lease expiry permits another coordinator to recompute. It does not
permit recipient dispatch. Recipient lease is the only delivery claim.

## 14. Single-message integration

Single and bulk share exactly the same recipient and attempt state machine.

| Property | Single | Bulk |
| --- | --- | --- |
| `MarketingCampaign.scope` | `SINGLE` | `BULK` |
| Audience | null | Frozen `MarketingAudience` required |
| Recipient rows | exactly one | one per eligible recipient |
| Approval | Action-class policy; may be not required | Bulk-specific risk/approval required |
| Consent basis | transactional/security/staff/marketing as policy says | Marketing consent/opt-out revalidated per recipient |
| Delivery identity | tenant+execution+recipient+channel+content | Same plus approved campaign identity |
| Attempts | shared table | shared table |
| Aggregate | one-recipient projection | multi-recipient projection |

Examples that become `SINGLE` envelopes:

- in-app owner alert;
- APNs announcement for one inbox item;
- one Telegram operational message;
- one appointment reminder;
- auth SMS/email after separate security approval policy.

Authentication remains a separate action/policy family even though it can
reuse the same delivery persistence.

## 15. ActionExecution linkage

`MarketingCampaign.actionExecutionId` is mandatory for lifecycle v1 and has a
tenant-qualified FK to `ActionExecution`.

Required separation:

| Layer | Owns |
| --- | --- |
| `ActionExecution` | actor/system source, action identity, authorization, risk, approval, execution/reconciliation aggregate. |
| Campaign envelope | frozen channel/provider/content/audience and aggregate recipient projection. |
| Recipient delivery | one recipient-channel identity, eligibility proof, claim and outcome. |
| Delivery attempt | one execution/reconciliation operation and transport evidence. |

ActionExecution finalization:

- any unresolved recipient makes action reconciliation required and prevents
  false `SUCCEEDED`;
- all recipients terminal allows policy-defined action finalization;
- recipient `SKIPPED` does not automatically make ActionExecution failed;
- ActionExecution cannot rewrite recipient outcomes;
- one ActionExecution has at most one envelope in this v1 contract.

## 16. Approval and risk linkage

The full decision remains in existing `ActionExecution` fields:

- `actionClass`;
- `riskFacetsJson` and version;
- `policyKey` and `policyVersion`;
- `policyDecision`;
- autonomy level;
- approval requirement, decision, input hash, timestamps and approver.

Campaign stores only the minimum frozen proof:

- `actionExecutionId`;
- `scope`;
- `channel` and provider capability version;
- `recipientCount`/audience snapshot hash;
- message snapshot hash/content ref;
- existing confirmation hash/time/user compatibility fields.

No LLM text can modify recipient scope, channel, policy decision, consent basis
or approval after ActionExecution is frozen.

## 17. Consent and eligibility boundary

### 17.1 Required delivery evidence

Before claim, each lifecycle-v1 recipient receives:

- `eligibilityBasis`: versioned basis such as marketing consent,
  transactional contract, security authentication or staff operation;
- `eligibilityDecision`: allow/deny/skip result;
- `eligibilityPolicyVersion`;
- evidence ref/hash and check timestamp;
- consent evidence id when marketing consent applies.

The evidence is minimal and contains no raw CRM payload.

### 17.2 Revalidation

Bulk audience eligibility is revalidated immediately before claim. A revoked
consent, expired evidence, inactive tenant membership, missing destination or
opt-out produces `SKIPPED` before `MAY_HAVE_CROSSED`.

### 17.3 Open blocker

`CustomerProfile.marketingConsentAt` and `MarketingConsentEvidence` currently
compete as consent truth. External marketing implementation cannot proceed
until one authoritative read/write contract is approved. Recommended target:
`MarketingConsentEvidence` owns current channel-specific status including
revocation/expiry; CustomerProfile becomes compatibility projection.

This blocker does not prevent schema approval, in-app operational shadow or
recipient lifecycle implementation. It does prevent external marketing
cutover.

## 18. Concurrency and leases

### 18.1 Claim predicate

A recipient is claimable only when all are true:

```text
lifecycleVersion = 1
deliveryState = NOT_SENT
externalDispatchState = NOT_CROSSED
reconciliationState in (NOT_REQUIRED, RESOLVED)
nextAttemptAt is null or due
terminalAt is null
lease is absent or expired
campaign is READY/RUNNING and unexpired
ActionExecution is authorized and executable
eligibility has just been revalidated
```

The DB update includes current revision and returns the row. Exactly one worker
can receive a lease token.

### 18.2 Lease token

- raw lease token lives only in worker memory;
- DB stores its hash;
- all mutation/finalization queries require tenant, recipient id, revision and
  lease token hash;
- expiry alone does not reset dispatch state;
- takeover increments revision and creates a new attempt under the same
  logical delivery.

### 18.3 Crash boundary

| Crash point | Safe recovery |
| --- | --- |
| Before claim commit | No row claimed. |
| After claim, before dispatch-boundary commit | Expiry allows takeover. |
| After dispatch-boundary commit, before network call | Conservative `UNKNOWN`; no duplicate. |
| During/after network call, before durable response | `UNKNOWN`; reconcile or manual. |
| After durable provider response | Idempotent finalization returns existing outcome. |

## 19. Retry model

Retry belongs to frozen channel/provider capability, not to campaign
`retryCount`.

| Failure class | Delivery state | Retry semantics |
| --- | --- | --- |
| Validation/policy/consent failure | `SKIPPED` or `FAILED` | No retry under same action. |
| Local failure before dispatch boundary | `NOT_SENT` | Retry may be scheduled by versioned channel policy. |
| Provider deterministic rejection | `FAILED` | No blind retry; a new action may follow corrected input/config. |
| Provider throttling with known rejection | `NOT_SENT` or nonterminal known outcome | Retry only if provider contract proves no acceptance and policy supplies backoff. |
| Timeout/crash after dispatch boundary | `UNKNOWN` | No retry until reconciliation proves `NOT_SENT`. |
| Provider accepted but delivery pending | `ACCEPTED` nonterminal | Reconcile; do not resend. |
| Reconciliation still unknown | `UNKNOWN` | Manual required or later reconciliation; no resend. |

`attemptCount` is telemetry. `nextAttemptAt` is an already-decided safe retry,
not permission to invent a retry. `MarketingCampaign.retryCount` cannot control
recipient sends.

## 20. Tenant isolation

Required tenant-qualified relations:

- Campaign -> ActionExecution: `(actionExecutionId, tenantId)`;
- Campaign -> Audience: `(audienceId, tenantId)`;
- Campaign creator/approver -> Membership: `(userId, tenantId)`;
- Recipient -> Campaign: `(campaignId, tenantId)`;
- Recipient internal user -> Membership: `(internalUserId, tenantId)`;
- Recipient -> ConsentEvidence: `(consentEvidenceId, tenantId)`;
- Attempt -> Recipient: `(recipientId, tenantId, campaignId)`;
- all identity uniqueness includes `tenantId`.

The database, not only service filters, must reject:

- campaign referencing another tenant's ActionExecution;
- recipient referencing another tenant's campaign/user/consent;
- attempt referencing another tenant's recipient;
- attempt campaign differing from recipient campaign;
- one tenant consuming another tenant's idempotency identity.

## 21. Privacy and retention

### 21.1 Stored data

Allowed durable data:

- HMAC recipient ref;
- internal user id when required for in-app delivery;
- provider-qualified external client ref only where server-side resolution
  requires it;
- template/content ref and normalized content hash;
- encrypted provider reference plus lookup hash;
- normalized outcome/error/reason codes;
- minimal approval/eligibility evidence refs and hashes;
- safe aggregate counters.

Forbidden durable data:

- raw credentials, provider tokens or API keys;
- raw CRM payload;
- phone/email in delivery identity;
- full Business State;
- LLM prompt/rationale;
- unbounded raw provider response;
- invented delivery/read status.

### 21.2 Retention

| Data | Retention rule |
| --- | --- |
| Raw/personalized message body | Short payload retention only; redact after `payloadRetentionUntil`. |
| Content/template hash | Audit retention; contains no recoverable PII. |
| Provider ref | Encrypt while reconciliation is possible; redact ciphertext afterward, retain hash if audit requires. |
| Recipient HMAC ref | Audit retention per tenant/legal policy. |
| Outcome/reason/timestamps | Audit retention without raw provider payload. |
| Marketing consent evidence | Separate legal retention policy; delivery stores ref/hash, not a duplicate payload. |

Existing plaintext `MarketingCampaign.message` must not be retained forever.
Lifecycle-v1 implementation must provide deterministic redaction while keeping
`messageSnapshotHash` and safe content ref.

## 22. Migration plan

No migration is created by this document. Approved implementation must be
staged.

### 22.1 Preflight

1. build a clean database from all migrations;
2. build a structural clone of production;
3. compare Prisma schema, migration history and actual constraints;
4. count existing campaign/audience/recipient/attempt rows and statuses;
5. scan for duplicates that would violate proposed attempt uniqueness;
6. inspect current `sending` rows without changing outcomes;
7. STOP on drift or incompatible rows; no guessed repair.

### 22.2 Additive-compatible migration

Preferred sequence:

1. add enums;
2. add nullable lifecycle-v1 columns and version columns defaulting to `0`;
3. relax only `createdByUserId`/`audienceId` NOT NULL constraints required for
   system/single envelopes;
4. add composite unique keys needed by tenant-qualified FKs;
5. add FKs as `NOT VALID` where production lock risk requires it, then validate;
6. add partial/typed indexes after duplicate scan and lock plan;
7. add lifecycle-version-gated CHECK constraints;
8. regenerate Prisma client and prove clean migration reproducibility;
9. keep canonical writers disabled until application/state-machine package is
   verified.

No table is dropped or renamed. Legacy columns remain readable. No historical
delivery outcome is inferred.

### 22.3 Production validation before runtime

- clean migration build: required;
- structural production clone: required;
- Prisma drift: zero;
- all tenant/FK/check invariants: pass;
- two-connection lease tests: pass;
- legacy row reads: pass;
- external dispatch during migration validation: zero.

## 23. Legacy-row handling

Legacy rows use `lifecycleVersion = 0`.

Rules:

- do not backfill `SENT`, `ACCEPTED`, `FAILED` or `DELIVERED` from legacy
  status/timestamps/provider ids;
- typed recipient/campaign states remain null for legacy rows;
- reader maps a legacy campaign with incomplete recipient truth to
  `LEGACY_UNRESOLVED` without writing a fabricated outcome;
- legacy `status=sending` is quarantined from the lifecycle-v1 worker;
- legacy recipients are not automatically resent;
- legacy attempts remain audit evidence but do not gain a fabricated typed
  state;
- manual migration of a specific legacy row requires independent provider
  evidence and a separately audited reconciliation decision;
- no historical campaign replay occurs during bootstrap.

## 24. Adversarial DB matrix

| Test | Setup / attack | Required proof |
| --- | --- | --- |
| Duplicate recipient, same logical message, same tenant | Two concurrent inserts with same lifecycle-v1 `idempotencyKey`. | One row commits; loser loads same delivery; one external dispatch maximum. |
| Same recipient, different logical message | Different ActionExecution/content/campaign identity. | Both rows allowed. |
| Same delivery material, another tenant | Same non-tenant identity inputs under tenant B. | Allowed as a separate tenant-scoped row. |
| Cross-tenant ActionExecution | Campaign tenant A references execution tenant B. | FK rejects. |
| Cross-tenant audience | Campaign tenant A references audience tenant B. | FK rejects. |
| Cross-tenant recipient | Recipient tenant A references campaign/membership/consent tenant B. | FK rejects. |
| Cross-tenant attempt | Attempt tenant A references recipient tenant B. | FK rejects. |
| Attempt wrong campaign | Attempt uses recipient from another campaign in same tenant. | Composite FK rejects. |
| Two workers claim one recipient | Two DB connections claim same due row. | Exactly one lease token returned. |
| Expired lease takeover | Claimed recipient latest attempt is `NOT_CROSSED`. | One new owner; same delivery id; monotonic unique attempt. |
| Crash before dispatch | Lease expires while latest attempt is `NOT_CROSSED`. | Recipient remains/re-enters `NOT_SENT`; safe retry policy may proceed. |
| Crash after dispatch | Lease expires after `MAY_HAVE_CROSSED`, no response. | Recipient becomes `UNKNOWN`; no send claim possible. |
| `UNKNOWN` blind retry | Set `nextAttemptAt` or try execution claim. | CHECK/claim predicate rejects. |
| Reconciliation -> accepted/sent | Provider evidence found. | Same recipient becomes `ACCEPTED`/`DELIVERED`; no new delivery row. |
| Reconciliation -> not sent | Provider proves no acceptance. | Same recipient returns to `NOT_SENT`; same identity; policy may schedule attempt. |
| Reconciliation still unknown | No decisive provider evidence. | Remains `UNKNOWN`; no retry. |
| Deterministic provider reject | Known 4xx/provider rejection. | Recipient terminal `FAILED`; no blind retry. |
| Attempt duplicate number | Concurrent insert same recipient/attempt number. | Unique constraint rejects one. |
| Partial campaign | Mixed terminal success/failure/skipped recipients. | Aggregate exactly `PARTIAL`. |
| Unknown prevents completed | One recipient `UNKNOWN`, all others success. | Aggregate exactly `UNRESOLVED`, never `COMPLETED`. |
| All terminal success | All recipients terminal `ACCEPTED`/`DELIVERED`. | Aggregate `COMPLETED`, counts equal rows. |
| All terminal failed | All recipients `FAILED`. | Aggregate `FAILED`. |
| All terminal skipped | All recipients skipped for same terminal reason class. | Aggregate `SKIPPED`/`CANCELLED`/`EXPIRED` deterministically. |
| Stuck sending recovery | Envelope running, mixed terminal/expired leases. | Normalize each recipient, then explicit `RUNNING`, `UNRESOLVED` or terminal aggregate; no permanent sending. |
| Restart identity | Persist, restart process, resubmit same logical action. | Recipient count and external dispatch count do not grow. |
| Single-message reuse | `SINGLE` envelope with one recipient. | Same claim/state/attempt code path as bulk recipient. |
| Bulk recipient reuse | `BULK` envelope with audience recipients. | No parallel queue/path. |
| ActionExecution linkage | Finalize envelope/action with mismatched or unresolved recipients. | Cross-tenant rejected; unresolved action cannot report false success. |
| Legacy unknown outcome | Legacy `sending`/provider id with no canonical evidence. | No fake success/failure and no automatic resend. |
| Consent revoked after audience snapshot | Revoke before claim. | Recipient `SKIPPED`, dispatch remains `NOT_CROSSED`. |
| Content mutation after approval | Change body/variables after snapshot hash. | Hash/policy check rejects dispatch. |

DB tests must use real PostgreSQL transactions and at least two concurrent
connections. In-memory repository mocks are insufficient for claim/lease proof.

## 25. Proposed B3 implementation packages

### B3.1 — Schema and migration implementation

- implement only approved fields, enums, composite relations and checks;
- validate clean DB, structural production clone, drift and legacy reads;
- no sender registration and no external side effects.

### B3.2 — Recipient repository and state machine

- deterministic identity create-or-load;
- transactional claim/lease/attempt creation;
- dispatch boundary, `UNKNOWN`, reconciliation and aggregation;
- DB adversarial matrix;
- no real provider call.

### B3.3 — Provider capability registry

- versioned capability contracts for in-app, APNs, Telegram, SMS.ru and SMTP;
- explicit support flags for provider idempotency, status query, proof-of-non-send
  and accepted-as-terminal;
- `yclients_sms` disabled until verified;
- no cutover.

### B3.4 — Single communication shadow

- ActionExecution -> `SINGLE` envelope -> recipient -> attempts;
- shadow against current inbox/APNs/operational send paths;
- new path external side effects remain zero;
- prove storage dedup differs from delivery dedup.

### B3.5 — Bulk campaign shadow

- authoritative audience/consent decision;
- recipient materialization, limits, approval and aggregate projection;
- crash/restart/stuck-sending proof;
- no external send by shadow.

### B3.6 — Organic equivalence verification

- passive observation per channel/action class;
- compare target, content identity, policy/approval and expected executor;
- report `EQUIVALENT`, `DIVERGENT` or `NOT OBSERVED`;
- no automatic cutover.

### B3.7 — Separate cutover gates

- one explicit gate per channel/action family;
- no dual execution and no direct fallback;
- rollback by release, never runtime bypass;
- external marketing remains blocked until consent authority is closed.

## 26. Risks and blockers

| Risk/blocker | Gate response |
| --- | --- |
| Consent authority fragmented | Must close before external marketing cutover. |
| Provider lacks reconciliation/idempotency | Durable `UNKNOWN`; at-most-one Maya dispatch, no blind retry. |
| `MarketingCampaign` name is too narrow | Keep DB table; optional Prisma alias later, no parallel table. |
| Plaintext legacy message body | Add retention/redaction before canonical external cutover. |
| Existing `sending` rows | Quarantine as legacy unresolved; no inferred outcome/replay. |
| New unique attempt constraint may find dirty rows | Preflight scan and STOP; no guessed dedup. |
| Campaign audience relation currently not tenant-qualified | Mandatory composite FK extension. |
| Campaign-level lease mistaken for recipient lock | Recipient lease is mandatory; campaign lease is coordinator only. |
| Provider response mistaken for user delivery | Typed `ACCEPTED` vs `DELIVERED`; provider capability decides terminality. |
| Action success mistaken for every-recipient success | Aggregate is derived; recipient truth remains separate. |

## 27. Gate verdict

The proposed extension is minimal because it reuses all three durable campaign
levels, existing Action Engine vocabulary and current tenant identities. It is
safe because it adds a conservative `UNKNOWN` boundary instead of pretending
that every timeout is a failure or every provider response is delivery.

The schema can enforce no duplicate logical recipient and no second Maya
dispatch after uncertainty. It cannot manufacture external exactly-once
semantics for a provider that does not offer them.

```text
SCHEMA GATE READY: YES
EXISTING CAMPAIGN SCHEMA REUSABLE: YES
NEW TABLES REQUIRED: NO
RECIPIENT UNKNOWN REPRESENTABLE: YES
DELIVERY DEDUP ENFORCEABLE: YES
STUCK-SENDING RECOVERABLE: YES
PRODUCTION DATABASE CHANGED: NO
READY FOR SCHEMA APPROVAL: YES
```

STOP.

No migration, cutover, external message, runtime agent or Chapter 7 work is
authorized by this document.
