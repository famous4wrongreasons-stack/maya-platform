# Chapter 16 — Migration, Implementation & Delivery Plan

<!-- markdownlint-configure-file {"MD013": false} -->

## 16.1 Strategy

Use the strangler migration, modular monolith and feature-rollout rules from the
base specification.

No big-bang rewrite. Existing production behavior remains available until the
replacement slice has contract parity, data reconciliation, canary evidence and
a tested rollback path.

## 16.2 Starting point

The current system has:

- a live Python/SQLite/YCLIENTS contour with rich single-business behavior;
- a NestJS/PostgreSQL multi-tenant platform foundation;
- existing tenant, membership, booking, CRM and typed-tool slices;
- PR #21 as target architecture;
- scattered legacy analytics and role/channel-specific AI behavior;
- bundled PWA/iOS surfaces that require careful, separate delivery.

Implementation must verify current branch/runtime status rather than treating
historical documentation as deployed truth.

## 16.3 Phase 0 — Reconciliation and capability proof

Deliverables:

- approve this extension and reconciliation;
- perform YCLIENTS customer/consent capability spike;
- inventory customer identity, consent, analytics and communication behavior;
- define ADR backlog and owners;
- create synthetic multi-tenant datasets;
- establish architecture conformance and privacy checklists.

Exit:

- no critical provider or legal capability is assumed;
- first implementation slices have Definition of Ready.

## 16.4 Phase 1 — Customer and consent foundation

Deliverables:

- CustomerIdentity, merge candidate/record contracts;
- backfill-safe CRM customer sync;
- Customer 360 read projection;
- ConsentRecord, SuppressionEntry and effective-state reducer;
- CommunicationEligibilityDecision;
- role-filtered customer tools and negative-path tests.

Rollout:

- shadow identity resolution;
- review merge candidates;
- compare imported counts and duplicates;
- no marketing sends.

Exit:

- CRM customers exist independently of Telegram;
- eligibility is deterministic and fail-closed.

## 16.5 Phase 2 — Business Intelligence MVP

Deliverables:

- analytical read-model foundations;
- first 20–30 Metric Registry definitions;
- composable MetricQuery and comparison;
- time intelligence and follow-up QuerySpec memory;
- Customer cadence/segment projections;
- golden metric datasets and lineage/quality output.

Rollout:

- shadow compare legacy metrics;
- preview answers for internal/limited tenants;
- report definition differences explicitly.

Exit:

- core acceptance questions work without one handler per wording;
- metric parity/intentional differences are documented.

## 16.6 Phase 3 — Maya Watch and opportunities

Deliverables:

- DetectorDefinition/Evaluation and Signal contracts;
- capacity, cancellation, cadence and data-health detectors;
- Opportunity lifecycle, deduplication and scoring;
- owner feed and feedback states;
- monitoring, false-positive metrics and kill switches.

Rollout:

- shadow detectors;
- internal preview;
- limited feed without interrupts;
- alerts only after materiality validation.

Exit:

- signals are reproducible, deduplicated and evidence-linked;
- false-positive and data-quality thresholds meet approved gates.

## 16.7 Phase 4 — Orchestrator and widgets

Deliverables:

- one channel-independent orchestration response contract;
- opportunity-assisted and proactive composition modes;
- Widget Registry and initial intelligence/opportunity/action widgets;
- owner and employee briefings;
- channel fallbacks for PWA/native/Telegram;
- accessibility and stale-state handling.

Rollout:

- keep existing channel behavior behind flags;
- route read-only flows first;
- verify parity before retiring duplicated prompts/handlers.

Exit:

- one evidence-backed response renders across target channels.

## 16.8 Phase 5 — Governed actions and outcomes

Deliverables:

- opportunity-linked ActionDraft extensions;
- task, booking and campaign preparation flows;
- audience snapshot and execution-time eligibility;
- approval UI and exact-payload hashes;
- ActionRun/outcome linkage;
- Maya Recovered confidence tiers.

Rollout:

- preview/draft only;
- limited approved actions;
- per-action kill switch and canary;
- no bounded automation yet.

Exit:

- one end-to-end opportunity becomes an approved action and measured outcome
  with no unsupported revenue claim.

## 16.9 Phase 6 — Scale and bounded automation

Possible deliverables after prior evidence:

- more detectors and vertical presets;
- additional CRM/channel adapters;
- model-assisted opportunity ranking;
- policy-bounded automation;
- tenant benchmarks under separate governance;
- optimized worker/queue topology.

Each requires its own ADR and readiness evidence.

## 16.10 Vertical-slice order

Preferred first end-to-end slice:

~~~text
cancelled appointment
  → canonical event
  → freed-capacity detector
  → opportunity
  → eligible customer cohort preview
  → approved outreach
  → booking outcome
  → conservative recovered-value observation
~~~

This slice exercises events, metrics, identity, consent, widgets, approval,
provider action and outcome without requiring the entire platform.

## 16.11 Migration mechanics

- Additive schemas until parity is proven.
- Idempotent backfills with checkpoints and reconciliation.
- Dual-read only with explicit comparison.
- No silent dual-write without conflict policy.
- Provider and canonical IDs remain mapped, never replaced in place.
- Metric definition versions coexist for historical reproducibility.
- Opportunity/detector versions remain traceable after updates.
- Feature flags support off, shadow, preview, limited and live.
- Rollback disables routing/actions without deleting new evidence.

## 16.12 Test matrix

### Domain

- identity resolution/merge invariants;
- consent effective state;
- opportunity lifecycle and dedupe;
- action approval/idempotency.

### Integration

- YCLIENTS fixtures, pagination and permission loss;
- contact masking;
- webhook replay;
- communication provider receipts.

### Analytics

- golden metrics;
- zero denominator;
- missing expenses;
- stale/partial source;
- timezone and period edges.

### AI and UI

- QuerySpec/follow-up evals;
- evidence coverage;
- unsupported causal claim rejection;
- widget schemas/fallbacks;
- stale actions and accessibility.

### Security

- cross-tenant and role matrix;
- prompt injection;
- consent race;
- audience/approval replay;
- PII and secret leakage.

### Migration and operations

- backfill reconciliation;
- shadow parity;
- canary and rollback;
- queue replay and kill switch;
- deletion/retention.

## 16.13 Delivery governance

Every implementation agent follows
[Delivery Rules](DELIVERY_RULES.md). Broad work begins with an
IMPLEMENTATION_PLAN.md or equivalent approved plan and ends with:

- changed contracts and reconciliation classification;
- exact tests/checks;
- rollout/rollback state;
- limitations and open decisions;
- owner-controlled external actions.

## 16.14 Branching and PR strategy

This documentation is intentionally stacked on the PR #21 architecture branch
so PR #21 remains unchanged and review can see only the extension.

Future implementation PRs SHOULD:

- target the branch containing accepted architecture until it is merged;
- remain narrow and independently reviewable;
- avoid combining frontend, backend and provider rollout unless the vertical
  slice requires it;
- use draft status until capability and architecture review pass.

After PR #21 merges, the extension branch can be rebased/retargeted to main
without rewriting its architectural meaning.

## 16.15 Completion definition

The extension is not “implemented” when files or screens exist. It is
implemented when:

- canonical facts are reliable and reconciled;
- metrics and signals are deterministic and evidence-backed;
- role and tenant boundaries pass negative tests;
- consent governs real communication;
- opportunities lead to safe actions;
- outcomes are measured conservatively;
- channels share one core;
- production rollout is observable and reversible.
