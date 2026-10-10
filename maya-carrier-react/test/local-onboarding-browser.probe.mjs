// Actual current React on the normal local launcher's web host. Synthetic accounts only.
// CDP is the installed browser automation seam; no downloads, injected session, request,
// API fulfillment or standalone relay. Lost reply drops the real signup 2xx at response
// stage AFTER validating the canonical receipt in memory. Root qualifies DB ownership.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Browser } from '../../maya-chat-shell/test/cdp-verify.mjs';

const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const digest = value => createHash('sha256').update(value).digest('hex');
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, names) => record(value) && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
const boundedText = (value, max = 256) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const opaqueId = value => boundedText(value, 128) && /^[A-Za-z0-9_-]+$/.test(value);
const API = Object.freeze({ activation: '/api/onboarding/trial-activations', signup: '/api/onboarding/trial', login: '/api/auth/login', logout: '/api/auth/logout', history: '/api/ai/conversation', widgets: '/api/widgets/resolve', crm: '/api/integrations/crm', branches: '/api/branches' });
const staticPath = /^\/(?:index\.html|styles\.css|manifest\.webmanifest|favicon\.ico|icons\/maya-(?:192|512|512-maskable|apple-180)\.png|m\/[A-Za-z0-9]{1,128}\/main\.js)?$/;
const finitePaths = new Set(Object.values(API));

export function localOrigin(raw) {
  const url = new URL(raw);
  assert.equal(url.protocol, 'http:'); assert.equal(url.hostname, '127.0.0.1');
  assert.ok(url.port && !['5432', '55611'].includes(url.port));
  assert.equal(url.username + url.password + url.search + url.hash, ''); assert.equal(url.pathname, '/');
  return url.origin;
}

// Pure finite admission for a request observed from the real UI. No request is constructed here.
export function admitted(request, origin, account, state) {
  try {
    const url = new URL(request.url);
    if (state.requestCount >= 80) return false;
    if (url.origin !== localOrigin(origin) || url.username || url.password || url.hash) return false;
    if (request.method === 'GET') {
      if (url.pathname === '/') return url.search === '?local_crm_setup=1';
      return !url.search && (staticPath.test(url.pathname) || [API.history, API.crm, API.branches].includes(url.pathname));
    }
    if (request.method !== 'POST' || url.search || typeof request.postData !== 'string' || request.postData.length > 16384) return false;
    const body = JSON.parse(request.postData);
    if (url.pathname === API.activation) return state.mode === 'prepare' && state.activationRequests === 0 && keys(body, ['source']) && body.source === 'web';
    if (url.pathname === API.signup) return state.mode === 'prepare' && state.signupRequests === 0 && keys(body, ['trialActivationToken', 'name', 'slug', 'ownerEmail', 'password', 'branchName', 'branchTimezone', 'calendarSource']) &&
      state.activation !== null && body.trialActivationToken === state.activation.token && body.name === account.name && body.slug === account.slug && body.ownerEmail === account.email && body.password === account.password && body.branchName === account.branchName && body.branchTimezone === account.branchTimezone && body.calendarSource === 'external';
    if (url.pathname === API.login) return keys(body, ['tenantSlug', 'email', 'password']) && body.tenantSlug === account.slug && body.email === account.email && body.password === account.password && state.loginRequests < 3;
    if (url.pathname === API.logout) return keys(body, []) && state.logoutRequests < 2;
    // Existing login restoration READ, including its real refusal, remains untouched.
    if (url.pathname === API.widgets) return keys(body, ['thread_page']) && keys(body.thread_page, ['limit']) && body.thread_page.limit === 20;
    return false;
  } catch { return false; }
}

