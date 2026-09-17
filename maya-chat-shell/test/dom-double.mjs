// K5 / S5 — a small DOM double for the dom/ modules (SHELL-PLAN v2.1 §2.8; no DOM library).
//
// Enough of an element tree to run `src/dom/**` under `node --test`: the closed DomFactory (a tag
// outside the set throws), attributes and the properties the modules write, text, append/prepend/
// before/after/remove/replaceChildren, focus with blur, bubbling events with preventDefault,
// `querySelector(':focus')`, a modal `dialog`, and a scheduler with manual time and frames.
//
// It also RECORDS what matters for the boundary rules: every created tag, every `href` write (with
// the value), and any touch of a request or HTML sink the modules must never reach (`src`, `style`,
// `innerHTML`, `click()`, …) — those throw, so a regression fails the test that exercised it.
//
// Helpers compute what a browser would: a simplified accessible name (aria-labelledby, aria-label,
// <label for>, text minus aria-hidden subtrees), visibility (no hidden ancestor, dialogs open),
// sequential Tab order, and a serialization for byte searches.

const CLOSED_TAGS = new Set([
  'div', 'span', 'p', 'section', 'article', 'header', 'footer', 'h2', 'h3', 'h4', 'ul', 'ol', 'li',
  'button', 'textarea', 'label', 'nav', 'main', 'dialog', 'table', 'caption', 'thead', 'tbody', 'tr',
  'th', 'td', 'time', 'output', 'a',
]);
const INPUT_TYPES = new Set(['text', 'email', 'password']);
const FORBIDDEN = ['src', 'srcset', 'action', 'formAction', 'poster', 'data', 'ping', 'background', 'style', 'innerHTML', 'outerHTML', 'insertAdjacentHTML', 'ownerDocument', 'defaultView', 'getRootNode', 'click', 'submit', 'requestSubmit', 'appendChild'];
const REFLECTED = { type: 'type', htmlFor: 'for', scope: 'scope', rel: 'rel', target: 'target', placeholder: 'placeholder', id: 'id' };

