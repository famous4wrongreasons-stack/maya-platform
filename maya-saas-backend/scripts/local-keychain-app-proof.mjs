// Actual AppModule, actual retained runtime and fresh synthetic PG only.
// Child network sandbox permits its loopback DB/listener, no external services.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import {
  PRIVATE_KEYS,
  profileEnvironment,
  migrationConfigSource,
} from './local-onboarding-profile.mjs';
import { realReadEnvironment } from './local-yclients-read-profile.mjs';
import {
  createDiagnostic,
  readSessionPlan,
  readSourceBinding,
  runReadRuntime,
} from './local-yclients-read.mjs';
import { stage } from './local-onboarding.mjs';
import { diagnosticSandboxPolicy } from './local-yclients-read-diagnostic.mjs';
import { buildHelper } from './build-local-keychain-helper.mjs';
import { prepareLocalCore } from './conversation-qualification/core-local-prepare.mjs';
import {
  coreHash,
  coreBackend,
} from './conversation-qualification/core-conversation-source.mjs';
import { CORE_OWNER_READ_PROFILE } from './conversation-qualification/current-candidate-budget.mjs';
import { startOwnerKeychainSession } from './local-owner-keychain.mjs';

const require = createRequire(import.meta.url),
  output = process.argv[2];
assert.ok(
  process.argv.length === 3 &&
    path.isAbsolute(output) &&
    !fs.existsSync(output),
);
const source = readSourceBinding();
fs.mkdirSync(output, { mode: 0o700 });
const state = fs.mkdtempSync('/private/tmp/maya-kc-app-');
const report = {
  qualification: 'SYNTHETIC_NATIVE_HELPER_ACTUAL_APP_MODULE_HTTP_PG',
  candidate: source.head,
  realKeychainAccesses: 0,
  realProviderCalls: 0,
  personalDatabaseAccesses: 0,
  checks: [],
  completed: [],
  diagnostic: createDiagnostic(false),
};
const save = () =>
  fs.writeFileSync(
    path.join(output, 'summary.json'),
    JSON.stringify(report, null, 2) + '\n',
    { mode: 0o600 },
  );
