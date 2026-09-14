# The Canonical Widget Taxonomy

**291 raw widget-type strings → 22 canonical widget types.**

---

## 0. What this section decides, and what it refuses to decide

This section fixes the **closed set of widget kinds** for `maya.widget.envelope/1`. It is architecture only: zero runtime changes, zero schema changes, zero migrations, zero production mutations. Naming a kind here does not authorise emitting it, and emitting it does not authorise deleting anything — only INV-16 capability parity can do that, and it is not green.

It refuses to decide three things the evidence does not settle, listed honestly in §11.

**A note on the 291.** I have not re-listed the 291 raw strings, and the taxonomy does not depend on them being re-listed. A taxonomy you must check string-by-string has already failed: it is a lookup table, and lookup tables drift. What follows is a **total function** — §2 gives the folding rule, §3 gives the decision procedure, and any raw string anyone finds later, including ones not in the 291, resolves deterministically to exactly one of the 22 or to a documented refusal. That is the test of a taxonomy, not its length.

**Verified against the repository.** Capability keys, owner services and counts below were read from `maya-saas-backend/src/orchestration/c9.registry.ts`, `maya-saas-backend/src/ai-tools/ai-tool.catalog.ts`, and the live bundle `сайт и приложение/app.html`. One correction to the brief: the registry resolves to **56** entries at the commit I read (47 catalog tools + 9 extras), not 57. I use the file.

---

## 1. Why there were 291 strings

The live production widget layer is a **12-entry string-to-component map** in `app.html`:

```js
var map = {
  book: ABookCard, mybookings: AMyBookingsCard, loyalty: ALoyaltyCard, shop: AShopCard,
  profile: AProfileCard, history: AHistoryCard, referral: AReferralCard, notify: ANotifyCard,
  tips: ATipsCard, business_report: ABusinessReportCard, master_earn: AMasterEarnCard,
  master_upsell: AMasterUpsellCard
};
```

Two lines above it sits the reason 12 strings become 291:

```js
if (!meIsLegacy() && ['history','referral','notify','tips'].indexOf(key) >= 0) return null;
if (window.__ME_FOREIGN_TENANT && ['shop','referral','tips','history','notify'].indexOf(key) >= 0) return null;
```

The widget key is a **pointer to a React component**, and what the widget shows is decided **on the client, by window globals**. Under that design a "type" is not a shape — it is a (component × tenant × role × screen) tuple. Every new audience, every new data source, every new authority, every new channel multiplies the vocabulary. 12 components, four presentation modes, seventeen channels and two coexisting role generations is how you arrive at 291 names for roughly twenty things.

The taxonomy's job is therefore not to *rename* 291 strings. It is to **remove the multipliers** — which is exactly what `maya.widget.envelope/1` does by making the server author the projection and the authority snapshot, and by banning `presentation_mode` from enabling anything (A1, A5).

---

## 2. The folding rule

Two raw strings are **the same canonical type** if and only if they agree on all three axes:

| Axis | Question | Why it is a discriminator |
|---|---|---|
| **1. Interaction shape** | What is the user structurally being offered — a set to pick from, a grid of time, a table of people, a number, a series, a document, a decision, a running job, a statement? | Determines the renderer, the ARIA role, the reading order, and the enumeration form in voice and SMS. |
| **2. Effect ceiling** | The highest `EffectClass` this shape may ever mint: `NONE` → `NAVIGATE` → `REFINE` → `DRAFT` → `REQUEST_APPROVAL` → `COMMIT`, with `HANDOFF` as a lateral exit. | Determines what the IntentGateway may mint onto it. This is the whole safety argument; it cannot be a per-instance decision. |
| **3. Text-equivalent shape** | The prose form `renderTextEquivalent(kind, …)` produces. | Under R0/R1 the text is canonical. Two things that read out identically in a screen reader are one thing, whatever they look like. |

Four properties are **explicitly not discriminators**. Each one, used as a type axis, is a documented defect in this codebase:

| Non-discriminator | What happens if you split on it | Evidence |
|---|---|---|
| **Role / presentation mode** | You rebuild "application modes", which the approved principles abolish. `business_report` / `master_earn` / `master_upsell` are three names for one sectioned money report seen by two authorities. | `chat-report-card.ts`, `ChatReportWidget` |
| **Subject domain** | Revenue-chart, occupancy-chart, retention-chart, payroll-chart → four types that render identically. This is the single largest source of the 291. | `analytics.*` — 6 of 47 catalog tools |
| **Channel** | A Telegram slot picker and a PWA slot picker are one type with two renderers, or R1 is false. | §6.9, five carriers, one token |
| **Screen / route** | `const cur = S[screen] \|\| S.login`. Typing by destination is what made an unknown key land a user on the login page. | `app.html`, 21-key router `S` |

