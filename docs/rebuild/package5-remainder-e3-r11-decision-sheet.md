# R11 — governed tenant configuration and personal staff mute Decision Sheet

**PROPOSAL — NOT APPROVED. E3 Stage 1; documentation only.** Baseline `60e82664`, production runtime `42962475` after accepted Wave R-B. Scope is fixed by the [complete master inventory](CYCLE-06-BLOCKING-PACKAGE-5-EXHAUSTIVE-REMAINDER-INVENTORY-COMPLETE.md) and its [machine-readable package definitions](evidence/package5-remainder-inventory-final.json). No new discovery, runtime/schema/test implementation, DB access, production call or deployment occurred in this assessment. B36 remains applied schema / runtime not deployed, with its two known proof defects unchanged.

Counts below are **new persisted database columns, including columns in new models**. Prisma virtual relation properties are listed separately and are not counted as columns. New action totals include separately named AE and AC6 classes. Contract/enum additions to an existing class are explicit proposals, not implicit approval. Option B counts are all zero and require no migration/backfill; it retires the package's legacy behavior instead of preserving it.

## Options and recommendation

| Option | Contract | New models / DB columns / action classes | What user/business loses |
| --- | --- | --- | --- |
| **A — RECOMMENDED** | One A22 governed configuration family, with separate tenant revision and personal membership-preference boundaries. | **1 / 12 / 3**: 2 AE + 1 AC6 | Founder-wide changes cease to affect unrelated tenants; raw native writes and silent global provider fallback stop. Each tenant needs explicit current configuration; staff mute is Telegram-only and at most 24 hours. |
| B | Retire deterministic rule/capability/provider-changing commands and native mute; retain only existing canonical settings/read surfaces. | **0 / 0 / 0** | Business guidance cannot be maintained through these commands, tenant provider/capability switches are unavailable, and staff cannot temporarily mute these notifications through `/mute`. |

**WHY A:** `DashboardPreference` is already a tenant/User membership projection, while no current canonical row owns the tenant-wide business-rule snapshot. One append-only tenant revision model supplies that missing ownership; existing preference storage and ActionTargetMutation generations suffice for personal mute. `AiMemoryFact` is personal memory and cannot become a tenant policy owner. No second config executor is proposed: A22 and Action Engine own admission, policy, generation, mutation and outcome.

## Exact contract proposed for approval

**Tenant authority.** Only current active `tenant_owner` or `business_owner`, with active exact tenant access and the existing A22 action-specific policy gate, may confirm a tenant revision. A platform/founder projection, raw Telegram ID or prior membership is insufficient. New action `update_tenant_business_configuration` accepts one allowlisted namespace and one complete versioned snapshot at a time, with expected predecessor generation and immutable caller identity. The same revision applies to current tenant AI reads only; no read-time DB write or projection fallback.

- `business_rules`: bounded ordered list of at most 40 entries, each 8..500 characters, existing PII/security-override restrictions retained. Stable server-issued rule IDs, NFC text and deterministic whitespace normalization; add/remove is a new complete revision. It is business guidance, never an authorization or system-policy override.
- `client_capabilities`: v1 has only existing `client_self_visit_history: boolean`, still restricted to verified own-data reads. Turning it on cannot grant another Client's history or bypass feature/consent/policy. New entries require a later explicit allowlist decision.
- `staff_ai_provider`: only `claude` or `openai` already supported by the server. Provider availability is checked against the platform-controlled deployment catalogue. This setting chooses a provider; it stores no API key, token, endpoint, model override, global configuration or billing credential. Selecting an unavailable provider fails closed; it never falls through to a different global value. Global provider/API credentials remain under the existing platform operations/security owner and are not editable through this package's native commands. No new platform/global authority is granted by a tenant row.

