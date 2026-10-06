import assert from 'node:assert/strict';

export const PROMPTS = Object.freeze({ catalog: 'Покажи услуги для записи' });

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
// Only the finite synthetic catalog prompt and existing booking widget intents are admitted.
export function admitted(request, origin) {
  try {
    const url = new URL(request.url);
    if (url.origin !== localOrigin(origin) || url.username || url.password || url.hash) return false;
    if (request.method === 'GET') {
      if (url.search) return false;
      return /^\/(?:api\/ai\/conversation|index\.html|styles\.css|manifest\.webmanifest|favicon\.ico|icons\/maya-(?:192|512|512-maskable|apple-180)\.png|m\/[A-Za-z0-9]+\/main\.js)?$/.test(url.pathname);
    }
    if (request.method !== 'POST' || url.search) return false;
    if (/^\/api\/auth\/(?:email\/(?:start|verify)|refresh)$/.test(url.pathname)) return true;
    if (/^\/api\/widgets\/(?:resolve|rendered|observe)$/.test(url.pathname)) return true;
    if (url.pathname === '/api/widgets/intent') {
      const body = JSON.parse(request.postData);
      return typeof body.widget_id === 'string' && typeof body.intent_token === 'string' && body.profile_id === 'pwa.default';
    }
    if (url.pathname !== '/api/ai/chat') return false;
    const body = JSON.parse(request.postData);
    return body.surface === 'web' && Array.isArray(body.messages) &&
      body.messages.at(-1)?.role === 'user' && Object.values(PROMPTS).includes(body.messages.at(-1)?.content);
  } catch { return false; }
}

export async function installGuard(page, origin) {
  localOrigin(origin);
  const blocked = [], errors = [];
  const listener = (event) => {
    if (event.sessionId !== page.sessionId || event.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = event.params;
    const allow = admitted(request, origin);
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
