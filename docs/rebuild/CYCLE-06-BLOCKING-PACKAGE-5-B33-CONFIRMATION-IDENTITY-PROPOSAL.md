# B33 — confirmation identity foundation assessment and minimal proposal

Stage 1 only, 2026-09-06. Accepted checkpoint `a8577c9d`.
**Existing durable booking-confirmation identity: NO. Runtime remains stopped.**
The schema and transport contract below are proposed, not approved or implemented.
B31 immutable intent binding and B32 Client principal are correct and preserved.

## Baseline and exact finding

The existing isolated `/tmp/maya-b29-contour` was clean at entry, branch
`contour/b29-remediation`. Fetch PASS; HEAD = canonical origin at `a8577c9d`;
divergence 0/0, unpushed commits 0. Main checkout's 24 dirty entries/file hashes
match the accepted checkpoint. No DB or production access was needed.

The accepted [B32 production / B33 STOP report](CYCLE-06-BLOCKING-PACKAGE-5-B32-DEPLOYED-FINAL-GATE-STOP-REPORT.md)
and [B33 executable proof](evidence/package5-b33-chat-booking.proof.json) remain
the runtime evidence. This assessment does not rerun or reopen B31/B32.

| Existing candidate | Exact representation | Why it cannot identify the required confirmation |
| --- | --- | --- |
| Chat conversation | `memory.py:545–575`, `conversations.json`; channel/presentation history key | Mutable whole-file history, not a tenant/Client/action confirmation ledger. Save exceptions are swallowed. No immutable per-confirmation acceptance contract. |
| Chat message | `webhook_server.py:8012–8067`: `msg_` + UUID; `_user_history_item`; response `user_message_id` | An already stored item's ID survives a history read, but processing a repeated request allocates a new ID. Main chat flow appends the user item before model processing and saves the completed history after booking finalization; no durable acceptance barrier or ID-based retry claim. |
| Incoming PWA event | `app.html:19373`, `:19925–19940`, `:20654`: `authPayload({message})` / `{audio}` | Sender does not supply a stable confirmation/message ID to legacy chat/stream. Authentication metadata and client/staff presentation mode do not identify a confirmation. Response IDs arrive too late for a lost-response retry. |
| Ephemeral command context | `legacy_client_habits_bridge.py:13–42`: frozen `ClientCommandContext(proof, intent)` | `intent = SHA256(message)`; in-memory context, no event record. Separate explicit confirmations with identical words collide. It contains no confirmation ID, Client or tenant binding. |
| Booking confirmation preflight | `claude_ai.py:4466–4575`: previous assistant text + current yes/no; `_ToolUse.id = "server_confirmed_booking"` | The ID is a constant, not an occurrence. Booking details are resolved from mutable conversational/catalog material; no durable confirmation receipt is claimed. Both normal and stream AI paths use this helper. |
| Model tool-call reference | Model tool use → `contact_request` → `_finalize_booking_for_chat` | The finalizer receives booking fields and ephemeral context, not a previously committed confirmation reference. A model tool ID is not user confirmation authority. |
| Current action source | `client-channel-runtime.service.ts:909`, `ClientAppointmentCreateService`: link-derived `sourceRef` | Identifies the verified channel-link episode, shared by many independent actions. B32 evidence proves principal authority, not which confirmation occurred. |
| B31 binding / ActionExecution | `schema.prisma:365`, `:491`: immutable key/intent/execution | Binding requires non-null `actionExecutionId`; admission happens after booking normalization. It cannot supply the missing pre-model source event. Reusing it as an unbound draft would change B31. |
| Existing onboarding receipt / `sourceIntentRef` | `AiOnboardingDraft.confirmationReceiptJson`; `AiConfirmationReceiptService` contract `package5.ai-draft-confirmation/1`, `aic1:<confirmationId>:<child-key>` | Genuine durable receipt, but scoped to draft revision, TrialActivation, reserved tenant/owner and allowlisted A16/A17/A26/A28 children. Client appointment create is outside that contract; Client without Maya User is not its principal model. |
| AI Core request / session | `AiCoreChatDto.requestId`; `AiBrainSession.lastRequestId`, mandatory actor membership; `AiCoreService.toolIdempotencyKey` | Different account-bound route. Messages contain role/content, not a booking-confirmation event. PWA `saasAiSend` allocates a request UUID on each invocation. No existing bridge from that request to legacy Client chat confirmation. This is candidate assessment, not a new AI Core remediation. |
| Legacy AI approval/execution | `AiApprovalRequest`, `AiToolExecution` | Tool payload, argument hash, User attribution and execution/approval lifecycle after interpretation; no pre-model canonical Client confirmation receipt. Do not create a parallel booking executor through them. |
| Other durable IDs | `AgentTask`, `DomainEvent`, `InboxItem.sourceEventId`, `ClientLinkChallenge`; Telegram `booking_confirm` callback | Opportunity task, observation/fact, delivery/projection and identity-verification contracts respectively. The bot callback does not supply a shared durable PWA confirmation record; bot `booking_flow` is in memory. Repurposing these IDs would invent authority/lifecycle semantics. |

