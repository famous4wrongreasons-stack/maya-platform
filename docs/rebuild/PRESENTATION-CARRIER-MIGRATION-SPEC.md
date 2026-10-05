# PRESENTATION CARRIER — MIGRATION ARCHITECTURE SPECIFICATION

> **Status: DESIGN ONLY. This document authorizes no code.** It describes how the owner's existing
> React Maya chat becomes the presentation carrier for the Chat-First runtime, and what must be
> true before a single line is written. Adoption is not authorization.
>
> **Owner ruling this serves (2026-09-29):**
> `EXISTING REACT MAYA = PRESENTATION CARRIER` ·
> `CHAT-FIRST RUNTIME / CONTRACTS = AUTH / TRANSPORT / AUTHORITY / WIDGET / RECEIPT OWNER` ·
> `CANONICAL BACKEND = BUSINESS STATE / EFFECT OWNER`
>
> **Scope correction (same day), which this document applies throughout:** Maya stays
> **CHAT-FIRST / CHAT-ONLY**. The migration surface is `AChat` plus its direct visual
> dependencies — **not** all 124 React components. `MEApp`, `HomeAurora`, `AClientHome`, the
> 21-screen router, the old global navigation, CRM screens and standalone product screens are
> **not migration targets**. `ABook*` are visual reference only; their lifecycle does not return.
>
> **Every figure below is measured, not estimated.** Each carries the command or the file:line that
> produced it. Where a number could not be measured it says so.

---

## 0. What this document is, and the four things it may not do

It may not add a business decision, a security semantic, a widget kind, or an authority path. Where
it names something the canonical contract does not declare — there is exactly one such place, the
`ReceiptPort` in §2 — it says so in the row and names what must declare it first.

It is written from **surfaces that can be accepted on their own**. A step earns a number only if it
can be exercised and proved when it closes, against evidence that exists at that moment.

---

## 1. Final package / module topology

The Chat-First runtime is **already a headless library in everything but packaging**. This is not a
projection; it is current behaviour: `node --test` runs `src/shell/**`, `src/net/**`,
`src/renderer/**`, `src/integrity/**` and `src/routes/**` today with no DOM of any kind
(`test/shell.test.mjs:17`, `test/intents.test.mjs:20`, `test/renderer.conformance.test.mjs:24`).

The build already proves the isolation. `build.mjs:119-128`:

```js
const GLOBAL_ALLOW = {
  routes: [], renderer: [], integrity: [], contract: [],
  net:   ['fetch','AbortController','AbortSignal','Headers','setTimeout','clearTimeout'],
  voice: ['navigator','MediaRecorder','AudioContext','OfflineAudioContext','Blob',…],
  shell: ['crypto','setTimeout','clearTimeout'],
  dom:   [],            // ← the DOM layer holds NO host global
  entry: ['document'],  // ← referenced exactly once in the whole tree
};
```

`dom/` having an empty allowlist is the load-bearing fact: **it is already an adapter, not an
owner.** Every element it touches arrives through an injected `DomFactory`/`DomPort`. Replacing it
is a swap, not a rewrite of the system.

### 1.1 The split, measured

| Package | Contents | Lines | DOM contact |
|---|---|---|---|
| **`@maya/runtime`** (headless) | `contract.ts`, `integrity/h7.ts`, `net/*`, `renderer/*`, `routes/registry.ts`, `shell/{conversation,intents,shell,view,voice-state,deeplink}.ts`, `voice/wav.ts` | **6 414** | none |
| **`@maya/ports`** | `shell/ports.ts` lines **110-394** — `Scheduler`, `HistoryPort`, `ViewportPort`, `EnvironmentProbe`, `Transport`, `SessionPort`, `SubmissionPort`, `ConversationPort`, `WidgetPort`, `CapturePort`, `VoiceControlPort` | ~284 | none |
| **`@maya/carrier-react`** (new) | the owner's presentation, ported | ~1 400 | yes, by design |
| *deleted* | `src/dom/*` (7 modules), `entry/main.ts` DOM half, `entry/styles.css`, `ports.ts:57-108` (`DomTag`, `DomInputType`, `DomFactory`, `DomPort`) | 2 643 TS + 1 072 CSS | — |

**~71% of the shell survives untouched.**

`ports.ts` splits at a mechanical line. Lines **57-108** are the only DOM-typed declarations outside
`src/dom/**` and `entry/main.ts` — they name `HTMLElementTagNameMap`, `HTMLInputElement`, `Text`,
`HTMLElement`. Lines **110-394** name no DOM type at all. Nothing in the headless core imports the
DOM-typed half; only the seven `dom/` modules and `entry/main.ts` do. **The split requires no change
to any runtime module.**

