// Current React, actual loopback HTTP. Only the relay drops one committed reply.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Browser } from '../../maya-chat-shell/test/cdp-verify.mjs';
import { trackOwnedChild } from '../../maya-saas-backend/scripts/conversation-qualification/owned-child-cleanup.mjs';
import { createPersonalProofServer } from './personal-owner-proof-server.mjs';
import { installGuard, localOrigin } from './history-erasure-browser-guard.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, label, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await read(); if (value) return value; await pause(50); }
  throw new Error('Timed out: ' + label);
}
function receive(type) {
  return new Promise((resolve, reject) => {
    const listener = value => { if (value?.type !== type) return; clearTimeout(timer); process.off('message', listener); resolve(value); };
    const timer = setTimeout(() => { process.off('message', listener); reject(new Error('Missing checkpoint: ' + type)); }, 20000);
    process.on('message', listener);
  });
}
async function checkpoint(name, data = {}) {
  const ack = receive('continue:' + name);
  process.send({ type: 'checkpoint', name, ...data });
  await ack;
}
async function click(page, name) {
  const expr = `Q.all('button').find(el => Q.visible(el) && !el.disabled && Q.name(el) === ${JSON.stringify(name)})`;
  assert.ok(await page.waitFor('!!(' + expr + ')'), 'Visible enabled button missing: ' + name);
  assert.equal(await page.click(expr), true);
}
const hasText = (page, text) => page.waitFor(`document.body.innerText.includes(${JSON.stringify(text)})`);
async function login(page, email) {
  const beforeStart = page.apiRequests('/auth/email/start').length;
  const beforeHistory = page.apiRequests('/ai/conversation').length;
  const beforeReceipts = page.apiRequests('/widgets/resolve').length;
  await click(page, 'Войти по email');
  assert.ok(await page.waitFor('!!Q.email()'));
  assert.equal(await page.fill('Q.email()', email), true);
  await click(page, 'Получить код');
  const req = await until(() => page.apiRequests('/auth/email/start').slice(beforeStart).find(r => r.finishedAt), 'real debug email start');
  assert.ok([200, 201].includes(req.status));
  const delivery = JSON.parse(await page.responseBody(req.requestId));
  assert.equal(delivery.delivery, 'debug');
  assert.match(delivery.debug_code, /^\d{4,8}$/);
  assert.ok(await page.waitFor('!!Q.code()'));
  assert.equal(await page.fill('Q.code()', delivery.debug_code), true);
  const nextLoginAt = Date.now() + (delivery.retry_after_seconds + 1) * 1000;
  delete delivery.debug_code;
  await click(page, 'Войти');
  await until(() => page.apiRequests('/ai/conversation').slice(beforeHistory).find(r => r.finishedAt && r.status === 200), 'actual restored conversation');
  const receipts = await until(() => page.apiRequests('/widgets/resolve').slice(beforeReceipts).find(r => r.finishedAt), 'actual historical receipt read');
  assert.equal(receipts.status, 200, 'Fixture must grant the existing widgets.runtime read feature');
  return nextLoginAt;
}

