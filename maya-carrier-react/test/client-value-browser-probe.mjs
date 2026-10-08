// Explicit child of client-value-restart.probe-spec.ts. Actual production React
// bundle, UI debug-email authentication and local HTTP. No API fulfillment,
// session/token injection, direct tool invocation or synthetic chat response.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Browser } from '../../maya-chat-shell/test/cdp-verify.mjs';
import { createDevServer } from '../../maya-chat-shell/dev/serve.mjs';
import { CLARIFICATION, installGuard, localOrigin, PROMPTS, publicRequest } from './client-value-browser-guard.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const digest = (value) => createHash('sha256').update(value).digest('hex');
const opaque = (value) => typeof value === 'string' ? digest(value) : null;
const uuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const normal = (value) => value.replace(/\s+/g, ' ').trim();

async function bounded(promise, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label)), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}
async function until(read, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (value) return value;
    await pause(50);
  }
  throw new Error('Timed out: ' + label);
}
function receive(type) {
  return new Promise((resolve, reject) => {
    let timer;
    const clear = () => { clearTimeout(timer); process.off('message', listener); process.off('disconnect', disconnected); };
    const listener = (message) => { if (message?.type === type) { clear(); resolve(message); } };
    const disconnected = () => { clear(); reject(new Error('Parent disconnected')); };
    timer = setTimeout(() => { clear(); reject(new Error('Missing parent checkpoint')); }, 20_000);
    process.on('message', listener); process.once('disconnect', disconnected);
  });
}
async function checkpoint(name, data = {}) {
  const ack = receive('continue:' + name);
  process.send({ type: 'checkpoint', name, ...data });
  await ack;
}
async function snapshot(page) {
  return page.eval(`({
    messages: Q.all('[data-chat-message]').map(el => ({role:el.getAttribute('data-chat-message'),text:el.innerText})),
    controls: Q.all('button,input,textarea').filter(Q.visible).map(el => ({tag:el.tagName,name:Q.name(el)})),
    widgets: Q.all('article.widget').length
  })`);
}
async function clickNamed(page, name) {
  const view = await snapshot(page);
  assert.ok(view.controls.some((control) => control.tag === 'BUTTON' && control.name === name), 'Required visible UI control');
  assert.equal(await page.click(`Q.all('button').find(el => Q.visible(el) && Q.name(el) === ${JSON.stringify(name)})`), true);
}
async function quietHttp(page) {
  let idleSince = null;
  await until(() => {
    if (page.apiRequests('/').some((request) => !request.finishedAt && !request.failed)) { idleSince = null; return false; }
    idleSince ??= Date.now();
    return Date.now() - idleSince >= 200;
  }, 'actual HTTP settled');
}
async function login(page, email) {
  const beforeHistory = page.apiRequests('/ai/conversation').length;
  assert.ok(await page.waitFor('!!Q.byName("button", /^Войти по email$/)'));
  await clickNamed(page, 'Войти по email');
  assert.ok(await page.waitFor('!!Q.email()'));
  assert.equal(await page.fill('Q.email()', email), true);
  const beforeStart = page.apiRequests('/auth/email/start').length;
  await clickNamed(page, 'Получить код');
  const started = await until(() => page.apiRequests('/auth/email/start').slice(beforeStart).find((request) => request.finishedAt), 'debug email start');
  assert.ok([200, 201].includes(started.status), 'Real email start must succeed');
  const response = JSON.parse(await page.responseBody(started.requestId));
  assert.ok(response.delivery === 'debug', 'Local debug-email profile is required');
  assert.ok(typeof response.debug_code === 'string' && /^\d{4,8}$/.test(response.debug_code), 'Actual debug code must be finite');
  assert.ok(response.retry_after_seconds === 60, 'Respect the real existing auth cooldown');
  const notBefore = Date.now() + 61_000;
  assert.ok(await page.waitFor('!!Q.code()'));
  assert.equal(await page.fill('Q.code()', response.debug_code), true);
  delete response.debug_code;
  await clickNamed(page, 'Войти');
  assert.ok(await page.waitFor('!!Q.composer()'), 'Actual UI authentication must complete');
  await until(() => page.apiRequests('/ai/conversation').slice(beforeHistory).some((request) => request.finishedAt), 'actual history response');
  await quietHttp(page);
  return notBefore;
}

