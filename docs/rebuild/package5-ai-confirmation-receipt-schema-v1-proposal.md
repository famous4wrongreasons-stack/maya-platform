# Package 5 — AI confirmation receipt schema V1 proposal

Status: **APPROVED — exact D1 V1 approved after checkpoint 35dd890e; foundation cycle in progress**

Source checkpoint: `d9799b2a`. Companion assessment:
`CYCLE-06-BLOCKING-PACKAGE-5-AI-CONFIRM-CONTRACT-STOP-REPORT.md`.

## Purpose and scope

Persist the exact approved draft revision and complete command material before
the first side effect. Reuse `AiOnboardingDraft` as the protocol aggregate,
`TrialActivation` as the only tenant creation authority, and the existing
ActionExecution/ActionTargetMutation pair for each canonical child. No new
action class, parent ActionExecution, general workflow engine or child-result
table is proposed.

## Minimal additive fields

Add exactly these three fields to `AiOnboardingDraft`:

| Field | Type | Meaning |
| --- | --- | --- |
| `revision` | `Int @default(0)` | Increment on every editable draft mutation. Zero denotes an existing/unversioned starting point, not historical approval. |
| `confirmationReceiptJson` | `Json?` | Closed V1 immutable receipt with non-PII identities, hashes and bounded child manifest. |
| `confirmationMaterialEncrypted` | `String?` | Existing encryption foundation's authenticated ciphertext for the normalized bootstrap/child material needed after restart. |

No backfill of approval, authority, successful outcomes or historical manifest.
Both nullable fields are null for legacy records. No rename or reinterpretation
of the mutable `blueprintJson` or last-message `inputDigest` as an audit journal.

### Closed receipt V1

Exact top-level keys:

`contract`, `policyVersion`, `draftRevision`, `draftSnapshotHash`,
`trialActivationId`, `expectedTenantId`, `ownerUserId`, `authorityHash`,
`intentHash`, `manifestHash`, `confirmationId`, `approvedAt`, `children`.

- `contract = package5.ai-draft-confirmation/1`, `policyVersion = 1`.
- All values are server-derived after validating the draft/activation claim.
  Receipt's activation id equals the aggregate's activation reference.
- Expected tenant/owner ids use the existing canonical bootstrap derivation;
  they are reservations, not claims that a tenant or membership already exists.
- `authorityHash` binds the exact draft claim, activation claim and reserved
  bootstrap owner. No consumer-supplied tenant or actor can replace it.
- `intentHash` covers the complete normalized owner, team, blueprint and child
  intent using the existing keyed fingerprint foundation for private material.
- `confirmationId` is a versioned hash of draft id/revision, reserved tenant,
  authority and intent. One frozen receipt per draft prevents competing runs.
- `approvedAt` uses server time. Both bearer claims must still satisfy their
  existing expiry rules at first claim; this proposal adds no TTL policy.
- `children` is an ordered array of exactly shaped descriptors:
  `key`, `family`, `actionClass`, `sourceIntentRef`, `targetKind`,
  `targetRef`, `inputHash`, `dependsOn`. Only existing canonical action classes
  are accepted; every descriptor targets one logical object. For children whose
  exact database target is resolved by an existing canonical prerequisite,
  `targetRef` is null until resolution from that prerequisite's durable result;
  the immutable key and input hash still identify the planned target. The
  orchestrator must never resolve it from a first-row or heuristic match.
- The manifest is bounded by the existing DTO/action caps: no unbounded bulk
  operations. Branch-specific canonical validation also runs before claim.
  Receipt hashes never stand in for actual actor/policy checks by each executor.

`confirmationMaterialEncrypted` stores the normalized blueprint/owner/team
material sufficient to reconstruct those exact commands. It excludes raw draft
tokens, activation tokens, passwords, session bearers and CRM credentials.
Generate required password hashes once, inside the encrypted material; never
regenerate changed credential material for the same child. Store only existing
safe credential-intent fingerprints in the receipt/ActionExecution. No raw
temporary password replay is introduced; use the existing authentication and
recovery mechanisms. The draft API must never serialize this new ciphertext or
its decrypted content. Existing business preview display remains separate.

## Database and runtime guards

1. Both receipt/material fields are null or both present. Receipt is a closed
   object with exact V1 types, hash formats and a bounded typed child array.
