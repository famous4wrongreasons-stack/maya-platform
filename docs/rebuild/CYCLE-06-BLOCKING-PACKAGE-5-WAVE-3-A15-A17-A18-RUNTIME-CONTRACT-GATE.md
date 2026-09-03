# CYCLE 06 — PACKAGE 5 WAVE 3 A15/A17/A18 RUNTIME CONTRACT GATE

Status: **PASS — exact authority contracts fixed; common schema sufficient**

Date: `2026-09-03`

## Scope derived from the approved implementation plan

The post-Wave-2 checkpoint fixes Wave 3 as exactly `A15, A17, A18`.
Production code and D1-A/D2-A resolve that scope to eight governed actions:

| Family | Canonical action class               | Authority / target                                                           |
| ------ | ------------------------------------ | ---------------------------------------------------------------------------- |
| A15    | `update_external_staff_schedule_day` | AC2; exact provider-qualified Staff + branch + local day + expected revision |
| A17    | `install_or_replace_crm_credentials` | AC1; owner; one tenant CRM secret/version boundary                           |
| A17    | `activate_crm_integration`           | AC1 after authoritative read-only provider verification                      |
| A17    | `confirm_crm_import`                 | AC1 owner confirmation of one bounded provider snapshot                      |
| A17    | `disconnect_crm_integration`         | AC1 local atomic credential removal and derived-access revocation            |
| A18    | `update_client_profile`              | AC1; exact linked Client self-authority                                      |
| A18    | `record_client_consent`              | AC1; exact Client; append-only decision fact                                 |
| A18    | `update_client_notes`                | AC1; staff policy; encrypted notes for one exact Client                      |

`recheck_crm_integration`, CRM team/customer observations and provider identity
mirrors are AC4 source observations plus AC5 deterministic projections. They
are not fabricated as human business actions. Service/staff lists in the CRM
preview are read-only. The production import projection receives
`team.slice(0, 50)`, so `50` is the existing exact team-child bound rather
than a newly invented policy. Tenant presentation refresh remains a derived
projection and does not make the import action a hidden tenant-config owner.

## Current production owners and bypass inventory

Before the future Wave 3 cutover, three production-reachable owner groups and
eight governed direct-mutation subgroups remain:

1. A15: approved AI/UI schedule requests ultimately reach
   `AiToolHandlerService → CrmService → provider adapter`, where the provider
   adapter owns the staff-day write.
2. A17: CRM/admin controller paths call `CrmService` credential install,
   activation, import confirmation/projection and disconnect mutations.
3. A18: `CustomersService` directly upserts profile/consent timestamp
   projections and encrypted notes.

The new proof-ready Wave 3 service is deliberately not attached to
`AppModule`; no owner is switched by this safe local cycle. The ratchet names
the current owners and exact AC4/AC5 exclusions, rather than excluding whole
directories.

## Canonical identity, authority and concurrency

Every governed action derives tenant, active membership, exact target,
current target hash, generation, policy and authority on the server. One
action has one target; bulk mutation is forbidden.

- A15 identity includes tenant, provider-qualified Staff link, branch, local
  day, expected provider revision and normalized slot hash. A stale revision
  fails closed.
- All four A17 commands share the exact tenant CRM target and contiguous
  generations. Credential material remains transient/encrypted; only its
  fingerprint is admitted to ActionExecution input. Owner authority is
  revalidated before mutation.
- A18 identity uses tenant-qualified immutable Client id, mutation kind and
  generation. Phone/email are never identity. Self fields require the exact
  linked Client account; staff notes require staff policy. Active P02/P03
  holds fail closed.

Local actions take an exact-target advisory lock, revalidate current facts,
and commit domain state, ActionTargetMutation, attempt and outcome in one
serializable transaction. Retry/restart returns the same execution. A
concurrent duplicate has one winner; stale competing generations fail closed.

## Provider and outcome boundaries

A15 is the only provider write. A request identity is derived before dispatch.
Timeout or connection loss after possible dispatch is `UNKNOWN`, never
`FAILED`; blind redispatch is forbidden. Reconciliation rereads the exact
provider staff/day and proves succeeded, not executed, or still unknown.

A17 provider operations in current scope are reads. Verification and import
read failures fail closed before local mutation and do not invent `UNKNOWN`.
The remaining A17/A18 operations are PostgreSQL-local; commit/rollback is the
complete outcome.

## D1-A CRM lifecycle

Credential install, verified activation, bounded import confirmation and
disconnect are separate capabilities. Retrying one never replays an earlier
capability. Import admits no more than the production-established 50 team
children and rejects duplicate/non-digest child identities. Disconnect removes
the encrypted credential and integration in the same local transaction that
unlinks provider staff identities, disables non-owner derived access and
revokes affected sessions.

## D2-A Client ownership and schema verdict

The common Package 5 foundation already applied the A18 unique schema:

- nullable-for-history, Client-owned `CustomerProfile.clientId` with optional
  User actor;
- append-only tenant-qualified `ClientConsentFact`;
- governed execution validation and `ActionTargetMutation`.

No fake profile/consent history is needed. `CrmIntegration`, Staff/provider
links, Client/CRM links and ActionAttempt cover the remaining durable facts.
No family-specific migration is required.

`PACKAGE 5 WAVE 3 RUNTIME CONTRACT GATE: PASS`

`WAVE 3 FAMILIES: A15, A17, A18`

`WAVE 3 EXACT ACTION CLASSES: 8`

`AUTHORITY CLASSES: AC1 + AC2; exact AC4/AC5 boundaries preserved`

`PRODUCTION BYPASS GROUPS: 3`

`DIRECT-MUTATION SUBGROUPS: 8`

`CANONICAL SCHEMA SUFFICIENT: YES`

`ADDITIONAL SCHEMA REQUIRED: NO`

`SCHEMA FOUNDATION/APPLY: ALREADY APPLIED IN PACKAGE 5 COMMON FOUNDATION`

`UNKNOWN/RECONCILIATION: REQUIRED ONLY FOR A15 PROVIDER WRITE; COMPLETE`

`PRODUCTION RUNTIME CUTOVER: NO`

`REAL PRODUCTION BUSINESS/PROVIDER MUTATIONS: 0`

`CHAPTER 7 STARTED: NO`
