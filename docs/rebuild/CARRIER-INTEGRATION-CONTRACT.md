# What the presentation carrier expects from the backend

Written by the presentation side, for the backend side, before merge.
**Zero backend files were changed to produce it.** Nothing here is a request for work; it is a
statement of what the carrier already assumes, so that a disagreement surfaces now rather than on a
phone.

Scope note: the carrier owns AChat, the React presentation, the widget renderer, the voice
presentation, PWA/Capacitor parity and the presentation ratchets. It owns no endpoint, no
entitlement, no activation contract and no booking authority.

---

## 1. Endpoints

The carrier reaches **none** of these directly. Every one is called by the published runtime's one
client, behind an `Authorizer` that lives in a closure inside `createNet` and that presentation can
neither see nor construct. The carrier's own build refuses `fetch`, `XMLHttpRequest`, `WebSocket`,
`EventSource` and `sendBeacon` in every source file, and refuses any origin in the emitted bundle
that is not accounted for by name.

`net/client.ts` `PATHS`, all under `API_BASE`:

| path | used by | carrier depends on it for |
|---|---|---|
| `/mobile/pwa/search` | `SessionPort.findBusinesses` | the first-run business finder |
| `/auth/oauth/telegram/start` | `SessionPort.startTelegram` | the hand-off. Its `auth_url` is checked against the `https://oauth.telegram.org/` prefix in `net/project.ts:81` **before** the shell navigates; the carrier relies on that check existing and would refuse to add its own |
| `/auth/oauth/telegram/complete` | `SessionPort.completeTelegram` | single-use. The carrier clears the URL fragment BEFORE landing it, so a reload cannot burn a login that already worked |
| `/auth/email/start`, `/auth/email/verify` | `SessionPort.startEmail` / `verifyEmail` | the only sign-in path the carrier can drive on a desktop. `EMAIL_LOGIN_ENABLED` is the server's to set; when it is off the runtime answers `email_login_unavailable` and the carrier shows that sentence |
| `/auth/login` | `SessionPort.signInPassword` | present in the runtime; the carrier does not surface it |
| `/auth/refresh`, `/auth/logout` | the client, internally | the carrier never sees a token |
| `/ai/chat` | `Transport.chat` | one turn at a time, `{surface, requestId, messages}` |
| `/ai/transcribe` | `Transport.transcribe` | `{audioBase64}` — a full `data:audio/wav;base64,…` string, PCM16 mono 16 kHz, 44-byte RIFF. **Not bare base64**, which is the natural misreading of the field name |
| `/widgets/intent` | `Transport.widgetIntent` | widget activation |
| `/widgets/resolve` | `Transport.resolveWidgets` | envelope resolution |

Timeouts the carrier inherits and does not override: 80 000 ms for a turn (5 s past the relay's own
75 s), 30 000 ms for transcription.

---

## 2. Widget activation

**What crosses the boundary.** Activation is `(itemId, ref)` and nothing else. `WidgetPort.activate`
returns `void` **on purpose** — the real `ActivationOutcome` is discarded at the port — so the
carrier learns what happened only from the next `ConversationView`: a new `display`, a `pending`, or
a `sentence`. Intent tokens live in the runtime's vault and never reach presentation. The carrier
has no way to mint an intent and does not want one.

**What the carrier does with `SubmissionOutcome`.** Nothing: it never sees it. The runtime turns it
into item state. For the record, so the mapping is agreed:

| outcome | what the runtime does | what the person sees |
|---|---|---|
| `advanced` | ingests the successor envelope | the card is replaced in place |
| `settled` | appends each `TerminalLine.text` as an assistant turn, sets `display: 'terminal'` | MAYA's sentence, and a card with no controls |
| `accepted` | state change | `pending` clears |
| `unavailable`, `forbidden` | one shared sentence | «Это действие сейчас недоступно» |
| `no_connection` | sentence | «Нет связи — действие не выполнено» |
| `server_error`, `unexpected_response` | sentence | as the runtime words it |

🔴 `unavailable` and `forbidden` share ONE sentence deliberately. Splitting them would tell the
person whether an action is merely unavailable or closed **to them**, which is authorization state.
The carrier will not split it.

**The one real integration dependency.** Today a widget card cannot appear from a live conversation
at all. Measured against the shell's own `chat_with_envelopes` scenario: the reply arrives, the
envelopes ride with it, and zero cards are drawn — the P1 binding does not consume envelopes from an
`/ai/chat` answer (that is B4 / `resolveWidgets`). Until that path is live, every widget proof is
necessarily fixture-based. **The carrier is ready for it and needs no change when it lands**: the
drawer already renders all 22 kinds from a sealed `RenderResult`, proven against all 40 envelopes.

---

## 3. Outcome semantics

