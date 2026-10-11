// The actual retained-mode child/IPC/web relay over a fresh synthetic database.
// OS sandbox permits only this private PG and HTTP listener, no provider network.
// Never consumes an owner permit, retained DB, real provider key or real login.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { PRIVATE_KEYS, profileEnvironment, migrationConfigSource } from './local-onboarding-profile.mjs';
import { realReadEnvironment } from './local-yclients-read-profile.mjs';
import { stage } from './local-onboarding.mjs';
import { createDiagnostic, readSessionPlan, readSourceBinding, runReadRuntime } from './local-yclients-read.mjs';
import { diagnosticSandboxPolicy } from './local-yclients-read-diagnostic.mjs';
import { readOwnerTelegramLaunch } from './local-owner-telegram-launch.mjs';
import { OWNER_TELEGRAM_PROFILE, OWNER_TELEGRAM_ADMISSION } from './local-owner-telegram-policy.mjs';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url), output = process.argv[2];
assert.equal(process.platform, 'darwin');
assert.ok(process.argv.length === 3 && output && path.isAbsolute(output) && !fs.existsSync(output));
const source = readSourceBinding(), hash = b => createHash('sha256').update(b).digest('hex');
fs.mkdirSync(output, { mode: 0o700 });
const state = fs.mkdtempSync('/private/tmp/maya-telegram-binary-'); fs.chmodSync(state, 0o700);
async function port() { const s = net.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const n = s.address().port; await new Promise(r => s.close(r)); return n; }
const ports = new Set(); while (ports.size < 3) ports.add(await port());
const [pgPort, apiPort, webPort] = ports, origin = `http://127.0.0.1:${webPort}`;
const password = randomBytes(32).toString('hex'), database = 'maya_local_onboarding_' + randomBytes(8).toString('hex');
const keys = Object.fromEntries(PRIVATE_KEYS.map(k => [k, randomBytes(32).toString('hex')]));
const options = { databaseUrl: `postgresql://maya_local_onboarding:${password}@127.0.0.1:${pgPort}/${database}`, keys, apiPort, origin, stateDirectory: state };
const env = profileEnvironment(process.env, options), pgBin = '/opt/homebrew/opt/postgresql@16/bin';
const plan = readSessionPlan({ stateDirectory: state, pgBin, database, pgPort, apiPort, webPort, minutes: 1 });
for (const [file, value] of Object.entries({ 'pg-password': password + '\n', pgpass: `127.0.0.1:${pgPort}:*:maya_local_onboarding:${password}\n`, 'prisma.config.mjs': migrationConfigSource(backend) })) fs.writeFileSync(path.join(state, file), value, { mode: 0o600, flag: 'wx' });
const report = { qualification: 'SYNTHETIC_NETWORK_CLOSED_BINARY_NOT_LIVE_ACCEPTANCE', head: source.head, status: 'preparing', checks: [], completed: [], state, realProviderCalls: 0, diagnostic: createDiagnostic(false) };
const save = () => fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
const control = { cancelled: null, terminate: null };
const cancel = () => { control.cancelled = 'SIGTERM'; control.terminate?.(); };
process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
let started = false, prisma, running;
try {
  save();
  for (const spec of plan.setup) {
    if (spec.name === 'pg-start') started = true;
    console.log(spec.name); await stage(spec, env, state, control); report.completed.push(spec.name); save();
  }
  const { PrismaClient } = require('@prisma/client'), { PrismaPg } = require('@prisma/adapter-pg');
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: options.databaseUrl }) });
  const tenant = await prisma.tenant.create({ data: { name: 'Synthetic binary proof', slug: 'synthetic-binary-' + randomBytes(4).toString('hex'), status: 'active', trialFullAccess: false, currentPeriodEnd: new Date('2099-01-01'), calendarSource: 'external' } });
  const ownerPassword = 'Synthetic-only-never-real-42!', email = 'synthetic@example.invalid';
  const owner = await prisma.user.create({ data: { tenantId: tenant.id, email, passwordHash: await require('bcrypt').hash(ownerPassword, 10), role: 'tenant_owner', status: 'active' } });
  await prisma.membership.create({ data: { tenantId: tenant.id, userId: owner.id, role: 'tenant_owner', status: 'active', joinedAt: new Date() } });
  const branch = await prisma.branch.create({ data: { tenantId: tenant.id, name: 'Synthetic', timezone: 'Europe/Moscow' } });
  const { EncryptionService } = require(path.join(backend, 'dist/src/encryption/encryption.service.js'));
  const encryption = new EncryptionService({ get: key => keys[key] });
  await prisma.crmIntegration.create({ data: { tenantId: tenant.id, provider: 'yclients', status: 'active', verifiedAt: new Date(), encryptedApiToken: encryption.encrypt('SYNTHETIC_USER_TOKEN_NOT_REAL'), settingsJson: { companyId: 12345, branchBinding: { contract: 'maya.crm-branch-binding/1', companyId: 12345, branchId: branch.id }, acceptedImportSnapshotHash: 'a'.repeat(64) } } });
  const scope = { stateDirectory: state, initialManifestSha256: '1'.repeat(64), privateStateSha256: '2'.repeat(64), restartReceiptPath: state + '/restart.json', restartReceiptSha256: '3'.repeat(64), tenantId: tenant.id, userId: owner.id, branchId: branch.id, tenantSlug: tenant.slug, companyId: '12345' };
  const permit = { contract: OWNER_TELEGRAM_PROFILE, candidateCommit: source.head, sourceSha256: hash(JSON.stringify(source)), scope, origin, clientId: '123456789', notBefore: new Date().toISOString(), expiresAt: new Date(Date.now() + 180000).toISOString(), ownerApprovalRef: 'synthetic-binary-proof-not-owner-authorization' };
  const permitPath = path.join(state, 'plan.json'), bytes = JSON.stringify(permit), pin = hash(bytes);
  fs.writeFileSync(permitPath, bytes, { mode: 0o600, flag: 'wx' });
  readOwnerTelegramLaunch(permitPath, pin, permit.ownerApprovalRef, readSourceBinding, 'claim');
  plan.ownerTelegram = true; plan.executionExpiresAt = permit.expiresAt; plan.providerAdmission = OWNER_TELEGRAM_ADMISSION;
  const childArgs = [...plan.runtime.args, '--owner-telegram-plan', permitPath, pin, permit.ownerApprovalRef];
  plan.runtime = { ...plan.runtime, command: '/usr/bin/sandbox-exec', args: ['-p', diagnosticSandboxPolicy(pgPort, apiPort), process.execPath, ...childArgs] };
  const runtimeEnv = realReadEnvironment(process.env, options, 'SYNTHETIC_PARTNER_NOT_REAL');
  runtimeEnv.TELEGRAM_CLIENT_SECRET = 'SYNTHETIC_TELEGRAM_NOT_REAL';
  running = runReadRuntime(plan, runtimeEnv, state, control, report, save);
  let failure; void running.catch(error => { failure = error; });
  const until = Date.now() + 60000;
  while (report.status !== 'ready') { if (failure) throw failure; assert.ok(Date.now() < until, 'binary_readiness_deadline'); await delay(50); }
  report.checks.push('actual-child-ipc-web-ready');
  const request = (route, body, token) => fetch(origin + route, { method: body === undefined ? 'GET' : 'POST', headers: { origin, ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: 'Bearer ' + token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000), redirect: 'error' });
  assert.equal((await request('/api/health')).status, 200); report.checks.push('health-through-actual-relay');
  const page = await (await fetch(origin)).text(); assert.ok(page.includes('<html') || page.includes('<!doctype')); report.checks.push('current-react-payload-served');
  const login = await request('/api/auth/login', { tenantSlug: tenant.slug, email, password: ownerPassword }); assert.equal(login.status, 201);
  const session = await login.json(); assert.equal(session.user.id, owner.id); report.checks.push('canonical-password-session');
  const link = await request('/api/auth/oauth/telegram/link/start', { platform: 'web', redirectUri: origin + '/oauth-callback.html' }, session.access_token);
  assert.equal(link.status, 201); const startedLink = await link.json(); assert.match(startedLink.state, /^te_/); report.checks.push('canonical-telegram-link-start-no-provider-dispatch');
  const refusedLink = await request('/api/auth/oauth/telegram/link/complete', { state: 'te_synthetic_unknown_state', code: 'synthetic-code' }, session.access_token);
  assert.equal(refusedLink.status, 403);
  const traceUntil = Date.now() + 5000;
  while (!report.diagnostic.readTrace.some(e => e.route === 'telegram_link_complete' && e.stage === 'refused')) { assert.ok(Date.now() < traceUntil, 'closed_trace_receipt_deadline'); await delay(20); }
  assert.ok(report.diagnostic.readTrace.some(e => e.route === 'telegram_link_complete' && e.status === 403 && e.code === 'local_owner_telegram_scope_refused'));
  report.checks.push('canonical-telegram-refusal-through-child-ipc-safe-receipt');
  for (const route of ['/api/ai/chat', '/api/widgets/intent', '/api/integrations/crm/activate', '/api/client-channel/consent', '/api/auth/phone/start']) assert.equal((await request(route, {}, session.access_token)).status, 403);
  report.checks.push('business-model-sms-consent-routes-refused');
  assert.equal((await request('/api/auth/login', { tenantSlug: 'foreign', email, password: ownerPassword })).status, 403); report.checks.push('foreign-tenant-refused');
  // Deleting only this synthetic private claim revokes the running local permit.
  fs.unlinkSync(permitPath + '.consumed');
  assert.ok((await request('/api/health')).status >= 400); report.checks.push('live-permit-revocation-refused');
  control.cancelled = 'SYNTHETIC_PROOF_COMPLETE'; control.terminate?.(); await running;
  assert.equal(report.runtimeGroupAbsent, true);
  assert.deepEqual(report.providerReadSummary, { calls: 0, refused: 0, routes: {} });
  report.checks.push('clean-child-stop-zero-provider-dispatch');
  // Restore only the synthetic claim to test the permanent child-consumption fence.
  readOwnerTelegramLaunch(permitPath, pin, permit.ownerApprovalRef, readSourceBinding, 'claim');
  assert.throws(() => readOwnerTelegramLaunch(permitPath, pin, permit.ownerApprovalRef, readSourceBinding, 'child'));
  report.checks.push('second-child-refused'); report.status = 'passed';
} catch { report.status = 'failed'; process.exitCode = 1; }
finally {
  control.terminate?.(); await running?.catch(() => {}); await prisma?.$disconnect();
  if (started) { try { await stage(plan.stop, env, state, { cancelled: null, terminate: null }); report.clusterStopped = true; } catch { report.clusterStopped = false; report.status = 'failed-cleanup'; process.exitCode = 1; } }
  report.pidFileAbsent = !fs.existsSync(path.join(state, 'pg/postmaster.pid'));
  report.sourceUnchanged = JSON.stringify(readSourceBinding()) === JSON.stringify(source);
  if (!report.sourceUnchanged || !report.pidFileAbsent) { report.status = 'failed'; process.exitCode = 1; }
  save(); process.off('SIGINT', cancel); process.off('SIGTERM', cancel);
}
console.log(JSON.stringify({ status: report.status, checks: report.checks.length, clusterStopped: report.clusterStopped, sourceUnchanged: report.sourceUnchanged }));
