# B36 — daily report owner / contract / schema proposal

**CONTRACT + SCHEMA SCOPE APPROVED at `3aaaeb23`; STOP at channel order.**

The user approved the owner, immutable plan, 12 + 2 persisted fields, constraints,
recipient/routes, retention/cutover and gated migration/runtime/deployment path
below. Technical Prisma/SQL mapping may follow existing project conventions.
The remaining explicit business boundary is exact channel order; see the
[Channel Order Decision Sheet](package5-b36-channel-order-decision-sheet.md).
No runtime or migration has been implemented. The original diagnostic evidence
is retained below; the current contract/schema approval must not be requested again.

Accepted baseline: `48557868`, B35 production PASS. Inspected worktree
`/tmp/maya-b29-contour`, branch `contour/b29-remediation`; after fetch, HEAD
equaled `origin/codex/maya-brain-systemic-release-20260815`, ahead/behind 0/0,
unpushed 0, dirty 0. The protected main worktree retains its 24 entries and
content hashes. No database was opened in this stage.

```text
B36 COMMUNICATION CLASSIFICATION: operational_single — A12, staff/business report
B36 CANONICAL OWNER: OwnerReportsService → deliver_report_briefing
B36 RECIPIENT AUTHORITY FOUNDATION: SUFFICIENT NO
B36 IDEMPOTENCY FOUNDATION: SUFFICIENT NO
B36 CONTENT/PLAN FOUNDATION: SUFFICIENT NO
B36 COMMUNICATION DELIVERY FOUNDATION: SUFFICIENT YES
```

The NO verdicts concern the complete daily-report contract. Canonical User,
Membership, AuthIdentity and device primitives exist. Individual A12 delivery
keys already reject changed input. Those foundations do not provide an
immutable, resumable logical report with an enforced staff recipient/route plan.
Communication Delivery remains the existing transport owner. B35 Client
marketing is neither the report's business owner nor its consent contract.

## 1. Exact active production flow

| Boundary | Evidence and current behavior |
| --- | --- |
| Trigger | Active `barbershop-bot.service`, original `bot.py` entry. `post_init` registers `_daily_report_job` at production line 6208, cron 21:00 Moscow. Current-start journal metadata confirms registration and scheduler start. |
| Generation | Production `bot.py:_daily_report_job:6761` calls `webhook_server._daily_report(date.today().isoformat())`, formats the returned legacy financial/business data, then writes the diagnostic `last_daily_report_at` setting. That setting is not a report admission receipt. |
| Tenant/business | Legacy generator uses the configured YClients company. The later bridge supplies provider/company plus compatibility tenant slug. `BridgeSourceService.resolveTenant` first resolves one active integration and allowed tenant, but permits slug compatibility. A bridge body and raw company/chat values are not canonical staff recipient authority. Existing strict `assertBridgeIntegrationBinding` + `resolveTenantByIntegration` are available if a legacy trigger is retained. |
| Intended recipient | `database.list_admins` selects raw SQLite `telegram_user_id` values. It does not resolve active canonical Membership/User or verify an operational route before sending. |
| Classification | `InboxService.shadowTaxonomyForType` classifies `daily_report` as **operational_single**. Existing A12 capability is `communication.reports-briefings.execute.v1`, action class `deliver_report_briefing`, executor `communication.package2.single`, allowed sources scheduler/legacy_bridge. `customer_visible` is a generic existing risk facet, not a marketing or Client ownership classification. |
| First effect | `app.bot.send_message` at production line 6879. The installed Telegram mirror calls the original sender first and only then schedules shadow observation. Retired `_send_client_push` returns zero. |
| Later admission | `maya_inbox_bridge.publish_inbox_item` at production line 6892 → authenticated internal Inbox ingest → canonical tenant context → `publishForTenant` → A12 Action Engine ingress → Communication Delivery → protected transport. This occurs **after** the direct Telegram effect. |
| Legacy identity | Python `_source_event_id` hashes `kind\|source_seed`; daily seed is `daily_report\|<date>`. It is deterministic within this producer, but differs from the Nest owner's source namespace. |

