# CYCLE 06 — PACKAGE 5 FINAL AI CONFIRM CONTRACT ASSESSMENT

Status: **STOP — additional durable confirmation schema and CRM handoff decision required**

Date: 2026-09-04. Accepted source: `d9799b2a8b1505870b6ba63c54c6050b25ea82f1`.

The requested reconstruction is complete. Runtime remediation, deployment and
the complete final-gate rerun have not resumed. The user's explicit instruction
“If a new schema/business blocker is found → STOP” applies to the gaps below.
This is final remediation of B4, not a new implementation wave. The six accepted
wave checkpoints and canonical action contracts are unchanged.

## 1. Exact route, branches and owners

`OnboardingController.confirmAiDraft` exposes public
`POST /api/onboarding/ai/drafts/:draftId/confirm`. The route delegates to
`AiOnboardingService.confirmDraft`; its current authority is possession of the
hashed draft secret and, for activation-bound drafts, the matching activation
token. There is no tenant membership before the bootstrap. The supplied owner
email is not an authenticated post-tenant actor identity.

| Existing operation | Actual ownership / canonical mapping | Assessment |
| --- | --- | --- |
| Validate draft secret, completeness, overrides, claim draft and aggregate result | Onboarding protocol/orchestration | Must bind the approved revision and authority before bootstrap or children. |
| `createTrialSignup` → legacy tenant/branch/owner creation | A26 AC3 `TrialActivationBootstrapService.activate` | Existing canonical transaction creates tenant, first owner, membership, branch and initial branding; no pre-tenant ActionExecution. HTTP service still uses the legacy implementation. |
| Post-bootstrap tenant configuration and branding setup | A26 `update_tenant_configuration`, `update_tenant_branding` | Separate, deterministic child commands. Payment-derived entitlement fields stay Package 4-owned. |
| AI CRM branch `brandingSettings.update({appName, logoUrl})` | A26 `update_tenant_branding` | These exact fields are currently allowlisted by Wave 2. This is an HTTPS URL assignment, not an object upload. No branding mutation here belongs to A28. |
| Internal owner provider title | A28 `update_internal_provider` | Requires an exact existing provider identity; `setup.providers[0]` is not an authority binding. |
| Additional internal providers | A28 `create_internal_provider` | One child per immutable plan slot, deterministic source reference. The existing executor creates guest providers with `userId=null`, default weekday rules and service associations. |
| Internal services | A28 `create_internal_service` | One child per approved service slot; preserve its provider associations within the existing executor. |
| Weekly availability | A28 `replace_weekly_availability` | One child per exact provider; preserve prospective-only configuration. |
| CRM owner/staff access and optional login provisioning | A16 `claim_crm_team_owner`, `configure_crm_staff_access`; A26 user semantics within the approved executor | These commands require existing, tenant-qualified CRM access records. Their creation must come from the approved CRM projection, not the AI route. |
| Establish a real tenant CRM integration and its projection | A17 credential install → activation → `confirm_crm_import` → exact AC5 projection | Current pre-tenant preview is not this flow. See B4-C2. |
| Response/session issue | AC3 authentication protocol | Must use the exact durable bootstrap owner; do not choose the actor again from retry payload email. |
| Catch block `releaseCompletedTenant` + `tenant.delete` | Forbidden under D3-A | Remove from remediation; preserve activation/tenant and confirmed child evidence on failure. |

The four A28 classes referenced by internal calendar provisioning are exactly
`update_internal_provider`, `create_internal_provider`,
`create_internal_service`, `replace_weekly_availability`. No archive, time-off
or avatar-upload command is called by this route. No new combined action is
needed for these four existing operations.

### Reachability correction

The earlier B4 report correctly found a deployed route and direct-write call
sites, but source-call presence alone did not establish the internal-calendar
branch as reachable under the live release policy. The fresh read-only probe
shows `NODE_ENV != test`. `legacyHttpSmokeEnabled` requires both test mode and
its explicit test flag. The ordinary `getMissingFields` rejects anything other
than an imported external CRM blueprint, and confirmation overrides cannot turn
an imported blueprint into an internal-calendar blueprint.

Therefore the four internal A28 operations are a **dormant/test-only branch in
this production configuration**, not four demonstrated live mutation outcomes.
They remain in the requested architectural cleanup inventory. The external CRM
team writer, direct A26 branding and physical delete compensation are present
on the active branch. No live request was submitted to demonstrate them.

