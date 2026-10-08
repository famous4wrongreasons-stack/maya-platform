// Metadata-only observation inside an explicitly launched Linux proof unit.
// No credential contents, DNS, sockets, provider requests or service operations.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { buildRemotePlan, canonical, digest } from './core-remote-plan.mjs';

const PLAN_MAX = 128 * 1024;
const PROC_MAX = 64 * 1024;
const ROLES = ['runner-check', 'broker-check', 'network-check'];
const requireThat = (condition, code) => {
  if (!condition) throw new Error('core_remote_observe_' + code);
};
const numericId = (value) =>
  Number.isSafeInteger(value) && value >= 0 && value <= 0x7fffffff;
const absolute = (value) =>
  typeof value === 'string' &&
  value.length <= 4096 &&
  /^\/[A-Za-z0-9_./-]+$/.test(value) &&
  !/[\u0000-\u0020\u007f]/.test(value) &&
  path.posix.normalize(value) === value &&
  !value.endsWith('/');

export function observerArguments(args) {
  let values;
  try {
    ({ values } = parseArgs({
      args,
      strict: true,
      allowPositionals: false,
      options: {
        plan: { type: 'string' },
        sha256: { type: 'string' },
        role: { type: 'string' },
        output: { type: 'string' },
        'hold-ms': { type: 'string' },
      },
    }));
  } catch {
    throw new Error('core_remote_observe_arguments');
  }
  requireThat(
    absolute(values.plan) &&
      absolute(values.output) &&
      values.sha256?.length === 64 &&
      /^[a-f0-9]{64}$/.test(values.sha256 ?? '') &&
      ROLES.includes(values.role),
    'arguments',
  );
  let holdMs = 0;
  if (values['hold-ms'] !== undefined) {
    requireThat(/^[1-9][0-9]{0,4}$/.test(values['hold-ms']), 'arguments');
    holdMs = Number(values['hold-ms']);
    requireThat(
      holdMs <= 60000 && String(holdMs) === values['hold-ms'],
      'arguments',
    );
  }
  return {
    planPath: values.plan,
    sha256: values.sha256,
    role: values.role,
    output: values.output,
    holdMs,
  };
}

export function validateObserverPlan(raw, sha256) {
  try {
    requireThat(
      Buffer.isBuffer(raw) &&
        raw.length > 0 &&
        raw.length <= PLAN_MAX &&
        /^[a-f0-9]{64}$/.test(sha256) &&
        digest(raw) === sha256,
      'plan',
    );
    const text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
    const parsed = JSON.parse(text);
    requireThat(text === canonical(parsed), 'plan');
    const rebuilt = buildRemotePlan(parsed.input);
    requireThat(
      text === canonical(rebuilt) && rebuilt.executable === true,
      'plan',
    );
    return rebuilt;
  } catch {
    throw new Error('core_remote_observe_plan');
  }
}

export function expectedHosts(plan) {
  return (
    '127.0.0.1 localhost\n' +
    plan.input.network.providerIpv4
      .map((ip) => `${ip} api.deepseek.com\n`)
      .join('')
  );
}
export function validateHosts(plan, bytes) {
  requireThat(
    Buffer.isBuffer(bytes) && bytes.equals(Buffer.from(expectedHosts(plan))),
    'hosts',
  );
  return true;
}

/** Only access denial proves unreadability. Missing paths and other I/O failures
 * must not masquerade as a successful runner isolation observation. */
export function credentialReadableFromAccessError(code) {
  if (code === null) return true;
  requireThat(code === 'EACCES' || code === 'EPERM', 'credential_access');
  return false;
}
export function validateCredentialMetadata(metadata, owner) {
  requireThat(
    metadata &&
      metadata.regularFile === true &&
      metadata.symlink === false &&
      metadata.nlink === 1 &&
      metadata.owner === owner &&
      numericId(metadata.gid) &&
      Number.isSafeInteger(metadata.mode) &&
      metadata.mode >= 0 &&
      metadata.mode <= 0o7777 &&
      (metadata.mode & 0o022) === 0,
    'credential_metadata',
  );
  return {
    regularFile: true,
    owner: metadata.owner,
    gid: metadata.gid,
    mode: metadata.mode,
    nlink: 1,
  };
}

function routeLines(text) {
  requireThat(
    typeof text === 'string' &&
      Buffer.byteLength(text) <= PROC_MAX &&
      !text.includes('\0'),
    'routes',
  );
  const lines = text.trim() ? text.trim().split('\n') : [];
  requireThat(lines.length <= 513, 'routes');
  return lines.map((line) => line.trim().split(/\s+/));
}
const iface = (name) =>
  typeof name === 'string' &&
  name !== '.' &&
  name !== '..' &&
  /^[A-Za-z0-9_.:@-]{1,32}$/.test(name) &&
  !/[\u0000-\u0020\u007f]/.test(name);
const hex = (text, size) =>
  typeof text === 'string' &&
  new RegExp('^[a-fA-F0-9]{' + size + '}$').test(text);
