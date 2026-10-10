// One explicit local UI acceptance: real React/auth/owners, scripted semantics,
// synthetic internal calendar. Never consumes a model permit or provider key.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Browser } from '../../maya-chat-shell/test/cdp-verify.mjs';
import { createDevServer } from '../../maya-chat-shell/dev/serve.mjs';
import { installGuard, localOrigin } from './ordinary-booking-selector-browser-guard.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prompts = ['Есть время к Артёму завтра на мужскую стрижку?', 'Запиши меня на 17:00', 'Покажи мои записи'];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = value => createHash('sha256').update(value).digest('hex');
async function until(read, label) {
  const end = Date.now() + 15000;
  while (Date.now() < end) { const value = await read(); if (value) return value; await pause(50); }
  throw new Error('Timeout: ' + label);
}
function receive(type) {
  return new Promise((resolve, reject) => {
    const listener = value => { if (value?.type === type) { clearTimeout(timer); process.off('message', listener); resolve(value); } };
    const timer = setTimeout(() => { process.off('message', listener); reject(new Error('Missing parent: ' + type)); }, 20000);
    process.on('message', listener);
  });
}
async function main() {
  assert.equal(process.connected, true);
  const start = receive('start'); process.send({ type: 'ready' });
  const input = await start, output = path.join(input.output, 'current-react');
  fs.mkdirSync(output, { mode: 0o700 });
  const report = { contract: 'maya.exact-booking-followup-browser/1', status: 'running', realReactAndAuth: true, scriptedModel: true, syntheticInternalCalendar: true, realModelCalls: 0, realProviderCalls: 0, steps: [], blocked: [] };
  const save = () => fs.writeFileSync(path.join(output, 'browser.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  let browser, chrome, profile, dev, page, guard, closing;
  const cleanup = () => closing ??= (async () => {
    try { await browser?.close(); }
    finally {
      if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
        const closed = new Promise(resolve => chrome.once('exit', resolve)); chrome.kill('SIGKILL'); await Promise.race([closed, pause(2000)]);
      }
      await dev?.close();
      if (profile) fs.rmSync(profile, { recursive: true, force: true });
      report.cleanup = { chromeExited: !chrome || chrome.exitCode !== null || chrome.signalCode !== null, serverClosed: true };
      save();
    }
  })();
  for (const signal of ['SIGTERM', 'SIGINT', 'disconnect']) process.once(signal, () => { void cleanup().finally(() => process.exit(2)); });
  const view = () => page.eval('({text:document.body.innerText,controls:Q.all("button").filter(Q.visible).map(el=>({name:Q.name(el),ref:el.dataset.ref??null,disabled:el.disabled}))})');
  async function clickName(name) {
    assert.ok(await page.waitFor(`Q.all('button').some(el=>Q.visible(el)&&Q.name(el)===${JSON.stringify(name)}&&!el.disabled)`), name);
    assert.equal(await page.click(`Q.all('button').find(el=>Q.visible(el)&&Q.name(el)===${JSON.stringify(name)})`), true);
  }
  async function record(name, body = null) {
    assert.ok(await page.waitFor('!document.querySelector(".maya-typewriter-caret")'));
    const snapshot = await view();
    const row = { name, reply: body?.reply ?? null, envelopeKind: body?.resolution?.receipt?.envelope?.kind ?? body?.next_envelope?.kind ?? null, receiptOutcome: body?.receipt_outcome ?? null, code: body?.code ?? null, snapshot };
    report.steps.push(row); save();
    const acknowledgement = receive('continue:' + name);
    process.send({ type: 'checkpoint', name, receiptOutcome: row.receiptOutcome, envelopeKind: row.envelopeKind, selectedStart: body?.next_envelope?.body?.when?.value ?? null });
    await acknowledgement;
  }
  async function chat(prompt, name) {
    const before = page.apiRequests('/ai/chat').length;
    assert.equal(await page.fill('Q.composer()', prompt), true); await clickName('Отправить');
    const request = await until(() => page.apiRequests('/ai/chat').slice(before).find(r => r.finishedAt || r.failed), name);
    assert.equal(request.status, 201); assert.equal(page.apiRequests('/ai/chat').length, before + 1);
    const raw = await page.responseBody(request.requestId), body = JSON.parse(raw);
    const expected = body.reply.replace(/\s+/g, ' ').trim();
    assert.ok(await page.waitFor(`Q.all('[data-chat-message="maya"]').at(-1)?.textContent.replace(/^MAYA: /,'').replace(/\\s+/g,' ').trim()===${JSON.stringify(expected)}`));
    report.chat ??= []; report.chat.push({ prompt, actualReply: body.reply, requestId: body.request_id, responseSha256: hash(raw), status: request.status, source: body.source }); save();
    await record(name, body); return body.resolution?.receipt?.envelope;
  }
  async function clickRef(ref, envelope) {
    const snapshot = await view();
    assert.ok(snapshot.controls.some(c => c.ref === ref && !c.disabled), 'Visible canonical control: ' + ref);
    const before = page.apiRequests('/widgets/intent').length;
    // Refs are local to each envelope. Earlier chat cards legitimately retain i1/i2.
    const control = `Q.all('button[data-ref]').filter(el=>Q.visible(el)&&!el.disabled&&el.getAttribute('aria-disabled')!=='true'&&el.dataset.ref===${JSON.stringify(ref)}).at(-1)`;
    const controlName = await page.eval(`Q.name(${control})`);
    assert.equal(await page.click(control), true);
    const request = await until(() => page.apiRequests('/widgets/intent').slice(before).find(r => r.finishedAt || r.failed), 'widget intent');
    const submission = JSON.parse(await page.postData(request));
    assert.equal(submission.widget_id, envelope.widget_id, 'Click must belong to the current canonical envelope');
    const raw = await page.responseBody(request.requestId), body = JSON.parse(raw);
    report.intents ??= []; report.intents.push({ controlName, widgetId: envelope.widget_id, status: request.status, outcome: body.receipt_outcome ?? null, code: body.code ?? null, responseSha256: hash(raw), nextKind: body.next_envelope?.kind ?? null }); save();
    assert.equal(request.status, 200); return body;
  }
  async function commit(envelope, name) {
    assert.equal(envelope.kind, 'BOOKING_CONFIRMATION');
    const intent = envelope.intents.find(i => i.effect === 'COMMIT'); assert.ok(intent);
    const result = await clickRef('intent:' + intent.intent_ref, envelope);
    await record(name, result); assert.equal(result.receipt_outcome, 'ACCEPTED'); return result;
  }
  async function login() {
    const beforeAuth = page.apiRequests('/auth/email/start').length;
    const beforeHistory = page.apiRequests('/widgets/resolve').length;
    await clickName('Войти по email');
    assert.ok(await page.waitFor('!!Q.email()')); assert.equal(await page.fill('Q.email()', input.email), true); await clickName('Получить код');
    const auth = await until(() => page.apiRequests('/auth/email/start').slice(beforeAuth).find(r => r.finishedAt), 'email start'); assert.equal(auth.status, 201);
    const challenge = JSON.parse(await page.responseBody(auth.requestId)); assert.equal(challenge.delivery, 'debug');
    assert.ok(await page.waitFor('!!Q.code()')); assert.equal(await page.fill('Q.code()', challenge.debug_code), true); delete challenge.debug_code;
    await clickName('Войти'); assert.ok(await page.waitFor('!!Q.composer()'));
    await until(() => page.apiRequests('/widgets/resolve').slice(beforeHistory).some(r => r.finishedAt && r.status === 200), 'history');
    report.canonicalLogins = (report.canonicalLogins ?? 0) + 1;
  }
  try {
    localOrigin(input.backendOrigin);
    dev = createDevServer({ root: path.join(root, 'dist/web'), api: input.backendOrigin + '/api', upstreamPorts: [new URL(input.backendOrigin).port] });
    const { port } = await dev.listen(0), origin = localOrigin(`http://127.0.0.1:${port}`);
    profile = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-booking-followup-chrome-')); fs.chmodSync(profile, 0o700);
    chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
      '--headless=new', '--js-flags=--max-old-space-size=256', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--metrics-recording-only',
      '--remote-debugging-port=0', '--user-data-dir=' + profile, '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--disable-quic', '--disable-features=OptimizationHints,MediaRouter', 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'ignore'] });
    report.chromePid = chrome.pid; save();
    let failed = false; chrome.once('error', () => { failed = true; });
    const portFile = path.join(profile, 'DevToolsActivePort');
    await until(() => { assert.ok(!failed && chrome.exitCode === null); return fs.existsSync(portFile); }, 'Chrome');
    const [cdpPort, wsPath] = fs.readFileSync(portFile, 'utf8').trim().split('\n');
    assert.match(cdpPort, /^\d+$/); assert.match(wsPath, /^\/devtools\/browser\/[a-f0-9-]+$/);
    browser = new Browser(chrome, profile, `ws://127.0.0.1:${cdpPort}${wsPath}`); await browser.connect();
    page = await browser.newPage(); guard = await installGuard(page, origin, { emails: [input.email], prompts });
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await page.goto(origin + '/'); await login();
    report.login = 'ACTUAL_CANONICAL_DEBUG_EMAIL_SYNTHETIC_CLIENT'; save();
    let envelope = await chat(prompts[0], 'initial-slots'); assert.equal(envelope.kind, 'TIME_SLOT_SELECTOR');
    envelope = await chat(prompts[1], 'selected-17'); assert.equal(envelope.kind, 'TIME_SLOT_SELECTOR');
    const slots = envelope.body.groups.flatMap(g => g.slots); assert.equal(slots.length, 1);
    assert.equal(Date.parse(slots[0].start.value), Date.parse(input.start));
    let result = await clickRef('slot:' + slots[0].slot_ref, envelope); assert.equal(result.next_envelope?.kind, 'BOOKING_CONFIRMATION');
    assert.equal(result.next_envelope.body.staff_label.value, 'Артём');
    await record('create-preview', result); await commit(result.next_envelope, 'create-commit');
    for (const operation of ['reschedule', 'cancel']) {
      envelope = await chat(prompts[2], 'own-before-' + operation); assert.equal(envelope.kind, 'SCHEDULE');
      const intent = envelope.intents.find(i => i.effect === 'REFINE' && i.label === (operation === 'reschedule' ? 'Проверить перенос' : 'Проверить отмену'));
      assert.ok(intent, 'Current own schedule lacks canonical ' + operation + ' control');
      // SCHEDULE renders its detail intent on the appointment entry itself.
      const entry = envelope.body.entries.find(e => e.detail_intent === intent.intent_ref);
      result = await clickRef(entry ? 'entry:' + entry.entry_ref : 'intent:' + intent.intent_ref, envelope); assert.equal(result.next_envelope?.kind, 'BOOKING_CONFIRMATION');
      await record(operation + '-preview', result); await commit(result.next_envelope, operation + '-commit');
    }
    const before = page.apiRequests('/ai/conversation').length;
    // Current carrier keeps credentials in memory. Recovery uses a second real login.
    await page.goto(origin + '/'); await login();
    await until(() => page.apiRequests('/ai/conversation').slice(before).some(r => r.finishedAt && r.status === 200), 'reload');
    assert.ok(await page.waitFor(`document.body.innerText.includes('Запись отменена.')`));
    await record('reload');
    assert.equal(report.canonicalLogins, 2); assert.equal(report.chat.length, 4); assert.equal(report.intents.length, 6); assert.equal(page.apiRequests('/widgets/intent').length, 6); assert.deepEqual(guard.blocked, []); assert.deepEqual(guard.errors, []);
    report.status = 'passed-synthetic-booking-lifecycle';
  } catch (error) {
    report.status = 'failed'; report.error = error.message;
    if (page) { try { report.failureSnapshot = await view(); } catch {} }
    throw error;
  } finally {
    report.blocked = guard?.blocked ?? []; save(); await cleanup();
  }
  assert.ok(report.cleanup.chromeExited);
}
main().then(() => process.exit(0), error => { process.stderr.write(error.message + '\n'); process.exit(1); });