async function bounded(promise, ms, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label)), ms); })]); }
  finally { clearTimeout(timer); }
}
async function until(read, label, ms = 20000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { const result = await read(); if (result) return result; await pause(50); }
  throw new Error(label);
}
function receive(type) {
  return new Promise((resolve, reject) => {
    const clear = () => { clearTimeout(timer); process.off('message', listener); process.off('disconnect', disconnected); };
    const listener = message => { if (message?.type === type) { clear(); resolve(message); } };
    const disconnected = () => { clear(); reject(new Error('parent_disconnected')); };
    const timer = setTimeout(() => { clear(); reject(new Error('parent_checkpoint_timeout')); }, 30000);
    process.on('message', listener); process.once('disconnect', disconnected);
  });
}
const named = (selector, name) => `Q.all(${JSON.stringify(selector)}).find(el => Q.visible(el) && Q.name(el) === ${JSON.stringify(name)})`;
async function click(page, name) {
  const el = named('button', name);
  assert.ok(await page.waitFor(`!!(${el}) && !(${el}).disabled`), 'required_enabled_control');
  assert.equal(await page.click(el), true, 'actual_pointer_click');
}
async function fill(page, label, value) {
  const el = named('input', label);
  assert.ok(await page.waitFor(`!!(${el}) && !(${el}).disabled`), 'required_enabled_field');
  assert.equal(await page.fill(el, value), true, 'actual_keyboard_input');
}
async function fillSignup(page, account) {
  for (const [label, value] of [['Название бизнеса', account.name], ['Короткое имя бизнеса для входа', account.slug], ['Название филиала', account.branchName], ['Email владельца', account.email], ['Пароль нового владельца', account.password]]) await fill(page, label, value);
  assert.ok(await page.focus("document.querySelector('select[name=branchTimezone]')"));
  const choice = await page.eval("Array.from(document.querySelector('select[name=branchTimezone]').options).find(option => option.value === " + JSON.stringify(account.branchTimezone) + ")?.textContent");
  assert.ok(choice, 'fixture_timezone_offered');
  // Native typeahead uses keyboard events, not Input.insertText or DOM value injection.
  for (const key of choice.split(' — ')[0]) {
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key, text: key, unmodifiedText: key, windowsVirtualKeyCode: 0 });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode: 0 });
  }
  await page.press('Tab');
  assert.equal(await page.eval("document.querySelector('select[name=branchTimezone]').value"), account.branchTimezone, 'explicit_timezone_selection');
}
async function confirmSignup(page) {
  assert.equal(await page.eval(`(${named('button', 'Создать бизнес')}).disabled`), true, 'explicit_consent_required');
  assert.ok(await page.focus("document.querySelector('input[name=confirmed]')"));
  await page.press('Space'); await click(page, 'Создать бизнес');
}
async function visible(page, text) { assert.ok(await page.waitFor(`document.body.innerText.includes(${JSON.stringify(text)})`), 'required_ui_copy'); }
async function quiet(page) {
  let since = null;
  await until(() => {
    if (page.apiRequests('/').some(r => !r.finishedAt && !r.failed)) { since = null; return false; }
    since ??= Date.now(); return Date.now() - since >= 300;
  }, 'http_not_settled');
}
function identity(body, account, expected = null) {
  const user = body?.user, tenant = body?.tenant ?? user?.tenant;
  assert.ok(opaqueId(tenant?.id) && opaqueId(user?.id) && opaqueId(user?.branch_id), 'canonical_identity_missing');
  assert.equal(user.tenant_id, tenant.id, 'owner_tenant_mismatch');
  assert.equal(user.email, account.email, 'owner_email_mismatch'); assert.equal(tenant.slug, account.slug, 'business_slug_mismatch');
  assert.equal(user.role, 'tenant_owner', 'canonical_owner_role'); assert.equal(user.status, 'active', 'canonical_owner_status');
  assert.ok(boundedText(body.access_token, 8192) && boundedText(body.refresh_token, 8192), 'issued_session_missing');
  const current = { tenantId: tenant.id, userId: user.id, branchId: user.branch_id };
  if (expected) assert.ok(Object.keys(current).every(key => current[key] === expected[key]), 'identity_changed_on_login');
  return current;
}
function loadConfig(configPath) {
  assert.ok(path.isAbsolute(configPath), 'private_config_absolute');
  const actual = fs.realpathSync(configPath), stat = fs.statSync(actual);
  assert.ok(stat.isFile() && stat.size <= 16384 && (stat.mode & 0o077) === 0, 'private_config_permissions');
  const config = JSON.parse(fs.readFileSync(actual, 'utf8'));
  assert.ok(keys(config, ['accounts']) && Array.isArray(config.accounts) && config.accounts.length === 2, 'finite_private_config');
  assert.deepEqual(config.accounts.map(account => account.key), ['success', 'lost-reply']);
  for (const account of config.accounts) {
    assert.ok(keys(account, ['key', 'name', 'slug', 'email', 'password', 'branchName', 'branchTimezone']), 'finite_account_fields');
    assert.ok(boundedText(account.name, 100) && /^(?:Синтетический|Synthetic)(?:\s|$)/u.test(account.name), 'synthetic_name_required');
    assert.ok(boundedText(account.branchName, 100) && boundedText(account.branchTimezone, 100), 'branch_fields_required');
    assert.ok(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(account.slug) && account.slug.length <= 100, 'synthetic_slug_shape');
    assert.ok(/^[a-z0-9._-]{1,64}@example\.invalid$/.test(account.email), 'synthetic_email_required');
    assert.ok(boundedText(account.password, 256) && account.password.length >= 12 && account.password === account.password.trim(), 'private_password_shape');
  }
  assert.notEqual(config.accounts[0].slug, config.accounts[1].slug); assert.notEqual(config.accounts[0].email, config.accounts[1].email);
  return config.accounts;
}