**Personal authority.** New A22 action `update_staff_notification_preferences` writes only the requesting active staff member's `DashboardPreference`, exact `(tenantId,userId,section='staff_notifications')`. V1 JSON is `{schema_version:1,membershipId,telegramMutedUntil:<UTC instant|null>}`. Membership ID prevents a replaced membership from inheriting stale suppression. `/mute` proposes 120 minutes by default; exact integer duration 1..1440 minutes, `/mute off` proposes null. Admission fixes the absolute UTC instant; retry never extends it. No one mutes another member or the whole tenant. Expiry is a pure comparison, not a scheduled mutation. Missing preferences mean no personal mute; unreadable/invalid applicable preferences fail delivery eligibility closed, rather than authorizing a send.

Mute applies only to **non-mandatory staff Telegram operational notifications**. Current source explicitly keeps Web Push independent of Telegram mute; Inbox, APNS/Web Push, Client preferences and tenant appointment-notification settings remain distinct. Only authentication/security kinds explicitly exempted in the canonical versioned delivery-policy registry are outside this preference. No caller-supplied `essential`/`mandatory` flag, owner opt-in or confirmation can exempt an arbitrary message; no other exemption is proposed. Delivery owners consult the canonical preference during eligibility and immediately before a not-yet-dispatched Telegram effect. A later mute/revocation can suppress that pending slot; it cannot reopen a terminal slot, retry UNKNOWN, select a different route or enlarge a frozen plan. R05/R06/R12 and R13 weekly expense reminders must integrate this eligibility boundary at their package-local proof/cutover; this is a shared integration checkpoint, not a newly invented master dependency.

**Defaults and history.** No current global SQLite rule/provider value is copied into every tenant. Missing tenant rule state is an explicit empty v1 baseline; client history capability is off until an explicit owner revision; tenant-specific AI advice that requires a provider selection is unavailable until that selection exists. These are deliberate conservative defaults requiring this approval, not a claim that current global settings were tenant-confirmed. Personal old mute rows never become current authority. Retired global values may remain a labelled read-only archive, inaccessible to runtime policy resolution. Existing unrelated platform provider defaults are not rewritten.

**Idempotency, revisions, crashes.** Identity is exact tenant + actor + action + caller UUID, using existing ActionExecution `idempotencyScope`/`requestIdempotencyKeyHash` and their unique tenant index. Compare the trusted normalized intent before replay: same identity/same intent returns the same execution; changed content, duration, namespace or predecessor is `IDEMPOTENCY_CONFLICT`. Do not use the B31 Client-qualified alias table for staff actions. Two first requests have one unique winner; two different keys against the same expected generation have one committed successor and one explicit stale-version conflict. Tenant namespace/target locking, row insertion or preference update, ActionTargetMutation, audit and execution success commit in the existing canonical transaction. A missing/lost wrapper response resumes that exact execution through R10 receipts; no fresh key, time or revision. Local config mutation has no provider UNKNOWN; an ambiguous DB commit is resolved by reading the same execution, not by changing provider or repeating a different business outcome. Namespace updates are individual confirmed actions, not an implicit multi-namespace atomic batch.

**Stable normalization on replay.** Look up the existing AE by caller identity before generating rule IDs, resolving a relative duration, or reading a newer current configuration. Its trusted normalized input contains the bounded semantic caller command and the originally admitted full snapshot/absolute instant. Compare a retry against that stored semantic command, then restore the stored result of normalization; do not turn `mute 120 minutes` into a later instant. New rule IDs derive deterministically from tenant, namespace, actor, stable caller UUID and canonical entry position; no random new ID on retry. Existing rule IDs and expected predecessor are preserved. A changed command/duration/predecessor conflicts; the clock passing or the target subsequently changing does not change the admitted retry. This uses existing encrypted AE input storage, not new fields or raw request metadata.

