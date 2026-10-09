// Finite read/proposal-only UI proof. The current carrier still owns every body.
import { admitted as ordinaryAdmitted, localOrigin } from './ordinary-booking-selector-browser-guard.mjs';
export { localOrigin };

export function createCoreBrowserGuard(origin, email) {
  localOrigin(origin);
  let expected = null;
  let sent = false;
  return {
    expectTurn(messages, conversationId) {
      if (expected && !sent) throw new Error('core_ui_pending_turn');
      expected = { messages: structuredClone(messages), conversationId };
      sent = false;
    },
    admit(request) {
      try {
        const url = new URL(request.url);
        // No intent, COMMIT, upload, registry, business write or arbitrary API.
        if (url.pathname === '/api/widgets/intent') return false;
        const scope = { emails: [email], prompts: expected?.messages.filter(m => m.role === 'user').map(m => m.content) ?? [] };
        if (!ordinaryAdmitted(request, origin, scope)) return false;
        if (url.pathname !== '/api/ai/chat') return true;
        const body = JSON.parse(request.postData);
        if (!expected || sent || JSON.stringify(body.messages) !== JSON.stringify(expected.messages) || body.conversationId !== expected.conversationId) return false;
        sent = true; // A lost response cannot authorize a second POST.
        return true;
      } catch { return false; }
    },
  };
}

export async function installCoreBrowserGuard(page, origin, email) {
  const guard = createCoreBrowserGuard(origin, email);
  const blocked = [], errors = [];
  const listener = event => {
    if (event.sessionId !== page.sessionId || event.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = event.params;
    const allow = guard.admit(request);
    if (!allow) blocked.push({ method: request.method, path: new URL(request.url).pathname });
    void page.send(allow ? 'Fetch.continueRequest' : 'Fetch.failRequest', {
      requestId, ...(allow ? {} : { errorReason: 'BlockedByClient' }),
    }).catch(() => errors.push('request_interception_failed'));
  };
  page.browser.listeners.add(listener);
  await page.send('Network.setBypassServiceWorker', { bypass: true });
  await page.send('Network.setBlockedURLs', { urls: ['ws://*', 'wss://*'] });
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  return { ...guard, blocked, errors };
}
