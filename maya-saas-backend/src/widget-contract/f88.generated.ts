// GENERATED FROM THE CERTIFIED CONTRACT - do not hand-edit.
// Source:     docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md, section 0.15 F88 (the union), F88.1 (the role
//             declaration it quotes) and F88.2 (the six structural locations), with section 1.3
//             CellState and section 4.1 LifecycleState for the two state enums F88.2 requires by type.
// Regenerate: node scripts/widget-contract/emit-f88.mjs
//
// F88 states its union ONCE. This file is that statement compiled; `scripts/widget-contract-check.mjs`
// checks the same union statically, and a build test (F88-8) asserts the two are equal, so the list
// cannot drift into the two-places state R3.8.2 records.
//
// F88.2's exemptions are (shape, path, depth, type) TUPLES, never key names. There is no `key` member
// on `F88Exemption` and none in the table below: a row's key is derived from its path by the walk, so
// no row can name a key without also naming where it sits. F88.2: "an implementation that can express
// 'the key k is allowed' is non-conforming, whatever its current contents".

/** F88's mechanism names the five serialized values its one walk is applied to. */
export const F88_WALK_ROOTS = Object.freeze([
  'WidgetEnvelope',
  'WidgetIntentSubmission',
  'ChannelProfile',
  'NativeBridgeManifest',
  'IntentRecord',
] as const);

export type F88WalkRoot = (typeof F88_WALK_ROOTS)[number];

/** section 0.15 F88 - the union, 28 keys, parsed from the clause's own paragraph. */
export const F88_FORBIDDEN_KEYS = Object.freeze([
  'arguments',
  'payload',
  'state',
  'role',
  'permissions',
  'token',
  'tenant_id',
  'client_id',
  'staff_id',
  'record_id',
  'is_staff',
  'is_owner',
  '__meRole',
  '__meIsStaff',
  '__meIsFounder',
  'url',
  'href',
  'endpoint',
  'checkout_url',
  'return_url',
  'provider_ref',
  'bridge_method',
  'required_verification',
  'interaction_model',
  'four_eyes',
  'fourEyes',
  'booking_effect',
  'presentation_hint',
] as const);

/** section 1.3 - the declared body cell state enum (F88.2 row 1's required type). */
export const CELL_STATE = Object.freeze([
  'KNOWN',
  'PARTIAL',
  'NOT_MEASURED',
  'UNAVAILABLE',
  'PENDING',
] as const);

/** section 4.1 - the declared lifecycle enum (F88.2 row 2's required type). */
export const LIFECYCLE_STATE = Object.freeze([
  'MINTED',
  'DELIVERED',
  'LIVE',
  'CONSUMED',
  'SUPERSEDED',
  'EXPIRED',
  'CANCELLED',
  'HISTORISED',
  'BODY_DROPPED',
  'REDACTED',
] as const);

/** section 3.1 as F88.1 quotes it - the eight members (rows 5 and 6's required type). */
export const WIDGET_INTENT_ROLE = Object.freeze([
  'primary',
  'secondary',
  'destructive',
  'escape',
  'more',
  'handoff',
  'remedy',
  'control',
] as const);

/**
 * One admitted structural location. `accepts` is the row's declared type as a runtime predicate:
 * the type is half of the permission (F88.1), so a value outside it is not exempt.
 */
export interface F88Exemption {
  /** F88.2's own row number, so an audit can quote the row. */
  readonly row: number;
  readonly shape: string;
  /** The location inside `shape`; array steps are written `[]` and add no depth. */
  readonly path: string;
  readonly depth: number;
  /** The contract's own words in the type column, carried so a drift is visible. */
  readonly declaredType: string;
  readonly accepts: (value: unknown) => boolean;
  readonly note: string;
}

const isString = (value: unknown): boolean => typeof value === 'string';
const inSet =
  (values: readonly string[]) =>
  (value: unknown): boolean =>
    typeof value === 'string' && values.includes(value);

/** section 0.15 F88.2 - the closed table, exactly 6 rows. */
export const F88_EXEMPTIONS: readonly F88Exemption[] = Object.freeze([
  Object.freeze({
    row: 1,
    shape: 'Cell',
    path: 'state',
    depth: 0,
    declaredType: 'CellState',
    accepts: inSet(CELL_STATE),
    note: 'the declared body cell state enum (§1.2)',
  }),
  Object.freeze({
    row: 2,
    shape: 'Lifecycle',
    path: 'state',
    depth: 0,
    declaredType: 'LifecycleState',
    accepts: inSet(LIFECYCLE_STATE),
    note: 'the declared lifecycle enum (§4.1)',
  }),
  Object.freeze({
    row: 3,
    shape: 'WidgetEnvelope',
    path: 'tenant_id',
    depth: 0,
    declaredType: 'string',
    accepts: isString,
    note: 'the canonical root binding (§1.1.1: *uuid v4, root only*)',
  }),
  Object.freeze({
    row: 4,
    shape: 'IntentRecord',
    path: 'tenant_id',
    depth: 0,
    declaredType: 'string',
    accepts: isString,
    note: 'internal persistence / audit binding (§3.7)',
  }),
  Object.freeze({
    row: 5,
    shape: 'WidgetIntent',
    path: 'role',
    depth: 0,
    declaredType: 'the eight-member enum §3.1 declares',
    accepts: inSet(WIDGET_INTENT_ROLE),
    note: 'the presentation role (F88.1)',
  }),
  Object.freeze({
    row: 6,
    shape: 'RenderReceipt',
    path: 'intents_withheld[].role',
    depth: 1,
    declaredType: "exactly WidgetIntent['role']",
    accepts: inSet(WIDGET_INTENT_ROLE),
    note: 'frozen presentation metadata of an intent that already existed (§4.5.5)',
  }),
]);
