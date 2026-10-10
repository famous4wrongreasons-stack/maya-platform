// Actual current React form + real HTTP. Synthetic native provider is owned by
// the parent fixture. No auth seed, model, payload substitution or automatic retry.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Browser } from '../../maya-chat-shell/test/cdp-verify.mjs';
import { createDevServer } from '../../maya-chat-shell/dev/serve.mjs';
import { installGuard, localOrigin } from './crm-a17-setup-browser-guard.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function until(read, label) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { const value = await read(); if (value) return value; await pause(50); }
  throw new Error('Timed out: ' + label);
}
function receive(type) {
  return new Promise((resolve, reject) => {
    const listener = value => { if (value?.type === type) { clearTimeout(timer); process.off('message', listener); resolve(value); } };
    const timer = setTimeout(() => { process.off('message', listener); reject(new Error('Missing IPC: ' + type)); }, 20000);
    process.on('message', listener);
  });
}
async function checkpoint(name, data = {}) {
  const pending = receive('continue:' + name);
  process.send({ type: 'checkpoint', name, ...data }); await pending;
}
const button = name => `Q.all('button').find(el => Q.visible(el) && Q.name(el) === ${JSON.stringify(name)})`;
async function click(page, expression, label) {
  assert.ok(await page.waitFor(`(() => { const el = ${expression}; return !!el && Q.visible(el) && !el.disabled; })()`), 'Enabled control missing: ' + label);
  assert.equal(await page.click(expression), true, label);
}
async function named(page, name) { await click(page, button(name), name); }
async function login(page, email) {
  await named(page, 'Войти по email');
  assert.ok(await page.waitFor('!!Q.email()'));
  assert.equal(await page.fill('Q.email()', email), true);
  const before = page.apiRequests('/auth/email/start').length;
  await named(page, 'Получить код');
  const start = await until(() => page.apiRequests('/auth/email/start').slice(before).find(row => row.finishedAt), 'actual debug email start');
  assert.ok([200, 201].includes(start.status));
  const body = JSON.parse(await page.responseBody(start.requestId));
  assert.equal(body.delivery, 'debug'); assert.ok(typeof body.debug_code === 'string' && /^\d{4,8}$/.test(body.debug_code), 'Debug email code shape invalid');
  assert.equal(body.retry_after_seconds, 60);
  const nextLoginAt = Date.now() + 61000;
  assert.ok(await page.waitFor('!!Q.code()')); assert.equal(await page.fill('Q.code()', body.debug_code), true);
  delete body.debug_code;
  await named(page, 'Войти');
  assert.ok(await page.waitFor('document.body.innerText.includes("Локальное подключение YCLIENTS")'));
  return nextLoginAt;
}
const tokenInput = 'Q.all("input").find(el => el.getAttribute("aria-label") === "Пользовательский API-токен YCLIENTS")';
const companyInput = 'Q.all("input").find(el => el.getAttribute("aria-label") === "ID компании YCLIENTS")';
const postCount = page => page.apiRequests('/integrations/crm').filter(row => row.method === 'POST').length;

