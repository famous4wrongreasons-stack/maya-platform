// Local renderer; explicit Linux/root stages reuse the existing diagnostic.
// No SSH, deploy, credential contents, accounts, permit issuance or package install.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import {
  buildRemotePlan,
  canonical,
  digest,
  ROLE_NAMES,
  preview,
  unitCommand,
} from './core-remote-plan.mjs';
import { inspectEffective } from './core-remote-effective.mjs';
import { readCoreManifest } from './core-conversation-admission.mjs';
import { assertPhase } from './core-remote-phase.mjs';

const self = fileURLToPath(import.meta.url);
const folder = 'scripts/conversation-qualification/';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const label = (value) =>
  assert.ok(
    typeof value === 'string' &&
      /^[A-Za-z0-9_./:@-]{1,256}$/.test(value) &&
      !/\s/.test(value),
    'remote_approval_reference',
  );
export function readJson(file, pin, maxBytes = 65536) {
  assert.ok(
    path.isAbsolute(file) &&
      fs.realpathSync(path.dirname(file)) === path.dirname(file),
    'remote_canonical_parent',
  );
  const fd = fs.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
  );
  try {
    const before = fs.fstatSync(fd);
    assert.ok(
      before.isFile() &&
        before.nlink === 1 &&
        before.size > 0 &&
        before.size <= maxBytes &&
        (before.mode & 0o022) === 0,
      'remote_metadata_file',
    );
    const bytes = Buffer.alloc(before.size + 1);
    let used = 0,
      n;
    while ((n = fs.readSync(fd, bytes, used, bytes.length - used, null)) > 0)
      used += n;
    const after = fs.fstatSync(fd),
      current = fs.lstatSync(file);
    for (const key of [
      'dev',
      'ino',
      'mode',
      'uid',
      'gid',
      'nlink',
      'size',
      'mtimeMs',
      'ctimeMs',
    ]) {
      assert.equal(before[key], after[key]);
      assert.equal(after[key], current[key]);
    }
    assert.equal(used, before.size);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(
      bytes.subarray(0, used),
    );
    if (pin !== undefined)
      assert.equal(digest(text), pin, 'remote_metadata_pin');
    const value = JSON.parse(text);
    assert.equal(text, canonical(value), 'remote_canonical_json');
    return value;
  } finally {
    fs.closeSync(fd);
  }
}
export function readPlan(file, pin) {
  assert.match(pin, /^[a-f0-9]{64}$/);
  const plan = readJson(file, pin);
  assert.deepEqual(plan, buildRemotePlan(plan.input), 'remote_plan_rebuild');
  return plan;
}
export function assertApplicable(plan, now = Date.now()) {
  assert.equal(
    plan.executable,
    true,
    'remote_illustrative_plan_not_executable',
  );
  const age = now - Date.parse(plan.input.observation.at);
  assert.ok(age >= 0 && age <= 86400000, 'remote_metadata_freshness');
}
export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        encoding: 'utf8',
        timeout: options.timeoutMs ?? 10000,
        maxBuffer: options.maxBuffer ?? 65536,
        killSignal: 'SIGKILL',
        env: {
          PATH: '/usr/sbin:/usr/bin:/sbin:/bin',
          LANG: 'C',
          LC_ALL: 'C',
          TZ: 'UTC',
          HOME: '/nonexistent',
        },
      },
      (error, stdout) => {
        if (error && !(options.allowFailure && Number.isInteger(error.code)))
          reject(new Error('remote_command_failed'));
        else resolve(stdout);
      },
    );
  });
}
export function writeText(file, value, mode = 0o600) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, value);
    fs.fchmodSync(fd, mode);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
const write = (file, value, mode = 0o600) =>
  writeText(file, canonical(value), mode);
