// K5 dev — the fixture host (§1.5D, §2.7 steps 10–12). Served only under /__dev/ in --mock.
//
// It imports the EMITTED modules from the served /m/<digest>/ directory — never the sources — and
// exposes `window.__fixtureHost` for test/cdp-verify.mjs and for a person in the Browser pane. Every
// call that draws expects a FRESH page (one runtime and one mounted page per page load):
//
//   ready                     Promise<status>
//   status                    { phase, locale, modulePath, inventory, capabilities, missing, envelopes, errors }
//   verifyAll()               emitted integrity/h7.js `verify` on every fixture envelope, in this browser
//   renderAll(names?, {activate})
//                             ingest → H7 → view → renderer → DOM host for every fixture, then (unless
//                             activate:false) one click on every drawn button, each observed on its own:
//                             the runtime counters must move by exactly one outcome AND the item must be
//                             redrawn into a sentence or a collapsed state (D9). Reports order and name
//                             mismatches, per-item floor facts and every silent activation.
//   items()                   per drawn item: kind, verdict, mode, display, live region, tables, alerts
//   focusProbe(names?)        each fixture ingested on its own, focus parked in the composer first:
//                             where focus went (D7 per-kind focus)
//   supersede(pred, succ)     L7: the successor replaces the predecessor in place, same element, same index
//   announceProbe(name)       two environment changes 1 s apart: the live region's writes, time-stamped
//   escapeProbe(name)         draws one fixture and names its NONE escape control (CDP drives Tab/Enter)
//   escapeResult()            after the escape: collapsed, focus on the headline, counters
//   navigateDetail(name)      NAVIGATE(detail) through the P1 binding: PROGRESS, close, focus, sentence
//   present(name, {opener})   shell.presentDetail(envelope, opener) → the fullscreen host
//   closeDetail(), dialogState()
//
// When a module or export a capability needs is not in the served graph, a call answers
// { status: 'PENDING_INTEGRATION', missing } — it never draws a substitute. The DOM ports mirror
// shell/ports.ts; the bundle's own ports live in entry/main.ts, which this page does not import because it
// mounts itself.

const status = {
  phase: 'loading',
  locale: new Intl.Collator().resolvedOptions().locale,
  collationSignature: ['y', 'j', 'z', 't', 'a', 'Z'].sort((a, b) => a.localeCompare(b)).join(''),
  modulePath: null,
  inventory: {},
  capabilities: {},
  missing: {},
  envelopes: [],
  errors: [],
};
const envelopes = new Map();
const modules = {};
let index = null;

/** Emitted module per role. */
const MODULES = Object.freeze({
  h7: 'src/integrity/h7.js',
  render: 'src/renderer/render.js',
  view: 'src/shell/view.js',
  intents: 'src/shell/intents.js',
  shell: 'src/shell/shell.js',
  host: 'src/dom/host.js',
  fullscreen: 'src/dom/fullscreen.js',
  timeline: 'src/dom/timeline.js',
});

/** Capability → the exports it needs, each as [module, one of several accepted names]. */
const CAPABILITIES = Object.freeze({
  verify: [['h7', ['verify']]],
  render: [
    ['h7', ['verify']],
    ['render', ['render']],
    ['shell', ['createShellRuntime']],
    ['host', ['mountApp']],
  ],
  present: [
    ['shell', ['createShellRuntime']],
    ['host', ['mountApp']],
    ['fullscreen', ['mountFullscreen']],
  ],
});

/**
 * The item sentences dom/host.ts draws instead of a silent outcome (§1.4; D9) — written out here, so a
 * blanked or changed sentence is a silent outcome, not a pass.
 */
const WIDGET_SENTENCES = new Set([
  'Это действие сейчас недоступно',
  'Нет связи — действие не выполнено',
  'Этот переход здесь недоступен',
  'Карточка устарела — показана сводка',
]);

const setStatus = (phase) => {
  status.phase = phase;
  const out = document.getElementById('fixture-host-status');
  if (out) out.textContent = `${phase}; locale ${status.locale}; envelopes ${status.envelopes.length}; capabilities ${JSON.stringify(status.capabilities)}`;
};

const getJson = async (url) => {
  const res = await fetch(url, { cache: 'no-store', credentials: 'omit' });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
};

