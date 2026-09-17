// K5 — the renderer.
//
// Its whole security property is NEGATIVE, and the mapping states it plainly: "A renderer that can
// reach a capability owner is a second authority path." So this module can reach nothing. It has no
// `fetch`, no `XHR`, no `WebSocket`, no storage and no provider SDK, and it receives no
// token-bearing props — a renderer that held a token could spend it.
//
// It takes a sealed envelope and returns what to draw. That is all it does, and the K5 exit checks
// the import graph rather than trusting this paragraph.

import type { RouteKey } from '../routes/registry.ts';

/**
 * The environment the renderer is asked to draw into.
 *
 * `reducedMotion` is the user's own operating-system preference, not a product setting, so it
 * arrives as an input rather than being read from a media query here — a renderer that read the
 * environment itself would be doing I/O, which is the one thing this module may not do.
 */
export interface A11yEnvironment {
  readonly reducedMotion: boolean;
  readonly tier: 'RICH_INTERACTIVE' | 'RICH_CONSTRAINED' | 'ANNOUNCEMENT' | 'SPOKEN' | 'TEXT_ONLY';
}

/** What the shell hands a renderer. Note what is absent: no token, no tenant, no role, no session. */
export interface RenderInput {
  readonly widgetId: string;
  readonly kind: string;
  readonly body: unknown;
  /** Already-resolved labels. The renderer never looks anything up, because it cannot. */
  readonly labels: Readonly<Record<string, string>>;
  /** The intents the server minted. The renderer draws them; it cannot add one. */
  readonly intents: readonly RenderIntent[];
  readonly textEquivalent: string;
  readonly a11y: A11yEnvironment;
}

export interface RenderIntent {
  /** Opaque. The renderer attaches it to an affordance and never inspects or constructs one. */
  readonly token: string;
  readonly label: string;
  /** Presentation only — F88.1's declared enum. It changes how a thing looks, never what it may do. */
  readonly role: 'primary' | 'secondary' | 'destructive' | 'escape' | 'more' | 'handoff' | 'remedy' | 'control';
}

export type RenderNode =
  | { readonly t: 'text'; readonly value: string }
  | { readonly t: 'group'; readonly children: readonly RenderNode[] }
  | { readonly t: 'action'; readonly token: string; readonly label: string; readonly role: RenderIntent['role'] }
  | { readonly t: 'route'; readonly to: RouteKey; readonly label: string };

export interface RenderResult {
  readonly nodes: readonly RenderNode[];
  /**
   * Always produced, never optional. §4 requires a text equivalent on every tier, and making it a
   * required field is cheaper than remembering to produce one.
   */
  readonly textEquivalent: string;
  /**
   * §8's first obligation: every interactive element, in the order a keyboard reaches them, and
   * that order IS the order they appear in `nodes`. Derived here rather than authored, so DOM order
   * and reading order cannot disagree — they are the same walk.
   */
  readonly readingOrder: readonly string[];
  /**
   * §8's second: total and closed over `readingOrder`. Every ref has a name and no name is empty,
   * because an unnamed control is one a screen reader announces as "button".
   */
  readonly accessibleNames: Readonly<Record<string, string>>;
  /**
   * §8's fourth. `none` when the environment asks for reduced motion. It changes MOTION and never
   * content — WCAG 2.3.3 is about animation, not about showing a person less.
   */
  readonly motion: 'none' | 'standard';
}

/**
 * The reference key of an interactive node, spelled once.
 *
 * Actions key on their opaque token and routes on their destination, so two affordances can never
 * collide and a key never carries anything a renderer could act on.
 */
export const refKey = (n: RenderNode): string | null =>
  n.t === 'action' ? `i:${n.token}` : n.t === 'route' ? `r:${n.to}` : null;

/**
 * Render a sealed envelope.
 *
 * Pure: same input, same output, no clock, no randomness, no I/O. That is what makes it testable
 * without a browser and what makes "the import graph contains no fetch" true rather than aspired to.
 */
export const render = (input: RenderInput): RenderResult => {
  const nodes: RenderNode[] = [];

  const headline = input.labels.headline ?? input.kind;
  nodes.push({ t: 'text', value: headline });

  if (typeof input.body === 'object' && input.body !== null) {
    const rows = Object.entries(input.body as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
      .map<RenderNode>(([k, v]) => ({ t: 'text', value: `${input.labels[k] ?? k}: ${String(v)}` }));
    if (rows.length) nodes.push({ t: 'group', children: rows });
  }

  for (const i of input.intents)
    nodes.push({ t: 'action', token: i.token, label: i.label, role: i.role });

  // ONE walk produces both, which is what makes "DOM order equals reading order" true by
  // construction instead of by a comparison that could be forgotten.
  const readingOrder: string[] = [];
  const accessibleNames: Record<string, string> = {};
  const walk = (list: readonly RenderNode[]): void => {
    for (const n of list) {
      if (n.t === 'group') { walk(n.children); continue; }
      if (n.t !== 'action' && n.t !== 'route') continue;
      const key = refKey(n);
      if (key === null) continue;
      readingOrder.push(key);
      accessibleNames[key] = n.label;
    }
  };
  walk(nodes);

  return {
    nodes,
    // The server's text equivalent is used as given. A renderer that composed its own could
    // disagree with what the spoken tier says, and then two surfaces would describe one widget
    // differently — which is worse than either description alone.
    textEquivalent: input.textEquivalent,
    readingOrder,
    accessibleNames,
    motion: input.a11y.reducedMotion ? 'none' : 'standard',
  };
};

/**
 * Self-mounting is what the six overlays did: a component decided it should be on screen and put
 * itself there. Nothing in this module can, because rendering returns a value instead of touching a
 * document. `mount` takes the host from its caller, so the shell decides what is mounted.
 */
export const mount = (host: { replaceChildren: (...n: unknown[]) => void }, result: RenderResult): void => {
  host.replaceChildren(result);
};
