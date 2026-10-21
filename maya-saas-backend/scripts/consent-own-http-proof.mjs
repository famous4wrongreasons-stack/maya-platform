// Explicit narrow diagnostic: ordinary HTTP AppModule, fresh synthetic PG16.
// No release receipt; no application source/guard override; no external egress.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const backend = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const { values } = parseArgs({
  options: { run: { type: 'boolean' }, output: { type: 'string' } },
});
assert.equal(values.run, true, 'Explicit --run required');
assert.ok(
  values.output &&
    path.isAbsolute(values.output) &&
    !fs.existsSync(values.output),
  'New absolute output required',
);
assert.equal(
  process.platform,
  'darwin',
  'This runner pins the available macOS sandbox and PG16',
);
for (const name of ['.env', '.env.local'])
  assert.equal(fs.existsSync(path.join(backend, name)), false);
fs.mkdirSync(values.output, { mode: 0o700 });
const privateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-consent-own-'));
const cluster = path.join(privateRoot, 'pg'),
  pgBin = '/opt/homebrew/opt/postgresql@16/bin';
const socket = net.createServer();
await new Promise((resolve, reject) => {
  socket.once('error', reject);
  socket.listen(0, '127.0.0.1', resolve);
});
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
assert.notEqual(port, 5432);
const database =
  'maya_widget_gate_proof_consent_own_' + randomBytes(6).toString('hex');
const env = {
  DATABASE_URL:
    'postgresql://consent_own_proof@127.0.0.1:' + port + '/' + database,
  NODE_ENV: 'test',
  NODE_OPTIONS: '--max-old-space-size=3072',
  LANG: 'C',
  TZ: 'UTC',
};
for (const key of ['PATH', 'HOME', 'TMPDIR'])
  if (process.env[key]) env[key] = process.env[key];
const sandbox =
  '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*") (remote unix-socket))';
const hash = (file) =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const manifest = {
  contract: 'maya.consent-own-http-pg-proof/1',
  status: 'running',
  candidateHead: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: backend,
    encoding: 'utf8',
  }).trim(),
  sourceHashes: Object.fromEntries(
    [
      'scripts/consent-own-http-proof.mjs',
      'test/widgets-live/consent-own-read.probe-spec.ts',
      'src/crm/client-consent-read.service.ts',
      'src/crm/client-consent-read.controller.ts',
    ].map((p) => [p, hash(path.join(backend, p))]),
  ),
  pgVersion: execFileSync(path.join(pgBin, 'postgres'), ['--version'], {
    encoding: 'utf8',
  }).trim(),
  cluster,
  database,
  port,
  completed: [],
  externalEgress: 'DENIED_BY_OS',
  syntheticFixtureAuthority: [
    'verified subject link owner',
    'historical challenge issuer',
    'canonical security invalidation external approval',
  ],
  applicationGuardsOverridden: false,
  productionEffects: 0,
  certificate: 'NOT_ISSUED',
  resources: { nodeHeapMb: 3072, pgSharedBuffersMb: 64, jestWorkers: 1 },
};
assert.match(manifest.pgVersion, /PostgreSQL\) 16\./);
const save = () =>
  fs.writeFileSync(
    path.join(values.output, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
let cancelled = null,
  activeChild = null,
  activeCleanup = false;
const cancel = (signal) => {
  cancelled ??= signal;
  manifest.cancelledBy = cancelled;
  save();
  if (!activeCleanup) activeChild?.kill('SIGTERM');
};
const onInt = () => cancel('SIGINT'),
  onTerm = () => cancel('SIGTERM');
process.on('SIGINT', onInt);
process.on('SIGTERM', onTerm);
async function run(name, command, args, extra = {}, fenced = false) {
  const cleanup = name === 'pg-stop';
  if (cancelled && !cleanup) throw new Error('Proof cancelled: ' + cancelled);
  manifest.currentStage = name;
  save();
  console.log(name);
  const fd = fs.openSync(path.join(values.output, name + '.log'), 'wx', 0o600);
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(
        fenced ? '/usr/bin/sandbox-exec' : command,
        fenced ? ['-p', sandbox, command, ...args] : args,
        { cwd: backend, env: { ...env, ...extra }, stdio: ['ignore', fd, fd] },
      );
      activeChild = child;
      activeCleanup = cleanup;
      let killTimer,
        timedOut = false;
      const terminate = () => {
        child.kill('SIGTERM');
        killTimer ??= setTimeout(() => child.kill('SIGKILL'), 5000);
      };
      const onCancel = () => {
        if (!cleanup) terminate();
      };
      process.on('SIGINT', onCancel);
      process.on('SIGTERM', onCancel);
      const timer = setTimeout(
        () => {
          timedOut = true;
          terminate();
        },
        cleanup ? 45000 : 240000,
      );
      const done = () => {
        clearTimeout(timer);
        clearTimeout(killTimer);
        process.off('SIGINT', onCancel);
        process.off('SIGTERM', onCancel);
        activeChild = null;
        activeCleanup = false;
      };
      child.once('error', (error) => {
        done();
        reject(error);
      });
      child.once('close', (code) => {
        done();
        code === 0 && !timedOut && (!cancelled || cleanup)
          ? resolve()
          : reject(
              new Error(
                name +
                  ' exited ' +
                  code +
                  (timedOut ? ' (timeout)' : '') +
                  (cancelled ? ' (cancelled)' : '') +
                  '; inspect its log',
              ),
            );
      });
    });
    manifest.completed.push(name);
    save();
  } finally {
    fs.closeSync(fd);
  }
}
const pg = (name) => path.join(pgBin, name),
  pgArgs = ['-D', cluster, '-w', '-t', '30'];
