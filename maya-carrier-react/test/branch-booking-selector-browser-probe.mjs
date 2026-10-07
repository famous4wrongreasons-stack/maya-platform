// Explicit opt-in child of the owned HTTP/PG probe. Uses the production React
// web bundle and real HTTP only; no page routes, response fixtures or token seed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Browser } from '../../maya-chat-shell/test/cdp-verify.mjs';
import { createPersonalProofServer } from './personal-owner-proof-server.mjs';
import { installGuard, localOrigin, PROMPTS, typedPrompt } from './branch-booking-selector-browser-guard.mjs';

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
  const beforeWidgets = page.apiRequests('/widgets/resolve').length;
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
  await until(() => page.apiRequests('/widgets/resolve').slice(beforeWidgets).some(r => r.finishedAt && r.status === 200), 'HTTP widget history');
  await page.eval('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))');
  return Date.now() + (response.retry_after_seconds + 1) * 1000;
}
async function sendClientRequest(page, prompt) {
  const view = await snapshot(page);
  assert.ok(view.controls.some((control) => control.name === 'Сообщение для MAYA'));
  assert.equal(await page.fill('Q.composer()', prompt), true);
  assert.ok(await page.waitFor('!!Q.byName("button", /^Отправить$/) && !Q.byName("button", /^Отправить$/).disabled'));
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
  assert.equal(process.connected, true, 'Use the owned branch-booking-selector-proof.mjs --browser driver');
  const pendingInput = receive('start');
  process.send({ type: 'ready' });
  const input = await pendingInput;
  const backendOrigin = localOrigin(input.backendOrigin);
  assert.ok(path.isAbsolute(input.output));
  const output = path.join(input.output, 'output', 'playwright');
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  const report = { contract: 'maya.branch-booking-selector-browser/1', status: 'running', nativeYclientsAdapter: true, syntheticProviderTransport: true, syntheticA18Verifier: true, scriptedModel: true, realModelAcceptance: false, externalProviderAcceptance: false, snapshots: {}, observations: {} };
  assert.equal(input.scenarios.length, 5);
  const scope = { emails: input.scenarios.map(s => s.email), branchIds: input.scenarios.flatMap(s => [s.branchId, s.otherBranchId]), days: input.scenarios.flatMap(s => [s.day, s.alternateDay]), prompts: [PROMPTS.personal, ...input.scenarios.filter(s => s.mode === 'typed').map(typedPrompt)] };
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
    guards.push(await installGuard(page, origin, scope));
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await page.goto(origin + '/');
    return page;
  }
  try {
    dev = createPersonalProofServer({ root: path.join(root, 'dist/web'), backendOrigin });
    const { port } = await dev.listen(0);
    const origin = localOrigin(`http://127.0.0.1:${port}`);
    report.carrierOrigin = origin;
    // Fail closed for Chrome background traffic as well as the page Fetch guard.
    // The controller's own CDP socket is separate from browser page requests.
    assert.equal(closing, undefined, 'Acceptance cancelled before Chrome startup');
    chromeProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-branch-selector-chrome-'));
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
    const publicResult = result => ({ outcome: result.outcome ?? null, code: result.code ?? null, receiptOutcome: result.receipt_outcome ?? null, ownerState: result.owner_decision?.state ?? null, hasSuccessor: result.next_envelope != null });
    const requests = (page, pathname) => [...page.requests.values()].filter(r => new URL(r.url).pathname === '/api' + pathname);
    const createCount = page => requests(page, '/personal-client/appointments').length;
    const liveRef = (page, ref) => page.eval(`Q.all('button[data-ref]').filter(el => Q.visible(el) && !el.disabled).some(el => el.dataset.ref === ${JSON.stringify(ref)})`);
    const personalSection = 'Q.all("dialog[open] section").find(el => Q.visible(el) && el.getAttribute("aria-label") === "Личная запись")';
    async function personalChoice(page, name) {
      const expression = `Q.all('dialog[open] button[data-personal-control]').find(el => Q.visible(el) && !el.disabled && Q.name(el) === ${JSON.stringify(name)})`;
      assert.ok(await page.waitFor('!!(' + expression + ')'), 'Enabled personal choice missing: ' + name);
      assert.equal(await page.click(expression), true);
      assert.ok(await page.waitFor('(' + expression + ')?.getAttribute("aria-pressed") === "true"'));
    }
    async function selected(page, expectedNames, expectedDate) {
      const actual = await page.eval(`({names: Q.all('dialog[open] button[data-personal-control][aria-pressed="true"]').filter(Q.visible).map(Q.name), date: Q.all('dialog[open] input[data-personal-control]').find(Q.visible)?.value})`);
      assert.deepEqual(actual.names.sort(), [...expectedNames].sort()); assert.equal(actual.date, expectedDate);
      assert.equal(await page.eval('!!Q.byName("button", /^Подтвердить личную запись$/)'), false, 'Editing invalidates the prior preview');
    }
    async function openPersonal(page) {
      const before = page.apiRequests('/ai/chat').length;
      await sendClientRequest(page, PROMPTS.personal);
      const response = await answer(page, before);
      const envelope = response.resolution?.receipt?.envelope;
      assert.equal(envelope?.kind, 'SERVICE_SELECTOR');
      const intent = envelope.intents.find(i => i.effect === 'NAVIGATE' && i.target?.ref === 'fs.booking');
      assert.ok(intent, 'Canonical catalog read offers personal navigation');
      const child = await clickRef(page, 'intent:' + intent.intent_ref);
      assert.equal(child.receipt_outcome, 'ACCEPTED');
      assert.equal(child.next_envelope.correlation.parent_widget_id, envelope.widget_id);
      assert.equal(child.next_envelope.intents.some(i => ['COMMIT', 'DRAFT', 'NAVIGATE', 'REFINE'].includes(i.effect)), false);
      assert.ok(await page.waitFor('!!(' + personalSection + ')'));
      assert.ok(await page.waitFor('document.body.innerText.includes("Запись для вашего подтверждённого")'));
    }
    async function personalPreview(page, scenario, expectedSelection) {
      const beforeSlots = requests(page, '/available-slots').length;
      await clickNamed(page, 'Показать свободное время');
      const slotsRequest = await until(() => requests(page, '/available-slots').slice(beforeSlots).find(r => r.finishedAt), 'branch-qualified HTTP slots');
      assert.equal(slotsRequest.status, 200);
      const query = new URL(slotsRequest.url).searchParams;
      assert.equal(query.get('branchId'), scenario.branchId);
      assert.equal(query.get('serviceIds'), expectedSelection.serviceIds[0]);
      assert.equal(query.get('staffId'), expectedSelection.staffId);
      assert.equal(query.get('date'), expectedSelection.date);
      const slots = JSON.parse(await page.responseBody(slotsRequest.requestId));
      assert.ok(slots.length > 0); assert.ok(slots.every(slot => slot.branch_id === scenario.branchId));
      const slot = slots.find(slot => slot.staff_id === expectedSelection.staffId); assert.ok(slot);
      const label = new Intl.DateTimeFormat('ru', { timeZone: scenario.timezone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(slot.start)) + ` (${scenario.timezone})`;
      const beforePreview = requests(page, '/personal-client/appointments/preview').length;
      await clickNamed(page, label);
      const previewRequest = await until(() => requests(page, '/personal-client/appointments/preview').slice(beforePreview).find(r => r.finishedAt), 'current personal preview');
      assert.ok([200, 201].includes(previewRequest.status));
      const selection = JSON.parse(previewRequest.postData);
      assert.deepEqual(selection, { staffId: expectedSelection.staffId, serviceIds: expectedSelection.serviceIds, branchId: scenario.branchId, start: slot.start });
      assert.ok(await page.waitFor('!!Q.byName("button", /^Подтвердить личную запись$/)'));
      const text = await page.eval('(' + personalSection + ').innerText');
      assert.ok(text.includes(scenario.branchName)); assert.ok(text.includes(scenario.timezone));
      return selection;
    }
    const reloads = [];
    for (const scenario of input.scenarios) {
      assert.ok(['typed', 'personal'].includes(scenario.mode));
      assert.ok((scenario.mode === 'typed' ? ['success', 'removed', 'unknown'] : ['success', 'changed']).includes(scenario.key));
      const id = scenario.mode + '-' + scenario.key;
      const page = await newPage(origin); activePage = page;
      const nextLoginAt = await login(page, scenario.email);
      if (scenario.mode === 'typed') {
        const before = page.apiRequests('/ai/chat').length;
        await sendClientRequest(page, typedPrompt(scenario));
        const response = await answer(page, before);
        const envelope = response.resolution?.receipt?.envelope;
        assert.equal(envelope?.kind, 'TIME_SLOT_SELECTOR', 'Real scoped chat must emit its native availability selector');
        const slot = envelope.body.groups.flatMap(group => group.slots)[0]; assert.ok(slot);
        assert.ok(await page.waitFor(`Q.all('article.widget--live').some(el => Q.visible(el) && el.innerText.includes(${JSON.stringify(scenario.timezone)}))`));
        const draft = await clickRef(page, 'slot:' + slot.slot_ref);
        assert.equal(draft.receipt_outcome, 'ACCEPTED');
        const confirmation = draft.next_envelope;
        assert.equal(confirmation?.kind, 'BOOKING_CONFIRMATION');
        assert.equal(confirmation.body.staff_label.value, scenario.staffName);
        assert.ok(await page.waitFor(`Q.all('article.widget--live').some(el => Q.visible(el) && el.innerText.includes(${JSON.stringify(scenario.staffName)}) && el.innerText.includes(${JSON.stringify(scenario.serviceName)}) && el.innerText.includes(${JSON.stringify(scenario.timezone)}))`));
        await capture(page, id + '-preview');
        report.observations[id + 'Preview'] = { branchName: scenario.branchName, timezone: scenario.timezone, staffName: scenario.staffName, serviceName: scenario.serviceName, selectedStart: slot.start.value };
        await checkpoint(id + '-preview', { confirmation, selectedStart: slot.start.value });
        const commit = confirmation.intents.find(i => i.effect === 'COMMIT'); assert.ok(commit);
        const result = await clickRef(page, 'intent:' + commit.intent_ref);
        report.observations[id + 'Result'] = publicResult(result);
        if (scenario.key === 'success') {
          assert.equal(result.receipt_outcome, 'ACCEPTED'); assert.equal(result.owner_decision?.state, 'SUCCEEDED');
          assert.ok(await page.waitFor('document.body.innerText.includes("Запись подтверждена.")'));
        } else if (scenario.key === 'unknown') {
          assert.equal(result.owner_decision?.state, 'UNKNOWN');
          assert.ok(await page.waitFor('document.body.innerText.includes("Результат пока не подтверждён. Не отправляйте повторно.")'));
          assert.equal(await page.eval('document.body.innerText.includes("Запись подтверждена.")'), false);
        } else {
          assert.notEqual(result.receipt_outcome, 'ACCEPTED'); assert.equal(result.next_envelope ?? null, null);
          assert.equal(await page.eval('document.body.innerText.includes("Запись подтверждена.")'), false);
        }
        assert.ok(await page.waitFor(`!Q.all('button[data-ref]').filter(el => Q.visible(el) && !el.disabled).some(el => el.dataset.ref === ${JSON.stringify('intent:' + commit.intent_ref)})`), 'Consumed/refused COMMIT cannot remain actionable');
        await capture(page, id + '-result'); await checkpoint(id + '-result', { result: publicResult(result) });
        reloads.push({ page, scenario, id, nextLoginAt, commitRef: 'intent:' + commit.intent_ref });
      } else {
        await openPersonal(page);
        const branchLabel = scenario.branchName + ' · ' + scenario.timezone;
        const otherBranchLabel = scenario.otherBranchName + ' · ' + scenario.timezone;
        await personalChoice(page, branchLabel); await personalChoice(page, scenario.serviceName); await personalChoice(page, scenario.staffName);
        assert.equal(await page.fill('Q.all("dialog[open] input[data-personal-control]").find(Q.visible)', scenario.day), true);
        await selected(page, [branchLabel, scenario.serviceName, scenario.staffName], scenario.day);
        await personalPreview(page, scenario, { serviceIds: ['81'], staffId: '71', date: scenario.day });
        assert.equal(createCount(page), 0);
        await clickNamed(page, 'Изменить выбор');
        await selected(page, [branchLabel, scenario.serviceName, scenario.staffName], scenario.day);
        await personalChoice(page, otherBranchLabel);
        await selected(page, [otherBranchLabel, scenario.serviceName, scenario.staffName], scenario.day);
        await personalChoice(page, branchLabel);
        await selected(page, [branchLabel, scenario.serviceName, scenario.staffName], scenario.day);
        await personalChoice(page, scenario.otherServiceName);
        await selected(page, [branchLabel, scenario.otherServiceName, scenario.staffName], scenario.day);
        await personalChoice(page, scenario.otherStaffName);
        await selected(page, [branchLabel, scenario.otherServiceName, scenario.otherStaffName], scenario.day);
        assert.equal(await page.fill('Q.all("dialog[open] input[data-personal-control]").find(Q.visible)', scenario.alternateDay), true);
        await selected(page, [branchLabel, scenario.otherServiceName, scenario.otherStaffName], scenario.alternateDay);
        const selection = await personalPreview(page, scenario, { serviceIds: ['82'], staffId: '72', date: scenario.alternateDay });
        await capture(page, id + '-preview');
        report.observations[id + 'Preview'] = { branchName: scenario.branchName, timezone: scenario.timezone, serviceName: scenario.otherServiceName, staffName: scenario.otherStaffName, date: scenario.alternateDay, preservedEachOtherParameter: true, priorPreviewDiscarded: true };
        await checkpoint(id + '-preview', { selection, selectedStart: selection.start });
        const createsBefore = createCount(page);
        await clickNamed(page, 'Подтвердить личную запись');
        const created = await until(() => requests(page, '/personal-client/appointments').slice(createsBefore).find(r => r.finishedAt), 'personal create outcome');
        const expected = scenario.key === 'success' ? 'Запись подтверждена.' : 'Предложение изменилось';
        assert.ok(await page.waitFor(`document.body.innerText.includes(${JSON.stringify(expected)})`));
        assert.equal(created.status, scenario.key === 'success' ? 201 : 409);
        assert.equal(createCount(page), createsBefore + 1);
        assert.equal(await page.eval('!!Q.byName("button", /^Подтвердить личную запись$/)'), false);
        if (scenario.key !== 'success') assert.equal(await page.eval('document.body.innerText.includes("Запись подтверждена.")'), false);
        const result = { status: created.status, stateSummary: scenario.key === 'success' ? 'CORRELATED_SUCCEEDED' : 'STALE_PREVIEW_REFUSED' };
        report.observations[id + 'Result'] = result;
        await capture(page, id + '-result'); await checkpoint(id + '-result', result);
        const beforeResults = requests(page, '/personal-client/appointments/results').length;
        await clickNamed(page, 'Проверить результат');
        await until(() => requests(page, '/personal-client/appointments/results').slice(beforeResults).some(r => r.finishedAt && r.status === 200), 'manual read-only result');
        assert.equal(createCount(page), createsBefore + 1);
        reloads.push({ page, scenario, id, nextLoginAt });
      }
    }
    for (const { page, scenario, id, nextLoginAt, commitRef } of reloads) {
      activePage = page;
      const intentsBefore = requests(page, '/widgets/intent').length, createsBefore = createCount(page);
      while (Date.now() < nextLoginAt) await pause(Math.min(1000, nextLoginAt - Date.now()));
      await page.goto(origin + '/'); await login(page, scenario.email);
      assert.equal(requests(page, '/widgets/intent').length, intentsBefore, 'Reload/history never repeats an intent');
      assert.equal(createCount(page), createsBefore, 'Reload never repeats a personal create');
      if (scenario.mode === 'typed') {
        assert.equal(await liveRef(page, commitRef), false);
        if (scenario.key === 'success') assert.ok(await page.waitFor('document.body.innerText.includes("Запись подтверждена.")'));
        else {
          assert.equal(await page.eval('document.body.innerText.includes("Запись подтверждена.")'), false);
          if (scenario.key === 'unknown') assert.ok(await page.waitFor('document.body.innerText.includes("Результат пока не подтверждён")'));
        }
      } else {
        await openPersonal(page);
        assert.equal(createCount(page), createsBefore);
        assert.equal(await page.eval('!!Q.byName("button", /^Подтвердить личную запись$/)'), false);
        assert.equal(await page.eval('document.body.innerText.includes("Запись подтверждена.")'), false, 'New transient form does not fabricate prior success');
      }
      report.observations[id + 'Reload'] = { noCreateReplay: true, noAutomaticIntent: true, currentFormHasNoOldConfirmation: true };
      await capture(page, id + '-reload'); await checkpoint(id + '-reload');
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
