# K1 — Surface Disposition Dossier

> **Status: READY FOR SIGNATURE. K1 deletes nothing.**
> One row for every surface in the inventory. Each carries a **class**, a **successor**, a
> **canonical owner**, a **parity requirement** and a **retirement condition**. The machine-readable
> table is `evidence/maya-chat-first-ux/k1/k1-surface-dossier.json`; this document is the part a
> person signs.
>
> **Wave 1 changes no runtime, no deployed byte and no production row.**

```
SURFACES: 795/795
PRIMARY NAV (ALL CHANNELS): 112
PRIMARY NAV (MAYA-OWNED):   101
ROWS REQUIRING A SIGNATURE: 126
```

## 1. How a row is filled, and why the provenance is on every row

Four provenances, and the distinction is the point of the dossier:

| provenance | meaning | rows |
|---|---|---:|
| **EVIDENCE** | the disposition sweep names it outright | 220 |
| **DERIVED** | the class plus the inventory's capability list fix it uniquely | 439 |
| **ASSIGNED BY K5 / K8** | the *form* is fixed; the instance is a later package's mechanical job — a route key, a widget kind | 56 |
| **REQUIRES SIGNATURE** | a judgement, and the owner makes it | 80 |

A dossier that marked everything "derived" would be a dossier nobody needed to read. The
80 successor judgements and 57 owner judgements below are the whole of what the
signature is *for*; everything else is reproducible by re-running the generator.

## 2. The 795, by class

| class | rows | successor form | retirement condition |
|---|---:|---|---|
| `KEEP AS CAPABILITY` | 195 | the capability, reached from chat | NOT RETIRED - it becomes a capability |
| `SECURITY/AUTHORITY ONLY` | 120 | server-side fence (no UI successor) | RETIRED AS UI - K15; the fence remains server-side |
| `MOVE INTO CHAT WIDGET` | 114 | contact card (call / route / website / chat actions) | RETIRE AFTER PARITY - K16 |
| `MERGE` | 92 | MERGE_TARGET | RETIRE AFTER PARITY - K16 |
| `OUT OF SCOPE WITH EXACT REASON` | 82 | - (out of scope) | NOT RETIRED - out of scope, with the reason on the row |
| `KEEP AS FULLSCREEN DETAIL` | 76 | a route_key serving tenant discovery; the exact key is assigned by K5 | NOT RETIRED - reached by HANDOFF |
| `RETIRE FROM PRIMARY NAVIGATION` | 63 | Maya, or the route serving role/mode switch | RETIRE IN K16, row by row |
| `SETTINGS / SECURITY ONLY` | 30 | Account (class-s destination) | RETIRE FROM PRIMARY NAV - K16 |
| `LEGACY / UNREACHABLE` | 14 | - (none; unreachable) | RETIRE IN K16 after the probe is recorded |
| `KEEP AS CHAT SURFACE` | 4 | Maya (the conversation) | NOT RETIRED - it is the conversation |
| `RETIRE AFTER PARITY` | 3 | NAMED_SUCCESSOR | RETIRE IN K16 |
| `CONVERT TO WIDGET` | 1 | a widget kind serving NDEF URL write to a physical tag; the kind is assigned by K8 | RETIRE AFTER PARITY - K16 |
| `KEEP AS FULLSCREEN SECONDARY` | 1 | a route_key serving this surface; the exact key is assigned by K5 | NOT RETIRED - secondary route |

**Totals check.** 795 rows across 13 classes, which is the whole inventory: the
disposition sweep supplied 660 and the triage of the last 135 supplied
135. They join on `(basename(file), normalized(name))` with **zero** unmatched rows,
which is the same key the inventory manifest's method line describes.

## 3. The 80 successor judgements

72 of the 80 are `MERGE` rows, and that is the honest shape of the problem: *which
surface does this fold into* is a product judgement, not a derivation. The rest are named below.

