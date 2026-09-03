# CYCLE 06 — BLOCKING PACKAGE 5 BUSINESS DECISION CLOSURE + SCHEMA APPROVAL BRIEF

Status: **INCOMPLETE — seven recommendations prepared; five choices can change the minimum schema and require approval**

Accepted checkpoint: `22728897`

Report date: 2026-09-03

## 1. Scope and decision rule

This brief takes exactly the seven unresolved decisions from the accepted
Package 5 Authority / Classification Gate. It does not reopen the six
authority classes or six implementation waves.

Each option is evaluated against these fixed boundaries:

- explicit business/security/configuration commands use Canonical Action
  Ingress and Action Engine;
- routine auth/bootstrap protocol, immutable source facts, deterministic
  projections and bounded maintenance retain their approved narrow owners;
- Package 2 remains communication owner;
- Package 4 remains monetary/value owner;
- P02/P03 identity hold remains fail closed;
- external mutation ambiguity is `UNKNOWN` and requires reconciliation;
- local PostgreSQL commit/rollback does not invent `UNKNOWN`.

No option is approved merely by being recommended here. Runtime, schema and
migration work remain stopped until the required choices are accepted.

## 2. Decision D1 — A17 CRM lifecycle and compensation

### Exact question

Should credential installation, provider verification/activation, bounded
CRM import and disconnect be one long-lived operation, or distinct canonical
capabilities with explicit local/external boundaries?

**Families/waves:** A17; Wave 3. A26 onboarding may initiate the first A17
capability but does not own it.

### Option A — separate bounded capabilities (recommended)

1. Install/replace the encrypted credential locally.
2. Verify the provider with a read-only request, then activate local
   connection state.
3. Confirm a bounded import envelope with deterministic per-entity children.
4. Disconnect in one local transaction that removes the secret/integration
   and revokes derived local links/sessions.

The UI may present this as one flow, but retries never replay earlier
capabilities. Provider verification reads fail closed; they do not create
`UNKNOWN`. If a future API actually mutates the provider, only that capability
moves to the AC2 dispatch/reconciliation contract.

- **Security/data integrity:** least privilege and exact secret boundary;
  failed verification cannot activate; import cannot hide partial child
  outcomes; disconnect cannot leave a live credential behind a falsely
  disconnected projection.
- **Common schema impact:** none. `ActionExecution`, `ActionAttempt` and
  `ActionTargetMutation` are sufficient; raw secrets stay outside them.
- **Why recommended:** it matches the current provider-read implementation and
  avoids pretending provider reads and local multi-row commits are one atomic
  side effect.

### Option B — one durable connect/import saga

One parent ActionExecution owns credential installation, verification,
activation and import, with resumable phases and compensations.

- **Plain-language consequence:** the user gets one operation, but every phase
  and recovery edge must be persisted and supported indefinitely.
- **Security/data integrity:** crash recovery is possible, but a bad phase
  machine can retain credentials or report success after partial import.
- **Common schema impact:** the generic foundation remains, but a dedicated
  CRM operation/phase model may be required after detailed design.
- **Trade-off:** strongest orchestration view, materially greater complexity.

### Option C — provider-first mutable workflow

Write or change provider state first, then update Maya and compensate on
failure.

- **Plain-language consequence:** Maya can lose the exact result after a
  timeout and must reconcile before retry.
- **Security/data integrity:** largest UNKNOWN and credential-orphan surface;
  blind retry would be dangerous.
- **Common schema impact:** ActionAttempt remains required; provider-specific
  durable correlation may be needed.
- **Verdict:** not supported by the current read-only provider verification
  evidence and not recommended.

`D1 RECOMMENDED OPTION: A`

`SCHEMA-BLOCKING: NO`

`RUNTIME-ONLY: YES`

`CAN BE DEFERRED UNTIL ITS WAVE: YES`

## 3. Decision D2 — A18 Client profile and consent authority

### Exact question

Is customer profile/consent owned by canonical `Client`, by Maya `User`, or
by two separate aggregates, and which authority may change each field without
inventing identity from phone/email?

