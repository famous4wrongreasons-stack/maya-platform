# K1 — OWNER DOSSIER FOR THE HUMAN-JUDGEMENT CELLS

*Generated from `k1-surface-dossier.json` by `build-human-dossier.mjs`. Every count below is derived
from the file at build time and asserted, not transcribed. The build fails if the grouping is not a
total, disjoint partition of the signature rows.*

---

## 0. What is actually being signed

```
SURFACES SWEPT                       795
ROWS CARRYING A SIGNATURE CELL       126
  SUCCESSOR CELLS                    80
  CANONICAL-OWNER CELLS              57
  ROWS CARRYING BOTH (OVERLAP)       11
TOTAL CELLS (80 + 57)              137
GROUPS PRESENTED                     26
ROWS YOU CONFIRM ONE BY ONE          0
```

**One correction to the number I reported to you.** I called these "126 human-judgement cells". **126
is the number of *rows*; they carry 137 *cells*, because 11 rows need both a successor and an owner.
The split you asked for — 80 successor decisions, 57 owner decisions — is exact; the overlap is those 11 rows,
which appear once each in the groups below and are marked `S+O`.

The two kinds of decision are not equally consequential, and the dossier keeps them apart:

- **Successor decisions (80)** change what a user can reach and how. Groups **G01–G18**.
- **Owner decisions (57)** name who owns something that already runs. They change no behaviour.
  Groups **O01–O08**. Approving these is bookkeeping with teeth: an unattributed surface is one that
  gets rediscovered later as a new feature, or re-pointed by someone who did not know it had an owner.

---

## 1. Successor decisions

### G01 — The 152-ФЗ consent gate — five live copies, two write paths, one retired stub

```
ROW COUNT              8   (successor cells 8, owner cells 1, both 1)
CHANNELS               pwa, edge-relay, telegram-bot
DISPOSITION CLASS      MERGE
PACKAGE                K5/K8
```

**CURRENT SURFACES.** `S-244` AConsentGate — legacy 152-ФЗ blocking consent screen (PHP proxy) · `S-245` AConsentGate — legacy 152-ФЗ blocking consent screen (PHP proxy) · `S-246` Implicit booking-consent notice on the confirmation step · `S-621` Edge relay route: /api/consent/submit (152-FZ + ст.18 ФЗ «О рекламе» write) · `S-644` **S+O** AConsentGate — RETIRED stub in salon app.html · `S-645` AConsentGate — LIVE legacy consent gate in app-tenant.html (white-label mirror) · `S-646` AConsentGate — LIVE legacy consent gate in maya-os-site/index.html (MayaOS PWA bundle) · `S-654` Telegram consent accept callbacks — RETIRED (no write)

**PROPOSED SUCCESSOR.** ONE `CONSENT` widget kind (§2.6 CONSENT.1–CONSENT.3), reached from chat, backed by the single canonical write `/api/consent/submit`. The two legally separate confirmations (PDN required, marketing optional) stay two separate fields on that one widget.

**PROPOSED CANONICAL OWNER.** consent / 152-ФЗ  ·  marketing opt-in (the optional field only)

**WHY.** The same screen is compiled into three deployed bundles and the copies have already drifted: app.html carries a RETIRED stub while app-tenant.html and maya-os-site/index.html still run the LIVE gate, and each copy independently decides the staff bypass and the 401-silently-disables-the-gate path. A consent record is a legal artifact; three implementations of one legal artifact is the defect, not the UI.

**WHAT DISAPPEARS.** The blocking full-screen gate as a *screen*; the per-bundle copies; the implicit booking-consent footnote that records nothing; the retired Telegram accept callbacks.

**WHAT REMAINS.** The consent record and its two independent booleans; the privacy-policy text served by the server; the staff exemption; **the gate itself keeps blocking** — it becomes a widget the run cannot step past, not a dismissible card.

**RISK.** HIGH — the only group in the 126 with a statutory record behind it. A merge that loses the PDN/marketing separation, or that lets a refusal read as an acceptance, is a 152-ФЗ defect, not a UX regression.

**RECOMMENDED APPROVAL.** APPROVE, with the merge required to preserve two separate booleans and fail closed. Do not let the successor accept a single "I agree".

---

### G02 — Team communications — one capability spread over five surfaces

```
ROW COUNT              6   (successor cells 6, owner cells 0)
CHANNELS               pwa
DISPOSITION CLASS      MERGE
PACKAGE                K5/K8
```

**CURRENT SURFACES.** `S-040` Team chat («Внутренний чат смены») · `S-064` Deep-link overlay · Team communications · `S-100` Internal team chat (ATeamChat) · `S-142` Team chat (ATeamChat) · `S-272` Team communications (staff in-app messaging + voice notes) · `S-282` Team-communications voice note recording

**PROPOSED SUCCESSOR.** ONE `team messaging` capability rendered as a chat thread, with voice notes and attachments as input modes of that same capability rather than surfaces of their own.

**PROPOSED CANONICAL OWNER.** team messaging  ·  voice input  ·  attachments

**WHY.** A screen, a tab, a deep-link overlay, a notification feed and a voice recorder are five entries in the inventory for one thing a user would name once. The deep-link overlay exists only because the tab was not reachable from where the user was.

**WHAT DISAPPEARS.** The overlay, the duplicate tab/screen pair, the separate notification surface, the standalone voice recorder.

**WHAT REMAINS.** Presence and typing indicators, hold-to-record with slide-to-cancel, chunked upload with per-chunk receipt verification, message withdraw, the 10-second poll (until K13 replaces it).

**RISK.** MEDIUM — voice and attachment upload are the most stateful code in the PWA; folding them into a thread must not drop the per-chunk receipt check.

**RECOMMENDED APPROVAL.** APPROVE.

---

### G03 — The staff client base — the same list twice