The internal first-owner provider is another mapping constraint: legacy
`bootstrapEnsureProviderForUser` binds an existing owner User and also writes
availability/associations. Wave 4 `create_internal_provider` deliberately creates
an unbound provider; Wave 2 `create_internal_provider_user` creates a **new** User
for a provider, not a link to the existing bootstrap owner. These are not
interchangeable. Preserve the current production CRM-only boundary; do not
silently widen either approved action to enable internal AI onboarding.

## 2. B4-C1 — durable confirmation receipt is absent

Repository and production catalogs reconcile exactly: **90 models, 91 tables
including `_prisma_migrations`**. `AiOnboardingDraft` has the same 18 scalar
columns in both. There is no revision, confirmation receipt or encrypted
confirmation material. No custom trigger protects `AiOnboardingDraft` or
`TrialActivation` against confirmation-envelope rewrite.

At `ai-onboarding.service.ts:379`, the compare-and-set only checks draft id,
status and expiry. It persists the overridden blueprint, but not owner identity,
team assignments, their role/login intent, a confirmation identity or an
immutable manifest of all future children. Message/import writers perform a
read/validation followed by an unconditional update by id, so an already-started
edit can overwrite the blueprint after the confirmation claim.

Concrete counterexample: two confirmations can have the same draft blueprint
but different requested team roles or owner/login data. Immediately after the
claim and before tenant creation, both leave the same relevant durable draft
state. Following a crash, the database cannot establish which complete command
set was approved. After a successful first child, its ActionExecution preserves
that child, but says nothing about requested children not created yet. Reusing
the retry's payload would invent approval for the missing material.

| Existing foundation | Reuse / limitation |
| --- | --- |
| `AiOnboardingDraft` | Correct aggregate to extend; mutable preview, not an immutable approval receipt today. `updatedAt` and last-message `inputDigest` do not encode the full approved command set. |
| `TrialActivation` | Correct pre-tenant claim and durable tenant outcome. Does not store draft version, approved owner material or child plan. |
| `ActionExecution` / `ActionTargetMutation` | Correct durable ownership and outcomes for each post-tenant child. Tenant is required; no parent pre-tenant approval or not-yet-created child manifest. |
| `AiToolExecution` / `AiBrainSession` | Tenant-bound AI tool/conversation state, not this public pre-tenant protocol. |
| `OperationalWorkItem` / `AgentTask` | Existing task/opportunity contracts; fabricating such records would introduce a parallel authority. |
| `MaintenanceRun` / `MaintenanceItemClaim` | AC6 retention scope; cannot be repurposed for onboarding. |

Putting credentials, approval state or child outcomes into the existing mutable
blueprint JSON would create an undocumented storage contract, not prove that
the existing schema already satisfies the required invariants. Proposed minimal
foundation: **extend `AiOnboardingDraft`, no new execution owner or child table**.
See `package5-ai-confirmation-receipt-schema-v1-proposal.md`.

## 3. B4-C2 — verified preview has no canonical CRM handoff

The pre-tenant import calls `previewCredentials` with a transient token. It saves
provider/company information and staff identity hashes, but not a tenant CRM
integration or a retained credential. Confirmation DTO has no CRM credential.

The subsequent legacy trial path installs a `mock` integration. Then
`UsersService.provisionCrmTeamAccess` reads **that integration's provider**, calls
`ensureStaffForExternal`, creates Staff/StaffProviderLink/CrmStaffAccess records
and can create Users/Memberships. This cannot be preserved as an AC5 projection
of the verified YClients/Altegio tenant integration. Merely moving the same code
under the name of an existing executor would preserve the authority defect.

Existing A16 commands require those access records to exist. Existing A17 import
requires an active, tenant-qualified integration and verifies a fresh bounded
snapshot before its projection. Neither accepts the AI preview's staff hashes
as a substitute for this authority. This dependency adds A16/A17 to the exact
orchestration map; it does not create new families or reopen accepted waves.

An explicit handoff decision is required: preserve credentials as transient and
wait for the existing authenticated A17 connection/import flow, or introduce a
separately approved pre-tenant credential handoff. Recommend the former, using
the frozen confirmation identity and resuming only after exact provider/company
and selected staff validation. See `package5-ai-confirm-crm-handoff-v1-decision.md`.
No credential storage or provider authority is invented in this cycle.

