// Pure stage-0 checks. Deterministic public test strings only; no RNG, listeners,
// AppModule, PostgreSQL, provider or service-key generation is exercised here.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { PRIVATE_KEYS, FIXED_PROFILE, profileEnvironment, assertProfileEnvironment, ingressDecision, migrationConfigSource, externalStatePath, localBrowserBoundary } from './local-onboarding-profile.mjs';
import { sessionPlan } from './local-onboarding.mjs';
import { assertCompletedSession } from './local-onboarding-proof.mjs';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const keys = Object.fromEntries(PRIVATE_KEYS.map((key, index) => [key, (index + 1).toString(16).padStart(64, '0')]));
const options = { databaseUrl: `postgresql://maya_local_onboarding:${'f'.repeat(64)}@127.0.0.1:55431/maya_local_onboarding_0123456789abcdef`, keys, apiPort: 55432, origin: 'http://127.0.0.1:55433', stateDirectory: '/private/tmp/local-onboarding-unit-only' };
const profile = () => profileEnvironment({ PATH: '/usr/bin:/bin' }, options);
const planOptions = { stateDirectory: options.stateDirectory, pgBin: '/opt/homebrew/opt/postgresql@16/bin', database: 'maya_local_onboarding_0123456789abcdef', pgPort: 55431, apiPort: 55432, webPort: 55433 };
const signup = () => ({ trialActivationToken: 'unit-activation'.padEnd(43, 'x'), name: 'Unit business', slug: 'unit-business', ownerEmail: 'unit@example.invalid', password: 'UnitPasswordOnly123', branchName: 'Unit branch', branchTimezone: 'Europe/Moscow', calendarSource: 'external' });
const admit = (method, route, body, origin) => ingressDecision(method, route, origin, options.origin, body);

