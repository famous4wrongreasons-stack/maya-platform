import assert from 'node:assert/strict';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, required, optional = []) => object(value) && required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => [...required, ...optional].includes(key));
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const version = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function localOrigin(raw) {
  const url = new URL(raw);
  assert.equal(url.protocol, 'http:'); assert.equal(url.hostname, '127.0.0.1');
  assert.ok(url.port && !['5432', '55611'].includes(url.port));
  assert.equal(url.username + url.password + url.search + url.hash, ''); assert.equal(url.pathname, '/');
  return url.origin;
}
export function admitted(request, origin, scope) {
  try {
    const url = new URL(request.url);
    if (url.origin !== localOrigin(origin) || url.username || url.password || url.hash) return false;
    if (request.method === 'GET') {
      if (url.pathname === '/') {
        const names = [...url.searchParams.keys()];
        return new Set(names).size === names.length && url.searchParams.get('local_crm_setup') === '1' &&
          (names.length === 1 || (names.length === 3 && names.includes('crm_operation') && names.includes('crm_request') &&
            ['install', 'activate'].includes(url.searchParams.get('crm_operation')) && uuid(url.searchParams.get('crm_request'))));
      }
      if (url.pathname === '/api/integrations/crm/operation') {
        return [...url.searchParams.keys()].sort().join(',') === 'operation,requestId' &&
          ['install', 'activate'].includes(url.searchParams.get('operation')) && uuid(url.searchParams.get('requestId'));
      }
      return !url.search && /^\/(?:api\/(?:branches|integrations\/crm)|index\.html|styles\.css|manifest\.webmanifest|favicon\.ico|icons\/maya-(?:192|512|512-maskable|apple-180)\.png|m\/[A-Za-z0-9]+\/main\.js)$/.test(url.pathname);
    }
    if (request.method !== 'POST' || url.search) return false;
    const body = JSON.parse(request.postData);
    if (url.pathname === '/api/auth/login') return keys(body, ['tenantSlug', 'email', 'password']) &&
      typeof scope.tenantSlug === 'string' && /^widgets-live-[a-f0-9]{32}$/.test(scope.tenantSlug) && body.tenantSlug === scope.tenantSlug &&
      typeof scope.email === 'string' && /^wl-[a-f0-9]{8}@widgets-live\.test$/.test(scope.email) && body.email === scope.email &&
      typeof scope.password === 'string' && scope.password.startsWith('wl-') && uuid(scope.password.slice(3)) && body.password === scope.password;
    if (url.pathname === '/api/auth/refresh') return keys(body, ['refreshToken']) && typeof body.refreshToken === 'string' && body.refreshToken.length > 0 && body.refreshToken.length <= 8192;
    const key = Object.entries(request.headers ?? {}).find(([name]) => name.toLowerCase() === 'idempotency-key')?.[1];
    if (!uuid(key)) return false;
    if (url.pathname === '/api/integrations/crm/activate') return (!scope.apiToken || scope.apiToken === 'SYNTHETIC_A17_V1') && keys(body, ['expectedVersion']) && version(body.expectedVersion);
    if (url.pathname !== '/api/integrations/crm/connect' || !keys(body, ['provider', 'apiToken', 'expectedVersion', 'settingsJson'])) return false;
    const token = scope.apiToken ?? 'SYNTHETIC_A17_V1';
    return ['SYNTHETIC_A17_V1', 'SYNTHETIC_A17_DENIED', 'SYNTHETIC_A17_COMPANY_MISSING', 'SYNTHETIC_A17_COMPANY_BAD_TITLE'].includes(token) &&
      body.provider === 'yclients' && body.apiToken === token && body.expectedVersion === null &&
      keys(body.settingsJson, ['companyId', 'branchBinding']) && body.settingsJson.companyId === scope.companyId &&
      keys(body.settingsJson.branchBinding, ['contract', 'companyId', 'branchId']) &&
      body.settingsJson.branchBinding.contract === 'maya.crm-branch-binding/1' &&
      body.settingsJson.branchBinding.companyId === scope.companyId && body.settingsJson.branchBinding.branchId === scope.branchId;
  } catch { return false; }
}
export async function installGuard(page, origin, scope, options = {}) {
  localOrigin(origin);
  assert.ok(object(options) && Object.keys(options).every(key => key === 'lossInjection'));
  assert.ok(options.lossInjection === undefined || typeof options.lossInjection === 'boolean');
  const lossInjection = options.lossInjection !== false;
  const evidence = { blocked: [], errors: [], droppedCommittedResponses: 0, droppedUnregisteredRequests: 0 };
  let firstInstallKey;
  const listener = event => {
    if (event.sessionId !== page.sessionId || event.method !== 'Fetch.requestPaused') return;
    const { requestId, request, responseStatusCode, responseErrorReason } = event.params;
    const isResponse = responseStatusCode !== undefined || responseErrorReason !== undefined;
    let method = 'Fetch.continueRequest', params = { requestId };
    if (!admitted(request, origin, scope)) {
      evidence.blocked.push({ method: request.method, path: new URL(request.url).pathname });
      method = 'Fetch.failRequest'; params = { requestId, errorReason: 'BlockedByClient' };
    } else if (lossInjection && !isResponse && new URL(request.url).pathname === '/api/integrations/crm/connect') {
      const key = Object.entries(request.headers ?? {}).find(([name]) => name.toLowerCase() === 'idempotency-key')?.[1];
      if (evidence.droppedUnregisteredRequests === 0) {
        firstInstallKey = key; evidence.droppedUnregisteredRequests++;
        method = 'Fetch.failRequest'; params = { requestId, errorReason: 'ConnectionClosed' };
      } else if (key !== firstInstallKey) {
        evidence.blocked.push({ method: request.method, path: '/api/integrations/crm/connect', reason: 'changed_operation_key' });
        method = 'Fetch.failRequest'; params = { requestId, errorReason: 'BlockedByClient' };
      }
    } else if (lossInjection && isResponse && new URL(request.url).pathname === '/api/integrations/crm/activate' && responseStatusCode === 201 && evidence.droppedCommittedResponses === 0) {
      // Actual upstream response exists. The parent independently checks the
      // canonical DB commit before permitting reload; no body is substituted.
      evidence.droppedCommittedResponses++;
      method = 'Fetch.failRequest'; params = { requestId, errorReason: 'ConnectionClosed' };
    }
    void page.send(method, params).catch(() => evidence.errors.push('request_interception_failed'));
  };
  page.browser.listeners.add(listener);
  await page.send('Network.setBypassServiceWorker', { bypass: true });
  await page.send('Network.setBlockedURLs', { urls: ['ws://*', 'wss://*'] });
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }, { urlPattern: '*', requestStage: 'Response' }] });
  // The caller closes that page before moving on; no disabled interception
  // interval is introduced in a still-active page. Not part of public JSON.
  Object.defineProperty(evidence, 'dispose', { value: () => page.browser.listeners.delete(listener), enumerable: false });
  return evidence;
}
