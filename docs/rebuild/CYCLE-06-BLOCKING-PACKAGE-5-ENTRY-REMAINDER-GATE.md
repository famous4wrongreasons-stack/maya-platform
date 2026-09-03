# CYCLE 06 — BLOCKING PACKAGE 5 ENTRY / REMAINDER GATE

Status: **PASS — exact reduced remainder established; implementation blocked at authority/schema decision boundary**

Accepted Package 4 checkpoint: `bcff7dff`

Report date: 2026-09-03

## 1. Scope and counting rule

This Gate recomputes the fifth **blocking implementation package** defined by
`CYCLE-06-REMAINDER-REVIEW.md`. It must not be confused with the older,
lower-level “Package 5 — Local Transactional Pilot” sequence in the Action
Engine Schema Gate. The local pilot is a useful first implementation slice,
but it is not the complete remaining blocking package.

The original blocking Package 5 contains thirteen normalized production
action families:

`A15`, `A16`, `A17`, `A18`, `A22`, `A23`, `A25`, `A26`, `A27`, `A28`,
`A29`, `A30`, and `A31`.

The unit used by the final counts is one whole normalized family. Packages
1–4 did not complete any one of those thirteen families end to end, but they
did remove substantial adjacent work from several of them. A partial family
is not counted as satisfied.

No application runtime, Prisma schema, migration, production data, provider,
payment, credential, scheduler, or Chapter 7 state was changed by this Gate.

## 2. Sources of truth

The review used:

- the Chapter 6 Phase A action and owner inventory;
- the Chapter 6 Action Engine Schema Gate;
- the accepted five-package remainder review;
- Package 1–4 completion and final adversarial reports;
- the current `ActionCapabilityRegistry`;
- the current production-reachable Nest controllers, services, schedulers,
  webhook/ingestion code and committed legacy Python owner surfaces;
- the current Prisma schema and architectural ratchets.

The scan deliberately distinguished:

- a governed business action;
- authentication or transport protocol state;
- an internal source-of-truth observation/reconciliation fact;
- a scheduler/bridge initiator;
- a direct execution owner.

Merely writing a database row does not by itself prove that a protocol or
reconciliation fact must become an Action Engine business action. Conversely,
calling a domain service does not make a direct business mutation canonical.

## 3. Accepted production baseline

Repository state at the Gate:

```text
HEAD: bcff7dff
origin/codex/maya-brain-systemic-release-20260815: bcff7dff
unpushed commits: 0
```

The active production artifact was read without mutation:

```text
ACTIVE RELEASE: 20260903-c06-p4-final-remediation-949bfece
SERVICE STATE: active
HEALTH HTTP: 200
READINESS HTTP: 200
```

The accepted Package 4 final verification supplies the immediately preceding
database baseline:

```text
PENDING MIGRATIONS: 0
SCHEMA DRIFT: NONE
PACKAGE 4 COMPLETE: YES
PRODUCTION VALUE EXECUTION OWNERS OUTSIDE ACTION ENGINE: 0
```

No production endpoint was invoked to create evidence and no production
database command was run by this Entry Gate.

## 4. What Packages 1–4 already removed

Package 5 can be reduced, but not deleted:

1. Package 1 closed the residual appointment mutation family and kept A08
   payment physically disabled. Package 5 must not re-audit or reimplement
   those appointment executors.
2. Package 2 closed reminders, reports, business alerts, and bulk/campaign
   communication execution. Package 5 schedulers and Python ratchets cover
   only still-open write families, not those communication actions.
3. Package 3 supplies the canonical ingress, server-derived policy,
   entitlement, approval binding, durable `ActionExecution`, immutable
   `ActionAttempt`, UNKNOWN, retry, lease, and reconciliation primitives.
   Package 5 must consume those primitives rather than design a second
   decision system.
4. Package 4 closed all monetary/value families. It removed value-bearing
   membership, certificate, referral, billing, loyalty, expense, canonical
   offer/version/replacement, and commerce-credential writes from Package 5.
5. Within A27, only ordinary inventory CRUD and non-value content ingestion
   remain. The three production inventory mutators are forced to
   `kind = inventory`; value-bearing catalog mutations already delegate to
   the P4-09 canonical offer/version executor.
