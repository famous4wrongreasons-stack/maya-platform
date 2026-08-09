# Chapter 5 — Customer Identity & Customer 360

<!-- markdownlint-configure-file {"MD013": false} -->

## 5.1 Goal

Create a trusted tenant-scoped understanding of a customer across CRM,
booking, payment and communication channels without making Telegram,
authentication or a single phone field mandatory.

Customer 360 is a governed projection over canonical facts. It is not a
denormalized bucket of raw provider data.

## 5.2 Identity principles

- A Customer may exist without a User account or messaging binding.
- One Customer may have several identities and external references.
- Identity is tenant-scoped.
- Raw PII is encrypted and isolated from AI context.
- Verification evidence matters more than string equality.
- Merge and split operations are auditable and reversible through repair.
- Unknown is preferable to an unsafe automatic match.

## 5.3 Identity types

Initial identity types:

- CRM external customer ID;
- tenant-scoped phone lookup hash;
- tenant-scoped email lookup hash;
- Telegram binding;
- authenticated Maya User link;
- booking-provider identity;
- import/source reference;
- future channel identity with verified ownership.

An identity stores status, evidence, verification method, source, confidence,
first/last seen timestamps and optional expiry.

## 5.4 Resolution pipeline

~~~text
source record
  → normalize permitted identifiers
  → exact trusted external-reference match
  → verified identity match
  → candidate scoring for remaining records
  → auto-link, review candidate or create customer
  → immutable resolution evidence
~~~

Resolution rules are versioned. The engine must record why a record linked or
did not link.

## 5.5 Matching evidence

Evidence may include:

- same provider-scoped external ID;
- same verified tenant phone/email hash;
- explicit authenticated-user linking;
- explicit customer confirmation;
- matching booking history with supporting non-sensitive facts;
- staff-reviewed merge.

Contradictory verified evidence blocks automatic merge. Names alone are
insufficient.

## 5.6 Merge lifecycle

1. Detect possible duplicate.
2. Build a role-filtered evidence summary.
3. Score under a versioned policy.
4. Auto-merge only when policy explicitly allows and no conflict exists.
5. Otherwise create a review candidate.
6. Lock involved records during approved merge.
7. Select survivor and repoint references transactionally.
8. Record immutable CustomerMergeRecord.
9. Rebuild affected projections and metrics.
10. Provide a repair/split workflow for proven mistakes.

Merge must not combine customers across tenants.

## 5.7 Customer 360 projection

The projection MAY contain:

### Identity summary

- canonical customer ID and status;
- verified channel availability;
- identity source summary;
- duplicate-review state.

### Relationship summary

- first and last completed visit;
- visit cadence and recency;
- preferred locations, services and providers;
- active packages, loyalty or certificates;
- next appointment;
- service issues or relevant notes under policy.

### Value and behavior

- recognized lifetime revenue;
- visit count and average check;
- refund/cancellation/no-show history;
- retention or cadence segment;
- response to prior approved communications;
- opportunity and action history.

### Communication state

- effective consent by purpose/channel;
- suppressions and eligibility reason;
- quiet hours, locale and preferred channel;
- latest delivery failures.

All computed fields include calculatedAt, definitionVersion and quality.

## 5.8 Role-filtered views

### Owner

May see business-relevant value, segments and aggregated opportunity history
within tenant permissions. Raw contact access remains separately permissioned.

### Administrator

May see operational profile, booking history and communication eligibility.
Strategic finance or sensitive notes may be excluded.

### Employee

May see only customers linked to permitted work and the minimum context needed
for service. Contact and business-wide value are denied by default.

### Customer

May see and correct own permitted profile, identities, consent and bookings.
Internal scores, staff notes and other customers are inaccessible.

## 5.9 Segments and cadence

Segments are versioned analytical outputs, not mutable labels entered by an
LLM. Initial concepts:

- new;
- active returning;
- loyal under tenant policy;
- approaching expected return;
- overdue;
- at-risk;
- lost;
- high-value;
- communication-ineligible.

Cadence should use service/customer history and uncertainty. A single global
“lost after N days” rule is allowed only as a documented fallback.

## 5.10 Data quality

Customer 360 exposes:

- source systems and latest sync;
- identity confidence;
- missing contact/consent capabilities;
- duplicate candidate state;
- metric freshness;
- partial-history warnings.

A projection with incomplete history must not imply full lifetime value or
reliable cadence.

## 5.11 API and tool boundary

Tools return minimized projections:

- customers.search;
- customers.get_summary;
- customers.get_own_profile;
- customers.get_communication_eligibility;
- customers.list_merge_candidates;
- customers.prepare_merge.

No AI tool returns raw encrypted identity data, unrestricted exports or direct
merge execution.

## 5.12 Acceptance criteria

- CRM-only, Telegram-only and authenticated customers resolve through the same
  canonical model.
- Two tenants may hold the same phone without cross-tenant linking.
- Ambiguous identities create review candidates.
- Merge updates bookings, payments and opportunities atomically.
- Every role receives a different, policy-tested Customer 360 view.
- Customer 360 exposes missing history and consent instead of inferring them.
