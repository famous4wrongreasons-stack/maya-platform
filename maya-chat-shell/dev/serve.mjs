#!/usr/bin/env node
// K5 dev — static server for dist/web with a relay-faithful same-origin /api (§2.4).
//
//   node dev/serve.mjs --root=dist/web --port=8787 --mock=dev/fixtures --scenario=happy
//   node dev/serve.mjs --root=dist/web --port=8788 --api=http://127.0.0.1:3310/api
//
// /api/* behaves as `maya-saas-backend/deploy/platform/beget-edge/maya-platform-api.php` does, whichever
// upstream answers (NestJS on 127.0.0.1, or the mock of dev/scenarios.mjs):
//   * request headers forwarded: `Accept: application/json` plus Content-Type, If-None-Match,
//     X-Session-Token, X-Telegram-InitData, Idempotency-Key and Authorization, when non-empty
//     (relay lines 101-110). Nothing else — no Origin, no Cookie, no X-Request-ID;
//   * response headers returned: Content-Type, ETag, Last-Modified, Location, Retry-After,
//     Cache-Control (lines 160-171), plus the relay's own static CORS headers (lines 17-19);
//   * the body is buffered both ways; 75 s upstream timeout, 12 s connect; unreachable → 502 with the
//     relay's body; OPTIONS → 204; other methods than GET/POST/PUT/PATCH/DELETE/HEAD → 405;
//     `..` or NUL in the path → 400; `/api` alone → `/health`.
// `test/serve.test.mjs` parses those lines of the relay source and compares them with the lists below.
//
// Headers (D10): the header CSP carries `frame-ancestors 'none'`; the meta CSP in entry/index.html
// carries the same directives without it. `--api` refuses any upstream but 127.0.0.1 or localhost.
// `/__dev/*` exists only with `--mock`, lives outside /api and is never emitted into dist/web.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { BACKEND_PORT, PROOF_DB } from './local-api-env.mjs';
import { SCENARIOS, createMockApi } from './scenarios.mjs';

export const DEV_DIR = path.dirname(fileURLToPath(import.meta.url));

// ── the relay's lists (maya-platform-api.php) ──────────────────────────────────────────────────

/** Lines 101-110, in the relay's order. `Accept` is fixed; Authorization is appended last. */
export const RELAY_FIXED_REQUEST_HEADERS = Object.freeze([['Accept', 'application/json']]);
export const RELAY_REQUEST_HEADERS = Object.freeze(['Content-Type', 'If-None-Match', 'X-Session-Token', 'X-Telegram-InitData', 'Idempotency-Key', 'Authorization']);
/** Lines 160-167: upstream (lowercase) → emitted name. */
export const RELAY_RESPONSE_HEADERS = Object.freeze([
  ['content-type', 'Content-Type'],
  ['etag', 'ETag'],
  ['last-modified', 'Last-Modified'],
  ['location', 'Location'],
  ['retry-after', 'Retry-After'],
  ['cache-control', 'Cache-Control'],
]);
/** Lines 6-19: the relay's own CORS headers. */
export const RELAY_ALLOWED_ORIGINS = Object.freeze(['https://mayaos.ru', 'https://www.mayaos.ru', 'capacitor://localhost', 'capacitor://mayaos.ru']);
export const RELAY_CORS_HEADERS = Object.freeze([
  ['Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS'],
  ['Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, If-None-Match, X-Session-Token, X-Telegram-InitData, Idempotency-Key'],
  ['Access-Control-Expose-Headers', 'Content-Type, ETag, Last-Modified, Location, Retry-After'],
]);
export const RELAY_ALLOWED_METHODS = Object.freeze(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']);
export const RELAY_TIMEOUT_MS = 75_000;
export const RELAY_CONNECT_TIMEOUT_MS = 12_000;
export const RELAY_USER_AGENT = 'MAYA-Platform-Edge/1.0';
export const RELAY_UNAVAILABLE_BODY = '{"message":"MAYA server is temporarily unavailable"}';

// ── headers of every response (D10) ────────────────────────────────────────────────────────────

export const CSP_DIRECTIVES = Object.freeze([
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  // A runtime fence behind the build's sink gates: a string reaching an HTML or script sink throws.
  "require-trusted-types-for 'script'",
]);
export const HEADER_CSP = [...CSP_DIRECTIVES, "frame-ancestors 'none'"].join('; ');
/** The meta copy: identical directives, and no frame-ancestors, report-uri or sandbox (ignored or an error in meta). */
export const META_CSP = CSP_DIRECTIVES.join('; ');
export const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': HEADER_CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'microphone=(self)',
});