**Fingerprint.** Domain-prefixed SHA-256 over a specified typed, canonical UTF-8 encoding: contract version; exact tenant and actor; namespace/personal target and current membership; expected generation/predecessor; complete normalized snapshot or fixed absolute mute instant. Rules preserve semantic ordering; object keys, booleans and nulls have fixed encoding; Unicode and durations normalize before hashing. No raw JSON stringify contract, request timestamp, trace ID, chat ID, delivery metadata or credential. Existing ActionExecution stores full intent/approval evidence; contentHash is the immutable configuration-content digest, not a second outcome.

## Exact schema mapping — Option A

**New model `TenantBusinessConfigurationRevision` — 12 persisted columns.**

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `String / text` | UUID primary key |
| `tenantId` | `String / text` | Exact canonical tenant |
| `namespace` | `String / text` | business_rules \| client_capabilities \| staff_ai_provider |
| `revision` | `Int / integer` | Starts at 1; exact predecessor +1 |
| `previousRevisionId` | `String? / text` | Null only at revision 1 |
| `actionExecutionId` | `String / text` | Exact successful A22 execution |
| `actorUserId` | `String / text` | Canonical actor snapshot, checked against membership and execution |
| `actorMembershipId` | `String / text` | Exact membership ID at admission |
| `contractVersion` | `Int / integer` | 1; immutable normalization/policy schema |
| `contentHash` | `String / char(64)` | SHA-256 of typed canonical namespace content |
| `encryptedContent` | `String? / text` | Whole bounded configuration snapshot; null only after governed retention |
| `createdAt` | `DateTime / timestamptz` | Server commit time |

**Total: 1 new models; 12 new DB columns.** New Prisma virtual relations (8, zero columns): `TenantBusinessConfigurationRevision.tenant`, `Tenant.businessConfigurationRevisions`, `TenantBusinessConfigurationRevision.actorMembership`, `Membership.businessConfigurationRevisions`, `TenantBusinessConfigurationRevision.execution`, `ActionExecution.businessConfigurationRevision`, `TenantBusinessConfigurationRevision.previousRevision`, `TenantBusinessConfigurationRevision.nextRevisions`.

Constraints: unique `(id,tenantId)`, `(tenantId,namespace,revision)`, `(tenantId,actionExecutionId)`; predecessor FK `(previousRevisionId,tenantId)` plus exact same namespace and predecessor+1 checks. Add `Membership @@unique([id,tenantId])` as a constraint only, to FK the exact admitted membership; this shared constraint is applied once if another E3 package also needs it. Tenant/Membership/ActionExecution FKs use RESTRICT. Check the stored actor matches that membership and execution. An append-only SQL guard rejects overwrite/delete and cross-tenant or false predecessor links; only the proposed bounded retention action may clear ciphertext. The current revision is obtained by exact tenant/namespace revision index, not a second mutable pointer. Personal config adds no DashboardPreference columns and keeps its existing composite Membership relation; mutation generation/receipt remain in existing ActionTargetMutation/ActionExecution.

**Retention/lifecycle.** Proposed AC6 class `purge_superseded_business_configuration_payloads` may clear only encrypted content of a superseded revision at least 365 days old, with no live execution/reconciliation reference, under versioned policy v1. It may not clear the current revision, change hashes/ownership/version, or delete rows. Audit/idempotency tombstones remain; no automatic audit-row deletion is authorized. Personal preference lifecycle stays with the existing membership/preference owner, with pure read expiry. This is an explicit new AC6 allowlist extension, not a use of the existing six auth/quarantine classes.

**Migration/backfill.** Create the one model, exact FKs/uniques/immutability guard and shared membership constraint; no new columns in existing models. **Migration YES; backfill NO.** No fabricated tenant bindings, actor approvals or historical version-1 fingerprints. Future legacy archive conversion would require new provable owner-confirmed intent, not migration inference.

## Acceptance and permanent ratchet

