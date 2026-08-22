# CYCLE 06 — PHASE B3 MESSAGING & CAMPAIGN AUDIT AND SHADOW REPORT

Date: 2026-08-22

Branch: `codex/maya-brain-systemic-release-20260815`

Repository HEAD at audit start: `486c3d85`

Current production release: `20260822-c06-b22-appointment-cutover`

## 1. Executive decision

The communication family is **not ready for Action Engine shadow or cutover**.
The existing persistence is substantial and must be reused, but it cannot yet
prove recipient-level delivery identity, post-dispatch `UNKNOWN`, or safe
recipient recovery under concurrent workers.

The mandatory result of this inspection is therefore:

```text
SCHEMA GATE -> STOP
```

No application code, Prisma schema, migration, database data, production
configuration, runtime agent, external message, campaign, appointment, or
attendance path was changed by B3.

## 2. Accepted baseline and scope freeze

B2 is accepted and closed for the appointment family:

- create appointment execution owner: Action Engine;
- reschedule appointment execution owner: Action Engine;
- cancel appointment execution owner: Action Engine;
- attendance execution owner: deferred;
- direct appointment write bypasses: `0`;
- legacy direct appointment fallback: impossible;
- appointment `UNKNOWN`: preserved.

B3 inspected only production-reachable communication paths. It did not:

- cut over any sender;
- execute a shadow communication plan;
- send a synthetic single message or bulk campaign;
- build a second campaign queue;
- change attendance;
- create runtime agents;
- begin Chapter 7.

## 3. Production-reachable communication inventory

### 3.1 Inventory summary

| ID | Initiator | Current execution owner | Channel and recipient scope | Current persistence / audit | Principal gap |
| --- | --- | --- | --- | --- | --- |
| C01 | AI tool `support.contact-admin.request` | AI tool handler -> `InboxService` | inbox + APNs, selected owner/admin users | `InboxItem`; AI tool audit | not an `ActionExecution`; APNs result is not durable |
| C02 | AI tool `tasks.create` | AI tool handler -> `InboxService` | inbox + APNs, owner/staff scope | `InboxItem`; task audit | approval ends before external delivery; no delivery identity |
| C03 | protected HTTP inbox bridge | `InboxService` | inbox + APNs, supplied or server-resolved users | tenant-scoped `InboxItem` | bridge authenticates storage request, not communication execution |
| C04 | appointment lifecycle hooks | appointment service -> `InboxService` | inbox + APNs, client/owner/staff | source-event storage key | appointment action is canonical, its notification is not |
| C05 | appointment reminder scheduler | scheduler/service -> `InboxService` | inbox + APNs, matching clients | source-event storage key | scheduler detects and delivers directly; process-local guard only |
| C06 | owner/staff report schedulers | report service -> `InboxService` | inbox + APNs, owners and masters | source-event storage key | scheduler both decides and executes delivery |
| C07 | Nest marketing service | `MarketingService` -> `InboxService` | app inbox + APNs, multi-recipient audience | campaign row and JSON recipient snapshot | recipient/attempt tables are not used by active sender |
| C08 | APNs adapter | `InboxService` fire-and-forget adapter | one push per device token | aggregate logs only | no durable attempt, provider request identity, lease, or `UNKNOWN` |
| C09 | legacy Python operational senders | individual Python modules -> Telegram API | Telegram, mostly single or small fan-out | fragmented module logs/business rows | direct external sends bypass Action Engine and shared policy |
| C10 | legacy Python broadcast/reactivation loops | Python loop -> Telegram/push bridge | Telegram and app/push, bulk | fragmented sent markers | no canonical recipient claim, durable delivery identity, or `UNKNOWN` |
| C11 | phone authentication | SMS provider adapter | SMS to one login identity | auth challenge plus provider response | separate security family; timeout cannot prove provider non-acceptance |
| C12 | email authentication | SMTP adapter | email to one login identity | auth challenge and application logs | separate security family; provider acceptance/delivery is not durable |

`C11` and `C12` are included to prevent an invisible communication bypass,
but their authentication policy remains a separate security action family.
They must not be silently merged with marketing consent or bulk approval.

### 3.2 Required property matrix

