// Entirely synthetic command/proc/cgroup fixtures. These tests do not observe
// a target, open credentials, execute systemctl/bpftool or make connections.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  EFFECTIVE_PROPERTIES,
  inspectEffective,
  parseEffectiveProperties,
  stableFilterSha256,
  stableMapFingerprint,
  validateEffectiveProperties,
} from './core-remote-effective.mjs';
import {
  buildRemotePlan,
  ROLE_NAMES,
  roleProperties,
} from './core-remote-plan.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));
function plan(kind = 'OBSERVED') {
  return buildRemotePlan({
    contract: 'maya.core-remote-input/1',
    observation: {
      kind,
      at: '2035-01-01T00:00:00.000Z',
      evidenceRef: 'synthetic:effective-unit',
      availableMemoryMb: 4096,
      hostReserveMb: 1024,
      freeDiskMb: 4096,
      socketGroupMemberUids: [997],
    },
    runId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    host: 'api.mayaos.ru',
    candidateCommit: 'b'.repeat(40),
    checkout: '/srv/maya-core-candidates/' + 'b'.repeat(40),
    binaries: {
      node: '/usr/bin/node',
      pgBin: '/usr/lib/postgresql/16/bin',
      bpftool: '/usr/sbin/bpftool',
    },
    users: { runnerUid: 997, runnerGid: 997, brokerUid: 996, brokerGid: 996 },
    resources: {
      runnerHeapMb: 1024,
      runnerMemoryMaxMb: 1536,
      brokerHeapMb: 128,
      brokerMemoryMaxMb: 256,
      runnerTasksMax: 128,
      brokerTasksMax: 32,
      runnerCpuPercent: 100,
      brokerCpuPercent: 50,
    },
    network: { providerIpv4: ['1.1.1.1'] }, // Literal fixture; never contacted.
    credential: {
      kind: 'file',
      reference: '/etc/maya-core-credential',
      owner: 0,
      reader: 996,
    },
  });
}
function properties(p, role) {
  const result = Object.fromEntries(
    EFFECTIVE_PROPERTIES.map((key) => [key, '']),
  );
  for (const entry of roleProperties(p, role)) {
    const at = entry.indexOf('='),
      key = entry.slice(0, at);
    if (Object.hasOwn(result, key)) result[key] = entry.slice(at + 1);
  }
  return {
    ...result,
    ActiveState: 'active',
    MainPID: '321',
    ControlGroup: '/system.slice/' + p.units[role],
    MemoryMax: String(Number(result.MemoryMax.slice(0, -1)) * 1024 * 1024),
    Description: `MAYA core ${p.input.runId} ${role}`,
  };
}
const propertyText = (p) =>
  EFFECTIVE_PROPERTIES.map((key) => key + '=' + p[key]).join('\n') + '\n';
