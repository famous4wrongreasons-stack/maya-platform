// K5 — the primary navigation and the route chrome (SHELL-PLAN v2.1 §1.7; D2 A, D3, SH-04).
//
// Exactly five buttons, labelled from the route registry, in its order; the current route carries
// `aria-current="page"`. There is no sixth entry: sign-in is the signed-out state of the root, not a
// route, and a fullscreen detail is reached only through a received intent, never from here.
//
// `shell.root` is the conversation. The other four draw route chrome until their owners exist: a
// heading, a shell-owned sentence that the section is not available here yet, and the escape back
// to the conversation. `shell.account` also hosts «Выйти». No link and no hand-off anywhere.

import { BASE_ROUTES, resolveRoute } from '../routes/registry.ts';
import type { Cancel, DomFactory, PrimaryRoute, WidgetPort } from '../shell/ports.ts';

export const NAV_LABEL = 'Основная навигация';
export const NOT_AVAILABLE_YET = 'Этот раздел пока недоступен здесь — вернитесь к разговору.';

export interface NavMount {
  readonly factory: DomFactory;
  readonly container: HTMLElement;
  readonly widgets: Pick<WidgetPort, 'view' | 'subscribe' | 'navigate'>;
}

export const routeLabel = (route: PrimaryRoute): string => resolveRoute(route)?.label ?? route;

export function mountNav(mount: NavMount): Cancel {
  const { factory, widgets } = mount;
  const nav = factory.create('nav');
  nav.classList.add('nav');
  nav.setAttribute('aria-label', NAV_LABEL);
  const list = factory.create('ul');
  list.classList.add('nav-list');

  const buttons: { readonly route: PrimaryRoute; readonly button: HTMLButtonElement }[] = [];
  for (const route of BASE_ROUTES) {
    const item = factory.create('li');
    const button = factory.create('button');
    button.type = 'button';
    button.classList.add('nav-button');
    button.textContent = routeLabel(route);
    button.addEventListener('click', () => widgets.navigate(route));
    item.append(button);
    list.append(item);
    buttons.push({ route, button });
  }
  nav.append(list);
  mount.container.append(nav);

  const paint = (primary: PrimaryRoute): void => {
    for (const { route, button } of buttons) {
      if (route === primary) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
  };
  paint(widgets.view().primary);
  const off = widgets.subscribe((view) => paint(view.primary));
  return () => {
    off();
    nav.remove();
  };
}

export interface RoutePanelMount {
  readonly factory: DomFactory;
  readonly container: HTMLElement;
  readonly route: PrimaryRoute;
  /** The identity line, shown on the account route. */
  readonly identity: string;
  readonly widgets: Pick<WidgetPort, 'navigate'>;
  readonly signOut: () => void;
}

export interface RoutePanel {
  readonly heading: HTMLElement;
  readonly cancel: Cancel;
}

let serial = 0;

/** The chrome of a base route other than the conversation. */
export function mountRoutePanel(mount: RoutePanelMount): RoutePanel {
  const { factory } = mount;
  serial += 1;
  const panel = factory.create('div');
  panel.classList.add('route');

  const heading = factory.create('h2');
  heading.id = `maya-route-title-${serial}`;
  heading.classList.add('route-title');
  heading.tabIndex = -1;
  heading.textContent = routeLabel(mount.route);
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-labelledby', heading.id);

  const sentence = factory.create('p');
  sentence.classList.add('route-note');
  sentence.textContent = NOT_AVAILABLE_YET;
  panel.append(heading, sentence);

  if (mount.route === 'shell.account') {
    const who = factory.create('p');
    who.classList.add('route-identity');
    who.textContent = mount.identity;
    const out = factory.create('button');
    out.type = 'button';
    out.classList.add('route-action');
    out.textContent = 'Выйти';
    out.addEventListener('click', () => mount.signOut());
    panel.append(who, out);
  }

  const back = factory.create('button');
  back.type = 'button';
  back.classList.add('route-action', 'route-action--back');
  back.textContent = 'Вернуться к разговору';
  back.addEventListener('click', () => mount.widgets.navigate('shell.root'));
  panel.append(back);

  mount.container.replaceChildren(panel);
  return {
    heading,
    cancel: () => panel.remove(),
  };
}
