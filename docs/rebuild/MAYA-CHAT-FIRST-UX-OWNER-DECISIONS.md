# MAYA OS — Chat-first UX: решения владельца

Дата: 2026-09-14. Базовая линия: C9 final `8b5afb68`, релиз `20260914-c9-wave4-7c9da983`.
Парный документ: [MAYA-CHAT-FIRST-UX-ARCHITECTURE.md](MAYA-CHAT-FIRST-UX-ARCHITECTURE.md).

Этот цикл — **архитектурный**. Ни одно решение ниже не выполняется до отдельного
approved implementation/cutover. Изменений runtime/schema/migration в этом шаге: **0**.
Production mutations: **0**. Chapter 10 не начат.

## Что уже решено и не выносится на обсуждение

Следующее закрыто утверждёнными принципами и **не является** вопросом к владельцу.
Варианты здесь не предлагаются — это было бы имитацией выбора.

| Закрыто принципом | Следствие |
|---|---|
| `CHAT IS THE PRIMARY MAYA OS USER INTERFACE` | Основной экран — один: Maya. Классическая primary navigation (`Главная / Клиенты / Календарь / Аналитика / Настройки / AI`) не является целевой моделью. |
| `ROLES DEFINE AUTHORITY, NOT APPLICATION MODES` | Пользователь не выбирает режим «владелец / мастер / клиент». Вопрос «убирать ли режимы» — закрыт; открыт только вопрос, что сервер отдаёт вместо них (D1). |
| `WIDGETS ARE CONTEXTUAL CAPABILITY SURFACES INSIDE THE CONVERSATION` | Виджет — поверхность представления, а не владелец бизнес-данных. |
| `ONE MAYA — DIFFERENT AUTHORITY` | Один интерфейс, разные данные. Один интерфейс **не** означает одинаковые данные. |
| `CHAT-FIRST != CHAT-ONLY` (жёсткое ограничение) | Fallback-редактор обязателен для аудита, точной конфигурации, доступности и исправления. Это **D3** — оставлен в списке как подтверждение, а не как выбор. |
| `ROLE REMOVAL FROM UX != ROLE REMOVAL FROM SECURITY` | Membership, Client binding, Staff binding, entitlements, finance access, action authority, approvals — не трогаются. |

## Решения, которые действительно нужны

Одиннадцать. Восемь — из вашего списка; три добавлены, потому что инвентаризация
вскрыла выбор, который иначе был бы сделан молча (D9, D10, D11) — обоснование внутри.

## D1 — role-modes

**Вопрос.** Owner/staff/client as application modes are abolished by the approved principles. The live question is what the server sends in their place: does the client receive ANY field describing who this person is in presentation terms?

**Почему это решение владельца.** The headline — 'should there be owner mode / staff mode / client mode' — is SETTLED BY CONSTRAINT ('ROLES DEFINE AUTHORITY, NOT APPLICATION MODES' + 'ONE MAYA — DIFFERENT AUTHORITY'), and security is untouched either way. What is NOT settled, and what two reasonable owners decide differently, is the residue: whether a non-actuating presentation hint survives. This is the exact seam through which modes regrew twice in this codebase already (app_access mode + 42 compat ternaries + window.__meRole globals), so it cannot be defaulted.

