# CYCLE 06 — BLOCKING PACKAGE 5 AUTHORITY / CLASSIFICATION + MINIMUM SCHEMA DECISION GATE

Status: **PASS — six authority classes derived; one common foundation and three unique durable gaps proposed; runtime not started**

Accepted checkpoint: `30cd0622`

Report date: 2026-09-03

## 1. Scope and outcome

This Gate classifies the thirteen narrowed Package 5 families against the
current production-reachable implementation and the Chapter 6 contracts. It
does not treat every database write as an agent action and it does not exempt
an existing direct business writer merely because it is local or internal.

The classification produces six authority classes, one common append-only
mutation-result binding, and three family-specific durable capabilities. It
also identifies seven business/security/privacy decisions that cannot be
derived safely from the current specification.

No runtime, Prisma schema, migration, registry, ratchet, deployment,
production data, provider, scheduler, Python process, Package 4 baseline, or
Chapter 7 state was changed by this Gate.

## 2. Evidence and classification rules

The decision used:

- `CYCLE-06-REMAINDER-REVIEW.md` and the accepted Package 5 Entry Gate;
- the Chapter 6 Action Engine Schema Gate;
- Package 1–4 completion reports and current architectural ratchets;
- the current `ActionExecution`, `ActionAttempt`, `AuditLog`, auth, CRM,
  Client, inbox, internal-calendar, recovery, event, quarantine and
  reconciliation schema;
- current Nest controllers/services/schedulers and the committed legacy
  Python surfaces.

The following rules are binding for the implementation waves:

1. A requested business mutation is a **governed command**. Its policy,
   approval, normalized input and logical outcome belong to Canonical Action
   Ingress and Action Engine.
2. A provider observation is not a command. An authenticated source fact is
   accepted by the fact-ingestion authority and reduced into projections.
   Fabricating an `ActionExecution` for it would invent an actor and decision.
3. Routine authentication and pre-tenant bootstrap transitions are protocol
   state machines. Explicit security or post-tenant administrative commands
   remain governed actions.
4. A scheduler is either a bounded initiator or the owner of a narrowly
   defined system protocol. It is never automatically an authority merely
   because it runs without a human.
5. An ambiguous outcome exists only after a real external mutation may have
   crossed the boundary. Provider reads and local PostgreSQL transactions do
   not invent `UNKNOWN`.
6. Package 2 retains communication delivery ownership. Package 4 retains all
   monetary/value ownership. Package 5 may create operational facts or future
   non-value configuration but cannot reopen either owner plane.

## 3. Package 5 authority classes

### AC1 — governed local command

An actor or system initiator requests a bounded business/security/configuration
mutation whose authoritative commit is PostgreSQL.

```text
initiator
  -> Canonical Action Ingress
  -> server-derived identity/policy/approval
  -> Action Engine
  -> one local transaction: domain mutation + immutable mutation fact + action finalization
```

- `ActionExecution`: required.
- Outcome: PostgreSQL commit or rollback; `UNKNOWN` is not used.
- Identity: tenant-qualified target, mutation kind, expected target generation
  and normalized input hash.
- Retry/concurrency: one logical execution and one target generation.
- Audit: an immutable domain-result binding is required; best-effort
  `AuditLog.tryLog` is not the outcome authority.

### AC2 — governed external command

A bounded governed command can mutate an external provider or object store.

```text
initiator -> Action Engine -> durable ActionAttempt -> external dispatch
                                      -> reconciliation -> canonical outcome
```

- `ActionExecution` and `ActionAttempt`: required.
- Provider request identity is established before dispatch.
- Timeout/connection loss after possible dispatch becomes `UNKNOWN`, never
  automatic `FAILED`.
- Blind redispatch is forbidden. Reconciliation uses the same provider
  identity and exact target.
- Provider reads before mutation fail closed and do not create `UNKNOWN`.

### AC3 — protocol/bootstrap state machine

Routine token issue/rotation/challenge consumption, OAuth flow state and the
pre-tenant onboarding claim are protocol transitions, not ordinary business
actions.

- Canonical owner: the dedicated auth/onboarding state machine.
- Identity: token/state hash, session/token generation, or
  `TrialActivation.activationTokenHash`.
- Claims are one-time, restart-safe and concurrency-safe.
- `ActionExecution` is not required for routine protocol transitions.
- Explicit revoke-other/revoke-all, identity reassignment, owner/access and
  post-tenant administrative changes leave AC3 and enter AC1.
- The exception must be capability-specific; an `auth/` or `onboarding/`
  directory exemption is forbidden.

### AC4 — accepted immutable source fact

An authenticated webhook, provider read or bridge delivery supplies a fact;
it does not decide a business command.

- Canonical owner: `DomainEvent`/specialized source-fact ingestion.
- Identity: tenant + source + exact external source identity or deterministic
  canonical fingerprint.
- Immutable accepted facts survive replay; raw credentials and unnecessary
  PII do not enter payloads.
- `ActionExecution`: not required for automatic acceptance.
- Operator-authored correction is not a source fact and must use AC1.

### AC5 — derived projection and reconciliation

A deterministic reducer or reconciliation coordinator derives current local
state from AC4 facts or authoritative provider reads.

- Canonical owner: reducer plus `ReconciliationRun`/lease/completeness
  contract.
