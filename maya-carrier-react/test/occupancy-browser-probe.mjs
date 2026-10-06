// Explicit opt-in child of the owned HTTP/PG probe. Uses the production React
// web bundle and real HTTP only; no page routes, response fixtures or token seed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Browser } from '../../maya-chat-shell/test/cdp-verify.mjs';
import { createDevServer } from '../../maya-chat-shell/dev/serve.mjs';
import { installGuard, localOrigin, OWNER_REQUEST } from './occupancy-browser-guard.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(read, label) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const value = await read();
    if (value) return value;
    await pause(50);
  }
  throw new Error('Timed out: ' + label);
}
function receive(type) {
  return new Promise((resolve, reject) => {
    const listener = (value) => {
      if (value?.type !== type) return;
      clearTimeout(timer); process.off('message', listener); resolve(value);
    };
    const timer = setTimeout(() => {
      process.off('message', listener); reject(new Error('Missing parent checkpoint: ' + type));
    }, 15_000);
    process.on('message', listener);
  });
}
async function checkpoint(name, data = {}) {
  const ack = receive('continue:' + name);
  process.send({ type: 'checkpoint', name, ...data });
  await ack;
}
async function snapshot(page) {
  return page.eval('({ text: document.body.innerText, controls: Q.all("button,input,textarea").filter(Q.visible).map(el => ({tag:el.tagName,name:Q.name(el)})) })');
}
async function clickNamed(page, name) {
  // Read current rendered controls before selecting and clicking one of them.
  const view = await snapshot(page);
  assert.ok(view.controls.some((control) => control.tag === 'BUTTON' && control.name === name), 'Visible control missing: ' + name);
  assert.equal(await page.click(`Q.all('button').find(el => Q.visible(el) && Q.name(el) === ${JSON.stringify(name)})`), true);
}
async function login(page, email) {
  assert.ok(await page.waitFor('!!Q.byName("button", /^Войти по email$/)'));
  await clickNamed(page, 'Войти по email');
  assert.ok(await page.waitFor('!!Q.email()'));
  await snapshot(page);
  assert.equal(await page.fill('Q.email()', email), true);
  const before = page.apiRequests('/auth/email/start').length;
  await clickNamed(page, 'Получить код');
  const start = await until(() => page.apiRequests('/auth/email/start').slice(before).find((r) => r.finishedAt), 'actual debug email start');
  assert.ok([200, 201].includes(start.status));
  const response = JSON.parse(await page.responseBody(start.requestId));
  assert.equal(response.delivery, 'debug');
  assert.match(response.debug_code, /^\d{4,8}$/);
  assert.ok(await page.waitFor('!!Q.code()'));
  await snapshot(page);
  assert.equal(await page.fill('Q.code()', response.debug_code), true);
  await clickNamed(page, 'Войти');
  assert.ok(await page.waitFor('!!Q.composer()'), 'Real UI sign-in must complete');
  // Do not publish auth bodies, code, email, tokens, console or request postData.
  delete response.debug_code;
  assert.equal(response.retry_after_seconds, 60, 'Existing local profile cooldown changed; review acceptance timing');
  await until(() => page.apiRequests('/ai/conversation').some((r) => r.finishedAt), 'HTTP history');
  return Date.now() + (response.retry_after_seconds + 1) * 1000;
}
async function sendOwnerRequest(page) {
  const view = await snapshot(page);
  assert.ok(view.controls.some((control) => control.name === 'Сообщение для MAYA'));
  assert.equal(await page.fill('Q.composer()', OWNER_REQUEST), true);
  await clickNamed(page, 'Отправить');
}
async function answer(page, before, outcome, replyCount = 1) {
  const request = await until(() => page.apiRequests('/ai/chat').slice(before).find((r) => r.finishedAt && r.status === 201), 'real chat response');
  const body = JSON.parse(await page.responseBody(request.requestId));
  assert.equal(body.coordination.scope, 'explicit_occupancy');
  assert.equal(body.coordination.revision, 1);
  assert.equal(body.recommendation.outcome, outcome);
  assert.equal(body.recommendation.noSideEffects, true);
  assert.equal(body.recommendation.executionAuthority, false);
  assert.equal(body.recommendation.reasoning, 'deterministic');
  const normalize = (text) => text.replace(/\s+/g, ' ').trim();
  // A previous AVAILABLE reply in restored history cannot satisfy this check.
  const expectedReply = normalize(body.reply);
  assert.ok(await page.waitFor(`(() => {
    const replies = Q.all('[data-chat-message="maya"]');
    return replies.length === ${replyCount} && replies.at(-1).textContent.replace(/^MAYA: /, '').replace(/\\s+/g, ' ').trim() === ${JSON.stringify(expectedReply)};
  })()`), 'The new complete assistant reply must be rendered exactly once');
  const visible = await page.eval(`Q.all('[data-chat-message="maya"]').at(-1).innerText`);
  assert.ok(visible.includes('Предложение сохранено, версия 1'));
  for (const text of outcome === 'AVAILABLE'
    ? ['12:00', '13:00', 'Europe/Moscow', 'на момент проверки']
    : ['срок возможности истёк', 'Рекомендация заполнить его неактуальна']) assert.ok(visible.includes(text), 'Visible answer missing: ' + text);
  return body;
}