function mapFixture(id = 21) {
  return {
    metadata: {
      id,
      type: 'lpm_trie',
      key_size: 8,
      value_size: 1,
      max_entries: 8,
      map_flags: 1,
      name: 'allow_ipv4',
    },
    entries: [
      {
        key: ['0x20', '0x00', '0x00', '0x00', '0x01', '0x01', '0x01', '0x01'],
        value: ['0x01'],
      },
      {
        key: ['0x18', '0x00', '0x00', '0x00', '0x02', '0x02', '0x02', '0x00'],
        value: ['0x02'],
      },
    ],
  };
}
function processStat(start = '1000') {
  const fields = Array(20).fill('0');
  fields[0] = 'S';
  fields[19] = start;
  return '321 (node worker) ' + fields.join(' ') + '\n';
}
function fixture(t, role = 'runner') {
  const p = plan(),
    props = properties(p, role);
  const expected = validateEffectiveProperties(p, role, props);
  const base = '/sys/fs/cgroup' + expected.controlGroup;
  const files = new Map([
    [base + '/cgroup.controllers', 'cpu memory pids\n'],
    [base + '/memory.max', String(expected.memoryMax) + '\n'],
    [base + '/memory.swap.max', '0\n'],
    [base + '/pids.max', String(expected.tasksMax) + '\n'],
    [
      '/proc/321/status',
      `Name:\tnode\nUid:\t${Array(4).fill(expected.uid).join('\t')}\nGid:\t${Array(4).fill(expected.gid).join('\t')}\n`,
    ],
    ['/proc/321/cgroup', '0::' + expected.controlGroup + '\n'],
    ['/proc/321/stat', processStat()],
  ]);
  const namespaces = new Map([
    ['/proc/1/ns/net', 'net:[100]'],
    ['/proc/321/ns/net', expected.privateNetwork ? 'net:[101]' : 'net:[100]'],
  ]);
  const openFiles = new Map(),
    reads = [],
    calls = [];
  let nextFd = 100;
  const f = {
    p,
    props,
    expected,
    base,
    files,
    namespaces,
    reads,
    calls,
    openFiles,
    realPath: base,
    isRegular: true,
    showCount: 0,
    cgroupCount: 0,
    beforeCommand: null,
    output: null,
    attached: [
      { id: 11, attach_type: 'cgroup_inet_ingress' },
      { id: 12, attach_type: 'cgroup_inet_egress' },
    ],
    programs: new Map([
      [
        11,
        { id: 11, type: 'cgroup_skb', tag: '1111111111111111', map_ids: [21] },
      ],
      [
        12,
        { id: 12, type: 'cgroup_skb', tag: '2222222222222222', map_ids: [22] },
      ],
    ]),
    maps: new Map([
      [21, mapFixture(21)],
      [22, mapFixture(22)],
    ]),
  };
  t.mock.method(fs, 'realpathSync', (file) => {
    assert.equal(file, base);
    return f.realPath;
  });
  t.mock.method(fs, 'readlinkSync', (file) => {
    assert.ok(namespaces.has(file));
    return namespaces.get(file);
  });
  t.mock.method(fs, 'openSync', (file, flags) => {
    assert.ok(files.has(file), 'no unlisted filesystem read');
    assert.equal(
      flags,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
    );
    reads.push(file);
    const fd = nextFd++;
    openFiles.set(fd, Buffer.from(files.get(file)));
    return fd;
  });
  t.mock.method(fs, 'fstatSync', (fd) => ({
    isFile: () => f.isRegular,
    size: openFiles.get(fd).length,
  }));
  t.mock.method(fs, 'readSync', (fd, buffer, offset, length, position) => {
    const source = openFiles.get(fd);
    const count = Math.min(length, 7, source.length - position);
    source.copy(buffer, offset, position, position + count);
    return count;
  });
  t.mock.method(fs, 'closeSync', (fd) => {
    assert.ok(openFiles.delete(fd));
  });
  f.run = async (command, args, limits) => {
    calls.push({ command, args: [...args], limits: { ...limits } });
    assert.deepEqual(limits, { timeoutMs: 5000, maxBuffer: 65_536 });
    if (command === '/usr/bin/systemctl') f.showCount += 1;
    if (args[1] === 'cgroup') f.cgroupCount += 1;
    f.beforeCommand?.(command, args);
    if (f.output) return f.output(command, args);
    if (command === '/usr/bin/systemctl') {
      assert.deepEqual(args, [
        'show',
        p.units[role],
        '--no-pager',
        '--property=' + EFFECTIVE_PROPERTIES.join(','),
      ]);
      return propertyText(props);
    }
    assert.equal(command, p.input.binaries.bpftool);
    if (args[1] === 'cgroup') {
      assert.deepEqual(args, ['-j', 'cgroup', 'show', base]);
      return JSON.stringify(f.attached);
    }
    assert.equal(args[0], '-j');
    assert.equal(args[3], 'id');
    assert.equal(args.length, 5);
    const id = Number(args[4]);
    if (args[1] === 'prog') {
      assert.equal(args[2], 'show');
      return JSON.stringify(f.programs.get(id));
    }
    assert.equal(args[1], 'map');
    assert.ok(['show', 'dump'].includes(args[2]));
    return JSON.stringify(
      args[2] === 'show' ? f.maps.get(id).metadata : f.maps.get(id).entries,
    );
  };
  return f;
}

