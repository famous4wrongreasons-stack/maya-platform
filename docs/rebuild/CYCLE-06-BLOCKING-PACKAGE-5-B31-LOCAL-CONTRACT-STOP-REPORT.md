# Package 5 — B31 local candidate; STOP at durable caller-alias gap G1

Status: **LOCAL CANDIDATE ONLY — NOT APPROVED FOR DEPLOYMENT**.

Base checkpoint `7b5b74d639404fcfa24b6df69d9c2176f46b54cf` matched
`origin/codex/maya-brain-systemic-release-20260815` after `git fetch origin`.
Existing worktree `/tmp/maya-b29-contour`, branch `contour/b29-remediation`,
started clean with zero unpushed commits. The canonical main worktree was only
inspected; its 24 pre-existing dirty paths were not changed.

The B29 handoff and the canonical [B30 production/B31 STOP report](CYCLE-06-BLOCKING-PACKAGE-5-B30-DEPLOYED-FINAL-GATE-STOP-REPORT.md)
and [post-B30 remainder](CYCLE-06-BLOCKING-PACKAGE-5-POST-B30-REMAINDER-CHECKPOINT.md)
were read before editing. B29 and B30 remain accepted production baselines.
The last documented production release remains
`/opt/maya-saas/releases/20260906-p5-b30-ad1d91b9`. This cycle did not deploy or
invoke a production business/provider endpoint.

## Foundation map and B31 evidence

The original [compiled PostgreSQL B31 reproduction](evidence/package5-b31-appointment-create-authority.proof.json)
confirmed HTTP creation with missing/revoked bindings and with a binding to
Client A: the route inserted `Appointment.clientId = authenticated User`,
`mayaClientId = null`, with zero ActionExecution rows.

| Boundary | Existing source / component |
| --- | --- |
| HTTP initiator | `appointments/appointments.controller.ts`, `POST /api/appointments` |
| AI initiator | `ai-tools/ai-tool-handler.service.ts`, `createOwnAppointment` |
| Legacy creation authority | `appointments/appointments.service.ts`, `createForClient`; User lookup and `TenantAppointmentRepository.createForClient` |
| Verified canonical Client resolver | `crm/client-channel-link.service.ts`, `resolveActive`; subject HMAC via `client-channel-subject.ts` |
| Accepted channel-create contact resolution | `crm/client-channel-runtime.service.ts`, `clientAppointmentCreateAuthority`; exact account/CRM-link contact |
| Canonical create action | `crm.appointment.create.v1`, `create_appointment`, `crm.appointment.create`, already registered in `action-engine.registry.ts` |
| Canonical ingress/execution | `CanonicalActionIngressService`, `ActionEngineKernel`, `ActionEngineRuntimeService` |
| CRM-backed create executor | `CrmService.createAppointmentActionPlan`, dispatch/reconcile/restore; before this candidate it required an external calendar |
| Internal calendar creation at baseline | Direct repository write in `AppointmentsService`; no internal create handler existed. Internal cancellation/reschedule already demonstrated reuse of the registered appointment capabilities |
| Appointment mutation guard | `crm/client-appointment-cancel.architecture.ts`, `scanClientAppointmentCommands`; plus `action-engine/appointment-action-boundary.spec.ts` |

Static inspection initially found the existing schema/capability sufficient
for the ownership refactor. Executable idempotency verification subsequently
found G1 below. **Final foundation assessment: NO for completing all B31 gates
without an approved durable schema extension.**

## Local candidate retained in this checkpoint

The candidate is reviewable but is not an accepted production remediation.

- HTTP and AI delegate to `ClientAppointmentCreateService`: authenticated
  principal and active Membership → existing `ClientChannelLinkService.resolveActive`
  → versioned active link → exact unmerged, tenant-qualified Client. Missing,
  revoked, ambiguous and conflicting context fail before create ingress.
- Existing `ClientChannelLink`/Client/CRM identity-hold resolution is reused.
  The account is a channel subject; bare User association, phone matching and
  raw chat IDs do not select the Client.
- Internal contact fields remain booking data. CRM-backed contact is derived
  from the canonical Client's account or one exact active CRM link, following
  B19; a conflicting caller phone is rejected before provider dispatch.
- Both calendar sources execute the existing `create_appointment` capability.
  The internal handler uses the existing slot/timing/staff resolution and
  overlap constraint. Its Appointment ID is bound to the durable execution ID.
  Accepted ownership is `Appointment.mayaClientId + tenantId`; the optional
  legacy `Appointment.clientId` is null.
- CRM dispatch and reconciliation remain the existing handlers. Canonical
  mirror persistence runs inside the executor; a provider acknowledgement
  followed by mirror failure is UNKNOWN and requires reconciliation.
- `ActionEngineRuntimeService` coalesces concurrent execution loops only after
  every caller passes canonical ingress. It keys the in-process coordination
  on tenant plus durable execution ID and releases it on completion/failure.
  Database claims remain the cross-process owner. This fixes the observed
  same-process pool contention under 12 concurrent calls; it does **not** add
  durable caller-alias storage.
- The existing architectural guard now covers create alongside cancel and
  reschedule. Ordinary regressions cover authorization, internal ownership,
  contact resolution, timezone/staff behavior, replay, CRM UNKNOWN, and
  in-process execution coordination.

No schema, migration, domain model, action class, entitlement policy or
business-policy extension was created. The candidate preserves the existing
registered entitlement requirements. The real-engine fixtures use an
explicitly entitled synthetic plan; an active tenant without a plan is not a
valid accepted-booking fixture.

