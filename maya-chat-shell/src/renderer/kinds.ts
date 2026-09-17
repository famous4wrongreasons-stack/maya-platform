// K5 — the per-kind accessibility floor (WC §4.8.2), as data the renderer, the DOM host and the
// conformance suite all read (D7).
//
// Named KIND_A11Y_FLOOR, never KIND_FLOOR: that name is a contract export with a different meaning
// (the verification floor per kind), and the build refuses a shell declaration that collides with
// one (V2-7).
//
// Total by type (a Record over the 22-member WidgetKind union), and counted exactly once more by
// KIND_ORDER below, whose literal length is 22 and which must cover the union — so a kind added to
// the contract without a row here fails the build rather than rendering without a floor.
//
// role_hint is NOT a column: it is KIND_REGISTRY's, sealed into presentation.a11y.role_hint, and the
// renderer draws the sealed value. Suffix descriptors are used by tests to check the sealed
// accessible names (A-2); the renderer never composes a name from them.

import type { InteractiveRef, SuffixSpec, WidgetIntent, WidgetKind } from '../contract.ts';
import type { FocusRule } from './nodes.ts';

/** The keyboard model a kind owes (the §4.8.2 "keyboard model" column, one token per model). */
export type KeyboardModel =
  | 'roving_options' // one tab stop; arrows move; Enter/Space select; Home/End
  | 'roving_grouped_slots' // arrows within a group; PageUp/PageDown across groups; Home/End; Enter
  | 'heading_then_buttons' // focus lands on the heading; controls are buttons in reading_order
  | 'grid' // lane = row header, time = column header; entry controls are buttons inside cells
  | 'data_table' // A-17: row intents are in-row buttons; bulk intents outside the table
  | 'buttons' // controls are ordinary tab stops
  | 'table_disclosure' // A-8: the table equivalent is reachable by keyboard from the chart
  | 'headings' // headings navigable (depth 1 -> h3, depth 2 -> h4); fullscreen control a link
  | 'form_fields' // labels associated; Enter does not submit a multi-field form
  | 'not_focusable' // the item is not a tab stop; its controls are
  | 'single_link'; // one tab stop; Enter activates

/** The §4.8.2 "text alternative" column. */
export type TextAlternative =
  | 'itemized_and_options'
  | 'option_measures_in_name'
  | 'availability_in_name'
  | 'itemized_per_group_and_completeness'
  | 'full_itemized_lines'
  | 'lane_then_entry_lines'
  | 'caption_header_and_rows'
  | 'every_measure_with_basis'
  | 'table_equivalent_in_full'
  | 'summary_narratives_and_tables'
  | 'alternatives_in_full'
  | 'effect_preview_audience_expiry'
  | 'step_labels_and_states'
  | 'headline_detail_codes'
  | 'source_lines'
  | 'whole_diff'
  | 'fields_help_values_justification'
  | 'decision_in_full'
  | 'bindings_in_full'
  | 'payment_in_full'
  | 'recipe_and_alt'
  | 'file_facts';

export interface LiveRegionRow {
  /** The sealed `presentation.a11y.live_region` must equal this ('assertive_iff_blocking' resolves per body). */
  readonly region: 'off' | 'polite' | 'assertive_iff_blocking';
  /** When an announcement is due: on every change, on re-resolve, or on a page change. */
  readonly when: 'never' | 'change' | 're_resolve' | 'page_change';
  /** Minimum milliseconds between announcements; PROGRESS alone is throttled (≥ 5 s). */
  readonly minIntervalMs: number;
}

/** `${ref.k}:${role}` for an intent ref, `${ref.k}:*` for every other ref kind (WC §4.8.2). */
export type SuffixKey = `${InteractiveRef['k']}:${WidgetIntent['role'] | '*'}`;

export interface KindFloorRow {
  readonly branch: 'structured' | 'prose';
  readonly keyboardModel: KeyboardModel;
  readonly focus: FocusRule;
  readonly textAlternative: TextAlternative;
  readonly liveRegion: LiveRegionRow;
  /** Body paths whose state is stated in words, never in colour alone (A-7). */
  readonly nonColourState: readonly string[];
  /** The composition descriptors; `{}` is the declared default (empty). Present on every row. */
  readonly accessibleNameSuffix: Readonly<Partial<Record<SuffixKey, SuffixSpec>>>;
}

const OFF: LiveRegionRow = { region: 'off', when: 'never', minIntervalMs: 0 };
const POLITE: LiveRegionRow = { region: 'polite', when: 'change', minIntervalMs: 0 };
const DEFAULT_SUFFIX = {} as const;

