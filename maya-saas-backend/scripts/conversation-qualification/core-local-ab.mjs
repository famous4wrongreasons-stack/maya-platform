// One explicit owner-approved local A+B run. Frozen apps/runners stay unchanged.
// This finite launcher retains one TTY credential only in its process memory.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { startCoreBroker } from './core-conversation-broker.mjs';
import { readCoreManifest } from './core-conversation-admission.mjs';
import { createAbCredential } from './core-local-ab-credential.mjs';
import {
  captureCoreManifest,
  assertCoreSources,
  coreHash,
  coreBackend,
} from './core-conversation-source.mjs';
import {
  candidateReservation,
  CORE_DIAGNOSTIC_PROFILE,
  CORE_FOLLOWUP_PROFILE,
} from './current-candidate-budget.mjs';
import { createLocalAbBudget } from './core-local-ab-budget.mjs';
import {
  checkAbUsage,
  checkAbStageCompletion,
} from './core-local-ab-checks.mjs';
import { trackOwnedChild } from './owned-child-cleanup.mjs';
import { cleanupAbRunner } from './core-local-ab-cleanup.mjs';

export const AB_CANDIDATES = Object.freeze({
  A: '0d90de11710e7212286a7e74755c8a12b55d116b',
  B: '82ea84c46c4a535aaba8aa4c549f7a0eb074dcfa',
});
const canonical = (value) => JSON.stringify(value, null, 2) + '\n';
const writeNew = (file, value) =>
  fs.writeFileSync(file, canonical(value), { flag: 'wx', mode: 0o600 });
const childEnv = () => ({
  PATH: '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin',
  HOME: '/Users/stanislavmosin',
  TMPDIR: '/tmp',
  TZ: 'UTC',
});
const profileFor = (stage) =>
  stage === 'A' ? CORE_DIAGNOSTIC_PROFILE : CORE_FOLLOWUP_PROFILE;
const load = (file) => import(pathToFileURL(file).href);
function cleanEnvironment() {
  assert.ok(
    !Object.keys(process.env).some((k) =>
      /API_KEY|TOKEN|SECRET|PASSWORD|PAID|PERMIT|DATABASE_URL/.test(k),
    ),
    'core_ab_ambient_credentials',
  );
  assert.ok(
    process.platform === 'darwin' && process.getuid() > 0,
    'core_ab_owner_mac',
  );
}
function checkPricing(pricing) {
  assert.deepEqual(
    Object.keys(pricing).sort(),
    [
      'model',
      'inputNanoUsdPerToken',
      'outputNanoUsdPerToken',
      'reference',
      'sha256',
      'verifiedAt',
    ].sort(),
    'core_ab_pricing_fields',
  );
  assert.equal(pricing.model, 'deepseek-v4-pro', 'core_ab_pricing_model');
  assert.equal(pricing.inputNanoUsdPerToken, 1320, 'core_ab_pricing_rate');
  assert.equal(pricing.outputNanoUsdPerToken, 3960, 'core_ab_pricing_rate');
  assert.match(pricing.reference, /^[a-zA-Z0-9_./:@-]{1,256}$/);
  assert.match(pricing.sha256, /^[a-f0-9]{64}$/);
  const verified = Date.parse(pricing.verifiedAt);
  assert.ok(
    Number.isSafeInteger(verified) &&
      new Date(verified).toISOString() === pricing.verifiedAt &&
      verified <= Date.now() &&
      Date.now() - verified < 86400000,
    'core_ab_pricing_stale',
  );
}
function checkPrivateLayout(output) {
  assert.ok(
    output.startsWith('/private/tmp/') && path.normalize(output) === output,
    'core_ab_private_layout',
  );
  let directory = '/private/tmp';
  for (const part of output.slice('/private/tmp/'.length).split('/')) {
    assert.match(part, /^[a-zA-Z0-9_.-]+$/);
    directory = path.join(directory, part);
    if (!fs.existsSync(directory)) {
      assert.equal(directory, output, 'core_ab_private_layout');
      break;
    }
    const stat = fs.lstatSync(directory);
    assert.ok(
      stat.isDirectory() &&
        !stat.isSymbolicLink() &&
        stat.uid === process.getuid() &&
        (stat.mode & 0o7777) === 0o700,
      'core_ab_private_layout',
    );
  }
}
function stageHead(directory, stage) {
  assert.equal(
    fs.realpathSync(directory),
    directory,
    'core_ab_canonical_worktree',
  );
  assert.equal(
    execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: directory,
      encoding: 'utf8',
    }).trim(),
    AB_CANDIDATES[stage],
    'core_ab_frozen_candidate',
  );
  assert.equal(
    execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
      cwd: directory,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    }),
    '',
    'core_ab_stage_dirty_before_import',
  );
}

