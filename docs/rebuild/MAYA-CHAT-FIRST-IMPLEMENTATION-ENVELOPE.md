# MAYA CHAT-FIRST — K1…K16 IMPLEMENTATION ENVELOPE

> **FOR IMPLEMENTATION APPROVAL. Nothing here is implemented, and approving it does not start
> implementation — it authorizes wave 1 to open when the owner says so.**
>
> `MAYA WIDGET CONTRACT v1: CERTIFIED` · `CERTIFICATION LOOP: CLOSED` ·
> `OWNER UX DECISIONS: 12/12 APPROVED` · `SURFACES: 795/795`
>
> Every figure is derived by script from the certified contract and the frozen schema, never
> transcribed. Two committed checkers are the way to read this document rather than trust it:
> `mapping-vs-contract-check.mjs` (14/14) and `widget-schema-count.mjs` (10/10).

---

## Part 1 — the sixteen packages

Each package delivers **one capability that can be exercised and proved on its own**. That is why
there are sixteen and not thirty: fifteen of the original thirty were cut along *screens*, and a
screen is not an acceptance criterion — one capability spread across three packages cannot be
accepted in any of them.

---

### K1 · Surface and Capability Ledger

| | |
|---|---|
| **PACKAGE** | K1 — wave 1 |
| **PURPOSE** | Give every surface a class, a successor and an owner, so that something can later be removed. |
| **WHAT CHANGES** | Three ledger tables; the eight `owner: NONE` capability gaps entered as first-class rows; the parity harness, **emitted red by default**. |
| **USER-VISIBLE RESULT** | **None.** No runtime, no UI, no deployed byte changes. |
| **SURFACES** | All **795**. The last 135 by class: `SETTINGS/SECURITY ONLY` 30 · `LEGACY/UNREACHABLE` 14 · `KEEP AS CHAT SURFACE` 4 · `RETIRE AFTER PARITY` 3 · `CONVERT TO WIDGET` 1 · `KEEP AS FULLSCREEN SECONDARY` 1 · `OUT OF SCOPE, WITH REASON` 82. The 669 earlier: `KEEP AS CAPABILITY` 201 · `SECURITY/AUTHORITY ONLY` 121 · `MOVE INTO CHAT WIDGET` 115 · `MERGE` 93 · `KEEP AS FULLSCREEN DETAIL` 76 · `RETIRE FROM PRIMARY NAV` 63. |
| **WIDGET TYPES** | None. K1 emits nothing. |
| **DEPENDENCIES** | None. |
| **AUTHORITY/SECURITY BOUNDARY** | Holds no capability handle. Has no runtime. Cannot confer anything. |
| **SCHEMA IMPACT** | `WidgetCapabilityGap`, `WidgetMechanismGap` (+ `WidgetCapabilityPolicy` with K2) — **22 columns, 0 business tables**. |
| **MIGRATION** | Migration 1 (shared with K2). |
| **PARITY PROOF** | Emits the harness; produces no green rows of its own. |
| **PRODUCTION CUTOVER CONDITION** | **A signed human dossier**: all 795 rows carry a class, a resolvable successor and a named owner. The one exit in the plan a machine cannot certify, because *"is this the right successor"* is a judgement. |

### K2 · Widget Contract and Portability Kernel

| | |
|---|---|
| **PACKAGE** | K2 — wave 1 |
| **PURPOSE** | Turn the certified contract into compiled types, so a violation fails the build rather than review. |
| **WHAT CHANGES** | `WidgetKind` (22, closed) and a `KIND_REGISTRY` total over it; the envelope, intent, target, confirmation and input shapes; the `VerificationLevel` ladder as a type; `WIDGET_CAPABILITY_POLICY`, `CONTROL_REGISTRY`, `AE_WIDGET_COMMIT_ALLOWLIST`, `AE_CAPABILITY_GAP_LEDGER`, `AE_PROPOSE_PAIRING`; the forbidden-key validator; the portability suite. |
| **USER-VISIBLE RESULT** | **None.** Wave-1 TypeScript is excluded from `tsconfig.build.json`; deployed bytes unchanged. |
| **SURFACES** | None. |
| **WIDGET TYPES** | Declares all 22; emits none. |
| **DEPENDENCIES** | K1 (the canon it types). |
| **AUTHORITY/SECURITY BOUNDARY** | Types plus tests. Reads the three registries at build; changes none of them. `C9_REGISTRY_HASH` unchanged. |
| **SCHEMA IMPACT** | `WidgetCapabilityPolicy` — 7 columns. Registries are compiled-in with a start-up assertion, never runtime-editable: a control registry that can grow a fourth key without review is not closed. |
| **MIGRATION** | Migration 1. |
| **PARITY PROOF** | — |
| **PRODUCTION CUTOVER CONDITION** | **One CI job green**: `KIND_REGISTRY` has exactly 22 keys; every per-kind table total; the forbidden-key walk rejects every listed key at every depth of envelope, submission, profile, manifest and record; **R1 portability failures 0**; `MUTATE`/`EXECUTE`/`ERROR`/`overlay` accepted **0**. |

### K3 · Widget Runtime — intent gateway and read-only emission

| | |
|---|---|
| **PACKAGE** | K3 — wave 2 |
| **PURPOSE** | Build the gateway, and with it make `BUTTON → ENDPOINT` **unrepresentable** rather than merely unused. |
| **WHAT CHANGES** | `IntentGateway`: Step 0 plus Gates 1–13 and Gate 8-R as one ordered pipeline. The programme's **only two new routes**, `POST /api/widgets/resolve` and `POST /api/widgets/intent`. All ten runtime stores. `control.widget.dismiss`. |
| **USER-VISIBLE RESULT** | **None in production.** Read-only emission behind an entitlement, dark, to nobody. |
| **SURFACES** | None directly — K3 is the substrate every later surface emits through. |
| **WIDGET TYPES** | `METRIC`, `SCHEDULE`, `SOURCE_STATUS`, `PROGRESS`, `LIMITATION` — read-only, behind the entitlement. |
| **DEPENDENCIES** | K2. |
| **AUTHORITY/SECURITY BOUNDARY** | **The whole of it.** Holds the envelope seal key; mints intent tokens; is the only component that may consume one. Gate 5 recomputes `verificationFloor` from the stored record and refuses on **any** divergence, raised or lowered. Gate 6 dispatches on `subjectCapability(record).space`, scoped by effect — a `HANDOFF` resolves destination fences only. |
| **SCHEMA IMPACT** | 10 models, **159 columns**. No business table. |
| **MIGRATION** | Migration 2. |
| **PARITY PROOF** | Three front doors — tap, typed sentence, spoken utterance — resolve through one pipeline; Gate 10 records divergence. |
| **PRODUCTION CUTOVER CONDITION** | **One CI job green**: a mutated, an expired, a replayed and a foreign-principal token each refused, at **indistinguishable latency**; the wire format has no member able to carry an endpoint, a URL, a capability name, a table, a provider, a tenant or a role; **0 capability calls on the timeline read path**. |

### K4 · Authority Runtime and Secure-Surface Fence