Fresh [production snapshot](evidence/package5-b36-stage1-production.json)
confirms the B35 release is still
`/opt/maya-saas/releases/20260907-p5-b35-c8c7a8eb` and both services are active.
All 72 inspected non-test/non-secret Python sources match the accepted B35
inventory; all 113 inspected compiled backend artifacts match this worktree.
The executed daily function SHA-256 remains
`0d39b5fa6730e1d8a18d045e56584bdc86c13a15d14b8e02fbb1253fdbadc533`.
No service was restarted and no production report/message was requested.

## 2. Existing canonical owner and exact gaps

`OwnerReportsService` is the existing business report owner. Its
`BusinessStateService` → `businessBriefFacts` → `composeDailyReport` chain
already preserves canonical facts, tenant calendar boundaries, unavailable
finance and incomplete-source disclosure. Reuse it; do not move the legacy
financial aggregation into the canonical owner.

`OwnerReportsSchedulerService` invokes this owner every five minutes after a
90-second initial delay, using each tenant's timezone and configured evening
hour. Its running flag protects one process only. Production process environment
enables this scheduler; its current-start INFO marker was not found, so journal
absence is not represented as proof that it is disabled.

| Existing component | Sufficient part | Required contract still absent |
| --- | --- | --- |
| `OwnerReportsService.runDailyReport`, `listOwnerRecipients` | Tenant local date; `nest:daily_report:<date>`; active Membership owner/admin roles; `daily_brief` preference; canonical composition. | No durable whole-report record, frozen content or frozen recipient/route set. `hasSourceEvent` returning any Inbox row skips the entire report, including unfinished recipients/devices. |
| User / Membership / AuthIdentity | Tenant-qualified staff account/access. Telegram social login verifies the provider ID token; AuthIdentity is linked to Membership by User+tenant. | Daily-report delivery does not require this evidence. Raw Telegram IDs are independently forwarded even when identity lookup finds zero Users; generic raw `user_ids` are also added without the owner role query. No daily-report plan binds the verified route to the admitted staff principal and rechecks it before effect. |
| DashboardPreference / DevicePushToken | Existing `daily_brief` switch and tenant/User device registration; no Client marketing consent is needed for this staff report. | Tokens and recipients are reread on each publication; no immutable route-selection contract. Presence of an account/device is not permission to ignore preferences or a later revocation. |
| Action Engine | Unique tenant+logical fingerprint and tenant+caller scope/key; normalized payload encryption; durable attempts, leases, dispatch boundary, outcomes. **Same delivery key + changed input already yields `ACTION_IDEMPOTENCY_CONFLICT`.** | Caller scope/key include channel, recipient and possibly device. There is no one tenant+report period/version binding covering all those executions. New route/producer occurrence is a different key. Existing B31 binding requires a canonical Client and is not a staff-report root. |
| Communication Delivery | Durable SINGLE envelopes, recipient/attempt identity, protected Telegram/Inbox/APNS executors, reconciliation and no blind retry. | A delivery envelope owns one selected channel/execution. Existing SINGLE normally permits one recipient. It does not define a staff report's cross-recipient/cross-channel content/plan. Generic eligibility is currently `ALLOW` / `server_recipient_resolution`, not verified daily-report staff authority. |

The local repository Python daily producer already publishes through A12;
copying it over production removes the direct-send ordering bug but does not
establish the missing report contract. B35's bulk root and B31's Client booking
binding must not be repurposed to hide these gaps.

Existing A12 UNKNOWN behavior must be preserved: one execution attempt;
Telegram/APNS reconciliation remains `STILL_UNKNOWN`, with bounded inconclusive
reconciliation/manual-required handling. Inbox can prove success by its exact
tenant/User/type/source-event row or prove non-execution. The registered A12
policy does not permit automatic dispatch retry even after proven non-execution.
Telegram executor 4xx is treated as deterministic rejection; timeout/uncertain
5xx/missing provider reference is UNKNOWN. No new transport retry policy is
proposed.

## 3. Executable foundation evidence

