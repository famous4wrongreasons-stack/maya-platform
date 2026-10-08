// Synthetic local mechanical contracts only. Test permits expired in 2000;
// mocked time cannot authorize any real broker, credential read or paid run.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  readCoreManifest,
  claimCorePermit,
  assertCoreAdmission,
} from './core-conversation-admission.mjs';
import {
  CORE_DIAGNOSTIC_PROFILE,
  CORE_DIAGNOSTIC_LIMITS,
  CORE_DIAGNOSTIC_LIMITS_SHA256,
} from './current-candidate-budget.mjs';

const dataset = JSON.parse(
  fs.readFileSync(
    new URL(
      '../../datasets/conversation-intelligence/core-diagnostic-20261008.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const DATASET_SHA =
  'b793c5489dcd8838e4edc6bca6c00c53530b57892c29520876845608786e2dc6';
const at = Date.parse('2000-01-01T00:00:00.000Z');
const stamp = (ms) => new Date(ms).toISOString();
const canonical = (x) => JSON.stringify(x, null, 2) + '\n';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const denied = (fn) =>
  assert.throws(fn, (error) => error.message === 'core_admission_refused');
function fixture(t, mode = 'ADMITTED_MODEL_HTTP') {
  t.mock.method(Date, 'now', () => at);
  const dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'maya-core-admission-unit-')),
  );
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const manifestPath = path.join(dir, 'manifest.json'),
    permitPath = path.join(dir, 'permit.json');
  const target = {
    host: 'SYNTHETIC.invalid',
    workDirectory: fs.realpathSync(process.cwd()),
    brokerUid: process.getuid(),
    runnerUid: process.getuid() + 1,
    brokerSocket: {
      path: path.join(dir, 'dedicated-socket', 'model.sock'),
      gid: process.getgid(),
    },
  };
  const credentialSource = {
    kind: 'file',
    reference: '/NEVER_OPENED/SYNTHETIC/credential',
    owner: process.getuid(),
    reader: process.getuid(),
  };
  const raw = {
    contract: 'maya.core-conversation-run/1',
    mode,
    profile: CORE_DIAGNOSTIC_PROFILE,
    candidateCommit: 'a'.repeat(40),
    sourceHashes: { 'synthetic/source.ts': 'b'.repeat(64) },
    datasetSha256: DATASET_SHA,
    dialogs: 3,
    userTurns: 5,
    cases: structuredClone(dataset.cases),
    limits: CORE_DIAGNOSTIC_LIMITS,
    limitsSha256: CORE_DIAGNOSTIC_LIMITS_SHA256,
    runId: '11111111-1111-4111-8111-111111111111',
    createdAt: stamp(at - 1000),
    paidAuthorized: false,
    upstreamAllowed: false,
    credentialAdmission: false,
    admissionContext: mode === 'DRY_HTTP' ? null : { target, credentialSource },
  };
  const write = (file, value) => {
    const bytes = canonical(value);
    fs.writeFileSync(file, bytes, { mode: 0o600 });
    return sha(bytes);
  };
  const manifestSha = write(manifestPath, raw);
  const manifest = readCoreManifest(manifestPath, manifestSha);
  const permit = {
    contract: 'maya.core-conversation-permit/1',
    runId: raw.runId,
    nonce: 'c'.repeat(64),
    candidateCommit: raw.candidateCommit,
    manifestSha256: manifestSha,
    profile: raw.profile,
    limitsSha256: raw.limitsSha256,
    ownerApprovalRef: 'SYNTHETIC_UNIT_NOT_AUTHORIZED',
    startsAt: stamp(at),
    expiresAt: stamp(at + 60_000),
    revoked: false,
    target,
    credentialSource,
    pricing: {
      model: 'deepseek-v4-pro',
      inputNanoUsdPerToken: 1320,
      outputNanoUsdPerToken: 3960,
      reference: 'SYNTHETIC_UNIT_PRICE_ONLY',
      sha256: 'd'.repeat(64),
      verifiedAt: stamp(at - 1000),
    },
    claimPath: permitPath + '.claim',
  };
  const options = {
    path: permitPath,
    sha256: write(permitPath, permit),
    manifest,
    claimPath: permit.claimPath,
    role: 'broker',
    target,
    credentialSource,
    ownerApprovalRef: permit.ownerApprovalRef,
  };
  const binding = {
    candidateCommit: manifest.candidateCommit,
    manifestSha256: manifest.manifestSha256,
    profile: manifest.profile,
    limitsSha256: manifest.limitsSha256,
  };
  return {
    dir,
    raw,
    manifestPath,
    manifestSha,
    manifest,
    permit,
    options,
    binding,
    write,
  };
}

