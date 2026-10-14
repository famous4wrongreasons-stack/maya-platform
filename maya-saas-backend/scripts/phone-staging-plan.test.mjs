import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { privatePhonePlan, verifyPrivatePlan, assertPrivateEnvironment } from './phone-staging-plan.mjs';
import { PRIVATE_KEYS } from './local-onboarding-profile.mjs';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = fs.readFileSync(path.join(backend, 'compose.staging.yml'), 'utf8');
const caddy = fs.readFileSync(path.join(backend, 'deploy/staging/Caddyfile'));
const plan = () => privatePhonePlan('a'.repeat(40), base, caddy);
test('finite private plan retains canonical staging owner with no build/start/grant', () => {
  const p = plan(); verifyPrivatePlan(p, base, caddy);
  assert.equal(p.compose.services.backend.build, undefined);
  assert.equal(p.compose.services.backend.command, undefined);
  assert.equal(p.environment.MAYA_LOCAL_ONBOARDING_PROFILE, undefined);
  assert.equal(p.environment.NODE_ENV, 'production');
  assert.equal(p.compose.networks.private.internal, true);
  assert.deepEqual(p.compose.services.backend.networks, ['private']);
  assert.deepEqual(p.compose.services.postgres.networks, ['private']);
  assert.equal(p.compose.services.backend.ports, undefined);
  assert.equal(p.compose.services.postgres.ports, undefined);
  assert.equal(p.seedAllowed || p.widgetGrant || p.publicAdmission, false);
});
for (const [name, edit] of [
  ['public listener', p => p.compose.services.gateway.ports[0] = '80:80'],
  ['public DB', p => p.compose.services.postgres.ports = ['5432:5432']],
  ['outbound backend', p => p.compose.services.backend.networks.push('edge')],
  ['non-internal private network', p => p.compose.networks.private.internal = false],
  ['unlimited memory', p => delete p.compose.services.backend.mem_limit],
  ['unlimited swap', p => p.compose.services.backend.memswap_limit = -1],
  ['implicit build', p => p.compose.services.backend.build = '.'],
  ['seed', p => p.compose.services.backend.command = 'npm run prisma:seed'],
  ['old shell', p => p.compose.services.gateway.volumes[1] = '/legacy:/srv/maya:ro'],
  ['mutable backend tag', p => p.compose.services.backend.image = 'maya-phone-backend:latest'],
  ['retained DB environment', p => p.compose.services.backend.env_file = ['/salon/.env']],
  ['changed gateway command', p => p.compose.services.gateway.command = 'file-server'],
  ['enabled provider', p => p.environment.AI_CORE_PROVIDER = 'auto'],
  ['automatic reminders', p => p.environment.APPOINTMENT_REMINDERS_SCHEDULER_ENABLED = 'true'],
  ['certificate claim', p => p.certificateIssued = true],
  ['release grant', p => p.widgetGrant = true],
  ['different host', p => p.host = 'mayaos.ru'],
]) test('refuses ' + name, () => { const p = plan(); edit(p); assert.throws(() => verifyPrivatePlan(p, base, caddy)); });
function environment() {
  return { ...plan().environment, ...Object.fromEntries(PRIVATE_KEYS.map(key => [key, randomBytes(32).toString('hex')])),
    DATABASE_URL: `postgresql://maya_phone_synthetic:${randomBytes(32).toString('hex')}@postgres:5432/maya_phone_synthetic` };
}
test('accepts synthetic-only exact runtime environment, with no secrets emitted', () => assertPrivateEnvironment(environment(), plan()));
for (const [name, edit] of [
  ['provider secret', e => e.YCLIENTS_PARTNER_TOKEN = 'synthetic-unapproved-value'],
  ['production DB host', e => e.DATABASE_URL = e.DATABASE_URL.replace('@postgres:', '@production.invalid:')],
  ['salon database', e => e.DATABASE_URL = e.DATABASE_URL.replace('/maya_phone_synthetic', '/salon')],
  ['foreign CORS', e => e.CORS_ALLOWED_ORIGINS = '*'],
  ['stage0 launcher', e => e.MAYA_LOCAL_ONBOARDING_PROFILE = 'stage0'],
  ['shared key', e => e[PRIVATE_KEYS[1]] = e[PRIVATE_KEYS[0]]],
  ['provider enabled', e => e.AI_CORE_PROVIDER = 'deepseek'],
]) test('runtime environment refuses ' + name, () => { const e = environment(); edit(e); assert.throws(() => assertPrivateEnvironment(e, plan())); });

test('actual Prisma CLI: missing runner config fails before DB; restored config reaches synthetic connection', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-phone-prisma-config-'));
  try {
    fs.mkdirSync(path.join(directory, 'prisma'));
    fs.copyFileSync(path.join(backend, 'prisma/schema.prisma'), path.join(directory, 'prisma/schema.prisma'));
    fs.symlinkSync(path.join(backend, 'node_modules'), path.join(directory, 'node_modules'));
    const run = () => spawnSync(process.execPath, [path.join(backend, 'node_modules/prisma/build/index.js'), 'migrate', 'status'], {
      cwd: directory, encoding: 'utf8', timeout: 30000,
      env: { PATH: path.dirname(process.execPath) + ':/usr/bin:/bin', CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: 'true',
        DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:1/synthetic?connect_timeout=1' },
    });
    const missing = run();
    assert.notEqual(missing.status, 0); assert.match(missing.stdout + missing.stderr, /datasource.url property is required/);
    assert.doesNotMatch(missing.stdout + missing.stderr, /P1001/);
    fs.copyFileSync(path.join(backend, 'prisma.config.ts'), path.join(directory, 'prisma.config.ts'));
    const fixed = run();
    assert.notEqual(fixed.status, 0); assert.doesNotMatch(fixed.stdout + fixed.stderr, /datasource.url property is required/);
    assert.match(fixed.stdout + fixed.stderr, /P1001/); // exact unreachable synthetic DB, not successful migration
    const dockerfile = fs.readFileSync(path.join(backend, 'Dockerfile'), 'utf8');
    assert.match(dockerfile, /COPY prisma\.config\.ts \.\//);
    assert.match(dockerfile, /COPY --from=builder \/app\/prisma\.config\.ts \.\//);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
