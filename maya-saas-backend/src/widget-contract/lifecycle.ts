// GENERATED FROM THE CERTIFIED CONTRACT - do not hand-edit.
// Source:     docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md
// Regenerate: node scripts/widget-contract/emit.mjs
// Module:     lifecycle
/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
import { BridgeKey, BridgeSession, WidgetBody } from './derived-shapes';
import { CapabilityRef } from './capability-ref';
import {
  Cell,
  Measure,
  NARRATIVE_TEMPLATES,
  NarrativeTemplate,
  Phrase,
  ReasonCode,
  VerificationLevel,
  WidgetEnvelope,
} from './envelope';
import { WidgetIntent } from './intent';
import {
  ApprovalBody,
  ArtifactBody,
  FormField,
  FullscreenReason,
  OptionItem,
  ReportBody,
  RoleHint,
  ScheduleBody,
  StrategyOptionsBody,
  TableSpec,
  TimeSlotSelectorBody,
  WidgetKind,
} from './kinds';

// --- section 4.1 (contract line 5428) ---
export type LifecycleState =
  | 'MINTED' // sealed, not yet delivered
  | 'DELIVERED' // handed to a channel adapter, already degraded (§4.5)
  | 'LIVE' // rendered, intents consumable
  | 'CONSUMED' // ≥1 intent submitted and receipted
  | 'SUPERSEDED' // replaced in place by a successor envelope
  | 'EXPIRED' // expires_at passed with no submission
  | 'CANCELLED' // escape verb used
  | 'HISTORISED' // frozen receipt (§4.2) — no intent is consumable
  | 'BODY_DROPPED' // retention_sec elapsed; headline + summary only
  | 'REDACTED'; // erasure applied (§4.4)

// --- section 4.1 (contract line 5453) ---
export interface Lifecycle {
  freshness_class: 'live' | 'scenario' | 'proactive_once' | 'static';
  state: LifecycleState;
  issued_at: string; // RFC3339
  expires_at: string; // > issued_at; §4.1.3 ceilings
  flow_ttl_s: number | null; // scenario flows only; null otherwise
  input_lock: 'none' | 'soft' | 'hard';
  on_expiry: 're_resolve' | 'collapse_to_summary' | 'mark_stale';
  supersedes_widget_id: string | null;
  superseded_by_widget_id: string | null;
  delivery: DeliveryRecord; // §4.3 — NOT business state
  historised_form: 'summary_bubble'; // literal, single value
  timeline_placement: 'chronological'; // literal, single value. There is no pinned member.
  dedupe_key: string; // one signal across channels
  retention_sec: number; // ≤ the per-kind ceiling in §4.4.2
  delivery_channel: ChannelId; // the channel this emission was fitted for (§4.5)
}

// --- section 4.2 (contract line 5574) ---
export type TerminalOutcome =
  | 'SUBMITTED' // a receipt exists, outcome ACCEPTED
  | 'CONFIRMED' // a receipt exists and a canonical action completed
  | 'NOT_CONFIRMED' // a receipt exists, outcome REFUSED / NEEDS_* and was not resolved
  | 'EXPIRED_UNUSED' // no submission before expires_at
  | 'SUPERSEDED' // replaced by a successor envelope
  | 'CANCELLED' // escape verb used
  | 'DELIVERED_ONLY'; // never rendered interactively in this channel (§4.5 withholding)

export interface TerminalLine {
  outcome: TerminalOutcome;
  text: string; // server-minted; the archival sentence
  action_receipt_ref: string | null; // present iff outcome === 'CONFIRMED'
}

// --- section 4.2 (contract line 5597) ---
export interface HistorisedWidget {
  envelope: WidgetEnvelope; // frozen, as sealed
  terminal_lines: TerminalLine[];
  reread_intent: WidgetIntent | null; // minted NOW, effect 'REFINE', for the CURRENT principal
}

// --- section 4.3 (contract line 5637) ---
export interface DeliveryRecord {
  delivery_state:
    | 'live' // deliverable, interactive where the channel allows
    | 'answered_in_this_channel' // a receipt exists from this channel
    | 'answered_in_other_channel' // a receipt exists from a sibling delivery (same dedupe_key)
    | 'withdrawn' // adapter withdrew the affordance (L9)
    | 'expired'
    | 'cancelled';
  answered_at: string | null;
  answering_channel: ChannelId | null;
  action_receipt_ref: string | null; // the ONLY pointer to a business fact
}

