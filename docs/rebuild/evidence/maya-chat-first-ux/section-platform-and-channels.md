# Native / PWA / Channel Shared Contract — `maya.channel.profile/1`

**Scope of this cycle: architecture only.** Runtime changes: 0. Schema changes: 0. Migrations: 0. Production mutations: 0. Chapter 10 is not started. Nothing below authorises deleting a screen, a route, a command or a plugin call site. This section defines four new declarative artefacts — `ChannelProfile@1`, `RenderReceipt@1`, `maya.native.bridge/1`, `VoiceSurface@1` — plus one normative floor, `A11yFloor@1`, all of which sit *beside* `maya.widget.envelope/1` and add no business endpoint.

---

## 0. The verdict

> **YES — a single shared business interaction contract is achievable, for the eleven channels that render to a human. It is not achievable, and must not be attempted, for the five emitter/transport channels or the one security surface.**

**The reason it works** is not optimism about channels; it is a consequence of two decisions already taken in `maya.widget.envelope/1`:

1. **Authority left the client.** The entire interactive surface is a closed list of server-minted `intent_token`s (§6). A channel cannot author an affordance, cannot name a provider, endpoint, table, record id or price, and cannot assert a `VerificationLevel` (A2). Therefore *what a user may do* is identical on iOS, in a browser, inside Telegram, through a push action or by speaking — because none of those surfaces is the thing that decides.
2. **Text became canonical, not alternative.** `text_equivalent` is server-minted by a pure function and covered by `body_hash` (R0), and R1 makes the `TEXT_ONLY` rendering the conformance reference. Therefore the *poorest* channel is already the *defining* channel. Every richer channel is a superset of presentation over an identical business core. A channel can only ever lose decoration; it has no mechanism for gaining authority.

What is left to differ between channels is exactly three things, all declarative, all reductive: **how many affordances fit**, **which carrier moves a token**, and **which presentation capabilities exist**. That is what a `ChannelProfile` is, and it is why one contract suffices.

**The one thing that could plausibly have broken this — native plugins — turns out not to be a business capability in this codebase at all.** Verified by reading the three shipped bundles:

