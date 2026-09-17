// K5 — the route registry.
//
// Today's PWA has 101 Maya-owned primary-nav entries and six self-mounting overlays. The target is
// five destinations and a conversation. This file is where that becomes structural rather than
// aspirational: a route that is not here does not exist, and a surface cannot mount itself.
//
// The five base routes are the primary navigation, entire. Everything else a person can reach is
// reached THROUGH the conversation, as a fullscreen intent — which is why the route registry and
// the fullscreen-intent path are one file and not two.

/** The five, and no more. §K16 completes the reduction; K5 makes the target representable. */
export const BASE_ROUTES = ['maya', 'account', 'connections', 'privacy-and-data', 'notifications'] as const;
export type BaseRoute = (typeof BASE_ROUTES)[number];

/**
 * Two shell routes that are not destinations: they are hand-offs the shell performs on behalf of a
 * widget. They are listed separately because they are not places a person navigates to — they are
 * things that happen and then return.
 */
export const SHELL_ROUTES = ['shell.pay', 'shell.file'] as const;
export type ShellRoute = (typeof SHELL_ROUTES)[number];

/**
 * The nine route keys that replace the six self-mounting overlays.
 *
 * The old overlays mounted themselves: a component decided it should be on screen and put itself
 * there, which is why the app could show two of them at once and why nothing could enumerate what
 * was open. A route key is the opposite — the shell owns what is mounted, and a surface asks.
 */
export const FULLSCREEN_ROUTES = [
  'fs.booking',
  'fs.client-card',
  'fs.calendar',
  'fs.catalogue',
  'fs.team-thread',
  'fs.report',
  'fs.consent',
  'fs.payment',
  'fs.media',
] as const;
export type FullscreenRoute = (typeof FULLSCREEN_ROUTES)[number];

export type RouteKey = BaseRoute | ShellRoute | FullscreenRoute;

export const ALL_ROUTES: readonly RouteKey[] = [...BASE_ROUTES, ...SHELL_ROUTES, ...FULLSCREEN_ROUTES];

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
  maya: { key: 'maya', label: 'Майя', fullscreenIntent: null },
  account: { key: 'account', label: 'Аккаунт', fullscreenIntent: null },
  connections: { key: 'connections', label: 'Подключения', fullscreenIntent: null },
  'privacy-and-data': { key: 'privacy-and-data', label: 'Приватность и данные', fullscreenIntent: null },
  notifications: { key: 'notifications', label: 'Уведомления', fullscreenIntent: null },

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

/** Router honesty: a key that is not in the registry does not resolve, and nothing guesses. */
export const resolveRoute = (key: string): RouteDefinition | null =>
  (ROUTES as Record<string, RouteDefinition | undefined>)[key] ?? null;

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