| | Вариант | Что даёт | Что теряет |
|---|---|---|---|
| **A** | Delete the mode concept from the wire entirely. The client receives tenant, entitlements and the capability registry — nothing that names a persona. Landing STRUCTURE is identical for everyone; landing CONTENT differs because the greeting slot and the capability ordering are derived from entitlements, which already encode the difference (a master holds analytics.own.earnings, an owner holds analytics.tenant.revenue). | There is nothing on the client to branch on, so modes cannot regrow. Ordering becomes data-driven rather than identity-driven. Deletes app_access.mode, the dead 'role' router key, 'choose' and 'access-compat' in one move. Kills the argument about who gets which screen, permanently. | You give up the ability to hand-tune a landing experience per persona without expressing it as an entitlement. Some ordering that is obvious to a human ('masters care about today first') must be derived rather than declared, and the first version of that derivation will be slightly wrong. |
| **B** | Keep the app_access transport, delete the mode field, promote tenant_id — but add a server-authored presentation_mode hint that may only reorder and relabel, never enable (A1/A5 already forbid actuation). | Landing content can be tuned per authority immediately and legibly, without deriving it. Cheapest path from today's code. | Re-creates the branchable string. Every renderer will eventually branch on it; 'non-actuating' is a review convention, not a type. This codebase has produced 42 compat ternaries from exactly this affordance once already, and a second, divergent answer to 'who am I' that no test compares against the first. |
| **C** | Keep a user-visible capacity control — the identity-bar scope noun is tappable and switches owner/staff/client view. | Familiar to anyone who used the current shell; zero re-learning for the owner who is also a client. | Directly contradicts the approved principles: a user-chosen, persisted, globally-scoped interpretation IS an application mode. Recreates the three coexisting authority generations at the UX layer. |

**Рекомендация: A.** A is the only option whose failure mode is 'ordering is briefly wrong' rather than 'modes come back'. Entitlements already carry every distinction ordering needs, so the hint in B buys convenience, not capability — and this repository is the empirical case against that convenience. A is also the reversible direction: adding a hint later is one field; removing branches once they exist is the 42-ternary cleanup you are already paying for.

**Обратимость.** A to B is cheap and additive (add one server-authored field). B to A is expensive once renderers branch on it. C to anything is a re-learning event for every user. Choose A precisely because it is the direction you can walk back from.

---

## D2 — primary-nav-shell

**Вопрос.** How many primary-navigation destinations does the target shell have, and which?

**Почему это решение владельца.** This is explicitly flagged as un-derivable from the evidence: executing every ASSIGNED retirement takes primary nav from 112 to 49, and the decision that takes 49 to a handful is a product adjudication, not a finding. The design section derives four shell destinations from the NEVER_CHAT_ACTUATED list, but an owner may legitimately weigh discoverability and operator speed differently.

| | Вариант | Что даёт | Что теряет |
|---|---|---|---|
| **A** | Five: one root (Maya) plus Account, Connections, Privacy & Data, Notifications. The tab bar is deleted as a control type, not re-skinned. These four are the handoff target set — the destinations where the eight NEVER_CHAT_ACTUATED acts terminate. | The shell is derived, not designed: each destination exists because a class of act may never be chat-actuated and must land somewhere verified. That makes it defensible and closed — nobody can argue a sixth into it without first arguing a ninth never-chat-actuated act. 152-FZ obligations (consent register, erasure, withdrawal) get a stable, discoverable home, which matters for regulatory discoverability, not just UX. | A staff member doing the same operation forty times a day must type, speak, or re-enter it through a widget rather than tap a tab. Real friction for high-frequency operators in the first weeks. |
| **B** | Two: one root plus a single consolidated 'Профиль и данные' sheet holding everything. | Maximum purity; the smallest possible chrome; nothing to argue about. | Buries consent withdrawal, the consent register and erasure two taps deep inside a mixed drawer. Under 152-FZ, discoverability of a withdrawal path is part of the obligation, not a nicety — and you already have two places promising a revocation that does not exist (D9). Also collapses four semantically different objects (identity, connections, data rights, delivery) into one undifferentiated list. |
| **C** | Five plus a small persistent work rail of high-frequency surfaces (Calendar for staff, Booking for clients). | Keeps operators fast from day one; softens the transition for the people who use the product most. | The rail's contents can only be chosen by persona — which is an application mode wearing a different hat, re-opening D1 by the back door. It is also the surface that will grow: a rail with two items becomes a rail with nine, and you are back to a tab bar under another name. |

**Рекомендация: A.** A is the only option produced by a rule rather than by taste, which is what makes it stable under pressure — the count cannot drift without someone first changing the never-chat-actuated list. The operator-speed cost that C tries to buy off should be paid inside the conversation instead (recent intents, a composed-utterance index per D4), where it stays authority-neutral and cannot regrow into modes.

