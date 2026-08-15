# Capability Matrix

`datasets/conversation-intelligence/capability-matrix.json` is generated from
the canonical taxonomy and the production AI tool catalog. Do not edit the
generated JSON by hand.

Current generated totals:

- 85 contract-ready intents;
- 0 partial intents;
- 0 planned intents;
- 85 intents across 33 domains;
- 49 registered server tools.

Each row includes roles, permission, required and optional slots, data class,
risk, response and clarification rules, candidate tools, registered tool risk,
approval policy, feature requirements and fallback policy.

## What `ready` means

`ready` means that MAYA has a defined routing contract and either a registered
tenant-scoped tool or an explicitly language-only response path. It does not
permit the model to invent data that the CRM provider did not return.

Provider-dependent boundaries remain explicit in tool output:

- group booking returns verified candidate slots but never claims an atomic
  multi-person booking;
- inactive and at-risk analysis exposes aggregate cohorts, while recipient
  identities stay outside the model;
- late-cancellation risk is unavailable when YClients does not provide a
  cancellation timestamp;
- employee and service revenue use only confirmed financial attribution and
  report coverage when some transactions cannot be linked safely;
- branch comparison excludes company-wide cash that cannot be attributed to a
  branch;
- campaign execution is limited to active MAYA accounts with current marketing
  consent, requires owner confirmation and is idempotent;
- catalog, referral and review tools are feature-gated add-ons;
- review text is encrypted at rest and only safe metadata and aggregates reach
  the model.

## Safety contract

- Tenant scope is injected by the server and rejected when supplied by the
  model.
- Write tools require the configured RBAC permission and confirmation policy.
- CRM money, people and schedule facts are deterministic tool results, not LLM
  estimates.
- A missing provider field produces `partial` or `unavailable` data, never a
  guessed value.
- Campaigns and recovery attribution retain idempotency and delivery history.

Regenerate and validate after any taxonomy or tool-catalog change:

```bash
npm run ci:dataset:generate
npm run ci:dataset:validate
```