| Plugin symbol | `сайт и приложение/app.html` (build 2026-09-02) | `maya-os-site/index.html` (build 2026-08-01) | `сайт и приложение/app-tenant.html` |
|---|---|---|---|
| `MayaRuntime` | 5 refs | 1 ref | **0** |
| `MayaRuntime.openTipsURL` | 4 | 0 | 0 |
| `MayaRuntime.checkTipsAvailability` | 3 | 0 | 0 |
| `MayaRuntime.loadRemoteImage` | 2 | 0 | 0 |
| `MayaRuntime.getPreviewAccess` | 2 *(not in the brief's list — a fourth method)* | 0 | 0 |
| `MayaNfcWriter` | 2 | 2 | **0** |
| `AppIcon` | 37 | 35 | **0** |
| `TeamVoicePlayer` | 1 | 2 | 2 |
| `Plugins.Keyboard` | 3 | 3 | 1 |
| `Plugins.Haptics` | 2 | 1 | 0 |
| `App.addListener('appUrlOpen')` | 1 | 1 (three schemes) | 1 (one scheme) |

**Three bundles, one shell, three different implicit plugin contracts, and no handshake anywhere.** `app-tenant.html` already runs natively with *no* `MayaRuntime`, *no* `MayaNfcWriter` and *no* `AppIcon`, and it works. That is empirical proof, from production artefacts, that no business capability is gated on a plugin. The plugins are decoration (`AppIcon` tenant branding, `Haptics`, `Keyboard` height, `TeamVoicePlayer`), a transport alias (`appUrlOpen`), a carrier for a capability that also has a web route (`openTipsURL`, `MayaNfcWriter.writeUrl`), or a platform image loader (`loadRemoteImage`).

**The scoped exclusions.** Of the 17 inventoried channels, only **11 render an envelope to a human**. Five — `scheduler` (32 surfaces), `backend` (7), `edge-relay` (21), `smm-bot` (26), `social-publishing` (7) — are **emitters and transports**: they *cause* envelopes or move bytes, they never render one. One — `public-web-auth` (6) — is a **security surface**, and by §6.8 / B3 it is precisely where `SECURE_SURFACE_ONLY` fields and the `NEVER_CHAT_ACTUATED` handoffs terminate. Giving any of these six a `ChannelProfile` would let a transport declare presentation capability, which is the shape of a fourth authority path. They are excluded by design, and the exclusion is the reason the YES is safe.

---

## 1. One business interaction model, eleven renderers

### 1.1 The layering

```
                      ┌─────────────────────────────────────────┐
   BUSINESS LAYER     │  capability owners · C9 orchestrator ·   │   identical
   (channel-blind)    │  IntentGateway · IntentRecord store      │   everywhere
                      └──────────────────┬──────────────────────┘
                                         │ emits
                      ┌──────────────────▼──────────────────────┐
   PROJECTION LAYER   │  WidgetEnvelope + degrade(env, profile)  │   server-side
   (profile-aware)    │  → RenderReceipt                         │   degradation
                      └──────────────────┬──────────────────────┘
                                         │ carries
   PRESENTATION LAYER │  11 renderers × 7 render tiers           │   layout only
   (profile-declared) │  native bridge = a PWA profile + bridge  │
                      └─────────────────────────────────────────┘
```

### 1.2 Decision D1 — **degradation is server-side; renderers never drop an intent**

A renderer declares its profile; the **server** emits an envelope already fitted to that profile, together with a `RenderReceipt` recording what it did.

*Why.* Intents are server-minted, principal-bound and expiring. A renderer that silently drops one is making an editorial decision with authority-shaped consequences (which capability the user believes exists) and leaves no receipt. Moving degradation server-side means the decision is logged, testable, identical for every client claiming the same profile, and — critically — the server can guarantee the invariant that *nothing withheld is unreachable*. It also makes A2 hold at channel scale: **a client that lies about its profile can only make the widget uglier, never more powerful.**

This is consistent with the envelope already carrying `render: RenderReceipt` ("what degradation the server already applied", §9.2) and with `profile_id` already travelling in the submission (§6.2).

A renderer may still perform **presentation** degradation: wrap, truncate visually with an expander, paginate a table, collapse a section, choose `INLINE`/`CARD`/`SHEET`. It may never change the intent set, re-rank a COMMIT into primary position, hide a `Limitation`, or hide a non-`KNOWN` Cell (R5).

### 1.3 Decision D2 — **native is not a channel; it is a PWA profile plus a bridge**

There is no native application source in this repository. The iOS Capacitor shell and the Android TWA both load the same web bundle. Modelling "native" as a separate channel would require a second business interaction model for a second codebase that does not exist.

Therefore: `pwa` and `native-shell` share **one profile family** (`RICH_INTERACTIVE`) and differ by exactly one optional block, `native_bridge`. Every difference between them is expressed as bridge capabilities, never as a different envelope, a different intent set or a different route table.

### 1.4 `ChannelProfile@1`

```ts
interface ChannelProfile {                    // "maya.channel.profile/1"
  contract: 'maya.channel.profile/1';
  profile_id: string;                 // stable id, e.g. 'pwa.v1', 'tg.bot.v1', 'push.v1'
  channel_id: ChannelId;              // closed; one of the 11 rendering channels
  render_tier: RenderTier;            // §2
  locale_hint: string;

  // ── capacity (all reductive; the server fits to the MINIMUM of these) ─────
  max_intents: number;                // affordances the carrier can present at once
  max_intent_label_chars: number;
  max_body_chars: number;             // hard ceiling on rendered text
  max_table_rows: number;             // 0 = tables not renderable inline
  max_options_inline: number;
  token_carrier: TokenCarrier;        // §2.2 — one token, five carriers
  token_budget_bytes: number;         // 64 for Telegram callback_data

  // ── presentation capabilities (DECLARED, never authority) ────────────────
  supports: {
    rich_layout: boolean;
    tables: boolean;
    charts: boolean;                  // false ⇒ CHART renders table_equivalent
    images: boolean;
    inline_edit: boolean;             // false ⇒ FORM escalates to fullscreen_detail
    multi_select: boolean;
    progressive_update: boolean;      // Telegram edit_message_text, SSE, WS
    fullscreen_routes: boolean;       // can a route_key be opened at all?
    speech_out: boolean;
    speech_in: boolean;
    back_stack: boolean;
    deep_link_in: boolean;
  };

  // ── environment the renderer reports about itself (§5) ───────────────────
  a11y_env: A11yEnvironment;
  motion: 'full' | 'reduced';         // from prefers-reduced-motion
  text_scale: number;                 // 1.0 … 3.0 (Dynamic Type / browser zoom)
  color_scheme: 'light' | 'dark' | 'high_contrast';
  viewport_min_css_px: number;

  // ── native only ──────────────────────────────────────────────────────────
  native_bridge?: BridgeSession;      // §4

  // ── type-level bans ──────────────────────────────────────────────────────
  declares_verification_level: never; // A2 — a profile may NEVER assert authority
  declares_role: never;               // a profile may NEVER assert a role
  declares_capability: never;         // a profile may NEVER assert a business capability
}

type ChannelId =
  | 'pwa' | 'native-shell' | 'telegram-miniapp' | 'telegram-bot' | 'web-push'
  | 'realtime-voice' | 'guest-chat' | 'web-public' | 'public-community'
  | 'sms' | 'email';

type TokenCarrier =
  | 'json_body' | 'callback_data' | 'notification_action'
  | 'spoken_alias' | 'signed_path_segment';
```

**C1 — a profile is monotone-reductive.** Every capacity field can only cause the server to emit *less*. There is no profile field whose larger value unlocks a capability. This is checkable: the fitter function must be monotone in every numeric field and every boolean must appear only in a "may I still show X" position.

**C2 — the forbidden-key validator (INV-1) applies to `ChannelProfile` verbatim.** No `role`, `permissions`, `token`, `is_staff`, `is_owner`, `__meRole`, `__meIsStaff`, `client_id`, `staff_id` at any depth. A profile that carried an identity key would be exactly the fourth authority path this contract exists to prevent — and the live defect is already a third one (`localStorage.me_is_staff === '1' → go('choose')` before any server call).

**C3 — `profile_id` is advisory, never trusted.** The server may override a claimed profile downward (rate-limiting, policy, an envelope whose pinned intents do not fit). It may never override it upward.

### 1.5 `RenderReceipt@1`

```ts
interface RenderReceipt {
  profile_id: string;
  render_tier: RenderTier;
  intents_minted: number;             // before fitting
  intents_emitted: number;            // after fitting
  intents_withheld: Array<{
    role: WidgetIntent['role'];
    reason: 'capacity' | 'carrier_limit' | 'verification_floor'
          | 'bridge_absent' | 'policy' | 'secure_surface_only';
    reachable_via: string;            // REQUIRED: an emitted intent_token or route_key
  }>;
  body_reductions: Array<{
    path: string;                     // dotted path inside body
    reduction: 'summarised' | 'paginated' | 'masked' | 'omitted';
    restored_by: string;              // REQUIRED: an emitted intent_token or route_key
  }>;
  text_equivalent_is_canonical: boolean;   // true whenever render_tier === 'TEXT_ONLY'
  escalation: { to_route_key: string; reason: Presentation['fullscreen_detail'] extends
                  { reason: infer R } ? R : never } | null;
  degraded_at: string;
}
```

**C4 — nothing withheld is unreachable (the render-time expression of "removing a tab never removes the capability").** Every entry in `intents_withheld` and `body_reductions` must name a `reachable_via` / `restored_by` that is present in the emitted envelope. A receipt that cannot name one is a **failed emission**, not a degraded one: the server must instead emit a `LIMITATION` or `HANDOFF`-only envelope. This single rule is what makes aggressive degradation safe.

**C5 — the receipt is narrated, not hidden.** Where anything was withheld or reduced, `text_equivalent.completeness_sentence` must say so in prose. A user on SMS must be able to tell that they are seeing three of eleven slots, and how to get the rest.

---

## 2. The seven render tiers, and the eleven channels on them

| Tier | Channels | `max_intents` | Carrier | Effect ceiling permitted | Notes |
|---|---|---|---|---|---|
| `RICH_INTERACTIVE` | `pwa`, `native-shell`, `telegram-miniapp` | 12 | `json_body` | up to `COMMIT` | full envelope; `fullscreen_detail` available |
| `RICH_CONSTRAINED` | `telegram-bot` | **8** | `callback_data` (64 B) | up to `COMMIT` | inline keyboard; `edit_message_text`, not chat spam |
| `ANNOUNCEMENT` | `web-push` | **0–2** | `notification_action` | **`NAVIGATE` max** | see D5 |
| `SPOKEN` | `realtime-voice` | **5 + overflow** | `spoken_alias` | up to `COMMIT` **with readback** | §5 |
| `TEXT_ONLY` | `sms`, `email` | **1** (one `HANDOFF`) | `signed_path_segment` | **`HANDOFF` max** | the R1 reference renderer |
| `PUBLIC_READ` | `web-public`, `public-community` | 2 | `json_body` | **`NAVIGATE` / `HANDOFF`** | `verification_level: 'ANONYMOUS'` |
| `ANONYMOUS_CHAT` | `guest-chat` | 4 | `json_body` | **`REFINE` / `HANDOFF`** | never `client_identified` PII |

**Tiers are a presentation classification, not an authority classification.** A `RICH_CONSTRAINED` Telegram bot message and a `RICH_INTERACTIVE` PWA card can both carry a `COMMIT` intent, because whether that intent is *permitted* is decided by `ConfirmationRequirement.required_verification` against the server-derived `VerificationLevel` — not by the tier. Conversely, a `RICH_INTERACTIVE` Mini App session that is only `CHANNEL_IDENTITY` gets no `COMMIT` on a restricted capability, despite the richest tier available.

### 2.1 The fitting algorithm (normative)

```
degrade(envelope, profile) -> { envelope', receipt }

1. VERIFICATION FLOOR  — withhold every intent whose
   requires.required_verification exceeds the session's server-derived level.
   reason: 'verification_floor'.  Each must be replaced by, or reachable via,
   a HANDOFF intent to a channel that can satisfy it.

2. SECURE SURFACE      — withhold every intent touching a SECURE_SURFACE_ONLY field
   and every intent whose capability is in NEVER_CHAT_ACTUATED.
   reason: 'secure_surface_only'.  Only HANDOFF survives (§6.8).

3. CARRIER CEILING     — withhold every intent whose effect exceeds the tier's ceiling
   (e.g. anything above NAVIGATE on web-push).  reason: 'carrier_limit'.

4. PIN                 — pinned := intents with priority 0
   (the escape verb, the sole COMMIT, the sole HANDOFF).
   IF |pinned| > profile.max_intents
      → DO NOT partially render.  Emit instead a LIMITATION or HANDOFF-only
        envelope naming the route that can. (C4 holds by construction.)

5. FIT                 — sort the remainder by priority ascending;
   drop from the tail until |emitted| <= max_intents - 1,
   reserving one slot for a server-minted `more` intent whenever anything was dropped.
   The renderer NEVER synthesises this; only the server may mint an intent.

6. BODY                — apply max_table_rows / max_body_chars / max_options_inline.
   Every reduction records restored_by.  A REPORT with depth-2 sections in a
   non-RICH tier collapses to top_summary (≤3) + fullscreen_intent — never to a
   truncated hierarchy in a bubble.

7. MINT TEXT           — text_equivalent is re-minted for the DEGRADED envelope,
   so R1 holds on what was actually sent, not on what was originally composed.

8. SEAL                — body_hash and envelope_seal are computed AFTER degradation.
   A degraded envelope is a first-class envelope, not a truncated one.
```

**C6 — degradation is never silent and never lossy in the audit sense.** The undegraded envelope and its receipt are both retained server-side under the same `widget_id`. "What did the user on SMS actually see?" is answerable exactly, which is what makes the parity CI gates (§6) possible.

### 2.2 One token, five carriers — the wire rules

| Carrier | Encoding | Hard limit | Rule |
|---|---|---|---|
| `json_body` | `intent_token` verbatim | — | PWA, native shell, Mini App, guest chat, public read |
| `callback_data` | `w1.<widget10>.<intent6>.<sig8>` base62 ≈ 28–30 B | **64 B** | the constraint that forces the token to be an opaque handle and the `IntentRecord` store to exist |
| `notification_action` | `intent_token` verbatim | `Notification.maxActions` | read at runtime; **default 0** (§3.3) |
| `spoken_alias` | deterministic match on `speech_aliases` ∪ `ordinal`, **pre-LLM**, resolved server-side | 5 + overflow | §5 |
| `signed_path_segment` | one HANDOFF deep link, token in a signed path segment | 1 | never a query parameter (R3, and see D6) |

**C7 — a token never travels in a query string.** Today's service worker computes `d.url || (d.master ? '/app/?tips=' + encodeURIComponent(d.master) : '/app/')` and opens it: a **sender-chosen URL carrying a staff identifier in a query parameter**, which then mounts one of the seven self-mounting overlays. Query parameters are logged by proxies, land in history, leak in referrers, and — in this codebase specifically — are the mount mechanism for the overlays that R3 abolishes. Tokens go in signed path segments or POST bodies.

---

## 3. Worked example — one `TIME_SLOT_SELECTOR` across six carriers

Source: `booking.availability.read`. Eleven free slots, three days, two masters. `freshness_class: 'live'`. Effect ceiling: **DRAFT — never COMMIT** (I2b: no COMMIT token for this booking exists anywhere in the system at this moment).

**`RICH_INTERACTIVE` (PWA / native shell / Mini App)** — grouped by day, eleven slot chips, `more`, `widen_window`, `none_fit`, escape. `intents_emitted: 12`. Receipt: no withholding. Each chip is a real `<button>` with the `utterance` as its accessible name.

**`RICH_CONSTRAINED` (Telegram bot)** — `max_intents: 8`. Server fits: 5 slots (2 per row) + `Другое время` (`more`) + `Не подходит` (`none_fit`) + `Отмена` (escape, own row, priority 0). `intents_withheld: 6 × {reason:'capacity', reachable_via: <more token>}`. Refinement **edits the same message** (`progressive_update: true`) rather than appending; the flow holds `input_lock: 'soft'` with `flow_ttl_s: 1800`; `/cancel` reaches the escape intent in addition to the button.

**`ANNOUNCEMENT` (web push)** — the notification is *never* the selector. It is: `«Есть 11 свободных окон на этой неделе»` + one `NAVIGATE` intent that opens the chat message anchored at `correlation.message_id`. `intents_emitted: 1`, ceiling `NAVIGATE`. Receipt: ten intents withheld with `reason: 'carrier_limit'`, all `reachable_via` the single navigate token.

**`SPOKEN` (realtime voice)** — `speech.lead`: *«Нашла одиннадцать окон. Ближайшие: первое — сегодня в 15:00 у Ильи; второе — сегодня в 18:30; третье — завтра в 12:00…»*, five enumerated, then `overflow_say`: *«Есть ещё шесть. Скажите „другое время“ или „ещё“.»* Saying *«второе»* resolves the `ordinal` deterministically to the same `intent_token` the thumb would have pressed. The result is a **DRAFT**; the spoken confirmation that follows is a separate `BOOKING_CONFIRMATION` envelope with `requires_readback: true`.

**`TEXT_ONLY` (SMS)** — `text_equivalent.body` prose, `itemized` three lines, `completeness_sentence`: *«Показаны 3 из 11 окон»*, and one signed deep link. `intents_emitted: 1` (HANDOFF). This rendering is simultaneously the screen-reader description, the transcript line, the archived summary and the R1 conformance fixture — **the same bytes, by construction, not by convention.**

**`ANONYMOUS_CHAT` (guest chat)** — `verification_level: 'ANONYMOUS'`. Slots render (they are not PII), but every slot intent fails the verification floor at DRAFT. Emitted: the slot list as read-only Cells + one HANDOFF (*«Войдите, чтобы забронировать»*) + escape. No `pii_class: 'client_identified'` content is expressible here at all.

Six carriers. One `IntentRecord` table. One `frozen_nouns` set. One fresh read at Gate 9. **One audit line whose shape does not reveal which carrier produced it.**

---

## 4. The native bridge — `maya.native.bridge/1`

### 4.1 What is actually broken today

Every plugin access in all three bundles is an independent, hand-rolled guard at the call site:

```js
var runtime = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.MayaRuntime;   // ×5
var AI = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AppIcon;            // ×37 sites
var nativeWriter = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.MayaNfcWriter;
if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
```

Three defects follow, and all three are structural rather than accidental:

1. **`isNativePlatform()` is a platform predicate being used as a capability predicate.** `app-tenant.html` proves these are different: it is native and has no `MayaRuntime`. Any code that reads "native ⇒ the plugin is there" is wrong today, in production, on a shipped bundle.
2. **Method presence is not feature-detectable.** Capacitor generates plugin proxies; `Plugins.MayaRuntime` can exist while `openTipsURL` does not, and calling a missing method rejects at runtime rather than returning undefined. Object-presence guards therefore check the wrong thing.
3. **There is no version handshake.** An older shell + a newer bundle (the exact situation the three divergent builds create) fails at the moment of use, inside a user flow, with no way to have said "не поддерживается на этом устройстве" beforehand.

**But the repository also already contains the solution, twice, hand-rolled:** `MayaRuntime.checkTipsAvailability()` and `AppIcon.isSupported()`. The design below generalises a proven in-repo pattern rather than importing a foreign one.

### 4.2 The contract

```ts
// ── declared by the SHELL at boot (out-of-repo change required, see §7) ─────
interface NativeBridgeManifest {
  contract: 'maya.native.bridge/1';
  shell: {
    kind: 'capacitor_ios' | 'android_twa' | 'none';
    shell_version: string;            // semver of the shell build
    bundle_id: string;
    min_bundle_contract: string;      // oldest widget contract the shell supports
  };
  provides: BridgeCapability[];
  schemes: string[];                  // ['mayaos', 'ru.mayaos.app', 'pro.malesthetic.app']
  manifest_hash: string;
}

interface BridgeCapability {
  key: BridgeKey;
  version: number;
  availability: 'available' | 'unavailable' | 'requires_probe';
  probe?: string;                     // side-effect-free method returning {value:boolean}
                                      // e.g. 'checkTipsAvailability', 'isSupported'
}

type BridgeKey =
  | 'runtime.image.remote_load'       // MayaRuntime.loadRemoteImage
  | 'runtime.tips.open'               // MayaRuntime.openTipsURL
  | 'runtime.tips.availability'       // MayaRuntime.checkTipsAvailability
  | 'runtime.preview_access'          // MayaRuntime.getPreviewAccess
  | 'nfc.write_url'                   // MayaNfcWriter.writeUrl
  | 'app_icon.set'                    // AppIcon (+ isSupported probe)
  | 'keyboard.height'                 // Keyboard → --me-kbd-height
  | 'haptics.impact'                  // Haptics, web fallback navigator.vibrate
  | 'team_voice.play'                 // TeamVoicePlayer
  | 'deep_link.receive'               // App.addListener('appUrlOpen')
  | 'audio.capture_pcm16';            // native capture feeding /api/ai/transcribe

// ── declared by the BUNDLE at build time ───────────────────────────────────
interface BundleBridgeRequirements {
  required: [];                       // ← NORMATIVE: THE EMPTY TUPLE, ENFORCED BY TYPE
  optional: BridgeKey[];
  degradations: Record<BridgeKey, {
    when_absent: 'web_fallback' | 'hide_decoration' | 'cell_unavailable' | 'handoff';
    fallback_ref?: string;            // route_key or web API used instead
    cell_reason?: ReasonCode;         // when 'cell_unavailable'
  }>;
}

// ── the negotiated result, folded into ChannelProfile.native_bridge ────────
interface BridgeSession {
  resolved: Record<BridgeKey, 'available' | 'absent' | 'unknown'>;
  shell_kind: NativeBridgeManifest['shell']['kind'];
  shell_version: string | null;
  manifest_hash: string | null;
  negotiated_at: string;
  negotiation_mode: 'manifest' | 'probe' | 'assumed_absent';
}
```

### 4.3 Rules

**N1 — `required` is the empty tuple, enforced at the type level.** No business capability may be gated on a plugin. This is the same device as `legacy_globals_used: never`: the rule cannot be forgotten because the illegal state cannot be written down. It is not aspirational — the production evidence in §0 shows the bundle already satisfies it.

**N2 — `bridge(key)` is the only accessor.** Direct `window.Capacitor.Plugins.*` access is banned by lint. One negotiation at boot replaces 50+ call-site guards, and the 37 `AppIcon` sites collapse to one resolved flag.

**N3 — negotiation is a handshake, not a probe storm, with a declared fallback ladder.**
1. `manifest` — the shell posts `NativeBridgeManifest` into the webview before first paint. Preferred.
2. `probe` — for `requires_probe` keys, call the declared side-effect-free probe once, cache for the session.
3. `assumed_absent` — shell present but no manifest and no probe ⇒ `'unknown'`, treated as absent for affordances and rendered as a Cell, never as an error.

**N4 — a bridge capability may affect `Presentation` and `fullscreen_detail`; it may never affect `intents`.** A plugin can change *how* something is shown or *where* a handoff lands. It can never change *whether* a capability exists. If NFC is absent, the "write a card" intent is still emitted — its HANDOFF resolves to a web route instead. If `runtime.tips.open` is absent, tipping still exists; one carrier for it does not.

**N5 — absence is a `Cell`, never an error (M1).** `Cell<T>{ state:'UNAVAILABLE', reason_code:'OUT_OF_SCOPE', label:'На этом устройстве недоступно — откроется в браузере', next_intent_ref:<web handoff> }`. Never a red banner, never an error icon, never an automatic retry. **UNKNOWN must never be rendered as failure**, and `'unknown'` from mode 3 resolves to exactly this shape.

**N6 — the Android TWA declares `shell.kind: 'android_twa'` and zero capabilities.** There is no Capacitor bridge in a TWA at all, so it cannot report. Its profile is build-stamped, not negotiated: `negotiation_mode: 'assumed_absent'`, every key `'absent'`. This is the second proof that negotiation — not `isNativePlatform()` — is the correct predicate: the TWA *is* an installed app and *has* no plugins.

**N7 — the shell supplies no authority, ever.** `NativeBridgeManifest` is subject to the forbidden-key validator. A shell cannot declare a role, a session, a tenant or a verification level. `MayaRuntime.getPreviewAccess` — the fourth method, the one not in the brief's list — needs explicit care: whatever it returns is a **presentation** input at most. If the client-preview PII boundary were ever to depend on it, a shell build would become an authority path. It must be classified as `runtime.preview_access → presentation only`, and the five existing client-preview enforcement points (A4) remain untouched and unconsolidated.

### 4.4 Deep links: three schemes, one route table

`mayaos://`, `ru.mayaos.app://` and `pro.malesthetic.app://` are **aliases of one transport**, not three capabilities, and `app-tenant.html` already registers only one of them.

**N8 — the `appUrlOpen` handler parses nothing business-shaped.** It extracts `{ route_key, opaque_handle }` and hands them to the router. It must not read a staff id, a record id, a tenant slug or a price from the URL. A deep link resolves to an envelope **server-side**; until it resolves, the app shows a `PROGRESS` body, not a screen.

**N9 — a deep link lands in the router, never in an overlay.** This is R3 at the transport layer. The current `'/app/?tips=' + master` push URL is precisely a query-parameter overlay mount, and it is reached from a *sender-authored* string. Under this contract, push carries `{ widget_id, intent_token }` and the service worker resolves the destination through a closed route table it owns. **Specified this cycle; not implemented this cycle.**

**N10 — an unknown `route_key` renders `text_equivalent.body`, never a different screen.** The explicit counter-pattern to `const cur = S[screen] || S.login`, where an unknown key silently lands the user on the login page — and to the unreachable `'role'` key, which is the same defect proving itself.

### 4.5 Bridge key disposition

| Key | Class | When absent |
|---|---|---|
| `runtime.image.remote_load` | platform optimisation | `web_fallback` → normal `<img>` / fetch |
| `runtime.tips.open` | carrier for an existing capability | `handoff` → web tipping route |
| `runtime.tips.availability` | probe | treat `runtime.tips.open` as `unknown` → Cell |
| `runtime.preview_access` | **presentation only (N7)** | `cell_unavailable`, never widens PII |
| `nfc.write_url` | carrier | `handoff` → QR / link route |
| `app_icon.set` | decoration (tenant branding) | `hide_decoration` |
| `keyboard.height` | layout | `web_fallback` → `visualViewport` |
| `haptics.impact` | decoration | `web_fallback` → `navigator.vibrate`, then nothing |
| `team_voice.play` | media playback | `web_fallback` → `<audio>` |
| `deep_link.receive` | transport | `hide_decoration` — links still work via https |
| `audio.capture_pcm16` | carrier for voice | `web_fallback` → `MediaRecorder`; if that too is absent, §5 V9 |

---

## 5. Voice-first — `VoiceSurface@1`

### 5.1 The path already exists, and it is already the right shape

Verified: `POST /api/ai/transcribe` (`maya-saas-backend/src/ai-tools/ai-core.controller.ts`) is `@ApiBearerAuth()` + `@TenantScoped()`, accepts one file ≤ 1 MB *or* base64 WAV PCM16/16 kHz explicitly documented as "native CapacitorHttp-safe", and **returns `{ transcript }` — a string**. `AiSpeechService` logs only elapsed milliseconds and `pcm.length` audio bytes; the transcript is never logged and the audio is never stored. An empty transcript returns `speech_not_recognized` with human copy, not a stack trace.

That is already **audio → transcription → typed text**, terminating in a value that carries no authority. The contract's job is to make the *next* hop equally disciplined.

### 5.2 Decision D9 — voice is a carrier, never an authority path

```
 mic ─► capture ─► POST /api/ai/transcribe ─► transcript:string
                                                   │
                                                   ▼
                       deterministic match on speech_aliases ∪ ordinal   (PRE-LLM)
                                                   │
                                 ┌─────────────────┴─────────────────┐
                            matched                             not matched
                                 │                                   │
                        the SAME intent_token                 NL → orchestrator
                        a thumb would have sent                (same as typed text)
                                 │                                   │
                                 └─────────────────┬─────────────────┘
                                                   ▼
                        IntentGateway · IntentRecord · verification floor ·
                        ConfirmationRequirement · Gate 9 fresh read · canonical owner
```

**V1 — there is no voice branch below the transcript.** A spoken utterance and a typed sentence with identical bytes are indistinguishable after the transcription hop. Same `intent_token`, same gates, same audit line. This is I5 ("one capability, three front doors, one function") made literal, and it is why accessibility, voice and audit are not three implementations.

**V2 — voice never raises `VerificationLevel`.** Speaking is not authenticating. Voice biometrics are not in evidence in this repository and must not be inferred into existence.

**V3 — `NEVER_CHAT_ACTUATED` is `NEVER_VOICE_ACTUATED`.** Consent grant/withdraw, marketing revoke, identity unbind, register export, history erasure: MAYA may *explain* them aloud and may *offer* the handoff. The accept/decline control is not speakable. Six of the eight additionally have no canonical owner (§4.4 gap ledger) and by P2 carry no intent at all.

**V4 — every `COMMIT` reached by voice requires `requires_readback: true`.** The server's `presentation.speech.readback_template` is spoken back verbatim before the commit token is consumable. The user confirms the *server's* sentence, not their own.

### 5.3 The five states: logo ↔ waveform

One element. The MAYA mark is the waveform at zero amplitude; the waveform is the mark in motion. Never two components that cross-fade.

| State | What it asserts | Visual | `aria-live` announcement (polite) | Reduced motion | Exits on |
|---|---|---|---|---|---|
| `idle` | nothing; mic is cold | static mark | *(silent)* | identical | explicit user gesture |
| `listening` | mic armed, **nothing is being sent** | mark breathes; amplitude ring tracks input level | «Слушаю» | static ring + label «Слушаю»; no breathing | speech onset → `recording`; 6 s silence → `idle` |
| `recording` | this utterance **will be transmitted** | waveform at live amplitude; elapsed counter | «Записываю» | 3-step discrete level meter + counter | release / endpoint / `max_bytes` |
| `thinking` | transcribing, then resolving | waveform collapses to a travelling pulse | «Обрабатываю» | static pulse dot + label | transcript resolved |
| `responding` | MAYA is speaking or streaming | waveform driven by **output** amplitude | *(silent — the speech is the announcement)* | static mark + caption | utterance end / barge-in |

**V5 — `listening` and `recording` are distinct states and the distinction is load-bearing.** `listening` means the mic is hot; `recording` means bytes are committed to leaving the device. Collapsing them makes it impossible for a user to know when they are being transmitted. The visual difference must survive reduced motion, high contrast and 200 % text (which is why the reduced-motion column is a *different affordance*, never "no indicator").

**V6 — the mic is never auto-armed.** Every entry into `listening` requires an explicit user gesture in that session. This is the honest resolution of a real limitation: **a web application cannot reliably detect that a screen reader or OS voice control is active.** Rather than guess and steal the microphone from VoiceOver, TalkBack or Voice Control, we remove the need to detect anything.

**V7 — barge-in is mandatory in `responding`.** Speech onset, a tap, or any key interrupts output immediately and returns to `listening`. Non-interruptible speech is an accessibility failure and a usability one.

**V8 — the escape verb is always live (I3).** `«отмена» / «стоп» / «хватит»` are in `speech_aliases` for every `role: 'escape'` intent at `priority: 0`, and are matched before any other candidate. `input_lock` suppresses routing while composing but **never** suppresses escape.

**V9 — voice-disabled is the default, not a degradation.** Every voice affordance has a typed equivalent that is present, visible and equally prominent whether or not the mic exists. Voice becomes unavailable when: permission is denied; `navigator.mediaDevices.getUserMedia` is missing; `MediaRecorder` is missing (the repo carries a comment recording exactly this iOS WKWebView burn); no supported mime type negotiates; `audio.capture_pcm16` is absent and the web path also fails; or the user turned it off. In every case the surface renders `Cell{ state:'UNAVAILABLE', reason_code:'OUT_OF_SCOPE', label:'Голос недоступен на этом устройстве — напишите сообщение' }`. Neutral, not red. **UNKNOWN must never be rendered as failure.**

**V10 — the PII boundary is inherited, not re-derived.** Only byte counts and elapsed time are logged; audio is not stored; the transcript is not logged. The Telegram channel's proven rule — voice refused during contact collection — becomes general: **while `input_lock !== 'none'` on a body containing any `sensitivity: 'pii'` or `SECURE_SURFACE_ONLY` field, voice capture is refused with an explanatory Cell.**

**V11 — what the evidence does not support.** The transcription endpoint is a bounded request/response (1 MB, ~20 s timeout, Yandex SpeechKit). There is **no evidence of a duplex streaming voice path** in this repository. "Realtime voice" today is half-duplex push-to-talk. Do not design authority, budget or barge-in semantics for a duplex session that is not evidenced; when one is built, it enters through the same funnel or it does not enter.

---

## 6. The accessibility contract — `A11yFloor@1`

**Target: WCAG 2.2 Level AA, normative and CI-gated.** Not a review checklist.

```ts
interface A11yEnvironment {            // reported by the renderer, presentation-only
  reduced_motion: boolean;
  forced_colors: boolean;
  text_scale: number;                  // 1.0 … 3.0
  pointer: 'fine' | 'coarse' | 'none';
  keyboard_only_hint: boolean;         // a hint. NEVER a capability gate.
  caption_preference: boolean;
}
```

### 6.1 Why this floor is reachable here and is not reachable today

`text_equivalent` is minted by a pure server function and is the R1 conformance reference. The screen-reader string, the SMS body and the archived summary are therefore the same bytes. Accessibility stops being a retrofit because **the textual form is the canonical form, not the alternative form.**

Against that, the measured baseline in the production bundle (`сайт и приложение/app.html`, 2.72 MB): **458 `onClick` handlers against 189 `'button'` element factories.** Well over two hundred click targets are non-button elements — not focusable, not in the tab order, no implicit role, no Enter/Space activation, invisible to a screen reader's forms/buttons list. Alongside: 25 `aria-label`, 3 `aria-live`, 1 `aria-expanded`, 4 `tabIndex` across the whole application. `prefers-reduced-motion` is honoured in 14 places, which is the one bright spot. This is exactly what an ad-hoc affordance surface produces, and it is why **A-1 below is the structural fix rather than a cleanup task.**

### 6.2 The clauses

| # | Clause | WCAG 2.2 | Enforcement |
|---|---|---|---|
| **A-1** | **Every intent renders as a real `button` (or `a` for `NAVIGATE` to a route). A click handler on a non-interactive element is a contract violation.** The intent list is the *only* interactive surface (§6), so this is mechanically checkable — unlike 458 loose handlers. | 2.1.1, 4.1.2 | renderer conformance suite; lint |
| **A-2** | Accessible name = `intent.utterance`, verbatim. Visible label is `intent.label`; where they differ, the visible label must be contained in the accessible name. | 2.5.3 Label in Name | CI string check |
| **A-3** | `presentation.a11y.reading_order` must cover **every** interactive element; DOM order must equal it. | 2.4.3 | conformance suite |
| **A-4** | Focus visible at ≥ 3:1 against both adjacent colours; focus never obscured by a sticky header, sheet or keyboard inset. | 2.4.7, 2.4.11 | visual regression |
| **A-5** | No keyboard trap. `SHEET` density traps focus **within** the sheet and returns it to the invoking control on escape. The escape intent is always keyboard-reachable. | 2.1.2 | conformance suite |
| **A-6** | Roving tabindex within an option group (`role_hint: 'radiogroup'`/`'listbox'`); arrow keys move, Enter/Space select. Eleven slots are one tab stop, not eleven. | 2.1.1, 1.3.1 | conformance suite |
| **A-7** | **Non-`KNOWN` Cell state is never colour-only.** Every non-`KNOWN` Cell contributes a text token to its accessible name (`«не измерено»`, `«источник не подключён»`). Dimming is additional, never sole. | 1.4.1 | the M2 five-branch renderer test |
| **A-8** | **Charts.** `table_equivalent` is required and must be reachable by keyboard from the chart, not hidden behind hover. Series distinguished by shape/dash **and** direct label, not hue alone. `gap_policy: 'RENDER_GAP'` renders a visible break plus a text note — **never a zero**. | 1.1.1, 1.4.1 | CHART conformance |
| **A-9** | **Reduced motion.** `motion: 'reduced'` removes animation, never information. The voice waveform becomes a discrete level meter (§5.3) and the state label remains. No parallax, no auto-playing motion, no motion-only state. | 2.3.3 (AAA, adopted) | `prefers-reduced-motion` snapshot tests |
| **A-10** | **Text scale.** Legible and operable at `text_scale: 2.0` and at 320 CSS px reflow without horizontal scrolling. Only tables, diagrams and code may scroll horizontally, each in its own container. Text spacing overrides must not clip. | 1.4.4, 1.4.10, 1.4.12 | viewport matrix |
| **A-11** | **Target size** floor 24 × 24 CSS px; product standard 44 × 44 on `pointer: 'coarse'`. No capability is reachable only by drag. | 2.5.8, 2.5.7 | layout test |
| **A-12** | **Status messages.** `PROGRESS` and any state change announce via `aria-live="polite"`. **`assertive` is reserved for a blocking `Limitation` only, and `role="alert"` is never bound to a non-`KNOWN` Cell** (M1). | 4.1.3 | lint |
| **A-13** | **Timing.** Any envelope carrying `flow_ttl_s` defaults to `on_expiry: 're_resolve'`, which discharges SC 2.2.1 structurally — the user is never punished for reading slowly. Collapse-to-summary is permitted only where re-resolution is impossible, and then an extension affordance is required. | 2.2.1 | contract default |
| **A-14** | **Step-up authentication must not be a cognitive-function test.** `STEP_UP_VERIFIED` is satisfied by possession (device biometric, passkey, one tap in an already-verified channel) — never by a puzzle, a transcription task or a memory test under time pressure. This constrains how the six `NEVER_CHAT_ACTUATED` handoffs may be built. | 3.3.8 | design review gate |
| **A-15** | **Redundant entry.** A `FORM` prefills from `FormField.current`; a user never retypes what the system already holds — except where `sensitivity: 'SECURE_SURFACE_ONLY'` forbids display. | 3.3.7 | FORM conformance |
| **A-16** | **`keyboard_only_hint` is a hint.** No capability, intent or verification decision may read `A11yEnvironment`. A user on a screen reader has identical authority. | — | forbidden-key validator + type ban |

**A-17 — the parity gate (the one that subsumes the rest).** For every emitted envelope × every registered profile: render with `TEXT_ONLY`; assert every fact appears, every retained intent is reachable by a typed reply, every non-`KNOWN` Cell is stated with its `label`, and every `intents_withheld` entry names a reachable route. **If `text_equivalent` cannot express the widget, the widget may not be emitted.** This single test is the accessibility conformance test, the SMS render test, the voice render test and the screen-reader description test.

---

## 7. Conformance gates

| Gate | Proves | Fails on |
|---|---|---|
| **G1 profile matrix** | every envelope kind × 7 tiers degrades legally | a pinned intent that does not fit and no substitute envelope |
| **G2 receipt closure (C4)** | nothing withheld is unreachable | a `reachable_via` / `restored_by` not present in the emitted envelope |
| **G3 monotonicity (C1)** | no profile field unlocks anything | a fitter branch where a larger capacity adds an intent the smaller one did not have |
| **G4 forbidden keys (INV-1/C2)** | no identity key in profile, manifest, receipt or submission | any banned key at any depth |
| **G5 carrier budget** | Telegram tokens ≤ 64 B; push actions ≤ `Notification.maxActions` | an over-budget encoding |
| **G6 bridge independence (N1)** | `required: []` | a non-empty `required`, or a `window.Capacitor.Plugins.*` access outside `bridge()` |
| **G7 bridge absence is a Cell (N5/M1)** | plugin-absent paths render neutral | an error theme token, error icon, `role="alert"` or auto-retry on a non-`KNOWN` Cell |
| **G8 voice funnel (V1)** | transcript → same `intent_token` as tap | any capability reachable by voice and not by text, or vice versa |
| **G9 voice fences (V3/V4/V10)** | commit readback, `NEVER_VOICE_ACTUATED`, PII lock | a speakable consent/unbind control, or capture during a PII lock |
| **G10 A11yFloor (A-17)** | the whole of §6 | any clause A-1 … A-16 |
| **G11 numerals (R2)** | every rendered numeral maps to a `Measure` | a model-authored number in any carrier, including spoken output |
| **G12 route closure (N10)** | unknown `route_key` → `text_equivalent.body` | any fallback to a different screen |

---

## 8. Decisions register

| # | Decision | Chosen | Why | Rejected |
|---|---|---|---|---|
| D1 | Who degrades | **Server** | auditable, uniform, lets C4 be guaranteed; a lying profile only makes things uglier | client-side fitting — unlogged editorial authority |
| D2 | Native's status | **A PWA profile + bridge** | no native source exists; same bundle, same router | a native channel — a second model for a codebase that isn't here |
| D3 | Plugin detection | **Boot handshake (`bridge(key)`)** | `app-tenant.html` is native with no `MayaRuntime`; method presence isn't detectable | `isNativePlatform()` — a platform predicate misused as a capability predicate |
| D4 | Plugin absence | **A `Cell`** | UNKNOWN must never render as failure | an error state / retry |
| D5 | Push effect ceiling | **`NAVIGATE` only** | the action list is device-resident, unauthenticated at tap time, and capped at 0–2; a commit there is a commit nobody verified | DRAFT/COMMIT in a notification action |
| D6 | Push payload | **`{widget_id, intent_token}` + SW-owned route table** | today's sender-chosen `'/app/?tips='+master` puts a staff id in a query string and mounts an overlay | keeping a sender-authored URL |
| D7 | Telegram capacity | **8 intents, escape alone on the last row, `more` for overflow** | 64 B `callback_data`; truncation would silently delete capability | truncating the tail |
| D8 | Voice enumeration | **5 + `overflow_say`** | working-memory limit; ordinals are server-minted and deterministic | reading all eleven |
| D9 | Voice authority | **Carrier only** | `/api/ai/transcribe` already returns a bare string; no voice biometrics in evidence | speaker identity as a verification level |
| D10 | Mic arming | **Never automatic** | AT presence is not reliably detectable on the web; removing the need to detect beats guessing wrong | heuristic AT detection |
| D11 | Reduced motion | **Different affordance, never fewer states** | a state that exists only as motion is invisible to a third of the matrix | dropping the indicator |
| D12 | Voice-off | **The default, not a fallback** | `MediaRecorder` already burned them once in iOS WKWebView | mic-only entry points |
| D13 | Channel scope | **11 renderers; 5 emitters and 1 security surface excluded** | a transport with a presentation profile is the shape of a fourth authority path | one profile for all 17 |

---

## 9. What this section does *not* settle

Stated plainly, because inventing here would be worse than leaving it open.

1. **The shell manifest cannot be verified from this repository.** `NativeBridgeManifest` requires a change in the out-of-repo Capacitor iOS shell. Until it ships, negotiation runs in `probe` or `assumed_absent` mode, and `'unknown'` must be a legal, non-alarming resolution. The design is deliberately correct in all three modes.
2. **The Android TWA cannot be characterised from here.** Only the packaging artefact is in the tree (`МЭП - Google Play package/`, TWA `pro.malesthetic.twa`). `shell.kind: 'android_twa'` with zero capabilities is the safe assumption, not a verified fact.
3. **Push action availability is genuinely unknowable in advance.** `Notification.maxActions` is readable at runtime but varies by browser and OS; some desktops render none. Hence `max_intents: 0` by default with 0–2 negotiated at registration — and hence D5, which makes the answer not matter: a push whose actions all vanish still works, because its only intent was a navigation and the notification body is already the canonical text.
4. **Three bundles must converge before one profile is meaningful.** `app.html`, `maya-os-site/index.html` and `app-tenant.html` are three builds of one app with three different plugin expectations and three different deep-link registrations. A `ChannelProfile` describes a renderer; today there are three renderers wearing one name. **Convergence is a prerequisite of this contract, not a consequence of it** — and by INV-16 nothing may be deleted to achieve it until capability parity is green.
5. **`MayaRuntime.getPreviewAccess` needs a classification decision from the owner.** It is not in the brief's plugin list, it is referenced twice in `app.html`, and its name touches the client-preview PII boundary — the one boundary enforced in five independent places. This section classifies it as presentation-only (N7) because that is the only classification that keeps a shell build out of the authority path. If it in fact influences PII visibility today, that is a finding for the security track, not a design choice to be made here.
6. **No duplex voice path is evidenced (V11).** What exists is bounded push-to-talk transcription. Anything said about streaming voice authority would be invention.
