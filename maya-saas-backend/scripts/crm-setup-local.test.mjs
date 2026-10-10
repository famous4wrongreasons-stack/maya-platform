// Pure argument/fence checks. No database, listener, model or provider starts.
import assert from 'node:assert/strict';
import test from 'node:test';
import { localPlan, LOCAL_SOURCE_PATHS } from './crm-setup-local.mjs';
import { localRequestAllowed, observedDebugCode } from '../../maya-carrier-react/test/crm-a17-local-form-server.mjs';

const options = { output: '/tmp/local-form-proof', cluster: '/tmp/local-form-cluster/pg', pgBin: '/opt/homebrew/opt/postgresql@16/bin', port: 55123, database: 'maya_widget_gate_proof_c9occ_123abc', log: '/tmp/local-form-proof/postgres.log' };
const scope = { email: 'wl-1234abcd@widgets-live.test', companyId: 424242, branchId: '11111111-1111-4111-8111-111111111111' };
const requestId = '22222222-2222-4222-8222-222222222222';
const headers = { 'idempotency-key': requestId };
const connect = () => ({ provider: 'yclients', apiToken: 'SYNTHETIC_A17_V1', expectedVersion: null, settingsJson: { companyId: scope.companyId, branchBinding: { contract: 'maya.crm-branch-binding/1', companyId: scope.companyId, branchId: scope.branchId } } });

test('finite owned setup builds current React and runs one actual AppModule fixture', () => {
  const plan = localPlan(options);
  assert.equal(plan.durationMs, 900000);
  assert.deepEqual(plan.setup.map(command => command.name), ['initdb', 'pg-start', 'createdb', 'migrations', 'react-web-build']);
  assert.match(plan.setup[1].args.join(' '), /shared_buffers=64MB -c work_mem=4MB -c max_connections=30/);
  assert.ok(plan.stage.args.includes('--runInBand'));
  assert.ok(plan.stage.args.includes('test/widgets-live/crm-a17-local-form.probe-spec.ts'));
  assert.equal(plan.stage.env.JEST_CRM_LOCAL_DURATION_MS, '900000');
  assert.ok(!plan.setup.some(command => command.name === 'pg-restart'));
  for (const file of ['maya-saas-backend/scripts/crm-setup-local.mjs', 'maya-saas-backend/test/widgets-live/crm-a17-local-form.probe-spec.ts', 'maya-carrier-react/test/crm-a17-local-form-server.mjs']) assert.ok(LOCAL_SOURCE_PATHS.includes(file));
});
test('duration, database identity and output bounds refuse unsafe variants', () => {
  for (const minutes of [0, -1, 16, 1.5, 'NaN']) assert.throws(() => localPlan({ ...options, minutes }));
  assert.throws(() => localPlan({ ...options, database: 'maya_production' }));
  assert.throws(() => localPlan({ ...options, port: 5432 }));
  assert.throws(() => localPlan({ ...options, output: 'relative' }));
  assert.equal(localPlan({ ...options, minutes: '1' }).durationMs, 60000);
});
test('only exact synthetic material and bound company/branch may reach connect', () => {
  assert.equal(localRequestAllowed('POST', '/api/integrations/crm/connect', headers, connect(), scope), true);
  for (const apiToken of ['REAL_LOOKING_INPUT', '', ['SYNTHETIC_A17_V1']]) assert.equal(localRequestAllowed('POST', '/api/integrations/crm/connect', headers, { ...connect(), apiToken }, scope), false);
  const other = connect(); other.settingsJson.branchBinding.branchId = requestId;
  assert.equal(localRequestAllowed('POST', '/api/integrations/crm/connect', headers, other, scope), false);
  assert.equal(localRequestAllowed('POST', '/api/integrations/crm/connect', {}, connect(), scope), false);
  assert.equal(localRequestAllowed('POST', '/api/integrations/crm/connect', headers, { ...connect(), baseUrl: 'https://other.invalid' }, scope), false);
});
test('exact status/recovery reads stay read-only and activation needs the pinned version', () => {
  assert.equal(localRequestAllowed('GET', '/api/integrations/crm/operation?operation=install&requestId=' + requestId, {}, undefined, scope), true);
  assert.equal(localRequestAllowed('GET', '/api/integrations/crm/operation?operation=install&operation=activate&requestId=' + requestId, {}, undefined, scope), false);
  assert.equal(localRequestAllowed('POST', '/api/integrations/crm/activate', headers, { expectedVersion: 'a'.repeat(64) }, scope), true);
  assert.equal(localRequestAllowed('POST', '/api/integrations/crm/activate', headers, {}, scope), false);
  assert.equal(localRequestAllowed('POST', '/api/ai/chat', {}, { text: 'hello' }, scope), false);
  assert.equal(localRequestAllowed('GET', 'https://external.invalid/api/integrations/crm', {}, undefined, scope), false);
});
test('real email authentication shape, refresh and logout are forwarded without substitutions', () => {
  assert.equal(localRequestAllowed('POST', '/api/auth/email/start', {}, { email: scope.email }, scope), true);
  assert.equal(localRequestAllowed('POST', '/api/auth/email/verify', {}, { email: scope.email, code: '123456' }, scope), true);
  assert.equal(localRequestAllowed('POST', '/api/auth/email/verify', {}, { email: scope.email, code: ['123456'] }, scope), false);
  assert.equal(localRequestAllowed('POST', '/api/auth/email/start', {}, { email: 'other@example.invalid' }, scope), false);
  assert.equal(localRequestAllowed('POST', '/api/auth/logout', {}, {}, scope), true);
  assert.equal(localRequestAllowed('POST', '/api/auth/logout', {}, { refreshToken: 'extra' }, scope), false);
  assert.equal(localRequestAllowed('POST', '/api/auth/refresh', {}, { refreshToken: 'synthetic-refresh-placeholder' }, scope), true);
});
test('only a successful actual debug response for the exact synthetic email yields an in-memory code', () => {
  const body = { ok: true, email: scope.email, delivery: 'debug', next_step: 'verify_email_code', debug_code: '123456', expires_at: '2026-10-10T12:00:00.000Z' };
  assert.deepEqual(observedDebugCode(201, JSON.stringify(body), scope.email), { code: '123456', expiresAt: Date.parse(body.expires_at) });
  for (const changed of [{ ...body, email: 'other@example.invalid' }, { ...body, debug_code: ['123456'] }, { ...body, delivery: 'email' }, { ...body, debug_code: '<script>' }, { ...body, expires_at: 'invalid' }]) assert.equal(observedDebugCode(201, JSON.stringify(changed), scope.email), null);
  assert.equal(observedDebugCode(400, JSON.stringify(body), scope.email), null);
  assert.equal(observedDebugCode(201, 'not-json', scope.email), null);
});
