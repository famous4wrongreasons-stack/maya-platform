import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { createTelegramPopup } from '../src/runtime/telegramPopup.ts';

const origin = 'https://mayaos.ru';
const callback = '/oauth-callback.html';
const fragment = '#oauth=telegram&state=te_synthetic_state&code=synthetic';
const auth = 'https://oauth.telegram.org/auth?client_id=1&state=te_synthetic_state';
const script = fs.readFileSync(new URL('../../maya-saas-backend/deploy/platform/beget-edge/oauth-callback.html', import.meta.url), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function fixture(blocked = false) {
  const timers = new Map(), listeners = new Map(), delivered = [], failures = [], navigation = [];
  let id = 0, location = new URL('about:blank'), blockedLocation = false;
  const popup = { opener: {}, closed: false, close() { this.closed = true; },
    get location() { if (blockedLocation) throw new Error('cross origin'); return {
      origin: location.origin, pathname: location.pathname, search: location.search, hash: location.hash,
      replace(value) { navigation.push(value); location = new URL(value, origin); },
    }; },
    history: { replaceState(_state, _title, value) { location = new URL(value, origin); } },
  };
  const view = { location: { origin }, open(url, name) { assert.equal(url, 'about:blank'); assert.equal(name, '_blank'); return blocked ? null : popup; },
    setTimeout(fn, ms) { timers.set(++id, { fn, ms }); return id; }, clearTimeout(key) { timers.delete(key); },
    addEventListener(name, fn) { listeners.set(name, fn); }, removeEventListener(name) { listeners.delete(name); },
  };
  const prepare = createTelegramPopup(view, value => { assert.equal(popup.closed, true); assert.equal(location.hash, ''); delivered.push(value); });
  const handoff = prepare(why => failures.push(why));
  const tick = ms => { const found = [...timers].find(([, t]) => t.ms === ms); assert.ok(found, `timer ${ms}`); timers.delete(found[0]); found[1].fn(); };
  return { popup, handoff, navigation, delivered, failures, listeners, timers, tick,
    land: url => { blockedLocation = false; location = new URL(url, origin); }, foreign: () => { blockedLocation = true; },
    runCallback: query => { blockedLocation = false; let text = ''; const history = popup.history; location = new URL(callback + query, origin);
      vm.runInNewContext(script, { URLSearchParams, encodeURIComponent, location, history, window: popup,
        document: { getElementById: () => ({ set textContent(s) { text = s; } }) } }); return { text, url: location.href }; },
  };
}

test('owned popup disowns opener before provider; callback is cleared/closed before delivery once', () => {
  const f = fixture(); assert.equal(f.popup.opener, null);
  assert.equal(f.handoff.navigate(auth), true); f.foreign(); f.tick(200); assert.deepEqual(f.delivered, []);
  const r = f.runCallback('?state=te_synthetic_state&code=synthetic'); assert.equal(r.url, origin + callback + fragment);
  f.tick(200); assert.deepEqual(f.delivered, [fragment]); assert.equal(f.timers.size, 0); assert.equal(f.listeners.size, 0);
  assert.equal(f.handoff.navigate(auth), false); f.handoff.close(); assert.deepEqual(f.failures, []);
});

for (const url of ['https://foreign.example/oauth-callback.html' + fragment, origin + '/other' + fragment,
  origin + callback + '?query=not-cleared' + fragment, origin + callback, origin + callback + '#r=shell.root'])
  test('non-callback location never delivered: ' + url, () => {
    const f = fixture(); f.handoff.navigate(auth); f.land(url); f.tick(200);
    assert.deepEqual(f.delivered, []); f.handoff.close(); assert.equal(f.timers.size, 0);
  });

test('blocked window returns null without a timer; close/pagehide/deadline cancel without delivery', () => {
  const blocked = fixture(true); assert.equal(blocked.handoff, null); assert.equal(blocked.timers.size, 0);
  for (const mode of ['closed', 'pagehide', 'expiry']) {
    const f = fixture(); f.handoff.navigate(auth);
    if (mode === 'closed') { f.popup.closed = true; f.tick(200); }
    if (mode === 'pagehide') f.listeners.get('pagehide')();
    if (mode === 'expiry') f.tick(600000);
    assert.deepEqual(f.delivered, []); assert.deepEqual(f.failures, [mode === 'expiry' ? 'expired' : 'closed']);
    assert.equal(f.timers.size, 0); assert.equal(f.listeners.size, 0);
  }
});

for (const bad of ['https://evil.example/auth', 'https://oauth.telegram.org.evil.example/auth', 'javascript:alert(1)',
  'http://oauth.telegram.org/auth', 'https://user:pass@oauth.telegram.org/auth', auth + '#foreign', 'https://oauth.telegram.org/other'])
  test('provider substitution refused: ' + bad, () => {
    const f = fixture(); assert.equal(f.handoff.navigate(bad), false); assert.deepEqual(f.navigation, []); f.handoff.close();
  });

for (const query of ['?state=te_synthetic_state&state=te_other_state&code=x', '?state=te_synthetic_state&code=x&code=y',
  '?state=te_synthetic_state&code=x&error=denied', '?state=te_synthetic_state', '?state=ya_synthetic_state&code=x',
  '?state=te_synthetic_state&code=' + 'x'.repeat(4100)])
  test('callback malformed query erased and never forwarded: ' + query.slice(0, 80), () => {
    const f = fixture(); const r = f.runCallback(query); assert.equal(r.url, origin + callback);
    assert.match(r.text, /не распознана/); assert.deepEqual(f.delivered, []); f.handoff.close();
  });

test('decline is carried, but the callback page alone never installs a session or navigates to the app', () => {
  const f = fixture(); const r = f.runCallback('?state=te_synthetic_state&error=access_denied');
  assert.equal(r.url, origin + callback + '#oauth=telegram&state=te_synthetic_state&error=access_denied');
  assert.deepEqual(f.navigation, []); assert.deepEqual(f.delivered, []); f.handoff.close();
});
