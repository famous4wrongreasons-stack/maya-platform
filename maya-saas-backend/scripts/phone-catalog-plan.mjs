// Prepared deployment shape, not a grant or permission to publish credentials.
// Existing tenant auth and canonical A17 connection/activation remain mandatory.
import { verifyPrivatePlan, ROOT } from './phone-staging-plan.mjs';
import assert from 'node:assert/strict';
export function phoneCatalogPlan(original, composeText, caddyBytes) {
  verifyPrivatePlan(original, composeText, caddyBytes);
  const plan = structuredClone(original);
  plan.contract = 'maya.phone-catalog-deployment/1';
  plan.environment.SELF_SERVE_TRIAL_SIGNUP = 'false';
  plan.environment.YCLIENTS_BASE_URL = 'http://catalog-egress:8080/api/v1';
  plan.privateEnvironmentKeys.push('YCLIENTS_PARTNER_TOKEN');
  plan.compose.services.backend.env_file = [`${ROOT}/private/catalog.env`];
  plan.compose.services.backend.networks = ['private', 'catalog_private'];
  plan.compose.networks.catalog_private = { driver: 'bridge', internal: true };
  plan.compose.services.gateway.ports = ['80:80', '443:443', '443:443/udp'];
  plan.compose.services['catalog-egress'] = {
    image: plan.compose.services.backend.image, pull_policy: 'never',
    entrypoint: ['node', '/app/scripts/phone-catalog-egress.mjs', '/run/maya/catalog-scope.json'],
    restart: 'no', read_only: true, cap_drop: ['ALL'], security_opt: ['no-new-privileges:true'],
    mem_limit: '96m', memswap_limit: '96m', cpus: 0.15, pids_limit: 32,
    networks: ['catalog_private', 'edge'],
    volumes: [
      `${ROOT}/preparation/catalog-20261015/phone-catalog-egress.mjs:/app/scripts/phone-catalog-egress.mjs:ro`,
      `${ROOT}/private/catalog-scope.json:/run/maya/catalog-scope.json:ro`,
    ],
    logging: { driver: 'local', options: { 'max-size': '1m', 'max-file': '2' } },
  };
  plan.syntheticOnly = false;
  plan.providerCredentialsAllowed = true;
  // Preparation does not self-approve publication or certify execution.
  plan.publicAdmission = false;
  plan.executionPrerequisites = ['owner account through ordinary onboarding', 'exact company scope and expiry',
    'operator approval for test DNS/HTTPS and exact credential destination', 'encrypted user token through canonical A17',
    'closed signup proof', 'fresh network and SMM preservation proof', 'exact PWA/native bytes'];
  return plan;
}

// Keep the already authorized loopback-only A17 setup entry while HTTPS is
// published. Both listeners import the exact same canonical route body.
export function phoneCatalogSetupGatewayPlan(original, composeText, caddyBytes) {
  const plan = phoneCatalogPlan(original, composeText, caddyBytes);
  const canonical = caddyBytes.toString('utf8');
  assert.ok(canonical.startsWith('{$STAGING_HOST} {\n'));
  plan.contract = 'maya.phone-catalog-with-private-setup/1';
  plan.caddy = canonical.replace('{$STAGING_HOST} {', '(maya_phone_routes) {') +
    '\n{$STAGING_HOST} {\n  import maya_phone_routes\n}\n' +
    '\nhttp://:8080 {\n  import maya_phone_routes\n}\n';
  plan.compose.services.gateway.ports.push('127.0.0.1:9080:8080');
  plan.compose.services.gateway.volumes[0] =
    `${ROOT}/preparation/catalog-20261015/Caddyfile.public-with-setup:/etc/caddy/Caddyfile:ro`;
  return plan;
}

export function verifyPhoneCatalogSetupGateway(plan, original, composeText, caddyBytes) {
  assert.deepEqual(plan, phoneCatalogSetupGatewayPlan(original, composeText, caddyBytes),
    'catalog_setup_gateway_changed');
}