export async function prepareAb({
  output,
  aDirectory,
  bDirectory,
  pricing,
  ownerApprovalRef,
}) {
  cleanEnvironment();
  checkPricing(pricing);
  checkPrivateLayout(output);
  assert.ok(
    path.isAbsolute(output) &&
      path.normalize(output) === output &&
      !fs.existsSync(output),
    'core_ab_fresh_output',
  );
  assert.equal(
    fs.realpathSync(path.dirname(output)),
    path.dirname(output),
    'core_ab_canonical_parent',
  );
  assert.match(ownerApprovalRef, /^[a-zA-Z0-9_./:@-]{1,256}$/);
  for (const [stage, directory] of [
    ['A', aDirectory],
    ['B', bDirectory],
  ])
    stageHead(directory, stage);
  // Capture own harness before creating any plan; this snapshot is not paid authority.
  const harness = captureCoreManifest('DRY_HTTP', null, CORE_FOLLOWUP_PROFILE);
  fs.mkdirSync(output, { mode: 0o700 });
  const harnessPath = path.join(output, 'harness-manifest.json');
  writeNew(harnessPath, harness);
  const stages = [];
  for (const [stage, directory] of [
    ['A', aDirectory],
    ['B', bDirectory],
  ]) {
    const module = await load(
      path.join(
        directory,
        'scripts/conversation-qualification/core-local-prepare.mjs',
      ),
    );
    const plan = module.prepareLocalCore(
      path.join(output, stage.toLowerCase()),
      profileFor(stage),
    );
    assert.equal(plan.candidateCommit, AB_CANDIDATES[stage]);
    stages.push({
      stage,
      manifestPath: plan.manifestPath,
      manifestSha256: plan.manifestSha256,
      workDirectory: directory,
    });
  }
  const plan = {
    contract: 'maya.local-ab-plan/1',
    output,
    ownerApprovalRef,
    pricing,
    harnessPath,
    harnessSha256: coreHash(fs.readFileSync(harnessPath)),
    stages,
    limits: { spendNanoUsd: 6000000000, attempts: 36, durationMs: 1800000 },
    status: 'PREPARED_NO_PERMIT_NO_CREDENTIAL',
  };
  const planPath = path.join(output, 'ab-plan.json');
  writeNew(planPath, plan);
  return {
    planPath,
    planSha256: coreHash(fs.readFileSync(planPath)),
    harnessCommit: harness.candidateCommit,
    stages,
  };
}

function readPlan(file, sha256, ownerApprovalRef) {
  assert.match(sha256, /^[a-f0-9]{64}$/);
  const fd = fs.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
  );
  let bytes;
  try {
    const stat = fs.fstatSync(fd);
    assert.ok(
      stat.isFile() &&
        stat.nlink === 1 &&
        stat.uid === process.getuid() &&
        (stat.mode & 0o077) === 0 &&
        stat.size > 0 &&
        stat.size < 16384,
      'core_ab_plan_file',
    );
    const buffer = Buffer.alloc(stat.size + 1);
    let count = 0;
    while (count < buffer.length) {
      const n = fs.readSync(fd, buffer, count, buffer.length - count, null);
      if (!n) break;
      count += n;
    }
    assert.equal(count, stat.size, 'core_ab_plan_changed');
    for (const observed of [fs.fstatSync(fd), fs.lstatSync(file)])
      for (const field of [
        'dev',
        'ino',
        'size',
        'mode',
        'uid',
        'gid',
        'nlink',
        'mtimeMs',
        'ctimeMs',
      ])
        assert.equal(observed[field], stat[field], 'core_ab_plan_changed');
    bytes = buffer.subarray(0, count);
  } finally {
    fs.closeSync(fd);
  }
  assert.equal(coreHash(bytes), sha256, 'core_ab_plan_pin');
  const plan = JSON.parse(bytes);
  assert.equal(canonical(plan), bytes.toString(), 'core_ab_plan_encoding');
  assert.equal(plan.contract, 'maya.local-ab-plan/1');
  assert.equal(
    plan.ownerApprovalRef,
    ownerApprovalRef,
    'core_ab_owner_approval',
  );
  assert.deepEqual(plan.limits, {
    spendNanoUsd: 6000000000,
    attempts: 36,
    durationMs: 1800000,
  });
  assert.deepEqual(
    plan.stages.map((s) => s.stage),
    ['A', 'B'],
  );
  checkPrivateLayout(plan.output);
  assert.equal(fs.realpathSync(plan.output), plan.output);
  assert.equal(path.dirname(file), plan.output);
  assert.ok(
    (fs.statSync(plan.output).mode & 0o7777) === 0o700,
    'core_ab_private_root',
  );
  return plan;
}