| Path | Idempotency | Delivery identity | Retry | Lease | Rate/cost limit | Failure semantics | `UNKNOWN` | Audit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Inbox storage | unique `(tenant,user,type,sourceEventId)` | inbox row only | upsert replay | none needed for row | none | row stored/not stored | not external delivery | durable row |
| APNs push | none durable | none; provider `apns-id` is not captured | no canonical policy | none | none | boolean/log aggregate | collapsed into log/failure | logs only |
| Nest single-message callers | source-event key for storage | none for push | caller-specific | none | caller-specific | storage result is treated as delivery | not representable | caller audit varies |
| Nest campaign | campaign idempotency key; JSON audience | no durable active recipient delivery identity | no recipient-specific safe policy | draft-to-`sending` compare-and-set only | audience cap; `MarketingPolicy` is not enforced by sender | `sent`/`partial` from inbox storage | not recipient durable | campaign totals only |
| Existing campaign schema | campaign/recipient/attempt rows exist | partially modelled | retry fields exist | campaign-level lease fields exist | policy fields exist | richer than active runtime | aggregate count only; insufficient recipient proof | durable but unused by sender |
| Legacy Telegram single | caller/source dependent | Telegram message id only on some paths | module-specific | none shared | module-specific | exception or success | generally collapsed | fragmented |
| Legacy Telegram bulk | sent marker after success | no canonical cross-restart recipient identity | loop/module-specific | no DB recipient claim | local throttling/consent checks | per-loop exception handling | not durable | fragmented |
| Auth SMS/email | challenge identity | provider/SMTP response, not canonical delivery | adapter-specific | challenge-specific | provider/config limits | request accepted/rejected/exception | timeout ambiguity not preserved | auth logs/challenge |

### 3.3 Code-owner evidence map

The production inventory is grounded in these current owners:

- `src/inbox/inbox.service.ts`: protected bridge ingestion, tenant recipient
  resolution, inbox upsert and unconditional APNs announcement;
- `src/inbox/apns-push.ts`: direct APNs transport with boolean aggregate result;
- `src/ai-tools/ai-tool-handler.service.ts`: direct inbox publication for
  contact-admin and task notifications;
- `src/appointments/appointments.service.ts`: direct lifecycle notification
  publication after appointment operations;
- `src/appointment-notifications/appointment-notifications.scheduler.ts` and
  `.service.ts`: scheduler-owned reminder detection and delivery;
- `src/owner-reports/owner-reports.service.ts`: morning, per-master and daily
  report publication;
- `src/marketing/marketing.service.ts`: audience snapshot, campaign claim and
  process-memory recipient loop;
- `src/auth/phone-auth-delivery.service.ts` and
  `src/auth/email-auth-delivery.service.ts`: direct authentication transports;
- `prisma/schema.prisma`: `ActionExecution`, `ActionAttempt`, marketing policy,
  audience, campaign, recipient, attempt, inbox and push-token storage;
- legacy Python direct Telegram owners in `bot.py`, `webhook_server.py`,
  `reactivation.py`, `cycle_reminder.py`, `freed_slot.py`, `birthday.py`,
  `lead_alerts.py`, `subscriptions.py`, `referral.py` and `reviews.py`;
- `maya_inbox_bridge.py`: protected legacy-to-inbox bridge, which is a storage
  and push mirror rather than an Action Engine communication executor.

The active Action Engine registry has no single-communication or bulk-campaign
capability. The Nest marketing service is also absent from the active AI tool
catalog and has no production controller; this does not remove the legacy
production campaign senders, and it does not make the unused recipient/attempt
schema a proven runtime.

## 4. Single communication and bulk campaign are distinct classes

The canonical model must not treat one message and a 500-recipient campaign as
the same risk.

### 4.1 Proposed `single_communication`

Required frozen inputs:

- tenant and actor/system initiator;
- one server-authorized recipient identity;
- channel;
- normalized template/content identity;
- logical/idempotency identity;
- authorization, policy and approval snapshot;
- channel-specific delivery plan.

The text body is untrusted content. It cannot choose the recipient, switch the
channel, waive approval, grant entitlement, or widen the scope.

### 4.2 Proposed `bulk_campaign`

Required frozen inputs:

- tenant and authorized initiator;
- immutable audience snapshot produced by server-owned rules;
- recipient count and bulk risk class;
- channel and normalized template/content identity;
- consent/opt-out evidence where applicable;
- tenant policy, bulk permission, rate/cost limits and approval snapshot;
- one durable delivery identity for every recipient/channel pair.

Bulk approval must be separate from actor approval used by a single message.
An LLM response or external/customer text can propose content, but it cannot
define or expand the audience.

## 5. Existing persistence that must be reused