test('property parser admits only the complete finite whitelist', () => {
  const p = plan(),
    props = properties(p, 'runner');
  assert.deepEqual(parseEffectiveProperties(propertyText(props)), props);
  for (const text of [
    propertyText(props) + 'User=997\n',
    propertyText(props) + 'Environment=SECRET\n',
    propertyText(props).replace('MainPID=321\n', ''),
    'invalid',
    'x'.repeat(65_537),
  ])
    assert.throws(
      () => parseEffectiveProperties(text),
      /^Error: core_effective_/,
    );
});

for (const role of ROLE_NAMES) {
  test('pure properties match the declared exact role: ' + role, () => {
    const p = plan(),
      props = properties(p, role);
    const result = validateEffectiveProperties(p, role, props);
    assert.equal(result.unit, p.units[role]);
    assert.equal(result.controlGroup, '/system.slice/' + p.units[role]);
    assert.equal(
      result.privateNetwork,
      !['network-check', 'broker'].includes(role),
    );
    assert.equal(
      result.uid,
      ['network-check', 'broker', 'broker-check'].includes(role) ? 996 : 997,
    );
  });
}

test('pure validator refuses permissive, foreign and inactive property variants', () => {
  const p = plan(),
    base = properties(p, 'runner');
  const mutations = {
    ActiveState: 'inactive',
    MainPID: '0',
    ControlGroup: '/system.slice/other.service',
    User: 'root',
    Group: '0',
    MemoryMax: 'max',
    MemorySwapMax: '1',
    TasksMax: '999',
    KillMode: 'process',
    PrivateNetwork: 'no',
    NoNewPrivileges: 'no',
    ProtectSystem: 'full',
    Description: 'foreign',
    IPAddressAllow: '0.0.0.0/0',
    IPAddressDeny: 'any',
  };
  for (const [key, value] of Object.entries(mutations))
    assert.throws(
      () => validateEffectiveProperties(p, 'runner', { ...base, [key]: value }),
      /^Error: core_effective_/,
    );
  for (const value of ['-1', '1.0', ' 321', '2147483648'])
    assert.throws(
      () =>
        validateEffectiveProperties(p, 'runner', { ...base, MainPID: value }),
      /pid_refused/,
    );
  const inherited = { ...base };
  delete inherited.User;
  Object.setPrototypeOf(inherited, { User: '997' });
  inherited.Foreign = '';
  assert.throws(
    () => validateEffectiveProperties(p, 'runner', inherited),
    /properties_refused/,
  );
});

test('broker properties require the exact address set and deny-all', () => {
  const p = plan(),
    props = properties(p, 'broker');
  validateEffectiveProperties(p, 'broker', {
    ...props,
    IPAddressDeny: '::/0 0.0.0.0/0',
  });
  for (const allow of ['', '1.1.1.1/24', '1.1.1.1/32 8.8.8.8/32', 'any'])
    assert.throws(
      () =>
        validateEffectiveProperties(p, 'broker', {
          ...props,
          IPAddressAllow: allow,
        }),
      /address_allow_refused/,
    );
  for (const deny of ['', '0.0.0.0/0', '1.1.1.1/32'])
    assert.throws(
      () =>
        validateEffectiveProperties(p, 'broker', {
          ...props,
          IPAddressDeny: deny,
        }),
      /address_deny_refused/,
    );
});

