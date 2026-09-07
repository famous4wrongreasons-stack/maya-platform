# B35 — Canonical marketing bulk: Stage 1 contract decision

Status: **OPTION A BUSINESS DIRECTION APPROVED** after checkpoint `1e524c2a`.
Runtime remains unapproved. Current continuation is the [exact schema mapping
proposal](package5-b35-exact-schema-mapping-v1-proposal.md) and [schema STOP remainder](CYCLE-06-BLOCKING-PACKAGE-5-B35-SCHEMA-STOP-REMAINDER-CHECKPOINT.md).
The original Stage 1 assessment/approval boundary below is historical; Stage 2
now provides exact counts and a concrete schema proposal awaiting approval.
Assessment baseline: accepted checkpoint `1a45ed09962aa85ee9188093797f73a006e27826`.
Date: 2026-09-07. B34 production PASS and B29–B33 remain preserved.

```text
EXISTING CANONICAL BULK COMMUNICATION FOUNDATION SUFFICIENT: NO
RECOMMENDED DECISION: A — extend the common canonical marketing bulk contract
B35 RUNTIME IMPLEMENTATION: NOT STARTED
B35 DEPLOYMENT: NOT STARTED
PACKAGE 5 COMPLETE: NO
ACTIVE BLOCKER: B35
```

There is a substantial reusable execution foundation. There is **not** an
approved end-to-end contract connecting panel staff authority, canonical Client
audience, immutable bulk approval, User-free marketing routes and resumable
recipient outcomes. Connecting the panel to `MarketingService.sendCampaign`
alone would fail the requested contract. Reclassifying marketing as a reminder
or calling existing Telegram/Web Push helpers in a loop would also fail it.

## 1. Exact production flow

| Boundary | Current evidence and behavior |
| --- | --- |
| Published panel | `сайт и приложение/app.html`: `pfetch` at 35768, `bcPreview` at 35988, `bcSend` at 36015. Both deployed PWA variants contain broadcast calls with `mode` / `text`, without campaign, approved revision or idempotency identity. |
| Published proxy | Beget `muzhskayaestetika.rf/public_html/app/api-proxy.php`, `panel_broadcast` case at 1819: forwards mode/text/code and legacy authentication to `/api/panel/broadcast`. No canonical execution command. This production-only file is inspected, not copied into the repository. |
| Reachability | Active VPS `pwa_api.py` builds the Telegram application and registers the webhook server with background tasks disabled. `/api/panel/broadcast` remains registered. Nginx forwards the PWA API to port 8080. Disabling background jobs does not disable request-originated sends. |
| Authentication / authority | `ai администратор/webhook_server.py::_panel_auth` verifies Mini App / Login Widget data or resolves a legacy session. `_panel_resolve_role` derives marketing permission from configured founder/admin legacy identities. This is not a tenant-qualified Maya User/AuthIdentity → Membership → A16 staff capability check. A signed Telegram identity does not become broadcast authority. |
| Audience | `_panel_broadcast_recipients` and `broadcast_send_to_base` start from `database.list_telegram_clients`: local SQLite rows with `telegram_chat_id` and encrypted phone present. This is neither a canonical Client audience nor a durable approved snapshot. |
| Existing policy reads | `database.has_marketing_consent` calls `legacy_client_command_bridge.delivery_consent`; `get_notify_prefs` uses `legacy_client_preferences_bridge.delivery_read`. Canonical `ClientChannelRuntimeService.telegramDeliveryConsent` resolves one active tenant-qualified Telegram link by subject HMAC and reads the exact Client profile/consent facts. `ClientPreferencesService.deliveryRead` checks Client/tenant eligibility and exposes overrides/quiet hours. These are read boundaries, not delivery claims. |
| Classification | **Marketing**, established by marketing permission, templates, marketing consent, marketing preference, frequency checks and `marketing.broadcast` / `marketing-broadcast` markers. No transactional or operational reclassification is proposed. |
| Dispatch | Active `broadcast_send_to_base` at line 3656 (repository 3660) checks marketing consent, explicit opt-out and explicit frequency, renders `{name}` from a legacy row, and calls `bot.send_message` directly. Markdown `BadRequest` triggers another direct plain-text call. It does not consume the returned canonical `quietNow` as a dispatch gate. |
| Side effects / outcomes | Success updates local `client_marketing_last`; counters record sent/blocked/errors. Generic loss of a provider response becomes an error counter, not durable UNKNOWN. The send task has no canonical parent/recipient lease, immutable identity or reconciliation record. |
| Post-send hooks | Installed Telegram chat mirroring observes after the original send; it cannot authorize or claim that send retroactively. `_send_client_push` is already retired by B24 and returns no delivery. Its presence is not canonical Web Push delivery. |

