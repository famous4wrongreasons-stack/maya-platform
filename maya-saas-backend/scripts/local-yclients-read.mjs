// Separate, explicitly invoked local setup-read session. Existing stage 0 stays
// closed to providers. No token is accepted through argv, files or inherited env.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createDevServer } from '../../maya-chat-shell/dev/serve.mjs';
import { PRIVATE_KEYS, migrationConfigSource, assertPrivateCwd, externalStatePath, localBrowserBoundary } from './local-onboarding-profile.mjs';
import { sourceBinding, sessionPlan, stage } from './local-onboarding.mjs';
import { realReadEnvironment } from './local-yclients-read-profile.mjs';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.dirname(backend);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export const READ_SOURCE_FILES = Object.freeze([
  'maya-saas-backend/scripts/local-yclients-read.mjs',
  'maya-saas-backend/scripts/local-yclients-read-profile.mjs',
  'maya-saas-backend/scripts/local-yclients-read-runtime.mjs',
  'maya-saas-backend/scripts/local-yclients-read-transport.mjs',
  'maya-saas-backend/scripts/local-yclients-read-profile.test.mjs',
  'maya-saas-backend/scripts/local-yclients-read.test.mjs',
]);
export const LOCAL_READ_HEADERS = Object.freeze({
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
});
const PREPARATION_MS = 15 * 60000;
const ROUTE_KINDS = Object.freeze(['companies', 'company', 'book_services', 'services', 'categories', 'team']);

export function readSummaryProjection(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message) || Object.keys(message).length !== 5 || message.type !== 'read-summary' || message.contract !== 'maya.local-yclients-read/1') return null;
  if (!Number.isSafeInteger(message.calls) || message.calls < 0 || message.calls > 256 || !Number.isSafeInteger(message.refused) || message.refused < 0) return null;
  if (!message.routes || typeof message.routes !== 'object' || Array.isArray(message.routes)) return null;
  const entries = Object.entries(message.routes);
  if (entries.some(([key, value]) => !ROUTE_KINDS.includes(key) || !Number.isSafeInteger(value) || value < 0 || value > 256)) return null;
  if (entries.reduce((sum, [, count]) => sum + count, 0) !== message.calls) return null;
  return { calls: message.calls, refused: message.refused, routes: Object.fromEntries(entries) };
}

export function protectWebResponse(response) {
  const forced = new Set(Object.keys(LOCAL_READ_HEADERS).map(name => name.toLowerCase()));
  const writeHead = response.writeHead;
  response.writeHead = function (status, reasonOrHeaders, explicitHeaders) {
    const reason = typeof reasonOrHeaders === 'string' ? reasonOrHeaders : undefined;
    const supplied = reason === undefined ? reasonOrHeaders : explicitHeaders;
    assert.ok(supplied === undefined || (supplied !== null && typeof supplied === 'object' && !Array.isArray(supplied)), 'Unexpected local response header shape');
    const headers = { ...Object.fromEntries(Object.entries(supplied ?? {}).filter(([name]) => !forced.has(name.toLowerCase()))), ...LOCAL_READ_HEADERS };
    return reason === undefined ? writeHead.call(this, status, headers) : writeHead.call(this, status, reason, headers);
  };
}

export function readSourceBinding() {
  const base = sourceBinding();
  const git = args => execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 }).trim();
  assert.equal(git(['status', '--porcelain', '--untracked-files=all', '--', ...READ_SOURCE_FILES]), '', 'Setup-read source must be committed and clean');
  const files = READ_SOURCE_FILES.map(filename => {
    const line = git(['ls-tree', base.head, '--', filename]);
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(line);
    assert.ok(match && match[3] === filename, 'Setup-read source must be an exact committed file');
    const file = path.join(repo, filename), stat = fs.lstatSync(file);
    assert.ok(stat.isFile() && !stat.isSymbolicLink());
    const bytes = fs.readFileSync(file);
    const gitBlob = createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
    assert.equal(gitBlob, match[2], 'Setup-read source changed');
    return { path: filename, gitBlob, sha256: digest(bytes) };
  });
  assert.equal(git(['rev-parse', 'HEAD']), base.head, 'Source commit changed during binding');
  return { head: base.head, files: [...base.files, ...files] };
}

export function readSessionPlan(options) {
  const plan = sessionPlan(options);
  return { ...plan, preparationDeadlineMs: PREPARATION_MS, promptDeadlineMs: 600000,
    runtime: { ...plan.runtime, args: [path.join(backend, 'scripts/local-yclients-read-runtime.mjs')] } };
}

