// K5 — the view projection: what of an envelope the renderer may see (R-2, D1; SHELL-PLAN v2.1 §1.2).
//
// `integrity/h7.ts` has already run on the FULL envelope when this module is called (R-5). What
// leaves here is an ALLOWLIST COPY: every member of `EnvelopeView` is built member by member, and a
// member that is not written below does not exist in the result. A type-level Omit strips no
// runtime bytes, so none is used. Not copied, by construction: widget_id, tenant_id, integrity,
// correlation, source, origin, authority, intent_token, speech_aliases, ordinal, confirmation,
// verification_floor, capability, handoff_capability_ref, the receipt's profile and escalation, and
// every lifecycle member except state, input_lock and on_expiry.
//
// Three rewrites make the view token-free even where the contract puts a token next to a pointer:
//   * a render-receipt pointer (`reachable_via`, `restored_by`) is an emitted token or a route key;
//     it becomes {k:'intent', intent_ref} through the vault, {k:'route', key} for a registry key,
//     or {k:'unresolved'} — the original string is never copied;
//   * a target of class 'w', 'i' or 'c' keeps its class and loses its ref; class 's' keeps its
//     route and loses its param; class 'detail' keeps its route key;
//   * the members copied whole (body, provenance, limitations, presentation, and each intent's
//     enabled, authority_hint and input_schema) pass through `copyData`, which drops any member
//     named like a token at any depth and blanks any string carrying one of this envelope's secrets.
//     The contract already forbids both (a token at any depth, WC:1469), so on a conformant envelope
//     this changes nothing; on a non-conformant one the renderer still never receives the bytes.
//     A member KEY that carries a secret is dropped with its value.
//   * every closed-set member (kind, body_version, lifecycle state/input_lock/on_expiry, render_tier,
//     withheld role/reason, reduction, intent role/effect, density, live_region, role_hint) is checked
//     against the contract's value set; an unknown value is replaced by the most restrictive member,
//     and `conformanceProblems` names it so the shell draws the item as a non-valid verdict (frozen
//     prose). Copied raw, such a member carried a token into RenderInput and RenderResult
//     (integration finding).

import type { A11yBlock, IntentTarget, RoleHint, WidgetEnvelope, WidgetIntent, WidgetKind } from '../contract.ts';
import type {
  EnvelopeView,
  IntentView,
  LifecycleView,
  PointerView,
  ReductionView,
  RenderReceiptView,
  TargetView,
  WithheldView,
} from '../renderer/nodes.ts';
import { BASE_ROUTES, SHELL_ROUTES, resolveRoute } from '../routes/registry.ts';

/** Maps an emitted token of THIS envelope to its `intent_ref`; null when it is not one. */
export type TokenLookup = (token: string) => string | null;

/** Member names that never reach the renderer, at any depth of a copied member (R-2). */
const TOKEN_MEMBERS: ReadonlySet<string> = new Set([
  'intent_token',
  'token',
  'idempotency_key',
  'readback_ref',
  'envelope_seal',
  'principal_proof_hash',
  'tenant_id',
]);

// ── closed value sets (each a Record over the contract union, so a missing or extra member is a type error) ──

