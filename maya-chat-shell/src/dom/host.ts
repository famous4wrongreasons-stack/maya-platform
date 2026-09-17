// K5 — the DOM host (SHELL-PLAN v2.1 §1.1, §1.2 H1/N-3, §1.7, §1.11; D5, D7, V2-15).
//
// Two jobs, both through injected ports only:
//
//   drawResult / createWidgetDrawer   draw a RenderResult with the closed DomFactory. Interactive
//                                     elements appear in DOM order exactly as `readingOrder` names
//                                     them, each named by its sealed accessible name. Focus follows
//                                     the per-kind rules (D7): heading focus for the kinds whose row
//                                     says so, the first refused field for a FORM refusal, the
//                                     collapsed headline after a local dismiss, and nothing for a
//                                     text reply. Live regions use the sealed `live_region`, and a
//                                     throttled kind announces at most once per `announceIntervalMs`.
//   mountApp                          the page: the signed-out root state (sign-in) or the signed-in
//                                     conversation with its composer, voice hook, five-route nav and
//                                     the fullscreen host. Sign-in is not a route (SH-04).
//
// This module holds no host global. The mount root, the element factory and the scheduler arrive
// from entry/; nothing here can reach a page object, the network or a store. Elements come only from
// the closed tag set, styling is classList only, and no request sink is ever written.

import type {
  ActionNode,
  BlockNode,
  ChoiceNode,
  FieldNode,
  InteractiveRefKey,
  LeafNode,
  RenderNode,
  RenderResult,
  TableNode,
} from '../renderer/nodes.ts';
import type {
  Cancel,
  ConversationPort,
  DomFactory,
  DomPort,
  Scheduler,
  SessionPort,
  SessionView,
  SignInDisplay,
  TimelineItemView,
  VoiceControlPort,
  WidgetPort,
} from '../shell/ports.ts';
import { mountComposer, type Composer } from './composer.ts';
import { mountFullscreen } from './fullscreen.ts';
import { mountNav, mountRoutePanel } from './nav.ts';
import { mountSignIn } from './signin.ts';
import { mountTimeline } from './timeline.ts';
import { mountVoiceControl } from './voice-control.ts';

export type WidgetItem = Extract<TimelineItemView, { readonly kind: 'widget' }>;

// ── small helpers shared by the dom modules ────────────────────────────────────────────────────

let serial = 0;
/** A page-unique element id; ids carry no data. */
export const nextDomId = (prefix: string): string => {
  serial += 1;
  return `maya-${prefix}-${serial}`;
};

/** The focused element inside `container`, if any (`:focus` needs no page object). */
export const focusedWithin = (container: HTMLElement): HTMLElement | null => container.querySelector<HTMLElement>(':focus');

/** A paragraph of plain text. */
export const paragraph = (factory: DomFactory, className: string, text: string): HTMLParagraphElement => {
  const p = factory.create('p');
  p.classList.add(className);
  p.textContent = text;
  return p;
};

/** Text read by assistive technology and not drawn. */
export const hiddenText = (factory: DomFactory, text: string): HTMLSpanElement => {
  const span = factory.create('span');
  span.classList.add('vh');
  span.textContent = text;
  return span;
};

// ── drawing one RenderResult ───────────────────────────────────────────────────────────────────

export interface DrawOptions {
  /** A drawn control was activated. The element is the control, for focus return. */
  readonly onActivate: (ref: InteractiveRefKey, control: HTMLElement) => void;
  /** The ref whose activation is in flight; drawn busy. */
  readonly pending: InteractiveRefKey | null;
  /** Collapsed items draw their headline only, with no control. */
  readonly collapsed: boolean;
}

export interface DrawnControl {
  readonly ref: InteractiveRefKey;
  readonly element: HTMLElement;
}

export interface DrawnResult {
  readonly element: HTMLElement;
  readonly heading: HTMLElement | null;
  /** Every interactive element, in DOM order; equal to `result.readingOrder` when drawn in full. */
  readonly controls: readonly DrawnControl[];
  readonly firstRefused: HTMLElement | null;
  /** The item's live region, or null when its `live_region` is off. */
  readonly live: HTMLElement | null;
}

interface Ctx {
  readonly factory: DomFactory;
  readonly names: ReadonlyMap<string, string>;
  readonly options: DrawOptions;
  readonly controls: DrawnControl[];
  heading: HTMLElement | null;
  firstRefused: HTMLElement | null;
}

