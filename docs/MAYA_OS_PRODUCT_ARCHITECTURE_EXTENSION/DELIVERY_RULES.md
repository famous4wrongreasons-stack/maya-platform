# Delivery Rules for Claude, Codex and Cursor

<!-- markdownlint-configure-file {"MD013": false} -->

## Intent

These rules apply to AI coding agents and human developers implementing this
extension. They supplement AGENTS.md and the implementation contract in the
base MAYA OS specification.

The first output of a broad architecture request is an implementation plan and
reconciliation, not an unreviewed repository-wide rewrite.

## Required reading order

Before implementation, the delivery agent MUST read:

1. repository AGENTS.md and tool-specific guidance such as CLAUDE.md;
2. [MAYA OS Architecture Specification](../MAYA_OS_ARCHITECTURE_SPECIFICATION.md);
3. [Reconciliation Notes](RECONCILIATION_NOTES.md);
4. the relevant chapters in this extension;
5. affected ADRs, domain contracts, runbooks and tests;
6. the current implementation and working-tree status.

No agent may infer that this extension supersedes the base specification.

## Mandatory preflight

For each requested slice, produce:

- user and business outcome;
- affected modules and contracts;
- KEEP / EXTEND / CHANGE / ADD classification;
- current behavior and target behavior;
- source of truth and provider capabilities;
- data requirements, freshness and quality thresholds;
- permission, consent, approval and idempotency policy;
- migration, feature flag, rollback and observability;
- acceptance criteria and required tests.

If a provider capability is unstable or undocumented in the repository, verify
it through an explicit spike before designing around it.

## Architecture rules

Agents MUST NOT:

- implement “MAYA OS 2.0” as a parallel core;
- copy provider schemas into the canonical domain;
- add a dedicated business function for every natural-language wording;
- place metric formulas in prompts, controllers, UI or adapters;
- let the LLM calculate money or invent tenant facts;
- accept tenant, role, permission, consent or approval authority from model
  output;
- give models arbitrary SQL, shell or generic HTTP access;
- send raw PII, credentials or confidential provider payloads to an LLM;
- convert missing data to zero;
- treat correlation, estimate or expected revenue as proven causality;
- perform mass communication without consent eligibility and approval;
- replace a booking by delete-and-create when a non-destructive update is
  required;
- remove legacy behavior before parity, rollout and rollback gates pass.

## Slice discipline

Implementation SHOULD proceed in narrow vertical slices:

~~~text
contract → deterministic domain behavior → policy → API/tool
→ structured UI result → observability → tests → rollout
~~~

Each slice has one clear owner, bounded files and a reversible release path.
Repository-wide mechanical changes require a separate, justified change.

## Definition of Ready

A slice is ready only when:

- the relevant capability exists or the spike is complete;
- canonical entities and invariants are named;
- external and internal contracts are versioned;
- role and tenant scopes are explicit;
- consent and communication purpose are explicit when applicable;
- success, partial, unavailable and forbidden states are defined;
- data lineage and freshness requirements are known;
- rollout and rollback are possible;
- acceptance tests are agreed.

## Definition of Done

A slice is complete only when:

- implementation matches the base specification and this extension;
- unrelated user changes are untouched;
- domain, contract, integration and negative-path tests pass;
- cross-tenant and role-isolation tests pass;
- metric golden tests pass when calculations change;
- consent, approval, idempotency and audit are verified where relevant;
- structured response schemas and fallback rendering are tested;
- migrations are additive or have a reviewed repair path;
- feature flag, monitoring, kill switch and rollback are documented;
- documentation and ADRs are updated;
- the final handoff names checks, limitations and remaining external actions.

## Agent-specific operating notes

### Claude / Claude Code

- Treat CLAUDE.md as repository operations guidance, not a replacement for the
  architecture.
- Return a result document for large frontend or integration packets.
- Preserve established frontend ownership and do not duplicate concurrent work.

### Codex

- Follow AGENTS.md, inspect the working tree before staging, and stage only
  intended paths.
- Prefer evidence from repository contracts and tests over assumptions.
- Use small logical commits and report exact validation performed.

### Cursor

- Apply repository rules at the workspace root.
- Do not accept broad autocomplete changes across unrelated modules.
- Review generated diffs for provider leakage, tenant omissions and duplicated
  formulas before accepting them.

These notes describe delivery behavior, not product permissions. No tool gains
runtime authority from the agent used to implement it.

## Required implementation-plan format

Every broad plan MUST contain:

1. scope and non-goals;
2. current-state evidence;
3. reconciliation table;
4. target contracts and data flow;
5. ordered implementation slices;
6. test and evaluation matrix;
7. migration and rollout;
8. risks, open decisions and owner actions.

## Pull request requirements

Documentation or implementation PRs MUST explain:

- what changed and why;
- how the change extends PR #21;
- affected chapters and contracts;
- KEEP / EXTEND / CHANGE / ADD decisions;
- user/developer impact;
- tests and checks performed;
- rollout, rollback and known limitations.

Draft PRs are preferred until architecture and external capability assumptions
are reviewed.