| Existing model | Reusable responsibility | Current limitation |
| --- | --- | --- |
| `ActionExecution` | action-level identity, tenant, actor, policy, approval, lease, state, reconciliation | no active communication capability/executor is registered |
| `ActionAttempt` | action attempt and transport state | cannot replace per-recipient bulk delivery lifecycle |
| `MarketingPolicy` | provider enablement and tenant campaign limits | active campaign sender does not use it as authoritative execution policy |
| `MarketingAudience` | audience rule and frozen snapshot | active sender retains recipient ids as JSON; relation is not fully tenant-qualified at DB FK level |
| `MarketingAudienceRecipient` | durable audience membership and eligibility evidence | not populated by active sender |
| `MarketingCampaign` | campaign identity, aggregate counts, schedule, retry and campaign lease fields | active sender uses only a small legacy subset; stale `sending` is not reclaimed |
| `MarketingCampaignRecipient` | recipient outcome, attempt count and provider fields | lacks a DB recipient claim/lease and explicit post-dispatch reconciliation state |
| `MarketingDeliveryAttempt` | provider attempt metadata | lacks a unique attempt identity and sufficient dispatch/`UNKNOWN` correlation |
| `InboxItem` | durable in-app message of record and storage dedup | an upsert is followed by another APNs send on every publication |
| `DevicePushToken` | tenant-scoped push destination | not a delivery record |

This audit explicitly rejects a parallel queue. The correct path is to finish
the existing campaign recipient/attempt/lease model and connect it to
`ActionExecution`.

## 6. ActionExecution is not Delivery

The two durable levels have different truth:

```text
ActionExecution
  = MAYA authorized and started one communication action

Delivery
  = one recipient/channel delivery attempt and its provider outcome
```

For a bulk campaign, `ActionExecution.SUCCEEDED` cannot mean "every recipient
received the message". It must summarize durable recipient outcomes:

- total planned;
- accepted/delivered where the provider can prove it;
- deterministically failed;
- skipped by policy/consent;
- unresolved `UNKNOWN`.

A campaign cannot become complete while any recipient delivery remains
claimed, dispatched without a known outcome, or otherwise unresolved.

## 7. Confirmed defects and blockers

### 7.1 Storage dedup is not delivery dedup

`InboxService.publishForTenant()` upserts the message of record by tenant,
user, type and source event, then unconditionally starts APNs publication.
Replaying the same source event therefore keeps one inbox row but can send a
second push.

Consequences:

- restart-safe inbox history: yes;
- restart-safe external push delivery: no;
- duplicate external push prevention: unproven;
- using `stored === 1` as "sent": invalid.

### 7.2 APNs loses provider uncertainty

The APNs adapter returns an aggregate boolean and logs counts. It does not
persist a provider request id, provider response id, dispatch boundary, or
reconciliation state. A timeout/error after bytes may have left MAYA cannot
prove that Apple rejected the notification.

Blind retry in that state can duplicate delivery. The correct state is durable
`UNKNOWN` until reconciliation or an explicitly safe channel rule resolves it.

### 7.3 Campaign can remain stuck in `sending`

The active campaign service performs this sequence:

1. atomically changes `draft` to `sending`;
2. performs recipient work in process memory;
3. writes `sent` or `partial` only after the loop finishes.

If the process dies after step 1, the next call returns
`marketing_campaign_busy`. Existing campaign lease/retry fields are not used
to reclaim or reconcile the row. The campaign can remain `sending` forever.

The current final state is also based on inbox storage failures, not provider
delivery. `partial`, external `UNKNOWN`, and stalled delivery are therefore not
canonical.

### 7.4 No recipient-level two-worker proof

The schema has campaign-level lease fields but no DB claim/lease on the active
recipient work item. Two workers or two execution paths cannot be proven to
avoid dispatching the same logical message to the same recipient.

A crash after dispatch must not simply expire a lease and make the recipient
sendable again. Dispatch uncertainty must survive lease recovery.

### 7.5 Direct execution owners remain

The Action Engine registry contains appointment and Chapter 5 preparation
capabilities, but no canonical single-message or bulk-campaign executor.

Direct owners currently include:

- AI tool handlers publishing to inbox/push;
- appointment event hooks;
- reminder and report schedulers;
- the Nest marketing service;
- legacy Python Telegram and broadcast modules.

The scheduler is therefore not only an initiator today. It can still execute
communication delivery itself. Legacy Python direct sends remain primary
owners and have no protected Action Engine bridge/no-fallback ratchet.

### 7.6 Approval, entitlement and limits are fragmented

Some AI actions have actor approval and audit, some report/reminder jobs rely
on feature/dashboard settings, the marketing schema contains policy and limit
fields, and legacy modules enforce their own checks. There is no one
authoritative communication execution decision path yet.