6. The old `AiApprovalRequest` / `AiToolExecution` envelope remains reachable
   only for not-yet-migrated actions. It is not canonical authority and must
   be retired per capability during Package 5, not globally assumed closed by
   Package 3.

Thus the number of whole remaining families remains thirteen while the
implementation surface and risk inside them is materially smaller.

## 5. Exact remaining production scope

| ID | Exact remaining runtime surface | Current production execution owner(s) | Reduction / required contract |
| --- | --- | --- | --- |
| A15 | External staff-day schedule mutation exposed by `staff.schedule.update` and CRM schedule services | Legacy AI Tool Runtime → `StaffScheduleCommandService` / `CrmService` → provider adapter | Internal-calendar schedule belongs to A28. External dispatch needs stable target/revision identity, UNKNOWN after ambiguous dispatch, provider reread reconciliation, and no blind retry. |
| A16 | CRM staff-access provisioning, role/status mutation, activation/suspension, provider-user attachment, and owner claim | `UsersService`, `CrmService`, `AdminService` | Separate access grant, role change, lifecycle transition, and owner-claim identities; destructive races and bootstrap owner authority need an approved contract. |
| A17 | CRM credential stage/connect/replace, activate, recheck, disconnect, onboarding import/confirmation, and CRM-derived branch/presentation establishment | `CrmService`, `AdminService`, onboarding services | Commerce payment credentials are excluded by P4-10. CRM secret installation, provider verification, multi-entity import, rollback/compensation, and ambiguous provider dispatch remain open. |
| A18 | Customer self-profile mutation, staff notes mutation, CRM client identity/profile establishment and committed legacy client writers | `CustomersService`, CRM identity/mirror services, legacy Python where still reachable | Must separate canonical `Client` ownership from optional user identity, consent/PII facts from staff notes, and authoritative CRM observations from human mutations. P4-03 customer value is excluded. |
| A22 | General AI settings update, finance/assistant dashboard preferences, appointment-notification preferences | Legacy AI Tool Runtime, `DashboardPreferencesService`, `AppointmentNotificationsService` | Purely local candidate for the first low-risk transactional pilot. Exact setting key, actor/subject, revision and no-op semantics must be server-derived. Communication execution remains Package 2-owned. |
| A23 | Operational task create/complete, support-contact request, and adjacent inbox state/device registration writes found by the fresh inventory | Legacy AI Tool Runtime and `InboxService` | Must distinguish task/support business actions from inbox read-state and push-device protocol state. Storage dedup is not authority; Package 2 delivery ownership must not be reopened. |
| A25 | Session issue/refresh/logout/revoke, revoke-all, OAuth/social identity completion/linking, and auth registration/challenge claims | Auth, session, social-auth, and tenant-auth services | Protocol issuance/rotation must not automatically become an agent action. Explicit security mutations may require Action Engine. Exact protocol/action boundary and security audit authority require approval. |
| A26 | Tenant create/update/status, branch create, branding/logo, user/provider-user provisioning, onboarding/trial confirmation and lifecycle | Admin, branch, branding, users, onboarding, and trial services | Requires bootstrap semantics before a normal tenant membership exists, multi-entity transaction/compensation rules, object-upload reconciliation, destructive access policy, and hard caps. Billing-derived tenant state remains P4-08-owned. |
| A27 | Ordinary inventory create/update/delete and business-review ingestion | `BusinessContentService` | Value-bearing configuration is excluded by P4-09. Inventory CRUD remains direct. Review ingestion must be classified as trusted observation versus operator-authored content before defining an action. |
| A28 | Internal service create/update/deactivate; provider create/update/avatar; provider-service association; weekly availability replacement; time-off create/delete | `InternalCalendarService` | Must separate catalog content, staff/access, schedule, object upload, and destructive lifecycle identities. Service-price changes require prospective semantics and must not rewrite frozen appointment/customer value. |
| A29 | Consent-safe recovery touchpoint ingest, booking attribution, conversion/status updates | `RecoveryService` plus current internal producers | Must distinguish immutable observation facts from operator corrections and prove exact external-event identity, consent, tenant isolation, and non-retroactive attribution. |
| A30 | Auth retention, event/quarantine purge, legacy PII rotation/anonymization, and other production-reachable cleanup jobs | Retention services/schedulers and committed legacy Python jobs | Destructive retention needs approved legal retention periods, system actor, immutable run/envelope identity, bounded batches, restart/resume, audit, and explicit no-UNKNOWN local commit semantics. |
| A31 | CRM webhook ingestion, domain-event/quarantine writes, client/appointment mirror establishment, reconciliation runs/leases, catch-up and mirror correction | CRM webhook/ingestion services, reconciliation scheduler, event store, committed legacy producers | This is primarily an internal fact/reconciliation plane, not automatically an agent action. It needs an explicit exemption/ownership contract, exact source identity, one writer per fact, lease/completeness proof, and ratchets preventing it from becoming a hidden business mutation owner. |

