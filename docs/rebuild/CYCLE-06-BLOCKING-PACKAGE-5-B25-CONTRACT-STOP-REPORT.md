# Package 5 B25 / A18 — reminder flow reconstructed; policy decision STOP

Accepted checkpoint: `ae6fa96c`. B24 production remediation stays accepted at `/opt/maya-saas/releases/20260906-p5-b24-9c208d2b`. Current release, readiness and relevant compiled hashes were checked read-only. Runtime, schema, migrations and accepted Waves 1–6 were not changed.

**The Appointment→Client foundation is sufficient. STOP is at reminder orchestration policy, not missing Client schema.** The user's instruction explicitly requires Proposal → commit/push → STOP if the reminder policy needs new business semantics. A multi-channel selection/fan-out rule and exact Client-hour-vs-tenant-list rule are not defined by the current reminder implementation; this cycle does not silently choose them.

Proposal: [B25 reminder orchestration policy V1](package5-b25-reminder-orchestration-policy-v1-proposal.md). Recommended decisions are **D1-A / D2-A**. No new models, business action classes or schema are proposed for A/A.

## Existing production flow

| Stage | Exact current behavior |
| --- | --- |
| Trigger | Enabled AppointmentNotificationsScheduler: first tick after 90 seconds, default interval five minutes. Tenant eligibility, entitlement and AppointmentNotificationSetting.enabled gate processing. |
| Appointment source | Reads external CRM journal in tenant lead-time windows, selects confirmed future appointments, then loads CRM appointment detail. It does not begin from the canonical Appointment owner. |
| Recipient | `clientRecipientsByPhone` indexes active same-tenant client/customer memberships by User.phone; CRM detail.client_phone selects every matching User ID. No canonical Client/ClientChannelLink proof. |
| Private data | Reminder text contains visit time, service names and staff name. Payload contains appointment/record/staff identifiers, start/end and lead minutes. Full phone is used for matching but is not included in this reminder body; Client name, branch and price are not emitted by this payload builder. |
| Channels | This scheduler publishes through InboxService. Appointment reminder is a Package 2 single type: inbox plus existing User DevicePushToken/APNs delivery. No direct scheduler Telegram or Web Push call is present in this traced path. |
| Canonical owner | Existing action `communication.appointment-reminders.execute.v1` → Action Engine → Communication Delivery kernel/executor → inbox/APNs outcome. Canonical transport ownership does not repair upstream phone-based Client authority. |
| Consent/preferences | Tenant setting/entitlement is checked. This scheduler does not resolve canonical Client consent, reminder override or quiet-hour preferences. The current executor receives server-recipient-resolution ALLOW evidence for a User, not proof of the Appointment Client. |
| Retry identity | Source ID is provider appointment key plus lead minutes. It omits canonical Client, current schedule and effective policy identity. An existing inbox source fact suppresses a later run. Action Engine handles individual delivery retries, but this is insufficient for the requested schedule-aware logical reminder. |
| Cancel/reschedule | Current CRM journal filters confirmed/future rows. There is no canonical Appointment owner/schedule recheck at delivery dispatch in this reminder path. B17 already has the needed canonical ownership pattern for mutation commands. |

## Reusable canonical foundation

- `prisma/schema.prisma:2555,2609`: Appointment.mayaClientId is nullable canonical business Client ownership with composite `(mayaClientId,tenantId) → Client(id,tenantId)` FK. Appointment.clientId is a Maya User/account association and must not become recipient authority.
- `AppointmentObservationService.resolveClient` and AppointmentMirrorService use tenant/provider/external Client-qualified CrmClientLink, not phone. A reminder may read an established owner; it may not manufacture one or lazily backfill unresolved history. NULL/merged/mismatched owner means no send.
- B17 ClientChannelRuntimeService proves exact Appointment.mayaClientId and repeats channel/appointment authorization before provider dispatch. Its cancellation/reschedule baseline remains unchanged.
- ClientChannelLink's verified endpoint resolver binds exact Client/link/tenant, requires active supported versions, decrypts, recomputes HMAC and checks equality. Maya User routes additionally require an active same-tenant account; Telegram does not require Maya User. Missing/revoked/corrupt/mismatched endpoint returns no recipient.
- B24 ClientWebPushEndpoint supports verified Client delivery without treating the subscription as identity, preserves five-device cap and immutable lifecycle. Missing encrypted channel delivery address does not become permission to reverse-resolve identity from a Web Push endpoint.
- B6 owns sparse Client overrides independently of ClientConsentFact. Existing B9/B24 delivery checks preserve privacy consent, category restriction and quiet hours. Appointment reminders remain service/transactional, never marketing consent creation.

## Exact remaining owner decisions

