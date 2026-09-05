# B23 / A18 — Client history deletion Owner/Contract Proposal V1

**OWNER DECISION REQUIRED. No runtime, schema or migration implementation.**

Accepted checkpoint: `0d0c86fa`. B22 remains an accepted production baseline. This is Package 5 Final Remediation, not another wave.

## Decision in plain language

**Recommended A:** retire the legacy server-side “delete message / clear conversation” operation in Chapter 6. Keep the existing separately authorized history read. The API must return explicit unsupported with no history/PII and no storage access; PWA must not claim that server history was deleted. Existing history and canonical facts remain unchanged. New models/actions/schema: **0**.

**Alternative B:** preserve actual server-side deletion by first approving a separate canonical Client-owned durable conversation lifecycle and schema. A verified binding must identify the principal; durable tenant/Client/conversation ownership must independently prove what that principal may delete. Scope, privacy, retention, limits, audit and concurrency need an explicit contract before implementation. Model/action counts and schema fields are not approved by this proposal.

A removes the user's ability to erase one/all legacy server messages through this PWA endpoint. It does not claim to erase data, implement a privacy-erasure procedure, or solve future retention policy. B preserves that product capability after the missing foundation is designed and approved.

## Exact current write inventory

Active source was reread after B22: `webhook_server.py` SHA-256 `6f31a5a3ca387f2e98c4e60a2b1e550d181fb8afb8ba19316ec3d922755d6bb7`; `memory.py` SHA-256 `b286f39327adcc3e82c544ad4409d2e5c75a28e0b8367ceb9e16e320850c1b41`. Both match the accepted B23 finding. No production conversation data was read.

| Surface | Actual effect |
| --- | --- |
| `/api/chat/delete`, lines 8642–8738 | Resolves legacy session/Telegram subject; derives `pwa:<client or staff>:<chat_id>`. Neither canonical tenant/Client ownership nor verified active ClientChannelLink is proved. Knowing a message ID alone does not select another raw history key; the flaw is the unproved Client/tenant ownership of the selected key. |
| Single delete | Removes a whole message dictionary selected by message ID, old list index or role/text fallback. Message text/encrypted content and attached link/action/image/widget metadata disappear together. |
| `all`, `clear`, `reset` | Removes the entire selected history key and its message objects. There is no independently owned conversation aggregate or metadata row. |
| ID normalization | Assigns new IDs to missing/duplicate legacy message IDs before deletion selection. A no-match request can persist those changes. |
| `memory.save_conversations`, lines 565–574 | Rewrites the **whole shared** `conversations.json` snapshot through the same `.tmp` path and `os.replace`; not a transaction on one Client's history. All falsy entries are omitted, including unrelated empty keys. No per-Client lock/CAS prevents lost concurrent updates. |
| Load/save errors | JSON parse failure becomes an empty mapping; save exceptions are suppressed. No durable terminal deletion receipt or reliable failure result exists. |
| Failed selector | Still saves the history and returns its messages, including private text and supported card metadata. |
| Browser UI | Optimistically hides messages, stores local hide signatures, and removes local cache/signature keys on clear. A separate SaaS branch returns before the legacy API; local hiding is not server erasure. |

Logical selection targets one PWA surface key, but physical replacement covers the shared file, which also contains other PWA and legacy Telegram keys. This is not approved cross-channel deletion. B21 voice context is separate, ephemeral, and unaffected.

The endpoint removes message representations/references, not the referenced media files or underlying canonical appointments, preferences, consent, value, action executions or delivery outcomes. It does not call those owners. These facts cannot be added to deletion scope for compatibility.

## Existing owner/contract mapping

| Foundation | Why it does not authorize this deletion |
| --- | --- |
| ClientChannelLink / ClientLinkChallenge | Sufficient for verified Client identity, including no Maya User. Historical messages lack durable tenant/Client ownership; a current channel binding cannot retroactively prove who owned old messages, especially after rebind. |
| B15 history projection | Approved **read-only** legacy presentation after canonical identity checks. It grants no write/erasure authority. |
| B21 realtime | Approved per-socket ephemeral cleanup only. The durable-history alternative was not approved. |
| AiBrainSession | Structured User/Membership planning state; schema explicitly forbids raw transcript persistence. |
| AiMemoryFact | Explicit User-owned `REMEMBER` notes and their soft deletion; not Client conversation history. |
| CustomerProfile / InboxItem | Client choices/preferences versus User inbox projections; neither owns this transcript. |
| AuditLog / DomainEvent / ActionExecution / ActionAttempt / delivery facts | Separate audit, security, immutable evidence and business lifecycles. A chat-delete request grants no deletion authority over them. |
| D7-A / AC6 MaintenanceRun + MaintenanceItemClaim | Central, versioned **system** maintenance with six approved auth/quarantine classes. User-requested conversation deletion is absent from the allowlist. A generic durable claim is not a grant of authority. |