```
ROW COUNT              2   (successor cells 2, owner cells 0)
CHANNELS               pwa
DISPOSITION CLASS      MERGE
PACKAGE                K5/K8
```

**CURRENT SURFACES.** `S-029` Staff Clients (legacy master client base) · `S-094` Staff clients list (AStaffClients)

**PROPOSED SUCCESSOR.** ONE `clients` capability with the master-scoped revenue projection as a parameter, not as a second surface.

**PROPOSED CANONICAL OWNER.** clients  ·  client revenue

**WHY.** A legacy tab and a newer screen render the same server projection; the newer one adds the `notmaster` state the older one lacks.

**WHAT DISAPPEARS.** The legacy tab.

**WHAT REMAINS.** Revenue totals, and the `notmaster` state as a refusal the capability itself returns.

**RISK.** LOW.

**RECOMMENDED APPROVAL.** APPROVE.

---

### G04 — The work cabinet tab strip and the two tabs that survive it

```
ROW COUNT              4   (successor cells 4, owner cells 0)
CHANNELS               pwa
DISPOSITION CLASS      MERGE
PACKAGE                K5/K8
```

**CURRENT SURFACES.** `S-024` Work cabinet on the `book` screen (staff/owner tab strip) · `S-091` Staff/owner cabinet hosted on the `book` screen (myView) · `S-526` Tab: Расписание (calendar) — operational journal · `S-529` Tab: Услуги (services)

**PROPOSED SUCCESSOR.** NO successor as a cabinet. Each tab becomes its own capability reached by asking for it: `calendar`, `services catalog`, `schedule`.

**PROPOSED CANONICAL OWNER.** calendar  ·  services catalog  ·  schedule

**WHY.** The tab strip is the single largest source of the 101 Maya-owned primary-nav entries. Its own code shows why it is a container and not a capability: tabs lazy-load on tap, so the strip holds nothing.

**WHAT DISAPPEARS.** The strip, the tab bar, the `book`-screen hosting, tab-keyed back-stack entries.

**WHAT REMAINS.** Every tab target, as a capability. Nothing is retired here — this is a re-parenting.

**RISK.** MEDIUM — the back-stack (L38689-38775), NAV_NO_BAR and NO_PUSH_ROOTS are keyed by these exact screen names; removing the strip without re-keying them strands the targets.

**RECOMMENDED APPROVAL.** APPROVE, conditional on the K1 parity harness proving each tab target reachable from chat before the strip is removed.

---

### G05 — Journal and session sub-states mistaken for surfaces

```
ROW COUNT              5   (successor cells 4, owner cells 1)
CHANNELS               pwa
DISPOSITION CLASS      MERGE
PACKAGE                K5/K8
```

**CURRENT SURFACES.** `S-542` Journal: date paging control · `S-543` Journal: staff (provider) filter · `S-544` Journal: CRM-unavailable dead-end state · `S-545` Journal: generic error + retry state · `S-577` «Нет данных» empty state for sessions

**PROPOSED SUCCESSOR.** NONE. These are states of the widget that owns them: paging and the staff filter are `REFINE` intents on the `calendar` widget; the two dead-ends and the empty state are that widget rendering empty or refusing.

**PROPOSED CANONICAL OWNER.** calendar  ·  sessions/devices (the empty state only)

**WHY.** A date pager, a filter pill row, a "CRM unavailable" panel, an error-with-retry and a "Нет данных" placeholder were counted as five surfaces. Under the widget contract a state is not a surface — every widget already declares its empty and refusal rendering.

**WHAT DISAPPEARS.** Five inventory rows. No user-visible capability is lost.

**WHAT REMAINS.** ±7-day paging, the "Сегодня" reset, the all-staff pill row, the two terminal error codes (`internal_calendar_disabled`, `crm_journal_not_supported`) as refusal reasons.

**RISK.** LOW — the only risk is bookkeeping: if these rows are deleted rather than re-parented, the parity harness loses five checks.

**RECOMMENDED APPROVAL.** APPROVE as re-parenting, not deletion.

---

### G06 — The owner panel — one container over ten capabilities

```
ROW COUNT              2   (successor cells 2, owner cells 0)
CHANNELS               pwa
DISPOSITION CLASS      MERGE
PACKAGE                K5/K8
```

**CURRENT SURFACES.** `S-030` Owner panel (legacy ALivePanel) · `S-096` Business panel — legacy salon panel (ALivePanel)

**PROPOSED SUCCESSOR.** NO successor as a panel. The ten capabilities it hosts stand on their own: analytics, daily report, waitlist, reviews, scheduled jobs, broadcast/marketing, team, loyalty redeem, schedule, and the founder-only MAYA tab.

**PROPOSED CANONICAL OWNER.** finance/analytics · reports · reviews · scheduled jobs · broadcast/marketing · staff roles · loyalty redeem · schedule

**WHY.** ALivePanel is the owner-side twin of the cabinet strip, and the same argument applies. It additionally hard-codes four separate authority tests (`founder only`, `permissions.dashboard`, `is_master`, `role==="owner"`) inside a presentation container — which is exactly the pattern the authority contract removes from the client.

**WHAT DISAPPEARS.** The panel; the four client-side authority tests.

**WHAT REMAINS.** All ten capabilities, each gated server-side by the authority contract instead of by the panel.

**RISK.** MEDIUM-HIGH — this is where client-side role tests are densest. If a capability is re-parented before its server-side gate exists, the panel's removal *loosens* a check.

**RECOMMENDED APPROVAL.** APPROVE, conditional: no panel-hosted capability may be re-parented ahead of its server-side authority gate.

---

### G07 — Onboarding and trial — four wizards for one business setup

```
ROW COUNT              6   (successor cells 6, owner cells 0)
CHANNELS               pwa
DISPOSITION CLASS      MERGE
PACKAGE                K5/K8
```