**Обратимость.** Adding a destination later is cheap and additive. Removing one after operators have learned it is expensive in trust and support load. Start at five; a sixth is a decision you can still make, a sixth you later delete is one you cannot un-make cleanly.

---

## D3 — chat-first-vs-chat-only

**Вопрос.** Chat-first or chat-only?

**Почему это решение владельца.** SETTLED BY CONSTRAINT — this is not an owner decision and should not consume owner attention. The hard constraint states it directly: 'CHAT-FIRST != CHAT-ONLY: a fallback editor must exist for audit, exact configuration, accessibility and correction.' It is reinforced structurally: the widget contract's NEVER_CHAT_ACTUATED list (8 acts) can only terminate on a non-chat surface, 76 surfaces are dispositioned KEEP AS FULLSCREEN DETAIL, and the A11yFloor plus exact-configuration cases have no chat-only expression. Chat-only is not a product position available to you; it fails the gate. Recorded here for confirmation only. The live version of this question is D4.

| | Вариант | Что даёт | Что теряет |
|---|---|---|---|
| **A** | Chat-first, with a mandatory non-chat fallback for audit, exact configuration, accessibility and correction. Confirm only. | Chat is the primary interface and the default answer to 'where do I do X', while the acts that must never be actuated by channel identity alone keep a verified home. | Nothing that was available. Chat-only was never reachable under the constraints. |

**Рекомендация: A.** Only one option is compatible with the hard constraints. Presenting alternatives would be manufacturing a choice.

**Обратимость.** Not applicable — constraint-fixed. Attempting chat-only later would fail the capability-parity gate and the accessibility floor.

---

## D4 — fullscreen-entry

**Вопрос.** How is a fullscreen secondary view entered — and does a capability directory exist?

**Почему это решение владельца.** The existence of fullscreen views is settled (D3). How you REACH them is not, and it decides whether the product is chat-first or an app with a chat tab. It also decides the fate of the 201 KEEP AS CAPABILITY surfaces, which by construction have no nav entry: if a user does not know a capability exists, they cannot ask for it, and no evidence in the inventory settles how they are meant to find out.

| | Вариант | Что даёт | Что теряет |
|---|---|---|---|
| **A** | Conversation-anchored only. Fullscreen is reachable exclusively via a widget's presentation.fullscreen_detail.route_key, a NAVIGATE/HANDOFF intent, or a deep link that resolves a widget first. No chrome entry of any kind. | Purest expression of the principle; every fullscreen view has a conversational antecedent, so the back-stack, the authority snapshot and the audit trail are always coherent. Impossible to accumulate a launcher. | Genuine discoverability failure for 201 capabilities with no nav entry. Users will conclude features were removed when they were only made conversational — which is exactly the complaint that kills migrations like this one. |
| **B** | Conversation-anchored, plus an authority-filtered capability index in the shell sheet that does NOT render capabilities — it composes an utterance into the composer (or mints a REFINE/NAVIGATE intent), so the user always lands back in the conversation. | Solves discoverability without creating a launcher: the index is a phrasebook, not a destination. It teaches users how to ask, so its own usage should decline over time — a measurable success signal. Stays authority-neutral (one flat list, filtered only by entitlement, identical shape for everyone, so it does not re-introduce modes). | It is chrome-entry navigation, and it will be under permanent pressure to start rendering results directly. Requires an enforced rule ('the index never renders a capability') that a future contributor can break. |
| **C** | Fullscreen views become independently addressable destinations with their own URLs, back-stack and launcher, openable from anywhere. | Fast for power users; deep links, push targets and native shortcuts become trivial. | Makes fullscreen a peer of chat rather than a detail of it — the product slides back to an app with a chat tab. Breaks the 'deep link resolves a widget first' property that keeps authority and back-stack coherent, and makes the URL surface a public contract you cannot later withdraw (native shells and push payloads in the field). |

**Рекомендация: B.** A is right in principle and wrong in practice: 201 capabilities with no entry point is not minimalism, it is a discoverability cliff, and the first month of support load will force something like B anyway — better to design it than to bolt it on. B keeps the principle intact by construction, because an index that can only compose an utterance is structurally incapable of becoming a tab bar. C is the failure mode this whole cycle exists to escape.

