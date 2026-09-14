# CYCLE 06 — PACKAGE 5 WAVE 2 A16/A25/A26 RUNTIME CONTRACT GATE

Status: **PASS — exact authority contracts fixed; common schema sufficient**

Date: `2026-09-03`

## Scope derived from the approved plan

Wave 2 is exactly `A16, A25, A26`. The production surfaces resolve to
thirteen governed business actions:

| Family | Canonical action class | Authority / target |
|---|---|---|
| A16 | `configure_crm_staff_access` | owner/admin; exact `CrmStaffAccess` |
| A16 | `claim_crm_team_owner` | existing owner; exact unclaimed owner access |
| A25 | `revoke_other_auth_session` | authenticated subject; exact other session |
| A25 | `revoke_all_auth_sessions` | authenticated subject; exact subject/session generation |
| A25 | `link_social_auth_identity` | authenticated subject plus verified provider assertion |
| A26 | `update_tenant_configuration` | tenant/platform admin; one allowlisted tenant target |
| A26 | `update_tenant_branding` | tenant/platform admin; one branding target |
| A26 | `upload_tenant_logo` | tenant/platform admin; one content-addressed object target |
| A26 | `create_tenant_user` | tenant/platform authority; one exact user/membership |
| A26 | `create_internal_provider_user` | tenant authority; one exact provider/user binding |
| A26 | `suspend_tenant` | platform authority; one tenant lifecycle target |
| A26 | `reactivate_tenant` | platform authority; one suspended tenant with current entitlement evidence |
| A26 | `create_tenant_branch` | tenant/platform authority; one exact branch |

This count is derived from the approved Wave 2 plan and current services, not
from the original broad family labels.

## Exact protocol and projection boundaries

The following are deliberately not fabricated as Wave 2 business actions:

- authentication challenge, token/session issue and rotation, refresh and
  current-session logout remain the cryptographic AC3 protocol;
- the pre-tenant public bootstrap remains the one-time `TrialActivation`
  protocol because an `ActionExecution` cannot honestly be tenant-qualified
  before the tenant exists;
- exact CRM-derived staff-access synchronization remains an AC5 projection.

Explicit revoke-other, revoke-all and social identity link/reassignment are
governed actions. There is no broad `auth/*`, `onboarding/*` or `crm/*`
exemption.

## Current production owners and bypass surface

Before the future Wave 2 cutover, direct production ownership remains in:

- `UsersService` for CRM access configuration and owner claim;
- `AuthSessionService` and `SocialAuthService` for explicit security commands;
- `AdminService`, `BrandingService` and `BranchesService` for tenant,
  branding, logo, user, provider-user, lifecycle and branch mutations.

`CrmService.reconcileCrmTeamAccess` is the exact projection owner, and
`TrialActivation` is the exact pre-tenant bootstrap claim. The Wave 2 ratchet
pins these named surfaces instead of excluding their directories. No
production owner is switched by this Gate or safe local cycle.

## Canonical identity, authority and concurrency contract

Every post-tenant governed action resolves tenant, actor, current target state,
allowed fields, expected target generation, policy snapshot and desired-state
hash on the server. Action evidence contains hashes and internal references,
never email, phone, password material, OAuth tokens, provider subject ids or
file bytes.

The logical identity is the canonical capability plus tenant, exact target,
server-derived generation and bounded source occurrence. Local execution takes
an advisory target lock and row lock, revalidates actor and target facts, then
commits the domain change, `ActionTargetMutation`, attempt and successful
execution in one serializable PostgreSQL transaction. Retry and restart resolve
the same execution; a concurrent duplicate has one winner; a stale generation
fails closed.

Tenant members are revalidated through active membership and role. Platform
commands use the trusted bridge only after the planner and executor both
revalidate an active platform role; the durable input stores only a scoped
actor-identity hash. Reactivation is the sole exact exception to normal active
tenant access: only the two registered reactivation capabilities may operate
on a `suspended` tenant through the trusted bridge, and entitlement evidence is
still required. Cancelled tenants and every other capability remain denied.

One action has one target. Bulk mutation is forbidden. Owner claim, role
assignment, provider-user binding and tenant lifecycle decisions are governed
by server-derived owner/platform policy; caller-provided authority is ignored.
Payment-derived tenant entitlement fields remain exclusively Package 4-owned
and are absent from the A26 allowlist. D3-A remains authoritative: Package 5
tenant hard delete is forbidden.

## Provider and outcome boundary

Twelve actions are pure PostgreSQL mutations. Commit/rollback is their complete
outcome; they never invent `UNKNOWN`.

`upload_tenant_logo` is the sole AC2 action. The object request key is derived
from tenant, target and content hash. A timeout after a possible object-store
write becomes `UNKNOWN`; blind redispatch is forbidden. Reconciliation performs
an exact head lookup by request identity and content hash. A proven object is
applied idempotently under the same branding target lock, and restart/retry
repairs the execution-to-target binding without uploading a second object.
`PROVEN_NOT_EXECUTED` is the only state that can authorize a safe retry.

## Trial bootstrap

The activation-token hash is the deterministic pre-tenant claim. A single
serializable transaction locks it, creates the tenant, initial branch, owner,
owner membership and branding row, and records the completed activation.
Rollback creates none; retry returns the same tenant. No fake pre-tenant
`ActionExecution` and no tenant hard delete are introduced.

## Schema verdict

Existing `User`, `Membership`, `Staff`, `CrmStaffAccess`, `AuthSession`,
`AuthIdentity`, `Tenant`, `Branch`, `BrandingSettings`, `InternalProvider` and
`TrialActivation` facts represent the domain state. The approved common
`ActionTargetMutation` model provides tenant-qualified execution binding,
immutable before/after hashes and contiguous target generations. No Wave 2
family-specific schema is required.

`PACKAGE 5 WAVE 2 RUNTIME CONTRACT GATE: PASS`

`WAVE 2 FAMILIES: A16, A25, A26`

`WAVE 2 EXACT ACTION CLASSES: 13`

`AUTHORITY CLASSES: AC1 + AC2; exact AC3/AC5 boundaries preserved`

`CANONICAL SCHEMA SUFFICIENT: YES`

`ADDITIONAL SCHEMA REQUIRED: NO`

`UNKNOWN/RECONCILIATION: REQUIRED ONLY FOR LOGO OBJECT WRITE; COMPLETE`

`PRODUCTION RUNTIME CUTOVER: NO`

`PRODUCTION BUSINESS/PROVIDER MUTATIONS: 0`

`CHAPTER 7 STARTED: NO`