const pick = (mod, names) => (mod ? names.find((n) => typeof mod[n] === 'function') ?? null : null);

function detect() {
  for (const [capability, needs] of Object.entries(CAPABILITIES)) {
    const missing = [];
    for (const [role, names] of needs) {
      if (!pick(modules[role], names)) missing.push(`${MODULES[role]}: ${names.join(' | ')}`);
    }
    status.capabilities[capability] = missing.length === 0;
    status.missing[capability] = missing;
  }
}

const pending = (capability) => ({ status: 'PENDING_INTEGRATION', capability, missing: status.missing[capability] ?? [] });

// ── DOM ports for the dev host (mirroring shell/ports.ts) ─────────────────────────────────────

const DOM_TAGS = new Set(['div', 'span', 'p', 'section', 'article', 'header', 'footer', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'button', 'textarea', 'label', 'nav', 'main', 'dialog', 'table', 'caption', 'thead', 'tbody', 'tr', 'th', 'td', 'time', 'output', 'a']);
function devPorts(root) {
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  const factory = {
    create(tag) {
      if (!DOM_TAGS.has(tag)) throw new Error(`tag ${tag} is outside the closed set`);
      return doc.createElement(tag);
    },
    createInput(type) {
      if (!['text', 'email', 'password'].includes(type)) throw new Error(`input ${type} refused`);
      const input = doc.createElement('input');
      input.type = type;
      return input;
    },
    text: (value) => doc.createTextNode(value),
  };
  const scheduler = {
    now: () => Date.now(),
    after(ms, run) {
      const t = view.setTimeout(run, ms);
      return () => view.clearTimeout(t);
    },
    frame(run) {
      const f = view.requestAnimationFrame(run);
      return () => view.cancelAnimationFrame(f);
    },
  };
  const backListeners = new Set();
  view.addEventListener('popstate', () => backListeners.forEach((l) => l()));
  const history = {
    push: () => view.history.pushState({ mayaDetail: true }, '', view.location.href),
    back: () => view.history.back(),
    onBack(listener) {
      backListeners.add(listener);
      return () => backListeners.delete(listener);
    },
  };
  return { dom: { root, factory }, scheduler, history };
}

// ── the emitted runtime and DOM host, on dev ports ────────────────────────────────────────────

let app = null;
const a11yListeners = new Set();
let a11y = { reduced_motion: matchMedia('(prefers-reduced-motion: reduce)').matches, forced_colors: false, text_scale: 1, pointer: 'fine', keyboard_only_hint: false, caption_preference: false };

