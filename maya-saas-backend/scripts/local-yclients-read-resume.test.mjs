// Synthetic metadata and temporary public fixture files only. No TTY, AppModule,
// listener, owner state, PostgreSQL, credentials, provider or model is opened.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PRIVATE_KEYS, profileEnvironment } from './local-onboarding-profile.mjs';
import { PUBLIC_DIAGNOSTIC_PARTNER, createDiagnostic, diagnosticFailure, diagnosticStage } from './local-yclients-read.mjs';
import { assertResumeReceipts, assertSourceTransition, resumePlan, resumeEnvironment, readOwnedBytes, claimResume, releaseResume, ownedDirectoryIdentity, clusterSystemIdentifier, assertDatabaseIdentity } from './local-yclients-read-resume.mjs';

const state = '/private/tmp/maya-resume-unit-state';
const output = '/private/tmp/maya-resume-unit-output';
const pins = { initial: 'a'.repeat(64), privateState: 'b'.repeat(64) };
const row = (name, value = 'a') => ({ path: name, gitBlob: value.repeat(40), sha256: value.repeat(64) });
const originalSource = () => ({ head: '1'.repeat(40), files: [
  row('maya-saas-backend/prisma/schema.prisma'),
  row('maya-saas-backend/prisma/migrations/20261001_base/migration.sql'),
  row('maya-saas-backend/prisma.config.ts'),
  row('maya-saas-backend/src/onboarding.service.ts'),
] });
function metadata() {
  const initial = { contract: 'maya.normal-local-onboarding-session/1', status: 'stopped', providerAdmission: false, qualifiedAcceptance: false,
    stateDirectory: state, ownedCluster: state + '/pg', creation: 'fresh-exclusive-directory_then-initdb',
    completed: ['backend-build', 'react-build', 'initdb', 'pg-start', 'createdb', 'migrations'],
    clusterStopped: true, runtimeGroupAbsent: true, sourceUnchanged: true, privateStateRetained: true,
    readyAt: '2026-10-10T10:00:00.000Z', resources: { nodeHeapMb: 3072, pgSharedBuffersMb: 64, pgWorkMemMb: 4, pgMaxConnections: 30 }, source: originalSource(),
  };
  const receipt = { contract: 'maya.local-onboarding-restart-proof/1', status: 'cancelled', providerAdmission: false, qualifiedAcceptance: false,
    stateDirectory: state, ownedCluster: state + '/pg', initialManifestSha256: pins.initial, privateStateSha256: pins.privateState,
    initialReadyAt: initial.readyAt, resources: structuredClone(initial.resources), source: structuredClone(initial.source),
    completed: ['pg-start', 'runtime'], clusterStopped: true, runtimeGroupAbsent: true, sourceUnchanged: true, samePrivateState: true,
    initialManifestUnchanged: true, helperExecutesNoInitdbMigrationSeedOrSignup: true,
    readyAt: '2026-10-10T11:00:00.000Z', expiresAt: '2026-10-10T11:15:00.000Z',
  };
  return { initial, receipt };
}
function savedEnvironment() {
  return profileEnvironment({}, {
    databaseUrl: 'postgresql://maya_local_onboarding:' + 'c'.repeat(64) + '@127.0.0.1:55431/maya_local_onboarding_0123456789abcdef',
    keys: Object.fromEntries(PRIVATE_KEYS.map((key, i) => [key, (i + 1).toString(16).padStart(64, '0')])),
    apiPort: 55432, origin: 'http://127.0.0.1:55433', stateDirectory: state,
  });
}

