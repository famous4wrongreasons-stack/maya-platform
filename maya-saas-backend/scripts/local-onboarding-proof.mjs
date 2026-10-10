// Explicit proof of reopening one completed, launcher-created private session.
// This is not a general resume command and never creates or repairs authority.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { assertPrivateCwd, assertProfileEnvironment, externalStatePath } from './local-onboarding-profile.mjs';
import { sessionPlan, sourceBinding, stage, runRuntime } from './local-onboarding.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const ordinaryPrivateFile = stat => stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o777) === 0o600 && stat.nlink === 1;

function readPrivateFile(filename, cap) {
  const before = fs.lstatSync(filename);
  assert.ok(ordinaryPrivateFile(before) && before.size > 0 && before.size <= cap, 'Private proof input refused');
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const opened = fs.fstatSync(fd);
    assert.ok(ordinaryPrivateFile(opened) && opened.dev === before.dev && opened.ino === before.ino && opened.size === before.size, 'Private proof input changed');
    const bytes = Buffer.alloc(opened.size);
    let offset = 0;
    while (offset < bytes.length) {
      const read = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
      assert.ok(read > 0, 'Private proof input truncated');
      offset += read;
    }
    const after = fs.fstatSync(fd), current = fs.lstatSync(filename);
    assert.ok(ordinaryPrivateFile(after) && ordinaryPrivateFile(current) && after.size === opened.size && after.mtimeMs === opened.mtimeMs && after.ctimeMs === opened.ctimeMs && current.dev === opened.dev && current.ino === opened.ino, 'Private proof input changed');
    return bytes;
  } finally { fs.closeSync(fd); }
}

// Exported only for finite metadata refusal tests; this function opens no socket.
export function assertCompletedSession(manifest, state, source) {
  assert.equal(manifest?.contract, 'maya.normal-local-onboarding-session/1');
  assert.ok(['stopped', 'cancelled'].includes(manifest.status), 'Only a completed initial session can be reopened');
  assert.equal(manifest.providerAdmission, false);
  assert.equal(manifest.qualifiedAcceptance, false);
  assert.equal(manifest.stateDirectory, state);
  assert.equal(manifest.ownedCluster, path.join(state, 'pg'));
  assert.equal(manifest.creation, 'fresh-exclusive-directory_then-initdb');
  assert.deepEqual(manifest.completed, ['backend-build', 'react-build', 'initdb', 'pg-start', 'createdb', 'migrations']);
  assert.equal(manifest.clusterStopped, true);
  assert.equal(manifest.runtimeGroupAbsent, true);
  assert.equal(manifest.sourceUnchanged, true);
  assert.equal(manifest.privateStateRetained, true);
  assert.ok(typeof manifest.readyAt === 'string' && Number.isFinite(Date.parse(manifest.readyAt)), 'Initial runtime never reached readiness');
  assert.deepEqual(manifest.resources, { nodeHeapMb: 3072, pgSharedBuffersMb: 64, pgWorkMemMb: 4, pgMaxConnections: 30 });
  assert.deepEqual(manifest.source, source, 'Reopening requires the same committed application and launcher source');
}