AC6 V1 covers auth sessions, phone/email codes, auth-flow states, rate-limit buckets and ingestion quarantine. It must not be extended or invoked as a substitute for this missing user command.

User-visible message/card history, explicit saved preferences/notes, immutable audit/security evidence, automatic retention, WebSocket cleanup and browser cache cleanup remain separate scopes. The legacy file has no approved policy declaring all its contents user-deletable. Do not infer such a policy from its filename or current writer.

## Proposed Option A contract — not implemented

- Retire `/api/chat/delete` and its proxy mutation path uniformly. Proposed compatibility result: HTTP 410, `ok=false`, `history_delete_unsupported`; no `messages`, excerpts, identifiers, counts or existence hints.
- Do not resolve a legacy history key, load/save history, normalize IDs, create a Client/link, clear a cache on the server, or call any business/maintenance owner.
- Remove/disable the legacy server-delete controls and optimistic server-delete success in PWA. Do not turn a failed request into a successful-looking local erasure. Existing separate local-only SaaS behavior must be presented accurately and is not expanded into a new capability.
- Preserve B15's separately authorized history read. Any UI refresh uses that authorized read and never consumes private history from a failure response. Unsupported delete does not grant read authority or trigger an implicit read.
- Preserve historical files and all audit/security/business evidence. No deletion/backfill/provenance reconstruction by phone, raw channel ID or current binding.
- Protect backend, proxy and active PWA against restoring legacy deletion, failure history/PII disclosure, false success or broader cleanup.

No new canonical history deletion owner is created under A: **the legacy capability is retired**. Do not report a nonexistent canonical deletion command as implemented.

## If Option B is selected

Prepare a dedicated minimal schema/contract proposal before implementation. It must define exact tenant/Client/conversation/message ownership established at creation, allowed single/all deletion, terminal/idempotent outcomes and concurrent append/delete behavior, encryption/limits, user-history versus immutable evidence classification, and central versioned retention separately from user deletion. Client without Maya User remains supported.

Staff-surface deletion requires its own proven authority/scope and cannot be folded into a Client command. Cross-channel history is not introduced implicitly. Historical migration requires separately proven provenance; no fake ownership backfill is allowed. This option does not authorize reusing the global file or adding transcript payloads to ClientChannelLink/CustomerProfile/AuditLog.

## Already approved failure/privacy requirements

Missing/revoked/ambiguous binding, wrong Client/tenant, forged selectors and authorization/storage failure must expose no saved history or PII. Existing legacy authentication rejection already returns a minimal error; the current B23 gap is that canonical rejection is never evaluated and failed selection still reaches save/projection. Do not describe the existing HTTP 401 branch as returning history.

Any future authorized deletion must prove exact scope, converge on retry/concurrency without resurrection, preserve immutable evidence and never create new history/cache as a side effect. A uniformly retired operation under A has no destructive effects to retry.

```text
B23 CONTRACT RECONSTRUCTION: COMPLETE
B23 USER-REQUESTED HISTORY DELETE OWNER: NOT FOUND
B23 CANONICAL DELETION SCOPE PROVEN: NO
IDENTITY FOUNDATION SUFFICIENT: YES
IDENTITY PATCH ALONE SUFFICIENT: NO
RECOMMENDED: A — RETIRE LEGACY SERVER HISTORY DELETE
NEW MODELS IF A APPROVED: 0
NEW ACTION CLASSES IF A APPROVED: 0
NEW SCHEMA IF A APPROVED: NO
B23 RUNTIME REMEDIATION CAN RESUME: NO — OWNER DECISION REQUIRED
PRODUCTION MUTATIONS: 0
```

STOP after Proposal/report/remainder commit and push, as explicitly required by the owner's B23 instruction. No deployment or new Final Gate run before owner closure and successful remediation. Waves 1–6/B22 remain accepted; no P4-11, Wave 7, Chapter 7 or automatic Chapter 6 completion.


## Owner closure — Option A approved (2026-09-06)

The owner accepted checkpoint `9c6ee8bf` and explicitly approved retirement of legacy server-side chat history deletion. No models, schema or action classes are introduced. The compatibility endpoint and proxy return a fixed HTTP 410 `{ "ok": false, "error": "FEATURE_NOT_AVAILABLE" }` with no identity, history or storage access. Saved history and protected evidence are neither erased nor rewritten.

Existing local-only SaaS/inbox hiding remains local and is labelled as hiding on this device; it does not claim server erasure. Legacy server-delete controls and upstream requests are removed. B15 authorized read and B21 ephemeral voice remain unchanged. D7-A/AC6 scope is not expanded.

This is a temporary Chapter 6 limitation. A future separately approved conversation lifecycle may restore deletion after defining ownership, voice/text/Telegram unification, user deletion, retention, legal/audit preservation, employee access, privacy, limits and cross-channel identity. No future capability is implemented by B23.
