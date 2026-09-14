# Package 5 Final — B21 realtime authority/history Contract/Schema Proposal V1

Status: **OWNER DECISION REQUIRED — RUNTIME/SCHEMA/MIGRATION IMPLEMENTATION NOT STARTED**

Accepted checkpoint: `480c1f41`.

This is Package 5 Final Remediation for B21/A18. It is not P4-11, Wave 7 or
Chapter 7, and it does not reopen Waves 1–6 or B7–B20.

## 1. Reconstructed production state machine

The active WebSocket currently follows this sequence:

```text
CONNECT
  -> accept Telegram init data / Telegram Login Widget / legacy web_session_token
  -> reduce accepted identity to raw chat_id
  -> check legacy consent by chat_id
  -> send ready
  -> try optional canonical channel proof; ignore failure
  -> resolve role by raw chat_id
  -> load shared conversation by raw chat_id
  -> invoke AI/tools with raw chat_id as user_id
  -> write transcript/reply to the legacy conversation file under raw chat_id
  -> close; reconnect reuses the same raw key
```

This order makes a channel identifier and legacy session the Client, role,
private-projection and durable-history authority. Consent is checked before the
canonical Client is known. Failure to resolve a verified channel link does not
prevent `ready` or tool execution.

The approved target order is:

```text
CONNECT
  -> AUTHENTICATING
  -> verify one canonical authority plane
     client: trusted channel subject -> active tenant-qualified ClientChannelLink
             -> exact canonical Client
     staff:  Maya JWT/AuthIdentity -> active Membership -> A16 access/role
  -> evaluate canonical consent/preferences for the resolved principal
  -> CLIENT_READY or STAFF_READY
  -> create the permitted private projection/tool capability set
  -> conversation + canonical action initiation
  -> close
```

No `ready` state exists before the principal and authority plane are complete.
The two authority planes cannot be merged: a verified Telegram subject may prove
channel possession, but it does not grant staff/admin authority. Every reconnect
repeats authentication, active-link resolution, tenant checks, role/access checks
and consent/preference evaluation. Cached `chat_id`, role or Client resolution
is never reused as authority.

## 2. Existing foundations that are sufficient

No new identity, role, consent or action foundation is needed:

- `ClientChannelLink` plus the existing Client channel authenticator/runtime can
  prove an exact active tenant/provider/HMAC-qualified Client binding, including
  a Client without a Maya User.
- `AuthIdentity`, `Membership` and `CrmStaffAccess` express the staff/admin plane
  and the A16 access boundary.
- canonical Client consent/preferences can be evaluated only after Client
  resolution.
- the existing action ingress/executors remain the only business-mutation owners;
  realtime is an intent surface and cannot write business facts directly.

The current PWA must present a supported channel proof or Maya JWT inside the
first WebSocket authentication message. A legacy `web_session_token`, raw
`chat_id`, phone, consent fact or caller-supplied Client id is not an accepted
authority source.

`IDENTITY/ROLE FOUNDATION SUFFICIENT: YES`

`NEW IDENTITY MODEL REQUIRED: NO`

`NEW ACTION CLASS REQUIRED: NO`

## 3. Proven durable-history gap

The canonical schema does not contain a Client-owned realtime conversation or
ordered Client transcript aggregate:

- `AiBrainSession` deliberately never persists raw messages or chain of thought,
  and it requires `actorUserId` plus `Membership`; it cannot own history for a
  Client without a Maya User.
- `AiMemoryFact` is an explicit, bounded `REMEMBER` fact for a Maya User. It is
  not dialogue history and rejects personal/contact data.
- `InboxItem` is a User message-of-record projection, not a Client conversation.
- `DomainEvent` is immutable event evidence, not mutable ordered dialogue state.
- `ClientChannelLink` is identity/verification evidence and cannot be used as a
  transcript payload container.
- Communication Delivery models own outbound delivery outcomes, not an
  interactive conversation.

The legacy global conversation file is therefore the only active durable history
owner. It is keyed by raw `chat_id`, has no tenant/Client foreign key, canonical
retention policy, encrypted-at-rest contract, per-Client concurrency guard or
verified-authority binding.

`CANONICAL DURABLE CLIENT HISTORY FOUNDATION SUFFICIENT: NO`

## 4. D1 — Client realtime history in Chapter 6

### Option A — ephemeral realtime context V1

Recommended.

- After `CLIENT_READY` or `STAFF_READY`, keep only a bounded in-memory context for
  that WebSocket connection.
- Do not read or write the legacy global conversation file.
- Closing the socket destroys the context. Reconnect starts a new context after
  full reauthentication and authority resolution.
- Text chat, Telegram and voice do not share transcript history in V1.
- Canonical action executions, appointments, preferences, consent, delivery
  outcomes and other approved facts remain durable in their existing owners.
- Explicit approved `REMEMBER` behavior remains separate and does not receive a
  raw-transcript shortcut.

Schema effect: **none**. Models: **0**. Migrations: **0**. New action classes:
**0**.

Business/user effect: a Client cannot continue the prior voice transcript after
reconnect and will not see voice context automatically shared with text or
Telegram. No booking, consent, profile, preference or other canonical business
state is lost.

### Option B — encrypted Client-owned durable realtime history

