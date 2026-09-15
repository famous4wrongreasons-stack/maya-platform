# MAYA OS — Chat-first UX: решения владельца

Дата: 2026-09-15. Базовая линия: checkpoint `7f0ff81e`, C9 release `20260914-c9-wave4-7c9da983`.
Парный документ: [MAYA-CHAT-FIRST-UX-ARCHITECTURE.md](MAYA-CHAT-FIRST-UX-ARCHITECTURE.md).
Контракт: [MAYA-WIDGET-CONTRACT-V1.md](MAYA-WIDGET-CONTRACT-V1.md).

```text
OWNER UX DECISIONS PRESENTED: 12/12
OWNER UX DECISIONS APPROVED: 0/12
```

Ни одно решение не выполняется до отдельного approved implementation/cutover.
Изменений runtime/schema/migration в этом цикле: **0**. Production mutations: **0**.

## Закрыто утверждёнными принципами — не выносится на выбор

| Закрыто | Следствие |
|---|---|
| `CHAT IS THE PRIMARY MAYA OS UI` | Один корневой экран. Классическая primary navigation перестаёт быть целевой моделью. |
| `ROLE MODES ARE REMOVED FROM PRESENTATION` | Пользователь не выбирает режим. Открыт только вопрос, что сервер отдаёт вместо них (D1). |
| `BACKEND AUTHORITY ROLES REMAIN` | Membership, Client binding, Staff binding, entitlements, finance access, action authority, approvals — не трогаются. |
| `WIDGETS ARE CONTEXTUAL CAPABILITY SURFACES` | Виджет — поверхность представления, не владелец данных. |
| `CHAT-FIRST != CHAT-ONLY` | Fallback-редактор обязателен. Это **D3** — подтверждение, а не выбор. |
| `NATIVE/PWA SHARE ONE BUSINESS INTERACTION CONTRACT` | Отдельной native-архитектуры виджетов не создаётся (D-none: это факт, см. §9 архитектуры). |

## Ссылки на пакеты: P01–P30 — это прежний план

Таблицы влияния ниже ссылаются на пакеты как `P01`…`P30`. Это **прежний
30-пакетный план**. Он заменён набором из **16 пакетов `K1`…`K16` в 6 волнах**
(§14 архитектуры, полная таблица —
[`evidence/maya-chat-first-ux/section-packages-and-gate-v2.md`](evidence/maya-chat-first-ux/section-packages-and-gate-v2.md)).
Рассуждения в таблицах влияния остаются верными — менялась нарезка, а не работа.
Соответствие:

| Прежние | Теперь | Прежние | Теперь |
|---|---|---|---|
| P01, P02, P06, P16 | **K1** | P17, P18 (client) | **K8** |
| P03, P04, P05 | **K2** | P17, P18 (owner/staff), P25 | **K10** |
| P07, P08 | **K3** | P14 | **K11** |
| P12, P20 | **K4** | P22, P23, P26 | **K12** |
| P09, P10, P19 | **K5** | P24, P28 | **K13** |
| P11, P15 | **K6** | P13 | **K14** |
| P30 (booking) | **K7** | P27 | **K15** |
| P29 | растворён в K2 / K5 / G23 | P21 | **K16** |

Условия шлюза `G16`/`G17` прежней нумерации читаются как `G22`/`G24` в шлюзе из
24 условий.

## Двенадцать решений

Восемь из исходного списка; D9–D11 добавлены инвентаризацией; **D12 добавлено
сертификацией контракта** — оно про объём хранилищ и не может быть решено молча.

## D1 — Role modes on the wire

**QUESTION.** Owner/staff/client as application modes are abolished by the approved principles. The live question is what the server sends in their place: does the client receive ANY field describing who this person is in presentation terms?

**WHY.** The headline — 'should there be owner mode / staff mode / client mode' — is SETTLED BY CONSTRAINT ('ROLES DEFINE AUTHORITY, NOT APPLICATION MODES' + 'ONE MAYA — DIFFERENT AUTHORITY'), and security is untouched either way. What is NOT settled, and what two reasonable owners decide differently, is the residue: whether a non-actuating presentation hint survives. This is the exact seam through which modes regrew twice in this codebase already (app_access mode + 42 compat ternaries + window.__meRole globals), so it cannot be defaulted.

**OPTION A.** Delete the mode concept from the wire entirely. The client receives tenant, entitlements and the capability registry — nothing that names a persona. Landing STRUCTURE is identical for everyone; landing CONTENT differs because the greeting slot and the capability ordering are derived from entitlements, which already encode the difference (a master holds analytics.own.earnings, an owner holds analytics.tenant.revenue).

- *Gains:* There is nothing on the client to branch on, so modes cannot regrow. Ordering becomes data-driven rather than identity-driven. Deletes app_access.mode, the dead 'role' router key, 'choose' and 'access-compat' in one move. Kills the argument about who gets which screen, permanently.
- *Loses:* You give up the ability to hand-tune a landing experience per persona without expressing it as an entitlement. Some ordering that is obvious to a human ('masters care about today first') must be derived rather than declared, and the first version of that derivation will be slightly wrong.

**OPTION B.** Keep the app_access transport, delete the mode field, promote tenant_id — but add a server-authored presentation_mode hint that may only reorder and relabel, never enable (A1/A5 already forbid actuation).

- *Gains:* Landing content can be tuned per authority immediately and legibly, without deriving it. Cheapest path from today's code.
- *Loses:* Re-creates the branchable string. Every renderer will eventually branch on it; 'non-actuating' is a review convention, not a type. This codebase has produced 42 compat ternaries from exactly this affordance once already, and a second, divergent answer to 'who am I' that no test compares against the first.

**OPTION C.** Keep a user-visible capacity control — the identity-bar scope noun is tappable and switches owner/staff/client view.

- *Gains:* Familiar to anyone who used the current shell; zero re-learning for the owner who is also a client.
- *Loses:* Directly contradicts the approved principles: a user-chosen, persisted, globally-scoped interpretation IS an application mode. Recreates the three coexisting authority generations at the UX layer.

**RECOMMENDED: A.** A is the only option whose failure mode is 'ordering is briefly wrong' rather than 'modes come back'. Entitlements already carry every distinction ordering needs, so the hint in B buys convenience, not capability — and this repository is the empirical case against that convenience. A is also the reversible direction: adding a hint later is one field; removing branches once they exist is the 42-ternary cleanup you are already paying for.

