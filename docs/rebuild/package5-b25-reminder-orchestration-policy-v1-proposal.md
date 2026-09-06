# B25 — Appointment reminder orchestration policy V1 proposal

Status: **PROPOSED, NOT APPROVED / NOT IMPLEMENTED**. Accepted checkpoint: `ae6fa96c`. B24 remains the production baseline. This is Package 5 final remediation, not a new wave.

## Foundation assessment

**Appointment→Client schema already exists. No new identity model is needed.** `Appointment.mayaClientId + tenantId` references `Client.id + tenantId` with a composite FK. `Appointment.clientId` is an optional Maya User/account association and is not the business Client. Canonical observation/mirror obtains mayaClientId from tenant/provider/external-Client-qualified `CrmClientLink`, not phone. A missing canonical owner must remain unresolved; the reminder may not repair/create it.

B17 already authorizes appointment changes against this exact mayaClientId. `ClientChannelLink` supplies durable verified identity; its encrypted endpoint resolver checks Client/tenant/link status, decrypts, recomputes the subject HMAC and verifies exact equality. `ClientWebPushEndpoint` supplies encrypted bounded device delivery independently of Maya User. Existing ActionExecution/Communication Delivery records supply execution, claim, outcome and retry foundations.

The remaining approval is **reminder policy composition**, not missing Appointment identity storage:

1. The current reminder advertises `maya_inbox_push` and selects inbox/APNs accounts by phone. It does not specify which route wins when the canonical Client has verified PWA, Telegram and Web Push capabilities, or when only a User-free Web Push capability exists.
2. Existing Package 2 inbox and Telegram calls have different execution identities. B24 fans out once per accepted parent execution. Mechanically calling both for a newly corrected reminder would not merge their device notifications into one reminder. This is a prospective composition risk, **not an observed B24 production duplication or a request to reopen B24**.
3. B6 approves optional Client reminder hours and inherited policy, but the scheduler does not consume that field. The exact interaction of one Client hour override with the tenant's multiple occurrences needs to be explicit when wiring this scheduler.

## D1 — Which verified route should carry one reminder?

**A — One durable primary route, plus its existing device delivery (recommended).** Select once, before any effect:

| Available eligible capability of the exact Appointment Client | Proposed route |
| --- | --- |
| Verified active `maya_user` link with verified reversible address and active same-tenant account | One inbox primary; existing eligible APNs and one B24 Web Push fan-out belong to the same logical reminder. Do not also issue a Telegram primary. |
| No eligible Maya User route; verified Telegram delivery link exists | One Telegram primary; at most one B24 Web Push fan-out for that receipt. Maya User is not required. |
| Neither primary route exists, but eligible Client Web Push devices exist | One Web Push-only primary group, maximum five devices, through existing Communication Delivery. No fabricated successful inbox/Telegram receipt or Maya User. |
| No eligible verified route | No private payload, no send; explicit skipped/unavailable outcome. |

If several eligible links of the selected provider belong to the **same canonical Client**, choose the earliest server-verified active link, ordered by `verifiedAt`, then `createdAt`, then `id`. This is a proposed delivery selection rule, never Client identity resolution. Other Clients are excluded before selection. Web Push still uses B24's Client-wide maximum-five device set.

Persist the selected route/link and bounded device plan before dispatch in existing canonical execution material. Retry/restart must use that same plan. Do not select a newly registered/rebound link or a different provider after failure/revocation/UNKNOWN. Missing/revoked material suppresses the affected delivery. UNKNOWN retains existing reconciliation and no-blind-retry rules; it never authorizes fallback to another channel.

Product effect: a Client with both PWA and Telegram gets the PWA/inbox route and its approved device notifications, not an additional Telegram copy. A Client without a Maya account remains supported through Telegram or Web Push-only. Where several account/channel links belong to one Client, only the selected primary receives its inbox/Telegram copy; verified Web Push devices remain bounded as approved.

**B — Explicit Client-selected preferred route.** The Client chooses its primary channel before reminders. Without a preference, sending waits. This avoids a central priority rule but requires a new allowed preference key, its validation/storage guard and UI contract; existing B6's allowlist does not contain such a key. It is a broader change than A.

