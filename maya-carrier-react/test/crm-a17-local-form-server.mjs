// Developer-only current React host. Every admitted API request reaches the real
// AppModule unchanged. The fence rejects all non-fixture credentials and actions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createDevServer, RELAY_REQUEST_HEADERS } from '../../maya-chat-shell/dev/serve.mjs';
import { localOrigin } from './crm-a17-setup-browser-guard.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, required, optional = []) => object(value) && required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => [...required, ...optional].includes(key));
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const version = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function observedDebugCode(status, rawBody, email) {
  try {
    if (![200, 201].includes(status) || typeof rawBody !== 'string' || Buffer.byteLength(rawBody) > 16384) return null;
    const body = JSON.parse(rawBody);
    if (!object(body) || body.ok !== true || body.delivery !== 'debug' || body.email !== email || body.next_step !== 'verify_email_code' || typeof body.debug_code !== 'string' || !/^\d{4,8}$/.test(body.debug_code) || typeof body.expires_at !== 'string' || !Number.isFinite(Date.parse(body.expires_at))) return null;
    return { code: body.debug_code, expiresAt: Date.parse(body.expires_at) };
  } catch { return null; }
}
export function localRequestAllowed(method, rawPath, headers, body, scope) {
  try {
    const url = new URL(rawPath, 'http://127.0.0.1');
    if (url.origin !== 'http://127.0.0.1' || url.hash) return false;
    if (method === 'GET') {
      if (url.pathname === '/api/integrations/crm/operation') return [...url.searchParams.keys()].sort().join(',') === 'operation,requestId' && ['install', 'activate'].includes(url.searchParams.get('operation')) && uuid(url.searchParams.get('requestId'));
      return !url.search && ['/api/ai/conversation', '/api/branches', '/api/integrations/crm'].includes(url.pathname);
    }
    if (method !== 'POST' || url.search) return false;
    if (url.pathname === '/api/auth/email/start') return keys(body, ['email']) && body.email === scope.email;
    if (url.pathname === '/api/auth/email/verify') return keys(body, ['email', 'code']) && body.email === scope.email && typeof body.code === 'string' && /^\d{4,8}$/.test(body.code);
    if (url.pathname === '/api/auth/refresh') return keys(body, ['refreshToken']) && typeof body.refreshToken === 'string' && body.refreshToken.length > 0 && body.refreshToken.length <= 8192;
    if (url.pathname === '/api/auth/logout') return keys(body, []);
    if (url.pathname === '/api/widgets/resolve') return keys(body, ['thread_page']) && keys(body.thread_page, ['limit'], ['before']) && Number.isInteger(body.thread_page.limit) && body.thread_page.limit >= 1 && body.thread_page.limit <= 50 && (body.thread_page.before === undefined || uuid(body.thread_page.before));
    if (!uuid(headers['idempotency-key'])) return false;
    if (url.pathname === '/api/integrations/crm/activate') return keys(body, ['expectedVersion']) && version(body.expectedVersion);
    if (url.pathname !== '/api/integrations/crm/connect' || !keys(body, ['provider', 'apiToken', 'expectedVersion', 'settingsJson'])) return false;
    return body.provider === 'yclients' && ['SYNTHETIC_A17_V1', 'SYNTHETIC_A17_V2'].includes(body.apiToken) &&
      (body.expectedVersion === null || version(body.expectedVersion)) && keys(body.settingsJson, ['companyId', 'branchBinding']) &&
      body.settingsJson.companyId === scope.companyId && keys(body.settingsJson.branchBinding, ['contract', 'companyId', 'branchId']) &&
      body.settingsJson.branchBinding.contract === 'maya.crm-branch-binding/1' && body.settingsJson.branchBinding.companyId === scope.companyId && body.settingsJson.branchBinding.branchId === scope.branchId;
  } catch { return false; }
}
const bodyBytes = incoming => new Promise((resolve, reject) => {
  const chunks = []; let count = 0;
  incoming.on('data', chunk => { count += chunk.length; if (count > 16384) { reject(new Error('Request bound')); incoming.destroy(); } else chunks.push(chunk); });
  incoming.on('end', () => resolve(Buffer.concat(chunks))); incoming.on('error', reject);
});
const json = (response, status, value) => { if (!response.destroyed && !response.headersSent) { response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(JSON.stringify(value)); } };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function main() {
  assert.equal(process.connected, true, 'Use the owned crm-setup-local launcher');
  const input = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Missing local fixture')), 15000);
    process.once('message', value => { clearTimeout(timer); resolve(value); }); process.send({ type: 'ready' });
  });
  assert.equal(input.type, 'start');
  const target = new URL(localOrigin(input.backendOrigin));
  assert.match(input.email, /^wl-[a-f0-9]{8}@widgets-live\.test$/);
  assert.equal(input.companyId, 424242); assert.equal(typeof input.branchId, 'string');
  let dev, closing, debugCode = null;
  const requests = new Set();
  const fence = http.createServer((incoming, outgoing) => {
    void (async () => {
      const bytes = await bodyBytes(incoming);
      let body;
      try { body = bytes.length ? JSON.parse(bytes.toString('utf8')) : undefined; }
      catch { json(outgoing, 400, { error: { code: 'local_fixture_json_required' } }); return; }
      if (!localRequestAllowed(incoming.method, incoming.url, incoming.headers, body, input)) {
        json(outgoing, 403, { error: { code: 'local_synthetic_fixture_only' }, message: 'Только синтетическая локальная форма. Реальные токены и другие действия запрещены.' });
        return;
      }
      const headers = { Accept: 'application/json', connection: 'close' };
      for (const name of RELAY_REQUEST_HEADERS) { const value = incoming.headers[name.toLowerCase()]; if (typeof value === 'string') headers[name] = value; }
      if (bytes.length) headers['Content-Length'] = String(bytes.length);
      const upstream = http.request({ hostname: target.hostname, port: target.port, method: incoming.method, path: incoming.url, headers }, response => {
        const chunks = []; let size = 0;
        response.on('data', chunk => { size += chunk.length; if (size > 1048576) response.destroy(new Error('Response bound')); else chunks.push(chunk); });
        response.on('end', () => {
          const received = Buffer.concat(chunks);
          if (incoming.url === '/api/auth/email/start') debugCode = observedDebugCode(response.statusCode, received.toString('utf8'), input.email);
          if (incoming.url === '/api/auth/email/verify' && [200, 201].includes(response.statusCode)) debugCode = null;
          const responseHeaders = { 'cache-control': 'no-store' };
          for (const name of ['content-type', 'retry-after', 'etag']) if (response.headers[name]) responseHeaders[name] = response.headers[name];
          if (!outgoing.destroyed && !outgoing.headersSent) { outgoing.writeHead(response.statusCode ?? 502, responseHeaders); outgoing.end(received); }
        });
        response.on('error', () => json(outgoing, 502, { error: { code: 'local_upstream_unavailable' } }));
      });
      requests.add(upstream); upstream.once('close', () => requests.delete(upstream));
      upstream.setTimeout(20000, () => upstream.destroy());
      upstream.on('error', () => json(outgoing, 502, { error: { code: 'local_upstream_unavailable' } }));
      upstream.end(bytes);
    })().catch(() => json(outgoing, 400, { error: { code: 'local_fixture_request_refused' } }));
  });
  fence.requestTimeout = 10000; fence.headersTimeout = 10000;
  const cleanup = () => closing ??= (async () => {
    debugCode = null;
    for (const request of requests) request.destroy();
    await dev?.close(); fence.closeAllConnections();
    await new Promise(resolve => fence.close(() => resolve()));
  })();
  const terminate = () => { void cleanup().finally(() => { if (process.connected) process.disconnect(); process.exit(0); }); };
  process.once('SIGTERM', terminate); process.once('SIGINT', terminate); process.once('disconnect', terminate);
  await new Promise((resolve, reject) => { fence.once('error', reject); fence.listen(0, '127.0.0.1', resolve); });
  const fencePort = String(fence.address().port);
  dev = createDevServer({ root: path.join(root, 'dist/web'), api: `http://127.0.0.1:${fencePort}/api`, upstreamPorts: [fencePort] });
  // A separate notice page; the current React build and API responses are not edited.
  const handlers = dev.server.listeners('request'); dev.server.removeAllListeners('request');
  dev.server.on('request', (incoming, outgoing) => {
    if (incoming.method === 'GET' && incoming.url === '/__local-a17') {
      if (debugCode && debugCode.expiresAt <= Date.now()) debugCode = null;
      const codeMessage = debugCode ? `<p>Фактический debug-код backend для этого входа: <strong>${debugCode.code}</strong>. Он хранится только в памяти локального host и удаляется после входа или окончания срока.</p>` : '<p>Код пока не получен или уже использован. В форме запросите код по email, затем обновите эту страницу. Новый код здесь не генерируется.</p>';
      outgoing.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" });
      outgoing.end(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>MAYA — локальная синтетическая проверка</title><main style="font:18px system-ui;max-width:720px;margin:40px auto;padding:20px"><h1>Локальная синтетическая проверка MAYA</h1><p>Текущая React-форма, настоящий AppModule и отдельная PostgreSQL на этом Mac. Данные тестовые. Внешний YCLIENTS и модель не вызываются.</p><p><strong>Не вводите реальные токены.</strong> Разрешены только <code>SYNTHETIC_A17_V1</code> и <code>SYNTHETIC_A17_V2</code>. Тестовый токен хранится зашифрованным только в этой локальной базе.</p><p>Откройте форму в новой вкладке и запросите вход по email <code>${input.email}</code>. Вернитесь сюда и обновите страницу, чтобы получить фактический код backend. ID компании: <code>424242</code>. Выберите единственный синтетический филиал.</p>${codeMessage}<p>Для каждого сохранения и активации нужны отдельные явные согласия. Проверка результата не повторяет операцию. Сессия ограничена 15 минутами; остановка launcher закроет owned процессы.</p><p><a href="/?local_crm_setup=1" target="_blank" rel="noopener noreferrer">Открыть текущую форму в новой вкладке</a></p></main></html>`);
      return;
    }
    for (const handler of handlers) handler.call(dev.server, incoming, outgoing);
  });
  const { port } = await dev.listen(0);
  const origin = localOrigin(`http://127.0.0.1:${port}`);
  process.send({ type: 'listening', landingUrl: origin + '/__local-a17', formUrl: origin + '/?local_crm_setup=1' });
}
if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url)
  main().catch(() => { console.error('Local synthetic form host failed'); process.exitCode = 1; if (process.connected) process.disconnect(); });
