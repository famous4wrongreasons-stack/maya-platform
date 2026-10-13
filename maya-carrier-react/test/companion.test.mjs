import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARTWORK, artworkUrls, designStyles } from '../tools/design-assets.mjs';
import { checkCss, scanJsx, scanNames } from '../tools/ratchets.mjs';
import { companionContext, MayaCompanion, companionTokens, companionMarkup, markupOf, resultOf } from './.bundle.mjs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const view = { items: [], inFlight: false, dropped: 0, composer: { enabled: true } };
const voice = { state: 'idle', elapsedMs: 0, level: 0, unavailable: null, notice: null };

test('finite artwork admission accepts selected bytes and refuses every unrelated resource', () => {
  assert.equal(ARTWORK.length, 2);
  const css = designStyles('.a {color:red}');
  assert.deepEqual(checkCss('styles.css', css), []);
  for (const url of ['https://evil.invalid/pixel', '//evil.invalid/x', './unverified.png', 'data:image/png;base64,AA==',
    'data:image/svg+xml;base64,AA==', '/api/customer', 'var(--caller)']) {
    assert.ok(checkCss('styles.css', css + '.x {background:url("' + url + '")}').length, url);
  }
  assert.ok(checkCss('styles.css', css.replace('iVBORw0KGgo', 'jVBORw0KGgo')).length);
});
test('modified, missing and symlink artwork are refused before packaging', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-artwork-proof-'));
  try {
    const dir = path.join(temp, 'brand/companion-v1');
    fs.mkdirSync(dir, { recursive: true });
    for (const a of ARTWORK) fs.copyFileSync(path.join(root, 'brand/companion-v1', a.file), path.join(dir, a.file));
    assert.equal(artworkUrls(temp).length, 2);
    const target = path.join(dir, ARTWORK[0].file);
    fs.appendFileSync(target, 'unapproved');
    assert.throws(() => artworkUrls(temp), /bytes changed/);
    fs.unlinkSync(target);
    assert.throws(() => artworkUrls(temp));
    fs.symlinkSync(path.join(root, 'brand/companion-v1', ARTWORK[0].file), target);
    assert.throws(() => artworkUrls(temp), /regular file/);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
test('seven decorative poses preserve closed tags; no prototype executable or sinks', () => {
  for (const state of ['idle','greeting','attentive','thinking','reply','success','error']) {
    const html = renderToStaticMarkup(createElement(MayaCompanion, { state }));
    assert.ok(html.includes('data-state="' + state + '"'));
    assert.ok(html.includes('aria-hidden="true"'));
    assert.ok(!/<(?:img|svg|iframe|script|maya-robot)\b|\ssrc=/.test(html));
  }
  const source = fs.readFileSync(path.join(root, 'src/identity/MayaCompanion.tsx'), 'utf8');
  assert.deepEqual(scanNames('src/identity/MayaCompanion.tsx', source), []);
  assert.deepEqual(scanJsx('src/identity/MayaCompanion.tsx', source), []);
});
test('actual state adapter never derives business success from text or queued/sent turn', () => {
  assert.equal(companionContext(view, '', voice), 'idle');
  assert.equal(companionContext(view, 'Здравствуйте', voice), 'attentive');
  assert.equal(companionContext({ ...view, inFlight: true }, '', voice), 'thinking');
  for (const state of ['arming','listening','held','recording']) assert.equal(companionContext(view, '', { ...voice, state }), 'attentive');
  assert.equal(companionContext(view, '', { ...voice, state: 'transcribing' }), 'thinking');
  for (const text of ['Успешно', 'Запись создана', '<img src=x>', 'success']) {
    assert.equal(companionContext({ ...view, items: [{ kind:'assistant', id:'a', text }] }, '', voice), 'idle');
  }
  for (const state of ['sending','sent']) assert.notEqual(companionContext({ ...view, items:[{kind:'user',id:'u',state}] }, '', voice), 'success');
  assert.equal(companionContext({ ...view, items:[{kind:'user',id:'u',state:'failed'}] }, '', voice), 'error');
});
test('new shared theme has no role/authority fields or invented dark variant', () => {
  assert.deepEqual(companionTokens(), { name:'companion',dark:false,bg:'#FFFFFF',ink:'#191A1B',accent:'#0068ED',accentOn:'#FFFFFF' });
});

test('all 40 sealed widget fixtures keep identical non-style markup under the new theme', () => {
  const fixtures = path.join(root, '../maya-chat-shell/dev/fixtures/envelopes');
  const index = JSON.parse(fs.readFileSync(path.join(fixtures, 'index.json')));
  assert.equal(index.fixtures.length, 40);
  for (const fixture of index.fixtures) {
    const result = resultOf(JSON.parse(fs.readFileSync(path.join(fixtures, fixture.file))), index.now);
    const item = { id:'w-'+fixture.id, result, display:'live', pending:null, sentence:null };
    const semantics = html => html.replace(/ style="[^"]*"/g, '');
    assert.equal(semantics(companionMarkup(item)), semantics(markupOf(item)), fixture.id);
  }
});
