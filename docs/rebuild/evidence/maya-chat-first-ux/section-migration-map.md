# Migration Map and Retirement Policy

**Scope of this cycle: architecture only.** This section defines a ledger, a gate, and an order. Producing it requires 0 runtime changes, 0 schema changes, 0 migrations, 0 production mutations. Chapter 10 is not started. Nothing in this section authorises deleting a tab, a screen, a route, a command or a file. The only mechanism that may ever authorise a deletion is the **Capability Parity Gate (§3)**, and it authorises nothing until it is green for a specific row.

Throughout, `<REPO>` = `/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/maya-identity-consent`.

---

## 0. What I verified before designing, and what changed because of it

Four claims in the inventory were load-bearing enough for the migration order that I re-derived them from the repository. Three confirmed, one corrected, and two of the eight capability gaps turned out to be materially cheaper than the inventory implies.

| Claim | Verdict | Evidence |
|---|---|---|
| One app-level router, object map `S`, 21 keys, silent fallback | **CONFIRMED** | `<REPO>/сайт и приложение/app.html:39130` (map opens), `:39157` `const cur = S[screen] \|\| S.login`. 21 keys counted. |
| Screen key `role` referenced, no entry, dead routing | **CONFIRMED** | `screen === 'role'` at `app.html:40476` and `:40593` — two guard branches that can never be true. `role` is absent from `S`. |
| Self-mounting overlays at `zIndex 2147483000` bypass the router | **CONFIRMED, count corrected to SIX** | Six functions create their own `document.body` host: `openMayaCommunityModeration` (`:33068`), `openMayaNativeFeedback` (`:33090`), `openMayaCashDeclaration` (`:33138`), `openMayaExpenseIntake` (`:33178`), `openMayaGovernedSettings` (`:33262`), `openMayaTeamCommunications` (`:38331`). The seventh occurrence of that z-index is `#maya-splash` at `:15880`, which renders **in-tree** from a component and is not an overlay. |
| `localStorage.me_is_staff` routes before any server call | **CONFIRMED** | `app.html:41533–41535`: `cached=localStorage.getItem('me_is_staff')`; `if(cached==='1'){ window.__meGo('choose'); }` — then `POST ?action=panel_me` at `:41542`. |
| Marketing-consent revocation has no canonical owner | **CORRECTED — the owner is LIVE** | `<REPO>/maya-saas-backend/src/package5-wave3/package5-wave3-canonical-cutover.service.ts:351` — `decision: granted ? 'grant' : 'revoke'`, written as an append-only `clientConsentFact` (`package5-wave3.service.ts:1375`). Reachable today via `POST /api/consent/submit` with `accept_marketing:false` (`<REPO>/ai администратор/webhook_server.py:4796`). |
| Loyalty redemption / gift certificates are severed | **CORRECTED — the owner exists, the *ingress* is missing** | `webhook_server.py:4677` returns `409 p4_03_canonical_loyalty_ingress_required`; `:4897` returns `503 canonical_gift_certificate_ingress_required`. The canonical owners are present: `<REPO>/maya-saas-backend/src/loyalty/p4-03-legacy-loyalty-executable.service.ts`, `.../loyalty/loyalty-redemption-claim.contract.ts`, `<REPO>/maya-saas-backend/src/gift-certificates/p4-06-gift-certificate-executable.service.ts`. The error strings name what is missing: an *ingress*. |

**Consequence for the whole plan.** The eight "capabilities with no route" are not one class. They split 2 / 3 / 3 into route-only restorations, ingress builds, and genuine capability builds (§7). The two legally exposed ones are in the cheapest tier. That is why §8 puts them in Phase 2, ahead of every retirement.

---

## 1. The migration map

### 1.1 It is a ledger, not a document

One row per surface, 795 rows, never fewer. A row is never deleted; it terminates in a state. The map's value is that it can be queried — "show me every row in `ENTRY_POINT_DARK` whose capability has no successor receipt in 14 days" — and a prose document cannot answer that.

```ts
interface MigrationRow {
  surface_ref: string;          // stable, permanent, survives file moves. See §1.2.
  channel: Channel;             // one of the 17
  locator: SurfaceLocator;      // §1.2 — how to find it TODAY
  capability_key: string | 'NO_CAPABILITY' | 'UNMAPPED';
  disposition: Disposition;     // the six, plus UNTRIAGED
  new_home: NewHome;            // §1.3 — closed union
  parity_clauses: GateClause[]; // which of G1..G9 bind this row (§3)
  parity_state: ParityState;    // §4 — the state machine
  cutover_owner: CutoverOwner;  // §1.4 — exactly one
  phase: 0|1|2|3|4|5|6|7|8;     // §8
  blocking_gaps: string[];      // capability_gap_ref values; non-empty ⇒ gate is RED
  evidence_refs: string[];      // file:line, receipt ids, test names
  supersedes: string[];         // surface_refs merged into this one
  notes_unverified: string[];   // claims not reproduced; see §9
}
```

### 1.2 Surface identity — the part everyone gets wrong

A surface must be addressable after the file it lives in has been edited, renamed or deleted. `app.html:33068` is not an identity; it is a locator that will be wrong next week. The identity is the tuple that survives:

```
surface_ref = <channel>:<kind>:<stable-name>
```

| Channel kind | Stable name is | Example |
|---|---|---|
| `pwa:route` | the router key in `S` | `pwa:route:staff-clients` |
| `pwa:overlay` | the query parameter *and value* | `pwa:overlay:expenses=reminder` |
| `pwa:component` | the exported component name | `pwa:component:AMayaCashDeclaration` |
| `telegram-bot:command` | the registered command string | `telegram-bot:command:export_consents` |
| `telegram-bot:intent` | the intent-router key | `telegram-bot:intent:book_record` |
| `backend:route` | HTTP method + path | `backend:route:POST /api/consent/submit` |
| `scheduler:job` | the job name | `scheduler:job:weekly_expense_reminder` |
| `web-push:moment` | the ProactiveMoment | `web-push:moment:birthday_alert` |
| `native-shell:contract` | the plugin method | `native-shell:contract:MayaNfcWriter.writeUrl` |

