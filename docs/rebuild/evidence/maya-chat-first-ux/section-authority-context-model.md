# The Authority and Active-Context Model

**Scope of this section.** Architecture only. Runtime changes: 0. Schema changes: 0. Migrations: 0. Production mutations: 0. Nothing here deletes a route, a command or a column; it states what each layer *is*, what happens to it, and the test that proves the statement. Every claim carries a file and line from the repository as it stands today.

**The thesis, in one sentence.** MAYA has **one** authority model and **three surviving impressions** of it; this section keeps the model untouched, deletes two impressions, inverts the third from *"which mode am I in"* to *"which tenant am I acting in"*, and makes **"who am I right now"** a server-resolved, always-visible, never-guessed property of the request — not a screen the user picked.

---

## 0. The discriminating test

Two different things in this codebase are both called "role". They must be separated by a test, not by intuition.

> **Apply to any piece of role logic:** *if a hostile client forged this value to its most privileged setting, would any record change, any personal data be returned, or any external effect occur?*
>
> **Yes → authority.** It must be decided server-side, from records, at the moment of the effect, and re-derived on every request.
> **No → presentation.** It may live anywhere, may be wrong, and may be deleted.

**Authority** answers *may this actor cause this effect on this record in this tenant?*
**Presentation** answers *what should this person see first, and what should it be called?*

Part A is that test applied to every surviving call site.

---

## Part A — What Stays, What Goes

### A.1 The authority layer — KEEP, UNTOUCHED

| Layer | Canonical owner (evidence) | Decides |
|---|---|---|
| Session binding | `prisma/schema.prisma:861` `AuthSession(userId, tenantId, revokedAt, expiresAt)`; `auth/auth-session.service.ts` | that a credential is live and whose it is |
| **Tenant binding of the credential** | `auth/jwt.strategy.ts:17` `JwtPayload { user_id, tenant_id, role, session_id }` | which tenant this request is in |
| **Membership** | `prisma/schema.prisma:698` `Membership @@unique([userId, tenantId])`, `status`; `tenancy/memberships.service.ts:11` `getActiveMembership` | whether the actor belongs to that tenant at all |
| **Role** | `auth/jwt.strategy.ts:85` — `role: membership.role as UserRole` | what the actor may do there |
| Client binding | `Membership.customerProfile`; `users/app-access.ts:104` `customerProfileLinked` | whether a client cabinet has a subject |
| Staff binding | `CrmStaffAccess` / `InternalProvider` (`users/users.service.ts:1148–1215`) | whether a staff surface has a subject |
| Tenant-role gates | `@Roles(...)`, e.g. `loyalty/loyalty.controller.ts:13` `LOYALTY_MANAGER_ROLES`; `customer-portal/customer-portal.controller.ts:15` | per-endpoint role floor |
| Tenant scoping | `@TenantScoped()`, `tenancy/tenant-context.service.ts` | row visibility |
| Finance / feature entitlement | `@RequiresFeature('loyalty')`, `entitlements/entitlements.service.ts:51` `getEffectiveEntitlements` | whether the tenant has bought the capability |
| Action authority | `prisma/schema.prisma:363` `ActionExecution` — `identityFingerprint`, `policyKey/policyVersion/policyDecision`, `autonomyLevel`, `normalizedInputHash`, `idempotencyScope` | whether a specific effect may be committed |
| Approvals | `ActionExecution.approvalBindingHash:404`; `Membership` relations `ActionActor` / `ActionApprover` (`schema.prisma:720–721`) | who asked, who approved, four-eyes |

**Nothing in this table is touched by the chat-first refactor. The refactor does not get a vote here.**

One property in this table is load-bearing for everything that follows, and it is already correct:

> **Role is never trusted from the credential.** `jwt.strategy.validate` reads `payload.tenant_id`, then calls `getActiveMembership(user.id, payload.tenant_id)` and returns **`membership.role`** — the token's own `role` claim is ignored. A revoked or downgraded membership therefore takes effect on the **next request**, with no token rotation.

The entire active-context design in Part B is built to preserve this and to add nothing that could bypass it.

### A.2 The presentation layer — candidate for removal

Presentation-mode logic is `app_access.available_modes[].mode ∈ {platform, owner, staff, client}` (`users/app-access.ts:3`) and everything downstream that branches on it to choose a screen, a label or a tab.

What it buys: a landing screen and a vocabulary. What it costs: it is a **mode** — a persisted, user-chosen, globally-scoped interpretation that every feature must then branch on. Today that is 21 router keys (`app.html:39981–40006`) and 42 call sites carrying a compat branch.

Under §0's test, `mode` is presentation: forging it to `platform` changes which screen renders and changes **no** server decision, because every endpoint re-derives from Membership. It is therefore removable — and, because it is a *mode*, it is the single largest obstacle to "roles define authority, not application modes".

