# B35 — Option A exact schema mapping V1

**Business direction A: APPROVED** by the owner after checkpoint `1e524c2a`.
**This exact schema delta: APPROVED by the owner after checkpoint `c3641411`.**
Implementation status: [local schema foundation checkpoint](CYCLE-06-BLOCKING-PACKAGE-5-B35-LOCAL-SCHEMA-FOUNDATION-REPORT.md).
The assessment and proposed wording below are retained as the approved decision record.
Assessment date: 2026-09-07. Only documentation and read-only inspection are
performed in this stage. B34 production PASS remains the accepted baseline.

## Decision and evidence

**Existing schema is not fully sufficient. Recommended delta: 0 new models,
12 new persisted columns, 2 existing columns made nullable for orchestration
roots, 0 new action classes. Migration YES; historical backfill
NO.** Reuse the existing recipient/attempt lifecycle for transport delivery;
extend the existing recipient model explicitly for its logical Client aggregate.
Do not call that aggregate a provider attempt or reuse a User field as Client.

Production PostgreSQL metadata was read in an explicit `READ ONLY` transaction:
18 tables, 367 columns, 119 constraints, 96 indexes and 11 user triggers. The
production schema file matches the repository SHA-256. Release remains
`20260906-p5-b34-6f6745f2`. No business rows, old test databases or provider APIs
were read/called. [Catalog evidence](evidence/package5-b35-stage2-production-schema.json)
and its [read-only probe](evidence/package5-b35-stage2-production-schema.probe.sh)
are included. All counts below describe a **proposed** delta, not executed DDL.

Key findings:

- `MarketingCampaignRecipient` and `MarketingDeliveryAttempt` already have real
  durable transport states, attempts, dispatch boundaries, lease tokens,
  revisions and reconciliation fields. Another delivery-attempt model is unnecessary.
- Campaign, audience, member and delivery tables currently have **no user SQL
  triggers** enforcing immutable confirmation/member plans. Hash columns alone
  do not prevent a changed snapshot from replacing an approved one.
- The existing lifecycle CHECKs accept only versions 0/1. A root with multiple
  channels cannot pretend to be a lifecycle-1 single-provider envelope.
- The current recipient claim requires envelope aggregate `READY/RUNNING`.
  UNKNOWN makes the aggregate `UNRESOLVED`; pending siblings therefore require
  an explicitly scoped B35 claim/resume change. Existing columns can support it.
- Several accepted historical composite FKs are `NOT VALID`. PostgreSQL still
  checks new writes; this proposal does not validate/rewrite their old rows.

## 1. Requirement → exact existing storage

`Sufficient` means the existing storage can represent this requirement without
new columns for that requirement. YES does **not** claim that the current panel
or bulk implementation enforces it; B35 runtime/guards still require approval.
Paths below are relative to `maya-saas-backend/`; schema fields were checked
against the production catalog.

