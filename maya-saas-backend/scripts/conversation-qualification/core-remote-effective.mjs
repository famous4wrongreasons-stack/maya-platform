// Read-only, bounded observations for the exact new transient unit in a reviewed
// core plan. No setup/start, credentials, network connection or BPF mutation.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import {
  buildRemotePlan,
  ROLE_NAMES,
  roleProperties,
} from './core-remote-plan.mjs';

export const EFFECTIVE_PROPERTIES = Object.freeze([
  'ActiveState',
  'MainPID',
  'ControlGroup',
  'User',
  'Group',
  'MemoryMax',
  'MemorySwapMax',
  'TasksMax',
  'KillMode',
  'PrivateNetwork',
  'NoNewPrivileges',
  'ProtectSystem',
  'IPAddressAllow',
  'IPAddressDeny',
  'Description',
]);
const MAX_OUTPUT = 65_536;
const COMMAND_LIMITS = Object.freeze({
  timeoutMs: 5000,
  maxBuffer: MAX_OUTPUT,
});
const requireThat = (condition, code) => {
  if (!condition) throw new Error('core_effective_' + code);
};
const record = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const canonical = (v) =>
  JSON.stringify(Array.isArray(v) ? v.map(normalized) : normalized(v));
function normalized(v) {
  if (Array.isArray(v)) return v.map(normalized);
  if (!record(v)) return v;
  return Object.fromEntries(
    Object.keys(v)
      .sort()
      .map((key) => [key, normalized(v[key])]),
  );
}
function validatedPlan(plan, role) {
  requireThat(ROLE_NAMES.includes(role), 'role_refused');
  let expected;
  try {
    expected = buildRemotePlan(plan?.input);
  } catch {
    throw new Error('core_effective_plan_refused');
  }
  requireThat(canonical(plan) === canonical(expected), 'plan_refused');
  return expected;
}
function decimal(value, code, positive = false) {
  requireThat(
    typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value),
    code,
  );
  const number = Number(value);
  requireThat(
    Number.isSafeInteger(number) && number >= (positive ? 1 : 0),
    code,
  );
  return number;
}
function tokens(value) {
  requireThat(typeof value === 'string', 'properties_refused');
  return value.trim() ? value.trim().split(/\s+/).sort() : [];
}
export function parseEffectiveProperties(stdout) {
  requireThat(
    typeof stdout === 'string' && Buffer.byteLength(stdout) <= MAX_OUTPUT,
    'output_limit',
  );
  const result = {};
  for (const line of stdout.trimEnd().split('\n')) {
    const at = line.indexOf('=');
    requireThat(at > 0, 'properties_refused');
    const key = line.slice(0, at);
    requireThat(
      EFFECTIVE_PROPERTIES.includes(key) && !Object.hasOwn(result, key),
      'properties_refused',
    );
    result[key] = line.slice(at + 1);
  }
  requireThat(
    Object.keys(result).length === EFFECTIVE_PROPERTIES.length,
    'properties_refused',
  );
  return result;
}

