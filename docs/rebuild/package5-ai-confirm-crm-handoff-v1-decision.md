# Package 5 — AI confirmation CRM handoff V1 decision

Status: **PROPOSED — BUSINESS HANDOFF DECISION REQUIRED**

This concerns the already identified AI confirmation route, not a new family or
wave. It accompanies the minimal confirmation receipt schema proposal. The
receipt fixes approved intent; it does not authenticate a tenant CRM connection.

## Exact unresolved behavior

Pre-tenant CRM preview verifies a transient provider credential, stores a safe
blueprint and hashes of provider/company/staff identities, and discards the
credential. On confirmation a new tenant has no corresponding real integration.
The legacy code instead creates a mock integration and immediately creates
staff identities/access/accounts using the mock provider namespace.

A16 `configure_crm_staff_access` / `claim_crm_team_owner` require existing exact
access rows. The approved AC5 projection obtains them only through the A17
verified tenant integration/import boundary. Neither caller-provided staff
fields nor the pre-tenant preview's hashes can replace that boundary.

## Recommended decision: resume after the existing canonical CRM connection

1. Keep the preview token transient. No new pre-tenant credential storage,
   hidden mock integration or authority inferred from matching external ids.
2. Freeze the approved draft/owner/team plan under the proposed receipt and
   create the tenant/owner atomically through TrialActivation.
3. Return durable incomplete onboarding progress requiring CRM connection;
   do not declare the whole confirmation successful while required team
   children are blocked. The existing authenticated owner can obtain/recover
   a normal session and use the existing canonical connection surface.
4. That surface performs A17 credential install, verified activation and
   bounded import confirmation. Its existing AC5 projection creates exact
   tenant/provider-qualified staff/access records. Do not turn the AI route
   into a projection writer.
5. Resume the **same confirmation identity** after verifying the actual tenant
   integration's provider/company against the approved preview and resolving
   every selected staff identity from its canonical projection. No first-row
   selection, display-name/phone inference or fallback to another provider.
6. Initiate the existing A16 owner claim and per-access role/login commands
   under the exact bootstrap owner's current authority. Preserve their
   execution outcomes and deterministic child identities. The owner bootstrap
   and each separate child retain their own accepted contracts.
7. Missing/replaced staff or changed material fails closed. Do not silently
   change the frozen plan or start another activation. If user intent changes
   after partial completion, use existing explicit authenticated configuration
   commands; automatic re-planning of a claimed confirmation is outside V1.
8. Preserve completed tenant/activation/children on failure. CRM not yet linked
   is a recoverable prerequisite, not grounds for suspension by a fabricated
   platform actor, tenant deletion, or resetting the activation claim.

This changes **when team setup completes**: it waits for the actual canonical
tenant integration. That business timing decision is why it is proposed for
approval rather than silently implemented as a refactor. It reuses A16/A17/A26
owners without changing their contracts or increasing the 13-family inventory.

## Production internal-calendar boundary

Keep the current production CRM-only AI onboarding policy. The internal path
requires `NODE_ENV=test` plus its legacy smoke flag; it is not a live product
capability to enable during remediation. Remove direct helper dependencies from
production orchestration and keep any needed fixture construction strictly in
test code. Existing internal calendar commands outside AI onboarding remain
untouched.

Do not change Wave 4 `create_internal_provider` from a guest provider creator
into an existing-owner binding command. Do not misuse Wave 2
`create_internal_provider_user`, which creates a new User, to duplicate the
bootstrap owner. If internal AI onboarding is later required as a product flow,
an explicit existing-owner/provider binding contract is required before enabling
it. No such authority or new action is proposed in this V1.

## Alternative, not part of the recommendation

Keeping immediate CRM team completion inside the first confirm request would
require an approved credential handoff from preview to the new tenant's
canonical A17 integration, including authority, encrypted storage if retained,
expiry, replay and provider/company binding. No such handoff is defined by the
current draft schema or DTO. This assessment does not choose a credential TTL,
persist the preview secret, or create a new credential model.

## Proof boundary

After the decision and receipt schema are approved: wrong provider/company,
mock-provider substitution, missing/changed staff, duplicate owner claim,
changed team roles under old confirmation identity, concurrent/restarted
resume, auth ownership mismatch and successful-child preservation must all be
covered. Real production CRM, trial and consent mutations for proof stay zero.

```text
CRM HANDOFF V1: PROPOSED — WAIT FOR CANONICAL TENANT CRM CONNECTION
PREVIEW ALONE AS CRM ACCESS AUTHORITY: NO
MOCK PROVIDER SUBSTITUTION: FORBIDDEN
NEW PRE-TENANT CREDENTIAL STORAGE PROPOSED: NO
CANONICAL CRM IMPORT OWNER: EXISTING A17 FLOW / APPROVED AC5 PROJECTION
CANONICAL TEAM ACCESS OWNER: EXISTING A16 COMMANDS
PRODUCTION AI INTERNAL CALENDAR ENABLED BY THIS CYCLE: NO
RUNTIME IMPLEMENTATION IN THIS CYCLE: NO
```