**Обратимость.** Adding the index later is easy; removing it after adoption is medium. Going to C and back is the expensive one — once route keys are public contracts in native shells, push payloads and deep links, you cannot withdraw them unilaterally.

---

## D5 — widget-persistence

**Вопрос.** What does a widget look like when the user scrolls back to it a week later?

**Почему это решение владельца.** Cannot be defaulted, because the two obvious answers have opposite safety properties. C9 evidence handles resolve only inside one invocation (an in-memory Map), and intent tokens expire — so a persisted widget is already, factually, an artefact rather than a live view. Meanwhile the client-preview PII fence is enforced in five independent places, all at fetch/render time. Re-hydration on scroll would re-open all five under a possibly-changed authority.

| | Вариант | Что даёт | Что теряет |
|---|---|---|---|
| **A** | Frozen receipt. The widget persists with its data as-of timestamp; expired intents render as a quiet terminal line (SUBMITTED / CONFIRMED / NOT CONFIRMED), not as dead buttons; a single REFINE intent re-reads on demand. Requires the owner to state a retention window for the timeline, and to keep approval receipts in a separate immutable store that survives conversation erasure. | Makes the audit story true: 'this is exactly what Maya showed me when I approved that.' Matches reality (handles are audit labels, not links). No background fetch storm, no stale-authority leak, and conversation erasure can delete the timeline without corrupting canonical records — which is what makes the erasure gap buildable at all. | Scrolled-back numbers are stale and the user must tap to refresh. Requires a deliberate retention decision you would otherwise defer, and a second store for receipts. |
| **B** | Live rehydration — scrolled-back widgets re-fetch on view and show current data. | Always-correct numbers; the history doubles as a dashboard; feels modern. | Actively unsafe here. A widget rendered under one authority snapshot silently re-renders under another, and PII can surface in scrollback for a principal whose client binding has since been downgraded — re-opening all five preview fences. It also destroys the audit artefact: you can no longer prove what was on screen at approval time. |
| **C** | Collapse to text — after the conversation moves on, the widget reduces to its text_equivalent prose plus a re-run affordance; the rich rendering is not retained. | Cheapest storage; the text_equivalent is already server-minted and hash-covered, so the record is genuinely canonical. | Loses the visual artefact users reason about ('the chart with the dip'), and makes scrollback feel like the product forgot. The audit record survives but the human record does not. |

**Рекомендация: A.** A is the only option consistent with the constraint that conversation history is a presentation surface and never business state — it makes history legible, deletable and provable at the same time. B is the one to actively rule out in writing, because it is the intuitive default a future contributor will implement unless told not to. Note the coupling A forces you to face now rather than later: timeline retention and approval-receipt retention are different numbers with different owners (product vs 152-FZ), and the architecture must know both before Wave 2.

**Обратимость.** The freeze/rehydrate behaviour itself is a policy flip and highly reversible. The retention window and the receipt-store split are NOT — they are storage shapes, and changing them later is a migration over data you may by then be legally obliged to have deleted. Decide the numbers with this decision, not after.

---

## D6 — proactive-greeting

**Вопрос.** Does Maya say anything when the user opens the app, and how much?

**Почему это решение владельца.** The ceiling is constrained (a greeting may present already-authorized information; it may never autonomously initiate new business strategy — that is C10). The floor is not. And the floor is the single biggest UX risk in the whole migration: an empty composer is a worse home screen than a tab bar, so if the greeting is wrong, chat-first fails on first impression regardless of how good the architecture is.

