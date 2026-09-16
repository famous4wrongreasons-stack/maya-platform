// K5 — the shell. One source, emitted once.
//
// The shell owns what is on screen. That single sentence is the difference from today's app, where
// six overlays mounted themselves and nothing could enumerate what was open. Here a surface asks,
// the shell decides, and the answer is a value anyone can inspect.

import { type RouteKey, ROUTES, resolveRoute, BASE_ROUTES } from '../routes/registry';
import { type RenderResult } from '../renderer/render';

export interface ShellState {
  /** The conversation is always present. It is not a route you leave — it is where you are. */
  readonly conversation: 'open';
  /** At most ONE fullscreen surface. Two was the old bug; one is a type, not a convention. */
  readonly fullscreen: RouteKey | null;
  readonly primary: (typeof BASE_ROUTES)[number];
}

export const initialState = (): ShellState => ({
  conversation: 'open',
  fullscreen: null,
  primary: 'maya',
});

/**
 * Open a fullscreen surface by ROUTE KEY, never by component reference. A key that does not resolve
 * is refused rather than guessed — router honesty means the router says "no" instead of finding
 * something close.
 */
export const openFullscreen = (state: ShellState, key: string): ShellState | { error: string } => {
  const route = resolveRoute(key);
  if (!route) return { error: `unknown route ${key}` };
  if (route.fullscreenIntent === null) return { error: `${key} is a destination, not a fullscreen surface` };
  return { ...state, fullscreen: route.key };
};

/** The escape verb §4 requires on every tier. Closing is always available and never fails. */
export const closeFullscreen = (state: ShellState): ShellState => ({ ...state, fullscreen: null });

/** What is mounted, as a value. Nothing mounts itself, so this is always the whole truth. */
export const mounted = (state: ShellState, rendered: RenderResult | null) => ({
  conversation: state.conversation,
  fullscreen: state.fullscreen ? ROUTES[state.fullscreen].label : null,
  widget: rendered ? rendered.textEquivalent : null,
});
