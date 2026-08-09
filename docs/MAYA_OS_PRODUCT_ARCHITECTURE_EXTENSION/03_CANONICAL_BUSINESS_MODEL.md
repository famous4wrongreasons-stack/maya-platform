# Chapter 3 — Canonical Business Model

<!-- markdownlint-configure-file {"MD013": false} -->

## 3.1 Goal

Maya uses a provider-independent business vocabulary regardless of CRM,
vertical or channel. This chapter keeps the Maya Business Language from the
base specification and adds the entities needed for identity, communication,
proactive intelligence and experience.

## 3.2 Existing core retained

The extension reuses:

- Tenant, User, Membership, Organization and Location;
- EmployeeProfile, ProviderProfile, Resource and WorkSchedule;
- Customer, Service, Appointment, Visit and ServiceDelivery;
- Order, Payment, Refund, Transaction, Expense and LedgerEntry;
- Campaign, Task, Notification and Conversation;
- DomainEvent, MetricDefinition, MetricObservation and KnowledgeAssertion;
- QueryRecord, ExecutionPlan, ToolInvocation and ApprovalRequest;
- Recommendation, ActionDraft and ActionRun.

The existing entity envelope, source reference, tenant and version invariants
remain mandatory.

## 3.3 Customer identity entities

### CustomerIdentity

A tenant-scoped identifier linking a Customer to a provider or channel.

Conceptual fields:

- id, tenantId and customerId;
- type: phone, email, crm_external, telegram, authenticated_user or custom;
- encryptedValueRef and deterministic tenant-scoped lookup hash where allowed;
- sourceSystem and sourceId;
- verification state and verifiedAt;
- confidence and evidence;
- firstSeenAt, lastSeenAt and status.

Identity value must not be duplicated into AI-safe projections.

### CustomerMergeCandidate

Represents a possible duplicate with evidence, score and review state. It does
not itself merge records.

### CustomerMergeRecord

Immutable audit of survivor, merged IDs, references moved, actor, policy and
evidence.

## 3.4 Consent and communication entities

### ConsentRecord

An immutable grant, refusal or withdrawal event with subject, purpose, channel,
scope, legal basis, policy version, evidence and effective interval.

### SuppressionEntry

A fail-closed block such as unsubscribe, complaint, hard bounce, invalid
identity, legal hold or tenant policy.

### CommunicationEligibilityDecision

A point-in-time, auditable result for one subject/audience and message purpose.
It stores allow/deny, reason codes, policy snapshot and identity used.

### CommunicationAttempt

Tracks prepared, queued, delivered, failed, bounced, opened or replied states
without exposing provider payload as domain truth.

## 3.5 Proactive intelligence entities

### DetectorDefinition

Versioned rule/model definition with required facts, schedule or event trigger,
quality thresholds, suppression window, owner and rollout mode.

### DetectorEvaluation

Records input watermark, result, reasons, duration and version.

### Signal

Typed observation such as capacity_gap, cancellation_risk,
return_cadence_due, retention_decline or sync_health_degraded.

### Opportunity

An actionable business situation with:

- type and status;
- evidence snapshot;
- affected scope and audience;
- urgency and expiry;
- expected impact range and confidence;
- score and score version;
- recommended action types;
- deduplication key;
- source signal IDs.

### OpportunityOutcome

Links baseline, action runs, observation window, realized metrics, confidence
and confounders.

## 3.6 Experience entities

### WidgetDefinition

A versioned schema and rendering contract, not stored arbitrary HTML.

### WidgetInstance

A role-filtered payload linked to evidence, action drafts and expiry.

### Briefing

A curated, time-bounded collection of opportunities, health metrics and
required approvals for a role.

## 3.7 Identity rules

- Maya UUIDs are global identifiers inside the platform; provider IDs are
  namespaced external references.
- Customer existence does not depend on Telegram or authenticated User.
- User, Customer and EmployeeProfile remain separate entities with explicit
  links.
- The same person in two tenants remains two tenant Customer records.
- Raw PII cannot be a cross-tenant global key.
- Automatic merge requires a reviewed threshold and no contradictory evidence.
- High-risk ambiguity creates a candidate for review, not a silent merge.

## 3.8 Relationship invariants

- All referenced tenant-owned entities share tenantId.
- Opportunity evidence is immutable or versioned by snapshot.
- Signal and opportunity deduplication keys include tenant and detector version.
- Consent decision refers to a policy snapshot and concrete purpose.
- CommunicationAttempt refers to an eligibility decision.
- ActionRun refers to the exact approved ActionDraft hash.
- Outcome never mutates the underlying historical action or metric observation.
- Widget actions reference registered action types; no arbitrary frontend
  command is allowed.

## 3.9 Business graph extensions

New typed relationships include:

- Customer HAS_IDENTITY CustomerIdentity;
- Customer HAS_CONSENT ConsentRecord;
- DetectorDefinition REQUIRES Metric/Capability;
- DetectorEvaluation PRODUCES Signal;
- Signal SUPPORTS Opportunity;
- Opportunity PROPOSES ActionType;
- ActionRun TARGETS Opportunity;
- OpportunityOutcome EVIDENCED_BY MetricObservation;
- WidgetInstance PRESENTS Opportunity or ApprovalRequest.

These relationships augment, not replace, operational storage.

## 3.10 Vertical extension

Beauty-specific cadence, service categories or resource types belong in
industry presets, taxonomies and bounded metadata. The core entities above
must support another service vertical without renaming tables or copying the
model.

## 3.11 Acceptance criteria

- A CRM customer without Telegram becomes a canonical Customer.
- Multiple verified identities can resolve to one Customer inside a tenant.
- An ambiguous duplicate remains reviewable without corrupting references.
- A consent withdrawal changes eligibility without deleting historical
  evidence.
- An opportunity retains exact metric, signal and action lineage.
- A second service vertical uses the same core entity set.