**Corollary — the multiplier test.** If adding a role, a tenant, a channel or a metric would create a new type name, the proposed type is wrong. Fold it and put the variation in `authority`, `provenance.source_capability`, or the renderer.

---

## 3. The decision procedure

Applied to a raw string, in order. First match wins; the function is total.

1. Does it primarily **carry a consent or identity-binding state**? → `CONSENT_STATE` or `IDENTITY_BINDING`. *(Checked first: these are the only kinds with a by-kind actuation ban, so they must not be reachable by accident through a generic kind.)*
2. Is it a **choice among enumerated options**? Options are services → `SERVICE_SELECTOR`; people who perform work → `STAFF_SELECTOR`; times → `TIME_SLOT_SELECTOR`; anything else → `CHOICE`.
3. Is it **the last screen before an effect**? Booking → `BOOKING_CONFIRMATION`; money leaving a client → `PAYMENT_HANDOFF`; configuration → `SETTINGS_DRAFT`; a decision on someone else's proposal → `APPROVAL`.
4. Is it **time laid out against resources**? → `SCHEDULE`.
5. Is it **rows about people**? → `CLIENT_LIST`.
6. Is it **numbers**? One to five with no series → `METRIC`; a series over an axis → `CHART`; sections with narrative and tables → `REPORT`.
7. Is it **a proposal with alternatives**? → `STRATEGY_OPTIONS`.
8. Is it **a running job**? → `PROGRESS`.
9. Is it **a generated image**? → `MEDIA_PREVIEW`. **A file to keep?** → `ARTIFACT`.
10. Is it **the health of a data source**? → `SOURCE_STATUS`.
11. Is it **free-form exact input**? → `FORM` (with a `FormJustification`, or it is refused).
12. Is it **a statement that something is bounded, missing, risky or unbuilt**? → `LIMITATION`.
13. Otherwise → **it is not a widget.** It is prose, a `fullscreen_detail` route, or a defect. Do not mint a kind.

Step 13 is load-bearing. Roughly a third of the 291 dissolve there: they were names for *screens*, *tabs* and *empty states*, not for projections.

---

## 4. The family census

How the raw vocabulary folds, by family. Counts are of *inventoried surfaces* in the evidenced census, not of raw strings.

| Raw-string family (representative) | Canonical kind(s) | Evidence |
|---|---|---|
| `book`, service pick, master pick, slot pick, confirm, reschedule, cancel | `SERVICE_SELECTOR` · `STAFF_SELECTOR` · `TIME_SLOT_SELECTOR` · `BOOKING_CONFIRMATION` | live `book` widget; `catalog.services.read`, `catalog.staff.read`, `booking.availability.read`, `appointments.own.{create,reschedule,cancel}` |
| calendar, journal, shift, gap, split-schedule, business hours | `SCHEDULE` | `staff.schedule.read`, `staff.schedule.own.read`, `operations.journal.read`, `company.business-hours.read` |
| dormant, high-value, no-show risk, retention scan, segment, dossier | `CLIENT_LIST` · `REPORT` | `clients.{dormant.list,high-value.read,no-show-risk.read,retention.scan,dossier.read}`, `customers.count` |
| revenue, profit, forecast, team KPI, branch compare, payroll, expenses, `business_report`, `master_earn`, `master_upsell` | `METRIC` · `CHART` · `REPORT` | `analytics.*` (6), `reports.recovered`, `expenses.read`, `c7.measurement.read`, `c8.result.read` |
| settings, `notify`, `profile`, notification prefs, schedule edit, tenant config | `SETTINGS_DRAFT` | `settings.{read,update}`, `notifications.appointments.{read,update}`, `staff.schedule.update`, `a22.configuration` |
| consent, privacy, 152-FZ, `/unsubscribe`, marketing opt-in | `CONSENT_STATE` | 4 of the 8 capability gaps; `ConsentSecurityApprovalService` |
| link, bind code, unbind, Telegram link, CRM preview, `channel_unlinked` | `IDENTITY_BINDING` | `crm/client-channel-authenticator.service.ts`; `GAP-IDENTITY-TG-UNBIND`; preview downgrade reasons |
| integration status, provider health, CRM connect | `SOURCE_STATUS` | `support.integration-status.read`, `support.contact-admin.request` |
| `shop`, `tips`, certificate, membership, `referral` | `PAYMENT_HANDOFF` · `CHOICE` | live `shop`/`tips` widgets; `MayaRuntime.openTipsURL`; `commerce.certificates.read`, `commerce.memberships.read`, `referrals.status.read` |
| CutMatch, try-on, generated look | `MEDIA_PREVIEW` | `MayaRuntime.loadRemoteImage`; CutMatch (OpenAI + fal.ai) |
| export, CSV, PDF, download, report file | `ARTIFACT` | `owner_report.status`, `owner_report.download`; Telegram already delivers CSV/PDF into the conversation |
| approval, pending, confirm-for-me | `APPROVAL` | ActionExecution + `exact_source_confirmation` approval adapter |
| growth plan, recommendation, what-should-I-do | `STRATEGY_OPTIONS` | C9 revisions, ≤3 alternatives + `c9.no_action` |
| run status, job, generating, thinking | `PROGRESS` | C9 execution; `owner_report.status` |
| warning, empty, unavailable, limit reached, not connected, coming soon | `LIMITATION` | the gap ledger; M1 (`UNKNOWN` is never a failure) |
| everything else enumerable | `CHOICE` | — |
| exact input: expense entry, task creation, phone correction | `FORM` | `expenses.create`, `tasks.create`, `loyalty.internal.adjust` |
| **tab, screen, route, modal, overlay, login, empty-state, error** | **not a widget** (step 13) | 7 overlays at `zIndex 2147483000`; 21-key router `S` |