| # | Requirement | Existing owner/model/field | Sufficient YES/NO | Exact gap / disposition |
| --- | --- | --- | --- | --- |
| 1 | Immutable owner-approved bulk intent | `MarketingCampaign.confirmedByUserId/confirmedAt/confirmationHash/actionExecutionId`; ActionExecution approval and policy evidence | NO | Approval identity/time storage exists; a complete Client bulk intent contract/hash and SQL freeze of parent/member plan do not. Add parent contract/hash and sealing guards. |
| 2 | Immutable content/version | Campaign `message/messageSnapshotHash`; ActionExecution `normalizedInputContract/Hash/Encrypted`; recipient `contentIdentityHash` | NO | Template/hash storage exists. Frozen per-Client personalized content needs its own encrypted payload; current recipient has no payload column. Add `contentEncrypted`; bind content contract/version through bulk contract and hash. |
| 3 | Tenant-qualified parent identity | Campaign `(id,tenantId)`, unique `(tenantId,idempotencyKey)`; ActionExecution tenant/key and identity uniques | YES | Reuse stable campaign identity and key, with immutable tuple guard. Do not incorporate changed content into a replacement parent key. |
| 4 | Immutable audience snapshot | `MarketingAudience.ruleJson/snapshotHash/status`; recipient rows | NO | No Client snapshot contract discriminator or immutable membership fence. Add `snapshotContract`; freeze snapshot/rows independently of the source segment. |
| 5 | Canonical Client identity | Audience/recipient `externalClientId`, optional `internalUserId` | NO | Neither is a Client FK. Add exact tenant-qualified `clientId` to both existing row models. |
| 6 | Deterministic logical child | Recipient unique `(tenantId,idempotencyKey)` and `(tenantId,campaignId,externalClientId)` | NO | Opaque transport uniqueness is not canonical Client uniqueness. Add `(tenantId,campaignId,clientId)` unique and logical kind/version. |
| 7 | Fixed route before first effect | B25 route in ActionExecution encrypted normalized input; Campaign single `channel` | NO | B25 payload is appointment-specific. A bulk Client needs a durable independent route plan and logical-to-transport binding. Add recipient `routePlanJson`, campaign parent/slot references. |
| 8 | Verified link/endpoint references | `ClientChannelLink(id,tenantId,clientId)`; `ClientWebPushEndpoint(id,tenantId,clientId)`; DevicePushToken | NO | Endpoint owners exist, but no bulk member plan pins their exact IDs/material. Persist references/hashes in the new typed plan, validate exact ownership at seal and dispatch. |
| 9 | Policy/consent evidence | Recipient `eligibility*`; `ClientConsentFact`; ActionExecution `policyEvidenceJson`; ActionAttempt pre-dispatch context | NO | Admission authority evidence exists, but a finished admission attempt cannot store a later dispatch-time check. Add `MarketingDeliveryAttempt.dispatchEligibilityJson`; retain existing recipient decision/ref/hash/time summaries. |
| 10 | Per-recipient lifecycle | Recipient lifecycle, state/timestamps/lease/revision; DeliveryAttempt | NO | Transport lifecycle exists. One Client may have multiple transport outcomes; add `aggregateState` to the existing recipient model for the logical Client, leaving leaf delivery state unchanged. |
| 11 | PENDING | Leaf `deliveryState=NOT_SENT`; attempt absent; nextAttempt/lease fields | YES | Logical PENDING projects as aggregate READY; missing planned transport slots count as pending, never as success. |
| 12 | SUCCEEDED/DELIVERED | Leaf `ACCEPTED/DELIVERED`, `terminalAt`, attempt `SUCCEEDED` | YES | Retain acceptance versus canonical delivery. Logical aggregate COMPLETED requires all required planned slots terminal-success. |
| 13 | Deterministic failure | Leaf `FAILED`, reason/error, `failedAt/terminalAt` | YES | Remains terminal under current one-attempt capabilities; no automatic resend. Mixed success/failure is aggregate PARTIAL, not an invented leaf state. |
| 14 | UNKNOWN | Leaf `UNKNOWN`, `MAY_HAVE_CROSSED`, reconciliation fields, `unknownAt` | YES | Existing evidence survives restart. Add scoped transition ratchets; do not convert UNKNOWN into NOT_SENT/FAILED without proof. |
| 15 | Reconciliation | DeliveryAttempt `kind=RECONCILIATION`, provider reference hashes/encryption, recipient reconciliation state | YES | Inbox canonical reread; Telegram/Web Push remain manual/inconclusive where provider proof is unavailable. Schema cannot manufacture provider support. |
| 16 | Atomic recipient claim | Recipient lease tuple/revision; unique attempt number; kernel `FOR UPDATE ... SKIP LOCKED` and CAS | YES | Reuse for transport. Logical coordinator leases use the same recipient lease/revision columns without creating fake provider attempts. |
| 17 | Restart-safe partial resume | Campaign/recipient aggregate/leases plus ActionExecution and attempts | NO | Missing explicit parent → Client → transport slot graph and fixed plan. New fields/uniques supply it; runtime must resume pending work despite unrelated UNKNOWN siblings. |
| 18 | No resend of success children | Leaf terminal state/timestamp, stable identity and attempt ledger | YES | Claim predicates already exclude terminal leaf success. Add B35 SQL transition/graph guards and skip completed logical children. |
| 19 | Same parent + changed intent conflict | ActionExecution normalized hash/caller key uniqueness; Campaign confirmation/message/audience hashes | NO | Parent must bind the whole immutable plan independently of transport identity. Add bulk intent hash and compare before execution admission/resume. |
| 20 | Client without User | Client, verified links/devices; optional recipient `internalUserId` | NO | Owner/endpoints exist; bulk recipient identity remains User-based. New Client FKs and fixed route mapping remove that requirement without a fake User. |
| 21 | Web Push fan-out ≤5 | B24 endpoint ownership/cap guards; existing SINGLE Web Push envelope and device recipients | YES | Reuse all device rows/attempts. Pin ≤5 in Client route plan; devices are leaves below one logical Client child. Extend marketing ingress, not B24 identity semantics. |
| 22 | Verified Telegram | ClientChannelLink reversible encrypted address, subject/evidence HMAC, revocation; existing Telegram executor | YES | Resolve only the selected same-Client link at dispatch. Existing raw-chat bulk path is not an authorized substitute. |
| 23 | Inbox | `InboxItem` unique `(tenantId,userId,type,sourceEventId)` | YES | Only verified active Maya User route; stable source event from bulk+Client identity. No User-free fake Inbox recipient. |
| 24 | Consent withdrawal before dispatch | Append-only ClientConsentFact; Client-owned CustomerProfile projection/preferences | YES | Re-read current facts under dispatch fencing; record proof in existing attempt context. Frozen audience/approval is not an old consent grant. |
| 25 | Quiet hours/frequency rejection | `CustomerProfile.notificationPreferencesJson`; canonical delivery timestamps/attempts | NO | Quiet-hours/explicit frequency values exist. Legacy history does not prove a complete frequency lookback; add a prospective per-tenant coverage epoch to MarketingPolicy. No fake last-send backfill. |

