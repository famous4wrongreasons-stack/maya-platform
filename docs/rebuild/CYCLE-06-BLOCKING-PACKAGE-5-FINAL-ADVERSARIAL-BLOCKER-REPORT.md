# PACKAGE 5 — FINAL ADVERSARIAL VERIFICATION: BLOCKER REPORT

Status: **FAIL — production-reachable alternative mutation paths in A18 and A26**

Date: 2026-09-04. Accepted starting checkpoint:
`001bef4b7446feb1e198077ab5559c54a8c15f23`; HEAD equalled fetched origin at entry.
Active production release remains
`20260904-c06-p5-wave6-cutover-3b545671`.

This is an independent aggregate verification, not a rerun or reopening of an
individual implementation wave. The accepted six wave checkpoints are retained.
Their completion reports were not treated as proof of production-wide exclusion
of alternate writers. Direct inspection found three confirmed paths across two
families. The user's STOP rule was applied before schema/regression stages.
No application, deployment, schema, policy or data correction was made.

Machine-readable evidence:
`evidence/package5-final-001bef4b-production-inventory.json`.
It includes exact deployed routes, safe process flags, hashes, selected method
bodies and all 40 observed governed registrations plus the six AC6 classes.
No business/customer data or secret values are included.

## 1. Inventory of all 13 narrowed families

The deployed ActionCapabilityRegistry was loaded read-only without creating an
application or invoking an executor. It contains the expected 6 / 13 / 8 / 12 /
1 Wave 1–5 registrations. The deployed V1 policy contains all six A30 classes.
Current source call paths were inspected alongside those deployed registrations.
The table identifies canonical components; their existence is **not** a verdict
that no other writer is reachable. The aggregate no-bypass verdict is FAIL.

| Family | Canonical component / classified boundary | Observed governed class count | Aggregate finding |
| --- | --- | --- | --- |
| A15 | Canonical Wave 3 cutover → ingress/engine → Package5Wave3ExecutableService; staff-day provider gateway | 1 | Registered; complete cross-path certification stopped |
| A16 | Wave 2 ingress/engine executor; exact CRM access reducer remains AC5 | 2 | Registered; complete cross-path certification stopped |
| A17 | Wave 3 ingress/engine executor; exact pre-tenant claim and provider observation/reducers remain AC3/AC4/AC5 | 4 | Registered; complete cross-path certification stopped |
| A18 | Wave 3 ingress/engine executor for profile/consent/notes; ClientIdentityService and CRM source projections | 3 | **FAIL: live Python consent writer bypasses canonical commands** |
| A22 | Wave 1 ingress/engine → Package5Wave1ExecutableService for settings/preferences | 3 | Registered; complete cross-path certification stopped |
| A23 | Wave 1 ingress/engine → OperationalWorkItem; Inbox remains a projection, with exact UX/transport AC3 state | 3 | Registered; complete cross-path certification stopped |
| A25 | Wave 2 ingress/engine for explicit security commands; exact auth-session/token AC3 protocol | 3 | Registered; complete cross-path certification stopped |
| A26 | Wave 2 ingress/engine for post-tenant commands; TrialActivationBootstrapService intended for atomic AC3 creation | 8 | **FAIL: deployed trial and admin creation use alternate owners; trial failure hard-deletes tenant** |
| reduced A27 | Wave 4 ingress/engine for inventory; Package5Wave4ReviewFactService for AC4 review acceptance | 3 | Registered; complete cross-path certification stopped |
| A28 | Wave 4 ingress/engine for calendar configuration and avatar storage | 9 | Registered; complete cross-path certification stopped |
| A29 | Wave 5 ingress/engine correction executor; Package5Wave5RecoveryFactPlaneService for AC4/AC5 observations | 1 | Registered; complete cross-path certification stopped |
| A30 | Versioned Policy V1 → Package5Wave6MaintenanceService → MaintenanceRun/ItemClaim → bounded executor | 6 AC6 classes | Contract/owner retained; no Action Engine insertion; full aggregate re-verification stopped |
| A31 | EventStoreService, AppointmentChangeService, AppointmentReconciliationService and Wave 5 recovery fact plane | AC4/AC5; not another command registration | Inventoried; complete cross-path certification stopped |

Inventory set is exactly A15, A16, A17, A18, A22, A23, A25, A26, reduced A27,
A28, A29, A30, A31. Inventory coverage is 13/13. Accepted wave count is 6/6.
Production-wide canonical ownership coverage cannot be certified as 13/13.
No seventh wave is created to account for these aggregate blockers.