/** Pure property validator. Declarations alone do not establish kernel state. */
export function validateEffectiveProperties(plan, role, properties) {
  const p = validatedPlan(plan, role);
  requireThat(
    record(properties) &&
      Object.keys(properties).length === EFFECTIVE_PROPERTIES.length &&
      EFFECTIVE_PROPERTIES.every(
        (key) =>
          Object.hasOwn(properties, key) && typeof properties[key] === 'string',
      ),
    'properties_refused',
  );
  const expected = Object.fromEntries(
    roleProperties(p, role).map((entry) => {
      const at = entry.indexOf('=');
      return [entry.slice(0, at), entry.slice(at + 1)];
    }),
  );
  const unit = p.units[role];
  const controlGroup = '/system.slice/' + unit;
  requireThat(properties.ActiveState === 'active', 'unit_inactive');
  const mainPid = decimal(properties.MainPID, 'pid_refused', true);
  requireThat(mainPid <= 2_147_483_647, 'pid_refused');
  requireThat(properties.ControlGroup === controlGroup, 'cgroup_refused');
  requireThat(
    properties.Description === `MAYA core ${p.input.runId} ${role}`,
    'description_refused',
  );
  for (const key of [
    'User',
    'Group',
    'MemorySwapMax',
    'TasksMax',
    'KillMode',
    'PrivateNetwork',
    'NoNewPrivileges',
    'ProtectSystem',
  ])
    requireThat(properties[key] === expected[key], 'property_' + key);
  requireThat(/^[1-9][0-9]*M$/.test(expected.MemoryMax), 'memory_refused');
  const memoryMax = Number(expected.MemoryMax.slice(0, -1)) * 1024 * 1024;
  requireThat(properties.MemoryMax === String(memoryMax), 'property_MemoryMax');
  const allow = tokens(properties.IPAddressAllow);
  const deny = tokens(properties.IPAddressDeny);
  if (role === 'network-check' || role === 'broker') {
    requireThat(
      canonical(allow) === canonical(tokens(expected.IPAddressAllow)),
      'address_allow_refused',
    );
    requireThat(
      canonical(deny) === canonical(['any']) ||
        canonical(deny) === canonical(['0.0.0.0/0', '::/0']),
      'address_deny_refused',
    );
  } else {
    requireThat(
      allow.length === 0 && deny.length === 0,
      'unexpected_address_policy',
    );
  }
  return Object.freeze({
    unit,
    controlGroup,
    mainPid,
    uid: decimal(properties.User, 'uid_refused', true),
    gid: decimal(properties.Group, 'gid_refused', true),
    memoryMax,
    memorySwapMax: 0,
    tasksMax: decimal(properties.TasksMax, 'tasks_refused', true),
    privateNetwork: properties.PrivateNetwork === 'yes',
  });
}