type Place = 'block' | 'inline' | 'list';

const INLINE_NODES: ReadonlySet<RenderNode['t']> = new Set<RenderNode['t']>(['text', 'leaf']);

/** Name a control by its sealed accessible name, byte for byte, when the visible text differs. */
const nameControl = (el: HTMLElement, name: string, visible: string): void => {
  if (name !== '' && name !== visible) el.setAttribute('aria-label', name);
};

const register = (ctx: Ctx, ref: InteractiveRefKey, el: HTMLElement): void => {
  el.setAttribute('data-ref', ref);
  if (ctx.options.pending === ref) el.setAttribute('aria-disabled', 'true');
  ctx.controls.push({ ref, element: el });
};

const leafElement = (ctx: Ctx, leaf: LeafNode): HTMLElement => {
  const span = ctx.factory.create('span');
  span.classList.add('leaf', `leaf--${leaf.source}`);
  // A non-KNOWN state is stated by the minted label itself (A-7); the class only styles it.
  if (leaf.state !== null && leaf.state !== 'KNOWN') span.classList.add('leaf--not-known');
  span.textContent = leaf.text;
  if (leaf.detail !== null) {
    const detail = ctx.factory.create('span');
    detail.classList.add('leaf-detail');
    detail.textContent = leaf.detail;
    span.append(' ', detail);
  }
  return span;
};

const buttonFor = (ctx: Ctx, ref: InteractiveRefKey, className: string): HTMLButtonElement => {
  const button = ctx.factory.create('button');
  button.type = 'button';
  button.classList.add(className);
  button.addEventListener('click', () => ctx.options.onActivate(ref, button));
  return button;
};

const actionElement = (ctx: Ctx, node: ActionNode): HTMLElement[] => {
  const button = buttonFor(ctx, node.ref, 'widget-action');
  button.classList.add(`widget-action--${node.role.toLowerCase()}`);
  button.textContent = node.label;
  nameControl(button, node.name, node.label);
  register(ctx, node.ref, button);
  if (node.explanation === null) return [button];
  // Present and explained, never decided here (R-6): the state is drawn in words beside the control.
  const note = leafElement(ctx, node.explanation);
  note.classList.add('widget-explanation');
  note.id = nextDomId('why');
  button.setAttribute('aria-describedby', note.id);
  button.setAttribute('aria-disabled', 'true');
  return [button, note];
};

const choiceElement = (ctx: Ctx, node: ChoiceNode): HTMLElement => {
  if (node.selects !== null) {
    const button = buttonFor(ctx, node.ref, 'widget-choice');
    for (const child of node.children) button.append(...drawNode(ctx, child, 'inline'));
    nameControl(button, node.name, button.textContent ?? '');
    register(ctx, node.ref, button);
    return button;
  }
  // A body element the reading order names and no intent selects: reachable, never activatable.
  const region = ctx.factory.create('div');
  region.classList.add('widget-choice', 'widget-choice--static');
  region.setAttribute('role', 'group');
  region.tabIndex = 0;
  for (const child of node.children) region.append(...drawNode(ctx, child, 'inline'));
  nameControl(region, node.name, '');
  register(ctx, node.ref, region);
  return region;
};

const fieldElement = (ctx: Ctx, node: FieldNode): HTMLElement => {
  // P1 submits no inputs (the submission port answers unavailable), so a field is drawn as a named,
  // reachable group with its current value — never as an editable control that could not be sent.
  const group = ctx.factory.create('div');
  group.classList.add('widget-field', `widget-field--${node.input}`);
  group.setAttribute('role', 'group');
  group.tabIndex = 0;
  nameControl(group, node.name, '');
  if (node.refused) {
    group.setAttribute('aria-invalid', 'true');
    group.classList.add('widget-field--refused');
    if (ctx.firstRefused === null) ctx.firstRefused = group;
  }
  for (const help of node.help) {
    const p = ctx.factory.create('p');
    p.classList.add('widget-field-help');
    p.append(...drawNode(ctx, help, 'inline'));
    group.append(p);
  }
  if (node.value !== null) {
    const p = ctx.factory.create('p');
    p.classList.add('widget-field-value');
    p.append(leafElement(ctx, node.value));
    group.append(p);
  }
  register(ctx, node.ref, group);
  return group;
};