`locator` carries today's `file:line` and is expected to rot. `surface_ref` does not.

**Overlay values are separate rows.** `?governed_settings` accepts four namespaces (`business_rules`, `client_capabilities`, `staff_ai_provider`, `staff_notifications`, at `app.html:33264`). That is **four surfaces**, four capability keys, four parity proofs — not one. The same applies to `?expenses=reminder` vs `?expenses=intake`: same host, two entry contexts, and one of them is a proactive delivery target, which drags clause G7 in. Collapsing them into one row is how a capability disappears without anyone noticing.

### 1.3 `new_home` — a closed union, with the ban built in

```ts
type NewHome =
  | { to: 'chat_widget'; kind: WidgetKind; source_capability: string;
      intent_effects: EffectClass[] }
  | { to: 'fullscreen_detail'; route_key: string;
      reason: 'exceeds_chat_density'|'exact_configuration'|'audit'|'accessibility'|'correction' }
  | { to: 'capability_only'; capability_key: string }        // no nav entry; reached by utterance/intent
  | { to: 'security_surface'; enforcement_point: string }    // no user surface at all, ever
  | { to: 'merged_into'; surface_ref: string }
  | { to: 'handoff_target'; channel: Channel; verification_floor: VerificationLevel }
  | { to: 'restore'; gap_ref: string; tier: 'A'|'B'|'C' }
  | { to: 'none'; parity_proven_by: string[] };              // ≥1 other surface_ref, REQUIRED
```

Three structural bans, expressed as absent fields rather than rules to remember:

- **`{ to: 'none' }` cannot be written without naming the surfaces that carry the capability instead.** "Removing a tab never removes the capability" is enforced by the type, not by review discipline.
- **There is no `{ to: 'overlay' }`.** `theme_scope: 'in_tree'` is a single-value literal in the widget contract; an overlay is not expressible as a widget. Every overlay therefore resolves to `fullscreen_detail` plus zero or more `chat_widget` rows (§5).
- **`security_surface` has no `route_key` and no `kind`.** The 121 SECURITY/AUTHORITY ONLY surfaces terminate as enforcement points with no user-visible successor. Their parity proof is a *negative* test — the enforcement still fires — not a rendering test.

### 1.4 Who owns the cutover: exactly one owner, from five

```ts
type CutoverOwner =
  | 'BUNDLE'      // the single-file PWA: routes, overlays, renderers, fences in app.html
  | 'CAPABILITY'  // the NestJS/Python service that owns the canonical operation
  | 'CHANNEL'     // bot, push, scheduler, SMS, email, SMM — delivery and entry points
  | 'AUTHORITY'   // verification levels, membership, client binding, the five PII fences
  | 'LEGAL'       // 152-FZ: consent copy, consent register, erasure, retention
```

**A row with two owners is a defect in the row, not a fact about the work.** Split it until each fragment has one. The most common split you will hit: an overlay that is both a UI surface and a consent-bearing control splits into a `BUNDLE` row (the rendering) and a `LEGAL` row (the decision record). The codebase already performs that split deliberately; the ledger must not re-fuse it.

**`LEGAL` is the only owner that can clear a row carrying a 152-FZ obligation.** `BUNDLE` cannot sign off the consent screens. `CAPABILITY` cannot sign off the register export.

### 1.5 The 126 rows nobody has looked at

795 surfaces, 669 dispositions. **126 surfaces carry no disposition.** They are not "probably fine"; they are the rows most likely to hide an orphaned capability, because triage naturally starts with the surfaces people remember. They enter the ledger as `disposition: UNTRIAGED`, `new_home: unset`, `parity_state: UNTRIAGED`, and the gate cannot be evaluated for them at all.

**Rule:** no row anywhere may advance past `SHADOWED` while the untriaged count is greater than zero. Closing the census is Phase 0 and it blocks everything, because a parity proof that says "the capability is carried by surface X" is worthless if surface X is one of the 126 and is itself slated for deletion.

---

## 2. What each disposition means operationally

The six dispositions are not six kinds of work. They are three kinds of work and three kinds of bookkeeping.

| Disposition | n | Work | Gate clauses that bind | Typical owner |
|---|---:|---|---|---|
| **KEEP AS CAPABILITY** | 201 | None to the capability. The row records that the *entry point* may move while the capability does not. Terminal state is `capability_only` or `fullscreen_detail`. | G1, G2 | CAPABILITY |
| **SECURITY/AUTHORITY ONLY** | 121 | None. Bookkeeping: prove the surface is an enforcement point with no user-visible successor, then mark it `security_surface`. **These rows never retire** — they were never navigation. | G1, G3, G5 | AUTHORITY |
| **MOVE INTO CHAT WIDGET** | 115 | Real build. A widget kind, a source capability, a projector, a text equivalent. | G1–G9 (all) | BUNDLE + CAPABILITY (split) |
| **MERGE** | 93 | Real build, and the riskiest class: two surfaces become one, so the union of their capabilities must be proven, not the intersection. | G1, G2, G3, G5, G6, G9 | BUNDLE |
| **KEEP AS FULLSCREEN DETAIL** | 76 | Modest: acquire a `route_key`, join the back-stack and the theme, lose any overlay mount. | G1, G2, G4 (a fullscreen detail still needs a text equivalent for its summary card) | BUNDLE |
| **RETIRE FROM PRIMARY NAVIGATION** | 63 | The only class that removes anything, and it removes an **entry point**, never a capability. | G1–G9 **plus** a named successor in `parity_proven_by` | BUNDLE |

**An arithmetic fact worth stating plainly.** There are 112 primary-navigation surfaces today and at most 63 rows dispositioned to leave primary navigation. Even if all 63 clear the gate, **at least 49 primary-navigation entry points survive this cycle.** Chat-first is not chat-only, and this cycle does not produce a navigationless product. Anyone reading the 63 as "we delete the tabs" has misread the number.