/** Directive name → value tokens. */
export function parseCsp(csp) {
  const out = new Map();
  for (const part of String(csp).split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length) out.set(tokens[0].toLowerCase(), tokens.slice(1));
  }
  return out;
}

/** Every `<meta http-equiv="Content-Security-Policy" content="…">` in an HTML text. */
export function metaCspOf(html) {
  const found = [];
  for (const m of String(html).matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/http-equiv\s*=\s*["']?content-security-policy["']?/i.test(tag)) continue;
    const content = /content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i.exec(tag);
    found.push(content ? (content[1] ?? content[2]).replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&') : '');
  }
  return found;
}

/** The D10 split: problems found in (header CSP, served HTML). Empty = the split holds. */
export function cspSplitProblems(headerCsp, html) {
  const problems = [];
  const header = parseCsp(headerCsp);
  if ((header.get('frame-ancestors') ?? []).join(' ') !== "'none'") problems.push("header CSP lacks frame-ancestors 'none'");
  const metas = metaCspOf(html);
  if (metas.length !== 1) problems.push(`expected exactly one meta CSP, found ${metas.length}`);
  for (const meta of metas) {
    const directives = parseCsp(meta);
    for (const banned of ['frame-ancestors', 'report-uri', 'report-to', 'sandbox'])
      if (directives.has(banned)) problems.push(`meta CSP carries ${banned}`);
    for (const [name, value] of header) {
      if (name === 'frame-ancestors') continue;
      if (!directives.has(name)) {
        problems.push(`meta CSP lacks ${name}`);
        continue;
      }
      const metaValue = directives.get(name);
      // connect-src may add the capacitor origin after the header's tokens (§1.10); nothing else may differ.
      const same = name === 'connect-src' ? value.every((token, i) => metaValue[i] === token) : metaValue.join(' ') === value.join(' ');
      if (!same) problems.push(`meta ${name} "${metaValue.join(' ')}" differs from header "${value.join(' ')}"`);
    }
  }
  return problems;
}

// ── static files ───────────────────────────────────────────────────────────────────────────────

const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
});

/** Decode and check a URL path: null when it is not admissible (traversal, NUL, backslash, bad escape). */
export function safeRelativePath(rawPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;
  if (decoded.split('/').some((segment) => segment === '..' || segment === '.')) return null;
  return decoded;
}

/** The dev fixtures host and parity pages, served only under /__dev/ in --mock. */
const DEV_PAGES = new Set(['fixture-host.html', 'fixture-host.mjs', 'h7-parity.html', 'h7-parity.mjs']);

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, value, extra = {}) {
  send(res, status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra }, JSON.stringify(value));
}

function readBody(req, limit = 16 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('request body over the dev server limit'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ── upstreams ──────────────────────────────────────────────────────────────────────────────────

/** Ports an upstream may never be: the owner's shared Postgres cluster and the isolated proof DB. */
export const REFUSED_UPSTREAM_PORTS = Object.freeze(['5432', PROOF_DB.port]);

/**
 * `--api` must name http://127.0.0.1 or http://localhost on the local backend's port (3310, the port
 * dev/local-api-env.mjs gives the binary); anything else is refused before listening. `ports` widens
 * the admitted set for a caller that names an ephemeral test upstream explicitly — never to 5432 or
 * the proof DB port (integration finding: the relay admitted http://127.0.0.1:5432).
 */
export function assertLocalUpstream(raw, { ports = [BACKEND_PORT] } = {}) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`--api ${JSON.stringify(raw)} is not a URL`);
  }
  if (url.protocol !== 'http:') throw new Error(`--api must be http: on the loopback interface, not ${url.protocol}`);
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost')
    throw new Error(`--api host ${JSON.stringify(url.hostname)} refused: only 127.0.0.1 or localhost (no network to production hosts)`);
  if (url.username || url.password) throw new Error('--api must not carry credentials');
  // WHATWG URL drops a default port: an empty port is :80, which no local backend listens on.
  if (url.port === '') throw new Error(`--api must name the backend port explicitly (:${BACKEND_PORT})`);
  if (REFUSED_UPSTREAM_PORTS.includes(url.port)) throw new Error(`--api port ${url.port} refused: a database port is never an upstream`);
  if (!ports.map(String).includes(url.port)) throw new Error(`--api port ${url.port} refused: only :${ports.join(', :')}`);
  return url;
}