const tableElement = (ctx: Ctx, node: TableNode): HTMLElement => {
  // A-10: a wide table scrolls inside its own container, never the page.
  const scroll = ctx.factory.create('div');
  scroll.classList.add('widget-table-scroll');
  const table = ctx.factory.create('table');
  table.classList.add('widget-table');
  const caption = ctx.factory.create('caption');
  caption.textContent = node.caption;
  table.append(caption);

  const withActions = node.groups.some((g) => g.rows.some((r) => r.actions.length > 0));
  const head = ctx.factory.create('thead');
  const headRow = ctx.factory.create('tr');
  for (const column of node.columns) {
    const th = ctx.factory.create('th');
    th.scope = 'col';
    th.textContent = column.label;
    if (column.align === 'end') th.classList.add('cell--end');
    headRow.append(th);
  }
  if (withActions) {
    const th = ctx.factory.create('th');
    th.scope = 'col';
    th.append(hiddenText(ctx.factory, 'Действия'));
    headRow.append(th);
  }
  head.append(headRow);
  table.append(head);

  for (const group of node.groups) {
    const body = ctx.factory.create('tbody');
    if (group.label !== null) {
      const tr = ctx.factory.create('tr');
      const th = ctx.factory.create('th');
      th.scope = 'rowgroup';
      th.colSpan = node.columns.length + (withActions ? 1 : 0);
      th.textContent = group.label;
      tr.append(th);
      body.append(tr);
    }
    for (const row of group.rows) {
      const tr = ctx.factory.create('tr');
      const rowAction = row.actions.find((a) => a.ref === row.ref) ?? null;
      for (const [index, column] of node.columns.entries()) {
        const leaf = row.cells.at(index) ?? null;
        const isHeader = column.key === node.rowHeaderKey;
        const cell = isHeader ? ctx.factory.create('th') : ctx.factory.create('td');
        if (isHeader) cell.scope = 'row';
        if (column.align === 'end') cell.classList.add('cell--end');
        if (leaf !== null) cell.append(leafElement(ctx, leaf));
        // A row in the reading order is one tab stop: its in-row control when it has one, else its
        // row header (A-17: never a click handler on the row).
        if (isHeader && row.ref !== null && rowAction === null) {
          cell.tabIndex = 0;
          nameControl(cell, ctx.names.get(row.ref) ?? '', '');
          register(ctx, row.ref, cell);
        }
        tr.append(cell);
      }
      if (withActions) {
        const td = ctx.factory.create('td');
        td.classList.add('widget-row-actions');
        for (const action of row.actions) td.append(...actionElement(ctx, action));
        tr.append(td);
      }
      body.append(tr);
    }
    table.append(body);
  }
  scroll.append(table);
  return scroll;
};

const blockElement = (ctx: Ctx, node: BlockNode, place: Place): HTMLElement => {
  let el: HTMLElement;
  switch (node.block) {
    case 'group':
      el = ctx.factory.create('div');
      // The sealed hint names the widget's pattern; its members are drawn as buttons, so the
      // container is a labelled group and the hint stays a class.
      el.setAttribute('role', 'group');
      if (node.roleHint !== null) el.classList.add(`hint--${node.roleHint}`);
      break;
    case 'paragraph':
      el = node.children.every((c) => INLINE_NODES.has(c.t)) ? ctx.factory.create('p') : ctx.factory.create('div');
      break;
    case 'list':
      el = ctx.factory.create('ul');
      break;
    case 'ordered_list':
      el = ctx.factory.create('ol');
      break;
    case 'item':
      el = place === 'list' ? ctx.factory.create('li') : ctx.factory.create('div');
      break;
  }
  el.classList.add('widget-block', `widget-block--${node.block}`);
  if (node.label !== null) el.setAttribute('aria-label', node.label);
  const inner: Place = node.block === 'list' || node.block === 'ordered_list' ? 'list' : node.block === 'paragraph' ? 'inline' : 'block';
  for (const child of node.children) el.append(...drawNode(ctx, child, inner));
  return el;
};