---

## 3. The Capability Parity Gate (INV-16)

> **A legacy surface may be retired if and only if, for its row, all binding clauses below are green, the row's `blocking_gaps` is empty, and the row's single `cutover_owner` has signed against cited evidence.**

Green means a check that fails loudly, not an opinion. Each clause names what evidence closes it.

### G1 — Capability identity
The surface maps to **exactly one** key in the C9 capability registry (`<REPO>/maya-saas-backend/src/orchestration/c9.registry.ts`, derived from `MAYA_AI_TOOL_CATALOG`), **or** is declared `NO_CAPABILITY` with evidence that it is pure presentation.
*Closes with:* the registry key, plus the call site proving the surface reaches it.
*Fails when:* the surface reaches two capabilities (split the row) or none (it is a gap — see §7).

### G2 — Reachability, proven by execution
At least one live route in at least one channel reaches that capability, **exercised end to end against the real canonical owner in staging**, producing a receipt (an `ActionExecution` id, an `AgentResult` evidence handle, or an HTTP 2xx with a canonical body).
*Closes with:* the receipt id.
*Fails on:* a code-reading argument. "The handler exists" is not reachability; `webhook_server.py:4677` is a handler that exists and returns 409.

### G3 — Authority parity, proven negatively
The new route's server-derived `verification_level` floor is **greater than or equal to** the old route's, and authority is derived server-side from Membership / Client binding / Staff / entitlements — never from `presentation_mode`, never from a client assertion.
*Closes with:* one passing test per `VerificationLevel` **below** the floor, each asserting refusal. A positive test alone does not close G3.
*Specifically fails when:* the new path can be reached by `localStorage.me_is_staff` pre-routing (`app.html:41533`), by `window.__meRole` / `__meIsStaff` / `__meIsMaster` / `__meIsFounder` / `__panelInfo.permissions`, or by the current screen name. These are inputs to nothing.

### G4 — Text parity (contract rule R1)
Rendering the successor with the `TEXT_ONLY` profile states every fact a rich renderer shows, reaches every retained intent by typed reply, and states every non-`KNOWN` Cell with its label.
*Closes with:* the CI portability test for that widget kind.
*Why it is here:* it is simultaneously the accessibility test, the SMS test, the voice test and the screen-reader test. A surface that cannot pass G4 has not been migrated; it has been redrawn.

### G5 — PII parity, five fences plus one
All five existing client-preview enforcement points still fire independently: downgrade when the channel is unlinked; cabinet data wipe; cabinet body replacement; loyalty/history request refusal; hydrator CRM-PII refusal. The widget contract's sixth display fence (`pii_class === 'client_identified'` + `presentation_mode === 'client'` rejected unless `subject_is_principal`) is **added**.
*Closes with:* five independent negative tests, one per fence, each failing if that fence alone is removed.
*Fails when:* a refactor consolidates them. Five tests that all pass because one shared guard fires is a failed G5, not a passed one.

### G6 — Data parity, copied not recomputed
The successor's `provenance.source_capability` is the same capability, and `completeness_envelope_hash` re-hashes to the source envelope. No arithmetic anywhere in the presentation layer.
*Closes with:* the hash equality assertion, plus the R2 numeral check — every numeral in rendered text corresponds to a formatted `Measure` in the body.

### G7 — Proactive parity
If the old surface was a delivery target for any of the 12 canonical outbound moments, the successor carries the same `dedupe_key`, `notify_pref_key`, `once_per` and quiet-hours behaviour, across push ↔ chat ↔ Telegram mirror.
*Closes with:* a delivery test proving one signal produces one delivery across all carrying channels.
*Bites hardest on:* `pwa:overlay:expenses=reminder` (`weekly_expense_reminder`) and `pwa:overlay:native_feedback` (`native_feedback_invitation`) — both are overlays *and* delivery endpoints.

### G8 — Audit parity, one capability three front doors
The audit line produced by a tap, by the typed `utterance`, and by the spoken `speech_alias` is **identical**, and every audit event class the old surface produced has a successor event class.
*Closes with:* a three-way test asserting byte-equal audit records.
*Why:* this is what makes accessibility and voice free rather than three implementations, and it is the Telegram channel's proven pattern being inherited rather than reinvented.

### G9 — Reversal and erasure parity
Anything the old surface could undo, cancel, correct or erase, the successor can undo, cancel, correct or erase — at the same or lower friction.
*Closes with:* an execute-then-reverse test producing both receipts.
*Bites hardest on:* consent rows, because a grant surface without a revoke successor is exactly the defect §7 exists to fix.

### G0 — The clause that is not automatable
One named `cutover_owner` signs the row, citing the evidence ids that closed G1–G9. Two signatures means the row was wrong (§1.4). No signature means the row is not green regardless of green checks — because the checks prove that *something* works, and only a person can assert it is the *right* something.

### The counter-gate
`blocking_gaps` non-empty ⇒ **RED, unconditionally**, even if G1–G9 are green. A surface whose remedy has no canonical owner cannot be retired, and by contract rule P2 its successor must carry a `Limitation` with the `capability_gap_ref` and **must not carry an intent that promises the remedy**. Fail closed, say so in text, synthesise no button.

---

## 4. The parity ledger state machine

A row moves forward one state at a time, and every transition has a one-step rollback that requires no deploy of the successor.

| State | Meaning | Entry condition | Rollback |
|---|---|---|---|
| `UNTRIAGED` | no disposition | — | — |
| `MAPPED` | disposition + `new_home` + binding clauses assigned | §1 complete for this row | edit the row |
| `SHADOWED` | successor is **live**, legacy is **live**, telemetry compares them | successor deployed | disable successor |
| `PARITY_PROVEN` | G0–G9 green, `blocking_gaps` empty | §3 | reopen a clause |
| `ENTRY_POINT_DARK` | nav entry removed; **route still resolves and logs every hit** | `PARITY_PROVEN` + soak (§4.1) | restore the nav entry — a copy change, no deploy of the successor |
| `ROUTE_SEALED` | route returns a `HANDOFF` naming the successor; still logs | `ENTRY_POINT_DARK` + soak + **zero unexplained hits** | unseal |
| `DELETED` | code removed | `ROUTE_SEALED` + soak + zero hits | git |

