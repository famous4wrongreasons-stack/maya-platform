// Pure React presentation checks. No browser, live runtime, transport or session.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import esbuild from 'esbuild';
import { findAll, parse, textOf } from './html.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const scratch = fs.mkdtempSync(path.join(here, '.privacy-'));
let m;
try {
  const bundle = path.join(scratch, 'presentation.mjs');
  await esbuild.build({
    stdin: {
      contents: `export { PrivacyPanel } from '../src/chat/PrivacyPanel.tsx';
        export { tokens } from '../src/identity/tokens.ts';
        export { composerReason } from '../src/runtime/copy.ts';
        export { renderToStaticMarkup } from 'react-dom/server';`,
      resolveDir: here,
      loader: 'tsx',
    },
    bundle: true, format: 'esm', platform: 'node', target: 'node22', jsx: 'automatic',
    outfile: bundle, logLevel: 'warning',
    external: ['react', 'react-dom/server', 'react/jsx-runtime'],
  });
  m = await import(pathToFileURL(bundle).href);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}

const panel = (phase, extra = {}) => {
  const calls = [];
  const handlers = Object.fromEntries(['requestConfirmation', 'cancelConfirmation', 'confirmErasure', 'retry', 'signOut', 'close']
    .map(name => [name, (...args) => calls.push({ name, args })]));
  const tree = m.PrivacyPanel({
    view: { phase, available: ['idle', 'confirming'].includes(phase), localEpoch: 0, failure: null, erasedAt: null, ...extra },
    t: m.tokens(true), ...handlers,
  });
  const root = parse(m.renderToStaticMarkup(tree));
  const controls = findAll(root, el => el.tag === 'button');
  const buttons = [];
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (node.type === 'button') buttons.push(node);
    visit(node.props?.children);
  };
  visit(tree);
  return {
    calls, root, controls, text: textOf(root),
    labels: controls.map(textOf),
    press(label) {
      const button = buttons.find(el => el.props.children === label);
      assert.ok(button, label);
      assert.notEqual(button.props.disabled, true, 'Must be a usable control');
      button.props.onClick({ untrustedTarget: 'must-not-be-forwarded' });
    },
  };
};

test('privacy limits deletion to the current conversation and retains audit/business records', () => {
  const p = panel('idle');
  assert.match(p.text, /текущего разговора: сообщения, карточки и черновики/);
  assert.match(p.text, /Другие разговоры не затрагиваются/);
  assert.match(p.text, /журнал аудита и деловые записи, включая бронирования и платежи, сохраняются/);
  assert.deepEqual(p.labels, ['Удалить текущий разговор', 'Назад к разговору']);
  assert.deepEqual(p.calls, [], 'Rendering never initiates erasure');
  p.press('Удалить текущий разговор');
  assert.deepEqual(p.calls, [{ name: 'requestConfirmation', args: [] }]);
});

test('privacy requires a distinct explicit confirmation, carrying no target or event arguments', () => {
  const p = panel('confirming');
  assert.match(p.text, /Это действие нельзя отменить/);
  assert.deepEqual(p.labels, ['Подтвердить удаление', 'Отмена', 'Назад к разговору']);
  assert.deepEqual(p.calls, []);
  p.press('Подтвердить удаление'); p.press('Отмена');
  assert.deepEqual(p.calls, [{ name: 'confirmErasure', args: [] }, { name: 'cancelConfirmation', args: [] }]);
  for (const phase of ['idle', 'confirming']) {
    const locked = panel(phase, { available: false });
    assert.ok('disabled' in locked.controls[0].attrs);
  }
});

test('uncertain permits only manual same-request retry even when no new target is available', () => {
  const p = panel('uncertain', { available: false });
  assert.match(p.text, /Удаление пока не подтверждено\. Повторите тот же запрос вручную/);
  assert.deepEqual(p.labels, ['Повторить запрос', 'Назад к разговору']);
  assert.deepEqual(p.calls, [], 'No automatic retry during render');
  p.press('Повторить запрос');
  assert.deepEqual(p.calls, [{ name: 'retry', args: [] }]);
});

test('refusal never offers a new deletion or retry, and gives a sign-out exit', () => {
  for (const failure of ['forbidden', 'unavailable', 'conflict', 'invalid_request', 'signed_out', null]) {
    const p = panel('refused', { failure });
    assert.match(p.text, /Удаление не подтверждено/);
    assert.deepEqual(p.labels, ['Выйти', 'Назад к разговору']);
    p.press('Выйти');
    assert.deepEqual(p.calls, [{ name: 'signOut', args: [] }]);
  }
});

test('only canonical completed declares deletion; every phase has an accessible status and no sinks', () => {
  for (const phase of ['idle', 'confirming', 'erasing', 'uncertain', 'refused', 'completed']) {
    const p = panel(phase, { erasedAt: '2026-10-07T10:00:00Z' });
    assert.equal(p.text.includes('Текущий разговор удалён.'), phase === 'completed');
    assert.equal(findAll(p.root, el => el.attrs.role === 'status').length, 1);
    assert.equal(findAll(p.root, el => ['href', 'src', 'action'].some(key => key in el.attrs)).length, 0);
    if (phase === 'erasing' || phase === 'completed') assert.deepEqual(p.labels, ['Назад к разговору']);
  }
  assert.equal(m.composerReason('history_erasure'), 'Разговор заблокирован до подтверждения удаления');
});
