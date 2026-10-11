// Additional local restrictions, never product identity or Client authority.
import assert from 'node:assert/strict';
import { assertOwnerChatScope } from './local-owner-scope.mjs';
import { ingressDecision } from './local-onboarding-profile.mjs';

export const OWNER_TELEGRAM_PROFILE = 'owner_telegram_personal_read_v1';
export const OWNER_TELEGRAM_BATCH_PROFILE = 'owner_telegram_saved_login_batch_v2';
export const OWNER_TELEGRAM_ADMISSION = 'explicit_owner_telegram_and_initial_client_read';
export const TELEGRAM_LIMITS = Object.freeze({ sessionMs: 600000, operationMs: 120000,
  fetchMs: 20000, responseBytes: 2 * 1024 * 1024, calls: 128, registryPages: 32, starts: 4 });
const BATCH_LIMITS = Object.freeze({ ...TELEGRAM_LIMITS, sessionMs: 1800000, starts: 3, attempts: 3 });
export function ownerTelegramLimits(contract = OWNER_TELEGRAM_PROFILE) {
  assert.ok([OWNER_TELEGRAM_PROFILE, OWNER_TELEGRAM_BATCH_PROFILE].includes(contract), 'local_telegram_contract');
  return contract === OWNER_TELEGRAM_BATCH_PROFILE ? BATCH_LIMITS : TELEGRAM_LIMITS;
}
export const exactObject = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const text = (v, n) => typeof v === 'string' && v.length > 0 && v.length <= n && !/[\r\n\0]/.test(v);
export function assertTelegramOrigin(value) {
  const u = new URL(value);
  assert.ok(u.origin === value && u.protocol === 'http:' && u.hostname === '127.0.0.1'
    && Number(u.port) > 1024 && Number(u.port) <= 65535 && !u.username && !u.password, 'local_telegram_origin');
}
export function ownerTelegramIngress(method, route, headers, body, origin, scope, contract = OWNER_TELEGRAM_PROFILE) {
  assertOwnerChatScope(scope); assertTelegramOrigin(origin);
  ownerTelegramLimits(contract);
  if (contract === OWNER_TELEGRAM_BATCH_PROFILE && route.startsWith('/api/auth/oauth/telegram/link/')) return 'local_telegram_route_refused';
  if (headers.origin && headers.origin !== origin) return 'local_telegram_origin_refused';
  if (method === 'GET') {
    if (['/api/health', '/api/health/ready', '/api/branches', '/api/integrations/crm',
      '/api/ai/conversation', '/api/auth/identities', '/api/client-channel/profile',
      '/api/client-channel/appointments', '/api/client-channel/status'].includes(route)) return null;
    // No partial/search-wide directory in this finite saved-tenant acceptance.
    if (route === '/api/mobile/pwa/search?q=' + encodeURIComponent(scope.tenantSlug)) return null;
    return 'local_telegram_route_refused';
  }
  if (method !== 'POST') return 'local_telegram_route_refused';
  if (route === '/api/auth/login') return body?.tenantSlug === scope.tenantSlug
    ? ingressDecision(method, route, headers.origin, origin, body) : 'local_telegram_tenant_refused';
  if (route === '/api/auth/logout' && exactObject(body, [])) return null;
  if (['/api/auth/oauth/telegram/start', '/api/auth/oauth/telegram/link/start'].includes(route)) {
    const login = route.endsWith('/telegram/start');
    if (exactObject(body, login ? ['tenantSlug', 'platform', 'redirectUri'] : ['platform', 'redirectUri'])
      && (!login || body.tenantSlug === scope.tenantSlug) && body.platform === 'web'
      && body.redirectUri === origin + '/oauth-callback.html') return null;
  }
  if (['/api/auth/oauth/telegram/complete', '/api/auth/oauth/telegram/link/complete'].includes(route)
    && exactObject(body, ['state', 'code']) && /^te_[A-Za-z0-9_-]{8,128}$/.test(body.state)
    && text(body.code, 2048)) return null;
  // Consent/import/settings, refresh, model, widgets and all business writes
  // need their own explicit scope; a login never triggers them here.
  return 'local_telegram_route_refused';
}

export function telegramProviderRoute(raw, init, operation, clientId, companyId) {
  if (!(typeof raw === 'string' || raw instanceof URL)) return null;
  let u; try { u = new URL(String(raw)); } catch { return null; }
  if (u.username || u.password || u.hash || u.search || /[%\\]/.test(String(raw))) return null;
  if (!operation || !['link', 'login'].includes(operation.purpose)) return null;
  if (u.origin === 'https://oauth.telegram.org') {
    if (u.pathname === '/.well-known/jwks.json' && (init?.method ?? 'GET') === 'GET' && init?.body == null) return 'telegram_jwks';
    if (u.pathname !== '/token' || init?.method !== 'POST' || !(init.body instanceof URLSearchParams)) return null;
    const b = init.body;
    if ([...b.keys()].sort().join(',') !== 'client_id,code,code_verifier,grant_type,redirect_uri'
      || b.get('grant_type') !== 'authorization_code' || b.get('client_id') !== clientId
      || b.get('redirect_uri') !== operation.redirectUri || b.get('code') !== operation.code
      || b.get('code_verifier') !== operation.verifier) return null;
    return 'telegram_token';
  }
  if (operation.purpose !== 'login' || !operation.verifiedOwner || u.origin !== 'https://api.yclients.com'
    || u.pathname !== `/api/v1/company/${companyId}/clients/search` || init?.method !== 'POST'
    || typeof init.body !== 'string') return null;
  let body; try { body = JSON.parse(init.body); } catch { return null; }
  if (!exactObject(body, ['fields', 'filters', 'page', 'page_size'])
    || JSON.stringify(body.fields) !== JSON.stringify(['id', 'name', 'phone', 'visits_count', 'sold_amount', 'last_visit_date'])
    || !Array.isArray(body.filters) || body.filters.length || body.page_size !== 200
    || !Number.isSafeInteger(body.page) || body.page < 1 || body.page > TELEGRAM_LIMITS.registryPages) return null;
  return 'client_registry';
}
