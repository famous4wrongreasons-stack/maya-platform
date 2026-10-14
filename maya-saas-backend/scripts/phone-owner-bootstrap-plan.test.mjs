import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { privatePhonePlan } from './phone-staging-plan.mjs';
import { ownerBootstrapPlan, verifyOwnerBootstrap } from './phone-owner-bootstrap-plan.mjs';
const compose = fs.readFileSync(new URL('../compose.staging.yml', import.meta.url), 'utf8');
const caddy = fs.readFileSync(new URL('../deploy/staging/Caddyfile', import.meta.url));
const original = privatePhonePlan('a'.repeat(40), compose, caddy);
test('private ordinary owner bootstrap retains closed provider network and auth owners', () => {
  const plan = ownerBootstrapPlan(original, compose, caddy);
  verifyOwnerBootstrap(plan, original, compose, caddy);
  assert.equal(plan.compose.networks.private.internal, true);
  assert.deepEqual(plan.compose.services.gateway.networks, ['private', 'edge']);
  assert.deepEqual(plan.compose.services.gateway.ports, ['127.0.0.1:9080:80']);
  assert.equal(plan.providerCredentialsAllowed, false);
  assert.equal(plan.productionDataAllowed, false);
  assert.equal(plan.environment.SELF_SERVE_TRIAL_SIGNUP, 'true');
  assert.equal(plan.publicAdmission, false);
  assert.deepEqual(plan.environment, original.environment);
  assert.deepEqual(plan.compose.services.backend, original.compose.services.backend);
  assert.deepEqual(plan.compose.services.postgres, original.compose.services.postgres);
});
for (const [name, change] of [
  ['public port', x => x.compose.services.gateway.ports = ['80:80']],
  ['external backend network', x => x.compose.networks.private.internal = false],
  ['credential', x => x.environment.YCLIENTS_PARTNER_TOKEN = 'fake'],
  ['source', x => x.compose.services.backend.image = 'foreign:latest'],
  ['auth substitute', x => x.compose.services.backend.command = ['fake-login']],
  ['wildcard CORS', x => x.environment.CORS_ALLOWED_ORIGINS = '*'],
  ['remote DB', x => x.compose.services.postgres.ports = ['5432:5432']],
]) test('refuse bootstrap ' + name, () => {
  const plan = ownerBootstrapPlan(original, compose, caddy); change(plan);
  assert.throws(() => verifyOwnerBootstrap(plan, original, compose, caddy));
});
