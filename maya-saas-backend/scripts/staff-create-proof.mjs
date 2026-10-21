// Focused synthetic YC-ST1 proof on a newly owned loopback PostgreSQL cluster. No existing DATABASE_URL,
// shared cluster, provider credential, env file or existing output is reused.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const backend = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
export function proofEnvironment(source, databaseUrl) {
  const url = new URL(databaseUrl);
  assert.equal(url.protocol, 'postgresql:');
  assert.equal(url.hostname, '127.0.0.1');
  assert.ok(url.port && url.port !== '5432');
  assert.match(
    url.pathname,
    /^\/maya_widget_gate_proof_staffcreate_[a-f0-9]+$/,
  );
  assert.equal(url.username, 'staff_create_proof');
  assert.equal(url.password + url.search + url.hash, '');
  const env = {
    DATABASE_URL: databaseUrl,
    NODE_ENV: 'test',
    NODE_OPTIONS: '--max-old-space-size=3072',
    LANG: 'C',
    TZ: 'UTC',
  };
  for (const key of ['PATH', 'HOME', 'TMPDIR', 'SYSTEMROOT'])
    if (source[key]) env[key] = source[key];
  return env;
}
export function proofCommands({ pgBin, cluster, log, port, database, output }) {
  assert.match(database, /^maya_widget_gate_proof_staffcreate_[a-f0-9]+$/);
  assert.ok(
    Number.isInteger(port) && port > 1024 && port <= 65535 && port !== 5432,
  );
  assert.ok(
    path.isAbsolute(cluster) && !/\s|'/.test(cluster),
    'private cluster path must fit pg_ctl options',
  );
  const executable = (name) => path.join(pgBin, name);
  const pgArgs = ['-D', cluster, '-w', '-t', '30'];
  const stage = {
    name: 'staff-create',
    command: process.execPath,
    args: [
      'node_modules/jest/bin/jest.js',
      '--config',
      'test/jest-widgets-live.json',
      '--testRegex',
      'staff-create\\.probe-spec\\.ts$',
      '--runInBand',
      '--runTestsByPath',
      'test/widgets-live/staff-create.probe-spec.ts',
      '--json',
      '--outputFile=' + path.join(output, 'staff-create-jest.json'),
    ],
  };
  return [
    {
      name: 'initdb',
      command: executable('initdb'),
      args: [
        '-D',
        cluster,
        '--auth=trust',
        '--username=staff_create_proof',
        '--encoding=UTF8',
        '--locale=C',
      ],
    },
    {
      name: 'pg-start',
      command: executable('pg_ctl'),
      args: [
        ...pgArgs,
        '-l',
        log,
        '-o',
        `-h 127.0.0.1 -p ${port} -k '' -c shared_buffers=64MB -c work_mem=4MB -c max_connections=30`,
        'start',
      ],
    },
    {
      name: 'createdb',
      command: executable('createdb'),
      args: [
        '--host=127.0.0.1',
        `--port=${port}`,
        '--username=staff_create_proof',
        database,
      ],
    },
    {
      name: 'migrations',
      command: process.execPath,
      args: ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    },
    stage,
  ];
}
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}
export async function runCommand(spec, env, output, control) {
  assert.ok(
    spec.timeoutMs === undefined ||
      (Number.isSafeInteger(spec.timeoutMs) &&
        spec.timeoutMs > 0 &&
        spec.timeoutMs <= 720_000),
    'Owned command timeout must be bounded by 720000ms',
  );
  const cleanup = spec.name === 'pg-stop';
  if (control.cancelled && !cleanup)
    throw new Error('Proof cancelled: ' + control.cancelled);
  const fd = fs.openSync(path.join(output, spec.name + '.log'), 'wx', 0o600);
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(spec.command, spec.args, {
        cwd: spec.cwd ?? backend,
        env: { ...env, ...spec.env },
        stdio: ['ignore', fd, fd],
      });
      let timedOut = false,
        finished = false,
        killTimer;
      const terminate = () => {
        child.kill('SIGTERM');
        killTimer ??= setTimeout(() => child.kill('SIGKILL'), 5000);
      };
      control.terminateActive = terminate;
      control.activeCleanup = cleanup;
      const timer = setTimeout(
        () => {
          timedOut = true;
          terminate();
        },
        cleanup ? 45_000 : (spec.timeoutMs ?? 180_000),
      );
      const done = () => {
        if (finished) return false;
        finished = true;
        clearTimeout(timer);
        clearTimeout(killTimer);
        control.terminateActive = null;
        control.activeCleanup = false;
        return true;
      };
      child.once('error', (error) => {
        if (done()) reject(error);
      });
      child.once('close', (code) => {
        if (!done()) return;
        code === 0 && !timedOut && (!control.cancelled || cleanup)
          ? resolve()
          : reject(
              new Error(
                `${spec.name} ${timedOut ? 'timed out' : `exited ${code}`}${control.cancelled ? '; cancelled: ' + control.cancelled : ''}; inspect its log`,
              ),
            );
      });
    });
  } finally {
    fs.closeSync(fd);
  }
}
export async function main(args) {
  const { values } = parseArgs({
    args,
    options: {
      run: { type: 'boolean' },
      output: { type: 'string' },
      'pg-bin': {
        type: 'string',
        default: '/opt/homebrew/opt/postgresql@16/bin',
      },
    },
    strict: true,
  });
  if (!values.run) {
    process.stdout.write(
      'Preparation only. node scripts/staff-create-proof.mjs --run --output=/absolute/new/evidence-directory [--pg-bin=/path/to/postgresql/bin]\n',
    );
    return;
  }
  assert.ok(
    values.output && path.isAbsolute(values.output),
    'new absolute output directory required',
  );
  for (const name of ['.env', '.env.local'])
    assert.equal(
      fs.existsSync(path.join(backend, name)),
      false,
      'env file not permitted',
    );
  assert.equal(
    fs.existsSync(values.output),
    false,
    'output must be new; evidence is not overwritten',
  );
  for (const name of ['initdb', 'pg_ctl', 'createdb'])
    fs.accessSync(path.join(values['pg-bin'], name), fs.constants.X_OK);
  fs.mkdirSync(values.output, { mode: 0o700 });
  const privateRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'maya-staffcreate-'),
  );
  fs.chmodSync(privateRoot, 0o700);
  const cluster = path.join(privateRoot, 'pg'),
    port = await freePort(),
    database =
      'maya_widget_gate_proof_staffcreate_' + randomBytes(6).toString('hex');
  const env = proofEnvironment(
    process.env,
    `postgresql://staff_create_proof@127.0.0.1:${port}/${database}`,
  );
  const commands = proofCommands({
    pgBin: values['pg-bin'],
    cluster,
    log: path.join(values.output, 'postgres.log'),
    port,
    database,
    output: values.output,
  });
  const manifest = {
    contract: 'maya.staff-create-owned-cluster/1',
    database,
    port,
    cluster,
    mode: 'staff-create-chat-http-pg-native-synthetic-provider',
    status: 'running',
    completed: [],
    resources: {
      nodeHeapMb: 3072,
      pgSharedBuffersMb: 64,
      pgWorkMemMb: 4,
      pgMaxConnections: 30,
      jestWorkers: 1,
    },
  };
  const save = () =>
    fs.writeFileSync(
      path.join(values.output, 'manifest.json'),
      JSON.stringify(manifest, null, 2) + '\n',
      { mode: 0o600 },
    );
  const control = {
    cancelled: null,
    terminateActive: null,
    activeCleanup: false,
  };
  const cancel = (signal) => {
    control.cancelled ??= signal;
    manifest.cancelledBy = control.cancelled;
    save();
    // Only the directly owned stage; cleanup always stops the owned cluster.
    if (!control.activeCleanup) control.terminateActive?.();
  };
  const onInt = () => cancel('SIGINT'),
    onTerm = () => cancel('SIGTERM');
  process.on('SIGINT', onInt);
  process.on('SIGTERM', onTerm);
  save();
  let startAttempted = false;
  try {
    for (const command of commands) {
      if (command.name === 'pg-start') startAttempted = true;
      process.stdout.write(command.name + '\n');
      await runCommand(command, env, values.output, control);
      manifest.completed.push(command.name);
      save();
    }
    manifest.status = 'passed';
  } catch (error) {
    manifest.status = 'failed';
    throw error;
  } finally {
    if (startAttempted) {
      try {
        await runCommand(
          {
            name: 'pg-stop',
            command: path.join(values['pg-bin'], 'pg_ctl'),
            args: ['-D', cluster, '-m', 'fast', '-w', '-t', '30', 'stop'],
          },
          env,
          values.output,
          control,
        );
        manifest.clusterStopped = true;
      } catch {
        manifest.status = 'failed-owned-cluster-stop';
        manifest.clusterStopped = false;
        process.stderr.write(`Owned cluster may need cleanup: ${cluster}\n`);
      }
    }
    save();
    process.off('SIGINT', onInt);
    process.off('SIGTERM', onTerm);
  }
  assert.equal(manifest.status, 'passed');
  process.stdout.write(
    `Staff quick-create HTTP/PG/native synthetic-provider proof passed. Evidence: ${values.output}\n`,
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main(process.argv.slice(2));