test('dry manifest has no admission authority and needs no permit', (t) => {
  const f = fixture(t, 'DRY_HTTP');
  fs.unlinkSync(f.options.path);
  assert.equal(f.manifest.admissionContext, null);
  for (const key of [
    'paidAuthorized',
    'upstreamAllowed',
    'credentialAdmission',
  ])
    assert.equal(f.manifest[key], false);
  assert.ok(Object.isFrozen(f.manifest) && Object.isFrozen(f.manifest.cases));
  denied(() => claimCorePermit(f.options));
  denied(() => assertCoreAdmission(f.options));
  assert.equal(fs.existsSync(f.options.claimPath), false);
});
test('broker exclusively claims once; separate runner observes the same claim without another ledger', (t) => {
  const f = fixture(t),
    validate = claimCorePermit(f.options);
  assert.equal(validate(f.binding), undefined);
  assert.equal(validate.startsAt, at);
  assert.equal(validate.expiresAt, at + 60_000);
  assert.equal(fs.statSync(f.options.claimPath).mode & 0o777, 0o444);
  denied(() => claimCorePermit(f.options));
  t.mock.method(process, 'getuid', () => f.options.target.runnerUid);
  assert.equal(
    assertCoreAdmission({ ...f.options, role: 'runner' })(f.binding),
    undefined,
  );
  denied(() => claimCorePermit({ ...f.options, role: 'runner' }));
});
test('declaration cannot be forged in memory, repinned to another scope, or used by another principal', (t) => {
  const f = fixture(t);
  for (const options of [
    { ...f.options, manifest: { ...f.manifest } },
    { ...f.options, claimPath: path.join(f.dir, 'another.claim') },
    { ...f.options, ownerApprovalRef: 'OTHER_APPROVAL' },
    { ...f.options, target: { ...f.options.target, host: 'other.invalid' } },
    {
      ...f.options,
      credentialSource: {
        ...f.options.credentialSource,
        reader: 'OTHER_READER',
      },
    },
    { ...f.options, role: 'runner' },
  ])
    denied(() => claimCorePermit(options));
  assert.equal(fs.existsSync(f.options.claimPath), false);
});
test('live target requires a closed Unix socket declaration in a dedicated direct parent', (t) => {
  const f = fixture(t);
  const changes = [
    (target) => {
      delete target.brokerSocket;
    },
    (target) => {
      target.brokerSocket.path = 'relative/model.sock';
    },
    (target) => {
      target.brokerSocket.path = 'http://127.0.0.1:8080';
    },
    (target) => {
      target.brokerSocket.path = '/model.sock';
    },
    (target) => {
      target.brokerSocket.path = path.join(target.workDirectory, 'model.sock');
    },
    (target) => {
      target.brokerSocket.path += '/';
    },
    (target) => {
      target.brokerSocket.path += '/../other.sock';
    },
    (target) => {
      target.brokerSocket.gid = -1;
    },
    (target) => {
      target.brokerSocket.gid = 1.5;
    },
    (target) => {
      target.brokerSocket.gid = '123';
    },
    (target) => {
      target.brokerSocket.port = 8080;
    },
    (target) => {
      target.brokerUrl = 'http://127.0.0.1:8080';
    },
  ];
  for (const change of changes) {
    const raw = structuredClone(f.raw);
    change(raw.admissionContext.target);
    const pin = f.write(f.manifestPath, raw);
    denied(() => readCoreManifest(f.manifestPath, pin));
  }
});
test('permit and consumer must use the exact socket path and group pinned in the manifest', (t) => {
  const f = fixture(t);
  for (const socket of [
    {
      ...f.options.target.brokerSocket,
      path: path.join(f.dir, 'other-socket', 'model.sock'),
    },
    {
      ...f.options.target.brokerSocket,
      gid: f.options.target.brokerSocket.gid + 1,
    },
  ]) {
    denied(() =>
      claimCorePermit({
        ...f.options,
        target: { ...f.options.target, brokerSocket: socket },
      }),
    );
    const permit = structuredClone(f.permit);
    permit.target.brokerSocket = socket;
    const pin = f.write(f.options.path, permit);
    denied(() => claimCorePermit({ ...f.options, sha256: pin }));
    assert.equal(fs.existsSync(f.options.claimPath), false);
  }
});
test('closed manifest rejects old contracts, widened limits, altered cases and malformed sources', (t) => {
  const f = fixture(t);
  const changes = [
    (m) => {
      m.contract = 'maya.old-pilot/1';
    },
    (m) => {
      m.paidAuthorized = true;
    },
    (m) => {
      m.upstreamAllowed = true;
    },
    (m) => {
      m.credentialAdmission = true;
    },
    (m) => {
      m.cases[0].userTurns[0] = 'different diagnostic';
    },
    (m) => {
      m.limits.attempts = 13;
    },
    (m) => {
      m.sourceHashes['../private'] = 'e'.repeat(64);
    },
    (m) => {
      m.admissionContext.target.runnerUid = m.admissionContext.target.brokerUid;
    },
    (m) => {
      m.secret = 'PRIVATE_CANARY_NEVER_ECHO';
    },
  ];
  for (const change of changes) {
    const raw = structuredClone(f.raw);
    change(raw);
    const pin = f.write(f.manifestPath, raw);
    denied(() => readCoreManifest(f.manifestPath, pin));
  }
});
test('fresh permit must bind every scope and current bounded pricing attestation', (t) => {
  const f = fixture(t);
  const changes = [
    (p) => {
      p.contract = 'maya.closed-pilot-permit/1';
    },
    (p) => {
      p.revoked = true;
    },
    (p) => {
      p.runId = '22222222-2222-4222-8222-222222222222';
    },
    (p) => {
      p.nonce = '';
    },
    (p) => {
      p.candidateCommit = 'e'.repeat(40);
    },
    (p) => {
      p.manifestSha256 = 'e'.repeat(64);
    },
    (p) => {
      p.profile = 'old-profile';
    },
    (p) => {
      p.limitsSha256 = 'e'.repeat(64);
    },
    (p) => {
      p.ownerApprovalRef = '';
    },
    (p) => {
      p.startsAt = stamp(at + 1);
    },
    (p) => {
      p.expiresAt = stamp(at);
    },
    (p) => {
      p.expiresAt = stamp(at + 600_001);
    },
    (p) => {
      p.target.workDirectory = '/different';
    },
    (p) => {
      p.credentialSource.reference = '/different';
    },
    (p) => {
      p.pricing.model = 'other-model';
    },
    (p) => {
      p.pricing.inputNanoUsdPerToken = 1319;
    },
    (p) => {
      p.pricing.outputNanoUsdPerToken = 3961;
    },
    (p) => {
      p.pricing.verifiedAt = stamp(at - 86_400_001);
    },
    (p) => {
      p.pricing.verifiedAt = stamp(at + 1);
    },
    (p) => {
      p.pricing.reference = '';
    },
    (p) => {
      p.claimPath += '.other';
    },
    (p) => {
      p.token = 'PRIVATE_CANARY_NEVER_ECHO';
    },
  ];
  for (const change of changes) {
    const permit = structuredClone(f.permit);
    change(permit);
    const options = { ...f.options, sha256: f.write(f.options.path, permit) };
    denied(() => claimCorePermit(options));
    assert.equal(fs.existsSync(f.options.claimPath), false);
  }
});
test('revocation after claim refuses the next dispatch permanently, including after restoring bytes', (t) => {
  const f = fixture(t),
    validate = claimCorePermit(f.options);
  f.write(f.options.path, { ...f.permit, revoked: true });
  denied(() => validate(f.binding));
  f.write(f.options.path, f.permit);
  denied(() => validate(f.binding));
  denied(() => claimCorePermit(f.options));
});
test('same-byte replacement of pinned manifest refuses before dispatch', (t) => {
  const f = fixture(t),
    validate = claimCorePermit(f.options);
  fs.unlinkSync(f.manifestPath);
  f.write(f.manifestPath, f.raw);
  denied(() => validate(f.binding));
});
test('claim deletion and alternate binding never reset admission', (t) => {
  const f = fixture(t),
    validate = claimCorePermit(f.options);
  denied(() => validate({ ...f.binding, candidateCommit: 'e'.repeat(40) }));
  denied(() => validate(f.binding));
  const second = assertCoreAdmission(f.options);
  fs.unlinkSync(f.options.claimPath);
  denied(() => second(f.binding));
  denied(() => assertCoreAdmission(f.options));
});
test('expiry and backwards wall clock stop the existing admission', (t) => {
  const f = fixture(t),
    validate = claimCorePermit(f.options);
  t.mock.method(Date, 'now', () => at + 59_999);
  validate(f.binding);
  t.mock.method(Date, 'now', () => at + 60_000);
  denied(() => validate(f.binding));
  t.mock.method(Date, 'now', () => at);
  denied(() => validate(f.binding));
});
test('backwards time and expiry during the synchronous file validation refuse', (t) => {
  const f = fixture(t),
    validate = claimCorePermit(f.options);
  t.mock.method(Date, 'now', () => at + 100);
  validate(f.binding);
  t.mock.method(Date, 'now', () => at + 99);
  denied(() => validate(f.binding));
  t.mock.method(Date, 'now', () => at);
  const second = assertCoreAdmission(f.options);
  let calls = 0;
  t.mock.method(Date, 'now', () => (++calls < 3 ? at + 59_999 : at + 60_000));
  denied(() => second(f.binding));
});
test('symlink, hardlink, writable metadata, missing SHA and oversized file refuse', (t) => {
  const f = fixture(t),
    symlink = path.join(f.dir, 'symlink.json'),
    hardlink = path.join(f.dir, 'hardlink.json');
  fs.symlinkSync(f.manifestPath, symlink);
  denied(() => readCoreManifest(symlink, f.manifestSha));
  fs.linkSync(f.manifestPath, hardlink);
  denied(() => readCoreManifest(hardlink, f.manifestSha));
  fs.unlinkSync(hardlink);
  fs.chmodSync(f.manifestPath, 0o666);
  denied(() => readCoreManifest(f.manifestPath, f.manifestSha));
  fs.chmodSync(f.manifestPath, 0o600);
  denied(() => readCoreManifest(f.manifestPath, undefined));
  fs.writeFileSync(f.manifestPath, Buffer.alloc(2 * 1024 * 1024 + 1));
  denied(() => readCoreManifest(f.manifestPath, f.manifestSha));
});
test('noncanonical duplicate keys and parent symlinks refuse without echoing private input', (t) => {
  const f = fixture(t);
  const bytes = canonical(f.raw).replace(
    '"paidAuthorized": false,',
    '"paidAuthorized": true,\n  "paidAuthorized": false,',
  );
  fs.writeFileSync(f.manifestPath, bytes);
  denied(() => readCoreManifest(f.manifestPath, sha(bytes)));
  f.write(f.manifestPath, f.raw);
  const alias = path.join(f.dir, 'alias');
  fs.symlinkSync(f.dir, alias);
  denied(() =>
    readCoreManifest(path.join(alias, 'manifest.json'), f.manifestSha),
  );
});
