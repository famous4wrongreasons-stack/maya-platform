// Pure synthetic validations only. Never invokes observeMain, /proc, credentials,
// systemd, DNS, networking or filesystem setup. Parent owns test execution.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRemotePlan, canonical, digest } from './core-remote-plan.mjs';
import {
  observerArguments,
  validateObserverPlan,
  expectedHosts,
  validateHosts,
  credentialReadableFromAccessError,
  validateCredentialMetadata,
  interfaceFlags,
  networkSummary,
  validateObserverFacts,
} from './core-remote-observe.mjs';

function plan() {
  return buildRemotePlan({
    contract: 'maya.core-remote-input/1',
    observation: {
      kind: 'OBSERVED',
      at: '2026-10-08T00:00:00.000Z',
      evidenceRef: 'SYNTHETIC_UNIT_NOT_HOST_OBSERVATION',
      availableMemoryMb: 8192,
      hostReserveMb: 1024,
      freeDiskMb: 4096,
      socketGroupMemberUids: [22001],
    },
    runId: '11111111-1111-4111-8111-111111111111',
    host: 'api.mayaos.ru',
    candidateCommit: 'a'.repeat(40),
    checkout: '/srv/maya-core-candidates/' + 'a'.repeat(40),
    binaries: {
      node: '/synthetic/node',
      pgBin: '/synthetic/pg',
      bpftool: '/synthetic/bpftool',
    },
    users: {
      runnerUid: 22001,
      runnerGid: 22011,
      brokerUid: 22002,
      brokerGid: 22012,
    },
    resources: {
      runnerHeapMb: 1024,
      runnerMemoryMaxMb: 1536,
      brokerHeapMb: 128,
      brokerMemoryMaxMb: 256,
      runnerTasksMax: 128,
      brokerTasksMax: 32,
      runnerCpuPercent: 150,
      brokerCpuPercent: 50,
    },
    network: { providerIpv4: ['8.8.8.8', '1.1.1.1'] },
    credential: {
      kind: 'file',
      reference: '/never-opened/synthetic-key',
      owner: 0,
      reader: 22002,
    },
  });
}
const v4Header =
  'Iface\tDestination\tGateway\tFlags\tRefCnt\tUse\tMetric\tMask\tMTU\tWindow\tIRTT\n';
const v4External = 'eth0 00000000 0100000A 0003 0 0 0 00000000 0 0 0\n';
const zeros = '0'.repeat(32);
const v6Loopback = `${zeros} 00 ${zeros} 00 ${zeros} ffffffff 00000001 00000000 00200200 lo\n`;
const v6External = `${zeros} 00 ${zeros} 00 ${zeros} 00000064 00000001 00000000 00000001 eth0\n`;
const loopback = () => ({ lo: 0x9 });
const credential = () => ({
  readable: true,
  regularFile: true,
  owner: 0,
  gid: 22012,
  mode: 0o440,
  nlink: 1,
});
function facts(role = 'runner-check') {
  const broker = role !== 'runner-check';
  return {
    platform: 'linux',
    uid: broker ? 22002 : 22001,
    gid: broker ? 22012 : 22011,
    groups: [broker ? 22012 : 22011],
    netNamespace: 'net:[4026532999]',
    network: networkSummary(loopback(), v4Header, v6Loopback),
    credential: broker ? credential() : { readable: false },
    hostsVerified: role === 'network-check' ? true : null,
  };
}
const refused = (fn, suffix) =>
  assert.throws(fn, { message: 'core_remote_observe_' + suffix });

