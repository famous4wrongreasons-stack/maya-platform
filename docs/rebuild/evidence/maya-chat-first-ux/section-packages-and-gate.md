## Headline

**30 implementation packages, grouped into 6 waves.** Wave 1 (6 packages) is the only wave executable under this cycle's architecture-only fence: pure cartography plus CI, no reachable runtime code, reversible by deleting files and disabling one CI job. Waves 2-6 are designed here but **do not open until the Wave-1 exit gate — the Disposition Mapping Dossier — is approved**. That is the mechanical expression of "no big frontend rewrite before the mapping is approved."

The cycle is declared finished by a **17-condition Finite Completion Gate** that must go green simultaneously on one commit, in one named CI job.

---

## 1. Standing of this section

This section authorises **planning artefacts only**. It does not authorise deleting a tab, screen, route, command or Telegram handler. The only mechanism in the programme that may authorise a deletion is **INV-16 capability parity**, discharged in P30, and it authorises nothing until its proof is green.

For this cycle: **runtime changes 0, schema changes 0, migrations 0, production mutations 0, Chapter 10 not started.**

One precision that will otherwise be argued about later. Wave 1 lands TypeScript under `maya-saas-backend/src/chat-first/`, which compiles into `dist` and therefore changes the deployed artefact's bytes. It is **not** registered in `maya-saas-backend/src/app.module.ts` (47 module registrations today), declares no `@Controller`, no provider and no Prisma model, and an architecture spec asserts all four. The service gains dead code and gains no route, no provider, no schema, no behaviour. The alternative — keeping the types in `docs/` and `test/` — was rejected because every later package and every architecture spec must `import` these types, and a contract that cannot be imported is a contract nobody checks.

**The programme reuses three mechanisms this repository already runs, rather than inventing a fourth.**

| Existing mechanism | Evidence | Reused for |
|---|---|---|
| Architecture specs as enforceable invariants | 103 `*.architecture.spec.ts` under `maya-saas-backend/src`, run by `npm test` in `.github/workflows/platform-ci.yml` | Every contract fence in Waves 1-6 |
| Frozen registry hash | `C9_REGISTRY_HASH = c9Hash('registry/1', C9_CAPABILITIES)` at `src/orchestration/c9.registry.ts:177`, with `c9Deny('registry_version_unavailable')` on mismatch | Surface ledger hash, intent registry hash, disposition map hash |
| String-presence ratchets over the single-file bundle | `scripts/verify-prepublication-contracts.mjs`, `scripts/verify-frontend-bundles.mjs`, `scripts/verify-pwa-ios-parity.mjs`, job `frontend-bundles` | Legacy-global bans, overlay ban, nav ratchet, build-tag skew |

Backend stack for planning purposes: NestJS, Prisma, Postgres (`@prisma/client`, `pg`, `@prisma/adapter-pg`). **There is no Redis dependency.** The Intent Gateway store is therefore Postgres, which is also the right answer for audit: the same store must answer "what exactly was this tap equivalent to" months later.

---

## 2. The arithmetic that drives the plan

Four numbers determine the shape of the programme, and two of them are uncomfortable.

**795 surfaces, 669 dispositions — 126 surfaces carry no disposition.** Wave 1 cannot end with 126 unassigned. Every one of the eight downstream classes is defined by set membership; a surface with no class has no successor and is therefore un-deletable and un-migratable forever. P06 must close this to zero.

**112 primary-nav surfaces today, 63 dispositioned RETIRE FROM PRIMARY NAVIGATION — leaving 49.** Executing every assigned retirement takes primary navigation from 112 to 49. It does not produce a chat-first shell. The inventory does not contain the decision that takes 49 to a handful; that is a product adjudication, not a finding, and I will not invent it. The completion gate therefore demands `<= 49` **and** a written justification per survivor naming why chat cannot host it. See section 8.

**Three bundles, one app.** `сайт и приложение/app.html` (2,719,311 bytes), `maya-os-site/index.html` (2,506,493 bytes, older build), `сайт и приложение/app-tenant.html` (1,096,396 bytes). Any chat shell built once and shipped three times is built three times. Unification is a precondition, not a cleanup.

**Six of the eight "restorations" are not greenfield.** Verified in the canonical worktree: `src/gift-certificates/` already holds `gift-certificate-purchase-shadow.controller.ts`, `-activation-shadow`, `-redemption-shadow` (all at `@Controller('gift-certificates/internal/shadow')`, `@Public()`, gated on an `x-maya-inbox-bridge` secret) **plus** `p4-06-gift-certificate-executable.service.ts` wired to `P4_06_EXECUTABLE_CAPABILITIES` and the Action Engine runtime. `src/loyalty/` holds `legacy-loyalty-redemption-shadow.controller.ts` at `@Controller('loyalty/internal/shadow')` alongside a live `@Controller('loyalty')`. `src/crm/client-consent-authority.ts` and `client-channel-link.service.ts` exist. So gift and loyalty redemption are **promotions of an existing shadow owner to an executable route**, not new business logic — materially cheaper and materially safer than a build. By contrast, a repository-wide search for an unbind/unlink/detach endpoint returns nothing, and a search for a conversation erase/purge controller returns nothing: those two are genuine builds. First-touch attribution sits in between — `src/measurement/` already carries an `attributionStatus` vocabulary including `UNATTRIBUTED` and `NOT_APPLICABLE`, which maps one-to-one onto `Cell.state`, but there is no first-touch report.

