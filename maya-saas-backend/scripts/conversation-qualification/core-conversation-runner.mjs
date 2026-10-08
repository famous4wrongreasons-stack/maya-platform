// Explicit source-bound conversational profile; old paid pilot is never resumed.
// --prepare creates only nonsecret declarations. --run dry has no upstream.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import {
  captureCoreManifest,
  assertCoreSources,
  coreBackend,
  coreHash,
} from './core-conversation-source.mjs';
import {
  readCoreManifest,
  assertCoreAdmission,
} from './core-conversation-admission.mjs';
import { socketRequest } from './core-conversation-socket.mjs';
import { CORE_DIAGNOSTIC_PROFILE } from './current-candidate-budget.mjs';
import { proofCommands, proofEnvironment } from '../c9-occupancy-proof.mjs';
import { runOwnedStage, trackOwnedChild } from './owned-child-cleanup.mjs';
import { coreConversationResources } from './core-conversation-resources.mjs';
const { values } = parseArgs({
  options: {
    prepare: { type: 'boolean' },
    run: { type: 'boolean' },
    mode: { type: 'string' },
    output: { type: 'string' },
    manifest: { type: 'string' },
    'manifest-sha256': { type: 'string' },
    'admission-context': { type: 'string' },
    permit: { type: 'string' },
    'permit-sha256': { type: 'string' },
    'owner-approval-ref': { type: 'string' },
    'pg-bin': { type: 'string' },
    'node-heap-mb': { type: 'string' },
    'broker-heap-mb': { type: 'string' },
  },
  strict: true,
});
const resources = coreConversationResources({
  nodeHeapMb: values['node-heap-mb'],
  brokerHeapMb: values['broker-heap-mb'],
});
assert.ok(
  values.prepare !== values.run && Boolean(values.prepare || values.run),
  'core_runner_explicit_action',
);
assert.ok(
  ['dry', 'admitted', 'admitted-local'].includes(values.mode),
  'core_runner_mode',
);
assert.ok(
  values.output &&
    path.isAbsolute(values.output) &&
    !fs.existsSync(values.output),
  'core_runner_new_output',
);
for (const name of ['.env', '.env.local'])
  assert.equal(
    fs.existsSync(path.join(coreBackend, name)),
    false,
    'core_runner_no_env_files',
  );
const localStdin = values.mode === 'admitted-local';
const live = values.mode !== 'dry';
const manifestMode = localStdin
  ? 'ADMITTED_LOCAL_MODEL_HTTP'
  : live
    ? 'ADMITTED_MODEL_HTTP'
    : 'DRY_HTTP';
if (live && values.run)
  assert.ok(values.manifest, 'core_runner_live_prepared_manifest_required');
if (!live)
  assert.ok(
    !values.permit &&
      !values['permit-sha256'] &&
      !values['owner-approval-ref'] &&
      !values['admission-context'],
    'core_runner_dry_authority',
  );
if (values.prepare)
  assert.ok(
    !values.permit && !values['permit-sha256'] && !values['owner-approval-ref'],
    'core_runner_preparation_only',
  );
fs.mkdirSync(values.output, { mode: 0o700 });
const output = fs.realpathSync(values.output);
let manifestPath, manifestSha256, manifest;
if (values.manifest) {
  assert.ok(
    !values['admission-context'],
    'core_runner_manifest_context_conflict',
  );
  manifestPath = fs.realpathSync(values.manifest);
  manifestSha256 = values['manifest-sha256'];
  manifest = readCoreManifest(manifestPath, manifestSha256, { localStdin });
} else {
  assert.ok(
    !values['manifest-sha256'],
    'core_runner_manifest_pin_without_file',
  );
  let context = null;
  if (live) {
    assert.ok(
      values['admission-context'],
      'core_runner_admission_context_required',
    );
    const bytes = fs.readFileSync(values['admission-context']);
    assert.ok(bytes.length <= 16384, 'core_runner_context_limit');
    context = JSON.parse(bytes);
  }
  const raw = captureCoreManifest(manifestMode, context);
  manifestPath = path.join(output, 'candidate-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(raw, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o644,
  });
  manifestSha256 = coreHash(fs.readFileSync(manifestPath));
  manifest = readCoreManifest(manifestPath, manifestSha256, { localStdin });
}
assert.equal(manifest.mode, manifestMode);
assertCoreSources(manifest);
if (values.prepare) {
  console.log(
    JSON.stringify({
      status: 'PREPARED_NOT_AUTHORIZED',
      manifestPath,
      manifestSha256,
      candidateCommit: manifest.candidateCommit,
      paidAuthorized: false,
      resources: {
        nodeHeapMb: resources.nodeHeapMb,
        brokerHeapMb: resources.brokerHeapMb,
      },
    }),
  );
  process.exit(0);
}
let admission, brokerUrl;
if (live) {
  assert.ok(
    values.permit && values['permit-sha256'] && values['owner-approval-ref'],
    'core_runner_live_prerequisites',
  );
  admission = assertCoreAdmission({
    path: values.permit,
    sha256: values['permit-sha256'],
    manifest,
    claimPath: values.permit + '.claim',
    target: manifest.admissionContext.target,
    credentialSource: manifest.admissionContext.credentialSource,
    ownerApprovalRef: values['owner-approval-ref'],
    role: 'runner',
  });
}
const privateRoot = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'maya-core-conversation-')),
  ),
  cluster = path.join(privateRoot, 'pg');