export const KIND_A11Y_FLOOR = {
  CHOICE: {
    branch: 'structured',
    keyboardModel: 'roving_options',
    focus: 'none',
    textAlternative: 'itemized_and_options',
    liveRegion: OFF,
    nonColourState: ['options[].enabled'],
    accessibleNameSuffix: DEFAULT_SUFFIX,
  },
  SERVICE_SELECTOR: {
    branch: 'structured',
    keyboardModel: 'roving_options',
    focus: 'none',
    textAlternative: 'option_measures_in_name',
    liveRegion: OFF,
    nonColourState: ['options[].requires_consultation'],
    accessibleNameSuffix: { 'option:*': { base: 'element', pointers: ['duration', 'price'] } },
  },
  STAFF_SELECTOR: {
    branch: 'structured',
    keyboardModel: 'roving_options',
    focus: 'none',
    textAlternative: 'availability_in_name',
    liveRegion: OFF,
    nonColourState: [],
    accessibleNameSuffix: { 'option:*': { base: 'element', pointers: ['nearest_availability'] } },
  },
  TIME_SLOT_SELECTOR: {
    branch: 'structured',
    keyboardModel: 'roving_grouped_slots',
    focus: 'none',
    textAlternative: 'itemized_per_group_and_completeness',
    liveRegion: { region: 'polite', when: 're_resolve', minIntervalMs: 0 },
    nonColourState: ['groups[].slots[].availability'],
    accessibleNameSuffix: DEFAULT_SUFFIX,
  },
  BOOKING_CONFIRMATION: {
    branch: 'structured',
    keyboardModel: 'heading_then_buttons',
    focus: 'heading',
    textAlternative: 'full_itemized_lines',
    liveRegion: POLITE,
    nonColourState: ['policy_notices[]'],
    accessibleNameSuffix: DEFAULT_SUFFIX,
  },
  SCHEDULE: {
    branch: 'structured',
    keyboardModel: 'grid',
    focus: 'none',
    textAlternative: 'lane_then_entry_lines',
    liveRegion: POLITE,
    nonColourState: ['entries[].state', 'entries[].pii_masked'],
    accessibleNameSuffix: DEFAULT_SUFFIX,
  },
  CLIENT_LIST: {
    branch: 'structured',
    keyboardModel: 'data_table',
    focus: 'none',
    textAlternative: 'caption_header_and_rows',
    liveRegion: { region: 'polite', when: 'page_change', minIntervalMs: 0 },
    nonColourState: ['segment_label', 'pii_masked'],
    accessibleNameSuffix: {
      'intent:primary': { base: 'body', pointers: ['bulk_intents[⟨entry whose intent handle is ref.id⟩].audience_size'] },
    },
  },
  METRIC: {
    branch: 'structured',
    keyboardModel: 'buttons',
    focus: 'none',
    textAlternative: 'every_measure_with_basis',
    liveRegion: OFF,
    nonColourState: ['metrics[].comparison.direction'],
    accessibleNameSuffix: DEFAULT_SUFFIX,
  },
  CHART: {
    branch: 'prose',
    keyboardModel: 'table_disclosure',
    focus: 'none',
    textAlternative: 'table_equivalent_in_full',
    liveRegion: OFF,
    nonColourState: ['series[]'],
    accessibleNameSuffix: DEFAULT_SUFFIX,
  },
  REPORT: {
    branch: 'structured',
    keyboardModel: 'headings',
    focus: 'none',
    textAlternative: 'summary_narratives_and_tables',
    liveRegion: OFF,
    nonColourState: [],
    accessibleNameSuffix: DEFAULT_SUFFIX,
  },
  STRATEGY_OPTIONS: {
    branch: 'structured',
    keyboardModel: 'roving_options',
    focus: 'none',
    textAlternative: 'alternatives_in_full',
    liveRegion: OFF,
    nonColourState: ['alternatives[].risk_tier', 'alternatives[].reversible'],
    // Explicitly empty: an alternative's accessible name is its title, verbatim.
    accessibleNameSuffix: DEFAULT_SUFFIX,
  },
  APPROVAL: {
    branch: 'structured',
    keyboardModel: 'buttons',
    focus: 'none',
    textAlternative: 'effect_preview_audience_expiry',
    liveRegion: POLITE,
    nonColourState: ['state'],
    accessibleNameSuffix: {
      'intent:primary': { base: 'body', pointers: ['audience_size', 'risk_tier', 'reversible'] },
    },
  },
  PROGRESS: {
    branch: 'structured',
    keyboardModel: 'buttons',
    focus: 'none',
    textAlternative: 'step_labels_and_states',
    liveRegion: { region: 'polite', when: 'change', minIntervalMs: 5000 },
    nonColourState: ['steps[].state'],
    accessibleNameSuffix: DEFAULT_SUFFIX,
  },
  LIMITATION: {
    branch: 'structured',
    keyboardModel: 'buttons',
    focus: 'none',
    textAlternative: 'headline_detail_codes',
    liveRegion: { region: 'assertive_iff_blocking', when: 'change', minIntervalMs: 0 },
    nonColourState: ['severity'],
    accessibleNameSuffix: DEFAULT_SUFFIX,
  },
  SOURCE_STATUS: {
    branch: 'structured',
    keyboardModel: 'buttons',
    focus: 'none',
    textAlternative: 'source_lines',
    liveRegion: POLITE,
    nonColourState: ['sources[].state', 'overall'],
    accessibleNameSuffix: DEFAULT_SUFFIX,
  },
  SETTINGS_DRAFT: {
    branch: 'structured',
    keyboardModel: 'buttons',
    focus: 'none',
    textAlternative: 'whole_diff',
    liveRegion: POLITE,
    nonColourState: ['diff[].reversible'],
    accessibleNameSuffix: DEFAULT_SUFFIX,
  },
  FORM: {
    branch: 'structured',
    keyboardModel: 'form_fields',
    focus: 'first_refused_field',
    textAlternative: 'fields_help_values_justification',
    liveRegion: POLITE,
    nonColourState: ['limitations[]'],
    accessibleNameSuffix: DEFAULT_SUFFIX,
  },
  CONSENT_STATE: {
    branch: 'prose',
    keyboardModel: 'heading_then_buttons',
    focus: 'heading',
    textAlternative: 'decision_in_full',
    liveRegion: POLITE,
    nonColourState: ['decision'],
    accessibleNameSuffix: DEFAULT_SUFFIX,
  },
  IDENTITY_BINDING: {
    branch: 'prose',
    keyboardModel: 'buttons',
    focus: 'none',
    textAlternative: 'bindings_in_full',
    liveRegion: POLITE,
    nonColourState: ['bindings[].state'],
    accessibleNameSuffix: DEFAULT_SUFFIX,
  },
  PAYMENT_HANDOFF: {
    branch: 'prose',
    keyboardModel: 'heading_then_buttons',
    focus: 'heading',
    textAlternative: 'payment_in_full',
    liveRegion: POLITE,
    nonColourState: ['amount_total'],
    accessibleNameSuffix: DEFAULT_SUFFIX,
  },
  MEDIA_PREVIEW: {
    branch: 'prose',
    keyboardModel: 'not_focusable',
    focus: 'none',
    textAlternative: 'recipe_and_alt',
    liveRegion: OFF,
    nonColourState: ['recipe.produced_at'],
    accessibleNameSuffix: DEFAULT_SUFFIX,
  },
  ARTIFACT: {
    branch: 'structured',
    keyboardModel: 'single_link',
    focus: 'none',
    textAlternative: 'file_facts',
    liveRegion: OFF,
    nonColourState: ['contains_pii', 'expires_at'],
    accessibleNameSuffix: {
      'intent:primary': { base: 'body', pointers: ['filename', 'format', 'size_bytes'] },
    },
  },
} as const satisfies Record<WidgetKind, KindFloorRow>;

