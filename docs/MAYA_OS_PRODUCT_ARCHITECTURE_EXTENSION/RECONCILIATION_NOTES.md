# Reconciliation Notes

<!-- markdownlint-configure-file {"MD013": false} -->

## Purpose

These notes reconcile this product and architecture extension with the existing
MAYA documentation. They prevent the new product doctrine from being treated
as a replacement architecture or as permission for destructive refactoring.

## Sources reviewed

The reconciliation was performed against:

- [MAYA OS Architecture Specification](../MAYA_OS_ARCHITECTURE_SPECIFICATION.md);
- [Architecture overview](../architecture/README.md);
- [Target Architecture](../architecture/target-architecture.md);
- [Module Boundaries](../architecture/module-boundaries.md);
- [Current State Audit](../architecture/current-state-audit.md);
- [Data Model](../architecture/data-model.md);
- [CRM Integration Architecture](../architecture/crm-integration.md);
- [Maya AI Core](../architecture/ai-core.md);
- [Security and Permissions](../architecture/security-and-permissions.md);
- [Migration Plan](../architecture/migration-plan.md);
- [Domain Model](../domain/domain-model.md);
- [Analytics Definitions](../domain/analytics-definitions.md);
- [Permissions](../domain/permissions.md);
- [Product overview](../product/README.md);
- [Security Model](../security/security-model.md);
- [Test Strategy](../testing/test-strategy.md);
- the legacy architecture map in [ARCHITECTURE.md](../../ARCHITECTURE.md).

## Decision vocabulary

| Decision | Meaning |
| --- | --- |
| KEEP | Existing architecture remains valid and is reused without conceptual replacement. |
| EXTEND | Existing contract remains authoritative but receives new fields, flows or product responsibilities. |
| CHANGE | Target behavior changes; migration must preserve compatibility until parity and rollout gates pass. |
| ADD | A new first-class product or architecture concept is introduced. |

CHANGE never means deleting current production behavior immediately. It means
the target state differs and must be reached through the migration rules in the
base specification.

## Summary matrix

| Area | Decision | Reconciled outcome |
| --- | --- | --- |
| MAYA OS and Maya Brain | KEEP | Maya Brain remains a subsystem of the wider operating platform. |
| Modular monolith and strangler migration | KEEP | New work is additive, feature-flagged and reversible. |
| Canonical business model and MBL | KEEP + EXTEND | Reuse canonical entities; deepen CustomerIdentity, consent, opportunity and communication semantics. |
| CRM adapters | KEEP + EXTEND | Preserve provider isolation and capability manifests; expand read models and sync requirements. |
| YCLIENTS source-of-truth semantics | KEEP | No provider payload or identifier becomes the core domain. |
| Universal Metrics Engine | KEEP + EXTEND | Add decision-oriented analysis, opportunity inputs and outcome attribution. |
| Query Understanding, Planner and Tools | KEEP + EXTEND | Add proactive triggers and widget response contracts without bypassing deterministic engines. |
| Action and approval lifecycle | KEEP + EXTEND | Opportunity resolution and communication execution use the existing governed action model. |
| Customer identity | EXTEND + ADD | Customer no longer depends on Telegram; Customer 360 and identity evidence become explicit. |
| Consent and communication | ADD | Introduce purpose/channel consent, eligibility decisions, suppression and evidence. |
| Dashboards | CHANGE | Dashboards become supporting surfaces; conversational and proactive experiences become primary. |
| Telegram | CHANGE | Telegram remains a channel adapter, not the definition of a customer or the only experience. |
| Employee experience | CHANGE + EXTEND | Move from role-specific hardcoded handlers toward capability profiles and widgets. |
| Proactive intelligence | ADD | Maya Watch detects business-relevant conditions before a user asks. |
| Opportunity model | ADD | Signals become deduplicated, prioritized, explainable opportunities with measurable outcomes. |
| Maya Recovered | ADD | Conservative attribution reports recovered value without claiming unsupported causality. |
| Security and tenancy | KEEP + EXTEND | Existing trust boundaries remain; consent, audience expansion and support access receive additional governance. |

## KEEP

The following foundations from PR #21 remain authoritative:

