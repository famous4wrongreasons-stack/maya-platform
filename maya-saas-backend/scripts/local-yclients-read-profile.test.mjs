// Synthetic transport qualification only. No listener, PostgreSQL, model or real credential.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { PRIVATE_KEYS, assertProfileEnvironment } from './local-onboarding-profile.mjs';
import { realReadEnvironment, assertRealReadEnvironment, realReadIngress } from './local-yclients-read-profile.mjs';
import { createReadTransport, admittedProviderRead, validateTeamResponse, READ_LIMITS } from './local-yclients-read-transport.mjs';

const requestId = '11111111-1111-4111-8111-111111111111';
const origin = 'http://127.0.0.1:55433';
const settings = { companyId: 424242, branchBinding: { contract: 'maya.crm-branch-binding/1', companyId: 424242, branchId: 'synthetic-branch' } };
const body = () => ({ provider: 'yclients', apiToken: 'SYNTHETIC_USER_ONLY_123', expectedVersion: null, settingsJson: settings });
const headers = { 'idempotency-key': requestId, origin };
const options = { databaseUrl: `postgresql://maya_local_onboarding:${'f'.repeat(64)}@127.0.0.1:55431/maya_local_onboarding_0123456789abcdef`, keys: Object.fromEntries(PRIVATE_KEYS.map((key, index) => [key, (index + 1).toString(16).padStart(64, '0')])), apiPort: 55432, origin, stateDirectory: '/private/tmp/synthetic-real-read-unit-only' };
const actor = { tenantId: 'synthetic-tenant', userId: 'synthetic-owner', membershipStatus: 'active' };
const request = (changed = {}) => ({ method: 'POST', originalUrl: '/api/integrations/crm/connect', user: actor, body: body(), ...changed });
const source = route => 'https://api.yclients.com/api/v1/' + route;
const reply = (data, extra = {}) => new Response(JSON.stringify({ success: true, data, ...extra }), { status: 200 });