---

## 3. Package taxonomy

Thirty packages across six waves. Every package declares **Scope**, **Depends on**, **Must prove**, **Surfaces touched**. "Must prove" is always an artefact a machine can check, never an intention.

| Wave | Name | Packages | Fence |
|---|---|---|---|
| 1 | Cartography | P01-P06 (6) | Architecture only. This cycle. Fully reversible. |
| 2 | Spine | P07-P11 (5) | First runtime. Read-only. Dark behind entitlement. |
| 3 | Authority and Action | P12-P15 (4) | First write path. Two-phase enforced by absence. |
| 4 | Parity Migration | P16-P21 (6) | One package per disposition class. Additive only. |
| 5 | Restorations | P22-P26 (5) | The eight gaps. Legal exposure first. |
| 6 | Cutover | P27-P30 (4) | The only wave permitted to remove anything. |

---

## 4. Wave 1 — Cartography

*Executable now. No reachable runtime code. Reversible by `git revert` plus one CI job toggle.*

### P01 — Surface Ledger SLR-795
**Scope.** One machine-readable record per deduped surface: ledger id, channel (of 17), source file and anchor, current entry point, current primary-nav flag, disposition (or `UNASSIGNED`), target route key, owning capability key, evidence pointer. Frozen as `SLR_HASH` using the `c9Hash('registry/1', ...)` idiom. Lands as `maya-saas-backend/src/chat-first/surface-ledger.ts` plus `surface-ledger.architecture.spec.ts`.
**Depends on.** Nothing.
**Must prove.** Count is exactly 795; ids unique; every ledger row resolves to a real file path that exists; channel histogram reproduces 465/109/32/32/32/26/21/19/16/9/7/7/7/6/3/3/1; `SLR_HASH` is a 64-hex constant and changing any row changes it.
**Surfaces touched.** None (new file, unregistered).

### P02 — Capability Canon and Gap Ledger
**Scope.** A canon of capability keys that is a strict superset of the 57-entry C9 registry derived from `MAYA_AI_TOOL_CATALOG`, adding the direct capability reads that never pass through an agent. The eight gaps are first-class canon entries with `owner: NONE` and a `capability_gap_ref`. Records, per gap, whether the canonical owner is **absent**, **shadow-only**, or **live-but-unrouted** — the distinction established in section 2.
**Depends on.** P01.
**Must prove.** Every C9 capability key appears unchanged; no canon entry duplicates a C9 key with different semantics; exactly 8 entries carry `owner: NONE`; each of those cites the code location (or its absence) that justifies its classification; BI capabilities remain READ-only.
**Surfaces touched.** None.

### P03 — Widget Contract Freeze `maya.widget.envelope/1`
**Scope.** The full type set from the synthesized contract as compiled TypeScript: envelope root, `Cell<T>`, `Measure`, all 17 kinds, `WidgetIntent`, `EffectClass`, `InputSchema`, `IntentRecord`. Plus the **forbidden-key validator** (INV-1) as a runnable function, and a golden fixture corpus: at least three fixtures per kind (all-KNOWN, mixed-unknown, degraded).
**Depends on.** P02.
**Must prove.** The validator rejects an envelope carrying `arguments`, `payload`, `state`, `role`, `permissions`, `token`, `client_id`, `staff_id`, `record_id`, `is_staff`, `is_owner`, `__meRole`, `__meIsStaff`, `__meIsFounder` **at any depth**, including inside arrays and inside `Cell.value`; `EffectClass` contains no `MUTATE` and no `EXECUTE`; `WidgetKind` contains no `ERROR`; `theme_scope` is a single-value literal with no `overlay` member; `authority_basis` has exactly one legal value; no body type contains a writable field.
**Surfaces touched.** None.

### P04 — Authority Model Freeze
**Scope.** `AuthorityEnvelope`, the five-rung `VerificationLevel` ladder, and a **pure derivation function** from existing session facts (JWT, Membership, Client binding, Mini App initData, push subscription) to a rung. Separately, pin the **five existing client-preview fences** with characterisation tests so that any future refactor which collapses them fails CI. Adds the sixth fence A4 as a validator rule, not as a replacement.
**Depends on.** P03.
**Must prove.** Five distinct fences are each independently exercised and each independently fails when disabled (a test that passes with any one fence removed is not a fence test); `verification_level` is never derivable from a client-supplied field; `presentation_mode` cannot enable an intent — a property test over the fixture corpus shows the intent set is byte-identical across all four modes; `legacy_globals_used: never` compiles as a type-level ban.
**Surfaces touched.** None. Reads, does not modify, the existing `app_access` layer and `src/crm/client-consent-authority.ts`.