### 4.1 Soak windows, and why they are this long

- `PARITY_PROVEN → ENTRY_POINT_DARK`: **14 days.**
- `ENTRY_POINT_DARK → ROUTE_SEALED`: **30 days.**
- `ROUTE_SEALED → DELETED`: **30 days.**

Thirty days is not caution, it is the product's own period. The outbound moments include `birthday_alert` (annual, but daily-fired), `weekly_expense_reminder` (7 days), `daily_report` and `morning_brief` (daily), and monthly period close. A 7-day soak proves nothing about a surface reached only at month end. **Any row whose capability touches period close (reports, expenses, cash declaration, payroll shares) uses 45 days for the `ENTRY_POINT_DARK` window** so that two closes occur inside it.

### 4.2 The rule that saves the deep links

**A query parameter, deep link or push action is sealed LAST, after (a) every outbound template pointing at it has been re-pointed, and (b) the longest delivery TTL of those templates has expired.**

A push notification delivered yesterday can be opened in 30 days. `?native_feedback` and `?expenses=reminder` are not merely overlays — they are the landing surfaces of proactive moments already in flight. Sealing the parameter before the in-flight messages expire converts a delivered notification into a dead tap, which reads to the user as the product breaking, and is invisible in any test that does not replay old messages.

---

## 5. The three-bundle problem

### 5.1 What is actually on disk

| File (absolute) | Bytes | Role |
|---|---:|---|
| `<REPO>/сайт и приложение/app.html` | 2,719,311 | Production PWA. Carries the 21-key router, all six overlays, the five PII fences. |
| `<REPO>/maya-os-site/index.html` | 2,506,493 | Older build of the same single-file app. |
| `<REPO>/сайт и приложение/app-tenant.html` | 1,096,396 | Reduced tenant variant. |
| `<REPO>/сайт и приложение/index.html` | 870,237 | The marketing **site** — a different artefact, not a fourth app bundle. Out of scope here. |

**Trunk decision: `app.html`.** Not because it is newest — I could not reproduce the `2026-08-01` / `2026-09-02` build tags with a grep of either file (§9) — but because it is the file `CLAUDE.md` names as the deployed PWA, it is the largest, and it is the one that demonstrably carries the router, the overlays and the five fences that every other decision in this plan depends on. Consolidating toward a bundle that lacks the fences would be consolidating toward the weaker security posture.

### 5.2 The constraint that dictates the method

**There is no build source.** `app-aurora.html` and `build.js` do not exist; `app.html` is a built artefact that is edited and deployed directly. Therefore:

> **Consolidation is performed by route-level redirection at the edge, not by merging code.**

Merging three 1–3 MB built bundles by hand, with no source of truth and no diff tooling that understands them, is the single most likely way to silently delete a capability in this entire programme. Redirection is one line at the edge, reversible in one line, and provably loses nothing if the census diff (Step 2) is complete.

### 5.3 Consolidation order

**Step 0 — Build-identity proof.** Prove per-file that `maya-os-site/index.html` and `app-tenant.html` are builds of the same source tree: compare the `S` router key set, the `openMaya*` function set, the five fence call sites, and the `window.__me*` global set. Until proven, each is a **distinct surface set** in the ledger and contributes its own rows. *Do not assume identity from the inventory; the inventory asserts it, and the redirect destroys whatever the assertion missed.*

**Step 1 — Freeze `maya-os-site/index.html`.** No further edits. Any change lands in `app.html` first. A frozen file cannot drift further while you are measuring it. This is the only Phase-3 step with no precondition and it should happen immediately.

**Step 2 — Census diff.** Enumerate router keys, overlay mounts, fence sites and capability call sites in each bundle; produce the delta. **Anything present only in the older build is a capability that a redirect would destroy** and gets a migration row with `disposition: UNTRIAGED` before anything else moves. This is the step that makes Step 3 safe, and it is the step most likely to be skipped.

**Step 3 — Redirect `maya-os-site/index.html` → `app.html`, preserving the query string.** Non-negotiable: six of the app's capabilities are gated **only** by query parameters (`?community_moderation`, `?native_feedback`, `?cash_declaration=1`, `?expenses=…`, `?governed_settings=…`, `?team=main`). A redirect that drops the query string silently destroys six capabilities and will look like a successful consolidation. The redirect is a `ROUTE_SEALED`-equivalent state for the whole bundle: it logs, and it is reversed by deleting one rule.

**Step 4 — `app-tenant.html` folds into `app.html` behind a server-declared flag.** Decision: the tenant variant becomes a `presentation_mode` / entitlement delivered by the existing server-owned `app_access` layer, not a second file. A second file is a second build, and a second build drifts — that is precisely the defect `maya-os-site/index.html` already demonstrates. This step runs **after** Step 3 and after every tenant-only surface has cleared G1–G9 individually, because the fold is where tenant-only capabilities get quietly dropped.

**Step 5 — One bundle.** One router, one theme, one back-stack. **Only now does contract rule R3 (`theme_scope: 'in_tree'`) become enforceable**, because until there is one tree there is nothing for `in_tree` to mean.

**Order rationale, stated once: redirect before merge.** Redirection is reversible at the edge in seconds; merging built code with no source is not reversible at all.

---

## 6. The self-mounting overlays

Six verified (§0). Each creates its own `document.body` host at `zIndex 2147483000`, renders on a query-parameter match, and lives outside the app tree, outside the back-stack, outside the theme. Their only authorisation is the bearer check inside each component's first fetch.

