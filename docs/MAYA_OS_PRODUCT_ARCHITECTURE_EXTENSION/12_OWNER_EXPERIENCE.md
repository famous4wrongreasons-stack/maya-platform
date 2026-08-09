# Chapter 12 — Owner Experience

<!-- markdownlint-configure-file {"MD013": false} -->

## 12.1 Goal

Give the owner a trusted operating partner: a concise view of what needs
attention, the ability to ask why, and a safe path from decision to measured
action.

The owner experience is not a traditional dashboard copied into chat.

## 12.2 Primary surfaces

- proactive briefing;
- prioritized opportunity feed;
- canonical Maya conversation;
- approval inbox;
- business health and recovered-value view;
- settings for goals, integrations, policies and notifications.

Detailed reports remain available when exploration is useful.

## 12.3 Morning briefing

The briefing SHOULD answer:

1. What changed?
2. What requires attention today?
3. What is the likely measurable impact?
4. What can Maya prepare or do after approval?
5. Is any source stale or incomplete?

It combines:

- business health metrics;
- top time-sensitive opportunities;
- pending approvals;
- action outcomes;
- data/integration health.

The briefing is role-authorized and tenant-timezone aware.

## 12.4 Opportunity feed

Each item shows:

- concise title and why now;
- evidence and period;
- estimated impact range;
- quality/confidence;
- deadline or decay;
- recommended next step;
- inspect, prepare, snooze or dismiss controls.

Ranking favors materiality and actionability, not the newest event alone.

## 12.5 Conversational analysis

Owners can ask:

- “Что происходит с бизнесом?”
- “Почему упала выручка?”
- “Какие сотрудники повлияли на снижение?”
- “Где свободные окна на следующей неделе?”
- “Какие клиенты скоро должны вернуться?”
- “Что из этого стоит сделать первым?”

Maya exposes periods, definitions, evidence and unavailable inputs.

## 12.6 Decision and approval

The owner can:

- inspect evidence and alternatives;
- adjust permitted draft parameters;
- review audience exclusions and cost;
- approve or reject exact payload;
- require another manager approval by tenant policy;
- pause detector/action types through governed settings.

Approval is not a generic “yes” to future changes.

## 12.7 Financial trust

Owner finance views distinguish:

- recognized revenue;
- cash inflow;
- refunds;
- gross/net profit only when required data exists;
- potential capacity value;
- realized action outcomes;
- conservatively attributed recovered value.

Maya never fills missing expenses with a guess unless the owner explicitly
requests an identified estimate.

## 12.8 People and role boundaries

Owners may view business and employee metrics under permission policy.
Sensitive HR/payroll/PII fields remain separately scoped. Maya should explain
aggregate operational patterns without unnecessarily exposing customer or
employee personal details.

## 12.9 Business context controls

Owners may configure:

- goals and materiality thresholds;
- working calendars and reporting periods;
- excluded roles from comparisons;
- notification severity and quiet time;
- approval policy within platform limits;
- detector preferences and snoozes;
- terminology and reporting format.

Changes are versioned, previewed and auditable.

## 12.10 Integration and data health

The experience shows:

- connected source and ownership mode;
- latest successful sync and lag;
- capability changes;
- missing data required for requested metrics;
- reconciliation gaps;
- safe remediation steps.

Maya should not hide a broken connection behind an AI answer.

## 12.11 Multi-location support

Owners can compare tenant, organization and location scopes. The UI makes scope
visible and prevents inherited conversation context from silently changing the
business/location being analyzed.

## 12.12 Notification policy

Default owner notifications:

- urgent operational risks: interrupt under policy;
- time-sensitive opportunities: feed plus optional push;
- trends and summaries: scheduled briefing;
- low-confidence findings: feed, no interruption;
- data-health failure: explicit warning with remediation.

## 12.13 Outcome reporting

After action, Maya reports:

- what was executed;
- delivery/provider result;
- operational outcome;
- observation window;
- realized/attributable value and confidence;
- remaining opportunity or follow-up.

## 12.14 Acceptance scenarios

- Owner opens Maya and receives no more than a few prioritized, evidence-backed
  items.
- Owner asks why a metric changed and receives contribution analysis with
  missing-data warnings.
- Owner prepares a return campaign, sees eligible/excluded counts and approves
  an exact snapshot.
- A later withdrawal removes a customer before send.
- Owner sees action completion separately from recovered revenue.
- Multi-location scope remains visible through follow-up questions.
