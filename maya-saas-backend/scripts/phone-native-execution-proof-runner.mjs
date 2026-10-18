// Own fresh synthetic PG only. No reused DB, .env, keys, effect allowance or grant.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
const { values } = parseArgs({
  options: {
    run: { type: 'boolean' },
    output: { type: 'string' },
    'pg-bin': { type: 'string' },
  },
});
assert(
  values.run && path.isAbsolute(values.output) && !fs.existsSync(values.output),
);
assert(path.isAbsolute(values['pg-bin']));
const backend = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
  ),
  out = values.output,
  pg = values['pg-bin'];
for (const n of ['.env', '.env.local'])
  assert(!fs.existsSync(path.join(backend, n)));
const git = (...args) =>
  execFileSync('git', args, { cwd: backend, encoding: 'utf8' }).trim();
const candidate = git('rev-parse', 'HEAD');
assert.equal(
  git('status', '--porcelain'),
  '',
  'Fresh committed clean candidate required',
);
fs.mkdirSync(out, { mode: 0o700 });
for (const n of ['home', 'tmp'])
  fs.mkdirSync(path.join(out, n), { mode: 0o700 });
const cluster = path.join(out, 'pg'),
  server = net.createServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
await new Promise((r) => server.close(r));
const database =
  'maya_widget_gate_proof_native_execution_' + randomBytes(6).toString('hex');
const env = {
  DATABASE_URL: `postgresql://native_proof@127.0.0.1:${port}/${database}`,
  NODE_ENV: 'test',
  NODE_OPTIONS: '--max-old-space-size=3072',
  MAYA_PROOF_CANDIDATE: candidate,
  PATH:
    path.dirname(process.execPath) +
    ':' +
    pg +
    ':/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
  HOME: path.join(out, 'home'),
  TMPDIR: path.join(out, 'tmp'),
  LANG: 'C',
  TZ: 'UTC',
};
const m = {
  contract: 'maya.native-execution-isolated-programme/1',
  candidate,
  status: 'running',
  completed: [],
  cluster,
  syntheticOnly: true,
  externalEffects: 0,
  certificate: 'NOT_ISSUED',
};
const save = () =>
  fs.writeFileSync(
    path.join(out, 'manifest.json'),
    JSON.stringify(m, null, 2) + '\n',
  );
save();
let active,
  cancelled = false,
  started = false;
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    cancelled = true;
    active?.kill('SIGTERM');
  });
async function run(name, cmd, args, cleanup = false) {
  assert(!cancelled || cleanup);
  const fd = fs.openSync(path.join(out, name + '.log'), 'wx', 0o600);
  try {
    await new Promise((resolve, reject) => {
      const argv = [
        '-p',
        '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*") (remote unix-socket))',
        cmd,
        ...args,
      ];
      active = spawn('/usr/bin/sandbox-exec', argv, {
        cwd: backend,
        env,
        stdio: ['ignore', fd, fd],
      });
      const child = active;
      let kill;
      const timer = setTimeout(
        () => {
          child.kill('SIGTERM');
          kill = setTimeout(() => child.kill('SIGKILL'), 5000);
        },
        cleanup ? 45000 : 300000,
      );
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        clearTimeout(timer);
        clearTimeout(kill);
        active = null;
        code === 0
          ? resolve()
          : reject(Error(name + ': ' + code + '/' + signal));
      });
    });
    m.completed.push(name);
    save();
  } finally {
    fs.closeSync(fd);
  }
}
try {
  await run('initdb', path.join(pg, 'initdb'), [
    '-D',
    cluster,
    '--auth=trust',
    '--username=native_proof',
    '--encoding=UTF8',
    '--locale=C',
  ]);
  started = true;
  await run('pg-start', path.join(pg, 'pg_ctl'), [
    '-D',
    cluster,
    '-w',
    '-t',
    '30',
    '-l',
    path.join(out, 'postgres.log'),
    '-o',
    `-h 127.0.0.1 -p ${port} -k '' -c shared_buffers=32MB -c max_connections=20`,
    'start',
  ]);
  await run('backend-build', process.execPath, [
    'node_modules/@nestjs/cli/bin/nest.js',
    'build',
  ]);
  m.proofs = [];
  for (const [label, suffix, flags] of [
    ['lifecycle', 'a', []],
    ['lost-response', 'b', ['--lose-create-response']],
  ]) {
    const proofDatabase = database + suffix;
    env.DATABASE_URL = `postgresql://native_proof@127.0.0.1:${port}/${proofDatabase}`;
    await run(label + '-createdb', path.join(pg, 'createdb'), [
      '-h',
      '127.0.0.1',
      '-p',
      String(port),
      '-U',
      'native_proof',
      proofDatabase,
    ]);
    await run(label + '-migrations', process.execPath, [
      'node_modules/prisma/build/index.js',
      'migrate',
      'deploy',
    ]);
    await run(label + '-compiled', process.execPath, [
      'scripts/phone-native-execution-proof.mjs',
      '--run',
      path.join(out, label),
      ...flags,
    ]);
    const bytes = fs.readFileSync(path.join(out, label, 'manifest.json'));
    const result = JSON.parse(bytes);
    assert.equal(result.status, 'passed');
    assert.equal(result.applicationStopped, true);
    m.proofs.push({
      mode: label,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      checks: result.checks.length,
    });
    save();
  }
  assert.equal(git('rev-parse', 'HEAD'), candidate);
  assert.equal(git('status', '--porcelain'), '');
  m.status = 'passed';
} catch (e) {
  m.status = 'failed';
  m.failure = e.message;
  process.exitCode = 1;
} finally {
  if (started)
    try {
      await run(
        'pg-stop',
        path.join(pg, 'pg_ctl'),
        ['-D', cluster, '-m', 'fast', '-w', 'stop'],
        true,
      );
      m.clusterStopped = true;
    } catch (e) {
      m.status = 'failed';
      m.clusterStopped = false;
      m.stopFailure = e.message;
    }
  m.finishedAt = new Date().toISOString();
  save();
}
console.log(
  JSON.stringify({
    status: m.status,
    candidate,
    clusterStopped: m.clusterStopped,
  }),
);