### 1.2 Where the projection becomes DOM-bound

`render(input: RenderInput): RenderResult` (`src/renderer/render.ts:641`) returns a plain data tree.
The first DOM-bound line in the entire widget path is `drawResult(factory, result, options, into)`
(`src/dom/host.ts:368`). Everything above that line is data the React carrier consumes directly.

**This is why the token-free renderer is not lost.** The guarantee is enforced upstream, in
`shell/view.ts`, which builds an allowlist copy member by member; its header names what never
crosses: `widget_id`, `tenant_id`, `integrity`, `correlation`, `source`, `origin`, `authority`,
`intent_token`, `speech_aliases`, `ordinal`, `confirmation`, `verification_floor`, `capability`.

### 1.3 Dependency direction

```
@maya/carrier-react  ──imports types──▶  @maya/ports
        │                                     ▲
        └──────── receives instances ─────────┤
                                              │
@maya/runtime ───── implements ───────────────┘
        │
        └── net/ ──▶ canonical backend (the only egress)
```

The carrier may import `@maya/ports` **for types only** and receives every instance by injection.
It may not import `@maya/runtime` internals — the existing layered import allowlist becomes an
`eslint-plugin-boundaries` config plus a post-emit graph check (§8).

### 1.4 One ratchet already exists and must be widened

`tsconfig.pure.json` type-checks `routes/`, `renderer/` and `integrity/` with `"lib": ["ES2022"]`
and **no DOM lib** — a DOM type in those layers already fails the build (`build.mjs:1184`). It does
**not** cover `shell/`, `net/` or `voice/`, which are checked with `lib: ["ES2022","DOM"]`. Nothing
today would stop a DOM type re-entering the runtime core. **Widening that config to the whole
headless package is step 1 of the migration and costs one line.**

---

## 2. Exact typed ports

The owner named seven port classes. **Five exist today in full under different names, one is split
across four pieces, and one does not exist at all.** Nothing below is invented: the names on the
right are transcribed from `src/shell/ports.ts` (394 lines, 14 interfaces), which is a types-only
module and already frozen.

| Owner's name | Status | Canonical interface(s) | Note |
|---|---|---|---|
| `AuthPort` | **RENAMED** | `SessionPort` | Exists in full — 11 methods: `view`, `subscribe`, `findBusinesses`, `startTelegram`, `landing`, `onLanding`, `completeTelegram`, `startEmail`, `verifyEmail`, `signInPassword`, `signOut` |
| `ChatPort` | **RENAMED** | `ConversationPort` + `Transport.chat` | `ConversationPort` is the presentation-facing half: `view()/subscribe(ConversationView)`, `submitUserTurn`, retry |
| `WidgetTimelinePort` | **RENAMED** | `ConversationView.items` + `WidgetPort` | No single interface; the timeline is read through `ConversationPort` |
| `WidgetIntentPort` | **RENAMED** | `WidgetPort.activate` + `SubmissionPort.submit` | Two halves by design: activation is local, submission is the wire |
| `ReceiptPort` | 🔴 **MISSING** | — | Does not exist under any name. `ports.ts:219-220` says so outright |
| `VoicePort` | **RENAMED** | `VoiceControlPort` (over `CapturePort`) | `view()/subscribe(VoiceView)`, `arm(GestureProof)`, `send`, `cancel` |
| `NavigationPort` | **RENAMED** | `WidgetPort.navigate` + `closeDetail` + `HistoryPort` + `routes/registry.ts` | Four pieces, no single interface |

Also present and relevant: `Transport` (four typed calls — `chat`, `transcribe`, `widgetIntent`,
`resolveWidgets`), `RenderFn` (the pure renderer, **injected** — "the shell may not import it"), and
`Authorizer`, which is **not** in `ports.ts`: it lives in `net/client.ts:427` and is documented
"never leaves `net/`". **The React carrier never speaks to `Authorizer`.** That is the structural
reason presentation cannot attach a bearer.

### 2.1 🔴 `ReceiptPort` does not exist, and this blocks one acceptance criterion

There are two distinct receipt notions, and only one is visible to any client:

- **`RenderReceipt`** = `'maya.render.receipt/1'` — a **presentation** receipt of what fitting
  withheld or reduced. The shell reads a projected `RenderReceiptView`. This exists.
