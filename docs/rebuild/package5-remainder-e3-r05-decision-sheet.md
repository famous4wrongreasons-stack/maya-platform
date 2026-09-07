# E3 / R05 — Owner report package Decision Sheet (PROPOSAL, NOT APPROVED)

Scope: **R05 = B36 + B43**, exactly the closed [master inventory](CYCLE-06-BLOCKING-PACKAGE-5-EXHAUSTIVE-REMAINDER-INVENTORY-COMPLETE.md) and [machine master](evidence/package5-remainder-inventory-final.json). Assessment source: canonical `60e82664`, R-B runtime source `42962475`; parent reports R-B production PASS. Source-only review; no production recheck or inventory expansion.

**One owner decision for R05 is required only for the B43 extension.** B36 owner, schema and `INBOX → TELEGRAM → APNS` remain APPROVED. B36 schema is APPLIED; runtime is NOT DEPLOYED. Its known proof defects remain **IDEMPOTENCY KEY** and **CONCURRENT WRITE CONFLICT**. Repair of that already-approved daily contract needs no further owner approval and no second schema. This stage implements nothing.

## Decision and options

| | Option A — extend the existing report owner (RECOMMENDED) | Option B — daily only |
| --- | --- | --- |
| Canonical owner | Existing OwnerReportsService / OwnerReportRun / A12 / Communication Delivery | Same, daily B36 only |
| Non-daily delivery | Two finite kinds: `morning_owner`, `morning_staff`; one immutable plan per tenant/kind/local day/version | Retire all B43 non-daily delivery; retain authenticated read surfaces |
| Legacy growth/director | Converge owner prompts to the canonical morning occurrence; no separate bespoke broadcast; role-ineligible recipients excluded | No scheduled growth/director/morning/master delivery |
| PDF | Authenticated download of one admitted report snapshot; static admin help as authenticated download. No Telegram document send | Same read-only download of an admitted daily report/static help; no non-daily artifact |
| NEW MODELS / NEW FIELDS / NEW ACTION CLASSES | **0 / 0 / 0** | **0 / 0 / 0** |
| New Prisma relation-only fields | **0** | **0** |
| SCHEMA / MIGRATION / BACKFILL | **YES / YES / NO** — CHECK extension, no new columns | **NO / NO / NO** |
| Business loss | Separate legacy director/growth forecasts, manager-only growth pushes and arbitrary-period raw-SQL PDFs stop. Rich recommendations remain available only where an existing authorized read surface supports them. PDF is downloaded, not sent to Telegram | Additionally loses automatic owner/master morning briefs |

**RECOMMENDED: A. WHY:** it preserves the existing canonical morning composers and personal Staff slice, while sharing the already-approved durable report foundation. It does not create a second report owner or adopt raw Telegram lists, legacy forecast amounts or PDF attachments as a new authority/transport contract. This recommendation is not approval. Option B is an explicit smaller-function alternative, not an implicit fallback during implementation.

## Exact Option A contract and all B43 dispositions

| Inventoried producer | Disposition / immutable kind / authority |
| --- | --- |
| Nest `runMorningBrief` owner publication | `morning_owner`; canonical business facts, `composeMorningBrief`, no finance; one tenant-day aggregate |
| Nest `publishMasterMorningBriefs` | `morning_staff`; one root with per-recipient frozen content, each containing only that recipient's exact canonical Staff day facts |
| Python `_director_briefing_job → notify_owner` | Initiator of the same `morning_owner` tenant-day occurrence, or read-only handoff if tenant proof unavailable. Do not send the legacy composed director text or start top_action/jobs |
| `_send_growth_role_briefs_once` | Owner lane converges to `morning_owner`; independent owner/manager growth messages stop. A manager who lacks an eligible owner-report Membership receives no report through this lane |
| `_send_master_day_briefs_once` | Converges to `morning_staff`; legacy forecasts, phone/chat lookup, mirror writes and settings delivery markers are not authority. `only_staff_id`/`force` cannot create a partial new root or expand/revise an admitted plan |
| `panel_report_pdf_handler` | Replace direct `send_document`/raw-SQL report with authenticated download of one selected admitted canonical report. Arbitrary legacy period aggregation is rejected; no implicit regeneration after payload purge |
| `bot.cmd_admin_pdf` | No native document send; handoff to authenticated download of static command documentation. Static documentation is not a business report and does not acquire an OwnerReportRun |

There is no unspecific “other report” type. Owner morning recipients must have active User and exact-tenant active Membership in **tenant_owner, business_owner, tenant_admin, administrator, platform_owner** (same existing owner-report role set; a global role alone is insufficient). Staff morning recipients must have active User, exact-tenant active Membership in **tenant_owner, business_owner, provider, employee, staff** and an unambiguous current canonical Staff→User binding plus the applicable internal/CRM calendar mapping. The raw `CrmStaffAccess.externalStaffId`/InternalProvider projection may help resolve facts only after canonical Staff/Membership qualification. Missing, revoked, conflicting or wrong-tenant binding means no recipient; do not issue an empty-day claim. No Client or Maya User is manufactured. A Client without Maya User is not a staff report recipient category.