function exactRoot(plan, pin) {
  assert.equal(process.platform, 'linux', 'remote_linux_required');
  assert.equal(process.getuid(), 0, 'remote_root_required');
  assert.equal(
    fs.realpathSync(self),
    plan.paths.workDirectory + '/' + folder + 'core-remote-bootstrap.mjs',
    'remote_exact_checkout_controller',
  );
  const st = fs.lstatSync(plan.paths.root);
  assert.ok(st.isDirectory() && st.uid === 0 && (st.mode & 0o777) === 0o711);
  const marker = readJson(plan.paths.root + '/ownership.json');
  assert.deepEqual(marker, { runId: plan.input.runId, planSha256: pin });
}
const parseProperties = (text) =>
  Object.fromEntries(
    text
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const at = line.indexOf('=');
        assert.ok(at > 0);
        return [line.slice(0, at), line.slice(at + 1)];
      }),
  );
async function show(unit, execute) {
  const p = parseProperties(
    await execute(
      '/usr/bin/systemctl',
      [
        'show',
        unit,
        '--no-pager',
        '--property=LoadState,Description,MainPID,ControlGroup,ActiveState',
      ],
      { allowFailure: true },
    ),
  );
  assert.ok(
    ['loaded', 'not-found'].includes(p.LoadState),
    'remote_unit_state_unknown',
  );
  return p;
}
export function validateOwnedUnit(plan, role, properties) {
  assert.ok(ROLE_NAMES.includes(role));
  if (properties.LoadState === 'not-found') return;
  assert.equal(
    properties.Description,
    'MAYA core ' + plan.input.runId + ' ' + role,
    'remote_foreign_unit',
  );
  assert.ok(
    !properties.ControlGroup ||
      properties.ControlGroup === '/system.slice/' + plan.units[role],
    'remote_foreign_cgroup',
  );
}
export async function stopOwnedUnits(
  plan,
  execute = run,
  groupEmpty = (name) => {
    const file = '/sys/fs/cgroup/system.slice/' + name + '/cgroup.events';
    if (!fs.existsSync(file)) return true;
    return /^populated 0$/m.test(fs.readFileSync(file, 'utf8'));
  },
) {
  const observations = [],
    failures = [];
  for (const role of [...ROLE_NAMES].reverse()) {
    try {
      const unit = plan.units[role],
        before = await show(unit, execute);
      validateOwnedUnit(plan, role, before);
      if (before.LoadState !== 'not-found')
        await execute('/usr/bin/systemctl', ['stop', unit], {
          timeoutMs: 15000,
        });
      const after = await show(unit, execute);
      validateOwnedUnit(plan, role, after);
      assert.ok(
        (after.LoadState === 'not-found' ||
          (after.MainPID === '0' &&
            ['inactive', 'failed'].includes(after.ActiveState))) &&
          groupEmpty(unit),
        'remote_cleanup_unconfirmed',
      );
      observations.push({ role, unit, mainPid: 0, cgroupEmpty: true });
    } catch {
      failures.push(role);
    }
  }
  assert.equal(
    failures.length,
    0,
    'remote_cleanup_unconfirmed:' + failures.join(','),
  );
  return observations;
}
export function timerCommand(plan, pin, phase, deadline) {
  assert.ok(['setup', 'run'].includes(phase));
  assert.ok(Number.isSafeInteger(deadline));
  const base = 'maya-core-' + plan.input.runId + '-' + phase + '-cleanup';
  return {
    command: '/usr/bin/systemd-run',
    args: [
      '--quiet',
      '--collect',
      '--unit=' + base,
      '--description=MAYA core ' + plan.input.runId + ' ' + phase + ' cleanup',
      '--on-calendar=' +
        new Date(deadline)
          .toISOString()
          .replace('T', ' ')
          .replace('.000Z', ' UTC')
          .replace(/\.\d{3}Z$/, ' UTC'),
      '--timer-property=AccuracySec=1s',
      '--timer-property=Persistent=no',
      '--timer-property=Description=MAYA core ' +
        plan.input.runId +
        ' ' +
        phase +
        ' cleanup',
      '--property=Type=exec',
      '--property=Restart=no',
      '--property=RuntimeMaxSec=120s',
      '--property=KillMode=control-group',
      '--property=StandardOutput=null',
      '--property=StandardError=null',
      '--property=MemoryMax=128M',
      '--property=MemorySwapMax=0',
      '--property=TasksMax=32',
      '--property=PrivateNetwork=yes',
      '--property=RestrictAddressFamilies=AF_UNIX',
      '--property=NoNewPrivileges=yes',
      '--',
      plan.input.binaries.node,
      '--max-old-space-size=64',
      plan.paths.workDirectory + '/' + folder + 'core-remote-bootstrap.mjs',
      '--cleanup',
      '--scope',
      phase,
      '--plan',
      plan.paths.root + '/plan.json',
      '--sha256',
      pin,
    ],
  };
}
async function arm(plan, pin, phase, deadline) {
  const command = timerCommand(plan, pin, phase, deadline);
  await run(command.command, command.args);
  const timer =
    'maya-core-' + plan.input.runId + '-' + phase + '-cleanup.timer';
  assert.equal(
    (await run('/usr/bin/systemctl', ['is-active', timer])).trim(),
    'active',
    'remote_cleanup_timer_inactive',
  );
}
async function disarm(plan, phase) {
  const timer =
    'maya-core-' + plan.input.runId + '-' + phase + '-cleanup.timer';
  // An exact own timer only; the cleanup service may be this process itself.
  const p = await show(timer, run);
  if (p.LoadState === 'not-found') return;
  assert.equal(
    p.Description,
    'MAYA core ' + plan.input.runId + ' ' + phase + ' cleanup',
  );
  await run('/usr/bin/systemctl', ['stop', timer]);
}
async function cleanup(plan, pin, phase) {
  exactRoot(plan, pin);
  const closedPath = plan.paths.root + '/' + phase + '-closed.json';
  if (!fs.existsSync(closedPath)) {
    try {
      write(
        closedPath,
        { planSha256: pin, phase, closedAt: new Date().toISOString() },
        0o644,
      );
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  const units = await stopOwnedUnits(plan);
  const receipt = {
    contract: 'maya.core-remote-cleanup/1',
    runId: plan.input.runId,
    planSha256: pin,
    phase,
    observedAt: new Date().toISOString(),
    units,
    evidenceRetained: true,
  };
  write(
    plan.paths.root + '/cleanup-' + phase + '-' + randomUUID() + '.json',
    receipt,
  );
  await disarm(plan, phase);
  return receipt;
}
function rootOwnedTree(root) {
  assert.equal(fs.realpathSync(root), root);
  const stack = [root];
  let count = 0;
  while (stack.length) {
    assert.ok(++count <= 250000, 'remote_checkout_entry_bound');
    const item = stack.pop(),
      stat = fs.lstatSync(item);
    assert.equal(stat.uid, 0, 'remote_checkout_not_root_owned');
    if (stat.isSymbolicLink()) {
      assert.ok(
        fs.realpathSync(item).startsWith(root + '/'),
        'remote_checkout_external_symlink',
      );
    } else {
      assert.equal(stat.mode & 0o022, 0, 'remote_checkout_writable');
      assert.ok(
        stat.isFile() || stat.isDirectory(),
        'remote_checkout_special_file',
      );
      if (stat.isDirectory())
        for (const name of fs.readdirSync(item)) stack.push(item + '/' + name);
    }
  }
  return count;
}
function safeAncestors(file) {
  for (let current = file; ; current = path.dirname(current)) {
    assert.equal(fs.realpathSync(current), current, 'remote_parent_symlink');
    const stat = fs.lstatSync(current);
    assert.equal(stat.uid, 0, 'remote_parent_not_root');
    assert.equal(stat.mode & 0o022, 0, 'remote_parent_writable');
    if (current === '/') break;
  }
}
async function preflight(plan) {
  assertApplicable(plan);
  assert.equal(process.platform, 'linux');
  assert.equal(process.getuid(), 0);
  assert.equal(
    fs.realpathSync(self),
    plan.paths.workDirectory + '/' + folder + 'core-remote-bootstrap.mjs',
  );
  safeAncestors(plan.paths.checkout);
  safeAncestors(self);
  assert.equal(fs.realpathSync('/srv'), '/srv');
  assert.equal(fs.statSync('/srv').uid, 0);
  assert.equal(fs.statSync('/srv').mode & 0o022, 0);
  for (const [name, prefix] of [
    ['maya-booking-proof', 'runner'],
    ['maya-booking-broker', 'broker'],
  ]) {
    assert.equal(
      Number((await run('/usr/bin/id', ['-u', name])).trim()),
      plan.input.users[prefix + 'Uid'],
    );
    assert.equal(
      Number((await run('/usr/bin/id', ['-g', name])).trim()),
      plan.input.users[prefix + 'Gid'],
    );
  }
  const memory = fs
    .readFileSync('/proc/meminfo', 'utf8')
    .match(/^MemAvailable:\s+(\d+) kB$/m);
  assert.ok(
    memory &&
      Number(memory[1]) / 1024 >=
        plan.totalMemoryMaxMb + plan.input.observation.hostReserveMb,
    'remote_current_memory_headroom',
  );
  const disk = fs.statfsSync('/srv');
  assert.ok(
    disk.bavail * disk.bsize >= 1024 ** 3,
    'remote_current_disk_headroom',
  );
  for (const file of [
    plan.input.binaries.node,
    plan.input.binaries.bpftool,
    ...['initdb', 'pg_ctl', 'createdb', 'postgres'].map(
      (n) => plan.input.binaries.pgBin + '/' + n,
    ),
  ]) {
    const real = fs.realpathSync(file),
      st = fs.statSync(real);
    assert.equal(file, real, 'remote_binary_must_be_canonical');
    safeAncestors(real);
    assert.ok(st.isFile() && st.uid === 0 && (st.mode & 0o022) === 0);
    fs.accessSync(real, fs.constants.X_OK);
  }
  assert.ok(
    fs.statSync(plan.paths.checkout + '/.git').isDirectory(),
    'remote_full_git_checkout',
  );
  assert.equal(
    fs.existsSync(plan.paths.checkout + '/.git/objects/info/alternates'),
    false,
    'remote_git_no_external_objects',
  );
  const checkedEntries = rootOwnedTree(plan.paths.checkout);
  assert.equal(
    (
      await run('/usr/bin/git', [
        '-c',
        'core.fsmonitor=false',
        '-c',
        'core.hooksPath=/dev/null',
        '-C',
        plan.paths.checkout,
        'rev-parse',
        'HEAD',
      ])
    ).trim(),
    plan.input.candidateCommit,
  );
  assert.equal(
    await run('/usr/bin/git', [
      '-c',
      'core.fsmonitor=false',
      '-c',
      'core.hooksPath=/dev/null',
      '-C',
      plan.paths.checkout,
      'status',
      '--porcelain',
      '--untracked-files=all',
    ]),
    '',
  );
  for (const name of ['.env', '.env.local'])
    assert.equal(
      fs.existsSync(plan.paths.workDirectory + '/' + name),
      false,
      'remote_no_env',
    );
  for (const name of ['jest', 'ts-node', 'prisma', 'typescript'])
    assert.ok(
      fs
        .statSync(plan.paths.workDirectory + '/node_modules/' + name)
        .isDirectory(),
      'remote_offline_dependencies_required',
    );
  const credential = fs.lstatSync(plan.paths.credential);
  assert.equal(fs.realpathSync(plan.paths.credential), plan.paths.credential);
  assert.ok(
    credential.isFile() &&
      credential.nlink === 1 &&
      credential.uid === plan.input.credential.owner &&
      (credential.mode & 0o022) === 0,
    'remote_credential_metadata',
  );
  return { checkedEntries, credentialContentsRead: false };
}
function createRun(plan, pin, approval) {
  const dirs = preview(plan).directories;
  // First mkdir is exclusive: old root, ledger, permit and processes are never resumed.
  for (const [file, uid, gid, mode] of dirs) {
    fs.mkdirSync(file, { mode: Number.parseInt(mode, 8) });
    fs.chownSync(file, uid, gid);
    fs.chmodSync(file, Number.parseInt(mode, 8));
  }
  write(plan.paths.root + '/ownership.json', {
    runId: plan.input.runId,
    planSha256: pin,
  });
  write(plan.paths.root + '/plan.json', plan, 0o644);
  write(plan.paths.root + '/setup-approval.json', {
    reference: approval,
    paidAuthorized: false,
  });
  write(
    plan.paths.root + '/context.json',
    { target: plan.target, credentialSource: plan.input.credential },
    0o644,
  );
  for (const home of [plan.paths.runnerHome, plan.paths.brokerHome])
    writeText(
      home + '/.gitconfig',
      '[safe]\n\tdirectory = ' + plan.paths.checkout + '\n',
      0o644,
    );
  writeText(
    plan.paths.hosts,
    '127.0.0.1 localhost\n' +
      plan.input.network.providerIpv4
        .map((ip) => ip + ' api.deepseek.com\n')
        .join(''),
    0o644,
  );
}
async function startUnit(plan, role, args, options = {}) {
  const phase = role === 'broker' || role === 'runner' ? 'run' : 'setup';
  assertPhase(plan.paths.root, phase, options.planSha256);
  const command = unitCommand(plan, role, args, options);
  await run(command.command, command.args, {
    timeoutMs: options.wait ? 150000 : 10000,
  });
  assertPhase(plan.paths.root, phase, options.planSha256);
}
async function waitJson(file, deadline, predicate = () => true) {
  while (Date.now() < deadline) {
    try {
      const value = readJson(file, undefined, 2 * 1024 * 1024);
      if (predicate(value)) return value;
    } catch {
      /* bounded writer race, never permits a failed read */
    }
    await delay(100);
  }
  throw new Error('remote_readiness_timeout');
}
export async function stage(plan, pin, approval) {
  label(approval);
  const facts = await preflight(plan);
  createRun(plan, pin, approval);
  const executeBefore = Date.now() + plan.stageDeadlineSeconds * 1000;
  write(
    plan.paths.root + '/setup-phase.json',
    { planSha256: pin, phase: 'setup', executeBefore },
    0o644,
  );
  let armed = false;
  try {
    await arm(plan, pin, 'setup', executeBefore);
    armed = true;
    const observations = {};
    for (const role of ['runner-check', 'broker-check', 'network-check']) {
      const dir =
        role === 'runner-check'
          ? plan.paths.runnerEvidence
          : plan.paths.brokerEvidence;
      const output = dir + '/' + role + '.json';
      await startUnit(
        plan,
        role,
        [
          folder + 'core-remote-observe.mjs',
          '--plan',
          plan.paths.root + '/plan.json',
          '--sha256',
          pin,
          '--role',
          role,
          '--output',
          output,
          '--hold-ms',
          '60000',
        ],
        { phase: 'setup', planSha256: pin },
      );
      observations[role] = await waitJson(output, Date.now() + 10000);
      assert.equal(observations[role].planSha256, pin);
      const effective = await inspectEffective(plan, role, run);
      observations[role].effective = effective;
      if (role === 'network-check') observations.effectiveNetwork = effective;
      await stopOwnedUnits(plan);
    }
    await stopOwnedUnits(plan);
    await startUnit(
      plan,
      'prepare',
      [
        folder + 'core-conversation-runner.mjs',
        '--prepare',
        '--mode',
        'admitted',
        '--admission-context',
        plan.paths.root + '/context.json',
        '--output',
        plan.paths.runnerEvidence + '/prepared',
        '--node-heap-mb',
        String(plan.input.resources.runnerHeapMb),
        '--broker-heap-mb',
        String(plan.input.resources.brokerHeapMb),
      ],
      { wait: true, phase: 'setup', planSha256: pin },
    );
    const source =
      plan.paths.runnerEvidence + '/prepared/candidate-manifest.json';
    const raw = readJson(source, undefined, 4 * 1024 * 1024);
    assert.equal(raw.candidateCommit, plan.input.candidateCommit);
    assert.deepEqual(raw.admissionContext, {
      target: plan.target,
      credentialSource: plan.input.credential,
    });
    const manifestPath = plan.paths.control + '/candidate-manifest.json';
    write(manifestPath, raw, 0o644);
    const manifestSha256 = digest(canonical(raw));
    readCoreManifest(manifestPath, manifestSha256);
    const closed = await cleanup(plan, pin, 'setup');
    armed = false;
    const receipt = {
      contract: 'maya.core-remote-setup/1',
      runId: plan.input.runId,
      planSha256: pin,
      observedAt: new Date().toISOString(),
      facts,
      observations,
      manifestPath,
      manifestSha256,
      manifestRunId: raw.runId,
      cleanup: closed,
      requiresHumanMapReview: true,
      paidAuthorized: false,
      credentialContentsRead: false,
    };
    write(plan.paths.root + '/setup-receipt.json', receipt);
    return {
      status: 'SETUP_REQUIRES_REVIEW_NOT_PAID',
      setupReceiptSha256: digest(canonical(receipt)),
      manifestSha256,
      manifestRunId: raw.runId,
    };
  } finally {
    if (armed) await cleanup(plan, pin, 'setup');
  }
}
export function admissionDeadline(
  plan,
  manifest,
  permit,
  owner,
  now = Date.now(),
) {
  label(owner);
  assert.equal(permit.contract, 'maya.core-conversation-permit/1');
  assert.equal(permit.revoked, false);
  assert.equal(permit.ownerApprovalRef, owner);
  assert.equal(permit.runId, manifest.runId);
  assert.equal(permit.candidateCommit, plan.input.candidateCommit);
  assert.deepEqual(permit.target, plan.target);
  assert.deepEqual(permit.credentialSource, plan.input.credential);
  const start = Date.parse(permit.startsAt),
    end = Date.parse(permit.expiresAt);
  assert.ok(
    start <= now && now < end && end - start > 0 && end - start <= 600000,
    'remote_permit_deadline',
  );
  return end + plan.paidCleanupGraceSeconds * 1000;
}
export async function start(plan, pin, values) {
  exactRoot(plan, pin);
  await preflight(plan);
  const receipt = readJson(
    plan.paths.root + '/setup-receipt.json',
    values['setup-receipt-sha256'],
    8 * 1024 * 1024,
  );
  assert.equal(receipt.planSha256, pin);
  assert.equal(receipt.paidAuthorized, false);
  label(values['isolation-review-ref']);
  const manifest = readCoreManifest(
    receipt.manifestPath,
    receipt.manifestSha256,
  );
  const permitPath = plan.paths.control + '/permit.json';
  assert.match(values['permit-sha256'], /^[a-f0-9]{64}$/);
  const permit = readJson(permitPath, values['permit-sha256']);
  assert.equal(permit.manifestSha256, receipt.manifestSha256);
  assert.equal(permit.claimPath, permitPath + '.claim');
  assert.equal(fs.existsSync(permit.claimPath), false);
  const deadline = admissionDeadline(
    plan,
    manifest,
    permit,
    values['owner-approval-ref'],
  );
  write(plan.paths.root + '/start-claim.json', {
    planSha256: pin,
    setupReceiptSha256: values['setup-receipt-sha256'],
    isolationReviewRef: values['isolation-review-ref'],
    permitSha256: values['permit-sha256'],
    ownerApprovalRef: values['owner-approval-ref'],
  });
  write(
    plan.paths.root + '/run-phase.json',
    {
      planSha256: pin,
      phase: 'run',
      executeBefore: Date.parse(permit.expiresAt),
    },
    0o644,
  );
  let armed = false;
  try {
    await arm(plan, pin, 'run', deadline);
    armed = true;
    const pins = [
      '--mode',
      'admitted',
      '--manifest',
      receipt.manifestPath,
      '--manifest-sha256',
      receipt.manifestSha256,
      '--permit',
      permitPath,
      '--permit-sha256',
      values['permit-sha256'],
      '--owner-approval-ref',
      values['owner-approval-ref'],
    ];
    await startUnit(
      plan,
      'broker',
      [
        folder + 'core-conversation-broker.mjs',
        ...pins,
        '--output',
        plan.paths.brokerEvidence,
      ],
      {
        phase: 'run',
        planSha256: pin,
        seconds: Math.max(
          1,
          Math.floor((Date.parse(permit.expiresAt) - Date.now()) / 1000),
        ),
      },
    );
    const broker = await waitJson(
      plan.paths.brokerEvidence + '/broker-report.json',
      Math.min(Date.now() + 15000, Date.parse(permit.expiresAt)),
      (r) => r.socketPath === plan.target.brokerSocket.path,
    );
    assert.equal(broker.runId, manifest.runId);
    assert.equal(broker.manifestSha256, receipt.manifestSha256);
    assert.equal(broker.paidAuthorized, true);
    assert.equal(broker.stopped, false);
    assert.equal(broker.credentialsLoaded, false);
    const effective = await inspectEffective(plan, 'broker', run);
    assert.equal(
      effective.stableFilterSha256,
      receipt.observations.effectiveNetwork.stableFilterSha256,
      'remote_filter_changed_since_review',
    );
    write(plan.paths.root + '/live-broker-effective.json', effective);
    await startUnit(
      plan,
      'runner',
      [
        folder + 'core-conversation-runner.mjs',
        '--run',
        ...pins,
        '--output',
        plan.paths.runnerEvidence + '/run',
        '--pg-bin',
        plan.input.binaries.pgBin,
        '--node-heap-mb',
        String(plan.input.resources.runnerHeapMb),
        '--broker-heap-mb',
        String(plan.input.resources.brokerHeapMb),
      ],
      {
        phase: 'run',
        planSha256: pin,
        seconds: Math.max(1, Math.floor((deadline - Date.now()) / 1000)),
      },
    );
    write(
      plan.paths.root + '/live-runner-effective.json',
      await inspectEffective(plan, 'runner', run),
    );
    while (Date.now() < deadline) {
      const state = await show(plan.units.runner, run);
      validateOwnedUnit(plan, 'runner', state);
      if (
        state.LoadState === 'not-found' ||
        ['inactive', 'failed'].includes(state.ActiveState)
      )
        break;
      await delay(500);
    }
    const closed = await cleanup(plan, pin, 'run');
    armed = false;
    const runner = readJson(
      plan.paths.runnerEvidence + '/run/runner-report.json',
      undefined,
      2 * 1024 * 1024,
    );
    write(plan.paths.root + '/completion.json', {
      contract: 'maya.core-remote-completion/1',
      planSha256: pin,
      status: runner.status,
      qualification: 'REAL_MODEL_SYNTHETIC_DIAGNOSTIC_NOT_ACCEPTANCE',
      cleanup: closed,
    });
    return {
      status: runner.status,
      qualification: 'NOT_MODEL_ACCEPTANCE',
      cleanupConfirmed: true,
    };
  } finally {
    if (armed) await cleanup(plan, pin, 'run');
  }
}
export function renderCommands(plan, pin) {
  const controller =
    plan.paths.workDirectory + '/' + folder + 'core-remote-bootstrap.mjs';
  const base = ['--max-old-space-size=128', controller];
  const placedPlan = '/srv/maya-core-inputs/' + plan.input.runId + '/plan.json';
  const invocation = (args) => ({
    command: plan.input.binaries.node,
    args: [...base, ...args],
  });
  return {
    qualification: 'REVIEW_ONLY_NOT_AUTHORITY',
    beforeStage:
      'Supply reviewed metadata, full offline root-owned checkout with ready Linux dependencies and nonsecret rendered plan at placedPlan. No delivery or installation is performed by this tool.',
    placedPlan,
    stage: invocation([
      '--stage',
      '--plan',
      placedPlan,
      '--sha256',
      pin,
      '--setup-approval-ref',
      '[REQUIRED_SETUP_APPROVAL_REF]',
    ]),
    start: invocation([
      '--start',
      '--plan',
      plan.paths.root + '/plan.json',
      '--sha256',
      pin,
      '--setup-receipt-sha256',
      '[REQUIRED_REVIEWED_SETUP_RECEIPT_SHA256]',
      '--isolation-review-ref',
      '[REQUIRED_EFFECTIVE_ISOLATION_REVIEW]',
      '--permit-sha256',
      '[REQUIRED_FRESH_PERMIT_SHA256]',
      '--owner-approval-ref',
      '[REQUIRED_PAID_APPROVAL_REF]',
    ]),
    cleanup: Object.fromEntries(
      ['setup', 'run'].map((phase) => [
        phase,
        invocation([
          '--cleanup',
          '--scope',
          phase,
          '--plan',
          plan.paths.root + '/plan.json',
          '--sha256',
          pin,
        ]),
      ]),
    ),
    noTransferNoSetupNoPaidExecution: true,
  };
}
export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    strict: true,
    options: Object.fromEntries(
      ['dry-run', 'stage', 'start', 'cleanup']
        .map((k) => [k, { type: 'boolean' }])
        .concat(
          [
            'config',
            'output',
            'plan',
            'sha256',
            'scope',
            'setup-approval-ref',
            'setup-receipt-sha256',
            'isolation-review-ref',
            'permit-sha256',
            'owner-approval-ref',
          ].map((k) => [k, { type: 'string' }]),
        ),
    ),
  });
  assert.equal(
    ['dry-run', 'stage', 'start', 'cleanup'].filter((k) => values[k]).length,
    1,
    'remote_explicit_action',
  );
  const action = ['dry-run', 'stage', 'start', 'cleanup'].find(
    (k) => values[k],
  );
  const permitted = {
    'dry-run': ['config', 'output'],
    stage: ['plan', 'sha256', 'setup-approval-ref'],
    start: [
      'plan',
      'sha256',
      'setup-receipt-sha256',
      'isolation-review-ref',
      'permit-sha256',
      'owner-approval-ref',
    ],
    cleanup: ['plan', 'sha256', 'scope'],
  };
  assert.ok(
    Object.keys(values).every(
      (k) => k === action || permitted[action].includes(k),
    ),
    'remote_action_arguments',
  );
  if (values['dry-run']) {
    assert.ok(
      values.config &&
        path.isAbsolute(values.output) &&
        !fs.existsSync(values.output),
    );
    const plan = buildRemotePlan(readJson(values.config));
    fs.mkdirSync(values.output, { mode: 0o700 });
    write(values.output + '/plan.json', plan);
    write(values.output + '/preview.json', preview(plan));
    write(
      values.output + '/commands.json',
      renderCommands(plan, digest(canonical(plan))),
    );
    return {
      status: 'LOCAL_RENDER_ONLY',
      planSha256: digest(canonical(plan)),
      remoteActions: 0,
      paidCalls: 0,
      executable: plan.executable,
    };
  }
  const plan = readPlan(values.plan, values.sha256);
  if (values.cleanup) {
    assert.ok(['setup', 'run'].includes(values.scope));
    return cleanup(plan, values.sha256, values.scope);
  }
  if (values.stage)
    return stage(plan, values.sha256, values['setup-approval-ref']);
  assert.match(values['setup-receipt-sha256'], /^[a-f0-9]{64}$/);
  return start(plan, values.sha256, values);
}
if (process.argv[1] && path.resolve(process.argv[1]) === self) {
  try {
    console.log(canonical(await main()).trimEnd());
  } catch {
    console.error('core_remote_bootstrap_refused');
    process.exitCode = 1;
  }
}