**CURRENT SURFACES.** `S-007` Login · trial sheet (10-day trial) · `S-008` Login · AI business-setup wizard · `S-075` Conversational AI onboarding «Настроить с Майей» (4 stages) — inside ALogin · `S-155` ＋ Новый салон (4-step onboarding wizard) · `S-281` In-app onboarding voice input (onbSendAudio) · `S-285` In-app owner AI onboarding wizard (onb* — chat|confirm|logo|crm)

**PROPOSED SUCCESSOR.** ONE conversational `onboarding` capability with declared stages (dialogue → confirm → logo → CRM), with the trial sheet as a step in it and voice as an input mode.

**PROPOSED CANONICAL OWNER.** onboarding  ·  business creation  ·  billing / trial activation  ·  CRM connect  ·  branding/logo upload  ·  voice input

**WHY.** The same setup exists as a login-embedded AI wizard, an in-app wizard, a 4-step form and a trial sheet. The two AI versions are already conversational — this group mostly *deletes the form*, it does not invent a new flow.

**WHAT DISAPPEARS.** The 4-step form wizard, the separate trial sheet, the login-embedded duplicate.

**WHAT REMAINS.** Auto-slug transliteration, the internal-vs-CRM calendar choice, the 11 RU timezones, the solo_specialist preset, 14-day trial creation, 409/429 handling, CRM branch discovery and import, the one-time credential hand-off, and — unchanged — the draft token living in a ref and never in URL or localStorage.

**RISK.** MEDIUM — tenant creation is the highest-consequence write in the product; the merged flow must keep the 409-slug-taken and 429-cooldown behaviour exactly.

**RECOMMENDED APPROVAL.** APPROVE.

---

### G08 — Marketing-site conversion surfaces

```
ROW COUNT              3   (successor cells 3, owner cells 0)
CHANNELS               pwa
DISPOSITION CLASS      MERGE
PACKAGE                K5/K8
```

**CURRENT SURFACES.** `S-159` Trial signup form (Создайте салон) · `S-169` Final CTA + footer · `S-194` Telegram bot entry (hero / mobile nav / footer / exit-intent)

**PROPOSED SUCCESSOR.** CHAT ENTRY. The trial form, the final CTA and the Telegram entry all resolve to "start a conversation with Maya", carrying their origin as a parameter.

**PROPOSED CANONICAL OWNER.** business creation (trial)  ·  chat (CTA and bot entry)

**WHY.** These are the front door, and the front door under chat-first is the conversation. Three separate CTA implementations exist because three page sections each grew one.

**WHAT DISAPPEARS.** The standalone trial form and the duplicate CTA blocks.

**WHAT REMAINS.** Every entry point as an entry point; the Telegram deep link keeps working.

**RISK.** LOW-MEDIUM — marketing conversion is measurable and the owner may want the form retained for A/B reasons. That is a business call, not a contract one.

**RECOMMENDED APPROVAL.** APPROVE, or defer this group alone if conversion testing is wanted first. It blocks nothing else.

---

### G09 — Login, splash and post-login routing

```
ROW COUNT              3   (successor cells 3, owner cells 0)
CHANNELS               pwa
DISPOSITION CLASS      MERGE
PACKAGE                K5/K8
```

**CURRENT SURFACES.** `S-003` Login · splash slide-to-unlock · `S-122` Post-login role routing (meAuthRoute) · `S-614` app-tenant legacy VK return ?code

**PROPOSED SUCCESSOR.** ONE `auth` capability. Post-login routing stops choosing a screen and instead resumes the conversation; the splash and the legacy VK return collapse into it.

**PROPOSED CANONICAL OWNER.** auth  ·  routing

**WHY.** `meAuthRoute` is the mechanism that decides which of the 101 nav entries a user lands on. Under chat-first there is one landing place, so the routing table has nothing left to choose between. **This group is a precondition for the primary-nav reduction, not a consequence of it.**

**WHAT DISAPPEARS.** The role-keyed landing table, the splash slide-to-unlock, the legacy VK `?code` return path (VK is already a policy violation per CLAUDE.md §7).

**WHAT REMAINS.** Authentication itself; the fresh-login signal; workspace selection.

**RISK.** MEDIUM — a routing change that lands a user in the wrong workspace is a tenant-confusion risk, which the authorization explicitly forbids ("Никогда не угадывать tenant для effectful action").

**RECOMMENDED APPROVAL.** APPROVE, conditional: the successor must resume without guessing a tenant; if the workspace is ambiguous it must ask.

---

### G10 — Profile menus and the client cabinet shell

```
ROW COUNT              3   (successor cells 3, owner cells 0)
CHANNELS               pwa
DISPOSITION CLASS      MERGE
PACKAGE                K5/K8
```

**CURRENT SURFACES.** `S-048` Profile menu sheet · `S-111` Profile mini-menu (bottom-nav 4th tab) · `S-176` Client cabinet (Личный кабинет) — modal shell

**PROPOSED SUCCESSOR.** THE FIVE CLASS-S DESTINATIONS. Identity rows, theme, settings and logout resolve to Account / Privacy & Data / Notifications; the cabinet modal shell disappears.

**PROPOSED CANONICAL OWNER.** profile  ·  logout  ·  cabinet

**WHY.** Two profile sheets and a modal shell exist to hold rows that are each a one-line setting. The shell also does something the contract forbids by construction: it re-parents itself to <body> to survive a stray overlay div.

**WHAT DISAPPEARS.** Both sheets, the modal shell, the body-reparenting hack, the body scroll lock, the `?cab_demo=` demo modes.

**WHAT REMAINS.** Every row target; the bilingual re-render; dark/light theme (as a setting, not a menu item).

