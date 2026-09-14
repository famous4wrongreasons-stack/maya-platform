> **Scope.** Architecture only. Runtime changes: 0. Schema changes: 0. Migrations: 0. Production mutations: 0. Chapter 10 not started. Nothing here authorises deleting a tab, route, screen or command; the only mechanism that may authorise a deletion is the capability-parity gate (INV-16), and it authorises nothing until it is green.
>
> **Verification.** Structural claims were re-checked read-only against `сайт и приложение/app.html` (2.6 MB single-file bundle), `сайт и приложение/service-worker.js`, `сайт и приложение/app-tenant.html` and `maya-os-site/index.html`. Claims that are design rather than evidence are marked **Decision**. Questions the evidence does not settle are listed in §11 rather than answered by invention.

---

## 0. Decision summary

| Question | Decision |
|---|---|
| Primary-navigation destinations in the target shell | **5** — one root (Maya) plus four shell destinations |
| Tabs | **0.** The tab bar is deleted as a control type, not re-skinned |
| The four shell destinations | Account · Connections · Privacy & Data · Notifications |
| Is History a destination? | **No.** The timeline *is* the history; search is an identity-bar affordance; erasure is a right living in Privacy & Data |
| How a fullscreen surface is entered | **Only** via a widget's `presentation.fullscreen_detail.route_key`, a `NAVIGATE`/`HANDOFF` intent, or a deep link that resolves a widget first. Never from chrome |
| Fate of the other 107 primary-nav items | Each maps to exactly one of five fates (§10); retirement requires a parity row |
| Success before a receipt | **Never.** Three terminal displays: SUBMITTED · CONFIRMED · NOT CONFIRMED. There is no "failed" state and no `ERROR` kind |
| Offline business actions | **Never queued.** Text is queued; intents are not |

**112 → 5.** Primary navigation shrinks from 112 reachable surfaces to five addressable destinations. 107 entry points leave primary navigation. **Zero capabilities leave the product** — eight of them do not exist anywhere today and must be *built* (§4.2, §10.3).

---

## 1. Definitions that make the count auditable

A number like "112 → 5" is only honest if "primary-nav item" has a test.

**Primary-navigation item** — a destination reachable *in one gesture from persistent chrome*, without passing through the conversation, and *addressable without prior context*. A tab is one. A query-parameter overlay mount is one (`?team=main` needs no antecedent). A bottom-sheet reached by tapping a result is **not** one.

By that test, the PWA bundle contributes **41 enumerable primary-nav entry points** today:

| Surface set | Count | Evidence (`app.html`) |
|---|---|---|
| Client bottom nav | 4 | `TABS` @709194 — Запись · Чат · Кабинет · Профиль |
| Staff bottom nav | 4 | `TABS` @1807046 — Главная · Чат · Финансы · Клиенты (variants: Статистика, Профиль) |
| Business panel tab bar | 9 | `TABS` @2199553 — MAYA · Аналитика · Расписание · Сотрудники · Услуги · Клиенты · Клиентам · Интеграции · Профиль |
| Legacy panel tab bar | 18 | `TABS` @2269872 — `os, analytics, schedule, report, waitlist, reviews, jobs, broadcast, team, redeem, reactivation, birthday, cycle, reviews, loyalty, subscriptions, referral, leads` |
| Self-mounting query-param overlays | 6 | `openMayaCommunityModeration` · `openMayaNativeFeedback` · `openMayaCashDeclaration` · `openMayaExpenseIntake` · `openMayaGovernedSettings` · `openMayaTeamCommunications` |

The balance of the 112 is contributed by the other channels (Telegram command menu, native shell, web-public). They are routed by the same rule; this section does not re-derive their per-surface allocation, which is the parity ledger's output, not this section's.

Separately, the app-level router is an object map `S` with **21 keys** — `login, choose, access-compat, home, services, team, cutmatch, tips, cabinet, shop, invite, settings, crm, book, staff-home, staff-clients, god, panel, team-chat, schedule, chat` — closed by `const cur = S[screen] || S.login`. The key `role` is read in two hydration branches (`screen === 'role'`) but has no entry in `S`: **confirmed dead routing.** Routes are not the same thing as nav items; the router is the *mechanism* this design replaces, the tab bars are the *count* it reduces.

---

## 2. The rule that generates the IA

Three laws produce every decision below. Applied in order, they are decidable by a reviewer without taste.

**L1 — One root.** There is exactly one place the app opens: the Maya screen. Everything else is either (a) a modal the conversation opened, or (b) one of four shell destinations. A surface that wants to be neither is not a surface; it is a capability, and capabilities are reached by asking.

**L2 — The shell holds only what must be settled *before* a conversation can be trusted.** Who am I signed in as; what is connected; what have I consented to and what can I revoke; how do you reach me. Nothing else qualifies. This is not a taste judgement: the contract's `NEVER_CHAT_ACTUATED` list (8 entries) enumerates the acts that may never be a chat-rendered control and may only be reached by `HANDOFF`. **Every one of them needs a live verified destination or the envelope fails its gate.** Grouped by the object they act on, those eight acts produce exactly four destinations. The shell is not a settings drawer that grew; it is *the handoff target set*, and it is closed for the same reason the widget-kind list is closed.