/** One runtime and one mounted page per fixture-host page: signed in, no network, the P1 submission binding. */
function ensureApp() {
  if (app !== null) return app;
  const root = document.getElementById('maya');
  const { dom, scheduler, history } = devPorts(root);
  // The corpus is minted at index.now: the page clock starts there, so expiry reads as in the corpus.
  const started = performance.now();
  const base = Date.parse(index?.now ?? new Date().toISOString());
  const clock = { ...scheduler, now: () => base + (performance.now() - started) };
  const display = { userName: 'Fixture host', tenantName: null };
  const session = {
    view: () => ({ signedIn: true, display }),
    subscribe: () => () => undefined,
    startEmail: async () => ({ step: 'failed', failure: { state: 'no_connection' } }),
    verifyEmail: async () => ({ step: 'failed', failure: { state: 'no_connection' } }),
    signInPassword: async () => ({ step: 'failed', failure: { state: 'no_connection' } }),
    signOut: async () => undefined,
  };
  // A transport that never answers: the fixture host makes no request of its own.
  const transport = { chat: () => new Promise(() => undefined), transcribe: () => new Promise(() => undefined) };
  const environment = {
    a11y: () => a11y,
    onA11yChange(listener) {
      a11yListeners.add(listener);
      return () => a11yListeners.delete(listener);
    },
    fragment: () => '',
  };
  const runtime = modules.shell.createShellRuntime({ transport, session, render: modules.render.render, environment, scheduler: clock, history, newAbort: () => new AbortController() });
  const cancel = modules.host.mountApp({ dom, session, conversation: runtime.conversation, widgets: runtime.widgetPort, voice: null, scheduler: clock });
  app = { root, runtime, cancel, fixtureOf: new Map(), escape: null, hrefAtStart: null };
  return app;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const widgetItems = () => app.runtime.conversation.view().items.filter((i) => i.kind === 'widget');
const articles = () => [...app.root.querySelectorAll('[role="log"] article.widget')];
const articleOfItem = (itemId) => {
  const i = widgetItems().findIndex((item) => item.id === itemId);
  return i < 0 ? null : (articles()[i] ?? null);
};
const composer = () => [...document.querySelectorAll('textarea')].find((t) => [...(t.labels ?? [])].some((l) => /Сообщение для MAYA/.test(l.textContent)) || t.getAttribute('aria-label') === 'Сообщение для MAYA') ?? null;
const nameOf = (el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim();
const describe = (el) => (el ? { tag: el.localName, ref: el.getAttribute?.('data-ref') ?? null, name: nameOf(el).slice(0, 80), className: el.className || null } : null);
const counters = () => ({ ...app.runtime.widgets.counters() });

/** Ingest one fixture by name; remembers which item came from which fixture. */
function ingest(name) {
  const envelope = envelopes.get(name);
  if (!envelope) return { name, ingested: 'no_such_fixture' };
  const outcome = app.runtime.widgets.ingest(structuredClone(envelope));
  if (outcome.itemId) app.fixtureOf.set(outcome.itemId, name);
  return { name, ...outcome };
}

const intentOfRef = (envelope, ref) => (typeof ref === 'string' && ref.startsWith('intent:') ? (envelope.intents.find((i) => i.intent_ref === ref.slice('intent:'.length)) ?? null) : null);

/** What one drawn item shows, against its fixture's sealed envelope. */
function itemFacts(item) {
  const name = app.fixtureOf.get(item.id) ?? null;
  const envelope = name ? envelopes.get(name) : null;
  const meta = (index?.fixtures ?? []).find((f) => f.file === name) ?? null;
  const article = articleOfItem(item.id);
  const drawnRefs = article ? [...article.querySelectorAll('[data-ref]')].map((el) => el.getAttribute('data-ref')) : null;
  const want = item.display === 'collapsed' ? [] : [...item.result.readingOrder];
  const sealedNames = envelope?.presentation?.a11y?.accessible_names ?? {};
  const nameMismatches = [];
  for (const el of article ? article.querySelectorAll('[data-ref]') : []) {
    const ref = el.getAttribute('data-ref');
    if (Object.hasOwn(sealedNames, ref) && nameOf(el) !== sealedNames[ref]) nameMismatches.push({ ref, drawn: nameOf(el), sealed: sealedNames[ref] });
  }
  const live = article?.querySelector('.widget-live') ?? null;
  const buttons = article ? [...article.querySelectorAll('button[data-ref]')] : [];
  const tables = article
    ? [...article.querySelectorAll('table')].map((t) => ({
        caption: (t.querySelector('caption')?.textContent ?? '').trim(),
        colHeaders: t.querySelectorAll('thead th[scope="col"]').length,
        rowHeaders: t.querySelectorAll('tbody th[scope="row"]').length,
        rowGroups: t.querySelectorAll('tbody th[scope="rowgroup"]').length,
        rows: t.querySelectorAll('tbody tr').length,
        inRowButtons: t.querySelectorAll('tbody td button').length,
        activatableRows: t.querySelectorAll('tr[tabindex], tr[onclick], tr[role="button"]').length,
      }))
    : [];
  return {
    id: item.id,
    fixture: name,
    kind: item.result.kind,
    expect: meta?.expect ?? null,
    mode: item.result.mode,
    display: item.display,
    focusRule: item.result.focus,
    orderOk: JSON.stringify(drawnRefs) === JSON.stringify(want),
    drawnRefs,
    readingOrder: want,
    nameMismatches,
    sealedLiveRegion: envelope?.presentation?.a11y?.live_region ?? null,
    liveRegionAttr: live?.getAttribute('aria-live') ?? null,
    limitationSeverity: envelope?.kind === 'LIMITATION' ? (envelope.body?.severity ?? null) : null,
    buttonEffects: buttons.map((b) => intentOfRef(envelope ?? { intents: [] }, b.getAttribute('data-ref'))?.effect ?? null),
    onExpiry: envelope?.lifecycle?.on_expiry ?? null,
    sentence: article?.querySelector('.widget-sentence')?.textContent ?? null,
    articleClasses: article ? [...article.classList] : [],
    tables,
    heading: article?.querySelector('.widget-heading')?.textContent ?? null,
    alerts: article ? article.querySelectorAll('[role="alert"]').length + (article.getAttribute('role') === 'alert' ? 1 : 0) : null,
  };
}

/** Click one drawn button and observe its outcome on its own (D9). */
async function clickAndObserve(itemId, ref) {
  const article = articleOfItem(itemId);
  const control = article?.querySelector(`[data-ref="${CSS.escape(ref)}"]`) ?? null;
  if (!control || control.localName !== 'button') return null;
  const before = counters();
  const hrefBefore = location.href;
  const records = [];
  const observer = new MutationObserver((list) => records.push(...list));
  observer.observe(app.root, { childList: true, subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['open', 'aria-busy', 'class'] });
  control.click();
  for (let i = 0; i < 4; i += 1) await settle();
  await frame();
  records.push(...observer.takeRecords());
  observer.disconnect();
  const after = counters();
  const delta = Object.fromEntries(Object.keys(after).map((k) => [k, after[k] - before[k]]));
  const art = articleOfItem(itemId);
  const redrawn = !!art && records.some((r) => r.type === 'childList' && (r.target === art || art.contains(r.target)));
  const sentence = art?.querySelector('.widget-sentence')?.textContent ?? null;
  const collapsed = !!art && art.classList.contains('widget--collapsed');
  const busy = !!art && art.getAttribute('aria-busy') === 'true';
  const dialogOpened = records.some((r) => r.type === 'attributes' && r.attributeName === 'open' && r.oldValue === null && r.target.localName === 'dialog');
  const dialogsOpen = document.querySelectorAll('dialog[open]').length;
  const modelOk = delta.activations === 1 && delta.sentences + delta.stateChanges === 1;
  const domOk = redrawn && !busy && (collapsed || WIDGET_SENTENCES.has(sentence ?? ''));
  if (dialogsOpen > 0) app.runtime.widgetPort.closeDetail();
  return {
    itemId,
    fixture: app.fixtureOf.get(itemId) ?? null,
    ref,
    effect: intentOfRef(envelopes.get(app.fixtureOf.get(itemId)) ?? { intents: [] }, ref)?.effect ?? null,
    delta,
    redrawn,
    sentence,
    collapsed,
    busy,
    dialogOpened,
    dialogsOpen,
    hrefUnchanged: location.href === hrefBefore,
    silent: !(modelOk && domOk && dialogsOpen === 0),
  };
}

async function renderAll(names = null, { activate = true } = {}) {
  if (!status.capabilities.render) return pending('render');
  ensureApp();
  const results = [];
  for (const name of envelopes.keys()) {
    if (names !== null && !names.includes(name)) continue;
    results.push(ingest(name));
  }
  await settle();
  await frame();
  const drawn = widgetItems();
  const facts = drawn.map(itemFacts);
  const activations = [];
  if (activate) {
    for (const item of drawn) {
      for (const ref of [...item.result.readingOrder]) {
        const observed = await clickAndObserve(item.id, ref);
        if (observed !== null) activations.push(observed);
      }
    }
  }
  const total = counters();
  return {
    status: 'OK',
    rendered: results.length,
    added: results.filter((r) => r.ingested === 'added').length,
    ingest: results.map((r) => ({ name: r.name, ingested: r.ingested, verdict: r.verdict ?? null })),
    orderMismatches: facts.filter((f) => !f.orderOk).map((f) => ({ fixture: f.fixture, drawn: f.drawnRefs, want: f.readingOrder })),
    nameMismatches: facts.flatMap((f) => f.nameMismatches.map((m) => ({ fixture: f.fixture, ...m }))),
    alerts: document.querySelectorAll('[role="alert"]').length,
    items: facts,
    clicks: activations.length,
    activations,
    silent: activations.filter((a) => a.silent),
    counters: total,
    countersBalanced: total.activations === total.stateChanges + total.sentences,
  };
}

function items() {
  if (app === null) return { status: 'NOTHING_DRAWN' };
  return { status: 'OK', items: widgetItems().map(itemFacts) };
}

/** Each fixture drawn on its own, with focus parked in the composer first (D7 per-kind focus). */
async function focusProbe(names = null) {
  if (!status.capabilities.render) return pending('render');
  ensureApp();
  const out = [];
  for (const name of envelopes.keys()) {
    if (names !== null && !names.includes(name)) continue;
    const park = composer();
    park?.focus();
    const outcome = ingest(name);
    if (!outcome.itemId) {
      out.push({ fixture: name, ingested: outcome.ingested });
      continue;
    }
    await settle();
    await frame();
    await frame();
    const item = widgetItems().find((i) => i.id === outcome.itemId);
    const article = articleOfItem(outcome.itemId);
    const active = document.activeElement;
    const heading = article?.querySelector('.widget-heading') ?? null;
    const firstRefused = article?.querySelector('[aria-invalid="true"]') ?? null;
    out.push({
      fixture: name,
      kind: item?.result.kind ?? null,
      focusRule: item?.result.focus ?? null,
      composerParked: park !== null,
      onHeading: heading !== null && active === heading,
      onFirstRefused: firstRefused !== null && active === firstRefused,
      insideItem: !!article && article.contains(active),
      stayedInComposer: park !== null && active === park,
      active: describe(active),
    });
  }
  return { status: 'OK', probes: out };
}

/** L7: a successor replaces its predecessor in place — the same element at the same index. */
async function supersede(predecessor = 'h7/invariant/slots-superseded-predecessor.json', successor = 'h7/invariant/slots-superseded-successor.json') {
  if (!status.capabilities.render) return pending('render');
  ensureApp();
  ingest('h7/invariant/kind-metric.json');
  const first = ingest(predecessor);
  ingest('h7/invariant/kind-choice.json');
  await settle();
  await frame();
  const beforeCount = widgetItems().length;
  const beforeArticle = articleOfItem(first.itemId);
  const beforeIndex = articles().indexOf(beforeArticle);
  const beforeText = beforeArticle?.textContent ?? null;
  const second = ingest(successor);
  await settle();
  await frame();
  const afterArticle = articleOfItem(first.itemId);
  return {
    status: 'OK',
    first,
    second,
    sameItem: second.itemId === first.itemId && second.ingested === 'replaced',
    sameElement: afterArticle !== null && afterArticle === beforeArticle,
    sameIndex: beforeIndex >= 0 && articles().indexOf(afterArticle) === beforeIndex,
    itemCountUnchanged: widgetItems().length === beforeCount,
    contentChanged: (afterArticle?.textContent ?? null) !== beforeText,
    index: beforeIndex,
    alerts: document.querySelectorAll('[role="alert"]').length,
  };
}

/** Two environment changes 1 s apart; every non-empty write to the item's live region, time-stamped. */
async function announceProbe(name = 'h7/invariant/kind-progress.json', { waitMs = 6500 } = {}) {
  if (!status.capabilities.render) return pending('render');
  ensureApp();
  const writes = [];
  const t0 = performance.now();
  const observer = new MutationObserver(() => {
    for (const live of app.root.querySelectorAll('[role="log"] .widget-live')) {
      const text = live.textContent ?? '';
      if (text !== '' && live.dataset.seen !== text) {
        live.dataset.seen = text;
        writes.push({ at: Math.round(performance.now() - t0), text: text.slice(0, 60), ariaLive: live.getAttribute('aria-live') });
      }
    }
  });
  observer.observe(app.root, { childList: true, subtree: true, characterData: true });
  const outcome = ingest(name);
  await sleep(400);
  const change = () => {
    a11y = { ...a11y, text_scale: a11y.text_scale === 1 ? 1.01 : 1 };
    for (const l of [...a11yListeners]) l(a11y);
  };
  change();
  await sleep(1000);
  change();
  await sleep(waitMs);
  observer.disconnect();
  const gaps = writes.slice(1).map((w, i) => w.at - writes[i].at);
  return { status: 'OK', outcome, writes, gaps, alerts: document.querySelectorAll('[role="alert"]').length };
}

/** Draw one fixture and name its NONE escape; the driver then moves focus and activates by keyboard. */
async function escapeProbe(name = 'h7/invariant/kind-choice.json') {
  if (!status.capabilities.render) return pending('render');
  ensureApp();
  const outcome = ingest(name);
  await settle();
  await frame();
  const envelope = envelopes.get(name);
  const item = widgetItems().find((i) => i.id === outcome.itemId);
  const refs = [...item.result.readingOrder];
  const escapeRef = refs.find((ref) => intentOfRef(envelope, ref)?.effect === 'NONE') ?? null;
  app.escape = { itemId: outcome.itemId, before: counters() };
  const article = articleOfItem(outcome.itemId);
  return { status: 'OK', itemId: outcome.itemId, refs, escapeRef, tabbable: article ? [...article.querySelectorAll('[data-ref]')].filter((el) => el.tabIndex >= 0).map((el) => el.getAttribute('data-ref')) : [] };
}

async function escapeResult() {
  if (!app?.escape) return { status: 'NO_PROBE' };
  await settle();
  await frame();
  await frame();
  const { itemId, before } = app.escape;
  const item = widgetItems().find((i) => i.id === itemId);
  const article = articleOfItem(itemId);
  const after = counters();
  return {
    status: 'OK',
    display: item?.display ?? null,
    collapsed: !!article && article.classList.contains('widget--collapsed'),
    controlsLeft: article ? article.querySelectorAll('[data-ref]').length : null,
    focusOnHeadline: !!article && document.activeElement === article.querySelector('.widget-heading'),
    active: describe(document.activeElement),
    delta: Object.fromEntries(Object.keys(after).map((k) => [k, after[k] - before[k]])),
  };
}

/** NAVIGATE(detail) under the P1 binding: PROGRESS opens, the unavailable outcome closes it (§1.5D). */
async function navigateDetail(name = 'h7/invariant/kind-report.json') {
  if (!status.capabilities.present) return pending('present');
  ensureApp();
  const outcome = ingest(name);
  await settle();
  await frame();
  const envelope = envelopes.get(name);
  const item = widgetItems().find((i) => i.id === outcome.itemId);
  const ref = [...item.result.readingOrder].find((r) => {
    const intent = intentOfRef(envelope, r);
    return intent?.effect === 'NAVIGATE' && intent.target?.class === 'detail';
  });
  if (!ref) return { status: 'NO_NAVIGATE_DETAIL', name };
  const phases = [];
  const off = app.runtime.shell.subscribe((view) => phases.push(view.fullscreen === null ? 'none' : view.fullscreen.phase));
  const records = [];
  const observer = new MutationObserver((list) => records.push(...list));
  observer.observe(app.root, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['open'] });
  const hrefBefore = location.href;
  const control = articleOfItem(outcome.itemId).querySelector(`[data-ref="${CSS.escape(ref)}"]`);
  control.focus();
  control.click();
  for (let i = 0; i < 4; i += 1) await settle();
  await frame();
  await frame();
  records.push(...observer.takeRecords());
  observer.disconnect();
  off();
  const article = articleOfItem(outcome.itemId);
  const active = document.activeElement;
  return {
    status: 'OK',
    ref,
    phases,
    progressSeen: phases.includes('progress'),
    dialogOpened: records.some((r) => r.attributeName === 'open' && r.oldValue === null),
    dialogClosed: records.some((r) => r.attributeName === 'open' && r.oldValue !== null),
    dialogsOpen: document.querySelectorAll('dialog[open]').length,
    focusOnOpener: !!article && article.contains(active) && active.getAttribute('data-ref') === ref,
    active: describe(active),
    sentence: article?.querySelector('.widget-sentence')?.textContent ?? null,
    hrefUnchanged: location.href === hrefBefore,
    alerts: document.querySelectorAll('[role="alert"]').length,
  };
}

/** shell.presentDetail(envelope, opener) → the fullscreen host. The opener is an item drawn on the timeline (S4 D-2). */
async function present(name = 'h7/invariant/kind-booking-confirmation.json', { openerName = null } = {}) {
  if (!status.capabilities.present) return pending('present');
  ensureApp();
  const envelope = envelopes.get(name);
  if (!envelope) return { status: 'NO_SUCH_FIXTURE', name };
  if (app.hrefAtStart === null) app.hrefAtStart = location.href;
  let openerItem = openerName === null ? (widgetItems().at(-1) ?? null) : null;
  if (openerItem === null) {
    const added = ingest(openerName ?? name);
    await settle();
    openerItem = added.itemId ? widgetItems().find((i) => i.id === added.itemId) : widgetItems().at(-1);
  }
  const opener = { itemId: openerItem.id, ref: openerItem.result.readingOrder[0] ?? 'intent:none' };
  const control = articleOfItem(openerItem.id)?.querySelector(`[data-ref="${CSS.escape(opener.ref)}"]`) ?? null;
  if (document.querySelectorAll('dialog[open]').length === 0) control?.focus();
  const outcome = app.runtime.shell.presentDetail(structuredClone(envelope), opener);
  await frame();
  await frame();
  const dialogs = [...document.querySelectorAll('dialog[open]')];
  return {
    status: outcome.presented ? 'OK' : 'REFUSED',
    outcome,
    opener,
    dialogs: dialogs.length,
    modal: dialogs[0]?.getAttribute('aria-modal') ?? null,
    title: dialogs[0]?.querySelector('.fullscreen-title')?.textContent ?? null,
    focusInside: dialogs.length === 1 && dialogs[0].contains(document.activeElement),
    hrefUnchanged: location.href === app.hrefAtStart,
  };
}

async function closeDetail() {
  if (app === null) return { status: 'NOTHING_OPEN' };
  app.runtime.widgetPort.closeDetail();
  await frame();
  await frame();
  return { status: 'OK', dialogs: document.querySelectorAll('dialog[open]').length, active: describe(document.activeElement) };
}

/** Where focus is and whether it is inside the one open dialog; the driver calls it between key presses. */
function dialogState() {
  const dialogs = [...document.querySelectorAll('dialog[open]')];
  return { dialogs: dialogs.length, focusInside: dialogs.length === 1 && dialogs[0].contains(document.activeElement), active: describe(document.activeElement), href: location.href, hrefAtStart: app?.hrefAtStart ?? null };
}

function verifyAll(nowIso = index?.now ?? new Date().toISOString()) {
  if (!status.capabilities.verify) return pending('verify');
  const verify = modules.h7[pick(modules.h7, ['verify'])];
  const expected = new Map((index?.fixtures ?? []).map((f) => [f.file ?? f.path ?? f.name, f]));
  const results = [];
  for (const [name, envelope] of envelopes) {
    let verdict;
    try {
      verdict = verify(structuredClone(envelope), nowIso);
    } catch (error) {
      verdict = `threw: ${error.message}`;
    }
    results.push({ name, verdict, meta: expected.get(name) ?? null });
  }
  return { status: 'OK', locale: new Intl.Collator().resolvedOptions().locale, nowIso, results };
}

async function boot() {
  const web = await getJson('/__dev/web.json');
  status.modulePath = web.modulePath;
  if (web.styles) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/styles.css';
    document.head.append(link);
  }
  if (web.modulePath) {
    for (const [role, file] of Object.entries(MODULES)) {
      if (!web.files.includes(file)) continue;
      try {
        modules[role] = await import(`/${web.modulePath}${file}`);
        status.inventory[file] = Object.keys(modules[role]).sort();
      } catch (error) {
        status.errors.push(`${file}: ${error.message}`);
      }
    }
  }
  const listing = await getJson('/__dev/fixtures-index.json');
  for (const rel of listing.envelopes) {
    if (!rel.startsWith('h7/') && !rel.startsWith('kinds/') && !rel.startsWith('widgets/')) {
      if (rel === 'index.json') index = await getJson('/__dev/fixtures/envelopes/index.json');
      continue;
    }
    envelopes.set(rel, await getJson(`/__dev/fixtures/envelopes/${rel}`));
  }
  status.envelopes = [...envelopes.keys()];
  detect();
  setStatus(Object.values(status.capabilities).every(Boolean) ? 'ready' : 'pending_integration');
  return status;
}

const ready = boot().catch((error) => {
  status.errors.push(error.message);
  setStatus('error');
  return status;
});

globalThis.__fixtureHost = Object.freeze({
  ready,
  status,
  envelope: (name) => structuredClone(envelopes.get(name) ?? null),
  verifyAll,
  renderAll,
  items,
  focusProbe,
  supersede,
  announceProbe,
  escapeProbe,
  escapeResult,
  navigateDetail,
  present,
  closeDetail,
  dialogState,
});