**Families/waves:** A18; Wave 3. It must preserve P4-03 Client ownership and
P02/P03 hold.

### Option A — Client-owned profile with optional User actor (recommended)

- `CustomerProfile` belongs to exact tenant-qualified `Client`.
- `userId` is optional and identifies an account/actor, not the customer.
- preferred locale/self fields may be changed by the exact linked Client
  account; encrypted staff notes require staff policy.
- consent grant/revoke is an append-only `ClientConsentFact` with exact source,
  effective time and actor/evidence.
- CRM observations remain source facts/projections and never overwrite
  self/staff authority silently.
- historical User-owned rows remain compatible and are not phone-backfilled.

- **Security/data integrity:** supports guest Clients, avoids account/customer
  conflation and preserves consent revocation history. Unresolved identities
  fail closed.
- **Common schema impact:** exactly the proposed CustomerProfile extension and
  `ClientConsentFact`; no additional model.
- **Why recommended:** this is the only option aligned with the already closed
  Client-owned value model.

### Option B — retain User-owned profiles

Only Maya accounts can have profile/consent state; guest Clients have none.

- **Plain-language consequence:** most salon customers remain outside the
  canonical profile/consent model.
- **Security/data integrity:** avoids migration complexity but preserves the
  known false equivalence between account and business customer.
- **Common schema impact:** would remove the proposed Client extension and
  change or eliminate `ClientConsentFact` ownership.
- **Verdict:** conflicts with P4-03 identity semantics; not recommended.

### Option C — create a new ClientProfile and retain CustomerProfile

Keep the current User aggregate and add a second Client-owned profile, with
an explicit projection between them.

- **Plain-language consequence:** two profile records can disagree and every
  reader must choose the correct authority.
- **Security/data integrity:** can preserve compatibility, but introduces
  dual-write and precedence risks.
- **Common schema impact:** replaces the proposed extension with a new
  `ClientProfile` plus projection/conflict rules.
- **Verdict:** only justified if an external compatibility consumer proves the
  existing model cannot be relaxed.

`D2 RECOMMENDED OPTION: A`

`SCHEMA-BLOCKING: YES`

`RUNTIME-ONLY: NO`

`CAN BE DEFERRED UNTIL ITS WAVE: NO — it directly determines two proposed foundation capabilities`

## 4. Decision D3 — A26 bootstrap, tenant lifecycle and destruction

### Exact question

What is authoritative before a tenant membership exists, how does tenant
creation recover from failure, and does Package 5 permit physical tenant
deletion or only durable lifecycle transitions?

**Families/waves:** A26; Wave 2. A17 may be initiated after bootstrap; A30 may
later purge eligible data under its own legal policy.

### Option A — TrialActivation bootstrap plus durable suspension (recommended)

- `TrialActivation.activationTokenHash` is the one-time pre-tenant claim.
- one transaction creates the tenant, first owner membership and activation
  binding; rollback creates none, retry resolves the same tenant.
- after creation, all tenant/user/branch/branding commands use Action Engine.
- suspend/cancel are durable states. Package 5 does not hard-delete a tenant.
- irreversible physical purge belongs only to A30 after legal approval and
  preserves its own platform-scope evidence.

- **Security/data integrity:** no invented tenant for ActionExecution, no
  orphan owner, and action/audit history survives lifecycle changes.
- **Common schema impact:** current `TrialActivation` and proposed common
  foundation remain sufficient.
- **Why recommended:** it separates bootstrap from governed post-tenant work
  and avoids cascade deletion of the evidence meant to prove the action.

### Option B — allow platform-approved hard tenant deletion

Platform authority may physically delete a tenant and its cascaded rows after
an approval.

- **Plain-language consequence:** ordinary tenant-scoped execution and audit
  rows disappear with the tenant unless separate platform tombstones survive.
- **Security/data integrity:** requires exact deletion manifest, cooling-off,
  one-time claim and surviving non-PII evidence; mistaken deletion is
  irreversible.