const pgBin =
  values['pg-bin'] ??
  (process.platform === 'darwin'
    ? '/opt/homebrew/opt/postgresql@16/bin'
    : null);
assert.ok(pgBin, 'core_runner_explicit_pg_bin');
for (const name of ['initdb', 'pg_ctl', 'createdb'])
  fs.accessSync(path.join(pgBin, name), fs.constants.X_OK);
const sock = net.createServer();
await new Promise((resolve, reject) => {
  sock.once('error', reject);
  sock.listen(0, '127.0.0.1', resolve);
});
const port = sock.address().port;
await new Promise((resolve, reject) =>
  sock.close((e) => (e ? reject(e) : resolve())),
);
const database =
  'maya_widget_gate_proof_c9occ_' + randomBytes(6).toString('hex');
const env = proofEnvironment(
  process.env,
  `postgresql://c9_proof@127.0.0.1:${port}/${database}`,
);
env.NODE_OPTIONS = resources.nodeOptions;
const report = {
  contract: 'maya.core-conversation-runner/1',
  status: 'running',
  mode: manifest.mode,
  runId: manifest.runId,
  candidateCommit: manifest.candidateCommit,
  manifestSha256,
  profile: CORE_DIAGNOSTIC_PROFILE,
  cluster,
  database,
  port,
  completed: [],
  groups: {},
  resources: {
    nodeHeapMb: resources.nodeHeapMb,
    brokerHeapMb: resources.brokerHeapMb,
    jestWorkers: 1,
    pgSharedBuffersMb: 64,
    pgWorkMemMb: 4,
    pgMaxConnections: 30,
  },
  qualification: live
    ? 'REAL_MODEL_SYNTHETIC_DATA_UNGRADED'
    : 'DRY_HTTP_CANNED_MECHANICS_NOT_MODEL_QUALITY',
};
const save = () =>
  fs.writeFileSync(
    path.join(output, 'runner-report.json'),
    JSON.stringify(report, null, 2) + '\n',
    { mode: 0o600 },
  );
let broker,
  stopBroker,
  brokerFd,
  brokerClosed = false,
  startAttempted = false,
  boundLiveBroker = false;
const control = { cancelled: null, terminateActive: null };
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'])
  process.on(signal, () => {
    control.cancelled ??= signal;
    control.terminateActive?.();
  });