test('runner reads only exact proc/cgroup files and keeps point-in-time limits explicit', async (t) => {
  const f = fixture(t);
  const result = await inspectEffective(f.p, 'runner', f.run);
  assert.equal(f.calls.length, 2);
  assert.equal(f.reads.length, 14);
  assert.deepEqual([...new Set(f.reads)].sort(), [...f.files.keys()].sort());
  assert.equal(f.openFiles.size, 0);
  assert.equal(result.stableMapSha256, null);
  assert.equal(result.stableFilterSha256, null);
  assert.equal(result.requiresHumanMapReview, false);
  assert.equal(result.semanticPolicyVerified, false);
  assert.equal(result.executionAuthority, false);
  assert.equal(result.noConnectionsAttempted, true);
  assert.equal(result.pointInTimeOnly, true);
  assert.equal(result.port443Verified, false);
  assert.notEqual(
    result.process.hostNetworkNamespace,
    result.process.processNetworkNamespace,
  );
  assert.equal(JSON.stringify(result).includes(f.p.paths.credential), false);
});

for (const role of ['broker', 'network-check']) {
  test(
    role + ' captures bounded raw BPF facts, not a semantic or port443 proof',
    async (t) => {
      const f = fixture(t, role);
      const result = await inspectEffective(f.p, role, f.run);
      assert.equal(f.calls.length, 10);
      assert.equal(result.programs.length, 2);
      assert.equal(result.maps.length, 2);
      assert.equal(
        result.stableMapSha256,
        stableMapFingerprint([...f.maps.values()]),
      );
      assert.equal(
        result.stableFilterSha256,
        stableFilterSha256(
          f.attached,
          [...f.programs.values()],
          [...f.maps.values()],
        ),
      );
      assert.equal(result.requiresHumanMapReview, true);
      assert.equal(result.semanticPolicyVerified, false);
      assert.equal(result.networkQualification, 'address-filter-not-port443');
      assert.equal(result.port443Verified, false);
      assert.equal(result.executionAuthority, false);
      assert.deepEqual(result.maps, [...f.maps.values()]);
      assert.equal(
        result.process.hostNetworkNamespace,
        result.process.processNetworkNamespace,
      );
      assert.ok(
        result.commands.every(
          (entry) =>
            /^[a-f0-9]{64}$/.test(entry.sha256) && entry.bytes <= 65_536,
        ),
      );
      assert.ok(
        f.calls.every(
          ({ args }) =>
            !args.some((v) =>
              [
                'attach',
                'detach',
                'update',
                'delete',
                'connect',
                'start',
                'set-property',
              ].includes(v),
            ),
        ),
      );
    },
  );
}

test('finite bpftool aliases preserve the fingerprint and retain raw evidence', async (t) => {
  const f = fixture(t, 'network-check');
  const original = stableMapFingerprint([...f.maps.values()]);
  f.attached[0].attach_type = 'ingress';
  f.attached[1].attach_type = 'egress';
  for (const { metadata } of f.maps.values()) {
    metadata.bytes_key = metadata.key_size;
    delete metadata.key_size;
    metadata.bytes_value = metadata.value_size;
    delete metadata.value_size;
    metadata.flags = metadata.map_flags;
    delete metadata.map_flags;
  }
  const result = await inspectEffective(f.p, 'network-check', f.run);
  assert.equal(result.stableMapSha256, original);
  assert.equal(result.attachments[0].attach_type, 'ingress');
  assert.equal(result.maps[0].metadata.bytes_key, 8);
});

test('fingerprint excludes volatile IDs but binds metadata and actual dump values', () => {
  const a = mapFixture(),
    b = mapFixture(22);
  b.metadata.name = 'second';
  const first = stableMapFingerprint([a, b]);
  const reordered = clone([b, a]);
  for (const item of reordered) {
    item.metadata.id += 100;
    item.metadata.btf_id = 900;
    item.metadata.loaded_at = 'later';
    item.entries.reverse();
  }
  assert.equal(stableMapFingerprint(reordered), first);
  for (const [key, value] of [
    ['type', 'hash'],
    ['key_size', 9],
    ['value_size', 2],
    ['max_entries', 9],
    ['map_flags', 2],
    ['name', 'changed'],
  ]) {
    const changed = clone([a, b]);
    changed[0].metadata[key] = value;
    assert.notEqual(stableMapFingerprint(changed), first);
  }
  const changed = clone([a, b]);
  changed[0].entries[0].value = ['0x00'];
  assert.notEqual(stableMapFingerprint(changed), first);
  const changedKey = clone([a, b]);
  changedKey[0].entries[0].key.reverse();
  assert.notEqual(stableMapFingerprint(changedKey), first);
});