---

## 5. The 22 canonical widget types

### Table A — identity, owner, and what it may do

`Intent ceiling` is the highest `EffectClass` the IntentGateway may ever mint onto this kind. `Fullscreen` is whether it may escalate to a `fullscreen_detail` route.

| # | Kind | Canonical owner (registry key / service) | Intent? | Intent ceiling | Fullscreen |
|---|---|---|---|---|---|
| 1 | `CHOICE` | inherited — must name a registered `source_capability` | yes | `REFINE` | optional |
| 2 | `SERVICE_SELECTOR` | `catalog.services.read` | yes | `DRAFT` | optional (full catalogue) |
| 3 | `STAFF_SELECTOR` | `catalog.staff.read` | yes | `DRAFT` | optional |
| 4 | `TIME_SLOT_SELECTOR` | `booking.availability.read`, `booking.group-availability.read` | yes | **`DRAFT` — never `COMMIT`** | **required** (full calendar) |
| 5 | `BOOKING_CONFIRMATION` | `appointments.own.{create,reschedule,cancel}` → canonical booking owner (B31/B32/B33) | yes | `COMMIT` — **exactly one** | optional |
| 6 | `SCHEDULE` | `staff.schedule.read`, `staff.schedule.own.read`, `operations.journal.read`, `company.business-hours.read` | yes | `REFINE` / `NAVIGATE` | **required** above density cap |
| 7 | `CLIENT_LIST` | `clients.*`, `customers.count`; bulk via `b35.preview` / `b35.status` / `b35.confirm` (`CanonicalBulkService`) | yes | `REQUEST_APPROVAL` | **required** |
| 8 | `METRIC` | `c7.measurement.read` (`MeasurementReadService`), `analytics.team-kpi.read` | yes | `NAVIGATE` only | optional |
| 9 | `CHART` | `c8.result.read` (`C8ReadService`) + `c7.measurement.read` | yes | `NAVIGATE` only | **required** |
| 10 | `REPORT` | `analytics.business.{query,profit}`, `analytics.revenue.forecast`, `analytics.branches.compare`, `reports.recovered`, `expenses.read`, `clients.dossier.read` | yes | `NAVIGATE` only | **required** |
| 11 | `STRATEGY_OPTIONS` | `C9Run` revisions + `c9.no_action` | yes | `REQUEST_APPROVAL` | optional |
| 12 | `APPROVAL` | `ActionExecution` (adapter `exact_source_confirmation`) | yes | `COMMIT` (the decision only) | **required** (effect detail) |
| 13 | `PROGRESS` | `C9Run` execution; `owner_report.status` | yes | `NONE` + one cancel | no |
| 14 | `LIMITATION` | none of its own — cites the emitter's `Limitation[]` and the gap ledger | yes | `NAVIGATE` / `HANDOFF` | optional |
| 15 | `SOURCE_STATUS` | `support.integration-status.read`; handoff `support.contact-admin.request` | yes | `HANDOFF` | optional |
| 16 | `SETTINGS_DRAFT` | `settings.{read,update}`, `notifications.appointments.{read,update}`, `staff.schedule.update`, `a22.configuration` | yes | `COMMIT` (apply) | **required** (`editor_handoff_intent`) |
| 17 | `FORM` | inherited — e.g. `expenses.create`, `tasks.create`, `loyalty.internal.adjust` | yes | `DRAFT` / `COMMIT` | **required** (fallback editor) |
| 18 | `MEDIA_PREVIEW` **(new)** | CutMatch (`cutmatch.py`, OpenAI gpt-5.1 + fal.ai) — **not registered; see §9** | yes | `REFINE` (regenerate) | **required** |
| 19 | `ARTIFACT` **(new)** | `owner_report.download` + `owner_report.status` (`OwnerReportRun`) | yes | `NAVIGATE` / `HANDOFF` | no (the file *is* the detail) |
| 20 | `CONSENT_STATE` **(new)** | consent register (`ConsentSecurityApprovalService` family) — **not registered; see §9** | yes — **`HANDOFF` and `escape` only, by kind** | **required** |
| 21 | `IDENTITY_BINDING` **(new)** | `client-channel-authenticator.service.ts`, CRM binding — **not registered; see §9** | yes — **`HANDOFF` and `escape` only, by kind** | **required** |
| 22 | `PAYMENT_HANDOFF` **(new)** | `gift-certificate-*-shadow`, `p4-06-yookassa-checkout-provider`, `loyalty-redemption-claim.contract` — **shadow, not registered; see §9** | yes | **`HANDOFF` only** | **required** |

