// Offline preparation of ONE private phone-check deployment from the existing
// staging owner. No Docker/SSH command, secret generation, DB or release grant.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { assertStagingCarrierConfiguration } from './staging-carrier-preflight.mjs';
import { FIXED_PROFILE, PRIVATE_KEYS } from './local-onboarding-profile.mjs';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { load, JSON_SCHEMA } = createRequire(import.meta.url)('js-yaml');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const HOST = 'phone-test.mayaos.ru';
export const ROOT = '/srv/maya-phone-staging';
export const BASE_COMPOSE_SHA256 = '656e14c87d1c4c62b8c18f263d819f1df6152aab3af4c1ac2126caf8a57c8834';

export function privatePhonePlan(candidate, composeText, caddyBytes) {
  assert.match(candidate, /^[a-f0-9]{40}$/, 'exact committed candidate required');
  assertStagingCarrierConfiguration(composeText, caddyBytes);
  assert.equal(digest(composeText), BASE_COMPOSE_SHA256, 'base staging changed: review the whole derivation');
  const compose = load(composeText, { schema: JSON_SCHEMA });
  const candidateRoot = `${ROOT}/candidates/${candidate}`;
  compose.name = 'maya-phone-staging';
  compose.networks = { private: { driver: 'bridge', internal: true }, edge: { driver: 'bridge' } };
  for (const [name, memory, cpu] of [['postgres', '256m', 0.2], ['backend', '640m', 0.5], ['gateway', '96m', 0.1]]) {
    Object.assign(compose.services[name], {
      restart: 'no', mem_limit: memory, memswap_limit: memory, cpus: cpu, pids_limit: 128,
      logging: { driver: 'local', options: { 'max-size': '5m', 'max-file': '2' } },
    });
  }
  Object.assign(compose.services.postgres, {
    environment: { POSTGRES_DB: 'maya_phone_synthetic', POSTGRES_USER: 'maya_phone_synthetic',
      POSTGRES_PASSWORD: '${MAYA_PHONE_DB_PASSWORD:?private test DB credential required}' },
    command: ['postgres', '-c', 'shared_buffers=32MB', '-c', 'max_connections=30', '-c', 'work_mem=2MB'],
  });
  const app = compose.services.backend;
  // Build separately under a measured resource budget. Never build on a shared
  // host implicitly as part of `up`; only this exact locally verified image.
  delete app.build;
  app.image = `maya-phone-backend:${candidate}`;
  app.pull_policy = 'never';
  app.env_file = [`${ROOT}/private/backend.env`];
  app.environment = { MAYA_RELEASE: candidate };
  const gateway = compose.services.gateway;
  gateway.environment = { STAGING_HOST: HOST };
  gateway.ports = ['127.0.0.1:9080:80', '127.0.0.1:9443:443', '127.0.0.1:9443:443/udp'];
  gateway.networks = ['private', 'edge'];
  gateway.volumes = [
    `${candidateRoot}/maya-saas-backend/deploy/staging/Caddyfile:/etc/caddy/Caddyfile:ro`,
    `${candidateRoot}/maya-carrier-react/dist/web:/srv/maya:ro`,
    `${candidateRoot}/maya-saas-backend/deploy/platform/beget-edge/oauth-callback.html:/srv/maya-callback/oauth-callback.html:ro`,
    ...gateway.volumes.slice(3),
  ];
  const { MAYA_LOCAL_ONBOARDING_PROFILE: removedStage0, ...noProviders } = FIXED_PROFILE;
  void removedStage0;
  const environment = { ...noProviders, NODE_ENV: 'production', HOST: '0.0.0.0', PORT: '3000',
    NODE_OPTIONS: '--max-old-space-size=384', AUTH_TRUST_PROXY: 'loopback,linklocal,uniquelocal',
    CORS_ALLOWED_ORIGINS: `https://${HOST},capacitor://localhost`,
    PWA_PUBLIC_APP_URL: `https://${HOST}/`, MAYA_RELEASE: candidate };
  return { contract: 'maya.private-phone-staging-preparation/1', candidate, host: HOST,
    compose, environment, privateEnvironmentKeys: ['DATABASE_URL', ...PRIVATE_KEYS],
    baseComposeSha256: digest(composeText), caddySha256: digest(caddyBytes),
    syntheticOnly: true, publicAdmission: false, runtimeQualified: false,
    productionRelease: false, certificateIssued: false, widgetGrant: false,
    seedAllowed: false, productionDataAllowed: false, providerCredentialsAllowed: false };
}

export function verifyPrivatePlan(plan, composeText, caddyBytes) {
  assert.deepEqual(plan, privatePhonePlan(plan.candidate, composeText, caddyBytes),
    'phone plan changed: no caller-selected ports, environment, networks or authority');
}

export function assertPrivateEnvironment(env, plan) {
  assert.deepEqual(Object.keys(env).sort(), [...Object.keys(plan.environment), ...plan.privateEnvironmentKeys].sort(),
    'unknown/missing environment setting');
  for (const [key, value] of Object.entries(plan.environment)) assert.ok(env[key] === value, 'fixed setting changed');
  const keys = PRIVATE_KEYS.map(key => env[key]);
  assert.ok(keys.every(value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)), 'test key shape refused');
  assert.equal(new Set(keys).size, PRIVATE_KEYS.length, 'independent test keys required');
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { throw new Error('private DB URL refused'); }
  assert.ok(url.protocol === 'postgresql:' && url.hostname === 'postgres' && url.port === '5432' &&
    url.username === 'maya_phone_synthetic' && url.pathname === '/maya_phone_synthetic' &&
    /^[a-f0-9]{64}$/.test(url.password) && url.search + url.hash === '', 'foreign database refused');
  assert.ok(!keys.includes(url.password), 'DB credential must be independent');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ strict: true, options: { candidate: { type: 'string' }, out: { type: 'string' } } });
    assert.ok(values.out && path.isAbsolute(values.out) && !fs.existsSync(values.out), 'fresh output directory required');
    const out = path.join(fs.realpathSync(path.dirname(values.out)), path.basename(values.out));
    const relative = path.relative(path.dirname(backend), out);
    assert.ok(relative.startsWith('..' + path.sep), 'output must be outside repository');
    const plan = privatePhonePlan(values.candidate, fs.readFileSync(path.join(backend, 'compose.staging.yml'), 'utf8'),
      fs.readFileSync(path.join(backend, 'deploy/staging/Caddyfile')));
    fs.mkdirSync(out, { mode: 0o700 });
    for (const [name, value] of [['PLAN.json', plan], ['compose.phone.json', plan.compose]])
      fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ status: 'PREPARED_ONLY', candidate: plan.candidate, out,
      credentialsGenerated: false, serverChanged: false, publicAdmission: false }));
  } catch {
    console.error('PHONE STAGING PREPARATION REFUSED. No deployment or credentials issued.');
    process.exitCode = 1;
  }
}
