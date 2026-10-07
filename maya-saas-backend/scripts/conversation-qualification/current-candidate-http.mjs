// Explicit narrow local proof. Never reuses a cluster, DB, env file or output.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { localProofProfile } from './current-candidate-local-profile.mjs';
import {
  qualifyProfileMetadata,
  validateProfileMetadata,
} from './current-candidate-profile-metadata.mjs';
import { freezeCurrentCandidate } from './current-candidate.mjs';
import { trackOwnedChild } from './owned-child-cleanup.mjs';
const backend = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const { values } = parseArgs({
  options: {
    run: { type: 'boolean' },
    output: { type: 'string' },
    groups: { type: 'string' },
    'broker-preflight': { type: 'boolean' },
    'pg-bin': { type: 'string' },
    preflight: { type: 'boolean' },
    'profile-metadata': { type: 'string' },
  },
});
const hasProfileMetadata = values['profile-metadata'] !== undefined;
assert.ok(
  !hasProfileMetadata || values.preflight,
  'candidate_profile_metadata_preflight_only',
);
if (values.preflight) {
  assert.ok(
    !values.run &&
      !values.output &&
      !values.groups &&
      !values['broker-preflight'],
    'candidate_profile_mode_conflict',
  );
  let report;
  if (hasProfileMetadata) {
    // Read only the explicitly supplied bounded JSON. Never resolve or open any
    // credential/evidence/target reference described inside it.
    try {
      const file = values['profile-metadata'];
      if (!path.isAbsolute(file) || !file.endsWith('.json')) throw new Error();
      const fd = fs.openSync(
        file,
        fs.constants.O_RDONLY |
          fs.constants.O_NOFOLLOW |
          fs.constants.O_NONBLOCK,
      );
      let metadata;
      try {
        const stat = fs.fstatSync(fd);
        if (!stat.isFile() || stat.size > 16384) throw new Error();
        const bytes = Buffer.alloc(16385);
        const count = fs.readSync(fd, bytes, 0, bytes.length, 0);
        if (count > 16384) throw new Error();
        metadata = JSON.parse(bytes.subarray(0, count).toString('utf8'));
      } finally {
        fs.closeSync(fd);
      }
      validateProfileMetadata(metadata);
      const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: backend,
        encoding: 'utf8',
        timeout: 5000,
      }).trim();
      const candidate = freezeCurrentCandidate(backend, commit);
      // No declared clean candidate when its frozen runtime/corpus bytes differ
      // from HEAD. The preflight itself is not a live broker admission proof.
      for (const [file, expected] of Object.entries(candidate.sourceHashes)) {
        const committed = execFileSync(
          'git',
          ['show', `${commit}:maya-saas-backend/${file}`],
          {
            cwd: backend,
            timeout: 5000,
            maxBuffer: 4 * 1024 * 1024,
          },
        );
        if (createHash('sha256').update(committed).digest('hex') !== expected)
          throw new Error('candidate_profile_sources_uncommitted');
      }
      report = qualifyProfileMetadata({
        metadata,
        candidate,
        localObservation: localProofProfile({ pgBin: values['pg-bin'] }),
      });
      report.sourceBinding = 'FROZEN_SOURCE_HASHES_CHECKED_AGAINST_HEAD';
    } catch (error) {
      const allowed = [
        'candidate_profile_metadata_invalid',
        'candidate_profile_binding_invalid',
        'candidate_profile_binding_mismatch',
        'candidate_profile_sources_uncommitted',
      ];
      console.error(
        allowed.includes(error?.message)
          ? error.message
          : 'candidate_profile_preflight_failed',
      );
      process.exit(1);
    }
  } else report = localProofProfile({ pgBin: values['pg-bin'] });
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
const groups = values.groups?.split(',');
assert.ok(
  !groups ||
    (groups.length &&
      new Set(groups).size === groups.length &&
      groups.every((g) =>
        [
          'booking',
          'personal',
          'admin',
          'staff_config',
          'bi',
          'lifecycle',
          'occupancy',
          'goods',
        ].includes(g),
      )),
  'Finite corpus groups only',
);
assert.equal(
  values.run,
  true,
  'Explicit --run and parent heavy-slot authorization required',
);
assert.ok(
  values.output &&
    path.isAbsolute(values.output) &&
    !fs.existsSync(values.output),
  'New absolute output required',
);
for (const name of ['.env', '.env.local'])
  assert.equal(fs.existsSync(path.join(backend, name)), false);
const localProfile = localProofProfile({ pgBin: values['pg-bin'] });
fs.mkdirSync(values.output, { mode: 0o700 });
const privateRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'maya-candidate-http-'),
);
const cluster = path.join(privateRoot, 'pg'),
  pgBin = localProfile.pgBin;