export function interfaceFlags(text) {
  requireThat(
    typeof text === 'string' &&
      /^0x[0-9a-fA-F]{1,8}\n$/.exec(text)?.[0] === text,
    'interfaces',
  );
  return parseInt(text.slice(2), 16);
}
export function networkSummary(interfaces, ipv4Text, ipv6Text) {
  requireThat(
    interfaces && typeof interfaces === 'object' && !Array.isArray(interfaces),
    'interfaces',
  );
  const entries = Object.entries(interfaces);
  requireThat(entries.length > 0 && entries.length <= 32, 'interfaces');
  const loopbackNames = new Set();
  for (const [name, flags] of entries) {
    requireThat(
      iface(name) &&
        Number.isSafeInteger(flags) &&
        flags >= 0 &&
        flags <= 0xffffffff,
      'interfaces',
    );
    if (flags & 0x8) loopbackNames.add(name);
  }
  requireThat(loopbackNames.size > 0, 'interfaces');
  const interfaceCount = entries.length;
  const nonLoopbackInterfaceCount = interfaceCount - loopbackNames.size;
  const v4 = routeLines(ipv4Text);
  requireThat(
    v4.length > 0 &&
      v4.shift().join(' ') ===
        'Iface Destination Gateway Flags RefCnt Use Metric Mask MTU Window IRTT',
    'routes',
  );
  let ipv4NonLoopbackRouteCount = 0,
    ipv4DefaultRouteCount = 0;
  for (const row of v4) {
    requireThat(
      row.length === 11 &&
        iface(row[0]) &&
        [row[1], row[2], row[7]].every((value) => hex(value, 8)) &&
        /^[a-fA-F0-9]{1,8}$/.test(row[3]) &&
        [row[4], row[5], row[6], row[8], row[9], row[10]].every((value) =>
          /^[0-9]{1,10}$/.test(value),
        ),
      'routes',
    );
    if (!loopbackNames.has(row[0])) {
      ipv4NonLoopbackRouteCount++;
      if (
        parseInt(row[3], 16) & 1 &&
        row[1] === '00000000' &&
        row[7] === '00000000'
      )
        ipv4DefaultRouteCount++;
    }
  }
  const v6 = routeLines(ipv6Text);
  let ipv6NonLoopbackRouteCount = 0,
    ipv6DefaultRouteCount = 0;
  for (const row of v6) {
    requireThat(
      row.length === 10 &&
        [row[0], row[2], row[4]].every((value) => hex(value, 32)) &&
        [row[1], row[3]].every(
          (value) => hex(value, 2) && parseInt(value, 16) <= 128,
        ) &&
        [row[5], row[6], row[7], row[8]].every((value) => hex(value, 8)) &&
        iface(row[9]),
      'routes',
    );
    if (!loopbackNames.has(row[9])) {
      ipv6NonLoopbackRouteCount++;
      if (parseInt(row[8], 16) & 1 && /^0{32}$/.test(row[0]) && row[1] === '00')
        ipv6DefaultRouteCount++;
    }
  }
  return {
    interfaceCount,
    nonLoopbackInterfaceCount,
    ipv4RouteCount: v4.length,
    ipv4NonLoopbackRouteCount,
    ipv4DefaultRouteCount,
    ipv6RouteCount: v6.length,
    ipv6NonLoopbackRouteCount,
    ipv6DefaultRouteCount,
    loopbackOnly:
      nonLoopbackInterfaceCount === 0 &&
      ipv4NonLoopbackRouteCount === 0 &&
      ipv6NonLoopbackRouteCount === 0,
  };
}

export function validateObserverFacts(plan, role, facts) {
  requireThat(ROLES.includes(role), 'role');
  const principal = role === 'runner-check' ? 'runner' : 'broker';
  requireThat(
    facts.platform === 'linux' &&
      facts.uid === plan.input.users[principal + 'Uid'] &&
      facts.gid === plan.input.users[principal + 'Gid'],
    'principal',
  );
  requireThat(
    Array.isArray(facts.groups) &&
      facts.groups.length > 0 &&
      facts.groups.length <= 128 &&
      facts.groups.every(numericId) &&
      facts.groups.includes(facts.gid) &&
      new Set(facts.groups).size === facts.groups.length,
    'groups',
  );
  requireThat(
    typeof facts.netNamespace === 'string' &&
      !/[\u0000-\u0020\u007f]/.test(facts.netNamespace) &&
      /^net:\[[1-9][0-9]{0,19}\]$/.test(facts.netNamespace),
    'namespace',
  );
  requireThat(
    facts.credential.readable === (principal === 'broker'),
    'credential_access',
  );
  if (principal === 'broker')
    validateCredentialMetadata(
      { ...facts.credential, symlink: false },
      plan.input.credential.owner,
    );
  requireThat(
    role === 'network-check'
      ? facts.hostsVerified === true
      : facts.network.loopbackOnly === true,
    'network',
  );
}