**The mechanical rule:** an overlay **cannot become a widget** — `theme_scope: 'in_tree'` is a single-value literal with no `'overlay'` member and no z-index field. Each overlay therefore becomes exactly one `fullscreen_detail.route_key` in the trunk router, plus zero or more `chat_widget` rows for the parts that belong in the conversation.

| Overlay (`surface_ref`) | Component / line | New home | Clause that bites | Owner |
|---|---|---|---|---|
| `pwa:overlay:community_moderation` | `AMayaCommunityModeration` `:33068` | `fullscreen_detail: moderation.queue` + `APPROVAL` widgets per queued item | **G3** — moderation is an authority act; the bearer-check-inside-first-fetch pattern must be replaced by a server-derived floor | CAPABILITY |
| `pwa:overlay:native_feedback` | `AMayaNativeFeedback` `:33090` | `chat_widget: FORM` (`justification: AUDIT_EXACT_INPUT`) + `fullscreen_detail: feedback.compose` | **G7** — this is the landing surface of `native_feedback_invitation`; dedupe across push ↔ chat ↔ mirror | CHANNEL |
| `pwa:overlay:cash_declaration=1` | `AMayaCashDeclaration` `:33138` | `chat_widget: FORM` (`justification: MULTI_FIELD_ATOMIC`) + `fullscreen_detail: finance.cash.declare` | **G3 + G9** — money, and a declaration that cannot be corrected is worse than no declaration | CAPABILITY |
| `pwa:overlay:expenses=reminder` | `AMayaExpenseIntake` `:33178` | `chat_widget: FORM` + `fullscreen_detail: finance.expenses.intake` | **G7** — `weekly_expense_reminder` delivery target | CHANNEL |
| `pwa:overlay:expenses=intake` | same component | same `fullscreen_detail`, **different row** | G2 — same host, different entry context | BUNDLE |
| `pwa:overlay:governed_settings=business_rules` | `AMayaGovernedSettings` `:33262` | `chat_widget: SETTINGS_DRAFT` + `fullscreen_detail: settings.governed.business_rules` | **G6** — the diff shown must be the canonical diff | CAPABILITY |
| `…=client_capabilities` | " | `settings.governed.client_capabilities` | G3 | AUTHORITY |
| `…=staff_ai_provider` | " | `settings.governed.staff_ai_provider` | G6 | CAPABILITY |
| `…=staff_notifications` | " | `settings.governed.staff_notifications` | **G7** — notification preferences are the `notify_pref_key` that gates proactive emission | CHANNEL |
| `pwa:overlay:team=main` | `ATeamChat` `:38331` | **`merged_into: pwa:route:team-chat`** | G2 | BUNDLE |

**Four things this table establishes that a narrative would hide.**

1. **`?team=main` is a MERGE, not a migration.** The overlay mounts `ATeamChat`, and `S['team-chat']` mounts `window.ATeamChat` — the same component reached two ways, one inside the router and one outside it. The overlay is the retirement candidate; the router key is the survivor. This row can reach `PARITY_PROVEN` almost immediately and is the correct first overlay to retire, because it proves the pipeline on a row where the capability provably cannot be lost.
2. **`?governed_settings` is four rows.** Four capability keys, four proofs. The single `if(!['business_rules','client_capabilities','staff_ai_provider','staff_notifications'].includes(...))` guard is one line of code and four surfaces.
3. **Every `SETTINGS_DRAFT` successor must carry `editor_handoff_intent`.** That is the contract's mandated non-chat fallback editor, and it is what keeps "chat-first" from becoming "chat-only" for exactly the surfaces where exact configuration matters most.
4. **`#maya-splash` is not on this list.** It renders in-tree from a component (`app.html:15880`) and shares only the z-index. Migrating it would be work performed against a fact that is not true.

**Overlay retirement sequencing.** The overlay *mount function* may be removed once its `fullscreen_detail` route is `PARITY_PROVEN`. The **query parameter must keep resolving for the full §4.2 window**, redirecting to the route key, because push notifications and deep links in the wild point at it.

---

## 7. Authority-dead Telegram: entry points are cheap, capability claims are not

**The finding:** the `_principal` ContextVar in `<REPO>/ai администратор/canonical_staff_access.py:14` is written only inside the aiohttp HTTP middleware (`:194`) and by a helper that itself requires an established request principal (`:93`). The bot runs `start_polling`, so for every Telegram-originated update `is_admin()` / `is_staff()` / `master_projection()` return `False`/`None`. Roughly 45 registered owner/staff commands still execute and reply; their authority-gated bodies are unreachable. Confirmed by 2 of 3 verifiers; the dissenter disputed causality, not mechanism.

### 7.1 Settle causality cheaply, before mass action
Dissent about causality is settled by execution, not by more reading. **Run each owner/staff command from a known owner account in staging and record whether the authority-gated body executes.** Read-only commands may additionally be probed in production; nothing that mutates. One afternoon converts "2 of 3 at high confidence" into a fact, and it is the only honest basis for retiring 45 entry points.

### 7.2 Triage every command into exactly one bucket

| Bucket | Test | Action | Is it a parity claim? |
|---|---|---|---|
| **B1 MIRRORED** | an HTTP route implements the same capability at a verification floor ≥ the Telegram path | retire the entry point after G1–G9 | **Yes** — requires the full gate |
| **B2 FENCED** | the capability is disabled at the body level by the P4/P5 cutover | retire the entry point **immediately**; open a capability row | **No** — retiring changes nothing |
| **B3 ORPHAN** | no HTTP route, not fenced, capability exists nowhere else | assign a `capability_gap_ref`; P2 applies — no intent may promise it | **No** — it is a gap |
| **B4 LIVE** | the body never needed the dead principal | leave it; it works | **No** |

**The six known B2 capabilities** — `mute_master` raises, `run_loyalty_job` / `run_backfill_job` return disabled, `scan_and_alert` is a retired stub, `can_redeem_codes` returns `False`, `set_cashier_role` raises — are fenced *independently* of the authority defect. **Restoring the principal would not restore them.** Any plan that treats "fix the ContextVar" as recovering these six is wrong, and the ledger must record them as capability rows, not as authority rows.