## 2. One graph using existing models

1. **Business root:** existing `MarketingCampaign`, `lifecycleVersion=2`,
   `bulkIntentContract='maya.marketing-bulk-intent/1'`, `scope=BULK`.
   Owns approval and the audience. It is an orchestration root, not a provider
   envelope: `channel/provider` are NULL on the root, and provider capability
   fields stay NULL. Do not insert a fictional channel/provider or label an
   internal owner as a transport provider. Actual values belong to slot envelopes.
2. **Logical Client:** existing `MarketingCampaignRecipient`, lifecycle 2,
   `recipientKind='canonical_client'`, exact `clientId`, one row per root/Client.
   Uses new `aggregateState` and existing lease/revision/terminal reason fields.
   Provider-only `deliveryState`, dispatch/response/reference/attempt fields stay
   NULL/zero; it is not passed to the lifecycle-1 provider claim function.
3. **Transport slot:** existing `MarketingCampaign`, lifecycle 1/SINGLE, with
   new `parentRecipientId` and `bulkSlotKey`. It retains the existing exact
   channel, provider capability and unique ActionExecution relation.
4. **Transport recipient/device + attempt:** existing lifecycle-1
   `MarketingCampaignRecipient` / `MarketingDeliveryAttempt` unchanged in meaning.
   Their new `clientId` is NULL: Client ownership comes through the explicit
   parent logical row. Five Web Push devices mean five transport leaves below
   **one** logical Client child, not five business recipients.

Root and slot ActionExecutions remain distinct durable **admission** executions,
with deterministic original caller keys. Root success means plan activation;
slot success means the fixed Communication Delivery envelope is durably admitted.
Neither means that a provider accepted a message. B35 transport claims require
the slot admission to be proven SUCCEEDED; the Communication Delivery kernel
then owns real provider attempts and their UNKNOWN states. If admission itself
crashes, reconcile the exact database envelope/plan before any send. Do not rerun
a provider operation as admission reconciliation. The business API reports
Campaign/recipient outcomes separately. No new slot execution is created on retry.

Use the existing `deliver_bulk_campaign` business action class for the admitted
bulk and its authorized delivery portions, with versioned B35 capability/input
contracts for admission versus a fixed delivery slot. This requires runtime
registry/normalizer/executor work after approval, but **no new action class**.
Do not execute marketing under `deliver_appointment_reminder`, report or alert
classes. Child capability authority derives from the exact approved parent and
fresh policy checks, not from accepting arbitrary internal calls.

## 3. Recommended Schema Delta — exact inventory

`NEW FIELDS` counts physical persisted columns. All 12 are nullable with no
population default so historical rows retain their original meaning. Shape
guards make the relevant fields mandatory for new B35 records.

| Existing model | New column | Prisma / PostgreSQL type | Meaning |
| --- | --- | --- | --- |
| MarketingCampaign | `bulkIntentContract` | `String?` / TEXT | Root-only version/discriminator; NULL for historical rows and delivery envelopes. |
| MarketingCampaign | `bulkIntentHash` | `String?` / TEXT | Canonical full approved-intent HMAC, 64 lower-case hex; immutable after confirmation. |
| MarketingCampaign | `parentRecipientId` | `String?` / TEXT | Delivery envelope → same-tenant logical Client recipient. |
| MarketingCampaign | `bulkSlotKey` | `String?` / TEXT | One fixed planned transport portion under that Client. |
| MarketingAudience | `snapshotContract` | `String?` / TEXT | `maya.bulk-client-audience/1`; explicit canonical Client snapshot semantics. |
| MarketingAudienceRecipient | `clientId` | `String?` / TEXT | Canonical Client FK, not account/provider identity. |
| MarketingCampaignRecipient | `clientId` | `String?` / TEXT | Canonical Client FK for lifecycle-2 logical recipients only. |
| MarketingCampaignRecipient | `routePlanJson` | `Json?` / JSONB | Typed immutable safe route/link/device references and evidence hashes. |
| MarketingCampaignRecipient | `contentEncrypted` | `String?` / TEXT | Frozen normalized per-Client content, encrypted by existing payload primitives. |
| MarketingCampaignRecipient | `aggregateState` | `CommunicationCampaignState?` / existing enum | Aggregate of planned transport portions; distinguishes PARTIAL/UNRESOLVED from leaf delivery state. |
| MarketingDeliveryAttempt | `dispatchEligibilityJson` | `Json?` / JSONB | Exact safe dispatch-time policy/consent/route evidence; sealed before the provider boundary and immutable afterwards. |
| MarketingPolicy | `canonicalHistoryStartedAt` | `DateTime?` / TIMESTAMP(3), UTC | Prospective, write-once coverage epoch for canonical marketing history; neither consent nor last-send time. |