- Domain-event deduplication prevents repeated value/business effect.
- Incomplete/truncated reads cannot prove absence.
- Provider reads do not use external-mutation `UNKNOWN`; run completeness and
  failure are recorded honestly.
- `ActionExecution`: not required for automatic projection. Manual replay,
  discard, merge, correction or repair commands use AC1.

### AC6 — bounded destructive maintenance

Retention/anonymization/purge is a policy-owned destructive system operation,
not a normal domain command and not an untracked scheduler call.

- Canonical owner: a durable maintenance run/envelope and item claims.
- Identity: scope + policy/version + cutoff + subject class + run window.
- Every run is bounded, restartable and auditable; every item is claimed once
  per run.
- Local commit/rollback is authoritative; `UNKNOWN` is not used.
- Scheduled runs do not require fabricated `ActionExecution` rows. A
  tenant-scoped human-requested maintenance command may bind to one.

`PACKAGE 5 AUTHORITY CLASSES: 6`

## 4. Family-to-authority mapping

| Family | Authority class(es) | Mapping verdict |
| --- | --- | --- |
| A15 | AC2 | External staff-day schedule change is one governed provider command. |
| A16 | AC1 + AC5 | Human access/role/lifecycle/owner commands are governed; exact CRM-derived access synchronization is a projection. |
| A17 | AC1 + AC2 + AC3 + AC4/AC5 | Local secret/connect lifecycle is governed; any provider mutation uses AC2; pre-tenant claim uses AC3; verification/import observations and their projections use AC4/AC5. |
| A18 | AC1 + AC4 + AC5 | Self/staff profile, notes and correction commands are governed; CRM customer facts and mirrors remain source facts/projections. |
| A22 | AC1 | Business/dashboard/notification-setting changes are bounded local commands. |
| A23 | AC1 + AC3 | Task/support business state is governed; inbox read/archive state and device registration are narrow UX/transport protocols. |
| A25 | AC1 + AC3 | Explicit security mutations are governed; challenge/session/token lifecycle remains auth protocol. |
| A26 | AC1 + AC2 + AC3 | Post-tenant administration is governed, object upload is external, and pre-tenant trial activation is bootstrap protocol. |
| reduced A27 | AC1 + AC4 | Inventory CRUD is governed; authenticated external review ingest is a source fact. P4-09 value-bearing offers remain excluded. |
| A28 | AC1 + AC2 | Internal-calendar commands are governed; object/avatar upload is an external command when it crosses storage. |
| A29 | AC4 + AC5 + AC1 | Touchpoints/bookings are source facts and attribution is derived; any operator correction is governed. |
| A30 | AC6 | Cleanup is a bounded destructive maintenance protocol. |
| A31 | AC4 + AC5 + AC1 | Webhook/mirror/reconciliation is the fact plane; explicit replay/discard/repair is governed. |

`FAMILY→AUTHORITY MAPPING: COMPLETE`

## 5. Exact family contracts

### A15 — external staff schedule mutation

- **Purpose/surface:** `staff.schedule.update`,
  `StaffScheduleCommandService`, `CrmService` staff-day preview/read/apply and
  the provider adapter.
- **Authority/source:** Maya decides actor, policy and normalized schedule;
  the provider is authoritative for the resulting staff-day schedule.
- **Initiators/owner:** AI, staff UI and HTTP may initiate; AC2/Action Engine is
  the only mutation owner.
- **Identity/boundary:** tenant + provider + exact Staff/external staff link +
  branch + local date + expected provider revision + normalized slot hash.
- **Facts/audit:** schedule remains mutable; execution, attempts, request hash,
  provider correlation and final mutation fact are immutable.
- **Concurrency/outcome:** one staff/day/revision target; stale revision fails
  closed. Ambiguity after dispatch is `UNKNOWN`; exact day reread reconciles;
  no blind retry.
- **Approval/blast radius:** server-derived role/policy; one staff-day per
  action. Multi-staff/multi-day bulk is not authorized by this Gate.
- **Schema:** reuse `ActionExecution`, `ActionAttempt`, Staff/CRM links and the
  common mutation fact. No unique family schema proven necessary.

### A16 — staff access, roles, activation and owner claim

- **Purpose/surface:** `UsersService`, `CrmService`, `AdminService`, user/admin
  controllers; access grant, role change, activation/suspension, provider-user
  attachment and owner claim are distinct mutation kinds.
- **Authority/source:** Maya membership, `Staff`, `CrmStaffAccess` and verified
  identity bindings are authoritative. Provider observations may supply
  evidence but cannot grant authority.
- **Initiators/owner:** owner/platform admin or exact reconciliation initiator;
  Action Engine owns explicit commands, deterministic AC5 reducer owns only
  exact derived synchronization.
- **Identity/boundary:** tenant + Staff/access record + mutation kind + expected
  generation; provider-user identity is provider-qualified.
- **Facts/audit:** current access is mutable; each granted/changed/terminal
  transition and owner claim result is immutable.
- **ActionExecution:** required for explicit commands; forbidden as fabricated
  history for pure source-derived synchronization.
- **Outcome:** current implementation is local; commit/rollback, no `UNKNOWN`.
  A future provider mutation must move that action to AC2.
- **Approval/blast radius:** one staff/access subject per action; owner claim,
  role escalation and destructive lifecycle require explicit owner/platform
  policy and cannot be bulked.
- **Schema:** existing identity/access models plus common mutation fact.