Apply existing tenant/feature rules and each recipient's **daily_brief** capability both at admission and dispatch. Audience membership is not marketing consent; these are operational staff reports. The report does not override personal preference withdrawal or active membership/route revocation. Finance remains excluded from both new morning kinds. Owner/master composers retain incomplete/unavailable facts rather than replacing unknown values with zero.

## Immutable identity, content and routes

- Identity remains `(tenantId, reportType, periodLocalDate, reportVersion)`; new kinds use **version 1**, independent of deployment/model version. Local date/timezone and UTC day boundaries are server-resolved. Python and Nest triggers use the same owner identity. Admission is limited to the current tenant-local report day after the existing morning schedule window opens and after the extension cutover. No catch-up creation for prior days. Existing roots may resume until their fixed expiry.
- Keep daily plan contract **`maya.owner-report-plan/1` byte-semantics unchanged**. Define the finite non-daily discriminator **`maya.owner-report-plan/2`**, stored inside the existing encrypted manifest, only for `morning_owner` / `morning_staff`. This is a proposed versioned JSON contract, not a DB column or action class. `reportVersion=1` is the occurrence revision, not the manifest version.
- Non-daily manifest exact top-level shape: `contract, tenantId, reportType, periodLocalDate, reportVersion, timezone, periodStart, periodEnd, expiresAt, classification, channelOrder, policy, recipients`. Each recipient: `userId, membershipId, role, staffId, staffBindingEvidenceHash, content, slots`. `staffId` and binding hash are null for owner aggregates and required for staff. Content: `title, bodyText, payload, deepLink` as in B36; deepLink remains `/app/?panel=chat`. Slots retain B36's exact `key, channel, routeId, routeHash, destination` shape. Policy retains existing A12 key/version and `daily_brief` preference.
- Normalize strings, finite enums, canonical local/UTC times, exact object keys, unique recipients and routes; deterministic lexical sorting. HMAC includes identity, version/discriminator, period, policy, per-recipient scoped content, binding evidence, route IDs/hashes and immutable order. Exclude plaintext route destinations from the fingerprint in favor of their keyed hashes; preserve destinations only encrypted. Exclude worker/request timestamps, random run/execution IDs, retry number and transport metadata. No raw JSON serialization contract.
- Proposed non-daily order is also **INBOX → TELEGRAM → APNS**, then immutable slot-key ordering inside a channel. It is explicitly part of Option A approval; it does not reopen B36. Exact verified AuthIdentity(User,tenant) for Telegram, exact DevicePushToken(User,tenant) for APNS. No raw chat ID, new device, route reselection or staff Web Push. An absent optional route at first admission is omitted; a route later revoked is not replaced.
- All recipients and A12 executions are atomically admitted with the immutable root before the first Inbox/external effect. A denied slot rolls back the root. Concurrent scheduler candidates have one winner; a losing scheduler loads the winner rather than recomposing. Explicit same identity + changed plan is `IDEMPOTENCY_CONFLICT`; same identity + same plan resumes the same executions. New content/deploy changes cannot manufacture a new version/key for the existing day.
- Confirmed slots skip; pending slots continue sequentially. Deterministic terminal failure or UNKNOWN stops later slots for that recipient, without alternate-channel fallback. Other recipients remain independent. UNKNOWN retains the original execution and existing A12 reconciliation/manual-required semantics, including its current prohibition on automatic redispatch. Inbox success does not complete the aggregate. Before-commit crash admits nothing; after-commit crash reloads exactly the plan/IDs/order. Completion is derived from all frozen slot outcomes, not any Inbox row.
- Existing B36 retention is reused: expiry = period end +7 days; payload retention = admission +7 days; audit/hash identity retention = admission +365 days. After expiry no new dispatch; reconciliation may use retained attempt evidence. Payload purge cannot regenerate content. No resurrection after identity purge because old-period first admission remains prohibited.

## Exact schema delta — Option A

**No new model, physical column, relation field, enum, action class or second B36 migration. Existing `OwnerReportStore.purgeExpiredPayloads` remains the approved OwnerReportRun payload lifecycle owner; its scoped B36 cleanup is not a generic AC6 permission and cannot be reused for the new R06 table. R05 adds zero AE and zero AC6 classes.** Add a new forward migration that replaces only the report-type predicate of `B36_report_contract_check`:

`reportType IN ('daily_report', 'morning_owner', 'morning_staff') AND reportVersion = 1`.

Keep date/timezone/hash/deadline predicates, the existing 12 OwnerReportRun columns, 2 ActionExecution binding columns, `B36_report_identity_key`, root/tenant FK, tenant-qualified slot FK/unique key, immutable/retention triggers and same-admission-transaction insertion rule. Bind all new slots only to existing **A12 `deliver_report_briefing` / `communication.reports-briefings.execute.v1`**. Migration is necessary even with zero added fields. Update runtime normalizers/dispatch authorization to discriminate daily vs non-daily; do not weaken the daily branch. PostgreSQL proof must show old daily manifests remain valid and unchanged, new finite kinds work, unknown kinds/late slots/cross-tenant references fail. Historical daily rows need no update, links or fingerprint backfill.

