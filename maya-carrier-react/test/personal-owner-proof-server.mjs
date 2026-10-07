// Owned loopback proof relay. This is not the production PHP relay and makes no
// production deployment claim. Forwards the carrier's literal personal header;
// never injects a credential, role, context, request body or response fixture.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { SECURITY_HEADERS } from '../../maya-chat-shell/dev/serve.mjs';
import { localOrigin } from './personal-owner-browser-guard.mjs';
export function createPersonalProofServer({ root, backendOrigin, historyErasureFault }) {
  const target = localOrigin(backendOrigin);
  let erasureResponseDropped = false;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname.startsWith('/api/')) {
      const headers = {};
      for (const key of ['authorization', 'content-type', 'x-maya-authority-context']) if (req.headers[key]) headers[key] = req.headers[key];
      if (headers['x-maya-authority-context'] && headers['x-maya-authority-context'] !== 'personal_client') { res.writeHead(403); res.end(); return; }
      const upstream = http.request(target + url.pathname + url.search, { method: req.method, headers }, response => {
        // A finite proof-only transport fault: consume the real completed owner
        // response before dropping it. No replacement response or auth material.
        if (historyErasureFault && req.method === 'POST' && /^\/api\/privacy\/conversations\/[a-f0-9-]{36}\/erasure$/i.test(url.pathname) && response.statusCode === 200) {
          const parts = []; let bytes = 0;
          response.on('data', part => { bytes += part.length; if (bytes > 8192) response.destroy(new Error('erasure proof response too large')); else parts.push(part); });
          response.on('error', () => res.destroy());
          response.on('end', () => {
            const body = Buffer.concat(parts);
            try {
              const completed = JSON.parse(body.toString('utf8'));
              assert.equal(completed.contract, 'maya.privacy.history-erasure/1');
              assert.equal(completed.outcome, 'COMPLETED');
              assert.equal(Object.keys(completed).sort().join(','), 'contract,conversationId,erasedAt,outcome,requestId');
              const drop = historyErasureFault.dropFirstCommittedResponse === true && !erasureResponseDropped;
              if (drop) erasureResponseDropped = true;
              historyErasureFault.observe?.({ completed, dropped: drop });
              if (drop) { res.destroy(); return; }
              res.writeHead(response.statusCode, { ...SECURITY_HEADERS, 'Content-Type': response.headers['content-type'] ?? 'application/json' });
              res.end(body);
            } catch { res.destroy(); }
          });
          return;
        }
        res.writeHead(response.statusCode, { ...SECURITY_HEADERS, 'Content-Type': response.headers['content-type'] ?? 'application/json' }); response.pipe(res);
      });
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); }); req.pipe(upstream); return;
    }
    if (req.method !== 'GET' || url.search || !/^\/(?:index\.html|styles\.css|manifest\.webmanifest|favicon\.ico|icons\/maya-(?:192|512|512-maskable|apple-180)\.png|m\/[A-Za-z0-9]+\/main\.js)?$/.test(url.pathname)) { res.writeHead(404); res.end(); return; }
    const file = path.join(root, url.pathname === '/' ? 'index.html' : url.pathname);
    assert.ok(file.startsWith(path.resolve(root) + path.sep));
    if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    const type = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }[path.extname(file)] ?? 'application/octet-stream';
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': type, 'Cache-Control': 'no-store' }); fs.createReadStream(file).pipe(res);
  });
  return { listen: (port) => new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => resolve(server.address())); }), close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