The [read-only source probe](evidence/package5-b33-confirmation-foundation.probe.py)
executes only existing pure helpers with synthetic text. It demonstrates both
different history IDs for repeated processing and identical context hashes for
separate same-word events. It also checks the relevant schema constraints and
constant preflight tool ID. [Assessment and source hashes](evidence/package5-b33-confirmation-foundation.assessment.json).
No full application, database, network or provider is invoked by this probe.

## Recommended minimal contract — one accepted source-event receipt

Proposed name: **`ClientBookingConfirmation`**. This is not an existing model.
Its only responsibility is to bind one explicit confirmation occurrence to an
immutable tenant/Client/action identity **before any model processing for that
confirmation**. B31 remains the booking-intent owner and AE the execution owner.
No conversation store, booking draft executor, provider state or new action class.

The proposed source protocol is an approval decision, not an implementation shortcut:

1. The initiator marks a genuinely explicit booking-confirmation gesture with a
   typed event. It allocates one cryptographically random UUID **once for that new
   gesture**, persists it in a durable pending-send record before the first network
   send, and retains it across chat/stream fallback, model retry and process restart.
   This ID is transport correlation until the backend accepts it; it grants no
   Client authority. Ordinary chat text or an AI-produced `request_booking` signal
   alone must not manufacture another confirmation. The explicit gesture/transport
   change requires Owner approval; no new NLP confirmation heuristic is implied.
2. Before calling the model, the backend authenticates the channel through B32's
   existing resolver, derives exact Client/tenant, validates the typed confirmation
   envelope and atomically inserts or reads the receipt. No receipt, no booking
   interpretation/effect. A sender that cannot preserve its pending event fails
   closed instead of generating a replacement ID during retry.
3. The UUID is globally unique in the receipt store. An existing UUID associated
   with another tenant/Client/action is rejected before deriving a key or entering
   B31. Same event + changed original confirmation envelope also conflicts. No
   caller-supplied tenant, Client, phone or chat ID selects receipt ownership.
4. The accepted receipt fixes the deterministic key. Python transports the accepted
   confirmation reference; the backend resolves/validates it and derives the key
   from canonical stored fields. Model-generated booking arguments cannot supply
   or replace either value. No missing-ID fallback is allowed for booking creates.
5. A new explicit confirmation gets a new event ID. Text equality does not merge
   separate events. A retry is a delivery of the existing pending event, not a new
   explicit gesture. Losing the reference does not authorize guessing the latest
   receipt or automatically starting another confirmation.

This durable sender-event protocol plus backend receipt is required together.
Adding only a UUID field to the current request, or only a server row allocated on
each retry, is insufficient. Historical message IDs/text cannot establish it.

### Proposed storage: 1 model / 8 persisted fields

| Proposed field | Contract |
| --- | --- |
| `id` | Accepted source event UUID, global PK; supplied once by the durable sender event, validated by the server; no retry-time default generator. |
| `tenantId` | Server-resolved tenant, immutable. |
| `clientId` | Verified canonical Client, immutable; no User requirement. |
| `clientChannelLinkId` | Original verified link episode, immutable. |
| `actionNamespace` | Fixed registered V1 confirmation/key namespace for existing `crm.appointment.create.v1`; not caller-selectable. |
| `confirmationEvidenceJson` | Bounded versioned evidence of the accepted explicit event and original verified binding. Contains keyed source-statement/context references when needed, not raw chat text, contact data, channel credentials or booking parameters. |
| `confirmationEvidenceHash` | Existing keyed evidence-hashing primitive over canonically normalized source evidence. Not the B31 booking fingerprint. |
| `acceptedAt` | Server timestamp of the one durable confirmation acceptance. |

Composite FKs: Client `(clientId, tenantId)` and existing ClientChannelLink
`(clientChannelLinkId, tenantId, clientId)`; tenant relation; Restrict semantics.
Existing referenced unique keys already exist. SQL guards must make the accepted
row immutable and prohibit ordinary deletion/rebinding. No nullable execution
status/UNKNOWN/outcome copy, mutable timestamp, request payload column or TTL.
The eight-field count excludes Prisma relation/navigation properties; no persisted
column is added to an existing model.

Source evidence records **what explicit source event was accepted**, not a second
booking snapshot. Replay supplies the same original source envelope through the
durable pending-send mechanism and validates it against the receipt. If required
source context is unavailable, fail closed; a source receipt alone is not enough
to reconstruct arbitrary lost conversation text or authorize invented parameters.

### Exact proposed key contract

`K = "chat-confirmation:v1:" + SHA256(encodeV1(namespace, tenantId, clientId, confirmationId))`

`namespace` fixes the B33 V1 key algorithm and existing create capability/version.
`encodeV1` is an ordered tuple of UTF-8 strings with explicit byte-length prefixes;
opaque canonical tenant/Client IDs use existing normalization, the event UUID has
one canonical textual form, and the namespace is a server constant. No raw JSON
serialization contract, clock, random value, model/tool ID, message wording,
staff, services, branch, requested time or other booking parameter enters K.
Persisted namespace V1 must continue to derive exactly K after future deployments.

