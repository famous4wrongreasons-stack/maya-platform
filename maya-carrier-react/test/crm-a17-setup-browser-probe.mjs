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
async function login(page, account) {
  const field = label => `Q.all('input').find(el => el.getAttribute('aria-label') === ${JSON.stringify(label)})`;
  assert.ok(await page.waitFor(`!!${field('Пароль')}`), 'Local entry opens supported password form');
  assert.equal(await page.fill(field('Короткое имя бизнеса для входа'), account.tenantSlug), true);
  assert.equal(await page.fill(field('Email'), account.email), true);
  assert.equal(await page.fill(field('Пароль'), account.password), true);
  const before = page.apiRequests('/auth/login').length;
  await named(page, 'Войти');
  assert.ok(await page.waitFor('document.body.innerText.includes("Локальное подключение YCLIENTS")'));
  const response = await until(() => page.apiRequests('/auth/login').slice(before).find(row => row.finishedAt), 'actual password login');
  assert.ok([200, 201].includes(response.status));
  assert.equal(page.apiRequests('/auth/email/start').length, 0);
  assert.equal(page.apiRequests('/auth/email/verify').length, 0);
}
const tokenInput = 'Q.all("input").find(el => el.getAttribute("aria-label") === "Пользовательский API-токен YCLIENTS")';
const companyInput = 'Q.all("input").find(el => el.getAttribute("aria-label") === "ID компании YCLIENTS")';
const postCount = page => page.apiRequests('/integrations/crm').filter(row => row.method === 'POST').length;
const refusalContracts = Object.freeze({
  'provider-denied': { token: 'SYNTHETIC_A17_DENIED', code: 'crm_credentials_rejected', notice: 'YCLIENTS отклонил проверку доступа. Нужно проверить токен и его права на выбранную компанию.' },
  'company-unavailable': { token: 'SYNTHETIC_A17_COMPANY_MISSING', code: 'crm_company_not_found', notice: 'Выбранная компания YCLIENTS не найдена или недоступна для этого токена.' },
  'company-malformed-title': { token: 'SYNTHETIC_A17_COMPANY_BAD_TITLE', code: 'crm_connection_failed', notice: 'Сервер не смог проверить подключение к YCLIENTS.' },
});
const safeNetwork = page => [...page.requests.values()].map(row => ({ method: row.method, path: new URL(row.url).pathname, status: row.status ?? null, failed: Boolean(row.failed) }));
const activationHelp = 'Сначала должно завершиться сохранение подключения в шаге 1. Сейчас оно не подтверждено, поэтому активация и импорт недоступны.';
async function checkActivation(page, state) {
  assert.ok(['blocked', 'ready', 'consented'].includes(state));
  // Closed booleans only: never archive arbitrary text, IDs, form values or credentials.
  const snapshot = await page.eval(`(() => {
    const section = document.querySelector('section[aria-label="Активация подключения"]');
    if (!section) return null;
    const controls = [...section.querySelectorAll('button')];
    const consent = controls.find(el => el.getAttribute('role') === 'checkbox');
    const action = controls.find(el => !el.hasAttribute('role'));
    if (!consent || !action || controls.length !== 2) return null;
    const consentHelp = consent.getAttribute('aria-describedby');
    const actionHelp = action.getAttribute('aria-describedby');
    const help = consentHelp ? document.getElementById(consentHelp) : null;
    return { consentDisabled: consent.disabled, consentChecked: consent.getAttribute('aria-checked') === 'true',
      actionDisabled: action.disabled, hasHelp: !!(consentHelp || actionHelp),
      canonicalSharedHelp: !!help && section.contains(help) && Q.visible(help) && consentHelp === actionHelp && help.textContent.trim() === ${JSON.stringify(activationHelp)} };
  })()`);
  assert.deepEqual(snapshot, {
    consentDisabled: state === 'blocked', consentChecked: state === 'consented',
    actionDisabled: state !== 'consented', hasHelp: state === 'blocked', canonicalSharedHelp: state === 'blocked',
  }, 'Actual activation controls and associated explanation: ' + state);
  return snapshot;
}