### P05 — Canonical Text Minter and Portability Gate
**Scope.** `renderTextEquivalent(kind, body, intents, locale)` as a pure server function (R0), the R1 TEXT_ONLY portability gate, and the R2 numeral-provenance check. Ships as a CI job, `chat-first-portability`, added to `.github/workflows/platform-ci.yml`.
**Depends on.** P03.
**Must prove.** For every fixture: the TEXT_ONLY rendering states every `Cell` including every non-KNOWN one with its `label`; every retained intent is reachable by a typed reply whose bytes equal `intent.utterance`; every numeral in rendered prose maps to a formatted `Measure` present in the body (a fixture with a hand-typed number fails); `Cell.label` never matches the failure lexicon; `integrity.body_hash` covers `presentation`, so mutating the text equivalent alone invalidates the seal.
**Surfaces touched.** `.github/workflows/platform-ci.yml` (one added job). Reversible by removing the job.

### P06 — Disposition Mapping Dossier *(the Wave-1 exit gate)*
**Scope.** Resolve the 126 undispositioned surfaces. For every one of the 795: disposition, named successor (target route key, widget kind, or capability key), and the channel it survives in. Publish the six per-class migration rules that Wave 4 executes mechanically. This is the document that gets **approved by a human** and whose hash gates every later wave.
**Depends on.** P01, P02, P04.
**Must prove.** `UNASSIGNED` count is 0; every disposition names a successor that resolves to a capability key in the P02 canon or an explicitly-recorded gap; the six class counts sum to 795 after the 126 are placed; every `RETIRE FROM PRIMARY NAVIGATION` row names where the capability continues to live; the primary-nav arithmetic (112 today, 63 retirements, 49 survivors) is reproduced from the ledger rather than asserted, and each of the 49 survivors carries a justification string.
**Surfaces touched.** None. Produces `docs/architecture/chat-first/disposition-mapping.md` and a hash pinned in code.

---

## 5. Wave 2 — Spine

*First runtime. Read-only. Dark behind an entitlement flag. Opens only after P06 is approved.*

### P07 — Intent Gateway and IntentRecord store
**Scope.** Server-side minting, storage, verification and single-use consumption of `intent_token`. One additive Prisma model `WidgetIntentRecord` holding `intent_token_hash`, `frozen_nouns`, `selection_domain`, `input_schema_hash`, `requires`, `utterance_template`, `requested_scope_hash`, `principal_proof_hash`, TTL fields. **No foreign key into any business table** (INV-15). TTL sweeper reuses the existing `auth:cleanup` maintenance convention.
**Depends on.** P03, P04, P06 approved.
**Must prove.** A submission carries only `{widget_id, intent_token, inputs, client_nonce, profile_id}` and the server ignores everything else; `frozen_nouns` never appear on the wire in either direction; a mutated, expired, replayed, cross-principal or cross-tenant token is refused with the same latency profile as a valid one; oversize input is refused, never truncated; the token fits `w1.<widget10>.<intent6>.<sig8>` inside Telegram's 64-byte `callback_data` ceiling; a principal relink changes `principal_proof_hash` and retroactively invalidates every outstanding token on every device.
**Surfaces touched.** `maya-saas-backend/src/chat-first/` (now registered), one additive migration. No existing table altered.

### P08 — Widget Emission Service, read-only projectors
**Scope.** Projectors for the seven read-only kinds: `METRIC`, `CHART`, `REPORT`, `SCHEDULE`, `SOURCE_STATUS`, `LIMITATION`, `PROGRESS`. Each projects an **existing** canonical capability response into a body. **Zero new business endpoints**: exactly two new routes exist in the whole programme, `POST /api/widgets/resolve` and `POST /api/widgets/intent`.
**Depends on.** P07.
**Must prove.** Every `body` field is a subset of the response projection of `provenance.source_capability` (P1) — a projector inventing a field fails the build; `completeness_envelope_hash` equals a re-hash of the source envelope, i.e. the widget layer performs no arithmetic (P3); `CHART.dataset_ref` is a canonical C7/C8 handle and `table_equivalent` is always present; a remedy with no canonical owner emits a `Limitation` with a `capability_gap_ref` and **no intent** (P2).
**Surfaces touched.** Two new controllers under `maya-saas-backend/src/chat-first/`. No existing controller modified.

### P09 — Chat Shell v1
**Scope.** The single chat surface. **Decision: it ships inside `сайт и приложение/app.html` as a new key in the existing `S` router map, not as a new bundle and not as an overlay.** An overlay is exactly the defect being removed (R3); a new bundle would make the three-bundle skew four; the `S` map is the only legitimate mount point in the codebase. **Second decision: v1 renders `text_equivalent` only.** R1 is then true by construction on the first day of production exposure, and the cheapest possible thing is the first thing exposed.
**Depends on.** P05, P08.
**Must prove.** One message list, one composer, one durable history; the shell mounts from the `S` map and nowhere else; the shell is invisible without the entitlement flag; `S[screen] || S.login` is replaced for the chat key by an explicit unknown-kind path that renders text (R4) — the dead `role` key is documented, not yet removed.
**Surfaces touched.** `сайт и приложение/app.html`, plus a new required-string assertion in `scripts/verify-prepublication-contracts.mjs`.

