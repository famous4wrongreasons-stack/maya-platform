import assert from 'node:assert/strict';

export const OWNER_REQUEST = 'Проверь окна после отмен';
export const COMPOUND_PROMPTS = Object.freeze({
  compound: 'Дай общий обзор бизнеса, проверь окна после отмен и предложи следующий шаг',
  compound_scoped: 'Дай общий обзор бизнеса за сегодня, проверь окна после отмен и предложи следующий шаг',
  compound_continue: 'Да, такой ограниченный обзор',
});

export function localOrigin(raw) {
  const url = new URL(raw);
  assert.equal(url.protocol, 'http:');
  assert.equal(url.hostname, '127.0.0.1');
  assert.ok(url.port && !['5432', '55611'].includes(url.port));
  assert.equal(url.username + url.password + url.search + url.hash, '');
  assert.equal(url.pathname, '/');
  return url.origin;
}

// Request-stage admission, never response fulfillment. There is no UI/API fixture.
// The exact owner utterance is the only business request this acceptance may send.
export function admitted(request, origin, mode = 'occupancy') {
  if (!['occupancy', 'compound'].includes(mode)) return false;
  try {
    const url = new URL(request.url);
    if (url.origin !== localOrigin(origin) || url.username || url.password || url.hash) return false;
    if (request.method === 'GET') {
      if (url.search) return false;
      return /^\/(?:api\/ai\/conversation|index\.html|styles\.css|manifest\.webmanifest|favicon\.ico|icons\/maya-(?:192|512|512-maskable|apple-180)\.png|m\/[A-Za-z0-9]+\/main\.js)?$/.test(url.pathname);
    }
    if (request.method !== 'POST' || url.search) return false;
    if (/^\/api\/auth\/(?:email\/(?:start|verify)|refresh)$/.test(url.pathname)) return true;
    if (url.pathname === '/api/widgets/resolve') {
      const body = JSON.parse(request.postData), page = body?.thread_page;
      return body && Object.keys(body).join(',') === 'thread_page' && page &&
        Object.keys(page).every((key) => ['before', 'limit'].includes(key)) &&
        Number.isInteger(page.limit) && page.limit >= 1 && page.limit <= 50 &&
        (page.before === undefined || (typeof page.before === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(page.before)));
    }
    if (url.pathname !== '/api/ai/chat') return false;
    const body = JSON.parse(request.postData);
    return body.surface === 'web' && Array.isArray(body.messages) &&
      body.messages.at(-1)?.role === 'user' && typeof body.messages.at(-1)?.content === 'string' &&
      (mode === 'compound' ? Object.values(COMPOUND_PROMPTS).includes(body.messages.at(-1).content) : body.messages.at(-1).content === OWNER_REQUEST);
  } catch { return false; }
}

export async function installGuard(page, origin, mode = 'occupancy') {
  assert.ok(['occupancy', 'compound'].includes(mode), 'finite guard mode required');
  localOrigin(origin);
  const blocked = [], errors = [];
  const listener = (event) => {
    if (event.sessionId !== page.sessionId || event.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = event.params;
    const allow = admitted(request, origin, mode);
    // Never retain query, body, tokens, email or OTP in evidence.
    if (!allow) blocked.push({ method: request.method, path: new URL(request.url).pathname });
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
