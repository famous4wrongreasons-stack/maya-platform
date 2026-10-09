/** Validates externally supplied, nonsecret admission records. This module never
 * issues owner authority, opens credentials, starts transport or creates a permit.
 * A valid declaration still requires separate owner/tool execution authorization.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { coreConversationProfile } from './core-conversation-profile.mjs';
const manifests = new WeakMap();
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (value) => JSON.stringify(value, null, 2) + '\n';
const deny = () => {
  throw new Error('core_admission_refused');
};
const requireThat = (value) => {
  if (!value) deny();
};
const record = (value, keys) => {
  requireThat(value && typeof value === 'object' && !Array.isArray(value));
  requireThat(
    Object.keys(value).length === keys.length &&
      keys.every((key) => Object.hasOwn(value, key)),
  );
};
const hex = (value, size = 64) =>
  requireThat(
    typeof value === 'string' && new RegExp(`^[a-f0-9]{${size}}$`).test(value),
  );
const label = (value) =>
  requireThat(
    typeof value === 'string' &&
      value.length <= 256 &&
      /^[a-zA-Z0-9_./:@-]+$/.test(value),
  );
const uuid = (value) =>
  requireThat(
    typeof value === 'string' &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
        value,
      ),
  );
const instant = (value) => {
  requireThat(
    typeof value === 'string' &&
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value),
  );
  const time = Date.parse(value);
  requireThat(
    Number.isSafeInteger(time) && new Date(time).toISOString() === value,
  );
  return time;
};
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function absolute(value) {
  requireThat(
    typeof value === 'string' &&
      value.length <= 4096 &&
      !/[\u0000-\u001f\u007f]/.test(value),
  );
  requireThat(path.isAbsolute(value) && path.normalize(value) === value);
}
function safeParent(file) {
  absolute(file);
  requireThat(fs.realpathSync(path.dirname(file)) === path.dirname(file));
}
function identity(stat) {
  return [
    stat.dev,
    stat.ino,
    stat.mode,
    stat.uid,
    stat.gid,
    stat.nlink,
    stat.size,
    stat.mtimeMs,
    stat.ctimeMs,
  ].join(':');
}
function readPinned(file, expectedSha, maxBytes, pin) {
  let fd;
  try {
    safeParent(file);
    if (expectedSha !== undefined) hex(expectedSha);
    fd = fs.openSync(
      file,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
    );
    const before = fs.fstatSync(fd);
    requireThat(
      before.isFile() &&
        before.nlink === 1 &&
        before.size > 0 &&
        before.size <= maxBytes,
    );
    requireThat((before.mode & 0o022) === 0);
    const buffer = Buffer.alloc(before.size + 1);
    let bytes = 0;
    while (bytes < buffer.length) {
      const n = fs.readSync(fd, buffer, bytes, buffer.length - bytes, null);
      if (n === 0) break;
      bytes += n;
    }
    const after = fs.fstatSync(fd);
    requireThat(bytes === before.size && identity(before) === identity(after));
    const pathname = fs.lstatSync(file);
    requireThat(
      !pathname.isSymbolicLink() && identity(pathname) === identity(after),
    );
    const raw = buffer.subarray(0, bytes),
      sha256 = digest(raw);
    if (expectedSha !== undefined) requireThat(sha256 === expectedSha);
    if (pin)
      requireThat(pin.identity === identity(after) && pin.sha256 === sha256);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
    const value = JSON.parse(text);
    // One exact encoding also refuses duplicate keys, trailing data and invalid UTF-8.
    requireThat(text === canonical(value));
    return {
      value,
      identity: identity(after),
      sha256,
      uid: after.uid,
      mode: after.mode,
    };
  } catch {
    deny();
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
function validateManifest(value, localStdin) {
  record(value, [
    'contract',
    'mode',
    'profile',
    'candidateCommit',
    'sourceHashes',
    'datasetSha256',
    'dialogs',
    'userTurns',
    'cases',
    'limits',
    'limitsSha256',
    'runId',
    'createdAt',
    'paidAuthorized',
    'upstreamAllowed',
    'credentialAdmission',
    'admissionContext',
  ]);
  requireThat(value.contract === 'maya.core-conversation-run/1');
  requireThat(
    localStdin
      ? value.mode === 'ADMITTED_LOCAL_MODEL_HTTP'
      : ['DRY_HTTP', 'ADMITTED_MODEL_HTTP'].includes(value.mode),
  );
  const profile = coreConversationProfile(value.profile);
  hex(value.candidateCommit, 40);
  uuid(value.runId);
  instant(value.createdAt);
  requireThat(
    value.paidAuthorized === false &&
      value.upstreamAllowed === false &&
      value.credentialAdmission === false,
  );
  if (value.mode === 'DRY_HTTP') requireThat(value.admissionContext === null);
  else {
    record(value.admissionContext, ['target', 'credentialSource']);
    validateTarget(value.admissionContext.target, localStdin);
    validateCredential(value.admissionContext.credentialSource, localStdin);
    requireThat(
      value.admissionContext.credentialSource.reader ===
        value.admissionContext.target.brokerUid,
    );
  }
  requireThat(
    value.dialogs === profile.dialogs &&
      value.userTurns === profile.userTurns &&
      value.datasetSha256 === profile.datasetSha256,
  );
  requireThat(digest(JSON.stringify(value.cases)) === profile.casesSha256);
  requireThat(JSON.stringify(value.limits) === JSON.stringify(profile.limits));
  requireThat(value.limitsSha256 === profile.limitsSha256);
  requireThat(
    value.sourceHashes &&
      typeof value.sourceHashes === 'object' &&
      !Array.isArray(value.sourceHashes),
  );
  const sources = Object.entries(value.sourceHashes);
  requireThat(sources.length > 0 && sources.length <= 10_000);
  for (const [name, sha] of sources) {
    requireThat(
      name.length <= 1024 &&
        !path.isAbsolute(name) &&
        !name.includes('\\') &&
        !/[\u0000-\u001f\u007f]/.test(name),
    );
    requireThat(
      name.split('/').every((part) => part && part !== '.' && part !== '..'),
    );
    hex(sha);
  }
}

export function readCoreManifest(
  file,
  sha256,
  options = { localStdin: false },
) {
  try {
    record(options, ['localStdin']);
    requireThat(typeof options.localStdin === 'boolean');
    hex(sha256);
    const read = readPinned(file, sha256, 2 * 1024 * 1024);
    validateManifest(read.value, options.localStdin);
    const value = freeze({ ...read.value, manifestSha256: read.sha256 });
    manifests.set(value, { file, pin: read, localStdin: options.localStdin });
    return value;
  } catch {
    deny();
  }
}
function validateTarget(target, localStdin = false) {
  record(target, [
    'host',
    'workDirectory',
    'brokerUid',
    'runnerUid',
    'brokerSocket',
  ]);
  label(target.host);
  absolute(target.workDirectory);
  requireThat(
    [target.brokerUid, target.runnerUid].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    ),
  );
  requireThat(
    localStdin
      ? target.host === 'localhost' &&
          target.brokerUid > 0 &&
          target.brokerUid === target.runnerUid
      : target.brokerUid !== target.runnerUid,
  );
  record(target.brokerSocket, ['path', 'gid']);
  absolute(target.brokerSocket.path);
  requireThat(
    !target.brokerSocket.path.endsWith('/') &&
      path.dirname(target.brokerSocket.path) !==
        path.parse(target.brokerSocket.path).root &&
      path.dirname(target.brokerSocket.path) !== target.workDirectory,
  );
  requireThat(
    Number.isSafeInteger(target.brokerSocket.gid) &&
      target.brokerSocket.gid >= 0,
  );
  // This pins only the socket declaration. The broker separately verifies the
  // dedicated direct parent, actual socket type, ownership and access modes.
}
function validateCredential(source, localStdin = false) {
  record(source, ['kind', 'reference', 'owner', 'reader']);
  if (localStdin) {
    requireThat(
      source.kind === 'terminal-stdin' &&
        source.reference === 'owner-terminal-stdin-once' &&
        source.owner === source.reader &&
        source.owner > 0,
    );
  } else {
    requireThat(source.kind === 'file');
    absolute(source.reference);
  }
  requireThat(
    [source.owner, source.reader].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    ),
  );
}
// This mode trusts the owner's processes. It does not claim cross-UID isolation.
function checkLocalBoundary(target) {
  requireThat(
    process.platform === 'darwin' &&
      process.getuid() === target.brokerUid &&
      process.getgid() === target.brokerSocket.gid,
  );
  const parent = path.dirname(target.brokerSocket.path);
  const root = path.dirname(parent);
  requireThat(root !== path.parse(root).root && root !== target.workDirectory);
  requireThat(
    fs.realpathSync(root) === root && fs.realpathSync(parent) === parent,
  );
  const outer = fs.lstatSync(root),
    inner = fs.lstatSync(parent);
  requireThat(
    outer.isDirectory() &&
      outer.uid === target.brokerUid &&
      (outer.mode & 0o7777) === 0o700,
  );
  requireThat(
    inner.isDirectory() &&
      inner.uid === target.brokerUid &&
      inner.gid === target.brokerSocket.gid &&
      (inner.mode & 0o7777) === 0o700,
  );
}
function bindingOf(manifest) {
  return {
    candidateCommit: manifest.candidateCommit,
    manifestSha256: manifest.manifestSha256,
    profile: manifest.profile,
    limitsSha256: manifest.limitsSha256,
  };
}
function checkBinding(binding, expected) {
  record(binding, [
    'candidateCommit',
    'manifestSha256',
    'profile',
    'limitsSha256',
  ]);
  requireThat(
    Object.keys(expected).every((key) => binding[key] === expected[key]),
  );
}
function configuration(options) {
  record(options, [
    'path',
    'sha256',
    'manifest',
    'claimPath',
    'role',
    'target',
    'credentialSource',
    'ownerApprovalRef',
  ]);
  const manifestPin = manifests.get(options.manifest);
  requireThat(
    manifestPin &&
      options.manifest.mode ===
        (manifestPin.localStdin
          ? 'ADMITTED_LOCAL_MODEL_HTTP'
          : 'ADMITTED_MODEL_HTTP'),
  );
  requireThat(['broker', 'runner'].includes(options.role));
  validateTarget(options.target, manifestPin.localStdin);
  validateCredential(options.credentialSource, manifestPin.localStdin);
  label(options.ownerApprovalRef);
  requireThat(
    JSON.stringify(options.target) ===
      JSON.stringify(options.manifest.admissionContext.target),
  );
  requireThat(
    JSON.stringify(options.credentialSource) ===
      JSON.stringify(options.manifest.admissionContext.credentialSource),
  );
  absolute(options.path);
  hex(options.sha256);
  requireThat(options.claimPath === options.path + '.claim');
  // Capture caller metadata; subsequent mutation cannot change the scope.
  return freeze({
    ...options,
    target: {
      ...options.target,
      brokerSocket: { ...options.target.brokerSocket },
    },
    credentialSource: { ...options.credentialSource },
    manifestPin,
  });
}
function checkPermit(config, previous, time) {
  requireThat(Number.isSafeInteger(time) && time >= 0);
  readPinned(
    config.manifestPin.file,
    config.manifest.manifestSha256,
    2 * 1024 * 1024,
    config.manifestPin.pin,
  );
  const read = readPinned(config.path, config.sha256, 16 * 1024, previous);
  const permit = read.value;
  record(permit, [
    'contract',
    'runId',
    'nonce',
    'candidateCommit',
    'manifestSha256',
    'profile',
    'limitsSha256',
    'ownerApprovalRef',
    'startsAt',
    'expiresAt',
    'revoked',
    'target',
    'credentialSource',
    'pricing',
    'claimPath',
  ]);
  requireThat(
    permit.contract === 'maya.core-conversation-permit/1' &&
      permit.revoked === false,
  );
  uuid(permit.runId);
  hex(permit.nonce);
  requireThat(
    permit.runId === config.manifest.runId &&
      permit.claimPath === config.claimPath,
  );
  checkBinding(bindingOf(permit), bindingOf(config.manifest));
  label(permit.ownerApprovalRef);
  requireThat(permit.ownerApprovalRef === config.ownerApprovalRef);
  validateTarget(permit.target, config.manifestPin.localStdin);
  validateCredential(permit.credentialSource, config.manifestPin.localStdin);
  if (config.manifestPin.localStdin) checkLocalBoundary(config.target);
  requireThat(JSON.stringify(permit.target) === JSON.stringify(config.target));
  requireThat(
    JSON.stringify(permit.credentialSource) ===
      JSON.stringify(config.credentialSource),
  );
  requireThat(
    typeof process.getuid === 'function' &&
      process.getuid() === config.target[config.role + 'Uid'],
  );
  requireThat(fs.realpathSync(process.cwd()) === config.target.workDirectory);
  const start = instant(permit.startsAt),
    end = instant(permit.expiresAt);
  requireThat(
    start <= time &&
      time < end &&
      end > start &&
      end - start <=
        coreConversationProfile(config.manifest.profile).limits.durationMs,
  );
  requireThat(instant(config.manifest.createdAt) <= start);
  record(permit.pricing, [
    'model',
    'inputNanoUsdPerToken',
    'outputNanoUsdPerToken',
    'reference',
    'sha256',
    'verifiedAt',
  ]);
  requireThat(
    permit.pricing.model === 'deepseek-v4-pro' &&
      permit.pricing.inputNanoUsdPerToken === 1320 &&
      permit.pricing.outputNanoUsdPerToken === 3960,
  );
  label(permit.pricing.reference);
  hex(permit.pricing.sha256);
  const verified = instant(permit.pricing.verifiedAt);
  requireThat(verified <= start && time - verified <= 86_400_000);
  return read;
}
function checkClaim(config, permitRead, previous) {
  const read = readPinned(config.claimPath, undefined, 4096, previous),
    value = read.value;
  record(value, [
    'contract',
    'runId',
    'nonce',
    'permitSha256',
    'manifestSha256',
    'brokerPid',
    'claimedAt',
  ]);
  requireThat(value.contract === 'maya.core-conversation-claim/1');
  requireThat(
    read.uid === config.target.brokerUid && (read.mode & 0o777) === 0o444,
  );
  requireThat(
    value.runId === permitRead.value.runId &&
      value.nonce === permitRead.value.nonce &&
      value.permitSha256 === config.sha256 &&
      value.manifestSha256 === config.manifest.manifestSha256,
  );
  requireThat(Number.isSafeInteger(value.brokerPid) && value.brokerPid > 0);
  if (config.role === 'broker') requireThat(value.brokerPid === process.pid);
  const claimed = instant(value.claimedAt);
  requireThat(
    claimed >= instant(permitRead.value.startsAt) &&
      claimed < instant(permitRead.value.expiresAt) &&
      claimed <= Date.now(),
  );
  return read;
}

/** Observe an existing claim; callers cannot supply an unverified manifest object.
 * This synchronous callback is shared by the probe and the single budget gate.
 */
