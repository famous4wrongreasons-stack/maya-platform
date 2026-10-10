// Local component proof. Current React + synthetic OnboardingPort, never signup HTTP/PG.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import esbuild from 'esbuild';
import { Browser } from '../../maya-chat-shell/test/cdp-verify.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const output = process.argv[2];
assert.ok(output && path.isAbsolute(output) && /^\/(?:private\/)?tmp\/maya-onboarding-ui-[a-zA-Z0-9-]+$/.test(output), 'fresh owned output required');
assert.equal(fs.existsSync(output), false, 'never overwrite evidence');
fs.mkdirSync(output, { mode: 0o700 });
const report = { contract: 'maya.onboarding-ui.synthetic/1', status: 'running', syntheticPort: true, httpSignup: false, database: false, providerCalls: 0, realAcceptance: false, checks: [], cleanup: null };
const built = await esbuild.build({ entryPoints: [path.join(here, 'onboarding-ui.fixture.tsx')], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', jsx: 'automatic', write: false, logLevel: 'silent' });
const bundle = built.outputFiles[0].contents;
report.bundleSha256 = createHash('sha256').update(bundle).digest('hex');
report.sources = Object.fromEntries(['src/signin/StandardOnboarding.tsx', 'src/signin/onboardingSlug.ts', 'src/signin/onboardingTimezones.ts', 'src/styles.css', 'test/onboarding-ui.fixture.tsx', 'test/onboarding-ui.browser.mjs'].map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(here, '..', file))).digest('hex')]));
const html = '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/styles.css"><title>Synthetic MAYA signup test</title></head><body><div id="root" class="app"></div><script type="module" src="/fixture.js"></script></body></html>';
const assets = new Map([['/', ['text/html; charset=utf-8', html]], ['/fixture.js', ['text/javascript', bundle]], ['/styles.css', ['text/css', fs.readFileSync(path.join(here, '../src/styles.css'))]]]);
let refused = 0, browser, child, profile, stage = 'listen', activePage;
const server = http.createServer((request, response) => {
  const asset = request.method === 'GET' ? assets.get(request.url) : null;
  if (!asset) { refused++; response.writeHead(403); response.end(); return; }
  response.writeHead(200, { 'Content-Type': asset[0], 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; style-src-attr 'none'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'" }); response.end(asset[1]);
});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const input = name => `document.querySelector('[name="${name}"]')`;
const button = name => `Array.from(document.querySelectorAll('button')).find(el => el.textContent === ${JSON.stringify(name)})`;
async function check(page, expression, name) { assert.ok(await page.waitFor(expression), name); report.checks.push(name); }
async function fill(page, name, value) { assert.ok(await page.fill(input(name), value), 'keyboard field input'); }
async function typeahead(page, text) {
  for (const key of text) {
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key, text: key, unmodifiedText: key, windowsVirtualKeyCode: 0 });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode: 0 });
  }
}
async function prepare(page) {
  await fill(page, 'name', 'Синтетический бизнес');
  await check(page, `${input('slug')}.value === 'sinteticheskiy-biznes'`, 'slug suggested from Cyrillic name');
  await fill(page, 'slug', 'fixture-manual');
  await fill(page, 'name', 'Синтетический новый бизнес');
  await check(page, `${input('slug')}.value === 'fixture-manual'`, 'manual slug preserved after business edit');
  await fill(page, 'branchName', 'Тестовый филиал');
  await fill(page, 'ownerEmail', 'owner@example.invalid');
  await fill(page, 'password', 'Synthetic-Only-42');
}
async function chooseTimezone(page) {
  assert.ok(await page.focus(input('branchTimezone')));
  await typeahead(page, 'Москва');
  await page.press('Tab');
  await check(page, `${input('branchTimezone')}.value === 'Europe/Moscow'`, 'native keyboard typeahead selects exact IANA');
}
async function consent(page) { assert.ok(await page.focus(input('confirmed'))); await page.press('Space'); await check(page, `${input('confirmed')}.checked && !${button('Создать бизнес')}.disabled`, 'Space consent enables create'); }
async function submit(page) { assert.ok(await page.focus(input('password'))); await page.press('Enter'); await check(page, `window.onboardingFixture.calls > 0 && ${input('password')}.value === ''`, 'Enter submits and clears password'); }
async function screenshot(page, name) { const { data } = await page.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(data, 'base64')); }
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  stage = 'browser';
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-onboarding-ui-chrome-'));
  child = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--metrics-recording-only', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--disable-quic', '--disable-features=OptimizationHints,MediaRouter', 'about:blank'], { env: { PATH: '/usr/bin:/bin', HOME: os.homedir(), TMPDIR: os.tmpdir() }, stdio: 'ignore' });
  let launchError = false; child.once('error', () => { launchError = true; });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !fs.existsSync(portFile) && !launchError && child.exitCode === null; i++) await delay(100);
  assert.ok(fs.existsSync(portFile) && !launchError, 'owned browser ready');
  const [port, wsPath] = fs.readFileSync(portFile, 'utf8').trim().split('\n');
  browser = new Browser(child, profile, `ws://127.0.0.1:${port}${wsPath}`); await browser.connect();
  report.chromiumBuiltinSandbox = true; report.chromeOsWideNetworkClosure = 'NOT_QUALIFIED';
  for (const scenario of ['completed', 'unavailable', 'uncertain', 'reject', 'cancel']) {
    stage = scenario; const page = activePage = await browser.newPage();
    let blocked = 0;
    const guard = event => {
      if (event.sessionId !== page.sessionId || event.method !== 'Fetch.requestPaused') return;
      const { requestId, request } = event.params; const url = new URL(request.url);
      const allow = request.method === 'GET' && url.origin === origin && assets.has(url.pathname) && !url.search;
      if (!allow) blocked++;
      void page.send(allow ? 'Fetch.continueRequest' : 'Fetch.failRequest', { requestId, ...(!allow ? { errorReason: 'BlockedByClient' } : {}) });
    };
    browser.listeners.add(guard);
    await page.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    await page.send('Network.setBypassServiceWorker', { bypass: true });
    await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await page.goto(origin);
    await check(page, `!!${input('confirmed')} && ${button('Создать бизнес')}.disabled`, 'initial unchecked consent blocks submit');
    await check(page, `${input('branchTimezone')}.value === ''`, 'no implicit device or Moscow timezone');
    await prepare(page);
    if (scenario === 'completed') {
      for (const width of [320, 390, 1280]) {
        await page.send('Emulation.setDeviceMetricsOverride', { width, height: 920, deviceScaleFactor: 1, mobile: width < 500 });
        await check(page, `Array.from(document.querySelectorAll('main, [role=form], input, select, button')).every(el => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().left >= 0 && el.getBoundingClientRect().right <= innerWidth + 1)`, `no horizontal overflow at ${width}px`);
        if (width < 500) await screenshot(page, 'form-' + width);
      }
      await consent(page); await page.focus(input('password')); await page.press('Enter');
      await check(page, `window.onboardingFixture.calls === 0 && document.activeElement.name === 'branchTimezone' && ${input('branchTimezone')}.getAttribute('aria-invalid') === 'true' && ${input('password')}.value === 'Synthetic-Only-42'`, 'missing timezone stays local, focuses error and preserves password');
      await fill(page, 'ownerEmail', 'incorrect'); await page.focus(input('password')); await page.press('Enter');
      await check(page, `window.onboardingFixture.calls === 0 && document.activeElement.name === 'ownerEmail' && ${input('name')}.value === 'Синтетический новый бизнес'`, 'invalid email focuses inline error and keeps public fields');
      await fill(page, 'ownerEmail', 'owner@example.invalid');
    }
    await chooseTimezone(page);
    if (scenario !== 'completed') await consent(page);
    await submit(page);
    await check(page, `window.onboardingFixture.inputsValid && Array.from(document.querySelectorAll('input, select')).every(el => el.disabled) && document.body.innerText.includes('Создаём бизнес')`, 'pending state freezes fields and hands exact fixture to runtime');
    await page.eval(`${button('Создаём бизнес…')}.click()`); await page.press('Enter');
    await check(page, 'window.onboardingFixture.calls === 1', 'repeated activation makes one submit');
    if (scenario === 'unavailable') {
      await page.eval(`window.onboardingFixture.finish('unavailable')`);
      await check(page, `${input('slug')}.value === 'fixture-manual' && ${input('ownerEmail')}.value === 'owner@example.invalid' && !${input('confirmed')}.checked && ${input('password')}.value === ''`, 'preparation failure preserves public fields and asks fresh secret and consent');
      await fill(page, 'password', 'Synthetic-Only-42'); await consent(page); await submit(page);
      await check(page, 'window.onboardingFixture.calls === 2', 'explicit retry after preparation failure');
      await page.eval(`window.onboardingFixture.finish('completed')`);
    } else if (scenario === 'cancel') {
      await page.click(button('Отменить и вернуться ко входу'));
      await page.eval(`window.onboardingFixture.finish('completed')`);
      await check(page, `window.onboardingFixture.recovered && !document.querySelector('input') && window.onboardingFixture.calls === 1`, 'cancel unmounts; late completion cannot reopen form');
    } else await page.eval(`window.onboardingFixture.finish('${scenario}')`);
    if (['completed', 'unavailable'].includes(scenario)) {
      await check(page, `document.body.innerText.includes('Бизнес создан') && document.body.innerText.includes('CRM ещё нужно подключить')`, 'synthetic success retains CRM qualification');
      assert.ok(await page.click(button('Продолжить'))); await check(page, 'window.onboardingFixture.completed', 'synthetic success continues');
    }
    if (['uncertain', 'reject'].includes(scenario)) {
      await check(page, `!${input('confirmed')} && !${button('Создать бизнес')} && document.body.innerText.includes('Не создавайте бизнес повторно') && ${input('password')}.value === ''`, 'unknown outcome removes repeat creation');
      assert.ok(await page.click(button('Перейти ко входу по паролю'))); await check(page, 'window.onboardingFixture.recovered', 'recovery carries only slug and email');
    }
    assert.equal(page.exceptions.length, 0, 'no browser exceptions'); assert.equal(blocked, 0, 'no unexpected page requests');
    await page.close(); browser.listeners.delete(guard); activePage = null;
  }
  assert.equal(refused, 0); report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL'; report.failedStage = stage; report.failure = error instanceof Error ? error.message : 'unknown';
  process.exitCode = 1;
} finally {
  if (activePage) await activePage.close().catch(() => {});
  if (browser) await browser.close();
  else if (child?.exitCode === null) child.kill('SIGKILL');
  if (profile && fs.existsSync(profile)) fs.rmSync(profile, { recursive: true, force: true });
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  report.cleanup = { staticHostStopped: !server.listening, ownedBrowserStopped: !child || child.exitCode !== null || child.signalCode !== null, profileRemoved: !profile || !fs.existsSync(profile) };
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, failedStage: report.failedStage ?? null, failure: report.failure ?? null, cleanup: report.cleanup, output }));
}