[Diagnostic probe](evidence/package5-b36-foundation.probe.cjs) executes actual
compiled baseline owner, Inbox loop, A12 request builder, normalizer and duplicate
resolver with synthetic storage/content/delivery dependencies. The six executed
artifacts' hashes match the fresh production snapshot.

[Result](evidence/package5-b36-foundation.proof.json):

- Two intended canonical staff recipients, with APNS on the first. Simulated
  process loss after the first durable Inbox outcome → rerun returns `skipped`;
  second recipient and first recipient's APNS remain unprocessed.
- Zero AuthIdentities/Users + raw Telegram recipient → actual Inbox code still
  invokes Communication Delivery with that raw recipient. Transport is a recording
  fixture; this is not a claim of live provider acceptance.
- Same individual key/input → same execution. Changed content under that key →
  **`ACTION_IDEMPOTENCY_CONFLICT`**. A changed route or source occurrence uses a
  different key. The diagnostic creates no actual ActionExecution and does not
  claim to prove PostgreSQL concurrency.
- Before any Inbox receipt, rerunning the same report period recomputes content.
  With changing synthetic facts/composition it submits different content under
  the same report source ID. It does not reload a frozen report. Existing leaf
  conflict protection can reject this; it cannot recover a missing common plan.

The earlier exact-source [direct-producer probe](evidence/package5-b36-daily-report.probe.py)
was replayed from the tracked production source bundle. It again yields eight
synthetic sends across first/repeat/concurrent/response-lost/retry cases, before
canonical admission. [Fresh replay](evidence/package5-b36-stage1-direct-replay.json).
No live DB, real recipient, provider SDK or business endpoint was used.

## 4. Approved owner/report contract — channel order pending

**Keep `OwnerReportsService` as canonical owner. Add one durable daily-report
admission record owned by that service; reuse A12 ActionExecution and Communication
Delivery for every permitted delivery.** No new communication framework,
marketing owner, Client binding or transport implementation.

1. **Logical identity.** Server-qualified tenant + `daily_report` + canonical
   tenant-local report date + explicit report revision. Revision is fixed for the
   scheduled report, not a timestamp, content hash, deploy version or scheduler
   retry counter. Automatic revision changes to bypass conflict/UNKNOWN are
   forbidden. Record the first resolved timezone and UTC period boundaries.
2. **Staff authority.** Resolve active User + active exact-tenant Membership with
   the existing owner-report roles (`tenant_owner`, `business_owner`,
   `tenant_admin`, `administrator`, `platform_owner`). Apply `daily_brief` and
   existing tenant/feature policy. No eligible principal means no accepted report
   and no effect. Client-without-User is not a recipient category for this report;
   no fake Client/User is created.
3. **Frozen plan.** Before any Inbox or external effect, freeze the composed
   title/body/payload/deep link, business period, report revision, classification,
   applicable policy references and sorted canonical recipient/route slots.
   Keep current permission checks at dispatch; a snapshot is evidence, not a
   grant that survives revocation.
4. **Approved routes; order pending.** Operational plan: canonical Inbox;
   Telegram only through an exact-tenant verified AuthIdentity of that User;
   APNS only through that User's existing registered tokens captured at admission.
   Apply the existing `daily_brief` preference to the report as a whole. Freeze
   deterministic slot order. A later link/device never retargets or expands an
   existing report. AuthIdentity proves subject ownership, not guaranteed bot
   reachability; transport rejection retains its existing outcome semantics.
   No generic staff Web Push foundation was found: the current canonical Web Push
   service is for Client appointment/wanted-slot communication. Do not substitute
   it or add staff Web Push in this scope.
5. **Admission/concurrency.** In one database transaction claim the unique report
   identity, persist its immutable manifest, and admit all planned A12 executions
   through existing canonical ingress with tenant-qualified root/slot relations.
   Commit before any effect. All executions must be accepted READY; a denied
   plan rolls back and emits nothing. One concurrent transaction wins. A retry
   loads that record and its executions; it does not recompute its audience,
   content, route set or expiry. An explicitly submitted changed plan under the
   same identity conflicts. A losing scheduler discards its newly computed
   candidate and resumes the winner's original plan.
