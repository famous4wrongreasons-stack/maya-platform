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
  CORE_UI_PROFILE,
  CORE_FOLLOWUP_PROFILE,
  CORE_UNION_PROFILE,
} from './current-candidate-budget.mjs';
import { coreConversationProfile } from './core-conversation-profile.mjs';

const at = Date.parse('2000-01-01T00:00:00.000Z');
const stamp = (ms) => new Date(ms).toISOString();
const canonical = (x) => JSON.stringify(x, null, 2) + '\n';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const denied = (fn) =>
  assert.throws(fn, (error) => error.message === 'core_admission_refused');
function fixture(
  t,
  mode = 'ADMITTED_MODEL_HTTP',
  profileId = CORE_DIAGNOSTIC_PROFILE,
) {
  const profile = coreConversationProfile(profileId);
  const dataset = JSON.parse(
    fs.readFileSync(
      new URL('../../../' + profile.datasetPath, import.meta.url),
      'utf8',
    ),
  );
  t.mock.method(Date, 'now', () => at);
  const dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'maya-core-admission-unit-')),
  );
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const manifestPath = path.join(dir, 'manifest.json'),
    permitPath = path.join(dir, 'permit.json');
  const localStdin = mode === 'ADMITTED_LOCAL_MODEL_HTTP';
  if (localStdin) {
    fs.mkdirSync(path.join(dir, 'dedicated-socket'));
    fs.chmodSync(path.join(dir, 'dedicated-socket'), 0o700);
  }
  const target = {
    host: localStdin ? 'localhost' : 'SYNTHETIC.invalid',
    workDirectory: fs.realpathSync(process.cwd()),
    brokerUid: process.getuid(),
    runnerUid: process.getuid() + (localStdin ? 0 : 1),
    brokerSocket: {
      path: path.join(dir, 'dedicated-socket', 'model.sock'),
      gid: process.getgid(),
    },
  };
  const credentialSource = {
    kind: localStdin ? 'terminal-stdin' : 'file',
    reference: localStdin
      ? 'owner-terminal-stdin-once'
      : '/NEVER_OPENED/SYNTHETIC/credential',
    owner: process.getuid(),
    reader: process.getuid(),
  };
  const raw = {
    contract: 'maya.core-conversation-run/1',
    mode,
    profile: profile.id,
    candidateCommit: 'a'.repeat(40),
    sourceHashes: { 'synthetic/source.ts': 'b'.repeat(64) },
    datasetSha256: profile.datasetSha256,
    dialogs: profile.dialogs,
    userTurns: profile.userTurns,
    cases: structuredClone(dataset.cases),
    limits: profile.limits,
    limitsSha256: profile.limitsSha256,
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
  const manifest = readCoreManifest(manifestPath, manifestSha, { localStdin });
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
test('B exact frozen manifest is inert, and A/B scope, cases, budget or profile substitutions refuse', (t) => {
  const f = fixture(t, 'DRY_HTTP', CORE_FOLLOWUP_PROFILE);
  assert.equal(f.manifest.profile, CORE_FOLLOWUP_PROFILE);
  assert.equal(f.manifest.dialogs, 6);
  assert.equal(f.manifest.userTurns, 13);
  assert.equal(f.manifest.paidAuthorized, false);
  assert.equal(f.manifest.upstreamAllowed, false);
  assert.equal(f.manifest.credentialAdmission, false);
  denied(() => claimCorePermit(f.options));
  assert.equal(fs.existsSync(f.options.claimPath), false);
  const a = coreConversationProfile();
  for (const patch of [
    { profile: CORE_DIAGNOSTIC_PROFILE },
    { profile: 'core-followup-20261009/2' },
    { profile: null },
    { dialogs: 3 },
    { userTurns: 5 },
    { datasetSha256: a.datasetSha256 },
    { cases: f.raw.cases.slice(0, 5) },
    { cases: [...f.raw.cases].reverse() },
    { limits: a.limits },
    { limits: { ...f.raw.limits, spendNanoUsd: 4_000_000_001 } },
    { limitsSha256: a.limitsSha256 },
  ]) {
    const sha256 = f.write(f.manifestPath, { ...f.raw, ...patch });
    denied(() => readCoreManifest(f.manifestPath, sha256));
  }
});
test('union manifest binds all nine dialogues and eighteen turns without admission authority', (t) => {
  const f = fixture(t, 'DRY_HTTP', CORE_UNION_PROFILE);
  assert.equal(f.manifest.dialogs, 9);
  assert.equal(f.manifest.userTurns, 18);
  assert.equal(f.manifest.limits.attempts, 36);
  assert.equal(f.manifest.limits.spendNanoUsd, 6_000_000_000);
  for (const key of [
    'paidAuthorized',
    'upstreamAllowed',
    'credentialAdmission',
  ])
    assert.equal(f.manifest[key], false);
  denied(() => claimCorePermit(f.options));
  assert.equal(fs.existsSync(f.options.claimPath), false);
  for (const patch of [
    { profile: CORE_DIAGNOSTIC_PROFILE },
    { profile: CORE_FOLLOWUP_PROFILE },
    { cases: f.raw.cases.slice(0, 8) },
    { cases: [...f.raw.cases].reverse() },
    { limits: { ...f.raw.limits, attempts: 37 } },
  ]) {
    const pin = f.write(f.manifestPath, { ...f.raw, ...patch });
    denied(() => readCoreManifest(f.manifestPath, pin));
  }
});
test('union refuses old A/B permits before claim; its synthetic permit is single-use and expires at thirty minutes', (t) => {
  const f = fixture(t, 'ADMITTED_MODEL_HTTP', CORE_UNION_PROFILE);
  for (const id of [CORE_DIAGNOSTIC_PROFILE, CORE_FOLLOWUP_PROFILE]) {
    const old = coreConversationProfile(id);
    f.options.sha256 = f.write(f.options.path, {
      ...f.permit,
      profile: old.id,
      limitsSha256: old.limitsSha256,
    });
    denied(() => claimCorePermit(f.options));
    assert.equal(fs.existsSync(f.options.claimPath), false);
  }
  f.permit.expiresAt = stamp(at + 1_800_001);
  f.options.sha256 = f.write(f.options.path, f.permit);
  denied(() => claimCorePermit(f.options));
  assert.equal(fs.existsSync(f.options.claimPath), false);
  f.permit.expiresAt = stamp(at + 1_800_000);
  f.options.sha256 = f.write(f.options.path, f.permit);
  const validate = claimCorePermit(f.options);
  assert.equal(validate(f.binding), undefined);
  denied(() => claimCorePermit(f.options));
  t.mock.method(Date, 'now', () => at + 1_800_000);
  denied(() => validate(f.binding));
});
test('union observes revocation and cannot resume with restored permit bytes', (t) => {
  const f = fixture(t, 'ADMITTED_LOCAL_MODEL_HTTP', CORE_UNION_PROFILE);
  const validate = claimCorePermit(f.options);
  assert.equal(validate(f.binding), undefined);
  f.write(f.options.path, { ...f.permit, revoked: true });
  denied(() => validate(f.binding));
  f.write(f.options.path, f.permit);
  denied(() => validate(f.binding));
  denied(() => claimCorePermit(f.options));
});
test('B synthetic expired-in-2000 permit uses its twenty-minute ceiling; A remains ten minutes', (t) => {
  const f = fixture(t, 'ADMITTED_MODEL_HTTP', CORE_FOLLOWUP_PROFILE);
  f.permit.expiresAt = stamp(at + 1_200_000);
  f.options.sha256 = f.write(f.options.path, f.permit);
  const validate = claimCorePermit(f.options);
  assert.equal(validate.expiresAt, at + 1_200_000);
  assert.equal(validate(f.binding), undefined);
  denied(() => claimCorePermit(f.options)); // Same synthetic run cannot restart.
  t.mock.method(Date, 'now', () => at + 1_200_000);
  denied(() => validate(f.binding));
  for (const [profile, duration] of [
    [CORE_DIAGNOSTIC_PROFILE, 600_001],
    [CORE_DIAGNOSTIC_PROFILE, 1_200_000],
    [CORE_FOLLOWUP_PROFILE, 1_200_001],
  ]) {
    const g = fixture(t, 'ADMITTED_MODEL_HTTP', profile);
    g.permit.expiresAt = stamp(at + duration);
    g.options.sha256 = g.write(g.options.path, g.permit);
    denied(() => claimCorePermit(g.options));
    assert.equal(fs.existsSync(g.options.claimPath), false);
  }
});
test('B rejects an A permit and observes revocation before another dispatch', (t) => {
  const f = fixture(t, 'ADMITTED_MODEL_HTTP', CORE_FOLLOWUP_PROFILE);
  const a = coreConversationProfile();
  f.options.sha256 = f.write(f.options.path, {
    ...f.permit,
    profile: a.id,
    limitsSha256: a.limitsSha256,
  });
  denied(() => claimCorePermit(f.options));
  assert.equal(fs.existsSync(f.options.claimPath), false);
  f.options.sha256 = f.write(f.options.path, f.permit);
  const validate = claimCorePermit(f.options);
  f.write(f.options.path, { ...f.permit, revoked: true });
  denied(() => validate(f.binding));
});
test('B synthetic admission rejects each cross-profile callback binding independently', (t) => {
  for (const patch of [
    { profile: CORE_DIAGNOSTIC_PROFILE },
    { limitsSha256: coreConversationProfile().limitsSha256 },
  ]) {
    const f = fixture(t, 'ADMITTED_MODEL_HTTP', CORE_FOLLOWUP_PROFILE);
    const validate = claimCorePermit(f.options);
    assert.equal(validate(f.binding), undefined);
    denied(() => validate({ ...f.binding, ...patch }));
    denied(() => validate(f.binding)); // A refusal cannot be reset in this run.
  }
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

test('local manifests require the explicit opt-in; remote never infers authority from equal UIDs', (t) => {
  const f = fixture(t, 'ADMITTED_LOCAL_MODEL_HTTP');
  denied(() => readCoreManifest(f.manifestPath, f.manifestSha));
  for (const options of [
    {},
    { localStdin: 'true' },
    { localStdin: true, extra: true },
  ])
    denied(() => readCoreManifest(f.manifestPath, f.manifestSha, options));
  for (const edit of [
    (raw) => {
      raw.mode = 'ADMITTED_MODEL_HTTP';
    },
    (raw) => {
      raw.admissionContext.target.host = 'remote.invalid';
    },
    (raw) => {
      raw.admissionContext.target.runnerUid++;
    },
    (raw) => {
      raw.admissionContext.credentialSource.kind = 'file';
    },
    (raw) => {
      raw.admissionContext.credentialSource.kind = 'environment';
    },
    (raw) => {
      raw.admissionContext.credentialSource.reference = '/NEVER_OPENED';
    },
    (raw) => {
      raw.admissionContext.credentialSource.owner++;
    },
  ]) {
    const raw = structuredClone(f.raw);
    edit(raw);
    const pin = f.write(f.manifestPath, raw);
    denied(() => readCoreManifest(f.manifestPath, pin, { localStdin: true }));
  }
});
test('local opt-in cannot admit an ordinary remote or dry manifest', (t) => {
  const f = fixture(t);
  denied(() =>
    readCoreManifest(f.manifestPath, f.manifestSha, { localStdin: true }),
  );
  f.raw.admissionContext.target.runnerUid =
    f.raw.admissionContext.target.brokerUid;
  denied(() =>
    readCoreManifest(f.manifestPath, f.write(f.manifestPath, f.raw)),
  );
});
test(
  'local owner mode claims once and permits the same owner runner, with no credential I/O',
  { skip: process.platform !== 'darwin' },
  (t) => {
    const f = fixture(t, 'ADMITTED_LOCAL_MODEL_HTTP');
    const check = claimCorePermit(f.options);
    check(f.binding);
    assertCoreAdmission({ ...f.options, role: 'runner' })(f.binding);
    denied(() => claimCorePermit(f.options));
    fs.chmodSync(f.dir, 0o750);
    denied(() => check(f.binding));
    fs.chmodSync(f.dir, 0o700);
    denied(() => check(f.binding)); // sticky refusal even after permissions restored
  },
);
test(
  'local socket outer root and parent must remain private, canonical and owned',
  { skip: process.platform !== 'darwin' },
  (t) => {
    const f = fixture(t, 'ADMITTED_LOCAL_MODEL_HTTP');
    const parent = path.dirname(f.options.target.brokerSocket.path);
    fs.chmodSync(parent, 0o2770);
    denied(() => claimCorePermit(f.options));
    fs.chmodSync(parent, 0o700);
    fs.renameSync(parent, parent + '-actual');
    fs.symlinkSync(parent + '-actual', parent);
    denied(() => claimCorePermit(f.options));
    assert.equal(fs.existsSync(f.options.claimPath), false);
  },
);
test('local admission refuses Linux and wrong GID before a claim', (t) => {
  const f = fixture(t, 'ADMITTED_LOCAL_MODEL_HTTP');
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
  try {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    denied(() => claimCorePermit(f.options));
  } finally {
    Object.defineProperty(process, 'platform', descriptor);
  }
  t.mock.method(process, 'getgid', () => f.options.target.brokerSocket.gid + 1);
  denied(() => claimCorePermit(f.options));
  assert.equal(fs.existsSync(f.options.claimPath), false);
});
test(
  'local revocation halts the existing claim without replay',
  { skip: process.platform !== 'darwin' },
  (t) => {
    const f = fixture(t, 'ADMITTED_LOCAL_MODEL_HTTP');
    const check = claimCorePermit(f.options);
    f.permit.revoked = true;
    f.write(f.options.path, f.permit);
    denied(() => check(f.binding));
    denied(() => assertCoreAdmission({ ...f.options, role: 'runner' }));
    denied(() => claimCorePermit(f.options));
  },
);
test(
  'local expired permit cannot prompt or claim',
  { skip: process.platform !== 'darwin' },
  (t) => {
    const f = fixture(t, 'ADMITTED_LOCAL_MODEL_HTTP');
    t.mock.method(Date, 'now', () => at + 60000);
    denied(() => claimCorePermit(f.options));
    assert.equal(fs.existsSync(f.options.claimPath), false);
  },
);

test('React 3/5 profile refuses backend-only or frozen9 permit even with matching budget hash', (t) => {
  const f = fixture(t, 'ADMITTED_LOCAL_MODEL_HTTP', CORE_UI_PROFILE);
  for (const profile of [CORE_DIAGNOSTIC_PROFILE, CORE_UNION_PROFILE]) {
    f.options.sha256 = f.write(f.options.path, { ...f.permit, profile });
    denied(() => claimCorePermit(f.options));
    assert.equal(fs.existsSync(f.options.claimPath), false);
  }
  f.options.sha256 = f.write(f.options.path, f.permit);
  const validate = claimCorePermit(f.options);
  validate(f.binding);
  denied(() => validate({ ...f.binding, profile: CORE_DIAGNOSTIC_PROFILE }));
});

test('React profile keeps ten-minute expiry and single-use claim', (t) => {
  const f = fixture(t, 'ADMITTED_LOCAL_MODEL_HTTP', CORE_UI_PROFILE);
  f.options.sha256 = f.write(f.options.path, {
    ...f.permit,
    expiresAt: stamp(at + 600001),
  });
  denied(() => claimCorePermit(f.options));
  f.options.sha256 = f.write(f.options.path, f.permit);
  const validate = claimCorePermit(f.options);
  denied(() => claimCorePermit(f.options));
  t.mock.method(Date, 'now', () => at + 60000);
  denied(() => validate(f.binding));
});
