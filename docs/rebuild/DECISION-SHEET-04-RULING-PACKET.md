# DECISION SHEET 04 — the ruling packet for gates, served shell, capability parity and Telegram

**Status: OPEN — four owner rulings (R-01..R-04), one deferred (R-05), thirteen readings that need a
recorded yes (Block A), forty-seven cheap confirmations (Block B).**

How this was produced: 173 candidate questions came out of the clause-level specs for Gates 6–13, the served
shell plan, the K14 plan and the G2 triage of 326 open rows. Each was screened against the certified contract,
the approved owner decisions, the signed K1 binding conditions, Decision Sheets 01–03 and this cycle's rulings,
and each surviving candidate was then given to a skeptic whose task was to prove it already settled. Only what
survived is asked below. Everything else is listed with its citation, so a reader can check that nothing was
decided silently.

---


Assembled 2026-09-17 from four domain screens (gates, shell, K14, G2) and their refutations.
Canonical repository read only, at HEAD `fc49cfc5`. Nothing in production was touched.

**Abbreviations.** C = `docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md` · ENV = `MAYA-CHAT-FIRST-IMPLEMENTATION-ENVELOPE.md` ·
OD = `MAYA-CHAT-FIRST-UX-OWNER-DECISIONS.md` (12/12 approved at `bd502e2f`) · DS01/DS02/DS03 = decision sheets 01–03 ·
K1SIG = `evidence/maya-chat-first-ux/k1/k1-signature.json` · K1DOS = K1 human-judgement owner dossier ·
SPG = `evidence/maya-chat-first-ux/section-packages-and-gate-v2.md` · CYCLE = this cycle's owner rulings.
`[V1.1]` marks text that changes the certified contract. The contract has no errata layer (C:5-7), so all of it
ships as one contract version, signed together with the answer to R-01.

| Group | Rulings |
|---|---|
| 1 · Gate critical path (live proof of Gates 8-R..13) | **0** (every question reduced to a reading; four need a recorded yes: A1–A4) |
| 2 · Served shell and envelope delivery | **0** (two readings need a recorded yes: A5, A6) |
| 3 · Capability parity | **2** (R-01, R-02) |
| 4 · K14 Telegram | **2** (R-03, R-04) |
| 5 · Deploy / cutover prerequisites | **1**, deferred (R-05) |

---

## RULINGS NEEDED

### Group 1 — gate critical path: none

Every gates candidate has one defensible reading. The two raised as genuine, in-chat booking (AMB-16) and the
expired-tap envelope (AMB-50), were refuted: each is decided by approved text. They still change certified text,
so they are listed first under Confirm, block A.

### Group 2 — served shell and envelope delivery: none

Credential storage (SH-01) and detail fill (SH-03) were refuted to single readings (A5, A6). The Android wrapper
question is a cutover matter and appears as R-05.

### Group 3 — capability parity

#### R-01 · Does the contract version that must happen anyway also open the C9 registry for existing owners?

**Question.** You approved a frozen C9 capability registry: no new key, and the final gate requires «C6–C9 diff 0».
You also signed about 30 K1 rows that move a capability into chat («the widget emits every fact this surface
showed»). For those rows the business owner already exists in code but has no registered C9 key, so chat cannot
reach it. The signed binding keeps the legacy surface until a protected successor exists. The legacy bundles are no
longer publicly served (R3) and the app entries show the maintenance page, so in practice those users do not keep
it. A contract version is needed anyway to record the block-A amendments. The question is whether that version also
registers keys for these existing owners, and how far it goes.

**Why open.** C:52-53 F3: «no new key in `C9_CAPABILITIES` … no change to `C9_REGISTRY_HASH`». ENV:653 G8:
«C6–C9 diff 0». C:2416 K11 allows a change only through «a version bump of this contract carrying a recorded
owner decision». Against these stands K1SIG binding G02–G06: «do not retire the legacy surface until a canonical
protected successor exists».

**Options.**
- **A · Registry stays frozen.** Rows close on recorded gaps, as V1 already did for GAP-CONSENT-READ, so G2 can
  close. G3 («lost 0») stays red. About 20 capabilities (about 45 rows) have no chat successor and, with legacy
  unserved, are unavailable to users. A7's template catalogue and release-notes card would have to be re-signed
  as withdrawn.
- **B · Reads only.** Register an enumerated list of READ keys: CAP-07, 08, 16, 18, 19 (feed), 20, 23, 26, 28,
  32, 43, 44, 45, 47, 49; catalog.staff.read output versions (CAP-06, CAP-46); C7 summary kinds (SC-21, SC-22
  summary, SC-24, SC-30); and the two static reads in A7. Each key gets an owner-authored consent_class under the
  Sheet-01 rules, a derived floor, a C9_FLOOR_BASELINE row and CLIENT_CHANNEL principal kinds where needed. G8 is
  re-based to exactly this list. No write moves, and every owner keeps its own role fence.
- **C · B plus non-money writes.** Add PROPOSE_ONLY/OWNER_HANDOFF keys with AE_PROPOSE_PAIRING rows and F79
  admissions for CAP-09, 10, 19 (send), 21, 24, 30, 31, 33 (handoff), 35, 36, 42, 52. The money, consent,
  identity and tenant-authority vetoes stay. This gives more parity, but every new write path needs the Gate 7/13
  proofs and a booking-style amendment. It also widens what the full P-01 gateway must prove before anything
  actuates (AMB-01b).

**Recommendation: B.** Reads are most of the signed rows and carry no commit path, and one enumerated version
preserves FR-16's purpose: no silent registry drift.