async function main() {
  assert.equal(process.connected, true, 'Use the owned --crm-setup HTTP fixture');
  const ready = receive('start'); process.send({ type: 'ready' });
  const input = await ready;
  assert.deepEqual(input.refusals?.map(scope => scope.key), ['provider-denied', 'company-unavailable', 'company-malformed-title'], 'Three finite refusal cases required');
  for (const scope of input.refusals) assert.equal(scope.apiToken, refusalContracts[scope.key].token);
  const backendOrigin = localOrigin(input.backendOrigin);
  assert.ok(path.isAbsolute(input.output));
  const output = path.join(input.output, 'crm-setup-browser'); fs.mkdirSync(output, { mode: 0o700 });
  const report = { contract: 'maya.crm-a17-current-react-proof/1', status: 'running', actualBackend: true,
    provider: 'NATIVE_ADAPTER_SYNTHETIC_GET_ONLY', modelCalls: 0, sameUrlReloadOnly: true,
    responseLoss: 'CDP_RESPONSE_STAGE_DROP_AFTER_ACTUAL_201_AND_CANONICAL_DB_CHECK', observations: {}, screenshots: [] };
  let browser, dev, chromeChild, chromeProfile, page, guard, closing;
  const cleanup = () => closing ??= (async () => {
    guard?.dispose?.();
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
  async function capture(name, activation = false) {
    assert.equal(await page.eval(`(${tokenInput})?.value ?? ''`), '', 'Never capture an entered credential');
    await page.eval('document.querySelector("main")?.scrollTo(0,0)');
    if (activation) await page.eval('document.querySelector(\'section[aria-label="Активация подключения"]\')?.scrollIntoView({block:"center"})');
    await page.eval('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))');
    assert.equal(await page.eval('document.documentElement.scrollWidth > innerWidth'), false);
    const screenshot = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(screenshot.data, 'base64'), { flag: 'wx', mode: 0o600 });
    report.screenshots.push(name);
  }
  try {
    dev = createDevServer({ root: path.join(root, 'dist/web'), api: backendOrigin + '/api', upstreamPorts: [new URL(backendOrigin).port] });
    const { port } = await dev.listen(0), origin = localOrigin(`http://127.0.0.1:${port}`);
    const webReady = receive('continue:web-ready');
    process.send({ type: 'web-ready', origin }); await webReady;
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
    await login(page, input);
    assert.equal(page.apiRequests('/integrations/crm').length, 0, 'Mount never reads or mutates CRM');
    assert.equal(await page.eval(`(${button('Проверить и сохранить подключение')}).disabled`), true);
    await capture('initial'); await checkpoint('initial');
    await named(page, 'Загрузить филиалы');
    assert.ok(await page.waitFor('document.body.innerText.includes("Показано сохранённое подключение")'));
    await checkActivation(page, 'blocked');
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
    await checkActivation(page, 'blocked');
    const installPendingUrl = await page.eval('window.location.href');
    const installLocator = new URL(installPendingUrl).searchParams;
    assert.equal(installLocator.get('crm_operation'), 'install');
    const installKey = installLocator.get('crm_request'); assert.match(installKey, /^[a-f0-9-]{36}$/);
    assert.equal(postCount(page), 1);
    await capture('install-lost'); await checkpoint('install-lost', { requestId: installKey });
    const beforeInstallReload = page.apiRequests('/integrations/crm').length;
    await page.goto(installPendingUrl); await login(page, input);
    assert.equal(await page.eval('window.location.href'), installPendingUrl);
    assert.equal(page.apiRequests('/integrations/crm').length, beforeInstallReload, 'Reload does not submit or inspect pending work automatically');
    assert.equal(await page.eval(`(${tokenInput}).value`), '');
    await checkpoint('install-reloaded');
    await named(page, 'Загрузить филиалы');
    assert.ok(await page.waitFor('document.body.innerText.includes("Сервер пока не подтвердил приём запроса")'));
    const missingRequest = await until(() => page.apiRequests('/integrations/crm/operation').find(row => row.finishedAt), 'real NOT_OBSERVED lookup');
    const missing = JSON.parse(await page.responseBody(missingRequest.requestId));
    assert.equal(missing.status, 'NOT_OBSERVED'); assert.equal(missing.requestId, installKey); assert.equal(missing.receipt, null);
    assert.equal(await page.eval(`(${button('Повторить отправку подключения')}).disabled`), true, 'Missing observation grants no fresh consent');
    assert.equal(postCount(page), 1);
    report.observations.notObservedActivation = await checkActivation(page, 'blocked');
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
    report.observations.installedActivation = await checkActivation(page, 'ready');
    assert.equal(postCount(page), 2);
    await capture('installed'); await checkpoint('installed', { receipt: installed.receipt });
    await click(page, 'Q.all("button[role=checkbox]").find(el => Q.name(el).includes("Разрешаю активировать показанную версию"))', 'activation consent');
    report.observations.consentedActivation = await checkActivation(page, 'consented');
    assert.equal(postCount(page), 2, 'Consent alone never dispatches activation');
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
    const readsBeforeReload = page.apiRequests('/integrations/crm').length;
    await page.goto(pendingUrl); await login(page, input);
    assert.equal(await page.eval('window.location.href'), pendingUrl, 'Same URL preserves the non-authorizing locator');
    assert.equal(page.apiRequests('/integrations/crm').length, readsBeforeReload, 'Reload never redispatches or reads an operation automatically');
    assert.equal(postCount(page), 3);
    await checkpoint('reload');
    await named(page, 'Загрузить филиалы');
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
    report.guards = guard; report.network = safeNetwork(page); report.refusals = [];
    guard.dispose(); await page.close(); page = null;
    for (const scope of input.refusals) {
      const expected = refusalContracts[scope.key];
      page = await browser.newPage();
      guard = await installGuard(page, origin, scope, { lossInjection: false });
      await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1100, deviceScaleFactor: 1, mobile: false });
      await page.goto(initialUrl); await login(page, scope);
      assert.equal(page.apiRequests('/integrations/crm').length, 0, 'Refusal-case mount makes no setup request');
      await named(page, 'Загрузить филиалы');
      assert.ok(await page.waitFor(`!!${button(scope.branchName + ' · Europe/Moscow')}`));
      assert.equal(await page.fill(tokenInput, scope.apiToken), true);
      assert.equal(await page.fill(companyInput, String(scope.companyId)), true);
      await named(page, scope.branchName + ' · Europe/Moscow');
      assert.equal(await page.eval(`(${button('Проверить и сохранить подключение')}).disabled`), true, 'Refusal-case stage still requires consent');
      await click(page, 'Q.all("button[role=checkbox]").find(el => Q.name(el).includes("Разрешаю проверить токен"))', 'refusal-case installation consent');
      await named(page, 'Проверить и сохранить подключение');
      const refused = await until(() => page.apiRequests('/integrations/crm/connect').find(row => row.finishedAt), 'actual classified provider refusal');
      assert.equal(refused.status, 400);
      const body = JSON.parse(await page.responseBody(refused.requestId));
      assert.equal(body.error?.code, expected.code);
      assert.ok(await page.waitFor(`document.body.innerText.includes(${JSON.stringify(expected.notice)})`), 'Specific safe refusal must be visible');
      assert.equal(await page.eval(`(${tokenInput}).value`), '');
      assert.equal(await page.eval(`(${button('Проверить и сохранить подключение')}).disabled`), true);
      assert.equal(await page.eval(`(${button('Активировать и импортировать')}).disabled`), true);
      const refusedActivation = await checkActivation(page, 'blocked');
      assert.equal(postCount(page), 1);
      const pendingUrl = await page.eval('window.location.href'), locator = new URL(pendingUrl).searchParams;
      assert.equal(locator.get('crm_operation'), 'install');
      const pendingId = locator.get('crm_request'); assert.match(pendingId, /^[a-f0-9-]{36}$/);
      await capture(scope.key + '-result');
      await capture(scope.key + '-activation-help', true);
      await checkpoint(scope.key + '-result', { requestId: pendingId, code: expected.code });
      const readsBefore = page.apiRequests('/integrations/crm').length;
      await page.goto(pendingUrl); await login(page, scope);
      assert.equal(await page.eval('window.location.href'), pendingUrl, 'Refusal reload preserves same operation locator');
      assert.equal(page.apiRequests('/integrations/crm').length, readsBefore, 'Refusal reload does not read or resend automatically');
      assert.equal(postCount(page), 1);
      assert.equal(await page.eval(`(${tokenInput}).value`), '');
      await named(page, 'Загрузить филиалы');
      assert.ok(await page.waitFor('document.body.innerText.includes("Сервер пока не подтвердил приём запроса")'));
      const observed = await until(() => page.apiRequests('/integrations/crm/operation').find(row => row.finishedAt), 'read exact refused operation');
      assert.equal(observed.status, 200);
      const operation = JSON.parse(await page.responseBody(observed.requestId));
      assert.equal(operation.status, 'NOT_OBSERVED'); assert.equal(operation.requestId, pendingId); assert.equal(operation.receipt, null);
      const status = [...page.apiRequests('/integrations/crm')].reverse().find(row => row.method === 'GET' && new URL(row.url).pathname === '/api/integrations/crm' && row.finishedAt);
      assert.ok(status); assert.equal(status.status, 200);
      const connection = JSON.parse(await page.responseBody(status.requestId));
      assert.equal(connection.configured, false); assert.equal(connection.connection, null);
      assert.equal(await page.eval(`(${button('Повторить отправку подключения')}).disabled`), true, 'No fresh token or consent after reload');
      assert.equal(await page.eval(`(${button('Активировать и импортировать')}).disabled`), true);
      const observedActivation = await checkActivation(page, 'blocked');
      assert.equal(postCount(page), 1); assert.equal(page.apiRequests('/auth/login').length, 2);
      assert.deepEqual(guard.blocked, []); assert.deepEqual(guard.errors, []);
      assert.equal(guard.droppedCommittedResponses, 0); assert.equal(guard.droppedUnregisteredRequests, 0);
      assert.deepEqual(page.exceptions, []);
      await capture(scope.key + '-observed'); await checkpoint(scope.key + '-observed', { requestId: pendingId, status: operation.status });
      report.refusals.push({ key: scope.key, code: expected.code, httpStatus: refused.status, receiptStatus: operation.status, operationHash: hash({ operation: 'install', requestId: pendingId }), sameLocatorReload: true, posts: 1, configured: false, automaticRetry: false, refusedActivation, observedActivation, guards: guard, network: safeNetwork(page) });
      guard.dispose(); await page.close(); page = null;
    }
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed'; report.failure = error.message;
    throw error;
  } finally {
    report.guards ??= guard;
    report.network ??= page ? safeNetwork(page) : [];
    if (page && report.refusals) report.incompleteRefusal = { guards: guard, network: safeNetwork(page) };
    try { fs.writeFileSync(path.join(output, 'browser.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); }
    finally { await cleanup(); process.off('SIGTERM', terminate); process.off('disconnect', terminate); if (process.connected) process.disconnect(); }
  }
}
if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url)
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