Add one minimal aggregate, proposed name **`ClientRealtimeConversation`**. It
would be tenant-qualified and Client-owned, use a server-issued conversation id,
store only an encrypted bounded transcript aggregate plus integrity metadata,
and use generation/CAS for append and reconnect concurrency. It would never
store raw `chat_id`, phone or provider subject as identity.

Minimum proposed fields if this option is selected:

| Field | Purpose |
| --- | --- |
| `id` | server-issued conversation identity |
| `tenantId`, `clientId` | exact canonical owner and isolation boundary |
| `originChannelLinkId` | immutable verified link used to start the conversation; not a permanent delivery route |
| `surface` | allowlisted conversation surface |
| `encryptedTranscript` | reversible encrypted bounded dialogue payload |
| `transcriptHash` | integrity evidence over the canonical plaintext representation |
| `encryptionKeyVersion` | existing EncryptionService key-version binding |
| `messageCount`, `plaintextBytes` | enforced bounds without decrypting for every inventory query |
| `generation` | compare-and-swap append/reconnect concurrency |
| `retentionPolicyVersion`, `expiresAt` | server-derived approved retention snapshot |
| `status`, `createdAt`, `updatedAt` | allowlisted lifecycle and server time |

Required database guards would include tenant-qualified RESTRICT foreign keys to
Tenant, Client and the originating `ClientChannelLink`; immutable owner/origin,
surface and retention snapshot; generation-monotonic updates; and physical
deletion only through an approved retention owner. Backfill would be `0` because
legacy raw-chat history cannot become fake canonical Client history.

This option cannot be implemented until the owner separately approves:

1. exact retention period and deletion/erasure/export authority;
2. maximum messages, plaintext bytes and encrypted bytes;
3. whether reconnect resumes the same conversation and how a conversation ends;
4. whether history is voice-only or shared across Client channels;
5. which staff roles, if any, may project Client transcripts;
6. whether full transcript persistence is necessary or structured summaries are
   sufficient, including who may create a summary.

Schema effect: **one new model**. New action class: **none expected** for
conversation append only if the owner later classifies it as bounded operational
state rather than a business mutation. That classification remains undecided.
Retention deletion must reuse the approved central/versioned maintenance owner or
receive an explicit addition to its allowlist.

## 5. D2 — missing or ambiguous Client binding

### Option A — fail closed and require verified linking

Recommended. The server returns `link_required`/`unauthorized` and closes before
OpenAI, private projections, history access or tools start. This matches the
approved A18/B8–B20 identity contract.

### Option B — anonymous public-only voice

Allow a separate anonymous surface with no Client role, private projections,
business tools or durable history. This is a new product, abuse-control and cost
authority contract and is not approved by current Package 5 foundations.

`RECOMMENDED: D2-A`

## 6. Permanent invariants under either history option

```text
VERIFIED ClientChannelLink REQUIRED BEFORE CLIENT_READY: YES
RAW chat_id AS CLIENT/ROLE/HISTORY AUTHORITY: NO
LEGACY SESSION AS CLIENT AUTHORITY: NO
PHONE MATCH AS CLIENT AUTHORITY: NO
CONSENT FACT AS IDENTITY PROOF: NO
STAFF AUTHORITY: AuthIdentity + Membership + A16 access
TELEGRAM CHANNEL IDENTITY AS STAFF AUTHORITY: NO
PRIVATE CLIENT PROJECTION BEFORE CLIENT_READY: NO
BUSINESS MUTATION BEFORE CLIENT_READY: NO
REALTIME AS BUSINESS MUTATION OWNER: NO
RECONNECT REAUTHENTICATION/ACTIVE-LINK RESOLUTION: REQUIRED
LEGACY CONVERSATION WRITER: FORBIDDEN
LEGACY HISTORY FALLBACK: FORBIDDEN
```

## 7. Required proof after owner approval

- exact state-transition proof and no pre-ready OpenAI/private/tool capability;
- verified Client, Client without Maya User, missing/revoked/ambiguous/wrong-
  tenant binding, forged `chat_id`, forged phone and forged Client id;
- staff JWT/AuthIdentity/Membership/A16 success and cross-tenant/expired/revoked
  access rejection;
- Client cannot select staff mode; Telegram subject cannot grant staff authority;
- consent/preferences evaluated only after identity and do not resolve identity;
- reconnect after link revocation fails closed and cannot reuse old authority;
- repeated/concurrent connect does not create Client/link/consent/history facts;
- canonical action initiation only; no direct business writer in realtime;
- selected D1 history behavior, bounds, concurrency and retention proof;
- ratchets reject legacy session/raw-id authority, pre-ready projection/action,
  legacy conversation reads/writes and direct business mutation.

## 8. Owner decision requested

`D1 RECOMMENDED: A — EPHEMERAL REALTIME CONTEXT V1`

`D2 RECOMMENDED: A — FAIL CLOSED / REQUIRE VERIFIED CLIENT LINKING`

`EXISTING SCHEMA SUFFICIENT IF D1-A: YES`

`ADDITIONAL SCHEMA REQUIRED IF D1-A: NO`

`ADDITIONAL SCHEMA REQUIRED IF D1-B: YES — ONE MODEL, AFTER RETENTION/PRIVACY/LIMIT DECISIONS`

`B21 RUNTIME REMEDIATION CAN RESUME: NO — OWNER DECISION REQUIRED`

`PRODUCTION MUTATIONS: 0`