- **`AiCanonicalReceipt`** = `'maya.ai-canonical-receipt/1'` — the **business** receipt. The backend
  holds it **encrypted and never serves it to any client**.

The shell can read exactly two receipt-shaped scalars today (`WidgetIntentProjection.receipt_*`).

The owner's acceptance line `RECEIPTS PRESERVED: YES` is therefore satisfied in the sense that
nothing is *lost* — but a `ReceiptPort` that shows a person what was done on their behalf **cannot
be built without a backend decision about what a client may see**. This specification declares no
shape for it. It names the decision and stops.

### 2.2 What presentation may and may not do, enforced rather than asked

| MAY | MAY NOT |
|---|---|
| render a projected view model | decide capability or role |
| collect a user gesture (incl. `GestureProof`) | choose authority |
| submit a **declared** input | infer business success |
| display a canonical result | mint an intent, fabricate a receipt, execute CRM, own booking state |

Each "may not" has an executable ratchet in §8. None is left as a convention.

---

## 3. Component classification — the owner's five buckets

**Scoped to chat-only.** The migration surface is `AChat` plus its direct visual dependencies, and
it is far smaller than the app: `AChat` renders exactly **seven** components, and every one is a
leaf with no further component dependency.

### 3.1 The surface, measured

`AChat` occupies `app.html:16671-22335` (5 665 lines) and splits almost perfectly along the line the
owner drew:

| Region | Lines | Legacy markers | Bucket |
|---|---|---|---|
| logic head `16671-21175` | **4 504** | **182** | 5 — LEGACY BUSINESS LOGIC → discard |
| presentation tail `21176-22335` | **1 159** | **6** | 1 — CHAT PRESENTATION → migrate |

The logic head is `CHAT_PROXY`, the MAYA OS onboarding flow (`/onboarding/ai/drafts`), CRM
connect/activate, an email-OTP login and YooKassa provisioning — legacy product screens that happen
to live inside the chat function. **They are not cleaned; they are not carried.**

The presentation tail is `typingDots` (`:21176`), the `bubble` factory (`:21180`), the header pill,
the composer, the context menu and the render root (`e(Backdrop, …)` at `:21393`).

### 3.2 Bucket 1 — CHAT PRESENTATION (migrate/adapt)

| Component | Source | Lines | Legacy markers |
|---|---|---|---|
| `AChat` presentation tail | `app.html:21176-22335` | 1 159 | 6 |
| `Backdrop` | `app.html` | 73 | 0 |
| `PaperGrain` | `app.html` | 20 | 0 |
| `MayaTypewriterText` | `app.html` | 72 | 0 |
| `MayaMark` | `app.html:2478` | 6 | 0 |
| `MayaMarkAnimated` | `app.html:2484` | 10 | 0 |
| `MayaVolumeMark` | `app.html:2494` | 2 | 0 |
| `SeedLogoAnimated` | `app.html:2515` | 11 | 0 |
| **TOTAL** | | **≈ 1 353** | **6** |

The six markers inside the tail, each with its cut:

| Line | What it does | Replacement |
|---|---|---|
| `21383` | `canClearChat` — a **capability decision in the view** | a `ConversationPort` read |
| `22080` | `__ME_TIPS_COMPANY_ID` / `__SAAS_TENANT` read | delete |
| `22083` | hardcoded company `'503759'` | delete |
| `22089`, `22095` | `__meSaasAuthedFetch` tips call | `Transport` or delete with the tips surface |

### 3.3 Bucket 2 — CHAT SUPPORTING UI (migrate only if required)

`IOSDevice` (48 lines, 1 marker) — the device frame; required only if the carrier keeps the
simulated-device chrome. `OverlayShell` and the long-press message context menu — required only
where a sheet is used **inside** the conversation. Everything else is deferred until a chat surface
actually needs it.

### 3.4 Bucket 3 — WIDGET VISUAL REFERENCE (reference/adapt only)

`ABookFlow`, `ABookService`, `ABookMaster`, `ABookDate`, `ABookTime`, `ABookConfirm`
(`app.html:11242-15223`). **Their look informs the server-owned selectors; their lifecycle does not
return.** See §6, and in particular that `submit()` at `app.html:13435` is deleted, not adapted.

### 3.5 Bucket 4 — LEGACY PRODUCT SCREEN (discard)

`MEApp` and its 21-key router, `HomeAurora`, `HomeNoir`, `HomeAtelier`, `AClientHome`, `AuroraTab`
(the global tab bar, mounted at root — not inside `AChat`), `ACrmCenter`, `AGodMode`,
`ASaasOwnerPanel`, `AClientCabinet`, `ALivePanel`, `ALiveSchedule`, `ALiveCutMatch`, `ALogin`,
`AOnboarding`, and every standalone product screen. **Not migration targets.**

