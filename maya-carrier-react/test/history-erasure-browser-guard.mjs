import { localOrigin } from './personal-owner-browser-guard.mjs';
export { localOrigin };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function admitted(request, origin, conversationId) {
  try {
    const url = new URL(request.url);
    if (url.origin !== localOrigin(origin) || url.username || url.password || url.hash || url.search) return false;
    if (request.method === 'GET') return /^\/(?:api\/ai\/conversation|index\.html|styles\.css|manifest\.webmanifest|favicon\.ico|icons\/maya-(?:192|512|512-maskable|apple-180)\.png|m\/[A-Za-z0-9]+\/main\.js)?$/.test(url.pathname);
    if (request.method !== 'POST') return false;
    if (/^\/api\/auth\/(?:email\/(?:start|verify)|refresh|logout)$/.test(url.pathname)) return true;
    if (url.pathname === '/api/widgets/resolve') {
      const body = JSON.parse(request.postData);
      return body && Object.keys(body).join(',') === 'thread_page' && body.thread_page &&
        Object.keys(body.thread_page).join(',') === 'limit' && body.thread_page.limit === 20;
    }
    if (typeof conversationId !== 'string' || !uuid.test(conversationId) || url.pathname !== `/api/privacy/conversations/${conversationId}/erasure`) return false;
    const body = JSON.parse(request.postData);
    return body && typeof body === 'object' && Object.keys(body).join(',') === 'requestId' && typeof body.requestId === 'string' && uuid.test(body.requestId);
  } catch { return false; }
}
export async function installGuard(page, origin, conversationId) {
  localOrigin(origin);
  const blocked = [], errors = [];
  const listener = (event) => {
    if (event.sessionId !== page.sessionId || event.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = event.params;
    const allow = admitted(request, origin, conversationId);
    if (!allow) blocked.push({ method: request.method, path: new URL(request.url).pathname });
    void page.send(allow ? 'Fetch.continueRequest' : 'Fetch.failRequest', { requestId, ...(allow ? {} : { errorReason: 'BlockedByClient' }) }).catch(() => errors.push('request_interception_failed'));
  };
  page.browser.listeners.add(listener);
  await page.send('Network.setBypassServiceWorker', { bypass: true });
  await page.send('Network.setBlockedURLs', { urls: ['ws://*', 'wss://*'] });
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  return { blocked, errors, detach: () => page.browser.listeners.delete(listener) };
}