**L3 — Authority is never a place.** There is no role picker, no "switch to owner", no staff mode. `presentation_mode` may reorder, relabel and hide; it may never enable an intent, and no intent's `capability` may vary by it (A1, A5). This single law deletes `choose`, `access-compat` and the dead `role` key, and it removes the reason the three overlapping authority generations (`app_access`, the `window.__me*` legacy globals, the `localStorage.me_is_staff` pre-route) had a UI to disagree about.

---

## 3. The single Maya screen

### 3.1 Anatomy

```
┌───────────────────────────────────────────────┐
│ ◈ Maya      готово · Мужская Эстетика   ⌕  ◍  │  identity bar (fixed, 1 line)
├───────────────────────────────────────────────┤
│                                               │
│   ▸ proactive greeting slot   (0 or 1)        │  head of timeline, never pinned
│                                               │
│   ┌ Maya ────────────────────────┐            │
│   │ text                         │            │  conversation timeline
│   └──────────────────────────────┘            │  (scroll, single column)
│   ┌ widget · CARD · шаг 2 из 4 ──┐            │
│   │ anchored to the message above │            │
│   └──────────────────────────────┘            │
│                              ┌ you ─────┐     │
│                              │ text      │     │
│                              └───────────┘     │
├───────────────────────────────────────────────┤
│ [ + ]  напишите или скажите…           [ ◉ ]  │  composer + voice
└───────────────────────────────────────────────┘
```

Five zones, no sixth. There is no tab bar, no drawer, no FAB, no secondary header.

### 3.2 Identity bar — five elements, fixed order

1. **Maya mark.** The logo. Tap scrolls the timeline to the live edge. It opens no menu; brand is not navigation.
2. **State line.** One string from a closed set: `готово` · `думаю` · `ограничено` · `нет сети` · `просмотр`. Derived from transport plus the newest envelope's lifecycle. **Never derived from role.** `ограничено` and `просмотр` are statements, not warnings — no danger token, no error icon (M1).
3. **Scope noun.** The data scope of the *current answer* — "Мужская Эстетика" or "Личный кабинет" — rendered as a noun, never as a switch. **Decision:** a principal who is both owner and client is not disambiguated by an app mode but by a `CHOICE` widget *in the conversation, per request, only when the request is genuinely ambiguous*, answerable in words. Most requests are not ambiguous ("сколько я заработал" vs "запиши меня на стрижку"). This is what replaces `ChooseVersion`.
4. **Search (⌕).** Filters the one timeline in place. Not a destination (§4.3).
5. **Shell opener (◍).** The account avatar. Opens the shell sheet with four items. This is chrome, not a destination, and it is the *only* chrome affordance that can navigate.

Inputs that are **not** accepted by any part of the shell, at any time: `window.__meRole`, `__meIsStaff`, `__meIsMaster`, `__meIsFounder`, `__panelInfo.permissions`, `localStorage.me_is_staff`, the current screen name, or which widget is on screen (A3).

### 3.3 Conversation timeline

The timeline is a **presentation surface, never business state** — never the strategy owner, policy owner, consent owner or booking owner. Deleting it must leave canonical records correct; that property is what makes `GAP-HISTORY-ERASE` buildable at all.

- One column, one thread, chronological, no branching. Messages carry `message_id`; widgets anchor to a `message_id` and move with it.
- Older interactive envelopes do not linger as dead buttons. On `expires_at`, an envelope follows its declared `on_expiry`: `re_resolve` (tap re-asks and a *new* envelope replaces it) or `collapse_to_summary` (the message keeps `resolved_summary_text` as plain text). **Decision: collapse, never disable-in-place.** A greyed button that used to work is a lie about what the product can do; a sentence describing what happened is true forever.
- **Decision: at most the three most recent envelopes stay interactive.** Older ones collapse even before expiry. Rationale: intent tokens are single-use, principal-bound and expiring; a scrollback full of live tokens is an attack surface and a support problem, and re-resolution is one tap.
- Unknown `kind` renders `text_equivalent.body` (R4). It never falls back to a different screen. This is the explicit counter-pattern to `S[screen] || S.login`, which today silently lands an unknown screen key on the login page.

### 3.4 Contextual widget layer

Widgets live **in the tree** (`theme_scope: 'in_tree'`): inside the chat DOM, inside the back-stack, inside the theme. `'overlay'` is not a member of the type. The six self-mounting hosts at `zIndex 2147483000` are therefore **not expressible as widgets** and must be re-expressed as fullscreen route keys (§5.4).

