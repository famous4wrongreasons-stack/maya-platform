// The fullscreen detail sheet, against sealed results.
//
//   node --test test/detail.test.mjs
//
// The dialog's own behaviour — showModal, the Esc→closeDetail redirection, the Tab trap and focus
// return — is exercised in a browser by dev/detail.tsx; what is checked here is everything that is
// true of the markup before any of that runs.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { findAll, parse, textOf } from './html.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(HERE, '..', '..', 'maya-chat-shell', 'dev', 'fixtures', 'envelopes');
const INDEX = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'index.json'), 'utf8'));
const M = await import(pathToFileURL(path.join(HERE, '.bundle.mjs')).href);

const resultOf = (id) => {
  const f = INDEX.fixtures.find((x) => x.id === id);
  assert.ok(f, `fixture ${id}`);
  return M.resultOf(JSON.parse(fs.readFileSync(path.join(FIXTURES, f.file), 'utf8')), INDEX.now);
};

const read = (markup) => {
  const root = parse(markup);
  const dialog = findAll(root, (el) => el.tag === 'dialog')[0] ?? null;
  const title = findAll(root, (el) => (el.attrs.class ?? '').includes('fullscreen-title'))[0] ?? null;
  return {
    dialog,
    title,
    titleText: title === null ? null : textOf(title),
    close: findAll(root, (el) => (el.attrs.class ?? '').includes('fullscreen-close'))[0] ?? null,
    progress: findAll(root, (el) => (el.attrs.class ?? '').includes('fullscreen-progress'))[0] ?? null,
    refs: findAll(root, (el) => 'data-ref' in el.attrs).map((el) => el.attrs['data-ref']),
    sinks: findAll(root, (el) => 'href' in el.attrs || 'src' in el.attrs),
    open: !('open' in (dialog?.attrs ?? {})),
  };
};

test('closed: the dialog exists, is never marked open, and offers nothing', () => {
  const facts = read(M.detailMarkup(null));
  assert.ok(facts.dialog !== null, 'the dialog is always mounted');
  assert.equal(facts.dialog.attrs['aria-modal'], 'true');
  assert.ok(!('open' in facts.dialog.attrs), 'React never writes `open`; showModal does');
  assert.equal(facts.refs.length, 0, 'nothing interactive while closed');
  assert.equal(facts.progress, null);
});

test('progress: «Открываю…» in the title and the body, aria-busy, and no controls yet', () => {
  const facts = read(M.detailMarkup({ phase: 'progress', itemId: 'w1' }));
  assert.equal(facts.dialog.attrs['aria-busy'], 'true');
  assert.equal(facts.titleText, 'Открываю…');
  assert.ok(facts.progress !== null, 'the body says it too, for a reader who is not on the title');
  assert.equal(textOf(facts.progress), 'Открываю…');
  assert.equal(facts.refs.length, 0, 'a card that has not arrived has no controls');
});

test('open: the title is the sealed label, and the card is drawn WHOLE', () => {
  const result = resultOf('kind-report');
  const facts = read(M.detailMarkup({ phase: 'open', itemId: 'w-report', result }));
  assert.ok(!('aria-busy' in facts.dialog.attrs), 'busy is cleared');
  assert.equal(facts.titleText, result.label === '' ? result.textEquivalent.headline : result.label);
  // Whole and live: every sealed ref is reachable, none suppressed, nothing collapsed.
  assert.deepEqual(facts.refs, [...result.readingOrder]);
  assert.equal(facts.sinks.length, 0, 'a detail writes no request sink');
});

test('open: the title falls back to the headline when the sealed label is empty', () => {
  const result = resultOf('kind-metric');
  const blanked = { ...result, label: '' };
  const facts = read(M.detailMarkup({ phase: 'open', itemId: 'w-metric', result: blanked }));
  assert.equal(facts.titleText, result.textEquivalent.headline);
});

test('the dialog is labelled by its own title', () => {
  const facts = read(M.detailMarkup({ phase: 'open', itemId: 'w1', result: resultOf('kind-choice') }));
  assert.ok(facts.title.attrs.id, 'the title has an id');
  assert.equal(facts.dialog.attrs['aria-labelledby'], facts.title.attrs.id);
  assert.equal(facts.title.attrs.tabindex, '-1', 'programmatically focusable, not a tab stop');
});

test('close is a real button, named, and first in the tab ring', () => {
  const result = resultOf('kind-report');
  const markup = M.detailMarkup({ phase: 'open', itemId: 'w1', result });
  const facts = read(markup);
  assert.ok(facts.close !== null);
  assert.equal(facts.close.attrs.type, 'button');
  assert.equal(textOf(facts.close), 'Закрыть окно');
  // The trap rebuilds its ring from `.fullscreen-close, [data-ref]` in DOM order, so close must
  // come before the drawn controls for the wrap-around to land on it.
  assert.ok(markup.indexOf('fullscreen-close') < markup.indexOf('data-ref'), 'close is first');
});

test('every booking kind can be opened as a detail without losing a control', () => {
  for (const id of ['kind-service-selector', 'kind-staff-selector', 'kind-time-slot-selector', 'kind-booking-confirmation']) {
    const result = resultOf(id);
    const facts = read(M.detailMarkup({ phase: 'open', itemId: 'w-' + id, result }));
    assert.deepEqual(facts.refs, [...result.readingOrder], id);
  }
});
