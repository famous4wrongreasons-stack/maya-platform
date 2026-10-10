// Current components, synthetic port snapshots and SSR. No runtime/session/network startup.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import esbuild from 'esbuild';
import { findAll, parse, textOf } from './html.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const scratch = fs.mkdtempSync(path.join(here, '.local-setup-'));
let m;
try {
  const bundle = path.join(scratch, 'presentation.mjs');
  await esbuild.build({
    stdin: { contents: `export { SignIn } from '../src/signin/SignIn.tsx'; export { LocalCrmSetup } from '../src/setup/LocalCrmSetup.tsx'; export { fixture, localCrmSetup } from './local-setup-ui.runtime.mjs'; export { tokens } from '../src/identity/tokens.ts'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';`, resolveDir: here, loader: 'tsx' },
    bundle: true, format: 'esm', platform: 'node', target: 'node22', jsx: 'automatic', outfile: bundle, logLevel: 'warning',
    external: ['react', 'react-dom/server', 'react/jsx-runtime'],
    plugins: [{ name: 'finite-synthetic-ports', setup(build) {
      build.onResolve({ filter: /\/runtime\/compose\.ts$/ }, () => ({ path: path.join(here, 'local-setup-ui.runtime.mjs') }));
      // SSR cannot subscribe; only the port's exact current snapshot is rendered here.
      build.onResolve({ filter: /\/runtime\/useView\.ts$/ }, () => ({ path: 'snapshot', namespace: 'ssr-snapshot' }));
      build.onLoad({ filter: /^snapshot$/, namespace: 'ssr-snapshot' }, () => ({ contents: 'export const usePortView = port => port.view();', loader: 'js' }));
    } }],
  });
  m = await import(pathToFileURL(bundle).href);
} finally { fs.rmSync(scratch, { recursive: true, force: true }); }

const render = (Component, props) => {
  const root = parse(m.renderToStaticMarkup(m.createElement(Component, { t: m.tokens(false), ...props })));
  return { root, text: textOf(root), buttons: findAll(root, el => el.tag === 'button'), inputs: findAll(root, el => el.tag === 'input') };
};
test('explicit local entry immediately exposes password login, no unsupported finder or auth call', () => {
  m.fixture.reset();
  const p = render(m.SignIn, { localSetup: true });
  assert.match(p.text, /Вход по паролю/);
  assert.deepEqual(p.inputs.map(el => el.attrs['aria-label']), ['Короткое имя бизнеса для входа', 'Email', 'Пароль']);
  assert.deepEqual(p.buttons.map(textOf), ['Войти', 'Создать бизнес']);
  assert.equal(p.inputs.find(el => el.attrs.type === 'password').attrs.value, undefined);
  assert.doesNotMatch(p.text, /Найти салон|через Telegram|Получить код|Другие способы входа/);
  assert.deepEqual(m.fixture.calls, []);
});
test('ordinary signed-out entry keeps the existing finder and manual alternate login choices', () => {
  for (const props of [{}, { localSetup: false }]) {
    m.fixture.reset(); const p = render(m.SignIn, props);
    assert.match(p.text, /Найдите свой салон/);
    for (const name of ['Найти салон', 'Войти по паролю', 'Создать бизнес']) assert.ok(p.buttons.some(el => textOf(el) === name), name);
    assert.equal(p.inputs.some(el => el.attrs.type === 'password'), false);
    assert.deepEqual(m.fixture.calls, []);
  }
});
test('remount of local signed-out presentation still starts password without an auth request', () => {
  m.fixture.reset(); render(m.SignIn, { localSetup: true });
  const p = render(m.SignIn, { localSetup: true, reason: 'signed_out' });
  assert.deepEqual(p.buttons.map(textOf), ['Войти', 'Создать бизнес']);
  assert.deepEqual(m.fixture.calls, []);
});
test('idle setup makes explicit branch loading discoverable without claiming no branches or requesting them', () => {
  m.fixture.reset(); const p = render(m.LocalCrmSetup, { onClose() {} });
  const load = p.buttons.find(el => textOf(el) === 'Загрузить филиалы');
  assert.ok(load); assert.equal('disabled' in load.attrs, false);
  assert.match(p.text, /Филиалы пока не загружены/);
  assert.match(p.text, /затем выберите филиал MAYA/);
  assert.match(p.text, /Сначала загрузите филиалы/);
  assert.doesNotMatch(p.text, /Доступных филиалов нет/);
  for (const name of ['Проверить и сохранить подключение', 'Активировать и импортировать']) assert.ok('disabled' in p.buttons.find(el => textOf(el) === name).attrs);
  assert.deepEqual(m.fixture.calls, []);
});
test('loading is disabled; ready lists only returned branches and never grants write consent', () => {
  m.fixture.reset(); const idle = m.localCrmSetup.view();
  m.fixture.setSetup({ ...idle, phase: 'loading', busy: true });
  let p = render(m.LocalCrmSetup, { onClose() {} });
  assert.ok('disabled' in p.buttons.find(el => textOf(el) === 'Загружаем филиалы и подключение…').attrs);
  m.fixture.setSetup({ ...idle, phase: 'ready', canStage: true, branches: [{ id: 'synthetic-branch', name: 'Тестовый филиал', timezone: 'Europe/Moscow' }] });
  p = render(m.LocalCrmSetup, { onClose() {} });
  assert.ok(p.buttons.some(el => textOf(el) === 'Тестовый филиал · Europe/Moscow'));
  assert.ok(p.buttons.some(el => textOf(el) === 'Проверить подключение и результат'));
  const stage = p.buttons.find(el => textOf(el) === 'Проверить и сохранить подключение');
  assert.ok(stage.attrs['aria-describedby']);
  assert.match(textOf(findAll(p.root, el => el.attrs.id === stage.attrs['aria-describedby'])[0]), /Введите пользовательский API-токен/);
  for (const name of ['Проверить и сохранить подключение', 'Активировать и импортировать']) assert.ok('disabled' in p.buttons.find(el => textOf(el) === name).attrs);
  assert.deepEqual(m.fixture.calls, []);
});
test('empty or refused branch read stays qualified; it cannot enable stage or activation', () => {
  m.fixture.reset(); const idle = m.localCrmSetup.view();
  for (const phase of ['ready', 'blocked']) {
    m.fixture.setSetup({ ...idle, phase, notice: phase === 'blocked' ? 'Доступ к настройке подключения не подтверждён.' : '' });
    const p = render(m.LocalCrmSetup, { onClose() {} });
    if (phase === 'ready') assert.match(p.text, /Доступных филиалов нет/);
    else assert.match(p.text, /Доступ к настройке подключения не подтверждён/);
    assert.equal(p.buttons.some(el => 'aria-pressed' in el.attrs), false);
    for (const name of ['Проверить и сохранить подключение', 'Активировать и импортировать']) assert.ok('disabled' in p.buttons.find(el => textOf(el) === name).attrs);
  }
  assert.deepEqual(m.fixture.calls, []);
});

