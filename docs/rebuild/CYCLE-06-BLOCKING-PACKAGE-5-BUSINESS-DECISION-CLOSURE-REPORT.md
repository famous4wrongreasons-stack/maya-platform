# CYCLE 06 — BLOCKING PACKAGE 5 BUSINESS DECISION CLOSURE

Status: **COMPLETE — D1-A through D7-A approved**

Accepted checkpoint: `ca436f5b`

Report date: 2026-09-03

## Approved decisions

- D1-A: CRM connection, verification, import and disconnect remain separate
  bounded capabilities.
- D2-A: `CustomerProfile` and `ClientConsentFact` are owned by canonical
  `Client`; a Maya User/account is optional and may identify an actor.
- D3-A: `TrialActivation` owns the one-time bootstrap claim; Package 5 tenant
  hard delete is forbidden.
- D4-A: normal inventory/catalog removal is archive/hide, not physical delete.
- D5-A: service, schedule and price configuration changes are prospective;
  accepted appointment conditions are preserved.
- D6-A: attribution may be corrected from later authoritative evidence while
  source evidence remains immutable.
- D7-A: retention policy is central, versioned and allowlisted. Future tenant
  or legal overrides require a separately approved contract and are outside
  the current Package 5 / Chapter 6 scope.

## Schema decision

The approved choices leave the common minimum foundation unchanged:

- `ActionTargetMutation`;
- `OperationalWorkItem`;
- `ClientConsentFact`;
- `MaintenanceRun`;
- `MaintenanceItemClaim`;
- the Client-owned `CustomerProfile` compatibility extension.

No speculative future policy, provider workflow, tenant hard-delete receipt,
calendar version system or attribution revision aggregate is authorized.

`PACKAGE 5 BUSINESS DECISION CLOSURE: COMPLETE`

`BUSINESS DECISIONS APPROVED: 7/7`

`COMMON FOUNDATION STABLE: YES`

`COMMON FOUNDATION APPROVAL READY: YES`

`MINIMUM NEW MODELS/FIELDS UNCHANGED: YES`

`PRODUCTION MUTATIONS: 0`

`CHAPTER 7 STARTED: NO`
