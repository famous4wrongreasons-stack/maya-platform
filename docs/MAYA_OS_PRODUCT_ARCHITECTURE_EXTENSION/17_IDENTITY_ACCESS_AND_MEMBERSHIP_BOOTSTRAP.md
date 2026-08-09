# Chapter 17 — Identity, Access & Membership Bootstrap

<!-- markdownlint-configure-file {"MD013": false} -->

## 17.1 Goal

Turn an authenticated person and a verified CRM connection into safe,
tenant-scoped access for owners, employees and customers without confusing
authentication, CRM records and authorization.

This chapter closes the operational gap between the identity/tenancy laws in
the base specification and the owner, employee and client experiences in this
extension.

## 17.2 Entity boundaries

The following entities are related but never interchangeable:

| Entity | Meaning | Must not imply |
| --- | --- | --- |
| User | Global MAYA authentication identity | Tenant, role or CRM employment |
| AuthIdentity | Verified provider binding for a User | Customer or employee match without evidence |
| Membership | User access to one Tenant | Workforce or customer profile |
| EmployeeProfile | Tenant workforce record | Login account or owner authority |
| ProviderProfile | Bookable service provider | Administrator or owner permission |
| Customer | Tenant-scoped CRM/client relationship | Global MAYA identity |
| CrmIntegration | Tenant-bound provider connection | Identity or ownership of the token submitter |

A YCLIENTS token proves that the candidate credential can access a provider
scope. It does not prove that the person submitting it owns the business, is a
specific employee, or may grant roles.

## 17.3 Trusted tenant entry

Interactive authentication starts with trusted tenant context from one of:

- an existing active Membership;
- a signed native onboarding continuation;
- a signed smart link represented by URL, QR or NFC;
- a verified business domain or subdomain;
- an explicit tenant selection after global authentication when the User has
  more than one Membership.

A tenant slug from an arbitrary request remains discovery input. A social
provider identity alone never selects a tenant.

## 17.4 Owner bootstrap

Owner bootstrap requires all of the following:

1. an authenticated User with a recent or step-up-authenticated session;
2. a server-created onboarding attempt bound to that User;
3. a verified subscription/trial activation or other approved commercial
   entitlement;
4. a CRM credential verified against the selected provider scope;
5. explicit confirmation of the selected branch/business;
6. an idempotency key and an unused bootstrap grant.

The bootstrap transaction:

1. resolves or creates the Tenant and Organization under the onboarding grant;
2. activates the tenant-bound CRM connection without exposing credentials;
3. creates or activates one `tenant_owner` Membership for the authenticated
   User;
4. records the owner grant source, actor, timestamp and selected CRM scope;
5. imports the initial workforce and canonical operational facts;
6. optionally links the owner to an EmployeeProfile only after explicit
   selection or verified evidence;
7. issues a fresh session whose server-side capabilities reflect the committed
   Membership;
8. consumes the bootstrap grant so replay cannot create another owner.

Failure before commit grants no partial owner access. Retrying with the same
idempotency key returns the original result.

## 17.5 Owner who also provides services

An owner-provider is one User with one tenant Membership and two independent
capability dimensions:

- `tenant_owner` authorizes business configuration, team access, integrations,
  finance and tenant-wide analytics;
- `provider` plus an EmployeeProfile/ProviderProfile link authorizes the
  person's own schedule, appointments, customers and personal analytics.

The provider link does not replace or downgrade owner authority. The native app
may present owner and staff modes, but mode selection is a UI context filter,
not a new login or a permission escalation.

If the owner's CRM employee record becomes inactive, provider capabilities are
suspended after reconciliation, while `tenant_owner` remains active until an
explicit ownership-transfer or security workflow changes it. CRM employment
status must never silently remove the last tenant owner.

## 17.6 Workforce bootstrap and role assignment

Workforce sync imports active and inactive operational records separately. It
must cover bookable providers and non-bookable personnel, including
administrators, rather than relying only on a booking-staff endpoint.

The default access lifecycle is:

~~~text
active CRM workforce record
  → EmployeeProfile / ProviderProfile
  → pending access candidate
  → verified identity or accepted owner invitation
  → active Membership with least-privilege role bundle
~~~

Rules:

- an active provider defaults to the `provider` bundle after identity proof;
- an active non-bookable employee defaults to `employee` after identity proof;
- administrator, manager, accountant and owner roles require explicit grant by
  an authorized owner or an approved provider-role mapping;
- a CRM record alone never creates an authenticated User or active session;
- a person absent from the selected CRM scope is not silently granted access;
- duplicate or ambiguous employee matches require owner review;
- role grants and changes are audited and idempotent;
- at least one active tenant owner must always remain.

“No access” is not a business role. A workforce record may be pending identity
proof, suspended, outside the selected branch or intentionally excluded, but
the system must expose that reason explicitly.

## 17.7 Deactivation and employment changes

When external CRM is the workforce source of truth:

- an inactive or terminated employee record suspends provider/employee
  Membership capabilities after a configurable reconciliation grace period;
- new sessions are denied immediately after suspension; existing sessions are
  revoked through the session service;
