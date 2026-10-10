// Explicit transition of one stopped, owned stage-0 database into the existing
// setup-read profile. No initdb, migration, seed, signup or credential rotation.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { PRIVATE_KEYS, assertPrivateCwd, assertProfileEnvironment, externalStatePath } from './local-onboarding-profile.mjs';
import { assertCompletedSession } from './local-onboarding-proof.mjs';
import { stage } from './local-onboarding.mjs';
import { realReadEnvironment } from './local-yclients-read-profile.mjs';
import { createDiagnostic, diagnosticFailure, diagnosticStage, promptPartnerToken, readSessionPlan, readSourceBinding, runReadRuntime, runtimeCredential } from './local-yclients-read.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const commit = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const jsonEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ordinary = (stat, mode) => stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o777) === mode && stat.nlink === 1;
const schemaPath = name => name.startsWith('maya-saas-backend/prisma/') || name === 'maya-saas-backend/prisma.config.ts';

// Errors contain closed labels only. Never let an assertion print private bytes.
export function readOwnedBytes(filename, cap, mode = 0o600) {
  const before = fs.lstatSync(filename);
  assert.ok(ordinary(before, mode) && before.size > 0 && before.size <= cap, 'private_file_refused');
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  let bytes;
  try {
    const opened = fs.fstatSync(fd);
    assert.ok(ordinary(opened, mode) && opened.dev === before.dev && opened.ino === before.ino && opened.size === before.size, 'private_file_changed');
    bytes = Buffer.alloc(opened.size);
    for (let offset = 0; offset < bytes.length;) {
      const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
      assert.ok(count > 0, 'private_file_truncated'); offset += count;
    }
    const after = fs.fstatSync(fd), current = fs.lstatSync(filename);
    assert.ok(ordinary(after, mode) && ordinary(current, mode) && after.size === opened.size && after.mtimeMs === opened.mtimeMs && after.ctimeMs === opened.ctimeMs && current.dev === opened.dev && current.ino === opened.ino, 'private_file_changed');
    return bytes;
  } catch (error) { bytes?.fill(0); throw error; }
  finally { fs.closeSync(fd); }
}
function pinnedJson(filename, cap, expectedHash) {
  assert.ok(hash(expectedHash), 'private_pin_required');
  const bytes = readOwnedBytes(filename, cap);
  try { assert.ok(digest(bytes) === expectedHash, 'private_pin_changed'); return JSON.parse(bytes.toString('utf8')); }
  finally { bytes.fill(0); }
}
function unchanged(filename, cap, expectedHash) {
  const bytes = readOwnedBytes(filename, cap);
  try { return digest(bytes) === expectedHash; } finally { bytes.fill(0); }
}

export function assertResumeReceipts(initial, receipt, state, pins) {
  assert.ok(hash(pins.initial) && hash(pins.privateState), 'receipt_pins_required');
  // Keep the existing strict stage-0 owner contract. Historical source identity
  // is verified separately against Git; approved candidate changes are explicit.
  assertCompletedSession(initial, state, initial.source);
  assert.equal(receipt?.contract, 'maya.local-onboarding-restart-proof/1');
  assert.ok(['stopped', 'cancelled'].includes(receipt.status), 'latest_restart_not_stopped');
  assert.equal(receipt.providerAdmission, false); assert.equal(receipt.qualifiedAcceptance, false);
  assert.equal(receipt.stateDirectory, state); assert.equal(receipt.ownedCluster, path.join(state, 'pg'));
  assert.equal(receipt.initialManifestSha256, pins.initial); assert.equal(receipt.privateStateSha256, pins.privateState);
  assert.equal(receipt.initialReadyAt, initial.readyAt);
  assert.ok(jsonEqual(receipt.source, initial.source), 'restart_source_mismatch');
  assert.ok(jsonEqual(receipt.resources, initial.resources), 'restart_resources_mismatch');
  assert.ok(jsonEqual(receipt.completed, ['pg-start', 'runtime']), 'restart_incomplete');
  for (const key of ['clusterStopped', 'runtimeGroupAbsent', 'sourceUnchanged', 'samePrivateState', 'initialManifestUnchanged', 'helperExecutesNoInitdbMigrationSeedOrSignup']) assert.equal(receipt[key], true, 'restart_fence_failed');
  assert.ok(Number.isFinite(Date.parse(receipt.readyAt)) && Date.parse(receipt.readyAt) >= Date.parse(initial.readyAt), 'restart_readiness_missing');
  assert.ok(Number.isFinite(Date.parse(receipt.expiresAt)) && Date.parse(receipt.expiresAt) > Date.parse(receipt.readyAt), 'restart_window_invalid');
}