export function createDom() {
  const record = { creates: [], hrefWrites: [], events: [] };
  const state = { active: null };

  class Text {
    constructor(value) {
      this.nodeType = 3;
      this.parentNode = null;
      this.data_ = String(value);
    }
    get textContent() {
      return this.data_;
    }
    set textContent(value) {
      this.data_ = String(value);
    }
  }

  class ClassList {
    constructor(el) {
      this.el = el;
    }
    get names() {
      return (this.el.attrs.get('class') ?? '').split(/\s+/).filter(Boolean);
    }
    set(names) {
      if (names.length === 0) this.el.attrs.delete('class');
      else this.el.attrs.set('class', [...new Set(names)].join(' '));
    }
    add(...names) {
      this.set([...this.names, ...names]);
    }
    remove(...names) {
      this.set(this.names.filter((n) => !names.includes(n)));
    }
    contains(name) {
      return this.names.includes(name);
    }
    toggle(name, force) {
      const on = force === undefined ? !this.contains(name) : Boolean(force);
      if (on) this.add(name);
      else this.remove(name);
      return on;
    }
  }

  class Element {
    constructor(tag) {
      this.nodeType = 1;
      this.localName = tag;
      this.tagName = tag.toUpperCase();
      this.childNodes = [];
      this.parentNode = null;
      this.attrs = new Map();
      this.listeners = new Map();
      this.classList = new ClassList(this);
      this.disabled = false;
      this.readOnly = false;
      this.value = '';
      this.rows = 2;
      this.colSpan = 1;
      this.enterKeyHint = '';
      this.inputMode = '';
      this.autocomplete = '';
      this.autocapitalize = '';
      this.spellcheck = true;
      this.scrollTop = 0;
      this.scrollHeight = 0;
      this.clientHeight = 0;
      this.connected = false;
      for (const name of FORBIDDEN)
        Object.defineProperty(this, name, {
          get() {
            throw new Error(`dom double: a dom/ module reached the forbidden member "${name}"`);
          },
          set() {
            throw new Error(`dom double: a dom/ module wrote the forbidden member "${name}"`);
          },
        });
    }
    get parentElement() {
      return this.parentNode;
    }
    get children() {
      const list = this.childNodes.filter((n) => n.nodeType === 1);
      list.item = (i) => list.at(i) ?? null;
      return list;
    }
    get className() {
      return this.attrs.get('class') ?? '';
    }
    set className(value) {
      this.classList.set(String(value).split(/\s+/).filter(Boolean));
    }
    get hidden() {
      return this.attrs.has('hidden');
    }
    set hidden(value) {
      if (value) this.attrs.set('hidden', '');
      else this.attrs.delete('hidden');
    }
    get tabIndex() {
      const raw = this.attrs.get('tabindex');
      if (raw !== undefined) return Number(raw);
      if (['button', 'textarea', 'input'].includes(this.localName)) return 0;
      if (this.localName === 'a' && this.attrs.has('href')) return 0;
      return -1;
    }
    set tabIndex(value) {
      this.attrs.set('tabindex', String(value));
    }
    get href() {
      return this.attrs.get('href') ?? '';
    }
    set href(value) {
      record.hrefWrites.push({ tag: this.localName, value: String(value) });
      this.attrs.set('href', String(value));
    }
    get open() {
      return this.attrs.has('open');
    }
    get isConnected() {
      for (let n = this; n; n = n.parentNode) if (n.connected) return true;
      return false;
    }
    get textContent() {
      return this.childNodes.map((n) => n.textContent).join('');
    }
    set textContent(value) {
      for (const n of this.childNodes) n.parentNode = null;
      this.childNodes = value === '' || value === null || value === undefined ? [] : [new Text(value)];
      for (const n of this.childNodes) n.parentNode = this;
    }
    setAttribute(name, value) {
      if (/^on/i.test(name) || ['src', 'href', 'style', 'action', 'srcset', 'formaction'].includes(name.toLowerCase()))
        throw new Error(`dom double: setAttribute("${name}") is a sink`);
      this.attrs.set(name, String(value));
    }
    getAttribute(name) {
      return this.attrs.has(name) ? this.attrs.get(name) : null;
    }
    hasAttribute(name) {
      return this.attrs.has(name);
    }
    removeAttribute(name) {
      this.attrs.delete(name);
    }
    contains(node) {
      for (let n = node; n; n = n.parentNode) if (n === this) return true;
      return false;
    }
    adopt(nodes) {
      return nodes.map((n) => {
        const node = typeof n === 'string' ? new Text(n) : n;
        if (node.parentNode) node.parentNode.childNodes.splice(node.parentNode.childNodes.indexOf(node), 1);
        this.blurIfLeaving(node);
        node.parentNode = this;
        return node;
      });
    }
    blurIfLeaving(node) {
      if (state.active && node.nodeType === 1 && node.contains(state.active)) state.active.blur();
    }
    append(...nodes) {
      this.childNodes.push(...this.adopt(nodes));
    }
    prepend(...nodes) {
      this.childNodes.unshift(...this.adopt(nodes));
    }
    before(...nodes) {
      const parent = this.parentNode;
      const adopted = parent.adopt(nodes);
      parent.childNodes.splice(parent.childNodes.indexOf(this), 0, ...adopted);
    }
    after(...nodes) {
      const parent = this.parentNode;
      const adopted = parent.adopt(nodes);
      parent.childNodes.splice(parent.childNodes.indexOf(this) + 1, 0, ...adopted);
    }
    remove() {
      if (!this.parentNode) return;
      this.blurIfLeaving(this);
      this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this), 1);
      this.parentNode = null;
    }
    replaceChildren(...nodes) {
      for (const n of this.childNodes) {
        this.blurIfLeaving(n);
        n.parentNode = null;
      }
      this.childNodes = [];
      this.append(...nodes);
    }
    closest(selector) {
      if (!/^[a-z0-9]+$/.test(selector)) throw new Error(`dom double: unsupported closest(${selector})`);
      for (let n = this; n; n = n.parentNode) if (n.localName === selector) return n;
      return null;
    }
    querySelector(selector) {
      if (selector !== ':focus') throw new Error(`dom double: unsupported selector ${selector}`);
      return state.active && state.active !== this && this.contains(state.active) ? state.active : null;
    }
    focus() {
      if (!isFocusable(this)) return;
      if (state.active === this) return;
      const previous = state.active;
      state.active = this;
      if (previous) previous.dispatch({ type: 'blur', bubbles: false });
      this.dispatch({ type: 'focus', bubbles: false });
    }
    blur() {
      if (state.active !== this) return;
      state.active = null;
      this.dispatch({ type: 'blur', bubbles: false });
    }
    showModal() {
      this.attrs.set('open', '');
      state.modal = this;
    }
    close() {
      if (!this.attrs.has('open')) return;
      this.attrs.delete('open');
      if (state.modal === this) state.modal = null;
      if (state.active && this.contains(state.active)) state.active.blur();
    }
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(fn);
    }
    removeEventListener(type, fn) {
      const list = this.listeners.get(type) ?? [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    }
    dispatch(init) {
      const event = {
        isTrusted: true,
        timeStamp: 1000,
        bubbles: true,
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        isComposing: false,
        keyCode: 0,
        defaultPrevented: false,
        target: this,
        preventDefault() {
          this.defaultPrevented = true;
        },
        ...init,
      };
      record.events.push(event.type);
      for (let n = this; n; n = event.bubbles ? n.parentNode : null) for (const fn of [...(n.listeners.get(event.type) ?? [])]) fn(event);
      return event;
    }
  }

  const isVisible = (el) => {
    if (!el.isConnected) return false;
    for (let n = el; n; n = n.parentNode) {
      if (n.hidden) return false;
      if (n.localName === 'dialog' && !n.open) return false;
    }
    return true;
  };
  const isFocusable = (el) => isVisible(el) && !el.disabled && (el.tabIndex >= 0 || el.attrs.has('tabindex'));

  const factory = {
    create(tag) {
      if (!CLOSED_TAGS.has(tag)) throw new Error(`dom double: <${tag}> is outside the closed tag set`);
      record.creates.push(tag);
      return new Element(tag);
    },
    createInput(type) {
      if (!INPUT_TYPES.has(type)) throw new Error(`dom double: input type ${type} is refused`);
      record.creates.push(`input:${type}`);
      const input = new Element('input');
      input.type = type;
      return input;
    },
    text: (value) => new Text(value),
  };
  for (const [prop, attr] of Object.entries(REFLECTED))
    Object.defineProperty(Element.prototype, prop, {
      get() {
        return this.attrs.get(attr) ?? '';
      },
      set(value) {
        this.attrs.set(attr, String(value));
      },
    });

  const root = new Element('main');
  root.connected = true;
  root.attrs.set('id', 'maya');

  // ── reading helpers ──
  const walk = (el, out = []) => {
    for (const n of el.childNodes)
      if (n.nodeType === 1) {
        out.push(n);
        walk(n, out);
      }
    return out;
  };
  const all = (from = root) => walk(from);
  const collapse = (s) => s.replace(/\s+/g, ' ').trim();
  const textOf = (el) => collapse(el.textContent);
  const visibleText = (el) => {
    if (el.nodeType === 3) return el.textContent;
    if (!isVisible(el) && el !== root) return '';
    return el.childNodes.map((n) => (n.nodeType === 3 ? n.textContent : n.hidden ? '' : visibleText(n))).join('');
  };
  const nameText = (el) =>
    el.childNodes.map((n) => (n.nodeType === 3 ? n.textContent : n.getAttribute('aria-hidden') === 'true' ? '' : nameText(n))).join('');
  const byId = (id) => all().find((el) => el.getAttribute('id') === id) ?? null;
  const nameOf = (el) => {
    const by = el.getAttribute('aria-labelledby');
    if (by) return collapse(by.split(/\s+/).map((id) => (byId(id) ? byId(id).textContent : '')).join(' '));
    const label = el.getAttribute('aria-label');
    if (label !== null) return label;
    if (['input', 'textarea'].includes(el.localName)) {
      const id = el.getAttribute('id');
      const labels = all().filter((l) => l.localName === 'label' && l.getAttribute('for') === id);
      return collapse(labels.map((l) => l.textContent).join(' '));
    }
    return collapse(nameText(el));
  };
  const tabOrder = (from = root) => all(from).filter((el) => isFocusable(el) && el.tabIndex >= 0);
  const find = (predicate, from = root) => all(from).find(predicate) ?? null;
  const findAll = (predicate, from = root) => all(from).filter(predicate);
  const button = (re, from = root) => find((el) => el.localName === 'button' && isVisible(el) && re.test(nameOf(el)), from);
  const serialize = (el = root) =>
    `<${el.localName}${[...el.attrs].map(([k, v]) => ` ${k}="${v}"`).join('')}>${el.childNodes.map((n) => (n.nodeType === 3 ? n.textContent : serialize(n))).join('')}</${el.localName}>`;

  // ── acting ──
  const click = (el) => {
    if (!isVisible(el)) throw new Error('dom double: clicking an element that is not visible');
    el.focus();
    return el.dispatch({ type: 'click' });
  };
  const key = (el, name, options = {}) => {
    const event = el.dispatch({ type: 'keydown', key: name, shiftKey: Boolean(options.shift), isComposing: Boolean(options.composing), keyCode: options.keyCode ?? 0 });
    if (event.defaultPrevented) return event;
    if (name === 'Tab') {
      const scope = state.modal ?? root;
      const order = tabOrder(scope);
      const at = order.indexOf(state.active);
      const next = options.shift ? order.at(at <= 0 ? -1 : at - 1) : order.at(at + 1 >= order.length ? 0 : at + 1);
      next?.focus();
    } else if ((name === 'Enter' || name === ' ') && el.localName === 'button') {
      el.dispatch({ type: 'click' });
    } else if (name === 'Escape' && state.modal) {
      const cancel = state.modal.dispatch({ type: 'cancel', bubbles: false });
      if (!cancel.defaultPrevented) state.modal.close();
    }
    return event;
  };
  const type = (el, text) => {
    el.focus();
    el.value = text;
    el.dispatch({ type: 'input' });
  };

  return {
    factory,
    root,
    record,
    active: () => state.active,
    modal: () => state.modal ?? null,
    isVisible,
    all,
    find,
    findAll,
    button,
    textOf,
    visibleText: (el = root) => collapse(visibleText(el)),
    nameOf,
    tabOrder,
    serialize,
    click,
    key,
    type,
  };
}

/** A scheduler with manual time: `after` timers run on `advance`, frames on `flush` (and after `advance`). */
export function createScheduler(start = Date.parse('2026-09-17T09:05:00.000Z')) {
  let now = start;
  let seq = 0;
  const timers = [];
  let frames = [];
  const flush = () => {
    for (let round = 0; round < 20 && frames.length > 0; round += 1) {
      const run = frames;
      frames = [];
      for (const f of run) if (!f.cancelled) f.run();
    }
  };
  return {
    now: () => now,
    after(ms, run) {
      const timer = { at: now + Math.max(0, ms), seq: (seq += 1), run, cancelled: false };
      timers.push(timer);
      return () => (timer.cancelled = true);
    },
    frame(run) {
      const f = { run, cancelled: false };
      frames.push(f);
      return () => (f.cancelled = true);
    },
    flush,
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const due = timers.filter((t) => !t.cancelled && t.at <= until).sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
        if (!due) break;
        due.cancelled = true;
        now = due.at;
        due.run();
        flush();
      }
      now = until;
      flush();
    },
    pending: () => timers.filter((t) => !t.cancelled).length,
  };
}