### A17 — CRM connection, credential and import lifecycle

- **Purpose/surface:** `CrmService`, CRM/admin controllers, onboarding/trial
  services: credential stage/replace, connect/activate, recheck, disconnect,
  import/confirmation and derived branch/presentation establishment.
- **Authority/source:** owner input is authoritative only for a credential
  presented to the secret boundary; provider reads are authoritative for
  verification; Maya is authoritative for local connection status and
  accepted import state.
- **Initiators/owner:** owner/admin/onboarding; governed connection commands
  use Action Engine, pre-tenant token claims use AC3, observations/import
  reducers use AC4/AC5.
- **Identity/boundary:** tenant + integration/provider + operation + credential
  fingerprint/version (never raw secret); import uses source snapshot/run +
  per-entity provider-qualified identities.
- **Facts/audit:** raw credentials stay only in encrypted secret storage;
  execution/evidence/logs contain hashes and safe summaries. Provider
  observations are immutable; local integration status is mutable.
- **Outcome:** current provider verification reads fail closed. Any real
  provider-changing dispatch is AC2 with `UNKNOWN`, same-request
  reconciliation and no blind retry. Local multi-entity import is
  commit/rollback or a bounded resume/compensation protocol, never false
  atomicity with a provider.
- **Approval/blast radius:** owner approval; one integration per command;
  imports require an approved bounded envelope and per-child identities.
- **Schema:** base execution/attempt plus common mutation fact are reusable;
  exact disconnect/import compensation remains a business decision before its
  runtime Gate.

### A18 — Client profile, consent, notes and CRM identity

- **Purpose/surface:** `CustomersService`, CRM client identity/mirror services
  and committed legacy customer writers.
- **Authority/source:** canonical business person is `Client`, whether or not
  a Maya `User` exists. Self-declared profile fields, staff-authored notes,
  consent decisions and provider observations are different authorities.
- **Initiators/owner:** client/staff/admin commands use AC1; CRM facts use AC4
  and their deterministic mirror uses AC5.
- **Identity/boundary:** tenant + Client + profile/consent/note mutation kind +
  expected generation; CRM identity is tenant + provider + external id.
- **Facts/audit:** current locale/profile/notes may be mutable; consent
  grant/revoke evidence is append-only and notes remain encrypted. Phone/email
  are not canonical identity.
- **ActionExecution:** required for human/AI profile, notes, consent and manual
  correction commands; not for authenticated CRM observations.
- **Outcome:** local commit/rollback; provider reads fail closed; no external
  mutation is proven in this slice.
- **Approval/blast radius:** self fields only for exact Client; staff notes and
  merges/corrections require server-derived staff policy; one Client per
  action; P02/P03 unresolved identity remains fail closed where exact Client
  evidence is required.
- **Schema gap:** `CustomerProfile` is `User`-required and cannot represent a
  guest canonical Client, and two timestamps cannot preserve consent
  revocation/history. The A18 unique schema in section 7 is required.

### A22 — settings and notification preferences

- **Purpose/surface:** legacy `settings.update`,
  `DashboardPreferencesService`, `AppointmentNotificationsService` and their
  controllers.
- **Authority/source:** current stored config plus server allowlist/validation;
  initiator values are requests, not policy authority.
- **Initiators/owner:** authenticated user/AI/HTTP initiate; Action Engine AC1
  owns business setting mutation.
- **Identity/boundary:** tenant + membership + exact section/key + expected
  generation + normalized value hash.
- **Facts/audit:** current config is mutable; no-op and every applied generation
  are durable outcomes.
- **ActionExecution/outcome:** required; one local transaction, no `UNKNOWN`.
- **Approval/blast radius:** exact membership authority; one setting
  section/target per command. Communication sending remains Package 2-owned.
- **Schema:** existing preference models plus common mutation fact. This is the
  first low-risk local implementation candidate.

### A23 — operational tasks and support requests

- **Purpose/surface:** legacy `tasks.create`, `tasks.complete`,
  `support.contact-admin.request`, `AiToolHandlerService` and `InboxService`.
- **Authority/source:** task/support state belongs to a canonical operational
  work item. `InboxItem` is a durable presentation/delivery projection, not
  the business aggregate.
- **Initiators/owner:** user/AI initiates; Action Engine AC1 owns create and
  complete. Inbox read/archive/delete and `DevicePushToken` registration are
  narrow UX/transport protocols (AC3), not agent business actions.
- **Identity/boundary:** create uses tenant + initiator + deterministic request
  key; complete uses tenant + work item + expected open generation. Assignee
  is an exact tenant membership.
- **Facts/audit:** creation is immutable; status can transition once to a
  terminal result. Inbox delivery/read state remains separate.
- **ActionExecution/outcome:** required for task/support actions; local
  transaction, no `UNKNOWN`. Package 2 owns any message/push delivery.
- **Approval/blast radius:** server-derived assignment permission; one work
  item/assignee per command; no bulk task creation in this Gate.
- **Schema gap:** task status currently lives inside mutable
  `InboxItem.payloadJson`; it has no exact create/complete execution binding.
  The A23 work-item model in section 7 is required.

### A25 — auth, session and social identity

- **Purpose/surface:** auth/session/social-auth/tenant-auth services: challenge,
  registration, issue/refresh/logout/revoke, revoke-all and identity link or
  reassignment.