| | |
|---|---|
| **PACKAGE** | K4 — wave 2 |
| **PURPOSE** | Make the verification floor a running derivation instead of a written one. |
| **WHAT CHANGES** | `verificationFloor()` over the five-rung ladder; `subjectFloor`/`c9Floor`/`aeFloor`/`CONTROL_FLOOR`; `FLOOR_EXEMPT` as a **derived** predicate on `priority === 0` plus three exclusion clauses, with its two build vetoes and the LOCAL-uniqueness assertion; `SENSITIVE_DEST`, total over four spaces, fail-closed; the five PII fences; `SECURE_SURFACE_ONLY`. |
| **USER-VISIBLE RESULT** | **None.** A fence is invisible when it works. |
| **SURFACES** | The **121** `SECURITY/AUTHORITY ONLY` rows — as fences, not as screens. |
| **WIDGET TYPES** | None of its own. |
| **DEPENDENCIES** | K2, K3. |
| **AUTHORITY/SECURITY BOUNDARY** | The derivation itself. **Exactly two floor reductions exist** — the nine non-catalogue C9-CAP keys, and the five `FLOOR_EXEMPT` intents — both enumerated in §0.17 and nowhere else. **K4 may introduce no third.** |
| **SCHEMA IMPACT** | **None.** K4 decides; it does not persist. |
| **MIGRATION** | None. |
| **PARITY PROOF** | Floor-reduction count computed from code = **2**, compared against §0.17, failing on any difference. |
| **PRODUCTION CUTOVER CONDITION** | **One CI job green**: `verificationFloor` total over every key in all four spaces; five PII fences fire **independently 5/5**; `SECURE_SURFACE_ONLY` in chat **0**. |

### K5 · Chat Shell, Renderer and Route Registry

| | |
|---|---|
| **PACKAGE** | K5 — wave 2 |
| **PURPOSE** | Build the front end that does not exist — and the **build** that does not exist either. |
| **WHAT CHANGES** | One shell source, emitted once. Renderer modules that receive no token-bearing props and import no `fetch`/`XHR`/`WebSocket`/storage/provider SDK. The route registry: five base routes plus `shell.pay` and `shell.file`. Six overlays → nine route keys. |
| **USER-VISIBLE RESULT** | **The first one anybody sees** — but still dark: the chat shell renders, behind the entitlement. |
| **SURFACES** | The **76** `KEEP AS FULLSCREEN DETAIL` rows; the **115** `MOVE INTO CHAT WIDGET` rows begin routing here; the primary-nav reduction is *prepared* here and *completed* in K16. |
| **WIDGET TYPES** | Renders every emittable kind; emits none itself. |
| **DEPENDENCIES** | K2, K3. |
| **AUTHORITY/SECURITY BOUNDARY** | **None — and that is the property.** A renderer that can reach a capability owner is a second authority path. Role-mode switchers in the UI **0**; the intent set differs by **0 bytes** across the four former role modes. |
| **SCHEMA IMPACT** | None. |
| **MIGRATION** | None. |
| **PARITY PROOF** | Renderer conformance per kind per profile; the a11y floor. |
| **PRODUCTION CUTOVER CONDITION** | **One CI job green**: the bundle's import graph carries no `fetch`/`XHR`/`WebSocket`/storage/provider SDK; **self-mounting hosts 0**; rows without a `fullscreen_intent` **0 of 76**; silent login failures **0**; unreachable route keys **0**. |

### K6 · Channel Profiles, Degradation and Voice

| | |
|---|---|
| **PACKAGE** | K6 — wave 2 |
| **PURPOSE** | Make one envelope survive five carriers and a voice call without a second implementation. |
| **WHAT CHANGES** | `ChannelProfile` per carrier, **monotone-reductive**; the `EP-FIT` ladder and its per-carrier `RenderReceipt`; in-app, Telegram, web push, SMS, e-mail, plus voice; the spoken-readback path feeding Gate 8-R; the escape verb on every non-`RICH_INTERACTIVE` tier. |
| **USER-VISIBLE RESULT** | **None yet** — nothing is delivered to a real channel until wave 6. |
| **SURFACES** | Every surface with a non-PWA carrier. |
| **WIDGET TYPES** | Fits all emittable kinds; emits none. |
| **DEPENDENCIES** | K3, K5. |
| **AUTHORITY/SECURITY BOUNDARY** | **A profile may only take capability away** — never raise a ceiling, never add an intent, never lower a floor; a profile exceeding the contract's maximum fails process start. **`profile_id` is ADVISORY and never an authority input**: Gate 8-R keys on `record.confirmation?.requires_readback`, read from the stored record. **Voice gets no authority of its own.** |
| **SCHEMA IMPACT** | Writes `WidgetRenderReceipt`. No new model. |
| **MIGRATION** | None. |
| **PARITY PROOF** | Per-carrier render receipts; the degraded and undegraded envelopes both retained under one `widget_id`. |
| **PRODUCTION CUTOVER CONDITION** | **One CI job green**: every withheld intent and every body reduction names a `reachable_via`/`restored_by` **present in the emitted envelope**, or the fitter throws rather than emitting; the escape verb reachable on every tier. |

### K7 · Booking Commit Path

| | |
|---|---|
| **PACKAGE** | K7 — wave 3 |
| **PURPOSE** | The first write path — and the proof that a COMMIT token cannot exist outside a confirmation. |
| **WHAT CHANGES** | The booking draft owner behind `confirmation_of_ref.kind === 'draft'`; the `BOOKING_CONFIRMATION` body; the three allowlisted rows `crm.appointment.{create,reschedule,cancel}.v1`; the booking `AE_PROPOSE_PAIRING` rows; the static proof that no other COMMIT-minting path exists. |
| **USER-VISIBLE RESULT** | **A client can book, reschedule and cancel from chat** — dark, behind the entitlement. |
| **SURFACES** | The booking flow's rows across `app.html` and Telegram. |
| **WIDGET TYPES** | `SERVICE_SELECTOR`, `STAFF_SELECTOR`, `TIME_SLOT_SELECTOR`, `BOOKING_CONFIRMATION`. |
| **DEPENDENCIES** | K4, K5. |
| **AUTHORITY/SECURITY BOUNDARY** | The COMMIT guard. **Three keys are allowlisted, not seven** — `attendance`, `duration`, `services`, `fields` are gap-ledgered under `GAP-APPOINTMENT-DETAIL-COMMIT`: no propose key exists for them in any space, and none may be inferred or added. |
| **SCHEMA IMPACT** | Writes `WidgetDraft`; writes the receipt store **through the Action Engine**, never directly. No new model. |
| **MIGRATION** | None. |
| **PARITY PROOF** | The audit rows for *«said it»*, *«typed it»* and *«pressed it»* differ by **0 bytes**. |
| **PRODUCTION CUTOVER CONDITION** | **One CI job green**: static paths minting a `COMMIT` outside a confirmation **0**; direct YClients calls from the widget layer **0**. The provider owner alone touches YClients; reschedule stays the non-destructive `PUT record/{company}/{id}`; the client path still refuses non-working time with 422, and writing at any time remains the admin path. |

### K8 · Client Capability Widgets