Thus the actual effect path is:

`panel → legacy authentication/role → raw local recipients → canonical policy reads → direct Telegram → local counters/timestamps`.

The required canonical bulk/per-recipient/Communication Delivery stages are
absent from that path. The accepted [B35 executable bypass evidence](evidence/package5-b35-broadcast.proof.json)
already demonstrates repeated/concurrent sends and another operation after a
committed/lost response. It uses explicit synthetic eligibility/provider doubles;
it is not a production send or live canonical Client-resolution proof.

Fresh Stage 1 read-only inspection matched all 22 prior executed Python function
hashes and both deployed PWA/proxy hashes. Seven selected compiled backend
artifacts match the isolated build; the active release remains
`20260906-p5-b34-6f6745f2`. See the [Stage 1 evidence](evidence/package5-b35-stage1-assessment.json).

## 2. Existing foundations and exact limits

Paths in this table are relative to `maya-saas-backend/`.

| Existing component | Reuse available | Exact B35 gap |
| --- | --- | --- |
| `src/auth/jwt.strategy.ts`, `src/tenancy/memberships.service.ts`, `ClientChannelRuntimeService.realtimeAuthority` | Canonical account, active exact-tenant membership, A16 staff-access checks exist. | Realtime staff authority is not a broadcast permission. The panel has no approved mapping to a tenant staff initiator / owner-approved bulk command. No raw Telegram or body tenant fallback can fill it. |
| `src/marketing/marketing.service.ts` | Audience calculation, immutable preview, campaign ID, claim, consent revalidation and canonical bulk call exist. | `consentCandidates` at 409 selects active User memberships, phone and the membership profile's marketing timestamp, then CRM exact-phone recency. Audience rows and snapshots use User IDs. This is not canonical Client/ClientConsentFact audience authority and excludes a Client without User. |
| `src/marketing/marketing.module.ts`, `src/app.module.ts` | Marketing service/module are present as reusable source. | Source reachability search finds no importer of `MarketingModule` and no production caller of `MarketingService`; only that service calls `deliverBulkCampaign`. Presence in source/compiled artifacts is not live panel ingress. |
| `src/action-engine/action-engine.registry.ts:482,3342` | Registered `communication.bulk-campaign.execute.v1`, action class `deliver_bulk_campaign`, executor `communication.package2.bulk`; tenant-qualified execution and no blind retry. | Input accepts campaign/audience/hash/title/body fields. It has no canonical Client route-plan contract. Registry `L2_CONFIRMED_REQUEST` / `approvalRequirement: NONE` relies on the trusted caller's prior confirmation; it does not prove panel owner approval. |
| `src/communication-delivery/communication-delivery.service.ts:1259` | Bulk Action Engine ingress, claimed campaign/hash checks, delivery envelope, durable child leases and Inbox reconciliation. | `prepare` rejects ALLOW recipients lacking `internalUserId` with `bulk_internal_recipient_missing`; it produces `internal_user` / Inbox recipients. Result is `deliveredUserIds`. This contract cannot honestly represent the required User-free Client routes/outcomes. |
| Same service: bulk dispatch/reconcile | Inbox uses deterministic upsert and exact reread. Delivered recipients are reusable. | A dispatch exception marks the child UNKNOWN and exits the loop. Reconcile returns all/none/partial proof for Inbox rows. `MarketingService.sendCampaign` at 223 returns `marketing_campaign_busy` on `sending`; it does not resume partial pending children. There is no complete bulk coordinator contract for dispatching pending children independently of unresolved UNKNOWN siblings. |
| `MarketingAudience`, `MarketingAudienceRecipient` | Tenant-qualified immutable audience snapshot/rows, optional `internalUserId`, evidence/exclusion fields. | `recipientUserIdsJson` remains required and current row identity is User-based. `externalClientId` is generic, not a canonical Client FK. Reinterpreting it as canonical Client without a versioned contract is unsafe. |
| `MarketingCampaign`, `MarketingCampaignRecipient`, `MarketingDeliveryAttempt` | Existing campaign ownership, membership FKs, ActionExecution relation, unique tenant/key, child HMAC identities, optional User, leases, dispatch boundaries, attempts, outcomes and retention. | Campaign has one channel/capability and at most one envelope per ActionExecution. No approved relation maps one logical canonical Client child to multiple pinned channel/device envelopes. No canonical Client FK exists on audience/recipient rows. Optional User alone does not establish Client authority. |
| `communication-delivery.identity.ts`, kernel | Tenant-qualified HMAC identities, atomic claims, NOT_SENT/ACCEPTED/DELIVERED/FAILED/UNKNOWN/SKIPPED, dispatch-boundary crash recovery. | Identity incorporates content and action fingerprints. It does not itself bind an original panel key to one immutable approved intent. Changing content must conflict at the bulk intent owner, not simply produce a different HMAC/envelope. |
| B24 Web Push / B25 reminder routing | Verified encrypted `ClientWebPushEndpoint`, maximum five devices; verified ClientChannelLink delivery; durable primary route and no UNKNOWN fallback. | Web Push normalizer explicitly allows only `appointment_reminder` / `wanted_slot_available`. B25 routing approval explicitly covers service/transactional reminders. Neither approves marketing bulk routing. |
| Production capabilities | Inbox supports canonical reread. Telegram/Web Push/APNs retain conservative one-attempt, accepted-terminal behavior and manual UNKNOWN handling. | No automatic provider reconciliation is registered for Telegram/Web Push. SMS/email capabilities are shadow-only, with external dispatch disabled. Future PushSMS cannot be enabled by B35 inference. |