### Table B — how it speaks, and how authority changes it

| # | Kind | Textual / screen-reader equivalent | Role-scoping note (same type, different authority) |
|---|---|---|---|
| 1 | `CHOICE` | Prompt sentence, then a numbered list of `utterance` strings; `radiogroup` or `listbox`. | Option *set* is server-filtered by authority snapshot; the *kind* never changes. A client sees three services, an owner sees forty — one CHOICE. |
| 2 | `SERVICE_SELECTOR` | Numbered list: name, duration, price, each a formatted `Measure`; total preview as a closing sentence. | `client` sees bookable, publicly-priced services. `staff`/`owner` additionally see internal/consultation-gated ones. Margin is never in this body — that is `REPORT`. |
| 3 | `STAFF_SELECTOR` | Numbered list: name, role, nearest availability. | `client` sees display names and availability only. `staff` sees own row plus colleagues. `owner` may see rating; never earnings — earnings are `REPORT`. |
| 4 | `TIME_SLOT_SELECTOR` | Grouped by day, then part of day; ≤5 spoken with an overflow sentence; every slot states start, duration and price. | `client` sees only client-bookable windows (the `book_record` → 422 boundary). `staff`/`owner` may see the admin path's wider window — **a different capability read, the same kind**. |
| 5 | `BOOKING_CONFIRMATION` | Full read-back paragraph, then the single commit sentence. `readback_template` is **mandatory**. | Identical structure in all modes. `client` mode requires `subject_is_principal`. Staff booking for a client raises `pii_class` to `client_identified` and the fence in A4 applies. |
| 6 | `SCHEDULE` | Lane-by-lane prose: "Илья, 11:00–12:00, занято"; masked entries read "занято" with no name. | `staff` default: own lane expanded, colleagues' titles masked. `owner`: all lanes. `client`: own appointments only — which is `CLIENT_LIST`-shaped, so `client` mode generally does **not** receive `SCHEDULE`. |
| 7 | `CLIENT_LIST` | Row-per-line prose over the `TableSpec`, plus `completeness_sentence` verbatim; `role_hint: 'table'`. | **Never emitted in `client` mode** (A4). `staff` sees own clients, masked contacts. `owner` sees the segment. Bulk intents always state `audience_size` before the tap. |
| 8 | `METRIC` | One sentence per `Measure`: label, formatted value, unit, `as_of`, basis. Non-`KNOWN` cells read their `label`, never "ошибка". | `staff` = own KPI (`analytics.employee.query`). `owner` = business (`analytics.business.query`). Same kind, different registered capability, **never a different widget type**. |
| 9 | `CHART` | The `table_equivalent` rendered as prose — **not a description of the picture**. `role_hint: 'img'` with the table as its description. | Series set is authority-filtered server-side. A staff member never receives a series they may not read; the chart does not "grey out" — the series is absent and a `Limitation` says so. |
| 10 | `REPORT` | Headings, narrative, then tables row-by-row; `top_summary` (≤3) first, always followed by the fullscreen sentence. | The old `business_report` / `master_earn` / `master_upsell` split collapses here. One kind; `owner` gets business sections, `staff` gets own-earnings sections. Two-level `group_by` carries the attribution hierarchy. |
| 11 | `STRATEGY_OPTIONS` | Question, then ≤3 alternatives with reasoning, expected effect, risk and reversibility — then **the NO_ACTION option, always spoken**. | Emitted to `owner`/`platform` only. `review_disclaimer` is verbatim in text: a review is not an approval. |
| 12 | `APPROVAL` | Subject, effect preview, audience size, risk, reversibility, expiry — **then** the approve/reject sentences. Order is normative: consent-aware maths before the irreversible verb. | Visible to whoever may decide. `four_eyes` means approver ≠ initiator; a requester receiving their own approval gets `approve_intent: null` and a `Limitation` explaining why. |
| 13 | `PROGRESS` | "Шаг 2 из 4 …" per step; `budget_note` read aloud — including that paid reasoning is disabled. | Identical in all modes. Receipt refs are shown only to principals who may read the receipt. |
| 14 | `LIMITATION` | Headline, detail, and — when `capability_gap_ref` is set — an explicit sentence that nothing in the product can do this yet. | Identical. The gap statement is never softened by mode. An owner is not told a capability exists because they are an owner. |
| 15 | `SOURCE_STATUS` | Per source: name, state, `as_of`, impact sentence. | `client` sees only the impact on their own data ("история недоступна"), never provider names or credentials. `owner` sees the integration. |
| 16 | `SETTINGS_DRAFT` | Diff read as "было → станет", each with its effect sentence and reversibility; then apply / discard / open-the-editor. | Diff paths are authority-filtered. `editor_handoff_intent` is **never droppable** — it is the mandated non-chat fallback for audit, exactness, accessibility and correction. |
| 17 | `FORM` | Field-by-field prose with current values; `SECURE_SURFACE_ONLY` fields are **absent from the text** and replaced by one handoff sentence. | Field set varies by authority; `justification` does not. FORM emissions are counted per tenant per week — a social control, not a technical one. |
| 18 | `MEDIA_PREVIEW` | **The generation recipe, not the picture**: what was requested, which parameters, when, plus a mandatory server-authored `alt`. Text-only channels receive the recipe and a handoff. | `pii_class: 'client_identified'` whenever the source image is a client photo. `client` mode requires `subject_is_principal`. Staff never receive another client's generated image in chat. |
| 19 | `ARTIFACT` | Filename, format, size, what it contains, whether it contains personal data, and when the link expires. | The file is minted for one `principal_proof_hash`; a relink invalidates it. `client` mode may only receive artefacts about the principal. |
| 20 | `CONSENT_STATE` | Current decision, when it was recorded, what it permits, what changing it would do, and the single sentence naming the verified surface where it can be changed. | **Content identical across modes; actuation impossible in all of them.** An owner cannot change a client's consent from chat any more than a client can. |
| 21 | `IDENTITY_BINDING` | Which channels are linked, since when, what each unlocks, and what unlinking would cost — then the handoff sentence. | An owner sees that a staff member has a link; only the verified staff surface can destroy it. Never actuated by the identity of the channel asking. |
| 22 | `PAYMENT_HANDOFF` | What is bought, exact amount as a `Measure`, who takes the payment, and what returns afterwards. No amount is ever client-supplied. | Amount and beneficiary are server-fixed. `client` pays for own items only. Tips resolve through the native bridge, so below `SESSION_VERIFIED` the only text is a handoff sentence. |