This is the exact remaining family-level scope. Final action-class splitting is
not safe until the classification decisions in section 8 are approved. In
particular, treating every auth token write, inbox read marker, source mirror,
or quarantine row as an ordinary Action Engine action would be an invented
architecture rule.

## 6. Current execution-owner and bypass proof

The current `ActionCapabilityRegistry` contains the Package 1–4 canonical
capabilities and no executable capability for A15, A16, A17, A18, A22, A23,
A25, A26, ordinary A27, A28, A29, A30, or A31.

Six still-open AI write tools continue through the legacy AI tool lifecycle:

- `staff.schedule.update`;
- `settings.update`;
- `tasks.create`;
- `tasks.complete`;
- `notifications.appointments.update`;
- `support.contact-admin.request`.

The current handler calls the owning domain/Prisma service directly after the
legacy approval/runtime decision. It does not submit those six mutations to
Canonical Action Ingress.

The fresh production-source mutation inventory found `296` Prisma mutator
call sites across `42` non-test TypeScript files. That raw count deliberately
includes protocol, lifecycle, ingestion, and internal fact writes; it is not
reported as 296 business actions. Normalized against the approved Chapter 6
inventory, there are:

```text
PACKAGE 5 PRODUCTION BYPASS GROUPS: 13
PACKAGE 5 ACTION ENGINE-OWNED GROUPS: 0
```

Current owner planes are:

1. the legacy AI Tool Runtime for the six tools above;
2. Nest HTTP/domain services for all thirteen families;
3. schedulers/webhooks for A23, A29, A30, and A31;
4. committed legacy Python paths for the still-reachable CRM/client,
   recovery/cleanup, scheduler, and bridge subgroups.

Schedulers, webhooks, HTTP handlers and Python may remain initiators only
after each relevant family submits canonical intent and loses direct mutation
fallback. Internal protocol/fact pipelines need narrow, proven exceptions —
not a directory-wide allowlist.

## 7. Durable-schema assessment

Reusable foundation already exists:

- tenant-qualified `ActionExecution` identity and request-idempotency keys;
- immutable `ActionAttempt` history and provider request/reference hashes;
- approval/policy bindings, leases, retry and reconciliation state;
- domain-specific uniqueness in inbox, auth session/token, CRM access,
  recovery, quarantine, and reconciliation models;
- immutable value bindings created by Package 4.

The current schema is not sufficient to claim the complete Package 5
contract. The mutable Package 5 aggregates (`CrmIntegration`,
`CrmStaffAccess`, preferences, auth/session aggregates, tenant/branding,
internal calendar, and related models) have no tenant-qualified durable
transition/version binding to `ActionExecution`. Repeated changes overwrite
current state without a domain-level immutable action/result relation. A30
also has no approved durable bounded cleanup-run/item-claim contract spanning
the Nest and legacy cleanup owners.

This Gate does not invent one generic history table or add optional
`actionExecutionId` fields everywhere. The exact minimum must follow the
approved authority/action split. At least one additional Package 5 Schema
Proposal is therefore required, but no migration is authorized here.

## 8. Required architecture/business decisions

Implementation cannot safely begin before one Package 5 authority and
classification Gate decides:

1. which A25 auth/session writes are protocol-owned security facts versus
   explicit governed security actions;
2. which A29/A31 rows are canonical observations/reconciliation facts versus
   operator-correctable business mutations;
3. how A17 CRM connect/import is split into local credential installation,
   provider read verification, activation, multi-entity import and recovery;
4. the PII/legal retention periods, deletion subjects, audit facts, automatic
   batch caps and approval ceiling for A30;
5. the tenant/onboarding bootstrap authority before a normal owner membership
   exists, plus rollback/compensation semantics for A26;