test('environment construction ignores inherited credentials, loaders, proxies and DB', () => {
  const actual = profileEnvironment({ PATH: '/usr/bin:/bin', DATABASE_URL: 'forbidden', OPENAI_API_KEY: 'forbidden', YCLIENTS_PARTNER_TOKEN: 'forbidden', NODE_OPTIONS: '--require=forbidden', HTTPS_PROXY: 'forbidden', PGHOST: 'forbidden', DOTENV_CONFIG_PATH: 'forbidden' }, options);
  assert.deepEqual(actual, profile());
  assert.equal(actual.NODE_ENV, 'development');
  assert.equal(actual.SELF_SERVE_TRIAL_SIGNUP, 'true');
  assert.equal(Object.keys(actual).some(key => /YCLIENTS|OPENAI|SMTP|APNS|WEBPUSH/.test(key)), false);
});
test('runtime validator accepts explicit local development; production HTTP prohibition remains intact', () => {
  const require = createRequire(import.meta.url);
  require('ts-node').register({ project: path.join(backend, 'tsconfig.scripts.json'), transpileOnly: true });
  const { validateRuntimeConfig } = require('../src/config/runtime-config.ts');
  assert.equal(validateRuntimeConfig(profile()).NODE_ENV, 'development');
  assert.throws(() => validateRuntimeConfig({ ...profile(), NODE_ENV: 'production' }), /Production CORS origins must use HTTPS/);
  // A validator-only production control, not this launcher's runtime config.
  const productionControl = { ...profile(), NODE_ENV: 'production', CORS_ALLOWED_ORIGINS: 'https://validator-unit.example.invalid' };
  assert.equal(validateRuntimeConfig(productionControl).NODE_ENV, 'production');
  assert.throws(() => validateRuntimeConfig({ ...productionControl, JWT_SECRET: 'short' }));
});
test('profile refuses altered scheduler, external DB, reused key or provider environment', () => {
  assert.throws(() => assertProfileEnvironment({ ...profile(), YCLIENTS_PARTNER_TOKEN: 'forbidden' }));
  assert.throws(() => assertProfileEnvironment({ ...profile(), OPERATIONAL_ALERTS_CANONICAL_CUTOVER_AT: '2026-01-01' }));
  assert.throws(() => assertProfileEnvironment({ ...profile(), TEAM_COMMUNICATIONS_SCHEDULER_ENABLED: 'true' }));
  assert.throws(() => assertProfileEnvironment({ ...profile(), CRM_ENCRYPTION_KEY: keys.JWT_SECRET }));
  assert.throws(() => assertProfileEnvironment({ ...profile(), DATABASE_URL: options.databaseUrl.replace('127.0.0.1', 'external.invalid') }));
  assert.throws(() => assertProfileEnvironment({ ...profile(), HOST: '0.0.0.0' }));
  assert.equal(Object.entries(FIXED_PROFILE).filter(([name]) => name.endsWith('_SCHEDULER_ENABLED')).every(([, value]) => value === 'false'), true);
});
test('admits exact standard onboarding/password routes for existing owners', () => {
  assert.equal(admit('POST', '/api/onboarding/trial-activations', { source: 'web' }), null);
  assert.equal(admit('POST', '/api/onboarding/trial', signup()), null);
  assert.equal(admit('POST', '/api/auth/login', { tenantSlug: 'unit-business', email: 'unit@example.invalid', password: 'UnitPasswordOnly123' }), null);
  assert.equal(admit('POST', '/api/auth/refresh', { refreshToken: 'unit-only' }), null);
  assert.equal(admit('POST', '/api/auth/logout', {}), null);
  for (const route of ['/api/health', '/api/health/ready', '/api/branches', '/api/integrations/crm']) assert.equal(admit('GET', route, undefined, options.origin), null);
});
test('direct-backend fence rejects other owners, ambiguous routes, query and body variants', () => {
  for (const route of ['/api/ai/chat', '/api/ai/transcribe', '/api/onboarding/ai/drafts', '/api/auth/email/start', '/api/auth/phone/start', '/api/auth/oauth/yandex/start', '/api/widgets/intent', '/api/team-communications/messages', '/api/branches']) assert.equal(admit('POST', route, {}), 'local_onboarding_route_disabled');
  for (const route of ['/api/integrations/crm/connect', '/api/integrations/crm/discover', '/api/integrations/crm/activate', '/api/integrations/crm/preview']) assert.equal(admit('POST', route, {}), 'local_provider_admission_required');
  for (const route of ['/api/branches?tenant=x', '//api/branches', '/api/%62ranches', '/api/branches/', '/api/branches#x']) assert.equal(admit('GET', route), 'local_onboarding_route_disabled');
  assert.equal(admit('POST', '/api/onboarding/trial', { ...signup(), planId: 'forged' }), 'local_onboarding_route_disabled');
  assert.equal(admit('POST', '/api/onboarding/trial', { ...signup(), calendarSource: 'internal' }), 'local_onboarding_route_disabled');
  assert.equal(admit('POST', '/api/auth/login', { email: 'unit@example.invalid', password: 'unit' }), 'local_onboarding_route_disabled');
  assert.equal(admit('GET', '/api/branches', undefined, 'https://other.invalid'), 'local_onboarding_origin_refused');
});
test('web relay and direct backend reject cross-origin effects before Origin is dropped', () => {
  const host = new URL(options.origin).host;
  assert.equal(localBrowserBoundary({ host }, options.origin, host), true);
  assert.equal(localBrowserBoundary({ host, origin: options.origin, 'sec-fetch-site': 'same-origin' }, options.origin, host), true);
  for (const headers of [
    { host, origin: 'https://other.invalid' }, { host, origin: 'null' },
    { host, origin: [options.origin] }, { host, 'sec-fetch-site': 'cross-site' },
    { host, 'sec-fetch-site': 'same-site' }, { host: 'rebound.example.invalid:55433' },
    { host: ['127.0.0.1:55433'] }, { host: '127.0.0.1:55432' },
  ]) assert.equal(localBrowserBoundary(headers, options.origin, host), false);
  assert.equal(localBrowserBoundary({ host: '127.0.0.1:55432', origin: options.origin }, options.origin, '127.0.0.1:55432'), true);
});
test('fresh owned PG plan omits seeds/fixtures and migrations use controlled empty cwd', () => {
  const plan = sessionPlan(planOptions);
  assert.equal(plan.durationMs, 900000);
  assert.deepEqual(plan.setup.map(step => step.name), ['backend-build', 'react-build', 'initdb', 'pg-start', 'createdb', 'migrations']);
  assert.ok(plan.setup[2].args.includes('--auth-host=scram-sha-256'));
  assert.equal(plan.setup[5].cwd, options.stateDirectory);
  assert.ok(plan.setup[5].args.includes('--config=' + path.join(options.stateDirectory, 'prisma.config.mjs')));
  assert.equal(plan.runtime.cwd, options.stateDirectory);
  assert.equal(JSON.stringify(plan).includes('jest'), false);
  const config = migrationConfigSource(backend);
  assert.equal(/dotenv|seed/.test(config), false);
  assert.ok(config.includes('process.env.DATABASE_URL'));
  assert.ok(!config.includes('postgresql:'));
  assert.throws(() => sessionPlan({ ...planOptions, database: 'existing_production' }));
  assert.throws(() => sessionPlan({ ...planOptions, apiPort: planOptions.pgPort }));
  assert.throws(() => sessionPlan({ ...planOptions, minutes: 16 }));
  assert.throws(() => sessionPlan({ ...planOptions, stateDirectory: 'relative' }));
});
test('private state cannot be existing or enter the repository through a symlink', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-onboarding-path-unit-'));
  try {
    const repository = path.dirname(backend);
    assert.throws(() => externalStatePath(path.join(repository, 'new-private-state'), repository));
    assert.throws(() => externalStatePath(directory, repository));
    fs.symlinkSync(repository, path.join(directory, 'repository-link'));
    assert.throws(() => externalStatePath(path.join(directory, 'repository-link/new-private-state'), repository));
    assert.equal(externalStatePath(path.join(directory, 'new-private-state'), repository), path.join(fs.realpathSync(directory), 'new-private-state'));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('restart metadata requires the exact completed launcher session and unchanged committed source', () => {
  const state = options.stateDirectory;
  const source = { head: 'a'.repeat(40), files: [{ path: 'unit-source.mjs', gitBlob: 'b'.repeat(40), sha256: 'c'.repeat(64) }] };
  const manifest = {
    contract: 'maya.normal-local-onboarding-session/1', status: 'stopped', providerAdmission: false,
    qualifiedAcceptance: false, source, stateDirectory: state, ownedCluster: path.join(state, 'pg'),
    creation: 'fresh-exclusive-directory_then-initdb',
    completed: ['backend-build', 'react-build', 'initdb', 'pg-start', 'createdb', 'migrations'],
    clusterStopped: true, runtimeGroupAbsent: true, sourceUnchanged: true, privateStateRetained: true,
    readyAt: '2026-10-10T12:00:00.000Z', resources: { nodeHeapMb: 3072, pgSharedBuffersMb: 64, pgWorkMemMb: 4, pgMaxConnections: 30 },
  };
  assert.doesNotThrow(() => assertCompletedSession(manifest, state, source));
  assert.doesNotThrow(() => assertCompletedSession({ ...manifest, status: 'cancelled' }, state, source));
  for (const changed of [
    { status: 'failed' }, { status: 'ready' }, { readyAt: undefined }, { readyAt: 'invalid' },
    { clusterStopped: false }, { runtimeGroupAbsent: false }, { sourceUnchanged: false },
    { providerAdmission: true }, { qualifiedAcceptance: true }, { privateStateRetained: false },
    { creation: 'existing-database' }, { completed: manifest.completed.slice(1) },
    { ownedCluster: '/private/tmp/another-cluster' }, { stateDirectory: '/private/tmp/another-state' },
    { source: { ...source, head: 'd'.repeat(40) } }, { resources: { ...manifest.resources, pgMaxConnections: 31 } },
  ]) assert.throws(() => assertCompletedSession({ ...manifest, ...changed }, state, source));
});
