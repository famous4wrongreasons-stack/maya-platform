import assert from 'node:assert/strict';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 8192) => typeof value === 'string' && value.length > 0 && value.length <= max;
const keys = (value, required, optional = []) => object(value) && required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => [...required, ...optional].includes(key));
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const instant = value => text(value, 64) && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function localOrigin(raw) {
  const url = new URL(raw);
  assert.equal(url.protocol, 'http:'); assert.equal(url.hostname, '127.0.0.1');
  assert.ok(url.port && !['5432', '55611'].includes(url.port));
  assert.equal(url.username + url.password + url.search + url.hash, ''); assert.equal(url.pathname, '/');
  return url.origin;
}

// This bounds the owned acceptance only. Every request still reaches the real
// backend; no response, authority, credential or session is fabricated here.
export function admitted(request, origin, scope) {
  try {
    const url = new URL(request.url);
    if (url.origin !== localOrigin(origin) || url.username || url.password || url.hash) return false;
    if (request.method === 'GET') {
      if (url.search) return false;
      return /^\/(?:api\/ai\/conversation|index\.html|styles\.css|manifest\.webmanifest|favicon\.ico|icons\/maya-(?:192|512|512-maskable|apple-180)\.png|m\/[A-Za-z0-9]+\/main\.js)?$/.test(url.pathname);
    }
    if (request.method !== 'POST' || url.search) return false;
    if (url.pathname === '/api/ai/goods/photo-preview') {
      const header = Object.entries(request.headers ?? {}).find(([key]) => key.toLowerCase()==='content-type')?.[1];
      return typeof header==='string' && /^multipart\/form-data; boundary=/.test(header) && (request.postData === undefined || request.postData.length < 100000);
    }
    const body = JSON.parse(request.postData);
    if (url.pathname === '/api/auth/email/start') return keys(body, ['email']) && scope.emails.includes(body.email);
    if (url.pathname === '/api/auth/email/verify') return keys(body, ['email', 'code']) && scope.emails.includes(body.email) && /^\d{4,8}$/.test(body.code);
    if (url.pathname === '/api/auth/refresh') return keys(body, ['refreshToken']) && text(body.refreshToken);
    if (url.pathname === '/api/widgets/resolve') {
      if (!keys(body, ['thread_page'], ['rendered', 'booking_receipt'])) return false;
      const page = body.thread_page;
      if (!keys(page, ['limit'], ['before']) || !Number.isInteger(page.limit) || page.limit < 1 || page.limit > 50 || (page.before !== undefined && !uuid(page.before))) return false;
      if (body.booking_receipt !== undefined) {
        return !Object.hasOwn(body, 'rendered') && keys(page, ['limit']) && page.limit === 20
          && keys(body.booking_receipt, ['widget_id']) && uuid(body.booking_receipt.widget_id);
      }
      const rendered = body.rendered;
      return rendered === undefined || (keys(rendered, ['widget_id', 'body_hash', 'envelope_seal']) && uuid(rendered.widget_id) && hash(rendered.body_hash) && text(rendered.envelope_seal));
    }
    if (url.pathname === '/api/widgets/intent') {
      if (!keys(body, ['contract', 'widget_id', 'intent_token', 'inputs', 'client_nonce', 'profile_id'], ['client_emitted_at']) || body.contract !== 'maya.widget.intent.submission/1' || !uuid(body.widget_id) || !text(body.intent_token) || !uuid(body.client_nonce) || body.profile_id !== 'pwa/1' || (body.client_emitted_at !== undefined && !instant(body.client_emitted_at))) return false;
      return body.inputs === null;
    }
    if (!['/api/ai/goods/search','/api/ai/goods/item-read','/api/ai/goods/receipt-review'].includes(url.pathname)) return false;
    const field = url.pathname.endsWith('/search') ? 'query' : url.pathname.endsWith('/item-read') ? 'goods_id' : 'proposal';
    if (!keys(body,['requestId','source_revision',field],['conversationId']) || !text(body.requestId,128) || !hash(body.source_revision) || (body.conversationId !== undefined && !uuid(body.conversationId))) return false;
    if(field==='query') return ['шампунь','другой товар'].includes(body.query);
    if(field==='goods_id') return ['123','124'].includes(body.goods_id);
    return keys(body.proposal,['goods_id','store_id','quantity','unit_id','unit_cost','currency','price_kind','received_at','photo_sha256','source_line','review_version']) && ['123','124'].includes(body.proposal.goods_id) && body.proposal.store_id==='9' && body.proposal.quantity==='2.5' && body.proposal.unit_id==='11' && ['10.25','11.25'].includes(body.proposal.unit_cost) && body.proposal.currency==='RUB' && body.proposal.price_kind==='receipt_purchase_unit' && body.proposal.received_at==='2026-10-08T09:00:00Z' && hash(body.proposal.photo_sha256) && body.proposal.source_line===1 && [1,2].includes(body.proposal.review_version);
  } catch { return false; }
}

export async function installGuard(page, origin, scope) {
  localOrigin(origin);
  assert.ok(scope.emails.length > 0);
  const blocked = [], errors = [], faults = [];
  let reviewLoss = false;
  const listener = event => {
    if (event.sessionId !== page.sessionId || event.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = event.params;
    if (event.params.responseStatusCode !== undefined) {
      const lose = reviewLoss && new URL(request.url).pathname==='/api/ai/goods/receipt-review' && event.params.responseStatusCode===201;
      if(lose){reviewLoss=false;faults.push('review_response_lost_after_real_http_201');}
      void page.send(lose?'Fetch.failRequest':'Fetch.continueRequest',{requestId,...(lose?{errorReason:'Failed'}:{})}).catch(()=>errors.push('response_interception_failed')); return;
    }
    const allow = admitted(request, origin, scope);
    // Evidence never retains email, OTP, credentials, tokens or request/query data.
    if (!allow) blocked.push({ method: request.method, path: new URL(request.url).pathname });
    void page.send(allow ? 'Fetch.continueRequest' : 'Fetch.failRequest', { requestId, ...(allow ? {} : { errorReason: 'BlockedByClient' }) }).catch(() => errors.push('request_interception_failed'));
  };
  page.browser.listeners.add(listener);
  await page.send('Network.setBypassServiceWorker', { bypass: true });
  await page.send('Network.setBlockedURLs', { urls: ['ws://*', 'wss://*'] });
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }, {urlPattern:'*/api/ai/goods/receipt-review',requestStage:'Response'}] });
  return { blocked, errors, faults, armReviewLoss(){assert.equal(reviewLoss,false);reviewLoss=true;} };
}
