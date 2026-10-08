// Pure synthetic property generation; no systemd, network, accounts, files or
// permissions are created or probed. Target enforcement remains unqualified.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { serviceProperties } from './core-remote-systemd.mjs';

function fixture(role = 'runner') {
  return {
    role,
    paths: {
      checkout: '/srv/synthetic-proof/checkout',
      workDirectory: '/srv/synthetic-proof/checkout/maya-saas-backend',
      root: '/srv/synthetic-proof',
      runnerHome: '/srv/synthetic-proof/runner-home',
      brokerHome: '/srv/synthetic-proof/broker-home',
      runnerEvidence: '/srv/synthetic-proof/runner-evidence',
      brokerEvidence: '/srv/synthetic-proof/broker-evidence',
      socketDirectory: '/srv/synthetic-proof/socket',
      control: '/srv/synthetic-proof/control',
      hosts: '/srv/synthetic-proof/hosts',
      credential: '/never-opened/synthetic-credential',
    },
    users: {
      runnerUid: 22001,
      runnerGid: 22001,
      brokerUid: 22002,
      brokerGid: 22002,
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
    network: { providerIpv4: ['192.0.2.11', '198.51.100.22'] },
  };
}
function properties(role) {
  const input = fixture(role),
    array = serviceProperties(input);
  const result = Object.fromEntries(
    array.map((entry) => {
      const index = entry.indexOf('=');
      return [entry.slice(0, index), entry.slice(index + 1)];
    }),
  );
  assert.equal(
    Object.keys(result).length,
    array.length,
    'No ambiguous duplicate properties',
  );
  return { input, array, result };
}
function refused(input) {
  assert.throws(
    () => serviceProperties(input),
    (error) => error.message === 'core_systemd_properties_refused',
  );
}

test('every transient role has bounded stop and resource policy with no capabilities or restart', () => {
  for (const role of [
    'prepare',
    'runner',
    'runner-check',
    'broker',
    'broker-check',
  ]) {
    const { array, result } = properties(role);
    for (const entry of [
      'Type=exec',
      'Restart=no',
      'KillMode=control-group',
      'TimeoutStopSec=10s',
      'SendSIGKILL=yes',
      'NoNewPrivileges=yes',
      'ProtectSystem=strict',
      'ProtectHome=yes',
      'PrivateTmp=yes',
      'PrivateDevices=yes',
      'RemoveIPC=no',
      'PrivateIPC=yes',
      'UMask=0077',
      'MemorySwapMax=0',
      'OOMPolicy=stop',
      'CapabilityBoundingSet=',
      'AmbientCapabilities=',
    ])
      assert.ok(array.includes(entry), `${role}: ${entry}`);
    assert.ok(Object.isFrozen(array));
    assert.equal(
      result.WorkingDirectory,
      '/srv/synthetic-proof/checkout/maya-saas-backend',
    );
    assert.equal(result.SupplementaryGroups, undefined);
    assert.equal(result.ListenStream, undefined);
    assert.equal(result.ExecStart, undefined);
    assert.equal(result.WantedBy, undefined);
    assert.equal(result.LoadCredential, undefined);
    assert.equal(result.EnvironmentFile, undefined);
  }
});
test('prepare and runner isolate networking, credential access and writable evidence', () => {
  for (const role of ['prepare', 'runner']) {
    const { input, result } = properties(role);
    assert.equal(result.User, String(input.users.runnerUid));
    assert.equal(result.Group, String(input.users.runnerGid));
    assert.equal(result.PrivateNetwork, 'yes');
    assert.equal(result.RestrictAddressFamilies, 'AF_UNIX AF_INET');
    assert.equal(result.IPAddressAllow, undefined);
    assert.equal(result.ReadWritePaths, input.paths.runnerEvidence);
    assert.equal(result.InaccessiblePaths, input.paths.credential);
    assert.equal(result.RuntimeMaxSec, role === 'prepare' ? '120s' : '660s');
    assert.equal(result.MemoryMax, '1536M');
    assert.equal(result.TasksMax, '128');
    assert.equal(result.CPUQuota, '150%');
    assert.equal(
      result.Environment,
      'HOME=/srv/synthetic-proof/runner-home TZ=UTC NODE_ENV=test NODE_OPTIONS=--max-old-space-size=1024',
    );
  }
});
test('runner-check preserves original credential visibility for metadata-only access denial proof', () => {
  const { input, result } = properties('runner-check');
  const runner = properties('runner').result;
  for (const key of [
    'User',
    'Group',
    'Environment',
    'MemoryMax',
    'TasksMax',
    'CPUQuota',
  ]) {
    assert.equal(result[key], runner[key]);
  }
  assert.equal(result.PrivateNetwork, 'yes');
  assert.equal(result.RuntimeMaxSec, '60s');
  assert.equal(result.ReadWritePaths, input.paths.runnerEvidence);
  assert.equal(result.InaccessiblePaths, undefined);
  assert.equal(result.BindReadOnlyPaths, undefined);
  assert.equal(result.IPAddressAllow, undefined);
});
test('broker admits only exact IPv4 hosts and its three writable locations', () => {
  const { input, result } = properties('broker');
  assert.equal(result.User, String(input.users.brokerUid));
  assert.equal(result.Group, String(input.users.brokerGid));
  assert.equal(result.PrivateNetwork, 'no');
  assert.equal(result.RestrictAddressFamilies, 'AF_UNIX AF_INET');
  assert.equal(result.IPAddressDeny, 'any');
  assert.equal(result.IPAddressAllow, '192.0.2.11/32 198.51.100.22/32');
  assert.equal(
    result.BindReadOnlyPaths,
    '/srv/synthetic-proof/hosts:/etc/hosts',
  );
  assert.equal(
    result.ReadWritePaths,
    '/srv/synthetic-proof/broker-evidence /srv/synthetic-proof/control /srv/synthetic-proof/socket',
  );
  assert.equal(result.InaccessiblePaths, undefined);
  assert.equal(result.RuntimeMaxSec, '600s');
  assert.equal(result.MemoryMax, '256M');
  assert.equal(result.TasksMax, '32');
  assert.equal(result.CPUQuota, '50%');
  assert.equal(
    result.Environment,
    'HOME=/srv/synthetic-proof/broker-home TZ=UTC NODE_ENV=test NODE_OPTIONS=--max-old-space-size=128',
  );
});
test('broker-check sees the credential path but has no IP family or upstream network', () => {
  const { input, result } = properties('broker-check');
  assert.equal(result.User, String(input.users.brokerUid));
  assert.equal(result.Group, String(input.users.brokerGid));
  assert.equal(result.PrivateNetwork, 'yes');
  assert.equal(result.RestrictAddressFamilies, 'AF_UNIX');
  assert.equal(result.IPAddressAllow, undefined);
  assert.equal(
    result.BindReadOnlyPaths,
    '/srv/synthetic-proof/hosts:/etc/hosts',
  );
  assert.equal(result.InaccessiblePaths, undefined);
  assert.equal(result.ReadWritePaths, input.paths.brokerEvidence);
  assert.equal(result.RuntimeMaxSec, '60s');
  assert.equal(result.MemoryMax, '256M');
});
test('unsafe path interpolation cannot introduce properties, mounts, specifiers or commands', () => {
  for (const field of Object.keys(fixture().paths)) {
    for (const value of [
      '/path\nEnvironment=SECRET=bad',
      '/path\n',
      '/path with spaces',
      '/path:%n',
      '/path/%U',
      '/path/$HOME',
      '/path/$(id)',
      '/path;command',
      '/path/"quoted"',
      '/path/*',
      '/path/?',
      '-/optional',
      'relative',
      '/path/../other',
      '/path//other',
      '/path/',
      '/',
      '/path\0hidden',
    ]) {
      const input = fixture();
      input.paths[field] = value;
      refused(input);
    }
  }
});
test('unknown fields, duplicate principals and invalid numeric resource declarations refuse', () => {
  const mutations = [
    (x) => {
      x.role = 'install';
    },
    (x) => {
      x.command = 'PRIVATE_CANARY';
    },
    (x) => {
      x.paths.extra = '/unsafe';
    },
    (x) => {
      x.users.runnerUid = x.users.brokerUid;
    },
    (x) => {
      x.users.runnerUid = 0;
    },
    (x) => {
      x.users.brokerGid = '22002';
    },
    (x) => {
      x.users.brokerUid = 1.5;
    },
    (x) => {
      x.resources.brokerHeapMb = 257;
    },
    (x) => {
      x.resources.brokerMemoryMaxMb = 513;
    },
    (x) => {
      x.resources.brokerTasksMax = 65;
    },
    (x) => {
      x.resources.brokerCpuPercent = 101;
    },
    (x) => {
      x.resources.runnerHeapMb = 3073;
    },
    (x) => {
      x.resources.runnerMemoryMaxMb = 4097;
    },
    (x) => {
      x.resources.runnerTasksMax = 257;
    },
    (x) => {
      x.resources.runnerCpuPercent = 201;
    },
    (x) => {
      x.resources.runnerHeapMb = x.resources.runnerMemoryMaxMb;
    },
    (x) => {
      x.resources.brokerHeapMb = x.resources.brokerMemoryMaxMb;
    },
    (x) => {
      x.resources.runnerTasksMax = -1;
    },
    (x) => {
      x.resources.runnerCpuPercent = NaN;
    },
  ];
  for (const mutate of mutations) {
    const input = fixture();
    mutate(input);
    refused(input);
  }
});
test('network declarations cannot widen an exact IPv4 host into DNS, CIDR, IPv6 or injected properties', () => {
  for (const addresses of [
    [],
    ['api.example.test'],
    ['192.0.2.1/24'],
    ['::1'],
    ['256.1.2.3'],
    ['192.000.2.1'],
    ['192.0.2.1\n'],
    ['192.0.2.1\nIPAddressAllow=any'],
    ['192.0.2.1', '192.0.2.1'],
    Array.from({ length: 9 }, (_, i) => `192.0.2.${i + 1}`),
  ]) {
    const input = fixture('broker');
    input.network.providerIpv4 = addresses;
    refused(input);
  }
  const extra = fixture('broker');
  extra.network.allowAny = true;
  refused(extra);
});
test('generation is deterministic and leaves its declaration unchanged', () => {
  const input = fixture('broker'),
    before = structuredClone(input);
  assert.deepEqual(serviceProperties(input), serviceProperties(input));
  assert.deepEqual(input, before);
});