2. Every editable writer, including messages and CRM import, uses revision CAS
   and `status=draft`. Its write atomically increments revision. The database
   transition guard prevents an in-flight old edit from overwriting a claim.
   Draft read/preview returns the server revision; confirmation requires
   `expectedDraftRevision`. This value is only a stale-input precondition,
   never authority to supply a different tenant, actor or activation.
3. First claim atomically installs the complete receipt/material and sets
   `status=confirming`, conditional on the approved revision and expiry. A
   different revision/material cannot reuse this claim. The receipt records
   the approved revision; status-only progress never changes that revision.
4. Once a receipt exists, blueprint, receipt, material, draft token and
   activation binding are immutable. Delete or reset to `draft` is forbidden.
   SQL lifecycle guards reject bypass writes, not just application checks.
5. Existing `TrialActivation.tenantId` is the authoritative bootstrap result.
   `confirmedTenantId` can be filled only from that exact result when all
   required children succeed. No consumer tenant is accepted; no new tenant is
   manufactured to satisfy an ActionExecution foreign key.
6. The existing `confirming` state is durable in-progress state. A failed or
   ambiguous child does not reset it. Progress is derived from the immutable
   manifest, canonical activation and children, not mutable duplicated outcomes.
7. Concurrent resume workers use the same manifest/source references and
   existing canonical child locks/uniqueness. Restore SUCCEEDED child outcomes
   first; never allocate new source identities or generations on restart.
8. UNKNOWN remains pending reconciliation under the existing child execution;
   no FAILED conversion, replacement command or blind provider retry.
9. Pre-tenant claim failure rolls back with no tenant. Post-tenant failure
   preserves the tenant and completed activation. Normal tenant recovery stays
   with the exact owner; platform suspension/reactivation retain existing
   authority. The orchestrator gains no platform role.
10. Expired draft tokens do not acquire new authority. After tenant creation,
    recovery requires an existing authenticated owner session bound to the
    recorded tenant/owner, or valid existing claims within their original
    lifetime; payload email does not authorize resume.

Legacy `confirmed`/`confirming` rows with null receipts are explicitly legacy,
not proven V1 confirmations. Preserve their records and ordinary login/read
behavior; fail closed for automatic mutation/replay. Do not reconstruct missing
historical approval from current state. Any recovery of such rows requires a
separate provenance assessment, without creating another tenant.

Protect receipt-bearing aggregate references from destruction; do not expand
A30 retention or introduce automatic cleanup. Neither AiOnboardingDraft nor
TrialActivation is in the Wave 6 six-class auth allowlist. No existing Wave 6
policy or accepted retention predicate changes.

## Required foundation and integration proof after approval

Schema/migration guards → PostgreSQL adversarial and concurrency proof → clean
replay → Prisma validation/typechecks/lint → expected-only additive production
migration gate with drift NONE. Apply only after that gate is green.

Cases: stale edit after claim, changed owner/team payload under old identity,
direct receipt/material rewrite/delete, wrong activation/tenant, two competing
claims, crash before/after bootstrap, crash after a successful child but before
aggregation, durable missing-child reconstruction, same child source identity
across concurrent resume, immutable successful outcomes, UNKNOWN blocking,
expired claim, owner-session mismatch, and zero historical receipt backfill.

Then implement canonical orchestration, final bypass ratchets and A18/A26/AI
targeted proof; proceed to the authorized unified deployment/final gate only
under the separately approved companion CRM handoff option A. The user's
post-35dd890e instruction authorizes migration apply after the expected-only
green gate and continuation into the existing remediation cycle.

```text
AI CONFIRMATION RECEIPT SCHEMA V1: APPROVED
EXISTING AGGREGATE REUSED: AiOnboardingDraft
ADDITIONAL FIELDS PROPOSED: 3
NEW MODELS PROPOSED: 0
NEW ACTION CLASSES PROPOSED: 0
CHILD EXECUTION OWNER: EXISTING CANONICAL ACTION ENGINE EXECUTORS
PRE-TENANT CREATION OWNER: TRIAL ACTIVATION FLOW
FAKE HISTORICAL APPROVAL BACKFILL: FORBIDDEN
SCHEMA FOUNDATION/APPLY STATUS: SEE CURRENT FOUNDATION REPORT
```