## 4. Ratchet and proof consequences

The current Wave 4 ratchet at
`src/action-engine/package5-wave4-bypass-ratchet.architecture.spec.ts:124`
positively pins the old bootstrap helper calls. This is an obsolete **final
cutover expectation**, not permission for post-tenant direct writes. The later
remediation must replace that specific expectation with canonical delegation
and cover the active CRM/team call graph. Other Wave 2/4 protections and their
accepted proof remain intact. No ratchet was weakened or changed here.

Required later negative cases: direct Prisma/raw SQL or helper-hidden service,
provider, availability, branding, team/login writes; physical tenant deletion;
activation reset; stale/changed approval; forged tenant/draft/actor; retry with a
changed child manifest. Test exclusions must be limited to actual isolated
fixtures, never the production service or its directory.

Required later positive proof: happy path, partial failure, concurrent and
duplicate confirmation, crash before/after bootstrap and between children,
durable successful-child restoration, approved actor recovery and strict
UNKNOWN/reconcile handling. No actual object upload is added just to make an
UNKNOWN test; exercise the orchestrator's existing canonical outcome boundary
with a controlled adapter. Pure PostgreSQL children do not invent UNKNOWN.

These are **future proof obligations**, not results. No new runtime proof,
targeted remediation proof, full regression, build or deployment gate was run
after the contract STOP. The earlier A18 21/21 PostgreSQL and 84/84 targeted
candidate results are accepted evidence for that undeployed candidate only.

## 5. Production and closure

Fresh structural/read-only checks: pending migrations **0**, unresolved
migrations **0**, schema drift **NONE** against the applied challenge artifact
`20260904-a18-client-link-challenge-77c611c7`; health/readiness PASS. Runtime
release remains `20260904-c06-p5-wave6-cutover-3b545671`, PID `1470307`,
`NRestarts=0`. No service restart, migration apply, provider write or business
mutation occurred. No draft/customer/auth record contents were read or logged.

The applied ClientChannelLink and ClientLinkChallenge foundations and TTL V1
600 seconds remain accepted. Their migrations must not be repeated. A18 Python
consent, A26 trial/admin and B4 AI confirm remain open. Four endpoint blockers
remain; A16 team ownership is an additional traced dependency inside B4.

Evidence: `evidence/package5-ai-confirm-contract-assessment.json` contains source
hashes/anchors, live method hashes, reconciled catalogs, migration/readiness
evidence and hygiene. The current remainder also corrects its stale footer,
which had incorrectly said the challenge migration was unapplied and only
three endpoint blockers remained.

```text
AI DRAFT CONFIRM CONTRACT RECONSTRUCTION: COMPLETE
AI DRAFT CONFIRM RUNTIME CONTRACT SUFFICIENT: NO
ADDITIONAL SCHEMA REQUIRED: YES — AiOnboardingDraft confirmation receipt
CRM PREVIEW TO CANONICAL IMPORT HANDOFF DECISION REQUIRED: YES
NEW PARALLEL MUTATION AUTHORITY CREATED: NO
ARCHITECTURAL BYPASS PROTECTION WEAKENED: NO
RUNTIME REMEDIATION DEPLOYED: NO
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL — carried forward; not rerun
PACKAGE 5 COMPLETE: NO
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13
PACKAGE 5 FINAL CANONICAL COVERAGE: NOT PROVEN
CLIENT LINK CHALLENGE DURABLE IN PRODUCTION: YES
CLIENT LINK CHALLENGE TTL: 600 SECONDS
PENDING MIGRATIONS: 0
SCHEMA DRIFT: NONE
FULL REGRESSION GATE: NOT RUN — contract STOP
REAL PRODUCTION MUTATIONS FOR FINAL PROOF: 0
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
PRE-EXISTING LOCAL TEMP/TEST DATABASES: 17
OWNED BY THIS CYCLE: 0
OWNED TEMP PROCESSES STILL RUNNING: 0
BACKGROUND WATCHERS LEFT: 0
OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0
OWNED TEMP DATABASES REMAINING: 0
```

Chapter 6 is not declared complete. STOP after this report, the two concrete
decision documents, remainder update and commit/push. Approval of a proposal is
not presumed from this assessment.