| Impact | |
|---|---|
| **NATIVE** | Effectively zero native work, and this is worth saying plainly because 'delete the role concept' sounds like a cross-platform programme and is not. Both shells load the same web bundle over the same URL, so the change ships as a web deploy with no Capacitor rebuild, no TWA rebuild and no store release. The shell is already structurally barred from re-introducing the field: N7 states the shell supplies no authority, and `NativeBridgeManifest` is passed through the forbidden-key validator, so a shell build cannot declare a role, a session or a tenant. One concrete audit item: the 37 `AppIcon` call sites do tenant branding and must key off tenant/entitlement after `mode` is dropped — if any of them reads a persona field today, that is a call-site fix inside the bundle, not a plugin change. |
| **PWA** | This is where the entire cost sits. Option A deletes `app_access.mode`, the dead `role` router key, the `choose`/`access-compat` screens, the ~42 compat ternaries and the `window.__meRole` / `__meIsStaff` / `__meIsMaster` / `__meIsFounder` / `__panelInfo.permissions` generation — all of which live inside the source-less `app.html` bundle. Landing ordering and the greeting slot become derived from entitlements rather than declared per persona, which is the part that will be slightly wrong in its first version. The enforcement point is G7 in the completion gate: a bundle grep for each legacy global must return 0 hits across every shipped HTML, and the nav/router assertions in `scripts/verify-prepublication-contracts.mjs` hold it there. |
| **SECURITY / AUTHORITY** | Strictly a reduction in authority surface, not a change to it. Role is already re-derived server-side on every request — `jwt.strategy.validate` reads only `tenant_id` and `session_id` and calls `getActiveMembership`, ignoring the token's own `role` claim — so the client-side mode field is a second, uncompared answer to 'who am I' that grants nothing and can only drift. Deleting it removes the affordance that produced three coexisting authority generations. Important scope limit so this is not over-read: D1 concerns the identity transport, NOT the widget envelope's `presentation_mode`, which remains server-derived at emission (P12), fenced by A1 (may reorder, relabel, hide; may never enable), A5 (no intent's capability varies by mode) and A4, and property-tested in P04 to produce a byte-identical intent set across all four modes. Option B would re-create a client-visible branchable persona string, which `AUTH-INV-2` replay testing would then have to cover in every client-controllable position. |
| **MIGRATION** | No schema change and no C9 change. `JwtPayload` is untouched. The `app_access` transport, its fail-closed normalizer, the compat screen and the preview rule are all KEPT and renamed `active_context/1`; `mode` is dropped, `contexts[]` replaces `available_modes[]`, and `tenant_id` is promoted. `AUTH-INV-1` runs across both shapes during the overlap so the old and new transports are proven to agree before the old one is sealed. |
| **DEPENDENCIES** | Blocked by: nothing — executable in Wave 1. Blocks: D2 (a surviving persona field is exactly what would let a nav set or a work rail be chosen per persona, which is D2-C); D7 (a tenant switch is defensible only because role is NOT switchable — D7-C is D1's deleted mode wearing a persisted global scope); D6 (greeting ordering is derived from entitlements, so it has nothing to derive from until D1 lands); D10-Step-4 (app-tenant folds behind the server-owned `app_access` flag, which must be the cleaned transport). Package dependencies: P04 freezes the property test, P12 derives `presentation_mode`, P27 executes the legacy-global removal and G7 measures it. |
| **REVERSIBILITY** | A to B is cheap and additive (add one server-authored field). B to A is expensive once renderers branch on it. C to anything is a re-learning event for every user. Choose A precisely because it is the direction you can walk back from. |

---

## D2 — Primary-navigation shell size

**QUESTION.** How many primary-navigation destinations does the target shell have, and which?

**WHY.** This is explicitly flagged as un-derivable from the evidence: executing every assigned retirement takes primary nav from 112 to **92** — not to 49, which was an arithmetic error corrected in §3.3 of the architecture document — and the decision that takes 92 to a handful is a product adjudication, not a finding. Of the 112, **11 belong to `smm_bot`**, a separate production system, so Maya's own census is **101**. The design section derives four shell destinations from the NEVER_CHAT_ACTUATED list, but an owner may legitimately weigh discoverability and operator speed differently.

**OPTION A.** Five: one root (Maya) plus Account, Connections, Privacy & Data, Notifications. The tab bar is deleted as a control type, not re-skinned. These four are the handoff target set — the destinations where the eight NEVER_CHAT_ACTUATED acts terminate.

- *Gains:* The shell is derived, not designed: each destination exists because a class of act may never be chat-actuated and must land somewhere verified. That makes it defensible and closed — nobody can argue a sixth into it without first arguing a ninth never-chat-actuated act. 152-FZ obligations (consent register, erasure, withdrawal) get a stable, discoverable home, which matters for regulatory discoverability, not just UX.
- *Loses:* A staff member doing the same operation forty times a day must type, speak, or re-enter it through a widget rather than tap a tab. Real friction for high-frequency operators in the first weeks.

**OPTION B.** Two: one root plus a single consolidated 'Профиль и данные' sheet holding everything.

- *Gains:* Maximum purity; the smallest possible chrome; nothing to argue about.
- *Loses:* Buries consent withdrawal, the consent register and erasure two taps deep inside a mixed drawer. Under 152-FZ, discoverability of a withdrawal path is part of the obligation, not a nicety — and you already have two places promising a revocation that does not exist (D9). Also collapses four semantically different objects (identity, connections, data rights, delivery) into one undifferentiated list.

**OPTION C.** Five plus a small persistent work rail of high-frequency surfaces (Calendar for staff, Booking for clients).

- *Gains:* Keeps operators fast from day one; softens the transition for the people who use the product most.
- *Loses:* The rail's contents can only be chosen by persona — which is an application mode wearing a different hat, re-opening D1 by the back door. It is also the surface that will grow: a rail with two items becomes a rail with nine, and you are back to a tab bar under another name.

**RECOMMENDED: A.** A is the only option produced by a rule rather than by taste, which is what makes it stable under pressure — the count cannot drift without someone first changing the never-chat-actuated list. The operator-speed cost that C tries to buy off should be paid inside the conversation instead (recent intents, a composed-utterance index per D4), where it stays authority-neutral and cannot regrow into modes.

| Impact | |
|---|---|
| **NATIVE** | No shell or plugin work and no store release: the shell chrome is web, and neither the Capacitor shell nor the TWA contributes navigation. The native-facing consequence is the route-key namespace. The four destinations (`shell.account`, `shell.connections`, `shell.privacy`, `shell.notifications`) become targets for the three registered custom schemes (`mayaos`, `ru.mayaos.app`, `pro.malesthetic.app`) and for push NAVIGATE actions, and per N8/N9 the `appUrlOpen` handler extracts only `{route_key, opaque_handle}` and resolves the destination server-side — it must not read a staff id, record id, tenant slug or price from the URL. [NON-NORMATIVE] Name these four once: a route key that has shipped inside a store-released shell or a push payload cannot be withdrawn unilaterally, and per the migration map query parameters and deep links are sealed last for exactly this reason. |
| **PWA** | The tab bar is deleted as a control type rather than re-skinned, taking primary navigation from 112 surfaces (101 that Maya owns) to **92** via the 63 assigned retirements and then to 5 — reaching 5 requires re-dispositioning 34 further rows in K1's dossier, which is a named forcing function rather than a number that arrives on its own. The honest cost is operator speed: a staff member repeating one operation forty times a day loses the one-tap path and must type, speak or re-enter through a widget. The count is held by the nav ratchet added to `scripts/verify-prepublication-contracts.mjs` and measured at G11 (in-scope primary-nav count ≤ the owner-adjudicated number, recommended 5, and zero survivors lacking a written justification). Adding a sixth destination is a contract-level change reviewed like a schema change — that is the mechanism that keeps 5 from drifting to 9. |
| **SECURITY / AUTHORITY** | The destination set is derived from the eight NEVER_CHAT_ACTUATED acts, which is what makes it defensible: the count cannot move without first moving that list. Privacy & Data is the terminal surface for five of the eight capability gaps (`GAP-CONSENT-MKT-CHANGE`, `GAP-CONSENT-PD-WITHDRAW`, `GAP-CONSENT-REGISTER-EXPORT`, `GAP-HISTORY-ERASE`, with `GAP-IDENTITY-TG-UNBIND` in Connections) and carries `SESSION_VERIFIED` with `STEP_UP_VERIFIED` on withdrawal and register export. Under 152-FZ the discoverability of a withdrawal path is part of the obligation, which is the specific argument against option B burying it two taps into a mixed drawer. P20 enforces that each NEVER_CHAT_ACTUATED key has HANDOFF as its only legal intent AND independently declares its required verification rung, so a stale destination list still fails closed at the ladder. |
| **MIGRATION** | Executed by P21 (the 63 retirements) with route keys registered by P19. Each retired entry point walks the ledger state machine — PARITY_PROVEN → ENTRY_POINT_DARK (14 days, route still resolves and logs every hit) → ROUTE_SEALED (30 days; 45 days for any capability touching period close, so two month-end closes fall inside the window) → DELETED — with a one-step rollback at every transition that requires no deploy of the successor. Ordering constraint: no row darkens while another row's `parity_proven_by` names it, and P20 must land before P22 so the consent surfaces are fenced as HANDOFF-only before their canonical owners exist. |
| **DEPENDENCIES** | Blocked by: D1 (a persona field would permit the per-persona work rail of option C); D3 (destinations may exist at all only because chat-only is excluded); D4 (without the capability index, 201 capabilities have no entry point and nav pressure returns immediately — D2-A paired with D4-A is the weakest combination in the set). Blocks: D6 (the greeting's off-switch is specified to live in Notifications, which must therefore exist); D9's permanent home (the interim lane may land in the old shell, but P22's surface is Privacy & Data). Package dependencies: P19, P20, P21, P22; gate G11. |
| **REVERSIBILITY** | Adding a destination later is cheap and additive. Removing one after operators have learned it is expensive in trust and support load. Start at five; a sixth is a decision you can still make, a sixth you later delete is one you cannot un-make cleanly. |

---

## D3 — Chat-first vs chat-only

> **SETTLED BY ARCHITECTURAL CONSTRAINT.** Варианты не предлагаются: только один совместим с утверждёнными принципами.

**QUESTION.** Chat-first or chat-only?

**WHY.** SETTLED BY CONSTRAINT — this is not an owner decision and should not consume owner attention. The hard constraint states it directly: 'CHAT-FIRST != CHAT-ONLY: a fallback editor must exist for audit, exact configuration, accessibility and correction.' It is reinforced structurally: the widget contract's NEVER_CHAT_ACTUATED list (8 acts) can only terminate on a non-chat surface, 76 surfaces are dispositioned KEEP AS FULLSCREEN DETAIL, and the A11yFloor plus exact-configuration cases have no chat-only expression. Chat-only is not a product position available to you; it fails the gate. Recorded here for confirmation only. The live version of this question is D4.

**OPTION A.** Chat-first, with a mandatory non-chat fallback for audit, exact configuration, accessibility and correction. Confirm only.

- *Gains:* Chat is the primary interface and the default answer to 'where do I do X', while the acts that must never be actuated by channel identity alone keep a verified home.
- *Loses:* Nothing that was available. Chat-only was never reachable under the constraints.

**RECOMMENDED: A.** Only one option is compatible with the hard constraints. Presenting alternatives would be manufacturing a choice.

| Impact | |
|---|---|
| **NATIVE** | SETTLED BY ARCHITECTURAL CONSTRAINT. No native cost either way: the fallback editor is the same web bundle rendered in the same shells, so there is no plugin, no shell version floor and no store release attached to this decision. [NON-NORMATIVE] One native fact reinforces the constraint rather than adding to it — the repository already carries a comment recording that `MediaRecorder` failed in iOS WKWebView, and V9 therefore makes voice-off the default rather than a degradation. A chat-only product would be unusable on a shell that has already failed this way once. |
| **PWA** | No incremental cost, because the fullscreen surfaces exist regardless of how this is answered: 76 surfaces are dispositioned KEEP AS FULLSCREEN DETAIL and P19 re-expresses the seven self-mounting overlays (currently creating their own DOM hosts at `zIndex 2147483000` on a query-parameter match) as route keys inside the app tree, the back-stack and the theme. What this decision does cost is the discipline of maintaining two expressions of the same capability — the widget and its `editor_handoff_intent` — for the acts that need exact configuration, audit or correction. |
| **SECURITY / AUTHORITY** | This is why it is settled rather than chosen. The eight NEVER_CHAT_ACTUATED acts can only terminate on a surface that can require `SESSION_VERIFIED` or `STEP_UP_VERIFIED`; chat-only would place consent, finance and identity controls behind channel identity alone, which the fundamental rule CHANNEL IDENTITY != BUSINESS AUTHORITY forbids outright. The exclusion is enforced, not merely asserted: P20 requires every NEVER_CHAT_ACTUATED key to declare its verification rung independently of the list, and `degrade()` step 2 withholds every intent whose capability is in that list on every channel. |
| **MIGRATION** | Adds no package of its own; it constrains every other package instead. Its practical migration content is that no surface may be deleted on the argument that chat replaces it — INV-16 and P30 require a named successor and a passing parity test for each deletion, and 'the user can just ask Maya' is not a successor. [NON-NORMATIVE] The owner-facing cost of this settled answer is therefore ongoing rather than one-off: two expressions maintained per capability, forever. |
| **DEPENDENCIES** | Blocked by: nothing. Blocks: D4 entirely (the question of how a fullscreen view is entered exists only because fullscreen views exist) and D2 (the shell destinations are the terminal surfaces this constraint requires). Cannot be revisited later: attempting chat-only would fail the capability-parity gate, the A11yFloor and P29's WCAG 2.2 AA certification, and would strand the eight NEVER_CHAT_ACTUATED acts with no legal terminus. |
| **REVERSIBILITY** | Not applicable — constraint-fixed. Attempting chat-only later would fail the capability-parity gate and the accessibility floor. |

---

## D4 — Fullscreen entry and capability discovery

**QUESTION.** How is a fullscreen secondary view entered — and does a capability directory exist?

**WHY.** The existence of fullscreen views is settled (D3). How you REACH them is not, and it decides whether the product is chat-first or an app with a chat tab. It also decides the fate of the 201 KEEP AS CAPABILITY surfaces, which by construction have no nav entry: if a user does not know a capability exists, they cannot ask for it, and no evidence in the inventory settles how they are meant to find out.

**OPTION A.** Conversation-anchored only. Fullscreen is reachable exclusively via a widget's presentation.fullscreen_detail.route_key, a NAVIGATE/HANDOFF intent, or a deep link that resolves a widget first. No chrome entry of any kind.

- *Gains:* Purest expression of the principle; every fullscreen view has a conversational antecedent, so the back-stack, the authority snapshot and the audit trail are always coherent. Impossible to accumulate a launcher.
- *Loses:* Genuine discoverability failure for 201 capabilities with no nav entry. Users will conclude features were removed when they were only made conversational — which is exactly the complaint that kills migrations like this one.

**OPTION B.** Conversation-anchored, plus an authority-filtered capability index in the shell sheet that does NOT render capabilities — it composes an utterance into the composer (or mints a REFINE/NAVIGATE intent), so the user always lands back in the conversation.

- *Gains:* Solves discoverability without creating a launcher: the index is a phrasebook, not a destination. It teaches users how to ask, so its own usage should decline over time — a measurable success signal. Stays authority-neutral (one flat list, filtered only by entitlement, identical shape for everyone, so it does not re-introduce modes).
- *Loses:* It is chrome-entry navigation, and it will be under permanent pressure to start rendering results directly. Requires an enforced rule ('the index never renders a capability') that a future contributor can break.

**OPTION C.** Fullscreen views become independently addressable destinations with their own URLs, back-stack and launcher, openable from anywhere.

- *Gains:* Fast for power users; deep links, push targets and native shortcuts become trivial.
- *Loses:* Makes fullscreen a peer of chat rather than a detail of it — the product slides back to an app with a chat tab. Breaks the 'deep link resolves a widget first' property that keeps authority and back-stack coherent, and makes the URL surface a public contract you cannot later withdraw (native shells and push payloads in the field).

**RECOMMENDED: B.** A is right in principle and wrong in practice: 201 capabilities with no entry point is not minimalism, it is a discoverability cliff, and the first month of support load will force something like B anyway — better to design it than to bolt it on. B keeps the principle intact by construction, because an index that can only compose an utterance is structurally incapable of becoming a tab bar. C is the failure mode this whole cycle exists to escape.

| Impact | |
|---|---|
| **NATIVE** | Deep links are the native-facing half of this decision, and option C is the only genuinely irreversible native consequence in the whole decision set. All three bundles already register an `App.addListener('appUrlOpen')` handler across three custom schemes, so route keys reach shipped Capacitor and TWA builds and push payloads; once there, they are a contract you cannot recall on your own schedule, because the shells are store artefacts with independent release cadence. Under the recommended B, the handler stays dumb by design: N8 restricts it to extracting `{route_key, opaque_handle}` and N9 requires the link to resolve to an envelope server-side, landing in the router and never in an overlay. This also retires a live defect — today's service worker computes `'/app/?tips=' + encodeURIComponent(d.master)`, a sender-chosen URL carrying a staff identifier in a query parameter that mounts one of the seven overlays. [NON-NORMATIVE] That correction is specified this cycle and not implemented this cycle. |
| **PWA** | The capability index is a sheet in the shell, not a destination, and its entire behaviour is to compose an utterance into the composer or mint a REFINE/NAVIGATE intent so the user lands back in the conversation. The rule 'the index never renders a capability' should be made structural rather than conventional: give the index no access to the widget emission service, so it is incapable of rendering a result rather than merely forbidden from doing so — otherwise the guarantee rests on review discipline that a future contributor can break, which is the loss option B openly declares. It solves the discoverability cliff that D4-A leaves for the 201 KEEP AS CAPABILITY surfaces, which by construction have no nav entry. |
| **SECURITY / AUTHORITY** | Low, provided one property holds: the index is filtered by entitlement only, presents one flat list with an identical shape for every principal, and therefore carries no persona distinction that could re-introduce modes. Entitlement filtering is presentation and must not be the only gate — the capability is still checked at intent time by the IntentGateway against the server-derived authority, so a leaked or stale index entry yields a refusal, not an action. NEVER_CHAT_ACTUATED capabilities appear in the index as HANDOFF only, and the six gaps that have no canonical owner carry a `Limitation` with a `capability_gap_ref` and no intent at all, so the index cannot promise a capability that does not exist — which is the `/unsubscribe` defect reproduced in a new place. |
| **MIGRATION** | Makes P16's 201 capabilities discoverable without building UI for them, and depends on P19's `route_key` registry for every fullscreen target. [NON-NORMATIVE] The index's own usage should decline over time as users learn to ask directly — that is the intended success signal, and it is measurable. Migration-order note: route keys that have entered push payloads and native shells seal last in the ledger (§4.2 of the migration map), so choosing C now would push the most irreversible rows to the front of the programme. |
| **DEPENDENCIES** | Blocked by: D3 (fullscreen views exist) and D2 (the index lives in a shell sheet, so a shell must exist). Blocks: D2's operator-speed objection — the work rail of D2-C is unnecessary if B ships, and paying operator speed inside the conversation is what keeps it authority-neutral; also D6-A's viability, since a blank composer plus no index is the worst landing surface in the set. Interacts with D11: Telegram's help is generated from the intent router rather than hand-written per channel (I4), which is the same phrasebook mechanism and should share one source. Package dependencies: P16, P19, P21. |
| **REVERSIBILITY** | Adding the index later is easy; removing it after adoption is medium. Going to C and back is the expensive one — once route keys are public contracts in native shells, push payloads and deep links, you cannot withdraw them unilaterally. |

---

## D5 — Widget persistence in scrollback

**QUESTION.** What does a widget look like when the user scrolls back to it a week later?

**WHY.** Cannot be defaulted, because the two obvious answers have opposite safety properties. C9 evidence handles resolve only inside one invocation (an in-memory Map), and intent tokens expire — so a persisted widget is already, factually, an artefact rather than a live view. Meanwhile the client-preview PII fence is enforced in five independent places, all at fetch/render time. Re-hydration on scroll would re-open all five under a possibly-changed authority.

**OPTION A.** Frozen receipt. The widget persists with its data as-of timestamp; expired intents render as a quiet terminal line (SUBMITTED / CONFIRMED / NOT CONFIRMED), not as dead buttons; a single REFINE intent re-reads on demand. Requires the owner to state a retention window for the timeline, and to keep approval receipts in a separate immutable store that survives conversation erasure.

- *Gains:* Makes the audit story true: 'this is exactly what Maya showed me when I approved that.' Matches reality (handles are audit labels, not links). No background fetch storm, no stale-authority leak, and conversation erasure can delete the timeline without corrupting canonical records — which is what makes the erasure gap buildable at all.
- *Loses:* Scrolled-back numbers are stale and the user must tap to refresh. Requires a deliberate retention decision you would otherwise defer, and a second store for receipts.

**OPTION B.** Live rehydration — scrolled-back widgets re-fetch on view and show current data.

- *Gains:* Always-correct numbers; the history doubles as a dashboard; feels modern.
- *Loses:* Actively unsafe here. A widget rendered under one authority snapshot silently re-renders under another, and PII can surface in scrollback for a principal whose client binding has since been downgraded — re-opening all five preview fences. It also destroys the audit artefact: you can no longer prove what was on screen at approval time.

**OPTION C.** Collapse to text — after the conversation moves on, the widget reduces to its text_equivalent prose plus a re-run affordance; the rich rendering is not retained.

- *Gains:* Cheapest storage; the text_equivalent is already server-minted and hash-covered, so the record is genuinely canonical.
- *Loses:* Loses the visual artefact users reason about ('the chart with the dip'), and makes scrollback feel like the product forgot. The audit record survives but the human record does not.

**RECOMMENDED: A.** A is the only option consistent with the constraint that conversation history is a presentation surface and never business state — it makes history legible, deletable and provable at the same time. B is the one to actively rule out in writing, because it is the intuitive default a future contributor will implement unless told not to. Note the coupling A forces you to face now rather than later: timeline retention and approval-receipt retention are different numbers with different owners (product vs 152-FZ), and the architecture must know both before Wave 2.

| Impact | |
|---|---|
| **NATIVE** | No shell or plugin work; history renders from the same web bundle on both shells. There is one shell-shaped benefit worth naming: a frozen widget performs no fetch on view, so a Capacitor shell resuming from background does not produce a re-fetch storm and does not silently re-render a scrolled-back widget under an authority that changed while the app was suspended. Under option B, backgrounded-then-resumed native sessions would be the most likely place for a stale-authority PII exposure to surface first, precisely because the gap between render and re-render is longest there. |
| **PWA** | Concretely: when `resolution.state` leaves `open`, the envelope collapses to `historised_form: 'summary_bubble'` — the `text_equivalent.headline` plus the resolution state — and after `retention_sec` the body is dropped, leaving `{widget_id, kind, resolved_summary_text, action_receipt_ref[]}`. Each renderer verifies `seal_key_version`, `envelope_seal` over a recomputed `body_hash` and `expires_at`; on mismatch or expiry it renders the frozen text equivalent with a single REFINE intent, so an expired intent becomes a quiet terminal line rather than a dead button. This is also why the text equivalent is mandatory rather than an accessibility nicety — it is the archival form, so a weak summary degrades into unreadable history, which is a visible and self-correcting failure. |
| **SECURITY / AUTHORITY** | The largest authority surface of the eleven, and partially constraint-bounded: option B is excluded rather than merely disfavoured, because re-fetching on scroll re-opens all five client-preview PII enforcement points plus the A4 emission-time fence under a possibly-changed authority snapshot, and because the constraint 'conversation history is never business/consent/booking state' cannot survive a history that reads live business data. The live choice is A versus C. A is what makes the approval artefact provable — `integrity.approval_binding_echo` is re-derived server-side and never accepted as input, so 'this is exactly what Maya showed me when I approved that' is a checkable claim. The non-negotiable structural requirement under A is that approval receipts live in a store that survives conversation erasure; otherwise exercising the erasure right (P26) corrupts the audit trail it is supposed to leave intact. |
| **MIGRATION** | The storage shapes ARE the migration, and they are the irreversible part. `retention_sec` per kind and the timeline/receipt split must be settled before P07 lands the `WidgetIntentRecord` store and before P26 builds erasure. INV-15 — no foreign key from any business table onto `widget_id` or a message id — is what makes erasure buildable at all, and it must hold from the first migration rather than be retrofitted. Retrofitting a retention split after conversations exist is a migration over data that may by then be subject to an erasure request, which is the one class of migration you cannot simply schedule. |
| **DEPENDENCIES** | Blocked by: nothing. Blocks: P07 (store shape), P14 (approval receipt), P26 (erasure is only correct if no business object referenced a message id), and G17's deletion-under-parity evidence. Tightly coupled to D7 — thread-per-tenant is the same class of storage-shape decision and retention is scoped per thread, so deciding D5's numbers without D7's answer will produce a second migration. Coupled to D9: P22's consent register export must be complete for an arbitrary date range with per-record provenance, which the receipt store, not the timeline, has to guarantee. The owner must supply two different numbers with two different owners here — timeline retention (product) and receipt retention (152-FZ). |
| **REVERSIBILITY** | The freeze/rehydrate behaviour itself is a policy flip and highly reversible. The retention window and the receipt-store split are NOT — they are storage shapes, and changing them later is a migration over data you may by then be legally obliged to have deleted. Decide the numbers with this decision, not after. |

---

## D6 — Proactive greeting on open

**QUESTION.** Does Maya say anything when the user opens the app, and how much?

**WHY.** The ceiling is constrained (a greeting may present already-authorized information; it may never autonomously initiate new business strategy — that is C10). The floor is not. And the floor is the single biggest UX risk in the whole migration: an empty composer is a worse home screen than a tab bar, so if the greeting is wrong, chat-first fails on first impression regardless of how good the architecture is.

**OPTION A.** Silent. No greeting. One line of state, an empty composer; the user always initiates.

- *Gains:* Zero risk of nagging, zero consent questions, zero cost. Absolutely honest: the product never claims to know something it does not.
- *Loses:* Removes the reason chat-first is better than the tab bar it replaced. The user arrives at a blank prompt with 201 capabilities they cannot see and no hint what to ask — the worst possible pairing with D4-A, and a weak pairing even with D4-B.

**OPTION B.** One slot, at most once per session, at the head of the timeline, never pinned, never containing a COMMIT intent — showing only information a canonical owner already produced and already authorized for this principal. Explicitly permitted to render NOTHING when its sources are UNKNOWN, rather than rendering an error. User-switchable off, in the Notifications shell destination.

- *Gains:* Gives the landing surface a reason to exist and demonstrates the value proposition in the first two seconds. Stays inside the C10 fence by construction (present, never initiate). 'Never pinned' keeps the timeline chronological, deletable and consistent with D5. The off-switch has a home that already exists.
- *Loses:* A user who wants a quiet app gets something they did not ask for until they turn it off. Requires real discipline on the UNKNOWN path — a greeting that says 'не удалось загрузить' every morning would do more damage than no greeting at all.

**OPTION C.** Persistent pinned briefing that updates through the day and can surface the 12 canonical proactive outbound moments inline.

- *Gains:* Maximum operational value for an owner who wants a morning dashboard; the briefing becomes the reason to open the app.
- *Loses:* A pinned digest is chrome. Chrome that shows business data is a dashboard, and a dashboard is a mode — D1 and D2 reopen immediately. It also collides with the 12 outbound moments, which have their own consent ledger and audience maths; mirroring them into an in-app pin creates a second delivery path with no consent accounting.

**RECOMMENDED: B.** B is the smallest thing that makes the landing surface worth landing on, and the 'never pinned / may render nothing / no COMMIT' triple is what keeps it from growing into C. The UNKNOWN rule is the part to hold the line on: the constraint that UNKNOWN must never be rendered as failure is most often violated exactly here, on the one surface every user sees every day.

| Impact | |
|---|---|
| **NATIVE** | No shell or plugin work and no store release. The native relevance is delivery collision: the greeting renders the same 12 canonical proactive moments that also travel over web push and replay through the Telegram staff mirror, and on an installed shell a user can plausibly hold all three. The mechanism that prevents triple delivery is the `dedupe_key` plus `once_per` applied across push, chat and the mirror at emission, measured at G16 (12/12 moments emitting through `Origin` with a dedupe key, and zero duplicate deliveries observed across the three paths over 14 days). Note the asymmetry that makes the in-app slot worth having: the web-push tier is ANNOUNCEMENT with 0–2 actions and a NAVIGATE ceiling, and `Notification.maxActions` is read at runtime and defaults to 0, so the richer form of a moment can only land in the app. |
| **PWA** | One slot, at most once per session, at the head of the timeline, never pinned, never carrying a COMMIT — and explicitly permitted to render nothing. 'Nothing' means nothing: not a placeholder, not 'no news', not a greeting card with the user's name in it, because filling an empty slot is the first step toward autonomy nobody approved. Quiet hours are applied before emission rather than at render, so a suppressed greeting never reaches the client to be hidden. The off-switch lives in the Notifications destination, which already exists under D2-A. |
| **SECURITY / AUTHORITY** | Bounded by construction rather than by instruction. `authority_basis` has exactly one legal value, `pre_authorized_presentation`, and the validator rejects any other; the greeting composer is denied the DRAFT, REQUEST_APPROVAL and COMMIT effect classes at emission time, and `moment` must be one of the closed set of 12. That is what keeps the C10 fence — may present what is already true, may never decide what should be done — true mechanically. The failure mode to hold the line on is the UNKNOWN rule: this is the one surface every user sees every day, so it is statistically the most likely place for UNKNOWN to be rendered as failure, and a greeting reading 'не удалось загрузить' every morning would do more damage than no greeting. |
| **MIGRATION** | Purely additive; no ledger row retires because of the greeting. It rides P08's read-only projectors and P14's PROGRESS binding, and it is gated by G16. [NON-NORMATIVE] Option C is the migration risk, not option B: a pinned briefing that shows business data is chrome that is a dashboard that is a mode, which re-opens D1 and D2 after they have been executed — the most expensive possible time. |
| **DEPENDENCIES** | Blocked by: D2 (needs the Notifications destination to host its off-switch and push-permission repair); D1 (its content and ordering derive from entitlements, so there is nothing to derive from until the persona field is gone); D4 (pairs badly with D4-A — an empty composer, no index and no greeting is three absences on the one screen that has to justify the whole migration). Blocks: nothing structural. Package dependencies: P08, P11, P14; gate G16. [NON-NORMATIVE] This is the cheapest of the eleven to change later — one slot behind one flag — and should absorb the least deliberation now. |
| **REVERSIBILITY** | Very high — one slot behind one flag, and the off-switch already has a home. This is the cheapest of the eleven decisions to change later, so it should not absorb much deliberation now. |

---

## D7 — Multi-tenant context switching

**QUESTION.** How does a person who holds more than one membership — or who is both an owner and a client of the same salon — change what Maya is talking about?

**WHY.** Tenant is a hard boundary in the data model (Membership unique on userId+tenantId, tenant-scoped row visibility, tenant_id in the JWT payload), so how it is surfaced is an architectural commitment, not a UI preference. It is also genuinely contested by the product's own stage: MAYA today is effectively one salon, where the cheap answer suffices; the SaaS direction makes it insufficient. Two reasonable owners split on whether to build for today or for the direction.

**OPTION A.** No switcher. The identity-bar scope noun is a read-only label. Ambiguity is resolved by a CHOICE widget in the conversation, per request, and only when the request is genuinely ambiguous ('сколько я заработал' vs 'запиши меня на стрижку').

- *Gains:* Cheapest and sufficient for a single-salon product. No persisted context to get wrong, no thread model to decide. Most requests are unambiguous, so the widget rarely appears.
- *Loses:* Breaks the moment a real person holds two memberships: every request becomes ambiguous, the CHOICE widget becomes constant friction, and conversation history mixes data from two tenants — which is a problem you then have to unpick under 152-FZ when one tenant asks for erasure.

**OPTION B.** Explicit TENANT switch, no role switch. The scope noun is tappable and switches tenant (re-resolving membership server-side), with a separate conversation thread per tenant. Within a tenant, owner-vs-client capacity stays resolved per-request by CHOICE, exactly as in A.

- *Gains:* Honest about the one boundary that is actually hard in the data model, while refusing the one that is not (role is re-derived from membership every request; a role switcher would be theatre). Thread-per-tenant keeps history, retention and erasure cleanly separable — which D5 and the erasure gap both depend on. Ready for SaaS without a later migration.
- *Loses:* More to build now for a benefit that is largely latent at one salon. Thread-per-tenant means a user with two memberships has two histories and cannot ask a question spanning both — correct, but it will be reported as a bug.

**OPTION C.** Sticky context — the last chosen scope persists across sessions and applies until changed.

- *Gains:* Fewest taps for a habitual user; feels 'remembered'.
- *Loses:* A persisted, user-chosen, globally-scoped interpretation is the precise definition of the application mode being deleted in D1. It also produces the worst class of incident in this domain: an owner acting for hours inside the wrong tenant without noticing.

**RECOMMENDED: B.** The tenant boundary is real in the schema and the capacity boundary is not, so B is the option whose UI matches the data model rather than flattering it. Decide it in THIS cycle even though it looks premature: thread-per-tenant is a storage shape, and retrofitting it after conversations exist is a migration over data that may by then be subject to erasure requests. This is the one place where the cheap answer is genuinely expensive later.

| Impact | |
|---|---|
| **NATIVE** | No shell or plugin change; the switch is web UI. The native-visible consequence is which thread a notification opens. A push or custom-scheme link must re-resolve its tenant server-side rather than re-interpret it on the client, because the `IntentRecord` is minted with a `tenant_id` and a cross-tenant token is refused by the IntentGateway with the same latency profile as a valid one. Per-tenant notification routing also means the Notifications destination gains a tenant dimension, which changes what an installed shell receives but remains a route-table and preference concern, not a shell one. |
| **PWA** | The identity-bar scope noun becomes tappable and switches tenant, with a separate conversation thread per tenant; within a tenant, owner-versus-client capacity stays resolved per request by a CHOICE widget. [NON-NORMATIVE] The predictable support consequence of thread-per-tenant is that a user holding two memberships gets two histories and cannot ask one question spanning both — correct behaviour that will be reported as a bug, and worth pre-empting in copy. |
| **SECURITY / AUTHORITY** | This option set is chosen to match the data model rather than flatter it. Tenant is a genuinely hard boundary — Membership is unique on `userId + tenantId`, row visibility is tenant-scoped, and `tenant_id` is in the JWT payload — whereas role is re-derived from membership on every request, so a role switcher would be theatre with an authority-shaped label. Option C is the dangerous one: a persisted, user-chosen, globally-scoped interpretation is the exact definition of the application mode D1 deletes, and it produces this domain's worst incident class, an owner acting for hours inside the wrong tenant without noticing. One property makes B safe rather than merely careful: the original intent token is not reusable across contexts, because it was minted with a `tenant_id` — answering in a different context mints a NEW intent and forces the fresh canonical read that handles-as-nouns already requires, so cross-context reuse is not expressible rather than merely forbidden. |
| **MIGRATION** | No schema change: `JwtPayload` is untouched and `tenant_id` is already promoted by D1's `active_context/1` work, so the transport cost is paid once across both decisions. Thread-per-tenant, however, is a storage shape — A→B is a data migration over conversations that already exist, and it gets worse every month, while B→A is trivial. That asymmetry is the whole argument for deciding it in this cycle despite the product being effectively one salon today. |
| **DEPENDENCIES** | Blocked by: D1 (needs `active_context/1` with `mode` dropped and `tenant_id` promoted — and D1-C would make this decision incoherent, since a capacity switcher and a tenant switcher on the same control are two different boundaries wearing one affordance). Blocks: P07 (IntentRecord tenant binding and cross-tenant refusal), P26 (erasure is scoped to a principal and a range, which presumes a thread model). Tightly coupled to D5 (retention and erasure are per thread; decide the storage shapes together or migrate twice) and to D10 Step 4 (folding `app-tenant.html` into `app.html` behind the `app_access` flag is the same tenant question one layer down). |
| **REVERSIBILITY** | A to B is a data migration of existing conversations — painful and getting worse monthly. B to A is trivial. C to anything requires resetting a persisted preference for every user. The asymmetry argues for B now. |

---

## D8 — Cutover mechanism

**QUESTION.** What shape does the retirement of the old screens take?

**WHY.** Deleting without proven parity is already forbidden, so that is not the question. The question is the cutover MECHANISM, which is not settled anywhere and which determines whether the programme is recoverable. The context is unforgiving: three bundles with no build system, no git-based rollback culture for the frontend (per project convention, rollback is .bak files), and a native shell in the field you cannot force-update.

**OPTION A.** Big-bang per wave. When the gate is green, the old shell is removed in one release. No dual-running.

- *Gains:* Shortest programme, one migration event, no period of maintaining two shells, no ambiguity about which surface is real.
- *Loses:* Makes the parity gate a single enormous boolean, which is exactly the kind that gets waved through under schedule pressure. Rollback means reverting a 2.7 MB source-less single-file bundle across three artefacts plus a native shell — and any user mid-flow at cutover simply loses it. One-way.

**OPTION B.** Dual-run, capability by capability. The chat shell ships dark behind an entitlement; capabilities move one at a time; each retired surface becomes ENTRY_POINT_DARK (entry removed, code retained) for a defined observation window, then the code is deleted. Owner sets the window.

- *Gains:* Every retirement is individually provable and individually reversible — re-lighting a dark entry point is a config change, not a restore. Turns one enormous gate into many small ones that cannot be waved through as a batch. Matches the state machine the migration ledger already defines.
- *Loses:* Longer programme. Two shells maintained through the window. Requires sustained discipline to keep the ledger honest, and dark code that nobody can see will rot if the window is allowed to stretch.

**OPTION C.** Permanent coexistence — the old shell is retained indefinitely as a 'classic' mode.

- *Gains:* Nobody is ever forced to move; zero migration risk for the most resistant users.
- *Loses:* Permanently doubles the surface count you just spent a cycle reducing, guarantees the legacy authority generation stays operative (it already is, in the older bundle, where the client-preview PII fence does not exist at all), and makes 'chat is the primary interface' false forever. It is not a cutover strategy; it is the absence of one.

**RECOMMENDED: B.** B is the only option that is reversible by construction, and reversibility is the scarce resource here given source-less bundles and a native shell you cannot recall. Set the window explicitly with this decision — recommended: successor receipts observed in production for the capability for 30 days or two full business cycles, whichever is longer, AND zero fallbacks to the dark entry — because an unstated window is how dark code becomes permanent code.

| Impact | |
|---|---|
| **NATIVE** | This is the decision where native reality bites hardest, and it argues for B rather than merely permitting it. Both shells load the same web bundle, so a web-side change reaches every installed shell instantly — but a rollback only inherits that property if it is a configuration flip, not a bundle restore. Under A, rollback means restoring three source-less single-file artefacts (2.72 MB, 2.51 MB, 1.10 MB) and any shell whose negotiated `min_bundle_contract` no longer matches the restored bundle fails at the moment of use, inside a user flow. You cannot force-update a Capacitor build or a TWA in the field; both carry store review latency you do not control. Re-lighting an ENTRY_POINT_DARK entry is a config change that works identically on PWA, Capacitor and TWA with no store round-trip — that is the only rollback with uniform reach. |
| **PWA** | The constraint set is unforgiving: three bundles, no build system anywhere in the canonical repository, no `build.js` and no Aurora source, and no git-based frontend rollback culture (the project convention is `.bak` files). ENTRY_POINT_DARK is what makes each retirement individually provable — the nav entry is removed while the route still resolves and logs every hit, so 'nobody used it' is measured rather than assumed. Option A converts the parity gate into one enormous boolean, which is the kind that gets waved through under schedule pressure; B converts it into many small ones that cannot be batched. |
| **SECURITY / AUTHORITY** | Option C is a standing security position, not a migration strategy: it keeps the legacy authority generation operative in the older bundle, which has zero `app_access`, zero compat ternaries and NO client-preview PII fence at all, while still holding a session token and calling the loyalty and panel endpoints. Retaining that indefinitely means retaining a 152-FZ exposure indefinitely. Under B, the authority work in P12 and P27 lands once in the trunk bundle and the dark window is the period during which both the old and new authority paths are observable simultaneously — which is precisely what `AUTH-INV-2` replay testing needs in order to prove they agree before the old one is sealed. |
| **MIGRATION** | This decision IS the ledger state machine, which already defines it: MAPPED → PARITY_PROVEN → ENTRY_POINT_DARK (14 days) → ROUTE_SEALED (30 days; 45 days for any capability touching period close, so two month-end closes fall inside the window) → DELETED, with a one-step rollback at every transition that requires no deploy of the successor. The owner must set the observation window WITH this decision, because an unstated window is how dark code becomes permanent code. Recommended: successor receipts observed in production for that capability for 30 days or two full business cycles, whichever is longer, AND zero fallbacks to the dark entry point. |
| **DEPENDENCIES** | Blocked by: D10 (which bundle the cutover happens in must be settled first — cutting over inside a bundle you later abandon wastes the whole window) and by the Wave-4/Wave-5 parity proofs that supply each row's evidence. Blocks: P30, the only package permitted to delete anything, and gate G17 (deletions lacking a named successor and a passing parity test must be zero). Coupled to D11: retiring the ~45 Telegram entry points uses this same one-at-a-time discipline, each checked against its own capability's HTTP surface, never on the assumption that the app re-presents it. Coupled to D9: the interim 152-FZ route is itself a ledger row and is deleted under parity when P22 lands. |
| **REVERSIBILITY** | B is the reversible option (dark entries re-light by config). A is one-way per wave. C is a permanent commitment that forecloses the cycle's whole purpose. |

---

## D9 — 152-FZ remediation lane

**QUESTION.** Two of the eight missing capabilities are 152-FZ exposures that exist TODAY. Do they get a remediation lane outside this programme, or do they wait for Wave 5?

**WHY.** Cannot be defaulted because it trades a legal exposure against an architectural fence, and only the owner can price that. The exposure is concrete and verified: outbound copy promises marketing-consent revocation via /unsubscribe and hands off to an app surface that does not exist, and base 152-FZ withdrawal exists only as a phone number in bot copy. The remediation is unusually cheap because the canonical owner is already LIVE — revocation is reachable today via the consent submit path with accept_marketing false, writing an append-only consent fact. So this is a missing INGRESS, measured in days, not a build. Note: this decision authorises a SEPARATE lane; it does not breach this cycle's architecture-only fence.

**OPTION A.** Authorise a separate remediation lane now for the two 152-FZ gaps only (marketing-consent revoke/restore, base personal-data withdrawal), routed through the existing shell to the canonical owner that already exists. The other six gaps stay in Wave 5 in ledger order.

- *Gains:* Closes a written promise you currently cannot keep, in days rather than quarters, using an owner that is already live and already append-only — so no new authority path is created. Leaves the chat-first fences completely untouched.
- *Loses:* Some genuinely throwaway work: the route you build in the old shell will be rebuilt as a widget later. You are paying twice for two surfaces, deliberately.

**OPTION B.** All eight in Wave 5, in ledger order, with no out-of-band work.

- *Gains:* One programme, one order, one set of fences; no duplicated effort; no precedent for opening side lanes under pressure.
- *Loses:* Accepts a live, written, outbound promise of a revocation you cannot honour, for the full length of a multi-wave programme. That is the one cost in this whole plan that is not yours to defer.

**OPTION C.** All eight remediated now, out of band, before the programme continues.

- *Gains:* Clears the entire gap ledger; the chat-first work starts from a complete product with nothing dark.
- *Loses:* Three of the eight are genuine builds with no canonical owner anywhere in the repository — a staff Telegram unbind endpoint and a conversation-erasure controller are both verifiably absent. Rushing those outside the programme's fences is exactly how a fourth authority path gets created, which is the failure this cycle exists to prevent.

**RECOMMENDED: A.** The two legally exposed gaps are also the two cheapest, because their canonical owners already exist and are already reachable — that coincidence is what makes A dominate. C is wrong for the opposite reason: the gaps with no owner (unbind, erasure) are precisely the ones that must stay inside the programme's fences. Sequence within A: marketing revoke first (it is a route, not a build), then base withdrawal.

| Impact | |
|---|---|
| **NATIVE** | None, and this is the most important thing to tell the owner about this decision, because 'legal remediation lane' reads as though it implies a release train. It does not. The interim ingress is a route in the existing web shell, reached identically from the browser PWA, the Capacitor shell and the TWA over the same bundle: no plugin, no `NativeBridgeManifest` change, no shell version floor, no App Store or Play review. The days-not-quarters estimate survives contact with the native reality intact. |
| **PWA** | One interim route in the trunk bundle (`app.html`) wired to the consent submit path that already exists. If the older bundle is still reachable with a live session, the route must NOT be implemented there a second time — it gets the query-preserving redirect from D10 instead, because a second implementation in a bundle with no PII fence is a worse outcome than the gap it closes. The interim route is deliberately throwaway: P22 rebuilds it as a widget plus a Privacy & Data control, and you are knowingly paying for two surfaces. |
| **SECURITY / AUTHORITY** | The reason this is cheap is precisely that it creates no new authority path. The canonical owner already exists and is live — `src/crm/client-consent-authority.ts` — and revocation is already reachable through the consent submit path with `accept_marketing` false, writing an append-only consent fact. So this is a missing INGRESS, not a missing owner. The rule that must hold from day one of the lane is P22's: every consent write is refused when it arrives on channel identity alone, which is the fundamental rule CHANNEL IDENTITY != BUSINESS AUTHORITY at its single most legally consequential point. The failure mode to forbid explicitly is the lane creating a second consent writer under schedule pressure — one canonical owner, two doors, is the shape; two owners is not. |
| **MIGRATION** | Does not breach this cycle's architecture-only fence, because it is authorised as a separate lane rather than as work inside Wave 1. The interim route takes a ledger row like any other surface and terminates under the same discipline as everything else — it is deleted under parity when P22 ships, never left standing as a second door. Nothing is stranded: both the interim route and the eventual widget write to the same append-only canonical owner, so no second source of truth is created and no data has to be reconciled. Sequence within the lane: marketing revoke first because it is a route rather than a build, then base 152-FZ withdrawal. |
| **DEPENDENCIES** | Blocked by: nothing that would delay it — that is the point of authorising it out of band. It does NOT wait on P20 or P22. Loosely coupled to D2 (the permanent home is Privacy & Data; the interim home need not be) and to D10 (the older-bundle reachability verification is a shared precondition). Blocks: D11-B and P28 — a Telegram consent entry point cannot be retired while its named successor is a phone number in bot copy, and P30 is explicitly forbidden from deleting it until the successor exists. Also blocks P28 via P22/P23 in the package graph. [NON-NORMATIVE] Option C is wrong for the mirror-image reason: the three gaps with no canonical owner anywhere in the repository (staff Telegram unbind, conversation erasure, and the register export) are exactly the ones that must stay inside the programme's fences, because rushing them outside is how a fourth authority path gets created. |
| **REVERSIBILITY** | Fully reversible — the interim route is deleted when the widget replaces it, and it writes to the same append-only canonical owner, so no data is stranded and no second source of truth is created. |

---

## D10 — Bundle unification strategy

**QUESTION.** The chat shell has to be built in a frontend that currently ships as three separate single-file bundles of the same app. Unify first, or build once and freeze the others?

**WHY.** This is the largest hidden cost in the programme and it is not settled by the evidence. The planning material calls unification 'a precondition, not a cleanup' — but I verified that no build system exists anywhere in the canonical repository: there is no build.js and no app-aurora source, only three built artefacts (2.72 MB, 2.51 MB, 1.10 MB). So 'unify first' does not mean refactoring; it means RECONSTRUCTING a build for three source-less bundles before writing a line of the new shell. Two reasonable owners weigh that prerequisite very differently, and getting it wrong is how the programme quietly dies in month three.

**OPTION A.** Unify first — reconstruct sources and a build, produce one codebase with three outputs, then build the chat shell once.

- *Gains:* The shell is genuinely built once. Every later contract fence, ratchet and architecture spec applies to one artefact. Ends the class of bug where a fix lands in one bundle and not the others.
- *Loses:* Months of prerequisite work with zero user-visible value, on artefacts with no sources, before the chat-first programme produces anything. It is also the highest-risk possible starting point: reconstructing a source tree from a 2.7 MB built bundle is an archaeology project with no natural stopping point and no way to prove you have finished.

**OPTION B.** Retire the older bundle (redirect it to the live one), freeze the tenant bundle at its current feature set, and build the chat shell once in the live bundle. Unify afterwards, informed by a shell that already works.

- *Gains:* The shell is proven in the artefact that actually ships, with user-visible progress from the first wave. Retiring the older bundle also closes a standing exposure on its own merits: it contains zero app_access, zero compat ternaries, and NO client-preview PII fence at all, while still holding a session token and calling the loyalty and panel endpoints — so freezing it in place would be freezing a 152-FZ exposure. Unification later is a smaller, better-specified problem.
- *Loses:* The tenant bundle diverges further while frozen, and its later migration is a second project. You accept a period where 'built once' is aspirational.

**OPTION C.** Build the chat shell in each bundle separately.

- *Gains:* Nothing structural. Listed only because it is the de facto outcome if this decision is never made explicitly.
- *Loses:* Three implementations of one shell, guaranteed divergence of the authority layer across them, and triple the surface for every contract fence. This is how the current three-generation authority mess was produced in the first place.

**RECOMMENDED: B.** A sequences the hardest, least provable work first and gates all user value behind it — and with no sources to recover from, its scope cannot be bounded in advance. B converts the same problem into two smaller ones and closes a real PII exposure as a side effect. One hard precondition on B: the older bundle must be taken out of service or positively proven unreachable with a live session BEFORE anything is frozen — that verification is currently listed as an open item and should be the first task of the lane, not an assumption.

| Impact | |
|---|---|
| **NATIVE** | The shells load whatever the URL serves, so retiring `maya-os-site/index.html` by redirect is invisible to them — on one condition, that the redirect preserves the query string, because six capabilities are gated only by query parameters (`?community_moderation`, `?native_feedback`, `?cash_declaration=1`, `?expenses=…`, `?governed_settings=…`, `?team=main`) and a redirect that drops them silently destroys six capabilities while looking like a successful consolidation. Native is not the blocker here and the evidence is unusually direct: `app-tenant.html` already runs natively with no `MayaRuntime`, no `MayaNfcWriter` and no `AppIcon`, and it works — which proves from production artefacts that no business capability is gated on a plugin. The genuine native cost of NOT unifying is that three bundles today carry three different implicit plugin contracts with no handshake anywhere, so an older shell plus a newer bundle fails at the moment of use inside a user flow; the boot negotiation (`bridge(key)`, N2) is what makes that skew detectable, and option A delays it behind an archaeology project. |
| **PWA** | This is the decision in full. `app.html` is the trunk — not because it is newest but because it demonstrably carries the router, the seven overlays and the five preview fences that every other decision depends on, and consolidating toward a bundle that lacks the fences would be consolidating toward the weaker security posture. A caution to carry into the room: the `2026-08-01` / `2026-09-02` build tags could not be reproduced by grep of either file, so they must not be cited as evidence of which bundle is newer. The endpoint is measured at G10 — distinct build tags across `app.html`, `app-tenant.html` and `maya-os-site/index.html` must equal 1. |
| **SECURITY / AUTHORITY** | The older bundle is the exposure and the reason B closes something rather than merely deferring something. It has zero `app_access`, zero compat ternaries and NO client-preview PII fence at all, while still holding a session token and calling the loyalty and panel endpoints — so freezing it in place would be freezing a 152-FZ exposure in place. Hard precondition on B, currently listed as an open item and which should be the lane's FIRST task rather than an assumption: the older bundle must be taken out of service, or positively proven unreachable with a live session, BEFORE anything is frozen. |
| **MIGRATION** | Five ordered steps, each individually reversible. Step 0, build-identity proof: prove per file that the other two bundles are builds of the same source tree by comparing the `S` router key set, the `openMaya*` function set, the five fence call sites and the `window.__me*` global set — until proven, each is a distinct surface set contributing its own ledger rows. Step 1, freeze `maya-os-site/index.html` immediately (the only step with no precondition). Step 2, census diff: anything present only in the older build is a capability a redirect would destroy, and it gets a row before anything moves — this is the step that makes Step 3 safe and the one most likely to be skipped. Step 3, query-preserving redirect, reversed by deleting one rule. Step 4, `app-tenant.html` folds behind the server-owned `app_access` flag after every tenant-only surface clears individually. Step 5, one bundle — and only then does contract rule R3 (`theme_scope: 'in_tree'`) become enforceable, because until there is one tree there is nothing for `in_tree` to mean. |
| **DEPENDENCIES** | Blocked by: its own Step 0 and Step 2 verification, and by the older-bundle reachability check shared with D9. Blocks: P09 (the chat shell mounts as a key in `app.html`'s existing `S` router map — not a new bundle and not an overlay, so the trunk must be chosen first), P27 (bundle unification and legacy-authority retirement), G10, and D8 (you cannot choose a cutover mechanism without knowing which artefact you are cutting over). Coupled to D7 (Step 4 is the tenant question at the bundle layer) and to D3/R3 (one tree before `in_tree` means anything). [NON-NORMATIVE] Option C is not a choice so much as the default outcome if this is never decided explicitly, and it is how the current three-generation authority mess was produced in the first place. |
| **REVERSIBILITY** | B preserves the option to unify at any later point, on better information. A, once started, is very hard to abandon midway — a half-reconstructed build is worse than either endpoint. C is not reversible in practice: three divergent shells never re-converge. |

---

## D11 — Telegram channel status

**QUESTION.** Is Telegram a peer rendering channel of Maya, or a delivery-and-handoff channel only?

**WHY.** I am adding this because it is the largest scope decision hiding inside the inventory and nothing in the approved principles settles it. Telegram is 109 surfaces — the second-largest channel — and it is ALREADY chat-first with patterns the new design explicitly wants to inherit. But roughly 45 registered owner/staff commands are authority-dead: the principal context variable is written only inside the HTTP middleware while the bot runs polling, so authority checks return false for every Telegram-originated update, and those commands still execute and reply. Separately, six capabilities are fenced shut at the body level, so restoring authority would not restore them. So the owner is choosing between funding a real authority path for a second channel, or declaring it a client-and-delivery surface. Both are defensible; the cost difference is large.

**OPTION A.** Peer channel. Fix the Telegram authority path (make the principal resolvable for polled updates), give Telegram a full channel profile, and render envelopes there with the same intent vocabulary as the app.

- *Gains:* Masters and owners keep working where they already live, with no app install. Telegram's proven patterns — one capability behind three front doors, help generated from the intent router, deterministic matching before any LLM, a universal escape verb — become first-class rather than folklore. The staff chat mirror already provides the convergence seam.
- *Loses:* You are funding a second authority implementation, which is precisely the thing that produced three coexisting generations. It also means Telegram's 64-byte callback budget and its lack of a client-preview fence become constraints on the shared contract, not just on one renderer.

**OPTION B.** Delivery and handoff only. Telegram carries the 12 proactive outbound moments, client-facing conversation, and links that hand off into the app for anything requiring owner or staff authority. The ~45 authority-dead owner/staff commands are retired as entry points, case by case, after checking each capability's HTTP surface individually.

- *Gains:* One authority path, one place to reason about it. Removes ~45 commands that currently reply as though they worked and did nothing — which is worse than their absence. Substantially smaller programme. Aligns with the inventory's own disposition for this class.
- *Loses:* Staff who live in Telegram must open the app for anything privileged — a real behavioural cost at a salon where the phone is the work surface. Some of the good Telegram patterns must be re-implemented in the app rather than inherited in place.

**OPTION C.** Defer — leave Telegram exactly as it is, including the authority-dead commands, and decide after the app shell ships.

- *Gains:* No scope added now; the decision is made with more information later.
- *Loses:* Leaves ~45 commands answering owners and staff as if they had worked. That is not neutral: it is a channel that silently produces no effect while reporting success, and every month it stays is a month of eroded trust and of support tickets that cannot be reproduced in the app.

**RECOMMENDED: B.** B is the only option consistent with 'ONE MAYA — DIFFERENT AUTHORITY' as an engineering commitment rather than a slogan: one authority path, one place it can be wrong. The decisive detail is that restoring Telegram authority would NOT restore the six body-level-fenced capabilities anyway, so option A buys less than it appears to. Retire the entry points, but retire them one at a time against each capability's actual HTTP surface — never on the assumption that the capability is re-presented in the app, which the inventory explicitly warns against.

| Impact | |
|---|---|
| **NATIVE** | Telegram is a carrier, not a shell, so there is no plugin, shell or store consequence — but there is one real overlap with what a native device receives. Staff-facing Telegram messages already replay into the durable app chat with a dedupe key, and that key is both the convergence seam this design inherits and the mechanism that stops one proactive moment being delivered three times across push, in-app chat and the mirror (G16: zero duplicate deliveries over 14 days). A Telegram decision therefore changes the notification experience on an installed shell. Under option A there is a second, subtler cost: Telegram's 64-byte `callback_data` ceiling and its lack of a client-preview fence would become constraints on the SHARED contract rather than on one renderer. [NON-NORMATIVE] The 64-byte ceiling is already met with room to spare — the token encodes at roughly 28–30 bytes — but it is the reason the token must be an opaque handle and the `IntentRecord` store must exist at all. |
| **PWA** | Option B pushes privileged staff work into the app, so the app must actually host it before any entry point retires — P16 and P17 parity proofs are the gate, not an intention. Telegram's proven patterns have to be re-implemented in the app rather than inherited in place: one capability behind three front doors converging on one function, help generated from the intent router rather than hand-written per channel (I4), deterministic regex matching before any LLM call, mode locks during composition, a 30-minute flow TTL, and a universal `/cancel` escape verb. The honest cost is behavioural: at a salon where the phone is the work surface, staff must open the app for anything privileged. |
| **SECURITY / AUTHORITY** | The decisive fact, and it favours B more than it first appears. The `canonical_staff_access._principal` ContextVar is written only inside the aiohttp HTTP middleware while the bot runs `start_polling`, so `is_admin()` / `is_staff()` / `master_projection()` return False or None for every Telegram-originated update — yet roughly 45 owner/staff commands still execute and reply into bodies that cannot be entered. A channel that reports success and produces no effect is worse than an absent one. Two qualifications the owner must hear: this causal mechanism was confirmed at high confidence by two of three independent verifiers and disputed on causality (not mechanism) by the third, so P28 is written to be correct either way; and six capabilities are fenced at the BODY level (`mute_master` raising, `run_loyalty_job` and `run_backfill_job` disabled, `scan_and_alert` a retired stub, `can_redeem_codes` false, `set_cashier_role` raising), so restoring Telegram authority would not restore them. Option A therefore buys materially less than its price suggests, while funding a second authority implementation — the exact thing that produced three coexisting generations. |
| **MIGRATION** | Executed by P28, which deliberately keeps two problems separate. Every one of the ~45 commands carries an individually recorded decision — restore-via-HTTP, handoff, or retire-with-named-successor — and every one of the 6 body-level fenced capabilities gets an individually verified HTTP successor or an explicit 'no successor, capability withdrawn' record. Never retire on the assumption that the capability is re-presented in the app; the inventory explicitly warns against exactly that. G17 measures all three counts at zero simultaneously. |
| **DEPENDENCIES** | Blocked by: D9 and its packages — P28 depends on P22 and P23, because a Telegram consent entry point cannot be retired while its successor is a phone number in bot copy, and P30 is forbidden from deleting it until the successor is live; also P15 (voice and multimodal resolution) and P11 (the channel profile registry). Blocked by D8, whose per-entry-point dark-then-seal discipline is the mechanism each of the ~45 retirements uses. Blocks: nothing downstream of itself, but it is the option that gets more expensive with delay — every month of option C adds users who have learned commands that do nothing. Reversibility note for the owner: B→A is genuinely additive, because the channel profile mechanism is designed to admit a new renderer without touching the business layer, so promoting Telegram to a peer channel later costs a profile and an authority fix, not a redesign. |
| **REVERSIBILITY** | B to A is genuinely reversible — the channel profile mechanism is designed to admit a new renderer without touching the business layer, so promoting Telegram later is additive. C is the only option that gets more expensive with time, because every month adds users who have learned commands that do nothing. |

---

## D9-bis — 152-ФЗ / marketing claim gap (операционная формулировка)

> Это то же решение D9, переформулированное в вариантах, которые вы задали.
> **Оперативной считать эту формулировку.**

**QUESTION.** Продукт сегодня обещает пользователю две возможности, которых ни
одна поверхность не умеет выполнить end-to-end: отозвать маркетинговое согласие
и отозвать/управлять согласием 152-ФЗ. Что делать с разрывом между обещанием и
исполнимым путём?

**WHY.** Разрыв доказан и он односторонний: обещание живое, исполнения нет.
`bot.py:445` — «Согласие можно отозвать в любой момент командой /unsubscribe»;
`cmd_unsubscribe` (`bot.py:576-579`) отвечает только ссылкой на приложение;
в приложении единственный consent-контрол — `AMayaConsent`, который рендерится
**только когда канал уже привязан** и не содержит пути изменения записанного
решения. Отзыв базового согласия 152-ФЗ существует только как телефон и e-mail
в тексте. Это не UX-долг, а `PRODUCT PROMISE WITHOUT EXECUTABLE PATH`.

**OPTION A.** Добавить эти exact capability paths в будущую Chat-First
реализацию (волна 5, пакет восстановлений).

- *Gains:* обещание становится исполнимым там, где пользователь его читает; путь
  идёт через существующего канонического владельца согласий, новых контрактов не
  требуется.
- *Loses:* разрыв остаётся открытым всё время до волны 5 — то есть обещание
  продолжает быть невыполнимым несколько месяцев.

**OPTION B.** До реализации удалить или изменить product copy, которая обещает
недоступное действие.

- *Gains:* разрыв закрывается немедленно и дёшево; продукт перестаёт обещать то,
  чего не делает.
- *Loses:* пользователь теряет *указание* на способ отзыва, а право на отзыв у
  него остаётся — значит копия обязана назвать работающий канал (телефон/e-mail),
  иначе вместо ложного обещания получится молчание, что не лучше.

**OPTION C.** Оба, в этом порядке: сначала B (копия говорит правду и называет
работающий канал), затем A (возможность появляется в чате и копия возвращается).

**RECOMMENDED: C.**
A в одиночку оставляет живое ложное обещание на месяцы. B в одиночку честен, но
оставляет право без продуктового пути навсегда. C — единственный вариант, где в
каждый момент времени то, что написано, совпадает с тем, что работает. B — это
изменение текста, не архитектуры, и оно не конкурирует за инженерный ресурс с
чат-first программой.

| Impact | |
|---|---|
| **NATIVE** | Нет. Копия и путь — общие для оболочек. |
| **PWA** | B: правка строк. A: одна `CONSENT_STATE`-поверхность + fullscreen fallback. |
| **SECURITY / AUTHORITY** | Контрол принятия/отзыва остаётся authority-path с полом `SESSION_VERIFIED` и выше; чат несёт только пояснение. Канальная идентичность не активирует решение. |
| **MIGRATION** | B не требует миграции. A — пакет восстановления, без изменения канонической схемы согласий. |
| **DEPENDENCIES** | B не зависит ни от чего. A зависит от каркаса чата (волна 1) и от `CONSENT_STATE` в контракте. |
| **REVERSIBILITY** | B полностью обратимо. A аддитивно. |

> **Замечание о заборе цикла.** B — это изменение production-копии. В текущем
> цикле оно **не выполняется**: цикл архитектурный и меняет 0 строк. B требует
> вашего явного разрешения как отдельная маленькая работа.

---

## D12 — Объём хранилищ виджетного слоя

> Добавлено сертификацией контракта. Не может быть решено молча, потому что
> сталкивается с вашим ограничением `NO schema change`.

**QUESTION.** Контракт требует хранилищ виджетного слоя (`IntentRecord`, timeline
store, receipt store, emission/receipt store, free-input ledger, consent-ledger
projection). Ваше ограничение гласит `NO schema change`. Что считать правильным
прочтением?

**WHY.** Это не спор о словах. Без `IntentRecord` нет идемпотентности нажатия,
нет аудита «кто что нажал», нет замороженного чека в истории — то есть три
гарантии контракта становятся недоказуемыми. Но и назвать это «без изменений
схемы» было бы неправдой: это новые таблицы.

**OPTION A.** Строго: никаких новых хранилищ. Виджетный слой не персистирует
ничего.

- *Gains:* буквальное соблюдение ограничения.
- *Loses:* идемпотентность нажатия, аудит интентов и замороженный чек становятся
  нереализуемыми; `WIDGET STATE != BUSINESS STATE` остаётся верным тривиально,
  потому что состояния нет вовсе, но история перестаёт быть воспроизводимой.

**OPTION B.** Ограничение читается как **«никаких изменений канонической
бизнес-схемы»**. Виджетный слой получает собственные аддитивные таблицы, которые
не содержат бизнес-состояния и на которые не ссылается ни одна каноническая
таблица (это уже запрещено инвариантом E4).

- *Gains:* контракт реализуем; каноническая схема остаётся нетронутой; удаление
  истории по-прежнему оставляет бизнес-записи корректными.
- *Loses:* это всё-таки новые таблицы и новые миграции в волне 1 — то есть
  «0 изменений схемы» перестаёт быть верным для программы в целом (для *этого*
  цикла остаётся верным).

**OPTION C.** Отложить: строить виджетный слой без персистентности в волне 1 и
вернуться к вопросу, когда станет видно, чего не хватает.

- *Gains:* решение принимается на лучших данных.
- *Loses:* переделка волны 1 почти гарантирована; это самый дорогой из трёх.

**RECOMMENDED: B.**
Ограничение написано, чтобы защитить канонические бизнес-контракты C6–C9, и эта
защита при B полностью сохраняется. A защищает букву ценой трёх гарантий,
которые вы же и потребовали. Важно, что при B утверждение
`RUNTIME/SCHEMA/MIGRATION CHANGES: 0` остаётся истинным **для этого цикла** и
перестаёт быть истинным только для волны 1 — и это должно быть сказано заранее,
а не обнаружено при первом PR.

| Impact | |
|---|---|
| **NATIVE** | Нет. |
| **PWA** | Нет прямого. |
| **SECURITY / AUTHORITY** | Положительный: `IntentRecord` — это то, что делает аудит нажатий и идемпотентность проверяемыми. Канонические таблицы не меняются. |
| **MIGRATION** | Волна 1: аддитивные таблицы виджетного слоя. Ни одной правки канонической бизнес-схемы. |
| **DEPENDENCIES** | Блокирует волну 1 целиком. |
| **REVERSIBILITY** | Аддитивные таблицы удаляются без потери бизнес-данных, потому что бизнес-данных в них нет. |