function readBounded(file) {
  let fd;
  try {
    fd = fs.openSync(
      file,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
    );
    const stat = fs.fstatSync(fd);
    requireThat(stat.isFile() && stat.size <= MAX_OUTPUT, 'local_file_refused');
    const buffer = Buffer.alloc(MAX_OUTPUT + 1);
    let size = 0;
    while (size < buffer.length) {
      const count = fs.readSync(fd, buffer, size, buffer.length - size, size);
      requireThat(
        Number.isSafeInteger(count) &&
          count >= 0 &&
          count <= buffer.length - size,
        'local_read_refused',
      );
      if (count === 0) break;
      size += count;
    }
    requireThat(size <= MAX_OUTPUT, 'output_limit');
    return buffer.subarray(0, size).toString('utf8');
  } catch {
    throw new Error('core_effective_local_read_refused');
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        throw new Error('core_effective_local_read_refused');
      }
    }
  }
}
function namespace(pid) {
  let value;
  try {
    value = fs.readlinkSync(`/proc/${pid}/ns/net`);
  } catch {
    throw new Error('core_effective_namespace_unavailable');
  }
  requireThat(
    typeof value === 'string' && /^net:\[[1-9][0-9]*\]$/.test(value),
    'namespace_refused',
  );
  return value;
}
function localSnapshot(expected) {
  const base = '/sys/fs/cgroup' + expected.controlGroup;
  let actual;
  try {
    actual = fs.realpathSync(base);
  } catch {
    throw new Error('core_effective_cgroup_unavailable');
  }
  requireThat(actual === base, 'cgroup_path_refused');
  // The exact unit directory must expose the unified hierarchy controller file.
  const controllers = tokens(readBounded(base + '/cgroup.controllers'));
  requireThat(
    controllers.includes('memory') && controllers.includes('pids'),
    'cgroup_v2_controllers',
  );
  const kernel = {
    memoryMax: readBounded(base + '/memory.max').trim(),
    memorySwapMax: readBounded(base + '/memory.swap.max').trim(),
    tasksMax: readBounded(base + '/pids.max').trim(),
  };
  for (const key of Object.keys(kernel))
    requireThat(kernel[key] === String(expected[key]), 'kernel_' + key);
  const pid = expected.mainPid;
  const status = readBounded(`/proc/${pid}/status`);
  for (const [key, value] of [
    ['Uid', expected.uid],
    ['Gid', expected.gid],
  ]) {
    const matches = [
      ...status.matchAll(new RegExp('^' + key + ':\\s*([^\\n]+)$', 'gm')),
    ];
    requireThat(matches.length === 1, 'process_identity');
    const ids = matches[0][1].trim().split(/\s+/);
    requireThat(
      ids.length === 4 && ids.every((id) => id === String(value)),
      'process_identity',
    );
  }
  const membership = readBounded(`/proc/${pid}/cgroup`).trim().split('\n');
  requireThat(
    membership.length === 1 && membership[0] === '0::' + expected.controlGroup,
    'process_cgroup',
  );
  const stat = readBounded(`/proc/${pid}/stat`).trim();
  const end = stat.lastIndexOf(')');
  requireThat(stat.startsWith(`${pid} (`) && end > 0, 'process_stat');
  const startTicks = stat
    .slice(end + 1)
    .trim()
    .split(/\s+/)[19];
  requireThat(
    typeof startTicks === 'string' && /^[1-9][0-9]*$/.test(startTicks),
    'process_stat',
  );
  const hostNetworkNamespace = namespace(1);
  const processNetworkNamespace = namespace(pid);
  requireThat(
    expected.privateNetwork
      ? processNetworkNamespace !== hostNetworkNamespace
      : processNetworkNamespace === hostNetworkNamespace,
    'network_namespace',
  );
  return {
    pid,
    uid: expected.uid,
    gid: expected.gid,
    startTicks,
    controlGroup: expected.controlGroup,
    kernel,
    hostNetworkNamespace,
    processNetworkNamespace,
  };
}
function numericId(value) {
  requireThat(
    Number.isSafeInteger(value) && value > 0 && value <= 4_294_967_295,
    'bpf_id',
  );
  return value;
}
function oneObject(value, id) {
  const row = Array.isArray(value)
    ? value.length === 1
      ? value[0]
      : null
    : value;
  requireThat(record(row) && row.id === id, 'bpf_object');
  return row;
}
function attachmentDirection(value) {
  const aliases = {
    ingress: 'cgroup_inet_ingress',
    egress: 'cgroup_inet_egress',
    cgroup_inet_ingress: 'cgroup_inet_ingress',
    cgroup_inet_egress: 'cgroup_inet_egress',
  };
  requireThat(
    typeof value === 'string' && Object.hasOwn(aliases, value),
    'bpf_attachment',
  );
  return aliases[value];
}
function attachments(value) {
  requireThat(
    Array.isArray(value) && value.length > 0 && value.length <= 8,
    'bpf_program_count',
  );
  const seen = new Set();
  for (const row of value) {
    requireThat(record(row), 'bpf_attachment');
    numericId(row.id);
    const key = row.id + ':' + attachmentDirection(row.attach_type);
    requireThat(!seen.has(key), 'bpf_attachment');
    seen.add(key);
  }
  for (const direction of ['cgroup_inet_ingress', 'cgroup_inet_egress'])
    requireThat(
      value.some((row) => attachmentDirection(row.attach_type) === direction),
      'bpf_direction_missing',
    );
  return value;
}
function sorted(values) {
  // Code-point ordering avoids locale/ICU differences across setup and start.
  return [...values].sort((a, b) => {
    const left = canonical(a),
      right = canonical(b);
    return left < right ? -1 : left > right ? 1 : 0;
  });
}
function metadataAlias(metadata, key, alias, optional = false) {
  const hasKey = Object.hasOwn(metadata, key);
  const hasAlias = Object.hasOwn(metadata, alias);
  requireThat(optional || hasKey || hasAlias, 'bpf_map_metadata');
  requireThat(
    !hasKey || !hasAlias || metadata[key] === metadata[alias],
    'bpf_metadata_conflict',
  );
  const value = hasKey ? metadata[key] : metadata[alias];
  if (!hasKey && !hasAlias) return undefined;
  requireThat(Number.isSafeInteger(value) && value >= 0, 'bpf_map_metadata');
  return value;
}
/** IDs and volatile load metadata are deliberately absent. Raw dump values are
 * not decoded into network rules. Equality still requires human map review. */