const cancelledInput = () => Object.assign(new Error('Hidden partner input cancelled'), { code: 'local_yclients_read_cancelled' });
export function partnerTokenShape(value) {
  return typeof value === 'string' && value.length >= 16 && value.length <= 4096 && /^[\x21-\x7e]+$/.test(value) && !value.includes(',');
}

// Unit tests use finite public strings and fake TTY events. Real invocation uses
// only the owner's foreground terminal, never a pipe, environment or token file.
export async function promptPartnerToken({ input = process.stdin, output = process.stderr, timeoutMs = 600000, signal } = {}) {
  assert.equal(input.isTTY, true, 'An interactive terminal is required');
  assert.equal(output.isTTY, true, 'An interactive terminal is required');
  assert.equal(typeof input.setRawMode, 'function');
  assert.equal(input.readableLength, 0, 'Previously buffered terminal input refused');
  assert.equal(input.readableEncoding ?? null, null, 'Pre-decoded terminal input refused');
  assert.equal(input.listenerCount('data') + input.listenerCount('readable'), 0, 'Exclusive terminal input required');
  assert.ok(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 600000);
  if (signal?.aborted) throw cancelledInput();
  return new Promise((resolve, reject) => {
    const bytes = Buffer.alloc(4096);
    let length = 0, settled = false, timer;
    const wasRaw = input.isRaw === true, wasFlowing = input.readableFlowing === true;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      input.off('data', onData); input.off('end', onEnd); input.off('error', onError);
      signal?.removeEventListener('abort', onAbort);
      let token;
      if (!error) {
        token = bytes.subarray(0, length).toString('ascii');
        if (!partnerTokenShape(token)) error = new Error('Hidden partner input refused');
      }
      bytes.fill(0); length = 0;
      try { input.setRawMode(wasRaw); if (!wasFlowing) input.pause(); output.write('\n'); }
      catch { error = new Error('Terminal restoration failed'); }
      if (error) reject(error); else resolve(token);
    };
    const onEnd = () => finish(cancelledInput());
    const onError = () => finish(new Error('Terminal input failed'));
    const onAbort = () => finish(cancelledInput());
    const onData = chunk => {
      if (!Buffer.isBuffer(chunk)) { finish(new Error('Terminal byte input required')); return; }
      try {
        if (chunk.length > 4098) { finish(new Error('Hidden partner input exceeded its bound')); return; }
        for (let index = 0; index < chunk.length; index += 1) {
          const byte = chunk[index];
          if (byte === 3 || byte === 4) { finish(cancelledInput()); return; }
          if (byte === 10 || byte === 13) {
            if (chunk.subarray(index + 1).some(value => value !== 10 && value !== 13)) finish(new Error('Multiple terminal values refused'));
            else finish();
            return;
          }
          if (byte === 8 || byte === 127) { if (length > 0) bytes[--length] = 0; continue; }
          if (byte < 0x21 || byte > 0x7e || byte === 0x2c || length === bytes.length) { finish(new Error('Hidden partner input refused')); return; }
          bytes[length++] = byte;
        }
      } finally { chunk.fill(0); }
    };
    try {
      input.setRawMode(true);
      input.on('data', onData); input.once('end', onEnd); input.once('error', onError);
      signal?.addEventListener('abort', onAbort, { once: true });
      output.write('Partner token YCLIENTS (hidden; Enter confirms, Ctrl-C cancels): ');
      timer = setTimeout(() => finish(new Error('Hidden partner input deadline')), timeoutMs);
      input.resume();
      if (signal?.aborted) onAbort();
    } catch { finish(new Error('Terminal preparation failed')); }
  });
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}
function alive(pid) { try { process.kill(-pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } }
function signalGroup(pid, signal) { try { process.kill(-pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
async function stopGroup(pid) {
  if (!pid || !alive(pid)) return;
  signalGroup(pid, 'SIGTERM');
  let end = Date.now() + 5000;
  while (alive(pid) && Date.now() < end) await delay(50);
  if (alive(pid)) signalGroup(pid, 'SIGKILL');
  end = Date.now() + 5000;
  while (alive(pid) && Date.now() < end) await delay(50);
  assert.equal(alive(pid), false, 'Owned runtime group remained alive');
}

export const LANDING_HTML = '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>MAYA — локальное подключение YCLIENTS</title><main style="font:18px system-ui;max-width:760px;margin:40px auto;padding:20px"><h1>Локальное подключение YCLIENTS</h1><p>Текущая форма MAYA и обычный backend работают с отдельной PostgreSQL на этом Mac. Создайте бизнес через «Создать бизнес» или войдите через «Войти по паролю».</p><p>Партнёрский токен вводится скрыто в терминале и действует только в этом сеансе; launcher не сохраняет его. Пользовательский API-токен вводится вручную в существующей форме подключения. Backend сохраняет его зашифрованным в локальной PostgreSQL через обычного владельца CRM-настройки.</p><p>После вашего явного действия разрешены только чтения YCLIENTS для настройки подключения. Сохранение подключения меняет локальную конфигурацию. Отдельная активация и импорт могут создать локальных сотрудников и связи филиала; это отдельное действие формы. Записи в YCLIENTS, чтение клиентов и записей, модель, исходящие сообщения и фоновые задачи закрыты.</p><p>Служебные ключи и база остаются вместе в приватном каталоге сессии. Этот локальный запуск не подтверждает iPhone или HTTPS-доступ.</p><p><a href="/?local_crm_setup=1">Открыть текущую форму</a></p></main></html>';

async function runReadRuntime(plan, runtimeEnv, state, control, manifest, save) {
  let child;
  try { child = spawn(plan.runtime.command, plan.runtime.args, { cwd: state, env: runtimeEnv, detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] }); }
  finally { delete runtimeEnv.YCLIENTS_PARTNER_TOKEN; }
  let dev, timer, killTimer, cancelled, summary, summaryCount = 0, summaryRefused = false, wasReady = false;
  child.on('message', message => {
    if (message?.type !== 'read-summary') return;
    summaryCount += 1;
    const projected = readSummaryProjection(message);
    if (!projected || summaryCount !== 1) summaryRefused = true;
    else summary = projected;
  });
  const closed = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); });
  void closed.catch(() => {});
  const terminate = () => { if (!child.pid) return; signalGroup(child.pid, 'SIGTERM'); killTimer ??= setTimeout(() => signalGroup(child.pid, 'SIGKILL'), 5000); cancelled?.(); };
  control.terminate = terminate;
  try {
    const message = await Promise.race([
      new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('Setup-read runtime startup deadline')), 60000); child.once('message', resolve); }),
      closed.then(() => { throw new Error('Setup-read runtime stopped before ready'); }),
    ]);
    clearTimeout(timer);
    assert.equal(message?.type, 'ready'); assert.equal(message.contract, 'maya.local-yclients-read/1');
    assert.equal(message.providerAdmission, 'explicit_setup_reads_only');
    const origin = `http://127.0.0.1:${runtimeEnv.PORT}`;
    assert.equal(message.origin, origin);
    dev = createDevServer({ root: path.join(repo, 'maya-carrier-react/dist/web'), api: origin + '/api', upstreamPorts: [String(runtimeEnv.PORT)], upstreamTimeoutMs: 125000 });
    const handlers = dev.server.listeners('request'); dev.server.removeAllListeners('request');
    dev.server.on('request', (request, response) => {
      protectWebResponse(response);
      // The shared relay drops Origin, so enforce the browser boundary first.
      if (!localBrowserBoundary(request.headers, runtimeEnv.CORS_ALLOWED_ORIGINS, new URL(runtimeEnv.CORS_ALLOWED_ORIGINS).host)) {
        response.writeHead(403, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        response.end('{"error":{"code":"local_yclients_read_origin_refused"}}'); return;
      }
      if (request.method === 'GET' && request.url === '/__local-yclients-read') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(LANDING_HTML); return;
      }
      for (const handler of handlers) handler.call(dev.server, request, response);
    });
    await dev.listen(Number(new URL(runtimeEnv.CORS_ALLOWED_ORIGINS).port));
    manifest.status = 'ready'; manifest.readyAt = new Date().toISOString();
    manifest.providerAdmission = 'explicit_setup_reads_only';
    manifest.landingUrl = runtimeEnv.CORS_ALLOWED_ORIGINS + '/__local-yclients-read';
    manifest.expiresAt = new Date(Date.now() + plan.durationMs).toISOString(); save();
    wasReady = true;
    process.stdout.write(`Local YCLIENTS setup-read session ready: ${manifest.landingUrl}\nProvider writes, model and outbound notifications remain closed. Ctrl-C stops this owned session.\n`);
    await Promise.race([
      new Promise(resolve => { cancelled = resolve; timer = setTimeout(resolve, plan.durationMs); if (control.cancelled) resolve(); }),
      closed.then(() => { throw new Error('Setup-read runtime stopped unexpectedly'); }),
    ]);
  } finally {
    clearTimeout(timer);
    try { await dev?.close(); }
    finally {
      try { await stopGroup(child.pid); }
      finally { clearTimeout(killTimer); control.terminate = null; manifest.runtimeGroupAbsent = !child.pid || !alive(child.pid); }
    }
    const exit = await closed.catch(() => null);
    const validSummary = exit?.code === 0 && exit.signal === null && summary && !summaryRefused && summaryCount === 1;
    manifest.providerReadSummary = validSummary ? summary : null;
    manifest.providerReadSummaryStatus = validSummary ? 'reported_at_clean_stop' : 'missing_or_unclean';
    if (wasReady) assert.ok(validSummary, 'Clean runtime read summary unavailable');
  }
}