**Altered existing columns: 2**, no data rewrite:
`MarketingCampaign.channel` and `MarketingCampaign.provider`: `String` →
`String?` (TEXT NOT NULL → nullable TEXT). Preserve their existing defaults and
historical values. B35 roots explicitly write NULL; shape CHECKs require both
non-NULL for all legacy/lifecycle-1 records. This makes the root/provider
distinction explicit instead of overloading a required provider field.

**New unique constraints: 3** (nullable legacy tuples remain compatible):

| Name | Columns |
| --- | --- |
| `B35_audience_client_key` | MarketingAudienceRecipient `(tenantId,audienceId,clientId)` |
| `B35_bulk_client_key` | MarketingCampaignRecipient `(tenantId,campaignId,clientId)` |
| `B35_recipient_slot_key` | MarketingCampaign `(tenantId,parentRecipientId,bulkSlotKey)` |

**New non-unique indexes: 2**:

- `B35_audience_client_idx`: MarketingAudienceRecipient `(tenantId,clientId)`.
- `B35_recipient_client_history_idx`: MarketingCampaignRecipient
  `(tenantId,clientId,createdAt,id)`.

Unique constraints create three additional physical backing indexes: **5 new
physical indexes in total**, not five additional indexes beyond the uniques.
Existing pending/status, lease/reconciliation and attempt indexes are reused.

**New composite FKs: 3**, all `ON DELETE RESTRICT ON UPDATE RESTRICT`:

- `B35_audience_client_fkey`: AudienceRecipient `(clientId,tenantId)` → Client `(id,tenantId)`.
- `B35_recipient_client_fkey`: CampaignRecipient `(clientId,tenantId)` → Client `(id,tenantId)`.
- `B35_transport_parent_fkey`: Campaign `(parentRecipientId,tenantId)` → CampaignRecipient `(id,tenantId)`.

All target unique keys already exist. A constraint trigger additionally requires
the parent to be a B35 logical row and its Client to belong to the root's exact
frozen audience. JSON endpoint references receive same-tenant/same-Client
validation at sealing and dispatch; they are not claimed to be ordinary SQL FKs.
Missing/revoked references suppress delivery instead of retargeting it.

**Enums: 0 new types / 0 added values.** Reuse CommunicationCampaignState,
CommunicationDeliveryState, ActionAttemptState and reconciliation/dispatch enums.
Lifecycle 2 and version strings are new contracts, not new enum values.

**Altered existing models/tables:**

- Persisted columns: MarketingCampaign, MarketingAudience,
  MarketingAudienceRecipient, MarketingCampaignRecipient, MarketingDeliveryAttempt, MarketingPolicy.
- SQL guards only, no columns: ActionExecution.
- Prisma navigation only: Client gains two inverse relations; the three FKs add
  six total virtual relation properties (Client↔AudienceRecipient,
  Client↔CampaignRecipient, CampaignRecipient↔Campaign). These are explicitly
  excluded from the 12 persisted-column count. No tables/models are added.

### Required CHECK/trigger changes are part of this delta

This is a schema proposal, not twelve unguarded nullable columns:

1. Extend `MarketingCampaign_lifecycle_v1_complete_check` and
   `MarketingCampaignRecipient_lifecycle_v1_complete_check` with explicit B35
   lifecycle-2 branches. Preserve every existing lifecycle-1 condition and
   require its channel/provider to remain non-NULL. Scope
   recipient UNKNOWN/terminal/outcome-timestamp checks explicitly to leaves;
   logical aggregates have their own equivalent shape/terminal checks. Existing
   lease tuple checks remain applicable to both roles.
2. New shape guards distinguish legacy, root, logical Client and transport
   records. Root and envelope roles cannot be mixed or changed. Parent/slot must
   be both NULL or both present. Lifecycle-2 logical rows require Client/route/
   aggregate fields and cannot contain provider attempts. Leaf rows cannot
   masquerade as logical recipients by setting clientId.
3. Canonical audience sealing: create members in one transaction and finish
   with status `FROZEN`; a deferred constraint forbids committed B35 snapshots
   in their assembly state. After sealing, snapshot identity/query/hash/member
   inserts, updates and deletes are forbidden. Historical snapshots cannot be
   promoted by guessing Clients or assigning the new discriminator.
4. Parent confirmation: lock root and exact audience; compare the reviewed
   intent hash; atomically bind owner approval, root ActionExecution and every
   planned Client row. Deferred graph guards require exact member-set equality,
   one child per Client and matching hashes/counts. Recompute the normalized manifest hash from the stored
   draft rows and content at sealing and compare it with the reviewed hash; this
   is integrity verification, not re-running the segment query. A stale reviewed hash rejects
   confirmation; it does not recalculate the audience and silently approve it.