function httpUpstream(base) {
  const basePath = base.pathname.replace(/\/$/, '');
  return ({ method, apiPath, search, headers, body, signal }) =>
    new Promise((resolve) => {
      const target = new URL(`${basePath}${apiPath}${search}`, base);
      const outHeaders = { ...headers, 'User-Agent': RELAY_USER_AGENT };
      if (body && body.length) outHeaders['Content-Length'] = String(body.length);
      // A fresh connection per request, as curl makes: no pooled socket, no idle timeout on a slow answer.
      const request = http.request(target, { method, headers: outHeaders, signal, agent: false }, (upstream) => {
        const chunks = [];
        upstream.on('data', (c) => chunks.push(c));
        upstream.on('end', () => resolve({ status: upstream.statusCode ?? 0, headers: upstream.headers, body: Buffer.concat(chunks) }));
        upstream.on('error', () => resolve({ relayFailure: true }));
      });
      request.on('socket', (socket) => {
        if (!socket.connecting) return;
        const connectTimer = setTimeout(() => request.destroy(new Error('connect timeout')), RELAY_CONNECT_TIMEOUT_MS);
        socket.once('connect', () => clearTimeout(connectTimer));
        socket.once('close', () => clearTimeout(connectTimer));
      });
      request.on('error', () => resolve({ relayFailure: true }));
      if (body && body.length && method !== 'GET' && method !== 'HEAD') request.end(body);
      else request.end();
    });
}