test('metadata aliases require strict type and value agreement when both appear', () => {
  for (const [key, alias] of [
    ['key_size', 'bytes_key'],
    ['value_size', 'bytes_value'],
    ['map_flags', 'flags'],
  ]) {
    const a = mapFixture(),
      before = stableMapFingerprint([a]);
    a.metadata[alias] = a.metadata[key];
    assert.equal(stableMapFingerprint([a]), before);
    a.metadata[alias] += 1;
    assert.throws(() => stableMapFingerprint([a]), /bpf_metadata_conflict/);
    a.metadata[alias] = String(a.metadata[key]);
    assert.throws(() => stableMapFingerprint([a]), /bpf_metadata_conflict/);
  }
  const a = mapFixture();
  delete a.metadata.key_size;
  a.metadata.keySize = 8;
  assert.throws(() => stableMapFingerprint([a]), /bpf_map_metadata/);
  assert.throws(() => stableMapFingerprint([]), /bpf_map_count/);
  assert.throws(
    () => stableMapFingerprint(Array(17).fill(mapFixture())),
    /bpf_map_count/,
  );
  assert.throws(
    () =>
      stableMapFingerprint([{ metadata: mapFixture().metadata, entries: {} }]),
    /bpf_map_dump/,
  );
});

for (const [name, mutate, error] of [
  [
    'memory drift',
    (f) => f.files.set(f.base + '/memory.max', 'max'),
    /kernel_memoryMax/,
  ],
  [
    'swap drift',
    (f) => f.files.set(f.base + '/memory.swap.max', '1'),
    /kernel_memorySwapMax/,
  ],
  [
    'tasks drift',
    (f) => f.files.set(f.base + '/pids.max', 'max'),
    /kernel_tasksMax/,
  ],
  [
    'foreign uid',
    (f) =>
      f.files.set(
        '/proc/321/status',
        'Uid:\t0\t0\t0\t0\nGid:\t997\t997\t997\t997\n',
      ),
    /process_identity/,
  ],
  [
    'foreign cgroup',
    (f) =>
      f.files.set('/proc/321/cgroup', '0::/system.slice/foreign.service\n'),
    /process_cgroup/,
  ],
  [
    'v1 hierarchy',
    (f) => f.files.set('/proc/321/cgroup', '1:memory:/foreign\n'),
    /process_cgroup/,
  ],
  [
    'host runner namespace',
    (f) => f.namespaces.set('/proc/321/ns/net', 'net:[100]'),
    /network_namespace/,
  ],
  [
    'symlink cgroup',
    (f) => {
      f.realPath = '/sys/fs/cgroup/system.slice/foreign.service';
    },
    /cgroup_path_refused/,
  ],
  [
    'missing controller',
    (f) => f.files.set(f.base + '/cgroup.controllers', 'cpu pids'),
    /cgroup_v2_controllers/,
  ],
  [
    'nonregular pseudo file',
    (f) => {
      f.isRegular = false;
    },
    /local_read_refused/,
  ],
  [
    'oversized pseudo file',
    (f) => f.files.set('/proc/321/status', 'x'.repeat(65_537)),
    /local_read_refused/,
  ],
]) {
  test('kernel observation refuses ' + name, async (t) => {
    const f = fixture(t);
    mutate(f);
    await assert.rejects(inspectEffective(f.p, 'runner', f.run), error);
    assert.equal(f.calls.length, 1);
    assert.equal(f.openFiles.size, 0);
  });
}

