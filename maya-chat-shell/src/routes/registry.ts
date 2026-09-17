// K5 — the route registry.
//
// Today's PWA has 101 Maya-owned primary-nav entries and six self-mounting overlays. The target is
// five destinations and a conversation. This file is where that becomes structural rather than
// aspirational: a route that is not here does not exist, and a surface cannot mount itself.
//
// The five base routes are the primary navigation, entire. Everything else a person can reach is
// reached THROUGH the conversation, as a fullscreen intent — which is why the route registry and
// the fullscreen-intent path are one file and not two.
//
// Spelling. The keys are the certified contract's (WC §3.3 `ShellRoute`): the server names a
// destination as `{ class: 's', ref: { route: 'shell.privacy', param: null } }`, and a registry
// spelled any other way would leave that target unresolvable. The type check below the route
// constants holds the two spellings together, so a drift on either side fails the build.

import type { DetailRouteKey, IntentTarget, ShellRoute } from '../contract.ts';

/** The five, and no more. §K16 completes the reduction; K5 makes the target representable. */
export const BASE_ROUTES = Object.freeze(['shell.root', 'shell.account', 'shell.connections', 'shell.privacy', 'shell.notifications'] as const);
export type BaseRoute = (typeof BASE_ROUTES)[number];

/**
 * Two shell routes that are not destinations: they are hand-offs the shell performs on behalf of a
 * widget. They are listed separately because they are not places a person navigates to — they are
 * things that happen and then return. Each carries exactly one opaque server-minted handle
 * (`shell.pay` a session_ref, `shell.file` an artifact_ref; WC F71), checked by `isRouteParam`.
 */
export const SHELL_ROUTES = Object.freeze(['shell.pay', 'shell.file'] as const);
export type ShellRouteKey = (typeof SHELL_ROUTES)[number];

/**
 * The nine route keys that replace the six self-mounting overlays.
 *
 * The old overlays mounted themselves: a component decided it should be on screen and put itself
 * there, which is why the app could show two of them at once and why nothing could enumerate what
 * was open. A route key is the opposite — the shell owns what is mounted, and a surface asks.
 *
 * The contract still types a detail key as any string (`DetailRouteKey`). Until that text is
 * narrowed to these nine (erratum R7-E3), the shell resolves no other detail key.
 */
export const FULLSCREEN_ROUTES = Object.freeze([
  'fs.booking',
  'fs.client-card',
  'fs.calendar',
  'fs.catalogue',
  'fs.team-thread',
  'fs.report',
  'fs.consent',
  'fs.payment',
  'fs.media',
] as const);
export type FullscreenRoute = (typeof FULLSCREEN_ROUTES)[number];

export type RouteKey = BaseRoute | ShellRouteKey | FullscreenRoute;

// The registry spells exactly what the contract spells. `Holds<false>` is a type error, so a
// contract regeneration that renames, adds or removes a shell route fails the build here.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Holds<T extends true> = T;
type SpelledAsTheContract = [
  Holds<Same<BaseRoute, Extract<ShellRoute, { param: null }>['route']>>,
  Holds<Same<ShellRouteKey, Exclude<ShellRoute, { param: null }>['route']>>,
];

export const ALL_ROUTES: readonly RouteKey[] = Object.freeze([...BASE_ROUTES, ...SHELL_ROUTES, ...FULLSCREEN_ROUTES]);

/** The six overlays K5 retires, named so the nine-for-six replacement is checkable. */
export const RETIRED_OVERLAYS = [
  'promo-overlay',
  'cabinet-modal',
  'team-comms-overlay',
  'consent-gate-overlay',
  'tips-overlay',
  'shop-sheet',
] as const;

export interface RouteDefinition {
  readonly key: RouteKey;
  /** What a person would call it. Used for the spoken and text-only tiers, so it is not optional. */
  readonly label: string;
  /**
   * A fullscreen route is reached by an intent, never by a component deciding to appear. This is
   * the name of that intent, and its absence is what "self-mounting" would mean.
   */
  readonly fullscreenIntent: string | null;
}

export const ROUTES: Readonly<Record<RouteKey, RouteDefinition>> = Object.freeze({
  'shell.root': { key: 'shell.root', label: 'Майя', fullscreenIntent: null },
  'shell.account': { key: 'shell.account', label: 'Аккаунт', fullscreenIntent: null },
  'shell.connections': { key: 'shell.connections', label: 'Подключения', fullscreenIntent: null },
  'shell.privacy': { key: 'shell.privacy', label: 'Приватность и данные', fullscreenIntent: null },
  'shell.notifications': { key: 'shell.notifications', label: 'Уведомления', fullscreenIntent: null },

  'shell.pay': { key: 'shell.pay', label: 'Оплата', fullscreenIntent: 'shell.pay.open' },
  'shell.file': { key: 'shell.file', label: 'Файл', fullscreenIntent: 'shell.file.open' },

  'fs.booking': { key: 'fs.booking', label: 'Запись', fullscreenIntent: 'fs.booking.open' },
  'fs.client-card': { key: 'fs.client-card', label: 'Карточка клиента', fullscreenIntent: 'fs.client-card.open' },
  'fs.calendar': { key: 'fs.calendar', label: 'Расписание', fullscreenIntent: 'fs.calendar.open' },
  'fs.catalogue': { key: 'fs.catalogue', label: 'Услуги', fullscreenIntent: 'fs.catalogue.open' },
  'fs.team-thread': { key: 'fs.team-thread', label: 'Чат смены', fullscreenIntent: 'fs.team-thread.open' },
  'fs.report': { key: 'fs.report', label: 'Отчёт', fullscreenIntent: 'fs.report.open' },
  'fs.consent': { key: 'fs.consent', label: 'Согласие', fullscreenIntent: 'fs.consent.open' },
  'fs.payment': { key: 'fs.payment', label: 'Платёж', fullscreenIntent: 'fs.payment.open' },
  'fs.media': { key: 'fs.media', label: 'Медиа', fullscreenIntent: 'fs.media.open' },
} satisfies Record<RouteKey, RouteDefinition>);

