// Source-only until an explicit --run. This prepares ordinary local onboarding,
// never provider admission. The private database and its keys remain together.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createDevServer } from '../../maya-chat-shell/dev/serve.mjs';
import { PRIVATE_KEYS, profileEnvironment, migrationConfigSource, assertPrivateCwd, externalStatePath, localBrowserBoundary } from './local-onboarding-profile.mjs';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.dirname(backend);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const sourcePaths = [
  'maya-saas-backend/src', 'maya-saas-backend/prisma', 'maya-saas-backend/prisma.config.ts',
  'maya-saas-backend/scripts/local-onboarding.mjs', 'maya-saas-backend/scripts/local-onboarding-profile.mjs',
  'maya-saas-backend/scripts/local-onboarding-runtime.mjs', 'maya-saas-backend/scripts/local-onboarding.test.mjs',
  'maya-saas-backend/scripts/local-onboarding-proof.mjs',
  'maya-saas-backend/scripts/local-onboarding-environment.test.mjs',
  'maya-saas-backend/package.json', 'maya-saas-backend/package-lock.json', 'maya-saas-backend/tsconfig.json', 'maya-saas-backend/tsconfig.build.json', 'maya-saas-backend/nest-cli.json',
  'maya-carrier-react/src', 'maya-carrier-react/tools', 'maya-carrier-react/index.html', 'maya-carrier-react/build.mjs', 'maya-carrier-react/package.json', 'maya-carrier-react/package-lock.json', 'maya-carrier-react/tsconfig.json',
  'maya-chat-shell/src', 'maya-chat-shell/dev', 'maya-chat-shell/build.mjs', 'maya-chat-shell/package.json',
];
function sourceBinding() {
  const git = args => execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
  const head = git(['rev-parse', 'HEAD']);
  assert.match(head, /^[a-f0-9]{40}$/);
  assert.equal(git(['status', '--porcelain', '--untracked-files=all', '--', ...sourcePaths]), '', 'Captured source must be committed and clean');
  const files = git(['ls-tree', '-r', head, '--', ...sourcePaths]).split('\n').filter(Boolean).map(line => {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(line);
    assert.ok(match, 'Only committed ordinary source files are accepted');
    const filename = path.join(repo, match[3]), stat = fs.lstatSync(filename);
    assert.ok(stat.isFile() && !stat.isSymbolicLink());
    const bytes = fs.readFileSync(filename);
    const blob = createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
    assert.equal(blob, match[2], 'Captured source changed');
    return { path: match[3], gitBlob: blob, sha256: digest(bytes) };
  });
  for (const filename of sourcePaths.filter(name => /\.(?:mjs|ts|json|html)$/.test(name))) assert.ok(files.some(file => file.path === filename), 'Required launcher source is not committed');
  return { head, files };
}
export function sessionPlan({ stateDirectory, pgBin, database, pgPort, apiPort, webPort, minutes = 15 }) {
  assert.ok(path.isAbsolute(stateDirectory) && !/[\s']/.test(stateDirectory));
  assert.ok(path.isAbsolute(pgBin));
  assert.match(database, /^maya_local_onboarding_[a-f0-9]{16}$/);
  for (const port of [pgPort, apiPort, webPort]) assert.ok(Number.isSafeInteger(port) && port > 1024 && port <= 65535 && ![5432, 55611].includes(port));
  assert.equal(new Set([pgPort, apiPort, webPort]).size, 3);
  assert.ok(Number.isSafeInteger(minutes) && minutes >= 1 && minutes <= 15);
  const cluster = path.join(stateDirectory, 'pg');
  const bin = name => path.join(pgBin, name);
  return {
    cluster, durationMs: minutes * 60000,
    setup: [
      { name: 'backend-build', command: process.execPath, args: [path.join(backend, 'node_modules/@nestjs/cli/bin/nest.js'), 'build'], cwd: backend },
      { name: 'react-build', command: process.execPath, args: [path.join(repo, 'maya-carrier-react/build.mjs'), '--target=web'], cwd: path.join(repo, 'maya-carrier-react') },
      { name: 'initdb', command: bin('initdb'), args: ['-D', cluster, '--auth-local=trust', '--auth-host=scram-sha-256', '--username=maya_local_onboarding', '--pwfile=' + path.join(stateDirectory, 'pg-password'), '--encoding=UTF8', '--locale=C'], cwd: stateDirectory },
      { name: 'pg-start', command: bin('pg_ctl'), args: ['-D', cluster, '-w', '-t', '30', '-l', path.join(stateDirectory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${pgPort} -k '' -c shared_buffers=64MB -c work_mem=4MB -c max_connections=30`, 'start'], cwd: stateDirectory },
      { name: 'createdb', command: bin('createdb'), args: ['--host=127.0.0.1', '--port=' + pgPort, '--username=maya_local_onboarding', '--no-password', database], cwd: stateDirectory, pgpass: true },
      { name: 'migrations', command: process.execPath, args: [path.join(backend, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--config=' + path.join(stateDirectory, 'prisma.config.mjs')], cwd: stateDirectory },
    ],
    stop: { name: 'pg-stop', command: bin('pg_ctl'), args: ['-D', cluster, '-m', 'fast', '-w', '-t', '30', 'stop'], cwd: stateDirectory },
    runtime: { command: process.execPath, args: [path.join(backend, 'scripts/local-onboarding-runtime.mjs')], cwd: stateDirectory },
  };
}
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}
function signalGroup(pid, signal) { try { process.kill(-pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
function alive(pid) { try { process.kill(-pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } }
async function stopGroup(pid) {
  if (!pid || !alive(pid)) return;
  signalGroup(pid, 'SIGTERM');
  let end = Date.now() + 5000;
  while (alive(pid) && Date.now() < end) await delay(50);
  if (alive(pid)) signalGroup(pid, 'SIGKILL');
  end = Date.now() + 5000;
  while (alive(pid) && Date.now() < end) await delay(50);
  assert.equal(alive(pid), false, 'Owned child group remained alive');
}
async function stage(spec, env, state, control) {
  if (control.cancelled && spec.name !== 'pg-stop') throw new Error('Session cancelled');
  // pg_ctl owns the intentional daemon separately via its private -D. Other
  // stages have their own process group, including compiler subprocesses.
  const detached = spec.name !== 'pg-start';
  const child = spawn(spec.command, spec.args, { cwd: spec.cwd, env: { ...env, ...(spec.pgpass ? { PGPASSFILE: path.join(state, 'pgpass') } : {}) }, detached, stdio: ['ignore', 'pipe', 'pipe'] });
  let killTimer, timer, timedOut = false, bytes = 0;
  const chunks = [];
  const terminate = () => {
    if (!child.pid) return;
    if (detached) signalGroup(child.pid, 'SIGTERM'); else child.kill('SIGTERM');
    killTimer ??= setTimeout(() => detached ? signalGroup(child.pid, 'SIGKILL') : child.kill('SIGKILL'), 5000);
  };
  control.terminate = terminate;
  const collect = chunk => { bytes += chunk.length; if (bytes <= 262144) chunks.push(chunk); else terminate(); };
  child.stdout.on('data', collect); child.stderr.on('data', collect);
  timer = setTimeout(() => { timedOut = true; terminate(); }, spec.name === 'pg-stop' ? 45000 : 180000);
  try {
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    assert.ok(code === 0 && !timedOut && bytes <= 262144, 'Owned preparation stage failed');
  } finally {
    clearTimeout(timer); clearTimeout(killTimer);
    if (detached && child.pid) await stopGroup(child.pid);
    control.terminate = null;
    let log = Buffer.concat(chunks).toString('utf8');
    for (const secret of [...PRIVATE_KEYS.map(key => env[key]), env.DATABASE_URL, ...(env.DATABASE_URL ? [new URL(env.DATABASE_URL).password] : [])]) if (secret) log = log.split(secret).join('[private]');
    fs.writeFileSync(path.join(state, spec.name + '.log'), log, { flag: 'wx', mode: 0o600 });
  }
}
async function runRuntime(plan, env, state, control, manifest, save) {
  const child = spawn(plan.runtime.command, plan.runtime.args, { cwd: state, env, detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  let dev, timeout, killTimer, cancelled;
  const closed = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); });
  void closed.catch(() => {});
  const terminate = () => { if (!child.pid) return; signalGroup(child.pid, 'SIGTERM'); killTimer ??= setTimeout(() => signalGroup(child.pid, 'SIGKILL'), 5000); cancelled?.(); };
  control.terminate = terminate;
  try {
    const message = await Promise.race([
      new Promise((resolve, reject) => { timeout = setTimeout(() => reject(new Error('Normal runtime startup deadline')), 60000); child.once('message', resolve); }),
      closed.then(() => { throw new Error('Normal runtime stopped before ready'); }),
    ]);
    clearTimeout(timeout);
    assert.equal(message?.contract, 'maya.normal-local-onboarding/1'); assert.equal(message.type, 'ready'); assert.equal(message.providerAdmission, false);
    const origin = `http://127.0.0.1:${env.PORT}`; assert.equal(message.origin, origin);
    dev = createDevServer({ root: path.join(repo, 'maya-carrier-react/dist/web'), api: origin + '/api', upstreamPorts: [String(env.PORT)], upstreamTimeoutMs: 15000 });
    const handlers = dev.server.listeners('request'); dev.server.removeAllListeners('request');
    dev.server.on('request', (request, response) => {
      // The shared transparent relay deliberately drops Origin. Enforce the
      // browser boundary before it; CORS alone does not prevent a POST effect.
      if (!localBrowserBoundary(request.headers, env.CORS_ALLOWED_ORIGINS, new URL(env.CORS_ALLOWED_ORIGINS).host)) {
        response.writeHead(403, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        response.end('{"error":{"code":"local_onboarding_origin_refused"}}');
        return;
      }
      if (request.method === 'GET' && request.url === '/__local-onboarding') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" });
        response.end('<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>MAYA — локальное создание бизнеса</title><main style="font:18px system-ui;max-width:720px;margin:40px auto;padding:20px"><h1>Локальное создание бизнеса MAYA</h1><p>Текущая форма и обычный backend работают с отдельной PostgreSQL на этом Mac. Создайте бизнес стандартной формой и сохраните выбранные slug, email и пароль приватно. Данные и служебные ключи остаются в приватном каталоге этой сессии.</p><p>Этот этап разрешает регистрацию и парольный вход. <strong>Не вводите токены YCLIENTS.</strong> Подключение провайдера пока закрыто; реальная модель, сообщения и фоновые задачи не запускаются. Доступ с iPhone/HTTPS не настроен.</p><p>Выберите «Создать бизнес» или «Войти по паролю». При потере ответа войдите с выбранными реквизитами; повторного создания автоматически нет.</p><p><a href="/?local_crm_setup=1">Открыть текущую форму</a></p></main></html>');
        return;
      }
      for (const handler of handlers) handler.call(dev.server, request, response);
    });
    await dev.listen(Number(new URL(env.CORS_ALLOWED_ORIGINS).port));
    manifest.status = 'ready'; manifest.readyAt = new Date().toISOString(); manifest.landingUrl = env.CORS_ALLOWED_ORIGINS + '/__local-onboarding'; manifest.expiresAt = new Date(Date.now() + plan.durationMs).toISOString(); save();
    process.stdout.write(`Normal local onboarding is ready: ${manifest.landingUrl}\nStage 0 only. Do not enter provider tokens. This is not real-provider acceptance.\nOwn session ends within ${plan.durationMs / 60000} minutes; Ctrl-C stops it.\n`);
    await Promise.race([
      new Promise(resolve => { cancelled = resolve; timeout = setTimeout(resolve, plan.durationMs); if (control.cancelled) resolve(); }),
      closed.then(() => { throw new Error('Normal runtime stopped unexpectedly'); }),
    ]);
  } finally {
    clearTimeout(timeout);
    await dev?.close();
    await stopGroup(child.pid);
    clearTimeout(killTimer); control.terminate = null;
    manifest.runtimeGroupAbsent = !child.pid || !alive(child.pid);
    await closed.catch(() => {});
  }
}
export async function main(args) {
  const { values } = parseArgs({ args, strict: true, options: { run: { type: 'boolean' }, state: { type: 'string' }, minutes: { type: 'string', default: '15' }, 'pg-bin': { type: 'string', default: '/opt/homebrew/opt/postgresql@16/bin' } } });
  if (!values.run) { process.stdout.write('Prepared only: an explicitly authorized future --run --state=/absolute/new/private-directory starts normal local onboarding. No provider admission.\n'); return; }
  assert.equal(process.platform, 'darwin');
  const proposedState = externalStatePath(values.state, repo);
  const minutes = Number(values.minutes); assert.ok(Number.isSafeInteger(minutes) && minutes >= 1 && minutes <= 15);
  for (const bin of ['initdb', 'pg_ctl', 'createdb']) fs.accessSync(path.join(values['pg-bin'], bin), fs.constants.X_OK);
  for (const dir of [backend, path.join(backend, 'prisma'), path.join(repo, 'maya-carrier-react')]) for (const file of ['.env', '.env.local']) assert.equal(fs.existsSync(path.join(dir, file)), false, 'Build dotenv files are refused');
  const source = sourceBinding();
  fs.mkdirSync(proposedState, { mode: 0o700 });
  const state = fs.realpathSync(proposedState); assertPrivateCwd(state);
  const ports = new Set();
  for (let attempt = 0; ports.size < 3 && attempt < 9; attempt += 1) { const port = await freePort(); if (![5432, 55611].includes(port)) ports.add(port); }
  assert.equal(ports.size, 3, 'Could not allocate three distinct local ports within nine attempts');
  const [pgPort, apiPort, webPort] = [...ports];
  // These are the only key-generation calls, behind explicit --run. Never log.
  const password = randomBytes(32).toString('hex');
  const keys = Object.fromEntries(PRIVATE_KEYS.map(key => [key, randomBytes(32).toString('hex')]));
  const database = 'maya_local_onboarding_' + randomBytes(8).toString('hex');
  const databaseUrl = `postgresql://maya_local_onboarding:${password}@127.0.0.1:${pgPort}/${database}`;
  const env = profileEnvironment(process.env, { databaseUrl, keys, apiPort, origin: `http://127.0.0.1:${webPort}`, stateDirectory: state });
  fs.writeFileSync(path.join(state, 'service-keys.json'), JSON.stringify({ contract: 'maya.local-onboarding-private-state/1', environment: env }) + '\n', { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(path.join(state, 'pg-password'), password + '\n', { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(path.join(state, 'pgpass'), `127.0.0.1:${pgPort}:*:maya_local_onboarding:${password}\n`, { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(path.join(state, 'prisma.config.mjs'), migrationConfigSource(backend), { flag: 'wx', mode: 0o600 });
  const plan = sessionPlan({ stateDirectory: state, pgBin: values['pg-bin'], database, pgPort, apiPort, webPort, minutes });
  const manifest = { contract: 'maya.normal-local-onboarding-session/1', status: 'preparing', providerAdmission: false, qualifiedAcceptance: false, source, stateDirectory: state, ownedCluster: plan.cluster, creation: 'fresh-exclusive-directory_then-initdb', completed: [], resources: { nodeHeapMb: 3072, pgSharedBuffersMb: 64, pgWorkMemMb: 4, pgMaxConnections: 30 }, privateStateRetained: true };
  const save = () => fs.writeFileSync(path.join(state, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  const control = { cancelled: null, terminate: null };
  const cancel = signal => { control.cancelled ??= signal; control.terminate?.(); };
  const int = () => cancel('SIGINT'), term = () => cancel('SIGTERM');
  process.on('SIGINT', int); process.on('SIGTERM', term);
  let pgAttempted = false;
  save();
  try {
    for (const spec of plan.setup) {
      if (spec.name === 'pg-start') pgAttempted = true;
      process.stdout.write(spec.name + '\n');
      const buildEnvironment = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'LANG', 'TZ', 'NODE_OPTIONS'].filter(key => env[key] !== undefined).map(key => [key, env[key]]));
      await stage(spec, spec.name.endsWith('-build') ? buildEnvironment : env, state, control);
      manifest.completed.push(spec.name); save();
    }
    assert.equal(control.cancelled, null);
    assert.deepEqual(sourceBinding(), source, 'Source changed during preparation');
    await runRuntime(plan, env, state, control, manifest, save);
    manifest.status = control.cancelled ? 'cancelled' : 'stopped';
  } catch { manifest.status = 'failed'; throw new Error('Normal local onboarding did not complete; inspect private stage metadata'); }
  finally {
    // A second termination signal must not interrupt cleanup of the owned DB.
    control.terminate = null;
    if (pgAttempted) {
      try { await stage(plan.stop, env, state, { cancelled: null, terminate: null }); manifest.clusterStopped = true; }
      catch { manifest.clusterStopped = false; manifest.status = 'failed-owned-cluster-stop'; }
    }
    try { manifest.sourceUnchanged = JSON.stringify(sourceBinding()) === JSON.stringify(source); } catch { manifest.sourceUnchanged = false; }
    if (!manifest.sourceUnchanged) manifest.status = 'failed-source-changed';
    save(); process.off('SIGINT', int); process.off('SIGTERM', term);
  }
  assert.ok(['stopped', 'cancelled'].includes(manifest.status));
  process.stdout.write('Owned session stopped. Private database and service keys were retained together; no provider admission was granted.\n');
}
if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url)
  main(process.argv.slice(2)).catch(() => { console.error('Normal local onboarding stopped with a controlled failure; no credential values recorded'); process.exitCode = 1; });

// The finite restart proof reuses the same runtime, relay and owned cleanup.
export { sourceBinding, stage, runRuntime };
