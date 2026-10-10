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
  await esbuild.build({ stdin: { contents: `export { StandardOnboarding, OnboardingComplete, PasswordSignIn, onboardingSentence } from '../src/signin/StandardOnboarding.tsx'; export { timezoneChoices, deviceTimezoneChoice } from '../src/signin/onboardingTimezones.ts'; export { suggestBusinessSlug } from '../src/signin/onboardingSlug.ts'; export { tokens } from '../src/identity/tokens.ts'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';`, resolveDir: here, loader: 'tsx' }, bundle: true, format: 'esm', platform: 'node', target: 'node22', jsx: 'automatic', outfile: bundle, logLevel: 'warning', external: ['react', 'react-dom/server', 'react/jsx-runtime'] });
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
  const consent = p.inputs.find(el => el.attrs.type === 'checkbox');
  assert.ok(consent); assert.equal('checked' in consent.attrs, false);
  const select = findAll(p.root, el => el.tag === 'select');
  assert.equal(select.length, 1);
  assert.equal(findAll(select[0], el => el.tag === 'option' && 'selected' in el.attrs)[0].attrs.value, '');
  assert.match(p.text, /Чтобы включить кнопку/);
  assert.ok('disabled' in p.buttons.find(el => textOf(el) === 'Создать бизнес').attrs);
  assert.match(p.text, /CRM подключается отдельно/);
  assert.match(p.text, /без пробелов по краям/);
  assert.match(p.text, /Это имя для входа, не адрес улицы/);
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
  assert.equal(inputs.find(el => el.attrs['aria-label'] === 'Короткое имя бизнеса для входа').attrs.value, 'my-business');
  assert.equal(inputs.find(el => el.attrs.type === 'password').attrs.value, undefined);
  assert.equal(inputs.find(el => el.attrs.type === 'password').attrs.autocomplete, 'current-password');
  assert.deepEqual(findAll(root, el => el.tag === 'button').map(textOf), ['Войти', 'Другие способы входа']);
});
test('finite failures never display raw server errors or turn refusal into success', () => {
  for (const reason of ['closed', 'unavailable', 'expired', 'uncertain', 'rate_limited']) {
    const sentence = m.onboardingSentence({ reason, retryAfterSec: 20, raw: 'PRIVATE' });
    assert.equal(typeof sentence, 'string'); assert.doesNotMatch(sentence, /PRIVATE|Бизнес создан/);
  }
  assert.match(m.onboardingSentence({ reason: 'invalid', field: 'password' }), /не менее 8/);
});
test('inline errors identify the field, connect accessible help, and keep server text out', () => {
  for (const field of ['name', 'slug', 'ownerEmail', 'password', 'branchName', 'branchTimezone']) {
    const p = panel({ ...idle, phase: 'failed', failure: { reason: 'invalid', field, raw: 'PRIVATE' } });
    const control = findAll(p.root, el => ['input', 'select'].includes(el.tag) && el.attrs.name === field)[0];
    assert.equal(control.attrs['aria-invalid'], 'true');
    const ids = control.attrs['aria-describedby'].split(' ');
    assert.ok(ids.some(id => findAll(p.root, el => el.attrs.id === id && textOf(el).length > 0).length === 1));
    assert.doesNotMatch(p.text, /PRIVATE/); assert.deepEqual(p.calls, []);
  }
});
test('slug suggestions transliterate and remain valid and bounded without claiming availability', () => {
  assert.equal(m.suggestBusinessSlug('Мужская Эстетика'), 'muzhskaya-estetika');
  assert.equal(m.suggestBusinessSlug('  Café — Studio 42! '), 'cafe-studio-42');
  assert.equal(m.suggestBusinessSlug('東京'), '');
  for (const name of ['Ёж и Йога', 'a'.repeat(105), 'a'.repeat(99) + ' studio']) {
    const value = m.suggestBusinessSlug(name);
    assert.match(value, /^[a-z0-9]+(?:-[a-z0-9]+)*$/); assert.ok(value.length <= 100);
  }
});
test('timezone choices use valid IANA, current offset, broad coverage and explicit device choice', () => {
  const winter = new Date('2026-01-15T12:00:00Z'), summer = new Date('2026-07-15T12:00:00Z');
  const choices = m.timezoneChoices(winter);
  assert.ok(choices.length > 300);
  assert.equal(new Set(choices.map(x => x.value)).size, choices.length);
  assert.equal(choices.find(x => x.value === 'Europe/Moscow').label, 'Москва, Ставрополь — UTC+3');
  assert.match(choices.find(x => x.value === 'America/New_York').label, /UTC-5$/);
  assert.match(m.timezoneChoices(summer).find(x => x.value === 'America/New_York').label, /UTC-4$/);
  for (const c of choices) assert.doesNotThrow(() => new Intl.DateTimeFormat('en', { timeZone: c.value }));
  assert.equal(m.deviceTimezoneChoice(choices, 'Not/AZone'), null);
  assert.equal(m.deviceTimezoneChoice(choices, 'Europe/Moscow').value, 'Europe/Moscow');
  assert.deepEqual(m.timezoneChoices(winter, ['Not/AZone']).map(x => x.value), ['UTC']);
});