---

## 6. The five additions, each justified by inventoried surfaces

Every addition had to survive one question: *does a generic kind already cover this, and would folding it lose a safety property?* Five did.

### 18. `MEDIA_PREVIEW`
**Surfaces:** CutMatch across the 465 `pwa` surfaces; the native shell's hard `MayaRuntime.loadRemoteImage` dependency; CutMatch named in the inventory as a live consumer of the legacy `__meRole` globals.
**Why not `CHOICE` with `OptionItem.media`:** there, media decorates a choice. Here the generated image **is** the body, it is a photograph of a client's face (`pii_class: 'client_identified'`), it has its own retention life, and it is in scope for `GAP-HISTORY-ERASE`. Folding it into `CHOICE` would put client biometric-adjacent media into a kind with no PII ceiling.
**Why it is honest about R1:** an image cannot be stated in text. So the kind's text equivalent is defined as the **recipe**, and `fullscreen_detail` is mandatory. Stating that explicitly is better than pretending an `alt` string satisfies portability.

### 19. `ARTIFACT`
**Surfaces:** `owner_report.download` and `owner_report.status` — two of the 56 registry entries with no home among the 17; the Telegram channel's proven CSV/PDF-into-conversation pattern; `GAP-CONSENT-REGISTER-EXPORT` (the Roskomnadzor journal).
**Why not `REPORT.export_intent`:** the intent *requests* a file. The file, once minted, is a distinct read model with expiry, format, size, a PII flag, a re-fetch path and a principal binding. It also cannot be a plain `<a download>` — downloads are constrained in the viewer sandbox and in the native shells. Two registered capabilities with no kind is sufficient evidence on its own.

