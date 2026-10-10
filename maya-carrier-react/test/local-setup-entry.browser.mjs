// Actual App/SignIn/LocalCrmSetup, finite synthetic ports. Static assets only; no API/PG/provider.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import { Browser } from '../../maya-chat-shell/test/cdp-verify.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const output = process.argv[2];
assert.ok(output && /^\/(?:private\/)?tmp\/maya-local-setup-entry-[a-zA-Z0-9-]+$/.test(output), 'fresh owned output required');
assert.equal(fs.existsSync(output), false); fs.mkdirSync(output, { mode: 0o700 });
const report = { contract: 'maya.local-setup-entry.synthetic-ui/1', status: 'running', actualReactComponents: true,
  syntheticPorts: true, actualBackend: false, providerCalls: 0, ownerData: false, realProviderAcceptance: false, checks: [] };
const built = await esbuild.build({
  stdin: { contents: `import { createRoot } from 'react-dom/client'; import { App } from '../src/App.tsx'; import { fixture } from './local-setup-ui.runtime.mjs'; Object.assign(window, { localSetupFixture: fixture }); createRoot(document.getElementById('root')).render(<App />);`, resolveDir: here, loader: 'tsx' },
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', jsx: 'automatic', write: false, logLevel: 'silent',
  plugins: [{ name: 'finite-synthetic-ports', setup(build) {
    build.onResolve({ filter: /\/runtime\/compose\.ts$/ }, () => ({ path: path.join(here, 'local-setup-ui.runtime.mjs') }));
    // Chat is outside this entry test; no replacement of SignIn, App or setup components.
    build.onResolve({ filter: /\/chat\/ChatScreen\.tsx$/ }, () => ({ path: 'chat-unused', namespace: 'fixture' }));
    build.onLoad({ filter: /^chat-unused$/, namespace: 'fixture' }, () => ({ contents: 'export function ChatScreen() { throw new Error("Unexpected chat entry"); }', loader: 'js' }));
  } }],
});
const bundle = built.outputFiles[0].contents;
report.bundleSha256 = createHash('sha256').update(bundle).digest('hex');
report.sources = Object.fromEntries(['src/App.tsx', 'src/signin/SignIn.tsx', 'src/signin/StandardOnboarding.tsx', 'src/setup/LocalCrmSetup.tsx', 'src/runtime/useView.ts', 'src/styles.css', 'test/local-setup-ui.runtime.mjs', 'test/local-setup-entry.browser.mjs'].map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(here, '..', file))).digest('hex')]));
const html = '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/styles.css"><title>Synthetic local setup entry</title></head><body><div id="root" class="app"></div><script type="module" src="/fixture.js"></script></body></html>';
const assets = new Map([['/', ['text/html; charset=utf-8', html]], ['/fixture.js', ['text/javascript', bundle]], ['/styles.css', ['text/css', fs.readFileSync(path.join(here, '../src/styles.css'))]]]);
let refused = 0, browser, child, childClosed, profile, activePage, closing, deadline;
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  const allowedQuery = !url.search || (url.pathname === '/' && url.search === '?local_crm_setup=1');
  const asset = request.method === 'GET' && allowedQuery ? assets.get(url.pathname) : null;
  if (!asset) { refused++; response.writeHead(403); response.end(); return; }
  response.writeHead(200, { 'Content-Type': asset[0], 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; style-src-attr 'none'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'" }); response.end(asset[1]);
});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const bounded = async (work, ms, label) => { let timer; try { return await Promise.race([work, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label)), ms); })]); } finally { clearTimeout(timer); } };
const button = text => `Array.from(document.querySelectorAll('button')).find(el => el.textContent === ${JSON.stringify(text)})`;
const input = label => `document.querySelector('input[aria-label="${label}"]')`;
const named = name => `document.querySelector('[name="${name}"]')`;
async function check(page, expression, name) { assert.ok(await page.waitFor(expression), name); report.checks.push(name); }
async function click(page, name) { await check(page, `!!${button(name)} && !${button(name)}.disabled`, 'enabled: ' + name); assert.ok(await page.click(button(name))); }
async function fill(page, expression, value) { assert.ok(await page.fill(expression, value)); }
async function capture(page, name) {
  assert.equal(await page.eval('Array.from(document.querySelectorAll("input[type=password]")).every(el => el.value === "")'), true, 'screenshots exclude entered passwords');
  await page.eval('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(data, 'base64'));
}
function cleanup() { return closing ??= (async () => {
  clearTimeout(deadline);
  if (activePage) await bounded(activePage.close(), 2000, 'page close').catch(() => {});
  if (browser) await bounded(browser.close(), 3000, 'browser close').catch(() => {});
  if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  if (childClosed) await bounded(childClosed, 3000, 'child close').catch(() => {});
  if (profile) fs.rmSync(profile, { recursive: true, force: true });
  server.closeAllConnections(); if (server.listening) await new Promise(resolve => server.close(resolve));
})(); }
const stop = () => { void cleanup().finally(() => { process.exitCode = 2; }); };
process.once('SIGINT', stop); process.once('SIGTERM', stop); process.once('disconnect', stop);
try {
  deadline = setTimeout(() => { void cleanup().finally(() => process.exit(2)); }, 180000);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-local-entry-chrome-')); fs.chmodSync(profile, 0o700);
  child = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--js-flags=--max-old-space-size=256', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--metrics-recording-only', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--disable-quic', '--disable-features=OptimizationHints,MediaRouter', 'about:blank'], { env: { PATH: '/usr/bin:/bin', HOME: os.homedir(), TMPDIR: os.tmpdir() }, stdio: 'ignore' });
  childClosed = new Promise(resolve => child.once('close', resolve));
  let failed = false; child.once('error', () => { failed = true; });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !fs.existsSync(portFile) && !failed && child.exitCode === null; i++) await pause(100);
  assert.ok(fs.existsSync(portFile) && !failed, 'owned browser ready');
  const [port, wsPath] = fs.readFileSync(portFile, 'utf8').trim().split('\n');
  browser = new Browser(child, profile, `ws://127.0.0.1:${port}${wsPath}`); await bounded(browser.connect(), 10000, 'CDP connect');
  for (const local of [false, true]) {
    const page = activePage = await browser.newPage();
    let blocked = 0;
    const guard = event => {
      if (event.sessionId !== page.sessionId || event.method !== 'Fetch.requestPaused') return;
      const { requestId, request } = event.params, url = new URL(request.url);
      const allow = request.method === 'GET' && url.origin === origin && assets.has(url.pathname) && (!url.search || (url.pathname === '/' && url.search === '?local_crm_setup=1'));
      if (!allow) blocked++;
      void page.send(allow ? 'Fetch.continueRequest' : 'Fetch.failRequest', { requestId, ...(!allow ? { errorReason: 'BlockedByClient' } : {}) });
    };
    browser.listeners.add(guard);
    await page.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    await page.send('Network.setBypassServiceWorker', { bypass: true });
    await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await page.goto(origin + (local ? '/?local_crm_setup=1' : '/'));
    if (!local) {
      await check(page, `!!${button('Найти салон')} && !!document.querySelector('textarea[aria-label="Название салона"]') && !${input('Пароль')}`, 'ordinary App still opens generic finder');
      await click(page, 'Войти по паролю'); await check(page, `!!${input('Пароль')}`, 'ordinary explicit password route');
      await click(page, 'Другие способы входа'); await check(page, `!!${button('Найти салон')} && window.localSetupFixture.calls.length === 0`, 'ordinary navigation makes no auth request');
    } else {
      await check(page, `!!${input('Пароль')} && !${button('Найти салон')} && !${button('Войти по email')} && window.localSetupFixture.calls.length === 0`, 'local App starts supported password entry with zero calls');
      await capture(page, 'local-password');
      await click(page, 'Создать бизнес'); await check(page, `!!${named('confirmed')} && window.localSetupFixture.calls.length === 0`, 'local signup navigation creates no account');
      await fill(page, named('slug'), 'synthetic-local'); await fill(page, named('ownerEmail'), 'owner@example.invalid');
      await click(page, 'Перейти ко входу по паролю');
      await check(page, `${input('Короткое имя бизнеса для входа')}.value === 'synthetic-local' && ${input('Email')}.value === 'owner@example.invalid' && ${input('Пароль')}.value === '' && window.localSetupFixture.calls.length === 0`, 'signup return preserves public fields only and performs no auth');
      await fill(page, input('Пароль'), 'Synthetic-Only-42'); await click(page, 'Войти');
      await check(page, `!!${button('Загрузить филиалы')} && window.localSetupFixture.passwordInputMatched && JSON.stringify(window.localSetupFixture.calls) === '["password"]'`, 'explicit password login opens idle setup without automatic branch load');
      await check(page, `${button('Проверить и сохранить подключение')}.disabled && ${button('Активировать и импортировать')}.disabled`, 'idle setup has no effect authority');
      await capture(page, 'branches-idle');
      await click(page, 'Загрузить филиалы');
      await check(page, `!!${button('Синтетический филиал · Europe/Moscow')} && JSON.stringify(window.localSetupFixture.calls) === '["password","loadBranches"]'`, 'explicit branch load lists actual synthetic port result once');
      await capture(page, 'branches-loaded');
      await check(page, `document.body.innerText.includes('Введите пользовательский API-токен YCLIENTS, не токен партнёра.')`, 'disabled stage explains missing token');
      await fill(page, input('Пользовательский API-токен YCLIENTS'), 'SYNTHETIC-USER-TOKEN');
      await check(page, `${button('Проверить и сохранить подключение')}.disabled && document.body.innerText.includes('Укажите ID компании YCLIENTS.')`, 'token alone cannot stage; missing company is explained');
      await fill(page, input('ID компании YCLIENTS'), '123');
      await check(page, `${button('Проверить и сохранить подключение')}.disabled && document.body.innerText.includes('Выберите филиал MAYA.')`, 'token and company cannot stage without an explicit branch selection');
      await click(page, 'Синтетический филиал · Europe/Moscow');
      await check(page, `${button('Синтетический филиал · Europe/Moscow')}.getAttribute('aria-pressed') === 'true' && ${button('Проверить и сохранить подключение')}.disabled && ${button('Активировать и импортировать')}.disabled && window.localSetupFixture.calls.length === 2`, 'branch selection performs no call and does not supply consent');
      await check(page, `${button('Проверить и сохранить подключение')}.disabled && document.body.innerText.includes('Подтвердите проверку и сохранение подключения.')`, 'completed fields still require separate stage consent');
      assert.ok(await page.click(`Array.from(document.querySelectorAll('button[role=checkbox]')).find(el => el.textContent.includes('Разрешаю авторизацию и проверку'))`));
      await click(page, 'Проверить и сохранить подключение');
      await check(page, `window.localSetupFixture.stageInputMatched && window.localSetupFixture.tokenClearedBeforeStage && document.body.innerText.includes('Подключение сохранено и ожидает активации.') && JSON.stringify(window.localSetupFixture.calls) === '["password","loadBranches","stage"]'`, 'explicit stage dispatches exact synthetic material and displays pending result');
      await check(page, `${input('Пользовательский API-токен YCLIENTS')}.value === '' && ${button('Активировать и импортировать')}.disabled && Array.from(document.querySelectorAll('button[role=checkbox]')).every(el => el.getAttribute('aria-checked') === 'false')`, 'stage clears token and both consents; activation remains explicit');
      await click(page, 'Войти в YCLIENTS');
      await fill(page, input('Логин YCLIENTS'), 'crm@example.invalid');
      await fill(page, input('Пароль YCLIENTS'), 'Synthetic CRM 42');
      await check(page, `${button('Проверить и сохранить подключение')}.disabled`, 'YCLIENTS login never auto-submits or inherits consent');
      await click(page, 'У меня есть токен пользователя');
      await check(page, `${input('Логин YCLIENTS')}.value === '' && ${input('Пароль YCLIENTS')}.value === ''`, 'mode change clears YCLIENTS login and password');
      await click(page, 'Войти в YCLIENTS');
      await fill(page, input('Логин YCLIENTS'), 'crm@example.invalid');
      await fill(page, input('Пароль YCLIENTS'), 'Synthetic CRM 42');
      assert.ok(await page.click(`Array.from(document.querySelectorAll('button[role=checkbox]')).find(el => el.textContent.includes('Разрешаю авторизацию и проверку'))`));
      await click(page, 'Проверить и сохранить подключение');
      await check(page, `window.localSetupFixture.stageInputMatched && window.localSetupFixture.tokenClearedBeforeStage && ${input('Пароль YCLIENTS')}.value === '' && ${input('Логин YCLIENTS')}.value === ''`, 'YCLIENTS credentials hand off once and DOM clears before request');
      await capture(page, 'stage-pending'); await click(page, 'Выйти');
      await check(page, `!!${input('Пароль')} && ${input('Пароль')}.value === '' && !${button('Найти салон')} && JSON.stringify(window.localSetupFixture.calls) === '["password","loadBranches","stage","stage","signOut"]'`, 'signout remount restores supported empty password form');
      await page.reload(); await check(page, `!!${input('Пароль')} && window.localSetupFixture.calls.length === 0`, 'reload does not submit login or load branches');
      await click(page, 'Создать бизнес');
      for (const [field, value] of [['name', 'Синтетический бизнес'], ['slug', 'synthetic-local'], ['ownerEmail', 'owner@example.invalid'], ['branchName', 'Тестовый филиал'], ['password', 'Synthetic-Only-42']]) await fill(page, named(field), value);
      assert.ok(await page.focus(named('branchTimezone')));
      for (const key of 'Москва') { await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key, text: key, unmodifiedText: key, windowsVirtualKeyCode: 0 }); await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode: 0 }); }
      await page.press('Tab'); await check(page, `${named('branchTimezone')}.value === 'Europe/Moscow'`, 'explicit timezone selection');
      assert.ok(await page.focus(named('confirmed'))); await page.press('Space'); await click(page, 'Создать бизнес');
      await check(page, `document.body.innerText.includes('Не создавайте бизнес повторно') && !${button('Создать бизнес')} && JSON.stringify(window.localSetupFixture.calls) === '["signup"]'`, 'uncertain synthetic signup does not auto-repeat');
      await click(page, 'Перейти ко входу по паролю');
      await check(page, `${input('Короткое имя бизнеса для входа')}.value === 'synthetic-local' && ${input('Email')}.value === 'owner@example.invalid' && ${input('Пароль')}.value === '' && JSON.stringify(window.localSetupFixture.calls) === '["signup"]'`, 'existing uncertain-signup recovery remains password-only and explicit');
      await capture(page, 'signup-recovery');
    }
    assert.equal(page.exceptions.length, 0, 'no uncaught browser exception'); assert.equal(blocked, 0, 'no API or unexpected page requests');
    await page.close(); browser.listeners.delete(guard); activePage = null;
  }
  assert.equal(refused, 0); report.status = 'PASS';
} catch (error) { report.status = 'FAIL'; report.failure = error instanceof Error ? error.message : 'unknown'; process.exitCode = 1; }
finally {
  await cleanup();
  report.cleanup = { staticHostStopped: !server.listening, ownedBrowserStopped: !child || child.exitCode !== null || child.signalCode !== null, profileRemoved: !profile || !fs.existsSync(profile) };
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, failure: report.failure ?? null, cleanup: report.cleanup, output }));
}
