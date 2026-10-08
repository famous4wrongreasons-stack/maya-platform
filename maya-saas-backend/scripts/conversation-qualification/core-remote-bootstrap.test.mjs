import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validatePhaseRecord } from './core-remote-phase.mjs';
import {
  buildRemotePlan,
  canonical,
  digest,
  publicIpv4,
  unitCommand,
  ROLE_NAMES,
} from './core-remote-plan.mjs';
import {
  assertApplicable,
  readPlan,
  readJson,
  stopOwnedUnits,
  timerCommand,
  validateOwnedUnit,
  admissionDeadline,
  main,
  writeText,
} from './core-remote-bootstrap.mjs';
const example = () =>
  JSON.parse(
    fs.readFileSync(
      new URL('./core-remote-example.json', import.meta.url),
      'utf8',
    ),
  );
const plan = () => buildRemotePlan(example());
test('shared nonsecret control files get exact read mode even under restrictive caller umask', () => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'maya-remote-umask-')),
  );
  const before = process.umask(0o077);
  try {
    writeText(root + '/public', 'nonsecret\n', 0o644);
    writeText(root + '/private', 'nonsecret\n');
    assert.equal(fs.statSync(root + '/public').mode & 0o777, 0o644);
    assert.equal(fs.statSync(root + '/private').mode & 0o777, 0o600);
    assert.throws(() => writeText(root + '/public', 'replacement'), {
      code: 'EEXIST',
    });
  } finally {
    process.umask(before);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test('ExecCondition refuses a closed, expired, wrong-phase or wrong-plan launch even after cleanup', () => {
  const pin = 'a'.repeat(64),
    record = { planSha256: pin, phase: 'setup', executeBefore: 1000 };
  assert.doesNotThrow(() =>
    validatePhaseRecord(record, 'setup', pin, false, 999),
  );
  assert.throws(
    () => validatePhaseRecord(record, 'setup', pin, false, 1000),
    /expired/,
  );
  assert.throws(
    () => validatePhaseRecord(record, 'setup', pin, true, 999),
    /closed/,
  );
  assert.throws(() => validatePhaseRecord(record, 'run', pin, false, 999));
  assert.throws(() =>
    validatePhaseRecord(record, 'setup', 'b'.repeat(64), false, 999),
  );
});
test('illustrative values render, but can never be applied as observations', () => {
  const p = plan();
  assert.equal(p.executable, false);
  assert.throws(
    () => assertApplicable(p, Date.parse(p.input.observation.at)),
    /illustrative/,
  );
  const real = example();
  real.observation.kind = 'OBSERVED';
  assert.throws(() => buildRemotePlan(real), /documentation_address/);
  real.network.providerIpv4 = ['1.1.1.1'];
  const observed = buildRemotePlan(real),
    at = Date.parse(real.observation.at);
  assert.doesNotThrow(() => assertApplicable(observed, at));
  assert.throws(() => assertApplicable(observed, at + 86400001), /freshness/);
  assert.throws(() => assertApplicable(observed, at - 1), /freshness/);
});
test('host headroom, group exclusivity, authority and path injection fail before rendering', () => {
  for (const change of [
    (i) => (i.resources.runnerMemoryMaxMb = 700),
    (i) => (i.observation.availableMemoryMb = 1400),
    (i) => i.observation.socketGroupMemberUids.push(1996),
    (i) => (i.credential.reader = 1997),
    (i) => (i.binaries.node = '/opt/node\n'),
    (i) => (i.binaries.node = '/opt/%h/node'),
    (i) => (i.resources.unbounded = true),
    (i) => (i.credential.reference = '/srv/maya-core-secret'),
    (i) => (i.host = 'production.example'),
  ]) {
    const input = example();
    change(input);
    assert.throws(() => buildRemotePlan(input));
  }
  for (const ip of [
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '172.31.0.1',
    '192.168.0.1',
    '100.64.0.1',
    '198.18.0.1',
    '224.0.0.1',
    '::1',
    '1.1.1.1\n',
  ])
    assert.throws(() => publicIpv4(ip));
});
test('launches carry executable phase fences, original resource caps and no shell', () => {
  const p = plan(),
    pin = 'a'.repeat(64);
  for (const role of ROLE_NAMES) {
    const phase = ['broker', 'runner'].includes(role) ? 'run' : 'setup';
    const command = unitCommand(p, role, ['known.mjs'], {
      phase,
      planSha256: pin,
    });
    assert.equal(command.command, '/usr/bin/systemd-run');
    assert.ok(
      command.args.some(
        (x) =>
          x.startsWith('--property=ExecCondition=') &&
          x.includes('--phase ' + phase),
      ),
    );
    assert.ok(command.args.includes('--property=KillMode=control-group'));
    assert.ok(command.args.includes('--property=MemorySwapMax=0'));
    assert.equal(command.args.includes('sh'), false);
  }
});
test('absolute timer tracks permit end, not a renewed ten minute grant', () => {
  const p = plan(),
    start = Date.parse('2000-01-01T00:00:00.000Z');
  const manifest = { runId: 'core-manifest-run' };
  const permit = {
    contract: 'maya.core-conversation-permit/1',
    revoked: false,
    ownerApprovalRef: 'expired-test',
    runId: manifest.runId,
    candidateCommit: p.input.candidateCommit,
    target: p.target,
    credentialSource: p.input.credential,
    startsAt: new Date(start).toISOString(),
    expiresAt: new Date(start + 600000).toISOString(),
  };
  const end = admissionDeadline(
    p,
    manifest,
    permit,
    'expired-test',
    start + 100000,
  );
  assert.equal(end, start + 645000);
  const timer = timerCommand(p, 'a'.repeat(64), 'run', end);
  assert.ok(timer.args.includes('--on-calendar=2000-01-01 00:10:45 UTC'));
  assert.ok(
    timer.args.includes(
      p.paths.workDirectory +
        '/scripts/conversation-qualification/core-remote-bootstrap.mjs',
    ),
  );
  assert.throws(
    () =>
      admissionDeadline(p, manifest, permit, 'expired-test', start + 600000),
    /deadline/,
  );
  assert.throws(() =>
    admissionDeadline(
      p,
      manifest,
      { ...permit, revoked: true },
      'expired-test',
      start,
    ),
  );
});
test('cleanup continues other own groups after one refusal and does not stop foreign units', async () => {
  const p = plan(),
    stopped = [];
  const command = async (binary, args) => {
    assert.equal(binary, '/usr/bin/systemctl');
    const [verb, unit] = args;
    const role = ROLE_NAMES.find((r) => p.units[r] === unit);
    assert.ok(role);
    if (verb === 'stop') {
      stopped.push(role);
      return '';
    }
    if (stopped.includes(role)) return 'LoadState=not-found\n';
    return (
      'LoadState=loaded\nDescription=' +
      (role === 'runner'
        ? 'FOREIGN'
        : 'MAYA core ' + p.input.runId + ' ' + role) +
      '\nMainPID=1\nActiveState=active\nControlGroup=/system.slice/' +
      unit +
      '\n'
    );
  };
  await assert.rejects(
    stopOwnedUnits(p, command, () => true),
    /cleanup_unconfirmed/,
  );
  assert.equal(stopped.includes('runner'), false);
  assert.deepEqual(
    stopped,
    [...ROLE_NAMES].reverse().filter((r) => r !== 'runner'),
  );
  assert.throws(
    () =>
      validateOwnedUnit(p, 'broker', {
        LoadState: 'loaded',
        Description: 'MAYA core ' + p.input.runId + ' broker',
        ControlGroup: '/system.slice/production.service',
      }),
    /foreign_cgroup/,
  );
});
test('cleanup requires actual empty cgroups, even after successful systemctl stop', async () => {
  const p = plan();
  await assert.rejects(
    stopOwnedUnits(
      p,
      async () => 'LoadState=not-found\n',
      () => false,
    ),
    /cleanup_unconfirmed/,
  );
  const closed = await stopOwnedUnits(
    p,
    async () => 'LoadState=not-found\n',
    () => true,
  );
  assert.equal(closed.length, ROLE_NAMES.length);
});
test('pinned files reject changed bytes, symlinks, world-writable and noncanonical JSON', () => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'maya-remote-files-')),
  );
  try {
    const file = root + '/plan.json',
      raw = canonical(plan());
    fs.writeFileSync(file, raw, { mode: 0o600 });
    const pin = digest(raw);
    assert.deepEqual(readPlan(file, pin), plan());
    assert.throws(() => readPlan(file, 'b'.repeat(64)));
    fs.symlinkSync(file, root + '/link.json');
    assert.throws(() => readJson(root + '/link.json'));
    fs.chmodSync(file, 0o666);
    assert.throws(() => readJson(file));
    fs.chmodSync(file, 0o600);
    fs.writeFileSync(file, '{"a":1,"a":2}\n');
    assert.throws(() => readJson(file));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test('dry renderer writes new files only; mixed phase flags cannot imply a paid call', async () => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'maya-remote-dry-')),
  );
  try {
    fs.writeFileSync(root + '/input.json', canonical(example()), {
      mode: 0o600,
    });
    const result = await main([
      '--dry-run',
      '--config',
      root + '/input.json',
      '--output',
      root + '/rendered',
    ]);
    assert.deepEqual(result, {
      status: 'LOCAL_RENDER_ONLY',
      planSha256: digest(canonical(plan())),
      remoteActions: 0,
      paidCalls: 0,
      executable: false,
    });
    await assert.rejects(
      main([
        '--dry-run',
        '--config',
        root + '/input.json',
        '--output',
        root + '/different',
        '--owner-approval-ref',
        'test',
      ]),
      /action_arguments/,
    );
    await assert.rejects(
      main([
        '--dry-run',
        '--config',
        root + '/input.json',
        '--output',
        root + '/rendered',
      ]),
    );
    assert.equal(fs.existsSync(root + '/different'), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