### A.3 The three generations — verdict for each

| Gen | What it is | Where | Can it grant? | Verdict |
|---|---|---|---|---|
| **3** | `localStorage.me_is_staff` pre-server route | `app.html:42332–42334`, written `:5431`, `:5657`; cleared `:5557`, `:5672`, `:39782`, `:42140` | No — but it **routes before any server call**, from device-writable state | **DELETE FIRST, UNCONDITIONALLY, NO PARITY GATE** |
| **2** | `window.__meRole`, `__meIsStaff`, `__meIsMaster`, `__meIsFounder`, `__panelInfo.permissions` + 42 compat ternaries | `app.html:5415–5430`, `:5629`, `:5649–5658`; ternaries throughout | No by itself — but it is a **second, divergent answer** to the same question, and it is the **operative** answer in a live older bundle | **DELETE, BEHIND PARITY, AFTER GEN 3** |
| **1** | Server-owned `app_access` | `users/app-access.ts`, `users/users.service.ts:1141/1200/1234`, parsed `app.html:5470–5516` | No — server-authored, fail-closed parser | **KEEP THE TRANSPORT, DELETE THE `mode` FIELD, PROMOTE `tenant_id`** |

#### Generation 3 — delete outright, first, with no replacement

```js
// app.html:42332
var cached=null; try{ cached=localStorage.getItem('me_is_staff'); }catch(e){}
if(cached==='1'){ window.__meGo('choose'); }
else if(cached==='0'){ if(window.__meMode)window.__meMode('client'); window.__meGo('home'); }
```

This cannot open an endpoint — the endpoint still runs JWT + membership. That is exactly why it survives review every time. It is deleted anyway, and first, because it is the only one of the three that is **device-writable**, **pre-server**, and **decision-shaped**. It is a fourth authority path in embryo, and the widget contract's forbidden-key validator (INV-1) exists precisely to stop a fifth. You cannot credibly forbid a key on the wire while keeping a route decision in `localStorage`.

**Replacement: none.** The correct cold-start behaviour is a neutral shell that renders **no privileged affordance** until `/me` answers. The reason this cache exists is perceived latency; latency is solved by rendering the shell, not by guessing the answer. Deleting it changes cold-start *feel*, not cold-start *authority* — everything it routes to needs a server round trip regardless.

#### Generation 2 — delete the ternaries first, then the globals

The globals are a presentation cache. The **42 compat ternaries** are the actual defect:

```js
typeof meAppAccessViewManager === 'function' ? meAppAccessViewManager() : meSaasIsManagerRole(role)
typeof meAppAccessViewBusiness === 'function' ? meAppAccessViewBusiness()  : meSaasIsBusinessRole(saasRole)
```

They encode a second answer that **no test ever compares against the first**. And this is not hypothetical. `maya-os-site/index.html` — build tag `2026-08-01`, an older build of the *same* single-file app — measures as follows:

| Symbol | `сайт и приложение/app.html` | `maya-os-site/index.html` |
|---|---|---|
| `app_access` | 20+ sites | **0** |
| `typeof meAppAccess…` compat ternary | 42 lines | **0** |
| `function meAppAccessViewManager` | 1 | **0** |
| `function meSaasIsManagerRole` | 1 | 1 |
| `__meClientPreview` / `meAppAccessIsClientPreview` | present | **0** |
| `me_is_staff` | 9 sites | 5 |
| `__meIsStaff` | present | 7 |
| `web_session_token` / `Authorization` / `panel_me` / `loyalty/me` | present | 15 / 66 / 8 / 7 |

In that bundle **every compat ternary would take the legacy branch**, Generation 1 is absent entirely, and **the client-preview fence does not exist at all** — while the same file holds a session token and calls `loyalty/me` and `panel_me`. Generation 2 is not "still present"; it is the operative generation in a bundle that ships.

*Not verified here, and it must be verified before Chapter 10:* whether that bundle is currently reachable at a URL with a live session. This is stated as an open item, not as a proven exposure.

One carve-out: `__meIsFounder` is derived from `meIsFounderUser(user)` — i.e. from the server-signed role — under an explicit comment forbidding inference from "owner with full access" (`app.html:5406–5412`). Its **value** is server-derived; only its **cache** is a global. It follows Generation 2's fate, but the derivation *moves into the context object*; it does not disappear.

#### Generation 1 — keep the mechanism, invert the payload

This is the one non-obvious call in Part A, so the reasoning is explicit.

`buildAppAccessContext` is the **right mechanism** and the **wrong payload**.