export function assertCoreAdmission(options) {
  try {
    const config = configuration(options);
    let last = Date.now(),
      halted = false;
    const permitPin = checkPermit(config, undefined, last);
    const claimPin = checkClaim(config, permitPin);
    const binding = freeze(bindingOf(config.manifest));
    const deadline = instant(permitPin.value.expiresAt);
    const pricingDeadline =
      instant(permitPin.value.pricing.verifiedAt) + 86_400_000;
    const finishCheck = (started) => {
      const finished = Date.now();
      requireThat(
        Number.isSafeInteger(finished) &&
          finished >= started &&
          finished < deadline &&
          finished <= pricingDeadline,
      );
      return finished;
    };
    last = finishCheck(last);
    const validate = (actual) => {
      try {
        requireThat(!halted);
        checkBinding(actual, binding);
        const now = Date.now();
        requireThat(now >= last);
        last = now;
        const permit = checkPermit(config, permitPin, now);
        checkClaim(config, permit, claimPin);
        last = finishCheck(now);
      } catch {
        halted = true;
        deny();
      }
    };
    Object.defineProperties(validate, {
      startsAt: { value: instant(permitPin.value.startsAt), enumerable: true },
      expiresAt: { value: deadline, enumerable: true },
    });
    return Object.freeze(validate);
  } catch {
    deny();
  }
}

