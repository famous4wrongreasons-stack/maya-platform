// Real compiled main + canonical gateway, on a newly created synthetic database.
// This is a finite local proof, never a phone-accessible server or release admission.
import assert from 'node:assert/strict';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { sessionPlan, sourceBinding, stage } from './local-onboarding.mjs';
import { PRIVATE_KEYS, FIXED_PROFILE, assertDatabaseUrl, externalStatePath, migrationConfigSource } from './local-onboarding-profile.mjs';
import { diagnosticSandboxPolicy } from './local-yclients-read-diagnostic.mjs';
import { preflight } from './staging-carrier-preflight.mjs';
import { readTree } from '../../maya-carrier-react/tools/payload-files.mjs';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.dirname(backend);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const extensions = [
  'maya-saas-backend/scripts/phone-backend-proof.mjs',
  'maya-saas-backend/scripts/local-yclients-read-diagnostic.mjs',
  'maya-saas-backend/scripts/staging-carrier-preflight.mjs',
  'maya-saas-backend/deploy/staging/Caddyfile',
  'maya-saas-backend/compose.staging.yml',
  'maya-saas-backend/deploy/platform/beget-edge/oauth-callback.html',
];
const { values } = parseArgs({ strict: true, options: {
  run: { type: 'boolean' }, out: { type: 'string' }, caddy: { type: 'string' },
  'pg-bin': { type: 'string', default: '/opt/homebrew/opt/postgresql@16/bin' },
} });
if (!values.run) { console.log('Prepared only. --run requires a fresh private output directory and an explicit Caddy binary. No retained database, provider or device access.'); process.exit(0); }
assert.equal(process.platform, 'darwin');
assert.match(values.out ?? '', /^\/(?:private\/)?tmp\/maya-phone-backend-[\w-]+$/);
assert.ok(values.caddy && path.isAbsolute(values.caddy));
for (const dir of [backend, path.join(backend, 'prisma'), path.join(repo, 'maya-carrier-react')])
  for (const name of ['.env', '.env.local']) assert.ok(!fs.existsSync(path.join(dir, name)), 'dotenv refused');
const source = sourceBinding(extensions);
const out = externalStatePath(values.out, repo);
fs.mkdirSync(out, { mode: 0o700 });
const report = { contract: 'maya.phone-backend-isolated-proof/1', candidate: source.head,
  status: 'RUNNING', checks: [], requests: [], stages: [], source,
  actualCompiledMain: true, syntheticFreshDatabase: true, productionEnvironmentValidation: true,
  productionDeployment: false, publicListener: false, deviceInstallation: false,
  retainedSalonDatabaseAccess: false, providerCredentialsLoaded: false, externalProviders: false,
  widgetGrantIssued: false, releaseCertification: false,
  caddySha256: hash(fs.readFileSync(values.caddy)), startedAt: new Date().toISOString() };