5. After confirmation, freeze root identity, content/hash/expiry, audience,
   approval tuple, ActionExecution binding, and each child's Client/route/content
   identity. Forbid insertion/deletion of logical members and mutation of the
   selected slot set. New transport rows may fill only previously approved slots;
   they cannot append routes/devices. Their parent/slot/identity fields freeze.
6. B35-only recipient/attempt transition guards fence leases/revisions and
   correlate leaf outcomes with the owned attempts. Finished attempts remain
   immutable; reconciliation appends a separate attempt. Terminal success or
   deterministic failure cannot return to pending; UNKNOWN permits only a proven
   reconciliation transition. Scope these guards through the B35 parent graph so
   accepted unrelated B24/B25 and historical records are not reinterpreted.
   A logical aggregate cannot become terminal while a required planned slot is
   missing/pending/UNKNOWN. Validate terminal aggregate transitions against the
   immutable slot set and actual leaf outcomes, not a worker-provided counter.
7. An ActionExecution admission guard binds B35 capabilities to their exact
   parent/slot and normalized intent before READY/dispatch. Existing ActionExecution
   immutable-input, tenant/key uniqueness, approval and ActionAttempt guards
   remain unchanged; B31 booking columns/bindings are not used for bulk.
8. MarketingPolicy coverage epoch is write-once, cannot be backdated at initial
   establishment, cleared or recreated to erase history while the tenant exists.
   Freeze confirmed graph identity beyond payload expiry. Payload redaction may
   clear ciphertext only through existing retention authority after its deadline;
   it cannot change hashes, approval, references, routes, or make an expired key
   reusable. No new retention scheduler or historical cleanup is authorized.

## 4. Immutable approval, content and audience mapping

| Fact | Exact durable location |
| --- | --- |
| Approving actor/time | Campaign `confirmedByUserId + tenantId`, `confirmedAt`; matching ActionExecution approval decision/decider/time. Existing Membership FKs apply. |
| Authority evidence | Root ActionExecution `policyContextContract/Hash`, `policyEvidenceJson`, immutable evidence refs; record exact authenticated identity, membership/A16 references, permission decision and evaluated time. Raw Telegram ID is not the authority. |
| Approved content/version | Campaign `message` is the normalized business template; `messageSnapshotHash` identifies its typed content/version. Per-Client rendered payload is `contentEncrypted`, bound by existing recipient `contentIdentityHash`. |
| Approved audience | Campaign `audienceId/audienceSnapshotHash`; Audience `snapshotContract/snapshotHash` and immutable Client member rows. `ruleJson` is frozen source-selection evidence, not a query to rerun. |
| Full plan | Root `bulkIntentContract/bulkIntentHash`; child immutable Client IDs, content hashes and typed route plans. |
| Confirmation binding | Existing `confirmationHash` binds intent hash + owner authority evidence + approval identity/time. Root ActionExecution normalized input binds campaign ID + the same full intent hash. |

Drafts may be edited only before confirmation and require a new reviewed hash.
An already-created audience snapshot never changes; a changed draft segment
produces another snapshot. Confirmation compares the server-stored reviewed
version instead of trusting a new body/segment query. After confirmation,
changed content, audience, route plan or expiry under the same campaign identity
is `IDEMPOTENCY_CONFLICT` and cannot admit a new execution.

Canonical fingerprint inputs: contract/version, tenant, `marketing`, campaign
identity, audience ID + snapshot hash, normalized template/content contract and
hash, ordered unique Client manifest `(clientId,contentIdentityHash,normalized
routePlan)`, applicable expiry/schedule and approved policy version. Normalize
timestamps to UTC, sort/de-duplicate set inputs by stable IDs, distinguish absent
fields explicitly, and preserve content-significant text. Use the existing
`ActionIdentityService` canonical/HMAC primitives after a typed business
normalizer; raw transport JSON is not the contract. Actor/session/request noise,
retry time and provider response metadata are excluded from intent identity.

`recipientUserIdsJson` remains an empty compatibility projection for B35; never
put Client IDs into a User list. `externalClientId` remains a non-authoritative
opaque compatibility reference, using the existing recipient HMAC pattern.
The new Client FKs, not those compatibility columns, prove Client membership.
`MarketingConsentEvidence` and old `CustomerProfile.marketingConsentAt` alone
cannot manufacture a ClientConsentFact or historical grant.

Preserve existing bounded marketing audience/preview limits (500 candidates,
24-hour snapshot TTL) and existing per-channel payload bounds. The encrypted
Client content object freezes any primary text and approved device preview
variants together before confirmation. Unsupported content fails validation;
retry cannot truncate, personalize again, or switch routes to make it fit.

## 5. Fixed route contract and transport linkage