test('resume requires both original stopped stage0 and exact completed restart receipt', () => {
  const { initial, receipt } = metadata();
  assert.doesNotThrow(() => assertResumeReceipts(initial, receipt, state, pins));
  initial.status = 'cancelled'; assert.doesNotThrow(() => assertResumeReceipts(initial, receipt, state, pins));
  for (const status of ['ready', 'preparing', 'failed', 'failed-source-changed']) {
    const copy = metadata(); copy.initial.status = status;
    assert.throws(() => assertResumeReceipts(copy.initial, copy.receipt, state, pins));
    const fresh = metadata(); fresh.receipt.status = status;
    assert.throws(() => assertResumeReceipts(fresh.initial, fresh.receipt, state, pins));
  }
});
test('foreign state, changed key pins, incomplete cleanup and source cannot reuse a receipt', () => {
  const corruptions = [
    r => { r.stateDirectory = '/private/tmp/another-state'; }, r => { r.ownedCluster += '-other'; },
    r => { r.initialManifestSha256 = 'c'.repeat(64); }, r => { r.privateStateSha256 = 'c'.repeat(64); },
    r => { r.source.head = '2'.repeat(40); }, r => { r.completed = ['pg-start']; },
    r => { r.providerAdmission = true; }, r => { r.resources.pgMaxConnections = 31; },
    r => { r.readyAt = undefined; }, r => { r.initialReadyAt = r.readyAt; },
    ...['clusterStopped', 'runtimeGroupAbsent', 'sourceUnchanged', 'samePrivateState', 'initialManifestUnchanged', 'helperExecutesNoInitdbMigrationSeedOrSignup'].map(key => r => { r[key] = false; }),
  ];
  for (const change of corruptions) {
    const { initial, receipt } = metadata(); change(receipt);
    assert.throws(() => assertResumeReceipts(initial, receipt, state, pins));
  }
});
test('approved application correction is allowed only at exact candidate with identical canonical schema', () => {
  const old = originalSource(), candidate = structuredClone(old); candidate.head = '2'.repeat(40);
  candidate.files[3] = row(candidate.files[3].path, 'b'); candidate.files.push(row('maya-saas-backend/scripts/local-yclients-read-resume.mjs', 'c'));
  assert.doesNotThrow(() => assertSourceTransition(old, candidate, candidate.head));
  assert.throws(() => assertSourceTransition(old, candidate, old.head), /approved_source_required/);
  assert.throws(() => assertSourceTransition(old, candidate, undefined), /approved_source_required/);
  const docsOnly = { ...structuredClone(old), head: candidate.head };
  assert.doesNotThrow(() => assertSourceTransition(old, docsOnly, docsOnly.head));
});
test('schema, migration, deletion, duplicate and malformed source pins fail closed', () => {
  for (const change of [
    s => { s.files[0] = row(s.files[0].path, 'b'); },
    s => { s.files[1] = row(s.files[1].path, 'b'); },
    s => { s.files[2] = row(s.files[2].path, 'b'); },
    s => { s.files.push(row('maya-saas-backend/prisma/migrations/new/migration.sql')); },
    s => { s.files.pop(); }, s => { s.files.push(s.files[0]); },
    s => { s.files[0].path = '../private-state'; }, s => { s.files[0].sha256 = 'not-a-hash'; },
  ]) {
    const old = originalSource(), candidate = structuredClone(old); candidate.head = '2'.repeat(40); change(candidate);
    assert.throws(() => assertSourceTransition(old, candidate, candidate.head));
  }
});
test('resume plan builds approved app and starts only same existing PG with separate logs', () => {
  const env = savedEnvironment(), before = structuredClone(env);
  for (const minutes of [1, 15]) {
    const plan = resumePlan(env, state, '/opt/homebrew/opt/postgresql@16/bin', minutes, output);
    assert.deepEqual(plan.setup.map(s => s.name), ['backend-build', 'react-build', 'pg-start']);
    assert.equal(plan.durationMs, minutes * 60000); assert.equal(plan.cluster, state + '/pg');
    assert.equal(plan.providerAdmission, 'explicit_setup_reads_only');
    assert.equal(path.basename(plan.runtime.args[0]), 'local-yclients-read-runtime.mjs');
    assert.equal(plan.runtime.args.length, 1);
    const pg = plan.setup[2]; assert.equal(pg.args[pg.args.indexOf('-D') + 1], state + '/pg');
    assert.equal(pg.args[pg.args.indexOf('-l') + 1], output + '/postgres.log');
    assert.equal(plan.stop.args[plan.stop.args.indexOf('-D') + 1], state + '/pg');
  }
  assert.deepEqual(env, before);
  for (const minutes of [0, 16, NaN, 1.5]) assert.throws(() => resumePlan(env, state, '/tmp/pg-bin', minutes, output));
  for (const destination of [state, state + '/output', undefined]) assert.throws(() => resumePlan(env, state, '/tmp/pg-bin', 1, destination));
});
test('resume keeps every saved key and database in memory without altering original stage0 environment', () => {
  const saved = savedEnvironment(), before = structuredClone(saved);
  const env = resumeEnvironment(saved, 'PublicOnlyResumePartnerFixture123');
  assert.deepEqual(saved, before); assert.equal(Object.hasOwn(saved, 'YCLIENTS_PARTNER_TOKEN'), false);
  for (const key of [...PRIVATE_KEYS, 'DATABASE_URL', 'PORT', 'CORS_ALLOWED_ORIGINS', 'MAYA_LOCAL_ONBOARDING_STATE']) assert.equal(env[key], saved[key]);
  assert.equal(env.MAYA_LOCAL_YCLIENTS_READ_PROFILE, 'read_setup_v1'); assert.equal(Object.hasOwn(env, 'MAYA_LOCAL_ONBOARDING_PROFILE'), false);
  assert.equal(env.AI_CORE_PROVIDER, 'safe'); assert.equal(env.CRM_RECONCILIATION_SCHEDULER_ENABLED, 'false');
  for (const token of [PUBLIC_DIAGNOSTIC_PARTNER, '', undefined]) assert.throws(() => resumeEnvironment(saved, token));
  assert.throws(() => resumeEnvironment({ ...saved, CRM_RECONCILIATION_SCHEDULER_ENABLED: 'true' }, 'PublicOnlyResumePartnerFixture123'));
});
test('owned file reader refuses symlink, hardlink, public mode and oversize without echoing contents', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-resume-unit-'));
  try {
    const file = path.join(dir, 'public-fixture'); fs.writeFileSync(file, 'public synthetic fixture', { mode: 0o600 });
    const bytes = readOwnedBytes(file, 100); assert.equal(bytes.toString(), 'public synthetic fixture'); bytes.fill(0);
    assert.throws(() => readOwnedBytes(file, 2), /private_file_refused/);
    const link = path.join(dir, 'link'); fs.symlinkSync(file, link); assert.throws(() => readOwnedBytes(link, 100), /private_file_refused/);
    fs.unlinkSync(link); fs.linkSync(file, link); assert.throws(() => readOwnedBytes(file, 100), /private_file_refused/);
    fs.unlinkSync(link); fs.chmodSync(file, 0o644); assert.throws(() => readOwnedBytes(file, 100), /private_file_refused/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('same shared lock prevents takeover and cleanup never removes a replaced claim', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-resume-unit-'));
  try {
    const claim = claimResume(dir, { contract: 'synthetic-only' });
    assert.throws(() => claimResume(dir, { contract: 'second' }), { code: 'EEXIST' });
    releaseResume(claim); assert.equal(fs.existsSync(claim.filename), false);
    const next = claimResume(dir, { contract: 'synthetic-only' });
    const replacement = path.join(dir, 'replacement'); fs.writeFileSync(replacement, 'do not delete', { mode: 0o600 });
    fs.renameSync(replacement, next.filename);
    assert.throws(() => releaseResume(next), /resume_claim_changed/);
    assert.equal(fs.readFileSync(next.filename, 'utf8'), 'do not delete');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('diagnostic resume reuses the existing one-minute network-closed profile without owner input', () => {
  const saved = savedEnvironment();
  const plan = resumePlan(saved, state, '/tmp/pg-bin', 15, output, true);
  assert.equal(plan.diagnosticNoProvider, true);
  assert.equal(plan.providerAdmission, 'diagnostic_network_closed');
  assert.equal(plan.durationMs, 60000);
  assert.equal(plan.runtime.args[1], '--diagnostic-no-provider');
  const env = resumeEnvironment(saved, undefined, true);
  assert.equal(env.YCLIENTS_PARTNER_TOKEN, PUBLIC_DIAGNOSTIC_PARTNER);
  assert.equal(env.DATABASE_URL, saved.DATABASE_URL);
  assert.throws(() => resumeEnvironment(saved, 'NeverReadOwnerValueHere', true));
  for (const minutes of [0, 16, NaN]) assert.throws(() => resumePlan(saved, state, '/tmp/pg-bin', minutes, output, true));
  const diagnostic = createDiagnostic(true);
  diagnosticFailure(diagnostic, 'preparation_stage_failed');
  assert.doesNotThrow(() => diagnosticStage(diagnostic, 'stopped', 'completed'));
  assert.equal(diagnostic.outcome, 'failed');
});
test('PG identity requires exact saved database, role, local port, directory and pre-start system', () => {
  const env = savedEnvironment(), db = new URL(env.DATABASE_URL), system = '7340123456789000001';
  assert.equal(clusterSystemIdentifier('pg_control version number:            1300\nDatabase system identifier:           ' + system + '\nLatest checkpoint location:           0/1'), system);
  for (const text of ['', 'Database system identifier: arbitrary', 'Database system identifier: 1\nDatabase system identifier: 2']) assert.throws(() => clusterSystemIdentifier(text));
  const identity = { database: db.pathname.slice(1), user: db.username, address: '127.0.0.1', port: Number(db.port), directory: state + '/pg', system, readOnly: 'on' };
  const projection = assertDatabaseIdentity(identity, env, state + '/pg', system);
  assert.equal(projection.samePreStartSystem, true);
  assert.equal(projection.historicalSystemIdentity, 'not_recorded_in_stage0');
  assert.equal(JSON.stringify(projection).includes(system), false);
  for (const [key, value] of Object.entries({ database: 'other', user: 'other', address: '::1', port: 5432, directory: state + '/other', system: '7340123456789000002', readOnly: 'off' })) {
    assert.throws(() => assertDatabaseIdentity({ ...identity, [key]: value }, env, state + '/pg', system), /running_database_identity_refused/);
  }
  assert.throws(() => assertDatabaseIdentity({ ...identity, unclosed: 'extra' }, env, state + '/pg', system));
});
test('PG and state directory replacement is refused before any lifecycle command can use it', () => {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'maya-resume-unit-')));
  try {
    const directory = path.join(temp, 'owned'); fs.mkdirSync(directory, { mode: 0o700 });
    const identity = ownedDirectoryIdentity(directory);
    assert.deepEqual(ownedDirectoryIdentity(directory, identity), identity);
    fs.renameSync(directory, directory + '-old'); fs.mkdirSync(directory, { mode: 0o700 });
    assert.throws(() => ownedDirectoryIdentity(directory, identity), /owned_directory_changed/);
    fs.rmdirSync(directory); fs.symlinkSync(directory + '-old', directory);
    assert.throws(() => ownedDirectoryIdentity(directory, identity));
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