- **Authority/source:** cryptographic protocol state and authenticated subject
  are authoritative for routine session flows; explicit security commands are
  policy decisions.
- **Initiators/owner:** user/provider/admin; auth state machine AC3 owns
  challenge, issue, rotation, refresh and current-session logout. AC1 owns
  revoke-other/revoke-all and social identity link/reassignment.
- **Identity/boundary:** token/state hash and session generation for protocol;
  tenant + subject + session/identity + expected generation for commands.
- **Facts/audit:** token claims are one-time; revocation is terminal;
  credentials/tokens never enter action evidence.
- **Outcome:** OAuth/provider reads fail closed and are not `UNKNOWN`; local
  session commands use commit/rollback.
- **Approval/blast radius:** self revoke-other is exact-subject policy;
  admin-wide revoke and identity reassignment require explicit security
  approval and one target unless a separately approved envelope exists.
- **Schema:** current auth claim/session/token uniqueness plus common mutation
  fact for explicit commands. No generic exemption for auth code is allowed.

### A26 — tenant, branch, branding, users and onboarding

- **Purpose/surface:** `AdminService`, branches, branding, users, onboarding,
  trial activation and related controllers.
- **Authority/source:** `TrialActivation` owns the one-time pre-tenant claim;
  after tenant creation, tenant/membership/branch/branding facts are Maya
  authority. Billing-derived access remains P4-08-owned.
- **Initiators/owner:** platform/owner/admin; AC3 owns only pre-tenant claim,
  AC1 owns post-tenant business commands, AC2 owns object/logo upload when it
  crosses storage.
- **Identity/boundary:** activation-token hash before tenant; afterwards exact
  tenant + target + mutation kind + expected generation. Provider-user ids and
  object refs are provider-qualified.
- **Facts/audit:** activation claims and creation facts are immutable; tenant,
  branch, branding and access projections are mutable through governed
  generations.
- **Outcome:** local multi-entity work must be transactional or explicitly
  compensating. Ambiguous object upload uses provider correlation and
  reconciliation; local mutation does not use `UNKNOWN`.
- **Approval/blast radius:** platform authority for tenant creation/destruction;
  tenant owner for scoped administration; one tenant/branch/user/object per
  action; destructive cascades need a separate decision.
- **Schema:** `TrialActivation` can own pre-tenant claim and common mutation
  facts can bind post-tenant actions. Hard tenant deletion cannot preserve a
  tenant-cascaded action/audit history, so exact lifecycle semantics remain a
  blocker before A26 implementation.

### reduced A27 — ordinary inventory and review ingestion

- **Purpose/surface:** `BusinessContentService` inventory create/update/delete
  and external business-review ingestion. Certificate/membership/referral
  value configuration remains P4-09-owned.
- **Authority/source:** Maya `TenantCatalogItem(kind=inventory)` is authority
  for operator inventory; the authenticated provider is authority for an
  observed external review.
- **Initiators/owner:** owner/admin inventory commands use AC1; review
  webhooks/imports use AC4.
- **Identity/boundary:** inventory uses tenant + immutable item id + expected
  generation; review uses tenant + provider + exact external review id.
- **Facts/audit:** inventory current state is mutable; mutation results are
  immutable. Review source facts are append-only/idempotent; projections may
  update.
- **Outcome:** local commit/rollback, no `UNKNOWN`; no provider mutation is
  part of the reduced scope.
- **Approval/blast radius:** one inventory item per command; bulk forbidden
  until separately approved; value-bearing kinds remain rejected/delegated.
- **Schema:** existing catalog/review uniqueness plus common mutation fact.
  Hard-delete versus retirement/audit semantics is still a business decision.

### A28 — internal calendar configuration and availability

- **Purpose/surface:** `InternalCalendarService` service/provider CRUD,
  provider-service association, weekly availability replacement and time-off
  create/delete.
- **Authority/source:** Maya internal-calendar models are authoritative; actor
  payload is validated against tenant, branch, Staff and allowed service
  policy.
- **Initiators/owner:** owner/staff UI/HTTP initiate; AC1 owns local commands;
  AC2 owns avatar/object upload when external storage is mutated.
- **Identity/boundary:** exact tenant + branch + service/provider/Staff +
  mutation kind + expected generation. Availability additionally includes the
  canonical local week/day scope; time-off includes exact interval identity.
- **Facts/audit:** current catalog/schedule is mutable through generations;
  appointment price/duration snapshots remain immutable and are never
  rewritten.
- **Outcome:** local transaction for calendar state; storage dispatch can be
  `UNKNOWN` and must reconcile by object request identity.
- **Approval/blast radius:** server-derived role; one service/provider/week or
  time-off interval per action. Broad schedule replacement is not implicit
  bulk authority.
- **Schema:** existing domain models plus common mutation fact. Exact future-
  only price policy, caps and orphan-object cleanup remain decisions.

### A29 — recovery touchpoints and attribution

- **Purpose/surface:** `RecoveryService`, recovery bridge and producers for
  consent-safe touchpoints, booking conversion and status/revenue projections.
- **Authority/source:** exact authenticated external event/booking evidence is
  AC4; deterministic attribution over immutable evidence is AC5. An operator
  correction, if allowed, is AC1.
- **Initiators/owner:** scheduler/bridge/provider accepts facts; reducer owns
  derived projection; operator may only submit a separately authorized
  correction command.