const write = (file, value) => {
  const bytes = JSON.stringify(value, null, 2) + '\n';
  fs.writeFileSync(file, bytes, { mode: 0o600, flag: 'wx' });
  return coreHash(bytes);
};
async function port() {
  const s = net.createServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
const ports = new Set();
while (ports.size < 3) ports.add(await port());
const [pgPort, apiPort, webPort] = ports,
  origin = `http://127.0.0.1:${webPort}`;
const password = randomBytes(32).toString('hex'),
  database = 'maya_local_onboarding_' + randomBytes(8).toString('hex');
const keys = Object.fromEntries(
  PRIVATE_KEYS.map((k) => [k, randomBytes(32).toString('hex')]),
);
const options = {
  databaseUrl: `postgresql://maya_local_onboarding:${password}@127.0.0.1:${pgPort}/${database}`,
  keys,
  apiPort,
  origin,
  stateDirectory: state,
};
const env = profileEnvironment(process.env, options),
  pgBin = '/opt/homebrew/opt/postgresql@16/bin';
const plan = readSessionPlan({
  stateDirectory: state,
  pgBin,
  database,
  pgPort,
  apiPort,
  webPort,
  minutes: 1,
});
for (const [file, bytes] of Object.entries({
  'pg-password': password + '\n',
  pgpass: `127.0.0.1:${pgPort}:*:maya_local_onboarding:${password}\n`,
  'prisma.config.mjs': migrationConfigSource(coreBackend),
}))
  fs.writeFileSync(path.join(state, file), bytes, { mode: 0o600, flag: 'wx' });
const control = { cancelled: null, terminate: null };
const cancel = () => {
  control.cancelled = 'SIGTERM';
  control.terminate?.();
};
process.on('SIGINT', cancel);
process.on('SIGTERM', cancel);
let pgAttempted = false,
  prisma,
  session,
  runtime,
  failed = false;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = new URL(url);
  assert.equal(u.origin, origin, 'external_network_refused');
  return originalFetch(url, init);
};
try {
  save();
  for (const spec of plan.setup) {
    if (spec.name === 'pg-start') pgAttempted = true;
    await stage(spec, env, state, control);
    report.completed.push(spec.name);
    save();
  }
  const { PrismaClient } = require('@prisma/client'),
    { PrismaPg } = require('@prisma/adapter-pg');
  prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: options.databaseUrl }),
  });
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Synthetic Keychain proof',
      slug: 'synthetic-keychain-' + randomBytes(4).toString('hex'),
      status: 'trial',
      trialFullAccess: true,
      trialEndsAt: new Date(Date.now() + 3600000),
      currentPeriodEnd: new Date('2099-01-01'),
      calendarSource: 'external',
    },
  });
  const email = 'synthetic@example.invalid',
    loginPassword = 'Synthetic-only-never-real-42!';
  const owner = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email,
      passwordHash: await require('bcrypt').hash(loginPassword, 10),
      role: 'tenant_owner',
      status: 'active',
    },
  });
  await prisma.membership.create({
    data: {
      tenantId: tenant.id,
      userId: owner.id,
      role: 'tenant_owner',
      status: 'active',
      joinedAt: new Date(),
    },
  });
  const branch = await prisma.branch.create({
    data: { tenantId: tenant.id, name: 'Synthetic', timezone: 'Europe/Moscow' },
  });
  const {
    EncryptionService,
  } = require('../dist/src/encryption/encryption.service.js');
  const encryption = new EncryptionService({ get: (k) => keys[k] });
  await prisma.crmIntegration.create({
    data: {
      tenantId: tenant.id,
      provider: 'yclients',
      status: 'active',
      verifiedAt: new Date(),
      encryptedApiToken: encryption.encrypt('SYNTHETIC_USER_TOKEN_ONLY'),
      settingsJson: {
        companyId: 12345,
        branchBinding: {
          contract: 'maya.crm-branch-binding/1',
          companyId: 12345,
          branchId: branch.id,
        },
        acceptedImportSnapshotHash: 'a'.repeat(64),
      },
    },
  });
  const scope = {
    stateDirectory: state,
    initialManifestSha256: 'a'.repeat(64),
    privateStateSha256: 'b'.repeat(64),
    restartReceiptPath: state + '/restart.json',
    restartReceiptSha256: 'c'.repeat(64),
    tenantId: tenant.id,
    userId: owner.id,
    branchId: branch.id,
    tenantSlug: tenant.slug,
    companyId: '12345',
  };
  const helper = {
    ...buildHelper(path.join(state, 'native'), true).source,
    storageApprovalRef: 'SYNTHETIC_MEMORY_ONLY_NOT_REAL_STORAGE',
  };
  const run = path.join(state, 'run'),
    prepared = prepareLocalCore(run, CORE_OWNER_READ_PROFILE, scope, helper),
    manifest = JSON.parse(fs.readFileSync(prepared.manifestPath));
  const permit = {
    contract: 'maya.core-conversation-permit/1',
    runId: manifest.runId,
    nonce: randomBytes(32).toString('hex'),
    candidateCommit: manifest.candidateCommit,
    manifestSha256: prepared.manifestSha256,
    profile: manifest.profile,
    limitsSha256: manifest.limitsSha256,
    ownerApprovalRef: 'SYNTHETIC_APP_PROOF_NO_LIVE_AUTHORIZATION',
    startsAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 120000).toISOString(),
    revoked: false,
    target: manifest.admissionContext.target,
    credentialSource: helper,
    pricing: {
      model: manifest.limits.model,
      inputNanoUsdPerToken: 1320,
      outputNanoUsdPerToken: 3960,
      reference: 'SYNTHETIC_PRICE_ONLY',
      sha256: 'd'.repeat(64),
      verifiedAt: new Date().toISOString(),
    },
    claimPath: path.join(run, 'permit.json.claim'),
  };
  const pin = write(path.join(run, 'permit.json'), permit);
  write(path.join(run, 'approved-run.json'), {
    candidateCommit: manifest.candidateCommit,
    manifestSha256: prepared.manifestSha256,
    ownerApprovalRef: permit.ownerApprovalRef,
    permitSha256: pin,
  });
  const file = path.join(run, 'local-plan.json'),
    filePin = coreHash(fs.readFileSync(file));
  session = await startOwnerKeychainSession(file, filePin);
  const runtimeEnv = realReadEnvironment(process.env, options);
  assert.equal(runtimeEnv.YCLIENTS_PARTNER_TOKEN, undefined);
  Object.assign(plan, {
    ownerChat: true,
    providerAdmission: 'explicit_owner_catalog_and_bounded_model',
    durationMs: 60000,
  });
  plan.runtime = {
    command: '/usr/bin/sandbox-exec',
    args: [
      '-p',
      diagnosticSandboxPolicy(pgPort, apiPort),
      process.execPath,
      path.join(coreBackend, 'scripts/local-yclients-read-runtime.mjs'),
      '--owner-chat-plan',
      file,
      filePin,
    ],
  };
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  runtime = runReadRuntime(
    plan,
    runtimeEnv,
    state,
    control,
    report,
    () => {
      save();
      if (report.status === 'ready') resolveReady();
    },
    session.partner,
  );
  session.partner = undefined;
  await Promise.race([
    ready,
    runtime.then(() => {
      throw Error('runtime stopped before readiness');
    }),
  ]);
  let response = await fetch(origin + '/api/health');
  assert.equal(response.status, 200);
  report.checks.push(
    'actual native helper → admission → fd4 → AppModule initialization → HTTP health',
  );
  response = await fetch(origin + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({
      tenantSlug: tenant.slug,
      email,
      password: loginPassword,
    }),
  });
  assert.equal(response.status, 201);
  let body = await response.json();
  assert.ok(body.access_token);
  body = null;
  report.checks.push('ordinary canonical login on synthetic tenant passes');
  response = await fetch(origin + '/api/integrations/crm/activate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: '{}',
  });
  assert.equal(response.status, 403);
  report.checks.push('business-effect route remains refused');
  cancel();
  await runtime;
  runtime = null;
  assert.equal(report.runtimeGroupAbsent, true);
  assert.equal(report.providerReadSummaryStatus, 'reported_at_clean_stop');
  assert.equal(report.providerReadSummary.calls, 0);
  assert.equal(session.broker.snapshot().upstreamCalls, 0);
  report.checks.push(
    'provider/model calls zero; runtime reaped with clean receipt',
  );
} catch {
  failed = true;
  report.result = 'FAIL';
  save();
  throw Error('synthetic_keychain_app_proof_failed');
} finally {
  cancel();
  await runtime?.catch(() => {});
  await session?.broker.stop('synthetic_app_cleanup');
  await prisma?.$disconnect();
  if (pgAttempted) {
    await stage(plan.stop, env, state, { cancelled: null, terminate: null });
    report.clusterStopped = !fs.existsSync(
      path.join(state, 'pg/postmaster.pid'),
    );
    assert.equal(report.clusterStopped, true);
  }
  process.off('SIGINT', cancel);
  process.off('SIGTERM', cancel);
  globalThis.fetch = originalFetch;
  assert.deepEqual(readSourceBinding(), source);
  report.sourceUnchanged = true;
  if (!failed) report.result = 'PASS';
  save();
  fs.rmSync(state, { recursive: true, force: true });
}
console.log(
  JSON.stringify({
    result: report.result,
    candidate: report.candidate,
    checks: report.checks.length,
    realKeychainAccesses: 0,
    realProviderCalls: 0,
  }),
);
