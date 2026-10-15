import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { privatePhonePlan } from './phone-staging-plan.mjs';
import { phoneCatalogPlan, phoneCatalogSetupGatewayPlan, verifyPhoneCatalogSetupGateway } from './phone-catalog-plan.mjs';
const compose = fs.readFileSync(new URL('../compose.staging.yml', import.meta.url), 'utf8');
const caddy = fs.readFileSync(new URL('../deploy/staging/Caddyfile', import.meta.url));
test('catalog egress is the only new outbound service; backend and DB remain internal', () => {
  const original = privatePhonePlan('a'.repeat(40), compose, caddy), plan = phoneCatalogPlan(original, compose, caddy);
  assert.equal(plan.environment.SELF_SERVE_TRIAL_SIGNUP, 'false');
  assert.equal(plan.environment.AI_CORE_PROVIDER, 'safe');
  assert.equal(plan.widgetGrant, false);
  assert.equal(plan.productionRelease, false);
  assert.equal(plan.publicAdmission, false);
  for (const name of plan.compose.services.backend.networks) assert.equal(plan.compose.networks[name].internal, true);
  assert.deepEqual(plan.compose.services.postgres, original.compose.services.postgres);
  const egress = plan.compose.services['catalog-egress'];
  assert.equal(egress.ports, undefined); assert.equal(egress.env_file, undefined);
  assert.equal(egress.environment, undefined); assert.equal(egress.restart, 'no');
  assert.ok(egress.volumes.every(v => v.endsWith(':ro')));
  assert.ok(egress.volumes.every(v => !/\.env|docker\.sock/.test(v)));
  assert.equal(plan.compose.services.backend.ports, undefined);
});
test('public HTTPS and private A17 entry share unchanged canonical routes and one payload', () => {
  const original = privatePhonePlan('a'.repeat(40), compose, caddy);
  const plan = phoneCatalogSetupGatewayPlan(original, compose, caddy);
  verifyPhoneCatalogSetupGateway(plan, original, compose, caddy);
  assert.equal(plan.caddy.split('\n\n{$STAGING_HOST}')[0],
    caddy.toString().replace('{$STAGING_HOST} {', '(maya_phone_routes) {').trimEnd());
  assert.equal(plan.caddy.match(/reverse_proxy backend:3000/g).length, 1);
  assert.equal(plan.caddy.match(/root \* \/srv\/maya\n/g).length, 1);
  assert.deepEqual(plan.compose.services.gateway.ports,
    ['80:80', '443:443', '443:443/udp', '127.0.0.1:9080:8080']);
  const base = phoneCatalogPlan(original, compose, caddy);
  for (const service of ['backend', 'postgres', 'catalog-egress'])
    assert.deepEqual(plan.compose.services[service], base.compose.services[service]);
});
for (const [name, edit] of [
  ['public setup port', p => p.compose.services.gateway.ports[3] = '9080:8080'],
  ['alternate public hostname', p => p.compose.services.gateway.environment.STAGING_HOST = 'other.example'],
  ['alternate payload', p => p.compose.services.gateway.volumes[1] = '/legacy:/srv/maya:ro'],
  ['alternate backend', p => p.caddy = p.caddy.replace('backend:3000', 'other:3000')],
]) test(`setup publication refuses ${name}`, () => {
  const original = privatePhonePlan('a'.repeat(40), compose, caddy);
  const plan = phoneCatalogSetupGatewayPlan(original, compose, caddy); edit(plan);
  assert.throws(() => verifyPhoneCatalogSetupGateway(plan, original, compose, caddy));
});