const portServer = net.createServer();
await new Promise((resolve, reject) => {
  portServer.once('error', reject);
  portServer.listen(0, '127.0.0.1', resolve);
});
const port = portServer.address().port;
await new Promise((resolve) => portServer.close(resolve));
const database =
  'maya_widget_gate_proof_candidate_' + randomBytes(6).toString('hex');
const env = {
  DATABASE_URL: `postgresql://candidate_proof@127.0.0.1:${port}/${database}`,
  NODE_ENV: 'test',
  NODE_OPTIONS: '--max-old-space-size=3072',
  LANG: 'C',
  TZ: 'UTC',
};
for (const key of ['PATH', 'HOME', 'TMPDIR'])
  if (process.env[key]) env[key] = process.env[key];
const manifest = {
  kind: 'current-candidate-authenticated-http-offline-mechanics',
  localProfile,
  cluster,
  database,
  port,
  status: 'running',
  completed: [],
  modelSelection: 'SCRIPTED_SYNTHETIC',
  photoParser: 'FORBIDDEN_UNUSED_NOT_OCR_ACCEPTANCE',
  sourceProvider: 'SYNTHETIC_READS_ONLY',
  externalFetchCalls: 0,
  realModelAcceptance: false,
  externalProviderAcceptance: false,
  certificate: 'NOT_ISSUED',
  resources: { nodeHeapMb: 3072, pgSharedBuffersMb: 64, jestWorkers: 1 },
};
const save = () =>
  fs.writeFileSync(
    path.join(values.output, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
let cancelled = null,
  activeChild = null,
  activeCleanup = false,
  brokerChild = null,
  brokerUrl = null;
let stopBrokerChild = null;
const stopBroker = async () => {
  if (!stopBrokerChild) return;
  await stopBrokerChild();
  manifest.brokerStopped = true;
};
const startBroker = async () => {
  if (!values['broker-preflight']) return;
  const { execFileSync } = await import('node:child_process');
  const candidate = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: backend,
    encoding: 'utf8',
  }).trim();
  const fd = fs.openSync(path.join(values.output, 'broker.log'), 'wx', 0o600);
  const brokerEnv = {
    NODE_OPTIONS: '--max-old-space-size=256',
    NODE_ENV: 'test',
    TZ: 'UTC',
  };
  for (const key of ['PATH', 'HOME', 'TMPDIR'])
    if (process.env[key]) brokerEnv[key] = process.env[key];
  try {
    brokerChild = spawn(
      process.execPath,
      [
        'scripts/conversation-qualification/current-candidate-dry-broker.mjs',
        '--output',
        values.output,
        '--candidate',
        candidate,
        '--no-upstream',
      ],
      { cwd: backend, env: brokerEnv, stdio: ['ignore', fd, fd, 'ipc'] },
    );
    stopBrokerChild = trackOwnedChild(brokerChild);
  } finally {
    fs.closeSync(fd);
  }
  const ready = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('dry_broker_start_timeout')),
      10000,
    );
    brokerChild.once('message', (data) => {
      clearTimeout(timer);
      resolve(data);
    });
    brokerChild.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    brokerChild.once('exit', () => {
      clearTimeout(timer);
      reject(new Error('dry_broker_early_exit'));
    });
  });
  assert.ok(
    ready.type === 'ready' &&
      ready.mode === 'NO_UPSTREAM_ONLY' &&
      Number.isSafeInteger(ready.port),
  );
  brokerUrl = `http://127.0.0.1:${ready.port}/chat/completions`;
  manifest.broker = {
    mode: ready.mode,
    pid: brokerChild.pid,
    port: ready.port,
    heapMb: 256,
    credentialsLoaded: false,
    upstreamCalls: 0,
  };
  save();
};
const cancel = (signal) => {
  cancelled ??= signal;
  manifest.cancelledBy = cancelled;
  save();
  // Only the directly owned stage; PostgreSQL is stopped by the outer finally.
  if (!activeCleanup) activeChild?.kill('SIGTERM');
};
const onInt = () => cancel('SIGINT'),
  onTerm = () => cancel('SIGTERM');