`routePlanJson` has an explicit `maya.bulk-client-route/1` shape containing:

- `primary`: `inbox`, `telegram`, `web_push` or `none`;
- `link`: NULL or `{id,provider,subjectHash,verificationEvidenceHash}`;
- `userId`: exact verified Maya account only for Inbox, otherwise NULL;
- `webPushEndpoints`: unique ordered `{id,materialHash,clientChannelLinkId}`,
  maximum five;
- `apnsDevices`: ordered unique `{id,tokenHash}` only for the Inbox route;
- `policyVersion`: the approved route composition version.

No raw Telegram address, provider token, subscription secret or Client PII is
stored in this JSON. Resolve encrypted material from the pinned existing owners
immediately before dispatch. Reject foreign Client/tenant/material, revocation,
missing objects and token rotation; never select replacements on retry.

Route priority is the approved A direction: verified active Inbox account,
otherwise verified Telegram, otherwise Web Push-only. Same-provider links use
B25's `verifiedAt/createdAt/id` ordering. B24's maximum-five set and B25's APNs
ID/token-hash snapshot remain unchanged; endpoint enumeration is not consent.

Exact slot keys:

- `primary`: the selected Inbox, Telegram or Web Push-only envelope;
- `web_push`: one supplemental B24 fan-out envelope, only for an Inbox/Telegram
  primary and only after proven primary acceptance;
- `apns:<deviceId>`: one existing APNs delivery envelope per pinned Inbox device,
  also gated by primary acceptance. The slot key distinguishes devices, so
  uniqueness is not incorrectly reduced to `(Client,channel)`.

Each slot gets one deterministic ActionExecution key and one Campaign envelope;
the new parent/slot unique constraint is an additional database fence. Within a
Web Push envelope, existing recipient/attempt uniqueness covers each device.
An uncreated planned slot is still pending work. `primary=none` has no slots and
an explicit skipped/no-endpoint or policy-denied outcome, never fabricated success.
If the primary definitively fails/is denied, settle its dependent unstarted
slots as SKIPPED through existing envelopes/eligibility records, without provider
attempts. If the primary is UNKNOWN, its dependent slots wait for reconciliation;
they are neither fallback sends nor implicitly successful/failed deliveries.

## 6. Current eligibility, frequency and historical boundary

Audience membership means **who was approved**. It does not mean **may send
now**. Revalidate current canonical Client consent, profile overrides, tenant
access, exact route and approving authority before each unstarted effect.
Store the latest eligibility decision/ref/hash/version/time in existing leaf
fields. Store the actual safe dispatch-time proof in the existing delivery
attempt's new `dispatchEligibilityJson`: Client/tenant, consent fact IDs/decision,
preferences and tenant-policy evidence hashes, decision/version/check time,
selected link/device/material hashes, frequency coverage and preceding outcome
references. No PII or endpoint secrets. Seal it atomically with the owned
dispatch boundary; an execution attempt cannot cross without ALLOW. A finished
admission ActionAttempt is not rewritten. Reconciliation attempts refer to the
original dispatch proof and create no new send permission.

Dispatch fencing must order consent/preferences/endpoint changes against the
provider boundary using the existing transaction/row-lock facilities. A consent
withdrawal committed before that boundary denies dispatch; a message that has
already crossed it cannot be recalled. The runtime proof must cover both orders.

**Prospective frequency coverage requires its own column.** A
missing ledger row does not prove that legacy marketing did not occur. Establish
`MarketingPolicy.canonicalHistoryStartedAt` once, using current database time,
only after the verified cutover admits marketing through the canonical journal
and disables the legacy marketing sender. This is a new coverage fact, not a
backfill of old send timestamps. Record its cutover evidence through existing
AuditLog metadata; do not turn unused legacy MarketingPolicy provider/budget/
enabled fields into new permission rules.
The first-establishment guard assigns the database transaction's UTC time at
TIMESTAMP(3) precision; a caller cannot supply a historical coverage date. Later
writes preserve that exact epoch. There is no migration-time default or UPDATE.

- NULL epoch or an incomplete requested lookback →
  `FREQUENCY_HISTORY_UNAVAILABLE`, no send.
- Explicit `week/2weeks/month` still means 7/14/30 days. Until a full configured
  interval has elapsed after the epoch, that explicit-frequency Client is denied.
  **This conservative cutover delay is part of the proposed delta requiring
  schema approval**, not an already-implemented policy. It avoids either a fake
  historical backfill or permanently unprovable empty history.
- After that interval, derive history through logical Client → envelopes →
  existing attempts/outcomes. Count one logical communication, not each device.
  Accepted/delivered and unresolved dispatch evidence cannot be treated as no-send.
  Unresolved UNKNOWN cannot be bypassed by creating another campaign.