async function main() {
  assert.equal(process.connected, true, 'Use the owned c9-occupancy-proof.mjs --browser driver');
  const pendingInput = receive('start');
  process.send({ type: 'ready' });
  const input = await pendingInput;
  const backendOrigin = localOrigin(input.backendOrigin);
  assert.ok(path.isAbsolute(input.output));
  const output = path.join(input.output, 'output', 'playwright');
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  const report = { contract: 'maya.explicit-occupancy-browser/1', status: 'running', syntheticCrmAdapter: true, realModelAcceptance: false, externalProviderAcceptance: false, snapshots: {}, observations: {} };
  let browser, dev, chromeChild, chromeProfile;
  const pages = [], guards = [];
  let closing;
  const cleanup = () => closing ??= (async () => {
    try { await browser?.close(); }
    finally {
      // Own the child from spawn, including the interval before CDP is ready.
      if (chromeChild && chromeChild.exitCode === null) {
        const stopped = new Promise((resolve) => chromeChild.once('exit', resolve));
        chromeChild.kill('SIGKILL');
        await Promise.race([stopped, pause(2000)]);
      }
      if (chromeProfile) fs.rmSync(chromeProfile, { recursive: true, force: true });
      await dev?.close();
    }
  })();
  const terminate = () => { void cleanup().finally(() => process.exit(2)); };
  process.once('SIGTERM', terminate);
  process.once('disconnect', terminate);
  async function capture(page, name) {
    // DOM completion precedes compositor paint; preserve real pixels after two frames.
    await page.eval('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))');
    report.snapshots[name] = await snapshot(page);
    const { data } = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(data, 'base64'), { flag: 'wx', mode: 0o600 });
  }
  async function newPage(origin) {
    const page = await browser.newPage(); pages.push(page);
    guards.push(await installGuard(page, origin));
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await page.goto(origin + '/');
    return page;
  }
  try {
    dev = createDevServer({ root: path.join(root, 'dist/web'), api: backendOrigin + '/api', upstreamPorts: [new URL(backendOrigin).port] });
    const { port } = await dev.listen(0);
    const origin = localOrigin(`http://127.0.0.1:${port}`);
    report.carrierOrigin = origin;
    // Fail closed for Chrome background traffic as well as the page Fetch guard.
    // The controller's own CDP socket is separate from browser page requests.
    assert.equal(closing, undefined, 'Acceptance cancelled before Chrome startup');
    chromeProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-c9occ-chrome-'));
    fs.chmodSync(chromeProfile, 0o700);
    chromeChild = spawn(chrome, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--disable-extensions', '--disable-background-networking', '--disable-component-update',
      '--disable-sync', '--metrics-recording-only', '--remote-debugging-port=0',
      '--user-data-dir=' + chromeProfile,
      '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
      '--disable-quic', '--disable-features=OptimizationHints,MediaRouter', 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'ignore'] });
    let launchError;
    chromeChild.once('error', (error) => { launchError = error; });
    const portFile = path.join(chromeProfile, 'DevToolsActivePort');
    await until(() => {
      if (launchError) throw launchError;
      assert.equal(chromeChild.exitCode, null, 'Owned Chrome exited before CDP readiness');
      return fs.existsSync(portFile);
    }, 'owned Chrome startup');
    const [cdpPort, wsPath] = fs.readFileSync(portFile, 'utf8').trim().split('\n');
    assert.match(cdpPort, /^\d+$/);
    assert.match(wsPath, /^\/devtools\/browser\/[a-f0-9-]+$/);
    browser = new Browser(chromeChild, chromeProfile, `ws://127.0.0.1:${cdpPort}${wsPath}`);
    let connectTimer;
    try {
      await Promise.race([browser.connect(), new Promise((_, reject) => {
        connectTimer = setTimeout(() => reject(new Error('Owned CDP connect timed out')), 10_000);
      })]);
    } finally { clearTimeout(connectTimer); }
    report.chrome = await browser.version();
    const page = await newPage(origin);
    const nextLoginAt = await login(page, input.ownerEmail);
    await sendOwnerRequest(page);
    const fresh = await answer(page, 0, 'AVAILABLE');
    assert.equal((await page.eval('Q.log().innerText')).split('Предложение сохранено, версия 1').length - 1, 1);
    report.observations.available = fresh;
    await capture(page, 'available');
    await checkpoint('available', { body: fresh });

    await page.reload();
    // The approved runtime is memory-only: reload honestly requires UI login.
    assert.ok(await page.waitFor('!!Q.byName("button", /^Войти по email$/)'));
    assert.equal(await page.eval('!!Q.composer()'), false);
    // Honor the real tenant/email 60-second rate limit; no bucket reset or clock mock.
    while (Date.now() < nextLoginAt) await pause(Math.min(1000, nextLoginAt - Date.now()));
    await login(page, input.ownerEmail);
    assert.ok(await page.waitFor('Q.log()?.innerText.includes("Данные и доступность действий нужно проверить заново")'));
    assert.ok((await page.eval('Q.log().innerText')).includes('Предложение сохранено, версия 1'));
    assert.equal(page.apiRequests('/ai/chat').length, 1, 'Reload/history must not trigger a new C9 request');
    await capture(page, 'history-after-relogin');
    await checkpoint('history');

    await page.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const beforeOffline = page.apiRequests('/ai/chat').length;
    await sendOwnerRequest(page);
    assert.ok(await page.waitFor('Q.log()?.innerText.includes("Нет связи") && !!Q.byName("button", /^Повторить отправку$/)'));
    const failed = await until(() => page.apiRequests('/ai/chat').slice(beforeOffline).find((r) => r.failed), 'offline request failure');
    const failedRequestId = JSON.parse(await page.postData(failed)).requestId;
    assert.equal(typeof failedRequestId, 'string');
    await capture(page, 'offline');
    await checkpoint('offline');
    await page.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const beforeRetry = page.apiRequests('/ai/chat').length;
    await clickNamed(page, 'Повторить отправку');
    const reconnected = await answer(page, beforeRetry, 'AVAILABLE', 2);
    assert.equal(reconnected.request_id, failedRequestId, 'Reconnect retries the same owner request');
    assert.notEqual(reconnected.coordination.run_id, fresh.coordination.run_id);
    assert.equal(page.apiRequests('/ai/chat').length, beforeRetry + 1, 'Bounded single retry');
    report.observations.reconnected = reconnected;
    await capture(page, 'reconnected');
    // Parent suspends the actual membership only after checking persisted state.
    await checkpoint('reconnected', { body: reconnected });

    const beforeRevoked = page.apiRequests('/ai/chat').length;
    await sendOwnerRequest(page);
    assert.ok(await page.waitFor('!!Q.byName("button", /^Войти по email$/) && document.body.innerText.includes("Сессия завершена")'));
    assert.equal(await page.eval('!!Q.composer()'), false);
    assert.ok(page.apiRequests('/ai/chat').slice(beforeRevoked).some((r) => [401, 403].includes(r.status)));
    assert.ok(page.apiRequests('/ai/chat').length - beforeRevoked <= 2, 'At most one auth retry');
    await capture(page, 'revoked');
    await checkpoint('revoked');

    const expiredPage = await newPage(origin);
    await login(expiredPage, input.expiredEmail);
    await sendOwnerRequest(expiredPage);
    const expired = await answer(expiredPage, 0, 'EXPIRED');
    assert.deepEqual(expired.recommendation.options.map((option) => option.key), ['c9.no_action']);
    report.observations.expired = expired;
    await capture(expiredPage, 'expired');
    await checkpoint('expired', { body: expired });
    for (const guard of guards) { assert.deepEqual(guard.blocked, []); assert.deepEqual(guard.errors, []); }
    for (const p of pages) assert.deepEqual(p.exceptions, [], 'No runtime exceptions');
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed'; report.failure = error.message;
    if (pages.length) {
      try { await capture(pages.at(-1), 'failure'); } catch { report.failureCapture = 'unavailable'; }
    }
    throw error;
  } finally {
    report.network = pages.flatMap((p) => [...p.requests.values()].map((r) => ({ method: r.method, path: new URL(r.url).pathname, status: r.status ?? null, failed: r.failed ?? null })));
    report.guards = guards;
    try {
      fs.writeFileSync(path.join(output, 'browser.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    } finally {
      await cleanup();
      process.off('SIGTERM', terminate); process.off('disconnect', terminate);
      if (process.connected) process.disconnect();
    }
  }
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url)
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
