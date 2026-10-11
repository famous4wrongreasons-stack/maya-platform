// Child of the isolated HTTP/PG proof. Actual emitted React/runtime/callback;
// exact HTTP requests relay to the owned AppModule, never a production host.
// Only the Telegram authorization page is synthetic in this browser. The parent
// owns a synthetic signed issuer, CRM source and model response; guards are real.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Browser, Page } from '../../maya-chat-shell/test/cdp-verify.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'https://maya.example';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, label) {
  for (let i = 0; i < 300; i++) { const value = await read(); if (value) return value; await pause(50); }
  throw new Error('Timeout: ' + label);
}
assert.equal(process.connected, true, 'isolated proof parent required');
const input = await new Promise(resolve => {
  process.once('message', resolve);
  process.send({ type: 'ready' });
});
assert.equal(input.type, 'start');
process.send({ type: 'stage', stage: 'validate-backend' });
const backend = new URL(input.backendOrigin);
assert.equal(backend.protocol, 'http:'); assert.equal(backend.hostname, '127.0.0.1');
assert.ok(Number(backend.port) > 1024); assert.equal(backend.username + backend.password + backend.search + backend.hash, '');
assert.equal(backend.pathname, '/');
process.send({ type: 'stage', stage: 'validate-output' });
assert.match(input.output, /^\/(?:private\/)?tmp\/maya-[\w-]+\/browser-(?:client|tenant_owner)$/);
assert.equal(fs.existsSync(input.output), false); fs.mkdirSync(input.output, { mode: 0o700 });
process.send({ type: 'stage', stage: 'verify-build' });
const verified = execFileSync(process.execPath, ['build.mjs', '--target=web', '--verify-output'], { cwd: root, encoding: 'utf8' });
fs.writeFileSync(path.join(input.output, 'packaging.log'), verified);
const report = { contract: 'maya.telegram-personal-browser/1', status: 'running',
  candidate: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  actualReact: true, actualRuntime: true, actualBackendHttp: true, realTelegram: false,
  syntheticIssuerCrmModel: true, externalRequestsDispatched: 0,
  networkBoundary: 'CDP finite relay to owned loopback backend plus deny proxy/resolver; no OS packet claim',
  checks: [], starts: 0, completes: 0, chat: [], history: [] };