The [bounded contract probe](evidence/package5-b35-stage1-foundation.probe.cjs)
executes actual registry normalizers and selected service methods with in-memory
persistence/Action Engine boundary doubles. It confirms: existing bulk input is
accepted; route/Client additions are rejected; marketing Web Push is rejected;
User-free bulk prepare fails before an envelope; a User-backed row produces
Inbox; replay of `sending` returns busy without calling delivery. The
[result](evidence/package5-b35-stage1-foundation.proof.json) records source hashes
and limitations. This is assessment evidence, **not B35 remediation PASS**.

## 3. Recommended owner decision A — common marketing bulk contract

Approve the following business contract for all authorized initiators. It is an
extension of existing owners, not a panel-owned sender or another campaign
system. The alternative is to keep the route blocked/retired until this common
contract exists; merely wrapping the current loop is not an acceptable option.

### A1. Initiator and owners

- Panel and future AI/Opportunity interfaces only propose, confirm, submit or
  read an existing bulk intent. They never own provider delivery or accept raw
  recipient addresses as authority.
- Require server-authenticated canonical User, exact active tenant Membership
  and applicable existing A16 staff access. Require owner confirmation or an
  already explicitly granted marketing approval permission; ordinary staff
  membership alone is insufficient. Do not derive this permission from the
  legacy founder/admin Telegram list, Client-supplied tenant or Opportunity.
- Reuse `MarketingCampaign` as the business intent/approval owner and
  `MarketingAudience` as its frozen audience. Existing Action Engine owns
  execution admission; Communication Delivery owns every transport attempt.
  An admission receipt is not a claim that all recipients were delivered.
- Revalidate initiator permission for submit/resume and current tenant/Client
  policy before any still-pending effect. Revocation cannot recall a send that
  already crossed the provider boundary, but cannot authorize further sends.

### A2. One immutable bulk intent and deterministic Client children

- Server issues the draft campaign identity. Confirmation binds **one
  tenant/campaign identity** to one normalized intent fingerprint atomically.
  Confirmation is durable and precedes delivery. Client retry preserves that
  identity; a UI-generated random key per click is not retry safety.
- Fingerprint includes contract/version, tenant, `marketing` classification,
  exact canonical audience snapshot (sorted unique Client IDs), normalized
  approved template/content, personalization contract, per-Client rendered
  content hashes, approved routing/policy version and pinned route/device plan,
  and applicable expiry/schedule. Use an explicit typed canonical normalizer
  and existing identity primitives, not raw JSON serialization. Preserve
  content-significant text; freeze rendered personalization after canonical
  Client resolution, with private material in existing encrypted payload storage.
- Actor authentication/request IDs, clock time of retry, raw chat IDs, HTTP/AI
  tool metadata and provider response IDs are not intent identity inputs.
  Approval identity/evidence is separately bound to the accepted intent.
