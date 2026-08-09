# Chapter 9 — Proactive Intelligence / Maya Watch

<!-- markdownlint-configure-file {"MD013": false} -->

## 9.1 Purpose

Maya Watch detects meaningful business conditions before the user asks.

It is a deterministic monitoring and signal layer. It does not send ungoverned
messages, invent explanations or execute actions.

## 9.2 Detector classes

### Event detectors

Evaluate immediately after canonical events:

- appointment cancelled;
- payment/refund recorded;
- review received;
- consent withdrawn;
- sync capability lost.

### Scheduled detectors

Evaluate at a tenant/local schedule:

- next-day capacity;
- customers approaching return cadence;
- weekly retention trend;
- monthly revenue decomposition;
- expiring packages;
- integration health.

### Streaming/window detectors

Evaluate event windows:

- cancellation/no-show rate spike;
- unusual booking drop;
- repeated communication failure;
- employee utilization divergence.

### Model-based detectors

May estimate risk or expected value only with model version, interval, backtest,
features and confidence. They cannot replace deterministic facts.

## 9.3 Detector definition

~~~yaml
key: capacity_gap_next_7d
version: 1
trigger:
  type: schedule
  localCron: "0 7 * * *"
requirements:
  metrics: [available_capacity]
  capabilities: [appointments.read, schedule.read]
quality:
  minimumCompleteness: 0.95
  maximumStalenessSeconds: 900
threshold:
  minimumMinutes: 240
suppression:
  dedupeWindowHours: 24
rollout: shadow
owner: operations-intelligence
~~~

Definitions are versioned, reviewed and testable. Threshold changes create a
new version or policy snapshot.

## 9.4 Signal contract

A signal includes:

- detector key/version;
- tenant and affected scope;
- type and observed time;
- evidence IDs and watermark;
- materiality;
- estimate range if relevant;
- quality and confidence;
- deduplication fingerprint;
- expiry and suppression hints.

Signals contain no user-facing generated prose.

## 9.5 Initial detector catalog

### Capacity

- future capacity gap;
- newly freed cancellation slot;
- high-demand time still available;
- schedule mismatch or underconfigured capacity.

### Customers

- customer approaching expected return;
- overdue return cohort;
- retention decline;
- high-value customer inactivity;
- repeated cancellation/no-show pattern.

### Revenue and operations

- abnormal revenue or visit decline;
- average-check shift;
- employee utilization decline;
- service mix change;
- refund or cancellation spike.

### Experience and platform health

- negative review;
- failed communication;
- CRM sync stale;
- reconciliation gap;
- permission/capability loss;
- detector/action failure.

## 9.6 Quality gate

A detector evaluates only when required data meets its policy.

Possible results:

- triggered;
- not_triggered;
- suppressed;
- skipped_data_incomplete;
- skipped_capability_missing;
- failed.

Skipped or failed evaluations do not become opportunities. They remain
observable operational events.

## 9.7 Deduplication and suppression

Repeated facts should not flood users.

Deduplication considers:

- tenant;
- detector and version;
- affected entity/scope;
- evidence period/watermark;
- opportunity type;
- previous active/resolved state.

Suppression policies include cooldown, already-actioned, user-dismissed,
seasonal exception, maintenance window and low confidence.

## 9.8 Materiality

Not every statistical change deserves attention. Detectors should combine:

- absolute business impact;
- relative change;
- confidence and completeness;
- urgency and time to act;
- reversibility;
- tenant target or threshold;
- notification fatigue.

Materiality policy is visible and configurable within guarded ranges.

## 9.9 From signal to opportunity

Maya Watch does not rank the final user feed. It sends eligible signals to the
Opportunity Engine, which:

- groups related signals;
- attaches business context;
- estimates impact;
- proposes available action types;
- scores priority;
- manages lifecycle.

## 9.10 Notification policy

An opportunity may:

- appear silently in a feed;
- enter the next scheduled briefing;
- create a role work item;
- trigger a push/Telegram alert;
- request immediate owner attention.

Urgent interruption requires explicit severity, role policy and quiet-time
rules. A detector alone never authorizes client communication.

## 9.11 Feedback and tuning

User outcomes include:

- useful;
- not useful;
- incorrect;
- already handled;
- remind later;
- do not show this type;
- threshold override request.

Feedback adjusts reviewed detector policy or ranking. It must not silently
disable security/integration health alerts or change platform-wide rules.

## 9.12 Observability

Track per detector/version:

- evaluation count and latency;
- trigger, skip and failure rates;
- data-quality distribution;
- opportunity creation and dedupe rate;
- user dismissal/incorrect rate;
- action and outcome conversion;
- estimated versus realized impact;
- compute cost.

## 9.13 Rollout

Detectors progress through:

1. off;
2. shadow;
3. preview for internal reviewers;
4. limited tenant/role cohort;
5. live feed;
6. optional alerting;
7. bounded automation only under a separate policy.

Shadow comparison must establish acceptable false-positive and data-quality
behavior before user interruption.

## 9.14 Acceptance criteria

- Replayed source events do not create duplicate signals.
- Incomplete data causes a skipped evaluation, not a misleading alert.
- Every signal resolves to detector version, evidence and watermark.
- User dismissal does not delete historical evidence.
- Alerting respects role, severity, quiet time and fatigue policy.
- Security and sync-health detectors remain independently governed.
