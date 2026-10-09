// One foreground command after external approval. Never issues a permit, reads
// key files, opens Terminal, resumes a run or passes the model key to a child.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import { startCoreBroker } from './core-conversation-broker.mjs';
import { readCoreManifest } from './core-conversation-admission.mjs';
import {
  assertCoreSources,
  coreBackend,
  coreHash,
} from './core-conversation-source.mjs';
import { CORE_UI_PROFILE } from './current-candidate-budget.mjs';
import { trackOwnedChild } from './owned-child-cleanup.mjs';

export function readUiLaunch(planPath, planSha256) {
  assert.match(planSha256 ?? '', /^[a-f0-9]{64}$/, 'core_ui_plan_pin');
  const read = (file) => {
    const stat = fs.lstatSync(file);
    assert.ok(
      stat.isFile() &&
        !stat.isSymbolicLink() &&
        stat.nlink === 1 &&
        stat.uid === process.getuid() &&
        (stat.mode & 0o022) === 0 &&
        stat.size > 0 &&
        stat.size <= 16384,
      'core_ui_launch_file',
    );
    return fs.readFileSync(file);
  };
  assert.equal(fs.realpathSync(planPath), planPath, 'core_ui_canonical_plan');
  const bytes = read(planPath);
  assert.equal(coreHash(bytes), planSha256, 'core_ui_plan_changed');
  const plan = JSON.parse(bytes);
  assert.equal(plan.profile, CORE_UI_PROFILE, 'core_ui_profile');
  assert.equal(plan.mode, 'ADMITTED_LOCAL_MODEL_HTTP');
  assert.equal(plan.workDirectory, coreBackend);
  assert.equal(plan.executable, process.execPath);
  const root = path.dirname(planPath);
  assert.equal(plan.manifestPath, path.join(root, 'candidate-manifest.json'));
  const manifest = readCoreManifest(plan.manifestPath, plan.manifestSha256, {
    localStdin: true,
  });
  assert.equal(manifest.profile, CORE_UI_PROFILE);
  assert.equal(manifest.candidateCommit, plan.candidateCommit);
  assertCoreSources(manifest);
  // An external nonsecret approval handoff is required; this program cannot mint it.
  const approval = JSON.parse(read(path.join(root, 'approved-run.json')));
  assert.deepEqual(
    Object.keys(approval).sort(),
    [
      'candidateCommit',
      'manifestSha256',
      'ownerApprovalRef',
      'permitSha256',
    ].sort(),
  );
  assert.equal(approval.candidateCommit, manifest.candidateCommit);
  assert.equal(approval.manifestSha256, manifest.manifestSha256);
  assert.match(approval.permitSha256, /^[a-f0-9]{64}$/);
  assert.match(approval.ownerApprovalRef, /^[a-zA-Z0-9_./:@-]{1,256}$/);
  return { plan, manifest, root, approval };
}

export async function runUiLaunch(options) {
  assert.ok(
    !Object.keys(process.env).some((key) =>
      /API_KEY|TOKEN|SECRET|PASSWORD|PAID|PERMIT|DATABASE_URL/.test(key),
    ),
    'core_ui_ambient_credentials',
  );
  const { plan, root, approval } = readUiLaunch(
    options.plan,
    options['plan-sha256'],
  );
  const output = path.join(root, 'runner');
  assert.equal(fs.existsSync(output), false, 'core_ui_restart_refused');
  const common = [
    '--mode',
    'admitted-local',
    '--manifest',
    plan.manifestPath,
    '--manifest-sha256',
    plan.manifestSha256,
    '--permit',
    path.join(root, 'permit.json'),
    '--permit-sha256',
    approval.permitSha256,
    '--owner-approval-ref',
    approval.ownerApprovalRef,
  ];
  let broker,
    child,
    stopChild,
    logFd,
    cancelled = false;
  const cancel = () => {
    cancelled = true;
    void stopChild?.({ graceMs: 60000 });
    void broker?.stop('local_ui_cancelled');
  };
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'])
    process.on(signal, cancel);
  try {
    // Existing broker checks source/permit and occupies the one-use claim before
    // its one hidden terminal prompt. The key remains in that broker's memory.
    broker = await startCoreBroker({
      mode: 'admitted-local',
      manifest: plan.manifestPath,
      'manifest-sha256': plan.manifestSha256,
      permit: path.join(root, 'permit.json'),
      'permit-sha256': approval.permitSha256,
      'owner-approval-ref': approval.ownerApprovalRef,
      output: path.join(root, 'broker'),
    });
    await broker.ready;
    if (cancelled) throw new Error('core_ui_cancelled');
    // Broker readiness is source/permit checked by the existing runner's /status.
    logFd = fs.openSync(path.join(root, 'runner.log'), 'wx', 0o600);
    child = spawn(
      process.execPath,
      [
        'scripts/conversation-qualification/core-conversation-runner.mjs',
        '--run',
        '--profile',
        CORE_UI_PROFILE,
        ...common,
        '--output',
        output,
        '--node-heap-mb',
        '3072',
        '--broker-heap-mb',
        '256',
      ],
      {
        cwd: coreBackend,
        env: {
          PATH: '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin',
          HOME: '/Users/stanislavmosin',
          TMPDIR: '/tmp',
          TZ: 'UTC',
          NODE_OPTIONS: '--max-old-space-size=256',
        },
        stdio: ['ignore', logFd, logFd],
      },
    );
    stopChild = trackOwnedChild(child);
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cancel();
        reject(new Error('core_ui_deadline'));
      }, 660000);
      child.once('error', () => {
        clearTimeout(timer);
        reject(new Error('core_ui_runner_start'));
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
    assert.equal(result, 0, 'core_ui_runner_failed');
    assert.equal(cancelled, false, 'core_ui_cancelled');
    return {
      status: 'COMPLETED_REQUIRES_ACTUAL_REPLY_REVIEW',
      candidateCommit: plan.candidateCommit,
      output,
    };
  } finally {
    try {
      await stopChild?.({ graceMs: 60000 });
    } finally {
      await broker?.stop('local_ui_finished');
      if (logFd !== undefined) fs.closeSync(logFd);
      for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'])
        process.off(signal, cancel);
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const { values } = parseArgs({
    strict: true,
    options: {
      run: { type: 'boolean' },
      plan: { type: 'string' },
      'plan-sha256': { type: 'string' },
    },
  });
  assert.equal(values.run, true, 'core_ui_explicit_run');
  try {
    console.log(JSON.stringify(await runUiLaunch(values)));
  } catch {
    console.error(
      'Current React model run refused or stopped. Review the bounded local evidence; do not retry this run.',
    );
    process.exitCode = 1;
  }
}