- Serialize same-Client frequency checks and first dispatch claims under a
  tenant/Client lock. An active concurrent first-attempt claim reserves the lane;
  it is not hidden by an empty last-send query. A proven pre-dispatch abort does
  not become a delivered message.
- No explicit frequency override creates no implicit weekly cap. Quiet hours,
  frequency denial or missing evidence yield a recorded rejection for this
  intent, with no automatic timer, campaign reschedule or channel fallback.

All marketing producers contributing to this policy must remain in the covered
canonical journal. A later discovered bypass invalidates the operational claim
of complete coverage and requires STOP, not silently resetting the epoch.
No migration sets this epoch for existing tenants. Its future establishment is
an explicit cutover/runtime step after authorization and verification.

## 7. Partial resume and state proof

The coordinator loads the same root hash, sealed audience and Client rows;
acquires a logical row lease; enumerates **the original** slots; then uses the
existing transport executor/claim/attempt lifecycle. It never creates a
MarketingDeliveryAttempt for the logical coordinator lease itself.

| Persisted child/slot state | Restart/retry behavior |
| --- | --- |
| Logical READY / missing planned slot | Continue the existing plan after current authority/policy checks; create or recover the original deterministic slot execution. |
| Leaf NOT_SENT, never dispatched | Claim with row lock, unique attempt number and revision fencing. Proven pre-dispatch crash follows existing safe rules. |
| Leaf ACCEPTED/DELIVERED terminal | Reuse outcome; no second execution/attempt/provider send. Continue only other still-pending approved slots. |
| Leaf SKIPPED/FAILED terminal | No automatic resend; preserve precise policy/no-endpoint/definitive error reason. |
| Leaf UNKNOWN or expired lease after MAY_HAVE_CROSSED | Reconciliation only. Never reset to pending or choose another channel. |
| Some success, some definitive failure | Logical aggregate PARTIAL, terminal once no unresolved/pending work remains. Preserve individual transport outcomes. |
| Any UNKNOWN | Logical aggregate UNRESOLVED; pending independent slots/siblings can progress subject to original dependency rules. |

Logical terminal states are COMPLETED/PARTIAL/FAILED/SKIPPED/CANCELLED/EXPIRED;
READY/RUNNING/UNRESOLVED are nonterminal. Aggregate counters/status are derived
projections; immutable plan and leaf outcomes are authority. UNKNOWN takes
precedence over terminal expiry for effects that may already have occurred.
Expiry suppresses unstarted effects, not reconciliation of an earlier dispatch.

For B35 transport envelopes only, claim selection must allow unresolved
envelopes when the **selected leaf** is still NOT_SENT and otherwise eligible;
do not reopen the UNKNOWN leaf. Slot ActionExecution remains the successful
admission receipt, so an UNKNOWN leaf cannot turn the admission into an engine
retry barrier for its pending siblings. No provider dispatch is allowed while
slot admission itself is UNKNOWN. Root/logical aggregate UNRESOLVED cannot block
other Clients. Keep existing v1 behavior for unrelated contracts unchanged.
Inbox reread may prove acceptance/delivery; Telegram/Web Push without conclusive
provider evidence stay UNKNOWN/manual-required. Restart cannot improve evidence.

Persisted root/member/slot/attempt identities and CAS leases prove the graph
after process or PostgreSQL restart. No process-memory cursor or worker ID is
business identity. An admission ActionExecution can remain SUCCEEDED while the
campaign is UNRESOLVED: those are deliberately different facts.

## 8. PostgreSQL proof plan — after schema approval only

Use a newly owned isolated PostgreSQL database/cluster, never the 17 pre-existing
databases. Apply the future approved migration chain; use synthetic tenants,
Clients, owner memberships and fake provider boundaries. Two independent
connections/processes are mandatory for races. No production messages.