function fileIdentity(stat) {
  return [
    stat.dev,
    stat.ino,
    stat.uid,
    stat.gid,
    stat.mode,
    stat.nlink,
    stat.size,
    stat.mtimeMs,
    stat.ctimeMs,
  ].join(':');
}
function readBounded(file, maximum, pinned = false) {
  let fd;
  try {
    if (pinned)
      requireThat(
        fs.realpathSync(path.dirname(file)) === path.dirname(file),
        'plan',
      );
    fd = fs.openSync(
      file,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
    );
    const before = fs.fstatSync(fd);
    requireThat(before.isFile(), 'file');
    if (pinned)
      requireThat(
        before.nlink === 1 &&
          before.size > 0 &&
          before.size <= maximum &&
          (before.mode & 0o022) === 0,
        'plan',
      );
    const buffer = Buffer.alloc(maximum + 1);
    let length = 0;
    while (length < buffer.length) {
      const n = fs.readSync(fd, buffer, length, buffer.length - length, null);
      if (!n) break;
      length += n;
    }
    requireThat(length <= maximum, 'file_limit');
    if (pinned)
      requireThat(
        length === before.size &&
          fileIdentity(before) === fileIdentity(fs.fstatSync(fd)) &&
          fileIdentity(before) === fileIdentity(fs.lstatSync(file)),
        'plan',
      );
    return buffer.subarray(0, length);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
function observeCredential(plan, role) {
  const file = plan.input.credential.reference;
  const broker = role !== 'runner-check';
  const before = broker ? fs.lstatSync(file) : null;
  let accessCode = null;
  try {
    fs.accessSync(file, fs.constants.R_OK);
  } catch (error) {
    accessCode = error.code;
  }
  const readable = credentialReadableFromAccessError(accessCode);
  if (!broker) return { readable };
  requireThat(
    fs.realpathSync(file) === file &&
      fileIdentity(before) === fileIdentity(fs.lstatSync(file)),
    'credential_metadata',
  );
  return {
    readable,
    ...validateCredentialMetadata(
      {
        regularFile: before.isFile(),
        symlink: before.isSymbolicLink(),
        owner: before.uid,
        gid: before.gid,
        mode: before.mode & 0o7777,
        nlink: before.nlink,
      },
      plan.input.credential.owner,
    ),
  };
}
function observeInterfaces() {
  const names = [];
  const directory = fs.opendirSync('/sys/class/net');
  try {
    let entry;
    while ((entry = directory.readSync()) !== null) {
      requireThat(names.length < 32 && iface(entry.name), 'interfaces');
      names.push(entry.name);
    }
  } finally {
    directory.closeSync();
  }
  requireThat(names.length > 0, 'interfaces');
  return Object.fromEntries(
    names
      .sort()
      .map((name) => [
        name,
        interfaceFlags(
          readBounded('/sys/class/net/' + name + '/flags', 16).toString('utf8'),
        ),
      ]),
  );
}

export async function observeMain(args = process.argv.slice(2)) {
  const options = observerArguments(args);
  requireThat(process.platform === 'linux', 'linux_required');
  const plan = validateObserverPlan(
    readBounded(options.planPath, PLAN_MAX, true),
    options.sha256,
  );
  const evidence =
    options.role === 'runner-check'
      ? plan.paths.runnerEvidence
      : plan.paths.brokerEvidence;
  requireThat(
    path.dirname(options.output) === evidence &&
      fs.realpathSync(evidence) === evidence,
    'output',
  );
  requireThat(
    process.getuid() === process.geteuid() &&
      process.getgid() === process.getegid(),
    'principal',
  );
  const facts = {
    platform: process.platform,
    uid: process.getuid(),
    gid: process.getgid(),
    groups: [...new Set([...process.getgroups(), process.getgid()])].sort(
      (a, b) => a - b,
    ),
    netNamespace: fs.readlinkSync('/proc/self/ns/net'),
    network: networkSummary(
      observeInterfaces(),
      readBounded('/proc/net/route', PROC_MAX).toString('utf8'),
      readBounded('/proc/net/ipv6_route', PROC_MAX).toString('utf8'),
    ),
    credential: observeCredential(plan, options.role),
    hostsVerified:
      options.role === 'network-check'
        ? validateHosts(plan, readBounded('/etc/hosts', 4096))
        : null,
  };
  validateObserverFacts(plan, options.role, facts);
  const report = {
    contract: 'maya.core-remote-observation/1',
    planSha256: options.sha256,
    runId: plan.input.runId,
    role: options.role,
    pid: process.pid,
    observedAt: new Date().toISOString(),
    ...facts,
    holdMs: options.holdMs,
    qualification: 'PROCESS_METADATA_ONLY_NOT_BPF_OR_MODEL_AUTHORIZATION',
  };
  const bytes = canonical(report);
  requireThat(Buffer.byteLength(bytes) <= 16384, 'report_limit');
  let fd;
  try {
    fd = fs.openSync(
      options.output,
      fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        fs.constants.O_NOFOLLOW,
      0o600,
    );
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  if (options.holdMs)
    await new Promise((resolve) => setTimeout(resolve, options.holdMs));
  return report;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  observeMain().catch((error) => {
    const code = /^core_remote_observe_[a-z_]+$/.test(error?.message ?? '')
      ? error.message
      : 'core_remote_observe_refused';
    process.stderr.write(code + '\n');
    process.exitCode = 1;
  });
}