| | Вариант | Что даёт | Что теряет |
|---|---|---|---|
| **A** | Silent. No greeting. One line of state, an empty composer; the user always initiates. | Zero risk of nagging, zero consent questions, zero cost. Absolutely honest: the product never claims to know something it does not. | Removes the reason chat-first is better than the tab bar it replaced. The user arrives at a blank prompt with 201 capabilities they cannot see and no hint what to ask — the worst possible pairing with D4-A, and a weak pairing even with D4-B. |
| **B** | One slot, at most once per session, at the head of the timeline, never pinned, never containing a COMMIT intent — showing only information a canonical owner already produced and already authorized for this principal. Explicitly permitted to render NOTHING when its sources are UNKNOWN, rather than rendering an error. User-switchable off, in the Notifications shell destination. | Gives the landing surface a reason to exist and demonstrates the value proposition in the first two seconds. Stays inside the C10 fence by construction (present, never initiate). 'Never pinned' keeps the timeline chronological, deletable and consistent with D5. The off-switch has a home that already exists. | A user who wants a quiet app gets something they did not ask for until they turn it off. Requires real discipline on the UNKNOWN path — a greeting that says 'не удалось загрузить' every morning would do more damage than no greeting at all. |
| **C** | Persistent pinned briefing that updates through the day and can surface the 12 canonical proactive outbound moments inline. | Maximum operational value for an owner who wants a morning dashboard; the briefing becomes the reason to open the app. | A pinned digest is chrome. Chrome that shows business data is a dashboard, and a dashboard is a mode — D1 and D2 reopen immediately. It also collides with the 12 outbound moments, which have their own consent ledger and audience maths; mirroring them into an in-app pin creates a second delivery path with no consent accounting. |

**Рекомендация: B.** B is the smallest thing that makes the landing surface worth landing on, and the 'never pinned / may render nothing / no COMMIT' triple is what keeps it from growing into C. The UNKNOWN rule is the part to hold the line on: the constraint that UNKNOWN must never be rendered as failure is most often violated exactly here, on the one surface every user sees every day.

**Обратимость.** Very high — one slot behind one flag, and the off-switch already has a home. This is the cheapest of the eleven decisions to change later, so it should not absorb much deliberation now.

---

## D7 — multi-tenant-context

**Вопрос.** How does a person who holds more than one membership — or who is both an owner and a client of the same salon — change what Maya is talking about?

**Почему это решение владельца.** Tenant is a hard boundary in the data model (Membership unique on userId+tenantId, tenant-scoped row visibility, tenant_id in the JWT payload), so how it is surfaced is an architectural commitment, not a UI preference. It is also genuinely contested by the product's own stage: MAYA today is effectively one salon, where the cheap answer suffices; the SaaS direction makes it insufficient. Two reasonable owners split on whether to build for today or for the direction.

| | Вариант | Что даёт | Что теряет |
|---|---|---|---|
| **A** | No switcher. The identity-bar scope noun is a read-only label. Ambiguity is resolved by a CHOICE widget in the conversation, per request, and only when the request is genuinely ambiguous ('сколько я заработал' vs 'запиши меня на стрижку'). | Cheapest and sufficient for a single-salon product. No persisted context to get wrong, no thread model to decide. Most requests are unambiguous, so the widget rarely appears. | Breaks the moment a real person holds two memberships: every request becomes ambiguous, the CHOICE widget becomes constant friction, and conversation history mixes data from two tenants — which is a problem you then have to unpick under 152-FZ when one tenant asks for erasure. |
| **B** | Explicit TENANT switch, no role switch. The scope noun is tappable and switches tenant (re-resolving membership server-side), with a separate conversation thread per tenant. Within a tenant, owner-vs-client capacity stays resolved per-request by CHOICE, exactly as in A. | Honest about the one boundary that is actually hard in the data model, while refusing the one that is not (role is re-derived from membership every request; a role switcher would be theatre). Thread-per-tenant keeps history, retention and erasure cleanly separable — which D5 and the erasure gap both depend on. Ready for SaaS without a later migration. | More to build now for a benefit that is largely latent at one salon. Thread-per-tenant means a user with two memberships has two histories and cannot ask a question spanning both — correct, but it will be reported as a bug. |
| **C** | Sticky context — the last chosen scope persists across sessions and applies until changed. | Fewest taps for a habitual user; feels 'remembered'. | A persisted, user-chosen, globally-scoped interpretation is the precise definition of the application mode being deleted in D1. It also produces the worst class of incident in this domain: an owner acting for hours inside the wrong tenant without noticing. |