## 2. B1 — A18 live PWA consent path owns raw SQL mutations

Observed production chain:

`barbershop-pwa.service (active, PID 1435620)`
→ `/home/botadmin/barbershop-bot/pwa_api.py:35`
→ `webhook_server.start_webhook_server`
→ registered `POST /api/consent/submit`
→ `consent_submit_handler`
→ `database.save_consent` / `database.set_marketing_consent`
→ direct SQL.

The deployed route registration is at webhook_server.py line 13839; its handler
is at lines 7155–7197. The authenticated handler resolves a legacy client from
chat_id, optionally inserts consent, and unconditionally writes the requested
marketing decision. Authentication does not make the handler a canonical
execution owner.

Deployed database.py contains:

- `save_consent`, lines 1134–1142: direct `INSERT INTO consents`.
- `set_marketing_consent`, lines 1145–1163: direct `UPDATE clients`, replacing
  marketing_consent_at / marketing_consent_revoked_at.

This is an explicit human consent command under A18/AC1, not an OAuth token
transition, provider observation or read-only projection. The path does not
call Canonical Action Ingress, Action Engine, the Wave 3 consent executor or
ClientConsentFact. It uses legacy client_id SQL without the approved canonical
Client/tenant/execution binding. Marketing grant/revoke replaces current
timestamps instead of appending the canonical decision fact. Thus a global
D2-A / immutable consent audit / sole canonical owner verdict is unavailable.

Independent deployed source hashes:

- webhook_server.py: `b5dd66307b0dce5f6fdba7be24f1833224f48a521f9c23e0606fd8ca16771cea`.
- database.py: `3c1ddfb8948e2cbf582ee91b7f78ea1dfa00fa557f1ad2a5c4ae4a763e2491c5`.
- pwa_api.py: `3062eddd6091eea995ef7f9c938f54b181a7bebad8c2cbf32deaae92e503a74d`.

The local webhook_server.py is independently dirty, so its line numbers and
contents were not substituted for the deployed evidence. No consent endpoint
was called, no Python business module imported, and no consent record changed.

## 3. B2 — A26 public trial creation bypasses atomic bootstrap and hard-deletes on failure

Observed production chain:

`POST /api/onboarding/trial` (public route)
→ `OnboardingService.createTrialSignup`
→ separately committed `TenantsService.createTenant`
→ subsequent branding / owner / session operations
→ catch after a later failure
→ `TenantsService.deleteFailedTrialTenant`
→ `prisma.tenant.deleteMany`.

The running maya-saas process has `SELF_SERVE_TRIAL_SIGNUP=true`; this path is
not excluded by the production feature flag. The controller and module are
loaded by AppModule. Read-only metadata confirms method POST and public=true.

`createTrialSignup` in deployed onboarding/onboarding.service.js starts at line
91. Its catch calls deleteFailedTrialTenant when createdTenantId has already
been assigned. For example, a later session-issuance failure enters this catch.
The deployed tenants/tenants.service.js method at line 373 issues a physical
delete with `{ id, status: trial, currentPeriodStart: null }`. It is not an
uncommitted transaction rollback or a canonical durable lifecycle transition.

D3-A explicitly requires one atomic TrialActivation/tenant/owner transaction,
rollback creating nothing, retry resolving the same tenant, and no Package 5
tenant hard delete. The six-class A30 allowlist does not include tenant deletion.

TrialActivationBootstrapService exists and is provided/exported by the Wave 2
module, but the scan of deployed production source finds references only in its
own implementation and module registration. The active onboarding service does
not call it. The committed proof instantiates this service directly; that proves
its algorithm, not that every production bootstrap entrypoint uses it.

Deployed hashes:

- onboarding/onboarding.service.js: `5a1c44f5b1ecb231841f8ed1021aa398a4c136e0b189f4491077fdbe370dcbe3`.
- tenants/tenants.service.js: `55d041d88d07bb7c72d2d52ee55be035850a90ea9b2bd858b9acfcde10d654b2`.

No signup was submitted and no failure or physical deletion was induced.

## 4. B3 — A26 administrative tenant creation has another owner

Deployed metadata confirms `POST /api/admin/tenants` restricted to
platform_owner. It calls AdminService.createTenant, which directly calls
TenantsService.createTenant and then writes AuditLog. It does not use
TrialActivationBootstrapService or a canonical execution/claim foundation.
The nested tenant/branding/branch transaction is a database transaction, not
the approved one-time pre-tenant activation binding.