- **Identity/boundary:** tenant + external event id for touchpoint; tenant +
  external booking ref for conversion; subject HMAC is candidate/attribution
  evidence, not person identity.
- **Facts/audit:** accepted observation history belongs in `DomainEvent`;
  `RecoveryTouchpoint`/`RecoveryConversion` are current projections. Raw PII
  stays out.
- **ActionExecution:** not required for source accept/reduce; required for
  manual correction.
- **Outcome:** provider/bridge reads fail closed; local dedup/commit truth, no
  external-mutation `UNKNOWN`.
- **Approval/blast radius:** consent and tenant evidence mandatory; one event
  or booking per fact/correction.
- **Schema:** current source uniqueness, `DomainEvent` and common correction
  fact are reusable. Attribution finality/correction window remains a business
  decision.

### A30 — PII and retention cleanup

- **Purpose/surface:** auth retention, event/quarantine purge, retention
  schedulers and committed legacy Python PII rotation/anonymization.
- **Authority/source:** approved legal/security retention policy is authority;
  wall-clock/cutoff and exact data class determine eligibility.
- **Initiators/owner:** bounded system scheduler or explicitly authorized
  admin; AC6 durable maintenance coordinator is the only destructive owner.
- **Identity/boundary:** platform/tenant scope + policy/version + data class +
  cutoff + deterministic run window; each item uses a non-PII identity hash.
- **Facts/audit:** run policy/limits and terminal item outcomes are durable;
  raw deleted subject data must not be copied into audit.
- **ActionExecution:** optional only for a tenant-scoped explicit request;
  forbidden as fabricated history for an automatic platform run.
- **Outcome:** PostgreSQL/local filesystem commit/rollback; no `UNKNOWN` unless
  a future contract adds a real external deletion dispatch.
- **Approval/blast radius:** no retention duration, automatic ceiling or
  deletion subject is approved by current Chapter 6 text, so destructive
  runtime remains blocked.
- **Schema gap:** no durable bounded run/item-claim contract exists. The A30
  maintenance models in section 7 are required.

### A31 — CRM ingestion, mirror and reconciliation

- **Purpose/surface:** CRM webhook/shadow ingestion, `EventStoreService`,
  client/appointment mirrors, reconciliation scheduler/service,
  `ReconciliationRun`, quarantine and catch-up.
- **Authority/source:** authenticated provider delivery/read is source
  evidence; `DomainEvent` is accepted canonical fact; deterministic reducers
  own mirrors; reconciliation completeness owns absence conclusions.
- **Initiators/owner:** webhook/scheduler/bridge initiate AC4/AC5. Explicit
  replay/discard/repair commands, where exposed, use AC1.
- **Identity/boundary:** tenant + source + exact provider identity/canonical
  fingerprint; reconciliation uses tenant + provider + exact window and a
  single live lease. Mirror identity is canonical Client/Staff/Appointment
  plus provider-qualified link.
- **Facts/audit:** `DomainEvent` is immutable evidence; quarantine is bounded
  diagnostic state; mirrors are mutable projections. No raw webhook body is
  promoted to action evidence.
- **ActionExecution:** not required for automatic ingest/reduce/reconcile;
  required for operator commands.
- **Outcome:** provider reads can fail or be incomplete but do not use
  external-mutation `UNKNOWN`; incomplete/truncated runs cannot assert
  deletion. Local writes use commit/rollback and event dedup.
- **Approval/blast radius:** bounded windows/pages, one tenant/provider run,
  lease takeover and no cross-tenant correction.
- **Schema:** `DomainEvent`, `IngestionQuarantine`, `ReconciliationRun`, leases
  and common manual-correction fact are reusable. The runtime Gate must prove
  one fact writer and narrow exemptions rather than add a second event model.

## 6. Why the existing common schema is insufficient

`ActionExecution` proves that a logical command was accepted and finalized,
but its free-form `targetKind`, `targetRef` and `safeResultSummaryJson` do not
provide a database-enforced relation to the exact domain mutation generation.
It cannot by itself prove:

- which one of several resource mutations in a transaction occurred;
- that two concurrent actions did not both claim the same next target
  generation;
- the before/after contract of a mutable aggregate;
- the retained result of a legitimate delete after the target row is gone;
- that a success result was not later rebound to a different target.

`AuditLog` cannot fill that role. It has no `ActionExecution` foreign key, no
target generation, no idempotency uniqueness and no database immutability
guard. Its service deliberately offers `tryLog`, which must not fail an
already-completed operation. That is correct for observability but makes it
unsuitable as the transactional outcome fact.

Adding an optional `actionExecutionId` to every current-state row would also
be insufficient: it records only the latest writer, loses prior generations,
cannot survive a hard delete, and invites thirteen slightly different
contracts.

## 7. Minimum common schema foundation

This Gate proposes one shared model and three narrowly specialized
capabilities. No migration is created here.

### 7.1 New common model: `ActionTargetMutation`

Append-only result fact for AC1/AC2 domain mutations:

| Field | Contract |
| --- | --- |
| `id` | immutable internal UUID |
| `tenantId` | mandatory tenant owner |
| `actionExecutionId` | composite FK to `[ActionExecution.id, tenantId]` |
| `mutationKey` | deterministic key inside one execution for multi-resource transactions |
| `targetKind` | registry-enumerated domain target kind |
| `targetRef` | Maya internal id or non-PII stable reference; never a raw credential/provider payload |
| `mutationKind` | registry-enumerated transition kind |
| `targetGeneration` | server-derived contiguous generation for this exact target scope |
| `beforeStateHash` | normalized safe-state hash, nullable only for create |
| `afterStateHash` | normalized safe-state hash, nullable only for delete |
| `createdAt` | immutable commit time |