### 3.6 Bucket 5 — LEGACY BUSINESS LOGIC (discard)

`AChat`'s 4 504-line logic head; the `meSaas*`/`meAppAccess*` authority module
(`app.html:5061-5963`, 64 functions); `meIsLegacy`/`meCab`/`meEnsureCabinet`;
`__ME_LEGACY_TENANT_SLUGS`; all seven `/auth/refresh` pipelines; all 61 `api-proxy.php` call sites.

**Because the scope is chat-only, most of the 122-row legacy inventory lives in components that are
never migrated. They are not cleaned — they are not carried.** That is the single biggest reason
this migration is bounded.

---

## 4. The `api-proxy.php` surface, and its canonical replacements

Measured: **27 literal occurrences** of `https://malesthetic.pro/app/api-proxy.php`, resolving to
**61 distinct `fetch(` call sites** carrying **61 distinct `action=` verbs** — 34 written as
literals, 27 passed as strings into nine generic dispatchers (`px` :9312, `meCabinetAction` :16203,
`mayaClientPreferenceCall` :16362, `shopPost` :26196, `gfetch` :26712, `doAction` :30654,
`saveClientName` :30743, `pfetch` :35448, `__mePushCall` :40689).

**Under chat-only scope, the great majority are in discarded screens and need no replacement — they
are simply not carried.** The full 122-row inventory is retained as the ban-list input for §8; what
follows is the part that touches a chat surface.

| `action=` | Canonical replacement |
|---|---|
| `nearest_slot` | `GET /available-slots` — `src/appointments/availability.controller.ts:20` |
| `get_services` | `GET /services` — `src/services/services.controller.ts:16` |
| `get_dates` | `GET /available-days` — `availability.controller.ts:31` |
| `get_times` | `GET /available-slots` — `availability.controller.ts:20` |
| `auth_phone_start` | `POST /auth/phone/start` — `auth.controller.ts:68` |
| `cabinet_link_phone` | `POST /auth/phone/verify` — `auth.controller.ts:80` |
| `chat` (`CHAT_PROXY?action=chat`, `app.html:17713`) | `POST /ai/chat` via `Transport.chat` |

Six capabilities have **no canonical route** and must move to the server / Action Engine rather than
be re-pointed: CutMatch face/haircut, `promo_gift`, `panel_job_run`, `god_overview`/`god_health`,
waitlist, chat transcript. **All six are outside chat-only scope; none is a migration target now.**

---

## 5. Legacy authority / session / storage dependencies

The authority surface is materially worse than the transport surface, and this is the strongest
argument for not carrying the old bundle and cleaning it afterwards.

| Finding | Measured |
|---|---|
| `authReq` mints **four different credential channels itself** | `app.html:40091-40104` |
| **Seven independent `/auth/refresh` rotation pipelines** live in the page | `:1129, :11839, :15254, :15626, :16701, :17872, :25668` |
| **76 sites** build an `Authorization: Bearer` header by reading a raw JWT out of `localStorage` | — |
| Presentation decides capability in **at least ten places** | `meAppAccessResolveFromMe` :5649 and four `Apply*Presentation` writers setting `__meRole`, `__meIsStaff`, `__meIsMaster`, `__meIsFounder`, `__meClientPreview` |
| A **localStorage role cache routes the user before any server answer** | `me_is_staff`, `:41535-41537` |
| `authPayload` picks `mode: 'staff' \| 'client'` from window state | `:19283-19288` |
| Storage keys | ~34 `localStorage` + 4 `sessionStorage`; **21 carry auth/session/authority**, 13 are genuine UI preferences |

**Replacement:** every one of these is deleted, not adapted. Session, refresh, bearer attachment and
the 401→refresh single-flight already exist once, correctly, in `net/session.ts` + `net/client.ts`,
behind `SessionPort`. The carrier gets `SessionPort` and nothing else. The 13 genuine UI preferences
may keep `localStorage` **only if** they are proven non-auth by the storage ratchet in §8.

---

## 6. Booking presentation → `WidgetEnvelope`

**All four canonical selectors exist as real, wired code** — contract body types, a presenter,
owner-port adapters, a closed 9-row intent-template registry, projector rows, server-owned step
transitions in the effect router, and a dedicated confirmation minter. They are emitted:
`chat-read.trigger.ts` mints the first `SERVICE_SELECTOR` from a completed catalog read, and **each
later step is minted server-side by the router, never requested by the client.**

