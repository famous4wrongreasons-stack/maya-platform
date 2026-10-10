// Real carrier composition and headless owners, synthetic session/transport only.
// No browser, server, fetch or grant injection. This exercises login bootstrap,
// which presentation-only fixtures intentionally do not instantiate.
import assert from 'node:assert/strict';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const compiled = await esbuild.build({
  entryPoints: [path.resolve(here, '../src/runtime/compose.ts')],
  bundle: true, write: false, format: 'cjs', platform: 'node', target: 'node22', logLevel: 'warning',
  plugins: [{ name: 'synthetic-net-only', setup(build) {
    build.onResolve({ filter: /\/net\/session\.ts$/ }, () => ({ path: 'net', namespace: 'synthetic-net' }));
    build.onLoad({ filter: /^net$/, namespace: 'synthetic-net' }, () => ({
      contents: 'export const createNet = () => globalThis.syntheticNet;', loader: 'js',
    }));
  } }],
});
const script = new vm.Script(compiled.outputFiles[0].text, { filename: 'current-compose.cjs' });
const flush = () => new Promise(resolve => setImmediate(resolve));
const plain = value => JSON.parse(JSON.stringify(value));

function compose(href, initiallySignedIn = false) {
  let current = initiallySignedIn ? signedIn() : { signedIn: false, reason: null };
  const listeners = new Set(), reads = [], writes = [];
  const session = {
    view: () => current,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
  function signedIn() { return { signedIn: true, display: { userName: 'Синтетический владелец', tenantName: 'Тестовый бизнес' } }; }
  function setSignedIn(value) {
    current = value ? signedIn() : { signedIn: false, reason: 'signed_out' };
    for (const listener of [...listeners]) listener(current);
  }
  const forbiddenWrite = name => async () => { writes.push(name); throw new Error(`Unexpected synthetic write: ${name}`); };
  // Frozen original ensures the composition cannot silently disable history on the shared net.
  const transport = Object.freeze({
    conversation: async () => {
      reads.push('conversation');
      return { ok: true, value: {
        conversationId: '11111111-1111-4111-8111-111111111111',
        turns: [{ role: 'assistant', text: 'Сохранённый ответ', completed: true }],
        truncated: false, interrupted: false,
      } };
    },
    resolveWidgets: async request => {
      reads.push('widgets');
      assert.deepEqual(plain(request), { thread_page: { limit: 20 } });
      return { ok: true, value: { tenant_bound: true, widgets: [] } };
    },
    crmSetupStatus: async () => {
      reads.push('crm-status'); return { ok: true, value: { connection: null } };
    },
    personalBranches: async () => {
      reads.push('branches'); return { ok: true, value: [{ id: 'synthetic-branch', name: 'Тестовый филиал', timezone: 'Europe/Moscow' }] };
    },
    chat: forbiddenWrite('chat'), widgetIntent: forbiddenWrite('widgetIntent'),
    crmSetupStage: forbiddenWrite('crmSetupStage'), crmSetupActivate: forbiddenWrite('crmSetupActivate'),
  });
  const windowEvents = new EventTarget(), documentEvents = new EventTarget();
  const noNavigation = () => { throw new Error('Composition must not navigate'); };
  const url = new URL(href);
  const module = { exports: {} };
  const context = vm.createContext({
    module, exports: module.exports, crypto: webcrypto, AbortController, URL, URLSearchParams,
    syntheticNet: { session, transport, onboarding: { dispose() {} } },
    navigator: {},
    window: {
      location: { origin: url.origin, protocol: url.protocol, hostname: url.hostname, search: url.search, pathname: url.pathname, hash: url.hash, href, assign: noNavigation },
      isSecureContext: false,
      matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
      getComputedStyle: () => ({ fontSize: '16px' }),
      history: { replaceState: noNavigation, pushState: noNavigation, back: noNavigation },
      addEventListener: windowEvents.addEventListener.bind(windowEvents),
      removeEventListener: windowEvents.removeEventListener.bind(windowEvents),
      setTimeout, clearTimeout,
      requestAnimationFrame: callback => setImmediate(callback), cancelAnimationFrame: clearImmediate,
    },
    document: {
      documentElement: {}, visibilityState: 'visible',
      addEventListener: documentEvents.addEventListener.bind(documentEvents),
      removeEventListener: documentEvents.removeEventListener.bind(documentEvents),
    },
  });
  script.runInContext(context);
  return { ports: module.exports, reads, writes, transport, setSignedIn };
}

test('explicit setup never restores chat/history widgets on initial login or relogin; A17 reads remain explicit', async () => {
  const f = compose('http://127.0.0.1:4173/?local_crm_setup=1');
  try {
    assert.equal(f.ports.localCrmSetupEnabled, true);
    await flush(); assert.deepEqual(f.reads, []);
    f.setSignedIn(true); await flush(); assert.deepEqual(f.reads, []);
    assert.deepEqual(plain(f.ports.conversation.view().items), []);
    await f.ports.localCrmSetup.load();
    assert.deepEqual(f.reads, ['crm-status', 'branches']);
    assert.equal(f.ports.localCrmSetup.view().branches[0].id, 'synthetic-branch');
    assert.equal(f.ports.localCrmSetup.view().phase, 'ready');
    f.setSignedIn(false); f.setSignedIn(true); await flush();
    assert.deepEqual(f.reads, ['crm-status', 'branches']);
    assert.deepEqual(f.writes, []);
    assert.equal(typeof f.transport.conversation, 'function', 'original net keeps its optional reader');
  } finally { f.ports.dispose(); }
});

test('setup with a restored signed-in session also skips history and widget restoration', async () => {
  const f = compose('https://localhost:4173/?local_crm_setup=1', true);
  try {
    await flush();
    assert.equal(f.ports.localCrmSetupEnabled, true);
    assert.deepEqual(f.reads, []); assert.deepEqual(f.writes, []);
    assert.deepEqual(plain(f.ports.conversation.view().items), []);
  } finally { f.ports.dispose(); }
});

test('ordinary chat restores saved text and bounded widgets once per login, including initial signed-in session', async () => {
  for (const initiallySignedIn of [false, true]) {
    const f = compose('http://127.0.0.1:4173/', initiallySignedIn);
    try {
      assert.equal(f.ports.localCrmSetupEnabled, false);
      if (!initiallySignedIn) { await flush(); assert.deepEqual(f.reads, []); f.setSignedIn(true); }
      await flush(); assert.deepEqual(f.reads, ['conversation', 'widgets']);
      assert.deepEqual(plain(f.ports.conversation.view().items.filter(i => i.kind === 'assistant').map(i => i.text)), ['Сохранённый ответ']);
      f.setSignedIn(false);
      assert.deepEqual(plain(f.ports.conversation.view().items), []);
      f.setSignedIn(true); await flush();
      assert.deepEqual(f.reads, ['conversation', 'widgets', 'conversation', 'widgets']);
      assert.deepEqual(f.writes, []);
    } finally { f.ports.dispose(); }
  }
});

test('history omission requires the existing exact local opt-in; remote/unsupported/other query retains ordinary restore', async () => {
  for (const href of [
    'https://maya.invalid/?local_crm_setup=1',
    'http://127.0.0.1:4173/?local_crm_setup=0',
    'http://localhost:4173/?local_crm_setup=true',
    'file:///app/index.html?local_crm_setup=1',
  ]) {
    const f = compose(href, true);
    try {
      await flush();
      assert.equal(f.ports.localCrmSetupEnabled, false, href);
      assert.deepEqual(f.reads, ['conversation', 'widgets'], href);
      assert.deepEqual(f.writes, []);
    } finally { f.ports.dispose(); }
  }
});