B3 must not redesign the whole entitlement system. The required boundary is:

- the caller supplies the existing authoritative entitlement/policy evidence;
- Action Engine validates the frozen evidence and action class;
- the communication executor does not invent access;
- bulk permission, audience cap, consent and channel limits remain distinct
  from single-message permission.

## 8. Channel-specific retry rules

No universal communication retry is safe. The executor must distinguish:

| Condition | Required treatment |
| --- | --- |
| request never left MAYA | retry may be allowed under the same delivery identity |
| provider rejected deterministically | terminal failure unless policy permits a corrected new logical action |
| transient pre-dispatch failure | bounded retry under the same identity |
| timeout after possible dispatch | durable `UNKNOWN`; no blind retry |
| provider accepted but final delivery is not observable | accepted/unknown-delivery according to channel semantics, not `delivered` |
| provider supplies an idempotency/correlation key | persist and reconcile by that key before retry |

APNs, Telegram, SMS, SMTP/email and app inbox do not share identical provider
guarantees. Their retry and reconciliation policies must be registered per
channel.

## 9. Mandatory adversarial matrix

This matrix describes the **current production implementation**, not a future
claim.

| Scenario | Current result | Verdict |
| --- | --- | --- |
| single message success | inbox storage can be proven; external push delivery cannot | FAIL |
| duplicate single message | inbox row collapses; APNs can be announced again | FAIL |
| timeout after dispatch | provider acceptance boundary is lost | FAIL |
| `UNKNOWN` preserved | no durable per-delivery `UNKNOWN` | FAIL |
| blind retry forbidden | no canonical guard across current senders | FAIL |
| recipient dedup after restart | storage dedup only, not external delivery dedup | FAIL |
| two workers same recipient | no DB recipient claim/lease proof | FAIL |
| bulk 100 -> 100 durable recipient records | active service uses JSON and does not create recipient rows | FAIL |
| partial success | active status reflects storage, not external recipient outcome | FAIL |
| one recipient unknown | not durably representable | FAIL |
| campaign cannot complete with unresolved recipient | unresolved delivery is not tracked | FAIL |
| stuck `sending` recovery | no reclaim/reconciliation runtime | FAIL |
| expired lease | fields exist at campaign level; recovery is not implemented | FAIL |
| wrong tenant | service checks exist but not every relation/legacy path is DB-enforced | FAIL |
| cross-tenant recipient rejected | tenant-qualified recipient relations exist, but active sender bypasses them | FAIL |
| rejected approval | no shared execution boundary across senders | FAIL |
| bulk without bulk permission rejected | active sender does not enforce one canonical bulk policy | FAIL |
| external text cannot change audience | Nest marketing audience is server-built; shared barrier across all callers absent | PARTIAL |
| scheduler cannot bypass Action Engine | schedulers call inbox/push directly | FAIL |
| legacy direct fallback impossible | legacy direct senders remain execution owners | FAIL |
| restart preserves delivery identity | no durable external delivery identity | FAIL |
| ActionExecution summarizes recipient outcomes | communication does not create ActionExecution | FAIL |

The matrix is intentionally adversarial. Existing good tenant checks, consent
revalidation and inbox storage identity are retained, but they do not prove
the complete communication lifecycle.

## 10. Schema Gate decision

### 10.1 Why a gate is mandatory

The current schema cannot prove all mandatory B3 invariants without an
additive change:

1. one DB-level claim per recipient/channel/logical message;
2. dispatch uncertainty that survives worker restart and lease expiry;
3. unique durable attempt identity;
4. provider request/correlation identity required for reconciliation;
5. no campaign completion while recipient outcomes are unresolved;
6. tenant-qualified audience/campaign linkage;
7. connection between the action-level authorization and campaign delivery.

Trying to encode these only in free-form recipient status strings or campaign
aggregate counters would hide ambiguity rather than preserve it.

### 10.2 Minimal additive proposal for approval

This is a proposal only. No Prisma model or migration was changed.

#### Reuse and extend `MarketingCampaign`

- add a tenant-qualified durable reference to its owning
  `ActionExecution`/logical execution identity;
- retain existing retry, aggregate count and campaign lease fields;
- make aggregate completion derived from durable recipient outcomes;
- keep audience, template/content, channel, policy and approval snapshots
  immutable after dispatch begins;
- make campaign-to-audience integrity tenant-qualified at DB level.

#### Extend `MarketingCampaignRecipient`