const VIEW_KINDS: Readonly<Record<WidgetKind, true>> = {
  CHOICE: true, SERVICE_SELECTOR: true, STAFF_SELECTOR: true, TIME_SLOT_SELECTOR: true, BOOKING_CONFIRMATION: true,
  SCHEDULE: true, CLIENT_LIST: true, METRIC: true, CHART: true, REPORT: true, STRATEGY_OPTIONS: true, APPROVAL: true,
  PROGRESS: true, LIMITATION: true, SOURCE_STATUS: true, SETTINGS_DRAFT: true, FORM: true, CONSENT_STATE: true,
  IDENTITY_BINDING: true, PAYMENT_HANDOFF: true, MEDIA_PREVIEW: true, ARTIFACT: true,
};
const VIEW_INTENT_ROLES: Readonly<Record<IntentView['role'], true>> = {
  primary: true, secondary: true, destructive: true, escape: true, more: true, handoff: true, remedy: true, control: true,
};
const VIEW_EFFECTS: Readonly<Record<IntentView['effect'], true>> = {
  NONE: true, NAVIGATE: true, REFINE: true, CONTROL: true, DRAFT: true, REQUEST_APPROVAL: true, COMMIT: true, HANDOFF: true,
};
const VIEW_LIFECYCLE_STATES: Readonly<Record<LifecycleView['state'], true>> = {
  MINTED: true, DELIVERED: true, LIVE: true, CONSUMED: true, SUPERSEDED: true, EXPIRED: true, CANCELLED: true,
  HISTORISED: true, BODY_DROPPED: true, REDACTED: true,
};
const VIEW_INPUT_LOCKS: Readonly<Record<LifecycleView['input_lock'], true>> = { none: true, soft: true, hard: true };
const VIEW_ON_EXPIRY: Readonly<Record<LifecycleView['on_expiry'], true>> = { re_resolve: true, collapse_to_summary: true, mark_stale: true };
const VIEW_RENDER_TIERS: Readonly<Record<RenderReceiptView['render_tier'], true>> = {
  RICH_INTERACTIVE: true, RICH_CONSTRAINED: true, ANNOUNCEMENT: true, SPOKEN: true, TEXT_ONLY: true, PUBLIC_READ: true, ANONYMOUS_CHAT: true,
};
const VIEW_WITHHELD_REASONS: Readonly<Record<WithheldView['reason'], true>> = {
  capacity: true, carrier_limit: true, verification_floor: true, bridge_absent: true, policy: true, secure_surface_only: true,
};
const VIEW_REDUCTIONS: Readonly<Record<ReductionView['reduction'], true>> = { summarised: true, paginated: true, masked: true, omitted: true };
const VIEW_DENSITIES: Readonly<Record<EnvelopeView['presentation']['density'], true>> = { INLINE: true, CARD: true, SHEET: true };
const VIEW_LIVE_REGIONS: Readonly<Record<A11yBlock['live_region'], true>> = { off: true, polite: true, assertive: true };
const VIEW_ROLE_HINTS: Readonly<Record<RoleHint, true>> = {
  group: true, radiogroup: true, listbox: true, table: true, grid: true, document: true, status: true, progressbar: true,
  form: true, region: true, img: true, link: true,
};

const inSet = <T extends string>(set: Readonly<Record<T, true>>, value: unknown): value is T =>
  typeof value === 'string' && Object.hasOwn(set, value);
/** The member itself when it is in the closed set; otherwise the most restrictive member. */
const closed = <T extends string>(set: Readonly<Record<T, true>>, value: unknown, fallback: T): T => (inSet(set, value) ? value : fallback);
const isBodyVersion = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 999;

/**
 * Every closed-set member of `envelope` whose value is outside the contract's set, by path. Empty for a
 * conformant envelope. The shell draws a non-empty result as a non-valid verdict.
 */
export const conformanceProblems = (envelope: WidgetEnvelope): readonly string[] => {
  const problems: string[] = [];
  const check = <T extends string>(where: string, set: Readonly<Record<T, true>>, value: unknown): void => {
    if (!inSet(set, value)) problems.push(where);
  };
  check('kind', VIEW_KINDS, envelope.kind);
  if (!isBodyVersion(envelope.body_version)) problems.push('body_version');
  check('lifecycle.state', VIEW_LIFECYCLE_STATES, envelope.lifecycle?.state);
  check('lifecycle.input_lock', VIEW_INPUT_LOCKS, envelope.lifecycle?.input_lock);
  check('lifecycle.on_expiry', VIEW_ON_EXPIRY, envelope.lifecycle?.on_expiry);
  check('render.render_tier', VIEW_RENDER_TIERS, envelope.render?.render_tier);
  for (const w of listOf<{ role: unknown; reason: unknown }>(envelope.render?.intents_withheld)) {
    check('render.intents_withheld[].role', VIEW_INTENT_ROLES, w?.role);
    check('render.intents_withheld[].reason', VIEW_WITHHELD_REASONS, w?.reason);
  }
  for (const r of listOf<{ reduction: unknown }>(envelope.render?.body_reductions)) check('render.body_reductions[].reduction', VIEW_REDUCTIONS, r?.reduction);
  for (const intent of listOf<WidgetIntent>(envelope.intents)) {
    check('intents[].role', VIEW_INTENT_ROLES, intent?.role);
    check('intents[].effect', VIEW_EFFECTS, intent?.effect);
  }
  check('presentation.density', VIEW_DENSITIES, envelope.presentation?.density);
  check('presentation.a11y.live_region', VIEW_LIVE_REGIONS, envelope.presentation?.a11y?.live_region);
  check('presentation.a11y.role_hint', VIEW_ROLE_HINTS, envelope.presentation?.a11y?.role_hint);
  return problems;
};

/** Shorter secrets are matched by equality only, so a short value cannot blank ordinary text. */
const CONTAINMENT_MIN = 8;
const MAX_DEPTH = 64;