Right mechanism, on three counts:
1. It is server-authored and derives modes exclusively from access records (`app-access.ts:52–56`).
2. The client parser **fails closed**: `meAppAccessNormalize` returns `null` on any deviation, and the caller routes to `access-compat` with *«Сервер не вернул контракт app_access. Обновите backend MAYA OS — локально права не повышаются.»* (`app.html:5470–5516`, `:5581`). It degrades to a wall, never to the legacy path.
3. It already refuses to let a weaker access level leak onto a business surface: `if (mode !== 'client' && level !== 'granted') return null;` under the comment *"Preview is a deliberately restricted client surface, never a staff shortcut"* (`app.html:5490–5491`).

Wrong payload, on one decisive count: **every descriptor it emits carries the same `tenant_id`.** `serializeCurrentUser` derives a single `tenantId` from `serialized.tenant_id` and passes it to all three call sites (`users.service.ts:1131, 1141, 1200, 1234`). `app_access` therefore enumerates **roles within one tenant** and calls them *modes*.

That is precisely backwards for a chat-first, multi-tenant product:

> **The thing that varies and must be made explicit is the tenant. The thing that must never be a user-selected mode is the role.**

**Disposition.** Keep `schema_version`, the fail-closed normalizer, the compat screen, and the preview rule. Replace `available_modes[]` with `contexts[]`; **drop `mode`**; keep `tenant_id`, `role`, `access`, `profile_linked`; rename the contract `active_context/1`. Presentation becomes **derived at render time** — `presentation_mode = f(context.role, context.access)` — never persisted, never chosen.

The storage key dies with the mode: `me_app_mode_v1:<tenant>:<user>` (`app.html:5476`) is replaced by `me_active_context_v1:<user>` holding a **membership id** — a fact the server will validate — instead of an interpretation the client invented.

### A.4 Order of operations

Each step is independently shippable and independently reversible. Nothing is deleted before the step above it is green.

| # | Step | Gate before merge |
|---|---|---|
| 1 | Remove the `me_is_staff` pre-route; render a capability-free shell until `/me` answers | No privileged affordance appears before the first `/me` response, verified by network-ordered test |
| 2 | Collapse all 42 compat ternaries to the server-derived helper; make the helper's absence a **hard failure**, not a fallback | Static: 0 compat ternaries; runtime: missing helper → `access-compat`, never legacy |
| 3 | Converge the three bundles onto one; `maya-os-site/index.html` and `app-tenant.html` stop being independent authority surfaces | Parity of the five preview fences (Part C.4) in every shipped bundle |
| 4 | Delete the Generation-2 globals; `__meIsFounder` derivation moves into `ActiveContext` | `AUTH-INV-5` ratchet (Part D.3) at zero |
| 5 | `app_access@1` → `active_context/1`: drop `mode`, add multi-tenant `contexts[]` | `AUTH-INV-1` (Part D.2) green across both shapes |
| 6 | Retire mode-derived screens as capability parity is proven, one at a time | Widget-contract INV-16, per capability |

### A.5 What explicitly does not change

`@Roles`, `@TenantScoped`, `@RequiresFeature`, `EntitlementsService`, `ActionExecution` and its policy/approval binding, `getActiveMembership`, the JWT strategy's re-derivation of role, and the per-endpoint self-scoping of `me`-shaped reads. The refactor removes the *user's experience* of roles. It removes none of the *server's* use of them.

---

## Part B — The Multi-Context User

### B.0 What the evidence already says

**The disambiguation mechanism already exists, in production, at the right place, in the right shape.** `auth/email-auth.service.ts:466–480`:

```ts
if (valid.length > 1) {
  return {
    ok: true,
    next_step: 'select_business',
    businesses: valid.map(({ candidate }) => ({
      name: candidate.tenant!.name,
      role: candidate.role,
      slug: candidate.tenant!.slug,
    })),
  };
}
```

One verified email that resolves to more than one tenant does **not** get a guessed session. It gets an enumerated question carrying `{name, role, slug}`, and the session is issued only after the person names the tenant. When exactly one candidate survives, the session is issued silently. The client already renders it (`app.html:7749`, *«Выберите бизнес, в который хотите войти.»*).

**Part B is therefore a generalisation of a shipped mechanism from the login moment to every moment — not an invention.**

The substrate exists too:
- `Membership @@unique([userId, tenantId])` — many memberships per user, with `status`.
- `projectTenantMembership(user, tenantId)` (`users.service.ts:1244`) projects a user into any one of their memberships.
- `findEmailLoginCandidates(email)` (`users.service.ts:128`) already enumerates `(user × active membership)` across **all** tenants and flat-maps them into projections.
- Client sessions are namespaced per `(apiBase|slug)` via `ns` (`app.html:742–749`), so several tenant sessions **already coexist on one device without colliding**.

**What does not exist and must be built** — stated plainly rather than assumed:
1. Any representation of more than one tenant in `/me`. `app_access` is structurally single-tenant (A.3).
2. A `/me/contexts` enumeration available *after* login, not only during it.
3. A context switch that mints a session for another membership **without re-authenticating**.