/** Only the broker may claim. An existing claim, even from a closed process,
 * refuses. No delete/reset/resume operation exists here. The claim is nonsecret.
 */
export function claimCorePermit(options) {
  let fd;
  try {
    const config = configuration(options);
    requireThat(config.role === 'broker');
    const time = Date.now(),
      permit = checkPermit(config, undefined, time);
    safeParent(config.claimPath);
    const bytes = Buffer.from(
      canonical({
        contract: 'maya.core-conversation-claim/1',
        runId: permit.value.runId,
        nonce: permit.value.nonce,
        permitSha256: config.sha256,
        manifestSha256: config.manifest.manifestSha256,
        brokerPid: process.pid,
        claimedAt: new Date(time).toISOString(),
      }),
    );
    fd = fs.openSync(
      config.claimPath,
      fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        fs.constants.O_NOFOLLOW,
      0o600,
    );
    let offset = 0;
    while (offset < bytes.length) {
      const written = fs.writeSync(fd, bytes, offset, bytes.length - offset);
      requireThat(written > 0 && written <= bytes.length - offset);
      offset += written;
    }
    fs.fchmodSync(fd, 0o444);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    const directory = fs.openSync(
      path.dirname(config.claimPath),
      fs.constants.O_RDONLY,
    );
    try {
      fs.fsyncSync(directory);
    } finally {
      fs.closeSync(directory);
    }
    // Revalidate after durable claim creation; failures leave the spent claim intact.
    return assertCoreAdmission(options);
  } catch {
    deny();
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