**RISK.** LOW-MEDIUM — the role-aware "Личный кабинет" target (staff → mystat, manager → default tab, legacy → cabinet) is a client-side role test that must not be recreated in the successor.

**RECOMMENDED APPROVAL.** APPROVE.

---

### G11 — The Telegram admin category menus

```
ROW COUNT              6   (successor cells 6, owner cells 1, both 1)
CHANNELS               telegram-bot
DISPOSITION CLASS      MERGE
PACKAGE                K5/K8
```

**CURRENT SURFACES.** `S-413` Admin category: Аналитика (admin_cat_analytics) · `S-414` Admin category: Запустить рассылку вручную (admin_cat_jobs) · `S-415` Admin category: Маркетинг и анонсы (admin_cat_marketing) · `S-416` Admin category: Команда (admin_cat_team) · `S-417` Admin category: Аудит и прочее (admin_cat_audit) · `S-656` **S+O** Telegram /unsubscribe and /subscribe — redirect only

**PROPOSED SUCCESSOR.** NO successor as menus. Each callback becomes a capability the owner can ask for in words; the category level disappears entirely.

**PROPOSED CANONICAL OWNER.** reports · finance/analytics · broadcast/marketing · staff roles · loyalty points · referral · subscriptions · consent export

**WHY.** Five keyboard categories fan out to roughly twenty `admin_run_*` callbacks. A callback keyboard is the purest form of BUTTON → ENDPOINT, which the envelope declares unrepresentable. The `/unsubscribe` and `/subscribe` commands are redirect-only and fold into the same place.

**WHAT DISAPPEARS.** The five category keyboards, the ← Назад chain, and the `is_admin` client-side gate they each repeat (22 occurrences across the inventory).

**WHAT REMAINS.** Every `admin_run_*` capability, each one now gated server-side and each one confirmable where the contract requires confirmation.

**RISK.** MEDIUM — several of these run real business effects (broadcast, loyalty accrual, referral resolution). They must arrive behind the confirmation kind the contract assigns them, not behind a keyboard.

**RECOMMENDED APPROVAL.** APPROVE, conditional on each `admin_run_*` carrying its contract-assigned confirmation before the keyboard is removed.

---

### G12 — Chat widgets that are already in chat

```
ROW COUNT              9   (successor cells 9, owner cells 0)
CHANNELS               pwa
DISPOSITION CLASS      MERGE
PACKAGE                K5/K8
```

**CURRENT SURFACES.** `S-204` AShopCard — shop widget (widget: "shop") · `S-205` AProfileCard — profile widget (widget: "profile") · `S-206` AHistoryCard — visit history widget (widget: "history") · `S-212` AMasterUpsellCard — upsell advice card (widget: "master_upsell") · `S-224` Quick replies — static defaults · `S-227` Quick replies — welcome-screen command chips · `S-238` Proactive widget messages (frontend-synthesized, SaaS) · `S-239` Action / link buttons attached to chat messages · `S-242` Owner expense confirmation cards (not a chat widget)

**PROPOSED SUCCESSOR.** THE CONTRACT KIND that corresponds to each: shop → OFFER, profile → PROFILE, history → LIST, upsell advice → ADVICE, quick replies → the intent row of the widget that precedes them, action buttons → declared intents, expense cards → CONFIRM.

**PROPOSED CANONICAL OWNER.** shop · profile · visit history · reports · chat · booking · expense confirmation

**WHY.** These nine already live inside the conversation, so the decision is not *where they go* but *which contract kind they become* — and that is a real decision, because today they are bespoke React components with hand-written action dispatch. The action-button dispatcher in particular recognizes a free-form action vocabulary (`repeat_booking`, `open_subs`, `run_job`, bare screen names, and any http/tel/mailto URL) that the intent contract replaces with declared intents.

**WHAT DISAPPEARS.** The bespoke components, the free-form action vocabulary, the URL escape hatch, the client-side synthesis of proactive messages.

**WHAT REMAINS.** Every card a user sees today; the loyalty suppression rule (balance ≤ 0); the repeat-booking inference; the role-keyed quick replies as declared intents.

**RISK.** MEDIUM — the expense confirmation card is the one that approves money. Its four states (pending/approved/executing/completed) and its expiry must map onto the contract's confirmation lifecycle exactly, with no state that means "approved" by default.

**RECOMMENDED APPROVAL.** APPROVE. Flag the expense card for explicit review during K6.

---

### G13 — Deep links — seven parameter families across three bundles

```
ROW COUNT              7   (successor cells 7, owner cells 2, both 2)
CHANNELS               pwa, web-public
DISPOSITION CLASS      MERGE
PACKAGE                K5/K8
```

**CURRENT SURFACES.** `S-068` Deep-link · calendar setup (?calendar_setup=1) · `S-547` Deep link ?calendar_setup=1 (producers) · `S-612` **S+O** app-tenant deep link ?promo=1 / ?promo=reset · `S-613` app-tenant deep links ?booking_backend / ?booking_api_base / ?booking_tenant · `S-616` maya-os-site deep links ?booking_backend / ?booking_api_base / ?booking_tenant · `S-617` maya-os-site deep links ?onboarded / ?calendar_setup / ?crm_connect / ?cabinet · `S-618` **S+O** maya-os-site deep links ?consent, ?promo, ?tips-equivalents, ?social_linked / ?social_link_error, ?start, ?device_id

**PROPOSED SUCCESSOR.** ONE declared deep-link vocabulary resolving to capabilities, replacing the per-bundle ad-hoc parsers.

**PROPOSED CANONICAL OWNER.** CRM connect · calendar setup · onboarding · consent · promo · tips · social link · booking backend selection

**WHY.** Three bundles each parse their own overlapping set of query parameters, and some of them write authority-relevant state before any gate runs: the booking-backend links write `me_booking_backend` / `me_booking_api_base` / `me_booking_tenant_slug` into localStorage and then redirect. A URL parameter that pins which backend the app talks to is an authority input arriving through presentation.

