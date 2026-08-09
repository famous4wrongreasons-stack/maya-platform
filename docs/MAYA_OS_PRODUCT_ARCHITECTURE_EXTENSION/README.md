# MAYA OS Product & Architecture Extension

<!-- markdownlint-configure-file {"MD013": false} -->

> Product doctrine, proactive intelligence, role experiences and delivery
> guidance that extend the MAYA OS Architecture Specification introduced in
> PR #21.

| Field | Value |
| --- | --- |
| Status | Draft for product and architecture review |
| Version | 0.1.0 |
| Relationship | EXTENDS; DOES NOT REPLACE |
| Base specification | [MAYA OS Architecture Specification](../MAYA_OS_ARCHITECTURE_SPECIFICATION.md) |
| Intended readers | Product owners, architects, engineers, Claude, Codex, Cursor |
| First system of record | YCLIENTS through the existing CRM adapter boundary |

## Authority and relationship

There is one MAYA OS architecture. This directory is not “MAYA OS 2.0” and
does not reset the architecture in PR #21.

The base specification remains the source for architectural laws, canonical
contracts, deterministic metrics, tool execution, tenancy, security and
migration mechanics. This extension makes the product above that foundation
more explicit:

- what Maya watches and why a customer pays for it;
- how customer identity, consent and communication eligibility work;
- how proactive signals become opportunities and governed actions;
- how owner, employee and client experiences differ;
- how authenticated identities become tenant Memberships and CRM-linked roles;
- how conversational answers render as structured widgets;
- how delivery agents must reconcile requirements before implementation.

If this extension appears to conflict with an accepted ADR or the base
specification, implementation MUST stop. The conflict is resolved in
[Reconciliation Notes](RECONCILIATION_NOTES.md) and, when normative contracts
change, through an ADR and an update to the base specification.

## Reading order

1. [Reconciliation Notes](RECONCILIATION_NOTES.md)
2. [Chapter 1 — Product Doctrine & Vision](01_PRODUCT_DOCTRINE_AND_VISION.md)
3. [Chapter 2 — System Architecture](02_SYSTEM_ARCHITECTURE.md)
4. [Chapter 3 — Canonical Business Model](03_CANONICAL_BUSINESS_MODEL.md)
5. [Chapter 4 — CRM Integration Layer & YCLIENTS](04_CRM_INTEGRATION_LAYER_AND_YCLIENTS.md)
6. [Chapter 5 — Customer Identity & Customer 360](05_CUSTOMER_IDENTITY_AND_CUSTOMER_360.md)
7. [Chapter 6 — Consent & Communication Engine](06_CONSENT_AND_COMMUNICATION_ENGINE.md)
8. [Chapter 7 — Business Intelligence Layer](07_BUSINESS_INTELLIGENCE_LAYER.md)
9. [Chapter 8 — Maya AI Orchestrator](08_MAYA_AI_ORCHESTRATOR.md)
10. [Chapter 9 — Proactive Intelligence / Maya Watch](09_PROACTIVE_INTELLIGENCE_MAYA_WATCH.md)
11. [Chapter 10 — Opportunity & Action Engine](10_OPPORTUNITY_AND_ACTION_ENGINE.md)
12. [Chapter 11 — Conversational UI & Widget System](11_CONVERSATIONAL_UI_AND_WIDGET_SYSTEM.md)
13. [Chapter 12 — Owner Experience](12_OWNER_EXPERIENCE.md)
14. [Chapter 13 — Employee Experience](13_EMPLOYEE_EXPERIENCE.md)
15. [Chapter 14 — Client Experience](14_CLIENT_EXPERIENCE.md)
16. [Chapter 15 — Security, Privacy, Multi-tenancy & Governance](15_SECURITY_PRIVACY_MULTI_TENANCY_GOVERNANCE.md)
17. [Chapter 16 — Migration, Implementation & Delivery Plan](16_MIGRATION_IMPLEMENTATION_DELIVERY_PLAN.md)
18. [Chapter 17 — Identity, Access & Membership Bootstrap](17_IDENTITY_ACCESS_AND_MEMBERSHIP_BOOTSTRAP.md)
19. [Barbershop Native Release 1 Scope](BARBERSHOP_NATIVE_RELEASE_1.md)
20. [Delivery Rules for Claude, Codex and Cursor](DELIVERY_RULES.md)

## Product thesis

CRM records what happened. Maya must understand what happened, determine
whether it matters, explain why, and help perform the next safe action.

The product loop is:

~~~text
WATCH → UNDERSTAND → ASK → ACT → MEASURE → LEARN
~~~

Maya is therefore a system of intelligence and governed action above systems
of record. It may expose calendars, reports, booking and communication
surfaces, but it must not become a clone of every connected CRM.

## Scope boundaries

This set specifies target product and architecture behavior. It does not:

- authorize a big-bang rewrite;
- claim that every described provider capability already exists;
- enable write operations merely because a document names them;
- replace current runbooks, acceptance evidence or operational controls;
- change live YCLIENTS, Telegram, PWA, iOS or production behavior by itself.

The current implementation focus is the native iOS barbershop pilot described
in [Barbershop Native Release 1 Scope](BARBERSHOP_NATIVE_RELEASE_1.md). That
delivery decision does not redefine the channel-independent target
architecture and does not authorize PWA changes.

Every implementation slice remains subject to capability verification,
permission checks, consent, feature flags, audit, canary rollout and rollback.

## Change policy

Changes to this extension MUST:

1. name the affected chapters;
2. state KEEP, EXTEND, CHANGE or ADD impact;
3. link any changed base contract or ADR;
4. include migration and backward-compatibility notes;
5. add acceptance criteria and verification evidence;
6. update this index when files are added, renamed or retired.