function mockUpstream(mockApi) {
  return async ({ method, apiPath, headers, body, signal }) => {
    let answer;
    try {
      answer = await mockApi.handle({ method, path: apiPath, headers, rawBody: body, signal });
    } catch (error) {
      // A defect in the mock is a 500 with its message, never a silent relay 502.
      console.error(`dev/scenarios: ${error.stack ?? error.message}`);
      return { status: 500, headers: { 'content-type': 'application/json; charset=utf-8' }, body: Buffer.from(JSON.stringify({ message: `mock defect: ${error.message}`, statusCode: 500 })) };
    }
    if (answer.relayFailure) return { relayFailure: true };
    if (answer.hang) {
      await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
      return { relayFailure: true };
    }
    const lower = Object.fromEntries(Object.entries(answer.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
    return { status: answer.status, headers: lower, body: Buffer.from(JSON.stringify(answer.body)) };
  };
}

// ── the relay ──────────────────────────────────────────────────────────────────────────────────

/** Headers the relay forwards, from a Node request's (lowercased) headers. Null when it answers 400. */
export function relayRequestHeaders(incoming) {
  const out = {};
  for (const [name, value] of RELAY_FIXED_REQUEST_HEADERS) out[name] = value;
  const idem = incoming['idempotency-key'];
  if (idem !== undefined && (idem === '' || /[\r\n]/.test(idem))) return null;
  for (const name of RELAY_REQUEST_HEADERS) {
    const value = incoming[name.toLowerCase()];
    if (typeof value === 'string' && value !== '') out[name] = value;
    else if (Array.isArray(value) && value.length) out[name] = value.join(', ');
  }
  return out;
}

/** Response headers the relay returns: its static CORS headers, then the allowlisted upstream ones. */
export function relayResponseHeaders(upstreamHeaders, origin) {
  const out = {};
  if (origin && RELAY_ALLOWED_ORIGINS.includes(origin)) {
    out['Access-Control-Allow-Origin'] = origin;
    out.Vary = 'Origin';
  }
  for (const [name, value] of RELAY_CORS_HEADERS) out[name] = value;
  for (const [source, target] of RELAY_RESPONSE_HEADERS) {
    const value = upstreamHeaders[source];
    if (value !== undefined && value !== '') out[target] = Array.isArray(value) ? value[value.length - 1] : String(value);
  }
  return out;
}

async function relay(req, res, upstream, timeoutMs) {
  const url = new URL(req.url, 'http://relay.local');
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : null;
  const cors = relayResponseHeaders({}, origin);
  const method = String(req.method ?? 'GET').toUpperCase();
  if (method === 'OPTIONS') return send(res, 204, { ...SECURITY_HEADERS, ...cors }, '');
  if (!RELAY_ALLOWED_METHODS.includes(method))
    return send(res, 405, { ...SECURITY_HEADERS, ...cors, 'Content-Type': 'application/json; charset=utf-8' }, '{"message":"Method not allowed"}');

  // The raw request path is checked as well: WHATWG URL parsing resolves `%2e%2e` segments silently.
  const rawRequestPath = String(req.url).split('?')[0];
  if (safeRelativePath(rawRequestPath) === null)
    return send(res, 400, { ...SECURITY_HEADERS, ...cors, 'Content-Type': 'application/json; charset=utf-8' }, '{"message":"Invalid path"}');
  const rawApiPath = url.pathname.replace(/^\/api/, '');
  let apiPath = rawApiPath === '' || rawApiPath === '/' ? '/health' : rawApiPath;
  const decoded = (() => {
    try {
      return decodeURIComponent(apiPath);
    } catch {
      return null;
    }
  })();
  if (decoded === null || decoded.includes('\0') || /(?:^|\/)\.\.(?:\/|$)/.test(decoded))
    return send(res, 400, { ...SECURITY_HEADERS, ...cors, 'Content-Type': 'application/json; charset=utf-8' }, '{"message":"Invalid path"}');
  if (!apiPath.startsWith('/')) apiPath = `/${apiPath}`;

  const forwarded = relayRequestHeaders(req.headers);
  if (!forwarded)
    return send(res, 400, { ...SECURITY_HEADERS, ...cors, 'Content-Type': 'application/json; charset=utf-8' }, '{"error":{"code":"invalid_idempotency_key"}}');

  const body = method === 'GET' || method === 'HEAD' ? null : await readBody(req);
  // curl adds this content type to a POSTFIELDS body that has none.
  if (body && body.length && !forwarded['Content-Type']) forwarded['Content-Type'] = 'application/x-www-form-urlencoded';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let answer;
  try {
    answer = await upstream({ method, apiPath, search: url.search, headers: forwarded, body: body && body.length ? body : null, signal: controller.signal });
  } catch {
    answer = { relayFailure: true };
  } finally {
    clearTimeout(timer);
  }
  if (controller.signal.aborted || answer.relayFailure || !answer.status)
    return send(res, 502, { ...SECURITY_HEADERS, ...cors, 'Content-Type': 'application/json; charset=utf-8' }, RELAY_UNAVAILABLE_BODY);

  const headers = { ...SECURITY_HEADERS, ...relayResponseHeaders(answer.headers, origin) };
  const withBody = method !== 'HEAD' && answer.status !== 304;
  res.writeHead(answer.status, headers);
  res.end(withBody ? answer.body : undefined);
}

// ── the server ─────────────────────────────────────────────────────────────────────────────────

/**
 * What the dev pages need to import the emitted graph without probing for it (a 404 probe would be a
 * console error): the module path and the emitted files, read from the directory actually served.
 */
function webDescriptor(root) {
  let modulePath = null;
  let source = 'no m/ directory';
  try {
    const dirs = fs.readdirSync(path.join(root, 'm'), { withFileTypes: true }).filter((d) => d.isDirectory());
    if (dirs.length === 1) {
      modulePath = `m/${dirs[0].name}/`;
      source = 'scan';
    } else source = `scan found ${dirs.length} module directories`;
  } catch {
    // no emitted modules
  }
  const walk = (dir, base) =>
    fs.existsSync(dir)
      ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name), base) : [path.relative(base, path.join(dir, e.name)).split(path.sep).join('/')]))
      : [];
  const files = modulePath ? walk(path.join(root, modulePath), path.join(root, modulePath)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)) : [];
  return {
    modulePath,
    source,
    files,
    index: fs.existsSync(path.join(root, 'index.html')),
    styles: fs.existsSync(path.join(root, 'styles.css')),
  };
}

function listJsonFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsonFiles(full, base));
    else if (entry.name.endsWith('.json')) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function serveFile(res, file, cacheControl) {
  fs.readFile(file, (error, buffer) => {
    if (error) return send(res, 404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, 'not found');
    send(res, 200, { ...SECURITY_HEADERS, 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': cacheControl }, buffer);
  });
}

function serveStatic(req, res, root) {
  const url = new URL(req.url, 'http://static.local');
  // The raw path is checked too: WHATWG URL parsing silently resolves `/../` before we would see it.
  const rawPath = String(req.url).split('?')[0].split('#')[0];
  const rel = safeRelativePath(rawPath) === null ? null : safeRelativePath(url.pathname);
  if (rel === null) return send(res, 400, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }, 'bad path');
  const method = String(req.method).toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return send(res, 405, { ...SECURITY_HEADERS, Allow: 'GET, HEAD' }, '');
  const index = path.join(root, 'index.html');
  if (rel.endsWith('/') || path.extname(rel) === '') {
    if (!fs.existsSync(index))
      return send(res, 404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, 'index.html is not built (entry/ absent or build not run)');
    return serveFile(res, index, 'no-store');
  }
  const file = path.resolve(root, `.${rel}`);
  if (!file.startsWith(root + path.sep)) return send(res, 400, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }, 'bad path');
  const immutable = /^\/m\/[0-9a-f]{16}\//.test(rel);
  return serveFile(res, file, immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
}

async function serveDev(req, res, { mockApi, root, devDir }) {
  const url = new URL(req.url, 'http://dev.local');
  const method = String(req.method).toUpperCase();
  const sub = url.pathname.slice('/__dev/'.length);
  if (sub === 'scenario') {
    if (method === 'GET') return sendJson(res, 200, { scenario: mockApi.scenario, scenarios: Object.fromEntries(Object.entries(SCENARIOS).map(([k, v]) => [k, v.description])) });
    if (method === 'POST') {
      let name;
      try {
        name = JSON.parse((await readBody(req)).toString('utf8')).name;
        mockApi.setScenario(name);
      } catch (error) {
        return sendJson(res, 400, { error: error.message, scenarios: Object.keys(SCENARIOS) });
      }
      return sendJson(res, 200, { scenario: mockApi.scenario });
    }
  }
  if (sub === 'reset' && method === 'POST') {
    mockApi.reset();
    return sendJson(res, 200, { reset: true, scenario: mockApi.scenario });
  }
  if (sub === 'requests' && method === 'GET') return sendJson(res, 200, { requests: mockApi.requests(), stats: mockApi.stats() });
  if (sub === 'web.json' && method === 'GET') return sendJson(res, 200, webDescriptor(root));
  if (sub === 'fixtures-index.json' && method === 'GET')
    return sendJson(res, 200, { envelopes: listJsonFiles(path.join(devDir, 'fixtures', 'envelopes')) });
  if (sub.startsWith('fixtures/') && method === 'GET') {
    const rel = safeRelativePath(`/${sub.slice('fixtures/'.length)}`);
    if (rel === null || !rel.endsWith('.json')) return sendJson(res, 400, { error: 'bad fixture path' });
    const base = path.join(devDir, 'fixtures');
    const file = path.resolve(base, `.${rel}`);
    if (!file.startsWith(base + path.sep)) return sendJson(res, 400, { error: 'bad fixture path' });
    return serveFile(res, file, 'no-store');
  }
  if (DEV_PAGES.has(sub) && method === 'GET') return serveFile(res, path.join(devDir, sub), 'no-store');
  return sendJson(res, 404, { error: `no dev route ${url.pathname}` });
}

/**
 * Build (not start) a dev server. Exactly one of `mock` / `api`.
 * Returns { server, mockApi|null, listen(port) → Promise<{port}>, close() }.
 */
export function createDevServer({ root, mock = null, api = null, upstreamTimeoutMs = RELAY_TIMEOUT_MS, devDir = DEV_DIR, log = () => {}, upstreamPorts = [BACKEND_PORT] }) {
  if (Boolean(mock) === Boolean(api)) throw new Error('exactly one of --mock or --api is required');
  const resolvedRoot = path.resolve(root);
  const mockApi = mock ? createMockApi({ scenario: mock.scenario ?? 'happy', ...(mock.fixturesRoot ? { fixturesRoot: mock.fixturesRoot } : {}) }) : null;
  const upstream = mock ? mockUpstream(mockApi) : httpUpstream(assertLocalUpstream(api, { ports: upstreamPorts }));
  const server = http.createServer((req, res) => {
    res.sendDate = false;
    const pathname = new URL(req.url, 'http://x.local').pathname;
    const started = Date.now();
    res.on('finish', () => log(`${req.method} ${pathname} ${res.statusCode} ${Date.now() - started}ms`));
    const fail = (error) => {
      if (!res.headersSent) send(res, 500, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }, `dev server error: ${error.message}`);
      else res.destroy();
    };
    if (pathname === '/api' || pathname.startsWith('/api/')) return relay(req, res, upstream, upstreamTimeoutMs).catch(fail);
    // Traversal is refused on the raw path for every non-/api route (URL parsing would resolve it silently).
    if (safeRelativePath(String(req.url).split('?')[0]) === null)
      return send(res, 400, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }, 'bad path');
    if (pathname.startsWith('/__dev/')) {
      if (!mockApi) return send(res, 404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }, 'not found');
      return serveDev(req, res, { mockApi, root: resolvedRoot, devDir }).catch(fail);
    }
    try {
      return serveStatic(req, res, resolvedRoot);
    } catch (error) {
      return fail(error);
    }
  });
  return {
    server,
    mockApi,
    listen: (port = 0) =>
      new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => resolve({ port: server.address().port }));
      }),
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