6. whether inbox read/device state is a protocol exception while task/support
   creation/completion is Action Engine-owned;
7. future-only semantics for A28 service/catalog changes and object/avatar
   upload reconciliation;
8. the exact append-only transition/version facts required after those
   boundaries are fixed.

These are architecture, security, privacy, and business decisions. Choosing
them merely to begin Shadows would exceed the Entry Gate.

## 9. Minimal proven Package 5 remainder plan

The reduced remainder should be executed as bounded gates, not as one generic
cutover:

1. **P5 authority/classification and schema decision** — approve the action,
   protocol, observation, scheduler-initiator, and cleanup boundaries above.
2. **Low-risk local transactional pilot** — A22/A23 governed settings/task
   actions only, consuming the existing Schema Gate pilot contract.
3. **Access/session/tenant lifecycle** — A16, governed A25, and A26.
4. **CRM/staff/client convergence** — A15, A17, and A18 with provider UNKNOWN
   and reconciliation where dispatch exists.
5. **Non-value catalog/internal calendar** — reduced A27 and A28.
6. **Recovery/ingestion fact-plane convergence** — A29 and A31, with explicit
   internal-fact ownership and narrow ratchets.
7. **Destructive retention convergence** — A30 under separately approved
   legal policy, caps, proof and production boundary.
8. **Aggregate owner ratchet** — simultaneous Nest, scheduler, webhook and
   committed Python scan proving every remaining business mutation is either
   Action Engine-owned or an exact approved protocol/fact exception.

Each governed class requires non-executable Shadow, deterministic retry and
concurrency proof, tenant/policy/approval proof, executable PostgreSQL proof,
and a per-owner no-fallback ratchet. External mutations additionally require
UNKNOWN and reconciliation. Pure local commits must not invent UNKNOWN.

Production migrations cannot be enumerated honestly until the classification
and minimum schema proposal are approved. Any approved additive migration must
pass the normal expected-only pending-set, structural-clone, clean-replay,
drift, historical-compatibility, production readiness, and post-apply gates.

## 10. Chapter 6 closure after Package 5

After every Package 5 subgroup is cut over or narrowly proven as a legitimate
protocol/fact owner, Chapter 6 still requires:

1. a fresh whole-repository and deployed-artifact mutation/owner inventory;
2. simultaneous Package 1–5 architectural ratchets with synthetic bypass
   rejection and narrow proof/migration exemptions;
3. full regression, typecheck, lint, build and release preflight;
4. clean migration replay plus production pending `0` and drift `NONE`;
5. production read-only health, readiness, service-error, execution-owner,
   scheduler/webhook and legacy-fallback verification;
6. a Chapter 6 final adversarial verification/completion report.

Only then can Chapter 7 become eligible for a separate entry Gate.

## 11. Verdict

`PACKAGE 5 ENTRY GATE: PASS`

`ORIGINAL PACKAGE 5 REQUIREMENTS: 13 normalized families`

`ALREADY SATISFIED BY PACKAGES 1–4: 0 whole families (adjacent/sub-family scope removed)`

`PACKAGE 5 REMAINING REQUIREMENTS: 13 narrowed families`

`PACKAGE 5 EXACT REMAINING SCOPE: A15, A16, A17, A18, A22, A23, A25, A26, reduced A27, A28, A29, A30, A31`

`CAN PACKAGE 5 BE REDUCED BASED ON PACKAGE 1–4 COMPLETION: YES`

`ADDITIONAL SCHEMA REQUIRED: YES`

`NEW BUSINESS/ARCHITECTURE DECISIONS REQUIRED: YES`

`PACKAGE 5 IMPLEMENTATION CAN START: NO`

`CHAPTER 6 FINAL CLOSURE AFTER PACKAGE 5: fresh inventory + simultaneous ratchets + full regression/schema/deployment gates + production read-only proof + final completion report`

`PRODUCTION MUTATIONS: 0`

`CHAPTER 7 STARTED: NO`

STOP. The next safe step is the Package 5 authority/classification and minimum
schema decision Gate. No Shadow, runtime implementation, schema change,
migration, deployment, production mutation, or Chapter 7 work was started.

## 12. Process hygiene

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0`

`TEMP DATABASES REMAINING: 0`
