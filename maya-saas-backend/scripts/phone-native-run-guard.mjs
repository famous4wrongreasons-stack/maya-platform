// Operational restriction around the existing transport, not an authorization
// issuer or release engine. No CLI, credential loader, grant, retry or deploy.
// A trusted executor must independently verify current execution authority and
// installed artifacts. Operator-installed JSON and its digest cannot grant it.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  nativeCreateEgress,
  nativeExecutionEgress,
  EXECUTION_EGRESS_CONTRACT,
  validateCreateEgressScope,
} from './phone-native-create-egress.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (value) => JSON.stringify(value, null, 2) + '\n';
const refused = () => new Error('phone_native_run_refused');
const identity = (stat) =>
  [
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
const directoryIdentity = (stat) =>
  [stat.dev, stat.ino, stat.mode, stat.uid, stat.gid].join(':');

function directory(filename, uid) {
  assert(path.isAbsolute(filename) && path.normalize(filename) === filename);
  assert(fs.realpathSync(filename) === filename, 'directory_alias');
  const stat = fs.lstatSync(filename);
  assert(
    stat.isDirectory() &&
      !stat.isSymbolicLink() &&
      stat.uid === uid &&
      (stat.mode & 0o777) === 0o700,
    'operator_private_directory',
  );
  return directoryIdentity(stat);
}

function readPrivate(filename, uid, maxBytes) {
  let fd;
  try {
    fd = fs.openSync(
      filename,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
    );
    const before = fs.fstatSync(fd);
    assert(
      before.isFile() &&
        before.uid === uid &&
        before.nlink === 1 &&
        (before.mode & 0o777) === 0o600 &&
        before.size > 0 &&
        before.size <= maxBytes,
    );
    const bytes = Buffer.alloc(before.size + 1);
    let size = 0;
    while (size < bytes.length) {
      const n = fs.readSync(fd, bytes, size, bytes.length - size, null);
      if (!n) break;
      size += n;
    }
    const after = fs.fstatSync(fd),
      retained = fs.lstatSync(filename);
    assert(
      size === before.size &&
        identity(before) === identity(after) &&
        !retained.isSymbolicLink() &&
        identity(retained) === identity(after),
    );
    return { bytes: bytes.subarray(0, size), identity: identity(after) };
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function assertNotRevoked(filename) {
  // lstat detects dangling symlinks too. Any marker object closes the run.
  try {
    fs.lstatSync(filename);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  throw refused();
}

export function guardedNativeEgress(options) {
  try {
    return open(options);
  } catch {
    throw refused();
  }
}

function open(options) {
  const state = prepare(options);
  assert.notEqual(state.scope.contract, EXECUTION_EGRESS_CONTRACT);
  const current = () =>
    state.check(() => {
      assert(
        options.assertCurrent(state.scope) === true,
        'independent_execution_admission',
      );
    });
  current();
  state.claim();
  current();
  return nativeCreateEgress({
    scope: state.scope,
    ledgerPath: state.ledgerPath,
    assertCurrent: current,
    nativeFetch: options.nativeFetch,
    clock: options.clock,
  });
}

// Same private files and atomic claim owner. Current asynchronous authority is
// awaited before claim and at every transport dispatch; no Boolean-cache bridge.
export async function guardedNativeExecution(options) {
  let state;
  try {
    state = prepare(options);
    assert.equal(state.scope.contract, EXECUTION_EGRESS_CONTRACT);
    const current = async () => {
      try {
        state.check();
        assert.equal(
          await options.assertCurrent(state.scope),
          true,
          'independent_execution_admission',
        );
        return state.check();
      } catch {
        state.poison();
        throw refused();
      }
    };
    await current();
    state.claim();
    await current();
    return await nativeExecutionEgress({
      scope: state.scope,
      ledgerPath: state.ledgerPath,
      assertCurrent: current,
      nativeFetch: options.nativeFetch,
      clock: options.clock,
    });
  } catch {
    state?.poison();
    throw refused();
  }
}

function prepare(options) {
  const allowed = [
    'scopeFile',
    'scopeSha256',
    'ledgerDirectory',
    'assertCurrent',
    'operatorUid',
    'nativeFetch',
    'clock',
  ];
  assert(options && Object.keys(options).every((key) => allowed.includes(key)));
  const {
    scopeFile,
    scopeSha256,
    ledgerDirectory,
    assertCurrent,
    operatorUid = 0,
    nativeFetch = fetch,
    clock = Date.now,
  } = options;
  // operatorUid is trusted process configuration, never a scope/request field.
  // Production defaults to root. Synthetic tests explicitly use their own UID.
  assert(Number.isSafeInteger(operatorUid) && operatorUid >= 0);
  assert(typeof assertCurrent === 'function' && typeof clock === 'function');
  assert(
    typeof scopeFile === 'string' &&
      path.isAbsolute(scopeFile) &&
      path.normalize(scopeFile) === scopeFile,
  );
  assert(typeof scopeSha256 === 'string' && /^[a-f0-9]{64}$/.test(scopeSha256));
  const parent = path.dirname(scopeFile);
  const scopeParentIdentity = directory(parent, operatorUid);
  const ledgerParentIdentity = directory(ledgerDirectory, operatorUid);
  assert(parent !== ledgerDirectory, 'separate_installed_scope_and_run_state');
  const initial = readPrivate(scopeFile, operatorUid, 8192);
  assert(hash(initial.bytes) === scopeSha256);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(initial.bytes);
  const scope = validateCreateEgressScope(JSON.parse(text), clock());
  assert(text === canonical(scope), 'one_scope_encoding');
  const runId =
    scope.contract === EXECUTION_EGRESS_CONTRACT
      ? hash('maya.phone-native-execution/1:' + scope.runId)
      : scope.executionAuthorizationDigest;
  // One stable namespace per independently verified authorization, not a caller
  // chosen ledger or scope digest. Reformatting/renewing scope cannot reset it.
  const claimPath = path.join(ledgerDirectory, runId + '.consumed');
  const ledgerPath = path.join(ledgerDirectory, runId + '.jsonl');
  const revocationPath = path.join(ledgerDirectory, runId + '.revoked');
  const claimBytes = Buffer.from(
    canonical({
      contract: 'maya.phone-native-run-claim/1',
      executionAuthorizationDigest: scope.executionAuthorizationDigest,
      scopeSha256,
    }),
  );
  let claimIdentity,
    poisoned = false;
  const current = (independentCheck = () => {}) => {
    try {
      assert(!poisoned);
      assert(directory(parent, operatorUid) === scopeParentIdentity);
      assert(directory(ledgerDirectory, operatorUid) === ledgerParentIdentity);
      assertNotRevoked(revocationPath);
      const fresh = readPrivate(scopeFile, operatorUid, 8192);
      assert(
        fresh.identity === initial.identity &&
          hash(fresh.bytes) === scopeSha256,
      );
      validateCreateEgressScope(scope, clock());
      if (claimIdentity !== undefined) {
        const claim = readPrivate(claimPath, operatorUid, 1024);
        assert(
          claim.identity === claimIdentity && claim.bytes.equals(claimBytes),
        );
      }
      // This existing independent authority check remains mandatory. A scope
      // file, platform role label or claim is never a substitute for it.
      independentCheck();
      return true;
    } catch {
      poisoned = true; // Restoring files/authority cannot revive this process.
      throw refused();
    }
  };
  const claim = () => {
    current();
    let claimFd;
    try {
      claimFd = fs.openSync(
        claimPath,
        fs.constants.O_WRONLY |
          fs.constants.O_CREAT |
          fs.constants.O_EXCL |
          fs.constants.O_NOFOLLOW,
        0o600,
      );
      fs.writeFileSync(claimFd, claimBytes);
      fs.fsyncSync(claimFd);
    } finally {
      if (claimFd !== undefined) fs.closeSync(claimFd);
    }
    // Never undo a claim on any failure, including a crash before ledger creation.
    const directoryFd = fs.openSync(ledgerDirectory, 'r');
    try {
      fs.fsyncSync(directoryFd);
    } finally {
      fs.closeSync(directoryFd);
    }
    const retainedClaim = readPrivate(claimPath, operatorUid, 1024);
    assert(retainedClaim.bytes.equals(claimBytes));
    claimIdentity = retainedClaim.identity;
    current();
  };
  return {
    scope,
    ledgerPath,
    claim,
    check: current,
    poison() {
      poisoned = true;
    },
  };
}

// Shared strict file reader for the operator-installed execution attachment,
// public pricing evidence and session token. Values are never printed/logged.
export function immutableNativeFile(
  filename,
  expectedHash,
  uid = 0,
  maxBytes = 16384,
) {
  assert(/^[a-f0-9]{64}$/.test(expectedHash));
  const dir = path.dirname(filename),
    parentIdentity = directory(dir, uid);
  const first = readPrivate(filename, uid, maxBytes);
  assert.equal(hash(first.bytes), expectedHash);
  return () => {
    assert.equal(directory(dir, uid), parentIdentity);
    assertNotRevoked(filename + '.revoked');
    const fresh = readPrivate(filename, uid, maxBytes);
    assert.equal(fresh.identity, first.identity);
    assert.equal(hash(fresh.bytes), expectedHash);
    return fresh.bytes;
  };
}

// Deny-only operation: no certificate/session/allowlist check can prevent a
// local operator from closing a run after expiry or candidate replacement.
export function revokeNativeRun(ledgerDirectory, runId, uid = 0) {
  directory(ledgerDirectory, uid);
  assert(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(runId));
  const filename = path.join(
    ledgerDirectory,
    hash('maya.phone-native-execution/1:' + runId) + '.revoked',
  );
  let fd;
  try {
    fd = fs.openSync(filename, 'wx', 0o600);
    fs.writeFileSync(fd, 'revoked\n');
    fs.fsyncSync(fd);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  const dir = fs.openSync(ledgerDirectory, 'r');
  try {
    fs.fsyncSync(dir);
  } finally {
    fs.closeSync(dir);
  }
}