### 7.3 The rule, stated so it cannot be misread

> **Retiring a Telegram entry point is a copy change. Claiming the capability is carried elsewhere is a B1 proof. These are different acts and the second is never implied by the first.**

The inventory's own correction says this: *"retire the entry points freely, but never assume the capability is re-presented elsewhere without checking the HTTP surface case by case."*

### 7.4 Do the honest thing first, and it costs nothing

A command that executes, replies, and silently does nothing is worse than a command that does not exist — it consumes the user's trust *and* their time. **Phase 1 replaces every authority-dead owner/staff reply with an explicit `HANDOFF` message naming the live surface.** This removes a lie, removes no capability, requires no parity proof, satisfies the contract's HANDOFF requirement, and can ship before any of the gate work. It is the highest ratio of harm removed to risk taken in the entire plan.

---

## 8. The eight restorations

The inventory is right that these are **restorations, not re-presentations**. It is wrong that they are one class. Verified against the repository, they are three tiers — and the two carrying legal exposure are in the cheapest one.

### Tier A — the canonical owner is live and the HTTP ingress already accepts the revocation. This is a **route** gap.

**`GAP-CONSENT-MKT-CHANGE` — change a recorded marketing-consent decision**

The canonical owner records `decision: granted ? 'grant' : 'revoke'` as an append-only `clientConsentFact` (`package5-wave3-canonical-cutover.service.ts:351`, written at `package5-wave3.service.ts:1375`, current state derived by `effectiveClientConsents`). The ingress `POST /api/consent/submit` (`webhook_server.py:4796`) requires an explicit boolean `accept_marketing` and passes it through. **A revocation submitted today would be recorded correctly. There is simply no surface from which to submit one.**

Meanwhile `<REPO>/ai администратор/privacy_policy.py:17` and `bot.py:445` both promise *«Отписаться можно в любой момент командой /unsubscribe»*, and `cmd_unsubscribe` (`bot.py:576`) replies: *«Согласия настраиваются в приложении…»* followed by `APP_URL` — pointing at an app surface that does not exist. `bot.py:2670` lists `/unsubscribe` in help. **This is an active 152-FZ exposure produced by a missing route over a working owner.**

- **Restored to:** the PWA/native settings surface, as a `fullscreen_detail: consent.marketing` reached from a chat `CHOICE` widget that explains state and consequence.
- **Control placement:** `NEVER_CHAT_ACTUATED`. The explanation may be a chat widget; the accept/decline **control** may not. Its only legal intent is `HANDOFF`, with `required_verification: SESSION_VERIFIED`.
- **Owner:** LEGAL (signs) + BUNDLE (builds). **Phase 2.**

**`GAP-CONSENT-PD-WITHDRAW` — withdraw base 152-FZ personal-data consent**

Same owner, `kind: 'privacy'`, `granted: false`. Same ingress, `accept_pdn: false`. Today it exists only as a phone number and an email in bot copy.

- **Restored to:** `fullscreen_detail: consent.pd`, `STEP_UP_VERIFIED`, `NEVER_CHAT_ACTUATED`.
- **The open question, and it is not small:** I verified that the *fact* is recorded. I did **not** verify what follows — whether withdrawal revokes the channel link, halts processing, triggers erasure, or cascades to the CRM. **A withdrawal that records a fact and changes nothing downstream is not a withdrawal.** `LEGAL` must specify the downstream consequence and `CAPABILITY` must prove it (clause G9) before this row ships. This is the one Tier A row that is not purely a route.
- **Owner:** LEGAL. **Phase 2.**

### Tier B — the canonical owner exists; the **client ingress** is missing. Build the ingress; copy the pattern that already works.

The template is already in the codebase: `sub_create_handler` (`webhook_server.py:4907`) is documented as *"Verified Client initiator for canonical P4-05 subscription checkout"*. That is precisely the shape the three rows below need. This is not novel work; it is the fourth instance of a pattern with three prior instances.

**`GAP-LOYALTY-REDEEM`** — `webhook_server.py:4677` returns `409 p4_03_canonical_loyalty_ingress_required`. The owner exists: `<REPO>/maya-saas-backend/src/loyalty/p4-03-legacy-loyalty-executable.service.ts`, `loyalty-redemption-claim.contract.ts`, `legacy-loyalty-redemption-shadow.service.ts`. Accrual keeps running while redemption is dark, so an unredeemable liability grows every day this row waits.
- **Restored to:** the booking flow. Specifically, a `Measure` on the `BOOKING_CONFIRMATION` body (`loyalty_applied`) — **not** a separate loyalty screen. Redemption is a property of a booking, and modelling it as its own surface is what let it drift out of the booking path in the first place. The COMMIT token exists only on the confirmation body, so redemption cannot be actuated from a slot picker.
- **Owner:** CAPABILITY. **Phase 4.**

**`GAP-COMMERCE-GIFT`** — `webhook_server.py:4897` returns `503 canonical_gift_certificate_ingress_required`. The owner exists: `p4-06-gift-certificate-executable.service.ts`, plus purchase / activation / redemption shadow services. The AI chat still offers certificates and the shop UI is live — the product is selling something it cannot deliver.
- **Restored to:** three ingresses (purchase, activation, redemption) behind one `fullscreen_detail: commerce.gift` with a chat `CHOICE` entry. Until the ingress ships, **P2 applies: the chat must stop offering it.** Removing the offer is a Phase 1 copy change and does not wait for Phase 4.
- **Owner:** CAPABILITY. **Phase 4** (with a Phase 1 copy fix).