AdminService.createTenant starts at deployed admin/admin.service.js line 92;
file hash `37fc1f5afdcd6d563db8fb673a63978f0e42a7e05921f0b01efbbcc6f0a5ee61`.
The approved D3-A selected TrialActivation bootstrap. The alternative direct
platform provisioning model in the decision brief was not selected. A platform
role check and AuditLog do not by themselves establish that approved model.
No new provisioning architecture or synthetic tenant-qualified ActionExecution
is introduced to repair this during a verification-only cycle.

## 5. Why the existing narrow checks did not establish aggregate completeness

Source inspection of the existing ratchets shows two concrete coverage gaps:

- Wave 3 checks the Nest CustomersService/CRM/AI initiators and canonical
  consent implementation, but does not inspect the active Python consent route.
- Wave 2 checks selected update/revoke/branch methods and the bootstrap helper
  itself. It does not assert that OnboardingService uses that helper, scan its
  failure cleanup, or cover AdminService.createTenant.

No ratchet was weakened, extended, run as a substitute for this audit, or edited
to hide a writer. The deployed proof scripts' isolation and other remaining
cross-family surfaces have not received a complete final verdict after STOP.
Unexamined exemptions are not assumed safe because a filename says test/proof.

## 6. Verification limits and required next boundary

Completed in this cycle: fetched HEAD/origin check; full family/registration
inventory; current source and deployed code inspection; live process/feature
flag/route verification; health/readiness read-only checks. Active release was
unchanged, health ok and readiness ready at `2026-09-04T05:28:58Z`.

Not run after the blocking inventory findings: clean migration replay, Prisma
validate, fresh production migration/drift gate, aggregate ratchets, targeted
adversarial suites, full suite, both typechecks, ESLint, build/preflight and the
remaining final production baseline checks. Their previous PASS reports are
not relabelled as a PASS for this independent final gate.

D2-A has the consent ownership/audit blocker; D3-A has confirmed bootstrap and
hard-delete blockers. D1-A, D4-A, D5-A, D6-A, D7-A, cross-wave concurrency,
UNKNOWN/reconciliation, Inbox projection and Packages 1–4 baselines are not
given a fresh aggregate PASS after this early STOP. A30's approved AC6 owner,
Policy V1 and runtime remain unchanged; no A30 contract regression is asserted.

Before resuming the aggregate gate, a separately authorized remediation must
close these exact production entrypoints under the already approved contracts,
including routing/binding regression checks. If administrative provisioning
cannot fit the approved TrialActivation contract, stop for an explicit proposal
rather than inventing a new owner. Then rerun the independent final verification
and its sequential remaining gates. This is not Wave 7 and does not reopen the
six waves individually. Chapter 6 acceptance is still a later separate cycle.

```text
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL
PACKAGE 5 COMPLETE: NO
PACKAGE 5 ACCEPTED WAVE CHECKPOINTS: 6/6 — NOT REOPENED
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13
PACKAGE 5 FINAL CANONICAL COVERAGE: NOT PROVEN
FAMILIES WITH CONFIRMED AGGREGATE BLOCKERS: A18, A26
CONFIRMED PRODUCTION-REACHABLE BLOCKER PATHS: 3
PRODUCTION DIRECT BUSINESS MUTATION BYPASSES: PRESENT
PRODUCTION DIRECT DELETION BYPASSES: PRESENT — A26 TENANT HARD DELETE
A30 EXECUTION OWNER: AC6 MAINTENANCE COORDINATOR — UNCHANGED
D1-A…D7-A AGGREGATE VERDICT: FAIL — D2-A/D3-A BLOCKERS
FULL REGRESSION GATE: NOT RUN — STOP AFTER BLOCKING INVENTORY
REAL PRODUCTION MUTATIONS FOR FINAL PROOF: 0
WAVE 7 CREATED: NO
CHAPTER 6 COMPLETE: NOT DECLARED
CHAPTER 7 STARTED: NO
PRE-EXISTING LOCAL TEMP/TEST DATABASES: 17
OWNED BY THIS CYCLE: 0
OWNED TEMP PROCESSES STILL RUNNING: 0
BACKGROUND WATCHERS LEFT: 0
OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0
OWNED TEMP DATABASES REMAINING: 0
```

Only report/evidence/remainder files are committed. Existing unrelated changes
are preserved. All read-only command sessions completed; no temporary database,
watcher, browser or application process was created. The historical 17 DBs were
counted read-only and not removed. Reports → commit/push → HEAD=origin → STOP.