**WHAT DISAPPEARS.** The per-bundle parsers; the localStorage pinning of backend/tenant from a URL.

**WHAT REMAINS.** Every legitimate entry point; `?consent=1` as a way to force the consent gate; the calendar-setup and CRM-connect entries.

**RISK.** HIGH for the booking-backend family specifically — it is the clearest "guessing a tenant" path in the inventory. LOW for the rest.

**RECOMMENDED APPROVAL.** APPROVE, with the booking-backend family required to stop writing tenant identity from a URL parameter.

---

### G14 — Whole-bundle duplicates

```
ROW COUNT              3   (successor cells 3, owner cells 1, both 1)
CHANNELS               pwa, web-public
DISPOSITION CLASS      MERGE
PACKAGE                K5/K8
```

**CURRENT SURFACES.** `S-240` Second rendering site of the whole widget system (MAYA OS site bundle) · `S-657` **S+O** ai администратор/privacy.html — standalone policy document · `S-667` app-tenant.html — white-label tenant mirror (deployed as tenant-test.html)

**PROPOSED SUCCESSOR.** ONE bundle. `app-tenant.html` and the MAYA OS site bundle stop being second rendering sites; `privacy.html` becomes the served policy text the consent widget already reads.

**PROPOSED CANONICAL OWNER.** (the same owners as the surfaces they duplicate)

**WHY.** `app-tenant.html` is a 2.5 MB near-duplicate of `app.html` carrying the same twelve widgets, the same dispatcher and the same onboarding handling. Every defect in this dossier that says "the copies have drifted" traces back to this row.

**WHAT DISAPPEARS.** The duplicate bundles as independent code.

**WHAT REMAINS.** White-labelling as configuration; the policy document as content.

**RISK.** MEDIUM — de-duplication is the largest mechanical change in K1's scope and touches deployed files. Nothing in Wave 1 does it; this row only records the decision.

**RECOMMENDED APPROVAL.** APPROVE the decision; sequence the work into K5/K8 where the envelope already places it.

---

### G15 — Backend controllers and edge-relay routes with no named capability

```
ROW COUNT              4   (successor cells 4, owner cells 1, both 1)
CHANNELS               pwa, edge-relay
DISPOSITION CLASS      MERGE
PACKAGE                K5/K8
```

**CURRENT SURFACES.** `S-331` CustomersController — /api/customers · `S-332` CrmController — /api/crm (public capability catalog) · `S-624` Edge relay route: /api/client-link/consume · `S-629` **S+O** api-proxy.php dispatch — set_visit_mood

**PROPOSED SUCCESSOR.** Each keeps its route and gains its capability name: customer consent profile, tenant-scoped customer records, internal notes, the CRM provider catalogue, client-link consumption, visit mood.

**PROPOSED CANONICAL OWNER.** consent / 152-ФЗ · clients · CRM connect · client-link · visit mood

**WHY.** These are server surfaces the inventory found but could not attribute, because the inventory row named an endpoint and not a capability. They are not UI decisions — they are the naming that lets the capability registry cover them.

**WHAT DISAPPEARS.** Nothing. No route changes.

**WHAT REMAINS.** All five routes, with their existing authority checks (manager-only for the tenant-scoped reads).

**RISK.** LOW — naming only. The one to watch is `set_visit_mood`, which has both a relay and a backend handler and so appears twice.

**RECOMMENDED APPROVAL.** APPROVE.

---

### G16 — The tip flow

```
ROW COUNT              1   (successor cells 1, owner cells 0)
CHANNELS               pwa
DISPOSITION CLASS      MERGE
PACKAGE                K5/K8
```

**CURRENT SURFACES.** `S-170` Tip flow: master select → amount → transfer details

**PROPOSED SUCCESSOR.** ONE `tips` capability: choose master → amount → transfer details, as a widget sequence.

**PROPOSED CANONICAL OWNER.** tips

**WHY.** A three-step flow that is already linear and already declares its own parameters (preset amounts, min 50 / max 15000, copy-to-clipboard fields, the external bank hand-off).

**WHAT DISAPPEARS.** The bespoke multi-screen flow.

**WHAT REMAINS.** Master selection by slug, every preset and the custom amount with its bounds, all five copy actions, the external bank CTA, and the "Я перевёл" acknowledgement — **which stays an acknowledgement and not a payment confirmation**, because no payment is observed.

**RISK.** LOW-MEDIUM — the "Я перевёл" button is the same shape as GAP-ATTENDANCE-CONFIRM: a user assertion about something the system did not witness. It must not be surfaced as a confirmed transfer.

**RECOMMENDED APPROVAL.** APPROVE, with the wording constraint recorded.

---

### G17 — Web-push subscription taken without asking

```
ROW COUNT              3   (successor cells 3, owner cells 0)
CHANNELS               pwa, web-push
DISPOSITION CLASS      MERGE / RETIRE AFTER PARITY
PACKAGE                K5/K8 / K16
```

**CURRENT SURFACES.** `S-264` Auto web-push subscription with NO user control · `S-760` app-tenant.html — stale legacy push subscription bundle · `S-761` maya-os-site/index.html — B24 push block (MAYA OS bundle)

**PROPOSED SUCCESSOR.** ONE `notifications` capability that asks first, in the conversation, and records the answer.

**PROPOSED CANONICAL OWNER.** notifications  ·  Notification.requestPermission  ·  pushManager.subscribe

**WHY.** The current code requests OS notification permission and subscribes automatically, with no user control, in three bundles. This is the one group in the dossier where the current behaviour is worse than the successor by the product's own standard, not merely more numerous.