test('separate real-read profile excludes inherited credentials and cannot weaken stage0', () => {
  const env = realReadEnvironment({ YCLIENTS_PARTNER_TOKEN: 'INHERITED_NOT_ALLOWED', OPENAI_API_KEY: 'INHERITED_NOT_ALLOWED' }, options);
  assert.equal(env.YCLIENTS_PARTNER_TOKEN, undefined);
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.throws(() => assertRealReadEnvironment(env, true));
  assert.throws(() => assertProfileEnvironment(env));
  const ready = realReadEnvironment({}, options, 'SYNTHETIC_PARTNER_ONLY_123');
  assert.doesNotThrow(() => assertRealReadEnvironment(ready, true));
  for (const changed of [{ ...ready, CRM_RECONCILIATION_SCHEDULER_ENABLED: 'true' }, { ...ready, YCLIENTS_BASE_URL: 'https://other.invalid' }, { ...ready, YCLIENTS_PARTNER_TOKEN: 'has,separator' }, { ...ready, MAYA_LOCAL_ONBOARDING_PROFILE: 'stage0' }]) assert.throws(() => assertRealReadEnvironment(changed));
});
test('only existing exact A17 install/activate/status and ordinary onboarding are admitted', () => {
  assert.equal(realReadIngress('POST', '/api/integrations/crm/connect', headers, body(), origin), null);
  assert.equal(realReadIngress('POST', '/api/integrations/crm/activate', headers, { expectedVersion: 'a'.repeat(64) }, origin), null);
  assert.equal(realReadIngress('GET', '/api/integrations/crm/operation?operation=install&requestId=' + requestId, headers, undefined, origin), null);
  for (const route of ['/api/integrations/crm/preview', '/api/integrations/crm/discover', '/api/integrations/crm/recheck', '/api/integrations/crm/journal', '/api/ai/chat', '/api/integrations/crm/record/1', '/api/integrations/crm/connect?extra=1']) assert.notEqual(realReadIngress('POST', route, headers, body(), origin), null);
  for (const changed of [{ ...body(), baseUrl: 'https://other.invalid' }, { ...body(), settingsJson: { ...settings, activeMasterIds: [1] } }, { ...body(), expectedVersion: 'forged' }, { ...body(), provider: 'mock' }, { ...body(), settingsJson: { ...settings, branchBinding: { ...settings.branchBinding, companyId: 99 } } }]) assert.notEqual(realReadIngress('POST', '/api/integrations/crm/connect', headers, changed, origin), null);
  assert.notEqual(realReadIngress('POST', '/api/integrations/crm/connect', {}, body(), origin), null);
  assert.notEqual(realReadIngress('POST', '/api/integrations/crm/connect', { ...headers, origin: 'https://other.invalid' }, body(), origin), null);
});
test('native request destination refuses redirects, other tenants companies, writes, client/record and bookable-only team', () => {
  for (const route of ['companies?my=1', 'company/424242', 'book_services/424242', 'services/424242', 'service_categories/424242', 'company/424242/staff', 'staff/424242']) assert.ok(admittedProviderRead(source(route), {}, 424242));
  for (const route of ['company/424243', 'companies?my=1&page=2', 'companies?my=1&my=1', 'records/424242', 'company/424242/clients/search', 'book_staff/424242', 'company/%34%32%34%32%34%32', 'company/424242?x=1']) assert.equal(admittedProviderRead(source(route), {}, 424242), null);
  for (const url of ['http://api.yclients.com/api/v1/company/424242', 'https://api.yclients.com.evil.invalid/api/v1/company/424242', 'https://user@api.yclients.com/api/v1/company/424242']) assert.equal(admittedProviderRead(url, {}, 424242), null);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal(admittedProviderRead(source('company/424242'), { method }, 424242), null);
});
test('team completeness rejects truncated, paginated, duplicate, unknown or bookable-only evidence', () => {
  const complete = { success: true, data: [{ id: 1 }, { id: 2 }], meta: { total_count: 2, page: 1 } };
  assert.doesNotThrow(() => validateTeamResponse(complete, new Headers(), 424242));
  for (const changed of [{ ...complete, data: Array.from({ length: 51 }, (_, id) => ({ id: id + 1 })) }, { ...complete, meta: { total_count: 3, page: 1 } }, { ...complete, meta: { next_page: 2 } }, { ...complete, pagination: {} }, { ...complete, data: [{ id: 1 }, { id: 1 }] }, { ...complete, success: false }, { ...complete, meta: undefined }, { ...complete, meta: null }, { ...complete, meta: {} }, { ...complete, meta: { total_count: 2, count: 1 } }, { ...complete, data: [{ id: 1, company_id: 424243 }, { id: 2 }] }]) assert.throws(() => validateTeamResponse(changed, new Headers(), 424242));
  assert.throws(() => validateTeamResponse(complete, new Headers({ link: '<https://other.invalid>; rel=next' }), 424242));
});
test('zero external calls without explicit current authenticated action; close and revocation refuse', async () => {
  let calls = 0;
  const transport = createReadTransport(async () => { calls++; return reply([]); }, async () => 424242);
  await assert.rejects(transport.fetch(source('companies?my=1')));
  for (const req of [request({ method: 'GET' }), request({ user: null }), request({ user: { ...actor, membershipStatus: 'suspended' } }), request({ originalUrl: '/api/health' })]) await transport.run(req, new EventEmitter(), () => assert.rejects(transport.fetch(source('companies?my=1'))));
  await transport.run(request(), new EventEmitter(), () => transport.fetch(source('companies?my=1')));
  assert.equal(calls, 1);
  const response = new EventEmitter();
  await transport.run(request(), response, async () => { response.emit('finish'); await assert.rejects(transport.fetch(source('companies?my=1'))); });
  assert.equal(calls, 1);
});
test('size/call bounds and poisoned incomplete staff do not fall through to native fallback', async () => {
  const transport = createReadTransport(async () => reply(Array.from({ length: 51 }, (_, i) => ({ id: i + 1 }))), async () => 424242);
  await transport.run(request(), new EventEmitter(), async () => {
    await assert.rejects(transport.fetch(source('company/424242/staff')));
    await assert.rejects(transport.fetch(source('staff/424242')));
  });
  assert.equal(transport.counters.calls, 1);
  const large = createReadTransport(async () => new Response('x'.repeat(READ_LIMITS.responseBytes + 1)), async () => 424242);
  await large.run(request(), new EventEmitter(), () => assert.rejects(large.fetch(source('company/424242'))));
  const budget = createReadTransport(async () => reply([]), async () => 424242);
  await budget.run(request(), new EventEmitter(), async () => { for (let n = 0; n < READ_LIMITS.requestCalls; n++) await budget.fetch(source('companies?my=1')); await assert.rejects(budget.fetch(source('companies?my=1'))); });
  assert.equal(budget.counters.calls, READ_LIMITS.requestCalls);
});
test('provider denial text is stripped; redirect:error and bounded signal reach transport', async () => {
  const transport = createReadTransport(async (_url, init) => { assert.equal(init.redirect, 'error'); assert.ok(init.signal instanceof AbortSignal); return new Response('{"meta":{"message":"private-provider-body"}}', { status: 403 }); }, async () => 424242);
  await transport.run(request(), new EventEmitter(), async () => { const result = await transport.fetch(source('company/424242')); assert.equal(result.status, 403); assert.equal(await result.text(), '{}'); });
});
test('actual native adapter setup methods execute through the exact read guard with synthetic wire data', async () => {
  const require = createRequire(import.meta.url);
  const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  require('ts-node').register({ project: path.join(backend, 'tsconfig.scripts.json'), transpileOnly: true });
  const { YclientsCRMAdapter } = require('../src/crm/adapters/yclients-crm.adapter.ts');
  const seen = [];
  const transport = createReadTransport(async (raw, init) => {
    assert.equal(init.redirect, 'error');
    const url = new URL(String(raw)); seen.push(url.pathname);
    if (url.pathname.endsWith('/companies')) return reply([{ id: 424242, title: 'Synthetic company', active: true }]);
    if (url.pathname.endsWith('/company/424242')) return reply({ id: 424242, title: 'Synthetic company', timezone_name: 'Europe/Moscow' });
    if (url.pathname.endsWith('/book_services/424242')) return reply({ services: [{ id: 1, title: 'Synthetic service', price_min: 100, duration: 1800 }] });
    if (url.pathname.endsWith('/service_categories/424242')) return reply([]);
    if (url.pathname.endsWith('/company/424242/staff')) return reply([{ id: 2, company_id: 424242, name: 'Synthetic staff', bookable: true, fired: false }], { meta: { total_count: 1 } });
    assert.fail('unplanned_native_read');
  }, async () => 424242);
  const oldFetch = globalThis.fetch, oldPartner = process.env.YCLIENTS_PARTNER_TOKEN;
  globalThis.fetch = transport.fetch; process.env.YCLIENTS_PARTNER_TOKEN = 'SYNTHETIC_PARTNER_ONLY_123';
  try {
    const adapter = new YclientsCRMAdapter({ tenantId: actor.tenantId, provider: 'yclients', apiToken: 'SYNTHETIC_USER_ONLY_123', settings });
    await transport.run(request(), new EventEmitter(), async () => {
      assert.equal((await adapter.testConnection(actor.tenantId)).ok, true);
      const [services, staff, team, company] = await Promise.all([adapter.getServices(actor.tenantId), adapter.getStaff(actor.tenantId), adapter.getTeamMembers(actor.tenantId), adapter.getCompanyProfile()]);
      assert.equal(services.length, 1); assert.equal(staff.length, 1); assert.equal(team.length, 1); assert.equal(company.id, '424242');
    });
    assert.equal(seen.length, 5);
    assert.equal(transport.counters.calls, 5);
  } finally { globalThis.fetch = oldFetch; if (oldPartner === undefined) delete process.env.YCLIENTS_PARTNER_TOKEN; else process.env.YCLIENTS_PARTNER_TOKEN = oldPartner; }
});