### 20. `CONSENT_STATE`
**Surfaces:** four of the eight capability gaps (`GAP-CONSENT-MKT-CHANGE`, `GAP-CONSENT-PD-WITHDRAW`, `GAP-CONSENT-REGISTER-EXPORT`, and adjacently `GAP-HISTORY-ERASE`); two live surfaces that still *promise* revocation via `/unsubscribe`; `ConsentSecurityApprovalService` / `ConsentSecurityInvalidationService`.
**Why not `CHOICE` or `LIMITATION`:** the contract permits consent *copy* in those kinds, and that is technically sufficient — but a `CHOICE` whose only intent is `HANDOFF` is a lie-shaped object, and §6.8 concedes its own list can go stale. A dedicated kind makes `NEVER_CHAT_ACTUATED` **structurally enforceable**: the validator rejects any `CONSENT_STATE` carrying an intent whose role is not `handoff` or `escape`. That converts a maintained list into a type rule. Given that this is the product's live 152-FZ exposure, the kind earns its place.

### 21. `IDENTITY_BINDING`
**Surfaces:** `GAP-IDENTITY-TG-UNBIND`; `crm/client-channel-authenticator.service.ts`; the bind-code flow; the `channel_unlinked` / `no_crm_binding` preview-downgrade reasons.
**Why not `SOURCE_STATUS`:** the read models do look alike — a list of things that are connected or not. I considered folding and rejected it for two reasons. First, the authority rules differ categorically: a provider reconnect is an ordinary `HANDOFF`, an identity unbind is `NEVER_CHAT_ACTUATED`. Second, and decisively, **the five client-preview enforcement points key off channel-binding state**, and A4 forbids any refactor that collapses them. Putting identity into the same bag as provider health is an open invitation to exactly that refactor. Keeping them apart costs one kind and protects the PII boundary.

### 22. `PAYMENT_HANDOFF`
**Surfaces:** the live `tips` and `shop` widget keys; `MayaRuntime.openTipsURL` / `checkTipsAvailability` in the native contract; `GAP-COMMERCE-GIFT`; `commerce.certificates.read` and `commerce.memberships.read` registered as reads with **no write counterpart**; the project's documented double-payment gotcha.
**Why not `BOOKING_CONFIRMATION` or `CHOICE`+`HANDOFF`:** the effect owner is an **external payment provider**, so a `COMMIT` token must never exist for it — the ceiling is `HANDOFF`, structurally. A dedicated kind makes "one payment, one receipt, amount server-fixed" a property of the type rather than a review comment. Tips literally cannot be actuated in-app; they leave through the native bridge. That is a different shape from every other kind here.

---

## 7. Kinds explicitly refused

Refusals matter as much as additions. Each of these appeared in the raw vocabulary and each is folded or deleted.