- owner-only access is never removed by employment sync;
- administrator/manager exceptions require explicit owner review;
- reactivation restores only previously approved role bundles;
- no record is hard-deleted as part of routine sync.

Every transition records source record, sync run, previous state, resulting
state and reviewer when applicable.

## 17.8 Customer social linking

Customer login is a deterministic tenant-scoped link, not a name search.

~~~text
signed tenant entry
  → Telegram or Yandex authorization
  → server-side provider-token verification
  → verified provider identity
  → verified phone claim when consented and available
  → tenant-scoped lookup hash
  → exact Customer identity match
  → customer Membership/session
~~~

If a verified phone is unavailable, declined or matches more than one Customer,
MAYA does not guess. It returns a stable remediation state such as
`phone_consent_required`, `identity_match_ambiguous` or
`customer_verification_required` and offers an approved alternative flow.

Names, usernames, profile photos and unverified email addresses are never
sufficient for automatic Customer linking.

## 17.9 Social provider capability matrix

| Provider | Authentication identity | Phone evidence | First-release rule |
| --- | --- | --- | --- |
| Telegram OIDC / native SDK | cryptographically verified subject | `phone` scope, explicit consent and verified phone claim | Request phone; fail closed if absent |
| Legacy Telegram login widget | verified legacy profile fields | not a reliable phone source | Do not use for automatic CRM customer linking |
| Yandex ID | verified OAuth subject | available only when the app has phone permission and the user consents | Request phone permission; fail closed if absent |
| Email magic link | verified email ownership | no phone proof | Owner/team recovery or invitation only in Release 1 |

Provider references:

- [Telegram Login / OIDC](https://core.telegram.org/bots/telegram-login)
- [Yandex ID user information and phone permission](https://yandex.ru/dev/id/doc/ru/user-information)

Provider subject IDs remain stable AuthIdentity keys. Phone values are
normalized inside protected infrastructure, encrypted where retained and
converted to tenant-scoped lookup hashes before customer matching.

## 17.10 Multi-role mode selection

After authentication the backend returns accessible modes derived from active
links and permissions:

- owner/business mode;
- staff/provider mode;
- customer mode when the User is also linked to a Customer.

If more than one mode is available, the native app shows a mode chooser and a
persistent “switch mode” control. Choosing a mode filters navigation and data;
the server still authorizes every request against the full trusted
Membership/link context.

The client must not send a role to obtain additional authority. A requested
mode that is not in the server response returns `forbidden`.

## 17.11 Operational CRM sync dependency

Membership bootstrap is not enough to power the application. Before owner or
staff surfaces are considered operational, the selected tenant requires:

- workforce and provider profiles;
- services and locations;
- schedules and availability;
- appointments, visits and statuses;
- customers and identity references;
- payments/refunds and cashbox facts where the capability exists;
- explicit sync watermark, reconciliation counts and quality state.

Until the required dataset is complete and fresh, the API returns partial or
stale states. It must not replace missing records, customers or money with
zero.

## 17.12 Stable failure states

Initial contract errors include:

| Code | Meaning |
| --- | --- |
| `owner_bootstrap_required` | Authenticated User has not completed trusted owner bootstrap |
| `owner_bootstrap_replayed` | Bootstrap grant was already consumed |
| `employee_identity_unverified` | Workforce record exists but no verified User link exists |
| `employee_match_ambiguous` | More than one workforce profile could match |
| `membership_suspended` | Tenant access was suspended |
| `phone_consent_required` | Social provider did not return a verified phone |
| `customer_not_found_in_tenant` | Verified identity has no Customer in the selected tenant |
| `identity_match_ambiguous` | Verified identity maps to conflicting records |
| `crm_initial_sync_incomplete` | Required operational backfill has not reconciled |

Errors are localized by clients. Backend error codes remain stable and contain
no raw PII or provider credential detail.

## 17.13 Acceptance criteria

- A CRM token cannot grant owner access without an authenticated, unused owner
  bootstrap grant.
- Replaying owner bootstrap does not create a second owner or tenant.
- One User can use owner and provider modes without duplicate accounts.
- An owner-provider whose CRM employment becomes inactive retains owner access
  but loses provider capabilities after policy reconciliation.
- Active providers receive no account until identity proof or invitation
  acceptance succeeds.
- Non-bookable administrators are discoverable through workforce sync and can
  receive an explicit administrator grant.
- Telegram and Yandex customer login links only through a verified phone in the
  already resolved tenant.
- Missing phone consent never falls back to name or username matching.
- A social identity from tenant A cannot discover or link a Customer in tenant
  B.
- Mode switching changes presentation, not server authority.
- Owner/staff analytics remain partial until operational sync and
  reconciliation gates pass.

## 17.14 Reconciliation

**KEEP:** global User, tenant Membership, explicit EmployeeProfile/Customer
links, trusted TenantContext and server-side permission checks.

**EXTEND:** social auth evidence, owner bootstrap, workforce deactivation and
multi-role mode projection.

**CHANGE:** successful CRM verification no longer implies that the submitting
person is already identified as owner or employee.

**ADD:** replay-safe owner grant, access-candidate lifecycle, provider capability
matrix and operational-sync readiness gate.