**WHAT DISAPPEARS.** Automatic subscription; the stale duplicate subscription blocks in the two mirror bundles.

**WHAT REMAINS.** Push itself, as something the user turned on.

**RISK.** LOW to implement; the risk is *not* doing it.

**RECOMMENDED APPROVAL.** APPROVE.

---

### G18 — Static pages and orphaned native assets

```
ROW COUNT              4   (successor cells 4, owner cells 3, both 3)
CHANNELS               native-shell, web-public
DISPOSITION CLASS      RETIRE AFTER PARITY / KEEP AS CAPABILITY / RETIRE FROM PRIMARY NAVIGATION
PACKAGE                K16 / K8/K10/K11
```

**CURRENT SURFACES.** `S-490` app-tenant.html — partial Capacitor surface (no custom Maya plugins) · `S-659` **S+O** 404.html — error page · `S-662` **S+O** offline.html — PWA offline fallback · `S-668` **S+O** vkid-sdk.js — orphaned VK ID SDK (policy violation)

**PROPOSED SUCCESSOR.** 404 and offline stay as static fallbacks (they are not capabilities and have no chat successor). The orphaned VK SDK and the orphaned native stylesheet are deleted. The partial Capacitor surface in the mirror bundle retires with that bundle.

**PROPOSED CANONICAL OWNER.** (none — these rows have no capability, which is the finding)

**WHY.** Four rows that the sweep could not attribute because there is nothing to attribute: two are browser fallbacks, two are dead files. `vkid-sdk.js` additionally violates the standing "no VK/MAX links" rule (CLAUDE.md §7) and is currently not loaded by anything.

**WHAT DISAPPEARS.** `vkid-sdk.js`, `native-styles.css`, the mirror bundle's Capacitor block.

**WHAT REMAINS.** `404.html` and `offline.html` exactly as they are.

**RISK.** LOW.

**RECOMMENDED APPROVAL.** APPROVE.

---

## 2. Canonical-owner decisions

*These name an owner for something that already exists and already runs. None of them proposes a
successor, because none of them proposes a change. The field is present and reads "not a successor
decision" so the shape of the dossier stays uniform.*

### O01 — R09 public-community — the anonymous comment pipeline

```
ROW COUNT              20   (owner cells 20, successor cells 2, both 2)
CHANNELS               public-community, edge-relay
DISPOSITION CLASS      SETTINGS / SECURITY ONLY / LEGACY / UNREACHABLE / OUT OF SCOPE WITH EXACT REASON / KEEP AS FULLSCREEN SECONDARY
PACKAGE                K12 / K16 / K5
```

**CURRENT SURFACES.** `S-703` Anonymous visitor identity cookie (me_visitor) + consent gateway · `S-706` POST /api/site/community/{action} — anonymous source initiator · `S-707` Community engagement legacy owner (likes/views/comments/AI moderation/brand replies) — FENCED · `S-708` Canonical community source bridge (Python -> NestJS) · `S-709` **S+O** R09 permanent owner-boundary ratchet · `S-710` POST /public-community/source — canonical anonymous source controller · `S-711` Gateway verification service (source scope, no moderator authority) · `S-712` PublicCommunityService.acceptComment — consent persistence + idempotent anonymous comment · `S-713` PublicCommunityService.observe — anonymous likes and daily views · `S-714` GET/POST /public-community/moderation — human moderation + brand reply · `S-715` Community text/author safety contract (PII, profanity, staff-impersonation) · `S-716` R09 schema foundation (PublicCommunityComment / PublicCommunityInteraction) · `S-717` 365-day payload retention purge (AC6 purge_public_community_payloads) · `S-718` Public site community UI (deployed Next.js chunk) · `S-719` PWA moderation queue «Обсуждения на сайте» · `S-720` Beget api-proxy action dispatcher (7 community actions) · `S-721` Site publications API (/api/site/posts, /api/site/posts/{slug}, /api/site/post-media/{name}) · `S-722` site_publication_bot.py · `S-724` webhook_server.py — community/guest route registration · `S-725` **S+O** R09 frozen retirement contract (site_community / site_engagement bodies)

**PROPOSED SUCCESSOR.** (not a successor decision — these rows are owner-attribution only)

**PROPOSED CANONICAL OWNER.** PUBLIC COMMUNITY — one canonical owner: `PublicCommunityService` on the NestJS backend, with the Python side demoted to a signing source and the legacy SQLite store demoted to normalization.

**WHY.** Twenty rows across PHP relay, Python bot, NestJS controller/service/contract, a Postgres migration, a retention action, a deployed Next.js chunk, a PWA moderation queue and two frozen ratchets. The pipeline already *has* a canonical owner — the ratchet files exist precisely to keep the Python side from re-acquiring authority. What the inventory lacked was the row saying so.

**WHAT DISAPPEARS.** Nothing. This group changes no code.

**WHAT REMAINS.** The HMAC source-signing boundary, the moderation authority split (source ≠ moderator), the 365-day payload retention purge, the frozen retirement contract and its runtime guard.

**RISK.** LOW as an attribution; HIGH if someone later reads "canonical owner: NestJS" as licence to re-point the Python writers. The ratchet prevents that mechanically.

**RECOMMENDED APPROVAL.** APPROVE as attribution. No implementation follows in Wave 1.

---

### O02 — Anonymous guest chat with Maya

```
ROW COUNT              3   (owner cells 3)
CHANNELS               guest-chat
DISPOSITION CLASS      OUT OF SCOPE WITH EXACT REASON / KEEP AS CHAT SURFACE
PACKAGE                K5
```

**CURRENT SURFACES.** `S-704` Guest-chat edge route mapping (site_guest_chat -> guest-chat) · `S-705` ANONYMOUS GUEST CHAT WITH MAYA (module) · `S-723` Anonymous guest-chat front-end UI