/**
 * The build assertion (WC §4.8.2): exactly twenty-two branches keyed on WidgetKind. The tuple's
 * literal length must be 22 and it must cover the union, so a missing, extra or duplicated kind is
 * a type error — the build refuses before any test runs.
 */
export const KIND_ORDER = [
  'CHOICE',
  'SERVICE_SELECTOR',
  'STAFF_SELECTOR',
  'TIME_SLOT_SELECTOR',
  'BOOKING_CONFIRMATION',
  'SCHEDULE',
  'CLIENT_LIST',
  'METRIC',
  'CHART',
  'REPORT',
  'STRATEGY_OPTIONS',
  'APPROVAL',
  'PROGRESS',
  'LIMITATION',
  'SOURCE_STATUS',
  'SETTINGS_DRAFT',
  'FORM',
  'CONSENT_STATE',
  'IDENTITY_BINDING',
  'PAYMENT_HANDOFF',
  'MEDIA_PREVIEW',
  'ARTIFACT',
] as const satisfies readonly WidgetKind[];

type Covers<U, T extends readonly unknown[]> = [Exclude<U, T[number]>] extends [never] ? true : false;
/** A type error unless KIND_ORDER names every WidgetKind. */
export const KIND_ORDER_IS_TOTAL: Covers<WidgetKind, typeof KIND_ORDER> = true;
/** A type error unless KIND_ORDER has exactly 22 members (with totality: 22 distinct kinds). */
export const KIND_ORDER_LENGTH: 22 = KIND_ORDER.length;

/** Rows whose `accessibleNameSuffix` is present and not undefined — the count WC §4.8.2 names. */
export const KIND_BRANCH_COUNT: number = KIND_ORDER.filter((kind) => KIND_A11Y_FLOOR[kind].accessibleNameSuffix !== undefined).length;

/** Where focus goes for a kind (D7): the heading kinds, FORM's first refused field, else none. */
export const focusRuleOf = (kind: WidgetKind): FocusRule => KIND_A11Y_FLOOR[kind].focus;

/** The PROGRESS throttle and every other kind's 0. */
export const announceIntervalOf = (kind: WidgetKind): number => KIND_A11Y_FLOOR[kind].liveRegion.minIntervalMs;

/** The five prose branches (WC §2.6 emittability; §1.11 of the shell plan). */
export const isProseKind = (kind: WidgetKind): boolean => KIND_A11Y_FLOOR[kind].branch === 'prose';