6. **Dispatch/resume.** Existing Communication Delivery owns attempts and leases.
   Success skips the exact confirmed slot. A crash before the admission commit
   permits fresh computation; after commit, restart resumes the same stored plan
   and execution IDs. Aggregate status is derived from existing execution and
   delivery outcomes, never from “any Inbox exists.”
7. **Failure/UNKNOWN.** Deterministic failure remains terminal under the existing
   policy; no automatic replacement channel. UNKNOWN stays attached to the same
   execution and enters existing reconciliation/manual handling. Do not start
   another channel or device for that recipient after UNKNOWN. Other recipients'
   previously admitted pending work can resume independently. No new report,
   revision, recipient key or route may bypass that unresolved outcome.

The immutable fingerprint uses existing canonical normalization/HMAC: tenant,
report type/date/revision, frozen timezone and UTC bounds, classification,
semantic content fields, policy contract/version, and the sorted canonical
Membership/User plus permitted route evidence/slot set. Rendered report content
is business significant here. Exclude worker/process IDs, retry count, receipt
timestamps, request metadata and random root IDs. Do not hash raw JSON without
the existing stable normalization. Planned expiry is stored once, not extended
by a retry; routing secrets/content remain encrypted.

**Approved business tradeoff:** raw legacy admins without an active canonical
staff account/verified route stop receiving the report on that route. A newly
linked device/recipient does not join an admitted report. Facts that arrive after
admission do not silently rewrite it. UNKNOWN may require manual resolution and
does not trigger delivery on an alternate channel. The authoritative business
content remains the existing canonical report, including unavailable-data notices.

## 5. Approved schema scope; technical mapping authorized

The user authorized schema implementation and gated additive migration within
this scope. Exact technical mapping may follow project conventions. The explicit
channel-order STOP still applies before implementation in this cycle.
Approved persisted shape: **one `OwnerReportRun` model**, owned exclusively by
`OwnerReportsService`, with the following 12 scalar columns:

| Columns | Purpose |
| --- | --- |
| `id`, `tenantId` | Opaque durable root and canonical tenant FK. |
| `reportType`, `periodLocalDate`, `reportVersion` | Unique logical report identity together with tenant. |
| `timezone` | Frozen tenant calendar interpretation. UTC bounds are also in the encrypted manifest/hash. |
| `intentHash`, nullable `intentEncrypted` | Immutable canonical normalized manifest; nullable only for controlled retention purge. |
| `admittedAt`, `expiresAt` | First committed admission and fixed, non-extendable intent expiry. |
| `payloadRetentionUntil`, `auditRetentionUntil` | Existing A12 retention family: 7-day payload, 365-day audit/key horizon; exact deadlines are fixed at admission. |

Add **two nullable scalar fields on existing `ActionExecution`**:
`ownerReportRunId`, `ownerReportSlotKey`. Require both-or-neither; composite FK
`(ownerReportRunId, tenantId)` → root `(id, tenantId)`, and unique
`(tenantId, ownerReportRunId, ownerReportSlotKey)`. They link planned delivery
executions to one report without creating another attempt/state/lease system.
Existing historical executions remain null. Add root unique
`(tenantId, reportType, periodLocalDate, reportVersion)` and `(id, tenantId)`.
Root identity/manifest and execution root/slot bindings must be immutable after
commit; retention may clear ciphertext, never repurpose an identity.

Approved delta: **1 model, 14 persisted scalar columns (12 new-model + 2 existing
ActionExecution), 0 new action classes; migration YES, historical backfill NO.**
Prisma relation-only fields, SQL constraint/index names and final guard mapping
must be explicitly recorded before migration and may follow existing project
conventions; they are not included in the 14-column count. Existing A12
ingress/dispatch needs a trusted root/slot check,
not a new transport or a parallel idempotency engine.

Only channel order remains a business approval boundary. The route eligibility,
cutover/lifecycle and 14-field scope are approved. If final mapping requires
another business field/model/action or different semantics, report the exact new
gap rather than silently extending the approved contract.

## 6. Prospective cutover, expiry and historical data