| | |
|---|---|
| **PACKAGE** | K8 — wave 3 |
| **PURPOSE** | Put the client's own capabilities into the conversation. |
| **WHAT CHANGES** | My bookings, the service catalogue, the master picker, the referral card, the loyalty balance, the push-permission card. |
| **USER-VISIBLE RESULT** | **A client stops navigating to find things** — dark, behind the entitlement. |
| **SURFACES** | The bulk of the **115** `MOVE INTO CHAT WIDGET` rows. |
| **WIDGET TYPES** | `CHOICE`, `METRIC`, `LIMITATION`, `SOURCE_STATUS`, `FORM`. |
| **DEPENDENCIES** | K5, K7. |
| **AUTHORITY/SECURITY BOUNDARY** | **The five PII fences fire here or nowhere.** `CLIENT_LIST` is refused outright under `presentation_mode: 'client'` — with no exception and no subject test, because a client list is a segment and a segment is never one principal. |
| **SCHEMA IMPACT** | None of its own. |
| **MIGRATION** | None. |
| **PARITY PROOF** | Every emission fixture replayed under a downgraded principal. |
| **PRODUCTION CUTOVER CONDITION** | **One CI job green**: five PII fences fire **independently 5/5**; **0** client-facing envelopes carry a capability the live principal does not hold. |

### K9 · Commerce and Loyalty Redemption

| | |
|---|---|
| **PACKAGE** | K9 — wave 3 |
| **PURPOSE** | Hand off to payment without the widget layer ever touching money. |
| **WHAT CHANGES** | `PAYMENT_HANDOFF`; `shell.pay` session minting; the tip card; the redemption path. |
| **USER-VISIBLE RESULT** | **A client can pay or tip from chat** — via a first-party route, dark. |
| **SURFACES** | Payment and tip rows. |
| **WIDGET TYPES** | `PAYMENT_HANDOFF` — **blocked on capability registration**. Until its commerce keys are registered the correct emission is a `LIMITATION` carrying the mapped `capability_gap_ref` and **no intent**. |
| **DEPENDENCIES** | K7. |
| **AUTHORITY/SECURITY BOUNDARY** | **The finance fence: no money-mutating capability is on the allowlist at all** — all **92** `MONEY` keys are gap-keyed. `shell.pay` carries **one opaque server-minted `session_ref`** matching `/^[A-Za-z0-9_-]{8,64}$/` and nothing else; the wire format has no member able to hold a provider URL, a checkout id or a card token. `crm.visit.payment.v1` is `DENY` and not mintable. |
| **SCHEMA IMPACT** | Writes the receipt store through the Action Engine. No new model. |
| **MIGRATION** | None. |
| **PARITY PROOF** | Forbidden-key walk over every emitted body and submission. |
| **PRODUCTION CUTOVER CONDITION** | **One CI job green**: money-mutating capabilities on the allowlist **0**; `PAYMENT_HANDOFF` bodies with a non-null `commit_intent` while the owner is unregistered **0**. |

### K10 · Analytics and Reporting Widgets

| | |
|---|---|
| **PACKAGE** | K10 — wave 4 |
| **PURPOSE** | Let the owner ask a business question in chat and get an answer whose every number traces to a canonical fact. |
| **WHAT CHANGES** | `METRIC`, `CHART`, `REPORT` over C7/C8 projections; **the CHART read facade** returning `rows_digest` and `series_digest` alongside the rows, computed on the read path **outside the projector**; owner-report artefacts over `shell.file`. |
| **USER-VISIBLE RESULT** | **The owner gets text plus a chart in the conversation**, instead of opening a dashboard — dark. |
| **SURFACES** | The analytics and report rows. |
| **WIDGET TYPES** | `METRIC`, `REPORT`, `ARTIFACT` (narrowly — `owner_report.download`, `owner_report.status`), and `CHART` **only once P-13 ships**. |
| **DEPENDENCIES** | K4, K5. |
| **AUTHORITY/SECURITY BOUNDARY** | An `ARTIFACT` is minted for **one** principal: the delivery route re-compares the live principal's proof hash at `EP-FETCH`, and `contains_pii` is stated **before** the file is fetched. The facade is a new field on a **widget-layer** read facade — **not a change to any C9 contract**; `C9_REGISTRY_HASH` unchanged. |
| **SCHEMA IMPACT** | None canonical. |
| **MIGRATION** | None. |
| **PARITY PROOF** | Recomputed digests match the projector's rows for every fixture. |
| **PRODUCTION CUTOVER CONDITION** | **One CI job green**: cells that are not C7/C8 projections **0**; numerals originating from an LLM **0**; every `Measure` traces to a `FactUsed`. |

### K11 · C9 Orchestration Widgets

| | |
|---|---|
| **PACKAGE** | K11 — wave 4 |
| **PURPOSE** | Show a strategy, an approval and a run's progress — without the widget layer ever deciding anything about them. |
| **WHAT CHANGES** | `STRATEGY_OPTIONS`, `APPROVAL`, `PROGRESS`; the `control.run.cancel` path. |
| **USER-VISIBLE RESULT** | **The owner sees alternatives with their risk, approves or declines in chat, and watches the run** — dark. |
| **SURFACES** | The orchestration rows. |
| **WIDGET TYPES** | `STRATEGY_OPTIONS`, `APPROVAL`, `PROGRESS`. |
| **DEPENDENCIES** | K3, K4. |
| **AUTHORITY/SECURITY BOUNDARY** | **`risk_tier`, `reversible` and `audience_size` are copied, never recomputed** — a widget that recomputes a risk tier is a widget that can lower one. `NO_ACTION` is **equally selectable**, and it is the unique `resourceClass: 'LOCAL'` row (`c9.no_action`), verified by enumeration. **No C9 contract changes; `C9_REGISTRY_HASH` unchanged.** |
| **SCHEMA IMPACT** | C9 approvals through the orchestrator's own contract. No new model. |
| **MIGRATION** | None. |
| **PARITY PROOF** | Recomputed `risk_tier`/`reversible`/`audience_size` **0** across the fixture corpus. |
| **PRODUCTION CUTOVER CONDITION** | **One CI job green**: 3/3 widgets present; `STRATEGY_OPTIONS` bodies without a selectable `NO_ACTION` **0**; envelopes that *initiate* a strategy **0**. |

### K12 · Data-Subject Authority — consent, unbind, erasure

| | |
|---|---|
| **PACKAGE** | K12 — wave 5 |
| **PURPOSE** | Make the four verified destinations exist **before** anything hands control to them. |
| **WHAT CHANGES** | The consent-register read projection; the four `NEVER_CHAT_ACTUATED` consent acts as class-`s` handoffs; `CONSENT_STATE` and `IDENTITY_BINDING` bodies; the erasure job and the tombstone log; the history-blind replay proof. |
| **USER-VISIBLE RESULT** | **A client can see their consent state and reach the place that changes it** — dark. |
| **SURFACES** | The **30** `SETTINGS / SECURITY ONLY` rows and the consent surfaces. |
| **WIDGET TYPES** | `CONSENT_STATE`, `IDENTITY_BINDING` — both **blocked on capability registration**; until a read owner exists the correct emission is a `LIMITATION` with the mapped `capability_gap_ref`. |
| **DEPENDENCIES** | K3, K4, K6. |
| **AUTHORITY/SECURITY BOUNDARY** | **FR-6a is the whole of this package.** `CONSENT(cap)` holds on `targetKind ∈ {client_consent, client_consent_security}`; F31's start-up veto bars any allowlist row for such a key; F72's lookup then refuses at mint. **The widget layer cannot confer consent.** The only affordance is a class-`s` `HANDOFF` to `shell.privacy`, which confers nothing. |
| **SCHEMA IMPACT** | Writes `WidgetErasureTombstone`. Consent records **only** through the existing canonical owner. |
| **MIGRATION** | None. |
| **PARITY PROOF** | **After an erasure replay, every canonical booking / consent / loyalty read is byte-identical to before.** |
| **PRODUCTION CUTOVER CONDITION** | **One CI job green**: consent records written on channel identity alone **0**; business objects referencing a message id **0**. `Package5Wave3CanonicalCutoverService.recordClientConsent(…, granted, …)` stays the single owner — **no parallel consent owner is created**, and `granted: false` is already the approved meaning of revoke. |