export async function main(args) {
  const { values } = parseArgs({ args, strict: true, options: { run: { type: 'boolean' }, state: { type: 'string' }, minutes: { type: 'string', default: '15' }, 'pg-bin': { type: 'string', default: '/opt/homebrew/opt/postgresql@16/bin' } } });
  if (!values.run) { process.stdout.write('Prepared only. Explicit --run --state=/absolute/fresh/private-directory requires an owner terminal; partner token is entered later, hidden. No service or provider call has started.\n'); return; }
  assert.equal(process.platform, 'darwin');
  assert.equal(process.stdin.isTTY, true, 'An owner terminal is required before preparation');
  assert.equal(process.stderr.isTTY, true, 'An owner terminal is required before preparation');
  const proposedState = externalStatePath(values.state, repo);
  const minutes = Number(values.minutes); assert.ok(Number.isSafeInteger(minutes) && minutes >= 1 && minutes <= 15);
  for (const name of ['initdb', 'pg_ctl', 'createdb']) fs.accessSync(path.join(values['pg-bin'], name), fs.constants.X_OK);
  for (const dir of [backend, path.join(backend, 'prisma'), path.join(repo, 'maya-carrier-react')]) for (const name of ['.env', '.env.local']) assert.equal(fs.existsSync(path.join(dir, name)), false, 'Build dotenv files are refused');
  const source = readSourceBinding();
  fs.mkdirSync(proposedState, { mode: 0o700 });
  const state = fs.realpathSync(proposedState); assertPrivateCwd(state);
  const ports = new Set();
  for (let attempt = 0; ports.size < 3 && attempt < 9; attempt += 1) { const port = await freePort(); if (![5432, 55611].includes(port)) ports.add(port); }
  assert.equal(ports.size, 3, 'Distinct local port allocation exhausted');
  const [pgPort, apiPort, webPort] = [...ports];
  const password = randomBytes(32).toString('hex');
  const keys = Object.fromEntries(PRIVATE_KEYS.map(key => [key, randomBytes(32).toString('hex')]));
  const database = 'maya_local_onboarding_' + randomBytes(8).toString('hex');
  const options = { databaseUrl: `postgresql://maya_local_onboarding:${password}@127.0.0.1:${pgPort}/${database}`, keys, apiPort, origin: `http://127.0.0.1:${webPort}`, stateDirectory: state };
  const env = realReadEnvironment(process.env, options);
  assert.equal(Object.hasOwn(env, 'YCLIENTS_PARTNER_TOKEN'), false, 'Provider material must not enter the private environment file');
  assert.equal(Object.hasOwn(env, 'MAYA_LOCAL_ONBOARDING_PROFILE'), false);
  assert.equal(env.MAYA_LOCAL_YCLIENTS_READ_PROFILE, 'read_setup_v1');
  fs.writeFileSync(path.join(state, 'service-keys.json'), JSON.stringify({ contract: 'maya.local-yclients-read-private-state/1', environment: env }) + '\n', { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(path.join(state, 'pg-password'), password + '\n', { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(path.join(state, 'pgpass'), `127.0.0.1:${pgPort}:*:maya_local_onboarding:${password}\n`, { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(path.join(state, 'prisma.config.mjs'), migrationConfigSource(backend), { flag: 'wx', mode: 0o600 });
  const plan = readSessionPlan({ stateDirectory: state, pgBin: values['pg-bin'], database, pgPort, apiPort, webPort, minutes });
  const manifest = {
    contract: 'maya.local-yclients-read-session/1', status: 'preparing', providerAdmission: 'not_started', qualifiedAcceptance: false,
    source, stateDirectory: state, ownedCluster: plan.cluster, creation: 'fresh-exclusive-directory_then-initdb', completed: [],
    resources: { nodeHeapMb: 3072, pgSharedBuffersMb: 64, pgWorkMemMb: 4, pgMaxConnections: 30 },
    deadlines: { preparationMs: plan.preparationDeadlineMs, promptMs: plan.promptDeadlineMs, runtimeMs: plan.durationMs },
    privateStateRetained: true, partnerTokenPersistence: false, userTokenStorage: 'existing_A17_encryption_in_private_PG_after_explicit_connect',
  };
  const save = () => fs.writeFileSync(path.join(state, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  const control = { cancelled: null, terminate: null };
  const cancel = signal => { control.cancelled ??= signal; control.terminate?.(); };
  const int = () => cancel('SIGINT'), term = () => cancel('SIGTERM');
  process.on('SIGINT', int); process.on('SIGTERM', term);
  const preparationTimer = setTimeout(() => cancel('PREPARATION_DEADLINE'), plan.preparationDeadlineMs);
  let pgAttempted = false;
  try {
    save();
    for (const spec of plan.setup) {
      if (spec.name === 'pg-start') pgAttempted = true;
      process.stdout.write(spec.name + '\n');
      const buildEnv = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'LANG', 'TZ', 'NODE_OPTIONS'].filter(key => env[key] !== undefined).map(key => [key, env[key]]));
      await stage(spec, spec.name.endsWith('-build') ? buildEnv : env, state, control);
      manifest.completed.push(spec.name); save();
    }
    assert.equal(control.cancelled, null);
    assert.deepEqual(readSourceBinding(), source, 'Source changed during preparation');
    clearTimeout(preparationTimer); // Preparation is complete; allow the owner a separate bounded input window.
    const abort = new AbortController(); control.terminate = () => abort.abort();
    manifest.status = 'awaiting_owner_partner_token'; save();
    let partnerToken = await promptPartnerToken({ timeoutMs: plan.promptDeadlineMs, signal: abort.signal });
    control.terminate = null;
    const runtimeEnv = realReadEnvironment(env, options, partnerToken);
    partnerToken = undefined;
    try {
      assert.equal(Object.hasOwn(env, 'YCLIENTS_PARTNER_TOKEN'), false);
      assert.equal(control.cancelled, null);
      assert.deepEqual(readSourceBinding(), source, 'Source changed before owner session');
      clearTimeout(preparationTimer);
      await runReadRuntime(plan, runtimeEnv, state, control, manifest, save);
    }
    finally { delete runtimeEnv.YCLIENTS_PARTNER_TOKEN; }
    manifest.status = control.cancelled ? 'cancelled' : 'stopped';
  } catch (error) {
    if (error?.code === 'local_yclients_read_cancelled') control.cancelled ??= 'TTY_CANCELLED';
    const cancelledBeforeReady = control.cancelled && !manifest.readyAt;
    manifest.status = cancelledBeforeReady ? 'cancelled' : 'failed';
    if (!cancelledBeforeReady) throw new Error('Local setup-read session failed');
  } finally {
    clearTimeout(preparationTimer); control.terminate = null;
    if (pgAttempted) {
      try { await stage(plan.stop, env, state, { cancelled: null, terminate: null }); manifest.clusterStopped = true; }
      catch { manifest.clusterStopped = false; manifest.status = 'failed-owned-cluster-stop'; }
    }
    try { manifest.sourceUnchanged = JSON.stringify(readSourceBinding()) === JSON.stringify(source); } catch { manifest.sourceUnchanged = false; }
    if (!manifest.sourceUnchanged) manifest.status = 'failed-source-changed';
    save(); process.off('SIGINT', int); process.off('SIGTERM', term);
  }
  assert.ok(['stopped', 'cancelled'].includes(manifest.status));
  process.stdout.write('Owned setup-read session stopped. Private database and service keys retained; partner token was not persisted by the launcher.\n');
}
if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url)
  main(process.argv.slice(2)).catch(() => { console.error('Local YCLIENTS setup-read session refused or stopped; no credential values recorded'); process.exitCode = 1; });