| `density` | Placement | Back-stack | Dismiss |
|---|---|---|---|
| `INLINE` | Inside the message bubble | no entry | n/a |
| `CARD` | Below the bubble, column width | no entry | collapses on expiry |
| `SHEET` | Bottom sheet over the timeline, still in tree | one entry | escape intent, back gesture, or scrim |

At most one `SHEET` at a time. Step chains (`parent_widget_id`, `step_index`/`step_total`) render as **one card that replaces itself** — SERVICE → STAFF → SLOT → CONFIRMATION is one card showing "шаг 3 из 4", never four stacked cards. The step count appears in the rich renderer, the text equivalent and the spoken form identically, because all three are minted by the same server function.

### 3.5 Composer

- **Always present and always typable.** A widget never blocks the input. `input_lock: 'soft'` suppresses routing; `input_lock: 'hard'` means only the escape verb and the widget's own utterances resolve, and anything else gets one line: *"жду ответа на шаг 2 из 4 — скажите «отмена», чтобы выйти."* A disabled text field is never correct; it makes the fallback path unreachable exactly when the user is stuck.
- Every envelope with a non-`none` input lock carries exactly one `role:'escape'` intent at `priority: 0` — never dropped by degradation, always matched by the universal cancel verbs, and in Telegram additionally reachable as `/cancel`. This is the proven pattern inherited from the bot, not a new one.
- Attachments (photo for CutMatch, file) are gated by **capability, not role** — a `+` with nothing behind it is not shown.

### 3.6 Voice

- **Decision: tap-to-toggle, not press-and-hold.** Press-and-hold fails motor accessibility and caps utterance length; the recording state is shown, and the transcript appears *before* send.
- **The transcript is the message. Audio is not the message.** The transcript is editable before sending. Audio → transcription → typed intent → the same canonical validation: voice is not a separate authority path.
- Matching is deterministic first: `speech_aliases` ∪ `ordinal` are resolved server-side by regex/corpus **before any LLM**, to the same `capability` and the same `intent_token` a tap would produce. A screen-reader user who types the sentence, a voice user who says it, and a thumb that taps produce one audit line.
- Any `COMMIT` intent reached by voice requires `requires_readback`; the server's `readback_template` is read back, and the confirmation is a separate act.
- **Voice is refused inside contact collection and on any `SECURE_SURFACE_ONLY` field.** Only transcript length is logged, never content. This is the existing Telegram PII boundary, inherited verbatim, and it is part of the 152-FZ contour that must not be broken.

---

## 4. The minimal shell — four destinations

### 4.1 Why four, and why these

The shell is derived, not chosen. `NEVER_CHAT_ACTUATED` lists eight acts whose only legal intent is `HANDOFF` and which additionally demand `SESSION_VERIFIED` or `STEP_UP_VERIFIED`. Group them by the object acted upon:

| `NEVER_CHAT_ACTUATED` act | Object | Destination |
|---|---|---|
| `consent.pd.grant` / `consent.pd.withdraw` | legal consent | Privacy & Data |
| `consent.marketing.grant` / `consent.marketing.revoke` | legal consent | Privacy & Data |
| `consent.register.export` | legal consent | Privacy & Data |
| `conversation.history.erase` | own data | Privacy & Data |
| `identity.staff.telegram.unbind` | channel binding | Connections |
| `identity.client.channel.unbind` | channel binding | Connections |

That yields two destinations. Two more are forced by facts the conversation cannot establish about itself: **Account** (which principal is signed in; sessions and devices; sign-out — the thing you need when you doubt *who* the app thinks you are) and **Notifications** (which of the 12 proactive moments may reach you, on which channel, in which hours).

**Why Notifications is not merely a chat `SETTINGS_DRAFT`.** It could be one — and it also is one, in chat, with an `editor_handoff_intent`. But a notification preference is where a user goes when they are *annoyed at the product*. Requiring an angry user to converse with the thing annoying them is hostile, and that hostility is exactly the shape of the live defect: two surfaces promise revocation via `/unsubscribe`, which hands off to an app surface that does not exist (`GAP-CONSENT-MKT-CHANGE`, active 152-FZ exposure). A destination that exists is the fix. Marketing-consent **revocation** is reachable from here but **owned** by Privacy & Data — one canonical owner, two doors.

### 4.2 Contents

| Destination | Route key | Holds | Verification floor |
|---|---|---|---|
| **Account** | `shell.account` | Identity as known to the server; name/language/timezone; active sessions and devices; sign-out; sign-out-everywhere | `SESSION_VERIFIED` |
| **Connections** | `shell.connections` | Channel bindings (Telegram, push subscription, email, native shell) with state and `as_of`; CRM/provider link state; **bind and unbind**; reconnect | `SESSION_VERIFIED`; unbind `STEP_UP_VERIFIED` |
| **Privacy & Data** | `shell.privacy` | 152-FZ base consent: current state, **grant and withdraw**; marketing consent: state, **revoke and restore**; consent register export; conversation-history erasure; what is shared with the AI and what never is | `SESSION_VERIFIED`; withdrawal and export `STEP_UP_VERIFIED` |
| **Notifications** | `shell.notifications` | Per-moment delivery preference across the 12 canonical proactive moments; per-channel routing; quiet hours; push permission state and repair | `SESSION_VERIFIED` |