PDF rendering uses only the stored immutable content authorized for that requesting current User/Membership: owner daily/owner morning according to the plan, staff only own staff report content. Current authorization is rechecked, no public artifact URL, provider message, permanent file object, document ActionExecution or new attachment contract. Response loss allows the same read download. Payload unavailable means unavailable, not recomputation. Existing PDF library use may implement rendering after approval; this sheet does not authorize new analytics calculations.

R11's proposed `staff_notifications` v1 mute is a separate **unapproved**, non-mandatory **Telegram-only** preference contract; Inbox/APNS/Web Push eligibility is not changed by that mute. This sheet creates no alternative preference, assumes no R11 implementation and adds no master dependency. Current approved daily_brief/producer-specific rules remain. If R11 is approved and deployed, reuse its applicable current eligibility to suppress a pending Telegram slot, with the report's existing order/outcome barrier still authoritative. A mute change cannot reopen UNKNOWN/terminal slots, reselect a route or expand an admitted plan. This is a shared integration checkpoint, not a new owner dependency. No R05/R06 root stores mutable delivery state; ActionExecution/Communication Delivery remain authoritative.

## Repository evidence used

- `maya-saas-backend/prisma/schema.prisma:3194` and `prisma/migrations/20260907180000_b36_owner_report_run/migration.sql`: existing 12+2 fields, daily/version restriction, immutable same-transaction slot binding.
- `maya-saas-backend/src/owner-reports/owner-report.contract.ts:35`, `owner-report.store.ts:80` and `owner-reports.service.ts:133`: daily-only discriminator/store identity versus still-unplanned morning owner/master paths. Current `OwnerReportRecipient` lacks per-recipient content; the encrypted v2 contract above is an explicit proposed change, not an existing supported shape.
- `package5-b36-schema-mapping-v1.md`, `CYCLE-06-BLOCKING-PACKAGE-5-B36-SCHEMA-APPLIED-B37-STOP-REPORT.md` and `evidence/package5-b36-runtime-wip-verification.json`: applied schema, approved order and both unresolved runtime proof defects.
- Hash-matched R-B `composed-v4/python` source: `bot.py:_director_briefing_job:5118`, `cmd_admin_pdf:4276`; `webhook_server.py:panel_report_pdf_handler:4737`, `_send_growth_role_briefs_once:9260`, `_send_master_day_briefs_once:9491`. These are the same closed B43 paths, with line changes after R-A/R-B; no new path is inferred.

## Implementation readiness and required package acceptance

B36 is implementation-ready under existing approval, but **R05 as a whole is not** until Option A/B is chosen. R02 is production PASS. Required internal order: repair and prove B36's opaque idempotency-code mismatch and serializable concurrent-write handling → preserve exact order/UNKNOWN/partial-resume proofs → implement approved B43 mapping → coordinated R05 acceptance. Never relabel B36 WIP as already deployed.

Proofs must cover exact User/tenant/Staff authority and revocation, Client/User separation, two aliases reaching one report, concurrent first admission with equal/changed candidate, both crash boundaries, per-recipient content isolation, no new devices, deterministic failure/UNKNOWN channel barrier and independent recipient progress. Exercise every row above, PDF no-send and purge denial, 0 pre-admission effects, no zero-from-unavailable facts, unchanged daily V1, clean migration replay/upgrade and no historical backfill. Extend existing owner-report and Communication Delivery architectural tests with actual-source Python/alias guards and negative mutants for direct send/document/mirror write, settings/Inbox completion authority, raw identities, force/version bypass and late plan expansion. No legacy-directory exemption. Package-local gate then later coordinated cutover; no Package 5 Final Gate now.

```text
PACKAGE: R05
BLOCKERS INCLUDED: [B36, B43]
CANONICAL OWNER: OwnerReportsService / OwnerReportRun → A12 → Communication Delivery
EXISTING FOUNDATION SUFFICIENT: NO — whole package; YES for approved B36 repair
BUSINESS DECISION REQUIRED: YES — one B43 extension/retirement decision for R05
RECOMMENDED OPTION: A
SCHEMA REQUIRED: YES
NEW MODELS: 0
NEW FIELDS: 0
NEW RELATION-ONLY FIELDS: 0
NEW ACTION CLASSES: 0
MIGRATION REQUIRED: YES
BACKFILL REQUIRED: NO
RUNTIME-ONLY: NO
DEPENDENCIES SATISFIED: NO — R02 PASS; B43 decision and B36 proof pending
APPROVED SUBSCOPE READY: B36 runtime defect repair
PACKAGE READY FOR IMPLEMENTATION: NO — approval pending
PACKAGE READY FOR PRODUCTION: NO
FAKE HISTORICAL BACKFILL: NO
PRODUCTION MUTATIONS/MESSAGES: 0
RUNTIME/SCHEMA/MIGRATION/TEST CHANGES IN THIS STAGE: 0
MAIN DIRTY WORKTREE / 17 OLD DATABASES: UNTOUCHED
PROCESS HYGIENE: 0
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
```