- **Common schema impact:** adds a platform-scoped `TenantLifecycleTombstone`
  or equivalent non-cascading receipt; current tenant-qualified
  `ActionTargetMutation` cannot be the surviving proof.
- **Trade-off:** supports erasure, but is a separate destructive architecture.

### Option C — platform creates tenant directly without TrialActivation

A platform administrator creates the tenant and first owner through a
platform-only command.

- **Plain-language consequence:** assisted onboarding and self-activation need
  a separate correlation path.
- **Security/data integrity:** may be safe for manual provisioning, but cannot
  replace one-time public activation without a new pre-tenant action model.
- **Common schema impact:** requires a platform-scope provisioning execution
  model because `ActionExecution.tenantId` is mandatory.
- **Verdict:** unnecessary while TrialActivation already supplies the claim.

`D3 RECOMMENDED OPTION: A`

`SCHEMA-BLOCKING: YES`

`RUNTIME-ONLY: NO`

`CAN BE DEFERRED UNTIL ITS WAVE: YES — only if A26 and any hard-delete schema are excluded from the first foundation migration`

## 5. Decision D4 — reduced A27 inventory deletion

### Exact question

Does “delete inventory” mean durable retirement or physical removal, and what
audit survives either outcome?

**Families/waves:** reduced A27; Wave 4. P4-09 offer/version rows are excluded.

### Option A — retire inventory (recommended)

Set existing `TenantCatalogItem.active = false`; preserve immutable item id,
historical reads and the ActionTargetMutation generation. A separately
authorized restore can create another generation.

- **Security/data integrity:** references never dangle and deletion is
  auditable/reversible; no customer value changes because only
  `kind=inventory` is allowed.
- **Common schema impact:** none; `active` already exists.
- **Why recommended:** it provides the strongest audit at the lowest cost.

### Option B — hard delete with retained mutation fact

Physically remove only an unreferenced inventory row in the same transaction
that stores a delete `ActionTargetMutation` with `beforeStateHash` and null
`afterStateHash`.

- **Plain-language consequence:** the item disappears, but a safe proof of
  deletion remains.
- **Security/data integrity:** all references must be checked/blocked; the
  receipt must contain no product text or PII.
- **Common schema impact:** none; the common mutation fact was designed to
  survive target deletion.
- **Trade-off:** smaller live catalog, less useful operational history.

`D4 RECOMMENDED OPTION: A`

`SCHEMA-BLOCKING: NO`

`RUNTIME-ONLY: YES`

`CAN BE DEFERRED UNTIL ITS WAVE: YES`

## 6. Decision D5 — A28 future-only calendar configuration and object upload

### Exact question

Do service/provider/availability changes apply only prospectively, or require
effective-dated versions, and how is an ambiguous avatar/object upload
reconciled?

**Families/waves:** A28; Wave 4. Existing appointments and all Package 4 frozen
value must remain unchanged.

### Option A — prospective current config plus frozen appointments (recommended)

- service/provider/availability changes affect only future scheduling
  decisions;
- existing appointment price/duration/service snapshots are never rewritten;
- one action changes one service/provider/week/time-off target;
- object upload uses a deterministic object key and durable ActionAttempt;
  local URL changes only after proven upload or reconciliation;
- ambiguous upload is `UNKNOWN`; blind re-upload under a new key is forbidden.

- **Security/data integrity:** historical bookings remain truthful; retries do
  not orphan or duplicate objects; broad schedule changes remain bounded.
- **Common schema impact:** existing calendar models, appointment snapshots,
  ActionAttempt and ActionTargetMutation are sufficient.
- **Why recommended:** it matches the current snapshot boundary without
  creating a second catalog/version system.

### Option B — effective-dated calendar configuration versions

Every service/availability change creates a version with effective interval;
future booking resolves the active version.

- **Plain-language consequence:** future scheduled changes and exact history
  are first-class, but reads and conflict rules become more complex.
- **Security/data integrity:** strongest temporal audit; overlapping versions
  and timezone boundaries need database enforcement.
- **Common schema impact:** adds service/provider/availability version models
  and effective-range exclusion constraints.