test('PID reuse and final namespace/property drift refuse the observation', async (t) => {
  const f = fixture(t);
  f.beforeCommand = () => {
    if (f.showCount === 2) f.files.set('/proc/321/stat', processStat('1001'));
  };
  await assert.rejects(
    inspectEffective(f.p, 'runner', f.run),
    /process_changed/,
  );
  f.showCount = 0;
  f.files.set('/proc/321/stat', processStat());
  f.beforeCommand = () => {
    if (f.showCount === 2) f.namespaces.set('/proc/321/ns/net', 'net:[102]');
  };
  await assert.rejects(
    inspectEffective(f.p, 'runner', f.run),
    /process_changed/,
  );
  f.showCount = 0;
  f.beforeCommand = () => {
    if (f.showCount === 2) f.props.MainPID = '322';
  };
  await assert.rejects(
    inspectEffective(f.p, 'runner', f.run),
    /properties_changed/,
  );
});

test('broker must stay in the observed host network namespace', async (t) => {
  const f = fixture(t, 'broker');
  f.namespaces.set('/proc/321/ns/net', 'net:[101]');
  await assert.rejects(
    inspectEffective(f.p, 'broker', f.run),
    /network_namespace/,
  );
  assert.equal(f.calls.length, 1);
});

for (const [name, mutate, error] of [
  [
    'one direction',
    (f) => {
      f.attached.pop();
    },
    /bpf_direction_missing/,
  ],
  [
    'unknown direction',
    (f) => {
      f.attached[0].attach_type = 'ingress_extra';
    },
    /bpf_attachment/,
  ],
  [
    'alias duplicate',
    (f) => {
      f.attached.push({ id: 11, attach_type: 'ingress' });
    },
    /bpf_attachment/,
  ],
  [
    'too many attachments',
    (f) => {
      f.attached = Array.from({ length: 9 }, (_, i) => ({
        id: i + 1,
        attach_type: i % 2 ? 'ingress' : 'egress',
      }));
    },
    /bpf_program_count/,
  ],
  [
    'mapless programs',
    (f) => {
      for (const p of f.programs.values()) p.map_ids = [];
    },
    /bpf_map_count/,
  ],
  [
    'too many maps',
    (f) => {
      f.programs.get(11).map_ids = Array.from({ length: 17 }, (_, i) => i + 1);
    },
    /bpf_map_count/,
  ],
  [
    'foreign program identity',
    (f) => {
      f.programs.get(11).id = 999;
    },
    /bpf_object/,
  ],
  [
    'wrong program type',
    (f) => {
      f.programs.get(11).type = 'socket_filter';
    },
    /bpf_program_type/,
  ],
  [
    'missing program tag',
    (f) => {
      delete f.programs.get(11).tag;
    },
    /bpf_program_tag/,
  ],
  [
    'malformed program tag',
    (f) => {
      f.programs.get(11).tag = 'not-a-kernel-tag';
    },
    /bpf_program_tag/,
  ],
  [
    'foreign map identity',
    (f) => {
      f.maps.get(21).metadata.id = 999;
    },
    /bpf_object/,
  ],
]) {
  test('BPF capture refuses ' + name, async (t) => {
    const f = fixture(t, 'broker');
    mutate(f);
    await assert.rejects(inspectEffective(f.p, 'broker', f.run), error);
    assert.ok(f.calls.length <= 6);
  });
}

test('changed BPF attachments refuse after bounded capture', async (t) => {
  const f = fixture(t, 'broker');
  f.beforeCommand = () => {
    if (f.cgroupCount === 2) f.attached[0].id = 13;
  };
  await assert.rejects(
    inspectEffective(f.p, 'broker', f.run),
    /bpf_attachment_changed/,
  );
});

test('only a rebuilt observed exact plan can reach any command', async () => {
  let calls = 0;
  const run = async () => {
    calls += 1;
    throw new Error('must not execute');
  };
  await assert.rejects(
    inspectEffective(plan('ILLUSTRATIVE_NOT_OBSERVED'), 'runner', run),
    /plan_not_observed/,
  );
  const changed = plan();
  changed.units.runner = 'foreign.service';
  await assert.rejects(
    inspectEffective(changed, 'runner', run),
    /plan_refused/,
  );
  await assert.rejects(
    inspectEffective(plan(), 'foreign', run),
    /role_refused/,
  );
  await assert.rejects(
    inspectEffective(plan(), 'runner', null),
    /runner_required/,
  );
  assert.equal(calls, 0);
});