**Рекомендация: B.** The tenant boundary is real in the schema and the capacity boundary is not, so B is the option whose UI matches the data model rather than flattering it. Decide it in THIS cycle even though it looks premature: thread-per-tenant is a storage shape, and retrofitting it after conversations exist is a migration over data that may by then be subject to erasure requests. This is the one place where the cheap answer is genuinely expensive later.

**Обратимость.** A to B is a data migration of existing conversations — painful and getting worse monthly. B to A is trivial. C to anything requires resetting a persisted preference for every user. The asymmetry argues for B now.

---

## D8 — cutover-shape

**Вопрос.** What shape does the retirement of the old screens take?

**Почему это решение владельца.** Deleting without proven parity is already forbidden, so that is not the question. The question is the cutover MECHANISM, which is not settled anywhere and which determines whether the programme is recoverable. The context is unforgiving: three bundles with no build system, no git-based rollback culture for the frontend (per project convention, rollback is .bak files), and a native shell in the field you cannot force-update.

| | Вариант | Что даёт | Что теряет |
|---|---|---|---|
| **A** | Big-bang per wave. When the gate is green, the old shell is removed in one release. No dual-running. | Shortest programme, one migration event, no period of maintaining two shells, no ambiguity about which surface is real. | Makes the parity gate a single enormous boolean, which is exactly the kind that gets waved through under schedule pressure. Rollback means reverting a 2.7 MB source-less single-file bundle across three artefacts plus a native shell — and any user mid-flow at cutover simply loses it. One-way. |
| **B** | Dual-run, capability by capability. The chat shell ships dark behind an entitlement; capabilities move one at a time; each retired surface becomes ENTRY_POINT_DARK (entry removed, code retained) for a defined observation window, then the code is deleted. Owner sets the window. | Every retirement is individually provable and individually reversible — re-lighting a dark entry point is a config change, not a restore. Turns one enormous gate into many small ones that cannot be waved through as a batch. Matches the state machine the migration ledger already defines. | Longer programme. Two shells maintained through the window. Requires sustained discipline to keep the ledger honest, and dark code that nobody can see will rot if the window is allowed to stretch. |
| **C** | Permanent coexistence — the old shell is retained indefinitely as a 'classic' mode. | Nobody is ever forced to move; zero migration risk for the most resistant users. | Permanently doubles the surface count you just spent a cycle reducing, guarantees the legacy authority generation stays operative (it already is, in the older bundle, where the client-preview PII fence does not exist at all), and makes 'chat is the primary interface' false forever. It is not a cutover strategy; it is the absence of one. |

**Рекомендация: B.** B is the only option that is reversible by construction, and reversibility is the scarce resource here given source-less bundles and a native shell you cannot recall. Set the window explicitly with this decision — recommended: successor receipts observed in production for the capability for 30 days or two full business cycles, whichever is longer, AND zero fallbacks to the dark entry — because an unstated window is how dark code becomes permanent code.

**Обратимость.** B is the reversible option (dark entries re-light by config). A is one-way per wave. C is a permanent commitment that forecloses the cycle's whole purpose.

---

## D9 — capability-gap-lane

**Вопрос.** Two of the eight missing capabilities are 152-FZ exposures that exist TODAY. Do they get a remediation lane outside this programme, or do they wait for Wave 5?

**Почему это решение владельца.** Cannot be defaulted because it trades a legal exposure against an architectural fence, and only the owner can price that. The exposure is concrete and verified: outbound copy promises marketing-consent revocation via /unsubscribe and hands off to an app surface that does not exist, and base 152-FZ withdrawal exists only as a phone number in bot copy. The remediation is unusually cheap because the canonical owner is already LIVE — revocation is reachable today via the consent submit path with accept_marketing false, writing an append-only consent fact. So this is a missing INGRESS, measured in days, not a build. Note: this decision authorises a SEPARATE lane; it does not breach this cycle's architecture-only fence.