### K13 · Proactive and Notification Integrity

| | |
|---|---|
| **PACKAGE** | K13 — wave 5 |
| **PURPOSE** | Let Maya speak first, exactly once, only when she has something true to say. |
| **WHAT CHANGES** | The twelve canonical moments; `MOMENT_REGISTRY`, `NOTIFICATION_CONSENT_REGISTRY`, `MOMENT_TEMPLATES`; `ProactiveProvenance`; the scheduler; `control.delivery.resolve` and cross-channel dedupe; web push, SMS, e-mail, and the staff Telegram mirror. |
| **USER-VISIBLE RESULT** | **A reminder arrives once, on one channel** — dark. |
| **SURFACES** | **52 of the 135** — the largest single block, and the reason K13 exists: the thirty-package plan named it in its gate and gave it to no package. |
| **WIDGET TYPES** | Every proactive-capable kind, at `freshness_class: 'proactive_once'`. |
| **DEPENDENCIES** | K4, K6. |
| **AUTHORITY/SECURITY BOUNDARY** | **No C10 autonomy.** Exactly **one** legal `authority_basis`; envelopes that initiate a strategy **0**. A moment absent from `MOMENT_REGISTRY` cannot be emitted. Delivery consent and the quiet-hours window are re-read **at delivery time, not at compose time**. |
| **SCHEMA IMPACT** | Writes `WidgetSuppressedEmission` and per-carrier `WidgetRenderReceipt`. |
| **MIGRATION** | None. |
| **PARITY PROOF** | Every suppressed emission has a row and produced no envelope, no empty card, no placeholder — the evidence that **silence was chosen rather than lost**. |
| **PRODUCTION CUTOVER CONDITION** | **One CI job green**: 12/12 moments carry a `dedupe_key`; **duplicate deliveries across push, chat and the Telegram mirror over a 14-day window = 0**. |

### K14 · Telegram Cutover

| | |
|---|---|
| **PACKAGE** | K14 — wave 6 |
| **PURPOSE** | Put Telegram on the same gateway as everything else, at its true tier. |
| **WHAT CHANGES** | The Telegram channel profile; the ~45 commands mapped to the one gateway; the escape verb as `/cancel`; Gate 10 exercised across the command surface. |
| **USER-VISIBLE RESULT** | **Telegram becomes Maya, not a second product** — and this is the first wave where a real user sees anything. |
| **SURFACES** | The Telegram rows. |
| **WIDGET TYPES** | Every kind, fitted to `TEXT_ONLY` / `ANNOUNCEMENT`. |
| **DEPENDENCIES** | K6, K12, K13. |
| **AUTHORITY/SECURITY BOUNDARY** | One gateway, one floor derivation, one gate order. A Telegram tap and a typed sentence resolve to the **same** capability, or Gate 10 records a divergence. |
| **SCHEMA IMPACT** | Receipts through the gateway. No new model. |
| **MIGRATION** | None. |
| **PARITY PROOF** | Every command's resolved capability recorded against `IntentRecord.capability`, **with the divergence count published**. |
| **PRODUCTION CUTOVER CONDITION** | **One CI job green**: Telegram commands executing into an unreachable body **0**. *The existing owner/staff command-reachability defect is a defect in the running bot, fixed on its own schedule — **it is not a justification for this architecture**, and no dead command is restored merely because it exists in the code.* |

### K15 · Legacy Authority Retirement and Bundle Disposition

| | |
|---|---|
| **PACKAGE** | K15 — wave 6 |
| **PURPOSE** | Remove the third authority path, and prove there is one shell. |
| **WHAT CHANGES** | Retirement of `localStorage.me_is_staff` routing before any server call; one shell bundle from one shell source; a recorded probe proving `maya-os-site/index.html` is unreachable. |
| **USER-VISIBLE RESULT** | **None, if it is done right** — and a broken login if it is not, which is why the probe is recorded. |
| **SURFACES** | The **121** `SECURITY/AUTHORITY ONLY` rows, retired as client-side authority. |
| **WIDGET TYPES** | None. |
| **DEPENDENCIES** | K1, K4, K5. |
| **AUTHORITY/SECURITY BOUNDARY** | **The one that matters.** A client-readable value that routes before a server call *is* an authority path, and this is the package that removes it. |
| **SCHEMA IMPACT** | None. |
| **MIGRATION** | None. |
| **PARITY PROOF** | The recorded unreachability probe; the bundle census. |
| **PRODUCTION CUTOVER CONDITION** | **One CI job green**: bundles carrying the shell **1**; copies of the shell source **1**; client-side values that route before a server call **0**. |

### K16 · Retirement Under Parity

| | |
|---|---|
| **PACKAGE** | K16 — wave 6 |
| **PURPOSE** | Delete, one row at a time, only against green evidence, only after the dark window. |
| **WHAT CHANGES** | Row-by-row retirement of legacy surfaces; the primary-navigation reduction to the owner's accepted target. |
| **USER-VISIBLE RESULT** | **The product becomes smaller.** Primary navigation goes from 101 Maya-owned members to 5. |
| **SURFACES** | The **63** `RETIRE FROM PRIMARY NAVIGATION` rows, the **3** `RETIRE AFTER PARITY` rows, the **14** `LEGACY / UNREACHABLE` rows. |
| **WIDGET TYPES** | None. |
| **DEPENDENCIES** | Every parity producer — waves 2 through 5. |
| **AUTHORITY/SECURITY BOUNDARY** | None. **K16 consumes evidence and produces none** — which is exactly what breaks the old plan's `P27 → P30 → everything` cycle. |
| **SCHEMA IMPACT** | None. |
| **MIGRATION** | None. |
| **PARITY PROOF** | Consumes the harness K1 emitted red. |
| **PRODUCTION CUTOVER CONDITION** | **One CI job green**: deletions without a named successor, a passing test and an exercised rollback **0**; deletions before the dark window closed **0**; primary-nav members ≤ the accepted number, with the ratchet direction **non-increasing**. |

---

## Part 2 — the six waves

### WAVE 1 · K1, K2 — the map and the contract

**Fence: zero runtime, zero schema behaviour, zero deployed byte changes.** Wave-1 TypeScript is
excluded from `tsconfig.build.json`; the contract CI job arrives non-blocking. Rollback is
`git revert` plus one CI switch.

