// Actual current React -> existing onboarding HTTP -> a separately launched,
// fresh test PostgreSQL. This driver never starts/stops PG or grants authority.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { sourceBinding } from './local-onboarding.mjs';
import { assertPrivateCwd, assertProfileEnvironment, externalStatePath } from './local-onboarding-profile.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const browserFile = 'maya-carrier-react/test/local-onboarding-browser.probe.mjs';
const proofFiles = ['maya-saas-backend/scripts/local-onboarding-ui-proof.mjs', browserFile, 'maya-chat-shell/test/cdp-verify.mjs'];
const psqlPath = '/opt/homebrew/opt/postgresql@16/bin/psql';
const setupStages = ['backend-build', 'react-build', 'initdb', 'pg-start', 'createdb', 'migrations'];
const businessTables = ['Tenant', 'User', 'Branch', 'Membership'];
const effectTables = ['CrmIntegration', 'CrmStaffAccess', 'Client', 'Appointment', 'ActionExecution', 'ActionExecutionIdempotencyBinding', 'AiApprovalRequest', 'AiToolExecution', 'Opportunity', 'AgentTask', 'OwnerReportRun', 'NativeFeedbackRequest', 'TeamMessage', 'ExpenseReminderRun', 'MarketingCampaign', 'MarketingDeliveryAttempt', 'Expense'];
const allTables = [...businessTables, 'TrialActivation', ...effectTables];
const sequence = ['success-created', 'success-crm-read', 'success-reload-login', 'success-signout-login', 'lost-reply-committed', 'lost-reply-recovered', 'lost-reply-reload-login', 'lost-reply-signout-login', 'slug-collision-rejected'];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const opaque = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const ordinary = (stat, mode) => stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o777) === mode && stat.nlink === 1;