function assertReadOnly(body) {
  assert.equal(body.action, null);
  assert.equal(body.resolution, undefined, 'This response has no widget/action authority');
  assert.deepEqual(body.tools_used, [], 'Domain reads remain inside the single C9 path');
  assert.ok(uuid(body.request_id));
  assert.ok(uuid(body.user_turn?.turnId) && uuid(body.user_turn?.conversationId));
  assert.ok(typeof body.reply === 'string' && body.reply.length > 0 && body.reply.length <= 12_000);
}
function assertCompound(body, lifecycleOutcome) {
  assertReadOnly(body);
  const coordination = body.coordination;
  assert.ok(uuid(coordination?.run_id) && uuid(coordination?.revision_id));
  assert.equal(coordination.scope, 'explicit_business_lifecycle');
  assert.deepEqual(coordination.domains, ['BUSINESS_INTELLIGENCE', 'CLIENT_LIFECYCLE']);
  assert.equal(coordination.state, 'PROPOSED');
  assert.equal(coordination.revision, 1);
  assert.equal(coordination.current, false);
  assert.equal(coordination.replayed, false);
  const bi = body.analysis, lifecycle = body.recommendation;
  assert.equal(bi.contract, 'maya.c9-bi-report-response/1');
  assert.equal(bi.mode, 'as_reported');
  assert.equal(bi.agent.agent_id, 'BUSINESS_INTELLIGENCE');
  assert.ok(Array.isArray(bi.agent.findings) && bi.agent.findings.length > 0);
  assert.equal(bi.evidence.sourceHandles.length, 1);
  assert.equal(lifecycle.contract, 'maya.c9-lifecycle-response/1');
  assert.equal(lifecycle.agent.agent_id, 'CLIENT_LIFECYCLE');
  assert.equal(lifecycle.outcome, lifecycleOutcome);
  assert.equal(lifecycle.agent.completeness.totalCount, null);
  assert.equal(lifecycle.canContact, false);
  for (const part of [bi, lifecycle]) {
    assert.equal(part.noSideEffects, true);
    assert.equal(part.executionAuthority, false);
    assert.equal(part.reasoning, 'deterministic');
    assert.ok(uuid(part.evidence.workReceiptId));
    for (const fact of part.agent.findings) assert.ok(body.reply.includes(fact.statement), 'Every exposed source fact appears in the coherent reply');
  }
  assert.notEqual(bi.evidence.workReceiptId, lifecycle.evidence.workReceiptId);
  assert.ok(body.reply.startsWith('Объединила опубликованный финансовый отчёт и доступные оценки давности визитов.'));
  assert.ok(body.reply.includes('У этих источников разные периоды наблюдения.'));
  assert.ok(body.reply.includes('Опубликованный финансовый снимок, версия'));
  assert.ok(body.reply.includes('Период:'));
  assert.ok(body.reply.includes('Причина изменения выручки не установлена.'));
  assert.ok(body.reply.includes('Финансовый отчёт не устанавливает ценность этих гостей, причину изменения выручки или вероятность возврата.'));
  assert.ok(body.reply.includes('до трёх оценок'));
  assert.ok(body.reply.includes('Охват всей базы не подтверждён.'));
  assert.ok(body.reply.includes('Предложение сохранено, версия 1.'));
  assert.ok(body.reply.includes('Клиентские записи не менялись, сообщения не отправлялись.'));
  assert.ok(body.reply.includes('аудитория и рассылка не создавались.'));
  assert.doesNotMatch(body.reply, /c8\.dormancy\/|вероятность возврата\s*[:—-]?\s*\d|выручка[^.\n]*(?:из-за|благодаря)/iu);
  if (lifecycleOutcome === 'PARTIAL') {
    assert.ok(lifecycle.agent.findings.length >= 1 && lifecycle.agent.findings.length <= 3);
    assert.equal(lifecycle.evidence.sourceHandles.length, lifecycle.agent.findings.length);
    assert.ok(body.reply.includes('По оценке на'));
  } else {
    assert.deepEqual(lifecycle.agent.findings, []);
    assert.deepEqual(lifecycle.evidence.sourceHandles, []);
    assert.ok(body.reply.includes('Отсутствие оценки не означает, что гости активны или спят.'));
    assert.doesNotMatch(body.reply, /Оценка [123]:/);
  }
}
function assertSingleLifecycle(body) {
  assertReadOnly(body);
  assert.equal(body.analysis, undefined, 'Standalone Lifecycle does not add a financial analysis');
  const coordination = body.coordination;
  assert.ok(uuid(coordination?.run_id) && uuid(coordination?.revision_id));
  assert.equal(coordination.scope, 'explicit_lifecycle');
  assert.equal(coordination.domains, undefined);
  assert.equal(coordination.state, 'PROPOSED');
  assert.equal(coordination.revision, 1);
  assert.equal(coordination.current, true, 'Fresh available standalone findings are current');
  assert.equal(coordination.replayed, false);
  const lifecycle = body.recommendation;
  assert.equal(lifecycle.contract, 'maya.c9-lifecycle-response/1');
  assert.equal(lifecycle.agent.agent_id, 'CLIENT_LIFECYCLE');
  assert.equal(lifecycle.outcome, 'PARTIAL');
  assert.equal(lifecycle.agent.completeness.totalCount, null);
  assert.equal(lifecycle.noSideEffects, true);
  assert.equal(lifecycle.executionAuthority, false);
  assert.equal(lifecycle.canContact, false);
  assert.equal(lifecycle.reasoning, 'deterministic');
  assert.ok(uuid(lifecycle.evidence.workReceiptId));
  assert.ok(Array.isArray(lifecycle.agent.findings) && lifecycle.agent.findings.length >= 1 && lifecycle.agent.findings.length <= 3);
  assert.equal(lifecycle.evidence.sourceHandles.length, lifecycle.agent.findings.length);
  for (const fact of lifecycle.agent.findings) {
    assert.ok(typeof fact.statement === 'string' && fact.statement.length > 0);
    assert.ok(body.reply.includes(fact.statement), 'Every standalone source fact appears in the coherent reply');
  }
  assert.ok(body.reply.startsWith('Проверены доступные оценки давности визитов по подтверждённому правилу бизнеса.'));
  assert.ok(body.reply.includes('По оценке на'));
  assert.ok(body.reply.includes('Проверка охватывает до трёх оценок, а не список уникальных клиентов. Охват всей базы не подтверждён.'));
  assert.ok(body.reply.includes('Давность визита не означает готовность гостя вернуться. Прогноза возврата и разрешения на контакт нет.'));
  assert.ok(body.reply.includes('Предложение сохранено, версия 1. Клиентские записи не менялись, сообщения не отправлялись.'));
  assert.doesNotMatch(body.reply, /c8\.dormancy\/|вероятность возврата\s*[:—-]?\s*\d|выручка[^.\n]*(?:из-за|благодаря)/iu);
}
function assertClarification(body) {
  assertReadOnly(body);
  assert.equal(body.reply, CLARIFICATION);
  assert.equal(body.coordination, undefined);
  assert.equal(body.analysis, undefined);
  assert.equal(body.recommendation, undefined);
}
function responseProjection(body) {
  const part = (value) => value ? {
    contract: value.contract, ...(value.mode ? { mode: value.mode } : {}),
    outcome: value.outcome, agentId: value.agent.agent_id,
    findingsCount: value.agent.findings.length,
    evidenceCount: value.evidence.sourceHandles.length,
    noSideEffects: value.noSideEffects, executionAuthority: value.executionAuthority,
    ...(typeof value.canContact === 'boolean' ? { canContact: value.canContact } : {}),
  } : undefined;
  // Only canonical locators and explicitly selected safe facts cross private IPC.
  return {
    request_id: body.request_id, reply: body.reply,
    user_turn: { turnId: body.user_turn.turnId, conversationId: body.user_turn.conversationId },
    ...(body.coordination ? { coordination: {
      run_id: body.coordination.run_id, scope: body.coordination.scope,
      state: body.coordination.state, revision_id: body.coordination.revision_id,
      revision: body.coordination.revision, current: body.coordination.current,
      replayed: body.coordination.replayed, domains: body.coordination.domains,
    } } : {}),
    ...(body.analysis ? { analysis: part(body.analysis) } : {}),
    ...(body.recommendation ? { recommendation: part(body.recommendation) } : {}),
  };
}
function publicResponse(body) {
  const { request_id, user_turn, coordination, ...safe } = responseProjection(body);
  return {
    ...safe, requestHash: opaque(request_id),
    userTurnHash: opaque(user_turn.turnId), conversationHash: opaque(user_turn.conversationId),
    ...(coordination ? { coordination: {
      scope: coordination.scope, state: coordination.state,
      revision: coordination.revision, current: coordination.current,
      replayed: coordination.replayed, domains: coordination.domains,
      runHash: opaque(coordination.run_id), revisionHash: opaque(coordination.revision_id),
    } } : {}),
  };
}

