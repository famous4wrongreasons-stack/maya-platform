# MAYA WIDGET CONTRACT v1

*Canonical. Normative. Consolidated 2026-09-15 on branch `codex/maya-identity-consent-20260913`.*

**One document, one place per rule.** This contract has no errata layer and no precedence
chain. Every rule is stated once, where it belongs, in its final form. A reader never needs to
follow a correction to learn what a rule says.

Earlier editions carried seventy-one corrections across three stacked sections, each of which
had to stay consistent with every other by prose alone. That layering was retired by a
controlled consolidation: the corrections were folded into the body and are kept in
**Annex B** as history — evidence of what was wrong and what replaced it, binding on nothing.

**How to read a rule.** Every sentence is normative unless prefixed `[NON-NORMATIVE]`. Every
normative rule names the **mechanism** that enforces it and the **evaluation point** at which
the mechanism runs. A rule whose mechanism is not yet built is marked `NORMATIVE-PENDING` and
bound to a prerequisite row in `MECHANISM_GAP_LEDGER` (Annex A): it is binding on the
implementation, and until its mechanism exists its evaluation point **refuses rather than
admits**.

**What this contract does not do.** `[NON-NORMATIVE — this preamble is a summary; every figure
in it is declared, and governs, in the section named beside it.]` It adds no Action Engine
capability, no C9 capability and no registry field; `C9_REGISTRY_HASH` is unchanged; no C6–C9
canonical business contract is modified. It introduces exactly **two** deliberate floor
reductions, both disclosed in **§0.17** with their compensating fences. Exactly **two** new
routes exist in the whole programme, `POST /api/widgets/resolve` and `POST /api/widgets/intent`,
declared in **§A1.1 P-01**.

---

## 0. Foundations

This section defines the vocabulary, the key spaces, the registries, the verification floor,
the effect classes and the conferral fences that the rest of the contract is written in. Every
sentence here is NORMATIVE — it names its enforcing mechanism **and** its evaluation point — or
is explicitly prefixed `[NON-NORMATIVE]`.

### 0.1 Discipline and scope

**F1 — normative discipline.** A guarantee that cannot name a mechanism is deleted or
downgraded, never softened. §0.19 is the register of every statement in this contract that
carries no mechanism; each entry there is either `[NON-NORMATIVE]` or deleted. The count of
unproven normative claims is zero by declaration, not by deletion of text.

**F2 — a normative clause may not name an identifier that no shape declares.** Every type,
function, table and field a rule reads is declared in the section that owns its shape (§0.2).
A clause naming an accessor, a member or a catalogue that exists nowhere is not a weaker rule;
it is no rule, with the additional harm that it reads as one. *Mechanism:* a build test
resolves every identifier cited in a normative sentence against a declaration. *Evaluation
point:* `EP-BUILD`.

**F3 — what this contract requires of the running system.** No change to any C9 contract: no
new key in `C9_CAPABILITIES`, no new field on `C9Capability`, no new field on
`RegisteredActionCapabilityV1`, no change to `C9_REGISTRY_HASH` (`c9.registry.ts:177`, a hash
of the `C9_CAPABILITIES` array). No change to any canonical business schema. It does commission
additive widget-layer stores (§0.21 residual 1). *Mechanism:* a CI test asserts
`C9_REGISTRY_HASH` is unchanged by this contract's packages, that `RegisteredActionCapabilityV1`
gains no field, and that no canonical table gains a column. *Evaluation point:* `EP-BUILD`.

**F4 — the three repairs that are preserved exactly.** Nothing in this contract weakens:

(a) **the consent split** — a mandatory non-null `handoff_capability_ref` on every `HANDOFF`
plus a mandatory floor on every intent of every effect class, which together make
`subjectCapability` total and both the consent predicate and the floor comparison evaluable;
(b) **the payment fence** — payment is a capability, `DRAFT → confirmation → COMMIT → Action
Engine`, and the Action Engine alone opens the provider session and owns the idempotency key
and the receipt;
(c) **the booking scope fix** — the booking family is derived from a registry property, never
from a hardcoded capability name.

**F5 — status vocabulary.** `[EXISTS]` means the named mechanism is present in the repository
today at the path given. `[ABSENT]`, `[PARTIAL]` and `[UNENFORCEABLE-TODAY]` mean what Annex A
defines. **`NORMATIVE-PENDING`** means the rule is binding on the implementation, its mechanism
is named, its mechanism is absent, and the fail-closed default applies until it ships: the
envelope carries a `Limitation` with a non-null `capability_gap_ref`, `remedy_intents` empty,
and **no intent of effect `DRAFT`, `REQUEST_APPROVAL` or `COMMIT`**. Intents of effect `NONE`,
`NAVIGATE`, `REFINE`, `HANDOFF` and the mandatory `CONTROL` escape remain permitted, because
none of them actuates. *Evaluation points:* `EP-REGISTRY-LOAD`, `EP-COMPOSE`, with `EP-MINT` as
the backstop.

### 0.2 The section map

**F6 — five sections and no others.** In-text section annotations inside §§1–4
(`// §3 (Authority)`, `// §5 (Intents)`, `// §6 (Lifecycle)`, `// §7 (Presentation)`,
`// §4 (Platform and channels)`) are `[NON-NORMATIVE]` and void; only this table resolves a
cross-reference.

| § | Title | Owns (sole definition) |
|---|---|---|
| **0** | Foundations | evaluation-point vocabulary, mint and erasure classes, the three key spaces and `CapabilityRef`, the registries and ledgers, the verification floor (`verificationFloor`, `FLOOR_EXEMPT`, `SENSITIVE_DEST`, `subjectFloor`, `c9Floor`, `aeFloor`, `MintedIntent`, `subjectCapability`, `EFFECT_FLOOR`, `KIND_FLOOR`, `RISK_FLOOR`, `CONSENT_CLASS_FLOOR`, `targetFloor`), the leaf taxonomy, the effect classes, the escape verb, `CONTROL_REGISTRY`, the capability register, the key-space rule per effect, the confirmation guard (`requiredConfirmationKind`, `AE_WIDGET_COMMIT_ALLOWLIST`, `DraftClass`, `max_commit_intents`), the fundamental rules FR-1…FR-16, the non-normative register |
| **1** | Envelope, values and provenance | `WidgetEnvelope` root, `Cell`, `Measure`, `Phrase`, `Narrative`, `NarrativeTemplate`, `NARRATIVE_TEMPLATES`, `Provenance`, `FactUsed`, `Completeness`, `Authorship`, `EvidenceRef`, `Limitation`, `LIMITATION_REASON_TABLE`, `VerificationLevel`, `Integrity`, `body_hash` |
| **2** | The twenty-two widget kinds | `WidgetKind`, `KindRule`, `KIND_REGISTRY`, the twenty-two bodies, `role_hint`, `OptionItem`, `TableSpec`, `FieldBound`, `KindTextShape`, `interactive_paths` |
| **3** | Intents, the gateway, and the forbidden edges | `WidgetIntent`, `AuthorityHint`, `EffectClass`, `IntentTarget`, `ShellRoute`, `ConfirmationRequirement`, `InputSchema`, `IntentRecord`, `WidgetIntentSubmission`, `ReadbackAck`, the gate pipeline, the forbidden edges |
| **4** | Lifecycle, channels, accessibility, history | `Lifecycle`, `DeliveryRecord`, `TerminalLine`, `HistorisedWidget`, `ErasureClass`, retention, `ChannelProfile`, `ChannelId`, `RenderTier`, `TokenCarrier`, the fitting algorithm, `RenderReceipt`, `BundleBridgeRequirements`, voice, `A11yEnvironment`, `A11yBlock`, `InteractiveRef`, `refKey`, `refSet`, the `produced` / `reading_order` derivation, `ProactiveProvenance`, `MOMENT_REGISTRY`, `NOTIFICATION_CONSENT_REGISTRY`, `MOMENT_TEMPLATES` |

*Mechanism:* a documentation-link test resolves every `§N` **and every `§N.M`** reference in the
contract against this table and against the subsection headings, and fails on a reference that
resolves to nothing. A `§N`-only test was the reason ninety-odd subsection references survived a
renumbering pointing at the wrong rule. *Evaluation point:* `EP-BUILD`.

**F6a — «one place per rule» is a checked property, not a promise.** A build test extracts every
top-level `interface`, `type`, `const`, `declare` and `function` name from every fenced block in
this document, and every normative table whose first column is a closed key set, and **fails if
any identifier is declared in more than one section**. It fails additionally, for each
identifier this table's «Owns» column names, if that identifier is declared outside the section
named there — the column is a **partial** list of the artefacts whose home is contested, not a
census of every declaration, and a test written as though it were total could never pass. Two patterns are admitted and are not violations, because both are one
declaration: a `declare` **signature** in the section whose derivation depends on it, paired with
exactly **one** body in the owning section (`subjectCapability` is the only instance); and a
local binding inside a function body, which is not a declaration of the document at all. A second pass fails on any sentence of the form «X is declared in §Y
and is not restated here» whose X is then declared in the same section as the sentence. Both
exist because the claim they check is one this contract made and then broke: the five floor
tables were printed verbatim nine lines below a sentence asserting they had one declaration, and
`Phrase` was declared twice and had already lost a member in one of them. *Evaluation point:*
`EP-BUILD`.

### 0.3 The evaluation points

**F7 — eleven points, closed. Every normative rule in this contract cites exactly one.**

| id | The point | Runs in | A refusal here means |
|---|---|---|---|
| `EP-BUILD` | repository test run over source and over recorded emission fixtures | build | the build fails |
| `EP-REGISTRY-LOAD` | process start, before any listener binds | server | the process does not start |
| `EP-COMPOSE` | the registered projector builds `body` from one capability read or one orchestrator-state read | widget layer, inside the emitting request | the body is never offered to the minter; the answer degrades to plain text |
| `EP-FIT` | `degrade(envelope, profile)` — the eight-step fitting algorithm for the one `Lifecycle.delivery_channel` | widget layer, server | the emission becomes a `LIMITATION`/`HANDOFF`-only envelope |
| `EP-MINT` | closed-shape validation, intent minting, text minting, `body_hash`, `envelope_seal` | widget layer, same request | **no envelope exists**; nothing is delivered, nothing is stored |
| `EP-DELIVER` | the channel adapter hands bytes to the channel | widget layer | the envelope is not delivered |
| `EP-RENDER` | the renderer draws | client | the renderer draws `presentation.text_equivalent` as frozen prose plus one `REFINE` |
| `EP-FETCH` | a first-party route serves a stored artefact: timeline read, `file/<artifact_ref>`, the signed asset route, `pay/<session_ref>` | server | the body/file is withheld; the headline and terminal lines are served |
| `EP-INGRESS` | `IntentGateway`, Step 0 and the gates, in the order §3 fixes | widget layer, server | the submission is refused or superseded; no canonical owner is reached |
| `EP-CANONICAL` | `CanonicalActionIngressService.prepare()` → `ActionEngineKernel` → provider owner; and the approval owner's approve/reject route | Action Engine / approval owner | the policy resolver refuses |
| `EP-RETENTION` | historisation job, body-drop job, erasure job, tombstone write | background | the job fails; nothing is silently half-erased |

**F8 — the pipeline order is normative, and fitting precedes sealing.**

`EP-REGISTRY-LOAD → EP-COMPOSE → EP-FIT → EP-MINT → EP-DELIVER → EP-RENDER → EP-INGRESS → EP-CANONICAL`,

with `EP-FETCH` and `EP-RETENTION` on the stored artefact and `EP-BUILD` outside every request.
`body_hash` and `envelope_seal` are computed **after** degradation, over the degraded envelope;
a degraded envelope is a first-class envelope. The `RenderReceipt` is produced at `EP-FIT` and
attached to the envelope **before** `EP-MINT` seals, so that `render.render_tier` is in hand
when the emission validator runs and is inside `body_hash`. *Mechanism:* one `emit()` pipeline
with no branch that reaches the adapter before the `EP-MINT` result, and no branch that computes
a seal before the `EP-FIT` result. *Evaluation point:* `EP-BUILD` (pipeline-construction test).

**F9 — at `EP-RENDER` the renderer verifies a recomputed `body_hash` and `expires_at`, and
never the seal.** `envelope_seal` is a keyed HMAC; shipping the key to every renderer would
destroy unforgeability. `envelope_seal` is verified server-side only — at `EP-INGRESS` before
the first gate proceeds, and at `EP-FETCH` on the timeline read. The renderer's fallback —
frozen `text_equivalent` prose plus one `REFINE` — is triggered by a `body_hash` mismatch or by
expiry. Nothing is lost: a forged envelope a renderer would draw still cannot act.

**F10 — the alias map is normative.** Every evaluation point named anywhere in §§1–4 is read
through this table. A rule's stated point is the right-hand column.

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
| "n/a"; "none is claimed"; "design review gate"; "package gate"; "moment-registry review"; "gap-ledger review" | **not an evaluation point** — the sentence is `[NON-NORMATIVE]` (§0.19) |

**F11 — the gate numbering is §3's and only §3's.** Gate 4 is Tenant scope; **Gate 5 is
Verification floor**; Gate 6 is Authority; Gate 7 is the effect/confirmation check; Gate 8 is
input validation and Gate 8-R the spoken readback; Gate 13 is effect routing; Gate 14 is
canonical ingress. Any sentence elsewhere naming "Gate 4" as the floor comparison is read as
**Gate 5**. *Mechanism:* the gateway pipeline is constructed from a single ordered array whose
indices are asserted against §3's table. *Evaluation point:* `EP-BUILD`.

### 0.4 Mint classes and erasure classes

**F12 — every field of every shape in this contract carries exactly one mint class.**

| class | meaning |
|---|---|
| **M** | *server-minted* — produced by a named pure server function; recomputed and compared byte-for-byte at `EP-MINT` |
| **D** | *server-derived* — computed from server state (registry, session, policy) at `EP-MINT`, and recomputed at `EP-INGRESS` wherever it gates anything |
| **C** | *copied verbatim* from a canonical source artefact; equality to the source is checked by digest at `EP-MINT` |
| **E** | *emitter-supplied* — the projector may author it; it is structurally incapable of conferring authority |
| **Ø** | *no class — structurally absent from the composer input*: there is no field on the input type to supply it, and the closed-shape input validator refuses unknown fields |

`[NON-NORMATIVE]` The mint class column is the safety argument compressed into one letter per
field. Everything that decides what a user may do is **D** or **M**; everything an emitter
writes is **E**, and **E** fields decide presentation only.

**F13 — every persisted column of the widget layer's stores carries exactly one erasure class.**

| class | meaning |
|---|---|
| `AUDIT_RETAINED` | authority and audit; survives a conversation-erasure request |
| `CONVERSATION_CONTENT` | what the data subject said or was shown; erased on request |
| `CANONICAL_ELSEWHERE` | a copy of a value a canonical owner holds; erased here, retained there |

An unclassified column fails the build. *Evaluation point:* `EP-BUILD`.

**F14 — `frozen_nouns` is `AUDIT_RETAINED`.** A frozen noun is an opaque handle naming *what* —
never a value and never a word the data subject said. A handle to an appointment is not
conversation content.

**F15 — the decision path reads only `AUDIT_RETAINED` fields, and this is the rule that must
hold.** **No canonical business record, and no pending approval, may depend on any field
classified `CONVERSATION_CONTENT` or `CANONICAL_ELSEWHERE`.** The noun resolver's input is
exactly `{ capability, frozen_nouns, requested_scope_hash, principal_proof_hash, tenant_id,
confirmation_of_ref, produced_by_intent_token_hash }` — every one of them `AUDIT_RETAINED`.
`utterance_template`, `selected_labels`, `rendered_utterance`, `spoken_transcript` and the
`selection_domain` **labels** are `CONVERSATION_CONTENT` and are read by nothing after the
utterance-rendering gate. Consequently, erasing conversation history while an approval is
PENDING cannot leave it undecidable. *Mechanism:* a build-time reachability test — for every
field read on any code path that reaches the approval gate, the effect-routing gate, canonical
ingress, or an owner's approve/reject route, the field's erasure class must be
`AUDIT_RETAINED`; a read of any other class on those paths fails the build. *Evaluation point:*
`EP-BUILD`. It is complemented, not replaced, by the history-blind replay test, which exercises
the canonical read and action paths with the timeline store unreadable.

**F16 — the classification of the fields this contract adds.** `confirmation_of_ref`,
`produced_by_intent_token_hash`, `body_hash`, `selection_domain`, `c9_domain`, `priority`,
`widget_kind`, `readback_ack.readback_ref` and `readback_ack.body_hash` are all
`AUDIT_RETAINED` — hashes, handles, integers and enum members, carrying no conversation
content. **`readback_ack.affirmation` is `CONVERSATION_CONTENT`**: it is a word the data
subject said, it is compared against the closed affirmation vocabulary at submission time only,
and no later path reads it. The `selection_domain` **field** is `AUDIT_RETAINED`; the
`selection_domain` **labels** are `CONVERSATION_CONTENT`, and the two are distinct.

### 0.5 The three root members declared here

**F17.** `Origin`, `AuthorityEnvelope` and `Presentation` are declared here so that §1's
closed-shape validator is constructible and `body_hash` has a defined input. Every other root
member is declared in §1 or §4.

```ts
interface Origin {                                   // root member `origin`
  trigger: 'user_turn' | 'proactive' | 'system_reply';        // E
  emitter: 'orchestrator' | 'capability_read' | 'scheduler';  // D — the minter
  moment_key: string | null;                         // D — non-null iff trigger === 'proactive'
  proactive_provenance: ProactiveProvenance | null;   // D — non-null iff trigger === 'proactive'
}

interface AuthorityEnvelope {                        // root member `authority`
  verification_level: VerificationLevel;             // D — server-derived
  pii_class: 'none' | 'business_aggregate' | 'client_identified';  // D
  data_scope: { masked_fields: string[] };           // D — JSON Pointers narrowed before emission
  // type-level bans, as on ChannelProfile
  declares_role: never; declares_permissions: never; declares_capability: never;
}

interface Presentation {                             // root member `presentation`
  presentation_mode: 'client' | 'staff' | 'owner';   // D — from the authority snapshot; never emitter-supplied
  density: 'INLINE' | 'CARD' | 'SHEET';              // D — set at EP-FIT
  text_equivalent: TextEquivalent;                   // M
  speech: { lead: Phrase; readback_template: Phrase | null; overflow_say: Phrase | null } | null;  // M
  a11y: A11yBlock;                                   // M
  fullscreen_detail: { route_key: string; reason: FullscreenReason } | null;  // D
}

interface TextEquivalent {
  headline: string; body: string;                    // M — renderTextEquivalent
  itemized: string[];                                // M
  completeness_sentence: string | null;              // M
  unknowns_sentence: string | null;                  // M
}
```

*Mechanism:* these shapes are members of the same closed-shape validator family
(`widgetEnvelope()`); an undeclared key at any depth is refused with `unknown_field`.
*Evaluation point:* `EP-MINT`.

**F18 — `presentation_mode` is derived, never proposed.** It is computed from the authority
snapshot; `WidgetComposerInput` has no member for it. It may reorder, relabel and hide; it may
never add, remove or enable an intent, and no intent's `capability` may vary by it.
*Mechanism:* absence of the composer field, plus a property test asserting a byte-identical
intent set across all four presentation modes. *Evaluation point:* `EP-BUILD`.

### 0.6 The three key spaces and the capability reference

**F19 — there are three capability key spaces in this system, and they are disjoint in what
they govern.** They are **C9-CAP**, **TOOL-DEF** and **AE-CAP**. No fourth exists. The widget
layer's own `CONTROL_REGISTRY` (§0.7) is a fourth *namespace* but not a capability key space: it
is closed at three keys and has no registry row anywhere in the backend.

| | **C9-CAP** | **TOOL-DEF** | **AE-CAP** |
|---|---|---|---|
| **Identifier type** | `C9Capability.capabilityKey: string` | `AiToolDefinition.name: string` | `RegisteredActionCapabilityV1.capability: string` |
| **Declared at** | `src/orchestration/c9.registry.ts:52–70` (type), `:110–160` (population) | `src/ai-tools/ai-tool.types.ts` (type), `src/ai-tools/ai-tool.catalog.ts` (`MAYA_AI_TOOL_CATALOG`) | `src/action-engine/action-engine.contract.ts:170–195` (type), `action-engine.registry.ts:3444` (`CAPABILITIES`), `:3889` (`ActionCapabilityRegistry`) |
| **Cardinality (verified by enumeration)** | **56** = the 47 catalogue names + 9 extras | **47** | **226** |
| **Lookup** | `c9Capability(key, domain, registryHash)` — `c9.registry.ts:180` | `AiToolRegistryService.get(name)` | `ActionCapabilityRegistry.get(key)` — `:3894`; `.list()` — `:3913` |
| **Governs** | the **C9 orchestration run**: `mode` (`READ`/`PROPOSE_ONLY`/`OWNER_HANDOFF`), `resourceClass` (`LOCAL`/`SOURCE_READ`/`SOURCE_HANDOFF`), `domains`, `principalKinds`, timeouts, byte caps, `evidencePolicy`, `approvalAdapter`, `idempotencyAdapter` | the **AI-tool surface**: which tool names an LLM principal may see and call — `allowedRoles`, `allowedSurfaces`, `riskTier`, `approvalPolicy`, `requiredFeatures`, enforced by `AiToolPolicyService.listAllowed` / `.assertCanExecute` / `.assertCanDecide` | **whether an effect happens.** `actionClass`, `targetKind`, `allowedSourceTypes`, `riskFacets`, `policyKey`/`policyVersion`, `policyDecision`, `autonomyLevel`, `approvalRequirement`, `approvalTtlMs`, `executorKey`, `normalizeInput`, retention — enforced by `CanonicalActionPolicyResolver.resolve()` and `ActionEngineKernel` |
| **Does NOT govern** | **whether any effect happens.** `mode` is a run mode of a C9 capability, read by no Action Engine code path and appearing nowhere under `src/action-engine/` | **whether any effect happens**, and anything about an Action Engine capability: `assertCanExecute(principal, definition)` **cannot be called with an AE-CAP key at all**, because no `AiToolDefinition` exists for one | the widget layer's presentation, the C9 run, or the AI-tool surface. `RegisteredActionCapabilityV1` carries no role, no surface, no `riskTier`, no `approvalPolicy` and no `mode` |
| **Fail-closed on an unknown key** | `c9Deny('capability_not_registered')` | policy denial (`ForbiddenException`) | `ActionContractError` from `.get()`; `CanonicalActionPolicyRegistry.get()` throws `Canonical policy profile is not registered` |

**F20 — AE-CAP carries two co-keyed tables, and both are total over it.** Besides
`RegisteredActionCapabilityV1`, AE-CAP is also the key of **`CanonicalActionPolicyDefinitionV1`**
(`action-engine.policy-resolver.ts:72–84`), which carries `actorPolicy`,
**`allowedActorRoles: readonly UserRole[]`**, `trustedServiceSourceTypes`, `requiredFeatures`,
`permissionCodes`, `approverPolicyKey`, `clientPrincipalTarget`, `validityMs`. It is generated
by `canonicalProductionPolicyDefinitions()` as a total map over `ActionCapabilityRegistry.list()`
minus `kernel.test.*` — verified by enumeration: 221 definitions for 226 capabilities, the five
omissions being exactly the five `kernel.test.*` synthetics. An authority table keyed on AE-CAP
already exists and is already total, and every conferral fence of §0.16 is expressed over one of
these two tables.

**F21 — a rule citing a key MUST name its space. A bare capability string in a normative
sentence is void.**

```ts
type CapabilitySpace = 'C9' | 'TOOL' | 'AE' | 'CONTROL';

type CapabilityRef =
  | { space: 'C9';      key: string }          // C9Capability.capabilityKey              — 56
  | { space: 'TOOL';    key: string }          // AiToolDefinition.name                   — 47
  | { space: 'AE';      key: string }          // RegisteredActionCapabilityV1.capability — 226
  | { space: 'CONTROL'; key: ControlKey };     // §0.7, closed at 3

type ControlKey = 'control.run.cancel' | 'control.widget.dismiss' | 'control.delivery.resolve';
```

`WidgetIntent.capability`, `WidgetIntent.handoff_capability_ref`, `IntentTarget` of class `c`,
`IntentRecord.capability`, **`IntentRecord.handoff_capability_ref`**, every row key of
`WIDGET_CAPABILITY_POLICY`, and every **capability-valued** argument of `subjectCapability`,
`subjectFloor`, `requiredConfirmationKind`, `SENSITIVE_DEST`, `RUN_OPENING` and
`verificationFloor` are typed `CapabilityRef`, never `string`. The qualifier is load-bearing:
`subjectCapability` and `verificationFloor` take a **structural subject** (`IntentSubject`,
`FloorSubject`) rather than a ref, and the rule binds the capability members *inside* that
subject — `capability`, `handoff_capability_ref` and a class-`c` `target.ref` — not the subject
itself. *Mechanism:* the discriminated union above plus
`validateEnvelope`'s per-effect membership check against `C9_CAPABILITIES`,
`ActionCapabilityRegistry` and `CONTROL_REGISTRY` respectively; a source test asserting that
**no member or argument named above** is typed `string`. The test is stated over that list and
not as "zero `capability: string` in the widget layer", which would also condemn
`WidgetComposerInput.capability` and `AE_WIDGET_COMMIT_ALLOWLIST`'s own key type — neither of
which is an authority input — and so could never pass. *Evaluation points:* `EP-MINT`,
`EP-INGRESS` Gate 7, `EP-BUILD`. *Status:* `NORMATIVE-PENDING` on **P-24**.

**F22 — a `CapabilityRef` is an object and cannot key a `Record`, so the key form is declared
with it.**

```ts
type CapabilityRefKey = `${CapabilityRef['space']}:${string}`;      // e.g. 'C9:b35.preview'
declare function capKey(ref: CapabilityRef): CapabilityRefKey;      // `${ref.space}:${ref.key}`
      // total over the four spaces, and injective because `space` is one of four fixed tokens
      // and ':' is the only separator, so no two refs collide.
```

Every table keyed "on a `CapabilityRef`" is keyed on `capKey(ref)` at every site.

**F23 — the three lookups a derivation may use are pure, total and non-throwing, and the two
throwing accessors may not be substituted for them.** `c9Capability(key, domain, registryHash)`
throws `c9Deny('capability_not_registered')`, demands a `C9Domain` argument and refuses on a
registry-hash mismatch: it is a **run-admission** function, not a lookup, and using it in a
floor derivation would make the floor raise instead of returning a level and would make it
depend on which domain is asking. `AiToolRegistryService.get(name)`
(`ai-tool-registry.service.ts:58–73`) builds its map from `MAYA_AI_TOOL_CATALOG` alone and
throws `NotFoundException{ai_tool_not_found}` for any name outside it — it **never returns a
nullable**, so an optional chain over it is inoperative.

```ts
// DECLARED BY THIS CONTRACT. Pure, total, non-throwing, derived once at module load from
// frozen released arrays. None adds a field, a row, or a registry entry.
const C9_CAP_BY_KEY: ReadonlyMap<string, C9Capability> =
  new Map(C9_CAPABILITIES.map((c) => [c.capabilityKey, c]));
const MAYA_AI_TOOL_CATALOG_BY_NAME: ReadonlyMap<string, AiToolDefinition> =
  new Map(MAYA_AI_TOOL_CATALOG.map((d) => [d.name, d]));
const AE_CAP_BY_KEY: ReadonlyMap<string, RegisteredActionCapabilityV1> =
  new Map(new ActionCapabilityRegistry().list().map((c) => [c.capability, c]));

c9Registry.tryGet               = (key: string) => C9_CAP_BY_KEY.get(key);
actionCapabilityRegistry.tryGet = (key: string) => AE_CAP_BY_KEY.get(key);
```

Each is a `ReadonlyMap` and is read through `.get`, never bracket-indexed. `C9_CAPABILITIES` and
`MAYA_AI_TOOL_CATALOG` are read, never modified, and `C9_REGISTRY_HASH` is a hash of the array
rather than of any map derived from it, so F3 holds. *Status:* `NORMATIVE-PENDING` on **P-24**.

**F24 — the spelling relationships, verified by enumeration.** TOOL-DEF ⊂ C9-CAP **by
spelling**: all 47 catalogue names are C9-CAP keys. The 9 C9-only extras are
`c7.measurement.read`, `c8.result.read`, `b35.preview`, `b35.status`, `b35.confirm`,
`a22.configuration`, `owner_report.status`, `owner_report.download`, `c9.no_action`.
**AE-CAP ∩ (C9-CAP ∪ TOOL-DEF) = ∅** — the two spaces share no spelling. A key that resolves in
one space and not another therefore cannot be diagnosed by "the key is wrong"; it is **in the
wrong space**, and the only way to see that is to name the space.

**F25 — a C9-CAP key and its identically-spelled TOOL-DEF key carry different, independently
authored properties.** `C9Capability.mode` is computed as
`tool.riskTier === 'read' ? 'READ' : 'PROPOSE_ONLY'` (`c9.registry.ts:114`), so **no catalogue
tool is ever `OWNER_HANDOFF`**; the only two `OWNER_HANDOFF` keys in C9-CAP are the extras
`b35.confirm` and `a22.configuration`. Reading a `mode` as a tool property, or a `riskTier` as a
C9 property, is a category error the type of F21 prevents.

**F26 — no code maps a C9-CAP key to an AE-CAP key, so the mapping is a widget-layer table.**
`src/ai-tools/` imports nothing from `action-engine.registry`; `src/action-engine/` imports
nothing from `src/orchestration/`; the single edge between the trees is `c9.contract.ts:3`
importing `stableActionJson` from `action-engine.identity`, a hashing utility. The mapping
therefore cannot be derived from code: `AE_PROPOSE_PAIRING` (§0.7) is the build-time table that
says which pairings are admissible at all, and at runtime the canonical draft owner names the AE
key the `COMMIT` will carry (§0.13). An owner naming an unexpected AE key is refused, not
trusted.

### 0.7 The registries, the ledgers and the start-up assertion set

**F27 — `CONTROL_REGISTRY` is closed at three keys, and it is not the C9 canon.**

| control key | owner endpoint | `CONTROL_FLOOR` | what it changes | status |
|---|---|---|---|---|
| `control.run.cancel` | `POST /api/orchestration/runs/:id/cancel` | `BOUND_CLIENT` | terminates an unstarted coordination run | **[EXISTS]** — `orchestration/c9.controller.ts:92`; `c9.store.ts` cancel is write-once under `cancelKeyHash`, principal- and tenant-locked, and denies `cancel_races_dispatched_work` (`c9.store.ts:588–615`) |
| `control.widget.dismiss` | widget layer | `ANONYMOUS` | sets `Lifecycle.delivery` on one emission | `[ABSENT]` — P-16 |
| `control.delivery.resolve` | widget layer | `BOUND_CLIENT` | resolves one `dedupe_key` across channels | `[ABSENT]` — P-17 |

A missing `CONTROL_FLOOR` row fails the build.

**F28 — `WIDGET_CAPABILITY_POLICY` is keyed on `capKey(ref)` and is total over C9-CAP's 56 rows,
and over those only.** Its columns — `min_verification`, `consent_class` and `dispatch_is_synchronous` (R3.11.5's flag: false where the owner queues dispatch after `APPROVED`, so a `REQUEST_APPROVAL` or `COMMIT` **whose pairing row names that key as `propose`** refuses until the owner declares it — the flag is read through the propose key, never through the AE key, because this table has no AE rows) — are C9/TOOL
concepts and have no meaning over AE-CAP. A C9 key with no row fails the build; the 226 AE keys
are covered instead by F31's totality assertion. Any change to a row's `consent_class` or a
lowering of a `min_verification` is a contract version bump. *Mechanism:* a totality test
enumerating `C9_CAPABILITIES` against the table, and a monotonicity test. *Evaluation point:*
`EP-REGISTRY-LOAD`, with the enumeration also asserted at `EP-BUILD`.

**F29 — a fence over AE-CAP must be an allowlist, because a denylist over `riskFacets` fails
open.** `riskFacets: readonly string[]` (`action-engine.contract.ts:179`) is an **open
vocabulary**: not a union, not validated against any closed set, carrying **98 distinct tokens**
across the 226 rows (verified by enumeration). Any fence of the form "refuse when the facet is
present" admits every capability that simply does not carry the token, including every
capability registered after the fence was written. **Every conferral fence over AE-CAP is
therefore a positive, closed, build-checked allowlist, with everything not on it emitting
`capability_gap_ref` and no actuating control. Facet predicates survive only as build-time
vetoes: they can refuse a row, never admit one.**

**F30 — the two tables every actuating fence reads, and the pairing table behind them.**

```ts
interface AeCommitRow {
  ae_key: string;                                  // must resolve in ActionCapabilityRegistry
  confirmation_kind: 'BOOKING_CONFIRMATION' | 'SETTINGS_DRAFT'
                   | 'PAYMENT_HANDOFF' | 'APPROVAL';        // the four COMMIT-bearing kinds
  family: 'booking' | 'marketing_fanout' | 'money' | 'consent'
        | 'identity' | 'tenant_authority' | 'settings' | 'operational';
  min_verification: VerificationLevel;             // ≥ SESSION_VERIFIED for every row
  requires_ae_approval: boolean;                   // MUST equal registry.approvalRequirement === 'REQUIRED'
  propose: CapabilityRef;                          // the C9 propose key; never null
}

const AE_WIDGET_COMMIT_ALLOWLIST: Readonly<Record<string, AeCommitRow>>;
const AE_CAPABILITY_GAP_LEDGER:   Readonly<Record<string, string /* gap key */>>;
const AE_PROPOSE_PAIRING: readonly { propose: CapabilityRef; ae: CapabilityRef }[];
```

**F31 — the start-up assertion set. All 226 AE-CAP rows must be classified; an unclassified row
stops the process.** At `EP-REGISTRY-LOAD`, over `new ActionCapabilityRegistry().list()`:

```
row = AE_WIDGET_COMMIT_ALLOWLIST[cap.capability];  gap = AE_CAPABILITY_GAP_LEDGER[cap.capability];
(row XOR gap)                                                        else fail   // unclassified ⇒ no start
row ⟹ cap.policyDecision === 'ALLOW'                                 else fail   // SHADOW_ONLY / DENY never mintable
row ⟹ cap.allowedSourceTypes.includes('authenticated_request')       else fail
row ⟹ row.requires_ae_approval === (cap.approvalRequirement === 'REQUIRED')  else fail
row ⟹ canonicalProductionPolicyDefinitions() contains cap.capability else fail
row ⟹ cap.capability is the `ae` side of exactly one AE_PROPOSE_PAIRING row  else fail
row ⟹ MONEY(cap)            ⟹ row.confirmation_kind === 'PAYMENT_HANDOFF'    else fail   // veto
row ⟹ BOOKING(cap)          ⟹ row.confirmation_kind === 'BOOKING_CONFIRMATION' else fail // veto
row ⟹ BOOKING(cap)          ⟹ cap.capability is the `ae` side of exactly one pairing row else fail
row ⟹ MARKETING_FANOUT(cap) ⟹ row.family === 'marketing_fanout'              else fail   // veto
row ⟹ CONSENT(cap) ∨ IDENTITY(cap) ⟹ fail                                                // veto
row ⟹ TENANT_AUTHORITY(cap)        ⟹ fail                                                // veto
|{ cap : MARKETING_FANOUT(cap) ∧ cap.capability ∈ AE_WIDGET_COMMIT_ALLOWLIST }| === 1     else fail

every AE_PROPOSE_PAIRING row: propose.space === 'C9'                                    else fail
                          and propose.key resolves in C9_CAPABILITIES                     else fail
                          and ae.space === 'AE'                                           else fail
                          and ae.key resolves in ActionCapabilityRegistry                 else fail
       // the SPACE tags are asserted, not only the spellings. TOOL-DEF ⊂ C9-CAP by
       // spelling (F24: all 47 catalogue names are C9-CAP keys), so a ref written
       // { space: 'TOOL', key: <a C9 spelling> } would satisfy a key-only assertion and
       // then resolve against the wrong table's independently-set fields.
SETTINGS_DRAFT's resolved key set ∩ { cap : MONEY(cap) } === ∅                           else fail
```

The consent, identity and tenant-authority vetoes admit no exemption in this contract version.
*Mechanism:* one start-up loop over the enumerated registry — never over a transcribed list.
*Evaluation point:* `EP-REGISTRY-LOAD`. *Status:* `NORMATIVE-PENDING` on **P-23**, **P-25**.

**F32 — the family predicates, each stated once, each verified exhaustively by enumeration.**

```
BOOKING(cap)          := cap.targetKind === 'appointment'                                   // 13 of 226, 7 ALLOW

CONSENT(cap)          := cap.targetKind  ∈ {client_consent, client_consent_security}
                       ∨ cap.actionClass ∈ {record_client_consent,
                                            invalidate_client_consent_authority}            // 3 of 226

IDENTITY(cap)         := cap.targetKind  ∈ {auth_session, auth_subject_sessions, auth_identity}
                       ∨ cap.actionClass ∈ {link_social_auth_identity, revoke_other_auth_session,
                                            revoke_all_auth_sessions}                       // 6 of 226

MARKETING_FANOUT(cap) := cap.actionClass ∈ {deliver_bulk_campaign, send_bulk_campaign}
                       ∨ cap.targetKind  ∈ {marketing_campaign, marketing_client_recipient,
                                            audience}                                       // 4 of 226

TENANT_AUTHORITY(cap) := cap.targetKind  ∈ {tenant, tenant_user, internal_provider_user,
                                            staff_access, branch, tenant_branding}
                       ∨ cap.riskFacets  ∋ 'tenant_wide'                    // 28 of 226, 14 widget-reachable

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
                                            // 92 of 226; 39 of the 105 widget-reachable
```

`MONEY` is satisfied by 92 capabilities against 12 for the bare `'financial'` token, and by 39
of the widget-reachable 105 against 4. The complement was inspected in full and contains no
money-mutating capability. `cash-declaration.{declare,correct}.execute.v1` is the case that
settles the polarity: `ALLOW`, widget-reachable, and carrying **no** money token at all
(`['local','one_target','confirmed_observation','immutable_history']`) — only a positive
allowlist catches it.

**F33 — the two AE-CAP properties that already bite today.** Both are `[EXISTS]`, both are
total over AE-CAP, both are enforced inside `CanonicalActionPolicyResolver.resolve()` before any
effect:

- **`allowedSourceTypes`** — `policy-resolver.ts:321`. **A widget submission's only honest
  `ActionSourceType` is `authenticated_request`**; the widget layer may never mint `agent_task`,
  `scheduler`, `webhook`, `legacy_bridge` or `synthetic_shadow`, and a source test asserts the
  gateway constructs no other value. **53 of the 226 capabilities are unreachable from a widget
  by this property alone**, among them `package5.a18.consent-security-invalidation.execute.v1`,
  whose `allowedSourceTypes` is exactly `['legacy_bridge']`.
- **`policyDecision`** — `policy-resolver.ts:412–417`. Verified distribution over 226: **`ALLOW`
  129, `SHADOW_ONLY` 95, `DENY` 2** (`crm.visit.payment.v1`, `kernel.test.denied`).

Intersecting the two: **105 of 226 capabilities are both `ALLOW` and reachable from
`authenticated_request`.** That, and not 226, is the surface the allowlist must classify
positively. *Status:* `[EXISTS]`; the widget-side source-type discipline is
`NORMATIVE-PENDING` on **P-28**.

**F34 — the allowlist's declared membership in this contract version.** Three
`BOOKING_CONFIRMATION` rows — `crm.appointment.create.v1` (`confirmation_of_ref.kind: 'draft'`),
`.reschedule.v1` and `.cancel.v1` (`kind: 'record'`, with the guard of §0.13). Exactly one
`MARKETING_FANOUT` row — `communication.bulk-campaign.admit.v2`, `family: 'marketing_fanout'`,
`confirmation_kind: 'APPROVAL'`, `requires_ae_approval: true`, `min_verification:
SESSION_VERIFIED`. **Zero rows satisfying `MONEY`, `CONSENT`, `IDENTITY` or
`TENANT_AUTHORITY`.** Every remaining row is drawn from `AE_PROPOSE_PAIRING` and must survive
every veto of F31.

**F35 — a mechanism gap is not a capability gap, and the two ledgers are disjoint by key
shape.** A **capability gap** is "this act has no canonical owner": it belongs to
`AE_CAPABILITY_GAP_LEDGER`, is keyed on an AE-CAP capability, and is enforced by the
capability-gap machinery (a `Limitation` with a non-null `capability_gap_ref` and no actuating
control). A **mechanism gap** is "this component is not built yet":

```ts
interface MechanismGap {
  gap_key: `MG-${string}`;      // one per prerequisite row: MG-P01 … MG-P32
  p_ref: string;                // 'P-01' … 'P-32'
  component: string;
  status: '[ABSENT]' | '[EXISTS]' | '[PARTIAL]' | '[UNENFORCEABLE-TODAY]';
  package: string;              // the K-package that builds it
  blocking_rules: string[];     // every clause NORMATIVE-PENDING on this row
}
declare const MECHANISM_GAP_LEDGER: Readonly<Record<string, MechanismGap>>;
```

At `EP-REGISTRY-LOAD`, over the thirty-two prerequisite rows: (1) every row whose `status` is
not `[EXISTS]` resolves in `MECHANISM_GAP_LEDGER` under its own `gap_key`; (2) every
`NORMATIVE-PENDING` clause appears in **at least one** row's `blocking_rules`, and in **every**
row whose `p_ref` that clause's status names; (3) the binding is the **pair** `(clause, p_ref)`,
and the set of such pairs is exactly the set derivable from the clauses' own status lines. A row
with no key, a clause bound to no row, or a clause whose status names a `p_ref` whose row does
not list it, fails the assertion and the process does not start. A build assertion states that
the two ledgers' key shapes (`MG-` versus `GAP-`) are disjoint. Per-status prerequisite counts
are **derived from this ledger at build and printed from it**, never transcribed into prose.
*Status:* `NORMATIVE-PENDING` on **P-29**.

**F36 — the capability register: what resolves, what is deleted, and what is a declared GAP.**
Verified by enumeration over the working tree at branch
`codex/maya-brain-systemic-release-20260815`.

| Key | Resolves? | Ruling |
|---|---|---|
| `orchestration.run.read` | no | **Deleted.** A `PROGRESS` body is minted by the orchestrator itself from orchestrator state — it is not a capability read, so no key is needed. `PROGRESS`'s owner class is `ORCHESTRATION_RUN`, resolved at `EP-REGISTRY-LOAD` to the existence of the run, plus the registered `owner_report.status` for the report case |
| `orchestration.run.cancel` | no | **Deleted.** Cancel is `CONTROL` / `control.run.cancel`, whose owner endpoint exists |
| `booking.reschedule.propose` | no | **Deleted.** Replaced by the registered `appointments.own.reschedule` |
| `control.run.cancel`, `control.widget.dismiss`, `control.delivery.resolve` | not C9 keys, by design | the widget layer's own closed control registry; `subjectFloor` reads `CONTROL_FLOOR` |
| the eight reserved consent/identity/erasure names — `consent.pd.grant`, `consent.pd.withdraw`, `consent.marketing.grant`, `consent.marketing.revoke`, `identity.staff.telegram.unbind`, `identity.client.channel.unbind`, `consent.register.export`, `conversation.history.erase` | resolve in **no** space | **Declared GAPs.** Each emits `capability_gap_ref` and **no intent**: `GAP-CONSENT-PD-GRANT`, `GAP-CONSENT-PD-WITHDRAW`, `GAP-CONSENT-MKT-GRANT`, `GAP-CONSENT-MKT-REVOKE`, `GAP-IDENTITY-STAFF-UNBIND`, `GAP-IDENTITY-CLIENT-UNBIND`, `GAP-CONSENT-REGISTER-EXPORT`, `GAP-HISTORY-ERASE` |
| `consent.*` read owner, `identity.*`, commerce/loyalty **write**, `cutmatch.*` | no | blocked: `GAP-CONSENT-READ`, `GAP-IDENTITY-READ`, `GAP-COMMERCE-GIFT`, `GAP-LOYALTY-REDEEM`, `GAP-TIPS`, `GAP-MEDIA-GENERATION` |
| every other key cited in §2 — `catalog.services.read`, `catalog.staff.read`, `booking.availability.read`, `booking.group-availability.read`, `appointments.own.{create,reschedule,cancel,list}`, `staff.schedule.{read,own.read,update}`, `operations.journal.read`, `company.business-hours.read`, `clients.*`, `customers.count`, `b35.{preview,status,confirm}`, `c7.measurement.read`, `analytics.team-kpi.read`, `c8.result.read`, `analytics.business.{query,profit}`, `analytics.revenue.forecast`, `analytics.branches.compare`, `reports.recovered`, `expenses.{read,create}`, `clients.dossier.read`, `support.{integration-status.read,contact-admin.request}`, `settings.{read,update}`, `notifications.appointments.{read,update}`, `tasks.create`, `a22.configuration`, `owner_report.{download,status}`, `c9.no_action` | **resolve** | unchanged |

**F37 — the AE-CAP gap keys.** `GAP-APPOINTMENT-DETAIL-COMMIT`
(`crm.appointment.{attendance,duration,services,fields}.v1` — no propose key exists in any space
and none may be inferred or added), `GAP-BULK-SEND-DIRECT`
(`communication.bulk-campaign.execute.v1`, `communication.bulk-slot.admit.v2`,
`communication.bulk-campaign.shadow.v1`), `GAP-TENANT-CONFIG-COMMIT` (`a22.configuration`, which
has no AE mapping and whose two plausible covers may not be chosen between),
`GAP-EXPENSE-DELETE` (`expenses.delete.execute.v1` — registered, `ALLOW`, and with no propose
key at all), `GAP-EXPENSE-COMMIT`, `GAP-TENANT-BILLING`, `GAP-COMMERCE-CREDENTIALS`,
`GAP-VALUE-CONFIG`, `GAP-SUBSCRIPTION`, `GAP-REFERRAL-REWARD`, `GAP-CASH-DECLARATION`,
`GAP-TENANT-ADMIN`, `GAP-IDENTITY-SESSION`, `GAP-SEPARATION-OF-DUTIES`,
`GAP-ATTENDANCE-CONFIRM`. **A missing mapping is a GAP, and a GAP has no button.** None may be
filled by inference, by name similarity, or by a projector's choice at runtime.

**F38 — the propose↔AE mapping, traced call site by call site.** A row appears here only where
the trace from the AI-tool handler's dispatch through its service to a literal AE-CAP key or a
registered constant completed.

| C9-CAP key | Owner traversed | AE-CAP key |
|---|---|---|
| `appointments.own.create` | `AiToolHandlerService.createOwnAppointment` → `AppointmentsService.createForClient` → `CrmService` | `crm.appointment.create.v1` |
| `appointments.own.cancel` | → `AppointmentsService.cancelForClient` → `CrmService` | `crm.appointment.cancel.v1` |
| `appointments.own.reschedule` | → `AppointmentsService.rescheduleForClient` → `CrmService` | `crm.appointment.reschedule.v1` |
| `loyalty.internal.adjust` | → `LoyaltyService.adjustInternalBalance` | `loyalty.internal-adjust.execute.v1` |
| `expenses.create` | → `ExpensesService.create` → `P407ExpenseCanonicalCutoverService` | `expenses.create.execute.v1` |
| `expenses.period.complete` | → `ExpensesService.declarePeriodComplete` → same cutover | `expenses.period-declare.execute.v1` |
| `staff.schedule.update` | → `Package5Wave3CanonicalCutoverService.updateExternalStaffScheduleDay` | `package5.wave3.update-staff-schedule-day.execute.v1` |
| `settings.update` | → `DashboardPreferencesService.updateAssistant` → wave 1 | `package5.settings.assistant.execute.v1` |
| `tasks.create` | → `Package5Wave1CanonicalCutoverService.createTask` | `package5.work-item.task-create.execute.v1` |
| `tasks.complete` | → `Package5Wave1CanonicalCutoverService.completeTask` | `package5.work-item.task-complete.execute.v1` |
| `support.contact-admin.request` | → wave 1 `request_admin_contact` | `package5.work-item.admin-contact.execute.v1` |
| `notifications.appointments.update` | → `AppointmentNotificationsService.updateSettings` → wave 1 | `package5.settings.appointment-notifications.execute.v1` |
| `b35.confirm` | `CanonicalBulkService.request()` | `communication.bulk-campaign.admit.v2` |

*Status:* `AE_PROPOSE_PAIRING` is `NORMATIVE-PENDING` on **P-25**.

### 0.8 The verification ladder and the floor

**F39 — the ladder.** `VerificationLevel` is the closed five-member union `ANONYMOUS` (rank 0)
< `CHANNEL_IDENTITY` (rank 1, *identified, not verified*) < `BOUND_CLIENT` (rank 2) <
`SESSION_VERIFIED` (rank 3) < `STEP_UP_VERIFIED` (rank 4), with `maxLevel` the rank maximum.
**`STEP_UP_VERIFIED` is unreachable today**: no re-authentication event type exists in the
repository, so the resolver can never return rank 4 and every capability whose derived floor is
`STEP_UP_VERIFIED` is permanently withheld. That is fail-closed and correct, and it is a hole in
the product rather than a property of the design (§0.21 residual 5).

**F40 — one wire name: `verification_floor`.** It is a field of `WidgetIntent` and of
`IntentRecord`. **`required_verification` is a deprecated alias and MUST NOT appear in an
implementation** — not as a field, not as a parameter, not as a key at any depth of an envelope,
a submission, a profile or a record. *Mechanism:* the forbidden-key validator of §0.15 carries
`required_verification`; a source grep at build asserts zero occurrences. *Evaluation points:*
`EP-MINT`, `EP-INGRESS`, `EP-BUILD`.

**F41 — the subjects the floor is derived over.** The derivation reads a **structural** subject,
so that the minted intent and the persisted record both satisfy it and Gate 5 can recompute the
whole derivation — including the exempt branch — from an `IntentRecord`.

```ts
// The intent shape the floor derivation reads: §3's WidgetIntent with its two capability
// members retyped per F21.
type MintedIntent = Omit<WidgetIntent, 'capability' | 'handoff_capability_ref'> & {
  capability: CapabilityRef | null;
  handoff_capability_ref: CapabilityRef | null;
};

type IntentSubject = { capability: CapabilityRef | null;
                       handoff_capability_ref: CapabilityRef | null;
                       target: IntentTarget | null };

type FloorSubject = IntentSubject & { effect: EffectClass; priority: number };

declare function subjectCapability(i: IntentSubject): CapabilityRef | null;
      // SIGNATURE ONLY — the floor derivation below depends on it. Its single BODY is in §3.5,
      // which §0.2's map gives the subject capability and the consent fence. A signature here
      // and a body there is one declaration, not two; no third statement of either exists.
```

**Every caller must guard the null**, which is returned for a `NONE` effect and for a
`w`/`i`/`s`/`detail` `NAVIGATE`: a null subject means no capability is exercised.

**F42 — `IntentRecord` therefore carries what the recompute reads.** For Gate 5 to recompute
`verificationFloor()` and Gate 6 to dispatch, the persisted record carries `effect`,
`capability` and **`handoff_capability_ref`, both typed `CapabilityRef | null`**, `target`,
**`priority`** (mint class D, `AUDIT_RETAINED` — an integer, read by `FLOOR_EXEMPT`),
**`widget_kind`** (D, `AUDIT_RETAINED` — read by `KIND_FLOOR` and by the kind rule at Gate 7),
**`body_hash`** (D, `AUDIT_RETAINED` — read by Gate 8-R and by the `SUPERSEDED` comparison),
**`selection_domain`** (D, `AUDIT_RETAINED`) and **`c9_domain`** (F55). Without `priority` the
exempt branch is not recomputable at `EP-INGRESS` and every exempt intent would diverge and be
refused. §3 declares the shape. *Status:* `NORMATIVE-PENDING` on **P-02**, **P-30**.

**F43 — one derivation, total, over five intent inputs and the kind.**

```ts
// INPUTS: exactly i.effect, i.capability, i.handoff_capability_ref, i.target, i.priority,
// and kind. No other value is read. There is no `audience` term.
function verificationFloor(i: FloorSubject, kind: WidgetKind): VerificationLevel {
  if (FLOOR_EXEMPT(i)) {
    // Waive EFFECT_FLOOR, KIND_FLOOR and targetFloor — and, for a HANDOFF ONLY, the
    // destination subject term. NEVER waive a subject's OWN floor: control.run.cancel is
    // CONTROL_FLOOR BOUND_CLIENT and stays there.
    return i.effect === 'HANDOFF'
      ? 'ANONYMOUS'                             // the destination authenticates at its ingress
      : subjectFloor(subjectCapability(i));     // CONTROL and the C9 LOCAL row keep their own
  }
  return maxLevel(
    EFFECT_FLOOR[i.effect],                     // total over the 8 effect classes
    KIND_FLOOR[kind],                           // total over the 22 kinds
    subjectFloor(subjectCapability(i)),         // total, fail-closed, dispatched by space
    targetFloor(i.target),                      // total over the 5 target classes and null
  );
}
```

*Mechanism:* one pure function; `mintIntent()`'s signature has no floor parameter and
`WidgetComposerInput` has no such member; a source test asserts no assignment to
`verification_floor` outside `verificationFloor()`. *Evaluation points:* `EP-MINT` (derive),
`EP-INGRESS` Gate 5 (re-derive), `EP-BUILD` (the assignment test).

**F44 — the four floor tables, and the target table.**

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

`RISK_FLOOR['read'] = ANONYMOUS`: a read capability's protection is its
`WIDGET_CAPABILITY_POLICY` row's `min_verification` plus Gate 6, not its risk tier. A
`CHANNEL_IDENTITY` floor on reads would make every guest-chat and public-read envelope fail its
own floor, contradicting the `ANONYMOUS_CHAT` and `PUBLIC_READ` tiers.

`EFFECT_FLOOR['CONTROL'] = ANONYMOUS`, with the real fence in `CONTROL_FLOOR`: were `CONTROL`
floored at `BOUND_CLIENT`, the mandatory escape verb would be unreachable in guest chat. **The
effect class is not the fence; the control key is.**

`targetFloor('c') = ANONYMOUS` because `subjectCapability` already resolves a `c`-class target to
its own key; the term would otherwise double-count.

**F45 — `subjectFloor` is dispatched by space, and each branch is total with a named
fail-closed default.**

```ts
function subjectFloor(ref: CapabilityRef | null): VerificationLevel {
  if (ref === null) return 'ANONYMOUS';                      // NONE; w/i/s/detail NAVIGATE
  switch (ref.space) {
    case 'CONTROL': return CONTROL_FLOOR[ref.key];           // closed at 3; a missing key fails the build
    case 'TOOL':    return 'STEP_UP_VERIFIED';               // FAIL CLOSED — no intent may carry a TOOL ref
    case 'C9':      return c9Floor(ref);
    case 'AE':      return aeFloor(ref.key);
  }
}
```

**F46 — the C9 branch reads C9-CAP's own mandatory fields and calls no throwing accessor.**

```ts
// Total over all 56 C9-CAP keys.
function c9Floor(ref: CapabilityRef): VerificationLevel {
  const cap = c9Registry.tryGet(ref.key);                 // pure lookup over C9_CAPABILITIES
  if (cap === undefined)  return 'STEP_UP_VERIFIED';      // FAIL CLOSED — unregistered
  const row = WIDGET_CAPABILITY_POLICY[capKey(ref)];
  if (row === undefined)  return 'STEP_UP_VERIFIED';      // FAIL CLOSED — unclassified

  // TOOL-DEF's risk term applies to the 47 C9-CAP keys that are also catalogue names and to no
  // others. Where it does not apply it is REPLACED by terms that do — it is neither silently
  // strictest nor silently weakest.
  const def  = MAYA_AI_TOOL_CATALOG_BY_NAME.get(ref.key);  // ReadonlyMap.get — never throws
  const risk = def === undefined ? 'ANONYMOUS' : RISK_FLOOR[def.riskTier];

  return maxLevel(
    row.min_verification,
    risk,
    C9_MODE_FLOOR(cap.mode),
    C9_RESOURCE_FLOOR(cap.resourceClass),
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
    case 'SOURCE_READ':    return 'ANONYMOUS';        // a read's protection is its own row plus
                                                      // Gate 6, never a blanket
    case 'SOURCE_HANDOFF': return 'SESSION_VERIFIED';
    default:               return 'STEP_UP_VERIFIED'; // FAIL-CLOSED DEFAULT — a widened union
  }
}
```

`mode` and `resourceClass` are closed unions in the type system (`c9.registry.ts:56,68`), so both
tables are total **by type**; the `default:` branches are fail-closed guards against a future
widening. Observed distributions over the 56, by enumeration: `mode` READ 41 / PROPOSE_ONLY 13 /
OWNER_HANDOFF 2; `resourceClass` SOURCE_READ 40 / SOURCE_HANDOFF 15 / LOCAL 1. The catalogue's
47 `riskTier` values are read 35 / medium_write 7 / low_write 3 / high_write 2 — **zero
`restricted`** — so the risk term never yielded `STEP_UP_VERIFIED` for a catalogue name.

**F47 — the AE branch is total over AE-CAP and reads only AE-CAP's own mandatory fields.**

```ts
function aeFloor(key: string): VerificationLevel {
  const cap = actionCapabilityRegistry.tryGet(key);
  if (cap === undefined)                       return 'STEP_UP_VERIFIED';   // FAIL CLOSED — unregistered
  const row = AE_WIDGET_COMMIT_ALLOWLIST[key];
  if (row === undefined)                       return 'STEP_UP_VERIFIED';   // FAIL CLOSED — not allowlisted
  if (cap.policyDecision !== 'ALLOW')          return 'STEP_UP_VERIFIED';   // FAIL CLOSED — SHADOW_ONLY / DENY
  if (!cap.allowedSourceTypes.includes('authenticated_request'))
                                               return 'STEP_UP_VERIFIED';   // FAIL CLOSED — not widget-reachable
  return maxLevel(
    row.min_verification,                              // never below SESSION_VERIFIED
    AE_AUTONOMY_FLOOR(cap.autonomyLevel),
    AE_FAMILY_FLOOR[row.family],
  );
}

// autonomyLevel is typed `string`, not a union (action-engine.contract.ts:183), so this table
// CANNOT be total by type. It is made total by an explicit default.
function AE_AUTONOMY_FLOOR(level: string): VerificationLevel {
  switch (level) {
    case 'L2_CONFIRMED_REQUEST': return 'SESSION_VERIFIED';
    case 'L2_SERVER_POLICY':     return 'SESSION_VERIFIED';
    case 'L3_CANONICAL':         return 'SESSION_VERIFIED';
    case 'L3_OWNER_APPROVED':    return 'SESSION_VERIFIED';
    case 'L0_PROVIDER_DEFERRED': return 'STEP_UP_VERIFIED';   // provider-deferred: never chat-actuated
    case 'L2_5_SHADOW':          return 'STEP_UP_VERIFIED';   // unreachable anyway (policyDecision)
    case 'KERNEL_TEST_ONLY':     return 'STEP_UP_VERIFIED';
    default:                     return 'STEP_UP_VERIFIED';   // FAIL-CLOSED DEFAULT — a new level
  }                                                           // added upstream withholds, never admits
}

const AE_FAMILY_FLOOR: Readonly<Record<AeCommitRow['family'], VerificationLevel>> = {
  booking: 'SESSION_VERIFIED',  settings: 'SESSION_VERIFIED',  operational: 'SESSION_VERIFIED',
  marketing_fanout: 'STEP_UP_VERIFIED', money: 'STEP_UP_VERIFIED',
  consent: 'STEP_UP_VERIFIED',  identity: 'STEP_UP_VERIFIED',  tenant_authority: 'STEP_UP_VERIFIED',
};
```

The seven observed `autonomyLevel` values were obtained by enumeration —
`L2_CONFIRMED_REQUEST` 19, `L2_5_SHADOW` 95, `L0_PROVIDER_DEFERRED` 1, `L2_SERVER_POLICY` 50,
`L3_CANONICAL` 42, `L3_OWNER_APPROVED` 14, `KERNEL_TEST_ONLY` 5 — and the `default` branch
exists precisely because the field's type cannot forbid an eighth. `AE_FAMILY_FLOOR`'s five
`STEP_UP_VERIFIED` rows mean what they say: while step-up is unreachable, those five families are
permanently withheld — the same outcome the allowlist already produces, reached independently.

**F48 — the floor-exempt set is derived from declared members, never from a list of names.**

```ts
function FLOOR_EXEMPT(i: FloorSubject): boolean {
  return i.priority === 0
      && (i.effect === 'NONE' || i.effect === 'REFINE'
          || i.effect === 'CONTROL' || i.effect === 'HANDOFF')
      && (i.capability === null
          || i.capability.space === 'CONTROL'                      // closed at three
          || (i.capability.space === 'C9'                          // the unique LOCAL row
              && c9Registry.tryGet(i.capability.key)?.resourceClass === 'LOCAL'))
      && (i.effect !== 'HANDOFF'
          || (i.target?.class === 's'                              // a surface, not an act
              && !SENSITIVE_DEST(i.handoff_capability_ref)));
}

// CONSENT and IDENTITY are predicates over a REGISTERED AE capability — they read
// cap.targetKind and cap.actionClass — so they cannot be applied to a CapabilityRef directly.
// This is the ref-taking form: total over the four spaces by type, and fail-closed.
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
```

`priority` is server-set at mint like every other member of `WidgetIntent`, so an author cannot
promote an intent into the set; and promotion alone would not help, because the three remaining
clauses exclude every actuating effect, every non-`CONTROL` non-`LOCAL` capability, and every
handoff that does not target a surface.

**The fitter's step 1 gains one sentence: "A `FLOOR_EXEMPT` intent is never withheld at this
step."** Steps 2, 3, 5 and 6 are unchanged and still apply to it — an exempt intent touching a
`SECURE_SURFACE_ONLY` field is still withheld at step 2, and an effect exceeding the tier
ceiling is still withheld at step 3. Step 4's capacity PIN is unchanged.

**F49 — the build vetoes and the three separate bounds on the exempt set.**

```
FLOOR_EXEMPT(i) ⟹ i.effect ∉ {'NAVIGATE', 'DRAFT', 'REQUEST_APPROVAL', 'COMMIT'}   // build veto
priority === 0 ∧ effect === 'CONTROL' ⟹ capability.key === 'control.widget.dismiss' // build veto
|{ c ∈ C9_CAPABILITIES : c.resourceClass === 'LOCAL' }| === 1                       // build assertion
```

The first already follows from the effect clause; it is asserted separately so that a later
widening of the effect list cannot silently admit an actuating intent. The second holds because
`control.widget.dismiss` is the only control key whose own `CONTROL_FLOOR` is `ANONYMOUS`: a
`priority: 0` `control.run.cancel` or `control.delivery.resolve` fails the **build** rather than
silently joining the set — and the retained `subjectFloor` of F43 would have held their own
floors anyway, so this is defence in depth.

**Five intents satisfy the predicate in this contract version, and each is admitted by a clause,
not by being named. "Five" is a census, not a bound.** What bounds the set is three separate
grounds, only one of which is the veto:

- **`CONTROL`** — bounded by the build veto above.
- **`REFINE`** — bounded by the uniqueness assertion; the single `resourceClass: 'LOCAL'` row is
  `c9.no_action`, verified by enumeration.
- **`NONE` and `HANDOFF`** — **unbounded in number**, and acceptable because neither can
  actuate: a `NONE` carries `intent_token: null`, and a `HANDOFF` never invokes its destination
  and is additionally excluded by `SENSITIVE_DEST` where that destination is a consent or
  identity act.

| Intent | Clause that admits it | Why it exercises no authority |
|---|---|---|
| the escape verb | `effect: 'NONE'` with `capability: null`, or `effect: 'CONTROL'` with `control.widget.dismiss` | never cancels an appointment; appears in no routing map that reaches a canonical owner. On a `confirmation_subject: 'cancel'` body, cancelling **is** the `COMMIT` — a different intent, which the veto excludes by effect |
| `discard_intent` | it **is** an escape intent — declared "escape, priority 0" | destroys a widget-layer draft; reaches no canonical owner |
| `no_action_option.select_intent` | `effect: 'REFINE'`, `capability: c9.no_action`, whose `resourceClass` is `LOCAL` | the unique C9 row that touches no source; a structural property, not a name on a list |
| `reconnect_intent` | `effect: 'HANDOFF'`, `target.class === 's'`, `priority: 0` | a `HANDOFF` does not exercise its destination; it routes to a surface that demands its own verification at its own ingress |
| `editor_handoff_intent` | as above | as above |

The L11 extension remedy is **deliberately not** in this set: it is a `REFINE` on the widget's
own owner capability, so a principal below that capability's floor could not have received the
widget in the first place. It needs no exemption and keeps the step-4 capacity PIN it already
had.

**The general principle, stated once.** A floor governs **exercising authority**. Declining to
proceed, discarding local state, and asking for the route to a surface that authenticates are
none of those. Making cancellation harder to reach than confirmation is a safety inversion, not
a safety property.

*Mechanism:* the two build vetoes, the uniqueness assertion and the amended `verificationFloor`.
*Evaluation points:* `EP-BUILD`, `EP-FIT` (step 1), `EP-MINT`. *Status:* `NORMATIVE-PENDING` on
**P-11**, **P-19**.

**F50 — totality, and the two ways the floor fails closed.** At runtime an unmapped key yields
`STEP_UP_VERIFIED`, which is unreachable, so the intent can never be actuated. Independently, at
`EP-MINT` an intent whose subject capability has no policy row (C9) or no allowlist row (AE) is
**not emitted**: the envelope carries a `Limitation` with a non-null `capability_gap_ref` and no
intent. There is no default-to-zero path and no `undefined.min_verification` read.

**F51 — no floor may be lowered without changing a reviewed constant.**

```
declare const C9_FLOOR_BASELINE: Readonly<Record<string, VerificationLevel>>;   // 56 rows, pinned
∀ ref ∈ C9-CAP : c9Floor(ref) ≥ C9_FLOOR_BASELINE[ref.key]                      // build assertion
∀ ref ∈ C9-CAP : c9Floor(ref) !== 'STEP_UP_VERIFIED' ∨ ref.key ∈ DELIBERATELY_WITHHELD
```

`C9_FLOOR_BASELINE` is the vector this contract pins, so no later edit may lower any of the 56
without a reviewed diff. `DELIBERATELY_WITHHELD` is **the empty set in this contract version**,
so any key evaluating to the fail-closed level fails the build rather than silently withholding.
*Evaluation point:* `EP-BUILD`.

**F52 — divergence: one rule, one code.** At Gate 5 the gateway recomputes `verificationFloor()`
from the live tables and the record, and compares the session against **its own** result, never
the stored one. **Any** difference between the stored and the recomputed floor — raised or
lowered — refuses the submission with `SUPERSEDED / policy_floor_changed`, returns a freshly
composed envelope, and increments `widget_floor_divergence`. The same remedy applies either way,
and a second branch would be a second code path over a security-critical field. *Mechanism:*
pure-function re-evaluation plus one comparison. *Evaluation point:* `EP-INGRESS` Gate 5.

**F53 — shortfall: withheld at fitting, refused at ingress.** At `EP-FIT` step 1 an intent whose
floor exceeds the session's server-derived level is **withheld** with `reason:
'verification_floor'` and MUST be reachable via an emitted `HANDOFF` — that half is §0's, because
it is a property of the floor. If such a token is nevertheless submitted, Gate 5 applies a
per-effect branch, and **that branch table is declared once, in §3.4 R3.4.5**, because §0.2's map
gives the gate pipeline to §3. It is not restated here. What holds across every branch, and is
the reason the branch exists at all: **no branch renders as a failure.** *Mechanism:* the
fitter's step 1, and §3.4 R3.4.5's branch table. *Evaluation points:* `EP-FIT`,
`EP-INGRESS` Gate 5.

**F54 — the authority check at Gate 6 dispatches on `subjectCapability(record)`, and is scoped
by effect.** Dispatching on `record.capability` would skip the C9 branch for **every
`HANDOFF`** — the effect class whose subject is most often a C9 key — because the effect table
fixes `capability` null for exactly that class.

> The dispatch block itself — the four space branches, the five AE conditions, the two C9
> branches and the `CONTROL` handler lock — is **declared once, in §3.9 («Gate 6 in full»)**,
> because §0.2's map gives the gate pipeline to §3. It is not restated here. What §0 owns,
> and states above, is *why* the dispatch reads `subjectCapability(record)`.

> **For `effect === 'HANDOFF'` the subject resolves only the DESTINATION fences** —
> registration in its space, `SENSITIVE_DEST`, `targetFloor('s')`, and the landing surface's own
> ingress. It never resolves `assertCanExecute`, `c9Capability`'s domain/mode admission, or the
> AE commit allowlist, because a `HANDOFF`'s subject is a destination, not an act being
> performed: the field is referenced, never invoked. Applying an execute-admission test to it
> would stop a `BUSINESS_INTELLIGENCE` run from even **offering** the `a22.configuration` or
> `b35.confirm` handoff, and would demand an allowlist row for an AE destination that is being
> routed to rather than committed.

Here a throwing accessor is correct: Gate 6 is a refusal point and a raise *is* the refusal —
unlike a floor derivation, which must return a level. **The second C9 branch is weaker than the
first, and saying so is the point:** `c9Capability` refuses an unregistered key, a registry-hash
mismatch, a domain mismatch and a non-`READ` mode under `BUSINESS_INTELLIGENCE`, but applies
**no role, surface, feature or risk-tier test**. For the nine non-catalogue keys the role and
risk fences are their `WIDGET_CAPABILITY_POLICY` row's `min_verification` and `consent_class`,
carried through `c9Floor` at Gate 5 — a real fence, and a different one. And because
`WIDGET_CAPABILITY_POLICY` is total over all 56 with a build-time failure on a missing row, the
policy-row test above can never fire at runtime: it is a build-time totality restatement, not a
second runtime check. *Evaluation point:* `EP-INGRESS` Gate 6. *Status:* `NORMATIVE-PENDING` on
**P-01**, **P-26**, **P-30**.

**F55 — `c9_domain` is carried on the record, and its refusal is scoped to the path on which its
antecedent can be evaluated.** `c9Capability`'s `domain` is a required positional argument and a
gate cannot pass an argument the record does not carry.

```ts
// on IntentRecord — mint class D, AUDIT_RETAINED
c9_domain: C9Domain | null;   // the orchestrator's own published union
                              // ('ADMIN' | 'CLIENT_LIFECYCLE' | 'OCCUPANCY' |
                              //  'BUSINESS_INTELLIGENCE'), imported, never redeclared.
                              // Non-null IFF BOTH subjectCapability(record).space === 'C9'
                              // AND correlation.run_id !== null. Derived at EP-MINT from
                              // Correlation.agent_id — class D, derived by the minter from the
                              // run's registered agent. NEVER from the subject capability's own
                              // `domains`, which would compare a value with itself.
```

> **On the run-bearing path** — `correlation.run_id !== null` — an envelope carrying an intent
> whose **`subjectCapability(i).space === 'C9'`** is **refused at `EP-MINT` when
> `correlation.agent_id` is null**, and `c9_domain` is that value. The predicate is
> `subjectCapability`, never `capability`, so a run-bearing `HANDOFF` to a C9 destination cannot
> escape it.
> **On both run-less mint paths** — the registered capability read, and the proactive scheduler
> for the canonical moments — `run_id` and `agent_id` are null by construction, because the
> derivation "from the run's registered agent" has no input where there is no run. `c9_domain`
> is `null` there, and Gate 6's `c9Capability` half is explicitly **not applied**; the operative
> fence on those paths is Gate 5's `c9Floor` — the policy row's `min_verification` and
> `CONSENT_CLASS_FLOOR`.

*Status:* `NORMATIVE-PENDING` on **P-30**.

### 0.9 The effect classes, the control registry and the escape verb

**F56 — eight classes, and the ordering.** `EffectClass` is `NONE`, `NAVIGATE`, `REFINE`,
`CONTROL`, `DRAFT`, `REQUEST_APPROVAL`, `COMMIT`, `HANDOFF`. The **business ordering** is
`NONE < NAVIGATE < REFINE < DRAFT < REQUEST_APPROVAL < COMMIT`; **`HANDOFF` and `CONTROL` are
off that order** and are permitted per kind by explicit membership. A kind's *effect ceiling* is
the greatest ordered member of its `permitted_effects`; `CONTROL` never raises a ceiling.

**F57 — `CONTROL` is a permitted effect on all twenty-two kinds.** It is safe: `CONTROL` has no
Action Engine edge and may write nothing but the widget layer's own rows, and every kind needs a
dismissal. *Mechanism:* `KIND_REGISTRY` is a mapped type over `WidgetKind`; a start-up assertion
asserts `CONTROL ∈ permitted_effects` for all twenty-two rows and that `commit_allowed` is still
derived from the ordered members alone. *Evaluation points:* `EP-REGISTRY-LOAD`, `EP-MINT`.

**F58 — a `CONTROL` submission is fenced by the owner endpoint's own lock, not by
`assertCanExecute`.** `AiToolPolicyService.assertCanExecute` is keyed on an `AiToolDefinition`,
and no control key is in `MAYA_AI_TOOL_CATALOG` or in `C9_CAPABILITIES`. At Gate 6 a `CONTROL`
submission is checked against `CONTROL_FLOOR[key]` (carried at Gate 5), Gate 3's principal
binding and Gate 4's tenant assertion, and is then dispatched to the one registered handler for
that key, which performs its **own** principal and tenant check — for `control.run.cancel` that
check exists today and is write-once. The effect router has no default case and no
`CONTROL → ActionEngine` edge. *Mechanism:* the closed control registry plus the owner
endpoint's lock; a source test asserts each handler module imports no Prisma model outside the
widget layer's own except through that owner endpoint. *Evaluation points:* `EP-INGRESS` Gates
5/6/13, `EP-BUILD`.

**F59 — run cancellation is a `CONTROL`.** `PROGRESS.cancel_intent` is `effect: 'CONTROL'`,
`capability: { space: 'CONTROL', key: 'control.run.cancel' }`, `role: 'control'`.

**F60 — one escape intent, two effect classes, decided at fitting.** Every envelope whose
`lifecycle.input_lock !== 'none'`, and every envelope any of whose body declares a
`dismiss_intent` or `discard_intent` field, carries **exactly one** intent with `role: 'escape'`,
`priority: 0`, never dropped by degradation, whose `speech_aliases` include the universal cancel
verbs and which is additionally reachable as `/cancel` in Telegram. Its effect class is decided
at `EP-FIT`, before `EP-MINT` seals:

- `render_tier === 'RICH_INTERACTIVE'` → `effect: 'NONE'`, `intent_token: null`. Dismissal is
  genuinely local; there is nothing to send.
- every other tier → `effect: 'CONTROL'`, `capability: 'control.widget.dismiss'`, `intent_token`
  non-null. Dismissing a Telegram card requires `edit_message_text`; that is a server call and
  is classed as one.

The rule that `intent_token === null` exactly for `NONE` therefore holds with no exception, and
the escape's substantive content is preserved unchanged: it never cancels an appointment, it
appears in no routing map that reaches a canonical owner, and on a
`confirmation_subject: 'cancel'` body cancelling the appointment *is* the `COMMIT`. *Mechanism:*
the fitter's escape branch, then the closed-shape validator over the fitted envelope.
*Evaluation points:* `EP-FIT`, `EP-MINT`, `EP-INGRESS` Gate 13.

**F61 — `interaction_model` is deleted; `render_tier` is the discriminator.** Read
`interaction_model === 'RICH'` as `render_tier === 'RICH_INTERACTIVE'` and
`interaction_model === 'NOTIFICATION'` as `render_tier === 'ANNOUNCEMENT'`. *Mechanism:*
`ChannelProfile` has no `interaction_model` member; the closed-shape validator refuses one.
*Evaluation point:* `EP-REGISTRY-LOAD`.

**F62 — a consent or identity kind's mint fence excludes its own escape.** A `CONSENT_STATE` or
`IDENTITY_BINDING` envelope is refused at mint unless **every intent whose `role` is not
`'escape'`** has a derived `verification_floor ≥ SESSION_VERIFIED`, a non-null
`handoff_capability_ref`, and a target of class `s` resolving to a live shell route. Without this
those kinds would be unmintable whenever they carry the escape the contract mandates, and a rule
that cannot be satisfied is not a fence. The escape carries no capability, no target and no
consent decision, so it weakens nothing. *Mechanism:* the kind-level clause in
`validateEnvelope`, evaluated before `envelope_seal`. *Evaluation point:* `EP-MINT`.

### 0.10 The leaf taxonomy

**F63 — three leaf classes, and no fourth.** Every leaf of `body` is **datum** (`Cell<T>` /
`Measure`), **phrase** (a catalogue lookup) or **structural** (never rendered).

- **`LocaleText` is a deprecated alias of `Phrase`** and MUST NOT appear in an implementation:
  `LocaleText.key` ≡ `Phrase.phrase_key`, `LocaleText.text` ≡ `Phrase.rendered`, `params`
  absent. Every field typed `LocaleText` is read as `Phrase`.
- **`NarrativeText` is not a fourth class; it is the phrase class with typed slots.** Its
  replacement is `Narrative { narrative_template_id: string; narrative_template_version: number;
  slots: Record<string, CellPointer>; rendered: string }`, where the template is a member of the
  versioned `NARRATIVE_TEMPLATES` catalogue, keyed `` `${id}@${version}` ``, and every slot names
  a `Cell`, `Measure` or `Phrase` in the same body. **`NarrativeText.template` — "model-authored",
  guarded by `/^[^0-9]*$/` — is deleted**: that guard passes «выручка выросла вдвое». The
  catalogue lint is the only guard, and it rejects digits, Russian and English cardinals and
  ordinals, and the quantity tokens `пол-`, `треть`, `вдвое`, `half`, `double`, `top-N`. A model
  may select which server template is used, from a closed enum validated by a server table; it
  may not supply a character that reaches a user.
- **The bare rendered strings in §2's bodies are typed `Phrase`:** `OptionItem.media.alt`,
  `MEDIA_PREVIEW.alt`, `PROGRESS.steps[].unknown.label`.
- **A leaf is the whole `Cell`/`Measure`/`Phrase` value, or a structural scalar.** The minted
  strings *inside* a leaf — `Cell.label`, `Measure.basis`, `Measure.formatted`, `Phrase.rendered`,
  `Narrative.rendered` — are not separate leaves; they are covered by the pure-server-function
  rule and are inside `body_hash`.
- **The taxonomy governs `body` only.** Minted strings outside `body` —
  `WidgetIntent.label` / `utterance_preview` / `speech_aliases`, `A11yBlock.label` /
  `description`, `TerminalLine.text`, `presentation.text_equivalent.*` — are governed by the same
  pure-function rule under §1 and §3.

*Mechanism:* `buildCellIndex(kind, body_version, body)` against the kind's registered leaf
schema, in which every leaf carries a class; plus the catalogue lint; plus a schema-totality
test. *Evaluation points:* `EP-MINT`, `EP-BUILD`.

**F64 — a bare `UNKNOWN` member of a body value enum is deleted.** Unknown is carried by
`CellState`, never by a value domain, so that the five `Cell` branches are total and "UNKNOWN is
a statement, not a failure" reaches every field. Concretely:
`TIME_SLOT_SELECTOR.slots[].availability: Cell<'FREE'|'TAKEN'>`;
`SCHEDULE.entries[].state: Cell<'BOOKED'|'BLOCKED'|'FREE'>`;
`PROGRESS.steps[].state: Cell<'PENDING'|'RUNNING'|'DONE'|'SKIPPED'>` with `steps[].unknown`
deleted (its `reason_code`, `label` and `next_intent_ref` are the `Cell`'s own);
`SOURCE_STATUS.sources[].state: Cell<'CONNECTED'|'DEGRADED'|'UNLINKED'>`;
`SOURCE_STATUS.overall: Cell<'OK'|'PARTIAL'|'BLOCKED'>`;
`IDENTITY_BINDING.bindings[].state: Cell<'LINKED'|'UNLINKED'|'PENDING'>`;
`APPROVAL.state: Cell<'PENDING'|'APPROVED'|'REJECTED'|'COMPLETED'|'EXPIRED'>`. **`HELD` is
absent from every one of them**, and no enum anywhere in §2 has a `FAILED` member: an outcome
not yet known is a non-`KNOWN` `Cell` with reconciliation language. *Mechanism:* the leaf schema
plus `widgetCell()`'s per-state shape check. *Evaluation point:* `EP-MINT`.

### 0.11 Intent references, interactive references, and the `0..12` bound

**F65 — every `*_intent` / `intent_token` field of every body holds an `intent_ref`, never a
token.** `intent_ref` is envelope-local (`'i1'`), class **structural**, never rendered.
`intent_token` exists only on `WidgetIntent.intent_token` and travels only in the carrier. The
four non-nullable escape handles — `BOOKING_CONFIRMATION.dismiss_intent`,
`PAYMENT_HANDOFF.dismiss_intent`, `FORM.discard_intent`, `SETTINGS_DRAFT.discard_intent` — hold a
ref, which is always non-null whatever the escape's effect class is.

**F66 — a per-element handle names one envelope-level intent, not one intent per element.**
Where a `*_intent` field sits on a repeated element — `OptionItem.intent_ref`,
`slots[].intent_ref`, `TableSpec.row_intents`, `SCHEDULE.entries[].detail_intent` /
`move_intent`, `bulk_intents[].intent_ref` — it names the single envelope-level intent whose
`InputSchema` field of kind `enum`/`ref` has that element's id in its closed `domain_ref`; the
element id is the **selection**, not a second intent. Consequence: `TIME_SLOT_SELECTOR` at its
12-slot cap carries five intents (select, more, widen, none-fit, escape), `SCHEDULE` at its
24-entry cap carries four, `CLIENT_LIST` at its 10-row cap carries at most six — all inside
`intents: 0..12`. *Mechanism:* the leaf schema types these fields as `intent_ref`;
`validateEnvelope` asserts each resolves to an emitted intent and that the element id is a member
of that intent's `domain_ref`. *Evaluation point:* `EP-MINT`.

**F67 — `InteractiveRef`'s seven members are the typed authority for what a reading order may
contain.** The union is `option`, `field`, `intent`, `row`, `entry`, `section` and **`slot`** —
the seventh added because `TIME_SLOT_SELECTOR`'s declared interactive path
`groups[].slots[].slot_ref` could be denoted by none of the other six, leaving the booking flow's
central kind with an unsatisfiable membership rule. Any prose enumeration that names `series_id`
is void as an enumeration: `series_id` is a **structural** value, never rendered, and no kind's
`interactive_paths` produces one. `{k:'section'}` is a declared-but-unproduced branch today, and
is named as such so that nobody reads its existence as a claim that something produces it.

**F68 — per-kind membership is derived, and the derivation is declared in §4.8 A-0.**

`InteractiveRef`, `refKey`, `refSet` and the `produced` / `reading_order` derivation are
declared **once, in §4.8 A-0**, and are **not restated here**. The derivation reads
`render.render_tier` off the `RenderReceipt` and filters against the fitter's `emitted` set —
both §4 artefacts — so §4.8 is where it belongs, beside the `A11yBlock` that carries its output.

What §0.11 owns, and states here, is the reference **model** the derivation ranges over: the
`intent_ref` handle a `{k:'intent'}` ref carries is the emission-local handle and **never**
`intent_token`, which is opaque and null for a `NONE` effect; and the `0..12` bound below.
*Mechanism:* the single derivation in §4.8 A-0, recomputed by `validateEnvelope`.
*Evaluation point:* `EP-MINT`.

### 0.12 The key-space rule per effect

**F69 — which space each effect class may name, and the one space no intent may name.**

| effect | may carry | must not carry |
|---|---|---|
| `NONE` | nothing (`capability: null`) | anything |
| `NAVIGATE` | a `C9` ref **only** when `target.class === 'c'`; otherwise nothing | `AE`, `TOOL`, `CONTROL` |
| `REFINE` | a `C9` ref | `AE`, `TOOL`, `CONTROL` |
| `DRAFT` | a `C9` ref | `AE`, `TOOL`, `CONTROL` |
| `HANDOFF` | `capability: null`; the destination is a `C9` or `AE` ref in `handoff_capability_ref`, referenced and never invoked | a `TOOL` ref |
| `CONTROL` | a `CONTROL` ref | `C9`, `AE`, `TOOL` |
| `REQUEST_APPROVAL` | an `AE` ref | `C9`, `TOOL`, `CONTROL` |
| `COMMIT` | an `AE` ref | `C9`, `TOOL`, `CONTROL` |

**No intent of any effect class may carry a `TOOL` ref.** *Mechanism:* `validateEnvelope`'s
per-effect membership check against `C9_CAPABILITIES`, `ActionCapabilityRegistry` and
`CONTROL_REGISTRY`. *Evaluation points:* `EP-MINT`, `EP-INGRESS` Gate 7.

**F70 — the widget layer never bridges a key space; it uses each for what it is.** C9-CAP keys
are **read and propose** keys: `c9.registry.ts:114` mints every non-read catalogue entry as
`PROPOSE_ONLY` with `resourceClass: 'SOURCE_HANDOFF'`. AE-CAP keys are **actuating** keys. The
conversion never happens in the widget layer: a `DRAFT` carrying a C9 propose key is routed at
Gate 13 to that capability's registered canonical draft owner, and **that owner** composes the
confirmation body and names the Action Engine key the `COMMIT` will carry. The widget layer
records the pairing against `AE_PROPOSE_PAIRING`; it does not compute it.

**F71 — a first-party shell route takes one opaque parameter.** A shell target is a closed route
enum plus one `param` that is an opaque server-minted handle matching `/^[A-Za-z0-9_-]{8,64}$/`:
it is not a path, not a query string, not an origin and not a provider id, and the forbidden keys
of §0.15 apply at every depth. `shell.pay` carries a `session_ref` and `shell.file` an
`artifact_ref`; both carry `targetFloor('s') = SESSION_VERIFIED` and re-check the live
principal's proof hash at `EP-FETCH`. §3 declares the shape. *Evaluation points:* `EP-MINT`,
`EP-FETCH`.

### 0.13 The confirmation guard

**F72 — `requiredConfirmationKind` is a table lookup with no default branch.**

```ts
function requiredConfirmationKind(ref: CapabilityRef): WidgetKind {
  if (ref.space !== 'AE') refuseMint('wrong_space');                 // FAIL CLOSED — F21
  const row = AE_WIDGET_COMMIT_ALLOWLIST[ref.key];
  if (row === undefined) refuseMint('capability_not_allowlisted');   // FAIL CLOSED
  return row.confirmation_kind;
}
```

A derivation with a default branch is not a fence. Measured against the registry, a
`financial` ⟹ `PAYMENT_HANDOFF`, else `targetKind === 'appointment'` ⟹ `BOOKING_CONFIRMATION`,
else `SETTINGS_DRAFT` chain routes **118 of 226 capabilities — 94 of the 105 widget-reachable —
onto `SETTINGS_DRAFT`, a COMMIT-bearing kind, by falling off the end of a two-test chain**: the
bulk marketing send, every tenant-billing charge, every commerce-credential installation, every
loyalty-ledger mutation, every gift-certificate redemption, every subscription checkout, every
referral reward, tenant suspension, session revocation and consent recording. A fence whose
negative branch is "render a commit button" is not a fence. *Evaluation points:* `EP-MINT`,
`EP-INGRESS` Gate 7.

**F73 — exactly four kinds may carry a `COMMIT`:** `BOOKING_CONFIRMATION`, `SETTINGS_DRAFT`,
`APPROVAL`, `PAYMENT_HANDOFF`. `FORM` is not among them.

**F74 — `confirmation_of_ref`, and the guard against the obvious bypass.**

```ts
confirmation_of_ref: { kind: 'draft' | 'record' | 'approval'; ref: string };  // NON-NULL iff effect === 'COMMIT'
produced_by_intent_token_hash: string | null;   // AUDIT_RETAINED
```

`kind: 'draft'` for `create`, every `SETTINGS_DRAFT` and every `PAYMENT_HANDOFF`;
`kind: 'record'` for `reschedule` and `cancel` (the `appointment_ref`); `kind: 'approval'` for an
`APPROVAL` decision (the `approval_ref`). Without this generalisation cancel, reschedule and
both approval decisions are structurally unmintable.

> A `COMMIT` whose `confirmation_of_ref.kind !== 'draft'` is mintable **only** when
> `produced_by_intent_token_hash` is non-null and names a **consumed record**, as follows — the
> producing effect class and the identity compared are fixed **together**, because the two cases
> live in different key spaces:
>
> | `confirmation_of_ref.kind` | producing record's effect | identity that must hold |
> |---|---|---|
> | `'record'` (reschedule, cancel) | `REFINE` or `DRAFT` | the record's **C9** capability equals the `propose` side of the `COMMIT`'s `AE_PROPOSE_PAIRING` row |
> | `'approval'` (an APPROVAL decision) | `REQUEST_APPROVAL` | the record's **AE** capability equals the `ae` side of that same row — i.e. it equals the `COMMIT`'s own AE key |

The identities differ because only `REFINE`, `DRAFT`, `HANDOFF` and a class-`c` `NAVIGATE` may
carry a C9 ref while only `COMMIT` and `REQUEST_APPROVAL` may carry an AE ref, and the two spaces
share no spelling: "equal to the propose key" can never hold for the approval case, so requiring
it would refuse every APPROVAL decision unconditionally.

**What the guard holds, in full, in both rows:** a `COMMIT` may not be minted from a bare
reference the caller supplies. It must name a record the gateway itself consumed, whose
capability is the one being actuated or the canonical owner's own propose key for it, whose
confirmation body was returned by that owner in response to a gateway submission. Populating
`confirmation_of_ref` with a bare `appointment_ref` or `approval_ref` does not satisfy it.
*Mechanism:* the mint function's two-part refusal; Gate 7 re-checks both. *Evaluation points:*
`EP-MINT`, `EP-INGRESS` Gate 7. *Status:* `NORMATIVE-PENDING` on **P-25**.

**F75 — an `APPROVAL` body carries both decisions, and they are one actuating subject.** An
`APPROVAL` body mints **both** `approve_intent` and `reject_intent`; they are two mutually
exclusive decisions on **one** approval object, not two commits on two subjects.

```
APPROVAL        ⟹ max_commit_intents === 2
kind !== 'APPROVAL' ⟹ max_commit_intents ∈ {0, 1}                       // build veto
max_commit_intents === 2 ⟹ exactly one approve/reject pair, both non-null, both carrying the
                           SAME confirmation_of_ref.ref (the approval_ref) and the SAME AE
                           capability; consuming either marks the other consumed
```

*Evaluation points:* `EP-BUILD` (the veto), `EP-MINT`.

**F76 — the widget-kind check lives at mint and at Gate 7, and nowhere downstream.**
`CanonicalActionIngressService.prepare()` receives `TrustedActionExecutionRequestV1` — tenant,
capability, `source.{type,sourceRef,actorUserId}`, `targetRef`, input, `evidenceRefs`,
`intentExpiresAt`, `callerIdempotency`, `bookingIntent` and five server-owned slot bindings — and
carries **no widget-layer field**; `confirmation_subject`, `widget_kind` and their camelCase
spellings have zero occurrences under `src/action-engine`. Passing one would make a canonical
mutation conditional on widget-layer state, which FR-1, FR-2 and the forbidden edges forbid.
Every claim that the Action Engine independently re-derives a widget kind or a confirmation
subject is void; the check is enforced at `EP-MINT` and at `EP-INGRESS` Gate 7, over the widget
layer's own `IntentRecord`.

**F77 — what the Action Engine independently enforces, verbatim from the code.**
`assertNoCallerAuthority(request)` and `assertResolverOwnsDecision(preview, policy)`
(`action-engine.ingress.ts:71,107,141,161`); `source.type` membership in the capability's
`allowedSourceTypes`; `readClientActionPrincipal`'s evidence-prefix and cardinality check; and,
for a client-principal create, a mandatory `bookingIntent` —
`ClientBookingIntentContext { snapshot, hash, encrypted }` — with `creationMode === 'client'`,
`allowBusy === false`, `notifyBySmsHours === 0` and a `create/`-prefixed `targetRef`.
**The honest strength of that fence, stated once: it is shape, source-type and durable
attribution — not a second authorisation of the widget path.** `readClientActionPrincipal`
validates prefixes and cardinality only, and its own source comment reads that an evidence
reference is durable attribution, never a bearer credential. The authorisation of a booking
commit is the gateway's Gates 5–7 plus Gate 14's policy resolver, which the caller cannot
influence. *Status:* `[EXISTS]`. *Evaluation point:* `EP-CANONICAL`.

**F78 — the schedule drag resolves through a key that exists.** `SCHEDULE.entries[].move_intent`
is a `REFINE` carrying the registered C9 key **`appointments.own.reschedule`**, which C9
classifies `PROPOSE_ONLY` / `SOURCE_HANDOFF` — so it cannot actuate, passes the registry lookup,
the denied-set check and Gate 6, and is routed at Gate 13 to the canonical booking owner, which
returns a `BOOKING_CONFIRMATION` with `confirmation_subject: 'reschedule'`. The `COMMIT` is
minted onto that body alone, carrying `crm.appointment.reschedule.v1`. `SCHEDULE`'s ceiling stays
`REFINE`.

### 0.14 `SETTINGS_DRAFT` and the finance fence

**F79 — the admissible owner classes are six.**

| owner class | keys |
|---|---|
| `SETTINGS_OWNER` | `settings.read`, `settings.update` |
| `NOTIFICATION_PREF_OWNER` | `notifications.appointments.read`, `notifications.appointments.update` |
| `SCHEDULE_RULE_OWNER` | `staff.schedule.update` |
| `TENANT_CONFIG_OWNER` | `a22.configuration` — gap-blocked on `GAP-TENANT-CONFIG-COMMIT` |
| `TASK_OWNER` | `tasks.create`, `tasks.complete`, `tasks.list` |
| `AUDIENCE_OWNER` | `b35.preview`, `b35.status`, `b35.confirm` — whose only actuating key routes to the `APPROVAL` path |

Two of the six therefore carry no `SETTINGS_DRAFT` commit in this contract version. The draft
class is declared **here and only here**, as a named type, so that §2.6.16's body can name it
without re-declaring it — a closed set stated twice is a closed set that can drift, and this one
already had:

```ts
type DraftClass = 'settings' | 'notification_pref' | 'task' | 'schedule_rule' | 'audience';
```

`'expense'` and `'loyalty_adjustment'` are **not** members. `expenses.create` is gap-keyed under
`GAP-EXPENSE-COMMIT` (F82's sibling ruling) and `loyalty.internal.adjust` is `MONEY` and routes
to the gap-blocked `PAYMENT_HANDOFF` (F82), so neither can reach a `COMMIT` body on any kind.

**F80 — the exclusion is explicit and mechanical.** A `COMMIT` may be minted onto
`SETTINGS_DRAFT` only when `requiredConfirmationKind(ref) === 'SETTINGS_DRAFT'` for that capability's `AE`-space `CapabilityRef` **and** its C9
propose key's `WIDGET_CAPABILITY_POLICY` row has `consent_class ∈ {none, communication}`.
Excluded by construction: every **finance**-class capability, every **booking-effect**
capability, and every **personal_data** or **identity_binding** capability. *Mechanism:* the
`EP-REGISTRY-LOAD` assertion that `SETTINGS_DRAFT`'s resolved key set is disjoint from
`{cap : MONEY(cap)}`, the `EP-MINT` refusal, and Gate 7's re-check.

**F81 — `consent_class: 'finance'` is defined once, and it covers balances.** Finance is every
capability that creates, moves, redeems or reverses money or a money-equivalent balance:
payment, prepayment, refund, gift certificate, membership, tips, loyalty **redemption and loyalty
adjustment**. *Mechanism:* the `consent_class` column of `WIDGET_CAPABILITY_POLICY`, whose every
change is a contract version bump.

**F82 — `loyalty.internal.adjust` carries no `SETTINGS_DRAFT` commit.** It is
`riskTier: 'high_write'`, `approvalPolicy: 'owner'` (`ai-tool.catalog.ts:911–933`), and its
Action Engine counterpart `loyalty.internal-adjust.execute.v1` carries
`riskFacets: ['local','financial','customer_value']`, so `MONEY` holds and the allowlist veto
routes it to `PAYMENT_HANDOFF`, which is gap-blocked with a null `commit_intent` and no button.
The identical economic effect is fenced identically on both kinds, which is what the payment
fence was for.

**F83 — expense recording carries no `COMMIT` on any kind, and the consequence is stated rather
than hidden.** `expenses.create` maps to `expenses.create.execute.v1`, registered with
`riskFacets: ['local','financial','expense_ledger','atomic']`, `targetKind: 'expense'`,
`approvalRequirement: 'REQUIRED'`. `MONEY` holds by **three independent terms**, so
`requiredConfirmationKind` cannot return `SETTINGS_DRAFT` for it. `expenses.create.execute.v1`
and `expenses.period-declare.execute.v1` are in `AE_CAPABILITY_GAP_LEDGER` under
`GAP-EXPENSE-COMMIT`, and `expenses.delete.execute.v1` under `GAP-EXPENSE-DELETE` — it has no
propose key in any space at all. `expenses.read` remains a read.

> **This is a capability reduction, not a design win.** Expense recording is a real, wanted,
> already-shipped AI-tool capability with no widget button in this contract version. It follows
> mechanically from two independent decisions made elsewhere: the Action Engine's decision to tag
> expense creation `financial`, and this contract's decision that every financial capability
> routes to a gap-blocked `PAYMENT_HANDOFF`. **The resolution is a single owner decision:** either
> the Action Engine retags expense recording — it moves no money, and `MAX_EXPENSE_RUBLES`
> already bounds it at `expense-category.ts`, with the `value <= 0 || value > MAX_EXPENSE_RUBLES`
> rejection — or `PAYMENT_HANDOFF` ships and expenses reach a button through it. Until one
> happens, `GAP-EXPENSE-COMMIT` is the honest state.

### 0.15 Approval, and the forbidden-key list

**F84 — the four-eyes claim is deleted, not weakened.** No field named `four_eyes`, `fourEyes`,
`separation_of_duties` or `separationOfDuties` may appear in an implementation, and no widget may
render, imply, narrate or speak separation of duties.

**F85 — the true, weaker guarantee, stated in full.**

> **Who may decide an approval is decided by the capability's own registered approval policy,
> evaluated against a principal resolved inside the deciding request — never by which widget was
> rendered, never by any field of an envelope or a submission, and never by a renderer.** For an
> Action Engine approval that is `ActionEngineKernel.decideApproval()`
> (`action-engine.kernel.ts:521`), which requires `execution.state === PENDING_APPROVAL`,
> `approvalDecision === PENDING` and `approvalRequirement === 'REQUIRED'`; requires the durable
> canonical policy binding — `policyContextHash`, `policyEvidenceJson`, `policyEvaluatedAt`,
> `policyValidUntil`, `approvalBindingHash` — all non-null, accepting **no caller-supplied
> approval flag or hash anywhere**; requires `approvalExpiresAt > now`; reads a live `Membership`
> for `approverUserId` and requires `status === active`; and requires
> `approver.role ∈ CANONICAL_APPROVER_POLICY_ROLES.get(approverPolicyKey)` — for the one
> registered policy `'tenant-owner'`, the set `{tenant_owner, business_owner}`. **An unregistered
> or absent `approverPolicyKey` throws `CANONICAL_APPROVER_POLICY_INVALID`: the decision fails
> closed, it does not default.** Verified by enumeration: 19 non-test capabilities carry
> `approvalRequirement: 'REQUIRED'`, and every one resolves `approverPolicyKey: 'tenant-owner'`.
> The system therefore enforces **role-gated approval, not separation of duties** — the role set
> may include the initiator. A widget confers nothing here: rendering a decision control is not
> permission to use it, and a decision submitted from a widget that should never have been
> rendered is refused by the same call.

*Status:* `[EXISTS]`. *Evaluation point:* `EP-CANONICAL`.

**F86 — an `APPROVAL` decision intent may be null only for a server fact at compose time.**
`approve_intent` / `reject_intent` may be null, with a non-null `blocked_reason`, only when
`state !== 'PENDING'`, the approval's TTL has passed, or the live principal cannot decide under
the AE-CAP approver policy — probed through the **AE-CAP** path, never through
`AiToolPolicyService.canDecide`, which cannot be called for an AE key. It may **never** be null
because the approver equals the initiator. *Mechanism:* the composer calls the probe and has no
rule of its own; a fixture test asserts no other branch nulls a decision intent. *Evaluation
points:* `EP-COMPOSE`, `EP-BUILD`.

**F87 — where separation of duties is genuinely required, there is a gap and no button.** A
capability whose owner determines that an initiator must not decide carries
`capability_gap_ref: 'GAP-SEPARATION-OF-DUTIES'` and **no decision intent**. *Mechanism:* the
emission validator. *Evaluation point:* `EP-MINT`.

**F88 — the forbidden-key list, stated once: one union, three enforcement points.**

`arguments`, `payload`, `state` *(outside a declared body enum field)*, `role`, `permissions`,
`token`, `tenant_id` *(outside the envelope root)*, `client_id`, `staff_id`, `record_id`,
`is_staff`, `is_owner`, `__meRole`, `__meIsStaff`, `__meIsFounder`, `url`, `href`, `endpoint`,
`checkout_url`, `return_url`, `provider_ref`, `bridge_method`, `required_verification`,
`interaction_model`, `four_eyes`, `fourEyes`, `booking_effect`, `presentation_hint`.

*Mechanism:* one structural validator — a total walk over the serialized value — applied to
`WidgetEnvelope`, `WidgetIntentSubmission`, `ChannelProfile`, `NativeBridgeManifest` and
`IntentRecord`. *Evaluation points:* `EP-MINT`, `EP-INGRESS`, `EP-REGISTRY-LOAD`.

### 0.16 The conferral fences

**F89 — the sixteen fundamental rules, FR-1 … FR-16, over twenty-one rows.** Each rule has
**one** enforcing mechanism and **one** evaluation point; every other statement of the same rule
elsewhere in this contract is `[NON-NORMATIVE]` defence-in-depth commentary. **All twenty-one
rows hold.** Many hold **fail-closed because a component is absent**, and the status column says
which: a rule that holds because no allowlist exists yet is a rule that holds, but it is not a
running fence.

| # | Rule | Key space | The one enforcing mechanism | The one evaluation point | Honest status |
|---|---|---|---|---|---|
| **FR-1** | **WIDGET ≠ BUSINESS OWNER** | — | The effect router is a closed switch whose only write edges are the widget layer's own stores, the three control-registry handlers, and `CanonicalActionIngressService.prepare()`; a build import test asserts the gateway module imports no Prisma model outside the widget layer's own | `EP-INGRESS` Gate 13 | `[ABSENT]` over an `[EXISTS]` ingress — holds fail-closed: no router exists |
| **FR-2** | **WIDGET STATE ≠ BUSINESS STATE** | — | `WidgetIntentSubmission` has no `body` and no state member, and no canonical table holds a column referencing `widget_id` — asserted by a schema test | `EP-INGRESS` (shape) | `[ABSENT]` — holds fail-closed |
| **FR-3** | **BUTTON ≠ AUTHORITY** | **AE-CAP** | `CanonicalActionPolicyResolver.resolve()` → `resolveActorPermission()` against `CanonicalActionPolicyDefinitionV1.allowedActorRoles` + `requiredFeatures` + `evaluateTenantAccessState`, over a `Membership` read inside the deciding request; `assertNoCallerAuthority` forbids caller-supplied authority; `authority_hint` is read by no server decision. Gate 6 pre-screens the same key against the allowlist and the same role set, and Gate 14's answer governs any disagreement | `EP-CANONICAL` (binding); `EP-INGRESS` Gate 6 (pre-screen, via `preview()`) | resolver `[EXISTS]`; Gate 6 dispatch `[ABSENT]` — **holds fail-closed today: with no allowlist there is no actuating button** |
| **FR-4** | **CHANNEL IDENTITY ≠ BUSINESS AUTHORITY** | all four | `verificationFloor()` recomputed from the live tables and the record and compared against the server-derived `verification_level`, capped by `profile.max_verification_level`; every actuating class floors at ≥ `BOUND_CLIENT` and every `COMMIT` at ≥ `SESSION_VERIFIED` | `EP-INGRESS` Gate 5 | `[ABSENT]` — holds fail-closed |
| **FR-5** | **WIDGET EVENT → TYPED INTENT → CURRENT AUTHORITY CHECK → CANONICAL OWNER**, no shortcut | — | One ordered gate pipeline is the single ingress for all five carriers (Step 0), with no branch that skips a gate | `EP-INGRESS` | `[ABSENT]` — holds fail-closed |
| **FR-6a** | No widget kind confers **consent** | **AE-CAP** | `CONSENT(cap)` ⟹ excluded from `AE_WIDGET_COMMIT_ALLOWLIST`, asserted at start-up; the only widget affordance is a `HANDOFF` of class `s` to `shell.privacy` at `≥ SESSION_VERIFIED`. Backed at the engine by `actorPolicy: 'VERIFIED_CLIENT_CHANNEL'` + `assertConsentChannelBinding` against a live, unrevoked `ClientChannelLink`, and by `allowedSourceTypes: ['legacy_bridge']` for the invalidation capability | `EP-REGISTRY-LOAD` (exclusion), `EP-MINT` (refusal), `EP-CANONICAL` (engine fence) | exclusion `[ABSENT]`; engine fence `[EXISTS]` — holds |
| **FR-6b** | No widget kind confers **booking authority** | **AE-CAP** | `BOOKING(cap)` (§0.7 F32); an allowlist row must be `BOOKING_CONFIRMATION` and the `ae` side of exactly one pairing row; plus F74's `confirmation_of_ref` + `produced_by_intent_token_hash` guard | `EP-REGISTRY-LOAD`, `EP-MINT`, `EP-INGRESS` Gate 7 | `[ABSENT]` — holds fail-closed |
| **FR-6c** | No widget kind confers **marketing permission** | **AE-CAP** | `communication.bulk-campaign.admit.v2` is the **only** `MARKETING_FANOUT` capability on the allowlist, asserted by cardinality at start-up; its own `approvalRequirement: 'REQUIRED'` + `approverPolicyKey: 'tenant-owner'` + `allowedActorRoles: [TENANT_OWNER, BUSINESS_OWNER]` + `actorPolicy: 'REQUIRED'` are the fence. The other three are `GAP-BULK-SEND-DIRECT` | `EP-CANONICAL` (the fence); `EP-REGISTRY-LOAD` (the cardinality assertion) | AE fence `[EXISTS]` and running; cardinality assertion `[ABSENT]` — holds |
| **FR-6d** | No widget kind confers **finance permission** | **AE-CAP** | `MONEY(cap)` (facet ∪ targetKind — **92 of 226**, against 12 for the `'financial'` token) is a build-time **veto**; the fence is that **no money-mutating capability is on the allowlist at all**, all 92 being gap-keyed, and `PAYMENT_HANDOFF` is gap-blocked with a null `commit_intent` and no button | `EP-REGISTRY-LOAD`, `EP-MINT`, `EP-INGRESS` Gate 7 | `[ABSENT]` — **holds today by absence: no money-mutating capability has a button** |
| **FR-6e** | No widget kind confers **tenant authority** | tenant id, plus AE-CAP for the tenant object | `TenantContextService.assertTenantId` over the record's tenant and the live principal's; reinforced by `evaluateTenantAccessState` at the resolver and by `assertNoCallerAuthority`. Separately, `TENANT_AUTHORITY(cap) ⟹ fail` is a start-up veto, so no tenant-object capability is ever allowlisted (`GAP-TENANT-ADMIN`), and `IDENTITY(cap)` likewise (`GAP-IDENTITY-SESSION`) | `EP-INGRESS` Gate 4; `EP-REGISTRY-LOAD`; `EP-CANONICAL` | cross-tenant half `[EXISTS]`; the veto `[ABSENT]` — holds |
| **FR-6f** | No widget kind confers **approval** | **AE-CAP** | `ActionEngineKernel.decideApproval()` → `canonicalApproverRoles()` → `CANONICAL_APPROVER_POLICY_ROLES[approverPolicyKey]` against a live `Membership`; an unregistered key throws `CANONICAL_APPROVER_POLICY_INVALID` | `EP-CANONICAL` | `[EXISTS]` — holds, and see F90(4) and F96(1) for what it does not do |
| **FR-7** | **Only a final canonical confirmation may cause a booking effect** | — | The mint-time non-existence of a booking `COMMIT` token before the canonical owner has returned a confirmation body (F74) | `EP-MINT` | `[ABSENT]` — holds fail-closed |
| **FR-8** | **No `BUTTON → PROVIDER`** | — | `IntentTarget` has no member able to hold a URL, host, origin or query string (F71), and the provider owner is called by the Action Engine alone | `EP-MINT` | shape `[ABSENT]`; boundary `[EXISTS]` |
| **FR-9** | **No `BUTTON → DATABASE BUSINESS MUTATION`** | — | `EffectClass` has no `MUTATE`/`EXECUTE` member; the only road to a business row is Gate 14, and `CONTROL` has no Action Engine edge | `EP-MINT` (closed union) | `[ABSENT]` — holds fail-closed |
| **FR-10** | **The LLM never generates chart numbers** | — | `validateEnvelope` recomputes `sha256(stableActionJson(series))` and requires equality with the `series_digest` the read service returned; every coordinate on both axes is a `Cell`/`Measure` carrying a `fact_ref` | `EP-MINT` | `[ABSENT]` — and the read facade it depends on does not exist, so `CHART` is not emittable (§0.21 residual 2) |
| **FR-11** | **UNKNOWN is never rendered as failure** | — | The renderer conformance suite: five branches per `Cell`, no `danger`/`destructive`/`alert` token, no error icon, no `role="alert"`, no auto-retry bound to a non-`KNOWN` state | `EP-BUILD` | `[ABSENT]` |
| **FR-12** | **Conversation history is never business, consent or booking state** | — | The erasure-reachability test of F15 | `EP-BUILD` | `[ABSENT]` |
| **FR-13** | **CHAT-FIRST ≠ CHAT-ONLY** | — | The emission validator requires a non-null `presentation.fullscreen_detail` on every `FORM` body, every settings-class body and every envelope whose `InputSchema` carries a non-closed field | `EP-MINT` | `[ABSENT]` |
| **FR-14** | **Role removal from UX ≠ role removal from security** | — | Gate 6 reads Membership / Staff / Client binding and never `presentation_mode`, `profile_id` or `a11y_env` | `EP-INGRESS` Gate 6 | policy `[EXISTS]`; wiring `[ABSENT]` |
| **FR-15** | **One interaction contract across platforms** | — | One gateway, one gate pipeline, one profile registry; a `native-shell` profile that differs from `pwa` in any field other than `native_bridge`, `a11y_env`, `motion`, `text_scale`, `color_scheme`, `viewport_min_css_px` is refused | `EP-REGISTRY-LOAD` | `[ABSENT]` |
| **FR-16** | **No C9 contract change, no canonical schema change** | — | A build test asserting `C9_REGISTRY_HASH` is unchanged, that `RegisteredActionCapabilityV1` gains no field, and that no canonical table gains a column | `EP-BUILD` | `[ABSENT]` as a test; the property holds — this contract adds no field to either registry |

**F90 — four honest limits of the AE-CAP role and approver fences, recorded so nobody over-reads
them.**

1. **The role default is permissive.** `allowedActorRoles(capability)`
   (`action-engine.policy-registry.ts:102–177`) is a chain of `capability.startsWith(...)` tests
   with a final `return TENANT_ACTION_ROLES` — **twelve roles including `CLIENT`, `CUSTOMER`,
   `EMPLOYEE`, `STAFF` and `INTEGRATION_SERVICE`**. Verified: **164 of the 221 policy definitions
   receive that default.** The role fence is genuine where a prefix rule names the capability and
   nearly vacuous elsewhere. This is why the allowlist carries a per-row `min_verification` and
   the contract does not simply trust the policy registry.
2. **`permissionCodes` is not evaluated.** It is shape-validated and recorded into the
   attestation evidence, and is read by **no decision anywhere**. No rule of this contract may
   cite it as a fence.
3. **`actorPolicy: 'OPTIONAL_TRUSTED_SERVICE'` admits an actorless call** when `actorUserId` is
   absent and `sourceType ∈ trustedServiceSourceTypes`. It is irrelevant to the widget layer only
   because F33 fixes the widget source type to `authenticated_request`, which
   `canonicalProductionPolicyDefinitions()` explicitly excludes from `trustedServiceSourceTypes`.
   That exclusion is load-bearing; a build test asserts it.
4. **`controlledFixtureMode` widens the approver set.** When set, `approverRoles` becomes
   `APPROVER_ROLES` — six roles including `administrator`, `tenant_admin`, `platform_owner`,
   `platform_admin` — instead of the two the canonical policy names. FR-6f's fence holds only
   while `controlledFixtureMode === false` in production; a build test asserting that is
   `[ABSENT]` (**P-27**), and until it exists the guarantee is `[NON-NORMATIVE]`.

### 0.17 The two disclosed floor reductions

**F91 — no repair in this contract admits a capability, widens an allowlist, or relaxes a veto.
Two repairs lower a floor, deliberately, and each names its compensating fence. There are
exactly two, and this table is where a reader auditing the contract finds both.**

| Reduction | What it lowers | Why, and what still holds |
|---|---|---|
| **the nine non-catalogue C9-CAP keys** (F46) | from a raise (the borrowed TOOL-DEF term applied to a key the catalogue does not carry) or `STEP_UP_VERIFIED` to: **three** `SOURCE_HANDOFF` keys (`b35.preview`, `b35.confirm`, `a22.configuration`) → `SESSION_VERIFIED`; **five** `SOURCE_READ` keys (`c7.measurement.read`, `c8.result.read`, `b35.status`, `owner_report.status`, `owner_report.download`) → whatever their own `WIDGET_CAPABILITY_POLICY` row and consent class require; and `c9.no_action` → `ANONYMOUS` | `STEP_UP_VERIFIED` is **unreachable**, so the prior value was not a fence but a permanent withholding that made `STRATEGY_OPTIONS`, `CLIENT_LIST`, `METRIC`, `CHART`, `PROGRESS` and `ARTIFACT` unemittable — `c9.no_action` is `STRATEGY_OPTIONS`'s mandatory "do nothing" option, and a contract that makes declining harder than proceeding is inverted. What still fences these nine: their `WIDGET_CAPABILITY_POLICY` row and `CONSENT_CLASS_FLOOR`, carried through `c9Floor` at Gate 5 on **every** path — and, **on the run-bearing path only AND only where the intent's effect is not `HANDOFF`**, Gate 6's second C9 branch with `c9Capability`'s own admission (F54 scopes Gate 6 by effect, and F55 withdraws that admission on both run-less mint paths). **`resourceClass` does not determine effect class**: the same key may be the subject of a `REFINE` or a `DRAFT`, so no effect may be inferred from it. The residual fence splits by exemption rather than conjoining terms that never all hold at once: **for a `HANDOFF` that is not `FLOOR_EXEMPT`** it is `C9_MODE_FLOOR`/`C9_RESOURCE_FLOOR` of `SESSION_VERIFIED` at Gate 5 **together with** `targetFloor('s')`; **for a `FLOOR_EXEMPT` class-`s` `HANDOFF`** both are waived and the fence is `SENSITIVE_DEST` plus the landing surface's own ingress. Within `verificationFloor`, `SENSITIVE_DEST` participates in exactly one place — `FLOOR_EXEMPT`'s fourth clause — so there and only there it and the two floors are alternatives rather than a conjunction. It is evaluated **again**, independently, at the emission validator's INV-8′ and at Gate 6, and those evaluations are unaffected by this reduction. The bulk-send path additionally keeps `AE_FAMILY_FLOOR['marketing_fanout'] = STEP_UP_VERIFIED` and `communication.bulk-campaign.admit.v2`'s owner-only, approval-bound AE fence, which is `[EXISTS]` and running today: **the proposal becomes visible; the send does not** |
| **the five `FLOOR_EXEMPT` intents** (F48–F49) | `EFFECT_FLOOR`, `KIND_FLOOR` and `targetFloor` waived for all five; `subjectFloor` waived for the **two class-`s` `HANDOFF`s only**, which floor at `ANONYMOUS`. The escape verb, `discard_intent` and the no-action option keep their own `subjectFloor` | The set is derived, not listed, and its build vetoes make an actuating intent unconstructible: `COMMIT` and `DRAFT` excluded by effect; `REQUEST_APPROVAL` and `REFINE` excluded over AE and C9 respectively by the capability clause, which admits only a `CONTROL` ref or the unique `resourceClass: 'LOCAL'` C9 row; and a `priority: 0` `CONTROL` may only be `control.widget.dismiss`. `control.run.cancel` retains `CONTROL_FLOOR: BOUND_CLIENT` even at `priority: 0`, and `SENSITIVE_DEST` excludes consent and identity destinations outright. The residual is `targetFloor('s')` on a handoff, and it is tolerable for a stated reason: a `HANDOFF` never invokes its destination capability, and the shell routes re-check the principal proof at `EP-FETCH` |

**A floor raise is a defect too, and one was removed.** The first formulation of the C9 branch
set `C9_RESOURCE_FLOOR['SOURCE_READ']` to `SESSION_VERIFIED`, which would have raised the floor of
**40 of the 56** C9-CAP keys and broken the `ANONYMOUS_CHAT` and `PUBLIC_READ` tiers that F44
protects. It returns `ANONYMOUS`, and a read's floor is once again its own policy row plus
Gate 6. An unasked-for raise withholds capability while looking like caution.

### 0.18 Prerequisites and what "pending" means

**F92 — thirty-two prerequisite rows carry the build status of every mechanism this contract
names**, each with a `MG-P01` … `MG-P32` key in `MECHANISM_GAP_LEDGER`. A row leaves
`NORMATIVE-PENDING` when, **and only when**, (a) the named mechanism exists at a stated path,
(b) `EP-BUILD` carries a test that fails if it is removed, and (c) the corresponding gap key is
withdrawn from the capability-gap ledger in the same commit. Withdrawing a gap key without (a)
and (b) is the failure mode the ledger exists to prevent, and the ledger is versioned with the
contract so that a withdrawal is a reviewable diff.

**F93 — the rows this contract's own machinery depends on.** **P-11** the floor derivation,
**P-12** a step-up mechanism, **P-19** the renderer and CI substrate, **P-23**
`AE_WIDGET_COMMIT_ALLOWLIST` + `AE_CAPABILITY_GAP_LEDGER` with the start-up assertion set,
**P-24** `CapabilityRef` and the per-effect space rule, **P-25** `AE_PROPOSE_PAIRING`, **P-26**
Gate 6's key-space dispatch, **P-27** the `controlledFixtureMode === false` build assertion,
**P-28** the widget `ActionSourceType` discipline, **P-29** `MECHANISM_GAP_LEDGER` itself,
**P-30** the gateway's record fields and the spoken-readback path, **P-31**
`A11yBlock.accessible_names`, **P-32** the moment, notification-consent and template
catalogues. **None is `[EXISTS]` today**, and the widget layer does not exist in any form; each row's status is §A1's, and P-19 is `[UNENFORCEABLE-TODAY]` rather than `[ABSENT]` because a renderer import-graph allowlist is buildable in principle and has no substrate to run in.

**F94 — the correct reading of this contract today.** The rules are implementable and their
mechanisms are named; **the mechanisms are not running.** Every rule marked
`NORMATIVE-PENDING` is binding on the implementation and fail-closed until its component ships.

### 0.19 `[NON-NORMATIVE]` register

**F95.** Every statement listed here appears in this contract without a mechanism that can make
it true, or with a mechanism this contract cannot name. Each is `[NON-NORMATIVE]` — it survives
as rationale and no implementation depends on it — or is **deleted** where it is a false claim
about the running system. No implementation may cite one as an enforcing mechanism.

**Downgraded to `[NON-NORMATIVE]`:**

1. §2's twelve-row ARIA-and-keyboard table, insofar as it is stated as an obligation. The
   renderer conformance suite asserts five branches per `Cell` and per-state token bindings; it
   asserts nothing about `role` attributes, `aria-colindex`, rowgroup structure or per-role
   keyboard models. §4's per-kind floor table is the normative accessibility artefact.
2. "the five client-preview / PII enforcement points". The **count** is unproven — the five are
   enumerated nowhere. What remains normative: *no widget-layer module may implement PII masking
   of its own; the projector reaches a capability only through the same service call sites the
   non-widget read paths use.* *Mechanism:* an import/architecture test. *Evaluation point:*
   `EP-BUILD`.
3. "the display fence" on `CLIENT_LIST`. No display fence is defined in this contract, and no
   clause cites one any longer: `CLIENT.2` now states its own `validateEnvelope` refusal
   directly (§2.6.7). The normative content is that refusal, plus `pii_ceiling:
   'client_identified'`, F18 and the masking rule.
4. The consequence sentence "the equality is only satisfiable by a whole copy… so it cannot be
   emitted": it holds only for elements marked `copied`. `facts_origin` is emitter-supplied and
   `facts_digest` does not cover synthesised elements; this is the design's largest honesty gap
   and the sentence stops overstating it.
5. "the seal key is held by exactly three minters". No minter registry, key-custody mechanism or
   CI check is named. The normative remainder is the enumeration of the three composer services
   and the fact that no renderer, adapter or job holds the key — a design requirement on the
   package, not a checked property.
6. The blast-radius argument ("a compromised renderer can still choose which legal option to
   submit").
7. §2's five self-assessments, §3's six honest-register items, §4's eight, and §1's withdrawal
   table — all already rationale.
8. The proactive editorial-judgment boundary; the duplex-voice boundary; the data-subject-rights
   boundary — all three already declare that no mechanism is claimed.
9. Any citation of `readClientActionPrincipal` as an authorisation mechanism: it validates
   prefixes and cardinality only, and is a shape-and-attribution check (F77).
10. The marketing disclosure argument (`audience_size` carried as a `Measure`, `audience` ordered
    before `options`). Disclosure is not a fence; FR-6c gives the real one.
11. §2's readiness table as a *derivation*: it is re-derived over the corrected key sets and is
    correct there; as originally stated it rested on three keys that do not resolve.
12. The schema test "no canonical table may hold a foreign key to `widget_id`". An FK-absence
    assertion does not exclude an untyped string column; the load-bearing test is the
    history-blind replay, and this one is retained as a cheap complement.
13. `STRATEGY.4`'s "may not be emitted on a proactive trigger", which names an evaluation point
    but no mechanism. The mechanism is the emission validator keyed on
    `origin.trigger === 'proactive'`, which already covers it; the clause is redundant rather
    than enforcing.
14. Every occurrence of "[TO BUILD]" as a description of the running system.
15. The projector-side recomputation of `rows_digest` as a standalone guarantee: it proves only
    that the body matches the rows the projector held. The read facade's digests are the
    normative form.

**Deleted as false against the repository:**

16. The four-eyes claim in full (F84; verified: zero occurrences, and the approval path admits
    the initiator under both policies).
17. "`orchestration.run.cancel` … so it passes the registry lookup" (zero occurrences).
18. `orchestration.run.read` as a registry key (zero occurrences).
19. `booking.reschedule.propose` (zero occurrences).
20. The `booking_effect` registry flag (zero occurrences; and it would be the C9 change F3
    forbids).
21. The `canonical-confirmation:v1:<draft_id>` evidence idiom (zero occurrences; and no
    `draft_id` exists for cancel or reschedule).
22. "every `CONTROL` submission passes Gate 6 exactly as a `DRAFT` does" (no control key is in
    `MAYA_AI_TOOL_CATALOG`, so `assertCanExecute` has no definition to evaluate). Replaced by
    F58.
23. "the alternative shape is reused verbatim from the C9 contract" (verified false:
    `c9Alternative`, `c9.contract.ts:271–290`, carries none of those fields; the correct source
    is `AgentResult@1.proposed_action_intents[]`).
24. "the LLM cannot type a numeral into a widget", as grounded on `/^[^0-9]*$/` (F63; «втрое
    больше» passes it).
25. "`b35.confirm` is `OWNER_HANDOFF`, so no bulk-send `COMMIT` is mintable at all" — a C9 run
    mode is read by nothing under `src/action-engine/` and fences a run, not a send. FR-6c
    carries the real fence.
26. "the `IntentRecord` persists `widget_kind`, and the ACTION ENGINE INGRESS re-derives the kind
    rule from it", and every sibling claim of independent widget-state re-derivation at canonical
    ingress (F76).
27. "the capability registry marks run-opening capabilities": no such marker exists, and adding
    one would change `C9_REGISTRY_HASH`. The replacement is a widget-layer predicate over a field
    C9-CAP already has —
    `RUN_OPENING(r) := r !== null ∧ r.space === 'C9' ∧ (c9Registry.tryGet(r.key)?.mode ?? 'PROPOSE_ONLY') !== 'READ'`
    — read through the one declared non-throwing accessor, with a fail-closed default that makes
    an unregistered C9 key satisfy the predicate. The emission validator refuses any intent whose
    `subjectCapability(i)` satisfies `RUN_OPENING` on an envelope whose `origin.trigger` is
    `'proactive'`. Membership is **15 of 56** (13 `PROPOSE_ONLY` + 2 `OWNER_HANDOFF`), enumerated
    in process; `READ` keys are provenance, and a proactive envelope legitimately names
    `c7.measurement.read` as the source of a metric. *Evaluation point:* `EP-MINT`. **No field is
    added, so `C9_REGISTRY_HASH` is unchanged.**

### 0.20 `[NON-NORMATIVE]` Repository observations

**F96.** *These are findings about the running system, recorded so that no reader of this
contract believes the widget layer compensates for them. None is a widget-contract rule, and
owner action on them belongs outside this contract. Every number below was obtained by loading
the module and enumerating it in process, not by grepping the source — a grep undercounts,
because most capabilities are constructed by template functions rather than written as
literals: `'financial'` appears 8 times as a literal in `action-engine.registry.ts` while 12
registered capabilities carry the token.*

1. **Self-approval.** `AiToolPolicyService.canDecide`
   (`src/ai-tools/ai-tool-policy.service.ts:81–95`) resolves `approvalPolicy === 'owner'` to
   `OWNER_ROLES.includes(principal.role)` **without comparing `requestedByUserId` to
   `principal.userId`**, and `ActionEngineKernel.decideApproval()` compares `approver.role`
   against the approver-policy role set and **never compares `approverUserId` to the execution's
   `actorUserId`**. An initiator holding an owner role can approve their own request, on both key
   spaces. `four_eyes` / `fourEyes` / `separationOfDuties` have zero occurrences anywhere under
   `maya-saas-backend/src`. `assertSameApproval` requires
   `approval.requestedByUserId === principal.userId` — an idempotency-identity check, the
   opposite of a separation control. Concretely reachable today: `loyalty.internal.adjust` is
   `riskTier: 'high_write'`, `approvalPolicy: 'owner'` — a self-approvable balance mutation. F82
   keeps it off every chat-reachable confirmation body; that is a containment, not a fix.
   **Owner action:** either add a separation-of-duties comparison for `approvalPolicy: 'owner'`,
   or accept role-gated approval as the product's stated control. This contract does not choose,
   and states nothing stronger than F85 until one is chosen.
2. **An ungated second door onto the bulk send.** `communication.bulk-campaign.execute.v1` —
   `executorKey: communication.package2.bulk`, `actionClass: deliver_bulk_campaign` — is
   registered `ALLOW`, `approvalRequirement: 'NONE'`, `approverPolicyKey: 'none'`,
   `actorPolicy: 'OPTIONAL_TRUSTED_SERVICE'`, `allowedActorRoles: TENANT_ACTION_ROLES` (twelve
   roles, `CLIENT` and `CUSTOMER` among them), `allowedSourceTypes: ['authenticated_request',
   'legacy_bridge']`. **It is a second door onto the same `actionClass` as the owner-gated,
   approval-bound admission capability, and it is gated by neither.** Its only occurrence
   repo-wide is its own registration at `action-engine.registry.ts:3530`; it is reached by no
   service constant and no call site today. A registered `ALLOW` capability reachable from
   `authenticated_request` is one caller away from being live. **Owner action:** give it the same
   `allowedActorRoles` and `approvalRequirement` as `communication.bulk-campaign.admit.v2`, or
   remove it from the registry. This contract contains the key to `GAP-BULK-SEND-DIRECT` and says
   nothing stronger.
3. **164 of 221 canonical policy definitions receive the permissive twelve-role default**,
   `TENANT_ACTION_ROLES` (`action-engine.policy-registry.ts:11–24, 177`). Among them:
   `package5.wave2.suspend-tenant.execute.v1`, `.revoke-all-sessions.execute.v1`,
   `.create-tenant-user.execute.v1`, `package5.wave3.install-crm-credentials.execute.v1`,
   `loyalty.legacy-redeem.execute.v1`, `gift-certificates.redemption.execute.v1`.
4. **`permissionCodes` is validated and attested but never evaluated**
   (`policy-resolver.ts:280–290`, `:914`). It reads as an authorisation mechanism and is not one.
5. **`riskFacets` is an open, unvalidated string vocabulary** — 98 distinct tokens across 226
   rows, with no closed union and no registration discipline. Any downstream consumer that keys a
   decision on exact token membership inherits the defect F29 describes. This contract keys none.
6. **Three of the four appointment-detail capabilities carry no `clientPrincipalTarget`**
   (`attendance`, `duration`, `fields`), all seven booking capabilities receive the twelve-role
   default, and `resolveActorPermission` applies **no target-ownership test on the `actorUserId`
   branch** (`policy-resolver.ts:780–815`). This is why relaxing the pairing requirement for
   those four was rejected: it would put a tenant-wide appointment mutation behind a client-role
   button.
7. **`crm.visit.payment.v1` is `policyDecision: DENY` and carries the `financial` facet** — the
   payment fence is real and running at the Action Engine, independently of anything the widget
   layer does. Recorded so this register is not read as uniformly negative.

### 0.21 Residuals — what this contract cannot fix

**F97.** These are not resolved here. Each needs a real edit or an owner decision.

1. **The owner constraint says "NO schema change"; this contract adds widget-layer stores.**
   `IntentRecord`, the timeline store, the receipt store, the emission/receipt store, the
   free-input ledger, the capability-gap ledger, the mechanism-gap ledger and the server-owned
   draft store are all new and all absent. None is a canonical business table and no canonical
   row references one, but the constraint as the owner gave it is not met. **Owner decision
   required:** either the constraint means "no *canonical* schema change" — in which case say so
   — or the widget layer must be built on existing tables, which this design cannot do. No
   package that creates a widget-layer store may open until it is answered.
2. **`CHART` is not emittable until a read facade returns `rows_digest` and `series_digest`.**
   FR-10's mechanism depends on a component that does not exist. Returning those digests is a new
   field on a widget-layer read facade, not a change to any C9 contract — the facade computes
   them on the read path, outside the projector, and the projector cannot reproduce either. This
   is a real capability reduction and must be scheduled, not assumed.
3. **The self-approval finding is a repository defect this contract cannot fix** (F96.1).
4. **None of the eight reserved consent/identity names is a registry member**, and the 152-FZ
   consent machinery that *does* exist in this branch is named by none of the eight. Verified per
   act (§A1.6.1): **three** of the eight have no canonical owner at all
   (`identity.staff.telegram.unbind`, `consent.register.export`,
   `conversation.history.erase`); **one** has an owner that is unreachable from the widget source
   type (`identity.client.channel.unbind` — `ClientChannelLinkService.revoke()` has zero callers,
   and its only transactional caller declares `allowedSourceTypes: ['legacy_bridge']`); and
   **four** have a reachable registered owner under a different name (all four consent acts route
   to `package5.wave3.record-client-consent.execute.v1`). The operative consequence is unchanged —
   FR-6a holds fail-closed and vacuously, because none of the eight names resolves — but the stake
   is larger than "six have no owner" implied. When a consent owner is registered under its real
   name it must be classified by the start-up assertion set **before** any intent for it may be
   emitted; the gap ledger, not the reserved-name list, is what tracks this.
5. **`STEP_UP_VERIFIED` is unreachable**: no re-authentication event type exists. Every
   capability whose derived floor is `STEP_UP_VERIFIED` — including every `restricted` risk tier
   and every unmapped key under the fail-closed default — is permanently withheld. Fail-closed and
   correct, but a hole in the product rather than a property of the design.
6. **Renderer sandboxing is a convention.** The shipping frontend is a hand-edited single file
   with no sources and no build script in the repository, so the import-graph allowlist behind
   FR-1's CI test cannot run there. Until a build exists, those are discouraged, not proven.
7. **Gate 10 is a shadow gate.** "Three front doors, one function" is measured, not enforced,
   until a promotion criterion is set.
8. **`GAP-ATTENDANCE-CONFIRM` remains open**: «клиент подтвердил» is not a claim this system can
   make, and no reminder body may imply it.
---

## 1. Envelope, values and provenance

### 1.0 How to read this section

Every sentence below is normative unless it is prefixed `[NON-NORMATIVE]`. Every normative rule names the **mechanism** that enforces it and the **evaluation point** at which the mechanism runs. A rule with no mechanism is not written down; where the first edition made a guarantee no mechanism can produce, this section withdraws the guarantee (§1.10) instead of softening it.

**Evaluation points.** The vocabulary is the eleven closed points of §0.3 F7, and every normative rule below cites exactly one. The points this section cites are `EP-COMPOSE`, `EP-FIT`, `EP-MINT`, `EP-DELIVER`, `EP-RENDER`, `EP-FETCH`, `EP-INGRESS` and `EP-BUILD`.

**Code comments are not rules.** `[NON-NORMATIVE]` Every `//` comment in the TypeScript blocks of this section is commentary — a mint class, a bound restated for the reader, or the name of the section that declares a shape. A comment never carries a normative rule, and no rule of this contract is stated only in one.

**Mint classes.** Every field of every shape in this contract carries exactly one, and the five
classes **M**, **D**, **C**, **E** and **Ø** are defined in **§0.4 F12**, not here. The comments
in this section's TypeScript blocks name a field's class for the reader; the definitions are
F12's, and the two statements of them had already been reworded apart.

`[NON-NORMATIVE]` The mint class column is the whole safety argument of this section compressed into one letter per field. Everything that decides what a user may do is **D** or **M**; everything an emitter writes is **E**, and **E** fields decide presentation only.

---

### 1.1 `maya.widget.envelope/1`

#### 1.1.1 Root shape

```ts
interface WidgetEnvelope {
  contract: 'maya.widget.envelope/1';   // literal
  widget_id: string;                    // ULID, 26 chars, unique per EMISSION
  kind: WidgetKind;                     // closed union, declared in §2
  body_version: number;                 // integer 1..999, per kind, bumped independently
  tenant_id: string;                    // uuid v4, root only

  correlation: Correlation;             // §1.1.4
  source: WidgetSource;                 // §1.1.5
  origin: Origin;                       // declared in §0.5 F17
  authority: AuthorityEnvelope;         // declared in §0.5 F17; carries `verification_level` (§1.7)
  body: WidgetBody;                     // declared in §2 — read model, no writable field
  intents: WidgetIntent[];              // declared in §3; 0..12 (E7)
  provenance: Provenance;               // §1.6
  limitations: Limitation[];            // §1.6.7, 0..20, REQUIRED (may be empty)
  lifecycle: Lifecycle;                 // declared in §4
  presentation: Presentation;           // declared in §0.5 F17; carries `text_equivalent`
  render: RenderReceipt;                // declared in §4
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
| `correlation` | §1.1.4 | E (ids) / D (`agent_id`) / M (`trace_id`) | projector; `agent_id` derived by the minter from the run's registered agent; `trace_id` from the request |
| `source` | §1.1.5 | E | projector |
| `origin` | §0.5 F17 | E | projector / scheduler |
| `authority` | §0.5 F17 | D | `AuthorityResolver`; `verification_level` per §1.7 |
| `body` | the kind's registered body schema | E (slot bindings) / M (every rendered leaf, §1.2) | projector proposes slots; the formatter mints every rendered value |
| `intents` | array 0..12 | D (capability, floor) / M (`intent_token`) | `IntentMinter` |
| `provenance` | §1.6 | C (facts) / D (rest) | copier + minter |
| `limitations` | array 0..20 | C (codes) / M (text) | copier + formatter |
| `lifecycle` | §4 | D | minter |
| `presentation` | §0.5 F17 | M | `renderPresentation()` / `renderTextEquivalent()` |
| `render` | §4 | D | `degrade(envelope, profile)`, at `EP-FIT` |
| `integrity` | §1.9 | M | `EnvelopeMinter` |

`render` is produced at `EP-FIT`, which precedes `EP-MINT`: `render.render_tier` is a term of `body_hash` (§1.9 H1), so the fitted tier MUST exist before anything is hashed or sealed.

**E1 — byte bound.** A serialized `WidgetEnvelope` MUST NOT exceed 32768 bytes. *Mechanism:* `widgetBytes(value, 32768)`, the widget-layer twin of `c9Bytes` (`maya-saas-backend/src/orchestration/c9.contract.ts:125`), which is what bounds an `AgentResult@1` today. *Evaluation point:* `EP-MINT`. An over-size envelope is not truncated; the composer re-runs the density reduction of §4 and emits a smaller body, or emits nothing.

**E2 — closed shape, no unknown fields.** `widgetEnvelope()` is a closed-shape validator built from the same primitive family as `c9Shape` / `c9Enum` / `c9Int` / `c9Nullable`. Any key not declared in this contract, at any depth, is refused with `unknown_field`. *Evaluation point:* `EP-MINT`.

**E3 — forbidden keys.** No key on the single normative forbidden-key list of §0.15 F88 may appear at any depth of `WidgetEnvelope` or `WidgetIntentSubmission`. *Mechanism:* the forbidden-key validator, a total walk over the serialized value. *Evaluation points:* `EP-MINT` and `EP-INGRESS`. `[NON-NORMATIVE]` This exists because the live defect in this codebase is a third authority path (`localStorage.me_is_staff` routing before any server call); a widget layer able to carry an identity key would become a fourth.

**E4 — `widget_id` is addressing only.** No canonical table may hold a foreign key to `widget_id`. *Mechanism:* a schema test asserting the absence of such a column. *Evaluation point:* `EP-BUILD`. `[NON-NORMATIVE]` An FK-absence assertion does not exclude an untyped string column, so E4 is a cheap complement and not the load-bearing test; the load-bearing test is §4.4.1 RT3(b)'s history-blind replay, which exercises the canonical read and action paths with the timeline store unreadable. That is what makes "deleting conversation history leaves canonical records correct" a checked property.

**E7 — the `0..12` bound counts envelope-level intents, and body handles are references.** Every `*_intent` / `intent_token` field of every body holds an `intent_ref` — envelope-local (`'i1'`), class **structural**, never rendered — and never a token. Where such a handle sits on a repeated element (an option, a slot, a table row, a schedule entry, a bulk-audience entry), it names the **single** envelope-level intent whose `InputSchema` field of kind `enum`/`ref` carries that element's id in its closed `domain_ref`; the element id is the *selection*, not a second intent. A body carrying 15, 24 or 49 selectable elements therefore carries a handful of intents, not one per element, and `intents: 0..12` is satisfiable at every kind's density cap. *Mechanism:* the kind's leaf schema types these fields as `intent_ref`; `widgetEnvelope()` asserts each resolves to an emitted intent and that the element id is a member of that intent's `domain_ref`. *Evaluation point:* `EP-MINT`.

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

**E5 — the composer cannot supply authority, text, or proof.** `WidgetComposerInput` has **no** member named `verification_floor`, `verification_level`, `presentation_mode`, `principal_proof_hash`, `intent_token`, `body_hash`, `envelope_seal`, `text_equivalent`, `label`, `basis`, `completeness`, `authorship`, `evidence_refs`, `widget_id` or `expires_at`. *Mechanism:* two, jointly — the shape genuinely cannot be constructed (no field exists on the TypeScript input type), and `widgetComposerInput()` is a closed-shape validator that refuses any unknown key with `unknown_field`, so a value cast through `any` is rejected as data. *Evaluation point:* `EP-MINT`, before any hashing. *Consequence (normative):* everything in §1.7, §1.8 and §1.9 is **D** or **M** by construction; an emitter-supplied value for any of them does not exist to be read, and §1.8 additionally re-derives its own inputs at `EP-INGRESS`.

#### 1.1.3 Capability version and registry drift

`WidgetSource.capability_version` is the version digest of the capability canon entry that the body was projected from. For a key that resolves in the released C9 registry it is `C9_REGISTRY_HASH` (`maya-saas-backend/src/orchestration/c9.registry.ts:177`).

**E6 — drift is a re-mint, never a silent failure.** When `capability_version` does not equal the canon's current digest at `EP-INGRESS`, the submission is refused with `SUPERSEDED` and the gateway returns a freshly composed equivalent envelope; when the capability no longer resolves at all, the outcome is `UNAVAILABLE` with a `Limitation` and, if the remedy has no owner, a `capability_gap_ref`. *Mechanism:* `c9Capability(key, domain, registryHash)` already denies a hash mismatch with `registry_version_unavailable` (`c9.registry.ts:178-190`); the gateway maps that denial through the projection table of §1.6.7. *Evaluation point:* `EP-INGRESS`. `[NON-NORMATIVE]` This is the envelope-level behaviour only. Whether the canon may contain keys the frozen C9 registry does not is decided in §2; this rule states what happens to outstanding envelopes either way, and it is deliberately a neutral re-mint rather than an error.

#### 1.1.4 `Correlation`

```ts
interface Correlation {
  run_id: string | null;        // E — C9 run id when the orchestrator minted it; NULLABLE BY DESIGN
  turn_id: string | null;       // E
  message_id: string | null;    // E — durable chat message this envelope is anchored to
  agent_id: 'ADMIN' | 'CLIENT_LIFECYCLE' | 'OCCUPANCY' | 'BUSINESS_INTELLIGENCE' | null;  // D
  parent_widget_id: string | null;  // E — ULID of the preceding step in a chain
  step_index: number | null;    // E — int 1..12
  step_total: number | null;    // E — int 1..12, ≥ step_index
  trace_id: string;             // M — the request trace
}
```

**E8 — `run_id` is nullable because three paths mint envelopes, and `agent_id` is derived only on the one that has a run.** The three minters are the coordination run (`POST /api/orchestration/runs`), the registered capability read, and the proactive scheduler for the canonical moments (§4.1.1 L1). `agent_id` is class **D**: the minter derives it from the run's registered agent, so it is non-null on the run-bearing path and `null` **by construction** on both run-less paths, where there is no run and therefore no registered agent. `agent_id` is never emitter-supplied and is never read from the capability's own registered domains. *Mechanism for the safety equivalence of the three paths:* all three draw `capability` from the same canon and all three pass the same `EP-MINT` validator; nothing in §§1.6–1.9 branches on `run_id`. *Evaluation point:* `EP-MINT`.

`[NON-NORMATIVE]` The count is written as a count in exactly one place — here — precisely because a prose count repeated in three sections is a count that drifts.

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

A closed prefix set. There is no `/raw`, no `/tool_results`, no escape hatch, and no `/presentation_hint` (§1.6.5 P7). *Mechanism:* template-literal union plus the closed-shape validator. *Evaluation point:* `EP-MINT`.

---

### 1.2 The three leaf classes — resolving the universal-`Cell` rule

The first edition stated "there is no bare number, string, boolean or date in any body field that reaches a user's eyes" and then typed most of its own bodies with bare strings. **That sentence is withdrawn** (§1.10) and replaced by the following rule, which is narrower, exact, and checkable.

**V1 — every leaf of `body` is one of exactly three classes.**

| class | type | what it is | may vary with tenant / principal / time / source |
|---|---|---|---|
| **datum** | `Cell<T>` or `Measure` | anything read from a capability | yes |
| **phrase** | `Phrase` or `Narrative` | a server-authored constant string, or a server template with typed slots, drawn by key from a versioned catalogue | no |
| **structural** | `string` / `number` / `boolean` / closed enum | a value that is **never rendered**: `option_id`, `intent_ref`, `slot_ref`, `draft_ref`, `dataset_ref`, `series_id`, `section_id`, `field_key`, table column keys, `path` keys, counts used only for layout | n/a |

No fourth class exists. A rendered leaf that is neither a `Cell`/`Measure` nor a `Phrase`/`Narrative` cannot be emitted.

A **leaf** is the whole `Cell` / `Measure` / `Phrase` / `Narrative` value, or a structural scalar. The minted string members *inside* a leaf — `Cell.label`, `Measure.basis`, `Measure.formatted`, `Phrase.rendered`, `Narrative.rendered` — are not separate leaves; they are governed by §1.9 H3. V1 governs `body` only; minted strings outside `body` are governed by §1.9 H3 and by §3.1.

*Mechanism:* `buildCellIndex(kind, body_version, body)` — a pure server function that walks the body against the kind's registered **leaf schema**, in which every leaf is declared `datum`, `phrase` or `structural`. The walk yields a `CellIndex`; the validator refuses emission when (a) any leaf reached by the walk is absent from the schema, (b) any leaf declared `datum` is not a well-formed `Cell`/`Measure`, (c) any leaf declared `phrase` carries a `phrase_key` or a `narrative_template_id@version` absent from its catalogue, or (d) any leaf declared `structural` appears in the text equivalent produced by §1.9 H2's `renderTextEquivalent`. *Evaluation points:* `EP-MINT`; and `EP-BUILD`, where a schema-totality test asserts that every leaf of every registered body schema carries a class.

```ts
interface CellIndex {                    // artefact of buildCellIndex; recorded in the emission fixture
  schema_digest: string;                 // sha256 over the kind's leaf schema at this body_version
  entries: CellIndexEntry[];             // 1..400, ordered by `path`
}
interface CellIndexEntry {
  path: string;                          // JSON Pointer into `body`, ≤ 200 chars
  class: 'datum' | 'phrase' | 'structural';
  fact_ref: number | null;               // non-null iff class === 'datum' and state ∈ {KNOWN, PARTIAL}
  phrase_key: string | null;             // non-null iff class === 'phrase' and the leaf is a Phrase
}
```

**V2 — the index is not transmitted; its digest is.** `Integrity.cell_index_digest` is `sha256(stableActionJson(CellIndex))`. Any holder of the envelope reproduces the index from `(kind, body_version, body)` because `buildCellIndex` is pure. *Mechanism:* recomputation and comparison. *Evaluation points:* `EP-MINT` (mint the digest), `EP-BUILD` (recompute over every recorded emission). `[NON-NORMATIVE]` Shipping the index would roughly double a dense body for no reader that needs it.

**V3 — the constant exceptions are enumerated, not implied.** The complete set of user-visible fields with no `UNKNOWN` protection is: fields of class `phrase`. A `Phrase` is a catalogue lookup, so it cannot be unknown, cannot be empty, and cannot be authored at emission time.

```ts
interface Phrase {
  phrase_key: string;                       // E — key in `WIDGET_PHRASES@<catalogue_version>`
  params?: Record<string, CellPointer>;      // E — every interpolation slot names a Cell in THIS body
  rendered: string;                          // M — the only user-visible bytes; ≤ 400 chars
}
type CellPointer = string;                   // JSON Pointer into `body`, must resolve to a Cell/Measure
```

`Phrase` is the sole carrier of the phrase class in every body of this contract: a phrase leaf's catalogue key is `Phrase.phrase_key` and its user-visible bytes are `Phrase.rendered`. No second shape with a `key` / `text` pair exists.

**V4 — a phrase cannot carry a quantity of its own.** Every interpolation slot of a `Phrase` MUST name a `Cell` or `Measure` in the same body, and `rendered` MUST equal `renderPhrase(phrase_key, params, locale)`. *Mechanisms:* (a) byte-equality recomputation of `renderPhrase` at `EP-MINT`; (b) a catalogue lint at `EP-BUILD` that refuses any catalogue entry containing a digit, a Russian or English cardinal/ordinal number-word, or a quantity token (`пол-`, `треть`, `вдвое`, `half`, `double`, `top-N`) outside a slot. The same lint runs over every entry of `NARRATIVE_TEMPLATES` (§1.6.5). `[NON-NORMATIVE]` The lint runs over a few hundred catalogue rows written by humans; it is cheap and total, unlike a regex over generated prose.

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

**C3 — traceability replaces dereferenceability.** A `KNOWN` or `PARTIAL` Cell MUST carry `fact_ref` naming an element of `provenance.facts_used`, and its `value`, `as_of` and `evidence_refs` MUST be copies drawn from that element. *Mechanism:* the copy check in `widgetCell()` — `as_of` byte-equal to the fact's `as_of`, `evidence_refs` a subset of the fact's `evidence_refs`. *Evaluation point:* `EP-MINT`. `[NON-NORMATIVE]` This is the honest form of the first edition's "every `KNOWN` Cell has non-empty `evidence_refs`", which was unsatisfiable for catalogue-tool reads that produce no evidence handles at all (§1.6.4).

**C4 — UNKNOWN is a statement, not a failure.** `label` MUST NOT match `/ошибк|error|fail|сбо[йя]|недоступн.*попроб/i`. No renderer may bind a non-`KNOWN` state to a `danger`/`destructive`/`alert` theme token, an error icon, `role="alert"`, or an automatic retry. The permitted rendering is neutral-dim plus the `next_intent_ref` affordance. A non-`KNOWN` Cell blocks only its dependents — one report section, one chart series, one row — never the envelope. *Mechanisms:* the label lint at `EP-MINT` and `EP-BUILD`; a renderer conformance suite that asserts the five-branch rendering and the absence of error tokens for non-`KNOWN` states. *Evaluation points:* `EP-MINT`, `EP-BUILD` (the conformance suite, run over fixtures).

**C5 — the remedy is named or the gap is declared.** For `state ∈ {NOT_MEASURED, UNAVAILABLE}`: if the canon contains a capability that could resolve the unknown for this principal, `next_intent_ref` MUST name an intent present in this envelope; if it does not, `next_intent_ref` MUST be `null` **and** the envelope MUST carry a `Limitation` whose `capability_gap_ref` is non-null. *Mechanism:* a validator cross-check against the canon and against the emitted intents' `intent_ref`s. *Evaluation point:* `EP-MINT`. `[NON-NORMATIVE]` This is where "no button for a capability with no owner" stops being a convention: the Cell either points at a real intent or forces the gap onto the record.

**C6 — renderer conformance.** A renderer with fewer than five branches per Cell fails the conformance suite. *Evaluation point:* `EP-BUILD` (fixture-driven render of one envelope per kind per profile).

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

**M2 — `basis` is minted from a canonical key.** `basis_key` is copied from the fact's `basis` field, which C9 types as `c9Id` (`c9.contract.ts:349-368`); where the fact carries none, `basis_key` is `null` and `renderBasis` falls back to the capability's registered basis phrase. `basis` is never author-supplied. *Mechanism:* recomputation and byte-comparison of `renderBasis` at `EP-MINT`; covered by `body_hash`. `[NON-NORMATIVE]` The first edition typed `basis` as a free string inside the body, which made it a second, unpoliced channel for model-authored text sitting directly beside a number.

**M3 — no arithmetic in the widget layer.** `value`, `delta` and every member of `comparison` are copied from canonical facts. The widget layer MUST NOT compute a sum, a ratio, a percentage, a delta or a projection. *Mechanism:* a projector architecture test that refuses arithmetic operators over fact values in the projector directory, in the spirit of the existing consumer ratchet `c9.consumers.architecture.spec.ts` — which today scans only `src/orchestration/` and MUST be extended to the projector directory. *Evaluation point:* `EP-BUILD`. `[NON-NORMATIVE]` The extension is mandatory precisely because the scanner's current scope would leave the new code unpoliced while the guarantee kept being quoted.

**M4 — `comparison.baseline` is a `Measure` or absent.** A baseline is never a bare number and never a phrase containing a number. *Mechanism:* the type plus V1. *Evaluation point:* `EP-MINT`.

---

### 1.5 Where charts get their numbers

**M5 — a plotted point is a datum on both axes.** Every coordinate of every rendered series — the dependent value *and* the independent value, including bucket boundaries, axis ticks and category values — is a `Measure` or a `Cell`. *Mechanism:* V1 with the kind's leaf schema; a chart body declaring a bare `x` cannot be registered, and a body containing one is refused by `buildCellIndex`. *Evaluation points:* `EP-MINT`, `EP-BUILD`.

**M6 — series closure, over digests the read path computed.** In a body that carries a `dataset_ref`, every `datum` leaf inside the series MUST carry a `fact_ref` naming the fact whose `capability` is that dataset's read capability, and the body's `rows_digest` and `series_digest` MUST equal the digests the widget-layer read facade returned alongside the rows — `sha256(stableActionJson(rows))` and `sha256(stableActionJson(series))`, computed on the read path, outside the projector, which cannot reproduce either. *Mechanism:* the fact-closure check plus digest comparison in `widgetEnvelope()`. *Evaluation point:* `EP-MINT`. *Consequence:* a chart whose points do not reduce to a canonical dataset read cannot be emitted — the checkable form of "the LLM never generates numbers for a chart".

**M6 has an unmet prerequisite, and it is a capability reduction, not an assumption.** The C7/C8 read services return no digests today (prerequisite **P-13**). `rows_digest` and `series_digest` are required non-nullable members of the chart body, so until that facade ships the body cannot be built at `EP-COMPOSE` and **`CHART` is not emittable**. The facade is a new field on a widget-layer read facade; it is not a change to any C9 contract.

`[NON-NORMATIVE]` A projector-side recomputation of `rows_digest` over the rows the projector held is retained as defence in depth. As a standalone guarantee it proves only that the body matches the rows the projector held, which is why it is not the mechanism M6 names.

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

**P3.** `facts_digest = sha256(stableActionJson(facts_used.filter(copied)))` MUST equal the same function applied to the corresponding elements of the source artefact, and `completeness_envelope_hash` MUST equal `sha256(stableActionJson(completeness))` where `completeness` is byte-identical to the source's completeness envelope. *Mechanism:* recomputation at `EP-MINT` against the in-memory source artefact, using `stableActionJson` (`maya-saas-backend/src/action-engine/action-engine.identity.ts:54`) — the same canonicaliser C9 hashes with. *Evaluation points:* `EP-MINT`; and `EP-BUILD`, where the fixture carries both source and envelope.

`[NON-NORMATIVE]` The equality is satisfiable only by a whole copy — a lossy copy that drops `evidence_refs`, flattens `completeness` to a number or omits `status` cannot produce the hash — **for elements marked `copied` only**. `facts_origin` is emitter-supplied (**E**) and `facts_digest` does not cover synthesised elements (§1.6.4 P5), so this consequence must not be read as covering the whole array.

**P4 — no false `COMPLETE`.** An envelope whose `completeness.status` is `COMPLETE` while any `FactUsed.status` is `measured_incomplete`, `not_measured` or `unavailable` is refused. *Mechanism:* the widget-layer twin of C9's `false_completeness` denial, which `c9AgentResult` already enforces upstream. *Evaluation point:* `EP-MINT`.

#### 1.6.4 Synthesised facts — the Path B honesty rule

A registered capability read outside a coordination run produces no C9 completeness envelope and no evidence handles. For those reads the projector **synthesises** a `FactUsed` element, and marks it.

**P5.** When `facts_origin[i] === 'synthesised'`: `evidence_refs` MAY be empty; `completeness.totalCount` MUST be `null` unless the capability itself reported a count; `completeness.hasMore` MUST NOT be `false` unless the capability itself reported exhaustion; `completeness.status` MUST be `PARTIAL` when `totalCount` is `null`; every Cell whose `fact_ref` names it MUST have state `PARTIAL` or `NOT_MEASURED` with `reason_code: 'NOT_COLLECTED'` where the capability reported no count; and `presentation.text_equivalent.completeness_sentence` MUST state it. `facts_digest` does not cover synthesised elements. *Mechanisms:* the shape rules in `widgetEnvelope()`; the projector architecture test of M3, extended to assert that `hasMore: false` is never written on a synthesis path. *Evaluation points:* `EP-MINT`, `EP-BUILD`. `[NON-NORMATIVE]` This is the design's largest honesty gap and it is written into the type rather than into prose: a synthesised fact looks different from a copied one at the field level, so an audit can count them.

#### 1.6.5 `Authorship` — what is and is not model-composed

The first edition carried the literal `generated_by: 'canonical'`, glossed as "no body field is LLM-authored", while permitting `REPORT` narrative — a body field — to be model-composed. **The literal and its gloss are withdrawn** (§1.10) and replaced:

```ts
interface Authorship {
  body_values: 'server_formatter';          // literal — every datum leaf; §1.2–§1.4
  body_phrases: 'server_catalogue';         // literal — every phrase leaf; §1.2
  narrative: 'server_template' | 'none';    // which of the two produced any prose leaf
  narrative_template_id: string | null;     // non-null iff narrative === 'server_template'
  narrative_template_version: number | null;  // non-null under the same condition
  model_contribution: 'none' | 'template_selection';   // D
  model_contribution_ref: string | null;    // the projector-input field the model wrote, if any
}
```

**`Narrative` — the prose leaf, and the only one.**

```ts
interface Narrative {                       // a phrase-class leaf with typed slots
  narrative_template_id: string;            // E — a registered template id
  narrative_template_version: number;       // E — the version this body was composed against
  slots: Record<string, CellPointer>;       // E — each names a Cell, Measure or Phrase in THIS body
  rendered: string;                         // M — renderNarrative(id, version, slots, locale)
}

interface NarrativeTemplate {
  narrative_template_id: string;
  version: number;
  locale_bodies: Readonly<Record<string, string>>;   // locale → template text
  slot_keys: readonly string[];                      // every interpolation slot the text names
}

// Keyed by `${narrative_template_id}@${version}`, never by id alone: Authorship references a
// template by (id, version) and §4.2 replays FROZEN receipts, so a single-version map could not
// resolve the older version a stored receipt names.
declare const NARRATIVE_TEMPLATES: Readonly<Record<`${string}@${number}`, NarrativeTemplate>>;
```

At `EP-REGISTRY-LOAD` every entry of `NARRATIVE_TEMPLATES` resolves under its own composed key and every `slot_keys` member is a slot the locale body names, or the process does not start.

**P6 — narrative is a template with typed slots, never free prose.** Any prose leaf of any body (a report section narrative, a rationale, an option reasoning) is a `Narrative`, and its `rendered` MUST equal `renderNarrative(narrative_template_id, narrative_template_version, slots, locale)` where the composed key `<narrative_template_id>@<narrative_template_version>` resolves in `NARRATIVE_TEMPLATES` and every slot names a `Cell`, `Measure` or `Phrase` in the same body. `rendered` is recomputed and compared byte-for-byte. There is no model-authored template member and no numeral-regex guard on one: a guard of the form `/^[^0-9]*$/` passes «выручка выросла вдвое», which is exactly the guarantee §1.10 withdraws. *Mechanisms:* recomputation at `EP-MINT`; the catalogue lint of V4 applied to `NARRATIVE_TEMPLATES`; a residual numeral-and-number-word check over rendered text at `EP-BUILD` as defence in depth. *Consequence (stated precisely):* **no body field contains characters authored by a model.** A model may, where a future mechanism permits it, select *which* server template or kind is used; it may not supply any character that reaches a user.

**P7 — the model's actual contribution today is `none`.** `model_contribution: 'template_selection'` is legal only when the projector input carried a closed-enum proposal field and a server table validated it. C9's `presentation_hint` (`c9.contract.ts:384`) is an optional free-text field of up to 400 characters with no kind vocabulary, and the released agent does not emit it; **no renderer and no minter may read it as a kind, a template or a presentation instruction.** A kind proposal, if wanted, is the closed `WidgetComposerInput.kind_proposal` enum validated by `allowedKinds(capability)` — a table specified in §2 with an `EP-BUILD` totality test over the canon. *Mechanism:* `AgentResultPath` (§1.1.5) has no `/presentation_hint` member, so the field is not addressable as a source; `presentation_hint` is on the forbidden-key list of §0.15 F88; and `widgetComposerInput()` accepts no free-text presentation field. *Evaluation point:* `EP-MINT`.

#### 1.6.6 Evidence references and their durability

```ts
interface EvidenceRef {
  ref: string;                       // C — verbatim; 'h_<32..64 hex>' for a C9 handle
  class: 'c9_invocation_handle' | 'source_receipt';   // D
  dereferenceable_until: string | null;               // D — c9Instant; null ⇒ already an audit label
}
```

**P8 — a persisted evidence ref is an audit label, not a link.** C9 evidence handles live in an in-memory map for the duration of one invocation. After `dereferenceable_until` — for `class: 'c9_invocation_handle'`, the end of the minting invocation — a ref proves only *that a qualified reference existed*; it cannot be resolved. No renderer, no gateway and no audit tool may attempt to dereference it. A "show the evidence" affordance MUST be a `REFINE` intent that re-reads from the canonical owner. *Mechanisms:* the `class`/`dereferenceable_until` fields make the distinction machine-visible; an `EP-BUILD` test asserts that no renderer or gateway call site dereferences an `EvidenceRef`; §1.3 C3 makes Cell traceability depend on `fact_ref`, not on a live handle, so nothing breaks when a handle dies. *Evaluation points:* `EP-MINT` (classification), `EP-BUILD` (no-dereference test).

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

**P9 — severity is table-derived, never model-authored and never emitter-authored.** C9 limitations are plain strings (`c9SafeText(v, 400)`); they carry no severity. `severity` and `text` are produced by `LIMITATION_REASON_TABLE`, declared here and nowhere else:

```ts
interface LimitationReason {
  reason_code: string;                 // the closed key
  severity: 'limitation' | 'caveat';   // NEVER 'error' — there is no error severity (§2.1)
  text_key: string;                    // a Phrase key; the rendered text is minted, never authored
}
declare const LIMITATION_REASON_TABLE: Readonly<Record<string, LimitationReason>>;
```

Its default severity is `limitation`. *Mechanism:* table lookup at `EP-MINT`; `EP-BUILD` totality test (below).

**P10 — every canonical denial code has a rendering, and none of them is an error.** The
projection is declared here and nowhere else:

```ts
interface DenialProjection {
  cell_state: CellState;                          // never a failure state
  reason_code: string;                            // a LIMITATION_REASON_TABLE key
  limitation_severity: LimitationReason['severity'];   // 'limitation' | 'caveat' — never 'error'
}
declare const C9_DENIAL_PROJECTION: Readonly<Record<string, DenialProjection>>;
```

`C9_DENIAL_PROJECTION` maps each `c9Deny(...)` code to `{ cell_state, reason_code, limitation_severity }`. Most such denials are **policy fences, not faults** — `paid_capability_not_activated`, `capability_not_registered`, `review_stale`, `run_expired_or_terminal`, `use_secure_surface`, `no_delegated_domain_required` — and each MUST project to a Cell state and a `Limitation`, never to an error surface. *Mechanisms:* (a) an `EP-BUILD` ratchet that enumerates the `c9Deny('…')` literals under `maya-saas-backend/src/orchestration/` — **118 distinct codes**, verified — and fails the build if any code has no row; (b) at runtime, an unmapped code projects to `state: 'UNAVAILABLE'`, `reason_code: 'PROVIDER_SILENT'` and a `limitation`-severity `Limitation`, so a new upstream code degrades to an honest unknown rather than to a red box. *Evaluation points:* `EP-COMPOSE` (projection happens before anything reaches a renderer), `EP-BUILD` (totality).

**P1 — no second backend contract per widget.** Every `body` field MUST be a subset of the response projection of `provenance.source_capability`. A widget kind may not introduce a field its source capability cannot produce. *Mechanism:* a projector contract test per kind, run against recorded capability responses. *Evaluation point:* `EP-BUILD`.

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

**K5 — the principal resolver may not resurrect a revoked binding.** No widget-layer code path may construct a principal from a `ClientChannelLink` with `revokedAt != null`, or from an inactive `Membership`. *Mechanism:* an architecture test asserting that widget-layer principal resolution calls `C9Authority.current` (or `ClientChannelRuntimeService.resolve`) and constructs no principal of its own. *Evaluation point:* `EP-BUILD`.

**K6 — `STEP_UP_VERIFIED` is unreachable until a step-up mechanism is registered.** No re-authentication event type exists in the repository today. Consequently `AuthorityResolver` can never return rank 4, and every intent whose derived floor is `STEP_UP_VERIFIED` is **withheld at `EP-FIT`** with `reason: 'verification_floor'` and made reachable through an emitted `HANDOFF`; a token for such an intent submitted anyway is refused at `EP-INGRESS` Gate 5 under the per-effect branch of §3.4. *Mechanisms:* the fitter's step 1; the Gate 5 floor comparison. *Evaluation points:* `EP-FIT`, `EP-INGRESS` Gate 5. `[NON-NORMATIVE]` This is fail-closed and correct: the capability is unreachable rather than under-protected, and it is visible in the receipt as a withheld intent with a named restoration route rather than as a silent absence.

**K7 — a channel ceiling never raises a floor.** `ChannelProfile.max_verification_level` caps what a channel may carry; it can only lower the effective level. A Telegram bot running `start_polling` establishes no first-party principal and is therefore capped at `CHANNEL_IDENTITY`. *Mechanism:* `effective = min(rank(session), rank(profile.max_verification_level))` in the gateway. *Evaluation point:* `EP-INGRESS`.

---

### 1.8 The verification floor is derived by the server

The first edition let the emitter author the floor under the name `required_verification` and then called the result "server-derived". It was not. This is the replacement.

**K8 — one wire name, one derivation, and the derivation is declared once.** The field is named **`verification_floor`** on `WidgetIntent` and on `IntentRecord`. `required_verification` is a deprecated alias that MUST NOT appear — not as a field, not as a parameter, not as a key at any depth of an envelope, a submission, a profile or a record; it is a member of the forbidden-key list of §0.15 F88, and a source check asserts zero occurrences. The value is that of the single total function `verificationFloor(subject, kind)` declared in §0.8 F43. Its arity is **2**, and its inputs are exactly the intent's `effect`, `capability`, `handoff_capability_ref`, `target` and `priority`, plus the envelope's `kind`. There is no `audience` term, and no per-kind, per-capability or per-section local formula exists anywhere in this contract. *Mechanisms:* the one pure function; `mintIntent()`'s signature has no floor parameter and `WidgetComposerInput` has no such member (E5); a source test asserts no assignment to `verification_floor` outside `verificationFloor()`. *Evaluation points:* `EP-MINT` (derive), `EP-INGRESS` Gate 5 (re-derive), `EP-BUILD` (the name check and the assignment test).

**K9 — every intent carries a floor, including `HANDOFF`.** `verification_floor` is an intent-level field present on **every** `WidgetIntent` regardless of effect class, not a member of an optional confirmation object. A `HANDOFF` intent MUST carry a non-null `handoff_capability_ref` so that `verificationFloor` and the never-chat-actuated predicate both have a key to evaluate. *Mechanism:* the intent shape (§3.1) plus the derivation above. *Evaluation point:* `EP-MINT`. `[NON-NORMATIVE]` Without this, the floor comparison and the never-chat-actuated list are predicates that cannot become true for exactly the intents that carry consent and identity acts — the first edition's structural defect #1.

**K10 — computed at mint, recomputed at the gateway, hinted by nobody.** The minter writes `verification_floor = verificationFloor(...)`. At `EP-INGRESS` Gate 5 the gateway recomputes it from the `IntentRecord` and the live tables and compares the session against **its own** result; it never reads the stored value for a decision. **Any** difference between the stored and the recomputed floor — raised or lowered — refuses the submission with `SUPERSEDED / policy_floor_changed`, returns a freshly composed envelope, and increments `widget_floor_divergence`. *Mechanisms:* E5 (no composer field to supply it); pure-function re-evaluation plus one comparison. *Evaluation points:* `EP-MINT`, `EP-INGRESS` Gate 5.

**K11 — table totality and monotonicity.** `WIDGET_CAPABILITY_POLICY` MUST have a row for every key the derivation can be asked about; a key with no row makes the build fail, and at runtime an unmapped key refuses emission rather than defaulting. A floor may never be **lowered** except by a version bump of this contract carrying a recorded owner decision. *Mechanisms:* an `EP-BUILD` totality test over the canon; an `EP-BUILD` monotonicity test comparing the table against the previous contract version's. `[NON-NORMATIVE]` The totality test is what keeps a newly registered consent-bearing capability from arriving with an implicit floor of zero.

**K12 — consent classification is data, and it is reviewed like a fence.** A capability's consent class is a closed enum assigned per capability in `WIDGET_CAPABILITY_POLICY`. Any change to a capability's consent class is a contract version bump. *Mechanism:* the same monotonicity test as K11, extended to the consent-class column. *Evaluation point:* `EP-BUILD`.

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

`approval_echo` is the sole name for this member; no shape in this contract carries an `approval_binding_echo`.

**H1 — what `body_hash` covers.** The term list is closed and is exactly the ten below.

```
body_hash = sha256(stableActionJson({
  contract, kind, body_version,
  body,                                  // every Cell, Measure, Phrase and Narrative, including
                                         //   every minted `label`, `basis`, `formatted`, `rendered`
  cell_index_digest,
  provenance,                            // including facts_used, completeness and authorship
  limitations,
  intents: intents.map(stripIntentToken), // capability, role, floor, schema — NOT the token
  presentation,                           // including text_equivalent in full
  render_tier: render.render_tier,        // the fitted tier, and this field of `render` ALONE
}))
```

`render.render_tier` is a term because the accessible `reading_order` of §4.8 is derived against the fitted tier: were the tier outside the hash, a sealed envelope could be re-read at a different tier and its reading order would no longer match its seal. **The whole `RenderReceipt` is never a term** — `target_classes` is appended at delivery, *after* sealing, and a term that changes after sealing would break every hash.

*Mechanism:* `stableActionJson` (`action-engine.identity.ts:54`) as the canonicaliser — the same function C9 and the Action Engine hash with; there is no second canonicalisation scheme in this system. *Evaluation points:* `EP-MINT` (compute), `EP-RENDER` (the renderer recomputes and compares before drawing, H7), `EP-BUILD`.

**H2 — the text equivalent is a pure function inside the hash.** `presentation.text_equivalent = renderTextEquivalent(kind, body, cell_index, intents, locale)`. The composer cannot supply it (E5) and a model cannot author it (P6). At `EP-MINT` the validator recomputes the function and requires byte equality before the hash is taken; the result is therefore inside `body_hash` and cannot drift from the body afterwards. *Consequence:* the screen-reader string, the SMS body, the transcript line, the archived summary and the utterance the gateway re-parses are the same bytes **by construction**.

**H3 — minted strings are inside the hash by the same rule.** `Cell.label`, `Measure.basis`, `Measure.formatted`, `Phrase.rendered` and `Narrative.rendered` are all outputs of pure server functions, all recomputed-and-compared at `EP-MINT`, and all inside `body`, therefore inside `body_hash`. There is no user-visible string in an envelope that is both outside the hash and outside a server function.

**H4 — the seal, and where it is verified.**

```
envelope_seal = HMAC-SHA256_k( "maya.widget.envelope/1" ‖ \0 ‖ stableActionJson([
  body_hash, widget_id, tenant_id, principal_proof_hash,
  issued_at, expires_at, render.profile_id, seal_key_version ]) )
```

*Mechanism:* the existing keyed-HMAC discipline of `ActionIdentityService.hmac(namespace, value)` (`action-engine.identity.ts:83`), with its own key namespace and a key version. *Evaluation points:* `EP-MINT` (mint, after fitting, over the degraded envelope); `EP-INGRESS` (the gateway verifies before Gate 1 proceeds); `EP-FETCH` (the first-party route verifies on the timeline read). The seal is **verified server-side only**: it is a keyed HMAC, and shipping the key to every renderer would destroy its unforgeability, so no client verifies it. Including `render.profile_id` means an envelope degraded for one channel cannot be replayed as a richer one.

**H5 — echoes are echoes, and each names the owner that checks it.** `approval_echo.hash` MUST be the hash the named owner actually verifies: for an AI-tool approval that is `AiApprovalRequest.payloadHash`, verified by `assertPayloadHash` on the approve path (`maya-saas-backend/src/ai-tools/ai-tool-runtime.service.ts:209,301,1197`); for an Action Engine execution binding it is that execution's binding hash. An echo whose named owner does not verify that hash is refused at mint. The server re-derives and compares; an echoed value is **never** accepted as an input to any decision. *Mechanism:* owner-keyed re-derivation in `widgetEnvelope()` and again at `EP-INGRESS`. `[NON-NORMATIVE]` The first edition echoed `ActionExecution.approvalBindingHash` for an approval whose owner checks `payloadHash` — a widget that looks bound and is not.

**H6 — one hashing scheme.** No widget-layer artefact may introduce a canonicalisation or hashing scheme other than `stableActionJson` + SHA-256, or a keyed scheme other than `ActionIdentityService.hmac`. *Mechanism:* an architecture test forbidding `JSON.stringify`-based hashing and ad-hoc `createHash` call sites in the widget layer. *Evaluation point:* `EP-BUILD`.

**H7 — what the renderer verifies, and what it cannot.** At `EP-RENDER` the renderer verifies exactly two things before drawing: (i) a recomputed `body_hash` — unkeyed SHA-256 over the ten terms of H1 — equals `integrity.body_hash`, and (ii) `lifecycle.expires_at` has not passed. It verifies no keyed value. On a `body_hash` mismatch or on expiry the renderer draws `presentation.text_equivalent` as frozen prose plus one `REFINE` intent — never an error surface. *Mechanism:* the renderer conformance suite, driven by fixtures including a tampered body and an expired envelope. *Evaluation points:* `EP-RENDER`, `EP-BUILD`. `[NON-NORMATIVE]` Nothing is lost by withholding the key from renderers: a forged envelope a renderer would draw still carries no usable token, because every submission is re-checked server-side at `EP-INGRESS`, where the seal *is* verified.

---

### 1.10 What this section withdraws from the first edition

`[NON-NORMATIVE]` Listed so that a reader of both editions can see that each removal was deliberate, and so that no reviewer has to re-derive it.

| withdrawn claim (first edition) | what replaces it |
|---|---|
| "There is no bare number, string, boolean or date in any body field that reaches a user's eyes" | V1: three leaf classes, a per-kind leaf schema, and `buildCellIndex` totality at `EP-MINT`. The constant exceptions are exactly the phrase class and are enumerated by catalogue key. |
| `generated_by: 'canonical'` — "No body field is LLM-authored" | `Authorship` (§1.6.5): body values from the formatter, phrases from the catalogue, narrative from a versioned template with typed slots. The precise true statement is *no body field contains characters authored by a model*. |
| "Prose in `text_equivalent`, `speech.lead` and `REPORT.narrative` may be model-composed" with a numeral regex as the guard | P6: `Narrative` — a template with typed slots — so a quantity cannot be free text in any form, numeral or word; the numeral/number-word check survives only as defence in depth. |
| "Mirrors `AgentResult@1` field-for-field" (while dropping `evidence_refs` and flattening `completeness` to a number) | §1.6.1–§1.6.3: byte-copies of `facts_used[]` and `c9Completeness` including `status`, enforced by digest equality that a lossy copy cannot satisfy. |
| INV-4's "every `KNOWN` Cell has non-empty `evidence_refs`" | C3: traceability to `fact_ref`. Catalogue-tool reads produce no handles, so the old rule was unsatisfiable on the most common path. |
| "any past interaction can be re-rendered in any profile for audit" (evidential reading) | P8: what replays is the rendered form and the receipt chain. Evidence handles in a persisted envelope are audit labels; evidence is re-read through a `REFINE` intent. |
| "The LLM's role is bounded to `AgentResult@1.presentation_hint`: it may propose a kind" | P7: nothing reads `presentation_hint`; it is not addressable as a source and it is a forbidden key. A kind proposal, if ever wanted, is a closed enum on the widget layer's own composer input validated by `allowedKinds`. |
| `required_verification` described as server-derived while authored by the emitter | K8–K12: the field is `verification_floor`, derived by one total function of arity 2 at mint and recomputed at Gate 5; the composer input has no such field and the old name is a forbidden key. |
| `approval_binding_echo` = `ActionExecution.approvalBindingHash` for AI-tool approvals | H5: `approval_echo` names the owner that verifies it, and for that path the hash is `AiApprovalRequest.payloadHash`. |
| The renderer verifies `envelope_seal` before drawing | H7: the renderer verifies a recomputed `body_hash` and `expires_at`. The seal is a keyed HMAC and is verified server-side only, at `EP-INGRESS` and `EP-FETCH`. |
| A chart body whose `rows_digest` the projector recomputes for itself | M6: the digests are the ones the read facade returned on the read path; the projector-side recomputation is defence in depth only, and `CHART` is not emittable until that facade ships. |

---
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

**Every per-kind table in this contract is total over these twenty-two members.** A kind with no row in a per-kind table does not fail quietly: the process does not start. That applies to `KIND_REGISTRY` itself, to the lifecycle ceiling table `expires_at_ceiling_s` and `on_expiry` are read from (K25), to the retention classification (K19), and to the renderer conformance suite's per-kind fixture set.

[NON-NORMATIVE] Five of the twenty-two — `CONSENT_STATE`, `IDENTITY_BINDING`, `PAYMENT_HANDOFF`, `MEDIA_PREVIEW`, `ARTIFACT` — carry obligations that only a dedicated kind can hold: a consent display that cannot express an accept control, an identity display that cannot express an unbind, a payment body whose commit is a canonical capability, a generated image that declares a narrower text parity, and a file whose delivery is a first-party route. Folding any of them into a general body would put those obligations back into review convention.

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
  max_commit_intents: 0 | 1 | 2;               // 2 for APPROVAL alone (K13)
  input_allowed: 'none' | 'closed_domain' | 'open_domain';

  owner_class: OwnerClass;                 // §2.4; resolves to a set of registry keys at REGISTRY LOAD
  emittable: boolean;                      // DERIVED at REGISTRY LOAD, never authored (K20)

  fullscreen: 'FORBIDDEN' | 'OPTIONAL' | 'REQUIRED' | 'REQUIRED_ABOVE_DENSITY_CAP';
  fullscreen_reasons: readonly FullscreenReason[];
  density_cap: { path: string; max: number } | null;

  role_hint: RoleHint | RoleHintRule;      // §2.5 — the ONLY authored role_hint in the contract
  interactive_paths: readonly string[];    // body paths that contribute to a11y.reading_order
  allowed_target_classes: readonly ('w' | 'i' | 'c' | 's' | 'detail')[];   // §2.3.4
  text_shape: KindTextShape;               // §2.3.5

  pii_ceiling: 'none' | 'business_aggregate' | 'client_identified' | 'inherited';
  retention_sec: number;                   // DERIVED from the resolved pii class (K19)
  expires_at_ceiling_s: number | 'source_bound';   // DERIVED from the lifecycle ceiling table (K25)
}

type FullscreenReason =
  | 'exceeds_chat_density' | 'exact_configuration' | 'audit'
  | 'accessibility' | 'correction' | 'non_textual_medium' | 'file_delivery';
```

**K2 — the kind row is evaluated three times, by three different owners.**
1. *MINT/COMPOSE* — `composeEnvelope(kind, …)` refuses to build a body that does not validate against `body_schema_ref`.
2. *MINT/VALIDATE* — `validateEnvelope(envelope)` re-checks every structural clause in this section and refuses to compute `envelope_seal` on failure. An envelope that fails here does not exist; there is no partially valid emission.
3. *MINT/INTENT* — `IntentGateway.mint(kind, effect, capability)` refuses any `effect ∉ KIND_REGISTRY[kind].permitted_effects`, and refuses a commit intent beyond `max_commit_intents`.

A fourth evaluation happens at the gateway's own INGRESS, over the widget layer's own `IntentRecord`: Gate 7 re-derives the kind rule from the persisted `IntentRecord.widget_kind` and refuses a submission the rule does not admit. **No widget-layer value is passed to the Action Engine to be re-derived there.** The canonical action request carries tenant, capability, source, input, evidence references and — for a client-principal booking — a booking-intent context, and no widget field; making a canonical mutation conditional on widget-layer state is exactly what the fundamental rules forbid. The Action Engine's independent fence is its own: caller-authority refusal, resolver-owns-decision, source-type membership in the capability's allowed source types, the evidence prefix and cardinality check, and the mandatory client booking-intent context. That fence is shape, source type and durable attribution — not a second authorisation of the widget path; the authorisation is the gateway's Gates 5–7 plus the policy resolver, which the caller cannot influence.

**K3 — "effect ceiling" is a derived phrase, not a field.** `EffectClass` has eight members: `NONE`, `NAVIGATE`, `REFINE`, `CONTROL`, `DRAFT`, `REQUEST_APPROVAL`, `COMMIT`, `HANDOFF`. The **business ordering** is `NONE < NAVIGATE < REFINE < DRAFT < REQUEST_APPROVAL < COMMIT`; **`HANDOFF` and `CONTROL` are off that order** and are permitted per kind by explicit membership in `permitted_effects`. A kind's *effect ceiling* is the greatest ordered member of its `permitted_effects`; `CONTROL` never raises a ceiling, and `commit_allowed` is derived from the ordered members alone. *Evaluated at:* MINT/INTENT, by comparison against the ordered enum — not by a reviewer reading a table.

**`CONTROL` is a permitted effect on all twenty-two kinds.** It has no Action Engine edge and may write nothing but the widget layer's own rows, and every kind needs a dismissal. *Mechanism:* a start-up assertion over the mapped type asserts `CONTROL ∈ permitted_effects` for all twenty-two rows. *Evaluated at:* REGISTRY LOAD, MINT/INTENT.

**K4 — `REFINE` is defined by what it may not do.** A `REFINE` re-queries or re-composes a read model. It may never create, modify or destroy a canonical business record, and it may never itself carry a business effect. It may return a confirmation body composed by a canonical owner; the `COMMIT` then lives on that returned body and nowhere else. *Mechanism:* `REFINE` carries a non-null `capability` (the capability-null rule applies to `NONE`, `NAVIGATE` and `HANDOFF`), so a `REFINE` passes the registry lookup, the agent denied-set check, `maxSideEffectClass` and the AUTHORITY gate exactly as a write would. *Evaluated at:* MINT/INTENT for registry membership, and at the AUTHORITY gate for the live principal. Cancelling an orchestration run is not a `REFINE`: it is a `CONTROL` carrying `control.run.cancel` (§2.6.13 PROGRESS.3).

---

### 2.3 Shared substrata used by the bodies

Every leaf of a body is **datum** (`Cell<T>` / `Measure`), **phrase** (a catalogue lookup) or **structural** (never rendered). There is no fourth leaf class, and nothing else is admitted into a body.

#### 2.3.1 `Phrase` — the catalogue-rendered string

> **`Phrase` is declared in §1.2 V3 and is not re-declared here.** §0.2's map gives `Phrase` to
> §1, and the copy that stood here had already lost `params?: Record<string, CellPointer>` — the
> member V4's `renderPhrase(phrase_key, params, locale)` reads and the member an interpolated
> phrase cannot be validated without. A shape stated twice is a shape that drifts in one of
> them, and this one had.

**K5 — every user-visible body field is `Cell<T>`, `Measure` or `Phrase`.** A field whose content derives from a capability read is `Cell<T>` or `Measure`. A field whose content is a server-authored constant is `Phrase`, and constants cannot be unknown because they are not read from a source. There is no bare `string`, `number`, `boolean` or date in any body field that reaches a user's eyes; the only bare scalars surviving in a body are structural — opaque handles (`*_ref`, `*_id`, `intent_ref`), discriminators and counts — and are never rendered as themselves. The minted strings *inside* a leaf — `Cell.label`, `Measure.basis`, `Measure.formatted`, `Phrase.rendered`, `Narrative.rendered` — are not separate leaves; they are covered by the minted-string hash rule. *Mechanism:* the body JSON-Schemas admit no bare user-visible scalar; `buildCellIndex(kind, body_version, body)` checks every leaf against the kind's registered leaf schema, in which every leaf carries a class; `validateEnvelope` resolves every `Phrase.phrase_key` in the locale catalogue for the envelope's locale and recomputes `.rendered`, refusing on a missing key or a mismatch. *Evaluated at:* MINT/VALIDATE, and in the schema-totality test at BUILD.

[NON-NORMATIVE] `Phrase` is what makes the universal-`Cell` rule survivable: it separates "a constant the server wrote" from "a value the server read". Without it the fields most likely to be unknown — a settings diff's prior value, a confirmation line's detail, a masked staff label — become bare strings invisible to the five-branch renderer conformance suite and to the unknown-invariants.

#### 2.3.2 `Narrative` — prose the model selects, numbers it never supplies

> **`Narrative`, `NarrativeTemplate` and `NARRATIVE_TEMPLATES` are declared in §1.6.5 and are
> not re-declared here.** §0.2's map gives all three to §1. The catalogue is keyed
> `` `${id}@${version}` `` because provenance names a template by (id, version) and frozen
> receipts replay under the version they were sealed with, which a single-version map could not
> resolve. What §2 owns is the rule below — what a model may and may not contribute.

**K6 — the LLM supplies no character that reaches a user.** A model may *select* which server template is used, from a closed enum validated against `NARRATIVE_TEMPLATES`; it may not author template text, and there is no field in which it could. `validateEnvelope` resolves `` `${narrative_template_id}@${narrative_template_version}` `` in the catalogue, requires `slots`' key set to equal the template's `slot_keys`, requires every slot to resolve to a `Cell`, `Measure` or `Phrase` present in the same body, and recomputes `rendered` with the server formatter, refusing on inequality. The guard against a model narrating a quantity is the **catalogue lint** over `NARRATIVE_TEMPLATES` and the phrase catalogue — digits, Russian and English cardinals and ordinals, and the quantity tokens `пол-`, `треть`, `вдвое`, `half`, `double`, `top-N` — applied to the stored template text at BUILD. *Evaluated at:* MINT/VALIDATE (resolution, slot totality, re-render) and BUILD (the lint). Consequence: "the LLM never generates numbers for a chart" — or a report, or a strategy rationale — holds because the model contributes a template *identifier*, not prose.

[NON-NORMATIVE] A per-emission regex over model-authored template text was the weaker design it replaces: a digit filter passes «выручка выросла вдвое», so the quantity claim survives the guard. Linting a closed, versioned catalogue at build time is decidable, and the model's contribution reduces to a choice from a set the server already vetted.

#### 2.3.3 `OptionItem`, `TableSpec`, `FieldBound`

```ts
type IntentRef = string;             // envelope-local ('i1'); structural; never rendered

interface OptionItem {
  option_id: string;                  // opaque; meaningful only inside this envelope's domain
  label: Cell<string>;
  sublabel: Cell<string> | null;
  badges: Phrase[];                   // ≤3
  measures: Measure[];
  media: { kind: 'image' | 'icon'; ref: string; alt: Phrase } | null;   // alt non-empty, server-authored
  intent_ref: IntentRef;
  enabled: Cell<boolean>;             // a disabled control explains itself as an unknown, never as an error
}

interface TableSpec {
  caption: Phrase;                                      // REQUIRED — WCAG 1.3.1
  columns: Array<{ key: string; label: Phrase;
                   type: 'text' | 'measure' | 'datetime' | 'ref';
                   sensitivity: 'public' | 'internal' | 'pii';
                   is_row_header: boolean;              // exactly one column MUST be true
                   align?: 'start' | 'end' }>;
  rows: Array<{ row_key: string; cells: Record<string, Cell<string> | Measure | null> }>;
  row_intents: Record<string, IntentRef> | null;        // row_key → intent_ref
  group_by: { key: string; group_labels: Record<string, Phrase> } | null;  // ONE level only
}

interface FieldBound {                 // a server-side bound, echoed for rendering only
  bound_ref: string;                   // registry key, e.g. 'expenses.create#amount'
  min: Measure | null;
  max: Measure | null;
  max_abs_delta: Measure | null;
  basis: Phrase;                       // why the bound is what it is
}
```

**K7 — a `FieldBound` is a display echo, never policy.** The numbers in `min` / `max` / `max_abs_delta` are re-derived from `bound_ref` against the capability at the INPUT VALIDATION gate; the echoed values are never read as policy — the same treatment given to an authority hint. A submitted value outside the re-derived bound is refused (`REFUSED / value_out_of_bound`), never clamped and never rounded. *Evaluated at:* the INPUT VALIDATION gate, on every submission.

#### 2.3.4 Intent targets and intent handles inside a kind

`IntentTarget = { class: 'w' | 'i' | 'c' | 's' | 'detail'; ref: string }` is declared by the intents section. This registry constrains it per kind: each `KindRule` declares `allowed_target_classes`, and `validateEnvelope` refuses an intent whose target class is outside that set. The default is `['w','i','detail']` for every kind, plus `'s'` for every kind whose `permitted_effects` include `HANDOFF`. **`'c'` is permitted on no kind in this contract version.** A class-`s` `ref` is a closed shell route carrying at most one opaque, server-minted parameter; there is no field anywhere in a body or an intent in which a free-form URL can be placed. *Evaluated at:* REGISTRY LOAD (the field's totality) and MINT/VALIDATE (the membership check).

**K8 — no body, no intent and no submission may name a destination outside the first-party route table.** A provider URL, a checkout identifier, a card token, a bridge method name and a native-scheme URL are refused at any depth of a `WidgetEnvelope` or a `WidgetIntentSubmission`, as are every other member of the contract's single forbidden-key list. *Mechanism:* one structural validator — a total walk over the serialized value — shared by the envelope, the submission, the channel profile, the native bridge manifest and the `IntentRecord`. *Evaluated at:* MINT/VALIDATE, at the TOKEN INTEGRITY gate on every submission, and at REGISTRY LOAD for the profile and manifest.

**K24 — a body holds intent *refs*, and a per-element handle names one envelope-level intent.** Every `*_intent` field and every element-level intent handle in every body holds an envelope-local `IntentRef` — never an `intent_token`, which exists only on `WidgetIntent` and travels only in the carrier. Where an intent handle sits on a repeated element — `OptionItem.intent_ref`, `slots[].intent_ref`, `TableSpec.row_intents`, `SCHEDULE.entries[].detail_intent` / `move_intent`, `bulk_intents[].intent_ref` — it names the **single** envelope-level intent whose `InputSchema` field of kind `enum`/`ref` carries that element's id in its closed `domain_ref`; the element id is the *selection*, not a second intent. *Mechanism:* the leaf schema types these fields as `IntentRef`; `validateEnvelope` asserts each resolves to an emitted intent and that the element id is a member of that intent's `domain_ref`. *Evaluated at:* MINT/VALIDATE. Consequence: a `TIME_SLOT_SELECTOR` at its 12-slot cap carries five intents (select, more, widen, none-fit, escape), a `SCHEDULE` at its 24-entry cap carries four, a `CLIENT_LIST` at its 10-row cap carries at most six — every kind, at every density cap, inside the envelope's `intents: 0..12` bound. A non-nullable escape handle holds a ref, which is always non-null whatever the escape's effect class is.

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

**K9 — sentence order is a contract, not a style.** `renderTextEquivalent` is declared in §1.9 H2, at arity five — `(kind, body, cell_index, intents, locale)` — and is not restated here; the cell index is load-bearing, because §1.2 V1 clause (d) needs it to detect a structural leaf reaching the text. What §2 owns is that it emits exactly `sentence_order` and nothing else; a sentence whose source is absent is omitted, never reordered. *Mechanism:* the renderer is a table-driven pure server function keyed on `text_shape.sentence_order`; a CI test asserts, for every recorded emission fixture, that the emitted sentence sequence equals the kind's declared order. *Evaluated at:* MINT/VALIDATE (the minted text is covered by `body_hash`) and in CI. Consequence: "consent-aware audience maths are shown *before* the irreversible tap" becomes the checkable clause `indexOf('audience') < indexOf('options')` in the `APPROVAL` row, rather than a review comment.

**K10 — `parity` states what the text equivalent actually reproduces.** `'full'` means the portability test asserts every fact a rich renderer shows. `'recipe_only'` and `'file_facts_only'` are narrower assertions declared per kind (§2.6.21, §2.6.22); for those kinds the portability test asserts the narrower parity and nothing more. *Evaluated at:* CI, against the declared value. A kind may not claim `'full'` and then rely on a picture.

[NON-NORMATIVE] Narrowing the guarantee for two kinds is the honest alternative to asserting a universal one that a generated image cannot satisfy. A weaker true claim beats a louder false one.

---

### 2.4 The registry, at a glance

**The owner-class vocabulary is closed, and declared here.** `KindRule.owner_class` is typed
`OwnerClass`, and K20's `emittable` derivation reads `ownerClassKeys`; neither was declared by
any shape, which is an F2 violation on the derivation that decides whether a kind may be emitted
at all.

```ts
type OwnerClass =
  // read owners
  | 'CATALOG_READ' | 'AVAILABILITY_READ' | 'SCHEDULE_READ' | 'CLIENT_READ'
  | 'MEASUREMENT_READ' | 'RESULT_READ' | 'ANALYTICS_READ' | 'INTEGRATION_STATUS'
  // act owners
  | 'BOOKING_OWNER' | 'BULK_AUDIENCE_OWNER' | 'ORCHESTRATION_RUN' | 'ACTION_EXECUTION'
  | 'CONSENT_REGISTER' | 'IDENTITY_BINDING_OWNER' | 'COMMERCE_OWNER'
  | 'MEDIA_GENERATION_OWNER' | 'ARTIFACT_OWNER'
  // the six SETTINGS_DRAFT draft owners, declared with their keys in §0.14 F79
  | 'SETTINGS_OWNER' | 'NOTIFICATION_PREF_OWNER' | 'SCHEDULE_RULE_OWNER'
  | 'TENANT_CONFIG_OWNER' | 'TASK_OWNER' | 'AUDIENCE_OWNER'
  // the two non-owners
  | 'INHERITED'          // the owner is named by the intent's own capability (FORM)
  | 'NONE';              // the kind cites no owner at all (LIMITATION)

declare function ownerClassKeys(kind: WidgetKind): ReadonlySet<CapabilityRef>;
       // the registry keys KIND_REGISTRY[kind].owner_class resolves to, at EP-REGISTRY-LOAD.
       // Total over WidgetKind: 'NONE' resolves to the empty set and 'INHERITED' to the keys
       // the intent's own capability names, so neither is a partial branch.
```

At `EP-REGISTRY-LOAD`, or the process does not start: every `OwnerClass` member other than
`'NONE'` and `'INHERITED'` resolves to at least one key that is a member of its declared space,
and every `KindRule.owner_class` is a member of the union above. A kind whose owner class
resolves to the empty set is `emittable: false` and emits a `LIMITATION` carrying the mapped
`capability_gap_ref` — which is exactly how the five blocked kinds of §2.7 are blocked, by
derivation rather than by a list.

`Owner class` resolves to a set of C9 capability-registry keys at REGISTRY LOAD. `Ceiling` is the derived phrase of K3, computed over the ordered members alone. `FS` is the fullscreen rule. `Cap` is the density cap that forces escalation. `CONTROL` is a permitted effect on every row and appears in none of the ceilings.

| # | Kind | Permitted effects (ceiling) | Owner class → registry keys | FS | `role_hint` | Text parity | PII ceiling | Cap |
|---|---|---|---|---|---|---|---|---|
| 1 | `CHOICE` | NONE, NAVIGATE, REFINE, CONTROL, HANDOFF (**REFINE**) | `INHERITED` — the emitting capability | OPTIONAL | `radiogroup` \| `listbox` (derived) | full | inherited | 10 options |
| 2 | `SERVICE_SELECTOR` | NONE, NAVIGATE, REFINE, CONTROL, DRAFT (**DRAFT**) | `CATALOG_READ` → `catalog.services.read` | OPTIONAL | `radiogroup` \| `listbox` (derived) | full | none | 10 options |
| 3 | `STAFF_SELECTOR` | NONE, NAVIGATE, REFINE, CONTROL, DRAFT (**DRAFT**) | `CATALOG_READ` → `catalog.staff.read` | OPTIONAL | `radiogroup` | full | none | 10 options |
| 4 | `TIME_SLOT_SELECTOR` | NONE, NAVIGATE, REFINE, CONTROL, DRAFT (**DRAFT**) | `AVAILABILITY_READ` → `booking.availability.read`, `booking.group-availability.read` | REQUIRED | `listbox` | full | none | 12 slots |
| 5 | `BOOKING_CONFIRMATION` | NONE, NAVIGATE, REFINE, CONTROL, COMMIT, HANDOFF (**COMMIT**) | `BOOKING_OWNER` → `appointments.own.{create,reschedule,cancel}` | OPTIONAL | `region` | full | client_identified | 12 lines |
| 6 | `SCHEDULE` | NONE, NAVIGATE, REFINE, CONTROL, HANDOFF (**REFINE**) | `SCHEDULE_READ` → `staff.schedule.read`, `staff.schedule.own.read`, `operations.journal.read`, `company.business-hours.read` | REQUIRED_ABOVE_DENSITY_CAP | `grid` | full | client_identified | 24 entries |
| 7 | `CLIENT_LIST` | NONE, NAVIGATE, REFINE, CONTROL, REQUEST_APPROVAL, HANDOFF (**REQUEST_APPROVAL**) | `CLIENT_READ` + `BULK_AUDIENCE_OWNER` → `clients.*`, `customers.count`, `b35.{preview,status,confirm}` | REQUIRED | `table` | full | client_identified | 10 rows |
| 8 | `METRIC` | NONE, NAVIGATE, REFINE, CONTROL (**REFINE**) | `MEASUREMENT_READ` → `c7.measurement.read`, `analytics.team-kpi.read` | OPTIONAL | `group` | full | business_aggregate | 5 measures |
| 9 | `CHART` | NONE, NAVIGATE, REFINE, CONTROL (**REFINE**) | `RESULT_READ` → `c8.result.read`, `c7.measurement.read` | REQUIRED | `img` (→ `table` when degraded) | full | business_aggregate | 5 series / 120 points |
| 10 | `REPORT` | NONE, NAVIGATE, REFINE, CONTROL (**REFINE**) | `ANALYTICS_READ` → `analytics.business.{query,profit}`, `analytics.revenue.forecast`, `analytics.branches.compare`, `reports.recovered`, `expenses.read`, `clients.dossier.read` | REQUIRED | `document` | full | client_identified | 6 sections |
| 11 | `STRATEGY_OPTIONS` | NONE, NAVIGATE, REFINE, CONTROL, REQUEST_APPROVAL (**REQUEST_APPROVAL**) | `ORCHESTRATION_RUN` → C9 revisions + `c9.no_action` | OPTIONAL | `radiogroup` | full | business_aggregate | 3 alternatives |
| 12 | `APPROVAL` | NONE, NAVIGATE, CONTROL, COMMIT, HANDOFF (**COMMIT**) | `ACTION_EXECUTION` → the Action Engine approval path | REQUIRED | `region` | full | business_aggregate | — |
| 13 | `PROGRESS` | NONE, NAVIGATE, REFINE, CONTROL (**REFINE**) | `ORCHESTRATION_RUN` → resolved at `EP-REGISTRY-LOAD` to the existence of the run, plus `owner_report.status` (F36); cancellation is `control.run.cancel` | FORBIDDEN | `progressbar` | full | none | 12 steps |
| 14 | `LIMITATION` | NONE, NAVIGATE, CONTROL, HANDOFF (**NAVIGATE**) | `NONE` — cites the emitter's `Limitation[]` and the gap ledger | OPTIONAL | `status` | full | none | — |
| 15 | `SOURCE_STATUS` | NONE, NAVIGATE, CONTROL, HANDOFF (**NAVIGATE**) | `INTEGRATION_STATUS` → `support.integration-status.read`, `support.contact-admin.request` | OPTIONAL | `status` | full | none | 8 sources |
| 16 | `SETTINGS_DRAFT` | NONE, NAVIGATE, REFINE, CONTROL, COMMIT, HANDOFF (**COMMIT**) | `SETTINGS_OWNER` — the six admissible owner classes and their keys are declared in §0.14 F79 and are not restated here; `expenses.create` and `loyalty.internal.adjust` are **not** among them | REQUIRED | `region` | full | inherited | 12 diff rows |
| 17 | `FORM` | NONE, NAVIGATE, REFINE, CONTROL, DRAFT, HANDOFF (**DRAFT**) | `INHERITED` — the draft owner named by `submit_intent.capability` | REQUIRED | `form` | full | inherited | 12 fields |
| 18 | `CONSENT_STATE` | NONE, CONTROL, HANDOFF (**NONE**) | `CONSENT_REGISTER` → `consent.*` (**unregistered — §2.7**) | REQUIRED | `region` | full | client_identified | 1 subject |
| 19 | `IDENTITY_BINDING` | NONE, CONTROL, HANDOFF (**NONE**) | `IDENTITY_BINDING_OWNER` → `identity.*` (**unregistered — §2.7**) | REQUIRED | `region` | full | client_identified | 8 bindings |
| 20 | `PAYMENT_HANDOFF` | NONE, NAVIGATE, REFINE, CONTROL, COMMIT, HANDOFF (**COMMIT**) | `COMMERCE_OWNER` → commerce/loyalty **write** keys (**unregistered — §2.7**) | REQUIRED | `region` | full | client_identified | 8 lines |
| 21 | `MEDIA_PREVIEW` | NONE, NAVIGATE, REFINE, CONTROL (**REFINE**) | `MEDIA_GENERATION_OWNER` → `cutmatch.*` (**unregistered — §2.7**) | REQUIRED | `img` | **recipe_only** | client_identified | 1 media |
| 22 | `ARTIFACT` | NONE, NAVIGATE, CONTROL, HANDOFF (**NAVIGATE**) | `ARTIFACT_OWNER` → `owner_report.download`, `owner_report.status` | FORBIDDEN | `link` | **file_facts_only** | client_identified | 1 file |

**K11 — exactly four kinds may carry a `COMMIT`: `BOOKING_CONFIRMATION`, `SETTINGS_DRAFT`, `APPROVAL`, `PAYMENT_HANDOFF`.** Each is a *confirmation body*: a server-composed read model of an effect that has not happened yet. `FORM` is not among them. *Mechanism:* `commit_allowed` is derived from `permitted_effects` at REGISTRY LOAD, checked at MINT/INTENT, and re-checked at INGRESS Gate 7 against the persisted `IntentRecord.widget_kind` — the widget layer's own record, which the submitter does not author. *Evaluated at:* REGISTRY LOAD, MINT/INTENT, INGRESS Gate 7.

**K12 — nothing in a confirmation body is input.** The `COMMIT` intent on any of the four kinds carries `input_schema === null`; its arguments are frozen nouns resolved by a fresh read from the canonical owner at the INPUT VALIDATION gate. *Evaluated at:* MINT/INTENT (refuses a non-null `input_schema` on a `COMMIT`) and at the INPUT VALIDATION gate (refuses a submission carrying `inputs` for a null schema).

**K13 — one actuating subject per envelope.** `max_commit_intents` is `2` for `APPROVAL`, `1` for `BOOKING_CONFIRMATION`, `SETTINGS_DRAFT` and `PAYMENT_HANDOFF`, and `0` for the other eighteen. `APPROVAL` is the only kind for which `2` is admissible, and its pair is constrained:

The build veto over `max_commit_intents`, and the pairing conditions that make `2` safe, are
declared in **§0.13 F75** and are not restated here. What §2 owns is the per-kind value itself,
which is a `KIND_REGISTRY` column: `2` for `APPROVAL`, `1` for the three other commit-bearing
kinds, `0` for the remaining eighteen.

Approve and reject are two mutually exclusive decisions on **one** approval object, not two commits on two subjects, so the invariant the count protects — one actuating subject per envelope — is preserved rather than widened. *Evaluated at:* BUILD (the veto), MINT/INTENT (the count and the pair constraints, counted per `widget_id`).

**K14 — open-domain input is rationed by field kind, and additionally restricted by kind.** Any `InputSchema` containing a field of kind `integer`, `decimal`, `date`, `time`, `datetime`, `text` or `phone` without a closed `enum_values` requires a non-null `free_input_justification`, and **every such emission is written to the free-input ledger** with its justification, its tenant and its capability — regardless of which kind carries it. Independently, `input_allowed` restricts *which* kinds may carry such a schema at all: `'open_domain'` only for `FORM`; `'closed_domain'` for `CHOICE`, the three selectors, `SCHEDULE`, `CLIENT_LIST`, `STRATEGY_OPTIONS`, `SETTINGS_DRAFT` and `PAYMENT_HANDOFF`; `'none'` for the rest. Both fences apply; the ledger counts the larger population. *Mechanism:* `IntentGateway.mint` inspects the schema's field kinds and consults `KIND_REGISTRY[kind].input_allowed`; the ledger write is in the same transaction as the mint. *Evaluated at:* MINT/INTENT. Consequence: `CHOICE` has no `allow_free_text` field — free text in chat is a chat message, which travels the text router, not a widget field.

**K15 — fullscreen is a declared obligation, not a renderer's choice.** `presentation.fullscreen_detail` must be non-null when `fullscreen === 'REQUIRED'`; must be non-null when `fullscreen === 'REQUIRED_ABOVE_DENSITY_CAP'` and the counted path exceeds `density_cap.max`; must be null when `fullscreen === 'FORBIDDEN'`; and its `reason` must be a member of `fullscreen_reasons`. *Evaluated at:* MINT/VALIDATE.

**K16 — a fullscreen route renders envelopes, under the same kind rule.** A `fullscreen_detail.route_key` resolves to `(widget_id, density)` and calls the same projector to emit one or more envelopes of the same kind at `density: 'SHEET'`. It is not a bespoke screen, it has no second backend contract, and every clause in this section — including the accessibility clauses of §2.5 — binds it exactly as it binds the in-chat render. *Mechanism:* the shell route resolver accepts only those two parameters and has no path to a capability of its own. *Evaluated at:* route resolution, and in CI by a test asserting the resolver's parameter set.

[NON-NORMATIVE] Without K16 the surface whose declared reason is literally `'accessibility'` — the mandated non-chat fallback — would be the one surface no accessibility clause reached.

**K17 — above the density cap, escalate and disclose.** When the counted path exceeds `density_cap.max`, the envelope must carry a `fullscreen_detail`, must carry a `role: 'more'` `REFINE` intent, and its text equivalent must state `shown_count` and `total_count`. Truncation is always disclosed. *Evaluated at:* MINT/VALIDATE.

**K18 — authority changes what a widget contains, never which widget it is.** No kind is selected by `presentation_mode`, and no intent exists in one mode and not another. Narrowing — row sets, lanes, series, diff paths, option sets — happens server-side before emission, against the authority snapshot, and every narrowed path is listed in `data_scope.masked_fields`. A control the principal may not use is present with `enabled: { state: 'UNAVAILABLE', reason_code: 'PERMISSION' }` and explains itself as an unknown. *Mechanism:* the projector receives the authority snapshot and the composer has no `presentation_mode` branch on `kind`; a CI test asserts that for every fixture pair differing only in `presentation_mode`, `kind` and the set of `intents[].capability` are identical. *Evaluated at:* MINT/COMPOSE and in CI.

**K19 — `retention_sec` is derived from the pii class the composed body actually carries.** A kind whose `pii_ceiling` is `'inherited'` resolves at MINT/COMPOSE to the pii class present in the composed body; where nothing resolves, it resolves to `client_identified` — the shortest window, which is the fail-closed direction. `retention_sec` is then read from the contract's single retention classification, under its minimum rule: where more than one window applies, the shortest wins. A tenant may lower a window, never raise it. *Mechanism:* the historisation job reads `KIND_REGISTRY[kind].retention_sec` as resolved for that emission. *Evaluated at:* MINT/COMPOSE (the resolution) and historisation (the drop). Dropping a body never touches an `IntentRecord`, an Action Engine receipt, an appointment, a consent record or a loyalty balance.

**K20 — `emittable` is derived, never authored.** At `EP-REGISTRY-LOAD`, `emittable(kind) = ∃ k ∈ ownerClassKeys(kind) : k ∈ REGISTERED_KEYS`, where `REGISTERED_KEYS` is the space-qualified union of the three registries §0.6 F23 declares the lookups for — `{space:'C9'} × C9_CAPABILITIES`, `{space:'AE'} × ActionCapabilityRegistry.list()`, `{space:'CONTROL'} × CONTROL_REGISTRY` — and **never** a bare name: an intersection against an unqualified key set would match a **TOOL**-space key against a **C9** spelling, which §0.6 F24 shows is a real collision and not a hypothetical one — all 47 catalogue names are also C9-CAP keys, carrying independently-set fields. `composeEnvelope` refuses a kind whose `emittable` is false and instead emits a `LIMITATION` carrying the `capability_gap_ref` mapped from that owner class, with no intent (fail closed, say so in text). No renderer may synthesise a control for a capability the registry does not contain, and a gap-blocked control is rendered as prose, never as a disabled-styled button. *Evaluated at:* REGISTRY LOAD, and at MINT/COMPOSE on every emission.

**K25 — every per-kind lifecycle constant is compiled, total and unauthored.** `expires_at_ceiling_s` and the matching `on_expiry` behaviour are populated per kind from the contract's single lifecycle ceiling table and from nothing else; they are never members of a composer input. Where more than one clock bounds an emission, the soonest governs. Because `KIND_REGISTRY` is a mapped type over `WidgetKind`, a kind missing from that table fails compilation rather than defaulting. *Evaluated at:* REGISTRY LOAD, MINT/VALIDATE.

---

### 2.5 `role_hint` — the closed twelve, and the keyboard model each one owes

```ts
type RoleHint =
  | 'group' | 'radiogroup' | 'listbox' | 'table' | 'grid' | 'document'
  | 'status' | 'progressbar' | 'form' | 'region' | 'img' | 'link';   // twelve, closed

type RoleHintRule = { derive_from: string; map: Record<string, RoleHint> };
```

| `role_hint` | ARIA structure the renderer owes | Keyboard model |
|---|---|---|
| `group` | `role="group"` + `aria-labelledby`; no live region | Tab to the group, Tab through controls |
| `radiogroup` | `role="radiogroup"`, each option `role="radio"` with `aria-checked` | One tab stop; Arrow keys move and select; Space confirms |
| `listbox` | `role="listbox"` with `aria-multiselectable`, options `role="option"`; server `group` boundaries as `role="group"` with `aria-label` | One tab stop; Arrow keys move; Space toggles; Home/End to ends |
| `table` | `role="table"` with `<caption>`, one `columnheader` row, the `is_row_header` column as `rowheader`; `group_by` emits a `rowgroup` per group with a labelled group header row | Tab to the table; Arrow keys move by cell; Enter activates that row's `row_intents` ref if present |
| `grid` | `role="grid"`; lanes are `rowheader`, `buckets` are `columnheader`; each entry is a `gridcell` with `aria-colindex`/`aria-colspan` from its `bucket_span` | One tab stop; Arrow keys move by cell; Enter opens `detail_intent`; Shift+Arrow moves an entry within `move_targets` and emits `move_intent` (never a free position) |
| `document` | `role="document"` with `<h2>`/`<h3>` per `sections[].depth`; tables inside follow the `table` row | Normal document reading order; heading navigation; Tab to the fullscreen and export controls |
| `status` | `role="status"`, `aria-live="polite"` | Not focusable unless it carries controls; controls are ordinary tab stops |
| `progressbar` | `role="group"` containing `role="progressbar"` with `aria-valuetext` minted from the step sentence; steps as a `list` | Not focusable; the cancel control is an ordinary tab stop |
| `form` | `role="form"`; every field labelled; `aria-describedby` for `help` and for `bound.basis` | Standard field order = `reading_order`; Enter does not submit |
| `region` | `role="region"` + `aria-labelledby` on a heading | Tab through the declared `interactive_paths`, in `reading_order` |
| `img` | `role="img"` with `aria-label` from `alt` and `aria-describedby` pointing at the text equivalent (`table_equivalent` for `CHART`, `recipe` for `MEDIA_PREVIEW`) | Not focusable; the drill/regenerate/export controls are ordinary tab stops |
| `link` | a single first-party activation control with an accessible name from `filename` + `format` + `size_bytes` | One tab stop; Enter activates |

**K21 — `KIND_REGISTRY` owns `role_hint`, and derives it where the body decides it.** `KIND_REGISTRY[kind].role_hint` is the only authored `role_hint` in the contract; every per-kind accessibility table reads it and none authors a value of its own. For `CHOICE` and `SERVICE_SELECTOR`, `role_hint = select === 'single' ? 'radiogroup' : 'listbox'`. For `CHART`, the receipt records `'table'` when the degradation ladder replaced the picture with `table_equivalent`. *Mechanism:* `KindRule.role_hint` is a `RoleHintRule` for those kinds and is computed by the composer, never authored; a build test asserts `RoleHint` is declared exactly once in the source and that the per-kind accessibility fixture set has exactly twenty-two branches keyed on `WidgetKind`. *Evaluated at:* MINT/COMPOSE, BUILD.

**K22 — `reading_order` covers every interactive element, and each kind declares which paths those are.** What §2 owns is the **left-hand side of the derivation**: `KIND_REGISTRY[kind].interactive_paths`, the per-kind list of body paths that contribute interactive elements. Everything else is declared elsewhere and is not restated here:

> `InteractiveRef`, `refKey`, `refSet` **and** the `produced` / `reading_order` derivation —
> its ordered concatenation, its `emitted` filter and its escape-last rule — are all declared in
> **§4.8 A-0**, and §0.11 F68 points there rather than restating them. A derivation stated in
> three sections is a derivation maintained in three sections, and this one was.

Two consequences bear on §2 and are stated here because they are about `interactive_paths` and nothing else. First, `refSet` takes the **fitted tier**, because `CHART`'s declared path list is conditional on the degradation outcome, which lives on `render`, not on `body`; the render receipt is attached at `EP-FIT`, before `EP-MINT` seals and before `body_hash` is computed, so the tier is in hand when the derivation runs. Second, on the four kinds whose `interactive_paths` already denote the escape — `BOOKING_CONFIRMATION` and `PAYMENT_HANDOFF` (`dismiss_intent`), `FORM` and `SETTINGS_DRAFT` (`discard_intent`) — the escape is **produced, not appended**, and its produced position governs.

*Mechanism:* `validateEnvelope` recomputes the list by §4.8 A-0's derivation and refuses on any difference. *Evaluated at:* `EP-MINT`.

[NON-NORMATIVE] Fixing the list as *exactly* what `interactive_paths` produces was unsatisfiable in two directions at once. No kind lists the escape among its paths, yet the escape must be keyboard-reachable on every input-locked envelope; and `role: 'more'` is minted on any kind whenever the fitter dropped something, while only four kinds declare a `more_intent` path. The closed appended form answers both without a role list that would drift.

---

### 2.6 The twenty-two bodies

Each row states: **body**, **effect ceiling**, **canonical owner**, **fullscreen**, **`role_hint`**, **text equivalent**, then the rules that are specific to the kind, each with its mechanism and evaluation point. Every kind additionally permits `CONTROL`, and every kind whose body declares a `dismiss_intent` or `discard_intent` carries the escape verb — **declared in §0.9 F60 and not restated here**, including which envelopes carry it, that there is exactly one, its `role`, its `priority: 0`, its undroppability, its speech aliases, its `/cancel` reachability, and the `EP-FIT` decision between `NONE` with a null token and `CONTROL` carrying `control.widget.dismiss`.

---

#### 2.6.1 `CHOICE`

```ts
interface ChoiceBody {
  prompt: Phrase | Narrative;
  select: 'single' | 'multi';
  min_select: number; max_select: number;      // 1 ≤ min ≤ max ≤ options.length
  options: OptionItem[];                        // ≥2
  shown_count: number; total_count: number | null;
  more_intent: IntentRef | null;                // REFINE
}
```

**Ceiling** REFINE (`NONE`, `NAVIGATE`, `REFINE`, `CONTROL`, `HANDOFF`). **Owner** `INHERITED` — the envelope's `source_capability`, which must be a registry key. **Fullscreen** OPTIONAL (`exceeds_chat_density`). **`role_hint`** derived (K21). **Interactive paths** `options[].option_id`, `more_intent`. **Text** headline = `prompt`; itemized = `options`; order `lead → options → completeness → unknowns → as_of`; parity `full`.

- **CHOICE.1** No free-text field exists on this kind (K14). *Mechanism:* absent from the schema. *Evaluated at:* MINT/COMPOSE.
- **CHOICE.2** `CHOICE` may carry explanation copy, current state and consequence for a `NEVER_CHAT_ACTUATED` capability, and a `HANDOFF` to the verified surface — never an accept/decline control. *Mechanism:* the only permitted effects are read-class plus `CONTROL` and `HANDOFF`, and a `HANDOFF` on this kind must carry a non-null `handoff_capability_ref` and a target of class `s`. *Evaluated at:* MINT/INTENT and MINT/VALIDATE.

---

#### 2.6.2 `SERVICE_SELECTOR`

```ts
interface ServiceSelectorBody {
  prompt: Phrase;
  category_path: Phrase[];
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
  more_intent: IntentRef | null;                // REFINE
}
```

**Ceiling** DRAFT. **Owner** `CATALOG_READ` → `catalog.services.read`. **Fullscreen** OPTIONAL (`exceeds_chat_density` — the full catalogue). **`role_hint`** derived. **Interactive paths** `options[].option_id`, `more_intent`. **Text** headline = `prompt`; itemized = `options` (name, duration, price as formatted `Measure`s); order `lead → options → totals → completeness → unknowns → as_of`; parity `full`.

- **SERVICE.1** A `DRAFT` on this kind is routed to the canonical booking owner, which runs booking-intent normalisation, Client-principal verification and confirmation identity (B31/B32/B33) *before any draft exists*, and returns a `BOOKING_CONFIRMATION`. *Evaluated at:* the EFFECT ROUTING gate.
- **SERVICE.2** Margin, cost and staff earnings are not fields of this body. *Mechanism:* absent from the schema; the projector may return only a subset of `catalog.services.read`'s projection. *Evaluated at:* MINT/COMPOSE.

---

#### 2.6.3 `STAFF_SELECTOR`

```ts
interface StaffSelectorBody {
  prompt: Phrase;
  for_service_refs: string[];
  options: Array<OptionItem & {
    staff_ref: string;
    role_label: Cell<string>;
    nearest_availability: Measure;              // unit 'datetime'
    rating: Measure | null;
  }>;
  any_staff_option: OptionItem | null;
  shown_count: number; total_count: number | null;
  more_intent: IntentRef | null;
}
```

**Ceiling** DRAFT. **Owner** `CATALOG_READ` → `catalog.staff.read`. **Fullscreen** OPTIONAL. **`role_hint`** `radiogroup`. **Interactive paths** `options[].option_id`, `any_staff_option.option_id`, `more_intent`. **Text** headline = `prompt`; itemized = name, role, nearest availability; order `lead → options → completeness → unknowns → as_of`; parity `full`.

- **STAFF.1** Earnings, payroll share and internal performance are not fields of this body; they are `REPORT`. *Mechanism:* schema absence plus the projection-subset rule. *Evaluated at:* MINT/COMPOSE.

---

#### 2.6.4 `TIME_SLOT_SELECTOR`

```ts
interface TimeSlotSelectorBody {
  prompt: Phrase;
  timezone: string;                              // IANA
  window: { from: string; to: string };
  grouping: 'by_day' | 'by_part_of_day' | 'flat';
  groups: Array<{ group_id: string; label: Phrase;
    slots: Array<{ slot_ref: string;             // frozen noun handle
                   start: Measure;               // unit 'datetime'
                   duration: Measure;
                   staff_ref: string | null;
                   price: Measure | null;
                   availability: Cell<'FREE' | 'TAKEN'>;
                   intent_ref: IntentRef }> }>;
  shown_count: number; total_count: number | null;
  more_intent: IntentRef | null;                 // REFINE
  widen_window_intent: IntentRef | null;         // REFINE
  none_fit_intent: IntentRef;                    // REFINE — always present, never droppable
}
```

**Ceiling** DRAFT — a `COMMIT` token for a booking does not exist anywhere in the system at the moment this kind is rendered. **Owner** `AVAILABILITY_READ` → `booking.availability.read`, `booking.group-availability.read`. **Expiry ceiling** 90 s, and never longer than the booking owner's slot-hold TTL; `freshness_class` is a member of the envelope's `Lifecycle`, derived at MINT from this ceiling and the capability's TTL, and for this kind that derivation is required to yield `'live'`. **Fullscreen** REQUIRED (`exceeds_chat_density` — the full calendar). **`role_hint`** `listbox`. **Interactive paths** `groups[].slots[].slot_ref`, `more_intent`, `widen_window_intent`, `none_fit_intent`. **Text** headline = `prompt`; itemized = slots grouped by day then part of day, each stating start, duration and price; order `lead → options → completeness → unknowns → as_of`; parity `full`.

- **SLOT.1** `availability` carries **two value members plus not-`KNOWN`**. There is no `HELD` member and no `hold_token` field: the widget layer may not express an occupancy lock that no canonical owner holds. A slot taken between render and confirm surfaces as `SUPERSEDED` with a rendered diff at the INPUT VALIDATION gate's fresh read — never a silent clamp, never a wrong booking. *Mechanism:* the value enum has two members and unknown is carried by the `Cell`'s state; there is no field in which a lock could be recorded. *Evaluated at:* MINT/VALIDATE, and at the INPUT VALIDATION gate.
- **SLOT.2** A client-presented selector reads only client-bookable windows; the wider admin window is a different registered capability on the same kind. *Evaluated at:* MINT/COMPOSE, against the authority snapshot (K18).

[NON-NORMATIVE] A `HELD` state with a soft lock the provider does not own would make the widget layer the system of record for who holds a chair — the one thing the fundamental rules forbid outright — and a phantom hold would have no owner to expire it.

---

#### 2.6.5 `BOOKING_CONFIRMATION`

```ts
interface BookingConfirmationBody {
  confirmation_subject: 'create' | 'reschedule' | 'cancel';
  draft_ref: string | null;          // non-null iff subject === 'create'
  appointment_ref: string | null;    // non-null iff subject ∈ {'reschedule','cancel'} — a frozen noun
  lines: Array<{ label: Phrase; detail: Cell<string>; measures: Measure[] }>;
  when: Measure;                     // unit 'datetime' — the resulting time
  when_previous: Measure | null;     // non-null iff subject === 'reschedule'
  staff_label: Cell<string>;
  duration_total: Measure;
  price_total: Measure;
  price_delta: Measure | null;       // non-null iff subject === 'reschedule' and the price differs
  refund_preview: Measure | null;    // non-null iff subject === 'cancel' and money was taken
  loyalty_applied: Measure | null;
  policy_notices: Phrase[];          // cancellation window, no-show policy, consultation requirement
  commit_intent: IntentRef;          // EXACTLY ONE COMMIT
  amend_intents: IntentRef[];        // REFINE — back to a selector
  dismiss_intent: IntentRef;         // escape, priority 0 — abandons this confirmation, never the appointment
}
```

**Ceiling** COMMIT. **Owner** `BOOKING_OWNER` → `appointments.own.create` / `.reschedule` / `.cancel`; the provider owner alone touches YClients, and a reschedule uses the non-destructive `PUT record/{company}/{id}`. **Fullscreen** OPTIONAL (`audit`, `correction`). **`role_hint`** `region`. **Interactive paths** `commit_intent`, `amend_intents[]`, `dismiss_intent`. **Text** headline = a one-sentence statement of the subject; order `lead → items → totals → policy → readback → options → as_of → expiry`; `readback_template` REQUIRED; parity `full`. **Expiry ceiling** 120 s, and never longer than the canonical draft's hold TTL.

- **BOOK.1 — every booking effect has exactly one canonical confirmation, cancellation included.** `confirmation_subject` discriminates the three effects. The subject→key mapping is **`AE_WIDGET_COMMIT_ALLOWLIST`'s own booking rows** (§0.7 F30), not a second table: `confirmation_subject` selects among `crm.appointment.{create,reschedule,cancel}.v1`, which are exactly the three allowlisted `BOOKING_CONFIRMATION` rows (F34), and `commit_intent.capability` must equal the one the subject selects. A second table would be a second allowlist, and `row XOR gap` (F31) is total over AE-CAP precisely so that no second one exists. *Mechanism:* MINT/INTENT compares the minted capability against the table, and INGRESS Gate 7 re-derives the subject from the submitted capability against the widget layer's own `IntentRecord` and refuses when the emission's `confirmation_subject` disagrees. *Evaluated at:* MINT/INTENT and INGRESS Gate 7.
- **BOOK.2 — the required confirmation kind is a table lookup, and this kind claims no derivation of its own.** `requiredConfirmationKind(ref)` is declared once, in §0.13 F72, and is **not restated here**: it refuses a non-`AE` ref outright, then reads `AE_WIDGET_COMMIT_ALLOWLIST[ref.key]` and calls `refuseMint('capability_not_allowlisted')` when there is no row. It has **no default branch**, so an un-allowlisted key resolves to no kind at all rather than to `SETTINGS_DRAFT`. What §2.6.5 owns is the consequence for this body: a `COMMIT` minted onto a kind other than the row's `confirmation_kind` is refused. *Mechanism:* §0.13 F72's lookup. *Evaluated at:* `EP-MINT` and `EP-INGRESS` Gate 7.

  [NON-NORMATIVE] The earlier form of this clause read the capability's own facets — financial ⟹ `PAYMENT_HANDOFF`, `targetKind: 'appointment'` ⟹ `BOOKING_CONFIRMATION`, everything else ⟹ `SETTINGS_DRAFT`. Measured against the registry, that chain routes **118 of 226 capabilities — 94 of the 105 widget-reachable — onto `SETTINGS_DRAFT`, a COMMIT-bearing kind, by falling off the end of a two-test chain**. A fence whose negative branch renders a commit button is not a fence, which is why F72 has no default branch.

  [NON-NORMATIVE] Naming `appointments.own.create` alone would let reschedule and cancel reach a `COMMIT` without passing a canonical draft — which is where booking-intent normalisation, Client-principal verification and confirmation identity run — and would leave cancellation with no confirmation body at all.
- **BOOK.3 — `draft_ref` is required only where a draft is required.** A `create` needs a server-owned draft because the appointment does not exist yet; `reschedule` and `cancel` name an existing canonical record by `appointment_ref` and carry no draft. A `COMMIT` whose confirmation reference is a record rather than a draft is mintable only when it was produced by a consumed `REFINE`/`DRAFT` on the canonical owner's own propose key — so the normalisation, verification and confirmation-identity steps still run before any commit token exists. *Mechanism:* a conditional schema clause plus the mint function's two-part refusal. *Evaluated at:* MINT/VALIDATE, MINT/INTENT, INGRESS Gate 7.
- **BOOK.4 — nothing here is input (K12).** `commit_intent.input_schema === null`; the target time and the appointment travel as frozen nouns resolved by a fresh read from the booking owner. *Evaluated at:* MINT/INTENT and the INPUT VALIDATION gate.
- **BOOK.5 — `dismiss_intent` never cancels an appointment.** It is this envelope's single escape intent; the escape verb's own rules are §0.9 F60's and are not restated here. What is specific to *this* body is the confusion the clause exists to prevent: On a `confirmation_subject: 'cancel'` body, cancelling the appointment *is* the `COMMIT` — a different intent. *Mechanism:* the fitter's escape branch, then the closed-shape validator over the fitted envelope; the escape is never minted with a business capability. *Evaluated at:* FIT, MINT/INTENT, INGRESS Gate 13.

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
    state: Cell<'BOOKED' | 'BLOCKED' | 'FREE'>;
    pii_masked: boolean;
    detail_intent: IntentRef | null;           // REFINE / NAVIGATE
    move_intent: IntentRef | null;             // REFINE
    move_targets: string[] | null;             // CLOSED set of bucket_ids; the move_intent's selection_domain
  }>;
  gaps: Array<{ lane_id: string; bucket_span: [string, string]; recoverable: Measure }>;
  detail_intent: IntentRef;
}
```

**Ceiling REFINE — one ceiling, stated once.** `permitted_effects` are `NONE`, `NAVIGATE`, `REFINE`, `CONTROL`, `HANDOFF`. The grid never mints a `COMMIT`, and it never mints a `DRAFT`. **Owner** `SCHEDULE_READ` → `staff.schedule.read`, `staff.schedule.own.read`, `operations.journal.read`, `company.business-hours.read`. **Fullscreen** REQUIRED_ABOVE_DENSITY_CAP (24 entries; reason `exceeds_chat_density`). **`role_hint`** `grid`. **Interactive paths** `entries[].entry_ref`, `detail_intent`. **Text** headline = range and lane count; itemized = lane-by-lane prose, masked entries read as occupied with no name; order `lead → items → masking → completeness → unknowns → as_of`; parity `full`.

- **SCHED.1 — a drag is a selection from a closed domain, not a typed time.** A drag gesture resolves to the entry's pre-minted `move_intent`, whose `IntentRecord.selection_domain` is exactly `move_targets` — a set of `bucket_id`s the server computed at emission. No client-authored time, date or duration ever reaches the gateway. A submission naming a bucket outside the domain is refused (`REFUSED / selection_out_of_domain`). *Mechanism:* the closed `selection_domain` on the `IntentRecord`. *Evaluated at:* the INPUT VALIDATION gate.
- **SCHED.2 — a drag returns a canonical confirmation.** The `move_intent` is a `REFINE` carrying the registered C9 key **`appointments.own.reschedule`**, which C9 classifies `PROPOSE_ONLY` / `SOURCE_HANDOFF` — so it cannot actuate, passes the registry lookup, the denied-set check and the AUTHORITY gate, and is routed by the EFFECT ROUTING gate to the canonical booking owner, which runs B31/B32/B33 and returns `next_envelope` = `BOOKING_CONFIRMATION` with `confirmation_subject: 'reschedule'`. The `COMMIT` for the reschedule is minted onto that body and nowhere else (K11, BOOK.2), carrying the Action Engine reschedule key. `SCHEDULE`'s ceiling stays `REFINE`. *Mechanism:* the registry lookup plus the key-space rule that separates C9 propose keys from Action Engine actuating keys. *Evaluated at:* MINT/INTENT and the EFFECT ROUTING gate.

  [NON-NORMATIVE] A calendar that could mint a `DRAFT` — or a `COMMIT` — would be the widest mutation surface in the design, on the kind that covers the whole calendar/journal family. The lower ceiling is chosen deliberately, and the reschedule path is spelled out so the choice is implementable rather than merely restrictive.
- **SCHED.3 — no `HELD` state.** As SLOT.1: the grid's value enum has no member for a lock no canonical owner holds, and unknown is carried by the `Cell`'s state with its own reason code and label. *Evaluated at:* MINT/VALIDATE.
- **SCHED.4 — a masked entry is masked before emission.** `pii_masked: true` entries carry a `title` `Cell` whose state is `UNAVAILABLE` with `reason_code: 'PERMISSION'` and a human label; the renderer never receives a name it must hide. Every masked path is listed in `data_scope.masked_fields`. *Evaluated at:* MINT/COMPOSE, behind the same preview/PII enforcement points as every other read path.

---

#### 2.6.7 `CLIENT_LIST`

```ts
interface ClientListBody {
  segment_label: Phrase;
  segment_ref: string;
  table: TableSpec;
  pii_masked: boolean;
  bulk_intents: Array<{ intent_ref: IntentRef; label: Phrase; audience_size: Measure }>;
  page: { cursor_ref: string | null; has_more: boolean };
}
```

**Ceiling** REQUEST_APPROVAL. **Owner** `CLIENT_READ` + `BULK_AUDIENCE_OWNER` → `clients.*`, `customers.count`, `b35.preview` / `b35.status` / `b35.confirm`. **Fullscreen** REQUIRED (`exceeds_chat_density`, `audit`). **`role_hint`** `table`. **Interactive paths** `table.rows[].row_key` (where `row_intents` has an entry), `bulk_intents[].intent_ref`. **Text** headline = segment and count; itemized = row-per-line over `TableSpec`; order `lead → items → audience → completeness → unknowns → masking → as_of`; parity `full`.

- **CLIENT.1** Every `bulk_intents` entry carries `audience_size` as a `Measure` **in the body**, so the number is inside the `Cell`/provenance discipline and is stated in text before the control is reachable in `reading_order`. *Mechanism:* schema requirement plus K9's declared sentence order (`audience` precedes `options`). *Evaluated at:* MINT/VALIDATE and in CI.
- **CLIENT.2** This kind is never emitted with `presentation_mode: 'client'`. *Mechanism:* a kind-level clause of `validateEnvelope` — an envelope of kind `CLIENT_LIST` whose `presentation.presentation_mode === 'client'` is **refused**, with no exception and no subject test, because a client list is a segment and a segment is never one principal. This is the same shape of mechanism `MEDIA.2` carries, and it replaces the citation of a «display fence», which §0.19 item 3 records as defined nowhere in this contract. *Evaluated at:* `EP-MINT`.
- **CLIENT.3** Every `bulk_intents[]` entry is minted `role: 'primary'`; **no two entries carry the same intent handle**, and **no other emitted intent on a `CLIENT_LIST` body carries `role: 'primary'`**. *Mechanism:* a kind-level clause in the mint function. *Evaluated at:* MINT/INTENT. Consequence: the accessible name of a bulk control resolves to *that* entry's `audience_size` — the entry whose handle equals the ref's id — single-valued and well-founded; the table's row refs are unaffected.

---

#### 2.6.8 `METRIC`

```ts
interface MetricBody {
  period_label: Phrase;
  metrics: Measure[];                      // 1..5
  headline_metric_key: string;             // must name a member of metrics
  compare_intent: IntentRef | null;        // REFINE — change the comparison baseline
  drill_intent: IntentRef | null;          // REFINE / NAVIGATE
}
```

**Ceiling** REFINE. **Owner** `MEASUREMENT_READ` → `c7.measurement.read`, `analytics.team-kpi.read`. **Fullscreen** OPTIONAL. **`role_hint`** `group` — `role="group"` with `aria-labelledby`, controls as ordinary tab stops, and **no live region**. **Interactive paths** `compare_intent`, `drill_intent`. **Text** headline = the headline `Measure` as one sentence; itemized = one sentence per `Measure` (label, formatted value, unit, `as_of`, basis); order `lead → items → unknowns → completeness → as_of`; parity `full`.

- **METRIC.1** Every number is a `Measure`; the body has no bare numeric field. A non-`KNOWN` `Measure` reads its label and blocks only itself. *Evaluated at:* MINT/VALIDATE.
- **METRIC.2** A period or baseline change is a `REFINE` carrying the same registered read capability — not a `NAVIGATE` to a link class that could invoke something else. *Mechanism:* `REFINE` carries a non-null capability and therefore passes the registry and AUTHORITY gates (K4). *Evaluated at:* MINT/INTENT and the AUTHORITY gate.

  [NON-NORMATIVE] Capping the analytic kinds at `NAVIGATE` is not the safer choice: a capability-null `NAVIGATE` is validated as carrying no capability while its target may still name one, whereas a `REFINE` is checked against the registry and the live principal. And a metric card is not a status announcement: `role="status"` would announce every recomposition, which is what the live-region rule exists to prevent.

---

#### 2.6.9 `CHART`

```ts
interface ChartBody {
  chart_kind: 'line' | 'bar' | 'stacked_bar' | 'area' | 'scatter';
  dataset_ref: string;                     // canonical C7/C8 handle
  projection_ref: string;                  // which projection of that dataset these series are
  rows_digest: string;                     // digest of the dataset rows, returned by the read facade
  series_digest: string;                   // digest of the emitted series, returned by the read facade
  axes: {
    x: { label: Phrase; type: 'category' | 'time' | 'quantity';
         buckets: Array<Cell<string> | Measure> | null };   // the read facade's bucketing, echoed
    y: { label: Phrase; unit: Measure['unit'] };
  };
  series: Array<{ series_id: string; label: Cell<string>;
                  points: Array<{ x: Cell<string> | Measure; y: Measure }> }>;
  table_equivalent: TableSpec;             // REQUIRED
  gap_policy: 'RENDER_GAP';                // literal, single value
  drill_intent: IntentRef | null;          // REFINE
  export_intent: IntentRef | null;         // REFINE → returns an ARTIFACT
}
```

**Ceiling** REFINE. **Owner** `RESULT_READ` → `c8.result.read`, `c7.measurement.read`. **Fullscreen** REQUIRED (`exceeds_chat_density`). **`role_hint`** `img`, described by `table_equivalent`; the receipt records `'table'` when the ladder degraded it. **Interactive paths** `drill_intent`, `export_intent` (and, when degraded to `table`, `table_equivalent.rows[].row_key`). **Text** headline = what the chart is of; itemized = `table_equivalent` rendered as prose — not a description of the picture; order `lead → items → completeness → unknowns → as_of`; parity `full`.

- **CHART.1 — both axes are typed, and neither is composed.** `points[].x` is a `Cell<string>` (category, time label) or a `Measure` (quantitative position); `points[].y` is a `Measure`. Every point cell is minted by the read path's own formatter; the chart projector performs no arithmetic and constructs no point. *Mechanism:* `rows_digest` and `series_digest` are **returned by the widget-layer read facade over the C7/C8 read services**, which computes `sha256(stableActionJson(rows))` and `sha256(stableActionJson(series))` on the read path, outside the projector; `validateEnvelope` requires equality against both, and a series the composer assembled cannot produce a matching digest. *Evaluated at:* MINT/VALIDATE, and in CI over recorded emissions.

  **The dependency, stated plainly: the C7/C8 read services do not return these digests today.** Returning them is a new field on a widget-layer read facade, not a change to any C9 contract. **Until that facade ships, `CHART` is not emittable** (§2.7); a chart request produces a `LIMITATION` carrying the mapped `capability_gap_ref` and no intent.

  [NON-NORMATIVE] A projector-side recomputation of the same digests is retained as defence in depth. It is not the guarantee: it proves only that the body matches the rows the projector held, which is exactly the claim a composed series would also satisfy.
- **CHART.2 — bucket boundaries are the read facade's, echoed.** When `axes.x.buckets` is non-null it is the facade's bucketing verbatim and every `points[].x` must be a member of it; when it is null the axis is categorical and its categories are exactly the distinct `x` cells present. *Evaluated at:* MINT/VALIDATE.
- **CHART.3 — `table_equivalent` is lossless.** A CI test asserts a bijection between `(series_id, x)` pairs and `table_equivalent` cells. *Evaluated at:* CI.
- **CHART.4 — a gap is rendered as a gap.** A non-`KNOWN` point is omitted from the line and stated in text; `gap_policy` has one legal value, so interpolation across an unknown is not expressible. *Evaluated at:* MINT/VALIDATE and in the renderer conformance suite.
- **CHART.5 — a series the principal may not read is absent, not greyed.** The absence is stated by a `Limitation`. *Evaluated at:* MINT/COMPOSE (K18).

---

#### 2.6.10 `REPORT`

```ts
interface ReportBody {
  title: Phrase;
  period_label: Phrase;
  top_summary: Measure[];                  // ≤3
  sections: Array<{ section_id: string; heading: Phrase; depth: 1 | 2;
                    narrative: Narrative;
                    table: TableSpec | null;
                    metrics: Measure[] }>;
  fullscreen_intent: IntentRef;            // REQUIRED — NAVIGATE
  export_intent: IntentRef | null;         // REFINE → returns an ARTIFACT
}
```

**Ceiling** REFINE. **Owner** `ANALYTICS_READ` → `analytics.business.{query,profit}`, `analytics.revenue.forecast`, `analytics.branches.compare`, `reports.recovered`, `expenses.read`, `clients.dossier.read`. **Fullscreen** REQUIRED (`exceeds_chat_density`, `audit`). **`role_hint`** `document`. **Interactive paths** `fullscreen_intent`, `export_intent`, `sections[].table.rows[].row_key`. **Text** headline = `title` + `period_label`; itemized = headings, then narrative, then tables row-by-row; order `lead → totals → items → completeness → unknowns → masking → as_of`; parity `full`.

- **REPORT.1** `top_summary` is at most three `Measure`s and `fullscreen_intent` is mandatory: a hierarchical table never lives in a chat bubble. *Evaluated at:* MINT/VALIDATE.
- **REPORT.2** `narrative` is a `Narrative` (K6), so the model selects the sentence and supplies none of its characters. *Evaluated at:* MINT/VALIDATE.
- **REPORT.3** `group_by` gives exactly one level of grouping, which is what a two-level hierarchy (category → item) requires; a third level is not expressible and must become a second `REPORT` section or a fullscreen render. *Evaluated at:* MINT/VALIDATE.

---

#### 2.6.11 `STRATEGY_OPTIONS`

```ts
interface StrategyOptionsBody {
  revision_ref: string;
  question: Narrative;
  alternatives: Array<{ option_id: string; title: Cell<string>;
                        reasoning: Narrative;
                        expected_effect: Measure | null;
                        risk_tier: Cell<'read' | 'low_write' | 'medium_write' | 'high_write' | 'restricted'>;  // a rendered datum, so a Cell (§1.2 V1)
                        reversible: Cell<boolean>;
                        audience_size: Measure | null;
                        select_intent: IntentRef }>;      // ≤3
  no_action_option: { title: Phrase; consequence: Narrative; select_intent: IntentRef };  // REQUIRED
  review_state: 'draft' | 'reviewed' | 'not_an_approval';
  review_disclaimer: Phrase;
}
```

**Ceiling** REQUEST_APPROVAL. **Owner** `ORCHESTRATION_RUN` → C9 run revisions and `c9.no_action`. The alternative's decision fields are taken from `AgentResult@1.proposed_action_intents[]` — `risk`, `approval`, `reversibility`, `audience_size`, `rationale`. **Fullscreen** OPTIONAL (`audit`). **`role_hint`** `radiogroup`. **Interactive paths** `alternatives[].option_id`, `no_action_option.select_intent`. **Text** headline = `question`; itemized = ≤3 alternatives with reasoning, expected effect, risk and reversibility, then NO_ACTION — always spoken; order `lead → options → risk_reversibility → audience → policy → unknowns → as_of`; parity `full`.

- **STRATEGY.1** `no_action_option` is required and selectable, and is never dropped by degradation: its `select_intent` carries `priority: 0`, is a `REFINE` on the single C9 row whose resource class is `LOCAL` (`c9.no_action`), and survives every step of the ladder. *Evaluated at:* MINT/VALIDATE and at ladder step 2.
- **STRATEGY.2** `risk_tier`, `reversible` and `audience_size` are taken from the agent result's proposed intents; the widget layer computes none of them. Each is carried as a `Cell`/`Measure` because it is rendered and §1.2 V1 admits no bare user-visible scalar — **the wrapper is presentation, never a recomputation**: the composer copies the upstream value into `Cell.value` and mints only the label. **`reversible` is a `Cell<boolean>` and the only value the upstream shape can carry is the single-member literal `SOURCE_DEFINED`**, which is not a boolean and not a measurement — so `reversible` is `NOT_MEASURED` with `reason_code: 'NOT_COLLECTED'` whenever the source is that literal, which is every emission today. **No rule anywhere may read `reversible.value` without first requiring `reversible.state === 'KNOWN'`.** *Evaluated at:* MINT/COMPOSE, by field copy and by the `Cell` state rule; and at BUILD, by the source test that forbids an unguarded `.value` read.
- **STRATEGY.3** `review_disclaimer` is rendered verbatim in every channel: a review is not an approval, and the C9 review path can never satisfy a pending approval. *Evaluated at:* MINT/VALIDATE (the phrase key is fixed) and at the EFFECT ROUTING gate.
- **STRATEGY.4** This kind may not be emitted on a proactive trigger. *Evaluated at:* MINT/VALIDATE.
- **STRATEGY.5** `expected_effect` is `Measure | null` and **MUST be null** unless a `FactUsed` element of `provenance.facts_used` supplies it. No capability in the `ORCHESTRATION_RUN` owner class produces one today, so today it is null. *Evaluated at:* MINT/VALIDATE.
- **STRATEGY.6** No alternative renders with a checked state, a pre-selection, or any token distinguishing it as recommended. The body declares no recommendation member and none may be added; an alternative's accessible name is its `title`. *Evaluated at:* MINT/VALIDATE and in the renderer conformance suite.

---

#### 2.6.12 `APPROVAL`

```ts
interface ApprovalBody {
  approval_ref: string;
  subject: Cell<string>;
  effect_preview: Array<{ label: Phrase; value: Cell<string> | Measure }>;
  audience_size: Measure | null;           // REQUIRED non-null for any communication-class approval
  risk_tier: Cell<'read' | 'low_write' | 'medium_write' | 'high_write' | 'restricted'>;  // a rendered datum, so a Cell (§1.2 V1)
  reversible: Cell<boolean>;
  state: Cell<'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'EXPIRED'>;
  requested_by_label: Cell<string>;
  expires_at: string;
  approve_intent: IntentRef | null;
  reject_intent: IntentRef | null;
  blocked_reason: Phrase | null;           // non-null iff both decision intents are null
  detail_intent: IntentRef;                // NAVIGATE to the effect detail
}
```

**Ceiling** COMMIT — the approval *decision* only; the approved effect is executed by the Action Engine, never by this envelope. **Owner** `ACTION_EXECUTION` → the Action Engine's own approval path on that execution. `integrity.approval_echo` is echoed and re-derived, never accepted as input; for an AI-tool approval its `hash` is `AiApprovalRequest.payloadHash`, verified by `assertPayloadHash` (`ai-tool-runtime.service.ts:209,301,1197`). **Fullscreen** REQUIRED (`audit` — the effect detail). **`role_hint`** `region`. **Interactive paths** `approve_intent`, `reject_intent`, `detail_intent`. **Text** headline = `subject`; order `lead → items → audience → risk_reversibility → expiry → options`; parity `full`. **Expiry ceiling** `source_bound` — the approval object's own TTL.

- **APPROVAL.1 — the maths precede the verb.** `sentence_order` places `audience` and `risk_reversibility` before `options`; a CI test asserts the index ordering for every fixture. *Evaluated at:* MINT/VALIDATE and CI.
- **APPROVAL.2 — a blocked decision is a server fact.** Where the approval state machine reports that no decision may be taken by this principal, both decision intents are null and `blocked_reason` explains why. *Mechanism:* the Action Engine's approval state machine supplies the flag; the composer has no rule of its own, and the CANONICAL ACTION gate enforces the same constraint regardless of what was rendered. *Evaluated at:* MINT/COMPOSE and the CANONICAL ACTION gate.
- **APPROVAL.3 — no failure state.** `state` has no `FAILED` member; an execution whose outcome is not yet known is a non-`KNOWN` `Cell`, which renders neutrally with reconciliation language. *Evaluated at:* MINT/VALIDATE, plus the anti-error lint on every label.
- **APPROVAL.4 — the three controls carry fixed roles.** `approve_intent` is `role: 'primary'`, `reject_intent` is `role: 'destructive'`, `detail_intent` is `role: 'secondary'`, and an `APPROVAL` body mints **exactly one** `role: 'primary'` intent. *Mechanism:* a kind-level clause in the mint function. *Evaluated at:* MINT/INTENT. Consequence: the audience-size, risk and reversibility suffix reaches the approve control's accessible name and no other.

---

#### 2.6.13 `PROGRESS`

```ts
interface ProgressBody {
  run_ref: string;
  headline: Cell<string>;
  steps: Array<{ step_id: string; label: Phrase;
                 state: Cell<'PENDING' | 'RUNNING' | 'DONE' | 'SKIPPED'>;
                 //  a non-KNOWN state carries the Cell's own reason_code, label and
                 //  next_intent_ref — there is no separate `unknown` member
                 receipt_ref: string | null }>;
  step_index: number; step_total: number;
  budget_note: Phrase | null;
  poll_after_ms: number;
  stream_ref: string | null;
  cancel_intent: IntentRef | null;         // CONTROL, capability 'control.run.cancel'
}
```

**Ceiling** REFINE. **Owner** `ORCHESTRATION_RUN` → resolved at `EP-REGISTRY-LOAD` to the existence of the run, plus `owner_report.status` (§0.7 F36); a `PROGRESS` body is minted by the orchestrator from orchestrator state, not by a capability read, so no read key is needed and `orchestration.run.read` is not one — it has zero occurrences in the registry. Cancellation is the widget layer's own control key. **Fullscreen** FORBIDDEN. **`role_hint`** `progressbar`. **Interactive paths** `cancel_intent`, `steps[].state.next_intent_ref`. **Text** headline = "шаг N из M" plus the running step; itemized = one line per step; order `step_progress → items → unknowns → policy → as_of`; `budget_note` is read aloud including that paid reasoning is disabled; parity `full`. **Expiry ceiling** `source_bound` — the run window.

- **PROGRESS.1 — there is no `failed` step state.** The value enum has four members and none of them is a failure. A step that cannot complete is a non-`KNOWN` `Cell`, carrying a `reason_code`, a human label and, where one exists, a `next_intent_ref` that could resolve it. *Mechanism:* the enum itself; plus the anti-error lint over the `Cell`'s label; plus a validator rule requiring `limitations.length > 0` and a non-null `unknowns_sentence` whenever any step is non-`KNOWN`. *Evaluated at:* MINT/VALIDATE.
- **PROGRESS.2 — unknown is a first-class state, not a degraded one.** No renderer may bind a non-`KNOWN` step to a danger or destructive token, an error icon, `aria-invalid`, an alert live region, or an automatic retry; the permitted rendering is neutral-dim plus the `next_intent_ref` affordance. Such a step holds its position and blocks only its dependents, never the envelope. *Mechanism:* the renderer conformance suite, which fails a renderer with fewer than five branches per `Cell` and asserts the token bindings per state. *Evaluated at:* the renderer conformance suite, in CI.
- **PROGRESS.3 — cancel is a control with an owner, not a local action.** `cancel_intent` is `effect: 'CONTROL'`, `capability: 'control.run.cancel'`, `role: 'control'`. It is checked against that key's control floor at the VERIFICATION FLOOR gate, against the principal binding and the tenant assertion, and is then dispatched to the single registered handler for the key, which performs its own principal and tenant check and is write-once under a cancel key hash. The effect router has no default case and no edge from a control key to the Action Engine, and no intent whose effect is `NONE` appears in any routing map. *Mechanism:* the closed three-key control registry plus the owner endpoint's own lock; a CI test asserts the routing map contains no `NONE`-class intent, and a source test asserts each control handler imports no persistence outside the widget layer's own except through that owner endpoint. *Evaluated at:* MINT/INTENT, the VERIFICATION FLOOR gate, the EFFECT ROUTING gate, and CI.

  [NON-NORMATIVE] Classed as `NONE`, cancel would be a server state change travelling under the one effect class exempt from the registry lookup and from any capability-keyed authority derivation — bounded only by principal binding. Classed as `REFINE`, it would have to name a C9 read capability it does not have. It is a control, and the control registry is where its owner and its floor are declared.

---

#### 2.6.14 `LIMITATION`

```ts
interface LimitationBody {
  severity: 'info' | 'limitation' | 'risk' | 'blocking';
  headline: Phrase;
  detail: Phrase | Narrative;
  source_limitation_codes: string[];       // non-empty
  capability_gap_ref: string | null;
  remedy_intents: IntentRef[];             // MUST be empty when capability_gap_ref !== null
}
```

**Ceiling** NAVIGATE (`NONE`, `NAVIGATE`, `CONTROL`, `HANDOFF`). **Owner** `NONE` — this kind cites the emitter's `Limitation[]` and the capability-gap ledger; it has no capability of its own and mints no capability-bearing intent. **Fullscreen** OPTIONAL. **`role_hint`** `status`. **Interactive paths** `remedy_intents[]`. **Text** headline = `headline`; order `lead → gap → handoff`; parity `full`.

- **LIMIT.1 — no button for a capability with no owner.** When `capability_gap_ref` is non-null, `remedy_intents` must be empty and the text equivalent must carry the gap sentence stating plainly that nothing in the product can do this yet. *Mechanism:* a conditional schema clause plus the `gap` sentence in `sentence_order`. *Evaluated at:* MINT/VALIDATE.
- **LIMIT.2 — `severity` is not an error vocabulary.** There is no `error` member; `blocking` describes scope, not tone, and the anti-error lint applies to `headline` and `detail` as to every other label. *Evaluated at:* MINT/VALIDATE.
- **LIMIT.3 — the gap statement is mode-invariant.** It is never softened, expanded or removed by `presentation_mode`. *Evaluated at:* MINT/COMPOSE (K18).

---

#### 2.6.15 `SOURCE_STATUS`

```ts
interface SourceStatusBody {
  sources: Array<{ source_id: string; label: Cell<string>;
                   state: Cell<'CONNECTED' | 'DEGRADED' | 'UNLINKED'>;
                   as_of: Cell<string>;
                   impact_text: Phrase;
                   reconnect_intent: IntentRef | null }>;   // HANDOFF, target class 's'
  overall: Cell<'OK' | 'PARTIAL' | 'BLOCKED'>;
}
```

**Ceiling** NAVIGATE (`NONE`, `NAVIGATE`, `CONTROL`, `HANDOFF`). **Owner** `INTEGRATION_STATUS` → `support.integration-status.read`; handoff `support.contact-admin.request`. **Fullscreen** OPTIONAL. **`role_hint`** `status`. **Interactive paths** `sources[].reconnect_intent`. **Text** per source: name, state, `as_of`, impact sentence; order `lead → items → handoff → as_of`; parity `full`.

- **SOURCE.1** A provider capability the CRM does not support surfaces here, as a source state with an impact sentence — never as a fabricated success and never as an error screen. *Mechanism:* the projector maps the unsupported-capability signal onto `state: 'DEGRADED'` with an impact `Phrase`. *Evaluated at:* MINT/COMPOSE.
- **SOURCE.2** In a client presentation the body states the impact on the principal's own data and omits provider names and integration identity; the omitted paths appear in `masked_fields`. *Evaluated at:* MINT/COMPOSE.
- **SOURCE.3** `reconnect_intent` is a `HANDOFF` whose target class is `s`, carrying **`priority: 0`** — so it is never dropped by degradation and is never withheld for falling short of a verification floor. Below the session's derived level it is the only interactive element retained. It is a member of the contract's derived `FLOOR_EXEMPT` set — admitted by that predicate's `HANDOFF` clause, on a class-`s` target, and never by name — so its own subject floor is waived because the intent names a *surface*, which demands its own verification at its own ingress; a destination that is a consent or an identity act is excluded from that set outright. *Mechanism:* the `priority: 0` member, which is what `FLOOR_EXEMPT` is keyed on, and the fitter's step-1 rule that a `FLOOR_EXEMPT` intent is never withheld; the ladder's remaining steps still apply to it. *Evaluated at:* MINT/INTENT, FIT, and the VERIFICATION FLOOR gate.

---

#### 2.6.16 `SETTINGS_DRAFT` — the general confirmation body

```ts
interface SettingsDraftBody {
  draft_ref: string;                       // server-owned; minted by the canonical draft owner
  draft_class: DraftClass;                 // the five-member union declared in §0.14 F79.
                                           // 'expense' and 'loyalty_adjustment' are NOT members:
                                           // expenses.create and loyalty.internal.adjust are
                                           // gap-keyed, so neither can reach a COMMIT body.
  scope_label: Cell<string>;
  diff: Array<{ path: string; label: Phrase;
                from: Cell<string | number | boolean>;   // NOT_MEASURED when there was no prior value
                to: Cell<string | number | boolean>;
                effect_text: Phrase;
                reversible: Cell<boolean>;
                bound_ref: string | null }>;             // non-null for every numeric/financial row
  apply_intent: IntentRef;                 // the ONE COMMIT
  discard_intent: IntentRef;               // escape, priority 0
  editor_handoff_intent: IntentRef;        // REQUIRED, never droppable
}
```

**Ceiling** COMMIT. **Owner** `SETTINGS_OWNER` and every registered non-booking, non-payment draft owner — the capability named by `apply_intent.capability`. **Fullscreen** REQUIRED (`exact_configuration`, `audit`, `correction`, `accessibility`). **`role_hint`** `region` — nothing in this body is input. **Interactive paths** `apply_intent`, `discard_intent`, `editor_handoff_intent`. **Text** headline = `scope_label`; itemized = "было → станет" per diff row with its effect sentence and reversibility; order `lead → items → policy → options → unknowns → as_of`; parity `full`.

- **SETTINGS.1 — this is the confirmation body for every non-booking, non-payment draft whose owner class §0.14 F79 admits.** A `FORM` submission, a notification preference, a task and a schedule rule converge here: the canonical draft owner computes the diff, and only this body carries the `COMMIT`. **An expense and a loyalty adjustment do not converge here and cannot.** `expenses.create` carries `riskFacets: ['local','financial','expense_ledger','atomic']` and is gap-keyed under `GAP-EXPENSE-COMMIT`; `loyalty.internal.adjust` is `MONEY` under F81 and routes to the gap-blocked `PAYMENT_HANDOFF` (F82). Neither is a member of `DraftClass`, and neither reaches a `COMMIT` on any kind. *Mechanism:* the EFFECT ROUTING gate routes a `DRAFT` to the capability's registered draft owner, whose return kind is `AE_WIDGET_COMMIT_ALLOWLIST[ref.key].confirmation_kind`, per §0.13 F72 — and no kind at all when the key has no allowlist row. *Evaluated at:* the EFFECT ROUTING gate.

  [NON-NORMATIVE] The name is historical; the shape — a server-computed diff with an effect sentence and a reversibility flag per row — is exactly what an expense intake or a loyalty adjustment needs, and adding a twenty-third kind to say the same thing would have bought nothing.
- **SETTINGS.2 — `from` is a `Cell`.** A missing prior value is `NOT_MEASURED` with a human label, never an empty string and never an em dash. *Evaluated at:* MINT/VALIDATE (K5).
- **SETTINGS.3 — every numeric or financial row names a server-side bound.** `bound_ref` is re-derived at the INPUT VALIDATION gate as in K7; the diff's displayed numbers are never policy.
- **SETTINGS.4 — `editor_handoff_intent` is never droppable.** It carries `priority: 0` and survives every step of the degradation ladder; it is the mandated non-chat fallback for audit, exactness, accessibility and correction. *Evaluated at:* MINT/VALIDATE (presence) and ladder step 2 (undroppable).
- **SETTINGS.5 — a consent-bearing setting is not settled by being a setting.** `verification_floor` is derived server-side by the contract's single floor derivation and recomputed at the VERIFICATION FLOOR gate. **There is no emitter-supplied floor field** — not on a composer input, not on a body, not on an intent — so nothing can be supplied and overwritten. For `draft_class === 'notification_pref'` the derivation necessarily yields `SESSION_VERIFIED` or higher, because the capability's policy row carries a communication consent class whose floor is `SESSION_VERIFIED`; this holds for per-moment delivery preferences exactly as for any other consent-bearing capability. *Evaluated at:* MINT/INTENT (derive) and the VERIFICATION FLOOR gate (re-derive).

---

#### 2.6.17 `FORM`

```ts
interface FormBody {
  form_ref: string;
  justification: FormJustification;
  schema_ref: string;
  fields: FormField[];                     // ≤12
  submit_intent: IntentRef;                // effect DRAFT — ALWAYS
  discard_intent: IntentRef;               // escape, priority 0
  editor_handoff_intent: IntentRef;        // REQUIRED, never droppable
  partial_save: false;                     // literal
}

type FormJustification =
  | 'LEGAL_EXACTNESS' | 'MULTI_FIELD_ATOMIC' | 'ACCESSIBILITY_REQUEST'
  | 'CORRECTION_OF_RECORD' | 'AUDIT_EXACT_INPUT';

interface FormField {
  field_key: string;
  label: Phrase;
  control: 'text' | 'number' | 'date' | 'time' | 'select' | 'toggle' | 'phone';
  required: boolean;
  help: Phrase | null;
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
- **FORM.2 — a submission produces a server-owned draft, re-rendered as a confirmation body.** The `DRAFT` is routed to the capability's canonical draft owner, which validates every value against the capability's own policy, computes the resulting diff, and returns `next_envelope` = the kind `AE_WIDGET_COMMIT_ALLOWLIST[ref.key].confirmation_kind` names per §0.13 F72 — and **no confirmation body at all** when the key has no allowlist row, at which point the `DRAFT` refuses at `EP-MINT`. The kind is whatever the row names — `BOOKING_CONFIRMATION`, `SETTINGS_DRAFT` or `PAYMENT_HANDOFF` — read from the row and never inferred from the capability's class. **Only that returned body may carry the `COMMIT`.** *Mechanism:* the EFFECT ROUTING gate, and independently the gateway's INGRESS Gate 7, which refuses any submission whose persisted `IntentRecord.widget_kind` is not one of the four confirmation kinds (K11). *Evaluated at:* the EFFECT ROUTING gate and INGRESS Gate 7.

  [NON-NORMATIVE] `FORM` is the one kind accepting open-domain input. Letting it carry a `COMMIT` for an inherited capability would put a client-authored magnitude in front of the Action Engine as a resolved argument, guarded only by a justification enum that is a social control. The claim "a widget cannot express a direct business mutation" is true by construction instead: the value the user typed is validated by the owner and re-presented as a diff the user confirms.
- **FORM.3 — every numeric or financial field names a server-side bound drawn from the capability.** `bound` is required for `control: 'number'` and for any field whose `Measure` unit is `RUB`; `bound_ref` is re-derived at the INPUT VALIDATION gate, and an out-of-bound value is refused, never clamped (K7). *Evaluated at:* MINT/VALIDATE (presence) and the INPUT VALIDATION gate (re-derivation).
- **FORM.4 — `editor_handoff_intent` and a non-null `fullscreen_detail` are mandatory.** The surfaces with the strongest audit and correction obligations — a cash declaration, an expense intake, a record correction — are precisely the ones that must have a non-chat editor. *Evaluated at:* MINT/VALIDATE.
- **FORM.5 — `SECURE_SURFACE_ONLY` fields are absent from the chat render and from the text.** They are replaced by one handoff sentence; the only legal intent touching them is a `HANDOFF` to a verified channel; a submission carrying such a field is refused (`REFUSED / use_secure_surface`). An intent touching such a field is withheld at the ladder's secure-surface step whatever its priority. *Evaluated at:* MINT/COMPOSE, MINT/VALIDATE, FIT and the INPUT VALIDATION gate.
- **FORM.6 — `partial_save` is `false` and the escape is undroppable.** A `FORM` is either submitted whole or abandoned whole; `discard_intent` is this envelope's escape intent, carries `priority: 0`, and is reachable by the universal cancel verbs in every channel. *Evaluated at:* MINT/VALIDATE and ladder step 2.
- **FORM.7 — every open-domain `FORM` emission is written to the free-input ledger with its justification, tenant and capability (K14).** *Evaluated at:* MINT/INTENT.

---

#### 2.6.18 `CONSENT_STATE`

```ts
interface ConsentStateBody {
  consent_kind: 'PD_BASE' | 'MARKETING' | 'CHANNEL_DELIVERY' | 'HISTORY_RETENTION';
  subject_label: Cell<string>;                      // masked unless subject_is_principal
  decision: Cell<'GRANTED' | 'DECLINED' | 'WITHDRAWN' | 'NEVER_ASKED'>;
  recorded_at: Cell<string>;
  recorded_via: Cell<string>;                       // which surface recorded it — audit, not a link
  scope_text: Phrase[];                             // what the current decision permits
  change_effect_text: Phrase[];                     // what changing it would do
  register_ref: string | null;                      // append-only consent-register handle
  change_handoff_intent: IntentRef | null;          // HANDOFF only; target class 's'
  capability_gap_ref: string | null;                // when set, change_handoff_intent MUST be null
}
```

**Ceiling NONE** — `permitted_effects` are `NONE`, `CONTROL` and `HANDOFF` only. **Owner** `CONSENT_REGISTER` → the consent register's read capability; the change owner is separate and separately registered. **Fullscreen** REQUIRED (`exact_configuration`, `audit`). **`role_hint`** `region`. **Interactive paths** `change_handoff_intent`. **Text** current decision, when it was recorded, what it permits, what changing it would do, and the single sentence naming the verified surface where it can be changed; order `lead → items → policy → handoff → gap → as_of`; parity `full`. **Expiry ceiling** 300 s.

- **CONSENT.1 — the accept/decline control is not expressible on this kind.** `validateEnvelope` rejects any `CONSENT_STATE` carrying an intent whose `role` is not `handoff` or `escape`, and the kind's `permitted_effects` exclude every effect class that could carry a decision. This is the type rule that replaces reliance on a maintained list of capability names. *Evaluated at:* MINT/VALIDATE and MINT/INTENT.
- **CONSENT.2 — REFUSED AT MINT without a derived floor, a named destination and a live route.** A `CONSENT_STATE` envelope is refused at mint unless **every intent whose `role` is not `'escape'`** has a derived `verification_floor` of `SESSION_VERIFIED` or higher, carries a non-null `handoff_capability_ref` (a registry key that is *not* actuated by the handoff), and carries a target of class `s` resolving to a live shell route. The escape is excluded because it carries no capability, no target and no consent decision — and because a fence no envelope can satisfy is not a fence: this kind must carry the mandatory escape, and a rule that refused it would make the kind unmintable outright. *Mechanism:* a kind-level clause in `validateEnvelope`, evaluated before `envelope_seal` is computed. *Evaluated at:* MINT/VALIDATE.

  [NON-NORMATIVE] This clause is what makes the floor and the never-chat-actuated predicates evaluable at all for these intents: a floor that is absent cannot be compared, and a capability that is null cannot be matched against a list.
- **CONSENT.3 — the floor is server-derived, never authored.** `verification_floor` is derived by the contract's single floor derivation at MINT and recomputed at the VERIFICATION FLOOR gate. There is no emitter-supplied floor field anywhere, so nothing can be supplied and overwritten. For this kind the derivation necessarily yields `SESSION_VERIFIED` or higher for every non-escape intent: the kind's own floor is `SESSION_VERIFIED`, a class-`s` target floors there, and a personal-data consent class floors there. *Evaluated at:* MINT/INTENT and the VERIFICATION FLOOR gate.
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
                    state: Cell<'LINKED' | 'UNLINKED' | 'PENDING'>;
                    since: Cell<string>;
                    unlocks_text: Phrase[];
                    loss_on_unbind_text: Phrase[];
                    manage_handoff_intent: IntentRef | null }>;   // HANDOFF only; target class 's'
  capability_gap_ref: string | null;
}
```

**Ceiling NONE** — `permitted_effects` are `NONE`, `CONTROL` and `HANDOFF` only. **Owner** `IDENTITY_BINDING_OWNER` → the channel-authenticator and CRM-binding capabilities. **Fullscreen** REQUIRED (`exact_configuration`, `audit`). **`role_hint`** `region`. **Interactive paths** `bindings[].manage_handoff_intent`. **Text** which channels are linked, since when, what each unlocks, what unlinking would cost, then the handoff sentence; order `lead → items → policy → handoff → gap → as_of`; parity `full`. **Expiry ceiling** 300 s — an unlink or relink invalidates every outstanding envelope retroactively, so a long ceiling on a binding display would contradict that rule.

- **IDENTITY.1–IDENTITY.6** — CONSENT.1 through CONSENT.6 apply verbatim to this kind, with `manage_handoff_intent` in place of `change_handoff_intent`. An `IDENTITY_BINDING` envelope is **REFUSED AT MINT** unless **every intent whose `role` is not `'escape'`** carries a derived `verification_floor` of `SESSION_VERIFIED` or higher, a non-null `handoff_capability_ref`, and a class-`s` target resolving to a live shell route. *Evaluated at:* MINT/VALIDATE, MINT/INTENT, and the VERIFICATION FLOOR gate.
- **IDENTITY.7 — this kind is not `SOURCE_STATUS`.** A provider reconnect is an ordinary handoff; an identity unbind is never actuated by the identity of the channel asking. Keeping the two kinds apart also keeps provider health out of the same body as channel-binding state, on which the existing client-preview enforcement points key. *Mechanism:* two kinds, two rule rows, two owner classes. *Evaluated at:* REGISTRY LOAD.

---

#### 2.6.20 `PAYMENT_HANDOFF`

```ts
interface PaymentHandoffBody {
  order_ref: string | null;                // server-owned draft handle; null in gap state
  subject: 'gift_certificate' | 'membership' | 'tips' | 'loyalty_redemption' | 'service_prepayment';
  lines: Array<{ label: Phrase; amount: Measure }>;
  amount_total: Measure;                   // SERVER-FIXED, unit 'RUB'
  beneficiary_label: Cell<string>;
  acquirer_label: Cell<string>;            // display only — never a target, never a URL
  returns_text: Phrase;                    // what the payer gets back, and where
  policy_notices: Phrase[];
  session: { session_ref: string; expires_at: string; resume_widget_id: string } | null;
  commit_intent: IntentRef | null;         // the ONE COMMIT; null in gap state
  continue_intent: IntentRef | null;       // NAVIGATE, target { class: 's', ref: { route: 'shell.pay', param: session_ref } }
  dismiss_intent: IntentRef;               // escape, priority 0
  capability_gap_ref: string | null;       // when set: commit_intent AND continue_intent MUST be null
}
```

**Ceiling** COMMIT. **Owner** `COMMERCE_OWNER` — a **registered** payment/commerce capability. **Fullscreen** REQUIRED (`exact_configuration`, `audit`). **`role_hint`** `region`. **Interactive paths** `commit_intent`, `continue_intent`, `dismiss_intent`. **Text** what is bought, the exact amount as a formatted `Measure`, who takes the payment, what returns afterwards, and when the handle expires; order `lead → items → totals → policy → options → gap → expiry`; parity `full`. **Expiry ceiling** `source_bound` — the payment session's TTL, and never longer than 900 s.

- **PAY.1 — payment is a canonical capability, not a handoff to a provider.** The path is: a `DRAFT` owned by a registered payment/commerce owner produces this confirmation body → the single `COMMIT` reaches the CANONICAL ACTION gate → the **Action Engine** initiates the provider session, and the Action Engine owns the idempotency key and the receipt. The widget, the renderer, the chat layer and the native shell never call a provider. *Mechanism:* `commit_intent` carries a registry capability, so it is subject to the registry lookup, the AUTHORITY gate and the CANONICAL ACTION gate exactly as any other commit; the provider owner is called by the Action Engine alone. *Evaluated at:* MINT/INTENT, the AUTHORITY gate, the CANONICAL ACTION gate.

  [NON-NORMATIVE] Modelled as `HANDOFF`, this would be a button reaching an external payment provider with no capability, no Action Engine, no idempotency key, no receipt and no canonical owner — and it would pass every invariant *because* handoff intents are capability-null, which makes the registry check and the no-owner rule both vacuous. The project's documented double-payment incident is the exact failure an idempotency-free provider handoff reproduces.
- **PAY.2 — the redirect is a first-party route, issued after the commit.** `continue_intent` may exist only after a receipt exists; its target is the closed shell route `{ route: 'shell.pay', param: <session_ref> }` — one opaque, server-minted parameter, a first-party route with a `SESSION_VERIFIED` floor that performs the redirect server-side. No body field, no intent target and no receipt field may contain a provider URL, a checkout id, a card token, a bridge method name or a native-scheme URL. *Mechanism:* the body schema contains no URL-typed field; `IntentTarget.ref` is validated against the closed shell-route table, which admits a parameter on exactly two routes and null elsewhere; K8's structural validator refuses the forbidden keys at any depth. *Evaluated at:* MINT/VALIDATE and on every submission.
- **PAY.3 — the amount is never client-supplied.** `amount_total` and every `lines[].amount` are `Measure`s read from the commerce owner; `commit_intent.input_schema === null` (K12); the amount travels as a frozen noun resolved by a fresh read at the INPUT VALIDATION gate, and a divergence returns `SUPERSEDED` with a rendered diff. *Evaluated at:* MINT/INTENT and the INPUT VALIDATION gate.
- **PAY.4 — until the owners are registered, this kind emits a gap and no button.** `commit_allowed` is derived at REGISTRY LOAD from `permitted_effects` and the owner-class resolution, so it is false while no payment-class owner is registered; while it is false, every emission carries `capability_gap_ref` (`GAP-COMMERCE-GIFT`, `GAP-LOYALTY-REDEEM`, or the tips gap), a null `commit_intent` and a null `continue_intent`, and states in text that the purchase cannot be completed in the product yet. A gap-blocked commit renders as prose, never as a disabled-styled button. *Mechanism:* K20's derivation plus a conditional schema clause. *Evaluated at:* REGISTRY LOAD, MINT/COMPOSE and MINT/VALIDATE.
- **PAY.5 — tips are not an exception.** A tip is a payment-class capability like any other and follows PAY.1 through PAY.4. There is no bridge-initiated payment path, and no field in which a bridge method could be named. *Evaluated at:* MINT/VALIDATE (K8).

---

#### 2.6.21 `MEDIA_PREVIEW`

```ts
interface MediaPreviewBody {
  media_ref: string;                       // opaque; resolves only through a signed first-party asset route
  alt: Phrase;                             // server-authored, non-empty
  recipe: { requested: Cell<string>;
            parameters: Array<{ label: Phrase; value: Cell<string> }>;
            produced_at: Cell<string>;
            producer_label: Cell<string> };
  subject_is_principal: boolean;
  expires_at: string;
  regenerate_intent: IntentRef | null;     // REFINE
  fullscreen_intent: IntentRef;            // REQUIRED — NAVIGATE
}
```

**Ceiling** REFINE. **Owner** `MEDIA_GENERATION_OWNER` — the generation capability, which must be registered before this kind is emittable. **Fullscreen** REQUIRED (`non_textual_medium`). **`role_hint`** `img`, described by the recipe; no live region. **Interactive paths** `regenerate_intent`, `fullscreen_intent`. **Text parity `recipe_only`** — headline = what was requested; itemized = the recipe (request, parameters, when, producer) plus `alt`; order `recipe → items → handoff → unknowns → expiry`. **Expiry ceiling** `source_bound` — the signed asset's TTL, and never longer than 3600 s.

- **MEDIA.1 — the text equivalent is the recipe, and the contract says so.** The portability test for this kind asserts recipe parity: every recipe field and the `alt` string must be reachable in text. It does **not** assert that the image reduces to prose, because it does not. A channel that cannot render images receives the recipe and a `NAVIGATE` to the fullscreen route; it never receives a claim that the image has been conveyed. *Mechanism:* `text_shape.parity: 'recipe_only'`, asserted as such in CI (K10). *Evaluated at:* CI.
- **MEDIA.2 — a generated image of a client is client-identified.** `pii_ceiling` is `client_identified`; under a client presentation the envelope is refused unless `subject_is_principal` is true; a staff principal never receives another client's generated image in chat. *Evaluated at:* MINT/VALIDATE, behind the same preview/PII enforcement points as every other read path.
- **MEDIA.3 — the media handle is not a URL.** `media_ref` resolves only through a signed first-party asset route bound to the envelope's principal proof; a relink or unlink invalidates it. *Mechanism:* K8's structural validator plus the route's principal check. *Evaluated at:* MINT/VALIDATE and at asset fetch.
- **MEDIA.4 — the body is in scope for conversation erasure.** Its retention window is the one §4.4.2 gives `MEDIA_PREVIEW`, which is that table's to state and not this clause's, and the body is dropped on historisation; deleting conversation history deletes the preview and its recipe, and touches no canonical record. *Evaluated at:* historisation (K19).

---

#### 2.6.22 `ARTIFACT`

```ts
interface ArtifactBody {
  artifact_ref: string;                    // opaque; resolves only through a signed first-party delivery route
  filename: Cell<string>;
  format: Cell<'pdf' | 'csv' | 'xlsx' | 'json' | 'png'>;
  size_bytes: Measure;                     // unit 'count'
  contains_text: Phrase;                   // what it contains, one sentence
  contains_pii: Cell<boolean>;
  produced_at: Cell<string>;
  expires_at: string;
  fetch_intent: IntentRef;                 // NAVIGATE, target { class: 's', ref: { route: 'shell.file', param: artifact_ref } }
  regenerate_intent: IntentRef | null;     // REFINE
}
```

**Ceiling** NAVIGATE (`NONE`, `NAVIGATE`, `CONTROL`, `HANDOFF`). **Owner** `ARTIFACT_OWNER` → `owner_report.download`, `owner_report.status`. **Fullscreen** FORBIDDEN — the file *is* the detail. **`role_hint`** `link`; no live region. **Interactive paths** `fetch_intent`, `regenerate_intent`. **Text parity `file_facts_only`** — filename, format, size, what it contains, whether it contains personal data, and when the link expires; order `file_facts → policy → expiry → as_of`. **Expiry ceiling** `source_bound` — the delivery link's TTL, and never longer than 900 s.

- **ARTIFACT.1 — delivery is a first-party route, never a client-side download.** `fetch_intent` targets the closed shell route `{ route: 'shell.file', param: <artifact_ref> }` — one opaque, server-minted parameter; the file is served by a first-party endpoint that re-checks the principal. There is no `<a download>`, no `data:` or `blob:` href, and no bridge call — such deliveries are inert in the viewer sandbox and in the native shells anyway. *Mechanism:* K8's structural validator plus the closed shell-route table. *Evaluated at:* MINT/VALIDATE and at fetch.
- **ARTIFACT.2 — the file is minted for one principal.** The delivery route compares the live principal's proof hash against the artefact's; a relink or unlink cycle invalidates it on every device. *Evaluated at:* fetch.
- **ARTIFACT.3 — `contains_pii` is stated before the file is fetched.** It is a `Cell<boolean>`; when it is true the text says so in the `policy` sentence, and `pii_ceiling` applies. *Evaluated at:* MINT/VALIDATE and K9's sentence order.
- **ARTIFACT.4 — an artefact whose producing capability is unregistered is not emitted.** The consent-register export has no registered owner today; a request for it produces a `LIMITATION` carrying `GAP-CONSENT-REGISTER-EXPORT` and no intent (K20, LIMIT.1), and — because that capability is also never chat-actuated — no handoff on this kind either. *Evaluated at:* REGISTRY LOAD and MINT/COMPOSE.
- **ARTIFACT.5 — the two controls carry fixed roles.** `fetch_intent` is `role: 'primary'` and `regenerate_intent` is `role: 'secondary'`. *Mechanism:* a kind-level clause in the mint function. *Evaluated at:* MINT/INTENT. Consequence: the file facts — filename, format, size — compose the accessible name of the single activation control and of no other, so a regenerate control never announces itself as the file.

---

### 2.7 Emission readiness — which of the twenty-two may be emitted today

`emittable` is derived at REGISTRY LOAD (K20), not asserted here. Against the capability registry as it stands:

| Status | Kinds |
|---|---|
| **Emittable** (16) | `CHOICE`, `SERVICE_SELECTOR`, `STAFF_SELECTOR`, `TIME_SLOT_SELECTOR`, `BOOKING_CONFIRMATION`, `SCHEDULE`, `CLIENT_LIST`, `METRIC`, `REPORT`, `STRATEGY_OPTIONS`, `APPROVAL`, `PROGRESS`, `LIMITATION`, `SOURCE_STATUS`, `SETTINGS_DRAFT`, `FORM` |
| **Emittable, narrowly** (1) | `ARTIFACT` — owner reports only (`owner_report.download`, `owner_report.status`) |
| **Blocked on the widget-layer read facade** (1) | `CHART` — until the facade returns `rows_digest` and `series_digest` on the read path (CHART.1) |
| **Blocked on capability registration** (4) | `CONSENT_STATE`, `IDENTITY_BINDING`, `PAYMENT_HANDOFF`, `MEDIA_PREVIEW` |

For each blocked kind the correct emission today is a `LIMITATION` carrying the mapped `capability_gap_ref` and **no intent**. The rules those kinds carry — CHART.1–5, CONSENT.1–6, IDENTITY.1–7, PAY.1–5, MEDIA.1–4 — are in force in the validator from the day the contract ships, so registration (or, for `CHART`, the read facade) is the only remaining step and cannot be accompanied by a quiet relaxation.

**K23 — a kind's emittability has two independent derivations for handoff kinds.** For `CONSENT_STATE` and `IDENTITY_BINDING`, `emittable` requires a registered **read** owner (to compose the body), and a non-null handoff intent additionally requires a registered **change** owner *and* a resolvable class-`s` route. Either may become true without the other. *Evaluated at:* REGISTRY LOAD and MINT/COMPOSE.

[NON-NORMATIVE] That split matters in practice: the marketing-consent change path can be routed to an owner that already exists and is already append-only, well before any `consent.*` read capability is registered — at which point the product can honour a revocation it currently promises in outbound copy but cannot perform, while the in-chat state display stays a `LIMITATION` until a read owner exists.

---

### 2.8 What this registry does not claim

1. **It restores no capability.** Four kinds are unemittable for want of a registered owner, one waits on a read facade, and one is narrowly emittable. This section gives them a fail-closed way to say "no owner" and a body waiting for the day there is one. That is not one line of the capability itself.
2. **`CHART`'s digest guarantee depends on a component that does not exist yet.** The strong form — digests computed on the read path, outside the projector — is the one that makes a composed series unforgeable, and it is stated with its dependency rather than weakened to something the projector can satisfy alone.
3. **`MEDIA_PREVIEW` does not satisfy full text parity, and no longer claims to.** Its parity is `recipe_only`, declared in the registry and asserted as such in CI. If the owner of the portability rule judges that insufficient, the honest alternative is that generated media are not widgets at all and live only behind a fullscreen route — a judgement about the contract's first principle, not about this taxonomy.
4. **`SETTINGS_DRAFT` and `FORM` remain two kinds.** They differ in read model — a server-computed diff versus collected values — and `FORM` carries the rationing, the bounds and the secure-surface machinery. The inventory contains no surface that decisively requires both, and if one had to go, `SETTINGS_DRAFT` is a `FORM` whose fields are pre-filled with a diff. This is the registry's weakest seam and is recorded as such rather than defended.
5. **The density caps are registry defaults, not measurements.** They are chosen to force escalation early and may be lowered per tenant, never raised. They are not derived from usage evidence, and the render receipts are the instrument that will say whether they are right.
6. **`CHART.3`'s bijection test, `K9`'s ordering test and `K18`'s mode-invariance test are CI tests over recorded emission fixtures.** They are only as strong as the fixture corpus. That corpus is a deliverable, not an assumption.
7. **`STRATEGY_OPTIONS.risk_tier` declares a `'read'` member the upstream shape cannot produce.** The agent result's proposed intents carry four risk values (`low_write`, `medium_write`, `high_write`, `restricted`); the body's fifth member is unreachable by copy today. It is retained rather than removed, because removing it would be a change to a rendered vocabulary, and it is named here rather than left to be discovered.

---
---

## 3. Intents, the gateway, and the forbidden edges

This section defines the only interactive surface a widget has, the gateway that
receives it, the ordered gate sequence every interaction passes through, the edges
that cannot be constructed, and the fundamental rules with the mechanism that makes
each one true. It is the sole definition of `WidgetIntent`, `EffectClass`, `IntentTarget`,
`ConfirmationRequirement`, `InputSchema`, `IntentRecord`, `WidgetIntentSubmission`,
`ReadbackAck`, the verification-floor derivation, the gate order, and the fundamental rules.

**Reading rule.** Every sentence in this section is normative unless it is prefixed
`[NON-NORMATIVE]`. Every normative rule names (a) the mechanism that enforces it and
(b) the point at which that mechanism is evaluated. Each mechanism carries a status:

- **[EXISTS]** — present in the repository today at the path named. Verified.
- **[TO BUILD]** — required by this contract and shipped by the package that ships the
  IntentGateway. Nothing in this cycle builds it.
- **`NORMATIVE-PENDING` on P-*n*** — the rule is normative and its mechanism is named, but the
  prerequisite row P-*n* is not shipped. Until it ships the rule holds **fail-closed**: the
  affordance is not emitted at all.

A rule whose mechanism is **[TO BUILD]** is a requirement on that package, not a claim
about today's system. A guarantee with no mechanism in either state does not appear in
this section.

**Evaluation points** are named once and used throughout: `EP-BUILD` (build/CI),
`EP-REGISTRY-LOAD` (process start-up, registry and table totality), `EP-MINT`
(`mintIntent()` / `validateEnvelope()` over the composed envelope), `EP-FIT` (channel
fitting, before the seal), `EP-INGRESS` (the gateway pipeline of §3.9, by gate number),
`EP-FETCH` (a first-party shell route resolving its opaque parameter), `EP-CANONICAL`
(the Action Engine's own policy resolution), `EP-RENDER` (the renderer draws).

---

### 3.1 `WidgetIntent` — the complete shape

```ts
interface WidgetIntent {
  // --- identity ---
  intent_ref: string;                 // envelope-local, e.g. 'i1'. The only value any
                                      // *_intent / next_intent_ref field may hold. Not a token.
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
  priority: number;                   // 0 = NEVER droppable by degradation, and the first
                                      // term of FLOOR_EXEMPT (§3.4)

  // --- effect ---
  effect: EffectClass;                // §3.2, closed
  capability: CapabilityRef | null;   // non-null iff effect ∈
                                      // {REFINE, CONTROL, DRAFT, REQUEST_APPROVAL, COMMIT}
  handoff_capability_ref: CapabilityRef | null;  // NON-NULL IFF effect === 'HANDOFF'.
                                      // Names the act the user is being carried toward.
                                      // It is never invoked (§3.5 R3.5.3, §3.9 Gate 13).
  target: IntentTarget | null;        // §3.3; non-null iff effect ∈ {NAVIGATE, HANDOFF}
  input_schema: InputSchema | null;   // §3.6; null = no client-supplied input at all

  // --- authority ---
  verification_floor: VerificationLevel;      // REQUIRED on EVERY intent of EVERY effect
                                              // class. Never null. Never authored by the
                                              // emitter: derived by §3.4.
  confirmation: ConfirmationRequirement | null;  // non-null iff effect ∈
                                              // {REQUEST_APPROVAL, COMMIT}
  authority_hint: AuthorityHint;              // RENDERING HINT ONLY. Never read by any
                                              // server decision (§0.16 F89, FR-3).

  // --- state ---
  enabled: Cell<boolean>;             // a disabled intent still carries a real floor
  expires_at: string;                 // RFC3339; ≤ envelope expires_at
  single_use: boolean;
}
```

`AuthorityHint` is a closed shape carrying **no authority vocabulary** — it names no role, no
capability, no tenant and no verification level:

```ts
interface AuthorityHint {           // RENDERING ONLY. Never read by any server decision (FR-3).
  emphasis: 'primary' | 'secondary' | 'muted';
  disabled_because: ReasonCode | null;   // see R3.1.0 — the equality is a rule, not a comment
}
```

**R3.1.0 — `authority_hint.disabled_because` equals `intent.enabled.reason_code`, and is null
exactly when `intent.enabled.state === 'KNOWN'`.** Both members are inside `body_hash`, so
without the equality a disagreeing pair would be minted, sealed and rendered with nothing to
adjudicate between them — and the disagreement would be *in* the seal, which is the one place a
later reader cannot repair it. *Mechanism:* the emission validator's cross-field check over the
composed envelope, refusing on inequality. *Evaluated at:* `EP-MINT`. *Status:* [TO BUILD].

Both members are mint class **M**: a composer cannot author them and no model output reaches
them. `intents.map(stripIntentToken)` feeds `body_hash`, so every member of `AuthorityHint`
is a sealed input and none may be left undefined.

`MintedIntent` — `WidgetIntent` with its two capability members retyped to `CapabilityRef | null`
per §0.6 F21 — is the intent shape every floor and capability derivation reads. It is **declared
in §0.8 and is not re-declared here**, because it is an input to the floor derivation and §0.2's
map gives the floor to §0.

**R3.1.1 — `intent_token` is null exactly for `NONE`.** *Mechanism:* closed-shape validator
over the emitted envelope, plus the submission schema, which requires a non-null
`intent_token` (§3.8). *Evaluated at:* `EP-MINT` (validator) and `EP-INGRESS` (schema).
*Status:* [TO BUILD]. *Consequence:* an intent with `effect: 'NONE'` has nothing to send, so
"`NONE` is purely local" is true by absence rather than by convention. The one intent whose
effect class is chosen rather than authored — the escape verb — is decided at `EP-FIT` before
the seal (§3.12.6), and both of its branches satisfy this rule: `NONE` with a null token on
`RICH_INTERACTIVE`, `CONTROL` with a non-null token everywhere else.

**R3.1.2 — every field above is server-minted.** No renderer composes, edits or
substitutes any of them, and no field is echoed back. *Mechanism:* the submission shape
(§3.8) has no member able to carry an intent field; `body_hash` covers `intents` stripped
of `intent_token`, so a modified label or utterance fails seal verification at render.
*Evaluated at:* `EP-RENDER` (seal check), and `EP-INGRESS` (unknown keys are rejected
structurally by INV-1). *Status:* [TO BUILD].

**R3.1.3 — `authority_hint` is not an input to any decision.** *Mechanism:* the
AuthorityResolver's input type does not include the envelope; a CI import/reference test
asserts that no module under the authority, policy or action path reads
`authority_hint`; and a property test asserts a byte-identical intent set across all four
presentation modes for the same principal. *Evaluated at:* `EP-BUILD`. *Status:* [TO BUILD].
[NON-NORMATIVE] A hint that disagrees with the server's derivation causes the widget to be
re-issued. The server's derivation never bends to the hint.

**R3.1.4 — every `*_intent` field of every body holds an `intent_ref`, never a token.**
`intent_ref` is envelope-local (`'i1'`), class **structural**, and never rendered.
`intent_token` exists only on `WidgetIntent.intent_token` and travels only in the carrier.
Where a handle sits on a repeated element, it names the **single** envelope-level intent whose
`InputSchema` field of kind `enum`/`ref` carries that element's id in its closed `domain_ref`;
the element id is the *selection*, not a second intent. *Mechanism:* the leaf schema types
these fields as `intent_ref`; `validateEnvelope` asserts each resolves to an emitted intent and
that the element id is a member of that intent's `domain_ref`. *Evaluated at:* `EP-MINT`.
*Status:* [TO BUILD].

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

The **business ordering** is `NONE < NAVIGATE < REFINE < DRAFT < REQUEST_APPROVAL < COMMIT`.
`HANDOFF` and `CONTROL` are off that order and are permitted per kind by explicit membership;
`CONTROL` never raises a kind's effect ceiling, and `CONTROL` is a permitted effect on all
twenty-two kinds because every kind needs a dismissal.

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
*Evaluated at:* `EP-MINT` (emission, and again over the minted `IntentRecord` — the same
validator runs over the record). *Status:* [TO BUILD].

**R3.2.2 — a capability reference names its key space, and each space admits one set of
effect classes.** Every capability-valued member of an intent, of an `IntentRecord`, of a
class-`c` target and of every row key of `WIDGET_CAPABILITY_POLICY` is a `CapabilityRef`,
never a bare string. Only `REFINE`, `DRAFT`, `HANDOFF` and a class-`c` `NAVIGATE` may carry a
`C9` ref; only `COMMIT` and `REQUEST_APPROVAL` may carry an `AE` ref; only `CONTROL` may carry
a `CONTROL` ref; **no intent of any effect class may carry a `TOOL` ref.**
*Mechanism:* the discriminated `CapabilityRef` union, plus `validateEnvelope`'s per-effect
membership check against `C9_CAPABILITIES`, `ActionCapabilityRegistry` and `CONTROL_REGISTRY`
respectively; a source test asserts that no member named `capability` or `handoff_capability_ref` on `WidgetIntent`, `IntentRecord` or `IntentTarget`, and no `WIDGET_CAPABILITY_POLICY` key, is typed `string` — narrower than «zero `capability: string` in the widget layer», which would also condemn `AE_WIDGET_COMMIT_ALLOWLIST`'s own string-keyed rows.
*Evaluated at:* `EP-MINT`, `EP-INGRESS` Gate 7, `EP-BUILD`. *Status:* `NORMATIVE-PENDING` on
**P-24**.
[NON-NORMATIVE] The conversion between spaces never happens in the widget layer. A `DRAFT`
carrying a C9 propose key is routed at Gate 13 to that capability's registered canonical draft
owner; **that owner** composes the confirmation body and names the Action Engine key the
`COMMIT` will carry. The widget layer records the pairing; it does not compute it.

**R3.2.3 — `NONE` may not appear on a channel that cannot act locally.** A `NONE` intent is
legal only on a fitted `render_tier === 'RICH_INTERACTIVE'`. On every other tier the fitter
replaces it with the equivalent `CONTROL` intent carrying `control.widget.dismiss`;
`RenderReceipt.applied_rules` records which. *Mechanism:* the fitter's escape branch, then the
closed-shape validator over the fitted envelope. *Evaluated at:* `EP-FIT`, `EP-MINT`.
*Status:* [TO BUILD].
[NON-NORMATIVE] Dismissing a Telegram card requires `edit_message_text` — a server call, and
classed as one.

**R3.2.4 — `CONTROL` is a registered control key under its owner endpoint's own lock.** A
`CONTROL` intent carries a non-null `capability` of space `CONTROL`, drawn from the **control
registry**, a closed, versioned, server-side table owned by the widget layer. At Gate 5 the
submission is checked against `CONTROL_FLOOR[key]`; at Gate 3 against the principal binding;
at Gate 4 against the tenant assertion; and it is then dispatched at Gate 13 to the one
registered handler for that key, which performs its **own** principal and tenant check.
*Mechanism:* the closed control registry plus the owner endpoint's lock; the effect router has
no default case and no `CONTROL → ActionEngine` edge; a source test asserts each handler module
imports no Prisma model outside the widget layer's own except through that owner endpoint.
*Evaluated at:* `EP-INGRESS` Gates 5, 6 and 13; `EP-BUILD`. *Status:* [TO BUILD] over an
[EXISTS] cancel endpoint.

**`CONTROL_REGISTRY` is closed at three keys and is declared in §0.7 F27**, with each key's
`CONTROL_FLOOR`, owner endpoint and build status. **It is not restated here.** The copy that
stood in this section had already drifted from F27 in its status vocabulary — `[TO BUILD]`
against `[ABSENT]` — which is how a registry with two tables comes to give two answers to
«does this handler exist yet».

**R3.2.5 — `CONTROL` may never reach the Action Engine and may never write a canonical
business row.** *Mechanism:* the effect router has no `CONTROL → ActionEngine` edge, and a
CI test asserts that every control-registry entry's handler module imports no Prisma model
other than the widget layer's own. *Evaluated at:* `EP-INGRESS` Gate 13 (routing) and
`EP-BUILD`. *Status:* [TO BUILD].

**R3.2.6 — run cancellation is a `CONTROL`.** `PROGRESS.cancel_intent` is
`effect: 'CONTROL'`, `capability: { space: 'CONTROL', key: 'control.run.cancel' }`,
`role: 'control'`. *Mechanism:* R3.2.4's registry. *Evaluated at:* `EP-MINT`, `EP-INGRESS`
Gate 13. *Status:* [TO BUILD] over an [EXISTS] endpoint.

**R3.2.7 — no effect above `NAVIGATE`/`REFINE`/`HANDOFF` may appear on a proactive
envelope.** *Mechanism:* emission validator keyed on `origin.trigger === 'proactive'`.
*Evaluated at:* `EP-MINT`. *Status:* [TO BUILD].

**R3.2.8 — a notification preference is not a `CONTROL`.** Per-moment delivery preference,
per-channel routing and quiet hours are communication-consent decisions. They are `DRAFT`
then `COMMIT` on the `shell.notifications` destination, and their subject capabilities
carry a floor of `SESSION_VERIFIED` (§3.4). *Mechanism:* the control registry does not
contain a notification-preference key (three keys, R3.2.4), and the widget capability
policy table classifies every notification-preference key at `SESSION_VERIFIED`.
*Evaluated at:* `EP-MINT` (the floor) and `EP-INGRESS` Gate 13 (the routing). *Status:*
[TO BUILD].

**R3.2.9 — `COMMIT` lives only on a confirmation body, and never on the body that accepted
the input.** A `COMMIT` intent may be minted only onto a **confirmation body returned by the
canonical owner**, and **no envelope carrying an `InputSchema` with a field of a non-closed
kind may carry a `COMMIT` intent at all**. A free-input submission is therefore always a
`DRAFT`: it produces a server-owned draft, the draft is re-rendered as a confirmation body,
and only that body carries the commit. *Mechanism:* the mint function refuses a `COMMIT` whose
`IntentRecord.confirmation_of_ref` is null (§3.7, §3.10.2), and the emission validator refuses
an envelope that carries both a non-closed `InputField` and a `COMMIT`. *Evaluated at:*
`EP-MINT`. *Status:* [TO BUILD].
[NON-NORMATIVE] Bounding every non-enum field (R3.6.4) and requiring the confirmation body for
every commit is what makes "a widget cannot express a direct business mutation" true for every
kind rather than for the booking family alone: the one kind that accepts client-authored
magnitudes — a loyalty adjustment, an expense amount — cannot deliver that magnitude into the
Action Engine as a resolved argument in a single tap.

---

### 3.3 `IntentTarget` — `NAVIGATE` and `HANDOFF` are typed

A `NAVIGATE` or `HANDOFF` destination is a required, closed shape. There is no free-form form
of it.

```ts
type IntentTarget =
  | { class: 'w';      ref: string }                       // widget_id — re-resolve an emission
  | { class: 'i';      ref: string }                       // intent_token — a carrier
  | { class: 'c';      ref: CapabilityRef; scope_ref: string | null }  // a C9 capability key
  | { class: 's';      ref: ShellRoute }                   // a first-party shell destination
  | { class: 'detail'; ref: DetailRouteKey };              // the emitting envelope's own detail

type ShellRoute =
  | { route: 'shell.root' | 'shell.account' | 'shell.connections'
           | 'shell.privacy' | 'shell.notifications';                  param: null }
  | { route: 'shell.pay';  param: string }     // session_ref, opaque, server-minted
  | { route: 'shell.file'; param: string };    // artifact_ref, opaque, server-minted

type DetailRouteKey = string;   // must equal presentation.fullscreen_detail.route_key
                                // of the SAME envelope (R3.3.4)
```

`param` is an opaque server-minted handle matching `/^[A-Za-z0-9_-]{8,64}$/`. It is not a path,
not a query string, not an origin and not a provider id, and the forbidden keys of R3.8.2 apply
at every depth. Both parameterised routes carry `targetFloor('s') = SESSION_VERIFIED` and
re-check the live principal's proof hash at `EP-FETCH`.

**R3.3.1 — no intent may carry a free-form URL, an origin, a host, a path or a query
string.** *Mechanism:* `IntentTarget` has no member able to hold one (closed shape); every
minted text field on an intent (`label`, `utterance_preview`, `speech_aliases`) is passed
through `c9SafeText`, which denies `use_secure_surface` on URL-shaped and credential-shaped
content. *Evaluated at:* `EP-MINT` (shape and text). *Status:* shape [TO BUILD];
`c9SafeText` [EXISTS] — `orchestration/c9.contract.ts:325`.
*Consequence:* `BUTTON → EXTERNAL PROVIDER` is not constructible as a target. A payment is
therefore not modelled as a handoff to a provider; it is a capability
(`DRAFT → confirmation → COMMIT → Action Engine`), and the Action Engine alone opens the
provider session and owns the idempotency key and the receipt. Until the gift-certificate
and tips owners are registered, the surface carries a `Limitation` with a
`capability_gap_ref` and **no intent**.

**R3.3.2 — a `c`-class target is a capability invocation and is checked as one.** When
`target.class === 'c'`, `target.ref` MUST be a `CapabilityRef` of space `C9` present in the C9
capability registry **and within the authority the emitting principal holds at emission time**,
and the submission is subject to Gate 6 and to INV-10 exactly as if the ref were in
`capability`. `subjectCapability` (§3.5) resolves to `target.ref`.
*Mechanism:* two checks at emission — the registry lookup
`c9Capability(target.ref.key, domain, C9_REGISTRY_HASH)`, which denies
`capability_not_registered`, where `domain` is the envelope's derived `c9_domain` (§3.7) and the
call is made only on the run-bearing path, plus `AiToolPolicyService.assertCanExecute` over the
emitting principal — and Gate 6 again over the same ref.
*Evaluated at:* `EP-MINT` (both) and `EP-INGRESS` Gate 6. *Status:* registry lookup [EXISTS] —
`orchestration/c9.registry.ts:178`; policy service [EXISTS] — `ai-tool-policy.service.ts`;
gateway wiring [TO BUILD].
[NON-NORMATIVE] `KindRule.allowed_target_classes` admits `'c'` on **no kind** in this contract
version, so this rule is defence in depth over a class nothing may currently emit.

**R3.3.3 — a consent-bearing or identity-binding handoff may use `s` only.** If
`SENSITIVE_DEST(subjectCapability(i))` (§0.8 F48) then `i.effect === 'HANDOFF'` and
`i.target.class === 's'`. *Mechanism:* emission validator. *Evaluated at:* `EP-MINT`.
*Status:* [TO BUILD]. [NON-NORMATIVE] `s` is the only class with a stated
`SESSION_VERIFIED` floor and the only class that is a destination rather than a
re-resolution, which is why the 152-FZ acts land there and nowhere else.

**R3.3.4 — a `detail` target is not addressable and not chainable.** `target.ref` MUST
equal `presentation.fullscreen_detail.route_key` of the envelope carrying the intent; there
is no URL form of the `detail` class; and an envelope rendered *inside* a detail may not
carry a `detail` target. *Mechanism:* emission validator (equality check and a
`rendered_in_detail` flag on the mint request). *Evaluated at:* `EP-MINT`. *Status:*
[TO BUILD]. *Consequence:* "no bookmarkable screen address" and "depth capped at one" are
enforced by the shape rather than by renderer discipline.

**R3.3.5 — an `i`-class carrier never fires on open.** Resolving an `i` target renders the
confirmation body for that token inside the landing surface; it never submits it.
*Mechanism:* the carrier resolver's only output is `next_envelope`; it holds no edge to the
effect router. *Evaluated at:* `EP-INGRESS`, carrier resolution, before Gate 9. *Status:*
[TO BUILD].

**R3.3.6 — the resolved class is recorded.** `RenderReceipt` carries
`target_classes: Array<'w'|'i'|'c'|'s'|'detail'>`, one entry per delivered intent carrying
a target. *Mechanism:* written by the delivery adapter with the rest of the receipt.
*Evaluated at:* delivery. *Status:* [TO BUILD].

---

### 3.4 The verification floor is derived, never authored

`verification_floor` is present on **every** intent of **every** effect class, is never
null, and is never supplied by the emitter.

> **The derivation itself is declared in §0.8 and is not restated here.** `verificationFloor`,
> `FLOOR_EXEMPT`, `SENSITIVE_DEST`, `subjectFloor`, `c9Floor`, `aeFloor`, `MintedIntent`,
> `subjectCapability` and the five floor tables `EFFECT_FLOOR`, `KIND_FLOOR`, `RISK_FLOOR`,
> `CONSENT_CLASS_FLOOR` and `targetFloor` have **one** declaration in this contract, in §0.8,
> because a security-critical function stated in two places is a function that can drift in one
> of them — and a floor that drifts downward is a reduction nobody reviewed. §0.2 F6a turns that
> sentence into a build assertion rather than leaving it a promise. What §3 owns is the *consequence*: the floor
> is **server-derived, never authored by the emitter**, it is recomputed at Gate 5 from the
> `IntentRecord` and the live tables, and **any** difference between the stored and the
> recomputed value — raised or lowered — refuses the submission.

**R3.4.1 — there is no emitter-supplied floor.** `mintIntent()` takes no
`verification_floor` parameter and `WidgetComposerInput` has no such member; the field is
computed by the function above from the intent's subject capability, its effect, its priority,
its kind and its target. *Mechanism:* the mint function's signature (the field cannot be
passed), plus a CI test asserting no assignment to `verification_floor` outside
`verificationFloor()`. *Evaluated at:* `EP-MINT`, and `EP-BUILD`. *Status:* [TO BUILD].

**R3.4.2 — the floor is re-derived at the gateway, and ANY difference refuses.** At Gate 5
the gateway recomputes `verificationFloor()` from the **live** registry and policy tables and
compares the session against **its own** result, never the stored one. Any difference between
the stored floor and the recomputed floor — raised or lowered — refuses the submission
`SUPERSEDED / policy_floor_changed`, returns a freshly composed envelope, and increments
`widget_floor_divergence`. *Mechanism:* pure-function re-evaluation plus one comparison against
`AiToolRegistryService`, `ActionCapabilityRegistry` and the widget capability policy table.
*Evaluated at:* `EP-INGRESS` Gate 5. *Status:* [TO BUILD].
[NON-NORMATIVE] The same remedy applies either way, and a second branch would be a second code
path over a security-critical field. This is what makes a changed policy take effect on tokens
already in flight, including tokens sitting in a Telegram message from an hour ago.

**R3.4.3 — the policy table is total, and unmapped fails closed in two independent ways.**
`WIDGET_CAPABILITY_POLICY` is keyed on `CapabilityRef` and is total over `C9_CAPABILITIES`
(56 rows); a key with no row fails the build, and a lowered row without a contract version bump
fails the monotonicity test. Totality over AE-CAP is carried instead by
`AE_WIDGET_COMMIT_ALLOWLIST` ∪ `AE_CAPABILITY_GAP_LEDGER`, jointly total over all 226
registered capabilities. At runtime an unmapped ref yields `STEP_UP_VERIFIED`, which is
unreachable, so the intent can never be actuated; independently, at `EP-MINT` an intent whose
subject capability has no policy row is **not emitted** — the envelope carries a `Limitation`
with a non-null `capability_gap_ref` and no intent. *Mechanism:* the totality and monotonicity
tests, plus the mint refusal. *Evaluated at:* `EP-BUILD`, `EP-REGISTRY-LOAD`, `EP-MINT`.
*Status:* `NORMATIVE-PENDING` on **P-23**, **P-24**.

**R3.4.4 — every consent-bearing capability carries at least `SESSION_VERIFIED`, and the
consent act is excluded from actuation entirely.** The widget capability policy table assigns
`min_verification: 'SESSION_VERIFIED'` or above to every key whose `consent_class` is
`personal_data`, `identity_binding`, `communication` or `finance`, and to every per-moment
notification-delivery preference key. Independently, **no AE capability satisfying
`CONSENT(cap)` or `IDENTITY(cap)` may appear in `AE_WIDGET_COMMIT_ALLOWLIST`**; a `COMMIT` or
`REQUEST_APPROVAL` naming one is refused at mint, the envelope carries a `Limitation` with a
`capability_gap_ref` and no actuating control, and the only widget affordance for a consent
decision is a `HANDOFF` of class `s` to `shell.privacy` with
`verification_floor ≥ SESSION_VERIFIED`.

`CONSENT(cap)` and `IDENTITY(cap)` are declared in §0.7 F32 — in their full form, `targetKind`
disjoined with `actionClass` — and are **not restated here**. The copy that stood in this section
carried only the `actionClass` half, which is the way a predicate comes to mean two things.
Verified by enumeration over the executed registry: both halves resolve to the same three
capabilities today, so the disjunct adds nothing now and is retained in F32 because a capability
registered later under one of those action classes with a different `targetKind` would otherwise
escape the fence.

*Mechanism:* the frozen policy table with a CI test asserting every notification-preference key
is present at `SESSION_VERIFIED` or higher, plus the start-up allowlist-exclusion assertion.
*Evaluated at:* `EP-BUILD`, `EP-REGISTRY-LOAD`, and at every `subjectFloor()` call.
*Status:* policy table [TO BUILD]; the engine-side backing fence — `actorPolicy:
'VERIFIED_CLIENT_CHANNEL'` with `assertConsentChannelBinding` against a live, unrevoked
`ClientChannelLink` — [EXISTS] at `action-engine.policy-resolver.ts`.

**R3.4.5 — how a shortfall behaves depends on the effect class, and is never an error.**
At Gate 5, with `v = authority.verification_level` (server-derived) and
`f = verification_floor`:

| effect | `v ≥ f` | `v < f` |
|---|---|---|
| `NONE` | — (no submission exists) | — |
| `NAVIGATE`, `REFINE` | proceeds | `HANDOFF_REQUIRED` + step-up path landing on the same target |
| `HANDOFF` | resolves to the target | `HANDOFF_REQUIRED` + step-up path landing on the target **after** verification |
| `CONTROL`, `DRAFT`, `REQUEST_APPROVAL`, `COMMIT` | proceeds | `NEEDS_SECOND_CHANNEL` — **refused**, with the deep link |

*Mechanism:* Gate 5 branch on `effect`. *Evaluated at:* `EP-INGRESS` Gate 5. *Status:*
[TO BUILD].
[NON-NORMATIVE] A handoff must stay tappable from a low-verification channel — that is what
it is for. What must be impossible is the *act*, and the row above is the difference: the
four actuating classes are refused below their floor; the pointer classes route to
verification first. Neither renders as a failure.

**R3.4.6 — a channel cannot raise the floor's other side.** `verification_level` is derived
from the session and never appears in a channel profile or a client header;
`profile.max_verification_level` is a server-side **ceiling** that can only lower the
effective level. *Mechanism:* `ChannelProfile` has no `verification_level` member and the
negotiation header may only narrow a registered profile. *Evaluated at:* profile
negotiation and `EP-INGRESS` Gate 5. *Status:* [TO BUILD].

**R3.4.7 — the exempt set is derived and vetoed, never listed.** The predicate, its three
build vetoes and the five-intent census are declared in §0.8 (F48, F49) and are **not restated
here.** What §3 owns is the gateway's obligation: Gate 5 recomputes `FLOOR_EXEMPT` from the
stored `IntentRecord` — which is why the record carries `priority` and `widget_kind` — and any
difference between the stored and the recomputed floor, raised or lowered, refuses the
submission.

*Mechanism:* the two vetoes, the uniqueness assertion, and `verificationFloor`'s exempt branch.
*Evaluated at:* `EP-BUILD` (the vetoes), `EP-FIT` (a `FLOOR_EXEMPT` intent is never withheld at
the ladder's verification step), `EP-MINT`. *Status:* `NORMATIVE-PENDING` on **P-11**, **P-19**.
[NON-NORMATIVE] A floor governs *exercising authority*. Declining to proceed, discarding local
state, and asking for the route to a surface that authenticates are none of those. Making
cancellation harder to reach than confirmation is a safety inversion, not a safety property.
`priority` is server-set at mint like every other member of `WidgetIntent`, so an author cannot
promote an intent into the set, and promotion alone would not help: the three remaining clauses
exclude every actuating effect, every non-`CONTROL` non-`LOCAL` capability, and every handoff
that does not target a surface.

**R3.4.8 — the floor vector is pinned, and every reduction is disclosed in §0.17.**
`C9_FLOOR_BASELINE` and its two build assertions are declared in §0.8 F51 with the derivation they
guard, and **§0.17 is the one table where a reader auditing this contract finds every floor
reduction it makes.** There are exactly two. This rule is not a second enumeration of them —
a contract with two places claiming to list all its reductions has no place that does.

What §3 owns is the consequence at the gateway: a floor is **derived, never authored**,
recomputed at Gate 5 from the `IntentRecord` and the live tables, and **any** divergence —
raised or lowered — refuses the submission.

---

### 3.5 The subject capability, and the consent fence

The signature is declared in §0.8 F41, because the floor derivation there depends on it; **this
is its one body**, and there is no third statement of either.

```ts
function subjectCapability(i: IntentSubject): CapabilityRef | null {
  if (i.capability !== null)             return i.capability;   // REFINE/CONTROL/DRAFT/
                                                                // REQUEST_APPROVAL/COMMIT
  if (i.handoff_capability_ref !== null) return i.handoff_capability_ref;   // HANDOFF
  if (i.target?.class === 'c')           return i.target.ref;   // capability NAVIGATE
  return null;                                                  // NONE, and w/i/s/detail
                                                                // NAVIGATE
}
```

`MintedIntent` and `IntentRecord` both satisfy `IntentSubject`, so mint and every gate call the
same function over the same three members. **Every caller must guard the null**: a null subject
means no capability is exercised, so a gate that dispatches on the subject has nothing to
dispatch on and passes the intent to its remaining gates rather than reading `.space` off null.

```ts
const NEVER_CHAT_ACTUATED = [
  'consent.pd.grant', 'consent.pd.withdraw',
  'consent.marketing.grant', 'consent.marketing.revoke',
  'identity.staff.telegram.unbind', 'identity.client.channel.unbind',
  'consent.register.export', 'conversation.history.erase',
] as const;
```

**R3.5.1 — a consent or identity subject admits a class-`s` handoff and nothing else.** For
every minted intent:

> `SENSITIVE_DEST(subjectCapability(i))  ⟹  i.effect === 'HANDOFF' ∧ i.target.class === 's' ∧ i.verification_floor ≥ 'SESSION_VERIFIED'`

*Mechanism:* emission validator over the fully-typed intent; the predicate is total because
`subjectCapability` is non-null for every effect class that can actuate (all five require
`capability`), non-null for `HANDOFF` (R3.2.1 requires `handoff_capability_ref`), and
non-null for a capability-class `NAVIGATE`, and `SENSITIVE_DEST` is total over all four key
spaces by type and fails closed on an unregistered key, an unclassified row and a `TOOL` ref.
The residual null cases are `NONE` (no token, no submission) and `NAVIGATE` to
`w`/`i`/`s`/`detail`, none of which has an edge to a capability at Gate 13.
*Evaluated at:* `EP-MINT` (emission, and again over the minted record). *Status:* [TO BUILD].

[NON-NORMATIVE] Two fields make both predicates total: a mandatory non-null
`handoff_capability_ref`, which is a registry key that is referenced and never invoked, and a
mandatory `verification_floor` on every effect class. Without them, both the floor comparison
and the membership test would be unevaluable for precisely the capabilities they exist to
protect.

**R3.5.2 — the eight reserved names are a registration gate, not the running fence.** The
eight `NEVER_CHAT_ACTUATED` names resolve in **no** key space today, so the membership test
over them is total and always false. They are retained as a **registration gate**: a name later
registered in AE-CAP must be classified — allowlist row or gap-ledger row — *before* it may be
emitted, and `CONSENT(cap)` then excludes it from the allowlist by R3.4.4. The operative fence
on a consent act is therefore R3.4.4's allowlist exclusion plus R3.4.5's Gate 5 branch: these
keys carry `SESSION_VERIFIED`+ in the policy table, so an actuating intent for one of them is
refused at Gate 5 on any channel that cannot establish a first-party session.
*Mechanism:* the derived floor and the start-up exclusion assertion. *Evaluated at:* `EP-MINT`
(derivation), `EP-REGISTRY-LOAD` (exclusion) and `EP-INGRESS` Gate 5 (re-derivation).
*Status:* `NORMATIVE-PENDING` on **P-22**, **P-23**.

**R3.5.3 — `handoff_capability_ref` is referenced, never invoked.** Gate 13 routes
`HANDOFF` to a signed target and has no edge to a capability invoker. The field has exactly
four readers and no fifth: R3.5.1, the floor derivation of §0.8 F43, Gate 6's destination-fence
branch for `effect === 'HANDOFF'` (§3.9 Gate 6), and the help generator. *Mechanism:* effect
router, closed switch; a reference test asserts the reader set. *Evaluated at:* `EP-INGRESS`
Gate 13, `EP-BUILD`. *Status:* [TO BUILD].

**R3.5.4 — a handoff whose target has no live surface is not emitted.** If the `s`
destination has not shipped the capability, or the capability has no registered canonical
owner, the envelope carries a `Limitation` with a `capability_gap_ref` and **no intent**.
*Mechanism:* emission validator resolves `target.ref.route` against the shipped shell-route
table and `subjectCapability` against the registry. *Evaluated at:* `EP-MINT`. *Status:*
[TO BUILD].

---

### 3.6 `ConfirmationRequirement` and `InputSchema`

```ts
interface ConfirmationRequirement {          // non-null iff effect ∈ {REQUEST_APPROVAL, COMMIT}
  risk_tier: 'read' | 'low_write' | 'medium_write' | 'high_write' | 'restricted';
                                             // NOT a Cell: this is an intent-side member, never a
                                             // body leaf, so §1.2 V1 does not reach it, and
                                             // §4.4.3 classifies it AUDIT_RETAINED — a Cell's
                                             // minted label would be conversation content on an
                                             // authority-side field.
  reversible: Cell<boolean>;                 // SOURCE-DEFINED. Non-KNOWN is normal.
  audience_size: Measure | null;             // REQUIRED for any communication capability
  requires_explicit_confirm_step: true;      // literal, single value (R3.6.3)
  requires_readback: boolean;                // server-set at EP-FIT/EP-MINT from
                                             // Lifecycle.delivery_channel: true iff
                                             // effect === 'COMMIT' on a SPOKEN tier.
                                             // Sealed inside body_hash.
  readback_ref:  string | null;              // server-minted; NON-NULL IFF requires_readback
  readback_text: string | null;              // server-minted, sealed inside body_hash;
                                             // NON-NULL IFF requires_readback. Mint class M —
                                             // an author cannot write it.
  idempotency_key: string;                   // MINTED SERVER-SIDE
  approval_policy: 'none' | 'actor' | 'owner';   // copied from the tool definition
  consent_scope?: string;
}
```

**R3.6.1 — `reversible` is a `Cell`, not a boolean, and no rule may depend on its
`value` alone.** The only canonical value upstream is the literal `'SOURCE_DEFINED'`
(`orchestration/c9.contract.ts`), meaning the source owner decides and the orchestrator does
not know. Any rule reading reversibility MUST require `state === 'KNOWN'` and MUST have a
defined behaviour when it is not. *Mechanism:* the type. *Evaluated at:* `EP-MINT`. *Status:*
type [TO BUILD]; upstream literal [EXISTS].

**R3.6.2 — `four_eyes` does not exist.** It is not a member of any shape in this contract.
*Mechanism:* absence. *Rationale (verified):* `ai-tool-policy.service.ts#canDecide` resolves
`approvalPolicy === 'actor'` to "the requester **is** the decider" and `'owner'` to "any
member of `OWNER_ROLES`, the initiator included"; `decideApproval` compares the approver's role
against the approver-policy role set and **never** compares `approverUserId` to the execution's
`actorUserId`. No separation-of-duties control exists anywhere in the repository, and a widget
rendering `four_eyes: true` would promise one. Where separation of duties is genuinely
required, the capability carries a `capability_gap_ref` and no intent. *Status:* [EXISTS] —
the verified absence is the reason for the absence here.

**R3.6.3 — `requires_explicit_confirm_step` has one legal value.** A `COMMIT` token exists
only on a confirmation body returned by the canonical owner (R3.2.9, R3.10.2), so the flag has
no false branch. *Mechanism:* literal type. *Evaluated at:* `EP-MINT`. *Status:* [TO BUILD].

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
*Evaluated at:* `EP-MINT` (shape) and `EP-INGRESS` Gate 8 (value). *Status:* [TO BUILD].
[NON-NORMATIVE] The canonical bounds exist: `MAX_EXPENSE_RUBLES` with
`expense-category.ts:257` rejecting `value <= 0 || value > MAX_EXPENSE_RUBLES` is exactly
what `bounds_source` points at for an expense amount.

**R3.6.5 — `SECURE_SURFACE_ONLY` is not a sensitivity, it is an impossibility.** No
`InputField` may declare a sensitivity class at all; a value that must never traverse a chat
surface has no field to travel in. What remains is content policing: every `text` and
`phone` value is passed through `c9SafeText` at Gate 8, which denies `use_secure_surface` on
e-mail addresses, long digit runs, `Bearer `, `sk-`, PEM headers and
`password|secret|token|api_key` assignments. *Mechanism:* absence of the field class, plus
`c9SafeText`. *Evaluated at:* `EP-MINT` (absence) and `EP-INGRESS` Gate 8 (content). *Status:*
absence [TO BUILD]; `c9SafeText` [EXISTS] — `orchestration/c9.contract.ts:325`.

**R3.6.6 — free input is rationed by field, and by kind, and the two counters are one
counter.** `free_input_justification` is required on **any** `InputSchema` containing a field
of kind `integer`, `decimal`, `date`, `time`, `datetime`, `text` or `phone`, regardless of the
envelope's kind, and every such emission is counted per tenant per week against the same
budget, keyed on field kind. The per-kind restriction applies **in addition**: only `FORM`
carries `input_allowed: 'open_domain'`, so both fences hold and the ledger counts the larger
population. No body may carry a free-text affordance outside an `InputSchema` — free prose is
a chat message, not a widget field. *Mechanism:* emission validator (justification presence,
the per-kind `input_allowed` check, and rejection of any body-level free-text flag), plus the
single emission counter keyed on field kind. *Evaluated at:* `EP-MINT`. *Status:* [TO BUILD].

---

### 3.7 `IntentRecord` — what the gateway stores, and what erasure removes

```ts
interface IntentRecord {
  // --- authority and audit: AUDIT_RETAINED through conversation erasure ---
  intent_token_hash: string;
  widget_id: string; tenant_id: string; principal_proof_hash: string;
  widget_kind: WidgetKind;                    // Gate 5 evaluates KIND_FLOOR[kind] as one of
                                              // verificationFloor's four terms, and Gate 7
                                              // enforces the kind rule over this record.
  effect: EffectClass;
  priority: number;                           // FLOOR_EXEMPT reads it; without it Gate 5's
                                              // recompute cannot reproduce the exempt branch
                                              // and every exempt intent would diverge.
  capability: CapabilityRef | null;
  handoff_capability_ref: CapabilityRef | null;
  target: IntentTarget | null;
  verification_floor: VerificationLevel;
  confirmation: ConfirmationRequirement | null;
  input_schema_hash: string | null;
  requested_scope_hash: string;
  body_hash: string;                          // written at mint from the sealed emission;
                                              // read by Gate 8-R and the SUPERSEDED comparison
  selection_domain: string;                   // the closed domain this token may select from;
                                              // read by the SUPERSEDED comparison. The domain's
                                              // LABELS are conversation content and live below.
  c9_domain: C9Domain | null;                 // the orchestrator's own published union
                                              // ('ADMIN' | 'CLIENT_LIFECYCLE' | 'OCCUPANCY' |
                                              //  'BUSINESS_INTELLIGENCE'), imported, never
                                              // redeclared. NON-NULL IFF BOTH
                                              // subjectCapability(record).space === 'C9' AND
                                              // correlation.run_id !== null. Derived at mint
                                              // from Correlation.agent_id — NEVER from the
                                              // subject capability's own `domains`, which
                                              // would compare a value with itself.
  run_ref: { run_id: string; revision_id: string | null } | null;
  approval_of_intent_ref: string | null;      // §3.11
  confirmation_of_ref: { kind: 'draft' | 'record' | 'approval'; ref: string } | null;
                                              // NON-NULL IFF effect === 'COMMIT' (§3.10)
  produced_by_intent_token_hash: string | null;   // §3.10.2's guard
  issued_at: string; expires_at: string; single_use: boolean; consumed_at: string | null;
  action_receipt_ref: string | null;
  frozen_nouns: Record<string, string>;       // handles: WHAT, never how much or when.
                                              // AUDIT_RETAINED (§0.4 F14, §4.4.3): it is the
                                              // noun resolver's input on the path to Gate 11
                                              // and Gate 14, and F15's build-time reachability
                                              // test fails on a non-AUDIT_RETAINED read there.
                                              // Erasing it would leave a PENDING approval
                                              // undecidable — which is the case F15 exists for.

  // --- conversation content: ERASED with conversation history ---
  utterance_template: string;                 // '{{selection}}' is the only slot
  rendered_utterance: string | null;          // what was written to the transcript
  selected_labels: string[] | null;           // canonical labels, server-resolved
  spoken_transcript: string | null;           // voice turns only; authority NONE
}
```

`widget_kind`, `priority`, `body_hash`, `selection_domain` and `c9_domain` are mint class **D**
— derived by the minter, never authored — and are `AUDIT_RETAINED`: a kind name, an integer, two
hashes and a domain enum carry no conversation content, so the erasure-reachability test stays
green. All five are components of the gateway prerequisite **P-30**, so a gateway built without
any of them fails its own completeness assertion rather than shipping a Gate 5 that cannot
recompute or a Gate 6 that cannot call its own fence.

**R3.7.1 — `c9_domain` is derived on the run-bearing path and null by construction on the
others.** On the run-bearing path — `correlation.run_id !== null` — an envelope carrying an
intent whose **`subjectCapability(i).space === 'C9'`** is refused at `EP-MINT` when
`correlation.agent_id` is null, and `c9_domain` is that value. The predicate is
`subjectCapability`, **never `capability`**: `capability` is null for every `HANDOFF`, so a
run-bearing `HANDOFF` whose destination is a C9 key would otherwise escape the refusal entirely,
mint with both values null, and break the stated biconditional. On **both** run-less mint paths
— the registered capability-read endpoint and the proactive scheduler for the canonical moments
— `run_id` and `agent_id` are null because there is no run and therefore no registered agent, so
`c9_domain` is `null` by construction and Gate 6's `c9Capability` domain admission is explicitly
**not applied** there. *Mechanism:* the mint refusal and the null-by-construction derivation.
*Evaluated at:* `EP-MINT`. *Status:* `NORMATIVE-PENDING` on **P-30**.

**R3.7.2 — the retention split is normative and is part of the definition of done for
history erasure.** Erasing conversation history erases every field classified
`CONVERSATION_CONTENT` or `CANONICAL_ELSEWHERE` (tombstoning the record, not deleting it) and
touches no field classified `AUDIT_RETAINED`. **The classification is §4.4.3's table and only
that table** — the divider in the block above groups the shape for a reader and decides nothing;
a comment is not a rule (§1.0).
*Mechanism:* a field-level retention classifier on the record, RT5's CI test that every column
is classified exactly once, and **§0.4 F15's build-time reachability test** — cited, not
restated. The copy that stood here named a different gate set, adding Gate 8-R, and that
difference is not editorial: Gate 8-R's mandated read is `readback_ack.affirmation`, which F16
and §4.4.3 classify `CONVERSATION_CONTENT`, so a reachability test including Gate 8-R could
never pass. F15's set — the approval gate, the effect-routing gate, canonical ingress, and an
owner's approve/reject route — is the one that is satisfiable, and it is the one that governs.
*Evaluated at:* erasure execution, and `EP-BUILD`. *Status:* [TO BUILD].

**R3.7.3 — frozen nouns never travel to the client.** They are handles naming *what*
(`{ staff: 'h_…', service_set: 'h_…', start: 'h_…' }`), never a value.
*Mechanism:* the submission shape (§3.8) has no member to carry them. *Evaluated at:*
`EP-INGRESS`. *Status:* [TO BUILD].

**R3.7.4 — three hashes are witnesses, not handles.** `snapshotHash`, `revisionId` and
`payloadHash`, where present, are **compared** at Gate 11, never re-read. Re-resolving them
would destroy the anti-drift guarantee they exist for; divergence yields `SUPERSEDED` with a
rendered diff. *Mechanism:* the noun resolver's type distinguishes `Handle` from `Witness`
and has no re-read path for the latter. *Evaluated at:* `EP-INGRESS` Gate 11. *Status:*
[TO BUILD].

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
  readback_ack?: ReadbackAck;               // REQUIRED iff Gate 8-R applies; refused otherwise
}

interface ReadbackAck {
  readback_ref: string;   // echoes confirmation.readback_ref        — AUDIT_RETAINED
  body_hash: string;      // echoes the emission's body_hash          — AUDIT_RETAINED
  affirmation: string;    // the caller's affirmative utterance, verbatim
                          // — CONVERSATION_CONTENT: it is a word the data subject said,
                          // erased with the conversation, and compared against the closed
                          // affirmation vocabulary at submission time only.
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
the Gate 8 validation in R3.6.4 / R3.6.5. *Evaluated at:* `EP-INGRESS` (shape) and
Gate 8 (values). *Status:* [TO BUILD].

[NON-NORMATIVE] A date *can* be submitted — inside a window the canonical owner declared and
re-declared at validation time. That is the whole of the guarantee, and it is smaller and truer
than "a submission cannot contain a date".

**R3.8.2 — no forbidden key at any depth.** **The forbidden-key list is declared in §0.15 F88
and is not restated here**; every key on it is refused at any depth of a submission, and no key
the contract does not declare may appear at any depth either. The copy that stood here carried
**fifteen** of F88's twenty-eight keys and one of its three evaluation points — so a submission
carrying `url`, `endpoint`, `checkout_url`, `return_url`, `provider_ref`, `bridge_method` or
`required_verification` passed this clause and failed F88, which is what a list maintained in
two places does. *Mechanism:* the one structural validator of F88 (INV-1), a total walk over the
serialized value. *Evaluated at:* `EP-INGRESS`. *Status:* [TO BUILD].

**R3.8.3 — `profile_id` is advisory and is not an authority input.** It is used to shape the
response and to detect a renderer that delivered something it should not have. The binding
control on what a channel may do is the server-derived `verification_level` (§3.4), not the
profile the client names, and **no gate keys its antecedent on it** — Gate 8-R keys on the
record, not on the submission. *Mechanism:* the Gate 5 branch reads `verification_level`, never
`profile_id`; a source test asserts no gate antecedent reads `profile_id`. *Evaluated at:*
`EP-INGRESS` Gate 5, `EP-BUILD`. *Status:* [TO BUILD].

**R3.8.4 — a renderer never mutates a widget locally on click.** It submits, receives
`next_envelope` / `resolved_widget`, and re-renders. `resolved_state` derives from the
receipt, never from the fact that a button was pressed. An optimistic *spinner* is
`ephemeral_ui` and is never transmitted. *Mechanism:* the submission has no `body` and no
state member; the envelope is the only source of rendered state. *Evaluated at:* `EP-INGRESS`.
*Status:* [TO BUILD].

---

### 3.9 The gate sequence — fourteen gates and one readback gate, in one order

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
| 5 | **Verification floor** | `verificationFloor(record, record.widget_kind)` re-derived from the live registry and policy tables (R3.4.2); compared to the server-derived `verification_level`, capped by `profile.max_verification_level`; branch per effect class (R3.4.5). **Any** difference between the stored and the recomputed floor refuses | `NEEDS_SECOND_CHANNEL` / `HANDOFF_REQUIRED` + deep link; `SUPERSEDED / policy_floor_changed` | ChannelProfileRegistry + AuthorityResolver | [TO BUILD] |
| 6 | **Authority, computed from scratch** | dispatched on `subjectCapability(record)` and scoped by effect — the four branches below. `authority_hint` is **not read**. A widget that should never have been rendered still cannot act | `REFUSED / insufficient_authority` | AuthorityResolver | policy [EXISTS] — `ai-tool-policy.service.ts`, `action-engine.policy-resolver.ts`; wiring [TO BUILD] |
| 7 | **Effect admissibility** | `effect` is within the kind's declared ceiling, checked over `IntentRecord.widget_kind`; the capability's key space matches the effect (R3.2.2); `CONTROL` keys are in the control registry; a `COMMIT` record carries a non-null `confirmation_of_ref` and, where its `kind !== 'draft'`, a non-null `produced_by_intent_token_hash` satisfying §3.10.2; **for a `COMMIT`, `requiredConfirmationKind(subjectCapability(record)) === record.widget_kind`, re-read from the live allowlist (§0.13 F72) — this is F72's second evaluation point, and a key whose allowlist row was withdrawn between mint and submission refuses here**; the delivering tier was permitted to carry this effect (§3.12) | `REFUSED / effect_not_admissible`, `REFUSED / booking_confirmation_required` | IntentGateway | [TO BUILD] |
| 8 | **Input validation** | closed-domain membership for `enum`/`ref`; cardinality in `[selection_min, selection_max]`; **bounds re-read from `bounds_source` and the value validated against the fresh bound**; normalizers applied; `c9SafeText` over every `text`/`phone` value; `max_total_bytes` enforced by refusal, never truncation; a submission carrying `inputs` for a null schema is refused | `REFUSED / selection_out_of_domain`, `REFUSED / bound_violation`, `REFUSED / use_secure_surface`, `REFUSED / oversize_submission` | IntentGateway | shape [TO BUILD]; `c9SafeText` [EXISTS] |
| **8-R** | **Readback** | applies exactly when `record.confirmation?.requires_readback === true`. Refuses unless **all four** hold: `readback_ack` is present; `readback_ack.readback_ref === record.confirmation.readback_ref`; `readback_ack.body_hash === record.body_hash`; `readback_ack.affirmation` is an exact member of the server-published closed affirmation vocabulary for the envelope's locale. A submission carrying `readback_ack` whose record does **not** satisfy `confirmation?.requires_readback === true` — including one whose `confirmation` is null — is **also** refused. Refuses, never repairs | `REFUSED / readback_missing`, `REFUSED / readback_mismatch` | IntentGateway | [TO BUILD] |
| 9 | **Lowering** | `rendered_utterance = render(utterance_template, server-resolved canonical labels)` is appended to the conversation as a **USER turn with authority NONE**. **This is the first durable write of the whole sequence.** From here the path is byte-identical to a typed message | — | chat ingress | [TO BUILD] |
| 10 | **Divergence audit (shadow first)** | the deterministic text router is run over the lowered utterance; if its resolved capability ≠ `subjectCapability(record)`, an audit record is written. Hard refusal behind a flag | `REFUSED / intent_divergence` (when gated) | intent router | [TO BUILD] |
| 11 | **Noun resolution** | each frozen noun is resolved by a **fresh read from its canonical owner**; the three witnesses (R3.7.4) are compared, not re-read; a value divergence returns `SUPERSEDED` with a rendered diff | `SUPERSEDED / handle_stale` | IntentGateway + capability owner | [TO BUILD] |
| 12 | **Data fence** | for `REFINE` / `NAVIGATE`, the new body is produced by the same projector behind the same five client-preview / PII enforcement points. No widget-specific PII path exists, so none of the five can be bypassed by a widget | masked body, never a leak | Projector | five points [EXISTS]; projector [TO BUILD] |
| 13 | **Effect routing** | `NONE` — unreachable (no token). `NAVIGATE` / `REFINE` → projector → `next_envelope`, **terminates here; no business effect is reachable from a selector**. `CONTROL` → the one registered control handler, which performs its own principal and tenant check; no Action Engine edge. `DRAFT` → canonical draft owner. `REQUEST_APPROVAL` → approval object → PENDING. `HANDOFF` → signed target, no capability invoked. `COMMIT` → Gate 14 | per class | effect router | [TO BUILD] |
| 14 | **Canonical action** | `CanonicalActionIngressService.prepare()` receives the capability key, the normalized input, the **server-minted** idempotency key and the evidence refs; the policy resolver — not the caller — owns the decision (`assertNoCallerAuthority` at `action-engine.ingress.ts:161`, `assertResolverOwnsDecision` at `:141`); the Action Engine, never the widget, chat or renderer, calls the provider owner | policy decision | CanonicalActionIngressService → ActionEngineKernel → provider owner | [EXISTS] — `action-engine.ingress.ts` |

**Gate 6 in full.** The subject is bound once and the dispatch reads it, never `record.capability`:

```
const ref = subjectCapability(record);        // bound once; NOT record.capability
if (ref === null)                             // NONE, and w/i/s/detail NAVIGATE
  → no capability is exercised; Gate 6 has nothing to check and the intent proceeds

if (record.effect === 'HANDOFF')
  → the subject resolves the DESTINATION fences ONLY: registration in its space,
    SENSITIVE_DEST (§0.8 F48), targetFloor('s') at Gate 5, and the landing surface's own
    ingress. It NEVER resolves assertCanExecute, c9Capability's domain/mode admission,
    or the AE commit allowlist.

ref.space === 'AE'   (COMMIT, REQUEST_APPROVAL):
  refuse unless (a) the AE key has a row in AE_WIDGET_COMMIT_ALLOWLIST;
                (b) ActionCapabilityRegistry.get(key).policyDecision === 'ALLOW';
                (c) allowedSourceTypes includes 'authenticated_request';
                (d) the live principal's role is a member of
                    canonicalProductionPolicyDefinitions()'s allowedActorRoles for that key;
                (e) EntitlementsService grants every requiredFeatures entry.
  Gate 14 then re-resolves (d) and (e) from scratch inside the canonical request, and
  GATE 14's ANSWER IS THE ONE THAT GOVERNS. A disagreement between Gate 6 and Gate 14 is
  refused, counted, and never resolved in Gate 6's favour.

ref.space === 'C9'   (REFINE, DRAFT, class-'c' NAVIGATE):
  def = MAYA_AI_TOOL_CATALOG_BY_NAME.get(ref.key)
  if (def !== undefined) → AiToolPolicyService.assertCanExecute(principal, def)      // the 47
  else                   → WIDGET_CAPABILITY_POLICY[capKey(ref)] must exist, AND      // the 9
                           when record.c9_domain !== null,
                           c9Capability(ref.key, record.c9_domain, C9_REGISTRY_HASH)
                           must admit — it throws capability_not_registered otherwise,
                           and additionally refuses BUSINESS_INTELLIGENCE for any
                           mode !== 'READ'. On a run-less mint path record.c9_domain is
                           null and the c9Capability half is NOT applied (R3.7.1).

ref.space === 'CONTROL':
  CONTROL_FLOOR[ref.key] at Gate 5, Gate 3's principal binding, Gate 4's tenant assertion,
  then the one registered handler's own principal and tenant check (R3.2.4).

ref.space === 'TOOL':
  unreachable — no intent of any effect class may carry a TOOL ref (R3.2.2).
```

*Mechanism:* the dispatch above; a throwing accessor is correct here because Gate 6 is a
refusal point and a raise **is** the refusal — unlike a floor derivation, which must return a
level. *Evaluated at:* `EP-INGRESS` Gate 6. *Status:* `NORMATIVE-PENDING` on **P-01**,
**P-23**, **P-26**, **P-30**.

[NON-NORMATIVE] The second C9 branch is **weaker** than the first and a reader must not take it
for an equivalent. `c9Capability` refuses an unregistered key, a registry-hash mismatch, a
domain mismatch and a non-`READ` mode under `BUSINESS_INTELLIGENCE`, but it applies **no role,
surface, feature or risk-tier test**, which `assertCanExecute` does. For those nine keys the
role and risk fences are their `WIDGET_CAPABILITY_POLICY` row's `min_verification` and
`consent_class`, carried through `c9Floor` at Gate 5, plus `CONSENT_CLASS_FLOOR` — not Gate 6.
The `WIDGET_CAPABILITY_POLICY` row test is likewise a build-time totality restatement rather
than a second runtime check: the table is total over all 56 C9 keys and a missing row fails the
**build**, so at runtime the row always exists for a registered C9 ref and that refusal can
never fire. Scoping by effect matters for the same reason: applying an execute-admission test
to a `HANDOFF` destination would make `c9Capability`'s `BUSINESS_INTELLIGENCE`/non-`READ`
refusal block a BI run from even *offering* the `a22.configuration` or `b35.confirm` handoff,
and would demand an allowlist row for an AE destination that is being routed to, not committed.

**R3.9.1 — the order is normative, and validation precedes lowering.** Gates 5–8 and Gate 8-R
complete before Gate 9 writes anything durable. *Mechanism:* the gateway is a single ordered
pipeline with no branch that reaches the chat-ingress writer before the Gate 8-R result.
*Evaluated at:* the pipeline's construction, plus a test asserting that a submission
refused at Gates 1–8-R produces **zero** conversation writes. *Status:* [TO BUILD].

[NON-NORMATIVE] Were lowering to precede validation, an oversize, out-of-domain, or
credential-shaped value would be interpolated into the durable transcript — and therefore into
the LLM's untrusted-text channel — *before* the gate that would refuse it. With a free-text
field that is a durable prompt-injection and PII path that survives the refusal.

**R3.9.2 — lowering interpolates only server-resolved canonical labels.** `{{selection}}` is
filled from `IntentRecord.selected_labels`, which the gateway writes at Gate 8 by mapping
validated domain members to their canonical display labels. Raw client bytes are never
interpolated. A `text` field's contribution to the utterance is its **normalizer output**,
never its input. *Mechanism:* the lowering function's signature accepts
`selected_labels: string[]` and has no parameter of the submission's `inputs` type.
*Evaluated at:* `EP-INGRESS` Gate 9. *Status:* [TO BUILD].

**R3.9.3 — a refusal is not a failure.** Every refusal above renders as `reason_text` plus,
where one exists, a `remedy` intent. None renders red, none renders as an error ARIA role,
none auto-retries. `c9Deny(...)` responses are HTTP 400s and most are **policy fences, not
faults** — `paid_capability_not_activated`, `capability_not_registered`, `review_stale`,
`run_expired_or_terminal`, `use_secure_surface`. The projector maps the `c9_*` code space to
`Cell` states and `Limitation` severities **before** anything reaches a renderer; only a
genuine transport fault may look like a fault. *Mechanism:* the code-space mapping table
plus the anti-error lint. *Evaluated at:* projection, and `EP-BUILD`. *Status:* mapping
[TO BUILD]; deny codes [EXISTS] — `orchestration/c9.contract.ts:40`.

---

### 3.10 Booking effects — the general rule

**R3.10.1 — the booking family is derived from the canonical registry, never authored and
never a capability name.**

`BOOKING(cap)` is declared in §0.7 F32 and is not restated here. What §3.10 owns is the
disposition of the thirteen capabilities it selects:

`targetKind` is a mandatory field of `RegisteredActionCapabilityV1`
(`action-engine.contract.ts:175`). Verified membership, exhaustive — **thirteen capabilities**,
with the exact dispositions:

| AE key | `policyDecision` | disposition |
|---|---|---|
| `crm.appointment.create.v1` | ALLOW | allowlisted, `BOOKING_CONFIRMATION`, `confirmation_of_ref.kind: 'draft'` |
| `crm.appointment.reschedule.v1` | ALLOW | allowlisted, `BOOKING_CONFIRMATION`, `kind: 'record'` + non-null `produced_by_intent_token_hash` |
| `crm.appointment.cancel.v1` | ALLOW | as reschedule |
| `crm.appointment.attendance.v1`, `.duration.v1`, `.services.v1`, `.fields.v1` | ALLOW | **not allowlisted, not mintable** — gap-ledgered under `GAP-APPOINTMENT-DETAIL-COMMIT` (§0.7 F37). No propose key exists for them in any space, and F31's pairing assertion admits an allowlist row only for the `ae` side of a pairing, so an allowlist row here could never load. **`attendance` is a staff-recorded fact and is never a client acknowledgement** |
| `crm.appointment.{attendance,duration,services,fields}.shadow.v1` | SHADOW_ONLY | not mintable |
| `crm.visit.payment.v1` | **DENY** | not mintable; also money-class |
| `occupancy.recovery-options.prepare` | SHADOW_ONLY | not mintable |

Seven of the thirteen carry `policyDecision: ALLOW`; **three of them are allowlisted** — `create`, `reschedule`, `cancel` — which is the `BOOKING_CONFIRMATION` membership §0.7 F34 declares. `ALLOW` is a registry disposition; the allowlist is this contract's own fence, and the two are not the same set. *Mechanism:* the registry read plus the allowlist veto.
*Evaluated at:* `EP-REGISTRY-LOAD`, `EP-MINT`, `EP-INGRESS` Gate 7. *Status:* registry
[EXISTS] — `action-engine.registry.ts`; allowlist `NORMATIVE-PENDING` on **P-08**, **P-18**,
**P-23**.

The required confirmation kind for an actuating key is a table lookup, not a derivation, and
that lookup is **declared in §0.13 F72 and is not restated here**: it refuses a
non-`AE` ref outright, then reads `AE_WIDGET_COMMIT_ALLOWLIST[ref.key]` and calls
`refuseMint('capability_not_allowlisted')` when there is no row. It has no default branch, so an un-allowlisted key resolves to no kind at all.

**R3.10.2 — a `COMMIT` cannot be minted except onto a confirmation the canonical owner
returned.** Every `COMMIT` carries a non-null
`confirmation_of_ref: { kind: 'draft' | 'record' | 'approval'; ref }` — `'draft'` for `create`,
every `SETTINGS_DRAFT` and every `PAYMENT_HANDOFF`; `'record'` for `reschedule` and `cancel`
(the `appointment_ref`); `'approval'` for an `APPROVAL` decision (the `approval_ref`). At the
moment a `TIME_SLOT_SELECTOR` is rendered, **no `COMMIT` token for that booking exists anywhere
in the system.**

A `COMMIT` whose `confirmation_of_ref.kind !== 'draft'` is mintable **only** when
`produced_by_intent_token_hash` is non-null and names a **consumed record**, with the producing
effect class and the identity compared fixed together, because the two cases live in different
key spaces:

The two-row table fixing the producing effect class **together with** the identity compared —
`'record'` against the C9 propose side, `'approval'` against the AE side — is declared in
**§0.13 F74** and is not restated here. They are fixed together because the two cases live in
different key spaces, and a single identity rule would refuse every `APPROVAL` decision
unconditionally.

The confirmation body must have been *returned by the canonical owner in response to a gateway
submission*, so booking-intent normalisation, Client-principal verification and confirmation
identity all run before any commit token exists. Populating the field with a bare
`appointment_ref` or `approval_ref` does not satisfy it. *Mechanism:* the mint function's
two-part refusal; Gate 7 re-checks both. *Evaluated at:* `EP-MINT`, `EP-INGRESS` Gate 7.
*Status:* [TO BUILD].
[NON-NORMATIVE] The C9 and AE key spaces share no spelling, so requiring "equal to the propose
key" in the approval case would be a comparison that can never hold; the fence is the same
strength either way — the `COMMIT` still cannot be minted except against a gateway-consumed
record whose capability is the very capability being actuated.

**R3.10.3 — what the Action Engine independently enforces, and what it does not.** The
Action Engine's own fence over a booking commit is **shape, source-type and durable
attribution — not a second authorisation of the widget path**:
`assertNoCallerAuthority(request)` and `assertResolverOwnsDecision(preview, policy)`
(`action-engine.ingress.ts:71,107,141,161`); `source.type` membership in the capability's
`allowedSourceTypes`, where a widget submission's only honest value is
`authenticated_request`; `readClientActionPrincipal`'s evidence-prefix and cardinality check;
and, for a client-principal create, a mandatory `bookingIntent` —
`ClientBookingIntentContext { snapshot, hash, encrypted }` — with `creationMode === 'client'`,
`allowBusy === false`, `notifyBySmsHours === 0` and a `create/`-prefixed `targetRef`. The
authorisation of a booking commit is the gateway's Gates 5–7 plus Gate 14's policy resolver,
which the caller cannot influence. The widget-kind check lives at `EP-MINT` and at `EP-INGRESS`
Gate 7, over the widget layer's own record: `prepare()` receives
`TrustedActionExecutionRequestV1` and carries no `widget_kind`, and passing one would make a
canonical mutation conditional on widget-layer state, which FR-1 and FR-2 forbid.
*Mechanism:* the four checks named above. *Evaluated at:* `EP-CANONICAL`. *Status:* [EXISTS].

**R3.10.4 — every booking effect has exactly one confirmation surface.** The confirmation
body carries `confirmation_subject: 'create' | 'reschedule' | 'cancel'`. A cancellation
confirmation is a distinct subject, not a draft-abandon control. *Mechanism:* discriminator
on the confirmation body, with the ceiling table admitting `COMMIT` only there.
*Evaluated at:* `EP-MINT`. *Status:* [TO BUILD].

**R3.10.5 — a selector holds no lock, and there is no `hold_token`.** The availability a
selector renders is `Cell<'FREE' | 'TAKEN'>` — **two value members plus not-`KNOWN`** — and
`HELD` is not a member of it or of any other enum in this contract. The widget layer never
creates, extends or expires an occupancy hold. Staleness is handled by Gate 11 and R3.11.2
returning `SUPERSEDED` with a rendered diff. *Mechanism:* the absence of `HELD` from the enum
and of any hold field from the contract; there is nothing to mint and nothing to reconcile.
*Evaluated at:* `EP-MINT` (shape). *Status:* [TO BUILD]. [NON-NORMATIVE] A soft lock the
provider does not own would make the widget layer the system of record for who holds a chair,
and a phantom hold would have no canonical owner to expire it.

**R3.10.6 — a drag on a schedule is a `REFINE`.** A schedule surface's ceiling is
`REFINE` / `NAVIGATE`. `SCHEDULE.entries[].move_intent` is a `REFINE` carrying the registered
C9 key **`appointments.own.reschedule`**, which C9 classifies `PROPOSE_ONLY` /
`SOURCE_HANDOFF`, so it cannot actuate, passes the registry lookup and Gate 6, and is routed at
Gate 13 to the canonical booking owner, which returns a `BOOKING_CONFIRMATION` with
`confirmation_subject: 'reschedule'` — with booking-intent normalization, Client-principal
verification and confirmation identity run **before the confirmation exists**. The `COMMIT`,
carrying `crm.appointment.reschedule.v1`, is minted onto that body alone.
*Mechanism:* the kind ceiling, the registry lookup and R3.10.2. *Evaluated at:* `EP-MINT`,
`EP-INGRESS` Gates 6/7/13. *Status:* [TO BUILD].

---

### 3.11 The approval path — re-resolution at execute time

**R3.11.1 — an approval decision is itself a gateway submission and passes Gate 11.** The
`APPROVAL` envelope's decide intents carry `approval_of_intent_ref` pointing at the
requesting `IntentRecord`, and inherit its `frozen_nouns`. Gate 11's fresh read therefore
runs **at decision time**, not only at request time. *Mechanism:* the mint path copies
`frozen_nouns` along the `approval_of_intent_ref` edge; Gate 11 reads them from the decision
record. *Evaluated at:* `EP-INGRESS` Gate 11 on the decision submission. *Status:* [TO BUILD].

**R3.11.2 — an APPROVAL body carries exactly two `COMMIT` intents, on one subject.** The
`max_commit_intents` pairing rule and its build veto are **declared in §0.13 F75 and are not
restated here**: `2` is admissible for `APPROVAL` and for no other kind, and a pair must be one
approve/reject pair on the *same* `confirmation_of_ref.ref` and the *same* AE capability, with
either one's consumption marking the other consumed. What §3.11 owns is the consequence for the
approval path: two `COMMIT` intents in one envelope are **one** actuating subject, so an
`APPROVAL` does not breach «one actuating subject per envelope».

The invariant is *one actuating subject per envelope*: approve and reject are two mutually
exclusive decisions on **one** approval object, not two commits on two subjects.
*Mechanism:* the veto and the single-use pairing. *Evaluated at:* `EP-BUILD`, `EP-MINT`.
*Status:* [TO BUILD].

**R3.11.3 — divergence at decision time does not execute.** If any noun has diverged since
the approval was requested, the gateway does **not** call the owner's approve route. It
returns `SUPERSEDED` with the rendered diff, rejects the standing approval through the
owner's existing reject path, and mints a fresh `APPROVAL` envelope carrying the new values.
*Mechanism:* ordering — the approve call sits behind the Gate 11 result; the reject path is
`ai-tool-runtime.service.ts` `rejectApproval`, which transitions `PENDING → REJECTED` under
`assertPayloadHash`. *Evaluated at:* `EP-INGRESS` Gate 11 → Gate 13. *Status:* owner reject
path [EXISTS]; the ordering [TO BUILD].

**R3.11.4 — the payload hash and the fresh read are complementary and both are required.**
`assertPayloadHash(approval, dto.payloadHash)` pins **what was approved**; Gate 11 pins
**the world it was approved against**. Neither substitutes for the other.
*Mechanism:* both checks, in that order. *Evaluated at:* `EP-INGRESS` Gate 11, then the
owner's approve route. *Status:* `assertPayloadHash` [EXISTS] —
`ai-tool-runtime.service.ts:209,301`; Gate 11 [TO BUILD].

**R3.11.5 — where approval and dispatch are separated in time, the owner must re-resolve,
and until it does the intent is not mintable.** A capability whose owner queues dispatch
after `APPROVED` (so that arbitrary time passes between the decision and the provider call) is
one whose **C9 propose key's** `WIDGET_CAPABILITY_POLICY` row declares
`dispatch_is_synchronous: false` — the propose key's row, on §0.14 F80's idiom, and **not** the
AE key's, because F28 makes that table total over C9-CAP *and over those only* while
`REQUEST_APPROVAL` and `COMMIT` may carry an AE ref and nothing else (§0.12 F69). A lookup
keyed on the AE key would be `undefined` for every capability this rule governs, the flag would
never be `false`, and **the refusal would never fire** — a fence that fails open rather than
closed. F31 makes the propose-key lookup total: every allowlisted AE key is the `ae` side of
exactly one `AE_PROPOSE_PAIRING` row. For such a
capability `mintIntent()` refuses to mint a `REQUEST_APPROVAL` or `COMMIT` intent until the
owner performs its own execute-time re-resolution. **A missing row refuses too:** the lookup is
total by F31 — every allowlisted AE key is the `ae` side of exactly one `AE_PROPOSE_PAIRING`
row, and every pairing row's `propose` is a `C9`-space ref resolving in `C9_CAPABILITIES`, which
F28 gives a row — and the reader nonetheless carries an explicit
`if (row === undefined) refuseMint('policy_row_missing')`, on the same discipline as the
contract's only two other readers of this table (§0.8 F46's `c9Floor`, §0.8 F48's
`SENSITIVE_DEST`). A fence that depends on a totality proof to avoid failing open is a fence one
edit away from failing open. *Mechanism:* the mint function's
refusal; fail-closed. *Evaluated at:* `EP-MINT`. *Status:* [TO BUILD].

[NON-NORMATIVE] "The price shown 90 seconds ago is never the price charged" is true for a
direct commit because Gate 11 sits immediately before Gate 14. Across an approval boundary it
is true only if someone re-reads on the far side — so this contract makes the gateway re-read
at the decision, and refuses to mint at all for owners whose dispatch it cannot reach.

**R3.11.6 — who may decide is a role test, not a separation of duties.** The approver set is
`CANONICAL_APPROVER_POLICY_ROLES[approverPolicyKey]` compared against a live `Membership`
inside the deciding request; an unregistered key throws `CANONICAL_APPROVER_POLICY_INVALID`
and the composer nulls the decision intent with a `blocked_reason`. **An owner who initiates
may approve.** *Mechanism:* `ActionEngineKernel.decideApproval()` → `canonicalApproverRoles()`.
*Evaluated at:* `EP-CANONICAL`. *Status:* [EXISTS]. The `controlledFixtureMode` flag widens the
approver set to six roles; a build test must assert it is unset outside proof and test
harnesses, and until that test exists this rule's strength is bounded by it
(`NORMATIVE-PENDING` on **P-27**).

---

### 3.12 Carriers — what each channel may deliver

**R3.12.1 — an announcement tier carries `NAVIGATE` and `HANDOFF` only.** For every
registered profile whose fitted `render_tier === 'ANNOUNCEMENT'`, the deliverable effect set
is the literal `{NAVIGATE, HANDOFF}`. There is no risk-tiered exception and no
per-capability opt-in. A push action lands on a confirmation body inside a verified surface;
it never actuates. *Mechanism:* two independent ones — (a) the server mints per delivery, so
a notification payload physically contains no `COMMIT` token (non-existence); (b) Gate 7
re-checks the delivering tier's effect set. *Evaluated at:* `EP-FIT`/delivery, and
`EP-INGRESS` Gate 7. *Status:* [TO BUILD].

[NON-NORMATIVE] A one-tap `COMMIT` from a push gated on
`risk_tier === 'low_write' && reversible === true` would rest on two unsound predicates —
`reversible` has no canonical boolean source (R3.6.1) — and the safeguard the affected card
would have to show, consent-aware audience arithmetic before an irreversible tap, is
undeliverable inside a ~120-character push body.

**R3.12.2 — a tier that cannot establish a first-party session carries nothing above
`NAVIGATE`/`HANDOFF` in practice, and the mechanism is the floor, not the tier.** Every
actuating class has `EFFECT_FLOOR ≥ BOUND_CLIENT` except `CONTROL`, whose fence is its own
`CONTROL_FLOOR`, and every `COMMIT` has `SESSION_VERIFIED`; a channel whose
`max_verification_level` is `CHANNEL_IDENTITY` therefore fails Gate 5 for `DRAFT`,
`REQUEST_APPROVAL` and `COMMIT`, and for every `CONTROL` key whose own floor exceeds it.
*Mechanism:* R3.4.5 with the server-derived level. *Evaluated at:* `EP-INGRESS` Gate 5.
*Status:* [TO BUILD].
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
module for all three, and Gate 10 audits divergence. *Evaluated at:* routing, and
`EP-INGRESS` Gate 10. *Status:* [TO BUILD]. *Consequence:* a screen-reader user who types the
sentence, a voice user who says it, and a thumb that taps travel one code path and produce one
audit line.

**R3.12.5 — help is generated, never written.** Per-channel help and command lists are
generated from the intent registry and the kind registry. No hand-written command list is
permitted. *Mechanism:* CI test asserting no static command list exists in any channel
adapter. *Evaluated at:* `EP-BUILD`. *Status:* [TO BUILD].

**R3.12.6 — the escape verb.** **The escape verb is declared in §0.9 F60 and is not restated
here** — which envelopes carry it, that there is exactly one, its `role`, its `priority: 0`, its
undroppability, its speech aliases, its `/cancel` reachability, and the `EP-FIT` decision between
`effect: 'NONE'` with a null token and `effect: 'CONTROL'` carrying `control.widget.dismiss`.
What §3.12 owns is the carrier consequence: **every carrier must be able to deliver it**, which
is why the escape is the one intent no degradation step may drop and why a carrier that cannot
render a control still renders the escape as a command. On a consent or identity kind the mint fence is
evaluated over **every intent whose `role` is not `'escape'`**, so the escape does not make
`CONSENT_STATE` or `IDENTITY_BINDING` unmintable and weakens nothing: it carries no capability
beyond `control.widget.dismiss`, no target and no consent decision.
*Mechanism:* the fitter's escape branch, then the closed-shape validator over the fitted
envelope. *Evaluated at:* `EP-FIT`, `EP-MINT`, `EP-INGRESS` Gate 13. *Status:* [TO BUILD].

---

### 3.13 The forbidden edges

Each row states an edge that cannot be constructed, the mechanism that makes it so, and
where that mechanism is evaluated. "Non-existence" is claimed only where the thing genuinely
cannot be built; every other row names a check.

| # | Forbidden edge | Mechanism | Evaluated at | Status |
|---|---|---|---|---|
| E1 | `BUTTON → PROVIDER` | The submission names no endpoint, capability or argument; `IntentTarget` has no member able to hold a URL, host or origin (R3.3.1); no renderer holds provider credentials or a base URL; the provider owner is called only by the Action Engine | `EP-INGRESS` (shape), `EP-MINT` (target shape), Gate 14 | shape [TO BUILD]; Action Engine boundary [EXISTS] |
| E2 | `BUTTON → DATABASE BUSINESS MUTATION` | `EffectClass` has no `MUTATE`/`EXECUTE` member; the only road to a business row is Gate 14, and `CONTROL` — the one new server-writing class — has no Action Engine edge and a CI-checked import allowlist (R3.2.5) | `EP-MINT` (closed union), Gate 13, `EP-BUILD` | [TO BUILD] |
| E3 | `WIDGET STATE == BUSINESS STATE` | The submission has no `body` and no state member; `resolved_state` derives from the receipt; **no canonical table holds a foreign key to `widget_id`**, asserted by a schema test | `EP-INGRESS`, INV-15 schema test | [TO BUILD] |
| E4 | `CHANNEL IDENTITY → BUSINESS AUTHORITY` | `verification_level` is server-derived and absent from `ChannelProfile`; every actuating class has a derived floor at or above `BOUND_CLIENT` except `CONTROL`, whose fence is `CONTROL_FLOOR`; Gate 5 compares them and Gate 6 recomputes authority per key space | Gate 5, Gate 6 | floor [TO BUILD]; policy [EXISTS] |
| E5 | `BUTTON → 152-FZ DECISION` | R3.4.4: no `CONSENT(cap)`/`IDENTITY(cap)` capability is allowlisted, so no actuating intent for one exists; R3.5.1: such a subject admits `HANDOFF` to an `s` target only, and its derived floor is `SESSION_VERIFIED`+, refused at Gate 5 on any lower channel | `EP-REGISTRY-LOAD`, `EP-MINT`, Gate 5 | exclusion [TO BUILD]; engine fence [EXISTS] |
| E6 | `NOTIFICATION TAP → COMMIT` | R3.12.1: the announcement payload physically contains no `COMMIT` token because the server mints per delivery, and Gate 7 re-checks the tier's effect set | `EP-FIT`/delivery, Gate 7 | [TO BUILD] |
| E7 | `SELECTOR → BOOKING EFFECT` | R3.10.2: a booking `COMMIT` token does not exist until the canonical owner has returned a confirmation, and its `produced_by_intent_token_hash` must name a gateway-consumed propose record | `EP-MINT`, Gate 7 | [TO BUILD] |
| E8 | `LLM → INTENT` | The seal key is held by exactly three minters; the model's only channel is a kind proposal validated against a server table; no model output is an input to `mintIntent()` | `EP-MINT` | [TO BUILD] |
| E9 | `HANDOFF → EXTERNAL PAYMENT PROVIDER` | Same as E1: the target shape cannot name an origin; `shell.pay`'s `param` is an opaque server-minted handle, not a provider session URL. A payment is `DRAFT → confirmation → COMMIT → Action Engine`, which alone opens the provider session and owns the idempotency key | `EP-MINT`, Gate 14 | [TO BUILD] |
| E10 | `CONVERSATION TEXT → AUTHORITY` | The lowered utterance is written as a USER turn with authority NONE; the transcript is an input to nothing but the deterministic router and the model's untrusted-text channel; Gate 6 recomputes authority without reading it | Gate 9, Gate 6 | [TO BUILD] |
| E11 | `UNVALIDATED BYTES → DURABLE TRANSCRIPT` | Gates 5–8-R complete before Gate 9, the first durable write; lowering interpolates only server-resolved canonical labels and normalizer output (R3.9.1, R3.9.2) | Gate 8-R → Gate 9 | [TO BUILD] |
| E12 | `WIDGET → OCCUPANCY LOCK` | R3.10.5: there is no hold field and no `HELD` state to mint | `EP-MINT` | [TO BUILD] |
| E13 | `STALE APPROVAL → EXECUTION` | R3.11.1–R3.11.5: fresh read at decision time, `SUPERSEDED` re-enters approval, and no intent is minted at all for owners whose dispatch the gateway cannot reach | Gate 11, `EP-MINT` | [TO BUILD] |
| E14 | `URL → AUTHORISATION` | Nothing renders before an authority decision: a deep link resolves through one of five typed classes and the server decides what renders; an unresolvable link produces a sentence in the timeline, never a screen and never a login page | carrier resolution | [TO BUILD] |
| E15 | `CHANNEL CLAIM → GATE ANTECEDENT` | No gate keys its antecedent on a client-supplied value: Gate 8-R reads `record.confirmation.requires_readback`, which is server-set and sealed inside `body_hash`, and never `profile_id` (R3.8.3) | Gate 8-R, `EP-BUILD` | [TO BUILD] |

---

### 3.14 The fundamental rules

> **FR-1 … FR-16 — twenty-one rows once FR-6 is split — are declared in §0.16 F89 and are not
> restated here.** The table stood in this section as well, and the two copies had already
> drifted: FR-4's, FR-6b's, FR-6e's and FR-7's key-space cells disagreed between them. A rule
> whose "one enforcing mechanism and one evaluation point" is recorded in two tables has two
> records of the one mechanism, which is the condition the rules exist to forbid.

What §3 owns is the consequence for this section: **no repair this contract makes admits a
capability, widens an allowlist, or relaxes a veto. It makes exactly two floor reductions, and
both are enumerated in §0.17.** Every mechanism §0.16 F89 names for a rule whose subject is an
intent, a gate or a forbidden edge is built by the gateway of §3.9 and evaluated at the
evaluation point F89's row states.

### 3.15 Invariants this section adds or replaces

`[NON-NORMATIVE — INDEX]` **This table restates nothing and decides nothing.** It is a reader's
index into the rules §3 relies on, so that an implementer has one list of what must hold. Where a
row summarises a rule declared elsewhere — INV-28 over §0.8 F49's vetoes, INV-29 over F51's
`C9_FLOOR_BASELINE` assertions, INV-8′ over F48's `SENSITIVE_DEST` — **the declaration governs
and this row is a pointer.** A summary that drifts from its source is a summary; it is never a
second rule.

| # | Invariant | Enforced by |
|---|---|---|
| INV-6′ | The effect/field table of §3.2 holds for every intent; an intent that sets a cell the table marks `null` is unrepresentable, and every capability-valued member is a space-qualified `CapabilityRef` | closed-shape validator, `EP-MINT` |
| INV-8′ | `SENSITIVE_DEST(subjectCapability(i)) ⟹ effect === 'HANDOFF' ∧ target.class === 's' ∧ verification_floor ≥ SESSION_VERIFIED`; the predicate is total over all four key spaces and fails closed | emission validator |
| INV-19 | `verification_floor` is non-null on every intent and equals `verificationFloor()` recomputed from the live registry; any difference at Gate 5 refuses `SUPERSEDED / policy_floor_changed` | mint + Gate 5, plus a CI test that no other assignment to the field exists |
| INV-20 | Every `NAVIGATE`/`HANDOFF` intent carries a `target` of one of the five classes; no intent carries a URL, host, origin or query string, and a shell route's `param` matches `/^[A-Za-z0-9_-]{8,64}$/` | closed shape + `c9SafeText` |
| INV-21 | `effect: 'NONE'` ⟹ `intent_token === null`; no control-registry key, routing-map entry or gateway branch exists for `NONE` | closed shape + routing table test |
| INV-22 | No intent whose subject capability satisfies `BOOKING(cap)` carries `COMMIT` without a non-null `confirmation_of_ref`, and where its `kind !== 'draft'` without a `produced_by_intent_token_hash` naming a gateway-consumed producing record with the identity R3.10.2 fixes | mint refusal + Gate 7 re-check |
| INV-23 | Every `InputField` of a non-closed kind declares a `bounds_source`/`normalizer_ref`, and every such emission carries `free_input_justification` and is counted | emission validator + emission counter |
| INV-23a | No envelope carries both a non-closed `InputField` and a `COMMIT` intent; every `COMMIT` record has a non-null `confirmation_of_ref` | emission validator + mint refusal |
| INV-24 | A submission refused at Gates 1–8-R produces zero conversation writes | pipeline ordering test |
| INV-25 | Every `IntentRecord` field is classified exactly once as `AUDIT_RETAINED` or as conversation content; erasure tombstones the second block and touches neither the first nor any canonical row | field classifier + CI completeness test |
| INV-26 | No fitted `render_tier === 'ANNOUNCEMENT'` delivery carries an intent whose effect is outside `{NAVIGATE, HANDOFF}` | mint-per-delivery + Gate 7 |
| INV-27 | The availability enum has no `HELD` member and no hold field exists anywhere in the contract | the types themselves |
| INV-28 | `FLOOR_EXEMPT(i) ⟹ i.effect ∉ {NAVIGATE, DRAFT, REQUEST_APPROVAL, COMMIT}`; a `priority: 0` `CONTROL` intent carries `control.widget.dismiss` and no other key; `\|{c ∈ C9_CAPABILITIES : c.resourceClass === 'LOCAL'}\| === 1` | three build vetoes |
| INV-29 | `c9Floor` is total over all 56 C9-CAP keys, calls no throwing accessor, and no key evaluates to the fail-closed `STEP_UP_VERIFIED`; `∀ key : c9Floor(ref) ≥ C9_FLOOR_BASELINE[key]` | two build assertions over a pinned vector |
| INV-30 | No gate keys its antecedent on a client-supplied value; Gate 8-R keys on `record.confirmation?.requires_readback`, which is server-set and sealed inside `body_hash` | source test over gate antecedents |
| INV-31 | `max_commit_intents === 2` holds for `APPROVAL` alone; both commits carry the same `confirmation_of_ref.ref` and the same AE capability, and consuming either marks the other consumed | build veto + mint pairing check |

---

### 3.16 Honest register for this section

1. **Everything marked [TO BUILD] or `NORMATIVE-PENDING` is a requirement, not a capability.**
   This cycle changes nothing. The gates that exist today are 2, 4, part of 6 (as two policy
   services), 14 (as an ingress) and the deny-code space. The gateway, the `IntentRecord`
   store, the derived floor, the typed target, Gate 8-R and the ordering of Gates 8–9 are the
   package this contract commissions. Until that package ships, no sentence in this section
   describes the running system.
2. **`IntentRecord` is the one storage addition.** It is not a canonical business table, no
   canonical row references it (INV-15), and it is created by the package that ships the
   gateway. This contract requires **no change to any C9 contract** and **no change to any
   canonical business schema**; it does commission additive widget-layer stores, and that
   narrowing of "no schema change" is recorded here rather than hidden. The widget capability
   policy table, the control registry, the commit allowlist and the gap ledger are frozen
   server-side constants in the widget layer, and the booking family is *derived* from
   `RegisteredActionCapabilityV1.targetKind` rather than added to it.
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
6. **`Lifecycle.delivery` has no canonical owner for attendance.** FR-2 forbids any
   surface presenting it as a business fact, which is a prohibition, not a capability. Until
   an appointment-acknowledgement owner is registered, "клиент подтвердил" is not a claim this
   system can make, and the reminder body must not imply it. Concretely: no `WIDGET_PHRASES`
   entry and no `NARRATIVE_TEMPLATES` entry may reference any member of `DeliveryRecord`, and
   the closed delivery-template set is linted for the business predicates the delivery-record
   rules enumerate. *Evaluated at:* `EP-BUILD`.
7. **Gate 6's second C9 branch is a weaker fence than its first**, and R3.9's non-normative
   note says exactly how. A reader must not take the nine non-catalogue keys' Gate 6 treatment
   for an equivalent of `assertCanExecute`; their role and risk fences are the policy row and
   the consent class, carried at Gate 5.
8. **Two floor reductions exist in this contract and both are in §0.17.** A reader auditing
   this section should be able to find every one of them by reading that rule. There are two.
---

## 4. Lifecycle, channels, accessibility, history

**What this section owns.** The envelope's life from mint to redaction; the retention and erasure classification of everything the widget layer persists; the single definition of `maya.channel.profile/1` and `maya.render.receipt/1` and the fitting algorithm that connects them; the native shell contract; the voice carrier; the accessibility floor `maya.a11y.floor/1`, including `A11yBlock`, `InteractiveRef` and the per-kind accessible-name composition; and the proactive emission rules, including the moment, notification-consent and template catalogues. No other section of this contract restates the members of these artefacts.

**Scope discipline.** Architecture only. Runtime changes: 0. Schema changes: 0. Migrations: 0. No field of any C9 contract (`AgentResult@1`, `c9Request`, `c9Alternative`, the orchestration controller surface) is added, removed or retyped by anything below; `C9_REGISTRY_HASH` is unchanged by every rule in this section. The stores this section names (`IntentRecord`, the timeline store, the receipt store, `RetentionPolicy@1`) are **specified here and created in a later package**; specifying a storage shape before it exists is the point of D5, because retention windows and the receipt-store split are not reversible once data is in them.

**Normative form.** Every numbered rule below is normative and carries two attributes: *Mechanism* (the named thing that makes it true) and *Evaluated at* (the exact point it is checked). A rule without both is a defect in this section, not a rule. Sentences marked `[NON-NORMATIVE]` are rationale, example or commentary; no implementation depends on them.

**Status.** Every rule below whose evaluation point resolves to `EP-BUILD` or `EP-RENDER` is **`NORMATIVE-PENDING` on prerequisite P-19** (renderer sandboxing and the import-graph allowlist): it binds the implementation and describes no running system, because the shipping frontend is a hand-edited single file with no build. Rules with other evaluation points carry their own status where one is stated.

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
*Evaluated at:* `EP-INGRESS`, before Gate 1 proceeds, and `EP-FETCH` on the timeline read — the two server-side points at which the seal is verified.

**L2 — the composer never invents a value.** If a Cell required by the kind's body cannot be built from `facts_used` or a canonical read, the composer emits plain text instead of an envelope. A widget is optional decoration; it is never a precondition for answering.
*Mechanism:* composer contract test — for each registered `projector_id`, a fixture with a missing source field must produce a text answer, not a partially-populated body.
*Evaluated at:* `EP-COMPOSE`, before sealing.

**L3 — `expires_at` is bounded by four clocks, whichever is soonest.**
`expires_at ≤ min(facts.as_of + capability_ttl, principal session expiry, run expiry, issued_at + flow_ttl_s, issued_at + kindCeiling(kind))`.
*Mechanism:* emission validator computing the minimum and refusing the emission if the authored `expires_at` exceeds it.
*Evaluated at:* `EP-MINT`, before sealing (the seal covers `issued_at` and `expires_at`).

**L4 — the seal binds the principal.** `integrity.principal_proof_hash` is the opaque proof of the principal the envelope was minted for. An unlink/relink cycle changes it and thereby invalidates every outstanding envelope on every device, retroactively.
*Mechanism:* HMAC input includes `principal_proof_hash`; the gateway recomputes the live principal's proof and compares.
*Evaluated at:* IntentGateway principal-binding gate, and again at timeline read (§4.2, FR4).

#### 4.1.2 Render, interact, supersede

**L5 — a renderer is a pure function `(envelope) → surface`, and it verifies what it can verify without a key.** At `EP-RENDER` the renderer verifies (i) a **recomputed `body_hash`** — unkeyed SHA-256 over the sealed term list — and (ii) `expires_at`. **The renderer never verifies `envelope_seal`**: the seal is a keyed HMAC held by the three minters of L1, and shipping that key to every renderer would destroy its unforgeability. On a `body_hash` mismatch or on expiry the renderer draws `presentation.text_equivalent` as frozen prose and offers exactly one `REFINE`, and nothing else.
*Mechanism:* renderer conformance suite; the renderer module receives no seal key, no token-bearing props and no network client. Nothing is lost by the narrower check: a forged envelope a renderer would draw still cannot act, because actuation runs the seal check, the `IntentRecord` lookup and the principal comparison server-side.
*Evaluated at:* `EP-RENDER`, per envelope.

**L6 — the UI changes only through a receipt.** A renderer never mutates a widget locally on click. It submits, receives `next_envelope` / `resolved_widget`, and re-renders. Optimistic *spinners* are `ephemeral_ui`; optimistic *business state* does not exist, because the renderer has no field to write it into.
*Mechanism:* `body` is a read model the server ignores on ingress; no submission field carries body state.
*Evaluated at:* `EP-INGRESS` (extra keys rejected by the structural validator) and renderer conformance suite.

**L7 — update in place, never accumulate.** A successor envelope carries `supersedes_widget_id`; the predecessor moves to `SUPERSEDED` and is replaced at its original position. Telegram uses `edit_message_text` on the same message.
*Mechanism:* `superseded_by_widget_id` written by the gateway when it mints `next_envelope`; the adapter's update path is the only write path to a delivered message.
*Evaluated at:* gateway, when `next_envelope` is minted.

**L8 — expiry is never an error.** Interacting with an expired envelope returns `outcome: 'EXPIRED'` with either a freshly composed equivalent envelope or a `LIMITATION` body with a remedy. No renderer may bind expiry to an error theme token, an error icon, `role="alert"`, or an automatic retry.
*Mechanism:* §1.3 C4's anti-error label lint over `Cell.label` and the renderer theme-token ban; `EXPIRED` is a member of the receipt `outcome` union, not of any error type.
*Evaluated at:* gateway token-integrity gate; renderer conformance suite (five branches per Cell).

**L9 — a stale affordance must be withdrawn where the channel allows it, and refused where it does not.** On transition to `SUPERSEDED`, `EXPIRED`, `CANCELLED` or `HISTORISED`, the delivering adapter issues a best-effort withdrawal: Telegram `editMessageReplyMarkup` with empty markup; web push `getNotifications()` + `close()` by `dedupe_key`; no-op for SMS and email. **Correctness never depends on the withdrawal succeeding** — a tap on a withdrawn-but-still-visible control is refused by token integrity.
*Mechanism:* adapter withdrawal hook + `IntentRecord.consumed_at` / `expires_at` check.
*Evaluated at:* historisation job (withdrawal) and IntentGateway token-integrity gate (refusal).

`[NON-NORMATIVE]` The belt-and-braces ordering matters because Telegram messages are durable client-side: an inline keyboard from last Tuesday is still tappable on a phone that was offline when the edit was issued. The refusal, not the edit, is the guarantee.

#### 4.1.3 Per-kind ceilings

`kindCeiling(kind)` is the maximum `expires_at − issued_at`, and `on_expiry` is **mandatory per kind**, not author-chosen. The table is **total over all twenty-two kinds**. `source_bound` means the ceiling is the referenced server handle's own TTL, capped where a cap is stated.

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
| 18 | `CONSENT_STATE` | 300 s | `re_resolve` | null |
| 19 | `IDENTITY_BINDING` | 300 s | `re_resolve` | null |
| 20 | `PAYMENT_HANDOFF` | `source_bound` — the `shell.pay` `session_ref` TTL, ≤ 900 s | `re_resolve` | 1800 |
| 21 | `MEDIA_PREVIEW` | `source_bound` — the signed asset TTL, ≤ 3600 s | `re_resolve` | null |
| 22 | `ARTIFACT` | `source_bound` — the `shell.file` link TTL, ≤ 900 s | `re_resolve` | null |

Rows 18–22 each carry a server-minted, expiring handle — a register read, a binding read, a payment session (`shell.pay`), a signed asset, a signed file (`shell.file`). For every one of them `mark_stale` would leave a dead handle rendered as a live control, which §2 K20 forbids, so `re_resolve` is the only admissible value and is reached by one rule rather than five judgements. `IDENTITY_BINDING`'s 300 s is likewise not arbitrary: L4 makes an unlink/relink invalidate every outstanding envelope retroactively, so a long ceiling on a binding display would contradict L4.

*Mechanism:* `KindRule.expires_at_ceiling_s` (`number | 'source_bound'`) is populated from this table and from nothing else; `on_expiry` is compiled into the emission validator as a per-kind constant and is never an authored field; `KIND_REGISTRY` is a mapped type over `WidgetKind`, so a missing row fails compilation.
*Evaluated at:* `EP-REGISTRY-LOAD`, `EP-MINT`.

**L10 — a token ceiling is not a time limit on the user.** Every envelope whose `input_lock !== 'none'` has `on_expiry: 're_resolve'`. Re-resolution re-mints the envelope **from the canonical draft or the canonical read**, preserving the flow position (`correlation.step_index` / `step_total`) and any server-owned draft. A slow reader loses a token, never a place in the flow and never entered data that a canonical owner already holds.
*Mechanism:* the `on_expiry` column above compiled into the emission validator as a per-kind constant; the re-resolve path is the gateway's `EXPIRED → next_envelope` branch, which reads `draft_ref` where the body has one.
*Evaluated at:* `EP-MINT` (validator) and gateway (on submission of an expired token).

**L11 — `collapse_to_summary` requires an extension affordance.** An envelope may carry `on_expiry: 'collapse_to_summary'` only where re-resolution is impossible (the source no longer exists). It must then carry exactly one `priority: 0`, `role: 'remedy'`, `effect: 'REFINE'` intent whose activation restores the flow, and that intent is undroppable by degradation.
*Mechanism:* emission validator rule `on_expiry === 'collapse_to_summary' ⇒ ∃! intent{priority:0, role:'remedy', effect:'REFINE'}`; the fitting algorithm's PIN step (§4.5.4 step 4) cannot drop `priority: 0`. This remedy is a `REFINE` on the widget's **own owner capability** — a principal below that capability's floor could not have received the widget at all — so it needs no floor exemption and takes none; the step-4 capacity PIN is its whole protection.
*Evaluated at:* `EP-MINT` (validator) and `EP-FIT` (PIN step).

`[NON-NORMATIVE]` This is the repair of the first edition's WCAG 2.2.1 claim, which asserted that `flow_ttl_s` "discharges SC 2.2.1 structurally" while its own regime table gave the flagship booking flow `collapse_to_summary` and a short confirmation ceiling, with no extension affordance defined anywhere. L11 makes the assertion true instead of withdrawing it, and L10 makes the ceilings harmless.

---

### 4.2 The frozen receipt — what a widget is a week later

**Decision D5, option A is adopted.** A persisted widget is an artefact, not a view.

**FR1 — no rehydration, ever.** A historised envelope is rendered from its stored body and stored `text_equivalent` exactly as sealed, with its `as_of` timestamps intact. No renderer, service worker or scroll handler issues a read on behalf of a scrolled-back envelope.
*Mechanism:* the timeline read endpoint returns stored bytes only; renderer modules import no `fetch` / `XHR` / `WebSocket` and receive no capability handle — a historised envelope has no code path to a capability owner.
*Evaluated at:* renderer bundle import-graph allowlist (where a build exists) and the `EP-FETCH` timeline endpoint contract test asserting zero capability calls per timeline page.

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

**FR3 — exactly one re-read affordance, minted at read time under current authority.** A historised envelope carries no live intent. The timeline read endpoint verifies `envelope_seal` server-side, then returns:

```ts
interface HistorisedWidget {
  envelope: WidgetEnvelope;           // frozen, as sealed
  terminal_lines: TerminalLine[];
  reread_intent: WidgetIntent | null; // minted NOW, effect 'REFINE', for the CURRENT principal
}
```

`reread_intent` is `null` whenever the current principal would not be offered that capability today. A historised widget therefore never promises a capability the reader has since lost.
*Mechanism:* the timeline endpoint calls the same AuthorityResolver and capability registry used at mint; a refusal yields `null`, not a disabled control.
*Evaluated at:* `EP-FETCH`, per envelope, per request.

**FR4 — a frozen body is shown only to the principal it was minted for.** The timeline read endpoint recomputes the live principal's proof hash and compares it with `integrity.principal_proof_hash`. On mismatch it returns `presentation.text_equivalent.headline` plus the terminal lines and **withholds the body**.
*Mechanism:* the same hash comparison the gateway uses for principal binding, applied on the read path.
*Evaluated at:* `EP-FETCH`, before the body is serialised.

`[NON-NORMATIVE]` This is what makes freezing safe rather than merely convenient: the one scenario where a frozen body could leak — a channel rebound to a different person, or a client binding replaced — changes the proof hash, and the body stops being served without any fence needing to be re-implemented.

**FR5 — `evidence_refs` in a persisted envelope are non-dereferenceable labels.** C9 evidence handles live in an in-memory map for one invocation. In a stored envelope they are audit labels that identify *which* evidence was used; they are not links and no surface may present them as links.
*Mechanism:* the timeline renderer has no evidence-resolution path; "show the evidence" is only ever the `reread_intent` (FR3), which re-reads.
*Evaluated at:* `EP-RENDER`; CI test asserting no timeline code path calls an evidence resolver.

**FR6 — the honest replay claim.** What can be replayed from storage is **the rendered form and the receipt chain**: the sealed envelope, its `RenderReceipt`, the `text_equivalent` actually sent, the terminal lines, and the Action Engine receipts. The evidential chain behind a `KNOWN` Cell cannot be re-walked from storage and this contract does not claim it can.
*Mechanism:* the replay tool reads the timeline store and the receipt store only; it has no evidence-store dependency, so the stronger claim is not constructible.
*Evaluated at:* replay tool contract test.

**FR7 — the archival form is the text equivalent.** After `retention_sec`, the body is dropped and the conversation retains `{ widget_id, kind, presentation.text_equivalent.headline, resolved_summary_text, terminal_lines, action_receipt_ref[] }`. Reopening a three-day-old conversation shows sentences, not sixty dead buttons.
*Mechanism:* the retention job's field allowlist; `text_equivalent` is covered by `body_hash`, so the archival form cannot drift from what was shown.
*Evaluated at:* `EP-RETENTION`, and the A-21 parity gate (a weak summary fails the same test that fails an unreadable SMS render).

**FR8 — a frozen receipt resolves its own template versions.** A replayed envelope whose narrative came from a moment template resolves `MOMENT_TEMPLATES` and `NARRATIVE_TEMPLATES` under the composed `` `${id}@${version}` `` key carried on the stored envelope (§4.9.3), never under the current version of that id. A catalogue that dropped an older version cannot serve a frozen receipt, and a replay that silently re-rendered under a newer template would destroy the audit artefact FR1 exists to preserve.
*Mechanism:* both catalogues are keyed `` `${string}@${number}` ``; the replay path composes the key from the stored `ProactiveProvenance`.
*Evaluated at:* `EP-FETCH`, `EP-REGISTRY-LOAD`.

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

**DR4 — attendance acknowledgement has no canonical owner, so it carries no intent.** This section adds `GAP-ATTENDANCE-CONFIRM` to the capability-gap ledger: *record that a client acknowledged an upcoming appointment*. Until an owner is registered, an `appointment_reminder` emission carries a `Limitation` with `capability_gap_ref: 'GAP-ATTENDANCE-CONFIRM'` and intents of effect `NONE`, `NAVIGATE` or `HANDOFF` only. A "Приду" control that writes nothing is not emitted, and «клиент подтвердил» is not a claim any surface may make.
*Mechanism:* P2 (the /unsubscribe clause) — the emission validator refuses an intent whose capability is absent from the registry; the gap ledger entry is the positive record of why.
*Evaluated at:* `EP-MINT`, for every `proactive_once` emission.

`[NON-NORMATIVE]` This is a real capability reduction relative to the first edition, and it is the honest one. A tick that a staff member reads as «клиент подтвердил», backed only by a presentation field that history erasure deletes, is worse than no tick: it is a business fact that disappears when a user exercises a legal right.

---

### 4.4 Retention and erasure

#### 4.4.1 Three stores, three clocks

| store | holds | ceiling | erasable on a conversation-erasure request |
|---|---|---|---|
| **Timeline store** | conversation turns, envelopes, bodies, minted text, `spoken_transcript`, rendered utterances | `T_TIMELINE = 180 days` from turn creation; earlier per-kind body drop (§4.4.2) | **yes, fully** |
| **Intent-audit store** | `IntentRecord`, `WidgetIntentSubmission` metadata, `RenderReceipt`, `SuppressedEmission` | `T_AUDIT = 1095 days` (three years) from `issued_at` | **audit fields no; content fields yes** (§4.4.3) |
| **Receipt store** | Action Engine receipts, approval decisions, consent records, the tombstone log | append-only; retention set by the canonical owner of the action, floor `T_AUDIT` | **no** |

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

This table is the contract's **sole** per-kind retention authority; no other section states a retention window for a kind.

| kind | ceiling | why |
|---|---|---|
| `CLIENT_LIST` | 24 h | `pii_class: 'client_identified'` — the shortest window in the contract |
| `FORM` with any `sensitivity: 'pii'` field | 24 h | free-input surface over identified data |
| `SCHEDULE`, `SOURCE_STATUS`, `PROGRESS`, `TIME_SLOT_SELECTOR` | 7 d | operational, superseded quickly |
| `CHOICE`, `SERVICE_SELECTOR`, `STAFF_SELECTOR`, `LIMITATION`, `FORM` (no pii field) | 30 d | selection context |
| `BOOKING_CONFIRMATION`, `SETTINGS_DRAFT`, `APPROVAL` (body projection) | 90 d | the human record of a decision; the canonical record lives in the receipt store |
| `METRIC`, `CHART`, `REPORT`, `STRATEGY_OPTIONS` | 365 d, capped by `T_TIMELINE` | business-aggregate, no identified PII |
| `CONSENT_STATE`, `IDENTITY_BINDING`, `PAYMENT_HANDOFF`, `MEDIA_PREVIEW`, `ARTIFACT` | 24 h | each carries `pii_ceiling: 'client_identified'` or a generated likeness, so RT4's `client_identified` clause already binds them to 24 h; the row is stated rather than left to be inferred, because this table claims to be the sole per-kind authority and a claim of totality with five kinds missing is not one |

**RT4 — the shortest applicable ceiling wins.** `retention_sec ≤ min(kindCeiling, tenant policy, and 24 h whenever `authority.pii_class === 'client_identified'` or any body field is `sensitivity: 'pii'`)`.
*Mechanism:* emission validator computes the minimum and writes `retention_sec`; it is not an authored field.
*Evaluated at:* `EP-MINT`.

**RT4a — `pii_ceiling: 'inherited'` resolves, and resolves fail-closed.** `'inherited'` is resolved at `EP-COMPOSE` to the pii class actually present in the composed body. Where nothing resolves — no body field carries a pii class — it resolves to `client_identified`, the shortest window, and RT4's minimum is then computed over that. `'inherited'` never survives into a sealed envelope.
*Mechanism:* the composer's resolution step, run before the validator computes RT4's minimum; the emission validator refuses a sealed envelope whose `pii_ceiling` is still `'inherited'`.
*Evaluated at:* `EP-COMPOSE` (resolution), `EP-MINT` (refusal).

#### 4.4.3 Field classification

`IntentRecord` and the submission record hold conversation-derived content — `utterance_template`, the human labels interpolated into it, the rendered utterance, the affirmation spoken into a readback, and the full `spoken_transcript` of voice turns. Leaving those behind after an erasure request would turn a stated right into a promise the system does not keep. Erasure therefore reaches them, and which column survives is decided by a classification, not by a store boundary.

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
| `effect`, `capability`, `handoff_capability_ref`, `target`, `priority`, `widget_kind` | `AUDIT_RETAINED` |
| `verification_floor`, `confirmation` (risk tier, reversibility, audience size, `requires_readback`, `readback_ref`, `consent_scope` registry key) | `AUDIT_RETAINED` |
| `input_schema_hash`, `requested_scope_hash`, `body_hash` | `AUDIT_RETAINED` |
| `selection_domain` (the closed-domain option ids), `c9_domain` | `AUDIT_RETAINED` |
| `issued_at`, `expires_at`, `single_use`, `consumed_at`, `run_ref`, `approval_of_intent_ref`, `confirmation_of_ref`, `produced_by_intent_token_hash`, `action_receipt_ref` | `AUDIT_RETAINED` |
| `frozen_nouns` (opaque handles naming canonical rows) | `AUDIT_RETAINED` |
| `utterance_template`, `rendered_utterance`, `selected_labels`, `spoken_transcript` | `CONVERSATION_CONTENT` |
| `selection_domain` **labels** (the human strings) | `CONVERSATION_CONTENT` |

The table is total over §3.7's declared members and over no others: RT5's build-time test
enumerates the columns from the schema and fails on any column with no class or more than one,
so a member added to §3.7 without a row here breaks the build rather than defaulting.

`WidgetIntentSubmission` as persisted:

| field | class |
|---|---|
| `widget_id`, `intent_token`, `client_nonce`, `profile_id`, `client_emitted_at` | `AUDIT_RETAINED` |
| `readback_ack.readback_ref`, `readback_ack.body_hash` | `AUDIT_RETAINED` |
| `inputs[k]` where the schema type is `enum` or `ref` (closed-domain option ids) | `AUDIT_RETAINED` |
| `inputs[k]` where the schema type is `string` (free text) | `CONVERSATION_CONTENT` |
| `inputs[k]` where the schema type is `phone`, or sensitivity is `pii` | `CANONICAL_ELSEWHERE` |
| `readback_ack.affirmation` | `CONVERSATION_CONTENT` |
| `spoken_transcript` | `CONVERSATION_CONTENT` |

`readback_ack.affirmation` is a word the data subject said, so it is erased with the conversation; it is read at submission time only, compared against the closed affirmation vocabulary, and by no later path — which is what keeps the build-time reachability test over `AUDIT_RETAINED`-only gate inputs green.

Timeline turn: the rendered utterance (`IntentReceipt.utterance_echo` as stored), the envelope `body`, `presentation.text_equivalent`, `presentation.a11y.accessible_names`, `speech`, and every narrative string are `CONVERSATION_CONTENT`. `widget_id`, `kind`, `action_receipt_ref[]` and `TerminalLine.outcome` are `AUDIT_RETAINED`.

**RT5 — the classification is total, and a new column cannot dodge it.** Every persisted column of the three stores carries exactly one `ErasureClass`.
*Mechanism:* a build-time test enumerates the columns of each store from the schema and fails on any column with no class or more than one. Adding a column without classifying it breaks the build.
*Evaluated at:* CI, per build.

**RT6 — erasure nulls content and writes a tombstone.** An erasure request over conversation content sets every `CONVERSATION_CONTENT` and `CANONICAL_ELSEWHERE` column to `NULL` across the timeline and intent-audit stores for the requesting principal, and writes `{ erased_at, erasure_request_ref, store, row_key, fields_erased[] }` to the tombstone log. The `AUDIT_RETAINED` fields remain and the row keeps its shape, so the audit line survives as *"this principal submitted intent X against capability Y at time T"* without holding what they said.
*Mechanism:* the erasure job, driven by the `ErasureClass` map (not by a hand-written column list); the tombstone log is in the receipt store.
*Evaluated at:* erasure job; a CI fixture asserts that after erasure, a rendered timeline page contains no `CONVERSATION_CONTENT` bytes and the corresponding canonical booking/consent/loyalty reads are byte-identical to before.

**RT7 — what erasure does not touch, and why that is not a loophole.** Appointments, consent records, loyalty balances, `Client` bindings, `ActionExecution` rows, approval decisions and Action Engine receipts are owned by canonical owners with their own legal bases and their own retention. A conversation-erasure request does not delete them. **This is stated as a scope boundary, not as a safety property of the widget layer** — a data subject's rights against those records are exercised against those owners, through the surfaces the gap ledger tracks (`GAP-CONSENT-PD-WITHDRAW`, `GAP-CONSENT-MKT-REVOKE`, `GAP-CONSENT-REGISTER-EXPORT`), not here.
*Mechanism:* none is claimed. This is a boundary statement.
*Evaluated at:* n/a.

**RT8 — `GAP-HISTORY-ERASE` is not discharged until RT5, RT6 and the RT6 fixture are green.** The gap ledger entry's definition of done includes the classification table above.
*Mechanism:* the gap ledger is versioned with this contract; the entry names the three tests.
*Evaluated at:* gap-ledger review, at the package gate.

---

### 4.5 Channel profiles and degradation — the sole definition

#### 4.5.1 A minter is not a channel

Three services mint envelopes (L1); eleven channels render one to a human; six further systems get no profile at all — five are **emitters and transports** (`scheduler`, `backend`, `edge-relay`, `smm-bot`, `social-publishing`) and one is a **security surface** (`public-web-auth`).

**CH0 — emitters and transports get no `ChannelProfile`, and the proactive scheduler needs none.** Every emission names, at mint time, the `ChannelId` it is fitted for (`Lifecycle.delivery_channel`), and the fitting algorithm runs against **that channel's** profile. A scheduler-minted reminder delivered by web push is fitted to `web-push`; the same moment mirrored into the app timeline is a **second emission** with its own `widget_id`, its own fit and its own receipt, joined to the first by `dedupe_key`.
*Mechanism:* `delivery_channel: ChannelId` is required on every envelope; `ChannelId` has no emitter member, so an emitter profile cannot be written down. The fitter takes a profile, not a minter. There is no `interaction_model` member and no `NON_INTERACTIVE` tier: a transport cannot declare presentation capability.
*Evaluated at:* `EP-MINT` (validator: `delivery_channel` present and resolvable in the profile registry).

`[NON-NORMATIVE]` The first edition gave `interaction_model` a `NON_INTERACTIVE` member and pointed the last ladder step at "scheduler, email, SMS, social publishing, edge relay". That let a transport declare presentation capability, which is the shape of a fourth authority path, and it left the scheduler — a designated minter — with no tier that any conformance matrix could cover. SMS and email keep a profile because they render text to a human; the scheduler does not need one because it renders nothing.

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
  declares_interaction_model: never;
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

**C2 — the forbidden-key validator applies to `ChannelProfile` verbatim.** No `role`, `permissions`, `token`, `client_id`, `staff_id`, `is_staff`, `is_owner`, `__meRole`, `__meIsStaff`, `required_verification`, `interaction_model` at any depth.
*Mechanism:* the same structural validator used on the envelope and the submission.
*Evaluated at:* profile registration and every request carrying `X-Maya-Render-Profile`.

**C3 — a claimed profile is advisory and may only be narrowed.** The adapter presents `X-Maya-Render-Profile: tg.bot@3` and may present `X-Maya-Render-Caps`, which can only reduce the registered profile. The server may override downward; it may never override upward. `verification_level` is absent from the profile by construction; `max_verification_level` is a server-side ceiling. **No authority decision anywhere in this contract reads a claimed profile or a submitted `profile_id`.**
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

**CH1 — the tier ceiling is a maximum, never a permission.** A tier can only remove effect classes. Whether a surviving intent may be *actuated* is decided by the server-derived `VerificationLevel` against the intent's `verification_floor`, which is derived from the capability registry and policy, not from the tier and not from the emitter.
*Mechanism:* the fitter's CARRIER CEILING step subtracts; the verification floor is a separate, earlier subtraction and is re-evaluated at the gateway on submission.
*Evaluated at:* `EP-FIT` (subtraction) and IntentGateway verification-floor gate (actuation).

**CH2 — web push carries `NAVIGATE` and `HANDOFF` only.** No `DRAFT`, `REQUEST_APPROVAL` or `COMMIT` intent is ever emitted onto a notification action, regardless of risk tier or reversibility.
*Mechanism:* the tier table above is a compiled constant in the fitter; `web-push` maps to `ANNOUNCEMENT` with a two-member effect allowlist. At the gateway the refusal is keyed on the **record's** effect and the envelope's minted `delivery_channel`, never on the submitted `profile_id`, which is advisory.
*Evaluated at:* `EP-FIT`, before the envelope is handed to the push adapter; and `EP-INGRESS`.

`[NON-NORMATIVE]` The first edition's ladder permitted a COMMIT on a notification when `risk_tier === 'low_write' && reversible`. A notification action list is device-resident, survives logout, is tapped outside any authenticated transaction, and is capped at 0–2 actions that some desktops never render. A commit there is a commit nobody verified. The stricter rule wins, and it is now the only rule.

#### 4.5.4 The fitting algorithm (normative)

`degrade(envelope, profile) → { envelope′, receipt }`, executed **server-side**, in this order:

1. **VERIFICATION FLOOR** — withhold every intent whose `verification_floor` exceeds the session's server-derived level. `reason: 'verification_floor'`. Each must be reachable via an emitted `HANDOFF` to a channel that can satisfy it. **A `FLOOR_EXEMPT` intent is never withheld at this step.**
2. **SECURE SURFACE** — withhold every intent touching a `SECURE_SURFACE_ONLY` field and every intent whose capability is on the never-chat-actuated list. `reason: 'secure_surface_only'`. Only `HANDOFF` survives.
3. **CARRIER CEILING** — withhold every intent whose effect exceeds the tier ceiling (§4.5.3). `reason: 'carrier_limit'`.
4. **PIN** — `pinned :=` intents at `priority: 0` (the escape verb, the sole `COMMIT`, the sole `HANDOFF`, the L11 extension remedy). If `|pinned| > max_intents`, **do not partially render**: emit instead a `LIMITATION` or `HANDOFF`-only envelope naming the route that can.
5. **FIT** — sort the remainder by `priority` ascending and drop from the tail until `|emitted| ≤ max_intents − 1`, reserving one slot for a **server-minted** `role: 'more'` intent whenever anything was dropped. A renderer never synthesises this; only the server mints an intent.
6. **BODY** — apply `max_table_rows`, `max_body_chars`, `max_options_inline`. Every reduction records `restored_by`. A `REPORT` with depth-2 sections in a non-rich tier collapses to `top_summary` (≤3) plus `fullscreen_intent`, never to a truncated hierarchy in a bubble.
7. **MINT TEXT** — `text_equivalent` is re-minted for the **degraded** envelope, so the portability rule holds on what was actually sent.
8. **SEAL** — the `RenderReceipt` is written to `envelope.render` **before** `body_hash` is computed, and `body_hash` and `envelope_seal` are computed **after** degradation, over the degraded envelope. A degraded envelope is a first-class envelope.

*Mechanism for all eight:* one `fit()` function in the projection layer; adapters receive an already-fitted envelope and have no drop path.
*Evaluated at:* `EP-FIT`, once per delivery channel; step 8's seal at `EP-MINT`.

**The floor exemption step 1 reads.** Four clauses of this contract require exactly the intents a naive step 1 would withhold — `reconnect_intent` is "the only interactive element retained" below its floor, `editor_handoff_intent` and `discard_intent` "survive EVERY step of the degradation ladder", the escape verb is "never dropped by degradation", and the no-action option must stay equally selectable — and none of them has a `reachable_via` by construction, so C4 would fire and the emission would fail. Reordering the ladder was rejected: step 4's pinned set explicitly includes the sole `COMMIT`, and lifting it above the floor would protect a `COMMIT` from its own verification floor. The exemption is therefore taken at the floor itself, **derived from members `WidgetIntent` already declares, never from a list of names**, and it is non-actuating by construction:

> **`FLOOR_EXEMPT` is declared in §0.8 and is not restated here** — neither the predicate, nor
> its two build vetoes and its uniqueness assertion, nor the five-intent census. What step 1
> needs is its effect, and that
> is the whole of what this section states: **a `FLOOR_EXEMPT` intent is never withheld at this
> step.** Steps 2, 3, 5 and 6 still apply to it — an exempt intent touching a
> `SECURE_SURFACE_ONLY` field is still withheld at step 2, and an effect exceeding the tier
> ceiling is still withheld at step 3. Step 4's PIN is unchanged. C4 stops firing because
> nothing in the set is withheld at step 1.

*Mechanism:* the two build vetoes, the uniqueness assertion, and the exempt branch of the floor derivation.
*Evaluated at:* `EP-BUILD` (the vetoes), `EP-FIT` (step 1), `EP-MINT`. *Status:* `NORMATIVE-PENDING` on **P-11**, **P-19**.

**CH3 — renderers never drop an intent.** A renderer may wrap, paginate, collapse a section, add an expander, or choose `INLINE`/`CARD`/`SHEET`. It may not change the intent set, re-rank a `COMMIT` into primary position, hide a `Limitation`, or hide a non-`KNOWN` Cell.
*Mechanism:* renderer conformance suite comparing the emitted intent set with the rendered control set, per profile.
*Evaluated at:* CI, per renderer.

#### 4.5.5 `maya.render.receipt/1`

```ts
interface RenderReceipt {
  contract: 'maya.render.receipt/1';
  profile_id: string; profile_version: number;
  render_tier: RenderTier;                // sealed inside body_hash; see §4.5.4 step 8
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

The receipt is produced at `EP-FIT` and attached to the envelope before `EP-MINT` seals. Only `render.render_tier` is a `body_hash` term; the receipt's later members — `target_classes` is appended at delivery — are outside the seal, because a term that changes after sealing would break every hash.

**C4 — nothing withheld is unreachable.** Every `intents_withheld` and `body_reductions` entry must name a `reachable_via` / `restored_by` that is **present in the emitted envelope**. A receipt that cannot name one is a *failed* emission, not a degraded one: the server emits a `LIMITATION` or `HANDOFF`-only envelope instead.
*Mechanism:* the fitter asserts membership of every `reachable_via` in the emitted intent set ∪ route table, and throws rather than emitting.
*Evaluated at:* `EP-FIT`, before sealing (gate G2).

**C5 — degradation is narrated.** Where anything was withheld or reduced, `text_equivalent.completeness_sentence` says so in prose: *«Показаны 3 из 11 окон»*, and how to get the rest.
*Mechanism:* the text minter reads the receipt; the sentence is generated, not authored.
*Evaluated at:* `EP-FIT` step 7, and the A-21 parity gate.

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
*Evaluated at:* `EP-INGRESS`, every submission.

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
*Evaluated at:* `EP-FIT`; CI property test.

**NT5 — absence is a `Cell`, never a failure.** `Cell<T>{ state: 'UNAVAILABLE', reason_code: 'OUT_OF_SCOPE', label: 'На этом устройстве недоступно — откроется в браузере', next_intent_ref: <web handoff> }`. Never a red banner, never an error icon, never an auto-retry. `'unknown'` from mode 3 resolves to exactly this shape.
*Mechanism:* §1.3 C4's anti-error label lint and the renderer's five-branch Cell requirement.
*Evaluated at:* `EP-RENDER`; renderer conformance suite (gate G7).

**NT6 — the Android TWA declares `shell.kind: 'android_twa'` and zero capabilities.** There is no Capacitor bridge in a TWA, so it cannot report; its profile is build-stamped (`negotiation_mode: 'assumed_absent'`, every key `'absent'`), not negotiated.
*Mechanism:* build stamp in the TWA's bundle configuration.
*Evaluated at:* boot.

**NT7 — the shell supplies no authority, ever.** `NativeBridgeManifest` is subject to the forbidden-key validator. A shell cannot declare a role, a session, a tenant or a verification level. `runtime.preview_access` is classified **presentation-only**; the five existing client-preview enforcement points remain in place, unconsolidated, and none of them may take a bridge value as input.
*Mechanism:* forbidden-key validator over the manifest; a test asserting the five call sites still exist and that none reads `BridgeSession`.
*Evaluated at:* manifest ingestion, and CI per build.

**NT8 — a deep link lands in the router, never in an overlay, and parses nothing business-shaped.** The `appUrlOpen` handler extracts `{ route_key, opaque_handle }` only. It must not read a staff id, a record id, a tenant slug or a price from the URL. Until the link resolves server-side, the app shows a `PROGRESS` body, not a screen. An unknown `route_key` renders `text_equivalent.body`, never a different screen.
*Mechanism:* the handler's parser returns a two-field struct and the router's route table is closed; an unknown key has no branch that reaches a screen constructor.
*Evaluated at:* `EP-RENDER` (link handling), per event (gate G12).

`[NON-NORMATIVE]` The three URL schemes (`mayaos://`, `ru.mayaos.app://`, `pro.malesthetic.app://`) are aliases of one transport, not three capabilities. NT8 is also the transport-layer expression of the ban on self-mounting overlays.

---

### 4.7 Voice

**V1 — voice is a carrier, and there is no voice branch below the transcript.**
`audio → POST /api/ai/transcribe → transcript: string → deterministic match on speech_aliases ∪ ordinal (pre-LLM) → the same intent_token a thumb would have sent → the same gates.`
An unmatched transcript takes the natural-language path, identical to typed text. A spoken utterance and a typed sentence with identical bytes are indistinguishable after the transcription hop: same token, same authority check, same audit line.
*Mechanism:* the resolver is a single function shared by the typed and spoken paths; the transcription endpoint returns a bare string and holds no capability handle.
*Evaluated at:* resolution, before any LLM call; CI gate G8 asserts no capability is reachable by voice and not by text, or the reverse.

**V2 — voice never raises `VerificationLevel`.** Speaking is not authenticating. Voice biometrics are not in evidence in this repository and must not be inferred into existence.
*Mechanism:* `VerificationLevel` is derived from the session by the AuthorityResolver, which takes no audio or transcript input — the value is not constructible from a voice event.
*Evaluated at:* authority derivation, per request.

**V3 — never-chat-actuated is never-voice-actuated.** Consent grant/withdraw, marketing revoke, identity unbind, register export, history erasure: MAYA may explain them aloud and may offer the handoff. The accept/decline control is not speakable.
*Mechanism:* the same capability list and the same verification floor evaluated on the resolved intent — the voice path resolves to an intent and is then subject to every check the tap is.
*Evaluated at:* `EP-INGRESS` (gate G9).

**V4 — every `COMMIT` reached by voice requires readback, and the requirement is a server-set field, not a claimed profile.** `confirmation.requires_readback` is set server-side at `EP-MINT`/`EP-FIT` from `Lifecycle.delivery_channel` — true exactly when a `COMMIT` is fitted for a `SPOKEN` tier — and is sealed inside `body_hash`. `confirmation.readback_text` is the server's sentence, minted by the same pure function class as `text_equivalent` and sealed with it; `presentation.speech.readback_template` is spoken verbatim from it. The user confirms **the server's sentence**, not their own, and an affirmative match is required before the token is consumable.
*Mechanism:* **Gate 8-R**, keyed on `record.confirmation?.requires_readback === true` — **never on the submission's `profile_id`**, which is advisory and is not an authority input, and which a caller could otherwise set to a non-`SPOKEN` profile to skip the readback entirely. The gate refuses unless the submitted `readback_ack` echoes `record.confirmation.readback_ref` and `record.body_hash` and its `affirmation` is an exact member of the server-published closed affirmation vocabulary for the envelope's locale; a `readback_ack` on a record that does not require one is refused in the same way. The `body_hash` echo makes a readback against a superseded body refuse rather than commit.
*Evaluated at:* `EP-MINT` (the fields), `EP-INGRESS` Gate 8-R. *Status:* `NORMATIVE-PENDING` on **P-01**, **P-02**, **P-30**.

**V5 — the PII boundary is inherited, not re-derived.** Audio is not stored. The transcript is **not written to application logs**; only elapsed milliseconds and the audio byte count are logged. When the transcript is submitted it is stored exactly once, in the timeline store, as `spoken_transcript`, classified `CONVERSATION_CONTENT` (§4.4.3) and erasable. The affirmation carried by a readback is classified the same way.
*Mechanism:* the speech service logs two numbers; a log-redaction test asserts no transcript-shaped string reaches the log sink; the erasure job covers `spoken_transcript` and `readback_ack.affirmation` by classification.
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
*Mechanism:* the matcher evaluates escape aliases first, outside the `input_lock` branch; the escape survives step 1 of the ladder by the floor exemption (§4.5.4) and step 4 by the PIN, so it is present to be matched on every tier.
*Evaluated at:* resolution, per utterance.

**V10 — barge-in is mandatory while MAYA is speaking.** Speech onset, a tap or any key interrupts output immediately and returns to `listening`.
*Mechanism:* the output player exposes an interrupt handle bound to all three event sources.
*Evaluated at:* renderer conformance suite.

**V11 — voice-disabled is the default, not a degradation.** Every voice affordance has a typed equivalent that is present, visible and equally prominent whether or not a microphone exists. Voice becomes unavailable when permission is denied, `getUserMedia` or `MediaRecorder` is missing, no supported MIME type negotiates, `audio.capture_pcm16` is absent and the web path also fails, or the user turned it off. In every case the surface renders `Cell{ state: 'UNAVAILABLE', reason_code: 'OUT_OF_SCOPE', label: 'Голос недоступен на этом устройстве — напишите сообщение' }`. Neutral, never red.
*Mechanism:* the typed path is the primary path in the DOM order (A-3 reading order); the unavailability Cell is the single failure shape, covered by §1.3 C4's anti-error label lint.
*Evaluated at:* `EP-RENDER`; renderer conformance suite.

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
  role_hint: RoleHint;                 // the one twelve-member union; the per-kind value is
                                       //   KIND_REGISTRY[kind].role_hint, never authored here
  label: string;
  description: string;
  reading_order: InteractiveRef[];     // EVERY interactive element, in DOM order (A-0)
  live_region: 'off' | 'polite' | 'assertive';
  accessible_names: Record<InteractiveRefKey, string>;  // one entry per reading_order member;
                                                        //   no other key admitted (A-2)
}

type InteractiveRef =
  | { k: 'option'; id: string }        // OptionItem.option_id, and STRATEGY_OPTIONS'
                                       //   alternatives[].option_id
  | { k: 'field';  id: string }        // FormField.field_key
  | { k: 'intent'; id: string }        // WidgetIntent.intent_ref — never intent_token, which is
                                       //   opaque and null for a NONE effect
  | { k: 'row';    id: string }        // TableSpec row key
  | { k: 'entry';  id: string }        // SCHEDULE entry_ref
  | { k: 'slot';   id: string }        // TimeSlotSelectorBody groups[].slots[].slot_ref
  | { k: 'section'; id: string };      // REPORT section_id

// `InteractiveRef` is an object type and cannot key a Record, so the key form is declared.
type InteractiveRefKey = `${InteractiveRef['k']}:${string}`;      // e.g. 'field:phone'
declare function refKey(ref: InteractiveRef): InteractiveRefKey;  // `${ref.k}:${ref.id}` —
                                  // total over the closed SEVEN-member union, and injective
                                  // because `k` is one of seven fixed tokens and ':' is the
                                  // only separator, so no two refs collide.
```

`accessible_names` is **mint class M** — composed by the same pure server function that mints `text_equivalent`, from validated canonical labels — and it is covered by `body_hash` through the `presentation` term, so a composer cannot substitute it and an LLM cannot compose it.

**A-0 — `reading_order` is typed and derived so that it can actually cover everything.** `InteractiveRef`'s seven members are the **typed authority** on what a `reading_order` entry may be; no prose enumeration competes with them. `{k:'slot'}` exists because `TIME_SLOT_SELECTOR`'s declared interactive path is `groups[].slots[].slot_ref`, which no other member could denote; `{k:'section'}` is declared but unproduced — no kind's `interactive_paths` names a section id today, and nothing in this contract claims one does. `series_id` is a **structural** value that is never rendered and is not an interactive element at all.

Per-kind membership is derived, not authored:

```ts
declare function refSet(paths: readonly string[], body: WidgetBody,
                        tier: RenderTier): InteractiveRef[];
       // the ref set a kind's interactive_paths produce against this body. `tier` is REQUIRED
       // because CHART's declared path list is conditional — "and, when degraded to `table`,
       // table_equivalent.rows[].row_key" — and the degradation outcome lives on
       // `render: RenderReceipt`, not on `body`. EP-FIT precedes EP-MINT, so the fitted tier
       // is in hand when this is evaluated.

produced = refSet(KIND_REGISTRY[kind].interactive_paths, body, render.render_tier)
              .filter(r => r.k !== 'intent'
                        || emitted.some(i => i.intent_ref === r.id))
       // the fitter WITHHOLDS intents (steps 1-3, 5) but never nulls the body ref that names
       // them, so a produced {k:'intent'} ref can denote an intent absent from `emitted` —
       // METRIC's drill_intent at TEXT_ONLY, FORM's discard_intent withheld at step 2 or 3,
       // CHOICE's more_intent on ANNOUNCEMENT. Unfiltered, resolveInteractive is partial,
       // nameSourceOf's totality is false, and A-3's DOM-order rule names a control no
       // renderer draws.
reading_order = produced
              ++ [ { k: 'intent', id: i.intent_ref }
                   : i ∈ emitted, in emitted order,
                     refKey({k:'intent', id: i.intent_ref}) ∉ produced.map(refKey) ]
       // BOTH operands are InteractiveRef OBJECTS. `++` is ORDERED concatenation, not `∪`:
       // render order and DOM order must equal this list, so an unordered union would leave
       // two conforming implementations free to differ.
       // The second operand is the CLOSED form — every emitted intent not already denoted by
       // a produced ref — not a role list. A role list was unsatisfiable: `role: 'more'` is
       // minted by §4.5.4 step 5 on ANY kind whenever the fitter dropped anything, while only
       // four kinds declare a `more_intent` path. This form subsumes escape, remedy, `more`
       // and any future server-minted role by construction.
```

**One ordering, stated once:** appended in `emitted` order, **except the escape, which is moved to the end of the appended segment**. On the four kinds whose `interactive_paths` already denote the escape — `BOOKING_CONFIRMATION` and `PAYMENT_HANDOFF` (`dismiss_intent`), `FORM` and `SETTINGS_DRAFT` (`discard_intent`) — **the escape is produced, not appended**, and its produced position governs; nothing is appended for it.

**This widens no authority.** The appended operand ranges over `i ∈ emitted` — intents that have already passed the verification floor, the §4.5.4 ladder and the fitter — and `reading_order` is an accessibility ordering that gates nothing. It adds no intent, waives no floor and confers nothing; a withheld remedy simply never enters the set.
*Mechanism:* `validateEnvelope` recomputes `reading_order` by the derivation above and refuses on any difference — no missing ref, no extra ref, no reordering.
*Evaluated at:* `EP-MINT`.

#### 4.8.1 Clauses

| # | clause | WCAG 2.2 | mechanism / evaluated at |
|---|---|---|---|
| **A-1** | **Every intent renders as a real `button`** (or `a` for a `NAVIGATE` to a route). A click handler on a non-interactive element is a contract violation. The intent list is the only interactive surface, so this is mechanically checkable. | 2.1.1, 4.1.2 | renderer conformance suite + lint; per build |
| **A-2** | **The accessible name of a control is composed, per §4.8.2, from the label of whatever its ref denotes.** See the composition below this table. | 2.5.3 | CI check over every emitted `A11yBlock`; `EP-BUILD` |
| **A-3** | `a11y.reading_order` covers every interactive element and **DOM order equals it**. | 2.4.3 | validator (A-0) + conformance suite; `EP-MINT` and `EP-RENDER` |
| **A-4** | Focus visible at ≥ 3:1 against both adjacent colours; never obscured by a sticky header, sheet or keyboard inset. | 2.4.7, 2.4.11 | visual regression matrix; per build |
| **A-5** | No keyboard trap. `SHEET` density traps focus within the sheet and returns it to the invoking control on escape. The escape intent is always keyboard-reachable — it survives ladder step 1 by the floor exemption and step 4 by the PIN, so it is always in `reading_order`. | 2.1.2 | conformance suite |
| **A-6** | Roving tabindex within an option group; arrows move, Enter/Space select. Eleven slots are one tab stop, not eleven. | 2.1.1, 1.3.1 | conformance suite |
| **A-7** | **Non-`KNOWN` Cell state is never colour-only.** Every non-`KNOWN` Cell contributes a text token to its accessible name («не измерено», «источник не подключён»). Dimming is additional, never sole. | 1.4.1 | the five-branch renderer test |
| **A-8** | **Charts.** `table_equivalent` is required, reachable by keyboard as a sibling disclosure (never hover-only). Series distinguished by shape/dash **and** direct label, not hue. `gap_policy: 'RENDER_GAP'` renders a visible break plus a text note — **never a zero**. | 1.1.1, 1.4.1 | CHART conformance |
| **A-9** | **Reduced motion removes animation, never information.** No parallax, no auto-playing motion, no motion-only state; a state that exists only as motion is invisible to a third of the matrix. | 2.3.3 (AAA, adopted) | `prefers-reduced-motion` snapshot tests |
| **A-10** | **Text scale.** Legible and operable at `text_scale: 2.0` and at 320 CSS px reflow with no horizontal scroll. Only tables, diagrams and code scroll horizontally, each in its own container. Text-spacing overrides must not clip. | 1.4.4, 1.4.10, 1.4.12 | viewport matrix |
| **A-11** | **Target size** floor 24 × 24 CSS px; product standard 44 × 44 on `pointer: 'coarse'`. No capability reachable only by drag. | 2.5.8, 2.5.7 | layout test |
| **A-12** | **Status messages** announce via `aria-live="polite"`. `assertive` is reserved for a `Limitation` of severity `blocking`; `role="alert"` is **never** bound to a non-`KNOWN` Cell. | 4.1.3 | lint + conformance suite |
| **A-13** | **Timing.** Every envelope with `input_lock !== 'none'` has `on_expiry: 're_resolve'` (L10); `collapse_to_summary` requires the pinned extension remedy (L11). A user is never punished for reading slowly. | 2.2.1 | emission validator (L10/L11); `EP-MINT` |
| **A-14** | **Step-up authentication is not a cognitive-function test.** `STEP_UP_VERIFIED` is satisfied by possession — device biometric, passkey, one tap in an already-verified channel — never by a puzzle, transcription task or timed memory test. This constrains how the never-chat-actuated handoffs may be built. | 3.3.8 | design review gate at the handoff package |
| **A-15** | **Redundant entry.** A `FORM` prefills from `FormField.current`; a user never retypes what the system already holds — except where `sensitivity: 'SECURE_SURFACE_ONLY'` forbids display. | 3.3.7 | FORM conformance |
| **A-16** | **`A11yEnvironment` is never read by authority.** No capability, intent, verification or PII decision may read it. A screen-reader user has identical authority. | — | forbidden-key validator + a test asserting no authority code path imports the profile's `a11y_env` |
| **A-17** | **Data tables.** `TableSpec` renders with a caption (`segment_label` / `title`), programmatic column headers from `columns[].label`, row headers where a key column exists, and **row-group headers when `group_by` is set**. `row_intents` activate through a real control inside the row, never by a click handler on the row element. Bulk intents sit outside the table and carry `audience_size` in the accessible name, by the §4.8.2 `CLIENT_LIST` suffix. | 1.3.1, 4.1.2 | table conformance; per emission |
| **A-18** | **Fullscreen routes are inside the floor.** A `presentation.fullscreen_detail` route renders envelopes and is bound by A-1 … A-17; its route shell (header, back affordance, sheet chrome) is bound by A-4, A-5, A-10, A-11. | all | route conformance suite — the same suite, run against routes |
| **A-19** | **The non-chat fallback editor is mandatory where exactness is.** Any envelope carrying a `FORM` body, or any intent whose `input_schema` contains a free `string` or `number` field, MUST carry a non-null `presentation.fullscreen_detail` with `reason ∈ {'exact_configuration','accessibility','correction','audit'}`. Chat-first is not chat-only, and the surfaces with the strongest audit and correction obligations are exactly the ones that may not have an optional fallback. | 3.3.7, 3.3.8 | emission validator; `EP-MINT` |
| **A-20** | **Voice-disabled parity.** Every capability reachable by voice is reachable by typing and by keyboard, and the typed control is present whether or not a microphone exists (V11). | 2.1.1 | gate G8 |

**A-2, in full.** A control's accessible name is

> `nameSourceOf(ref, env).label` + (`suffix.pointers.length ? ', ' + renderSuffix(suffix, el, env.body) : ''`),
> where `el = resolveInteractive(env, ref)` and
> `suffix = ref.k === 'intent' ? suffixFor(env.kind, ref, resolveInteractive(env, ref))`
> `                              : suffixFor(env.kind, ref, null)`

— the suffix bound **inside the branch**, so its third argument is a `WidgetIntent` where the ref is an intent and `null` otherwise, rather than a union tested after the fact. Every argument is bound by a declared total function, none by prose and none free. Where the pointer list is empty the name is `nameSourceOf(ref, env).label` **verbatim**; where `ref.k === 'intent'` that label **is** `intent.label`. In every case the accessible name contains the denoted element's own label as a prefix, by construction. **There is no member `intent.utterance` and no rule may name one**; `intent.utterance_preview` is expressly **not** the accessible name, because the sentence actually written to the conversation is re-rendered later and a preview is not it.

```ts
// The SEVEN body shapes a ref can denote, each named as this contract names it. A 'row' ref
// resolves to its row AND its owning table, because one envelope may hold many tables —
// REPORT declares `sections[].table: TableSpec | null` — so a row key alone does not determine
// which table's is_row_header column to read.
type InteractiveElement =
  | WidgetIntent
  | FormField
  | OptionItem                                         // label: Cell<string>
  | StrategyOptionsBody['alternatives'][number]        // title: Cell<string>, NO label
  | TimeSlotSelectorBody['groups'][number]['slots'][number]   // start: Measure
  | ReportBody['sections'][number]                     // { section_id; heading; … }
  | ScheduleBody['entries'][number]                    // { entry_ref; title; … }
  | { table: TableSpec; row: TableSpec['rows'][number] };

// INDEXED by ref kind. A flat return of the whole union would have nameSourceOf's seven
// branches reading members the declared type does not carry (el.start, el.heading, el.row),
// so the declaration would read as total without type-checking.
type ElementFor<K extends InteractiveRef['k']> =
    K extends 'intent'  ? WidgetIntent
  : K extends 'field'   ? FormField
  : K extends 'option'  ? OptionItem
                          | (OptionItem & { duration: Measure; price: Measure | null })
                          | (OptionItem & { nearest_availability: Measure })   // §2.6.3 declares it Measure; a
       //   Cell<string> is not assignable to it, since Measure.value is number | string | null
                          | StrategyOptionsBody['alternatives'][number]
                          // ^ REQUIRED: STRATEGY_OPTIONS' declared path
                          // `alternatives[].option_id` makes {k:'option'} denote this shape,
                          // which is NOT an OptionItem. Note that `A | (A & B)` narrows to
                          // `A` for member access, so the two intersections are reachable only
                          // through the discriminated base:'element' lookup, never by reading
                          // duration/price off a bare OptionItem.
  : K extends 'section' ? ReportBody['sections'][number]
  : K extends 'entry'   ? ScheduleBody['entries'][number]
  : K extends 'slot'    ? TimeSlotSelectorBody['groups'][number]['slots'][number]
  : K extends 'row'     ? { table: TableSpec; row: TableSpec['rows'][number] }
  : never;

// K is inferred from `ref.k`, a LITERAL property, not from a conditional type: a conditional
// type in parameter position is not an inference site, so `Extract<InteractiveRef, {k: K}>`
// would have left K at its constraint and defeated the indexing this declaration exists for.
declare function resolveInteractive<R extends InteractiveRef>(
  env: WidgetEnvelope, ref: R): ElementFor<R['k']>;
       // Total, and it introduces no new resolver: it is A-0's own ref↔element mapping read in
       // the forward direction. A {k:'intent'} ref resolves against `env.intents` by
       // `intent_ref`; every other ref kind resolves against the body through
       // `interactive_paths`, whose ref set validateEnvelope already recomputes — so the
       // element each ref denotes is a value that computation already holds. Total over the
       // whole of `reading_order` by those two operands.

declare function rowHeaderKey(t: TableSpec): string;   // the one column of THAT table whose
                                                       // is_row_header is true — total

type SuffixSpec = { base: 'element' | 'body'; pointers: readonly string[] };

declare function renderSuffix<K extends InteractiveRef['k']>(
  d: SuffixSpec, el: ElementFor<K>, body: WidgetBody): string;
       // Each pointer resolves — against `el` when base is 'element', against `body` when it
       // is 'body' — to a Cell, Measure or Phrase, and contributes its MINTED label:
       // Cell.label, Measure.formatted, Phrase.rendered. Joined with ', '. An empty pointer
       // list yields ''. Mint class M, like accessible_names itself.

declare function suffixFor(kind: WidgetKind, ref: InteractiveRef,
                           intent: WidgetIntent | null): SuffixSpec;
       // §4.8.2's entry for `${ref.k}:${intent.role}`, else for `${ref.k}:*`, else the
       // declared default { base: 'element', pointers: [] }. TOTAL — it never returns
       // undefined, so A-2 needs no null branch. `intent` is null for every non-intent ref.

type NameSource = { label: string; from: InteractiveRef['k'] };

function nameSourceOf(ref: InteractiveRef, env: WidgetEnvelope): NameSource {
  // `el` is resolved INSIDE each branch, not once before the switch: resolving it first would
  // infer K at the full union, so `el` would stay the flat seven-shape union in every branch
  // and `el.title` / `el.heading` / `el.start` would be reads the declared type does not carry
  // — the very failure the indexed ElementFor was adopted to prevent.
  switch (ref.k) {
    case 'intent':  { const el = resolveInteractive(env, ref);
                      return { label: el.label,                   from: 'intent'  }; }  // string
    case 'field':   { const el = resolveInteractive(env, ref);
                      return { label: el.label.rendered,          from: 'field'   }; }  // Phrase
    case 'section': { const el = resolveInteractive(env, ref);
                      return { label: el.heading.rendered,        from: 'section' }; }  // Phrase
    case 'option':  { const el = resolveInteractive(env, ref);
                      return { label: ('label' in el ? el.label : el.title).label,
                               from: 'option' }; }  // OptionItem.label OR, on STRATEGY_OPTIONS,
                                                    // alternatives[].title — both Cell<string>
    case 'slot':    { const el = resolveInteractive(env, ref);
                      return { label: el.start.label,             from: 'slot'    }; }  // Measure
    case 'entry':   { const el = resolveInteractive(env, ref);
                      return { label: el.title.label,             from: 'entry'   }; }  // Cell
    case 'row':     { const el = resolveInteractive(env, ref);
                      return { label: el.row.cells[rowHeaderKey(el.table)].label,
                               from: 'row' }; }                          // Cell<string> | Measure
  }   // total by type over the closed seven-member union — no default branch is reachable.
}

// A-2, in one line: the accessible name begins with the label of whatever the ref denotes.
∀ ref ∈ reading_order : accessible_names[refKey(ref)].startsWith(nameSourceOf(ref, env).label)
```

**Every branch lands on a minted string, and each of the three routes there is deliberate.** `WidgetIntent.label` is already `string`. `FormField.label` and a report section's `heading` are `Phrase`, dereferenced through `.rendered` — the only user-visible bytes. The remaining three sources are `Cell<T>`, and `Cell<T>.label` is a human sentence fragment in **every one** of the five cell states, so an accessible name never degrades to an empty string, a raw value or a failure token when a cell is not `KNOWN`.

**A table's row-header cell is never absent and never `null`.** For every `TableSpec t` reachable in a body and every `r ∈ t.rows`, `r.cells` MUST contain the key `rowHeaderKey(t)` with a **non-null** `Cell<string>` or `Measure`. Absence or `null` refuses the envelope. A header whose value is not yet known is carried by a `Cell` in a non-`KNOWN` state — `PARTIAL`, `NOT_MEASURED`, `UNAVAILABLE` or `PENDING` — never by `null` and never by an absent key. The other columns keep their `| null` alternative unchanged; only the one row-header column is narrowed.
*Mechanism:* `validateEnvelope`'s `TableSpec` check. *Evaluated at:* `EP-MINT`.

**Two validator rules make `accessible_names` total and closed:** `keys(accessible_names) === set(reading_order.map(refKey))`, and an envelope whose `reading_order` names a ref with no entry is refused.
*Mechanism:* a CI check over each emitted `A11yBlock` asserting, for every `ref ∈ a11y.reading_order`, that `a11y.accessible_names[refKey(ref)].startsWith(nameSourceOf(ref, env).label)`, and, for every kind §4.8.2 names, equality with the row's composition applied to the emitted body; plus the two totality rules at `EP-MINT`.
*Evaluated at:* `EP-MINT` (totality), `EP-BUILD` (the composition check). *Status:* `NORMATIVE-PENDING` on **P-19**, **P-31**.

**A-21 — the parity gate, which is the whole floor in one test.** For every emitted envelope × every registered profile: render at `TEXT_ONLY`; assert every fact appears; every retained intent is reachable by a typed reply; every non-`KNOWN` Cell is stated with its `label`; every `intents_withheld` entry names a reachable route. **If `text_equivalent` cannot express the widget, the widget may not be emitted.**

**The artefact under test is one artefact.** `presentation.text_equivalent` is server-minted by a pure function, covered by `body_hash`, and is simultaneously: the screen-reader description, the SMS body, the email body, the spoken transcript source, the archival summary after `retention_sec` (FR7), and the audit rendering used in replay (FR6). **That identity is what makes accessibility testable by one mechanism instead of five** — there is no second "accessible version" that can drift, because there is no second version.
*Mechanism:* A-21 runs over stored emission fixtures; the text minter is a pure function with no renderer input.
*Evaluated at:* CI, per build (gate G10).

#### 4.8.2 Per-kind floor

`role_hint` is **not a column of this table**: it is `KIND_REGISTRY[kind].role_hint`, derived and never independently authored, over the one twelve-member `RoleHint` union. The five columns below are this table's own, and the table is **total over all twenty-two kinds**.

| kind | keyboard model | text alternative | live region | non-colour state | `accessible_name_suffix` |
|---|---|---|---|---|---|
| `CHOICE` | roving tabindex; ←↑→↓ move, Enter/Space select, Home/End | `itemized` + `options_list` | `off` | selection is announced, not coloured | default (empty) |
| `SERVICE_SELECTOR` | as `CHOICE` | each option's duration and price in the accessible name | `off` | `requires_consultation` as a text token | `option:*`, base `element`, pointers `duration`, `price` |
| `STAFF_SELECTOR` | as `CHOICE` | `nearest_availability` in the accessible name | `off` | — | `option:*`, base `element`, pointer `nearest_availability` |
| `TIME_SLOT_SELECTOR` | arrows within a group; PageUp/PageDown across groups; Home/End; Enter selects | one itemized line per group + `completeness_sentence` | `polite` on re-resolve | availability as «свободно» / «занято» / «неизвестно» text tokens | default (empty) |
| `BOOKING_CONFIRMATION` | focus lands on the heading; commit/amend/cancel are buttons in `reading_order`; escape always reachable | full `itemized` of every line and measure; `readback_template` is the accessible description | `polite` | policy notices are prose, not icons | default (empty) |
| `SCHEDULE` | lane = row header, time = column header; arrows navigate; Enter opens `detail_intent`; entry controls are buttons inside cells | one line per lane, then per entry | `polite` | `state` as a text token; `pii_masked` stated in prose | default (empty) |
| `CLIENT_LIST` | A-17; row intents are in-row buttons; bulk intents outside the table | caption + header row + one line per row | `polite` on page change | segment and masking stated in text | `intent:primary`, base `body`, pointer `bulk_intents[⟨entry whose intent handle is ref.id⟩].audience_size`; row refs are `{k:'row'}` and unaffected |
| `METRIC` | headline metric first in `reading_order`; `drill_intent` a button | every `Measure` formatted with unit and `basis` | `off` | `comparison.direction` as a word, not an arrow alone | default (empty) |
| `CHART` | A-8; table reachable by keyboard from the chart | `table_equivalent` in full | `off` | shape/dash + direct label | default (empty) |
| `REPORT` | headings navigable (depth 1 → h3, depth 2 → h4 inside chat); `fullscreen_intent` a link | `top_summary` + section narratives + tables | `off` | — | default (empty) |
| `STRATEGY_OPTIONS` | as `CHOICE`; **NO_ACTION is an option in the same group**, never styled as dismissal | each alternative's title, reasoning and expected-effect Cell | `off` | no alternative may render with a checked state, a pre-selection, or any token distinguishing it as recommended | **explicitly empty** — an alternative's accessible name is its `title` verbatim |
| `APPROVAL` | approve/reject/detail are buttons | full effect preview, audience maths and expiry | `polite` | `state` as a word | `intent:primary`, base `body`, pointers `audience_size`, `risk_tier`, reversibility — **the approve control alone**; `intent:destructive` (reject) and `intent:secondary` (detail) take the default |
| `PROGRESS` | cancel is a button; steps are a list | per-step label and state | `polite`, throttled to ≥ 5 s between announcements | step state as a word; `blocked_unknown` is neutral | default (empty) |
| `LIMITATION` | remedy intents are buttons | headline + detail + codes | `assertive` **iff** `severity === 'blocking'`, else `polite` | severity as a word | default (empty) |
| `SOURCE_STATUS` | reconnect intents are buttons | one line per source with `as_of` and impact | `polite` | `state` as a word | default (empty) |
| `SETTINGS_DRAFT` | diff rows read «было X, станет Y»; apply/discard/editor-handoff are buttons in `reading_order` | the whole diff, with `effect_text` and reversibility | `polite` | reversibility as a word | default (empty) |
| `FORM` | labels programmatically associated; Enter does not submit a multi-field form | field labels, help, current values, and the justification sentence | `polite` | refusals render as a `Limitation` in prose; focus moves to the first refused field. **There is no error styling, because there is no error kind** | default (empty) |
| `CONSENT_STATE` | focus lands on the heading; `change_handoff_intent` is a button in `reading_order`; the escape is always keyboard-reachable | the current decision, when it was recorded, what it permits, what changing it would do, and the sentence naming the verified surface where it can be changed — in full | `polite` | the decision is a word («разрешено» / «запрещено» / «неизвестно»), never a colour and never a switch position | default (empty) |
| `IDENTITY_BINDING` | one heading; per binding, `manage_handoff_intent` is an in-row button in `reading_order` | per channel: which, since when, what it unlocks, what unlinking would cost, then the handoff sentence | `polite` | `state` as a word («связан» / «не связан» / «ожидает») | default (empty) |
| `PAYMENT_HANDOFF` | focus lands on the heading; `commit_intent` / `continue_intent` / `dismiss_intent` are buttons in `reading_order`; the escape is always keyboard-reachable | what is bought, the exact amount as a formatted `Measure`, who takes the payment, what returns afterwards, and when the handle expires | `polite` | the amount is prose; a gap-blocked commit renders as a `Limitation` in prose — **never as a disabled-styled button** | default (empty) |
| `MEDIA_PREVIEW` | not focusable; `regenerate_intent` and `fullscreen_intent` are ordinary tab stops | text parity `recipe_only`: the recipe (request, parameters, when, producer) plus `alt` | `off` | a not-yet-ready state is a word; the image is described, never only shown | default (empty) |
| `ARTIFACT` | one tab stop; Enter activates | text parity `file_facts_only`: filename, format, size, what it contains, whether it contains personal data, when the link expires | `off` | expiry and personal-data presence are words, never icons | `intent:primary`, base `body`, pointers `filename`, `format`, `size_bytes` — **the fetch control alone**; `regenerate_intent` takes the default |

**The suffix column is typed, keyed per ref kind *and* intent role, and is a composition descriptor — never a literal string.**

```ts
accessible_name_suffix: Partial<Record<
    `${InteractiveRef['k']}:${WidgetIntent['role'] | '*'}`,
    { base: 'element' | 'body'; pointers: readonly string[] }
  >>;
       // The VALUE is a composition descriptor: a string would be concatenated verbatim and
       // produce "Скачать, audience_size" instead of the number.
       // `base` is REQUIRED because the two families resolve against different nodes and
       // neither base serves both. An intent ref's element is a WidgetIntent, which declares no
       // filename, audience_size or risk_tier — those live on ArtifactBody, ApprovalBody and
       // the body's bulk_intents[] — so the three intent rows are base:'body'. The two option
       // rows say "THAT option's duration and price", which only the resolved element can
       // express, so they are base:'element'.
       // The declared default is { base:'element', pointers: [] } — an EMPTY LIST, never ''.
       // LOOKUP KEY: `${ref.k}:${intent.role}` for a {k:'intent'} ref; `${ref.k}:*` for every
       // other ref kind, which denotes an element carrying no role at all. A more specific
       // entry wins over '*'.
```

It must key on the ref kind **and** the intent role, because two rows scope their suffix more finely than a ref kind can express: `APPROVAL`'s interactive paths are `approve_intent`, `reject_intent` and `detail_intent`, all `{k:'intent'}`, so a ref-kind key would force the audience-and-risk suffix onto the reject and detail controls too; and `CLIENT_LIST`'s `audience_size` belongs to its bulk intents, not to its row refs. A suffix on the wrong control is a wrong accessible name, not a loose one. The role assignments the two `intent:primary` rows depend on are fixed by the kind clauses `APPROVAL.4`, `ARTIFACT.5` and `CLIENT.3`; `intent:escape`, `intent:remedy` and `intent:more` take the empty default in every row, so the intents A-0 appends never acquire a suffix.

**Where a `base: 'body'` pointer crosses an array whose entries carry an intent handle, the entry selected is the one whose handle equals `ref.id`.** If no entry matches, the envelope is refused at `EP-MINT` rather than rendering a name from a neighbouring entry. Only `CLIENT_LIST` carries such a pointer: `ARTIFACT`'s and `APPROVAL`'s pointers are single-valued members of their bodies.

*Mechanism for the table:* it is compiled into the renderer conformance suite as a per-kind fixture set, and a build assertion requires exactly twenty-two branches keyed on `WidgetKind`, with `accessible_name_suffix` present and non-`undefined` on every row. A kind with no row cannot pass A-21 because the suite has no branch for it — which is also the enforcement that a new kind cannot be added without an accessibility row.
*Evaluated at:* `EP-BUILD`. *Status:* `NORMATIVE-PENDING` on **P-19**, **P-31**.

---

### 4.9 Proactive emissions

A proactive envelope is minted by the scheduler for one of the canonical moments, with no human turn preceding it. Four properties are claimed, three of them mechanically, and the fourth is named honestly as review discipline.

#### 4.9.1 PR1 — the effect ceiling, stated once

**`origin.trigger === 'proactive'` ⇒ every intent's `effect ∈ {NONE, NAVIGATE, REFINE, HANDOFF}`.** No `DRAFT`. No `REQUEST_APPROVAL`. No `COMMIT`. No `STRATEGY_OPTIONS` body.
*Mechanism:* emission validator, one predicate over the intent list.
*Evaluated at:* `EP-MINT`. **This is the only statement of the proactive ceiling in this contract.**

`[NON-NORMATIVE]` The first edition capped proactive at `DRAFT` while two sibling documents capped it at `REFINE`, and the loosest of the three was the normative one. A scheduled `DRAFT` is a server-owned booking, settings or audience draft created with no human in the loop — that is the difference between presenting information and starting work.

#### 4.9.2 PR2 — no autonomous loop through the proactive door

**A proactive envelope may not carry a capability that opens or continues a C9 run, and `IntentRecord.run_ref` must be `null` for every record minted from a proactive envelope.**

```
RUN_OPENING(r: CapabilityRef | null) :=
                    r !== null
                 ∧ r.space === 'C9'
                 ∧ (c9Registry.tryGet(r.key)?.mode ?? 'PROPOSE_ONLY') !== 'READ'
                 //  ^ the one declared accessor. The `??` default makes an unregistered C9 key
                 //    satisfy RUN_OPENING, so (a) REFUSES it on a proactive envelope — the
                 //    fail-closed direction.
```

*Mechanism:* (a) the emission validator refuses any intent whose `subjectCapability(i)` satisfies `RUN_OPENING` on an envelope whose `origin.trigger` is `'proactive'`. `subjectCapability(i)` returns `null` for a `NONE` effect and for a `w`/`i`/`s`/`detail` `NAVIGATE`, which is why `RUN_OPENING` is stated ref-nullably and is total over what it is passed. **No field is added to any C9 contract**: `mode` is an existing mandatory closed-union member of `C9Capability`, and `C9_REGISTRY_HASH` is unchanged. (b) A standing query — *any `IntentRecord` with a non-null `run_ref` whose emitting envelope had `trigger: 'proactive'`* — is one of the named leak tests, run in CI against recorded emissions.
*Evaluated at:* `EP-MINT` (a), `EP-BUILD` over recorded emissions (b).

`[NON-NORMATIVE]` `mode` distinguishes exactly the right set: `READ` keys are provenance — a proactive envelope legitimately names a measurement read as the source of a metric — while `PROPOSE_ONLY` and `OWNER_HANDOFF` can only be exercised *inside* a run, so an intent naming one is a run-opener by construction. Membership is 15 of the 56 registered keys (13 `PROPOSE_ONLY` + 2 `OWNER_HANDOFF`), verified by enumerating the live registry.

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
  moment_template_id: string | null;      // REQUIRED iff narrative_source === 'moment_template'
  moment_template_version: number | null; // REQUIRED under exactly the same condition; the pair
                                          //   composes the MOMENT_TEMPLATES key
  notify_pref_key: string;             // mint class D, derived server-side from the moment;
                                       //   resolved in NOTIFICATION_CONSENT_REGISTRY at delivery
}
```

`moment_template_version` is not optional decoration: `MOMENT_TEMPLATES` is keyed `` `${id}@${version}` ``, so an id alone cannot resolve the catalogue, and §4.2 replays frozen receipts whose template version may be older than the current one (FR8).

**The catalogues, declared once.** `MOMENT_REGISTRY`, `NOTIFICATION_CONSENT_REGISTRY` and `MOMENT_TEMPLATES` are declared **here**, in §4.9.3, and nowhere else; `NARRATIVE_TEMPLATES` and `NarrativeTemplate` are declared in **§1.6.5** and are referenced here, not re-declared. All are closed server catalogues; they are not author-extensible, and a moment absent from `MOMENT_REGISTRY` cannot be emitted.

```ts
interface Moment {
  moment_key: string;
  kind: WidgetKind;                  // the kind this moment composes — PR5b's required_cells
                                     //   pointers are checked against this kind's leaf schema
  moment_template_id: string;        // with the version below, composes the MOMENT_TEMPLATES key
  moment_template_version: number;
  notify_pref_key: string;
  once_per: string;
  quiet_hours_policy: string;
}
declare const MOMENT_REGISTRY: Readonly<Record<string, Moment>>;   // the 12 canonical moments

interface NotifyPref {
  notify_pref_key: string;
  consent_class: 'communication';    // a delivery permission is always a communication
                                     //   consent, never another class
  owner: CapabilityRef;              // the canonical owner that records and revokes it
  quiet_hours_window: string;        // IANA-zoned window, re-read at delivery
}
declare const NOTIFICATION_CONSENT_REGISTRY: Readonly<Record<string, NotifyPref>>;

interface MomentTemplate {
  moment_template_id: string;
  version: number;
  narrative_template_id: string;
  narrative_template_version: number;
  required_cells: string[];          // JSON Pointers into the body this moment composes
}
declare const MOMENT_TEMPLATES: Readonly<Record<`${string}@${number}`, MomentTemplate>>;

// NarrativeTemplate and NARRATIVE_TEMPLATES are declared in §1.6.5 and are NOT re-declared
// here. §4.9 references them; it does not own them. Both are keyed `${id}@${version}`.
```

At `EP-REGISTRY-LOAD`, or the process does not start: `MOMENT_REGISTRY` carries exactly **twelve** rows; every row's `notify_pref_key` resolves in `NOTIFICATION_CONSENT_REGISTRY`; every row resolves in `MOMENT_TEMPLATES` under the composed key `` `${row.moment_template_id}@${row.moment_template_version}` ``; every `MomentTemplate` resolves in `NARRATIVE_TEMPLATES` under `` `${t.narrative_template_id}@${t.narrative_template_version}` ``; and every `required_cells` entry is a pointer that `KIND_REGISTRY[row.kind]`'s leaf schema admits.
*Status:* `NORMATIVE-PENDING` on **P-17** (the `dedupe_key` resolver PR3c's third condition needs) and **P-32** (the three registries and the templates).

**PR3a — the referenced artefact must predate the emission.** `artefact_created_at < lifecycle.issued_at`, and every Cell in the body must carry `as_of ≤ artefact_created_at` or evidence from the referenced artefact.
*Mechanism:* emission validator comparing timestamps read from the canonical row — not from the emitter's claim: the validator re-reads the row by `artefact_ref`.
*Evaluated at:* `EP-MINT`.

**PR3b — narrative text has exactly two legal sources, and composition is not one of them.** Either (i) `moment_template`: a frozen server template resolved from `MOMENT_TEMPLATES` and `NARRATIVE_TEMPLATES` under the composed keys above, with numerals interpolated only from `Measure`s in the body; or (ii) `stored_artefact`: a verbatim copy of a narrative field on the referenced row, with `narrative_hash` equal to the hash of that stored field.
*Mechanism:* the validator recomputes `narrative_hash` — against the template render for (i), against the stored field re-read from the canonical row for (ii) — and refuses on mismatch. Newly-composed strategy is not expressible because there is no third source.
*Evaluated at:* `EP-MINT`.

**PR3c — the delivery permission is re-evaluated at delivery, not at mint.** `notify_pref_key` must resolve in `NOTIFICATION_CONSENT_REGISTRY`, quiet hours are applied from that row's `quiet_hours_window`, and `dedupe_key` must be unique for the moment's `once_per` window.
*Mechanism:* the delivery adapter re-reads the consent key and the quiet-hours window immediately before handing bytes to the channel; a mint-time value is neither sufficient nor used.
*Evaluated at:* `EP-DELIVER`, per channel, per emission.

**PR4 — what is *not* mechanically proven.** PR3 proves **provenance** — that the facts and the words existed in canonical storage before the emission. It does **not** prove that presenting this artefact to this principal at this moment is *appropriate*. `[NON-NORMATIVE]` That judgment lives in the moment registry: which moments exist, what each one is allowed to say, and to whom. It rests on review discipline at the point a moment is added to the registry, and this contract does not fake a mechanism for it. The honest boundary is: **provenance is enforced; editorial judgment is reviewed.**
*Mechanism:* none claimed for the judgment. The registry's review is a package gate, not a runtime check.
*Evaluated at:* moment-registry review, when a moment is added or its template changes.

#### 4.9.4 PR5 — placement and silence

**PR5a — a proactive envelope is never pinned.** `Lifecycle.timeline_placement` has exactly one member, `'chronological'`. Persistent position is not expressible for any envelope, proactive or otherwise.
*Mechanism:* the type — there is no pinned member to write. This is enforced by non-existence in the strict sense: the value cannot be constructed.
*Evaluated at:* compile time; the emission validator additionally rejects an unknown literal.

**PR5b — a proactive emission may render nothing, and silence is the correct output.** Each `MomentTemplate` declares `required_cells: string[]`, JSON Pointers into the body its moment composes. If any required Cell resolves to a non-`KNOWN` state at compose time, the emission is **suppressed**: no envelope, no empty card, no placeholder, no failure message. A `SuppressedEmission { moment, dedupe_key, suppressed_at, unresolved_cells[] }` row is written to the intent-audit store.
*Mechanism:* the composer's suppression branch, driven by the resolved template's `required_cells`; the audit row is the evidence that silence was chosen rather than lost.
*Evaluated at:* `EP-COMPOSE`, before sealing.

`[NON-NORMATIVE]` A greeting that says «не удалось загрузить» every morning would do more damage than no greeting at all. Suppression is also consistent with the rule that UNKNOWN is never rendered as failure: not rendering is not the same as rendering a failure, and the audit row means the difference is observable.

**PR5c — a proactive emission carries no acknowledgement affordance without a canonical owner.** See DR4 and `GAP-ATTENDANCE-CONFIRM`.
*Mechanism:* P2, enforced by the emission validator.
*Evaluated at:* `EP-MINT`.

---

### 4.10 What this section does not prove `[NON-NORMATIVE]`

1. **Freezing is safe; it is not fresh.** Scrolled-back numbers are stale by construction and the reader must use `reread_intent` to refresh. That is the cost of D5-A and it was paid deliberately.
2. **The retention numbers are decisions, not derivations.** 180 / 1095 days and the per-kind body ceilings are stated here because D5 requires the storage shape to be fixed before data exists. They are defensible, not inevitable; a tenant may shorten them and nobody may lengthen them.
3. **RT7 is a boundary, not a guarantee.** Erasing conversation content does not exercise a data subject's rights against consent records, appointments or loyalty balances. Three of the eight gap-ledger entries are exactly those missing surfaces.
4. **Three bundles wear one profile name.** `app.html`, `maya-os-site/index.html` and `app-tenant.html` are three builds with three plugin expectations and three deep-link registrations. A `ChannelProfile` describes a renderer; convergence is a prerequisite of this contract, not a consequence of it — and nothing may be deleted to achieve it before capability parity is green.
5. **The shell manifest cannot be verified from this repository.** `NativeBridgeManifest` needs an out-of-repo Capacitor change. Until it ships, negotiation runs in `probe` or `assumed_absent`, and `'unknown'` must remain a legal, non-alarming resolution — which is why NT5 exists.
6. **Push action availability is unknowable in advance.** `Notification.maxActions` varies by browser and OS and some desktops render none. CH2 makes that not matter: a push whose actions all vanish still works, because its only intent was a navigation and the notification body is already the canonical text.
7. **Renderer sandboxing is a convention until there is a build.** FR1's import-graph enforcement needs a build pipeline; the shipping frontend is a hand-edited single file with no sources and no `build.js` in the repository. Until then FR1 is enforced by the timeline endpoint's contract test alone, which is weaker than the pair — and every rule this section marks `NORMATIVE-PENDING` on P-19 inherits that weakness.
8. **A-14 and A-19 constrain surfaces that do not exist yet.** They bind the handoff and fallback-editor packages when those are built; they bind nothing today.
9. **`{k:'section'}` is a declared but unproduced ref.** No kind's `interactive_paths` names a section id, so the branch is live only if REPORT's headings later become tab stops. Its existence is not a claim that something produces it.
---

# Annex A — Prerequisites, build status and scope rulings

*Appended to MAYA WIDGET CONTRACT v1. Normative.*

---

## A.0 Status, precedence and verification method

**A0.1 — status.** This annex is **normative**, and it is normative about **one subject only**: whether the mechanism a rule names exists in the repository today, and what a rule whose mechanism does not exist may therefore claim. It reverses no ruling of §§0–4 and resolves no conflict between them — where this annex and the body appeared to differ, the body has been corrected and the annex now agrees with it. It adds **exactly two** rules of its own, both within its one subject, both marked where they stand and named here so the claim is checkable: **§A1.6.2**, which requires that the reachable canonical consent owner stay outside `AE_WIDGET_COMMIT_ALLOWLIST` — a registration gate with four live keys behind it is a materially different gate from one with none; and **§A2.8**, which marks every §4 mechanism whose evaluation point resolves to `EP-BUILD` or `EP-RENDER` as `NORMATIVE-PENDING` on P-19, because §4's preamble marks only its stores and F5's status vocabulary could not otherwise reach them. Both are statements about what an unbuilt mechanism may claim, which is this annex's subject; neither changes a rule of §§0–4. It does three things Section 0 leaves implicit and one thing Section 0 explicitly escalated: it states, per component, whether the mechanism a rule names exists in the repository today; it defines the status that a rule with an absent mechanism carries and the fail-closed default that status compels; it rules on the schema-scope constraint; and it records the repository defects no clause of this contract can close.

**A0.2 — there is no precedence order, because there is nothing for one to resolve.** §§0–4 state the rules; this annex states the build status of the mechanisms those rules name, and the repository defects no rule can close. The two subjects do not overlap, so no ordering between them is needed and none is declared — the preamble's «no precedence chain» holds without exception. **A divergence between this annex and the body is a defect in one of them, to be repaired, not adjudicated**; the one divergence that existed — §A1.6's corrected count of the reserved consent/identity names — has been folded into §0.21 residual 4, which now states the corrected figure.

**A0.3 — what this annex changes about the certification counts.** The residual certification finding is dominated by one class: *the contract correctly specifies a mechanism whose component does not exist yet.* That is not a contradiction in the contract; it is a specification ahead of its implementation. Left unmarked it reads as an unproven claim about the running system, and the owner's bar is zero. §A1 marks every such component. §A2 converts the mark into a binding rule with a fail-closed default. After §A1 and §A2, a rule naming an absent mechanism is no longer an unproven claim — it is a **declared prerequisite with a fail-closed default**, which is a checkable property.

**A0.4 — verification method.** Every status in §A1 and every defect in §A4 was verified by `grep` at the time of writing, against:

| Root | What |
|---|---|
| `/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/maya-identity-consent` | canonical repository, branch `codex/maya-identity-consent-20260913`. Carries `maya-saas-backend/src/orchestration/c9.*`, `src/action-engine/*`, `prisma/schema.prisma` (116 models, 97 migrations). Read-only for this cycle. |
| `/Users/stanislavmosin/Desktop/Projects/maya-platform` | primary working tree — `ai администратор/`, `smm_bot/`, `сайт и приложение/`, `maya-os-site/`, `beget_remote_snapshot_2026-06-28/`. |

Paths inside tables are repository-relative to one of those two roots. A count of **0** below means zero occurrences of the identifier in any `.ts`, `.tsx`, `.prisma`, `.js`, `.py`, `.php` or `.html` file under the stated root, excluding `node_modules`.

**A0.5 — the umbrella fact.** The widget layer does not exist in any form. Verified, all under `maya-saas-backend/src`, all **0 occurrences**: `WidgetEnvelope`, `WidgetIntentSubmission`, `IntentRecord`, `intent_token` / `intentToken`, `body_hash` / `bodyHash`, `envelope_seal` / `envelopeSeal`, `widget_id` / `widgetId`, `WIDGET_CAPABILITY_POLICY`, `CONTROL_REGISTRY`, `NEVER_CHAT_ACTUATED`, `capability_gap_ref`, `frozen_nouns`, `ErasureClass`, `RenderReceipt`, `ChannelProfile`, `api/widgets`. No Prisma model matches `widget|timeline|emission|intent` (`C9WorkReceipt`, `prisma/schema.prisma:4012`, is the C9 orchestration work receipt and is **not** the contract's receipt store). The only file matching `*widget*` semantics is `src/ai-tools/chat-report-card.ts`, whose `ChatReportWidget` / `widget_data` shape is the present-day AI report card and is unrelated to `maya.widget.envelope/1`.

Consequently **every row of §A1 is a prerequisite, not a regression**, and every §3 and §4 rule marked `[TO BUILD]` describes a requirement, never a capability (§0.19 item 14).

---

## A1 The prerequisites register

Columns: **Component** — the named artefact. **Depends on it** — the contract rules that become inoperative without it. **Status** — `[ABSENT]` (nothing exists), `[PARTIAL]` (something exists but does not do the work the rule names), `[UNENFORCEABLE-TODAY]` (buildable in principle, but no substrate exists in which the mechanism can run). **Package** — the package of the 16 (K1–K16, 6 waves) that must build it.

### A1.1 The gateway, its two routes, and the stores

| # | Component | Depends on it | Status | Package |
|---|---|---|---|---|
| **P-01** | **`IntentGateway`** — Step 0 plus Gates 1–13, one ordered pipeline, and the programme's only two new routes `POST /api/widgets/resolve`, `POST /api/widgets/intent` | FR-1, FR-2, FR-3, FR-4, FR-5, FR-7, FR-9, FR-13; §3.9 R3.9.1; every `EP-INGRESS` rule in the contract | `[ABSENT]` — `api/widgets` 0 hits; `IntentGateway` 0 hits | **K3** (wave 2) |
| **P-02** | **`IntentRecord`** — the stored record and its type, including `principal_proof_hash`, `capability`, `effect`, `verification_floor`, `widget_kind`, `frozen_nouns` | Gate 1 single-use consumption, Gate 3 principal binding, Gate 7's COMMIT check, §3.7, §4.2's frozen receipt, §0.4 F15's noun-resolver input set, idempotency of a tap, "who pressed what" audit | `[ABSENT]` — 0 hits | **K3** (wave 2) |
| **P-03** | **Timeline store** — conversation turns, envelopes, bodies, minted text, `spoken_transcript`, rendered utterances | §4.2's week-later receipt; §4.4.2 retention and per-kind body drop; §4.4.1 RT3(b)'s history-blind replay; §4.7 V5's "stored exactly once"; `EP-FETCH` timeline read | `[ABSENT]` — 0 hits | **K3** (wave 2) |
| **P-04** | **Receipt store** — append-only, written only by the Action Engine and the approval owner, no FK into the timeline store | §4.2 FR2 (`TerminalLine.outcome === 'CONFIRMED' ⟺ action_receipt_ref !== null`), invoked by §4.3 DR2; §4.4.1 RT1; §4.4.3's tombstone log; FR-12 | `[ABSENT]` — 0 hits. `C9WorkReceipt` is a different artefact | **K3** creates it; **K7/K9/K11/K12** write it; **K12** proves the split by erasure replay |
| **P-05** | **Emission / receipt store** — `maya.render.receipt/1` (`RenderReceipt`), `DeliveryRecord`, `Lifecycle.delivery` per emission | §4.1's lifecycle; §4.3's delivery bookkeeping; §4.5.4 step 8's degraded-envelope receipt; §4.2's historisation job keyed by `intent_token_hash`; `control.widget.dismiss`'s write target | `[ABSENT]` — `RenderReceipt` 0, `ChannelProfile` 0 | **K3** (store) + **K6** (per-carrier receipt, wave 2) |
| **P-06** | **Free-input ledger** — every open-domain emission with its `justification`, tenant and capability, written in the mint transaction | §2 K14; §3.6 R3.6.6 — the two counters are one counter, keyed on field kind; INV-23; §2.6.17 FORM.7 | `[ABSENT]` — `free_input_justification` 0 hits | **K3** (wave 2) |
| **P-07** | **Capability-gap ledger** — the 8 gap keys as first-class entries with `owner: NONE`, plus the gaps §0.7 F37 and §4.3 DR4 add | §1.6.7 P2; §1.3 C5; §2 K20; §2.6.14 LIMIT.1; §2.6.18 CONSENT.5; §2.6.20 PAY.4; §2.6.22 ARTIFACT.4; **§A2's entire mechanism** | `[ABSENT]` — `capability_gap_ref` 0 hits | **K1** (wave 1 — the only wave executable under this cycle's fence) |
| **P-08** | **Server-owned draft store** — the canonical draft owner's draft, named by `confirmation_of_ref.kind === 'draft'` | §0.12 F69's key-space rule (the draft owner names the Action Engine key); §0.13 F74; §3.2's effect table ("draft store only"); FR-6b, FR-7 | `[ABSENT]` — 0 hits | **K3** (store) + **K7** (booking draft owner, wave 3) |
| **P-09** | **Consent-register read projection** — the `CONSENT_REGISTER` owner class resolving to a registered `consent.*` **read** capability, and `register_ref` as an append-only handle | `CONSENT_STATE` emittability (§2.7, §2 K23); §2.6.18 CONSENT.1–6; the `scope_text` / `change_effect_text` body | `[PARTIAL]` — the canonical facts **do** exist: `prisma/schema.prisma:1593 model ClientConsentFact`, `:1573-1574 privacyConsentAt/marketingConsentAt`, `:2584 MarketingConsentEvidence`, and a reader `effectiveClientConsents` (`src/crm/client-effective-consent.ts:53`, used at `client-profile-read.service.ts:177`). What is absent is a **registered read key**: `MAYA_AI_TOOL_CATALOG` has 47 names, **zero** containing `consent`, `identity` or `privacy`, so `ownerClassKeys(CONSENT_STATE) ∩ REGISTERED_KEYS = ∅` and K20 derives `emittable = false` | **K12** (wave 5) |
| **P-10** | **`WIDGET_CAPABILITY_POLICY`** (`min_verification`, `consent_class` and `dispatch_is_synchronous` per key, total over `C9_CAPABILITIES`'s 56 keys **and over those only** — §0.7 F28; AE-CAP totality is carried instead by `AE_WIDGET_COMMIT_ALLOWLIST` ∪ `AE_CAPABILITY_GAP_LEDGER` under F31) and **`CONTROL_REGISTRY`** (closed at three keys) | §0.8 F45 `subjectFloor`; §0.8 F45's totality and monotonicity; §0.8 F50's fail-closed default; §0.8 F54 Gate 6 for `CONTROL`; §0.14 F80's `consent_class` fence; FR-4, FR-6d | `[ABSENT]` — both 0 hits | **K2** (the tables, wave 1) over **K1**'s canon |

### A1.2 The derivations, and the floor that cannot be reached

| # | Component | Depends on it | Status | Package |
|---|---|---|---|---|
| **P-11** | **`VerificationLevel` ladder and `verificationFloor()`** — the five rungs (§0.8 F39) and the arity-2 total derivation of §0.8 F43 | FR-4 (its one mechanism); Gate 5; §0.8 F52's divergence refusal; §0.8 F53's shortfall branch; every `verification_floor` in every intent | `[ABSENT]` — **all five rung tokens are 0 hits repo-wide**: `ANONYMOUS`, `CHANNEL_IDENTITY`, `BOUND_CLIENT`, `SESSION_VERIFIED`, `STEP_UP_VERIFIED`; `verification_level` / `verificationLevel` 0 | **K2** (ladder types, wave 1) + **K4** (runtime derivation, wave 2) |
| **P-12** | **`STEP_UP_VERIFIED` reachability** — a re-authentication event type that can raise a live session's derived level | Every capability whose derived floor is `STEP_UP_VERIFIED`: **every `restricted` risk tier** (`RISK_FLOOR['restricted'] = STEP_UP_VERIFIED`, §0.8 F44) **and every unmapped key** under §0.8 F50's fail-closed default. §1.7 K6 | `[ABSENT]` — and absent at the substrate, not merely unbuilt: repo-wide `stepUp` 0, `step_up` 0, `step-up` 0, `re-auth` 0, `mfa`/`MFA` 0, `otp`/`OTP` 0, `twoFactor` 0, and no elevated/`sudo`-mode session concept anywhere in `src/auth/` (24 files, all single-factor session, rate-limit and retention services). The one `reauth` hit is unrelated prose in `measurement/measurement.wave2.architecture.spec.ts:14` | **No package.** This is outside the 16. It is an authentication-subsystem capability, and until it exists **every `restricted` capability and every unmapped key is permanently withheld** — fail-closed and correct, but a hole in the product, not a property of the design (§0.21 residual 5) |
| **P-13** | **CHART read facade** — a widget-layer read facade returning `rows_digest` and `series_digest` **alongside** the C7/C8 rows, computing `sha256(stableActionJson(rows))` and `…(series)` on the read path, outside the projector | FR-10 (its one mechanism); §2.6.9 CHART.1; `ChartBody.rows_digest` / `.series_digest` are required non-nullable members, so without them `composeEnvelope` cannot build the body at `EP-COMPOSE`; **`CHART` is therefore not emittable** | `[ABSENT]` — `rows_digest`/`rowsDigest`/`series_digest`/`seriesDigest` **0 hits**. The read services exist and return no digest: `MeasurementReadService` (`src/measurement/measurement.read.service.ts:50`, C9 key `c7.measurement.read`), `C8ReadService` (`src/valuation/c8.read`, C9 key `c8.result.read`); `stableActionJson` exists (`src/action-engine/action-engine.identity.ts:54`) but is used only inside the Action Engine | **K10** (wave 4). *This facade is a new field on a widget-layer read facade, not a change to any C9 contract (§0.1 F3).* |

**A1.2.1 — `CHART` re-enters the emittable set when P-13 ships, and not before.** §2.7's readiness table states today's set — **16 emittable, `ARTIFACT` narrowly emittable, 5 blocked** — and `emittable` is derived at `EP-REGISTRY-LOAD` by K20, never asserted in prose, so the set follows the facade automatically on the day it ships. This note is a reader's pointer, not a ruling: it resolves no conflict, because the clause it used to adjudicate against was retired with the errata layer.

### A1.3 Routes and control handlers

| # | Component | Depends on it | Status | Package |
|---|---|---|---|---|
| **P-14** | **`shell.pay`** — the shell route carrying one opaque server-minted `session_ref` matching `/^[A-Za-z0-9_-]{8,64}$/` | §2.6.20 PAY.2's return path; `PAYMENT_HANDOFF` has **no return path at all** without it; §0.12 F71; FR-8 (the shape that has no member able to hold a URL) | `[ABSENT]` — `shell.pay` 0 hits in backend; 0 hits in `сайт и приложение/app.html`; `session_ref` 0 hits | **K5** (route registry, wave 2) + **K9** (session minting, wave 3) |
| **P-15** | **`shell.file`** — the shell route carrying one opaque server-minted `artifact_ref` | §2.6.22 ARTIFACT.1 — `ARTIFACT` has **no delivery** without it; ARTIFACT.2's per-principal proof-hash re-check at `EP-FETCH`; §0.12 F71 | `[ABSENT]` — `shell.file` 0, `artifact_ref` 0 | **K5** (route registry) + **K10** (owner-report artefacts, wave 4) |
| — | *(context)* the five base routes `shell.root`, `shell.account`, `shell.connections`, `shell.privacy`, `shell.notifications` | `targetFloor('s')`; every `HANDOFF`; §3.5 R3.5.4 ("a handoff whose target has no live surface is not emitted") | `[ABSENT]` — `shell.root` 0, `shell.account` 0, `route_key`/`routeKey` 0 in `app.html`. The shipping frontend has an `S` router map (`сайт и приложение/app.html:39981`) keyed on its own screen names, which is not a `route_key` registry | **K5** (wave 2) |
| **P-16** | **`control.widget.dismiss`** — the handler that sets `Lifecycle.delivery` on one emission, `CONTROL_FLOOR = ANONYMOUS` | §0.9 F60's escape verb on **every non-`RICH_INTERACTIVE` tier** — i.e. Telegram, web push, SMS, e-mail, voice. Without it the mandatory escape is unreachable off the PWA, contradicting §3.12.6, §4.7 V9, §4.8 A-5 | `[ABSENT]` — 0 hits | **K3** (handler, wave 2) + **K6** (the `EP-FIT` branch that selects it, wave 2) |
| **P-17** | **`control.delivery.resolve`** — the handler that resolves one `dedupe_key` across channels, `CONTROL_FLOOR = BOUND_CLIENT` | §0.7 F27; cross-channel duplicate suppression; §4.9's proactive `dedupe_key` | `[ABSENT]` — 0 hits | **K13** (wave 5 — "0 duplicate deliveries across push, chat and the Telegram mirror over a 14-day window") |

*`control.run.cancel` is the only one of the three control keys whose owner endpoint exists today: `src/orchestration/c9.controller.ts:92`, write-once under `cancelKeyHash`, principal- and tenant-locked, `c9.store.ts:588-615`. The key itself is not a C9 canon member, by design (§0.7 F27).*

### A1.4 Fields

| # | Component | Depends on it | Status | Package |
|---|---|---|---|---|
| **P-18** | **`produced_by_intent_token_hash: string \| null`** on `IntentRecord`, classified `AUDIT_RETAINED` | §0.13 F74's **guard against the obvious bypass** — a `COMMIT` whose `confirmation_of_ref.kind !== 'draft'` is mintable only when this field is non-null and names a consumed `REFINE`/`DRAFT` record whose capability is the canonical owner's own propose key. Without it, populating `confirmation_of_ref` with a bare `appointment_ref` mints a cancel or reschedule `COMMIT` with no canonical confirmation behind it. **FR-6b and FR-7 both name it.** Also §0.4 F15's noun-resolver input set and §0.4 F16's classification | `[ABSENT]` — `produced_by_intent_token_hash` / `producedByIntentTokenHash` **0 hits**; `confirmation_of_ref` likewise | **K3** (the field, wave 2) + **K7** (the static-analysis proof that no other minting path exists, wave 3) |

### A1.5 Unenforceable today — no substrate for the mechanism

| # | Component | Depends on it | Status | Package |
|---|---|---|---|---|
| **P-19** | **Renderer sandboxing / import-graph allowlist** — renderer modules receive no token-bearing props and import no `fetch`/`XHR`/`WebSocket`/storage/provider SDK | §4.2 FR1; §3.16.4; §0.16 F89's FR-1 row and its build import test; **and, through NT1, every §4 clause whose evaluation point resolves to `EP-BUILD`** — A-1's renderer conformance suite, A-4's visual regression matrix, A-9's `prefers-reduced-motion` snapshots, A-10's viewport matrix, A-11, A-12, A-15, A-17, A-18, A-21 (gate G10), §4.5.4 CH3, C6, V7, V8, V10, V11, NT2's G6 lint, NT8's G12 parser check, and FR-11's renderer conformance suite | `[UNENFORCEABLE-TODAY]` — the shipping frontend is a hand-edited single file: `сайт и приложение/app.html` is **42,453 lines / 2.70 MB**, with **no sources, no build script and no bundler**. The only `package.json` anywhere in either tree outside `node_modules` is `maya-saas-backend/package.json`. `app-aurora.html` and `build.js` do not exist. There is no import graph to allowlist, and no lint stage in which to run one | **K5** ("exactly one shell source, emitted once", wave 2) must create the build; **K15** (wave 6) proves the bundle disposition. Until a build exists these are **discouraged, not proven** — Section 0 names three dependents; the true dependent set is the ~two dozen listed at left |
| **P-20** | **Gate 10 promotion criterion** — the rule that converts the divergence audit from shadow to refusal | "Three front doors, one function" — the guarantee that a tap, a typed sentence and a spoken utterance resolve to the *same* capability. Gate 10 runs the deterministic text router over the lowered utterance and compares its resolved capability to `IntentRecord.capability` | `[ABSENT]` **twice over**: the gate itself is `[TO BUILD]` (P-01), *and* no promotion criterion is defined anywhere in the contract. §3.16.5 states it plainly — divergence is "audited, not refused, until a promotion criterion is set", so "three front doors, one function" is **measured, not enforced** | **K3** builds the gate (wave 2); **K14** exercises it across the ~45 Telegram commands (wave 6). **The criterion itself is an owner decision, not a package deliverable** — it must be set before Gate 10 may refuse |

### A1.6 Acts with no canonical owner

| # | Component | Depends on it | Status | Package |
|---|---|---|---|---|
| **P-21** | **`GAP-ATTENDANCE-CONFIRM`** — a canonical owner that records *that a client acknowledged an upcoming appointment* | §4.3 DR4; §4.9 PR5c; §3.16.6. Until it exists, an `appointment_reminder` emission carries a `Limitation` with `capability_gap_ref: 'GAP-ATTENDANCE-CONFIRM'` and intents of effect `NONE`, `NAVIGATE` or `HANDOFF` only. **A "Приду" control that writes nothing is not emitted**, and «клиент подтвердил» is not a claim this system may make in any surface | `[ABSENT]` — `GAP-ATTENDANCE` 0 hits; no attendance-acknowledgement owner exists. `crm.appointment.attendance.v1` is an Action Engine capability for *staff-recorded* attendance (it carries `targetKind: 'appointment'`, §0.7 F32) — it is not a client acknowledgement and must not be presented as one | **K13** (wave 5) surfaces reminders; the owner registration is a canonical-owner change **outside the widget layer** |
| **P-22** | **`NEVER_CHAT_ACTUATED` — the eight reserved names** | FR-6a (its one mechanism, `subjectCapability(i) ∈ NEVER_CHAT_ACTUATED ⟹ HANDOFF ∧ target.class === 's' ∧ floor ≥ SESSION_VERIFIED`); §3.5 R3.5.1; §0.7 F37's registration gate | `[ABSENT]` as keys — **all eight are 0 hits**, and `NEVER_CHAT_ACTUATED` itself is 0 hits. FR-6a therefore holds today **fail-closed but vacuously**. The per-act owner position is set out below and **corrects §0.21 residual 4** | **K12** (wave 5) |

**A1.6.1 — the eight acts, verified individually.** §0.21 residual 4 formerly stated that "six of the eight `NEVER_CHAT_ACTUATED` acts have no canonical owner". That is an overcount. Verified per act:

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

**Corrected figure: three acts with no owner at all, one with an owner unreachable from the widget source type, four with a reachable registered owner under a different name.** That residual's operative consequence is unchanged — none of the eight reserved names is a registry member — but its *stake* is larger than stated, and this must be carried into §0.7 F37's registration gate:

> **A1.6.2 — NORMATIVE.** `package5.wave3.record-client-consent.execute.v1` is registered today with `policyDecision: ALLOW`, `approvalRequirement: 'NONE'`, `targetKind: 'client_consent'` and `allowedSourceTypes` including `authenticated_request`. It is therefore the *reachable* canonical owner of all four consent acts, under a name none of the eight reserved names matches. **The fence that keeps it out of the widget layer is already declared, and it is not a policy row.** §0.7 F32's `CONSENT(cap)` — a two-disjunct predicate, restated nowhere — holds for this key on its `targetKind` disjunct; §0.7 F31's start-up assertion set carries `row ⇒ CONSENT(cap) ∨ IDENTITY(cap) ⇒ fail`, so the key can **never** hold a row in `AE_WIDGET_COMMIT_ALLOWLIST`; and §0.13 F72's `requiredConfirmationKind` is a lookup with **no default branch**, so an un-allowlisted key resolves to no confirmation kind at all and `refuseMint('capability_not_allowlisted')` fires. No `COMMIT` naming it is mintable onto `SETTINGS_DRAFT` or onto any other kind. **No `WIDGET_CAPABILITY_POLICY` row is required or permitted for it**: §0.7 F28 makes that table total over C9-CAP's 56 rows *and over those only*, and this is an AE-CAP key. *Mechanism:* F31's `EP-REGISTRY-LOAD` veto, F72's `EP-MINT` refusal, and Gate 7's re-check. *Evaluation points:* `EP-REGISTRY-LOAD`, `EP-MINT`, `EP-INGRESS` Gate 7. This is what FR-6a holding **fail-closed and non-vacuously** looks like once the owner is named: the act has a reachable owner, and the widget layer still cannot reach it. *(§2.7's own `[NON-NORMATIVE]` note anticipates the other half: the marketing-consent change path can be routed to that owner from a shell surface — a class-`s` `HANDOFF`, which confers nothing — well before any `consent.*` read key is registered.)*

---

### A1.7 The contract's own machinery — P-23 … P-32

§0.18 F92 declares **thirty-two** prerequisite rows; F93 names the thirteen this contract's own machinery depends on, and §A1.1–§A1.7 together carry all thirty-two. §A1.1–§A1.6 detail the
twenty-two that are components of the product. The remaining ten are components of **this
contract's own enforcement machinery** — the registries, assertions and ledgers without which
the contract's rules are statements rather than fences. They were cited by `NORMATIVE-PENDING`
statuses throughout §§0–4 with no row to resolve them against; the rows are here.

Every one is `[ABSENT]`: the widget layer does not exist in any form (§A0.5).

| # | Component | Depends on it | Package |
|---|---|---|---|
| **P-23** | **`AE_WIDGET_COMMIT_ALLOWLIST` + `AE_CAPABILITY_GAP_LEDGER`, with the start-up assertion set** — `row XOR gap` total over the 226 AE-CAP rows, the `BOOKING`/`CONSENT`/`IDENTITY`/`MONEY` vetoes, and the pairing check | §0.7 F29–F37; §0.13 F72's lookup; §3.10's disposition table; FR-6a, FR-6b, FR-6d | **K2** (tables) + **K4** (assertions) |
| **P-24** | **`CapabilityRef` and the per-effect key-space rule** — the discriminated union, `capKey(ref)`, and F21's source test over the members it enumerates | §0.6 F21; §0.12; §3.2 R3.2.2; every `subjectFloor` dispatch | **K2** (wave 1) |
| **P-25** | **`AE_PROPOSE_PAIRING`** — the `ae` ⇄ `propose` pairing rows the COMMIT guard compares against | §0.7 F31; §0.13 F74's two-row table; §3.10.2 | **K2** (table) + **K7** (booking rows) |
| **P-26** | **Gate 6's key-space dispatch** — the four-branch dispatch on `subjectCapability(record).space`, scoped by effect | §0.8 F54; §3.9 «Gate 6 in full»; FR-6a … FR-6f | **K4** (wave 2) |
| **P-27** | **The `controlledFixtureMode === false` build assertion** — without it `APPROVER_ROLES` admits six roles where the canonical policy names two | §0.16 F90(4), which bounds the FR-6f row; §3.11 R3.11.6 | **K3** (wave 2) |
| **P-28** | **The widget `ActionSourceType` discipline** — the widget layer's own source type, and the assertion that a widget-minted request never claims `legacy_bridge` or `synthetic_shadow` | §0.7's `allowedSourceTypes` conditions; Gate 14; FR-3 | **K4** (wave 2) |
| **P-29** | **`MECHANISM_GAP_LEDGER`** — the ledger itself, `MG-P01` … `MG-P32`, total over these thirty-two rows, from which every status count is printed at build | §0.18 F92; §A2's entire mechanism; §A5's refusal to transcribe a tally | **K1** (wave 1) |
| **P-30** | **The gateway's record fields and the spoken-readback path** — `IntentRecord`'s `priority`, `widget_kind`, `body_hash`, `selection_domain`, `c9_domain` and `produced_by_intent_token_hash`, plus `ReadbackAck` and Gate 8-R | §3.7's declaration; Gate 5's recompute; Gate 8-R; §4.7 V4 | **K3** (wave 2) + **K6** (voice) |
| **P-31** | **`A11yBlock.accessible_names`** — the total, closed name map keyed through `refKey(ref)`, and `nameSourceOf`'s seven branches | §4.8 A-0, A-2, A-3; §0.11 F67–F68 | **K5** (wave 2) |
| **P-32** | **The moment, notification-consent and template catalogues** — `MOMENT_REGISTRY` (twelve rows), `NOTIFICATION_CONSENT_REGISTRY`, `MOMENT_TEMPLATES`, and the `EP-REGISTRY-LOAD` resolution chain over them | §4.9.3 PR3; `ProactiveProvenance`; every proactive emission | **K13** (wave 5) |

---

## A2 The NORMATIVE-PENDING rule

**A2.1 — the definition.**

> A rule of this contract whose **named enforcing mechanism** is marked `[ABSENT]` or `[UNENFORCEABLE-TODAY]` in §A1 is **NORMATIVE-PENDING**. It is **binding on the implementation** — it is not advisory, not aspirational, and may not be softened, renegotiated or dropped when the package that owes the mechanism is scheduled. Until the mechanism ships, **the capability that rule guards MUST emit `capability_gap_ref` and MUST emit no actuating control.**

**A2.2 — what "no actuating control" means, exactly.** The envelope carries a `Limitation` with a non-null `capability_gap_ref`, `remedy_intents` empty, and **no intent of effect `DRAFT`, `REQUEST_APPROVAL` or `COMMIT`**. Intents of effect `NONE`, `NAVIGATE`, `REFINE`, `HANDOFF` and the mandatory `CONTROL` escape remain permitted, because none of them actuates. The text equivalent carries the `gap` sentence in `sentence_order`, stating plainly that nothing in the product can do this yet. No renderer may synthesise an affordance for it (§2 K20).

**A2.3 — the enforcing mechanism is the existing capability-gap machinery; nothing new is invented.** Four rules already in the contract compose into the enforcement, and NORMATIVE-PENDING simply declares their input:

| Rule | What it does | Evaluation point |
|---|---|---|
| **§2 K20** — `emittable(kind) = ∃ k ∈ ownerClassKeys(kind) : k ∈ REGISTERED_KEYS` | `composeEnvelope` **refuses** a kind whose `emittable` is false and emits a `LIMITATION` carrying the `capability_gap_ref` mapped from that owner class, with no intent. `emittable` is **derived, never authored** | `EP-REGISTRY-LOAD`, then `EP-COMPOSE` on every emission |
| **§1.6.7 P2** — the /unsubscribe clause | If a remedy has no canonical owner, the envelope MUST carry a `Limitation` with a non-null `capability_gap_ref` and MUST NOT carry an intent that promises the remedy | `EP-MINT` |
| **§1.3 C5** — the remedy-or-gap rule | A `Cell` in state `NOT_MEASURED`/`UNAVAILABLE` either names a real intent present in this envelope or forces `next_intent_ref: null` **and** a non-null `capability_gap_ref`. This forces the gap onto the record from the *Cell* side, so it cannot be omitted by an emitter that simply declines to mint an intent | `EP-MINT` |
| **§2.6.14 LIMIT.1** — no button for a capability with no owner | When `capability_gap_ref` is non-null, `remedy_intents` must be empty and the text must carry the gap sentence | `EP-MINT` |

**A2.4 — the evaluation point.** NORMATIVE-PENDING is evaluated at **`EP-REGISTRY-LOAD`, and again at `EP-COMPOSE` on every emission.** At `EP-REGISTRY-LOAD` the capability-gap ledger (P-07) is read and every `[ABSENT]` mechanism named in §A1 is bound to its gap key; a §A1 row with no gap key fails the start-up assertion and the process does not start. At `EP-COMPOSE` K20's derivation runs per emission. `EP-MINT` is the backstop: P2, C5 and LIMIT.1 refuse an envelope that reached the minter with an actuating intent and a non-null gap ref. **Three points, all fail-closed, none of them the renderer.**

**A2.5 — why this closes the finding rather than restating it.** An unproven claim is a sentence asserting that the running system does something, with no mechanism a reader can check. A NORMATIVE-PENDING rule asserts something different and checkable: *this rule is binding; its mechanism is named; its mechanism is absent; here is the gap key it is bound to; here is the start-up assertion that fails if the binding is missing; and here is the emission the system produces instead.* The claim's truth value is no longer "unknown" — it is **"pending, and fail-closed while pending"**, which is a property the build can test. `[ABSENT]` is therefore a declaration, not an excuse.

**A2.6 — what NORMATIVE-PENDING does NOT license.**
1. It does not license emitting the control anyway behind a flag, a pilot, an allowlist or a "temporary" exception. There is no such branch.
2. It does not license softening the rule when the package ships late. The rule's text is fixed now; only its status changes.
3. It does not license a *partial* mechanism. §A1's `[PARTIAL]` status means the existing artefact does **not** do the work the rule names; a `[PARTIAL]` row is NORMATIVE-PENDING on identical terms to `[ABSENT]`, and the existing artefact may not be cited as the rule's mechanism (see P-09).
4. It does not license a renderer or a channel adapter deciding a mechanism is "close enough". NORMATIVE-PENDING is evaluated server-side only.

**A2.7 — discharge.** A row leaves NORMATIVE-PENDING when, **and only when**, (a) the named mechanism exists at a stated path, (b) `EP-BUILD` carries a test that fails if it is removed, and (c) the corresponding gap key is withdrawn from the capability-gap ledger in the same commit. Withdrawing the gap key without (a) and (b) is the failure mode this annex exists to prevent, and the ledger is versioned with the contract so that a withdrawal is a reviewable diff (§4.4.3 RT8).

**A2.8 — the marker.** §4 carries no `[EXISTS]`/`[TO BUILD]` vocabulary at all — §3 defines the two statuses and marks every rule, but §4's preamble marks only its **stores** as future and says nothing about its ~two dozen renderer-side and CI mechanisms, so §0.19 item 14's downgrade (which keys on the literal "[TO BUILD]") cannot reach them. **Ruling:** every §4 mechanism whose evaluation point resolves through §0.8 to `EP-BUILD` or `EP-RENDER` is hereby marked **NORMATIVE-PENDING on P-19**, and no such sentence describes the running system. This is the gap §0.21 residual 6 discloses; §A1 P-19 enumerates the dependents that residual does not.

---

## A3 The schema-scope ruling

The owner's hard constraint reads: **"The contract must require NO C9 contract change and NO schema change."** The C9 half holds and is verified. The schema half needs an honest, three-part answer rather than a yes or a no.

**A3.1 — THIS ARCHITECTURE CYCLE makes 0 schema changes. This is a fact, and it is already true.**

Verified: the canonical repository's working tree at branch `codex/maya-identity-consent-20260913` carries exactly **one** modified file — `docs/rebuild/MAYA-CHAT-FIRST-UX-OWNER-DECISIONS.md`, a documentation file. **Zero** changes to `maya-saas-backend/prisma/schema.prisma`; **zero** new entries under `prisma/migrations` (97, unchanged, latest `20260913160000_chapter9_orchestration_foundation`). The primary working tree carries no Prisma or migration change either. §3's and §4's own scope discipline states it: *"Architecture only. Runtime changes: 0. Schema changes: 0. Migrations: 0."* **This is not a promise about the future; it is a verified property of the present.**

The C9 half is likewise verified and is not in question: §0.7 F36 deletes every capability key §§1–4 invented (`orchestration.run.read`, `orchestration.run.cancel`, `booking.reschedule.propose` — 0 hits each); the `booking_effect` registry flag is void (0 hits); §0.13 F72 and §0.7 F33 derive the confirmation kind from **existing** `RegisteredActionCapabilityV1` fields (`targetKind`, `riskFacets`, `policyDecision`); the three control keys are widget-layer-only by design; and FR-16 asserts `C9_REGISTRY_HASH` (`src/orchestration/c9.registry.ts:177`) unchanged at `EP-BUILD`. `C9_CAPABILITIES` = 47 catalogue names + 9 extras = **56 keys**, unchanged.

**A3.2 — the IMPLEMENTATION requires additive widget-layer stores. They touch no canonical business table and hold no business state.**

Eight stores are commissioned — P-02 through P-09 of §A1 — of which six are named in owner decision **D12** (`IntentRecord`, timeline store, receipt store, emission/receipt store, free-input ledger, consent-ledger projection) and two more in §A1.1 (P-07 the capability-gap ledger, P-08 the server-owned draft store). Their containment is already a rule of this contract, in three independent places:

- **§1.1.1 E4** — no canonical table may hold a foreign key to `widget_id`. *(Retained as a cheap complement; §0.19 item 12 correctly notes an FK-absence assertion does not exclude an untyped string column.)*
- **§4.4.1 RT1** — the receipt store has **no foreign key into the timeline store**, is written only by the Action Engine and the approval owner, and a schema test asserts no column in it references a `widget_id`, a turn id or a conversation id.
- **§4.4.1 RT3(b)** — the **history-blind replay test**: the canonical read and action paths are exercised with the timeline store made unreadable; any business read that fails, degrades, or returns a different value is a violation. This is the load-bearing test, and it is a stronger property than FK absence.

Plus §0.4 F15's build-time erasure-reachability test: for every field read on any path to Gate 11, Gate 13, Gate 14 or an owner decision route, the field's `ErasureClass` must be `AUDIT_RETAINED`. The direction of dependency is enforced in both directions — no canonical row points at a widget row, and no canonical decision reads a widget-layer field that erasure may remove.

**A3.3 — the ruling, stated as it is.**

> **This is not a change to a canonical business schema. It IS new storage.**
>
> The constraint as the owner wrote it — "NO schema change" — is **not met** by the literal reading, and §3.16.2's narrowing to "no change to any canonical business schema" is a narrowing, recorded here rather than performed silently (§A3). Under the narrow reading the constraint holds completely and is machine-checked. Under the literal reading it does not hold, because wave 1 introduces additive tables and migrations. **The difference is real and the owner must know it before the first pull request, not discover it in one.**
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

**What the contract does and does not do:** §0.15 F84 **deletes** the four-eyes claim rather than softening it, and §0.15 F85 states the true, weaker guarantee — **role-gated approval, not separation of duties**. §0.14 F82 keeps `loyalty.internal.adjust` off every chat-reachable confirmation body. **That is a containment, not a fix**: it reduces chat reachability and changes nothing about `canDecide`. The owner must either add a separation-of-duties comparison for `approvalPolicy: 'owner'`, or accept role-gated approval as the product's stated control. This contract does not choose, and states nothing stronger than §0.15 F85 until one is chosen.

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

§A1 enumerates the prerequisite components P-01 … P-32 — the twenty-two product components of §A1.1–§A1.6 and the ten machinery components of §A1.7. **Their per-status counts are not transcribed here.** F92 requires the build status of every mechanism this contract names to be printed from `MECHANISM_GAP_LEDGER` at `EP-BUILD`, and a tally written into prose is a second record of the same thing that drifts the moment one row changes — which is what happened to the count that stood here. §A2 binds each of them to the existing capability-gap machinery with a fail-closed default evaluated at `EP-REGISTRY-LOAD`, `EP-COMPOSE` and `EP-MINT`. §A3 states the schema position without narrowing it silently and hands the decision to the owner as D12. §A4 records five repository defects that the contract cannot reach and does not claim to.

Against the owner's bar, and for the class of finding this annex addresses: **an unmarked claim about an unbuilt mechanism is an unproven claim; a marked one, bound to a gap key and a refusal, is a declared prerequisite.** Every such claim in this contract is now marked. `[NON-NORMATIVE]` The residual findings this annex does not close are the ones §0.16 F90 and §0.21 carry, in the wording those clauses use; this statement does not enumerate them a second time. What follows was written against an earlier body and is retained only as the reason the annex exists. The two findings this annex does **not** close, because they are not in its scope, are the two conferral-fence falsifications (FR-6c's bulk-send ceiling and FR-6d's `'financial'`-token classifier) and the FR-3 authority-gate gap over the Action Engine key space — those are defects in Section 0's derivations, not missing components, and they require an edit to Section 0 rather than a status marker. §A1.6.2 is the one place where this annex adds a normative fence of its own, because a registration gate with four live keys behind it is a materially different gate from one with none.

---

# Annex B — errata history

`[NON-NORMATIVE]` **This annex is evidence, not rule.** Every correction below has been
folded into the canonical body: the body states the final semantics in one place, and no
runtime or normative reading depends on the sequence of these corrections. Annex B exists so
that a reader can ask *what was wrong and what replaced it* — a question the body deliberately
no longer answers, because a document that narrates its own history invites the reader to
reconstruct rules from a chain of amendments instead of reading the rule.

**Why the chain was retired.** Twenty-four layers of errata over a 6,900-line body had to stay
mutually consistent by prose alone. Across eleven verification rounds the rate at which repairs
introduced fresh defects did not fall — one round ruled that an amendment left inside a code
comment is a defect and, in the same round, left one inside a code comment. The layering was
the defect generator, not any single rule.

## Section 0 (E-1 … E-31)

| # | Where | What it said | What replaced it |
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
| E-20 | §1.5 M6 vs §2.6.9 CHART.1 | `rows_digest` recomputed by the projector vs `rows_digest`/`series_digest` **returned by the read service** | **§2's stronger form governs, and its dependency is stated honestly.** The C7/C8 read services do not return digests today; returning them is a **new field on a widget-layer read facade, not a change to any C9 contract** — the facade computes `sha256(stableActionJson(rows))` and `…(series)` on the read path, outside the projector, and the projector cannot reproduce either. Until that facade ships, `CHART` is not emittable. §1.5 M6's projector-side recomputation is retained as defence in depth, `[NON-NORMATIVE]` as a standalone guarantee (it proves only that the body matches the rows the projec |
| E-21 | §2 K19 vs §4.4.2 | two per-kind retention tables; no default for `pii_ceiling: 'inherited'` | **§4.4.2 governs**, with §4.4.2 RT4's minimum rule. `'inherited'` resolves at `EP-COMPOSE` to the pii class actually present in the composed body; where nothing resolves, `client_identified` — the shortest window. Fail-closed. |
| E-22 | §3.2.3, §3.14 FR-2 | `Lifecycle.resolution` | **`Lifecycle.delivery: DeliveryRecord`** (§4.1, §4.3) is the sole name; `resolution` is a deprecated alias. |
| E-23 | §3.14 FR-2 | "an emission lint forbids any text equivalent that renders `resolution` as a business assertion" | **Replaced by a decidable predicate:** no `WIDGET_PHRASES` entry and no `NARRATIVE_TEMPLATES` entry may reference any member of `DeliveryRecord`, and the closed delivery-template set is linted for the business predicates §4.3 DR1 enumerates. *Evaluation point:* `EP-BUILD`. |
| E-24 | §2.6.11 STRATEGY.2 | `reversible: Cell<boolean>` "copied from the agent result" | **Corrected.** The only canonical upstream value is the literal `c9Enum('SOURCE_DEFINED')` (`c9.contract.ts:378`), so `reversible` is `NOT_MEASURED` with `reason_code: 'NOT_COLLECTED'` whenever the source is that literal — which is always, today. §3.6.1 R3.6.1 governs; no rule may read `reversible.value` without requiring `state === 'KNOWN'`. |
| E-25 | §2.6.11 | `expected_effect: Measure` | **`Measure \ |
| E-26 | §2.6.11 owner line | "the alternative shape is reused verbatim from the C9 contract" | **VOID** (verified false: `c9Alternative`, `c9.contract.ts:271–290`, carries none of these fields). The correct source is `AgentResult@1.proposed_action_intents[]` — `risk`, `approval`, `reversibility`, `audience_size`, `rationale`. Downgraded and corrected. |
| E-27 | §2.6.20 PAY.4 | `commit_enabled` | **`commit_allowed`** (§2.2) is the sole name, derived at `EP-REGISTRY-LOAD` from `permitted_effects` and the owner-class resolution. |
| E-28 | §2.6.4 | `freshness_class: 'live'` presented as a `KindRule` field | `freshness_class` is a member of `Lifecycle` (§4.1), derived at `EP-MINT` from the kind's `expires_at_ceiling_s` and the capability TTL. §2.6.4's mention is read as the mandatory derived value for that kind. |
| E-29 | §1.1.1 table vs §1.1.4 | `correlation` classed `E (ids) / M (trace_id)`; `agent_id` marked `C`, but `body_hash` covers `provenance`, not `correlation` | **`agent_id` is class `D`** — derived by the minter from the run's registered agent — not `C`. The `C` class requires a digest, and none covers `correlation`. |
| E-30 | §3.16.2 | "no change to any canonical business schema" (narrowing the owner's "NO schema change") | **The narrowing is recorded, not hidden.** §0.18 residual 1. |
| E-31 | §2 K11 | "exactly four kinds may carry a `COMMIT`" | **Unchanged and preserved**: `BOOKING_CONFIRMATION`, `SETTINGS_DRAFT`, `APPROVAL`, `PAYMENT_HANDOFF`. `FORM` is not among them. This is the one first-edition defect closed cleanly and nothing above touches it. |

## Section 0-B (EB-1 … EB-15)

| # | Where | What it said | What replaced it |
|---|---|---|---|
| EB-1 | §0.13 `subjectFloor` | `aiToolRegistry.get(key)?.riskTier ?? 'restricted'` applied to any capability key | **VOID.** A TOOL-DEF term over an AE-CAP key is always `undefined` ⇒ `restricted` ⇒ the unreachable `STEP_UP_VERIFIED`. §0B.31's dispatched `subjectFloor` governs. |
| EB-2 | §0.14 | `WIDGET_CAPABILITY_POLICY` must be total over "the C9 canon **and** every Action Engine capability key" | **VOID** as to the AE half. Its columns are C9/TOOL concepts. §0B.32: total over the 56 C9 keys; §0B.16's assertion covers the 226 AE keys. |
| EB-3 | §0.15 FR-3, §3.9 Gate 6 | `AiToolPolicyService.assertCanExecute` as the authority mechanism for every effect class | **VOID for `COMMIT` and `REQUEST_APPROVAL`** — the call cannot be constructed for an AE-CAP key. §0B.18 governs; §3.9 Gate 6 is amended to dispatch by space. |
| EB-4 | §0.15 FR-6a, §3.5 R3.5.1 | `NEVER_CHAT_ACTUATED` membership as the consent fence | **Preserved but vacuous** — all eight names resolve in no space. §0B.20 adds the `CONSENT(cap)` allowlist exclusion over AE-CAP, which is satisfiable. |
| EB-5 | §0.15 FR-6c, §0.17 item 12 | `b35.confirm` is `OWNER_HANDOFF`, "so no bulk-send `COMMIT` is mintable at all"; status `[EXISTS] (the mode)` | **VOID.** `C9Capability.mode` (`c9.registry.ts:56`) is a C9 run mode, read by nothing under `src/action-engine/`. §0B.22 governs. |
| EB-6 | §0.15 FR-6d, §0.33 | `cap.riskFacets.includes('financial')` as the finance fence | **VOID as a fence.** It catches 12 of 226 (4 of the 105 reachable) and misses 35 money-mutating reachable capabilities. Retained only as a §0B.16 veto. §0B.24 governs. |
| EB-7 | §0.15 FR-6f, §0.46 | `AiToolPolicyService.assertCanDecide` as the approval mechanism | **VOID for Action Engine approvals.** §0B.26 governs. §0.46's *description* of the guarantee (role-gated, not separation of duties) stands. |
| EB-8 | §0.33 | `requiredConfirmationKind`'s `return 'SETTINGS_DRAFT'` default branch | **VOID.** It routes 118 of 226 capabilities — 94 of the 105 reachable — to a COMMIT-bearing kind by falling off a two-test chain. §0B.33 governs. |
| EB-9 | §0.41 | `EXPENSE_OWNER` among `SETTINGS_DRAFT`'s owner classes | **VOID.** §0B.39: `expenses.create.execute.v1` carries `riskFacets: ['local','financial','expense_ledger','atomic']`; `GAP-EXPENSE-COMMIT`. |
| EB-10 | §4.8 `A11yBlock` | the inline eleven-member `role_hint` union | **VOID.** One union, §2.5's twelve. §0B.34. |
| EB-11 | §2.6.8 | `METRIC` `role_hint` `status` | **VOID.** `group`. §0B.35 — `status` implies `aria-live="polite"` by §2.5, contradicting §4.8.2's `live_region: 'off'`. |
| EB-12 | §4.8.2 | the `role_hint` column, where it diverges from §2 | **VOID as a `role_hint`**; derived from `KIND_REGISTRY`. The other four columns stand. §0B.35. |
| EB-13 | §4.8.2 | the seventeen-row table | **Amended to twenty-two.** §0B.36. |
| EB-14 | §4.1.3 | `TIME_SLOT_SELECTOR` 300 s; `BOOKING_CONFIRMATION` 900 s | **VOID.** 90 s and 120 s — §2.6.4 and §2.6.5, the shorter values, per L3 and RT4. §0B.37. |
| EB-15 | §4.1.3 | the fourteen-row (seventeen-kind) ceiling and `on_expiry` table, declared "mandatory per kind" | **Amended to twenty-two.** §0B.37. |

## Section 0-C (EC-1 … EC-24)

| # | Where | What it said | What replaced it |
|---|---|---|---|
| EC-1 | §0B.21 | `crm.appointment.{attendance,duration,services,fields}.v1` allowlisted with `confirmation_kind: 'BOOKING_CONFIRMATION'` | **VOID as allowlist rows.** No propose key exists in any space and none may be inferred (§0B.12) or added (FR-16). → `AE_CAPABILITY_GAP_LEDGER` under **`GAP-APPOINTMENT-DETAIL-COMMIT`**. Allowlisted `BOOKING_CONFIRMATION` membership becomes **3**. §0C.5 |
| EC-2 | §0B.31 `c9Floor` | `aiToolRegistry.get(key)?.riskTier ?? 'restricted'` on the C9 branch, glossed "valid: 47 of the 56 resolve" | **VOID.** `AiToolRegistryService.get()` throws rather than returning a nullable, so the branch raises for nine keys and `verificationFloor` is not total. Replaced by a branch over `mode`, `resourceClass` and a pure catalogue lookup, with a no-lowering build assertion. §0C.10 |
| EC-3 | §0.34 guard; §0B.13(3) | a non-`draft` `COMMIT` is mintable only against a consumed **`REFINE`/`DRAFT`** record whose capability equals the propose key | **Amended to a two-row table.** `'record'` → `REFINE`/`DRAFT`, compared to the row's **C9 `propose`** side. `'approval'` → `REQUEST_APPROVAL`, compared to the row's **AE `ae`** side — because §0.32/§0B.7 put a `REQUEST_APPROVAL`'s ref in AE and the propose side in C9, and the two spaces are disjoint. §0C.13, §0C.13-bis |
| EC-3b | §0B.13(2) | the `propose: null` + `confirmation_kind: 'APPROVAL'` escape | **VOID.** Unnecessary after EC-3 and unsatisfiable with §0B.13(3). Every allowlisted key must be the `ae` side of exactly one pairing row. §0C.13 |
| EC-4 | §4.5.4 step 1; §0.13 `verificationFloor`; §2.6.15 SOURCE.3 | withhold **every** intent below the floor, before step 4's PIN; `reconnect_intent` undroppable in prose only | **Amended.** A **derived**, build-vetoed, non-actuating `FLOOR_EXEMPT` set — keyed on `priority === 0` plus three exclusion clauses, never on a list of names — waives `EFFECT_FLOOR`, `KIND_FLOOR` and `targetFloor` — and, **for a class-`s` `HANDOFF` only**, the destination subject term, which alone floors at `ANONYMOUS`. **Every other exempt intent keeps `subjectFloor(subjectCapability(i))`**, so `control.run.cancel` retains `CONTROL_FLOOR: BOUND_CLIENT` even at `priority: 0`, and `SENSITIVE_DEST` excludes consent and identity destinations outright. Five intents satisfy it. SOURCE.3 gains `prio |
| EC-5 | §A2.4 | "every `[ABSENT]` mechanism named in §A1 is bound to its gap key" | **Amended.** §A1 has no such column and the capability ledger holds a different kind of gap. A separate `MECHANISM_GAP_LEDGER` (`MG-P01` … `MG-P32`, total over all thirty-two prerequisite rows) is introduced and the assertion restated over it. §0C.20 |
| EC-6 | §4.8 A-2; §4.8 `A11yBlock` | "Accessible name = `intent.utterance`, verbatim" | **VOID.** `WidgetIntent` declares no `utterance`. Replaced: `intent.label` + the §4.8.2 row's composition, `intent.label` alone otherwise; §4.8.2 is the sole per-kind owner. `A11yBlock` gains `accessible_names: Record<InteractiveRefKey, string>` keyed through the declared total injective `refKey(ref)` (mint class M, inside `body_hash`), because the block is one per envelope and declared no name at all; and the name source is `nameSourceOf(ref, env)`, total over `InteractiveRef`'s **seven** members, because only `{k:'intent'}` denotes a `WidgetIntent`, a FORM's field refs have labels of their o |
| EC-7 | §0B.25 / §0B.16 | FR-6e's tenant-object half, asserted with no mechanism of its own | **Amended.** §0B.16 gains `row ⟹ TENANT_AUTHORITY(cap) ⟹ fail`. FR-6e held before and holds after; it is now a checked assertion. §0C.23 |
| EC-8 | §2.6.5 BOOK.1, 2nd sentence | "ACTION ENGINE INGRESS independently re-derives the subject … and refuses" | **VOID**, on §0.35's ground for K11 and BOOK.2: `TrustedActionExecutionRequestV1` carries no widget field and passing one would breach FR-1/FR-2/E3. BOOK.1's mint-time half stands. §0C.24 |
| EC-9 | §4.7 V4; §3.7 `IntentRecord` | "the gateway refuses a `COMMIT` from a `SPOKEN` profile with no readback confirmation reference" | **Retained and made constructible.** `requires_readback` already exists on `ConfirmationRequirement`; §4.7's `requires.…` is a wrong container, corrected to `confirmation.…`. Added: `readback_ref` + `readback_text`, `ReadbackAck` on §3.8, `IntentRecord.body_hash` + `.selection_domain`, and **Gate 8-R keyed on `record.confirmation?.requires_readback`** — never on the submission's `profile_id`, which R3.8.3 declares advisory and not an authority input. §0C.26, §0C.26-bis, §0C.26-ter |
| EC-10 | §4.9.2 PR2 (a) | "the capability registry marks run-opening capabilities" | **VOID** — it requires a `C9Capability` field, changing `C9_REGISTRY_HASH`, which §0.3 and FR-16 forbid. Replaced by `RUN_OPENING(ref)` over the existing `mode` member (15 of 56), read through the one declared accessor `c9Registry.tryGet` with a fail-closed `?? 'PROPOSE_ONLY'` default. Mechanism (b) stands. §0C.28 |
| EC-11 | §0B.18 Gate 6, `C9` branch | one `assertCanExecute` call for the whole C9 space | **Amended.** Nine of the 56 C9-CAP keys are not catalogue names, so no `AiToolDefinition` exists for them. Gate 6 gains a second C9 branch — the `WIDGET_CAPABILITY_POLICY` row plus `c9Capability`'s own admission. Here a throwing accessor is correct: Gate 6 is a refusal point. `c9Capability`'s required `C9Domain` argument had no carrier, so `IntentRecord.c9_domain` is declared. §0C.28-bis, §0C.28-ter |
| EC-12 | §2.2 K2 closing ¶; §2.6.17 FORM.2 | "a fourth evaluation happens at INGRESS … the ACTION ENGINE INGRESS re-derives the kind rule from `IntentRecord.widget_kind`" | **VOID**, on §0.35's ground for K11/BOOK.2 and §0C.24's for BOOK.1. `widget_kind`/`widgetKind` have 0 occurrences under `src/action-engine`, and passing one would breach FR-1/FR-2/E3. §0C.28-bis |
| EC-13 | §2 K13; `KIND_REGISTRY.max_commit_intents` | typed `0 \ | 1`, fixed at `1` for the four confirmation kinds |
| EC-14 | §4.9.3 PR3c | "`notify_pref_key` must resolve in the notification-consent registry" | **Retained and made constructible.** Neither the member nor the registry existed. `ProactiveProvenance.notify_pref_key` (mint class D) and the closed twelve-row `MOMENT_REGISTRY` are declared, with a start-up assertion that every row's key resolves. §0C.28-bis |
| EC-15 | §3.7 `IntentRecord` | `body_hash` and `selection_domain` read by Gate 8-R and by the `SUPERSEDED` comparison | **Declared.** Both added, mint class D, `AUDIT_RETAINED`, in **P-30**'s component list. §0C.26-ter, §0C.28-bis |
| EC-16 | §0C.14 heading, §0C.32; §A5 | "the fourteen fundamental rules"; "§A1 enumerates 22 prerequisites: 18/2/2" | **Corrected.** Sixteen rules over twenty-one rows, each stated as holding outright or holding fail-closed. §A5's tally is **VOID as a restatement**: 32 prerequisite rows, per-status counts derived from `MECHANISM_GAP_LEDGER` at build, never transcribed. §0C.28-bis |
| EC-24 | §0C.22-ter's `nameSourceOf` and `resolveInteractive`; §0C.13's EC-20 and EC-23 rows; §0C.32's range; §0C.22's A-2; §4.9.3 | nine defects the narrow EC-23 verification attributed to the EC-23 edits | **Amended.** **A REGRESSION is reverted:** EC-23 removed `const el = …` from before `nameSourceOf`'s switch and re-added it in **one** branch, leaving six branches reading a free `el` — the function did not compile at all, which is worse than the wrongly-typed binding EC-23 replaced. All seven branches now bind it. `resolveInteractive` is re-declared inferring `K` from `ref.k`, a literal property, because a conditional type in parameter position is **not an inference site** and would have left `K` at its constraint, defeating the indexing. §0C.13's EC-20 row no longer says `ARTIFACT.3` assigns |
| EC-23 | §0C.22-nonies's `ARTIFACT.3`; `CLIENT.3`'s conjuncts; §1.9 H1; EC-17's duplicated phrase; A-2's `suffix` binding; §0C.32's EC-2 row and its bucket list; `nameSourceOf`'s `el`; §4.9.3 | what the bounded EC-22 verification found | **Amended.** **`ARTIFACT.3` renumbered `ARTIFACT.5`** — §2.6.22's existing `ARTIFACT.3` is a PII clause (`contains_pii` / `pii_ceiling`), and **EC-20** had introduced the colliding number, one clause above the `CLIENT.2` collision EC-22 fixed — §0C.22-nonies is EC-20's section, and EC-21 never mentions ARTIFACT; `APPROVAL.4` was and is free. `CLIENT.3` gains handle-uniqueness and a no-other-`primary` conjunct, without which §0C.22-undecies's crossing pointer is not single-valued. **§1.9 H1's term list gains `render.render_tier` as a RULING** — EC-22 left that amendment inside a code comment, s |
| EC-22 | §0C.22-ter `ElementFor`; `renderSuffix`; A-2; the `CLIENT_LIST` suffix row; the APPROVAL row's default; EC-17's restatement; EC-14's `Moment`/`MomentTemplate`; §0C.32's EC-2 row; §1.9 H1; EC-21's citations | fourteen defects the final bounded verification attributed to the EC-21 repairs | **Amended.** `CLIENT.2` renumbered **`CLIENT.3`**, protecting §2.6.7's `pii_ceiling: 'client_identified'` fence from being read as superseded. `ElementFor<'option'>` gains `StrategyOptionsBody['alternatives'][number]`. `renderSuffix` lifted from a comment into a typed declaration. `CLIENT_LIST`'s pointer becomes `bulk_intents[⟨entry whose handle is ref.id⟩].audience_size`, with a general rule for a `base:'body'` pointer crossing an array. `Moment` and `MomentTemplate` gain their version members and both start-up assertions are restated over the composed `id@version` key. §0C.32's EC-2 row scop |
| EC-21 | §0C.17's two floor predicates; §0.13's input list; §0C.28-sexies's `produced`, ordering and `render` timing; §0C.22-quinquies's suffix value; §0C.22-ter's `resolveInteractive`; §0C.18's bound; EC-14's catalogues; Gate 6's HANDOFF branch; EC-17's citation | sixteen residuals the EC-20 confirmation raised, all adjudicated CONFIRMED | **Amended.** `FLOOR_EXEMPT`/`verificationFloor` re-declared over a structural `FloorSubject`, without which Gate 5 still could not recompute them from an `IntentRecord` — the defect EC-19 added `priority` for and EC-20 left one call deeper. §0.13's closed input list names `priority` as its fifth input. `produced` is filtered against `emitted`, because the fitter withholds intents without nulling the body refs that name them. One ordering, with the four kinds whose paths already denote the escape called out. §1.1.1's `render` row moves to `EP-FIT`, since a tier read at `EP-MINT` must exist by t |
| EC-20 | §0C.28-sexies's derivation; §0C.22-quinquies's value type; §3.7; §0C.28-quater; §0B.18; §1.1.4; §0C.18; §0C.11-ter; EC-14's `MomentTemplate` | twenty-one residuals the bounded verification of EC-19 raised | **Amended.** The `reading_order` second operand becomes the **closed** form — every emitted intent not already denoted — because a role list left `role: 'more'` unsatisfiable on eighteen kinds; the operator becomes ordered concatenation, since `∪` left `remedy` unpositioned against K22's render-order rule. `refSet` takes the fitted tier, because CHART's path list is conditional on degradation, which lives on `render`, not `body`. `accessible_name_suffix`'s VALUE becomes `readonly string[]` of pointers — a string would have concatenated `audience_size` literally. APPROVAL.4 and ARTIFACT.5 (numb |
| EC-19 | §3.1 `AuthorityHint`; §3.7 `IntentRecord`; §0C.28-bis EC-14's `Moment`; §0C.22-quinquies's suffix key; §0C.28-bis Gate 6 call site; §0C.28-quater; §0C.32's EC-2 row; EC-17 vs EC-18 | eight defects the final pass confirmed | **Declared / amended.** `AuthorityHint` declared with a closed non-authority member set (§0C.11-ter). `IntentRecord` gains `priority`, without which Gate 5 cannot recompute `FLOOR_EXEMPT` and every exempt intent would diverge under §0.16. `Moment` gains `kind` and `moment_template_id`, which EC-18(3)'s assertion reads. The suffix keys on `${ref kind}:${role}` so APPROVAL's suffix reaches the approve control alone. Gate 6's call site binds `ref = subjectCapability(record)` — the dispatch was repaired in round 10 and the call two lines below was not, leaving it inert for `HANDOFF`. §0C.28-quater |
| EC-18 | §2.6.13 PROGRESS; §2 K22's derivation; §4.9.4 PR5b | `steps[].unknown.next_intent_ref` as a live path; `reading_order` = exactly `interactive_paths`; "each moment template declares `required_cells`" | **Amended / declared.** §0.19 deleted `steps[].unknown`, so PROGRESS's path becomes `steps[].state.next_intent_ref`. K22's derivation appends **every emitted intent not already denoted by a produced ref** — the closed form, because a role list left `role: 'more'` unsatisfiable on eighteen kinds — in `emitted` order with the escape last. No authority widens: the operand ranges over intents that already passed the floor and the ladder, and `reading_order` is an accessibility ordering that gates nothing. (The first draft justified this by "both are `priority: 0` and `FLOOR_EXEMPT`", which is fals |
| EC-17 | §2 K22, its enumeration | "the union of `option_id`, `field_key`, `row_key`, `entry_ref`, `series_id` and bare `intent_token`" | **VOID as an enumeration.** It names `series_id` — which §1.4 classes **structural**, "never rendered", and which no kind's `interactive_paths` produces — and omits `section_id`. `InteractiveRef`'s **seven** members are the typed authority — the seventh, `{k:'slot'}`, added by §0C.22-sexies because `TIME_SLOT_SELECTOR`'s declared path `groups[].slots[].slot_ref` could be denoted by none of the six; K22's rule and mechanism stand **as amended by EC-18 item 2 and EC-20** (every emitted intent not already denoted by a produced ref joins the list, in `emitted` order). §0C.28-bis, §0C.22-sexies |