function privateBytes(filename, cap, mode = 0o600) {
  const before = fs.lstatSync(filename);
  assert.ok(ordinary(before, mode) && before.size > 0 && before.size <= cap, 'private_input_refused');
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const opened = fs.fstatSync(fd);
    assert.ok(ordinary(opened, mode) && opened.dev === before.dev && opened.ino === before.ino && opened.size === before.size, 'private_input_changed');
    const bytes = Buffer.alloc(opened.size);
    for (let offset = 0; offset < bytes.length;) {
      const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
      assert.ok(count > 0, 'private_input_truncated'); offset += count;
    }
    const after = fs.fstatSync(fd), current = fs.lstatSync(filename);
    assert.ok(ordinary(after, mode) && ordinary(current, mode) && after.size === opened.size && after.mtimeMs === opened.mtimeMs && after.ctimeMs === opened.ctimeMs && current.dev === opened.dev && current.ino === opened.ino, 'private_input_changed');
    return bytes;
  } finally { fs.closeSync(fd); }
}
function privateJson(filename, cap) {
  const bytes = privateBytes(filename, cap);
  try { return JSON.parse(bytes.toString('utf8')); } finally { bytes.fill(0); }
}
function dedicatedBinding(head) {
  const result = spawnSync('git', ['ls-tree', '-r', head, '--', ...proofFiles], { cwd: repo, encoding: 'utf8', timeout: 10000, maxBuffer: 65536 });
  assert.equal(result.status, 0, 'proof_source_unavailable');
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines.length, proofFiles.length, 'proof_source_must_be_committed');
  return lines.map(line => {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(line);
    assert.ok(match && proofFiles.includes(match[3]), 'proof_source_refused');
    const filename = path.join(repo, match[3]), stat = fs.lstatSync(filename);
    assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'proof_source_refused');
    const bytes = fs.readFileSync(filename);
    assert.equal(createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex'), match[2], 'proof_source_changed');
    return { path: match[3], gitBlob: match[2], sha256: digest(bytes) };
  });
}
function assertReady(manifest, state, source) {
  assert.equal(manifest?.contract, 'maya.normal-local-onboarding-session/1');
  assert.equal(manifest.status, 'ready'); assert.equal(manifest.providerAdmission, false); assert.equal(manifest.qualifiedAcceptance, false);
  assert.equal(manifest.stateDirectory, state); assert.equal(manifest.ownedCluster, path.join(state, 'pg'));
  assert.equal(manifest.creation, 'fresh-exclusive-directory_then-initdb'); assert.equal(manifest.privateStateRetained, true);
  assert.deepEqual(manifest.completed, setupStages); assert.deepEqual(manifest.source, source, 'session_source_changed');
  assert.deepEqual(manifest.resources, { nodeHeapMb: 3072, pgSharedBuffersMb: 64, pgWorkMemMb: 4, pgMaxConnections: 30 });
  assert.ok(Number.isFinite(Date.parse(manifest.readyAt)) && Date.parse(manifest.readyAt) <= Date.now() && Date.now() - Date.parse(manifest.readyAt) < 15 * 60000, 'fresh_ready_session_required');
  assert.ok(Date.parse(manifest.expiresAt) > Date.now() + 280000, 'insufficient_owned_session_time');
}
function pgReader(state, env) {
  const database = new URL(env.DATABASE_URL), cluster = path.join(state, 'pg');
  assertPrivateCwd(cluster); assert.equal(fs.realpathSync(cluster), cluster);
  const version = privateBytes(path.join(cluster, 'PG_VERSION'), 16);
  assert.equal(version.toString('utf8').trim(), '16'); version.fill(0);
  const postmaster = privateBytes(path.join(cluster, 'postmaster.pid'), 4096);
  const lines = postmaster.toString('utf8').trim().split('\n'); postmaster.fill(0);
  assert.ok(/^\d+$/.test(lines[0]) && Number(lines[0]) > 1 && /^\d+$/.test(lines[2]), 'owned_postmaster_required');
  assert.equal(lines[1], cluster); assert.equal(lines[3], database.port); assert.equal(lines[5], '127.0.0.1'); assert.equal(lines[7]?.trim(), 'ready');
  process.kill(Number(lines[0]), 0); // Existence only. This driver never signals PG.
  const pass = privateBytes(path.join(state, 'pgpass'), 4096);
  try { assert.ok(pass.toString('utf8') === `127.0.0.1:${database.port}:*:maya_local_onboarding:${database.password}\n`, 'owned_pgpass_mismatch'); }
  finally { pass.fill(0); }
  fs.accessSync(psqlPath, fs.constants.X_OK);
  const read = sql => {
    const result = spawnSync(psqlPath, ['-X', '-t', '-A', '--no-password', '--set=ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', database.port, '-U', database.username, '-d', database.pathname.slice(1)], {
      cwd: state, input: sql, encoding: 'utf8', timeout: 10000, killSignal: 'SIGKILL', maxBuffer: 65536,
      env: { PATH: '/usr/bin:/bin', LANG: 'C', PGPASSFILE: path.join(state, 'pgpass'), PGCONNECT_TIMEOUT: '3', PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=5000' },
    });
    assert.equal(result.status, 0, 'owned_readonly_query_failed');
    return JSON.parse(result.stdout.trim());
  };
  const identity = () => {
    const value = read(`SELECT json_build_object('database',current_database(),'user',current_user,'address',host(inet_server_addr()),'port',inet_server_port(),'directory',current_setting('data_directory'),'started',extract(epoch FROM pg_postmaster_start_time()),'system',(SELECT system_identifier::text FROM pg_control_system()),'readOnly',current_setting('default_transaction_read_only'));`);
    assert.equal(value.database, database.pathname.slice(1)); assert.equal(value.user, 'maya_local_onboarding');
    assert.equal(value.address, '127.0.0.1'); assert.equal(value.port, Number(database.port)); assert.equal(value.directory, cluster);
    assert.equal(Math.floor(Number(value.started)), Number(lines[2])); assert.equal(value.readOnly, 'on');
    assert.ok(typeof value.system === 'string' && /^\d+$/.test(value.system));
    return { databaseSha256: digest(value.database), systemIdentifierSha256: digest(value.system), startedAtEpoch: Number(value.started), exactOwnedDirectory: true, exactOwnedPort: true, queriesReadOnly: true };
  };
  return { read, identity };
}
const quoted = value => { assert.ok(typeof value === 'string' && value.length <= 200 && !/[\u0000-\u001f]/.test(value)); return "'" + value.replaceAll("'", "''") + "'"; };
function snapshot(read) {
  const value = read(`SELECT json_build_object(${allTables.map(table => `'${table}',(SELECT count(*) FROM "${table}")`).join(',')},'activationCompleted',(SELECT count(*) FROM "TrialActivation" WHERE status='completed'),'activationPending',(SELECT count(*) FROM "TrialActivation" WHERE status='pending'));`);
  assert.ok(Object.values(value).every(count => Number.isSafeInteger(count) && count >= 0), 'finite_db_counts');
  return value;
}
function deltaCheck(before, after, businesses, collision) {
  for (const table of businessTables) assert.equal(after[table] - before[table], businesses, 'no_duplicate_business');
  assert.equal(after.TrialActivation - before.TrialActivation, businesses + Number(collision), 'finite_activation_delta');
  assert.equal(after.activationCompleted - before.activationCompleted, businesses, 'completed_activation_delta');
  assert.equal(after.activationPending - before.activationPending, Number(collision), 'pending_activation_delta');
  for (const table of effectTables) { assert.equal(before[table], 0, 'fresh_effect_baseline_required'); assert.equal(after[table], 0, 'no_domain_effect_rows'); }
}
function ownedRequest(origin, route, body, headers = {}) {
  const url = new URL(origin); assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.protocol, 'http:');
  return new Promise((resolve, reject) => {
    let timer;
    const finish = (error, result) => { clearTimeout(timer); error ? reject(new Error('bounded_route_probe_failed')) : resolve(result); };
    const request = http.request({ hostname: '127.0.0.1', port: Number(url.port), path: route, method: 'POST', agent: false, headers: { 'Content-Type': 'application/json', ...headers } }, response => {
      let bytes = 0; const chunks = [];
      response.on('data', chunk => { bytes += chunk.length; if (bytes > 16384) request.destroy(); else chunks.push(chunk); });
      response.on('error', error => finish(error));
      response.on('end', () => { try { finish(null, { status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); } catch { finish(true); } });
    });
    timer = setTimeout(() => request.destroy(new Error('deadline')), 5000);
    request.on('error', error => finish(error)); request.end(JSON.stringify(body));
  });
}
function groupAlive(pid) { if (!pid) return false; try { process.kill(-pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw new Error('owned_group_check_failed'); } }
function signalGroup(pid, signal) { if (!pid) return; try { process.kill(-pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw new Error('owned_group_signal_failed'); } }
async function stopGroup(pid) {
  if (!groupAlive(pid)) return;
  signalGroup(pid, 'SIGTERM');
  for (let i = 0; i < 100 && groupAlive(pid); i++) await delay(50);
  if (groupAlive(pid)) signalGroup(pid, 'SIGKILL');
  for (let i = 0; i < 100 && groupAlive(pid); i++) await delay(50);
  assert.equal(groupAlive(pid), false, 'owned_browser_group_remaining');
}

export async function main(args) {
  const { values } = parseArgs({ args, strict: true, options: { run: { type: 'boolean' }, state: { type: 'string' }, out: { type: 'string' } } });
  if (!values.run) { process.stdout.write('Prepared only. Explicit --run --state=/private/tmp/maya-onboarding-ui-state-... --out=/private/tmp/maya-onboarding-ui-proof-... tests one fresh running stage-0 session. No launcher or database is started or stopped.\n'); return; }
  assert.equal(process.platform, 'darwin');
  assert.ok(typeof values.state === 'string' && path.isAbsolute(values.state));
  const state = fs.realpathSync(values.state); assert.equal(state, values.state);
  assert.ok(/^\/private\/tmp\/maya-onboarding-ui-state-[A-Za-z0-9-]+$/.test(state), 'dedicated_fresh_test_state_required');
  assertPrivateCwd(state);
  const source = sourceBinding(), files = dedicatedBinding(source.head);
  const manifest = privateJson(path.join(state, 'manifest.json'), 16 * 1024 * 1024); assertReady(manifest, state, source);
  const privateState = privateJson(path.join(state, 'service-keys.json'), 65536);
  assert.equal(privateState?.contract, 'maya.local-onboarding-private-state/1'); assert.deepEqual(Object.keys(privateState).sort(), ['contract', 'environment']);
  const env = privateState.environment; assertProfileEnvironment(env); assert.equal(env.MAYA_LOCAL_ONBOARDING_STATE, state);
  assert.equal(manifest.landingUrl, env.CORS_ALLOWED_ORIGINS + '/__local-onboarding');
  const origins = { web: env.CORS_ALLOWED_ORIGINS, backend: 'http://127.0.0.1:' + env.PORT };
  const ports = [new URL(env.DATABASE_URL).port, new URL(origins.web).port, String(env.PORT)];
  assert.equal(new Set(ports).size, 3); assert.ok(ports.every(port => Number(port) > 1024 && Number(port) <= 65535 && !['5432', '55611'].includes(port)));
  const pg = pgReader(state, env), initialPg = pg.identity();
  const output = externalStatePath(values.out, repo); assert.ok(/^\/private\/tmp\/maya-onboarding-ui-proof-[A-Za-z0-9-]+$/.test(output));
  fs.mkdirSync(output, { mode: 0o700 }); assertPrivateCwd(output);
  const reportPath = path.join(output, 'parent.json');
  const report = { contract: 'maya.local-onboarding-ui.actual-parent/1', status: 'running', source: { head: source.head, sessionSourceSha256: digest(JSON.stringify(source)), proofFiles: files }, syntheticAccounts: true, ownerStateUsed: false, providerAdmission: false, pgIdentity: initialPg, baseline: null, checkpoints: [], routes: [], collision: null, cleanup: null,
    limits: ['Local development HTTP only; no production/provider/model acceptance.', 'Zero listed domain-effect rows and closed ingress are checked; no packet-level outbound claim.', 'No database/process restart in this UI proof; the existing launcher owns all PG lifecycle.', 'Occupied slug currently yields generic HTTP 500; uncertain UI/no retry remains required.'] };
  const save = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  let child, childClosed, deadline, exitTimer, killTimer, configCreated = false, claimed = false, interrupted = false, fault = null, stage = 'baseline';
  const configPath = path.join(state, 'ui-proof-synthetic-accounts.json'), claimPath = path.join(state, 'ui-proof-claim.json');
  const identities = new Map();
  const fail = code => {
    fault ??= code;
    if (child?.pid) {
      signalGroup(child.pid, 'SIGTERM');
      killTimer ??= setTimeout(() => signalGroup(child.pid, 'SIGKILL'), 5000);
    }
  };
  const signal = () => { interrupted = true; fail('proof_interrupted'); };
  process.once('SIGINT', signal); process.once('SIGTERM', signal);
  save();
  try {
    fs.writeFileSync(claimPath, JSON.stringify({ contract: 'maya.local-onboarding-ui.claim/1', source: source.head, pid: process.pid, createdAt: new Date().toISOString() }) + '\n', { flag: 'wx', mode: 0o600 }); claimed = true;
    report.baseline = snapshot(pg.read); deltaCheck(report.baseline, report.baseline, 0, false); save();
    stage = 'route-boundaries';
    for (const [host, origin] of Object.entries(origins)) {
      for (const [route, code] of [['/api/ai/chat', 'local_onboarding_route_disabled'], ['/api/integrations/crm/connect', 'local_provider_admission_required'], ['/api/auth/email/start', 'local_onboarding_route_disabled']]) {
        assert.equal(interrupted, false);
        const result = await ownedRequest(origin, route, {}); assert.equal(result.status, 403); assert.equal(result.body?.error?.code, code);
        report.routes.push({ host, route, status: 403, code });
      }
      for (const headers of [{ Origin: 'https://other.example.invalid' }, { Host: 'rebound.example.invalid' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
        assert.equal(interrupted, false);
        const result = await ownedRequest(origin, '/api/onboarding/trial-activations', { source: 'web' }, headers);
        assert.equal(result.status, 403); assert.equal(result.body?.error?.code, 'local_onboarding_origin_refused');
        report.routes.push({ host, boundary: Object.keys(headers)[0], status: 403, code: 'local_onboarding_origin_refused', transport: 'node:http' });
      }
    }
    assert.deepEqual(snapshot(pg.read), report.baseline, 'guard_probes_created_no_domain_or_activation_rows'); save();
    const suffix = randomBytes(6).toString('hex');
    const accounts = ['success', 'lost-reply'].map(key => ({ key, name: 'Синтетический бизнес ' + key, slug: 'synthetic-ui-' + key + '-' + suffix, email: 'ui-' + key + '-' + suffix + '@example.invalid', password: randomBytes(24).toString('hex'), branchName: 'Синтетический филиал ' + key, branchTimezone: 'Europe/Moscow' }));
    fs.writeFileSync(configPath, JSON.stringify({ accounts }) + '\n', { flag: 'wx', mode: 0o600 }); configCreated = true;
    stage = 'browser';
    assert.equal(interrupted, false);
    let started = false, finished = false, chromeAnnounced = false;
    const verify = message => {
      assert.equal(message.name, sequence[report.checkpoints.length], 'exact_checkpoint_order');
      const collision = message.name === 'slug-collision-rejected';
      const expectedKey = report.checkpoints.length < 4 || collision ? 'success' : 'lost-reply';
      assert.equal(message.identity?.key, expectedKey); const account = accounts.find(value => value.key === expectedKey), id = message.identity;
      assert.ok(record(id) && Object.keys(id).length === 6 && ['key', 'slug', 'email', 'tenantId', 'userId', 'branchId'].every(key => Object.hasOwn(id, key)));
      assert.equal(id.slug, account.slug); assert.equal(id.email, account.email); assert.ok([id.tenantId, id.userId, id.branchId].every(opaque));
      assert.equal(message.activationRequests, 1); assert.equal(message.signupRequests, 1);
      const canonical = { tenantId: id.tenantId, userId: id.userId, branchId: id.branchId };
      if (identities.has(expectedKey)) assert.deepEqual(canonical, identities.get(expectedKey), 'canonical_identity_changed'); else identities.set(expectedKey, canonical);
      const row = pg.read(`SELECT json_build_object('tenant',(SELECT count(*) FROM "Tenant" WHERE id=${quoted(id.tenantId)} AND slug=${quoted(account.slug)} AND name=${quoted(account.name)} AND "calendarSource"='external' AND status='trial'),'user',(SELECT count(*) FROM "User" WHERE id=${quoted(id.userId)} AND "tenantId"=${quoted(id.tenantId)} AND "branchId"=${quoted(id.branchId)} AND email=${quoted(account.email)} AND role='tenant_owner' AND status='active'),'membership',(SELECT count(*) FROM "Membership" WHERE "userId"=${quoted(id.userId)} AND "tenantId"=${quoted(id.tenantId)} AND "branchId"=${quoted(id.branchId)} AND role='tenant_owner' AND status='active'),'branch',(SELECT count(*) FROM "Branch" WHERE id=${quoted(id.branchId)} AND "tenantId"=${quoted(id.tenantId)} AND name=${quoted(account.branchName)} AND timezone=${quoted(account.branchTimezone)}),'activation',(SELECT count(*) FROM "TrialActivation" WHERE "tenantId"=${quoted(id.tenantId)} AND status='completed' AND source='web'));`);
      assert.ok(Object.values(row).every(count => count === 1), 'current_canonical_ownership');
      const counts = snapshot(pg.read); deltaCheck(report.baseline, counts, report.checkpoints.length < 4 ? 1 : 2, collision);
      if (collision) {
        assert.equal(message.collision, true); assert.equal(message.httpStatus, 500); assert.equal(message.errorCode, null);
        report.collision = { httpStatus: 500, errorCode: null, genericFailureOnly: true, existingBusinessUnchanged: true, additionalTenantUserBranchMembership: 0, additionalPendingActivation: 1, retryAuthority: false };
      } else assert.notEqual(message.collision, true);
      report.checkpoints.push({ name: message.name, account: expectedKey, canonicalOwnership: row, counts, identitySha256: digest(JSON.stringify(canonical)) }); save();
    };
    child = spawn(process.execPath, [path.join(repo, browserFile)], { cwd: repo, detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: { PATH: '/usr/bin:/bin', HOME: env.HOME, TMPDIR: env.TMPDIR ?? '/tmp', LANG: 'C', NODE_OPTIONS: '--max-old-space-size=512' } });
    childClosed = new Promise(resolve => { child.once('error', () => { fail('browser_spawn_failed'); resolve({ code: null }); }); child.once('close', (code, signal) => resolve({ code, signal })); });
    child.on('message', message => {
      try {
        assert.ok(record(message) && JSON.stringify(message).length <= 16384, 'finite_ipc_required');
        if (message.type === 'ready') {
          assert.equal(started, false); started = true;
          child.send({ type: 'start', mode: 'prepare', configPath, webOrigin: origins.web, backendOrigin: origins.backend, output });
        } else if (message.type === 'owned-process') {
          assert.ok(started && !finished && !chromeAnnounced); chromeAnnounced = true;
          assert.equal(message.kind, 'chrome'); assert.ok(Number.isSafeInteger(message.pid) && message.pid > 1); // Never trust IPC to select a kill target.
        } else if (message.type === 'checkpoint') {
          assert.ok(started && !finished && fault === null); verify(message); child.send({ type: 'continue:' + message.name });
        } else if (message.type === 'finished') {
          assert.ok(started && !finished); finished = true; assert.equal(message.mode, 'prepare'); assert.equal(message.reportPath, path.join(output, 'browser.json'));
          assert.ok(['PASS', 'FAIL'].includes(message.status)); report.browser = { status: message.status, reportPath: message.reportPath }; save();
        } else throw new Error('unlisted_ipc');
      } catch { fail('browser_checkpoint_failed'); }
    });
    deadline = setTimeout(() => fail('browser_deadline'), 250000);
    // Failures also have a finite TERM -> KILL path, even if the browser stops answering IPC.
    const exit = await Promise.race([childClosed, new Promise(resolve => { exitTimer = setTimeout(() => resolve({ code: null }), 260000); })]);
    clearTimeout(deadline); clearTimeout(exitTimer);
    assert.equal(fault, null); assert.equal(interrupted, false); assert.equal(exit.code, 0); assert.equal(finished, true);
    assert.equal(report.browser?.status, 'PASS'); assert.deepEqual(report.checkpoints.map(value => value.name), sequence);
    const browserReport = privateJson(path.join(output, 'browser.json'), 262144);
    assert.equal(browserReport.contract, 'maya.local-onboarding.browser/1'); assert.equal(browserReport.status, 'PASS'); assert.equal(browserReport.actualCurrentReact, true);
    assert.equal(browserReport.cleanup?.clean, true); assert.equal(browserReport.cleanup?.chromeClosed, true); assert.equal(browserReport.cleanup?.privateProfileRemoved, true);
    for (const field of ['providerBrowserRequests', 'modelBrowserRequests', 'crmMutationRequests']) assert.equal(browserReport[field], 0);
    report.after = snapshot(pg.read); deltaCheck(report.baseline, report.after, 2, true); report.status = 'PASS';
  } catch { report.status = 'FAIL'; report.failure = fault ?? 'bounded_proof_assertion_failed'; report.failedStage = stage; process.exitCode = 1; }
  finally {
    clearTimeout(deadline); clearTimeout(exitTimer); clearTimeout(killTimer);
    let clean = true, browserGroupAbsent = false;
    try { await stopGroup(child?.pid); browserGroupAbsent = !groupAlive(child?.pid); } catch { clean = false; }
    if (configCreated) { try { fs.unlinkSync(configPath); } catch { clean = false; } }
    try {
      assert.deepEqual(sourceBinding(), source); assert.deepEqual(dedicatedBinding(source.head), files); assert.deepEqual(pg.identity(), initialPg);
      const finalManifest = privateJson(path.join(state, 'manifest.json'), 16 * 1024 * 1024);
      assert.equal(finalManifest.status, 'ready'); assert.equal(finalManifest.providerAdmission, false); assert.deepEqual(finalManifest.source, source);
      report.sourceUnchanged = true; report.sameOwnedDatabase = true; report.launcherStillReady = true;
    } catch { clean = false; report.finalFence = 'source_or_owned_session_changed'; }
    report.cleanup = { ownedBrowserGroupAbsent: browserGroupAbsent, syntheticPasswordConfigRemoved: !configCreated || !fs.existsSync(configPath), launcherAndDatabaseNotStoppedByDriver: true, ownClaimRetained: claimed };
    if (!clean) { report.status = 'FAIL'; process.exitCode = 1; }
    save(); process.off('SIGINT', signal); process.off('SIGTERM', signal);
    process.stdout.write(JSON.stringify({ status: report.status, report: reportPath, checkpoints: report.checkpoints.length, cleanup: report.cleanup }) + '\n');
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)))
  main(process.argv.slice(2)).catch(() => { process.stderr.write('Local onboarding UI proof refused or stopped; no private material recorded.\n'); process.exitCode = 1; });