async function submit(page, prompt) {
  const before = page.apiRequests('/ai/chat').length;
  const mayaCount = await page.eval('Q.all(\'[data-chat-message="maya"]\').length');
  assert.equal(await page.fill('Q.composer()', prompt), true);
  assert.ok(await page.waitFor('Q.byName("button", /^Отправить$/)?.getAttribute("aria-disabled") === "false"'));
  await clickNamed(page, 'Отправить');
  const request = await until(() => page.apiRequests('/ai/chat').slice(before).find((item) => item.finishedAt), 'actual combined chat response', 30_000);
  assert.equal(request.status, 201);
  const body = JSON.parse(await page.responseBody(request.requestId));
  assert.ok(typeof body.reply === 'string');
  assert.ok(await page.waitFor(`Q.all('[data-chat-message="maya"]').length === ${mayaCount + 1} && Q.all('[data-chat-message="maya"]').at(-1)?.textContent.replace(/^MAYA: /, '').replace(/\\s+/g, ' ').trim() === ${JSON.stringify(normal(body.reply))}`), 'Exactly one coherent actual UI response');
  await quietHttp(page);
  assert.equal(page.apiRequests('/ai/chat').length, before + 1, 'One explicit gesture submits one chat request');
  return body;
}

async function main() {
  assert.equal(process.connected, true, 'Use the owned two-stage HTTP/PG runner');
  const pendingInput = receive('start');
  process.send({ type: 'ready' });
  const input = await pendingInput;
  assert.ok(['prepare', 'resume'].includes(input.stage));
  assert.deepEqual(input.prompts, PROMPTS);
  assert.ok(typeof input.email === 'string' && /^wl-[a-f0-9]{8}@widgets-live\.test$/.test(input.email));
  const backendOrigin = localOrigin(input.backendOrigin);
  assert.ok(path.isAbsolute(input.output));
  assert.ok(input.notBefore === undefined || (Number.isFinite(input.notBefore) && input.notBefore <= Date.now() + 65_000));
  if (input.stage === 'resume') {
    assert.ok(uuid(input.initialRunId) && uuid(input.conversationId));
    assert.ok(typeof (input.initialReply ?? input.firstReply) === 'string');
    assert.equal(input.pendingQuestion ?? input.clarification, CLARIFICATION);
    assert.equal(input.correctedPrompt, PROMPTS.corrected);
  }
  const output = path.join(input.output, 'output', 'playwright');
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  assert.equal(fs.existsSync(path.join(output, 'browser.json')), false, 'Never overwrite evidence');
  const report = {
    contract: 'maya.client-value-browser/1', stage: input.stage, status: 'running',
    actualCurrentReact: false, realLocalHttp: false, scriptedSemanticSelection: true,
    syntheticSourceInputs: true, realC7C8Owners: 'qualified separately by parent HTTP/PG evidence',
    realModelAcceptance: false, liveProviderAcceptance: false, deploymentAcceptance: false,
    snapshots: {}, observations: {},
  };
  let activeStep = 'startup', browser, chromeChild, chromeProfile, dev, page, guard, closing;
  let chromeClose, chromeClosed = false, devClosed = false;
  const cleanupIssues = [];
  const cleanup = () => closing ??= (async () => {
    try { if (browser) await bounded(browser.close(), 3000, 'Browser cleanup bound'); }
    catch { /* Always reach owned-process cleanup even when CDP is gone. */ }
    finally {
      if (chromeChild && chromeChild.exitCode === null) {
        try { chromeChild.kill('SIGKILL'); }
        catch { cleanupIssues.push('chrome_kill_failed'); }
      }
      if (chromeClose) await bounded(chromeClose, 2000, 'Owned Chrome close bound').catch(() => cleanupIssues.push('chrome_close_unconfirmed'));
      if (chromeProfile) {
        try { fs.rmSync(chromeProfile, { recursive: true, force: true }); }
        catch { cleanupIssues.push('private_profile_cleanup_failed'); }
      }
      if (dev) await bounded(dev.close(), 3000, 'Dev server cleanup bound').then(() => { devClosed = true; }, () => { cleanupIssues.push('dev_close_unconfirmed'); });
    }
  })();
  const terminate = () => { void cleanup().finally(() => process.exit(2)); };
  process.once('SIGTERM', terminate); process.once('SIGINT', terminate); process.once('disconnect', terminate);
  const deadline = setTimeout(terminate, 180_000);
  async function capture(name) {
    await page.send('Page.bringToFront');
    assert.ok(await page.waitFor('!document.querySelector(".maya-typewriter-caret")', { timeoutMs: 20_000 }));
    assert.equal(await page.eval('Q.all("input[type=email],input[type=password],input[autocomplete=one-time-code]").some(Q.visible)'), false, 'No auth input in public screenshot');
    assert.equal(await page.eval(`document.body.innerText.includes(${JSON.stringify(input.email)})`), false, 'No auth email in public screenshot');
    assert.equal(await page.eval('Q.all("article.widget").length'), 0, 'Read reply exposes no CRM mutation card');
    assert.equal(await page.eval('Q.all("[role=log] [data-ref]").length'), 0, 'No effect control references in timeline');
    const mutationButton = await page.eval('Q.all(\'[role="log"] button,[role="log"] [role="button"]\').filter(Q.visible).some(el => /подтверд|создать запись|рассылк|отправить сообщение|списать|провести/i.test(Q.name(el)))');
    assert.equal(mutationButton, false, 'No CRM mutation button');
    await page.eval('Q.all(\'[data-chat-message="maya"]\').at(-1)?.scrollIntoView({block:"nearest"})');
    await page.eval('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))');
    report.snapshots[name] = await snapshot(page);
    const { data } = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(data, 'base64'), { flag: 'wx', mode: 0o600 });
  }
  async function restored(initialReply, expectedCalls) {
    const expected = normal(initialReply);
    assert.ok(await page.waitFor(`Q.all('[data-chat-message="maya"]').some(el => el.textContent.replace(/^MAYA: /, '').replace(/\\s+/g, ' ').trim() === ${JSON.stringify(expected)})`), 'Original combined answer restored');
    assert.ok(await page.waitFor(`Q.all('[data-chat-message="maya"]').at(-1)?.textContent.replace(/^MAYA: /, '').replace(/\\s+/g, ' ').trim() === ${JSON.stringify(CLARIFICATION)}`), 'Pending owner question restored');
    assert.ok(await page.waitFor(`Q.all('[data-chat-message="user"]').at(-1)?.textContent.includes(${JSON.stringify(PROMPTS.corrected)})`), 'Corrected date and branch remain the latest explicit scope');
    await quietHttp(page);
    assert.equal(page.apiRequests('/ai/chat').length, expectedCalls, 'Restoration submits no chat or new source work');
  }
  try {
    dev = createDevServer({ root: path.join(root, 'dist/web'), api: backendOrigin + '/api', upstreamPorts: [new URL(backendOrigin).port] });
    const { port } = await dev.listen(0);
    const origin = localOrigin(`http://127.0.0.1:${port}`);
    assert.equal(closing, undefined);
    chromeProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-client-value-chrome-'));
    fs.chmodSync(chromeProfile, 0o700);
    chromeChild = spawn(chrome, [
      '--headless=new', '--js-flags=--max-old-space-size=256', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--disable-extensions', '--disable-background-networking', '--disable-component-update',
      '--disable-sync', '--metrics-recording-only', '--remote-debugging-port=0', '--user-data-dir=' + chromeProfile,
      '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
      '--disable-quic', '--disable-features=OptimizationHints,MediaRouter', 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'ignore'] });
    chromeClose = new Promise((resolve) => chromeChild.once('close', (code, signal) => {
      chromeClosed = true; report.chromeExit = { code, signal }; resolve();
    }));
    let launchError;
    chromeChild.once('error', (error) => { launchError = error; });
    const portFile = path.join(chromeProfile, 'DevToolsActivePort');
    await until(() => {
      if (launchError) throw new Error('Owned Chrome launch failed');
      assert.equal(chromeChild.exitCode, null);
      return fs.existsSync(portFile);
    }, 'owned Chrome readiness');
    const [cdpPort, wsPath] = fs.readFileSync(portFile, 'utf8').trim().split('\n');
    assert.match(cdpPort, /^\d+$/); assert.match(wsPath, /^\/devtools\/browser\/[a-f0-9-]+$/);
    browser = new Browser(chromeChild, chromeProfile, `ws://127.0.0.1:${cdpPort}${wsPath}`);
    await bounded(browser.connect(), 10_000, 'Owned CDP connect timeout');
    report.chrome = await browser.version();
    page = await browser.newPage();
    guard = await installGuard(page, origin, { emails: [input.email] });
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
    await page.goto(origin + '/');
    activeStep = 'login';
    while (Date.now() < (input.notBefore ?? 0)) await pause(Math.min(1000, input.notBefore - Date.now()));
    let notBefore = await login(page, input.email);
    report.actualCurrentReact = true; report.realLocalHttp = true;
    if (input.stage === 'prepare') {
      activeStep = 'initial';
      const first = await submit(page, PROMPTS.overview);
      assertCompound(first, 'PARTIAL');
      report.observations.initial = publicResponse(first);
      await capture('initial'); await checkpoint('initial', { response: responseProjection(first), notBefore });
      activeStep = 'single-lifecycle';
      const single = await submit(page, PROMPTS.single);
      assertSingleLifecycle(single);
      assert.equal(single.user_turn.conversationId, first.user_turn.conversationId);
      assert.notEqual(single.coordination.run_id, first.coordination.run_id, 'The explicit standalone request owns a separate C9 run');
      assert.notEqual(single.coordination.revision_id, first.coordination.revision_id);
      assert.notEqual(single.recommendation.evidence.workReceiptId, first.recommendation.evidence.workReceiptId);
      report.observations['single-lifecycle'] = publicResponse(single);
      await capture('single-lifecycle'); await checkpoint('single-lifecycle', { response: responseProjection(single), notBefore });
      for (const key of ['scoped', 'corrected']) {
        activeStep = key;
        const body = await submit(page, PROMPTS[key]);
        assertClarification(body);
        assert.equal(body.user_turn.conversationId, first.user_turn.conversationId);
        report.observations[key] = publicResponse(body);
        await capture(key); await checkpoint(key, { response: responseProjection(body), notBefore });
      }
      activeStep = 'reload-restored';
      while (Date.now() < notBefore) await pause(Math.min(1000, notBefore - Date.now()));
      const calls = page.apiRequests('/ai/chat').length;
      await page.reload(); notBefore = await login(page, input.email);
      await restored(first.reply, calls);
      await capture('reload-restored'); await checkpoint('reload-restored', { notBefore });
      assert.equal(page.apiRequests('/ai/chat').length, 4);
    } else {
      activeStep = 'restart-restored';
      await restored(input.initialReply ?? input.firstReply, 0);
      await capture('restart-restored'); await checkpoint('restart-restored', { notBefore });
      activeStep = 'accepted';
      const accepted = await submit(page, PROMPTS.accept);
      assertCompound(accepted, 'PARTIAL');
      assert.equal(accepted.user_turn.conversationId, input.conversationId);
      assert.notEqual(accepted.coordination.run_id, input.initialRunId, 'Explicit acceptance creates new work, never revives the old run');
      report.observations.accepted = publicResponse(accepted);
      await capture('accepted');
      // Parent now changes C8 via its actual owner. The browser mutates no source.
      await checkpoint('accepted', { response: responseProjection(accepted), notBefore });
      activeStep = 'unavailable';
      const unavailable = await submit(page, PROMPTS.overview);
      assertCompound(unavailable, 'UNAVAILABLE');
      assert.equal(unavailable.user_turn.conversationId, input.conversationId);
      assert.notEqual(unavailable.coordination.run_id, accepted.coordination.run_id);
      report.observations.unavailable = publicResponse(unavailable);
      await capture('unavailable'); await checkpoint('unavailable', { response: responseProjection(unavailable), notBefore });
      assert.equal(page.apiRequests('/ai/chat').length, 2);
    }
    assert.deepEqual(guard.blocked, []); assert.deepEqual(guard.errors, []);
    assert.equal(page.exceptions.length, 0, 'No current React runtime exceptions');
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    // Do not archive assertion diffs, stack, auth responses or arbitrary exception text.
    report.failure = { step: activeStep, type: error?.name === 'AssertionError' ? 'assertion' : 'runtime' };
    if (page) { try { await capture('failure'); } catch { report.failureCapture = 'unavailable'; } }
    process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
    report.network = page ? [...page.requests.values()].map((request) => ({
      ...publicRequest(request), status: request.status ?? null, failed: Boolean(request.failed),
    })) : [];
    report.guard = guard ?? { blocked: [], errors: [] };
    try {
      await cleanup();
      report.cleanup = {
        chromeSpawned: Boolean(chromeChild), chromeClosed,
        privateProfileRemoved: !chromeProfile || !fs.existsSync(chromeProfile),
        devClosed, issues: cleanupIssues,
      };
      if (cleanupIssues.length) { report.status = 'failed'; process.exitCode = 1; }
      const serialized = JSON.stringify(report, null, 2) + '\n';
      assert.equal(serialized.includes(input.email), false, 'Public evidence must not contain the auth email');
      fs.writeFileSync(path.join(output, 'browser.json'), serialized, { flag: 'wx', mode: 0o600 });
    }
    finally {
      await cleanup();
      process.off('SIGTERM', terminate); process.off('SIGINT', terminate); process.off('disconnect', terminate);
      if (process.connected) process.disconnect();
    }
  }
}
if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url)
  main().catch(() => { process.stderr.write('Client-value browser proof failed before completion; no credentials are logged.\n'); process.exitCode = 1; });