Required relations and database invariants:

- tenant-qualified FK to `ActionExecution`;
- unique `(tenantId, actionExecutionId, mutationKey)`;
- unique `(tenantId, targetKind, targetRef, targetGeneration)` so different
  mutation kinds cannot race past one another on the same target;
- append-only/immutable trigger for all established fields;
- target generation is derived while the exact target scope is locked; a
  legitimately independent sub-resource (for example one preference section)
  must be represented in `targetRef`, not hidden by a second counter;
- domain write, result fact and ActionExecution success finalize in one
  PostgreSQL transaction for AC1;
- AC2 records provider attempts separately and writes this fact only when the
  canonical provider outcome and local projection are established;
- first post-cutover mutation of a historical current-state row begins at
  generation `0` with a real `beforeStateHash`; no fake earlier history is
  backfilled.

This fact is not used for AC3 protocol transitions, automatic AC4 source facts,
automatic AC5 projection writes or AC6 scheduled maintenance merely to make
their schemas look uniform.

### 7.2 A23: new `OperationalWorkItem` plus one inbox link

`OperationalWorkItem` is the task/support business aggregate:

- `id`, `tenantId`, `kind` (`task` or `support_request`);
- exact `assigneeUserId`, nullable `createdByUserId` with tenant-qualified
  membership relations where applicable;
- normalized `title`, `bodyText`, `dueAt`;
- `status`, `completedAt`, `createdAt`, `updatedAt`;
- mandatory tenant-qualified `createActionExecutionId`;
- nullable tenant-qualified `completeActionExecutionId`;
- uniqueness for create execution and completion execution;
- monotonic open-to-terminal transition and immutable creation identity.

Add nullable `InboxItem.operationalWorkItemId` with tenant-qualified FK. It
links a presentation projection to the work item without making inbox
delivery the task owner. Historical inbox tasks remain readable with `NULL`;
no fake work-item backfill is authorized.

### 7.3 A18: Client-owned profile and append-only consent

Minimum compatibility change to `CustomerProfile`:

- add nullable `clientId` plus tenant-qualified `Client` FK and unique
  `(tenantId, clientId)`;
- make `userId` and its membership relation nullable for historical/guest
  compatibility;
- add a database check that at least one of `clientId` or `userId` is present;
- require exact `clientId` for every new canonical post-cutover profile at the
  runtime/ratchet boundary; do not invent mappings for historical rows.

New append-only `ClientConsentFact`:

- `id`, `tenantId`, `clientId`;
- consent `kind` and decision (`grant`/`revoke`);
- `occurredAt`, `effectiveAt`, source kind and non-PII source identity hash;
- nullable actor membership and nullable tenant-qualified
  `actionExecutionId` (human command versus accepted source fact);
- tenant-qualified Client/actor/execution FKs;
- source-identity uniqueness and immutable fact trigger.

Current `privacyConsentAt`/`marketingConsentAt` remain compatibility
projections until a separately proven cutover; they are not backfilled into
fabricated consent history.

### 7.4 A30: `MaintenanceRun` and `MaintenanceItemClaim`

`MaintenanceRun` supplies the missing AC6 envelope:

- `id`, `scope` (`tenant`/`platform`), nullable `tenantId` with scope check;
- `runIdentityVersion`, deterministic `runIdentityFingerprint`;
- `maintenanceKind`, `subjectClass`, `policyKey`, `policyVersion`, `cutoffAt`;
- durable `maxItems`, `batchSize`, cursor hash, state, lease owner/expiry;
- requested/approved system-or-user authority and approval binding hash;
- attempted/succeeded/failed counts and lifecycle timestamps;
- nullable tenant-qualified `actionExecutionId` only for an explicit
  tenant-scoped request.

`MaintenanceItemClaim` supplies one-item restart safety:

- `id`, `maintenanceRunId`, `itemKind`, non-PII `itemRefHash`;
- claim generation/state/outcome code and timestamps;
- unique `(maintenanceRunId, itemKind, itemRefHash)`;
- immutable identity and terminal outcome; monotonic claim transitions.

This schema represents policy and limits but does not choose legal retention
periods or deletion subjects. No raw PII may be copied into either model.

### 7.5 Exact proposed schema delta

```text
NEW MODELS:
  ActionTargetMutation
  OperationalWorkItem
  ClientConsentFact
  MaintenanceRun
  MaintenanceItemClaim

NEW/CHANGED FIELDS:
  ActionExecution.actionTargetMutations (relation only)
  InboxItem.operationalWorkItemId?
  CustomerProfile.clientId?
  CustomerProfile.userId becomes nullable
  CustomerProfile.client relation
  CustomerProfile membership/user relations become nullable
  Tenant/Client/User/Membership inverse relations required by Prisma
```

The proposal is additive for historical data except for the safe nullability
relaxation of `CustomerProfile.userId`. It authorizes no backfill and no
production migration.

`PACKAGE 5 COMMON SCHEMA FOUNDATION REQUIRED: YES`

