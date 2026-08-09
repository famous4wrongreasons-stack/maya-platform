# Chapter 7 — Business Intelligence Layer

<!-- markdownlint-configure-file {"MD013": false} -->

## 7.1 Goal

Give Maya a universal, deterministic business intelligence layer so it can
derive answers rather than memorize handlers for questions.

The base Universal Metrics Engine, Business Knowledge Graph and Query
Understanding Engine remain authoritative. This chapter defines the first
product-facing BI scope and its relationship to opportunities.

## 7.2 Architecture

~~~text
Canonical facts
  → analytical read models
  → Metric Registry
  → Query Engine
  → comparison/decomposition/segmentation
  → EvidenceBundle
  → AI explanation or proactive detector
~~~

LLM does not calculate authoritative metrics, run unrestricted SQL or infer
missing facts.

## 7.3 Metric registry

Each metric definition includes:

- key, version and owner;
- business meaning;
- required facts and capabilities;
- formula and population;
- value type and unit;
- time and currency policy;
- allowed filters and dimensions;
- comparison methods;
- quality and freshness thresholds;
- missing-data behavior;
- golden fixtures.

Changing a formula creates a new version.

## 7.4 Initial MVP metrics

Implement a registry-based 20–30 metric MVP before broad expansion.

### Money

- revenue;
- cash inflow;
- refunds;
- average check;
- direct cost;
- gross profit;
- operating expenses;
- net profit where inputs exist.

### Appointments and capacity

- requested, confirmed and completed appointments;
- cancellations and no-shows;
- available capacity;
- booked minutes;
- provider utilization;
- cancellation-created openings.

### Customers

- unique, new and returning customers;
- repeat rate and retention;
- visit frequency and cadence;
- overdue, at-risk and lost customers;
- recognized lifetime value.

### Employees and services

- employee revenue, utilization, average check and retention;
- service revenue, count, mix and average check;
- service repeat behavior.

### Operations and quality

- sync lag and reconciliation gap;
- opportunity volume and resolution;
- communication delivery;
- action completion and recovered-value observations.

## 7.5 Universal query dimensions

Queries compose metrics with:

- explicit period;
- comparison period;
- location, employee, service and customer segment;
- day/week/month grain;
- channel and source where meaningful;
- ranking, top/bottom, trend and contribution.

One query contract supports many user wordings.

## 7.6 Time intelligence

Business time follows tenant/location timezone and [start, end) intervals.

The layer supports:

- today, yesterday, week, month and custom ranges;
- equal-elapsed comparison for partial periods;
- previous period and year-over-year;
- business date crossing midnight;
- visible resolved dates in high-impact answers;
- null percentage change when comparison denominator is zero.

## 7.7 Follow-up context

Conversation memory stores the prior structured query.

Example:

~~~text
User: Show August revenue.
User: By employee.
User: Compare with July.
~~~

The second request inherits metric and period; the third adds comparison.
Permission and tenant scope are reevaluated every turn.

## 7.8 Explanation and contribution

For “why did revenue fall?” Maya may:

1. query revenue for current and comparison periods;
2. retrieve completed visits and average check;
3. decompose volume and price/mix contribution;
4. group by location, employee and service;
5. identify the largest measured contributors;
6. disclose missing factors;
7. formulate an evidence-backed explanation.

Use “contribution” or “associated with” unless a causal method is available.

## 7.9 Segmentation

Segments are deterministic, versioned queries or models with:

- eligibility population;
- rules/features;
- evaluation time;
- membership snapshot;
- quality and confidence;
- purpose restrictions.

Segments used for communication still require individual eligibility decisions.

## 7.10 Opportunity inputs

Detectors consume typed metrics and facts, not AI prose. Examples:

- future available capacity above threshold;
- cancellation opens a high-demand slot;
- customer cohort reaches return cadence;
- retention or revenue declines beyond materiality threshold;
- employee utilization divergence;
- sync quality falls below reliable analytics threshold.

Detector inputs pin metric definition versions and watermarks.

## 7.11 Structured results

The BI API can return:

- metric summary;
- comparison;
- table;
- time series;
- ranked list;
- contribution breakdown;
- segment preview;
- data-quality notice.

UI renders these as widgets. LLM should not generate SVG or HTML charts.

## 7.12 Tenant business context

Tenant-specific context may contain:

- business targets;
- working hours and calendars;
- metric thresholds;
- excluded employee roles;
- terminology aliases;
- approved segment/cadence policies;
- reporting preferences.

Context is versioned, permissioned and separate from global prompts.

## 7.13 Trust and accuracy

Every factual answer includes or can resolve:

- metric definition version;
- exact period and filters;
- source watermark;
- completeness and exclusions;
- evidence/lineage reference;
- warnings and unavailable requirements.

Unknown is not zero. Potential revenue is an estimate. Net profit is
unavailable without required cost data.

## 7.14 Acceptance scenarios

The composable architecture must answer without a dedicated business handler:

- “Какая выручка сегодня?”
- “Сравни её со вчера.”
- “Кто сегодня заработал больше всех?”
- “У кого самая высокая загрузка?”
- “Почему выручка хуже предыдущего месяца?”
- “Какие сотрудники сильнее всего повлияли на падение?”
- “Кто давно не возвращался?”
- “Сколько свободных часов завтра?”
- “А только у Александра?”
- “Покажи это по дням.”
- “Сравни две точки.”

Each answer is role-authorized, evidence-backed and quality-aware.