// --- section 4.4.3 (contract line 5720) ---
export type ErasureClass =
  | 'AUDIT_RETAINED' // authority & audit; survives a conversation-erasure request
  | 'CONVERSATION_CONTENT' // erased with conversation content
  | 'CANONICAL_ELSEWHERE'; // a copy of a value a canonical owner holds; erased HERE, retained THERE

// --- section 4.5.2 (contract line 5821) ---
export interface ChannelProfile {
  contract: 'maya.channel.profile/1';
  profile_id: string; // 'pwa.v1', 'tg.bot.v3', 'push.v1', …
  profile_version: number;
  channel_id: ChannelId;
  render_tier: RenderTier;
  locale_hint: string;

  // capacity — every field reductive
  max_intents: number;
  max_intent_label_chars: number;
  max_body_chars: number;
  max_table_rows: number; // 0 = tables not renderable inline
  max_options_inline: number;
  token_carrier: TokenCarrier;
  token_budget_bytes: number;

  // presentation capabilities — declared, never authority
  supports: {
    rich_layout: boolean;
    tables: boolean;
    charts: boolean;
    images: boolean;
    inline_edit: boolean;
    multi_select: boolean;
    progressive_update: boolean;
    fullscreen_routes: boolean;
    speech_out: boolean;
    speech_in: boolean;
    back_stack: boolean;
    deep_link_in: boolean;
    file_delivery: boolean;
  };

  a11y_env: A11yEnvironment; // §4.8
  motion: 'full' | 'reduced';
  text_scale: number; // 1.0 … 3.0
  color_scheme: 'light' | 'dark' | 'high_contrast';
  viewport_min_css_px: number;

  native_bridge?: BridgeSession; // §4.6

  max_verification_level: VerificationLevel; // SERVER-SIDE CEILING, not a claim

  // type-level bans
  declares_verification_level: never;
  declares_role: never;
  declares_capability: never;
  declares_interaction_model: never;
}

export type ChannelId =
  | 'pwa'
  | 'native-shell'
  | 'telegram-miniapp'
  | 'telegram-bot'
  | 'web-push'
  | 'realtime-voice'
  | 'guest-chat'
  | 'web-public'
  | 'public-community'
  | 'sms'
  | 'email';

export type RenderTier =
  | 'RICH_INTERACTIVE'
  | 'RICH_CONSTRAINED'
  | 'ANNOUNCEMENT'
  | 'SPOKEN'
  | 'TEXT_ONLY'
  | 'PUBLIC_READ'
  | 'ANONYMOUS_CHAT';

export type TokenCarrier =
  | 'json_body'
  | 'callback_data'
  | 'notification_action'
  | 'spoken_alias'
  | 'signed_path_segment';

// --- section 4.5.5 (contract line 5950) ---
export interface RenderReceipt {
  contract: 'maya.render.receipt/1';
  profile_id: string;
  profile_version: number;
  render_tier: RenderTier; // sealed inside body_hash; see §4.5.4 step 8
  intents_minted: number; // before fitting
  intents_emitted: number; // after fitting
  intents_withheld: Array<{
    role: WidgetIntent['role'];
    reason:
      | 'capacity'
      | 'carrier_limit'
      | 'verification_floor'
      | 'bridge_absent'
      | 'policy'
      | 'secure_surface_only';
    reachable_via: string; // REQUIRED: an emitted intent_token or route_key
  }>;
  body_reductions: Array<{
    path: string; // dotted path inside body
    reduction: 'summarised' | 'paginated' | 'masked' | 'omitted';
    restored_by: string; // REQUIRED: an emitted intent_token or route_key
  }>;
  text_equivalent_is_canonical: boolean; // true whenever render_tier === 'TEXT_ONLY'
  escalation: { to_route_key: string; reason: FullscreenReason } | null;
  degraded_at: string;
}

// --- section 4.6 (contract line 6050) ---
export interface BundleBridgeRequirements {
  required: []; // NORMATIVE: the empty tuple. The illegal state cannot be written.
  optional: BridgeKey[];
  degradations: Record<
    BridgeKey,
    {
      when_absent:
        'web_fallback' | 'hide_decoration' | 'cell_unavailable' | 'handoff';
      fallback_ref?: string; // route_key or web API used instead
      cell_reason?: ReasonCode;
    }
  >;
}

// --- section 4.8 (contract line 6155) ---
export interface A11yEnvironment {
  // reported by the renderer; PRESENTATION ONLY
  reduced_motion: boolean;
  forced_colors: boolean;
  text_scale: number; // 1.0 … 3.0
  pointer: 'fine' | 'coarse' | 'none';
  keyboard_only_hint: boolean; // a hint. NEVER a capability gate.
  caption_preference: boolean;
}

