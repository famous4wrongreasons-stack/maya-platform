// Child of the isolated HTTP/PG proof. Actual emitted React/runtime/callback;
// actual owner-launcher HTTP server/relay to the owned AppModule; no production host.
// Only the Telegram authorization page is synthetic in this browser. The parent
// owns a synthetic signed issuer, CRM source and model response; guards are real.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Browser, Page } from '../../maya-chat-shell/test/cdp-verify.mjs';
import { createReadWebServer } from '../../maya-saas-backend/scripts/local-yclients-read.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let origin, web;
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
  actualReact: true, actualRuntime: true, actualBackendHttp: true, actualLocalWebBoundary: true, realTelegram: false,
  actualLauncherRuntimeAdmission: false, callbackRequests: [], apiResponses: 0,
  syntheticIssuerCrmModel: true, externalRequestsDispatched: 0,
  networkBoundary: 'browser HTTP to actual loopback launcher/relay plus CDP synthetic provider and deny proxy/resolver; no OS packet claim',
  checks: [], starts: 0, completes: 0, accountLinks: 0, passwordLogins: 0, chat: [], history: [] };
const errors = [];
let browser, page, popup, providerReady = false, state, stopping;
const stop = () => stopping ??= (async () => {
  await browser?.close();
  if (web) { web.server.closeAllConnections(); await web.close(); }
  report.webListenerStopped = !web || !web.server.listening;
  report.browserStopped = !browser || browser.child.exitCode !== null || browser.child.signalCode !== null;
  fs.writeFileSync(path.join(input.output, 'browser.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
})();
const abort = () => { report.status = 'FAIL'; report.failure = 'proof interrupted'; void stop().finally(() => process.exit(2)); };
for (const signal of ['SIGTERM', 'SIGINT', 'disconnect']) process.once(signal, abort);
const check = async (expression, label, target = page) => { assert.ok(await target.waitFor(expression), label); report.checks.push(label); };
const button = text => `Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes(${JSON.stringify(text)}))`;
const allowed = new Map([
  ['/api/auth/login', 'POST'], ['/api/auth/oauth/telegram/link/start', 'POST'], ['/api/auth/oauth/telegram/link/complete', 'POST'],
  ['/api/mobile/pwa/search', 'GET'], ['/api/auth/oauth/telegram/start', 'POST'],
  ['/api/auth/oauth/telegram/complete', 'POST'], ['/api/ai/conversation', 'GET'],
  ['/api/ai/chat', 'POST'], ['/api/widgets/resolve', 'POST'],
]);
// Test-only pass-through observer: never substitutes bytes or sends a request.
// All values here belong to the isolated synthetic fixture, not the saved owner DB.
function observeHttp(req, res) {
  const url = new URL(req.url, origin);
  if (url.pathname === '/oauth-callback.html') {
    report.callbackRequests.push({ method: req.method, site: req.headers['sec-fetch-site'] ?? null,
      mode: req.headers['sec-fetch-mode'] ?? null, destination: req.headers['sec-fetch-dest'] ?? null });
    let callbackCsp;
    const writeHead = res.writeHead;
    res.writeHead = function(status, reasonOrHeaders, explicitHeaders) {
      const headers = typeof reasonOrHeaders === 'string' ? explicitHeaders : reasonOrHeaders;
      callbackCsp = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === 'content-security-policy')?.[1];
      return writeHead.apply(this, arguments);
    };
    res.once('finish', () => {
      if (res.statusCode !== 200 || !String(callbackCsp).includes("script-src 'sha256-"))
        errors.push('canonical callback status/CSP refused');
    });
  }
  if (allowed.get(url.pathname) !== req.method) return;
  const requestChunks = [], responseChunks = [];
  req.on('data', chunk => requestChunks.push(Buffer.from(chunk)));
  const write = res.write, end = res.end;
  const capture = (chunk, encoding) => {
    if (chunk !== undefined && chunk !== null) responseChunks.push(Buffer.isBuffer(chunk) ? Buffer.from(chunk) : Buffer.from(chunk, typeof encoding === 'string' ? encoding : undefined));
  };
  res.write = function(chunk, encoding, ...rest) { capture(chunk, encoding); return write.call(this, chunk, encoding, ...rest); };
  res.end = function(chunk, encoding, ...rest) { capture(chunk, encoding); return end.call(this, chunk, encoding, ...rest); };
  res.once('finish', () => {
    try {
      const reqData = Buffer.concat(requestChunks).toString();
      const body = reqData ? JSON.parse(reqData) : undefined;
      const bytes = Buffer.concat(responseChunks).toString();
      assert.ok(url.pathname === '/api/mobile/pwa/search' || url.search === '');
      assert.ok((res.statusCode >= 200 && res.statusCode < 300) || (url.pathname === '/api/widgets/resolve' && res.statusCode === 403), url.pathname + ' status=' + res.statusCode);
      report.apiResponses++;
      if (url.pathname === '/api/auth/oauth/telegram/start') {
        assert.deepEqual(body, { tenantSlug: input.tenantSlug, platform: 'web', redirectUri: origin + '/oauth-callback.html' }); report.starts++;
      }
      if (url.pathname === '/api/auth/oauth/telegram/complete') {
        assert.deepEqual(body, { state, code: 'synthetic-code' }); report.completes++;
      }
      if (url.pathname === '/api/auth/login') {
        assert.ok(input.syntheticOwner); assert.equal(report.passwordLogins, 0);
        assert.deepEqual(body, { tenantSlug: input.tenantSlug, email: input.syntheticOwner.email, password: input.syntheticOwner.password });
        report.passwordLogins++;
      }
      if (url.pathname === '/api/auth/oauth/telegram/link/start') {
        assert.ok(input.syntheticOwner); assert.deepEqual(body, { platform: 'web', redirectUri: origin + '/oauth-callback.html' });
      }
      if (url.pathname === '/api/auth/oauth/telegram/link/complete') {
        assert.ok(input.syntheticOwner); assert.equal(report.accountLinks, 0);
        assert.deepEqual(body, { state, code: 'synthetic-code' });
        report.accountLinks++;
      }
      if (url.pathname === '/api/ai/chat') {
        assert.deepEqual(Object.keys(body).sort(), ['surface', 'requestId', 'messages', ...(body.conversationId ? ['conversationId'] : [])].sort());
        assert.equal(body.messages.at(-1).content, input.questions[report.chat.length]);
        assert.equal(body.surface, 'web');
      }

      if (url.pathname === '/api/ai/chat') {
        const value = JSON.parse(bytes); assert.equal(value.grounding.status, 'verified'); assert.equal(value.action, null);
        const index = report.chat.length; assert.ok(value.reply.includes(index < 2 ? 'визит состоялся' : 'Предстоящих: 1'));
        assert.doesNotMatch(value.reply, /foreign-same-time|Synthetic provider private note|Synthetic source-only name/);
        report.chat.push({ reply: value.reply, responseSha256: hash(bytes), requestIdSha256: hash(body.requestId), authorityFieldsSent: false });
      }
      if (url.pathname === '/api/ai/conversation') {
        const value = JSON.parse(bytes); report.history.push({ conversationIdSha256: value.conversationId ? hash(value.conversationId) : null, roles: value.turns.map(t => t.role) });
      }

    } catch (error) { errors.push(error.message); }
    finally { for (const chunk of [...requestChunks, ...responseChunks]) chunk.fill(0); }
  });
}
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
  if (url.origin === origin && req.method === 'GET' && url.pathname === '/oauth-callback.html')
    return browser.send('Fetch.continueRequest', { requestId: event.requestId }, sessionId);
  if (url.origin === origin && allowed.get(url.pathname) === req.method)
    return browser.send('Fetch.continueRequest', { requestId: event.requestId }, sessionId);
  if (url.origin === origin && req.method === 'GET' && !url.search) {
    const dist = path.join(root, 'dist/web');
    const file = path.resolve(dist, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (file.startsWith(dist + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile())
      return browser.send('Fetch.continueRequest', { requestId: event.requestId }, sessionId);
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
  await until(() => report.history.length === report.completes + report.passwordLogins, 'canonical conversation restore');
}
async function linkExistingOwner() {
  await page.goto(origin + '/');
  await check(`!!${button('Войти по паролю')}`, 'existing owner password entry');
  assert.ok(await page.click(button('Войти по паролю')));
  await check(`!!document.querySelector('input[aria-label="Пароль"]')`, 'existing account form');
  for (const [label, value] of [['Короткое имя бизнеса для входа', input.tenantSlug], ['Email', input.syntheticOwner.email], ['Пароль', input.syntheticOwner.password]])
    assert.ok(await page.fill(`document.querySelector('input[aria-label="${label}"]')`, value));
  assert.ok(await page.click(button('Войти')));
  await check(`!!${button('Приватность и данные')}`, 'password session retained');
  await until(() => report.history.length === 1, 'initial owner history');
  assert.ok(await page.click(button('Приватность и данные')));
  await check(`!!${button('Подключить Telegram к этому аккаунту')}`, 'canonical authenticated linking control');
  popup = null; providerReady = false;
  assert.ok(await page.click(button('Подключить Telegram к этому аккаунту')));
  await until(() => popup && providerReady, 'link provider window');
  assert.equal(await popup.eval('window.opener'), null);
  await popup.eval('location.replace("https://oauth.telegram.org/auth?synthetic_return=1")');
  await page.send('Page.bringToFront');
  await check(`document.querySelector('section[aria-label="Вход через Telegram"]')?.textContent.includes('Telegram подключён к вашему аккаунту')`, 'A23 confirms account link without replacing session');
  const shot = await page.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(input.output, 'account-link.png'), Buffer.from(shot.data, 'base64'));
  assert.equal(report.completes, 0); assert.equal(report.accountLinks, 1);
}
try {
  const env = { PORT: backend.port, CORS_ALLOWED_ORIGINS: 'http://127.0.0.1:59992' };
  web = createReadWebServer({ diagnosticNoProvider: true }, env);
  web.server.prependListener('request', observeHttp);
  await web.listen(0);
  origin = 'http://127.0.0.1:' + web.server.address().port; env.CORS_ALLOWED_ORIGINS = origin;
  browser = await Browser.launch('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--disable-quic',
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
  if (input.syntheticOwner) await linkExistingOwner();
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
  assert.equal(report.callbackRequests.length, input.syntheticOwner ? 3 : 2);
  assert.ok(report.callbackRequests.every(r => r.method === 'GET' && r.site === 'cross-site' && r.mode === 'navigate' && r.destination === 'document'));
  assert.ok(report.apiResponses >= 10);
  report.checks.push('actual cross-site returns through owner launcher and canonical HTTP relay');
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