save();
try {
  if (live) {
    const status = await socketRequest(
      manifest.admissionContext.target,
      '/status',
      {
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      },
      { localStdin },
    ).then((r) => r.json());
    assert.equal(status.manifestSha256, manifestSha256);
    assert.equal(status.runId, manifest.runId);
    assert.equal(status.paidAuthorized, true);
    assert.equal(status.limitsSha256, manifest.limitsSha256);
    boundLiveBroker = true;
  }
  const setup = proofCommands({
    pgBin,
    cluster,
    log: path.join(output, 'postgres.log'),
    port,
    database,
    receipt: path.join(privateRoot, 'unused-private.json'),
    output,
  }).slice(0, 4);
  for (const spec of setup) {
    assertCoreSources(manifest);
    if (admission)
      admission({
        candidateCommit: manifest.candidateCommit,
        manifestSha256,
        profile: manifest.profile,
        limitsSha256: manifest.limitsSha256,
      });
    if (spec.name === 'pg-start') startAttempted = true;
    console.log('START ' + spec.name);
    await runOwnedStage(
      { ...spec, cwd: coreBackend, timeoutMs: 180000 },
      env,
      output,
      control,
      report,
    );
    report.completed.push(spec.name);
    save();
    console.log('PASS ' + spec.name);
  }
  if (!live) {
    brokerFd = fs.openSync(path.join(output, 'broker.log'), 'wx', 0o600);
    broker = spawn(
      process.execPath,
      [
        'scripts/conversation-qualification/core-conversation-broker.mjs',
        '--mode',
        'dry',
        '--manifest',
        manifestPath,
        '--manifest-sha256',
        manifestSha256,
        '--output',
        output,
      ],
      {
        cwd: coreBackend,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          TMPDIR: process.env.TMPDIR,
          TZ: 'UTC',
          NODE_OPTIONS: resources.brokerNodeOptions,
        },
        stdio: ['ignore', brokerFd, brokerFd, 'ipc'],
      },
    );
    stopBroker = trackOwnedChild(broker);
    broker.once('close', () => {
      brokerClosed = true;
    });
    report.brokerPid = broker.pid;
    const ready = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('core_broker_start_timeout')),
        10000,
      );
      broker.once('message', (m) => {
        clearTimeout(timer);
        resolve(m);
      });
      broker.once('error', () => {
        clearTimeout(timer);
        reject(new Error('core_broker_start_failed'));
      });
      broker.once('exit', () => {
        clearTimeout(timer);
        reject(new Error('core_broker_start_failed'));
      });
    });
    assert.equal(ready.type, 'ready');
    assert.equal(ready.mode, manifest.mode);
    assert.ok(Number.isInteger(ready.port) && ready.port > 0);
    brokerUrl = 'http://127.0.0.1:' + ready.port;
  }
  assertCoreSources(manifest);
  const probeEnv = {
    JEST_CORE_CONVERSATION_MODE: localStdin
      ? 'live-local'
      : live
        ? 'live'
        : 'dry',
    JEST_CORE_CONVERSATION_OUTPUT: output,
    ...(!live
      ? { JEST_CORE_CONVERSATION_BROKER_URL: brokerUrl + '/chat/completions' }
      : {}),
    JEST_CORE_CONVERSATION_MANIFEST_PATH: manifestPath,
    JEST_CORE_CONVERSATION_MANIFEST_SHA256: manifestSha256,
    JEST_CORE_CONVERSATION_SOURCE_HEAD: manifest.candidateCommit,
    JEST_CORE_CONVERSATION_SOURCE_DIGEST: coreHash(
      JSON.stringify(manifest.sourceHashes),
    ),
    ...(live
      ? {
          JEST_CORE_CONVERSATION_PERMIT_PATH: values.permit,
          JEST_CORE_CONVERSATION_PERMIT_SHA256: values['permit-sha256'],
          JEST_CORE_CONVERSATION_OWNER_APPROVAL_REF:
            values['owner-approval-ref'],
        }
      : {}),
  };
  const timeoutMs = live
    ? Math.max(1, Math.min(600000, admission.expiresAt - Date.now()))
    : 600000;
  console.log('START conversation');
  await runOwnedStage(
    {
      name: 'conversation',
      command: process.execPath,
      args: [
        'node_modules/jest/bin/jest.js',
        '--config',
        'test/jest-core-conversation-http.json',
        '--runInBand',
        '--json',
        '--outputFile=' + path.join(output, 'conversation-jest.json'),
      ],
      cwd: coreBackend,
      timeoutMs,
      env: probeEnv,
    },
    env,
    output,
    control,
    report,
  );
  report.completed.push('conversation');
  report.status = 'passed-ungraded';
} catch (error) {
  report.status = 'failed';
  report.failure = error.message;
  process.exitCode = 1;
} finally {
  if (stopBroker) {
    try {
      await stopBroker();
      report.brokerClosed =
        brokerClosed || broker.exitCode !== null || broker.signalCode !== null;
    } catch {
      report.status = 'failed-broker-cleanup';
      process.exitCode = 1;
    }
  } else if (boundLiveBroker) {
    try {
      const stopped = await socketRequest(
        manifest.admissionContext.target,
        '/finish',
        {
          method: 'POST',
          headers: { 'x-candidate-manifest': manifestSha256 },
          redirect: 'error',
          signal: AbortSignal.timeout(5000),
        },
        { localStdin },
      );
      report.brokerStopRequested = stopped.ok;
    } catch {
      report.brokerStopRequested = false;
    }
    report.liveBrokerCleanupRequiresBrokerReport = true;
  }
  if (brokerFd !== undefined) fs.closeSync(brokerFd);
  if (startAttempted) {
    try {
      await runOwnedStage(
        {
          name: 'pg-stop',
          command: path.join(pgBin, 'pg_ctl'),
          args: ['-D', cluster, '-m', 'fast', '-w', '-t', '30', 'stop'],
          cwd: coreBackend,
          timeoutMs: 45000,
        },
        env,
        output,
        { cancelled: null, terminateActive: null },
        report,
      );
      report.clusterStopped = true;
      report.postmasterPidAbsent = !fs.existsSync(
        path.join(cluster, 'postmaster.pid'),
      );
    } catch {
      report.clusterStopped = false;
      report.status = 'failed-cluster-stop';
      process.exitCode = 1;
    }
  }
  try {
    assertCoreSources(manifest);
    report.sourcesUnchanged = true;
  } catch {
    report.sourcesUnchanged = false;
    report.status = 'failed-source-drift';
    process.exitCode = 1;
  }
  save();
}
console.log(
  JSON.stringify({
    status: report.status,
    clusterStopped: report.clusterStopped,
    output,
    manifestSha256,
    qualification: report.qualification,
  }),
);