### P10 — Widget Renderer v1
**Scope.** Rich renderers for the seven read-only kinds, rendering **inside the chat message tree** — not a second React tree, not a portal, no z-index.
**Depends on.** P09.
**Must prove.** Every renderer has five branches per `Cell` (M2); no non-KNOWN state binds to a danger token, error icon, `role="alert"` or an automatic retry (M1); a renderer cannot add an affordance, re-rank a COMMIT into primary position, hide a `Limitation` or hide a non-KNOWN `Cell` — asserted by rendering the fixture corpus and diffing the affordance set against the envelope; an unregistered `kind` renders `text_equivalent.body`.
**Surfaces touched.** `сайт и приложение/app.html`.

### P11 — Channel Profile Registry and degradation receipt
**Scope.** One profile per carrier — PWA/native, Telegram bot, Mini App, web push, voice, SMS, email, guest chat — declaring only **presentation** capability. The server applies degradation before emission and records what it did in `render: RenderReceipt`. Encodes the five-carrier token table, including the 64-byte and two-push-action ceilings.
**Depends on.** P07, P05.
**Must prove.** A renderer cannot declare `verification_level` (A2) — a lying profile produces an uglier widget, never a more powerful one; `priority: 0` intents (escape, sole COMMIT, sole HANDOFF) survive every degradation path; the SMS profile emits a numbered enumeration plus exactly one signed handoff link; a profile that cannot express an envelope forces text, never a different screen.
**Surfaces touched.** `maya-saas-backend/src/chat-first/`, `scripts/verify-pwa-ios-parity.mjs` (extended, not replaced).

---

## 6. Wave 3 — Authority and Action

