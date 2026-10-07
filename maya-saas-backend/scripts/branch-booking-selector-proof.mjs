// Own fresh loopback PG only. Native provider transport is finite synthetic in-process.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  proofEnvironment,
  proofCommands as ownedCommands,
  runCommand,
} from './c9-occupancy-proof.mjs';
export { proofEnvironment };
const backend = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
export function proofCommands(options) {
  const plan = ownedCommands({
    ...options,
    browser: false,
    branchBinding: true,
  }).map((step) => {
    if (!['prepare', 'resume'].includes(step.name)) return step;
    return {
      ...step,
      args: step.args.map((arg) =>
        arg.replaceAll('crm-branch-binding-restart', 'branch-booking-selector'),
      ),
      env: {
        JEST_BRANCH_BOOKING_STAGE: step.name,
        JEST_BRANCH_BOOKING_RECEIPT: options.receipt,
        JEST_BRANCH_BOOKING_REPORT: path.join(
          options.output,
          step.name + '.json',
        ),
      },
    };
  });
  if (!options.browser) return plan;
  const prepare = plan.find((step) => step.name === 'prepare');
  return [
    ...plan.slice(0, 4),
    {
      name: 'react-web-build',
      command: process.execPath,
      args: ['build.mjs', '--target=web'],
      cwd: path.resolve(backend, '../maya-carrier-react'),
    },
    {
      ...prepare,
      name: 'browser',
      timeoutMs: 720000,
      args: prepare.args
        .map((arg) => arg.replace('prepare-jest.json', 'browser-jest.json'))
        .concat('--testTimeout=660000'),
      env: {
        ...prepare.env,
        JEST_BRANCH_BOOKING_STAGE: 'browser',
        JEST_BRANCH_BOOKING_REPORT: path.join(options.output, 'browser.json'),
      },
    },
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
export async function main(args) {
  const { values } = parseArgs({
    args,
    strict: true,
    options: {
      run: { type: 'boolean' },
      browser: { type: 'boolean' },
      output: { type: 'string' },
      'pg-bin': {
        type: 'string',
        default: '/opt/homebrew/opt/postgresql@16/bin',
      },
    },
  });
  if (!values.run) {
    process.stdout.write(
      'Preparation only. Parent heavy slot required: node scripts/branch-booking-selector-proof.mjs --run --output=/absolute/new/path [--browser] [--pg-bin=/explicit/pg/bin]\n',
    );
    return;
  }
  assert.ok(
    values.output && path.isAbsolute(values.output),
    'new absolute output directory required',
  );
  assert.equal(
    fs.existsSync(values.output),
    false,
    'evidence is never overwritten',
  );
  for (const file of ['.env', '.env.local'])
    assert.equal(
      fs.existsSync(path.join(backend, file)),
      false,
      'env files forbidden',
    );
  for (const name of ['initdb', 'pg_ctl', 'createdb'])
    fs.accessSync(path.join(values['pg-bin'], name), fs.constants.X_OK);
  fs.mkdirSync(values.output, { mode: 0o700 });
  const privateRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'maya-branch-selector-'),
  );
  fs.chmodSync(privateRoot, 0o700);
  const cluster = path.join(privateRoot, 'pg'),
    port = await freePort(),
    database = 'maya_widget_gate_proof_c9occ_' + randomBytes(6).toString('hex');
  const env = proofEnvironment(
    process.env,
    `postgresql://c9_proof@127.0.0.1:${port}/${database}`,
  );
  const commands = proofCommands({
    pgBin: values['pg-bin'],
    cluster,
    log: path.join(values.output, 'postgres.log'),
    port,
    database,
    receipt: path.join(privateRoot, 'private-restart.json'),
    output: values.output,
    browser: values.browser,
  });
  const tracked = execFileSync(
    'git',
    [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      'src',
      'test/widgets-live/support',
      'test/jest-widgets-live.json',
      'test/widgets-live/branch-booking-selector.probe-spec.ts',
      'scripts/branch-booking-selector-proof.mjs',
      'scripts/c9-occupancy-proof.mjs',
      ...(values.browser
        ? [
            '../maya-carrier-react/src',
            '../maya-chat-shell/src',
            '../maya-carrier-react/build.mjs',
            '../maya-chat-shell/build.mjs',
            '../maya-carrier-react/test/branch-booking-selector-browser-probe.mjs',
            '../maya-carrier-react/test/branch-booking-selector-browser-guard.mjs',
            '../maya-carrier-react/test/personal-owner-proof-server.mjs',
            '../maya-carrier-react/test/personal-owner-browser-guard.mjs',
            '../maya-chat-shell/test/cdp-verify.mjs',
          ]
        : []),
    ],
    { cwd: backend, encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean);
  for (const file of [
    'test/widgets-live/branch-booking-selector.probe-spec.ts',
    'scripts/branch-booking-selector-proof.mjs',
  ])
    if (!tracked.includes(file)) tracked.push(file);
  const hashes = Object.fromEntries(
    tracked.sort().map((file) => [
      file,
      createHash('sha256')
        .update(fs.readFileSync(path.join(backend, file)))
        .digest('hex'),
    ]),
  );
  const sourceSha256 = createHash('sha256')
    .update(JSON.stringify(hashes))
    .digest('hex');
  fs.writeFileSync(
    path.join(values.output, 'source-hashes.json'),
    JSON.stringify(hashes, null, 2) + '\n',
    { mode: 0o600 },
  );
  const manifest = {
    contract: 'maya.branch-booking-selector-owned-cluster/1',
    mode: values.browser
      ? 'current-react-native-synthetic'
      : 'http-pg-restart-native-synthetic',
    candidateCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: backend,
      encoding: 'utf8',
    }).trim(),
    sourceBinding: 'LAUNCH_TIME_WORKTREE_BYTES',
    sourceSha256,
    database,
    port,
    cluster,
    status: 'running',
    completed: [],
    resources: {
      nodeHeapMb: 3072,
      pgSharedBuffersMb: 64,
      pgWorkMemMb: 4,
      pgMaxConnections: 30,
      jestWorkers: 1,
    },
    qualification: 'NOT_ISSUED',
    realProviderAcceptance: false,
    realModelAcceptance: false,
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
    manifest.cancelledBy = signal;
    save();
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
    manifest.sourceUnchanged = Object.entries(hashes).every(
      ([file, digest]) =>
        createHash('sha256')
          .update(fs.readFileSync(path.join(backend, file)))
          .digest('hex') === digest,
    );
    assert.equal(
      manifest.sourceUnchanged,
      true,
      'Source changed during proof; run is not candidate acceptance',
    );
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
    `Synthetic native branch selector ${values.browser ? 'current React reload/re-login' : 'HTTP/PG restart'} passed: ${values.output}\n`,
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main(process.argv.slice(2));
