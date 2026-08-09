# Chapter 4 — CRM Integration Layer & YCLIENTS

<!-- markdownlint-configure-file {"MD013": false} -->

## 4.1 Strategic rule

YCLIENTS is the first major external system of record. It must not become
Maya's internal architecture.

The existing CRM adapter, tenant connection lifecycle and provider capability
catalog remain authoritative. This chapter extends their product requirements
for customer, consent, intelligence and proactive use cases.

## 4.2 Adapter ownership

YClientsAdapter owns:

- authentication and credential handling;
- provider endpoints, pagination and rate limits;
- provider IDs, statuses and error categories;
- webhooks and polling peculiarities;
- mapping to canonical Maya commands and facts;
- reversibility for supported writes;
- connection health and capability discovery.

The rest of Maya must not depend on YCLIENTS response shapes or numeric IDs.

## 4.3 Capability truth

Capability is runtime evidence, not an assumption or enum.

A tenant capability manifest SHOULD distinguish:

- customer list read and accessible history horizon;
- full, masked or unavailable contact fields;
- appointment, visit, service, employee and payment read coverage;
- create, reschedule and cancel semantics;
- webhook coverage and polling requirements;
- consent or communication-preference coverage;
- historical completeness and per-location scope;
- provider rate and pagination limits.

An unavailable capability returns a stable unavailable/remediation state. It
must not be inferred from a UI feature visible in YCLIENTS.

## 4.4 Required YCLIENTS spike

Before implementation relies on customer-base or consent coverage, execute an
explicit integration spike against current authorized credentials.

Verify:

1. the supported customer-list route and pagination behavior;
2. the branch/network scope available to the application user;
3. how full, masked and unavailable contact fields are represented;
4. restrictions specific to application/system users;
5. appointment, payment and visit history limits;
6. whether personal-data and marketing consent evidence is exposed;
7. webhook coverage for customer and consent changes;
8. revocation and permission-loss behavior;
9. sync rate limits, cursors and recommended retry policy;
10. required least-privilege permissions.

Store fixtures without real PII. Record the date, account type, permission set
and observed responses. Do not convert spike findings into universal provider
truth without versioning.

## 4.5 Customer import

Authorized CRM customers become canonical Customers independently of Telegram.

~~~text
authorized tenant connection
  → paginated accessible customers
  → schema validation
  → canonical Customer + CustomerIdentity
  → duplicate candidate evaluation
  → idempotent upsert
  → reconciliation report
~~~

If a business has 10,000 accessible customers, Maya should model those
customers even if none has used Maya chat. Inaccessible records must be
reported as capability or permission limits, not assumed absent.

## 4.6 Contact fields

Contact output is nullable and visibility-aware:

~~~yaml
phone:
  state: full | masked | unavailable
  encryptedValueRef: null
  lookupHash: null
~~~

Only infrastructure handling may access full contact values. Canonical
analytics, detectors and LLM context use opaque customer IDs or minimized
attributes.

## 4.7 Consent distinction

The existence of a consent feature in a provider UI does not prove API
availability or legal sufficiency for Maya.

When consent data is accessible:

- map the source event and evidence, not only a boolean;
- retain provider, policy text/version if available, timestamp and scope;
- reconcile later changes and withdrawals;
- evaluate Maya communication policy independently.

When it is not accessible:

- mark consent capability unavailable;
- do not infer consent from presence of a phone number or historical booking;
- collect consent through an approved Maya flow or exclude the subject.

## 4.8 Sync strategy

Initial backfill SHOULD cover:

- locations, employees and services;
- customers and external identities;
- appointments, visits and statuses;
- payments/refunds where accessible;
- schedules and capacity inputs;
- consent evidence only when verified.

Incremental sync uses webhooks where trustworthy and reconciliation polling for
gaps. Cursor advances only after canonical commit and outbox persistence.

Each run reports:

- source and canonical counts;
- unmatched and duplicate identities;
- invalid or unknown status mappings;
- payment/revenue reconciliation gaps;
- latest successful watermark;
- permission or capability changes.

## 4.9 Write operations

Write operations remain narrow and capability-gated:

- create booking;
- non-destructive reschedule;
- cancel under policy;
- update only provider fields with verified reversible semantics.

The model never calls the provider directly. The Action Engine invokes the
canonical command, backend policy validates it, and the adapter translates it.

Delete-and-create is not an acceptable reschedule fallback.

## 4.10 Failure and recovery

- Provider timeout returns provider_unavailable, not an empty list.
- Rate limit applies backoff and preserves cursor.
- Permission loss disables affected capabilities and opportunities.
- Unknown provider status enters quarantine or explicit unknown mapping.
- Duplicate webhook delivery is deduplicated.
- Partial backfill does not publish complete analytics.
- Credential rotation and disconnect invalidate future sync safely.

## 4.11 Reconciliation

**KEEP:** current adapter interface, verify-before-save, connection lifecycle,
source ownership, non-destructive reschedule and tenant-bound credentials.

**EXTEND:** customer identity, data-quality manifests, consent capability,
event coverage and proactive data products.

**CHANGE:** Telegram registration is no longer the customer import boundary.

**ADD:** explicit customer/consent spike and visibility-aware contacts.

## 4.12 Acceptance criteria

- Provider fixtures map to canonical entities without leaking YCLIENTS fields
  into core.
- Full, masked and missing contacts are tested.
- Pagination retry is idempotent and reconciliation catches gaps.
- Loss of permission changes the capability manifest and prevents dependent
  detector/action execution.
- Consent-unavailable state blocks communication eligibility.
- Booking reschedule contract proves non-destructive behavior.