export function assertSourceTransition(initial, candidate, approvedCommit) {
  assert.ok(commit(approvedCommit) && candidate?.head === approvedCommit && commit(initial?.head), 'approved_source_required');
  const rows = source => {
    assert.ok(Array.isArray(source.files) && source.files.length > 0 && source.files.length <= 10000, 'source_list_refused');
    const result = new Map();
    for (const row of source.files) {
      assert.ok(row && Object.keys(row).length === 3 && typeof row.path === 'string' && /^[A-Za-z0-9_./-]+$/.test(row.path) && !row.path.split('/').includes('..') && !path.isAbsolute(row.path) && commit(row.gitBlob) && hash(row.sha256) && !result.has(row.path), 'source_row_refused');
      result.set(row.path, row);
    }
    return result;
  };
  const old = rows(initial), current = rows(candidate);
  // This finite transition supports additions and approved application fixes,
  // not removal of the previously captured application or a schema migration.
  for (const name of old.keys()) assert.ok(current.has(name), 'original_source_path_missing');
  assert.ok(old.has('maya-saas-backend/prisma/schema.prisma') && old.has('maya-saas-backend/prisma.config.ts'), 'canonical_schema_missing');
  const schema = entries => [...entries.values()].filter(row => schemaPath(row.path)).sort((a, b) => a.path.localeCompare(b.path));
  assert.ok(schema(old).some(row => row.path.startsWith('maya-saas-backend/prisma/migrations/')), 'canonical_migrations_missing');
  assert.ok(jsonEqual(schema(old), schema(current)), 'schema_or_migrations_changed');
}
function verifyHistoricalGitSource(initial, candidate, approvedCommit) {
  assertSourceTransition(initial, candidate, approvedCommit);
  const result = execFileSync('git', ['ls-tree', '-r', initial.head], { cwd: repo, encoding: 'utf8', timeout: 10000, maxBuffer: 16 * 1024 * 1024 });
  const tree = new Map(result.trim().split('\n').map(line => {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(line);
    return match ? [match[3], match[2]] : ['', null];
  }));
  for (const row of initial.files) assert.ok(tree.get(row.path) === row.gitBlob, 'historical_source_blob_mismatch');
  const historicalSchema = [...tree.keys()].filter(schemaPath).sort();
  assert.ok(jsonEqual(historicalSchema, initial.files.map(row => row.path).filter(schemaPath).sort()), 'historical_schema_capture_incomplete');
}