- **Trade-off:** justified only by a proven requirement for scheduled future
  configuration, which current scope does not show.

### Option C — mutate config and recalculate open appointments

- **Plain-language consequence:** a price/duration change could alter an
  already accepted booking.
- **Security/data integrity:** retroactively rewrites customer/business facts
  and conflicts with Package 4 frozen value.
- **Common schema impact:** no schema can make this approved semantics safe.
- **Verdict:** forbidden.

`D5 RECOMMENDED OPTION: A`

`SCHEMA-BLOCKING: YES`

`RUNTIME-ONLY: NO`

`CAN BE DEFERRED UNTIL ITS WAVE: YES`

## 7. Decision D6 — A29 recovery attribution finality

### Exact question

Can later authoritative evidence correct a recovery attribution, within what
boundary, and how is correction recorded without rewriting the original
touchpoint/booking fact?

**Families/waves:** A29; Wave 5. A31 supplies shared fact/reconciliation
infrastructure.

### Option A — immutable facts, revisable projection with evidence (recommended)

- every provider/bridge observation is an immutable `DomainEvent`;
- `RecoveryTouchpoint` and `RecoveryConversion` are current projections;
- a later authoritative CRM event may recompute attribution within the
  touchpoint's frozen `attributionWindowDays`;
- an operator correction is a separate approved command and immutable
  ActionTargetMutation; it never edits or deletes the source event;
- outside the frozen window the projection remains final unless a separately
  approved exceptional correction policy exists.

- **Security/data integrity:** preserves provenance while allowing late CRM
  truth; repeated evidence is deduplicated; reported historical source facts
  are never fabricated.
- **Common schema impact:** existing DomainEvent/recovery models plus the
  common mutation fact are sufficient.
- **Why recommended:** it uses the already durable observation plane instead
  of creating another history system.

### Option B — append-only attribution revision aggregate

Every attribution state is its own immutable revision and the current row
points to the latest revision.

- **Plain-language consequence:** exact projection history is easy to query,
  but every reducer and report must understand revisions.
- **Security/data integrity:** strongest explicit correction chain; requires
  contiguous revision and one-current constraints.
- **Common schema impact:** adds `RecoveryAttributionRevision` and current
  revision bindings.
- **Trade-off:** duplicates information already reconstructible from
  DomainEvent unless reporting proves it necessary.

### Option C — first accepted attribution is final

No later evidence can change attribution.

- **Plain-language consequence:** simplest implementation but late provider
  confirmations remain permanently wrong.
- **Security/data integrity:** prevents operator abuse but sacrifices source
  truth and reconciliation accuracy.
- **Common schema impact:** none.
- **Verdict:** safe but operationally inaccurate; not recommended.

`D6 RECOMMENDED OPTION: A`

`SCHEMA-BLOCKING: YES`

`RUNTIME-ONLY: NO`

`CAN BE DEFERRED UNTIL ITS WAVE: YES`

## 8. Decision D7 — A30 retention policy, caps and approval

### Exact question

Who defines retention periods and deletion/anonymization mode, which data
classes may be processed automatically, what are the batch limits, and what
evidence survives deletion?

**Families/waves:** A30; Wave 6. Auth protocol rows, ingestion quarantine and
legacy PII jobs are separate data classes.

### Option A — fixed versioned platform allowlist, staged rollout (recommended)

- policy lives in reviewed code/config under an immutable `policyKey` and
  version recorded on every MaintenanceRun;
- one data class and one scope per run;
- first eligible automatic classes are only those with an existing explicit
  expiry/retention contract (expired auth protocol rows and
  `IngestionQuarantine.expiresAt`);
- current auth defaults/ranges are evidence, not automatically approved legal
  policy: session 30 days (bounded 7–365), challenge 24 hours (1–168), rate
  limit 24 hours (1–720);
- recommend automatic batch default `1,000`, hard ceiling `10,000`, matching
  current bounded auth implementation; larger/manual destructive runs require
  platform-owner approval and a separate envelope;