> **AFTER THIS WAVE MAYA CAN…** *nothing new.* What changes is that every one of 795 surfaces has
> a class, a successor and an owner, and the contract is compiled rather than written — so a
> violation becomes a build failure instead of a review comment. **This is the wave that makes
> wave 6 possible**: a surface with no successor is never removable, at any later date.

### WAVE 2 · K3, K4, K5, K6 — the spine

**Fence: first runtime, read-only, dark behind an entitlement. One additive migration, zero
business-table changes, zero modified controllers.**

> **AFTER THIS WAVE MAYA CAN…** compose a sealed envelope, derive its floor, fit it to any of five
> carriers, render it, and refuse a forged, expired, replayed or foreign-principal token at
> indistinguishable latency — **all to nobody.** Reading only. The property that matters is
> negative: `BUTTON → ENDPOINT` is now unrepresentable, because the wire format has no field that
> could carry an endpoint.

### WAVE 3 · K7, K8, K9 — the client acts

**Fence: first write path, in two phases guaranteed by absence rather than by a check. Additive;
nothing is deleted.**

> **AFTER THIS WAVE MAYA CAN…** take a booking end to end — service, staff, slot, confirmation,
> canonical record — and show a client their own bookings, catalogue, balance and referral, and
> hand off to payment. Still dark. **A COMMIT token does not exist outside a confirmation**, and
> that is proved statically rather than tested.

### WAVE 4 · K10, K11 — owner and staff intelligence

**Fence: additive, read-only. The only writes are C9 approvals — the orchestrator's own contract.**

> **AFTER THIS WAVE MAYA CAN…** answer a business question with a number that traces to a canonical
> fact, draw a chart whose series carries a digest computed outside the projector, and present a
> strategy with its risk copied rather than recomputed — with `NO_ACTION` equally selectable.
> Still dark.

### WAVE 5 · K12, K13 — the destinations

**Fence: additive. The four verified destinations exist *before* anything hands control to them.**

> **AFTER THIS WAVE MAYA CAN…** show a data subject their consent state, route them to the place
> that changes it, erase a conversation and leave every canonical record byte-identical, and speak
> first — once, on one channel, only when every required Cell resolved. Still dark. **Consent is
> reachable but never conferred by a widget.**

### WAVE 6 · K14, K15, K16 — cutover

**Fence: the only wave allowed to delete anything — row by row, against green parity evidence,
after the dark window.**

> **AFTER THIS WAVE MAYA CAN…** be the product. Telegram runs on the same gateway as the PWA;
> the third authority path is gone; primary navigation is five entries; and every retired surface
> went out against a named successor, a passing test and an exercised rollback. **All of K16's
> difficulty was deliberately moved into evidence that waves 2–5 produce**, which is why cutover
> is the shortest wave and not the longest.

---

## Part 3 — the D12 schema envelope

```
WIDGET-LAYER MODELS: 13
PHYSICAL FIELDS:    181
MIGRATIONS:           2
```

Every number re-derived from the schema by `widget-schema-count.mjs`, which is committed beside
the mapping. **A transcribed count is a count that drifts** — this cycle spent four certification
rounds proving that, and the counters exist so that no figure here is typed by hand.

### The five D12 stores

#### `WidgetIntentRecord`

| | |
|---|---|
| **MODEL** | `WidgetIntentRecord` — intent-audit store |
| **PURPOSE** | The stored intent. Idempotency of a tap, principal binding, and the record Gate 5 recomputes the floor from. |
| **PHYSICAL FIELDS** | **38** — 33 `AUDIT_RETAINED`, 5 `CONVERSATION_CONTENT` |
| **IMPORTANT UNIQUE/CHECK/FK** | `@@unique([intentTokenHash, tenantId])` — one row per token, ever, which is what makes a replayed tap find a consumed row instead of a second effect. **The token itself is never stored**, only its `Char(64)` hash. 7 CHECKs: `WidgetKind`, `EffectClass`, `CapabilitySpace` ×2, `VerificationLevel`, `C9Domain`, `ConfirmationOfKind`. FK → `Tenant`, → `WidgetEmission`. |
| **RETENTION** | `T_AUDIT` = 1095 d from `issuedAt`. Erasure nulls the 5 content columns and keeps the 33 audit ones. |
| **BUSINESS OWNER DEPENDENCY** | `actionReceiptRef` is **the only pointer to a business fact**, and it is a one-way reference the widget layer reads and never writes. |

#### `WidgetRenderReceipt`

| | |
|---|---|
| **MODEL** | `WidgetRenderReceipt` — intent-audit store |
| **PURPOSE** | *What did the user on SMS actually see?* — answerable exactly, three years later. |
| **PHYSICAL FIELDS** | **17** — 15 `AUDIT_RETAINED`, 2 `CONVERSATION_CONTENT` |
| **IMPORTANT UNIQUE/CHECK/FK** | `@@unique([tenantId, widgetId, deliveryChannel])` — one receipt per emission per carrier. CHECKs: `RenderTier`, `ChannelId`. Both the composed and the emitted envelope are retained under one `widget_id`. FK → `Tenant`, → `WidgetEmission`. |
| **RETENTION** | `T_AUDIT`. After erasure the receipt keeps its counts and its withholding reasons and loses the prose — so *"was anything withheld from this person, and could they still reach it?"* survives the erasure of what they were shown. |
| **BUSINESS OWNER DEPENDENCY** | **None.** |

#### `WidgetIntentReceipt`

| | |
|---|---|
| **MODEL** | `WidgetIntentReceipt` — intent-audit store |
| **PURPOSE** | The adjudication of one submission. **The contract names `IntentReceipt` twice — §4.2 FR2 derives `TerminalOutcome` from it, §4.4.3 classifies its `utterance_echo` — and declares it nowhere. This is that shape.** |
| **PHYSICAL FIELDS** | **11** — 10 `AUDIT_RETAINED`, 1 `CONVERSATION_CONTENT` |
| **IMPORTANT UNIQUE/CHECK/FK** | `@@unique([tenantId, intentTokenHash])` — one adjudication per token. CHECKs: `IntentReceiptOutcome`, `ChannelId`. `refusalCode` is a closed vocabulary, never free text. FK → `Tenant`, → `WidgetIntentRecord`. |
| **RETENTION** | `T_AUDIT`. **It lives in the intent-audit store, not the receipt store, and that is not bookkeeping:** `utteranceEcho` is a sentence composed on a person's behalf, so it must be erasable — and the receipt store is declared non-erasable. |
| **BUSINESS OWNER DEPENDENCY** | `actionReceiptRef` → the Action Engine receipt, which **is not erased**. FR2's `outcome === 'CONFIRMED' ⟺ actionReceiptRef !== null` is asserted over this column. That split is what lets an outcome survive erasure as *"this principal submitted intent X against capability Y at time T, and a canonical action completed"* without holding what was said. |

#### `WidgetSuppressedEmission`