export interface A11yBlock {
  // presentation.a11y
  role_hint: RoleHint; // the one twelve-member union; the per-kind value is
  //   KIND_REGISTRY[kind].role_hint, never authored here
  label: string;
  description: string;
  reading_order: InteractiveRef[]; // EVERY interactive element, in DOM order (A-0)
  live_region: 'off' | 'polite' | 'assertive';
  accessible_names: Record<InteractiveRefKey, string>; // one entry per reading_order member;
  //   no other key admitted (A-2)
}

export type InteractiveRef =
  | { k: 'option'; id: string } // OptionItem.option_id, and STRATEGY_OPTIONS'
  //   alternatives[].option_id
  | { k: 'field'; id: string } // FormField.field_key
  | { k: 'intent'; id: string } // WidgetIntent.intent_ref — never intent_token, which is
  //   opaque and null for a NONE effect
  | { k: 'row'; id: string } // TableSpec row key
  | { k: 'entry'; id: string } // SCHEDULE entry_ref
  | { k: 'slot'; id: string } // TimeSlotSelectorBody groups[].slots[].slot_ref
  | { k: 'section'; id: string }; // REPORT section_id

// `InteractiveRef` is an object type and cannot key a Record, so the key form is declared.
export type InteractiveRefKey = `${InteractiveRef['k']}:${string}`; // e.g. 'field:phone'
export declare function refKey(ref: InteractiveRef): InteractiveRefKey; // `${ref.k}:${ref.id}` —
// total over the closed SEVEN-member union, and injective
// because `k` is one of seven fixed tokens and ':' is the
// only separator, so no two refs collide.

// --- section 4.8 (contract line 6201) ---
export declare function refSet(
  paths: readonly string[],
  body: WidgetBody,
  tier: RenderTier,
): InteractiveRef[];
// the ref set a kind's interactive_paths produce against this body. `tier` is REQUIRED
// because CHART's declared path list is conditional — "and, when degraded to `table`,
// table_equivalent.rows[].row_key" — and the degradation outcome lives on
// `render: RenderReceipt`, not on `body`. EP-FIT precedes EP-MINT, so the fitted tier
// is in hand when this is evaluated.

// [SPEC, not code] produced = refSet(KIND_REGISTRY[kind].interactive_paths, body, render.render_tier)
// [SPEC, not code]               .filter(r => r.k !== 'intent'
// [SPEC, not code]                         || emitted.some(i => i.intent_ref === r.id))
// the fitter WITHHOLDS intents (steps 1-3, 5) but never nulls the body ref that names
// them, so a produced {k:'intent'} ref can denote an intent absent from `emitted` —
// METRIC's drill_intent at TEXT_ONLY, FORM's discard_intent withheld at step 2 or 3,
// CHOICE's more_intent on ANNOUNCEMENT. Unfiltered, resolveInteractive is partial,
// nameSourceOf's totality is false, and A-3's DOM-order rule names a control no
// renderer draws.
// [SPEC, not code] reading_order = produced
// [SPEC, not code]               ++ [ { k: 'intent', id: i.intent_ref }
// [SPEC, not code]                    : i ∈ emitted, in emitted order,
// [SPEC, not code]                      refKey({k:'intent', id: i.intent_ref}) ∉ produced.map(refKey) ]
// BOTH operands are InteractiveRef OBJECTS. `++` is ORDERED concatenation, not `∪`:
// render order and DOM order must equal this list, so an unordered union would leave
// two conforming implementations free to differ.
// The second operand is the CLOSED form — every emitted intent not already denoted by
// a produced ref — not a role list. A role list was unsatisfiable: `role: 'more'` is
// minted by §4.5.4 step 5 on ANY kind whenever the fitter dropped anything, while only
// four kinds declare a `more_intent` path. This form subsumes escape, remedy, `more`
// and any future server-minted role by construction.

// --- section 4.8.1 (contract line 6273) ---
// The SEVEN body shapes a ref can denote, each named as this contract names it. A 'row' ref
// resolves to its row AND its owning table, because one envelope may hold many tables —
// REPORT declares `sections[].table: TableSpec | null` — so a row key alone does not determine
// which table's is_row_header column to read.
export type InteractiveElement =
  | WidgetIntent
  | FormField
  | OptionItem // label: Cell<string>
  | StrategyOptionsBody['alternatives'][number] // title: Cell<string>, NO label
  | TimeSlotSelectorBody['groups'][number]['slots'][number] // start: Measure
  | ReportBody['sections'][number] // { section_id; heading; … }
  | ScheduleBody['entries'][number] // { entry_ref; title; … }
  | { table: TableSpec; row: TableSpec['rows'][number] };

