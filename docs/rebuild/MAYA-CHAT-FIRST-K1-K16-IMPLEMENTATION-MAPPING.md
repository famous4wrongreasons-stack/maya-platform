# MAYA CHAT-FIRST — K1…K16 IMPLEMENTATION MAPPING

> **Status: CANONICAL. Implementation has not begun and is not authorized by this document.**
> This is the frozen mapping between the approved architecture, the certified
> `MAYA WIDGET CONTRACT v1`, and sixteen packages across six waves. It names what each
> package builds, which contract prerequisite it discharges, which surfaces it owns, which
> widget kinds it may emit, what it is allowed to write, and the single condition on which
> it is accepted. **It authorizes no code**, and adoption is not authorization: the owner
> opens wave 1, not this document.
>
> **Inputs, all frozen:** owner decisions D1–D12 (approved); `MAYA WIDGET CONTRACT v1`
> (consolidated, certified — five certification passes, twelve independent lenses, and the
> narrow confirmation of `R3.11.5`'s executability); the 795-surface inventory at 795/795
> triaged; the sixteen packages and six waves of §14; the twenty-four-condition completion
> gate of §14.4.
>
> **Nothing in this document adds a business decision, a security semantic, a widget kind,
> an authority path or a floor reduction.** Where it names a field the contract does not
> declare, it says so in the row and names the package that must declare it. §5 is the one
> place it goes further than the contract — because the contract names `IntentReceipt` and
> declares no shape for it — and it says so where it does.
>
> **Every figure in this document is derived by script, never transcribed.** Two checkers
> are committed beside it and are the way to read it:
> `evidence/maya-chat-first-ux/mapping-vs-contract-check.mjs` re-derives every claim this
> document makes about the contract (14 checks), and
> `evidence/maya-chat-first-ux/widget-schema-count.mjs` re-derives §5.0's frozen numbers from
> the schema embedded in §5.4 (10 checks). Run them rather than trusting the tables.

---

## 0. What this document is, and the three things it may not do

A package plan written from a taxonomy produces packages that cannot be accepted one at a
time. This one is written from **capabilities**: a package earns its own identifier only if
it delivers something that can be exercised and proved on its own, against evidence that
exists when the package closes and not before.

That test is why there are sixteen packages and not thirty. Fifteen of the original thirty
were cut along surfaces — an "экран" is not an acceptance criterion, because one capability
spread across three screens cannot be accepted in any of them. It is also why there are not
twelve: applying the test a second time yields exactly **one** near-miss merge, K1+K2, and
they stay apart because **K1 exits on a signed human dossier and K2 exits on a CI job**. A
package whose exit criterion is two different kinds of evidence has two exit criteria.

**Three things this document may not do, and does not:**

1. **It may not begin implementation.** No package opens on the strength of this mapping.
   Wave 1 opens when the owner authorizes wave 1.
2. **It may not invent a physical field the contract does not require.** Where the contract
   names an artefact without declaring its shape, this document declares the shape **only**
   where the contract's own rules fix it completely, and otherwise records the open question
   against the package that must answer it. The five widget-layer stores in §5 are declared
   because the contract's retention classification (§4.4.3), its gate inputs (§3.9) and its
   erasure rules (RT5/RT6) together fix every column.
3. **It may not weaken a fence to make a package smaller.** Where a package is large because
   a fence must exist before it can be exercised, the package stays large.

---

## 1. The frozen inputs

| Input | Value | Where it is fixed |
|---|---|---|
| Owner decisions | D1–D12, approved | `MAYA-CHAT-FIRST-UX-OWNER-DECISIONS.md` |
| Contract | `MAYA WIDGET CONTRACT v1`, consolidated | `MAYA-WIDGET-CONTRACT-V1.md` |
| Widget kinds | 22, closed | contract §2.1 |
| Emittable today | 16 + `ARTIFACT` narrowly; `CHART` blocked on P-13; 4 blocked on registration | contract §2.7 |
| Surfaces | 795, triaged 795/795 | architecture §9, §13 |
| Packages | 16 | architecture §14.2 |
| Waves | 6 | architecture §14.3 |
| Completion gate | 24 conditions, one CI job, one commit | architecture §14.4 |
| Capability spaces | `C9-CAP` 56 · `TOOL-DEF` 47 · `AE-CAP` 226 (221 policy definitions) | executed, not grepped |
| Storage authority | D12-B: additive widget-layer stores; canonical business schema owners unchanged | owner decisions D12 |

**The executed baselines.** Every capability count in this document was produced by loading
the registries in process, not by counting literals:

```
ActionCapabilityRegistry.list()                → 226
canonicalProductionPolicyDefinitions()         → 221
MAYA_AI_TOOL_CATALOG                           →  47
C9_CAPABILITIES                                →  56
```

This matters because the registries are built by template functions called several times:
a grep over literals undercounts, and a package plan sized from a grep is sized wrong.

---

## 2. The dependency graph, and why the order is not a matter of taste

```
wave 1   K1 ──► K2
wave 2         K2 ──► K3 ──► K4        (K4 also ◄── K2)
                     └──► K5 ──► K6    (K6 also ◄── K3)
wave 3   K7 ◄── K4,K5      K8 ◄── K5,K7      K9 ◄── K7
wave 4   K10 ◄── K4,K5     K11 ◄── K3,K4
wave 5   K12 ◄── K3,K4,K6  K13 ◄── K4,K6
wave 6   K14 ◄── K6,K12,K13   K15 ◄── K1,K4,K5   K16 ◄── every parity producer
```

**Verified: a DAG, zero cycles, zero wave-order violations.** The thirty-package plan was
not a DAG — `P27` depended on `P30` and `P30` depended on every package. The cycle is broken
by a single decision: **K1 emits the parity harness red by default.** Every later package
turns its own rows green; K15 and K16 only *consume* green rows and produce none. A consumer
cannot be a dependency of its producers.

**The order, with the reason for each edge:**

- **K1 first**, because 135 of 795 surfaces had no class, and a surface with no class has no
  successor, and a surface with no successor is never removable. Retirement is a wave-6
  activity that is decided in wave 1.
- **K3 before any renderer**, because the gateway is the one component whose absence silently
  turns this architecture into the thing it forbids. While the wire format has no field that
  can carry an endpoint, `BUTTON → ENDPOINT` is unavailable to everyone — including a tired
  engineer at two in the morning. Build the impossibility first.
- **Read (wave 2) before write (wave 3)**, because a wrong read shows a wrong number and a
  wrong write creates a wrong appointment.
- **K4 before K7**, because the security property of the write path is the **non-existence**
  of a COMMIT token outside a confirmation, and a non-existence claim only means something
  when an authorized minter decides it.
- **Waves 3–4 before wave 5**, because K4's fence must be closed before any consent owner is
  reachable from a widget.
- **Cutover last, and deletion last inside cutover**, because all of K16's difficulty was
  deliberately moved into parity evidence produced by waves 2–5.

---

## 3. The prerequisite register, mapped to packages

Annex A of the contract registers twenty-two prerequisite components. Every one is assigned
here. **Two are assigned to no package, and that is a finding, not an omission.**

| # | Component | Status today | Package |
|---|---|---|---|
| P-01 | `IntentGateway` + the two routes `POST /api/widgets/resolve`, `POST /api/widgets/intent` | `[ABSENT]` | **K3** |
| P-02 | `IntentRecord` — the stored record and its type | `[ABSENT]` | **K3** |
| P-03 | Timeline store | `[ABSENT]` | **K3** |
| P-04 | Receipt store (append-only; no FK into the timeline) | `[ABSENT]` | **K3** creates · K7/K9/K11/K12 write · K12 proves the split by erasure replay |
| P-05 | Emission/receipt store — `RenderReceipt`, `DeliveryRecord` | `[ABSENT]` | **K3** (store) + **K6** (per-carrier receipt) |
| P-06 | Free-input ledger | `[ABSENT]` | **K3** |
| P-07 | Capability-gap ledger | `[ABSENT]` | **K1** |
| P-08 | Server-owned draft store | `[ABSENT]` | **K3** (store) + **K7** (booking draft owner) |
| P-09 | Consent-register read projection | `[PARTIAL]` — facts exist, no registered read key | **K12** |
| P-10 | `WIDGET_CAPABILITY_POLICY` + `CONTROL_REGISTRY` | `[ABSENT]` | **K2** over **K1**'s canon |
| P-11 | `VerificationLevel` ladder + `verificationFloor()` | `[ABSENT]` — all five rung tokens 0 hits | **K2** (types) + **K4** (runtime) |
| P-12 | `STEP_UP_VERIFIED` reachability | `[ABSENT] at the substrate` | **NO PACKAGE — see §3.1** |
| P-13 | CHART read facade (`rows_digest`, `series_digest`) | `[ABSENT]` | **K10** |
| P-14 | `shell.pay` route + `session_ref` | `[ABSENT]` | **K5** (route) + **K9** (minting) |
| P-15 | `shell.file` route + `artifact_ref` | `[ABSENT]` | **K5** (route) + **K10** (owner reports) |
| — | the five base shell routes | `[ABSENT]` | **K5** |
| P-16 | `control.widget.dismiss` | `[ABSENT]` | **K3** (handler) + **K6** (`EP-FIT` selection) |
| P-17 | `control.delivery.resolve` | `[ABSENT]` | **K13** |
| P-18 | `produced_by_intent_token_hash` on `IntentRecord` | `[ABSENT]` | **K3** (field) + **K7** (static proof of no other mint path) |
| P-19 | Renderer sandboxing / import-graph allowlist | `[UNENFORCEABLE-TODAY]` — no build exists | **K5** must create the build · **K15** proves bundle disposition |
| P-20 | Gate 10 promotion criterion | `[ABSENT]` twice over | **K3** builds the gate · **K14** exercises it · **the criterion is an owner decision** |
| P-21 | `GAP-ATTENDANCE-CONFIRM` canonical owner | `[ABSENT]` | **K13** surfaces reminders; **the owner registration is outside the widget layer** |
| P-22 | `NEVER_CHAT_ACTUATED` — the eight reserved names | `[ABSENT]` as keys | **K12** |

### 3.2 The contract's own machinery — P-23 … P-32

Annex A registers thirty-two prerequisites, not twenty-two. The other ten are components of the
contract's **enforcement machinery** — the registries, assertions and ledgers without which its
rules are statements rather than fences. Every one is `[ABSENT]`: the widget layer does not exist
in any form.

| # | Component | Package |
|---|---|---|
| P-23 | `AE_WIDGET_COMMIT_ALLOWLIST` + `AE_CAPABILITY_GAP_LEDGER` and the start-up assertion set (`row XOR gap` over all 226 AE-CAP rows; the `BOOKING`/`CONSENT`/`IDENTITY`/`MONEY` vetoes; the pairing check) | **K2** (tables) + **K4** (assertions) |
| P-24 | `CapabilityRef`, `capKey(ref)`, the per-effect key-space rule, and F21's source test | **K2** |
| P-25 | `AE_PROPOSE_PAIRING` — the `ae` ⇄ `propose` rows the COMMIT guard compares against | **K2** (table) + **K7** (booking rows) |
| P-26 | Gate 6's four-branch key-space dispatch, scoped by effect | **K4** |
| P-27 | the `controlledFixtureMode === false` build assertion | **K3** |
| P-28 | the widget `ActionSourceType` discipline — a widget-minted request never claims `legacy_bridge` or `synthetic_shadow` | **K4** |
| P-29 | `MECHANISM_GAP_LEDGER` (`MG-P01` … `MG-P32`), from which every status count is **printed at build, never transcribed** | **K1** |
| P-30 | the gateway's record fields (`priority`, `widget_kind`, `body_hash`, `selection_domain`, `c9_domain`, `produced_by_intent_token_hash`) plus `ReadbackAck` and Gate 8-R | **K3** + **K6** (voice) |
| P-31 | `A11yBlock.accessible_names` — total, closed, keyed through `refKey`, with `nameSourceOf`'s seven branches | **K5** |
| P-32 | `MOMENT_REGISTRY` (twelve rows), `NOTIFICATION_CONSENT_REGISTRY`, `MOMENT_TEMPLATES` and the `EP-REGISTRY-LOAD` resolution chain over them | **K13** |

**Wave 1 and wave 2 carry seven of these ten.** That is not incidental: a fence built after the
runtime it fences is a fence that was absent for one release.

### 3.3 The two things no package can deliver, stated before wave 1 and not after

**P-12 — `STEP_UP_VERIFIED` is unreachable, and this is a product hole, not a design property.**
Repo-wide, `stepUp`, `step_up`, `step-up`, `re-auth`, `mfa`/`MFA`, `otp`/`OTP` and `twoFactor`
are each **0 hits**, and `src/auth/` (24 files) contains no elevated-session concept at all.
Until a re-authentication event type exists that can raise a live session's derived level,
**every `restricted` risk tier and every unmapped key is permanently withheld.** That is
fail-closed and therefore correct — but it means a set of capabilities can never be exercised
from chat no matter how many of the sixteen packages ship. It belongs to the authentication
subsystem and is outside these sixteen. **The owner should know this before wave 1, not
discover it when a restricted capability refuses in wave 3.**

**P-20 — "three front doors, one function" is measured, not enforced.** Gate 10 runs the
deterministic text router over the lowered utterance and compares the resolved capability with
`IntentRecord.capability`. K3 builds the gate and K14 exercises it across the Telegram command
surface — but **the promotion criterion that converts the audit from shadow to refusal is an
owner decision and is not defined anywhere in the contract.** Until it is set, divergence is
logged and nothing refuses. No package may set it on the owner's behalf.

**Also outside the sixteen:** P-21's canonical owner. Registering an attendance-acknowledgement
owner is a canonical-owner change, not a widget-layer change. Until it exists, an
`appointment_reminder` carries a `Limitation` with `capability_gap_ref:
'GAP-ATTENDANCE-CONFIRM'` and intents of effect `NONE`, `NAVIGATE` or `HANDOFF` only. **A
«Приду» control that writes nothing is not emitted, and «клиент подтвердил» is not a claim any
surface may make.**

---

## 4. The sixteen packages

Each package row carries: **Delivers · Discharges · Surfaces · Kinds · Writes · Authority ·
Canonical owners · Exit · Gate rows.** "Exit" is a single condition. A package with two exit
conditions is two packages.

### Wave 1 — the map and the contract. Zero runtime, zero schema, zero migrations.

Wave 1's fence is the strongest in the plan: **the deployed bytes do not change.** Wave-1
TypeScript is excluded from `tsconfig.build.json`; the contract CI job arrives non-blocking.
Rollback is `git revert` plus one CI switch. This is what makes it safe to open wave 1 before
the storage question of §5 is settled in code.

#### K1 — Surface and Capability Ledger · wave 1 · depends on nothing

| | |
|---|---|
| **Delivers** | One ledger row per surface for all **795**, each with a class, a successor and an owner; the **capability-gap ledger** as first-class entries (P-07); and the **parity harness, emitted red by default**. |
| **Discharges** | P-07 |
| **Surfaces** | All 795. The seven triage classes over the last 135: `KEEP AS CHAT SURFACE` 4 · `CONVERT TO WIDGET` 1 · `KEEP AS FULLSCREEN SECONDARY` 1 · `SETTINGS / SECURITY ONLY` 30 · `RETIRE AFTER PARITY` 3 · `LEGACY / UNREACHABLE` 14 · `OUT OF SCOPE WITH EXACT REASON` 82. Plus the 669 earlier dispositions: `KEEP AS CAPABILITY` 201 · `SECURITY/AUTHORITY ONLY` 121 · `MOVE INTO CHAT WIDGET` 115 · `MERGE` 93 · `KEEP AS FULLSCREEN DETAIL` 76 · `RETIRE FROM PRIMARY NAVIGATION` 63. |
| **Kinds** | none — K1 emits nothing |
| **Writes** | the ledger tables only (§5.6, §5.7). No business table. |
| **Authority** | none. K1 holds no capability handle and has no runtime. |
| **Canonical owners** | none |
| **Exit** | **a signed human dossier**: every one of 795 rows has a class, a resolvable successor and a named owner, and the eight `owner: NONE` gap keys are entered with their evidence. Signature, not a job — this is the one exit in the plan that a machine cannot certify, because "is this the right successor" is a judgement. |
| **Gate rows** | G1, G2, G3, G4 (ledger half) |

**The arithmetic K1 must carry forward, corrected.** The inventory's own numbers were wrong in
two places and the ledger inherits the corrections, not the originals:

- 63 rows are `RETIRE FROM PRIMARY NAVIGATION`, which leaves **92** rows in primary navigation,
  not 49. The "112 → 49" figure did not survive re-derivation.
- Of 112 primary-nav members across all channels, **101 are Maya-owned**; smm-bot's 11 belong to
  a separate production system at `/opt/smm_bot` and are not this programme's to retire.
- **19 distinct names / 20 ledger rows** are provably retirable today. `Staff home (AStaffHome)`
  appears **twice with conflicting dispositions** — K1 resolves it to one row or states why two
  are correct.

#### K2 — Widget Contract and Portability Kernel · wave 1 · depends on K1

| | |
|---|---|
| **Delivers** | the contract's types as code: `WidgetKind` (22, closed), `KIND_REGISTRY` total over it, `WidgetEnvelope`, `WidgetIntent`, `AuthorityHint`, `EffectClass`, `IntentTarget`, `ConfirmationRequirement`, `InputSchema`, the `VerificationLevel` ladder as a type, `WIDGET_CAPABILITY_POLICY` and the three-key `CONTROL_REGISTRY`; the forbidden-key validator; the portability test suite. |
| **Discharges** | P-10, P-11 (types half) |
| **Surfaces** | none |
| **Kinds** | declares all 22; emits none |
| **Writes** | nothing at runtime. The policy and control tables are compiled-in registries with a start-up assertion. |
| **Authority** | none — K2 is types plus tests. |
| **Canonical owners** | reads the three registries at build to prove `WIDGET_CAPABILITY_POLICY` is total over `C9_CAPABILITIES`'s 56 keys **and over those only** (§0.7 F28) — AE-CAP totality is `AE_WIDGET_COMMIT_ALLOWLIST` ∪ `AE_CAPABILITY_GAP_LEDGER`'s job under F31, not this table's. Changes none of them. |
| **Exit** | **one CI job green**: `Object.keys(KIND_REGISTRY).length === 22`; every per-kind table total; the forbidden-key walk rejects all listed keys at every depth of envelope, submission, channel profile, native bridge manifest and `IntentRecord`; **R1 portability failures = 0**; `MUTATE`/`EXECUTE`/`ERROR`/`overlay` accepted = 0. |
| **Gate rows** | G5, G8 (the schema-diff half) |

**Why K1 and K2 are two packages and not one.** They are the only near-miss in the plan. They
stay apart because their exits are different kinds of evidence — a signed dossier and a CI job
— and a package cannot be half-accepted. A merged K1+K2 would be blocked on a human signature
for a TypeScript change, or would ship types against an unsigned map.

---

### Wave 2 — the spine. First runtime, read-only, dark behind an entitlement.

Wave 2's fence: **one additive table, zero business-table changes, zero modified controllers.**

#### K3 — Widget Runtime: intent gateway and read-only emission · wave 2 · depends on K2

| | |
|---|---|
| **Delivers** | `IntentGateway` — Step 0 plus Gates 1–13 and Gate 8-R as **one ordered pipeline**; the programme's only two new routes `POST /api/widgets/resolve` and `POST /api/widgets/intent`; the timeline store, the intent-audit store, the receipt store's shell, the server-owned draft store and the free-input ledger; `control.widget.dismiss`; the mint/compose/fit/seal path for read-only emission. |
| **Discharges** | P-01, P-02, P-03, P-04 (creates), P-05 (store), P-06, P-08 (store), P-16 (handler), P-18 (field), P-20 (the gate, not the criterion) |
| **Surfaces** | none directly — K3 is the substrate every later surface emits through. |
| **Kinds** | read-only emission of `METRIC`, `SCHEDULE`, `SOURCE_STATUS`, `PROGRESS`, `LIMITATION` behind the entitlement |
| **Writes** | the five widget-layer stores of §5. **One additive migration.** No business table. |
| **Authority** | **the whole of it.** K3 holds the envelope seal key, mints intent tokens, and is the only component that may consume one. Gate 5 recomputes `verificationFloor` from the stored `IntentRecord` and refuses on **any** divergence. Gate 6 dispatches on `subjectCapability(record).space` and is **scoped by effect** — a `HANDOFF` resolves destination fences only. |
| **Canonical owners** | reads only. C6/C7/C8/C9 are called through their existing read services; **no C9 contract changes and `C9_REGISTRY_HASH` is unchanged.** |
| **Exit** | **one CI job green**: a mutated, an expired, a replayed and a foreign-principal token are each refused, with **indistinguishable latency**; the wire format has **no member able to carry an endpoint, a URL, a capability name, a table, a provider, a tenant or a role**, proved by the shape plus the forbidden-key walk; zero capability calls on the timeline read path. |
| **Gate rows** | G13, G21 (the store-split half), G6 (provenance plumbing) |

**The one thing K3 must build before anything else in wave 2.** `BUTTON → ENDPOINT` must be
*unrepresentable*, not merely unused. The wire format has no field for an endpoint; a submission
carries an opaque token the client did not author plus values from a server-declared closed
domain or inside server-declared bounds re-read at Gate 8. That is the whole of the guarantee,
and it is smaller and truer than "a submission cannot contain a date".

#### K4 — Authority Runtime and Secure-Surface Fence · wave 2 · depends on K2, K3

| | |
|---|---|
| **Delivers** | `verificationFloor()` at runtime over the five-rung ladder; `subjectFloor`/`c9Floor`/`aeFloor`/`CONTROL_FLOOR`; `FLOOR_EXEMPT` as a **derived** predicate keyed on `priority === 0` plus its three exclusion clauses, with the build veto and the LOCAL-uniqueness assertion; `SENSITIVE_DEST` total over four spaces, fail-closed; the five PII fences; the `SECURE_SURFACE_ONLY` fence. |
| **Discharges** | P-11 (runtime half) |
| **Surfaces** | the 121 `SECURITY/AUTHORITY ONLY` rows — as fences, not as screens |
| **Kinds** | none of its own |
| **Writes** | nothing. K4 decides; it does not persist. |
| **Authority** | the derivation itself. **Exactly two floor reductions exist** — the nine non-catalogue C9-CAP keys, and the five `FLOOR_EXEMPT` intents — and both are enumerated in contract §0.17 and nowhere else. K4 may introduce no third. |
| **Canonical owners** | none written |
| **Exit** | **one CI job green**: `verificationFloor` is total over every key in all four spaces; the five PII fences fire **independently, 5/5**; `SECURE_SURFACE_ONLY` emissions in chat = 0; floor-reduction count computed from code = **2**, compared against §0.17 and failing on any difference. |
| **Gate rows** | G7 (the server-control half), G13, G16, G17 (fence half) |

#### K5 — Chat Shell, Renderer and Route Registry · wave 2 · depends on K2, K3

| | |
|---|---|
| **Delivers** | **the build that does not exist today**: one shell source, emitted once; the renderer modules, which receive no token-bearing props and import no `fetch`/`XHR`/`WebSocket`/storage/provider SDK; the route registry with the five base routes plus `shell.pay` and `shell.file`; the fullscreen-intent path that replaces the six overlays with nine route keys; router honesty. |
| **Discharges** | P-14 (route), P-15 (route), P-19 (creates the build), the five base routes |
| **Surfaces** | the 76 `KEEP AS FULLSCREEN DETAIL` rows; the 115 `MOVE INTO CHAT WIDGET` rows begin routing here; the primary-nav reduction is prepared here and completed in K16 |
| **Kinds** | renders all emittable kinds; emits none itself |
| **Writes** | nothing |
| **Authority** | **none — and that is the property.** A renderer that can reach a capability owner is a second authority path. |
| **Canonical owners** | none |
| **Exit** | **one CI job green**: the renderer bundle's import graph contains no `fetch`/`XHR`/`WebSocket`/storage/provider SDK; **self-mounting hosts = 0**; rows without a `fullscreen_intent` = **0 of 76**; six overlays → nine route keys; silent login failures = 0; unreachable route keys = 0; **role-mode switchers in the UI = 0 and the intent set differs by 0 bytes across the four former role modes.** |
| **Gate rows** | G7 (the presentation half), G9, G11 (prepares), G12, G23 (partly) |

**P-19 is the reason K5 is the largest package in wave 2.** The shipping frontend is a
hand-edited single file — `сайт и приложение/app.html`, **42,453 lines / 2.70 MB**, with no
sources, no build script and no bundler. `app-aurora.html` and `build.js` do not exist. There
is no import graph to allowlist and no lint stage to run one in. Roughly two dozen contract
clauses whose evaluation point is `EP-BUILD` are **discouraged, not proven**, until K5 creates
a build. This is the single largest gap between what the contract states and what can be
enforced, and it is a tooling gap, not a design gap.

#### K6 — Channel Profiles, Degradation and Voice · wave 2 · depends on K3, K5

| | |
|---|---|
| **Delivers** | `ChannelProfile` per carrier, monotone-reductive; the `EP-FIT` degradation path and its `RenderReceipt` per carrier; the five carriers (in-app, Telegram, web push, SMS, e-mail) plus voice; the spoken readback path feeding Gate 8-R; the escape verb on every non-`RICH_INTERACTIVE` tier. |
| **Discharges** | P-05 (per-carrier receipt), P-16 (`EP-FIT` selection) |
| **Surfaces** | every surface that has a non-PWA carrier |
| **Kinds** | fits all emittable kinds; emits none of its own |
| **Writes** | `WidgetRenderReceipt` (§5.3) |
| **Authority** | **`profile_id` is ADVISORY and is never an authority input.** Gate 8-R is keyed on `record.confirmation?.requires_readback`, read from the stored record — never on the submission's `profile_id`. |
| **Canonical owners** | none |
| **Exit** | **one CI job green**: every `intents_withheld` and `body_reductions` entry names a `reachable_via`/`restored_by` that is **present in the emitted envelope**, or the fitter throws rather than emitting; the escape verb is reachable on every tier; a degraded envelope and its undegraded original are both retained under one `widget_id`. |
| **Gate rows** | G23 (carrier parity half) |

---

### Wave 3 — the client acts. First write path.

Wave 3's fence: **two phases, guaranteed by absence rather than by a check.** Additive; nothing
is deleted.

#### K7 — Booking Commit Path · wave 3 · depends on K4, K5

| | |
|---|---|
| **Delivers** | the booking draft owner behind `confirmation_of_ref.kind === 'draft'`; the `BOOKING_CONFIRMATION` body; the three allowlisted rows `crm.appointment.{create,reschedule,cancel}.v1`; `AE_PROPOSE_PAIRING`'s booking rows; the static proof that no other COMMIT-minting path exists. |
| **Discharges** | P-08 (booking draft owner), P-18 (the static proof), P-25 (booking pairing rows) |
| **Surfaces** | the booking flow's rows across `app.html` and Telegram |
| **Kinds** | `BOOKING_CONFIRMATION`, `TIME_SLOT_SELECTOR`, `SERVICE_SELECTOR`, `STAFF_SELECTOR` |
| **Writes** | `WidgetDraft`; the receipt store **through the Action Engine**, never directly |
| **Authority** | the COMMIT guard. **Three keys are allowlisted, not seven** — `attendance`, `duration`, `services` and `fields` are gap-ledgered under `GAP-APPOINTMENT-DETAIL-COMMIT`, because no propose key exists for them in any space and none may be inferred or added. |
| **Canonical owners** | the booking owner alone touches YClients; a reschedule uses the non-destructive `PUT record/{company}/{id}`. A client-path `book_record` still refuses non-working time with 422; writing at any time remains the admin path. |
| **Exit** | **one CI job green**: static paths that mint a `COMMIT` outside a confirmation = **0**; the audit rows for «said it», «typed it» and «pressed it» differ by **0 bytes**; every booking write goes through the Action Engine, with **0** direct YClients calls from the widget layer. |
| **Gate rows** | G14, G15 (booking half) |

#### K8 — Client Capability Widgets · wave 3 · depends on K5, K7

| | |
|---|---|
| **Delivers** | the client-facing read and refine widgets: my bookings, the service catalogue, the master picker, the referral card, the loyalty balance, the push-permission card. |
| **Discharges** | — |
| **Surfaces** | the bulk of the 115 `MOVE INTO CHAT WIDGET` rows |
| **Kinds** | `CHOICE`, `METRIC`, `LIMITATION`, `SOURCE_STATUS`, `FORM` |
| **Writes** | nothing of its own |
| **Authority** | **the five PII fences fire here or nowhere.** A client-presented envelope never carries `pii_ceiling: 'client_identified'` for a segment; `CLIENT_LIST` is refused outright under `presentation_mode: 'client'`. |
| **Canonical owners** | C6 reads, loyalty reads |
| **Exit** | **one CI job green**: the five PII fences fire independently **5/5** against a client presentation; no client-facing envelope carries a capability the live principal does not hold, verified by replaying every emission fixture under a downgraded principal. |
| **Gate rows** | G16 |

#### K9 — Commerce and Loyalty Redemption · wave 3 · depends on K7

| | |
|---|---|
| **Delivers** | `PAYMENT_HANDOFF` and the `shell.pay` session minting; the tip card; the redemption path. |
| **Discharges** | P-14 (session minting) |
| **Surfaces** | payment and tip rows |
| **Kinds** | `PAYMENT_HANDOFF` — **blocked on capability registration** until its commerce keys are registered; until then the correct emission is a `LIMITATION` carrying the mapped `capability_gap_ref` and **no intent** |
| **Writes** | the receipt store through the Action Engine |
| **Authority** | **the finance fence.** No money-mutating capability is on the allowlist at all — all 92 `MONEY` keys are gap-keyed. `shell.pay` carries **one opaque server-minted `session_ref`** matching `/^[A-Za-z0-9_-]{8,64}$/` and nothing else; the wire format has no member able to hold a provider URL, a checkout id or a card token. |
| **Canonical owners** | the commerce owner; `crm.visit.payment.v1` is `DENY` and not mintable |
| **Exit** | **one CI job green**: money-mutating capabilities on the allowlist = **0**; `PAYMENT_HANDOFF` bodies emitted with a non-null `commit_intent` while the owner is unregistered = **0**; forbidden keys accepted at any depth = **0**. |
| **Gate rows** | G15 (commerce half) |

---

### Wave 4 — the owner's and staff's intelligence. Additive, read-only.

The only writes in wave 4 are C9 approvals — the orchestrator's own contract.

#### K10 — Analytics and Reporting Widgets · wave 4 · depends on K4, K5

| | |
|---|---|
| **Delivers** | `METRIC`, `CHART`, `REPORT` over C7/C8 projections; **the CHART read facade** returning `rows_digest` and `series_digest` alongside the rows, computed on the read path outside the projector; owner-report artefacts over `shell.file`. |
| **Discharges** | P-13, P-15 (artefacts) |
| **Surfaces** | the analytics and report rows |
| **Kinds** | `METRIC`, `CHART` (emittable **only** once P-13 ships), `REPORT`, `ARTIFACT` (narrowly — `owner_report.download`, `owner_report.status`) |
| **Writes** | nothing canonical |
| **Authority** | `ARTIFACT` is minted for **one** principal: the delivery route re-compares the live principal's proof hash at `EP-FETCH`. `contains_pii` is stated before the file is fetched. |
| **Canonical owners** | `MeasurementReadService` (C7, `c7.measurement.read`) and `C8ReadService` (`c8.result.read`). **The facade is a new field on a widget-layer read facade, not a change to any C9 contract** — `C9_REGISTRY_HASH` unchanged. |
| **Exit** | **one CI job green**: cells that are not C7/C8 projections = **0**; numerals originating from an LLM = **0**; every `Measure` traces to a `FactUsed`; `rows_digest`/`series_digest` recomputed on the read path match the projector's rows for every fixture. |
| **Gate rows** | G6, G18 |

#### K11 — C9 Orchestration Widgets · wave 4 · depends on K3, K4

| | |
|---|---|
| **Delivers** | the three C9 widgets — `STRATEGY_OPTIONS`, `APPROVAL`, `PROGRESS` — and the `control.run.cancel` path. |
| **Discharges** | — |
| **Surfaces** | the orchestration rows |
| **Kinds** | `STRATEGY_OPTIONS`, `APPROVAL`, `PROGRESS` |
| **Writes** | C9 approvals through the orchestrator's own contract |
| **Authority** | **`risk_tier`, `reversible` and `audience_size` are copied, never recomputed** — a widget that recomputes a risk tier is a widget that can lower one. `NO_ACTION` must be **equally selectable**, and it is the unique `resourceClass: 'LOCAL'` row (`c9.no_action`), verified by enumeration. |
| **Canonical owners** | C9. **No C9 contract changes; `C9_REGISTRY_HASH` unchanged.** `PROGRESS`'s owner class resolves at `EP-REGISTRY-LOAD` to the existence of the run plus `owner_report.status` — `orchestration.run.read` is not a registry key and is not used. |
| **Exit** | **one CI job green**: 3/3 widgets present; recomputed `risk_tier`/`reversible`/`audience_size` = **0**; `STRATEGY_OPTIONS` bodies without a selectable `NO_ACTION` = **0**; envelopes that initiate a strategy = **0**. |
| **Gate rows** | G19 |

---

### Wave 5 — the destinations. Consent, identity, notifications.

Wave 5 exists after K4 because **the four verified destinations must exist before anything hands
control to them.**

#### K12 — Data-Subject Authority · wave 5 · depends on K3, K4, K6

| | |
|---|---|
| **Delivers** | the consent-register read projection; the four `NEVER_CHAT_ACTUATED` consent acts as class-`s` handoffs; `CONSENT_STATE` and `IDENTITY_BINDING` bodies; the erasure job and the tombstone log; the history-blind replay proof. |
| **Discharges** | P-09, P-22, P-04 (proves the store split by erasure replay) |
| **Surfaces** | the 30 `SETTINGS / SECURITY ONLY` rows and the consent surfaces |
| **Kinds** | `CONSENT_STATE`, `IDENTITY_BINDING` — both **blocked on capability registration**; until a read owner exists the correct emission is a `LIMITATION` with the mapped `capability_gap_ref` |
| **Writes** | `WidgetErasureTombstone`; consent records **only** through the existing canonical owner |
| **Authority** | **FR-6a is the whole of this package.** `CONSENT(cap)` holds for `targetKind ∈ {client_consent, client_consent_security}`, F31's start-up veto bars any allowlist row for such a key, and F72's lookup then refuses at mint. **The widget layer cannot confer consent, and the only affordance is a class-`s` `HANDOFF` to `shell.privacy`, which confers nothing.** |
| **Canonical owners** | `Package5Wave3CanonicalCutoverService.recordClientConsent(tenantId, userId, clientId, kind: 'privacy'\|'marketing', granted, occurredAt, idempotencyKey)`. **No parallel consent owner is created.** Both revocations are `granted: false` on that same call — already the approved meaning, so **no new business or security decision is required**. |
| **Exit** | **one CI job green**: consent records written on channel identity alone = **0**; incomplete register exports = **0**; **after an erasure replay, every canonical booking/consent/loyalty read is byte-identical to before**; business objects referencing a message id = **0**. |
| **Gate rows** | G17, G20, G21, G4 (closure half) |

**What K12 can and cannot close.** Both consent revocations are **executable end-to-end today** —
the gap is a *surface* gap, not a capability gap. What K12 cannot close is the **Roskomnadzor
register export** (`consent.register.export`, zero occurrences) and the two unbinds
(`identity.staff.telegram.unbind`, no unbind of any kind exists;
`identity.client.channel.unbind`, whose owner `ClientChannelLinkService.revoke()` has zero
callers and whose only transactional caller is `legacy_bridge`-only). Those are canonical-owner
work outside the widget layer, and they stay on the gap ledger with an owner named.

#### K13 — Proactive and Notification Integrity · wave 5 · depends on K4, K6

| | |
|---|---|
| **Delivers** | the twelve canonical moments, `MOMENT_REGISTRY`, `NOTIFICATION_CONSENT_REGISTRY`, `MOMENT_TEMPLATES`; `ProactiveProvenance`; the scheduler; `control.delivery.resolve` and cross-channel dedupe; web push, SMS, e-mail and the staff Telegram mirror. |
| **Discharges** | P-17, P-32 |
| **Surfaces** | **52 of the 135** — the largest single block, and the reason K13 exists at all: the thirty-package plan named it in its gate and gave it to no package |
| **Kinds** | every proactive-capable kind, at `freshness_class: 'proactive_once'` |
| **Writes** | `WidgetSuppressedEmission`; `WidgetRenderReceipt` per carrier |
| **Authority** | **no C10 autonomy.** Exactly **one** legal `authority_basis`; envelopes that initiate a strategy = 0. A moment absent from `MOMENT_REGISTRY` cannot be emitted. Every emission re-reads the delivery consent and the quiet-hours window at delivery time, not at compose time. |
| **Canonical owners** | the notification-consent owner |
| **Exit** | **one CI job green**: 12/12 moments carry a `dedupe_key`; **duplicate deliveries across push, chat and the Telegram mirror over a 14-day window = 0**; every suppressed emission has a `SuppressedEmission` row and produced no envelope, no empty card and no placeholder. |
| **Gate rows** | G22 |

**`GAP-ATTENDANCE-CONFIRM` stays open through K13 and is not closed by it.** Until a canonical
owner records *that a client acknowledged an upcoming appointment*, an `appointment_reminder`
carries a `Limitation` naming the gap and intents of effect `NONE`, `NAVIGATE` or `HANDOFF` only.
**A «Приду» control that writes nothing is not emitted, and «клиент подтвердил» is not a claim
any surface may make.** Registering that owner is canonical-owner work outside these sixteen.

---

### Wave 6 — cutover. The only wave allowed to delete anything.

#### K14 — Telegram Cutover · wave 6 · depends on K6, K12, K13

| | |
|---|---|
| **Delivers** | the Telegram channel profile at its true tier; the ~45 commands mapped to the same gateway; the escape verb as `/cancel`; Gate 10 exercised across the command surface. |
| **Discharges** | P-20 (exercises the gate) |
| **Surfaces** | the Telegram rows |
| **Kinds** | every kind, fitted to `TEXT_ONLY`/`ANNOUNCEMENT` |
| **Writes** | receipts through the gateway |
| **Authority** | one gateway, one floor derivation, one gate order. A Telegram tap and a typed sentence resolve to the **same** capability or Gate 10 records a divergence. |
| **Canonical owners** | unchanged |
| **Exit** | **one CI job green**: Telegram commands executing into an unreachable body = **0**; every command's resolved capability recorded against `IntentRecord.capability`, with the divergence count **published**. |
| **Gate rows** | G24 (Telegram half) |

**The owner/staff command reachability defect is not a justification for this architecture, and
K14 does not treat it as one.** It is a defect in the running bot, named in §14-bis, to be fixed
in the bot on its own schedule. K14's job is that the *replacement* surface is reachable and
proven — not that the old one was broken. Dead commands are **not** restored automatically merely
because they exist in the code; each is re-dispositioned on the ledger, with a named successor or
a named retirement.

#### K15 — Legacy Authority Retirement and Bundle Disposition · wave 6 · depends on K1, K4, K5

| | |
|---|---|
| **Delivers** | retirement of the third authority path (`localStorage.me_is_staff` routing before any server call); the bundle disposition — one shell bundle, one shell source; the proof that `maya-os-site/index.html` is unreachable. |
| **Discharges** | P-19 (proves the disposition) |
| **Surfaces** | the 121 `SECURITY/AUTHORITY ONLY` rows, retired as client-side authority |
| **Kinds** | none |
| **Writes** | nothing |
| **Authority** | **the one that matters.** A client-readable value that routes before a server call is an authority path, and this is the package that removes it. |
| **Canonical owners** | unchanged |
| **Exit** | **one CI job green**: bundles carrying the shell = **1**; copies of the shell source = **1**; a recorded probe proving `maya-os-site/index.html` is unreachable; client-side values that route before a server call = **0**. |
| **Gate rows** | G10, G24 (bundle half) |

#### K16 — Retirement Under Parity · wave 6 · depends on every parity producer

| | |
|---|---|
| **Delivers** | row-by-row retirement of the legacy surfaces, against green parity evidence, after the dark window; the primary-navigation reduction to the owner's accepted target. |
| **Discharges** | — |
| **Surfaces** | the 63 `RETIRE FROM PRIMARY NAVIGATION` rows, the 3 `RETIRE AFTER PARITY` rows, and the 14 `LEGACY / UNREACHABLE` rows |
| **Kinds** | none |
| **Writes** | nothing |
| **Authority** | none — K16 **consumes** evidence and produces none. That is what breaks the old plan's `P27 → P30 → everything` cycle. |
| **Canonical owners** | unchanged |
| **Exit** | **one CI job green**: deletions without a named successor, a passing test and a rollback = **0**; deletions before the dark window closed = **0**; primary-navigation members ≤ the owner's accepted number, with the ratchet direction **non-increasing**. |
| **Gate rows** | G11, G24 |

**The primary-navigation arithmetic, corrected and carried.** 112 members across all channels;
**101 Maya-owned** — smm-bot's 11 belong to a separate production system at `/opt/smm_bot` and are
not this programme's to retire. 63 `RETIRE FROM PRIMARY NAVIGATION` rows leave **92**, not 49.
**19 distinct names / 20 ledger rows** are provably retirable today. Reaching the recommended
target of 5 therefore requires re-dispositioning **34 further rows** — a decision K1 records and
K16 executes, not a number either package may assume.

---

## 5. D12 — the widget-layer stores, frozen

**D12-B is the authority for this section.** `CANONICAL BUSINESS SCHEMA OWNERS: UNCHANGED`, and
additive widget-layer persistence is authorized for intent idempotency, receipt persistence,
timeline/audit and frozen widget snapshots. **No business table may acquire a dependency or a
foreign key on widget-layer storage.**

That constraint has a direction, and the direction is the whole of it:

```
widget-layer table ──FK──► Tenant            ALLOWED   (widget → business)
business table     ──FK──► widget-layer      FORBIDDEN (business → widget)
```

A widget row may name a tenant, because a widget row that cannot be tenant-fenced cannot be
fenced at all. A business row may not name a widget, because then deleting conversation history
would leave a business record incomplete — which §4.4.1 RT3 forbids and the history-blind replay
test exists to catch.

### 5.0 The frozen numbers

Every figure below is **derived from the schema text by script**
(`evidence/maya-chat-first-ux/widget-schema-count.mjs`), never transcribed. Re-run it rather than
trusting this table.

| | |
|---|---:|
| **NEW WIDGET MODELS** | **13** |
| **WIDGET-LAYER PHYSICAL FIELDS** | **181** (13 surrogate keys, 168 substantive) |
| **ENUMS** (closed value sets, each a `CHECK`) | **17** |
| **FK** | **16** — 10 → `Tenant`, 6 widget → widget |
| **CHECK** | **34** — 27 enum-valued, 7 range/ordering |
| **UNIQUE** | **21** |
| **INDEXES** | **23** |
| **MIGRATIONS EXPECTED** | **2** |
| **BUSINESS SCHEMA OWNERS CHANGED** | **0** |
| erasure classes, every column exactly one | `AUDIT_RETAINED` 140 · `CONVERSATION_CONTENT` 18 · `CANONICAL_ELSEWHERE` 1 · registry (no data subject) 22 = **181** |

Per wave: **wave 1** — 3 models, 22 columns, 3 unique, 3 index, 5 check, 0 FK.
**wave 2** — 10 models, 159 columns, 18 unique, 20 index, 29 check, 16 FK.

### 5.1 The three stores, and which packages write them

| store | holds | ceiling | erasable on a conversation-erasure request | created by |
|---|---|---|---:|---|
| **Timeline** | `WidgetTimelineTurn`, `WidgetEmission` | `T_TIMELINE` = 180 d | **yes, fully** | K3 |
| **Intent-audit** | `WidgetIntentRecord`, `WidgetIntentSubmissionAudit`, `WidgetIntentReceipt`, `WidgetRenderReceipt`, `WidgetSuppressedEmission`, `WidgetFreeInputLedger`, `WidgetDraft` | `T_AUDIT` = 1095 d | audit fields **no**; content fields **yes** | K3 |
| **Receipt** | Action Engine receipts (already exist, not re-declared) + `WidgetErasureTombstone` | append-only; floor `T_AUDIT` | **no** | K3 creates the tombstone log · K7/K9/K11/K12 write receipts **through the Action Engine** |
| *(registries)* | `WidgetCapabilityGap`, `WidgetMechanismGap`, `WidgetCapabilityPolicy` | n/a — no data subject | n/a | K1, K2 |

**RT1 is a schema property, not a convention.** No column of the receipt store references a
`widget_id`, a turn id or a conversation id, and write grants are limited to the Action Engine
and the approval owner. The CI schema test asserts both.

### 5.2 The five D12 stores, and the one the contract never shaped

Of the thirteen models, **five are the stores D12 named**, and one of those five had no shape
anywhere in the contract:

| D12 store | model | columns | note |
|---|---|---:|---|
| intent idempotency | `WidgetIntentRecord` | 38 | §3.7's `IntentRecord`, persisted |
| render/emission receipt | `WidgetRenderReceipt` | 17 | `maya.render.receipt/1`, §4.5.5 |
| **receipt persistence** | **`WidgetIntentReceipt`** | **11** | **the contract names `IntentReceipt` twice — §4.2 FR2 derives `TerminalOutcome` from it, §4.4.3 classifies its `utterance_echo` — and declares it nowhere. This is that shape.** |
| suppressed emission | `WidgetSuppressedEmission` | 8 | §4.9 PR5b's evidence that silence was chosen |
| free-input ledger | `WidgetFreeInputLedger` | 12 | P-06, written in the mint transaction |

**`WidgetIntentReceipt` lives in the intent-audit store, not the receipt store**, and the
distinction is not bookkeeping. `utteranceEcho` is a sentence composed on a person's behalf, so
it is `CONVERSATION_CONTENT` and must be erasable — and the receipt store is declared
non-erasable. The **business** receipt it points at through `actionReceiptRef` stays in the
receipt store and is not erased. That split is what lets `TerminalOutcome` survive an erasure as
*"this principal submitted intent X against capability Y at time T, and a canonical action
completed"* without holding what was said.

### 5.3 Conventions, taken from the tables already in this schema

Every model follows `C9WorkReceipt` (`prisma/schema.prisma:4012`) — the newest canonical table
and the one the deploy path already exercises: `@db.Uuid` ids from `gen_random_uuid()`,
`@db.Char(64)` hashes, `@db.Timestamptz(3)` timestamps, `Json @db.JsonB`, composite
`@@unique([id, tenantId])` so children can compose tenant-scoped foreign keys, and named
`Model_N_fkey` / `Model_N_idx` maps.

**Every column carries exactly one `ErasureClass`** (§4.4.3 RT5), annotated in the model and
generated into a classification map. The map is the rule; the annotation is for the reader
(§1.0). The build test enumerates columns from the schema, so a column added without a class
breaks the build rather than defaulting.

### 5.4 The models

```prisma
// ─────────────────────────────────────────────────────────────────────────────
// MAYA WIDGET LAYER — D12 additive stores.
// CANONICAL BUSINESS SCHEMA OWNERS: UNCHANGED. Every statement below is CREATE
// TABLE. No business table gains a column, and no business table references any
// table here. The only direction that crosses the boundary is widget → Tenant,
// which is required so a widget row can be tenant-fenced at all.
// Conventions follow C9WorkReceipt (prisma/schema.prisma:4012), the newest
// canonical table and the one the deploy path already exercises.
// Every column carries exactly one ErasureClass: A = AUDIT_RETAINED,
// C = CONVERSATION_CONTENT, X = CANONICAL_ELSEWHERE, — = registry/no subject.
// ─────────────────────────────────────────────────────────────────────────────

// ── 1. TIMELINE STORE — T_TIMELINE = 180 d, fully erasable ───────────────────

model WidgetTimelineTurn {
  id                  String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid   // A  surrogate key
  tenantId            String                                    // A
  conversationId      String    @db.Uuid                        // A
  turnIndex           Int                                       // A
  role                String                                    // A  CHECK: TurnRole (3)
  principalProofHash  String    @db.Char(64)                    // A
  channel             String                                    // A  CHECK: ChannelId (5)
  createdAt           DateTime  @db.Timestamptz(3)              // A
  retentionUntil      DateTime  @db.Timestamptz(3)              // A
  textContent         String?                                   // C
  spokenTranscript    String?                                   // C
  erasedAt            DateTime? @db.Timestamptz(3)              // A

  tenant Tenant @relation("WidgetTimelineTurn_1_fkey", fields: [tenantId], references: [id], onDelete: Restrict, onUpdate: Restrict, map: "WidgetTimelineTurn_1_fkey")

  @@unique([id, tenantId], map: "WidgetTimelineTurn_1_key")
  @@unique([tenantId, conversationId, turnIndex], map: "WidgetTimelineTurn_2_key")
  @@index([tenantId, conversationId, createdAt], map: "WidgetTimelineTurn_1_idx")
  @@index([tenantId, retentionUntil], map: "WidgetTimelineTurn_2_idx")
}

model WidgetEmission {
  id                    String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid   // A  surrogate key
  tenantId              String                                  // A
  widgetId              String    @db.Uuid                      // A
  turnId                String    @db.Uuid                      // A
  kind                  String                                  // A  CHECK: WidgetKind (22)
  bodyVersion           Int                                     // A
  envelopeSeal          String    @db.Char(64)                  // A
  bodyHash              String    @db.Char(64)                  // A
  lifecycleState        String                                  // A  CHECK: LifecycleState (8)
  freshnessClass        String                                  // A  CHECK: FreshnessClass (4)
  issuedAt              DateTime  @db.Timestamptz(3)            // A
  expiresAt             DateTime  @db.Timestamptz(3)            // A
  retentionSec          Int                                     // A
  retentionUntil        DateTime  @db.Timestamptz(3)            // A
  dedupeKey             String                                  // A
  deliveryChannel       String                                  // A  CHECK: ChannelId (5)
  supersedesWidgetId    String?   @db.Uuid                      // A
  supersededByWidgetId  String?   @db.Uuid                      // A
  deliveryStateJson     Json      @db.JsonB                     // A  DeliveryRecord — presentation only
  terminalLinesJson     Json?     @db.JsonB                     // A  outcome + receipt ref only
  bodyJson              Json?     @db.JsonB                     // C  dropped at retentionSec
  textEquivalentJson    Json?     @db.JsonB                     // C
  a11yJson              Json?     @db.JsonB                     // C  accessible_names
  speechJson            Json?     @db.JsonB                     // C
  bodyDroppedAt         DateTime? @db.Timestamptz(3)            // A
  erasedAt              DateTime? @db.Timestamptz(3)            // A

  tenant Tenant             @relation("WidgetEmission_1_fkey", fields: [tenantId], references: [id], onDelete: Restrict, onUpdate: Restrict, map: "WidgetEmission_1_fkey")
  turn   WidgetTimelineTurn @relation("WidgetEmission_2_fkey", fields: [turnId, tenantId], references: [id, tenantId], onDelete: Restrict, onUpdate: Restrict, map: "WidgetEmission_2_fkey")

  @@unique([id, tenantId], map: "WidgetEmission_1_key")
  @@unique([widgetId, tenantId], map: "WidgetEmission_2_key")     // FK target: order matches the references
  @@index([tenantId, turnId], map: "WidgetEmission_1_idx")
  @@index([tenantId, dedupeKey, lifecycleState], map: "WidgetEmission_2_idx")
  @@index([tenantId, retentionUntil, bodyDroppedAt], map: "WidgetEmission_3_idx")
}

// ── 2. INTENT-AUDIT STORE — T_AUDIT = 1095 d; audit fields survive erasure ───

model WidgetIntentRecord {
  id                        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid   // A  surrogate key
  tenantId                  String                              // A
  intentTokenHash           String    @db.Char(64)              // A  the token itself is NEVER stored
  widgetId                  String    @db.Uuid                  // A
  principalProofHash        String    @db.Char(64)              // A  Gate 3
  widgetKind                String                              // A  CHECK: WidgetKind (22) — KIND_FLOOR, Gate 7
  effect                    String                              // A  CHECK: EffectClass (8) — EFFECT_FLOOR
  priority                  Int                                 // A  FLOOR_EXEMPT reads it
  capabilitySpace           String?                             // A  CHECK: CapabilitySpace (4)
  capabilityKey             String?                             // A
  handoffSpace              String?                             // A  CHECK: CapabilitySpace (4)
  handoffKey                String?                             // A
  targetJson                Json?     @db.JsonB                 // A  IntentTarget; targetFloor reads .class
  verificationFloor         String                              // A  CHECK: VerificationLevel (5) — Gate 5 compares
  confirmationJson          Json?     @db.JsonB                 // A  risk tier, reversible, audience, readback
  inputSchemaHash           String?   @db.Char(64)              // A
  requestedScopeHash        String    @db.Char(64)              // A
  bodyHash                  String    @db.Char(64)              // A  Gate 8-R; SUPERSEDED comparison
  selectionDomain           String                              // A  option ids only — labels are separate
  c9Domain                  String?                             // A  CHECK: C9Domain (4)
  runId                     String?   @db.Uuid                  // A
  revisionId                String?   @db.Uuid                  // A
  approvalOfIntentRef       String?                             // A
  confirmationOfKind        String?                             // A  CHECK: ConfirmationOfKind (3)
  confirmationOfRef         String?                             // A
  producedByIntentTokenHash String?   @db.Char(64)              // A  F74's bypass guard
  issuedAt                  DateTime  @db.Timestamptz(3)        // A
  expiresAt                 DateTime  @db.Timestamptz(3)        // A
  singleUse                 Boolean                             // A
  consumedAt                DateTime? @db.Timestamptz(3)        // A  Gate 1 — idempotency of a tap
  actionReceiptRef          String?                             // A  the ONLY pointer to a business fact
  frozenNounsJson           Json?     @db.JsonB                 // A  AUDIT_RETAINED per F14 / §4.4.3
  utteranceTemplate         String?                             // C
  renderedUtterance         String?                             // C
  selectedLabels            String[]                            // C
  selectionDomainLabelsJson Json?     @db.JsonB                 // C
  spokenTranscript          String?                             // C
  erasedAt                  DateTime? @db.Timestamptz(3)        // A

  tenant   Tenant         @relation("WidgetIntentRecord_1_fkey", fields: [tenantId], references: [id], onDelete: Restrict, onUpdate: Restrict, map: "WidgetIntentRecord_1_fkey")
  emission WidgetEmission @relation("WidgetIntentRecord_2_fkey", fields: [widgetId, tenantId], references: [widgetId, tenantId], onDelete: Restrict, onUpdate: Restrict, map: "WidgetIntentRecord_2_fkey")

  @@unique([id, tenantId], map: "WidgetIntentRecord_1_key")
  @@unique([intentTokenHash, tenantId], map: "WidgetIntentRecord_2_key")  // FK target: order matches the references
  @@index([tenantId, widgetId], map: "WidgetIntentRecord_1_idx")
  @@index([tenantId, expiresAt, consumedAt], map: "WidgetIntentRecord_2_idx")
  @@index([tenantId, principalProofHash, issuedAt], map: "WidgetIntentRecord_3_idx")
  @@index([tenantId, capabilityKey, effect], map: "WidgetIntentRecord_4_idx")
}

model WidgetIntentSubmissionAudit {
  id                 String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid   // A  surrogate key
  tenantId           String                                     // A
  widgetId           String    @db.Uuid                         // A
  intentTokenHash    String    @db.Char(64)                     // A
  clientNonce        String                                     // A
  profileId          String                                     // A  ADVISORY — never an authority input
  clientEmittedAt    DateTime? @db.Timestamptz(3)               // A  advisory; never business time
  receivedAt         DateTime  @db.Timestamptz(3)               // A
  readbackRef        String?                                    // A
  readbackBodyHash   String?   @db.Char(64)                     // A
  inputsClosedJson   Json?     @db.JsonB                        // A  enum/ref values — closed-domain ids
  inputsFreeTextJson Json?     @db.JsonB                        // C  string values
  inputsPiiJson      Json?     @db.JsonB                        // X  phone / sensitivity:'pii'
  readbackAffirmation String?                                   // C  a word the data subject said
  spokenTranscript   String?                                    // C
  erasedAt           DateTime? @db.Timestamptz(3)               // A

  tenant Tenant             @relation("WidgetIntentSubmissionAudit_1_fkey", fields: [tenantId], references: [id], onDelete: Restrict, onUpdate: Restrict, map: "WidgetIntentSubmissionAudit_1_fkey")
  record WidgetIntentRecord @relation("WidgetIntentSubmissionAudit_2_fkey", fields: [intentTokenHash, tenantId], references: [intentTokenHash, tenantId], onDelete: Restrict, onUpdate: Restrict, map: "WidgetIntentSubmissionAudit_2_fkey")

  @@unique([id, tenantId], map: "WidgetIntentSubmissionAudit_1_key")
  @@index([tenantId, intentTokenHash], map: "WidgetIntentSubmissionAudit_1_idx")
  @@index([tenantId, receivedAt], map: "WidgetIntentSubmissionAudit_2_idx")
}

model WidgetIntentReceipt {
  id               String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid   // A  surrogate key
  tenantId         String                                       // A
  widgetId         String    @db.Uuid                           // A
  intentTokenHash  String    @db.Char(64)                       // A
  submittedAt      DateTime  @db.Timestamptz(3)                 // A
  outcome          String                                       // A  CHECK: IntentReceiptOutcome (4)
  refusalCode      String?                                      // A  closed vocabulary; never free text
  actionReceiptRef String?                                      // A  FR2: CONFIRMED ⟺ non-null
  answeringChannel String                                       // A  CHECK: ChannelId (5)
  utteranceEcho    String?                                      // C  composed on a person's behalf
  erasedAt         DateTime? @db.Timestamptz(3)                 // A

  tenant Tenant             @relation("WidgetIntentReceipt_1_fkey", fields: [tenantId], references: [id], onDelete: Restrict, onUpdate: Restrict, map: "WidgetIntentReceipt_1_fkey")
  record WidgetIntentRecord @relation("WidgetIntentReceipt_2_fkey", fields: [intentTokenHash, tenantId], references: [intentTokenHash, tenantId], onDelete: Restrict, onUpdate: Restrict, map: "WidgetIntentReceipt_2_fkey")

  @@unique([id, tenantId], map: "WidgetIntentReceipt_1_key")
  @@unique([tenantId, intentTokenHash], map: "WidgetIntentReceipt_2_key")
  @@index([tenantId, widgetId], map: "WidgetIntentReceipt_1_idx")
  @@index([tenantId, outcome, submittedAt], map: "WidgetIntentReceipt_2_idx")
}

model WidgetRenderReceipt {
  id                       String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid   // A  surrogate key
  tenantId                 String                               // A
  widgetId                 String    @db.Uuid                   // A
  profileId                String                               // A
  profileVersion           Int                                  // A
  renderTier               String                               // A  CHECK: RenderTier (3) — the one body_hash term
  intentsMinted            Int                                  // A  before fitting
  intentsEmitted           Int                                  // A  after fitting
  intentsWithheldJson      Json      @db.JsonB                  // A  {role, reason, reachable_via}
  bodyReductionsJson       Json      @db.JsonB                  // A  {path, reduction, restored_by}
  textEquivalentIsCanonical Boolean                             // A
  escalationJson           Json?     @db.JsonB                  // A
  degradedAt               DateTime  @db.Timestamptz(3)         // A
  deliveryChannel          String                               // A  CHECK: ChannelId (5)
  composedEnvelopeJson     Json      @db.JsonB                  // C  the undegraded envelope (C6)
  emittedEnvelopeJson      Json      @db.JsonB                  // C  what was actually sent (C6)
  erasedAt                 DateTime? @db.Timestamptz(3)         // A

  tenant   Tenant         @relation("WidgetRenderReceipt_1_fkey", fields: [tenantId], references: [id], onDelete: Restrict, onUpdate: Restrict, map: "WidgetRenderReceipt_1_fkey")
  emission WidgetEmission @relation("WidgetRenderReceipt_2_fkey", fields: [widgetId, tenantId], references: [widgetId, tenantId], onDelete: Restrict, onUpdate: Restrict, map: "WidgetRenderReceipt_2_fkey")

  @@unique([id, tenantId], map: "WidgetRenderReceipt_1_key")
  @@unique([tenantId, widgetId, deliveryChannel], map: "WidgetRenderReceipt_2_key")
  @@index([tenantId, degradedAt], map: "WidgetRenderReceipt_1_idx")
  @@index([tenantId, renderTier], map: "WidgetRenderReceipt_2_idx")
}

model WidgetSuppressedEmission {
  id                       String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid   // A  surrogate key
  tenantId                 String                               // A
  moment                   String                               // A  a MOMENT_REGISTRY key
  momentTemplateKey        String                               // A  `${id}@${version}`
  dedupeKey                String                               // A
  suppressedAt             DateTime @db.Timestamptz(3)          // A
  unresolvedCells          String[]                             // A  JSON Pointers — never the values
  subjectPrincipalProofHash String? @db.Char(64)                // A

  tenant Tenant @relation("WidgetSuppressedEmission_1_fkey", fields: [tenantId], references: [id], onDelete: Restrict, onUpdate: Restrict, map: "WidgetSuppressedEmission_1_fkey")

  @@unique([id, tenantId], map: "WidgetSuppressedEmission_1_key")
  @@unique([tenantId, dedupeKey, moment], map: "WidgetSuppressedEmission_2_key")
  @@index([tenantId, moment, suppressedAt], map: "WidgetSuppressedEmission_1_idx")
}

model WidgetFreeInputLedger {
  id               String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid   // A  surrogate key
  tenantId         String                                       // A
  widgetId         String   @db.Uuid                            // A
  intentTokenHash  String   @db.Char(64)                        // A
  capabilitySpace  String                                       // A  CHECK: CapabilitySpace (4)
  capabilityKey    String                                       // A
  widgetKind       String                                       // A  CHECK: WidgetKind
  fieldKinds       String[]                                     // A  the non-closed kinds that triggered it
  justification    String                                       // A  server-authored, closed set
  boundsSourceRefs String[]                                     // A  INV-23
  normalizerRefs   String[]                                     // A  INV-23
  mintedAt         DateTime @db.Timestamptz(3)                  // A

  tenant Tenant             @relation("WidgetFreeInputLedger_1_fkey", fields: [tenantId], references: [id], onDelete: Restrict, onUpdate: Restrict, map: "WidgetFreeInputLedger_1_fkey")
  record WidgetIntentRecord @relation("WidgetFreeInputLedger_2_fkey", fields: [intentTokenHash, tenantId], references: [intentTokenHash, tenantId], onDelete: Restrict, onUpdate: Restrict, map: "WidgetFreeInputLedger_2_fkey")

  @@unique([id, tenantId], map: "WidgetFreeInputLedger_1_key")
  @@unique([tenantId, intentTokenHash], map: "WidgetFreeInputLedger_2_key")
  @@index([tenantId, capabilityKey, mintedAt], map: "WidgetFreeInputLedger_1_idx")
}

model WidgetDraft {
  id                   String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid   // A  surrogate key
  tenantId             String                                   // A
  draftRef             String                                   // A  server-minted; names this draft
  draftClass           String                                   // A  CHECK: DraftClass (5)
  ownerCapabilitySpace String                                   // A  CHECK: CapabilitySpace (4)
  ownerCapabilityKey   String                                   // A
  principalProofHash   String    @db.Char(64)                   // A
  diffJson             Json      @db.JsonB                      // C  server-computed diff
  createdAt            DateTime  @db.Timestamptz(3)             // A
  expiresAt            DateTime  @db.Timestamptz(3)             // A
  consumedAt           DateTime? @db.Timestamptz(3)             // A
  erasedAt             DateTime? @db.Timestamptz(3)             // A

  tenant Tenant @relation("WidgetDraft_1_fkey", fields: [tenantId], references: [id], onDelete: Restrict, onUpdate: Restrict, map: "WidgetDraft_1_fkey")

  @@unique([id, tenantId], map: "WidgetDraft_1_key")
  @@unique([tenantId, draftRef], map: "WidgetDraft_2_key")
  @@index([tenantId, expiresAt, consumedAt], map: "WidgetDraft_1_idx")
}

// ── 3. RECEIPT STORE — append-only, floor T_AUDIT, never erased ──────────────
// The Action Engine receipts themselves already exist and are NOT re-declared.
// What the widget layer adds to this store is the tombstone log, and only that.

model WidgetErasureTombstone {
  id                String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid   // A  surrogate key
  tenantId          String                                      // A
  erasedAt          DateTime @db.Timestamptz(3)                 // A
  erasureRequestRef String                                      // A
  store             String                                      // A  CHECK: TombstoneStore (2)
  rowKey            String                                      // A
  fieldsErased      String[]                                    // A

  tenant Tenant @relation("WidgetErasureTombstone_1_fkey", fields: [tenantId], references: [id], onDelete: Restrict, onUpdate: Restrict, map: "WidgetErasureTombstone_1_fkey")

  @@unique([id, tenantId], map: "WidgetErasureTombstone_1_key")
  @@index([tenantId, erasureRequestRef], map: "WidgetErasureTombstone_1_idx")
  @@index([tenantId, erasedAt], map: "WidgetErasureTombstone_2_idx")
}

// ── 4. LEDGERS AND REGISTRIES — wave 1; no tenant subject, no erasure class ──

model WidgetCapabilityGap {
  id            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid   // —  surrogate key
  gapKey        String                                          // —  'GAP-…'
  act           String                                          // —
  ownerState    String                                          // —  CHECK: GapOwnerState (3)
  evidence      String                                          // —
  openedAt      DateTime  @db.Timestamptz(3)                    // —
  closedAt      DateTime? @db.Timestamptz(3)                    // —
  closingCommit String?                                         // —

  @@unique([gapKey], map: "WidgetCapabilityGap_1_key")
  @@index([ownerState, openedAt], map: "WidgetCapabilityGap_1_idx")
}

model WidgetMechanismGap {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid   // —  surrogate key
  gapKey        String                                          // —  'MG-P01' … 'MG-P32'
  pRef          String                                          // —  'P-01' … 'P-32'
  component     String                                          // —
  status        String                                          // —  CHECK: MechanismGapStatus (4)
  packageKey    String                                          // —  'K1' … 'K16'
  blockingRules String[]                                        // —

  @@unique([gapKey], map: "WidgetMechanismGap_1_key")
  @@index([status, packageKey], map: "WidgetMechanismGap_1_idx")
}

model WidgetCapabilityPolicy {
  id                    String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid   // —  surrogate key
  capabilitySpace       String                                  // —  CHECK: CapabilitySpace (4)
  capabilityKey         String                                  // —
  minVerification       String                                  // —  CHECK: VerificationLevel (5)
  consentClass          String                                  // —  CHECK: ConsentClass (5)
  dispatchIsSynchronous Boolean                                 // —  R3.11.5 — read through the PROPOSE key
  contractVersion       Int                                     // —  a change here is a version bump

  @@unique([capabilitySpace, capabilityKey], map: "WidgetCapabilityPolicy_1_key")
  @@index([consentClass, minVerification], map: "WidgetCapabilityPolicy_1_idx")
}
```

### 5.5 The seventeen closed value sets

Each is a `CHECK` on a `String` column, not a Prisma `enum` — matching `C9WorkReceipt`, whose
`state`, `domain` and `kind` are `String`. A closed set stated in the database and in TypeScript
is one set with two enforcement points, not two sets.

| set | members | where it comes from |
|---|---:|---|
| `WidgetKind` | 22 | contract §2.1, closed |
| `EffectClass` | 8 | §3.2 |
| `LifecycleState` | 8 | §4.1 |
| `VerificationLevel` | 5 | §0.8 F39 — the ladder |
| `ChannelId` | 5 | §4.5 |
| `ConsentClass` | 5 | §0.14 F81 |
| `DraftClass` | 5 | §0.14 F79 — **not** `'expense'`, **not** `'loyalty_adjustment'` |
| `CapabilitySpace` | 4 | §0.6 F21 |
| `C9Domain` | 4 | the orchestrator's own published union, imported, never redeclared |
| `FreshnessClass` | 4 | §4.1 |
| `IntentReceiptOutcome` | 4 | `ACCEPTED` / `REFUSED` / `NEEDS_CONFIRMATION` / `NEEDS_VERIFICATION` |
| `MechanismGapStatus` | 4 | §0.1 F5's status vocabulary |
| `RenderTier` | 3 | §4.5 — the one receipt member inside `body_hash` |
| `ConfirmationOfKind` | 3 | §0.13 F74 |
| `TurnRole` | 3 | timeline only |
| `GapOwnerState` | 3 | `none` / `unreachable` / `registered_elsewhere` — §A1.6.1's three-way finding |
| `TombstoneStore` | 2 | `timeline` / `intent_audit` — the two erasable stores |

**There is no `error` severity and no `ERROR`, `FAILURE` or `RETRY` member anywhere above.** §2.1
closes the kind enum without them and §1.3 C4 forbids the vocabulary in a `Cell.label`; a
database that admitted them would be the one place the ban did not reach.

### 5.6 The migration envelope

```sql
-- ═════════════════════════════════════════════════════════════════════════════
-- WAVE 1 — prisma/migrations/<stamp>_widget_layer_ledgers/migration.sql   (K1+K2)
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE "WidgetCapabilityGap"    ( ... );
CREATE TABLE "WidgetMechanismGap"     ( ... );
CREATE TABLE "WidgetCapabilityPolicy" ( ... );

CREATE UNIQUE INDEX "WidgetCapabilityGap_1_key"    ON "WidgetCapabilityGap"("gapKey");
CREATE UNIQUE INDEX "WidgetMechanismGap_1_key"     ON "WidgetMechanismGap"("gapKey");
CREATE UNIQUE INDEX "WidgetCapabilityPolicy_1_key" ON "WidgetCapabilityPolicy"("capabilitySpace","capabilityKey");
CREATE INDEX "WidgetCapabilityGap_1_idx"    ON "WidgetCapabilityGap"("ownerState","openedAt");
CREATE INDEX "WidgetMechanismGap_1_idx"     ON "WidgetMechanismGap"("status","packageKey");
CREATE INDEX "WidgetCapabilityPolicy_1_idx" ON "WidgetCapabilityPolicy"("consentClass","minVerification");

ALTER TABLE "WidgetMechanismGap"     ADD CONSTRAINT "WidgetMechanismGap_status_check"      CHECK ("status" IN ('[ABSENT]','[EXISTS]','[PARTIAL]','[UNENFORCEABLE-TODAY]'));
ALTER TABLE "WidgetCapabilityGap"    ADD CONSTRAINT "WidgetCapabilityGap_owner_check"      CHECK ("ownerState" IN ('none','unreachable','registered_elsewhere'));
ALTER TABLE "WidgetCapabilityPolicy" ADD CONSTRAINT "WidgetCapabilityPolicy_space_check"   CHECK ("capabilitySpace" IN ('C9','TOOL','AE','CONTROL'));
ALTER TABLE "WidgetCapabilityPolicy" ADD CONSTRAINT "WidgetCapabilityPolicy_minver_check"  CHECK ("minVerification" IN ('ANONYMOUS','CHANNEL_IDENTITY','BOUND_CLIENT','SESSION_VERIFIED','STEP_UP_VERIFIED'));
ALTER TABLE "WidgetCapabilityPolicy" ADD CONSTRAINT "WidgetCapabilityPolicy_consent_check" CHECK ("consentClass" IN ('none','communication','personal_data','identity_binding','finance'));

-- ═════════════════════════════════════════════════════════════════════════════
-- WAVE 2 — prisma/migrations/<stamp>_widget_layer_runtime/migration.sql      (K3)
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE "WidgetTimelineTurn"          ( ... );
CREATE TABLE "WidgetEmission"              ( ... );
CREATE TABLE "WidgetIntentRecord"          ( ... );
CREATE TABLE "WidgetIntentSubmissionAudit" ( ... );
CREATE TABLE "WidgetIntentReceipt"         ( ... );
CREATE TABLE "WidgetRenderReceipt"         ( ... );
CREATE TABLE "WidgetSuppressedEmission"    ( ... );
CREATE TABLE "WidgetFreeInputLedger"       ( ... );
CREATE TABLE "WidgetDraft"                 ( ... );
CREATE TABLE "WidgetErasureTombstone"      ( ... );

-- 18 unique indexes, 20 secondary indexes, 29 CHECK constraints, 16 FK constraints
-- (10 → "Tenant", 6 widget → widget), each as its own ALTER TABLE on a WIDGET table.

-- ═════════════════════════════════════════════════════════════════════════════
-- WHAT IS ABSENT FROM BOTH FILES, and is the point of them
-- ═════════════════════════════════════════════════════════════════════════════
--   0 × ALTER TABLE on any business table
--   0 × ADD COLUMN on any business table
--   0 × FOREIGN KEY whose referencing table is a business table
--   0 × DROP / RENAME of anything
--   0 × CHECK added to or removed from a business table
--
-- Chapter 9's own migration is the contrast that makes this checkable: it carries
-- `ALTER TABLE "TenantBusinessConfigurationRevision" DROP CONSTRAINT
-- "R11_config_contract_check"` and re-adds it. That is a business-table change,
-- it was correct for Chapter 9, and there is no statement of that shape here.
```

**`BUSINESS SCHEMA OWNERS CHANGED: 0`, stated precisely enough to be checked.** The `Tenant`
*model* in `schema.prisma` gains **10 virtual back-relation fields** (`widgetIntentRecords
WidgetIntentRecord[]`, and so on). Prisma requires both sides of a relation to be declared, and a
one-to-many back-relation **generates no SQL**: the foreign key lives on the child. Chapter 9 is
the precedent and the proof — `Tenant` carries `c9Runs`, `c9StrategyRevisions`, `c9PlanSteps`,
`c9StepBindings` and `c9WorkReceipts`, and its migration contains **zero** `ALTER TABLE "Tenant"`
statements. The widget layer does exactly the same thing.

The gate that enforces it is mechanical, not reviewed by eye: **G8** asserts *modified business
tables = 0, migrations other than these two = 0, FKs into business tables = 0*, computed from the
migration diff.

**Two deploy-path facts, restated because they have broken releases in this repository.**
`prisma.config.ts` must be present in the release — the schema carries no `url` and
`migrate deploy` fails with *"datasource.url is required"* without it. And a release is built
whole on the server: `node_modules` is never copied between releases in any form, because a
copied tree brings a stale generated Prisma client that does not know these columns, and the
first write then fails at runtime while health stays green.

### 5.7 Retention, frozen

| store | ceiling | source |
|---|---|---|
| Timeline | `T_TIMELINE` = **180 d** from turn creation | §4.4.1 |
| Intent-audit | `T_AUDIT` = **1095 d** from `issued_at` | §4.4.1 |
| Receipt | append-only; set by the canonical owner, floor `T_AUDIT` | §4.4.1 |

Per-kind body ceilings — **7 rows, total over all 22 kinds** (§4.4.2, the contract's sole per-kind
retention authority):

| kinds | ceiling |
|---|---|
| `CLIENT_LIST` | 24 h |
| `FORM` with any `sensitivity: 'pii'` field | 24 h |
| `CONSENT_STATE`, `IDENTITY_BINDING`, `PAYMENT_HANDOFF`, `MEDIA_PREVIEW`, `ARTIFACT` | 24 h |
| `SCHEDULE`, `SOURCE_STATUS`, `PROGRESS`, `TIME_SLOT_SELECTOR` | 7 d |
| `CHOICE`, `SERVICE_SELECTOR`, `STAFF_SELECTOR`, `LIMITATION`, `FORM` (no pii field) | 30 d |
| `BOOKING_CONFIRMATION`, `SETTINGS_DRAFT`, `APPROVAL` | 90 d |
| `METRIC`, `CHART`, `REPORT`, `STRATEGY_OPTIONS` | 365 d, capped by `T_TIMELINE` |

`retention_sec` is **written by the emission validator, never authored** — the shortest of the
per-kind ceiling, tenant policy, and 24 h whenever the resolved pii class is `client_identified`
or any body field is `sensitivity: 'pii'` (RT4). Tenant policy **may only shorten** (RT2): a
value exceeding a ceiling is refused, never clamped silently.

**Erasure writes, it does not delete.** RT6 sets every `CONVERSATION_CONTENT` and
`CANONICAL_ELSEWHERE` column to `NULL` across the timeline and intent-audit stores for the
requesting principal, stamps `erasedAt`, and appends to `WidgetErasureTombstone`. The row keeps
its shape and its 140 `AUDIT_RETAINED` columns, so the audit line survives as *"this principal
submitted intent X against capability Y at time T"* without holding what they said.

---

## 6. One Web Interaction Contract, for native and PWA both

**D11-B: there is one contract, not two.** The native build and the PWA render the same
envelopes through the same renderer, over the same two routes, against the same floor. What
differs between them is a **channel profile**, which is data, not a second implementation.

### 6.1 What native is today, stated before anything is designed on top of it

The Google Play artefact is a **TWA** — `pro.malesthetic.twa`, a trusted web activity wrapping
the same `app.html`. It is not a separate client. That fact is load-bearing in both directions:
it is why one interaction contract is achievable at all, and it is why "native capability" means
*bridge* capability, not *a different app*.

### 6.2 The shape

```ts
interface ChannelProfile {                 // §4.5, monotone-reductive: a profile may only narrow
  channel_id: ChannelId;
  render_tier: RenderTier;                 // RICH_INTERACTIVE | TEXT_ONLY | ANNOUNCEMENT
  token_carrier: TokenCarrier;
  max_intents: number;                     // ≤ the contract's 0..12
  effect_ceiling: EffectClass;
  bridge: BundleBridgeRequirements | null; // native only
}
```

**A profile may only take capability away.** It can never raise a ceiling, never add an intent,
never lower a floor. *Mechanism:* the profile validator compares every field against the
contract's own maximum and refuses a profile that exceeds it, at `EP-REGISTRY-LOAD` — so a
mis-authored profile fails the process start rather than widening a fence at runtime.

### 6.3 The three things native adds, and the one it may not

| native adds | how |
|---|---|
| **push delivery** | a `BundleBridgeRequirements` entry; the envelope is unchanged |
| **biometric re-auth** | **this is the substrate P-12 needs** — see below |
| **file save** | `shell.file` resolves to a platform save rather than a browser download |

**Native may not add an intent, an effect class, a widget kind or a route.** A bridge that could
originate an effect would be a second authority path, and FR-1 exists to forbid exactly that.
*Mechanism:* `BundleBridgeRequirements` is a closed shape with no member able to carry a
capability, an endpoint or an effect; the forbidden-key walk runs over it at
`EP-REGISTRY-LOAD` exactly as it runs over the envelope.

### 6.4 The one place native could close a hole nothing else can

**`STEP_UP_VERIFIED` is unreachable (P-12), and it is the largest capability hole in this
programme** — every `restricted` risk tier and every unmapped key is permanently withheld while
it stays that way. A TWA can host a platform biometric prompt, and a biometric re-auth is
precisely the "re-authentication event type that can raise a live session's derived level" the
ladder needs.

**This is named, not planned.** P-12 belongs to the authentication subsystem and is outside these
sixteen packages; a widget-layer package may not mint a verification level. What the mapping
records is that the *cheapest* path to closing it runs through the native bundle, so that the
owner deciding P-12's priority knows the option exists.

### 6.5 Parity, proved rather than asserted

| # | proof | where |
|---|---|---|
| **1** | the same envelope fixture renders in both, and the emitted intent sets are **byte-identical** | K5, K6 |
| **2** | the same submission from both reaches the same gate sequence and the same `IntentRecord` | K3 |
| **3** | a native bridge failure degrades to the PWA path and **never** to a wider one | K6 |
| **4** | the a11y floor holds in both: keyboard traversal 3/3, `reading_order` = DOM order, `prefers-reduced-motion` honoured | K5 |

---

## 7. Dark cutover, parity evidence, and what "green" means

**The harness is emitted red by default in K1, and no package may mark its own row green.** A
row turns green when its evidence exists — a passing test, a recorded probe, a signed dossier —
and the harness reads the evidence, not a checkbox.

### 7.1 The dark window

Every wave-2 through wave-5 package ships **behind an entitlement**, emitting to nobody, while
its parity rows accumulate. The window closes for a surface only when:

1. its successor's parity rows are green **on the same commit**, and
2. a rollback exists and has been exercised **at least once**, and
3. the legacy surface has been observed unused for the agreed window.

**Only then may K16 delete it**, and K16 deletes **row by row**, never by subsystem.

### 7.2 What is deliberately *not* proved

`[NON-NORMATIVE]` Parity here means *the successor does what the surface did, for the cases the
evidence covers*. It does not mean the fixture corpus is complete — the corpus is a deliverable
of every package, not an assumption of this plan, and a parity suite is only ever as strong as
its fixtures. Where a surface's behaviour is not in the corpus, the honest disposition is
`KEEP AS FULLSCREEN DETAIL`, not `RETIRE AFTER PARITY`.

---

## 8. Accessibility

`maya.a11y.floor/1` is not a package. It is a floor **every** package clears, and K5 builds the
machinery that makes clearing it checkable.

| obligation | mechanism | gate |
|---|---|---|
| `reading_order` covers every interactive element, and DOM order equals it | `validateEnvelope` recomputes it by §4.8 A-0's derivation and refuses on any difference | G23 |
| every element has an accessible name | `accessible_names` is total and closed over `reading_order`, keyed through `refKey` | G23 |
| no keyboard trap; the escape verb is always reachable | the escape is the one intent no degradation step may drop | G23 |
| `prefers-reduced-motion` honoured | snapshot tests per profile | G23 |
| text equivalent is canonical on `TEXT_ONLY` | `text_equivalent` is inside `body_hash`, so it cannot drift from what was shown | G23 |

**WCAG 2.2 critical findings must be 0, and keyboard traversal must pass 3/3.** Both are measured
against the renderer conformance suite, which is `[UNENFORCEABLE-TODAY]` until K5 creates a
build — the single largest gap between what the contract states and what can be enforced, and a
tooling gap rather than a design gap.

---

## 9. The final acceptance gate

**One CI job, `chat-first-completion-gate`, on one commit, all twenty-four conditions green
simultaneously.** Anything yellow or unmeasured means the cycle is not finished. There is no
partial completion and no "complete with caveats".

| condition | owned by |
|---|---|
| G1 · G2 · G3 | K1 |
| G4 | K1 (ledger) + K12 (closure) |
| G5 · G8 | K2 |
| G6 | K3 + K10 |
| G7 | K4 (server control) + K5 (presentation) |
| G9 · G12 | K5 |
| G10 | K15 |
| G11 | K5 (prepares) + K16 (achieves) |
| G13 | K3 + K4 |
| G14 | K7 |
| G15 | K7 + K9 |
| G16 | K4 + K8 |
| G17 · G20 · G21 | K12 |
| G18 | K10 |
| G19 | K11 |
| G22 | K13 |
| G23 | K5 + K6 |
| G24 | K14 + K15 + K16 |

---

## 10. What this document does not authorize

1. **It does not open wave 1.** The owner opens wave 1.
2. **It does not settle P-12.** `STEP_UP_VERIFIED` is an authentication-subsystem capability,
   outside these sixteen, and until it exists every `restricted` capability is withheld.
3. **It does not set Gate 10's promotion criterion.** That is an owner decision. Until it is set,
   "three front doors, one function" is **measured, not enforced**, and no package may promote
   the audit to a refusal on the owner's behalf.
4. **It does not register `GAP-ATTENDANCE-CONFIRM`'s owner.** That is canonical-owner work.
   Until it exists, «клиент подтвердил» is not a claim any surface may make.
5. **It does not touch production.** The `bot.py` copy defect and the five repository defects of
   §14-bis are named, and each is fixed on its own schedule, in its own worktree, through its
   own deploy path — `maya-saas-backend/deploy/vps/deploy.sh <release>` for the backend, and
   never by copying `node_modules` between releases.
