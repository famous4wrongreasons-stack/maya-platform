// Synthetic namespace/real forwarder proof only. No provider or owner credentials.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { EXECUTOR_FILES } from './phone-native-execution.mjs';
const { values: v } = parseArgs({
  options: {
    run: { type: 'boolean' },
    output: { type: 'string' },
    context: { type: 'string' },
    image: { type: 'string' },
  },
});
assert(v.run && path.isAbsolute(v.output) && !fs.existsSync(v.output));
assert(v.context && /^node@sha256:[a-f0-9]{64}$/.test(v.image));
const here = path.dirname(fileURLToPath(import.meta.url)),
  out = v.output;
const command = (cmd, args, options = {}) =>
  execFileSync(cmd, args, {
    encoding: 'utf8',
    timeout: 120000,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
const docker = (...args) =>
  command('docker', ['--context', v.context, ...args]);
const endpoint = JSON.parse(docker('context', 'inspect', v.context))[0]
  .Endpoints.docker.Host;
assert(endpoint.startsWith('unix://'), 'Local isolated Docker only');
fs.mkdirSync(out, { mode: 0o700 });
const prefix = 'maya-native-proof-' + randomBytes(5).toString('hex');
const m = {
  contract: 'maya.native-linux-transport-proof/1',
  candidate: command('git', ['rev-parse', 'HEAD'], { cwd: here }),
  status: 'running',
  baseImage: v.image,
  sourceHashes: {},
  checks: [],
  externalProviderEffects: 0,
  syntheticOnly: true,
  certificate: 'NOT_ISSUED',
  scope:
    'Real Linux network isolation and unmodified forwarder CLI; compiled business/AR-1 proof is separate',
};
const save = () =>
  fs.writeFileSync(out + '/manifest.json', JSON.stringify(m, null, 2) + '\n');
const write = (name, value) =>
  fs.writeFileSync(out + '/' + name, value, { mode: 0o600 });
const hash = (b) => createHash('sha256').update(b).digest('hex');
const containers = [],
  networks = [],
  volumes = [];
const createContainer = (suffix, ...args) => {
  const name = prefix + '-' + suffix;
  docker('run', '-d', '--name', name, ...args);
  containers.push(name);
  return name;
};
save();
try {
  fs.mkdirSync(out + '/scripts');
  for (const n of EXECUTOR_FILES) {
    const bytes = fs.readFileSync(path.join(here, n));
    m.sourceHashes[n] = hash(bytes);
    fs.mkdirSync(path.dirname(out + '/scripts/' + n), { recursive: true });
    fs.writeFileSync(out + '/scripts/' + n, bytes);
  }
  // Ephemeral test TLS certificate; never an operator/production signing key.
  command('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-days',
    '1',
    '-subj',
    '/CN=api.deepseek.com',
    '-addext',
    'subjectAltName=DNS:api.deepseek.com',
    '-keyout',
    out + '/synthetic-tls.key',
    '-out',
    out + '/synthetic-tls.crt',
  ]);
  write(
    'witness.mjs',
    `import https from 'node:https'; import fs from 'node:fs';
let calls=0; https.createServer({key:fs.readFileSync('/app/synthetic-tls.key'),cert:fs.readFileSync('/app/synthetic-tls.crt')},(req,res)=>{calls++; console.log('SYNTHETIC_CALL '+calls); req.resume(); res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({synthetic:true,calls}));}).listen(443,'0.0.0.0');`,
  );
  write(
    'backend-proof.mjs',
    `import assert from 'node:assert/strict'; import fs from 'node:fs'; import {openNativeChannel,channelRequest} from './scripts/phone-native-channel.mjs';
fs.mkdirSync('/run/maya-native-ipc',{recursive:true,mode:0o700}); fs.chmodSync('/run/maya-native-ipc',0o700);
let current=true; const c=await openNativeChannel({directory:'/run/maya-native-ipc',assertCurrent:async()=>current});
const url='https://api.deepseek.com/chat/completions', init={method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer SYNTHETIC_ONLY'},body:'{}'};
await assert.rejects(fetch(url,{...init,signal:AbortSignal.timeout(2000)})); console.log('DIRECT_EXTERNAL_REFUSED');
const response=await c.fetch(url,init); assert.equal((await response.json()).calls,1); console.log('REAL_FORWARDER_PASS'); fs.writeFileSync('/run/maya-native-ipc/ready',''); const deadline=Date.now()+20000; while(!fs.existsSync('/run/maya-native-ipc/inspected')) { assert(Date.now()<deadline); await new Promise(r=>setTimeout(r,100)); }
assert.equal((await channelRequest(c.socket,'/enqueue',{})).status,403); console.log('NO_GENERIC_ENQUEUE');
current=false; await assert.rejects(c.fetch(url,init)); console.log('REVOKED_REFUSED'); await c.close(); console.log('PASS');`,
  );
  const a = {
    payload: {
      contract: 'maya.phone-native-execution/1',
      notBefore: new Date(Date.now() - 1000).toISOString(),
      expiresAt: new Date(Date.now() + 900000).toISOString(),
    },
  };
  write('authorization', JSON.stringify(a));
  const authHash = hash(fs.readFileSync(out + '/authorization'));
  write(
    'Dockerfile',
    `FROM ${v.image}\nWORKDIR /app\nCOPY scripts /app/scripts\nCOPY *.mjs synthetic-tls.key synthetic-tls.crt /app/\nCOPY authorization /run/maya-native/authorization\nRUN chmod 700 /run/maya-native && chmod 600 /run/maya-native/authorization\n`,
  );
  docker('build', '-q', '-t', prefix, out);
  fs.unlinkSync(out + '/synthetic-tls.key');
  const privateNet = prefix + '-private',
    edge = prefix + '-edge',
    ipc = prefix + '-ipc';
  for (const [name, args] of [
    [privateNet, ['--internal']],
    [edge, []],
  ]) {
    docker('network', 'create', ...args, name);
    networks.push(name);
  }
  docker('volume', 'create', ipc);
  volumes.push(ipc);
  const witness = createContainer(
    'witness',
    '--network',
    edge,
    prefix,
    'node',
    'witness.mjs',
  );
  const witnessIp = JSON.parse(docker('inspect', witness))[0].NetworkSettings
    .Networks[edge].IPAddress;
  assert(witnessIp);
  const backend = createContainer(
    'backend',
    '--network',
    privateNet,
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges:true',
    '--add-host',
    'api.deepseek.com:' + witnessIp,
    '-e',
    'NODE_EXTRA_CA_CERTS=/app/synthetic-tls.crt',
    '-v',
    ipc + ':/run/maya-native-ipc',
    prefix,
    'node',
    'backend-proof.mjs',
  );
  const forwarder = createContainer(
    'forwarder',
    '--network',
    edge,
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges:true',
    '--add-host',
    'api.deepseek.com:' + witnessIp,
    '-e',
    'NODE_EXTRA_CA_CERTS=/app/synthetic-tls.crt',
    '-e',
    'MAYA_NATIVE_EXECUTION_ENABLED=signed-phone-test',
    '-e',
    'MAYA_NATIVE_AUTHORIZATION_SHA256=' + authHash,
    '-v',
    ipc + ':/run/maya-native-ipc',
    prefix,
    'node',
    '/app/scripts/phone-native-forwarder.mjs',
  );
  docker(
    'exec',
    backend,
    'node',
    '-e',
    "const fs=require('fs'); (async()=>{const end=Date.now()+20000; while(!fs.existsSync('/run/maya-native-ipc/ready')){if(Date.now()>end)process.exit(1); await new Promise(r=>setTimeout(r,100));}})();",
  );
  assert.equal(
    docker(
      'exec',
      forwarder,
      'node',
      '-e',
      "const fs=require('fs'); for(const p of ['/proc/net/tcp','/proc/net/tcp6']) { const rows=fs.readFileSync(p,'utf8').trim().split('\\n').slice(1); if(rows.some(x=>x.trim().split(/\\s+/)[3]==='0A' && !x.includes('0B00007F'))) process.exit(1); }",
    ),
    '',
  );
  docker(
    'exec',
    backend,
    'node',
    '-e',
    "require('fs').writeFileSync('/run/maya-native-ipc/inspected','')",
  );
  assert.equal(docker('wait', backend), '0');
  const log = docker('logs', backend);
  write('backend.log', log);
  for (const marker of [
    'DIRECT_EXTERNAL_REFUSED',
    'REAL_FORWARDER_PASS',
    'NO_GENERIC_ENQUEUE',
    'REVOKED_REFUSED',
    'PASS',
  ])
    assert(log.includes(marker));
  assert.equal(docker('logs', witness).split('SYNTHETIC_CALL').length - 1, 1);
  const b = JSON.parse(docker('inspect', backend))[0],
    f = JSON.parse(docker('inspect', forwarder))[0];
  assert.deepEqual(Object.keys(b.NetworkSettings.Networks), [privateNet]);
  assert.deepEqual(Object.keys(f.NetworkSettings.Networks), [edge]);
  assert.equal(Object.keys(f.NetworkSettings.Ports ?? {}).length, 0);
  m.checks = [
    'private backend cannot directly reach synthetic external provider',
    'unmodified forwarder CLI carries one admitted TLS request',
    'no enqueue endpoint',
    'revocation prevents second request',
    'backend/forwarder networks disjoint',
    'forwarder has no TCP listener or published port',
  ];
  m.status = 'passed';
} catch (e) {
  m.status = 'failed';
  m.failure = String(e.message).slice(0, 2000);
  process.exitCode = 1;
} finally {
  m.cleanup = [];
  for (const c of containers) {
    try {
      write(c + '.log', docker('logs', c));
    } catch {}
  }

  for (const c of containers.reverse()) {
    try {
      docker('rm', '-f', c);
      m.cleanup.push(c);
    } catch {
      m.status = 'failed';
      process.exitCode = 1;
    }
  }
  for (const v of volumes) {
    try {
      docker('volume', 'rm', v);
    } catch {
      m.status = 'failed';
      process.exitCode = 1;
    }
  }
  for (const n of networks.reverse()) {
    try {
      docker('network', 'rm', n);
    } catch {
      m.status = 'failed';
      process.exitCode = 1;
    }
  }
  try {
    docker('image', 'rm', prefix);
  } catch {}
  if (fs.existsSync(out + '/synthetic-tls.key'))
    fs.unlinkSync(out + '/synthetic-tls.key');
  save();
  console.log(JSON.stringify({ status: m.status, checks: m.checks.length }));
}