🔴 **One blocking fact, and it is entitlement, not absence:** every widget route and emission trigger
sits behind the `widgets.runtime` entitlement, whose readiness is declared `planned` with the note
*"No plan grants this key, so no tenant has it."* **Nothing reaches a user today.** Granting it is a
release decision and is explicitly out of this document's authority.

### 6.1 The step order differs, and the owner's order cannot be kept as-is

| Canonical | `ABookFlow` |
|---|---|
| service → staff → slot | master → service → date → time |

The canonical contract **has no DATE step at all** — the calendar collapses into
`TIME_SLOT_SELECTOR.grouping: 'by_day'` plus `widen_window_intent`. The owner's master-first entry
must become either a re-ordered chain or an entry the server answers with `SERVICE_SELECTOR` first.
**This is a product decision, not an implementation detail**, and it is listed in §13.

### 6.2 Per selector

| Kind | Old renderer | Sends back | Must NOT |
|---|---|---|---|
| `SERVICE_SELECTOR` | `ABookService` | `SubmissionPort.submit(… inputs:{service_ref})` | treat `option_id` as a CRM service id; multi-select (no canonical carrier today); read price from anything but the `Measure`; advance the step itself |
| `STAFF_SELECTOR` | `ABookMaster` | `… inputs:{staff_ref}` | carry the master through `window.__meBookPreMaster` (`:13422-13434`) as booking state; render `nearest_availability` as a date when its Cell state is `NOT_MEASURED` |
| `TIME_SLOT_SELECTOR` | `ABookDate` + `ABookTime` | `… inputs:{slot_ref}` | build a month grid locally (`availDays` `:14887`, disabled-day branch `:14892`); derive free/taken; cross a month boundary itself (that is `widen_window_intent`); hold a rendered slot past 90 s without re-resolving |
| `BOOKING_CONFIRMATION` | `ABookConfirm` | `… intent_token: <commit intent>` | **everything `submit()` currently does** |

### 6.3 🔴 `submit()` is deleted, not adapted

`app.html:13435` today: validates identity locally (`:13437-13447`), **picks `/appointments` vs
`/appointments/preview` from `window.__SAAS_TENANT.booking_mode`** — presentation choosing authority
— composes a raw business payload of `staffId`/`serviceIds`/`start`/`clientPhone` rather than sealed
handles (`:13463-13471`), computes the total itself (`svcsTotalStr` `:13752`), then **infers success
and mints its own receipt text** from that same client-side flag (`:13473-13478`).

Every one of those is a "may not" from §2.2. The function does not survive in any form.
`BF_COMPANY = '503759'` (`:11223`) still drives the read path and the legacy bridge and goes with it.

**Two presenter gaps must close before this screen can look like the owner's:** `TIME_SLOT_SELECTOR`
hardcodes timezone `'UTC'`, `grouping: 'flat'` with one group and `slot price null`
(`presenter.ts:257-266`), with the availability read hardcoded to now+24 h (`adapter.ts:55-61`); and
`amend_intents` is minted empty (`booking-confirmation-minter.service.ts:157`), so the owner's
`back()` has no carrier. Both are backend work and are named in §13.

---

## 7. Guarantees affected by leaving the minimal renderer

33 enforced rules were enumerated from `build.mjs`, `test/dom.test.mjs`, `test/net.test.mjs`,
`test/cdp-verify.mjs`, `test/mobile-probe.mjs` and the meta CSP. They are **not one thing**:

| Class | Count | Fate |
|---|---|---|
| **REAL_SECURITY** | ~22 | every one gets a named replacement ratchet (§8) |
| **REAL_QUALITY / accessibility** | ~9 | port nearly unchanged — they are CDP/text checks |
| **RENDERER_IMPLEMENTATION_ONLY** | ~5 | and even most of these carry a security property underneath |

Two corrections to the framing I gave the owner earlier, both in the owner's favour:

**The large majority port verbatim.** `pwaContract`, `headTags`, `schemeToken`, `cssRules`/
`paddingIn`, `postEmitScan`, the `net.test.mjs` fetch recorder and storage traps, `cdp-verify`'s
`auditRequests`, and **all** of `mobile-probe.mjs` are text/AST/CDP checks that do not care what
produced the page. They need re-pointing from `entry/` to `dist/`, not rewriting.

**Four properties genuinely cannot survive identically.** Each gets a weaker-but-real substitute,
named here rather than discovered later:

| Property | Why it cannot survive | Substitute |
|---|---|---|
| "entry touches `document` exactly once" | `react-dom` touches it constantly | a no-DOM-lib `tsconfig` over the view-model layer — **equally strong for first-party code** |
| "one fetch call site" | a bundler inlines; React has more modules | one fetch-**owning named chunk**, verified by CDP initiator frames + ESLint `no-restricted-globals` |
| "no dynamic `import()`" | code-splitting is how React ships | every `import()` specifier is a static literal resolving inside the content-addressed module path |
| capacitor byte-equality | chunk hashing cascades | the API base moves to **runtime config**; the diff set must be exactly `{endpoint module, index.html}` |

### 7.1 🔴 Three real properties live *inside* presentation and would be lost silently

These are the ones that would disappear without anyone noticing, because they are not in `build.mjs`
— they are in the DOM modules being deleted:

1. **The href allowlist** — `isReplyHref` (`src/dom/timeline.ts:125`). The only `href` write in the
   bundle, scheme-allowlisted, with its own test asserting the count is exactly 1.
2. **The V7 trusted-gesture mint** — `proofOf` (`src/dom/voice-control.ts:106-107`). What makes a
   microphone arm provably user-initiated (`isTrusted` click/keydown/pointerup).
3. **The closed-tag / no-sink AST gate** — it has **no JSX equivalent** and must be rebuilt.

`isReplyHref` and `proofOf` are framework-free functions: **they move into `@maya/runtime` verbatim**
rather than being reimplemented. That is the first commit of the migration, before any React exists.

---

## 8. Replacement ratchet for every lost guarantee

Each row: the property, and the **executable** thing that enforces it in a React + bundler world.
Nothing here is a convention or a review note.

### 8.1 The four that matter most

| Property | Ratchet |
|---|---|
| **Endpoint allowlist (`PATHS`)** | (1) `P1_PATHS` stays one exported constant in a framework-free module; (2) a rollup/vite `generateBundle` plugin parses each first-party chunk with acorn, finds the `PATHS` literal and asserts set-equality; (3) CDP `auditRequests` asserts every observed request URL is in the set; (4) CSP `connect-src 'self'` |
| **No auth/authority in web storage** | (1) ESLint `no-restricted-globals` for `localStorage`/`sessionStorage`/`indexedDB`/`caches`/`cookie` + `no-restricted-properties` for the `window.*` spellings; (2) a **pinned-zero** bundle grep over first-party chunks; (3) a Playwright assertion that after sign-in all four stores are empty |
| **No client-side capability/role decision** | (1) the existing vocabulary grep ported verbatim over `dist/**` — it is text — **extended** with the React-era spellings the same mistake would use: `useRole`, `hasPermission`, `can(`, `isStaff`, `isOwner`; (2) `no-restricted-imports` so no file under `components/**` may import the entitlement module |
| **No intent minting / receipt fabrication** | (1) the token vault stays outside the view — lookup by `(item, intentRef)` in a non-component module, with `no-restricted-imports` making it physically unimportable from `components/**`; (2) every submission body built by one `schema.parse()` at the single call site, so an unknown member cannot survive; (3) a test asserting no component module references `intent_token` |

### 8.2 The structural ones

