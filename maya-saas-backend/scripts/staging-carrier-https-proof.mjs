// Execute the actual Caddy routing against current emitted React bytes on loopback.
// The upstream is deliberately synthetic: this is transport, not backend/auth admission.
// No Docker/deploy, public listener, ACME, system trust install, DB, keys or providers.
import assert from 'node:assert/strict';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readTree } from '../../maya-carrier-react/tools/payload-files.mjs';
import { preflight } from './staging-carrier-preflight.mjs';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.dirname(backend);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const { values } = parseArgs({ strict: true, options: { caddy: { type: 'string' }, out: { type: 'string' } } });
assert.ok(values.caddy && path.isAbsolute(values.caddy), 'explicit local Caddy binary required');
assert.match(values.out ?? '', /^\/(?:private\/)?tmp\/maya-staging-https-[\w-]+$/);
assert.equal(fs.existsSync(values.out), false, 'fresh proof directory required');
const out = values.out;
fs.mkdirSync(out, { mode: 0o700 });
const report = {
  contract: 'maya.staging-carrier-transport-proof/1',
  candidate: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
  sourceDirty: Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }).trim()),
  status: 'RUNNING', checks: [], realBackend: false, databaseAccess: false,
  externalProviders: false, publicListener: false, systemTrustChanged: false,
  caddyBinarySha256: hash(fs.readFileSync(values.caddy)),
  caddyVersion: execFileSync(values.caddy, ['version'], { encoding: 'utf8' }).trim(),
};
const check = (name, condition) => { assert.ok(condition, name); report.checks.push(name); };
let child, childExit, api, port, apiPort, output = '', wire = [];
const request = (route, { method = 'GET', trusted = true, headers = {}, body = '' } = {}) => new Promise((resolve, reject) => {
  const req = https.request({ host: '127.0.0.1', port, servername: 'localhost', path: route, method,
    ca: trusted ? fs.readFileSync(path.join(out, 'localhost.crt')) : undefined,
    rejectUnauthorized: true, agent: false, timeout: 3000,
    headers: { Host: 'localhost', ...headers },
  }, res => {
    const chunks = []; let size = 0;
    res.on('data', chunk => { size += chunk.length; if (size > 8 * 1024 * 1024) req.destroy(); else chunks.push(chunk); });
    res.on('error', reject);
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, bytes: Buffer.concat(chunks) }));
  });
  req.on('timeout', () => req.destroy(new Error('proof_request_timeout')));
  req.on('error', reject); req.end(body);
});
function command(binary, args, options = {}) {
  const r = spawnSync(binary, args, { cwd: out, encoding: 'utf8', timeout: 30000,
    env: { PATH: '/usr/bin:/bin', HOME: out, XDG_CONFIG_HOME: out, XDG_DATA_HOME: out }, ...options });
  output += r.stderr ?? '';
  assert.equal(r.status, 0, 'proof command failed: '+path.basename(binary));
  return r.stdout;
}
async function unusedPort() {
  const s = net.createServer(); await new Promise(resolve => s.listen(0, '127.0.0.1', resolve));
  const p = s.address().port; await new Promise(resolve => s.close(resolve)); return p;
}
async function closed(p) {
  return new Promise(resolve => {
    const s = net.connect(p, '127.0.0.1');
    s.on('connect', () => { s.destroy(); resolve(false); }); s.on('error', () => resolve(true));
  });
}
try {
  report.preflight = preflight();
  const files = readTree(path.join(repo, 'maya-carrier-react/dist/web'));
  report.payload = Object.fromEntries([...files].map(([name, bytes]) => [name, hash(bytes)]));
  fs.writeFileSync(path.join(out, 'test-cert.cnf'), '[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=server\n[dn]\nCN=localhost\n[server]\nsubjectAltName=DNS:localhost\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n');
  command('/usr/bin/openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-keyout', 'localhost.key', '-out', 'localhost.crt', '-config', 'test-cert.cnf']);
  fs.chmodSync(path.join(out, 'localhost.key'), 0o600);
  api = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    wire.push({ path: req.url, method: req.method, origin: req.headers.origin, authorization: req.headers.authorization, body });
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': 'capacitor://localhost', 'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      }); res.end(); return;
    }
    res.writeHead(418, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': 'capacitor://localhost' });
    res.end('{"synthetic":"transport-only","notAuthProof":true}');
  });
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve)); apiPort = api.address().port;
  port = await unusedPort();
  // Adapt the canonical file; rewrite only topology for this owned loopback proof.
  const config = JSON.parse(command(values.caddy, ['adapt', '--config', path.join(backend, 'deploy/staging/Caddyfile'), '--adapter', 'caddyfile'], {
    env: { PATH: '/usr/bin:/bin', HOME: out, XDG_CONFIG_HOME: out, XDG_DATA_HOME: out, STAGING_HOST: 'localhost' },
  }));
  let roots = 0, callbackRoots = 0, upstreams = 0;
  function substitute(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (key === 'root' && item === '/srv/maya') { value[key] = path.join(repo, 'maya-carrier-react/dist/web'); roots++; }
      else if (key === 'root' && item === '/srv/maya-callback') { value[key] = path.join(backend, 'deploy/platform/beget-edge'); callbackRoots++; }
      else if (key === 'dial' && item === 'backend:3000') { value[key] = '127.0.0.1:'+apiPort; upstreams++; }
      else substitute(item);
    }
  }
  substitute(config); assert.equal(roots, 1); assert.equal(callbackRoots, 1); assert.equal(upstreams, 1);
  const servers = Object.values(config.apps.http.servers); assert.equal(servers.length, 1);
  servers[0].listen = ['127.0.0.1:'+port];
  servers[0].automatic_https = { disable: true };
  servers[0].tls_connection_policies = [{}];
  config.admin = { disabled: true, config: { persist: false } };
  config.apps.tls = { certificates: { load_files: [{ certificate: path.join(out, 'localhost.crt'), key: path.join(out, 'localhost.key') }] } };
  const configPath = path.join(out, 'proof.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2)+'\n', { mode: 0o600 });
  report.topologySubstitutions = ['loopback listener', 'synthetic loopback upstream', 'current local payload root', 'separate canonical callback root, exact route only', 'ephemeral per-request trusted TLS; automatic HTTPS/admin disabled'];
  command(values.caddy, ['validate', '--config', configPath]);
  check('adapted configuration validates', true);
  child = spawn(values.caddy, ['run', '--config', configPath], { cwd: out, stdio: ['ignore', 'pipe', 'pipe'],
    env: { PATH: '/usr/bin:/bin', HOME: out, XDG_CONFIG_HOME: out, XDG_DATA_HOME: out } });
  child.stdout.on('data', b => output += b); child.stderr.on('data', b => output += b);
  childExit = new Promise(resolve => { child.on('error', () => resolve({ error: true })); child.on('exit', (code, signal) => resolve({ code, signal })); });
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try { if ((await request('/')).status === 200) { ready = true; break; } } catch {}
    if (child.exitCode !== null) break; await delay(100);
  }
  check('HTTPS listener ready on loopback only', ready);
  await assert.rejects(request('/', { trusted: false }), error => /SELF_SIGNED_CERT|UNABLE_TO_VERIFY/.test(error.code));
  check('TLS without explicit test trust refuses', true);
  for (const [name, bytes] of files) {
    const result = await request('/'+name);
    check('exact current React file: '+name, result.status === 200 && result.bytes.equals(bytes));
  }
  const root = await request('/');
  check('root selects React index', root.bytes.equals(files.get('index.html')));
  check('static no-store and no-referrer', root.headers['cache-control'] === 'no-store' && root.headers['referrer-policy'] === 'no-referrer');
  const callback = await request('/oauth-callback.html?code=synthetic-query-must-not-be-logged');
  const callbackBytes = fs.readFileSync(path.join(backend, 'deploy/platform/beget-edge/oauth-callback.html'));
  report.callbackSha256 = hash(callbackBytes);
  check('current separate callback bytes preserved', callback.status === 200 && callback.bytes.equals(callbackBytes));
  check('callback no-store and no-referrer', callback.headers['cache-control'] === 'no-store' && callback.headers['referrer-policy'] === 'no-referrer');
  const fallback = await request('/companion-route');
  check('SPA fallback selects React index', fallback.bytes.equals(files.get('index.html')));
  const adjacent = await request('/maya-platform-api.php');
  check('callback mount exposes no adjacent relay source', adjacent.bytes.equals(files.get('index.html')));
  const foreign = await request('/', { headers: { Host: 'foreign.invalid' } });
  check('foreign host cannot receive Maya payload', !foreign.bytes.equals(files.get('index.html')));
  const options = await request('/api/auth/login', { method: 'OPTIONS', headers: {
    Origin: 'capacitor://localhost', 'Access-Control-Request-Method': 'POST',
  } });
  check('native preflight preserved from upstream', options.status === 204 && options.headers['access-control-allow-origin'] === 'capacitor://localhost');
  const apiResult = await request('/api/auth/login', { method: 'POST', headers: {
    Origin: 'capacitor://localhost', Authorization: 'Bearer synthetic-not-a-session', 'Content-Type': 'application/json',
  }, body: '{"synthetic":true}' });
  check('API error/body never rewritten to shell', apiResult.status === 418 && JSON.parse(apiResult.bytes).notAuthProof === true);
  check('native Origin and Authorization reach existing API owner', wire.at(-1).origin === 'capacitor://localhost' &&
    wire.at(-1).authorization === 'Bearer synthetic-not-a-session' && wire.at(-1).body === '{"synthetic":true}');
  const unknown = await request('/api/unknown');
  check('unknown API remains upstream-owned', unknown.status === 418 && JSON.parse(unknown.bytes).synthetic === 'transport-only');
  check('no raw OAuth query or authorization in gateway log', !output.includes('synthetic-query-must-not-be-logged') && !output.includes('synthetic-not-a-session'));
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL'; report.failure = String(error.message).slice(0, 500); process.exitCode = 1;
} finally {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([childExit, delay(5000)]);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
  if (childExit) report.gatewayExit = await childExit;
  if (api) { api.closeAllConnections(); await new Promise(resolve => api.close(resolve)); }
  report.listenersClosed = (!port || await closed(port)) && (!apiPort || await closed(apiPort));
  if (!report.listenersClosed) { report.status = 'FAIL'; process.exitCode = 1; }
  fs.rmSync(path.join(out, 'localhost.key'), { force: true }); // owned ephemeral proof key only
  report.ephemeralKeyRemoved = !fs.existsSync(path.join(out, 'localhost.key'));
  fs.writeFileSync(path.join(out, 'caddy.log'), output, { mode: 0o600 });
  fs.writeFileSync(path.join(out, 'RESULT.json'), JSON.stringify(report, null, 2)+'\n', { mode: 0o600 });
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, output: out, failure: report.failure, listenersClosed: report.listenersClosed }));
}
