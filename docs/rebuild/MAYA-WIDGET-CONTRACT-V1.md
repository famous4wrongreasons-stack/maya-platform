# MAYA WIDGET CONTRACT v1

*Canonical. Normative. Assembled 2026-09-15 on branch `codex/maya-identity-consent-20260913`.*

**Precedence, highest first:** Section 0-C (closure errata) → Section 0-B (key-space
reconciliation) → Section 0 (canonical spine) → Annex A (prerequisites and scope rulings) →
§§1–4 (the body). Where two sections of equal precedence conflict, the later-numbered
errata table governs and says so explicitly.

**How to read a rule.** Every sentence is normative unless prefixed `[NON-NORMATIVE]` or
listed in §0C.12. Every normative rule names the **mechanism** that enforces it and the
**evaluation point** at which the mechanism runs. A rule whose mechanism is not yet built is
marked `NORMATIVE-PENDING` and bound to a prerequisite row in `MECHANISM_GAP_LEDGER`
(§0C.20): it is binding on the implementation, and until its mechanism exists its
evaluation point refuses rather than admits.

**This contract changes no C6–C9 canonical business contract.** It adds no Action Engine
capability, no C9 capability and no registry field; `C9_REGISTRY_HASH` is unchanged.

---

# Section 0 — Canonical spine and errata

## 0.0 Status, scope and precedence

**S0.1 — precedence.** Section 0 is normative and **overrides §§1–4 wherever they conflict**. Where a rule below contradicts any sentence of §1, §2, §3 or §4, the sentence in §§1–4 is void and this section's ruling stands; where Section 0 is silent, §§1–4 stand as written. *Mechanism:* the errata table of §0.16 and the rulings of §0.1–§0.15 are the input to the emission validator, the mint function, the gateway and the CI suites; no implementation reads a clause of §§1–4 that §0.16 marks **VOID**. *Evaluation point:* `EP-BUILD` — a conformance test asserts that every identifier this section voids has zero occurrences in the implementation.
# Section 0 — Canonical spine and errata

## 0.0 Status, scope and precedence

**S0.1 — precedence.** Section 0 is normative and **overrides §§1–4 wherever they conflict**. Where a rule below contradicts any sentence of §1, §2, §3 or §4, the sentence in §§1–4 is void and this section's ruling stands; where Section 0 is silent, §§1–4 stand as written. *Mechanism:* the errata table of §0.16 and the rulings of §0.1–§0.15 are the input to the emission validator, the mint function, the gateway and the CI suites; no implementation reads a clause of §§1–4 that §0.16 marks **VOID**. *Evaluation point:* `EP-BUILD` — a conformance test asserts that every identifier this section voids has zero occurrences in the implementation.

**S0.2 — normative discipline, restated.** Every sentence of this contract is NORMATIVE — naming its enforcing mechanism **and** its evaluation point — or is explicitly prefixed `[NON-NORMATIVE]`. A guarantee that cannot name a mechanism is deleted or downgraded, never softened. §0.17 downgrades, by name, every statement in §§1–4 that cannot name one; after §0.17 the count of unproven normative claims is zero **by declaration**, not by deletion of the text.

**S0.3 — what this contract requires of the running system.** No change to any C9 contract: no new key in `C9_CAPABILITIES`, no new field on `RegisteredActionCapabilityV1`, no change to `C9_REGISTRY_HASH`. No change to any canonical business schema. It does commission additive widget-layer stores (§0.18, residual 1). *Mechanism:* §0.10 deletes every capability key and registry flag §§1–4 invented; a CI test asserts `C9_REGISTRY_HASH` is unchanged by this contract's packages. *Evaluation point:* `EP-BUILD`.

**S0.4 — the three repairs that are preserved exactly.** Nothing below weakens: (a) the **consent split** — a mandatory non-null `handoff_capability_ref` on every `HANDOFF` plus a mandatory floor on every intent of every effect class, which together make `subjectCapability` total and both the `NEVER_CHAT_ACTUATED` test and the floor comparison evaluable (§3.2 table, §1.8 K9, §3.5 R3.5.1); (b) the **payment fence** — payment is a capability, `DRAFT → confirmation → COMMIT → Action Engine`, and the Action Engine alone opens the provider session and owns the idempotency key and the receipt (§2.6.20 PAY.1, §3.3 R3.3.1, E1/E9); (c) the **booking scope fix** — the booking family is derived from a registry property, never from a hardcoded capability name (§3.10.1). §0.9 corrects the key space (c) is evaluated over; it does not restore a hardcoded name.

---

## 0.1 The authoritative section map

**S0.5 — the map.** The contract has five sections and no others. In-text section annotations inside §§1–4 (`// §3 (Authority)`, `// §5 (Intents)`, `// §6 (Lifecycle)`, `// §7 (Presentation)`) are **`[NON-NORMATIVE]` and void**; only this table resolves a cross-reference.

| § | Title | Owns (sole definition) |
|---|---|---|
| **0** | Canonical spine and errata | precedence, evaluation-point vocabulary, verification floor, leaf taxonomy, effect classes, escape verb, key spaces, capability register, fundamental rules, errata, non-normative register |
| **1** | Envelope, values and provenance | `WidgetEnvelope` root, `Cell`, `Measure`, `Phrase`, `Provenance`, `FactUsed`, `Completeness`, `Authorship`, `EvidenceRef`, `Limitation`, `VerificationLevel`, `Integrity` |
| **2** | The twenty-two widget kinds | `WidgetKind`, `KindRule`, `KIND_REGISTRY`, the twenty-two bodies, `role_hint`, `OptionItem`, `TableSpec`, `FieldBound`, `KindTextShape` |
| **3** | Intents, the gateway, and the forbidden edges | `WidgetIntent`, `EffectClass`, `IntentTarget`, `ConfirmationRequirement`, `InputSchema`, `IntentRecord`, `WidgetIntentSubmission`, the fourteen gates, the forbidden edges |
| **4** | Lifecycle, channels, accessibility, history | `Lifecycle`, `DeliveryRecord`, `TerminalLine`, `HistorisedWidget`, `ErasureClass`, retention, `ChannelProfile`, `ChannelId`, `RenderTier`, `TokenCarrier`, the fitting algorithm, `RenderReceipt`, `BundleBridgeRequirements`, voice, `A11yEnvironment`, `A11yBlock`, `InteractiveRef`, `ProactiveProvenance` |

*Mechanism:* a documentation-link test resolves every `§N` reference in the contract against this table. *Evaluation point:* `EP-BUILD`.

`[NON-NORMATIVE]` §4 exists and is 1 180 lines long. A certification pass that reported §4 absent was reading a truncated 200 KB prefix of a 296 KB file; that report is superseded and the findings derived from §4's supposed absence (undeclared `Lifecycle`, `RenderReceipt`, `ChannelProfile`, `A11yBlock`, `DeliveryRecord`, `input_lock`, `max_verification_level`, ladder steps, `on_expiry`) are closed by §4 as written. Three members genuinely remain undeclared and are declared in §0.3.

---

## 0.2 One evaluation-point vocabulary

**S0.6 — the closed set. Eleven, closed. Every normative rule in this contract cites exactly one.** §1.0's "six, closed" is superseded.

| id | The point | Runs in | A refusal here means |
|---|---|---|---|
| `EP-BUILD` | repository test run over source and over recorded emission fixtures | build | the build fails |
| `EP-REGISTRY-LOAD` | process start, before any listener binds | server | the process does not start |
| `EP-COMPOSE` | the registered projector builds `body` from one capability read or one orchestrator-state read | widget layer, inside the emitting request | the body is never offered to the minter; the answer degrades to plain text (§4.1.1 L2) |
| `EP-FIT` | `degrade(envelope, profile)` — the eight-step fitting algorithm (§4.5.4) for the one `Lifecycle.delivery_channel` | widget layer, server | the emission becomes a `LIMITATION`/`HANDOFF`-only envelope (§4.5.5 C4) |
| `EP-MINT` | closed-shape validation, intent minting, text minting, `body_hash`, `envelope_seal` | widget layer, same request | **no envelope exists**; nothing is delivered, nothing is stored |
| `EP-DELIVER` | the channel adapter hands bytes to the channel | widget layer | the envelope is not delivered |
| `EP-RENDER` | the renderer draws (§0.16 E-14: `body_hash` + expiry only; never the keyed seal) | client | the renderer draws `presentation.text_equivalent` as frozen prose plus one `REFINE` |
| `EP-FETCH` | a first-party route serves a stored artefact: timeline read, `file/<artifact_ref>`, the signed asset route, `pay/<session_ref>` | server | the body/file is withheld; the headline and terminal lines are served |
| `EP-INGRESS` | `IntentGateway`, Step 0 and Gates 1–13, in the order §3.9 fixes | widget layer, server | the submission is refused or superseded; no canonical owner is reached |
| `EP-CANONICAL` | Gate 14 — `CanonicalActionIngressService.prepare()` → `ActionEngineKernel` → provider owner; and the approval owner's approve/reject route | Action Engine / approval owner | the policy resolver refuses |
| `EP-RETENTION` | historisation job, body-drop job, erasure job, tombstone write | background | the job fails; nothing is silently half-erased |

**S0.7 — the pipeline order is normative, and fitting precedes sealing.** `EP-REGISTRY-LOAD → EP-COMPOSE → EP-FIT → EP-MINT → EP-DELIVER → EP-RENDER → EP-INGRESS → EP-CANONICAL`, with `EP-FETCH` and `EP-RETENTION` on the stored artefact and `EP-BUILD` outside every request. `body_hash` and `envelope_seal` are computed **after** degradation, over the degraded envelope (§4.5.4 step 8); a degraded envelope is a first-class envelope. §1.0's placement of `EP-DELIVER` after `EP-MINT` stands; §1.0's implication that the seal precedes degradation is void. *Mechanism:* one `emit()` pipeline with no branch that reaches the adapter before the `EP-MINT` result, and no branch that computes a seal before the `EP-FIT` result. *Evaluation point:* `EP-BUILD` (pipeline-construction test).

**S0.8 — the alias map is normative.** Every evaluation point named anywhere in §§1–4 is read through this table. A rule's stated point is the right-hand column.

| Alias as written in §§1–4 | Canonical point |
|---|---|
| `EP-CI`; "CI"; "in CI"; "per build"; gates G1–G12; "architecture test"; "lint"; "conformance suite"; "property test"; "schema test"; "portability test"; "A-21 parity gate" | `EP-BUILD` |
| "REGISTRY LOAD"; "at process start"; "compile time"; "profile registration"; "boot"; "build stamp" | `EP-REGISTRY-LOAD` |
| "MINT/COMPOSE"; "compose step"; "compose, before sealing"; "at composition"; "projection" | `EP-COMPOSE` |
| "fitting"; "ladder step N"; "the PIN step"; "MINT TEXT step"; "profile resolution"; "profile negotiation"; "at delivery" **when it names the fitter** | `EP-FIT` |
| "MINT/VALIDATE"; "MINT/INTENT"; "mint"; "emission"; "at mint, before sealing"; "the emission validator"; "`validateEnvelope`"; "`mintIntent()`" | `EP-MINT` |
| "delivery"; "the delivery adapter"; "per channel, per emission"; "link minting"; PR3c | `EP-DELIVER` |
| "render"; "render time"; "before first paint"; "capture arming"; "link handling"; "resolution, per utterance"; "barge-in" | `EP-RENDER` |
| "timeline read"; "at fetch"; "asset fetch"; "route resolution"; "carrier resolution" | `EP-FETCH` |
| "Step 0"; "Gate 1" … "Gate 13"; "gateway ingress"; "on submission"; "the TOKEN INTEGRITY gate"; "the AUTHORITY gate"; "the VERIFICATION FLOOR gate"; "the INPUT VALIDATION gate"; "the EFFECT ROUTING gate"; "IntentGateway"; "routing" | `EP-INGRESS` |
| "Gate 14"; "ACTION ENGINE INGRESS"; "the CANONICAL ACTION gate"; "the owner's approve route"; "the owner reject path" | `EP-CANONICAL` |
| "historisation"; "the historisation job"; "the retention job"; "erasure execution"; "the erasure job" | `EP-RETENTION` |
| "n/a"; "none is claimed"; "design review gate"; "package gate"; "moment-registry review"; "gap-ledger review" | **not an evaluation point** — the sentence is `[NON-NORMATIVE]` (§0.17) |

**S0.9 — the gate numbering is §3.9's and only §3.9's.** Gate 4 is Tenant scope; Gate 5 is Verification floor. §1.7 K6 and §1.8, which name "Gate 4" as the floor comparison, are corrected to **Gate 5**. *Mechanism:* the gateway pipeline is constructed from a single ordered array whose indices are asserted against §3.9's table. *Evaluation point:* `EP-BUILD`.

---

## 0.3 The three root members §§1–4 never declared

**S0.10.** `Origin`, `AuthorityEnvelope` and `Presentation` are declared here, minimally and normatively, so that §1 E2's closed-shape validator is constructible and §1.9 H1's hash has a defined input. Every other root member is declared in §1 or §4 (§0.1).

```ts
interface Origin {                                   // root member `origin`
  trigger: 'user_turn' | 'proactive' | 'system_reply';   // E
  emitter: 'orchestrator' | 'capability_read' | 'scheduler';  // D — the minter (§4.1.1 L1)
  moment_key: string | null;                         // D — non-null iff trigger === 'proactive'
  proactive_provenance: ProactiveProvenance | null;   // D — §4.9.3; non-null iff trigger === 'proactive'
}

interface AuthorityEnvelope {                        // root member `authority`
  verification_level: VerificationLevel;             // D — §1.7, server-derived
  pii_class: 'none' | 'business_aggregate' | 'client_identified';  // D
  data_scope: { masked_fields: string[] };           // D — JSON Pointers narrowed before emission (§2 K18)
  // type-level bans, as on ChannelProfile (§4.5.2)
  declares_role: never; declares_permissions: never; declares_capability: never;
}

interface Presentation {                             // root member `presentation`
  presentation_mode: 'client' | 'staff' | 'owner';   // D — from the authority snapshot; never emitter-supplied
  density: 'INLINE' | 'CARD' | 'SHEET';              // D — set by EP-FIT
  text_equivalent: TextEquivalent;                   // M — §1.9 H2
  speech: { lead: Phrase; readback_template: Phrase | null; overflow_say: Phrase | null } | null;  // M
  a11y: A11yBlock;                                   // M — §4.8
  fullscreen_detail: { route_key: string; reason: FullscreenReason } | null;  // D — §2 K15
}

interface TextEquivalent {
  headline: string; body: string;                    // M — renderTextEquivalent (§1.9 H2)
  itemized: string[];                                // M
  completeness_sentence: string | null;              // M — §4.5.5 C5
  unknowns_sentence: string | null;                  // M
}
```

*Mechanism:* these shapes are members of the same closed-shape validator family (`widgetEnvelope()`); an undeclared key at any depth is refused with `unknown_field`. *Evaluation point:* `EP-MINT`.

**S0.11 — `presentation_mode` is derived, never proposed.** It is computed from the authority snapshot; `WidgetComposerInput` has no member for it (§1.1.2 E5 is extended to cover it). It may reorder, relabel and hide; it may never add, remove or enable an intent, and no intent's `capability` may vary by it. *Mechanism:* absence of the composer field, plus the fixture-pair test of §2 K18 / §3.14 FR-8. *Evaluation point:* `EP-BUILD`.

---

## 0.4 One verification floor: one name, one function, one set of tables

**S0.12 — one wire name: `verification_floor`.** It is a field of `WidgetIntent` (§3.1) and of `IntentRecord` (§3.7). **`required_verification` is a deprecated alias and MUST NOT appear in an implementation** — not as a field, not as a parameter, not as a key at any depth of an envelope, a submission, a profile or a record. Every occurrence of `required_verification` in §1.8, §2.6.16, §2.6.18 and §4.5.4 is read as `verification_floor`. *Mechanism:* the forbidden-key validator of §0.14 gains `required_verification`; a source grep at build asserts zero occurrences. *Evaluation points:* `EP-MINT`, `EP-INGRESS`, `EP-BUILD`.

**S0.13 — one derivation, total, arity 2.** §1.8 `deriveVerificationFloor` (four tables, an `audience` parameter with no table), §2.6.16 SETTINGS.5 and §2.6.18 CONSENT.3 (two-term and three-term local formulas) are **void**. The sole derivation is:

```ts
// ARITY: exactly 2. INPUTS: exactly i.effect, i.capability, i.handoff_capability_ref,
// i.target, and kind. No other value is read. There is no `audience` term.
function verificationFloor(i: MintedIntent, kind: WidgetKind): VerificationLevel {
  return maxLevel(
    EFFECT_FLOOR[i.effect],                 // total over the 8 effect classes
    KIND_FLOOR[kind],                       // total over the 22 kinds
    subjectFloor(subjectCapability(i)),     // total, fail-closed
    targetFloor(i.target),                  // total over the 5 target classes and null
  );
}

function subjectFloor(key: string | null): VerificationLevel {
  if (key === null) return 'ANONYMOUS';                       // NONE; w/i/s/detail NAVIGATE
  if (key in CONTROL_REGISTRY) return CONTROL_FLOOR[key];      // widget-layer control keys (§0.6)
  const row = WIDGET_CAPABILITY_POLICY[key];
  if (row === undefined) return 'STEP_UP_VERIFIED';            // FAIL-CLOSED DEFAULT (S0.15)
  const tier = aiToolRegistry.get(key)?.riskTier ?? 'restricted';  // absent ⇒ restricted
  return maxLevel(row.min_verification, RISK_FLOOR[tier],
                  CONSENT_CLASS_FLOOR[row.consent_class]);
}
```

`subjectCapability(i)` is §3.5's function, unchanged: `capability` → `handoff_capability_ref` → `target.ref` when `target.class === 'c'` → `null`.

| `EFFECT_FLOOR` | | | `KIND_FLOOR` | | | `RISK_FLOOR` | | | `CONSENT_CLASS_FLOOR` | | | `targetFloor` | |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `NONE` | `ANONYMOUS` | | `CONSENT_STATE` | `SESSION_VERIFIED` | | `read` | `ANONYMOUS` | | `none` | `ANONYMOUS` | | `null` | `ANONYMOUS` |
| `NAVIGATE` | `ANONYMOUS` | | `IDENTITY_BINDING` | `SESSION_VERIFIED` | | `low_write` | `BOUND_CLIENT` | | `communication` | `SESSION_VERIFIED` | | `'w'` | `ANONYMOUS` |
| `REFINE` | `ANONYMOUS` | | `PAYMENT_HANDOFF` | `SESSION_VERIFIED` | | `medium_write` | `SESSION_VERIFIED` | | `personal_data` | `SESSION_VERIFIED` | | `'i'` | `ANONYMOUS` |
| `HANDOFF` | `ANONYMOUS` | | `APPROVAL` | `SESSION_VERIFIED` | | `high_write` | `SESSION_VERIFIED` | | `identity_binding` | `SESSION_VERIFIED` | | `'detail'` | `ANONYMOUS` |
| `CONTROL` | `ANONYMOUS` | | `CLIENT_LIST` | `SESSION_VERIFIED` | | `restricted` | `STEP_UP_VERIFIED` | | `finance` | `SESSION_VERIFIED` | | `'c'` | `ANONYMOUS` |
| `DRAFT` | `BOUND_CLIENT` | | *every other kind* | `ANONYMOUS` | | | | | | | | `'s'` | `SESSION_VERIFIED` |
| `REQUEST_APPROVAL` | `SESSION_VERIFIED` | | | | | | | | | | | | |
| `COMMIT` | `SESSION_VERIFIED` | | | | | | | | | | | | |

`RISK_FLOOR['read'] = ANONYMOUS` settles §1.8's `CHANNEL_IDENTITY` against §3.4's `ANONYMOUS` in favour of `ANONYMOUS`: a read capability's protection is `WIDGET_CAPABILITY_POLICY[key].min_verification` plus Gate 6, not its risk tier, and `CHANNEL_IDENTITY` would make every guest-chat and public-read envelope fail its own floor, contradicting §4.5.3's `ANONYMOUS_CHAT`/`PUBLIC_READ` tiers and §4.5.8's own worked example.

`EFFECT_FLOOR['CONTROL'] = ANONYMOUS` with the real fence in `CONTROL_FLOOR` (§0.6): were `CONTROL` floored at `BOUND_CLIENT`, the mandatory escape verb would be unreachable in guest chat, contradicting §3.12.6, §4.7 V9 and §4.8 A-5. The effect class is not the fence; the control key is.

`targetFloor('c') = ANONYMOUS` because `subjectCapability` already resolves a `c`-class target to its own key; the term would otherwise double-count.

*Mechanism:* one pure function; `mintIntent()`'s signature has no floor parameter and `WidgetComposerInput` has no such member (§1.1.2 E5, §3.4 R3.4.1); a source test asserts no assignment to `verification_floor` outside `verificationFloor()`. *Evaluation points:* `EP-MINT` (derive), `EP-INGRESS` Gate 5 (re-derive), `EP-BUILD` (the assignment test).

**S0.14 — table totality and the two ways it fails closed.** `WIDGET_CAPABILITY_POLICY` MUST have a row for every key in the C9 canon **and** for every Action Engine capability key reachable by a `COMMIT`/`REQUEST_APPROVAL` (§0.9); a key with no row fails the build. §1.8 K11's totality-and-monotonicity rule attaches to **this** table, not to the void `CAPABILITY_MIN_VERIFICATION`. *Mechanism:* a totality test enumerating `C9_CAPABILITIES` and `ActionCapabilityRegistry` against the table, and a monotonicity test forbidding a lowered row without a contract version bump. *Evaluation point:* `EP-BUILD`.

**S0.15 — the fail-closed default is stated, not left undefined.** At runtime an unmapped key yields `STEP_UP_VERIFIED`, which K6 makes unreachable, so the intent can never be actuated. Independently, at `EP-MINT` an intent whose subject capability has no policy row is **not emitted**: the envelope carries a `Limitation` with a non-null `capability_gap_ref` and no intent (§1.6.7 P2, §2.6.14 LIMIT.1). *Mechanism:* the two rules above; there is no default-to-zero path and no `undefined.min_verification` read. *Evaluation points:* `EP-MINT` (refusal), `EP-INGRESS` (the unreachable floor).

**S0.16 — divergence: one rule, one code.** At Gate 5 the gateway recomputes `verificationFloor()` from the live tables and compares the session against **its own** result, never the stored one. **Any** difference between the stored and the recomputed floor — raised or lowered — refuses the submission with `SUPERSEDED / policy_floor_changed` and returns a freshly composed envelope, and increments `widget_floor_divergence`. §1.8 K10's "any divergence" and §3.4 R3.4.2's "only when raised" are reconciled in favour of **any**: the same remedy applies either way, and a second branch would be a second code path over a security-critical field. *Mechanism:* pure-function re-evaluation plus one comparison. *Evaluation point:* `EP-INGRESS` Gate 5.

**S0.17 — shortfall: withheld at fitting, refused at ingress.** At `EP-FIT` step 1 an intent whose floor exceeds the session's server-derived level is **withheld** with `reason: 'verification_floor'` and MUST be reachable via an emitted `HANDOFF` (§4.5.4, §4.5.5 C4). If such a token is nevertheless submitted, `EP-INGRESS` Gate 5 applies §3.4 R3.4.4's per-effect branch: `NAVIGATE`/`REFINE`/`HANDOFF` → `HANDOFF_REQUIRED` plus a step-up path landing on the same target; `CONTROL`/`DRAFT`/`REQUEST_APPROVAL`/`COMMIT` → `NEEDS_SECOND_CHANNEL`, refused, with the deep link. §1.7 K6's "degrades to `HANDOFF`" describes the `EP-FIT` half only and is void as a description of `EP-INGRESS`. No branch renders as a failure (§0.15 FR-U). *Mechanism:* the fitter's step 1 and the Gate 5 branch table. *Evaluation points:* `EP-FIT`, `EP-INGRESS` Gate 5.

---

## 0.5 One leaf taxonomy: three classes

**S0.18 — three classes, and §2's two extra shapes are spellings of one of them.** §1.2 V1 stands: every leaf of `body` is **datum** (`Cell<T>` / `Measure`), **phrase** (a catalogue lookup) or **structural** (never rendered). **No fourth class exists.** §2.3.1 K5's four-shape declaration is void, and so is its restatement of the absolute sentence §1.10 withdrew.

- **`LocaleText` is a deprecated alias of `Phrase`** and MUST NOT appear in an implementation: `LocaleText.key` ≡ `Phrase.phrase_key`, `LocaleText.text` ≡ `Phrase.rendered`, `params` absent. Every field typed `LocaleText` in §2.6 is read as `Phrase`.
- **`NarrativeText` is not a fourth class; it is the phrase class with typed slots.** Its replacement is `Narrative { narrative_template_id: string; narrative_template_version: number; slots: Record<string, CellPointer>; rendered: string }`, where the template is a member of the versioned `NARRATIVE_TEMPLATES` catalogue and every slot names a `Cell`, `Measure` or `Phrase` in the same body. **`NarrativeText.template` — "model-authored", guarded by `/^[^0-9]*$/` — is deleted.** That guard is the exact mechanism §1.10 withdrew, and it passes «выручка выросла вдвое». §1.6.5 P6 and §1.2 V4's catalogue lint (digits, Russian and English cardinals/ordinals, and the quantity tokens `пол-`, `треть`, `вдвое`, `half`, `double`, `top-N`) are the only guard. A model may select which server template is used, from a closed enum validated by a server table (§1.6.5 P7); it may not supply a character that reaches a user.
- **The bare rendered strings in §2's bodies are retyped to `Phrase`:** `OptionItem.media.alt`, `MEDIA_PREVIEW.alt`, `PROGRESS.steps[].unknown.label`. With these three, §1.2 V1 is true of every body in §2.6.
- **A leaf is the whole `Cell`/`Measure`/`Phrase` value, or a structural scalar.** The minted string members *inside* a datum or phrase leaf — `Cell.label`, `Measure.basis`, `Measure.formatted`, `Phrase.rendered`, `Narrative.rendered` — are not separate leaves; they are covered by §1.9 H3 (pure server function, inside `body_hash`), not by V1.
- **V1 governs `body` only.** Minted strings outside `body` — `WidgetIntent.label` / `utterance_preview` / `speech_aliases`, `A11yBlock.label` / `description`, `TerminalLine.text`, `presentation.text_equivalent.*` — are governed by §1.9 H3 and §3.1 R3.1.2.

*Mechanism:* `buildCellIndex(kind, body_version, body)` against the kind's registered leaf schema, in which every leaf carries a class; plus the catalogue lint; plus a schema-totality test. *Evaluation points:* `EP-MINT`, `EP-BUILD`.

**S0.19 — a bare `UNKNOWN` member of a body value enum is deleted.** Unknown is carried by `CellState`, never by a value domain, so that §1.3 C1's five branches are total and §1.3 C4's "UNKNOWN is a statement, not a failure" reaches every field. Concretely: `TIME_SLOT_SELECTOR.slots[].availability: Cell<'FREE'|'TAKEN'>`; `SCHEDULE.entries[].state: Cell<'BOOKED'|'BLOCKED'|'FREE'>`; `PROGRESS.steps[].state: Cell<'PENDING'|'RUNNING'|'DONE'|'SKIPPED'>` with `steps[].unknown` deleted (its `reason_code`, `label` and `next_intent_ref` are the `Cell`'s own); `SOURCE_STATUS.sources[].state: Cell<'CONNECTED'|'DEGRADED'|'UNLINKED'>`; `SOURCE_STATUS.overall: Cell<'OK'|'PARTIAL'|'BLOCKED'>`; `IDENTITY_BINDING.bindings[].state: Cell<'LINKED'|'UNLINKED'|'PENDING'>`; `APPROVAL.state: Cell<'PENDING'|'APPROVED'|'REJECTED'|'COMPLETED'|'EXPIRED'>`. `HELD` remains absent from every one of them (§2.6.4 SLOT.1, §3.10.5 R3.10.5, INV-27) — that is the load-bearing half both sections agree on. §2.6.4 SLOT.1's "two states" and §3.10.5's "exactly three states" are both read as: two value members, plus not-`KNOWN`. §2.6.12 APPROVAL.3's "no failure state" is preserved and strengthened: an outcome not yet known is a non-`KNOWN` `Cell` with reconciliation language, and no enum anywhere in §2 has a `FAILED` member. *Mechanism:* the leaf schema plus `widgetCell()`'s per-state shape check. *Evaluation point:* `EP-MINT`.

---

## 0.6 The effect classes: `CONTROL` is granted, to every kind

**S0.20 — eight classes, and the ordering.** `EffectClass` is §3.2's eight: `NONE`, `NAVIGATE`, `REFINE`, `CONTROL`, `DRAFT`, `REQUEST_APPROVAL`, `COMMIT`, `HANDOFF`. The **business ordering** is `NONE < NAVIGATE < REFINE < DRAFT < REQUEST_APPROVAL < COMMIT`; **`HANDOFF` and `CONTROL` are off that order** and are permitted per kind by explicit membership. A kind's *effect ceiling* is the greatest ordered member of its `permitted_effects`; `CONTROL` never raises a ceiling. §2 K3 is amended to this wording.

**S0.21 — `CONTROL` is a permitted effect on all twenty-two kinds.** `permitted_effects` for every row of §2.4 gains `CONTROL`. This is the one answer to "`CONTROL` is permitted by zero kinds". It is safe: `CONTROL` has no Action Engine edge and may write nothing but the widget layer's own rows (§3.2 R3.2.4), and every kind needs a dismissal. *Mechanism:* `KIND_REGISTRY` is a mapped type over `WidgetKind`; a start-up assertion asserts `CONTROL ∈ permitted_effects` for all twenty-two rows and that `commit_allowed` is still derived from the ordered members alone. *Evaluation points:* `EP-REGISTRY-LOAD`, `EP-MINT`.

**S0.22 — the control registry is closed at three keys, and it is not the C9 canon.**

| control key | owner endpoint | `CONTROL_FLOOR` | status |
|---|---|---|---|
| `control.run.cancel` | `POST /api/orchestration/runs/:id/cancel` | `BOUND_CLIENT` | **[EXISTS]** — `orchestration/c9.controller.ts:92`; `c9.store.ts` cancel is write-once under `cancelKeyHash`, principal- and tenant-locked, and denies `cancel_races_dispatched_work` (`c9.store.ts:588–615`) |
| `control.widget.dismiss` | widget layer — sets `Lifecycle.delivery` on one emission | `ANONYMOUS` | [TO BUILD] |
| `control.delivery.resolve` | widget layer — resolves one `dedupe_key` across channels | `BOUND_CLIENT` | [TO BUILD] |

**S0.23 — Gate 6 for `CONTROL` is the owner endpoint's own lock, not `assertCanExecute`.** §3.2.3's "every `CONTROL` submission passes Gate 6 exactly as a `DRAFT` does" is void: `AiToolPolicyService.assertCanExecute` is keyed on an `AiToolDefinition`, and no control key is in `MAYA_AI_TOOL_CATALOG` or in `C9_CAPABILITIES` (verified: zero occurrences repo-wide for all three). The replacement, which is a real mechanism: at Gate 6 a `CONTROL` submission is checked against `CONTROL_FLOOR[key]` (Gate 5), Gate 3's principal binding and Gate 4's tenant assertion, and is then dispatched to the one registered handler for that key, which performs its **own** principal and tenant check — for `control.run.cancel` that check exists today and is write-once. The effect router has no default case and no `CONTROL → ActionEngine` edge. *Mechanism:* the closed control registry plus the owner endpoint's lock; a source test asserts each handler module imports no Prisma model outside the widget layer's own except through that owner endpoint. *Evaluation points:* `EP-INGRESS` Gates 5/6/13, `EP-BUILD`.

**S0.24 — run cancellation is a `CONTROL`, not a `REFINE`.** §2.6.13 PROGRESS.3's "`cancel_intent` is a `REFINE` carrying the registry capability `orchestration.run.cancel`" is void. `PROGRESS.cancel_intent` is `effect: 'CONTROL'`, `capability: 'control.run.cancel'`, `role: 'control'`. *Mechanism:* S0.22. *Evaluation points:* `EP-MINT`, `EP-INGRESS` Gate 13.

---

## 0.7 The escape verb exists in every channel

**S0.25 — one escape intent, two effect classes, decided at fitting.** Every envelope whose `lifecycle.input_lock !== 'none'`, and every envelope any of whose body declares a `dismiss_intent` or `discard_intent` field, carries **exactly one** intent with `role: 'escape'`, `priority: 0`, never dropped by degradation, whose `speech_aliases` include the universal cancel verbs and which is additionally reachable as `/cancel` in Telegram. Its effect class is decided at `EP-FIT`, before `EP-MINT` seals:

- `render_tier === 'RICH_INTERACTIVE'` → `effect: 'NONE'`, `intent_token: null`. Dismissal is genuinely local; there is nothing to send.
- every other tier → `effect: 'CONTROL'`, `capability: 'control.widget.dismiss'`, `intent_token` non-null. Dismissing a Telegram card requires `edit_message_text`; that is a server call and is classed as one.

§3.1 R3.1.1 (`intent_token === null` **exactly** for `NONE`) therefore holds with no exception, and §3.2.2's "replaces it with the equivalent `CONTROL` intent" is constructible because §0.21 grants `CONTROL` to every kind. §2.6.5 BOOK.5's "its effect class is `NONE`" is amended to this rule; its substantive content is preserved unchanged — the escape never cancels an appointment, it appears in no routing map that reaches a canonical owner, and on a `confirmation_subject: 'cancel'` body cancelling the appointment *is* the `COMMIT`. *Mechanism:* the fitter's escape branch, then the closed-shape validator over the fitted envelope. *Evaluation points:* `EP-FIT`, `EP-MINT`, `EP-INGRESS` Gate 13.

**S0.26 — `interaction_model` is deleted; `render_tier` is the discriminator.** §4.5.1 deletes `interaction_model` and `NON_INTERACTIVE` from `ChannelProfile`, but §3.2.2, §3.12.1 and INV-26 still read them. Read `interaction_model === 'RICH'` as `render_tier === 'RICH_INTERACTIVE'` and `interaction_model === 'NOTIFICATION'` as `render_tier === 'ANNOUNCEMENT'`. *Mechanism:* `ChannelProfile` has no `interaction_model` member; the closed-shape validator refuses one. *Evaluation point:* `EP-REGISTRY-LOAD`.

**S0.27 — a consent or identity kind's mint fence excludes its own escape.** §2.6.18 CONSENT.2 and §2.6.19 IDENTITY.1–6 are amended: the envelope is refused at mint unless **every intent whose `role` is not `'escape'`** has a derived `verification_floor ≥ SESSION_VERIFIED`, a non-null `handoff_capability_ref`, and a target of class `s` resolving to a live shell route. Without this amendment `CONSENT_STATE` and `IDENTITY_BINDING` are unmintable whenever they carry the escape §3.12.6 mandates — a rule that cannot be satisfied is not a fence. The escape carries no capability, no target and no consent decision, so it weakens nothing. *Mechanism:* the kind-level clause in `validateEnvelope`, evaluated before `envelope_seal`. *Evaluation point:* `EP-MINT`.

---

## 0.8 Intent references, intent tokens, and the `0..12` bound

**S0.28 — every `*_intent` / `intent_token` field of every body holds an `intent_ref`, never a token.** `intent_ref` is envelope-local (`'i1'`), class **structural**, never rendered. `intent_token` exists only on `WidgetIntent.intent_token` and travels only in the carrier (§4.5.6). This settles, once, whether the four non-nullable escape handles (`BOOKING_CONFIRMATION.dismiss_intent`, `PAYMENT_HANDOFF.dismiss_intent`, `FORM.discard_intent`, `SETTINGS_DRAFT.discard_intent`) hold a value R3.1.1 forbids: they hold a ref, which is always non-null, whatever the escape's effect class is. §4.8's `InteractiveRef` member `{ k: 'intent'; id }` holds an `intent_ref`; §2 K22's "bare `intent_token`" is read the same way.

**S0.29 — a per-element handle names one envelope-level intent, not one intent per element.** Where a `*_intent` field sits on a repeated element — `OptionItem.intent_token`, `slots[].intent_token`, `TableSpec.row_intents`, `SCHEDULE.entries[].detail_intent` / `move_intent`, `bulk_intents[].intent_token` — it names the single envelope-level intent whose `InputSchema` field of kind `enum`/`ref` has that element's id in its closed `domain_ref`; the element id is the **selection**, not a second intent. This is §3.16.3's stated design ("one token per intent with a closed selection domain — rather than one token per option, which is unshippable envelope weight") made structural. Consequence: `TIME_SLOT_SELECTOR` at its 12-slot cap carries five intents (select, more, widen, none-fit, escape), `SCHEDULE` at its 24-entry cap carries four, `CLIENT_LIST` at its 10-row cap carries at most six — all inside §1.1.1's `intents: 0..12`. *Mechanism:* the leaf schema types these fields as `intent_ref`; `validateEnvelope` asserts each resolves to an emitted intent and that the element id is a member of that intent's `domain_ref`. *Evaluation point:* `EP-MINT`.

**S0.30 — `allowed_target_classes` is a declared field of `KindRule`, with a total default.** §2.3.4 cites it; §2.2 never declares it. It is added: `allowed_target_classes: readonly ('w'|'i'|'c'|'s'|'detail')[]`, defaulting to `['w','i','detail']` for every kind, plus `'s'` for every kind whose `permitted_effects` include `HANDOFF`. **`'c'` is permitted on no kind in this contract version.** §3.3.2's registry-and-policy check on a `c`-class target, and `subjectCapability`'s `c` branch, remain in force as defence in depth over a class nothing may currently emit. *Mechanism:* the field, plus `validateEnvelope`'s membership check. *Evaluation points:* `EP-REGISTRY-LOAD`, `EP-MINT`.

**S0.31 — a first-party shell route takes one opaque parameter.** §3.3's `{ class: 's'; ref: ShellRoute }` with five bare literals cannot express §2.6.20 PAY.2's `pay/<session_ref>` or §2.6.22 ARTIFACT.1's `file/<artifact_ref>`, leaving payment with no return path and `ARTIFACT` with no delivery. The shape is corrected — **without** admitting a free-form string:

```ts
type ShellRoute =
  | { route: 'shell.root' | 'shell.account' | 'shell.connections'
           | 'shell.privacy' | 'shell.notifications';                  param: null }
  | { route: 'shell.pay';  param: string }     // session_ref, opaque, server-minted
  | { route: 'shell.file'; param: string };    // artifact_ref, opaque, server-minted
```

`param` is an opaque server-minted handle matching `/^[A-Za-z0-9_-]{8,64}$/`; it is not a path, not a query string, not an origin and not a provider id, and the seven forbidden keys of §0.14 still apply at every depth. Both new routes carry `targetFloor('s') = SESSION_VERIFIED` and re-check the live principal's proof hash at `EP-FETCH` (§2.6.22 ARTIFACT.2, §2.6.21 MEDIA.3). *Mechanism:* the closed shape plus the shell-route table; `c9SafeText` over every minted text field. *Evaluation points:* `EP-MINT`, `EP-FETCH`.

---

## 0.9 Two key spaces, and the confirmation fence

**S0.32 — the widget layer never bridges a key space; it uses each for what it is.** This is the answer to "the COMMIT path crosses two key spaces with no stated bridge", and it requires no C9 change.

- **C9 canon keys** (`C9_CAPABILITIES`, 56 keys — verified) are **read and propose** keys. `c9.registry.ts:114` mints every non-read catalogue entry as `PROPOSE_ONLY` with `resourceClass: 'SOURCE_HANDOFF'` — verified. Only intents of effect `REFINE`, `DRAFT`, `HANDOFF`, and a `NAVIGATE` of class `c`, may carry one.
- **Action Engine capability keys** (`RegisteredActionCapabilityV1.capability`, e.g. `crm.appointment.create.v1`) are **actuating** keys. Only `COMMIT` and `REQUEST_APPROVAL` may carry one, and they may carry nothing else.
- The conversion never happens in the widget layer. A `DRAFT` carrying a C9 propose key is routed at Gate 13 to that capability's registered canonical draft owner; **that owner** composes the confirmation body and names the Action Engine key the `COMMIT` will carry. The widget layer records the pairing; it does not compute it.

*Mechanism:* the effect/capability discriminated union of §3.2 gains a key-space term, checked against `C9_CAPABILITIES` and `ActionCapabilityRegistry` respectively. *Evaluation points:* `EP-MINT`, `EP-INGRESS` Gate 7.

**S0.33 — one derived rule fixes the required confirmation kind, over one key space.** §2.6.5 BOOK.2's `booking_effect` registry flag is **void** (verified: zero occurrences; adding it would be the C9 change §3.16.2 exists to avoid). §3.10.1's derivation stands, corrected and generalised:

```ts
function requiredConfirmationKind(aeKey: string): WidgetKind {
  const cap = new ActionCapabilityRegistry().get(aeKey);            // throws ⇒ refuse the mint
  if (cap.policyDecision !== 'ALLOW') refuseMint('capability_not_actuating');
  if (cap.riskFacets.includes('financial')) return 'PAYMENT_HANDOFF';
  if (cap.targetKind === 'appointment')     return 'BOOKING_CONFIRMATION';
  return 'SETTINGS_DRAFT';
}
```

Verified inputs, all existing fields of `RegisteredActionCapabilityV1` (`action-engine.contract.ts:175,179,182`; `ActionPolicyDecision = ALLOW|DENY|SHADOW_ONLY` at `prisma/schema.prisma:101-105`): `crm.appointment.{create,reschedule,cancel,attendance,duration,services,fields}.v1` carry `targetKind: 'appointment'`; the four `*.shadow.v1` residuals carry it with `policyDecision: SHADOW_ONLY` and are therefore not mintable at all; `crm.visit.payment.v1` carries it with `riskFacets: ['external','customer_visible','financial']` **and** `policyDecision: DENY`, so it routes to `PAYMENT_HANDOFF` and is not mintable; `loyalty.internal-adjust.execute.v1` carries `riskFacets: ['local','financial','customer_value']`, so it routes to `PAYMENT_HANDOFF` (§0.11). §3.10.1's stated extension — "create, cancel, reschedule and services" — is **wrong by nine capabilities** and is corrected to this derivation. *Mechanism:* a registry read, no hardcoded name, no new field. *Evaluation points:* `EP-MINT`, `EP-INGRESS` Gate 7.

**S0.34 — `confirmation_of_draft_ref` is generalised, so cancel, reschedule and approval become mintable.** §3.2.7 / §3.7 / §3.10.2 make every `COMMIT` require a non-null `confirmation_of_draft_ref` pointing at a draft, while §2.6.5 BOOK.3 says `reschedule` and `cancel` carry no draft and §2.6.12 `APPROVAL` has none either — so cancel, reschedule and both approval decisions are structurally unmintable. The field is replaced on `IntentRecord` by:

```ts
confirmation_of_ref: { kind: 'draft' | 'record' | 'approval'; ref: string };  // NON-NULL iff effect === 'COMMIT'
produced_by_intent_token_hash: string | null;   // AUDIT_RETAINED
```

`kind: 'draft'` for `create`, every `SETTINGS_DRAFT` and every `PAYMENT_HANDOFF`; `kind: 'record'` for `reschedule` and `cancel` (the `appointment_ref`); `kind: 'approval'` for an `APPROVAL` decision (the `approval_ref`).

**The guard against the obvious bypass:** a `COMMIT` whose `confirmation_of_ref.kind !== 'draft'` is mintable **only** when `produced_by_intent_token_hash` is non-null and names a consumed `REFINE`/`DRAFT` record whose capability is the canonical owner's own propose key. The confirmation body must have been *returned by the canonical owner in response to a gateway submission* — so booking-intent normalisation, Client-principal verification and confirmation identity still run before any commit token exists (§2.6.2 SERVICE.1, §2.6.6 SCHED.2). Populating the field with a bare `appointment_ref` does not satisfy it. *Mechanism:* the mint function's two-part refusal; Gate 7 re-checks both. *Evaluation points:* `EP-MINT`, `EP-INGRESS` Gate 7.

**S0.35 — the Action Engine's independent fence is what the Action Engine actually has.** §3.10.3's `canonical-confirmation:v1:<draft_id>` evidence idiom is **void** (verified: zero occurrences, and no `draft_id` exists for two of the three booking subjects). §2 K11 / BOOK.2's "checked independently at ACTION ENGINE INGRESS against the persisted `IntentRecord.widget_kind`" is **void**: `CanonicalActionIngressService.prepare()` receives `TrustedActionExecutionRequestV1` — tenant, capability, `source.{type,sourceRef,actorUserId}`, input, `evidenceRefs`, `bookingIntent` — and carries no `widget_kind`; passing one would make a canonical mutation conditional on widget-layer state, which FR-1, FR-2 and E3 forbid. The widget-kind check lives where it belongs: at `EP-MINT` and at `EP-INGRESS` Gate 7, over the widget layer's own record.

What the Action Engine independently enforces, verbatim from the code: `assertNoCallerAuthority(request)` and `assertResolverOwnsDecision(preview, policy)` (`action-engine.ingress.ts:71,107,141,161`); `source.type` membership in the capability's `allowedSourceTypes`; `readClientActionPrincipal`'s evidence-prefix and cardinality check; and, for a client-principal create, a mandatory `bookingIntent` — `ClientBookingIntentContext { snapshot, hash, encrypted }` — with `creationMode === 'client'`, `allowBusy === false`, `notifyBySmsHours === 0` and a `create/`-prefixed `targetRef` (`client-action-principal.contract.ts:76–88`).

**The honest strength of that fence, stated once:** it is **shape, source-type and durable attribution — not a second authorisation of the widget path.** `readClientActionPrincipal` validates prefixes and cardinality only; its own source comment reads that an evidence reference is durable attribution, never a bearer credential. The authorisation of a booking commit is the gateway's Gates 5–7 plus Gate 14's policy resolver, which the caller cannot influence. §2 K11's "an owner that never trusted the emitter" is downgraded (§0.17). *Mechanism:* the four checks named above, all `[EXISTS]`. *Evaluation point:* `EP-CANONICAL`.

**S0.36 — the schedule drag resolves through a key that exists.** §2.6.6 SCHED.2's `booking.reschedule.propose` is **void** (verified: zero occurrences). `SCHEDULE.entries[].move_intent` is a `REFINE` carrying the registered C9 key **`appointments.own.reschedule`**, which C9 classifies `PROPOSE_ONLY` / `SOURCE_HANDOFF` — so it cannot actuate, passes the registry lookup, the denied-set check and Gate 6, and is routed at Gate 13 to the canonical booking owner, which returns a `BOOKING_CONFIRMATION` with `confirmation_subject: 'reschedule'`. The `COMMIT` is minted onto that body alone, carrying `crm.appointment.reschedule.v1` (§0.32, §0.34). `SCHEDULE`'s ceiling stays `REFINE`. *Mechanism:* the registry lookup plus §0.32's key-space rule. *Evaluation points:* `EP-MINT`, `EP-INGRESS` Gates 6/7/13.

---

## 0.10 The capability register: what resolves, and what is a declared GAP

**S0.37 — verified by grep over `maya-saas-backend/src` at the head of branch `codex/maya-brain-systemic-release-20260815`.** `C9_CAPABILITIES` = the 47 `MAYA_AI_TOOL_CATALOG` names plus 9 extras = **56 keys**.

| Key cited in §§1–4 as "the registry capability" | Resolves? | Ruling |
|---|---|---|
| `orchestration.run.read` | **0 hits** | **Deleted.** A `PROGRESS` body is minted by the orchestrator itself from `WidgetSource.from === 'orchestrator_state'` (§1.1.5) — it is not a capability read, so no key is needed and none is registered. `PROGRESS`'s owner class is `ORCHESTRATION_RUN`, resolved at `EP-REGISTRY-LOAD` to *the existence of the run*, plus the registered `owner_report.status` for the report case. |
| `orchestration.run.cancel` | **0 hits** | **Deleted.** Cancel is `CONTROL` / `control.run.cancel` (§0.22, §0.24), whose owner endpoint exists. |
| `booking.reschedule.propose` | **0 hits** | **Deleted.** Replaced by the registered `appointments.own.reschedule` (§0.36). |
| `control.run.cancel`, `control.widget.dismiss`, `control.delivery.resolve` | 0 hits, **by design** | Not C9 keys. They are the widget layer's own closed control registry; `subjectFloor` reads `CONTROL_FLOOR`, not the AI-tool catalogue (§0.13, §0.23). |
| the eight `NEVER_CHAT_ACTUATED` keys — `consent.pd.grant`, `consent.pd.withdraw`, `consent.marketing.grant`, `consent.marketing.revoke`, `identity.staff.telegram.unbind`, `identity.client.channel.unbind`, `consent.register.export`, `conversation.history.erase` | **0 hits each** | **Declared GAPs.** They are *reserved names for acts with no canonical owner*, not registry members. Each emits `capability_gap_ref` and **no intent** (§1.6.7 P2, §2.6.14 LIMIT.1, §3.5 R3.5.4): `GAP-CONSENT-PD-GRANT`, `GAP-CONSENT-PD-WITHDRAW`, `GAP-CONSENT-MKT-GRANT`, `GAP-CONSENT-MKT-REVOKE`, `GAP-IDENTITY-STAFF-UNBIND`, `GAP-IDENTITY-CLIENT-UNBIND`, `GAP-CONSENT-REGISTER-EXPORT`, `GAP-HISTORY-ERASE`. §3.4.3's CI test is amended accordingly: it asserts that **every key the gap ledger later replaces one of these with** is present in `WIDGET_CAPABILITY_POLICY` at `SESSION_VERIFIED` or higher **before** it may be emitted — a registration gate, not a test over keys that do not exist. |
| `consent.*` read owner (`CONSENT_STATE`), `identity.*` (`IDENTITY_BINDING`), commerce/loyalty **write** (`PAYMENT_HANDOFF`), `cutmatch.*` (`MEDIA_PREVIEW`) | 0 hits | Already declared blocked by §2.7; unchanged. `GAP-CONSENT-READ`, `GAP-IDENTITY-READ`, `GAP-COMMERCE-GIFT`, `GAP-LOYALTY-REDEEM`, `GAP-TIPS`, `GAP-MEDIA-GENERATION`. |
| every other key cited in §2.4 and §2.6 — `catalog.services.read`, `catalog.staff.read`, `booking.availability.read`, `booking.group-availability.read`, `appointments.own.{create,reschedule,cancel}`, `staff.schedule.{read,own.read,update}`, `operations.journal.read`, `company.business-hours.read`, `clients.*`, `customers.count`, `b35.{preview,status,confirm}`, `c7.measurement.read`, `analytics.team-kpi.read`, `c8.result.read`, `analytics.business.{query,profit}`, `analytics.revenue.forecast`, `analytics.branches.compare`, `reports.recovered`, `expenses.{read,create}`, `clients.dossier.read`, `support.{integration-status.read,contact-admin.request}`, `settings.{read,update}`, `notifications.appointments.{read,update}`, `tasks.create`, `a22.configuration`, `owner_report.{download,status}`, `c9.no_action` | **resolve** | Unchanged. |

**S0.38 — `GAP-SEPARATION-OF-DUTIES` is added to the gap ledger** (see §0.12). **S0.39 — `GAP-ATTENDANCE-CONFIRM` stands** (§4.3 DR4), unchanged.

**S0.40 — §2.7's readiness table survives these deletions.** With `PROGRESS` sourced from orchestrator state and cancelling via `control.run.cancel`, and `SCHEDULE` reschedule-proposing via `appointments.own.reschedule`, the emittable set is unchanged: 17 emittable, `ARTIFACT` narrowly emittable, 4 blocked. *Mechanism:* §2 K20's derivation, re-run over the corrected owner-class key sets. *Evaluation point:* `EP-REGISTRY-LOAD`.

---

## 0.11 `SETTINGS_DRAFT`: which owner classes it may carry, and the finance fence

**S0.41 — the enumeration.** `SETTINGS_DRAFT` may carry a `COMMIT` for a capability drawn from exactly these owner classes and no others:

| owner class | keys |
|---|---|
| `SETTINGS_OWNER` | `settings.read`, `settings.update` |
| `NOTIFICATION_PREF_OWNER` | `notifications.appointments.read`, `notifications.appointments.update` |
| `SCHEDULE_RULE_OWNER` | `staff.schedule.update` |
| `TENANT_CONFIG_OWNER` | `a22.configuration` |
| `EXPENSE_OWNER` | `expenses.read`, `expenses.create` |
| `TASK_OWNER` | `tasks.create`, `tasks.complete`, `tasks.list` |
| `AUDIENCE_OWNER` | `b35.preview`, `b35.status`, `b35.confirm` |

**S0.42 — the exclusion is explicit and mechanical.** A `COMMIT` may be minted onto `SETTINGS_DRAFT` only when its Action Engine capability satisfies `requiredConfirmationKind(aeKey) === 'SETTINGS_DRAFT'` (§0.33) **and** its C9 propose key's `WIDGET_CAPABILITY_POLICY` row has `consent_class ∈ {none, communication}`. Excluded by construction: every **finance**-class capability, every **booking-effect** capability, and every **personal_data** or **identity_binding** capability.

**S0.43 — `loyalty.internal.adjust` is removed from `SETTINGS_DRAFT`.** §2.4 row 16 lists it among `SETTINGS_DRAFT`'s registered draft owners and §2.6.16's `draft_class` enum contains `'loyalty_adjustment'`; both are **void**. Verified: `loyalty.internal.adjust` is `riskTier: 'high_write'`, `approvalPolicy: 'owner'` (`ai-tool.catalog.ts:911–933`), and its Action Engine counterpart `loyalty.internal-adjust.execute.v1` carries `riskFacets: ['local','financial','customer_value']` — so `requiredConfirmationKind` routes it to `PAYMENT_HANDOFF`, which is gap-blocked on `GAP-LOYALTY-REDEEM` with a null `commit_intent` and no button (§2.6.20 PAY.4). The identical economic effect is therefore fenced identically on both kinds, which is what the payment fence was for. `draft_class` becomes `'settings' | 'notification_pref' | 'expense' | 'task' | 'schedule_rule' | 'audience'`.

**S0.44 — `consent_class: 'finance'` is defined once, and it covers balances.** Finance is every capability that creates, moves, redeems or reverses money or a money-equivalent balance: payment, prepayment, refund, gift certificate, membership, tips, loyalty **redemption and loyalty adjustment**. `expenses.create` is **not** finance: it records a fact about money already spent, moves nothing, and its magnitude is bounded by a `bounds_source` re-read from the canonical owner at Gate 8 — `MAX_EXPENSE_RUBLES` with the `value <= 0 || value > MAX_EXPENSE_RUBLES` rejection (`expense-category.ts`, verified). *Mechanism:* the `consent_class` column of `WIDGET_CAPABILITY_POLICY`, whose every change is a contract version bump (§1.8 K12); a `EP-REGISTRY-LOAD` assertion that `SETTINGS_DRAFT`'s resolved key set contains no `finance`, `personal_data`, `identity_binding` or booking-effect key; the `EP-MINT` refusal of §0.42; Gate 7's re-check. *Evaluation points:* `EP-REGISTRY-LOAD`, `EP-MINT`, `EP-INGRESS` Gate 7.

---

## 0.12 Approval: four-eyes is deleted; the true guarantee; the repository observation

**S0.45 — the four-eyes claim is deleted, not weakened.** §2.6.12 APPROVAL.2 — "four-eyes is a server fact… the Action Engine's approval state machine supplies the flag… and again at the CANONICAL ACTION gate, which enforces four-eyes regardless of what was rendered" — is **void**. §3.6.2's deletion of `four_eyes` is correct and governs. No field named `four_eyes`, `fourEyes`, `separation_of_duties` or `separationOfDuties` may appear in an implementation, and no widget may render, imply, narrate or speak separation of duties.

**S0.46 — the true, weaker guarantee, stated in full.**

> **Who may decide an approval is decided by the capability's `approvalPolicy` in its AI-tool definition, evaluated by `AiToolPolicyService.assertCanDecide` against a principal resolved inside the deciding request — never by which widget was rendered, never by any field of an envelope or a submission, and never by a renderer.** For `approvalPolicy: 'actor'` the decider must be the requester (`requestedByUserId === principal.userId`). For `approvalPolicy: 'owner'` the decider must hold an owner role (`OWNER_ROLES.includes(principal.role)`) — **a set that may include the initiator.** The system therefore enforces **role-gated approval**, not separation of duties. A widget confers nothing here: rendering a decision control is not permission to use it, and a decision submitted from a widget that should never have been rendered is refused by the same call.

*Mechanism:* `AiToolPolicyService.assertCanDecide` (`ai-tool-policy.service.ts:97–105`) on the owner's approve route, plus `assertPayloadHash(approval, dto.payloadHash)` binding the exact approved scope (`ai-tool-runtime.service.ts:209,301,1197`). *Evaluation point:* `EP-CANONICAL`. *Status:* **[EXISTS]**.

**S0.47 — what `blocked_reason` may mean.** `APPROVAL.approve_intent` / `reject_intent` may be null, with a non-null `blocked_reason`, only for a reason that is a server fact at compose time: `state !== 'PENDING'`, the approval's TTL has passed, or `canDecide(definition, requestedByUserId, principal)` is false for the live principal. It may **never** be null because the approver equals the initiator. *Mechanism:* the composer calls `canDecide` and has no rule of its own; a fixture test asserts no other branch nulls a decision intent. *Evaluation points:* `EP-COMPOSE`, `EP-BUILD`.

**S0.48 — where separation of duties is genuinely required, there is a gap and no button.** A capability whose owner determines that an initiator must not decide carries `capability_gap_ref: 'GAP-SEPARATION-OF-DUTIES'` and **no decision intent** (§3.6.2's own remedy, §1.6.7 P2). *Mechanism:* the emission validator. *Evaluation point:* `EP-MINT`.

**S0.49 — REPOSITORY OBSERVATION, recorded as a finding about the running system.** *This is an observation, not a widget-contract rule; it is recorded here so that no reader of this contract believes the widget layer compensates for it.*

> `AiToolPolicyService.canDecide` (`maya-saas-backend/src/ai-tools/ai-tool-policy.service.ts:81–95`) resolves `approvalPolicy === 'owner'` to `OWNER_ROLES.includes(principal.role as …)` **without comparing `requestedByUserId` to `principal.userId`**. An initiator holding an owner role can therefore approve their own request. `four_eyes` / `fourEyes` / `separationOfDuties` have **zero occurrences** anywhere under `maya-saas-backend/src`. `assertSameApproval` (`ai-tool-runtime.service.ts:1158–1172`) requires `approval.requestedByUserId === principal.userId` — an idempotency-identity check, the opposite of a separation control.
>
> Concretely reachable today: `loyalty.internal.adjust` is `riskTier: 'high_write'`, `approvalPolicy: 'owner'` — a self-approvable balance mutation. §0.43 keeps it off every chat-reachable confirmation body; that is a containment, not a fix.
>
> Owner action required outside this contract: either add a separation-of-duties comparison to `canDecide` for `approvalPolicy: 'owner'`, or accept role-gated approval as the product's stated control. This contract does not choose, and states nothing stronger than §0.46 until one is chosen.

---

## 0.13 Erasure: `frozen_nouns`, and no business record on erasable content

**S0.50 — `frozen_nouns` is `AUDIT_RETAINED`.** §3.7's placement of `frozen_nouns` in the "conversation content — ERASED" block is **void**; §4.4.3's table, which classifies `frozen_nouns` (opaque handles naming canonical rows) as `AUDIT_RETAINED`, governs. This follows from §3.7 R3.7.2's own definition: a frozen noun is a handle naming *what*, never a value and never a word the data subject said. A handle to an appointment is not conversation content.

**S0.51 — the decision path reads only `AUDIT_RETAINED` fields.** The noun resolver's input is exactly `{ capability, frozen_nouns, requested_scope_hash, principal_proof_hash, tenant_id, confirmation_of_ref, produced_by_intent_token_hash }` — every one of them `AUDIT_RETAINED`. `utterance_template`, `selected_labels`, `rendered_utterance`, `spoken_transcript` and the `selection_domain` labels are `CONVERSATION_CONTENT` and are read by **nothing** after Gate 9. Consequently §3.11.1's inheritance of `frozen_nouns` along `approval_of_intent_ref`, and Gate 11's fresh read at decision time, survive an erasure request untouched: **erasing conversation history while an approval is PENDING cannot leave it undecidable.**

**S0.52 — the general rule, which is the one that must hold.** **No canonical business record, and no pending approval, may depend on any field classified `CONVERSATION_CONTENT` or `CANONICAL_ELSEWHERE`.** *Mechanism:* a build-time reachability test — for every field read on any code path that reaches Gate 11, Gate 13, Gate 14, the owner's approve route or the owner's reject route, the field's `ErasureClass` must be `AUDIT_RETAINED`; a read of a non-`AUDIT_RETAINED` field on any of those paths fails the build. This is the enforcing form of FR-2's consequence and of §4.4.1 RT3. *Evaluation point:* `EP-BUILD`. It is complemented, not replaced, by §4.4.1 RT3(b)'s history-blind replay test, which exercises the canonical read and action paths with the timeline store unreadable.

**S0.53 — the classification stays total.** §4.4.3 RT5 (every persisted column of the three stores carries exactly one `ErasureClass`; an unclassified column fails the build) is extended to the new fields of §0.34: `confirmation_of_ref` and `produced_by_intent_token_hash` are `AUDIT_RETAINED`. *Evaluation point:* `EP-BUILD`.

---

## 0.14 The forbidden-key list, stated once

**S0.54 — one union, three enforcement points.** §1.1.1 E3, §2.3.4 K8 and §3.8.2 R3.8.2 each state a different list, and R3.8.2 is phrased as exhaustive while omitting seven keys §2 depends on. The single normative list is their union plus §0.12's deprecated alias:

`arguments`, `payload`, `state` *(outside a declared body enum field)*, `role`, `permissions`, `token`, `tenant_id` *(outside the envelope root)*, `client_id`, `staff_id`, `record_id`, `is_staff`, `is_owner`, `__meRole`, `__meIsStaff`, `__meIsFounder`, `url`, `href`, `endpoint`, `checkout_url`, `return_url`, `provider_ref`, `bridge_method`, `required_verification`, `interaction_model`, `four_eyes`, `fourEyes`, `booking_effect`, `presentation_hint`.

*Mechanism:* one structural validator — a total walk over the serialized value — applied to `WidgetEnvelope`, `WidgetIntentSubmission`, `ChannelProfile`, `NativeBridgeManifest` and `IntentRecord`. *Evaluation points:* `EP-MINT`, `EP-INGRESS`, `EP-REGISTRY-LOAD`.

---

## 0.15 The canonical FUNDAMENTAL RULES table

**S0.55.** Each rule has **one** enforcing mechanism and **one** evaluation point. This table supersedes §3.14 FR-1 … FR-10, §3.13's edge table and every other statement of the same rule; those remain as `[NON-NORMATIVE]` defence-in-depth commentary. *Status:* `[EXISTS]` means the named mechanism is present in the repository today at the path given; `[TO BUILD]` means it is a requirement on the package that ships the IntentGateway.

| # | Rule | The one enforcing mechanism | The one evaluation point | Status |
|---|---|---|---|---|
| **FR-1** | **WIDGET ≠ BUSINESS OWNER** | The effect router is a closed switch whose only write edges are the widget layer's own stores, the three control-registry handlers, and `CanonicalActionIngressService.prepare()`; a build import test asserts the gateway module imports no Prisma model outside the widget layer's own | `EP-INGRESS` Gate 13 | [TO BUILD] over an [EXISTS] ingress |
| **FR-2** | **WIDGET STATE ≠ BUSINESS STATE** | `WidgetIntentSubmission` has no `body` and no state member, and no canonical table holds a column referencing `widget_id` — asserted by a schema test | `EP-INGRESS` (shape) | [TO BUILD] |
| **FR-3** | **BUTTON ≠ AUTHORITY** | Authority is recomputed from scratch from Membership / Staff / verified Client binding / `EntitlementsService` / `AiToolPolicyService.assertCanExecute`; `authority_hint` is read by no server decision | `EP-INGRESS` Gate 6 | policy [EXISTS] — `ai-tool-policy.service.ts`; wiring [TO BUILD] |
| **FR-4** | **CHANNEL IDENTITY ≠ BUSINESS AUTHORITY** | `verificationFloor()` (§0.13) recomputed from the live tables and compared against the server-derived `verification_level`, capped by `profile.max_verification_level`; every actuating class floors at ≥ `BOUND_CLIENT` and every `COMMIT` at ≥ `SESSION_VERIFIED` | `EP-INGRESS` Gate 5 | [TO BUILD] |
| **FR-5** | **WIDGET EVENT → TYPED INTENT → CURRENT AUTHORITY CHECK → CANONICAL OWNER**, no shortcut | One ordered fourteen-gate pipeline (§3.9) is the single ingress for all five carriers (Step 0), with no branch that skips a gate | `EP-INGRESS` | [TO BUILD] |
| **FR-6a** | No widget kind confers **consent** | `subjectCapability(i) ∈ NEVER_CHAT_ACTUATED ⟹ effect === 'HANDOFF' ∧ target.class === 's' ∧ verification_floor ≥ SESSION_VERIFIED` — total, because `handoff_capability_ref` is mandatory and non-null (§3.5 R3.5.1) | `EP-MINT` | [TO BUILD] |
| **FR-6b** | No widget kind confers **booking authority** | A `COMMIT` for a capability with `requiredConfirmationKind === 'BOOKING_CONFIRMATION'` is mintable only onto that kind with a non-null `confirmation_of_ref` and, for `kind !== 'draft'`, a non-null `produced_by_intent_token_hash` (§0.34) | `EP-MINT` | [TO BUILD] |
| **FR-6c** | No widget kind confers **marketing permission** | `b35.confirm` is registered `OWNER_HANDOFF` in `C9_CAPABILITIES` (verified, `c9.registry.ts`), so no bulk-send `COMMIT` is mintable at all; the reachable ceiling is `REQUEST_APPROVAL` / `HANDOFF` | `EP-MINT` | [EXISTS] (the mode) |
| **FR-6d** | No widget kind confers **finance permission** | `requiredConfirmationKind` routes every capability whose `riskFacets` include `'financial'` to `PAYMENT_HANDOFF`, which is gap-blocked with a null `commit_intent`; `SETTINGS_DRAFT` refuses a `finance` `consent_class` (§0.42) | `EP-MINT` | [TO BUILD] over an [EXISTS] registry |
| **FR-6e** | No widget kind confers **tenant authority** | `TenantContextService.assertTenantId` over the record's tenant and the live principal's | `EP-INGRESS` Gate 4 | [EXISTS] |
| **FR-6f** | No widget kind confers **approval** | `AiToolPolicyService.assertCanDecide` against a principal resolved inside the deciding request (§0.46 — role-gated, **not** separation of duties) | `EP-CANONICAL` | [EXISTS] |
| **FR-7** | **Only a final canonical confirmation may cause a booking effect** | The mint-time non-existence of a booking `COMMIT` token before the canonical owner has returned a confirmation body (§0.34) | `EP-MINT` | [TO BUILD] |
| **FR-8** | **No `BUTTON → PROVIDER`** | `IntentTarget` has no member able to hold a URL, host, origin or query string (§0.31), and the provider owner is called by the Action Engine alone | `EP-MINT` | shape [TO BUILD]; boundary [EXISTS] |
| **FR-9** | **No `BUTTON → DATABASE BUSINESS MUTATION`** | `EffectClass` has no `MUTATE`/`EXECUTE` member; the only road to a business row is Gate 14, and `CONTROL` has no Action Engine edge | `EP-MINT` (closed union) | [TO BUILD] |
| **FR-10** | **The LLM never generates chart numbers** | `validateEnvelope` recomputes `sha256(stableActionJson(series))` and requires equality with the `series_digest` the read service returned; every coordinate on both axes is a `Cell`/`Measure` carrying a `fact_ref` | `EP-MINT` | [TO BUILD] (see §0.16 E-20) |
| **FR-11** | **UNKNOWN is never rendered as failure** | The renderer conformance suite: five branches per `Cell`, no `danger`/`destructive`/`alert` token, no error icon, no `role="alert"`, no auto-retry bound to a non-`KNOWN` state | `EP-BUILD` | [TO BUILD] |
| **FR-12** | **Conversation history is never business, consent or booking state** | The erasure-reachability test of §0.52: no field on any path to Gate 11/13/14 or an owner decision route may be classified other than `AUDIT_RETAINED` | `EP-BUILD` | [TO BUILD] |
| **FR-13** | **CHAT-FIRST ≠ CHAT-ONLY** | The emission validator requires a non-null `presentation.fullscreen_detail` on every `FORM` body, every settings-class body and every envelope whose `InputSchema` carries a non-closed field | `EP-MINT` | [TO BUILD] |
| **FR-14** | **Role removal from UX ≠ role removal from security** | Gate 6 reads Membership / Staff / Client binding and never `presentation_mode`, `profile_id` or `a11y_env` | `EP-INGRESS` Gate 6 | policy [EXISTS]; wiring [TO BUILD] |
| **FR-15** | **One interaction contract across platforms** | One gateway, one gate pipeline, one profile registry; a `native-shell` profile that differs from `pwa` in any field other than `native_bridge`, `a11y_env`, `motion`, `text_scale`, `color_scheme`, `viewport_min_css_px` is refused | `EP-REGISTRY-LOAD` | [TO BUILD] |
| **FR-16** | **No C9 contract change, no canonical schema change** | A build test asserting `C9_REGISTRY_HASH` is unchanged, that `RegisteredActionCapabilityV1` gains no field, and that no canonical table gains a column | `EP-BUILD` | [TO BUILD] |

---

## 0.16 Errata — everything else Section 0 settles

| # | Where | What §§1–4 say | Ruling |
|---|---|---|---|
| E-1 | §1.1.1 comments | `// §3 (Authority)`, `// §5 (Intents)`, `// §6 (Lifecycle)`, `// §7 (Presentation)`, `// §4 (Platform and channels)` | **`[NON-NORMATIVE]`**. §0.1's map resolves every reference. |
| E-2 | §1.0 | "Evaluation points. Six, closed." | **VOID.** §0.6's eleven, closed; §0.8's alias map is normative. |
| E-3 | §1.7 K6, §1.8 | "Gate 4" as the floor comparison | **Gate 5.** §0.9. |
| E-4 | §1.8 K8 | "a maximum over **three** total tables", formula with four terms, `audience` parameter with no table | **VOID.** §0.13: arity 2, four terms, no `audience`. |
| E-5 | §1.8 heading, §2.6.16, §2.6.18, §4.5.4 | `required_verification` | **Deprecated alias; MUST NOT appear.** §0.12. |
| E-6 | §2.6.16 SETTINGS.5, §2.6.18 CONSENT.3 | "An emitter-supplied floor is a hint and is overwritten" | **VOID.** No such field exists (§1.1.2 E5, §3.4 R3.4.1). The local two- and three-term formulas are void; §0.13 governs. |
| E-7 | §2.3.1, §2.3.2 | `LocaleText`, `NarrativeText`, K5's four shapes, K5's reinstated absolute, K6's `/^[^0-9]*$/` | **VOID.** §0.18: `LocaleText` ≡ `Phrase`; `NarrativeText` → `Narrative` with a catalogue template id; the numeral-only regex is deleted. |
| E-8 | §2.4 all rows, §2.2 K3 | `CONTROL` absent from `permitted_effects` and from the ordering | **Amended.** §0.20, §0.21: `CONTROL` on all 22 kinds, off the business order. |
| E-9 | §2.6.5 BOOK.5, §3.1 R3.1.1, §3.2.2, §3.12.6 | escape: non-nullable handle, class `NONE`, token null iff `NONE`, `/cancel` on a non-RICH profile | **Reconciled.** §0.25: one escape, `NONE` on `RICH_INTERACTIVE`, `CONTROL`/`control.widget.dismiss` elsewhere, decided at `EP-FIT`. |
| E-10 | §2.6.18 CONSENT.2, §2.6.19 IDENTITY.1–6 | "**every** intent" must carry a floor, a `handoff_capability_ref` and a class-`s` target | **Amended** to "every intent whose `role` is not `'escape'`" (§0.27); otherwise the kind is unmintable. |
| E-11 | §2.2 `KindRule`, §2.3.4 | `allowed_target_classes` cited but undeclared | **Declared** (§0.30), with a total default; `'c'` permitted on no kind. |
| E-12 | §3.3 `ShellRoute`, §2.6.20 PAY.2, §2.6.22 ARTIFACT.1 | five bare literals vs `pay/<session_ref>` and `file/<artifact_ref>` | **Corrected** (§0.31): a closed route enum with one opaque server-minted `param`, never a URL. |
| E-13 | §1.1.1, §2's density caps | `intents: 0..12` vs 15 / 49 / >12 per-element intents | **Reconciled** (§0.28, §0.29): body handles are `intent_ref`s; a per-element handle names one envelope-level intent with a closed selection domain. |
| E-14 | §1.0 `EP-RENDER`, §1.9 H4, §4.1.2 L5 | the renderer verifies `envelope_seal` | **Corrected.** The seal is a keyed HMAC held by three minters (§3.13 E8); shipping the key to every renderer would destroy unforgeability. **At `EP-RENDER` the renderer verifies (i) a recomputed `body_hash` — unkeyed SHA-256 — and (ii) `expires_at`.** `envelope_seal` is verified server-side only, at `EP-INGRESS` before Gate 1 proceeds and at `EP-FETCH` on the timeline read. The renderer's fallback (frozen `text_equivalent` prose plus one `REFINE`) is triggered by a `body_hash` mismatch or expiry. Nothing is lost: a forged envelope a renderer would draw still cannot act. |
| E-15 | §1.9, §2.6.12 | `approval_echo` vs reinstated `approval_binding_echo` | **`integrity.approval_echo` is the sole name.** For an AI-tool approval its `hash` is `AiApprovalRequest.payloadHash`, verified by `assertPayloadHash` (`ai-tool-runtime.service.ts:209,301,1197`). |
| E-16 | §2 K14 vs §3.6.6 R3.6.6 | free input rationed **by kind** vs **by field** | **By field.** R3.6.6 governs: `free_input_justification` is required on any `InputSchema` containing a field of kind `integer`, `decimal`, `date`, `time`, `datetime`, `text` or `phone`, regardless of kind, and every such emission is counted. §2 K14's `input_allowed` column is retained as an **additional** per-kind restriction (`'open_domain'` only for `FORM`), so both fences apply and the ledger counts the larger population. The two counters are one counter, keyed on field kind. |
| E-17 | §2.6.4 SLOT.1 vs §3.10.5 | "two states" vs "exactly three states" | **Two value members plus not-`KNOWN`** (§0.19). `HELD` is absent from both, which is the load-bearing agreement. |
| E-18 | §2.6.5 BOOK.2, §2.6.6 SCHED.2 | `booking_effect: true` registry flag | **VOID** (verified: zero occurrences). §0.33's derivation from existing `RegisteredActionCapabilityV1` fields governs. |
| E-19 | §3.10.1 | "sets `targetKind: 'appointment'` for the create, cancel, reschedule and services capabilities" | **Corrected**: also attendance, duration, fields, four `*.shadow.v1` residuals, `crm.visit.payment.v1` and `occupancy.recovery-options.prepare` — thirteen in all. §0.33's `policyDecision`/`riskFacets` terms make the over-capture safe and correct. |
| E-20 | §1.5 M6 vs §2.6.9 CHART.1 | `rows_digest` recomputed by the projector vs `rows_digest`/`series_digest` **returned by the read service** | **§2's stronger form governs, and its dependency is stated honestly.** The C7/C8 read services do not return digests today; returning them is a **new field on a widget-layer read facade, not a change to any C9 contract** — the facade computes `sha256(stableActionJson(rows))` and `…(series)` on the read path, outside the projector, and the projector cannot reproduce either. Until that facade ships, `CHART` is not emittable. §1.5 M6's projector-side recomputation is retained as defence in depth, `[NON-NORMATIVE]` as a standalone guarantee (it proves only that the body matches the rows the projector held). |
| E-21 | §2 K19 vs §4.4.2 | two per-kind retention tables; no default for `pii_ceiling: 'inherited'` | **§4.4.2 governs**, with §4.4.2 RT4's minimum rule. `'inherited'` resolves at `EP-COMPOSE` to the pii class actually present in the composed body; where nothing resolves, `client_identified` — the shortest window. Fail-closed. |
| E-22 | §3.2.3, §3.14 FR-2 | `Lifecycle.resolution` | **`Lifecycle.delivery: DeliveryRecord`** (§4.1, §4.3) is the sole name; `resolution` is a deprecated alias. |
| E-23 | §3.14 FR-2 | "an emission lint forbids any text equivalent that renders `resolution` as a business assertion" | **Replaced by a decidable predicate:** no `WIDGET_PHRASES` entry and no `NARRATIVE_TEMPLATES` entry may reference any member of `DeliveryRecord`, and the closed delivery-template set is linted for the business predicates §4.3 DR1 enumerates. *Evaluation point:* `EP-BUILD`. |
| E-24 | §2.6.11 STRATEGY.2 | `reversible: Cell<boolean>` "copied from the agent result" | **Corrected.** The only canonical upstream value is the literal `c9Enum('SOURCE_DEFINED')` (`c9.contract.ts:378`), so `reversible` is `NOT_MEASURED` with `reason_code: 'NOT_COLLECTED'` whenever the source is that literal — which is always, today. §3.6.1 R3.6.1 governs; no rule may read `reversible.value` without requiring `state === 'KNOWN'`. |
| E-25 | §2.6.11 | `expected_effect: Measure` | **`Measure \| null`, and MUST be null** unless a `FactUsed` element in `provenance.facts_used` supplies it (§1.3 C3). No capability in the `ORCHESTRATION_RUN` owner class produces one today. |
| E-26 | §2.6.11 owner line | "the alternative shape is reused verbatim from the C9 contract" | **VOID** (verified false: `c9Alternative`, `c9.contract.ts:271–290`, carries none of these fields). The correct source is `AgentResult@1.proposed_action_intents[]` — `risk`, `approval`, `reversibility`, `audience_size`, `rationale`. Downgraded and corrected. |
| E-27 | §2.6.20 PAY.4 | `commit_enabled` | **`commit_allowed`** (§2.2) is the sole name, derived at `EP-REGISTRY-LOAD` from `permitted_effects` and the owner-class resolution. |
| E-28 | §2.6.4 | `freshness_class: 'live'` presented as a `KindRule` field | `freshness_class` is a member of `Lifecycle` (§4.1), derived at `EP-MINT` from the kind's `expires_at_ceiling_s` and the capability TTL. §2.6.4's mention is read as the mandatory derived value for that kind. |
| E-29 | §1.1.1 table vs §1.1.4 | `correlation` classed `E (ids) / M (trace_id)`; `agent_id` marked `C`, but `body_hash` covers `provenance`, not `correlation` | **`agent_id` is class `D`** — derived by the minter from the run's registered agent — not `C`. The `C` class requires a digest, and none covers `correlation`. |
| E-30 | §3.16.2 | "no change to any canonical business schema" (narrowing the owner's "NO schema change") | **The narrowing is recorded, not hidden.** §0.18 residual 1. |
| E-31 | §2 K11 | "exactly four kinds may carry a `COMMIT`" | **Unchanged and preserved**: `BOOKING_CONFIRMATION`, `SETTINGS_DRAFT`, `APPROVAL`, `PAYMENT_HANDOFF`. `FORM` is not among them. This is the one first-edition defect closed cleanly and nothing above touches it. |

---

## 0.17 The NON-NORMATIVE register

**S0.56.** Every statement listed here appears in §§1–4 without a mechanism that can make it true, or with a mechanism this contract cannot name. Each is **hereby prefixed `[NON-NORMATIVE]`** — it survives as rationale and no implementation depends on it — or is **deleted** where it is a false claim about the running system. No implementation may cite one as an enforcing mechanism. The count of unproven *normative* claims is thereby zero, by honest declaration.

**Downgraded to `[NON-NORMATIVE]`:**

1. §2.5's twelve-row ARIA-and-keyboard table, insofar as it is stated as an obligation. The renderer conformance suite defined anywhere in this contract asserts five branches per `Cell` and per-state token bindings; it asserts nothing about `role` attributes, `aria-colindex`, rowgroup structure or per-role keyboard models. §4.8.2's per-kind floor table is the normative accessibility artefact; §2.5 is guidance until the conformance suite is extended.
2. "the five client-preview / PII enforcement points" (§2.6.6 SCHED.4, §2.6.21 MEDIA.2, §3.9 Gate 12, §4.6 NT7). The **count** is unproven — the five are enumerated nowhere. What remains normative: *no widget-layer module may implement PII masking of its own; the projector reaches a capability only through the same service call sites the non-widget read paths use.* *Mechanism:* an import/architecture test. *Evaluation point:* `EP-BUILD`.
3. §2.6.7 CLIENT.2's "the display fence". No display fence is defined in this contract. The normative remainder is `pii_ceiling: 'client_identified'` plus §0.3's `presentation_mode` derivation and §2 K18.
4. §1.6.3 P3's consequence sentence — "the equality is only satisfiable by a whole copy… so it cannot be emitted" — holds only for elements marked `copied`. `facts_origin` is emitter-supplied (`E`) and `facts_digest` does not cover synthesised elements (§1.6.4 P5). §1.6.4 already calls this the design's largest honesty gap; P3's consequence is downgraded so it stops overstating it.
5. §3.13 E8's "the seal key is held by exactly three minters". No minter registry, key-custody mechanism or CI check is named. The normative remainder is §4.1.1 L1's enumeration of the three composer services and the fact that no renderer, adapter or job holds the key — a design requirement on the package, not a checked property.
6. §3.16.3's blast-radius argument ("a compromised renderer can still choose which legal option to submit").
7. §2.8's five self-assessments, §3.16's six honest-register items, §4.10's eight, and §1.10's withdrawal table — all already rationale; confirmed `[NON-NORMATIVE]`.
8. §4.9.3 PR4's editorial-judgment boundary — already declared; confirmed.
9. §4.7 V12's duplex-voice boundary and §4.4.3 RT7's data-subject-rights boundary — both already declare "no mechanism is claimed"; confirmed.
10. §2 K11's "checked independently at ACTION ENGINE INGRESS… by an owner that never trusted the emitter". §0.35 replaces it with what the engine actually enforces.
11. §3.10.3's citation of `readClientActionPrincipal` as an authorisation mechanism. Its own source comment states it is durable attribution, never a bearer credential; it validates prefixes and cardinality only. Downgraded to what it is: a shape-and-attribution check.
12. §3.14 FR-6's marketing row, insofar as it rests on disclosure (`audience_size` carried as a `Measure`, `audience` ordered before `options`). Disclosure is not a fence. §0.15 FR-6c gives the real one: `b35.confirm` is `OWNER_HANDOFF`, so no bulk-send `COMMIT` is mintable.
13. §2.7's readiness table as a *derivation*. It is re-derived in §0.40 over the corrected key sets and is correct there; as stated in §2.7 it rested on three keys that do not resolve.
14. §1.1.1 E4's schema test ("no canonical table may hold a foreign key to `widget_id`"). An FK-absence assertion does not exclude an untyped string column. The load-bearing test is §4.4.1 RT3(b)'s history-blind replay; E4 is retained as a cheap complement.
15. §2.6.11 STRATEGY.4's "may not be emitted on a proactive trigger", which names an evaluation point but no mechanism. The mechanism is §3.2.5 / §4.9.1 PR1's emission validator keyed on `origin.trigger === 'proactive'`, which already covers it; STRATEGY.4 is redundant rather than enforcing.
16. Every occurrence of "[TO BUILD]" as a description of the running system. §3.16.1 already says it; restated here so no reader mistakes a requirement for a capability.

**Deleted as false against the repository (not downgraded):**

17. §2.6.12 APPROVAL.2's four-eyes claim in full (§0.45; verified: zero occurrences, and `canDecide` admits the initiator under both policies).
18. §2.6.13 PROGRESS.3's "`orchestration.run.cancel`… so it passes the registry lookup" (zero occurrences).
19. §2.4 row 13's `orchestration.run.read` as a registry key (zero occurrences).
20. §2.6.6 SCHED.2's `booking.reschedule.propose` (zero occurrences).
21. §2.6.5 BOOK.2's `booking_effect` registry flag (zero occurrences; and the C9 change §3.16.2 forbids).
22. §3.10.3's `canonical-confirmation:v1:<draft_id>` evidence idiom (zero occurrences; and no `draft_id` exists for cancel or reschedule).
23. §3.2.3's "every `CONTROL` submission passes Gate 6 exactly as a `DRAFT` does" (no control key is in `MAYA_AI_TOOL_CATALOG`, so `assertCanExecute` has no definition to evaluate). Replaced by §0.23.
24. §2.6.11's "reused verbatim from the C9 contract" (§0.16 E-26).
25. §2.3.2 K6's "the LLM cannot type a numeral into a widget", as grounded on `/^[^0-9]*$/` (§0.18; «втрое больше» passes it).
26. §2.3.1 K5's absolute sentence, which §1.10 records as withdrawn (§0.18).

---

## 0.18 Residual — what a spine cannot fix

These are **not** resolved by Section 0. Each needs a real edit or an owner decision, and each is named so that no reader mistakes this section for a clean bill.

1. **The owner constraint says "NO schema change"; this contract adds widget-layer stores.** `IntentRecord`, the timeline store, the receipt store, the emission/receipt store, the free-input ledger, the capability-gap ledger and the server-owned draft store are all new and all [TO BUILD]. None is a canonical business table and no canonical row references one, but the constraint as the owner gave it is not met, and §3.16.2 narrows it without saying so. **Owner decision required:** either the constraint means "no *canonical* schema change" — in which case say so — or the widget layer must be built on existing tables, which this design cannot do.
2. **`CHART` is not emittable until a read facade returns `rows_digest` and `series_digest`** (§0.16 E-20). FR-10's mechanism depends on a component that does not exist. This is a real capability reduction and must be scheduled, not assumed.
3. **The self-approval finding (§0.49) is a repository defect this contract cannot fix.** Containing `loyalty.internal.adjust` to a gap-blocked kind reduces its chat reachability; it does not change `canDecide`.
4. **Six of the eight `NEVER_CHAT_ACTUATED` acts have no canonical owner** and the 152-FZ consent machinery that *does* exist in this branch (`action-engine/consent-security-invalidation.contract.ts` and its architecture specs) is named by none of those eight reserved names. When a consent owner is registered under its real name, `WIDGET_CAPABILITY_POLICY` must gain its row **before** any intent for it may be emitted (§0.37); the gap ledger, not the reserved-name list, is what tracks this.
5. **`STEP_UP_VERIFIED` is unreachable** (§1.7 K6): no re-authentication event type exists. Every capability whose derived floor is `STEP_UP_VERIFIED` — including every `restricted` risk tier and every unmapped key under §0.15's fail-closed default — is permanently withheld. Fail-closed and correct, but it is a hole in the product, not a property of the design.
6. **Renderer sandboxing is a convention.** The shipping frontend is a hand-edited single file with no sources and no build script in the repository, so the import-graph allowlist behind §4.2 FR1, §3.16.4 and §0.15 FR-1's CI test cannot run there. Until a build exists, those are discouraged, not proven.
7. **Gate 10 is a shadow gate.** "Three front doors, one function" is measured, not enforced, until a promotion criterion is set.
8. **`GAP-ATTENDANCE-CONFIRM` remains open** (§4.3 DR4): «клиент подтвердил» is not a claim this system can make, and no reminder body may imply it.
---

# Section 0-B — Key-space reconciliation

## 0-B.0 Status, precedence, and how every fact below was obtained

**S0B.1 — status and precedence.** This section is **normative** and carries **the same precedence as Section 0** over §§1–4 and over Annex A. Where 0-B and §§1–4 conflict, 0-B governs. Where 0-B and Annex A conflict, 0-B governs. Where 0-B and Section 0 conflict **on a key-space matter** — which key space a rule is evaluated over, which registry supplies a property, or which function is total over which domain — **0-B governs**, because Section 0 wrote those rules before the key spaces were separated and could not have seen the divergence; everywhere else Section 0 stands unchanged. Every ruling of Section 0 that this section does not name survives verbatim. *Mechanism:* the errata table of §0B.9 is an input to the emission validator, the mint function, the gateway and the CI suites alongside §0.16's; a build test asserts that no implementation reads a clause this section marks **VOID**. *Evaluation point:* `EP-BUILD`.

**S0B.2 — what this section is for, stated plainly.** Section 0 repaired the fences. It wrote them across **three different capability key spaces** without saying so. The mechanisms it named all exist; several of them cannot be evaluated over the keys the rule hands them, and therefore do not do the work claimed. A fence that names a real mechanism which cannot take the key is not a weaker fence — it is **no fence**, with the additional harm that it reads as one. This section publishes the three key spaces, publishes the mapping between them, and re-expresses every conferral fence over the one key space that governs whether an effect happens.

**S0B.3 — verification method: the registries were executed, not grepped.** Every count, membership and property below was obtained by **loading the registry modules in a Node process and enumerating them**, against the working tree at

`/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/maya-identity-consent/maya-saas-backend`

on branch `codex/maya-brain-systemic-release-20260815`. `ActionCapabilityRegistry.list()` was enumerated in full (226 rows); `canonicalProductionPolicyDefinitions()` was enumerated in full (221 rows); `MAYA_AI_TOOL_CATALOG` was enumerated in full (47 rows); `C9_CAPABILITIES` was read from `c9.registry.ts` (47 + 9 = 56 rows). **This matters: a `grep` over the registry source undercounts, because most capabilities are constructed by template functions, not written as literals.** The most consequential instance: `'financial'` appears **8 times as a literal** in `action-engine.registry.ts`, but **12 registered capabilities carry the token**, because two of those literals sit inside templates instantiated three times each. A fence audited by grep over that file would have been audited against the wrong number. *Mechanism:* the totality assertions of §0B.13 and §0B.24 enumerate the registries at process start rather than trusting any transcribed list. *Evaluation point:* `EP-REGISTRY-LOAD`.

**S0B.4 — Annex A's vocabulary is adopted unchanged.** `[EXISTS]`, `[ABSENT]`, `[PARTIAL]`, `[UNENFORCEABLE-TODAY]` and **`NORMATIVE-PENDING`** (§A2) mean here exactly what they mean there, including §A2.2's definition of "no actuating control": a `Limitation` with a non-null `capability_gap_ref`, `remedy_intents` empty, and **no intent of effect `DRAFT`, `REQUEST_APPROVAL` or `COMMIT`**. New prerequisites registered by this section are numbered continuing Annex A's series and are listed in §0B.8.

---

## 0-B.1 The three key spaces (B1)

**S0B.5 — there are three capability key spaces in this system, and they are disjoint in what they govern.** They are named **C9-CAP**, **TOOL-DEF** and **AE-CAP**. No fourth exists. The widget layer's own `CONTROL_REGISTRY` (§0.22) is a fourth *namespace* but not a capability key space: it is closed at three keys, has no registry row anywhere in the backend, and is already handled by §0.22–§0.23; it is listed here for completeness so that the dispatch of §0B.31 is total.

| | **C9-CAP** | **TOOL-DEF** | **AE-CAP** |
|---|---|---|---|
| **Identifier type** | `C9Capability.capabilityKey: string` | `AiToolDefinition.name: string` | `RegisteredActionCapabilityV1.capability: string` |
| **Declared at** | `src/orchestration/c9.registry.ts:52–70` (the type), `:110–160` (the population) | `src/ai-tools/ai-tool.types.ts` (the type), `src/ai-tools/ai-tool.catalog.ts` (`MAYA_AI_TOOL_CATALOG`) | `src/action-engine/action-engine.contract.ts:170–195` (the type), `src/action-engine/action-engine.registry.ts:3444` (`CAPABILITIES`), `:3889` (`ActionCapabilityRegistry`) |
| **Cardinality (verified by enumeration)** | **56** = the 47 `MAYA_AI_TOOL_CATALOG` names + 9 extras | **47** | **226** |
| **Lookup** | `c9Capability(key, domain, registryHash)` — `c9.registry.ts:180` | `AiToolRegistryService.get(name)` | `ActionCapabilityRegistry.get(key)` — `action-engine.registry.ts:3894`; `.list()` — `:3913` |
| **Governs** | the **C9 orchestration run**: `mode` (`READ` / `PROPOSE_ONLY` / `OWNER_HANDOFF`), `resourceClass` (`LOCAL` / `SOURCE_READ` / `SOURCE_HANDOFF`), `domains`, `principalKinds`, `timeoutMs`, `maxInputBytes` / `maxOutputBytes`, `evidencePolicy`, `approvalAdapter`, `idempotencyAdapter` | the **AI-tool surface**: which tool names an LLM principal may see and call — `allowedRoles`, `allowedSurfaces`, `riskTier`, `approvalPolicy`, `requiredFeatures`. Enforced by `AiToolPolicyService.listAllowed` / `.assertCanExecute` (`ai-tool-policy.service.ts:59`) / `.assertCanDecide` (`:97`) | **whether an effect happens.** `actionClass`, `targetKind`, `allowedSourceTypes`, `riskFacets`, `policyKey`/`policyVersion`, `policyDecision`, `autonomyLevel`, `approvalRequirement`, `approvalTtlMs`, `executorKey`, `normalizeInput`, retention. Enforced by `CanonicalActionPolicyResolver.resolve()` (`action-engine.policy-resolver.ts:315`) and `ActionEngineKernel` |
| **Does NOT govern** | **whether any effect happens.** `mode` is a *run mode of a C9 capability*, not an Action Engine gate. `OWNER_HANDOFF` means "the C9 run hands this to an owner"; it is read by no Action Engine code path and appears nowhere under `src/action-engine/` | **whether any effect happens**, and **anything about an Action Engine capability**: `AiToolDefinition` exists only for the 47-name catalogue, so `assertCanExecute(principal, definition)` **cannot be called with an AE-CAP key at all** — there is no definition to pass | the **widget layer's presentation, the C9 run, or the AI-tool surface.** `RegisteredActionCapabilityV1` carries no role, no surface, no `riskTier`, no `approvalPolicy`, and no `mode` |
| **Fail-closed on an unknown key** | `c9Deny('capability_not_registered')` | policy denial (`ForbiddenException`) | `ActionContractError` from `.get()`; `CanonicalActionPolicyRegistry.get()` throws `Canonical policy profile is not registered` (`policy-resolver.ts:198`) |

**S0B.6 — AE-CAP carries two co-keyed tables, and both are total over it.** Besides `RegisteredActionCapabilityV1`, the key space AE-CAP is also the key of **`CanonicalActionPolicyDefinitionV1`** (`action-engine.policy-resolver.ts:72–84`), which carries `actorPolicy`, **`allowedActorRoles: readonly UserRole[]`**, `trustedServiceSourceTypes`, `requiredFeatures`, `permissionCodes`, `approverPolicyKey`, `clientPrincipalTarget`, `validityMs`. It is generated by `canonicalProductionPolicyDefinitions()` (`action-engine.policy-registry.ts:180–220`) **as a total map over `ActionCapabilityRegistry.list()` minus `kernel.test.*`** — verified: 221 definitions for 226 capabilities, the five omissions being exactly the five `kernel.test.*` synthetics. **This is the single most important fact in this section: an authority table keyed on AE-CAP already exists and is already total.** Every fence this section repairs is expressed over one of these two tables.

**S0B.7 — a rule citing a key MUST name its space.** A bare capability string in a normative sentence is **void from this section forward**. The wire and in-memory form is:

```ts
type CapabilitySpace = 'C9' | 'TOOL' | 'AE' | 'CONTROL';

type CapabilityRef =
  | { space: 'C9';      key: string }          // C9Capability.capabilityKey        — 56
  | { space: 'TOOL';    key: string }          // AiToolDefinition.name             — 47
  | { space: 'AE';      key: string }          // RegisteredActionCapabilityV1.capability — 226
  | { space: 'CONTROL'; key: ControlKey };     // §0.22, closed at 3

type ControlKey = 'control.run.cancel' | 'control.widget.dismiss' | 'control.delivery.resolve';
```

`WidgetIntent.capability`, `WidgetIntent.handoff_capability_ref`, `IntentTarget` of class `c`, `IntentRecord.capability`, every row key of `WIDGET_CAPABILITY_POLICY`, and every argument of `subjectCapability`, `subjectFloor`, `requiredConfirmationKind` and `verificationFloor` are typed `CapabilityRef`, never `string`. §0.32's two-space rule is preserved and extended to four: only `REFINE`, `DRAFT`, `HANDOFF` and a class-`c` `NAVIGATE` may carry a `C9` ref; only `COMMIT` and `REQUEST_APPROVAL` may carry an `AE` ref; only `CONTROL` may carry a `CONTROL` ref; **no intent of any effect class may carry a `TOOL` ref** (§0B.41 P-24). *Mechanism:* the discriminated union above, plus `validateEnvelope`'s per-effect membership check against `C9_CAPABILITIES`, `ActionCapabilityRegistry` and `CONTROL_REGISTRY` respectively; a source test asserts zero `capability: string` declarations in the widget layer. *Evaluation points:* `EP-MINT`, `EP-INGRESS` Gate 7, `EP-BUILD`.

**S0B.8 — the spelling relationships, verified.** TOOL-DEF ⊂ C9-CAP **by spelling**: all 47 catalogue names are C9-CAP keys (`c9.registry.ts:110–118` maps the catalogue one-for-one). The 9 C9-only extras are `c7.measurement.read`, `c8.result.read`, `b35.preview`, `b35.status`, `b35.confirm`, `a22.configuration`, `owner_report.status`, `owner_report.download`, `c9.no_action`. **AE-CAP ∩ (C9-CAP ∪ TOOL-DEF) = ∅** — verified by intersection over the enumerated sets; the two spaces share no spelling. A key that resolves in one space and not another therefore cannot be diagnosed by "the key is wrong"; it is **in the wrong space**, and the only way to see that is to name the space.

**S0B.9 — a C9-CAP key and its identically-spelled TOOL-DEF key carry different, independently-authored properties.** `C9Capability.mode` is computed as `tool.riskTier === 'read' ? 'READ' : 'PROPOSE_ONLY'` (`c9.registry.ts:114`), so **no catalogue tool is ever `OWNER_HANDOFF`**; the only two `OWNER_HANDOFF` keys in the whole of C9-CAP are the extras `b35.confirm` and `a22.configuration` (`c9.registry.ts:135–150`). Reading a `mode` as if it were a tool property, or a `riskTier` as if it were a C9 property, is a category error the type of §0B.7 now prevents.

**S0B.10 — no code maps a C9-CAP key to an AE-CAP key. Verified.** `src/ai-tools/` imports nothing from `action-engine.registry` (0 hits). `src/action-engine/` imports nothing from `src/orchestration/` (0 hits). The single edge between the trees is `c9.contract.ts:3` importing `stableActionJson` from `action-engine.identity` — a hashing utility, not a key-space bridge. **The mapping of §0-B.2 therefore does not exist in code and cannot be derived from code; it is a widget-layer table that this contract must publish, populate and keep total.** §0.32's ruling — "the conversion never happens in the widget layer; the canonical draft owner names the Action Engine key the `COMMIT` will carry" — is preserved and is now the *runtime* rule; §0-B.2 is the *build-time* table that says which pairings are admissible at all, so that an owner naming an unexpected AE key is refused rather than trusted.

---

## 0-B.2 The mapping (B2)

**S0B.11 — the mapping table, verified call site by call site.** Each row was established by tracing the AI-tool handler's dispatch (`ai-tool-handler.service.ts:340–440`) through its service to a literal AE-CAP key or a registered constant. A row appears here **only** where that trace completed.

| C9-CAP key (= TOOL-DEF name where marked ‡) | Owner traversed | AE-CAP key | Evidence |
|---|---|---|---|
| `appointments.own.create` ‡ | `AiToolHandlerService.createOwnAppointment` → `AppointmentsService.createForClient` → `CrmService` | `crm.appointment.create.v1` | `ai-tool-handler.service.ts:394`; `crm/crm.service.ts:1073,1275` |
| `appointments.own.cancel` ‡ | → `AppointmentsService.cancelForClient` → `CrmService` | `crm.appointment.cancel.v1` | `ai-tool-handler.service.ts:392`; `crm/crm.service.ts:1551,1649` |
| `appointments.own.reschedule` ‡ | → `AppointmentsService.rescheduleForClient` → `CrmService` | `crm.appointment.reschedule.v1` | `ai-tool-handler.service.ts:396`; `crm/crm.service.ts:1751,2112` |
| `loyalty.internal.adjust` ‡ | → `LoyaltyService.adjustInternalBalance` | `loyalty.internal-adjust.execute.v1` | `ai-tool-handler.service.ts:410`; `loyalty/loyalty.service.ts:205` |
| `expenses.create` ‡ | → `ExpensesService.create` → `P407ExpenseCanonicalCutoverService` | `expenses.create.execute.v1` | `ai-tool-handler.service.ts:384`; `expenses/p4-07-expense-canonical-cutover.service.ts:57`; `action-engine/p4-07-expense-executable.contract.ts:10–14` |
| `expenses.period.complete` ‡ | → `ExpensesService.declarePeriodComplete` → same cutover | `expenses.period-declare.execute.v1` | `ai-tool-handler.service.ts:386`; cutover `:98` |
| `staff.schedule.update` ‡ | → `Package5Wave3CanonicalCutoverService.updateExternalStaffScheduleDay` | `package5.wave3.update-staff-schedule-day.execute.v1` | `ai-tool-handler.service.ts:1701`; `package5-wave3/package5-wave3-canonical-cutover.service.ts:68`; `action-engine/package5-wave3-executable.contract.ts` |
| `settings.update` ‡ | → `DashboardPreferencesService.updateAssistant` → `Package5Wave1CanonicalCutoverService.updateAssistant` | `package5.settings.assistant.execute.v1` | `ai-tool-handler.service.ts:416`; `dashboard-preferences/dashboard-preferences.service.ts:242`; `action-engine/package5-wave1-executable.contract.ts` (operation `assistant_preferences`) |
| `tasks.create` ‡ | → `Package5Wave1CanonicalCutoverService.createTask` | `package5.work-item.task-create.execute.v1` | `ai-tool-handler.service.ts:420`; `package5-wave1-canonical-cutover.service.ts:237` |
| `tasks.complete` ‡ | → `Package5Wave1CanonicalCutoverService.completeTask` | `package5.work-item.task-complete.execute.v1` | `ai-tool-handler.service.ts:422`; cutover `:291` |
| `support.contact-admin.request` ‡ | → wave-1 `request_admin_contact` | `package5.work-item.admin-contact.execute.v1` | `action-engine/package5-wave1-executable.contract.ts` (operation `request_admin_contact`) |
| `notifications.appointments.update` ‡ | → `AppointmentNotificationsService.updateSettings` → wave-1 `appointment_notifications` | `package5.settings.appointment-notifications.execute.v1` | `ai-tool-handler.service.ts:428`; `appointment-notifications/appointment-notifications.module.ts:24` imports `Package5Wave1Module` |
| `b35.confirm` (C9-only, `OWNER_HANDOFF`) | `CanonicalBulkService.request()` | **`communication.bulk-campaign.admit.v2`** | `marketing/canonical-bulk.service.ts:303–318`; `marketing/canonical-bulk.contract.ts:6` |

**S0B.12 — where a mapping does not exist, it is a GAP, and a GAP has no button.** The following are **declared GAPs**. Each emits `capability_gap_ref` and no actuating control (§A2.2). None may be filled by inference, by name similarity, or by a projector's choice at runtime.

| C9-CAP key | Status | Gap key |
|---|---|---|
| `a22.configuration` (`OWNER_HANDOFF`) | **no AE-CAP mapping.** Verified: the only occurrences repo-wide are `c9.registry.ts:146` and `c9.inputs.ts:43`. Two AE capabilities plausibly *cover the same business fact* — `package5.settings.tenant-business.execute.v1` and `package5.wave2.update-tenant-configuration.execute.v1` — and **choosing between them is exactly the inference this rule forbids** | `GAP-TENANT-CONFIG-COMMIT` |
| `b35.preview`, `b35.status` | propose/read only; no actuating counterpart, correctly | — (not a gap; no COMMIT is intended) |
| `settings.read`, `expenses.read`, `tasks.list`, `notifications.appointments.read`, `staff.schedule.read`, `staff.schedule.own.read`, `operations.journal.read`, `company.business-hours.read`, `clients.*`, `catalog.*`, `booking.*.read`, `analytics.*`, `reports.recovered`, `reviews.*`, `inventory.stock.read`, `commerce.*.read`, `referrals.status.read`, `valuations.read`, `customers.count`, `loyalty.own.read`, `appointments.own.list`, `support.integration-status.read`, `c7.measurement.read`, `c8.result.read`, `owner_report.status`, `owner_report.download`, `c9.no_action` | `mode: 'READ'`; no AE-CAP counterpart is expected or admissible | — |
| the eight `NEVER_CHAT_ACTUATED` reserved names | resolve in **no** space (§0.37, §A1.6 — all eight 0 hits) | the eight `GAP-*` keys of §0.37, unchanged |
| `expenses.delete` | **no C9-CAP or TOOL-DEF key exists**, while `expenses.delete.execute.v1` is registered, `ALLOW`, and reachable from `authenticated_request`. An AE capability with no propose key has no admissible `DRAFT` and therefore no admissible `COMMIT` under §0.34 | `GAP-EXPENSE-DELETE` |

**S0B.13 — the mapping table is total in the direction that matters, and the totality is asserted, not assumed.** `AE_PROPOSE_PAIRING` is a widget-layer table of `{ propose: CapabilityRef; ae: CapabilityRef }` rows. At `EP-REGISTRY-LOAD`:

1. every row's `propose.key` must resolve in `C9_CAPABILITIES` and every row's `ae.key` must resolve in `ActionCapabilityRegistry`, or the process does not start;
2. every AE-CAP key on the `AE_WIDGET_COMMIT_ALLOWLIST` of §0B.15 must appear as the `ae` side of exactly one row, **or** carry an explicit `propose: null` together with a `confirmation_kind` of `'APPROVAL'` (the approval-decision case, which has no propose key by construction);
3. a `COMMIT` minted for an AE key whose pairing row's `propose` side is not the capability of the consumed `REFINE`/`DRAFT` record named by `produced_by_intent_token_hash` is refused.

*Mechanism:* the three assertions above. *Evaluation points:* `EP-REGISTRY-LOAD` (1, 2), `EP-MINT` and `EP-INGRESS` Gate 7 (3). *Status:* `NORMATIVE-PENDING` on **P-23** (§0B.41).

---

## 0-B.3 Every conferral fence, re-expressed over AE-CAP (B3)

### 0-B.3.0 The polarity rule, which is the whole repair in one sentence

**S0B.14 — a fence over AE-CAP must be an allowlist. A denylist over `riskFacets` fails open, and is already failing open today.** `riskFacets: readonly string[]` (`action-engine.contract.ts:179`) is an **open vocabulary**: it is not a union, not validated against any closed set, and carries **98 distinct tokens** across the 226 rows. Any fence of the form "refuse when the facet is present" therefore admits every capability that simply does not carry the token — including every capability registered after the fence was written. The measured consequence is in §0B.24. **Every FR-6 fence below is expressed as a positive, closed, build-checked allowlist over AE-CAP, with everything not on it emitting `capability_gap_ref` and no actuating control.** Facet predicates survive only as **build-time vetoes** on the allowlist's contents — they can refuse a row, never admit one.

**S0B.15 — `AE_WIDGET_COMMIT_ALLOWLIST`, the one table every actuating fence reads.**

```ts
interface AeCommitRow {
  ae_key: string;                                  // must resolve in ActionCapabilityRegistry
  confirmation_kind: 'BOOKING_CONFIRMATION' | 'SETTINGS_DRAFT'
                   | 'PAYMENT_HANDOFF' | 'APPROVAL';        // §2 K11's four, unchanged
  family: 'booking' | 'marketing_fanout' | 'money' | 'consent'
        | 'identity' | 'tenant_authority' | 'settings' | 'operational';
  min_verification: VerificationLevel;             // ≥ SESSION_VERIFIED for every row (EFFECT_FLOOR)
  requires_ae_approval: boolean;                   // MUST equal registry.approvalRequirement === 'REQUIRED'
  propose: CapabilityRef | null;                   // §0B.13
}

const AE_WIDGET_COMMIT_ALLOWLIST: Readonly<Record<string, AeCommitRow>>;
const AE_CAPABILITY_GAP_LEDGER: Readonly<Record<string, string /* gap key */>>;
```

**S0B.16 — the totality assertion. 226 rows must be classified; an unclassified row stops the process.** At `EP-REGISTRY-LOAD`, for every `cap` in `new ActionCapabilityRegistry().list()`:

```
row = AE_WIDGET_COMMIT_ALLOWLIST[cap.capability];  gap = AE_CAPABILITY_GAP_LEDGER[cap.capability];
(row XOR gap)                                             else fail    // unclassified ⇒ process does not start
row ⟹ cap.policyDecision === 'ALLOW'                      else fail    // SHADOW_ONLY / DENY are never mintable
row ⟹ cap.allowedSourceTypes.includes('authenticated_request')  else fail
row ⟹ row.requires_ae_approval === (cap.approvalRequirement === 'REQUIRED')   else fail
row ⟹ MONEY(cap)            ⟹ row.confirmation_kind === 'PAYMENT_HANDOFF'     else fail   // veto
row ⟹ BOOKING(cap)          ⟹ row.confirmation_kind === 'BOOKING_CONFIRMATION' else fail  // veto
row ⟹ MARKETING_FANOUT(cap) ⟹ row.family === 'marketing_fanout'               else fail   // veto
row ⟹ CONSENT(cap) ∨ IDENTITY(cap) ⟹ fail unless an explicit §0B.20 / §0B.25 exemption row exists
row ⟹ canonicalProductionPolicyDefinitions() contains cap.capability          else fail
```

*Mechanism:* one start-up loop over the enumerated registry — not over a transcribed list. *Evaluation point:* `EP-REGISTRY-LOAD`. *Status:* `NORMATIVE-PENDING` on **P-23**.

**S0B.17 — the two AE-CAP properties that already bite today, named once.** Both are `[EXISTS]`, both are total over AE-CAP, both are enforced inside `CanonicalActionPolicyResolver.resolve()` before any effect:

- **`allowedSourceTypes`** — `policy-resolver.ts:321`: `if (!capability.allowedSourceTypes.includes(request.sourceType)) throw`. **A widget submission's only honest `ActionSourceType` is `authenticated_request`**; the widget layer may never mint `agent_task`, `scheduler`, `webhook`, `legacy_bridge` or `synthetic_shadow`, and a source test asserts the gateway constructs no other value. Verified consequence: **53 of the 226 registered capabilities are unreachable from a widget by this property alone**, among them `package5.a18.consent-security-invalidation.execute.v1`, whose `allowedSourceTypes` is exactly `['legacy_bridge']`.
- **`policyDecision`** — `policy-resolver.ts:412–417`: a `DENY` capability contributes `capability_policy_denied` and the resolution is `DENY`; a `SHADOW_ONLY` capability's static decision is preserved by `assertResolverOwnsDecision` (`action-engine.ingress.ts:141–159`). Verified distribution over 226: **`ALLOW` 129, `SHADOW_ONLY` 95, `DENY` 2** (`crm.visit.payment.v1`, `kernel.test.denied`).

Intersecting the two: **105 of 226 capabilities are both `ALLOW` and reachable from `authenticated_request`.** That, and not 226, is the surface the allowlist of §0B.15 must classify positively. *Evaluation point:* `EP-CANONICAL`, with `CanonicalActionIngressService.preview()` (`action-engine.ingress.ts:111`) making the same decision readable at `EP-INGRESS`.

### 0-B.3.1 FR-3 — BUTTON ≠ AUTHORITY

**S0B.18 — §0.15 FR-3's named mechanism is inoperative for the actuating classes, and the replacement exists.**

**The defect, verified.** `AiToolPolicyService.assertCanExecute(principal: AiToolPrincipal, definition: AiToolDefinition)` — `ai-tool-policy.service.ts:59–61` — takes an **`AiToolDefinition`** as its second parameter. `AiToolDefinition` is produced only by `AiToolRegistryService` over the 47-name `MAYA_AI_TOOL_CATALOG`. **There is no `AiToolDefinition` for any AE-CAP key** (AE-CAP ∩ TOOL-DEF = ∅, §0B.8), so the call cannot be constructed for a `COMMIT` or a `REQUEST_APPROVAL`. §0.15 FR-3 and §3.9 Gate 6 name it as the authority mechanism for **every** effect class; for the two that actuate, it is **VOID**. This is the same defect §0.23 already found for `CONTROL` and fixed there; it was not carried to `COMMIT`.

**The replacement, which is `[EXISTS]` and is strictly stronger.** Authority over AE-CAP is decided by **`CanonicalActionPolicyResolver.resolve()`** (`action-engine.policy-resolver.ts:315`), which reads `CanonicalActionPolicyDefinitionV1` **keyed on the AE-CAP key** (`:72–84`) and, in `resolveActorPermission()` (`:619`, role test at `:802`):

1. reads a live `Membership` row for `request.actorUserId` inside the deciding request — **never a value the caller supplied**;
2. requires `membership.status === 'active'` **and** `membership.user.status === 'active'`;
3. requires `policy.allowedActorRoles.includes(membership.role)`;
4. requires `evaluateTenantAccessState(tenant)` ∈ {`active`, `trial_active`, `past_due_grace`};
5. requires `EntitlementsService.resolveFeatureRequirements(tenantId, policy.requiredFeatures)` to allow;
6. for a `VERIFIED_CLIENT_CHANNEL` capability, requires `assertConsentChannelBinding` against a live, unrevoked `ClientChannelLink` (`:748–772`);
7. for a client principal, requires `readClientActionPrincipal` plus canonical ownership of the target (`:636–746`);
8. and `CanonicalActionIngressService.assertNoCallerAuthority` (`action-engine.ingress.ts:161`) rejects the request outright if it carries any key outside a closed allowlist — **the caller cannot even name a role**.

**The authority property over AE-CAP is therefore `CanonicalActionPolicyDefinitionV1.allowedActorRoles`, evaluated against a `Membership` read inside the deciding request. Evaluation point: `EP-CANONICAL`.** It is readable at `EP-INGRESS` without side effects via `CanonicalActionIngressService.preview()`, which calls the same `prepare()` and returns the resolved decision.

**Where it is evaluated in the gate order, stated exactly.** `preview()` requires a normalized input, which does not exist before §3.9 Gate 8. **Gate 6 therefore performs the authority check it can perform, and Gate 14 performs the one that binds.** Concretely, §3.9 Gate 6 and §0.15 FR-3 are amended to:

> **Gate 6, for an intent whose `capability.space === 'AE'`:** the submission is refused unless (a) the AE key has a row in `AE_WIDGET_COMMIT_ALLOWLIST`; (b) `ActionCapabilityRegistry.get(key).policyDecision === 'ALLOW'`; (c) `allowedSourceTypes` includes `authenticated_request`; (d) the live principal's role is a member of `canonicalProductionPolicyDefinitions()`'s `allowedActorRoles` for that key; (e) `EntitlementsService` grants every `requiredFeatures` entry. `authority_hint` is not read. **Gate 14 then re-resolves (d) and (e) from scratch inside the canonical request, and Gate 14's answer is the one that governs.** A disagreement between Gate 6 and Gate 14 is refused, counted, and never resolved in Gate 6's favour.
>
> **Gate 6, for `capability.space === 'C9'` or `'TOOL'`** (`REFINE`, `DRAFT`, `HANDOFF`, class-`c` `NAVIGATE`): `AiToolPolicyService.assertCanExecute` as §3.9 already states — it is correct for exactly these, and only these.
>
> **Gate 6, for `capability.space === 'CONTROL'`:** §0.23, unchanged.

*Status:* the **policy resolver is `[EXISTS]`** at `action-engine.policy-resolver.ts`; the **Gate 6 dispatch by key space is `NORMATIVE-PENDING` on P-01 and P-23**. Until both ship, no `COMMIT` and no `REQUEST_APPROVAL` intent is minted at all (§0B.16 admits nothing without the allowlist), so **FR-3 holds today fail-closed: there is no actuating button.** That is the plain statement the owner's bar requires; it is not a claim that a mechanism is running.

**S0B.19 — three honest limits of `allowedActorRoles`, recorded so nobody over-reads it.**

1. **Its default is permissive.** `allowedActorRoles(capability)` (`action-engine.policy-registry.ts:102–177`) is a chain of `capability.startsWith(...)` tests with a final `return TENANT_ACTION_ROLES` (`:177`). `TENANT_ACTION_ROLES` is **twelve roles including `CLIENT`, `CUSTOMER`, `EMPLOYEE`, `STAFF` and `INTEGRATION_SERVICE`** (`:11–24`). Verified: **164 of the 221 policy definitions receive that default.** `allowedActorRoles` is therefore a genuine fence only where a prefix rule names the capability; elsewhere it is nearly vacuous. **This is why §0B.15 is an allowlist with a per-row `min_verification` and not merely "trust the policy registry".**
2. **`permissionCodes` is not evaluated.** It is shape-validated (`policy-resolver.ts:280–290`) and recorded into the attestation evidence (`:914`), and is read by **no decision anywhere**. No rule of this contract may cite it as a fence.
3. **`actorPolicy: 'OPTIONAL_TRUSTED_SERVICE'` admits an actorless call.** When `actorUserId` is absent and `sourceType ∈ trustedServiceSourceTypes`, `resolveActorPermission` returns `allowed: true` with no role check at all (`:778–793`). This is correct for schedulers and bridges and is **irrelevant to the widget layer only because §0B.17 fixes the widget source type to `authenticated_request`, which `canonicalProductionPolicyDefinitions()` explicitly excludes from `trustedServiceSourceTypes` (`policy-registry.ts:185–189`).** That exclusion is load-bearing; a build test asserts it.

### 0-B.3.2 FR-6a — no widget kind confers consent

**S0B.20 — the fence as written is vacuous, and the real consent capability is in AE-CAP under a different name.**

**The defect, verified.** `NEVER_CHAT_ACTUATED` is eight reserved names; **all eight resolve in no key space** (§0.37, §A1.6 — 0 hits each, and `NEVER_CHAT_ACTUATED` itself 0 hits). The predicate `subjectCapability(i) ∈ NEVER_CHAT_ACTUATED` is therefore **total and always false**. FR-6a holds vacuously. Meanwhile the act it exists to fence **is** registered, in AE-CAP: `package5.wave3.record-client-consent.execute.v1`, `policyDecision: ALLOW`, `targetKind: 'client_consent'`, `approvalRequirement: 'NONE'`, `allowedSourceTypes` including `authenticated_request` — and under §0.33's unrepaired `requiredConfirmationKind` it routes to **`SETTINGS_DRAFT`**, a COMMIT-bearing kind. Annex A §A1.6.2 saw this for the one key; §0B.33 shows it is the general case.

**The fence over AE-CAP.** Define, over `RegisteredActionCapabilityV1`:

```
CONSENT(cap) :=  cap.targetKind    ∈ {'client_consent', 'client_consent_security'}
              ∨  cap.actionClass   ∈ {'record_client_consent', 'invalidate_client_consent_authority'}
```

Verified membership, exhaustive over the 226: `package5.wave3.record-client-consent.shadow.v1` (SHADOW_ONLY), `package5.wave3.record-client-consent.execute.v1` (ALLOW), `package5.a18.consent-security-invalidation.execute.v1` (ALLOW, `allowedSourceTypes: ['legacy_bridge']`).

**FR-6a, restated normatively:**

> **No AE capability satisfying `CONSENT(cap)` may appear in `AE_WIDGET_COMMIT_ALLOWLIST`.** A `COMMIT` or `REQUEST_APPROVAL` naming one is refused at mint; the envelope carries a `Limitation` with `capability_gap_ref` and no actuating control. The only widget affordance for a consent decision is a `HANDOFF` of class `s` to `shell.privacy` with `verification_floor ≥ SESSION_VERIFIED`, exactly as §3.5 R3.5.1 requires — the difference being that the antecedent is now **satisfiable**, because `CONSENT(cap)` is a predicate over keys that exist.

**What actually protects the act at the Action Engine, stated honestly, and it is real.** `package5.wave3.record-client-consent.execute.v1` carries `actorPolicy: 'VERIFIED_CLIENT_CHANNEL'` (`policy-registry.ts:194–196`, driven by `verifiedClientChannelCapability`, `client-preferences.contract.ts:77–92`). Its authority is **not a role and not a button**: `resolveActorPermission` requires a `ConsentChannelBinding` validated by `assertConsentChannelBinding` against a live, unrevoked `ClientChannelLink` whose `verificationVersion === 1` and whose three hashes match (`policy-resolver.ts:748–772`). That is precisely "consent requires a verified first-party channel, never a widget event". *Status:* `[EXISTS]`. *Evaluation point:* `EP-CANONICAL`. **It is a fence on the Action Engine, not on the widget layer**, and this contract does not lean on it: the widget-layer fence is the allowlist exclusion above, which fails closed independently.

`package5.a18.consent-security-invalidation.execute.v1` is additionally unreachable from a widget by `allowedSourceTypes: ['legacy_bridge']` (§0B.17) — a second, independent `[EXISTS]` fence over AE-CAP.

**Prerequisite.** The eight reserved names remain `NORMATIVE-PENDING` on **P-22**; §0.37's registration gate is amended to read over `CapabilityRef`, so that a name later registered in AE-CAP must be classified by §0B.16 *before* it may be emitted. Annex A §A1.6.2's `consent_class: 'personal_data'` requirement stands and is now enforced by the allowlist exclusion rather than by §0.42's second condition, which had no row to read.

### 0-B.3.3 FR-6b — no widget kind confers booking authority

**S0B.21 — already over AE-CAP; tightened, and its family predicate published.** §0.33's booking term is `cap.targetKind === 'appointment'`, a mandatory field of `RegisteredActionCapabilityV1` (`action-engine.contract.ts:175`) — the one FR-6 fence Section 0 already expressed over the right space.

```
BOOKING(cap) := cap.targetKind === 'appointment'
```

Verified membership, exhaustive — **13 capabilities**, confirming §0.16 E-19's correction of §3.10.1 and adding the exact dispositions:

| AE key | `policyDecision` | disposition |
|---|---|---|
| `crm.appointment.create.v1` | ALLOW | allowlisted, `BOOKING_CONFIRMATION`, `confirmation_of_ref.kind: 'draft'` |
| `crm.appointment.reschedule.v1` | ALLOW | allowlisted, `BOOKING_CONFIRMATION`, `kind: 'record'` + non-null `produced_by_intent_token_hash` (§0.34) |
| `crm.appointment.cancel.v1` | ALLOW | as reschedule |
| `crm.appointment.attendance.v1`, `.duration.v1`, `.services.v1`, `.fields.v1` | ALLOW | allowlisted, `BOOKING_CONFIRMATION`, `kind: 'record'` + the §0.34 guard. **`attendance` is a staff-recorded fact and is never a client acknowledgement** (§A1.6 P-21) |
| `crm.appointment.{attendance,duration,services,fields}.shadow.v1` | SHADOW_ONLY | not mintable (§0B.16) |
| `crm.visit.payment.v1` | **DENY** | not mintable; also `MONEY(cap)` |
| `occupancy.recovery-options.prepare` | SHADOW_ONLY | not mintable |

Seven of the thirteen are `ALLOW`, which is exactly the `BOOKING_CONFIRMATION` count of §0B.33's table. *Mechanism:* the registry read plus the allowlist veto of §0B.16. *Evaluation points:* `EP-REGISTRY-LOAD`, `EP-MINT`, `EP-INGRESS` Gate 7. *Status:* `NORMATIVE-PENDING` on P-08, P-18, P-23.

### 0-B.3.4 FR-6c — no widget kind confers marketing permission

**S0B.22 — a C9 run mode is not a send fence. The repair, and the second door it exposes.**

**The defect, verified.** §0.15 FR-6c's mechanism is: "`b35.confirm` is registered `OWNER_HANDOFF` in `C9_CAPABILITIES`, so no bulk-send `COMMIT` is mintable at all." `mode: 'READ' | 'PROPOSE_ONLY' | 'OWNER_HANDOFF'` is declared at `c9.registry.ts:56` as a field of `C9Capability` — **a C9 run mode**. It is read by `c9Capability()` and `c9Available()` inside the orchestration module and **by nothing under `src/action-engine/`** (§0B.5, §0B.10). It fences a C9 run. It does not fence a send. Section 0 marked this row `[EXISTS] (the mode)`; the mode exists, the fence does not.

**The capability that actually performs the send.** `MARKETING_FANOUT` over AE-CAP:

```
MARKETING_FANOUT(cap) :=  cap.actionClass ∈ {'deliver_bulk_campaign', 'send_bulk_campaign'}
                       ∨  cap.targetKind  ∈ {'marketing_campaign', 'marketing_client_recipient', 'audience'}
```

Verified membership, exhaustive — **four capabilities**, with the properties that matter:

| AE key | `policyDecision` | `approvalRequirement` | `approverPolicyKey` | `allowedActorRoles` | `allowedSourceTypes` |
|---|---|---|---|---|---|
| **`communication.bulk-campaign.admit.v2`** | ALLOW | **REQUIRED** | **`tenant-owner`** | **`[TENANT_OWNER, BUSINESS_OWNER]`** | `['authenticated_request']` |
| `communication.bulk-slot.admit.v2` | ALLOW | NONE | `none` | `[TENANT_OWNER, BUSINESS_OWNER]` | `['authenticated_request']` |
| **`communication.bulk-campaign.execute.v1`** | ALLOW | **NONE** | **`none`** | **`TENANT_ACTION_ROLES` — all twelve, including `CLIENT`** | `['authenticated_request', 'legacy_bridge']` |
| `communication.bulk-campaign.shadow.v1` | SHADOW_ONLY | NONE | `none` | twelve | four |

**FR-6c, restated normatively.**

> **The bulk-send fence is `communication.bulk-campaign.admit.v2`'s own AE-CAP properties: `approvalRequirement === 'REQUIRED'` with `approverPolicyKey: 'tenant-owner'`, and `allowedActorRoles === [TENANT_OWNER, BUSINESS_OWNER]` with `actorPolicy: 'REQUIRED'` (so no actorless service source may stand in).** The approval is decided by `ActionEngineKernel.decideApproval()` against `CANONICAL_APPROVER_POLICY_ROLES.get('tenant-owner') = {tenant_owner, business_owner}` (`action-engine.kernel.ts:95–96, 583–593`). **Evaluation point: `EP-CANONICAL`. Status: `[EXISTS]`.** This is a real, running, owner-only, approval-bound fence on the capability the widget-layer admission path actually reaches — `CanonicalBulkService.request()` names exactly this key (`marketing/canonical-bulk.service.ts:307`).
>
> **And the widget layer additionally refuses the other three.** `AE_WIDGET_COMMIT_ALLOWLIST` contains **exactly one** capability satisfying `MARKETING_FANOUT`, namely `communication.bulk-campaign.admit.v2`, with `family: 'marketing_fanout'`, `confirmation_kind: 'APPROVAL'`, `requires_ae_approval: true`, `min_verification: SESSION_VERIFIED`. `communication.bulk-campaign.execute.v1`, `communication.bulk-slot.admit.v2` and `communication.bulk-campaign.shadow.v1` are in `AE_CAPABILITY_GAP_LEDGER` under **`GAP-BULK-SEND-DIRECT`** and carry no actuating control. A start-up assertion fails the process if `|{cap : MARKETING_FANOUT(cap) ∧ cap.capability ∈ AE_WIDGET_COMMIT_ALLOWLIST}| ≠ 1`.

**S0B.23 — REPOSITORY OBSERVATION, recorded so no reader believes the widget layer compensates for it.** *This is an observation about the running system, not a widget-contract rule.*

> `communication.bulk-campaign.execute.v1` — the capability whose `executorKey` is `communication.package2.bulk` and whose `actionClass` is `deliver_bulk_campaign` — is registered `ALLOW`, `approvalRequirement: 'NONE'`, `approverPolicyKey: 'none'`, `actorPolicy: 'OPTIONAL_TRUSTED_SERVICE'`, `allowedActorRoles: TENANT_ACTION_ROLES` (twelve roles, `CLIENT` and `CUSTOMER` among them), `allowedSourceTypes: ['authenticated_request', 'legacy_bridge']`. **It is a second door onto the same `actionClass` as the owner-gated, approval-bound admission capability, and it is gated by neither.** Its only occurrence repo-wide is its own registration at `action-engine.registry.ts:3530`; it is reached by no service constant and no call site today — verified. It is nonetheless *registered*, and a registered `ALLOW` capability reachable from `authenticated_request` is one caller away from being live.
>
> **Owner action required outside this contract:** either give `communication.bulk-campaign.execute.v1` the same `allowedActorRoles` and `approvalRequirement` as `communication.bulk-campaign.admit.v2`, or remove it from the registry. This contract does not choose; it contains the key to `GAP-BULK-SEND-DIRECT` and says nothing stronger.

### 0-B.3.5 FR-6d — no widget kind confers finance permission

**S0B.24 — the exact-match test catches four of thirty-nine. The numbers, then the repair.**

**The defect, measured.** §0.33's finance term is `cap.riskFacets.includes('financial')` — an exact array-membership test over an **open, unvalidated string vocabulary** (§0B.14). Enumerated over the registry:

- capabilities carrying `'financial'`: **12 of 226**;
- of those, `ALLOW` **and** reachable from `authenticated_request`: **4** — `loyalty.internal-adjust.execute.v1`, `expenses.create.execute.v1`, `expenses.delete.execute.v1`, `expenses.period-declare.execute.v1`;
- money-mutating capabilities that are `ALLOW` and widget-reachable and **do not** carry the token: **35**.

**Money-mutating AE capabilities that the `'financial'` test misses, in full** — every one `policyDecision: ALLOW` and reachable from `authenticated_request`:

| AE key | facet it carries instead |
|---|---|
| `tenant-billing.checkout.execute.v1`, `tenant-billing.recurring.execute.v1`, `tenant-billing.past-due.execute.v1` | `payment_value`, `tenant_billing` |
| `gift-certificates.purchase.execute.v1`, `customer-subscriptions.purchase-checkout.execute.v1`, `customer-subscriptions.renewal-checkout.execute.v1` | `provider_payment` |
| `gift-certificates.activation.execute.v1`, `gift-certificates.redemption.execute.v1` | `financial_equivalent`, `gift_certificate` |
| `loyalty.legacy-{earn,expire,redeem,refund,import,backfill}.execute.v1`, `loyalty.legacy-{expire,backfill,import}.batch.execute.v1`, `loyalty.redemption-grant.{issue,consume}.execute.v1` | `financial_equivalent`, `customer_value` |
| `referrals.referral-reward-{issue,fulfill}.execute.v1`, `referrals.referral-reward-scheduler-envelope.execute.v1` | `financial_equivalent`, `referral_reward` |
| `value-configuration.{certificate,membership}.{create,update,delete}.execute.v1`, `value-configuration.referral.update.execute.v1` | `financial_equivalent`, `value_configuration` |
| `commerce-credentials.{connect,replace,recheck,disconnect}.execute.v1` | `credential_authority`, `tenant_wide` — **the authority to take payment, which is finance permission in the only sense that matters** |
| `customer-subscriptions.{activation,renewal-activation,usage-sync}.execute.v1` | `customer_value` |
| `cash-declaration.{declare,correct}.execute.v1` | **no money token at all** — `['local','one_target','confirmed_observation','immutable_history']` |

**`cash-declaration.*` is the case that proves the point:** it records a cash position, it is `ALLOW`, it is widget-reachable, and it carries **no** facet a money denylist of any shape could key on. Only a positive allowlist catches it.

**FR-6d, restated normatively — and note that the facet union is a veto, never the fence.**

```
MONEY_FACETS := {financial, financial_equivalent, payment_value, provider_payment, payment_evidence,
                 customer_value, tenant_billing, expense_ledger, gift_certificate, referral_reward,
                 value_configuration, credential_authority, bearer_secret, bearer_claim,
                 bearer_presentation, frozen_discount_entitlement}

MONEY_TARGET_KINDS := {loyalty_account, loyalty_client, loyalty_redemption, loyalty_redemption_grant,
                 loyalty_bulk_batch, gift_certificate, gift_certificate_checkout,
                 gift_certificate_redemption, customer_subscription_term,
                 customer_subscription_checkout, customer_subscription_renewal_checkout,
                 customer_subscription_usage, customer_subscription_scheduler_batch, expense,
                 expense_period, cash_declaration, tenant_billing_checkout, tenant_billing_charge,
                 tenant_billing_access_window, tenant_billing_scheduler_envelope, billing_payment,
                 referral_reward, referral_reward_issuance, referral_reward_batch, referral_program,
                 commerce_integration, tenant_catalog_item}

MONEY(cap) := (cap.riskFacets ∩ MONEY_FACETS ≠ ∅) ∨ (cap.targetKind ∈ MONEY_TARGET_KINDS)
```

Verified: `MONEY` is satisfied by **92 of 226** capabilities and by **39 of the 105** that are `ALLOW` and widget-reachable — against 12 and 4 for the bare token. The complement was inspected in full and contains no money-mutating capability.

> **The fence is: `AE_WIDGET_COMMIT_ALLOWLIST` contains no row whose `confirmation_kind` is other than `'PAYMENT_HANDOFF'` for any `cap` satisfying `MONEY(cap)`, and `PAYMENT_HANDOFF` is gap-blocked with a null `commit_intent` and no button until P-14 ships (§2.6.20 PAY.4, §A1.3 P-14).** Equivalently and operationally: **no money-mutating AE capability is on the allowlist at all in this contract version.** All 92 are in `AE_CAPABILITY_GAP_LEDGER`, keyed to the gap of §0.37 that covers them (`GAP-LOYALTY-REDEEM`, `GAP-COMMERCE-GIFT`, `GAP-TIPS`) or to a gap this section adds: **`GAP-TENANT-BILLING`, `GAP-COMMERCE-CREDENTIALS`, `GAP-VALUE-CONFIG`, `GAP-SUBSCRIPTION`, `GAP-REFERRAL-REWARD`, `GAP-CASH-DECLARATION`, `GAP-EXPENSE-COMMIT`** (§0B.39).
>
> `MONEY` itself is used **only** as the build-time veto of §0B.16 — it can refuse an allowlist row, never admit one. A capability that escapes `MONEY` and is not on the allowlist is still refused, because the allowlist is the fence. **The token is therefore no longer load-bearing, which is the only way a fence over an open vocabulary can be made sound.**

*Mechanism:* the allowlist, the veto, and the start-up totality assertion of §0B.16. *Evaluation points:* `EP-REGISTRY-LOAD`, `EP-MINT`, `EP-INGRESS` Gate 7. *Status:* `NORMATIVE-PENDING` on P-10, P-14, P-23. **Today the outcome is: no money-mutating capability has a button. That is FR-6d satisfied, honestly, by absence.**

### 0-B.3.6 FR-6e — no widget kind confers tenant authority

**S0B.25 — unchanged, and correctly scoped.** `TenantContextService.assertTenantId` over the record's tenant and the live principal's, at `EP-INGRESS` Gate 4, is `[EXISTS]` and is not keyed on any capability space, so no reconciliation is required. It is **reinforced** over AE-CAP by `CanonicalActionPolicyResolver.resolve()`, which loads the tenant row and refuses unless `evaluateTenantAccessState` is in {`active`, `trial_active`, `past_due_grace`} (`policy-resolver.ts:356–398`), and by `assertNoCallerAuthority`, which forbids the request carrying a tenant-bearing field outside the closed allowlist (`action-engine.ingress.ts:161–175`).

The distinct question — *which widget may mutate the tenant object itself* — is a `family: 'tenant_authority'` allowlist matter:

```
TENANT_AUTHORITY(cap) := cap.targetKind ∈ {tenant, tenant_user, internal_provider_user, staff_access,
                                           branch, tenant_branding}
                       ∨ cap.riskFacets ∋ 'tenant_wide'
```

**No capability satisfying `TENANT_AUTHORITY` is on `AE_WIDGET_COMMIT_ALLOWLIST` in this contract version** — `package5.wave2.{suspend-tenant, reactivate-tenant, create-tenant-user, create-provider-user, create-tenant-branch, configure-staff-access, claim-team-owner, update-tenant-configuration, update-tenant-branding, upload-tenant-logo}.execute.v1` are all `ALLOW`, all widget-reachable, and all carry the **permissive twelve-role default** of §0B.19(1). They are in `AE_CAPABILITY_GAP_LEDGER` under **`GAP-TENANT-ADMIN`**. The identity family is fenced the same way:

```
IDENTITY(cap) := cap.targetKind ∈ {auth_session, auth_subject_sessions, auth_identity}
               ∨ cap.actionClass ∈ {link_social_auth_identity, revoke_other_auth_session,
                                    revoke_all_auth_sessions}
```

— `package5.wave2.{revoke-other-session, revoke-all-sessions, link-social-identity}.execute.v1`, all `ALLOW`, all twelve-role, all in `AE_CAPABILITY_GAP_LEDGER` under **`GAP-IDENTITY-SESSION`**, which is the AE-CAP counterpart of §0.37's `GAP-IDENTITY-STAFF-UNBIND` / `GAP-IDENTITY-CLIENT-UNBIND`.

### 0-B.3.7 FR-6f — no widget kind confers approval

**S0B.26 — §0.46's mechanism is in the wrong key space; the AE-CAP mechanism exists and fails closed.**

**The defect, verified.** `AiToolPolicyService.assertCanDecide(definition: AiToolDefinition, requestedByUserId, principal)` — `ai-tool-policy.service.ts:97–98` — takes an `AiToolDefinition`. It cannot be called for an AE-CAP key (§0B.18). §0.46 names it as the mechanism for "who may decide an approval"; for an Action Engine approval — which is every approval this contract's `APPROVAL` kind renders, since §2.6.12's owner class is `ACTION_EXECUTION` — it is **VOID**.

**The replacement, `[EXISTS]`, and strictly stronger.** `ActionEngineKernel.decideApproval()` (`action-engine.kernel.ts:521`):

1. requires `execution.state === PENDING_APPROVAL`, `approvalDecision === PENDING`, `approvalRequirement === 'REQUIRED'` (`:536–545`);
2. requires the durable canonical policy binding — `policyContextHash`, `policyEvidenceJson`, `policyEvaluatedAt`, `policyValidUntil`, `approvalBindingHash` — all non-null (`:546–558`); **no caller-supplied approval flag or hash is accepted anywhere**;
3. requires `approvalExpiresAt > now`, else writes `EXPIRED` / `NOT_EXECUTED` (`:560–575`);
4. reads a live `Membership` for `approverUserId` and requires `status === active` (`:576–592`);
5. requires `approver.role ∈ canonicalApproverRoles(execution)`, which is `CANONICAL_APPROVER_POLICY_ROLES.get(evidence.approval.approverPolicyKey)` — for the one registered policy `'tenant-owner'`, the set `{tenant_owner, business_owner}` (`:95–96`, `:1800–1816`);
6. **an unregistered or absent `approverPolicyKey` throws `CANONICAL_APPROVER_POLICY_INVALID` (`:1810–1815`) — the decision fails closed, it does not default.**

**The approval property over AE-CAP is therefore `RegisteredActionCapabilityV1.approvalRequirement === 'REQUIRED'` selecting a `CanonicalActionPolicyDefinitionV1.approverPolicyKey`, resolved to a role set by `CANONICAL_APPROVER_POLICY_ROLES` and compared against a `Membership` read inside the deciding request. Evaluation point: `EP-CANONICAL`. Status: `[EXISTS]`.** Verified: **19 non-test capabilities carry `approvalRequirement: 'REQUIRED'`, and every one of them resolves `approverPolicyKey: 'tenant-owner'`**; `canonicalProductionPolicyDefinitions()` sets `'none'` for all others and `resolve()` refuses either mismatch (`policy-resolver.ts:323–338`).

**FR-6f, restated normatively:** an `APPROVAL` body's `approve_intent` / `reject_intent` may be minted only when the underlying execution's AE capability has `approvalRequirement === 'REQUIRED'`, its allowlist row has `requires_ae_approval: true`, and the composer's `canDecide` probe — which must call the **AE-CAP** path, never `AiToolPolicyService.canDecide` — returns true for the live principal. Otherwise `blocked_reason` is set per §0.47. §0.46's text stands as the *description* of the guarantee (role-gated approval, **not** separation of duties); only its named mechanism is replaced.

**S0B.27 — two honest limits, recorded.**

1. **The self-approval finding of §0.49 reproduces exactly over AE-CAP.** `decideApproval` compares `approver.role` against the approver-policy role set and **never compares `approverUserId` to the execution's `actorUserId`**. An owner who initiates may approve. §0.46's weaker guarantee is the true one on both key spaces; §0.48's `GAP-SEPARATION-OF-DUTIES` remains the only remedy this contract can offer, and §A4.1 remains the owner decision.
2. **`controlledFixtureMode` widens the approver set.** `action-engine.kernel.ts:583–585`: when set, `approverRoles` becomes `APPROVER_ROLES` — six roles including `administrator`, `tenant_admin`, `platform_owner`, `platform_admin` — instead of the two the canonical policy names. **The fence above holds only while `controlledFixtureMode === false` in production.** A build test must assert the flag is unset outside proof/test harnesses; until it exists this is `[NON-NORMATIVE]` as a guarantee (P-27).

### 0-B.3.8 The restated fundamental-rules table

**S0B.28.** This table supersedes §0.15's rows for FR-3, FR-6a, FR-6c, FR-6d and FR-6f, and restates FR-6b and FR-6e unchanged for completeness. Every other row of §0.15 stands as written.

| # | Rule | Key space | The one enforcing mechanism | Evaluation point | Absent ⇒ |
|---|---|---|---|---|---|
| **FR-3** | BUTTON ≠ AUTHORITY | **AE-CAP** | `CanonicalActionPolicyResolver.resolve()` → `resolveActorPermission()` against `CanonicalActionPolicyDefinitionV1.allowedActorRoles` + `requiredFeatures` + `evaluateTenantAccessState`, over a `Membership` read inside the deciding request; `assertNoCallerAuthority` forbids caller-supplied authority. Gate 6 pre-screens the same key against the allowlist and the same role set | `EP-CANONICAL` (binding); `EP-INGRESS` Gate 6 (pre-screen, via `preview()`) | **no actuating control**: the AE key is not allowlisted, `capability_gap_ref` is emitted, no `DRAFT`/`REQUEST_APPROVAL`/`COMMIT` intent exists |
| **FR-6a** | no kind confers **consent** | **AE-CAP** | `CONSENT(cap)` ⟹ excluded from `AE_WIDGET_COMMIT_ALLOWLIST`, asserted at start-up. Backed at the engine by `actorPolicy: 'VERIFIED_CLIENT_CHANNEL'` + `assertConsentChannelBinding`, and by `allowedSourceTypes: ['legacy_bridge']` for the invalidation capability | `EP-REGISTRY-LOAD` (exclusion), `EP-MINT` (refusal), `EP-CANONICAL` (engine fence) | no actuating control; `HANDOFF` to `shell.privacy` only |
| **FR-6b** | no kind confers **booking authority** | **AE-CAP** | `BOOKING(cap) := targetKind === 'appointment'`; allowlist row must be `BOOKING_CONFIRMATION`; §0.34's `confirmation_of_ref` + `produced_by_intent_token_hash` guard | `EP-REGISTRY-LOAD`, `EP-MINT`, `EP-INGRESS` Gate 7 | no actuating control |
| **FR-6c** | no kind confers **marketing permission** | **AE-CAP** | `communication.bulk-campaign.admit.v2` is the **only** `MARKETING_FANOUT` capability on the allowlist; its own `approvalRequirement: 'REQUIRED'` + `approverPolicyKey: 'tenant-owner'` + `allowedActorRoles: [TENANT_OWNER, BUSINESS_OWNER]` + `actorPolicy: 'REQUIRED'` are the fence. The other three are `GAP-BULK-SEND-DIRECT` | `EP-CANONICAL` (the fence, `[EXISTS]`); `EP-REGISTRY-LOAD` (the cardinality assertion) | no actuating control |
| **FR-6d** | no kind confers **finance permission** | **AE-CAP** | `MONEY(cap)` (facet ∪ targetKind union — **92 of 226**, not the 12 the `'financial'` token catches) is a build-time **veto**; the fence is that **no money-mutating capability is on the allowlist at all**, all 92 being gap-keyed | `EP-REGISTRY-LOAD`, `EP-MINT`, `EP-INGRESS` Gate 7 | no actuating control — which is the state today |
| **FR-6e** | no kind confers **tenant authority** | tenant id, not a capability key | `TenantContextService.assertTenantId`; reinforced by `evaluateTenantAccessState` at the resolver. Separately, `TENANT_AUTHORITY(cap)` ⟹ `GAP-TENANT-ADMIN` and `IDENTITY(cap)` ⟹ `GAP-IDENTITY-SESSION`, no allowlist row | `EP-INGRESS` Gate 4; `EP-CANONICAL` | refuse |
| **FR-6f** | no kind confers **approval** | **AE-CAP** | `ActionEngineKernel.decideApproval()` → `canonicalApproverRoles()` → `CANONICAL_APPROVER_POLICY_ROLES[approverPolicyKey]` vs a live `Membership`; unregistered key ⟹ `CANONICAL_APPROVER_POLICY_INVALID` | `EP-CANONICAL` | the decision throws; the composer nulls the decision intent with `blocked_reason` (§0.47) |

---

## 0-B.4 The verification floor's domain (B4)

**S0B.29 — the defect: the floor's risk term is a TOOL-DEF term applied to an AE-CAP key.** §0.13's `subjectFloor` reads

```ts
const tier = aiToolRegistry.get(key)?.riskTier ?? 'restricted';
```

`aiToolRegistry` is `AiToolRegistryService` over the 47-name catalogue. **For every AE-CAP key this lookup is `undefined` by construction** (AE-CAP ∩ TOOL-DEF = ∅), so the term silently becomes `'restricted'`, and `RISK_FLOOR['restricted'] = STEP_UP_VERIFIED`, which §1.7 K6 and §A1.2 P-12 make **unreachable**. The floor is therefore *technically* total over AE-CAP and *substantively* degenerate: **every `COMMIT` and every `REQUEST_APPROVAL` in the system is permanently withheld by an accident of key-space mixing, not by a policy decision.** Fail-closed, and undiagnosable — the symptom is "nothing commits" with no rule anywhere saying so. §0.13's `subjectFloor` is **VOID** as written.

**S0B.30 — `subjectCapability` returns a `CapabilityRef`.** §3.5's function is retyped; its logic is unchanged:

```ts
function subjectCapability(i: MintedIntent): CapabilityRef | null {
  if (i.capability !== null)             return i.capability;            // already a CapabilityRef (§0B.7)
  if (i.handoff_capability_ref !== null) return i.handoff_capability_ref;
  if (i.target?.class === 'c')           return i.target.ref;            // { space: 'C9', key }
  return null;
}
```

**S0B.31 — `subjectFloor` is dispatched by space, and each branch is total with a named fail-closed default.**

```ts
function subjectFloor(ref: CapabilityRef | null): VerificationLevel {
  if (ref === null) return 'ANONYMOUS';                      // NONE; w/i/s/detail NAVIGATE — §0.13, unchanged
  switch (ref.space) {
    case 'CONTROL': return CONTROL_FLOOR[ref.key];           // §0.22, closed at 3; a missing key fails the build
    case 'TOOL':    return 'STEP_UP_VERIFIED';               // FAIL CLOSED — no intent may carry a TOOL ref (§0B.7)
    case 'C9':      return c9Floor(ref.key);
    case 'AE':      return aeFloor(ref.key);
  }
}

// C9 branch — §0.13's body, unchanged, now explicitly scoped to the space it was written for.
function c9Floor(key: string): VerificationLevel {
  const row = WIDGET_CAPABILITY_POLICY[{ space: 'C9', key }];
  if (row === undefined) return 'STEP_UP_VERIFIED';                       // FAIL CLOSED (S0.15)
  const tier = aiToolRegistry.get(key)?.riskTier ?? 'restricted';         // valid: 47 of the 56 resolve
  return maxLevel(row.min_verification, RISK_FLOOR[tier], CONSENT_CLASS_FLOOR[row.consent_class]);
}

// AE branch — NEW. Total over AE-CAP. Reads only AE-CAP's own mandatory fields.
function aeFloor(key: string): VerificationLevel {
  const cap = actionCapabilityRegistry.tryGet(key);
  if (cap === undefined)                       return 'STEP_UP_VERIFIED';   // FAIL CLOSED — unregistered
  const row = AE_WIDGET_COMMIT_ALLOWLIST[key];
  if (row === undefined)                       return 'STEP_UP_VERIFIED';   // FAIL CLOSED — not allowlisted
  if (cap.policyDecision !== 'ALLOW')          return 'STEP_UP_VERIFIED';   // FAIL CLOSED — SHADOW_ONLY / DENY
  if (!cap.allowedSourceTypes.includes('authenticated_request'))
                                               return 'STEP_UP_VERIFIED';   // FAIL CLOSED — not widget-reachable
  return maxLevel(
    row.min_verification,                              // never below SESSION_VERIFIED (§0B.15)
    AE_AUTONOMY_FLOOR(cap.autonomyLevel),              // total by default, below
    AE_FAMILY_FLOOR[row.family],                       // total over the 8 families
  );
}

// autonomyLevel is typed `string`, not a union (action-engine.contract.ts:183), so this
// table CANNOT be total by type. It is made total by an explicit default.
function AE_AUTONOMY_FLOOR(level: string): VerificationLevel {
  switch (level) {
    case 'L2_CONFIRMED_REQUEST': return 'SESSION_VERIFIED';
    case 'L2_SERVER_POLICY':     return 'SESSION_VERIFIED';
    case 'L3_CANONICAL':         return 'SESSION_VERIFIED';
    case 'L3_OWNER_APPROVED':    return 'SESSION_VERIFIED';
    case 'L0_PROVIDER_DEFERRED': return 'STEP_UP_VERIFIED';   // provider-deferred: never chat-actuated
    case 'L2_5_SHADOW':          return 'STEP_UP_VERIFIED';   // unreachable anyway (policyDecision)
    case 'KERNEL_TEST_ONLY':     return 'STEP_UP_VERIFIED';
    default:                     return 'STEP_UP_VERIFIED';   // FAIL-CLOSED DEFAULT — a new level added
  }                                                           // upstream withholds, it does not admit
}

const AE_FAMILY_FLOOR: Readonly<Record<AeCommitRow['family'], VerificationLevel>> = {
  booking: 'SESSION_VERIFIED',  settings: 'SESSION_VERIFIED',  operational: 'SESSION_VERIFIED',
  marketing_fanout: 'STEP_UP_VERIFIED', money: 'STEP_UP_VERIFIED',
  consent: 'STEP_UP_VERIFIED',  identity: 'STEP_UP_VERIFIED',  tenant_authority: 'STEP_UP_VERIFIED',
};
```

**The seven observed `autonomyLevel` values were obtained by enumeration** — `L2_CONFIRMED_REQUEST` 19, `L2_5_SHADOW` 95, `L0_PROVIDER_DEFERRED` 1, `L2_SERVER_POLICY` 50, `L3_CANONICAL` 42, `L3_OWNER_APPROVED` 14, `KERNEL_TEST_ONLY` 5 — and the `default` branch exists precisely because the field's type cannot forbid an eighth. `AE_FAMILY_FLOOR`'s five `STEP_UP_VERIFIED` rows are deliberate and their meaning is stated plainly: **while P-12 is `[ABSENT]`, `STEP_UP_VERIFIED` is unreachable, so those five families are permanently withheld** — the same outcome §0B.24's allowlist already produces, reached independently, which is what defence in depth means.

**S0B.32 — `verificationFloor` keeps arity 2; `WIDGET_CAPABILITY_POLICY`'s domain is corrected.** §0.13's `verificationFloor(i, kind)` is unchanged except that its third term is `subjectFloor(subjectCapability(i))` with the dispatched function above. §0.14's totality rule is corrected: **`WIDGET_CAPABILITY_POLICY` is keyed on `CapabilityRef`, and is total over `C9_CAPABILITIES` (56 rows) only.** Its `consent_class` and `min_verification` columns are C9/TOOL concepts (`riskTier`, `approvalPolicy`) and have no meaning over AE-CAP; §0.14's requirement that it also cover "every Action Engine capability key reachable by a `COMMIT`" is **VOID** and is replaced by §0B.16's totality assertion over `AE_WIDGET_COMMIT_ALLOWLIST` ∪ `AE_CAPABILITY_GAP_LEDGER`, which is total over all 226.

**S0B.33 — `requiredConfirmationKind` loses its default branch.** §0.33's function is **VOID as a derivation** and replaced by a table lookup:

```ts
function requiredConfirmationKind(aeKey: string): WidgetKind {
  const row = AE_WIDGET_COMMIT_ALLOWLIST[aeKey];
  if (row === undefined) refuseMint('capability_not_allowlisted');   // FAIL CLOSED
  return row.confirmation_kind;
}
```

**Why the derivation had to go, measured.** Applied to the registry as written, §0.33's chain — `financial` ⟹ `PAYMENT_HANDOFF`, else `targetKind === 'appointment'` ⟹ `BOOKING_CONFIRMATION`, **else `SETTINGS_DRAFT`** — routes:

| result | over all 226 | over the 105 `ALLOW` + widget-reachable |
|---|---|---|
| `PAYMENT_HANDOFF` | 4 | 4 |
| `BOOKING_CONFIRMATION` | 7 | 7 |
| **`SETTINGS_DRAFT` (the default branch)** | **118** | **94** |
| not mintable (`SHADOW_ONLY` / `DENY`) | 97 | — |

**Ninety-four of the hundred-and-five widget-reachable actuating capabilities land on `SETTINGS_DRAFT` — a COMMIT-bearing kind — by falling off the end of a two-test chain.** Among them: the bulk marketing send, every tenant-billing charge, every commerce-credential installation, every loyalty-ledger mutation, every gift-certificate redemption, every subscription checkout, every referral reward, tenant suspension, session revocation and consent recording. **`SETTINGS_DRAFT` was not a settings kind; it was the default disposal of the Action Engine.** A fence whose negative branch is "render a commit button" is not a fence. §0.33's `policyDecision`/`riskFacets` terms survive only as the §0B.16 vetoes.

---

## 0-B.5 The four mechanical repairs (B5)

### S0B.34 — one `RoleHint` union: twelve members

§2.5's `RoleHint` has **twelve** members; §4.8's `A11yBlock.role_hint` inlines **eleven**, omitting `'region'` — while §2.6 assigns `region` to six of the twenty-two kinds (`BOOKING_CONFIRMATION`, `APPROVAL`, `SETTINGS_DRAFT`, `CONSENT_STATE`, `IDENTITY_BINDING`, `PAYMENT_HANDOFF`). As written, those six kinds cannot populate `presentation.a11y.role_hint` at all. **The inline union in §4.8's `A11yBlock` is VOID. There is one union, declared once, in §2.5, and `A11yBlock.role_hint` references it by name:**

```ts
type RoleHint =
  | 'group' | 'radiogroup' | 'listbox' | 'table' | 'grid' | 'document'
  | 'status' | 'progressbar' | 'form' | 'region' | 'img' | 'link';   // twelve, closed

interface A11yBlock { role_hint: RoleHint; /* … unchanged … */ }
```

*Mechanism:* the type reference plus a build test asserting `RoleHint` is declared exactly once in the source. *Evaluation point:* `EP-BUILD`.

### S0B.35 — one `role_hint` per kind: `KIND_REGISTRY` owns it, §4.8.2 derives it

§0.1 gives §2 sole ownership of `role_hint`. §4.8.2's `role_hint` column is therefore **derived from `KIND_REGISTRY[kind].role_hint`, never independently authored**; where §4.8.2 currently prints a different token it is **VOID as a `role_hint`**, and its keyboard-model, text-alternative, live-region and non-colour-state columns stand. Seven divergences existed; all seven are resolved in favour of §2, except one where §2's own token contradicts §2.5's definition of it:

| kind | §2.6 | §4.8.2 | resolved | why |
|---|---|---|---|---|
| `STAFF_SELECTOR` | `radiogroup` | `listbox` | **`radiogroup`** | single-select; §4.8.2's "as CHOICE" model is the radiogroup model |
| `TIME_SLOT_SELECTOR` | `listbox` | `grid` | **`listbox`** | §4.8.2's own keyboard model (arrows within a group, PageUp/PageDown across groups) is §2.5's `listbox` row with server group boundaries |
| `BOOKING_CONFIRMATION` | `region` | `document` | **`region`** | §4.8.2's model (focus on the heading, controls in `reading_order`) is §2.5's `region` row verbatim |
| `METRIC` | `status` | `group` | **`group`** | **the one reversal.** §2.5 binds `status` to `role="status"` + `aria-live="polite"`, while §4.8.2 assigns METRIC `live_region: 'off'`; both cannot hold, and an always-announcing metric card is what A-12 exists to prevent. §2.5's `group` row — `role="group"` + `aria-labelledby`, Tab through controls — is what METRIC is. §2.6.8's `status` is **VOID** |
| `APPROVAL` | `region` | `document` | **`region`** | as `BOOKING_CONFIRMATION` |
| `SOURCE_STATUS` | `status` | `table` | **`status`** | the body is `sources[]`, not a `TableSpec`; A-17's table obligations have no artefact to attach to. §4.8.2's `polite` live region is consistent with `status` |
| `SETTINGS_DRAFT` | `region` | `table` + `form` | **`region`** | "table + form" is not a member of the union and is not well-typed; §2.6.16's own sentence — "nothing in this body is input" — excludes `form` |

### S0B.36 — §4.8.2's per-kind floor table, total over twenty-two

§4.8.2 has **seventeen** rows; `CONSENT_STATE`, `IDENTITY_BINDING`, `PAYMENT_HANDOFF`, `MEDIA_PREVIEW` and `ARTIFACT` have none — and §4.8.2's own enforcement sentence says "a kind with no row cannot pass A-21 because the suite has no branch for it", so the five kinds §2.1 added are **unpassable, not merely undocumented**. The five rows:

| kind | `role_hint` | keyboard model | text alternative | live region | non-colour state |
|---|---|---|---|---|---|
| `CONSENT_STATE` | `region` | focus lands on the heading; `change_handoff_intent` is a button in `reading_order`; the escape is always keyboard-reachable | the current decision, when it was recorded, what it permits, what changing it would do, and the sentence naming the verified surface where it can be changed — in full | `polite` | the decision is a word («разрешено» / «запрещено» / «неизвестно»), never a colour and never a switch position |
| `IDENTITY_BINDING` | `region` | one heading; per binding, `manage_handoff_intent` is an in-row button in `reading_order` | per channel: which, since when, what it unlocks, what unlinking would cost, then the handoff sentence | `polite` | `state` as a word («связан» / «не связан» / «ожидает») |
| `PAYMENT_HANDOFF` | `region` | focus lands on the heading; `commit_intent` / `continue_intent` / `dismiss_intent` are buttons in `reading_order`; the escape is always keyboard-reachable | what is bought, the exact amount as a formatted `Measure`, who takes the payment, what returns afterwards, and when the handle expires | `polite` | the amount is prose; a gap-blocked commit renders as a `Limitation` in prose — **never as a disabled-styled button** (§2 K20) |
| `MEDIA_PREVIEW` | `img` | not focusable; `regenerate_intent` and `fullscreen_intent` are ordinary tab stops | text parity `recipe_only`: the recipe (request, parameters, when, producer) plus `alt` | `off` | a not-yet-ready state is a word; the image is described, never only shown |
| `ARTIFACT` | `link` | one tab stop; Enter activates; accessible name = `filename` + `format` + `size_bytes` | text parity `file_facts_only`: filename, format, size, what it contains, whether it contains personal data, when the link expires | `off` | expiry and personal-data presence are words, never icons |

*Mechanism:* §4.8.2's own — the table compiles into the renderer conformance suite as a per-kind fixture set — plus a build assertion that the fixture set has exactly twenty-two branches keyed on `WidgetKind`. *Evaluation point:* `EP-BUILD`.

### S0B.37 — `kindCeiling` and `on_expiry`: one value per kind, total over twenty-two

§4.1.3's table covers seventeen kinds and diverges from §2.6 on two of them. **The shorter ceiling governs** — this follows from §4.1.1 L3 ("bounded by four clocks, whichever is soonest") and §4.4.2 RT4 ("the shortest applicable ceiling wins") and is the fail-closed direction. §4.1.3's `300 s` for `TIME_SLOT_SELECTOR` and `900 s` for `BOOKING_CONFIRMATION` are **VOID**.

**The five kinds §4.1.3 omits all carry a server-minted, expiring handle** — a register read, a binding read, a payment session (`shell.pay`), a signed asset, a signed file (`shell.file`). For every one of them `mark_stale` would leave a dead handle rendered as a live control, which §2 K20 forbids. **`re_resolve` is therefore the only admissible value for all five**, and it is reached by one rule rather than five judgements.

| # | kind | `expires_at` ceiling | `on_expiry` (mandatory) | `flow_ttl_s` |
|---|---|---|---|---|
| 1 | `CHOICE` | 1800 s | `re_resolve` | 1800 when in a flow, else null |
| 2 | `SERVICE_SELECTOR` | 900 s | `re_resolve` | 1800 |
| 3 | `STAFF_SELECTOR` | 900 s | `re_resolve` | 1800 |
| 4 | `TIME_SLOT_SELECTOR` | **90 s**, and ≤ the booking owner's slot-hold TTL | `re_resolve` | 1800 |
| 5 | `BOOKING_CONFIRMATION` | **120 s**, and ≤ the canonical draft's hold TTL | `re_resolve` | 1800 |
| 6 | `SCHEDULE` | 300 s | `re_resolve` | null |
| 7 | `CLIENT_LIST` | 300 s | `re_resolve` | null |
| 8 | `METRIC` | `as_of` + capability freshness window, ≤ 86400 s | `mark_stale` | null |
| 9 | `CHART` | as `METRIC` | `mark_stale` | null |
| 10 | `REPORT` | as `METRIC` | `mark_stale` | null |
| 11 | `STRATEGY_OPTIONS` | revision validity, ≤ 86400 s | `re_resolve` | null |
| 12 | `APPROVAL` | `source_bound` — the approval object's own TTL (`approvalBindingExpiresAt`) | `re_resolve` | null |
| 13 | `PROGRESS` | `source_bound` — the run window, ≤ 3600 s | `re_resolve` | null |
| 14 | `LIMITATION` | 1800 s | `mark_stale` | null |
| 15 | `SOURCE_STATUS` | 1800 s | `mark_stale` | null |
| 16 | `SETTINGS_DRAFT` | 900 s | `re_resolve` | 1800 |
| 17 | `FORM` | 900 s | `re_resolve` | 1800 |
| 18 | **`CONSENT_STATE`** | **300 s** | **`re_resolve`** | null |
| 19 | **`IDENTITY_BINDING`** | **300 s** | **`re_resolve`** | null |
| 20 | **`PAYMENT_HANDOFF`** | **`source_bound` — the `shell.pay` `session_ref` TTL, ≤ 900 s** | **`re_resolve`** | 1800 |
| 21 | **`MEDIA_PREVIEW`** | **`source_bound` — the signed asset TTL, ≤ 3600 s** | **`re_resolve`** | null |
| 22 | **`ARTIFACT`** | **`source_bound` — the `shell.file` link TTL, ≤ 900 s** | **`re_resolve`** | null |

`IDENTITY_BINDING`'s 300 s is not arbitrary: §4.1.1 L4 makes an unlink/relink invalidate every outstanding envelope retroactively, so a long ceiling on a binding display is a contradiction of L4.

*Mechanism:* `KindRule.expires_at_ceiling_s` (§2.2, `number | 'source_bound'`) is populated from this table and from nothing else; `on_expiry` is compiled into the emission validator as a per-kind constant (§4.1.3 L10) and is never an authored field; `KIND_REGISTRY` is a mapped type over `WidgetKind`, so a missing row fails compilation. *Evaluation points:* `EP-REGISTRY-LOAD`, `EP-MINT`.

---

## 0-B.6 `SETTINGS_DRAFT` versus expenses (B6)

**S0B.38 — the conflict.** §0.41 lists `EXPENSE_OWNER` (`expenses.read`, `expenses.create`) among the owner classes `SETTINGS_DRAFT` may carry a `COMMIT` for. §0.42 forbids a `COMMIT` on `SETTINGS_DRAFT` unless `requiredConfirmationKind(aeKey) === 'SETTINGS_DRAFT'` **and** the C9 propose key's `consent_class ∈ {none, communication}`. §0.44 asserts that "`expenses.create` is **not** finance: it records a fact about money already spent, moves nothing".

**S0B.39 — the ruling, verified against `action-engine.registry.ts`: `SETTINGS_DRAFT` may NOT carry a `COMMIT` for `EXPENSE_OWNER`. §0.41's `EXPENSE_OWNER` row is VOID.**

The verified facts:

- `expenses.create` (C9-CAP / TOOL-DEF) maps to **`expenses.create.execute.v1`** (AE-CAP) — §0B.11, traced through `ExpensesService.create` → `P407ExpenseCanonicalCutoverService` → `P4_07_EXECUTABLE_CAPABILITIES.create` (`action-engine/p4-07-expense-executable.contract.ts:10–14`).
- `expenses.create.execute.v1` is registered with **`riskFacets: ['local', 'financial', 'expense_ledger', 'atomic']`**, `policyDecision: ALLOW`, `targetKind: 'expense'`, **`approvalRequirement: 'REQUIRED'`**, `approverPolicyKey: 'tenant-owner'`.
- Its siblings `expenses.delete.execute.v1` (`REQUIRED`) and `expenses.period-declare.execute.v1` (`NONE`) carry the same `['local','financial','expense_ledger', …]` facets.

**The Action Engine registry classifies expense creation as `financial`.** §0.42's first condition therefore already fails on its own terms — `requiredConfirmationKind` returns `PAYMENT_HANDOFF`, not `SETTINGS_DRAFT` — before §0.44's `consent_class` argument is ever reached. **The two rules do not actually conflict; §0.42 already voids §0.41's row, and nobody noticed because nobody evaluated the function against the registry.** §0.44's reasoning is a widget-layer `consent_class` argument about a widget-layer table; it is not wrong about intent, but it has no authority over `riskFacets`, and `riskFacets` is what `requiredConfirmationKind` reads.

Under §0B.24 the outcome is the same and is reached three times over: `MONEY(expenses.create.execute.v1)` holds by **three independent terms** — the `financial` facet, the `expense_ledger` facet, and `targetKind: 'expense'` ∈ `MONEY_TARGET_KINDS`.

**Therefore, normatively:**

> `EXPENSE_OWNER` is **removed from §0.41's enumeration**. `SETTINGS_DRAFT`'s admissible owner classes are `SETTINGS_OWNER`, `NOTIFICATION_PREF_OWNER`, `SCHEDULE_RULE_OWNER`, `TENANT_CONFIG_OWNER`, `TASK_OWNER`, `AUDIENCE_OWNER` — six, not seven — and `TENANT_CONFIG_OWNER` is itself gap-blocked on `GAP-TENANT-CONFIG-COMMIT` (§0B.12) while `AUDIENCE_OWNER`'s only actuating key routes to the `APPROVAL` path of §0B.22, so **two of the six carry no `SETTINGS_DRAFT` commit in this contract version**. `expenses.read` remains a read. `expenses.create`, `expenses.delete` and `expenses.period.complete` carry **no `COMMIT` on any kind**: `expenses.create.execute.v1` and `expenses.period-declare.execute.v1` are in `AE_CAPABILITY_GAP_LEDGER` under **`GAP-EXPENSE-COMMIT`**, `expenses.delete.execute.v1` under **`GAP-EXPENSE-DELETE`** (§0B.12 — it has no propose key at all). Each emits `capability_gap_ref` and **no actuating control**. `draft_class` loses `'expense'` and becomes `'settings' | 'notification_pref' | 'task' | 'schedule_rule' | 'audience'`.

*Mechanism:* §0B.16's start-up assertion (`MONEY(cap) ⟹ confirmation_kind === 'PAYMENT_HANDOFF'`, and no money capability is allowlisted), plus the `EP-REGISTRY-LOAD` assertion that `SETTINGS_DRAFT`'s resolved key set is disjoint from `{cap : MONEY(cap)}`. *Evaluation points:* `EP-REGISTRY-LOAD`, `EP-MINT`, `EP-INGRESS` Gate 7.

**S0B.40 — the honest consequence, stated rather than hidden.** Expense recording — one of the product's real, wanted, already-shipped AI-tool capabilities — **has no widget button in this contract version.** That is a capability reduction, not a design win. It follows mechanically from two independent decisions made elsewhere: the Action Engine's decision to tag `create_expense` `financial`, and this contract's decision that every financial capability routes to a gap-blocked `PAYMENT_HANDOFF`. **The resolution path is a single owner decision, and it belongs in the ledger, not in a widget rule:** either the Action Engine retags expense recording (it moves no money, and `MAX_EXPENSE_RUBLES` already bounds it at `expense-category.ts`, as §0.44 correctly observes), or `PAYMENT_HANDOFF` ships (P-14) and expenses reach a button through it. Until one happens, `GAP-EXPENSE-COMMIT` is the honest state and `EXPENSE_OWNER` on `SETTINGS_DRAFT` is the dishonest one, because the button it promises is refused at Gate 7 in every case.

---

## 0-B.7 Prerequisites registered by this section

**S0B.41.** Continuing Annex A's series, under §A2's `NORMATIVE-PENDING` rule and its fail-closed default.

| # | Component | Depends on it | Status | Package |
|---|---|---|---|---|
| **P-23** | **`AE_WIDGET_COMMIT_ALLOWLIST` + `AE_CAPABILITY_GAP_LEDGER`**, jointly total over `ActionCapabilityRegistry.list()`, with the start-up assertion of §0B.16 | FR-3, FR-6a, FR-6b, FR-6c, FR-6d, FR-6e (the tenant-object half), FR-6f; `requiredConfirmationKind`; `aeFloor`; §0B.13 | `[ABSENT]` — the widget layer does not exist (§A0.5); no allowlist over AE-CAP exists in any form | **K2** (the tables, wave 1) over **K1**'s gap ledger |
| **P-24** | **`CapabilityRef` — the space-qualified capability type**, with the per-effect space rule of §0B.7 | every rule that cites a capability key; `subjectCapability`; `subjectFloor`; `WIDGET_CAPABILITY_POLICY`'s key type; §0.32's key-space rule | `[ABSENT]` — every capability field in §§1–4 is typed `string` | **K2** (wave 1) |
| **P-25** | **`AE_PROPOSE_PAIRING`** — the propose-key ↔ AE-key table of §0B.13, and its three assertions | §0.32's runtime rule (the owner names the AE key); §0.34's `produced_by_intent_token_hash` guard; FR-6b, FR-7 | `[ABSENT]` — and **it cannot be derived from code**: no module maps a C9-CAP key to an AE-CAP key (§0B.10) | **K2** (the table) + **K7** (the booking rows, wave 3) |
| **P-26** | **Gate 6's key-space dispatch** — `AiToolPolicyService.assertCanExecute` for `C9`/`TOOL`; the AE policy pre-screen for `AE`; §0.23's owner-endpoint lock for `CONTROL`; plus the Gate 6 ↔ Gate 14 agreement check | FR-3; §3.9 Gate 6 for every effect class | `[ABSENT]` — the gateway does not exist (P-01). The **AE-side resolver is `[EXISTS]`** at `action-engine.policy-resolver.ts` | **K3** (wave 2) |
| **P-27** | **`controlledFixtureMode === false` in production**, asserted at build | §0B.26's approver-role fence; without it the approver set silently widens from two roles to six (`action-engine.kernel.ts:583–585`) | `[ABSENT]` as an assertion; the flag itself `[EXISTS]` | **K11** (wave 4) |
| **P-28** | **A widget `ActionSourceType` discipline** — a build test asserting the gateway constructs `source.type` only as `'authenticated_request'` | §0B.17's entire `allowedSourceTypes` fence, which is the one AE-CAP property that already excludes 53 of 226 capabilities from the widget path | `[ABSENT]` — the gateway does not exist | **K3** (wave 2) |

---

## 0-B.8 Repository observations

**S0B.42.** *These are findings about the running system, recorded here so that no reader of this contract believes the widget layer compensates for them. None is a widget-contract rule.*

1. **`communication.bulk-campaign.execute.v1` is an ungated second door onto `deliver_bulk_campaign`** — §0B.23, in full.
2. **164 of 221 canonical policy definitions receive the permissive twelve-role default**, `TENANT_ACTION_ROLES`, which includes `CLIENT`, `CUSTOMER`, `EMPLOYEE`, `STAFF` and `INTEGRATION_SERVICE` (`action-engine.policy-registry.ts:11–24, 177`). The role fence over AE-CAP is real where a prefix rule names the capability and nearly vacuous elsewhere. Among those receiving the default: `package5.wave2.suspend-tenant.execute.v1`, `package5.wave2.revoke-all-sessions.execute.v1`, `package5.wave2.create-tenant-user.execute.v1`, `package5.wave3.install-crm-credentials.execute.v1`, `loyalty.legacy-redeem.execute.v1`, `gift-certificates.redemption.execute.v1`.
3. **`permissionCodes` is validated and attested but never evaluated** (`policy-resolver.ts:280–290`, `:914`). It reads as an authorisation mechanism and is not one.
4. **`riskFacets` is an open, unvalidated string vocabulary** — 98 distinct tokens across 226 rows, with no closed union and no registration discipline. Any downstream consumer that keys a decision on an exact token membership inherits §0B.24's defect. This contract now keys none.
5. **`ActionEngineKernel.decideApproval()` does not compare the approver to the initiator** — §0B.27(1), reproducing §0.49 and §A4.1 over AE-CAP.
6. **`crm.visit.payment.v1` is `policyDecision: DENY` and carries the `financial` facet** — the payment fence of §0.4(b) is real and running at the Action Engine, independently of anything the widget layer does. This one is a credit, recorded so the register is not read as uniformly negative.

---

## 0-B.9 Errata — what this section voids

| # | Where | What it says | Ruling |
|---|---|---|---|
| **EB-1** | §0.13 `subjectFloor` | `aiToolRegistry.get(key)?.riskTier ?? 'restricted'` applied to any capability key | **VOID.** A TOOL-DEF term over an AE-CAP key is always `undefined` ⇒ `restricted` ⇒ the unreachable `STEP_UP_VERIFIED`. §0B.31's dispatched `subjectFloor` governs. |
| **EB-2** | §0.14 | `WIDGET_CAPABILITY_POLICY` must be total over "the C9 canon **and** every Action Engine capability key" | **VOID** as to the AE half. Its columns are C9/TOOL concepts. §0B.32: total over the 56 C9 keys; §0B.16's assertion covers the 226 AE keys. |
| **EB-3** | §0.15 FR-3, §3.9 Gate 6 | `AiToolPolicyService.assertCanExecute` as the authority mechanism for every effect class | **VOID for `COMMIT` and `REQUEST_APPROVAL`** — the call cannot be constructed for an AE-CAP key. §0B.18 governs; §3.9 Gate 6 is amended to dispatch by space. |
| **EB-4** | §0.15 FR-6a, §3.5 R3.5.1 | `NEVER_CHAT_ACTUATED` membership as the consent fence | **Preserved but vacuous** — all eight names resolve in no space. §0B.20 adds the `CONSENT(cap)` allowlist exclusion over AE-CAP, which is satisfiable. |
| **EB-5** | §0.15 FR-6c, §0.17 item 12 | `b35.confirm` is `OWNER_HANDOFF`, "so no bulk-send `COMMIT` is mintable at all"; status `[EXISTS] (the mode)` | **VOID.** `C9Capability.mode` (`c9.registry.ts:56`) is a C9 run mode, read by nothing under `src/action-engine/`. §0B.22 governs. |
| **EB-6** | §0.15 FR-6d, §0.33 | `cap.riskFacets.includes('financial')` as the finance fence | **VOID as a fence.** It catches 12 of 226 (4 of the 105 reachable) and misses 35 money-mutating reachable capabilities. Retained only as a §0B.16 veto. §0B.24 governs. |
| **EB-7** | §0.15 FR-6f, §0.46 | `AiToolPolicyService.assertCanDecide` as the approval mechanism | **VOID for Action Engine approvals.** §0B.26 governs. §0.46's *description* of the guarantee (role-gated, not separation of duties) stands. |
| **EB-8** | §0.33 | `requiredConfirmationKind`'s `return 'SETTINGS_DRAFT'` default branch | **VOID.** It routes 118 of 226 capabilities — 94 of the 105 reachable — to a COMMIT-bearing kind by falling off a two-test chain. §0B.33 governs. |
| **EB-9** | §0.41 | `EXPENSE_OWNER` among `SETTINGS_DRAFT`'s owner classes | **VOID.** §0B.39: `expenses.create.execute.v1` carries `riskFacets: ['local','financial','expense_ledger','atomic']`; `GAP-EXPENSE-COMMIT`. |
| **EB-10** | §4.8 `A11yBlock` | the inline eleven-member `role_hint` union | **VOID.** One union, §2.5's twelve. §0B.34. |
| **EB-11** | §2.6.8 | `METRIC` `role_hint` `status` | **VOID.** `group`. §0B.35 — `status` implies `aria-live="polite"` by §2.5, contradicting §4.8.2's `live_region: 'off'`. |
| **EB-12** | §4.8.2 | the `role_hint` column, where it diverges from §2 | **VOID as a `role_hint`**; derived from `KIND_REGISTRY`. The other four columns stand. §0B.35. |
| **EB-13** | §4.8.2 | the seventeen-row table | **Amended to twenty-two.** §0B.36. |
| **EB-14** | §4.1.3 | `TIME_SLOT_SELECTOR` 300 s; `BOOKING_CONFIRMATION` 900 s | **VOID.** 90 s and 120 s — §2.6.4 and §2.6.5, the shorter values, per L3 and RT4. §0B.37. |
| **EB-15** | §4.1.3 | the fourteen-row (seventeen-kind) ceiling and `on_expiry` table, declared "mandatory per kind" | **Amended to twenty-two.** §0B.37. |
---

# Section 0-C — closure errata

## 0-C.0 Status, precedence, and method

**S0C.1 — what this section is, and the two certification rounds that shaped it.** Section
0-B closed the key-space defect and the four mechanical repairs. Two further rounds of
independent adversarial certification of the **assembled** contract (spine + 0-B + §§1–4 +
Annex A) then ran, each with three certifiers reading the artefact in full and executing the
registries rather than grepping them.

| Round | Filed | Distinct root causes | Outcome |
|---|---|---|---|
| **Round 3** — against spine + 0-B + body + annex | 7 structural, 0 security, 8 unproven | 6 structural, 4 unproven | Closed by **EC-1 … EC-10** |
| **Round 4** — against the assembled contract **including** a first draft of this section | 16 structural, **2 security**, 6 unproven | 5 repairs of EC-2 … EC-9 themselves, plus 6 new | Closed by the amendments in place above and by **EC-11 … EC-16** |
| **Round 5** — against the repaired section, four lenses, adjudication complete | 10 structural, **0 security**, 6 unproven filed → **4 structural confirmed**, 0/0 | 3 dangling identifiers this section introduced, plus 1 found while repairing them | Closed in place and by **EC-17** |
| **Round 6** — four lenses, adjudication complete | 16 structural, **0 security**, 3 unproven filed → **8 structural confirmed**, 0/0 | all 8 in **one paragraph**, §0C.22-ter, over 3 type-level defects | Closed in place |
| **Round 7** — four lenses, adjudication complete | 23 structural, 3 security, 5 unproven filed → **8 structural + 1 unproven confirmed**, 0 security | 7 defects, all type-level or spelling, all in this section | Closed in place; see §0C.17-ter and §0C.22-quater |
| **Round 8** — four lenses; adjudication incomplete, so its filed counts were used directly | 23 structural, **0 security**, 5 unproven filed | **all four lenses: fundamental rules HOLD, 0 security** — round 7's FR-3/FR-4 defects closed. Two "the repair is inert" defects | Closed in place; see §0C.10-bis and §0C.17-quater |
| **Round 9** — four lenses, batched adjudication | 7 structural, **0 security**, 3 unproven filed → **1 structural + 2 unproven confirmed** | 3 defects, all surfaced *by* the totality claims this section makes | Closed in place; see §0C.22-sexies, §0C.22-septies, §0C.28-quater |
| **Round 10** — four lenses; adjudication blocked by a usage limit, so its filed counts were used directly | 14 structural, 1 security, 3 unproven filed | 11 defects: 5 stale cross-references this section had left behind, 6 substantive | Closed in place; see §0C.28-quinquies and **EC-18** |
| **Residual close-out** — the sixteen EC-20 residuals, all adjudicated in the main context | 16 filed → **16 confirmed, 0 refuted** | 13 structural, 3 unproven; none security | Closed in place; see **EC-21** |
| **Final pass** — four lenses, every finding adjudicated in the main context | 16 structural, **0 security**, 3 unproven filed → **19 findings, 11 distinct defects, all confirmed** | nine were in text written in rounds 9–10; two (`AuthorityHint`, `IntentRecord.priority`) were older | Closed in place; see **EC-19** |

**The final pass is the one that found the two oldest defects**, and both were of the class this
section states as a rule. `AuthorityHint` is a **non-nullable member of every `WidgetIntent`**
that feeds `body_hash`, and no shape has ever declared it — two occurrences in 6451 lines, one of
them the declaration that names it. And `FLOOR_EXEMPT` reads `i.priority` while `IntentRecord`
declares no such member, so §0.16's Gate 5 — which "recomputes `verificationFloor()` from the
live tables and refuses on **any** difference" — could not have recomputed the exempt branch at
all: every exempt intent would have diverged and been refused, silently inverting the erratum
that created it. Nine further defects were in the newest text, which is where every round has
found them.

**Round 10's six substantive findings were all of one shape — a rule this section made total,
meeting a path it had not walked.** Gate 6 dispatched on `record.capability`, which §3.2 fixes
**null for every `HANDOFF`**, so the C9 branch would have been skipped for the effect class
whose subject is most often a C9 key. `PROGRESS`'s declared interactive path still named
`steps[].unknown`, a member §0.19 deleted. The escape verb is required in `reading_order` by
three separate accessibility clauses and appears in **no** kind's `interactive_paths`, so K22's
set-equality rule and those clauses could not both hold. `accessible_name_suffix` was typed one
string per kind when `CLIENT_LIST`'s applies to bulk intents and not to row refs. `MomentTemplate`
was normative and undeclared. And `RUN_OPENING` was not ref-nullable though `subjectCapability`
returns null. The five remaining were this section's own stale cross-references — "six members"
after a seventh was added, a `§9.1` citation for a `§1.3` shape, an errata row still describing
a flat `ANONYMOUS` after round 7 changed the code beneath it.

**Round 9's three findings are the best argument for why this section declares things total.**
Each was invisible until a totality claim forced the question: `nameSourceOf` declared total
over `InteractiveRef` exposed that **`TIME_SLOT_SELECTOR`'s declared interactive path
`groups[].slots[].slot_ref` had no member that could denote it** — K22's set-equality rule was
unsatisfiable for the booking flow's central kind — and that **`STRATEGY_OPTIONS.alternatives[]`
is not an `OptionItem`** and declares no `label`. The `accessible_name_suffix` default exposed
that four §4.8.2 rows already require named content *in the accessible name*, so an empty
default was a contradiction rather than a default. And the `c9_domain` refusal exposed that
**`correlation.agent_id` is null by construction on the run-less capability-read path**, so the
refusal as written would have made every C9 capability-read envelope unmintable.

**Round 7 found two that mattered more than their class suggests**, and both were in this
section's own repairs. `MAYA_AI_TOOL_CATALOG_BY_NAME` was declared a `ReadonlyMap` and then
**bracket-indexed** in two places, so `def` would always have been `undefined`: in `c9Floor`
the TOOL-DEF risk term would have silently vanished for all 47 catalogue keys, and in EC-11's
Gate 6 dispatch the `assertCanExecute` branch would have been **dead for all 56**, dropping
every C9 key onto a branch that tests no role, surface, feature or risk tier. And
`FLOOR_EXEMPT` returned a flat `ANONYMOUS`, which zeroed a subject's **own** floor —
`control.run.cancel` is `CONTROL_FLOOR: BOUND_CLIENT` and §0.24 mints it as a `CONTROL`
intent. Round 6 had noted that second one as a residual on the ground that "no clause mints it
at priority 0"; round 7 filed it as a conferral defect, and round 7 was right. **A fence that
holds because no current clause exercises the hole is not a fence.**

**Round 6's shape is the useful signal.** Every one of its eight confirmed findings landed in
a single paragraph — `nameSourceOf`, the newest text in the section — and reduced to three
type errors: two interfaces named `REPORT`/`SCHEDULE` where §2.6.10 and §2.6.6 declare
`ReportBody`/`ScheduleBody`; two branches returning a `Phrase` object where §0.18 requires
`.rendered`; and a row-header lookup keyed on the envelope when REPORT's
`sections[].table: TableSpec | null` means one envelope may hold many tables. Nothing
elsewhere in the section survived adjudication, and **EC-1 … EC-5 were each independently
confirmed closed**. The same round also caught a floor **raise** the first draft of EC-2 had
introduced (§0C.32).

Round 5 is worth reading for what it did **not** find: **0 security-contract violations and
0 unproven normative claims survived adjudication**, and all four lenses independently
confirmed that `FLOOR_EXEMPT` cannot carry an actuating intent — one of them by enumerating
`C9_CAPABILITIES` in process to confirm that exactly one row has `resourceClass: 'LOCAL'`,
which is what makes EC-4's escape hatch a structural property rather than a name on a list.
What it **did** find was three identifiers this section itself introduced without declaring —
`c9Registry.get`, `c9Capability`'s `domain` argument, and `intentOf` — the same defect class
for the third round running, which is why §0C.11-bis's rule is stated as a rule and not as a
remark.

Round 4 is the more important of the two, because **four of the ten errata in this section's
first draft did not close their own defect, and one of them opened a security hole.** They
are corrected in place rather than layered over, and each correction says what the first
draft got wrong:

- **EC-3** compared identities across two disjoint key spaces (§0C.13-bis).
- **EC-4** keyed its exemption on four `role` values §3.1's closed union does not declare,
  and its capability clause would have excluded the two `REFINE` intents it existed to admit.
- **EC-5**'s start-up assertion demanded a uniqueness that its own field definition forbids,
  so the process could never have started (§0C.20).
- **EC-6** named a carrier — `a11y.accessible_name` — that `A11yBlock` does not declare and,
  being one block per envelope, could not have carried per-control (§0C.22-bis).
- **EC-9** keyed **Gate 8-R on `profile_id`**, which R3.8.3 declares advisory and not an
  authority input — handing the caller the switch that disables a readback on a spoken
  commit. This was filed as a **security-contract violation** by two independent lenses, and
  it was correct (§0C.26-bis).

This section introduces no new research. Every repair is the remedy the finding that raised
the defect named for it, and every repository fact it relies on was re-verified here by
executing the registries.

**S0C.2 — precedence.** Where this section conflicts with Section 0, Section 0-B, §§1–4 or
Annex A, **this section governs**, and §0C.13 records exactly what it voids. Where it is
silent, those documents stand unchanged. It creates no capability, widens no envelope,
adds no C9 or Action Engine registry field, and changes no C6–C9 canonical business
contract.

**S0C.3 — method, stated so a reader can repeat it.** Every count and every field in this
section was obtained by loading the module and enumerating it in process:
`new ActionCapabilityRegistry().list()` → **226**;
`canonicalProductionPolicyDefinitions()` → **221**;
`MAYA_AI_TOOL_CATALOG` → **47**; `C9_CAPABILITIES` → **56**.
Two facts a grep would have reported wrongly, and which are load-bearing below:
`RegisteredActionCapabilityV1` has **no** `clientPrincipalTarget` member at all — the field
is declared on `CanonicalActionPolicyDefinitionV1` (`action-engine.policy-resolver.ts:78`),
a different type in a different file — and `C9Capability.mode` and `.resourceClass` are
**closed unions** in the type system (`c9.registry.ts:56,68`), unlike AE-CAP's
`autonomyLevel`, which is typed `string`.

---

## 0-C.1 EC-1 — the four appointment-detail rows leave the allowlist

**S0C.4 — the defect.** §0B.13(2) requires every AE-CAP key on `AE_WIDGET_COMMIT_ALLOWLIST`
to be the `ae` side of exactly one `AE_PROPOSE_PAIRING` row, **or** to carry `propose: null`
together with `confirmation_kind === 'APPROVAL'`. §0B.21 allowlists
`crm.appointment.attendance.v1`, `.duration.v1`, `.services.v1` and `.fields.v1` with
`confirmation_kind: 'BOOKING_CONFIRMATION'` and `confirmation_of_ref.kind: 'record'`. The
three clauses cannot all hold:

1. §0B.11 is the published propose↔AE mapping and states that a row appears "only where
   that trace completed". It has thirteen rows. Its three appointment rows are
   `appointments.own.{create,cancel,reschedule}` → `crm.appointment.{create,cancel,reschedule}.v1`.
   **None of the four is named.**
2. No propose key for the four can exist. Enumerated in process,
   `MAYA_AI_TOOL_CATALOG`'s entire appointment family is
   `appointments.own.{list,create,cancel,reschedule}` plus the two settings keys
   `notifications.appointments.{read,update}`; the nine C9-only extras (§0C.8) contain
   no appointment key. **The one near-miss is named here so that nobody reaches for
   it:** `catalog.services.read` is a READ of the service *catalogue*, not a propose
   key for `crm.appointment.services.v1`, which mutates one appointment's service
   list. Pairing them would be precisely the name-similarity inference §0B.12
   forbids.
3. §0B.12 forbids filling a missing mapping "by inference, by name similarity, or by a
   projector's choice at runtime", and FR-16 forbids adding a C9-CAP key.
4. The `propose: null` escape is gated on `confirmation_kind === 'APPROVAL'`, which
   contradicts the `BOOKING_CONFIRMATION` the same section assigns.

So §0B.13's assertion set fails at `EP-REGISTRY-LOAD` and the process does not start. This
is fail-closed — FR-6b holds and no forbidden edge is constructible — but it is an
unsatisfiable conflict between two same-precedence normative clauses, and §0B.12 applies
the **opposite** disposition to the structurally identical `expenses.delete`: "an AE
capability with no propose key has no admissible `DRAFT` and therefore no admissible
`COMMIT` under §0.34" → `GAP-EXPENSE-DELETE`.

**S0C.5 — the ruling.** §0B.21's four allowlist rows are **VOID**. The four capabilities
move to `AE_CAPABILITY_GAP_LEDGER` under one new key, **`GAP-APPOINTMENT-DETAIL-COMMIT`**,
for the reason §0B.12 already gives for `expenses.delete`. `AE_WIDGET_COMMIT_ALLOWLIST`'s
`BOOKING_CONFIRMATION` membership is therefore **three** — `crm.appointment.create.v1`
(`kind: 'draft'`), `.reschedule.v1` and `.cancel.v1` (`kind: 'record'` + the §0.34 guard) —
and §0B.21's closing sentence, which equated the seven `ALLOW` booking capabilities with
§0B.33's count, is amended to say that **three of the seven are allowlisted and four are
gapped**. §0B.33's measurement table is a measurement of §0.33's void derivation and is
unchanged.

**S0C.6 — why this direction and not the other, with the security colour verified.** The
alternative repair — relaxing §0B.13(2) — was rejected on measured grounds:

| capability | `policyDecision` | `clientPrincipalTarget` | `allowedActorRoles` | `actorPolicy` |
|---|---|---|---|---|
| `crm.appointment.create.v1` | ALLOW | `'create_appointment'` | twelve (`TENANT_ACTION_ROLES`) | `OPTIONAL_TRUSTED_SERVICE` |
| `crm.appointment.reschedule.v1` | ALLOW | `'appointment'` | twelve | `OPTIONAL_TRUSTED_SERVICE` |
| `crm.appointment.cancel.v1` | ALLOW | `'appointment'` | twelve | `OPTIONAL_TRUSTED_SERVICE` |
| **`crm.appointment.attendance.v1`** | ALLOW | **none** | twelve | `OPTIONAL_TRUSTED_SERVICE` |
| **`crm.appointment.duration.v1`** | ALLOW | **none** | twelve | `OPTIONAL_TRUSTED_SERVICE` |
| `crm.appointment.services.v1` | ALLOW | `'appointment'` | twelve | `OPTIONAL_TRUSTED_SERVICE` |
| **`crm.appointment.fields.v1`** | ALLOW | **none** | twelve | `OPTIONAL_TRUSTED_SERVICE` |

Three of the four carry **no** `clientPrincipalTarget`, all seven receive the permissive
twelve-role `TENANT_ACTION_ROLES` default including `CLIENT` and `CUSTOMER` (§0B.19(1)),
and `resolveActorPermission` applies **no target-ownership test on the `actorUserId`
branch** (`action-engine.policy-resolver.ts:780–815`). Relaxing the pairing requirement
would therefore put a tenant-wide appointment mutation behind a client-role button.
Independently, Annex A §A1.6 P-21 rules that `attendance` is a staff-recorded fact and
never a client acknowledgement, so that row could not stand even if a pairing existed.
*Note on `actorPolicy: 'OPTIONAL_TRUSTED_SERVICE'`:* it admits an actorless call only for
`sourceType ∈ trustedServiceSourceTypes`, and §0B.17 fixes the widget source type to
`authenticated_request`, which `canonicalProductionPolicyDefinitions()` excludes from that
set. The widget path is unaffected by it; it is recorded so the table is not over-read.

**S0C.7 — the added assertion.** §0B.16's start-up set gains one line, the booking sibling
of the marketing cardinality rule:

```
row ⟹ BOOKING(cap) ⟹ cap.capability is the `ae` side of exactly one AE_PROPOSE_PAIRING row   else fail
```

*Mechanism:* the start-up loop. *Evaluation point:* `EP-REGISTRY-LOAD`. *Status:*
`NORMATIVE-PENDING` on **P-23**, **P-25**.

---

## 0-C.2 EC-2 — the C9 verification-floor branch stops calling a throwing accessor

**S0C.8 — the defect, verified at the artefact.** §0B.31 declares `subjectFloor`
"dispatched by space, and each branch **total** with a named fail-closed default", repairs
the AE branch completely, and re-enacts §0.13's body verbatim on the C9 branch:

```ts
const tier = aiToolRegistry.get(key)?.riskTier ?? 'restricted';   // valid: 47 of the 56 resolve
```

That comment is not a validity claim; it is a concession that nine do not. And the optional
chain is inoperative: `AiToolRegistryService.get()`
(`maya-saas-backend/src/ai-tools/ai-tool-registry.service.ts:58–73`) **never returns a
nullable** — it builds its map from `MAYA_AI_TOOL_CATALOG` alone (`:49–52`) and throws
`NotFoundException{ai_tool_not_found}` for any name outside it. So `?? 'restricted'` is
unreachable and, for the nine, `c9Floor` **raises** instead of returning a
`VerificationLevel`. `verificationFloor()` — FR-4's one mechanism under §0.55 and §0B.28 —
is partial over C9-CAP, and every `REFINE`/`DRAFT`/`HANDOFF`/class-`c` `NAVIGATE` naming one
of the nine raises at `EP-MINT` and again at Gate 5. This is exactly the defect EB-1
declares fatal, left standing one branch over.

The nine, enumerated in process (`C9_CAPABILITIES` minus the catalogue's 47 names), with the
two C9-CAP fields that will replace the borrowed TOOL-DEF term:

| C9-CAP key | `mode` | `resourceClass` |
|---|---|---|
| `c7.measurement.read` | `READ` | `SOURCE_READ` |
| `c8.result.read` | `READ` | `SOURCE_READ` |
| `b35.preview` | `PROPOSE_ONLY` | `SOURCE_HANDOFF` |
| `b35.status` | `READ` | `SOURCE_READ` |
| `b35.confirm` | `OWNER_HANDOFF` | `SOURCE_HANDOFF` |
| `a22.configuration` | `OWNER_HANDOFF` | `SOURCE_HANDOFF` |
| `owner_report.status` | `READ` | `SOURCE_READ` |
| `owner_report.download` | `READ` | `SOURCE_READ` |
| `c9.no_action` | `READ` | `LOCAL` |

**S0C.9 — the consequence that made this the first-ranked structural defect.**
`STRATEGY_OPTIONS`'s `no_action_option.select_intent` is MANDATORY, `priority: 0` and
"never dropped by degradation" (§2.6.11 STRATEGY.1), and its only owner-class key is
`c9.no_action` — one of the nine. Under the clause as written that intent's floor is a
throw, so it is withheld at §4.5.4 step 1 with no `reachable_via`, and §4.5.5 C4 converts
the emission into a `LIMITATION`/`HANDOFF`-only envelope: **`STRATEGY_OPTIONS` is
unemittable**, contradicting §0.40's seventeen and §A1.2.1's corrected sixteen. The same
term permanently withholds `CLIENT_LIST` (`b35.preview`/`b35.status`), `METRIC` and `CHART`
(`c7.measurement.read`, `c8.result.read`), `PROGRESS` and `ARTIFACT`
(`owner_report.status`/`.download`) and the `a22.configuration` handoff.

**S0C.10 — the ruling.** §0B.31's `c9Floor` is **VOID as written** and replaced. The C9
branch reads C9-CAP's own mandatory fields, exactly as `aeFloor` reads AE-CAP's, and the
TOOL-DEF risk term is retained **only where it applies** — as a pure data lookup against the
catalogue array, never through the throwing service:

```ts
// C9 branch — total over all 56 C9-CAP keys. Calls no throwing accessor.
function c9Floor(ref: CapabilityRef): VerificationLevel {
  const cap = c9Registry.tryGet(ref.key);                 // pure lookup over C9_CAPABILITIES
  if (cap === undefined)  return 'STEP_UP_VERIFIED';      // FAIL CLOSED — unregistered
  const row = WIDGET_CAPABILITY_POLICY[capKey(ref)];
  if (row === undefined)  return 'STEP_UP_VERIFIED';      // FAIL CLOSED — unclassified (S0.15)

  // TOOL-DEF's risk term applies to the 47 C9-CAP keys that are also catalogue names and to
  // no others. Where it does not apply it is REPLACED by terms that do (§0B.14's polarity
  // doctrine) — it is neither silently strictest nor silently weakest.
  const def  = MAYA_AI_TOOL_CATALOG_BY_NAME.get(ref.key);  // ReadonlyMap.get — never throws
  const risk = def === undefined ? 'ANONYMOUS' : RISK_FLOOR[def.riskTier];

  return maxLevel(
    row.min_verification,
    risk,
    C9_MODE_FLOOR(cap.mode),                              // total by type; default kept anyway
    C9_RESOURCE_FLOOR(cap.resourceClass),                 // total by type; default kept anyway
    CONSENT_CLASS_FLOOR[row.consent_class],
  );
}

function C9_MODE_FLOOR(mode: string): VerificationLevel {
  switch (mode) {
    case 'READ':          return 'ANONYMOUS';         // reads carry their floor in min_verification
    case 'PROPOSE_ONLY':  return 'SESSION_VERIFIED';  // a proposal is composed for a known session
    case 'OWNER_HANDOFF': return 'SESSION_VERIFIED';  // the owner surface adds its own step-up
    default:              return 'STEP_UP_VERIFIED';  // FAIL-CLOSED DEFAULT — a widened union
  }
}

function C9_RESOURCE_FLOOR(rc: string): VerificationLevel {
  switch (rc) {
    case 'LOCAL':          return 'ANONYMOUS';        // touches no source
    case 'SOURCE_READ':    return 'ANONYMOUS';        // §0C.11(4) — a read's protection is its
                                                      // own row plus Gate 6, never a blanket
    case 'SOURCE_HANDOFF': return 'SESSION_VERIFIED';
    default:               return 'STEP_UP_VERIFIED'; // FAIL-CLOSED DEFAULT — a widened union
  }
}
```

**S0C.11 — three properties of the replacement, each checkable.**

1. **Total, and total for a stated reason.** `mode` and `resourceClass` are closed unions in
   the type system (`c9.registry.ts:56,68`), so both tables are total *by type*. The
   `default:` branches are retained as fail-closed guards against a future widening —
   the mirror image of §0B.31's reasoning for `AE_AUTONOMY_FLOOR`, whose `default:` exists
   because `autonomyLevel` is typed `string` and therefore *cannot* be total by type.
   Observed distributions over the 56: `mode` READ 41 / PROPOSE_ONLY 13 / OWNER_HANDOFF 2;
   `resourceClass` SOURCE_READ 40 / SOURCE_HANDOFF 15 / LOCAL 1.
2. **No floor is lowered for the 47 — and the nine are a deliberate, named reduction.**
   The first draft of this paragraph asserted "no floor is lowered" and offered a build
   assertion quantified over `C9-CAP ∩ TOOL-DEF` — that is, over exactly the 47 keys where
   nothing changed. That proved the uninteresting half. Stated honestly and in two parts:

   - **For the 47 catalogue names**, the new formula **adds** two terms and removes none,
     and the risk term is the same value from the same data, so
     `c9Floor_new(key) ≥ c9Floor_0.13(key)` pointwise **by construction**. Verified aside:
     the catalogue's 47 `riskTier` values are read 35 / medium_write 7 / low_write 3 /
     high_write 2 — **zero `restricted`** — so the risk term never yielded
     `STEP_UP_VERIFIED` and was never the thing protecting them.
   - **For the nine**, §0.13's literal reading raised and its charitable reading gave
     `'restricted'` ⇒ `STEP_UP_VERIFIED`. The new branch gives them `SESSION_VERIFIED`
     (eight) and `ANONYMOUS` (one, `c9.no_action`). **That is a reduction, and it is the
     point of the erratum**: `STEP_UP_VERIFIED` is unreachable while P-12 is `[ABSENT]`
     (§0B.31), so the prior value was not a fence but a permanent withholding that made
     five widget kinds unemittable (§0C.9). A floor that cannot be met protects nothing; it
     only hides the capability.

   **The build assertion is therefore quantified over all 56, against a recorded vector:**

   ```
   declare const C9_FLOOR_BASELINE: Readonly<Record<string, VerificationLevel>>;  // 56 rows,
                                                                    // pinned in reviewed code
   ∀ key ∈ C9-CAP :  c9Floor({ space: 'C9', key }) ≥ C9_FLOOR_BASELINE[key]   // build assertion
   ```

   `C9_FLOOR_BASELINE` is the **post-EC-2** vector, pinned so that no later edit may lower
   any of the 56 without changing a reviewed constant. The nine reductions relative to
   §0.13 are enumerated in the table of §0C.8 and are **the only** floor reductions this
   erratum makes.
4. **`SOURCE_READ` contributes `ANONYMOUS`, and that is a correction of this erratum's own
   first draft, not a concession.** It first read `SESSION_VERIFIED`, which would have raised
   the floor of **40 of the 56** C9-CAP keys — every `SOURCE_READ` row. §0.13 settled that
   exact question in the opposite direction and gave the reason: `RISK_FLOOR['read'] =
   ANONYMOUS` because "a read capability's protection is `WIDGET_CAPABILITY_POLICY[key].min_verification`
   plus Gate 6, not its risk tier, and `CHANNEL_IDENTITY` would make every guest-chat and
   public-read envelope fail its own floor, contradicting §4.5.3's `ANONYMOUS_CHAT` /
   `PUBLIC_READ` tiers". A blanket `SESSION_VERIFIED` is **stricter than the value §0.13
   rejected**, so it would have broken those two channels harder, through a different term —
   a raise is as much a defect as a reduction when it is imposed by a term that has no
   business carrying it. With `ANONYMOUS`, a read's floor is again `max(row.min_verification,
   RISK_FLOOR[tier], CONSENT_CLASS_FLOOR[row.consent_class])` — §0.13's own design, reached
   through the dispatched branch. `WIDGET_CAPABILITY_POLICY` is total over all 56 with a
   fail-closed default, so each read still carries whatever level its own row sets.

   This also **strengthens** the monotonicity argument of (2) rather than weakening it: with
   both C9-native terms returning `ANONYMOUS` for reads, they are identity elements under
   `maxLevel`, so `c9Floor_new(key) ≥ c9Floor_0.13(key)` continues to hold pointwise over the
   47 by construction — no term was removed, and none of the added terms can pull a floor
   down. `C9_FLOOR_BASELINE` is pinned over the corrected vector.

5. **The nine now resolve to real levels** — and this claim is true only because §0C.10-bis
   reconciled `c9Floor`'s arity with its dispatcher and its policy-table lookup. Left as
   first drafted, the function would have returned its fail-closed `STEP_UP_VERIFIED` for all
   56 and this sentence would have been false. A second build assertion states the outcome
   directly, which the monotone guard of (2) cannot:
   `∀ key ∈ C9-CAP : c9Floor({space:'C9', key}) !== 'STEP_UP_VERIFIED' ∨ key ∈ DELIBERATELY_WITHHELD`,
   where `DELIBERATELY_WITHHELD` is the empty set in this contract version — so any key
   evaluating to the fail-closed level fails the build rather than silently withholding., and the five kinds §0C.9 named become emittable:
   `c9.no_action` → `ANONYMOUS` (READ + LOCAL: the mandatory "do nothing" option, which must
   be offerable on every tier including `ANONYMOUS_CHAT` — a contract that makes declining
   harder than proceeding is inverted); the three `SOURCE_HANDOFF` keys `b35.preview`,
   `b35.confirm` and `a22.configuration` → `SESSION_VERIFIED`; and the five `SOURCE_READ`
   keys — `c7.measurement.read`, `c8.result.read`, `b35.status`, `owner_report.status`,
   `owner_report.download` — take whatever their own `WIDGET_CAPABILITY_POLICY` row and
   consent class require, by (4). The owner-only fence on the
   bulk send is **not** weakened by this: it is `communication.bulk-campaign.admit.v2`'s own
   `approvalRequirement: 'REQUIRED'` + `approverPolicyKey: 'tenant-owner'` +
   `allowedActorRoles: [TENANT_OWNER, BUSINESS_OWNER]` at `EP-CANONICAL` (§0B.22, `[EXISTS]`),
   plus `AE_FAMILY_FLOOR['marketing_fanout'] = STEP_UP_VERIFIED` on the AE branch, which is
   unreachable while P-12 is `[ABSENT]`. The proposal becomes visible; the send does not.

*Mechanism:* the replacement function plus the build assertion of (2). *Evaluation points:*
`EP-MINT`, `EP-INGRESS` Gate 5. *Status:* `NORMATIVE-PENDING` on **P-11**, **P-24**.
**No C9 registry field is added, so `C9_REGISTRY_HASH` (`c9.registry.ts:177`) is untouched
and FR-16 holds.**

**S0C.10-bis — `c9Floor`'s arity is fixed once, and §0B.31's dispatch and signature are
amended to match.** Three sites disagreed: §0B.31 dispatched `c9Floor(ref.key)` and declared
`function c9Floor(key: string)`, while EC-2's replacement takes a `CapabilityRef` — it must,
because `WIDGET_CAPABILITY_POLICY` is keyed on a ref (§0B.32) and the policy row is one of its
five terms. A string argument cannot produce that row. **§0B.31's `case 'C9': return
c9Floor(ref.key)` is amended to `c9Floor(ref)`, and its `function c9Floor(key: string)`
signature is VOID and replaced by §0C.10's.** §0C.11(2)'s build assertion is restated over refs
for the same reason. Left unreconciled, `c9Floor` would have returned its fail-closed
`STEP_UP_VERIFIED` for **all 56** — the repair would have been inert, and §0C.11(5)'s claim
that the nine now resolve to real levels would have been false.

**S0C.11-ter — `AuthorityHint` is declared here, because §3.1 names it and no shape carries
it.** `WidgetIntent.authority_hint: AuthorityHint` is a **non-nullable member of every intent**,
and `intents.map(stripIntentToken)` feeds `body_hash` (§1.9 H1) — yet `AuthorityHint` has exactly
two occurrences in this contract, that declaration and a prose mention in §2.3.3 K7, and no
shape, table or enum defines it. §1.1.1 E2's closed-shape validator must refuse "any key not
declared in this contract, at any depth", so as specified the only admissible value is the empty
object: the field is useless rather than dangerous, but it is undefined at a `body_hash` input,
which §0C.11-bis's own rule forbids. It is declared with a closed member set carrying **no
authority vocabulary**:

```ts
interface AuthorityHint {           // RENDERING ONLY. Never read by any server decision (FR-3).
  emphasis: 'primary' | 'secondary' | 'muted';
  disabled_because: ReasonCode | null;   // MUST EQUAL intent.enabled.reason_code, and is null
                                         // exactly when intent.enabled.state === 'KNOWN'.
                                         // Both are inside body_hash, so without that equality
                                         // a disagreeing pair would be minted, sealed and
                                         // rendered with nothing to adjudicate between them.
                                         // Asserted in validateEnvelope at EP-MINT.
}
```

Both members are mint class **M**, so a composer cannot author them and an LLM cannot compose
them, and neither names a role, a capability, a tenant or a verification level — the four
vocabularies that would turn a rendering hint into a second answer to "who am I". §3.14 and FR-3
are unchanged: the field is read by no server decision, and the property test asserting a
byte-identical intent set across all four presentation modes covers it.

**S0C.11-bis — the two accessors this section names are declared here, and the two
that already exist may not be substituted for them.** A normative clause must not
name an identifier no shape declares, so both are declared, and the reason neither
existing accessor can do the work is stated rather than left to a reader:

- **`c9Capability(key, domain, registryHash)`** (`c9.registry.ts:178–192`) **throws**
  `c9Deny('capability_not_registered')`, additionally demands a `C9Domain` argument,
  and refuses on a registry-hash mismatch. It is a **run-admission** function, not a
  lookup. Using it in a floor derivation would reproduce EC-2's defect exactly — a
  floor that raises instead of returning a level — and would make the floor depend on
  *which domain is asking*, which §0.13's arity-2 rule forbids.
- **`AiToolRegistryService.get(name)`** throws for the same class of reason (§0C.8).

```ts
// DECLARED BY THIS CONTRACT. Pure, total, non-throwing, derived once at module load
// from frozen released arrays. Neither adds a field, a row, or a registry entry.
const C9_CAP_BY_KEY: ReadonlyMap<string, C9Capability> =
  new Map(C9_CAPABILITIES.map((c) => [c.capabilityKey, c]));
const MAYA_AI_TOOL_CATALOG_BY_NAME: ReadonlyMap<string, AiToolDefinition> =
  new Map(MAYA_AI_TOOL_CATALOG.map((d) => [d.name, d]));
const AE_CAP_BY_KEY: ReadonlyMap<string, RegisteredActionCapabilityV1> =
  new Map(new ActionCapabilityRegistry().list().map((c) => [c.capability, c]));

// A CapabilityRef is an OBJECT and cannot key a Record, exactly as InteractiveRef cannot
// (§0C.22-bis). §0B.32 says WIDGET_CAPABILITY_POLICY "is keyed on CapabilityRef"; the key
// form that makes that constructible is declared here and used at every site.
type CapabilityRefKey = `${CapabilityRef['space']}:${string}`;      // e.g. 'C9:b35.preview'
declare function capKey(ref: CapabilityRef): CapabilityRefKey;      // `${ref.space}:${ref.key}`
                    // total over the four spaces, and injective because `space` is one of four
                    // fixed tokens and ':' is the only separator, so no two refs collide.

c9Registry.tryGet            = (key: string) => C9_CAP_BY_KEY.get(key);
actionCapabilityRegistry.tryGet = (key: string) =>
  AE_CAP_BY_KEY.get(key);   // over new ActionCapabilityRegistry().list(); §0B.31 names it
```

`C9_CAPABILITIES` and `MAYA_AI_TOOL_CATALOG` are **read, never modified**, and
`C9_REGISTRY_HASH` is a hash of the array rather than of any map derived from it, so
FR-16 holds. This paragraph also declares §0B.31's `actionCapabilityRegistry.tryGet`,
which that section named without declaring. *Status:* `NORMATIVE-PENDING` on **P-24**.

---

## 0-C.3 EC-3 — an APPROVAL decision becomes mintable

**S0C.12 — the defect.** §0.34 generalises `confirmation_of_ref` expressly "so cancel,
reschedule **and approval** become mintable", assigning `kind: 'approval'` to an APPROVAL
decision. Its guard then reads: a `COMMIT` whose `confirmation_of_ref.kind !== 'draft'` is
mintable **only** when `produced_by_intent_token_hash` names a consumed **`REFINE`/`DRAFT`**
record whose capability is the canonical owner's own propose key. An approval object is
produced by a `REQUEST_APPROVAL` — §3.2's effect table gives it "approval object only",
§2.4 row 12 gives `APPROVAL` the permitted effects NONE/NAVIGATE/COMMIT/HANDOFF so it
carries no `REQUEST_APPROVAL` of its own, and §3.11.1 points the decide intent at "the
requesting `IntentRecord`". A `REQUEST_APPROVAL` record is neither a `REFINE` nor a `DRAFT`,
so the guard is **unsatisfiable and both decision intents are unmintable on every APPROVAL
body** — while §0.47 forbids the composer from nulling them for any reason but the three it
enumerates. §0B.13(3) repeats the REFINE/DRAFT-only condition, and §0B.13(2)'s `propose: null`
allowance makes it strictly worse: a null propose side can never equal the capability of a
consumed record, so (3) refuses unconditionally.

**S0C.13 — the ruling.** §0.34's guard and §0B.13(3) are amended in one place — the set of
**producing** record kinds is widened by exactly one member, for exactly the
`kind: 'approval'` case:

> A `COMMIT` whose `confirmation_of_ref.kind !== 'draft'` is mintable **only** when
> `produced_by_intent_token_hash` is non-null and names a **consumed record**, as follows —
> the producing effect class and the identity compared are fixed **together**, because the
> two cases live in different key spaces:
>
> | `confirmation_of_ref.kind` | producing record's effect | identity that must hold |
> |---|---|---|
> | `'record'` (reschedule, cancel) | `REFINE` or `DRAFT` | the record's **C9** capability equals the `propose` side of the `COMMIT`'s `AE_PROPOSE_PAIRING` row |
> | `'approval'` (an APPROVAL decision) | `REQUEST_APPROVAL` | the record's **AE** capability equals the `ae` side of that same row — i.e. it equals the `COMMIT`'s own AE key |

**S0C.13-bis — why the identity differs by case, and why the first draft of this erratum was
wrong.** §0.32 and §0B.7 fix the per-effect key space: only `REFINE`, `DRAFT`, `HANDOFF` and
a class-`c` `NAVIGATE` may carry a **C9** ref; **only `COMMIT` and `REQUEST_APPROVAL` may
carry an `AE` ref**, "and they may carry nothing else". A consumed `REQUEST_APPROVAL`
record therefore carries an **AE** capability, while `AE_PROPOSE_PAIRING`'s `propose` side is
a **C9** ref by §0B.13(1). The two spaces are disjoint — verified: zero shared spellings —
so "equal to the propose key" is a comparison that **can never hold** for the approval case.
Requiring it would refuse every APPROVAL decision unconditionally, which is the defect this
erratum exists to close, reproduced one step further in.

The repair is therefore not to widen the producing-effect set alone but to fix **which
identity is compared in each case**. For the approval case the comparison is
`consumedRecord.capability === commit.capability` — an identity **within AE-CAP**, between
the record that requested the approval and the `COMMIT` that decides it. That is strictly the
same fence: the `COMMIT` still cannot be minted except against a gateway-consumed record whose
capability is the very capability being actuated, and a bare `approval_ref` still does not
satisfy it.

§0B.13(2)'s `propose: null` allowance is **VOID**: the approval-decision case now has a
producing record and an identity to check — the `ae` side, which every allowlisted row has by
construction — so no null side is needed, and every allowlisted key is once again required to
be the `ae` side of exactly one pairing row. §0B.13(3) is amended to the two-row table above
rather than to the REFINE/DRAFT-only condition it states today.

**S0C.14 — what this does not weaken, stated precisely.** The fence §0.34 exists to hold is
that **a `COMMIT` may not be minted from a bare reference the caller supplies** — it must
name a record the gateway itself consumed, whose capability is the canonical owner's own
propose key, whose confirmation body was returned by that owner in response to a gateway
submission. All four conditions survive verbatim; only the producing effect class is
widened, and only for the one `confirmation_of_ref.kind` that cannot be produced by a
`REFINE` or a `DRAFT` in the first place. A `REQUEST_APPROVAL` record is a gateway-consumed
record with a capability, so the comparison is the same comparison. Populating
`confirmation_of_ref` with a bare `approval_ref` still does not satisfy it. The separate
approver fence is unchanged and is not this one: `ActionEngineKernel.decideApproval()`
requires state `PENDING_APPROVAL` and an approver in
`CANONICAL_APPROVER_POLICY_ROLES.get(approverPolicyKey)` (§0B.26), and §0.48's
`GAP-SEPARATION-OF-DUTIES` remains the disposition wherever an initiator must not decide —
§0.49's repository observation about `canDecide` is unaffected and still stands as a finding.

**S0C.15 — the worked instance that was circular, now closed.** §0B.22's sole allowlisted
`MARKETING_FANOUT` row is `communication.bulk-campaign.admit.v2` with
`confirmation_kind: 'APPROVAL'`; §0B.11 pairs it to propose key `b35.confirm`; and
`b35.confirm` was one of the nine keys whose floor was itself unresolvable. EC-2 resolves
the floor and EC-3 makes the decision intents mintable, so the path is no longer circular.
It remains **withheld in fact** while P-12 is `[ABSENT]`, by `AE_FAMILY_FLOOR`.

*Mechanism:* the mint function's refusal; Gate 7 re-checks. *Evaluation points:* `EP-MINT`,
`EP-INGRESS` Gate 7. *Status:* `NORMATIVE-PENDING` on **P-25**.

---

## 0-C.4 EC-4 — the degradation ladder stops withholding the intents four clauses pin

**S0C.16 — the defect.** §4.5.4 step 1 withholds every intent whose required verification
exceeds the session's derived level, before step 4's PIN can protect `priority: 0`. Four
normative clauses assert the opposite for exactly those intents:

- **§2.6.15 SOURCE.3** — `reconnect_intent` is "a `HANDOFF` whose target class is `s` …
  below that floor it is the only interactive element retained". `targetFloor('s') =
  SESSION_VERIFIED`, so step 1 withholds the one intent SOURCE.3 says is retained.
- **§2.6.16 SETTINGS.4 and §2.6.17 FORM.4/FORM.6** — `editor_handoff_intent` and
  `discard_intent` "survive EVERY step of the degradation ladder". The editor handoff is
  class `s`, so on a channel capped below `SESSION_VERIFIED` (§1.7 K7 caps a polling
  Telegram bot at `CHANNEL_IDENTITY`) a `SETTINGS_DRAFT` or `FORM` cannot be delivered there
  at all.
- **§0.25 / §3.12.6** — the escape verb is "never dropped by degradation", while
  `KIND_FLOOR` is `SESSION_VERIFIED` for `CONSENT_STATE`, `IDENTITY_BINDING`,
  `PAYMENT_HANDOFF`, `APPROVAL` and `CLIENT_LIST`; so on those five kinds the mandatory
  escape is withheld at step 1 below `SESSION_VERIFIED`, and §4.8 A-5 ("always
  keyboard-reachable") and §4.7 V9 ("always live") cannot hold.
- **§2.6.11 STRATEGY.1** — the no-action option, as in EC-2.

None has a `reachable_via` by construction, so §4.5.5 C4 fires and the emission fails. The
"withhold" versus "drop" vocabulary does not reconcile them: SOURCE.3 says *retained*, and
SETTINGS.4 says *every step*.

**S0C.17 — the ruling, at the floor rather than in the ladder.** Reordering the
ladder was rejected: §4.5.4's step-4 pinned set explicitly includes "the sole
`COMMIT`", and moving that step above the floor would protect a `COMMIT` from its own
verification floor — an authority breach. The repair is instead a **derived,
build-vetoed, non-actuating** exemption at the floor itself, keyed on members
`WidgetIntent` already declares:

```ts
// DECLARED BY THIS CONTRACT (§0C.11-bis's rule). `MintedIntent` is the intent shape the floor
// derivation reads — §3.1's `WidgetIntent` with `capability` and `handoff_capability_ref`
// retyped to `CapabilityRef | null` per §0B.7. §0.13 and §0B.30 name it without declaring it;
// this declaration resolves all four sites at once.
type MintedIntent = Omit<WidgetIntent, 'capability' | 'handoff_capability_ref'> & {
  capability: CapabilityRef | null;
  handoff_capability_ref: CapabilityRef | null;
};

// FLOOR-EXEMPT. Membership is DERIVED from declared members, never a list of names.
// `priority` and `effect` are declared members of WidgetIntent (§3.1); `priority: 0`
// is already the contract's own marker for "never dropped by degradation" (§4.5.4
// step 4, §0.25, §2.6.11 STRATEGY.1, §2.6.16 SETTINGS.4, §4.1.3 L11).
// R7/R11: both predicates are declared over a STRUCTURAL subject, not over MintedIntent.
// Gate 5 recomputes them from an IntentRecord (§0.16), and MintedIntent is WidgetIntent-shaped
// — it retains intent_ref, intent_token, role, label, utterance_preview, speech_aliases,
// ordinal, input_schema, authority_hint and enabled, ten members IntentRecord does not declare.
// Every member these two actually read is on both shapes, so this needs no widening of either.
type FloorSubject = IntentSubject & { effect: EffectClass; priority: number };

function FLOOR_EXEMPT(i: FloorSubject): boolean {
  return i.priority === 0
      && (i.effect === 'NONE' || i.effect === 'REFINE'
          || i.effect === 'CONTROL' || i.effect === 'HANDOFF')
      && (i.capability === null
          || i.capability.space === 'CONTROL'                      // §0.22, closed at three
          || (i.capability.space === 'C9'                          // the LOCAL row, below
              && c9Registry.tryGet(i.capability.key)?.resourceClass === 'LOCAL'))
      && (i.effect !== 'HANDOFF'
          || (i.target?.class === 's'                              // a surface, not an act
              && !SENSITIVE_DEST(i.handoff_capability_ref)));      // §0C.17-quater
}

// CONSENT and IDENTITY (§0B.20, §0B.25) are predicates over a REGISTERED AE capability —
// they read cap.targetKind and cap.actionClass. `handoff_capability_ref` is a CapabilityRef,
// so they cannot be applied to it directly. This is the ref-taking form, total and fail-closed.
function SENSITIVE_DEST(r: CapabilityRef | null): boolean {
  if (r === null)          return false;      // no destination named: nothing to classify
  switch (r.space) {
    case 'AE': {
      const cap = AE_CAP_BY_KEY.get(r.key);
      if (cap === undefined) return true;     // FAIL CLOSED — unregistered destination
      return CONSENT(cap) || IDENTITY(cap);
    }
    case 'C9': {
      const row = WIDGET_CAPABILITY_POLICY[capKey(r)];
      if (row === undefined) return true;     // FAIL CLOSED — unclassified
      return row.consent_class === 'personal_data'
          || row.consent_class === 'identity_binding';
    }
    case 'CONTROL': return false;             // closed at three, none of them sensitive
    case 'TOOL':    return true;              // FAIL CLOSED — no intent may carry a TOOL ref
  }
}

function verificationFloor(i: FloorSubject, kind: WidgetKind): VerificationLevel {
  if (FLOOR_EXEMPT(i)) {
    // Waive EFFECT_FLOOR, KIND_FLOOR and targetFloor — and, for a HANDOFF ONLY, the
    // destination subject term, which is the circularity SOURCE.3 objects to. NEVER waive a
    // subject's OWN floor: control.run.cancel is CONTROL_FLOOR BOUND_CLIENT and stays there.
    return i.effect === 'HANDOFF'
      ? 'ANONYMOUS'                             // the destination authenticates at its ingress
      : subjectFloor(subjectCapability(i));     // CONTROL and the C9 LOCAL row keep their own
  }
  return maxLevel(
    EFFECT_FLOOR[i.effect], KIND_FLOOR[kind],
    subjectFloor(subjectCapability(i)), targetFloor(i.target),
  );
}
```

**S0C.17-quinquies — §0.13's closed input list is amended, because EC-4 added a fifth input.**
§0.13's header reads "INPUTS: exactly `i.effect`, `i.capability`, `i.handoff_capability_ref`,
`i.target`, and `kind`. No other value is read." `FLOOR_EXEMPT` reads **`i.priority`**, which is
why EC-19 had to add that member to `IntentRecord`. The comment is amended to name it as the
fifth input. A closed enumeration that omits a live input is the same defect EC-17 ruled on for
K22: a second, wrong answer standing beside the mechanism.

**§0.13's two signatures are superseded with it.** Its block still declares
`verificationFloor(i: MintedIntent, kind)`; §0C.17's `FloorSubject` form governs by precedence,
and this is said here rather than left to inference, because the whole point of the retyping is
that **Gate 5 passes an `IntentRecord`** and the spine's spelling is what made that
unconstructible.

**S0C.17-ter — why the exemption keeps the subject term, and what that closes.** The first
draft returned a flat `ANONYMOUS`, which zeroed **every** term including the subject's own.
Two consequences, both filed against it and both real:

- **`control.run.cancel` carries `CONTROL_FLOOR: BOUND_CLIENT`** (§0.22), and §0.24 fixes
  `PROGRESS.cancel_intent` as `effect: 'CONTROL'`, `capability: 'control.run.cancel'`. A
  composer that set that intent to `priority: 0` would have dropped a `BOUND_CLIENT` control
  to `ANONYMOUS`. The contract must not rest on "no clause mints it at priority 0 today" —
  that is an accident of the current text, not a mechanism. Keeping `subjectFloor` for every
  non-`HANDOFF` exempt intent removes the question entirely.
- **A class-`s` handoff to a consent or identity act** would have had its floor zeroed too.
  It is now excluded by `SENSITIVE_DEST`, so no consent or identity handoff is ever exempt,
  whatever its priority.

**S0C.17-quater — why the exclusion needed its own predicate.** The first draft of this repair
wrote `!CONSENT(i.handoff_capability_ref)`. That is **inoperative**: `CONSENT` and `IDENTITY`
are predicates over a *registered AE capability object*, reading `cap.targetKind` and
`cap.actionClass` (§0B.20, §0B.25), while `handoff_capability_ref` holds a `CapabilityRef` —
`{space, key}`. Passing one to the other classifies nothing, so the exclusion would have been
silently vacuous and every consent handoff would have been exempt after all. `SENSITIVE_DEST`
is the ref-taking form: it **resolves** an AE ref through `AE_CAP_BY_KEY` before testing,
classifies a C9 ref by the widget layer's own `consent_class` column, and **fails closed** on
an unregistered key, an unclassified row, or a `TOOL` ref. It is total over all four spaces by
type.

The five clause-mandated intents are unaffected: the escape verb floors at
`subjectFloor(null) = ANONYMOUS` or `CONTROL_FLOOR['control.widget.dismiss'] = ANONYMOUS`;
`discard_intent` is an escape intent and floors identically; `no_action_option.select_intent`
floors at `c9.no_action`'s own row; and `reconnect_intent` / `editor_handoff_intent` are
`HANDOFF`s to integration-status and settings surfaces — neither `CONSENT` nor `IDENTITY` —
so they still floor at `ANONYMOUS` and SOURCE.3's circularity stays fixed.

**BUILD VETO.** `FLOOR_EXEMPT(i) ⟹ i.effect ∉ {'NAVIGATE', 'DRAFT', 'REQUEST_APPROVAL',
'COMMIT'}`. This already follows from the second clause; it is asserted separately so
that a later widening of the effect list cannot silently admit an actuating intent.
A second assertion states that the C9 escape hatch is **unique**:
`|{c ∈ C9_CAPABILITIES : c.resourceClass === 'LOCAL'}| === 1`.

§4.5.4 step 1 gains one sentence: **"A `FLOOR_EXEMPT` intent is never withheld at this
step."** Steps 2, 3, 5 and 6 are unchanged and still apply to it — an exempt intent
touching a `SECURE_SURFACE_ONLY` field is still withheld at step 2, and an effect
exceeding the tier ceiling is still withheld at step 3. Step 4's PIN is unchanged.
§4.5.5 C4 stops firing because nothing in the set is withheld.

**S0C.17-bis — one amendment is required to make the set derivable.** §2.6.15 SOURCE.3
declares `reconnect_intent` a `HANDOFF` with target class `s` and says that "below that
floor it is the only interactive element retained", but it never assigns it a
`priority`. Every sibling the four clauses name carries `priority: 0` explicitly —
`discard_intent` is declared "escape, priority 0" (§2.6.17, §2.6.16),
`editor_handoff_intent` carries `priority: 0` (SETTINGS.4), `no_action_option`'s
selection is evaluated "at ladder step 2 (`priority: 0`)" (STRATEGY.1), and the escape
verb is `priority: 0` (§0.25). **SOURCE.3 is amended to give `reconnect_intent`
`priority: 0`**, so its undroppability is expressed the same way as every sibling's
rather than in prose only.

**S0C.18 — why this confers nothing, argued over the derived set.** Five intents satisfy
`FLOOR_EXEMPT` **in this contract version**, and each is admitted by a clause of the predicate,
not by being named. "Five" is a census, not a bound: the set is derived from `priority === 0`
plus three clauses, and a sixth member is constructible — §0.20/§0.21 grant `CONTROL` to every
kind, so a `priority: 0` `CONTROL` intent minted onto one of the five `SESSION_VERIFIED` kinds
would join the set. **What bounds it is three separate grounds, and only one of them is the veto** — the earlier
sentence said "a build veto, not the census", which promised a bound the veto does not deliver:
it constrains the `CONTROL` branch alone, while `NONE` and `HANDOFF` are unbounded in
*cardinality* and bounded only in *authority* by the non-actuation argument, and `REFINE` is
bounded by an enumeration property rather than by a veto. Said separately:

- **`CONTROL`** — bounded by the build veto below.
- **`REFINE`** — bounded by the assertion `|{c ∈ C9_CAPABILITIES : c.resourceClass === 'LOCAL'}| === 1`,
  verified by enumeration against the live registry; the single row is `c9.no_action`.
- **`NONE` and `HANDOFF`** — **unbounded in number**, and that is acceptable because neither
  can actuate: a `NONE` carries `intent_token: null`, and a `HANDOFF` never invokes its
  destination (R3.5.3) and is additionally excluded by `SENSITIVE_DEST` where the destination
  is a consent or identity act.

**The veto, for the `CONTROL` branch:**

```
priority === 0 ∧ effect === 'CONTROL' ⟹ capability.key === 'control.widget.dismiss'
       // the only CONTROL key whose own CONTROL_FLOOR is ANONYMOUS (§0.22). A priority-0
       // control.run.cancel (BOUND_CLIENT) or control.delivery.resolve (BOUND_CLIENT) fails
       // the BUILD rather than silently joining the exempt set — and §0C.17-ter's retained
       // subjectFloor would have held their own floors anyway, so this is defence in depth.
```

The five, each admitted by a clause:

| Intent | Clause that admits it | Why it exercises no authority |
|---|---|---|
| the escape verb (§0.25) | `effect: 'NONE'` with `capability: null`, or `effect: 'CONTROL'` with `control.widget.dismiss` | "Never cancels an appointment, appears in no routing map that reaches a canonical owner." On a `confirmation_subject: 'cancel'` body, cancelling **is** the `COMMIT` — a different intent, which the veto excludes by effect |
| `discard_intent` (FORM.4/FORM.6, SETTINGS) | it **is** an escape intent — declared "escape, priority 0" | Destroys a widget-layer draft; reaches no canonical owner |
| `no_action_option.select_intent` (STRATEGY.1) | `effect: 'REFINE'`, `capability: c9.no_action`, whose `resourceClass` is `LOCAL` | The unique row of `C9_CAPABILITIES` that touches **no source** — verified by enumeration, `LOCAL` count = 1. The exception is a structural property, not a name on a list |
| `reconnect_intent` (SOURCE.3) | `effect: 'HANDOFF'`, `target.class === 's'` | A `HANDOFF` does not exercise its destination; it routes to a surface that demands its own verification at its own ingress |
| `editor_handoff_intent` (SETTINGS.4) | as above | as above |

**The L11 extension remedy is deliberately NOT in this set**, and the reason matters:
it is a `REFINE` on the widget's **own owner capability**, so a principal below that
capability's floor could not have received the widget in the first place. It needs no
floor exemption, and it keeps the protection it already had — §4.5.4's step-4 capacity
PIN, unchanged. A reader who expects six and counts five should find the answer here
rather than infer an omission.

**The general principle, stated once so it can be cited.** A floor governs **exercising
authority**. Declining to proceed, discarding local state, and asking for the route to a
surface that authenticates are none of those. Making cancellation harder to reach than
confirmation is a safety inversion, not a safety property.

**Why `priority === 0` is a safe key and not a loophole.** `priority` is server-set at
mint like every other member of `WidgetIntent` — §3.1 fixes `label` as "server-minted;
never client-composed" and the whole shape is composed server-side — so an author
cannot promote an intent into the set. And promotion alone would not help: the three
remaining clauses of the predicate exclude every actuating effect, every non-`CONTROL`
non-`LOCAL` capability, and every handoff that does not target a surface.

*Mechanism:* the `FLOOR_EXEMPT` build veto, the uniqueness assertion, and the amended
`verificationFloor`. *Evaluation points:* `EP-BUILD` (the vetoes), `EP-FIT` (step 1),
`EP-MINT`. *Status:* `NORMATIVE-PENDING` on **P-11**, **P-19**.

---

## 0-C.5 EC-5 — the mechanism-gap binding becomes constructible

**S0C.19 — the defect.** §A2.4 is normative: at `EP-REGISTRY-LOAD` "every `[ABSENT]`
mechanism named in §A1 is bound to its gap key; a §A1 row with no gap key fails the start-up
assertion and the process does not start", and §A2.5 offers that binding as the proof a
`NORMATIVE-PENDING` claim is checkable. But **§A1 has no gap-key column and names a gap key
for no row.** The ledger it points at (§0.37, §0.38, §0.39) holds sixteen keys, every one an
**ACT with no canonical owner**; none corresponds to P-01 (a gateway), P-02…P-08 (stores),
P-10/P-11 (tables and a derivation), P-13…P-18 (a facade, routes, handlers, a field) or
P-19/P-20 (infrastructure). §0B.41 then adds six more `[ABSENT]` rows (P-23…P-28), none with
a gap key. Under the literal reading the assertion fails for twenty-four of twenty-eight
rows and the process never starts. The AE-CAP gap keys 0-B introduces
(`GAP-TENANT-BILLING`, `GAP-EXPENSE-DELETE`, `GAP-TENANT-ADMIN`, and the rest) do not close
it either: they are keyed on `RegisteredActionCapabilityV1.capability`, and §A2.3's four
cited enforcing rules all key on a **capability or a Cell having no OWNER** — which an
absent gateway, store, table or type is not.

**S0C.20 — the ruling: two ledgers, because there are two kinds of gap.** The conflation is
the defect. A **capability gap** is "this act has no canonical owner" and belongs to
`AE_CAPABILITY_GAP_LEDGER`, keyed on an AE-CAP capability, enforced by §2 K20, §1.6.7 P2,
§1.3 C5 and §2.6.14 LIMIT.1. A **mechanism gap** is "this component is not built yet" and
gets its own table:

```ts
interface MechanismGap {
  gap_key: `MG-${string}`;      // one per prerequisite row: MG-P01 … MG-P32
  p_ref: string;                // 'P-01' … 'P-32' — §A1's 22, §0B.41's 6, §0C.29's 4
  component: string;            // the §A1 row's component text
  status: '[ABSENT]' | '[EXISTS]' | '[PARTIAL]' | '[UNENFORCEABLE-TODAY]';   // §A1's four
  package: string;              // the K-package that builds it
  blocking_rules: string[];     // every clause NORMATIVE-PENDING on this row
}
declare const MECHANISM_GAP_LEDGER: Readonly<Record<string, MechanismGap>>;
```

§A1 gains a `gap_key` column carrying `MG-P01` … `MG-P22`, one per row; §0B.41's six rows
carry `MG-P23` … `MG-P28` and §0C.29's four carry `MG-P29` … `MG-P32`, so the ledger is
total over all **thirty-two** prerequisite rows. §A2.4's
assertion is **restated over `MECHANISM_GAP_LEDGER`**:

> At `EP-REGISTRY-LOAD`, over the set of prerequisite rows:
> 1. every row whose `status` is not `[EXISTS]` resolves in `MECHANISM_GAP_LEDGER` under its
>    own `gap_key`;
> 2. every `NORMATIVE-PENDING` clause appears in **at least one** row's `blocking_rules`,
>    and in **every** row whose `p_ref` that clause's status names;
> 3. the binding is the **pair** `(clause, p_ref)`, and the set of such pairs is exactly the
>    set derivable from the clauses' own status lines.
>
> A row with no key, a clause bound to no row, or a clause whose status names a `p_ref` whose
> row does not list it, fails the assertion and the process does not start.

**The first draft of this assertion could never pass, and the reason is worth keeping.** It
demanded that each clause appear in *exactly one* row's `blocking_rules`, while at least six
clauses of this contract are `NORMATIVE-PENDING` on two or three prerequisites each — §0C.10
alone names P-11 and P-24 — and `blocking_rules` is defined as "every clause
`NORMATIVE-PENDING` on this row". Uniqueness and that definition are incompatible, so the
process would never have started: fail-closed to the point of inertness, which is a defect
and not a safety property. The assertion above is stated as **coverage plus agreement**
instead, which is what §A2.5's checkability argument actually needs.

The two ledgers are disjoint by key shape (`MG-` versus `GAP-`) and a build assertion states
it. §A2.5's checkability argument now rests on a table that exists rather than on a binding
that was asserted. The fail-closed **outcome** for every row was always correct and is
unchanged; what changes is that the status is now mechanically checkable, which is what
§A2.4 claimed.

*Mechanism:* the restated start-up assertion over `MECHANISM_GAP_LEDGER`. *Evaluation
point:* `EP-REGISTRY-LOAD`. *Status:* `NORMATIVE-PENDING` on **P-29** (§0C.29).

---

## 0-C.6 EC-6 — one accessible name, one owner per kind

**S0C.21 — the defect.** §4.8 A-2 reads "Accessible name = `intent.utterance`, verbatim.
The visible `intent.label` must be contained in it." **`WidgetIntent` declares no member
`utterance`** — its minted string fields are `label`, `utterance_preview` and
`speech_aliases` (§3.1) — so the named CI string check cannot be written, and the two
candidate referents are not equivalent: §3.1 states `utterance_preview` "is a PREVIEW: the
sentence actually written to the conversation is re-rendered at Gate 9", so binding an
accessible name "verbatim" to it would bind it to a string the contract says is not the
sentence. §A2.8's `NORMATIVE-PENDING` marking repairs only the status half — a
`NORMATIVE-PENDING` rule is expressly "binding on the implementation", so it still names a
field the implementation cannot have. 0-B then added a **second** normative answer for the
same control: §0B.36's `ARTIFACT` row fixes the accessible name of `fetch_intent` as
`filename` + `format` + `size_bytes`, and §0B.35 elevated §4.8.2 into the per-kind normative
artefact — while the pre-existing §4.8.2 `APPROVAL` row (`audience_size`, `risk_tier` and
reversibility) conflicts with A-2 identically.

**S0C.22 — the ruling.** A-2 is replaced:

> **A-2 (amended).** A control's accessible name is composed as
> `nameSourceOf(ref, env).label` + (`suffix.pointers.length ? ', ' + renderSuffix(suffix, resolveInteractive(env, ref), env.body) : ''`),
> where `suffix` is the entry §4.8.2's row gives for this ref's lookup key — every argument
> bound, none free — so the name is
> `nameSourceOf(ref, env).label` **verbatim** wherever the pointer list is empty. Where
> for an intent control that label **is** `intent.label` (§0C.22-ter). In every case the
> accessible name contains the denoted element's own label as a prefix, by construction. **`intent.utterance`
> does not exist and every reference to it is void**; `intent.utterance_preview` is
> expressly **not** the accessible name.
> *Mechanism:* a CI check over each emitted `A11yBlock` asserting, for every
> `ref ∈ a11y.reading_order`, that
> `a11y.accessible_names[refKey(ref)].startsWith(nameSourceOf(ref, env).label)`, and, for every kind
> §4.8.2 names, equality with the row's composition applied to the emitted body.
> *Evaluation point:* `EP-BUILD`. *Status:* `NORMATIVE-PENDING` on **P-19**, **P-31**.

**S0C.22-bis — the carrier the check reads is declared here, because it did not exist.**
`A11yBlock` (§4.8) declares `role_hint`, `label`, `description`, `reading_order` and
`live_region` — **no accessible name of any kind** — and it is **one block per envelope**,
so even a single `accessible_name` member could not carry a per-control value. A CI check
over an identifier no shape declares is the very defect EC-6 exists to close, reproduced in
its own repair. `A11yBlock` therefore gains one member:

```ts
// `InteractiveRef` is an object type and cannot key a Record, so the key form is declared.
type InteractiveRefKey = `${InteractiveRef['k']}:${string}`;      // e.g. 'field:phone'
// §4.8's InteractiveRef gains a SEVENTH member: TIME_SLOT_SELECTOR's declared interactive path
// is `groups[].slots[].slot_ref` (§2.6.4), which no existing member could denote — so K22's
// set-equality rule was unsatisfiable for that kind.
//   | { k: 'slot'; id: string }        // TimeSlotSelectorBody slot_ref
declare function refKey(ref: InteractiveRef): InteractiveRefKey;  // `${ref.k}:${ref.id}` —
                                  // total over the closed SEVEN-member union, and
                                  // injective because `k` is one of seven fixed tokens and
                                  // ':' is the only separator, so no two refs collide.

interface A11yBlock {
  /* …role_hint, label, description, reading_order, live_region — unchanged… */
  accessible_names: Record<InteractiveRefKey, string>;   // NEW. One entry per reading_order
                                                         // member; no other key admitted.
}
```

It is **mint class M** — composed by the same pure server function that mints
`text_equivalent`, from validated canonical labels — and it is covered by `body_hash` through
§1.9 H1's `presentation` term, so a composer cannot substitute it and an LLM cannot compose
it. Two validator rules make it total and closed: `keys(accessible_names) === set(reading_order.map(refKey))`
at `EP-MINT`, and an envelope whose `reading_order` names a ref with no entry is refused.

**S0C.22-ter — not every interactive element is an intent, so the name source is a function
of the ref kind.** The first draft of A-2's mechanism said
`accessible_names[ref].startsWith(intentOf(ref).label)` for **every** `ref ∈ reading_order`.
That is unsatisfiable, and the type says so: `InteractiveRef` (§4.8) is a closed **six**-member
union — `option`, `field`, `intent`, `row`, `entry`, `section` — and **only `{k: 'intent'}`
denotes a `WidgetIntent`.** A `{k: 'field'}` ref is a `FormField.field_key`; §2.6.17 gives
FORM the interactive paths `fields[].field_key`, `submit_intent`, `discard_intent`,
`editor_handoff_intent`, and §2 K22 requires `reading_order` to contain exactly the refs
`interactive_paths` produces — so every FORM envelope carries field refs that have a
`label: LocaleText` of their own and **no `intent.label` at all**. Requiring one would refuse
every FORM envelope. `intentOf` was also declared nowhere: it occurred exactly once in the
contract, inside the mechanism that used it.

The name source is therefore declared, total over the union, and non-throwing:

```ts
// DECLARED BY THIS CONTRACT. Total over InteractiveRef. Never throws, never returns undefined,
// and introduces NO new resolver: `resolveInteractive` is K22's OWN ref↔element mapping read
// in the forward direction. validateEnvelope already recomputes the ref set from
// KIND_REGISTRY[kind].interactive_paths applied to this body and refuses on any difference,
// so the element each ref denotes is a value that computation already holds.
// The SEVEN body shapes a ref can denote, each named as the contract actually names it.
// A 'row' ref resolves to its row AND its owning table, because one envelope may hold many
// tables — REPORT declares `sections[].table: TableSpec | null` — so a row key alone does not
// determine which table's is_row_header column to read.
type InteractiveElement =
  | WidgetIntent                                       // §3.1
  | FormField                                          // §2.6.17
  | OptionItem                                         // §2 — label: Cell<string>
  | StrategyOptionsBody['alternatives'][number]        // §2.6.11 — title: Cell<string>, NO label
  | TimeSlotSelectorBody['groups'][number]['slots'][number]   // §2.6.4 — start: Measure
  | ReportBody['sections'][number]                     // §2.6.10 — { section_id; heading; … }
  | ScheduleBody['entries'][number]                    // §2.6.6  — { entry_ref; title; … }
  | { table: TableSpec; row: TableSpec['rows'][number] };
// R6: INDEXED by ref kind. A flat return of the whole union would have nameSourceOf's seven
// branches reading members the declared type does not carry (el.start, el.heading, el.row),
// so the declaration read as total without type-checking. The option alternative names the
// two intersections SERVICE_SELECTOR and STAFF_SELECTOR actually carry, which are the fields
// their accessible_name_suffix pointers resolve against.
type ElementFor<K extends InteractiveRef['k']> =
    K extends 'intent'  ? WidgetIntent
  : K extends 'field'   ? FormField
  : K extends 'option'  ? OptionItem
                          | (OptionItem & { duration: Measure; price: Measure | null })
                          | (OptionItem & { nearest_availability: Cell<string> })
                          | StrategyOptionsBody['alternatives'][number]
                          // ^ REQUIRED: §2.6.11's declared path `alternatives[].option_id`
                          // makes {k:'option'} denote this shape, which is NOT an OptionItem
                          // (it carries `title`, no `label`). Omitting it made
                          // resolveInteractive partial over the seven members and
                          // §0C.22-septies's "an alternative's accessible name is its title
                          // verbatim" unsatisfiable. Note also that `A | (A & B)` narrows to
                          // `A` for member access, so the two intersections are reachable
                          // only through the discriminated `base: 'element'` lookup, never by
                          // reading `duration`/`price` off a bare OptionItem.
  : K extends 'section' ? ReportBody['sections'][number]
  : K extends 'entry'   ? ScheduleBody['entries'][number]
  : K extends 'slot'    ? TimeSlotSelectorBody['groups'][number]['slots'][number]
  : K extends 'row'     ? { table: TableSpec; row: TableSpec['rows'][number] }
  : never;
declare function resolveInteractive<K extends InteractiveRef['k']>(
  env: WidgetEnvelope, ref: Extract<InteractiveRef, { k: K }>): ElementFor<K>;
declare function rowHeaderKey(t: TableSpec): string;   // the one column of THAT table whose
                                                       // is_row_header is true (§2: "exactly
                                                       // one column MUST be true") — total
type SuffixSpec = { base: 'element' | 'body'; pointers: readonly string[] };
declare function renderSuffix<K extends InteractiveRef['k']>(
  d: SuffixSpec, el: ElementFor<K>, body: WidgetBody): string;
       // Each pointer resolves — against `el` when base is 'element', against `body` when it
       // is 'body' — to a Cell, Measure or Phrase, and contributes its MINTED label:
       // Cell.label, Measure.formatted, Phrase.rendered. Joined with ', '. An empty pointer
       // list yields ''. Mint class M, like accessible_names itself.

type NameSource = { label: string; from: InteractiveRef['k'] };

function nameSourceOf(ref: InteractiveRef, env: WidgetEnvelope): NameSource {
  const el = resolveInteractive(env, ref);        // total by K22's set-equality rule
  switch (ref.k) {
    case 'intent':  return { label: el.label,              from: 'intent'  };  // string (§3.1)
    case 'field':   return { label: el.label.rendered,     from: 'field'   };  // Phrase (§0.18)
    case 'section': return { label: el.heading.rendered,   from: 'section' };  // Phrase (§0.18)
    case 'option':  return { label: ('label' in el ? el.label : el.title).label,
                             from: 'option' };   // OptionItem.label OR, on STRATEGY_OPTIONS,
                                                 // alternatives[].title — both Cell<string>
    case 'slot':    return { label: el.start.label,        from: 'slot'    };  // Measure (§2.6.4)
    case 'entry':   return { label: el.title.label,        from: 'entry'   };  // Cell<string> (§2)
    case 'row':     return { label: el.row.cells[rowHeaderKey(el.table)].label,
                             from: 'row' };                                    // Cell<string> | Measure
  }   // total by type over the closed seven-member union — no default branch is reachable.
}

// A-2, in one line: the accessible name begins with the label of whatever the ref denotes.
∀ ref ∈ reading_order : accessible_names[refKey(ref)].startsWith(nameSourceOf(ref, env).label)
```

**S0C.22-octies — `resolveInteractive`'s totality ground, corrected for the appended refs.**
§0C.22-ter grounds that function's totality on "`validateEnvelope` already recomputes the ref
set from `interactive_paths` applied to this body, so the element each ref denotes is a value
that computation already holds". That ground is **false for the refs EC-18(2) appends**, which
come from `emitted` rather than from the body. They do resolve — so nothing breaks in fact —
but the stated reason did not cover them, which is the defect and not the outcome. The
declaration is extended: **a `{k:'intent'}` ref resolves against `env.intents` by `intent_ref`;
every other ref kind resolves against the body through `interactive_paths`.** Total over the
widened list by its two operands.

**S0C.22-sexies — two kinds produce refs the original six-member union could not denote, and one kind's
options are not `OptionItem`s.** Both were surfaced by declaring `nameSourceOf` total, which is
what a totality claim is for.

- **`TIME_SLOT_SELECTOR`** declares the interactive path `groups[].slots[].slot_ref` (§2.6.4),
  and `InteractiveRef` had no member that could denote a slot. K22 requires `reading_order` to
  contain **exactly** the refs `interactive_paths` produces, so that rule was unsatisfiable for
  the booking flow's central kind. `InteractiveRef` gains `{ k: 'slot'; id: string }` — a
  seventh member — and the name source is the slot's `start`, a `Measure` and therefore a
  `Cell` with a minted `label`. §1.4 classes `slot_ref` itself **structural** ("never
  rendered"), which is consistent: the *handle* is never rendered, the *name* comes from
  `start`.
- **`STRATEGY_OPTIONS.alternatives[]`** declares `option_id`, `title: Cell<string>`,
  `reasoning`, `expected_effect`, `risk_tier`, `reversible`, `audience_size` and
  `select_intent` — **no `label`**. It is not an `OptionItem`, though its refs are
  `{k: 'option'}` by §2.6.11's declared path `alternatives[].option_id`. Rather than retype
  §2.6.11's body, the `option` branch reads whichever of the two members the resolved shape
  declares; both are `Cell<string>`, so the branch stays one line and stays total.

**S0C.22-quater — a table's row-header cell is never absent and never `null`, so the `row`
branch is total.** `TableSpec.rows[].cells` is typed `Record<string, Cell<string> | Measure | null>`,
and a `null` there would make `nameSourceOf` — declared total and non-throwing — partial for
exactly the three kinds whose `interactive_paths` produce `row` refs. This section, which
outranks §2, narrows the shape rather than the branch:

> For every `TableSpec t` reachable in a body, and every `r ∈ t.rows`, `r.cells` MUST contain
> the key `rowHeaderKey(t)` with a **non-null** `Cell<string>` or `Measure`. Absence or `null`
> refuses the envelope. A header whose value is not yet known is carried by a `Cell` in a
> non-`KNOWN` state — `PARTIAL`, `NOT_MEASURED`, `UNAVAILABLE` or `PENDING` — never by `null`
> and never by an absent key, which is the whole reason `Cell` has five states.
> *Mechanism:* `validateEnvelope`'s `TableSpec` check. *Evaluation point:* `EP-MINT`.

The other columns keep their `| null` alternative unchanged; only the one row-header column is
narrowed. And `.label` is valid for both surviving alternatives: `Measure` is declared
`extends Cell<number | string>` (§1.1), so it inherits `label` — the branch needs no
discrimination between them.

**Every branch lands on a minted string, and each of the three routes there is a deliberate
one.** `WidgetIntent.label` is already `string`. `FormField.label` and a report section's
`heading` are typed `LocaleText` in §2.6, and **§0.18 rules `LocaleText` a deprecated alias of
`Phrase` that "MUST NOT appear in an implementation", with `LocaleText.text ≡ Phrase.rendered`**
— so both are read as `Phrase` and dereferenced through `.rendered`, the member §1's `Phrase`
declares as "**M** — the only user-visible bytes". The first draft of this fence returned the
`Phrase` object itself, which is not a string.

**The remaining three sources are `Cell<T>`, and that is the reason this works rather than an
inconvenience.** `OptionItem.label`, `entries[].title` and a table row's header cell are all
`Cell<T>`, and `Cell<T>.label` is declared "**M** — ≤ 160 chars, **always a human sentence
fragment**" (§1.1). It is server-minted by the same pure function class as
`accessible_names` itself, and it is a human string in **every one** of the five cell states —
`KNOWN`, `PARTIAL`, `NOT_MEASURED`, `UNAVAILABLE`, `PENDING` — so an accessible name never
degrades to an empty string, a raw value or a failure token when a cell is not KNOWN. That is
exactly the property §1.3's `Cell` — five states, an always-human `label` — was adopted for. `rowHeaderKey(t)` reads the one column
that **table** requires to carry `is_row_header: true` ("exactly one column MUST be true"), so
it is total by that rule and needs no default. It is keyed on the `TableSpec`, not on the
envelope: REPORT declares `sections[].table: TableSpec | null`, so an envelope may hold many
tables and an envelope-keyed lookup would have been ambiguous — which is what the first draft
wrote.

**`accessible_names` stays total over `reading_order`** — every ref still gets an entry — and
what changes is only **whose label the entry must begin with**. The §4.8.2 per-kind row
continues to govern the remainder of the composition for the kinds it names, and those rows
address intent controls, so they are unaffected. *Status:* `NORMATIVE-PENDING` on **P-19**,
**P-31** (§0C.29).

**S0C.22-quinquies — §4.8.2 gains the column A-2 reads, because it had none.** A-2 says the
name is composed with "the composition given by its kind's row in §4.8.2", but §4.8.2's
columns are `role_hint` (derived from `KIND_REGISTRY` per §0B.35), keyboard model, text
alternative, live region and non-colour state — **no accessible-name column exists**. §4.8.2
therefore gains a sixth column, **`accessible_name_suffix`**, typed **per ref kind** rather than
as one string per widget kind:

```ts
accessible_name_suffix: Partial<Record<
    `${InteractiveRef['k']}:${WidgetIntent['role'] | '*'}`,
    { base: 'element' | 'body'; pointers: readonly string[] }
  >>;
       // The VALUE is a composition descriptor, NOT a literal string: a string would be
       // concatenated verbatim and produce "Скачать, audience_size" instead of the number.
       // `base` is REQUIRED because the two families resolve against different nodes and
       // neither base serves both. An intent ref's element is a WidgetIntent (§3.1), which
       // declares no filename, audience_size or risk_tier — those live on ArtifactBody,
       // ApprovalBody and the body's bulk_intents[] — so the three intent rows are
       // base:'body'. The two option rows say "THAT option's duration and price", which only
       // the resolved element can express, so they are base:'element'.
       // The declared default is { base:'element', pointers: [] } — an EMPTY LIST, never ''.
       //
       // renderSuffix turns the descriptor into text; without it A-2's "equality with the
       // row's composition" had no composition to compare against. It is DECLARED, not
       // described in a comment — the first draft left it commented out, which is the same
       // "left in a code comment only" failure §0C.28-sexies item 3 rules a defect.
       // LOOKUP KEY: `${ref.k}:${intent.role}` for a {k:'intent'} ref; `${ref.k}:*` for every
       // other ref kind, which denotes an element carrying no role at all. A more specific
       // entry wins over '*'.
```

**It must key on the ref kind AND the intent role, because two of the six rows scope their
suffix more finely than a ref kind can express.** §4.8.2's `APPROVAL` row says
`audience_size`, `risk_tier` and reversibility appear in **the approve control's** accessible
name — but APPROVAL's interactive paths are `approve_intent`, `reject_intent` and
`detail_intent`, all `{k:'intent'}`, so a ref-kind key would force the audience-and-risk suffix
onto the reject and detail controls too. §4.8.1 A-17 says `CLIENT_LIST`'s `audience_size`
belongs to its **bulk intents** and not to its row refs. `SERVICE_SELECTOR`'s duration and price
belong to its **option** refs. A single per-kind string would have attached each suffix to every
control of that kind, including the ones its own column excludes — which is a wrong accessible
name, not a loose one. Every `${kind}:${role}` pair a row does not name takes the declared
default — an empty pointer list. Populated as:

**Six rows are populated, and the source of each is a column §0B.35 and EB-12 expressly
preserved** — "its keyboard-model, text-alternative, live-region and non-colour-state columns
stand". Those columns already require named content *in the accessible name*, so an empty
suffix for them would not have been a default; it would have been a **contradiction**:

| kind | key | suffix | where it already says so |
|---|---|---|---|
| `ARTIFACT` | `intent:primary` (base `body`) | `filename`, `format`, `size_bytes` — the **fetch** control alone | §0B.36's row, keyboard-model column |
| `APPROVAL` | `intent:primary` (base `body`) | `audience_size`, `risk_tier`, reversibility — **the approve control alone**; `intent:destructive` (reject) and `intent:secondary` (detail) take the declared default — an empty pointer list | §4.8.2's row, keyboard-model column |
| `SERVICE_SELECTOR` | `option:*` (base `element`) | that option's `duration` and `price` | §4.8.2's row, text-alternative column |
| `STAFF_SELECTOR` | `option:*` (base `element`) | `nearest_availability` | §4.8.2's row, text-alternative column |
| `CLIENT_LIST` | `intent:primary` (base `body`) | `bulk_intents[⟨the entry whose intent handle is `ref.id`⟩].audience_size` — row refs are `{k:'row'}` and unaffected | §4.8.1 A-17 |
| `STRATEGY_OPTIONS` | — | — see the ruling below — | §4.8.2's non-colour-state column |

`intent:escape`, `intent:remedy` and `intent:more` take the empty default in every row, so the
intents EC-18(2) appends never acquire a suffix.

**S0C.22-undecies — a `base: 'body'` pointer that crosses an array selects by the ref's own
handle.** §2.6.7 declares `bulk_intents: Array<{ intent_token; label; audience_size: Measure }>`
— **`audience_size` is a member of each ENTRY, not of `ClientListBody`** — so a bare pointer
`audience_size` resolves to nothing on the body, and `bulk_intents[].audience_size` is N-valued
where A-17 requires *that* bulk intent's number. The rule, stated once and applying to every
`base: 'body'` pointer:

> Where a `base: 'body'` pointer crosses an array whose entries carry an intent handle, the
> entry selected is **the one whose handle equals `ref.id`**. If no entry matches, the envelope
> is refused at `EP-MINT` rather than rendering a name from a neighbouring entry.

`ARTIFACT` and `APPROVAL` need no selection — `filename`/`format`/`size_bytes` and
`audience_size`/`risk_tier`/reversibility are single-valued members of `ArtifactBody` and
`ApprovalBody` — which is why only `CLIENT_LIST` carries a crossing pointer.

**S0C.22-nonies — the two rows scoped to one control need the roles they scope by, and no clause
assigned them.** `intent:primary` only reaches the approve control if something fixes
`approve_intent`'s role, and §2.6.12 declares `approve_intent`, `reject_intent` and
`detail_intent` as bare refs while §3.1 lets a composer choose any of the eight roles. The same
gap applies to `ARTIFACT`'s two controls. Two clauses close it, both at `EP-MINT`:

> **APPROVAL.4 (§2.6.12).** `approve_intent` is `role: 'primary'`, `reject_intent` is
> `role: 'destructive'`, `detail_intent` is `role: 'secondary'`, and an `APPROVAL` body mints
> **exactly one** `role: 'primary'` intent.
> **ARTIFACT.3 (§2.6.22).** `fetch_intent` is `role: 'primary'` and `regenerate_intent` is
> `role: 'secondary'`.
> **CLIENT.3 (§2.6.7).** Every `bulk_intents[]` entry is `role: 'primary'`. **Numbered 3, not
> 2:** §2.6.7 already declares a `CLIENT.2` — "this kind is never emitted with
> `presentation_mode: 'client'`", the `pii_ceiling: 'client_identified'` display fence. Because
> §0-C governs over §2 (§0C.2), a second rule under the same identifier could be read as
> **superseding** that fence, silently deleting it. §2.6.7's `CLIENT.1` and `CLIENT.2` are
> unaffected by this section. Without it a bulk
> intent minted `secondary` or `destructive` takes the empty default and loses `audience_size`
> from its accessible name, breaking §4.8.1 A-17 exactly as ARTIFACT's missing role would have
> put the file facts on the regenerate control. `CLIENT_LIST`'s row refs are `{k:'row'}` and are
> unaffected either way.

Without ARTIFACT.3 the `intent:*` key this table first used would have put the file facts on the
regenerate control — "Создать заново, report.pdf, PDF, 2 МБ" — which §0B.36 scopes to the single
activation control. A suffix on the wrong control is a wrong accessible name, not a loose one.

- **The other sixteen carry the declared default — an empty pointer list**, for which A-2's
  composition reduces to `nameSourceOf(ref, env).label` verbatim, so the rule is total over
  all twenty-two kinds with no "otherwise" branch left to interpretation.

**S0C.22-septies — `STRATEGY_OPTIONS`'s `recommended` token is VOID, and the prohibition beside
it stands.** §4.8.2's non-colour-state column reads "`recommended` is a text token in the
accessible name and **never a pre-selection** (no checked state at render)". But
`StrategyOptionsBody['alternatives'][number]` declares `option_id`, `title`, `reasoning`,
`expected_effect`, `risk_tier`, `reversible`, `audience_size` and `select_intent` — **there is
no `recommended` member**, so the first half names content that cannot be produced. Declaring
one was rejected: a recommendation signal on an alternative is precisely the pre-selection
pressure the second half exists to forbid, and §2.6.11 STRATEGY.1 already requires the
no-action option to be equally selectable.

> **The accessible-name half of that column is VOID**; `STRATEGY_OPTIONS`'s
> `accessible_name_suffix` is the empty default, so an alternative's accessible name is its
> `title` verbatim. **The prohibition stands in full**: no alternative may render with a
> checked state, a pre-selection, or any token distinguishing it as recommended.

*Mechanism:* the same `EP-BUILD` CI check as A-2, extended to assert the column is present
and non-`undefined` for all twenty-two rows. *Status:* `NORMATIVE-PENDING` on **P-19**,
**P-31**.

**§4.8.2 is the sole per-kind normative owner of the accessible name**, continuing §0B.35;
A-2 supplies the composition rule and §4.8.2 supplies the per-kind suffix. One field, one answer, and the CI check
is writable against identifiers that exist.

---

## 0-C.7 EC-7 — FR-6e's tenant-object half gets the mechanism it was missing

**S0C.23 — the defect and the ruling together, because the fix is one line.** §0B.25 states
that no capability satisfying `TENANT_AUTHORITY` is on the allowlist "in this contract
version … they are in `AE_CAPABILITY_GAP_LEDGER` under `GAP-TENANT-ADMIN`, no allowlist
row." That sentence names **no enforcing mechanism and no evaluation point of its own**,
contrary to §S0.2 and to §0B.14's polarity doctrine. §0B.16's start-up set — the named
mechanism for every other FR-6 family exclusion — carries explicit build-time vetoes for
`MONEY`, `BOOKING`, `MARKETING_FANOUT`, `CONSENT` and `IDENTITY`, and **no line for
`TENANT_AUTHORITY`**; its `row XOR gap` line forces classification but not which side a row
lands on. Measured exposure: `TENANT_AUTHORITY(cap)` is satisfied by **28 of 226**
capabilities, **14** of them `ALLOW` and reachable from `authenticated_request`, and **10 of
those 14** carry the twelve-role default — including
`package5.wave2.claim-team-owner.execute.v1`, `.suspend-tenant.execute.v1`,
`.create-tenant-user.execute.v1` and `.update-tenant-configuration.execute.v1`. Nothing in
the contract's checked assertions would refuse such a row placed on the allowlist under
family `settings` or `operational`, where `AE_FAMILY_FLOOR` is the reachable
`SESSION_VERIFIED`.

§0B.16's start-up set gains the missing veto, in the same form as its five siblings:

```
row ⟹ TENANT_AUTHORITY(cap) ⟹ fail            // veto — no tenant-object capability is ever allowlisted
```

FR-6e held before this line and holds after it; what changes is that it holds **by a checked
assertion** rather than by the absence of a table. The cross-tenant half —
`TenantContextService.assertTenantId` at Gate 4, plus `evaluateTenantAccessState` and
`assertNoCallerAuthority` (`action-engine.ingress.ts:161`) — is `[EXISTS]` and unchanged.

*Mechanism:* the start-up loop. *Evaluation point:* `EP-REGISTRY-LOAD`. *Status:*
`NORMATIVE-PENDING` on **P-23**.

---

## 0-C.8 EC-8 — BOOK.1's ingress half is void, for the reason §0.35 already gave

**S0C.24 — the defect and the ruling.** §2.6.5 BOOK.1's second sentence reads: "ACTION
ENGINE INGRESS independently re-derives the subject from the submitted capability and
refuses when the emission's `confirmation_subject` disagrees." It is not constructible.
`CanonicalActionIngressService.prepare()` receives `TrustedActionExecutionRequestV1`
(`action-engine.contract.ts:43–70`), which carries `tenantId`, `capability`, `source`,
`targetRef`, `input`, `evidenceRefs`, `intentExpiresAt`, `callerIdempotency`, `bookingIntent`
and five server-owned slot bindings — **no widget-layer field**; `confirmation_subject`,
`confirmationSubject`, `widget_kind` and `widgetKind` have **0 occurrences** under
`src/action-engine`. `confirmation_subject` is a widget **body** field, and §0.35 rules that
passing one "would make a canonical mutation conditional on widget-layer state, which FR-1,
FR-2 and E3 forbid". §0.35 voids §2 K11 and BOOK.2 on exactly this ground and §0.16 E-18
voids BOOK.2 — but **BOOK.1 is named in no errata row anywhere**, so a defence-in-depth
claim that cannot be built was left standing as normative.

> **BOOK.1's second sentence is VOID**, on the ground §0.35 states for K11 and BOOK.2.
> **BOOK.1's first half stands unchanged**: the subject fence is the mint-time one — a
> `confirmation_subject` that does not match the capability the canonical owner returned is
> not mintable (§0.34), and Gate 7 re-checks it over the widget layer's own `IntentRecord`.

Nothing is under-protected by this deletion: §0.34's mint-time non-existence fence and
§0B.21's allowlist are the real controls and are untouched, and §0.35 already enumerates
what the Action Engine does independently enforce — `assertNoCallerAuthority`,
`assertResolverOwnsDecision`, `allowedSourceTypes` membership, the evidence-prefix and
cardinality check, and the mandatory `bookingIntent` for a client-principal create.

---

## 0-C.9 EC-9 — the spoken-commit readback gets a carrier, a field and a gate

**S0C.25 — the defect.** §4.7 V4 is normative: "every `COMMIT` reached by voice requires
readback … the gateway refuses a `COMMIT` submission from a `SPOKEN` profile with no
readback confirmation reference." **No such reference can exist anywhere in the contract as
specified.** §3.8's `WidgetIntentSubmission` is a closed shape — `contract`, `widget_id`,
`intent_token`, `inputs`, `client_nonce`, `profile_id`, `spoken_transcript?`,
`client_emitted_at?` — with no member able to carry it, and R3.8.2 plus §0.54 refuse unknown
keys at any depth; `inputs` is unusable because §2 K12 fixes
`commit_intent.input_schema === null` on all four confirmation kinds and Gate 8 refuses a
submission carrying `inputs` for a null schema; §3.7's `IntentRecord` has no readback field;
§3.9's fourteen gates contain no readback gate. The stated mechanism's container is also
stale — `requires` is not a member of `WidgetIntent`; the member is `confirmation` (§3.1).
Verified repo-wide: `readback` has **exactly one** occurrence, the unrelated capability key
`cash-declaration.local-readback` (`action-engine.registry.ts:1628`). `SPOKEN` is the only
non-`RICH_INTERACTIVE` tier §4.5.3 permits to reach `COMMIT` ("up to `COMMIT`, readback
mandatory"), so the stated fence on a spoken commit was asserted, not enforced.

**S0C.26 — the ruling: build the fence rather than withdraw it.** V4 guards the one path on
which a commit is confirmed by an utterance that no one can re-read, so withdrawing it and
marking it non-normative would leave a promise with no executable path. The three missing
pieces are added, all inside the widget layer — no Action Engine field, no C9 field:

**One of the four pieces already exists, and saying so matters.**
`ConfirmationRequirement` (§3.1) **already declares** `requires_readback: boolean`,
commented "speech profiles: server text read back first". §4.7's stale reference
`requires.requires_readback` is therefore **only a wrong container name** — the member
is `confirmation`, not `requires` — and is corrected, not added. What is genuinely
absent is the thing to read back, the carrier that returns the affirmation, and the
gate that checks it:

```ts
// ALREADY DECLARED (§3.1 ConfirmationRequirement) — corrected reference only.
confirmation.requires_readback: boolean;   // server-set: effect === 'COMMIT' ∧ tier SPOKEN

// 1. THE THING READ BACK — two new server-set members on ConfirmationRequirement.
confirmation.readback_ref:  string | null;  // non-null iff requires_readback
confirmation.readback_text: string | null;  // server-minted, sealed inside body_hash
                                            // (§0.31 mint class M — an author cannot write it)

// 2. THE CARRIER — §3.8's closed shape gains exactly one optional member.
interface ReadbackAck {
  readback_ref: string;   // echoes confirmation.readback_ref
  body_hash: string;      // echoes the emission's body_hash
  affirmation: string;    // the caller's affirmative utterance, verbatim
}
interface WidgetIntentSubmission {
  /* …the eight existing members, unchanged… */
  readback_ack?: ReadbackAck;     // REQUIRED iff Gate 8-R applies; refused otherwise
}

// 3. THE GATE — §3.9 gains Gate 8-R, immediately after Gate 8 (input schema).
//    Refuses, never repairs. reason ∈ {'readback_missing','readback_mismatch'}.
```

**Gate 8-R (normative).** For a submission whose **`record.confirmation?.requires_readback`
is `true`** — `confirmation` is non-null only for `REQUEST_APPROVAL` and `COMMIT` (§3.1), so
the optional chain is what makes the antecedent total over every record — the gateway refuses
unless **all four** hold: `readback_ack` is present;
`readback_ack.readback_ref === record.confirmation.readback_ref`;
`readback_ack.body_hash === record.body_hash`; and `readback_ack.affirmation` is an exact
member of the server-published closed affirmation vocabulary for the envelope's locale. A
submission carrying `readback_ack` whose record does not satisfy
`confirmation?.requires_readback === true` is **also** refused — including one whose
`confirmation` is null altogether —
the field is not an optional extra, and §0.54's closed-shape discipline is preserved in both
directions.

**S0C.26-bis — the antecedent is the record, never the submission, and this is a security
repair not a phrasing one.** The first draft keyed Gate 8-R on "a submission whose
`profile_id` resolves to a profile whose carrier tier is `SPOKEN`". **`profile_id` is
declared `ADVISORY` by §3.8 and R3.8.3 (`// ADVISORY (R3.8.3)`), and R3.8.3 states it "is
advisory and is not an authority input."** A caller could therefore have submitted a
non-`SPOKEN` `profile_id` and skipped the readback entirely — the gate's own antecedent
handing the caller the switch, which is precisely the `CHANNEL CLAIM → AUTHORITY` edge FR-3
forbids. `requires_readback` is server-set at `EP-MINT`/`EP-FIT` from `Lifecycle.delivery_channel`
and is sealed inside `body_hash`, so keying on it cannot be influenced by the submission.
A `SPOKEN` delivery that reaches `COMMIT` now carries `requires_readback === true` by
composition, and the gate reads that. `readback_text` is
server-minted and sealed inside `body_hash`, so a client cannot choose what was read back,
and the `body_hash` echo makes a readback against a superseded body refuse rather than
commit. §4.7's stale `requires.requires_readback` reference is corrected to
`confirmation.requires_readback` throughout.

**S0C.26-ter — `record.body_hash` is declared here, because `IntentRecord` has no such
member.** §3.7's `IntentRecord` enumerates `intent_token_hash`, `widget_id`, `tenant_id`,
`principal_proof_hash`, `effect`, `capability`, `handoff_capability_ref`, `target`,
`verification_floor`, `confirmation`, `input_schema_hash`, `requested_scope_hash`, `run_ref`,
`approval_of_intent_ref`, `confirmation_of_draft_ref`, the lifecycle timestamps and
`action_receipt_ref`, then the erasable conversation fields — **no `body_hash`**. Gate 8-R's
third condition, and §0.34's `SUPERSEDED` comparison, both need it:

```ts
interface IntentRecord {
  /* …unchanged… */
  body_hash: string;          // NEW. Written at mint from the sealed emission. AUDIT_RETAINED
                              // (§0.53 / RT5): it survives conversation erasure, because it
                              // is a hash and carries no conversation content.
}
```

Added to **P-30**'s component list, so a build of the gateway that omits it fails §A2.4's
assertion rather than shipping a gate that cannot evaluate.

**Erasure classes, because a new carrier without one is a gap in §4.4.3's table.**
`readback_ack.readback_ref` and `readback_ack.body_hash` are `AUDIT_RETAINED` — opaque handles
and a hash, carrying no conversation content, and read by Gate 8-R which §0.52 requires to see
only `AUDIT_RETAINED` fields. **`readback_ack.affirmation` is `CONVERSATION_CONTENT`**: it is a
word the data subject said, so it is erased with the conversation, and Gate 8-R compares it
against the closed affirmation vocabulary **at submission time only** — no later path reads it,
which is what keeps §0.52's build-time reachability test green. `IntentRecord.c9_domain` and
`.selection_domain` are `AUDIT_RETAINED`; §0.51 already classes the `selection_domain`
*labels* as `CONVERSATION_CONTENT`, and the two are distinct fields. All five rows are added to
§4.4.3's table.

*Mechanism:* the two new `confirmation` members, `IntentRecord.body_hash`, the amended §3.8
shape, and Gate 8-R keyed on the record. *Evaluation points:* `EP-MINT` (the fields),
`EP-INGRESS` Gate 8-R. *Status:* `NORMATIVE-PENDING` on **P-01**, **P-02**, **P-30** (§0C.29).

---

## 0-C.10 EC-10 — PR2's capability half is rebuilt without touching the C9 registry

**S0C.27 — the defect.** §4.9.2 PR2's mechanism (a) reads "the capability registry marks
run-opening capabilities; the emission validator refuses them on a proactive envelope." No
such marker exists: `C9Capability` (`c9.registry.ts:52–74`) declares twenty-two members and
none of them marks a run-opener, and `runOpening`, `run_opening`, `opensRun`, `opens_run`,
`runOpener`, `canOpenRun` are **0 hits repo-wide**. Adding the field would change
`C9_CAPABILITIES` and therefore `C9_REGISTRY_HASH`
(`c9Hash('registry/1', C9_CAPABILITIES)`, `c9.registry.ts:177`), which §0.3 and FR-16 forbid
outright. This is precisely the shape §0.16 E-18 voids for `booking_effect: true` — but PR2
is voided nowhere, and it was the single place in the assembled contract where the "no C9
contract change" verification failed.

**S0C.28 — the ruling.** PR2's mechanism (a) is **VOID** and replaced by a widget-layer
predicate over a field C9-CAP **already has**:

```
RUN_OPENING(r: CapabilityRef | null) :=
                    r !== null
                 ∧ r.space === 'C9'
                 ∧ (c9Registry.tryGet(r.key)?.mode ?? 'PROPOSE_ONLY') !== 'READ'
                 //  ^ the ONLY declared accessor (§0C.11-bis). The `??` default makes an
                 //    unregistered C9 key satisfy RUN_OPENING, so PR2 (a′) REFUSES it on a
                 //    proactive envelope — the fail-closed direction, matching c9Floor.
```

> **PR2 (a′), normative.** The emission validator refuses any intent whose
> `subjectCapability(i)` satisfies `RUN_OPENING` on an envelope whose **`origin.trigger` is
> `'proactive'`** — the spelling §3.2.5, §4.9.1 PR1 and §4.9.2 PR2 (b) already use; the first
> draft wrote "`origin` is `PROACTIVE`", which names neither the member nor the value.
> `subjectCapability(i)` returns `null` for a `NONE` effect and for a `w`/`i`/`s`/`detail`
> `NAVIGATE` (§3.5), which is why `RUN_OPENING` is stated ref-nullably above and is total over
> what it is actually passed. *Evaluation point:* `EP-MINT`.

**The first draft of this predicate wrote `c9Registry.get(ref.key).mode`, and that was the
same defect twice over:** `c9Registry` is not a repository object at all — it exists only as
this contract's own declaration, and §0C.11-bis declares it with **exactly one member,
`tryGet`**, under the rule that "a normative clause must not name an identifier no shape
declares". A `.get` on it names nothing, and a non-optional call would also have had no
fail-closed branch for an unregistered key. Membership over the registered 56 is unchanged
by the correction.

`mode` is a mandatory closed-union member of `C9Capability` and distinguishes exactly the
right set: `READ` keys are provenance — a proactive envelope legitimately names
`c7.measurement.read` as the source of a metric — while `PROPOSE_ONLY` and `OWNER_HANDOFF`
can only be exercised **inside** a run, so an intent naming one is a run-opener by
construction. Membership is **15 of 56** (13 `PROPOSE_ONLY` + 2 `OWNER_HANDOFF`), enumerated
in process. **No field is added, so `C9_REGISTRY_HASH` is unchanged and FR-16 holds.**
PR2's mechanism (b) — the standing CI leak query over recorded emissions, covering the
`IntentRecord.run_ref === null` half at `EP-BUILD` — stands unchanged, and PR1's proactive
effect ceiling is independently enforced by its own emission-validator predicate.

---

## 0-C.10-bis Six defects this round's certification surfaced, closed here

**S0C.28-bis.** Three independent certifiers read the assembled contract in full (5 501
lines each) and executed the registries rather than grepping them. Six defects they raised
are not repairs of EC-1…EC-10 but distinct carried-forward or newly-exposed faults. They are
closed here rather than deferred, because five of the six are one clause each.

### EC-11 — Gate 6 gains its third C9 branch

**The defect.** §0B.18 dispatches Gate 6 by key space: `AiToolPolicyService.assertCanExecute`
for `C9` and `TOOL`, the AE policy pre-screen for `AE`, §0.23's owner-endpoint lock for
`CONTROL`. That is total over the **spaces** but not over the **C9 space's own members**:
`assertCanExecute(principal, definition: AiToolDefinition)` needs a catalogue definition, and
**nine of the 56 C9-CAP keys are not catalogue names** (§0C.8). While those nine were
unreachable — which is exactly what EC-2 repaired — the hole was masked. EC-2 makes them
reachable, so it must also say what fences them at Gate 6.

**The ruling.** Gate 6's `C9` branch is split in two, in the shape §0.23 already uses for
`CONTROL` — name the fence that exists rather than the one that does not:

```
const ref = subjectCapability(record);               // bound once; NOT record.capability
if (ref === null) → no capability is exercised; Gate 6 has nothing to check (§0C.28-septies)
Gate 6, ref.space === 'C9':
  def = MAYA_AI_TOOL_CATALOG_BY_NAME.get(ref.key)
  if (def !== undefined)  → AiToolPolicyService.assertCanExecute(principal, def)     // the 47
  else                    → WIDGET_CAPABILITY_POLICY[capKey(ref)] must exist (else refuse), AND
                            c9Capability(ref.key,                                            // the 9
                                         record.c9_domain,        // §0C.28-ter, declared below
                                         C9_REGISTRY_HASH) must admit
                            // where `const ref = subjectCapability(record)` is bound once at the
                            // top of the branch. NOT record.capability.key: §3.2 fixes
                            // `capability` null for every HANDOFF, so that spelling would read
                            // `.key` on null for the very effect class this branch exists to
                            // reach. On a run-less mint path record.c9_domain is null and the
                            // c9Capability half is not applied (§0C.28-quater).
                            (it throws `capability_not_registered` otherwise, and additionally
                             refuses BUSINESS_INTELLIGENCE for any mode !== 'READ')
```

**S0C.28-ter — the domain argument needs a carrier, and none existed.** `c9Capability` is
`(key, domain: C9Domain, registryHash)` (`c9.registry.ts:178–192`) — the `domain` is a
**required positional argument**, and its two refusal branches (`!def.domains.includes(domain)`
and `domain === 'BUSINESS_INTELLIGENCE' && def.mode !== 'READ'`) are precisely the fence this
branch is invoking. A full read of the contract finds **exactly one** domain-valued member
anywhere — `Correlation.agent_id` (§1.1.4), which is envelope-level, nullable, and named by no
gate. `IntentRecord` declares none. A gate cannot pass an argument the record does not carry.
§3.7's `IntentRecord` therefore gains one member, alongside EC-15's two:

```ts
interface IntentRecord {
  /* …unchanged, plus §0C.26-ter's body_hash and EC-15's selection_domain… */
  widget_kind: WidgetKind;      // NEW. Mint class D, AUDIT_RETAINED — it names a kind, not
                                // conversation content. REQUIRED because Gate 5's recompute
                                // evaluates KIND_FLOOR[kind] as one of verificationFloor's four
                                // terms, and EC-12's surviving ruling enforces the kind rule
                                // "at EP-INGRESS Gate 7, over the widget layer's own
                                // IntentRecord". §A1's P-02 row already names it as part of the
                                // component; §3.7 simply never declared it.
  handoff_capability_ref: CapabilityRef | null;   // RETYPED. §0B.7's retyping enumeration names
                                // WidgetIntent.handoff_capability_ref and IntentRecord.capability
                                // but omits THIS member, so it stayed `string | null` while
                                // SENSITIVE_DEST reads `r.space` off it. Added to that list.
  priority: number;             // NEW. Mint class D, AUDIT_RETAINED — an integer carrying no
                                // conversation content, so §0.52's reachability test stays green.
                                // REQUIRED because §0.16 has Gate 5 recompute verificationFloor()
                                // from the live tables and the record and refuse on ANY
                                // difference; FLOOR_EXEMPT reads i.priority, so without this
                                // member the exempt branch is not recomputable at EP-INGRESS and
                                // every exempt intent would diverge and be refused.
                                // `priority` and `widget_kind` are added to P-30's component
                                // list for the same reason §0C.28-ter adds c9_domain: a gateway
                                // built without them ships a Gate 5 that cannot recompute.
  c9_domain: C9Domain | null;   // NEW. `C9Domain` is the orchestrator's own published union
                                // ('ADMIN' | 'CLIENT_LIFECYCLE' | 'OCCUPANCY' |
                                //  'BUSINESS_INTELLIGENCE'), imported, never redeclared —
                                // the same four §1.1.4's Correlation.agent_id already carries.
                                // Mint class D, AUDIT_RETAINED. Non-null IFF BOTH
                                // subjectCapability(record).space === 'C9' AND
                                // correlation.run_id !== null. Derived at EP-MINT from
                                // `Correlation.agent_id`, which §0.16 E-29 already
                                // reclassifies as class D, "derived by the minter from the
                                // run's registered agent" — the one domain-valued member the
                                // contract declares. On the run-bearing path an envelope whose
                                // capability.space is 'C9' and whose correlation.agent_id is
                                // null is REFUSED at EP-MINT; on BOTH run-less mint paths —
                                // the registered capability read and the proactive scheduler —
                                // it is null by construction (§0C.28-quater).
                                // NEVER from the subject capability's own `domains` — that
                                // would compare a value with itself and make the test vacuous.
}
```

**S0C.28-quater — the refusal is scoped to the path on which its antecedent can be evaluated.**
The first draft said a `C9` intent whose envelope carries `correlation.agent_id === null` is
refused at `EP-MINT`. That would have refused an entire legitimate mint path. §1.1.4 declares
`run_id` "NULLABLE BY DESIGN", and **as amended by EC-18** names three mint paths, and §4.1.1 L1 names the registered capability-read endpoint as
minter 2 of 3. On that path **there is no run and therefore no registered agent**, so
`agent_id` is null by construction and §0.16 E-29's derivation ("derived by the minter from the
run's registered agent") has no input. The refusal as written would have made every C9
capability-read envelope unmintable.

> **On the run-bearing path** — `correlation.run_id !== null` — an envelope carrying an intent
> whose **`subjectCapability(i).space === 'C9'`** is **refused at `EP-MINT` when
> `correlation.agent_id` is null**, and `c9_domain` is that value. The predicate is
> `subjectCapability`, **never `capability`**: §3.2 fixes `capability` null for every `HANDOFF`,
> so a run-bearing `HANDOFF` whose destination is a C9 key would otherwise escape the refusal
> entirely, mint with `agent_id` null and `c9_domain` null, and break the IFF §0C.28-ter states.
> This is the same substitution EC-19 made at the Gate 6 call site.
> **On BOTH run-less mint paths** — the registered capability read (§4.1.1 L1 minter 2) and
> **the proactive scheduler for the canonical moments (minter 3)**, where `run_id` and
> `agent_id` are null for the same reason: §0.16 E-29's derivation "from the run's registered
> agent" has no input where there is no run — `c9_domain` is `null` **by construction**, and EC-11's second Gate 6 `C9` branch reduces there to: the
> `WIDGET_CAPABILITY_POLICY[capKey(ref)]` row must exist, plus `c9Floor`'s `min_verification`
> and `CONSENT_CLASS_FLOOR` carried at Gate 5. **The `c9Capability` domain half is explicitly
> NOT applied on those paths**, and this contract says so rather than leaving a gate that cannot
> call its own fence.
>
> **And the policy-row test is not a runtime refusal — said plainly, or a reader counts it as
> one.** §0B.32 makes `WIDGET_CAPABILITY_POLICY` total over all 56 C9 keys and §0.14 fails the
> **build** on a key with no row, so at runtime the row always exists for a registered C9 ref
> and that "else refuse" can never fire. On the two run-less paths the **operative** fence is
> therefore Gate 5's `c9Floor` — the policy row's `min_verification` and `CONSENT_CLASS_FLOOR` —
> and Gate 6 contributes a build-time totality restatement, not a second runtime check.
> §0C.32's EC-2 row is written to match.

The first draft also said the value came, on that path, "from the resolved principal's domain"
— **no principal shape declares a domain**, so that half named nothing at all. It is replaced
by the explicit `null`-by-construction ruling above, which is checkable. Added to **P-30**'s
component list, so a gateway built without it fails §A2.4's assertion rather than shipping a
gate that cannot call its own fence. The same binding is applied to §3.3.2's
`c9Capability(key, domain)` sentence, which had the identical dangling argument.

**The second branch is weaker than the first, and saying so is the point.** `c9Capability`
is the orchestrator's own admission function, it is `[EXISTS]`, and it refuses an unregistered
key, a registry-hash mismatch, a domain mismatch and a non-`READ` mode under
`BUSINESS_INTELLIGENCE` (`c9.registry.ts:178–192`) — but it applies **no role, surface,
feature or risk-tier test**, which `assertCanExecute` does. For the nine keys on this branch
the role and risk fences are therefore **their `WIDGET_CAPABILITY_POLICY` row's
`min_verification` and `consent_class`, carried through `c9Floor` at Gate 5**, plus
`CONSENT_CLASS_FLOOR` — not Gate 6. That is a real fence and it is a different one; a reader
must not take this branch for an equivalent of the first. **Here a throwing
accessor is correct**, because Gate 6 is a refusal point and a raise *is* the refusal —
unlike a floor derivation, which must return a level. *Evaluation point:* `EP-INGRESS`
Gate 6. *Status:* `NORMATIVE-PENDING` on **P-01**, **P-26**, **P-30**.

**S0C.28-septies — `subjectCapability` is declared over a structural subject, so both shapes
satisfy it.** §0B.30 declares it over `MintedIntent`, whose `capability` and
`handoff_capability_ref` are `CapabilityRef`s; Gate 6 and Gate 5 pass an **`IntentRecord`**. It
is re-declared over the structural subset both satisfy, which needs no widening of either shape:

```ts
type IntentSubject = { capability: CapabilityRef | null;
                       handoff_capability_ref: CapabilityRef | null;
                       target: IntentTarget | null };
declare function subjectCapability(i: IntentSubject): CapabilityRef | null;
```

`MintedIntent` satisfies it by §0B.7's retyping; `IntentRecord` satisfies it once the retyping
above reaches its `handoff_capability_ref`. **And every caller must guard the null**, which §3.5
returns for a `NONE` effect and for a `w`/`i`/`s`/`detail` `NAVIGATE`: a null subject means no
capability is exercised, so Gate 6 has nothing to dispatch on and passes the intent to its
remaining gates rather than reading `.space` off null.

**S0C.28-quinquies — Gate 6 dispatches on `subjectCapability(record)`, not on
`record.capability`.** §3.5's `subjectCapability` walks `capability → handoff_capability_ref →
target.ref` (class `c`) `→ null`, and §3.2's table fixes `capability` **null** for every
`HANDOFF` — the act a handoff carries the user toward lives in `handoff_capability_ref`.
Dispatching Gate 6 on `record.capability` would therefore skip the C9 branch for **every
HANDOFF**, which is the effect class whose subject is most often a C9 key, and the branch
§0C.32's EC-2 row names as a compensating fence would be unreachable for exactly those intents.
The dispatch key is `subjectCapability(record).space` and the argument is
`subjectCapability(record).key`; a `null` subject means no capability is exercised and Gate 6
has nothing to check — which §3.5 guarantees only for `NONE` and a `w`/`i`/`s`/`detail`
`NAVIGATE`.

**And the branches are scoped by EFFECT as well as by space, because a `HANDOFF`'s subject is a
destination, not an act being performed.** Dispatching on `subjectCapability` makes Gate 6 read
`handoff_capability_ref`, and R3.5.3 declares that field "referenced, never invoked". Applying
an execute-admission test to it would be a category error with real consequences: `c9Capability`
refuses `BUSINESS_INTELLIGENCE` on any non-`READ` mode, so a BI run could not even **offer** the
`a22.configuration` or `b35.confirm` handoff; and §0B.18 bullet 1(a) would demand an
`AE_WIDGET_COMMIT_ALLOWLIST` row for an AE destination that is being routed to, not committed.

> **For `effect === 'HANDOFF'` the subject resolves only the DESTINATION fences** — registration
> in its space, `SENSITIVE_DEST` (§0C.17-quater), `targetFloor('s')`, and the landing surface's
> own ingress. It never resolves `assertCanExecute`, `c9Capability`'s domain/mode admission, or
> the AE COMMIT allowlist. R3.5.3's reader list is extended to name this branch, so the field
> has one documented set of readers rather than a fourth undeclared one.

### EC-12 — the last two "independent Action Engine re-derivation" claims are void

**The defect.** EC-8 voided §2.6.5 BOOK.1's ingress half on §0.35's ground, but two more
sentences make the identical unbuildable claim and were named in no errata row:

- **§2.2 K2**, closing paragraph: "A fourth evaluation happens at INGRESS for the rules that
  guard effects: the `IntentRecord` persists `widget_kind`, and the ACTION ENGINE INGRESS
  re-derives the kind rule from it rather than trusting anything the submission carries."
- **§2.6.17 FORM.2**'s "and, independently, at ACTION ENGINE INGRESS …" clause.

`TrustedActionExecutionRequestV1` carries no `widget_kind` — 0 occurrences of `widget_kind`
or `widgetKind` under `src/action-engine` — and passing one would make a canonical mutation
conditional on widget-layer state, which FR-1, FR-2 and E3 forbid.

**The ruling.** Both are **VOID**, on the ground §0.35 states for §2 K11 and BOOK.2 and
§0C.24 restates for BOOK.1. The kind rule is enforced where it belongs and where it is
built: at `EP-MINT` and at `EP-INGRESS` Gate 7, over the widget layer's own `IntentRecord`.
EC-8's errata row is extended to cover both.

### EC-13 — an APPROVAL body carries two COMMIT intents, and the ceiling forbade it

**The defect.** §2.6.12's `ApprovalBody` declares `approve_intent` and `reject_intent`, §2 K11
makes APPROVAL a COMMIT-bearing kind, and §0.47 forbids nulling either except for three
enumerated server facts. But `KIND_REGISTRY.max_commit_intents` is typed `0 | 1` — a closed
union that **cannot express two** — and §2 K13 fixes it at `1` for the four confirmation
kinds, with the mint function refusing "a second `COMMIT` when `max_commit_intents === 1`".
So an APPROVAL body that mints both decisions is refused at `EP-MINT`, and one that mints
only one violates §0.47.

**The ruling.** `max_commit_intents` becomes `0 | 1 | 2`, and **`2` is admissible for
`APPROVAL` and for no other kind**, under a build veto:

```
APPROVAL ⟹ max_commit_intents === 2
kind !== 'APPROVAL' ⟹ max_commit_intents ∈ {0, 1}            // build veto
max_commit_intents === 2 ⟹ exactly one approve/reject pair, both non-null, both carrying
                            the SAME confirmation_of_ref.ref (the approval_ref) and the
                            SAME AE capability; consuming either marks the other consumed
```

**K13's invariant is preserved, not widened.** What K13 protects is *one actuating subject
per envelope*: approve and reject are two mutually exclusive decisions on **one** approval
object, not two commits on two subjects. The added clause makes that explicit and
enforceable — same `approval_ref`, same AE key, single-use across the pair — so an envelope
still cannot actuate two things. *Evaluation points:* `EP-BUILD` (the veto), `EP-MINT`.

### EC-14 — PR3c's delivery-consent carrier and registry are declared

**The defect.** §4.9.3 PR3c is normative — "the delivery permission is re-evaluated at
delivery, not at mint. `notify_pref_key` must resolve in the notification-consent registry" —
but **`notify_pref_key` is a member of no declared shape and the "notification-consent
registry" is named nowhere else in the contract.** The adjacent PR4 is already, correctly,
marked `[NON-NORMATIVE]` about editorial judgment; PR3c is not about judgment, it is about a
consent read, and it must be constructible.

**The ruling.** Both are declared:

```ts
interface ProactiveProvenance {
  /* …unchanged… */
  notify_pref_key: string;         // NEW. Mint class D (derived server-side from the moment).
}

// A closed server catalogue. Not author-extensible; a moment absent from it cannot be emitted.
interface Moment {
  moment_key: string;
  kind: WidgetKind;                  // the kind this moment composes — EC-18(3)'s pointer
                                     // check needs a leaf schema to check against
  moment_template_id: string;        // with the version below, composes the MOMENT_TEMPLATES key
  moment_template_version: number;   // REQUIRED once the catalogue is keyed `id@version`
  notify_pref_key: string;
  once_per: string;
  quiet_hours_policy: string;
}
declare const MOMENT_REGISTRY: Readonly<Record<string, Moment>>;   // the 12 canonical moments

// The registry PR3c names but never declared. Without it the clause "must resolve in the
// notification-consent registry" names no table and cannot be checked.
interface NotifyPref {
  notify_pref_key: string;
  consent_class: 'communication';          // §0.14's vocabulary; a delivery permission is
                                           // always a communication consent, never another class
  owner: CapabilityRef;                    // the canonical owner that records and revokes it
  quiet_hours_window: string;              // IANA-zoned window, re-read at delivery
}
declare const NOTIFICATION_CONSENT_REGISTRY: Readonly<Record<string, NotifyPref>>;
```

At `EP-REGISTRY-LOAD`, every `MOMENT_REGISTRY` row's `notify_pref_key` must resolve in
`NOTIFICATION_CONSENT_REGISTRY`, and `MOMENT_REGISTRY` must carry exactly **twelve** rows —
the twelve canonical moments — or the process does not start; at delivery the adapter re-reads
that key and the quiet-hours window immediately before handing bytes to the channel, and a
mint-time value is neither sufficient nor used — PR3c's own mechanism, now with something to
read. *Status:* `NORMATIVE-PENDING` on **P-17** and **P-32** (§0C.29). **P-17** is
`control.delivery.resolve`, "the handler that resolves one `dedupe_key` across channels" — the
component PR3c's own third condition (`dedupe_key` unique for the moment's `once_per` window)
actually needs. **P-32** carries the three registries. The first draft named **P-13**, the CHART
read facade, which gates nothing EC-14 names and would have bound a delivery-consent repair to a
wave-4 analytics component; it is struck.

### EC-15 — the two remaining dangling identifiers

`IntentRecord.body_hash` is declared by §0C.26-ter. The second is `selection_domain`, named
by the `SUPERSEDED` comparison and declared by no shape; it is declared on `IntentRecord`
alongside `body_hash`, mint class D, `AUDIT_RETAINED`, and added to **P-30**'s component list.

### EC-18 — three live paths name members that no longer exist, or that no rule admits

**S0C.28-sexies.** Declaring `reading_order` total and `nameSourceOf` total over it forced a
walk of all twenty-two kinds' `interactive_paths`. Three do not resolve.

**Two stale spellings are corrected with them.** §1.1.4 says `run_id` is nullable "because
**two** paths mint envelopes"; §4.1.1 L1 declares **three** minters and names the proactive
scheduler as the third, which §0C.28-quater now relies on — **§1.1.4 is amended to three, naming
the scheduler**, because a prose count that can drift is a count that will (EC-16). And §0B.18's
three Gate 6 bullets still dispatch on `capability.space`, one of them listing `HANDOFF` among
its effect classes though §3.2 fixes `capability` null for exactly that class: **§0C.28-quinquies
supersedes the spelling in all three**, which are read over `subjectCapability(record).space`.

1. **`PROGRESS` names a deleted member.** §2.6.13's interactive paths are `cancel_intent`,
   `steps[].unknown.next_intent_ref` — but **§0.19 deletes `steps[].unknown`** outright, ruling
   that "its `reason_code`, `label` and `next_intent_ref` are the `Cell`'s own" and retyping
   `steps[].state` as `Cell<'PENDING'|'RUNNING'|'DONE'|'SKIPPED'>`. A live path naming a void
   member produces no ref, so K22's set-equality rule is unsatisfiable for `PROGRESS`.
   **Amended to `cancel_intent`, `steps[].state.next_intent_ref`.**
2. **The escape verb is in no kind's `interactive_paths`, yet must be in `reading_order`.**
   §0B.36's `CONSENT_STATE` and `PAYMENT_HANDOFF` rows both require "the escape is always
   keyboard-reachable", §4.8 A-5 says so generally, and §0.25 mints exactly one `role: 'escape'`
   intent on every input-locked envelope — but K22 fixes `reading_order` as **exactly** the refs
   `interactive_paths` produces, and no kind lists the escape. The two rules cannot both hold.
   **K22's derivation is amended** to:

```ts
declare function refSet(paths: readonly string[], body: WidgetBody,
                        tier: RenderTier): InteractiveRef[];
       // Declared here under §0C.11-bis's rule, beside resolveInteractive: the ref set a
       // kind's interactive_paths produce against this body. K22's own recompute already
       // performs it; naming it gives the concatenation below a typed left operand.
       // `tier` is covered: §1.9 H1's term list gains `render.render_tier`, so a tier that
       // disagrees with the sealed reading_order breaks body_hash. The whole receipt cannot
       // be a term — R3.3.6 appends `target_classes` at delivery, after the seal — so the one
       // field the derivation reads is named, and nothing else.
       // `tier` is REQUIRED because CHART's declared path list is conditional — "and, when
       // degraded to `table`, `table_equivalent.rows[].row_key`" — and the degradation
       // outcome lives on `render: RenderReceipt`, not on `body`. §0.7 fixes EP-FIT before
       // EP-MINT, so the fitted tier is in hand when this is evaluated.

produced = refSet(KIND_REGISTRY[kind].interactive_paths, body, render.render_tier)
              .filter(r => r.k !== 'intent'
                        || emitted.some(i => i.intent_ref === r.id))
       // R1: the fitter WITHHOLDS intents (steps 1-3, 5) but never nulls the body ref that
       // names them, so a produced {k:'intent'} ref can denote an intent absent from
       // `emitted` — METRIC's drill_intent at TEXT_ONLY, FORM's discard_intent withheld at
       // step 2 or 3, CHOICE's more_intent on ANNOUNCEMENT. Unfiltered, resolveInteractive
       // is partial, nameSourceOf's totality is false, and A-3's DOM-order rule names a
       // control no renderer draws. The tier argument already puts the fitted list in scope.
reading_order = produced
              ++ [ { k: 'intent', id: i.intent_ref }
                   : i ∈ emitted, in emitted order,
                     refKey({k:'intent', id: i.intent_ref}) ∉ produced.map(refKey) ]
       // BOTH operands are InteractiveRef OBJECTS, matching §4.8's declared
       // `reading_order: InteractiveRef[]`. `++` is ORDERED concatenation, not `∪`:
       // §2 K22 requires render order and §4.8 A-3 requires DOM order to equal it, so an
       // unordered union would leave two conforming implementations free to differ.
       // The second operand is the CLOSED form — every emitted intent not already denoted by
       // a produced ref — not a role list. A role list was unsatisfiable: `role: 'more'` is
       // minted by §4.5.4 step 5 on ANY kind whenever the fitter dropped anything, while only
       // four kinds declare a `more_intent` path, so K22's set-equality failed for every
       // degraded envelope of the other eighteen. This form subsumes escape, remedy, `more`
       // and any future server-minted role by construction.
```

   **One ordering, stated once:** appended in `emitted` order, **except the escape, which is
   moved to the end of the appended segment**. On the four kinds whose `interactive_paths`
   already denote the escape — `BOOKING_CONFIRMATION` and `PAYMENT_HANDOFF` (`dismiss_intent`),
   `FORM` and `SETTINGS_DRAFT` (`discard_intent`) — **the escape is produced, not appended**, and
   its produced position governs; nothing is appended for it. The earlier wording gave two
   orderings for one list and asserted "the escape verb is in no kind's `interactive_paths`",
   which is false for exactly those four. `i.intent_ref` is the handle §0.28 fixes for a
   `{k:'intent'}` ref — never `intent_token`, which is opaque and null for a `NONE` effect.

   **`render` must be attached before this is evaluated**, and §1.1.1 said otherwise: its
   producer row gave `render` as "degradation ladder, at `EP-DELIVER`", which is *after*
   `EP-MINT`. **Amended to "at `EP-FIT`, attached to the envelope before `EP-MINT` seals"**, and
   §4.5.4 step 8 gains one sentence: the receipt is written to `envelope.render` before
   `body_hash` is computed. §0.7 already orders `EP-FIT → EP-MINT`, so this is a correction of
   the producer table, not a change to the pipeline.

   **Why this widens no authority — and why the first draft's ground was false.** It said "both
   added roles are `priority: 0` and `FLOOR_EXEMPT`". That is untrue of `remedy` on both
   conjuncts, and §0C.18 says so in terms: the L11 extension remedy is "deliberately NOT in this
   set", being a `REFINE` on the widget's **own owner capability**, which `FLOOR_EXEMPT`'s third
   clause refuses — it admits only a null capability, a `CONTROL` ref, or the single C9 row whose
   `resourceClass` is `LOCAL`, which enumeration confirms is `c9.no_action`. The true ground is
   stronger and needs no predicate: **the union ranges over `i ∈ emitted`** — intents that have
   already passed `verificationFloor`, §4.5.4's ladder and the fitter — and **`reading_order` is
   an accessibility ordering that gates nothing.** It adds no intent, waives no floor and confers
   nothing; a withheld remedy simply never enters the set.
3. **`MomentTemplate` is undeclared.** §4.9.4 PR5b is normative — "each moment template declares
   `required_cells: string[]`", and an emission is suppressed when any required `Cell` is
   non-`KNOWN` — but no shape declares a moment template. It is declared alongside EC-14's two
   registries and added to **P-32**:

```ts
interface MomentTemplate {
  moment_template_id: string;
  version: number;
  narrative_template_id: string;        // with the version below, composes the key
  narrative_template_version: number;   // REQUIRED — §1.6.5's Provenance already references a
                                        // narrative template by (id, version), and §4.2 replays
                                        // FROZEN receipts, so an id alone cannot resolve
  required_cells: string[];             // JSON Pointers into the body this moment composes
}
// R10: keyed by `${id}@${version}`, not by id alone. §1.6.5's Provenance references a
// template by (id, version) and §4.2 replays FROZEN receipts, so a single-version map cannot
// resolve the older version a stored receipt names — "the versioned catalogue" would not have
// been versioned as declared.
declare const MOMENT_TEMPLATES: Readonly<Record<`${string}@${number}`, MomentTemplate>>;

// NARRATIVE_TEMPLATES is named by §0.18, §1.6.5 P6 and §0.16 E-23 as "the versioned catalogue",
// and is declared by no shape anywhere in this contract — the same defect class §0C.11-bis
// states as a rule. Declared here, with MOMENT_TEMPLATES, and added to P-32:
interface NarrativeTemplate {
  narrative_template_id: string;
  version: number;
  locale_bodies: Readonly<Record<string, string>>;   // locale → template text
  slot_keys: readonly string[];                      // every interpolation slot the text names
}
declare const NARRATIVE_TEMPLATES: Readonly<Record<`${string}@${number}`, NarrativeTemplate>>;
```

   At `EP-REGISTRY-LOAD` every `MOMENT_REGISTRY` row resolves in `MOMENT_TEMPLATES` under the
   **composed key `` `${row.moment_template_id}@${row.moment_template_version}` ``**,
   **every `MomentTemplate` resolves in `NARRATIVE_TEMPLATES` under
   `` `${t.narrative_template_id}@${t.narrative_template_version}` ``** — the
   first draft left that requirement in a code comment only, so a moment naming a non-existent
   narrative template would have started the process — and every `required_cells` entry is a
   pointer that **`KIND_REGISTRY[row.kind]`'s leaf schema** admits, or the process does not
   start. Both members are read off the row, so EC-14's `Moment`
   declares them (§0C.28-bis); the first draft of this assertion read two members the shape did
   not carry, which would have evaluated `MOMENT_TEMPLATES[undefined]` for all twelve rows and
   stopped the process — fail-closed to the point of inertness, which §0C.20 rules a defect and
   not a safety property.

### EC-17 — `reading_order`'s membership has one typed authority, not two

**The defect, found while repairing EC-6.** Two clauses enumerate what a `reading_order` ref
may be, and they disagree. §2 K22 calls it "the union of `option_id`, `field_key`, `row_key`,
`entry_ref`, **`series_id`** and bare `intent_token`" — six names. §4.8's `InteractiveRef` is a
closed union of six **different** members: `option`, `field`, `intent`, `row`, `entry`,
**`section`**. K22 names `series_id`; the type declares `section` and has no series member. **Half of that is
a defect and half is not**, and the first draft of this ruling had it backwards: striking
`series_id` is right — §1.4 classes it **structural**, "never rendered", and no kind produces it
— but K22 "omitting `section_id`" is **not** a defect, because no kind's `interactive_paths`
produces a section ref either. `{k:'section'}` is the type's **unreachable member**, live only
if §4.8.2's REPORT row ("headings navigable") is later read as making headings tab stops, which
would require adding `sections[].section_id` to REPORT's `interactive_paths`. Until then it is a
declared-but-unproduced branch, which is harmless and is named here so nobody reads its
existence as a claim that something produces it. Verified against every kind's declared paths: **no kind's
`interactive_paths` names a `series_id`** — CHART's are `drill_intent`, `export_intent` and,
when degraded, `table_equivalent.rows[].row_key`; REPORT's are `fullscreen_intent`,
`export_intent` and `sections[].table.rows[].row_key`. `series_id` is listed in §1.4's
**structural** value class — "a value that is never rendered" — so it is not an interactive
element at all.

**The ruling.** **K22's prose enumeration is VOID as an enumeration.** `InteractiveRef`'s members — **seven** after §0C.22-sexies adds `{k:'slot'}` — are the typed
authority, and per-kind membership is what `KIND_REGISTRY[kind].interactive_paths` produces
**what `KIND_REGISTRY[kind].interactive_paths` produces, filtered so that no `{k:'intent'}` ref
names an intent absent from `emitted` (EC-21), plus every emitted intent not already denoted by
a produced ref, in `emitted` order (EC-18 item 2 as amended by EC-20 and EC-21)** — which is
what K22's *mechanism* already performs ("`validateEnvelope` recomputes the ref set from
`interactive_paths` and refuses on any difference"), over the widened set. K22's rule and
mechanism stand **as amended by EC-18**; only its illustrative list is struck, because a list
that drifts from the type it illustrates becomes a second, wrong answer. The two rulings are
read together; neither says "exactly" without the other, and that wording was the
contradiction. *Mechanism:*
K22's own recompute-and-compare. *Evaluation point:* `EP-MINT`.

### EC-16 — two stale counts, corrected rather than restated

1. **"The fourteen fundamental rules."** §0C.14's heading and §0C.32 say fourteen. The
   contract declares **FR-1 … FR-16 with FR-6 splitting into FR-6a … FR-6f — sixteen rules
   over twenty-one rows.** Both are corrected to "the sixteen fundamental rules (twenty-one
   rows)", and §0C.32 states per row whether a rule holds outright or holds **fail-closed
   because a component is absent**, as §0B.28 already does for the FR-6 family.
2. **§A5's prerequisite arithmetic.** "§A1 enumerates **22 prerequisites**: 18 `[ABSENT]`,
   2 `[PARTIAL]`, 2 `[UNENFORCEABLE-TODAY]`" sums to 22 but predates §0B.41's six rows and
   §0C.29's four, and its per-status tally no longer matches §A1. **§A5's tally is VOID as a
   restatement.** The total is **32 prerequisite rows** (§A1's 22 + §0B.41's 6 + §0C.29's 4),
   and the per-status counts are **derived from `MECHANISM_GAP_LEDGER` at build and printed
   from it**, never transcribed into prose — which is the whole reason EC-5 introduces the
   ledger. A prose count that can drift is a count that will.

---

## 0-C.11 Prerequisites registered by this section

**S0C.29.** Continuing the series, under §A2's `NORMATIVE-PENDING` rule and its fail-closed
default. All four carry `gap_key`s in the new `MECHANISM_GAP_LEDGER` of EC-5.

| # | `gap_key` | Component | Depends on it | Status | Package |
|---|---|---|---|---|---|
| **P-29** | `MG-P29` | **`MECHANISM_GAP_LEDGER`** — the mechanism-gap table of §0C.20, its `gap_key` column on §A1, and the restated §A2.4 start-up assertion | §A2.4, §A2.5, §A2.6, §A2.8 and every `NORMATIVE-PENDING` status claim in the contract | `[ABSENT]` — §A1 has no `gap_key` column today | **K1** (wave 1, with the capability gap ledger) |
| **P-30** | `MG-P30` | **The gateway's record fields and the spoken readback path** — `ReadbackAck`, the two new `confirmation` members, `IntentRecord.body_hash`, `.selection_domain`, `.c9_domain`, `.priority` and `.widget_kind` (the last two REQUIRED for Gate 5's recompute), Gate 8-R, and the per-locale closed affirmation vocabulary | §4.7 V4; §4.5.3's `SPOKEN` → `COMMIT` permission; §0.34's `SUPERSEDED` comparison | `[ABSENT]` — no carrier, no record field and no gate exists; `readback` has one unrelated occurrence repo-wide | **K3** (wave 2, with the gateway) |
| **P-31** | `MG-P31` | **`A11yBlock.accessible_names`** — the per-control map of §0C.22-bis, its mint-class-M composer, and the two totality rules over `reading_order` | §4.8 A-2 and A-5; §4.8.2's per-kind rows; every accessible-name CI check | `[ABSENT]` — `A11yBlock` declares no accessible name of any kind, and is one block per envelope | **K2** (the shape) + **K5** (the composer, wave 2) |
| **P-32** | `MG-P32` | **`MOMENT_REGISTRY`, `NOTIFICATION_CONSENT_REGISTRY`, `MOMENT_TEMPLATES`, `NARRATIVE_TEMPLATES` and `ProactiveProvenance.notify_pref_key`** — the closed twelve-row moment catalogue, the delivery-permission table it resolves into, the moment templates PR5b's `required_cells` suppression reads, and the delivery-time consent read | §4.9.3 PR3c; §4.9.2 PR2 (b); the twelve-row totality of `MOMENT_REGISTRY` (§0C.28-bis EC-14) | `[ABSENT]` — neither the member nor the registry is named anywhere else in the contract | **K13** (wave 5) |

**S0C.30 — the existing twenty-eight rows are unchanged**, and each now carries
`MG-P01` … `MG-P28`; with §0C.29's four the ledger is total over **thirty-two** rows. No row's status changes in this section: EC-1 … EC-10 repair what the
contract *says*, not what is *built*, and every repaired rule remains `NORMATIVE-PENDING` on
the components Annex A and §0B.41 already registered as `[ABSENT]`.

---

## 0-C.12 What remains explicitly non-normative

**S0C.31.** These statements are true, are retained because they are informative, and are
**marked non-normative**: no implementation is bound by them and no gate reads them.

1. **§0B.23 / §0C.6's repository observations** — the ungated second door
   `communication.bulk-campaign.execute.v1`, the 164-of-221 permissive role default,
   `permissionCodes` validated but never evaluated, `riskFacets` as an open vocabulary,
   `decideApproval` not comparing approver to initiator, and `crm.visit.payment.v1` being
   `DENY`. Each is a finding about the running system and **none is a widget-contract rule**.
   Owner action on them belongs outside this contract.
2. **§0.35's "honest strength" paragraph** — that the Action Engine's independent fence is
   shape, source-type and durable attribution rather than a second authorisation. It
   describes a mechanism; it does not impose one.
3. **Every `[NON-NORMATIVE]` paragraph already marked as such in §§1–4**, including §4.1.3's
   WCAG 2.2.1 repair note and §4.2's rehydration rationale.

---

## 0-C.13 Errata — what this section voids

| # | Where | What it says | Ruling |
|---|---|---|---|
| **EC-1** | §0B.21 | `crm.appointment.{attendance,duration,services,fields}.v1` allowlisted with `confirmation_kind: 'BOOKING_CONFIRMATION'` | **VOID as allowlist rows.** No propose key exists in any space and none may be inferred (§0B.12) or added (FR-16). → `AE_CAPABILITY_GAP_LEDGER` under **`GAP-APPOINTMENT-DETAIL-COMMIT`**. Allowlisted `BOOKING_CONFIRMATION` membership becomes **3**. §0C.5 |
| **EC-2** | §0B.31 `c9Floor` | `aiToolRegistry.get(key)?.riskTier ?? 'restricted'` on the C9 branch, glossed "valid: 47 of the 56 resolve" | **VOID.** `AiToolRegistryService.get()` throws rather than returning a nullable, so the branch raises for nine keys and `verificationFloor` is not total. Replaced by a branch over `mode`, `resourceClass` and a pure catalogue lookup, with a no-lowering build assertion. §0C.10 |
| **EC-3** | §0.34 guard; §0B.13(3) | a non-`draft` `COMMIT` is mintable only against a consumed **`REFINE`/`DRAFT`** record whose capability equals the propose key | **Amended to a two-row table.** `'record'` → `REFINE`/`DRAFT`, compared to the row's **C9 `propose`** side. `'approval'` → `REQUEST_APPROVAL`, compared to the row's **AE `ae`** side — because §0.32/§0B.7 put a `REQUEST_APPROVAL`'s ref in AE and the propose side in C9, and the two spaces are disjoint. §0C.13, §0C.13-bis |
| **EC-3b** | §0B.13(2) | the `propose: null` + `confirmation_kind: 'APPROVAL'` escape | **VOID.** Unnecessary after EC-3 and unsatisfiable with §0B.13(3). Every allowlisted key must be the `ae` side of exactly one pairing row. §0C.13 |
| **EC-4** | §4.5.4 step 1; §0.13 `verificationFloor`; §2.6.15 SOURCE.3 | withhold **every** intent below the floor, before step 4's PIN; `reconnect_intent` undroppable in prose only | **Amended.** A **derived**, build-vetoed, non-actuating `FLOOR_EXEMPT` set — keyed on `priority === 0` plus three exclusion clauses, never on a list of names — waives `EFFECT_FLOOR`, `KIND_FLOOR` and `targetFloor` — and, **for a class-`s` `HANDOFF` only**, the destination subject term, which alone floors at `ANONYMOUS`. **Every other exempt intent keeps `subjectFloor(subjectCapability(i))`**, so `control.run.cancel` retains `CONTROL_FLOOR: BOUND_CLIENT` even at `priority: 0`, and `SENSITIVE_DEST` excludes consent and identity destinations outright. Five intents satisfy it. SOURCE.3 gains `priority: 0`. Steps 2, 3, 5, 6 still apply. §0C.17, §0C.17-bis, §0C.17-ter, §0C.17-quater |
| **EC-5** | §A2.4 | "every `[ABSENT]` mechanism named in §A1 is bound to its gap key" | **Amended.** §A1 has no such column and the capability ledger holds a different kind of gap. A separate `MECHANISM_GAP_LEDGER` (`MG-P01` … `MG-P32`, total over all thirty-two prerequisite rows) is introduced and the assertion restated over it. §0C.20 |
| **EC-6** | §4.8 A-2; §4.8 `A11yBlock` | "Accessible name = `intent.utterance`, verbatim" | **VOID.** `WidgetIntent` declares no `utterance`. Replaced: `intent.label` + the §4.8.2 row's composition, `intent.label` alone otherwise; §4.8.2 is the sole per-kind owner. `A11yBlock` gains `accessible_names: Record<InteractiveRefKey, string>` keyed through the declared total injective `refKey(ref)` (mint class M, inside `body_hash`), because the block is one per envelope and declared no name at all; and the name source is `nameSourceOf(ref, env)`, total over `InteractiveRef`'s **seven** members, because only `{k:'intent'}` denotes a `WidgetIntent`, a FORM's field refs have labels of their own, and `STRATEGY_OPTIONS.alternatives[]` declares `title` rather than `label`. §0C.22, §0C.22-bis, §0C.22-ter, §0C.22-quater, §0C.22-quinquies, §0C.22-sexies, §0C.22-septies |
| **EC-7** | §0B.25 / §0B.16 | FR-6e's tenant-object half, asserted with no mechanism of its own | **Amended.** §0B.16 gains `row ⟹ TENANT_AUTHORITY(cap) ⟹ fail`. FR-6e held before and holds after; it is now a checked assertion. §0C.23 |
| **EC-8** | §2.6.5 BOOK.1, 2nd sentence | "ACTION ENGINE INGRESS independently re-derives the subject … and refuses" | **VOID**, on §0.35's ground for K11 and BOOK.2: `TrustedActionExecutionRequestV1` carries no widget field and passing one would breach FR-1/FR-2/E3. BOOK.1's mint-time half stands. §0C.24 |
| **EC-9** | §4.7 V4; §3.7 `IntentRecord` | "the gateway refuses a `COMMIT` from a `SPOKEN` profile with no readback confirmation reference" | **Retained and made constructible.** `requires_readback` already exists on `ConfirmationRequirement`; §4.7's `requires.…` is a wrong container, corrected to `confirmation.…`. Added: `readback_ref` + `readback_text`, `ReadbackAck` on §3.8, `IntentRecord.body_hash` + `.selection_domain`, and **Gate 8-R keyed on `record.confirmation?.requires_readback`** — never on the submission's `profile_id`, which R3.8.3 declares advisory and not an authority input. §0C.26, §0C.26-bis, §0C.26-ter |
| **EC-10** | §4.9.2 PR2 (a) | "the capability registry marks run-opening capabilities" | **VOID** — it requires a `C9Capability` field, changing `C9_REGISTRY_HASH`, which §0.3 and FR-16 forbid. Replaced by `RUN_OPENING(ref)` over the existing `mode` member (15 of 56), read through the one declared accessor `c9Registry.tryGet` with a fail-closed `?? 'PROPOSE_ONLY'` default. Mechanism (b) stands. §0C.28 |
| **EC-11** | §0B.18 Gate 6, `C9` branch | one `assertCanExecute` call for the whole C9 space | **Amended.** Nine of the 56 C9-CAP keys are not catalogue names, so no `AiToolDefinition` exists for them. Gate 6 gains a second C9 branch — the `WIDGET_CAPABILITY_POLICY` row plus `c9Capability`'s own admission. Here a throwing accessor is correct: Gate 6 is a refusal point. `c9Capability`'s required `C9Domain` argument had no carrier, so `IntentRecord.c9_domain` is declared. §0C.28-bis, §0C.28-ter |
| **EC-12** | §2.2 K2 closing ¶; §2.6.17 FORM.2 | "a fourth evaluation happens at INGRESS … the ACTION ENGINE INGRESS re-derives the kind rule from `IntentRecord.widget_kind`" | **VOID**, on §0.35's ground for K11/BOOK.2 and §0C.24's for BOOK.1. `widget_kind`/`widgetKind` have 0 occurrences under `src/action-engine`, and passing one would breach FR-1/FR-2/E3. §0C.28-bis |
| **EC-13** | §2 K13; `KIND_REGISTRY.max_commit_intents` | typed `0 \| 1`, fixed at `1` for the four confirmation kinds | **Amended to `0 \| 1 \| 2`**, with `2` admissible for `APPROVAL` alone under a build veto, and the pair constrained to one `approval_ref`, one AE key and single-use across the pair. Without this an APPROVAL body could not mint both decisions, which §0.47 requires. §0C.28-bis |
| **EC-14** | §4.9.3 PR3c | "`notify_pref_key` must resolve in the notification-consent registry" | **Retained and made constructible.** Neither the member nor the registry existed. `ProactiveProvenance.notify_pref_key` (mint class D) and the closed twelve-row `MOMENT_REGISTRY` are declared, with a start-up assertion that every row's key resolves. §0C.28-bis |
| **EC-15** | §3.7 `IntentRecord` | `body_hash` and `selection_domain` read by Gate 8-R and by the `SUPERSEDED` comparison | **Declared.** Both added, mint class D, `AUDIT_RETAINED`, in **P-30**'s component list. §0C.26-ter, §0C.28-bis |
| **EC-16** | §0C.14 heading, §0C.32; §A5 | "the fourteen fundamental rules"; "§A1 enumerates 22 prerequisites: 18/2/2" | **Corrected.** Sixteen rules over twenty-one rows, each stated as holding outright or holding fail-closed. §A5's tally is **VOID as a restatement**: 32 prerequisite rows, per-status counts derived from `MECHANISM_GAP_LEDGER` at build, never transcribed. §0C.28-bis |
| **EC-21** | §0C.17's two floor predicates; §0.13's input list; §0C.28-sexies's `produced`, ordering and `render` timing; §0C.22-quinquies's suffix value; §0C.22-ter's `resolveInteractive`; §0C.18's bound; EC-14's catalogues; Gate 6's HANDOFF branch; EC-17's citation | sixteen residuals the EC-20 confirmation raised, all adjudicated CONFIRMED | **Amended.** `FLOOR_EXEMPT`/`verificationFloor` re-declared over a structural `FloorSubject`, without which Gate 5 still could not recompute them from an `IntentRecord` — the defect EC-19 added `priority` for and EC-20 left one call deeper. §0.13's closed input list names `priority` as its fifth input. `produced` is filtered against `emitted`, because the fitter withholds intents without nulling the body refs that name them. One ordering, with the four kinds whose paths already denote the escape called out. §1.1.1's `render` row moves to `EP-FIT`, since a tier read at `EP-MINT` must exist by then. The suffix gains an explicit `base` and a declared `renderSuffix`; its default is an empty list, not `''`. `resolveInteractive` is indexed by ref kind. §0C.18's bound is stated as three grounds, only one of which is the veto. Both template catalogues are keyed `id@version`, so a frozen receipt's older version resolves. **Gate 6 is scoped by effect: a `HANDOFF`'s subject resolves destination fences only, never an execute-admission test.** §0C.17-quinquies, §0C.22-undecies, §0C.28-quinquies |
| **EC-20** | §0C.28-sexies's derivation; §0C.22-quinquies's value type; §3.7; §0C.28-quater; §0B.18; §1.1.4; §0C.18; §0C.11-ter; EC-14's `MomentTemplate` | twenty-one residuals the bounded verification of EC-19 raised | **Amended.** The `reading_order` second operand becomes the **closed** form — every emitted intent not already denoted — because a role list left `role: 'more'` unsatisfiable on eighteen kinds; the operator becomes ordered concatenation, since `∪` left `remedy` unpositioned against K22's render-order rule. `refSet` takes the fitted tier, because CHART's path list is conditional on degradation, which lives on `render`, not `body`. `accessible_name_suffix`'s VALUE becomes `readonly string[]` of pointers — a string would have concatenated `audience_size` literally. APPROVAL.4 and ARTIFACT.3 assign the roles the per-control scoping needs. `IntentRecord` gains `widget_kind` and its `handoff_capability_ref` is retyped, without which Gate 5 still could not recompute; `subjectCapability` is re-declared over a structural subject both shapes satisfy. §0C.28-quater's refusal is re-keyed on `subjectCapability` — a run-bearing `HANDOFF` escaped it. `NARRATIVE_TEMPLATES` declared. §0C.18's "exactly five" gains a build veto. §0C.22-octies, §0C.22-nonies, §0C.28-septies |
| **EC-19** | §3.1 `AuthorityHint`; §3.7 `IntentRecord`; §0C.28-bis EC-14's `Moment`; §0C.22-quinquies's suffix key; §0C.28-bis Gate 6 call site; §0C.28-quater; §0C.32's EC-2 row; EC-17 vs EC-18 | eight defects the final pass confirmed | **Declared / amended.** `AuthorityHint` declared with a closed non-authority member set (§0C.11-ter). `IntentRecord` gains `priority`, without which Gate 5 cannot recompute `FLOOR_EXEMPT` and every exempt intent would diverge under §0.16. `Moment` gains `kind` and `moment_template_id`, which EC-18(3)'s assertion reads. The suffix keys on `${ref kind}:${role}` so APPROVAL's suffix reaches the approve control alone. Gate 6's call site binds `ref = subjectCapability(record)` — the dispatch was repaired in round 10 and the call two lines below was not, leaving it inert for `HANDOFF`. §0C.28-quater names minter 3. §0C.32's EC-2 row is scoped per path. EC-17 reads "as amended by EC-18". §0C.11-ter, §0C.28-sexies |
| **EC-18** | §2.6.13 PROGRESS; §2 K22's derivation; §4.9.4 PR5b | `steps[].unknown.next_intent_ref` as a live path; `reading_order` = exactly `interactive_paths`; "each moment template declares `required_cells`" | **Amended / declared.** §0.19 deleted `steps[].unknown`, so PROGRESS's path becomes `steps[].state.next_intent_ref`. K22's derivation appends **every emitted intent not already denoted by a produced ref** — the closed form, because a role list left `role: 'more'` unsatisfiable on eighteen kinds — in `emitted` order with the escape last. No authority widens: the operand ranges over intents that already passed the floor and the ladder, and `reading_order` is an accessibility ordering that gates nothing. (The first draft justified this by "both are `priority: 0` and `FLOOR_EXEMPT`", which is false for `remedy` and contradicted §0C.18.) `MomentTemplate` + `MOMENT_TEMPLATES` are declared. §0C.28-sexies |
| **EC-17** | §2 K22, its enumeration | "the union of `option_id`, `field_key`, `row_key`, `entry_ref`, `series_id` and bare `intent_token`" | **VOID as an enumeration.** It names `series_id` — which §1.4 classes **structural**, "never rendered", and which no kind's `interactive_paths` produces — and omits `section_id`. `InteractiveRef`'s **seven** members are the typed authority — the seventh, `{k:'slot'}`, added by §0C.22-sexies because `TIME_SLOT_SELECTOR`'s declared path `groups[].slots[].slot_ref` could be denoted by none of the six; K22's rule and mechanism stand **as amended by EC-18 item 2 and EC-20** (every emitted intent not already denoted by a produced ref joins the list, in `emitted` order). §0C.28-bis, §0C.22-sexies |

---

## 0-C.14 The sixteen fundamental rules after this section

**S0C.32 — what this section does and does not claim, stated so that no sentence of it is
larger than its proof.** The contract declares **sixteen** fundamental rules, FR-1 … FR-16,
with FR-6 splitting into FR-6a … FR-6f — **twenty-one rows**. All twenty-one hold. Many hold
**fail-closed because a component is absent**, and that is said here rather than hidden: a
rule that holds because no allowlist exists yet is a rule that holds, but it is not a running
fence, and §0B.28 already draws that line for the FR-6 family.

**The blanket sentence this section used to carry was false, and it is withdrawn.** It read:
"No repair lowers a floor, admits a capability, widens an allowlist, or relaxes a veto." The
first three conjuncts are true and provable. The fourth is not: **two repairs lower a floor,
and both do so deliberately.** Replacing it:

> **No repair admits a capability, widens an allowlist, or relaxes a veto.** Every repair
> either removes rows from an allowlist (EC-1), adds a veto (EC-7, EC-13), voids an
> unbuildable claim (EC-8, EC-10, EC-12), declares a carrier that was missing (EC-6, EC-9,
> EC-14, EC-15), or corrects an identity or a count (EC-3, EC-5, EC-11, EC-16).
>
> **Two repairs lower a floor, deliberately, and each names its compensating fence:**
>
> | Repair | What it lowers | Why, and what still holds |
> |---|---|---|
> | **EC-2** | nine C9-CAP keys, from a raise (literal reading) or `STEP_UP_VERIFIED` (charitable reading) to: **three** `SOURCE_HANDOFF` keys (`b35.preview`, `b35.confirm`, `a22.configuration`) → `SESSION_VERIFIED`; **five** `SOURCE_READ` keys (`c7.measurement.read`, `c8.result.read`, `b35.status`, `owner_report.status`, `owner_report.download`) → whatever their own `WIDGET_CAPABILITY_POLICY` row and consent class require, per §0C.11(4); and `c9.no_action` → `ANONYMOUS` | `STEP_UP_VERIFIED` is **unreachable** while P-12 is `[ABSENT]`, so the prior value was not a fence but a permanent withholding that made five widget kinds unemittable. What still fences these nine: their `WIDGET_CAPABILITY_POLICY` row and `CONSENT_CLASS_FLOOR`, carried through `c9Floor` at Gate 5 on **every** path — and, **on the run-bearing path only AND only where the intent is not a `HANDOFF`**, Gate 6's second C9 branch with `c9Capability`'s own admission. EC-21 scopes Gate 6 by effect, so for a `HANDOFF` subject that admission is not applied on **any** path — which is the case for `b35.preview`, `b35.confirm` and `a22.configuration`, whose `resourceClass` is `SOURCE_HANDOFF`. Their whole fence is therefore `c9Floor`'s `C9_MODE_FLOOR`/`C9_RESOURCE_FLOOR` of `SESSION_VERIFIED` at Gate 5, plus `SENSITIVE_DEST` and `targetFloor('s')`. §0C.28-quater withdraws that admission on the two run-less mint paths, where `c9_domain` is null by construction, so for a capability read of `c7.measurement.read`, `c8.result.read`, `b35.status`, `owner_report.status` or `owner_report.download` the residual fence is the policy row and the consent class alone. Stated rather than implied, because an unqualified claim here would be exactly the over-read this table exists to prevent. The bulk-send path additionally keeps `AE_FAMILY_FLOOR['marketing_fanout'] = STEP_UP_VERIFIED` and `communication.bulk-campaign.admit.v2`'s owner-only, approval-bound AE fence, which is `[EXISTS]` and running today |
> | **EC-4** | five intents: `EFFECT_FLOOR`, `KIND_FLOOR` and `targetFloor` waived for all five; `subjectFloor` waived for the **two class-`s` HANDOFFs only**, which floor at `ANONYMOUS`. The escape verb, `discard_intent` and the no-action option keep their own `subjectFloor` (§0C.17-ter) | The set is derived, not listed, and its build veto makes an actuating intent unconstructible: `COMMIT`/`DRAFT` excluded by effect; `REQUEST_APPROVAL` and `REFINE` excluded over AE and C9 respectively by the capability clause, which admits only a `CONTROL` ref or the unique `resourceClass: 'LOCAL'` C9 row. The residual is `targetFloor('s')` on a handoff, and it is tolerable for a stated reason, not by assumption: a `HANDOFF` never invokes its destination capability (R3.5.3), and §0.31's routes re-check the principal proof at `EP-FETCH`. Declining, discarding and asking for the route to a surface that authenticates are not the exercise of authority |
>
> A reader auditing this contract should be able to find every floor reduction it makes by
> reading this table. There are two.
>
> **One repair removes a floor *raise* this section's own first draft had introduced**, and it
> is recorded here for symmetry: EC-2 first set `C9_RESOURCE_FLOOR['SOURCE_READ']` to
> `SESSION_VERIFIED`, raising the floor of 40 of the 56 C9-CAP keys and breaking the
> `ANONYMOUS_CHAT` and `PUBLIC_READ` tiers §0.13 had explicitly protected. It now returns
> `ANONYMOUS` and a read's floor is once again its own policy row plus Gate 6 (§0C.11(4)).
> An unasked-for raise is a defect too: it withholds capability while looking like caution.

**S0C.33 — what remains open after this section, named rather than implied.** Every repair
above changes what the contract *says*. **None of it is built.** Thirty-two prerequisite rows
stand at `[ABSENT]`, `[PARTIAL]` or `[UNENFORCEABLE-TODAY]`, the widget layer does not exist,
and every rule this section repairs is `NORMATIVE-PENDING` on the rows §A1, §0B.41 and §0C.29
register. The correct reading of this contract today is: **the rules are now implementable
and their mechanisms are named; the mechanisms are not running.** That distinction is the
one this whole certification arc exists to preserve.

---

## 1. Envelope, values and provenance

### 1.0 How to read this section

Every sentence below is normative unless it is prefixed `[NON-NORMATIVE]`. Every normative rule names the **mechanism** that enforces it and the **evaluation point** at which the mechanism runs. A rule with no mechanism is not written down; where the first edition made a guarantee no mechanism can produce, this section withdraws the guarantee (§1.10) instead of softening it.

**Evaluation points.** Six, closed. Every rule cites at least one.

| id | Evaluation point | Runs in | A refusal here means |
|---|---|---|---|
| `EP-COMPOSE` | the registered projector builds `body` from one capability read | widget layer, inside the emitting request | the body is never offered to the minter; the answer degrades to plain text |
| `EP-MINT` | `widgetEnvelope()` structural validation, then `EnvelopeMinter.seal()` | widget layer, same request | **no envelope exists**; nothing is delivered, nothing is stored |
| `EP-DELIVER` | channel adapter, after the degradation ladder has run server-side | widget layer | the envelope is delivered degraded, or not at all |
| `EP-RENDER` | renderer verifies seal, `seal_key_version` and expiry before drawing | client (web bundle, Telegram materialiser, notification materialiser) | the renderer draws `presentation.text_equivalent` as frozen prose plus one `REFINE` intent |
| `EP-INGRESS` | `IntentGateway` on submission, gates in order | widget layer, server | the submission is refused or superseded; no canonical owner is reached |
| `EP-CI` | repository test run over recorded emission fixtures and over source | build | the build fails |

**Mint classes.** Every field of every shape in this contract carries exactly one:

| class | meaning |
|---|---|
| **M** | *server-minted* — produced by a named pure server function; recomputed and compared byte-for-byte at `EP-MINT` |
| **D** | *server-derived* — computed from server state (registry, session, policy) at `EP-MINT`, and recomputed at `EP-INGRESS` where it gates anything |
| **C** | *copied verbatim* from a canonical source artefact; equality to the source is checked by digest at `EP-MINT` |
| **E** | *emitter-supplied* — the projector may author it; it is structurally incapable of conferring authority (§1.1.2) |
| **Ø** | *structurally absent from the composer input* — there is no field on the input type to supply it, and the closed-shape input validator refuses unknown fields |

[NON-NORMATIVE] The mint class column is the whole safety argument of this section compressed into one letter per field. Everything that decides what a user may do is **D** or **M**; everything an emitter writes is **E**, and **E** fields decide presentation only.

---

### 1.1 `maya.widget.envelope/1`

#### 1.1.1 Root shape

```ts
interface WidgetEnvelope {
  contract: 'maya.widget.envelope/1';   // literal
  widget_id: string;                    // ULID, 26 chars, unique per EMISSION
  kind: WidgetKind;                     // closed union, §2 (Kinds)
  body_version: number;                 // integer 1..999, per kind, bumped independently
  tenant_id: string;                    // uuid v4, root only

  correlation: Correlation;             // §1.1.4
  source: WidgetSource;                 // §1.1.5
  origin: Origin;                       // §4 (Platform and channels)
  authority: AuthorityEnvelope;         // §3 (Authority), carries `verification_level` (§1.7)
  body: WidgetBody;                     // §2 (Kinds) — read model, no writable field
  intents: WidgetIntent[];              // §5 (Intents), 0..12
  provenance: Provenance;               // §1.6
  limitations: Limitation[];            // §1.6.6, 0..20, REQUIRED (may be empty)
  lifecycle: Lifecycle;                 // §6 (Lifecycle)
  presentation: Presentation;           // §7 (Presentation), carries `text_equivalent`
  render: RenderReceipt;                // §4 (Platform and channels)
  integrity: Integrity;                 // §1.9
}
```

| field | type / bound | class | who produces it |
|---|---|---|---|
| `contract` | literal `'maya.widget.envelope/1'` | M | the minter |
| `widget_id` | ULID, exactly 26 Crockford-base32 chars | M | `EnvelopeMinter` |
| `kind` | member of the closed `WidgetKind` union | D | `allowedKinds(capability)` applied to `WidgetComposerInput.kind_proposal` |
| `body_version` | int, 1..999 | M | the kind's registered body schema version |
| `tenant_id` | uuid, root only; the key `tenant_id` at any other depth is refused | D | `TenantContextService.requireTenantId()` |
| `correlation` | §1.1.4 | E (ids) / M (`trace_id`) | projector; `trace_id` from the request |
| `source` | §1.1.5 | E | projector |
| `origin` | §4 | E | projector / scheduler |
| `authority` | §3 | D | `AuthorityResolver`; `verification_level` per §1.7 |
| `body` | the kind's registered body schema | E (slot bindings) / M (every rendered leaf, §1.2) | projector proposes slots; the formatter mints every rendered value |
| `intents` | array 0..12 | D (capability, floor) / M (`intent_token`) | `IntentMinter` |
| `provenance` | §1.6 | C (facts) / D (rest) | copier + minter |
| `limitations` | array 0..20 | C (codes) / M (text) | copier + formatter |
| `lifecycle` | §6 | D | minter |
| `presentation` | §7 | M | `renderPresentation()` / `renderTextEquivalent()` |
| `render` | §4 | D | degradation ladder, at `EP-DELIVER` |
| `integrity` | §1.9 | M | `EnvelopeMinter` |

**E1 — byte bound.** A serialized `WidgetEnvelope` MUST NOT exceed 32768 bytes. *Mechanism:* `widgetBytes(value, 32768)`, the widget-layer twin of `c9Bytes` (`maya-saas-backend/src/orchestration/c9.contract.ts:125`), which is what bounds an `AgentResult@1` today. *Evaluation point:* `EP-MINT`. An over-size envelope is not truncated; the composer re-runs the density reduction of §4 and emits a smaller body, or emits nothing.

**E2 — closed shape, no unknown fields.** `widgetEnvelope()` is a closed-shape validator built from the same primitive family as `c9Shape` / `c9Enum` / `c9Int` / `c9Nullable`. Any key not declared in this contract, at any depth, is refused with `unknown_field`. *Evaluation point:* `EP-MINT`.

**E3 — forbidden keys.** No key named `arguments`, `payload`, `state` *(outside a declared body enum field)*, `role`, `permissions`, `token`, `tenant_id` *(outside the root)*, `client_id`, `staff_id`, `record_id`, `is_staff`, `is_owner`, `__meRole`, `__meIsStaff`, `__meIsFounder` may appear at any depth of `WidgetEnvelope` or `WidgetIntentSubmission`. *Mechanism:* the forbidden-key validator, a total walk over the serialized value. *Evaluation points:* `EP-MINT` and `EP-INGRESS`. [NON-NORMATIVE] This exists because the live defect in this codebase is a third authority path (`localStorage.me_is_staff` routing before any server call); a widget layer able to carry an identity key would become a fourth.

**E4 — `widget_id` is addressing only.** No canonical table may hold a foreign key to `widget_id`. *Mechanism:* a schema test asserting the absence of such a column. *Evaluation point:* `EP-CI`. [NON-NORMATIVE] This is what makes "deleting conversation history leaves canonical records correct" a schema property rather than a promise.

#### 1.1.2 What an emitter may supply: `WidgetComposerInput`

```ts
interface WidgetComposerInput {            // the ONLY type a projector may hand the minter
  kind_proposal: WidgetKind;               // E — validated against allowedKinds(capability)
  capability: string;                      // E — must resolve in the capability canon
  capability_version: string;              // E — must equal the canon's current version digest
  source: WidgetSource;                    // E
  correlation_refs: CorrelationRefs;       // E — run/turn/message/parent ids only
  origin: Origin;                          // E
  facts: FactUsed[];                       // C — copied whole from the source (§1.6.3)
  facts_origin: Array<'copied' | 'synthesised'>;  // E — parallel to `facts`, same length
  slots: Record<string, SlotBinding>;      // E — each names a fact index or a phrase key
  limitation_codes: string[];              // C — reason codes, 0..20
  intent_proposals: IntentProposal[];      // E — capability (or handoff_capability_ref),
                                           //     argument handles, role. No token. No floor.
  locale: string;                          // E — BCP-47, must be in the shipped catalogue set
}

type SlotBinding =
  | { from: 'fact'; fact_index: number; measure_key?: string }
  | { from: 'phrase'; phrase_key: string; params?: Record<string, number /* fact_index */> };
```

**E5 — the composer cannot supply authority, text, or proof.** `WidgetComposerInput` has **no** member named `required_verification`, `verification_level`, `principal_proof_hash`, `intent_token`, `body_hash`, `envelope_seal`, `text_equivalent`, `label`, `basis`, `completeness`, `authorship`, `evidence_refs`, `widget_id` or `expires_at`. *Mechanism:* two, jointly — the shape genuinely cannot be constructed (no field exists on the TypeScript input type), and `widgetComposerInput()` is a closed-shape validator that refuses any unknown key with `unknown_field`, so a value cast through `any` is rejected as data. *Evaluation point:* `EP-MINT`, before any hashing. *Consequence (normative):* everything in §1.7, §1.8 and §1.9 is **D** or **M** by construction; an emitter-supplied value for any of them does not exist to be read, and §1.8 additionally re-derives its own inputs at `EP-INGRESS`.

#### 1.1.3 Capability version and registry drift

`WidgetSource.capability_version` is the version digest of the capability canon entry that the body was projected from. For a key that resolves in the released C9 registry it is `C9_REGISTRY_HASH` (`maya-saas-backend/src/orchestration/c9.registry.ts:177`).

**E6 — drift is a re-mint, never a silent failure.** When `capability_version` does not equal the canon's current digest at `EP-INGRESS`, the submission is refused with `SUPERSEDED` and the gateway returns a freshly composed equivalent envelope; when the capability no longer resolves at all, the outcome is `UNAVAILABLE` with a `Limitation` and, if the remedy has no owner, a `capability_gap_ref`. *Mechanism:* `c9Capability(key, domain, registryHash)` already denies a hash mismatch with `registry_version_unavailable` (`c9.registry.ts:178-190`); the gateway maps that denial through the projection table of §1.6.7. *Evaluation point:* `EP-INGRESS`. [NON-NORMATIVE] This is the envelope-level behaviour only. Whether the canon may contain keys the frozen C9 registry does not is decided in §2; this rule states what happens to outstanding envelopes either way, and it is deliberately a neutral re-mint rather than an error.

#### 1.1.4 `Correlation`

```ts
interface Correlation {
  run_id: string | null;        // E — C9 run id when the orchestrator minted it; NULLABLE BY DESIGN
  turn_id: string | null;       // E
  message_id: string | null;    // E — durable chat message this envelope is anchored to
  agent_id: 'ADMIN' | 'CLIENT_LIFECYCLE' | 'OCCUPANCY' | 'BUSINESS_INTELLIGENCE' | null;  // C
  parent_widget_id: string | null;  // E — ULID of the preceding step in a chain
  step_index: number | null;    // E — int 1..12
  step_total: number | null;    // E — int 1..12, ≥ step_index
  trace_id: string;             // M — the request trace
}
```

`run_id` is nullable because two paths mint envelopes: a coordination run (`POST /api/orchestration/runs`) and a registered capability read. *Mechanism for the safety equivalence:* both draw `capability` from the same canon and both pass the same `EP-MINT` validator; nothing in §§1.6–1.9 branches on `run_id`.

#### 1.1.5 `WidgetSource` — the pointer

```ts
type WidgetSource =
  | { from: 'capability_envelope'; capability: string; capability_version: string;
      fact_index: number }
  | { from: 'agent_result'; run_id: string; result_seq: number; path: AgentResultPath }
  | { from: 'action_intent'; run_id: string; result_seq: number; intent_index: number }
  | { from: 'action_execution'; execution_id: string }
  | { from: 'orchestrator_state'; run_id: string;
      field: 'runStatus' | 'revisions' | 'execution' | 'budget' | 'stepBindings' };

type AgentResultPath =
  | `/findings/${number}` | `/findings/${number}/statement`
  | `/facts_used/${number}` | `/facts_used/${number}/${'status'|'as_of'|'capability'}`
  | `/proposed_action_intents/${number}` | `/limitations/${number}`
  | '/confidence';
```

A closed prefix set. There is no `/raw`, no `/tool_results`, no escape hatch, and no `/presentation_hint` (§1.6.5). *Mechanism:* template-literal union plus the closed-shape validator. *Evaluation point:* `EP-MINT`.

---

### 1.2 The three leaf classes — resolving the universal-`Cell` rule

The first edition stated "there is no bare number, string, boolean or date in any body field that reaches a user's eyes" and then typed most of its own bodies with bare strings. **That sentence is withdrawn** (§1.10) and replaced by the following rule, which is narrower, exact, and checkable.

**V1 — every leaf of `body` is one of exactly three classes.**

| class | type | what it is | may vary with tenant / principal / time / source |
|---|---|---|---|
| **datum** | `Cell<T>` or `Measure` | anything read from a capability | yes |
| **phrase** | `Phrase` | a server-authored constant string drawn by key from the versioned locale catalogue | no |
| **structural** | `string` / `number` / `boolean` / closed enum | a value that is **never rendered**: `option_id`, `intent_token`, `slot_ref`, `draft_ref`, `dataset_ref`, `series_id`, `section_id`, `field_key`, table column keys, `path` keys, counts used only for layout | n/a |

No fourth class exists. A rendered leaf that is neither a `Cell`/`Measure` nor a `Phrase` cannot be emitted.

*Mechanism:* `buildCellIndex(kind, body_version, body)` — a pure server function that walks the body against the kind's registered **leaf schema**, in which every leaf is declared `datum`, `phrase` or `structural`. The walk yields a `CellIndex`; the validator refuses emission when (a) any leaf reached by the walk is absent from the schema, (b) any leaf declared `datum` is not a well-formed `Cell`/`Measure`, (c) any leaf declared `phrase` carries a `phrase_key` absent from the locale catalogue, or (d) any leaf declared `structural` appears in the text equivalent produced by §7's `renderTextEquivalent`. *Evaluation point:* `EP-MINT`; and `EP-CI`, where a schema-totality test asserts that every leaf of every registered body schema carries a class.

```ts
interface CellIndex {                    // artefact of buildCellIndex; recorded in the emission fixture
  schema_digest: string;                 // sha256 over the kind's leaf schema at this body_version
  entries: CellIndexEntry[];             // 1..400, ordered by `path`
}
interface CellIndexEntry {
  path: string;                          // JSON Pointer into `body`, ≤ 200 chars
  class: 'datum' | 'phrase' | 'structural';
  fact_ref: number | null;               // non-null iff class === 'datum' and state ∈ {KNOWN, PARTIAL}
  phrase_key: string | null;             // non-null iff class === 'phrase'
}
```

**V2 — the index is not transmitted; its digest is.** `Integrity.cell_index_digest` is `sha256(stableActionJson(CellIndex))`. Any holder of the envelope reproduces the index from `(kind, body_version, body)` because `buildCellIndex` is pure. *Mechanism:* recomputation and comparison. *Evaluation points:* `EP-MINT` (mint the digest), `EP-CI` (recompute over every recorded emission). [NON-NORMATIVE] Shipping the index would roughly double a dense body for no reader that needs it.

**V3 — the constant exceptions are enumerated, not implied.** The complete set of user-visible fields with no `UNKNOWN` protection is: fields of class `phrase`. A `Phrase` is a catalogue lookup, so it cannot be unknown, cannot be empty, and cannot be authored at emission time.

```ts
interface Phrase {
  phrase_key: string;                       // E — key in `WIDGET_PHRASES@<catalogue_version>`
  params?: Record<string, CellPointer>;      // E — every interpolation slot names a Cell in THIS body
  rendered: string;                          // M — the only user-visible bytes; ≤ 400 chars
}
type CellPointer = string;                   // JSON Pointer into `body`, must resolve to a Cell/Measure
```

**V4 — a phrase cannot carry a quantity of its own.** Every interpolation slot of a `Phrase` MUST name a `Cell` or `Measure` in the same body, and `rendered` MUST equal `renderPhrase(phrase_key, params, locale)`. *Mechanisms:* (a) byte-equality recomputation of `renderPhrase` at `EP-MINT`; (b) a catalogue lint at `EP-CI` that refuses any catalogue entry containing a digit, a Russian or English cardinal/ordinal number-word, or a quantity token (`пол-`, `треть`, `вдвое`, `half`, `double`, `top-N`) outside a slot. [NON-NORMATIVE] The lint runs over a few hundred catalogue rows written by humans; it is cheap and total, unlike a regex over generated prose.

---

### 1.3 `Cell<T>` — the universal displayed datum

```ts
type CellState = 'KNOWN' | 'PARTIAL' | 'NOT_MEASURED' | 'UNAVAILABLE' | 'PENDING';

interface Cell<T> {
  state: CellState;                 // D
  value: T | null;                  // C — copied from the fact; never computed in the widget layer
  label: string;                    // M — ≤ 160 chars, always a human sentence fragment
  reason_code: ReasonCode | null;   // D — non-null iff state !== 'KNOWN'
  fact_ref: number | null;          // D — index into provenance.facts_used
  as_of: string | null;             // C — exactly `YYYY-MM-DDTHH:mm:ss.sssZ` (UTC), copied from the fact
  evidence_refs: EvidenceRef[];     // C — 0..8, ⊆ provenance.facts_used[fact_ref].evidence_refs
  next_intent_ref: string | null;   // D — an intent in THIS envelope that could resolve the unknown
}

type ReasonCode =
  | 'SOURCE_UNLINKED' | 'PERIOD_NOT_CLOSED' | 'NOT_COLLECTED' | 'OUT_OF_SCOPE'
  | 'PERMISSION' | 'PROVIDER_SILENT' | 'NO_OWNER' | 'SUPERSEDED' | 'IN_PROGRESS';
```

**C1 — the five states, exactly.**

| state | meaning | `value` | `reason_code` | `fact_ref` / `as_of` | `next_intent_ref` |
|---|---|---|---|---|---|
| `KNOWN` | measured, in scope, current | non-null | `null` | REQUIRED | optional |
| `PARTIAL` | measured over incomplete coverage | non-null | REQUIRED | REQUIRED | optional |
| `NOT_MEASURED` | never collected for this scope | `null` | REQUIRED | `null` | REQUIRED when a remedy exists (C5) |
| `UNAVAILABLE` | the source cannot answer now | `null` | REQUIRED | `null` | REQUIRED when a remedy exists (C5) |
| `PENDING` | in flight; an answer is expected | `null` | REQUIRED (`IN_PROGRESS`) | `null` | optional |

*Mechanism:* a per-state shape check in `widgetCell()`. *Evaluation point:* `EP-MINT`.

**C2 — `label` is minted, never authored.** `label = renderCellLabel(state, reason_code, value, unit, locale)`, a pure server function that resolves a `Phrase` internally and interpolates only formatter output. *Mechanism:* recomputation and byte-comparison at `EP-MINT`; the value is inside `body_hash` (§1.9). *Consequence:* a model cannot place characters — and therefore cannot place a numeral or a number-word — into a label. This closes the hole in which a free-string `label` trivially satisfied a numeral check by carrying the numeral itself.

**C3 — traceability replaces dereferenceability.** A `KNOWN` or `PARTIAL` Cell MUST carry `fact_ref` naming an element of `provenance.facts_used`, and its `value`, `as_of` and `evidence_refs` MUST be copies drawn from that element. *Mechanism:* the copy check in `widgetCell()` — `as_of` byte-equal to the fact's `as_of`, `evidence_refs` a subset of the fact's `evidence_refs`. *Evaluation point:* `EP-MINT`. [NON-NORMATIVE] This is the honest form of the first edition's "every `KNOWN` Cell has non-empty `evidence_refs`", which was unsatisfiable for catalogue-tool reads that produce no evidence handles at all (§1.6.4).

**C4 — `M1`: UNKNOWN is a statement, not a failure.** `label` MUST NOT match `/ошибк|error|fail|сбо[йя]|недоступн.*попроб/i`. No renderer may bind a non-`KNOWN` state to a `danger`/`destructive`/`alert` theme token, an error icon, `role="alert"`, or an automatic retry. The permitted rendering is neutral-dim plus the `next_intent_ref` affordance. A non-`KNOWN` Cell blocks only its dependents — one report section, one chart series, one row — never the envelope. *Mechanisms:* the label lint at `EP-MINT` and `EP-CI`; a renderer conformance suite that asserts the five-branch rendering and the absence of error tokens for non-`KNOWN` states. *Evaluation points:* `EP-MINT`, `EP-RENDER` (conformance fixtures), `EP-CI`.

**C5 — `M2`: the remedy is named or the gap is declared.** For `state ∈ {NOT_MEASURED, UNAVAILABLE}`: if the canon contains a capability that could resolve the unknown for this principal, `next_intent_ref` MUST name an intent present in this envelope; if it does not, `next_intent_ref` MUST be `null` **and** the envelope MUST carry a `Limitation` whose `capability_gap_ref` is non-null. *Mechanism:* a validator cross-check against the canon and against `intents[].intent_ref`. *Evaluation point:* `EP-MINT`. [NON-NORMATIVE] This is where "no button for a capability with no owner" stops being a convention: the Cell either points at a real intent or forces the gap onto the record.

**C6 — renderer conformance.** A renderer with fewer than five branches per Cell fails the conformance suite. *Evaluation point:* `EP-CI` (fixture-driven render of one envelope per kind per profile).

---

### 1.4 `Measure` — the numeric specialisation

```ts
interface Measure extends Cell<number | string> {
  key: string;                  // E — stable id, e.g. 'revenue.net', 'slot.duration_min'; ≤ 64 chars
  unit: 'RUB' | 'minutes' | 'count' | 'percent' | 'ratio' | 'datetime' | 'none';   // C
  basis_key: string | null;     // C — copied from facts_used[fact_ref].basis (c9Id, ≤128 chars)
  basis: string;                // M — renderBasis(basis_key, capability, locale); ≤ 200 chars
  currency: string | null;      // C — /^[A-Z]{3}$/ or null, copied from the fact
  formatted: string;            // M — formatMeasure(value, unit, currency, locale)
  comparison: {                 // D — present only when a canonical baseline exists
    baseline_label: Phrase;
    baseline: Measure | null;   // a Measure in its own right; NOT a free number
    delta: number | null;
    direction: 'up' | 'down' | 'flat' | 'unknown';
  } | null;
}
```

**M1 — money is integer minor units or a decimal string, never a float.** `unit: 'RUB'` requires `value` to be a decimal string of digits only, matching the canonical money discipline (`c9Money`, `c9.contract.ts:208-212`). *Mechanism:* `widgetMeasure()` shape check. *Evaluation point:* `EP-MINT`.

**M2 — `basis` is minted from a canonical key.** `basis_key` is copied from the fact's `basis` field, which C9 types as `c9Id` (`c9.contract.ts:349-368`); where the fact carries none, `basis_key` is `null` and `renderBasis` falls back to the capability's registered basis phrase. `basis` is never author-supplied. *Mechanism:* recomputation and byte-comparison of `renderBasis` at `EP-MINT`; covered by `body_hash`. [NON-NORMATIVE] The first edition typed `basis` as a free string inside the body, which made it a second, unpoliced channel for model-authored text sitting directly beside a number.

**M3 — no arithmetic in the widget layer.** `value`, `delta` and every member of `comparison` are copied from canonical facts. The widget layer MUST NOT compute a sum, a ratio, a percentage, a delta or a projection. *Mechanism:* a projector architecture test that refuses arithmetic operators over fact values in the projector directory, in the spirit of the existing consumer ratchet `c9.consumers.architecture.spec.ts` — which today scans only `src/orchestration/` and MUST be extended to the projector directory. *Evaluation point:* `EP-CI`. [NON-NORMATIVE] The extension is mandatory precisely because the scanner's current scope would leave the new code unpoliced while the guarantee kept being quoted.

**M4 — `comparison.baseline` is a `Measure` or absent.** A baseline is never a bare number and never a phrase containing a number. *Mechanism:* the type plus V1. *Evaluation point:* `EP-MINT`.

---

### 1.5 Where charts get their numbers

**M5 — a plotted point is a datum on both axes.** Every coordinate of every rendered series — the dependent value *and* the independent value, including bucket boundaries, axis ticks and category values — is a `Measure` or a `Cell`. *Mechanism:* V1 with the kind's leaf schema; a chart body declaring a bare `x` cannot be registered, and a body containing one is refused by `buildCellIndex`. *Evaluation point:* `EP-MINT`, `EP-CI`.

**M6 — series closure.** In a body that carries a `dataset_ref`, every `datum` leaf inside the series MUST carry a `fact_ref` naming the fact whose `capability` is that dataset's read capability, and the body's `rows_digest` MUST equal a recomputation over the rows the projector read. *Mechanism:* the fact-closure check plus digest recomputation in `widgetEnvelope()`. *Evaluation point:* `EP-MINT`. *Consequence:* a chart whose points do not reduce to a canonical dataset read cannot be emitted — which is the checkable form of "the LLM never generates numbers for a chart".

---

### 1.6 Provenance

```ts
interface Provenance {
  source_capability: string;        // E — must resolve in the capability canon
  capability_version: string;       // E — §1.1.3
  projector_id: string;             // M — registered projector that built `body`
  source_kind: 'agent_result' | 'capability_read' | 'orchestrator_state' | 'action_execution';  // E

  facts_used: FactUsed[];           // C — 0..100, byte-copies (§1.6.3)
  facts_origin: Array<'copied' | 'synthesised'>;   // E — same length, index-aligned (§1.6.4)
  facts_digest: string;             // M — sha256 over the copied elements (§1.6.3)

  completeness: Completeness;       // C — the FULL envelope object (§1.6.2)
  completeness_envelope_hash: string;   // M — sha256(stableActionJson(completeness))

  evidence_refs: EvidenceRef[];     // C — 0..100, envelope-level
  confidence: 'high' | 'medium' | 'low';   // C — grounding, NOT probability

  authorship: Authorship;           // D — §1.6.5
}
```

#### 1.6.1 `FactUsed` — byte-copy of the C9 element

```ts
interface FactUsed {                 // element-for-element identical to AgentResult@1.facts_used[i]
  capability: string;                // c9Id, ≤ 128 chars
  status: 'measured' | 'measured_incomplete' | 'not_measured' | 'unavailable';
  as_of: string;                     // c9Instant: /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/, UTC only
  evidence_refs: string[];           // REQUIRED, 0..100, each /^h_[a-f0-9]{32,64}$/
  completeness: Completeness;        // REQUIRED, the full object — never a number
  basis?: string;                    // optional, c9Id
  currency?: string | null;          // optional, /^[A-Z]{3}$/ or null
}
```

#### 1.6.2 `Completeness` — byte-copy of `c9Completeness`

```ts
interface Completeness {             // c9.contract.ts:314-323
  status: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE';   // PRESENT. The first edition omitted it.
  requestedScopeHash: string;        // 64 lowercase hex
  returnedCount: number;             // int 0..1_000_000_000
  totalCount: number | null;
  hasMore: boolean;
  cursorRef: string | null;
  truncated: boolean;
  reasonCodes: string[];             // 0..20, each ≤ 128 chars
}
```

#### 1.6.3 P3 — completeness and facts are copied, never re-derived

**P3.** `facts_digest = sha256(stableActionJson(facts_used.filter(copied)))` MUST equal the same function applied to the corresponding elements of the source artefact, and `completeness_envelope_hash` MUST equal `sha256(stableActionJson(completeness))` where `completeness` is byte-identical to the source's completeness envelope. *Mechanism:* recomputation at `EP-MINT` against the in-memory source artefact, using `stableActionJson` (`maya-saas-backend/src/action-engine/action-engine.identity.ts:54`) — the same canonicaliser C9 hashes with. *Evaluation point:* `EP-MINT`; and `EP-CI`, where the fixture carries both source and envelope. *Consequence:* the equality is only satisfiable by a whole copy. A lossy copy — dropping `evidence_refs`, flattening `completeness` to a number, omitting `status` — cannot produce the hash, so it cannot be emitted.

**P4 — no false `COMPLETE`.** An envelope whose `completeness.status` is `COMPLETE` while any `FactUsed.status` is `measured_incomplete`, `not_measured` or `unavailable` is refused. *Mechanism:* the widget-layer twin of C9's `false_completeness` denial, which `c9AgentResult` already enforces upstream. *Evaluation point:* `EP-MINT`.

#### 1.6.4 Synthesised facts — the Path B honesty rule

A registered capability read outside a coordination run produces no C9 completeness envelope and no evidence handles. For those reads the projector **synthesises** a `FactUsed` element, and marks it.

**P5.** When `facts_origin[i] === 'synthesised'`: `evidence_refs` MAY be empty; `completeness.totalCount` MUST be `null` unless the capability itself reported a count; `completeness.hasMore` MUST NOT be `false` unless the capability itself reported exhaustion; `completeness.status` MUST be `PARTIAL` when `totalCount` is `null`; every Cell whose `fact_ref` names it MUST have state `PARTIAL` or `NOT_MEASURED` with `reason_code: 'NOT_COLLECTED'` where the capability reported no count; and `presentation.text_equivalent.completeness_sentence` MUST state it. `facts_digest` does not cover synthesised elements. *Mechanisms:* the shape rules in `widgetEnvelope()`; the projector architecture test of M3, extended to assert that `hasMore: false` is never written on a synthesis path. *Evaluation points:* `EP-MINT`, `EP-CI`. [NON-NORMATIVE] This is the design's largest honesty gap and it is written into the type rather than into prose: a synthesised fact looks different from a copied one at the field level, so an audit can count them.

#### 1.6.5 `Authorship` — what is and is not model-composed

The first edition carried the literal `generated_by: 'canonical'`, glossed as "no body field is LLM-authored", while permitting `REPORT` narrative — a body field — to be model-composed. **The literal and its gloss are withdrawn** (§1.10) and replaced:

```ts
interface Authorship {
  body_values: 'server_formatter';          // literal — every datum leaf; §1.2–§1.4
  body_phrases: 'server_catalogue';         // literal — every phrase leaf; §1.2
  narrative: 'server_template' | 'none';    // which of the two produced any prose leaf
  narrative_template_id: string | null;     // non-null iff narrative === 'server_template'
  narrative_template_version: number | null;
  model_contribution: 'none' | 'template_selection';   // D
  model_contribution_ref: string | null;    // the projector-input field the model wrote, if any
}
```

**P6 — narrative is a template with typed slots, never free prose.** Any prose leaf of any body (a report section narrative, a rationale, an option reasoning) MUST be `renderNarrative(narrative_template_id, slots, locale)`, where the template is a member of the versioned `NARRATIVE_TEMPLATES` catalogue and every slot names a `Cell`, `Measure` or `Phrase` in the same body. `rendered` is recomputed and compared byte-for-byte. *Mechanisms:* recomputation at `EP-MINT`; the catalogue lint of V4 applied to narrative templates; a residual numeral-and-number-word check over rendered text at `EP-CI` as defence in depth. *Consequence (stated precisely):* **no body field contains characters authored by a model.** A model may, where a future mechanism permits it, select *which* server template or kind is used; it may not supply any character that reaches a user.

**P7 — the model's actual contribution today is `none`.** `model_contribution: 'template_selection'` is legal only when the projector input carried a closed-enum proposal field and a server table validated it. C9's `presentation_hint` (`c9.contract.ts:384`) is an optional free-text field of up to 400 characters with no kind vocabulary, and the released agent does not emit it; **no renderer and no minter may read it as a kind, a template or a presentation instruction.** A kind proposal, if wanted, is the closed `WidgetComposerInput.kind_proposal` enum validated by `allowedKinds(capability)` — a table specified in §2 with a `EP-CI` totality test over the canon. *Mechanism:* `AgentResultPath` (§1.1.5) has no `/presentation_hint` member, so the field is not addressable as a source; and `widgetComposerInput()` accepts no free-text presentation field. *Evaluation point:* `EP-MINT`.

#### 1.6.6 Evidence references and their durability

```ts
interface EvidenceRef {
  ref: string;                       // C — verbatim; 'h_<32..64 hex>' for a C9 handle
  class: 'c9_invocation_handle' | 'source_receipt';   // D
  dereferenceable_until: string | null;               // D — c9Instant; null ⇒ already an audit label
}
```

**P8 — a persisted evidence ref is an audit label, not a link.** C9 evidence handles live in an in-memory map for the duration of one invocation. After `dereferenceable_until` — for `class: 'c9_invocation_handle'`, the end of the minting invocation — a ref proves only *that a qualified reference existed*; it cannot be resolved. No renderer, no gateway and no audit tool may attempt to dereference it. A "show the evidence" affordance MUST be a `REFINE` intent that re-reads from the canonical owner. *Mechanisms:* the `class`/`dereferenceable_until` fields make the distinction machine-visible; a `EP-CI` test asserts that no renderer or gateway call site dereferences an `EvidenceRef`; §1.3 C3 makes Cell traceability depend on `fact_ref`, not on a live handle, so nothing breaks when a handle dies. *Evaluation points:* `EP-MINT` (classification), `EP-CI` (no-dereference test).

#### 1.6.7 `Limitation` and the canonical denial projection

```ts
interface Limitation {
  code: string;                      // C — a canonical reason code, ≤ 128 chars
  text: Phrase;                      // M — from the reason-code phrase table
  severity: 'info' | 'limitation' | 'risk' | 'blocking';   // D — from the reason-code table
  affects: string[];                 // D — JSON Pointers into body, [] when the projector cannot know
  capability_gap_ref: string | null; // D — non-null iff no canonical owner exists for the remedy
}
```

**P9 — severity is table-derived, never model-authored and never emitter-authored.** C9 limitations are plain strings (`c9SafeText(v, 400)`); they carry no severity. `severity` and `text` are produced by `LIMITATION_REASON_TABLE`, a closed server table keyed by reason code, whose default severity is `limitation`. *Mechanism:* table lookup at `EP-MINT`; `EP-CI` totality test (below).

**P10 — every canonical denial code has a rendering, and none of them is an error.** `C9_DENIAL_PROJECTION` maps each `c9Deny(...)` code to `{ cell_state, reason_code, limitation_severity }`. Most such denials are **policy fences, not faults** — `paid_capability_not_activated`, `capability_not_registered`, `review_stale`, `run_expired_or_terminal`, `use_secure_surface`, `no_delegated_domain_required` — and each MUST project to a Cell state and a `Limitation`, never to an error surface. *Mechanisms:* (a) an `EP-CI` ratchet that enumerates the `c9Deny('…')` literals under `maya-saas-backend/src/orchestration/` — **118 distinct codes at the time of writing** — and fails the build if any code has no row; (b) at runtime, an unmapped code projects to `state: 'UNAVAILABLE'`, `reason_code: 'PROVIDER_SILENT'` and a `limitation`-severity `Limitation`, so a new upstream code degrades to an honest unknown rather than to a red box. *Evaluation points:* `EP-COMPOSE` (projection happens before anything reaches a renderer), `EP-CI` (totality).

**P1 — no second backend contract per widget.** Every `body` field MUST be a subset of the response projection of `provenance.source_capability`. A widget kind may not introduce a field its source capability cannot produce. *Mechanism:* a projector contract test per kind, run against recorded capability responses. *Evaluation point:* `EP-CI`.

**P2 — the /unsubscribe clause.** If a remedy has no canonical owner, the envelope MUST carry a `Limitation` with a non-null `capability_gap_ref` and MUST NOT carry an intent that promises the remedy. *Mechanism:* canon lookup for every intent capability at `EP-MINT`; C5 forces the gap onto the record from the Cell side. *Evaluation point:* `EP-MINT`.

---

### 1.7 Verification level and principal binding

```ts
type VerificationLevel =
  | 'ANONYMOUS'          // rank 0
  | 'CHANNEL_IDENTITY'   // rank 1 — IDENTIFIED, NOT VERIFIED
  | 'BOUND_CLIENT'       // rank 2
  | 'SESSION_VERIFIED'   // rank 3
  | 'STEP_UP_VERIFIED';  // rank 4

const VERIFICATION_RANK: Record<VerificationLevel, 0 | 1 | 2 | 3 | 4>;
```

**K1 — each level has exactly one establishing mechanism.**

| level | established by | evaluation point |
|---|---|---|
| `ANONYMOUS` | no principal resolved | request middleware |
| `CHANNEL_IDENTITY` | a channel subject is known (Telegram chat id, push endpoint) and **no** active verified `ClientChannelLink` matches it | principal resolution |
| `BOUND_CLIENT` | `ClientChannelRuntimeService.resolve(proof, tx)` returns a link — it selects on `revokedAt: null` (`client-channel-runtime.service.ts:79,94`) — and the principal is minted as `kind: 'CLIENT_CHANNEL'` by `C9Authority.current` (`c9.authority.ts:25-45`) | inside the request transaction |
| `SESSION_VERIFIED` | a first-party authenticated session: `C9Authority.current` resolves exactly one active `Membership` for an active `User` under `FOR SHARE` (`c9.authority.ts:46-95`) | inside the request transaction |
| `STEP_UP_VERIFIED` | a re-authentication event recorded against this session within `step_up_window_s` | **no such mechanism exists today** (K6) |

**K2 — `verification_level` is server-derived and channel-declared values are ignored.** It is computed by `AuthorityResolver` from the session resolved in the same transaction. A `ChannelProfile` may declare **presentation** capabilities; it MUST NOT declare a verification level. *Mechanisms:* `WidgetComposerInput` has no such field (E5); `ChannelProfile` has no such field; the gateway recomputes at `EP-INGRESS` and never reads the envelope's copy for a decision. *Evaluation points:* `EP-MINT`, `EP-INGRESS`. *Consequence:* a lying channel profile can make a widget uglier; it cannot make it more powerful.

**K3 — `principal_proof_hash` binds an envelope to one principal state.** `integrity.principal_proof_hash = c9PrincipalHash(principal)` (`c9.identity.ts:32-45`), a digest over `kind`, `tenantId`, `userId`, `membershipId`, `clientId`, `channelLinkId`, `branchRefs`, `staffRef` and `proofHash`. It is not a role, a user id or a token, and it is not reversible. *Evaluation point:* `EP-MINT`.

**K4 — revocation retroactively invalidates outstanding envelopes.** At `EP-INGRESS` the gateway recomputes `c9PrincipalHash` for the live principal and refuses any submission whose `IntentRecord.principal_proof_hash` differs. *Why this is true and not merely asserted:* the client-channel branch of `C9Authority.current` populates `channelLinkId` and `proofHash` from a link selected with `revokedAt: null`; revoking a link therefore removes it from resolution, and a re-bind creates a new row with a new `id` (`ClientChannelLink.supersedesLinkId`, `prisma/schema.prisma:2246-2272`). Either way `channelLinkId` changes or becomes `null`, the principal hash changes, and every envelope minted for the old binding — on every device, in every channel, including a forwarded Telegram message or a shared push — becomes inert. The membership branch behaves identically through `membershipId` and the membership `proofHash`. *Evaluation point:* `EP-INGRESS`.

**K5 — the principal resolver may not resurrect a revoked binding.** No widget-layer code path may construct a principal from a `ClientChannelLink` with `revokedAt != null`, or from an inactive `Membership`. *Mechanism:* an architecture test asserting that widget-layer principal resolution calls `C9Authority.current` (or `ClientChannelRuntimeService.resolve`) and constructs no principal of its own. *Evaluation point:* `EP-CI`.

**K6 — `STEP_UP_VERIFIED` is unreachable until a step-up mechanism is registered.** No re-authentication event type exists in the repository today. Consequently `AuthorityResolver` can never return rank 4, and every intent whose derived floor is `STEP_UP_VERIFIED` fails the floor comparison in every channel and degrades to `HANDOFF`. *Mechanism:* the floor comparison itself (§1.8, Gate 4). *Evaluation point:* `EP-INGRESS`. [NON-NORMATIVE] This is fail-closed and correct: the capability is unreachable rather than under-protected, and it is visible in the receipt as a withheld intent with a named restoration route rather than as a silent absence.

**K7 — a channel ceiling never raises a floor.** `ChannelProfile.max_verification_level` caps what a channel may carry; it can only lower the effective level. A Telegram bot running `start_polling` establishes no first-party principal and is therefore capped at `CHANNEL_IDENTITY`. *Mechanism:* `effective = min(rank(session), rank(profile.max_verification_level))` in the gateway. *Evaluation point:* `EP-INGRESS`.

---

### 1.8 `required_verification` is derived by the server

The first edition let the emitter author `required_verification` and then called the result "server-derived". It was not. This is the replacement.

```ts
function deriveVerificationFloor(input: {
  capability: string | null;          // the intent's capability, or null for a pure handoff
  handoff_capability_ref: string | null;  // the non-actuating registry key a HANDOFF names
  kind: WidgetKind;
  audience: 'self' | 'other_party' | 'bulk';
}): VerificationLevel;
```

**K8 — the floor is a maximum over three total tables.**

```
key   = capability ?? handoff_capability_ref          // exactly one is non-null (§5)
floor = max(
          CAPABILITY_MIN_VERIFICATION[key],           // per-capability table, total over the canon
          RISK_TIER_MIN_VERIFICATION[riskTier(key)],  // riskTier from AiToolDefinition.riskTier
          CONSENT_CLASS_MIN_VERIFICATION[consentClass(key)],
          KIND_MIN_VERIFICATION[kind]
        )                                             // max by VERIFICATION_RANK
```

`riskTier` is the released `AiToolRiskTier` union — `read | low_write | medium_write | high_write | restricted` (`maya-saas-backend/src/ai-tools/ai-tool.types.ts`) — read from the catalogue entry, not from the envelope.

| `RISK_TIER_MIN_VERIFICATION` | floor |
|---|---|
| `read` | `CHANNEL_IDENTITY` |
| `low_write` | `BOUND_CLIENT` |
| `medium_write` | `SESSION_VERIFIED` |
| `high_write` | `SESSION_VERIFIED` |
| `restricted` | `STEP_UP_VERIFIED` |

| `CONSENT_CLASS_MIN_VERIFICATION` | floor |
|---|---|
| `none` | `ANONYMOUS` |
| `communication` — includes **per-moment notification delivery preferences** | `SESSION_VERIFIED` |
| `personal_data` — 152-FZ consent grant, withdrawal, register export | `SESSION_VERIFIED` |
| `identity_binding` — bind, unbind, rebind of any channel identity | `SESSION_VERIFIED` |
| `finance` — payment, refund, gift-certificate, loyalty redemption | `SESSION_VERIFIED` |

**K9 — every intent carries a floor, including `HANDOFF`.** `required_verification` is an intent-level field present on **every** `WidgetIntent` regardless of effect class, not a member of an optional confirmation object. A `HANDOFF` intent MUST carry a non-null `handoff_capability_ref` so that `deriveVerificationFloor` and the never-chat-actuated predicate both have a key to evaluate. *Mechanism:* the intent shape (§5) plus the derivation above. *Evaluation point:* `EP-MINT`. [NON-NORMATIVE] Without this, the floor comparison and the never-chat-actuated list are predicates that cannot become true for exactly the intents that carry consent and identity acts — the first edition's structural defect #1.

**K10 — computed at mint, recomputed at the gateway, hinted by nobody.** The minter writes `required_verification = deriveVerificationFloor(...)`. The gateway recomputes it at `EP-INGRESS` from the `IntentRecord`'s capability and the live tables and compares the session against **its own** result; it never reads the envelope's value for a decision. *Mechanisms:* E5 (no composer field to supply it); recomputation in the gateway; a divergence counter `widget_floor_divergence` incremented and audited when a stored value differs from the recomputation, which can only happen when a table changed after minting — and then the submission is refused with `SUPERSEDED` plus a fresh envelope. *Evaluation points:* `EP-MINT`, `EP-INGRESS`.

**K11 — table totality and monotonicity.** `CAPABILITY_MIN_VERIFICATION` MUST have a row for every key in the capability canon; a key with no row makes the build fail, and at runtime an unmapped key refuses emission rather than defaulting. A floor may never be **lowered** except by a version bump of this contract carrying a recorded owner decision. *Mechanisms:* an `EP-CI` totality test over the canon; an `EP-CI` monotonicity test comparing the table against the previous contract version's table. [NON-NORMATIVE] The totality test is what keeps a newly registered consent-bearing capability from arriving with an implicit floor of zero.

**K12 — consent classification is data, and it is reviewed like a fence.** `consentClass(key)` is a closed enum assigned per capability in the canon. Any change to a capability's consent class is a contract version bump. *Mechanism:* the same monotonicity test as K11, extended to the consent-class column. *Evaluation point:* `EP-CI`.

---

### 1.9 Integrity

```ts
interface Integrity {
  body_hash: string;              // M — 64 lowercase hex
  cell_index_digest: string;      // M — §1.2 V2
  envelope_seal: string;          // M — keyed HMAC-SHA256
  seal_key_version: number;       // M — int ≥ 1
  principal_proof_hash: string;   // M — c9PrincipalHash(principal), §1.7 K3
  approval_echo: {                // M — present iff the body carries an approval decision
    owner: 'ai_approval_request' | 'action_execution';
    hash: string;                 // the hash THAT owner verifies
  } | null;
  policy_context_echo: string | null;   // M — ActionExecution.policyContextHash when one exists
}
```

**H1 — what `body_hash` covers.**

```
body_hash = sha256(stableActionJson({
  contract, kind, body_version,
  body,                                  // every Cell, Measure and Phrase, including every minted
                                         //   `label`, `basis`, `formatted` and `rendered`
  cell_index_digest,
  provenance,                            // including facts_used, completeness and authorship
  limitations,
  intents: intents.map(stripIntentToken), // capability, role, floor, schema — NOT the token
  presentation                            // including text_equivalent in full
}))
```

*Mechanism:* `stableActionJson` (`action-engine.identity.ts:54`) as the canonicaliser — the same function C9 and the Action Engine hash with; there is no second canonicalisation scheme in this system. *Evaluation points:* `EP-MINT` (compute), `EP-RENDER` (the renderer recomputes `body_hash` and verifies the seal over it before drawing), `EP-CI`.

**H2 — the text equivalent is a pure function inside the hash.** `presentation.text_equivalent = renderTextEquivalent(kind, body, cell_index, intents, locale)`. The composer cannot supply it (E5) and a model cannot author it (P6). At `EP-MINT` the validator recomputes the function and requires byte equality before the hash is taken; the result is therefore inside `body_hash` and cannot drift from the body afterwards. *Consequence:* the screen-reader string, the SMS body, the transcript line, the archived summary and the utterance the gateway re-parses are the same bytes **by construction**.

**H3 — minted strings are inside the hash by the same rule.** `Cell.label`, `Measure.basis`, `Measure.formatted`, `Phrase.rendered` and every narrative render are all outputs of pure server functions, all recomputed-and-compared at `EP-MINT`, and all inside `body`, therefore inside `body_hash`. There is no user-visible string in an envelope that is both outside the hash and outside a server function.

**H4 — the seal.**

```
envelope_seal = HMAC-SHA256_k( "maya.widget.envelope/1" ‖ \0 ‖ stableActionJson([
  body_hash, widget_id, tenant_id, principal_proof_hash,
  issued_at, expires_at, render.profile_id, seal_key_version ]) )
```

*Mechanism:* the existing keyed-HMAC discipline of `ActionIdentityService.hmac(namespace, value)` (`action-engine.identity.ts:83`), with its own key namespace and a key version. *Evaluation points:* `EP-MINT` (mint), `EP-RENDER` (verify; on mismatch or expiry the renderer draws `text_equivalent` as frozen prose with one `REFINE` intent — never an error surface), `EP-INGRESS` (the gateway verifies before Gate 1 proceeds). Including `render.profile_id` means an envelope degraded for one channel cannot be replayed as a richer one.

**H5 — echoes are echoes, and each names the owner that checks it.** `approval_echo.hash` MUST be the hash the named owner actually verifies: for an AI-tool approval that is `AiApprovalRequest.payloadHash`, verified by `assertPayloadHash` on the approve path (`maya-saas-backend/src/ai-tools/ai-tool-runtime.service.ts:1197-1204`); for an Action Engine execution binding it is that execution's binding hash. An echo whose named owner does not verify that hash is refused at mint. The server re-derives and compares; an echoed value is **never** accepted as an input to any decision. *Mechanism:* owner-keyed re-derivation in `widgetEnvelope()` and again at `EP-INGRESS`. [NON-NORMATIVE] The first edition echoed `ActionExecution.approvalBindingHash` for an approval whose owner checks `payloadHash` — a widget that looks bound and is not.

**H6 — one hashing scheme.** No widget-layer artefact may introduce a canonicalisation or hashing scheme other than `stableActionJson` + SHA-256, or a keyed scheme other than `ActionIdentityService.hmac`. *Mechanism:* an architecture test forbidding `JSON.stringify`-based hashing and ad-hoc `createHash` call sites in the widget layer. *Evaluation point:* `EP-CI`.

---

### 1.10 What this section withdraws from the first edition

[NON-NORMATIVE] Listed so that a reader of both editions can see that each removal was deliberate, and so that no reviewer has to re-derive it.

| withdrawn claim (first edition) | what replaces it |
|---|---|
| "There is no bare number, string, boolean or date in any body field that reaches a user's eyes" | V1: three leaf classes, a per-kind leaf schema, and `buildCellIndex` totality at `EP-MINT`. The constant exceptions are exactly the `Phrase` class and are enumerated by catalogue key. |
| `generated_by: 'canonical'` — "No body field is LLM-authored" | `Authorship` (§1.6.5): body values from the formatter, phrases from the catalogue, narrative from a versioned template with typed slots. The precise true statement is *no body field contains characters authored by a model*. |
| "Prose in `text_equivalent`, `speech.lead` and `REPORT.narrative` may be model-composed" with a numeral regex as the guard | P6: templates with typed slots, so a quantity cannot be free text in any form, numeral or word; the numeral/number-word check survives only as defence in depth. |
| "Mirrors `AgentResult@1` field-for-field" (while dropping `evidence_refs` and flattening `completeness` to a number) | §1.6.1–§1.6.3: byte-copies of `facts_used[]` and `c9Completeness` including `status`, enforced by digest equality that a lossy copy cannot satisfy. |
| INV-4's "every `KNOWN` Cell has non-empty `evidence_refs`" | C3: traceability to `fact_ref`. Catalogue-tool reads produce no handles, so the old rule was unsatisfiable on the most common path. |
| "any past interaction can be re-rendered in any profile for audit" (evidential reading) | P8: what replays is the rendered form and the receipt chain. Evidence handles in a persisted envelope are audit labels; evidence is re-read through a `REFINE` intent. |
| "The LLM's role is bounded to `AgentResult@1.presentation_hint`: it may propose a kind" | P7: nothing reads `presentation_hint`; it is not addressable as a source. A kind proposal, if ever wanted, is a closed enum on the widget layer's own composer input validated by `allowedKinds`. |
| `required_verification` described as server-derived while authored by the emitter | K8–K12: derived by `max` over four total tables at mint and recomputed at the gateway; the composer input has no such field. |
| `approval_binding_echo` = `ActionExecution.approvalBindingHash` for AI-tool approvals | H5: the echo names the owner that verifies it, and for that path the hash is `AiApprovalRequest.payloadHash`. |


---

## 2. The twenty-two widget kinds

### 2.1 The closed enum

```ts
type WidgetKind =
  // the seventeen named in the approved brief
  | 'CHOICE' | 'SERVICE_SELECTOR' | 'STAFF_SELECTOR' | 'TIME_SLOT_SELECTOR'
  | 'BOOKING_CONFIRMATION' | 'SCHEDULE' | 'CLIENT_LIST' | 'METRIC' | 'CHART'
  | 'REPORT' | 'STRATEGY_OPTIONS' | 'APPROVAL' | 'PROGRESS' | 'LIMITATION'
  | 'SOURCE_STATUS' | 'SETTINGS_DRAFT' | 'FORM'
  // the five the evidence demanded
  | 'CONSENT_STATE' | 'IDENTITY_BINDING' | 'PAYMENT_HANDOFF'
  | 'MEDIA_PREVIEW' | 'ARTIFACT';
```

The set is closed at twenty-two. Adding, removing or renaming a member is a `contract` version bump reviewed as a schema change. There is no `ERROR` kind, no `FAILURE` kind, no `RETRY` kind and no `error` severity anywhere in this registry.

**K1 — the enum and the registry are one artefact.** `KIND_REGISTRY` (§2.2) is a total function over `WidgetKind`. *Mechanism:* an exhaustive-mapped-type declaration (`const KIND_REGISTRY: { readonly [K in WidgetKind]: KindRule }`) plus a start-up assertion that `Object.keys(KIND_REGISTRY).length === 22`. *Evaluated at:* REGISTRY LOAD, at process start, before any listener binds. A kind added to the union without a rule row fails compilation; a rule row added without a union member fails compilation.

[NON-NORMATIVE] The first edition declared seventeen members while the taxonomy declared twenty-two, so five taxonomy kinds — `CONSENT_STATE`, `IDENTITY_BINDING`, `PAYMENT_HANDOFF`, `MEDIA_PREVIEW`, `ARTIFACT` — could not be emitted at all, and the consent defence that the taxonomy grounded in a dedicated kind had nothing to stand on. This section gives each of the five a full body row.

---

### 2.2 What a kind row is

Every rule a kind carries is a field of one server-side record. Nothing about a kind is folklore, a review convention, or a comment.

```ts
interface KindRule {
  kind: WidgetKind;
  body_schema_ref: string;                 // JSON-Schema id for the body in §2.6
  body_version: number;

  permitted_effects: readonly EffectClass[];   // the CLOSED set of effect classes mintable onto this kind
  commit_allowed: boolean;                     // DERIVED: permitted_effects includes 'COMMIT'
  max_commit_intents: 0 | 1;                   // never more than one
  input_allowed: 'none' | 'closed_domain' | 'open_domain';

  owner_class: OwnerClass;                 // §2.4; resolves to a set of registry keys at REGISTRY LOAD
  emittable: boolean;                      // DERIVED at REGISTRY LOAD, never authored (K20)

  fullscreen: 'FORBIDDEN' | 'OPTIONAL' | 'REQUIRED' | 'REQUIRED_ABOVE_DENSITY_CAP';
  fullscreen_reasons: readonly FullscreenReason[];
  density_cap: { path: string; max: number } | null;

  role_hint: RoleHint | RoleHintRule;      // §2.5
  interactive_paths: readonly string[];    // body paths that contribute to a11y.reading_order
  text_shape: KindTextShape;               // §2.3.5

  pii_ceiling: 'none' | 'business_aggregate' | 'client_identified';
  retention_sec: number;                   // default conversation retention for this kind's body
  expires_at_ceiling_s: number | 'source_bound';
}

type FullscreenReason =
  | 'exceeds_chat_density' | 'exact_configuration' | 'audit'
  | 'accessibility' | 'correction' | 'non_textual_medium' | 'file_delivery';
```

**K2 — the kind row is evaluated three times, by three different owners.**
1. *MINT/COMPOSE* — `composeEnvelope(kind, …)` refuses to build a body that does not validate against `body_schema_ref`.
2. *MINT/VALIDATE* — `validateEnvelope(envelope)` re-checks every structural clause in this section and refuses to compute `envelope_seal` on failure. An envelope that fails here does not exist; there is no partially valid emission.
3. *MINT/INTENT* — `IntentGateway.mint(kind, effect, capability)` refuses any `effect ∉ KIND_REGISTRY[kind].permitted_effects`, and refuses a second `COMMIT` when `max_commit_intents === 1`.

A fourth evaluation happens at INGRESS for the rules that guard effects: the `IntentRecord` persists `widget_kind`, and the ACTION ENGINE INGRESS re-derives the kind rule from it rather than trusting anything the submission carries.

**K3 — "effect ceiling" is a derived phrase, not a field.** `EffectClass` is ordered `NONE < NAVIGATE < REFINE < DRAFT < REQUEST_APPROVAL < COMMIT`; `HANDOFF` is not on that order and is permitted per kind by explicit membership in `permitted_effects`. A kind's *effect ceiling* is the greatest ordered member of its `permitted_effects`. *Evaluated at:* MINT/INTENT, by comparison against the ordered enum — not by a reviewer reading a table.

**K4 — `REFINE` is defined by what it may not do.** A `REFINE` re-queries or re-composes a read model, and may cancel the orchestration run that produced the envelope it sits on. It may never create, modify or destroy a canonical business record, and it may never itself carry a business effect. It may return a confirmation body composed by a canonical owner; the `COMMIT` then lives on that returned body and nowhere else. *Mechanism:* `REFINE` carries a non-null `capability` (the capability-null rule applies only to `NONE`, `NAVIGATE`, `HANDOFF`), so a `REFINE` passes the registry lookup, the agent denied-set check, `maxSideEffectClass` and the AUTHORITY gate exactly as a write would. *Evaluated at:* MINT/INTENT for registry membership, and at the AUTHORITY gate for the live principal.

---

### 2.3 Shared substrata used by the bodies

Bodies are built from `Cell<T>` and `Measure` (section 1) plus the four shapes below. Nothing else is admitted into a body.

#### 2.3.1 `LocaleText` — the only non-`Cell` user-visible string

```ts
interface LocaleText { key: string; text: string }   // catalogue key + server-rendered string
```

**K5 — every user-visible body field is `Cell<T>`, `Measure`, `LocaleText` or `NarrativeText`.** A field whose content derives from a capability read is `Cell<T>` or `Measure`. A field whose content is a server-authored constant is `LocaleText`, and constants cannot be unknown because they are not read from a source. There is no bare `string`, `number`, `boolean` or date in any body field that reaches a user's eyes; the only bare strings surviving in a body are opaque handles (`*_ref`, `*_id`, `intent_token`) which are never rendered. *Mechanism:* the body JSON-Schemas admit no bare user-visible scalar, and `validateEnvelope` resolves every `LocaleText.key` in the locale catalogue for the envelope's locale and recomputes `.text`; a missing key or a mismatch refuses the envelope. *Evaluated at:* MINT/VALIDATE.

[NON-NORMATIVE] The first edition stated the universal-`Cell` rule absolutely and then contradicted it in most of its own bodies — a settings diff's prior value, a confirmation line's detail, a masked staff label. Those are exactly the fields most likely to be unknown, and a bare field is invisible to the five-branch renderer conformance suite and to the unknown-invariants. `LocaleText` is what makes the absolute rule survivable: it separates "a constant the server wrote" from "a value the server read".

#### 2.3.2 `NarrativeText` — prose a model may compose, numbers it cannot type

```ts
interface NarrativeText {
  template: string;        // model-authored; MUST match /^[^0-9]*$/ ; placeholders {{measure_key}} only
  measure_keys: string[];  // every placeholder resolves to a Measure present in this body
  text: string;            // server-rendered; text === interpolate(template, measures)
}
```

**K6 — the LLM cannot type a numeral into a widget.** *Mechanism:* the model emits `template` with `{{measure_key}}` placeholders; `validateEnvelope` rejects any `template` containing a digit, rejects any placeholder whose key is absent from `measure_keys` or from the body's `Measure` set, and recomputes `text` with the server formatter, refusing on inequality. *Evaluated at:* MINT/VALIDATE. Consequence: "the LLM never generates numbers for a chart" (or a report, or a strategy rationale) is enforced by the model being structurally unable to emit a digit into a body, not by a post-hoc scan of rendered prose.

#### 2.3.3 `OptionItem`, `TableSpec`, `FieldBound`

```ts
interface OptionItem {
  option_id: string;                  // opaque; meaningful only inside this envelope's domain
  label: Cell<string>;
  sublabel: Cell<string> | null;
  badges: LocaleText[];               // ≤3
  measures: Measure[];
  media: { kind: 'image' | 'icon'; ref: string; alt: string } | null;   // alt non-empty, server-authored
  intent_token: string;
  enabled: Cell<boolean>;             // a disabled control explains itself as an unknown, never as an error
}

interface TableSpec {
  caption: LocaleText;                                  // REQUIRED — WCAG 1.3.1
  columns: Array<{ key: string; label: LocaleText;
                   type: 'text' | 'measure' | 'datetime' | 'ref';
                   sensitivity: 'public' | 'internal' | 'pii';
                   is_row_header: boolean;              // exactly one column MUST be true
                   align?: 'start' | 'end' }>;
  rows: Array<{ row_key: string; cells: Record<string, Cell<string> | Measure | null> }>;
  row_intents: Record<string, string> | null;           // row_key → intent_token
  group_by: { key: string; group_labels: Record<string, LocaleText> } | null;  // ONE level only
}

interface FieldBound {                 // a server-side bound, echoed for rendering only
  bound_ref: string;                   // registry key, e.g. 'expenses.create#amount'
  min: Measure | null;
  max: Measure | null;
  max_abs_delta: Measure | null;
  basis: LocaleText;                   // why the bound is what it is
}
```

**K7 — a `FieldBound` is a display echo, never policy.** The numbers in `min` / `max` / `max_abs_delta` are re-derived from `bound_ref` against the capability at the INPUT VALIDATION gate; the echoed values are never read as policy — the same treatment given to `AuthorityHint`. A submitted value outside the re-derived bound is refused (`REFUSED / value_out_of_bound`), never clamped and never rounded. *Evaluated at:* the INPUT VALIDATION gate, on every submission.

#### 2.3.4 Intent targets inside a kind

`IntentTarget = { class: 'w' | 'i' | 'c' | 's'; ref: string }` is declared by the intents section. This registry constrains it per kind: each `KindRule` declares `allowed_target_classes`, and `validateEnvelope` refuses an intent whose target class is outside that set. `ref` is validated against the closed server-side route table for its class; there is no field anywhere in a body or an intent in which a free-form URL can be placed.

**K8 — the forbidden-key list gains seven members, for all kinds.** `url`, `href`, `endpoint`, `checkout_url`, `return_url`, `provider_ref`, `bridge_method` may not appear at any depth of a `WidgetEnvelope` or a `WidgetIntentSubmission`. *Mechanism:* the existing structural forbidden-key validator, extended. *Evaluated at:* MINT/VALIDATE and on every submission at the TOKEN INTEGRITY gate.

#### 2.3.5 The text-equivalent shape

```ts
interface KindTextShape {
  headline_path: string;                 // body path minted into text_equivalent.headline
  itemized_path: string | null;          // body array minted into text_equivalent.itemized, in body order
  sentence_order: readonly TextSentence[];   // the EXACT order renderTextEquivalent emits
  parity: 'full' | 'recipe_only' | 'file_facts_only';
}

type TextSentence =
  | 'lead' | 'items' | 'totals' | 'policy' | 'audience' | 'risk_reversibility'
  | 'step_progress' | 'recipe' | 'file_facts' | 'as_of' | 'completeness'
  | 'unknowns' | 'masking' | 'gap' | 'expiry' | 'readback' | 'options' | 'handoff';
```

**K9 — sentence order is a contract, not a style.** `renderTextEquivalent(kind, body, intents, locale)` emits exactly `sentence_order` and nothing else; a sentence whose source is absent is omitted, never reordered. *Mechanism:* the renderer is a table-driven pure server function keyed on `text_shape.sentence_order`; a CI test asserts, for every recorded emission fixture, that the emitted sentence sequence equals the kind's declared order. *Evaluated at:* MINT/VALIDATE (the minted text is covered by `body_hash`) and in CI. Consequence: "consent-aware audience maths are shown *before* the irreversible tap" becomes the checkable clause `indexOf('audience') < indexOf('options')` in the `APPROVAL` row, rather than a review comment.

**K10 — `parity` states what the text equivalent actually reproduces.** `'full'` means the portability test asserts every fact a rich renderer shows. `'recipe_only'` and `'file_facts_only'` are narrower assertions declared per kind (§2.6.21, §2.6.22); for those kinds the portability test asserts the narrower parity and nothing more. *Evaluated at:* CI, against the declared value. A kind may not claim `'full'` and then rely on a picture.

[NON-NORMATIVE] Narrowing the guarantee for two kinds is the honest alternative to asserting a universal one that a generated image cannot satisfy. A weaker true claim beats a louder false one.

---

### 2.4 The registry, at a glance

`Owner class` resolves to a set of C9 capability-registry keys at REGISTRY LOAD. `Ceiling` is the derived phrase of K3. `FS` is the fullscreen rule. `Cap` is the density cap that forces escalation.

| # | Kind | Permitted effects (ceiling) | Owner class → registry keys | FS | `role_hint` | Text parity | PII ceiling | Cap |
|---|---|---|---|---|---|---|---|---|
| 1 | `CHOICE` | NONE, NAVIGATE, REFINE, HANDOFF (**REFINE**) | `INHERITED` — the emitting capability | OPTIONAL | `radiogroup` \| `listbox` (derived) | full | inherited | 10 options |
| 2 | `SERVICE_SELECTOR` | NONE, NAVIGATE, REFINE, DRAFT (**DRAFT**) | `CATALOG_READ` → `catalog.services.read` | OPTIONAL | `radiogroup` \| `listbox` (derived) | full | none | 10 options |
| 3 | `STAFF_SELECTOR` | NONE, NAVIGATE, REFINE, DRAFT (**DRAFT**) | `CATALOG_READ` → `catalog.staff.read` | OPTIONAL | `radiogroup` | full | none | 10 options |
| 4 | `TIME_SLOT_SELECTOR` | NONE, NAVIGATE, REFINE, DRAFT (**DRAFT**) | `AVAILABILITY_READ` → `booking.availability.read`, `booking.group-availability.read` | REQUIRED | `listbox` | full | none | 12 slots |
| 5 | `BOOKING_CONFIRMATION` | NONE, NAVIGATE, REFINE, COMMIT, HANDOFF (**COMMIT**) | `BOOKING_OWNER` → `appointments.own.{create,reschedule,cancel}` | OPTIONAL | `region` | full | client_identified | 12 lines |
| 6 | `SCHEDULE` | NONE, NAVIGATE, REFINE, HANDOFF (**REFINE**) | `SCHEDULE_READ` → `staff.schedule.read`, `staff.schedule.own.read`, `operations.journal.read`, `company.business-hours.read` | REQUIRED_ABOVE_DENSITY_CAP | `grid` | full | client_identified | 24 entries |
| 7 | `CLIENT_LIST` | NONE, NAVIGATE, REFINE, REQUEST_APPROVAL, HANDOFF (**REQUEST_APPROVAL**) | `CLIENT_READ` + `BULK_AUDIENCE_OWNER` → `clients.*`, `customers.count`, `b35.{preview,status,confirm}` | REQUIRED | `table` | full | client_identified | 10 rows |
| 8 | `METRIC` | NONE, NAVIGATE, REFINE (**REFINE**) | `MEASUREMENT_READ` → `c7.measurement.read`, `analytics.team-kpi.read` | OPTIONAL | `status` | full | business_aggregate | 5 measures |
| 9 | `CHART` | NONE, NAVIGATE, REFINE (**REFINE**) | `RESULT_READ` → `c8.result.read`, `c7.measurement.read` | REQUIRED | `img` (→ `table` when degraded) | full | business_aggregate | 5 series / 120 points |
| 10 | `REPORT` | NONE, NAVIGATE, REFINE (**REFINE**) | `ANALYTICS_READ` → `analytics.business.{query,profit}`, `analytics.revenue.forecast`, `analytics.branches.compare`, `reports.recovered`, `expenses.read`, `clients.dossier.read` | REQUIRED | `document` | full | client_identified | 6 sections |
| 11 | `STRATEGY_OPTIONS` | NONE, NAVIGATE, REFINE, REQUEST_APPROVAL (**REQUEST_APPROVAL**) | `ORCHESTRATION_RUN` → C9 revisions + `c9.no_action` | OPTIONAL | `radiogroup` | full | business_aggregate | 3 alternatives |
| 12 | `APPROVAL` | NONE, NAVIGATE, COMMIT, HANDOFF (**COMMIT**) | `ACTION_EXECUTION` → the Action Engine approval path | REQUIRED | `region` | full | business_aggregate | — |
| 13 | `PROGRESS` | NONE, NAVIGATE, REFINE (**REFINE**) | `ORCHESTRATION_RUN` → `orchestration.run.read`, `orchestration.run.cancel`, `owner_report.status` | FORBIDDEN | `progressbar` | full | none | 12 steps |
| 14 | `LIMITATION` | NONE, NAVIGATE, HANDOFF (**NAVIGATE**) | `NONE` — cites the emitter's `Limitation[]` and the gap ledger | OPTIONAL | `status` | full | none | — |
| 15 | `SOURCE_STATUS` | NONE, NAVIGATE, HANDOFF (**NAVIGATE**) | `INTEGRATION_STATUS` → `support.integration-status.read`, `support.contact-admin.request` | OPTIONAL | `status` | full | none | 8 sources |
| 16 | `SETTINGS_DRAFT` | NONE, NAVIGATE, REFINE, COMMIT, HANDOFF (**COMMIT**) | `SETTINGS_OWNER` and every registered non-booking, non-payment draft owner → `settings.{read,update}`, `notifications.appointments.{read,update}`, `staff.schedule.update`, `a22.configuration`, `expenses.create`, `tasks.create`, `loyalty.internal.adjust` | REQUIRED | `region` | full | inherited | 12 diff rows |
| 17 | `FORM` | NONE, NAVIGATE, REFINE, DRAFT, HANDOFF (**DRAFT**) | `INHERITED` — the draft owner named by `submit_intent.capability` | REQUIRED | `form` | full | inherited | 12 fields |
| 18 | `CONSENT_STATE` | NONE, HANDOFF (**NONE**) | `CONSENT_REGISTER` → `consent.*` (**unregistered — §2.7**) | REQUIRED | `region` | full | client_identified | 1 subject |
| 19 | `IDENTITY_BINDING` | NONE, HANDOFF (**NONE**) | `IDENTITY_BINDING_OWNER` → `identity.*` (**unregistered — §2.7**) | REQUIRED | `region` | full | client_identified | 8 bindings |
| 20 | `PAYMENT_HANDOFF` | NONE, NAVIGATE, REFINE, COMMIT, HANDOFF (**COMMIT**) | `COMMERCE_OWNER` → commerce/loyalty **write** keys (**unregistered — §2.7**) | REQUIRED | `region` | full | client_identified | 8 lines |
| 21 | `MEDIA_PREVIEW` | NONE, NAVIGATE, REFINE (**REFINE**) | `MEDIA_GENERATION_OWNER` → `cutmatch.*` (**unregistered — §2.7**) | REQUIRED | `img` | **recipe_only** | client_identified | 1 media |
| 22 | `ARTIFACT` | NONE, NAVIGATE, HANDOFF (**NAVIGATE**) | `ARTIFACT_OWNER` → `owner_report.download`, `owner_report.status` | FORBIDDEN | `link` | **file_facts_only** | client_identified | 1 file |

**K11 — exactly four kinds may carry a `COMMIT`: `BOOKING_CONFIRMATION`, `SETTINGS_DRAFT`, `APPROVAL`, `PAYMENT_HANDOFF`.** Each is a *confirmation body*: a server-composed read model of an effect that has not happened yet. `FORM` is not among them. *Mechanism:* `commit_allowed` is derived from `permitted_effects` at REGISTRY LOAD, checked at MINT/INTENT, and checked independently at ACTION ENGINE INGRESS against the persisted `IntentRecord.widget_kind` — so a token that somehow reached the engine from another kind is refused by an owner that never trusted the emitter. *Evaluated at:* REGISTRY LOAD, MINT/INTENT, ACTION ENGINE INGRESS.

**K12 — nothing in a confirmation body is input.** The `COMMIT` intent on any of the four kinds carries `input_schema === null`; its arguments are frozen nouns resolved by a fresh read from the canonical owner at the INPUT VALIDATION gate. *Evaluated at:* MINT/INTENT (refuses a non-null `input_schema` on a `COMMIT`) and at the INPUT VALIDATION gate (refuses a submission carrying `inputs` for a null schema).

**K13 — one `COMMIT` per envelope.** `max_commit_intents` is `1` for the four confirmation kinds and `0` for the other eighteen. *Evaluated at:* MINT/INTENT, counting minted tokens per `widget_id`.

**K14 — open-domain input is rationed across every kind, not only `FORM`.** `input_allowed` is `'open_domain'` only for `FORM`; it is `'closed_domain'` for `CHOICE`, the three selectors, `SCHEDULE`, `CLIENT_LIST`, `STRATEGY_OPTIONS`, `SETTINGS_DRAFT` and `PAYMENT_HANDOFF`, and `'none'` for the rest. An intent whose `input_schema` contains a field of type `string`, `integer`, `date`, `time` or `phone` without a closed `enum_values` may be minted only onto a kind whose `input_allowed === 'open_domain'`, and every such envelope is written to the **free-input ledger** with its `justification`, its tenant and its capability. *Mechanism:* `IntentGateway.mint` inspects the schema and consults `KIND_REGISTRY[kind].input_allowed`; the ledger write is in the same transaction as the mint. *Evaluated at:* MINT/INTENT. Consequence: `CHOICE` has no `allow_free_text` field — free text in chat is a chat message, which travels the text router, not a widget field — and the ledger counts every open-domain envelope rather than the subset that happens to be a `FORM`.

[NON-NORMATIVE] The first edition claimed `FORM` was the only free-input kind while its own `CHOICE` body carried `allow_free_text` and its `InputSchema` admitted open-domain scalars on an intent of any kind, so the per-tenant counter under-counted the leak it was invented to measure.

**K15 — fullscreen is a declared obligation, not a renderer's choice.** `presentation.fullscreen_detail` must be non-null when `fullscreen === 'REQUIRED'`; must be non-null when `fullscreen === 'REQUIRED_ABOVE_DENSITY_CAP'` and the counted path exceeds `density_cap.max`; must be null when `fullscreen === 'FORBIDDEN'`; and its `reason` must be a member of `fullscreen_reasons`. *Evaluated at:* MINT/VALIDATE.

**K16 — a fullscreen route renders envelopes, under the same kind rule.** A `fullscreen_detail.route_key` resolves to `(widget_id, density)` and calls the same projector to emit one or more envelopes of the same kind at `density: 'SHEET'`. It is not a bespoke screen, it has no second backend contract, and every clause in this section — including the accessibility clauses of §2.5 — binds it exactly as it binds the in-chat render. *Mechanism:* the shell route resolver accepts only those two parameters and has no path to a capability of its own. *Evaluated at:* route resolution, and in CI by a test asserting the resolver's parameter set.

[NON-NORMATIVE] Without K16 the surface whose declared reason is literally `'accessibility'` — the mandated non-chat fallback — would be the one surface no accessibility clause reached.

**K17 — above the density cap, escalate and disclose.** When the counted path exceeds `density_cap.max`, the envelope must carry a `fullscreen_detail`, must carry a `role: 'more'` `REFINE` intent, and its text equivalent must state `shown_count` and `total_count`. Truncation is always disclosed. *Evaluated at:* MINT/VALIDATE.

**K18 — authority changes what a widget contains, never which widget it is.** No kind is selected by `presentation_mode`, and no intent exists in one mode and not another. Narrowing — row sets, lanes, series, diff paths, option sets — happens server-side before emission, against the authority snapshot, and every narrowed path is listed in `data_scope.masked_fields`. A control the principal may not use is present with `enabled: { state: 'UNAVAILABLE', reason_code: 'PERMISSION' }` and explains itself as an unknown. *Mechanism:* the projector receives the authority snapshot and the composer has no `presentation_mode` branch on `kind`; a CI test asserts that for every fixture pair differing only in `presentation_mode`, `kind` and the set of `intents[].capability` are identical. *Evaluated at:* MINT/COMPOSE and in CI.

**K19 — `retention_sec` is per kind and shortest for PII-bearing kinds.** Defaults: `client_identified` kinds 30 days; `business_aggregate` kinds 180 days; `none` kinds 180 days; `MEDIA_PREVIEW` 7 days; `ARTIFACT` body 7 days (the file's own expiry is its `expires_at`). A tenant may lower these, never raise them. *Mechanism:* the historisation job reads `KIND_REGISTRY[kind].retention_sec`. *Evaluated at:* historisation, per envelope. Dropping a body never touches an `IntentRecord`, an Action Engine receipt, an appointment, a consent record or a loyalty balance.

**K20 — `emittable` is derived, never authored.** At REGISTRY LOAD, `emittable(kind) = ownerClassKeys(kind) ∩ capabilityRegistry ≠ ∅`. `composeEnvelope` refuses a kind whose `emittable` is false and instead emits a `LIMITATION` carrying the `capability_gap_ref` mapped from that owner class, with no intent (fail closed, say so in text). No renderer may synthesise a control for a capability the registry does not contain. *Evaluated at:* REGISTRY LOAD, and at MINT/COMPOSE on every emission.

---

### 2.5 `role_hint` — the closed twelve, and the keyboard model each one owes

```ts
type RoleHint =
  | 'group' | 'radiogroup' | 'listbox' | 'table' | 'grid' | 'document'
  | 'status' | 'progressbar' | 'form' | 'region' | 'img' | 'link';

type RoleHintRule = { derive_from: string; map: Record<string, RoleHint> };
```

| `role_hint` | ARIA structure the renderer owes | Keyboard model |
|---|---|---|
| `group` | `role="group"` + `aria-labelledby` | Tab to the group, Tab through controls |
| `radiogroup` | `role="radiogroup"`, each option `role="radio"` with `aria-checked` | One tab stop; Arrow keys move and select; Space confirms |
| `listbox` | `role="listbox"` with `aria-multiselectable`, options `role="option"`; server `group` boundaries as `role="group"` with `aria-label` | One tab stop; Arrow keys move; Space toggles; Home/End to ends |
| `table` | `role="table"` with `<caption>`, one `columnheader` row, the `is_row_header` column as `rowheader`; `group_by` emits a `rowgroup` per group with a labelled group header row | Tab to the table; Arrow keys move by cell; Enter activates that row's `row_intents` token if present |
| `grid` | `role="grid"`; lanes are `rowheader`, `buckets` are `columnheader`; each entry is a `gridcell` with `aria-colindex`/`aria-colspan` from its `bucket_span` | One tab stop; Arrow keys move by cell; Enter opens `detail_intent`; Shift+Arrow moves an entry within `move_targets` and emits `move_intent` (never a free position) |
| `document` | `role="document"` with `<h2>`/`<h3>` per `sections[].depth`; tables inside follow the `table` row | Normal document reading order; heading navigation; Tab to the fullscreen and export controls |
| `status` | `role="status"`, `aria-live="polite"` | Not focusable unless it carries controls; controls are ordinary tab stops |
| `progressbar` | `role="group"` containing `role="progressbar"` with `aria-valuetext` minted from the step sentence; steps as a `list` | Not focusable; the cancel control is an ordinary tab stop |
| `form` | `role="form"`; every field labelled; `aria-describedby` for `help` and for `bound.basis` | Standard field order = `reading_order`; Enter does not submit |
| `region` | `role="region"` + `aria-labelledby` on a heading | Tab through the declared `interactive_paths`, in `reading_order` |
| `img` | `role="img"` with `aria-label` from `alt` and `aria-describedby` pointing at the text equivalent (`table_equivalent` for `CHART`, `recipe` for `MEDIA_PREVIEW`) | Not focusable; the drill/regenerate/export controls are ordinary tab stops |
| `link` | a single first-party activation control with an accessible name from `filename` + `format` + `size_bytes` | One tab stop; Enter activates |

**K21 — `role_hint` is derived where the body decides it.** For `CHOICE` and `SERVICE_SELECTOR`, `role_hint = select === 'single' ? 'radiogroup' : 'listbox'`. For `CHART`, the receipt records `'table'` when the degradation ladder replaced the picture with `table_equivalent`. *Mechanism:* `KindRule.role_hint` is a `RoleHintRule` for those kinds and is computed by the composer, never authored. *Evaluated at:* MINT/COMPOSE.

**K22 — `reading_order` covers every interactive element, and each kind declares which paths those are.** `presentation.a11y.reading_order` is a list of *interactive-element refs* — the union of `option_id`, `field_key`, `row_key`, `entry_ref`, `series_id` and bare `intent_token` — and must contain exactly the refs produced by `KIND_REGISTRY[kind].interactive_paths` applied to this body, in render order. *Mechanism:* `validateEnvelope` recomputes the ref set from `interactive_paths` and refuses on any difference. *Evaluated at:* MINT/VALIDATE.

[NON-NORMATIVE] Typed as "option_ids / field keys", `reading_order` was unsatisfiable for at least eight kinds whose interactive elements are intent tokens, row keys and entry refs; and seven `role_hint` values left `SCHEDULE`, `PROGRESS` and `REPORT` with no member that fits.

---

### 2.6 The twenty-two bodies

Each row states: **body**, **effect ceiling**, **canonical owner**, **fullscreen**, **`role_hint`**, **text equivalent**, then the rules that are specific to the kind, each with its mechanism and evaluation point.

---

#### 2.6.1 `CHOICE`

```ts
interface ChoiceBody {
  prompt: LocaleText | NarrativeText;
  select: 'single' | 'multi';
  min_select: number; max_select: number;      // 1 ≤ min ≤ max ≤ options.length
  options: OptionItem[];                        // ≥2
  shown_count: number; total_count: number | null;
  more_intent: string | null;                   // REFINE
}
```

**Ceiling** REFINE (`NONE`, `NAVIGATE`, `REFINE`, `HANDOFF`). **Owner** `INHERITED` — the envelope's `source_capability`, which must be a registry key. **Fullscreen** OPTIONAL (`exceeds_chat_density`). **`role_hint`** derived (K21). **Interactive paths** `options[].option_id`, `more_intent`. **Text** headline = `prompt`; itemized = `options`; order `lead → options → completeness → unknowns → as_of`; parity `full`.

- **CHOICE.1** No free-text field exists on this kind (K14). *Mechanism:* absent from the schema. *Evaluated at:* MINT/COMPOSE.
- **CHOICE.2** `CHOICE` may carry explanation copy, current state and consequence for a `NEVER_CHAT_ACTUATED` capability, and a `HANDOFF` to the verified surface — never an accept/decline control. *Mechanism:* the only permitted effects are read-class plus `HANDOFF`, and a `HANDOFF` on this kind must carry a non-null `handoff_capability_ref` and a target of class `s`. *Evaluated at:* MINT/INTENT and MINT/VALIDATE.

---

#### 2.6.2 `SERVICE_SELECTOR`

```ts
interface ServiceSelectorBody {
  prompt: LocaleText;
  category_path: LocaleText[];
  select: 'single' | 'multi';
  options: Array<OptionItem & {
    service_ref: string;                        // frozen noun handle, never a price or an id
    duration: Measure;                          // unit 'minutes'
    price: Measure;                             // unit 'RUB'
    requires_consultation: Cell<boolean>;
    combinable_with: string[];                  // service_refs
  }>;
  total_preview: Measure | null;
  shown_count: number; total_count: number | null;
  more_intent: string | null;                   // REFINE
}
```

**Ceiling** DRAFT. **Owner** `CATALOG_READ` → `catalog.services.read`. **Fullscreen** OPTIONAL (`exceeds_chat_density` — the full catalogue). **`role_hint`** derived. **Interactive paths** `options[].option_id`, `more_intent`. **Text** headline = `prompt`; itemized = `options` (name, duration, price as formatted `Measure`s); order `lead → options → totals → completeness → unknowns → as_of`; parity `full`.

- **SERVICE.1** A `DRAFT` on this kind is routed to the canonical booking owner, which runs booking-intent normalisation, Client-principal verification and confirmation identity (B31/B32/B33) *before any draft exists*, and returns a `BOOKING_CONFIRMATION`. *Evaluated at:* the EFFECT ROUTING gate.
- **SERVICE.2** Margin, cost and staff earnings are not fields of this body. *Mechanism:* absent from the schema; the projector may return only a subset of `catalog.services.read`'s projection. *Evaluated at:* MINT/COMPOSE.

---

#### 2.6.3 `STAFF_SELECTOR`

```ts
interface StaffSelectorBody {
  prompt: LocaleText;
  for_service_refs: string[];
  options: Array<OptionItem & {
    staff_ref: string;
    role_label: Cell<string>;
    nearest_availability: Measure;              // unit 'datetime'
    rating: Measure | null;
  }>;
  any_staff_option: OptionItem | null;
  shown_count: number; total_count: number | null;
  more_intent: string | null;
}
```

**Ceiling** DRAFT. **Owner** `CATALOG_READ` → `catalog.staff.read`. **Fullscreen** OPTIONAL. **`role_hint`** `radiogroup`. **Interactive paths** `options[].option_id`, `any_staff_option.option_id`, `more_intent`. **Text** headline = `prompt`; itemized = name, role, nearest availability; order `lead → options → completeness → unknowns → as_of`; parity `full`.

- **STAFF.1** Earnings, payroll share and internal performance are not fields of this body; they are `REPORT`. *Mechanism:* schema absence plus the projection-subset rule. *Evaluated at:* MINT/COMPOSE.

---

#### 2.6.4 `TIME_SLOT_SELECTOR`

```ts
interface TimeSlotSelectorBody {
  prompt: LocaleText;
  timezone: string;                              // IANA
  window: { from: string; to: string };
  grouping: 'by_day' | 'by_part_of_day' | 'flat';
  groups: Array<{ group_id: string; label: LocaleText;
    slots: Array<{ slot_ref: string;             // frozen noun handle
                   start: Measure;               // unit 'datetime'
                   duration: Measure;
                   staff_ref: string | null;
                   price: Measure | null;
                   availability: Cell<'FREE' | 'TAKEN'>;
                   intent_token: string }> }>;
  shown_count: number; total_count: number | null;
  more_intent: string | null;                    // REFINE
  widen_window_intent: string | null;            // REFINE
  none_fit_intent: string;                       // REFINE — always present, never droppable
}
```

**Ceiling** DRAFT — a `COMMIT` token for a booking does not exist anywhere in the system at the moment this kind is rendered. **Owner** `AVAILABILITY_READ` → `booking.availability.read`, `booking.group-availability.read`; `freshness_class: 'live'`; `expires_at` ceiling 90 s. **Fullscreen** REQUIRED (`exceeds_chat_density` — the full calendar). **`role_hint`** `listbox`. **Interactive paths** `groups[].slots[].slot_ref`, `more_intent`, `widen_window_intent`, `none_fit_intent`. **Text** headline = `prompt`; itemized = slots grouped by day then part of day, each stating start, duration and price; order `lead → options → completeness → unknowns → as_of`; parity `full`.

- **SLOT.1** `availability` has two states. There is no `HELD` member and no `hold_token` field: the widget layer may not express an occupancy lock that no canonical owner holds. A slot taken between render and confirm surfaces as `SUPERSEDED` with a rendered diff at the INPUT VALIDATION gate's fresh read — never a silent clamp, never a wrong booking. *Mechanism:* the enum has two members; there is no field in which a lock could be recorded. *Evaluated at:* MINT/VALIDATE, and at the INPUT VALIDATION gate.
- **SLOT.2** A client-presented selector reads only client-bookable windows; the wider admin window is a different registered capability on the same kind. *Evaluated at:* MINT/COMPOSE, against the authority snapshot (K18).

[NON-NORMATIVE] A `HELD` state with a soft lock the provider does not own would make the widget layer the system of record for who holds a chair — the one thing the fundamental rules forbid outright — and a phantom hold would have no owner to expire it.

---

#### 2.6.5 `BOOKING_CONFIRMATION`

```ts
interface BookingConfirmationBody {
  confirmation_subject: 'create' | 'reschedule' | 'cancel';
  draft_ref: string | null;          // non-null iff subject === 'create'
  appointment_ref: string | null;    // non-null iff subject ∈ {'reschedule','cancel'} — a frozen noun
  lines: Array<{ label: LocaleText; detail: Cell<string>; measures: Measure[] }>;
  when: Measure;                     // unit 'datetime' — the resulting time
  when_previous: Measure | null;     // non-null iff subject === 'reschedule'
  staff_label: Cell<string>;
  duration_total: Measure;
  price_total: Measure;
  price_delta: Measure | null;       // non-null iff subject === 'reschedule' and the price differs
  refund_preview: Measure | null;    // non-null iff subject === 'cancel' and money was taken
  loyalty_applied: Measure | null;
  policy_notices: LocaleText[];      // cancellation window, no-show policy, consultation requirement
  commit_intent: string;             // EXACTLY ONE COMMIT
  amend_intents: string[];           // REFINE — back to a selector
  dismiss_intent: string;            // escape, priority 0 — abandons this confirmation, never the appointment
}
```

**Ceiling** COMMIT. **Owner** `BOOKING_OWNER` → `appointments.own.create` / `.reschedule` / `.cancel`; the provider owner alone touches YClients, and a reschedule uses the non-destructive `PUT record/{company}/{id}`. **Fullscreen** OPTIONAL (`audit`, `correction`). **`role_hint`** `region`. **Interactive paths** `commit_intent`, `amend_intents[]`, `dismiss_intent`. **Text** headline = a one-sentence statement of the subject; order `lead → items → totals → policy → readback → options → as_of → expiry`; `readback_template` REQUIRED; parity `full`. **Expiry ceiling** 120 s.

- **BOOK.1 — every booking effect has exactly one canonical confirmation, cancellation included.** `confirmation_subject` discriminates the three effects. A server table `BOOKING_SUBJECT_CAPABILITY` maps each subject to exactly one registry key; `commit_intent.capability` must equal that key. *Mechanism:* MINT/INTENT compares the minted capability against the table; ACTION ENGINE INGRESS independently re-derives the subject from the submitted capability and refuses when the emission's `confirmation_subject` disagrees. *Evaluated at:* MINT/INTENT and ACTION ENGINE INGRESS.
- **BOOK.2 — the refusal is keyed on a registry flag, not a capability name.** The Action Engine refuses any submission for a capability carrying `booking_effect: true` unless the persisted `IntentRecord.widget_kind === 'BOOKING_CONFIRMATION'`. *Mechanism:* a registry flag set on the capability record, read at ingress; adding a fourth booking capability inherits the refusal without a code change. *Evaluated at:* ACTION ENGINE INGRESS.

  [NON-NORMATIVE] The first edition's enforcement clause named `appointments.own.create` alone, so reschedule and cancel could reach a `COMMIT` without ever passing a canonical draft — which is where booking-intent normalisation, Client-principal verification and confirmation identity run. Cancellation had no confirmation body at all.
- **BOOK.3 — `draft_ref` is required only where a draft is required.** A `create` needs a server-owned draft because the appointment does not exist yet; `reschedule` and `cancel` name an existing canonical record by `appointment_ref` and carry no draft. *Mechanism:* a conditional schema clause. *Evaluated at:* MINT/VALIDATE.
- **BOOK.4 — nothing here is input (K12).** `commit_intent.input_schema === null`; the target time and the appointment travel as frozen nouns resolved by a fresh read from the booking owner. *Evaluated at:* MINT/INTENT and the INPUT VALIDATION gate.
- **BOOK.5 — `dismiss_intent` never cancels an appointment.** Its effect class is `NONE`, its handler is the local dismissal of this envelope, and it appears in no routing map. On a `confirmation_subject: 'cancel'` body, cancelling the appointment *is* the `COMMIT`. *Mechanism:* naming plus the effect class; the escape intent is never minted with a capability. *Evaluated at:* MINT/INTENT.

---

#### 2.6.6 `SCHEDULE`

```ts
interface ScheduleBody {
  range: { from: string; to: string };
  timezone: string;
  lanes: Array<{ lane_id: string; label: Cell<string>; staff_ref: string | null }>;
  buckets: Array<{ bucket_id: string; start: string; end: string }>;   // the CLOSED column domain
  entries: Array<{
    entry_ref: string;
    lane_id: string;
    bucket_span: [string, string];             // bucket_ids, inclusive
    title: Cell<string>;
    subtitle: Cell<string> | null;
    state: 'BOOKED' | 'BLOCKED' | 'FREE' | 'UNKNOWN';
    pii_masked: boolean;
    detail_intent: string | null;              // REFINE / NAVIGATE
    move_intent: string | null;                // REFINE
    move_targets: string[] | null;             // CLOSED set of bucket_ids; the move_intent's selection_domain
  }>;
  gaps: Array<{ lane_id: string; bucket_span: [string, string]; recoverable: Measure }>;
  detail_intent: string;
}
```

**Ceiling REFINE — one ceiling, stated once.** `permitted_effects` are `NONE`, `NAVIGATE`, `REFINE`, `HANDOFF`. The grid never mints a `COMMIT`, and it never mints a `DRAFT`. **Owner** `SCHEDULE_READ` → `staff.schedule.read`, `staff.schedule.own.read`, `operations.journal.read`, `company.business-hours.read`. **Fullscreen** REQUIRED_ABOVE_DENSITY_CAP (24 entries; reason `exceeds_chat_density`). **`role_hint`** `grid`. **Interactive paths** `entries[].entry_ref`, `detail_intent`. **Text** headline = range and lane count; itemized = lane-by-lane prose, masked entries read as occupied with no name; order `lead → items → masking → completeness → unknowns → as_of`; parity `full`.

- **SCHED.1 — a drag is a selection from a closed domain, not a typed time.** A drag gesture resolves to the entry's pre-minted `move_intent`, whose `IntentRecord.selection_domain` is exactly `move_targets` — a set of `bucket_id`s the server computed at emission. No client-authored time, date or duration ever reaches the gateway. A submission naming a bucket outside the domain is refused (`REFUSED / selection_out_of_domain`). *Mechanism:* the closed `selection_domain` on the `IntentRecord`. *Evaluated at:* the INPUT VALIDATION gate.
- **SCHED.2 — a drag returns a canonical confirmation.** The `move_intent` is a `REFINE` carrying the registry capability `booking.reschedule.propose` (flagged `booking_effect: true`), routed to the canonical booking owner, which runs B31/B32/B33 and returns `next_envelope` = `BOOKING_CONFIRMATION` with `confirmation_subject: 'reschedule'`. The `COMMIT` for the reschedule is minted onto that body and nowhere else (K11, BOOK.2). *Mechanism:* the EFFECT ROUTING gate routes by capability; the mint-time kind check refuses any effect above `REFINE` on `SCHEDULE`. *Evaluated at:* MINT/INTENT and the EFFECT ROUTING gate.

  [NON-NORMATIVE] The first edition said `REFINE / NAVIGATE` in its ceiling table and "`SCHEDULE` + a `DRAFT` intent" in its taxonomy — an unresolved contradiction about the highest effect a calendar may mint, on the kind that covers the whole calendar/journal family. It is resolved here in favour of the lower ceiling, and the reschedule path is spelled out so the resolution is implementable rather than merely restrictive.
- **SCHED.3 — no `HELD` state.** As SLOT.1: the grid's state enum has no member for a lock no canonical owner holds. `UNKNOWN` is a first-class member with a `Cell`-carried reason on `title`. *Evaluated at:* MINT/VALIDATE.
- **SCHED.4 — a masked entry is masked before emission.** `pii_masked: true` entries carry a `title` `Cell` whose state is `UNAVAILABLE` with `reason_code: 'PERMISSION'` and a human label; the renderer never receives a name it must hide. Every masked path is listed in `data_scope.masked_fields`. *Evaluated at:* MINT/COMPOSE, behind the same preview/PII enforcement points as every other read path.

---

#### 2.6.7 `CLIENT_LIST`

```ts
interface ClientListBody {
  segment_label: LocaleText;
  segment_ref: string;
  table: TableSpec;
  pii_masked: boolean;
  bulk_intents: Array<{ intent_token: string; label: LocaleText; audience_size: Measure }>;
  page: { cursor_ref: string | null; has_more: boolean };
}
```

**Ceiling** REQUEST_APPROVAL. **Owner** `CLIENT_READ` + `BULK_AUDIENCE_OWNER` → `clients.*`, `customers.count`, `b35.preview` / `b35.status` / `b35.confirm`. **Fullscreen** REQUIRED (`exceeds_chat_density`, `audit`). **`role_hint`** `table`. **Interactive paths** `table.rows[].row_key` (where `row_intents` has an entry), `bulk_intents[].intent_token`. **Text** headline = segment and count; itemized = row-per-line over `TableSpec`; order `lead → items → audience → completeness → unknowns → masking → as_of`; parity `full`.

- **CLIENT.1** Every `bulk_intents` entry carries `audience_size` as a `Measure` **in the body**, so the number is inside the `Cell`/provenance discipline and is stated in text before the control is reachable in `reading_order`. *Mechanism:* schema requirement plus K9's declared sentence order (`audience` precedes `options`). *Evaluated at:* MINT/VALIDATE and in CI.
- **CLIENT.2** This kind is never emitted with `presentation_mode: 'client'`. *Mechanism:* `pii_ceiling: 'client_identified'` combined with the display fence, which refuses `client_identified` under a client presentation unless the subject is the principal — and a segment is never one principal. *Evaluated at:* MINT/VALIDATE.

---

#### 2.6.8 `METRIC`

```ts
interface MetricBody {
  period_label: LocaleText;
  metrics: Measure[];                      // 1..5
  headline_metric_key: string;             // must name a member of metrics
  compare_intent: string | null;           // REFINE — change the comparison baseline
  drill_intent: string | null;             // REFINE / NAVIGATE
}
```

**Ceiling** REFINE. **Owner** `MEASUREMENT_READ` → `c7.measurement.read`, `analytics.team-kpi.read`. **Fullscreen** OPTIONAL. **`role_hint`** `status`. **Interactive paths** `compare_intent`, `drill_intent`. **Text** headline = the headline `Measure` as one sentence; itemized = one sentence per `Measure` (label, formatted value, unit, `as_of`, basis); order `lead → items → unknowns → completeness → as_of`; parity `full`.

- **METRIC.1** Every number is a `Measure`; the body has no bare numeric field. A non-`KNOWN` `Measure` reads its label and blocks only itself. *Evaluated at:* MINT/VALIDATE.
- **METRIC.2** A period or baseline change is a `REFINE` carrying the same registered read capability — not a `NAVIGATE` to a link class that could invoke something else. *Mechanism:* `REFINE` carries a non-null capability and therefore passes the registry and AUTHORITY gates (K4). *Evaluated at:* MINT/INTENT and the AUTHORITY gate.

  [NON-NORMATIVE] The first edition capped the analytic kinds at `NAVIGATE`. That is not the safer choice: a capability-null `NAVIGATE` is validated as carrying no capability while its target may still name one, whereas a `REFINE` is checked against the registry and the live principal.

---

#### 2.6.9 `CHART`

```ts
interface ChartBody {
  chart_kind: 'line' | 'bar' | 'stacked_bar' | 'area' | 'scatter';
  dataset_ref: string;                     // canonical C7/C8 handle
  projection_ref: string;                  // which projection of that dataset these series are
  rows_digest: string;                     // digest of the dataset rows, returned by the read service
  series_digest: string;                   // digest of the emitted series, returned by the read service
  axes: {
    x: { label: LocaleText; type: 'category' | 'time' | 'quantity';
         buckets: Array<Cell<string> | Measure> | null };   // the read service's bucketing, echoed
    y: { label: LocaleText; unit: Measure['unit'] };
  };
  series: Array<{ series_id: string; label: Cell<string>;
                  points: Array<{ x: Cell<string> | Measure; y: Measure }> }>;
  table_equivalent: TableSpec;             // REQUIRED
  gap_policy: 'RENDER_GAP';                // literal, single value
  drill_intent: string | null;             // REFINE
  export_intent: string | null;            // REFINE → returns an ARTIFACT
}
```

**Ceiling** REFINE. **Owner** `RESULT_READ` → `c8.result.read`, `c7.measurement.read`. **Fullscreen** REQUIRED (`exceeds_chat_density`). **`role_hint`** `img`, described by `table_equivalent`; `'table'` when the ladder degraded it. **Interactive paths** `drill_intent`, `export_intent` (and, when degraded to `table`, `table_equivalent.rows[].row_key`). **Text** headline = what the chart is of; itemized = `table_equivalent` rendered as prose — not a description of the picture; order `lead → items → completeness → unknowns → as_of`; parity `full`.

- **CHART.1 — both axes are typed, and neither is composed.** `points[].x` is a `Cell<string>` (category, time label) or a `Measure` (quantitative position); `points[].y` is a `Measure`. Every point cell is minted by the C7/C8 read service's own formatter; the chart projector performs no arithmetic and constructs no point. *Mechanism:* `validateEnvelope` recomputes `sha256(stableActionJson(series))` and requires equality with `series_digest`, which the read service returned alongside the rows; a series the composer assembled cannot produce a matching digest. `rows_digest` is likewise re-hashed against the source envelope. *Evaluated at:* MINT/VALIDATE, and in CI over recorded emissions.

  [NON-NORMATIVE] The first edition typed `y` as a `Measure` and left `x` untyped, so axis positions and bucket boundaries — which are chart numbers — carried no state, no `as_of`, no evidence and no formatter coverage, and `rows_digest` digested the dataset rather than the rendered points.
- **CHART.2 — bucket boundaries are the read service's, echoed.** When `axes.x.buckets` is non-null it is the read service's bucketing verbatim and every `points[].x` must be a member of it; when it is null the axis is categorical and its categories are exactly the distinct `x` cells present. *Evaluated at:* MINT/VALIDATE.
- **CHART.3 — `table_equivalent` is lossless.** A CI test asserts a bijection between `(series_id, x)` pairs and `table_equivalent` cells. *Evaluated at:* CI.
- **CHART.4 — a gap is rendered as a gap.** A non-`KNOWN` point is omitted from the line and stated in text; `gap_policy` has one legal value, so interpolation across an unknown is not expressible. *Evaluated at:* MINT/VALIDATE and in the renderer conformance suite.
- **CHART.5 — a series the principal may not read is absent, not greyed.** The absence is stated by a `Limitation`. *Evaluated at:* MINT/COMPOSE (K18).

---

#### 2.6.10 `REPORT`

```ts
interface ReportBody {
  title: LocaleText;
  period_label: LocaleText;
  top_summary: Measure[];                  // ≤3
  sections: Array<{ section_id: string; heading: LocaleText; depth: 1 | 2;
                    narrative: NarrativeText;
                    table: TableSpec | null;
                    metrics: Measure[] }>;
  fullscreen_intent: string;               // REQUIRED — NAVIGATE
  export_intent: string | null;            // REFINE → returns an ARTIFACT
}
```

**Ceiling** REFINE. **Owner** `ANALYTICS_READ` → `analytics.business.{query,profit}`, `analytics.revenue.forecast`, `analytics.branches.compare`, `reports.recovered`, `expenses.read`, `clients.dossier.read`. **Fullscreen** REQUIRED (`exceeds_chat_density`, `audit`). **`role_hint`** `document`. **Interactive paths** `fullscreen_intent`, `export_intent`, `sections[].table.rows[].row_key`. **Text** headline = `title` + `period_label`; itemized = headings, then narrative, then tables row-by-row; order `lead → totals → items → completeness → unknowns → masking → as_of`; parity `full`.

- **REPORT.1** `top_summary` is at most three `Measure`s and `fullscreen_intent` is mandatory: a hierarchical table never lives in a chat bubble. *Evaluated at:* MINT/VALIDATE.
- **REPORT.2** `narrative` is `NarrativeText` (K6), so the model can compose the sentence and cannot type the number. *Evaluated at:* MINT/VALIDATE.
- **REPORT.3** `group_by` gives exactly one level of grouping, which is what a two-level hierarchy (category → item) requires; a third level is not expressible and must become a second `REPORT` section or a fullscreen render. *Evaluated at:* MINT/VALIDATE.

---

#### 2.6.11 `STRATEGY_OPTIONS`

```ts
interface StrategyOptionsBody {
  revision_ref: string;
  question: NarrativeText;
  alternatives: Array<{ option_id: string; title: Cell<string>;
                        reasoning: NarrativeText;
                        expected_effect: Measure;
                        risk_tier: 'read' | 'low_write' | 'medium_write' | 'high_write' | 'restricted';
                        reversible: Cell<boolean>;
                        audience_size: Measure | null;
                        select_intent: string }>;      // ≤3
  no_action_option: { title: LocaleText; consequence: NarrativeText; select_intent: string };  // REQUIRED
  review_state: 'draft' | 'reviewed' | 'not_an_approval';
  review_disclaimer: LocaleText;
}
```

**Ceiling** REQUEST_APPROVAL. **Owner** `ORCHESTRATION_RUN` → C9 run revisions and `c9.no_action`; the alternative shape is reused verbatim from the C9 contract, not re-declared. **Fullscreen** OPTIONAL (`audit`). **`role_hint`** `radiogroup`. **Interactive paths** `alternatives[].option_id`, `no_action_option.select_intent`. **Text** headline = `question`; itemized = ≤3 alternatives with reasoning, expected effect, risk and reversibility, then NO_ACTION — always spoken; order `lead → options → risk_reversibility → audience → policy → unknowns → as_of`; parity `full`.

- **STRATEGY.1** `no_action_option` is required and selectable, and is never dropped by degradation. *Evaluated at:* MINT/VALIDATE and at ladder step 2 (`priority: 0`).
- **STRATEGY.2** `risk_tier`, `reversible` and `audience_size` are copied from the agent result's proposed intents; the widget layer computes none of them. *Evaluated at:* MINT/COMPOSE, by field copy.
- **STRATEGY.3** `review_disclaimer` is rendered verbatim in every channel: a review is not an approval, and the C9 review path can never satisfy a pending approval. *Evaluated at:* MINT/VALIDATE (`LocaleText` key fixed) and at the EFFECT ROUTING gate.
- **STRATEGY.4** This kind may not be emitted on a proactive trigger. *Evaluated at:* MINT/VALIDATE.

---

#### 2.6.12 `APPROVAL`

```ts
interface ApprovalBody {
  approval_ref: string;
  subject: Cell<string>;
  effect_preview: Array<{ label: LocaleText; value: Cell<string> | Measure }>;
  audience_size: Measure | null;           // REQUIRED non-null for any communication-class approval
  risk_tier: 'read' | 'low_write' | 'medium_write' | 'high_write' | 'restricted';
  reversible: Cell<boolean>;
  state: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'EXPIRED' | 'UNKNOWN';
  requested_by_label: Cell<string>;
  expires_at: string;
  approve_intent: string | null;
  reject_intent: string | null;
  blocked_reason: LocaleText | null;       // non-null iff both decision intents are null
  detail_intent: string;                   // NAVIGATE to the effect detail
}
```

**Ceiling** COMMIT — the approval *decision* only; the approved effect is executed by the Action Engine, never by this envelope. **Owner** `ACTION_EXECUTION` → the Action Engine's own approval path on that execution; `integrity.approval_binding_echo` is echoed and re-derived, never accepted as input. **Fullscreen** REQUIRED (`audit` — the effect detail). **`role_hint`** `region`. **Interactive paths** `approve_intent`, `reject_intent`, `detail_intent`. **Text** headline = `subject`; order `lead → items → audience → risk_reversibility → expiry → options`; parity `full`. **Expiry ceiling** `source_bound` (the approval's own TTL).

- **APPROVAL.1 — the maths precede the verb.** `sentence_order` places `audience` and `risk_reversibility` before `options`; a CI test asserts the index ordering for every fixture. *Evaluated at:* MINT/VALIDATE and CI.
- **APPROVAL.2 — four-eyes is a server fact.** When the approver would equal the initiator, both decision intents are null and `blocked_reason` explains why. *Mechanism:* the Action Engine's approval state machine supplies the flag; the composer has no rule of its own. *Evaluated at:* MINT/COMPOSE, and again at the CANONICAL ACTION gate, which enforces four-eyes regardless of what was rendered.
- **APPROVAL.3 — no failure state.** `state` has no `FAILED` member; an execution whose outcome is not yet known is `UNKNOWN`, which renders neutrally with reconciliation language. *Evaluated at:* MINT/VALIDATE, plus the anti-error lint on every label.

---

#### 2.6.13 `PROGRESS`

```ts
interface ProgressBody {
  run_ref: string;
  headline: Cell<string>;
  steps: Array<{ step_id: string; label: LocaleText;
                 state: 'PENDING' | 'RUNNING' | 'DONE' | 'SKIPPED' | 'UNKNOWN';
                 unknown: { reason_code: ReasonCode; label: string;
                            next_intent_ref: string | null } | null;   // non-null iff state === 'UNKNOWN'
                 receipt_ref: string | null }>;
  step_index: number; step_total: number;
  budget_note: LocaleText | null;
  poll_after_ms: number;
  stream_ref: string | null;
  cancel_intent: string | null;            // REFINE, capability 'orchestration.run.cancel'
}
```

**Ceiling** REFINE. **Owner** `ORCHESTRATION_RUN` → `orchestration.run.read`, `orchestration.run.cancel`, `owner_report.status`. **Fullscreen** FORBIDDEN. **`role_hint`** `progressbar`. **Interactive paths** `cancel_intent`, `steps[].unknown.next_intent_ref`. **Text** headline = "шаг N из M" plus the running step; itemized = one line per step; order `step_progress → items → unknowns → policy → as_of`; `budget_note` is read aloud including that paid reasoning is disabled; parity `full`. **Expiry ceiling** `source_bound` (the run window).

- **PROGRESS.1 — there is no `failed` step state.** The enum has five members and none of them is a failure. A step that cannot complete is `UNKNOWN`, carrying a `reason_code`, a human label and, where one exists, a `next_intent_ref` that could resolve it. *Mechanism:* the enum itself; plus the anti-error lint over `unknown.label`; plus a validator rule requiring `limitations.length > 0` and a non-null `unknowns_sentence` whenever any step is `UNKNOWN`. *Evaluated at:* MINT/VALIDATE.
- **PROGRESS.2 — `UNKNOWN` is a first-class state, not a degraded one.** No renderer may bind an `UNKNOWN` step to a danger or destructive token, an error icon, `aria-invalid`, an alert live region, or an automatic retry; the permitted rendering is neutral-dim plus the `next_intent_ref` affordance. An `UNKNOWN` step holds its position and blocks only its dependents, never the envelope. *Mechanism:* the renderer conformance suite, which fails a renderer with fewer than five branches per `Cell` and asserts the token bindings per state. *Evaluated at:* the renderer conformance suite, in CI.
- **PROGRESS.3 — cancel is not a local action.** `cancel_intent` is a `REFINE` carrying the registry capability `orchestration.run.cancel`, so it passes the registry lookup, the agent denied-set check, `maxSideEffectClass` and the AUTHORITY gate against the live principal. No intent on any kind whose effect is `NONE` appears in a routing map. *Mechanism:* K4 plus the capability-null rule; a CI test asserts that the routing map contains no `NONE`-class intent. *Evaluated at:* MINT/INTENT, the AUTHORITY gate, and CI.

  [NON-NORMATIVE] Classed as `NONE`, cancel was a server state change travelling under the one effect class exempt from the registry lookup and from any capability-keyed authority derivation — bounded only by principal binding.

---

#### 2.6.14 `LIMITATION`

```ts
interface LimitationBody {
  severity: 'info' | 'limitation' | 'risk' | 'blocking';
  headline: LocaleText;
  detail: LocaleText | NarrativeText;
  source_limitation_codes: string[];       // non-empty
  capability_gap_ref: string | null;
  remedy_intents: string[];                // MUST be empty when capability_gap_ref !== null
}
```

**Ceiling** NAVIGATE (`NONE`, `NAVIGATE`, `HANDOFF`). **Owner** `NONE` — this kind cites the emitter's `Limitation[]` and the capability-gap ledger; it has no capability of its own and mints no capability-bearing intent. **Fullscreen** OPTIONAL. **`role_hint`** `status`. **Interactive paths** `remedy_intents[]`. **Text** headline = `headline`; order `lead → gap → handoff`; parity `full`.

- **LIMIT.1 — no button for a capability with no owner.** When `capability_gap_ref` is non-null, `remedy_intents` must be empty and the text equivalent must carry the gap sentence stating plainly that nothing in the product can do this yet. *Mechanism:* a conditional schema clause plus the `gap` sentence in `sentence_order`. *Evaluated at:* MINT/VALIDATE.
- **LIMIT.2 — `severity` is not an error vocabulary.** There is no `error` member; `blocking` describes scope, not tone, and the anti-error lint applies to `headline` and `detail` as to every other label. *Evaluated at:* MINT/VALIDATE.
- **LIMIT.3 — the gap statement is mode-invariant.** It is never softened, expanded or removed by `presentation_mode`. *Evaluated at:* MINT/COMPOSE (K18).

---

#### 2.6.15 `SOURCE_STATUS`

```ts
interface SourceStatusBody {
  sources: Array<{ source_id: string; label: Cell<string>;
                   state: 'CONNECTED' | 'DEGRADED' | 'UNLINKED' | 'UNKNOWN';
                   as_of: Cell<string>;
                   impact_text: LocaleText;
                   reconnect_intent: string | null }>;   // HANDOFF, target class 's'
  overall: 'OK' | 'PARTIAL' | 'BLOCKED' | 'UNKNOWN';
}
```

**Ceiling** NAVIGATE (`NONE`, `NAVIGATE`, `HANDOFF`). **Owner** `INTEGRATION_STATUS` → `support.integration-status.read`; handoff `support.contact-admin.request`. **Fullscreen** OPTIONAL. **`role_hint`** `status`. **Interactive paths** `sources[].reconnect_intent`. **Text** per source: name, state, `as_of`, impact sentence; order `lead → items → handoff → as_of`; parity `full`.

- **SOURCE.1** A provider capability the CRM does not support surfaces here, as a source state with an impact sentence — never as a fabricated success and never as an error screen. *Mechanism:* the projector maps the unsupported-capability signal onto `state: 'DEGRADED'` with an impact `LocaleText`. *Evaluated at:* MINT/COMPOSE.
- **SOURCE.2** In a client presentation the body states the impact on the principal's own data and omits provider names and integration identity; the omitted paths appear in `masked_fields`. *Evaluated at:* MINT/COMPOSE.
- **SOURCE.3** `reconnect_intent` is a `HANDOFF` whose target class is `s` and whose verification floor is server-derived; below that floor it is the only interactive element retained. *Evaluated at:* MINT/INTENT and the VERIFICATION FLOOR gate.

---

#### 2.6.16 `SETTINGS_DRAFT` — the general confirmation body

```ts
interface SettingsDraftBody {
  draft_ref: string;                       // server-owned; minted by the canonical draft owner
  draft_class: 'settings' | 'notification_pref' | 'expense' | 'loyalty_adjustment'
             | 'task' | 'schedule_rule' | 'audience';
  scope_label: Cell<string>;
  diff: Array<{ path: string; label: LocaleText;
                from: Cell<string | number | boolean>;   // NOT_MEASURED when there was no prior value
                to: Cell<string | number | boolean>;
                effect_text: LocaleText;
                reversible: Cell<boolean>;
                bound_ref: string | null }>;             // non-null for every numeric/financial row
  apply_intent: string;                    // the ONE COMMIT
  discard_intent: string;                  // escape, priority 0
  editor_handoff_intent: string;           // REQUIRED, never droppable
}
```

**Ceiling** COMMIT. **Owner** `SETTINGS_OWNER` and every registered non-booking, non-payment draft owner — the capability named by `apply_intent.capability`. **Fullscreen** REQUIRED (`exact_configuration`, `audit`, `correction`, `accessibility`). **`role_hint`** `region` — nothing in this body is input. **Interactive paths** `apply_intent`, `discard_intent`, `editor_handoff_intent`. **Text** headline = `scope_label`; itemized = "было → станет" per diff row with its effect sentence and reversibility; order `lead → items → policy → options → unknowns → as_of`; parity `full`.

- **SETTINGS.1 — this is the confirmation body for every non-booking, non-payment draft.** A `FORM` submission, a chat-composed expense, a loyalty adjustment and a schedule rule all converge here: the canonical draft owner computes the diff, and only this body carries the `COMMIT`. *Mechanism:* the EFFECT ROUTING gate routes a `DRAFT` to the capability's registered draft owner, whose return kind is declared in the registry as one of the four confirmation kinds. *Evaluated at:* the EFFECT ROUTING gate.

  [NON-NORMATIVE] The name is historical; the shape — a server-computed diff with an effect sentence and a reversibility flag per row — is exactly what an expense intake or a loyalty adjustment needs, and adding a twenty-third kind to say the same thing would have bought nothing.
- **SETTINGS.2 — `from` is a `Cell`.** A missing prior value is `NOT_MEASURED` with a human label, never an empty string and never an em dash. *Evaluated at:* MINT/VALIDATE (K5).
- **SETTINGS.3 — every numeric or financial row names a server-side bound.** `bound_ref` is re-derived at the INPUT VALIDATION gate as in K7; the diff's displayed numbers are never policy.
- **SETTINGS.4 — `editor_handoff_intent` is never droppable.** It carries `priority: 0` and survives every step of the degradation ladder; it is the mandated non-chat fallback for audit, exactness, accessibility and correction. *Evaluated at:* MINT/VALIDATE (presence) and ladder step 2 (undroppable).
- **SETTINGS.5 — a consent-bearing setting is not settled by being a setting.** When `draft_class === 'notification_pref'`, the `apply_intent`'s verification floor is derived server-side from the capability registry and the policy service, with a registry minimum of `SESSION_VERIFIED` for every consent-bearing capability, including per-moment delivery preferences. An emitter-supplied floor is a hint and is overwritten. *Mechanism:* `required_verification = max(registry.minVerification(capability), policy.minVerification(riskTier))`, computed at MINT/INTENT and recomputed at the VERIFICATION FLOOR gate. *Evaluated at:* MINT/INTENT and the VERIFICATION FLOOR gate.

---

#### 2.6.17 `FORM`

```ts
interface FormBody {
  form_ref: string;
  justification: FormJustification;
  schema_ref: string;
  fields: FormField[];                     // ≤12
  submit_intent: string;                   // effect DRAFT — ALWAYS
  discard_intent: string;                  // escape, priority 0
  editor_handoff_intent: string;           // REQUIRED, never droppable
  partial_save: false;                     // literal
}

type FormJustification =
  | 'LEGAL_EXACTNESS' | 'MULTI_FIELD_ATOMIC' | 'ACCESSIBILITY_REQUEST'
  | 'CORRECTION_OF_RECORD' | 'AUDIT_EXACT_INPUT';

interface FormField {
  field_key: string;
  label: LocaleText;
  control: 'text' | 'number' | 'date' | 'time' | 'select' | 'toggle' | 'phone';
  required: boolean;
  help: LocaleText | null;
  max_len: number | null;
  pattern: string | null;
  options: OptionItem[] | null;            // REQUIRED non-null iff control === 'select'
  current: Cell<string | number | boolean>;
  bound: FieldBound | null;                // REQUIRED non-null iff control === 'number'
                                           //   or the field is financial (unit 'RUB')
  sensitivity: 'public' | 'internal' | 'pii' | 'SECURE_SURFACE_ONLY';
}
```

**Ceiling DRAFT. `FORM` may never carry a `COMMIT`.** **Owner** `INHERITED` — the draft owner named by `submit_intent.capability`, which must be a registry key. **Fullscreen** REQUIRED (`exact_configuration`, `audit`, `correction`, `accessibility`). **`role_hint`** `form`. **Interactive paths** `fields[].field_key`, `submit_intent`, `discard_intent`, `editor_handoff_intent`. **Text** headline = what is being recorded; itemized = field-by-field prose with current values; order `lead → items → policy → options → unknowns`; parity `full`.

- **FORM.1 — the cap is structural.** `permitted_effects` excludes `COMMIT`, so `commit_allowed` is false and `IntentGateway.mint` cannot produce a `COMMIT` token for a `FORM` at all. *Evaluated at:* REGISTRY LOAD (derivation) and MINT/INTENT (refusal).
- **FORM.2 — a submission produces a server-owned draft, re-rendered as a confirmation body.** The `DRAFT` is routed to the capability's canonical draft owner, which validates every value against the capability's own policy, computes the resulting diff, and returns `next_envelope` = `SETTINGS_DRAFT` (or `BOOKING_CONFIRMATION` for a booking-class capability, or `PAYMENT_HANDOFF` for a payment-class one). **Only that returned body may carry the `COMMIT`.** *Mechanism:* the EFFECT ROUTING gate; the returned kind is declared per capability in the registry, not chosen by the composer. *Evaluated at:* the EFFECT ROUTING gate and, independently, at ACTION ENGINE INGRESS, which refuses any submission whose `IntentRecord.widget_kind` is not one of the four confirmation kinds (K11).

  [NON-NORMATIVE] `FORM` is the one kind accepting open-domain input, and the first edition let it carry a `COMMIT` for an inherited capability — so a client-authored magnitude could reach the Action Engine as a resolved argument, guarded only by a justification enum the contract itself conceded was a social control. The claim "a widget cannot express a direct business mutation" was false for the largest mutation surface in the design. It is now true by construction: the value the user typed is validated by the owner and re-presented as a diff the user confirms.
- **FORM.3 — every numeric or financial field names a server-side bound drawn from the capability.** `bound` is required for `control: 'number'` and for any field whose `Measure` unit is `RUB`; `bound_ref` is re-derived at the INPUT VALIDATION gate, and an out-of-bound value is refused, never clamped (K7). *Evaluated at:* MINT/VALIDATE (presence) and the INPUT VALIDATION gate (re-derivation).
- **FORM.4 — `editor_handoff_intent` and a non-null `fullscreen_detail` are mandatory.** The surfaces with the strongest audit and correction obligations — a cash declaration, an expense intake, a record correction — are precisely the ones that must have a non-chat editor. *Evaluated at:* MINT/VALIDATE.
- **FORM.5 — `SECURE_SURFACE_ONLY` fields are absent from the chat render and from the text.** They are replaced by one handoff sentence; the only legal intent touching them is a `HANDOFF` to a verified channel; a submission carrying such a field is refused (`REFUSED / use_secure_surface`). *Evaluated at:* MINT/COMPOSE, MINT/VALIDATE and the INPUT VALIDATION gate.
- **FORM.6 — `partial_save` is `false` and the escape is undroppable.** A `FORM` is either submitted whole or abandoned whole; `discard_intent` carries `priority: 0` and is reachable by the universal cancel verbs in every channel. *Evaluated at:* MINT/VALIDATE and ladder step 2.
- **FORM.7 — every `FORM` emission is written to the free-input ledger with its justification, tenant and capability (K14).** *Evaluated at:* MINT/INTENT.

---

#### 2.6.18 `CONSENT_STATE`

```ts
interface ConsentStateBody {
  consent_kind: 'PD_BASE' | 'MARKETING' | 'CHANNEL_DELIVERY' | 'HISTORY_RETENTION';
  subject_label: Cell<string>;                      // masked unless subject_is_principal
  decision: Cell<'GRANTED' | 'DECLINED' | 'WITHDRAWN' | 'NEVER_ASKED'>;
  recorded_at: Cell<string>;
  recorded_via: Cell<string>;                       // which surface recorded it — audit, not a link
  scope_text: LocaleText[];                         // what the current decision permits
  change_effect_text: LocaleText[];                 // what changing it would do
  register_ref: string | null;                      // append-only consent-register handle
  change_handoff_intent: string | null;             // HANDOFF only; target class 's'
  capability_gap_ref: string | null;                // when set, change_handoff_intent MUST be null
}
```

**Ceiling NONE** — `permitted_effects` are `NONE` and `HANDOFF` only. **Owner** `CONSENT_REGISTER` → the consent register's read capability; the change owner is separate and separately registered. **Fullscreen** REQUIRED (`exact_configuration`, `audit`). **`role_hint`** `region`. **Interactive paths** `change_handoff_intent`. **Text** current decision, when it was recorded, what it permits, what changing it would do, and the single sentence naming the verified surface where it can be changed; order `lead → items → policy → handoff → gap → as_of`; parity `full`.

- **CONSENT.1 — the accept/decline control is not expressible on this kind.** `validateEnvelope` rejects any `CONSENT_STATE` carrying an intent whose `role` is not `handoff` or `escape`, and the kind's `permitted_effects` exclude every effect class that could carry a decision. This is the type rule that replaces reliance on a maintained list of capability names. *Evaluated at:* MINT/VALIDATE and MINT/INTENT.
- **CONSENT.2 — REFUSED AT MINT without an explicit floor.** A `CONSENT_STATE` envelope is refused at mint unless **every** intent it carries declares an explicit verification floor of `SESSION_VERIFIED` or higher, carries a non-null `handoff_capability_ref` (a registry key that is *not* actuated by the handoff), and carries a target of class `s` resolving to a live shell route. *Mechanism:* a kind-level clause in `validateEnvelope`, evaluated before `envelope_seal` is computed. *Evaluated at:* MINT/VALIDATE.

  [NON-NORMATIVE] This clause is what makes the floor and the never-chat-actuated predicates evaluable at all for these intents: a floor that is absent cannot be compared, and a capability that is null cannot be matched against a list. The first edition's defence rested on comparing fields that its own type rules forbade these intents from having.
- **CONSENT.3 — the floor is server-derived, never authored.** `required_verification = max(registry.minVerification(handoff_capability_ref), policy.minVerification(riskTier), SESSION_VERIFIED)`, computed at MINT/INTENT and recomputed at the VERIFICATION FLOOR gate; an emitter-supplied value is a hint and is overwritten. *Evaluated at:* MINT/INTENT and the VERIFICATION FLOOR gate.
- **CONSENT.4 — nothing here is collected.** No intent on this kind may carry an `input_schema`; the body has no writable field. *Evaluated at:* MINT/INTENT and MINT/VALIDATE.
- **CONSENT.5 — no owner, no control.** When the change owner is absent from the registry, `capability_gap_ref` is set and `change_handoff_intent` is null; the text states plainly that the change cannot be made in the product yet. *Evaluated at:* MINT/COMPOSE (K20) and MINT/VALIDATE.
- **CONSENT.6 — content is mode-invariant.** An owner cannot change a client's consent from chat any more than a client can; `presentation_mode` may not add an intent (K18). *Evaluated at:* MINT/COMPOSE and in CI.

---

#### 2.6.19 `IDENTITY_BINDING`

```ts
interface IdentityBindingBody {
  subject_label: Cell<string>;
  bindings: Array<{ binding_id: string;
                    channel: 'telegram' | 'push' | 'email' | 'phone' | 'native' | 'crm';
                    label: Cell<string>;
                    state: Cell<'LINKED' | 'UNLINKED' | 'PENDING' | 'UNKNOWN'>;
                    since: Cell<string>;
                    unlocks_text: LocaleText[];
                    loss_on_unbind_text: LocaleText[];
                    manage_handoff_intent: string | null }>;   // HANDOFF only; target class 's'
  capability_gap_ref: string | null;
}
```

**Ceiling NONE** — `permitted_effects` are `NONE` and `HANDOFF` only. **Owner** `IDENTITY_BINDING_OWNER` → the channel-authenticator and CRM-binding capabilities. **Fullscreen** REQUIRED (`exact_configuration`, `audit`). **`role_hint`** `region`. **Interactive paths** `bindings[].manage_handoff_intent`. **Text** which channels are linked, since when, what each unlocks, what unlinking would cost, then the handoff sentence; order `lead → items → policy → handoff → gap → as_of`; parity `full`.

- **IDENTITY.1–IDENTITY.6** — CONSENT.1 through CONSENT.6 apply verbatim to this kind, with `manage_handoff_intent` in place of `change_handoff_intent`. An `IDENTITY_BINDING` envelope is **REFUSED AT MINT** unless every intent carries an explicit floor of `SESSION_VERIFIED` or higher, a non-null `handoff_capability_ref`, and a class-`s` target. *Evaluated at:* MINT/VALIDATE, MINT/INTENT, and the VERIFICATION FLOOR gate.
- **IDENTITY.7 — this kind is not `SOURCE_STATUS`.** A provider reconnect is an ordinary handoff; an identity unbind is never actuated by the identity of the channel asking. Keeping the two kinds apart also keeps provider health out of the same body as channel-binding state, on which the existing client-preview enforcement points key. *Mechanism:* two kinds, two rule rows, two owner classes. *Evaluated at:* REGISTRY LOAD.

---

#### 2.6.20 `PAYMENT_HANDOFF`

```ts
interface PaymentHandoffBody {
  order_ref: string | null;                // server-owned draft handle; null in gap state
  subject: 'gift_certificate' | 'membership' | 'tips' | 'loyalty_redemption' | 'service_prepayment';
  lines: Array<{ label: LocaleText; amount: Measure }>;
  amount_total: Measure;                   // SERVER-FIXED, unit 'RUB'
  beneficiary_label: Cell<string>;
  acquirer_label: Cell<string>;            // display only — never a target, never a URL
  returns_text: LocaleText;                // what the payer gets back, and where
  policy_notices: LocaleText[];
  session: { session_ref: string; expires_at: string; resume_widget_id: string } | null;
  commit_intent: string | null;            // the ONE COMMIT; null in gap state
  continue_intent: string | null;          // NAVIGATE, target { class: 's', ref: 'pay/<session_ref>' }
  dismiss_intent: string;                  // escape, priority 0
  capability_gap_ref: string | null;       // when set: commit_intent AND continue_intent MUST be null
}
```

**Ceiling** COMMIT. **Owner** `COMMERCE_OWNER` — a **registered** payment/commerce capability. **Fullscreen** REQUIRED (`exact_configuration`, `audit`). **`role_hint`** `region`. **Interactive paths** `commit_intent`, `continue_intent`, `dismiss_intent`. **Text** what is bought, the exact amount as a formatted `Measure`, who takes the payment, what returns afterwards; order `lead → items → totals → policy → options → gap → expiry`; parity `full`.

- **PAY.1 — payment is a canonical capability, not a handoff to a provider.** The path is: a `DRAFT` owned by a registered payment/commerce owner produces this confirmation body → the single `COMMIT` reaches the CANONICAL ACTION gate → the **Action Engine** initiates the provider session, and the Action Engine owns the idempotency key and the receipt. The widget, the renderer, the chat layer and the native shell never call a provider. *Mechanism:* `commit_intent` carries a registry capability, so it is subject to the registry lookup, the AUTHORITY gate and the CANONICAL ACTION gate exactly as any other commit; the provider owner is called by the Action Engine alone. *Evaluated at:* MINT/INTENT, the AUTHORITY gate, the CANONICAL ACTION gate.

  [NON-NORMATIVE] Modelled as `HANDOFF`, this was a button reaching an external payment provider with no capability, no Action Engine, no idempotency key, no receipt and no canonical owner — and it passed every invariant *because* handoff intents are capability-null, which makes the registry check and the no-owner rule both vacuous. The project's documented double-payment incident is the exact failure an idempotency-free provider handoff reproduces.
- **PAY.2 — the redirect is a first-party route, issued after the commit.** `continue_intent` may exist only after a receipt exists; its target is `{ class: 's', ref: 'pay/<session_ref>' }` — a first-party shell route with a `SESSION_VERIFIED` floor that performs the redirect server-side. No body field, no intent target and no receipt field may contain a provider URL, a checkout id, a card token, a bridge method name or a native-scheme URL. *Mechanism:* the body schema contains no URL-typed field; `IntentTarget.ref` is validated against the closed shell-route table; the seven forbidden keys of K8 are refused at any depth. *Evaluated at:* MINT/VALIDATE and on every submission.
- **PAY.3 — the amount is never client-supplied.** `amount_total` and every `lines[].amount` are `Measure`s read from the commerce owner; `commit_intent.input_schema === null` (K12); the amount travels as a frozen noun resolved by a fresh read at the INPUT VALIDATION gate, and a divergence returns `SUPERSEDED` with a rendered diff. *Evaluated at:* MINT/INTENT and the INPUT VALIDATION gate.
- **PAY.4 — until the owners are registered, this kind emits a gap and no button.** `commit_enabled` is derived at REGISTRY LOAD from the presence of a registered payment-class owner; while it is false, every emission carries `capability_gap_ref` (`GAP-COMMERCE-GIFT`, `GAP-LOYALTY-REDEEM`, or the tips gap), a null `commit_intent` and a null `continue_intent`, and states in text that the purchase cannot be completed in the product yet. *Mechanism:* K20's derivation plus a conditional schema clause. *Evaluated at:* REGISTRY LOAD, MINT/COMPOSE and MINT/VALIDATE.
- **PAY.5 — tips are not an exception.** A tip is a payment-class capability like any other and follows PAY.1 through PAY.4. There is no bridge-initiated payment path, and no field in which a bridge method could be named. *Evaluated at:* MINT/VALIDATE (K8).

---

#### 2.6.21 `MEDIA_PREVIEW`

```ts
interface MediaPreviewBody {
  media_ref: string;                       // opaque; resolves only through a signed first-party asset route
  alt: string;                             // server-authored, non-empty
  recipe: { requested: Cell<string>;
            parameters: Array<{ label: LocaleText; value: Cell<string> }>;
            produced_at: Cell<string>;
            producer_label: Cell<string> };
  subject_is_principal: boolean;
  expires_at: string;
  regenerate_intent: string | null;        // REFINE
  fullscreen_intent: string;               // REQUIRED — NAVIGATE
}
```

**Ceiling** REFINE. **Owner** `MEDIA_GENERATION_OWNER` — the generation capability, which must be registered before this kind is emittable. **Fullscreen** REQUIRED (`non_textual_medium`). **`role_hint`** `img`, described by the recipe. **Interactive paths** `regenerate_intent`, `fullscreen_intent`. **Text parity `recipe_only`** — headline = what was requested; itemized = the recipe (request, parameters, when, producer) plus `alt`; order `recipe → items → handoff → unknowns → expiry`.

- **MEDIA.1 — the text equivalent is the recipe, and the contract says so.** The portability test for this kind asserts recipe parity: every recipe field and the `alt` string must be reachable in text. It does **not** assert that the image reduces to prose, because it does not. A channel that cannot render images receives the recipe and a `NAVIGATE` to the fullscreen route; it never receives a claim that the image has been conveyed. *Mechanism:* `text_shape.parity: 'recipe_only'`, asserted as such in CI (K10). *Evaluated at:* CI.
- **MEDIA.2 — a generated image of a client is client-identified.** `pii_ceiling` is `client_identified`; under a client presentation the envelope is refused unless `subject_is_principal` is true; a staff principal never receives another client's generated image in chat. *Evaluated at:* MINT/VALIDATE, behind the same preview/PII enforcement points as every other read path.
- **MEDIA.3 — the media handle is not a URL.** `media_ref` resolves only through a signed first-party asset route bound to the envelope's principal proof; a relink or unlink invalidates it. *Mechanism:* K8's forbidden keys plus the route's principal check. *Evaluated at:* MINT/VALIDATE and at asset fetch.
- **MEDIA.4 — the body is in scope for conversation erasure.** `retention_sec` is 7 days and the body is dropped on historisation; deleting conversation history deletes the preview and its recipe, and touches no canonical record. *Evaluated at:* historisation (K19).

---

#### 2.6.22 `ARTIFACT`

```ts
interface ArtifactBody {
  artifact_ref: string;                    // opaque; resolves only through a signed first-party delivery route
  filename: Cell<string>;
  format: Cell<'pdf' | 'csv' | 'xlsx' | 'json' | 'png'>;
  size_bytes: Measure;                     // unit 'count'
  contains_text: LocaleText;               // what it contains, one sentence
  contains_pii: Cell<boolean>;
  produced_at: Cell<string>;
  expires_at: string;
  fetch_intent: string;                    // NAVIGATE, target { class: 's', ref: 'file/<artifact_ref>' }
  regenerate_intent: string | null;        // REFINE
}
```

**Ceiling** NAVIGATE (`NONE`, `NAVIGATE`, `HANDOFF`). **Owner** `ARTIFACT_OWNER` → `owner_report.download`, `owner_report.status`. **Fullscreen** FORBIDDEN — the file *is* the detail. **`role_hint`** `link`. **Interactive paths** `fetch_intent`, `regenerate_intent`. **Text parity `file_facts_only`** — filename, format, size, what it contains, whether it contains personal data, and when the link expires; order `file_facts → policy → expiry → as_of`.

- **ARTIFACT.1 — delivery is a first-party route, never a client-side download.** `fetch_intent` targets `s/file/<artifact_ref>`; the file is served by a first-party endpoint that re-checks the principal. There is no `<a download>`, no `data:` or `blob:` href, and no bridge call — such deliveries are inert in the viewer sandbox and in the native shells anyway. *Mechanism:* K8's forbidden keys plus the closed shell-route table. *Evaluated at:* MINT/VALIDATE and at fetch.
- **ARTIFACT.2 — the file is minted for one principal.** The delivery route compares the live principal's proof hash against the artefact's; a relink or unlink cycle invalidates it on every device. *Evaluated at:* fetch.
- **ARTIFACT.3 — `contains_pii` is stated before the file is fetched.** It is a `Cell<boolean>`; when it is true the text says so in the `policy` sentence, and `pii_ceiling` applies. *Evaluated at:* MINT/VALIDATE and K9's sentence order.
- **ARTIFACT.4 — an artefact whose producing capability is unregistered is not emitted.** The consent-register export has no registered owner today; a request for it produces a `LIMITATION` carrying `GAP-CONSENT-REGISTER-EXPORT` and no intent (K20, LIMIT.1), and — because that capability is also never chat-actuated — no handoff on this kind either. *Evaluated at:* REGISTRY LOAD and MINT/COMPOSE.

---

### 2.7 Emission readiness — which of the twenty-two may be emitted today

`emittable` is derived at REGISTRY LOAD (K20), not asserted here. Against the capability registry as it stands:

| Status | Kinds |
|---|---|
| **Emittable** (17) | `CHOICE`, `SERVICE_SELECTOR`, `STAFF_SELECTOR`, `TIME_SLOT_SELECTOR`, `BOOKING_CONFIRMATION`, `SCHEDULE`, `CLIENT_LIST`, `METRIC`, `CHART`, `REPORT`, `STRATEGY_OPTIONS`, `APPROVAL`, `PROGRESS`, `LIMITATION`, `SOURCE_STATUS`, `SETTINGS_DRAFT`, `FORM` |
| **Emittable, narrowly** (1) | `ARTIFACT` — owner reports only (`owner_report.download`, `owner_report.status`) |
| **Blocked on capability registration** (4) | `CONSENT_STATE`, `IDENTITY_BINDING`, `PAYMENT_HANDOFF`, `MEDIA_PREVIEW` |

For each blocked kind the correct emission today is a `LIMITATION` carrying the mapped `capability_gap_ref` and **no intent**. The rules those four kinds carry — CONSENT.1–6, IDENTITY.1–7, PAY.1–5, MEDIA.1–4 — are in force in the validator from the day the contract ships, so registration is the only remaining step and cannot be accompanied by a quiet relaxation.

**K23 — a kind's emittability has two independent derivations for handoff kinds.** For `CONSENT_STATE` and `IDENTITY_BINDING`, `emittable` requires a registered **read** owner (to compose the body), and a non-null handoff intent additionally requires a registered **change** owner *and* a resolvable class-`s` route. Either may become true without the other. *Evaluated at:* REGISTRY LOAD and MINT/COMPOSE.

[NON-NORMATIVE] That split matters in practice: the marketing-consent change path can be routed to an owner that already exists and is already append-only, well before any `consent.*` read capability is registered — at which point the product can honour a revocation it currently promises in outbound copy but cannot perform, while the in-chat state display stays a `LIMITATION` until a read owner exists.

---

### 2.8 What this registry does not claim

1. **It restores no capability.** Four kinds are unemittable and one is narrowly emittable because the capabilities behind them are not registered. This section gives them a fail-closed way to say "no owner" and a body waiting for the day there is one. That is not one line of the capability itself.
2. **`MEDIA_PREVIEW` does not satisfy full text parity, and no longer claims to.** Its parity is `recipe_only`, declared in the registry and asserted as such in CI. If the owner of the portability rule judges that insufficient, the honest alternative is that generated media are not widgets at all and live only behind a fullscreen route — a judgement about the contract's first principle, not about this taxonomy.
3. **`SETTINGS_DRAFT` and `FORM` remain two kinds.** They differ in read model — a server-computed diff versus collected values — and `FORM` carries the rationing, the bounds and the secure-surface machinery. The inventory contains no surface that decisively requires both, and if one had to go, `SETTINGS_DRAFT` is a `FORM` whose fields are pre-filled with a diff. This is the registry's weakest seam and is recorded as such rather than defended.
4. **The density caps are registry defaults, not measurements.** They are chosen to force escalation early and may be lowered per tenant, never raised. They are not derived from usage evidence, and the render receipts are the instrument that will say whether they are right.
5. **`CHART.3`'s bijection test, `K9`'s ordering test and `K18`'s mode-invariance test are CI tests over recorded emission fixtures.** They are only as strong as the fixture corpus. That corpus is a deliverable, not an assumption.

---

## 3. Intents, the gateway, and the forbidden edges

This section defines the only interactive surface a widget has, the gateway that
receives it, the ordered gate sequence every interaction passes through, the edges
that cannot be constructed, and the fundamental rules with the mechanism that makes
each one true.

**Reading rule.** Every sentence in this section is normative unless it is prefixed
`[NON-NORMATIVE]`. Every normative rule names (a) the mechanism that enforces it and
(b) the point at which that mechanism is evaluated. Each mechanism carries a status:

- **[EXISTS]** — present in the repository today at the path named. Verified.
- **[TO BUILD]** — required by this contract and shipped by the package that ships the
  IntentGateway. Nothing in this cycle builds it (§0: 0 runtime changes).

A rule whose mechanism is **[TO BUILD]** is a requirement on that package, not a claim
about today's system. A guarantee with no mechanism in either state does not appear in
this section; where the first edition stated one, it has been deleted rather than
weakened.

---

### 3.1 `WidgetIntent` — the complete shape

```ts
interface WidgetIntent {
  // --- identity ---
  intent_ref: string;                 // envelope-local, e.g. 'i1'. The only value
                                      // Cell.next_intent_ref may hold. Not a token.
  intent_token: string | null;        // OPAQUE, server-minted, principal-bound, expiring,
                                      // ≤34 bytes. NULL IFF effect === 'NONE' (§3.2).

  // --- presentation ---
  role: 'primary' | 'secondary' | 'destructive' | 'escape'
      | 'more' | 'handoff' | 'remedy' | 'control';
  label: string;                      // server-minted; never client-composed
  utterance_preview: string;          // ≤240 chars. The sentence this tap is equivalent to,
                                      // rendered server-side with the intent's DEFAULT
                                      // selection. It is a PREVIEW: the sentence actually
                                      // written to the conversation is re-rendered at
                                      // Gate 9 from validated canonical labels (§3.9).
  speech_aliases: string[];           // ≥1; deterministic voice matching BEFORE any LLM
  ordinal: number | null;             // spoken "первое", push action index, keyboard order
  priority: number;                   // 0 = NEVER droppable by degradation

  // --- effect ---
  effect: EffectClass;                // §3.2, closed
  capability: string | null;          // registry key; non-null iff effect ∈
                                      // {REFINE, CONTROL, DRAFT, REQUEST_APPROVAL, COMMIT}
  handoff_capability_ref: string | null;  // registry key; NON-NULL IFF effect === 'HANDOFF'.
                                      // Names the act the user is being carried toward.
                                      // It is never invoked (§3.3, Gate 13).
  target: IntentTarget | null;        // §3.3; non-null iff effect ∈ {NAVIGATE, HANDOFF}
  input_schema: InputSchema | null;   // §3.6; null = no client-supplied input at all

  // --- authority ---
  verification_floor: VerificationLevel;      // REQUIRED on EVERY intent of EVERY effect
                                              // class. Never null. Never authored by the
                                              // emitter: derived by §3.4.
  confirmation: ConfirmationRequirement | null;  // non-null iff effect ∈
                                              // {REQUEST_APPROVAL, COMMIT}
  authority_hint: AuthorityHint;              // RENDERING HINT ONLY. Never read by any
                                              // server decision (§3.14, FR-3).

  // --- state ---
  enabled: Cell<boolean>;             // a disabled intent still carries a real floor
  expires_at: string;                 // RFC3339; ≤ envelope expires_at
  single_use: boolean;
}
```

**R3.1.1 — `intent_token` is null exactly for `NONE`.** *Mechanism:* closed-shape validator
over the emitted envelope, plus the submission schema, which requires a non-null
`intent_token` (§3.8). *Evaluated at:* envelope emission (validator) and gateway ingress
(schema). *Status:* [TO BUILD]. *Consequence:* an intent with `effect: 'NONE'` has nothing
to send, so "NONE is purely local" is true by absence rather than by convention — this is
the correction to the first edition's cancel defect (§3.2, CONTROL).

**R3.1.2 — every field above is server-minted.** No renderer composes, edits or
substitutes any of them, and no field is echoed back. *Mechanism:* the submission shape
(§3.8) has no member able to carry an intent field; `body_hash` covers `intents` stripped
of `intent_token`, so a modified label or utterance fails seal verification at render.
*Evaluated at:* renderer seal check, and gateway ingress (unknown keys are rejected
structurally by INV-1). *Status:* [TO BUILD].

**R3.1.3 — `authority_hint` is not an input to any decision.** *Mechanism:* the
AuthorityResolver's input type does not include the envelope; a CI import/reference test
asserts that no module under the authority, policy or action path reads
`authority_hint`. *Evaluated at:* CI, per build. *Status:* [TO BUILD].
[NON-NORMATIVE] A hint that disagrees with the server's derivation causes the widget to be
re-issued. The server's derivation never bends to the hint.

---

### 3.2 `EffectClass` — eight members, and exactly what each may do

```ts
type EffectClass =
  | 'NONE'              // no gateway submission exists at all
  | 'NAVIGATE'          // resolve a typed target; no business effect
  | 'REFINE'            // narrow or re-query a read model; emits a NEW envelope
  | 'CONTROL'           // a SERVER state change that is not a business effect
  | 'DRAFT'             // create/modify a SERVER-OWNED draft
  | 'REQUEST_APPROVAL'  // move an approval object to PENDING
  | 'COMMIT'            // the ONLY class that may cause a business or external effect
  | 'HANDOFF';          // carry the user to a surface that may act
// There is no 'MUTATE' and no 'EXECUTE'.
```

| effect | `intent_token` | `capability` | `handoff_capability_ref` | `target` | `confirmation` | may reach the Action Engine | may write a canonical business row |
|---|---|---|---|---|---|---|---|
| `NONE` | **null** | null | null | null | null | no | no |
| `NAVIGATE` | required | null | null | **required** | null | no | no |
| `REFINE` | required | **required** | null | null | null | no | no |
| `CONTROL` | required | **required** | null | null | null | **no** | **no** |
| `DRAFT` | required | **required** | null | null | null | no | draft store only |
| `REQUEST_APPROVAL` | required | **required** | null | null | **required** | approval object only | no |
| `COMMIT` | required | **required** | null | null | **required** | **yes** | **via the canonical owner only** |
| `HANDOFF` | required | null | **required** | **required** | null | no | no |

**R3.2.1 — the table is a closed shape, not a convention.** *Mechanism:* a discriminated
union on `effect` in the envelope validator; an intent that sets a cell the table marks
`null` is structurally unrepresentable and the emission is refused.
*Evaluated at:* envelope emission, and again at mint of the `IntentRecord` (the same
validator runs over the record). *Status:* [TO BUILD]. This replaces first-edition INV-6,
which asserted the weaker biconditional `effect ∈ {NONE, NAVIGATE, HANDOFF} ⟺ capability
=== null` and thereby made HANDOFF's subject capability unrepresentable.

**R3.2.2 — `NONE` may not appear on a channel that cannot act locally.** A `NONE` intent is
legal only on a profile whose `interaction_model === 'RICH'`. On every other profile the
degradation ladder either drops it or replaces it with the equivalent `CONTROL` intent.
*Mechanism:* degradation ladder, server-side, before delivery; `RenderReceipt.applied_rules`
records which. *Evaluated at:* delivery. *Status:* [TO BUILD].
[NON-NORMATIVE] Dismissing a Telegram card requires `edit_message_text` — a server call.
Calling that "local" is how the first edition classified a run-terminating cancel as `NONE`.

**R3.2.3 — `CONTROL` is a registered capability under the authority gate.** A `CONTROL`
intent carries a non-null `capability` drawn from the **control registry**, a closed,
versioned, server-side table owned by the widget layer. Every `CONTROL` submission passes
Gate 6 (authority computed from scratch) exactly as a `DRAFT` does.
*Mechanism:* the effect router's `CONTROL` branch dispatches only through the control
registry; the registry is a frozen constant and the router has no default case.
*Evaluated at:* Gate 13. *Status:* [TO BUILD].

The control registry is closed at three keys:

| control key | owner endpoint | what it changes | status |
|---|---|---|---|
| `control.run.cancel` | `POST /api/orchestration/runs/:id/cancel` | terminates an unstarted coordination run | [EXISTS] — `c9.store.ts#cancel`, write-once under `cancelKeyHash`, principal- and tenant-locked, refuses `cancel_races_dispatched_work` and `run_expired_or_terminal` |
| `control.widget.dismiss` | widget layer | sets `Lifecycle.resolution.state` on one emission | [TO BUILD] |
| `control.delivery.resolve` | widget layer | resolves one `dedupe_key` across channels | [TO BUILD] |

**R3.2.4 — `CONTROL` may never reach the Action Engine and may never write a canonical
business row.** *Mechanism:* the effect router has no `CONTROL → ActionEngine` edge, and a
CI test asserts that every control-registry entry's handler module imports no Prisma model
other than the widget layer's own. *Evaluated at:* Gate 13 (routing) and CI. *Status:*
[TO BUILD].

**R3.2.5 — no effect above `NAVIGATE`/`REFINE`/`HANDOFF` may appear on a proactive
envelope.** *Mechanism:* emission validator keyed on `origin.trigger === 'proactive'`.
*Evaluated at:* emission. *Status:* [TO BUILD]. [NON-NORMATIVE] This is the C10 leak fence;
it is stated here because the effect classes are defined here.

**R3.2.6 — a notification preference is not a `CONTROL`.** Per-moment delivery preference,
per-channel routing and quiet hours are communication-consent decisions. They are `DRAFT`
then `COMMIT` on the `shell.notifications` destination, and their subject capabilities
carry a floor of `SESSION_VERIFIED` (§3.4). *Mechanism:* the control registry does not
contain a notification-preference key (three keys, R3.2.3), and the widget capability
policy table classifies every notification-preference key at `SESSION_VERIFIED`.
*Evaluated at:* mint (the floor) and Gate 13 (the routing). *Status:* [TO BUILD].

**R3.2.7 — `COMMIT` lives only on a confirmation body, and never on the body that accepted
the input.** A `COMMIT` intent may be minted only onto an envelope whose body is a
**confirmation body produced by a server-owned draft**, and **no envelope carrying an
`InputSchema` with a field of a non-closed kind may carry a `COMMIT` intent at all**. A
free-input submission is therefore always a `DRAFT`: it produces a server-owned draft, the
draft is re-rendered as a confirmation body, and only that body carries the commit.
*Mechanism:* the mint function refuses a `COMMIT` whose `IntentRecord.confirmation_of_draft_ref`
is null, and the emission validator refuses an envelope that carries both a non-closed
`InputField` and a `COMMIT`. *Evaluated at:* mint and emission. *Status:* [TO BUILD].
[NON-NORMATIVE] This is the general form of the booking two-phase (§3.10). The first edition
applied the non-existence argument to bookings only, so the one kind that accepts
client-authored magnitudes — a loyalty adjustment, an expense amount — could deliver that
magnitude into the Action Engine as a "resolved argument" in a single tap, and the claim
"a widget cannot express a direct business mutation" was false for the largest mutation
surface the contract defined. Generalising the rule and bounding every non-enum field
(R3.6.4) makes the claim true for every kind rather than for one.

---

### 3.3 `IntentTarget` — `NAVIGATE` and `HANDOFF` are typed

The first edition named no field anywhere for a `NAVIGATE` or `HANDOFF` destination, so a
capability-null intent could carry any link — including a capability-invoking one — past
every capability check. The destination is now a required, closed shape.

```ts
type IntentTarget =
  | { class: 'w';      ref: string }                       // widget_id — re-resolve an emission
  | { class: 'i';      ref: string }                       // intent_token — a carrier
  | { class: 'c';      ref: string; scope_ref: string | null }  // C9 registry capability key
  | { class: 's';      ref: ShellRoute }                   // one of five shell destinations
  | { class: 'detail'; ref: DetailRouteKey };              // the emitting envelope's own detail

type ShellRoute =
  | 'shell.root' | 'shell.account' | 'shell.connections'
  | 'shell.privacy' | 'shell.notifications';

type DetailRouteKey = string;   // must equal presentation.fullscreen_detail.route_key
                                // of the SAME envelope (R3.3.4)
```

**R3.3.1 — no intent may carry a free-form URL, an origin, a host, a path or a query
string.** *Mechanism:* `IntentTarget` has no member able to hold one (closed shape); every
minted text field on an intent (`label`, `utterance_preview`, `speech_aliases`) is passed
through `c9SafeText`, which denies `use_secure_surface` on URL-shaped and credential-shaped
content. *Evaluated at:* emission (shape) and mint (text). *Status:* shape [TO BUILD];
`c9SafeText` [EXISTS] — `orchestration/c9.contract.ts:325`.
*Consequence:* `BUTTON → EXTERNAL PROVIDER` is not constructible as a target. A payment is
therefore not modelled as a handoff to a provider; it is a capability
(`DRAFT → confirmation → COMMIT → Action Engine`), and the Action Engine alone opens the
provider session and owns the idempotency key and the receipt. Until the gift-certificate
and tips owners are registered, the surface carries a `Limitation` with a
`capability_gap_ref` and **no intent** (P2).

**R3.3.2 — a `c`-class target is a capability invocation and is checked as one.** When
`target.class === 'c'`, `target.ref` MUST be a key present in the C9 capability registry
**and within the authority the emitting principal holds at emission time**, and the
submission is subject to Gate 6 (authority computed from scratch) and to INV-10 exactly as
if the key were in `capability`. `subject_capability` (§3.5) resolves to `target.ref`.
*Mechanism:* two checks at emission — registry lookup (`c9Capability(key, domain)` denies
`capability_not_registered`) and `AiToolPolicyService.assertCanExecute` over the emitting
principal — and the AuthorityResolver again at Gate 6 over the same key.
*Evaluated at:* emission (both) and Gate 6. *Status:* registry lookup [EXISTS] —
`orchestration/c9.registry.ts:179`; policy service [EXISTS] — `ai-tool-policy.service.ts`;
gateway wiring [TO BUILD].
[NON-NORMATIVE] Without this rule a capability-null `NAVIGATE` could carry a `c/` link and
invoke a capability that INV-6, INV-10 and Gate 6 all believed did not exist for that
intent, because the contract had validated `capability === null` and stopped looking.

**R3.3.3 — a consent-bearing or identity-binding handoff may use `s` only.** If
`subject_capability(i) ∈ NEVER_CHAT_ACTUATED` (§3.5) then `i.effect === 'HANDOFF'` and
`i.target.class === 's'`. *Mechanism:* emission validator. *Evaluated at:* emission.
*Status:* [TO BUILD]. [NON-NORMATIVE] `s` is the only class with a stated
`SESSION_VERIFIED` floor and the only class that is a destination rather than a
re-resolution, which is why the 152-FZ acts land there and nowhere else.

**R3.3.4 — a `detail` target is not addressable and not chainable.** `target.ref` MUST
equal `presentation.fullscreen_detail.route_key` of the envelope carrying the intent; there
is no URL form of the `detail` class; and an envelope rendered *inside* a detail may not
carry a `detail` target. *Mechanism:* emission validator (equality check and a
`rendered_in_detail` flag on the mint request). *Evaluated at:* emission. *Status:*
[TO BUILD]. *Consequence:* "no bookmarkable screen address" and "depth capped at one" are
enforced by the shape rather than by renderer discipline.

**R3.3.5 — an `i`-class carrier never fires on open.** Resolving an `i` target renders the
confirmation body for that token inside the landing surface; it never submits it.
*Mechanism:* the carrier resolver's only output is `next_envelope`; it holds no edge to the
effect router. *Evaluated at:* carrier resolution, before Gate 9. *Status:* [TO BUILD].

**R3.3.6 — the resolved class is recorded.** `RenderReceipt` gains
`target_classes: Array<'w'|'i'|'c'|'s'|'detail'>`, one entry per delivered intent carrying
a target. *Mechanism:* written by the delivery adapter with the rest of the receipt.
*Evaluated at:* delivery. *Status:* [TO BUILD].

---

### 3.4 The verification floor is derived, never authored

`verification_floor` is present on **every** intent of **every** effect class, is never
null, and is never supplied by the emitter.

```ts
const LEVEL_ORDER = ['ANONYMOUS', 'CHANNEL_IDENTITY', 'BOUND_CLIENT',
                     'SESSION_VERIFIED', 'STEP_UP_VERIFIED'] as const;

function verificationFloor(i: WidgetIntent, kind: WidgetKind): VerificationLevel {
  return maxLevel(
    EFFECT_FLOOR[i.effect],                 // closed constant table, below
    KIND_FLOOR[kind],                       // closed constant table, per §2
    subjectFloor(subjectCapability(i)),     // registry + policy, below
    targetFloor(i.target),                  // 's' ⇒ that destination's declared floor
  );
}

function subjectFloor(key: string | null): VerificationLevel {
  if (key === null) return 'ANONYMOUS';
  return maxLevel(
    WIDGET_CAPABILITY_POLICY[key].min_verification,   // widget-layer table, closed, versioned
    RISK_FLOOR[aiToolRegistry.get(key).riskTier],     // from the LIVE tool definition
  );
}
```

| `EFFECT_FLOOR` | | | `RISK_FLOOR` (from `AiToolDefinition.riskTier`) | |
|---|---|---|---|---|
| `NONE` | `ANONYMOUS` | | `read` | `ANONYMOUS` |
| `NAVIGATE` | `ANONYMOUS` | | `low_write` | `BOUND_CLIENT` |
| `REFINE` | `ANONYMOUS` | | `medium_write` | `SESSION_VERIFIED` |
| `HANDOFF` | `ANONYMOUS` | | `high_write` | `SESSION_VERIFIED` |
| `CONTROL` | `BOUND_CLIENT` | | `restricted` | `STEP_UP_VERIFIED` |
| `DRAFT` | `BOUND_CLIENT` | | | |
| `REQUEST_APPROVAL` | `SESSION_VERIFIED` | | | |
| `COMMIT` | `SESSION_VERIFIED` | | | |

**R3.4.1 — there is no emitter-supplied floor.** `mintIntent()` takes no
`verification_floor` parameter; the field is computed by the function above from the
intent's subject capability, its effect, its kind and its target. *Mechanism:* the mint
function's signature (the field cannot be passed), plus a CI test asserting no assignment
to `verification_floor` outside `verificationFloor()`. *Evaluated at:* mint, and CI.
*Status:* [TO BUILD]. This is the correction to the first edition, in which
`required_verification` was written by whichever composer minted the intent and Gate 4
then validated the session against a number the mint path had chosen.

**R3.4.2 — the floor is re-derived at the gateway and the stored value may only be
raised.** At Gate 5 the gateway recomputes `verificationFloor()` from the **live** registry
and policy tables. If the recomputed floor exceeds the floor stored in the `IntentRecord`,
the submission is refused `REFUSED / policy_floor_raised` and a fresh envelope is emitted.
*Mechanism:* pure function re-evaluation against `AiToolRegistryService` and the widget
capability policy table. *Evaluated at:* Gate 5. *Status:* [TO BUILD].
[NON-NORMATIVE] This is what makes a tightened policy take effect on tokens already in
flight, including tokens sitting in a Telegram message from an hour ago.

**R3.4.3 — every consent-bearing capability carries at least `SESSION_VERIFIED`.** The
widget capability policy table assigns `min_verification: 'SESSION_VERIFIED'` or above to
every key that grants, withdraws, revokes or restores a consent, that binds or unbinds a
channel identity, that exports a consent register, that erases conversation history, and to
every per-moment notification-delivery preference key. *Mechanism:* the table is a frozen
constant with a CI test asserting the eight `NEVER_CHAT_ACTUATED` keys and every
notification-preference key are present at `SESSION_VERIFIED` or higher.
*Evaluated at:* CI, and at every `subjectFloor()` call. *Status:* [TO BUILD].

**R3.4.4 — how a shortfall behaves depends on the effect class, and is never an error.**
At Gate 5, with `v = authority.verification_level` (server-derived; §3 of this contract's
authority section) and `f = verification_floor`:

| effect | `v ≥ f` | `v < f` |
|---|---|---|
| `NONE` | — (no submission exists) | — |
| `NAVIGATE`, `REFINE` | proceeds | `HANDOFF_REQUIRED` + step-up path landing on the same target |
| `HANDOFF` | resolves to the target | `HANDOFF_REQUIRED` + step-up path landing on the target **after** verification |
| `CONTROL`, `DRAFT`, `REQUEST_APPROVAL`, `COMMIT` | proceeds | `NEEDS_SECOND_CHANNEL` — **refused**, with the deep link |

*Mechanism:* Gate 5 branch on `effect`. *Evaluated at:* Gate 5. *Status:* [TO BUILD].
[NON-NORMATIVE] A handoff must stay tappable from a low-verification channel — that is what
it is for. What must be impossible is the *act*, and the row above is the difference: the
four actuating classes are refused below their floor; the pointer classes route to
verification first. Neither renders as a failure (M1).

**R3.4.5 — a channel cannot raise the floor's other side.** `verification_level` is derived
from the session and never appears in a channel profile or a client header;
`profile.max_verification_level` is a server-side **ceiling** that can only lower the
effective level. *Mechanism:* `ChannelProfile` has no `verification_level` member and the
negotiation header may only narrow a registered profile. *Evaluated at:* profile
negotiation and Gate 5. *Status:* [TO BUILD].

---

### 3.5 `NEVER_CHAT_ACTUATED` — now an evaluable predicate

```ts
const NEVER_CHAT_ACTUATED = [
  'consent.pd.grant', 'consent.pd.withdraw',
  'consent.marketing.grant', 'consent.marketing.revoke',
  'identity.staff.telegram.unbind', 'identity.client.channel.unbind',
  'consent.register.export', 'conversation.history.erase',
] as const;

function subjectCapability(i: WidgetIntent): string | null {
  if (i.capability !== null) return i.capability;                 // REFINE/CONTROL/DRAFT/
                                                                  // REQUEST_APPROVAL/COMMIT
  if (i.handoff_capability_ref !== null) return i.handoff_capability_ref;   // HANDOFF
  if (i.target?.class === 'c') return i.target.ref;                // capability NAVIGATE
  return null;                                                     // NONE, and w/i/s/detail
                                                                   // NAVIGATE
}
```

**R3.5.1 — INV-8 (replacement).** For every minted intent:

> `subjectCapability(i) ∈ NEVER_CHAT_ACTUATED  ⟹  i.effect === 'HANDOFF' ∧ i.target.class === 's' ∧ i.verification_floor ≥ 'SESSION_VERIFIED'`

*Mechanism:* emission validator over the fully-typed intent; the predicate is total because
`subjectCapability` is non-null for every effect class that can actuate (all five require
`capability`), non-null for `HANDOFF` (R3.2.1 requires `handoff_capability_ref`), and
non-null for a capability-class `NAVIGATE`. The residual null cases are `NONE` (no token, no
submission) and `NAVIGATE` to `w`/`i`/`s`/`detail`, none of which has an edge to a
capability at Gate 13. *Evaluated at:* emission, and again at mint of the `IntentRecord`.
*Status:* [TO BUILD].

[NON-NORMATIVE] This is the repair of the most severe first-edition defect. There, a
HANDOFF was required to carry `capability === null` and `requires === null`, so both the
floor comparison and the list membership test were unevaluable for precisely the eight
capabilities they existed to protect — the claim "a channel-identity tap physically cannot
actuate a 152-FZ decision" was false as specified. Two fields make both predicates total:
a mandatory non-null `handoff_capability_ref`, which is a registry key that is referenced
and never invoked, and a mandatory `verification_floor` on every effect class.

**R3.5.2 — the list is a backstop, not the mechanism.** The primary fence is
R3.4.3 + R3.4.4: these keys carry `SESSION_VERIFIED`+ in the policy table, so an actuating
intent for one of them is refused at Gate 5 on any channel that cannot establish a
first-party session — whether or not the list is current. *Mechanism:* the derived floor.
*Evaluated at:* mint (derivation) and Gate 5 (re-derivation). *Status:* [TO BUILD].

**R3.5.3 — `handoff_capability_ref` is referenced, never invoked.** Gate 13 routes
`HANDOFF` to a signed target and has no edge to a capability invoker; the field is read
only by R3.5.1, R3.4 and the help generator. *Mechanism:* effect router, closed switch.
*Evaluated at:* Gate 13. *Status:* [TO BUILD].

**R3.5.4 — a handoff whose target has no live surface is not emitted.** If the `s`
destination has not shipped the capability, or the capability has no registered canonical
owner, the envelope carries a `Limitation` with a `capability_gap_ref` and **no intent**.
*Mechanism:* emission validator resolves `target.ref` against the shipped shell-route table
and `subjectCapability` against the registry. *Evaluated at:* emission. *Status:*
[TO BUILD]. [NON-NORMATIVE] Six of the eight keys above have no canonical owner today; this
is the rule that stops the contract reproducing the `/unsubscribe` defect in a new place.

---

### 3.6 `ConfirmationRequirement` and `InputSchema`

```ts
interface ConfirmationRequirement {          // non-null iff effect ∈ {REQUEST_APPROVAL, COMMIT}
  risk_tier: 'read' | 'low_write' | 'medium_write' | 'high_write' | 'restricted';
  reversible: Cell<boolean>;                 // SOURCE-DEFINED. Non-KNOWN is normal.
  audience_size: Measure | null;             // REQUIRED for any communication capability
  requires_explicit_confirm_step: true;      // literal, single value (R3.6.2)
  requires_readback: boolean;                // speech profiles: server text read back first
  idempotency_key: string;                   // MINTED SERVER-SIDE
  approval_policy: 'none' | 'actor' | 'owner';   // copied from the tool definition
  consent_scope?: string;
}
```

**R3.6.1 — `reversible` is a `Cell`, not a boolean, and no rule may depend on its
`value` alone.** The only canonical value upstream is the literal `'SOURCE_DEFINED'`
(`c9.contract.ts:376`), meaning the source owner decides and the orchestrator does not know.
Any rule reading reversibility MUST require `state === 'KNOWN'` and MUST have a defined
behaviour when it is not. *Mechanism:* the type; plus the deletion of the one rule that
depended on a bare `true` (§3.12, R3.12.1). *Evaluated at:* emission. *Status:* type
[TO BUILD]; upstream literal [EXISTS].

**R3.6.2 — `four_eyes` does not exist.** It is deleted from this contract. *Mechanism:*
absence. *Rationale (verified):* `ai-tool-policy.service.ts#canDecide` resolves
`approvalPolicy === 'actor'` to "the requester **is** the decider" and `'owner'` to "any
member of `OWNER_ROLES`, the initiator included". No separation-of-duties control exists
anywhere in the repository, and a widget rendering `four_eyes: true` would promise one.
Where separation of duties is genuinely required, the capability carries a second
`capability_gap_ref` and no intent. *Status:* [EXISTS] — the verified absence is the reason
for the deletion.

**R3.6.3 — `requires_explicit_confirm_step` has one legal value.** A `COMMIT` token exists
only on a confirmation body produced by a server-owned draft (R3.2.7, and R3.10.2 for the
booking family), so the flag has no false branch.
*Mechanism:* literal type. *Evaluated at:* emission. *Status:* [TO BUILD].

```ts
interface InputSchema {
  fields: InputField[];
  max_total_bytes: number;          // hard cap; oversize submissions are REFUSED, never truncated
  free_input_justification: FormJustification | null;  // REQUIRED iff any field is non-closed
}

type InputField =
  | { name: string; required: boolean; kind: 'enum' | 'ref';
      domain_ref: string;                  // server-declared CLOSED set; the client may echo
      selection_min: number; selection_max: number }
  | { name: string; required: boolean; kind: 'integer' | 'decimal';
      bounds: { min: number; max: number; step: number | null;
                unit_ref: string; bounds_source: string } }
  | { name: string; required: boolean; kind: 'date' | 'time' | 'datetime';
      window: { earliest: string; latest: string; granularity_s: number;
                calendar_ref: string; bounds_source: string } }
  | { name: string; required: boolean; kind: 'text';
      max_len: number; normalizer_ref: string }
  | { name: string; required: boolean; kind: 'phone';
      normalizer_ref: 'canonical_msisdn' }
  | { name: string; required: boolean; kind: 'boolean' };
```

**R3.6.4 — every non-closed field declares a server-sourced bound.** `bounds_source` is a
registry key naming the canonical owner that produced the bound; the bound is **re-read from
that owner at Gate 8** and the submitted value is validated against the fresh bound, not
against a pattern and not against the bound that was current at emission. A field of kind
`integer`, `decimal`, `date`, `time` or `datetime` without `bounds`/`window` is
structurally unrepresentable. *Mechanism:* closed shape + Gate 8 re-read.
*Evaluated at:* emission (shape) and Gate 8 (value). *Status:* [TO BUILD].
[NON-NORMATIVE] The canonical bounds exist: `MAX_EXPENSE_RUBLES = 10_000_000` with
`expense-category.ts:257` rejecting `value <= 0 || value > MAX_EXPENSE_RUBLES` is exactly
what `bounds_source` points at for an expense amount.

**R3.6.5 — `SECURE_SURFACE_ONLY` is not a sensitivity, it is an impossibility.** No
`InputField` may declare a sensitivity class at all; a value that must never traverse a chat
surface has no field to travel in. What remains is content policing: every `text` and
`phone` value is passed through `c9SafeText` at Gate 8, which denies `use_secure_surface` on
e-mail addresses, long digit runs, `Bearer `, `sk-`, PEM headers and
`password|secret|token|api_key` assignments. *Mechanism:* absence of the field class, plus
`c9SafeText`. *Evaluated at:* emission (absence) and Gate 8 (content). *Status:* absence
[TO BUILD]; `c9SafeText` [EXISTS] — `orchestration/c9.contract.ts:325`.

**R3.6.6 — free input is rationed by field, not by kind.** `free_input_justification` is
required on **any** `InputSchema` containing a field of kind `integer`, `decimal`, `date`,
`time`, `datetime`, `text` or `phone`, regardless of the envelope's kind, and every such
emission is counted per tenant per week against the same budget. No body may carry a free-text
affordance outside an `InputSchema` — free prose is a chat message, not a widget field.
*Mechanism:* emission validator (justification presence, and rejection of any body-level
free-text flag), plus the emission counter keyed on field kind. *Evaluated at:* emission.
*Status:* [TO BUILD]. [NON-NORMATIVE] The first edition named `FORM` as "the only kind
accepting free-form input" while `CHOICE` carried `allow_free_text` and any kind could carry
a `string` field, so the one metric offered for the acknowledged leak under-counted it by
construction.

---

### 3.7 `IntentRecord` — what the gateway stores, and what erasure removes

```ts
interface IntentRecord {
  // --- authority and audit: RETAINED through conversation erasure ---
  intent_token_hash: string;
  widget_id: string; tenant_id: string; principal_proof_hash: string;
  effect: EffectClass;
  capability: string | null;
  handoff_capability_ref: string | null;
  target: IntentTarget | null;
  verification_floor: VerificationLevel;
  confirmation: ConfirmationRequirement | null;
  input_schema_hash: string | null;
  requested_scope_hash: string;
  run_ref: { run_id: string; revision_id: string | null } | null;
  approval_of_intent_ref: string | null;      // §3.11
  confirmation_of_draft_ref: string | null;   // §3.10 — non-null iff effect === 'COMMIT'
  issued_at: string; expires_at: string; single_use: boolean; consumed_at: string | null;
  action_receipt_ref: string | null;

  // --- conversation content: ERASED with conversation history ---
  frozen_nouns: Record<string, string>;       // handles: WHAT, never how much or when
  utterance_template: string;                 // '{{selection}}' is the only slot
  rendered_utterance: string | null;          // what was written to the transcript
  selected_labels: string[] | null;           // canonical labels, server-resolved
  spoken_transcript: string | null;           // voice turns only; authority NONE
}
```

**R3.7.1 — the retention split is normative and is part of the definition of done for
history erasure.** Erasing conversation history erases every field in the second block
(tombstoning the record, not deleting it) and touches no field in the first.
*Mechanism:* a field-level retention classifier on the record plus a CI test asserting every
field is classified exactly once. *Evaluated at:* erasure execution, and CI. *Status:*
[TO BUILD]. [NON-NORMATIVE] The first edition presented "erasure never touches
`IntentRecord`s" as a safety guarantee while the record held the sentence the user is
treated as having said and the full transcript of voice turns — a stated 152-FZ capability
the system would not have kept.

**R3.7.2 — frozen nouns never travel to the client.** They are handles naming *what*
(`{ staff: 'h_…', service_set: 'h_…', start: 'h_…' }`), never a value.
*Mechanism:* the submission shape (§3.8) has no member to carry them. *Evaluated at:*
gateway ingress. *Status:* [TO BUILD].

**R3.7.3 — three hashes are witnesses, not handles.** `snapshotHash`, `revisionId` and
`payloadHash`, where present, are **compared** at Gate 11, never re-read. Re-resolving them
would destroy the anti-drift guarantee they exist for; divergence yields `SUPERSEDED` with a
rendered diff. *Mechanism:* the noun resolver's type distinguishes `Handle` from `Witness`
and has no re-read path for the latter. *Evaluated at:* Gate 11. *Status:* [TO BUILD].

---

### 3.8 The submission, and what it can actually contain

```ts
interface WidgetIntentSubmission {          // "maya.widget.intent.submission/1"
  contract: 'maya.widget.intent.submission/1';
  widget_id: string;
  intent_token: string;                     // REQUIRED, non-null
  inputs: Record<string, string | number | boolean | string[]> | null;
  client_nonce: string;
  profile_id: string;                       // ADVISORY (R3.8.3)
  spoken_transcript?: string;               // voice only, for audit; authority NONE
  client_emitted_at?: string;               // advisory; never business time
}
```

**R3.8.1 — the submission guarantee, stated as what is enforced.**

> A submission carries an opaque token the client did not author, plus values that are
> either **members of a server-declared closed domain** (`enum`, `ref`) or **scalars inside
> server-declared bounds re-read from the canonical owner at Gate 8** (`integer`, `decimal`,
> `date`, `time`, `datetime`), or **text and phone values normalized by a named server
> normalizer and screened by `c9SafeText`**. It carries no capability name, no URL, no
> endpoint, no table, no provider, no tenant, no role and no body.

*Mechanism:* the closed shape above (which has no member for any of the named things) plus
the Gate 8 validation in R3.6.4 / R3.6.5. *Evaluated at:* gateway ingress (shape) and
Gate 8 (values). *Status:* [TO BUILD].

[NON-NORMATIVE] The first edition claimed a submission "cannot contain a date, a price, a
record id" while its own `InputSchema` accepted `date`, `time`, `integer`, `string` and
`phone` with only length and pattern caps. The guarantee above is smaller and true: a date
*can* be submitted — inside a window the canonical owner declared and re-declared at
validation time. An implementer reading this sentence will add the bound, which is the
behaviour the false version suppressed.

**R3.8.2 — no forbidden key at any depth.** No key named `arguments`, `payload`, `state`,
`role`, `permissions`, `token`, `tenant_id`, `client_id`, `staff_id`, `record_id`,
`is_staff`, `is_owner`, `__meRole`, `__meIsStaff`, `__meIsFounder` may appear at any depth
of a submission. *Mechanism:* structural validator (INV-1). *Evaluated at:* gateway ingress.
*Status:* [TO BUILD].

**R3.8.3 — `profile_id` is advisory and is not an authority input.** It is used to shape the
response and to detect a renderer that delivered something it should not have. The binding
control on what a channel may do is the server-derived `verification_level` (§3.4), not the
profile the client names. *Mechanism:* the Gate 5 branch reads `verification_level`, never
`profile_id`. *Evaluated at:* Gate 5. *Status:* [TO BUILD].

**R3.8.4 — a renderer never mutates a widget locally on click.** It submits, receives
`next_envelope` / `resolved_widget`, and re-renders. `resolved_state` derives from the
receipt, never from the fact that a button was pressed. An optimistic *spinner* is
`ephemeral_ui` and is never transmitted. *Mechanism:* the submission has no `body` and no
state member; the envelope is the only source of rendered state. *Evaluated at:* ingress.
*Status:* [TO BUILD].

---

### 3.9 The gate sequence — fourteen gates, one order

**Step 0 — carrier decode.** All channels converge on one token. PWA / native shell / Mini
App: the token from the rendered model. Telegram: `callback_query.data` **is** the token.
Web push: `event.action` **is** the token. Voice: audio → transcription → deterministic
match on `speech_aliases` ∪ `ordinal` **before any LLM** → the same token, transcript stored
with authority NONE. SMS / e-mail: an `i`-class carrier link, which renders the confirmation
and never fires (R3.3.5). A slash command or a typed sentence hits the deterministic router
and resolves to the **same** token. *Status:* [TO BUILD].

| # | Gate | What it checks | Rejects with | Runs in | Status |
|---|---|---|---|---|---|
| 1 | **Token integrity** | HMAC valid; `widget_id` matches; not expired; not consumed when `single_use`; not superseded | `EXPIRED` / `SUPERSEDED` + fresh `next_envelope` | IntentGateway | [TO BUILD] |
| 2 | **Transport auth** | session resolved exactly as for a typed message — JWT + Membership, or a verified `ClientChannelLink`. **No credential comes from the widget** | `REFUSED / unauthenticated` | HTTP middleware | [EXISTS] |
| 3 | **Principal binding** | `IntentRecord.principal_proof_hash` equals the live principal's proof hash. A token minted for A and replayed by B fails; a forwarded Telegram message or a shared push is inert; an unlink/relink invalidates every outstanding envelope retroactively | `REFUSED / widget_principal_mismatch` | IntentGateway | [TO BUILD] |
| 4 | **Tenant scope** | `TenantContextService.assertTenantId` over the record's tenant and the live principal's | `REFUSED / tenant_mismatch` | TenantResolver | [EXISTS] |
| 5 | **Verification floor** | `verificationFloor()` re-derived from the live registry (R3.4.2); compared to the server-derived `verification_level`, capped by `profile.max_verification_level`; branch per effect class (R3.4.4) | `NEEDS_SECOND_CHANNEL` / `HANDOFF_REQUIRED` + deep link; `REFUSED / policy_floor_raised` | ChannelProfileRegistry + AuthorityResolver | [TO BUILD] |
| 6 | **Authority, computed from scratch** | Membership / Staff / verified Client binding / `EntitlementsService` effective features / `AiToolPolicyService.assertCanExecute` (`allowedRoles`, `allowedSurfaces`, `requiredFeatures`, `riskTier !== 'restricted'`). `authority_hint` is **not read**. A widget that should never have been rendered still cannot act | `REFUSED / insufficient_authority` | AuthorityResolver | policy [EXISTS] — `ai-tool-policy.service.ts`; wiring [TO BUILD] |
| 7 | **Effect admissibility** | `effect` is within the kind's declared ceiling; `CONTROL` keys are in the control registry; a `COMMIT` record carries a non-null `confirmation_of_draft_ref` (§3.10); the delivering profile was permitted to carry this effect (§3.12) | `REFUSED / effect_not_admissible`, `REFUSED / booking_confirmation_required` | IntentGateway | [TO BUILD] |
| 8 | **Input validation** | closed-domain membership for `enum`/`ref`; cardinality in `[selection_min, selection_max]`; **bounds re-read from `bounds_source` and the value validated against the fresh bound**; normalizers applied; `c9SafeText` over every `text`/`phone` value; `max_total_bytes` enforced by refusal, never truncation | `REFUSED / selection_out_of_domain`, `REFUSED / bound_violation`, `REFUSED / use_secure_surface`, `REFUSED / oversize_submission` | IntentGateway | shape [TO BUILD]; `c9SafeText` [EXISTS] |
| 9 | **Lowering** | `rendered_utterance = render(utterance_template, server-resolved canonical labels)` is appended to the conversation as a **USER turn with authority NONE**. **This is the first durable write of the whole sequence.** From here the path is byte-identical to a typed message | — | chat ingress | [TO BUILD] |
| 10 | **Divergence audit (shadow first)** | the deterministic text router is run over the lowered utterance; if its resolved capability ≠ `IntentRecord.capability`, an audit record is written. Hard refusal behind a flag | `REFUSED / intent_divergence` (when gated) | intent router | [TO BUILD] |
| 11 | **Noun resolution** | each frozen noun is resolved by a **fresh read from its canonical owner**; the three witnesses (R3.7.3) are compared, not re-read; a value divergence returns `SUPERSEDED` with a rendered diff | `SUPERSEDED / handle_stale` | IntentGateway + capability owner | [TO BUILD] |
| 12 | **Data fence** | for `REFINE` / `NAVIGATE`, the new body is produced by the same projector behind the same five client-preview / PII enforcement points. No widget-specific PII path exists, so none of the five can be bypassed by a widget | masked body, never a leak | Projector | five points [EXISTS]; projector [TO BUILD] |
| 13 | **Effect routing** | `NONE` — unreachable (no token). `NAVIGATE` / `REFINE` → projector → `next_envelope`, **terminates here; no business effect is reachable from a selector**. `CONTROL` → control registry handler; no Action Engine edge. `DRAFT` → canonical draft owner. `REQUEST_APPROVAL` → approval object → PENDING. `HANDOFF` → signed target, no capability invoked. `COMMIT` → Gate 14 | per class | effect router | [TO BUILD] |
| 14 | **Canonical action** | `CanonicalActionIngressService.prepare()` receives the capability key, the normalized input, the **server-minted** idempotency key and the evidence refs; the policy resolver — not the caller — owns the decision (`assertNoCallerAuthority`, `assertResolverOwnsDecision`); booking-effect ingress refusal applies (§3.10); the Action Engine, never the widget, chat or renderer, calls the provider owner | policy decision | CanonicalActionIngressService → ActionEngineKernel → provider owner | [EXISTS] — `action-engine.ingress.ts` |

**R3.9.1 — the order is normative, and validation precedes lowering.** Gates 5–8 complete
before Gate 9 writes anything durable. *Mechanism:* the gateway is a single ordered pipeline
with no branch that reaches the chat-ingress writer before the Gate 8 result.
*Evaluated at:* the pipeline's construction, plus a test asserting that a submission
refused at Gates 1–8 produces **zero** conversation writes. *Status:* [TO BUILD].

[NON-NORMATIVE] In the first edition, lowering was Gate 7 and validation was Gate 9, so an
oversize, out-of-domain, or credential-shaped value was interpolated into the durable
transcript — and therefore into the LLM's untrusted-text channel — *before* the gate that
would refuse it. With a free-text field that is a durable prompt-injection and PII path that
survives the refusal. Moving two gates fixes it; nothing else needed to change.

**R3.9.2 — lowering interpolates only server-resolved canonical labels.** `{{selection}}` is
filled from `IntentRecord.selected_labels`, which the gateway writes at Gate 8 by mapping
validated domain members to their canonical display labels. Raw client bytes are never
interpolated. A `text` field's contribution to the utterance is its **normalizer output**,
never its input. *Mechanism:* the lowering function's signature accepts
`selected_labels: string[]` and has no parameter of the submission's `inputs` type.
*Evaluated at:* Gate 9. *Status:* [TO BUILD].

**R3.9.3 — a refusal is not a failure.** Every refusal above renders as `reason_text` plus,
where one exists, a `remedy` intent. None renders red, none renders as an error ARIA role,
none auto-retries. `c9Deny(...)` responses are HTTP 400s and most are **policy fences, not
faults** — `paid_capability_not_activated`, `capability_not_registered`, `review_stale`,
`run_expired_or_terminal`, `use_secure_surface`. The projector maps the `c9_*` code space to
`Cell` states and `Limitation` severities **before** anything reaches a renderer; only a
genuine transport fault may look like a fault. *Mechanism:* the code-space mapping table
plus the anti-error lint (M1). *Evaluated at:* projection, and CI. *Status:* mapping
[TO BUILD]; deny codes [EXISTS].

---

### 3.10 Booking effects — the general rule

**R3.10.1 — `booking_effect` is derived from the canonical registry, never authored and
never a capability name.**

```ts
function bookingEffect(actionCapabilityKey: string): boolean {
  return new ActionCapabilityRegistry().get(actionCapabilityKey).targetKind === 'appointment';
}
```

*Mechanism:* `RegisteredActionCapabilityV1.targetKind` in the Action Engine's own registry.
*Evaluated at:* Action Engine ingress, and at mint. *Status:* [EXISTS] —
`action-engine.contract.ts:174` declares `targetKind`; `action-engine.registry.ts` sets
`targetKind: 'appointment'` for the create, cancel, reschedule and services capabilities.
The complementary family predicate `clientPrincipalTarget(capability)` already enumerates
`crm.appointment.create.v1 | cancel | reschedule | services`
(`client-action-principal.contract.ts:17`).

[NON-NORMATIVE] The first edition's enforcement clause named exactly one capability,
`appointments.own.create`. Reschedule and cancel are booking effects by any reading and were
unguarded; cancellation additionally had no confirmation body to be minted onto, so it had
to be minted somewhere the clause did not look. Deriving the flag from `targetKind` closes
the family and closes every future member of it without an edit.

**R3.10.2 — a booking `COMMIT` cannot be minted except onto a canonical confirmation.**
For any intent whose subject capability satisfies `bookingEffect`, `effect === 'COMMIT'`
requires a non-null `IntentRecord.confirmation_of_draft_ref` pointing at a draft produced by
the canonical booking owner. At the moment a `TIME_SLOT_SELECTOR` is rendered, **no COMMIT
token for that booking exists anywhere in the system.** *Mechanism:* the mint function
refuses to mint a booking `COMMIT` without a draft reference (non-existence), and Gate 7
re-checks the reference. *Evaluated at:* mint and Gate 7. *Status:* [TO BUILD].

**R3.10.3 — Action Engine ingress refusal, keyed off the flag.** A request for a capability
satisfying `bookingEffect` is admitted only when its `evidenceRefs` carry a
`canonical-confirmation:v1:<draft_id>` reference minted by the booking owner, and its
`source.type` is `authenticated_request`. *Mechanism:* a predicate in
`CanonicalActionIngressService.prepare()`, alongside the existing
`readClientActionPrincipal` evidence check, which already refuses
`Invalid or unregistered Client authority evidence` when the authority/target evidence
prefixes are absent or malformed. *Evaluated at:* Gate 14. *Status:* evidence idiom and
`allowedSourceTypes` [EXISTS]; the confirmation predicate [TO BUILD].

**R3.10.4 — every booking effect has exactly one confirmation surface.** The confirmation
body carries `confirmation_subject: 'create' | 'reschedule' | 'cancel'`. A cancellation
confirmation is a distinct subject, not a draft-abandon control. *Mechanism:* discriminator
on the confirmation body, with the ceiling table admitting `COMMIT` only there.
*Evaluated at:* emission. *Status:* [TO BUILD].

**R3.10.5 — a selector holds no lock, and there is no `hold_token`.** The availability
value a selector renders has exactly three states — `FREE`, `TAKEN`, `UNKNOWN` — and
`HELD` is not a member. The widget layer never creates, extends or expires an occupancy
hold. Staleness is handled by Gate 11 and R3.11.2 returning `SUPERSEDED` with a rendered
diff. *Mechanism:* the absence of `HELD` from the enum and of any hold field from the
contract; there is nothing to mint and nothing to reconcile. *Evaluated at:* emission
(shape). *Status:* [TO BUILD]. [NON-NORMATIVE] A soft lock the provider does not own would
make the widget layer the system of record for who holds a chair, which is the one thing the
constraints forbid outright, and a phantom hold would have no canonical owner to expire it.

**R3.10.6 — a drag on a schedule is a `REFINE`.** A schedule surface's ceiling is
`REFINE` / `NAVIGATE`. A drag-to-reschedule gesture emits a `REFINE` whose response is a
reschedule confirmation produced by the canonical booking owner — with booking-intent
normalization, Client-principal verification and confirmation identity run **before the
draft exists** — and the `COMMIT` is minted onto that body alone.
*Mechanism:* the kind ceiling plus R3.10.2. *Evaluated at:* emission. *Status:* [TO BUILD].

---

### 3.11 The approval path — re-resolution at execute time

**R3.11.1 — an approval decision is itself a gateway submission and passes Gate 11.** The
`APPROVAL` envelope's decide intent carries `approval_of_intent_ref` pointing at the
requesting `IntentRecord`, and inherits its `frozen_nouns`. Gate 11's fresh read therefore
runs **at decision time**, not only at request time. *Mechanism:* the mint path copies
`frozen_nouns` along the `approval_of_intent_ref` edge; Gate 11 reads them from the decision
record. *Evaluated at:* Gate 11 on the decision submission. *Status:* [TO BUILD].

**R3.11.2 — divergence at decision time does not execute.** If any noun has diverged since
the approval was requested, the gateway does **not** call the owner's approve route. It
returns `SUPERSEDED` with the rendered diff, rejects the standing approval through the
owner's existing reject path, and mints a fresh `APPROVAL` envelope carrying the new values.
*Mechanism:* ordering — the approve call sits behind the Gate 11 result; the reject path is
`ai-tool-runtime.service.ts` `rejectApproval`, which transitions `PENDING → REJECTED` under
`assertPayloadHash`. *Evaluated at:* Gate 11 → Gate 13. *Status:* owner reject path
[EXISTS]; the ordering [TO BUILD].

**R3.11.3 — the payload hash and the fresh read are complementary and both are required.**
`assertPayloadHash(approval, dto.payloadHash)` pins **what was approved**; Gate 11 pins
**the world it was approved against**. Neither substitutes for the other.
*Mechanism:* both checks, in that order. *Evaluated at:* Gate 11, then the owner's approve
route. *Status:* `assertPayloadHash` [EXISTS] — `ai-tool-runtime.service.ts:209,301`;
Gate 11 [TO BUILD].

**R3.11.4 — where approval and dispatch are separated in time, the owner must re-resolve,
and until it does the intent is not mintable.** A capability whose owner queues dispatch
after `APPROVED` (so that arbitrary time passes between the decision and the provider call)
declares `dispatch_is_synchronous: false` in the widget capability policy table. For such a
capability `mintIntent()` refuses to mint a `REQUEST_APPROVAL` or `COMMIT` intent until the
owner performs its own execute-time re-resolution. *Mechanism:* the mint function's
refusal; fail-closed. *Evaluated at:* mint. *Status:* [TO BUILD].

[NON-NORMATIVE] This is the honest form of the guarantee. "The price shown 90 seconds ago is
never the price charged" is true for a direct commit because Gate 11 sits immediately before
Gate 14. Across an approval boundary it is true only if someone re-reads on the far side —
so this contract makes the gateway re-read at the decision, and refuses to mint at all for
owners whose dispatch it cannot reach. It does not claim a guarantee it cannot deliver for
queued owners; it declines to emit the button.

---

### 3.12 Carriers — what each channel may deliver

**R3.12.1 — a notification profile carries `NAVIGATE` and `HANDOFF` only.** For every
registered profile whose `interaction_model === 'NOTIFICATION'`, the deliverable effect set
is the literal `{NAVIGATE, HANDOFF}`. There is no risk-tiered exception and no
per-capability opt-in. A push action lands on a confirmation body inside a verified surface;
it never actuates. *Mechanism:* two independent ones — (a) the server mints per delivery, so
a notification payload physically contains no `COMMIT` token (non-existence); (b) Gate 7
re-checks the delivering profile's effect set. *Evaluated at:* mint/delivery, and Gate 7.
*Status:* [TO BUILD].

[NON-NORMATIVE] The first edition permitted a one-tap `COMMIT` from a push when
`risk_tier === 'low_write' && reversible === true`, while its own prohibition list forbade
"a COMMIT reachable in one tap from a selector, a push, or a spoken utterance without
readback". The permissive rule was the operative one because the ladder is what the server
executes. Both predicates were also unsound: `reversible` has no canonical boolean source
(R3.6.1), and the safeguard the affected card was supposed to show — consent-aware audience
arithmetic before the irreversible tap — is undeliverable inside a ~120-character push body.
Deleting the exception removes the one-tap commit, the dependency on an unsourced boolean,
and an undeliverable safeguard in a single edit.

**R3.12.2 — a profile that cannot establish a first-party session carries nothing above
`NAVIGATE`/`HANDOFF` in practice, and the mechanism is the floor, not the profile.** Every
actuating class has `EFFECT_FLOOR ≥ BOUND_CLIENT` and every `COMMIT` has
`SESSION_VERIFIED`; a channel whose `max_verification_level` is `CHANNEL_IDENTITY` therefore
fails Gate 5 for all four actuating classes. *Mechanism:* R3.4.4 with the server-derived
level. *Evaluated at:* Gate 5. *Status:* [TO BUILD].
[NON-NORMATIVE] This is why Telegram is read-and-handoff-only today and why that is correct
behaviour rather than a workaround: the canonical principal is established only inside the
HTTP middleware, and the bot runs polling.

**R3.12.3 — token carriage.** One token, five carriers: JSON body verbatim; Telegram
`callback_data` as `w1.<widget10>.<intent6>.<sig8>` base62 within the **64-byte hard limit**;
push `action` id verbatim; voice by deterministic alias match resolved server-side; SMS /
e-mail as an `i`-class carrier in a signed first-party path segment. *Mechanism:* the token
is an opaque handle into `IntentRecord` rather than a self-describing blob, which is what the
64-byte ceiling forces. *Evaluated at:* delivery. *Status:* [TO BUILD].

**R3.12.4 — one capability, three front doors, one function.** `utterance_preview` and
`speech_aliases` must resolve deterministically — regex/corpus, pre-LLM — to the same
capability and the same token as the tap. *Mechanism:* the deterministic router is the same
module for all three, and Gate 10 audits divergence. *Evaluated at:* routing, and Gate 10.
*Status:* [TO BUILD]. *Consequence:* a screen-reader user who types the sentence, a voice
user who says it, and a thumb that taps travel one code path and produce one audit line.

**R3.12.5 — help is generated, never written.** Per-channel help and command lists are
generated from the intent registry and the kind registry. No hand-written command list is
permitted. *Mechanism:* CI test asserting no static command list exists in any channel
adapter. *Evaluated at:* CI. *Status:* [TO BUILD].

**R3.12.6 — the escape verb.** Every envelope with `lifecycle.input_lock !== 'none'` carries
exactly one `role: 'escape'` intent at `priority: 0`, never dropped by degradation, whose
`speech_aliases` include the universal cancel verbs and which is additionally reachable as
`/cancel` in Telegram. *Mechanism:* emission validator. *Evaluated at:* emission.
*Status:* [TO BUILD].

---

### 3.13 The forbidden edges

Each row states an edge that cannot be constructed, the mechanism that makes it so, and
where that mechanism is evaluated. "Non-existence" is claimed only where the thing genuinely
cannot be built; every other row names a check.

| # | Forbidden edge | Mechanism | Evaluated at | Status |
|---|---|---|---|---|
| E1 | `BUTTON → PROVIDER` | The submission names no endpoint, capability or argument; `IntentTarget` has no member able to hold a URL, host or origin (R3.3.1); no renderer holds provider credentials or a base URL; the provider owner is called only by the Action Engine | ingress (shape), emission (target shape), Gate 14 | shape [TO BUILD]; Action Engine boundary [EXISTS] |
| E2 | `BUTTON → DATABASE BUSINESS MUTATION` | `EffectClass` has no `MUTATE`/`EXECUTE` member; the only road to a business row is Gate 14, and `CONTROL` — the one new server-writing class — has no Action Engine edge and a CI-checked import allowlist (R3.2.4) | emission (closed union), Gate 13, CI | [TO BUILD] |
| E3 | `WIDGET STATE == BUSINESS STATE` | The submission has no `body` and no state member; `resolved_state` derives from the receipt; **no canonical table holds a foreign key to `widget_id`**, asserted by a schema test | ingress, INV-15 schema test | [TO BUILD] |
| E4 | `CHANNEL IDENTITY → BUSINESS AUTHORITY` | `verification_level` is server-derived and absent from `ChannelProfile`; every actuating class has a derived floor at or above `BOUND_CLIENT`; Gate 5 compares them and Gate 6 recomputes authority from Membership / Staff / Client binding / entitlements / tool policy | Gate 5, Gate 6 | floor [TO BUILD]; policy [EXISTS] |
| E5 | `BUTTON → 152-FZ DECISION` | R3.5.1: a `NEVER_CHAT_ACTUATED` subject capability admits `HANDOFF` to an `s` target only, and its derived floor is `SESSION_VERIFIED`+, refused at Gate 5 on any lower channel | emission, Gate 5 | [TO BUILD] |
| E6 | `NOTIFICATION TAP → COMMIT` | R3.12.1: the notification payload physically contains no `COMMIT` token because the server mints per delivery, and Gate 7 re-checks the profile's effect set | mint/delivery, Gate 7 | [TO BUILD] |
| E7 | `SELECTOR → BOOKING EFFECT` | R3.10.2: a booking `COMMIT` token does not exist until a canonical draft exists; R3.10.3: ingress refuses a booking-effect request without a canonical-confirmation evidence ref | mint, Gate 7, Gate 14 | [TO BUILD] over an [EXISTS] ingress |
| E8 | `LLM → INTENT` | The seal key is held by exactly three minters; the model's only channel is a kind proposal validated against a server table; no model output is an input to `mintIntent()` | mint | [TO BUILD] |
| E9 | `HANDOFF → EXTERNAL PAYMENT PROVIDER` | Same as E1: the target shape cannot name an origin. A payment is `DRAFT → confirmation → COMMIT → Action Engine`, which alone opens the provider session and owns the idempotency key | emission, Gate 14 | [TO BUILD] |
| E10 | `CONVERSATION TEXT → AUTHORITY` | The lowered utterance is written as a USER turn with authority NONE; the transcript is an input to nothing but the deterministic router and the model's untrusted-text channel; Gate 6 recomputes authority without reading it | Gate 9, Gate 6 | [TO BUILD] |
| E11 | `UNVALIDATED BYTES → DURABLE TRANSCRIPT` | Gates 5–8 complete before Gate 9, the first durable write; lowering interpolates only server-resolved canonical labels and normalizer output (R3.9.1, R3.9.2) | Gate 8 → Gate 9 | [TO BUILD] |
| E12 | `WIDGET → OCCUPANCY LOCK` | R3.10.5: there is no hold field and no `HELD` state to mint | emission | [TO BUILD] |
| E13 | `STALE APPROVAL → EXECUTION` | R3.11.1–R3.11.4: fresh read at decision time, `SUPERSEDED` re-enters approval, and no intent is minted at all for owners whose dispatch the gateway cannot reach | Gate 11, mint | [TO BUILD] |
| E14 | `URL → AUTHORISATION` | Nothing renders before an authority decision: a deep link resolves through one of five typed classes and the server decides what renders; an unresolvable link produces a sentence in the timeline, never a screen and never a login page | carrier resolution | [TO BUILD] |

---

### 3.14 The fundamental rules

These are the rules the rest of the contract exists to make true. Each is restated with the
mechanism that enforces it and the point at which that mechanism runs. Where a rule is
currently enforced by a mechanism that is [TO BUILD], that is said plainly.

**FR-1 — WIDGET ≠ BUSINESS OWNER.**
A widget never owns a business fact. Every effect terminates at a registered canonical owner
which the widget layer does not implement, does not wrap and does not bypass.
*Mechanism:* the effect router's only write edges are (a) the widget layer's own draft and
emission stores, (b) the control registry's three handlers, (c) the Action Engine ingress;
a CI import test asserts the gateway module imports no Prisma model other than
`IntentRecord` and the widget layer's own stores.
*Evaluated at:* Gate 13, Gate 14, and CI. *Status:* [TO BUILD] over an [EXISTS] ingress.

**FR-2 — WIDGET STATE ≠ BUSINESS STATE.**
`body` is a read model the server ignores on ingress; local UI state is `ephemeral_ui` and is
never transmitted; `resolved_state` derives from a receipt, never from the fact that a button
was pressed; `Lifecycle.resolution` is **delivery bookkeeping only** and no surface may
present it as a business fact or as a person's commitment.
*Mechanism:* the submission shape has no `body` and no state member; INV-15 is a schema test
asserting **no canonical table holds a foreign key to `widget_id`**; an emission lint
forbids any text equivalent that renders `resolution` as a business assertion.
*Evaluated at:* ingress, schema test, emission lint. *Status:* [TO BUILD].
*Consequence:* deleting conversation history deletes envelopes, bodies and rendered text and
leaves appointments, consent records, loyalty balances, `Client` bindings, Action Engine
receipts and `ActionExecution` rows correct.

**FR-3 — BUTTON ≠ AUTHORITY.**
Rendering an intent is not permission to use it. Authority is recomputed from scratch at
Gate 6 from Membership, Staff, the verified Client binding, `EntitlementsService` and
`AiToolPolicyService.assertCanExecute`; `authority_hint` is a rendering hint that no server
decision reads.
*Mechanism:* Gate 6; plus the CI reference test of R3.1.3.
*Evaluated at:* Gate 6, and CI. *Status:* policy service [EXISTS]; gateway wiring and the CI
test [TO BUILD].
*Consequence:* a widget that should never have been rendered still cannot act.

**FR-4 — CHANNEL IDENTITY ≠ BUSINESS AUTHORITY.**
"This Telegram account" and "this push subscription" are identification, not verification.
*Mechanism:* `verification_level` is derived from the session and has no member in any
client-supplied structure; every actuating effect class carries a derived floor at or above
`BOUND_CLIENT` and every `COMMIT` at or above `SESSION_VERIFIED`; Gate 5 compares them.
*Evaluated at:* Gate 5. *Status:* [TO BUILD].

**FR-5 — WIDGET EVENT → TYPED INTENT → CURRENT AUTHORITY CHECK → CANONICAL OWNER, with no
shortcut.**
*Mechanism:* the fourteen-gate pipeline of §3.9, which is the single ingress for every
carrier (Step 0) and has no branch that skips a gate; `POST /api/chat/widget-intents` is the
only new endpoint and it owns no business logic, no capability of its own and no table
beyond `IntentRecord`.
*Evaluated at:* the whole pipeline. *Status:* [TO BUILD].

**FR-6 — no widget kind may, by itself, confer any of the following.**

| conferral | why it cannot happen | mechanism | evaluated at | status |
|---|---|---|---|---|
| **consent** | the eight consent/identity keys admit `HANDOFF` to an `s` target only, and their derived floor is `SESSION_VERIFIED`+ | R3.5.1 emission validator; R3.4.3 policy table; Gate 5 | emission, Gate 5 | [TO BUILD] |
| **booking authority** | a booking `COMMIT` token does not exist until a canonical draft exists, and ingress refuses a booking-effect request lacking a canonical-confirmation evidence ref | R3.10.2 mint refusal; R3.10.3 ingress predicate over `targetKind === 'appointment'` | mint, Gate 7, Gate 14 | [TO BUILD] over [EXISTS] |
| **marketing permission** | a communication capability must carry `audience_size` as a `Measure` sourced from the canonical bulk preview, and consent-aware arithmetic is shown before the irreversible tap; the audience is never computed by the widget layer | emission validator; `b35.preview` (`eligibleCount` vs `candidateCount`) | emission, Gate 14 | validator [TO BUILD]; owner [EXISTS] |
| **finance permission** | a numeric field must name a `bounds_source` re-read from the canonical owner at Gate 8, and the effect reaches a row only through Gate 14's policy resolver, which the caller cannot influence (`assertNoCallerAuthority`) | R3.6.4; `CanonicalActionIngressService` | Gate 8, Gate 14 | bounds [TO BUILD]; resolver [EXISTS] |
| **tenant authority** | tenant is resolved from the authenticated context and asserted against the record's tenant; `tenant_id` is a forbidden key at every depth below the envelope root | Gate 4 `TenantContextService.assertTenantId`; INV-1 structural validator | Gate 4, ingress | [EXISTS] / [TO BUILD] |
| **approval** | who may decide is decided by the capability's `approvalPolicy` in the tool definition, not by which widget was rendered; the C9 `review` path is **explicitly not** a source approval and can never satisfy a pending approval | `AiToolPolicyService.canDecide` / `assertCanDecide`; `assertPayloadHash` binding the exact scope | the owner's approve route | [EXISTS] |

**FR-7 — CHAT-FIRST ≠ CHAT-ONLY.**
The fallback editor is not a concession; it is where four of the six conferrals above are
*supposed* to happen. Every `NEVER_CHAT_ACTUATED` act terminates on a shell destination, and
a settings surface must carry an editor handoff for audit, exact configuration,
accessibility and correction.
*Mechanism:* R3.3.3 (consent handoffs use `s` only) and the emission validator's requirement
that a settings-class body carry a `NAVIGATE`/`HANDOFF` intent to its editor.
*Evaluated at:* emission. *Status:* [TO BUILD].

**FR-8 — ROLE REMOVAL FROM UX ≠ ROLE REMOVAL FROM SECURITY.**
Nothing in this section removes a role check. `presentation_mode` may reorder, relabel and
hide; it may never enable an intent, and no intent's `capability` may vary by it.
*Mechanism:* Gate 6 reads Membership/Staff/Client binding and never `presentation_mode`;
a CI test asserts no intent set differs by presentation mode for the same principal and
capability set.
*Evaluated at:* Gate 6, and CI. *Status:* [TO BUILD].

**FR-9 — one interaction contract across platforms.**
Native is an out-of-repo Capacitor shell plus an Android TWA over the **same web bundle**;
there is no native source in this repository and this contract defines no second widget
architecture. Platform-specific *shell* behaviour — how a deep link arrives, how a
notification is presented — is permitted and is confined to the channel profile and the
carrier decode of Step 0. Every gate above is identical on every platform.
*Mechanism:* one gateway, one gate pipeline, one profile registry; the three registered
native schemes resolve through the same five target classes.
*Evaluated at:* Step 0 and Gate 5. *Status:* [TO BUILD].

**FR-10 — UNKNOWN is never rendered as failure.**
`UNKNOWN` is an outcome, not an error: it renders as a progress body with reconciliation
language, holds its step and blocks only dependents. Every refusal in §3.9 renders as
`reason_text` plus a `remedy` intent where one exists.
*Mechanism:* the `c9_*` code-space mapping of R3.9.3 plus the anti-error lint (M1).
*Evaluated at:* projection, and CI. *Status:* mapping [TO BUILD]; deny codes and the
three-valued reconciliation outcome [EXISTS].

---

### 3.15 Invariants this section adds or replaces

| # | Invariant | Replaces | Enforced by |
|---|---|---|---|
| INV-6′ | The effect/field table of §3.2 holds for every intent; an intent that sets a cell the table marks `null` is unrepresentable | INV-6 | closed-shape validator, emission + mint |
| INV-8′ | `subjectCapability(i) ∈ NEVER_CHAT_ACTUATED ⟹ effect === 'HANDOFF' ∧ target.class === 's' ∧ verification_floor ≥ SESSION_VERIFIED`; the predicate is total (R3.5.1) | INV-8 | emission validator |
| INV-19 | `verification_floor` is non-null on every intent and equals `verificationFloor()` recomputed from the live registry | new | mint + Gate 5, plus a CI test that no other assignment to the field exists |
| INV-20 | Every `NAVIGATE`/`HANDOFF` intent carries a `target` of one of the five classes; no intent carries a URL, host, origin or query string | new | closed shape + `c9SafeText` |
| INV-21 | `effect: 'NONE'` ⟹ `intent_token === null`; no control-registry key, routing-map entry or gateway branch exists for `NONE` | new | closed shape + routing table test |
| INV-22 | No intent whose subject capability satisfies `bookingEffect` carries `COMMIT` without `confirmation_of_draft_ref`; the Action Engine refuses such a request without a canonical-confirmation evidence ref | INV-7's single-name clause | mint refusal + ingress predicate over `targetKind` |
| INV-23 | Every `InputField` of a non-closed kind declares a `bounds_source`/`normalizer_ref`, and every such emission carries `free_input_justification` and is counted | new | emission validator + emission counter |
| INV-23a | No envelope carries both a non-closed `InputField` and a `COMMIT` intent; every `COMMIT` record has a non-null `confirmation_of_draft_ref` | new | emission validator + mint refusal |
| INV-24 | A submission refused at Gates 1–8 produces zero conversation writes | new | pipeline ordering test |
| INV-25 | Every `IntentRecord` field is classified exactly once as authority-and-audit or as conversation content; erasure tombstones the second block and touches neither the first nor any canonical row | new | field classifier + CI completeness test |
| INV-26 | No profile whose `interaction_model === 'NOTIFICATION'` is delivered an intent whose effect is outside `{NAVIGATE, HANDOFF}` | replaces ladder step 8's exception | mint-per-delivery + Gate 7 |
| INV-27 | The availability enum has no `HELD` member and no hold field exists anywhere in the contract | new | the types themselves |

---

### 3.16 Honest register for this section

1. **Everything marked [TO BUILD] is a requirement, not a capability.** This cycle changes
   nothing (§0). The gates that exist today are 2, 4, 6 (as a policy service), 14 (as an
   ingress) and the deny-code space. The gateway, the `IntentRecord` store, the derived
   floor, the typed target and the ordering of Gates 8–9 are the package this contract
   commissions. Until that package ships, no sentence in this section describes the running
   system.
2. **`IntentRecord` is the one storage addition.** It is not a canonical business table, no
   canonical row references it (INV-15), and it is created by the package that ships the
   gateway. This contract requires **no change to any C9 contract** and **no change to any
   canonical business schema**: the widget capability policy table and the control registry
   are frozen server-side constants in the widget layer, and `booking_effect` is *derived*
   from `RegisteredActionCapabilityV1.targetKind` rather than added to it.
3. **The seal stops forgery, not misselection.** One token per intent with a closed
   selection domain — rather than one token per option, which is unshippable envelope weight
   — means a compromised renderer can still choose *which legal option* to submit. The blast
   radius is bounded to "something the server was willing to offer this principal right now",
   plus the fresh-read divergence check at Gate 11. Narrow, and not "provably incapable".
4. **Renderer sandboxing is a convention until there is a build.** The intent is that
   renderer modules receive no token-bearing props and import no
   `fetch`/`XHR`/`WebSocket`/storage/provider SDK. That is lint-enforceable only where a
   build pipeline exists; the shipping frontend is a hand-edited single file with no sources
   and no build script in the repository. Discouraged, not proven.
5. **Gate 10 is a shadow gate.** Divergence between the tap's capability and the deterministic
   router's reading of the lowered sentence is audited, not refused, until a promotion
   criterion is set. Until then, "three front doors, one function" is measured, not enforced.
6. **`Lifecycle.resolution` still has no canonical owner for attendance.** FR-2 forbids any
   surface presenting it as a business fact, which is a prohibition, not a capability. Until
   an appointment-acknowledgement owner is registered, "клиент подтвердил" is not a claim this
   system can make, and the reminder body must not imply it.

---

## 4. Lifecycle, channels, accessibility, history

**What this section owns.** The envelope's life from mint to redaction; the retention and erasure classification of everything the widget layer persists; the single definition of `maya.channel.profile/1` and `maya.render.receipt/1` and the fitting algorithm that connects them; the native shell contract; the voice carrier; the accessibility floor `maya.a11y.floor/1`; and the proactive emission rules. No other section of this contract restates the members of these artefacts. Where an earlier draft defined any of them twice, this section is the survivor and the other definition is deleted, not reconciled.

**Scope discipline.** Architecture only. Runtime changes: 0. Schema changes: 0. Migrations: 0. No field of any C9 contract (`AgentResult@1`, `c9Request`, `c9Alternative`, the orchestration controller surface) is added, removed or retyped by anything below. The stores this section names (`IntentRecord`, the timeline store, the receipt store, `RetentionPolicy@1`) are **specified here and created in a later package**; specifying a storage shape before it exists is the point of D5, because retention windows and the receipt-store split are not reversible once data is in them.

**Normative form.** Every numbered rule below is normative and carries two attributes: *Mechanism* (the named thing that makes it true) and *Evaluated at* (the exact point it is checked). A rule without both is a defect in this section, not a rule. Sentences marked `[NON-NORMATIVE]` are rationale, example or commentary; no implementation depends on them.

---

### 4.1 The lifecycle

```ts
type LifecycleState =
  | 'MINTED'        // sealed, not yet delivered
  | 'DELIVERED'     // handed to a channel adapter, already degraded (§4.5)
  | 'LIVE'          // rendered, intents consumable
  | 'CONSUMED'      // ≥1 intent submitted and receipted
  | 'SUPERSEDED'    // replaced in place by a successor envelope
  | 'EXPIRED'       // expires_at passed with no submission
  | 'CANCELLED'     // escape verb used
  | 'HISTORISED'    // frozen receipt (§4.2) — no intent is consumable
  | 'BODY_DROPPED'  // retention_sec elapsed; headline + summary only
  | 'REDACTED';     // erasure applied (§4.4)
```

Legal transitions, and no others:

| from | to |
|---|---|
| `MINTED` | `DELIVERED` |
| `DELIVERED` | `LIVE`, `EXPIRED` |
| `LIVE` | `CONSUMED`, `SUPERSEDED`, `EXPIRED`, `CANCELLED` |
| `CONSUMED`, `SUPERSEDED`, `EXPIRED`, `CANCELLED` | `HISTORISED` |
| `HISTORISED` | `BODY_DROPPED`, `REDACTED` |
| `BODY_DROPPED` | `REDACTED` |

```ts
interface Lifecycle {
  freshness_class: 'live' | 'scenario' | 'proactive_once' | 'static';
  state: LifecycleState;
  issued_at: string;                 // RFC3339
  expires_at: string;                // > issued_at; §4.1.3 ceilings
  flow_ttl_s: number | null;         // scenario flows only; null otherwise
  input_lock: 'none' | 'soft' | 'hard';
  on_expiry: 're_resolve' | 'collapse_to_summary' | 'mark_stale';
  supersedes_widget_id: string | null;
  superseded_by_widget_id: string | null;
  delivery: DeliveryRecord;          // §4.3 — NOT business state
  historised_form: 'summary_bubble'; // literal, single value
  timeline_placement: 'chronological';  // literal, single value. There is no pinned member.
  dedupe_key: string;                // one signal across channels
  retention_sec: number;             // ≤ the per-kind ceiling in §4.4.2
  delivery_channel: ChannelId;       // the channel this emission was fitted for (§4.5)
}
```

#### 4.1.1 Mint

**L1 — three minters, one key.** A valid envelope can be produced only by (1) the C9 orchestrator's compose step, (2) a registered capability read endpoint, (3) the proactive scheduler for the canonical moments (§4.9). Nothing else holds the seal key.
*Mechanism:* `envelope_seal` = keyed HMAC; the key is held by the three composer services and by no renderer, adapter or job.
*Evaluated at:* every renderer, before first paint (`verify(envelope_seal)`), and at the IntentGateway on submission.

**L2 — the composer never invents a value.** If a Cell required by the kind's body cannot be built from `facts_used` or a canonical read, the composer emits plain text instead of an envelope. A widget is optional decoration; it is never a precondition for answering.
*Mechanism:* composer contract test — for each registered `projector_id`, a fixture with a missing source field must produce a text answer, not a partially-populated body.
*Evaluated at:* compose step, before sealing.

**L3 — `expires_at` is bounded by four clocks, whichever is soonest.**
`expires_at ≤ min(facts.as_of + capability_ttl, principal session expiry, run expiry, issued_at + flow_ttl_s, issued_at + kindCeiling(kind))`.
*Mechanism:* emission validator computing the minimum and refusing the emission if the authored `expires_at` exceeds it.
*Evaluated at:* mint, before sealing (the seal covers `issued_at` and `expires_at`).

**L4 — the seal binds the principal.** `integrity.principal_proof_hash` is the opaque proof of the principal the envelope was minted for. An unlink/relink cycle changes it and thereby invalidates every outstanding envelope on every device, retroactively.
*Mechanism:* HMAC input includes `principal_proof_hash`; the gateway recomputes the live principal's proof and compares.
*Evaluated at:* IntentGateway principal-binding gate, and again at timeline read (§4.2, FR4).

#### 4.1.2 Render, interact, supersede

**L5 — a renderer is a pure function `(envelope) → surface`.** It verifies `seal_key_version`, `envelope_seal` over a recomputed `body_hash`, and `expires_at`. On seal mismatch or expiry it renders `text_equivalent` as frozen prose and offers nothing else.
*Mechanism:* renderer conformance suite; the renderer module receives no token-bearing props and no network client.
*Evaluated at:* render time, per envelope.

**L6 — the UI changes only through a receipt.** A renderer never mutates a widget locally on click. It submits, receives `next_envelope` / `resolved_widget`, and re-renders. Optimistic *spinners* are `ephemeral_ui`; optimistic *business state* does not exist, because the renderer has no field to write it into.
*Mechanism:* `body` is a read model the server ignores on ingress; no submission field carries body state.
*Evaluated at:* gateway ingress (extra keys rejected by the structural validator) and renderer conformance suite.

**L7 — update in place, never accumulate.** A successor envelope carries `supersedes_widget_id`; the predecessor moves to `SUPERSEDED` and is replaced at its original position. Telegram uses `edit_message_text` on the same message.
*Mechanism:* `superseded_by_widget_id` written by the gateway when it mints `next_envelope`; the adapter's update path is the only write path to a delivered message.
*Evaluated at:* gateway, when `next_envelope` is minted.

**L8 — expiry is never an error.** Interacting with an expired envelope returns `outcome: 'EXPIRED'` with either a freshly composed equivalent envelope or a `LIMITATION` body with a remedy. No renderer may bind expiry to an error theme token, an error icon, `role="alert"`, or an automatic retry.
*Mechanism:* the M1 anti-error lint over `Cell.label` and the renderer theme-token ban; `EXPIRED` is a member of the receipt `outcome` union, not of any error type.
*Evaluated at:* gateway token-integrity gate; renderer conformance suite (five branches per Cell).

**L9 — a stale affordance must be withdrawn where the channel allows it, and refused where it does not.** On transition to `SUPERSEDED`, `EXPIRED`, `CANCELLED` or `HISTORISED`, the delivering adapter issues a best-effort withdrawal: Telegram `editMessageReplyMarkup` with empty markup; web push `getNotifications()` + `close()` by `dedupe_key`; no-op for SMS and email. **Correctness never depends on the withdrawal succeeding** — a tap on a withdrawn-but-still-visible control is refused by token integrity.
*Mechanism:* adapter withdrawal hook + `IntentRecord.consumed_at` / `expires_at` check.
*Evaluated at:* historisation job (withdrawal) and IntentGateway token-integrity gate (refusal).

`[NON-NORMATIVE]` The belt-and-braces ordering matters because Telegram messages are durable client-side: an inline keyboard from last Tuesday is still tappable on a phone that was offline when the edit was issued. The refusal, not the edit, is the guarantee.

#### 4.1.3 Per-kind ceilings

`kindCeiling(kind)` is the maximum `expires_at − issued_at`, and `on_expiry` is **mandatory per kind**, not author-chosen.

| kind | `expires_at` ceiling | `on_expiry` (mandatory) | `flow_ttl_s` |
|---|---|---|---|
| `CHOICE` | 1800 s | `re_resolve` | 1800 when in a flow |
| `SERVICE_SELECTOR` | 900 s | `re_resolve` | 1800 |
| `STAFF_SELECTOR` | 900 s | `re_resolve` | 1800 |
| `TIME_SLOT_SELECTOR` | 300 s, **and** ≤ the booking owner's slot-hold TTL | `re_resolve` | 1800 |
| `BOOKING_CONFIRMATION` | 900 s, **and** ≤ the canonical draft's hold TTL | `re_resolve` | 1800 |
| `SCHEDULE` | 300 s | `re_resolve` | null |
| `CLIENT_LIST` | 300 s | `re_resolve` | null |
| `METRIC` / `CHART` / `REPORT` | `as_of` + capability freshness window, ≤ 86400 s | `mark_stale` | null |
| `STRATEGY_OPTIONS` | revision validity, ≤ 86400 s | `re_resolve` | null |
| `APPROVAL` | the approval object's own TTL (owner-set) | `re_resolve` | null |
| `PROGRESS` | the run window, ≤ 3600 s | `re_resolve` | null |
| `LIMITATION` / `SOURCE_STATUS` | 1800 s | `mark_stale` | null |
| `SETTINGS_DRAFT` | 900 s | `re_resolve` | 1800 |
| `FORM` | 900 s | `re_resolve` | 1800 |

**L10 — a token ceiling is not a time limit on the user.** Every envelope whose `input_lock !== 'none'` has `on_expiry: 're_resolve'`. Re-resolution re-mints the envelope **from the canonical draft or the canonical read**, preserving the flow position (`correlation.step_index` / `step_total`) and any server-owned draft. A slow reader loses a token, never a place in the flow and never entered data that a canonical owner already holds.
*Mechanism:* the `on_expiry` column above is compiled into the emission validator as a per-kind constant, not an authored field; the re-resolve path is the gateway's `EXPIRED → next_envelope` branch, which reads `draft_ref` where the body has one.
*Evaluated at:* mint (validator) and gateway (on submission of an expired token).

**L11 — `collapse_to_summary` requires an extension affordance.** An envelope may carry `on_expiry: 'collapse_to_summary'` only where re-resolution is impossible (the source no longer exists). It must then carry exactly one `priority: 0`, `role: 'remedy'`, `effect: 'REFINE'` intent whose utterance restores the flow, and that intent is undroppable by degradation.
*Mechanism:* emission validator rule `on_expiry === 'collapse_to_summary' ⇒ ∃! intent{priority:0, role:'remedy', effect:'REFINE'}`; the fitting algorithm's PIN step (§4.5.4) cannot drop `priority: 0`.
*Evaluated at:* mint (validator) and fitting (PIN step).

`[NON-NORMATIVE]` This is the repair of the first edition's WCAG 2.2.1 claim. The first edition asserted that `flow_ttl_s` "discharges SC 2.2.1 structurally" while its own regime table gave the flagship booking flow `collapse_to_summary` and a 120-second confirmation ceiling, with no extension affordance defined anywhere. The rule above makes the assertion true instead of withdrawing it, and L10 makes the ceilings harmless.

---

### 4.2 The frozen receipt — what a widget is a week later

**Decision D5, option A is adopted.** A persisted widget is an artefact, not a view.

**FR1 — no rehydration, ever.** A historised envelope is rendered from its stored body and stored `text_equivalent` exactly as sealed, with its `as_of` timestamps intact. No renderer, service worker or scroll handler issues a read on behalf of a scrolled-back envelope.
*Mechanism:* the timeline read endpoint returns stored bytes only; renderer modules import no `fetch` / `XHR` / `WebSocket` and receive no capability handle — a historised envelope has no code path to a capability owner.
*Evaluated at:* renderer bundle import-graph allowlist (where a build exists) and the timeline endpoint contract test asserting zero capability calls per timeline page.

`[NON-NORMATIVE]` Rehydration is the intuitive default a future contributor will implement unless told not to. It is unsafe here for a specific reason: a body composed under one authority snapshot would silently re-render under another, re-opening all five client-preview PII enforcement points at scroll time, and it would destroy the audit artefact — you could no longer prove what was on screen at approval time.

**FR2 — expired intents render as a quiet terminal line, never as a control.** On historisation the composer mints a `terminal_line` per intent that was offered, from the closed vocabulary below, and the renderer emits **static text**, not a disabled button, not a greyed chip.

```ts
type TerminalOutcome =
  | 'SUBMITTED'        // a receipt exists, outcome ACCEPTED
  | 'CONFIRMED'        // a receipt exists and a canonical action completed
  | 'NOT_CONFIRMED'    // a receipt exists, outcome REFUSED / NEEDS_* and was not resolved
  | 'EXPIRED_UNUSED'   // no submission before expires_at
  | 'SUPERSEDED'       // replaced by a successor envelope
  | 'CANCELLED'        // escape verb used
  | 'DELIVERED_ONLY';  // never rendered interactively in this channel (§4.5 withholding)

interface TerminalLine {
  outcome: TerminalOutcome;
  text: string;                       // server-minted; the archival sentence
  action_receipt_ref: string | null;  // present iff outcome === 'CONFIRMED'
}
```

**`TerminalOutcome` is derived from the `IntentReceipt`, or from the delivery record when there is none. It is never derived from the fact that a control was pressed.**
*Mechanism:* the historisation job reads the receipt store keyed by `intent_token_hash`; it has no access to renderer state, and renderer state is never transmitted.
*Evaluated at:* historisation job; CI test asserting `outcome === 'CONFIRMED' ⟺ action_receipt_ref !== null`.

**FR3 — exactly one re-read affordance, minted at read time under current authority.** A historised envelope carries no live intent. The timeline read endpoint returns:

```ts
interface HistorisedWidget {
  envelope: WidgetEnvelope;           // frozen, as sealed
  terminal_lines: TerminalLine[];
  reread_intent: WidgetIntent | null; // minted NOW, effect 'REFINE', for the CURRENT principal
}
```

`reread_intent` is `null` whenever the current principal would not be offered that capability today. A historised widget therefore never promises a capability the reader has since lost.
*Mechanism:* the timeline endpoint calls the same AuthorityResolver and capability registry used at mint; a refusal yields `null`, not a disabled control.
*Evaluated at:* timeline read, per envelope, per request.

**FR4 — a frozen body is shown only to the principal it was minted for.** The timeline read endpoint recomputes the live principal's proof hash and compares it with `integrity.principal_proof_hash`. On mismatch it returns `presentation.text_equivalent.headline` plus the terminal lines and **withholds the body**.
*Mechanism:* the same hash comparison the gateway uses for principal binding, applied on the read path.
*Evaluated at:* timeline read, before the body is serialised.

`[NON-NORMATIVE]` This is what makes freezing safe rather than merely convenient: the one scenario where a frozen body could leak — a channel rebound to a different person, or a client binding replaced — changes the proof hash, and the body stops being served without any fence needing to be re-implemented.

**FR5 — `evidence_refs` in a persisted envelope are non-dereferenceable labels.** C9 evidence handles live in an in-memory map for one invocation. In a stored envelope they are audit labels that identify *which* evidence was used; they are not links and no surface may present them as links.
*Mechanism:* the timeline renderer has no evidence-resolution path; "show the evidence" is only ever the `reread_intent` (FR3), which re-reads.
*Evaluated at:* render; CI test asserting no timeline code path calls an evidence resolver.

**FR6 — the honest replay claim.** What can be replayed from storage is **the rendered form and the receipt chain**: the sealed envelope, its `RenderReceipt`, the `text_equivalent` actually sent, the terminal lines, and the Action Engine receipts. The evidential chain behind a `KNOWN` Cell cannot be re-walked from storage and this contract does not claim it can.
*Mechanism:* the replay tool reads the timeline store and the receipt store only; it has no evidence-store dependency, so the stronger claim is not constructible.
*Evaluated at:* replay tool contract test.

**FR7 — the archival form is the text equivalent.** After `retention_sec`, the body is dropped and the conversation retains `{ widget_id, kind, presentation.text_equivalent.headline, resolved_summary_text, terminal_lines, action_receipt_ref[] }`. Reopening a three-day-old conversation shows sentences, not sixty dead buttons.
*Mechanism:* the retention job's field allowlist; `text_equivalent` is covered by `body_hash`, so the archival form cannot drift from what was shown.
*Evaluated at:* retention job, and the A-21 parity gate (a weak summary fails the same test that fails an unreadable SMS render).

---

### 4.3 Resolution is delivery bookkeeping — and nothing else

**The decision, stated once: `resolution` carries no business meaning.** The first edition used `resolution.state` as the durable record that a client had confirmed attendance. That is a widget field standing in for a business fact, held in the presentation layer, deleted by history erasure, and owned by nobody. It is removed.

```ts
interface DeliveryRecord {
  delivery_state:
    | 'live'                       // deliverable, interactive where the channel allows
    | 'answered_in_this_channel'   // a receipt exists from this channel
    | 'answered_in_other_channel'  // a receipt exists from a sibling delivery (same dedupe_key)
    | 'withdrawn'                  // adapter withdrew the affordance (L9)
    | 'expired'
    | 'cancelled';
  answered_at: string | null;
  answering_channel: ChannelId | null;
  action_receipt_ref: string | null;   // the ONLY pointer to a business fact
}
```

**DR1 — `DeliveryRecord` is delivery/presentation bookkeeping only. No surface, in any channel, may present any member of it as a statement about a person's intention, attendance, agreement, consent or commitment.**
*Mechanism:* the field names carry no business predicate, and the copy that renders them is server-minted from a closed template set keyed by `delivery_state` — a renderer cannot author a sentence about delivery. A lint over that template set rejects business predicates (`подтверд`, `придёт`, `согласил`, `отказал`, `confirm`, `agree`, `attend`).
*Evaluated at:* template-registry CI lint, and the A-21 parity gate over emitted text.

**DR2 — a business fact is readable only through `action_receipt_ref`.** Any rendering that asserts a business outcome must read the Action Engine receipt named there. When `action_receipt_ref` is `null`, **no business outcome is assertable** and the surface renders the delivery sentence only.
*Mechanism:* `TerminalLine.outcome === 'CONFIRMED' ⟺ action_receipt_ref !== null` (FR2); the receipt is in the receipt store, which survives conversation erasure (§4.4).
*Evaluated at:* historisation job, and the CI test in FR2.

**DR3 — cross-channel dedupe resolves the delivery, not the fact.** One `dedupe_key` spans the push, the in-app card and the Telegram mirror of a single moment. An answer in any of them moves the siblings to `answered_in_other_channel` and triggers L9 withdrawal. It does **not** create, imply or record a business state anywhere.
*Mechanism:* the dedupe index is keyed on `dedupe_key` and writes only `DeliveryRecord` fields; it holds no capability handle and cannot call a canonical owner.
*Evaluated at:* the dedupe service's contract test (asserting zero capability invocations).

**DR4 — attendance acknowledgement has no canonical owner, so it carries no intent.** This section adds `GAP-ATTENDANCE-CONFIRM` to the capability-gap ledger: *record that a client acknowledged an upcoming appointment*. Until an owner is registered, an `appointment_reminder` emission carries a `Limitation` with `capability_gap_ref: 'GAP-ATTENDANCE-CONFIRM'` and intents of effect `NONE`, `NAVIGATE` or `HANDOFF` only. A "Приду" control that writes nothing is not emitted.
*Mechanism:* P2 (the /unsubscribe clause) — the emission validator refuses an intent whose capability is absent from the registry; the gap ledger entry is the positive record of why.
*Evaluated at:* mint (validator), for every `proactive_once` emission.

`[NON-NORMATIVE]` This is a real capability reduction relative to the first edition, and it is the honest one. A tick that a staff member reads as «клиент подтвердил», backed only by a presentation field that history erasure deletes, is worse than no tick: it is a business fact that disappears when a user exercises a legal right.

---

### 4.4 Retention and erasure

#### 4.4.1 Three stores, three clocks

| store | holds | ceiling | erasable on a conversation-erasure request |
|---|---|---|---|
| **Timeline store** | conversation turns, envelopes, bodies, minted text, `spoken_transcript`, rendered utterances | `T_TIMELINE = 180 days` from turn creation; earlier per-kind body drop (§4.4.2) | **yes, fully** |
| **Intent-audit store** | `IntentRecord`, `WidgetIntentSubmission` metadata, `RenderReceipt` | `T_AUDIT = 1095 days` (three years) from `issued_at` | **audit fields no; content fields yes** (§4.4.3) |
| **Receipt store** | Action Engine receipts, approval decisions, consent records | append-only; retention set by the canonical owner of the action, floor `T_AUDIT` | **no** |

**RT1 — the receipt store is separate and append-only.** It is written only by the Action Engine and the approval owner, never by the widget layer, the chat ingress or the gateway. It has no foreign key into the timeline store.
*Mechanism:* schema test asserting no column in the receipt store references a `widget_id`, a turn id or a conversation id; write grants limited to the two owner services.
*Evaluated at:* CI schema test, per build.

**RT2 — tenant policy may only shorten.** `RetentionPolicy@1 { timeline_sec, per_kind: Partial<Record<WidgetKind, number>> }` is validated against the ceilings above and in §4.4.2; a value exceeding a ceiling is refused, never clamped silently.
*Mechanism:* policy validator, monotone-reductive by the same discipline as `ChannelProfile` (C1, §4.5.2).
*Evaluated at:* policy write, and again at the retention job's start.

**RT3 — deleting conversation history leaves every canonical record correct.** No canonical table holds a foreign key to `widget_id`, and **no canonical read path may require the timeline store to answer correctly.**
*Mechanism:* two tests. (a) A schema test asserting the absence of the FK. (b) A **history-blind replay test**: the canonical read and action paths are exercised with the timeline store made unreadable; any business read that fails, degrades, or returns a different value is a violation.
*Evaluated at:* CI, per build. (b) is the load-bearing one — (a) alone does not catch a service that joins on a conversation id.

#### 4.4.2 Per-kind body retention ceilings (`retention_sec`)

| kind | ceiling | why |
|---|---|---|
| `CLIENT_LIST` | 24 h | `pii_class: 'client_identified'` — the shortest window in the contract |
| `FORM` with any `sensitivity: 'pii'` field | 24 h | free-input surface over identified data |
| `SCHEDULE`, `SOURCE_STATUS`, `PROGRESS`, `TIME_SLOT_SELECTOR` | 7 d | operational, superseded quickly |
| `CHOICE`, `SERVICE_SELECTOR`, `STAFF_SELECTOR`, `LIMITATION`, `FORM` (no pii field) | 30 d | selection context |
| `BOOKING_CONFIRMATION`, `SETTINGS_DRAFT`, `APPROVAL` (body projection) | 90 d | the human record of a decision; the canonical record lives in the receipt store |
| `METRIC`, `CHART`, `REPORT`, `STRATEGY_OPTIONS` | 365 d, capped by `T_TIMELINE` | business-aggregate, no identified PII |

**RT4 — the shortest applicable ceiling wins.** `retention_sec ≤ min(kindCeiling, tenant policy, and 24 h whenever `authority.pii_class === 'client_identified'` or any body field is `sensitivity: 'pii'`)`.
*Mechanism:* emission validator computes the minimum and writes `retention_sec`; it is not an authored field.
*Evaluated at:* mint.

#### 4.4.3 Field classification — the repair of "erasure never touches IntentRecords"

The first edition presented *"erasure never touches `IntentRecord`s"* as a safety guarantee. It is not one: `IntentRecord` and the submission record hold conversation-derived content — `utterance_template`, the human labels interpolated into it, the rendered utterance, and the full `spoken_transcript` of voice turns. Leaving those behind after an erasure request turns a stated right into a promise the system does not keep. **The guarantee is withdrawn and replaced by a classification.**

```ts
type ErasureClass =
  | 'AUDIT_RETAINED'        // authority & audit; survives a conversation-erasure request
  | 'CONVERSATION_CONTENT'  // erased with conversation content
  | 'CANONICAL_ELSEWHERE';  // a copy of a value a canonical owner holds; erased HERE, retained THERE
```

`IntentRecord`:

| field | class |
|---|---|
| `intent_token_hash`, `widget_id`, `tenant_id`, `principal_proof_hash` | `AUDIT_RETAINED` |
| `capability`, `effect`, `requires` (risk tier, reversibility, audience size, verification floor, `consent_scope` registry key) | `AUDIT_RETAINED` |
| `input_schema_hash`, `requested_scope_hash`, `selection_min`, `selection_max` | `AUDIT_RETAINED` |
| `issued_at`, `expires_at`, `single_use`, `consumed_at`, `run_ref`, receipt refs | `AUDIT_RETAINED` |
| `frozen_nouns` (opaque handles naming canonical rows) | `AUDIT_RETAINED` |
| `utterance_template` | `CONVERSATION_CONTENT` |
| `selection_domain` **labels** (the human strings) | `CONVERSATION_CONTENT` |

`WidgetIntentSubmission` as persisted:

| field | class |
|---|---|
| `widget_id`, `intent_token`, `client_nonce`, `profile_id`, `client_emitted_at` | `AUDIT_RETAINED` |
| `inputs[k]` where the schema type is `enum` or `ref` (closed-domain option ids) | `AUDIT_RETAINED` |
| `inputs[k]` where the schema type is `string` (free text) | `CONVERSATION_CONTENT` |
| `inputs[k]` where the schema type is `phone`, or sensitivity is `pii` | `CANONICAL_ELSEWHERE` |
| `spoken_transcript` | `CONVERSATION_CONTENT` |

Timeline turn: the rendered utterance (`IntentReceipt.utterance_echo` as stored), the envelope `body`, `presentation.text_equivalent`, `speech`, and every narrative string are `CONVERSATION_CONTENT`. `widget_id`, `kind`, `action_receipt_ref[]` and `TerminalLine.outcome` are `AUDIT_RETAINED`.

**RT5 — the classification is total, and a new column cannot dodge it.** Every persisted column of the three stores carries exactly one `ErasureClass`.
*Mechanism:* a build-time test enumerates the columns of each store from the schema and fails on any column with no class or more than one. Adding a column without classifying it breaks the build.
*Evaluated at:* CI, per build.

**RT6 — erasure nulls content and writes a tombstone.** An erasure request over conversation content sets every `CONVERSATION_CONTENT` and `CANONICAL_ELSEWHERE` column to `NULL` across the timeline and intent-audit stores for the requesting principal, and writes `{ erased_at, erasure_request_ref, store, row_key, fields_erased[] }` to the tombstone log. The `AUDIT_RETAINED` fields remain and the row keeps its shape, so the audit line survives as *"this principal submitted intent X against capability Y at time T"* without holding what they said.
*Mechanism:* the erasure job, driven by the `ErasureClass` map (not by a hand-written column list); the tombstone log is in the receipt store.
*Evaluated at:* erasure job; a CI fixture asserts that after erasure, a rendered timeline page contains no `CONVERSATION_CONTENT` bytes and the corresponding canonical booking/consent/loyalty reads are byte-identical to before.

**RT7 — what erasure does not touch, and why that is not a loophole.** Appointments, consent records, loyalty balances, `Client` bindings, `ActionExecution` rows, approval decisions and Action Engine receipts are owned by canonical owners with their own legal bases and their own retention. A conversation-erasure request does not delete them. **This is stated as a scope boundary, not as a safety property of the widget layer** — a data subject's rights against those records are exercised against those owners, through the surfaces the gap ledger tracks (`GAP-CONSENT-PD-WITHDRAW`, `GAP-CONSENT-MKT-CHANGE`, `GAP-CONSENT-REGISTER-EXPORT`), not here.
*Mechanism:* none is claimed. This is a boundary statement.
*Evaluated at:* n/a.

**RT8 — `GAP-HISTORY-ERASE` is not discharged until RT5, RT6 and the RT6 fixture are green.** The gap ledger entry's definition of done includes the classification table above.
*Mechanism:* the gap ledger is versioned with this contract; the entry names the three tests.
*Evaluated at:* gap-ledger review, at the package gate.

---

### 4.5 Channel profiles and degradation — the sole definition

#### 4.5.1 A minter is not a channel

Three services mint envelopes (L1); eleven channels render one to a human; six further systems are **emitters and transports** (`scheduler`, `backend`, `edge-relay`, `smm-bot`, `social-publishing`) and one is a **security surface** (`public-web-auth`).

**CH0 — emitters and transports get no `ChannelProfile`, and the proactive scheduler needs none.** Every emission names, at mint time, the `ChannelId` it is fitted for (`Lifecycle.delivery_channel`), and the fitting algorithm runs against **that channel's** profile. A scheduler-minted reminder delivered by web push is fitted to `web-push`; the same moment mirrored into the app timeline is a **second emission** with its own `widget_id`, its own fit and its own receipt, joined to the first by `dedupe_key`.
*Mechanism:* `delivery_channel: ChannelId` is required on every envelope; `ChannelId` has no emitter member, so an emitter profile cannot be written down. The fitter takes a profile, not a minter.
*Evaluated at:* mint (validator: `delivery_channel` present and resolvable in the profile registry).

`[NON-NORMATIVE]` The first edition gave `interaction_model` a `NON_INTERACTIVE` member and pointed the last ladder step at "scheduler, email, SMS, social publishing, edge relay". That let a transport declare presentation capability, which is the shape of a fourth authority path, and it left the scheduler — a designated minter — with no tier that any conformance matrix could cover. `interaction_model` and `NON_INTERACTIVE` are deleted. SMS and email keep a profile because they render text to a human; the scheduler does not need one because it renders nothing.

#### 4.5.2 `maya.channel.profile/1`

```ts
interface ChannelProfile {
  contract: 'maya.channel.profile/1';
  profile_id: string;                 // 'pwa.v1', 'tg.bot.v3', 'push.v1', …
  profile_version: number;
  channel_id: ChannelId;
  render_tier: RenderTier;
  locale_hint: string;

  // capacity — every field reductive
  max_intents: number;
  max_intent_label_chars: number;
  max_body_chars: number;
  max_table_rows: number;             // 0 = tables not renderable inline
  max_options_inline: number;
  token_carrier: TokenCarrier;
  token_budget_bytes: number;

  // presentation capabilities — declared, never authority
  supports: {
    rich_layout: boolean; tables: boolean; charts: boolean; images: boolean;
    inline_edit: boolean; multi_select: boolean; progressive_update: boolean;
    fullscreen_routes: boolean; speech_out: boolean; speech_in: boolean;
    back_stack: boolean; deep_link_in: boolean; file_delivery: boolean;
  };

  a11y_env: A11yEnvironment;          // §4.8
  motion: 'full' | 'reduced';
  text_scale: number;                 // 1.0 … 3.0
  color_scheme: 'light' | 'dark' | 'high_contrast';
  viewport_min_css_px: number;

  native_bridge?: BridgeSession;      // §4.6

  max_verification_level: VerificationLevel;  // SERVER-SIDE CEILING, not a claim

  // type-level bans
  declares_verification_level: never;
  declares_role: never;
  declares_capability: never;
}

type ChannelId =
  | 'pwa' | 'native-shell' | 'telegram-miniapp' | 'telegram-bot' | 'web-push'
  | 'realtime-voice' | 'guest-chat' | 'web-public' | 'public-community'
  | 'sms' | 'email';

type RenderTier =
  | 'RICH_INTERACTIVE' | 'RICH_CONSTRAINED' | 'ANNOUNCEMENT'
  | 'SPOKEN' | 'TEXT_ONLY' | 'PUBLIC_READ' | 'ANONYMOUS_CHAT';

type TokenCarrier =
  | 'json_body' | 'callback_data' | 'notification_action'
  | 'spoken_alias' | 'signed_path_segment';
```

**C1 — a profile is monotone-reductive.** No profile field's larger value unlocks anything. Every boolean appears only in a "may I still show X" position.
*Mechanism:* a property test over the fitter: for any envelope and any two profiles P ⊆ Q (field-wise), `emitted(P) ⊆ emitted(Q)`. A branch where a smaller capacity yields an intent the larger one did not fails it.
*Evaluated at:* CI, per build (gate G3).

**C2 — the forbidden-key validator applies to `ChannelProfile` verbatim.** No `role`, `permissions`, `token`, `client_id`, `staff_id`, `is_staff`, `is_owner`, `__meRole`, `__meIsStaff` at any depth.
*Mechanism:* the same structural validator used on the envelope and the submission.
*Evaluated at:* profile registration and every request carrying `X-Maya-Render-Profile`.

**C3 — a claimed profile is advisory and may only be narrowed.** The adapter presents `X-Maya-Render-Profile: tg.bot@3` and may present `X-Maya-Render-Caps`, which can only reduce the registered profile. The server may override downward; it may never override upward. `verification_level` is absent from the profile by construction; `max_verification_level` is a server-side ceiling.
*Mechanism:* the profile resolver takes the field-wise minimum of (registered profile, claimed caps); `VerificationLevel` has no profile field to carry it.
*Evaluated at:* profile resolution, per request.

`[NON-NORMATIVE]` C1 + C3 together are why a lying client is a non-event: it can make the widget uglier, never more powerful.

#### 4.5.3 Tiers, ceilings and channels

| tier | channels | `max_intents` | carrier | **effect ceiling** |
|---|---|---|---|---|
| `RICH_INTERACTIVE` | `pwa`, `native-shell`, `telegram-miniapp` | 12 | `json_body` | up to `COMMIT` |
| `RICH_CONSTRAINED` | `telegram-bot` | 8 | `callback_data` (64 B) | up to `COMMIT` |
| `ANNOUNCEMENT` | `web-push` | 0–2 | `notification_action` | **`NAVIGATE` / `HANDOFF` only** |
| `SPOKEN` | `realtime-voice` | 5 + overflow | `spoken_alias` | up to `COMMIT`, readback mandatory |
| `TEXT_ONLY` | `sms`, `email` | 1 | `signed_path_segment` | **`HANDOFF` only** |
| `PUBLIC_READ` | `web-public`, `public-community` | 2 | `json_body` | **`NAVIGATE` / `HANDOFF`** |
| `ANONYMOUS_CHAT` | `guest-chat` | 4 | `json_body` | **`REFINE` / `HANDOFF`** |

**CH1 — the tier ceiling is a maximum, never a permission.** A tier can only remove effect classes. Whether a surviving intent may be *actuated* is decided by the server-derived `VerificationLevel` against `requires.required_verification`, which is derived from the capability registry and policy, not from the tier and not from the emitter.
*Mechanism:* the fitter's CARRIER CEILING step subtracts; the verification floor is a separate, earlier subtraction and is re-evaluated at the gateway on submission.
*Evaluated at:* fitting (subtraction) and IntentGateway verification-floor gate (actuation).

**CH2 — web push carries `NAVIGATE` and `HANDOFF` only.** No `DRAFT`, `REQUEST_APPROVAL` or `COMMIT` intent is ever emitted onto a notification action, regardless of risk tier or reversibility.
*Mechanism:* the tier table above is a compiled constant in the fitter; `web-push` maps to `ANNOUNCEMENT` with a two-member effect allowlist.
*Evaluated at:* fitting, before the envelope is handed to the push adapter; and at the gateway, which refuses a `COMMIT` token submitted with `profile_id` of an `ANNOUNCEMENT` profile.

`[NON-NORMATIVE]` The first edition's ladder permitted a COMMIT on a notification when `risk_tier === 'low_write' && reversible`. A notification action list is device-resident, survives logout, is tapped outside any authenticated transaction, and is capped at 0–2 actions that some desktops never render. A commit there is a commit nobody verified. The stricter rule wins, and it is now the only rule.

#### 4.5.4 The fitting algorithm (normative)

`degrade(envelope, profile) → { envelope′, receipt }`, executed **server-side**, in this order:

1. **VERIFICATION FLOOR** — withhold every intent whose `requires.required_verification` exceeds the session's server-derived level. `reason: 'verification_floor'`. Each must be reachable via an emitted `HANDOFF` to a channel that can satisfy it.
2. **SECURE SURFACE** — withhold every intent touching a `SECURE_SURFACE_ONLY` field and every intent whose capability is on the never-chat-actuated list. `reason: 'secure_surface_only'`. Only `HANDOFF` survives.
3. **CARRIER CEILING** — withhold every intent whose effect exceeds the tier ceiling (§4.5.3). `reason: 'carrier_limit'`.
4. **PIN** — `pinned :=` intents at `priority: 0` (the escape verb, the sole `COMMIT`, the sole `HANDOFF`, the L11 extension remedy). If `|pinned| > max_intents`, **do not partially render**: emit instead a `LIMITATION` or `HANDOFF`-only envelope naming the route that can.
5. **FIT** — sort the remainder by `priority` ascending and drop from the tail until `|emitted| ≤ max_intents − 1`, reserving one slot for a **server-minted** `role: 'more'` intent whenever anything was dropped. A renderer never synthesises this; only the server mints an intent.
6. **BODY** — apply `max_table_rows`, `max_body_chars`, `max_options_inline`. Every reduction records `restored_by`. A `REPORT` with depth-2 sections in a non-rich tier collapses to `top_summary` (≤3) plus `fullscreen_intent`, never to a truncated hierarchy in a bubble.
7. **MINT TEXT** — `text_equivalent` is re-minted for the **degraded** envelope, so the portability rule holds on what was actually sent.
8. **SEAL** — `body_hash` and `envelope_seal` are computed **after** degradation. A degraded envelope is a first-class envelope.

*Mechanism for all eight:* one `fit()` function in the projection layer; adapters receive an already-fitted envelope and have no drop path.
*Evaluated at:* emission, once per delivery channel.

**CH3 — renderers never drop an intent.** A renderer may wrap, paginate, collapse a section, add an expander, or choose `INLINE`/`CARD`/`SHEET`. It may not change the intent set, re-rank a `COMMIT` into primary position, hide a `Limitation`, or hide a non-`KNOWN` Cell.
*Mechanism:* renderer conformance suite comparing the emitted intent set with the rendered control set, per profile.
*Evaluated at:* CI, per renderer.

#### 4.5.5 `maya.render.receipt/1`

```ts
interface RenderReceipt {
  contract: 'maya.render.receipt/1';
  profile_id: string; profile_version: number;
  render_tier: RenderTier;
  intents_minted: number;                 // before fitting
  intents_emitted: number;                // after fitting
  intents_withheld: Array<{
    role: WidgetIntent['role'];
    reason: 'capacity' | 'carrier_limit' | 'verification_floor'
          | 'bridge_absent' | 'policy' | 'secure_surface_only';
    reachable_via: string;                // REQUIRED: an emitted intent_token or route_key
  }>;
  body_reductions: Array<{
    path: string;                         // dotted path inside body
    reduction: 'summarised' | 'paginated' | 'masked' | 'omitted';
    restored_by: string;                  // REQUIRED: an emitted intent_token or route_key
  }>;
  text_equivalent_is_canonical: boolean;  // true whenever render_tier === 'TEXT_ONLY'
  escalation: { to_route_key: string; reason: FullscreenReason } | null;
  degraded_at: string;
}
```

**C4 — nothing withheld is unreachable.** Every `intents_withheld` and `body_reductions` entry must name a `reachable_via` / `restored_by` that is **present in the emitted envelope**. A receipt that cannot name one is a *failed* emission, not a degraded one: the server emits a `LIMITATION` or `HANDOFF`-only envelope instead.
*Mechanism:* the fitter asserts membership of every `reachable_via` in the emitted intent set ∪ route table, and throws rather than emitting.
*Evaluated at:* fitting, before sealing (gate G2).

**C5 — degradation is narrated.** Where anything was withheld or reduced, `text_equivalent.completeness_sentence` says so in prose: *«Показаны 3 из 11 окон»*, and how to get the rest.
*Mechanism:* the text minter reads the receipt; the sentence is generated, not authored.
*Evaluated at:* MINT TEXT step (7), and the A-21 parity gate.

**C6 — both envelopes are retained.** The undegraded envelope and the receipt are stored server-side under the same `widget_id`, in the intent-audit store under `T_AUDIT`. *"What did the user on SMS actually see?"* is answerable exactly.
*Mechanism:* the emission writer persists `{ composed, emitted, receipt }` as one row.
*Evaluated at:* emission.

#### 4.5.6 One token, five carriers

| carrier | encoding | hard limit | rule |
|---|---|---|---|
| `json_body` | `intent_token` verbatim | — | PWA, native shell, Mini App, guest chat, public read |
| `callback_data` | `w1.<widget10>.<intent6>.<sig8>`, base62 ASCII — **exactly 29 bytes** | **64 B** (Telegram Bot API) | §4.5.7 |
| `notification_action` | `intent_token` verbatim in the action id | `Notification.maxActions`, read at runtime, **default 0** | ceiling `NAVIGATE`/`HANDOFF` (CH2) |
| `spoken_alias` | deterministic match on `speech_aliases` ∪ `ordinal`, **pre-LLM**, resolved server-side | 5 + overflow | §4.7 |
| `signed_path_segment` | one `HANDOFF` deep link, token in a **signed path segment** | 1 | never a query parameter |

**CH4 — a token never travels in a query string.** Tokens go in signed path segments or POST bodies.
*Mechanism:* the link minter has no query-parameter branch; a lint forbids `?` followed by a token-shaped value in any emitted URL.
*Evaluated at:* link minting, and the emission validator over `text_equivalent` and route targets.

`[NON-NORMATIVE]` Query parameters are logged by proxies, land in history and leak in referrers — and in this codebase specifically they are the mount mechanism for the self-mounting overlays, because today's service worker opens `'/app/?tips=' + encodeURIComponent(d.master)`: a sender-chosen URL carrying a staff identifier in a query parameter.

#### 4.5.7 The Telegram encoding, stated exactly

```
callback_data := "w1" "." widget10 "." intent6 "." sig8
widget10      := base62{10}   // truncation of widget_id
intent6       := base62{6}    // per-envelope intent selector
sig8          := base62{8}    // truncated HMAC over (widget10 ‖ intent6 ‖ seal_key_version)
```

Length: `2 + 1 + 10 + 1 + 6 + 1 + 8 = 29` ASCII bytes. The Telegram `callback_data` ceiling is 64 bytes, so the encoding is fixed-width with 35 bytes of headroom. Entropy at `log2(62) ≈ 5.954` bits per character: `widget10 ≈ 59.5` bits, `intent6 ≈ 35.7` bits, `sig8 ≈ 47.6` bits.

**CH5 — the budget check is static and must be green in CI.** The encoder emits a fixed-width string; a test asserts `length === 29` for a generated corpus and asserts that no other encoder writes `callback_data`.
*Mechanism:* encoder unit test plus a grep-level ban on direct `callback_data` construction outside the encoder.
*Evaluated at:* CI, per build (gate G5).

**CH6 — `sig8` is an integrity check, not the authority boundary.** It defends against mangled, truncated and casually-guessed callback payloads. **Authority is decided by the `IntentRecord` lookup, the principal-binding comparison and the verification floor at the gateway** — all of which run on every submission regardless of whether `sig8` verified.
*Mechanism:* the gateway performs the record lookup and principal comparison unconditionally; `sig8` failure short-circuits earlier but its success grants nothing.
*Evaluated at:* IntentGateway, every submission.

`[NON-NORMATIVE]` 47.6 bits is stated rather than rounded up into a security claim. The reason the token can be 29 opaque bytes at all is that it names nothing: the 64-byte ceiling is precisely what forces the `IntentRecord` store to exist, and is the constraint a self-describing sealed blob cannot satisfy.

#### 4.5.8 The same envelope in six carriers `[NON-NORMATIVE]`

One `TIME_SLOT_SELECTOR`, source `booking.availability.read`, eleven free slots, `freshness_class: 'live'`, effect ceiling `DRAFT` — no `COMMIT` token for this booking exists anywhere in the system at this moment.

| carrier | what is emitted | receipt |
|---|---|---|
| **PWA / native shell** (`RICH_INTERACTIVE`) | grouped by day, 11 slot chips, `more`, `widen_window`, `none_fit`, escape | `intents_emitted: 12`, nothing withheld |
| **Telegram inline keyboard** (`RICH_CONSTRAINED`) | 5 slots (2 per row) + `Другое время` + `Не подходит` + `Отмена` alone on the last row | 6 withheld, `reason: 'capacity'`, all `reachable_via` the `more` token; refinement edits the same message |
| **Web push** (`ANNOUNCEMENT`) | *«Есть 11 свободных окон на этой неделе»* + one `NAVIGATE` opening the chat message at `correlation.message_id` | 10 withheld, `reason: 'carrier_limit'`, reachable via the navigate token |
| **Voice** (`SPOKEN`) | `speech.lead` + five ordinals + `overflow_say`; saying «второе» resolves to the token a thumb would have sent; result is a `DRAFT`, and the confirmation is a separate envelope with readback | 6 withheld, reachable via the overflow token |
| **SMS** (`TEXT_ONLY`) | `text_equivalent.body`, three itemized lines, *«Показаны 3 из 11 окон»*, one signed deep link | `intents_emitted: 1` (HANDOFF) |
| **Guest chat** (`ANONYMOUS_CHAT`) | slots render as read-only Cells; every slot intent fails the verification floor at `DRAFT`; one HANDOFF *«Войдите, чтобы забронировать»* + escape | 11 withheld, `reason: 'verification_floor'` |

Six carriers, one `IntentRecord` table, one `frozen_nouns` set, one fresh read at the noun-resolution gate, and one audit line whose shape does not reveal which carrier produced it.

---

### 4.6 Native reality

**NT1 — there is no native source in this repository, and none is designed.** "Native" is (a) an out-of-repo Capacitor shell for iOS and (b) an Android TWA (`pro.malesthetic.twa`), **both loading the same web bundle**. `pwa` and `native-shell` share one profile family (`RICH_INTERACTIVE`) and differ by exactly one optional block, `native_bridge`. There is **one shared web interaction contract**; platform-specific *shell* behaviour (splash, status bar, app icon, haptics, share sheet, deep-link registration) is permitted and is not part of it.
*Mechanism:* `ChannelId` has no member that implies a second interaction model; the fitter's inputs for `native-shell` are the `pwa` profile fields plus `native_bridge`.
*Evaluated at:* profile registration (a `native-shell` profile that differs from `pwa` in any field other than `native_bridge`, `a11y_env`, `motion`, `text_scale`, `color_scheme`, `viewport_min_css_px` is refused).

**NT2 — `required` is the empty tuple, enforced at the type level.** No business capability may be gated on a plugin.

```ts
interface BundleBridgeRequirements {
  required: [];                       // NORMATIVE: the empty tuple. The illegal state cannot be written.
  optional: BridgeKey[];
  degradations: Record<BridgeKey, {
    when_absent: 'web_fallback' | 'hide_decoration' | 'cell_unavailable' | 'handoff';
    fallback_ref?: string;            // route_key or web API used instead
    cell_reason?: ReasonCode;
  }>;
}
```

*Mechanism:* the type; plus a lint banning `window.Capacitor.Plugins.*` access outside the single `bridge(key)` accessor.
*Evaluated at:* compile/lint, per build (gate G6).

`[NON-NORMATIVE]` This is not aspiration: `app-tenant.html` already runs inside the shell with no `MayaRuntime`, no `MayaNfcWriter` and no `AppIcon`, and it works. That is production evidence that no business capability is plugin-gated.

**NT3 — capability negotiation, never platform detection.** `isNativePlatform()` is a platform predicate and must never be used as a capability predicate. Negotiation runs once at boot in one of three modes: `manifest` (the shell posts `NativeBridgeManifest` before first paint), `probe` (call the declared side-effect-free probe once, cache for the session), `assumed_absent` (shell present, no manifest, no probe ⇒ `'unknown'`, treated as absent).
*Mechanism:* `BridgeSession.resolved: Record<BridgeKey, 'available'|'absent'|'unknown'>` computed by one negotiator; `bridge(key)` reads only that map.
*Evaluated at:* app boot, once per session; the result is folded into `ChannelProfile.native_bridge`.

**NT4 — a bridge capability may affect `Presentation` and `fullscreen_detail`; it may never affect `intents`.** If NFC is absent the "write a card" intent is still emitted — its `HANDOFF` resolves to a web route instead. A plugin changes *how* or *where*, never *whether*.
*Mechanism:* `native_bridge` is an input to the BODY and escalation steps of the fitter only; the intent set is computed before it is read, and the property test in C1 covers it.
*Evaluated at:* fitting; CI property test.

**NT5 — absence is a `Cell`, never a failure.** `Cell<T>{ state: 'UNAVAILABLE', reason_code: 'OUT_OF_SCOPE', label: 'На этом устройстве недоступно — откроется в браузере', next_intent_ref: <web handoff> }`. Never a red banner, never an error icon, never an auto-retry. `'unknown'` from mode 3 resolves to exactly this shape.
*Mechanism:* the M1 anti-error lint and the renderer's five-branch Cell requirement.
*Evaluated at:* render; renderer conformance suite (gate G7).

**NT6 — the Android TWA declares `shell.kind: 'android_twa'` and zero capabilities.** There is no Capacitor bridge in a TWA, so it cannot report; its profile is build-stamped (`negotiation_mode: 'assumed_absent'`, every key `'absent'`), not negotiated.
*Mechanism:* build stamp in the TWA's bundle configuration.
*Evaluated at:* boot.

**NT7 — the shell supplies no authority, ever.** `NativeBridgeManifest` is subject to the forbidden-key validator. A shell cannot declare a role, a session, a tenant or a verification level. `runtime.preview_access` is classified **presentation-only**; the five existing client-preview enforcement points remain in place, unconsolidated, and none of them may take a bridge value as input.
*Mechanism:* forbidden-key validator over the manifest; a test asserting the five call sites still exist and that none reads `BridgeSession`.
*Evaluated at:* manifest ingestion, and CI per build.

**NT8 — a deep link lands in the router, never in an overlay, and parses nothing business-shaped.** The `appUrlOpen` handler extracts `{ route_key, opaque_handle }` only. It must not read a staff id, a record id, a tenant slug or a price from the URL. Until the link resolves server-side, the app shows a `PROGRESS` body, not a screen. An unknown `route_key` renders `text_equivalent.body`, never a different screen.
*Mechanism:* the handler's parser returns a two-field struct and the router's route table is closed; an unknown key has no branch that reaches a screen constructor.
*Evaluated at:* link handling, per event (gate G12).

`[NON-NORMATIVE]` The three URL schemes (`mayaos://`, `ru.mayaos.app://`, `pro.malesthetic.app://`) are aliases of one transport, not three capabilities. NT8 is also the transport-layer expression of the ban on self-mounting overlays.

---

### 4.7 Voice

**V1 — voice is a carrier, and there is no voice branch below the transcript.**
`audio → POST /api/ai/transcribe → transcript:string → deterministic match on `speech_aliases` ∪ `ordinal` (pre-LLM) → the same `intent_token` a thumb would have sent → the same gates.`
An unmatched transcript takes the natural-language path, identical to typed text. A spoken utterance and a typed sentence with identical bytes are indistinguishable after the transcription hop: same token, same authority check, same audit line.
*Mechanism:* the resolver is a single function shared by the typed and spoken paths; the transcription endpoint returns a bare string and holds no capability handle.
*Evaluated at:* resolution, before any LLM call; CI gate G8 asserts no capability is reachable by voice and not by text, or the reverse.

**V2 — voice never raises `VerificationLevel`.** Speaking is not authenticating. Voice biometrics are not in evidence in this repository and must not be inferred into existence.
*Mechanism:* `VerificationLevel` is derived from the session by the AuthorityResolver, which takes no audio or transcript input — the value is not constructible from a voice event.
*Evaluated at:* authority derivation, per request.

**V3 — never-chat-actuated is never-voice-actuated.** Consent grant/withdraw, marketing revoke, identity unbind, register export, history erasure: MAYA may explain them aloud and may offer the handoff. The accept/decline control is not speakable.
*Mechanism:* the same capability list and the same verification floor evaluated on the resolved intent — the voice path resolves to an intent and is then subject to every check the tap is.
*Evaluated at:* gateway (gate G9).

**V4 — every `COMMIT` reached by voice requires readback.** `presentation.speech.readback_template` is spoken verbatim and an affirmative match is required before the token is consumable. The user confirms **the server's sentence**, not their own.
*Mechanism:* `requires.requires_readback` is set from the registry for spoken carriers; the gateway refuses a `COMMIT` submission from a `SPOKEN` profile with no readback confirmation reference.
*Evaluated at:* gateway, on submission.

**V5 — the PII boundary is inherited, not re-derived.** Audio is not stored. The transcript is **not written to application logs**; only elapsed milliseconds and the audio byte count are logged. When the transcript is submitted it is stored exactly once, in the timeline store, as `spoken_transcript`, classified `CONVERSATION_CONTENT` (§4.4.3) and erasable.
*Mechanism:* the speech service logs two numbers; a log-redaction test asserts no transcript-shaped string reaches the log sink; the erasure job covers `spoken_transcript` by classification.
*Evaluated at:* speech service unit test and the RT6 erasure fixture.

**V6 — voice is refused during contact collection and any PII lock.** While `input_lock !== 'none'` on a body containing any field with `sensitivity: 'pii'` or `'SECURE_SURFACE_ONLY'`, voice capture is refused with an explanatory Cell, not an error.
*Mechanism:* the capture gate reads the active envelope's `input_lock` and field sensitivities before arming the microphone.
*Evaluated at:* capture arming (gate G9).

`[NON-NORMATIVE]` This generalises the Telegram channel's proven rule — voice refused during contact collection — rather than inventing a new one.

**V7 — the microphone is never auto-armed.** Every entry into `listening` requires an explicit user gesture in that session.
*Mechanism:* the capture API is called only from a user-gesture handler; a lint forbids capture calls outside gesture handlers.
*Evaluated at:* lint, per build.

**V8 — `listening` and `recording` are distinct states, and the distinction survives reduced motion, forced colours and 200 % text.** `listening` = the microphone is hot. `recording` = bytes are committed to leaving the device. Under `motion: 'reduced'` the difference is carried by a *different affordance* (a discrete three-step level meter plus a text label), never by removing the indicator.
*Mechanism:* the reduced-motion snapshot test asserts a distinct, non-motion indicator per state; A-9 (§4.8) forbids removing information with motion.
*Evaluated at:* renderer conformance suite.

**V9 — the escape verb is always live.** «отмена» / «стоп» / «хватит» are in `speech_aliases` of every `priority: 0` escape intent and are matched before any other candidate. `input_lock` suppresses routing while composing but never suppresses escape.
*Mechanism:* the matcher evaluates escape aliases first, outside the `input_lock` branch.
*Evaluated at:* resolution, per utterance.

**V10 — barge-in is mandatory while MAYA is speaking.** Speech onset, a tap or any key interrupts output immediately and returns to `listening`.
*Mechanism:* the output player exposes an interrupt handle bound to all three event sources.
*Evaluated at:* renderer conformance suite.

**V11 — voice-disabled is the default, not a degradation.** Every voice affordance has a typed equivalent that is present, visible and equally prominent whether or not a microphone exists. Voice becomes unavailable when permission is denied, `getUserMedia` or `MediaRecorder` is missing, no supported MIME type negotiates, `audio.capture_pcm16` is absent and the web path also fails, or the user turned it off. In every case the surface renders `Cell{ state: 'UNAVAILABLE', reason_code: 'OUT_OF_SCOPE', label: 'Голос недоступен на этом устройстве — напишите сообщение' }`. Neutral, never red.
*Mechanism:* the typed path is the primary path in the DOM order (A-3 reading order); the unavailability Cell is the single failure shape, covered by the M1 lint.
*Evaluated at:* render; renderer conformance suite.

**V12 — no duplex voice semantics are specified, because none is evidenced.** What exists is bounded push-to-talk transcription (one file ≤ 1 MB or base64 PCM16/16 kHz, request/response). Authority, budget and barge-in semantics for a streaming duplex session are **not** designed here; when such a path is built it enters through V1's funnel or it does not enter.
*Mechanism:* none is claimed. This is a scope boundary.
*Evaluated at:* n/a.

---

### 4.8 The accessibility floor — `maya.a11y.floor/1`

**Target: WCAG 2.2 Level AA, normative and CI-gated.** Not a review checklist.

```ts
interface A11yEnvironment {            // reported by the renderer; PRESENTATION ONLY
  reduced_motion: boolean;
  forced_colors: boolean;
  text_scale: number;                  // 1.0 … 3.0
  pointer: 'fine' | 'coarse' | 'none';
  keyboard_only_hint: boolean;         // a hint. NEVER a capability gate.
  caption_preference: boolean;
}

interface A11yBlock {                  // presentation.a11y
  role_hint: 'group' | 'radiogroup' | 'listbox' | 'table' | 'grid' | 'document'
           | 'status' | 'progressbar' | 'form' | 'img' | 'link';
  label: string;
  description: string;
  reading_order: InteractiveRef[];     // EVERY interactive element, in DOM order
  live_region: 'off' | 'polite' | 'assertive';
}

type InteractiveRef =
  | { k: 'option'; id: string }        // OptionItem.option_id
  | { k: 'field';  id: string }        // FormField.field_key
  | { k: 'intent'; id: string }        // intent_token (row_intents, bulk_intents,
                                       //   detail/drill/export/fullscreen/commit/…)
  | { k: 'row';    id: string }        // TableSpec row key
  | { k: 'entry';  id: string }        // SCHEDULE entry_ref
  | { k: 'section'; id: string };      // REPORT section_id
```

**A-0 — `reading_order` is typed so it can actually cover everything.** The first edition typed it as option ids and field keys, which excluded schedule entries, table row intents, bulk intents, drill/export/fullscreen intents and settings apply/discard — for at least eight of the seventeen kinds the coverage rule was unsatisfiable as typed. `InteractiveRef` closes that.
*Mechanism:* emission validator — the set of `InteractiveRef`s must equal the set of interactive elements derivable from the body and the emitted intent list, exactly (no missing, no extra).
*Evaluated at:* mint.

#### 4.8.1 Clauses

| # | clause | WCAG 2.2 | mechanism / evaluated at |
|---|---|---|---|
| **A-1** | **Every intent renders as a real `button`** (or `a` for a `NAVIGATE` to a route). A click handler on a non-interactive element is a contract violation. The intent list is the only interactive surface, so this is mechanically checkable. | 2.1.1, 4.1.2 | renderer conformance suite + lint; per build |
| **A-2** | Accessible name = `intent.utterance`, verbatim. The visible `intent.label` must be contained in it. | 2.5.3 | CI string check; per emission fixture |
| **A-3** | `a11y.reading_order` covers every interactive element and **DOM order equals it**. | 2.4.3 | validator (A-0) + conformance suite; mint and render |
| **A-4** | Focus visible at ≥ 3:1 against both adjacent colours; never obscured by a sticky header, sheet or keyboard inset. | 2.4.7, 2.4.11 | visual regression matrix; per build |
| **A-5** | No keyboard trap. `SHEET` density traps focus within the sheet and returns it to the invoking control on escape. The escape intent is always keyboard-reachable. | 2.1.2 | conformance suite |
| **A-6** | Roving tabindex within an option group; arrows move, Enter/Space select. Eleven slots are one tab stop, not eleven. | 2.1.1, 1.3.1 | conformance suite |
| **A-7** | **Non-`KNOWN` Cell state is never colour-only.** Every non-`KNOWN` Cell contributes a text token to its accessible name («не измерено», «источник не подключён»). Dimming is additional, never sole. | 1.4.1 | the five-branch renderer test |
| **A-8** | **Charts.** `table_equivalent` is required, reachable by keyboard as a sibling disclosure (never hover-only). Series distinguished by shape/dash **and** direct label, not hue. `gap_policy: 'RENDER_GAP'` renders a visible break plus a text note — **never a zero**. | 1.1.1, 1.4.1 | CHART conformance |
| **A-9** | **Reduced motion removes animation, never information.** No parallax, no auto-playing motion, no motion-only state; a state that exists only as motion is invisible to a third of the matrix. | 2.3.3 (AAA, adopted) | `prefers-reduced-motion` snapshot tests |
| **A-10** | **Text scale.** Legible and operable at `text_scale: 2.0` and at 320 CSS px reflow with no horizontal scroll. Only tables, diagrams and code scroll horizontally, each in its own container. Text-spacing overrides must not clip. | 1.4.4, 1.4.10, 1.4.12 | viewport matrix |
| **A-11** | **Target size** floor 24 × 24 CSS px; product standard 44 × 44 on `pointer: 'coarse'`. No capability reachable only by drag. | 2.5.8, 2.5.7 | layout test |
| **A-12** | **Status messages** announce via `aria-live="polite"`. `assertive` is reserved for a `Limitation` of severity `blocking`; `role="alert"` is **never** bound to a non-`KNOWN` Cell. | 4.1.3 | lint + conformance suite |
| **A-13** | **Timing.** Every envelope with `input_lock !== 'none'` has `on_expiry: 're_resolve'` (L10); `collapse_to_summary` requires the pinned extension remedy (L11). A user is never punished for reading slowly. | 2.2.1 | emission validator (L10/L11); mint |
| **A-14** | **Step-up authentication is not a cognitive-function test.** `STEP_UP_VERIFIED` is satisfied by possession — device biometric, passkey, one tap in an already-verified channel — never by a puzzle, transcription task or timed memory test. This constrains how the never-chat-actuated handoffs may be built. | 3.3.8 | design review gate at the handoff package |
| **A-15** | **Redundant entry.** A `FORM` prefills from `FormField.current`; a user never retypes what the system already holds — except where `sensitivity: 'SECURE_SURFACE_ONLY'` forbids display. | 3.3.7 | FORM conformance |
| **A-16** | **`A11yEnvironment` is never read by authority.** No capability, intent, verification or PII decision may read it. A screen-reader user has identical authority. | — | forbidden-key validator + a test asserting no authority code path imports the profile's `a11y_env` |
| **A-17** | **Data tables.** `TableSpec` renders with a caption (`segment_label` / `title`), programmatic column headers from `columns[].label`, row headers where a key column exists, and **row-group headers when `group_by` is set**. `row_intents` activate through a real control inside the row, never by a click handler on the row element. Bulk intents sit outside the table and carry `audience_size` in the accessible name. | 1.3.1, 4.1.2 | table conformance; per emission |
| **A-18** | **Fullscreen routes are inside the floor.** A `presentation.fullscreen_detail` route renders envelopes and is bound by A-1 … A-17; its route shell (header, back affordance, sheet chrome) is bound by A-4, A-5, A-10, A-11. | all | route conformance suite — the same suite, run against routes |
| **A-19** | **The non-chat fallback editor is mandatory where exactness is.** Any envelope carrying a `FORM` body, or any intent whose `input_schema` contains a free `string` or `number` field, MUST carry a non-null `presentation.fullscreen_detail` with `reason ∈ {'exact_configuration','accessibility','correction','audit'}`. Chat-first is not chat-only, and the surfaces with the strongest audit and correction obligations are exactly the ones that may not have an optional fallback. | 3.3.7, 3.3.8 | emission validator; mint |
| **A-20** | **Voice-disabled parity.** Every capability reachable by voice is reachable by typing and by keyboard, and the typed control is present whether or not a microphone exists (V11). | 2.1.1 | gate G8 |

**A-21 — the parity gate, which is the whole floor in one test.** For every emitted envelope × every registered profile: render at `TEXT_ONLY`; assert every fact appears; every retained intent is reachable by a typed reply; every non-`KNOWN` Cell is stated with its `label`; every `intents_withheld` entry names a reachable route. **If `text_equivalent` cannot express the widget, the widget may not be emitted.**

**The artefact under test is one artefact.** `presentation.text_equivalent` is server-minted by a pure function, covered by `body_hash`, and is simultaneously: the screen-reader description, the SMS body, the email body, the spoken transcript source, the archival summary after `retention_sec` (FR7), and the audit rendering used in replay (FR6). **That identity is what makes accessibility testable by one mechanism instead of five** — there is no second "accessible version" that can drift, because there is no second version.
*Mechanism:* A-21 runs over stored emission fixtures; the text minter is a pure function with no renderer input.
*Evaluated at:* CI, per build (gate G10).

#### 4.8.2 Per-kind floor

| kind | `role_hint` | keyboard model | text alternative | live region | non-colour state |
|---|---|---|---|---|---|
| `CHOICE` | `radiogroup` (single) / `listbox` (multi) | roving tabindex; ←↑→↓ move, Enter/Space select, Home/End | `itemized` + `options_list` | `off` | selection is announced, not coloured |
| `SERVICE_SELECTOR` | `listbox` | as `CHOICE` | each option's duration and price in the accessible name | `off` | `requires_consultation` as a text token |
| `STAFF_SELECTOR` | `listbox` | as `CHOICE` | `nearest_availability` in the accessible name | `off` | — |
| `TIME_SLOT_SELECTOR` | `grid` | arrows within a group; PageUp/PageDown across groups; Home/End; Enter selects | one itemized line per group + `completeness_sentence` | `polite` on re-resolve | availability as «свободно» / «занято» / «неизвестно» text tokens |
| `BOOKING_CONFIRMATION` | `document` | focus lands on the heading; commit/amend/cancel are buttons in `reading_order`; escape always reachable | full `itemized` of every line and measure; `readback_template` is the accessible description | `polite` | policy notices are prose, not icons |
| `SCHEDULE` | `grid` | lane = row header, time = column header; arrows navigate; Enter opens `detail_intent`; entry controls are buttons inside cells | one line per lane, then per entry | `polite` | `state` as a text token; `pii_masked` stated in prose |
| `CLIENT_LIST` | `table` | A-17; row intents are in-row buttons; bulk intents outside the table | caption + header row + one line per row | `polite` on page change | segment and masking stated in text |
| `METRIC` | `group` | headline metric first in `reading_order`; `drill_intent` a button | every `Measure` formatted with unit and `basis` | `off` | `comparison.direction` as a word, not an arrow alone |
| `CHART` | `img` + adjacent `table` | A-8; table reachable by keyboard from the chart | `table_equivalent` in full | `off` | shape/dash + direct label |
| `REPORT` | `document` | headings navigable (depth 1 → h3, depth 2 → h4 inside chat); `fullscreen_intent` a link | `top_summary` + section narratives + tables | `off` | — |
| `STRATEGY_OPTIONS` | `radiogroup` | as `CHOICE`; **NO_ACTION is an option in the same group**, never styled as dismissal | each alternative's title, reasoning and expected-effect Cell | `off` | `recommended` is a text token in the accessible name and **never a pre-selection** (no checked state at render) |
| `APPROVAL` | `document` | approve/reject are buttons; `audience_size`, `risk_tier` and reversibility appear in the approve control's accessible name | full effect preview, audience maths and expiry | `polite` | `state` as a word |
| `PROGRESS` | `progressbar` when determinate, else `status` | cancel is a button; steps are a list | per-step label and state | `polite`, throttled to ≥ 5 s between announcements | step state as a word; `blocked_unknown` is neutral |
| `LIMITATION` | `status` | remedy intents are buttons | headline + detail + codes | `assertive` **iff** `severity === 'blocking'`, else `polite` | severity as a word |
| `SOURCE_STATUS` | `table` | reconnect intents are buttons | one line per source with `as_of` and impact | `polite` | `state` as a word |
| `SETTINGS_DRAFT` | `table` + `form` | diff rows read «было X, станет Y»; apply/discard/editor-handoff are buttons in `reading_order` | the whole diff, with `effect_text` and reversibility | `polite` | reversibility as a word |
| `FORM` | `form` | labels programmatically associated; Enter does not submit a multi-field form | field labels, help, current values, and the justification sentence | `polite` | refusals render as a `Limitation` in prose; focus moves to the first refused field. **There is no error styling, because there is no error kind** |

*Mechanism for the table:* it is compiled into the renderer conformance suite as a per-kind fixture set; a kind with no row cannot pass A-21 because the suite has no branch for it — which is also the enforcement that a new kind cannot be added without an accessibility row.
*Evaluated at:* CI, per build.

---

### 4.9 Proactive emissions

A proactive envelope is minted by the scheduler for one of the canonical moments, with no human turn preceding it. Four properties are claimed, three of them mechanically, and the fourth is named honestly as review discipline.

#### 4.9.1 PR1 — the effect ceiling, stated once

**`origin.trigger === 'proactive'` ⇒ every intent's `effect ∈ {NONE, NAVIGATE, REFINE, HANDOFF}`.** No `DRAFT`. No `REQUEST_APPROVAL`. No `COMMIT`. No `STRATEGY_OPTIONS` body.
*Mechanism:* emission validator, one predicate over the intent list.
*Evaluated at:* mint. **This is the only statement of the proactive ceiling in this contract**; no other section restates it, and any document that does is wrong rather than additional.

`[NON-NORMATIVE]` The first edition capped proactive at `DRAFT` while two sibling documents capped it at `REFINE`, and the loosest of the three was the normative one. A scheduled `DRAFT` is a server-owned booking, settings or audience draft created with no human in the loop — that is the difference between presenting information and starting work.

#### 4.9.2 PR2 — no autonomous loop through the proactive door

**A proactive envelope may not carry a capability that opens or continues a C9 run, and `IntentRecord.run_ref` must be `null` for every record minted from a proactive envelope.**
*Mechanism:* (a) the capability registry marks run-opening capabilities; the emission validator refuses them on a proactive envelope. (b) A standing query — *any `IntentRecord` with a non-null `run_ref` whose emitting envelope had `trigger: 'proactive'`* — is one of the named leak tests, run in CI against recorded emissions.
*Evaluated at:* mint (a), CI over recorded emissions (b).

Companion leak queries, named now and run later: a proactive envelope that produced a run with no human-actuated intent; an `AgentTask` persisted with an autonomy level above shadow; any `IntentRecord` with effect `DRAFT` or `COMMIT` whose emitting envelope was proactive.

#### 4.9.3 PR3 — provenance: the content existed before the emission

This is the structural carrier the first edition lacked. `authority_basis: 'pre_authorized_presentation'` was a single-value literal the emitter wrote, and the invariant checked only that the string was that string — a scheduler could read live data, compose a growth plan nobody asked for, and emit it under a literal asserting it was pre-authorised.

```ts
interface ProactiveProvenance {        // REQUIRED when trigger === 'proactive'
  artefact_ref: string;                // a canonical row: Opportunity, approval object,
                                       //   closed-period report, appointment, shift
  artefact_kind: 'opportunity' | 'approval' | 'closed_report'
               | 'appointment' | 'shift' | 'consent_record';
  artefact_created_at: string;         // RFC3339, from the canonical row
  narrative_source: 'moment_template' | 'stored_artefact';
  narrative_hash: string;              // sha256 of the narrative actually rendered
  moment_template_id: string | null;   // REQUIRED iff narrative_source === 'moment_template'
}
```

**PR3a — the referenced artefact must predate the emission.** `artefact_created_at < lifecycle.issued_at`, and every Cell in the body must carry `as_of ≤ artefact_created_at` or evidence from the referenced artefact.
*Mechanism:* emission validator comparing timestamps read from the canonical row (not from the emitter's claim — the validator re-reads the row by `artefact_ref`).
*Evaluated at:* mint.

**PR3b — narrative text has exactly two legal sources, and composition is not one of them.** Either (i) `moment_template`: a frozen server template from the closed moment-template registry, with numerals interpolated only from `Measure`s in the body; or (ii) `stored_artefact`: a verbatim copy of a narrative field on the referenced row, with `narrative_hash` equal to the hash of that stored field.
*Mechanism:* the validator recomputes `narrative_hash` — against the template render for (i), against the stored field re-read from the canonical row for (ii) — and refuses on mismatch. Newly-composed strategy is not expressible because there is no third source.
*Evaluated at:* mint.

**PR3c — the delivery permission is re-evaluated at delivery, not at mint.** `notify_pref_key` must resolve in the notification-consent registry, quiet hours are applied, and `dedupe_key` must be unique for the moment's `once_per` window.
*Mechanism:* the delivery adapter re-reads the consent key and the quiet-hours window immediately before handing bytes to the channel; a mint-time value is not sufficient and is not used.
*Evaluated at:* delivery, per channel, per emission.

**PR4 — what is *not* mechanically proven.** PR3 proves **provenance** — that the facts and the words existed in canonical storage before the emission. It does **not** prove that presenting this artefact to this principal at this moment is *appropriate*. `[NON-NORMATIVE]` That judgment lives in the moment registry: which moments exist, what each one is allowed to say, and to whom. It rests on review discipline at the point a moment is added to the registry, and this contract does not fake a mechanism for it. The honest boundary is: **provenance is enforced; editorial judgment is reviewed.**
*Mechanism:* none claimed for the judgment. The registry's review is a package gate, not a runtime check.
*Evaluated at:* moment-registry review, when a moment is added or its template changes.

#### 4.9.4 PR5 — placement and silence

**PR5a — a proactive envelope is never pinned.** `Lifecycle.timeline_placement` has exactly one member, `'chronological'`. Persistent position is not expressible for any envelope, proactive or otherwise.
*Mechanism:* the type — there is no pinned member to write. This is enforced by non-existence in the strict sense: the value cannot be constructed.
*Evaluated at:* compile time; the emission validator additionally rejects an unknown literal.

**PR5b — a proactive emission may render nothing, and silence is the correct output.** Each moment template declares `required_cells: string[]`. If any required Cell resolves to a non-`KNOWN` state at compose time, the emission is **suppressed**: no envelope, no empty card, no placeholder, no failure message. A `SuppressedEmission { moment, dedupe_key, suppressed_at, unresolved_cells[] }` row is written to the intent-audit store.
*Mechanism:* the composer's suppression branch, driven by `required_cells`; the audit row is the evidence that silence was chosen rather than lost.
*Evaluated at:* compose, before sealing.

`[NON-NORMATIVE]` A greeting that says «не удалось загрузить» every morning would do more damage than no greeting at all. Suppression is also consistent with the rule that UNKNOWN is never rendered as failure: not rendering is not the same as rendering a failure, and the audit row means the difference is observable.

**PR5c — a proactive emission carries no acknowledgement affordance without a canonical owner.** See DR4 and `GAP-ATTENDANCE-CONFIRM`.
*Mechanism:* P2, enforced by the emission validator.
*Evaluated at:* mint.

---

### 4.10 What this section does not prove `[NON-NORMATIVE]`

1. **Freezing is safe; it is not fresh.** Scrolled-back numbers are stale by construction and the reader must use `reread_intent` to refresh. That is the cost of D5-A and it was paid deliberately.
2. **The retention numbers are decisions, not derivations.** 180 / 1095 days and the per-kind body ceilings are stated here because D5 requires the storage shape to be fixed before data exists. They are defensible, not inevitable; a tenant may shorten them and nobody may lengthen them.
3. **RT7 is a boundary, not a guarantee.** Erasing conversation content does not exercise a data subject's rights against consent records, appointments or loyalty balances. Three of the eight gap-ledger entries are exactly those missing surfaces.
4. **Three bundles wear one profile name.** `app.html`, `maya-os-site/index.html` and `app-tenant.html` are three builds with three plugin expectations and three deep-link registrations. A `ChannelProfile` describes a renderer; convergence is a prerequisite of this contract, not a consequence of it — and nothing may be deleted to achieve it before capability parity is green.
5. **The shell manifest cannot be verified from this repository.** `NativeBridgeManifest` needs an out-of-repo Capacitor change. Until it ships, negotiation runs in `probe` or `assumed_absent`, and `'unknown'` must remain a legal, non-alarming resolution — which is why NT5 exists.
6. **Push action availability is unknowable in advance.** `Notification.maxActions` varies by browser and OS and some desktops render none. CH2 makes that not matter: a push whose actions all vanish still works, because its only intent was a navigation and the notification body is already the canonical text.
7. **Renderer sandboxing is a convention until there is a build.** FR1's import-graph enforcement needs a build pipeline; the shipping frontend is a hand-edited single file with no sources and no `build.js` in the repository. Until then FR1 is enforced by the timeline endpoint's contract test alone, which is weaker than the pair.
8. **A-14 and A-19 constrain surfaces that do not exist yet.** They bind the handoff and fallback-editor packages when those are built; they bind nothing today.

---

# Annex A — Prerequisites, build status and scope rulings

*Appended to MAYA WIDGET CONTRACT v1. Normative.*

---

## A.0 Status, precedence and verification method

**A0.1 — status.** This annex is **normative**. It adds no rule to §§1–4 and reverses no ruling of Section 0. It does three things Section 0 leaves implicit and one thing Section 0 explicitly escalated: it states, per component, whether the mechanism a rule names exists in the repository today; it defines the status that a rule with an absent mechanism carries and the fail-closed default that status compels; it rules on the schema-scope constraint; and it records the repository defects no clause of this contract can close.

**A0.2 — precedence.** **Section 0 > Annex A > §§1–4.** Where Annex A and Section 0 differ on a *ruling*, Section 0 governs. Where Annex A and Section 0 differ on a *verified fact about the repository*, Annex A governs and the divergence is recorded in the row (one such divergence exists: §A1.6, `NEVER_CHAT_ACTUATED`). Where Annex A and §§1–4 conflict, Annex A governs.

**A0.3 — what this annex changes about the certification counts.** The residual certification finding is dominated by one class: *the contract correctly specifies a mechanism whose component does not exist yet.* That is not a contradiction in the contract; it is a specification ahead of its implementation. Left unmarked it reads as an unproven claim about the running system, and the owner's bar is zero. §A1 marks every such component. §A2 converts the mark into a binding rule with a fail-closed default. After §A1 and §A2, a rule naming an absent mechanism is no longer an unproven claim — it is a **declared prerequisite with a fail-closed default**, which is a checkable property.

**A0.4 — verification method.** Every status in §A1 and every defect in §A4 was verified by `grep` at the time of writing, against:

| Root | What |
|---|---|
| `/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/maya-identity-consent` | canonical repository, branch `codex/maya-identity-consent-20260913`. Carries `maya-saas-backend/src/orchestration/c9.*`, `src/action-engine/*`, `prisma/schema.prisma` (116 models, 97 migrations). Read-only for this cycle. |
| `/Users/stanislavmosin/Desktop/Projects/maya-platform` | primary working tree — `ai администратор/`, `smm_bot/`, `сайт и приложение/`, `maya-os-site/`, `beget_remote_snapshot_2026-06-28/`. |

Paths inside tables are repository-relative to one of those two roots. A count of **0** below means zero occurrences of the identifier in any `.ts`, `.tsx`, `.prisma`, `.js`, `.py`, `.php` or `.html` file under the stated root, excluding `node_modules`.

**A0.5 — the umbrella fact.** The widget layer does not exist in any form. Verified, all under `maya-saas-backend/src`, all **0 occurrences**: `WidgetEnvelope`, `WidgetIntentSubmission`, `IntentRecord`, `intent_token` / `intentToken`, `body_hash` / `bodyHash`, `envelope_seal` / `envelopeSeal`, `widget_id` / `widgetId`, `WIDGET_CAPABILITY_POLICY`, `CONTROL_REGISTRY`, `NEVER_CHAT_ACTUATED`, `capability_gap_ref`, `frozen_nouns`, `ErasureClass`, `RenderReceipt`, `ChannelProfile`, `api/widgets`. No Prisma model matches `widget|timeline|emission|intent` (`C9WorkReceipt`, `prisma/schema.prisma:4012`, is the C9 orchestration work receipt and is **not** the contract's receipt store). The only file matching `*widget*` semantics is `src/ai-tools/chat-report-card.ts`, whose `ChatReportWidget` / `widget_data` shape is the present-day AI report card and is unrelated to `maya.widget.envelope/1`.

Consequently **every row of §A1 is a prerequisite, not a regression**, and every §3 and §4 rule marked `[TO BUILD]` describes a requirement, never a capability (§0.17 item 16).

---

## A1 The prerequisites register

Columns: **Component** — the named artefact. **Depends on it** — the contract rules that become inoperative without it. **Status** — `[ABSENT]` (nothing exists), `[PARTIAL]` (something exists but does not do the work the rule names), `[UNENFORCEABLE-TODAY]` (buildable in principle, but no substrate exists in which the mechanism can run). **Package** — the package of the 16 (K1–K16, 6 waves) that must build it.

### A1.1 The gateway, its two routes, and the stores

| # | Component | Depends on it | Status | Package |
|---|---|---|---|---|
| **P-01** | **`IntentGateway`** — Step 0 plus Gates 1–13, one ordered pipeline, and the programme's only two new routes `POST /api/widgets/resolve`, `POST /api/widgets/intent` | FR-1, FR-2, FR-3, FR-4, FR-5, FR-7, FR-9, FR-13; §3.9 R3.9.1; every `EP-INGRESS` rule in the contract | `[ABSENT]` — `api/widgets` 0 hits; `IntentGateway` 0 hits | **K3** (wave 2) |
| **P-02** | **`IntentRecord`** — the stored record and its type, including `principal_proof_hash`, `capability`, `effect`, `verification_floor`, `widget_kind`, `frozen_nouns` | Gate 1 single-use consumption, Gate 3 principal binding, Gate 7's COMMIT check, §3.7, §4.2's frozen receipt, §0.51's noun-resolver input set, idempotency of a tap, "who pressed what" audit | `[ABSENT]` — 0 hits | **K3** (wave 2) |
| **P-03** | **Timeline store** — conversation turns, envelopes, bodies, minted text, `spoken_transcript`, rendered utterances | §4.2's week-later receipt; §4.4.2 retention and per-kind body drop; §4.4.1 RT3(b)'s history-blind replay; §4.7 V5's "stored exactly once"; `EP-FETCH` timeline read | `[ABSENT]` — 0 hits | **K3** (wave 2) |
| **P-04** | **Receipt store** — append-only, written only by the Action Engine and the approval owner, no FK into the timeline store | §4.3 DR3 (`TerminalLine.outcome === 'CONFIRMED' ⟺ action_receipt_ref !== null`); §4.4.1 RT1; §4.4.3's tombstone log; FR-12 | `[ABSENT]` — 0 hits. `C9WorkReceipt` is a different artefact | **K3** creates it; **K7/K9/K11/K12** write it; **K12** proves the split by erasure replay |
| **P-05** | **Emission / receipt store** — `maya.render.receipt/1` (`RenderReceipt`), `DeliveryRecord`, `Lifecycle.delivery` per emission | §4.1's lifecycle; §4.3's delivery bookkeeping; §4.5.4 step 8's degraded-envelope receipt; §4.2's historisation job keyed by `intent_token_hash`; `control.widget.dismiss`'s write target | `[ABSENT]` — `RenderReceipt` 0, `ChannelProfile` 0 | **K3** (store) + **K6** (per-carrier receipt, wave 2) |
| **P-06** | **Free-input ledger** — every open-domain emission with its `justification`, tenant and capability, written in the mint transaction | §2 K14; §3.6.6 R3.6.6; §0.16 E-16 (the two counters are one counter, keyed on field kind); INV-23; §2.6.15 FORM.7 | `[ABSENT]` — `free_input_justification` 0 hits | **K3** (wave 2) |
| **P-07** | **Capability-gap ledger** — the 8 gap keys as first-class entries with `owner: NONE`, plus the gaps §0.37 and §4.3 DR4 add | §1.6.7 P2; §1.3 C5; §2 K20; §2.6.14 LIMIT.1; §2.6.18 CONSENT.5; §2.6.20 PAY.4; §2.6.22 ARTIFACT.4; **§A2's entire mechanism** | `[ABSENT]` — `capability_gap_ref` 0 hits | **K1** (wave 1 — the only wave executable under this cycle's fence) |
| **P-08** | **Server-owned draft store** — the canonical draft owner's draft, named by `confirmation_of_ref.kind === 'draft'` | §0.32's key-space rule (the draft owner names the Action Engine key); §0.34; §3.2's effect table ("draft store only"); FR-6b, FR-7 | `[ABSENT]` — 0 hits | **K3** (store) + **K7** (booking draft owner, wave 3) |
| **P-09** | **Consent-register read projection** — the `CONSENT_REGISTER` owner class resolving to a registered `consent.*` **read** capability, and `register_ref` as an append-only handle | `CONSENT_STATE` emittability (§2.7, §2 K23); §2.6.18 CONSENT.1–6; the `scope_text` / `change_effect_text` body | `[PARTIAL]` — the canonical facts **do** exist: `prisma/schema.prisma:1593 model ClientConsentFact`, `:1573-1574 privacyConsentAt/marketingConsentAt`, `:2584 MarketingConsentEvidence`, and a reader `effectiveClientConsents` (`src/crm/client-effective-consent.ts:53`, used at `client-profile-read.service.ts:177`). What is absent is a **registered read key**: `MAYA_AI_TOOL_CATALOG` has 47 names, **zero** containing `consent`, `identity` or `privacy`, so `ownerClassKeys(CONSENT_STATE) ∩ capabilityRegistry = ∅` and K20 derives `emittable = false` | **K12** (wave 5) |
| **P-10** | **`WIDGET_CAPABILITY_POLICY`** (`min_verification`, `consent_class` per key, total over `C9_CAPABILITIES` ∪ the reachable Action Engine keys) and **`CONTROL_REGISTRY`** (closed at three keys) | §0.13 `subjectFloor`; §0.14 totality and monotonicity; §0.15's fail-closed default; §0.23 Gate 6 for `CONTROL`; §0.42's `consent_class` fence; FR-4, FR-6d | `[ABSENT]` — both 0 hits | **K2** (the tables, wave 1) over **K1**'s canon |

### A1.2 The derivations, and the floor that cannot be reached

| # | Component | Depends on it | Status | Package |
|---|---|---|---|---|
| **P-11** | **`VerificationLevel` ladder and `verificationFloor()`** — the five rungs and the arity-2 total derivation of §0.13 | FR-4 (its one mechanism); Gate 5; §0.16 divergence refusal; §0.17 shortfall branch; every `verification_floor` in every intent | `[ABSENT]` — **all five rung tokens are 0 hits repo-wide**: `ANONYMOUS`, `CHANNEL_IDENTITY`, `BOUND_CLIENT`, `SESSION_VERIFIED`, `STEP_UP_VERIFIED`; `verification_level` / `verificationLevel` 0 | **K2** (ladder types, wave 1) + **K4** (runtime derivation, wave 2) |
| **P-12** | **`STEP_UP_VERIFIED` reachability** — a re-authentication event type that can raise a live session's derived level | Every capability whose derived floor is `STEP_UP_VERIFIED`: **every `restricted` risk tier** (`RISK_FLOOR['restricted'] = STEP_UP_VERIFIED`, §0.13) **and every unmapped key** under §0.15's fail-closed default. §1.7 K6 | `[ABSENT]` — and absent at the substrate, not merely unbuilt: repo-wide `stepUp` 0, `step_up` 0, `step-up` 0, `re-auth` 0, `mfa`/`MFA` 0, `otp`/`OTP` 0, `twoFactor` 0, and no elevated/`sudo`-mode session concept anywhere in `src/auth/` (24 files, all single-factor session, rate-limit and retention services). The one `reauth` hit is unrelated prose in `measurement/measurement.wave2.architecture.spec.ts:14` | **No package.** This is outside the 16. It is an authentication-subsystem capability, and until it exists **every `restricted` capability and every unmapped key is permanently withheld** — fail-closed and correct, but a hole in the product, not a property of the design (§0.18-5) |
| **P-13** | **CHART read facade** — a widget-layer read facade returning `rows_digest` and `series_digest` **alongside** the C7/C8 rows, computing `sha256(stableActionJson(rows))` and `…(series)` on the read path, outside the projector | FR-10 (its one mechanism); §2.6.9 CHART.1; `ChartBody.rows_digest` / `.series_digest` are required non-nullable members, so without them `composeEnvelope` cannot build the body at `EP-COMPOSE`; **`CHART` is therefore not emittable** | `[ABSENT]` — `rows_digest`/`rowsDigest`/`series_digest`/`seriesDigest` **0 hits**. The read services exist and return no digest: `MeasurementReadService` (`src/measurement/measurement.read.service.ts:50`, C9 key `c7.measurement.read`), `C8ReadService` (`src/valuation/c8.read`, C9 key `c8.result.read`); `stableActionJson` exists (`src/action-engine/action-engine.identity.ts:54`) but is used only inside the Action Engine | **K10** (wave 4). *This facade is a new field on a widget-layer read facade, not a change to any C9 contract (§0.16 E-20).* |

**A1.2.1 — the CHART contradiction is settled here.** §0.40 states "the emittable set is unchanged: 17 emittable" with `CHART` inside the seventeen; §0.18-2 states `CHART` is not emittable until P-13 ships. Both are Section 0 text. **The ruling: §0.40 describes the set after P-13 ships; §0.18-2 describes today.** Until P-13 ships, `CHART` is `NORMATIVE-PENDING` under §A2 and the emittable set is **16 emittable, `ARTIFACT` narrowly emittable, 5 blocked**. The outcome was already fail-closed; what was missing was one answer to the question an implementer reads the readiness table to ask.

### A1.3 Routes and control handlers

| # | Component | Depends on it | Status | Package |
|---|---|---|---|---|
| **P-14** | **`shell.pay`** — the shell route carrying one opaque server-minted `session_ref` matching `/^[A-Za-z0-9_-]{8,64}$/` | §2.6.20 PAY.2's return path; `PAYMENT_HANDOFF` has **no return path at all** without it; §0.31; FR-8 (the shape that has no member able to hold a URL) | `[ABSENT]` — `shell.pay` 0 hits in backend; 0 hits in `сайт и приложение/app.html`; `session_ref` 0 hits | **K5** (route registry, wave 2) + **K9** (session minting, wave 3) |
| **P-15** | **`shell.file`** — the shell route carrying one opaque server-minted `artifact_ref` | §2.6.22 ARTIFACT.1 — `ARTIFACT` has **no delivery** without it; ARTIFACT.2's per-principal proof-hash re-check at `EP-FETCH`; §0.31 | `[ABSENT]` — `shell.file` 0, `artifact_ref` 0 | **K5** (route registry) + **K10** (owner-report artefacts, wave 4) |
| — | *(context)* the five base routes `shell.root`, `shell.account`, `shell.connections`, `shell.privacy`, `shell.notifications` | `targetFloor('s')`; every `HANDOFF`; §3.5 R3.5.4 ("a handoff whose target has no live surface is not emitted") | `[ABSENT]` — `shell.root` 0, `shell.account` 0, `route_key`/`routeKey` 0 in `app.html`. The shipping frontend has an `S` router map (`сайт и приложение/app.html:39981`) keyed on its own screen names, which is not a `route_key` registry | **K5** (wave 2) |
| **P-16** | **`control.widget.dismiss`** — the handler that sets `Lifecycle.delivery` on one emission, `CONTROL_FLOOR = ANONYMOUS` | §0.25's escape verb on **every non-`RICH_INTERACTIVE` tier** — i.e. Telegram, web push, SMS, e-mail, voice. Without it the mandatory escape is unreachable off the PWA, contradicting §3.12.6, §4.7 V9, §4.8 A-5 | `[ABSENT]` — 0 hits | **K3** (handler, wave 2) + **K6** (the `EP-FIT` branch that selects it, wave 2) |
| **P-17** | **`control.delivery.resolve`** — the handler that resolves one `dedupe_key` across channels, `CONTROL_FLOOR = BOUND_CLIENT` | §0.22; cross-channel duplicate suppression; §4.9's proactive `dedupe_key` | `[ABSENT]` — 0 hits | **K13** (wave 5 — "0 duplicate deliveries across push, chat and the Telegram mirror over a 14-day window") |

*`control.run.cancel` is the only one of the three control keys whose owner endpoint exists today: `src/orchestration/c9.controller.ts:92`, write-once under `cancelKeyHash`, principal- and tenant-locked, `c9.store.ts:588-615`. The key itself is not a C9 canon member, by design (§0.22).*

### A1.4 Fields

| # | Component | Depends on it | Status | Package |
|---|---|---|---|---|
| **P-18** | **`produced_by_intent_token_hash: string \| null`** on `IntentRecord`, classified `AUDIT_RETAINED` | §0.34's **guard against the obvious bypass** — a `COMMIT` whose `confirmation_of_ref.kind !== 'draft'` is mintable only when this field is non-null and names a consumed `REFINE`/`DRAFT` record whose capability is the canonical owner's own propose key. Without it, populating `confirmation_of_ref` with a bare `appointment_ref` mints a cancel or reschedule `COMMIT` with no canonical confirmation behind it. **FR-6b and FR-7 both name it.** Also §0.51's noun-resolver input set and §0.53's classification | `[ABSENT]` — `produced_by_intent_token_hash` / `producedByIntentTokenHash` **0 hits**; `confirmation_of_ref` likewise | **K3** (the field, wave 2) + **K7** (the static-analysis proof that no other minting path exists, wave 3) |

### A1.5 Unenforceable today — no substrate for the mechanism

| # | Component | Depends on it | Status | Package |
|---|---|---|---|---|
| **P-19** | **Renderer sandboxing / import-graph allowlist** — renderer modules receive no token-bearing props and import no `fetch`/`XHR`/`WebSocket`/storage/provider SDK | §4.2 FR1; §3.16.4; §0.15 FR-1's build import test; **and, through NT1, every §4 clause whose evaluation point resolves to `EP-BUILD`** — A-1's renderer conformance suite, A-4's visual regression matrix, A-9's `prefers-reduced-motion` snapshots, A-10's viewport matrix, A-11, A-12, A-15, A-17, A-18, A-21 (gate G10), §4.5.4 CH3, C6, V7, V8, V10, V11, NT2's G6 lint, NT8's G12 parser check, and FR-11's renderer conformance suite | `[UNENFORCEABLE-TODAY]` — the shipping frontend is a hand-edited single file: `сайт и приложение/app.html` is **42,453 lines / 2.70 MB**, with **no sources, no build script and no bundler**. The only `package.json` anywhere in either tree outside `node_modules` is `maya-saas-backend/package.json`. `app-aurora.html` and `build.js` do not exist. There is no import graph to allowlist, and no lint stage in which to run one | **K5** ("exactly one shell source, emitted once", wave 2) must create the build; **K15** (wave 6) proves the bundle disposition. Until a build exists these are **discouraged, not proven** — Section 0 names three dependents; the true dependent set is the ~two dozen listed at left |
| **P-20** | **Gate 10 promotion criterion** — the rule that converts the divergence audit from shadow to refusal | "Three front doors, one function" — the guarantee that a tap, a typed sentence and a spoken utterance resolve to the *same* capability. Gate 10 runs the deterministic text router over the lowered utterance and compares its resolved capability to `IntentRecord.capability` | `[ABSENT]` **twice over**: the gate itself is `[TO BUILD]` (P-01), *and* no promotion criterion is defined anywhere in the contract. §3.16.5 states it plainly — divergence is "audited, not refused, until a promotion criterion is set", so "three front doors, one function" is **measured, not enforced** | **K3** builds the gate (wave 2); **K14** exercises it across the ~45 Telegram commands (wave 6). **The criterion itself is an owner decision, not a package deliverable** — it must be set before Gate 10 may refuse |

### A1.6 Acts with no canonical owner

| # | Component | Depends on it | Status | Package |
|---|---|---|---|---|
| **P-21** | **`GAP-ATTENDANCE-CONFIRM`** — a canonical owner that records *that a client acknowledged an upcoming appointment* | §4.3 DR4; §4.9 PR5c; §3.16.6. Until it exists, an `appointment_reminder` emission carries a `Limitation` with `capability_gap_ref: 'GAP-ATTENDANCE-CONFIRM'` and intents of effect `NONE`, `NAVIGATE` or `HANDOFF` only. **A "Приду" control that writes nothing is not emitted**, and «клиент подтвердил» is not a claim this system may make in any surface | `[ABSENT]` — `GAP-ATTENDANCE` 0 hits; no attendance-acknowledgement owner exists. `crm.appointment.attendance.v1` is an Action Engine capability for *staff-recorded* attendance (it carries `targetKind: 'appointment'`, §0.33 E-19) — it is not a client acknowledgement and must not be presented as one | **K13** (wave 5) surfaces reminders; the owner registration is a canonical-owner change **outside the widget layer** |
| **P-22** | **`NEVER_CHAT_ACTUATED` — the eight reserved names** | FR-6a (its one mechanism, `subjectCapability(i) ∈ NEVER_CHAT_ACTUATED ⟹ HANDOFF ∧ target.class === 's' ∧ floor ≥ SESSION_VERIFIED`); §3.5 R3.5.1; §0.37's registration gate | `[ABSENT]` as keys — **all eight are 0 hits**, and `NEVER_CHAT_ACTUATED` itself is 0 hits. FR-6a therefore holds today **fail-closed but vacuously**. The per-act owner position is set out below and **corrects §0.18-4** | **K12** (wave 5) |

**A1.6.1 — the eight acts, verified individually.** §0.18-4 states that "six of the eight `NEVER_CHAT_ACTUATED` acts have no canonical owner". That is an overcount. Verified per act:

| Reserved name | Key resolves | Does the *act* have a canonical owner? | Evidence |
|---|---|---|---|
| `consent.pd.grant` | 0 | **YES** | `package5.wave3.record-client-consent.execute.v1` — `PACKAGE5_WAVE3_REGISTRATIONS` / `define('record_client_consent', …, targetKind: 'client_consent')`, `action-engine/package5-wave3-executable.contract.ts:58`; registered at `action-engine.registry.ts:3657` via `package5Wave3Capability(registration, false)`; `policyDecision: ALLOW`, `approvalRequirement: 'NONE'`, `allowedSourceTypes: ['authenticated_request','legacy_bridge','synthetic_shadow']` (`registry.ts:1778-1782`). Reached by `Package5Wave3CanonicalCutoverService.recordClientConsent(tenantId, userId, clientId, 'privacy', granted, …)` (`package5-wave3/package5-wave3-canonical-cutover.service.ts:265`) from `customers/customers.service.ts:79` |
| `consent.pd.withdraw` | 0 | **YES** | same call, `granted = false` |
| `consent.marketing.grant` | 0 | **YES** | same call, `kind = 'marketing'`, `customers/customers.service.ts:90` |
| `consent.marketing.revoke` | 0 | **YES** | same call, `kind = 'marketing'`, `granted = false` |
| `identity.client.channel.unbind` | 0 | **PARTIAL — owner exists, unreachable** | `ClientChannelLinkService.revoke()` (`crm/client-channel-link.service.ts:276`) has **zero callers**. `revokeInTransaction` (`:285`) is called from exactly one place — `package5-wave3/consent-security-invalidation.service.ts:257` — whose capability `package5.a18.consent-security-invalidation.execute.v1` declares `allowedSourceTypes: ['legacy_bridge']` (`action-engine/consent-security-invalidation.contract.ts:314`), so it is unreachable from `authenticated_request` |
| `identity.staff.telegram.unbind` | 0 | **NO** | binding exists (`auth/social-auth.service.ts:319 completeTelegramLink`, route `auth/auth.controller.ts:190`); **no unbind of any kind exists** |
| `consent.register.export` | 0 | **NO** | zero occurrences of any consent-register export under `src`. Corroborated by §2.6.22 ARTIFACT.4 |
| `conversation.history.erase` | 0 | **NO** | zero occurrences. The only erasure in the tree is `package5-wave6/package5-wave-rc-retention.service.ts:20`, a maintenance-run payload erasure — not a data-subject right |

**Corrected figure: three acts with no owner at all, one with an owner unreachable from the widget source type, four with a reachable registered owner under a different name.** §0.18-4's operative consequence is unchanged — none of the eight reserved names is a registry member — but its *stake* is larger than stated, and this must be carried into §0.37's registration gate:

> **A1.6.2 — NORMATIVE.** `package5.wave3.record-client-consent.execute.v1` is registered today with `policyDecision: ALLOW`, `approvalRequirement: 'NONE'`, `targetKind: 'client_consent'` and `allowedSourceTypes` including `authenticated_request`. Under §0.33 it carries no `'financial'` facet and its `targetKind` is not `'appointment'`, so `requiredConfirmationKind` returns **`SETTINGS_DRAFT`** — a COMMIT-bearing kind. There is no C9 propose key for consent at all (`MAYA_AI_TOOL_CATALOG` = 47 names, **zero** matching `consent`/`identity`/`privacy`), so §0.42's second condition has no row to read. **Therefore:** when this key is registered in `WIDGET_CAPABILITY_POLICY` under §0.37's gate, its row MUST carry `consent_class: 'personal_data'`, and §0.42's exclusion MUST bite before any intent naming it may be emitted. *Mechanism:* §0.44's `EP-REGISTRY-LOAD` assertion that `SETTINGS_DRAFT`'s resolved key set contains no `personal_data` key, plus §0.42's `EP-MINT` refusal and Gate 7's re-check. *Evaluation points:* `EP-REGISTRY-LOAD`, `EP-MINT`, `EP-INGRESS` Gate 7. Without this row the widget layer would confer consent — which FR-6a exists to forbid. *(§2.7's own `[NON-NORMATIVE]` note anticipates exactly this: "the marketing-consent change path can be routed to an owner that already exists and is already append-only".)*

---

## A2 The NORMATIVE-PENDING rule

**A2.1 — the definition.**

> A rule of this contract whose **named enforcing mechanism** is marked `[ABSENT]` or `[UNENFORCEABLE-TODAY]` in §A1 is **NORMATIVE-PENDING**. It is **binding on the implementation** — it is not advisory, not aspirational, and may not be softened, renegotiated or dropped when the package that owes the mechanism is scheduled. Until the mechanism ships, **the capability that rule guards MUST emit `capability_gap_ref` and MUST emit no actuating control.**

**A2.2 — what "no actuating control" means, exactly.** The envelope carries a `Limitation` with a non-null `capability_gap_ref`, `remedy_intents` empty, and **no intent of effect `DRAFT`, `REQUEST_APPROVAL` or `COMMIT`**. Intents of effect `NONE`, `NAVIGATE`, `REFINE`, `HANDOFF` and the mandatory `CONTROL` escape remain permitted, because none of them actuates. The text equivalent carries the `gap` sentence in `sentence_order`, stating plainly that nothing in the product can do this yet. No renderer may synthesise an affordance for it (§2 K20).

**A2.3 — the enforcing mechanism is the existing capability-gap machinery; nothing new is invented.** Four rules already in the contract compose into the enforcement, and NORMATIVE-PENDING simply declares their input:

| Rule | What it does | Evaluation point |
|---|---|---|
| **§2 K20** — `emittable(kind) = ownerClassKeys(kind) ∩ capabilityRegistry ≠ ∅` | `composeEnvelope` **refuses** a kind whose `emittable` is false and emits a `LIMITATION` carrying the `capability_gap_ref` mapped from that owner class, with no intent. `emittable` is **derived, never authored** | `EP-REGISTRY-LOAD`, then `EP-COMPOSE` on every emission |
| **§1.6.7 P2** — the /unsubscribe clause | If a remedy has no canonical owner, the envelope MUST carry a `Limitation` with a non-null `capability_gap_ref` and MUST NOT carry an intent that promises the remedy | `EP-MINT` |
| **§1.3 C5** — `M2` | A `Cell` in state `NOT_MEASURED`/`UNAVAILABLE` either names a real intent present in this envelope or forces `next_intent_ref: null` **and** a non-null `capability_gap_ref`. This forces the gap onto the record from the *Cell* side, so it cannot be omitted by an emitter that simply declines to mint an intent | `EP-MINT` |
| **§2.6.14 LIMIT.1** — no button for a capability with no owner | When `capability_gap_ref` is non-null, `remedy_intents` must be empty and the text must carry the gap sentence | `EP-MINT` |

**A2.4 — the evaluation point.** NORMATIVE-PENDING is evaluated at **`EP-REGISTRY-LOAD`, and again at `EP-COMPOSE` on every emission.** At `EP-REGISTRY-LOAD` the capability-gap ledger (P-07) is read and every `[ABSENT]` mechanism named in §A1 is bound to its gap key; a §A1 row with no gap key fails the start-up assertion and the process does not start. At `EP-COMPOSE` K20's derivation runs per emission. `EP-MINT` is the backstop: P2, C5 and LIMIT.1 refuse an envelope that reached the minter with an actuating intent and a non-null gap ref. **Three points, all fail-closed, none of them the renderer.**

**A2.5 — why this closes the finding rather than restating it.** An unproven claim is a sentence asserting that the running system does something, with no mechanism a reader can check. A NORMATIVE-PENDING rule asserts something different and checkable: *this rule is binding; its mechanism is named; its mechanism is absent; here is the gap key it is bound to; here is the start-up assertion that fails if the binding is missing; and here is the emission the system produces instead.* The claim's truth value is no longer "unknown" — it is **"pending, and fail-closed while pending"**, which is a property the build can test. `[ABSENT]` is therefore a declaration, not an excuse.

**A2.6 — what NORMATIVE-PENDING does NOT license.**
1. It does not license emitting the control anyway behind a flag, a pilot, an allowlist or a "temporary" exception. There is no such branch.
2. It does not license softening the rule when the package ships late. The rule's text is fixed now; only its status changes.
3. It does not license a *partial* mechanism. §A1's `[PARTIAL]` status means the existing artefact does **not** do the work the rule names; a `[PARTIAL]` row is NORMATIVE-PENDING on identical terms to `[ABSENT]`, and the existing artefact may not be cited as the rule's mechanism (see P-09).
4. It does not license a renderer or a channel adapter deciding a mechanism is "close enough". NORMATIVE-PENDING is evaluated server-side only.

**A2.7 — discharge.** A row leaves NORMATIVE-PENDING when, **and only when**, (a) the named mechanism exists at a stated path, (b) `EP-BUILD` carries a test that fails if it is removed, and (c) the corresponding gap key is withdrawn from the capability-gap ledger in the same commit. Withdrawing the gap key without (a) and (b) is the failure mode this annex exists to prevent, and the ledger is versioned with the contract so that a withdrawal is a reviewable diff (§4.4.3 RT8).

**A2.8 — the marker.** §4 carries no `[EXISTS]`/`[TO BUILD]` vocabulary at all — §3 defines the two statuses and marks every rule, but §4's preamble marks only its **stores** as future and says nothing about its ~two dozen renderer-side and CI mechanisms, so §0.17 item 16's downgrade (which keys on the literal "[TO BUILD]") cannot reach them. **Ruling:** every §4 mechanism whose evaluation point resolves through §0.8 to `EP-BUILD` or `EP-RENDER` is hereby marked **NORMATIVE-PENDING on P-19**, and no such sentence describes the running system. This is the gap §0.18-6 discloses; §A1 P-19 enumerates the dependents §0.18-6 does not.

---

## A3 The schema-scope ruling

The owner's hard constraint reads: **"The contract must require NO C9 contract change and NO schema change."** The C9 half holds and is verified. The schema half needs an honest, three-part answer rather than a yes or a no.

**A3.1 — THIS ARCHITECTURE CYCLE makes 0 schema changes. This is a fact, and it is already true.**

Verified: the canonical repository's working tree at branch `codex/maya-identity-consent-20260913` carries exactly **one** modified file — `docs/rebuild/MAYA-CHAT-FIRST-UX-OWNER-DECISIONS.md`, a documentation file. **Zero** changes to `maya-saas-backend/prisma/schema.prisma`; **zero** new entries under `prisma/migrations` (97, unchanged, latest `20260913160000_chapter9_orchestration_foundation`). The primary working tree carries no Prisma or migration change either. §3's and §4's own scope discipline states it: *"Architecture only. Runtime changes: 0. Schema changes: 0. Migrations: 0."* **This is not a promise about the future; it is a verified property of the present.**

The C9 half is likewise verified and is not in question: §0.10 deletes every capability key §§1–4 invented (`orchestration.run.read`, `orchestration.run.cancel`, `booking.reschedule.propose` — 0 hits each); E-18 voids the `booking_effect` registry flag (0 hits); §0.33 derives the confirmation kind from **existing** `RegisteredActionCapabilityV1` fields (`targetKind`, `riskFacets`, `policyDecision`); the three control keys are widget-layer-only by design; and FR-16 asserts `C9_REGISTRY_HASH` (`src/orchestration/c9.registry.ts:177`) unchanged at `EP-BUILD`. `C9_CAPABILITIES` = 47 catalogue names + 9 extras = **56 keys**, unchanged.

**A3.2 — the IMPLEMENTATION requires additive widget-layer stores. They touch no canonical business table and hold no business state.**

Eight stores are commissioned — P-02 through P-09 of §A1 — of which six are named in owner decision **D12** (`IntentRecord`, timeline store, receipt store, emission/receipt store, free-input ledger, consent-ledger projection) and two more in §0.18-1 (capability-gap ledger, server-owned draft store). Their containment is already a rule of this contract, in three independent places:

- **§1.1.1 E4** — no canonical table may hold a foreign key to `widget_id`. *(Retained as a cheap complement; §0.17-14 correctly notes an FK-absence assertion does not exclude an untyped string column.)*
- **§4.4.1 RT1** — the receipt store has **no foreign key into the timeline store**, is written only by the Action Engine and the approval owner, and a schema test asserts no column in it references a `widget_id`, a turn id or a conversation id.
- **§4.4.1 RT3(b)** — the **history-blind replay test**: the canonical read and action paths are exercised with the timeline store made unreadable; any business read that fails, degrades, or returns a different value is a violation. This is the load-bearing test, and it is a stronger property than FK absence.

Plus §0.52's build-time erasure-reachability test: for every field read on any path to Gate 11, Gate 13, Gate 14 or an owner decision route, the field's `ErasureClass` must be `AUDIT_RETAINED`. The direction of dependency is enforced in both directions — no canonical row points at a widget row, and no canonical decision reads a widget-layer field that erasure may remove.

**A3.3 — the ruling, stated as it is.**

> **This is not a change to a canonical business schema. It IS new storage.**
>
> The constraint as the owner wrote it — "NO schema change" — is **not met** by the literal reading, and §3.16.2's narrowing to "no change to any canonical business schema" is a narrowing, recorded here rather than performed silently (§0.16 E-30). Under the narrow reading the constraint holds completely and is machine-checked. Under the literal reading it does not hold, because wave 1 introduces additive tables and migrations. **The difference is real and the owner must know it before the first pull request, not discover it in one.**
>
> What is *not* at stake: no canonical business table gains a column; no canonical row references a widget row; no business state moves into the widget layer; deleting conversation history still leaves every canonical record correct and complete; and the additive tables are removable without loss of business data, because they contain none.
>
> What *is* at stake if the literal reading is enforced instead: `IntentRecord` is the mechanism behind tap idempotency, the "who pressed what" audit, and the frozen receipt in history — three guarantees this contract was required to provide. Without persistence, `WIDGET STATE ≠ BUSINESS STATE` becomes true trivially, because there is no state at all, and the conversation history stops being reproducible.

**A3.4 — this needs an explicit owner decision, carried as D12.** The decision is already drafted as **D12 — "Объём хранилищ виджетного слоя"**, with options A (strictly no new storage), B (the constraint reads as "no *canonical* schema change"; the widget layer gets its own additive tables) and C (defer), recommending **B**. §A3 does not choose. **No package that creates a widget-layer store may open until D12 is answered** — that is wave 1 in its entirety (K1 and K2 both write to the capability-gap ledger and the policy table). *Mechanism:* the wave-1 exit gate, whose hash is pinned in code the way `C9_REGISTRY_HASH` is pinned at `src/orchestration/c9.registry.ts:177`. *Evaluation point:* `EP-BUILD`.

---

## A4 The repository defects this contract cannot fix

These are findings about the **running system**, not about the contract. Each was verified by grep at the roots named in §A0.4. **No clause of this contract closes any of them**, and none is proposed for fixing in this cycle — this cycle changes no production code. They are recorded here so that no reader of the contract believes the widget layer compensates for them.

### A4.1 — Self-approval: an initiator holding an owner role can approve their own request

**Where:** `maya-saas-backend/src/ai-tools/ai-tool-policy.service.ts:81-95`.

```ts
canDecide(definition, requestedByUserId, principal): boolean {
  if (definition.approvalPolicy === 'actor') {
    return requestedByUserId === principal.userId;     // line 87
  }
  if (definition.approvalPolicy === 'owner') {
    return OWNER_ROLES.includes(                        // line 90
      principal.role as (typeof OWNER_ROLES)[number],
    );                                                  // requestedByUserId is never read
  }
  return false;
}
```

For `approvalPolicy: 'owner'`, `canDecide` resolves to a **role test only**; `requestedByUserId` is in scope, is used two branches above, and is **not compared** to `principal.userId`. `assertCanDecide` (`:97-105`) adds only a tenant assertion and delegates. `OWNER_ROLES` is defined at `:14`.

**Verified:** `four_eyes`, `fourEyes`, `separation_of_duties`, `separationOfDuties` — **zero occurrences anywhere under `maya-saas-backend/`**. The only hits in the whole tree are in `docs/rebuild/*` design documents, which already record the same finding. `assertSameApproval` (`ai-tool-runtime.service.ts:1158-1172`) requires `approval.requestedByUserId === principal.userId` — an **idempotency-identity** check, which is the opposite of a separation control.

**Concretely reachable today:** `loyalty.internal.adjust` is `riskTier: 'high_write'`, `approvalPolicy: 'owner'` (`ai-tool.catalog.ts:911-933`) — a self-approvable balance mutation.

**What the contract does and does not do:** §0.45 **deletes** the four-eyes claim rather than softening it, and §0.46 states the true, weaker guarantee — **role-gated approval, not separation of duties**. §0.43 keeps `loyalty.internal.adjust` off every chat-reachable confirmation body. **That is a containment, not a fix**: it reduces chat reachability and changes nothing about `canDecide`. The owner must either add a separation-of-duties comparison for `approvalPolicy: 'owner'`, or accept role-gated approval as the product's stated control. This contract does not choose, and states nothing stronger than §0.46 until one is chosen.

### A4.2 — smm_bot: six callback handlers with no `is_admin` check

**Where:** `/Users/stanislavmosin/Desktop/Projects/maya-platform/smm_bot/bot.py`.

`is_admin(user_id)` is defined at `:49-50` against `config.ADMIN_IDS = [948205934]` (`smm_bot/config.py:8`). It is applied to **thirteen message handlers** and to **two** of the eight callback handlers — `togglefeat:` (`:223`) and `setmodel:` (`:233`). The remaining **six callback handlers perform no authorisation check of any kind**:

| Handler | Line | What an unauthorised caller gets |
|---|---|---|
| `generate:` | `:843-844` | triggers an AI caption generation against the shop's media and model budget |
| `copy:` | `:881-882` | reads back the pending post's caption |
| `schedule:` | `:897-898` | enters the scheduling FSM for a pending post |
| **`approve:`** | **`:961-962`** | **calls `publish_to_all(bot, post)` — publishes the post to every connected social platform** |
| `reject:` | `:982-983` | deletes the pending post |
| `edit:` | `:992-993` | enters the caption-rewrite FSM for a pending post |

`approve_post` reads `pending_posts.get(post_id)` and publishes; `post_id` is taken verbatim from `callback.data.split(":")[1]`. The only barrier is knowing a `post_id` and being able to send a callback query to the bot. No contract clause closes this — `smm_bot` is a separate process on a separate host (`/opt/smm_bot`) with no relationship to the widget layer, the gateway or the Action Engine.

### A4.3 — Realtime voice: `redact_pii` is on the LLM path only; the raw transcript reaches the client and the application log

**Where:** `/Users/stanislavmosin/Desktop/Projects/maya-platform/ai администратор/realtime_bridge.py`.

```python
async def think_and_reply(transcript: str) -> None:          # :500
    ...
    await ws_client.send_json({"type": "transcript",         # :505  RAW — to the browser
                               "text": transcript})
    async with _chat_lock(chat_id):
        ...
        history.append({"role": "user",
                        "content": anonymizer.redact_pii(transcript)})   # :510  redacted — to the LLM
```

`ws_client` is the **browser WebSocket**: `webhook_server.py:10169` passes the aiohttp `ws` from the browser WS route into `realtime_bridge.run_session(ws, chat_id, …)`, with the comment at `:10108` confirming the carrier is a browser socket. The redaction at `:510` protects the LLM path; the send at `:505` is five lines earlier and unredacted.

**A second, independent breach in the same file:** the raw transcript is written to application logs at **six** sites — `:574`, `:577`, `:629`, `:636`, `:644`, `:650` — each as `transcript[:60]!r` or `tr[:60]!r`. §4.7 V5 states the opposite in terms: *"The transcript is **not written to application logs**; only elapsed milliseconds and the audio byte count are logged."*

Both findings are contrary to §4.7 V5 and to the project's own 152-FZ boundary (`CLAUDE.md` gotcha 4: «ПД клиента НИКОГДА не уходят в LLM» — the LLM half holds; the client and log halves do not). No contract clause closes this: `realtime_bridge.py` is the Python bot's voice carrier, not the widget layer's, and §4.7's rules bind an implementation that does not exist yet.

### A4.4 — A stale duplicate of the front proxy is deployed at a second public URL

**Where:** `/Users/stanislavmosin/Desktop/Projects/maya-platform/beget_remote_snapshot_2026-06-28/`.

| Copy | Lines | Modified | Status |
|---|---|---|---|
| `сайт и приложение/pwa-assets/tg-auth/api-proxy.php` | **3 111** | 5 Sep | canonical source |
| `beget_remote_snapshot_2026-06-28/muzhskayaestetika.rf/public_html/app/api-proxy.php` | **2 017** | 28 Jun | **deployed, stale by ~1 100 lines** |
| `beget_remote_snapshot_2026-06-28/muzhskayaestetika.rf/public_html/api-proxy.php` | **151** | 17 May | **deployed, stale by ~4 months** |
| `beget_remote_snapshot_2026-06-28/mocine3388.beget.tech/public_html/api-proxy.php` | 224 | — | third copy on the Beget account's default host |

`LOCAL_DESKTOP_PROJECT_MAP_2026-06-28.md:26` records that *"Beget `muzhskayaestetika.rf/public_html/` is the deployed domain folder for `мужскаяэстетика.рф`"* — a **second live public domain** serving the same PWA; `AGENTS.md:127` shows `app.html` being deployed there. `:49` of the same map records that on 2026-06-28 the canonical proxy and `muzhskayaestetika.rf/public_html/app/api-proxy.php` matched **byte-for-byte**; they no longer do, so that deployment has since fallen behind.

All copies embed the same `PARTNER_TOKEN` (`'U7nDBjvTOj21WqF0y94l'`), set `Access-Control-Allow-Origin: *`, and disable TLS peer verification (`'ssl' => ['verify_peer' => false, 'verify_peer_name' => false]`) — so **every stale copy is an independent, un-versioned, un-monitored path to the same YClients partner credential and the same salon**. Any hardening applied to the canonical proxy does not reach them.

*Scope note:* this is verified from the 2026-06-28 snapshot of the Beget account's document roots plus the project map, not from a live request. What is proven is that a second public domain was serving these files and that the local copies have since diverged; confirming today's live bytes requires a fetch, which this cycle did not perform.

### A4.5 — VKontakte publishing and copy are present in live code, against `CLAUDE.md` rule 7

`CLAUDE.md` gotcha 7: *«VK/MAX-ссылок в проекте быть не должно (требование владельца). `vkid-sdk.js` сейчас не подключён.»* The note about the SDK file is accurate — `vkid-sdk.js` has **0 references** from `app.html`. The rule itself is nevertheless violated in three live places:

| Where | Evidence |
|---|---|
| **PWA — live OAuth code** | `сайт и приложение/app.html:41458` defines `VK_APP_ID='54620400'`, `VK_REDIRECT='https://malesthetic.pro/app/'`, `VK_NATIVE_SCHEME='ru.mayaos.app://vk-auth'`; `:41658` builds `new URL('https://id.vk.com/authorize')` with a full PKCE flow (`__meVkStoreSet('vk_code_verifier', …)`, `vk_state`, `pkceChallenge`) — 25 `__meVk*` references in total. This is a hand-rolled VK ID sign-in, wired and reachable |
| **PWA — user-facing copy** | `сайт и приложение/app.html:410`: `socials: ["ВКонтакте", "Max", "Telegram"]` — naming **both** proscribed networks in shipped copy |
| **smm_bot — live publishing** | `smm_bot/publishers.py:32-33` adds `("ВКонтакте", publish_vk(...))` to `publish_to_all` whenever `VK_TOKEN` and `VK_GROUP_ID` are set — and both are hardcoded in `smm_bot/config.py:15-16`. `publish_vk` (`:114`) posts to `api.vk.com/method/wall.post` (`:125`, `:218`) with photo and video upload paths (`:86`, `:99`, `:151`, `:169`, `:190`). `smm_bot/ai_caption.py` generates a dedicated `ТЕКСТ_VK` variant (`:215`, `:226`, `:328`). **Reached by the unauthenticated `approve:` handler of §A4.2** |

`сайт и приложение/index.html` is clean — its apparent matches are base64 asset blobs. No contract clause closes any of this; it is a product-policy violation in three separate deployables.

---

## A5 Closing statement

§A1 enumerates **22 prerequisites**: 18 `[ABSENT]`, 2 `[PARTIAL]`, 2 `[UNENFORCEABLE-TODAY]`. §A2 binds each of them to the existing capability-gap machinery with a fail-closed default evaluated at `EP-REGISTRY-LOAD`, `EP-COMPOSE` and `EP-MINT`. §A3 states the schema position without narrowing it silently and hands the decision to the owner as D12. §A4 records five repository defects that the contract cannot reach and does not claim to.

Against the owner's bar, and for the class of finding this annex addresses: **an unmarked claim about an unbuilt mechanism is an unproven claim; a marked one, bound to a gap key and a refusal, is a declared prerequisite.** Every such claim in this contract is now marked. The two findings this annex does **not** close, because they are not in its scope, are the two conferral-fence falsifications (FR-6c's bulk-send ceiling and FR-6d's `'financial'`-token classifier) and the FR-3 authority-gate gap over the Action Engine key space — those are defects in Section 0's derivations, not missing components, and they require an edit to Section 0 rather than a status marker. §A1.6.2 is the one place where this annex adds a normative fence of its own, because a registration gate with four live keys behind it is a materially different gate from one with none.
