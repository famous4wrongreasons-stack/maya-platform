# Package 5 B7 — Client habit/preference schema proposal V1

Status: **PROPOSED — owner approval required; no schema/runtime implementation**.
Accepted checkpoint: `2a6d645d`. Date: 2026-09-04.
This is Final Package 5 remediation. B5/B6 and Waves 1–6 stay accepted.

## Exact meaning and existing-schema gap

`remember_client_preference` records one short habit/preference explicitly stated
by the current Client: service style, comfort, conversation or similar personal
service choices. It is not an inferred AI fact, a staff-authored note, legal
consent, an automatic visit-mood change or a notification setting.

The actual tool description and writer are at `ai администратор/claude_ai.py`
(`TOOLS`, `remember_client_preference`, lines 620–635 and 2724–2737) and
`database.py:add_client_preference` (925–949). The writer trims text, strips a
leading/trailing bullet/hyphen, accepts at most 200 characters, deduplicates
case-insensitively, retains the last 12 lines and truncates the result to 800
characters. These are observed legacy semantics, not a newly approved policy.
`get_client_preferences` and the staff dossier reader consume the stored text;
the latter currently resolves a legacy row by phone. Readers must also move to
exact canonical Client identity, without turning phone discovery into authority.

The approved `CustomerProfile` cannot honestly hold this field today:

| Existing field | Approved meaning; why it cannot hold B7 |
| --- | --- |
| `preferredLocale` | Locale only; the accepted profile command changes only locale |
| `encryptedNotes` | Staff-authorized notes; using it for Client self-preferences would mix authorities and overwrite staff content |
| `defaultVisitMood` | Only `red`/`blue`; no automatic translation from free text in B5 V1 |
| `notificationPreferencesJson` | Version 1 with a closed ten-key notification allowlist; no arbitrary habits |
| Consent timestamps / ClientConsentFact | Consent projection/evidence, not preference text |
| ClientChannelLink / ClientLinkChallenge | Immutable identity evidence, not a profile payload container |

ActionExecution payload/audit is execution evidence, not the authoritative current
CustomerProfile. No equivalent approved Client-owned free-text field was found.

## Minimum additive representation

Add exactly one field to the existing model:

```prisma
CustomerProfile.encryptedClientPreferences String?
```

This is a declaration for review, not a migration. **No new model** and no extra
revision, actor, history or identity columns are proposed.

- Canonical owner: tenant-qualified `Client` through `CustomerProfile.clientId`.
  Maya User remains optional.
- NULL means no explicit Client habit/preferences stored through this contract.
  It does not mean consent, opt-out or reconstructed historical absence.
- Use existing EncryptionService at rest. Decrypted material is a strict versioned
  envelope: `{ "version": 1, "preferences": ["..."] }`. SQL NULL represents an
  empty state; an encrypted empty array is not a fabricated user choice.
- Non-NULL requires a non-NULL canonical `clientId` and nonempty ciphertext.
  Retain composite tenant/Client FK, `(tenantId, clientId)` uniqueness and the
  existing immutable established-owner guard. Legacy User-only profiles are not
  auto-linked or treated as Client authority.
- A database guard enforces ownership/nonempty ciphertext. Since the database
  cannot inspect ciphertext, the canonical executor validates the decrypted V1
  envelope and bounds. Unknown versions/corrupt payloads fail closed. Do not
  claim a SQL validator can prove the encrypted plaintext's semantics.
- Reuse ActionExecution, ActionAttempt and ActionTargetMutation for durable
  command identity, generation, immutable audit fingerprints and outcomes.
  Do not copy raw preferences into unencrypted execution/audit/log fields.

## Proposed bounded behavior included in this V1 approval

These choices are **proposals**, not silently inherited constants:

1. Store only a Client's explicitly stated preference; AI is an initiator. It may
   redact/format the supplied text, but cannot infer a preference, select Client
   identity, or convert it into a different business command.
2. Preserve the observed normalization and case-insensitive identical-text no-op.
   One normalized preference is at most **200 Unicode characters**. A stored list
   is at most **12 entries / 800 Unicode characters including separators**.
3. Unlike legacy truncation/eviction, reject an addition that exceeds either
   bound; do not silently delete an old choice or truncate a saved sentence.
   This explicit capacity behavior is part of the decision requested here.
   No remove/reorder/automatic conflict-resolution command is added in V1.
4. Missing or ambiguous canonical Client, stale/revoked link, identity hold or
   cross-tenant target fails closed. Resolve the current channel through the
   approved authenticator and verified ClientChannelLink. A phone match, bare
   User link, AI `user_id` or arbitrary Client parameter is never sufficient.
5. An authenticated guest with a verified link works without a Maya account.
   Preserve trusted request context outside model arguments through the AI
   dispatch; a model cannot supply/override credentials, Client or tenant.
6. Empty/identical requests produce no Client/profile/business fact or new
   generation. A changed request uses a narrowly versioned A18 command on the
   existing ingress/engine, with expected generation and stable intent identity.
   Do not broaden the accepted locale/staff-notes commands or guest allowlists.
7. Under the same local transaction, lock/recheck Client/link and current state,
   persist the new encrypted field, immutable target mutation and execution
   outcome. Concurrent different commands at one generation have one winner;
   duplicate/restart returns the existing outcome.
8. Client reads and authorized staff dossier reads use the canonical Client
   target and existing access policy. Phone-only dossier matching cannot select
   whose preferences are returned. Reads never create a Client or repair a link.
   Existing encryption/redaction constraints remain; no new LLM data access is
   authorized by adding a field.

The list is mutable current preference state; successful execution/audit evidence
is immutable. No preference is treated as legal consent, provider evidence or
historical appointment mood. No CRM sync, provider write or UNKNOWN is introduced.

## Migration and proof after approval

Additive nullable column and narrow ownership guard; no defaults or backfill.
Do not import legacy SQLite habits by phone/chat id, infer historical author/time,
create fake User/Client/link records, or mutate B5/B6 fields.

Required proof: verified guest success, identical no-op, strict bounds and version
validation, duplicate/restart, concurrent same/different intents, stale generation,
missing/ambiguous Client, forged/cross-tenant Client, revoked link/holds, no hidden
Client creation, unchanged staff notes/B5/B6/consent, and immutable audit outcome.
Ratchets must reject direct AI/SQLite preference writers and phone-only read/write
authority. Clean replay and expected-only additive production migration gate
precede apply; mandatory deployment gates precede runtime cutover.

The B8 phone/linking decision remains separate. After both required decisions are
resolved, continue the existing remediation cycle, then restart the full 13-family
Final Gate. No real profile/phone/provider business mutations for smoke.

```text
B7 CANONICAL OWNER: CLIENT / CustomerProfile
B7 EXISTING SCHEMA SUFFICIENT: NO
B7 ADDITIONAL SCHEMA REQUIRED: YES — ONE NULLABLE ENCRYPTED FIELD PROPOSED
B7 SCHEMA PROPOSAL V1: READY FOR OWNER DECISION
NEW MODELS PROPOSED: 0
FAKE HISTORICAL BACKFILL: FORBIDDEN
PHONE MATCH AS CLIENT AUTHORITY: NO
RUNTIME/SCHEMA IMPLEMENTATION STARTED: NO
PRODUCTION MUTATIONS: 0
```