**Five of the eight capability gaps land here** — `GAP-CONSENT-MKT-CHANGE`, `GAP-CONSENT-PD-WITHDRAW`, `GAP-CONSENT-REGISTER-EXPORT`, `GAP-HISTORY-ERASE` in Privacy & Data; `GAP-IDENTITY-TG-UNBIND` in Connections. These are **builds, not re-presentations**: they have no route in any channel today. Until each has a canonical owner, the corresponding envelope must carry a `Limitation` with a `capability_gap_ref` and **must not carry an intent that promises it** (P2). A shell that renders a "Withdraw consent" button before the owner exists reproduces the `/unsubscribe` defect in a new place.

The remaining three gaps do **not** belong in the shell: `GAP-COMMERCE-GIFT` and `GAP-LOYALTY-REDEEM` are commerce capabilities that belong in the booking/commerce conversation (loyalty redemption specifically at booking time, where the unredeemable liability is accruing); `GAP-ATTRIBUTION-FIRST-TOUCH` is a two-level hierarchical table over 10 categories — a fullscreen `REPORT` detail with a top-3 summary card in chat.

### 4.3 Why History and Search are not the fifth destination

**Decision: no History destination.**

1. The timeline *is* the history. A second browsable history creates two renderings of one thing and invites someone to treat the browsable one as a record — precisely the property the constraints forbid.
2. Search is a *filter over the one timeline*, so it belongs in the identity bar next to what it filters, not in a drawer.
3. Erasure is not a browsing feature; it is a right, it is `NEVER_CHAT_ACTUATED`, and it belongs with the other rights in Privacy & Data.

**Named escalation condition.** If timeline volume makes in-place search insufficient, the correct escalation is a *fullscreen detail* `detail.history.search` with reason `exceeds_chat_density` — entered from the search affordance's own result widget, exited back to the timeline. It is **still not a destination**. The evidence does not establish today's per-user conversation volume, so the escalation is specified but not scheduled (§11).

---

## 5. Fullscreen secondary surfaces — entered and exited without becoming a tab

### 5.1 Entry — three doors, all of which pass through a widget

1. `presentation.fullscreen_detail.route_key` on an emitted envelope, tapped.
2. A `NAVIGATE` or `HANDOFF` intent (no business effect; `capability` must be `null`).
3. A deep link — which resolves an envelope *first* and opens the detail only if that envelope says so (§6).

There is no fourth door. **A fullscreen surface has no independent existence**; it is the expanded form of something already in the conversation.

A detail may exist only for one of the five declared reasons: `exceeds_chat_density` · `exact_configuration` · `audit` · `accessibility` · `correction`. A surface that cannot name one is not a detail; it is a capability that has not been designed yet. This is also how CHAT-FIRST ≠ CHAT-ONLY is honoured concretely: `exact_configuration`, `audit`, `accessibility` and `correction` *are* the mandated fallback editor, and `SETTINGS_DRAFT` is required to carry an `editor_handoff_intent` for exactly this reason.

### 5.2 Exit

- One back edge: system back / swipe / a single close control. All three do the same thing.
- Exit returns to **the anchoring message**, scroll position restored — not to the live edge, not to a home screen.
- If the detail changed anything, a receipt line is posted into the timeline at the live edge (`resolved_summary_text`), so the conversation remains a complete account of what happened. If it changed nothing, nothing is posted.
- The detail is a back-stack entry. It is never the app's resume target: a cold start after a detail resumes at the **root**, not at the detail.

### 5.3 The four rules that stop a detail becoming a tab

1. **No chrome entry.** No fullscreen route is reachable from the identity bar, the shell sheet, or any persistent control.
2. **No detail-to-detail.** A detail may open a `SHEET`; it may not open another fullscreen detail. Depth is capped at one.
3. **No bookmarkable screen address.** A URL that opens a detail without first resolving an envelope does not exist (§6). A retained address resolves the *envelope*, and the envelope decides.
4. **No resume.** A detail is never restored on launch.

If a surface needs to violate any of these, it is not a detail — it is a shell destination, and adding one is a contract-level change reviewed like a schema change. That is the mechanism that keeps "5" from drifting to "9" in six months.

### 5.4 The six overlays, re-expressed

Each of the six self-mounting hosts creates its own DOM node at `zIndex 2147483000`, renders on a query-parameter match, and sits outside the app tree, outside the back-stack and outside the theme. Their only authorisation is the bearer check inside each component's first fetch — the URL decides what renders, and the fetch decides whether it had the right to. **The URL must stop being an authorisation channel.**

