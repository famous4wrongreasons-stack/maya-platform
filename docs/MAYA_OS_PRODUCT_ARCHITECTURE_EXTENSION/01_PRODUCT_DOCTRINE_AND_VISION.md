# Chapter 1 — Product Doctrine & Vision

<!-- markdownlint-configure-file {"MD013": false} -->

## 1.1 Purpose

Maya must not evolve into another CRM with AI features attached.

CRM records what happened. Maya understands what happened, determines whether
it matters, explains why, and helps the user act safely.

Maya is not primarily:

- a calendar;
- a CRM;
- an analytics dashboard;
- a Telegram bot;
- a white-label booking application;
- a chatbot;
- a reporting tool.

Those may exist as supporting capabilities. The core product promise is:

> Maya watches the business, understands it and acts with the user.

Customer-facing positioning:

> Maya следит за бизнесом, пока вы занимаетесь бизнесом.

## 1.2 Product loop

Maya has six connected responsibilities.

### WATCH

Continuously observe business state and material changes: empty capacity,
cancellations, overdue return cadence, retention decline, no-shows, utilization
gaps, revenue anomalies, negative feedback and integration failures.

A user should not have to ask Maya to discover an obvious, measurable risk.

### UNDERSTAND

Explain why an event matters using deterministic metrics, evidence, lineage and
data-quality warnings.

The response model is:

~~~text
fact → interpretation → hypothesis → recommendation
~~~

Hypotheses and estimates must never be presented as confirmed facts.

### ASK

Accept natural-language questions without a dedicated handler for each wording.
Examples:

- “Сколько мы заработали вчера?”
- “Почему упала выручка?”
- “Кто лучше удерживает клиентов?”
- “Какие услуги приносят деньги, но плохо возвращают клиентов?”
- “Сколько свободных окон завтра?”

Understanding is composed from the canonical model, semantic metrics, query
planning and tools.

### ACT

Prepare or execute governed actions: find candidates for an empty slot, create a
task, prepare a recovery campaign, create or move a booking, notify an employee
or send an approved message.

Actions always pass permission, consent, approval, idempotency and audit policy.

### MEASURE

Measure whether the action was completed and whether the intended outcome
occurred. Execution success and business success are different states.

### LEARN

Use verified outcomes to improve ranking, defaults and business context. Maya
must not “learn” unsafe permissions, unverified causal claims or raw PII.

## 1.3 Commercial doctrine

Customers do not primarily pay Maya to restate CRM data. A question such as
“Какая выручка за июль?” is useful but is rarely sufficient differentiation.

Maya creates paid value when it discovers an important condition and turns it
into an explainable, executable opportunity.

Example:

> This week has 27 free appointment windows with estimated capacity value of
> 73,000 RUB. Fifty-eight customers are approaching their usual return time;
> nineteen have an eligible matching window.

The amount is an estimate until realized. Maya must expose assumptions and
never label potential value as guaranteed revenue.

## 1.4 North star: Maya Recovered

The long-term north star is conservative incremental value:

- recovered appointments;
- returned customers;
- filled cancellations;
- prevented lost capacity;
- attributable recovered revenue;
- time saved on operational work.

Attribution requires a baseline, action link, observation window and confidence.
If Maya cannot reasonably demonstrate contribution, it reports an operational
outcome rather than recovered revenue.

## 1.5 Strategic boundary

Maya should not reproduce every YCLIENTS, DIKIDI or other CRM feature.

Before building a traditional CRM function, ask:

> Is this function already reliably provided by the configured system of
> record?

If yes, integration is preferred. Complex scheduling, payroll, inventory,
cashier logic, service catalog administration and accounting normally remain
owned by their configured systems unless a tenant explicitly selects Maya as
source of truth.

## 1.6 Product hierarchy

~~~text
System of Record       → connected CRM or Maya-owned domain
System of Intelligence → Maya
System of Action       → Maya through governed adapters
~~~

This is RECORD → INTELLIGENCE → ACTION, closed by outcome measurement.

## 1.7 Product moat

Maya must never collapse into “ChatGPT connected to YCLIENTS.” The defensible
system is:

- canonical business model and Maya Business Language;
- normalized multi-source data;
- deterministic semantic metrics;
- business knowledge graph;
- tenant-specific business context;
- proactive detectors and opportunity history;
- governed actions and outcome attribution;
- accumulated, scoped business memory.

Conversation is an interface to this infrastructure, not a substitute for it.

## 1.8 Experience principles

- Proactive by default, interruptive only by policy.
- Conversation first, widgets where visual scanning is faster.
- Facts are sourced; uncertainty is visible.
- One orchestration core, role-specific capabilities.
- Mobile-first but channel-independent.
- High-risk operations remain human-governed.
- Every recommendation should explain why now, expected impact and next action.

## 1.9 Success measures

Product success SHOULD track:

- weekly active businesses receiving a useful proactive insight;
- opportunity acknowledgement and resolution rates;
- approved action completion rate;
- recovered appointments and conservative attributable value;
- false-positive and dismissal rates by detector;
- median time from signal to action;
- answer evidence coverage and data freshness;
- user trust indicators, including corrections and overrides.

Vanity message volume or model token usage is not a north-star metric.

## 1.10 Reconciliation

**KEEP:** AI-first MAYA OS, Maya Brain, canonical domain, tools, actions,
multi-tenancy and memory.

**EXTEND:** analytics, orchestration, business context, role experiences and
outcome measurement.

**CHANGE:** Telegram no longer defines customer existence; dashboards become
supporting surfaces; employee experience becomes capability- and widget-based.

**ADD:** Customer 360, consent eligibility, Maya Watch, Opportunity Engine,
widget schemas and Maya Recovered.

## 1.11 Acceptance criteria

- A product story can be expressed as actor → signal/query → evidence →
  recommendation → governed action → outcome.
- No proposed feature requires provider-specific logic in core.
- Every material number has a deterministic source or is explicitly marked as
  an estimate.
- A role receives only allowed facts, widgets and actions.
- The same core loop works through web, native, Telegram and future voice
  adapters.
