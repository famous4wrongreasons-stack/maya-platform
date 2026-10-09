// Exact 3-dialog / 5-turn UI adapter for the existing core runner. No model key,
// response substitution, token seed, page fetch, business intent or retry.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Browser } from '../../maya-chat-shell/test/cdp-verify.mjs';
import { createDevServer } from '../../maya-chat-shell/dev/serve.mjs';
import { installCoreBrowserGuard, localOrigin } from './core-conversation-browser-guard.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, limit = 10000) {
  const end = Date.now() + limit;
  while (Date.now() < end) { const value = await read(); if (value) return value; await pause(50); }
  throw new Error('core_ui_wait_timeout');
}
async function click(page, name) {
  assert.ok(await page.waitFor(`Q.all('button').some(el => Q.visible(el) && Q.name(el) === ${JSON.stringify(name)})`));
  assert.equal(await page.click(`Q.all('button').find(el => Q.visible(el) && Q.name(el) === ${JSON.stringify(name)})`), true);
}
assert.equal(process.connected, true, 'Use the owned core UI runner');
let config, report, output, browser, chromeChild, chromeProfile, active, closing;
const servers = [], guards = [], opened = new Set();
const save = () => { if (output) fs.writeFileSync(path.join(output, 'browser.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 }); };
const cleanup = () => closing ??= (async () => {
  try { await browser?.close(); }
  finally {
    if (chromeChild && chromeChild.exitCode === null) {
      const exit = new Promise(resolve => chromeChild.once('exit', resolve));
      chromeChild.kill('SIGKILL'); await Promise.race([exit, pause(2000)]);
    }
    for (const server of servers) await server.close();
    if (chromeProfile) fs.rmSync(chromeProfile, { recursive: true, force: true });
    if (report) { report.cleanup = { chromeExited: !chromeChild || chromeChild.exitCode !== null || chromeChild.signalCode !== null, serversClosed: true }; save(); }
  }
})();
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP', 'disconnect']) process.once(signal, () => { void cleanup().finally(() => process.exit(report?.status === 'transport_pass_language_ungraded' ? 0 : 2)); });
async function start(input) {
  assert.equal(config, undefined);
  assert.equal(input.cases.length, 3);
  assert.equal(input.cases.reduce((n, c) => n + c.userTurns.length, 0), 5);
  assert.match(input.candidateCommit, /^[a-f0-9]{40}$/);
  assert.match(input.manifestSha256, /^[a-f0-9]{64}$/);
  localOrigin(input.backendOrigin);
  config = input; output = path.join(input.output, 'current-react');
  fs.mkdirSync(output, { mode: 0o700 });
  report = { contract: 'maya.core-current-react/1', status: 'running', candidateCommit: input.candidateCommit, manifestSha256: input.manifestSha256, modelQualification: input.modelQualification, syntheticCrm: true, realModelAcceptance: false, logins: [], turns: [], blocked: [], snapshots: {} };
  save();
  chromeProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-core-ui-chrome-'));
  fs.chmodSync(chromeProfile, 0o700);
  chromeChild = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--js-flags=--max-old-space-size=256', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--metrics-recording-only',
    '--remote-debugging-port=0', '--user-data-dir=' + chromeProfile,
    '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--disable-quic', '--disable-features=OptimizationHints,MediaRouter', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });
  report.chromePid = chromeChild.pid; save();
  let launchError;
  chromeChild.once('error', () => { launchError = true; });
  const portFile = path.join(chromeProfile, 'DevToolsActivePort');
  await until(() => { assert.ok(!launchError && chromeChild.exitCode === null); return fs.existsSync(portFile); });
  const [port, wsPath] = fs.readFileSync(portFile, 'utf8').trim().split('\n');
  assert.match(port, /^\d+$/); assert.match(wsPath, /^\/devtools\/browser\/[a-f0-9-]+$/);
  browser = new Browser(chromeChild, chromeProfile, `ws://127.0.0.1:${port}${wsPath}`);
  let timer;
  try { await Promise.race([browser.connect(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('core_ui_connect_timeout')), 10000); })]); }
  finally { clearTimeout(timer); }
  report.chrome = await browser.version(); save();
}
async function open({ caseId }) {
  assert.ok(config && !active && !opened.has(caseId));
  const item = config.cases.find(c => c.id === caseId); assert.ok(item);
  opened.add(caseId);
  // A distinct ephemeral origin per actor also isolates browser session storage.
  const dev = createDevServer({ root: path.join(root, 'dist/web'), api: config.backendOrigin + '/api', upstreamPorts: [new URL(config.backendOrigin).port] });
  servers.push(dev);
  const { port } = await dev.listen(0); const origin = localOrigin(`http://127.0.0.1:${port}`);
  const page = await browser.newPage();
  const guard = await installCoreBrowserGuard(page, origin, item.email); guards.push(guard);
  active = { page, guard, item, messages: [], conversationId: undefined, turn: 0 };
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await page.goto(origin + '/');
  await click(page, 'Войти по email');
  assert.ok(await page.waitFor('!!Q.email()')); assert.equal(await page.fill('Q.email()', item.email), true);
  await click(page, 'Получить код');
  const request = await until(() => page.apiRequests('/auth/email/start').find(r => r.finishedAt));
  assert.ok([200, 201].includes(request.status));
  const response = JSON.parse(await page.responseBody(request.requestId));
  assert.equal(response.delivery, 'debug'); assert.match(response.debug_code, /^\d{4,8}$/);
  assert.ok(await page.waitFor('!!Q.code()')); assert.equal(await page.fill('Q.code()', response.debug_code), true);
  delete response.debug_code;
  await click(page, 'Войти'); assert.ok(await page.waitFor('!!Q.composer()'));
  const verify = await until(() => page.apiRequests('/auth/email/verify').find(r => r.finishedAt));
  assert.ok([200, 201].includes(verify.status));
  await until(() => page.apiRequests('/ai/conversation').some(r => r.finishedAt));
  await until(() => page.apiRequests('/widgets/resolve').some(r => r.finishedAt && r.status === 200));
  report.logins.push({ caseId, startStatus: request.status, verifyStatus: verify.status, origin, credentialSource: 'CANONICAL_DEBUG_EMAIL_AUTH_SYNTHETIC_USER' }); save();
}
async function chat({ prompt }) {
  assert.ok(active);
  const { page, guard, item } = active;
  assert.equal(prompt, item.userTurns[active.turn]);
  active.messages.push({ role: 'user', content: prompt });
  guard.expectTurn(active.messages, active.conversationId);
  const before = page.apiRequests('/ai/chat').length;
  assert.equal(await page.fill('Q.composer()', prompt), true);
  assert.ok(await page.waitFor('!!Q.byName("button", /^Отправить$/) && !Q.byName("button", /^Отправить$/).disabled'));
  await click(page, 'Отправить');
  const request = await until(() => page.apiRequests('/ai/chat').slice(before).find(r => r.finishedAt || r.failed), 135000);
  const row = { caseId: item.id, turn: ++active.turn, userText: prompt, actualReply: null, status: request.status ?? null, requestId: null, visible: false, responseParsed: false, transportFailed: Boolean(request.failed) };
  report.turns.push(row); save();
  assert.ok(!request.failed); assert.equal(page.apiRequests('/ai/chat').length, before + 1);
  const rawResponse = await page.responseBody(request.requestId);
  row.responseBytes = Buffer.byteLength(rawResponse);
  row.responseSha256 = createHash('sha256').update(rawResponse).digest('hex'); save();
  assert.ok(row.responseBytes <= 1048576);
  const actualRequest = JSON.parse(await page.postData(request));
  row.requestId = actualRequest.requestId;
  row.requestSha256 = createHash('sha256').update(JSON.stringify(actualRequest)).digest('hex');
  row.requestKeys = Object.keys(actualRequest); save();
  const body = JSON.parse(rawResponse);
  row.responseParsed = true;
  row.actualReply = typeof body.reply === 'string' ? body.reply.slice(0, 3500) : null;
  row.responseKeys = Object.keys(body);
  row.error = Object.fromEntries(['code', 'detail'].map(key => [key, typeof body.error?.[key] === 'string' && /^[a-zA-Z0-9_.:-]{1,128}$/.test(body.error[key]) ? body.error[key] : null]));
  save();
  assert.equal(request.status, 201); assert.equal(typeof body.reply, 'string');
  assert.deepEqual(actualRequest.messages, active.messages);
  assert.equal(actualRequest.conversationId, active.conversationId);
  assert.equal(Object.hasOwn(actualRequest, 'audience'), false);
  assert.equal(Object.hasOwn(actualRequest, 'tenantId'), false);
  const expected = body.reply.replace(/\s+/g, ' ').trim();
  assert.ok(await page.waitFor(`Q.all('[data-chat-message="maya"]').at(-1)?.textContent.replace(/^MAYA: /, '').replace(/\\s+/g, ' ').trim() === ${JSON.stringify(expected)}`));
  row.visible = true;
  assert.ok(await page.waitFor('!document.querySelector(".maya-typewriter-caret")'));
  await page.send('Page.bringToFront');
  await page.eval('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))');
  const name = item.id + '-' + active.turn;
  report.snapshots[name] = await page.eval('({ text: document.body.innerText })');
  const { data } = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(data, 'base64'), { flag: 'wx', mode: 0o600 });
  const conversationId = body.user_turn?.conversationId;
  assert.equal(typeof conversationId, 'string');
  if (active.conversationId) assert.equal(conversationId, active.conversationId);
  active.conversationId = conversationId;
  active.messages.push({ role: 'assistant', content: body.reply }); save();
  return { status: request.status, body, request: actualRequest };
}
async function dispatch(command, value) {
  if (command === 'start') return start(value);
  if (command === 'open') return open(value);
  if (command === 'chat') return chat(value);
  if (command === 'close-dialog') { assert.ok(active); await active.page.close(); active = undefined; return; }
  if (command === 'finish') {
    assert.equal(report.turns.length, 5); assert.equal(report.logins.length, 3);
    for (const guard of guards) { assert.deepEqual(guard.blocked, []); assert.deepEqual(guard.errors, []); }
    report.status = 'transport_pass_language_ungraded'; await cleanup(); return;
  }
  throw new Error('core_ui_command_refused');
}
let pending = Promise.resolve();
process.on('message', message => {
  pending = pending.then(async () => {
    try {
      assert.ok(Number.isSafeInteger(message.id) && message.id > 0);
      const value = await dispatch(message.command, message.value);
      process.send({ id: message.id, ok: true, value });
      if (message.command === 'finish') process.disconnect();
    } catch {
      if (report) { report.status = 'failed'; report.blocked = guards.flatMap(g => g.blocked); save(); }
      process.send?.({ id: message.id, ok: false, observed: message.command === 'chat' ? report?.turns.at(-1) : null });
      await cleanup(); process.exitCode = 1; process.disconnect();
    }
  });
});