// INDEXED by ref kind. A flat return of the whole union would have nameSourceOf's seven
// branches reading members the declared type does not carry (el.start, el.heading, el.row),
// so the declaration would read as total without type-checking.
export type ElementFor<K extends InteractiveRef['k']> = K extends 'intent'
  ? WidgetIntent
  : K extends 'field'
    ? FormField
    : K extends 'option'
      ? | OptionItem
        | (OptionItem & { duration: Measure; price: Measure | null })
        | (OptionItem & { nearest_availability: Measure }) // §2.6.3 declares it Measure; a
        //   Cell<string> is not assignable to it, since Measure.value is number | string | null
        | StrategyOptionsBody['alternatives'][number]
      : // ^ REQUIRED: STRATEGY_OPTIONS' declared path
        // `alternatives[].option_id` makes {k:'option'} denote this shape,
        // which is NOT an OptionItem. Note that `A | (A & B)` narrows to
        // `A` for member access, so the two intersections are reachable only
        // through the discriminated base:'element' lookup, never by reading
        // duration/price off a bare OptionItem.
        K extends 'section'
        ? ReportBody['sections'][number]
        : K extends 'entry'
          ? ScheduleBody['entries'][number]
          : K extends 'slot'
            ? TimeSlotSelectorBody['groups'][number]['slots'][number]
            : K extends 'row'
              ? { table: TableSpec; row: TableSpec['rows'][number] }
              : never;

// K is inferred from `ref.k`, a LITERAL property, not from a conditional type: a conditional
// type in parameter position is not an inference site, so `Extract<InteractiveRef, {k: K}>`
// would have left K at its constraint and defeated the indexing this declaration exists for.
export declare function resolveInteractive<R extends InteractiveRef>(
  env: WidgetEnvelope,
  ref: R,
): ElementFor<R['k']>;
// Total, and it introduces no new resolver: it is A-0's own ref↔element mapping read in
// the forward direction. A {k:'intent'} ref resolves against `env.intents` by
// `intent_ref`; every other ref kind resolves against the body through
// `interactive_paths`, whose ref set validateEnvelope already recomputes — so the
// element each ref denotes is a value that computation already holds. Total over the
// whole of `reading_order` by those two operands.

export declare function rowHeaderKey(t: TableSpec): string; // the one column of THAT table whose
// is_row_header is true — total

export type SuffixSpec = {
  base: 'element' | 'body';
  pointers: readonly string[];
};

export declare function renderSuffix<K extends InteractiveRef['k']>(
  d: SuffixSpec,
  el: ElementFor<K>,
  body: WidgetBody,
): string;
// Each pointer resolves — against `el` when base is 'element', against `body` when it
// is 'body' — to a Cell, Measure or Phrase, and contributes its MINTED label:
// Cell.label, Measure.formatted, Phrase.rendered. Joined with ', '. An empty pointer
// list yields ''. Mint class M, like accessible_names itself.

export declare function suffixFor(
  kind: WidgetKind,
  ref: InteractiveRef,
  intent: WidgetIntent | null,
): SuffixSpec;
// §4.8.2's entry for `${ref.k}:${intent.role}`, else for `${ref.k}:*`, else the
// declared default { base: 'element', pointers: [] }. TOTAL — it never returns
// undefined, so A-2 needs no null branch. `intent` is null for every non-intent ref.

export type NameSource = { label: string; from: InteractiveRef['k'] };