No reconstruction of old report manifests from Inbox rows, legacy settings,
Telegram logs, ActionExecution payloads or B35 campaigns. They cannot establish
the original common intended audience/content. **FAKE HISTORICAL BACKFILL: NO.**

Approved cutover is a fixed, reviewed deployment timestamp/configuration, with
the first eligible report being a full tenant-local report day beginning after
that boundary. Both triggers use the same owner and identity. Do not replay the
partly elapsed cutover day or a legacy UNKNOWN as a “new canonical” report.
This can omit one transition day's automatic report; it avoids claiming unproven
historical non-delivery. The boundary must remain durable in release/config
evidence across restart/rollback and may not move backward automatically.

First admission is permitted only for the current canonical scheduled period
after that boundary; older periods can only resume an existing admitted root.
Approved expiry is fixed from the report period end using the A12 seven-day
horizon, rather than refreshed at retry time. After expiry or payload purge,
no new effect/recomputation is permitted; unresolved work remains terminal/manual
according to existing outcome evidence. Keep the identity/hash tombstone for the
audit horizon. Purging old audit records cannot enable ancient report periods:
first-admission period/cutover checks still reject them. No history epoch is
borrowed from B35 marketing or inferred for old reports.

## 7. Ratchet and verification scope after approval

Fresh AST inventory found 15 `add_job` sites, including a dynamic reminder site.
Current-start journal confirms 14 scheduled jobs: daily report, director briefing,
god watch, dual-role guard, expense reminder, birthday, cycle reminder, lead
alerts, loyalty, PII rotation, reactivation, referral resolver, reviews and
subscriptions. This is a seed inventory, not a claim that every job communicates
or that all background edges have passed a new guard.

The implementation gate must inventory all active Python and Nest scheduled/
background communication producers, launcher registrations, indirect helpers and
transport boundaries. The dynamic reminder registration must be included even
without a current job-registration journal entry. Ratchets must fail direct
background delivery, pre-admission effects, raw staff route authority, missing
deterministic identity, UNKNOWN retries and confirmed duplicates. Repository
source and actual deployed source/launcher parity both need verification.

After channel-order approval: authorization negatives; missing/revoked
route; wrong tenant; repeat/concurrent admission; same-key changed plan; both
crash boundaries; partial recipients/devices; success rerun; deterministic failure;
UNKNOWN/reconciliation/no alternate channel; exact owner and effect ordering.
Then targeted tests → communication/report regressions → architectural guards →
lint → both typechecks → build → schema/migration preflight → full mandatory
backend regression. Mandatory FAIL forbids deployment. Use existing documented
deployment only after PASS; production proof is structural/read-only, messages 0.

No runtime remediation, migration, deployment, new ratchet implementation or
post-remediation full Final Gate ran in Stage 1. Historical B35 382 suites /
3130 tests PASS is preserved, not relabeled as B36 validation. After a later B36
production PASS, run the fresh full 13-family Package 5 Final Gate and STOP at
the first B37+; no new blocker is fixed in that Gate.

```text
B35 PRODUCTION BASELINE: PRESERVED — PASS
ACTIVE BLOCKER: B36
B36 FOUNDATION SUFFICIENT: NO
B36 OWNER/CONTRACT/SCHEMA APPROVAL: APPROVED
B36 CHANNEL ORDER APPROVAL: PENDING — EXPLICIT STOP BOUNDARY
B36 IMPLEMENTATION: NOT STARTED
B36 DEPLOYMENT: NOT STARTED
PACKAGE 5 COMPLETE: NO
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
CHAPTER 6 COMPLETE: DO NOT DECLARE
PRODUCTION MESSAGES / BUSINESS / PROVIDER MUTATIONS FOR PROOF: 0 / 0 / 0
MAIN DIRTY ENTRIES/HASHES PRESERVED: 24
OLD DATABASES TOUCHED: 0 — 17 PROTECTED
OWNED DATABASES/PROCESSES/PRODUCTION STAGING REMAINING: 0
PROCESS HYGIENE: 0
```

Proposal/evidence/remainder → commit/push → **STOP**.