const activationControls = p => {
  const section = findAll(p.root, el => el.tag === 'section' && el.attrs['aria-label'] === 'Активация подключения')[0];
  const controls = findAll(section, el => el.tag === 'button');
  assert.equal(controls.length, 2);
  return controls;
};
const disabledActivationHelp = p => {
  const [consent, action] = activationControls(p);
  assert.ok('disabled' in consent.attrs);
  assert.ok('disabled' in action.attrs);
  assert.equal(consent.attrs['aria-checked'], 'false');
  assert.ok(consent.attrs['aria-describedby']);
  assert.equal(action.attrs['aria-describedby'], consent.attrs['aria-describedby']);
  const help = findAll(p.root, el => el.attrs.id === consent.attrs['aria-describedby']);
  assert.equal(help.length, 1);
  return textOf(help[0]);
};
const savedConnection = { id: 'synthetic-integration', tenantId: 'synthetic-tenant', provider: 'yclients', status: 'pending_activation', hasCredentials: true, companyId: '123', branchId: 'synthetic-branch', configVersion: 'a'.repeat(64) };

test('unsaved connection and pending install explain both disabled activation controls without retry instructions', () => {
  m.fixture.reset(); const idle = m.localCrmSetup.view();
  const states = [{ ...idle, phase: 'ready', canStage: true }];
  for (const status of ['NOT_OBSERVED', 'READY', 'UNAVAILABLE']) states.push({
    ...idle, phase: 'uncertain', connection: status === 'READY' ? savedConnection : null,
    operation: { operation: 'install', requestId: '11111111-1111-4111-8111-111111111111', status, phase: status === 'READY' ? 'install' : null, receipt: null, current: { configVersion: null, matchesCurrentVersion: false } },
    resuming: status !== 'UNAVAILABLE', canStage: status !== 'UNAVAILABLE',
  });
  for (const state of states) {
    m.fixture.setSetup(state);
    const help = disabledActivationHelp(render(m.LocalCrmSetup, { onClose() {} }));
    assert.equal(help, 'Сначала должно завершиться сохранение подключения в шаге 1. Сейчас оно не подтверждено, поэтому активация и импорт недоступны.');
    assert.doesNotMatch(help, /Введите|токен|повтор|сохранено|успешно/);
  }
  assert.deepEqual(m.fixture.calls, []);
});

test('idle, busy and blocked activation help stays qualified to the displayed state', () => {
  m.fixture.reset(); const idle = m.localCrmSetup.view();
  for (const [state, expected] of [
    [idle, 'Сначала загрузите филиалы и проверьте текущее подключение.'],
    [{ ...idle, phase: 'loading', busy: true }, 'Дождитесь завершения текущего запроса.'],
    [{ ...idle, phase: 'activating', busy: true, connection: savedConnection }, 'Дождитесь завершения текущего запроса.'],
    [{ ...idle, phase: 'blocked', connection: savedConnection }, 'Активация и импорт сейчас недоступны. Проверьте подключение и результат.'],
  ]) {
    m.fixture.setSetup(state);
    assert.equal(disabledActivationHelp(render(m.LocalCrmSetup, { onClose() {} })), expected);
  }
  assert.deepEqual(m.fixture.calls, []);
});

test('ready activation removes blocked help but still requires separate unchecked consent', () => {
  m.fixture.reset();
  m.fixture.setSetup({ ...m.localCrmSetup.view(), phase: 'ready', connection: savedConnection, canActivate: true });
  const p = render(m.LocalCrmSetup, { onClose() {} });
  const [consent, action] = activationControls(p);
  assert.equal('disabled' in consent.attrs, false);
  assert.equal(consent.attrs['aria-checked'], 'false');
  assert.ok('disabled' in action.attrs);
  assert.equal(consent.attrs['aria-describedby'], undefined);
  assert.equal(action.attrs['aria-describedby'], undefined);
  assert.doesNotMatch(p.text, /Сначала должно завершиться сохранение|Активация и импорт сейчас недоступны/);
  assert.deepEqual(m.fixture.calls, []);
});
