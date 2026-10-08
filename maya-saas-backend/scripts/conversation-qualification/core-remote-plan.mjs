// Finite local rendering for the existing core diagnostic. No remote I/O.
import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { serviceProperties } from './core-remote-systemd.mjs';
export const canonical = (value) => JSON.stringify(value, null, 2) + '\n';
export const digest = (value) =>
  createHash('sha256').update(value).digest('hex');
export const ROLE_NAMES = Object.freeze([
  'runner-check',
  'broker-check',
  'network-check',
  'prepare',
  'broker',
  'runner',
]);
const record = (value, keys) =>
  assert.ok(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).sort().join('|') === [...keys].sort().join('|'),
    'core_remote_shape',
  );
const safePath = (value) =>
  assert.ok(
    typeof value === 'string' &&
      /^\/[A-Za-z0-9_./-]+$/.test(value) &&
      !/[\u0000-\u0020\u007f]/.test(value) &&
      path.posix.normalize(value) === value &&
      !value.endsWith('/'),
    'core_remote_path',
  );
export function publicIpv4(value, illustrative = false) {
  assert.equal(isIP(value), 4, 'core_remote_ipv4');
  const [a, b, c] = value.split('.').map(Number);
  assert.ok(
    a > 0 &&
      a < 224 &&
      a !== 127 &&
      a !== 10 &&
      !(a === 172 && b >= 16 && b <= 31) &&
      !(a === 192 && b === 168) &&
      !(a === 169 && b === 254) &&
      !(a === 100 && b >= 64 && b <= 127) &&
      !(a === 198 && [18, 19].includes(b)),
    'core_remote_private_address',
  );
  if (!illustrative)
    assert.ok(
      !(a === 192 && b === 0) &&
        !(a === 198 && b === 51 && c === 100) &&
        !(a === 203 && b === 0 && c === 113),
      'core_remote_documentation_address',
    );
}
export function buildRemotePlan(input) {
  record(input, [
    'contract',
    'observation',
    'runId',
    'host',
    'candidateCommit',
    'checkout',
    'binaries',
    'users',
    'resources',
    'network',
    'credential',
  ]);
  assert.equal(input.contract, 'maya.core-remote-input/1');
  record(input.observation, [
    'kind',
    'at',
    'evidenceRef',
    'availableMemoryMb',
    'hostReserveMb',
    'freeDiskMb',
    'socketGroupMemberUids',
  ]);
  assert.ok(
    ['OBSERVED', 'ILLUSTRATIVE_NOT_OBSERVED'].includes(input.observation.kind),
  );
  assert.ok(Number.isFinite(Date.parse(input.observation.at)));
  assert.match(input.observation.evidenceRef, /^[A-Za-z0-9_./:-]{1,256}$/);
  assert.match(
    input.runId,
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
  );
  assert.equal(input.host, 'api.mayaos.ru');
  assert.match(input.candidateCommit, /^[a-f0-9]{40}$/);
  assert.equal(
    input.checkout,
    '/srv/maya-core-candidates/' + input.candidateCommit,
  );
  record(input.binaries, ['node', 'pgBin', 'bpftool']);
  Object.values(input.binaries).forEach(safePath);
  record(input.users, ['runnerUid', 'runnerGid', 'brokerUid', 'brokerGid']);
  assert.notEqual(input.users.runnerUid, input.users.brokerUid);
  assert.deepEqual(
    [...new Set(input.observation.socketGroupMemberUids)].sort((a, b) => a - b),
    [input.users.runnerUid],
    'core_remote_socket_group_must_be_exclusive',
  );
  record(input.credential, ['kind', 'reference', 'owner', 'reader']);
  assert.equal(input.credential.kind, 'file');
  safePath(input.credential.reference);
  assert.equal(input.credential.reader, input.users.brokerUid);
  assert.ok(
    Number.isSafeInteger(input.credential.owner) && input.credential.owner >= 0,
  );
  assert.ok(
    !['/home/', '/root/', '/run/user/'].some((p) =>
      input.credential.reference.startsWith(p),
    ),
    'core_remote_protected_credential_path',
  );
  assert.ok(
    !input.credential.reference.startsWith('/srv/maya-core-'),
    'core_remote_credential_must_preexist_outside_run',
  );
  record(input.network, ['providerIpv4']);
  assert.ok(Array.isArray(input.network.providerIpv4));
  for (const ip of input.network.providerIpv4)
    publicIpv4(ip, input.observation.kind !== 'OBSERVED');
  for (const key of ['availableMemoryMb', 'hostReserveMb', 'freeDiskMb'])
    assert.ok(
      Number.isSafeInteger(input.observation[key]) &&
        input.observation[key] > 0,
    );
  const totalMemoryMb =
    input.resources.runnerMemoryMaxMb + input.resources.brokerMemoryMaxMb;
  assert.ok(
    input.resources.runnerHeapMb >= 256 && input.resources.brokerHeapMb >= 32,
    'core_remote_heap_minimum',
  );
  assert.ok(
    input.observation.hostReserveMb >= 256,
    'core_remote_controller_cleanup_reserve',
  );
  assert.ok(
    input.resources.runnerMemoryMaxMb >= input.resources.runnerHeapMb + 256,
    'core_remote_runner_memory_margin',
  );
  assert.ok(
    input.resources.brokerMemoryMaxMb >= input.resources.brokerHeapMb + 64,
    'core_remote_broker_memory_margin',
  );
  assert.ok(
    totalMemoryMb + input.observation.hostReserveMb <=
      input.observation.availableMemoryMb,
    'core_remote_host_headroom',
  );
  assert.ok(input.observation.freeDiskMb >= 1024, 'core_remote_disk_headroom');
  const root = '/srv/maya-core-diagnostic-' + input.runId;
  const paths = {
    checkout: input.checkout,
    workDirectory: input.checkout + '/maya-saas-backend',
    root,
    runnerHome: root + '/runner-home',
    brokerHome: root + '/broker-home',
    runnerEvidence: root + '/runner',
    brokerEvidence: root + '/broker',
    socketDirectory: root + '/channel',
    control: root + '/control',
    hosts: root + '/hosts',
    credential: input.credential.reference,
  };
  const prefix = 'maya-core-' + input.runId;
  const units = Object.fromEntries(
    ROLE_NAMES.map((role) => [role, prefix + '-' + role + '.service']),
  );
  const plan = {
    contract: 'maya.core-remote-plan/1',
    input: structuredClone(input),
    paths,
    units,
    executable: input.observation.kind === 'OBSERVED',
    totalMemoryMaxMb: totalMemoryMb,
    stageDeadlineSeconds: 300,
    paidCleanupGraceSeconds: 45,
    target: {
      host: input.host,
      workDirectory: paths.workDirectory,
      brokerUid: input.users.brokerUid,
      runnerUid: input.users.runnerUid,
      brokerSocket: {
        path: paths.socketDirectory + '/broker.sock',
        gid: input.users.runnerGid,
      },
    },
    limitsUnchanged:
      '3 dialogs / 5 turns / 12 reservations / USD 2 / 600000 ms permit',
    declarations: {
      paidApproved: false,
      credentialReadApproved: false,
      remoteExecutionPerformed: false,
    },
  };
  for (const role of ROLE_NAMES) roleProperties(plan, role);
  return plan;
}
export function roleProperties(plan, role) {
  assert.ok(ROLE_NAMES.includes(role), 'core_remote_role');
  const properties = [
    ...serviceProperties({
      role: role === 'network-check' ? 'broker' : role,
      paths: plan.paths,
      users: plan.input.users,
      resources: plan.input.resources,
      network: plan.input.network,
    }),
  ];
  const envAt = properties.findIndex((p) => p.startsWith('Environment='));
  properties[envAt] +=
    ' TMPDIR=/tmp PATH=' +
    [
      path.posix.dirname(plan.input.binaries.node),
      plan.input.binaries.pgBin,
      '/usr/sbin',
      '/usr/bin',
      '/sbin',
      '/bin',
    ].join(':');
  if (role === 'network-check')
    properties[properties.findIndex((p) => p.startsWith('RuntimeMaxSec='))] =
      'RuntimeMaxSec=60s';
  return properties;
}
export function unitCommand(
  plan,
  role,
  args,
  { wait = false, seconds, phase, planSha256 } = {},
) {
  const properties = roleProperties(plan, role);
  if (phase !== undefined) {
    assert.ok(['setup', 'run'].includes(phase));
    assert.ok(
      typeof planSha256 === 'string' &&
        /^[a-f0-9]{64}$/.test(planSha256) &&
        planSha256.length === 64,
    );
    properties.push(
      'ExecCondition=' +
        plan.input.binaries.node +
        ' ' +
        plan.paths.workDirectory +
        '/scripts/conversation-qualification/core-remote-phase.mjs --root ' +
        plan.paths.root +
        ' --phase ' +
        phase +
        ' --sha256 ' +
        planSha256,
    );
  }
  if (seconds !== undefined) {
    assert.ok(Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 660);
    properties[properties.findIndex((p) => p.startsWith('RuntimeMaxSec='))] =
      'RuntimeMaxSec=' + seconds + 's';
  }
  return {
    command: '/usr/bin/systemd-run',
    args: [
      '--quiet',
      '--collect',
      '--unit=' + plan.units[role],
      '--description=MAYA core ' + plan.input.runId + ' ' + role,
      ...(wait ? ['--wait'] : []),
      ...properties.map((p) => '--property=' + p),
      '--',
      plan.input.binaries.node,
      ...args,
    ],
  };
}
export function preview(plan) {
  return {
    qualification: plan.executable
      ? 'REVIEW_REQUIRED_NOT_APPLIED'
      : 'ILLUSTRATIVE_NOT_OBSERVED_NOT_APPLICABLE',
    prerequisite:
      'A full root-owned offline checkout/.git and compatible ready Linux node_modules must already be delivered to input.checkout. No npm/network installation is performed.',
    directories: [
      [plan.paths.root, 0, 0, '0711'],
      [plan.paths.runnerHome, 0, 0, '0755'],
      [plan.paths.brokerHome, 0, 0, '0755'],
      [
        plan.paths.runnerEvidence,
        plan.input.users.runnerUid,
        plan.input.users.runnerGid,
        '0700',
      ],
      [
        plan.paths.brokerEvidence,
        plan.input.users.brokerUid,
        plan.input.users.brokerGid,
        '0700',
      ],
      [
        plan.paths.control,
        plan.input.users.brokerUid,
        plan.input.users.runnerGid,
        '02710',
      ],
      [
        plan.paths.socketDirectory,
        plan.input.users.brokerUid,
        plan.input.users.runnerGid,
        '02710',
      ],
    ],
    nonsecretWrites: [
      'root-owned plan/input/hosts/gitconfig',
      'shared readonly candidate manifest',
      'metadata-only setup receipts',
      'new private broker/runner evidence and ledgers',
    ],
    transientUnits: Object.fromEntries(
      ROLE_NAMES.map((role) => [
        role,
        { name: plan.units[role], properties: roleProperties(plan, role) },
      ]),
    ),
    stageActions: [
      'verify observed metadata age, exact existing users, headroom, readonly checkout/HEAD and binaries',
      'claim absent run root; write only owned nonsecret files',
      'arm independent 300s setup cleanup timer',
      'runner-check and broker-check: original OS credential access metadata only, no contents',
      'network-check: actual cgroup BPF/maps and hosts snapshot, no external request',
      'prepare exact source/corpus manifest in runner private output; copy nonsecret manifest into shared control',
      'stop/confirm all own setup cgroups and save setup receipt',
    ],
    startPrerequisites: [
      'separate explicit setup/effective isolation review and paid admission',
      'exact reviewed setup-receipt hash',
      'fresh external permit+SHA+ownerApprovalRef; no permit is minted by bootstrap',
    ],
    startActions: [
      'arm own cleanup timer before broker at absolute permit.expiresAt+45s',
      'start bound new broker; verify exact report and effective cgroup filter before runner',
      'start existing runner with private network, fresh PG, exact resource ceilings',
      'close/confirm both own cgroups on completion, failure, deadline or cancellation; preserve evidence',
    ],
    never: [
      'SSH/deploy from renderer',
      'new accounts/groups',
      'secret copy/read during setup',
      'production unit or DB stop/restart',
      'global firewall/DNS/sysctl changes',
      'old permit/ledger resume',
      'automatic paid admission',
    ],
  };
}
