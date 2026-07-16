# Plans and Features

## Principle

Plans are data. A centralized Feature Registry defines capabilities; PlanEntitlement and TenantEntitlement determine effective access. Product code checks a feature key, never a plan name.

## Initial product plans

| Plan | Audience | Representative features |
|---|---|---|
| solo | Independent specialist without CRM | calendar.internal, customers.core, bookings.core, expenses.core, analytics.solo, booking.public |
| business | Business using an external CRM | calendar.external, crm.integration, booking.customer_app, branding.custom, customer.portal, notifications.core |
| business_plus | Expanded client/staff product | all business features plus commerce, referrals, team chat, employee analytics and AI profiles |

Legacy `start`, `pro`, `max` names remain aliases during migration; their JSON flags are converted into effective feature keys.

## Registry

Every feature entry has stable key, description, module owner, lifecycle state,
implementation maturity, runtime availability and optional dependencies.

Commercial entitlement and implementation readiness are different facts:

- entitlement answers whether a tenant purchased or received access to a key;
- `implementationStatus=platform_ready` means the universal platform code is
  implemented;
- `current_runtime_only` means the capability still lives only in the current
  single-business MAYA runtime;
- `partial` means only a documented subset is implemented;
- `planned` means the key is reserved and must not be advertised as available.

The public registry also returns `availableIn` and optional `limitations`.
Frontend navigation, plan pages and AI tool policy must not infer delivery from
the mere presence of a key. Examples:

- calendar.internal
- calendar.external
- booking.public
- booking.customer_app
- analytics.solo
- analytics.employee
- analytics.location
- analytics.business
- crm.integration
- commerce.store
- commerce.certificates
- commerce.memberships
- commerce.redemption
- referrals
- team.chat
- ai.owner
- ai.admin
- ai.consultant
- telegram.owner
- telegram.admin
- telegram.consultant
- branding.custom
- domain.custom

## Effective entitlement

Resolution order is explicit tenant deny, explicit tenant allow, plan entitlement, feature default. Dependencies are checked after resolution. Overrides have optional validity window and audit actor/reason.

## Enforcement points

- HTTP guards/application services.
- Navigation and UI rendering.
- Background jobs.
- AI tool policy.
- Integration activation and sync.

Frontend flags optimize UX but do not grant access.

Frontend visibility also requires a compatible implementation status. A tenant
may retain a planned or current-runtime-only entitlement during migration, but
the universal client must not render it as a working platform module.

## Adding a plan

1. Create/upsert the plan.
2. Attach existing feature keys through PlanEntitlement.
3. Configure quotas separately from booleans.
4. Add plan-resolution tests and upgrade/downgrade behavior.
5. No controller or component should add `if plan === ...`.

## Adding a feature

1. Register a stable namespaced key.
2. Define owner, dependencies and lifecycle.
3. Add backend enforcement and tests.
4. Attach it to plans/tenant overrides.
5. Add UI/navigation handling only after backend protection exists.
