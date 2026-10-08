// Finite synthetic proof, run only in the parent's assigned heavy slot.
// Reuses the existing bounded child runner; never connects to a shared cluster.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { runCommand } from './c9-occupancy-proof.mjs';

const backend = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const sourceFiles = [
  'scripts/staff-schedule-source-proof.mjs',
  'scripts/c9-occupancy-proof.mjs',
  'test/widgets-live/staff-schedule-source-restart.probe-spec.ts',
  'test/widgets-live/support/schedule-carrier-proof.mjs',
  'src/ai-tools/staff-schedule-command.service.ts',
  'src/ai-tools/ai-tool-handler.service.ts',
  'src/crm/adapters/yclients-crm.adapter.ts',
  'src/crm/crm.service.ts',
  'src/package5-wave3/package5-wave3.service.ts',
  'src/package5-wave3/package5-wave3-canonical-cutover.service.ts',
  'src/package5-wave3/package5-wave3-production-gateway.service.ts',
  'src/action-engine/action-engine.runtime.ts',
];
const sourceBindings = () =>
  Object.fromEntries(
    sourceFiles.map((file) => [
      file,
      createHash('sha256')
        .update(fs.readFileSync(path.join(backend, file)))
        .digest('hex'),
    ]),
  );

export function proofEnvironment(source, databaseUrl) {
  const url = new URL(databaseUrl);
  assert.equal(url.protocol, 'postgresql:');
  assert.equal(url.hostname, '127.0.0.1');
  assert.ok(url.port && url.port !== '5432');
  assert.match(
    url.pathname,
    /^\/maya_widget_gate_proof_staffschedule_[a-f0-9]+$/,
  );
  assert.equal(url.username, 'staff_schedule_proof');
  assert.equal(url.password + url.search + url.hash, '');
  const env = {
    DATABASE_URL: databaseUrl,
    NODE_ENV: 'test',
    NODE_OPTIONS: '--max-old-space-size=1536',
    LANG: 'C',
    TZ: 'UTC',
  };
  for (const key of ['PATH', 'HOME', 'TMPDIR', 'SYSTEMROOT'])
    if (source[key]) env[key] = source[key];
  return env;
}