The canonical tenant/Client tuple is checked against the globally unique receipt
**before** key derivation, preventing a changed context from minting another key
for that confirmation. B31's existing canonical intent fingerprint independently
protects staff/service/time/branch and the other accepted business semantics.

### Relation to existing execution and lifecycle

Receipt C → deterministic K → existing B31 idempotency scope/hash binding → E →
existing canonical Appointment. The receipt may exist before E, which is the gap
it fills. No new `ActionExecution` or Appointment column is needed. A bounded C
reference may be carried in existing execution evidence without replacing B32's
immutable principal/link evidence. Do not infer an Appointment owner from C alone.

Every retry reauthenticates. Original receipt evidence is not rewritten when the
link is revoked or the caller uses another channel. Preserve B32's original
authority revalidation and fail-closed rules for new effects; terminal reads and
UNKNOWN reconciliation remain governed by their existing contracts.

| Case | Required result after approval/implementation |
| --- | --- |
| Same C, same normalized booking intent | Same K, B31 binding and execution/outcome. |
| Same C, changed model time/service/staff | Same K; B31 `IDEMPOTENCY_CONFLICT`; no new E/provider create. |
| Same C, changed tenant/Client/action or source envelope | Reject/conflict at source receipt before B31. |
| Concurrent first requests, same C | One immutable receipt through its unique PK; B31 arbitrates one bound intent. Same intent converges; divergent intent conflicts for the loser. |
| Restart after receipt but before E | Reload C from durable pending event/receipt; derive K again; no substitute identity. |
| E UNKNOWN and retry produces same intent | Same E and existing reconciliation/MANUAL_REQUIRED rules. |
| E UNKNOWN and retry produces changed intent | Same K → conflict; no second provider operation to escape UNKNOWN. |
| E SUCCEEDED and C repeated | Same outcome. |
| New explicit C2 | New key permitted; existing booking/duplicate policies still apply. |

Do not recycle accepted confirmation IDs or expire their key namespace. V1 adds
no automatic purge or new retention period. Retain receipts while required by
the existing execution/audit lifecycle; any later purge/retention change needs an
explicitly approved extension and cannot erase unresolved execution attribution.
Do not place this receipt in mutable conversation history, the purgeable source
observation store, or the channel-link verification JSON.

Migration proposal: additive table, indexes/FKs and immutability guards only.
Historical chat messages, existing E rows and Appointments remain unchanged.
No synthetic confirmation IDs or fingerprints are backfilled. New confirmation
protocol applies prospectively; a legacy retry without proven C cannot be silently
reissued as a new confirmation. Ordinary read/consultation need not create receipts.

## STOP / requested approval scope

Approval would cover the typed durable source-event protocol and this bounded
receipt schema, not an alternative execution engine or changes to B31/B32.
After approval, all 14 requested cases, ratchets, executable concurrency/restart/
UNKNOWN proofs and mandatory gates must pass before the documented deployment.
Production proof remains structural/read-only. Then restart Package 5 Final Gate
across all 13 families. None of those future gates is claimed by this assessment.

```text
B33 EXISTING DURABLE CONFIRMATION FOUNDATION SUFFICIENT: NO
B33 DEFECT OWNER: CHAT CONFIRMATION → IDEMPOTENCY IDENTITY DERIVATION
RECOMMENDATION: ONE DURABLE CONFIRMATION SOURCE RECEIPT + STABLE SENDER EVENT CONTRACT
PROPOSED NEW MODELS: 1
PROPOSED NEW PERSISTED FIELDS: 8
PROPOSED NEW ACTION CLASSES: 0
MIGRATION REQUIRED FOR PROPOSAL: YES
BACKFILL REQUIRED: NO
FAKE HISTORICAL CONFIRMATION BACKFILL: NO
RUNTIME / SCHEMA / MIGRATION IMPLEMENTATION: NOT STARTED
B33 DEPLOYMENT: NOT STARTED
B31 IMMUTABLE IDEMPOTENCY: PRESERVED
B32 CLIENT_CHANNEL PRINCIPAL / PRODUCTION PASS: PRESERVED
PACKAGE 5 COMPLETE: NO
ACTIVE BLOCKER: B33 — SOURCE CONTRACT/SCHEMA APPROVAL REQUIRED
CHAPTER 6 COMPLETE: NO
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
PRODUCTION MUTATIONS: 0
MAIN DIRTY WORKTREE TOUCHED: NO
MAIN PRE-EXISTING DIRTY FILES PRESERVED: YES — 24
PRE-EXISTING DATABASES TOUCHED: 0 — all 17 preserved
OWNED TEMP PROCESSES / WATCHERS / BROWSERS / DATABASES REMAINING: 0
```

Stage 1 verification: the pure source probe passes; repository links, JSON/Python
syntax and whitespace are checked. Only docs/evidence change. No runtime tests,
build, migration gates, deployment or fresh Final Gate were run for this proposal;
the accepted B32 production PASS is historical evidence, not a new deployment.

Proposal, source evidence and current remainder → commit/push → STOP.