export async function main(args) {
  const { values } = parseArgs({ args, strict: true, options: {
    run: { type: 'boolean' }, state: { type: 'string' }, output: { type: 'string' },
    'session-manifest-sha256': { type: 'string' }, 'private-state-sha256': { type: 'string' }, minutes: { type: 'string', default: '10' },
    'pg-bin': { type: 'string', default: '/opt/homebrew/opt/postgresql@16/bin' },
  } });
  if (!values.run) {
    process.stdout.write('Prepared only: explicit --run --state --session-manifest-sha256 --private-state-sha256 --output reopens one completed owned session. No signup, seed, migration or provider admission.\n');
    return;
  }
  assert.equal(process.platform, 'darwin');
  assert.ok(typeof values.state === 'string' && path.isAbsolute(values.state));
  assert.match(values['session-manifest-sha256'] ?? '', /^[a-f0-9]{64}$/);
  assert.match(values['private-state-sha256'] ?? '', /^[a-f0-9]{64}$/);
  const state = fs.realpathSync(values.state);
  assert.equal(state, values.state, 'Use the canonical private state path');
  assertPrivateCwd(state);
  const relative = path.relative(fs.realpathSync(repo), state);
  assert.ok(relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative), 'Private state inside the repository refused');
  const source = sourceBinding();
  const originalBytes = readPrivateFile(path.join(state, 'manifest.json'), 16 * 1024 * 1024);
  assert.equal(hash(originalBytes), values['session-manifest-sha256'], 'Initial session manifest pin changed');
  const original = JSON.parse(originalBytes.toString('utf8'));
  assertCompletedSession(original, state, source);
  const privateBytes = readPrivateFile(path.join(state, 'service-keys.json'), 64 * 1024);
  assert.equal(hash(privateBytes), values['private-state-sha256'], 'Initial private state pin changed');
  const privateState = JSON.parse(privateBytes.toString('utf8'));
  assert.equal(privateState?.contract, 'maya.local-onboarding-private-state/1');
  assert.deepEqual(Object.keys(privateState).sort(), ['contract', 'environment']);
  const env = privateState.environment;
  assertProfileEnvironment(env);
  assert.equal(env.MAYA_LOCAL_ONBOARDING_STATE, state);
  assert.equal(original.landingUrl, env.CORS_ALLOWED_ORIGINS + '/__local-onboarding');
  const database = new URL(env.DATABASE_URL), web = new URL(env.CORS_ALLOWED_ORIGINS);
  const plan = sessionPlan({ stateDirectory: state, pgBin: values['pg-bin'], database: database.pathname.slice(1), pgPort: Number(database.port), apiPort: Number(env.PORT), webPort: Number(web.port), minutes: Number(values.minutes) });
  const cluster = fs.lstatSync(plan.cluster);
  assert.ok(cluster.isDirectory() && !cluster.isSymbolicLink() && cluster.uid === process.getuid() && (cluster.mode & 0o777) === 0o700, 'Owned cluster directory refused');
  assert.equal(fs.realpathSync(plan.cluster), plan.cluster);
  assert.equal(fs.existsSync(path.join(plan.cluster, 'postmaster.pid')), false, 'An already running cluster cannot be taken over');
  const version = fs.lstatSync(path.join(plan.cluster, 'PG_VERSION'));
  assert.ok(version.isFile() && !version.isSymbolicLink() && version.uid === process.getuid() && version.size <= 16);
  assert.equal(fs.readFileSync(path.join(plan.cluster, 'PG_VERSION'), 'utf8').trim(), '16');
  fs.accessSync(path.join(values['pg-bin'], 'pg_ctl'), fs.constants.X_OK);
  const output = externalStatePath(values.output, repo);
  fs.mkdirSync(output, { mode: 0o700 });
  assertPrivateCwd(output);
  const claimPath = path.join(state, 'restart-proof.lock');
  const claimFd = fs.openSync(claimPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  fs.writeSync(claimFd, JSON.stringify({ contract: 'maya.local-onboarding-restart-claim/1', pid: process.pid, originalManifestSha256: hash(originalBytes) }) + '\n');
  const claim = fs.fstatSync(claimFd); fs.closeSync(claimFd);
  const report = {
    contract: 'maya.local-onboarding-restart-proof/1', status: 'preparing', providerAdmission: false,
    qualifiedAcceptance: false, source, initialManifestSha256: hash(originalBytes), privateStateSha256: hash(privateBytes), initialReadyAt: original.readyAt,
    stateDirectory: state, ownedCluster: plan.cluster, samePrivateState: true, completed: [],
    runtimeDurationMs: plan.durationMs, preparationStageDeadlineMs: 180000,
    resources: original.resources, helperExecutesNoInitdbMigrationSeedOrSignup: true,
    scope: 'Actual owned PostgreSQL stop/start and the same application; UI assertions are recorded separately.',
  };
  const save = () => fs.writeFileSync(path.join(output, 'restart.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  const control = { cancelled: null, terminate: null };
  const cancel = signal => { control.cancelled ??= signal; control.terminate?.(); };
  const int = () => cancel('SIGINT'), term = () => cancel('SIGTERM');
  process.on('SIGINT', int); process.on('SIGTERM', term);
  let attempted = false;
  try {
    save();
    // Only the existing pg-start stage is reused. Logs are kept separately from
    // the original immutable session logs; runtime cwd remains the private state.
    attempted = true;
    await stage(plan.setup.find(spec => spec.name === 'pg-start'), env, output, control);
    report.completed.push('pg-start'); save();
    assert.deepEqual(sourceBinding(), source);
    await runRuntime(plan, env, state, control, report, save);
    report.completed.push('runtime');
    report.status = control.cancelled ? 'cancelled' : 'stopped';
  } catch { report.status = 'failed'; throw new Error('Owned restart proof failed'); }
  finally {
    control.terminate = null;
    if (attempted) {
      try { await stage(plan.stop, env, output, { cancelled: null, terminate: null }); report.clusterStopped = true; }
      catch { report.clusterStopped = false; report.status = 'failed-owned-cluster-stop'; }
    }
    try {
      report.sourceUnchanged = JSON.stringify(sourceBinding()) === JSON.stringify(source);
      report.samePrivateState = hash(readPrivateFile(path.join(state, 'service-keys.json'), 64 * 1024)) === hash(privateBytes);
      report.initialManifestUnchanged = hash(readPrivateFile(path.join(state, 'manifest.json'), 16 * 1024 * 1024)) === hash(originalBytes);
    } catch { report.sourceUnchanged = false; report.samePrivateState = false; report.initialManifestUnchanged = false; }
    if (!report.sourceUnchanged || !report.samePrivateState || !report.initialManifestUnchanged) report.status = 'failed-input-changed';
    save();
    process.off('SIGINT', int); process.off('SIGTERM', term);
    const currentClaim = fs.lstatSync(claimPath);
    if (currentClaim.dev === claim.dev && currentClaim.ino === claim.ino) fs.unlinkSync(claimPath);
  }
  assert.ok(['stopped', 'cancelled'].includes(report.status));
  process.stdout.write('Owned restart session stopped. Original private state and initial manifest retained unchanged. No provider admission.\n');
}

if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url)
  main(process.argv.slice(2)).catch(() => { console.error('Owned local restart proof refused or stopped; no private material recorded'); process.exitCode = 1; });