| Today | Target route key | Reason | Notes |
|---|---|---|---|
| `?governed_settings=business_rules` | `detail.settings.business_rules` | `exact_configuration` | |
| `?governed_settings=client_capabilities` | `detail.settings.client_capabilities` | `exact_configuration` | |
| `?governed_settings=staff_ai_provider` | `detail.settings.staff_ai_provider` | `exact_configuration` | |
| `?governed_settings=staff_notifications` | `detail.settings.staff_notifications` | `exact_configuration` | |
| `?expenses=reminder\|intake` | `detail.expenses.intake` | `correction` | reached from the `weekly_expense_reminder` moment |
| `?cash_declaration=1` | `detail.cash.declaration` | `audit` | |
| `?community_moderation` | `detail.community.moderation` | `exceeds_chat_density` | |
| `?native_feedback` | `detail.feedback.native` | `exceeds_chat_density` | reached from `native_feedback_invitation` |
| `?team=main` | `detail.team.thread` | `exceeds_chat_density` | see below |

**Decision: one parameter value ⇒ one route key.** The four `governed_settings` values become four routes, not one parameterised route, because a parameterised route re-creates the pattern being removed: a route key must name what the user sees.

**Decision: team communications is a fullscreen detail, not a second timeline and not a destination.** It is a human-to-human conversation, so it is not a widget; making it a tab would break the one-root law; making it a scoped Maya timeline would put two conversation surfaces in competition at the root. It is entered as a capability (by asking, by tapping a notification, or by a `c/` deep link) and it inherits the existing seam — staff-facing Telegram messages already replay into the durable app chat with a dedupe key. **Named escalation:** if team messaging reaches daily-driver volume it becomes the only legitimate candidate for a fifth shell destination; today's evidence does not establish that volume.

---

## 6. Deep links in a shell with no tabs

A shell without tabs still needs addressability — push notifications, SMS, email, the Telegram mirror, and three registered native schemes (`mayaos://`, `ru.mayaos.app://`, `pro.malesthetic.app://`, all arriving through one `App.addListener('appUrlOpen')`) all deliver links today. The rule that makes this safe is one sentence:

> **A deep link never names a screen. It names something the server can re-derive, and the server decides what renders.**

Four link classes, and no fifth:

| Class | Form | Resolves to | Authority |
|---|---|---|---|
| **Envelope** | `…/w/<widget_id>` | Re-resolve that emission; honours `on_expiry` (`re_resolve` or `collapse_to_summary`) | Envelope is principal-bound; a relink/unlink cycle changes `principal_proof_hash` and retroactively invalidates it on every device |
| **Intent carrier** | `…/i/<intent_token>` | The SMS/email/push `HANDOFF` path. Lands **in the timeline**, renders the confirmation body, **never auto-executes** | `required_verification` floor enforced on arrival; the tap happens in the verified channel |
| **Capability request** | `…/c/<capability_key>?scope=…` | Exactly equivalent to typing the utterance; goes through the registry/orchestrator and emits an envelope | Normal capability authority; unknown key ⇒ a sentence, not a screen |
| **Shell** | `…/s/<shell_route>` | The only screen-addressed links; limited to the four destinations | `SESSION_VERIFIED`; otherwise sign-in, then **resume to the requested destination** |

Consequences worth stating explicitly:

- **Nothing renders before an authority decision.** The counter-pattern is `?community_moderation` mounting a moderation console and only then asking whether the caller was allowed.
- **An intent carrier never fires on open.** A push action, an SMS link and an email button all land on the confirmation, never on the effect. Combined with §6.4 of the widget contract — a booking `COMMIT` token cannot be minted except onto a `BOOKING_CONFIRMATION` body produced by a canonical `DRAFT` — a link *cannot* book.
- **An unresolvable link produces a sentence in the timeline**, e.g. *"этой ссылки у меня нет — вот что я могу"*, with registry-derived alternatives. It never produces a login screen. `S[screen] || S.login` is deleted, not relocated.
- **The three native schemes map onto the same four classes.** One resolver, three schemes; the `appUrlOpen` contract is used as it exists, since the native shell has no source in this repository and this cycle adds no plugin surface.
- **Stale links are normal, not exceptional.** An expired envelope link re-resolves into a fresh envelope; an expired intent token renders the current state plus one `remedy` intent. Neither is an error.

---

## 7. First run and the empty state

**The first paint is the timeline. Never a login screen. Never a role picker.**

Today `app.html` routes on a cached `localStorage.me_is_staff === '1' → go('choose')` *before any server call*, then POSTs `?action=panel_me` — a third authority path racing the other two. The target rule replaces it:

> **A cache may restore content. It may never restore authority, and it may never choose a route.**

The last few messages may repaint immediately from cache, marked stale with their `as_of`; the authority snapshot always arrives from the server, and nothing interactive is enabled until it does. `choose`, `access-compat` and the dead `role` key have no successor.

The empty state is not empty. It contains, in order: the Maya mark; one sentence of state; and **three entry utterances generated from the capability registry** — never a hand-written list (I4, the reason help cannot drift in the Telegram channel today). Those three are what the user can actually do at their current verification level.