| Proof | Required observation |
| --- | --- |
| One immutable parent | Concurrent same campaign/key + identical confirmed hash yields one parent/admission/child set. A losing request reads the winner. |
| Immutable audience | Direct SQL insert/update/delete after seal and source segment changes cannot alter approved membership; changed segment creates a different snapshot. |
| Duplicate Client | Duplicate IDs across candidate sources collapse to one row; direct duplicate insertion violates the new unique. |
| Child/slot uniqueness | One `(tenant,bulk,Client)` logical row; duplicate primary/Web Push/APNs slot races violate/reuse the exact unique. Device rows do not inflate logical recipient count. |
| Atomic claims | Two workers claim the same leaf concurrently: one lease/attempt wins; stale revision/token cannot dispatch or finalize. |
| Before-boundary crash | Restart recovers the same pending identity with no assumed send and no new bulk. |
| After-boundary crash | Simulated accepted provider response lost before commit becomes UNKNOWN after lease recovery; retry performs no blind send. |
| PostgreSQL restart | Persist partial success/pending/UNKNOWN, disconnect clients, restart only the owned cluster, then resume from records without in-memory state. |
| Partial completion | Accepted Client skipped; pending sibling continues; deterministic failures remain terminal; UNKNOWN reconciles only. Pending device siblings obey primary-acceptance dependencies. |
| Same parent, changed content | Both normal API and direct SQL mutation attempts conflict; root/admission/children counts and synthetic provider call count stay unchanged. |
| Same parent, changed audience/route | Conflict for added/replaced Clients, changed snapshot, link/device replacement or expiry; no new execution/slot. |
| Cross-tenant isolation | Foreign Client, audience, membership, parent, execution and endpoint references reject through FK/guard/authority checks. |
| User-free Client | Valid Telegram and Web Push-only fixtures succeed without User, Membership-for-Client or fake Inbox rows. |
| B24 limit | Five devices produce one logical Client and ≤5 leaves; duplicate/6th/foreign/rebound endpoint rejects. |
| Consent withdrawal | Commit withdrawal before dispatch fence → no provider attempt crosses; after-boundary withdrawal cannot fabricate recall, and suppresses remaining effects. |
| Quiet/frequency | Explicit opt-out/quiet hours deny; NULL/incomplete history epoch denies explicit frequency; complete interval allows only according to canonical history. Concurrent campaigns cannot both bypass an empty-history check. |
| No duplicate confirmed delivery | Repeated resumes/concurrent workers/database restart leave each accepted slot's original execution/outcome/provider operation count at one. |
| Retention and history | Clearing ciphertext never clears identity; expired same key remains bound/conflicting. Legacy rows remain unchanged/NULL new fields; no fake history or consent backfill. |

This stage checks the mapping against production metadata and validates the
proposal inventory only. **No proposed DDL, migration replay or PostgreSQL
behavior proof was executed.** Runtime ratchets, the mandatory backend gate and
deployment checks follow implementation only after schema approval. A later
B35 production PASS must be followed by a fresh all-13-family Package 5 Gate.

The [machine-readable inventory](evidence/package5-b35-stage2-schema-inventory.json)
lists each new column, unique, index and FK and records the 25-row mapping check.
The [read-only inventory checker](evidence/package5-b35-stage2-mapping-check.probe.py)
and its [result](evidence/package5-b35-stage2-mapping-check.proof.json) do not
execute proposed schema or simulate provider safety.

## 9. Exact decision values and STOP

```text
B35 OPTION A BUSINESS CONTRACT: APPROVED
B35 EXACT SCHEMA MAPPING: COMPLETE
EXISTING SCHEMA FULLY SUFFICIENT: NO
NEW MODELS: 0
NEW FIELDS: 12
ALTERED EXISTING FIELDS: 2 — MarketingCampaign.channel/provider become nullable only for B35 roots
ALTERED EXISTING MODELS: MarketingCampaign, MarketingAudience, MarketingAudienceRecipient, MarketingCampaignRecipient, MarketingDeliveryAttempt, MarketingPolicy; ActionExecution (SQL guards only); Client (ORM inverse relations only)
NEW ENUMS/ENUM VALUES: 0 / 0
NEW UNIQUE CONSTRAINTS: 3 — B35_audience_client_key, B35_bulk_client_key, B35_recipient_slot_key
NEW INDEXES: 2 non-unique — B35_audience_client_idx, B35_recipient_client_history_idx; 5 physical including unique backing indexes
NEW ACTION CLASSES: 0
MIGRATION REQUIRED: YES
BACKFILL REQUIRED: NO
FAKE HISTORICAL BULK BACKFILL: 0
DURABLE PARTIAL RESUME SUPPORTED AFTER DELTA: YES — with the specified runtime/guard implementation and proofs
CLIENT WITHOUT MAYA USER SUPPORTED: YES
AUDIENCE SNAPSHOT MUTABLE: NO
AUDIENCE MEMBERSHIP IMPLIES CONSENT: NO
CROSS-CHANNEL RETRY AFTER UNKNOWN: NO
SCORING == CONSENT: NO
OPPORTUNITY == SEND AUTHORITY: NO
OWNER APPROVAL BYPASSES CLIENT POLICY: NO
B35 IMPLEMENTATION READY AFTER SCHEMA APPROVAL: YES
B35 RUNTIME / SCHEMA / MIGRATION / DEPLOYMENT CHANGED THIS STAGE: NO
PRODUCTION MESSAGES: 0
PACKAGE 5 COMPLETE: NO
CHAPTER 7 STARTED: NO
CHAPTER 6 COMPLETE: NO
WAVE 7 CREATED: NO
PROCESS HYGIENE: 0
```

Future panel, Maya AI, approved Opportunity and recovery workflows share this
same root/Client/transport contract; selection does not grant send authority.
PushSMS is not implemented or enabled. B34 is not reopened. Main dirty worktree
24 entries and the 17 old databases remain untouched.

Decision/schema proposal → commit/push → **STOP for schema approval**.