**One data-model ambiguity that the design must route around, and that the schema does not settle.** `User` is tenant-scoped (`@@unique([tenantId, email])`, `schema.prisma:658`) *and* `Membership` is many-per-user. Whether "one human across three tenants" is one `User` with three `Membership`s or three `User` rows each with one is **not determined**; `findEmailLoginCandidates` handles both by flat-mapping. The decision follows from that, and it is decisive:

> **The unit of context is the `Membership` — not the `User`, and not the `Tenant`.**

Everything below keys on membership id. That is correct under either representation and needs no migration to become true.

### B.1 `ActiveContext@1`

Server-authored. Never client-authored. Derived per request; never stored in the token.

```ts
interface ActiveContext {          // 'maya.active_context/1'
  context_id: string;              // = Membership.id. The unit of context.
  tenant_id: string; tenant_name: string; tenant_slug: string;
  role: UserRole;                  // re-derived from Membership every request
  access: 'granted' | 'preview';   // = bindings.client === null ? 'preview' : 'granted'
  bindings: { staff: 'linked' | null; client: 'linked' | null };
  entitlements_ref: string;
  established_by: 'credential' | 'sole_candidate' | 'user_selection' | 'object_follow_confirmed';
  established_at: string;
}
```

The credential continues to carry **`tenant_id` and `session_id` only** — exactly as `JwtPayload` does today. `role` stays out of it. `ActiveContext` is assembled by `jwt.strategy` + `getActiveMembership`, unchanged in substance.

### B.2 Resolution — a deterministic ladder

Five rungs. Each either yields **exactly one Membership** or falls through. It never merges, never unions, never defaults.

| Rung | Rule | Status |
|---|---|---|
| 1 | **Credential.** The session's tenant binding. | Already implemented (`jwt.strategy.ts:74–88`) |
| 2 | **Sole candidate.** Exactly one active Membership → **never ask.** | Mirrors `valid.length === 1` |
| 3 | **Unambiguous target.** The named object (appointment, approval, client, report) belongs to exactly one of the person's memberships. | Yields a **proposal**, never a switch (B.6b) |
| 4 | **Sticky last choice, re-validated.** `me_active_context_v1:<user>` → a membership id, used **only if still active and still this person's**. | Orders the options. **Never grants.** |
| 5 | **Ambiguous.** More than one candidate survives. | → ask (B.4) |

> **Bottom of the ladder.** If the ladder does not terminate at exactly one Membership, **no capability of effect ≥ DRAFT executes**, and read capabilities do not execute either — they render the question instead. **There is no default tenant.**

### B.3 When it is unambiguous — never ask

- The person has one active membership (rung 2).
- The credential is tenant-bound and the request names no other tenant (rung 1). This is the overwhelmingly common case.
- **Every widget tap.** The `IntentRecord` stores `tenant_id` and `principal_proof_hash` at mint time, so a minted intent's context was fixed before the user could see the button.

That last point is a structural consequence worth stating as a design property:

> **The widget contract removes context ambiguity by construction for every tap.** Ambiguity can enter only through free text, voice, deep links, and proactive moments. Those four are the entire surface the disambiguation question has to cover.

### B.4 When it is ambiguous **and material** — ask, in one shape

**Materiality test.** Ask only when *both* hold:
(a) more than one candidate survives the ladder, **and**
(b) the answer changes the result.

(b) is **checked, not assumed**: resolve the capability against each candidate and compare. If a read returns the identical answer in every candidate, answer it and say which contexts it covered. If the answers differ, or the effect is ≥ DRAFT, ask. A person who says *"сколько у меня записей сегодня"* and has one context with appointments and two without gets an answer, not an interrogation.

**Exact question shape** (normative). It is a widget of `kind: 'CHOICE'`, `effect: 'REFINE'`, `capability: null` — it **cannot itself cause an effect**:

```
title     В каком бизнесе?
prompt    «отмени запись на завтра» — у вас доступ к 3 бизнесам.
          Это действие выполняется в одном.

  1  Мужская Эстетика          Владелец · ваш бизнес
  2  Barbershop на Ленина      Мастер
  3  Студия «Контур»           Клиент

escape    Отмена            (role:'escape', priority:0, /cancel, «отмена | стоп | не надо»)
```

Binding rules on that question:

1. **No option is pre-selected. No default. No timeout that picks.**
2. **The question names the effect, not the screen** — *«Отменить запись — в каком бизнесе?»*, never a bare *«Выберите бизнес»*. The user is choosing where an action lands, not which app to open.
3. **Every option states the role**, because the same verb means different things at different authority. This is already the shipped shape: `{ name, role, slug }`.
4. **Asked once per action for COMMIT-class effects** — never "remembered" for a commit. Rung 4 stickiness may order the list; it may never answer the question.
5. **The original `intent_token` is not reusable.** It was minted with a `tenant_id`. Answering produces a **new** intent resolved in the chosen context, which forces the fresh canonical read the widget contract already requires (handles-as-nouns). Cross-context token reuse is not a rule anyone must remember; it is not expressible.
6. **Text equivalent mandatory**, with the ordinal enumeration, so the identical question works in voice, SMS and a screen reader (widget contract R1/I5).
7. If more than ~7 contexts survive, degrade to a searchable `FORM` with justification `MULTI_FIELD_ATOMIC`. **Note honestly:** nothing in this repository evidences a user with more than a handful of memberships. Do not build the 50-tenant case until one exists.

### B.5 Persistent display — the user is never confused about who they are

1. **The context label lives in the composer, not in a corner.** Chat-first means the address sits on the envelope you are writing, at the moment you write it.
2. **Format: `<tenant name> · <role word>`** — *«Мужская Эстетика · владелец»*. This is the **only** place role vocabulary survives in the UI, and it is descriptive of authority, not selective of a mode.
3. **It renders from the `ActiveContext` on the last server response — never from a local variable.** If the last response carried none, it renders the UNKNOWN state (neutral, self-explaining, with a `next_intent_ref`), never the previous value and never a guess. UNKNOWN is a statement, not a failure.
4. **Every assistant turn is stamped with the context it was answered in**, and the stamp is part of the durable message record. A conversation may legitimately contain more than one context; scrollback after a switch must stay unambiguous. Re-reading history never re-establishes context — history is a presentation surface, never business state.
5. **On switch, outstanding widgets from the previous context visibly retire.** `principal_proof_hash` changes with the membership, which already invalidates every outstanding envelope; the renderer must collapse them to `resolved_summary_text` plus *«выполнено в другом бизнесе»* rather than leaving live-looking buttons from another business on screen.
6. **Single-context users see the label too, but quietly** — no switcher affordance, because `contexts.length === 1`. (This is today's `can_switch_mode`, kept and re-pointed at tenants.)

### B.6 Switching without becoming a mode selector

> A **mode selector** asks *"who do you want to be?"*. A **context switch** answers *"which business is this about?"*. The first is an identity claim; the second is an addressing fact.

Therefore:

- **There is no context switcher in navigation.** No tab, no primary menu entry. A switcher in the chrome is a mode selector wearing a different hat.
- **Switching happens in exactly three ways:**
  - **(a) Answering the disambiguation question.** The dominant path, and the only one that exists at the moment of an action.
  - **(b) Following an object.** Opening an approval, appointment or report that belongs to another of your memberships. The system **proposes** — *«Эта запись — в „Студия Контур". Перейти туда?»* — and never follows silently. This is what keeps rung 3 non-authoritative.
  - **(c) Saying it.** *«переключись на Контур»* is an intent with `effect: 'NAVIGATE'`, matched **deterministically against the person's own context list before any LLM**, and carrying no capability. An LLM never names a tenant that the person's membership list does not already contain.
- **A switch mints a new session bound to the other Membership.** It is an authentication-layer event, not a UI state change: new `ActiveContext`, new `principal_proof_hash`, previous context's intents dead, one audit line. **This is the structural reason it cannot decay into a mode selector** — a mode is free and reversible by a tap; a context switch has a cost and leaves a record.
- **A switch never raises verification.** If a capability in the target context requires `SESSION_VERIFIED` or `STEP_UP_VERIFIED`, that is enforced at the capability, after the switch, exactly as today. Switching is lateral, never upward.
- **A switch never carries a draft across.** Drafts are server-owned and tenant-owned; a draft abandoned by a switch stays recoverable in its own tenant. Migrating one would be a business mutation caused by a presentation act, which is the exact thing this architecture forbids.

**Cross-context reads.** A person with three contexts may see a cross-context digest — it is a *list of per-context results, each stamped*, and every actionable affordance on it is a `NAVIGATE` that establishes a context first. **Cross-tenant aggregation of numbers is forbidden**: there is no canonical owner of a summed-across-tenants figure, and the widget layer may not compute one. A digest may say "3 approvals waiting in 2 businesses"; it may not say "your revenue this month" across tenants.

### B.7 The absolute rule

> ### INV-CTX — No action executes in a guessed tenant.
>
> Every capability invocation carries a `context_id` that is a **Membership id the server itself resolved for this principal on this request**. If resolution did not terminate at exactly one Membership, the invocation is refused with `context_required` plus the candidate list; **zero `ActionExecution` rows are written and zero provider calls are made.**
>
> **Enforcement is by absence, not by a check.** The canonical entry point takes `ActiveContext`, not `tenantId: string | null`. There is no signature that accepts an unresolved context, so there is no code path that can forget to check — the same technique the widget contract uses to make a booking COMMIT token non-existent until a canonical draft exists.

**"Guessed" is defined, so the rule is falsifiable.** A tenant is **guessed** whenever its value came from anything other than (i) the signed credential, (ii) the sole surviving candidate, or (iii) an explicit answer recorded in this turn. In particular it is guessed if it came from: the last tenant used, the URL, a channel identity, a push subscription, the widget the user happens to be looking at, the screen name, or an LLM's inference from free text.

---

## Part C — The Five Preview Fences

### C.1 What "preview" actually is

`users/app-access.ts:104–113`:

```ts
const hasClientAccess = customerProfileLinked || CLIENT_ROLES.has(role);
if (tenantId && (hasClientAccess || hasBusinessMode)) {
  availableModes.push({ mode: 'client', access: hasClientAccess ? 'granted' : 'preview', ... });
}
```

> **Preview = "you are being shown the client surface of a tenant in which you are not a bound client."** It is the owner or staff member looking at their own client app. It is not a degraded client. It is a **non-client**.

### C.2 The five, located

| # | Fence | Site | What it stops | Layer |
|---|---|---|---|---|
| 1 | **Downgrade + parser refusal** | `app-access.ts:111`; `app.html:5490–5491` | preview being minted for a business surface; a tampered payload smuggling `preview` onto owner/staff | server + fail-closed parser |
| 2 | **Wipe on entry** | `app.html:5673–5675` — `__meResetCabinetData()` then `__meCabinetState='preview'` | the **previous person's** cabinet, still resident in module memory within the same `ns`, rendering under a new principal | client state |
| 3 | **Body replacement / entry denial** | `app.html:5921` (cabinet tab → `go('home')`), `:9390`, `:13929` (`MAYA OS · Просмотр`) | the app *promising* a personal cabinet that has no subject | presentation |
| 4 | **Request refusal** | `app.html:12540` `loadMyLoyalty`, `:12895` `loadMyAppts`, `:16312` `ALoyaltyCard.load` | the client *asking* for personal history and points | egress |
| 5 | **Hydrator refusal** | `app.html:41329–41356` — preview fetches **only** `/staff`; skips `/customer-portal`, `/me`, `/appointments/my`, `/loyalty/me` | CRM personal data entering the client read model at all | ingress |

### C.3 An honest reading — which one is the cross-subject control

This matters, because getting it wrong is how five fences become one.

Fences **3, 4 and 5 sit in front of a server that is already self-scoped**:

- `GET /loyalty/me` → `getForUser(user.tenantId!, user.userId)` (`loyalty.controller.ts:30`)
- `GET /appointments/my` → `listClientAppointments(user.tenantId!, user.userId)` (`appointments.controller.ts:55`)
- `GET /customer-portal` → `getOverview(user.tenantId!, user.userId)`, under a comment stating it *"changes the available surface without widening access to another customer"* (`customer-portal.controller.ts:14, 43`)

A preview principal calling these gets **their own** (empty) records, not somebody else's. **They are not the last line against cross-subject disclosure; the server's self-scoping is.**

What the five actually are:

- **Fence 2 is the genuine cross-subject control.** It governs client-resident state left behind by a previous principal in the same origin namespace. It is the one to protect hardest.
- **Fences 3, 4 and 5 are the 152-FZ minimisation control**: do not request, cache or render personal data for a principal who has no lawful relationship to that data in this tenant — *even data shaped like their own*. That is a distinct and real obligation.

Saying this plainly is what makes the refactor safe. If engineers believe 3/4/5 are the PII boundary, they will consolidate them into one helper and feel safe. If they know 2 is the cross-subject control and 3/4/5 are minimisation, they will keep five.

### C.4 How each survives — and where it gets stronger

The refactor removes modes, so `meAppAccessIsClientPreview()` — which reads `__meAppMode === 'client' && __meAppModeAccess === 'preview'` (`app.html:5586`) — loses its left operand. Preview is therefore **re-anchored to the binding, not the mode**:

> `access === 'preview'` ⟺ `bindings.client === null`.

Preview stops meaning *"which mode did you choose"* and starts meaning *"do you have a client binding in this tenant"* — which is what it always meant, and what the server already computes. **This is a strengthening, not a preservation: after the refactor, preview cannot be escaped by selecting a different mode, because there are no modes.**

| # | Disposition |
|---|---|
| 1 | **Unchanged.** Stays in `buildAppAccessContext`. The parser rule becomes: `access === 'preview'` is legal only when `bindings.client === null`; anything else fails closed to the compat screen. |
| 2 | **Widened.** Today the wipe fires on entering client presentation. There is no such event afterwards, so it must fire on the event that actually matters: **any change of `context_id` or `principal_proof_hash`** — one `onPrincipalChange` subscriber, not a call inside a mode applier. This is strictly more often than today and additionally closes the switch case (owner of A → client of C must not see A's resident state). |
| 3 | **Becomes capability absence.** In a context with no client binding, `loyalty.me.read`, `appointments.own.read` and `customer.portal.read` are simply **not in that person's registry for that context**, so no widget can be minted for them (no canonical owner → a `Limitation` with a gap ref, never an intent). The "cabinet tab sends you home" redirect disappears because there is no tab and no offer. |
| 4 | **Promoted to the server.** The client-side refusals stay as belt-and-braces, but the authoritative version becomes a typed refusal for a principal whose `bindings.client === null` in that tenant. **This is a Chapter-10 proposal, not a claim about today**: today those endpoints answer with the principal's own empty records. It is the one place where this refactor should *add* server enforcement rather than preserve client enforcement. |
| 5 | **Relocated, unchanged in spirit.** The hydrator dies with the mode-driven screens; the rule survives as a **projector rule**: a projector may not name a PII-class capability when `pii_class` would be `client_identified` and `subject_is_principal` is false. |

**Compatibility with the widget contract's sixth display fence.** The contract's A4 rejects `pii_class:'client_identified'` + `presentation_mode:'client'` unless `subject_is_principal`. That is an **emission-time** fence. Fence 5 is a **projection-time** fence. They are not the same check at two altitudes; both run. A4 is the sixth, not a replacement for any of the five.

### C.5 `PREVIEW-PARITY` — the test that keeps them five

Fixture: a principal who is owner of tenant A with **no** `CustomerProfile` in A.

| Fence | Observable that must fail if the fence is gone |
|---|---|
| 1 | `/me` (or successor) reports `access:'preview'`, and reports it on **no** non-client-bound business context |
| 2 | Seed subject X's cabinet; switch principal to Y in the same namespace; a deep scan of client state contains **zero** of X's sentinel values |
| 3 | No emitted envelope for that principal names `loyalty.me.read` / `appointments.own.read` / `customer.portal.read`, and no `text_equivalent` offers them |
| 4 | Network assertion: **zero** requests to those paths during a full walk of the surface |
| 5 | **Zero** `client_identified` cells in any envelope minted for that principal |

> **Independence clause — this is the part that actually protects "five".** Mutation test: disable **exactly one** fence and assert that **exactly one** observable fails. If disabling one fence breaks two observables, the fences have been collapsed and the change is **rejected**, regardless of whether the suite is otherwise green.

---

## Part D — Role Removal From UX ≠ Role Removal From Security

### D.1 The permanent invariant

> ### ROLE REMOVAL FROM UX ≠ ROLE REMOVAL FROM SECURITY
>
> Roles cease to be something the user **inhabits** and remain, unchanged, something the server **checks**. Every authorization decision in MAYA is made by re-reading records at the moment of the effect — Membership, CustomerProfile, CrmStaffAccess/InternalProvider, entitlements, action policy — and **no authorization decision reads any value that describes what the user is looking at.**
>
> **Corollary, and the only form that is actually testable:**
> **Deleting the entire presentation layer must change zero authorization outcomes.**

### D.2 The concrete test — `AUTH-INV-1` (Presentation Excision)

```
1. Build B0: the current server, unmodified.

2. Build B1: byte-identical except the presentation layer is EXCISED:
     - buildAppAccessContext() returns the empty context
         { schema_version: 1, default_mode: null, available_modes: [],
           can_switch_mode: false, chooser_required: false }
     - every presentation field is stripped from GET /me
     - presentation_mode and AuthorityHint are stripped from every widget envelope

3. Run the full authorization corpus against both:
     for each (principal fixture × capability key × target object) record
       ( HTTP status,
         error code,
         the set of returned row ids,
         the ActionExecution / audit rows written )

4. PASS  ⟺  the two result sets are IDENTICAL.
   FAIL  ⟹  the differing case names the file and line where presentation
            has become authority.
```

**Why this test and not a checklist.** A checklist proves the checks you thought of. Excision proves the **class**: any outcome that differs between B0 and B1 is, by definition, a place where a presentation value fed a decision — and the diff points straight at it. It is an equivalence proof, not a spot check, and it is cheap because both builds run the same corpus.

**Corpus.** The C9 capability registry has 57 entries. The principal fixtures must include at minimum these nine:

| Fixture | Pins |
|---|---|
| platform owner (no tenant) | the `!payload.tenant_id` branch (`jwt.strategy.ts:64–72`) |
| tenant owner **with** staff profile | the owner+staff dual-descriptor branch |
| tenant owner **without** staff profile | that staff is not inferable from owner |
| staff **with** CRM link | `CrmStaffAccess` path |
| staff **without** link (`profile_linked:false`) | that staff role still grants while the profile is unlinked (`app-access.ts:88–96`) — correct today, and must stay pinned |
| client with `CustomerProfile` | `granted` |
| **preview principal** (business role, no `CustomerProfile`) | the entire Part C boundary |
| **multi-context principal** (owner of A / staff of B / client of C) | Part B |
| **revoked-membership principal** (token still valid, `membership.status ≠ active`) | `AUTH-INV-1b` below |

> **`AUTH-INV-1b` — Revocation Without Rotation.** With an unexpired, unrevoked access token whose `Membership.status` has just changed to inactive, **every** capability must refuse on the **next** request, with no token rotation and no logout. This pins the single most important existing property in the system: role comes from `getActiveMembership`, not from the credential.

### D.3 The supporting four

| Test | What it does | PASS |
|---|---|---|
| **`AUTH-INV-2` Presentation Forgery** | Replay every call with maximal privilege claimed in every client-controllable position: `mode`, `presentation_mode`, `role`, `is_staff`, `me_is_staff`, `__meRole`, `__panelInfo.permissions`, a hand-built `app_access`, an `AuthorityHint` with `required_authority:'PLATFORM'` | Byte-identical response **and** identical audit rows to the unforged call. *This is the test that would have caught Generation 3 had it existed.* |
| **`AUTH-INV-3` Context Substitution** | Multi-context fixture; valid session for A; replay every request with tenant hints for B and C in every position **except** the signed credential | Answered in A, or refused. Never B, never C, never merged. Negative assertion: no response body contains a row whose `tenantId` ≠ the credential's. |
| **`AUTH-INV-4` No Guessed Tenant** | Every capability of effect ≥ DRAFT invoked with an unresolved context | `context_required` + candidate list, **and zero `ActionExecution` rows and zero provider calls.** Assert on the **absence of side effects**, not on the status code — a refusal that already wrote a row is a failure. |
| **`AUTH-INV-5` Forbidden-Identifier Ratchet** (static, every commit) | No authority-shaped identifier on any client path that reaches a decision; no forbidden key at any depth of a widget envelope or submission | Counts may only **decrease**. Baselines measured in this repository today: `сайт и приложение/app.html` — 42 compat-ternary lines, 9 `me_is_staff` sites; `maya-os-site/index.html` — `app_access` **0**, `__meClientPreview` **0**, `me_is_staff` **5**, `__meIsStaff` **7**. A build that raises any of these fails. |

### D.4 What these tests do **not** prove

Stated so nobody reads a green suite as more clearance than it is.

1. **They do not prove the authority model is *correct*** — that a given role *should* be able to do a given thing. That is policy, owned by the action-policy layer and the capability registry, and it is out of scope for this section. These tests prove only that presentation is not authority.
2. **They say nothing about the Telegram channel.** Telegram authority is separately dead by mechanism: the `canonical_staff_access` `_principal` ContextVar is written only inside the aiohttp HTTP middleware while the bot runs `start_polling`, so `is_admin()` / `is_staff()` return `False`/`None` for every Telegram-originated update. `AUTH-INV-1` run against the bot would pass **trivially and meaninglessly**, because there is no authorized path to compare against. Six capabilities are *additionally* fenced at the body level by the P4/P5 cutover; restoring the principal would not restore those.
3. **They do not establish whether `maya-os-site/index.html` is reachable with a live session.** That is an open verification item (A.3), and it is the highest-value thing to check before Chapter 10, because that bundle runs on Generations 2 and 3 with **no** preview fence.

---

## Summary of dispositions

| Layer | Disposition | Gate |
|---|---|---|
| Membership, Client binding, Staff binding, tenant role, entitlement, action authority, approvals | **UNTOUCHED** | `AUTH-INV-1` |
| `localStorage.me_is_staff` pre-server route (Gen 3) | **DELETE FIRST, unconditionally, no replacement** | none required — it grants nothing |
| `window.__me*` globals + 42 compat ternaries (Gen 2) | **DELETE** — ternaries first, then globals; `__meIsFounder` derivation moves into `ActiveContext` | `AUTH-INV-5` ratchet to zero |
| `app_access.available_modes[].mode` (Gen 1 payload) | **DELETE the field** | capability parity, per screen |
| `app_access` transport, fail-closed parser, compat screen, preview rule (Gen 1 mechanism) | **KEEP**, renamed `active_context/1`, `tenant_id` promoted, `contexts[]` replaces `available_modes[]` | `AUTH-INV-1` across both shapes |
| Client-preview: five fences | **ALL FIVE SURVIVE**, re-anchored from mode to binding; fence 2 widened to any principal change; fence 4 promoted to the server | `PREVIEW-PARITY` + the independence mutation test |
| Multi-context resolution | **BUILD**, as a generalisation of the shipped `select_business` mechanism | `AUTH-INV-3`, `AUTH-INV-4` |