| Verification level | What the first screen shows | What it must not do |
|---|---|---|
| `ANONYMOUS` (web-public, guest chat) | Public read capabilities only — services, prices, hours. Sign-in offered as a `HANDOFF` intent inside the conversation | No PII. No proactive slot. No wall |
| `CHANNEL_IDENTITY` (Telegram, push) | Identified, **not verified**. Channel-scoped reads; anything `client_identified` is a `HANDOFF` to binding | Never infer a stronger mode from phone, CRM token or screen name |
| `BOUND_CLIENT` | Cabinet capabilities available, with all five client-preview fences intact | Never collapse the five fences into one check |
| `SESSION_VERIFIED` | Full capability set; the four shell destinations become actionable | — |

Three first-run prohibitions, each with a reason:

1. **No permission prompt before first value.** Push permission is requested only when a proactive moment first becomes relevant *and the user has chosen to receive it* — never on first paint.
2. **No tour.** A product whose primary interface is a conversation can explain itself by conversing; a tour is an admission that it cannot.
3. **No wizard.** Today's onboarding wizard becomes a conversation carrying `SETTINGS_DRAFT` widgets, each with its `editor_handoff_intent` for anyone who wants the form. Configuration is resumable because the draft is server-owned; abandoning the conversation loses nothing.

---

## 8. The proactive greeting slot

**Exactly one slot, at the head of the timeline, at most one envelope, per open.** Not pinned, not a banner, not a card stack. It scrolls away like any message, because it *is* a message.

Every greeting is `trigger: 'proactive'` with `moment` from the closed set of 12 canonical outbound moments, `dedupe_key`, `once_per`, `notify_pref_key`, `quiet_hours_applied`, and `authority_basis: 'pre_authorized_presentation'` — which has exactly one legal value.

### The C10 boundary, stated as a rule

> **The greeting may say what is already true. It may not decide what should be done.**

| The slot MAY | The slot MAY NOT |
|---|---|
| Present already-authorized information (today's schedule, an existing alert, a closed period's report) | Mint a strategy, a plan, or a recommendation that did not already exist |
| Carry `NONE` / `NAVIGATE` / `REFINE` intents | Carry `DRAFT` or `COMMIT` intents |
| Surface an approval object that **already exists**, created by an already-authorized path | Create an approval object, or move one to `PENDING` on its own |
| Say that something is unknown, with its reason code | Start a C9 run, allocate reasoning budget, or address an audience |

**Enforced, not merely instructed.** The greeting composer is denied the `DRAFT`, `REQUEST_APPROVAL` and `COMMIT` effect classes at emission time; `moment` must be one of the 12; `dedupe_key` + `once_per` deduplicate one signal across push ↔ chat ↔ Telegram mirror so a reminder is not delivered three times; quiet hours apply before emission, not at render.

**If nothing qualifies, the slot renders nothing.** Not a placeholder, not "no news", not a greeting card with the user's name in it. An empty slot is the correct output of a system with nothing already-true worth saying, and filling it is the first step toward autonomy nobody approved.

---

## 9. Network, offline, staleness — and the receipt rule

**Evidence first, because it changes what can be promised.** `app.html` contains zero occurrences of `navigator.onLine`, no `online`/`offline` listeners, no skeleton machinery and no optimistic-UI machinery. `service-worker.js` (67 lines) registers `install`, `activate`, `push` and `notificationclick` — **there is no `fetch` handler**. Consequences:

- The app **cannot boot offline today** in the browser/PWA. The offline behaviour below is a target, and delivering it requires a caching `fetch` handler — a runtime change, explicitly out of scope this cycle.
- That change is not free: the SW is push-only *by design* so a new `app.html` propagates without a version bump. Adding caching reintroduces stale-bundle risk. The trade is real and is recorded as a risk, not resolved here.
- The native shell may already hold the bundle in its WebView; this repository contains no native source, so the offline boot behaviour of the iOS Capacitor shell and the Android TWA **cannot be asserted from this evidence**.

### 9.1 Five network states, one grammar

| State | Rule |
|---|---|
| **Loading / skeleton** | Skeleton only where the *shape* is known from `kind` (a `SCHEDULE` has lanes, a `METRIC` has tiles). Never skeleton content whose existence is unknown — that is a promise. Below ~200 ms show nothing rather than a flash; past the timeout the datum becomes a `PENDING` Cell with a reason code, **not** an error |
| **Stale** | Every `CARD`/`SHEET` always shows `as_of`. When stale for its `freshness_class`, the envelope dims one step, and **its `COMMIT` intents are withdrawn and replaced by one `remedy` intent ("обновить")** — withdrawn, not greyed, because a stale commit token is a live hazard and a greyed control is a lie |
| **Offline** | Reading works: the timeline and delivered envelopes render with a stale marker. Composing works. Every `DRAFT` / `REQUEST_APPROVAL` / `COMMIT` is refused with a sentence, not a spinner |
| **Retry** | Automatic retry is permitted **only** for idempotent re-resolution of a read. Never automatic for anything with an effect; never automatic on a non-`KNOWN` Cell (M1 forbids binding one to retry at all). User-initiated retry is a `role:'remedy'` intent. Double-commit is prevented by the **server-minted** `idempotency_key` |
| **Unavailable capability** | Three cases that must never look alike: **not entitled** (policy — say so, offer the handoff); **not connected** (`SOURCE_UNLINKED` ⇒ a `SOURCE_STATUS` widget with a reconnect path, which is `HANDOFF` below `SESSION_VERIFIED`); **not built** (`capability_gap_ref` ⇒ a `LIMITATION` with **no button at all**, per P2) |