async function installGuard(page, origin, account, state) {
  const errors = [], blocked = [], tasks = new Set();
  const processEvent = async event => {
    const { requestId, request, responseStatusCode } = event.params;
    const pathname = new URL(request.url).pathname;
    if (responseStatusCode === undefined) {
      if (!admitted(request, origin, account, state)) {
        blocked.push({ method: ['GET', 'POST'].includes(request.method) ? request.method : 'other', path: finitePaths.has(pathname) ? pathname : '[unlisted]' });
        await page.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }); return;
      }
      state.requestCount++;
      if (pathname === API.activation) state.activationRequests++;
      if (pathname === API.signup) state.signupRequests++;
      if (pathname === API.login) state.loginRequests++;
      if (pathname === API.logout) state.logoutRequests++;
      await page.send('Fetch.continueRequest', { requestId }); return;
    }
    if (pathname === API.signup && state.expectCollision === true) {
      assert.equal(responseStatusCode, 500, 'current_collision_has_generic_server_error');
      const raw = await page.send('Fetch.getResponseBody', { requestId });
      const body = JSON.parse(raw.base64Encoded ? Buffer.from(raw.body, 'base64').toString('utf8') : raw.body);
      assert.equal(body.statusCode, 500); assert.equal(body.message, 'Internal server error');
      assert.equal(body.error?.code, undefined, 'no_safe_collision_code_yet');
      state.collisionObserved = true; state.activation = null;
      await page.send('Fetch.continueResponse', { requestId }); return;
    }
    assert.ok([200, 201].includes(responseStatusCode), 'required_auth_response_not_success');
    const raw = await page.send('Fetch.getResponseBody', { requestId });
    const text = raw.base64Encoded ? Buffer.from(raw.body, 'base64').toString('utf8') : raw.body;
    assert.ok(text.length <= 131072, 'bounded_auth_response');
    const body = JSON.parse(text);
    if (pathname === API.activation) {
      assert.ok(opaqueId(body.activation_id) && /^[A-Za-z0-9_-]{32,256}$/.test(body.activation_token), 'canonical_activation');
      assert.equal(body.status, 'pending'); assert.equal(body.source, 'web'); assert.equal(body.trial_starts_when, 'registration_completed');
      assert.equal(body.counted_as_connected_business, false); assert.ok(Date.parse(body.expires_at) > Date.now());
      assert.ok(Number.isInteger(body.trial_days) && body.trial_days > 0 && body.trial_days <= 365);
      state.activation = { id: body.activation_id, token: body.activation_token, days: body.trial_days };
    } else if (pathname === API.signup) {
      assert.equal(body.trial_activation?.activation_id, state.activation.id); assert.equal(body.trial_activation?.status, 'completed');
      assert.equal(body.trial_activation?.counted_as_connected_business, true); assert.equal(body.calendar_source, 'external');
      assert.equal(body.tenant?.calendar_source, 'external'); assert.equal(body.next_step, 'connect_crm'); assert.equal(body.booking_mode, 'preview');
      assert.equal(body.trial?.days, state.activation.days); assert.ok(Date.parse(body.trial?.ends_at) > Date.now());
      state.identity = identity(body, account); state.signupCommitted = true;
      // Drop ONLY the first real successful response. No body/header is fulfilled or changed.
      if (account.key === 'lost-reply') {
        assert.equal(state.lossInjected, false); state.lossInjected = true;
        state.activation = null;
        await page.send('Fetch.failRequest', { requestId, errorReason: 'Failed' }); return;
      }
      state.activation = null;
    } else if (pathname === API.login) {
      assert.ok(state.identity, 'expected_identity_required_for_recovery');
      identity(body, account, state.identity); state.verifiedLogins++;
    }
    await page.send('Fetch.continueResponse', { requestId });
  };
  const listener = event => {
    if (event.sessionId !== page.sessionId || event.method !== 'Fetch.requestPaused') return;
    const task = processEvent(event).catch(async () => {
      errors.push('finite_browser_boundary_failed');
      await page.send('Fetch.failRequest', { requestId: event.params.requestId, errorReason: 'Failed' }).catch(() => {});
    });
    tasks.add(task); void task.finally(() => tasks.delete(task));
  };
  page.browser.listeners.add(listener);
  await page.send('Network.setBypassServiceWorker', { bypass: true });
  await page.send('Network.setBlockedURLs', { urls: ['ws://*', 'wss://*'] });
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }, ...[API.activation, API.signup, API.login].map(route => ({ urlPattern: origin + route, requestStage: 'Response' }))] });
  return { errors, blocked, async settled() { await bounded(Promise.all([...tasks]), 10000, 'interception_timeout'); assert.equal(errors.length, 0, 'boundary_processing_failure'); assert.equal(blocked.length, 0, 'unexpected_request_refused'); }, close() { page.browser.listeners.delete(listener); state.activation = null; } };
}

