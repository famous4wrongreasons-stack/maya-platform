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
import { installGuard, localOrigin, PROMPTS } from './booking-confirmation-browser-guard.mjs';

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
  const beforeHistory = page.apiRequests('/ai/conversation').length;
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
  await until(() => page.apiRequests('/ai/conversation').slice(beforeHistory).some((r) => r.finishedAt), 'fresh HTTP history');
  return Date.now() + (response.retry_after_seconds + 1) * 1000;
}
async function sendClientRequest(page, prompt) {
  const view = await snapshot(page);
  assert.ok(view.controls.some((control) => control.name === 'Сообщение для MAYA'));
  assert.equal(await page.fill('Q.composer()', prompt), true);
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
  assert.equal(process.connected, true, 'Use booking-confirmation-react.probe-spec.ts with a fresh owned proof directory');
  const pendingInput = receive('start');
  process.send({ type: 'ready' });
  const input = await pendingInput;
  const backendOrigin = localOrigin(input.backendOrigin);
  assert.ok(path.isAbsolute(input.output));
  const output = path.join(input.output, 'output', 'playwright');
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  const report = { contract: 'maya.booking-confirmation-browser/1', status: 'running', syntheticInternalCatalog: true, syntheticLocalProvider: true, syntheticA18Verifier: true, scriptedModel: true, realModelAcceptance: false, externalProviderAcceptance: false, snapshots: {}, observations: {} };
  let browser, dev, chromeChild, chromeProfile, activePage;
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
    // Re-authentication revisits earlier tabs. A background target's DOM may
    // be current while Chrome has not painted its text into the screenshot.
    await page.send('Page.bringToFront');
    // textContent includes the accessibility copy before the visible typewriter
    // finishes. Wait for actual reveal, then frame the latest text for pixels.
    assert.ok(await page.waitFor('!document.querySelector(".maya-typewriter-caret")'));
    await page.eval('Q.all("article.widget").at(-1)?.scrollIntoView({ block: "nearest" })');
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
    chromeProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-booking-confirmation-chrome-'));
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
    async function clickRef(page, ref) {
      const view = await page.eval('Q.all("button[data-ref]").filter(Q.visible).map(el => ({ref:el.dataset.ref,name:Q.name(el)}))');
      assert.ok(view.some(button => button.ref === ref), 'Server-selected control must be visibly rendered');
      const before = page.apiRequests('/widgets/intent').length;
      assert.equal(await page.click(`Q.all('button[data-ref]').find(el => Q.visible(el) && el.dataset.ref === ${JSON.stringify(ref)})`), true);
      const request = await until(() => page.apiRequests('/widgets/intent').slice(before).find(r => r.finishedAt), 'real widget intent');
      assert.equal(request.status, 200);
      return JSON.parse(await page.responseBody(request.requestId));
    }
    const selectEnvelope = async (page, envelope, effect, selected) => {
      assert.ok(await page.waitFor('!!Q.all("article.widget--live").find(Q.visible)'));
      const ref = effect === 'DRAFT' ? 'slot:' + selected : 'option:' + selected;
      return clickRef(page, ref);
    };
    const reloads = [];
    for (const scenario of input.scenarios) {
      const page = await newPage(origin);
      activePage = page;
      const nextLoginAt = await login(page, scenario.email);
      const before = page.apiRequests('/ai/chat').length;
      await sendClientRequest(page, PROMPTS.catalog);
      const response = await answer(page, before);
      let envelope = response.resolution?.receipt?.envelope;
      assert.equal(envelope?.kind, 'SERVICE_SELECTOR');
      const service = envelope.body.options.find(option => JSON.stringify(option).includes(scenario.serviceName));
      assert.ok(service, 'Expected public service must be present');
      let result = await selectEnvelope(page, envelope, 'REFINE', service.option_id);
      envelope = result.next_envelope;
      assert.equal(envelope?.kind, 'STAFF_SELECTOR');
      const staff = envelope.body.options.find(option => JSON.stringify(option).includes(scenario.staffName));
      assert.ok(staff, 'Expected public staff must be present');
      result = await selectEnvelope(page, envelope, 'REFINE', staff.option_id);
      envelope = result.next_envelope;
      assert.equal(envelope?.kind, 'TIME_SLOT_SELECTOR');
      const slot = envelope.body.groups.flatMap(group => group.slots)[0];
      assert.ok(slot);
      result = await selectEnvelope(page, envelope, 'DRAFT', slot.slot_ref);
      const confirmation = result.next_envelope;
      assert.equal(confirmation?.kind, 'BOOKING_CONFIRMATION');
      assert.equal(confirmation.body.staff_label.state, 'KNOWN');
      assert.equal(confirmation.body.staff_label.value, scenario.staffName);
      assert.ok(await page.waitFor(`Q.all('article.widget--live').some(el => Q.visible(el) && el.innerText.includes(${JSON.stringify(scenario.staffName)}) && el.innerText.includes(${JSON.stringify(scenario.serviceName)}))`));
      report.observations[scenario.key + 'Preview'] = { staffName: confirmation.body.staff_label.value, serviceName: scenario.serviceName, start: confirmation.body.when.value };
      await capture(page, scenario.key + '-preview');
      const previewText = report.snapshots[scenario.key + '-preview'].text;
      assert.ok(previewText.includes('Проверка записи'));
      assert.ok(previewText.includes('По данным системы записи'));
      assert.ok(report.snapshots[scenario.key + '-preview'].controls.some((control) => control.name === 'Подтвердить запись'));
      assert.doesNotMatch(previewText, /BOOKING_CONFIRMATION|Canonical booking owner|Confirm booking|Dismiss/);
      assert.equal(previewText.split(scenario.serviceName).length - 1, 1, 'Service label shown once');
      await checkpoint(scenario.key + '-preview', { confirmation, selectedStart: slot.start.value });
      const commit = confirmation.intents.find(intent => intent.effect === 'COMMIT');
      assert.ok(commit);
      result = await clickRef(page, 'intent:' + commit.intent_ref);
      report.observations[scenario.key + 'Result'] = result;
      const expectedText = scenario.key === 'success' ? 'Запись подтверждена.' : scenario.key === 'unknown' ? 'Запрос принят. Подтверждение ожидается.' : null;
      if (expectedText) assert.ok(await page.waitFor(`document.body.innerText.includes(${JSON.stringify(expectedText)})`));
      else assert.notEqual(result.receipt_outcome, 'ACCEPTED');
      if (scenario.key === 'unknown') assert.equal(result.owner_decision?.state, 'UNKNOWN');
      await capture(page, scenario.key + '-result');
      await checkpoint(scenario.key + '-result', { result });
      reloads.push({ page, scenario, commit, expectedText, nextLoginAt });
    }
    // The current web carrier keeps its grant in memory. A reload requires real
    // UI authentication again; respect the existing email cooldown unchanged.
    for (const { page, scenario, commit, expectedText, nextLoginAt } of reloads) {
      activePage = page;
      while (Date.now() < nextLoginAt) await pause(Math.min(1000, nextLoginAt - Date.now()));
      await page.goto(origin + '/');
      await login(page, scenario.email);
      const restored = page.apiRequests('/ai/conversation').filter(r => r.finishedAt).at(-1);
      report.observations[scenario.key + 'RestoredHistory'] = JSON.parse(await page.responseBody(restored.requestId));
      if (expectedText) assert.ok(await page.waitFor(`document.body.innerText.includes(${JSON.stringify(expectedText)})`), scenario.key + ': restored terminal text must be visible');
      if (scenario.key !== 'success') assert.equal(await page.eval('document.body.innerText.includes("Запись подтверждена.")'), false);
      if (scenario.key === 'unknown') {
        assert.equal(await page.eval(`Q.all('button[data-ref]').filter(Q.visible).some(el => el.dataset.ref === ${JSON.stringify('intent:' + commit.intent_ref)})`), false);
      }
      await capture(page, scenario.key + '-reload');
      const restoredText = report.snapshots[scenario.key + '-reload'].text;
      assert.equal(restoredText.split('Не все ответы сохранены.').length - 1, 1, 'One uncertainty warning for the restored page');
      assert.doesNotMatch(restoredText, /Choose service|Choose specialist|Review booking|Confirm booking/);
      await checkpoint(scenario.key + '-reload');
    }
    for (const guard of guards) { assert.deepEqual(guard.blocked, []); assert.deepEqual(guard.errors, []); }
    for (const p of pages) assert.deepEqual(p.exceptions, [], 'No runtime exceptions');
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed'; report.failure = error.message;
    if (activePage) {
      try { await capture(activePage, 'failure'); } catch { report.failureCapture = 'unavailable'; }
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
