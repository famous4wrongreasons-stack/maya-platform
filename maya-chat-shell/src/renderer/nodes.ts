// K5 — the renderer boundary: what goes in, what comes out. Frozen in S0.
//
// IN: `RenderInput` = {view, verdict, env, density}. `view` is an ALLOWLIST COPY of a verified
// envelope, built by `shell/view.ts` after `integrity/h7.ts` has already run on the full envelope
// (R-2, R-5, D1). A type-level Omit strips no runtime bytes, so the view is declared member by
// member and every member not listed here is simply absent: no widget id, no tenant, no integrity
// block, no correlation, no source, no origin, no authority, no speech aliases, no ordinal, no
// confirmation, no verification floor, no capability refs, and no token of any kind.
//
// OUT: `RenderResult`, a value the DOM host draws. The renderer composes no user-visible text
// (R-3): every string in a node is a minted string copied from the view — text equivalent parts,
// Cell labels, Measure formatting, Phrase renderings, intent labels and sealed accessible names.
//
// Types only; this module emits no runtime bytes.

import type {
  A11yEnvironment,
  AuthorityHint,
  Cell,
  CellState,
  DetailRouteKey,
  EffectClass,
  InputSchema,
  InteractiveRefKey,
  Limitation,
  LifecycleState,
  Presentation,
  Provenance,
  RenderReceipt,
  RenderTier,
  RoleHint,
  ShellRoute,
  TextEquivalent,
  WidgetBody,
  WidgetIntent,
  WidgetKind,
} from '../contract.ts';

// Contract types the DOM host needs to name. `dom/` may import this module and never the contract
// module directly, so they are re-exported here unchanged (no alias, no second declaration).
export type {
  A11yEnvironment,
  CellState,
  EffectClass,
  InteractiveRefKey,
  RenderTier,
  RoleHint,
  TextEquivalent,
  WidgetKind,
} from '../contract.ts';

// ── input ──────────────────────────────────────────────────────────────────────────────────────

/** `presentation.density`, fixed at EP-FIT; the renderer is told which one to draw. */
export type Density = Presentation['density'];

/**
 * The H7 outcome, computed by `integrity/h7.ts` on the FULL envelope before projection.
 * Any value other than 'valid' draws `text_equivalent` as frozen prose plus the one server REFINE
 * intent if present — never an error surface (WC H7, L5).
 */
export type IntegrityVerdict = 'valid' | 'body_mismatch' | 'expired';

/**
 * A render-receipt pointer after projection. The receipt's `reachable_via` / `restored_by` are an
 * emitted intent token or a route key; the view never carries the original string. A token that
 * the vault knows becomes the intent it belongs to, a route key stays a route key, anything else is
 * unresolved.
 */
export type PointerView =
  | { readonly k: 'intent'; readonly intent_ref: string }
  | { readonly k: 'route'; readonly key: string }
  | { readonly k: 'unresolved' };

/**
 * `IntentTarget` after projection. Classes 'w', 'i' and 'c' keep their class and lose their `ref`;
 * class 's' keeps its route and loses its `param`; class 'detail' keeps its route key.
 */
export type TargetView =
  | { readonly class: 'w' }
  | { readonly class: 'i' }
  | { readonly class: 'c' }
  | { readonly class: 's'; readonly route: ShellRoute['route'] }
  | { readonly class: 'detail'; readonly route_key: DetailRouteKey };

/** One intent as the renderer may see it. Activation is by `intent_ref`, never by anything else. */
export interface IntentView {
  readonly intent_ref: string;
  readonly role: WidgetIntent['role'];
  readonly label: string;
  readonly utterance_preview: string;
  readonly priority: number;
  readonly effect: EffectClass;
  readonly enabled: Cell<boolean>;
  readonly authority_hint: AuthorityHint;
  readonly input_schema: InputSchema | null;
  readonly target: TargetView | null;
}

/** The three lifecycle members a renderer needs, and no delivery or timing detail. */
export interface LifecycleView {
  readonly state: LifecycleState;
  readonly input_lock: 'none' | 'soft' | 'hard';
  readonly on_expiry: 're_resolve' | 'collapse_to_summary' | 'mark_stale';
}

export interface WithheldView {
  readonly role: WidgetIntent['role'];
  readonly reason: RenderReceipt['intents_withheld'][number]['reason'];
  readonly reachable_via: PointerView;
}

export interface ReductionView {
  readonly path: string;
  readonly reduction: RenderReceipt['body_reductions'][number]['reduction'];
  readonly restored_by: PointerView;
}

/** `render` after projection: the fitted tier plus rewritten pointers. */
export interface RenderReceiptView {
  readonly render_tier: RenderTier;
  readonly withheld: readonly WithheldView[];
  readonly reductions: readonly ReductionView[];
}

/** The R-2 allowlist. Default deny: a member not declared here does not reach the renderer. */
export interface EnvelopeView {
  readonly kind: WidgetKind;
  readonly body_version: number;
  readonly body: WidgetBody;
  readonly provenance: Provenance;
  readonly limitations: readonly Limitation[];
  readonly presentation: Presentation;
  readonly lifecycle: LifecycleView;
  readonly render: RenderReceiptView;
  readonly intents: readonly IntentView[];
}

/** What the shell hands the renderer — the whole of it (R-2). The tier is `view.render.render_tier`. */
export interface RenderInput {
  readonly view: EnvelopeView;
  readonly verdict: IntegrityVerdict;
  readonly env: A11yEnvironment;
  readonly density: Density;
}

// ── output ─────────────────────────────────────────────────────────────────────────────────────

/** A minted string drawn verbatim. */
export interface TextNode {
  readonly t: 'text';
  readonly text: string;
}