async function main() {
  assert.equal(process.connected, true, 'Use the owned history-erasure React proof runner');
  const started = receive('start'); process.send({ type: 'ready' });
  const input = await started;
  assert.ok(['prepare', 'resume'].includes(input.stage));
  assert.ok(path.isAbsolute(input.output));
  const output = path.join(input.output, input.stage + '-browser');
  fs.mkdirSync(output, { mode: 0o700 });
  let browser, relay, chrome, stopChrome, profile, page, guard;
  let cleanupPromise;
  let closing = false;
  const assertOpen = () => assert.equal(closing, false, 'Browser proof is closing');
  const cleanup = () => {
    closing = true;
    return cleanupPromise ??= (async () => {
      try { await browser?.close(); }
      finally {
        try { await stopChrome?.(); }
        finally {
          try { await relay?.close(); }
          finally { if (profile) fs.rmSync(profile, { recursive: true, force: true }); }
        }
      }
    })();
  };
  const terminate = () => { void cleanup().finally(() => process.exit(2)); };
  process.once('disconnect', terminate); process.once('SIGTERM', terminate); process.once('SIGINT', terminate);
  const observed = [];
  const report = { contract: 'maya.history-erasure-react-browser/1', stage: input.stage, status: 'running', actualReact: true, actualHttp: true, authentication: 'existing synthetic debug email', backend: 'compiled production entry, NODE_ENV=test', fixtureCoverage: 'synthetic text conversations and local unsent draft; no populated historical widget or receipt fixture', realModelAcceptance: false, productionConfiguration: false, screenshots: [], checks: {} };
  async function capture(name) {
    await page.send('Page.bringToFront');
    await page.eval('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))');
    const { data } = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(data, 'base64'), { flag: 'wx', mode: 0o600 });
    report.screenshots.push(name + '.png');
  }
  async function assertErasedView() {
    assert.ok(await hasText(page, input.survivorMarker), 'Another conversation must still be restored');
    assert.equal(await page.eval(`document.body.innerText.includes(${JSON.stringify(input.erasedMarker)})`), false);
    assert.equal(await page.eval(`Q.all('button[data-ref],button[data-personal-control]').filter(Q.visible).length`), 0);
    report.checks.erasedMarkerAbsent = true;
    report.checks.siblingConversationSurvives = true;
    report.checks.textOnlyFixtureHasNoActionControls = true;
  }
  try {
    relay = createPersonalProofServer({ root: path.join(root, 'dist/web'), backendOrigin: localOrigin(input.backendOrigin), historyErasureFault: {
      dropFirstCommittedResponse: input.stage === 'prepare',
      observe: value => { observed.push(value); process.send({ type: 'owner-completion', ...value }); },
    } });
    const { port } = await relay.listen(0);
    assertOpen();
    const origin = localOrigin(`http://127.0.0.1:${port}`);
    profile = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-erasure-chrome-'));
    fs.chmodSync(profile, 0o700);
    assertOpen();
    chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
      '--headless=new', '--js-flags=--max-old-space-size=256', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--metrics-recording-only',
      '--remote-debugging-port=0', '--user-data-dir=' + profile, '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--disable-quic', '--disable-features=OptimizationHints,MediaRouter', 'about:blank',
    ], { stdio: 'ignore' });
    stopChrome = trackOwnedChild(chrome);
    let spawnError; chrome.once('error', error => { spawnError = error; });
    const portFile = path.join(profile, 'DevToolsActivePort');
    await until(() => { if (spawnError) throw spawnError; assert.equal(chrome.exitCode, null); return fs.existsSync(portFile); }, 'Chrome readiness');
    assertOpen();
    const [cdpPort, wsPath] = fs.readFileSync(portFile, 'utf8').trim().split('\n');
    assert.match(cdpPort, /^\d+$/); assert.match(wsPath, /^\/devtools\/browser\/[a-f0-9-]+$/);
    browser = new Browser(chrome, profile, `ws://127.0.0.1:${cdpPort}${wsPath}`);
    let timer;
    try { await Promise.race([browser.connect(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('CDP connection timed out')), 10000); })]); }
    finally { clearTimeout(timer); }
    assertOpen();
    page = await browser.newPage();
    assertOpen();
    guard = await installGuard(page, origin, input.conversationId);
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await page.goto(origin + '/');
    const nextLoginAt = await login(page, input.email);
    if (input.stage === 'prepare') {
      assert.ok(await hasText(page, input.erasedMarker));
      assert.ok(await page.waitFor('Q.composer() && !Q.composer().readOnly'));
      assert.equal(await page.fill('Q.composer()', 'Synthetic private draft must be cleared'), true);
      assert.equal(await page.eval('Q.composer().value.length > 0'), true);
      await capture('before-erasure');
      await click(page, 'Приватность и данные');
      await click(page, 'Удалить текущий разговор');
      assert.equal(page.apiRequests('/privacy/').length, 0, 'Opening confirmation must not erase');
      await page.eval(`(() => { const input = Q.composer(); input.setSelectionRange(2, 12); const node = document.querySelector('section[aria-label="Приватность и данные"] p'); const range = document.createRange(); range.selectNodeContents(node); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); return true; })()`);
      await capture('confirmation');
      await click(page, 'Подтвердить удаление');
      assert.ok(await hasText(page, 'Удаление пока не подтверждено. Повторите тот же запрос вручную.'));
      assert.deepEqual(await page.eval(`(() => { const input = Q.composer(); return { value: input.value, start: input.selectionStart, end: input.selectionEnd, readOnly: input.readOnly, selected: window.getSelection().toString(), controls: [...input.parentElement.querySelectorAll('button')].map(b => b.disabled || b.getAttribute('aria-disabled') === 'true') }; })()`), { value: '', start: 0, end: 0, readOnly: true, selected: '', controls: [true, true] });
      report.checks.localDraftAndSelectionCleared = true;
      report.checks.composerAndVoiceBlockedWhileUncertain = true;
      assert.equal(observed.length, 1); assert.equal(observed[0].dropped, true);
      const first = page.apiRequests('/privacy/');
      assert.equal(first.length, 1, 'Uncertainty must not retry automatically');
      const firstBody = JSON.parse(first[0].postData);
      assert.equal(firstBody.requestId, observed[0].completed.requestId);
      assert.equal(observed[0].completed.conversationId, input.conversationId);
      await capture('uncertain');
      await checkpoint('uncertain', { completed: observed[0].completed });
      assert.equal(page.apiRequests('/privacy/').length, 1);
      // CDP only changes transport availability. It never fulfills a response
      // or changes an application result, request ID or server authority.
      await page.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      assert.equal(await page.eval('navigator.onLine'), false);
      const beforeOfflineRetry = page.apiRequests('/privacy/').length;
      await click(page, 'Повторить запрос');
      await until(() => page.apiRequests('/privacy/').slice(beforeOfflineRetry).some(r => r.failed), 'offline erasure transport failure');
      assert.ok(await hasText(page, 'Удаление пока не подтверждено. Повторите тот же запрос вручную.'));
      assert.equal(observed.length, 1, 'Offline retry must not reach the backend');
      for (const attempted of page.apiRequests('/privacy/')) assert.deepEqual(JSON.parse(attempted.postData), firstBody);
      await capture('offline-retry-uncertain');
      report.checks.offlineRetryDoesNotReachBackend = true;
      await page.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      assert.equal(await page.eval('navigator.onLine'), true);
      const beforeOnlineRetry = page.apiRequests('/privacy/').length;
      await click(page, 'Повторить запрос');
      assert.ok(await hasText(page, 'Текущий разговор удалён.'));
      const retries = page.apiRequests('/privacy/');
      assert.equal(retries.length, beforeOnlineRetry + 1);
      for (const attempted of retries) assert.deepEqual(JSON.parse(attempted.postData), firstBody);
      assert.equal(observed.length, 2); assert.equal(observed[1].dropped, false);
      assert.deepEqual(observed[1].completed, observed[0].completed);
      assert.equal(await page.eval(`document.body.innerText.includes(${JSON.stringify(input.erasedMarker)})`), false);
      report.checks.manualRetrySameRequest = true;
      report.checks.droppedResponseAfterCommittedDeletion = true;
      report.checks.sameCompletionTimestamp = true;
      await capture('completed');
      await checkpoint('completed', { completed: observed[1].completed, nextLoginAt });
      await page.goto(origin + '/');
      // Grants are memory-only. Reload requires a fresh real UI login and the
      // existing debug-email cooldown; do not resurrect an old grant or OTP.
      assert.ok(nextLoginAt - Date.now() < 90000);
      while (Date.now() < nextLoginAt) await pause(Math.min(1000, nextLoginAt - Date.now()));
      const nextLoginAfterReload = await login(page, input.email);
      await assertErasedView();
      assert.equal(page.apiRequests('/privacy/').length, retries.length, 'Reload must not repeat erasure');
      await capture('reloaded');
      await checkpoint('reloaded', { nextLoginAt: nextLoginAfterReload });
    } else {
      await assertErasedView();
      assert.equal(page.apiRequests('/privacy/').length, 0, 'New login restores history only');
      await capture('new-login-after-node-pg-restart');
      await checkpoint('resumed');
    }
    assert.deepEqual(guard.blocked, []); assert.deepEqual(guard.errors, []);
    assert.equal(page.apiRequests('/ai/chat').length, 0);
    assert.equal(page.apiRequests('/widgets/intent').length, 0);
    report.checks.noModelOrBusinessIntents = true;
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed'; report.failure = error.message;
    // Do not capture an auth screen, OTP, request bodies or console output.
    throw error;
  } finally {
    try {
      report.guard = guard ? { blocked: guard.blocked, errors: guard.errors } : null;
      // Status metadata only: never archive login bodies, headers, OTPs or bearer values.
      report.http = page ? page.apiRequests('').map(r => ({ path: new URL(r.url).pathname, method: r.method, status: r.status ?? null, failed: Boolean(r.failed) })) : [];
      // Owner completions explain transparent transport retries separately from
      // UI requests. Keep a bounded projection, never the upstream body itself.
      report.observedCompletions = {
        count: observed.length,
        droppedCount: observed.filter(value => value.dropped).length,
        truncated: observed.length > 16,
        entries: observed.slice(0, 16).map(({ completed, dropped }) => ({
          dropped,
          requestId: typeof completed.requestId === 'string' && completed.requestId.length === 36 ? completed.requestId : null,
          conversationId: typeof completed.conversationId === 'string' && completed.conversationId.length === 36 ? completed.conversationId : null,
          erasedAt: typeof completed.erasedAt === 'string' && completed.erasedAt.length <= 32 ? completed.erasedAt : null,
        })),
      };
      fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    } finally {
      try { await cleanup(); }
      finally { process.off('disconnect', terminate); process.off('SIGTERM', terminate); process.off('SIGINT', terminate); }
    }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