**`GAP-CONSENT-REGISTER-EXPORT`** — `cmd_export_consents` exists (`bot.py:1399`) and calls `database.export_consents_csv()`, gated by `canonical_staff_access.is_admin(user_id)` — which, per §7, returns `False` for every Telegram update. **The Roskomnadzor audit journal is authority-dead.**
- **The complication, and it is the highest-value unknown in this entire set:** there appear to be **two registers** — the legacy SQLite journal (`<REPO>/ai администратор/database.py:1255`) and the canonical Postgres `clientConsentFact`. If they describe different populations, **an export from either one alone is an incomplete 152-FZ journal**, and that is a worse failure than no export, because it would be produced and signed. Reconciling the two populations is a prerequisite, not a detail.
- **Restored to:** a `REPORT` widget with a top-3 summary card and a mandatory `fullscreen_detail: compliance.consent_register` + `export_intent`, delivered as an artefact into the conversation — inheriting the Telegram channel's proven CSV/PDF-into-the-conversation pattern.
- **Owner:** LEGAL. **Phase 4**, blocked on the reconciliation.

### Tier C — no canonical owner found. Genuine capability build.

**`GAP-IDENTITY-TG-UNBIND`** — I found no destroy path. `staffTelegramEligible` (`<REPO>/maya-saas-backend/src/package5-wave1/governed-settings.read.ts:210`) *gates delivery*; membership deactivation *gates authority*; neither destroys the binding. The link can be created and never destroyed.
- **Restored to:** the offboarding path, **inside the same canonical transaction as membership deactivation**. Not a separate settings screen — a separate screen is how the two states diverge, and a staff member whose authority is revoked but whose delivery binding survives keeps receiving internal messages after leaving. `NEVER_CHAT_ACTUATED`, `STEP_UP_VERIFIED`, four-eyes.
- **Owner:** AUTHORITY. **Phase 8.**

**`GAP-ATTRIBUTION-FIRST-TOUCH`** — the `measurement` module's `attributionStatus` (`<REPO>/maya-saas-backend/src/measurement/measurement.contract.ts:143`, `:512–518`) is **effect-lineage** attribution — which execution caused which outcome — not first-touch acquisition-channel attribution over 10 categories. Different capability, but a well-shaped host: its existing `ATTRIBUTED` / `AMBIGUOUS` / `UNATTRIBUTED` / `NOT_APPLICABLE` vocabulary maps cleanly onto `Cell` states, so unknowns render as statements rather than zeros.
- **Restored to:** a two-level hierarchical `REPORT` — `fullscreen_detail: analytics.acquisition` with a top-3 `Measure` summary card in chat. `group_by` permits exactly one level of grouping, which is exactly two levels of hierarchy. **A ten-category two-level table never lives in a bubble.**
- **Owner:** CAPABILITY. **Phase 8.**

**`GAP-HISTORY-ERASE`** — `cmd_clear` (`bot.py:588`) replies: *«Серверная история сохранена. Удаление общей истории через /clear недоступно.»* No erasure route in any channel.
- **Restored to:** `fullscreen_detail: privacy.history`, `NEVER_CHAT_ACTUATED`, `STEP_UP_VERIFIED`.
- **Why it is buildable at all:** because `widget_id` is an addressing ULID, unique per emission, never a business identifier and never a foreign-key target. Conversation history is a presentation surface; deleting it must leave canonical records correct. Widgets are never a system of record, so erasing the conversation erases presentation and nothing else. **Clause G9 is the whole test for this row:** erase history, then prove every canonical record — bookings, consents, receipts, loyalty balances — is unchanged.
- **Owner:** LEGAL. **Phase 8.**

### Summary

| Gap | Tier | Canonical owner | Ingress | Restored to | Phase |
|---|:--:|---|---|---|:--:|
| `GAP-CONSENT-MKT-CHANGE` | **A** | ✅ live | ✅ live | `consent.marketing` (handoff-only) | 2 |
| `GAP-CONSENT-PD-WITHDRAW` | **A** | ✅ live | ✅ live | `consent.pd` + downstream spec | 2 |
| `GAP-LOYALTY-REDEEM` | **B** | ✅ exists | ❌ 409 | `BOOKING_CONFIRMATION.loyalty_applied` | 4 |
| `GAP-COMMERCE-GIFT` | **B** | ✅ exists | ❌ 503 | `commerce.gift` (3 ingresses) | 4 |
| `GAP-CONSENT-REGISTER-EXPORT` | **B** | ⚠️ two registers | ❌ authority-dead | `compliance.consent_register` | 4 |
| `GAP-IDENTITY-TG-UNBIND` | **C** | ❌ none found | ❌ | offboarding transaction | 8 |
| `GAP-ATTRIBUTION-FIRST-TOUCH` | **C** | ❌ different capability | ❌ | `analytics.acquisition` | 8 |
| `GAP-HISTORY-ERASE` | **C** | ❌ none | ❌ | `privacy.history` | 8 |

---

## 9. The retirement order

Each phase lists what must be true to **enter** it. No phase begins because the previous one is "mostly done".

**Phase 0 — Close the census. Nothing retires.**
*Enter:* immediately. *Exit:* all 795 rows have a disposition; the 126 untriaged are zero; `maya-os-site/index.html` is frozen; every row has one `cutover_owner`. *Blocks:* everything past `SHADOWED`.

**Phase 1 — Honesty. Removes lies, removes no capability, needs no parity proof.**
Fix `/unsubscribe` and `/subscribe` copy so they name a channel that works (the existing phone/email path) instead of an app screen that does not exist. Replace authority-dead owner/staff Telegram replies with explicit `HANDOFF` text. Stop the AI chat offering gift certificates. Run the §7.1 staging probe.
*Enter:* immediately, in parallel with Phase 0. *Exit:* no surface promises a capability that has no route.

**Phase 2 — Tier A restorations. The only work that precedes parity work.**
`GAP-CONSENT-MKT-CHANGE` and `GAP-CONSENT-PD-WITHDRAW`. Route-only over a live owner, plus the PD downstream-consequence specification.
*Enter:* Phase 1 complete for the consent copy. *Exit:* both surfaces live, G9 green, Phase 1's interim copy replaced with the real surface. *Why it jumps the queue:* the exposure is live now and the fix is the cheapest in the programme. Retiring anything before fixing a standing legal promise is the wrong order.