**Unblocks.** G2 closure for about 45 rows, including S-029, S-094, S-373, S-375, S-391 and S-511; K8/K10 parity
proofs; a later revisit of kept-detail routes (A10); and the wider scope noted in A1 if a client-data refine gets
registered.

#### R-02 · Which part of the appointment journal may a plain master see?

**Question.** A master who is not owner, manager or administrator opens the appointment journal. Today the backend
returns the whole salon's journal, with client names and visit notes, because `getJournal` takes no actor. One
comment in the module says everyone else sees only their own visits; another describes the journal as «работа всей
смены» (the whole shift's work). Which one is intended?

**Why open.** K1SIG:94: «INTENT UNDECIDED - two comments in the same module disagree … an owner decision the
staff-journal package must surface». Conflicting code comments: `crm.service.ts:3270-3271` versus
`crm-integration.controller.ts:46-48`.

**Options.**
- **A · Actor-scoped.** providerId is forced to the master's own staff binding; a foreign providerId or an unbound
  account gets 403. Masters stop seeing colleagues' visits; shift coordination goes through owner or admin.
- **B · Salon-wide with client identity.** This is current behaviour: every master sees every client's name and
  visit notes.
- **C · Salon-wide without client identity** for roles outside JOURNAL_FULL_ACCESS_ROLES. This matches the existing
  PII-free key `operations.journal.read`. Masters see shift occupancy but not who the client is.

**Recommendation: A.** It is what the module's access comment says («Остальные — только собственные визиты»), it
matches G03's self-scoping and 152-FZ minimisation, and C remains available if masters need the shift view.

**Unblocks.** The S-026/S-092 fence, the C10 host choice, and closure of S-027, S-093, S-224 and S-227. The own-day
successor (CAP-18) does not wait.

### Group 4 — K14 Telegram

#### R-03 · Through which door does a Telegram command reach the one gateway?

**Question.** Under D11-B, Telegram only delivers and hands off, and a polling bot holds no widget tokens. K14 still
requires every Telegram command to go through the one gateway and be recorded against a capability. The contract
allows exactly two new routes, and both take widget tokens. No conformant door exists for a bot's command text.

**Why open.** C:25-27: «Exactly two new routes exist in the whole programme». C:1637 FR-5 makes one pipeline the
single ingress for all carriers. C:4259-4268 §3.8 requires `intent_token` and has no text field.

**Options.**
- **A · One internal, read-only bot→Nest route** with its own token, recorded as an amendment to P-01. Router, mint
  and fit stay in Nest; Telegram only relays and renders URL buttons. No new Action Engine capability is needed,
  because a HANDOFF invokes nothing (F69). Cost: G8's «routes ≤ 2» becomes 3, and there is a new credential and
  bind check (K14-17).
- **B · Admit bot command text to `/api/widgets/intent` or `/resolve`.** The route count holds, but the certified
  §3.8 shape changes (no utterance member, token required, F88's closed keys), and a channel-identity carrier
  enters the widget routes.
- **C · Reuse the pre-programme dispatcher** `/api/internal/legacy/client-commands/:operation` and call the
  gateway in-process. No route is declared, but this rests on a contested reading of «new route», reuses the
  shared legacy bridge token (which gates 11 Nest files, some of them mutating), and breaks that controller's
  client-only boundary.
- **D · No runtime ingress this cycle.** K14 stops at CI conformance and the legacy handlers stay. K14's exit
  («Telegram commands executing into an unreachable body 0») is not met.

**Recommendation: A.** It adds no public surface, leaves the widget routes and §3.8 untouched, and makes the
exception explicit instead of hiding it in an old door.

**Timing.** Not needed while K14 runs shadow-only, which it does until the shell is served (K14-05). Needed before
K14 Phase B.

**Unblocks.** K-g, K-h, P-a, P-b, P-e and R16 (all of K14 Phase B), plus the K14-17 credential.

#### R-04 · Until the in-app revoke route is live, how is a phone or e-mail withdrawal of marketing consent recorded, and what may the bot promise?

**Question.** The approved bot copy (D9-bis step B, commit `4f2914f5`, not deployed) tells a client to phone or
e-mail to withdraw marketing consent, and adds «администратор оформит отзыв и подтвердит» (the administrator will
process the withdrawal and confirm). No staff path can record that withdrawal: the legacy writer raises an error,
and the only canonical consent write is the client's own `PATCH me/profile`. The D9-A in-app revoke route, which
the copy is meant to point to later, is not live. Two options are already ruled out: widening the consent gate for
`/unsubscribe` leaves the unkept promise in place, and changing nothing breaks D9-bis C.

**Why open.** `database.py:1052-1054`: `raise RuntimeError("canonical_client_consent_required")`, against the
approved bytes `bot.py:582-583` «администратор оформит отзыв и подтвердит». OD D9-bis C requires that «в каждый
момент времени то, что написано, совпадает с тем, что работает» (at every moment, what is written matches what
works).

**Options.**
- **(i) A staff revoke-only door onto the existing consent owner.** `recordClientConsent(…, granted: false)` under
  staff authority, with provenance «received by phone/e-mail»; it can never grant. This makes the approved bytes
  true and has the «one owner, two doors» shape D9 allows. It is a new ingress, so only you can authorise it.
- **(ii) New copy that promises only that a person receives the request.** The copy becomes honest, but the
  withdrawal is still not recorded, so marketing to that client can continue until D9-A ships. Reopening approved
  bytes needs your explicit permission (OD:476).
- **(iii) Ship the approved D9-A marketing-revoke route first,** which does not wait on P20/P22, then point the
  copy at it. This is the permanent fix; until it ships, the gap is the same as in (ii).

**Recommendation: (iii) as the permanent fix, with (i) as the bridge.** Option (i) is the only one under which a
phone or e-mail withdrawal stops marketing in the system before the route ships.

**Unblocks.** Closing F-UNSUBSCRIBE; the bytes for K14-02 (`privacy_policy.py:17`); the K14-04 comment fix; the copy
for K14 rows #6 and #7; the plan §2.5 copy ratchet.

### Group 5 — deploy / cutover prerequisites

#### R-05 · Which Android artefact carries the served shell to today's `pro.malesthetic.twa` users? (DEFERRED: ask when native cutover is scheduled)

**Question.** The existing Play app is a trusted web activity (TWA) wrapping `app.html` on `malesthetic.pro`. When
the Android cutover is scheduled, what do its installed users move to?

**Why open.** CYCLE: «native cutover NOT PROVEN until the wrapper changes» names no wrapper. OD:79 (D1 NATIVE,
approved) assumes «no Capacitor rebuild, no TWA rebuild and no store release». Against that, platform
`README.md:3-5` says «must never reuse `malesthetic.pro`», which is a platform rule, not an owner decision.

**Options.**
- **(0) Serve the successor at `malesthetic.pro/app/`.** The existing TWA picks it up with no store release, as the
  approved NATIVE rows assume, and push stays on the same origin. But a tenant domain fronts the multi-tenant
  shell, and the README rule must be amended.
- **(A) New platform TWA for `mayaos.ru/app/`.** A platform identity matching iOS `ru.mayaos.app`. Every user
  reinstalls and re-subscribes to push (G17).
- **(B) Store update re-pointing `pro.malesthetic.twa` to `mayaos.ru`.** No reinstall, but a tenant-branded
  signing key enters the multi-tenant origin's assetlinks, and push must be re-subscribed.
- **(D) No store artefact.** Android users install the PWA from `mayaos.ru/app/`. No store release, but the Play
  listing's users are not carried over.

**Recommendation: do not ask now.** When it is scheduled, lean towards (0) for the installed base and (A) for new
installs: (0) alone honours the approved no-store-release premise and D8's point that a TWA cannot be force-updated.

**Unblocks.** The Android native cutover only; nothing in P1, B1–B7 or web serving.

---

## CONFIRM THESE READINGS

### Block A — record a yes before building (changes certified text, a signed row, or details an owner answer)

- **A1 [V1.1] Booking in chat (AMB-16, G2-02).** R3.5.1 and its copies (R3.3.3, INV-8′, the Gate 6 re-check) stop
  forcing a class-s HANDOFF for REFINE/DRAFT on BOOKING_OWNER's own keys `appointments.own.{create,reschedule,cancel}`.
  F48 SENSITIVE_DEST and FLOOR_EXEMPT are unchanged, so rule 5 stands and no floor moves. This restores ENV:133 K7,
  F78, SERVICE.1, SCHED.2 and BOOK.3. Whether clients.*/customers.*/loyalty.own.read refines get the same treatment
  (a predicate split) makes no difference this cycle; it comes back if R-01 registers a client-data refine.
- **A2 [V1.1] Amendment-packet members.** All are additive widget-layer columns under D12-B, folded into migration 2
  before first deploy (or ENV G8's migration count is amended):
  - AMB-13: an AUDIT_RETAINED `confirmation_subject` record member. Until it exists, every booking COMMIT refuses at
    Gate 7.
  - AMB-32: an all-AUDIT_RETAINED Gate 10 divergence audit member (tenant, widget, tapped/resolved token hash,
    resolved effect, code, time; no utterance).
  - AMB-43: an AUDIT_RETAINED approve|reject decision member, plus the R3.11.3/4 route-name errata. Unreachable
    this cycle.
  - AMB-49: C5 exempts PERMISSION masks: `next_intent_ref` null, `capability_gap_ref` null.
  - AMB-60: a HANDOFF «signed target» is a principal-bound `{route_key, opaque_handle}` signed with
    `ActionIdentityService.hmac` and returned in `resolved_widget`; the landing route re-validates authority.
  - AMB-63: `confirmation.idempotency_key` and `approval_policy` are AUDIT_RETAINED; `readback_text` is
    CONVERSATION_CONTENT and not stored in `confirmationJson`.
- **A3 Gate 10 under DS-02.**
  - (a) Router (AMB-29): one candidate matcher over the live intents that returns a token, escape aliases first,
    compared through `subjectCapability`. This is reading C, not the corpus in DS-02's retained build list.
  - (b) Canonical owner (AMB-30, K14-07): §2.4 OwnerClass membership through `ownerClassKeys`. An AE key takes its
    paired propose key's owner; a CONTROL key takes its F27 owner endpoint; unregistered or TOOL keys fail closed.
    Two keys have the same owner iff their owner sets intersect, so overlapping reads are audited and booking→settings
    is refused.
  - (c) Null (AMB-31, K14-08): null against an actuating record (CONTROL, DRAFT, REQUEST_APPROVAL, COMMIT) refuses;
    null against a pointer record is recorded and published as NULL; AGREE requires both sides non-null. A tap
    whose own lowered utterance does not resolve is a mint/build defect under R3.12.4, caught in CI.
- **A4 [V1.1 clarification] Expired or superseded tap (AMB-50).**
  - At Gate 1 EXPIRED/SUPERSEDED and Gate 5 `policy_floor_changed`, return a successor minted with no canonical
    read: the predecessor's frozen `text_equivalent` plus one REFINE remedy on the widget's own owner capability,
    with draft and flow position kept server-side.
  - It is issued only when the record binds the live principal and tenant; otherwise the code alone is returned.
  - The remedy tap passes Gates 1–13. L10's re-mint happens after Gate 6, and L10's mechanism sentence is
    clarified.
- **A5 Detail and NAVIGATE reads (AMB-47, SH-03).**
  - Detail is filled by a NAVIGATE(detail) submission through the gateway (Gate 13 → projector → `next_envelope`).
  - Class w returns the stored sealed envelope under FR4, with no re-projection.
  - A detail or i-class re-projection first evaluates the source capability's floor and Gate 6 authority for the
    live principal.
  - K16's `(widget_id, density)` describes that detail branch, not the `/widgets/resolve` request set.
- **A6 Credential at rest (SH-01).**
  - Before the G09 sign-in rows retire, only the refresh token (never the access token) is kept in `localStorage`.
    Only `net/session.ts` reads it, only to call `/auth/refresh`, and never to route before the server answers.
  - Memory-only stays the default during the dark window.
  - An httpOnly cookie is excluded by the topology: CORS runs with credentials false, the relay forwards no Cookie,
    and iOS runs on a `capacitor://` origin.
- **A7 Signed needed-but-absent static reads (G2-07, G2-29).**
  - Build the tenant broadcast template catalogue (S-419/420/421/516) as an authenticated, static, read-only
    catalogue that only pre-fills `b35.preview`.
  - Build the S-352 release-notes card with a working seen-state write and without the broken freed-slot promise.
  - Both READ keys go on R-01's list.
- **A8 S-241 owner brief (G2-06).** Amend the signed successor: drop the expandable list of client phones and keep
  alerts and summary. Reminders run only through `b35.preview` → APPROVAL → `b35.confirm`. C8 contracts forbid
  contacts, and S-499 keeps client phones out of conversation surfaces.
- **A9 Platform cost view S-044 (G2-05).** Measured AI and server cost stays on the legacy read-only GOD screen,
  an operator surface outside the tenant shell (B14 D2-A). No new platform owner; S-369 is not built. The screen is
  dormant behind the maintenance page today.
- **A10 Kept fullscreen surfaces (G2-03).**
  - No new route class.
  - A kept surface nests in a base route only where D2 or ENV Part 4 already put it: credentials and channels in
    connections, devices and mutes in notifications, consent in privacy.
  - Everything else stays NOT RETIRED outside the served shell: S-200, S-496's role grant, S-499, S-044, the
    editors and the inbox.
  - Accept that ENV G9 («rows without fullscreen_intent 0 of 76») stays red for the vetoed rows.
- **A11 K12 builds staff Telegram unbind and history erasure (G2-38, G2-39; corrects K14-12).**
  - This is approved K12 scope (SPG:68) and gate G4 («owner: NONE = 0 of 8»).
  - Erasure is a class-s HANDOFF to privacy-and-data at SESSION_VERIFIED.
  - Unbind is built in the canonical identity owner: self-service at connections, offboarding on the owner's
    staff-access surface, and each unbind rotates `principal_proof_hash`.
- **A12 Onboarding voice (G2-04).** No new transcription route. Pre-tenant onboarding voice stays on the existing
  relay as G07 signs it (K1DOS:355, :363), with the transcript fed into the typed path. Voice is off by default,
  refused during the contact step, and fenced until S-745 lands.
- **A13 K14 exit evidence (K14-06).** K14's parity proof is minted HANDOFF-only IntentRecords with receipts on the
  live path. The CI ledger and AuditLog are shadow evidence only, and no CONTROL or callback tokens are used.
  Waits on R-03.

### Block B — cheap confirmations (one defensible reading of existing text)

**Gates**
- **AMB-01a** · NORMATIVE-PENDING refuses clause by clause: an unbuilt clause refuses only the cases it governs, and built clauses evaluate.
- **AMB-03, AMB-04** · The live role comes from the Membership read inside the request transaction (FOR SHARE, `m.id === authority.membershipId`).
  - presentation_mode: client for CLIENT_CHANNEL, client or customer; owner for tenant_owner or business_owner; staff for any other role.
  - F88.1's ban on reading `role` covers the presentation role only.
- **AMB-05** · Every widget submission gives `assertCanExecute` the surface `'web'`. `staff.schedule.update`, which is native-only, is reached through a HANDOFF.
- **AMB-06** · Gate 6's Action Engine pre-screen evaluates §3.9's five conditions directly; `preview()` is used inside the approval owner at Gate 13.
- **AMB-07** · For approval decisions, Gate 6 (d) applies as written; R3.11.6's approver test at EP-CANONICAL governs.
- **AMB-09** · A reader of `handoff_capability_ref` means direct member access; `subjectCapability` is that reader.
- **Escape (SH-05, AMB-11, AMB-62)**
  - On pwa, a server-matched «отмена/стоп/хватит» returns a dismiss outcome `{widget_id}` with no model call, token or submission, and the shell dismisses locally.
  - On restricted tiers the tokened `control.widget.dismiss` is admitted, including ANNOUNCEMENT; tier cells are allowlists.
  - Dismiss changes delivery state only; a draft ends at its TTL.
- **AMB-15** · Gate 7's withdrawn-row sentence is a re-read duty; Gate 5 refuses first.
- **AMB-17** · Closed-domain membership is checked per field, and `selection_domain` is keyed by field. The labels member is `selectionDomainLabelsJson` (C).
- **AMB-18** · An erased or absent stored schema gives SUPERSEDED/handle_stale with no write; a hash failure is an integrity fault.
- **AMB-20** · Selections are sets: duplicates refuse, required governs presence, and min/max apply to a present value.
- **AMB-21a** · Gate 8 re-reads `bounds_source` and refuses with `bound_violation`; `bound_ref` is a display echo.
- **AMB-21e** · A boolean is a closed two-member domain, so Gate 8 checks its type only.
- **AMB-21f** · `text.max_len` is enforced with `bound_violation`; c9SafeText keeps its own default.
- **AMB-24** · Envelopes with `client_identified` get no label interpolation (slot-less templates).
- **AMB-25** · A degrade-to-text answer is the composer's deterministic text, stored as an assistant timeline turn; model reads pass the anonymiser.
- **AMB-27** · `requires_readback` is recomputed at ingress from `record.effect` and the delivery tier; body_hash integrity is the H4 seal.
- **AMB-36** · Gate 11 outcomes:
  - not_found, already_cancelled, slot taken or stale revision → SUPERSEDED.
  - Policy fences pass through to Gates 13/14.
  - Transport errors are faults, not verdicts.
- **AMB-37** · F15's «exactly seven» limits only the noun resolver's record-field inputs.
- **AMB-38** · Body `*_ref` members are envelope-scoped opaque refs, not record handles.
- **AMB-39** · RT3(b) scopes canonical owners' paths; the widget path fails closed when the timeline store cannot be read.
- **AMB-40** · There is no fourth holder of the seal key: «the gateway mints» means the gateway causes minter (2) to mint.
- **AMB-41** · The Gate 11 diff uses AUDIT_RETAINED facts plus fresh owner values. The successor is a same-kind confirmation if the nouns still resolve, otherwise the amend selector.
- **AMB-42** · A successor carries its predecessor's `delivery_channel`.
- **AMB-44** · The fresh noun read happens at Gate 11.
- **AMB-46** · In F15, «reaches» means value flow; the approval gate is Gate 11.
- **AMB-52** · `allowedKinds` is the inverse of `ownerClassKeys`; a REFINE successor keeps the tapped kind unless a kind clause names another.
- **AMB-53** · FR-1 is read together with row 13: canonical writes go through the Action Engine ingress, and other edges go only to row-13 owners, enumerated by the import test.
- **AMB-56** · The receipt CHECK is unchanged: EXPIRED/SUPERSEDED are response outcomes; an Action Engine UNKNOWN is receipted as ACCEPTED and its ref is set on reconciliation.
- **AMB-57** · The `control.run.cancel` handler delegates to the C9 owner endpoint's service.
- **AMB-59** · The FORM.2/SETTINGS.1 allowlist is indexed by the Action Engine key the draft owner names, via AE_PROPOSE_PAIRING.

**Shell**
- **SH-04, G2-14 · sign-in**
  - Sign-in is the signed-out state of the root screen: not a route, not in nav, not in shell.account, and no hand-off to a legacy login page.
  - Social sign-in uses the canonical Yandex/Telegram OAuth with PKCE.
  - VK is never added, and the legacy VK branch stays until G09's evidence is in.
  - No production login flag is flipped.
- **SH-06** · An `approval_required` reply shows the server's text plus a neutral «pending» notice kept outside history, with no control, link or route. Suggested copy: «Действие ждёт подтверждения; подтвердить его здесь пока нельзя.»
- **SH-07** · `stripIntentToken` removes only `intent_token`. body_hash is checked in a stage before drawing, and the drawing module gets a token-free view plus the verdict.

**K14**
- **K14-02** · Delete the `/unsubscribe` sentence in `privacy_policy.py:17` in a separate, undeployed commit; the exact bytes follow R-04.
- **K14-20** · `consent_gate` sits alone in the lowest handler group (for example −10) under a ratchet; `site_publication_bot` must register after it.
- **K14-21** · K14 covers every door: slash commands, reply-keyboard text, admin NLU, and every admin callback prefix including `bcast_*` and `broadcast_send`.

**G2**
- **G2-12** · The referral card shows counters and programme status only: no personal code or link, no copy/share.
- **G2-18** · AI onboarding is a pre-auth mount over the existing `@Public` draft routes, outside the widget gateway. Logo upload is a LIMITATION under GAP-TENANT-ADMIN.
- **G2-19** · The trial form honours SELF_SERVE_TRIAL_SIGNUP and shows its 403 legibly with a contact path. `/maya-start.html` stays until the release decision is recorded.
- **G2-24** · The owner-initiated A16 grant satisfies S-435; no two-party request/approve flow is built.
- **G2-27** · Client channel linking lands on connections; the in-chat status is a LIMITATION under GAP-IDENTITY-READ.
- **G2-37** · The live-demo CTA goes to the pre-auth Maya entry, carrying its origin; there is no anonymous demo conversation.
- **G2-41** · The loyalty-spend and repeat-booking offers are recorded as explicit drops, because the moment set is closed at 12.
- **G2-42** · The waitlist read is a method in ClientWantedSlotService. Its roles translate the legacy `permissions.analytics`; it is read-only and PII-fenced.
- **G2-44** · The privacy fence lives in `C9Authority.current` and `realtimeAuthority`. Blocking is on privacy only; marketing is an independent fact.
- **G2-46** · A feedback-request key, if R-01 admits it, is a catalogue PROPOSE_ONLY key confirmed per request.

---

## ENGINEERING CHOICES MADE

**Gates**
- **AMB-02a** · Gate 8 maps every unmapped condition onto its four existing codes. No new code; `mechanism_absent` stays while the path is dark.
  - `selection_out_of_domain`: key, member, duplicate, cardinality and kind failures, and inputs sent to a null schema (`{}` counts as inputs).
  - `bound_violation`: bounds.
  - `use_secure_surface`: c9SafeText's deny.
  - `oversize_submission`: the byte cap.
- **AMB-02b** · Gate 7 returns `booking_confirmation_required` for the COMMIT-confirmation clauses and `effect_not_admissible` for everything else.
- **AMB-02c** · A JSON-null `readback_ack` refuses at Gate 8-R with `readback_mismatch` until the shape validator refuses it earlier.
- **AMB-19** · `max_total_bytes` is the UTF-8 byte length of `stableActionJson(inputs)`, one function shared by mint and Gate 8.
- **AMB-21c** · SCHEDULE moves are validated per entry (a per-entry record or an entry→targets map), never as a union; this lands after A1.
- **AMB-21d** · One closed server registry holds `bounds_source` and `normalizer_ref` for both mint and Gate 8. It is empty this cycle, so every non-closed field refuses.
- **AMB-21g** · Mint leaves disabled option ids out of the domain; `enabled` is display only.
- **AMB-23** · The one-field, cardinality-1 `{{selection}}` restriction stays. Any later join follows schema order, then domain order. A non-KNOWN label is never lowered (DS-03 A).
- **AMB-26c** · The shell sends no `spoken_transcript`. If one arrives, it is refused at the shape stage or screened by c9SafeText plus the byte cap before storage.
- **AMB-26d** · A typed-origin submission uses the person's own turn as its lowering; nothing is appended a second time.
- **AMB-28** · Gate 9 audit details:
  - the append is deduplicated on (intentTokenHash, client_nonce);
  - the turn channel is the answering carrier;
  - the last committed rendering wins;
  - user turns get no widget columns, and the COMMIT audit line carries no utterance.
- **AMB-33** · A frozen-noun handle is a server-minted opaque ref, resolved only server-side through the AUDIT_RETAINED record; its owner is the subject capability's owner.
- **AMB-34** · Value divergence means the owner compares its own stored quote or booking-intent hash against a fresh read.
- **AMB-35** · The witness is `run_ref.revision_id`, which pins `snapshotHash`. The Action Engine approval witness is the H5 binding hash. `run_ref` is set only on run-bearing subjects.
- **AMB-48** · Projector decisions reach the minter as D-class `WidgetComposerInput` members, in the V1.1 text; the minter never re-decides PII.
- **AMB-54** · A single-use record is claimed by compare-and-set at Gate 13 entry. A draft is consumed only when the canonical outcome is final, and the idempotency key is bound to the draft.
- **AMB-58** · The `control.run.cancel` key is derived from (tenant, run_id, revision), never from the widget token.
- **AMB-61** · Widget delivery bookkeeping copies `actionReceiptRef` into DeliveryRecord for presentation only.
- **A1 follow-up** · Align the live Gate 6's name-based `sensitiveDest` (`floor.ts:90-107`) with the amended R3.5.1.
- **A4 follow-up** · Mutated, expired, replayed and foreign-principal tokens are refused at equal latency (ENV:73 K3).

**Shell**
- **SH-08, SH-18** · The `/widgets/resolve` wire shape, declared through `emit.mjs` after A5:
  - detail request `(widget_id, density)`;
  - thread page `{thread_page:{before?, limit≤50}}` → `HistorisedWidget[]`;
  - response `{contract:'maya.widget.resolve/1', state, envelope|null}`.
- **SH-16** · body_hash is made locale-independent by EP-MINT collation-invariant key sets plus a minter locale pinned to the deployed value. There is no global `stableActionJson` change (G8).
- **SH-17** · `widget_id` stays a UUID (erratum). `widget10` is re-derived from the UUID's random bits.
- **SH-19** · `/ai/chat` gets an additive optional `resolution` member `{matched, receipt|null, dismiss_widget_id|null}`, with no client request field and no route. Declared after A3.
- **SH-20** · Password sign-in carries a business address the user types as `tenantSlug`. OTP lets the user choose among the returned businesses, and every failure is a named state.
- **SH-21** · The v2-review build and verification defects stay fixed as applied in PLAN rev 2.1 §0.5.

**K14**
- **K14-04** · Fix the stale consent-gate comment (`bot.py:348-349`) in the same commit as R-04. The `/bind` copy is left to K14 interception.
- **K14-14** · Handoff-mode dispatch rules:
  - pass-through is a resolver disposition, and REFUSE always stops;
  - a catch-all stops in handoff mode and is mutation-tested;
  - the outage allowlist is the `/start` handshake, `/privacy`, `/rashod` and `/cancel`;
  - the outage sentence is fixed, submitted with the deploy approval, and silent if not approved; shadow mode may fail open.
- **K14-16** · Strengthen the retention and staff-authority ratchet guards to assert that `pre_dispatch` has no effect path; pinned bodies and hashes stay untouched.
- **K14-17** · Use a dedicated env-only `MAYA_TELEGRAM_COMMAND_BRIDGE_TOKEN` (after R-03). The :8080 bind check runs only with production permission.

**G2**
- **G2-15** · Non-social sign-in is a separate pre-auth credential form driven by server flags. Passwords and codes never enter the timeline, and it fails closed without PHONE_LOGIN_ENABLED.
- **G2-17** · Trial activation is a pre-auth step over the `@Public` owner. The token lives only in memory or sessionStorage, and one confirmed act makes one POST.
- **G2-36** · The master-scoped client list is served by the actor-aware customers owner, with scope derived server-side. Its chat key comes through R-01.

---

## RECORD HYGIENE

- **Status headers (HYG-01, SH-24, K14-01)**
  - OD:8-9: 0/12 → 12/12 approved, citing `bd502e2f`.
  - DS03:3: OPEN → ANSWERED, Option A.
  - DS01:113: «stays a refusing stub until answered» → answered, Option A (`d9d948d2`).
  - CARRY-FORWARD-REGISTER: add D9-bis step B (`4f2914f5`, not deployed) and F-UNSUBSCRIBE OPEN.
- **Gate 10 «shadow until a criterion is set» (HYG-02)** · Cite DS-02 in C:4790-4792, ENV:630-634 and ENV:685-686. In P-20 (C:6037), also replace `IntentRecord.capability` with `subjectCapability(record)`.
- **Contract V1.1 errata bundle** · Text only; ships with A1, A2 and R-01:
  - AMB-01c: §1.6.7 lets `capability_gap_ref` carry the MG-Pnn key.
  - AMB-02a, AMB-02b: code tables for rows 7 and 8.
  - AMB-03: F18's «four» modes becomes three.
  - AMB-10, K14-13: R3.2.2 wording and C:1296-1297 align with F69.
  - AMB-12: PAY.4 wording.
  - AMB-14: add a `delivery_channel` row (A) to §4.4.3.
  - AMB-17: name `selectionDomainLabelsJson` in §3.7.
  - AMB-21h: fix the `inputs[k]` rows in §4.4.3.
  - AMB-45: R3.10.5 points to R3.11.3.
  - AMB-51: enumerate the five PII points before NT7.
  - AMB-52: declare `allowedKinds`.
  - AMB-55: FR2's «receipt store» becomes the intent-audit store.
  - A4: clarify L10's mechanism sentence.
  - SH-16: EP-MINT collation rule.
  - SH-17: `widget_id` UUID and the WC:5374 `widget10` derivation.
  - SH-22: declare `IntentReceipt`.
  - SH-23: narrow `DetailRouteKey` to the nine `fs.*` keys.
  - SH-08, SH-18, SH-19: resolve and resolution wire members.
- **Shell plan and GIP (SH-24, SH-01)**
  - PLAN L976: R1(b) is not a K15 gate change.
  - PLAN L336: notice copy per SH-06.
  - PLAN L989: E6(ii) is foreclosed by G8.
  - GIP U10a (L349): the CONTROL escape mapping applies to non-RICH tiers only.
  - Split `successorShellHoldsNoClientAuthorityValue` (`k16-cutover-evaluator.mjs:102-104`, `:219`) and correct «reads no client storage» at `WAVE-6-PRE-CUTOVER-DETERMINATION.md:236` and `WAVE-6-CHECKPOINT.md:113`, `:119`, per A6.
- **K14 documents (K14-10)** · No erratum to MAPPING:488 or ENV:254. Correct `WAVE-6-CHECKPOINT.md:51-54` and the determination's K14 section: Telegram is delivery/handoff at CHANNEL_IDENTITY, not RICH_CONSTRAINED with tokens.
- **Gap ledger (K14-12, corrected by A11)** · In `widgets/consent/data-subject-acts.ts:220-225`, the owner becomes K12 Data-Subject Authority, replacing «K14 Telegram cutover» and «not built». Align `GAP-IDENTITY-TG-UNBIND` with the contract's `GAP-IDENTITY-STAFF-UNBIND` after checking the pins. This is code in `maya-saas-backend`, so hand it to that workflow.
- **G2 backlog and K1 records**
  - One spec file, `admin/admin-platform-authority.http.spec.ts`, for S-583 and S-099 (G2-48).
  - Re-record S-044 (A9), S-241 (A8) and S-352 (A7).
  - Re-disposition the money rows (G2-09), tips (G2-11), promo (G2-13) and the withdrawn fenced capabilities (K14-22) as settled.
  - Record that the «malesthetic.pro foreclosed» statement is a platform rule, now R-05 option (0).

---

## SETTLED — not asked

**Gates**
- **AMB-01b** · P-01 is one row, so nothing guarded by it actuates until the whole gateway exists. In-chat booking COMMIT goes live only after that (C:5993, C:6117 A2.7).
- **AMB-08** · Nothing durable is written before Gate 9 (C:4345; C:4414-4418; DS03:50).
- **AMB-10, K14-13** · A HANDOFF may name a C9 or AE destination; TOOL is refused (C:1223 F69; C:83-90 F6).
- **AMB-14** · `delivery_channel` is AUDIT_RETAINED (ENV:437, ENV:445).
- **AMB-21b** · No phone field is minted this cycle, so phone values refuse and entry goes through the fullscreen editor (C:17-19; C:4129-4131). It becomes an owner question before the first phone field.
- **AMB-22** · Non-closed inputs never reach canonical records through the widget pipeline (C:209-211 F15).
- **AMB-26ab** · The readback vocabulary waits for a SPOKEN carrier; voice uses the typed path (C:4057-4059; CYCLE).
- **AMB-55** · WidgetIntentReceipt lives in the intent-audit store and the gateway writes it (ENV:403-407).

**Shell**
- **SH-10** · pwa `max_intents` is 12, changed through U7 (C:5262).
- **SH-11** · No bespoke cards or approvals; K11 APPROVAL comes later (OD:295 D8 B; ENV:194-208).
- **SH-12** · One thread per tenant, read through `/api/widgets/resolve` (OD:261 D7 B; C:5993).
- **SH-13** · `principal_proof_hash = c9PrincipalHash(principal)` (C:2394 K3).
- **SH-14** · A Gate 9 lowering failure follows DS-03 Option A (CYCLE).
- **SH-15** · The shell sends the constant surface `'web'` (C:5433 NT3; OD:60 D1 A); the backend half is AMB-05.

**K14**
- **K14-05** · The successor is the served web shell. Handoff mode stays off or shadow until the shell and its routes are served (CYCLE; C:4035-4037 R3.5.4; K1SIG:84-86 O06).
- **K14-09** · Gate 10 counts as exercised only on the live path; Gate 9 is built per DS-03 A (CYCLE; DS03:50).
- **K14-10** · Telegram is delivery and handoff at CHANNEL_IDENTITY, with no callback tokens and `/cancel` typed (OD:397 D11 B; K1SIG:69; C:2402 K7).
- **K14-11** · Branch `fe8b97bf` is never merged. Deleting its ref or worktree needs your explicit OK (OD:392, D11 A not chosen).
- **K14-15** · Every deploy and every production read is a separate go/no-go (K14-PLAN.md:584).
- **K14-19** · There is one router, with disposition keyed by capability (C:4666-4670 R3.12.4; DS02:95-97).
- **K14-22, G2-31** · Each fenced capability gets a verified successor or a «no successor, capability withdrawn» record; scan_and_alert, can_redeem_codes and set_cashier_role are withdrawn (OD:414 D11).

**G2**
- **G2-09** · No money actuation in chat: money rows get gap-keyed LIMITATION successors and the legacy surfaces stay (C:559 F34; C:646; ENV:677-684).
- **G2-10** · No inline visit-payment close; `crm.visit.payment.v1` is DENY (C:547; ENV:171).
- **G2-11, G2-13** · Tips are a LIMITATION under GAP-TIPS (B22 A; C:3790-3791), and no promotion entitlement is built (B10 A; `ce08e931`).
- **G2-16** · After sign-in the conversation resumes; there is no mode concept (OD:60 D1 A; K1DOS:439 G09).
- **G2-20** · The CRM connection form lives at connections; YooKassa is a LIMITATION (ENV:529; K1SIG:62).
- **G2-21** · Client consent is a LIMITATION in chat and is handled at privacy-and-data's own ingress (C:603; ENV:220-222).
- **G2-22** · The capability index runs over `AiToolPolicyService.listAllowed` (OD:159 D4 B; K1SIG:84-86 O06).
- **G2-23** · Web-push registration lives at notifications and writes no consent (K1SIG:81-82 G17; OD:94 D2 A).
- **G2-25** · The staff Telegram link is a class-s HANDOFF to connections (C:470; C:3810 R3.3.3).
- **G2-26** · The wanted-slot moment opens the `fs.booking` intent, and creation uses the F34 row (ENV:239; K1SIG:52-53; C:554-556).
- **G2-28** · No loyalty programme-terms read is built (CYCLE; ENV:192).
- **G2-30** · No AI-advice usage analytics are built (CYCLE; SPG:66 K10 exit).
- **G2-32** · No win-back moment is built (S-766 out of scope; B11 A).
- **G2-33** · The offline banner and install prompt are outside the narrow shell scope (CYCLE).
- **G2-34** · The platform-detection carrier is retired and its contract recorded (S-669 zero references; CYCLE).
- **G2-35** · VK login is never added (CLAUDE.md gotcha 7; K1SIG:77-78 G09).
- **G2-40** · First-touch attribution is built in K10 (SPG:66).
- **G2-43** · S-047 retires after S-045 and S-046 (OD:116).
- **G2-45** · Tenant contact links render as text Cells (C:3781-3788 R3.3.1).
- **G2-47** · The help PDF is not exposed; the capability index is its successor (SPG:70 K14; `owner-report-download.service.ts:44-47`).
- **G2-49** · `crm.providers.catalog.read` gets no LOCAL override (C:916).

---

## Changes made while assembling (for audit)

1. **AMB-16 and G2-02 merged (A1).** The two refutations differed on scope. The packet adopts what both support for
   this cycle (booking-owner keys only) and records the wider split as conditional on R-01.
2. **AMB-31 and K14-08 reconciled (A3c) towards DS-02's adopted text** («Record everything else», DS02:65-66).
   Null against a pointer record is recorded, not refused at runtime.
3. **AMB-30 and K14-07 merged (A3b).** CONTROL keys take the F27 owner endpoint, which is finer than «the control
   registry», and owner-set intersection is taken from the K14-07 refutation.
4. **K14-12 against G2-39 (A11).** Approved K12 scope (SPG:68) and ENV G4 («owner: NONE = 0 of 8») decide it, so
   the «not built» ledger text is wrong.
5. **G2-29 moved out of SETTLED into A7.** Signed S-352 is MOVE INTO CHAT WIDGET, K8, successor «dismissible
   release-notes card».
6. **SH-08 moved from SETTLED to engineering.** K16 fixes only the detail resolver's parameters. **SH-09 folded into
   R-05** as option (0).
7. **K14-03 reframed (R-04)** from «gate or copy» to how a phone or e-mail withdrawal is recorded.
8. **K14-18 options corrected (R-03).** No Action Engine delivery capability is needed; option B amends §3.8; the
   pre-programme dispatcher is added as option C.
9. **G2-01 (R-01) absorbs** the contract-version residue of G2-02, G2-03, G2-06, G2-07 and G2-29.