/**
 * The strings of one envelope that must not reach the renderer: every intent token, every class-'i'
 * ref, every confirmation idempotency key and readback ref, the tenant, the seal, the principal proof,
 * and every receipt pointer that is not a registry route key.
 */
export const secretsOf = (envelope: WidgetEnvelope): readonly string[] => {
  const out = new Set<string>();
  const add = (value: unknown): void => {
    if (typeof value === 'string' && value.length > 0) out.add(value);
  };
  for (const intent of listOf<WidgetIntent>(envelope.intents)) {
    add(intent.intent_token);
    if (intent.target !== null && typeof intent.target === 'object' && intent.target.class === 'i') add(intent.target.ref);
    if (intent.confirmation !== null && typeof intent.confirmation === 'object') {
      add(intent.confirmation.idempotency_key);
      add(intent.confirmation.readback_ref);
    }
  }
  add(envelope.tenant_id);
  add(envelope.integrity?.envelope_seal);
  add(envelope.integrity?.principal_proof_hash);
  const receipt = envelope.render;
  for (const w of listOf<{ reachable_via: unknown }>(receipt?.intents_withheld))
    if (typeof w.reachable_via === 'string' && resolveRoute(w.reachable_via) === null) add(w.reachable_via);
  for (const r of listOf<{ restored_by: unknown }>(receipt?.body_reductions))
    if (typeof r.restored_by === 'string' && resolveRoute(r.restored_by) === null) add(r.restored_by);
  return [...out];
};

const listOf = <T>(value: unknown): readonly T[] => (Array.isArray(value) ? value : []);

const carriesSecret = (text: string, secrets: readonly string[]): boolean =>
  secrets.some((s) => (s.length >= CONTAINMENT_MIN ? text.includes(s) : text === s));

/**
 * A deep copy of JSON data. Plain objects keep their own enumerable members except the token-named
 * ones and any member whose KEY carries a secret; arrays keep their order; a string carrying a secret
 * becomes ''. Anything that is not JSON data (a function, undefined, a non-finite number, a depth
 * beyond 64) is dropped.
 */
export const copyData = (value: unknown, secrets: readonly string[], depth = 0): unknown => {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') return carriesSecret(value, secrets) ? '' : value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'object' || depth >= MAX_DEPTH) return undefined;
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value) {
      const copied = copyData(item, secrets, depth + 1);
      out.push(copied === undefined ? null : copied);
    }
    return out;
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    if (TOKEN_MEMBERS.has(key) || carriesSecret(key, secrets)) continue;
    const copied = copyData(Object.getOwnPropertyDescriptor(value, key)?.value, secrets, depth + 1);
    if (copied !== undefined) out[key] = copied;
  }
  return out;
};

/** `copyData` typed as its input: the copy has the input's shape minus what the contract forbids. */
const copyAs = <T>(value: T, secrets: readonly string[]): T => copyData(value, secrets) as T;

const text = (value: unknown, secrets: readonly string[]): string =>
  typeof value === 'string' && !carriesSecret(value, secrets) ? value : '';

const ownLookup = (envelope: WidgetEnvelope): TokenLookup => {
  const refs = new Map<string, string>();
  for (const intent of listOf<WidgetIntent>(envelope.intents))
    if (typeof intent.intent_token === 'string' && typeof intent.intent_ref === 'string') refs.set(intent.intent_token, intent.intent_ref);
  return (token) => refs.get(token) ?? null;
};

/** A receipt pointer, rewritten: never the original string (D1). */
export const pointerView = (pointer: unknown, lookup: TokenLookup): PointerView => {
  if (typeof pointer !== 'string') return { k: 'unresolved' };
  const intentRef = lookup(pointer);
  if (intentRef !== null) return { k: 'intent', intent_ref: intentRef };
  const route = resolveRoute(pointer);
  return route === null ? { k: 'unresolved' } : { k: 'route', key: route.key };
};

/** An intent target, projected: refs of 'w'/'i'/'c' and the param of 's' are dropped (D1). */
export const targetView = (target: IntentTarget | null, secrets: readonly string[]): TargetView | null => {
  if (target === null || typeof target !== 'object') return null;
  switch (target.class) {
    case 'w':
      return { class: 'w' };
    case 'i':
      return { class: 'i' };
    case 'c':
      return { class: 'c' };
    case 's': {
      const route: unknown = target.ref !== null && typeof target.ref === 'object' ? target.ref.route : null;
      const known = BASE_ROUTES.find((k) => k === route) ?? SHELL_ROUTES.find((k) => k === route);
      return known === undefined ? null : { class: 's', route: known };
    }
    case 'detail':
      return typeof target.ref === 'string' ? { class: 'detail', route_key: text(target.ref, secrets) } : null;
    default:
      return null;
  }
};