const check = (name, condition) => { assert.ok(condition, name); report.checks.push(name); };
const privateValues = new Set();
const remember = value => { if (typeof value === 'string' && value.length >= 8) privateValues.add(value); return value; };
const scrub = text => { for (const value of [...privateValues].sort((a, b) => b.length - a.length)) text = text.split(value).join('[private]'); return text; };
const minimal = { PATH: path.dirname(process.execPath) + ':/usr/bin:/bin', HOME: out, TMPDIR: out, LANG: 'C', TZ: 'UTC', NODE_OPTIONS: '--max-old-space-size=3072' };
const children = [];
function child(command, args, env, label) {
  const proc = spawn(command, args, { cwd: out, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const item = { proc, label, log: '', bytes: 0, exit: null };
  const collect = bytes => { item.bytes += bytes.length; if (item.bytes > 4 * 1024 * 1024) proc.kill('SIGTERM'); else item.log += bytes; };
  proc.stdout.on('data', collect); proc.stderr.on('data', collect);
  item.closed = new Promise(resolve => { proc.once('error', () => resolve(item.exit = { spawnError: true })); proc.once('close', (code, signal) => resolve(item.exit = { code, signal })); });
  children.push(item); return item;
}
function command(binary, args, env = minimal) {
  const result = spawnSync(binary, args, { cwd: out, env, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
  assert.ok(result.status === 0, 'local command failed: ' + path.basename(binary));
  return result.stdout;
}
async function unusedPort() {
  const s = net.createServer(); await new Promise((resolve, reject) => { s.once('error', reject); s.listen(0, '127.0.0.1', resolve); });
  const port = s.address().port; await new Promise(resolve => s.close(resolve)); return port;
}
async function isClosed(port) {
  return new Promise(resolve => { const s = net.connect(port, '127.0.0.1'); s.once('connect', () => { s.destroy(); resolve(false); }); s.once('error', () => resolve(true)); });
}
let plan, env, pgAttempted = false, apiPort, webPort, pgPort;
const control = { cancelled: null, terminate: null };
const cancel = () => { control.cancelled = 'cancelled'; control.terminate?.(); for (const item of children) item.proc.kill('SIGTERM'); };
process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
const totalDeadline = setTimeout(cancel, 12 * 60000);
const request = (route, { method = 'GET', body, token, origin = 'capacitor://localhost', trusted = true } = {}) => new Promise((resolve, reject) => {
  assert.ok(!control.cancelled, 'proof cancelled');
  const started = Date.now();
  const req = https.request({ host: '127.0.0.1', port: webPort, servername: 'localhost', path: route,
    method, rejectUnauthorized: true, ca: trusted ? fs.readFileSync(path.join(out, 'localhost.crt')) : undefined,
    agent: false, timeout: 15000, headers: { Host: 'localhost', Origin: origin,
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(method === 'OPTIONS' ? { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Authorization,Content-Type' } : {}),
    } }, res => {
    const parts = []; let size = 0;
    res.on('data', data => { size += data.length; if (size > 8 * 1024 * 1024) req.destroy(new Error('response size')); else parts.push(data); });
    res.on('error', reject); res.on('end', () => {
      const bytes = Buffer.concat(parts); let json;
      if (String(res.headers['content-type']).includes('application/json')) { try { json = JSON.parse(bytes); } catch {} }
      report.requests.push({ method, route, status: res.statusCode, elapsedMs: Date.now() - started });
      resolve({ status: res.statusCode, headers: res.headers, bytes, json });
    });
  });
  req.on('timeout', () => req.destroy(new Error('request deadline'))); req.on('error', reject);
  req.end(body ? JSON.stringify(body) : undefined);
});
try {
  const ports = new Set();
  for (let n = 0; ports.size < 3 && n < 12; n++) { const p = await unusedPort(); if (![5432, 55611].includes(p)) ports.add(p); }
  assert.equal(ports.size, 3); [pgPort, apiPort, webPort] = [...ports];
  const database = 'maya_local_onboarding_' + randomBytes(8).toString('hex');
  const password = remember(randomBytes(32).toString('hex'));
  const keys = Object.fromEntries(PRIVATE_KEYS.map(key => [key, remember(randomBytes(32).toString('hex'))]));
  const databaseUrl = remember(`postgresql://maya_local_onboarding:${password}@127.0.0.1:${pgPort}/${database}`);
  assertDatabaseUrl(databaseUrl);
  // Reuse only the no-provider scheduler defaults, NOT the retained stage-0 launcher.
  // Normal main applies its production config validator and ordinary guards.
  const { MAYA_LOCAL_ONBOARDING_PROFILE: unusedStage0, ...noProviders } = FIXED_PROFILE;
  void unusedStage0;
  env = { ...minimal, ...noProviders, ...keys, NODE_ENV: 'production', DATABASE_URL: databaseUrl,
    PORT: String(apiPort), HOST: '127.0.0.1', CORS_ALLOWED_ORIGINS: `https://localhost:${webPort},capacitor://localhost`,
    MAYA_RELEASE: source.head };
  for (const [name, text] of Object.entries({ 'pg-password': password + '\n', pgpass: `127.0.0.1:${pgPort}:*:maya_local_onboarding:${password}\n`, 'prisma.config.mjs': migrationConfigSource(backend) }))
    fs.writeFileSync(path.join(out, name), text, { flag: 'wx', mode: 0o600 });
  plan = sessionPlan({ stateDirectory: out, pgBin: values['pg-bin'], database, pgPort, apiPort, webPort });
  const steps = plan.setup.map(spec => spec.name !== 'react-build' ? spec : {
    ...spec, args: [path.join(repo, 'maya-carrier-react/tools/release.mjs'), 'build'],
  });
  for (const spec of steps) {
    if (spec.name === 'pg-start') pgAttempted = true;
    process.stdout.write(spec.name + '\n');
    const started = Date.now(); await stage(spec, spec.name.endsWith('-build') ? minimal : env, out, control);
    report.stages.push({ name: spec.name, elapsedMs: Date.now() - started });
  }
  report.preflight = preflight();
  const requireCarrier = createRequire(path.join(repo, 'maya-carrier-react/package.json'));
  const projectors = path.join(out, 'projectors.mjs');
  await requireCarrier('esbuild').build({ stdin: { contents: [
    'export {projectPasswordLogin,projectRefresh,projectConversationHistory,projectChat} from "./project.ts";',
    'export {projectOwnTasks} from "./own-tasks.ts";',
    'export {projectIdeas} from "./ideas.ts";',
    'export {projectFeed,projectReports} from "./workspace-reads.ts";',
  ].join('\n'), resolveDir: path.join(repo, 'maya-chat-shell/src/net'), loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', outfile: projectors, logLevel: 'silent' });
  const projections = await import(pathToFileURL(projectors));
  report.projectorsSha256 = hash(fs.readFileSync(projectors));
  const sandbox = diagnosticSandboxPolicy(pgPort, apiPort);
  // Kernel refusal is tested on reserved documentation IP and an unadmitted local port.
  for (const [host, port] of [['192.0.2.1', 443], ['127.0.0.1', webPort]]) {
    const result = command('/usr/bin/sandbox-exec', ['-p', sandbox, process.execPath, '-e',
      `const s=require('node:net').connect({host:${JSON.stringify(host)},port:${port}});s.on('connect',()=>process.exit(2));s.on('error',e=>process.exit(e.code==='EPERM'?0:3));setTimeout(()=>process.exit(4),2000);`]);
    check('kernel outbound refusal: ' + host, result === '');
  }
  report.binarySha256 = hash(fs.readFileSync(path.join(backend, 'dist/src/main.js')));
  const appStarted = Date.now();
  const app = child('/usr/bin/sandbox-exec', ['-p', sandbox, process.execPath, path.join(backend, 'dist/src/main.js')], env, 'backend');
  const readyDeadline = Date.now() + 60000; let ready = false;
  while (Date.now() < readyDeadline && !app.exit && !control.cancelled) {
    try { const r = await fetch(`http://127.0.0.1:${apiPort}/api/health/ready`, { signal: AbortSignal.timeout(1000) }); if (r.status === 200) { ready = true; break; } } catch {}
    await wait(200);
  }
  report.backendStartupMs = Date.now() - appStarted;
  check('actual compiled backend ready on fresh migrated database', ready);

  fs.writeFileSync(path.join(out, 'test-cert.cnf'), '[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=server\n[dn]\nCN=localhost\n[server]\nsubjectAltName=DNS:localhost\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n');
  command('/usr/bin/openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', 'localhost.key', '-out', 'localhost.crt', '-config', 'test-cert.cnf']);
  fs.chmodSync(path.join(out, 'localhost.key'), 0o600);
  const caddyEnv = { ...minimal, XDG_CONFIG_HOME: out, XDG_DATA_HOME: out, STAGING_HOST: 'localhost' };
  const config = JSON.parse(command(values.caddy, ['adapt', '--config', path.join(backend, 'deploy/staging/Caddyfile'), '--adapter', 'caddyfile'], caddyEnv));
  let roots = 0, callbacks = 0, upstreams = 0;
  function topology(v) {
    if (!v || typeof v !== 'object') return;
    for (const [key, val] of Object.entries(v)) {
      if (key === 'root' && val === '/srv/maya') { v[key] = path.join(repo, 'maya-carrier-react/dist/web'); roots++; }
      else if (key === 'root' && val === '/srv/maya-callback') { v[key] = path.join(backend, 'deploy/platform/beget-edge'); callbacks++; }
      else if (key === 'dial' && val === 'backend:3000') { v[key] = '127.0.0.1:' + apiPort; upstreams++; }
      else topology(val);
    }
  }
  topology(config); assert.ok(roots === 1 && callbacks === 1 && upstreams === 1, 'exact topology');
  const servers = Object.values(config.apps.http.servers); assert.equal(servers.length, 1);
  Object.assign(servers[0], { listen: ['127.0.0.1:' + webPort], automatic_https: { disable: true }, tls_connection_policies: [{}] });
  config.admin = { disabled: true, config: { persist: false } };
  config.apps.tls = { certificates: { load_files: [{ certificate: path.join(out, 'localhost.crt'), key: path.join(out, 'localhost.key') }] } };
  const caddyConfig = path.join(out, 'caddy.json'); fs.writeFileSync(caddyConfig, JSON.stringify(config), { mode: 0o600 });
  command(values.caddy, ['validate', '--config', caddyConfig], caddyEnv);
  const gateway = child(values.caddy, ['run', '--config', caddyConfig], caddyEnv, 'caddy');
  let httpsReady = false;
  for (let n = 0; n < 50 && !gateway.exit; n++) { try { if ((await request('/api/health')).status === 200) { httpsReady = true; break; } } catch {} await wait(100); }
  check('real backend reachable through canonical loopback HTTPS gateway', httpsReady);
  await assert.rejects(request('/api/health', { trusted: false }), e => /SELF_SIGNED_CERT|UNABLE_TO_VERIFY/.test(e.code));
  check('untrusted TLS refused without bypass', true);
  const health = await request('/api/health'), readiness = await request('/api/health/ready');
  check('health reports exact source SHA and database ready', health.json?.release === source.head && readiness.json?.checks?.database === 'ready');
  for (const [name, bytes] of readTree(path.join(repo, 'maya-carrier-react/dist/web')))
    check('gateway current payload: ' + name, (await request('/' + name)).bytes.equals(bytes));
  const callback = await request('/oauth-callback.html');
  check('canonical OAuth return bytes', callback.bytes.equals(fs.readFileSync(path.join(backend, 'deploy/platform/beget-edge/oauth-callback.html'))));
  const native = await request('/api/auth/login', { method: 'OPTIONS' });
  check('actual native CORS preflight', native.status === 204 && native.headers['access-control-allow-origin'] === 'capacitor://localhost');
  const foreign = await request('/api/health', { origin: 'https://untrusted.invalid' });
  check('foreign browser origin receives no CORS permission', !foreign.headers['access-control-allow-origin']);
  check('anonymous protected request refused', (await request('/api/branches')).status === 401);

  const accounts = [];
  for (const name of ['a', 'b']) {
    const slug = 'phone-proof-' + name + '-' + randomBytes(6).toString('hex');
    const email = slug + '@example.invalid', password = remember(randomBytes(24).toString('hex'));
    const activation = await request('/api/onboarding/trial-activations', { method: 'POST', body: { source: 'web' } });
    check('ordinary trial activation ' + name, activation.status === 201 && typeof activation.json?.activation_token === 'string');
    remember(activation.json.activation_token);
    const signup = await request('/api/onboarding/trial', { method: 'POST', body: {
      trialActivationToken: activation.json.activation_token, name: 'Synthetic phone proof ' + name, slug,
      ownerEmail: email, password, branchName: 'Synthetic branch ' + name, branchTimezone: 'Europe/Moscow', calendarSource: 'external',
    } });
    remember(signup.json?.access_token); remember(signup.json?.refresh_token);
    check('ordinary trial creation without fixture SQL ' + name, signup.status === 201 && signup.json?.trial_activation?.status === 'completed');
    const login = await request('/api/auth/login', { method: 'POST', body: { tenantSlug: slug, email, password } });
    remember(login.json?.access_token); remember(login.json?.refresh_token);
    check('password login projects into existing runtime ' + name, [200, 201].includes(login.status) && !!projections.projectPasswordLogin(login.json));
    const token = login.json.access_token;
    const branches = await request('/api/branches', { token });
    check('one canonical own branch ' + name, branches.status === 200 && Array.isArray(branches.json) && branches.json.length === 1);
    accounts.push({ token, refresh: login.json.refresh_token, slug, email, password, branches: branches.json });
    for (const [route, projection] of [
      ['/api/ai/conversation', 'projectConversationHistory'], ['/api/inbox', 'projectFeed'],
      ['/api/owner-reports', 'projectReports'], ['/api/operational-work', 'projectOwnTasks'],
      ['/api/analytics/valuations', 'projectIdeas'],
    ]) {
      const result = await request(route, { token });
      check('actual Companion projection ' + name + ': ' + route, result.status === 200 && !!projections[projection](result.json));
    }
    check('tenant owner is not platform authority ' + name, (await request('/api/health/metrics', { token })).status === 403);
  }
  const [a, b] = accounts;
  check('independent tenants return different branches', a.branches[0].tenant_id !== b.branches[0].tenant_id && a.branches[0].id !== b.branches[0].id);
  const wrongTenant = await request('/api/auth/login', { method: 'POST', body: { tenantSlug: b.slug, email: a.email, password: a.password } });
  check('tenant A credentials cannot log into tenant B', [401, 403].includes(wrongTenant.status));
  const chatId = 'phone-proof-' + randomBytes(12).toString('hex');
  // Canonical deterministic withdrawal proves persistence without claiming LLM acceptance.
  const turn = await request('/api/ai/chat', { method: 'POST', token: a.token,
    body: { surface: 'web', requestId: chatId, messages: [{ role: 'user', content: 'Стоп, ничего не делай' }] } });
  check('safe deterministic turn uses canonical chat projection', [200, 201].includes(turn.status) && !!projections.projectChat(turn.json, chatId));
  const historyA = await request('/api/ai/conversation', { token: a.token });
  const historyB = await request('/api/ai/conversation', { token: b.token });
  check('persisted user turn and response only in tenant A', historyA.json?.turns?.length === 2 && historyB.json?.turns?.length === 0);
  const substitution = await request('/api/ai/chat', { method: 'POST', token: b.token, body: {
    surface: 'web', requestId: 'phone-substitution-' + randomBytes(8).toString('hex'),
    conversationId: historyA.json.conversationId, messages: [{ role: 'user', content: 'Стоп, ничего не делай' }],
  } });
  check('foreign persisted conversation refused', [400, 403, 404, 409].includes(substitution.status));
  check('foreign refusal creates no tenant B history', (await request('/api/ai/conversation', { token: b.token })).json?.turns?.length === 0);
  const renewed = await request('/api/auth/refresh', { method: 'POST', body: { refreshToken: a.refresh } });
  remember(renewed.json?.access_token); remember(renewed.json?.refresh_token);
  check('normal one-time refresh', [200, 201].includes(renewed.status) && !!projections.projectRefresh(renewed.json));
  check('renewed session reads persisted conversation', (await request('/api/ai/conversation', { token: renewed.json.access_token })).json?.turns?.length === 2);
  const logout = await request('/api/auth/logout', { method: 'POST', token: renewed.json.access_token });
  check('ordinary logout', [200, 201].includes(logout.status));
  check('revoked access token refused', (await request('/api/branches', { token: renewed.json.access_token })).status === 401);
  check('revoked refresh token refused', [401, 403].includes((await request('/api/auth/refresh', { method: 'POST', body: { refreshToken: renewed.json.refresh_token } })).status));
  // Read-only counts from this owned synthetic database; never issue an entitlement.
  const sql = 'SELECT json_build_object(\'tenants\',(SELECT count(*) FROM "Tenant"),\'widgetGrants\',(SELECT count(*) FROM "TenantEntitlement" WHERE "featureKey"=\'widgets.runtime\'),\'crmIntegrations\',(SELECT count(*) FROM "CrmIntegration"));';
  const dbCounts = command(path.join(values['pg-bin'], 'psql'), ['-h', '127.0.0.1', '-p', String(pgPort), '-U', 'maya_local_onboarding', '-d', database, '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], { ...minimal, PGPASSFILE: path.join(out, 'pgpass') });
  report.databaseCounts = JSON.parse(dbCounts);
  check('two synthetic tenants with no widget grants or CRM credentials', report.databaseCounts.tenants === 2 && report.databaseCounts.widgetGrants === 0 && report.databaseCounts.crmIntegrations === 0);
  assert.deepEqual(sourceBinding(extensions), source, 'committed sources changed during proof');
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL'; report.failure = scrub(String(error.message)).slice(0, 500); process.exitCode = 1;
} finally {
  clearTimeout(totalDeadline);
  report.processes = [];
  for (const item of children.reverse()) {
    if (!item.exit) { item.proc.kill('SIGTERM'); await Promise.race([item.closed, wait(5000)]); }
    if (!item.exit) item.proc.kill('SIGKILL');
    await item.closed;
    report.processes.push({ owner: item.label, ...item.exit });
    fs.writeFileSync(path.join(out, item.label + '.log'), scrub(item.log), { mode: 0o600 });
  }
  if (pgAttempted) {
    try { await stage(plan.stop, env, out, { cancelled: null, terminate: null }); report.databaseStopped = true; }
    catch { report.databaseStopped = false; report.status = 'FAIL'; process.exitCode = 1; }
  }
  report.listenersClosed = (await Promise.all([pgPort, apiPort, webPort].filter(Boolean).map(isClosed))).every(Boolean);
  if (!report.listenersClosed) { report.status = 'FAIL'; process.exitCode = 1; }
  for (const name of ['localhost.key', 'pg-password', 'pgpass']) fs.rmSync(path.join(out, name), { force: true });
  report.ephemeralCredentialFilesRemoved = ['localhost.key', 'pg-password', 'pgpass'].every(name => !fs.existsSync(path.join(out, name)));
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(out, 'RESULT.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, output: out, failure: report.failure, listenersClosed: report.listenersClosed }));
  process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
}