- Same identity + same intent returns/resumes the same execution/outcome.
  Same identity + changed content, audience or routing plan is
  `IDEMPOTENCY_CONFLICT`, including during UNKNOWN. No second business outcome.
  A different campaign requires separate approval and still follows existing
  marketing policy; it is not permission to bypass frequency or UNKNOWN.
- Materialize one logical child per `(tenant, bulk identity, canonical Client)`.
  Deduplicate before child creation. Database uniqueness and atomic claims must
  make concurrent confirmation/resume converge on one accepted plan and one
  winner per child/attempt. A device attempt is subordinate, not a second Client.

### A3. Canonical audience and marketing policy

- Candidate selection starts with same-tenant canonical Clients. An accepted
  audience is immutable; retry does not add newly eligible Clients or replace
  denied recipients. Recovery/Opportunity/scoring can propose this set only.
- Independently evaluate current canonical marketing consent facts/projection,
  Client preferences, tenant/category access, quiet hours and existing explicit
  marketing frequency. Evidence must refer to the exact Client, tenant and
  policy version. Consent is not manufactured from membership, endpoint,
  audience inclusion, phone/CRM recency, score or owner approval.
- Use current consent at dispatch; a prior ALLOW snapshot cannot override a
  later withdrawal. Record policy-denied/no-endpoint outcomes without creating
  provider attempts. No fake User, consent, link or historical grant.
- Preserve the distinction between absent frequency override and an explicit
  `week` / `2weeks` / `month` override (7/14/30 days in existing code). Do not
  introduce an implicit weekly cap. Canonical accepted/uncertain delivery
  history must govern the frequency decision across campaigns and device
  copies must count as one logical communication. Local `client_marketing_last`
  cannot become canonical authority by relabeling it.
- For quiet-hour, frequency or unavailable policy-history evidence, the proposal
  is an explicit policy-denied outcome for this intent, with no implicit timer,
  delayed campaign or fallback send. Exact historical frequency handling must
  be resolved in the schema/contract addendum before enabling dispatch; unknown
  history must not silently mean eligible.

### A4. Extend the existing route composition to marketing explicitly

Proposed marketing adoption of B25's **route composition**, with independent
marketing eligibility at every channel boundary:

| Eligible verified capabilities of the exact Client | Proposed fixed plan |
| --- | --- |
| Active verified Maya User route | One Inbox primary with its existing eligible device notifications; no additional Telegram primary. |
| No eligible Maya User route; verified Telegram delivery link | One Telegram primary and at most one B24 Web Push fan-out for that receipt. |
| Neither primary; eligible B24 devices | One Web Push-only group, up to five devices, with real per-device outcomes. |
| None | Explicit `no_eligible_endpoint`; no User creation or fabricated primary success. |

Use the existing deterministic same-Client link ordering
`verifiedAt / createdAt / id`. Pin link IDs, verification evidence, endpoint IDs
and content before any effect; revalidate the same material at dispatch.
Revoked/rebound/missing routes cannot be replaced on retry. Provider UNKNOWN
never activates another primary, device fallback or a new Telegram attempt.
Supplemental devices remain subordinate to the same logical child and obey the
existing accepted-parent rule. Their partial/UNKNOWN outcomes remain visible.

**This is a requested extension, not an already-approved marketing policy.**
B24 endpoint security/lifecycle and B25 reminder behavior stay unchanged.
SMS/PushSMS remains unavailable until its separate provider capability, policy,
cost/approval and reconciliation contract is approved. This contract leaves a
common recipient/transport boundary for that future capability.

### A5. Partial results, restart and UNKNOWN

- A bulk is not an atomic all-or-nothing send. Persist recipient outcomes:
  pending, provider accepted/canonical delivered (distinguish them), denied by
  policy, no eligible endpoint, definitive failure and UNKNOWN/reconciliation.
  Provider acceptance is not proof that a person read a message.
- Retry/resume loads the original plan and existing children. Accepted/delivered
  children do not resend. Pending children may be claimed under current policy;
  deterministic failures stay terminal under current one-attempt capabilities.
  A parent's busy/partial marker must not strand otherwise pending children.
- An expired lease before dispatch follows existing proven pre-dispatch rules.
  A crash after the dispatch boundary stays UNKNOWN, even if no provider ID was
  recorded. Unknown children may reconcile, not blindly execute again.
- UNKNOWN siblings must remain visible while independent pending siblings can
  progress. Preserve the original parent and child identities through restart;
  do not create another bulk to work around an unresolved execution.