function drawNode(ctx: Ctx, node: RenderNode, place: Place): HTMLElement[] {
  switch (node.t) {
    case 'text': {
      if (place !== 'inline') return [paragraph(ctx.factory, 'widget-text', node.text)];
      const span = ctx.factory.create('span');
      span.textContent = node.text;
      return [span];
    }
    case 'leaf': {
      const leaf = leafElement(ctx, node);
      if (place === 'inline') return [leaf];
      const p = ctx.factory.create('p');
      p.classList.add('widget-leaf-line');
      p.append(leaf);
      return [p];
    }
    case 'heading': {
      const h = node.level === 2 ? ctx.factory.create('h2') : node.level === 3 ? ctx.factory.create('h3') : ctx.factory.create('h4');
      h.classList.add('widget-heading');
      h.textContent = node.text;
      h.tabIndex = -1;
      if (ctx.heading === null) ctx.heading = h;
      return [h];
    }
    case 'block':
      return [blockElement(ctx, node, place)];
    case 'action':
      return actionElement(ctx, node);
    case 'choice':
      return [choiceElement(ctx, node)];
    case 'field':
      return [fieldElement(ctx, node)];
    case 'table':
      return [tableElement(ctx, node)];
    case 'limitation': {
      const p = paragraph(ctx.factory, 'widget-limitation', node.text);
      p.classList.add(`widget-limitation--${node.severity}`);
      return [p];
    }
  }
}

/**
 * Draw one RenderResult into `into` (emptied first) or a fresh `article`. Every string placed is one
 * the result carries; the host adds no word of its own except the hidden table-actions header.
 */
export function drawResult(factory: DomFactory, result: RenderResult, options: DrawOptions, into: HTMLElement | null = null): DrawnResult {
  const ctx: Ctx = { factory, names: new Map(Object.entries(result.accessibleNames)), options, controls: [], heading: null, firstRefused: null };
  const article = into ?? factory.create('article');
  article.replaceChildren();
  article.className = '';
  article.removeAttribute('aria-label');
  article.removeAttribute('aria-describedby');
  article.removeAttribute('aria-busy');
  article.classList.add('widget', `widget--${result.density.toLowerCase()}`, `widget--${result.mode.replace('_', '-')}`);
  if (result.motion === 'none') article.classList.add('widget--still');
  if (result.label !== '') article.setAttribute('aria-label', result.label);
  if (result.description !== '') {
    const description = hiddenText(factory, result.description);
    description.id = nextDomId('desc');
    article.setAttribute('aria-describedby', description.id);
    article.append(description);
  }
  if (options.pending !== null) article.setAttribute('aria-busy', 'true');

  const nodes = options.collapsed ? result.nodes.filter((n) => n.t === 'heading') : result.nodes;
  for (const node of nodes) article.append(...drawNode(ctx, node, 'block'));

  let live: HTMLElement | null = null;
  if (result.liveRegion !== 'off') {
    live = factory.create('p');
    live.classList.add('vh', 'widget-live');
    live.setAttribute('aria-live', result.liveRegion);
    live.setAttribute('aria-atomic', 'true');
    article.append(live);
  }
  return { element: article, heading: ctx.heading, controls: ctx.controls, firstRefused: ctx.firstRefused, live };
}

// ── widget items: redraw in place, focus rules, throttled announcements ────────────────────────

export interface WidgetDrawer {
  /** The element for this item, drawn or redrawn in place. */
  element(item: WidgetItem): HTMLElement;
  /** The control drawn for `ref` inside an item's element, after any redraw (focus return). */
  control(article: HTMLElement, ref: string): HTMLElement | null;
  /** The item left the timeline. */
  release(itemId: string): void;
  dispose(): void;
}

export interface WidgetDrawerDeps {
  readonly factory: DomFactory;
  readonly scheduler: Pick<Scheduler, 'now' | 'after' | 'frame'>;
  readonly widgets: Pick<WidgetPort, 'activate'>;
}

/** The neutral sentence an item carries instead of a silent outcome (D9, §1.4). */
export const widgetSentence = (sentence: NonNullable<WidgetItem['sentence']>): string => {
  switch (sentence) {
    case 'activation_unavailable':
    case 'activation_forbidden':
      return 'Это действие сейчас недоступно';
    case 'no_connection':
      return 'Нет связи — действие не выполнено';
    case 'route_refused':
      return 'Этот переход здесь недоступен';
    case 'expired_not_resolved':
      return 'Карточка устарела — показана сводка';
  }
};

interface DrawnItem {
  readonly article: HTMLElement;
  item: WidgetItem;
  drawn: DrawnResult;
  /** When the live region last spoke (scheduler time), and an announcement waiting its turn. */
  spokeAt: number | null;
  queued: Cancel | null;
}