`freshness_class` behaviour when stale: `live` → re-resolve, and refuse commit until fresh; `scenario` → keep, showing `as_of`; `proactive_once` → collapse to summary; `static` → keep silently.

### 9.2 Offline business actions are never queued

**Decision: MAYA queues text. It does not queue intents.**

Three reasons, each independently sufficient: intent tokens are **single-use and expiring** (a queued token drains on reconnect after expiry and must then fail, having already looked accepted); tokens are bound to `principal_proof_hash`, which a relink/unlink cycle invalidates retroactively; and handles are nouns, so the canonical owner performs a **fresh read** at execution — a booking queued against a slot seen an hour ago is a wrong booking waiting for a network. An offline queue of effects would also make widget state business state, which is the one thing the contract forbids outright. The user's typed message is queued, because it is only text, and it is marked as unsent.

### 9.3 The receipt rule

> **No success may be shown before a canonical receipt.**

An action has exactly three terminal displays, and there is no fourth:

| Display | Condition | Copy discipline |
|---|---|---|
| **SUBMITTED** | Token consumed, no receipt yet | "отправлено" — describes the message, never the effect |
| **CONFIRMED** | Receipt from the canonical owner, with its id | "записано" / "начислено" — only here |
| **NOT CONFIRMED** | No receipt, outcome unknown | States what *is* known, its `as_of`, and one remedy intent |

Notes that make this hold under pressure:

- **A timeout is not a failure.** A `COMMIT` that times out renders NOT CONFIRMED and resolves later from the receipt — never from the *absence* of one. Absence of evidence is `UNKNOWN`, and `UNKNOWN` is never rendered as failure.
- **NOT CONFIRMED has no error styling.** There is no `ERROR` kind and no `error` severity anywhere in the contract; the display is a `PENDING`/`UNAVAILABLE` Cell with a reason code, a neutral-dim treatment and a remedy affordance.
- **Divergence is `SUPERSEDED`, with a rendered diff** — never a silent clamp and never a wrong booking. A price or slot shown 90 seconds ago is never the price or slot used.
- **The pending window is a `PROGRESS` widget**, with `poll_after_ms`, `blocked_unknown` steps that block only their dependents, an honest `budget_note` (it states that paid reasoning is disabled rather than hiding it), and a `cancel_intent`.

### 9.4 Optimistic UI — the exact boundary

| Optimism **permitted** | Optimism **forbidden** |
|---|---|
| The user's own message bubble appearing in a "sending" state | Any `Measure` value |
| Ephemeral widget UI: selection highlight, accordion, scroll offset | Any Cell reaching `KNOWN` without `as_of` + `evidence_refs` |
| Composer draft text | Any confirmation wording without a receipt id |
| Voice transcript before send | Any list row added or removed locally after a `DRAFT`/`COMMIT` |
| | Any counter or badge increment |
| | Any intent enabled or disabled by a local guess |

The permitted column is exactly `ephemeral_ui` plus the user's own authored text. Both are wiped on remount, never transmitted, never persisted, never read back — which is the same sentence as "widgets are never a system of record", expressed as a rendering rule.

---

## 10. 112 → 5: the disposition of the displaced

### 10.1 The five fates

Every displaced entry point maps to **exactly one**:

| Fate | Meaning | Test |
|---|---|---|
| **F1 — Capability** | Reachable by asking; may emit widgets | Registered in the capability registry |
| **F2 — Widget kind** | The surface's whole job is a bounded read or choice | Expressible within the 17 closed kinds |
| **F3 — Fullscreen detail** | Needs space, exactness, audit, accessibility or correction | Names one of the five reasons and is emitted by a widget |
| **F4 — Shell destination** | One of the four | Appears in §4.2 |
| **F5 — Retire from primary navigation** | Entry point removed | **Requires a parity row** proving the capability exists elsewhere, or a `capability_gap_ref` recording that it does not |

### 10.2 Worked allocation of the enumerable PWA set