| | |
|---|---|
| **MODEL** | `WidgetSuppressedEmission` — intent-audit store |
| **PURPOSE** | The record that **silence was chosen rather than lost**. When a moment's `required_cells` do not all resolve, nothing is emitted — no envelope, no empty card, no placeholder, no failure message — and one row is written. |
| **PHYSICAL FIELDS** | **8** — all 8 `AUDIT_RETAINED` |
| **IMPORTANT UNIQUE/CHECK/FK** | `@@unique([tenantId, dedupeKey, moment])`. FK → `Tenant`. **There is no column for the values that failed to resolve** — recording *what was missing* would put the unresolved business data into the widget layer, which is the thing suppression exists to avoid. Only the JSON Pointers. |
| **RETENTION** | `T_AUDIT`. Nothing to erase: a moment name, a template key, a dedupe key, a timestamp and a list of pointers carry no conversation content. |
| **BUSINESS OWNER DEPENDENCY** | **None.** |

#### `WidgetFreeInputLedger`

| | |
|---|---|
| **MODEL** | `WidgetFreeInputLedger` — intent-audit store |
| **PURPOSE** | Ration open-domain input. Every emission carrying a non-closed field kind is written here **in the mint transaction**. |
| **PHYSICAL FIELDS** | **12** — all 12 `AUDIT_RETAINED` |
| **IMPORTANT UNIQUE/CHECK/FK** | `@@unique([tenantId, intentTokenHash])`. CHECKs: `CapabilitySpace`, `WidgetKind`. `justification` is server-authored from a closed set, **never user text**. FK → `Tenant`, → `WidgetIntentRecord`. |
| **RETENTION** | `T_AUDIT`. |
| **BUSINESS OWNER DEPENDENCY** | **None.** The ledger counts; it does not carry what was typed. |

### The eight supporting models

| MODEL | PURPOSE | FIELDS | KEY CONSTRAINT | RETENTION | BUSINESS OWNER |
|---|---|---:|---|---|---|
| `WidgetTimelineTurn` | conversation turns | 10 A / 2 C = **12** | `@@unique([tenantId, conversationId, turnIndex])`; CHECK `TurnRole`, `ChannelId`; FK → `Tenant` | `T_TIMELINE` 180 d — **fully erasable** | none |
| `WidgetEmission` | the sealed envelope, its lifecycle and its delivery record | 22 A / 4 C = **26** | `@@unique([widgetId, tenantId])`; CHECK `WidgetKind`, `LifecycleState`, `FreshnessClass`, `ChannelId`; FK → `Tenant`, → `WidgetTimelineTurn` | `T_TIMELINE`, with per-kind body drop at `retentionSec` | `deliveryStateJson` is **presentation bookkeeping only** — no surface may read it as a statement about intention, attendance, agreement or consent |
| `WidgetIntentSubmissionAudit` | what arrived at ingress | 12 A / 3 C / 1 X = **16** | FK → `Tenant`, → `WidgetIntentRecord` | `T_AUDIT` | `inputsPiiJson` is `CANONICAL_ELSEWHERE` — erased here, retained there |
| `WidgetDraft` | the server-owned draft a COMMIT confirms | 11 A / 1 C = **12** | `@@unique([tenantId, draftRef])`; CHECK `DraftClass` (5), `CapabilitySpace`; FK → `Tenant` | `T_AUDIT`, `expiresAt` bounded | named by `confirmation_of_ref.kind === 'draft'`; the draft owner is canonical |
| `WidgetErasureTombstone` | the record that an erasure happened | **7**, all A | CHECK `TombstoneStore`; FK → `Tenant` | append-only, floor `T_AUDIT` — **never erased** | in the receipt store by rule; the Action Engine receipts themselves are **not re-declared** here |
| `WidgetCapabilityGap` | the eight `owner: NONE` acts, and every gap a later package opens | **8**, registry | `@@unique([gapKey])`; CHECK `GapOwnerState` | n/a — no data subject | names acts that have no owner; depends on none |
| `WidgetMechanismGap` | `MG-P01 … MG-P32`, one per prerequisite | **7**, registry | `@@unique([gapKey])`; CHECK `MechanismGapStatus` | n/a | every build-status count is **printed from here, never transcribed** |
| `WidgetCapabilityPolicy` | `min_verification`, `consent_class`, `dispatch_is_synchronous` per key | **7**, registry | `@@unique([capabilitySpace, capabilityKey])`; CHECK `CapabilitySpace`, `VerificationLevel`, `ConsentClass` | n/a | **total over C9-CAP's 56 keys and over those only** — AE-CAP totality is the allowlist's and the gap ledger's job |

**Erasure classes, every column exactly once:** 140 `AUDIT_RETAINED` · 18 `CONVERSATION_CONTENT` ·
1 `CANONICAL_ELSEWHERE` · 22 registry = **181**.

### The three confirmations

```
BUSINESS TABLE → WIDGET TABLE FK:   0
BUSINESS SCHEMA OWNERS CHANGED:     0
WIDGET STATE USED AS BUSINESS STATE: 0
```

**`BUSINESS TABLE → WIDGET TABLE FK: 0`.** The boundary has a direction and the direction is the
whole of it. A widget table may name a `Tenant` — 10 of the 13 do — because a widget row that
cannot be tenant-fenced cannot be fenced at all. **No business table names a widget row**, because
then deleting conversation history would leave a business record incomplete.

**`BUSINESS SCHEMA OWNERS CHANGED: 0`, stated precisely enough to check.** Every statement in both
migrations is `CREATE TABLE`. The `Tenant` *model* in `schema.prisma` gains **10 virtual
back-relation fields**, because Prisma requires both sides of a relation declared — and a
one-to-many back-relation **generates no SQL**: the foreign key lives on the child. **Chapter 9 is
the precedent and the proof**: `Tenant` already carries `c9Runs`, `c9StrategyRevisions`,
`c9PlanSteps`, `c9StepBindings` and `c9WorkReceipts`, and its migration contains **zero**
`ALTER TABLE "Tenant"`. Chapter 9 *also* carries an `ALTER TABLE
"TenantBusinessConfigurationRevision" DROP CONSTRAINT` — a real business-table change, correct for
Chapter 9 — and **there is no statement of that shape here**.

**`WIDGET STATE USED AS BUSINESS STATE: 0`.** `DeliveryRecord` carries no business predicate and its
rendering copy is server-minted from a closed template set linted against `подтверд`, `придёт`,
`согласил`, `отказал`, `confirm`, `agree`, `attend`. A business fact is readable **only** through
`actionReceiptRef`; when it is null, no business outcome is assertable. And the load-bearing test
is not the schema test but the **history-blind replay**: the canonical read and action paths are
exercised with the timeline store unreadable, and any business read that fails, degrades or returns
a different value is a violation. *(An FK-absence assertion alone does not catch a service that
joins on a conversation id — which is why the replay is the one that governs.)*

### Migration split

**`MIGRATION 1` — `<stamp>_widget_layer_ledgers` (K1 + K2, wave 1)**
3 models · 22 columns · 3 unique · 3 index · 5 CHECK · **0 FK**.
`WidgetCapabilityGap`, `WidgetMechanismGap`, `WidgetCapabilityPolicy`.

**`MIGRATION 2` — `<stamp>_widget_layer_runtime` (K3, wave 2)**
10 models · 159 columns · 18 unique · 20 index · 29 CHECK · 16 FK (10 → `Tenant`, 6 widget → widget).

**Why two, and not one.** Because the waves have different fences, and one migration would
collapse them.