- Inbox may use exact canonical reread. Telegram/Web Push cannot be assigned
  automatic reconciliation they do not support: inconclusive evidence remains
  UNKNOWN/manual-required. Never reinterpret it as FAILED or allow route switch.
  Terminal aggregate status follows actual child states, not a successful HTTP
  response, accepted parent plan or background-task startup.

## 4. Schema boundary — no automatic storage choice

Existing campaign/audience/recipient/attempt models and ActionExecution are the
preferred owners. **No new model or action class is selected by this report.**
The existing bulk action class should be extended only under the approved
contract; if its semantics cannot be preserved, return for an explicit decision.

Before runtime implementation, a concrete schema addendum must prove how these
invariants are stored/enforced, reusing existing fields only where their approved
meaning actually fits:

1. Tenant-qualified canonical Client relation on the audience and logical child,
   optional account association, and one-child uniqueness. Generic
   `externalClientId` / `recipientUserIdsJson` must not be silently repurposed.
2. Atomic immutable bulk intent/confirmation fingerprint and conflict check
   under one stable key, including after expiry, payload redaction or UNKNOWN.
3. Explicit binding of parent bulk → logical Client child → existing channel /
   B24 device execution/envelope. Current single-channel campaign and unique
   ActionExecution relation do not by themselves specify this hierarchy.
4. Frozen policy/route/content evidence, partial resume coordination and exact
   authority to advance pending children while UNKNOWN siblings remain unknown.
5. Canonical frequency evidence, retention and cutover from unproven legacy
   timestamps. Existing delivery payload/audit windows are 7/365 days; payload
   expiry must not free an identity for replay or delete unresolved authority.

Approval of A approves these business decisions, **not an unspecified migration**.
The next bounded deliverable is the exact field/constraint/lifecycle mapping and
counts, or a zero-schema proof if existing fields suffice without semantic
overloading. Migration/runtime stay stopped until that mapping is approved.
This is necessary because the assessment already disproves full foundation
sufficiency; declaring `NEW SCHEMA: NO` now would be unsupported.

Apply any later foundation prospectively. Historical raw broadcast attempts,
User-based audiences and uncertain provider sends must not be backfilled into
fake canonical Clients, consent, fingerprints, confirmations or delivery proof.
No historical DB modification is proposed in this stage.

## 5. Proof and release boundary after decisions

After contract/schema approval, implement through existing owners and prove the
full requested matrix: authorized/unauthorized staff; canonical audience; Client
with/without User; allow/deny/no endpoint; verified Telegram/Web Push; duplicate
recipient; repeat/concurrent retry; partial success; definitive failure; UNKNOWN;
reconciliation; restart after partial completion; no duplicate accepted delivery;
cross-tenant isolation; and no direct Telegram path. Add changed-intent conflict,
route revocation and consent withdrawal to that matrix.

Ratchets must reject panel direct Telegram, bulk delivery outside Communication
Delivery, raw chat-ID authority, missing tenant/staff or recipient policy,
UNKNOWN blind retry and a second logical child for the same intent. Reusing a
single-recipient helper in an unclaimed loop does not satisfy these ratchets.

Then targeted/regression/architectural checks → lint → both typechecks → build →
schema/migration preflight → full mandatory backend regression → documented
deployment, only with all mandatory checks PASS. Production verification is
structural/read-only with real messages 0. Only after B35 production PASS rerun
the full Package 5 Final Gate over all 13 families; a B36+ finding requires a new
report/remainder and STOP. Do not infer Package 5 or Chapter 6 completion from
this assessment.

```text
OWNER/CONTRACT APPROVAL REQUIRED: YES — decision A is proposed
EXACT SCHEMA MAPPING APPROVED: NO
NEW MODELS / FIELDS / ACTION CLASSES IMPLEMENTED: 0 / 0 / 0
MIGRATIONS / BACKFILL EXECUTED: 0 / 0
PRODUCTION REAL MESSAGES / BUSINESS MUTATIONS: 0 / 0
MAIN WORKTREE: UNCHANGED — 24 dirty entries and recorded hashes preserved
PRE-EXISTING DATABASES TOUCHED: 0 — all 17 untouched
OWNED PROCESSES / WATCHERS / BROWSERS / DATABASES REMAINING: 0
PROCESS HYGIENE: 0
PACKAGE 4 COMPLETE: YES
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13
PACKAGE 5 COMPLETE: NO
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
CHAPTER 6 COMPLETE: NO
```

Proposal/evidence/remainder → commit/push → STOP.