- provider-independent canonical IDs and source references;
- tenant-owned entities, trusted TenantContext and server-side authorization;
- modular monolith first and application-service module boundaries;
- external CRM systems as systems of record where configured;
- adapter capability discovery, idempotent sync and reconciliation;
- deterministic, versioned metric definitions with lineage and data quality;
- explicit separation of fact, estimate, hypothesis and recommendation;
- QUE, bounded planning, typed tools and structured stable errors;
- action drafts, approval payload hashes, idempotency and audit;
- memory scopes, retention and PII minimization;
- PostgreSQL, outbox events and materialized analytical read models;
- feature flags, shadow/preview/limited/live rollout modes;
- non-destructive appointment rescheduling;
- human approval for risky, financial, destructive or bulk actions.

## EXTEND

Existing foundations are extended as follows:

- Customer gains multiple communication identities, merge evidence, source
  confidence and a role-filtered Customer 360 projection.
- Consent becomes a versioned registry with purpose, channel, legal basis,
  evidence, scope, expiry, withdrawal and suppression.
- Metrics feed proactive detectors and opportunity scoring while remaining
  deterministic and versioned.
- The event and outbox model gains detector evaluations, opportunity lifecycle
  events and outcome windows.
- The AI response contract gains structured widgets, actions, evidence,
  freshness and rendering fallbacks.
- The action lifecycle gains audience snapshots, communication eligibility,
  expected-value ranges and conservative attribution.
- Capability profiles become explicit owner, employee and client experiences
  over one orchestrator.
- Governance adds detector versioning, policy simulation, model/tool budgets and
  kill switches for proactive or automated flows.

## CHANGE

The following target-state changes require compatibility migration:

1. Customer existence MUST NOT depend on Telegram registration. Telegram
   binding becomes one identity among several.
2. The primary product experience shifts from dashboards and menu navigation to
   proactive feed plus conversation, while retaining visual surfaces where they
   are faster.
3. Analytics formulas scattered across legacy Python or handlers migrate into
   the Universal Metrics Engine only after parity tests.
4. Role equality and prompt-only rules migrate to backend permissions and
   policy checks.
5. Channel-specific brains migrate toward one orchestrator with channel
   adapters and role capability profiles.
6. Direct live-CRM analytics migrate to canonical facts/read models with visible
   freshness and reconciliation gaps.

These changes do not authorize removal of current code until replacement
behavior has passed shadow comparison, canary rollout and rollback windows.

## ADD

The extension introduces these first-class concepts:

- CustomerIdentity and Customer 360;
- ConsentRecord, SuppressionEntry and CommunicationEligibilityDecision;
- Maya Watch detectors and signal lifecycle;
- Opportunity, OpportunityEvidence and OpportunityScore;
- proactive owner briefing and prioritized opportunity feed;
- widget schemas and channel rendering policies;
- Maya Recovered attribution with conservative confidence;
- explicit owner, employee and client experience contracts;
- delivery rules shared by Claude, Codex, Cursor and human developers.

## Current implementation constraints

The existing production Python/SQLite contour remains live and single-business.
The NestJS/PostgreSQL platform is the target multi-tenant strangler. Therefore:

- do not copy global IDs or credentials into platform contracts;
- do not trust the local SQLite database as production truth;
- do not bypass the existing YCLIENTS adapter semantics;
- do not rewrite the bundled PWA as part of backend foundation work;
- do not activate planned CRM providers based only on enum or scaffolding;
- do not mark proactive features live before data freshness and quality gates
  exist.

## Open decisions requiring ADR or spike

- exact YCLIENTS customer-list, consent and webhook coverage for the current
  application credentials;
- authoritative consent source when CRM and Maya both hold evidence;
- identity merge thresholds and human-review workflow;
- initial detector DSL and scheduling/event strategy;
- opportunity scoring weights and tenant customization limits;
- Maya Recovered attribution method and reporting confidence levels;
- widget schema versioning and native/PWA/Telegram capability matrix;
- bounded automation policy above A3 approval-based execution.

Until resolved, these remain Proposed or TBD and MUST NOT be silently fixed in
implementation code.
