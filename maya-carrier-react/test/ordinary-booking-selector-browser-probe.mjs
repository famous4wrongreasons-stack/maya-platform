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
import { installGuard, localOrigin, ordinaryPrompts } from './ordinary-booking-selector-browser-guard.mjs';

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
  assert.equal(process.connected, true, 'Use the owned branch-booking-selector-proof.mjs --ordinary --browser driver');
  const pendingInput = receive('start');
  process.send({ type: 'ready' });
  const input = await pendingInput;
  const backendOrigin = localOrigin(input.backendOrigin);
  assert.ok(path.isAbsolute(input.output));
  const output = path.join(input.output, 'output', 'playwright');
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  const report = { contract: 'maya.ordinary-booking-selector-browser/1', status: 'running', nativeYclientsAdapter: true, syntheticProviderTransport: true, syntheticA18Verifier: true, scriptedModel: true, realModelAcceptance: false, externalProviderAcceptance: false, snapshots: {}, observations: {} };
  assert.equal(input.scenarios.length, 3);
  const scope = { emails: input.scenarios.map(s => s.email), prompts: input.scenarios.flatMap(s => Object.values(ordinaryPrompts(s))) };
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
    dev = createDevServer({ root: path.join(root, 'dist/web'), api: backendOrigin + '/api', upstreamPorts: [new URL(backendOrigin).port] });
    const { port } = await dev.listen(0);
    const origin = localOrigin(`http://127.0.0.1:${port}`);
    report.carrierOrigin = origin;
    // Fail closed for Chrome background traffic as well as the page Fetch guard.
    // The controller's own CDP socket is separate from browser page requests.
    assert.equal(closing, undefined, 'Acceptance cancelled before Chrome startup');
    chromeProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-ordinary-booking-chrome-'));
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
      assert.ok(await page.waitFor(`Q.all('button[data-ref]').some(el => Q.visible(el) && !el.disabled && el.dataset.ref === ${JSON.stringify(ref)})`));
      const view = await page.eval('Q.all("button[data-ref]").filter(Q.visible).map(el => ({ref:el.dataset.ref,name:Q.name(el)}))');
      assert.ok(view.some(button => button.ref === ref), 'Server-selected control must be visibly rendered');
      const before = page.apiRequests('/widgets/intent').length;
      assert.equal(await page.click(`Q.all('button[data-ref]').filter(el => Q.visible(el) && !el.disabled && el.dataset.ref === ${JSON.stringify(ref)}).at(-1)`), true);
      const request = await until(() => page.apiRequests('/widgets/intent').slice(before).find(r => r.finishedAt), 'real widget intent');
      assert.equal(request.status, 200);
      return JSON.parse(await page.responseBody(request.requestId));
    }
    const publicResult = result => ({ outcome: result.outcome ?? null, code: result.code ?? null, stoppedAtGate: result.stopped_at_gate ?? null, receiptOutcome: result.receipt_outcome ?? null, ownerState: result.owner_decision?.state ?? null, hasSuccessor: result.next_envelope != null });
    const pendingQuestion = 'На какую дату проверить время у выбранного мастера?';
    const requests = (page, pathname) => [...page.requests.values()].filter(r => new URL(r.url).pathname === '/api' + pathname);
    async function ask(page, prompt) {
      const before = page.apiRequests('/ai/chat').length;
      const replies = await page.eval('Q.all(\'[data-chat-message="maya"]\').length');
      await sendClientRequest(page, prompt);
      const result = await answer(page, before);
      const calls = page.apiRequests('/ai/chat').slice(before);
      assert.equal(calls.length, 1, 'One typed correction makes one actual chat request');
      const sent = JSON.parse(await page.postData(calls[0]));
      assert.deepEqual(sent.messages.at(-1), { role: 'user', content: prompt });
      assert.ok(await page.waitFor(`Q.all('[data-chat-message="maya"]').length === ${replies + 1}`));
      return result;
    }
    const replyEnvelope = reply => reply.resolution?.receipt?.envelope;
    async function selectOption(page, envelope, name) {
      const option = envelope.body.options.find(option => option.label?.value === name || option.label?.label === name);
      assert.ok(option, 'Server selector must contain the named synthetic fixture choice');
      return clickRef(page, 'option:' + option.option_id);
    }
    const localDay = (start, timezone) => {
      const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(start));
      return ['year', 'month', 'day'].map(key => parts.find(part => part.type === key).value).join('-');
    };
    const localClock = (start, timezone) => new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(new Date(start));
    async function times(page, scenario, prompt, day, step, requestedTime) {
      const result = await ask(page, prompt), envelope = replyEnvelope(result);
      assert.equal(envelope?.kind, 'TIME_SLOT_SELECTOR', 'Fresh complete preferences must reach current availability');
      assert.equal(envelope.body.timezone, scenario.timezone);
      const slots = envelope.body.groups.flatMap(group => group.slots); assert.ok(slots.length > 0);
      assert.ok(slots.every(slot => localDay(slot.start.value, scenario.timezone) === day));
      if (requestedTime !== undefined) assert.ok(slots.every(slot => localClock(slot.start.value, scenario.timezone) === requestedTime), 'Every returned source slot must honor the current exact clock');
      assert.ok(await page.waitFor(`Q.all('button[data-ref]').some(el => Q.visible(el) && el.dataset.ref === ${JSON.stringify('slot:' + slots[0].slot_ref)})`));
      if (requestedTime !== undefined) {
        const firstRef = JSON.stringify('slot:' + slots[0].slot_ref);
        assert.ok(await page.waitFor(`(() => {
          const card=Q.all('button[data-ref]').filter(el=>Q.visible(el) && !el.disabled && el.dataset.ref===${firstRef}).at(-1)?.closest('article');
          const refs=card ? [...card.querySelectorAll('button[data-ref]')].filter(el=>Q.visible(el) && el.dataset.ref.startsWith('slot:')).map(el=>el.dataset.ref).sort() : [];
          return JSON.stringify(refs)===${JSON.stringify(JSON.stringify(slots.map(slot=>'slot:'+slot.slot_ref).sort()))};
        })()`), 'The fresh selector with the returned source slots must render');
        const visibleSlots = await page.eval(`(() => {
          const card = Q.all('button[data-ref]').filter(el => Q.visible(el) && !el.disabled && el.dataset.ref === ${firstRef}).at(-1)?.closest('article');
          return card ? [...card.querySelectorAll('button[data-ref]')].filter(el => Q.visible(el) && el.dataset.ref.startsWith('slot:')).map(el => ({ ref:el.dataset.ref, name:Q.name(el) })) : [];
        })()`);
        assert.deepEqual(visibleSlots.map(slot => slot.ref).sort(), slots.map(slot => 'slot:' + slot.slot_ref).sort(), 'Actual rendered selector exposes exactly the returned source slots');
        assert.ok(visibleSlots.every(slot => slot.name.includes(requestedTime)), 'The visible controls show the corrected local time');
      }
      const name = scenario.key + '-' + step;
      await capture(page, name);
      report.observations[name] = { currentSourceRead: true, timezone: scenario.timezone, day, slotCount: slots.length,
        ...(requestedTime === undefined ? {} : { requestedTime, renderedSlotsMatchSource: true, typedChatRequests: 1 }) };
      await checkpoint(name, { widgetId: envelope.widget_id, selectedStart: slots[0].start.value,
        ...(requestedTime === undefined ? {} : { requestedTime }) });
      return envelope;
    }
    const sessions = [];
    for (const scenario of input.scenarios) {
      assert.ok(['success', 'unknown', 'stale'].includes(scenario.key));
      const page = await newPage(origin); activePage = page;
      const nextLoginAt = await login(page, scenario.email), prompts = ordinaryPrompts(scenario);
      const response = await ask(page, prompts.initial), service = replyEnvelope(response);
      assert.equal(service?.kind, 'SERVICE_SELECTOR', 'Ordinary request without a service begins at the live catalog');
      const selected = await selectOption(page, service, scenario.serviceName);
      assert.equal(selected.receipt_outcome, 'ACCEPTED');
      const staff = selected.next_envelope; assert.equal(staff?.kind, 'STAFF_SELECTOR');
      const staffOption = staff.body.options.find(option => option.label?.value === scenario.staffName || option.label?.label === scenario.staffName); assert.ok(staffOption);
      assert.ok(await page.waitFor(`Q.all('button[data-ref]').some(el => Q.visible(el) && el.dataset.ref === ${JSON.stringify('option:' + staffOption.option_id)})`));
      assert.equal(requests(page, '/personal-client/appointments').length, 0);
      await capture(page, scenario.key + '-selection');
      report.observations[scenario.key + 'Selection'] = { initialRequest: prompts.initial, selectedService: scenario.serviceName, unfinishedAt: 'STAFF_SELECTOR', noBookingClaim: true };
      await checkpoint(scenario.key + '-selection', { widgetId: staff.widget_id });
      sessions.push({ page, scenario, prompts, nextLoginAt, previousStaffId: staff.widget_id, oldStaffRef: 'option:' + staffOption.option_id });
    }
    const reloads = [];
    for (const session of sessions) {
      const { page, scenario, prompts, previousStaffId, oldStaffRef } = session; activePage = page;
      const beforeResumeIntents = requests(page, '/widgets/intent').length;
      while (Date.now() < session.nextLoginAt) await pause(Math.min(1000, session.nextLoginAt - Date.now()));
      await page.goto(origin + '/');
      const nextLoginAt = await login(page, scenario.email);
      assert.equal(requests(page, '/widgets/intent').length, beforeResumeIntents, 'Unfinished selection reload never automatically selects or commits');
      assert.equal(await page.eval(`Q.all('button[data-ref]').filter(el => Q.visible(el) && !el.disabled).some(el => el.dataset.ref === ${JSON.stringify(oldStaffRef)})`), false, 'Historical selector is not revived');
      assert.equal(await page.eval('document.body.innerText.includes("Запись подтверждена.")'), false);
      const resumed = replyEnvelope(await ask(page, prompts.resume));
      assert.equal(resumed?.kind, 'STAFF_SELECTOR'); assert.notEqual(resumed.widget_id, previousStaffId, 'Explicit continuation revalidates and emits a fresh selector');
      await capture(page, scenario.key + '-resumed');
      report.observations[scenario.key + 'Resumed'] = { restoredUnfinishedControl: false, explicitResumeRequired: true, newSelector: true, frontendAuthority: false };
      await checkpoint(scenario.key + '-resumed', { widgetId: resumed.widget_id });
      const staff = await selectOption(page, resumed, scenario.staffName);
      assert.equal(staff.outcome, 'terminate'); assert.equal(staff.code, null); assert.equal(staff.receipt_outcome, 'ACCEPTED');
      assert.equal(staff.next_envelope, null);
      assert.deepEqual(staff.owner_decision, { kind: 'booking_selection_pending', next: 'date', reply: pendingQuestion });
      assert.ok(await page.waitFor(`document.body.innerText.includes(${JSON.stringify(pendingQuestion)})`));
      assert.equal(await page.eval('document.body.innerText.includes("Запись подтверждена.")'), false);
      await times(page, scenario, prompts.day, scenario.day, 'date');
      await times(page, scenario, prompts.serviceCorrection, scenario.day, 'service-edit');
      await times(page, scenario, prompts.staffCorrection, scenario.day, 'staff-edit');
      await times(page, scenario, prompts.dayCorrection, scenario.alternateDay, 'day-edit');
      await times(page, scenario, prompts.exactTime, scenario.alternateDay, 'time-exact', '14:30');
      for (const [step, prompt] of [['general', prompts.general], ['general-follow-up', prompts.generalFollowUp]]) {
        const beforeIntents = requests(page, '/widgets/intent').length;
        const response = await ask(page, prompt);
        assert.equal(response.reply, 'Тайм-менеджмент — это планирование своего времени.');
        assert.equal(response.action, null);
        assert.equal(response.resolution, undefined);
        assert.deepEqual(response.tools_used, []);
        assert.equal(requests(page, '/widgets/intent').length, beforeIntents);
        await capture(page, scenario.key + '-' + step);
        report.observations[scenario.key + '-' + step] = { scriptedGeneralAnswer: true, toolCalls: 0, newWidgetIntents: 0 };
        await checkpoint(scenario.key + '-' + step, {});
      }
      await times(page, scenario, prompts.topicReturn, scenario.alternateDay, 'topic-return', '14:30');
      const time = await times(page, scenario, prompts.timeCorrection, scenario.alternateDay, 'time-correction', '15:00');
      const slot = time.body.groups.flatMap(group => group.slots)[0];
      const draft = await clickRef(page, 'slot:' + slot.slot_ref), confirmation = draft.next_envelope;
      assert.equal(draft.receipt_outcome, 'ACCEPTED'); assert.equal(confirmation?.kind, 'BOOKING_CONFIRMATION');
      assert.equal(confirmation.body.staff_label.value, scenario.otherStaffName);
      assert.ok(await page.waitFor(`Q.all('article.widget--live').some(el => Q.visible(el) && el.innerText.includes(${JSON.stringify(scenario.otherStaffName)}) && el.innerText.includes(${JSON.stringify(scenario.otherServiceName)}) && el.innerText.includes(${JSON.stringify(scenario.timezone)}))`));
      assert.equal(localDay(confirmation.body.when.value, scenario.timezone), scenario.alternateDay);
      assert.equal(new Date(confirmation.body.when.value).toISOString(), new Date(slot.start.value).toISOString());
      assert.equal(localClock(confirmation.body.when.value, scenario.timezone), '15:00');
      await capture(page, scenario.key + '-preview');
      report.observations[scenario.key + 'Preview'] = { serviceName: scenario.otherServiceName, staffName: scenario.otherStaffName, day: scenario.alternateDay, timezone: scenario.timezone, localTime: '15:00', previousLocalTime: '14:30', eachCorrectionPreservesOtherPreferences: true };
      await checkpoint(scenario.key + '-preview', { confirmation, selectedStart: slot.start.value });
      const commit = confirmation.intents.find(intent => intent.effect === 'COMMIT'); assert.ok(commit);
      const result = await clickRef(page, 'intent:' + commit.intent_ref);
      if (scenario.key === 'success') {
        assert.equal(result.receipt_outcome, 'ACCEPTED'); assert.equal(result.owner_decision?.state, 'SUCCEEDED');
        assert.ok(await page.waitFor('document.body.innerText.includes("Запись подтверждена.")'));
      } else if (scenario.key === 'unknown') {
        assert.equal(result.owner_decision?.state, 'UNKNOWN');
        assert.ok(await page.waitFor('document.body.innerText.includes("Результат пока не подтверждён. Не отправляйте повторно.")'));
      } else {
        assert.equal(result.outcome, 'superseded'); assert.equal(result.code, 'handle_stale');
        assert.equal(result.receipt_outcome, null); assert.equal(result.owner_decision, null); assert.equal(result.next_envelope, null);
        assert.ok(await page.waitFor('document.body.innerText.includes("Данные изменились с момента показа. Откройте актуальную версию.")'));
      }
      if (scenario.key !== 'success') assert.equal(await page.eval('document.body.innerText.includes("Запись подтверждена.")'), false);
      assert.ok(await page.waitFor(`!Q.all('button[data-ref]').filter(el => Q.visible(el) && !el.disabled).some(el => el.dataset.ref === ${JSON.stringify('intent:' + commit.intent_ref)})`));
      // Explicit shell receipt READ after the action is spent. No old control,
      // token, capability or retry can be restored by this affordance.
      const intentCount = requests(page, '/widgets/intent').length;
      const chatCount = requests(page, '/ai/chat').length;
      const receiptButton = `Q.all('button').find(el => Q.visible(el) && el.textContent.trim() === 'Проверить результат')`;
      assert.ok(await page.waitFor(`!!(${receiptButton})`));
      await page.send('Network.emulateNetworkConditions', { offline:true, latency:0, downloadThroughput:-1, uploadThroughput:-1 });
      assert.equal(await page.click(receiptButton), true);
      assert.ok(await page.waitFor('document.body.innerText.includes("Не удалось проверить результат. Попробуйте ещё раз.")'));
      await page.send('Network.emulateNetworkConditions', { offline:false, latency:0, downloadThroughput:-1, uploadThroughput:-1 });
      let onlineReads = 0;
      async function readReceipt(label) {
        const before = requests(page, '/widgets/resolve').length;
        assert.equal(await page.click(receiptButton), true);
        const current = await until(() => requests(page, '/widgets/resolve').slice(before).find(row => row.finishedAt && row.status === 200), label);
        const calls = requests(page, '/widgets/resolve').slice(before);
        assert.equal(calls.length, 1, 'An explicit status check makes one bounded receipt request');
        assert.deepEqual(JSON.parse(await page.postData(current)), {
          thread_page: { limit: 20 }, booking_receipt: { widget_id: confirmation.widget_id },
        });
        const resolved = JSON.parse(await page.responseBody(current.requestId));
        assert.equal(resolved.tenant_bound, true);
        const matching = resolved.widgets.filter(row => row.envelope.widget_id === confirmation.widget_id);
        assert.equal(matching.length, 1, 'The receipt belongs to the original confirmation widget');
        assert.ok(await page.waitFor(`!!(${receiptButton}) && !(${receiptButton}).disabled`));
        onlineReads++;
        return matching[0].terminal_lines;
      }
      const firstLines = await readReceipt('manual current receipt READ');
      if (scenario.key === 'unknown') {
        assert.equal(firstLines.some(line => line.outcome === 'CONFIRMED'), false, 'Inconclusive source cannot confirm the action');
        assert.equal(await page.eval('document.body.innerText.includes("Запись подтверждена.")'), false);
        assert.ok(await page.waitFor('document.body.innerText.includes("Результат пока не подтверждён. Не отправляйте повторно.")'));
        await capture(page, 'unknown-before');
        await checkpoint('unknown-readback-ready', { widgetId: confirmation.widget_id });
      }
      const repeatedLines = await readReceipt('repeat receipt READ');
      if (scenario.key === 'unknown') {
        const confirmed = repeatedLines.filter(line => line.outcome === 'CONFIRMED');
        assert.equal(confirmed.length, 1, 'Authoritative source readback produces exactly one canonical confirmation');
        assert.equal(typeof confirmed[0].action_receipt_ref, 'string');
        assert.ok(confirmed[0].action_receipt_ref.length > 0);
        assert.ok(await page.waitFor('document.body.innerText.split("Запись подтверждена.").length - 1 === 1'));
        await capture(page, 'unknown-confirmed');
        const settledLines = await readReceipt('settled receipt READ without provider redispatch');
        assert.deepEqual(settledLines.filter(line => line.outcome === 'CONFIRMED'), confirmed, 'Repeated READ preserves the same canonical action receipt');
        assert.equal(await page.eval('document.body.innerText.split("Запись подтверждена.").length - 1'), 1);
      }
      assert.equal(requests(page, '/widgets/intent').length, intentCount);
      assert.equal(requests(page, '/ai/chat').length, chatCount);
      assert.equal(await page.eval(`Q.all('button[data-ref]').filter(el => Q.visible(el) && !el.disabled).some(el => el.dataset.ref === ${JSON.stringify('intent:' + commit.intent_ref)})`), false);
      if (scenario.key === 'success') assert.equal(await page.eval('document.body.innerText.split("Запись подтверждена.").length - 1'), 1);
      report.observations[scenario.key + 'ReceiptRefresh'] = {offlineRefusal:true, currentReceiptReads:onlineReads, newCommit:0, newChat:0, oldControlRestored:false,
        ...(scenario.key === 'unknown' ? { beforeAuthoritativeReadback: 'UNKNOWN', afterAuthoritativeReadback: 'CONFIRMED', confirmationStatements: 1, repeatedCanonicalReceipt: true } : {})};
      report.observations[scenario.key + 'Result'] = publicResult(result);
      await capture(page, scenario.key + '-result'); await checkpoint(scenario.key + '-result', { result: publicResult(result),
        ...(scenario.key === 'unknown' ? { receiptState: 'CONFIRMED' } : {}) });
      reloads.push({ page, scenario, nextLoginAt, commitRef: 'intent:' + commit.intent_ref });
    }
    for (const { page, scenario, nextLoginAt, commitRef } of reloads) {
      activePage = page;
      const before = requests(page, '/widgets/intent').length;
      while (Date.now() < nextLoginAt) await pause(Math.min(1000, nextLoginAt - Date.now()));
      await page.goto(origin + '/'); await login(page, scenario.email);
      assert.equal(requests(page, '/widgets/intent').length, before, 'Reload does not repeat selection or COMMIT');
      assert.equal(await page.eval(`Q.all('button[data-ref]').filter(el => Q.visible(el) && !el.disabled).some(el => el.dataset.ref === ${JSON.stringify(commitRef)})`), false);
      if (scenario.key === 'success' || scenario.key === 'unknown') {
        assert.ok(await page.waitFor('document.body.innerText.split("Запись подтверждена.").length - 1 === 1'));
      }
      else {
        assert.equal(await page.eval('document.body.innerText.includes("Запись подтверждена.")'), false);
      }
      report.observations[scenario.key + 'Reload'] = { noAutomaticIntent: true, noOldConfirmation: true, noInventedSuccess: true };
      await capture(page, scenario.key + '-reload'); await checkpoint(scenario.key + '-reload');
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