export function stableMapFingerprint(maps) {
  requireThat(
    Array.isArray(maps) && maps.length > 0 && maps.length <= 16,
    'bpf_map_count',
  );
  requireThat(maps.every(record), 'bpf_map_metadata');
  const projection = maps.map(({ metadata, entries }) => {
    requireThat(
      record(metadata) &&
        typeof metadata.type === 'string' &&
        /^[a-z0-9_]{1,64}$/.test(metadata.type),
      'bpf_map_metadata',
    );
    const keySize = metadataAlias(metadata, 'key_size', 'bytes_key');
    const valueSize = metadataAlias(metadata, 'value_size', 'bytes_value');
    const flags = metadataAlias(metadata, 'map_flags', 'flags', true);
    requireThat(
      Number.isSafeInteger(metadata.max_entries) && metadata.max_entries >= 0,
      'bpf_map_metadata',
    );
    requireThat(Array.isArray(entries), 'bpf_map_dump');
    if (Object.hasOwn(metadata, 'name'))
      requireThat(
        typeof metadata.name === 'string' &&
          /^[A-Za-z0-9_.-]{1,128}$/.test(metadata.name),
        'bpf_map_metadata',
      );
    return {
      type: metadata.type,
      key_size: keySize,
      value_size: valueSize,
      max_entries: metadata.max_entries,
      ...(flags === undefined ? {} : { map_flags: flags }),
      ...(Object.hasOwn(metadata, 'name') ? { name: metadata.name } : {}),
      entries: sorted(entries),
    };
  });
  return createHash('sha256')
    .update(canonical(sorted(projection)))
    .digest('hex');
}

function programTag(program) {
  requireThat(program.type === 'cgroup_skb', 'bpf_program_type');
  requireThat(
    typeof program.tag === 'string' && /^[a-f0-9]{16}$/i.test(program.tag),
    'bpf_program_tag',
  );
  return program.tag.toLowerCase();
}

/** Binds direction -> program tag -> actual map contents without volatile IDs.
 * The kernel tag is evidence, not an interpretation of network policy. */
export function stableFilterSha256(attached, programs, maps) {
  attachments(attached);
  requireThat(
    Array.isArray(programs) && programs.length > 0 && programs.length <= 8,
    'bpf_program_count',
  );
  requireThat(
    Array.isArray(maps) && maps.length > 0 && maps.length <= 16,
    'bpf_map_count',
  );
  const mapDigests = new Map();
  for (const map of maps) {
    requireThat(record(map) && record(map.metadata), 'bpf_map_metadata');
    const id = numericId(map.metadata.id);
    requireThat(!mapDigests.has(id), 'bpf_map_identity');
    mapDigests.set(id, stableMapFingerprint([map]));
  }
  const expectedIds = new Set(attached.map((entry) => entry.id));
  const byId = new Map(),
    usedMaps = new Set();
  for (const program of programs) {
    requireThat(record(program), 'bpf_object');
    const id = numericId(program.id);
    requireThat(expectedIds.has(id) && !byId.has(id), 'bpf_program_identity');
    const tag = programTag(program);
    const refs = program.map_ids ?? [];
    requireThat(Array.isArray(refs) && refs.length <= 16, 'bpf_map_count');
    const seen = new Set();
    const digests = refs.map((ref) => {
      numericId(ref);
      requireThat(mapDigests.has(ref) && !seen.has(ref), 'bpf_map_identity');
      seen.add(ref);
      usedMaps.add(ref);
      return mapDigests.get(ref);
    });
    byId.set(id, {
      programType: 'cgroup_skb',
      programTag: tag,
      maps: digests.sort(),
    });
  }
  requireThat(byId.size === expectedIds.size, 'bpf_program_identity');
  requireThat(usedMaps.size === mapDigests.size, 'bpf_map_identity');
  const projection = attached.map((entry) => ({
    direction: attachmentDirection(entry.attach_type),
    ...byId.get(entry.id),
  }));
  return createHash('sha256')
    .update(canonical(sorted(projection)))
    .digest('hex');
}