async function main() {
  assert.equal(process.connected, true, 'owned_parent_runner_required');
  const pendingInput = receive('start'); process.send({ type: 'ready' });
  const input = await pendingInput;
  const mode = input.mode ?? 'prepare'; assert.ok(['prepare', 'resume-login'].includes(mode));
  const origin = localOrigin(input.webOrigin); localOrigin(input.backendOrigin);
  assert.notEqual(origin, input.backendOrigin, 'normal_separate_web_host_required');
  assert.ok(path.isAbsolute(input.output), 'output_absolute');
  const accounts = loadConfig(input.configPath);
  if (mode === 'resume-login') {
    assert.ok(Array.isArray(input.expectedAccounts) && input.expectedAccounts.length === 2, 'two_resume_identities_required');
    assert.deepEqual(input.expectedAccounts.map(value => value.key), ['success', 'lost-reply']);
    assert.ok(input.expectedAccounts.every(value => keys(value, ['key', 'tenantId', 'userId', 'branchId'])), 'finite_resume_identity');
  }
  const carrierRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const index = fs.readFileSync(path.join(carrierRoot, 'dist/web/index.html'), 'utf8');
  const entries = [...index.matchAll(/src=["'](?:\.\/|\/)?(m\/[A-Za-z0-9]{1,128}\/main\.js)["']/g)];
  assert.equal(entries.length, 1, 'single_current_carrier_entry');
  const bundlePath = '/' + entries[0][1];
  const bundleSha256 = digest(fs.readFileSync(path.join(carrierRoot, 'dist/web', entries[0][1])));
  fs.mkdirSync(input.output, { recursive: true, mode: 0o700 });
  const output = fs.realpathSync(input.output);
  assert.ok(output.startsWith('/private/tmp/maya-') || output.startsWith('/tmp/maya-'), 'owned_scratch_output_required');
  const reportPath = path.join(output, 'browser.json'); assert.equal(fs.existsSync(reportPath), false, 'never_overwrite_evidence');
  const report = { contract: 'maya.local-onboarding.browser/1', mode, status: 'running', actualCurrentReact: false, bundleSha256, normalLocalWebHost: true, syntheticAccounts: true, authInjection: false, syntheticResponses: false, providerBrowserRequests: 0, modelBrowserRequests: 0, crmMutationRequests: 0, backendEffectsAndDatabaseRequireParentEvidence: true, checkpoints: [], accounts: [], cleanup: null };
  let activeStep = 'startup', browser, child, profile, childClose, closing;
  const currentIdentities = new Map();
  const cleanup = () => closing ??= (async () => {
    let clean = true;
    if (browser) await bounded(browser.close(), 4000, 'browser_close_bound').catch(() => { clean = false; });
    if (child && child.exitCode === null) { try { child.kill('SIGKILL'); } catch { clean = false; } }
    if (childClose) await bounded(childClose, 3000, 'chrome_exit_bound').catch(() => { clean = false; });
    if (profile) { try { fs.rmSync(profile, { recursive: true, force: true }); } catch { clean = false; } }
    return { chromeClosed: !child || child.exitCode !== null || child.signalCode !== null, privateProfileRemoved: !profile || !fs.existsSync(profile), clean };
  })();
  const terminate = () => { void cleanup().finally(() => process.exit(2)); };
  process.once('SIGTERM', terminate); process.once('SIGINT', terminate); process.once('disconnect', terminate);
  const deadline = setTimeout(terminate, 240000);
  async function checkpoint(name, account, state, extra = {}) {
    activeStep = name;
    const publicEntry = { name, account: account.key, signupRequests: state.signupRequests, activationRequests: state.activationRequests, verifiedLogins: state.verifiedLogins, ...extra };
    report.checkpoints.push(publicEntry);
    const ack = receive('continue:' + name);
    process.send({ type: 'checkpoint', ...publicEntry, identity: { key: account.key, slug: account.slug, email: account.email, ...state.identity } });
    await ack;
  }
  async function crmRead(page, state, account) {
    await visible(page, 'Локальное подключение YCLIENTS'); await quiet(page);
    const before = page.apiRequests('/integrations/crm').length;
    assert.equal(await page.eval(`(${named('button', 'Активировать и импортировать')}).disabled`), true);
    assert.equal(await page.eval(`(${named('button', 'Проверить и сохранить подключение')}).disabled`), true);
    await click(page, 'Проверить подключение и результат');
    const result = await until(() => page.apiRequests('/integrations/crm').slice(before).find(r => r.finishedAt), 'crm_status_missing');
    await quiet(page);
    assert.equal(page.apiRequests('/integrations/crm').length, before + 1);
    if (result.status === 403) {
      await visible(page, 'Доступ к настройке подключения не подтверждён');
      state.crmReadOutcome = 'owner_or_feature_refused';
    } else {
      assert.equal(result.status, 200, 'finite_crm_status');
      const body = JSON.parse(await page.responseBody(result.requestId));
      assert.equal(body.configured, false); assert.equal(body.connection, null, 'new_business_has_no_connection');
      const branches = page.apiRequests('/branches').at(-1); assert.ok(branches?.finishedAt && branches.status === 200, 'actual_owned_branches_read');
      const listed = JSON.parse(await page.responseBody(branches.requestId));
      assert.ok(Array.isArray(listed) && listed.length === 1, 'single_bootstrap_branch');
      assert.equal(listed[0].id, state.identity.branchId); assert.equal(listed[0].tenant_id, state.identity.tenantId);
      assert.equal(listed[0].name, account.branchName); assert.equal(listed[0].timezone, account.branchTimezone);
      await visible(page, `${account.branchName} · ${account.branchTimezone}`);
      state.crmReadOutcome = 'unconnected';
    }
    assert.equal(await page.eval(`(${named('button', 'Активировать и импортировать')}).disabled`), true);
    assert.equal(await page.eval(`(${named('button', 'Проверить и сохранить подключение')}).disabled`), true);
    assert.equal(await page.eval('Q.all("input[type=password]").every(el => el.value === "")'), true, 'no_retained_secret');
    await page.eval('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  }
  async function passwordLogin(page, account, state, fromRecovery = false) {
    if (fromRecovery) await click(page, 'Перейти ко входу по паролю');
    else await click(page, 'Войти по паролю');
    await fill(page, 'Короткое имя бизнеса для входа', account.slug); await fill(page, 'Email', account.email); await fill(page, 'Пароль', account.password);
    const before = state.verifiedLogins;
    await click(page, 'Войти'); await visible(page, 'Локальное подключение YCLIENTS');
    await until(() => state.verifiedLogins === before + 1, 'canonical_login_unverified');
    await quiet(page);
  }
  try {
    profile = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-onboarding-chrome-')); fs.chmodSync(profile, 0o700);
    child = spawn(chrome, ['--headless=new', '--js-flags=--max-old-space-size=256', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--metrics-recording-only', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--disable-quic', '--disable-features=OptimizationHints,MediaRouter', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore'] });
    childClose = new Promise(resolve => child.once('close', resolve));
    let launchFailed = false; child.once('error', () => { launchFailed = true; });
    process.send({ type: 'owned-process', kind: 'chrome', pid: child.pid });
    const portFile = path.join(profile, 'DevToolsActivePort');
    await until(() => { assert.equal(launchFailed, false); assert.equal(child.exitCode, null); return fs.existsSync(portFile); }, 'owned_chrome_unready', 15000);
    const [port, wsPath] = fs.readFileSync(portFile, 'utf8').trim().split('\n');
    assert.match(port, /^\d+$/); assert.match(wsPath, /^\/devtools\/browser\/[a-f0-9-]+$/);
    browser = new Browser(child, profile, `ws://127.0.0.1:${port}${wsPath}`); await bounded(browser.connect(), 10000, 'cdp_connect_bound');
    for (const account of accounts) {
      activeStep = account.key + '-start';
      const expected = input.expectedAccounts?.find(value => value.key === account.key);
      if (mode === 'resume-login') assert.ok(expected && ['tenantId', 'userId', 'branchId'].every(key => opaqueId(expected[key])), 'resume_expected_identity_required');
      const state = { mode, requestCount: 0, activationRequests: 0, signupRequests: 0, loginRequests: 0, logoutRequests: 0, verifiedLogins: 0, activation: null, identity: expected ? { tenantId: expected.tenantId, userId: expected.userId, branchId: expected.branchId } : null, signupCommitted: false, lossInjected: false, crmReadOutcome: null };
      const page = await browser.newPage(); const guard = await installGuard(page, origin, account, state);
      try {
        await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
        await page.send('Network.setCacheDisabled', { cacheDisabled: true });
        await page.goto(origin + '/?local_crm_setup=1');
        const entry = await until(() => [...page.requests.values()].find(request => new URL(request.url).pathname === bundlePath && request.finishedAt), 'current_carrier_entry_missing');
        assert.equal(entry.status, 200);
        const servedBundle = await page.responseBody(entry.requestId);
        assert.ok(typeof servedBundle === 'string' && servedBundle.length <= 2097152, 'bounded_current_carrier_bundle');
        assert.equal(digest(servedBundle), bundleSha256, 'normal_host_must_serve_current_carrier_bytes');
        report.actualCurrentReact = true;
        if (mode === 'resume-login') {
          await passwordLogin(page, account, state); await crmRead(page, state, account);
          await checkpoint(account.key + '-restart-login', account, state, { crmReadOutcome: state.crmReadOutcome });
        } else {
          await click(page, 'Создать бизнес');
          await fillSignup(page, account);
          assert.equal(state.activationRequests + state.signupRequests, 0, 'no_automatic_onboarding');
          await confirmSignup(page);
          if (account.key === 'success') {
            await visible(page, 'Бизнес создан'); await visible(page, 'CRM ещё нужно подключить. Доступ к функциям и действиям определяет сервер.');
            assert.equal(state.signupCommitted, true); await quiet(page);
            await checkpoint('success-created', account, state);
            await click(page, 'Продолжить'); await crmRead(page, state, account);
            await checkpoint('success-crm-read', account, state, { crmReadOutcome: state.crmReadOutcome });
          } else {
            await visible(page, 'Создание бизнеса не подтверждено: ответ мог потеряться после сохранения.');
            assert.equal(state.lossInjected, true); assert.equal(state.signupCommitted, true);
            assert.equal(await page.eval(`!!(${named('button', 'Создать бизнес')})`), false, 'uncertain_has_no_resubmit_control');
            assert.equal(await page.eval('Q.all("input[type=password]").every(el => el.value === "")'), true);
            await quiet(page); await checkpoint('lost-reply-committed', account, state);
            await passwordLogin(page, account, state, true); await crmRead(page, state, account);
            await checkpoint('lost-reply-recovered', account, state, { crmReadOutcome: state.crmReadOutcome });
          }
          await page.reload(); await click(page, 'Войти по паролю');
          // Password form after reload must not contain an injected or persisted password.
          assert.equal(await page.eval(`(${named('input', 'Пароль')}).value`), '');
          await fill(page, 'Короткое имя бизнеса для входа', account.slug); await fill(page, 'Email', account.email); await fill(page, 'Пароль', account.password);
          const before = state.verifiedLogins; await click(page, 'Войти'); await visible(page, 'Локальное подключение YCLIENTS');
          await until(() => state.verifiedLogins === before + 1, 'reload_login_identity_unverified'); await crmRead(page, state, account);
          await checkpoint(account.key + '-reload-login', account, state, { crmReadOutcome: state.crmReadOutcome });
          await click(page, 'Выйти'); await quiet(page); await passwordLogin(page, account, state); await crmRead(page, state, account);
          await checkpoint(account.key + '-signout-login', account, state, { crmReadOutcome: state.crmReadOutcome });
        }
        await quiet(page); await guard.settled();
        assert.equal(state.signupRequests, mode === 'prepare' ? 1 : 0); assert.equal(state.activationRequests, mode === 'prepare' ? 1 : 0);
        assert.equal(state.loginRequests, mode === 'resume-login' ? 1 : account.key === 'success' ? 2 : 3);
        assert.equal(page.apiRequests('/integrations/crm').filter(r => r.method !== 'GET').length, 0);
        assert.equal(page.apiRequests('/ai/chat').length, 0); assert.equal(page.apiRequests('/widgets/intent').length, 0);
        assert.equal(page.exceptions.length, 0, 'uncaught_browser_exception');
        const calls = page.apiRequests('/').map(request => ({ method: request.method, path: finitePaths.has(new URL(request.url).pathname) ? new URL(request.url).pathname : '[unlisted]', status: request.status ?? null, failed: !!request.failed }));
        currentIdentities.set(account.key, { ...state.identity });
        report.accounts.push({ key: account.key, identityHash: digest(JSON.stringify(state.identity)), signupRequests: state.signupRequests, activationRequests: state.activationRequests, loginRequests: state.loginRequests, logoutRequests: state.logoutRequests, verifiedLogins: state.verifiedLogins, responseLossInjectedAfterCommit: state.lossInjected, crmReadOutcome: state.crmReadOutcome, requests: calls });
      } finally { guard.close(); await bounded(page.close(), 3000, 'page_close_bound').catch(() => {}); }
    }
    if (mode === 'prepare') {
      activeStep = 'slug-collision';
      const existing = accounts[0];
      const account = { ...existing, key: 'collision', email: 'collision@example.invalid' };
      const state = { mode, requestCount: 0, activationRequests: 0, signupRequests: 0, loginRequests: 0, logoutRequests: 0, verifiedLogins: 0, activation: null, identity: currentIdentities.get(existing.key), signupCommitted: false, lossInjected: false, expectCollision: true, collisionObserved: false };
      const page = await browser.newPage(); const guard = await installGuard(page, origin, account, state);
      try {
        await page.goto(origin + '/?local_crm_setup=1');
        const entry = await until(() => [...page.requests.values()].find(request => new URL(request.url).pathname === bundlePath && request.finishedAt), 'collision_current_entry_missing');
        assert.equal(digest(await page.responseBody(entry.requestId)), bundleSha256);
        await click(page, 'Создать бизнес'); await fillSignup(page, account);
        assert.equal(state.signupRequests + state.activationRequests, 0);
        await confirmSignup(page);
        await visible(page, 'Создание бизнеса не подтверждено: ответ мог потеряться после сохранения.');
        await quiet(page); await guard.settled();
        assert.equal(state.collisionObserved, true); assert.equal(state.signupCommitted, false);
        assert.equal(state.signupRequests, 1); assert.equal(state.activationRequests, 1);
        assert.equal(await page.eval(`!!(${named('button', 'Создать бизнес')})`), false);
        assert.equal(await page.eval('Q.all("input[type=password]").every(el => el.value === "")'), true);
        await page.press('Enter'); await quiet(page); assert.equal(state.signupRequests, 1);
        await checkpoint('slug-collision-rejected', existing, state, { collision: true, httpStatus: 500, errorCode: null });
        report.collision = { httpStatus: 500, errorCode: null, ui: 'uncertain_no_repeat', signupRequests: 1, activationRequests: 1, rollbackRequiresParentDatabaseEvidence: true };
        assert.equal(page.exceptions.length, 0);
      } finally { guard.close(); await bounded(page.close(), 3000, 'collision_page_close_bound').catch(() => {}); }
    }
    report.status = 'PASS';
  } catch {
    report.status = 'FAIL'; report.failedCheckpoint = activeStep; report.failure = 'bounded_browser_assertion_failed';
    process.exitCode = 1;
  } finally {
    clearTimeout(deadline); process.off('SIGTERM', terminate); process.off('SIGINT', terminate); process.off('disconnect', terminate);
    report.cleanup = await cleanup();
    if (!report.cleanup.clean || !report.cleanup.chromeClosed || !report.cleanup.privateProfileRemoved) { report.status = 'FAIL'; process.exitCode = 1; }
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    process.send?.({ type: 'finished', mode, status: report.status, reportPath });
    if (process.connected) process.disconnect();
  }
}

// Importing the finite guard for offline checks never starts a browser or reads private config.
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  main().catch(() => { process.stderr.write('local_onboarding_browser_probe_failed_before_report\n'); process.exitCode = 1; if (process.connected) process.disconnect(); });
}