/**
 * One Cell, Measure or Phrase leaf. `text` is `Cell.label`, `Measure.formatted` or
 * `Phrase.rendered`; `detail` is `Measure.basis` and null otherwise; `state` is null for a Phrase.
 * A non-KNOWN state is carried as data so it is stated in words, never in colour alone.
 */
export interface LeafNode {
  readonly t: 'leaf';
  readonly source: 'cell' | 'measure' | 'phrase';
  readonly state: CellState | null;
  readonly text: string;
  readonly detail: string | null;
}

/** A heading. `focusTarget` marks the heading focus lands on for the kinds whose row says so. */
export interface HeadingNode {
  readonly t: 'heading';
  readonly level: 2 | 3 | 4;
  readonly text: string;
  readonly focusTarget: boolean;
}

/** Structure without behaviour. `label` is a minted string or null. */
export interface BlockNode {
  readonly t: 'block';
  readonly block: 'group' | 'paragraph' | 'list' | 'ordered_list' | 'item';
  readonly roleHint: RoleHint | null;
  readonly label: string | null;
  readonly children: readonly RenderNode[];
}

/**
 * A server intent drawn as a button. `ref` is `intent:<intent_ref>`; `name` is byte-equal to the
 * sealed `accessible_names[ref]`; `label` is the intent's minted label. `enabled` is drawn, never
 * decided: a non-KNOWN or false state renders the control present plus `explanation`.
 */
export interface ActionNode {
  readonly t: 'action';
  readonly ref: InteractiveRefKey;
  readonly intent_ref: string;
  readonly name: string;
  readonly label: string;
  readonly role: WidgetIntent['role'];
  readonly effect: EffectClass;
  readonly enabled: CellState;
  readonly explanation: LeafNode | null;
}

/**
 * A body element that `reading_order` names and that is not an intent: an option, a slot, a
 * schedule entry, a report section or a table row. `name` is the sealed accessible name.
 * `selects` is the intent a selection is submitted through, or null when none is emitted.
 */
export interface ChoiceNode {
  readonly t: 'choice';
  readonly ref: InteractiveRefKey;
  readonly name: string;
  readonly selects: string | null;
  readonly children: readonly RenderNode[];
}

/** A FORM field. Labels are minted; `refused` marks the fields focus moves to on a refusal. */
export interface FieldNode {
  readonly t: 'field';
  readonly ref: InteractiveRefKey;
  readonly name: string;
  readonly input: 'text' | 'multiline' | 'choice' | 'none';
  readonly help: readonly RenderNode[];
  readonly value: LeafNode | null;
  readonly refused: boolean;
}

export interface TableColumnNode {
  readonly key: string;
  readonly label: string;
  readonly align: 'start' | 'end';
}

export interface TableRowNode {
  readonly row_key: string;
  /** `row:<row_key>` when the row is in `reading_order`, else null. */
  readonly ref: InteractiveRefKey | null;
  /** Parallel to `columns`; null where the row has no value for a column. */
  readonly cells: readonly (LeafNode | null)[];
  /** `row_intents`, drawn as in-row buttons — never a row click handler (A-17). */
  readonly actions: readonly ActionNode[];
}

export interface TableRowGroupNode {
  /** The row-group header when `group_by` is set, else null. */
  readonly label: string | null;
  readonly rows: readonly TableRowNode[];
}

/** A-17: caption, column headers, one row-header column, optional row groups, in-row buttons. */
export interface TableNode {
  readonly t: 'table';
  readonly caption: string;
  readonly columns: readonly TableColumnNode[];
  readonly rowHeaderKey: string;
  readonly groups: readonly TableRowGroupNode[];
}

/** One `limitations[]` entry in prose. Severity is a word, never a colour. */
export interface LimitationNode {
  readonly t: 'limitation';
  readonly code: string;
  readonly severity: Limitation['severity'];
  readonly text: string;
}

export type RenderNode =
  | TextNode
  | LeafNode
  | HeadingNode
  | BlockNode
  | ActionNode
  | ChoiceNode
  | FieldNode
  | TableNode
  | LimitationNode;

/** How the item as a whole is drawn. */
export type RenderMode =
  | 'structured' // the kind's own branch
  | 'prose' // a prose branch: text_equivalent plus intents as buttons
  | 'frozen_prose'; // a non-valid verdict or TEXT_ONLY: text_equivalent plus at most one REFINE

/** Where focus goes when this result is drawn as a new item or an in-place successor (D7). */
export type FocusRule = 'none' | 'heading' | 'first_refused_field';

export interface RenderResult {
  readonly kind: WidgetKind;
  readonly tier: RenderTier;
  readonly density: Density;
  readonly mode: RenderMode;
  readonly roleHint: RoleHint;
  /** `presentation.a11y.label` and `.description`, verbatim. */
  readonly label: string;
  readonly description: string;
  readonly nodes: readonly RenderNode[];
  /** `presentation.text_equivalent`, verbatim; always present (A-21). */
  readonly textEquivalent: TextEquivalent;
  /** `presentation.a11y.reading_order` as keys, in order; DOM order of interactive nodes equals it. */
  readonly readingOrder: readonly InteractiveRefKey[];
  /** `presentation.a11y.accessible_names`, verbatim. */
  readonly accessibleNames: Readonly<Record<string, string>>;
  /** `presentation.a11y.live_region`, verbatim. */
  readonly liveRegion: 'off' | 'polite' | 'assertive';
  /** Minimum milliseconds between announcements; 0 = no throttle (PROGRESS: 5000). */
  readonly announceIntervalMs: number;
  readonly focus: FocusRule;
  readonly motion: 'none' | 'standard';
  readonly lifecycle: LifecycleView;
}