| | Вариант | Что даёт | Что теряет |
|---|---|---|---|
| **A** | Authorise a separate remediation lane now for the two 152-FZ gaps only (marketing-consent revoke/restore, base personal-data withdrawal), routed through the existing shell to the canonical owner that already exists. The other six gaps stay in Wave 5 in ledger order. | Closes a written promise you currently cannot keep, in days rather than quarters, using an owner that is already live and already append-only — so no new authority path is created. Leaves the chat-first fences completely untouched. | Some genuinely throwaway work: the route you build in the old shell will be rebuilt as a widget later. You are paying twice for two surfaces, deliberately. |
| **B** | All eight in Wave 5, in ledger order, with no out-of-band work. | One programme, one order, one set of fences; no duplicated effort; no precedent for opening side lanes under pressure. | Accepts a live, written, outbound promise of a revocation you cannot honour, for the full length of a multi-wave programme. That is the one cost in this whole plan that is not yours to defer. |
| **C** | All eight remediated now, out of band, before the programme continues. | Clears the entire gap ledger; the chat-first work starts from a complete product with nothing dark. | Three of the eight are genuine builds with no canonical owner anywhere in the repository — a staff Telegram unbind endpoint and a conversation-erasure controller are both verifiably absent. Rushing those outside the programme's fences is exactly how a fourth authority path gets created, which is the failure this cycle exists to prevent. |

**Рекомендация: A.** The two legally exposed gaps are also the two cheapest, because their canonical owners already exist and are already reachable — that coincidence is what makes A dominate. C is wrong for the opposite reason: the gaps with no owner (unbind, erasure) are precisely the ones that must stay inside the programme's fences. Sequence within A: marketing revoke first (it is a route, not a build), then base withdrawal.

**Обратимость.** Fully reversible — the interim route is deleted when the widget replaces it, and it writes to the same append-only canonical owner, so no data is stranded and no second source of truth is created.

---

## D10 — bundle-strategy

**Вопрос.** The chat shell has to be built in a frontend that currently ships as three separate single-file bundles of the same app. Unify first, or build once and freeze the others?

**Почему это решение владельца.** This is the largest hidden cost in the programme and it is not settled by the evidence. The planning material calls unification 'a precondition, not a cleanup' — but I verified that no build system exists anywhere in the canonical repository: there is no build.js and no app-aurora source, only three built artefacts (2.72 MB, 2.51 MB, 1.10 MB). So 'unify first' does not mean refactoring; it means RECONSTRUCTING a build for three source-less bundles before writing a line of the new shell. Two reasonable owners weigh that prerequisite very differently, and getting it wrong is how the programme quietly dies in month three.

| | Вариант | Что даёт | Что теряет |
|---|---|---|---|
| **A** | Unify first — reconstruct sources and a build, produce one codebase with three outputs, then build the chat shell once. | The shell is genuinely built once. Every later contract fence, ratchet and architecture spec applies to one artefact. Ends the class of bug where a fix lands in one bundle and not the others. | Months of prerequisite work with zero user-visible value, on artefacts with no sources, before the chat-first programme produces anything. It is also the highest-risk possible starting point: reconstructing a source tree from a 2.7 MB built bundle is an archaeology project with no natural stopping point and no way to prove you have finished. |
| **B** | Retire the older bundle (redirect it to the live one), freeze the tenant bundle at its current feature set, and build the chat shell once in the live bundle. Unify afterwards, informed by a shell that already works. | The shell is proven in the artefact that actually ships, with user-visible progress from the first wave. Retiring the older bundle also closes a standing exposure on its own merits: it contains zero app_access, zero compat ternaries, and NO client-preview PII fence at all, while still holding a session token and calling the loyalty and panel endpoints — so freezing it in place would be freezing a 152-FZ exposure. Unification later is a smaller, better-specified problem. | The tenant bundle diverges further while frozen, and its later migration is a second project. You accept a period where 'built once' is aspirational. |
| **C** | Build the chat shell in each bundle separately. | Nothing structural. Listed only because it is the de facto outcome if this decision is never made explicitly. | Three implementations of one shell, guaranteed divergence of the authority layer across them, and triple the surface for every contract fence. This is how the current three-generation authority mess was produced in the first place. |

