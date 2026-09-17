// K5 — the deep-link parser (WC NT8; SHELL-PLAN v2.1 §1.5F; D3).
//
// A link lands in the router, never in an overlay, and parses nothing business-shaped: the parser's
// whole output is `{route_key, opaque_handle}`. It reads the fragment keys `r` and `h` and nothing
// else — no staff id, record id, tenant slug or price, and every other key (`booking_tenant`, `tips`,
// …) is ignored. Nothing is decoded: a percent-escape fails the closed checks below.
//
//   #r=shell.root|account|connections|privacy|notifications   (no h)  → primary route switch
//   #r=w&h=<opaque handle, /^[A-Za-z0-9_-]{8,64}$/>                    → PROGRESS, then the E14
//                                                                         sentence; 0 requests in P1
//   #r=fs.*, detail, i, c, shell.pay, shell.file, anything else        → refused sentence, 0 requests
//
// `fs.*` and `detail` are refused permanently: a detail has no address (R3.3.4). `i` arrives only as
// a server-minted signed path segment (R3.3.5), and `shell.pay`/`shell.file` need their owners. No
// branch reaches a screen, and none reaches a sign-in page (E14): an unresolvable link is a sentence
// in the timeline. The fragment's bytes are never echoed anywhere.

import { BASE_ROUTES, isRouteParam, type BaseRoute } from '../routes/registry.ts';
import type { NoticeKind } from './ports.ts';

/** Longer fragments are refused unread. */
export const MAX_FRAGMENT_CHARS = 2_048;

export interface DeepLink {
  readonly route_key: BaseRoute | 'w';
  readonly opaque_handle: string | null;
}

export type DeepLinkParse =
  | { readonly kind: 'none' }
  | { readonly kind: 'link'; readonly link: DeepLink }
  | { readonly kind: 'refused' };

const NONE: DeepLinkParse = { kind: 'none' };
const REFUSED: DeepLinkParse = { kind: 'refused' };

/** Parse a raw fragment, with or without its leading '#'. */
export const parseDeepLink = (fragment: unknown): DeepLinkParse => {
  if (typeof fragment !== 'string') return NONE;
  const raw = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  if (raw.length === 0) return NONE;
  if (raw.length > MAX_FRAGMENT_CHARS) return REFUSED;
  let route: string | null = null;
  let handle: string | null = null;
  let routes = 0;
  let handles = 0;
  for (const part of raw.split('&')) {
    const eq = part.indexOf('=');
    const key = eq < 0 ? part : part.slice(0, eq);
    const value = eq < 0 ? '' : part.slice(eq + 1);
    if (key === 'r') {
      routes += 1;
      route = value;
    } else if (key === 'h') {
      handles += 1;
      handle = value;
    }
  }
  if (routes === 0) return NONE;
  if (routes > 1 || handles > 1) return REFUSED;
  const base = BASE_ROUTES.find((k) => k === route);
  if (base !== undefined) return handles === 0 ? { kind: 'link', link: { route_key: base, opaque_handle: null } } : REFUSED;
  if (route === 'w') return isRouteParam(handle) ? { kind: 'link', link: { route_key: 'w', opaque_handle: handle } } : REFUSED;
  return REFUSED;
};

export type DeepLinkLanding =
  | { readonly landed: 'none' }
  | { readonly landed: 'route'; readonly route: BaseRoute }
  /** P1: resolving a widget handle needs B3's resolve by (widget_id, density); nothing is requested. */
  | { readonly landed: 'widget_unavailable' }
  | { readonly landed: 'refused' };

export interface DeepLinkTargets {
  navigate(route: BaseRoute): void;
  notice(kind: NoticeKind): void;
}

/**
 * Land a fragment. A base route switches the primary route; a widget handle ends, in P1, in the
 * `deeplink_unavailable` sentence (its PROGRESS phase has nothing to wait for, since no resolve
 * exists yet); everything else ends in the `deeplink_refused` sentence. No request in any branch.
 */
export const landDeepLink = (fragment: unknown, targets: DeepLinkTargets): DeepLinkLanding => {
  const parsed = parseDeepLink(fragment);
  switch (parsed.kind) {
    case 'none':
      return { landed: 'none' };
    case 'refused':
      targets.notice('deeplink_refused');
      return { landed: 'refused' };
    case 'link':
      if (parsed.link.route_key === 'w') {
        targets.notice('deeplink_unavailable');
        return { landed: 'widget_unavailable' };
      }
      targets.navigate(parsed.link.route_key);
      return { landed: 'route', route: parsed.link.route_key };
  }
};