export async function inspectEffective(plan, role, run) {
  const p = validatedPlan(plan, role);
  requireThat(p.executable === true, 'plan_not_observed');
  requireThat(typeof run === 'function', 'runner_required');
  const commands = [];
  const invoke = async (command, args, json = false) => {
    let stdout;
    try {
      stdout = await run(command, [...args], { ...COMMAND_LIMITS });
    } catch {
      throw new Error('core_effective_command_refused');
    }
    requireThat(
      typeof stdout === 'string' && Buffer.byteLength(stdout) <= MAX_OUTPUT,
      'output_limit',
    );
    commands.push({
      command,
      args,
      bytes: Buffer.byteLength(stdout),
      sha256: createHash('sha256').update(stdout).digest('hex'),
    });
    if (!json) return stdout;
    try {
      return JSON.parse(stdout);
    } catch {
      throw new Error('core_effective_json_refused');
    }
  };
  const show = async () =>
    parseEffectiveProperties(
      await invoke('/usr/bin/systemctl', [
        'show',
        p.units[role],
        '--no-pager',
        '--property=' + EFFECTIVE_PROPERTIES.join(','),
      ]),
    );
  const properties = await show();
  const expected = validateEffectiveProperties(p, role, properties);
  const initial = localSnapshot(expected);
  const needsBpf = role === 'network-check' || role === 'broker';
  let attached = [],
    programs = [],
    maps = [],
    stableMapSha256 = null,
    filterFingerprint = null;
  if (needsBpf) {
    const command = p.input.binaries.bpftool;
    const args = [
      '-j',
      'cgroup',
      'show',
      '/sys/fs/cgroup' + expected.controlGroup,
    ];
    attached = attachments(await invoke(command, args, true));
    const ids = [...new Set(attached.map((entry) => entry.id))].sort(
      (a, b) => a - b,
    );
    const mapIds = new Set();
    for (const id of ids) {
      const program = oneObject(
        await invoke(command, ['-j', 'prog', 'show', 'id', String(id)], true),
        id,
      );
      programTag(program);
      const references = program.map_ids ?? [];
      requireThat(
        Array.isArray(references) && references.length <= 16,
        'bpf_map_count',
      );
      for (const mapId of references) mapIds.add(numericId(mapId));
      requireThat(mapIds.size <= 16, 'bpf_map_count');
      programs.push(program);
    }
    requireThat(mapIds.size > 0, 'bpf_map_count');
    for (const id of [...mapIds].sort((a, b) => a - b)) {
      const metadata = oneObject(
        await invoke(command, ['-j', 'map', 'show', 'id', String(id)], true),
        id,
      );
      const entries = await invoke(
        command,
        ['-j', 'map', 'dump', 'id', String(id)],
        true,
      );
      maps.push({ metadata, entries });
    }
    stableMapSha256 = stableMapFingerprint(maps);
    filterFingerprint = stableFilterSha256(attached, programs, maps);
    const last = attachments(await invoke(command, args, true));
    requireThat(
      canonical(sorted(attached)) === canonical(sorted(last)),
      'bpf_attachment_changed',
    );
  }
  const finalProperties = await show();
  validateEffectiveProperties(p, role, finalProperties);
  requireThat(
    canonical(properties) === canonical(finalProperties),
    'properties_changed',
  );
  const final = localSnapshot(expected);
  requireThat(canonical(initial) === canonical(final), 'process_changed');
  return {
    contract: 'maya.core-remote-effective/1',
    role,
    unit: expected.unit,
    properties,
    process: final,
    commands,
    attachments: attached,
    programs,
    maps,
    stableMapSha256,
    stableFilterSha256: filterFingerprint,
    effectivePropertiesVerified: true,
    requiresHumanMapReview: needsBpf,
    semanticPolicyVerified: false,
    networkQualification: needsBpf
      ? 'address-filter-not-port443'
      : 'private-network-no-connectivity-test',
    port443Verified: false,
    noConnectionsAttempted: true,
    pointInTimeOnly: true,
    executionAuthority: false,
  };
}