**PROPOSED SUCCESSOR.** — not a successor decision; nothing is replaced.

**PROPOSED CANONICAL OWNER.** GUEST CHAT — `site_guest_chat` (in-memory anonymous session manager), reached through the edge-relay route mapping. The marketing-site front-end for it does not exist.

**WHY.** Three rows: a module, its route mapping and an absent UI. The capability is real and running; the surface that would expose it was never built. Attributing it now is what keeps it from being rediscovered as a new feature later.

**WHAT DISAPPEARS.** Nothing.

**WHAT REMAINS.** The anonymous session manager; the route mapping; the deliberate absence of the front-end, recorded as an absence rather than a gap.

**RISK.** LOW.

**RECOMMENDED APPROVAL.** APPROVE as attribution.

---

### O03 — Scheduled jobs — eleven crons and loops

```
ROW COUNT              11   (owner cells 11)
CHANNELS               scheduler
DISPOSITION CLASS      OUT OF SCOPE WITH EXACT REASON / LEGACY / UNREACHABLE
PACKAGE                K16
```

**CURRENT SURFACES.** `S-766` cron reactivation — 10:00 MSK (dormant-client winback) · `S-769` cron referral_resolver — 11:30 MSK · `S-770` cron subscriptions — 12:00 MSK (renewal nudge) · `S-771` cron loyalty — 12:30 MSK (earn + expiry) · `S-772` cron reviews — every 5 min (review request dispatch) · `S-773` cron lead_alerts — every 5 min (hanging_lead) · `S-774` cron dual_role_guard — every 3 h at :17 · `S-776` cron god_watch — 09:00 MSK · `S-781` loop client_retention_refresh_loop — retired · `S-782` loop maya_operating_rhythm_loop — retired · `S-783` loop reputation_monitor_loop — retired and unscheduled

**PROPOSED SUCCESSOR.** — not a successor decision; nothing is replaced.

**PROPOSED CANONICAL OWNER.** SCHEDULER — `bot.py` cron table (reactivation, referral resolver, subscriptions, loyalty) and `webhook_server.py` background loops; four of the crons and all three loops are already retired or unreachable.

**WHY.** Eleven rows the sweep found in the scheduler that name no capability because they *are* the capability's trigger, not the capability. Distinguishing "retired" from "running" matters here: reviews, lead_alerts, dual_role_guard and god_watch are marked LEGACY/UNREACHABLE, while reactivation, referral, subscriptions and loyalty run daily against real clients.

**WHAT DISAPPEARS.** Nothing in Wave 1.

**WHAT REMAINS.** The four live crons and their business effects; the retired ones stay retired.

**RISK.** MEDIUM as a *record* — four of these send messages to real clients on a schedule, and any later chat-first work that re-points them is production-affecting. Recording which four is the point of this group.

**RECOMMENDED APPROVAL.** APPROVE as attribution, with the live/retired split recorded explicitly.

---

### O04 — Legacy web-push senders and dead permission code

```
ROW COUNT              2   (owner cells 2)
CHANNELS               web-push
DISPOSITION CLASS      LEGACY / UNREACHABLE
PACKAGE                K16
```

**CURRENT SURFACES.** `S-759` 🔴 Legacy Python push senders — fail-closed stubs · `S-762` native-enhancements.js — window.requestPushPermission (orphaned)

**PROPOSED SUCCESSOR.** — not a successor decision; nothing is replaced.

**PROPOSED CANONICAL OWNER.** WEB PUSH (legacy) — the Python senders are fail-closed stubs; `window.requestPushPermission` in `native-enhancements.js` is orphaned.

**WHY.** Two rows that are already dead and already fail closed. They appear in the 57 because "fail-closed stub" is not a capability name.

**WHAT DISAPPEARS.** Nothing in Wave 1; deletion belongs with K16.

**WHAT REMAINS.** The fail-closed behaviour, unchanged.

**RISK.** LOW.

**RECOMMENDED APPROVAL.** APPROVE as attribution.

---

### O05 — OTP delivery — SMS fenced, email absent

```
ROW COUNT              2   (owner cells 2)
CHANNELS               sms, email
DISPOSITION CLASS      SETTINGS / SECURITY ONLY / OUT OF SCOPE WITH EXACT REASON
PACKAGE                K12
```

**CURRENT SURFACES.** `S-733` SMS OTP delivery — send_sms / verify_sms (hard-fenced) · `S-740` Email OTP / magic-link delivery

**PROPOSED SUCCESSOR.** — not a successor decision; nothing is replaced.

**PROPOSED CANONICAL OWNER.** OTP DELIVERY — SMS via the hard-fenced `send_sms` / `verify_sms` endpoints; email OTP / magic-link has no implementation.

**WHY.** Two rows about how a verification code reaches a person. One is fenced and live; the other is an absence. Both matter to the verification ladder, and neither names a capability today.

**WHAT DISAPPEARS.** Nothing.

**WHAT REMAINS.** The SMS fence exactly as it is. The email absence stays an absence — **this is a place where STEP_UP_VERIFIED would need a channel it does not have, and the frozen limitation already records STEP_UP as unreachable.**

**RISK.** LOW as attribution; naming it does not make it reachable.

**RECOMMENDED APPROVAL.** APPROVE as attribution.

---

### O06 — Telegram capability absences

```
ROW COUNT              4   (owner cells 4)
CHANNELS               telegram-bot
DISPOSITION CLASS      MOVE INTO CHAT WIDGET / KEEP AS CAPABILITY
PACKAGE                K8 / K8/K10/K11
```

**CURRENT SURFACES.** `S-451` ABSENCE — no Telegram command menu registered · `S-452` ABSENCE — no /help for clients or masters · `S-453` ABSENCE — no ConversationHandler anywhere · `S-454` ABSENCE — client conversational AI removed from this channel

