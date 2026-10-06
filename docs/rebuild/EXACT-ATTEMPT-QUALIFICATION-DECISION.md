# Exact-attempt notification isolation: contract decision

2026-10-06. Inspection base: `158a9a413aaa1f529f2fcd6bb54d9f2e33055b8a`
(code candidate `00b8d6b3e245fa56fe61a8b10e2d46394e8b0c98`).
Status: **BLOCKED ON NEW LIFECYCLE CONTRACT; not deployment-ready**.

Scoped owner-assisted Safari restoration and no additional synthetic effect are
accepted. A further screenshot solely to reveal the receipt is not required.
This decision does not change that acceptance or qualify the real provider.

## Evidence in existing owners

| Owner / file | Relevant behavior |
| --- | --- |
| `ai администратор/webhook_server.py`, `handle_yclients_webhook` | Forwards shadow envelope before dispatching create/update/delete wrappers. Each wrapper invokes a tenant-wide operational tick without record scope. |
| `ai администратор/maya_shadow_bridge.py` | Forwards company/event/record ID/key names, not raw comment or api_id. Forwarding failure does not stop the operational trigger. |
| `maya-saas-backend/src/crm/shadow-ingestion.service.ts` | Source read and common change owner preserve mirror/domain events; unreadable evidence is quarantined. Dropping this path would destroy required observation. |
| `src/crm/appointment-observation.service.ts` (backend) | Canonical source shape does not carry guest HMAC/api_id or qualification authority. |
| `src/crm/adapters/yclients-crm.adapter.ts`, `findPublicBookingByRequestId` | Exact full marker plus numeric api_id, complete day list and record reread qualify guest recovery. This proves creation identity, not notification suppression authority; active-record verification does not provide deleted-record lifecycle. |
| `src/operational-alerts/operational-alerts.scheduler.ts` | Independent minute scheduler invokes tenant owners, even if the webhook tick were suppressed. |
| `src/inbox/canonical-inbox-projection.service.ts`, `tickTenant` | Resumes durable projection executions and scans accepted appointment events independently. |
| `src/operational-alerts/canonical-appointment-alerts.service.ts` | Scans removed appointment events and initiates wanted-slot matching. |
| `src/crm/client-wanted-slot.service.ts`, `matchAvailable` | Can notify other clients using exact removed event and existing matched interests. Guarding only admission upstream does not cover resumed delivery. |
| `src/appointment-notifications/appointment-reminder-orchestrator.service.ts` | Independently scans appointments, retains immutable reminder plans, reauthorizes before sends. |
| `prisma/schema.prisma`, `PublicBookingAttempt` | Durable intent/nonce/hash fields exist; no qualification registration, binding or suppression lifecycle. Existing AE payload retention is not a durable suppression tombstone contract. |

Backend paths abbreviated above remain under `maya-saas-backend/`.
This is source evidence, not an executed notification-isolation proof.

## Concrete decision required

Approve or reject a new durable **exact-attempt qualification registration** owned
by the existing booking authority, consumed by notification owners. This is a new
data lifecycle even if implemented as a protected file rather than a Prisma table;
putting it in existing JSON or guest prefixes would not avoid that decision.

Proposed scope is one registration: tenant + integration + company `503759` +
attempt ID + exact full HMAC marker + exact numeric api_id, followed by a uniquely
verified provider record ID. No actual attempt has been registered by this task.
Registration must precede provider dispatch and survive process restart and a
lost create response. It must not classify every guest booking as a test.

The decision must specify:

1. **Retention and retirement:** how long the attempt-to-record suppression binding
   survives cancellation, deletion, retries and old domain-event replay; who may
   retire it; whether retirement can ever release previously suppressed sends.
   Recommended behavior is no replay of suppressed sends on retirement, but this
   is a proposal, not an approved product rule or a chosen retention duration.
2. **Unresolved classification:** when an event arrives before the provider ID is
   bound and source correlation is unavailable, how to retain that individual
   candidate pending proof without either allowing test delivery or freezing
   unrelated real notifications. Missing evidence remains UNKNOWN. A numeric
   api_id alone, an untrusted comment, or a prefix cannot authorize suppression.
3. **Authority and persistence:** authenticated local/operator registration and
   audited exact binding transitions, accessible consistently to legacy ingress
   and canonical scheduled owners. No broad guest flag, tenant mute, raw PII or
   second notification owner. A protected manifest would still need the same
   retention, atomic update and replay semantics.

Without these rules, suppressing only the webhook trigger is insufficient and
pretending ephemeral state is durable would fail the requested restart/delete
case. No partial runtime filter or new schema was introduced.

## Implementation and proof after decision

Keep mirror, audit, reconciliation and AE outcomes intact. Reuse one qualification
lookup at the webhook trigger boundary and existing source/delivery authorization
boundaries: canonical inbox projection, removed-slot matching/resumption and
appointment reminders. Check exact provenance at final effect admission as well
as source admission; do not convert UNKNOWN delivery into FAILED or replay it.
Independent ordinary staff shifts and unrelated tenant drains must retain their
existing behavior; the qualified webhook itself must not initiate those drains.

Required local proof uses actual owner services with synthetic provider/transport
edges: registered create/update/delete, duplicate and reordered webhook, restart,
lost response/UNKNOWN before binding, deletion after binding, independent scheduler
ticks, admitted deferred resumes, and unavailable classification. Assert unchanged
mirror/event evidence and no test-derived third-party transport calls. Controls:
same tenant real record, same numeric api_id with different full marker, other
company/tenant, ordinary guest attempt, ordinary shift and wanted-slot delivery.
These tests are not real-provider acceptance. None have been run for a filter
that does not yet exist.

## Bounded future deployment / rollback gate

There is **no executable deployment request yet**. After the decision, require a
reviewed code SHA, passing owner-level matrix, migration/manifest artifact with
rollback evidence, and matching deployed artifacts for legacy ingress and backend.
Only then request bounded deployment of those artifacts plus one preregistration;
do not bundle generic production migrations, global notification changes or any
alteration of `guest-qa.mayaos.ru` / its provider egress.

Separately qualify one controlled provider record through the existing Action
Engine, exact readback and reversible cleanup. Prior approval of notifications to
the owner's controlled contact does not approve any third-party delivery.

Rollback must stop further qualification dispatch first and retain the durable
binding and audit. Blindly reverting the guard while retained test events or
deferred plans remain eligible can release notifications, so it is not a safe
rollback. The approved lifecycle and tested rollback must account for those rows
before removing guards. No rollback may delete unrelated events or mute a tenant.

## This checkpoint

Only this decision document was added. No server, nginx, DB, model, provider,
phone or production service calls were made. The synthetic stand and its original
2026-10-07 12:40:49 UTC expiry remain outside this work. No deployment, model charge,
notification or CRM mutation occurred. Local validation is documentation diff
checking; runtime isolation is explicitly unimplemented and unproven.
