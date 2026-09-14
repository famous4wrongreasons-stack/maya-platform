# Package 5 B9 — Client Wanted Slot Schema/Contract Proposal V1

Status: **PROPOSED — owner decision required; not implemented**

Accepted checkpoint: `e08625fd`. This is a Final Remediation proposal inside
Package 5, not Wave 7. It does not reopen Waves 1–6 or B7/B8.

## 1. Proven gap

`remember_wanted_slot` means that a verified Client asks Maya to remember one
occupied appointment time for one staff member and contact the Client if a
matching slot becomes available. That request is a durable Client-owned business
fact and an AC1 command. AI may initiate it but cannot resolve or create Client
identity.

No canonical model currently represents this fact:

- `OperationalWorkItem` is a staff task/support aggregate. It requires an
  assignee Membership and cannot represent a guest Client's waitlist request.
- `Appointment` represents an existing booking; a wanted slot is not a booking.
- `CustomerProfile` contains profile/preferences and cannot honestly encode
  multiple independently expiring slot requests.
- `InboxItem` is a User presentation projection and is not the request owner.
- legacy SQLite `slot_waitlist` is the only current storage. It keys a legacy
  Client plus provider staff id and local time, has mutable notification flags,
  and has no tenant, branch, canonical Staff link, ActionExecution or generation.

`EXISTING CANONICAL SCHEMA SUFFICIENT: NO`

## 2. Proposed owner and authority

Add one model named **`ClientWantedSlotInterest`**. It is the canonical owner of
the request; Client owns it and an ActionExecution owns each explicit mutation.

Canonical create flow:

```text
authenticated channel
  -> verified tenant-qualified ClientChannelLink
  -> canonical Client
  -> add_client_wanted_slot AC1 command
  -> ClientWantedSlotInterest + ActionTargetMutation + SUCCEEDED execution
```

AI, PWA and Telegram are initiators only. Missing/ambiguous link fails closed.
Phone, Telegram subject, legacy Client row and `get_or_create_client` are not
identity authority. Provider availability reads cannot create this row.

A provider cancellation/availability fact remains AC4; deterministic matching
is AC5. Any offer delivery uses the established communication-delivery owner.
The wanted-slot row does not grant delivery authority or bypass consent/preferences.
Provider reads do not use `UNKNOWN`; an actual external message attempt keeps the
already approved delivery outcome/reconciliation contract.

## 3. Minimal proposed model

| Field | Meaning / invariant |
| --- | --- |
| `id String @id @default(uuid())` | Internal identity. |
| `tenantId String` | Required tenant boundary. |
| `clientId String` | Required canonical Client; User remains optional. |
| `branchId String` | Exact tenant-qualified branch whose availability is watched. |
| `staffId String` | Exact canonical Staff; provider identity is resolved through existing StaffProviderLink, never accepted from consumer payload. |
| `desiredStartAt DateTime` | Exact requested instant in UTC, derived from tenant timezone plus validated input. |
| `matchToleranceMinutes Int` | Immutable V1 policy snapshot for matching; value needs owner decision below. |
| `status String @default("ACTIVE")` | Allowlisted lifecycle proposed below. |
| `createdByActionExecutionId String` | One-to-one successful `add_client_wanted_slot` execution. |
| `lastMutationActionExecutionId String` | Latest successful explicit cancel/terminal command, nullable at creation. |
| `sourceChannelLinkId String` | Verified active ClientChannelLink used for the request; audit evidence, not permanent delivery routing. |
| `matchedSourceEventId String?` | Optional exact immutable availability/cancellation source fact that caused a match. |
| `matchedAt DateTime?` | Server-derived match time. |
| `notifiedAt DateTime?` | Projection of confirmed communication outcome; not evidence that a send succeeded by itself. |
| `terminalAt DateTime?` | Server-derived terminal transition time. |
| `createdAt/updatedAt DateTime` | Server-derived row timestamps. |

Required composite relations use `[id, tenantId]`/tenant-qualified foreign keys
to Tenant, Client, Branch, Staff, ClientChannelLink and ActionExecution. No field
stores `chat_id`, phone, name, provider token or raw provider staff id.

Proposed indexes/guards:

- `@@unique([id, tenantId])`;
- `@@unique([createdByActionExecutionId, tenantId])`;
- active duplicate identity is tenant + Client + branch + Staff + exact
  `desiredStartAt`; concurrent duplicate create has one logical row;
- desired time must be future at creation; matching never rewrites immutable
  Client/branch/Staff/time/tolerance/create binding;
- every explicit status mutation uses expected target generation and the common
  `ActionTargetMutation` proof;