test('canonical pinned plan is rebuilt exactly, never trusting supplied derived fields', () => {
  const original = plan(),
    raw = Buffer.from(canonical(original));
  assert.deepEqual(validateObserverPlan(raw, digest(raw)), original);
  refused(() => validateObserverPlan(raw, 'b'.repeat(64)), 'plan');
  for (const change of [
    (p) => {
      p.paths.credential = '/different';
    },
    (p) => {
      p.units['runner-check'] = 'unrelated.service';
    },
    (p) => {
      p.unrecognized = true;
    },
  ]) {
    const changed = structuredClone(original);
    change(changed);
    const bytes = Buffer.from(canonical(changed));
    refused(() => validateObserverPlan(bytes, digest(bytes)), 'plan');
  }
});
test('illustrative plans, oversized files, duplicate keys and noncanonical bytes refuse', () => {
  const input = plan().input;
  input.observation.kind = 'ILLUSTRATIVE_NOT_OBSERVED';
  const illustrative = Buffer.from(canonical(buildRemotePlan(input)));
  const raw = Buffer.from(canonical(plan()));
  for (const bytes of [
    illustrative,
    Buffer.alloc(128 * 1024 + 1),
    Buffer.from(raw.toString().trim()),
    Buffer.from(
      raw.toString().replace('"contract":', '"extra":1,"extra":2,"contract":'),
    ),
  ])
    refused(() => validateObserverPlan(bytes, digest(bytes)), 'plan');
});
test('closed CLI requires canonical absolute paths and permits bounded hold for exactly the three check roles', () => {
  const args = [
    '--plan',
    '/synthetic/plan.json',
    '--sha256',
    'a'.repeat(64),
    '--role',
    'network-check',
    '--output',
    '/synthetic/result.json',
  ];
  assert.equal(observerArguments(args).holdMs, 0);
  assert.equal(
    observerArguments([...args, '--hold-ms', '60000']).holdMs,
    60000,
  );
  for (const value of ['0', '-1', '60001', '1.5', '01', '1\n'])
    refused(
      () => observerArguments([...args, '--hold-ms', value]),
      'arguments',
    );
  for (const extra of [['--other', 'x'], ['positional']])
    refused(() => observerArguments([...args, ...extra]), 'arguments');
  for (const role of ['runner-check', 'broker-check']) {
    const changed = [...args];
    changed[5] = role;
    assert.equal(observerArguments([...changed, '--hold-ms', '1']).holdMs, 1);
  }
  for (const role of ['runner', 'broker', 'prepare', 'unknown']) {
    const changed = [...args];
    changed[5] = role;
    refused(() => observerArguments(changed), 'arguments');
  }
  for (const file of [
    'relative',
    '/synthetic/../plan.json',
    '/synthetic/plan.json\n',
  ]) {
    const changed = [...args];
    changed[1] = file;
    refused(() => observerArguments(changed), 'arguments');
  }
});
test('private namespace summary admits loopback including unreachable IPv6 loopback entries', () => {
  assert.deepEqual(networkSummary(loopback(), v4Header, v6Loopback), {
    interfaceCount: 1,
    nonLoopbackInterfaceCount: 0,
    ipv4RouteCount: 0,
    ipv4NonLoopbackRouteCount: 0,
    ipv4DefaultRouteCount: 0,
    ipv6RouteCount: 1,
    ipv6NonLoopbackRouteCount: 0,
    ipv6DefaultRouteCount: 0,
    loopbackOnly: true,
  });
  validateObserverFacts(plan(), 'runner-check', facts());
  validateObserverFacts(plan(), 'broker-check', facts('broker-check'));
});
test('external interfaces or IPv4/IPv6 routes refuse private roles but remain counts for network-check', () => {
  const outside = { ...loopback(), eth0: 0x1003 };
  for (const network of [
    networkSummary(outside, v4Header, ''),
    networkSummary(loopback(), v4Header + v4External, ''),
    networkSummary(loopback(), v4Header, v6External),
  ]) {
    refused(
      () =>
        validateObserverFacts(plan(), 'runner-check', { ...facts(), network }),
      'network',
    );
    refused(
      () =>
        validateObserverFacts(plan(), 'broker-check', {
          ...facts('broker-check'),
          network,
        }),
      'network',
    );
    validateObserverFacts(plan(), 'network-check', {
      ...facts('network-check'),
      network,
    });
    assert.equal(JSON.stringify(network).includes('eth0'), false);
  }
});
test('route truncation, malformed fields and excessive input fail closed instead of empty routes', () => {
  for (const text of [
    '',
    'wrong header\n',
    v4Header + 'eth0\n',
    v4Header + v4External.replace('00000000', 'nothex'),
    'x'.repeat(65537),
  ])
    refused(() => networkSummary(loopback(), text, ''), 'routes');
  for (const text of [
    'truncated\n',
    v6External.replace(' 00 ', ' ff '),
    v6Loopback.repeat(514),
  ])
    refused(() => networkSummary(loopback(), v4Header, text), 'routes');
  refused(() => networkSummary({}, v4Header, ''), 'interfaces');
  refused(() => networkSummary({ lo: 0x1 }, v4Header, ''), 'interfaces');
});
test('sysfs flags parse exactly with at most 32 validated interface names and no address reads', () => {
  assert.equal(interfaceFlags('0x9\n'), 0x9);
  assert.equal(interfaceFlags('0x1003\n'), 0x1003);
  for (const text of ['9', '0x9', '0x9\n\n', '0x9\nsecret', '0x100000000\n'])
    refused(() => interfaceFlags(text), 'interfaces');
  refused(
    () => networkSummary({ ...loopback(), '../private': 0x1 }, v4Header, ''),
    'interfaces',
  );
  refused(
    () =>
      networkSummary(
        {
          ...loopback(),
          ...Object.fromEntries(
            Array.from({ length: 32 }, (_, n) => ['eth' + n, 0x1]),
          ),
        },
        v4Header,
        '',
      ),
    'interfaces',
  );
});
test('access failures distinguish denial from missing path, I/O failure and unexpected success', () => {
  assert.equal(credentialReadableFromAccessError(null), true);
  for (const code of ['EACCES', 'EPERM'])
    assert.equal(credentialReadableFromAccessError(code), false);
  for (const code of ['ENOENT', 'EIO', 'ELOOP', undefined])
    refused(() => credentialReadableFromAccessError(code), 'credential_access');
  refused(
    () =>
      validateObserverFacts(plan(), 'runner-check', {
        ...facts(),
        credential: { readable: true },
      }),
    'credential_access',
  );
  refused(
    () =>
      validateObserverFacts(plan(), 'broker-check', {
        ...facts('broker-check'),
        credential: { ...credential(), readable: false },
      }),
    'credential_access',
  );
});
test('broker credential metadata must describe the existing regular owner-bound nonwritable file', () => {
  const metadata = { ...credential(), symlink: false };
  assert.deepEqual(validateCredentialMetadata(metadata, 0), {
    regularFile: true,
    owner: 0,
    gid: 22012,
    mode: 0o440,
    nlink: 1,
  });
  for (const changed of [
    { regularFile: false },
    { symlink: true },
    { owner: 22001 },
    { nlink: 2 },
    { mode: 0o664 },
    { mode: 0o602 },
  ])
    refused(
      () => validateCredentialMetadata({ ...metadata, ...changed }, 0),
      'credential_metadata',
    );
});
test('actual principal, groups, Linux and net namespace identity must match the selected role', () => {
  for (const changed of [
    { uid: 22002 },
    { gid: 22012 },
    { platform: 'darwin' },
  ])
    refused(
      () =>
        validateObserverFacts(plan(), 'runner-check', {
          ...facts(),
          ...changed,
        }),
      'principal',
    );
  for (const groups of [[], [22011, 22011], [22012], [22011, '22012']])
    refused(
      () =>
        validateObserverFacts(plan(), 'runner-check', { ...facts(), groups }),
      'groups',
    );
  for (const netNamespace of ['net:[0]', '/proc/1/ns/net', 'net:[123]\n'])
    refused(
      () =>
        validateObserverFacts(plan(), 'runner-check', {
          ...facts(),
          netNamespace,
        }),
      'namespace',
    );
});
test('network-check verifies exact generated hosts bytes with every pinned address and no additions', () => {
  const p = plan();
  assert.equal(
    expectedHosts(p),
    '127.0.0.1 localhost\n8.8.8.8 api.deepseek.com\n1.1.1.1 api.deepseek.com\n',
  );
  assert.equal(validateHosts(p, Buffer.from(expectedHosts(p))), true);
  for (const text of [
    expectedHosts(p).trim(),
    expectedHosts(p) + '8.8.4.4 other.invalid\n',
    expectedHosts(p).replace('1.1.1.1', '1.0.0.1'),
  ])
    refused(() => validateHosts(p, Buffer.from(text)), 'hosts');
  refused(
    () =>
      validateObserverFacts(p, 'network-check', {
        ...facts('network-check'),
        hostsVerified: false,
      }),
    'network',
  );
});