**D1 — Route composition.** The current policy advertises `maya_inbox_push`. Package 2 gives inbox and Telegram distinct channel/recipient execution identities (`communication-delivery.service.ts:494,803`). B24 derives its child source from each accepted parent execution (`communication-web-push.service.ts:139,151`). Naively issuing both newly verified primary routes would create separate parent identities; sharing the provider appointment source string does not consolidate their device fan-out. This is a source-derived integration risk, not a newly reproduced production B24 defect. The current phone-based reminder lacks the verified identity reference needed for B24 fan-out.

Proposed D1-A selects and durably pins one primary: verified Maya inbox first; otherwise verified Telegram; otherwise an explicitly authorized Web Push-only group. The first two retain their existing eligible device deliveries, with B24 fan-out once. No fake inbox/Telegram success may be inserted for Web Push-only. When multiple eligible same-Client links of one provider exist, proposed stable server verification order selects one. No new channel is selected after failure/UNKNOWN or on retry. This has a visible consequence: Clients with both PWA and Telegram do not receive two primary copies. Alternative D1-B requires an explicit preferred-route Client preference and a broader contract/UI/storage-allowlist change.

**D2 — Timing composition.** B6 permits reminder_hours 1–48 and absent-value inheritance; the scheduler currently consumes only the tenant's list, typically 1440/120 minutes. Proposed D2-A makes an explicit Client hour choice replace that list for the Client, while tenant-disabled/Client-disabled remains authoritative. Alternative D2-B filters the tenant list, potentially yielding no reminder for an otherwise valid hour choice. No hidden three-hour default is proposed. The difference changes actual send times/counts and is therefore presented for owner decision.

No new schema is required by recommended A/A. The later implementation must still prove the exact immutable execution material, current schedule/policy/recipient revalidation, no stale private payload, no blind retry and the full requested adversarial matrix. It is not claimed complete from schema inspection alone.

## Verification and STOP scope

This was code/schema/contract reconstruction and read-only release/readiness verification. No scheduler tick, real Client/private projection endpoint, provider send or production business-row query was invoked. The accepted B25 synthetic reproduction from `ae6fa96c` was retained, not rerun. No local database, server, browser or watcher was created.

B24's 356 suites / 2904 tests, pending migrations 0 and drift NONE remain accepted deployment evidence; they were not rerun as B25 gates. No B25 runtime proof, migration gate, deploy or fresh full Package 5 Final Gate was executed because this cycle stops before implementation. B25 remains active in production. B24 and Waves 1–6 are not reopened.

```text
B24 PRODUCTION REMEDIATION: ACCEPTED BASELINE
B25 EXACT REMINDER FLOW RECONSTRUCTION: COMPLETE
APPOINTMENT TO CANONICAL CLIENT DURABLE FOUNDATION: YES
APPOINTMENT CLIENT AUTHORITY FIELD: Appointment.mayaClientId + tenantId
PHONE MATCH AS REMINDER RECIPIENT AUTHORITY: FORBIDDEN
EXISTING IDENTITY/ENDPOINT SCHEMA SUFFICIENT: YES
ADDITIONAL SCHEMA REQUIRED FOR RECOMMENDED V1: NO
B25 REMINDER ORCHESTRATION POLICY: OWNER DECISION REQUIRED
RECOMMENDED OPTIONS: D1-A / D2-A
NEW MODELS PROPOSED: 0
NEW BUSINESS ACTION CLASSES PROPOSED: 0
B25 RUNTIME REMEDIATION CAN RESUME: NO — POLICY APPROVAL REQUIRED
B25 PRODUCTION REMEDIATION: NOT PERFORMED
RUNTIME/SCHEMA/MIGRATION CHANGES: 0
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL — ACCEPTED B25 BLOCKER
PACKAGE 5 COMPLETE: NO
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13 — ACCEPTED INVENTORY
NEW FULL FINAL GATE RUN: NO — POLICY STOP
FULL REGRESSION GATE THIS CYCLE: NOT RUN — CONTRACT ONLY
REAL PRODUCTION MUTATIONS FOR PROOF: 0
P4-11 CREATED: NO
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
PRE-EXISTING LOCAL TEMP/TEST DATABASES: 17 — PROTECTED BASELINE
PRE-EXISTING DATABASES DELETED: 0
OWNED TEMP PROCESSES STILL RUNNING: 0
BACKGROUND WATCHERS LEFT: 0
OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0
OWNED TEMP DATABASES REMAINING: 0
```

Evidence: [contract assessment](evidence/package5-b25-contract-assessment.json). Accepted B25 reproduction: [probe](evidence/package5-b25-appointment-phone-authority.probe.cjs), [result](evidence/package5-b25-appointment-phone-authority.proof.json). Preserve 17 old DBs, P02/P03 holds, D1-A…D7-A, Packages 1–4, B9/B17/B24 and A30 AC6 ownership. Commit/push Proposal/report/remainder, confirm HEAD=origin and STOP for owner policy decision. Chapter 6 completion remains a later separate acceptance gate.