export function resumePlan(env, state, pgBin, minutes, output, diagnosticNoProvider = false) {
  assert.ok(Number.isSafeInteger(minutes) && minutes >= 1 && minutes <= 15, 'session_window_refused');
  assertProfileEnvironment(env);
  assert.ok(env.MAYA_LOCAL_ONBOARDING_STATE === state, 'saved_state_mismatch');
  assert.ok(typeof output === 'string' && path.isAbsolute(output) && output !== state && !output.startsWith(state + path.sep), 'separate_output_required');
  const db = new URL(env.DATABASE_URL), web = new URL(env.CORS_ALLOWED_ORIGINS);
  const plan = readSessionPlan({ stateDirectory: state, pgBin, database: db.pathname.slice(1), pgPort: Number(db.port), apiPort: Number(env.PORT), webPort: Number(web.port), minutes, diagnosticNoProvider });
  // Compiling the explicitly approved candidate does not migrate the retained DB.
  const setup = plan.setup.filter(spec => ['backend-build', 'react-build', 'pg-start'].includes(spec.name)).map(spec => {
    if (spec.name !== 'pg-start') return spec;
    const args = [...spec.args], logIndex = args.indexOf('-l');
    assert.ok(logIndex >= 0, 'postgres_log_target_required');
    args[logIndex + 1] = path.join(output, 'postgres.log');
    return { ...spec, args };
  });
  return { ...plan, setup };
}
export function resumeEnvironment(saved, partner, diagnosticNoProvider = false) {
  assert.equal(typeof diagnosticNoProvider, 'boolean');
  assertProfileEnvironment(saved);
  const env = { ...saved };
  delete env.MAYA_LOCAL_ONBOARDING_PROFILE;
  env.MAYA_LOCAL_YCLIENTS_READ_PROFILE = 'read_setup_v1';
  // Reuse the existing profile constructor/validator, without any RNG or file write.
  return realReadEnvironment(env, {
    databaseUrl: saved.DATABASE_URL,
    keys: Object.fromEntries(PRIVATE_KEYS.map(key => [key, saved[key]])),
    apiPort: Number(saved.PORT), origin: saved.CORS_ALLOWED_ORIGINS,
    stateDirectory: saved.MAYA_LOCAL_ONBOARDING_STATE,
  }, runtimeCredential(diagnosticNoProvider, partner));
}
export function ownedDirectoryIdentity(directory, expected) {
  assertPrivateCwd(directory);
  const stat = fs.lstatSync(directory), identity = { dev: stat.dev, ino: stat.ino };
  assert.ok(!expected || (identity.dev === expected.dev && identity.ino === expected.ino), 'owned_directory_changed');
  return identity;
}
export function clusterSystemIdentifier(output) {
  assert.ok(typeof output === 'string' && output.length <= 65536, 'cluster_metadata_refused');
  const values = [...output.matchAll(/^Database system identifier:\s+(\d{1,20})\s*$/gm)];
  assert.ok(values.length === 1, 'cluster_identity_missing');
  return values[0][1];
}
function stoppedSystemIdentity(pgBin, state) {
  const result = spawnSync(path.join(pgBin, 'pg_controldata'), ['-D', path.join(state, 'pg')], {
    cwd: state, encoding: 'utf8', timeout: 10000, killSignal: 'SIGKILL', maxBuffer: 65536,
    env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' },
  });
  assert.ok(result.status === 0 && !result.error, 'cluster_metadata_failed');
  return clusterSystemIdentifier(result.stdout);
}
export function assertDatabaseIdentity(value, env, cluster, system) {
  assertProfileEnvironment(env);
  const db = new URL(env.DATABASE_URL);
  assert.ok(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 7 &&
    value.database === db.pathname.slice(1) && value.user === db.username && value.address === '127.0.0.1' &&
    value.port === Number(db.port) && value.directory === cluster && value.system === system && value.readOnly === 'on', 'running_database_identity_refused');
  return { systemIdentifierSha256: digest(system), databaseSha256: digest(value.database), samePreStartSystem: true,
    exactOwnedDirectory: true, exactOwnedPort: true, exactOwnedRole: true, queryReadOnly: true,
    historicalSystemIdentity: 'not_recorded_in_stage0' };
}
function runningDatabaseIdentity(pgBin, state, env, system) {
  const db = new URL(env.DATABASE_URL);
  const result = spawnSync(path.join(pgBin, 'psql'), ['-X', '-t', '-A', '--no-password', '--set=ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', db.port, '-U', db.username, '-d', db.pathname.slice(1)], {
    cwd: state, encoding: 'utf8', timeout: 10000, killSignal: 'SIGKILL', maxBuffer: 65536,
    input: "SELECT json_build_object('database',current_database(),'user',current_user,'address',host(inet_server_addr()),'port',inet_server_port(),'directory',current_setting('data_directory'),'system',(SELECT system_identifier::text FROM pg_control_system()),'readOnly',current_setting('default_transaction_read_only'));",
    env: { PATH: '/usr/bin:/bin', LANG: 'C', PGPASSFILE: path.join(state, 'pgpass'), PGCONNECT_TIMEOUT: '3', PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=5000' },
  });
  assert.ok(result.status === 0 && !result.error, 'owned_identity_query_failed');
  let value;
  try { value = JSON.parse(result.stdout.trim()); } catch { throw new Error('owned_identity_response_refused'); }
  return assertDatabaseIdentity(value, env, path.join(state, 'pg'), system);
}
function assertClusterStopped(state) {
  const cluster = path.join(state, 'pg');
  assertPrivateCwd(cluster);
  assert.equal(fs.existsSync(path.join(cluster, 'postmaster.pid')), false, 'active_cluster_refused');
  const version = readOwnedBytes(path.join(cluster, 'PG_VERSION'), 16);
  try { assert.ok(version.toString('utf8').trim() === '16', 'postgres_version_refused'); }
  finally { version.fill(0); }
}
function checkPgpass(state, env) {
  const db = new URL(env.DATABASE_URL), bytes = readOwnedBytes(path.join(state, 'pgpass'), 4096);
  try {
    assert.ok(bytes.toString('utf8') === `127.0.0.1:${db.port}:*:maya_local_onboarding:${db.password}\n`, 'owned_pgpass_mismatch');
    return digest(bytes);
  } finally { bytes.fill(0); }
}
export function claimResume(state, metadata) {
  const filename = path.join(state, 'restart-proof.lock');
  const fd = fs.openSync(filename, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeSync(fd, JSON.stringify(metadata) + '\n'); return { filename, stat: fs.fstatSync(fd) }; }
  finally { fs.closeSync(fd); }
}
export function releaseResume(claim) {
  const current = fs.lstatSync(claim.filename);
  assert.ok(current.dev === claim.stat.dev && current.ino === claim.stat.ino && ordinary(current, 0o600), 'resume_claim_changed');
  fs.unlinkSync(claim.filename);
}

export async function main(args) {
  const { values } = parseArgs({ args, strict: true, options: {
    run: { type: 'boolean' }, 'diagnostic-no-provider': { type: 'boolean' }, state: { type: 'string' }, output: { type: 'string' },
    'restart-receipt': { type: 'string' }, 'restart-receipt-sha256': { type: 'string' },
    'session-manifest-sha256': { type: 'string' }, 'private-state-sha256': { type: 'string' },
    'approved-source-commit': { type: 'string' }, minutes: { type: 'string', default: '15' },
    'pg-bin': { type: 'string', default: '/opt/homebrew/opt/postgresql@16/bin' },
  } });
  if (!values.run) { process.stdout.write('Prepared only. Explicit --run with pinned completed stage-0 state, restart receipt and approved source resumes the same database and existing keys. No service or credential prompt started.\n'); return; }
  assert.equal(process.platform, 'darwin');
  const diagnosticNoProvider = values['diagnostic-no-provider'] === true;
  if (!diagnosticNoProvider) { assert.equal(process.stdin.isTTY, true, 'owner_terminal_required'); assert.equal(process.stderr.isTTY, true, 'owner_terminal_required'); }
  assert.ok(typeof values.state === 'string' && path.isAbsolute(values.state), 'state_required');
  const state = fs.realpathSync(values.state); assert.equal(state, values.state); assertPrivateCwd(state);
  const relative = path.relative(fs.realpathSync(repo), state);
  assert.ok(relative === '..' || relative.startsWith('..' + path.sep), 'state_inside_repository_refused');
  assert.ok(typeof values['restart-receipt'] === 'string' && path.isAbsolute(values['restart-receipt']), 'restart_receipt_required');
  const receiptPath = fs.realpathSync(values['restart-receipt']);
  assert.equal(receiptPath, values['restart-receipt']); assert.equal(path.basename(receiptPath), 'restart.json'); assertPrivateCwd(path.dirname(receiptPath));
  const pins = { initial: values['session-manifest-sha256'], privateState: values['private-state-sha256'], receipt: values['restart-receipt-sha256'] };
  const initialPath = path.join(state, 'manifest.json'), privatePath = path.join(state, 'service-keys.json');
  const initial = pinnedJson(initialPath, 16 * 1024 * 1024, pins.initial);
  const receipt = pinnedJson(receiptPath, 16 * 1024 * 1024, pins.receipt);
  assertResumeReceipts(initial, receipt, state, pins);
  const source = readSourceBinding(); verifyHistoricalGitSource(initial.source, source, values['approved-source-commit']);
  for (const dir of ['maya-saas-backend', 'maya-saas-backend/prisma', 'maya-carrier-react']) for (const name of ['.env', '.env.local']) assert.equal(fs.existsSync(path.join(repo, dir, name)), false, 'build_dotenv_refused');
  const privateState = pinnedJson(privatePath, 65536, pins.privateState);
  assert.ok(privateState?.contract === 'maya.local-onboarding-private-state/1' && jsonEqual(Object.keys(privateState).sort(), ['contract', 'environment']), 'saved_environment_refused');
  const env = privateState.environment; assertProfileEnvironment(env);
  assert.ok(initial.landingUrl === env.CORS_ALLOWED_ORIGINS + '/__local-onboarding' && receipt.landingUrl === initial.landingUrl, 'saved_origin_mismatch');
  const output = externalStatePath(values.output, repo);
  const plan = resumePlan(env, state, values['pg-bin'], Number(values.minutes), output, diagnosticNoProvider);
  const stateIdentity = ownedDirectoryIdentity(state), clusterIdentity = ownedDirectoryIdentity(plan.cluster);
  const directoriesUnchanged = () => { ownedDirectoryIdentity(state, stateIdentity); ownedDirectoryIdentity(plan.cluster, clusterIdentity); };
  assertClusterStopped(state); const pgpassHash = checkPgpass(state, env);
  for (const name of ['pg_ctl', 'pg_controldata', 'psql']) fs.accessSync(path.join(values['pg-bin'], name), fs.constants.X_OK);
  const claim = claimResume(state, { contract: 'maya.local-yclients-read-resume-claim/1', pid: process.pid, initialManifestSha256: pins.initial, restartReceiptSha256: pins.receipt, approvedSource: source.head });
  let report, save, attempted = false, timer, failed = false, phase = 'preflight', runtimeEnv, systemIdentity;
  const control = { cancelled: null, terminate: null };
  const cancel = signal => { control.cancelled ??= signal; control.terminate?.(); };
  const int = () => cancel('SIGINT'), term = () => cancel('SIGTERM');
  const inputsUnchanged = () => { directoriesUnchanged(); return unchanged(initialPath, 16 * 1024 * 1024, pins.initial) && unchanged(privatePath, 65536, pins.privateState) && unchanged(receiptPath, 16 * 1024 * 1024, pins.receipt) && checkPgpass(state, env) === pgpassHash; };
  try {
    fs.mkdirSync(output, { mode: 0o700 }); assertPrivateCwd(output);
    report = { contract: 'maya.local-yclients-read-resume/1', status: 'preparing', providerAdmission: 'not_started', qualifiedAcceptance: false,
      source, initialSourceHead: initial.source.head, initialManifestSha256: pins.initial, completedRestartSha256: pins.receipt,
      stateDirectory: state, ownedCluster: plan.cluster, samePrivateState: true, completed: [], resources: initial.resources,
      privateStateRetained: true, partnerTokenPersistence: false, executesNoInitdbMigrationSeedOrSignup: true,
      diagnostic: createDiagnostic(diagnosticNoProvider) };
    save = () => fs.writeFileSync(path.join(output, 'resume.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    save(); process.on('SIGINT', int); process.on('SIGTERM', term);
    assert.ok(inputsUnchanged(), 'resume_inputs_changed'); assertClusterStopped(state);
    systemIdentity = stoppedSystemIdentity(values['pg-bin'], state);
    timer = setTimeout(() => cancel('PREPARATION_DEADLINE'), plan.preparationDeadlineMs);
    phase = 'preparation';
    for (const spec of plan.setup) {
      assert.equal(control.cancelled, null);
      if (spec.name === 'pg-start') {
        directoriesUnchanged(); assertClusterStopped(state);
        assert.ok(stoppedSystemIdentity(values['pg-bin'], state) === systemIdentity, 'cluster_identity_changed'); attempted = true;
      }
      report.diagnostic.preparationStep = spec.name; save();
      const stageEnv = spec.name.endsWith('-build') ? Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'LANG', 'TZ', 'NODE_OPTIONS'].filter(key => env[key] !== undefined).map(key => [key, env[key]])) : env;
      await stage(spec, stageEnv, output, control);
      if (spec.name === 'pg-start') { directoriesUnchanged(); report.databaseIdentity = runningDatabaseIdentity(values['pg-bin'], state, env, systemIdentity); }
      report.completed.push(spec.name); save();
    }
    assert.ok(inputsUnchanged() && jsonEqual(readSourceBinding(), source), 'resume_inputs_or_source_changed');
    assert.equal(control.cancelled, null); clearTimeout(timer); report.diagnostic.preparationStep = null;
    phase = 'input';
    let partner;
    if (!diagnosticNoProvider) {
      const abort = new AbortController(); control.terminate = () => abort.abort();
      report.status = 'waiting_input'; diagnosticStage(report.diagnostic, 'waiting_input'); save();
      process.stdout.write('Same-database preparation ready. Owner input is required in this terminal; the 1–15 minute web session starts only after backend and web readiness.\n');
      partner = await promptPartnerToken({ timeoutMs: plan.promptDeadlineMs, signal: abort.signal });
      control.terminate = null;
    }
    runtimeEnv = resumeEnvironment(env, partner, diagnosticNoProvider); partner = undefined;
    report.diagnostic.credentialAccepted = !diagnosticNoProvider;
    assert.ok(inputsUnchanged() && jsonEqual(readSourceBinding(), source), 'resume_inputs_or_source_changed'); assert.equal(control.cancelled, null);
    phase = 'runtime'; report.status = 'backend_starting'; diagnosticStage(report.diagnostic, 'backend_starting'); save();
    await runReadRuntime(plan, runtimeEnv, state, control, report, save);
    report.status = control.cancelled ? 'cancelled' : 'stopped';
  } catch (error) {
    failed = true;
    if (report) {
      const cancelled = control.cancelled || error?.code === 'local_yclients_read_cancelled';
      report.status = cancelled ? 'cancelled' : 'failed';
      diagnosticFailure(report.diagnostic, cancelled ? 'session_cancelled' : phase === 'input' ? 'input_invalid' : phase === 'preparation' ? 'preparation_stage_failed' : 'preflight_refused');
    }
  } finally {
    // The claim is released even if a diagnostic projection or evidence write
    // fails. Never signal a replacement directory/system during cleanup.
    try {
      clearTimeout(timer); control.terminate = null;
      if (runtimeEnv) delete runtimeEnv.YCLIENTS_PARTNER_TOKEN;
      if (attempted) {
        try {
          directoriesUnchanged();
          assert.ok(stoppedSystemIdentity(values['pg-bin'], state) === systemIdentity, 'cluster_identity_changed');
          await stage(plan.stop, env, output, { cancelled: null, terminate: null });
          directoriesUnchanged(); assertClusterStopped(state);
          if (report) report.clusterStopped = true;
        } catch { failed = true; if (report) { report.clusterStopped = false; diagnosticFailure(report.diagnostic, 'cleanup_failed', { cleanup: true }); } }
      }
      if (report) {
        try { report.samePrivateState = inputsUnchanged(); report.sourceUnchanged = jsonEqual(readSourceBinding(), source); }
        catch { report.samePrivateState = false; report.sourceUnchanged = false; }
        if (!report.samePrivateState || !report.sourceUnchanged) { failed = true; diagnosticFailure(report.diagnostic, 'source_changed', { cleanup: true }); }
        if (failed && report.status !== 'cancelled') report.status = 'failed';
        diagnosticStage(report.diagnostic, 'stopped', report.status === 'cancelled' ? 'cancelled' : 'completed');
      }
      save?.();
    } finally { process.off('SIGINT', int); process.off('SIGTERM', term); releaseResume(claim); }
  }
  if (failed) throw new Error('Owned setup-read resume refused or stopped; see closed diagnostic');
  process.stdout.write('Owned setup-read resume stopped. Original stage-0 manifest, receipt, keys and retained database remain in place.\n');
}
if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url)
  main(process.argv.slice(2)).catch(() => { console.error('Owned setup-read resume refused or stopped; no private values recorded'); process.exitCode = 1; });