**PROPOSED SUCCESSOR.** — not a successor decision; nothing is replaced.

**PROPOSED CANONICAL OWNER.** TELEGRAM — no command menu, no /help, no ConversationHandler, no client conversational AI in that channel.

**WHY.** Four rows that record what is *not* there. They carry no capability because the capability is missing, and the sweep deliberately kept them rather than dropping them — an absence that is written down cannot be rediscovered as a surprise.

**WHAT DISAPPEARS.** Nothing.

**WHAT REMAINS.** The absences, recorded. K8/K10/K11 decide whether any of them is filled.

**RISK.** LOW.

**RECOMMENDED APPROVAL.** APPROVE as attribution.

---

### O07 — Native-shell and Telegram-mini-app absences

```
ROW COUNT              3   (owner cells 3)
CHANNELS               native-shell, telegram-miniapp
DISPOSITION CLASS      SECURITY/AUTHORITY ONLY / RETIRE FROM PRIMARY NAVIGATION
PACKAGE                K15 / K16
```

**CURRENT SURFACES.** `S-455` NATIVE SOURCE ABSENT — no *.swift/*.kt/*.java/*.pbxproj/AndroidManifest.xml/capacitor.config.*/Info.plist in repo · `S-481` native-styles.css — companion stylesheet (ORPHANED) · `S-488` TELEGRAM SDK ABSENT — telegram-web-app.js is never loaded by the bundle

**PROPOSED SUCCESSOR.** — not a successor decision; nothing is replaced.

**PROPOSED CANONICAL OWNER.** NATIVE SHELL — no native source in the repository (no Swift/Kotlin/Java/pbxproj/AndroidManifest); the companion stylesheet is orphaned. TELEGRAM MINI-APP — `telegram-web-app.js` is never loaded, so the mini-app identity contract is unresolved.

**WHY.** Three rows recording that two "channels" in the inventory are not channels the repository can build. The mini-app one is the consequential one: an unresolved identity contract on a channel that appears in the channel list.

**WHAT DISAPPEARS.** The orphaned stylesheet.

**WHAT REMAINS.** The recorded absence of native source; **the mini-app identity contract stays explicitly unresolved and must be settled before the identity redesign**, which is what its row already says.

**RISK.** MEDIUM — the mini-app row is the one absence in the 57 that names a prerequisite for later work.

**RECOMMENDED APPROVAL.** APPROVE as attribution, with the mini-app prerequisite carried forward into K15.

---

### O08 — Edge-relay and backend fences with no capability name

```
ROW COUNT              2   (owner cells 2)
CHANNELS               edge-relay, backend
DISPOSITION CLASS      SECURITY/AUTHORITY ONLY
PACKAGE                K15
```

**CURRENT SURFACES.** `S-628` api-proxy.php dispatch — cabinet_link_phone / native_feedback / notify_prefs · `S-634` webhook_server set_visit_mood_handler

**PROPOSED SUCCESSOR.** — not a successor decision; nothing is replaced.

**PROPOSED CANONICAL OWNER.** `cabinet_link_phone` · `native_feedback` · `notify` (relay dispatch) and `set_visit_mood_handler` (backend) — server-side fences, no UI successor.

**WHY.** Two rows that are authority mechanisms rather than features. They name no capability because their job is to refuse.

**WHAT DISAPPEARS.** Nothing.

**WHAT REMAINS.** Both fences exactly as they are.

**RISK.** LOW.

**RECOMMENDED APPROVAL.** APPROVE as attribution.

---

## 3. Where to look first

If you read only part of this, read these. They are the groups where a merge could make something
worse rather than fewer.

| GROUP | ROWS | WHY IT IS THE ONE TO CHECK |
|---|---|---|
| **G01** consent | 8 | the only group with a statutory record behind it |
| **G13** deep links | 7 | a URL parameter pins tenant identity into localStorage before any gate runs |
| **G06** owner panel | 2 | densest client-side authority tests; re-parenting ahead of a server gate *loosens* a check |
| **G12** chat widgets | 9 | contains the card that approves money |
| **G11** Telegram admin | 6 | runs real business effects from a callback keyboard |
| **O03** scheduler | 11 | four of the eleven send messages to real clients daily |

---

## 4. Approval block

*One block. Strike any group you do not approve and it stays unsigned; the rest proceed. Any group left
unsigned blocks only its own rows — the dossier is a partition, so no group depends on another being signed.*

```
K1 HUMAN DOSSIER

SUCCESSOR DECISIONS   G01–G18   80 cells / 18 groups   APPROVED: ___
OWNER DECISIONS       O01–O08   57 cells / 8 groups   APPROVED: ___

CONDITIONAL GROUPS — approving these approves the condition with them:
  G04  strip removed only after the parity harness proves each tab reachable from chat
  G06  no panel capability re-parented ahead of its server-side authority gate
  G09  the successor must not guess a tenant; ambiguous workspace must ask
  G11  each admin_run_* carries its contract-assigned confirmation before the keyboard goes
  G13  the booking-backend family stops writing tenant identity from a URL parameter
  G01  the merge keeps two independent booleans and fails closed
  G16  "Я перевёл" stays an acknowledgement, never a confirmed transfer

EXCLUSIONS (strike-through any group number):
  ______________________________________________

K1 HUMAN DOSSIER SIGNED:  YES / NO
```

---

## 5. What signing does and does not authorize

**Does.** Closes K1. Lets Wave 2 begin. Fixes the successor and owner columns of these 126 rows so the
parity harness can be turned from RED to a real check.

**Does not.** No production change. No deployed byte changes. No migration runs. The frozen limitations
stay exactly as frozen — in particular **no surface in any group here may say a client confirmed
attendance while `GAP-ATTENDANCE-CONFIRM` is open**, which is why G16 carries its wording constraint.