**Рекомендация: B.** A sequences the hardest, least provable work first and gates all user value behind it — and with no sources to recover from, its scope cannot be bounded in advance. B converts the same problem into two smaller ones and closes a real PII exposure as a side effect. One hard precondition on B: the older bundle must be taken out of service or positively proven unreachable with a live session BEFORE anything is frozen — that verification is currently listed as an open item and should be the first task of the lane, not an assumption.

**Обратимость.** B preserves the option to unify at any later point, on better information. A, once started, is very hard to abandon midway — a half-reconstructed build is worse than either endpoint. C is not reversible in practice: three divergent shells never re-converge.

---

## D11 — telegram-channel-status

**Вопрос.** Is Telegram a peer rendering channel of Maya, or a delivery-and-handoff channel only?

**Почему это решение владельца.** I am adding this because it is the largest scope decision hiding inside the inventory and nothing in the approved principles settles it. Telegram is 109 surfaces — the second-largest channel — and it is ALREADY chat-first with patterns the new design explicitly wants to inherit. But roughly 45 registered owner/staff commands are authority-dead: the principal context variable is written only inside the HTTP middleware while the bot runs polling, so authority checks return false for every Telegram-originated update, and those commands still execute and reply. Separately, six capabilities are fenced shut at the body level, so restoring authority would not restore them. So the owner is choosing between funding a real authority path for a second channel, or declaring it a client-and-delivery surface. Both are defensible; the cost difference is large.

| | Вариант | Что даёт | Что теряет |
|---|---|---|---|
| **A** | Peer channel. Fix the Telegram authority path (make the principal resolvable for polled updates), give Telegram a full channel profile, and render envelopes there with the same intent vocabulary as the app. | Masters and owners keep working where they already live, with no app install. Telegram's proven patterns — one capability behind three front doors, help generated from the intent router, deterministic matching before any LLM, a universal escape verb — become first-class rather than folklore. The staff chat mirror already provides the convergence seam. | You are funding a second authority implementation, which is precisely the thing that produced three coexisting generations. It also means Telegram's 64-byte callback budget and its lack of a client-preview fence become constraints on the shared contract, not just on one renderer. |
| **B** | Delivery and handoff only. Telegram carries the 12 proactive outbound moments, client-facing conversation, and links that hand off into the app for anything requiring owner or staff authority. The ~45 authority-dead owner/staff commands are retired as entry points, case by case, after checking each capability's HTTP surface individually. | One authority path, one place to reason about it. Removes ~45 commands that currently reply as though they worked and did nothing — which is worse than their absence. Substantially smaller programme. Aligns with the inventory's own disposition for this class. | Staff who live in Telegram must open the app for anything privileged — a real behavioural cost at a salon where the phone is the work surface. Some of the good Telegram patterns must be re-implemented in the app rather than inherited in place. |
| **C** | Defer — leave Telegram exactly as it is, including the authority-dead commands, and decide after the app shell ships. | No scope added now; the decision is made with more information later. | Leaves ~45 commands answering owners and staff as if they had worked. That is not neutral: it is a channel that silently produces no effect while reporting success, and every month it stays is a month of eroded trust and of support tickets that cannot be reproduced in the app. |

**Рекомендация: B.** B is the only option consistent with 'ONE MAYA — DIFFERENT AUTHORITY' as an engineering commitment rather than a slogan: one authority path, one place it can be wrong. The decisive detail is that restoring Telegram authority would NOT restore the six body-level-fenced capabilities anyway, so option A buys less than it appears to. Retire the entry points, but retire them one at a time against each capability's actual HTTP surface — never on the assumption that the capability is re-presented in the app, which the inventory explicitly warns against.

**Обратимость.** B to A is genuinely reversible — the channel profile mechanism is designed to admit a new renderer without touching the business layer, so promoting Telegram later is additive. C is the only option that gets more expensive with time, because every month adds users who have learned commands that do nothing.

---

