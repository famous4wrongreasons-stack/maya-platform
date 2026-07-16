# Permissions

## Model

Roles are bundles of granular permissions. Authorization evaluates active membership, resource scope, permission, entitlement and optional ownership constraints. UI visibility is not enforcement.

## Initial roles

Platform roles: `platform_admin` and compatibility `platform_owner`.

Tenant roles: `tenant_owner`, `business_owner`, `administrator`, `manager`, `provider`, `employee`, `accountant`, `customer`, `integration_service` plus compatibility aliases `tenant_admin`, `branch_manager`, `staff`, `client`.

## Permission catalog

| Domain | Permissions |
|---|---|
| customers | customers.read, customers.create, customers.update, customers.delete, customers.merge |
| bookings | bookings.read.own, bookings.read.location, bookings.read.all, bookings.create, bookings.update, bookings.cancel |
| analytics | analytics.read.own, analytics.read.location, analytics.read.business, analytics.read.tenant |
| finance | finance.read, finance.manage |
| workforce | employees.read, employees.manage |
| platform config | branding.manage, integrations.manage, billing.manage, memberships.manage |
| AI | ai.execute.booking, ai.execute.finance, ai.execute.customer_management, ai.execute.analytics |

## Scope evaluation

- `own`: resource owner/client/provider link matches the authenticated subject.
- `location`: membership scope contains the resource location.
- `business`: resource organization is in membership scope.
- `tenant`: resource tenant equals TenantContext tenant.
- `platform`: explicit platform role and audited endpoint only.

## Default role bundles

| Role | Baseline access |
|---|---|
| tenant_owner | tenant config, memberships, all business analytics/finance and operations |
| administrator | location bookings, customers, catalog and communications |
| manager | location operations, employees and analytics; no platform billing secrets |
| provider | own calendar, customers attached to own work and own analytics |
| accountant | finance read/manage under configured scope |
| customer | own profile and own bookings/commerce only |
| integration_service | narrow connector/webhook scopes, no interactive UI |

## Denial behavior

Foreign resource lookup should generally return not found to avoid existence disclosure. Missing feature returns a stable `feature_locked` error; missing permission returns `forbidden`; absent/invalid membership terminates tenant resolution.

## Migration

Phase 1 preserves current role guards and adds membership verification. Granular permission guards are introduced module by module; role equality checks are removed only after equivalent policy tests exist.