| Property | Ratchet |
|---|---|
| Token-free view model | a **branded `ViewModel`** produced by one projection function + a recursive mapped-type assertion (`tsd`/`expect-type`) that no member is named in `TOKEN_PROPERTIES` — a token in the view model becomes a **type error** |
| Memory-only session | the storage ratchets are the mechanism; plus a Playwright assertion: sign in → `reload()` → sign-in state drawn, **zero** `/ai/*` requests; plus a separate bfcache assertion |
| Closed tag set | narrow `JSX.IntrinsicElements` by module augmentation to exactly the 27 tags — `<img>` then **fails to typecheck**; plus an ESLint rule over `JSXOpeningElement` |
| No HTML sinks | keep `require-trusted-types-for 'script'` **unchanged** — it is already the runtime fence and works identically for React; add explicit `trusted-types` with one named policy for the ribbon `markup()` |
| Request-sink attributes | ESLint `no-restricted-syntax` on `JSXAttribute[name.name=/^(src\|srcSet\|href\|action\|formAction\|poster\|ping)$/]` outside one allowlisted module; `isReplyHref` kept verbatim |
| No inline style | CSP: keep `style-src 'self'` and **add `style-src-attr 'none'` explicitly** rather than relying on the fallback; plus `react/forbid-dom-props` for `style` |
| Layered imports | `eslint-plugin-boundaries` with the same `IMPORT_ALLOW` table **including the type-only distinction**; plus the **post-emit graph check, which is mandatory** and is the half most teams drop |
| Pure layers (no clock, no randomness) | ESLint `no-restricted-globals` for `Date`, `Math.random`, `performance`, `crypto`, `navigator`, `document`, `location`, `history`, scoped by `overrides` to the view/pure directories; plus the existing no-DOM-lib tsconfig widened |
| One wire body shape | **strictly easier in React**: a zod/valibot schema per endpoint, built with `schema.parse()`; unknown members stripped by construction; `audience`/`tenant`/`authority` cannot be added |
| Response projection allowlist | the same schema ratchet with `.strip()`; it never touched the DOM, so it ports unchanged |
| No service worker | name ban in ESLint + pinned-zero bundle grep; **the realistic vector is a plugin, not a line of code**, so also `no-restricted-imports` on PWA plugins |
| No external resource | the CSS-text rule over emitted CSS with the same `data:` exemption, **extended to `@font-face src`** — a design system importing Google Fonts is by far the most likely regression |
| Reproducible build | committed lockfile, `npm ci`, `engines` node pin, a build-time assert of the bundler version, and `--check` re-derived over `dist/**` |
| **The build REFUSES rather than emits** | 🔴 the single most important structural choice to carry over, and the one most likely to be lost by accident: **every check above goes in a bundler plugin that throws in `buildStart`/`generateBundle`/`writeBundle`** — not in a CI step that can be skipped |
| Refuse **and** admit fixtures | every ESLint rule ships with a `RuleTester` valid/invalid pair; coverage itself asserted, as today |

### 8.3 One existing gap to close during the migration

`cdp-verify.mjs` (19 steps, including the CSP load check, the request-initiator audit and the
reduced-motion assertion) and `mobile-probe.mjs` are **not in `npm test`** today. The migration is
the moment to add both to the merge gate with a pinned browser.

---

## 9. Migration sequence

Each step is acceptable on its own, against evidence that exists when it closes. No step depends on
a later one to be provable.

| # | Step | Exit evidence |
|---|---|---|
| **M0** | Widen `tsconfig.pure.json` to the whole headless set (`shell/`, `net/`, `voice/` added). Move `isReplyHref` and `proofOf` into `@maya/runtime` verbatim. | `--typecheck` green with no DOM lib over the runtime; the two functions have their existing tests, unmoved |
| **M1** | Split `ports.ts` at line 108. `@maya/ports` (headless) and the DOM-typed half stay side by side; **nothing else changes**. | build green; `grep` proves no headless module imports the DOM half |
| **M2** | Extract `@maya/runtime` as a package. No code edits — packaging only. | the existing `node --test` suites run against the package unchanged |
| **M3** | Carrier scaffold: bundler, React, CSP, **and the §8 ratchet plugin set wired to THROW**. No product code. | a deliberately-violating fixture fails the build for each of the 33 rows (refuse **and** admit fixtures) |
| **M4** | Port the eight leaf components (≈242 lines) verbatim. | visual diff against the canonical `app.html` render; `mobile-probe` green |
| **M5** | Port the `AChat` presentation tail (1 159 lines), cutting its six markers. Wire `SessionPort`, `ConversationPort`, `VoiceControlPort`. | the chat screen renders and sends a real turn; `cdp-verify` 19/19 |
| **M6** | Widget path: consume `RenderResult` from the headless renderer in React. | the existing 40-fixture renderer corpus renders identically through the React drawer |
| **M7** | Booking selectors as renderers for the four canonical kinds. | **gated on `widgets.runtime`** — until granted, fixture-only |
| **M8** | Parity + cutover: PWA and Capacitor from one bundle. | the §11 diff set is exactly `{endpoint module, index.html}` |

**M0-M2 touch no React and change no behaviour.** They are reversible by `git revert` and are worth
doing regardless of what is decided about the carrier.

---

## 10. Rollback

The minimal shell is **not deleted** at any point in M0-M7. It keeps building and keeps deploying.

| Layer | Mechanism |
|---|---|
| Per step | every step is one commit on a branch off `codex/maya-identity-consent-20260913`; `git revert` |
| Deploy | the PWA is content-addressed (`m/<digest>/` + `styles.css?v=<digest>`). The previous module tree stays on the host; rollback is **restoring one `index.html`** — already proven twice this programme |
| iOS | the previous `.app` is reinstallable from its `DerivedData`; bundle id unchanged |
| Cutover | both carriers build until M8 closes. The old shell is removed only after a green M8, in its own commit |
| Data | **none at risk** — the session is memory-only and nothing persists client-side |