1. **Wave 1's fence is that the deployed bytes do not change.** Its three tables are *ledgers about
   the plan* — which surface has a successor, which mechanism is built, what a capability's
   verification floor will be. They carry **no data subject, no tenant FK and no erasure class**,
   and nothing reads them at runtime. Shipping them early is what lets wave 1 be reverted with
   `git revert` plus one CI switch.
2. **Wave 2's fence is different**: first runtime, first tenant-scoped rows, first erasable
   content. Its ten tables carry all 16 foreign keys and all 18 `CONVERSATION_CONTENT` columns.
3. **A single migration would put runtime tables into a wave whose exit criterion is «no runtime».**
   Wave 1 could then no longer be accepted on its own terms, and the rollback story would change
   from *revert a commit* to *drop ten tables holding conversation content*.
4. **The dependency is real, not cosmetic**: `WidgetCapabilityPolicy` must exist before K4 can
   derive a floor against it, and K2 is the package that fills it. A wave-2 migration would put the
   table after the first reader.

---

## Part 4 — the navigation migration

```
CURRENT PRIMARY NAV: 101 MAYA-OWNED
TARGET PRIMARY NAV:    5
```

**The arithmetic, corrected and carried.** 112 primary-navigation members exist across all
channels; **101 are Maya-owned**. The other 11 belong to smm-bot, a separate production system at
`/opt/smm_bot` — not this programme's to retire. 63 rows are dispositioned
`RETIRE FROM PRIMARY NAVIGATION`, which leaves **92**, not 49: the earlier "112 → 49" figure did
not survive re-derivation. **19 distinct names across 20 ledger rows** are provably retirable
today. Reaching 5 therefore requires **re-dispositioning 34 further rows** — a decision K1 records
and K16 executes, and a number neither package may assume.

### What remains

| | entry | why it survives |
|---|---|---|
| **1** | **Maya** | the conversation. Everything that *is* a capability is reached by asking. |
| **2** | **Account** | who you are to this tenant. Not a capability — an identity surface. |
| **3** | **Connections** | which channels and providers are bound. A `SOURCE_STATUS` reconnect is a `HANDOFF` and lands here. |
| **4** | **Privacy & Data** | the class-`s` destination for consent and erasure. **The one place a consent decision can actually be made**, because FR-6a forbids a widget from conferring it. |
| **5** | **Notifications** | delivery preferences, re-read at delivery time rather than at compose time. |

Four of the five are `shell.account`, `shell.connections`, `shell.privacy`, `shell.notifications` —
the base routes K5 builds — plus `shell.root`. **They are not a menu.** They are the four
destinations a `HANDOFF` may target plus the conversation itself, and that is why the list is five
rather than a number chosen for tidiness.

### What goes, and only after parity

| goes | count | released by |
|---|---:|---|
| `RETIRE FROM PRIMARY NAVIGATION` | **63** | K16, row by row |
| `RETIRE AFTER PARITY` | **3** | K16 |
| `LEGACY / UNREACHABLE` | **14** | K16 — but only after the recorded unreachability probe, not on the assumption |
| client-side authority routing | the **121** `SECURITY/AUTHORITY ONLY` rows | K15 |
| duplicate shell bundles and sources | to **1** each | K15 |

**Nothing is removed until three things are true at once**, on one commit: its successor's parity
rows are green, a rollback exists **and has been exercised**, and the legacy surface has been
observed unused for the agreed window. Then K16 deletes it — **row by row, never by subsystem**.

`[NON-NORMATIVE]` Parity means *the successor does what the surface did, for the cases the evidence
covers*. It does not mean the fixture corpus is complete; the corpus is a deliverable of every
package, not an assumption of this plan. Where a surface's behaviour is not in the corpus, the
honest disposition is `KEEP AS FULLSCREEN DETAIL`, not `RETIRE AFTER PARITY`.

---

## Part 5 — the four canonical flows

### Client booking

```
CHAT → SERVICE → STAFF → SLOT → CONFIRM → CANONICAL BOOKING
```

| step | what actually happens |
|---|---|
| **CHAT** | The client asks. The text router resolves an utterance to a capability — the same resolution a tap produces. |
| **SERVICE** | `SERVICE_SELECTOR`. Options are a **closed domain**; the submission carries an option id, never a service name. |
| **STAFF** | `STAFF_SELECTOR`, same discipline. |
| **SLOT** | `TIME_SLOT_SELECTOR`, capped at 12 slots, with `more` / `widen` / `none-fit` / escape as the other four intents. |
| **CONFIRM** | `BOOKING_CONFIRMATION` — a **server-composed read model** of the canonical draft. It carries exactly one `COMMIT`, `input_schema === null`, and a 120-second expiry never longer than the draft's hold. |
| **CANONICAL BOOKING** | The `COMMIT` reaches `crm.appointment.create.v1` through the Action Engine. The provider owner alone touches YClients. |

**What makes it safe is a non-existence, not a check.** A COMMIT token cannot be minted outside a
confirmation the canonical owner returned — `confirmation_of_ref` is non-null iff the effect is
`COMMIT`, and where its kind is not `'draft'` a consumed `produced_by_intent_token_hash` must name
the owner's own propose key. There is no path that produces one otherwise, and K7's exit is the
static proof that there is none.

### Owner analytics

```
CHAT → C7/C8 → TEXT + CHART/WIDGET
```

The owner asks. The projector reads **C7 measurement** and **C8 valuation** through their existing
read services. Every rendered number is a `Measure` tracing to a `FactUsed`; a `CHART` additionally
carries `rows_digest` and `series_digest` computed **on the read path, outside the projector**, so
a composed series is unforgeable. **The LLM contributes a template identifier, never a numeral** —
and the guard is a build-time lint over a closed, versioned catalogue, not a per-emission regex,
because a digit filter passes «выручка выросла вдвое».

### C9 strategy

```
CHAT → ORCHESTRATOR → AGENTS → STRATEGY WIDGET → APPROVAL → C6 EXECUTION → PROGRESS
```

| step | boundary |
|---|---|
| **CHAT → ORCHESTRATOR** | The conversation asks for options. **A widget never initiates a strategy** — envelopes that do: 0. |
| **AGENTS → STRATEGY WIDGET** | `STRATEGY_OPTIONS`, ≤3 alternatives plus a **required, equally selectable** `NO_ACTION`. `risk_tier`, `reversible` and `audience_size` are **copied from the agent result, never recomputed** — a widget that recomputes a risk tier is a widget that can lower one. |
| **APPROVAL** | `APPROVAL` carries exactly **two** COMMIT intents on **one** subject: approve and reject, mutually exclusive, same `approval_ref`, same AE capability, and consuming either marks the other consumed. |
| **C6 EXECUTION** | Through the orchestrator's own contract. **No C9 contract changes; `C9_REGISTRY_HASH` unchanged.** |
| **PROGRESS** | `PROGRESS`, minted by the orchestrator from orchestrator state. Cancellation is `control.run.cancel` — a `CONTROL` key under its owner endpoint's own write-once lock, **not** a C9 canon member, by design. |

**And the honest limit:** the approval path is **role-gated, not separation of duties**. The
repository's `canDecide` resolves `approvalPolicy: 'owner'` to *any* member of the owner roles,
the initiator included, and never compares the approver to the actor. The contract **deletes** the
four-eyes claim rather than softening it, and keeps `loyalty.internal.adjust` off every
chat-reachable confirmation body. That is a containment, not a fix, and it stays an owner decision.