- other PII classes and legacy anonymization remain disabled until explicitly
  added to the allowlist with deletion/anonymization and surviving audit rules.

- **Security/data integrity:** narrow rollout, deterministic dry-run manifest,
  item claims, restart safety and no raw deleted PII in audit.
- **Common schema impact:** exactly the proposed `MaintenanceRun` and
  `MaintenanceItemClaim`; no policy table.
- **Why recommended:** turns existing bounded behavior into an auditable owner
  without silently authorizing every legacy cleanup target.

### Option B — tenant-configurable versioned retention policy

Each tenant can choose periods within platform bounds; runs bind the exact
tenant policy version.

- **Plain-language consequence:** flexible compliance settings, but tenants
  can change when destructive operations happen.
- **Security/data integrity:** needs role approval, minimum legal bounds,
  immutable policy history and race rules between policy changes and runs.
- **Common schema impact:** adds `RetentionPolicyVersion` and current-policy
  binding; the current proposed minimum is insufficient.
- **Trade-off:** powerful but no current business requirement approves it.

### Option C — manual-only destructive maintenance

Every run requires platform-owner approval; no automatic scheduler mutation.

- **Plain-language consequence:** simplest control, but stale protocol/PII data
  can accumulate and compliance depends on operations.
- **Security/data integrity:** lowest automation blast radius, highest missed-
  retention risk. Durable run/item claims are still required.
- **Common schema impact:** proposed maintenance models remain, scheduler
  fields are retained for restart/claim ownership.

`D7 RECOMMENDED OPTION: A`

`SCHEMA-BLOCKING: YES`

`RUNTIME-ONLY: NO`

`CAN BE DEFERRED UNTIL ITS WAVE: NO — not if MaintenanceRun/ItemClaim are included in one common foundation migration`

## 9. Classification summary

| Decision | Recommended | Schema-blocking | Runtime-only | Deferrable until wave |
| --- | --- | ---: | ---: | ---: |
| D1 A17 CRM lifecycle | A | No | Yes | Yes |
| D2 A18 profile/consent | A | Yes | No | No |
| D3 A26 bootstrap/destruction | A | Yes | No | Yes, if A26 schema is excluded initially |
| D4 A27 inventory deletion | A | No | Yes | Yes |
| D5 A28 prospective calendar config | A | Yes | No | Yes |
| D6 A29 attribution finality | A | Yes | No | Yes |
| D7 A30 retention policy | A | Yes | No | No for a single all-model foundation |

`BUSINESS DECISIONS TOTAL: 7`

`SCHEMA-BLOCKING DECISIONS: 5`

`DEFERABLE WAVE-SPECIFIC DECISIONS: 5 — D1, D3 conditionally, D4, D5, D6`

## 10. Proposed foundation review

### 10.1 `ActionTargetMutation`

- **Why needed:** proves which exact domain target generation a successful
  ActionExecution changed, including multi-row actions and deleted targets.
- **Families:** governed command portions of A15–A18, A22, A23, A25, A26,
  reduced A27, A28, manual A29 and manual A31.
- **Why existing schema is insufficient:** ActionExecution target/result fields
  are not relational or generation-unique; `AuditLog` is best-effort and has
  no ActionExecution FK.
- **Mutability:** strictly append-only and immutable.
- **Canonical owner:** Action Engine executor transaction.
- **ActionExecution binding:** mandatory, tenant-qualified composite FK.
- **Tenant/concurrency:** tenant mandatory; unique execution/mutation key and
  unique target generation; exact target scope locked before next generation.
- **Forbidden data:** raw credentials/tokens, raw provider payloads, raw PII,
  free-form secret-bearing input; only internal refs and normalized safe hashes.

### 10.2 `OperationalWorkItem`

- **Why needed:** task/support business status currently lives inside inbox
  delivery payload and has no one-time create/complete binding.
- **Families:** A23.
- **Why existing schema is insufficient:** InboxItem owns presentation,
  read/archive/delete and Package 2 delivery concerns, not task authority.
