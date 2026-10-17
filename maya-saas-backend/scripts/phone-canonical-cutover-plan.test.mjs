import test from 'node:test';
import assert from 'node:assert/strict';
import { FROM, TO, PROFILE, canonicalCutoverPlan, migrationDifference, verifyCutoverPlan, verifyHistoricalObservation } from './phone-canonical-cutover-plan.mjs';

const migration = (name, letter = 'a') => ({ path: `maya-saas-backend/prisma/migrations/${name}/migration.sql`, sha256: letter.repeat(64) });
const input = () => ({
  bindings: { sourceCandidate: FROM, targetCandidate: TO, profile: PROFILE, profileDigest: 'a'.repeat(64),
    buildDigest: 'b'.repeat(64), webTreeDigest: 'c'.repeat(64), capacitorTreeDigest: 'd'.repeat(64) },
  previousMigrations: [migration('20261001_existing')], targetMigrations: [migration('20261001_existing'), migration('20261002_new', 'b')],
  historical: {
    environment: { MAYA_RELEASE: FROM, AI_CORE_PROVIDER: 'safe', YCLIENTS_BASE_URL: 'http://catalog-egress:8080/api/v1',
      SELF_SERVE_TRIAL_SIGNUP: 'false', APPOINTMENT_REMINDERS_SCHEDULER_ENABLED: 'false' },
    privateEnvironmentKeys: ['DATABASE_URL', 'CRM_ENCRYPTION_KEY'],
    compose: { name: 'maya-phone-staging', services: {
      backend: { image: 'maya-phone-backend:' + FROM, pull_policy: 'never', entrypoint: ['node', '/app/scripts/phone-ai-entry.mjs'], command: [],
        networks: ['private', 'catalog_private', 'model_private'], environment: { MAYA_RELEASE: FROM },
        env_file: ['/srv/maya-phone-staging/private/catalog.env'], volumes: ['staging_uploads:/app/uploads', 'old-wrapper:/app/scripts/phone-ai-entry.mjs:ro'] },
      postgres: { image: 'postgres:16-alpine', networks: ['private'], volumes: ['staging_postgres_data:/var/lib/postgresql/data'] },
      gateway: { ports: ['443:443'], volumes: [`/srv/maya-phone-staging/candidates/${FROM}/maya-carrier-react/dist/web:/srv/maya:ro`, 'staging_caddy_data:/data'] },
      'catalog-egress': { entrypoint: ['node', '/app/scripts/phone-catalog-egress.mjs'], networks: ['catalog_private', 'edge'] },
      'model-egress': { entrypoint: ['node', '/app/scripts/phone-ai-egress.mjs'] },
    }, networks: { private: { internal: true }, catalog_private: { internal: true }, model_private: { internal: true }, edge: {} },
    volumes: { staging_postgres_data: null, staging_uploads: null, staging_caddy_data: null } },
  },
});

test('canonical-main draft has no automatic migration, old wrapper or direct model egress; durable volumes preserved', () => {
  const i = input(), before = structuredClone(i), p = canonicalCutoverPlan(i), d = p.canonicalReadonlyDraft;
  assert.deepEqual(i, before, 'input mutation');
  assert.deepEqual(d.compose.services.backend.entrypoint, ['node', '--enable-source-maps', '/app/dist/src/main.js']);
  assert.deepEqual(d.compose.services.backend.command, []);
  assert.deepEqual(d.compose.services.backend.volumes, ['staging_uploads:/app/uploads']);
  assert.deepEqual(d.compose.services.backend.networks, ['private', 'catalog_private']);
  assert.equal(d.compose.services['model-egress'], undefined);
  assert.equal(d.compose.networks.model_private, undefined);
  assert.equal(d.environment.AI_CORE_PROVIDER, 'safe');
  assert.deepEqual(d.compose.services.postgres, i.historical.compose.services.postgres);
  assert.deepEqual(d.compose.services['catalog-egress'], i.historical.compose.services['catalog-egress']);
  assert.deepEqual(d.compose.volumes, i.historical.compose.volumes);
  assert.deepEqual(d.compose.services.gateway.ports, i.historical.compose.services.gateway.ports);
  assert.ok(d.compose.services.gateway.volumes[0].includes(TO));
  assert.deepEqual(p.migrations.addedInGit, [migration('20261002_new', 'b')]);
  assert.equal(p.migrations.livePending, null);
});

