// One finite stage-0 profile. No provider admission, fixtures or business grants.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

export const PRIVATE_KEYS = Object.freeze([
  'JWT_SECRET', 'AUTH_REFRESH_TOKEN_SECRET', 'AUTH_SESSION_METADATA_SECRET',
  'AUTH_RATE_LIMIT_SECRET', 'PHONE_AUTH_SECRET', 'EMAIL_AUTH_SECRET',
  'CRM_ENCRYPTION_KEY', 'CLIENT_IDENTITY_HASH_SECRET',
  'ACTION_ENGINE_IDENTITY_SECRET', 'ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET',
  'ACTION_ENGINE_POLICY_ATTESTATION_SECRET',
  'MAYA_LOYALTY_REDEMPTION_CODE_PEPPER', 'MAYA_REFERRAL_REWARD_PRESENTATION_KEY',
  'MAYA_REFERRAL_REWARD_CLAIM_SECRET', 'MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY',
  'MAYA_GIFT_CERTIFICATE_CLAIM_SECRET',
]);
export const FIXED_PROFILE = Object.freeze({
  MAYA_LOCAL_ONBOARDING_PROFILE: 'stage0', NODE_ENV: 'development',
  HOST: '127.0.0.1', NODE_OPTIONS: '--max-old-space-size=3072', LANG: 'C', TZ: 'UTC',
  AUTH_TRUST_PROXY: 'loopback', SELF_SERVE_TRIAL_SIGNUP: 'true',
  PHONE_LOGIN_ENABLED: 'false', EMAIL_LOGIN_ENABLED: 'false',
  YANDEX_LOGIN_ENABLED: 'false', TELEGRAM_LOGIN_ENABLED: 'false',
  PWA_TENANT_INSTALL_ENABLED: 'false', SWAGGER_ENABLED: 'false',
  AI_CORE_PROVIDER: 'safe', GOODS_PHOTO_OCR_PROVIDER: 'disabled',
  BILLING_SCHEDULER_ENABLED: 'false', OWNER_REPORTS_SCHEDULER_ENABLED: 'false',
  APPOINTMENT_REMINDERS_SCHEDULER_ENABLED: 'false',
  INGESTION_QUARANTINE_RETENTION_ENABLED: 'false',
  CRM_RECONCILIATION_SCHEDULER_ENABLED: 'false',
  EXPENSE_REMINDERS_CANONICAL_ENABLED: 'false',
  TEAM_COMMUNICATIONS_SCHEDULER_ENABLED: 'false',
  NATIVE_FEEDBACK_SCHEDULER_ENABLED: 'false',
  MAYA_REFERRAL_REWARD_PRESENTATION_KEY_VERSION: 'local-onboarding-v1',
  MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY_VERSION: 'local-onboarding-v1',
  CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: 'true',
});
const PROCESS_KEYS = ['PATH', 'HOME', 'TMPDIR', 'SYSTEMROOT'];