| Refused | Folds into | Why |
|---|---|---|
| `ERROR`, `FAILURE`, `RETRY` | `LIMITATION` + `Cell.state` | The contract has no error kind and no error severity. M1 forbids binding a non-`KNOWN` cell to a danger token. **"UNKNOWN must never be rendered as failure."** |
| `EMPTY_STATE`, `NO_DATA` | `Cell` state `NOT_MEASURED` / a `KNOWN` zero | Emptiness is a value with a reason code and an `as_of`, not a screen. An empty-state kind inevitably grows an error look. |
| `LOGIN`, `AUTH`, `ROLE_PICKER`, `PAYWALL` | **nothing — not a widget** | Authority is never a widget. The dead `'role'` key in router `S`, the seven overlays, and `localStorage.me_is_staff` pre-routing are what happens when it is. |
| `NOTIFICATION`, `PUSH_CARD`, `REMINDER`, `BRIEF`, `ALERT` | existing kinds + `Origin.trigger: 'proactive'` | All 12 canonical outbound moments and 32 scheduler surfaces are ordinary projections with a `moment`, a `dedupe_key` and `authority_basis: 'pre_authorized_presentation'`. Proactivity is provenance, not shape. |
| `WIZARD`, `ONBOARDING`, `STEPPER` | a chain of `CHOICE`/`FORM` + `correlation.step_index` | Steps are correlation, not type. "2 из 4" already renders in every channel including text. |
| `TABLE`, `GRID`, `LIST` | `TableSpec` substratum | A bare table has no canonical owner and no effect ceiling. It is a shape inside `CLIENT_LIST`, `REPORT` and `CHART.table_equivalent`. |
| `CLIENT_CARD`, `DOSSIER`, `PROFILE` | `REPORT` (`clients.dossier.read`) | A dossier is a sectioned narrative over one subject — `REPORT`'s exact shape. Splitting by subject (client-report, staff-report, business-report) *is* the 291-string disease. |
| `KPI_TILE`, `STAT`, `GAUGE`, `SPARKLINE` | `METRIC` (one to five `Measure`s) | A tile is a layout of a `Measure`, not a type. R5: no styling in the contract. |
| `CALENDAR`, `JOURNAL`, `TIMELINE`, `SHIFT_BOARD` | `SCHEDULE` | Time against lanes. Drag-to-reschedule is `SCHEDULE` + a `DRAFT` intent, not a new kind. |
| `BROADCAST_COMPOSER`, `AUDIENCE_BUILDER` | `CLIENT_LIST` → `APPROVAL` | `b35.preview` / `b35.status` / `b35.confirm` already supply audience preview, status and owner handoff. `audience_size` is mandatory on every bulk intent. |
| `VOICE_CARD`, `TRANSCRIPT` | nothing — voice is a **carrier** | §6.9. Audio → transcription → typed intent → the same canonical validation. A voice widget kind would be a second authority path. |
| `MAP`, `VIDEO` | nothing — insufficient evidence | One salon; the team videos are static marketing-site content on `web-public`, outside the chat envelope. Do not mint kinds speculatively. |

---

## 8. Role-scoping doctrine

One rule governs all 22 rows of Table B:

> **Authority changes what a widget contains. It never changes which widget it is, and it never changes which intents exist.**

Concretely, and normatively:

1. **The kind is authority-invariant.** `business_report`, `master_earn` and `master_upsell` become one `REPORT`. A staff KPI and an owner P&L are both `METRIC`. Selecting a different registered capability is the correct mechanism; minting a different kind is not.
2. **The intent set is authority-invariant (A5).** No intent's `capability` may vary by `presentation_mode`. The server decides what the intent *returns*, not whether it *exists*. A control the principal may not use is present, `enabled: {state:'NOT_MEASURED'|'UNAVAILABLE', reason_code:'PERMISSION'}`, and explains itself as an unknown — never as an error, never silently absent.
3. **Narrowing happens server-side, before emission.** Row sets, lanes, series and diff paths are filtered against `authority_snapshot_ref` at emission. A renderer never receives data it then hides. `masked_fields` lists every masked path so the text equivalent can be honest about what was withheld.
4. **`presentation_mode` may reorder, relabel and hide. It may never enable.** This is the existing `app_access` header held verbatim — *presentation context only; endpoint auth still uses JWT + membership; never infer a stronger mode from role, phone, CRM token or screen name.*
5. **The legacy generation is not an input.** `__meRole`, `__meIsStaff`, `__meIsMaster`, `__meIsFounder`, `__panelInfo.permissions`, `localStorage.me_is_staff`, `meIsLegacy()` and `window.__ME_FOREIGN_TENANT` are inputs to **no** widget decision. The tenant gating currently performed in the client's widget map moves to emission time. This is the single largest behavioural change the taxonomy implies, and it is a correctness fix: the current gate is client-side and therefore advisory.
6. **The PII fence is additive, never consolidating (A4).** `pii_class: 'client_identified'` + `presentation_mode: 'client'` requires `subject_is_principal`. This is a **sixth** fence. The five existing client-preview enforcement points stay exactly as they are; any refactor that merges them fails review regardless of how clean it looks.

---

## 9. Ownership readiness — which kinds may actually be emitted

P1 and INV-10 bind every envelope to a **registered** canonical capability. Against the registry as it stands (47 catalog tools + 9 extras = 56 entries), the taxonomy splits cleanly:

**Emittable today — 18 kinds.** Rows 1–17 plus `ARTIFACT`, whose owner `owner_report.download` is registered. (`ARTIFACT` is emittable only for owner reports; the consent-register export has no owner.)

**Blocked on registration — 4 kinds.** None of `consent.*`, `identity.*`, `cutmatch.*`, or any commerce **write** key appears in the registry; the only commerce entry is `commerce.certificates.read`. Therefore:

| Kind | What is missing | What exists already |
|---|---|---|
| `MEDIA_PREVIEW` | CutMatch is not a C9 capability at all — it lives in the **Python monolith** (`ai администратор/cutmatch.py`), not in the NestJS registry. Cross-runtime registration is required first. | A live, shipped feature with a hard native-bridge contract. |
| `CONSENT_STATE` | No `consent.*` read capability. | `ConsentSecurityApprovalService`, `ConsentSecurityInvalidationService`. |
| `IDENTITY_BINDING` | No `identity.*` capability. | `client-channel-authenticator.service.ts`; binding can be created. |
| `PAYMENT_HANDOFF` | No commerce or loyalty **write** capability. | **Substantially more than the brief implies** — `gift-certificate-{purchase,activation,redemption}-shadow.service.ts`, `gift-certificate-claim.contract.ts`, `p4-06-gift-certificate-executable.service.ts`, `p4-06-yookassa-checkout-provider.ts`, `loyalty-redemption-claim.contract.ts`, `legacy-loyalty-redemption-shadow.service.ts`. |

**A finding worth stating plainly.** Two of the eight "no route in any channel" gaps — `GAP-COMMERCE-GIFT` and `GAP-LOYALTY-REDEEM` — are **not greenfield builds**. A named claim contract and a shadow executable owner already exist in the NestJS backend for both. The missing piece is registration and cutover from shadow to canonical, not design. That materially changes the cost of restoring them, and it is the kind of thing only a registry-grounded taxonomy surfaces.

Until each owner is registered, the correct emission for all four is a `LIMITATION` carrying the matching `capability_gap_ref` and **no intent** — P2, fail closed, say so in text. No renderer may synthesise a button for a capability the registry does not contain.

---

## 10. The count

> **22 canonical widget types.**
>
> 17 inherited from the approved brief (`CHOICE`, `SERVICE_SELECTOR`, `STAFF_SELECTOR`, `TIME_SLOT_SELECTOR`, `BOOKING_CONFIRMATION`, `SCHEDULE`, `CLIENT_LIST`, `METRIC`, `CHART`, `REPORT`, `STRATEGY_OPTIONS`, `APPROVAL`, `PROGRESS`, `LIMITATION`, `SOURCE_STATUS`, `SETTINGS_DRAFT`, `FORM`) + 5 additions the evidence demands (`MEDIA_PREVIEW`, `ARTIFACT`, `CONSENT_STATE`, `IDENTITY_BINDING`, `PAYMENT_HANDOFF`).
>
> 18 are emittable against the registry as it stands; 4 are blocked on capability registration.
>
> The set is **closed**. Adding a kind is a contract version bump reviewed like a schema change.

---

## 11. What the evidence does not support

Three decisions I decline to make, rather than invent.

1. **The exact raw-string → kind mapping for all 291.** I did not have the literal list, and I have not reconstructed it. §2 and §3 define a total function; anyone holding the list can apply it mechanically and the result is deterministic. Where a string does not resolve, that is a finding about the string — almost always step 13 — not a missing kind.

2. **Whether `MEDIA_PREVIEW` can satisfy R1 at all.** R1 says the text-only rendering must state every fact a rich renderer shows. A generated image does not reduce to prose. I have defined the text equivalent as the generation recipe plus a mandatory `alt`, and made fullscreen escalation mandatory — but this is the one kind where the portability gate is satisfied by **definition rather than by demonstration**. If the panel considers that a violation, the honest alternative is that CutMatch results are not widgets and live only in `fullscreen_detail`. That is a judgement about the contract's own first principle, and it belongs to whoever owns R1, not to the taxonomy.

3. **Whether `SETTINGS_DRAFT` and `FORM` should merge.** Both are exact-input surfaces with a `COMMIT` ceiling and a mandatory editor handoff. They differ in that `SETTINGS_DRAFT` presents a server-computed **diff** over existing configuration while `FORM` collects **new** values — a real distinction in read model, and `FORM` carries the rationing and `SECURE_SURFACE_ONLY` machinery. I kept them apart on that basis. But the inventory does not contain a surface that decisively requires both to exist, and if one had to go, `SETTINGS_DRAFT` is a `FORM` whose fields are pre-filled with a diff. I flag this as the taxonomy's weakest seam rather than claiming it is settled.

One further caveat, on a number rather than a decision: the brief states 57 registry entries; the file at the commit I read yields 56 (47 + 9). The difference does not change any assignment above, but the discrepancy should be reconciled before the registry count is cited as a gate.