export function createWidgetDrawer(deps: WidgetDrawerDeps): WidgetDrawer {
  const items = new Map<string, DrawnItem>();
  /** The item whose control was activated last: a local dismiss returns focus to its headline. */
  let activatedItem: string | null = null;

  /** Say the headline in the item's own live region, at most once per `announceIntervalMs`. */
  const announce = (entry: DrawnItem): void => {
    if (entry.drawn.live === null) return;
    entry.queued?.();
    const speak = (): void => {
      entry.queued = null;
      entry.spokeAt = deps.scheduler.now();
      const live = entry.drawn.live;
      if (live !== null) live.textContent = entry.item.result.textEquivalent.headline;
    };
    const interval = entry.item.result.announceIntervalMs;
    const wait = interval === 0 || entry.spokeAt === null ? 0 : Math.max(0, entry.spokeAt + interval - deps.scheduler.now());
    // A region is filled a frame after it is drawn: a region born with its text is not announced.
    entry.queued = wait === 0 ? deps.scheduler.frame(speak) : deps.scheduler.after(wait, speak);
  };

  const focusTarget = (entry: DrawnItem, before: WidgetItem | null): HTMLElement | null => {
    const { item, drawn } = entry;
    // A local dismiss (the NONE escape) collapses the item the person just used: its headline.
    if (before !== null && item.display === 'collapsed' && before.display !== 'collapsed') return activatedItem === item.id ? drawn.heading : null;
    const fresh = before === null || before.result !== item.result;
    if (!fresh || (item.display !== 'live' && item.display !== 'pending')) return null;
    if (item.result.focus === 'heading') return drawn.heading;
    if (item.result.focus === 'first_refused_field') return drawn.firstRefused;
    return null;
  };

  return {
    element(item) {
      const known = items.get(item.id);
      if (known !== undefined && known.item === item) return known.article;
      const article = known?.article ?? deps.factory.create('article');
      const before = known?.item ?? null;
      // A redraw replaces the item's controls; the one that held focus keeps it, by ref.
      const focused = known === undefined ? null : focusedWithin(article);
      const focusedRef = focused?.getAttribute('data-ref') ?? null;
      const headingFocused = focused !== null && focused === known?.drawn.heading;
      const drawn = drawResult(
        deps.factory,
        item.result,
        {
          onActivate: (ref) => {
            activatedItem = item.id;
            deps.widgets.activate(item.id, ref);
          },
          pending: item.pending,
          collapsed: item.display === 'collapsed',
        },
        article,
      );
      article.classList.add(`widget--${item.display}`);
      if (item.display === 'stale') article.append(paragraph(deps.factory, 'widget-stale', 'Данные могли устареть'));
      if (item.sentence !== null) article.append(paragraph(deps.factory, 'widget-sentence', widgetSentence(item.sentence)));
      const entry: DrawnItem = known ?? { article, item, drawn, spokeAt: null, queued: null };
      entry.item = item;
      entry.drawn = drawn;
      items.set(item.id, entry);
      if (before === null || before.result !== item.result) announce(entry);
      const target = focusTarget(entry, before);
      if (target !== null) deps.scheduler.frame(() => target.focus());
      else if (focusedRef !== null) (drawn.controls.find((c) => c.ref === focusedRef)?.element ?? drawn.heading)?.focus();
      else if (headingFocused) drawn.heading?.focus();
      return article;
    },
    control(article, ref) {
      for (const entry of items.values()) if (entry.article === article) return entry.drawn.controls.find((c) => c.ref === ref)?.element ?? null;
      return null;
    },
    release(itemId) {
      items.get(itemId)?.queued?.();
      items.delete(itemId);
    },
    dispose() {
      for (const entry of items.values()) entry.queued?.();
      items.clear();
    },
  };
}

// ── the page ───────────────────────────────────────────────────────────────────────────────────

export interface AppMount {
  readonly dom: DomPort;
  readonly session: SessionPort;
  readonly conversation: ConversationPort;
  readonly widgets: WidgetPort;
  /** Null where the voice hook is not built; the composer stays equally complete (V11/A-20). */
  readonly voice: VoiceControlPort | null;
  readonly scheduler: Scheduler;
}

/** The identity bar: name and business, never a role and never a presence claim (P-36). */
export const identityText = (display: SignInDisplay): string => {
  const parts = [display.userName, display.tenantName ?? ''].filter((part) => part.trim() !== '');
  return parts.length === 0 ? 'Вход выполнен' : parts.join(' · ');
};