## Exact STOP — B31-G1

This is a failure of an already documented contract, not a newly invented
idempotency requirement. The [Action Engine Schema Gate](CYCLE-06-ACTION-ENGINE-SCHEMA-GATE.md)
requires “same caller key, changed payload” to yield “conflict, never second
execution”. The [appointment migration report](CYCLE-06-PHASE-B2-APPOINTMENT-ACTION-MIGRATION-REPORT.md)
states that caller keys are additional aliases and do not split logical
identity.

The schema currently has just one nullable `idempotencyScope` /
`requestIdempotencyKeyHash` pair on `ActionExecution`, with the tenant-qualified
unique constraint. There is no canonical multiple-alias relation.
`ActionEngineKernel.findDuplicate` first checks that one pair, then checks the
logical fingerprint. When it finds the logical duplicate, it returns the
existing execution without binding the newly accepted caller key.

The [deterministic reproduction](evidence/package5-b31-secondary-idempotency-alias.probe.cjs)
uses the actual compiled HTTP route, B31 candidate, canonical Action Engine and
an owned PostgreSQL database:

1. Key **K1**, normalized booking **A** → Appointment/Execution **E1** succeeds.
2. Key **K2**, identical booking **A** → the same **E1** succeeds.
3. Key **K2**, changed booking **B** at another available time → **E2** succeeds.
4. Control: **K1** with booking **B** is correctly rejected as an idempotency
   conflict.

[Result](evidence/package5-b31-secondary-idempotency-alias.proof.json): two
Appointments, two **SUCCEEDED** ActionExecutions. Both are correctly Client-owned,
but K2 did not retain its first accepted request identity. Provider calls and
production mutations were zero. The reproduction is sequential and does not
depend on timing or on the local concurrency fix. The schema and kernel owning
this gap are unchanged from the accepted checkpoint.

Implementing the missing durable alias binding requires a reviewed schema
extension: tenant/scope/key hash must remain immutably associated with the
original execution/normalized action, including when a duplicate is found by
logical identity. Registration and conflict checks must be atomic. No storage
shape was chosen or implemented. Reusing unrelated audit/policy/result JSON as
an alias authority, replacing the first key, or relying on an in-memory map
would not satisfy the accepted contract.

The owner's instruction explicitly requires STOP before inventing a new
schema/model/business contract. Therefore implementation and deployment stop
here; the local candidate is retained, and B31 remains open. G1 is recorded
inside B31; B32/Wave 7 is not created.

## Verification and handoff

- Appointment/booking/client-channel plus runtime concurrency regressions:
  **31 suites / 316 tests PASS**.
- Existing architecture/boundary/ratchet gate: **83 suites / 480 tests PASS**.
- Project lint, production typecheck, scripts typecheck and build: **PASS**.
- Clean replay of all **79 migrations** in owned isolated PostgreSQL
  `127.0.0.1:55501/maya_c06_b31_fg`: **PASS**. Prisma validate/status PASS;
  pending migrations 0; schema diff NONE.
- [B31 positive/authorization proof](evidence/package5-b31-canonical-create.proof.json):
  real compiled HTTP/AI + real Action Engine + real PostgreSQL PASS. Twelve
  concurrent creates all return successfully; HTTP repeat and AI converge to
  one Appointment/Execution. Client without Maya User is supported via HTTP
  contact and AI exact CRM binding. Missing/revoked and wrong principal/tenant
  produce zero Appointment/Execution. CRM unknown outcome reconciles once or
  remains UNKNOWN without blind provider retry.
- **Mandatory secondary-key/changed-payload regression: FAIL — G1**.
- Full ordinary mandatory backend suite: **369 suites / 3015 tests PASS**.

A green ordinary suite does not override the failing executable idempotency
gate. **No deployment**, no production smoke mutations, and no post-deployment
all-family Final Completion Gate were performed. Package 5 completion and the
separate Chapter 6 acceptance are not certified by this local checkpoint.

```text
B29 PRODUCTION REMEDIATION: PASS — accepted repository baseline
B30 PRODUCTION REMEDIATION: PASS — accepted repository baseline
B31 LOCAL OWNERSHIP CANDIDATE: IMPLEMENTED, NOT ACCEPTED FOR DEPLOYMENT
B31 EXISTING CANONICAL FOUNDATION SUFFICIENT: NO — durable caller-alias gap G1
B31 MANDATORY EXECUTABLE IDEMPOTENCY GATE: FAIL
B31 PRODUCTION REMEDIATION: NOT RUN
ACTIVE BLOCKER: B31 / G1
PACKAGE 4 COMPLETE: YES
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13 — accepted baseline
PACKAGE 5 COMPLETE: NO
PACKAGE 5 POST-B31 PRODUCTION FINAL GATE: NOT RUN
CHAPTER 6 COMPLETE: NO
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
NEW SCHEMA / MODELS / ACTION CLASSES: 0
PRODUCTION MUTATIONS: 0
MAIN DIRTY WORKTREE TOUCHED: NO
PRE-EXISTING TEST DATABASES TOUCHED: 0/17
OWNED TEMP PROCESSES RUNNING: 0
OWNED SYNTHETIC DATABASES RETAINED: 1 — stopped; no destructive cleanup
```

Owned PostgreSQL data/logs were retained under the projectless task work/b31/ directory. The owned server was stopped and port 55501 closed. These are reproducible synthetic test artifacts, not production or pre-existing test databases.