**Phase 3 — Bundle consolidation, Steps 0–3.**
Build-identity proof, freeze, census diff, query-preserving redirect of `maya-os-site/index.html`.
*Enter:* Phase 0 complete. *Exit:* one production app bundle serving both hostnames; every older-build-only surface has a ledger row.

**Phase 4 — Tier B ingresses.**
Loyalty redemption, gift certificates, consent register export (blocked on two-register reconciliation).
*Enter:* Phase 3 exit. *Exit:* three ingresses live with receipts; the accruing loyalty liability is redeemable.

**Phase 5 — Overlay re-expression. Both live.**
Each overlay acquires a `fullscreen_detail` route key in the trunk router. Overlay and route both live. Query parameters keep resolving. Start with `?team=main`, which is a MERGE into an existing router key and therefore proves the pipeline where the capability provably cannot be lost.
*Enter:* Phase 3 exit. *Exit:* every overlay reachable by route key; all overlay rows at `SHADOWED`.

**Phase 6 — Widget cutover.**
The 115 MOVE INTO CHAT WIDGET and 76 KEEP AS FULLSCREEN DETAIL rows move to `SHADOWED`, then `PARITY_PROVEN`. The 121 SECURITY/AUTHORITY ONLY rows close on G1/G3/G5 and terminate as `security_surface` — they never enter the retirement path at all.
*Enter:* Phase 5 exit; the widget contract's CI gates (R1 portability, R2 numerals, M1 unknown-is-not-failure, forbidden-key validator) are live and failing builds.
*Exit:* 191 rows at `PARITY_PROVEN`.

**Phase 7 — Entry points go dark. Leaf-first.**
The 63 RETIRE FROM PRIMARY NAVIGATION rows move to `ENTRY_POINT_DARK`, ordered so that no row darkens while another row's `parity_proven_by` names it. Routes still resolve and log every hit. 14-day soak, then 30 (45 for period-close capabilities).
*Enter:* Phase 6 exit for every row named in any `parity_proven_by`. *Exit:* zero unexplained hits across the soak.
*Note:* at most 63 of 112 primary-nav entries darken. At least 49 remain. That is the intended outcome.

**Phase 8 — Tier C builds, tenant fold, sealing, deletion.**
`GAP-IDENTITY-TG-UNBIND`, `GAP-ATTRIBUTION-FIRST-TOUCH`, `GAP-HISTORY-ERASE`. `app-tenant.html` folds behind the `app_access` flag. Rows at `ENTRY_POINT_DARK` + zero hits reach `ROUTE_SEALED`; rows at `ROUTE_SEALED` + 30 days + zero hits reach `DELETED`. Query parameters and deep links seal last, per §4.2.
*Enter:* Phase 7 exit. *Exit:* one bundle, one router, one theme, one back-stack; `theme_scope: 'in_tree'` enforceable; no capability without a route.

### The three orderings that matter most, stated as rules

1. **Restore before retire.** A capability with no route cannot be the successor of anything, and a product that retires a surface while still promising the capability in copy has made the exposure worse, not better.
2. **Redirect before merge.** Edge redirection is reversible in one line. Merging built bundles with no source is not reversible at all.
3. **Seal query parameters last.** Deep links and push actions already delivered outlive the surfaces they point at by as long as the recipient's inbox does.

---

## 10. Where the evidence does not support a decision

Stated rather than papered over. Each of these is a ledger row in `notes_unverified`, not a judgement call someone should make from this document.

1. **Build tags `2026-08-01` / `2026-09-02`.** My greps for build markers in `app.html` and `maya-os-site/index.html` returned nothing. Byte sizes (2.72 MB vs 2.51 MB) are *consistent* with `app.html` being the newer superset but do not prove it. The trunk decision above does not depend on the tags — it rests on `CLAUDE.md` naming `app.html` as the deployed PWA and on `app.html` demonstrably carrying the fences. **Do not cite the tags as evidence until someone reproduces them.**

2. **"Seven overlays."** I verified six self-mounting query-gated overlays and identified the seventh z-index user as the in-tree splash. If the inventory's seventh is a different construct, it must be **named** before it can be migrated; a migration plan cannot carry an anonymous row.

3. **Router reachability.** Literal `__meGo(...)` call sites exist for 15 of the 21 router keys. Six — `services`, `team`, `cutmatch`, `invite`, `staff-clients`, `team-chat` — have none. They are almost certainly reached by navigation components or dynamic keys. **I do not conclude they are unreachable**, and no row for them may advance past `MAPPED` until reachability is established by execution (clause G2). Separately, a **component-local** `screen` state machine exists in the same bundle (`setScreen('analyzing'|'scanning'|'error'|'idle'|'result'|'limit')`) whose values are not router keys; the word "screen" is overloaded, and any census that greps for it will conflate two namespaces.

4. **Whether the SQLite consent register and the Postgres `clientConsentFact` describe the same population.** This decides whether the 152-FZ export is one report or two, and whether either alone is legally sufficient. It is the highest-value unknown in the restoration set and it blocks `GAP-CONSENT-REGISTER-EXPORT`.

5. **What follows a PD-consent withdrawal.** I verified the *fact* is recorded with `decision: 'revoke'`. I did not verify link revocation, processing cessation, CRM cascade or erasure. A withdrawal that records a fact and changes nothing is not a withdrawal, and `LEGAL` must specify the consequence before Phase 2 ships.

6. **The Telegram authority defect's causality.** Two of three verifiers at high confidence, one dissenting on causality. §7.1 settles it by execution in staging for a day's work. Forty-five entry points should not be retired on an inference that a one-afternoon probe can turn into a fact.

7. **The 126 untriaged surfaces.** No claim in this section — including every parity proof that names a successor — is safe while they are unexamined, because a successor that turns out to be one of the 126 is not a successor.
