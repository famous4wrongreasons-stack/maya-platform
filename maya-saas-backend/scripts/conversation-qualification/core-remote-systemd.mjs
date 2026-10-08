/** Pure generator for a new, explicitly reviewed transient proof profile.
 * No commands, services, files, credentials, network or remote host are opened.
 * Declarations do not establish that the target supports/enforces these settings.
 */
import path from 'node:path';

const ROLES = ['prepare', 'runner', 'runner-check', 'broker', 'broker-check'];
const PATHS = [
  'checkout',
  'workDirectory',
  'root',
  'runnerHome',
  'brokerHome',
  'runnerEvidence',
  'brokerEvidence',
  'socketDirectory',
  'control',
  'hosts',
  'credential',
];
const USERS = ['runnerUid', 'runnerGid', 'brokerUid', 'brokerGid'];
const RESOURCE_MAX = Object.freeze({
  runnerHeapMb: 3072,
  runnerMemoryMaxMb: 4096,
  brokerHeapMb: 256,
  brokerMemoryMaxMb: 512,
  runnerTasksMax: 256,
  brokerTasksMax: 64,
  runnerCpuPercent: 200,
  brokerCpuPercent: 100,
});
function requireThat(condition) {
  if (!condition) throw new Error('core_systemd_properties_refused');
}
function record(value, keys) {
  requireThat(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length === keys.length &&
      keys.every((key) => Object.hasOwn(value, key)),
  );
}
function safePath(value) {
  // No systemd specifiers, mount delimiters, optional-path prefixes, globs,
  // quoting, whitespace, shell expressions or control characters are admitted.
  requireThat(
    typeof value === 'string' &&
      value.length <= 4096 &&
      /^\/[a-zA-Z0-9_./-]+$/.test(value) &&
      !/[\u0000-\u0020\u007f]/.test(value) &&
      !value.endsWith('/') &&
      path.posix.normalize(value) === value,
  );
}
function ipv4(value) {
  requireThat(typeof value === 'string');
  const octets = value.split('.');
  requireThat(
    octets.length === 4 &&
      octets.every(
        (part) =>
          /^(0|[1-9][0-9]{0,2})$/.test(part) &&
          String(Number(part)) === part &&
          Number(part) <= 255,
      ),
  );
}

export function serviceProperties(input) {
  record(input, ['role', 'paths', 'users', 'resources', 'network']);
  const { role, paths, users, resources, network } = input;
  requireThat(ROLES.includes(role));
  record(paths, PATHS);
  for (const value of Object.values(paths)) safePath(value);
  record(users, USERS);
  for (const value of Object.values(users)) {
    requireThat(
      Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647,
    );
  }
  requireThat(users.runnerUid !== users.brokerUid);
  record(resources, Object.keys(RESOURCE_MAX));
  for (const [key, maximum] of Object.entries(RESOURCE_MAX)) {
    requireThat(
      Number.isSafeInteger(resources[key]) &&
        resources[key] > 0 &&
        resources[key] <= maximum,
    );
  }
  requireThat(resources.runnerHeapMb < resources.runnerMemoryMaxMb);
  requireThat(resources.brokerHeapMb < resources.brokerMemoryMaxMb);
  record(network, ['providerIpv4']);
  requireThat(
    Array.isArray(network.providerIpv4) &&
      network.providerIpv4.length > 0 &&
      network.providerIpv4.length <= 8,
  );
  network.providerIpv4.forEach(ipv4);
  requireThat(
    new Set(network.providerIpv4).size === network.providerIpv4.length,
  );

  const brokerPrincipal = role === 'broker' || role === 'broker-check';
  const principal = brokerPrincipal ? 'broker' : 'runner';
  const liveBroker = role === 'broker';
  const lifetime = {
    prepare: 120,
    runner: 660,
    'runner-check': 60,
    broker: 600,
    'broker-check': 60,
  }[role];
  const writable = liveBroker
    ? [paths.brokerEvidence, paths.control, paths.socketDirectory]
    : [brokerPrincipal ? paths.brokerEvidence : paths.runnerEvidence];

  // ProtectSystem=strict makes the remaining namespace read-only. Filesystem
  // owner/mode and nonoverlapping path placement are verified by the controller.
  const properties = [
    'Type=exec',
    'Restart=no',
    'KillMode=control-group',
    'TimeoutStopSec=10s',
    'SendSIGKILL=yes',
    'StandardOutput=null',
    'StandardError=null',
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
    `User=${users[principal + 'Uid']}`,
    `Group=${users[principal + 'Gid']}`,
    `WorkingDirectory=${paths.workDirectory}`,
    `Environment=HOME=${paths[principal + 'Home']} TZ=UTC NODE_ENV=test NODE_OPTIONS=--max-old-space-size=${resources[principal + 'HeapMb']}`,
    'MemoryAccounting=yes',
    'TasksAccounting=yes',
    'CPUAccounting=yes',
    `MemoryMax=${resources[principal + 'MemoryMaxMb']}M`,
    `TasksMax=${resources[principal + 'TasksMax']}`,
    `CPUQuota=${resources[principal + 'CpuPercent']}%`,
    `RuntimeMaxSec=${lifetime}s`,
    `ReadWritePaths=${writable.join(' ')}`,
  ];
  if (liveBroker) {
    properties.push(
      'PrivateNetwork=no',
      'RestrictAddressFamilies=AF_UNIX AF_INET',
      'IPAddressDeny=any',
      `IPAddressAllow=${network.providerIpv4.map((ip) => ip + '/32').join(' ')}`,
      `BindReadOnlyPaths=${paths.hosts}:/etc/hosts`,
    );
  } else {
    properties.push(
      'PrivateNetwork=yes',
      role === 'broker-check'
        ? 'RestrictAddressFamilies=AF_UNIX'
        : 'RestrictAddressFamilies=AF_UNIX AF_INET',
    );
    if (role === 'prepare' || role === 'runner') {
      properties.push(`InaccessiblePaths=${paths.credential}`);
    } else if (brokerPrincipal) {
      properties.push(`BindReadOnlyPaths=${paths.hosts}:/etc/hosts`);
    }
  }
  return Object.freeze(properties);
}
