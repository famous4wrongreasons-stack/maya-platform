# Package 5 B21 realtime contract reconstruction STOP

Status: **CONTRACT RECONSTRUCTED; OWNER DECISION REQUIRED BEFORE RUNTIME/SCHEMA/MIGRATION WORK**.

Accepted checkpoint: `480c1f41`.

B20 remains an accepted production baseline. Waves 1–6 and B7–B20 were not
reopened. This cycle performed read-only source/schema/active-runtime inspection
and produced the minimal B21 Contract/Schema Proposal. It did not change runtime,
schema, migrations or production.

## Exact finding

The active `/api/realtime` path sends `ready` after reducing Telegram or legacy
session authentication to raw `chat_id` and checking legacy consent. Canonical
channel-proof failure is converted to `None`, but the realtime bridge still
starts. The bridge resolves role, private Client projections and shared durable
conversation history from that raw key and passes it into the AI tool loop.

The approved identity and role foundations are sufficient to repair the authority
order: active tenant-qualified `ClientChannelLink` for Client mode, and Maya
JWT/`AuthIdentity` + active `Membership` + A16 access for staff mode. Consent and
preferences can then be evaluated after identity. Realtime can remain an intent
surface that invokes existing canonical actions.

The schema has no honest durable Client conversation/history owner. The existing
`AiBrainSession`, `AiMemoryFact`, `InboxItem`, `DomainEvent`,
`ClientChannelLink` and Communication Delivery models have different owners and
contracts. Reusing one would either exclude Clients without Maya Users, store raw
dialogue where it is explicitly forbidden, corrupt identity evidence, or turn a
projection/event into the conversation owner.

This invokes the owner's explicit STOP boundary. No runtime workaround or legacy
history fallback was added.

The read-only production check returned HTTP 200 for `/api/health` and
`/api/health/ready`; the active release remained
`20260905-p5-b20-16c24bd1` and database readiness remained `ready`. The realtime
endpoint itself was not invoked.

## Proposed decision

The proposal recommends:

- D1-A: retain only bounded per-WebSocket in-memory context in Chapter 6 V1;
  destroy it at close; no shared voice/text/Telegram transcript and no legacy
  file read/write. This needs no schema/model/migration/action-class change.
- D2-A: missing, revoked, ambiguous or wrong-tenant Client binding fails closed
  before OpenAI/private projection/tools and requires verified Client linking.

Alternative D1-B adds one encrypted tenant-qualified
`ClientRealtimeConversation` aggregate, but it requires explicit retention,
privacy, size, reconnect, cross-channel and staff-projection decisions before
schema implementation. Backfill remains zero.

Proposal:
`package5-b21-realtime-session-history-v1-proposal.md`.

Machine-readable assessment:
`evidence/package5-b21-contract-assessment.json`.

## Verdict

`B20 PRODUCTION REMEDIATION: PASS — ACCEPTED BASELINE`

`B21 REALTIME SESSION CONTRACT: RECONSTRUCTED`

`VERIFIED ClientChannelLink BEFORE CLIENT_READY: REQUIRED`

`IDENTITY/ROLE FOUNDATIONS SUFFICIENT: YES`

`CANONICAL DURABLE CLIENT HISTORY FOUNDATION SUFFICIENT: NO`

`NEW BUSINESS DECISION REQUIRED: YES`

`RECOMMENDED OPTION: D1-A — EPHEMERAL REALTIME CONTEXT V1`

`NEW SCHEMA IF D1-A: NO`

`NEW MODELS IF D1-A: 0`

`NEW ACTION CLASSES IF D1-A: 0`

`B21 RUNTIME REMEDIATION STARTED: NO`

`B21 SCHEMA/MIGRATION IMPLEMENTATION STARTED: NO`

`PRODUCTION MUTATIONS: 0`

`PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL — OPEN B21 BLOCKER`

`PACKAGE 5 COMPLETE: NO`

`PACKAGE 5 WAVES COMPLETE: 6/6`

`P4-11 CREATED: NO`

`WAVE 7 CREATED: NO`

`CHAPTER 7 STARTED: NO`

Chapter 6 was not declared complete. All 17 pre-existing local test databases
were left untouched. Owned temporary processes, watchers, browser processes and
temporary databases are zero.