`MINIMUM NEW MODELS/FIELDS: ActionTargetMutation; OperationalWorkItem + InboxItem.operationalWorkItemId; CustomerProfile.clientId + nullable user ownership; ClientConsentFact; MaintenanceRun; MaintenanceItemClaim; required tenant-qualified/inverse relations and DB immutability/transition constraints`

## 8. Schema reuse by family

### Families requiring unique schema

- **A18:** Client-owned guest-compatible profile and append-only consent facts.
- **A23:** operational work item separated from inbox delivery/read state.
- **A30:** bounded maintenance run and item claims.

A26 may require a tenant tombstone/platform-action design if hard tenant
deletion is retained. That requirement is deliberately not invented before
the lifecycle decision in section 9.

`PACKAGE 5 FAMILIES REQUIRING UNIQUE SCHEMA: A18, A23, A30 (A26 conditional on approved tenant-destruction semantics)`

### Families reusing the current plus common foundation

- A15: ActionExecution/Attempt, Staff/CRM links, common mutation fact;
- A16: Membership/Staff/CrmStaffAccess and common mutation fact;
- A17: CrmIntegration, ActionAttempt and common mutation fact;
- A22: preference models and common mutation fact;
- A25: auth flow/session/token models and common fact for explicit commands;
- reduced A27: TenantCatalogItem/review uniqueness and common mutation fact;
- A28: internal-calendar models, appointment snapshots and common mutation fact;
- A29: DomainEvent/recovery projections and common fact for corrections;
- A31: DomainEvent/quarantine/ReconciliationRun and common fact for manual
  repair commands.

A26 reuses `TrialActivation` for pre-tenant claim and the common mutation fact
for non-destructive post-tenant changes, but its destructive edge remains
decision-blocked.

`PACKAGE 5 FAMILIES REUSING EXISTING FOUNDATION: A15, A16, A17, A22, A25, reduced A27, A28, A29, A31; A26 partially reuses TrialActivation/current tenant models`

## 9. Business/architecture decisions still required

The authority split is complete. Seven domain decisions remain and must be
resolved by the relevant wave Gate, not hidden in schema defaults:

1. **A17 CRM lifecycle:** exact credential replacement, activate/disconnect,
   import envelope, rollback/compensation and any real provider-mutation
   boundary.
2. **A18 customer data:** field-by-field self/staff/provider authority,
   consent kinds/effective rules, note retention and allowed historical
   profile correlation without phone-based identity invention.
3. **A26 bootstrap/destruction:** platform authority before membership,
   onboarding compensation, tenant suspension versus hard deletion and the
   durable audit/tombstone contract if deletion remains possible.
4. **reduced A27 inventory lifecycle:** hard delete versus retirement and the
   required audit retention semantics.
5. **A28 calendar/content policy:** future-only price/config semantics,
   approval/caps for broad availability changes and orphan-object cleanup or
   reconciliation after ambiguous upload.
6. **A29 attribution finality:** whether and within what evidence/window an
   accepted conversion attribution may be corrected; correction must never
   rewrite the source fact.
7. **A30 retention policy:** legal retention periods, eligible data classes,
   irreversible deletion versus anonymization, automatic batch ceilings,
   approval threshold and surviving audit content.

`NEW BUSINESS DECISIONS STILL REQUIRED: 7 — A17 CRM lifecycle/compensation; A18 profile/consent authority; A26 bootstrap/destruction; A27 inventory deletion; A28 future-only/calendar upload policy; A29 attribution correction/finality; A30 legal retention/caps`

## 10. Implementation waves

The common schema foundation is one prerequisite Gate/migration package. Once
approved and proven locally/structurally, Package 5 should proceed in six
large waves rather than thirteen family-by-family architectures.

### Wave 1 — local settings and operational work (A22, A23)

- **Shared authority/schema:** AC1, `ActionTargetMutation`,
  `OperationalWorkItem`.
- **Gate:** exact setting/task/support action classes, no-op semantics and
  task-to-inbox projection boundary.
- **Shadow/proof:** all actions in one non-executable Shadow cycle, then local
  PostgreSQL atomicity, retry/restart/concurrency and tenant/assignment proof.
- **Production boundary:** schema apply first; later a controlled runtime
  cutover. No synthetic messages; Package 2 delivery remains unchanged.

### Wave 2 — access, auth and tenant lifecycle (A16, A25, A26)

- **Shared authority/schema:** AC1 + AC3, common mutation facts, existing auth
  claims and `TrialActivation`.
- **Gate:** exact protocol exemptions, owner/escalation approval, bootstrap
  and destructive tenant semantics.
- **Shadow/proof:** only explicit governed actions receive Shadow/executable
  proof; protocol state gets one-time/replay/security proofs and narrow
  ratchets, not fake Shadows.
- **Production boundary:** capability-by-capability owner cutover after any
  conditional A26 tombstone schema is approved/applied.

### Wave 3 — CRM schedule, connection and Client data (A15, A17, A18)

- **Shared authority/schema:** AC1/AC2/AC4/AC5, ActionAttempt reconciliation,
  common mutation facts, Client profile/consent foundation.
- **Gate:** A17 compensation/provider contract and A18 field authority.
- **Shadow/proof:** governed command Shadows; provider ambiguity/reconciliation
  and no-blind-retry adversarial proof; observation replay/mirror proof; P02/P03
  fail-closed proof.