| Today | Fate | Target |
|---|---|---|
| Client · Запись | F1 + F2 | booking capability; `SERVICE_SELECTOR` → `STAFF_SELECTOR` → `TIME_SLOT_SELECTOR` → `BOOKING_CONFIRMATION` |
| Client · Чат | — | **becomes the root** |
| Client · Кабинет | F1 + F2 + F3 | visits / points / certificates as capabilities; `detail.cabinet.history`. All five preview fences preserved |
| Client · Профиль | F4 | `shell.account` |
| Staff · Главная | F1 | `morning_brief` occupies the greeting slot; the rest are capabilities |
| Staff · Чат | — | **becomes the root** |
| Staff · Финансы | F1 + F3 | `detail.finance.period` (`audit`) |
| Staff · Клиенты | F2 + F3 | `CLIENT_LIST` → `detail.clients.segment` |
| Panel · MAYA | — | **becomes the root** |
| Panel · Аналитика | F2 + F3 | `METRIC`/`CHART` on canonical C7/C8 data → `detail.analytics.period` |
| Panel · Расписание | F2 + F3 | `SCHEDULE` → `detail.schedule.day` |
| Panel · Сотрудники / Услуги | F1 + F3 | `detail.staff.roster`, `detail.catalog.services` (`exact_configuration`) |
| Panel · Клиенты / Клиентам | F2 + F1 | `CLIENT_LIST`; audience acts carry `audience_size` before the irreversible tap |
| Panel · Интеграции | F4 | `shell.connections` |
| Panel · Профиль | F4 | `shell.account` |
| Legacy panel · 18 keys | F1 / F2 | each becomes a capability or a widget kind; `os` / `god` **F5**, retained as a platform capability behind `SESSION_VERIFIED` + `PLATFORM` |
| 6 query-param overlays | F3 | the nine route keys in §5.4 |
| Router keys `choose`, `access-compat` | F5 | deleted by L3 (roles are not modes) — parity row required |
| Router key `role` | F5 | **already dead**; no parity obligation, but the two `screen === 'role'` hydration branches must be cleaned with it |
| Router key `login` | — | becomes a `HANDOFF` target, never a routing fallback |

### 10.3 Three standing rules on removal

1. **Removing a tab never removes a capability.** Calendar, Clients, Reports, Analytics, Booking, Strategies, Approvals and Settings all persist as capabilities.
2. **Nothing is deleted before parity is proven.** Every F5 needs a green parity row. This applies with particular force to the ~45 registered Telegram owner/staff commands: they are **authority-dead** (the `_principal` ContextVar is written only in the aiohttp HTTP middleware, and the bot runs `start_polling`), and six capabilities are *separately* fenced at the body level by the P4/P5 cutover — restoring authority would not restore them. Retire those **entry points** freely; **never assume the capability is re-presented elsewhere without checking the HTTP surface case by case.**
3. **Eight capabilities have no route in any channel.** They are builds. Until each has a canonical owner, the product must say so and offer no button (P2) — the opposite of what `/unsubscribe` does today.

---

## 11. What the evidence does not support

Stated plainly, because a design that hides its gaps is the same defect as a UI that hides an unknown.

1. **The seventh overlay.** `app.html` contains seven hosts at `zIndex 2147483000`; six are named self-mounting query-parameter overlays, and the seventh is `MayaSplash`, a fixed in-tree splash layer. If the inventory's seventh self-mounting overlay lives in another bundle (`app-tenant.html`, or the older `maya-os-site/index.html` build — neither of which defines any `openMaya*` function), I did not locate it. The design is unchanged either way: the rule is `theme_scope: 'in_tree'`, and the splash is subject to it too.
2. **Offline boot.** Cannot be asserted for the native shells — there is no native source in this repository. For the PWA it is currently impossible (no `fetch` handler), and making it possible trades against the stale-bundle safety the push-only SW was chosen for. Unresolved, deliberately.
3. **Desktop / wide viewport.** No evidence about viewport distribution. The design specifies one column at every width; a two-pane variant (timeline + pinned detail) is *plausible* and *unevidenced*, and it is the most likely vector for tabs to return, because a persistent right pane is a tab with better manners.
4. **Conversation volume.** The escalation to `detail.history.search` is specified but cannot be scheduled without per-user timeline volume, which the inventory does not carry.
5. **History retention and erasure semantics.** `GAP-HISTORY-ERASE` has no canonical owner, so the shell can describe the right but cannot yet offer it. What "erasure" means precisely — presentation rows only, versus transcripts mirrored from Telegram — is a canonical-ownership question this section cannot settle.
6. **Telegram as a shell participant.** Treated here as presentation + handoff only, because its owner/staff authority path is dead. Repairing it is a runtime change and out of scope; if it is repaired, the Telegram surface inherits this IA unchanged, since `text_equivalent` is the canonical rendering and the 64-byte `callback_data` ceiling is already the reason intent tokens are opaque handles.
7. **The 112 → 5 arithmetic is exact on the count and rule-based on the allocation.** I enumerated 41 primary-nav entry points by name in the PWA bundle. The per-surface allocation of the remaining primary-nav items across the other channels follows the §10.1 rule, but the row-by-row ledger is the parity gate's output, not this section's, and I have not invented it here.