// Finite localhost preview. Never mounts backend, database or provider routes.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
const here = path.dirname(fileURLToPath(import.meta.url));
const built = await esbuild.build({ entryPoints: [path.join(here, 'onboarding-preview.fixture.tsx')], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', jsx: 'automatic', write: false, logLevel: 'silent' });
const html = '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/styles.css"><title>MAYA — предпросмотр формы</title></head><body><div id="root" class="app"></div><script type="module" src="/preview.js"></script></body></html>';
const assets = new Map([['/', ['text/html; charset=utf-8', html]], ['/preview.js', ['text/javascript', built.outputFiles[0].contents]], ['/styles.css', ['text/css', fs.readFileSync(path.join(here, '../src/styles.css'))]]]);
const server = http.createServer((request, response) => {
  const asset = request.method === 'GET' ? assets.get(request.url) : null;
  if (!asset) { response.writeHead(403); response.end('Preview only'); return; }
  response.writeHead(200, { 'Content-Type': asset[0], 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; style-src-attr 'none'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'" }); response.end(asset[1]);
});
const lifetimeMs = 30 * 60 * 1000;
let timer;
function stop() { clearTimeout(timer); server.closeAllConnections(); server.close(); }
process.once('SIGTERM', stop); process.once('SIGINT', stop);
server.listen(0, '127.0.0.1', () => {
  console.log(JSON.stringify({ profile: 'UI_PREVIEW_ONLY_NO_REGISTRATION', url: 'http://127.0.0.1:' + server.address().port + '/', expiresAt: new Date(Date.now() + lifetimeMs).toISOString(), database: false, provider: false }));
  timer = setTimeout(stop, lifetimeMs);
});