- **Mutability:** immutable creation identity; monotonic open-to-terminal
  lifecycle. The current status row may change only through guarded transition.
- **Canonical owner:** Action Engine task/support executor.
- **ActionExecution binding:** mandatory create execution; optional but unique
  completion execution when terminalized.
- **Tenant/concurrency:** exact tenant memberships for actor/assignee; one item
  per create execution and one terminal winner.
- **Forbidden data:** credentials, auth tokens, raw provider payloads and
  unnecessary sensitive customer data. Only normalized minimum work content.

### 10.3 `ClientConsentFact`

- **Why needed:** consent grant/revoke/history cannot be represented by two
  nullable “last consent” timestamps.
- **Families:** A18.
- **Why existing schema is insufficient:** CustomerProfile is User-required
  and overwrites consent state; most canonical Clients may be guests.
- **Mutability:** append-only and immutable.
- **Canonical owner:** Client consent fact service; Action Engine for human
  commands, AC4 source-fact owner for exact accepted evidence.
- **ActionExecution binding:** tenant-qualified and optional by authority class,
  mandatory for human/AI commands.
- **Tenant/concurrency:** exact tenant-qualified Client; unique source identity;
  ordering/effective-time rules cannot rewrite prior facts.
- **Forbidden data:** raw phone/email, raw consent document, notes, provider
  payloads or secrets; use safe source hash/reference.

### 10.4 `MaintenanceRun`

- **Why needed:** destructive jobs currently have configuration and delete
  calls but no durable policy-bound envelope, limits, lease or restart owner.
- **Families:** A30.
- **Why existing schema is insufficient:** ActionExecution is tenant-required
  and cannot honestly represent automatic platform-scope cleanup;
  ReconciliationRun is provider-read specific and not a destructive claim.
- **Mutability:** immutable identity/policy/caps; monotonic run state, lease,
  cursor and aggregate counters.
- **Canonical owner:** AC6 maintenance coordinator.
- **ActionExecution binding:** optional only for explicit tenant-scoped human
  request; absent for scheduled platform protocol.
- **Tenant/concurrency:** checked tenant/platform scope; deterministic run
  identity, one live owner/lease, bounded batch and restart/resume.
- **Forbidden data:** deleted PII, raw row contents, secrets/tokens, broad SQL
  fragments or unbounded target lists.

### 10.5 `MaintenanceItemClaim`

- **Why needed:** proves each eligible item is claimed and terminalized at
  most once within a durable maintenance run.
- **Families:** A30.
- **Why existing schema is insufficient:** deleteMany counts do not identify
  restart-safe per-item ownership or distinguish attempted/succeeded/failed.
- **Mutability:** immutable identity; monotonic claim-to-terminal outcome.
- **Canonical owner:** AC6 maintenance coordinator under its parent run.
- **ActionExecution binding:** indirect through MaintenanceRun when applicable;
  no fabricated binding for automatic platform runs.
- **Tenant/concurrency:** inherits checked run scope; unique run/item-kind/
  non-PII item hash; one terminal outcome.
- **Forbidden data:** raw subject identifiers, deleted content, phone/email,
  credentials and raw failure payloads.

### 10.6 Client-owned `CustomerProfile` extension

- **Why needed:** represents an exact canonical business Client independently
  of whether that person has a Maya account.
- **Families:** A18.
- **Why existing schema is insufficient:** required `userId`/Membership makes
  guest Clients impossible and preserves the account/customer conflation
  already removed from Package 4 value ownership.
- **Mutability:** current projection is mutable; ownership identity becomes
  immutable after exact Client binding. Notes remain encrypted.
- **Canonical owner:** Client profile service; governed human changes through
  Action Engine, accepted provider facts through AC4/AC5 only for fields whose
  authority is explicitly assigned.
- **ActionExecution binding:** through ActionTargetMutation for commands, not a
  “last writer” field on the profile.
- **Tenant/concurrency:** tenant-qualified Client FK and one profile per
  tenant/Client; expected-generation mutation lock; historical User-only rows
  remain compatible without fabricated linking.