process.on('SIGINT', onInt);
process.on('SIGTERM', onTerm);
async function run(name, command, args, extra = {}, cwd = backend) {
  const cleanup = name === 'pg-stop';
  if (cancelled && !cleanup) throw new Error('Proof cancelled: ' + cancelled);
  console.log(name);
  const fd = fs.openSync(path.join(values.output, name + '.log'), 'wx', 0o600);
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        env: { ...env, ...extra },
        stdio: ['ignore', fd, fd],
      });
      activeChild = child;
      activeCleanup = cleanup;
      let killTimer;
      const terminate = () => {
        child.kill('SIGTERM');
        killTimer ??= setTimeout(() => child.kill('SIGKILL'), 5000);
      };
      // Cancellation and timeout both have a bounded TERM → KILL path.
      const onCancel = () => {
        if (!cleanup) terminate();
      };
      process.on('SIGINT', onCancel);
      process.on('SIGTERM', onCancel);
      const timer = setTimeout(
        terminate,
        cleanup ? 45_000 : name === 'candidate-http' ? 720_000 : 240_000,
      );
      const done = () => {
        clearTimeout(timer);
        clearTimeout(killTimer);
        process.off('SIGINT', onCancel);
        process.off('SIGTERM', onCancel);
        activeChild = null;
        activeCleanup = false;
      };
      child.once('error', (e) => {
        done();
        reject(e);
      });
      child.once('close', (code) => {
        done();
        code === 0 && (!cancelled || cleanup)
          ? resolve()
          : reject(
              new Error(
                `${name} exited ${code}${cancelled ? '; cancelled: ' + cancelled : ''}; inspect its log`,
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
const stage = () =>
  run(
    'candidate-http',
    process.execPath,
    [
      'node_modules/jest/bin/jest.js',
      '--config',
      'test/jest-current-candidate-http.json',
      '--testRegex',
      'current-candidate-http\\.probe-spec\\.ts$',
      '--runInBand',
      '--runTestsByPath',
      'test/widgets-live/current-candidate-http.probe-spec.ts',
      '--json',
      '--outputFile=' + path.join(values.output, 'jest.json'),
    ],
    {
      JEST_CANDIDATE_HTTP_OUTPUT: values.output,
      ...(groups ? { JEST_CANDIDATE_GROUPS: groups.join(',') } : {}),
      ...(brokerUrl ? { JEST_CANDIDATE_DRY_BROKER: brokerUrl } : {}),
    },
  );
let startAttempted = false;
save();
try {
  await run('initdb', pg('initdb'), [
    '-D',
    cluster,
    '--auth=trust',
    '--username=candidate_proof',
    '--encoding=UTF8',
    '--locale=C',
  ]);
  startAttempted = true;
  await run('pg-start', pg('pg_ctl'), [
    ...pgArgs,
    '-l',
    path.join(values.output, 'postgres.log'),
    '-o',
    `-h 127.0.0.1 -p ${port} -k '' -c shared_buffers=64MB -c work_mem=4MB -c max_connections=30`,
    'start',
  ]);
  await run('createdb', pg('createdb'), [
    '--host=127.0.0.1',
    '--port=' + port,
    '--username=candidate_proof',
    database,
  ]);
  await run('migrations', process.execPath, [
    'node_modules/prisma/build/index.js',
    'migrate',
    'deploy',
  ]);
  await run('har13-diagnostic-placement', process.execPath, [
    'node_modules/jest/bin/jest.js',
    '--config',
    'test/jest-widgets-live.json',
    '--runInBand',
    '--runTestsByPath',
    'test/widgets-live/harness.live-spec.ts',
    '--testNamePattern',
    'HAR-13 refuses the actual synthetic diagnostic helper',
    '--json',
    '--outputFile=' + path.join(values.output, 'har13-jest.json'),
  ]);
  await startBroker();
  await stage();
  const report = JSON.parse(
    fs.readFileSync(path.join(values.output, 'http-report.json'), 'utf8'),
  );
  manifest.corpusStatus = report.status;
  manifest.unexecutedTurns = report.outcomes.filter(
    (turn) => turn.status === 'UNEXECUTED',
  ).length;
  manifest.qualification = 'OFFLINE_MECHANICS_ONLY_NOT_LANGUAGE_ACCEPTANCE';
  assert.equal(
    report.status,
    'OFFLINE_MECHANICS_PASS_WITH_QUALIFIERS',
    'Corpus did not finish; inspect the preserved HTTP report',
  );
  manifest.status = 'passed';
} catch (e) {
  manifest.status = 'failed';
  throw e;
} finally {
  try {
    await stopBroker();
  } catch {
    manifest.status = 'failed-broker-stop';
    manifest.brokerStopped = false;
  } finally {
    if (startAttempted) {
      try {
        await run('pg-stop', pg('pg_ctl'), [...pgArgs, '-m', 'fast', 'stop']);
        manifest.clusterStopped = true;
      } catch {
        manifest.status = 'failed-stop';
        manifest.clusterStopped = false;
      }
    }
    save();
    process.off('SIGINT', onInt);
    process.off('SIGTERM', onTerm);
  }
}
assert.equal(manifest.status, 'passed');
console.log('Proof passed; owned services stopped: ' + values.output);