test('failed/oversized command output never echoes raw contents', async (t) => {
  const f = fixture(t);
  f.output = () => {
    throw new Error('PRIVATE_SENTINEL');
  };
  await assert.rejects(inspectEffective(f.p, 'runner', f.run), {
    message: 'core_effective_command_refused',
  });
  f.output = () => 'PRIVATE_SENTINEL' + 'x'.repeat(65_536);
  await assert.rejects(inspectEffective(f.p, 'runner', f.run), {
    message: 'core_effective_output_limit',
  });
});

function filterFixture() {
  const secondMap = mapFixture(22);
  secondMap.entries[0].value = ['0x09'];
  return {
    attached: [
      { id: 11, attach_type: 'ingress' },
      { id: 12, attach_type: 'egress' },
    ],
    programs: [
      { id: 11, type: 'cgroup_skb', tag: 'abcdef1234567890', map_ids: [21] },
      { id: 12, type: 'cgroup_skb', tag: '1234567890abcdef', map_ids: [22] },
    ],
    maps: [mapFixture(21), secondMap],
  };
}
const filterHash = (f) => stableFilterSha256(f.attached, f.programs, f.maps);

test('filter fingerprint ignores volatile IDs/order but binds direction/program/map graph', () => {
  const f = filterFixture(),
    expected = filterHash(f);
  const replacement = clone(f);
  for (const entry of replacement.attached) entry.id += 100;
  for (const program of replacement.programs) {
    program.id += 100;
    program.map_ids = program.map_ids.map((id) => id + 100);
    program.tag = program.tag.toUpperCase();
    program.loaded_at = 'later';
  }
  for (const map of replacement.maps) {
    map.metadata.id += 100;
    map.entries.reverse();
  }
  replacement.attached.reverse();
  replacement.programs.reverse();
  replacement.maps.reverse();
  assert.equal(filterHash(replacement), expected);
  const alias = clone(f);
  alias.attached[0].attach_type = 'cgroup_inet_ingress';
  alias.attached[1].attach_type = 'cgroup_inet_egress';
  assert.equal(filterHash(alias), expected);
  for (const mutate of [
    (v) => {
      v.programs[0].tag = '9999999999999999';
    },
    (v) => {
      [v.attached[0].attach_type, v.attached[1].attach_type] = [
        v.attached[1].attach_type,
        v.attached[0].attach_type,
      ];
    },
    (v) => {
      [v.programs[0].map_ids, v.programs[1].map_ids] = [
        v.programs[1].map_ids,
        v.programs[0].map_ids,
      ];
    },
    (v) => {
      v.maps[0].entries[0].value = ['0xff'];
    },
  ]) {
    const changed = clone(f);
    mutate(changed);
    assert.notEqual(filterHash(changed), expected);
  }
});

test('filter fingerprint refuses absent/invalid tags and incomplete or ambiguous associations', () => {
  for (const tag of [
    undefined,
    null,
    '',
    'a'.repeat(15),
    'a'.repeat(17),
    'z'.repeat(16),
    ['abcdef1234567890'],
  ]) {
    const f = filterFixture();
    f.programs[0].tag = tag;
    assert.throws(() => filterHash(f), /bpf_program_tag/);
  }
  for (const mutate of [
    (f) => {
      f.programs.pop();
    },
    (f) => {
      f.programs[1].id = f.programs[0].id;
    },
    (f) => {
      f.programs[0].map_ids = [999];
    },
    (f) => {
      f.programs[0].map_ids = [21, 21];
    },
    (f) => {
      f.maps[1].metadata.id = f.maps[0].metadata.id;
    },
    (f) => {
      f.maps.push(mapFixture(23));
    },
    (f) => {
      f.programs[1].map_ids = [];
    },
  ]) {
    const f = filterFixture();
    mutate(f);
    assert.throws(() => filterHash(f), /bpf_(program|map)_identity/);
  }
});
