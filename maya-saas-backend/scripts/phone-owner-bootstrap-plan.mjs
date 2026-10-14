// Exact private SSH-only onboarding phase. No public registration, keys, CRM
// admission, schema change, role assignment or copy of the owner's retained DB.
import assert from 'node:assert/strict';
import { verifyPrivatePlan, ROOT } from './phone-staging-plan.mjs';
export const BOOTSTRAP_ORIGIN = 'http://127.0.0.1:56152';
export function ownerBootstrapPlan(privatePlan, composeText, caddyBytes) {
  verifyPrivatePlan(privatePlan, composeText, caddyBytes);
  const plan = structuredClone(privatePlan);
  plan.contract = 'maya.phone-owner-bootstrap/1';
  // Production CORS stays HTTPS/native only. This private browser uses relative
  // same-origin API requests through the SSH tunnel, with its actual Origin;
  // no permissive CORS setting or rewritten/spoofed production Origin.
  // The fixed compiled entrypoint is retained. Startup migration replay is not
  // introduced here; the already-tested synthetic schema stays as it is.
  // Retain the existing gateway-only edge interface: Docker does not publish
  // ports for a container attached solely to an internal network. The host
  // listener is still loopback-only; backend/Postgres have no edge interface.
  plan.compose.services.gateway.ports = ['127.0.0.1:9080:80'];
  plan.compose.services.gateway.environment = {};
  plan.compose.services.gateway.volumes[0] = `${ROOT}/preparation/Caddyfile.owner-bootstrap:/etc/caddy/Caddyfile:ro`;
  const caddyText = caddyBytes.toString();
  assert.ok(caddyText.startsWith('{$STAGING_HOST} {\n'), 'canonical_gateway_owner_changed');
  plan.caddy = caddyText.replace('{$STAGING_HOST} {\n', 'http://:80 {\n');
  plan.syntheticOnly = false; // Owner may create a normal staging tenant/account.
  plan.publicAdmission = false;
  plan.sshForward = '127.0.0.1:56152:127.0.0.1:9080';
  return plan;
}
export function verifyOwnerBootstrap(plan, original, compose, caddy) {
  assert.deepEqual(plan, ownerBootstrapPlan(original, compose, caddy), 'owner_bootstrap_changed');
}