const intentView = (intent: WidgetIntent, secrets: readonly string[]): IntentView => ({
  intent_ref: text(intent.intent_ref, secrets),
  role: closed(VIEW_INTENT_ROLES, intent.role, 'secondary'),
  label: text(intent.label, secrets),
  utterance_preview: text(intent.utterance_preview, secrets),
  priority: typeof intent.priority === 'number' && Number.isFinite(intent.priority) ? intent.priority : 0,
  // Not REFINE (the one class a frozen item still draws) and not NONE (dismissed locally).
  effect: closed(VIEW_EFFECTS, intent.effect, 'CONTROL'),
  enabled: copyAs(intent.enabled, secrets),
  authority_hint: copyAs(intent.authority_hint, secrets),
  input_schema: intent.input_schema === null ? null : copyAs(intent.input_schema, secrets),
  target: targetView(intent.target, secrets),
});

const lifecycleView = (envelope: WidgetEnvelope): LifecycleView => ({
  // HISTORISED: no intent is consumable; `hard`: the strictest lock; collapse: the quiet expiry.
  state: closed(VIEW_LIFECYCLE_STATES, envelope.lifecycle.state, 'HISTORISED'),
  input_lock: closed(VIEW_INPUT_LOCKS, envelope.lifecycle.input_lock, 'hard'),
  on_expiry: closed(VIEW_ON_EXPIRY, envelope.lifecycle.on_expiry, 'collapse_to_summary'),
});

const receiptView = (envelope: WidgetEnvelope, lookup: TokenLookup, secrets: readonly string[]): RenderReceiptView => ({
  render_tier: closed(VIEW_RENDER_TIERS, envelope.render.render_tier, 'TEXT_ONLY'),
  withheld: listOf<WidgetEnvelope['render']['intents_withheld'][number]>(envelope.render.intents_withheld).map(
    (w): WithheldView => ({
      role: closed(VIEW_INTENT_ROLES, w.role, 'more'),
      reason: closed(VIEW_WITHHELD_REASONS, w.reason, 'policy'),
      reachable_via: pointerView(w.reachable_via, lookup),
    }),
  ),
  reductions: listOf<WidgetEnvelope['render']['body_reductions'][number]>(envelope.render.body_reductions).map(
    (r): ReductionView => ({ path: text(r.path, secrets), reduction: closed(VIEW_REDUCTIONS, r.reduction, 'omitted'), restored_by: pointerView(r.restored_by, lookup) }),
  ),
});

/** `presentation` copied whole, then its closed-set members held to their sets. */
const presentationView = (envelope: WidgetEnvelope, secrets: readonly string[]): EnvelopeView['presentation'] => {
  const copied = copyAs(envelope.presentation, secrets);
  const a11y = copied.a11y;
  return {
    ...copied,
    density: closed(VIEW_DENSITIES, copied.density, 'CARD'),
    a11y: { ...a11y, live_region: closed(VIEW_LIVE_REGIONS, a11y.live_region, 'off'), role_hint: closed(VIEW_ROLE_HINTS, a11y.role_hint, 'group') },
  };
};

/**
 * Project a verified envelope to the renderer's allowlist view. `lookup` is the vault's token → ref
 * map for this emission; without one, the envelope's own intents are used (the same pairs the vault
 * holds). The result shares no object with the envelope.
 */
export const project = (envelope: WidgetEnvelope, lookup?: TokenLookup): EnvelopeView => {
  const secrets = secretsOf(envelope);
  const refOf = lookup ?? ownLookup(envelope);
  return {
    // An unknown kind draws as METRIC's floor row (no focus move, no live region); the shell also marks
    // the verdict non-valid, so only the frozen text equivalent is drawn.
    kind: closed(VIEW_KINDS, envelope.kind, 'METRIC'),
    body_version: isBodyVersion(envelope.body_version) ? envelope.body_version : 0,
    body: copyAs(envelope.body, secrets),
    provenance: copyAs(envelope.provenance, secrets),
    limitations: copyAs(listOf<WidgetEnvelope['limitations'][number]>(envelope.limitations), secrets),
    presentation: presentationView(envelope, secrets),
    lifecycle: lifecycleView(envelope),
    render: receiptView(envelope, refOf, secrets),
    intents: listOf<WidgetIntent>(envelope.intents).map((intent) => intentView(intent, secrets)),
  };
};

/** Alias the dev fixture host detects (`project` | `projectView`). */
export const projectView = project;
