# Chapter 15 — Security, Privacy, Multi-tenancy & Governance

<!-- markdownlint-configure-file {"MD013": false} -->

## 15.1 Relationship to existing security architecture

This chapter keeps all trust boundaries, permissions, AI safety, audit and
tenant isolation rules in the base specification and security documents. It
adds governance for customer identity, consent, detectors, opportunities,
widgets and proactive/automated behavior.

Security is a product foundation, not a later hardening phase.

## 15.2 Trusted context

Tenant is resolved from authenticated membership, verified host/domain,
integration binding or signed channel binding. Arbitrary tenantId from request
body, prompt, widget or tool arguments grants no access.

Every repository, cache, event, metric, signal, opportunity, audience and
action includes tenant scope.

## 15.3 Authorization decision

Access combines:

- authenticated actor or machine identity;
- active membership and role bundle;
- granular permission;
- resource ownership/location/business scope;
- plan entitlement and feature rollout;
- source capability;
- consent/communication eligibility;
- action risk and approval;
- current tenant policy.

UI visibility and prompt instructions are never enforcement.

## 15.4 Customer identity privacy

- PII is encrypted at rest and minimized in projections.
- Lookup hashes are tenant-scoped and purpose-limited.
- Cross-tenant identity matching is prohibited by default.
- Merge evidence is restricted and auditable.
- Customer self-linking requires verification.
- AI-safe context uses opaque IDs and permitted attributes.
- Derived segments and scores follow retention/deletion workflows.

## 15.5 Consent governance

Consent policies are versioned and owned. Governance covers:

- approved purpose taxonomy;
- legal-basis classification;
- required evidence and text version;
- source precedence/reconciliation;
- withdrawal propagation SLA;
- retention and proof access;
- customer controls;
- campaign/audience audit.

Unknown optional marketing consent fails closed.

## 15.6 AI boundary

Before a model call:

- redact/tokenize PII;
- minimize by role and purpose;
- mark retrieved content as untrusted;
- allowlist provider/model;
- bind allowed tools;
- enforce budget and rate;
- exclude secrets and provider credentials.

After a model call:

- validate structured output;
- authorize every tool separately;
- validate factual claims against evidence;
- reject arbitrary commands;
- preserve warnings and uncertainty.

## 15.7 Detector governance

Every detector has:

- owner and business purpose;
- versioned definition;
- required data and quality thresholds;
- rollout mode and tenant cohort;
- materiality and suppression policy;
- tests and observed false-positive rate;
- monitoring, budget and kill switch;
- review/retirement date.

Model-based detectors additionally require model documentation, backtests and
bias/impact review.

## 15.8 Opportunity and automation governance

Opportunity scores cannot determine permissions. Bounded automation requires:

- explicit action type and target scope;
- maximum audience/value/frequency/cost;
- reversible or compensating behavior;
- policy expiry;
- authorized approver;
- real-time kill switch;
- anomaly monitoring;
- periodic human review.

Critical money, payroll, permission, bulk export or destructive operations do
not become autonomous through this extension.

## 15.9 Widget and client security

- Widget schema and actions are allowlisted.
- Client-supplied payload is untrusted.
- Server reconstructs effective scope and approval payload.
- Expired/stale widgets require refresh.
- Deep links resolve through authorization.
- Sensitive values do not persist in unsafe client storage.

## 15.10 Audit layers

Separate policies govern:

- security audit;
- tool/action audit;
- consent evidence;
- communication delivery;
- AI evaluation traces;
- application logs;
- analytical outcomes.

Audit records IDs, hashes, decisions and timestamps. It avoids raw prompts,
message bodies, secrets and unnecessary PII.

## 15.11 Data lifecycle

Retention/deletion includes:

- operational PII vault;
- identities and merge evidence;
- consent and proof obligations;
- communication attempts/suppressions;
- conversation state and memory;
- metric/read-model projections;
- signals/opportunities/outcomes;
- vector indexes, caches and backups.

Immutable financial/security facts retain only policy-approved minimized data.

## 15.12 Support and platform access

Platform operators do not receive ordinary tenant data access by role alone.
Support access requires:

- documented purpose;
- least privilege and time limit;
- tenant authorization where required;
- step-up authentication;
- immutable audit;
- no silent model access to support data.

## 15.13 Threats to test

- cross-tenant IDOR through customer/opportunity/widget IDs;
- cache or dedupe key missing tenant;
- identity merge across tenants;
- prompt injection from CRM notes or knowledge documents;
- tool argument or widget action escalation;
- approval replay after audience/payload change;
- consent withdrawal race;
- bulk audience expansion;
- provider credential or raw contact leakage;
- detector poisoning through stale/partial sync;
- notification flood;
- recovered-value overclaim;
- unauthorized support access.

## 15.14 Incident and kill-switch requirements

Operators can disable:

- model/provider;
- tool or action type;
- detector/version;
- campaign delivery;
- bounded automation policy;
- tenant integration;
- channel.

Disabling must not erase evidence. Recovery includes queue review, dedupe and
reconciliation before replay.

## 15.15 Acceptance criteria

- Cross-tenant negative tests cover every new entity and cache.
- Consent withdrawal wins over queued optional communication.
- Approval hash prevents modified audience execution.
- Prompt injection cannot introduce a tool or permission.
- Detector failure cannot create an opportunity.
- Support access is time-bounded and audited.
- Deletion tests cover derived projections and indexes.
