// Network restriction for the isolated phone staging deployment, not a CRM
// adapter or authority provider. The existing CRM/Action Engine owners still
// authenticate, verify, store and project the provider's unmodified response.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { admittedProviderRead, READ_LIMITS } from './local-yclients-read-transport.mjs';

export const CATALOG_CONTRACT = 'maya.phone-catalog-egress/1';
const REFUSED = '{"success":false,"error":"phone_catalog_egress_refused"}';

export function validateCatalogScope(scope, now = Date.now()) {
  assert.ok(scope && Object.keys(scope).sort().join(',') === 'companyId,contract,expiresAt,maxCalls,notBefore', 'catalog_scope_shape');
  assert.equal(scope.contract, CATALOG_CONTRACT);
  assert.match(scope.companyId, /^[1-9][0-9]{0,14}$/);
  assert.ok(Number.isSafeInteger(Number(scope.companyId)), 'catalog_company');
  const start = Date.parse(scope.notBefore), end = Date.parse(scope.expiresAt);
  assert.ok(Number.isFinite(start) && Number.isFinite(end) && start <= now && end > now && end - start <= 86400000, 'catalog_window');
  assert.ok(Number.isSafeInteger(scope.maxCalls) && scope.maxCalls > 0 && scope.maxCalls <= 256, 'catalog_budget');
  return Object.freeze({ ...scope });
}

// DI is only for executable tests. The executable below always uses native
// fetch, the official HTTPS origin and an operator-owned immutable scope file.
export function catalogEgress(scopeInput, { nativeFetch = fetch, clock = Date.now } = {}) {
  const scope = validateCatalogScope(scopeInput, clock());
  const counters = { attempted: 0, completed: 0, refused: 0, inFlight: 0 };
  const controllers = new Set();
  let revoked = false;
  const current = () => !revoked && clock() >= Date.parse(scope.notBefore) && clock() < Date.parse(scope.expiresAt);
  const server = http.createServer({ maxHeaderSize: 12288, requestTimeout: 25000, headersTimeout: 10000 }, async (req, res) => {
    let controller, counted = false;
    const refuse = (status = 403) => {
      counters.refused++;
      if (!res.destroyed && !res.headersSent) res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Connection: 'close' }).end(REFUSED);
    };
    try {
      // Match raw target as well as parsed URL: URL normalization is not scope.
      const raw = req.url ?? '';
      assert.ok(current() && /^\/api\/v1\/[A-Za-z0-9_/?=]+$/.test(raw) && !raw.includes('//'), 'catalog_target');
      const url = 'https://api.yclients.com' + raw;
      assert.ok(admittedProviderRead(url, { method: req.method }, scope.companyId, false), 'catalog_route');
      assert.ok(req.headers['content-length'] === undefined || req.headers['content-length'] === '0', 'catalog_body');
      assert.equal(req.headers['transfer-encoding'], undefined, 'catalog_body');
      assert.equal(req.headers.expect, undefined, 'catalog_expect');
      const auth = req.headers.authorization;
      assert.ok(typeof auth === 'string' && /^Bearer [A-Za-z0-9_-]{16,4096}, User [A-Za-z0-9_-]{16,4096}$/.test(auth), 'catalog_credential_shape');
      assert.equal(req.headers.accept, 'application/vnd.yclients.v2+json');
      assert.ok(counters.attempted < scope.maxCalls && counters.inFlight < 4, 'catalog_budget');
      counters.attempted++; counters.inFlight++; counted = true;
      controller = new AbortController(); controllers.add(controller);
      res.once('close', () => controller.abort());
      const response = await nativeFetch(url, {
        method: 'GET', redirect: 'error',
        headers: { Authorization: auth, Accept: 'application/vnd.yclients.v2+json', 'Content-Type': 'application/json' },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(Math.max(1, Math.min(READ_LIMITS.fetchMs, Date.parse(scope.expiresAt) - clock())))]),
      });
      assert.ok(current() && !response.redirected && (!response.url || response.url === url), 'catalog_response_source');
      if (response.status !== 200) {
        await response.body?.cancel();
        refuse(response.status >= 400 && response.status <= 599 ? response.status : 502); return;
      }
      // Buffer to a fixed ceiling before writing anything to the backend. No
      // provider body, header, token or URL is written to a log or receipt.
      const chunks = []; let size = 0;
      for await (const chunk of response.body ?? []) {
        size += chunk.length;
        assert.ok(current() && size <= READ_LIMITS.responseBytes, 'catalog_response_bound');
        chunks.push(chunk);
      }
      assert.ok(current() && !res.destroyed, 'catalog_response_expired');
      const bytes = Buffer.concat(chunks);
      JSON.parse(bytes.toString('utf8'));
      const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
      // Do not erase pagination evidence relied on by completeness checks.
      for (const name of ['link', 'content-range']) {
        const value = response.headers.get(name); if (value !== null) headers[name] = value;
      }
      res.writeHead(200, headers);
      res.end(bytes); counters.completed++;
    } catch { controller?.abort(); refuse(); }
    finally { controllers.delete(controller); if (counted) counters.inFlight--; }
  });
  server.on('checkContinue', (_req, res) => res.writeHead(403, { Connection: 'close' }).end(REFUSED));
  server.on('checkExpectation', (_req, res) => res.writeHead(403, { Connection: 'close' }).end(REFUSED));
  server.on('connect', (_req, socket) => socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'));
  server.on('upgrade', (_req, socket) => socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'));
  server.on('clientError', (_error, socket) => socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'));
  const revoke = () => { revoked = true; for (const controller of controllers) controller.abort(); };
  return { server, revoke, snapshot: () => ({ contract: CATALOG_CONTRACT, ...counters, current: current() }) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.equal(process.argv.length, 3, 'fixed_scope_file_required');
    const scopePath = process.argv[2];
    assert.equal(scopePath, '/run/maya/catalog-scope.json', 'fixed_scope_path');
    const stat = fs.lstatSync(scopePath);
    assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.uid === 0 && (stat.mode & 0o077) === 0 && stat.size <= 2048, 'scope_file_owner');
    const egress = catalogEgress(JSON.parse(fs.readFileSync(scopePath, 'utf8')));
    egress.server.listen(8080, '0.0.0.0');
    for (const event of ['SIGTERM', 'SIGINT']) process.once(event, () => { egress.revoke(); egress.server.close(); egress.server.closeAllConnections(); });
  } catch { console.error('PHONE CATALOG EGRESS REFUSED'); process.exitCode = 1; }
}