- **Production boundary:** expected-only schema migration first; no real
  provider mutation for proof; controlled runtime cutover only after all
  provider identities reconcile.

### Wave 4 — non-value inventory and internal calendar (reduced A27, A28)

- **Shared authority/schema:** AC1/AC2 and common mutation facts.
- **Gate:** inventory deletion, future-only schedule/catalog semantics, upload
  reconciliation and bounded-target policy.
- **Shadow/proof:** grouped local Shadows/proof plus object-store ambiguity
  proof where applicable; frozen appointment and Package 4 value regression.
- **Production boundary:** no real catalog/schedule/object mutation for proof;
  one controlled cutover after ratchets prove P4-09 value delegation remains.

### Wave 5 — recovery and CRM fact plane (A29, A31)

- **Shared authority/schema:** AC4/AC5, `DomainEvent`, quarantine,
  `ReconciliationRun`, and common facts only for manual commands.
- **Gate:** attribution finality and exact list of allowed operator commands.
- **Shadow/proof:** no fabricated ActionExecution Shadow for automatic source
  facts. Use replay, dedup, lease takeover, completeness, ordering,
  cross-tenant and projection determinism proofs; Shadow only manual
  corrections/replay/discard/repair actions.
- **Production boundary:** read-only/provider-read verification, then narrow
  owner cutover and exception ratchets for webhook/scheduler/bridge paths.

### Wave 6 — destructive retention (A30)

- **Shared authority/schema:** AC6 `MaintenanceRun`/`MaintenanceItemClaim`.
- **Gate:** legal policy, data classes, caps, approvals and surviving audit.
- **Shadow/proof:** dry-run manifest, deterministic claims, bounded fan-out,
  crash/restart, concurrent scheduler, tenant/platform isolation and no-PII
  audit proof.
- **Production boundary:** schema apply and read-only eligibility dry-run are
  separate from any destructive apply. Real deletion/anonymization requires
  its own expressly approved production boundary.

After Wave 6, one Package 5 aggregate adversarial gate must rescan Nest,
schedulers, webhooks and committed Python and run every Action Engine ratchet
and every exact AC3/AC4/AC5/AC6 exception simultaneously.

`PACKAGE 5 IMPLEMENTATION WAVES: 6`

`PACKAGE 5 CAN PROCEED IN LARGE CYCLES: YES`

## 11. Implementation start decision

After this Gate and its minimum schema proposal are explicitly accepted,
implementation may start with the common schema foundation and Wave 1. Waves
2–6 may proceed only after their listed domain decisions are approved. This
does not authorize runtime implementation, a migration or production change
in the present cycle.

`PACKAGE 5 IMPLEMENTATION CAN START AFTER THIS GATE: YES — after explicit acceptance, common schema foundation then unblocked Wave 1; decision-blocked waves remain gated`

## 12. Chapter 6 closure dependency

After all six waves are cut over or proven as narrow protocol/fact owners,
Chapter 6 still requires:

1. a fresh production-reachable mutation/owner inventory;
2. simultaneous Package 1–5 ratchets with synthetic bypass rejection and only
   exact proof/migration/protocol/fact exemptions;
3. clean migration replay, Prisma validation, production pending `0` and drift
   `NONE`;
4. full regression, typecheck, lint, build and deployment gates;
5. production read-only health, readiness, error, owner, scheduler/webhook,
   provider and legacy-fallback verification;
6. a Chapter 6 final adversarial verification/completion report.

Chapter 7 remains ineligible until that aggregate Gate passes.

## 13. Final verdict

`PACKAGE 5 AUTHORITY/CLASSIFICATION GATE: PASS`

`PACKAGE 5 AUTHORITY CLASSES: 6`

`FAMILY→AUTHORITY MAPPING: COMPLETE`

`PACKAGE 5 COMMON SCHEMA FOUNDATION REQUIRED: YES`

`MINIMUM NEW MODELS/FIELDS: ActionTargetMutation; OperationalWorkItem + InboxItem.operationalWorkItemId; CustomerProfile.clientId + nullable user ownership; ClientConsentFact; MaintenanceRun; MaintenanceItemClaim; required tenant-qualified/inverse relations and DB constraints`

`PACKAGE 5 FAMILIES REQUIRING UNIQUE SCHEMA: A18, A23, A30 (A26 conditional on approved tenant-destruction semantics)`

`PACKAGE 5 FAMILIES REUSING EXISTING FOUNDATION: A15, A16, A17, A22, A25, reduced A27, A28, A29, A31; A26 partially`

`NEW BUSINESS DECISIONS STILL REQUIRED: 7 — A17, A18, A26, reduced A27, A28, A29, A30 exact decisions in section 9`

`PACKAGE 5 IMPLEMENTATION WAVES: 6`

`PACKAGE 5 CAN PROCEED IN LARGE CYCLES: YES`

`PACKAGE 5 IMPLEMENTATION CAN START AFTER THIS GATE: YES — common foundation/Wave 1 after explicit acceptance`

`PRODUCTION MUTATIONS: 0`

`CHAPTER 7 STARTED: NO`

## 14. Process hygiene

No server, watcher, browser, Playwright/Chrome instance, temporary PostgreSQL
cluster or background worker was started for this read-only Gate.

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0`

`TEMP DATABASES REMAINING: 0`

STOP. No Package 5 runtime, Shadow, schema migration, production write or
Chapter 7 work was started.