---

## 11. PWA / iOS parity

One React presentation + one runtime adapter layer, built once, consumed by both carriers — which
is what the owner's ruling requires and what the current capacitor proof already enforces in spirit.

The proof changes shape because chunk hashing cascades: a single substituted line no longer works.
**The API base moves to runtime configuration**, and the parity assertion becomes: build both
targets, diff the two `dist` trees file-by-file by sha256, and assert the difference set is
**exactly** `{the endpoint/config module, index.html}` — `index.html` normalised for the digest path
and `connect-src`. Anything else in the diff fails the build.

This keeps the property that matters: **no iOS-only branch can quietly acquire a different CSP, a
different endpoint, a different consent screen or a different sign-in flow.**

---

## 12. Estimate, derived from actual counts

Not calendar months — work units with their drivers, so the owner can see what each is made of.

| Step | Driver (measured) | Size |
|---|---|---|
| M0 | 1 tsconfig line + 2 function moves | XS |
| M1 | mechanical split at `ports.ts:108`; 0 runtime edits | XS |
| M2 | packaging only, 6 414 lines unchanged | S |
| M3 | 33 ratchets: **~24 port nearly unchanged** (text/AST/CDP, re-point `entry/`→`dist/`), **~5 new ESLint/plugin rules**, **4 substitutes** | **L — the real cost** |
| M4 | 242 lines, 7 of 8 with zero markers | S |
| M5 | 1 159 lines, 6 markers to cut, 3 ports to wire | M |
| M6 | consume an existing data tree; 40 fixtures already exist | M |
| M7 | 4 selectors; **blocked on entitlement + 2 presenter gaps** | M, gated |
| M8 | diff-set proof + one deploy | S |

**The dominant cost is M3, not the UI.** Porting the owner's chat is ~1 400 lines of presentation
with six markers; rebuilding the enforcement so nothing is silently lost is the substantial work.
That is the correct place for the cost to sit.

This is materially smaller than the "months" I said earlier, for two measured reasons: 71% of the
shell is already headless, and chat-only scope means the 122-row legacy inventory is mostly **not
carried** rather than cleaned.

---

## 13. 🔴 Decisions this specification does not make

| # | Decision | Why it is the owner's |
|---|---|---|
| 1 | **`maya-identity.js`** — `MayaMarkAnimated` requires `window.MayaIdentity.markup()`/`.mount()`. It is on the earlier *do-not-restore* list, but it is pure presentation (`ribbon-v1` + `owner-reference-v3`) and the owner has now named the component as a preserve target. **In or out?** | two owner rulings conflict |
| 2 | **`ReceiptPort`** does not exist. The canonical business receipt is encrypted and **never served to any client**. What may a person be shown about what was done for them? | needs a backend contract decision |
| 3 | **`widgets.runtime` entitlement** is `planned`; no plan grants it. Until granted, no booking selector reaches any user. | a release decision |
| 4 | **Booking step order**: canonical `service→staff→slot` vs the owner's `master→service→date→time`, and the canonical contract has **no DATE step**. | a product decision |
| 5 | Two **presenter gaps** (`TIME_SLOT_SELECTOR` hardcodes UTC/flat/null-price; `amend_intents` minted empty) | backend work, separately scheduled |
| 6 | **Booking authority** — `appointments.own.create` is `CLIENT_ROLES` only; the owner is `tenant_owner` | already open, deliberately kept separate |

---

## Acceptance, against the owner's criteria

| Criterion | This design |
|---|---|
| `MY EXISTING REACT UI PRESERVED` | **YES** — ported as code from the canonical `app.html`, not re-authored |
| `LEGACY BUSINESS LOGIC PRESERVED` | **NO** — the 4 504-line logic head and the authority module are not carried |
| `CHAT-FIRST AUTHORITY PRESERVED` | **YES** — `@maya/runtime` is 6 414 lines unchanged |
| `ACTION ENGINE PRESERVED` | **YES** — untouched; the carrier never reaches it |
| `WIDGET CONTRACT PRESERVED` | **YES** — React consumes `RenderResult`; the projection is unchanged |
| `RECEIPTS PRESERVED` | **PARTIAL** — nothing is lost, but a `ReceiptPort` needs decision #2 |
| `PWA/IOS ONE PRESENTATION` | **YES** — one bundle, diff set asserted |
