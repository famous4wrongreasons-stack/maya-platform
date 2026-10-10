// A separate local native-provider profile. Stage 0 and synthetic profiles remain closed.
import assert from 'node:assert/strict';
import { profileEnvironment, assertProfileEnvironment, ingressDecision } from './local-onboarding-profile.mjs';

export const PROFILE = 'read_setup_v1';
export const tokenShape = value => typeof value === 'string' && value.length >= 16 && value.length <= 4096 && /^[\x21-\x2b\x2d-\x7e]+$/.test(value);
export function realReadEnvironment(system, options, partnerToken, allowUserAuth = false) {
  const env = profileEnvironment(system, options);
  delete env.MAYA_LOCAL_ONBOARDING_PROFILE;
  env.MAYA_LOCAL_YCLIENTS_READ_PROFILE = PROFILE;
  if (partnerToken !== undefined) env.YCLIENTS_PARTNER_TOKEN = partnerToken;
  assert.equal(typeof allowUserAuth, 'boolean');
  if (allowUserAuth) env.MAYA_LOCAL_YCLIENTS_USER_AUTH = 'owner_login_v1';
  assertRealReadEnvironment(env);
  return env;
}
export function assertRealReadEnvironment(env, requirePartner = false) {
  assert.equal(env.MAYA_LOCAL_YCLIENTS_READ_PROFILE, PROFILE);
  assert.equal(Object.hasOwn(env, 'MAYA_LOCAL_ONBOARDING_PROFILE'), false);
  const ordinary = { ...env, MAYA_LOCAL_ONBOARDING_PROFILE: 'stage0' };
  delete ordinary.MAYA_LOCAL_YCLIENTS_READ_PROFILE;
  delete ordinary.YCLIENTS_PARTNER_TOKEN;
  if (Object.hasOwn(env, 'MAYA_LOCAL_YCLIENTS_USER_AUTH')) assert.equal(env.MAYA_LOCAL_YCLIENTS_USER_AUTH, 'owner_login_v1');
  delete ordinary.MAYA_LOCAL_YCLIENTS_USER_AUTH;
  assertProfileEnvironment(ordinary);
  if (requirePartner || Object.hasOwn(env, 'YCLIENTS_PARTNER_TOKEN'))
    assert.ok(tokenShape(env.YCLIENTS_PARTNER_TOKEN), 'Explicit private partner input required');
}
const exact = (value, names) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === names.length && names.every(key => Object.hasOwn(value, key));
const version = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const companyId = value => (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) || (typeof value === 'string' && /^[1-9][0-9]{0,14}$/.test(value) && Number.isSafeInteger(Number(value)));
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
export const loginShape = value => exact(value, ['login', 'password']) && typeof value.login === 'string' && value.login.trim().length > 0 && value.login.length <= 254 && !/[\r\n\0]/.test(value.login) && typeof value.password === 'string' && value.password.length > 0 && value.password.length <= 1024 && !/\0/.test(value.password);
export function realReadIngress(method, rawPath, headers, body, origin, allowUserAuth = false) {
  const ordinary = ingressDecision(method, rawPath, headers.origin, origin, body);
  if (ordinary === null) return null;
  if (headers.origin && headers.origin !== origin) return 'local_onboarding_origin_refused';
  if (method === 'GET' && typeof rawPath === 'string') {
    const match = /^\/api\/integrations\/crm\/operation\?operation=(install|activate)&requestId=([a-f0-9-]+)$/i.exec(rawPath);
    if (match && uuid(match[2])) return null;
  }
  if (method === 'POST' && uuid(headers['idempotency-key'])) {
    if (rawPath === '/api/integrations/crm/activate' && exact(body, ['expectedVersion']) && version(body.expectedVersion)) return null;
    if (rawPath === '/api/integrations/crm/connect' && ((exact(body, ['provider', 'apiToken', 'settingsJson', 'expectedVersion']) && tokenShape(body.apiToken)) || (allowUserAuth === true && exact(body, ['provider', 'yclientsLogin', 'settingsJson', 'expectedVersion']) && loginShape(body.yclientsLogin))) && body.provider === 'yclients' && (body.expectedVersion === null || version(body.expectedVersion))) {
      const settings = body.settingsJson, binding = settings?.branchBinding;
      if (exact(settings, ['companyId', 'branchBinding']) && companyId(settings.companyId) && exact(binding, ['contract', 'companyId', 'branchId']) && binding.contract === 'maya.crm-branch-binding/1' && companyId(binding.companyId) && String(binding.companyId) === String(settings.companyId) && typeof binding.branchId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(binding.branchId)) return null;
    }
  }
  return 'local_yclients_read_route_disabled';
}