function parseArgs(argv) {
  const args = {};
  for (const a of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (!m) throw new Error(`unknown argument ${a}`);
    args[m[1]] = m[2] ?? true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const known = new Set(['root', 'port', 'mock', 'scenario', 'api', 'upstream-timeout-ms', 'quiet']);
  for (const key of Object.keys(args)) if (!known.has(key)) throw new Error(`unknown option --${key}`);
  if (typeof args.root !== 'string') throw new Error('--root=<dist/web> is required');
  if (typeof args.mock === 'string' && path.resolve(args.mock) !== path.join(DEV_DIR, 'fixtures'))
    throw new Error(`--mock must name this shell's dev/fixtures (${path.join(DEV_DIR, 'fixtures')})`);
  const dev = createDevServer({
    root: args.root,
    mock: typeof args.mock === 'string' ? { scenario: typeof args.scenario === 'string' ? args.scenario : 'happy' } : null,
    api: typeof args.api === 'string' ? args.api : null,
    upstreamTimeoutMs: args['upstream-timeout-ms'] ? Number(args['upstream-timeout-ms']) : RELAY_TIMEOUT_MS,
    log: args.quiet ? () => {} : (line) => console.log(line),
  });
  const { port } = await dev.listen(args.port ? Number(args.port) : 8787);
  console.log(`maya-chat-shell dev http://127.0.0.1:${port}/  root=${path.resolve(args.root)}  ${dev.mockApi ? `mock scenario=${dev.mockApi.scenario}` : `api=${args.api}`}`);
  const stop = () => dev.close().then(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(`dev/serve: ${error.message}`);
    process.exit(2);
  });
}