function mountSignedIn(mount: AppMount, display: SignInDisplay): Cancel {
  const { factory, root } = mount.dom;
  const cancels: Cancel[] = [];

  const shell = factory.create('div');
  shell.classList.add('app-shell');

  const header = factory.create('header');
  header.classList.add('identity');
  const brand = paragraph(factory, 'identity-brand', 'MAYA');
  brand.setAttribute('aria-hidden', 'true');
  header.append(brand, paragraph(factory, 'identity-text', identityText(display)));

  const conversationPanel = factory.create('section');
  conversationPanel.classList.add('panel', 'panel--conversation');
  conversationPanel.setAttribute('aria-label', 'Разговор с MAYA');

  const routePanel = factory.create('section');
  routePanel.classList.add('panel', 'panel--route');
  routePanel.hidden = true;

  shell.append(header, conversationPanel, routePanel);
  root.append(shell);

  const drawer = createWidgetDrawer({ factory, scheduler: mount.scheduler, widgets: mount.widgets });
  cancels.push(() => drawer.dispose());

  // DOM order inside the conversation: the log, the pending status, then the composer — whose
  // textarea, «Отправить» and the mic are the next tab stops, followed by the nav (§1.8).
  let composer: Composer | null = null;
  const focusComposer = (): void => composer?.focus();
  const timeline = mountTimeline({
    factory,
    container: conversationPanel,
    conversation: mount.conversation,
    scheduler: mount.scheduler,
    drawer,
    signOut: () => void mount.session.signOut(),
    focusComposer,
  });
  composer = mountComposer({ factory, container: conversationPanel, conversation: mount.conversation });
  cancels.push(timeline, composer.cancel);
  if (mount.voice !== null) cancels.push(mountVoiceControl({ factory, container: composer.actions, voice: mount.voice, conversation: mount.conversation }));

  cancels.push(mountNav({ factory, container: shell, widgets: mount.widgets }));
  cancels.push(
    mountFullscreen({
      factory,
      container: shell,
      widgets: mount.widgets,
      scheduler: mount.scheduler,
      draw: (result, onActivate) => drawResult(factory, result, { onActivate, pending: null, collapsed: false }),
      refind: (scope, ref) => drawer.control(scope, ref),
      focusFallback: focusComposer,
    }),
  );

  // The primary route: the conversation is the root; the other four draw route chrome (§1.7).
  let shown = mount.widgets.view().primary;
  let routeCancel: Cancel | null = null;
  const showRoute = (): void => {
    routeCancel?.();
    routeCancel = null;
    const isRoot = shown === 'shell.root';
    conversationPanel.hidden = !isRoot;
    routePanel.hidden = isRoot;
    if (isRoot) {
      mount.scheduler.frame(focusComposer);
      return;
    }
    const panel = mountRoutePanel({
      factory,
      container: routePanel,
      route: shown,
      identity: identityText(display),
      widgets: mount.widgets,
      signOut: () => void mount.session.signOut(),
    });
    routeCancel = panel.cancel;
    mount.scheduler.frame(() => panel.heading.focus());
  };
  showRoute();
  cancels.push(
    mount.widgets.subscribe((view) => {
      if (view.primary === shown) return;
      shown = view.primary;
      showRoute();
    }),
  );

  return () => {
    routeCancel?.();
    for (const cancel of cancels.splice(0).reverse()) cancel();
    shell.remove();
  };
}

/**
 * Mount the page into the root entry/ acquired. Signed out, the root screen IS the sign-in state
 * (SH-04): no route, no nav, no hand-off. Signed in, the conversation. Memory only (A6): a
 * signed-in view never survives a sign-out, so nothing typed crosses to the next session.
 */
export function mountApp(mount: AppMount): Cancel {
  let signedIn: Cancel | null = null;
  let signedOut: Cancel | null = null;
  let loaded = false;

  const apply = (view: SessionView): void => {
    if (view.signedIn) {
      signedOut?.();
      signedOut = null;
      if (signedIn === null) signedIn = mountSignedIn(mount, view.display);
      return;
    }
    signedIn?.();
    signedIn = null;
    if (signedOut !== null) return;
    const signIn = mountSignIn({ factory: mount.dom.factory, container: mount.dom.root, session: mount.session, scheduler: mount.scheduler });
    signedOut = signIn.cancel;
    // A session that just ended is announced from the top of the sign-in state; a fresh load takes
    // no focus.
    if (loaded) mount.scheduler.frame(() => signIn.heading.focus());
  };

  apply(mount.session.view());
  loaded = true;
  const off = mount.session.subscribe(apply);
  return () => {
    off();
    signedIn?.();
    signedOut?.();
    signedIn = null;
    signedOut = null;
  };
}