### Voice

```
VOICE → SAME TYPED INTENT PATH AS TEXT
```

**There is no voice authority.** A spoken utterance is lowered to text, resolved by the same
deterministic router, and produces the same typed intent, through the same gateway, against the
same floor, in the same gate order. What voice adds is **one** obligation, not one path:
Gate 8-R, the spoken readback — and it is keyed on
`record.confirmation?.requires_readback`, **read from the stored record**, never on the
submission's `profile_id`, which R3.8.3 declares advisory and not an authority input.
`spoken_transcript` is carried for audit with **authority `NONE`**, and is
`CONVERSATION_CONTENT` — erased with the conversation.

**The proof obligation this creates** is Gate 10: the router is run over the lowered utterance and
its resolved capability compared with `IntentRecord.capability`. Today that divergence is
**audited, not refused** — *"three front doors, one function" is measured, not enforced* — because
the promotion criterion that would convert the audit into a refusal is **an owner decision and is
not set**. No package may set it.

---

## Part 6 — the Final Chat-First Acceptance Gate

**The cycle is complete when all twenty-four conditions are green simultaneously, on one commit,
in one CI job `chat-first-completion-gate`.** Anything yellow or unmeasured means it is not
complete. There is no partial completion and no «complete with caveats».

| # | condition | threshold | owned by |
|---|---|---|---|
| **G1** | every surface classified | `UNASSIGNED = 0` of 795; name collisions 0; orphan rows 0 | K1 |
| **G2** | successor closure | rows with no resolvable successor = 0 | K1 |
| **G3** | every needed capability reachable | lost 0; keys reachable in 0 channels = 0 | K1 |
| **G4** | capability gaps closed | canon entries with `owner: NONE` = 0 of 8; recovery rows with no home = 0 of 10 | K1 · K12 |
| **G5** | widget contract certified — portability | R1 failures 0; forbidden keys accepted 0; `MUTATE`/`EXECUTE`/`ERROR`/`overlay` 0 | K2 |
| **G6** | provenance of numbers | numerals without a `Measure` 0; `Cell.label` from the error lexicon 0 | K3 · K10 |
| **G7** | role modes out of UX, not out of security | mode switchers in UI 0; intent-set difference across the four modes **0 bytes**; server control points ≥ baseline | K4 · K5 |
| **G8** | backend authority unchanged | C6–C9 diff 0; **modified business tables 0**; migrations other than the two 0; **FKs into business tables 0**; routes ≤ 2 | K2 |
| **G9** | fullscreen parity, overlays gone | rows without `fullscreen_intent` 0 of 76; self-mounting hosts 0; 6 overlays → 9 route keys | K5 |
| **G10** | bundle disposition | bundles with the shell 1; shell sources 1; `maya-os-site/index.html` unreachable, **probe recorded** | K15 |
| **G11** | primary-nav target reached | ≤ the accepted number (5); members without justification 0; ratchet **non-increasing** | K5 · K16 |
| **G12** | router honesty | silent login failures 0; unreachable keys 0 | K5 |
| **G13** | intent unforgeability | mutated / expired / replayed / foreign accepted 0; **latency indistinguishable** | K3 · K4 |
| **G14** | booking end to end | static COMMIT-mint paths outside a confirmation 0; audit-row difference across «said / typed / pressed» **0 bytes** | K7 |
| **G15** | no direct provider writes, no `BUTTON → DATABASE` | YClients calls bypassing the Action Engine 0; reachable write repositories 0 | K7 · K9 |
| **G16** | no security regression — PII and preview | five fences fire **independently 5/5**; `SECURE_SURFACE_ONLY` in chat 0 | K4 · K8 |
| **G17** | never-chat-actuated fence | keys with an intent other than `HANDOFF` 0 of 8; keys not declaring their level 0 | K12 |
| **G18** | analytics rest on canonical facts | cells that are not C7/C8 projections 0; LLM-origin numerals 0 | K10 |
| **G19** | C9 widgets | 3/3 present; recomputed `risk_tier`/`reversible`/`audience_size` 0; `STRATEGY_OPTIONS` without a selectable `NO_ACTION` 0 | K11 |
| **G20** | consent receipts canonical | consents written on channel identity alone 0; incomplete register exports 0 | K12 |
| **G21** | conversation history is never business state | business objects referencing a message id 0; **wrong canonical records after erasure replay 0** | K3 · K12 |
| **G22** | no C10 autonomy | legal `authority_basis` values **1**; envelopes initiating a strategy 0; 12/12 moments with a `dedupe_key`; duplicates over 14 days 0 | K13 |
| **G23** | accessibility, reduced motion, native/PWA parity | WCAG 2.2 critical findings 0; keyboard traversal 3/3; hard refusals on the pinned plugin contract 0 | K5 · K6 |
| **G24** | legacy retired only after parity | deletions without successor / test / rollback 0; deletions before the dark window 0; Telegram commands into an unreachable body 0 | K14 · K15 · K16 |

---

## Part 7 — what this envelope does not authorize, stated before approval and not after

1. **It does not start implementation.** Approval opens wave 1 when the owner says so; this
   document does not.
2. **It does not settle `STEP_UP_VERIFIED` (P-12).** Repo-wide, `stepUp`, `step_up`, `re-auth`,
   `mfa`, `otp` and `twoFactor` are each **0 hits**, and `src/auth/` holds no elevated-session
   concept. Until a re-authentication event type exists, **every `restricted` risk tier and every
   unmapped key is permanently withheld** — fail-closed and correct, but a hole in the product, not
   a property of the design. It belongs to the authentication subsystem and is **outside these
   sixteen packages**. The cheapest path to closing it runs through the native bundle, which can
   host a platform biometric prompt; that is recorded so the owner knows the option exists, not
   planned.
3. **It does not set Gate 10's promotion criterion.** *"Three front doors, one function"* stays
   **measured, not enforced**, until the owner sets it. No package may set it on the owner's behalf.
4. **It does not register `GAP-ATTENDANCE-CONFIRM`'s owner.** Until one exists, an
   `appointment_reminder` carries a `Limitation` and intents of effect `NONE`, `NAVIGATE` or
   `HANDOFF` only. **A «Приду» control that writes nothing is not emitted, and «клиент подтвердил»
   is not a claim any surface may make.**
5. **It does not close the four-eyes gap.** The approval path is role-gated; the owner either adds
   a separation-of-duties comparison or accepts role-gated approval as the product's stated control.
6. **It does not touch production.** `bot.py`'s copy defect and the five repository defects of
   §14-bis are named and each is fixed on its own schedule, in its own worktree, through its own
   deploy path — `maya-saas-backend/deploy/vps/deploy.sh <release>` for the backend, and **never**
   by copying `node_modules` between releases.

**Thirteen of the twenty-one fundamental rules currently hold only fail-closed, because the widget
layer does not exist.** That is the honest reading of this envelope: it is a specification ahead of
its implementation, every unbuilt mechanism is marked `NORMATIVE-PENDING` against a prerequisite
row, and a rule that holds because no gateway exists yet is a rule that holds — but it is not a
running fence. Wave 2 is where that changes.
