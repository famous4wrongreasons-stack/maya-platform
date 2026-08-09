# Chapter 11 — Conversational UI & Widget System

<!-- markdownlint-configure-file {"MD013": false} -->

## 11.1 Product principle

Maya Chat is the primary surface for questions, explanations, recommendations
and complex actions. The product must not become text-only.

When information is faster to scan or act on visually, the backend returns a
structured widget. The LLM does not generate arbitrary HTML, SVG or frontend
code.

## 11.2 Experience composition

A Maya response may contain:

- concise message;
- evidence-backed claims;
- one or more structured widgets;
- safe quick replies;
- action drafts or approval controls;
- freshness and quality warnings;
- links to deeper supporting views.

Text remains a complete fallback.

## 11.3 Widget registry

Every widget declares:

- stable name and schema version;
- allowed roles/channels;
- typed data schema;
- evidence and freshness fields;
- supported actions;
- accessibility semantics;
- expiry/refresh policy;
- text fallback;
- rendering compatibility matrix.

Frontends render registered schemas only.

## 11.4 Initial widget catalog

### Intelligence

- metric_summary;
- metric_comparison;
- time_series;
- ranked_table;
- contribution_breakdown;
- data_quality_notice;
- customer_segment_preview.

### Opportunities

- opportunity_card;
- capacity_gap;
- return_cadence_cohort;
- business_health_alert;
- integration_health;
- recovered_value_summary.

### Actions

- action_preview;
- approval_request;
- booking_preview;
- campaign_audience_preview;
- task_preview;
- execution_result.

### Entity views

- customer_summary;
- employee_day;
- appointment_summary;
- service_summary.

## 11.5 Widget envelope

~~~yaml
schema: opportunity_card.v1
id: "wid_..."
tenantScope: "server-bound"
title: "..."
data: {}
evidenceIds: []
quality:
  freshnessAt: "..."
  warnings: []
actions:
  - type: inspect
    targetId: "opp_..."
expiresAt: "..."
fallbackText: "..."
~~~

TenantScope is not trusted from the client. It identifies server-side binding
for validation.

## 11.6 Action semantics

Widget buttons never execute arbitrary frontend commands. They submit a typed
intent with widget/action identifiers. Backend reloads current policy and data.

Examples:

- inspect opportunity;
- acknowledge or snooze;
- refresh evidence;
- prepare action;
- approve/reject exact draft;
- open canonical entity view.

Approval UI must show meaningful payload, audience, cost and risk.

## 11.7 State and refresh

Widgets may become stale when:

- opportunity expires or resolves;
- underlying availability changes;
- consent changes;
- metric watermark advances;
- draft or approval expires;
- permission/role changes.

The client displays stale state and requests refresh. It must not optimistically
pretend a business action succeeded.

## 11.8 Channel rendering

### Native/PWA

Full cards, charts, tables, filters, approvals and deep links.

### Telegram

Compact text, supported media and inline buttons. Complex charts degrade to a
summary plus link or accessible table.

### Voice

Short spoken summary and explicit confirmation. Visual companion widgets may
appear in the active app; sensitive bulk approvals should move to a visual
surface.

### Partner API

Returns structured schemas and evidence; partner rendering must preserve
confirmation and warnings.

## 11.9 Conversation and navigation

Persistent surfaces supplement chat:

- owner opportunity feed;
- approval inbox;
- employee work queue;
- customer bookings/profile;
- integration and data-health settings.

Opening a surface should preserve conversational context through opaque entity
or opportunity IDs, not copied natural-language history.

## 11.10 Accessibility and localization

Widgets MUST:

- provide semantic labels and keyboard/screen-reader support;
- not rely on color alone;
- format currency, time and numbers by locale;
- expose chart data in text/table form;
- maintain readable density on mobile;
- support Russian first and locale-ready strings;
- preserve warnings in all renderers.

## 11.11 Security

- Widget payload is role-minimized server-side.
- Hidden UI is not authorization.
- IDs are opaque and revalidated.
- Raw PII is excluded unless a separately permissioned view requires it.
- Client-provided widget data cannot alter approval payload.
- Links use authorized deep-link resolution.

## 11.12 Analytics and quality

Track:

- widget render and fallback success;
- action click and completion;
- refresh/stale rate;
- accessibility errors;
- channel-specific failure;
- user correction/dismissal;
- time to understand and act.

## 11.13 Acceptance criteria

- A six-month revenue query returns a time-series schema and text fallback.
- The same opportunity renders on PWA and Telegram without changing business
  logic.
- Stale availability blocks approval until refresh.
- Widget action IDs cannot escalate to an unregistered command.
- Quality warnings survive every renderer.
- Charts have accessible tabular equivalents.
