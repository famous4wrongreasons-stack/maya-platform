import assert from 'node:assert/strict';

export const PROMPTS = Object.freeze({
  overview: 'Объясни последний опубликованный финансовый отчёт и проверь оценки давности визитов гостей',
  scoped: 'Объясни финансовый отчёт за 2026-10-01 по филиалу «Синтетический Север» и проверь оценки давности визитов гостей',
  corrected: 'Нет, за 2026-10-02 по филиалу «Синтетический Юг»',
  accept: 'Да, такой ограниченный обзор без дополнительных условий',
});
export const CLARIFICATION = 'Могу объединить последний опубликованный финансовый отчёт по всему бизнесу и до трёх оценок давности визитов по правилам бизнеса. Это не список клиентов и не обзор за отдельный период или филиал. Подойдёт такой ограниченный обзор без дополнительных условий?';

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, required, optional = []) => record(value) &&
  required.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every((key) => [...required, ...optional].includes(key));
const text = (value, max = 8192) => typeof value === 'string' && value.length > 0 && value.length <= max;
const uuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const staticPath = /^\/(?:index\.html|styles\.css|manifest\.webmanifest|favicon\.ico|icons\/maya-(?:192|512|512-maskable|apple-180)\.png|m\/[A-Za-z0-9]{1,128}\/main\.js)?$/;
const publicApiPaths = new Set([
  '/api/auth/email/start', '/api/auth/email/verify', '/api/auth/refresh',
  '/api/ai/conversation', '/api/ai/chat', '/api/widgets/resolve',
]);

export function localOrigin(raw) {
  const url = new URL(raw);
  assert.equal(url.protocol, 'http:');
  assert.equal(url.hostname, '127.0.0.1');
  assert.ok(url.port && !['5432', '55611'].includes(url.port));
  assert.equal(url.username + url.password + url.search + url.hash, '');
  assert.equal(url.pathname, '/');
  return url.origin;
}

// Public evidence contains no URL query, body, email, OTP, token or arbitrary path.
export function publicRequest(request) {
  let route = '[unlisted-path]';
  try {
    const pathname = new URL(request.url).pathname;
    if (publicApiPaths.has(pathname) || staticPath.test(pathname)) route = pathname;
  } catch { /* A malformed URL remains a sanitized rejection. */ }
  return {
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'].includes(request.method) ? request.method : '[invalid-method]',
    path: route,
  };
}

// Admission only. Every permitted request reaches the actual local backend.
// The finite read proof permits no widget intent, CRM mutation or direct tool API.
export function admitted(request, origin, scope) {
  try {
    const url = new URL(request.url);
    if (url.origin !== localOrigin(origin) || url.username || url.password || url.hash || url.search) return false;
    if (request.method === 'GET') return staticPath.test(url.pathname) || url.pathname === '/api/ai/conversation';
    if (request.method !== 'POST' || !text(request.postData, 100_000)) return false;
    const body = JSON.parse(request.postData);
    if (url.pathname === '/api/auth/email/start') return keys(body, ['email']) && scope.emails.includes(body.email);
    if (url.pathname === '/api/auth/email/verify') return keys(body, ['email', 'code']) &&
      scope.emails.includes(body.email) && typeof body.code === 'string' && /^\d{4,8}$/.test(body.code);
    if (url.pathname === '/api/auth/refresh') return keys(body, ['refreshToken']) && text(body.refreshToken);
    if (url.pathname === '/api/widgets/resolve') {
      if (!keys(body, ['thread_page']) || !keys(body.thread_page, ['limit'], ['before'])) return false;
      const page = body.thread_page;
      return Number.isInteger(page.limit) && page.limit >= 1 && page.limit <= 50 &&
        (page.before === undefined || uuid(page.before));
    }
    if (url.pathname !== '/api/ai/chat' || !keys(body, ['surface', 'requestId', 'messages'], ['conversationId']) ||
      body.surface !== 'web' || !uuid(body.requestId) ||
      (body.conversationId !== undefined && !uuid(body.conversationId))) return false;
    return Array.isArray(body.messages) && body.messages.length >= 1 && body.messages.length <= 40 &&
      body.messages.every((message) => keys(message, ['role', 'content']) &&
        ['user', 'assistant'].includes(message.role) && text(message.content, 2000) &&
        (message.role !== 'user' || Object.values(PROMPTS).includes(message.content))) &&
      body.messages.at(-1).role === 'user';
  } catch { return false; }
}

export async function installGuard(page, origin, scope) {
  localOrigin(origin);
  assert.ok(Array.isArray(scope.emails) && scope.emails.length === 1 && text(scope.emails[0], 254));
  const blocked = [], errors = [];
  const listener = (event) => {
    if (event.sessionId !== page.sessionId || event.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = event.params;
    const allow = admitted(request, origin, scope);
    if (!allow) blocked.push(publicRequest(request));
    void page.send(allow ? 'Fetch.continueRequest' : 'Fetch.failRequest', {
      requestId, ...(allow ? {} : { errorReason: 'BlockedByClient' }),
    }).catch(() => errors.push('request_interception_failed'));
  };
  page.browser.listeners.add(listener);
  await page.send('Network.setBypassServiceWorker', { bypass: true });
  await page.send('Network.setBlockedURLs', { urls: ['ws://*', 'wss://*'] });
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  return { blocked, errors };
}