**What reaches presentation today: one field.** `TerminalLine` has `outcome`, server-minted `text`
and `action_receipt_ref`. The wire projection validates all three — including the invariant that
`action_receipt_ref` is non-null exactly when `outcome === 'CONFIRMED'` — and then the runtime reads
**only `line.text`**, appending it as an ordinary assistant turn. `line.outcome` and
`line.action_receipt_ref` are read nowhere. `lifecycle.delivery` is never projected.
`TimelineItemView` has no member that could carry an outcome.

So a faithful outcome presentation today renders exactly what it renders now: the server's sentence.

**The carrier has made that unforgeable rather than conventional.** A `no-outcome-invention` ratchet
refuses `action_receipt_ref`, `terminal_lines`, `reread_intent`, `TerminalLine`, `TerminalOutcome`,
`CONFIRMED`, `NOT_CONFIRMED`, `EXPIRED_UNUSED` and `DELIVERED_ONLY` anywhere in carrier source.
(`SUPERSEDED` and `CANCELLED` are deliberately **not** refused — they are also `LifecycleState`
members that `RenderResult.lifecycle` really carries, and a fixture pins that they stay admitted.)

**If the backend wants a client to show CONFIRMED / NOT_CONFIRMED / SUBMITTED-unknown**, that is a
runtime contract change, not a presentation change, and it needs:
1. a member on `TimelineItemView` (or a new port) that carries the outcome; and
2. a decision about what a client may see, which `ports.ts:165-168` explicitly defers to R7-E1/B3.

The carrier will not derive it from an HTTP status, a tap, or the text of a reply. `action_receipt_ref`
must not be exposed to the UI in any form.

---

## 4. Booking activation

**Rendering is done and proven; activation is not the carrier's.** All four canonical kinds —
`SERVICE_SELECTOR`, `STAFF_SELECTOR`, `TIME_SLOT_SELECTOR`, `BOOKING_CONFIRMATION` — render from the
canonical `RenderResult`, fixture-only. The carrier does not read the `widgets.runtime` entitlement,
does not branch on it, and must not be asked to: an entitlement a client evaluates is an entitlement
that can be told to evaluate differently.

**Fail-closed is proven, and is the property to preserve.** Across the corpus, no `COMMIT` and no
`DRAFT` survives a non-valid verdict or an expiry. Five booking fixtures answer `frozen_prose` with
at most the one server `REFINE`; a superseded predecessor offers nothing. Three others —
`booking-token-changed`, `booking-receipt-pointers-changed`, `booking-root-values-changed` — keep
their `COMMIT`, because intent tokens and receipt pointers are stripped before the body hash. That
is understood as design, not as a hole.

What the carrier assumes when activation opens:
- the drawn `ref` set is authoritative — `intents.ts` already refuses a ref that is not in
  `readingOrder`, and the carrier relies on that rather than filtering its own controls;
- `display: 'pending'` arrives while an activation is in flight, and the carrier marks the card
  `aria-busy` and `aria-disabled`s exactly that ref;
- a terminal card is drawn **whole**, not collapsed, and carries no control;
- the old `ABook*` lifecycle is not coming back in any form.

---

## 5. What the carrier guarantees in return

Enforced by the build, with a refusing **and** an admitting fixture for each rule — a rule with no
refusing fixture is a rule nobody has proved works.

| guarantee | rule |
|---|---|
| presentation makes no request | `no-network-in-presentation` |
| nothing at rest | `no-storage`, plus a bundle scan that includes dependencies |
| no capability decided on the client | `no-capability-decision` |
| no outcome invented | `no-outcome-invention` |
| no legacy egress | `no-legacy-transport`, `api-proxy` and `malesthetic.pro` banned in the shipped bytes |
| one href writer, scheme-checked | `request-sink` + `src/reply-link.tsx`, pinned against the shell's own implementation over 35 hostile candidates |
| one microphone, behind one gesture | `no-second-microphone`, `voice-hygiene` |
| only the published runtime is imported, at its published hash | `runtime-allowlist` |
| one origin in the artefact | the target proof's origin table |
| a closed element set | `closed-tag-set`, `input-type` (text/email/password literals only) |

Current state: gate 0 refusals over 19 source files, typecheck green over the carrier plus 20 runtime
modules against the certified contract (201 exports), self-test refuse 50 / admit 42 / 0 failures,
86 tests / 0 failures.

---

## 6. Open, and owned elsewhere

1. **Envelope ingestion from `/ai/chat`** (§2) — the single thing standing between a proven renderer
   and a card a person can see.
2. **`widgets.runtime`** — the activation gate. Not read by the carrier; not to be.
3. **An outcome channel** (§3) — a runtime contract decision, deferred by the contract itself.
4. **Booking authority** — `appointments.own.create` is `CLIENT_ROLES` and the owner is
   `tenant_owner`; a separate workstream, no presentation component.