export function nameSourceOf(
  ref: InteractiveRef,
  env: WidgetEnvelope,
): NameSource {
  // `el` is resolved INSIDE each branch, not once before the switch: resolving it first would
  // infer K at the full union, so `el` would stay the flat seven-shape union in every branch
  // and `el.title` / `el.heading` / `el.start` would be reads the declared type does not carry
  // — the very failure the indexed ElementFor was adopted to prevent.
  switch (ref.k) {
    case 'intent': {
      const el = resolveInteractive(env, ref);
      return { label: el.label, from: 'intent' };
    } // string
    case 'field': {
      const el = resolveInteractive(env, ref);
      return { label: el.label.rendered, from: 'field' };
    } // Phrase
    case 'section': {
      const el = resolveInteractive(env, ref);
      return { label: el.heading.rendered, from: 'section' };
    } // Phrase
    case 'option': {
      const el = resolveInteractive(env, ref);
      return {
        label: ('label' in el ? el.label : el.title).label,
        from: 'option',
      };
    } // OptionItem.label OR, on STRATEGY_OPTIONS,
    // alternatives[].title — both Cell<string>
    case 'slot': {
      const el = resolveInteractive(env, ref);
      return { label: el.start.label, from: 'slot' };
    } // Measure
    case 'entry': {
      const el = resolveInteractive(env, ref);
      return { label: el.title.label, from: 'entry' };
    } // Cell
    case 'row': {
      const el = resolveInteractive(env, ref);
      // rowHeaderKey is total over the table by section 4.8.1's own rule, so the lookup cannot
      // miss; the assertion records that the totality is the contract's.
      return {
        label: el.row.cells[rowHeaderKey(el.table)]!.label,
        from: 'row',
      };
    } // Cell<string> | Measure
  } // total by type over the closed seven-member union — no default branch is reachable.
}

// A-2, in one line: the accessible name begins with the label of whatever the ref denotes.
// [SPEC, not code] ∀ ref ∈ reading_order : accessible_names[refKey(ref)].startsWith(nameSourceOf(ref, env).label)

// --- section 4.8.2 (contract line 6419) ---
// [MEMBER FRAGMENT] accessible_name_suffix: Partial<Record<
// [MEMBER FRAGMENT]     `${InteractiveRef['k']}:${WidgetIntent['role'] | '*'}`,
// [MEMBER FRAGMENT]     { base: 'element' | 'body'; pointers: readonly string[] }
// [MEMBER FRAGMENT]   >>;
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

// --- section 4.9.3 (contract line 6484) ---
export interface ProactiveProvenance {
  // REQUIRED when trigger === 'proactive'
  artefact_ref: string; // a canonical row: Opportunity, approval object,
  //   closed-period report, appointment, shift
  artefact_kind:
    | 'opportunity'
    | 'approval'
    | 'closed_report'
    | 'appointment'
    | 'shift'
    | 'consent_record';
  artefact_created_at: string; // RFC3339, from the canonical row
  narrative_source: 'moment_template' | 'stored_artefact';
  narrative_hash: string; // sha256 of the narrative actually rendered
  moment_template_id: string | null; // REQUIRED iff narrative_source === 'moment_template'
  moment_template_version: number | null; // REQUIRED under exactly the same condition; the pair
  //   composes the MOMENT_TEMPLATES key
  notify_pref_key: string; // mint class D, derived server-side from the moment;
  //   resolved in NOTIFICATION_CONSENT_REGISTRY at delivery
}

// --- section 4.9.3 (contract line 6505) ---
export interface Moment {
  moment_key: string;
  kind: WidgetKind; // the final projected kind; its strict body schema remains final
  moment_template_id: string; // with the version below, composes the MOMENT_TEMPLATES key
  moment_template_version: number;
  notify_pref_key: string;
  once_per: string;
  quiet_hours_policy: string;
}
export declare const MOMENT_REGISTRY: Readonly<Record<string, Moment>>; // the 12 canonical moments

export interface NotifyPref {
  notify_pref_key: string;
  consent_class: 'communication'; // a delivery permission is always a communication
  //   consent, never another class
  owner: CapabilityRef; // the canonical owner that records and revokes it
  quiet_hours_window: string; // IANA-zoned window, re-read at delivery
}
export declare const NOTIFICATION_CONSENT_REGISTRY: Readonly<
  Record<string, NotifyPref>
>;

export interface MomentTemplate {
  moment_template_id: string;
  version: number;
  narrative_template_id: string;
  narrative_template_version: number;
  required_cells: string[]; // JSON Pointers into its typed composition input
}
export declare const MOMENT_TEMPLATES: Readonly<
  Record<`${string}@${number}`, MomentTemplate>
>;

export type MomentCompositionLeafType = 'Cell' | 'Measure';
export interface MomentCompositionInputSchema {
  moment_template_key: `${string}@${number}`;
  source_owner: CapabilityRef; // a closed canonical READ/source owner
  fields: Readonly<Record<`/${string}`, MomentCompositionLeafType>>;
}
export declare const MOMENT_COMPOSITION_INPUT_REGISTRY: Readonly<
  Record<`${string}@${number}`, MomentCompositionInputSchema>
>;

// NarrativeTemplate and NARRATIVE_TEMPLATES are declared in §1.6.5 and are NOT re-declared
// here. §4.9 references them; it does not own them. Both are keyed `${id}@${version}`.
