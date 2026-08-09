# Chapter 2 — System Architecture

<!-- markdownlint-configure-file {"MD013": false} -->

## 2.1 Relationship to the base architecture

This chapter extends, but does not replace, the control, intelligence,
execution, data and integration planes defined in the base specification.

The additional product flow is:

~~~text
External systems
  → Integration and normalization
  → Canonical business facts
  → Metrics and semantic intelligence
  → Maya AI Orchestrator
  → Maya Watch and Opportunity Engine
  → Action and Communication Engines
  → Role experience and widgets
  → Outcome measurement
~~~

No critical business logic may exist only in a frontend or channel adapter.

## 2.2 New first-class components

### Customer Identity Service

Resolves tenant-scoped customer identities, evidence, merge candidates and
Customer 360 projections. It never creates cross-tenant identity from raw PII.

### Consent Registry

Stores versioned consent and withdrawal evidence by purpose, channel, identity,
scope and legal basis.

### Communication Eligibility Service

Makes a point-in-time allow/deny decision for a concrete audience, purpose,
channel and message class. Sending components consume its decision; they do not
reimplement consent rules.

### Maya Watch

Evaluates event-driven and scheduled detectors against canonical facts and
metric observations. It emits typed signals, not user-facing prose.

### Opportunity Engine

Deduplicates, enriches, scores and prioritizes signals as opportunities. It
links evidence, expected impact, recommended actions and outcome windows.

### Widget Registry

Defines versioned structured views that each channel can render or degrade
gracefully to text.

### Outcome and Attribution Service

Connects recommendation, approval, execution and later observations without
overstating causality.

## 2.3 Event architecture

Maya Watch depends on normalized events:

~~~text
provider webhook or reconciliation poll
  → validated provider event
  → canonical command/change set
  → domain event + outbox
  → read-model update
  → detector evaluation
  → signal
  → opportunity
~~~

Representative events:

- AppointmentCreated;
- AppointmentCancelled;
- AppointmentCompleted;
- CustomerMerged;
- PaymentCompleted;
- CrmSyncCompleted;
- MetricCalculated;
- ConsentGranted;
- ConsentWithdrawn;
- OpportunityCreated;
- OpportunityResolved;
- ActionSucceeded.

Where providers lack webhooks, polling and reconciliation may approximate event
arrival. The recorded fact must retain observedAt, occurredAt and syncedAt.

## 2.4 Synchronous and asynchronous boundaries

Synchronous paths are reserved for immediate user needs such as availability,
booking confirmation, permission checks and approval decisions.

Asynchronous paths handle:

- CRM backfill and incremental sync;
- analytical read-model updates;
- detector evaluation;
- opportunity scoring;
- scheduled briefings;
- communication delivery and retries;
- outcome observation.

Async consumers MUST be idempotent, tenant-scoped and traceable to the outbox
event or schedule run that triggered them.

## 2.5 Orchestration boundary

The AI Orchestrator may:

- interpret a message or system-triggered opportunity;
- select registered read tools;
- request deterministic metrics and graph expansion;
- formulate evidence-backed explanations;
- propose a typed ActionDraft;
- return structured widgets.

It may not:

- query provider databases directly;
- create arbitrary tools at runtime;
- decide tenant, role, consent or approval;
- calculate authoritative business metrics;
- send communications or mutate records outside the Action Engine.

## 2.6 Data products

The data plane extends the base read models with:

- customer_identity_projection;
- customer_360_projection;
- consent_effective_state;
- communication_suppression;
- detector_evaluation_log;
- active_signal;
- opportunity_projection;
- opportunity_outcome;
- owner_briefing;
- employee_work_queue;
- recovered_value_observation.

These are logical contracts. Physical tables, materialized views or streams may
change without exposing provider-specific schemas.

## 2.7 Reliability rules

The extended architecture MUST support:

- idempotent event and action processing;
- deduplication of repeated provider webhooks and signals;
- explicit data freshness and detector watermark;
- partial provider outage behavior;
- retry with bounded backoff and dead-letter review;
- opportunity expiry and stale-evidence invalidation;
- consent withdrawal propagation before future sends;
- channel-specific delivery receipts;
- feature, detector, tool and automation kill switches.

Provider timeout must not become empty data. Detector failure must not create a
false opportunity. Communication uncertainty fails closed.

## 2.8 Tenant isolation

Every event, signal, opportunity, consent decision, widget payload, action and
outcome carries trusted tenant scope. Cache, deduplication and idempotency keys
include tenant.

Platform-wide benchmarks or detector tuning may use only separately governed,
minimized and aggregated data. They are not implied by normal tenant analytics.

## 2.9 Deployment topology

The target remains a modular monolith first:

- API and orchestration modules in the platform core;
- worker/scheduler for sync, detectors, delivery and outcomes;
- PostgreSQL as canonical persistence;
- queue/cache only when reliability or load requires it;
- provider and channel adapters at boundaries;
- legacy Python contour behind compatibility routes during strangler migration.

New components are modules and contracts first, not automatic microservices.

## 2.10 Acceptance criteria

- A provider event can be traced to a canonical fact, detector evaluation,
  opportunity, approved action and outcome.
- Replaying the same event does not duplicate opportunity or action.
- A stale or unavailable source produces a visible warning or no opportunity,
  never fabricated certainty.
- The same opportunity renders through at least one rich widget and a text
  fallback.
- No channel or LLM provider owns business policy.
