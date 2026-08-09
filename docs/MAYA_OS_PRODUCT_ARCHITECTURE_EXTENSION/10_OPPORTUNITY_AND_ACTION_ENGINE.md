# Chapter 10 — Opportunity & Action Engine

<!-- markdownlint-configure-file {"MD013": false} -->

## 10.1 Goal

Turn validated signals and user discoveries into prioritized, explainable and
measurable actions without bypassing the Action, Approval and Tool frameworks
from the base specification.

## 10.2 Opportunity lifecycle

~~~text
candidate
  → active
  → acknowledged
  → action_prepared
  → approved/rejected
  → executing
  → resolved/expired/dismissed
  → outcome_observed
~~~

An opportunity may resolve without an action, for example when a slot is filled
organically or the underlying data changes.

## 10.3 Opportunity contents

Each Opportunity includes:

- type, title key and status;
- tenant, location and affected entities;
- evidence snapshot and data quality;
- detectedAt, actionBy and expiresAt;
- why it matters;
- expected impact range and confidence;
- priority score and score version;
- available action types;
- prior related opportunities/actions;
- owner role and visibility policy;
- deduplication key.

Generated display text is not the source of truth.

## 10.4 Scoring

Priority score may combine:

- expected financial/operational value;
- confidence and evidence quality;
- urgency and decay;
- probability of successful action;
- customer/employee experience risk;
- action effort and cost;
- reversibility;
- tenant targets;
- recent alert fatigue.

Weights are versioned and explainable. High score does not grant permission.

## 10.5 Grouping and conflict

Related signals should form one opportunity when they share scope and action.
Examples:

- several cancelled records create one capacity-recovery opportunity;
- a revenue decline plus visit decline and stable average check form one
  business-health opportunity;
- customer cadence signals form a bounded eligible cohort.

Conflicting opportunities must be surfaced or resolved by policy. Maya should
not recommend discounting a slot while a higher-value operational constraint
makes it unavailable.

## 10.6 Recommended action model

An opportunity proposes registered actions, such as:

- inspect evidence;
- create staff task;
- prepare available-slot outreach;
- prepare return-cadence campaign;
- adjust schedule draft;
- create or reschedule booking;
- request data-source remediation;
- acknowledge, snooze or dismiss.

The recommendation explains expected outcome, cost, audience, risks and why now.

## 10.7 Action preparation

ActionDraft extends the base contract with:

- opportunity ID and evidence hash;
- affected audience/entity snapshot;
- exact command or workflow version;
- preview and exclusions;
- expected value range;
- communication eligibility summary;
- cost/budget;
- reversibility and compensation;
- risk tier and approval requirements;
- idempotency key and expiry.

Changing audience, command, evidence or material parameters invalidates prior
approval.

## 10.8 Risk and autonomy

### Observe / recommend

Read-only explanation and recommendation may execute after authorization.

### Prepare

Draft tasks, messages, campaigns or booking changes without external effect.

### Execute with approval

Booking writes, campaign sends, price/schedule changes and other high-risk
operations require an authorized human and exact-payload approval.

### Bounded automation

Only a separately approved policy may execute a narrow reversible action
without per-instance approval. It requires scope, budget, expiry, kill switch,
monitoring and periodic review.

## 10.9 Communication actions

Campaign preparation:

1. snapshot candidate segment;
2. evaluate eligibility per subject;
3. show allowed/denied/deferred counts and reasons;
4. draft content and channel plan;
5. estimate delivery cost and potential value;
6. obtain approval;
7. re-evaluate eligibility at execution;
8. send through provider adapter;
9. process receipts and suppressions;
10. measure outcome.

An LLM-generated message never authorizes the audience.

## 10.10 Booking actions

Booking creation/reschedule:

- recheck live availability near execution;
- verify customer/employee/location/service tenant ownership;
- use provider capability and non-destructive semantics;
- show exact old/new values;
- require confirmation under role policy;
- use idempotency and provider request reference;
- emit domain events and update opportunity state.

## 10.11 Maya Recovered attribution

Recovered value is reported in confidence tiers:

- **direct:** action has a strong link to a completed paid outcome;
- **contributed:** action likely contributed but other factors exist;
- **operational only:** action completed, revenue attribution unsupported.

Attribution records:

- baseline and counterfactual method;
- action and audience;
- observation window;
- completed bookings/transactions;
- refunds/cancellations;
- confounders;
- confidence and method version.

Potential value and realized revenue must remain separate.

## 10.12 Failure and compensation

- Provider failure leaves the draft/action retryable under idempotency.
- Expired evidence requires refresh and possible reapproval.
- Partial bulk failure records per-recipient result and avoids duplicate retry.
- Reversible actions define compensation; irreversible actions fail closed.
- Failed execution does not mark opportunity resolved unless the condition
  disappeared independently.

## 10.13 Audit

Traceability joins:

~~~text
signal → opportunity → recommendation → ActionDraft
→ approval → ActionRun → provider result → outcome
~~~

Audit stores metadata, hashes and references while minimizing PII.

## 10.14 Acceptance criteria

- Related repeated signals become one active opportunity.
- Score explanation identifies material factors and version.
- Approval cannot be replayed after payload or audience changes.
- Communication excludes newly withdrawn recipients at execution time.
- Booking action revalidates availability and remains non-destructive.
- Recovered reporting separates potential, completed and attributable value.
- Failed/partial actions are idempotent and observable.