test('even matching configuration and complete hashes confer no execution, booking, grant or certificate', () => {
  const i = input(), p = canonicalCutoverPlan(i);
  assert.deepEqual(verifyHistoricalObservation(p, i.historical.compose),
    { matchesHistoricalComposeOnly: true, readyForExecution: false, authorityGranted: false });
  for (const key of ['readyForExecution', 'readyForBooking', 'currentServerVerified', 'authorityGranted']) assert.equal(p[key], false);
  assert.equal(p.certificate, 'NOT_ISSUED'); assert.equal(p.status, 'PREPARED_ONLY');
  assert.equal(p.remaining.length, 8); assert.ok(Object.values(p.effects).every(n => n === 0));
});

for (const [name, change] of [
  ['wrong target', i => i.bindings.targetCandidate = 'f'.repeat(40)],
  ['wrong previous candidate', i => i.bindings.sourceCandidate = 'f'.repeat(40)],
  ['broader profile', i => i.bindings.profile = 'closed-input.no-handoff@1'],
  ['missing byte binding', i => delete i.bindings.buildDigest],
  ['caller authorization attached', i => i.bindings.authorization = { approved: true }],
  ['historical backend on edge', i => i.historical.compose.services.backend.networks.push('edge')],
  ['historical provider already open', i => i.historical.environment.AI_CORE_PROVIDER = 'deepseek'],
]) test(name + ' refused in input', () => { const i = input(); change(i); assert.throws(() => canonicalCutoverPlan(i)); });

test('removed, rewritten, duplicated and path-traversal migration inventories refused', () => {
  const old = [migration('20261001_existing')];
  assert.throws(() => migrationDifference(old, [migration('20261002_new')]));
  assert.throws(() => migrationDifference(old, [migration('20261001_existing', 'b')]));
  assert.throws(() => migrationDifference(old, [...old, ...old]));
  assert.throws(() => migrationDifference(old, [{ ...old[0], path: '../private.env' }]));
  assert.deepEqual(migrationDifference(old, old), []);
});

for (const [name, change] of [
  ['implicit migrate command', p => p.canonicalReadonlyDraft.compose.services.backend.command = ['npx', 'prisma', 'migrate', 'deploy']],
  ['seed entrypoint', p => p.canonicalReadonlyDraft.compose.services.backend.entrypoint = ['sh', '/app/scripts/staging-up.sh']],
  ['reintroduced runtime wrapper', p => p.canonicalReadonlyDraft.compose.services.backend.entrypoint = ['node', '/app/scripts/phone-ai-entry.mjs']],
  ['direct external network', p => p.canonicalReadonlyDraft.compose.services.backend.networks.push('edge')],
  ['database volume replacement', p => p.canonicalReadonlyDraft.compose.services.postgres.volumes = ['other:/var/lib/postgresql/data']],
  ['unknown provider environment', p => p.canonicalReadonlyDraft.environment.SMS_RU_API_ID = 'SYNTHETIC-NOT-A-KEY'],
  ['missing old revoke', p => p.cutover = p.cutover.filter(s => !s.startsWith('revoke-active-old'))],
  ['rollback crosses digest before revoke', p => p.rollback.reverse()],
  ['automatic certificate', p => p.certificate = 'CERTIFIED'],
  ['ready flag forged', p => p.readyForExecution = true],
]) test(name + ' refused in emitted plan', () => {
  const i = input(), p = canonicalCutoverPlan(i); change(p); assert.throws(() => verifyCutoverPlan(p, i));
});

test('unknown live compose changes cannot silently inherit historical preparation', () => {
  const i = input(), p = canonicalCutoverPlan(i);
  for (const mutate of [c => c.services.backend.privileged = true, c => c.services.backend.env_file.push('/unknown.env'),
    c => c.services.extra = { image: 'unknown' }, c => c.services.gateway.ports.push('8080:8080'),
    c => c.volumes.staging_postgres_data = { external: true }]) {
    const observed = structuredClone(i.historical.compose); mutate(observed);
    assert.throws(() => verifyHistoricalObservation(p, observed), /explicit reconciliation required/);
  }
});

test('cutover and rollback require durable revoke before changing runtime; newer business state is retained', () => {
  const p = canonicalCutoverPlan(input());
  assert.ok(p.cutover.indexOf('revoke-active-old-grant-on-matching-old-runtime-through-ar1') < p.cutover.indexOf('start-pinned-canonical-main-with-providers-closed'));
  assert.ok(p.rollback.indexOf('revoke-new-grant-on-matching-new-runtime-through-ar1') < p.rollback.indexOf('restore-recorded-compatible-runtime-and-carrier-artifacts'));
  assert.ok(p.rollback.includes('retain-current-database-encryption-keys-and-action-engine-receipts'));
  assert.ok(p.forbidden.includes('restore-over-new-effects'));
  assert.ok(p.forbidden.includes('new-create-for-unknown'));
});