### P12 — Authority Envelope Runtime
**Scope.** Server-side derivation of `presentation_mode`, `principal_proof_hash`, `pii_class`, `data_scope.masked_fields` at emission time from Membership, Client binding, Staff, `EntitlementsService`, `AiToolPolicyService` and the capability canon. Enforces A4, the sixth fence.
**Depends on.** P04, P08.
**Must prove.** `AuthorityHint` is never read by the server — deleting it from a submission changes nothing; a hint that disagrees with server derivation re-issues the **widget** and never bends the derivation; `pii_class: 'client_identified'` with `presentation_mode: 'client'` is refused unless `subject_is_principal`; all five original preview fences still fire independently (P04's characterisation tests must still pass unchanged).
**Surfaces touched.** `maya-saas-backend/src/chat-first/`. Read-only against `src/crm/`, `src/entitlements/`, `src/action-engine/`.

### P13 — Booking two-phase, enforced by absence
**Scope.** `SERVICE_SELECTOR` → `STAFF_SELECTOR` → `TIME_SLOT_SELECTOR` → (DRAFT, executed by the canonical booking owner where B31 `normalizeClientBookingIntent`, B32 and B33 run) → `BOOKING_CONFIRMATION` → single COMMIT. Implements handles-as-nouns: `frozen_nouns` name *what*, the owner performs a fresh read at commit and supplies *how much* and *when*.
**Depends on.** P07, P12.
**Must prove.** A static analysis over the minting code shows a COMMIT token for a booking effect can be minted **only** onto a `BOOKING_CONFIRMATION` body — the property is enforced by non-existence, not by a guard; at the moment a `TIME_SLOT_SELECTOR` renders, no booking COMMIT token exists anywhere in the system; a price or slot that moved between display and commit produces `SUPERSEDED` with a rendered diff, never a silent clamp and never a wrong booking; `idempotency_key` is minted server-side; a widget tap cannot reach a provider without passing the Action Engine.
**Surfaces touched.** `maya-saas-backend/src/chat-first/`, `src/action-engine/` (read-only binding), `сайт и приложение/app.html`.

### P14 — C9 binding: Approval, Strategy, Progress
**Scope.** `APPROVAL`, `STRATEGY_OPTIONS`, `PROGRESS` projected from the already-shipped orchestration contracts. Reuses the six coordination endpoints under `/api/orchestration` verbatim; `run_id` stays nullable so a direct capability read never enters the 12-call / 120-second budget.
**Depends on.** P08, P12.
**Must prove.** `risk_tier`, `reversible` and `audience_size` are copied from `proposed_action_intents[i]`, never recomputed; `STRATEGY_OPTIONS` carries at most three alternatives plus a **selectable** NO_ACTION; the review renders as explicitly not a source approval; `PROGRESS.budget_note` states that paid reasoning is disabled rather than hiding it; UNKNOWN holds a step and blocks only its dependents; `integrity.approval_binding_echo` is re-derived server-side and never accepted as input; consent-aware audience maths renders **before** the irreversible tap.
**Surfaces touched.** `maya-saas-backend/src/chat-first/`. `src/orchestration/` read-only.

### P15 — Voice and multimodal intent resolution
**Scope.** Audio → transcription → typed intent → the same canonical validation. Deterministic matching on `speech_aliases` and `ordinal` **before any LLM call**. Inherits the proven Telegram patterns: mode locks during composition, 30-minute flow TTL, universal `/cancel` escape verb, PII boundary on voice during contact collection with only transcript length logged.
**Depends on.** P07, P11.
**Must prove.** Voice is not a separate authority path — the audit line produced by saying, typing and tapping the same intent is byte-identical (I5); alias matching resolves without a model call; `readback_template` is present and read back before any COMMIT; no raw audio or transcript content is logged where a PII boundary applies.
**Surfaces touched.** `maya-saas-backend/src/chat-first/`, `сайт и приложение/app.html`.

---

## 7. Wave 4 — Parity Migration

*One package per disposition class. Every package in this wave is purely additive: it builds the successor and proves parity. Nothing is removed here.*

### P16 — Class KEEP AS CAPABILITY (201 surfaces)
**Scope.** Prove each of the 201 is reachable as a registered capability key with an intent, in at least one channel, at the correct authority rung. No UI work.
**Depends on.** P06, P08, P12. **Must prove.** 201/201 map to a canon key; 0 orphans; the reachability proof runs as `chat-first:parity-proof`, following the existing `action-engine:proof` script convention. **Surfaces touched.** None; proof scripts only.

### P17 — Class MOVE INTO CHAT WIDGET (115 surfaces)
**Scope.** The actual projections. Each of the 115 maps to exactly one kind and one projector. **Depends on.** P10, P16. **Must prove.** 115/115 emit a valid envelope against real tenant data; 100% pass R1; no projection introduces a field its source capability cannot produce; density-cap violations escalate to `fullscreen_detail` rather than being truncated in a bubble. **Surfaces touched.** `maya-saas-backend/src/chat-first/`, `сайт и приложение/app.html`.

### P18 — Class MERGE (93 surfaces)
**Scope.** Execute the merge map: many surfaces to one capability. **Depends on.** P17. **Must prove.** For each merge group, the union of pre-merge behaviours is expressible by the post-merge capability — enumerated per group, not asserted in aggregate; 93 inputs collapse to a declared, smaller output count, and that count is recorded; no merge silently drops a filter, scope or authority distinction. **Surfaces touched.** Varies by group; each declared in the dossier.

### P19 — Class KEEP AS FULLSCREEN DETAIL (76 surfaces) and overlay re-expression
**Scope.** A `route_key` registry, and re-expression of the **seven self-mounting overlays** currently creating their own DOM hosts at `zIndex 2147483000` on a query-parameter match. They become route keys inside the app tree, inside the back-stack, inside the theme, with authority from the envelope rather than from a bearer check inside each component's first fetch.
**Depends on.** P09, P12.
**Must prove.** 7/7 overlays reachable as routes; each has a working back navigation and inherits theme; each renders correctly in both themes at 400px; the bundle assertion for `2147483000` still finds 7 (removal is P30's business, not this package's); every one of the 76 has a `fullscreen_intent` reachable from chat with a `reason` from the closed set.
**Surfaces touched.** `сайт и приложение/app.html`, `scripts/verify-prepublication-contracts.mjs`.

### P20 — Class SECURITY/AUTHORITY ONLY (121 surfaces)
**Scope.** Enforce the split the codebase already performs deliberately: explanation copy may be a chat widget, the accept/decline **control** may not. Implements `NEVER_CHAT_ACTUATED` and `SECURE_SURFACE_ONLY`.
**Depends on.** P12, P11.
**Must prove.** Each of the eight `NEVER_CHAT_ACTUATED` keys has HANDOFF as its only legal intent **and** independently declares `required_verification` of `SESSION_VERIFIED` or `STEP_UP_VERIFIED`, so a stale list still fails closed at the ladder; a `SECURE_SURFACE_ONLY` field is never rendered in chat in any profile; six of the eight carry a `capability_gap_ref` and therefore carry **no intent at all** until Wave 5 lands their owner; every HANDOFF target resolves to a live surface or the envelope fails the gate.
**Surfaces touched.** `maya-saas-backend/src/chat-first/`, `сайт и приложение/app.html`.

### P21 — Class RETIRE FROM PRIMARY NAVIGATION (63 surfaces)
**Scope.** Remove 63 entry points from primary navigation while the capability continues to exist. Adds a **nav ratchet** to `scripts/verify-prepublication-contracts.mjs` that fails the build if the primary-nav count rises.
**Depends on.** P16, P17, P19.
**Must prove.** Removing a tab removed no capability — each of the 63 is still reachable by at least two of {chat intent, fullscreen route, deep link} after retirement; the count moves 112 → 49 and the ratchet holds; Calendar, Clients, Reports, Analytics, Booking, Strategies, Approvals and Settings all still resolve as capabilities.
**Surfaces touched.** `сайт и приложение/app.html`, `scripts/verify-prepublication-contracts.mjs`.

---

## 8. Wave 5 — Restorations

*Ordered by legal exposure, then by whether an owner already exists. The 152-FZ trio goes first because two live surfaces currently **promise** a revocation that does not exist.*

### P22 — Consent Authority Surface
**Restores.** `GAP-CONSENT-MKT-CHANGE`, `GAP-CONSENT-PD-WITHDRAW`, `GAP-CONSENT-REGISTER-EXPORT`.
**Scope.** A verified-channel consent surface owning grant, revoke, re-grant after decline, base 152-FZ withdrawal, and the Roskomnadzor register export. Builds on `src/crm/client-consent-authority.ts`. The chat side gets explanation, current state and consequence; the control lives behind SESSION_VERIFIED.
**Depends on.** P12, P20. **Must prove.** The `/unsubscribe` promise now terminates in a working surface; a revoke is durable, audited, and suppresses the next scheduled marketing send; a decline followed by a later grant is expressible; the export produces a complete register for an arbitrary date range with per-record provenance; **every consent write is refused when it arrives on channel identity alone.**
**Surfaces touched.** `maya-saas-backend/src/crm/`, new consent controller, `сайт и приложение/app.html`, `ai администратор/bot.py` (copy and handoff only — the Telegram control is retired, not reimplemented).

### P23 — Identity Lifecycle Unbind
**Restores.** `GAP-IDENTITY-TG-UNBIND` and the symmetric client channel unbind.
**Scope.** Destroy a link that today can only be created. A repository search for unbind/unlink/detach endpoints returns nothing: this is a genuine build on top of `src/crm/client-channel-link.service.ts`.
**Depends on.** P22. **Must prove.** Offboarding a staff member detaches the Telegram identity durably; the unbind rotates `principal_proof_hash` and therefore invalidates every outstanding intent token on every device (P07); no orphaned message routing survives; an unbind is auditable and reversible only by a fresh, freshly-consented bind.
**Surfaces touched.** `maya-saas-backend/src/crm/`, `src/staff/`, `ai администратор/bot.py`.

### P24 — Commerce and Loyalty Redemption promotion
**Restores.** `GAP-COMMERCE-GIFT`, `GAP-LOYALTY-REDEEM`.
**Scope.** **Promotion, not construction.** Gift purchase, activation and redemption exist as shadow planners at `@Controller('gift-certificates/internal/shadow')` with an executable Action Engine path in `p4-06-gift-certificate-executable.service.ts`; loyalty redemption exists at `@Controller('loyalty/internal/shadow')` beside a live `@Controller('loyalty')`. This package promotes shadow to routed-and-executable and exposes it as `BOOKING_CONFIRMATION.loyalty_applied` and a gift capability.
**Depends on.** P13. **Must prove.** Shadow and executable agree on a replayed corpus before the route opens; the AI chat's existing gift offer now terminates in a real purchase; points can be spent at booking so accrual stops growing an unredeemable liability; redemption is idempotent under retry and double-tap; the `@Public()` bridge-secret shadow routes are not what gets exposed to clients.
**Surfaces touched.** `src/gift-certificates/`, `src/loyalty/`, `src/action-engine/`, `сайт и приложение/app.html`.

### P25 — First-touch attribution
**Restores.** `GAP-ATTRIBUTION-FIRST-TOUCH`.
**Scope.** A two-level hierarchical report over 10 categories: `REPORT` kind with `depth: 2`, a top-3 `Measure` summary card in chat, and a mandatory `fullscreen_intent`. Reuses the existing `attributionStatus` vocabulary in `src/measurement/`, whose `UNATTRIBUTED` and `NOT_APPLICABLE` map directly onto `Cell.state` with `reason_code` `NOT_COLLECTED` and `OUT_OF_SCOPE`.
**Depends on.** P17. **Must prove.** Unattributed volume renders as a stated unknown, never as zero and never as an error; the hierarchy never renders in a bubble; every numeral traces to a `Measure`; totals reconcile with the canonical revenue source or the discrepancy is stated as a `Limitation`.
**Surfaces touched.** `src/measurement/`, `maya-saas-backend/src/chat-first/`, `сайт и приложение/app.html`.

### P26 — Conversation history erasure
**Restores.** `GAP-HISTORY-ERASE`.
**Scope.** Right to erasure over conversation content. Buildable only because INV-15 forbids any business FK onto `widget_id` or a message id.
**Depends on.** P07, P22. **Must prove.** After erasure, every canonical record — bookings, receipts, consent register, loyalty ledger, approvals, audit log — is still correct and complete; no business object referenced a message id; erasure is scoped to a principal and a range; the durable staff Telegram mirror's dedupe keys survive as opaque values without retaining content.
**Surfaces touched.** `maya-saas-backend/src/chat-first/`, `src/inbox/`, `src/audit-log/`.

---

## 9. Wave 6 — Cutover

*The only wave permitted to remove anything.*

### P27 — Legacy authority retirement and bundle unification
**Scope.** Remove the third authority path (`localStorage.me_is_staff === '1'` routing before any server call) and the legacy window-global generation (`__meRole`, `__meIsStaff`, `__meIsMaster`, `__meIsFounder`, `__panelInfo.permissions`) from the panel, staff home, chat and CutMatch call sites, retiring the `typeof newHelper === 'function' ? newHelper() : legacyFallback` pattern. Replace `const cur = S[screen] || S.login` with an explicit unknown-screen text path and remove the unreachable `role` key. Collapse three bundles to one build.
**Depends on.** P12, P21, and a green P30 parity proof for every affected surface.
**Must prove.** Bundle greps for each legacy global return 0 across all shipped HTML; no route decision precedes a server call; an unknown screen key renders text and never lands a user on login; all shipped bundles report one build tag (skew 0).
**Surfaces touched.** `сайт и приложение/app.html`, `сайт и приложение/app-tenant.html`, `maya-os-site/index.html`, `scripts/verify-prepublication-contracts.mjs`.

### P28 — Telegram cutover
**Scope.** Two independent problems, deliberately not conflated. **(a) Authority-dead entry points.** The `canonical_staff_access._principal` ContextVar is written only inside the aiohttp HTTP middleware; the bot runs `start_polling`, so `is_admin()` / `is_staff()` / `master_projection()` return False/None for every Telegram-originated update, while roughly 45 owner/staff commands still execute and reply into unreachable bodies. Retire those entry points and replace each with a HANDOFF. **(b) Six body-level fenced capabilities** (`mute_master` raising, `run_loyalty_job` and `run_backfill_job` disabled, `scan_and_alert` a retired stub, `can_redeem_codes` false, `set_cashier_role` raising) fenced by the P4/P5 canonical cutover — **restoring authority would not restore these**, and they must be checked against the HTTP surface case by case. Preserve and inherit what works: one capability behind three front doors converging on one function, help generated from the intent router, deterministic regex before any LLM, mode locks, 30-minute TTL, `/cancel`, in-place `edit_message_text`, artefact delivery into the conversation, and the staff chat mirror's dedupe key as the convergence seam.
**Depends on.** P22, P23, P15, P11.
**Must prove.** 0 commands remain that execute, reply, and reach an authority-gated body that cannot be entered; each of the ~45 has a recorded decision of restore-via-HTTP, handoff, or retire-with-named-successor; each of the 6 fenced capabilities has an individually verified HTTP successor or an explicit "no successor, capability withdrawn" record; no per-channel help list is hand-written anywhere (I4).
**Surfaces touched.** `ai администратор/bot.py`, `ai администратор/webhook_server.py`.

### P29 — Accessibility conformance and certification
**Scope.** Certification, not construction. Accessibility is **not a wave** — it is P05's gate running on every package from Wave 1 onward. This package certifies the result end to end.
**Depends on.** P05, P10, P17, P19.
**Must prove.** WCAG 2.2 AA on the chat shell and every fullscreen route with 0 critical findings; `reading_order` covers every interactive element in every fixture; `live_region` is never `alert` for a non-KNOWN `Cell`; every `media` carries `alt`; a screen-reader user who types a sentence, a voice user who says it, and a thumb that taps produce the identical audit line; keyboard-only completion of one booking, one approval and one consent handoff.
**Surfaces touched.** `сайт и приложение/app.html`, `.github/workflows/platform-ci.yml`.

### P30 — Deletion under parity (INV-16)
**Scope.** **The only package in the programme permitted to delete.** Executes deletions one at a time, each gated on its own parity proof. Deletion candidates are exactly the ledger rows whose successor has been proven reachable.
**Depends on.** Every package above.
**Must prove.** For every deletion: a named successor route, a passing parity test naming that successor, and a recorded rollback; **count of deletions lacking a parity test is 0**; no deletion removes the last route to any capability key in the P02 canon; a deleted surface's ledger row transitions to `RETIRED` with the successor id and the commit that removed it.
**Surfaces touched.** All of them, individually and reversibly.

---

## 10. Why this order

**Wave 1 before anything because 126 surfaces have no disposition.** Any frontend work started before P06 would migrate a set whose membership is unknown, and would have to be redone when the 126 are placed. The dossier is also the artefact a human can actually approve — nobody can approve "a chat-first rewrite," and everybody can approve a table of 795 rows with named successors.

**The Intent Gateway (P07) before any renderer** because it is the one component whose absence silently converts the whole design into the thing it forbids. Build the renderer first and the fastest path to a working demo is a button that names an endpoint. Once the wire format has no field for an endpoint, that path is not available to anyone, including a tired engineer at 2am.

**Read-only kinds (Wave 2) before write kinds (Wave 3)** because a read-only widget that is wrong shows a wrong number, and a write widget that is wrong makes a wrong booking. The first production exposure should be able to fail cheaply. TEXT_ONLY first inside that, for the same reason one rung down.

**Authority (P12) before booking (P13)** because the booking two-phase is enforced by the non-existence of a COMMIT token outside a `BOOKING_CONFIRMATION`, and non-existence is only meaningful once the minting authority is the thing deciding it.

**Parity migration (Wave 4) before restorations (Wave 5)** with one deliberate exception in mind: P20 must land before P22 so that the consent surfaces are fenced as HANDOFF-only *before* their canonical owners exist. Fencing first means the gap fails closed and honest. Fencing after would mean a window in which a chat-rendered control exists for a capability whose split has not yet been enforced.

**Restorations (Wave 5) before cutover (Wave 6)** because six of the eight gaps are `NEVER_CHAT_ACTUATED`, and P30 cannot delete a Telegram consent entry point while its successor is still a phone number in bot copy. Legal exposure first within the wave: two live surfaces currently promise a revocation that does not exist, which is an active 152-FZ problem and not a UX one.

**Cutover last, and deletion last within cutover.** P30 is a thin package deliberately. All its difficulty was moved into the parity proofs that Waves 4 and 5 produce, so that the moment of deletion is mechanical and individually reversible rather than a large irreversible event.

---

## 11. The Wave-1 exit gate

Waves 2-6 are locked until **all five** hold:

1. P01-P05 merged with their architecture specs green in `platform-ci.yml`.
2. P06 dossier published with `UNASSIGNED = 0` across all 795 rows.
3. Every disposition names a successor resolving to a P02 canon key or a recorded gap.
4. Each of the 49 primary-nav survivors carries a written justification.
5. A human has approved the dossier, and its hash is pinned in code the way `C9_REGISTRY_HASH` is.

Until then, Wave 1 is reverted by `git revert` plus removing one CI job. Nothing in production has changed.

---

## 12. THE FINITE COMPLETION GATE

The chat-first cycle is complete when, **on one commit, in one CI job named `chat-first-completion-gate`, all 17 conditions are green simultaneously.** Any condition amber or unmeasured means the cycle is not complete. There is no partial completion and no "complete with caveats."

| # | Condition | Exact check | Threshold |
|---|---|---|---|
| G1 | Ledger closure | Ledger rows with disposition `UNASSIGNED` | **= 0** of 795 |
| G2 | Successor closure | Ledger rows whose successor does not resolve to a live route or capability key | **= 0** |
| G3 | Capability non-loss | Capability keys reachable before minus reachable after, computed from the canon | **= 0 lost** |
| G4 | Gap closure | Canon entries with `owner: NONE` | **= 0** of the 8 |
| G5 | Portability | Emitted envelope kinds failing the TEXT_ONLY R1 gate over the fixture corpus and a production sample | **= 0** |
| G6 | Number provenance | Numerals in rendered text with no corresponding `Measure` | **= 0** |
| G7 | Authority singularity | Bundle greps for `__meRole`, `__meIsStaff`, `__meIsMaster`, `__meIsFounder`, `__panelInfo.permissions`, and for any route decision reading `me_is_staff` before a server call | **= 0 hits** in all shipped HTML |
| G8 | Router honesty | Occurrences of a silent screen fallback to login; unreachable router keys | **= 0** and **= 0** |
| G9 | Overlay elimination | Self-mounting DOM hosts at `zIndex 2147483000`; overlays re-expressed as route keys | **= 0** and **7 / 7** |
| G10 | Bundle unification | Distinct build tags across `app.html`, `app-tenant.html`, `maya-os-site/index.html` | **= 1** |
| G11 | Primary-nav ratchet | Primary-nav surface count; survivors lacking a written justification | **<= 49** and **= 0** |
| G12 | No second backend contract | New business controllers introduced by the widget layer; projectors citing a non-canon capability | **<= 2 total routes** and **= 0** |
| G13 | Intent unforgeability | Fuzz suite: mutated, expired, replayed, cross-principal, cross-tenant, oversize and forbidden-key submissions accepted | **= 0 accepted** |
| G14 | Booking by absence | Static proof that a booking COMMIT token can be minted outside a `BOOKING_CONFIRMATION` | **= 0 paths** |
| G15 | PII fences | The five original client-preview fences still fire independently; A4 rejections behave | **5 / 5 independent** |
| G16 | Proactive integrity | Canonical moments emitting through `Origin` with a `dedupe_key`; duplicate deliveries across push, chat and the Telegram mirror over 14 days | **12 / 12** and **= 0** |
| G17 | Deletion under parity | Deletions lacking a named successor and a passing parity test; Telegram commands executing into unreachable authority-gated bodies; fenced capabilities without an individually verified successor or an explicit withdrawal record | **= 0**, **= 0**, **= 0 of 6** |

Two standing conditions sit outside the table because they are absence-of-work rather than presence-of-proof, and both are asserted by architecture spec rather than by a person: `authority_basis` retains exactly one legal value and no envelope can autonomously initiate business strategy (**Chapter 10 not started**); and accessibility certification G-equivalents from P29 fold into G5 and G6, which is the point of making text the canonical form.

---

## 13. What the evidence does not settle

Three things, stated rather than invented.

**The target primary-nav count.** The dispositions take 112 to 49. Nothing in the inventory says what the final shell should hold. G11 is therefore set at the evidenced number plus a forcing function (a justification per survivor), not at an invented target. My recommendation, offered as a recommendation: chat plus four persistent entries. That needs a second adjudication pass and an owner's decision, and it is not derivable from 795 rows.

**The Telegram authority-dead mechanism's causality.** Two of three independent verifiers confirmed at high confidence; the dissenter disputed causality, not mechanism. P28 is therefore written so that it is correct either way: every one of the ~45 commands gets an individually recorded decision, and the six body-level fenced capabilities are checked against the HTTP surface case by case regardless of whether authority is restored. A plan that depends on the disputed causal claim would be a plan with a hole in it.

**Out-of-repo native surfaces.** There is no native application source in this repository. The Capacitor iOS shell and Android TWA load the same web bundle and the bundle hard-depends on a plugin contract — `MayaRuntime` (`openTipsURL`, `checkTipsAvailability`, `loadRemoteImage`), `MayaNfcWriter.writeUrl`, `AppIcon`, and `App.addListener('appUrlOpen')` with three custom schemes. P11 and P19 must treat that contract as frozen and versioned, because the shell ships on a different cadence than the bundle and a bundle that assumes a newer plugin will fail silently on an older shell. Nothing in this repository can prove that contract holds; only the shell repositories can, and the completion gate cannot assert what it cannot check.
