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
            url.searchParams.get('crm_operation') === 'activate' && uuid(url.searchParams.get('crm_request'))));
      }
      if (url.pathname === '/api/integrations/crm/operation') {
        return [...url.searchParams.keys()].sort().join(',') === 'operation,requestId' &&
          url.searchParams.get('operation') === 'activate' && uuid(url.searchParams.get('requestId'));
      }
      return !url.search && /^\/(?:api\/(?:ai\/conversation|branches|integrations\/crm)|index\.html|styles\.css|manifest\.webmanifest|favicon\.ico|icons\/maya-(?:192|512|512-maskable|apple-180)\.png|m\/[A-Za-z0-9]+\/main\.js)$/.test(url.pathname);
    }
    if (request.method !== 'POST' || url.search) return false;
    const body = JSON.parse(request.postData);
    if (url.pathname === '/api/auth/email/start') return keys(body, ['email']) && body.email === scope.email;
    if (url.pathname === '/api/auth/email/verify') return keys(body, ['email', 'code']) && body.email === scope.email && typeof body.code === 'string' && /^\d{4,8}$/.test(body.code);
    if (url.pathname === '/api/auth/refresh') return keys(body, ['refreshToken']) && typeof body.refreshToken === 'string' && body.refreshToken.length > 0 && body.refreshToken.length <= 8192;
    if (url.pathname === '/api/widgets/resolve') return keys(body, ['thread_page']) && keys(body.thread_page, ['limit'], ['before']) && Number.isInteger(body.thread_page.limit) && body.thread_page.limit >= 1 && body.thread_page.limit <= 50 && (body.thread_page.before === undefined || uuid(body.thread_page.before));
    const key = Object.entries(request.headers ?? {}).find(([name]) => name.toLowerCase() === 'idempotency-key')?.[1];
    if (!uuid(key)) return false;
    if (url.pathname === '/api/integrations/crm/activate') return keys(body, ['expectedVersion']) && version(body.expectedVersion);
    if (url.pathname !== '/api/integrations/crm/connect' || !keys(body, ['provider', 'apiToken', 'expectedVersion', 'settingsJson'])) return false;
    return body.provider === 'yclients' && body.apiToken === 'SYNTHETIC_A17_V1' && body.expectedVersion === null &&
      keys(body.settingsJson, ['companyId', 'branchBinding']) && body.settingsJson.companyId === scope.companyId &&
      keys(body.settingsJson.branchBinding, ['contract', 'companyId', 'branchId']) &&
      body.settingsJson.branchBinding.contract === 'maya.crm-branch-binding/1' &&
      body.settingsJson.branchBinding.companyId === scope.companyId && body.settingsJson.branchBinding.branchId === scope.branchId;
  } catch { return false; }
}
export async function installGuard(page, origin, scope) {
  localOrigin(origin);
  const evidence = { blocked: [], errors: [], droppedCommittedResponses: 0 };
  const listener = event => {
    if (event.sessionId !== page.sessionId || event.method !== 'Fetch.requestPaused') return;
    const { requestId, request, responseStatusCode, responseErrorReason } = event.params;
    const isResponse = responseStatusCode !== undefined || responseErrorReason !== undefined;
    let method = 'Fetch.continueRequest', params = { requestId };
    if (!admitted(request, origin, scope)) {
      evidence.blocked.push({ method: request.method, path: new URL(request.url).pathname });
      method = 'Fetch.failRequest'; params = { requestId, errorReason: 'BlockedByClient' };
    } else if (isResponse && new URL(request.url).pathname === '/api/integrations/crm/activate' && responseStatusCode === 201 && evidence.droppedCommittedResponses === 0) {
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
  return evidence;
}