- one unique delivery identity per tenant, campaign, recipient and channel;
- DB claim fields: `leaseOwner`, opaque `leaseTokenHash`, `leaseExpiresAt` and
  optimistic `revision`;
- explicit external dispatch state separate from business outcome;
- durable `dispatchedAt`, `unknownAt` and reconciliation state/timestamp;
- a terminal/unknown transition model that cannot reopen a possibly
  dispatched recipient merely because its lease expired.

#### Extend `MarketingDeliveryAttempt`

- unique `(tenantId, campaignRecipientId, attemptNumber)` identity;
- provider request identity and provider reference stored safely;
- external dispatch state and reconciliation-required marker;
- timestamps that distinguish claimed, pre-dispatch, dispatched and response
  received;
- tenant-qualified foreign keys and uniqueness.

#### Status and aggregation invariants

- constrain lifecycle values with enums or equivalent DB/application
  invariants rather than arbitrary strings;
- forbid a second current claim for one delivery identity;
- forbid terminal campaign completion while any recipient is pending,
  claimed, dispatched-unresolved or `UNKNOWN`;
- aggregate `accepted`, `delivered`, `failed`, `skipped` and `unknown` without
  treating one provider response as stronger proof than that channel offers.

#### Inbox and push

- keep `InboxItem` as the durable in-app message of record;
- model APNs as a separate delivery attached to the communication execution;
- never use inbox storage success as proof of push delivery.

### 10.3 Items explicitly excluded from the schema proposal

- a second campaign queue;
- appointment or attendance state;
- runtime agents;
- Chapter 7 work;
- raw CRM payloads or personal data in action arguments;
- universal retry behavior shared by all providers;
- new marketing policy semantics beyond enforcing existing authoritative
  policy/consent evidence.

## 11. Proposed post-gate B3 packages

No package below may start before explicit Schema Gate approval.

1. **B3.1 delivery persistence and invariants**
   - additive migration;
   - tenant-qualified recipient identity;
   - recipient leases, attempts, `UNKNOWN` and aggregation invariants;
   - clean DB, production structural clone, drift and concurrency proof.
2. **B3.2 communication execution kernel**
   - register distinct single and bulk action capabilities;
   - use existing inbox/campaign tables;
   - provider-specific dispatch and reconciliation policies;
   - no external send in shadow.
3. **B3.3 shadow convergence**
   - compare real inputs for recipient set, channel, normalized content,
     delivery identity, risk and approval;
   - keep external messages from the new path at `0`;
   - no synthetic bulk campaign.
4. **B3.4 separate cutover proposal**
   - only after shadow-equivalence and adversarial proof;
   - legacy initiator -> protected bridge -> Action Engine;
   - scheduler -> Action Engine;
   - no direct fallback;
   - release rollback only.

## 12. Carry-forward findings

- Finding 4.44 remains open: appointment reminders can silently miss events
  when the CRM journal read is incomplete. B3 must not interpret absence in a
  truncated read as proof that no message is due.
- Authentication SMS/email are communication side effects but remain a
  separate security family requiring their own provider `UNKNOWN` policy.
- Provider reconciliation capabilities differ by APNs, Telegram, SMS and
  email; lack of a provider proof must remain explicit.
- Paid entitlement authority remains fragmented and is not redesigned here.
- Attendance finding 4.43 remains deferred and untouched.

## 13. Shadow and production evidence

Because the approved instruction requires `SCHEMA GATE -> STOP` when durable
delivery identity/`UNKNOWN` is insufficient, no B3 shadow runtime was added.

Evidence for this report is structural and read-only:

- current repository and B2 closure report;
- current Action Engine registry;
- current inbox, APNs, notification, report, marketing and auth adapters;
- current Prisma schema;
- current legacy Python direct-send inventory;
- existing carry-forward register and Chapter 6 audit.

Production remained on `20260822-c06-b22-appointment-cutover`. No deployment,
database mutation, campaign, push, Telegram message, SMS or email was caused
by the new B3 path.

## Final status

PHASE B3 SHADOW READY: NO

SINGLE MESSAGE EXECUTION OWNER: OTHER

BULK CAMPAIGN EXECUTION OWNER: OTHER

DELIVERY DEDUP PROVEN: NO

UNKNOWN DELIVERY REPRESENTABLE: NO

CAMPAIGN STUCK-SENDING CLASS CLOSED: NO

SCHEMA GATE REQUIRED: YES

EXTERNAL MESSAGES SENT BY NEW PATH: 0

READY FOR COMMUNICATION CUTOVER APPROVAL: NO

STOP. Awaiting explicit Schema Gate approval.
