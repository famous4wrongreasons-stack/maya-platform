# Package 5 post-Wave-6 remainder — B21 contract decision STOP

Accepted checkpoint `480c1f41`. Waves 1–6 remain accepted 6/6. B7–B20 remain
accepted production baselines. B20 is closed and must not be reopened.

1. Package 5 Final Adversarial Verification remains FAIL/NO only because of the
   open B21/A18 realtime blocker found after B20 production remediation.
2. Active `/api/realtime` accepts a legacy web session or Telegram proof, reduces
   the result to raw `chat_id`, checks legacy consent and sends `ready` before a
   verified active tenant-qualified `ClientChannelLink` is required.
3. Failure to construct canonical Client channel proof is ignored. The bridge
   still starts, resolves role from raw `chat_id`, exposes Client-specific AI/tool
   projections and reads/writes shared durable history under the same raw key.
4. The approved target state order is CONNECT -> authentication -> one canonical
   identity/authority plane -> consent/preferences -> CLIENT_READY or STAFF_READY
   -> private projections/tools -> canonical action initiation -> close.
5. Client authority must be an active tenant/provider/HMAC-qualified
   `ClientChannelLink`. Staff/admin authority must be Maya JWT/`AuthIdentity` plus
   active `Membership` and A16 access. The planes cannot be merged. Raw `chat_id`,
   legacy session, phone and consent are not identity/role authority.
6. Existing identity, role, consent/preference and canonical action foundations
   are sufficient. No new identity model or action class is required.
7. Existing schema is not sufficient for durable Client conversation history.
   `AiBrainSession` deliberately excludes raw messages and requires a Maya User;
   `AiMemoryFact`, `InboxItem`, `DomainEvent`, `ClientChannelLink` and
   Communication Delivery have different owners/contracts.
8. The minimal proposal recommends D1-A: bounded per-WebSocket in-memory context
   only, destroyed on close, with no legacy history read/write and no transcript
   sharing across reconnect/text/Telegram. It requires zero models, migrations or
   action classes.
9. D1-B would add one encrypted `ClientRealtimeConversation` aggregate, but it
   requires prior owner decisions for retention, deletion/export, size limits,
   reconnect lifecycle, channel scope and staff projection. Backfill is zero.
10. The proposal recommends D2-A: a missing, revoked, ambiguous or wrong-tenant
    Client link fails closed before OpenAI/private projection/tools and requires
    verified linking. An anonymous realtime product is not approved implicitly.
11. Owner decision is required before B21 runtime/schema/migration work. No
    workaround, legacy fallback, runtime change, schema change, migration or
    production mutation was made in this cycle.

Decision artifact:
`package5-b21-realtime-session-history-v1-proposal.md`.

Assessment report:
`CYCLE-06-BLOCKING-PACKAGE-5-B21-CONTRACT-STOP-REPORT.md`.

Machine-readable evidence:
`evidence/package5-b21-contract-assessment.json`.

The next controlled cycle starts only after the owner selects D1 and D2. If D1-A
is approved, implement the authority state machine and ephemeral context without
schema. If D1-B is selected, obtain the listed retention/privacy/limits decisions
before schema implementation. Then add ratchets, run targeted proof and mandatory
deployment gates, deploy without real voice/Client mutations, structurally verify
production and restart the full 13-family Final Gate from the beginning.

Preserve B7–B20, Waves 1–6, D1-A…D7-A, P02/P03 holds, verified Client identity,
Communication Delivery, Package 4 value ownership, immutable evidence, no tenant
hard delete and AC6 A30 ownership. Do not create P4-11 or Wave 7, start Chapter 7
or declare Chapter 6 complete.

All 17 old databases remain untouched. Owned processes, watchers, Chrome and
temporary databases are zero.