- physical delete is forbidden; no historical backfill from SQLite;
- status/timestamps/source-event combinations are database-guarded.

## 4. Proposed lifecycle

Recommended V1 states:

```text
ACTIVE -> MATCHED -> NOTIFIED
ACTIVE -> CANCELLED
ACTIVE -> EXPIRED
MATCHED -> CANCELLED
```

`ACTIVE` means the Client is waiting. `MATCHED` means an accepted source fact
proved a matching free slot and the communication handoff is durable. `NOTIFIED`
requires a confirmed delivery outcome. `EXPIRED` is server-derived when the
requested window passes. No state means a booking or reserves the slot. Retry and
restart return the same durable outcome; concurrent terminal transitions have one
winner. Notification failure preserves the request/handoff for safe retry and
does not pretend delivery.

## 5. Decisions that legacy behavior cannot approve

The observed SQLite values are evidence, not canonical policy. Approve or change
these V1 choices before schema/runtime implementation:

### D1 — match window

**Recommended A: exact start (`0` minutes).** The Client asked for a concrete
occupied slot; Maya matches only that exact provider slot. This is least
surprising and avoids unsolicited offers.

- B: fixed `±20 minutes`, preserving current behavior.
- C: Client selects a bounded tolerance per request; requires a separate input
  policy and UI semantics, so it is not recommended for minimal V1.

### D2 — expiry

**Recommended A: expire at `desiredStartAt`.** A waiting request has no meaning
after the requested start and needs no configurable retention decision for V1.

- B: expire at end of the tenant-local day.
- C: remain active until explicit cancellation, which permits stale/unbounded
  waitlist state and is not recommended.

### D3 — one Client's active request limit

**Recommended A: maximum 10 active requests per tenant.** The 11th rejects
atomically with `CLIENT_WANTED_SLOT_LIMIT_EXCEEDED`; no silent eviction.

- B: maximum 5.
- C: unlimited, not recommended because it permits unbounded Client state and
  notification fan-out.

### D4 — delivery recipients

**Recommended A: notify the requesting Client only through an eligible verified
channel under existing consent/preference and communication-delivery rules.**
Owner/staff can read a privacy-safe operational projection, but creation does not
automatically send them a message.

- B: Client plus a canonical owner/staff InboxItem for every new request/match.
  This adds notification policy and fan-out.
- C: staff/owner only; this breaks the current customer-facing promise.

### D5 — matching capacity

**Recommended A: one freed slot may offer to at most 3 earliest ACTIVE matching
requests, preserving observed capacity as an explicit V1 policy.** Delivery order
is `createdAt, id`; each item has its own durable outcome. This does not reserve
the slot or guarantee booking.

- B: one earliest Client only.
- C: all matching Clients, not recommended due to unbounded fan-out.

## 6. Referral read boundary (no schema proposal)

`get_referral_link` remains strictly read-only. Existing canonical schema can read
tenant referral configuration and existing CustomerReferral/reward state, but it
does not persist a retrievable plaintext personal invitation code: canonical
relationship identity stores only hashes. V1 must therefore return the existing
canonical state and an unavailable/no-link result when no already present safe
presentation exists. It must not issue code/value/referral facts or create Client.
Adding a new personal link issuance/presentation contract is outside this
proposal and would require a separate decision; it cannot be smuggled into a read.

## 7. Required implementation proof after approval

- verified Client create, duplicate/retry/restart, competing/concurrent commands;
- missing/ambiguous/cross-tenant Client rejection and Client count unchanged;
- exact Staff/branch/provider link and tenant timezone validation;
- active limit and overflow atomicity;
- deterministic match/order/capacity and expiry boundary;
- match source fact immutability; no booking/reservation implied;
- delivery preference/consent and durable outcome boundary;
- no SQLite fallback, `chat_id` identity, hidden Client or provider mutation;
- referral existing/missing/ambiguous/cross-tenant/repeated/failed reads leave all
  business state byte-equivalent and never issue Client/referral/value facts;
- ratchets reject AI `get_or_create_client`, read mutation and direct waitlist SQL.

```text
B9 WANTED-SLOT CONTRACT CLASS: A18 / AC1 CREATE + AC4/AC5 MATCHING
CANONICAL OWNER PROPOSED: ClientWantedSlotInterest
ADDITIONAL SCHEMA REQUIRED: YES
NEW MODELS PROPOSED: 1
BACKFILL PROPOSED: 0
PRODUCTION MUTATIONS: 0
B9 RUNTIME REMEDIATION CAN RESUME: NO — D1…D5 OWNER DECISION REQUIRED
```