| # | surface | channel | class | what must be decided |
|---|---|---|---|---|
| S-003 | Login · splash slide-to-unlock | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-007 | Login · trial sheet (10-day trial) | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-008 | Login · AI business-setup wizard | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-024 | Work cabinet on the `book` screen (staff/owner tab strip) | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-029 | Staff Clients (legacy master client base) | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-030 | Owner panel (legacy ALivePanel) | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-040 | Team chat («Внутренний чат смены») | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-048 | Profile menu sheet | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-064 | Deep-link overlay · Team communications | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-068 | Deep-link · calendar setup (?calendar_setup=1) | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-075 | Conversational AI onboarding «Настроить с Майей» (4 stages) — inside ALo | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-091 | Staff/owner cabinet hosted on the `book` screen (myView) | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-094 | Staff clients list (AStaffClients) | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-096 | Business panel — legacy salon panel (ALivePanel) | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-100 | Internal team chat (ATeamChat) | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-111 | Profile mini-menu (bottom-nav 4th tab) | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-122 | Post-login role routing (meAuthRoute) | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-142 | Team chat (ATeamChat) | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-155 | ＋ Новый салон (4-step onboarding wizard) | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-159 | Trial signup form (Создайте салон) | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-169 | Final CTA + footer | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-170 | Tip flow: master select → amount → transfer details | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-176 | Client cabinet (Личный кабинет) — modal shell | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-194 | Telegram bot entry (hero / mobile nav / footer / exit-intent) | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-204 | AShopCard — shop widget (widget: "shop") | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-205 | AProfileCard — profile widget (widget: "profile") | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-206 | AHistoryCard — visit history widget (widget: "history") | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-212 | AMasterUpsellCard — upsell advice card (widget: "master_upsell") | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-224 | Quick replies — static defaults | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-227 | Quick replies — welcome-screen command chips | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-238 | Proactive widget messages (frontend-synthesized, SaaS) | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-239 | Action / link buttons attached to chat messages | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-240 | Second rendering site of the whole widget system (MAYA OS site bundle) | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-242 | Owner expense confirmation cards (not a chat widget) | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-244 | AConsentGate — legacy 152-ФЗ blocking consent screen (PHP proxy) | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-245 | AConsentGate — legacy 152-ФЗ blocking consent screen (PHP proxy) | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-246 | Implicit booking-consent notice on the confirmation step | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-264 | Auto web-push subscription with NO user control | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-272 | Team communications (staff in-app messaging + voice notes) | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-281 | In-app onboarding voice input (onbSendAudio) | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-282 | Team-communications voice note recording | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-285 | In-app owner AI onboarding wizard (onb* — chat\|confirm\|logo\|crm) | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-331 | CustomersController — /api/customers | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-332 | CrmController — /api/crm (public capability catalog) | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-413 | Admin category: Аналитика (admin_cat_analytics) | telegram-bot | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-414 | Admin category: Запустить рассылку вручную (admin_cat_jobs) | telegram-bot | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-415 | Admin category: Маркетинг и анонсы (admin_cat_marketing) | telegram-bot | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-416 | Admin category: Команда (admin_cat_team) | telegram-bot | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-417 | Admin category: Аудит и прочее (admin_cat_audit) | telegram-bot | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-490 | app-tenant.html — partial Capacitor surface (no custom Maya plugins) | native-shell | `RETIRE AFTER PARITY` | NAMED_SUCCESSOR - instance to be named |
| S-526 | Tab: Расписание (calendar) — operational journal | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-529 | Tab: Услуги (services) | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-542 | Journal: date paging control | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-543 | Journal: staff (provider) filter | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-544 | Journal: CRM-unavailable dead-end state | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-545 | Journal: generic error + retry state | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-547 | Deep link ?calendar_setup=1 (producers) | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-612 | app-tenant deep link ?promo=1 / ?promo=reset | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-613 | app-tenant deep links ?booking_backend / ?booking_api_base / ?booking_te | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-614 | app-tenant legacy VK return ?code | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-616 | maya-os-site deep links ?booking_backend / ?booking_api_base / ?booking_ | web-public | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-617 | maya-os-site deep links ?onboarded / ?calendar_setup / ?crm_connect / ?c | web-public | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-618 | maya-os-site deep links ?consent, ?promo, ?tips-equivalents, ?social_lin | web-public | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-621 | Edge relay route: /api/consent/submit (152-FZ + ст.18 ФЗ «О рекламе» wri | edge-relay | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-624 | Edge relay route: /api/client-link/consume | edge-relay | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-629 | api-proxy.php dispatch — set_visit_mood | edge-relay | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-644 | AConsentGate — RETIRED stub in salon app.html | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-645 | AConsentGate — LIVE legacy consent gate in app-tenant.html (white-label  | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-646 | AConsentGate — LIVE legacy consent gate in maya-os-site/index.html (Maya | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-654 | Telegram consent accept callbacks — RETIRED (no write) | telegram-bot | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-656 | Telegram /unsubscribe and /subscribe — redirect only | telegram-bot | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-657 | ai администратор/privacy.html — standalone policy document | web-public | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-659 | 404.html — error page | web-public | `KEEP AS CAPABILITY` | CAPABILITY_IN_CHAT - capability to be named |
| S-662 | offline.html — PWA offline fallback | web-public | `RETIRE FROM PRIMARY NAVIGATION` | CHAT_OR_ROUTE - successor to be named |
| S-667 | app-tenant.html — white-label tenant mirror (deployed as tenant-test.htm | pwa | `MERGE` | MERGE_TARGET - the surface it folds into, to be named |
| S-668 | vkid-sdk.js — orphaned VK ID SDK (policy violation) | web-public | `RETIRE FROM PRIMARY NAVIGATION` | CHAT_OR_ROUTE - successor to be named |
| S-709 | R09 permanent owner-boundary ratchet | public-community | `SETTINGS / SECURITY ONLY` | CLASS_S_DESTINATION - one of the five, to be named |
| S-725 | R09 frozen retirement contract (site_community / site_engagement bodies) | public-community | `SETTINGS / SECURITY ONLY` | CLASS_S_DESTINATION - one of the five, to be named |
| S-760 | app-tenant.html — stale legacy push subscription bundle | web-push | `RETIRE AFTER PARITY` | NAMED_SUCCESSOR - instance to be named |
| S-761 | maya-os-site/index.html — B24 push block (MAYA OS bundle) | web-push | `RETIRE AFTER PARITY` | NAMED_SUCCESSOR - instance to be named |

## 4. The 57 canonical-owner judgements

These are rows whose inventory entry names no capability, so the owner cannot be derived. Most
are out-of-scope or unreachable surfaces where the correct answer is likely *none* — but "likely"
is not a disposition, and K1's exit is a signature rather than an inference.

| # | surface | channel | class |
|---|---|---|---|
| S-451 | ABSENCE — no Telegram command menu registered | telegram-bot | `MOVE INTO CHAT WIDGET` |
| S-452 | ABSENCE — no /help for clients or masters | telegram-bot | `KEEP AS CAPABILITY` |
| S-453 | ABSENCE — no ConversationHandler anywhere | telegram-bot | `KEEP AS CAPABILITY` |
| S-454 | ABSENCE — client conversational AI removed from this channel | telegram-bot | `KEEP AS CAPABILITY` |
| S-455 | NATIVE SOURCE ABSENT — no *.swift/*.kt/*.java/*.pbxproj/AndroidManifest. | native-shell | `SECURITY/AUTHORITY ONLY` |
| S-481 | native-styles.css — companion stylesheet (ORPHANED) | native-shell | `RETIRE FROM PRIMARY NAVIGATION` |
| S-488 | TELEGRAM SDK ABSENT — telegram-web-app.js is never loaded by the bundle | telegram-miniapp | `SECURITY/AUTHORITY ONLY` |
| S-577 | «Нет данных» empty state for sessions | pwa | `MERGE` |
| S-612 | app-tenant deep link ?promo=1 / ?promo=reset | pwa | `MERGE` |
| S-618 | maya-os-site deep links ?consent, ?promo, ?tips-equivalents, ?social_lin | web-public | `MERGE` |
| S-628 | api-proxy.php dispatch — cabinet_link_phone / native_feedback / notify_p | edge-relay | `SECURITY/AUTHORITY ONLY` |
| S-629 | api-proxy.php dispatch — set_visit_mood | edge-relay | `MERGE` |
| S-634 | webhook_server set_visit_mood_handler | backend | `SECURITY/AUTHORITY ONLY` |
| S-644 | AConsentGate — RETIRED stub in salon app.html | pwa | `MERGE` |
| S-656 | Telegram /unsubscribe and /subscribe — redirect only | telegram-bot | `MERGE` |
| S-657 | ai администратор/privacy.html — standalone policy document | web-public | `MERGE` |
| S-659 | 404.html — error page | web-public | `KEEP AS CAPABILITY` |
| S-662 | offline.html — PWA offline fallback | web-public | `RETIRE FROM PRIMARY NAVIGATION` |
| S-668 | vkid-sdk.js — orphaned VK ID SDK (policy violation) | web-public | `RETIRE FROM PRIMARY NAVIGATION` |
| S-703 | Anonymous visitor identity cookie (me_visitor) + consent gateway | public-community | `SETTINGS / SECURITY ONLY` |
| S-704 | Guest-chat edge route mapping (site_guest_chat -> guest-chat) | guest-chat | `OUT OF SCOPE WITH EXACT REASON` |
| S-705 | ANONYMOUS GUEST CHAT WITH MAYA (module) | guest-chat | `KEEP AS CHAT SURFACE` |
| S-706 | POST /api/site/community/{action} — anonymous source initiator | public-community | `SETTINGS / SECURITY ONLY` |
| S-707 | Community engagement legacy owner (likes/views/comments/AI moderation/br | public-community | `LEGACY / UNREACHABLE` |
| S-708 | Canonical community source bridge (Python -> NestJS) | public-community | `SETTINGS / SECURITY ONLY` |
| S-709 | R09 permanent owner-boundary ratchet | public-community | `SETTINGS / SECURITY ONLY` |
| S-710 | POST /public-community/source — canonical anonymous source controller | public-community | `SETTINGS / SECURITY ONLY` |
| S-711 | Gateway verification service (source scope, no moderator authority) | public-community | `SETTINGS / SECURITY ONLY` |
| S-712 | PublicCommunityService.acceptComment — consent persistence + idempotent  | public-community | `SETTINGS / SECURITY ONLY` |
| S-713 | PublicCommunityService.observe — anonymous likes and daily views | public-community | `OUT OF SCOPE WITH EXACT REASON` |
| S-714 | GET/POST /public-community/moderation — human moderation + brand reply | public-community | `SETTINGS / SECURITY ONLY` |
| S-715 | Community text/author safety contract (PII, profanity, staff-impersonati | public-community | `SETTINGS / SECURITY ONLY` |
| S-716 | R09 schema foundation (PublicCommunityComment / PublicCommunityInteracti | public-community | `OUT OF SCOPE WITH EXACT REASON` |
| S-717 | 365-day payload retention purge (AC6 purge_public_community_payloads) | public-community | `OUT OF SCOPE WITH EXACT REASON` |
| S-718 | Public site community UI (deployed Next.js chunk) | public-community | `OUT OF SCOPE WITH EXACT REASON` |
| S-719 | PWA moderation queue «Обсуждения на сайте» | public-community | `KEEP AS FULLSCREEN SECONDARY` |
| S-720 | Beget api-proxy action dispatcher (7 community actions) | edge-relay | `OUT OF SCOPE WITH EXACT REASON` |
| S-721 | Site publications API (/api/site/posts, /api/site/posts/{slug}, /api/sit | public-community | `OUT OF SCOPE WITH EXACT REASON` |
| S-722 | site_publication_bot.py | public-community | `OUT OF SCOPE WITH EXACT REASON` |
| S-723 | Anonymous guest-chat front-end UI | guest-chat | `OUT OF SCOPE WITH EXACT REASON` |
| S-724 | webhook_server.py — community/guest route registration | public-community | `OUT OF SCOPE WITH EXACT REASON` |
| S-725 | R09 frozen retirement contract (site_community / site_engagement bodies) | public-community | `SETTINGS / SECURITY ONLY` |
| S-733 | SMS OTP delivery — send_sms / verify_sms (hard-fenced) | sms | `SETTINGS / SECURITY ONLY` |
| S-740 | Email OTP / magic-link delivery | email | `OUT OF SCOPE WITH EXACT REASON` |
| S-759 | 🔴 Legacy Python push senders — fail-closed stubs | web-push | `LEGACY / UNREACHABLE` |
| S-762 | native-enhancements.js — window.requestPushPermission (orphaned) | web-push | `LEGACY / UNREACHABLE` |
| S-766 | cron reactivation — 10:00 MSK (dormant-client winback) | scheduler | `OUT OF SCOPE WITH EXACT REASON` |
| S-769 | cron referral_resolver — 11:30 MSK | scheduler | `OUT OF SCOPE WITH EXACT REASON` |
| S-770 | cron subscriptions — 12:00 MSK (renewal nudge) | scheduler | `OUT OF SCOPE WITH EXACT REASON` |
| S-771 | cron loyalty — 12:30 MSK (earn + expiry) | scheduler | `OUT OF SCOPE WITH EXACT REASON` |
| S-772 | cron reviews — every 5 min (review request dispatch) | scheduler | `LEGACY / UNREACHABLE` |
| S-773 | cron lead_alerts — every 5 min (hanging_lead) | scheduler | `LEGACY / UNREACHABLE` |
| S-774 | cron dual_role_guard — every 3 h at :17 | scheduler | `LEGACY / UNREACHABLE` |
| S-776 | cron god_watch — 09:00 MSK | scheduler | `LEGACY / UNREACHABLE` |
| S-781 | loop client_retention_refresh_loop — retired | scheduler | `LEGACY / UNREACHABLE` |
| S-782 | loop maya_operating_rhythm_loop — retired | scheduler | `LEGACY / UNREACHABLE` |
| S-783 | loop reputation_monitor_loop — retired and unscheduled | scheduler | `LEGACY / UNREACHABLE` |

## 5. Primary navigation — 89 → 5

**The authorized figure of 34 reproduces from the data.** It is **pwa-scoped**, and that scope is
now stated on the row rather than carried implicitly:

```
PWA primary-nav entries             89
  removed by their own disposition  50   (RETIRE FROM PRIMARY NAV, MERGE, MOVE INTO CHAT WIDGET)
  still holding an entry            39
  target                             5
  RE-DISPOSITIONS NEEDED            34   <- the authorized number, reproduced
```

**And the number the owner should also see.** Across *every* Maya-owned channel the figure is
**41**, not 34, because 7 further entries live outside the pwa:

| # | surface | channel | class |
|---|---|---|---|
| S-348 | /start — native app login handshake + client handoff | telegram-bot | `SECURITY/AUTHORITY ONLY` |
| S-402 | Telegram Mini App menu button | telegram-miniapp | `KEEP AS CAPABILITY` |
| S-482 | Telegram Mini App entry point — bot chat menu button (WebAppInfo | telegram-miniapp | `KEEP AS CAPABILITY` |
| S-719 | PWA moderation queue «Обсуждения на сайте» | public-community | `KEEP AS FULLSCREEN SECONDARY` |
| S-726 | Public site cabinet — Telegram deep-link nonce handshake (applog | public-web-auth | `SETTINGS / SECURITY ONLY` |
| S-727 | Public site cabinet — Yandex ID OAuth (yandex_start / yandex_aut | public-web-auth | `SETTINGS / SECURITY ONLY` |
| S-728 | Public site cabinet — session-token resume (cabinet_session) | public-web-auth | `SETTINGS / SECURITY ONLY` |

The authorized 34 is correct for its scope and is not being revised. What is added is the scope
label and the seven rows it does not cover, so that G11's ratchet is read against a number whose
basis is written down.

### The five that survive

| | entry | why it is not a capability |
|---|---|---|
| **1** | **Maya** | the conversation itself; every capability is reached by asking |
| **2** | **Account** | who you are to this tenant - an identity surface, not a capability |
| **3** | **Connections** | which channels and providers are bound; a SOURCE_STATUS reconnect HANDOFFs here |
| **4** | **Privacy & Data** | the class-s destination for consent and erasure - the one place a consent decision can be made, because FR-6a forbids a widget from conferring it |
| **5** | **Notifications** | delivery preferences, re-read at delivery time rather than at compose time |

### The 39 re-dispositions

| # | surface | current class | proposed | why |
|---|---|---|---|---|
| S-001 | MEApp root router (screen registry) | `KEEP AS CAPABILITY` | `RETIRE FROM PRIMARY NAVIGATION` | the capability stays; only its launcher leaves. It is reached by asking, and a launcher for it is a nav entry the chat-f |
| S-002 | Login / entry | `SECURITY/AUTHORITY ONLY` | `RETIRE FROM PRIMARY NAVIGATION` | it has no UI to navigate to; the fence is server-side and the entry is vestigial. |
| S-022 | Booking flow (client self-booking) | `KEEP AS FULLSCREEN DETAIL` | `RETIRE FROM PRIMARY NAVIGATION` | the detail surface stays and is reached by a fullscreen_intent HANDOFF from the conversation; a nav entry duplicates tha |
| S-032 | SaaS Owner panel (ASaasOwnerPanel) | `KEEP AS FULLSCREEN DETAIL` | `RETIRE FROM PRIMARY NAVIGATION` | the detail surface stays and is reached by a fullscreen_intent HANDOFF from the conversation; a nav entry duplicates tha |
| S-041 | MAYA chat | `KEEP AS CAPABILITY` | `RETIRE FROM PRIMARY NAVIGATION` | the capability stays; only its launcher leaves. It is reached by asking, and a launcher for it is a nav entry the chat-f |
| S-072 | Root app shell / screen router (MEApp) | `KEEP AS CAPABILITY` | `RETIRE FROM PRIMARY NAVIGATION` | the capability stays; only its launcher leaves. It is reached by asking, and a launcher for it is a nav entry the chat-f |
| S-090 | Booking flow (ABookFlow) — 4 steps | `KEEP AS FULLSCREEN DETAIL` | `RETIRE FROM PRIMARY NAVIGATION` | the detail surface stays and is reached by a fullscreen_intent HANDOFF from the conversation; a nav entry duplicates tha |
| S-095 | Business panel — universal SaaS owner panel (ASaasOwnerPan | `KEEP AS FULLSCREEN DETAIL` | `RETIRE FROM PRIMARY NAVIGATION` | the detail surface stays and is reached by a fullscreen_intent HANDOFF from the conversation; a nav entry duplicates tha |
| S-101 | MAYA chat (AChat) — client / staff / owner surfaces | `KEEP AS CAPABILITY` | `RETIRE FROM PRIMARY NAVIGATION` | the capability stays; only its launcher leaves. It is reached by asking, and a launcher for it is a nav entry the chat-f |
| S-132 | Client cabinet (Личный кабинет) | `KEEP AS FULLSCREEN DETAIL` | `RETIRE FROM PRIMARY NAVIGATION` | the detail surface stays and is reached by a fullscreen_intent HANDOFF from the conversation; a nav entry duplicates tha |
| S-143 | Journal / schedule (ALiveSchedule) | `KEEP AS FULLSCREEN DETAIL` | `RETIRE FROM PRIMARY NAVIGATION` | the detail surface stays and is reached by a fullscreen_intent HANDOFF from the conversation; a nav entry duplicates tha |
| S-151 | Бренд (branding) | `KEEP AS FULLSCREEN DETAIL` | `RETIRE FROM PRIMARY NAVIGATION` | the detail surface stays and is reached by a fullscreen_intent HANDOFF from the conversation; a nav entry duplicates tha |
| S-153 | CRM (подключение + живая запись) | `KEEP AS FULLSCREEN DETAIL` | `RETIRE FROM PRIMARY NAVIGATION` | the detail surface stays and is reached by a fullscreen_intent HANDOFF from the conversation; a nav entry duplicates tha |
| S-154 | Подписка (billing, operator view) | `SECURITY/AUTHORITY ONLY` | `RETIRE FROM PRIMARY NAVIGATION` | it has no UI to navigate to; the fence is server-side and the entry is vestigial. |
| S-158 | Logout / session pipeline | `SECURITY/AUTHORITY ONLY` | `RETIRE FROM PRIMARY NAVIGATION` | it has no UI to navigate to; the fence is server-side and the entry is vestigial. |
| S-162 | Marketing top nav + auth CTAs | `KEEP AS CAPABILITY` | `RETIRE FROM PRIMARY NAVIGATION` | the capability stays; only its launcher leaves. It is reached by asking, and a launcher for it is a nav entry the chat-f |
| S-164 | Как работает (3 steps) | `KEEP AS CAPABILITY` | `RETIRE FROM PRIMARY NAVIGATION` | the capability stays; only its launcher leaves. It is reached by asking, and a launcher for it is a nav entry the chat-f |
| S-165 | Возможности (feature grid) | `KEEP AS CAPABILITY` | `RETIRE FROM PRIMARY NAVIGATION` | the capability stays; only its launcher leaves. It is reached by asking, and a launcher for it is a nav entry the chat-f |
| S-167 | Тарифы (pricing) | `KEEP AS CAPABILITY` | `RETIRE FROM PRIMARY NAVIGATION` | the capability stays; only its launcher leaves. It is reached by asking, and a launcher for it is a nav entry the chat-f |
| S-168 | FAQ | `KEEP AS CAPABILITY` | `RETIRE FROM PRIMARY NAVIGATION` | the capability stays; only its launcher leaves. It is reached by asking, and a launcher for it is a nav entry the chat-f |
| S-182 | PWA install / app-download section (#app) | `KEEP AS CAPABILITY` | `RETIRE FROM PRIMARY NAVIGATION` | the capability stays; only its launcher leaves. It is reached by asking, and a launcher for it is a nav entry the chat-f |
| S-187 | Service catalog + price list (#services / #price-list) | `KEEP AS CAPABILITY` | `RETIRE FROM PRIMARY NAVIGATION` | the capability stays; only its launcher leaves. It is reached by asking, and a launcher for it is a nav entry the chat-f |
| S-189 | Team tabs (Топ-мастер / Старший мастер) + mobile flip card | `KEEP AS CAPABILITY` | `RETIRE FROM PRIMARY NAVIGATION` | the capability stays; only its launcher leaves. It is reached by asking, and a launcher for it is a nav entry the chat-f |
| S-193 | Primary navigation (desktop) + mobile fullscreen nav overl | `KEEP AS CAPABILITY` | `RETIRE FROM PRIMARY NAVIGATION` | the capability stays; only its launcher leaves. It is reached by asking, and a launcher for it is a nav entry the chat-f |
| S-198 | MAYA OS SaaS marketing site | `KEEP AS CAPABILITY` | `RETIRE FROM PRIMARY NAVIGATION` | the capability stays; only its launcher leaves. It is reached by asking, and a launcher for it is a nav entry the chat-f |
| S-223 | Nav-bar / card → chat widget injectors (custom events) | `KEEP AS CAPABILITY` | `RETIRE FROM PRIMARY NAVIGATION` | the capability stays; only its launcher leaves. It is reached by asking, and a launcher for it is a nav entry the chat-f |
| S-275 | Chat composer microphone (push-to-talk → transcript) | `KEEP AS CAPABILITY` | `RETIRE FROM PRIMARY NAVIGATION` | the capability stays; only its launcher leaves. It is reached by asking, and a launcher for it is a nav entry the chat-f |
| S-493 | SaaS owner tab 2/9 — Аналитика (analytics) | `KEEP AS FULLSCREEN DETAIL` | `RETIRE FROM PRIMARY NAVIGATION` | the detail surface stays and is reached by a fullscreen_intent HANDOFF from the conversation; a nav entry duplicates tha |
| S-496 | SaaS owner tab 4/9 — Сотрудники (staff) | `KEEP AS FULLSCREEN DETAIL` | `RETIRE FROM PRIMARY NAVIGATION` | the detail surface stays and is reached by a fullscreen_intent HANDOFF from the conversation; a nav entry duplicates tha |
| S-499 | SaaS owner tab 6/9 — Клиенты (clients) | `KEEP AS FULLSCREEN DETAIL` | `RETIRE FROM PRIMARY NAVIGATION` | the detail surface stays and is reached by a fullscreen_intent HANDOFF from the conversation; a nav entry duplicates tha |
| S-505 | SaaS owner tab 8/9 — Интеграции (integrations) | `KEEP AS FULLSCREEN DETAIL` | `RETIRE FROM PRIMARY NAVIGATION` | the detail surface stays and is reached by a fullscreen_intent HANDOFF from the conversation; a nav entry duplicates tha |
| S-507 | SaaS owner tab 9/9 — Профиль (profile) | `KEEP AS FULLSCREEN DETAIL` | `RETIRE FROM PRIMARY NAVIGATION` | the detail surface stays and is reached by a fullscreen_intent HANDOFF from the conversation; a nav entry duplicates tha |
| S-509 | Live tab 1/10 — MAYA (os) → embedded GOD-OS | `SECURITY/AUTHORITY ONLY` | `RETIRE FROM PRIMARY NAVIGATION` | it has no UI to navigate to; the fence is server-side and the entry is vestigial. |
| S-512 | Live tab 4/10 — Отчёт (report) | `KEEP AS FULLSCREEN DETAIL` | `RETIRE FROM PRIMARY NAVIGATION` | the detail surface stays and is reached by a fullscreen_intent HANDOFF from the conversation; a nav entry duplicates tha |
| S-515 | Live tab 7/10 — Задачи (jobs) | `SECURITY/AUTHORITY ONLY` | `RETIRE FROM PRIMARY NAVIGATION` | it has no UI to navigate to; the fence is server-side and the entry is vestigial. |
| S-516 | Live tab 8/10 — Рассылка (broadcast) | `SECURITY/AUTHORITY ONLY` | `RETIRE FROM PRIMARY NAVIGATION` | it has no UI to navigate to; the fence is server-side and the entry is vestigial. |
| S-524 | Tab: Обзор (biz) — business overview | `KEEP AS FULLSCREEN DETAIL` | `RETIRE FROM PRIMARY NAVIGATION` | the detail surface stays and is reached by a fullscreen_intent HANDOFF from the conversation; a nav entry duplicates tha |
| S-530 | Tab: Расписание (schedule) — internal calendar editor | `KEEP AS FULLSCREEN DETAIL` | `RETIRE FROM PRIMARY NAVIGATION` | the detail surface stays and is reached by a fullscreen_intent HANDOFF from the conversation; a nav entry duplicates tha |
| S-531 | Tab: Сессии (profile) — devices & logout | `SECURITY/AUTHORITY ONLY` | `RETIRE FROM PRIMARY NAVIGATION` | it has no UI to navigate to; the fence is server-side and the entry is vestigial. |

Every one is `PENDING OWNER SIGNATURE`. **K1 proposes; it does not decide, and it deletes nothing.**

## 6. The capability-gap ledger — 30 keys

Every `GAP-` key the certified contract names, entered as a first-class row. **A missing mapping
is a GAP, and a GAP has no button** — none may be filled by inference, by name similarity, or by
a projector's choice at runtime.

Of these, **8 are the acts §0.21 residual 4 tracks**, and their owner state is the corrected
per-act finding rather than the earlier summary:

| gap key | act | owner state | evidence |
|---|---|---|---|
| `GAP-CONSENT-MKT-GRANT` | grant marketing consent | **registered_elsewhere** | the same call, kind marketing |
| `GAP-CONSENT-MKT-REVOKE` | revoke marketing consent | **registered_elsewhere** | the same call, kind marketing, granted false |
| `GAP-CONSENT-PD-GRANT` | record a 152-FZ base consent | **registered_elsewhere** | package5.wave3.record-client-consent.execute.v1, kind privacy, granted true |
| `GAP-CONSENT-PD-WITHDRAW` | withdraw a 152-FZ base consent | **registered_elsewhere** | the same call, granted false - granted:false IS the revocation |
| `GAP-CONSENT-REGISTER-EXPORT` | export the consent register | **none** | zero occurrences of any consent-register export under src |
| `GAP-HISTORY-ERASE` | erase conversation history as a data-subject right | **none** | the only erasure in the tree is a maintenance-run payload erasure, not a data-subject right |
| `GAP-IDENTITY-CLIENT-UNBIND` | unbind a client channel | **unreachable** | ClientChannelLinkService.revoke() has zero callers; its only transactional caller declares allowedSourceTypes legacy_bridge only |
| `GAP-IDENTITY-STAFF-UNBIND` | unbind a staff Telegram identity | **none** | binding exists at auth/social-auth.service.ts completeTelegramLink; no unbind of any kind exists |

**Three have no owner at all, one has an owner unreachable from the widget source type, and four
have a reachable registered owner under a different name.** That is the finding, and it is larger
in stake than "six of the eight have no owner" implied: the four consent acts are executable
today, so what is missing there is a *surface*, not a capability.

## 7. The mechanism-gap ledger — 32 rows

One row per prerequisite, `MG-P01` … `MG-P32`, from which **every build-status count is printed,
never transcribed**.

| status | rows |
|---|---:|
| `[ABSENT]` | 30 |
| `[PARTIAL]` | 1 |
| `[UNENFORCEABLE-TODAY]` | 1 |

**1 row is owned by no package**: `P-12` — `STEP_UP_VERIFIED` reachability, which
belongs to the authentication subsystem and is outside the approved sixteen. It is in the ledger
because a prerequisite nobody owns is the one most likely to be assumed.

## 8. The parity harness — 795 rows, **emitted RED**

```
GREEN ROWS: 0
RETIRABLE : 0
```

Six gates per row — `successorExists`, `parity`, `authority`, `accessibility`, `darkWindow`,
`deepLinkHandoff` — all **RED**. A row turns green only when its evidence exists: a passing test,
a recorded probe, a signed dossier. **The harness reads the evidence, never a checkbox, and no
package may mark its own row green.**

This is also what breaks the thirty-package plan's dependency cycle. K1 emits the harness red;
every later package turns its own rows green; K15 and K16 only *consume* green rows and produce
none. A consumer cannot be a dependency of its producers.

## 9. K1's exit

> **A signed human dossier**: every one of 795 rows has a class, a resolvable successor and a
> named owner, and the gap keys are entered with their evidence.

Mechanically complete: 795/795 rows, 13 classes, 0 unmatched, 30 capability gaps, 32 mechanism
gaps, 795 harness rows red. **126 rows await the signature** — 80 successors and 57 owners —
and that is the one exit in this plan a machine cannot certify, because *"is this the right
successor"* is a judgement.
