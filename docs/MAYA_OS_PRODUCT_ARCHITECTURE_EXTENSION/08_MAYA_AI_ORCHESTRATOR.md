# Chapter 8 — Maya AI Orchestrator

<!-- markdownlint-configure-file {"MD013": false} -->

## 8.1 Goal

Provide one channel-independent orchestration core for natural-language
questions, proactive opportunities and governed actions.

Maya OS, Maya Admin, employee assistant and Maya Consult are capability
profiles over the same core. They are not separate uncoordinated brains.

## 8.2 Inputs

The orchestrator receives a server-built package:

- authenticated actor and trusted tenant context;
- channel, locale and timezone;
- role, permission, entitlement and policy snapshot;
- current message or system opportunity trigger;
- bounded conversation QuerySpec history;
- allowed tool descriptors;
- relevant role-filtered memory and knowledge;
- data/capability summary;
- budget and execution limits.

Tenant, roles, permissions, consent or approval are never accepted from model
output.

## 8.3 Invocation modes

### Conversational

A user sends a question, follow-up or action request.

### Opportunity-assisted

A user opens an opportunity and asks Maya to explain, compare or prepare an
action.

### Proactive composition

The system asks the orchestrator to turn validated opportunity evidence into a
brief, role-appropriate explanation and widgets. This mode has no extra
permissions and cannot execute.

### Workflow continuation

An approved action or tool result returns for explanation and next safe step.

## 8.4 Processing pipeline

~~~text
safe input
  → intent and QuerySpec
  → permission/capability precheck
  → bounded ExecutionPlan
  → authorized tool calls
  → EvidenceBundle
  → validated claims and uncertainty
  → text + widgets + optional ActionDraft
~~~

Planner and Reasoning responsibilities remain separated as defined in the base
specification.

## 8.5 Tool policy

Tools are registered, typed and bounded. Initial categories:

- analytics.query_metrics;
- analytics.compare;
- customers.search and get_summary;
- scheduling.get_availability;
- opportunities.get and list;
- tasks.prepare;
- bookings.prepare_create/reschedule/cancel;
- campaigns.prepare;
- knowledge.search;
- consent.check_eligibility.

Preparation tools may create drafts. Actual risky writes remain in the Action
Engine after approval.

## 8.6 Evidence validation

Before response:

- every number must exist in evidence;
- every customer/employee reference must be role-authorized;
- unsupported causal wording is rejected or softened;
- quality warnings are preserved;
- estimates carry ranges and assumptions;
- missing capability produces remediation, not fabrication;
- recommended actions are registered and available.

## 8.7 Response contract

~~~yaml
message:
  text: "..."
  language: ru
claims:
  - type: fact | estimate | hypothesis | recommendation
    evidenceIds: []
widgets:
  - schema: opportunity_card.v1
    data: {}
actions:
  - draftId: "act_..."
quality:
  freshnessAt: "..."
  warnings: []
requestId: "req_..."
~~~

Channels may render widgets differently but must preserve message, evidence,
warnings and action confirmation semantics.

## 8.8 Conversation state

The orchestrator stores bounded structured state:

- prior QuerySpec and resolved periods;
- referenced entity IDs;
- selected opportunity or draft;
- clarification decisions;
- response language and display preference.

It does not use conversation memory to retain old permissions, approval or
consent.

## 8.9 Business context

Tenant business rules such as “exclude the managing owner from employee
comparison” are stored as versioned context with author and scope. They are not
appended indefinitely to a global system prompt.

High-impact rules require explicit confirmation and visibility.

## 8.10 Clarification

Clarify when ambiguity materially changes:

- metric or period;
- customer, employee or location;
- action target;
- communication purpose/audience;
- approval payload;
- expected cost or impact.

Ask a short, specific question with meaningful options. Do not ask for
information already available in authorized context.

## 8.11 Model portability

Provider adapters normalize:

- message/tool schemas;
- structured output validation;
- retry and timeout;
- usage and cost;
- provider safety configuration.

Fallback models receive the same minimized context and policy. A provider
failure cannot enable more data or tools.

## 8.12 Cost and latency

The orchestrator enforces:

- model and token budgets by workflow;
- bounded tool steps and repeated-payload detection;
- cached deterministic facts with tenant/freshness keys;
- progressive status for long analysis;
- cancellation and timeout;
- per-tenant and per-user rate/cost budgets.

Maya should stop when evidence is sufficient.

## 8.13 Memory and privacy

Only allowlisted memory categories are written automatically. Raw PII, secrets,
provider payloads and unrestricted conversation logs do not enter memory or
prompts.

## 8.14 Failure behavior

- Tool unavailable: explain missing capability and alternatives.
- Partial evidence: answer the supported part with warnings.
- Provider failure: deterministic or templated fallback, no invented answer.
- Validation failure: replan once within limits or return a safe error.
- Permission denial: do not reveal whether foreign data exists.
- Action ambiguity: remain at draft/clarification state.

## 8.15 Acceptance criteria

- The same QuerySpec/tool flow serves web, native and Telegram.
- A follow-up inherits analytical context but reevaluates policy.
- Proactive composition cannot execute an action.
- Every numeric claim resolves to evidence.
- Model provider replacement leaves domain and tool contracts unchanged.
- Permission, missing-data and provider-failure paths have deterministic tests.