`RECOMMENDED: D1-A`

`NEW MODELS WITH A: 0`

`NEW BUSINESS ACTION CLASSES WITH A: 0`

`NEW SCHEMA WITH A: NO`

## D2 — How does Client reminder_hours combine with the tenant schedule?

**A — A present Client hour override replaces the tenant lead-time list for that Client (recommended).** No override inherits the approved tenant list, whose current fallback is `[1440,120]` minutes. An explicit `reminder_hours=4` means one four-hour occurrence, not the tenant's 24-hour/two-hour occurrences plus a third reminder. Tenant disabled or Client `reminder=false` suppresses sending; an hour override cannot enable it. Preserve the approved integer range 1–48, zero rejection, quiet-hour restriction and absence of a hidden three-hour default.

**B — Client hours only filter the tenant's permitted occurrence list.** For tenant `[1440,120]`, a four-hour choice has no eligible occurrence and sends nothing until Client/tenant choices agree. This is more restrictive, but makes many otherwise valid hour preferences ineffective; presentation would need to state that explicitly.

`RECOMMENDED: D2-A`

No new stored field/model/action class is required for either timing option. Existing approved Client override storage and tenant policy remain their owners. This decision concerns effective scheduling, not consent or CRM configuration.

## Fixed implementation contract after owner approval

These requirements preserve the user's B25 invariants; they are not new outreach permissions:

- `Appointment → exact tenant-qualified mayaClientId → active canonical Client → communication policy → verified route → minimal private payload → deterministic reminder intent → Communication Delivery → durable outcomes`.
- NULL/unresolved/merged Client, wrong tenant, revoked/ambiguous identity or absent delivery capability fails closed. Never phone-match, create Client/link, repair a mirror from a reminder read, or use legacy chat ID/address fallback.
- Keep **service/transactional** classification. Appointment existence, endpoint registration and preferences create no marketing/general consent. Apply existing canonical privacy/communication consent, tenant/category controls and B6/B9/B24 restrictions independently of identity.
- One logical identity derives from tenant, canonical Appointment, canonical Client, current canonical schedule and exact effective reminder-policy occurrence. Device/transport attempts are children/outcomes of that identity, not additional logical reminders. It must not depend only on provider record ID and lead time as the current scheduler does.
- Preserve current timing bounds and the existing 20-minute scheduler matching tolerance; do not introduce another hidden delivery window. The approved timing option determines the effective lead list. Scheduling-policy changes remain prospective.
- Revalidate current Appointment owner/status/schedule, current policy, consent and exact route at execution and immediately before dispatch. Cancelled appointments and stale pre-reschedule jobs cannot send or revive old payloads; a changed schedule cannot reuse an old receipt. Revalidation is at the dispatch authority boundary, not a claim that an already dispatched provider message can be recalled.
- Construct only needed private appointment details after exact Client/route authority. No private payload or command for Client B when Appointment belongs to Client A, even when phone values match. No PII in new logs/evidence.
- Common background-communication ratchets must reject phone/User.phone recipient shortcuts, raw chat fallback, premature private payload creation, cross-Client endpoint use and direct delivery. Preserve B24 and other accepted guards.
- Execute the user's full B25 adversarial matrix, including User-free delivery, shared phones, no endpoint/revocation/consent denial, concurrent runs, cancellation/reschedule/stale jobs and bounded devices. Then mandatory deployment gates, read-only production verification with zero real reminder smoke, and a fresh all-13-family Final Gate.

## STOP and scope

**Await owner approval of D1-A / D2-A or alternatives.** No schema/runtime/migration implementation was started. The current B25 bypass remains in production; no remediation success is claimed. Under A/A the proposal uses existing models/action classes; normalizers/authorized orchestration may be extended within existing owners after approval, without fabricating a parent delivery outcome or expanding B24's device policy.

Waves 1–6 and B24 stay accepted. No P4-11, Wave 7, Chapter 7, old-DB cleanup or Chapter 6 completion declaration. Production mutations: 0; owned processes/watchers/Chrome/temp DBs: 0.