export async function runAb({ planPath, planSha256, ownerApprovalRef }) {
  cleanEnvironment();
  const plan = readPlan(planPath, planSha256, ownerApprovalRef);
  checkPricing(plan.pricing);
  const harness = readCoreManifest(plan.harnessPath, plan.harnessSha256, {
    localStdin: false,
  });
  const assertHarness = () => {
    readPlan(planPath, planSha256, ownerApprovalRef);
    assertCoreSources(harness);
  };
  assertHarness();
  const stages = [];
  for (const stage of plan.stages) {
    stageHead(stage.workDirectory, stage.stage);
    const manifest = readCoreManifest(
      stage.manifestPath,
      stage.manifestSha256,
      { localStdin: true },
    );
    assert.equal(manifest.candidateCommit, AB_CANDIDATES[stage.stage]);
    assert.equal(manifest.profile, profileFor(stage.stage));
    assert.equal(
      manifest.admissionContext.target.workDirectory,
      stage.workDirectory,
    );
    const source = await load(
      path.join(
        stage.workDirectory,
        'scripts/conversation-qualification/core-conversation-source.mjs',
      ),
    );
    source.assertCoreSources(manifest);
    const root = path.dirname(stage.manifestPath);
    assert.equal(root, path.join(plan.output, stage.stage.toLowerCase()));
    for (const name of [
      'permit.json',
      'permit.json.claim',
      'runner',
      'broker/broker-report.json',
      'broker/broker-ledger.jsonl',
    ])
      assert.ok(
        !fs.existsSync(path.join(root, name)),
        'core_ab_restart_refused',
      );
    stages.push({ ...stage, manifest, root, source });
  }
  const budget = createLocalAbBudget({
    ledgerPath: path.join(plan.output, 'ab-ledger.jsonl'),
  });
  const reportPath = path.join(plan.output, 'ab-report.json');
  const report = {
    contract: 'maya.local-ab-run/1',
    status: 'running',
    planSha256,
    harnessCommit: harness.candidateCommit,
    startedAt: new Date(budget.startedAt).toISOString(),
    expiresAt: new Date(budget.expiresAt).toISOString(),
    qualification: 'REAL_MODEL_SYNTHETIC_DATA_UNGRADED',
    credentialInputs: 0,
    stages: [],
  };
  writeNew(reportPath, report);
  const save = () =>
    fs.writeFileSync(
      reportPath,
      canonical({ ...report, stats: budget.stats }),
      { mode: 0o600 },
    );
  const controller = new AbortController();
  const credential = createAbCredential();
  let activeBroker, stopRunner, stageTimer, pendingReservation;
  let cleanupTarget, cleanupPromise, activeStageReport;
  const cleanupOwned = async () => {
    if (!cleanupTarget) return;
    cleanupPromise ??= cleanupAbRunner(cleanupTarget);
    const result = await cleanupPromise;
    activeStageReport.cleanup = result;
    if (!result.confirmed) {
      report.status = 'cleanup-unconfirmed';
      process.exitCode = 1;
    }
    return result;
  };
  const halt = (reason) => {
    credential.clear();
    controller.abort();
    void activeBroker?.stop('ab_halted').catch(() => {});
    void stopRunner?.({ graceMs: 55000, killWaitMs: 1000 }).catch(() => {});
    try {
      budget.halt(reason);
    } catch {
      report.ledgerIoUnconfirmed = true;
    }
  };
  const cancel = () => halt('cancelled');
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'])
    process.on(signal, cancel);
  const globalTimer = setTimeout(
    () => halt('deadline'),
    Math.max(0, budget.expiresAt - Date.now()),
  );
  try {
    for (const stage of stages) {
      controller.signal.throwIfAborted();
      assertHarness();
      stage.source.assertCoreSources(stage.manifest);
      const window = budget.beginStage(stage.stage);
      stageTimer = setTimeout(
        () => halt('deadline'),
        Math.max(0, window.expiresAt - Date.now()),
      );
      process.chdir(stage.workDirectory);
      const permitPath = path.join(stage.root, 'permit.json');
      const m = stage.manifest;
      const permit = {
        contract: 'maya.core-conversation-permit/1',
        runId: m.runId,
        nonce: randomBytes(32).toString('hex'),
        candidateCommit: m.candidateCommit,
        manifestSha256: m.manifestSha256,
        profile: m.profile,
        limitsSha256: m.limitsSha256,
        ownerApprovalRef,
        startsAt: new Date(window.startedAt).toISOString(),
        expiresAt: new Date(window.expiresAt).toISOString(),
        revoked: false,
        ...m.admissionContext,
        pricing: plan.pricing,
        claimPath: permitPath + '.claim',
      };
      writeNew(permitPath, permit);
      const permitSha256 = coreHash(fs.readFileSync(permitPath));
      const args = {
        mode: 'admitted-local',
        manifest: stage.manifestPath,
        'manifest-sha256': m.manifestSha256,
        permit: permitPath,
        'permit-sha256': permitSha256,
        'owner-approval-ref': ownerApprovalRef,
        output: path.join(stage.root, 'broker'),
      };
      const stageReport = {
        stage: stage.stage,
        candidateCommit: m.candidateCommit,
        manifestSha256: m.manifestSha256,
        permitSha256,
        startsAt: permit.startsAt,
        expiresAt: permit.expiresAt,
        runnerPid: null,
        status: 'starting',
        usage: [],
      };
      activeStageReport = stageReport;
      cleanupTarget = undefined;
      cleanupPromise = undefined;
      report.stages.push(stageReport);
      save();
      activeBroker = await startCoreBroker(args, {
        manifestSha256: m.manifestSha256,
        assertSources: (observed) => {
          assertHarness();
          stage.source.assertCoreSources(observed);
          controller.signal.throwIfAborted();
        },
        halt,
        credential: async ({ signal, timeoutMs }) => {
          controller.signal.throwIfAborted();
          await credential.initialize(stage.stage, {
            signal: AbortSignal.any([signal, controller.signal]),
            timeoutMs,
          });
          report.credentialInputs = credential.inputCount;
          save();
        },
        readCredential: () => credential.read(stage.stage),
        beforeDispatch: async (url, init) => {
          const signal = AbortSignal.any([controller.signal, init.signal]);
          const wait = Math.max(
            0,
            (budget.stats.lastReservedAt ?? -6000) + 6000 - Date.now(),
          );
          if (wait) await delay(wait, undefined, { signal });
          signal.throwIfAborted();
          assertHarness();
          stage.source.assertCoreSources(m);
          pendingReservation = candidateReservation(url, init, m.profile);
          budget.reserve(stage.stage, pendingReservation);
          save();
        },
        response: ({ status, text, caseId, turn }) => {
          try {
            const usage = checkAbUsage(status, text, pendingReservation);
            pendingReservation = undefined;
            stageReport.usage.push({ caseId, turn, ...usage });
            save();
          } catch {
            halt('unknown');
            throw new Error('core_broker_usage_unknown');
          }
        },
      });
      await activeBroker.ready;
      controller.signal.throwIfAborted();
      const argv = [
        path.join(
          stage.workDirectory,
          'scripts/conversation-qualification/core-conversation-runner.mjs',
        ),
        '--run',
        ...(stage.stage === 'B' ? ['--profile', m.profile] : []),
        '--mode',
        'admitted-local',
        '--manifest',
        stage.manifestPath,
        '--manifest-sha256',
        m.manifestSha256,
        '--permit',
        permitPath,
        '--permit-sha256',
        permitSha256,
        '--owner-approval-ref',
        ownerApprovalRef,
        '--output',
        path.join(stage.root, 'runner'),
        '--node-heap-mb',
        '3072',
        '--broker-heap-mb',
        '256',
      ];
      const log = fs.openSync(
        path.join(stage.root, 'runner-launch.log'),
        'wx',
        0o600,
      );
      let child, exitCode;
      try {
        child = spawn(
          process.execPath,
          ['--max-old-space-size=3072', ...argv],
          {
            cwd: stage.workDirectory,
            env: childEnv(),
            stdio: ['ignore', log, log],
          },
        );
        const ownedStop = trackOwnedChild(child);
        let stopping;
        stopRunner = (options) => (stopping ??= ownedStop(options));
        stageReport.runnerPid = child.pid ?? null;
        if (child.pid)
          cleanupTarget = {
            runnerReportPath: path.join(
              stage.root,
              'runner/runner-report.json',
            ),
            manifestSha256: m.manifestSha256,
            knownRunnerPid: child.pid,
          };
        stageReport.status = 'running';
        save();
        exitCode = await new Promise((resolve, reject) => {
          child.once('error', () => reject(new Error('core_ab_runner_spawn')));
          child.once('close', (code) => resolve(code));
        });
      } finally {
        fs.closeSync(log);
      }
      await stopRunner({ graceMs: 55000, killWaitMs: 1000 });
      stopRunner = undefined;
      await activeBroker.stop('runner_finished');
      await activeBroker.closed;
      const cleanup = await cleanupOwned();
      assert.equal(cleanup?.confirmed, true, 'core_ab_cleanup_unknown');
      const broker = activeBroker.snapshot();
      activeBroker = undefined;
      const runner = JSON.parse(
        fs.readFileSync(
          path.join(stage.root, 'runner/runner-report.json'),
          'utf8',
        ),
      );
      checkAbStageCompletion({
        runner,
        broker,
        manifest: m,
        exitCode,
        groupAlive: (pgid) => {
          try {
            process.kill(-pgid, 0);
            return true;
          } catch (error) {
            if (error.code === 'ESRCH') return false;
            throw error;
          }
        },
      });
      assert.ok(
        !fs.existsSync(path.join(runner.cluster, 'postmaster.pid')),
        'core_ab_pg_cleanup_unknown',
      );
      controller.signal.throwIfAborted();
      budget.completeStage(stage.stage, true);
      clearTimeout(stageTimer);
      stageTimer = undefined;
      stageReport.status = 'passed-ungraded';
      save();
    }
    report.status = 'passed-ungraded';
  } catch (error) {
    report.failureCode =
      /^(core_ab|core_admission|core_broker|core_local|candidate|local_ab)_[a-z_]+$/.test(
        error?.message,
      )
        ? error.message
        : 'core_ab_run_refused';
    halt('failed');
    report.status = 'failed-no-continuation';
    process.exitCode = 1;
  } finally {
    credential.clear();
    clearTimeout(globalTimer);
    clearTimeout(stageTimer);
    await activeBroker?.stop('ab_finally').catch(() => {
      report.status = 'cleanup-unconfirmed';
    });
    await stopRunner?.({ graceMs: 55000, killWaitMs: 1000 }).catch(() => {
      report.status = 'cleanup-unconfirmed';
    });
    await cleanupOwned().catch(() => {
      report.status = 'cleanup-unconfirmed';
      process.exitCode = 1;
    });
    for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'])
      process.off(signal, cancel);
    process.chdir(coreBackend);
    try {
      budget.close();
    } catch {
      report.ledgerIoUnconfirmed = true;
      report.status = 'cleanup-unconfirmed';
      process.exitCode = 1;
    }
    report.credentialInputs = credential.inputCount;
    report.launcherCredentialCleared = true;
    report.finishedAt = new Date().toISOString();
    save();
  }
  console.log(
    JSON.stringify({
      status: report.status,
      reportPath,
      launcherCredentialCleared: true,
    }),
  );
  return report;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const { values } = parseArgs({
    options: {
      prepare: { type: 'boolean' },
      run: { type: 'boolean' },
      output: { type: 'string' },
      'a-directory': { type: 'string' },
      'b-directory': { type: 'string' },
      pricing: { type: 'string' },
      plan: { type: 'string' },
      'plan-sha256': { type: 'string' },
      'owner-approval-ref': { type: 'string' },
    },
    strict: true,
  });
  assert.ok(
    values.prepare !== values.run && Boolean(values.prepare || values.run),
    'core_ab_explicit_action',
  );
  if (values.prepare)
    console.log(
      JSON.stringify(
        await prepareAb({
          output: values.output,
          aDirectory: values['a-directory'],
          bDirectory: values['b-directory'],
          pricing: JSON.parse(fs.readFileSync(values.pricing, 'utf8')),
          ownerApprovalRef: values['owner-approval-ref'],
        }),
        null,
        2,
      ),
    );
  else
    await runAb({
      planPath: values.plan,
      planSha256: values['plan-sha256'],
      ownerApprovalRef: values['owner-approval-ref'],
    });
}