export function proofCommands({
  pgBin,
  cluster,
  log,
  port,
  database,
  receipt,
  output,
}) {
  assert.match(database, /^maya_widget_gate_proof_staffschedule_[a-f0-9]+$/);
  assert.ok(
    Number.isInteger(port) && port > 1024 && port <= 65535 && port !== 5432,
  );
  assert.ok(path.isAbsolute(cluster) && !/\s|'/.test(cluster));
  const pg = (name) => path.join(pgBin, name);
  const pgArgs = ['-D', cluster, '-w', '-t', '30'];
  const probe = 'staff-schedule-source-restart';
  const stage = (name) => ({
    name,
    command: process.execPath,
    args: [
      'node_modules/jest/bin/jest.js',
      '--config',
      'test/jest-widgets-live.json',
      '--testRegex',
      probe + '\\.probe-spec\\.ts$',
      '--runInBand',
      '--runTestsByPath',
      `test/widgets-live/${probe}.probe-spec.ts`,
      '--json',
      '--outputFile=' + path.join(output, name + '-jest.json'),
    ],
    env: {
      JEST_STAFF_SCHEDULE_STAGE: name,
      JEST_STAFF_SCHEDULE_RECEIPT: receipt,
      JEST_STAFF_SCHEDULE_OUTPUT: output,
    },
  });
  return [
    {
      name: 'initdb',
      command: pg('initdb'),
      args: [
        '-D',
        cluster,
        '--auth=trust',
        '--username=staff_schedule_proof',
        '--encoding=UTF8',
        '--locale=C',
      ],
    },
    {
      name: 'pg-start',
      command: pg('pg_ctl'),
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
      command: pg('createdb'),
      args: [
        '--host=127.0.0.1',
        '--port=' + port,
        '--username=staff_schedule_proof',
        database,
      ],
    },
    {
      name: 'migrations',
      command: process.execPath,
      args: ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    },
    {
      name: 'carrier-bundle',
      command: process.execPath,
      args: ['../maya-carrier-react/test/build-harness.mjs'],
    },
    stage('prepare'),
    {
      name: 'pg-restart',
      command: pg('pg_ctl'),
      args: [...pgArgs, '-m', 'fast', 'restart'],
    },
    stage('resume'),
  ];
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
      'After parent assigns the heavy slot: node scripts/staff-schedule-source-proof.mjs --run --output=/absolute/new/evidence-directory [--pg-bin=/path/to/postgresql/bin]\n',
    );
    return;
  }
  assert.ok(
    values.output &&
      path.isAbsolute(values.output) &&
      !fs.existsSync(values.output),
    'New absolute evidence directory required',
  );
  for (const name of ['.env', '.env.local'])
    assert.equal(fs.existsSync(path.join(backend, name)), false);
  for (const name of ['initdb', 'pg_ctl', 'createdb'])
    fs.accessSync(path.join(values['pg-bin'], name), fs.constants.X_OK);
  const sourceHead = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: backend,
    encoding: 'utf8',
    timeout: 5000,
  }).trim();
  assert.match(sourceHead, /^[a-f0-9]{40}$/);
  const sources = sourceBindings();
  fs.mkdirSync(values.output, { mode: 0o700 });
  const privateRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'maya-staff-schedule-'),
  );
  fs.chmodSync(privateRoot, 0o700);
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  const cluster = path.join(privateRoot, 'pg');
  const database =
    'maya_widget_gate_proof_staffschedule_' + randomBytes(6).toString('hex');
  const env = proofEnvironment(
    process.env,
    `postgresql://staff_schedule_proof@127.0.0.1:${port}/${database}`,
  );
  env.JEST_STAFF_SCHEDULE_SOURCE_HEAD = sourceHead;
  env.JEST_STAFF_SCHEDULE_SOURCE_DIGEST = createHash('sha256')
    .update(JSON.stringify(sources))
    .digest('hex');
  const commands = proofCommands({
    pgBin: values['pg-bin'],
    cluster,
    log: path.join(values.output, 'postgres.log'),
    port,
    database,
    receipt: path.join(privateRoot, 'private-restart.json'),
    output: values.output,
  });
  const manifest = {
    kind: 'staff-schedule-native-source-http-pg-restart',
    status: 'running',
    sourceHead,
    sourceBindings: sources,
    sourceBindingsDigest: env.JEST_STAFF_SCHEDULE_SOURCE_DIGEST,
    cluster,
    database,
    port,
    completed: [],
    approvalScope: 'full-scope-existing-authority',
    syntheticTransport: true,
    realProviderAcceptance: false,
    realModelAcceptance: false,
    closedProfileAcceptance: false,
    browserAcceptance: false,
    presentation: 'current carrier + React SSR',
    resources: { nodeHeapMb: 1536, pgSharedBuffersMb: 64, jestWorkers: 1 },
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
    if (!control.activeCleanup) control.terminateActive?.();
  };
  const onInt = () => cancel('SIGINT'),
    onTerm = () => cancel('SIGTERM');
  process.on('SIGINT', onInt);
  process.on('SIGTERM', onTerm);
  let startAttempted = false;
  save();
  try {
    for (const command of commands) {
      assert.deepEqual(
        sourceBindings(),
        sources,
        'Proof sources changed after admission',
      );
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
    try {
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
          manifest.clusterStopped = false;
          manifest.status = 'failed-stop';
        }
      }
      save();
    } finally {
      process.off('SIGINT', onInt);
      process.off('SIGTERM', onTerm);
    }
  }
  assert.equal(manifest.status, 'passed');
  process.stdout.write(
    'Synthetic proof passed; owned services stopped: ' + values.output + '\n',
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  await main(process.argv.slice(2));
