// Pure current-carrier rendering: synthetic port, no browser/runtime/network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import esbuild from 'esbuild';
import { findAll, parse, textOf } from './html.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const scratch = fs.mkdtempSync(path.join(here, '.onboarding-'));
let m;
try {
  const bundle = path.join(scratch, 'presentation.mjs');
  await esbuild.build({ stdin: { contents: `export { StandardOnboarding, OnboardingComplete, PasswordSignIn, onboardingSentence } from '../src/signin/StandardOnboarding.tsx'; export { tokens } from '../src/identity/tokens.ts'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';`, resolveDir: here, loader: 'tsx' }, bundle: true, format: 'esm', platform: 'node', target: 'node22', jsx: 'automatic', outfile: bundle, logLevel: 'warning', external: ['react', 'react-dom/server', 'react/jsx-runtime'] });
  m = await import(pathToFileURL(bundle).href);
} finally { fs.rmSync(scratch, { recursive: true, force: true }); }
const idle = { phase: 'idle', busy: false, failure: null, display: null, trialDays: null, trialEndsAt: null };
function panel(view = idle) {
  const calls = [];
  const port = { view: () => view, subscribe: () => () => {}, submit: () => calls.push('submit'), cancel: () => calls.push('cancel') };
  const html = m.renderToStaticMarkup(m.createElement(m.StandardOnboarding, { port, t: m.tokens(true), back: () => calls.push('back') }));
  const root = parse(html);
  return { calls, root, text: textOf(root), buttons: findAll(root, el => el.tag === 'button'), inputs: findAll(root, el => el.tag === 'input') };
}
test('new business form requires explicit consent and chosen password; render makes zero requests', () => {
  const p = panel();
  assert.equal(p.inputs.length, 6); assert.deepEqual(p.calls, []);
  assert.ok(p.inputs.some(el => el.attrs.type === 'password' && el.attrs.autocomplete === 'new-password'));
  assert.ok(p.buttons.some(el => el.attrs.role === 'checkbox' && el.attrs['aria-checked'] === 'false'));
  assert.ok('disabled' in p.buttons.find(el => textOf(el) === 'Создать бизнес').attrs);
  assert.match(p.text, /CRM подключается отдельно/);
  assert.match(p.text, /без пробелов по краям/);
  assert.match(p.text, /Сохраните выбранный адрес бизнеса/);
});
test('ambiguous signup removes creation/confirmation affordances and offers only password recovery', () => {
  const p = panel({ ...idle, phase: 'uncertain', failure: { reason: 'uncertain' } });
  assert.deepEqual(p.buttons.map(textOf), ['Перейти ко входу по паролю']);
  assert.ok(p.inputs.every(el => 'disabled' in el.attrs));
  assert.match(p.text, /ответ мог потеряться после сохранения/);
  assert.match(p.text, /Не создавайте бизнес повторно/);
  assert.deepEqual(p.calls, []);
});
test('pending creation freezes fields/consent but preserves explicit cancel', () => {
  const p = panel({ ...idle, phase: 'creating', busy: true });
  assert.ok(p.inputs.every(el => 'disabled' in el.attrs));
  assert.match(p.text, /Создаём бизнес/);
  const cancel = p.buttons.find(el => textOf(el) === 'Отменить и вернуться ко входу');
  assert.ok(cancel); assert.equal('disabled' in cancel.attrs, false); assert.deepEqual(p.calls, []);
});
test('only completed renders server-qualified success and never claims CRM/features enabled', () => {
  let calls = 0;
  for (const phase of ['idle', 'failed', 'uncertain', 'creating']) assert.equal(m.OnboardingComplete({ view: { ...idle, phase }, t: m.tokens(true), finish() { calls++; } }), null);
  const tree = m.OnboardingComplete({ view: { ...idle, phase: 'completed', display: { tenantName: 'Бизнес <safe>', userName: '' }, trialDays: 10 }, t: m.tokens(true), finish() { calls++; } });
  const html = m.renderToStaticMarkup(tree), root = parse(html);
  assert.match(html, /Бизнес &lt;safe&gt;/);
  assert.match(textOf(root), /CRM ещё нужно подключить/);
  assert.match(textOf(root), /Доступ к функциям и действиям определяет сервер/);
  assert.doesNotMatch(textOf(root), /widgets.runtime|все функции|CRM подключена/);
  assert.deepEqual(findAll(root, el => el.tag === 'button').map(textOf), ['Продолжить']); assert.equal(calls, 0);
});
test('normal password login is reachable without email OTP and has no secret value in markup', () => {
  let calls = 0;
  const root = parse(m.renderToStaticMarkup(m.createElement(m.PasswordSignIn, { t: m.tokens(false), initialSlug: 'my-business', initialEmail: 'owner@example.invalid', signIn() { calls++; }, back() {} })));
  assert.equal(calls, 0);
  const inputs = findAll(root, el => el.tag === 'input');
  assert.equal(inputs.find(el => el.attrs['aria-label'] === 'Адрес бизнеса').attrs.value, 'my-business');
  assert.equal(inputs.find(el => el.attrs.type === 'password').attrs.value, undefined);
  assert.equal(inputs.find(el => el.attrs.type === 'password').attrs.autocomplete, 'current-password');
  assert.deepEqual(findAll(root, el => el.tag === 'button').map(textOf), ['Войти', 'Другие способы входа']);
});
test('finite failures never display raw server errors or turn refusal into success', () => {
  for (const reason of ['closed', 'unavailable', 'expired', 'uncertain', 'rate_limited']) {
    const sentence = m.onboardingSentence({ reason, retryAfterSec: 20, raw: 'PRIVATE' });
    assert.equal(typeof sentence, 'string'); assert.doesNotMatch(sentence, /PRIVATE|Бизнес создан/);
  }
  assert.match(m.onboardingSentence({ reason: 'invalid', field: 'password' }), /не менее 8 символов/);
});