- **Forbidden data:** raw CRM payloads, bearer/auth secrets and unencrypted
  notes. Phone/email cannot be used as canonical identity.

## 11. Foundation stability verdict

The proposed foundation is **not stable under every still-unapproved option**:

- D2-B/C changes CustomerProfile/ClientConsentFact ownership or replaces the
  extension with another model;
- D3-B/C adds a surviving platform-scope tenant tombstone/provisioning fact;
- D5-B adds effective-dated internal-calendar version models;
- D6-B adds an explicit attribution revision model;
- D7-B adds immutable tenant retention-policy versions.

Under the coherent recommended package `D1-A, D2-A, D3-A, D4-A, D5-A,
D6-A, D7-A`, the exact minimum models/fields from checkpoint `22728897` remain
unchanged. That package must be approved before the full common foundation is
implemented as one schema cycle.

`COMMON FOUNDATION STABLE UNDER ALL REQUIRED DECISIONS: NO`

`COMMON FOUNDATION APPROVAL READY: NO — approve D2, D3, D5, D6 and D7 (recommended A package) first, or explicitly authorize a Wave-1-only subset`

`MINIMUM NEW MODELS/FIELDS UNCHANGED: YES UNDER RECOMMENDED D1-A…D7-A; NOT YET UNCONDITIONAL`

## 12. Existing implementation waves and blockers

The accepted six-wave design is unchanged.

```text
WAVE 1: A22, A23
BLOCKED BY BUSINESS DECISION: NONE
BLOCKED BY COMMON FOUNDATION: YES
CAN START IMMEDIATELY AFTER FOUNDATION: YES

WAVE 2: A16, A25, A26
BLOCKED BY BUSINESS DECISION: D3
BLOCKED BY COMMON FOUNDATION: YES
CAN START IMMEDIATELY AFTER FOUNDATION: NO

WAVE 3: A15, A17, A18
BLOCKED BY BUSINESS DECISION: D1, D2
BLOCKED BY COMMON FOUNDATION: YES
CAN START IMMEDIATELY AFTER FOUNDATION: NO

WAVE 4: reduced A27, A28
BLOCKED BY BUSINESS DECISION: D4, D5
BLOCKED BY COMMON FOUNDATION: YES
CAN START IMMEDIATELY AFTER FOUNDATION: NO

WAVE 5: A29, A31
BLOCKED BY BUSINESS DECISION: D6
BLOCKED BY COMMON FOUNDATION: YES for governed correction commands; automatic fact/reconciliation paths reuse existing foundation
CAN START IMMEDIATELY AFTER FOUNDATION: NO

WAVE 6: A30
BLOCKED BY BUSINESS DECISION: D7
BLOCKED BY COMMON FOUNDATION: YES
CAN START IMMEDIATELY AFTER FOUNDATION: NO
```

## 13. Final verdict

`PACKAGE 5 BUSINESS DECISION CLOSURE: INCOMPLETE — seven recommended choices await approval`

`BUSINESS DECISIONS TOTAL: 7`

`SCHEMA-BLOCKING DECISIONS: 5`

`DEFERABLE WAVE-SPECIFIC DECISIONS: 5`

`COMMON FOUNDATION STABLE: NO`

`COMMON FOUNDATION APPROVAL READY: NO`

`MINIMUM NEW MODELS/FIELDS UNCHANGED: YES IF RECOMMENDED D1-A…D7-A ARE APPROVED; OTHERWISE NO`

`FIRST IMPLEMENTATION WAVE READY AFTER FOUNDATION: YES`

`PACKAGE 5 CAN CONTINUE IN LARGE CYCLES: YES`

`PRODUCTION MUTATIONS: 0`

`CHAPTER 7 STARTED: NO`

## 14. Process hygiene

No test server, watcher, browser, Playwright/Chrome process, temporary
PostgreSQL cluster or background worker was started for this Decision Brief.

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0`

`TEMP DATABASES REMAINING: 0`

STOP. Schema, migrations, runtime, Shadow and Chapter 7 were not started.