let startAttempted = false;
save();
try {
  await run('initdb', pg('initdb'), [
    '-D',
    cluster,
    '--auth=trust',
    '--username=consent_own_proof',
    '--encoding=UTF8',
    '--locale=C',
  ]);
  startAttempted = true;
  await run('pg-start', pg('pg_ctl'), [
    ...pgArgs,
    '-l',
    path.join(values.output, 'postgres.log'),
    '-o',
    '-h 127.0.0.1 -p ' +
      port +
      " -k '' -c shared_buffers=64MB -c work_mem=4MB -c max_connections=30",
    'start',
  ]);
  await run('createdb', pg('createdb'), [
    '--host=127.0.0.1',
    '--port=' + port,
    '--username=consent_own_proof',
    database,
  ]);
  await run(
    'migrations',
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    {},
    true,
  );
  await run(
    'http-proof',
    process.execPath,
    [
      'node_modules/jest/bin/jest.js',
      '--config',
      'test/jest-widgets-live.json',
      '--testRegex',
      'consent-own-read\\.probe-spec\\.ts$',
      '--runInBand',
      '--runTestsByPath',
      'test/widgets-live/consent-own-read.probe-spec.ts',
      '--json',
      '--outputFile=' + path.join(values.output, 'jest.json'),
    ],
    { JEST_CONSENT_OWN_OUTPUT: values.output },
    true,
  );
  const observation = JSON.parse(
    fs.readFileSync(path.join(values.output, 'observations.json'), 'utf8'),
  );
  assert.equal(observation.unexpectedFetchCalls, 0);
  assert.ok(observation.actualReadOnlyResolverCalls > 5);
  manifest.status = 'passed';
} catch (error) {
  manifest.status = 'failed';
  manifest.error = error.message;
  throw error;
} finally {
  if (startAttempted) {
    try {
      await run('pg-stop', pg('pg_ctl'), [...pgArgs, '-m', 'fast', 'stop']);
      manifest.clusterStopped = true;
    } catch (error) {
      manifest.status = 'failed-stop';
      manifest.clusterStopped = false;
      manifest.stopError = error.message;
    }
  }
  save();
  process.off('SIGINT', onInt);
  process.off('SIGTERM', onTerm);
}
assert.equal(manifest.status, 'passed');
console.log('Proof passed; owned cluster stopped: ' + values.output);