Required local proof after approval: exact owner/current membership/tenant checks; founder-only/raw ID denied; one tenant cannot read/write another namespace; tenant guidance cannot grant authorization; secrets/global keys/unlisted capabilities rejected; personal mute cannot target another staff member; expiry and retry do not extend duration; changed/concurrent keys and stale-generation race; DB restart/ambiguous commit returns same action; revoked membership blocks pending delivery; mute does not change frozen routes or UNKNOWN behavior; history/defaults fail as specified. Then canonical A22/A16, R02/R10 and applicable delivery-eligibility regressions.

Permanent executable AST/call-graph ratchet must cover deterministic founder handlers in both chat and stream, `/ai_provider`, `/mute`, database helper aliases, `maya_capabilities`, `masters_ai`, business-rule readers and delivery mute readers. Direct SQLite settings/rule/mute writes or legacy authority/fallback must fail. Only the A22 executor and precisely scoped AC6 leaf may mutate the new owner. Negative fixtures mutate actual producer bodies: an aliased writer before delegation, a second write after successful delegation, raw founder bypass, personal-to-tenant escalation, and post-UNKNOWN fallback. Marker-only scans are insufficient.

## Evidence and assessment

This assessment uses accepted local source captures, not a new production scan. R-B verification: [production proof](evidence/package5-wave-rb-production-proof.json). Exact per-file hashes and source-view distinction are in [package assessment](evidence/package5-remainder-e3-r11-assessment.json). Current R02 principal checks are acknowledged; legacy raw-principal descriptions in old inventory are not claimed to be unchanged. The remaining owner/write gap is still the same inventoried blocker.

- Captured production `webhook_server.py:6509` — _founder_learning_reply: direct global rule add/deactivate/list.
- Captured production `webhook_server.py:6608` — _founder_permission_reply: global capability setter.
- Captured production `bot.py:1385` — R02 guarded /ai_provider still calls global provider setter.
- Captured production `bot.py:1633` — R02 master projection still writes legacy mute.
- Captured production `database.py:1744` — mute_master/unmute_master/is_master_muted legacy persistent authority.
- Captured production `database.py:4085` — salon_rules writer and unscoped readers.
- Captured production `masters_ai.py:47` — global provider setting read/write.
- Captured production `maya_capabilities.py:76` — global capability setting writer.
- Repository `ai администратор/webhook_server.py:823` — Existing mute scope is Telegram; Web Push remains independent.
- Repository `maya-saas-backend/src/package5-wave1/package5-wave1.service.ts:235` — Existing assistant preference planner; no generic approved business-rule contract.
- Repository `maya-saas-backend/src/package5-wave1/package5-wave1.service.ts:946` — Canonical setting executor and state/generation checks.
- Repository `maya-saas-backend/prisma/schema.prisma:553` — ActionTargetMutation generations.
- Repository `maya-saas-backend/prisma/schema.prisma:768` — Personal tenant/User DashboardPreference.

```text
PACKAGE: R11
BLOCKERS INCLUDED: [B51, B59]
CANONICAL OWNER: A22 governed configuration owner with distinct tenant-rule and personal staff-preference scopes
RECOMMENDED OPTION: A
EXISTING FOUNDATION SUFFICIENT: NO
BUSINESS DECISION REQUIRED: YES
SCHEMA REQUIRED: YES
NEW MODELS: 1
NEW FIELDS: 12
NEW ACTION CLASSES: 3 (2 AE + 1 AC6)
MIGRATION REQUIRED: YES
BACKFILL REQUIRED: NO
RUNTIME-ONLY: NO
TECHNICAL PREREQUISITES SATISFIED: YES (R02 production PASS; existing AE/owner primitives available)
DEPENDENCIES SATISFIED: NO (the package's explicit owner/schema approval is pending)
IMPLEMENTATION READY AFTER APPROVAL: YES
IMPLEMENTATION STARTED: NO
PRODUCTION READY: NO
PRODUCTION MUTATIONS/MESSAGES: 0
DATABASE CONNECTIONS: 0
PROCESS HYGIENE: 0
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
```