const callback = fs.readFileSync(path.join(root, '../maya-saas-backend/deploy/platform/beget-edge/oauth-callback.html'));
const errors = [];
let browser, page, popup, providerReady = false, state, stopping;
const stop = () => stopping ??= (async () => {
  await browser?.close();
  report.browserStopped = !browser || browser.child.exitCode !== null || browser.child.signalCode !== null;
  fs.writeFileSync(path.join(input.output, 'browser.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
})();
const abort = () => { report.status = 'FAIL'; report.failure = 'proof interrupted'; void stop().finally(() => process.exit(2)); };
for (const signal of ['SIGTERM', 'SIGINT', 'disconnect']) process.once(signal, abort);
const check = async (expression, label, target = page) => { assert.ok(await target.waitFor(expression), label); report.checks.push(label); };
const button = text => `Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes(${JSON.stringify(text)}))`;
const allowed = new Map([
  ['/api/mobile/pwa/search', 'GET'], ['/api/auth/oauth/telegram/start', 'POST'],
  ['/api/auth/oauth/telegram/complete', 'POST'], ['/api/ai/conversation', 'GET'],
  ['/api/ai/chat', 'POST'], ['/api/widgets/resolve', 'POST'],
]);
async function intercept(sessionId, event) {
  const req = event.request, url = new URL(req.url);
  const fulfill = (code, body, headers = []) => browser.send('Fetch.fulfillRequest', {
    requestId: event.requestId, responseCode: code,
    responseHeaders: [{ name: 'Cache-Control', value: 'no-store' }, ...headers],
    body: Buffer.from(body).toString('base64'),
  }, sessionId);
  if (url.origin === 'https://oauth.telegram.org' && url.pathname === '/auth' && req.method === 'GET') {
    if (url.searchParams.get('synthetic_return') === '1') {
      return fulfill(302, '', [{ name: 'Location', value: origin + '/oauth-callback.html?state=' + encodeURIComponent(state) + '&code=synthetic-code' }]);
    }
    assert.equal(url.searchParams.get('redirect_uri'), origin + '/oauth-callback.html');
    assert.equal(url.searchParams.get('scope'), 'openid profile phone');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    state = url.searchParams.get('state'); assert.match(state, /^te_/);
    providerReady = true;
    return fulfill(200, '<!doctype html><title>Synthetic Telegram</title><p>Isolated authorization fixture</p>', [{ name: 'Content-Type', value: 'text/html' }]);
  }
  if (url.origin === 'https://oauth.telegram.org' && url.pathname === '/favicon.ico' && req.method === 'GET') return fulfill(204, '');
  if (url.origin === origin && allowed.get(url.pathname) === req.method) {
    assert.ok(url.pathname === '/api/mobile/pwa/search' || url.search === '');
    const body = req.postData === undefined ? undefined : JSON.parse(req.postData);
    if (url.pathname === '/api/auth/oauth/telegram/start') {
      assert.deepEqual(body, { tenantSlug: input.tenantSlug, platform: 'web', redirectUri: origin + '/oauth-callback.html' }); report.starts++;
    }
    if (url.pathname === '/api/auth/oauth/telegram/complete') {
      assert.deepEqual(body, { state, code: 'synthetic-code' }); report.completes++;
    }
    if (url.pathname === '/api/ai/chat') {
      assert.deepEqual(Object.keys(body).sort(), ['surface', 'requestId', 'messages', ...(body.conversationId ? ['conversationId'] : [])].sort());
      assert.equal(body.messages.at(-1).content, input.questions[report.chat.length]);
      assert.equal(body.surface, 'web');
    }
    // The test relay forwards only protocol headers. Tokens never enter a file,
    // report, command-line argument, parent IPC or diagnostic message.
    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) if (['authorization', 'content-type'].includes(key.toLowerCase())) headers[key] = value;
    const response = await fetch(input.backendOrigin + url.pathname + url.search, {
      method: req.method, headers, body: req.postData, redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    const bytes = await response.text();
    assert.ok((response.status >= 200 && response.status < 300) || (url.pathname === '/api/widgets/resolve' && response.status === 403), url.pathname + ' status=' + response.status);
    if (url.pathname === '/api/ai/chat') {
      const value = JSON.parse(bytes); assert.equal(value.grounding.status, 'verified'); assert.equal(value.action, null);
      const index = report.chat.length; assert.ok(value.reply.includes(index < 2 ? 'визит состоялся' : 'Предстоящих: 1'));
      assert.doesNotMatch(value.reply, /foreign-same-time|Synthetic provider private note|Synthetic source-only name/);
      report.chat.push({ reply: value.reply, responseSha256: hash(bytes), requestIdSha256: hash(body.requestId), authorityFieldsSent: false });
    }
    if (url.pathname === '/api/ai/conversation') {
      const value = JSON.parse(bytes); report.history.push({ conversationIdSha256: value.conversationId ? hash(value.conversationId) : null, roles: value.turns.map(t => t.role) });
    }
    return fulfill(response.status, bytes, [{ name: 'Content-Type', value: 'application/json' }]);
  }
  if (url.origin === origin && req.method === 'GET' && url.pathname === '/oauth-callback.html') {
    return fulfill(200, callback, [{ name: 'Content-Type', value: 'text/html' }]);
  }
  if (url.origin === origin && req.method === 'GET' && !url.search) {
    const dist = path.join(root, 'dist/web');
    const file = path.resolve(dist, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (file.startsWith(dist + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      return fulfill(200, fs.readFileSync(file), [{ name: 'Content-Type', value: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.webmanifest': 'application/manifest+json' })[path.extname(file)] ?? 'application/octet-stream' }]);
    }
  }
  errors.push('undeclared request refused: ' + req.method + ' ' + url.origin + url.pathname);
  await browser.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' }, sessionId);
}
async function login() {
  popup = null; providerReady = false; await page.goto(origin + '/');
  await check(`!!document.querySelector('textarea[aria-label="Название салона"]')`, 'finder rendered');
  await page.fill(`document.querySelector('textarea[aria-label="Название салона"]')`, input.tenantSlug);
  assert.ok(await page.click(button('Найти салон'))); await check(`!!${button(input.tenantName)}`, 'canonical business search');
  assert.ok(await page.click(button(input.tenantName))); await until(() => popup && providerReady, 'provider window');
  const timeOrigin = await page.eval('performance.timeOrigin');
  assert.equal(await popup.eval('window.opener'), null);
  await popup.eval('location.replace("https://oauth.telegram.org/auth?synthetic_return=1")');
  await page.send('Page.bringToFront');
  await check(`!!document.querySelector('[role="log"]')`, 'actual Telegram session opens AChat');
  assert.equal(await page.eval('performance.timeOrigin'), timeOrigin); report.checks.push('initiating document retained');
  await until(() => report.history.length === report.completes, 'canonical conversation restore');
}
try {
  browser = await Browser.launch('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--proxy-server=http://127.0.0.1:9', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--disable-quic',
  ]);
  browser.listeners.add(msg => {
    if (msg.method === 'Fetch.requestPaused') void intercept(msg.sessionId, msg.params).catch(error => { errors.push(error.message); void browser.send('Fetch.failRequest', { requestId: msg.params.requestId, errorReason: 'BlockedByClient' }, msg.sessionId).catch(() => {}); });
    if (msg.method === 'Target.attachedToTarget') void (async () => {
      const p = msg.params;
      if (p.targetInfo.type !== 'page' || !page || p.targetInfo.targetId === page.targetId) { await browser.send('Runtime.runIfWaitingForDebugger', {}, p.sessionId); return; }
      const child = new Page(browser, p.sessionId, p.targetInfo.targetId, page.browserContextId);
      await child.enable(); await child.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
      popup = child; await child.send('Runtime.runIfWaitingForDebugger');
    })().catch(error => errors.push(error.message));
  });
  page = await browser.newPage(); await page.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  await browser.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true, filter: [{ type: 'page', exclude: false }, { exclude: true }] });
  await page.send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 1, mobile: false });
  await login();
  // The source sync is a separate canonical owner, not a side effect of login
  // or a chat reader. Exercise it explicitly after the first verified binding.
  await new Promise((resolve, reject) => {
    process.once('message', message => message.type === 'source-ready' ? resolve() : reject(new Error('source phase refused')));
    process.send({ type: 'synchronize-canonical-source' });
  });
  report.checks.push('existing reconciliation owner synchronized after first binding');
  for (let i = 0; i < input.questions.length; i++) {
    assert.ok(await page.fill('Q.composer()', input.questions[i]));
    assert.ok(await page.click('Q.send()'));
    await until(() => report.chat.length === i + 1, 'HTTP private response');
    const expected = report.chat[i].reply.replace(/\s+/g, ' ').trim();
    await check(`Array.from(document.querySelectorAll('[data-chat-message="maya"]')).at(-1)?.textContent.replace(/^MAYA: /,'').replace(/\\s+/g,' ').trim() === ${JSON.stringify(expected)}`, 'canonical private reply ' + (i + 1));
  }
  assert.equal(new Set(report.chat.map(c => c.requestIdSha256)).size, 3);
  await login();
  await check(`document.querySelectorAll('[data-chat-message="maya"]').length === 3 && document.querySelectorAll('[data-chat-message="user"]').length === 3`, 'relogin restores exactly three message pairs');
  assert.deepEqual(report.history.at(-1).roles, ['user','assistant','user','assistant','user','assistant']);
  assert.equal(report.starts, 2); assert.equal(report.completes, 2); assert.equal(report.chat.length, 3);
  assert.deepEqual(errors, []);
  // Retain a synthetic-only UI screenshot. Reports contain no raw private reply.
  const shot = await page.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(input.output, 'history.png'), Buffer.from(shot.data, 'base64'));
  report.chat = report.chat.map(({ reply, ...receipt }) => ({ ...receipt, rendered: true }));
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL'; report.failure = error.message;
  report.chat = report.chat.map(({ reply, ...receipt }) => receipt);
  process.exitCode = 1;
} finally { report.errors = errors; await stop(); }
for (const signal of ['SIGTERM', 'SIGINT', 'disconnect']) process.off(signal, abort);
process.disconnect();