/**
 * Router honesty: a key that is not in the registry does not resolve, and nothing guesses. The
 * lookup walks the closed key list rather than indexing the object, so no inherited name
 * (`constructor`, `__proto__`) can answer for a route.
 */
export const resolveRoute = (key: string): RouteDefinition | null => {
  const found = ALL_ROUTES.find((k) => k === key);
  return found === undefined ? null : ROUTES[found];
};

/**
 * WC F71: a shell route's parameter is one opaque server-minted handle — not a path, not a query
 * string, not an origin and not a provider id.
 */
const ROUTE_PARAM = /^[A-Za-z0-9_-]{8,64}$/;
export const isRouteParam = (value: unknown): value is string => typeof value === 'string' && ROUTE_PARAM.test(value);

/** Why a target did not resolve to a route. Every refusal is named; none is a silent fallback. */
export type TargetRefusal =
  /** A route key on its own, where a typed target was required. A bare key never opens anything. */
  | 'bare_key'
  /** Not an `IntentTarget` shape at all. */
  | 'malformed'
  /** Classes 'w', 'i' and 'c' re-resolve an emission, carry a token or name a capability: never a route. */
  | 'not_a_route'
  /** A class-'s' route the registry does not hold, including every `fs.*` key (a detail is not a shell route). */
  | 'unknown_route'
  /** A base route carrying a parameter: the five take none. */
  | 'param_refused'
  /** `shell.pay` or `shell.file` without an opaque handle. */
  | 'param_invalid'
  /** A detail key outside the nine `fs.*` keys (R7-E3 default). */
  | 'unknown_detail';

export type TargetResolution =
  | { readonly kind: 'base'; readonly key: BaseRoute }
  | { readonly kind: 'handoff'; readonly key: ShellRouteKey; readonly param: string }
  | { readonly kind: 'detail'; readonly key: FullscreenRoute }
  | { readonly kind: 'refused'; readonly reason: TargetRefusal };

const refused = (reason: TargetRefusal): TargetResolution => ({ kind: 'refused', reason });

const resolveShellTarget = (ref: ShellRoute): TargetResolution => {
  if (typeof ref === 'string') return refused('bare_key');
  if (typeof ref !== 'object' || ref === null) return refused('malformed');
  const route = ref.route;
  const param = ref.param;
  const base = BASE_ROUTES.find((k) => k === route);
  if (base !== undefined) return param === null ? { kind: 'base', key: base } : refused('param_refused');
  const handoff = SHELL_ROUTES.find((k) => k === route);
  if (handoff !== undefined) return isRouteParam(param) ? { kind: 'handoff', key: handoff, param } : refused('param_invalid');
  return refused('unknown_route');
};

const resolveDetailTarget = (ref: DetailRouteKey): TargetResolution => {
  if (typeof ref !== 'string') return refused('malformed');
  const key = FULLSCREEN_ROUTES.find((k) => k === ref);
  return key === undefined ? refused('unknown_detail') : { kind: 'detail', key };
};

/**
 * Resolve a contract `IntentTarget` to a route, or refuse it by name.
 *
 * Only a typed target resolves: a key string on its own is refused, and so is a class-'s' target
 * whose `ref` is a key string instead of `{ route, param }`. Two things are NOT decided here: that a
 * detail key equals the emitting envelope's `presentation.fullscreen_detail.route_key` (R3.3.4),
 * and whether the target may be acted on at all. Both belong to the shell, which holds the
 * envelope. A resolution is a lookup, never an activation.
 */
export const resolveTarget = (target: IntentTarget): TargetResolution => {
  if (typeof target === 'string') return refused('bare_key');
  if (typeof target !== 'object' || target === null) return refused('malformed');
  switch (target.class) {
    case 's':
      return resolveShellTarget(target.ref);
    case 'detail':
      return resolveDetailTarget(target.ref);
    case 'w':
    case 'i':
    case 'c':
      return refused('not_a_route');
    default:
      return refused('malformed');
  }
};

/**
 * THE PROPERTY THAT MATTERS MOST IN THIS FILE.
 *
 * The intent set does not vary by role. There is no owner shell, no staff shell and no client
 * shell — there is one shell, and what a person may do is decided server-side by the authority
 * runtime, not by which bundle they were served. A role-mode switcher in the UI is the thing this
 * programme exists to remove: it made authority a matter of presentation.
 *
 * So this function takes no role, and the K5 exit asserts that the intent set differs by ZERO
 * BYTES across the four former role modes — which is trivially true precisely because there is
 * nothing here to vary.
 */
export const intentSet = (): readonly string[] =>
  ALL_ROUTES.map((k) => ROUTES[k].fullscreenIntent).filter((i): i is string => i !== null);
