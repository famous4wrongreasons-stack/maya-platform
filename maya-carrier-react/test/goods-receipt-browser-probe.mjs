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
import { installGuard, localOrigin, PROMPTS } from './goods-receipt-browser-guard.mjs';

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
  // Native keyboard activation avoids sampling pointer coordinates while the
  // detail drawer scrolls. This still dispatches real browser input, not el.click().
  assert.equal(await page.focus(`(Q.all('dialog[open] button').find(el => Q.visible(el) && Q.name(el) === ${JSON.stringify(name)}) ?? Q.all('button').find(el => Q.visible(el) && Q.name(el) === ${JSON.stringify(name)}))`), true);
  await page.press('Enter');
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
  assert.ok(await page.waitFor(`document.body.innerText.includes('Предыдущая переписка восстановлена.') && !!Q.composer() && !Q.composer().readOnly && Q.composer().getAttribute('aria-disabled') !== 'true'`), 'History application must finish before typing');
  return Date.now() + (response.retry_after_seconds + 1) * 1000;
}
async function sendOwnerRequest(page, prompt) {
  const view = await snapshot(page);
  assert.ok(view.controls.some((control) => control.name === 'Сообщение для MAYA'));
  assert.equal(await page.fill('Q.composer()', prompt), true);
  assert.ok(await page.waitFor('Q.composer()?.value === ' + JSON.stringify(prompt)), 'The real composer must contain the requested prompt');
  await clickNamed(page, 'Отправить');
}
async function answer(page, before) {
  const request = await until(() => page.apiRequests('/ai/chat').slice(before).find(r => r.finishedAt && r.status === 201), 'combined real chat response');
  const body = JSON.parse(await page.responseBody(request.requestId));
  const expected = body.reply.replace(/\s+/g, ' ').trim();
  assert.ok(await page.waitFor(`Q.all('[data-chat-message="maya"]').at(-1)?.textContent.replace(/^MAYA: /, '').replace(/\\s+/g, ' ').trim() === ${JSON.stringify(expected)}`));
  return body;
}

async function main() {
  assert.equal(process.connected, true, 'Use goods-ui.probe-spec.ts with a fresh owned proof directory');
  const pendingInput = receive('start');
  process.send({ type: 'ready' });
  const input = await pendingInput;
  const backendOrigin = localOrigin(input.backendOrigin);
  assert.ok(path.isAbsolute(input.output));
  const output = path.join(input.output, 'output', 'playwright');
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  const report = { contract: 'maya.goods-receipt-browser/1', status: 'running', syntheticCrmFetch: true, scriptedModel: true, realModelAcceptance: false, externalProviderAcceptance: false, snapshots: {}, observations: {} };
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
    chromeProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-goods-receipt-chrome-'));
    fs.chmodSync(chromeProfile, 0o700);
    chromeChild = spawn(chrome, [
      '--headless=new', '--js-flags=--max-old-space-size=256', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
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
    assert.equal(page.apiRequests('/ai/chat').length, 0, 'History restore never executes chat');
    await capture(page, 'restart-history');
    for (const key of ['success', 'reject', 'unknown']) {
      await checkpoint('prepare-' + key);
      const before = page.apiRequests('/ai/chat').length;
      await sendOwnerRequest(page, PROMPTS[key]);
      const req = await until(() => page.apiRequests('/ai/chat').slice(before).find(r => r.finishedAt), 'goods chat response');
      assert.equal(req.status, 201);
      const response = JSON.parse(await page.responseBody(req.requestId));
      assert.equal(response.action?.status, 'approval_required');
      assert.equal(response.resolution?.receipt?.envelope?.source?.capability, 'inventory.goods.receipt.prepare');
      const envelope = response.resolution.receipt.envelope;
      assert.ok(await page.waitFor('document.body.innerText.includes("25.625")'), 'Exact fractional total is visible');
      assert.equal((await snapshot(page)).text.includes('approval_ref'), false, 'No raw approval JSON in user copy');
      await capture(page, key + '-preview');
      if (key === 'success') {
        const view = await snapshot(page);
        const detail = view.controls.filter(c => c.tag === 'BUTTON' && c.name.startsWith('Подробности прихода')).at(-1);
        assert.ok(detail); await clickNamed(page, detail.name);
        assert.ok(await page.waitFor(`!!Q.all('dialog[open] button').find(el => Q.visible(el) && Q.name(el).startsWith('Подтвердить приход'))`), 'Loaded goods detail must replace the progress drawer');
        await capture(page, 'detail');
      }
      const view = await snapshot(page);
      const label = key === 'reject' ? 'Отклонить приход' : 'Подтвердить приход';
      const button = view.controls.filter(c => c.tag === 'BUTTON' && c.name.startsWith(label)).at(-1);
      assert.ok(button, 'Visible goods decision');
      const calls = page.apiRequests('/widgets/intent').length;
      await clickNamed(page, button.name);
      const sent = await until(() => page.apiRequests('/widgets/intent').slice(calls).find(r => r.finishedAt), 'goods decision response');
      assert.equal(sent.status, 200);
      const outcome = JSON.parse(await page.responseBody(sent.requestId));
      assert.equal(outcome.owner_decision?.state, {success:'SUCCEEDED',reject:'REJECTED',unknown:'UNKNOWN'}[key]);
      const sentence = {success:'Приход товара подтверждён в YCLIENTS.',reject:'Приход отклонён. Изменений в складе нет.',unknown:'Результат прихода не подтверждён.'}[key];
      assert.ok(await page.waitFor('document.body.innerText.includes(' + JSON.stringify(sentence) + ')'));
      await capture(page, key + '-outcome');
      report.observations[key] = {state:outcome.owner_decision.state, approvalIdIsNotAe: outcome.owner_decision.outcome ? outcome.owner_decision.outcome.action_execution_id !== response.action.approval.id : null, shownExactTotal:'25.625'};
      assert.equal(page.apiRequests('/widgets/intent').length, calls + 1);
      await checkpoint(key);
      // Close a result drawer using actual rendered chrome when it remains visible.
      const close = await page.eval(`Q.all('dialog[open] button').filter(Q.visible).map(el=>({name:Q.name(el)}))`);
      const closeButton = close.find(c=>/Закрыть|Назад/.test(c.name));
      if (closeButton) await clickNamed(page,closeButton.name);
      assert.equal(envelope.body.effect_preview.find(r=>r.label.phrase_key==='approval.goods_receipt.line_total').value.value,'25.625');
    }
    const beforeReload = page.apiRequests('/widgets/intent').length, beforeChat = page.apiRequests('/ai/chat').length;
    await page.goto(origin + '/');
    while (Date.now() < nextLoginAt) await pause(Math.min(1000, nextLoginAt - Date.now()));
    await login(page, input.ownerEmail);
    await until(() => page.apiRequests('/ai/conversation').filter(r=>r.finishedAt).length >= 2, 'reload history');
    assert.equal(page.apiRequests('/widgets/intent').length,beforeReload);
    assert.equal(page.apiRequests('/ai/chat').length,beforeChat);
    await capture(page,'reload'); await checkpoint('reload');
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