async function main() {
  assert.equal(process.connected, true, 'Use the owned --crm-setup HTTP fixture');
  const ready = receive('start'); process.send({ type: 'ready' });
  const input = await ready;
  const backendOrigin = localOrigin(input.backendOrigin);
  assert.ok(path.isAbsolute(input.output));
  const output = path.join(input.output, 'crm-setup-browser'); fs.mkdirSync(output, { mode: 0o700 });
  const report = { contract: 'maya.crm-a17-current-react-proof/1', status: 'running', actualBackend: true,
    provider: 'NATIVE_ADAPTER_SYNTHETIC_GET_ONLY', modelCalls: 0, sameUrlReloadOnly: true,
    responseLoss: 'CDP_RESPONSE_STAGE_DROP_AFTER_ACTUAL_201_AND_CANONICAL_DB_CHECK', observations: {}, screenshots: [] };
  let browser, dev, chromeChild, chromeProfile, page, guard, closing;
  const cleanup = () => closing ??= (async () => {
    try { await browser?.close(); }
    finally {
      if (chromeChild && chromeChild.exitCode === null) {
        const exited = new Promise(resolve => chromeChild.once('exit', resolve));
        chromeChild.kill('SIGKILL'); await Promise.race([exited, pause(2000)]);
      }
      if (chromeProfile) fs.rmSync(chromeProfile, { recursive: true, force: true });
      await dev?.close();
    }
  })();
  const terminate = () => { void cleanup().finally(() => process.exit(2)); };
  process.once('SIGTERM', terminate); process.once('disconnect', terminate);
  async function capture(name) {
    assert.equal(await page.eval(`(${tokenInput})?.value ?? ''`), '', 'Never capture an entered credential');
    await page.eval('document.querySelector("main")?.scrollTo(0,0)');
    await page.eval('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))');
    assert.equal(await page.eval('document.documentElement.scrollWidth > innerWidth'), false);
    const screenshot = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(screenshot.data, 'base64'), { flag: 'wx', mode: 0o600 });
    report.screenshots.push(name);
  }
  try {
    dev = createDevServer({ root: path.join(root, 'dist/web'), api: backendOrigin + '/api', upstreamPorts: [new URL(backendOrigin).port] });
    const { port } = await dev.listen(0), origin = localOrigin(`http://127.0.0.1:${port}`);
    chromeProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-a17-chrome-')); fs.chmodSync(chromeProfile, 0o700);
    chromeChild = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
      '--headless=new', '--js-flags=--max-old-space-size=256', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--metrics-recording-only',
      '--remote-debugging-port=0', '--user-data-dir=' + chromeProfile, '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--disable-quic', '--disable-features=OptimizationHints,MediaRouter', 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'ignore'] });
    let launchError; chromeChild.once('error', error => { launchError = error; });
    const portFile = path.join(chromeProfile, 'DevToolsActivePort');
    await until(() => { if (launchError) throw launchError; assert.equal(chromeChild.exitCode, null); return fs.existsSync(portFile); }, 'owned Chrome');
    const [cdpPort, wsPath] = fs.readFileSync(portFile, 'utf8').trim().split('\n');
    assert.match(cdpPort, /^\d+$/); assert.match(wsPath, /^\/devtools\/browser\/[a-f0-9-]+$/);
    browser = new Browser(chromeChild, chromeProfile, `ws://127.0.0.1:${cdpPort}${wsPath}`);
    let connectTimer;
    try { await Promise.race([browser.connect(), new Promise((_, reject) => { connectTimer = setTimeout(() => reject(new Error('CDP timeout')), 10000); })]); }
    finally { clearTimeout(connectTimer); }
    report.chrome = await browser.version();
    page = await browser.newPage();
    guard = await installGuard(page, origin, input);
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1100, deviceScaleFactor: 1, mobile: false });
    const initialUrl = origin + '/?local_crm_setup=1';
    await page.goto(initialUrl);
    let nextLoginAt = await login(page, input.email);
    assert.equal(page.apiRequests('/integrations/crm').length, 0, 'Mount never reads or mutates CRM');
    assert.equal(await page.eval(`(${button('Проверить и сохранить подключение')}).disabled`), true);
    await capture('initial'); await checkpoint('initial');
    await named(page, 'Проверить подключение и результат');
    assert.ok(await page.waitFor('document.body.innerText.includes("Показано сохранённое подключение")'));
    await checkpoint('loaded');
    assert.equal(await page.fill(tokenInput, 'SYNTHETIC_A17_V1'), true);
    assert.equal(await page.fill(companyInput, String(input.companyId)), true);
    await named(page, input.branchName + ' · Europe/Moscow');
    assert.equal(await page.eval(`(${button('Проверить и сохранить подключение')}).disabled`), true, 'Explicit consent required');
    await click(page, 'Q.all("button[role=checkbox]").find(el => Q.name(el).includes("Разрешаю проверить токен"))', 'installation consent');
    await named(page, 'Проверить и сохранить подключение');
    assert.equal(await page.eval(`(${tokenInput}).value`), '', 'Token cleared at submission');
    await until(() => guard.droppedUnregisteredRequests === 1, 'request dropped before backend registration');
    assert.ok(await page.waitFor('document.body.innerText.includes("Результат действия ещё не подтверждён")'));
    const installPendingUrl = await page.eval('window.location.href');
    const installLocator = new URL(installPendingUrl).searchParams;
    assert.equal(installLocator.get('crm_operation'), 'install');
    const installKey = installLocator.get('crm_request'); assert.match(installKey, /^[a-f0-9-]{36}$/);
    assert.equal(postCount(page), 1);
    await capture('install-lost'); await checkpoint('install-lost', { requestId: installKey });
    while (Date.now() < nextLoginAt) await pause(Math.min(1000, nextLoginAt - Date.now()));
    const beforeInstallReload = page.apiRequests('/integrations/crm').length;
    await page.goto(installPendingUrl); nextLoginAt = await login(page, input.email);
    assert.equal(await page.eval('window.location.href'), installPendingUrl);
    assert.equal(page.apiRequests('/integrations/crm').length, beforeInstallReload, 'Reload does not submit or inspect pending work automatically');
    assert.equal(await page.eval(`(${tokenInput}).value`), '');
    await checkpoint('install-reloaded');
    await named(page, 'Проверить подключение и результат');
    assert.ok(await page.waitFor('document.body.innerText.includes("Сервер пока не подтвердил приём запроса")'));
    const missingRequest = await until(() => page.apiRequests('/integrations/crm/operation').find(row => row.finishedAt), 'real NOT_OBSERVED lookup');
    const missing = JSON.parse(await page.responseBody(missingRequest.requestId));
    assert.equal(missing.status, 'NOT_OBSERVED'); assert.equal(missing.requestId, installKey); assert.equal(missing.receipt, null);
    assert.equal(await page.eval(`(${button('Повторить отправку подключения')}).disabled`), true, 'Missing observation grants no fresh consent');
    assert.equal(postCount(page), 1);
    await capture('not-observed'); await checkpoint('not-observed', { requestId: installKey });
    assert.equal(await page.fill(tokenInput, 'SYNTHETIC_A17_V1'), true);
    assert.equal(await page.fill(companyInput, String(input.companyId)), true);
    await named(page, input.branchName + ' · Europe/Moscow');
    assert.equal(await page.eval(`(${button('Повторить отправку подключения')}).disabled`), true);
    await click(page, 'Q.all("button[role=checkbox]").find(el => Q.name(el).includes("Разрешаю повторно отправить указанные"))', 'fresh same-operation consent');
    await named(page, 'Повторить отправку подключения');
    assert.equal(await page.eval(`(${tokenInput}).value`), '');
    const installRequest = await until(() => page.apiRequests('/integrations/crm/connect').find(row => row.finishedAt), 'actual installation response');
    assert.equal(installRequest.status, 201);
    const installed = JSON.parse(await page.responseBody(installRequest.requestId));
    assert.equal(installed.status, 'SUCCEEDED'); assert.equal(installed.receipt.phase, 'installed');
    assert.equal(installed.requestId, installKey, 'Explicit retry retains original UUID');
    assert.equal(installed.receipt.configVersion, installed.connection.configVersion);
    assert.ok(await page.waitFor('document.body.innerText.includes("Подключение сохранено. Активация и импорт требуют отдельного подтверждения.")'));
    assert.equal(await page.eval(`(${button('Активировать и импортировать')}).disabled`), true);
    assert.equal(postCount(page), 2);
    await capture('installed'); await checkpoint('installed', { receipt: installed.receipt });
    await click(page, 'Q.all("button[role=checkbox]").find(el => Q.name(el).includes("Разрешаю активировать показанную версию"))', 'activation consent');
    await named(page, 'Активировать и импортировать');
    await until(() => guard.droppedCommittedResponses === 1, 'actual upstream activation 201 response');
    assert.ok(await page.waitFor('document.body.innerText.includes("Результат действия ещё не подтверждён")'));
    assert.equal(postCount(page), 3); assert.equal(await page.eval(`(${tokenInput}).value`), '');
    const pendingUrl = await page.eval('window.location.href'), parsed = new URL(pendingUrl);
    assert.equal(parsed.origin, origin); assert.equal(parsed.searchParams.get('crm_operation'), 'activate');
    const requestId = parsed.searchParams.get('crm_request'); assert.match(requestId, /^[a-f0-9-]{36}$/);
    assert.equal(await page.eval(`(${button('Активировать и импортировать')}).disabled`), true);
    assert.equal(await page.eval(`(${button('Проверить и сохранить подключение')}).disabled`), true);
    report.observations.install = { receiptHash: hash(installed.receipt), configVersionHash: hash(installed.receipt.configVersion), tokenCleared: true, preAdmissionLoss: true, authoritativeNotObserved: true, explicitSameIdResubmission: true };
    report.observations.lost = { locatorHash: hash({ operation: 'activate', requestId }), posts: 3, admittedPosts: 2, automaticRetry: false };
    await capture('activation-lost'); await checkpoint('activation-lost', { requestId, configVersion: installed.receipt.configVersion });
    while (Date.now() < nextLoginAt) await pause(Math.min(1000, nextLoginAt - Date.now()));
    const readsBeforeReload = page.apiRequests('/integrations/crm').length;
    await page.goto(pendingUrl); await login(page, input.email);
    assert.equal(await page.eval('window.location.href'), pendingUrl, 'Same URL preserves the non-authorizing locator');
    assert.equal(page.apiRequests('/integrations/crm').length, readsBeforeReload, 'Reload never redispatches or reads an operation automatically');
    assert.equal(postCount(page), 3);
    await checkpoint('reload');
    await named(page, 'Проверить подключение и результат');
    assert.ok(await page.waitFor('document.body.innerText.includes("Сохранённый результат исходной операции восстановлен")'));
    assert.ok(await page.waitFor('document.body.innerText.includes("Локальный импорт подтверждён сервером. Это не проверка доступности записи.")'));
    const recoveryRequest = await until(() => page.apiRequests('/integrations/crm/operation').find(row => row.finishedAt && new URL(row.url).searchParams.get('operation') === 'activate'), 'exact operation recovery GET');
    assert.equal(recoveryRequest.method, 'GET'); assert.equal(recoveryRequest.status, 200);
    const recovered = JSON.parse(await page.responseBody(recoveryRequest.requestId));
    assert.equal(recovered.status, 'SUCCEEDED'); assert.equal(recovered.requestId, requestId);
    assert.equal(recovered.receipt.phase, 'import_confirmed'); assert.equal(recovered.receipt.atomicProjection, true);
    assert.equal(recovered.receipt.configVersion, installed.receipt.configVersion); assert.equal(recovered.current.matchesCurrentVersion, true);
    assert.equal(postCount(page), 3); assert.equal(await page.eval('window.location.href'), initialUrl);
    assert.equal(await page.eval(`(${tokenInput}).value`), '');
    assert.equal(await page.eval(`(${button('Активировать и импортировать')}).disabled`), true);
    assert.equal(page.apiRequests('/ai/chat').length, 0);
    assert.deepEqual(guard.blocked, []); assert.deepEqual(guard.errors, []); assert.equal(guard.droppedCommittedResponses, 1); assert.equal(guard.droppedUnregisteredRequests, 1);
    assert.deepEqual(page.exceptions, []);
    report.observations.recovery = { receiptHash: hash(recovered.receipt), posts: 3, admittedPosts: 2, locatorCleared: true, exactSourceVersion: true };
    await capture('recovered');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    await capture('recovered-mobile'); await checkpoint('recovered', { receipt: recovered.receipt });
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed'; report.failure = error.message;
    throw error;
  } finally {
    report.guards = guard;
    report.network = page ? [...page.requests.values()].map(row => ({ method: row.method, path: new URL(row.url).pathname, status: row.status ?? null, failed: Boolean(row.failed) })) : [];
    try { fs.writeFileSync(path.join(output, 'browser.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); }
    finally { await cleanup(); process.off('SIGTERM', terminate); process.off('disconnect', terminate); if (process.connected) process.disconnect(); }
  }
}
if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url)
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
