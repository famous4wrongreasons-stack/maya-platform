# Package 5 B23 / A18 — contract reconstruction STOP

**B23 USER-REQUESTED HISTORY DELETE OWNER: NOT FOUND.**

Accepted checkpoint: `0d0c86fa`. B22 remains accepted and unchanged in production release `/opt/maya-saas/releases/20260905-p5-b22-a15741c0`. Waves 1–6 are not reopened.

The owner's B23 instruction requires Proposal → commit/push → STOP when durable user-requested history deletion lacks an approved owner or exact scope. That boundary applies. This cycle changes documentation/evidence only; no runtime workaround, schema, migration, deployment or production deletion was attempted.

## What the endpoint actually deletes

The active `chat_delete_handler` (lines 8642–8738) authenticates a legacy session or Telegram channel, derives `pwa:<client|staff>:<chat_id>`, and deletes one complete message object or the selected key. Message IDs are normalized before selection. Single-message selection supports ID, legacy index, and role/text fallback; knowing an ID does not itself choose another raw history key.

Every ordinary no-match/delete path writes through `memory.save_conversations`. The physical write replaces a snapshot of the whole global conversation file, not one tenant-qualified Client aggregate. It also drops unrelated empty entries; there is no per-Client CAS/lock. Shared temporary-file replacement can race, and storage errors are swallowed. Browser message hiding/cache clearing is separate and occurs optimistically; the SaaS local-only branch does not call this legacy endpoint.

The endpoint deletes message text and attached presentation metadata/references. It does not delete underlying media objects, canonical profile/preferences, consent, appointments, value, execution, delivery or audit facts. It is not an approved cross-channel erasure operation. B21 ephemeral voice context is not in this deletion path.

## Why an identity-only patch is insufficient

`ClientChannelLink` can prove a current principal, including a Client without a Maya User. The legacy transcript has no durable tenant/Client/conversation owner binding. A current verified channel link, particularly after a verified rebind, cannot be used to invent ownership of older messages.

The reviewed schema, action registry and relevant services provide no canonical Client transcript deletion command:

- B15 authorizes a read-only history projection, not deletion.
- B21's approved choice is ephemeral socket context; its durable-history alternative was not approved.
- AiBrainSession is User/Membership planning state and forbids raw transcript persistence.
- AiMemoryFact deletion is scoped to explicit User notes, not Client conversation history.
- InboxItem is a User inbox projection; CustomerProfile is Client choices/preferences.
- Audit/security, action-execution and delivery evidence have separate protected lifecycles.
- D7-A requires central, versioned, allowlisted retention. AC6 V1 authorizes six system-policy auth/quarantine cleanup classes, not a user-requested conversation delete. Its durable claim mechanism cannot grant the missing authority.

## Failure disclosure, precisely

Malformed JSON and missing legacy authentication already return errors without history. The confirmed gap is that missing/revoked/wrong canonical Client binding is not evaluated at all. A channel-authenticated but canonically unbound request can reach deletion. An unmatched message ID returns `deleted=false`, saved private messages and a durable save; a storage failure can be hidden as success.

The accepted checkpoint's isolated reproduction remains applicable: active webhook and memory source hashes were reread and exactly match that evidence. No production conversation data was read and no new executable proof was run. Future remediation must return no history/PII on any failure and use a separate authorized read for UI recovery.

## Minimal decision proposed

**A — recommended:** retire legacy server history deletion in Chapter 6. API/proxy return uniform explicit unsupported without history, PII, identity creation or storage access. Remove/disable legacy server-delete controls and false-success behavior. Keep separately authorized history reads and historical data. No new model/action/schema. The owner explicitly accepts loss of server-side one/all message deletion; no privacy-erasure claim is made.

**B — alternative:** retain real deletion through a separately approved canonical Client conversation lifecycle/schema. Ownership, scope, privacy, retention, limits, audit and concurrency must be decided before implementation; no automatic provenance/backfill and no use of AC6 as substitute user authority.

Full proposal: `package5-b23-chat-history-delete-contract-v1-proposal.md`.

Machine-readable inventory/evidence: `evidence/package5-b23-contract-assessment.json`.

```text
B23 CONTRACT RECONSTRUCTION: COMPLETE
B23 USER-REQUESTED HISTORY DELETE OWNER: NOT FOUND
B23 CANONICAL DELETION SCOPE PROVEN: NO
B23 IDENTITY PATCH ALONE SUFFICIENT: NO
B23 RUNTIME REMEDIATION CAN RESUME: NO — OWNER DECISION REQUIRED
B23 FAILURE DISCLOSURE: OPEN PRODUCTION BLOCKER
RUNTIME/SCHEMA/MIGRATION CHANGES: 0
PRODUCTION MUTATIONS: 0
PACKAGE 5 COMPLETE: NO
PACKAGE 5 WAVES COMPLETE: 6/6
NEW FULL FINAL GATE RUN: NO — CONTRACT STOP
P4-11 CREATED: NO
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
OWNED TEMP PROCESSES STILL RUNNING: 0
BACKGROUND WATCHERS LEFT: 0
OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0
OWNED TEMP DATABASES REMAINING: 0
```

No database was created, modified or deleted in this cycle. All 17 accepted pre-existing test databases remain protected. No browser/watcher/server process was started. Chapter 6 was not declared complete.