export function assertDatabaseUrl(raw) {
  const url = new URL(raw);
  assert.equal(url.protocol, 'postgresql:'); assert.equal(url.hostname, '127.0.0.1');
  assert.ok(url.port && Number(url.port) > 1024 && !['5432', '55611'].includes(url.port));
  assert.equal(url.username, 'maya_local_onboarding');
  assert.match(url.pathname, /^\/maya_local_onboarding_[a-f0-9]{16}$/);
  assert.match(url.password, /^[a-f0-9]{64}$/);
  assert.equal(url.search + url.hash, '');
}
export function profileEnvironment(system, { databaseUrl, keys, apiPort, origin, stateDirectory }) {
  const env = { ...FIXED_PROFILE, DATABASE_URL: databaseUrl, PORT: String(apiPort), CORS_ALLOWED_ORIGINS: origin, MAYA_LOCAL_ONBOARDING_STATE: stateDirectory };
  for (const key of PROCESS_KEYS) if (typeof system[key] === 'string') env[key] = system[key];
  for (const key of PRIVATE_KEYS) env[key] = keys[key];
  assertProfileEnvironment(env);
  return env;
}
export function assertProfileEnvironment(env) {
  const allowed = new Set([...Object.keys(FIXED_PROFILE), ...PRIVATE_KEYS, ...PROCESS_KEYS, 'DATABASE_URL', 'PORT', 'CORS_ALLOWED_ORIGINS', 'MAYA_LOCAL_ONBOARDING_STATE']);
  // macOS adds this text-encoding metadata when starting Node even with an
  // explicit child environment. It is not inherited by profileEnvironment.
  if (process.platform === 'darwin' && Object.hasOwn(env, '__CF_USER_TEXT_ENCODING')) {
    const value = env.__CF_USER_TEXT_ENCODING;
    assert.ok(typeof value === 'string' && value.length <= 64 && /^(?:0x[0-9a-f]+|[0-9]+):(?:0x[0-9a-f]+|[0-9]+):(?:0x[0-9a-f]+|[0-9]+)$/i.test(value), 'Invalid macOS text encoding metadata');
    allowed.add('__CF_USER_TEXT_ENCODING');
  }
  // Values are never included in errors: these fields contain private material.
  for (const key of Object.keys(env)) assert.ok(allowed.has(key), 'Unapproved runtime environment key');
  for (const [key, value] of Object.entries(FIXED_PROFILE)) assert.ok(env[key] === value, 'Local onboarding profile setting changed');
  assertDatabaseUrl(env.DATABASE_URL);
  assert.ok(/^\d+$/.test(env.PORT) && Number(env.PORT) > 1024 && Number(env.PORT) <= 65535);
  const origin = new URL(env.CORS_ALLOWED_ORIGINS);
  assert.equal(origin.protocol, 'http:'); assert.equal(origin.hostname, '127.0.0.1');
  assert.ok(Number(origin.port) > 1024); assert.equal(origin.username + origin.password + origin.search + origin.hash, '');
  assert.equal(origin.pathname, '/'); assert.ok(path.isAbsolute(env.MAYA_LOCAL_ONBOARDING_STATE));
  const values = PRIVATE_KEYS.map(key => env[key]);
  assert.ok(values.every(value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)), 'Private service key shape invalid');
  assert.equal(new Set(values).size, PRIVATE_KEYS.length, 'Service keys must be independent');
}
export function assertPrivateCwd(directory) {
  const real = fs.realpathSync(directory);
  assert.equal(real, directory, 'Private directory must be canonical');
  const stat = fs.lstatSync(real);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o777) === 0o700, 'Private runtime directory refused');
  for (const name of ['.env', '.env.local']) assert.equal(fs.existsSync(path.join(real, name)), false, 'Runtime dotenv file refused');
}
export function externalStatePath(requested, repository) {
  assert.ok(typeof requested === 'string' && path.isAbsolute(requested), 'Fresh absolute private state path required');
  assert.equal(fs.existsSync(requested), false, 'Existing state is refused');
  // Resolve the existing parent before mkdir; a symlink into the worktree must
  // not allow private generated keys to become repository files.
  const candidate = path.join(fs.realpathSync(path.dirname(requested)), path.basename(requested));
  const relative = path.relative(fs.realpathSync(repository), candidate);
  assert.ok(relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative), 'Private state must be outside the repository');
  const parent = fs.statSync(path.dirname(candidate));
  assert.ok(parent.isDirectory() && (parent.uid === process.getuid() || (parent.uid === 0 && (parent.mode & 0o1000) !== 0)), 'Private state parent ownership refused');
  return candidate;
}
const closed = (body, fields) => body !== null && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === fields.length && fields.every(field => Object.hasOwn(body, field));
const textBound = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;
export function localBrowserBoundary(headers, expectedOrigin, expectedHost) {
  if (headers.host !== expectedHost) return false;
  if (headers.origin !== undefined && headers.origin !== expectedOrigin) return false;
  return headers['sec-fetch-site'] === undefined || ['none', 'same-origin'].includes(headers['sec-fetch-site']);
}
export function ingressDecision(method, rawPath, requestOrigin, expectedOrigin, body) {
  if (requestOrigin && requestOrigin !== expectedOrigin) return 'local_onboarding_origin_refused';
  if (typeof rawPath !== 'string' || !rawPath.startsWith('/') || /[\\%?#\u0000]/.test(rawPath)) return 'local_onboarding_route_disabled';
  if (method === 'GET' && ['/api/health', '/api/health/ready', '/api/branches', '/api/integrations/crm'].includes(rawPath)) return null;
  if (method === 'POST') {
    if (rawPath === '/api/onboarding/trial-activations' && closed(body, ['source']) && body.source === 'web') return null;
    if (rawPath === '/api/onboarding/trial' && closed(body, ['trialActivationToken', 'name', 'slug', 'ownerEmail', 'password', 'branchName', 'branchTimezone', 'calendarSource']) && body.calendarSource === 'external' &&
      textBound(body.trialActivationToken, 256) && textBound(body.name, 200) && textBound(body.slug, 100) && textBound(body.ownerEmail, 254) && textBound(body.password, 1024) && textBound(body.branchName, 200) && textBound(body.branchTimezone, 100)) return null;
    if (rawPath === '/api/auth/login' && closed(body, ['tenantSlug', 'email', 'password']) && textBound(body.tenantSlug, 100) && textBound(body.email, 254) && textBound(body.password, 1024)) return null;
    if (rawPath === '/api/auth/refresh' && closed(body, ['refreshToken']) && textBound(body.refreshToken, 8192)) return null;
    if (rawPath === '/api/auth/logout' && closed(body, [])) return null;
  }
  if (rawPath.startsWith('/api/integrations/crm/')) return 'local_provider_admission_required';
  return 'local_onboarding_route_disabled';
}
export function migrationConfigSource(backend) {
  assert.ok(path.isAbsolute(backend));
  // Plain PrismaConfig is accepted by the installed @prisma/config loader.
  // This file imports neither the repository config nor dotenv and has no seed.
  return `export default { schema: ${JSON.stringify(path.join(backend, 'prisma/schema.prisma'))}, migrations: { path: ${JSON.stringify(path.join(backend, 'prisma/migrations'))} }, datasource: { url: process.env.DATABASE_URL } };\n`;
}
