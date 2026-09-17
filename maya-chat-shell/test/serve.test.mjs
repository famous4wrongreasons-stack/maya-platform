// K5 — dev/serve.mjs and dev/scenarios.mjs (S7): relay parity, the header/meta CSP split (D10),
// DTO-enforcing mocks (D6, incl. LoginDto), the sign-in failure scenarios (V2-16) and approval_required (V2-5).
//
// Every server here is in-process on 127.0.0.1 with an ephemeral port and is closed by its test.
// The relay source is READ from the repository; production is never contacted.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CSP_DIRECTIVES,
  HEADER_CSP,
  META_CSP,
  RELAY_ALLOWED_METHODS,
  RELAY_ALLOWED_ORIGINS,
  RELAY_CONNECT_TIMEOUT_MS,
  RELAY_CORS_HEADERS,
  RELAY_FIXED_REQUEST_HEADERS,
  RELAY_REQUEST_HEADERS,
  RELAY_RESPONSE_HEADERS,
  RELAY_TIMEOUT_MS,
  RELAY_UNAVAILABLE_BODY,
  RELAY_USER_AGENT,
  SECURITY_HEADERS,
  assertLocalUpstream,
  createDevServer,
  cspSplitProblems,
  metaCspOf,
} from '../dev/serve.mjs';
import {
  AI_CORE_CHAT_DTO,
  API_FIXTURES_DIR,
  LOGIN_DTO,
  MOCK_ACCOUNT,
  MOCK_TENANTS,
  MOCK_TRANSCRIPT,
  REFRESH_SESSION_DTO,
  SCENARIOS,
  SIGN_IN_FAILURE_ROWS,
  START_EMAIL_AUTH_DTO,
  VERIFY_EMAIL_AUTH_DTO,
  jsonParseFailure,
  loadApiFixture,
  validateDto,
} from '../dev/scenarios.mjs';

const SH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CANON = path.resolve(SH, '..');
const BE = path.join(CANON, 'maya-saas-backend');
const RELAY_SOURCE = path.join(BE, 'deploy', 'platform', 'beget-edge', 'maya-platform-api.php');

// Framing and connection headers any HTTP stack adds; not application headers.
const FRAMING = new Set(['content-length', 'transfer-encoding', 'connection', 'keep-alive', 'date', 'host']);
const lowerNames = (headers) => Object.keys(headers).map((h) => h.toLowerCase());

/** Raw request with exact headers (fetch would add its own). */
function rawRequest(port, { method = 'GET', path: p = '/', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        let json = null;
        try {
          json = JSON.parse(buffer.toString('utf8'));
        } catch {
          // not JSON
        }
        resolve({ status: res.statusCode, headers: res.headers, text: buffer.toString('utf8'), json });
      });
    });
    req.on('error', reject);
    if (body !== null) req.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
    else req.end();
  });
}

const postJson = (port, p, body, headers = {}) =>
  rawRequest(port, { method: 'POST', path: p, headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

function tempRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-shell-serve-'));
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><meta http-equiv="Content-Security-Policy" content="${META_CSP}"><title>t</title>`);
  fs.mkdirSync(path.join(dir, 'm', '0123456789abcdef', 'entry'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'm', '0123456789abcdef', 'entry', 'main.js'), 'export {};\n');
  fs.writeFileSync(path.join(dir, 'styles.css'), 'body{}\n');
  return dir;
}

// ── 1. relay parity with the source kept in the repository ─────────────────────────────────────

describe('relay parity (maya-platform-api.php, read-only)', () => {
  const php = fs.readFileSync(RELAY_SOURCE, 'utf8');
  const lines = php.split('\n');
  const lineOf = (needle) => lines.findIndex((l) => l.includes(needle)) + 1;
  const quoted = (s) => [...s.matchAll(/'([^']*)'/g)].map((m) => m[1]);

  test('request allowlist: Accept fixed, the named headers, Authorization last (lines 101-110)', () => {
    const fixedLine = lineOf("$forwardHeaders = ['Accept: application/json'];");
    assert.ok(fixedLine >= 95 && fixedLine <= 115, `$forwardHeaders at line ${fixedLine}`);
    const loop = lines.slice(fixedLine, fixedLine + 3).join('\n');
    const names = quoted(/foreach \(\[([^\]]*)\] as \$name\)/.exec(loop)[1]);
    assert.ok(/\$forwardHeaders\[\] = 'Authorization: '/.test(lines.slice(fixedLine, fixedLine + 12).join('\n')), 'Authorization appended');
    assert.deepEqual(RELAY_FIXED_REQUEST_HEADERS, [['Accept', 'application/json']]);
    assert.deepEqual(RELAY_REQUEST_HEADERS, [...names, 'Authorization']);
  });

  test('response allowlist (lines 160-171)', () => {
    const start = lines.findIndex((l) => /^foreach \(\[\s*$/.test(l));
    assert.ok(start + 1 >= 155 && start + 1 <= 175, `response map at line ${start + 1}`);
    const block = lines.slice(start, start + 9).join('\n');
    const pairs = [...block.matchAll(/'([^']+)' => '([^']+)'/g)].map((m) => [m[1], m[2]]);
    assert.deepEqual(RELAY_RESPONSE_HEADERS, pairs);
  });

  test('CORS headers, origins, methods, timeouts, user agent and the 502 body', () => {
    assert.deepEqual(RELAY_ALLOWED_ORIGINS, quoted(/\$allowedOrigins = \[([\s\S]*?)\];/.exec(php)[1]));
    for (const [name, value] of RELAY_CORS_HEADERS) assert.ok(php.includes(`header('${name}: ${value}');`), `${name}: ${value}`);
    assert.deepEqual(RELAY_ALLOWED_METHODS, quoted(/\$allowedMethods = \[([^\]]*)\]/.exec(php)[1]));
    assert.equal(RELAY_TIMEOUT_MS, Number(/CURLOPT_TIMEOUT => (\d+)/.exec(php)[1]) * 1000);
    assert.equal(RELAY_CONNECT_TIMEOUT_MS, Number(/CURLOPT_CONNECTTIMEOUT => (\d+)/.exec(php)[1]) * 1000);
    assert.equal(RELAY_USER_AGENT, /CURLOPT_USERAGENT => '([^']+)'/.exec(php)[1]);
    assert.ok(php.includes("json_encode(['message' => 'MAYA server is temporarily unavailable']"));
    assert.equal(RELAY_UNAVAILABLE_BODY, JSON.stringify({ message: 'MAYA server is temporarily unavailable' }));
    assert.ok(/CURLOPT_FOLLOWLOCATION => false/.test(php));
  });
});

// ── 2. relay behaviour against a local fake upstream ───────────────────────────────────────────

describe('the /api relay in --api mode', () => {
  let upstream;
  let upstreamPort;
  let dev;
  let port;
  let root;
  const received = [];

  before(async () => {
    root = tempRoot();
    upstream = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        received.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
        if (req.url.startsWith('/api/hang')) return; // never answers
        if (req.url.startsWith('/api/not-modified')) {
          res.writeHead(304, { etag: '"e1"' });
          return res.end();
        }
        res.writeHead(req.url.startsWith('/api/created') ? 201 : 200, {
          'content-type': 'application/json; charset=utf-8',
          etag: '"e1"',
          'last-modified': 'Wed, 16 Sep 2026 10:00:00 GMT',
          location: '/api/elsewhere',
          'retry-after': '7',
          'cache-control': 'no-store',
          'set-cookie': 'sid=leak; HttpOnly',
          'x-leak': 'no',
          vary: 'Accept-Encoding',
          'x-request-id': 'upstream-id',
          'access-control-allow-origin': '*',
          'strict-transport-security': 'max-age=1',
        });
        res.end(JSON.stringify({ ok: true, url: req.url }));
      });
    });
    await new Promise((r) => upstream.listen(0, '127.0.0.1', r));
    upstreamPort = upstream.address().port;
    // The fake upstream listens on an ephemeral port: the programmatic API names it explicitly (the CLI admits 3310 only).
    dev = createDevServer({ root, api: `http://127.0.0.1:${upstreamPort}/api`, upstreamTimeoutMs: 400, upstreamPorts: [String(upstreamPort)] });
    ({ port } = await dev.listen(0));
  });
  after(async () => {
    await dev.close();
    upstream.closeAllConnections();
    await new Promise((r) => upstream.close(r));
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('forwards exactly the relay request headers and drops every other one', async () => {
    received.length = 0;
    const res = await postJson(port, '/api/created?x=1', { a: 1 }, {
      Authorization: 'Bearer t',
      'If-None-Match': '"e0"',
      'X-Session-Token': 's',
      'X-Telegram-InitData': 'i',
      'Idempotency-Key': 'k-1',
      Cookie: 'sid=1',
      Origin: 'http://127.0.0.1:1',
      Referer: 'http://127.0.0.1:1/',
      'X-Request-ID': 'client-id',
      'X-Maya-Render-Profile': 'owner',
      'X-Forwarded-For': '10.0.0.1',
      Accept: 'text/html',
      'User-Agent': 'Browser/1',
    });
    assert.equal(res.status, 201);
    const got = received[0];
    assert.equal(got.url, '/api/created?x=1');
    const names = lowerNames(got.headers).filter((h) => !FRAMING.has(h)).sort();
    assert.deepEqual(names, ['accept', 'authorization', 'content-type', 'idempotency-key', 'if-none-match', 'user-agent', 'x-session-token', 'x-telegram-initdata']);
    assert.equal(got.headers.accept, 'application/json');
    assert.equal(got.headers['user-agent'], RELAY_USER_AGENT);
    assert.equal(got.headers.authorization, 'Bearer t');
    assert.equal(got.body, '{"a":1}');
  });

  test('returns only the relay response headers (plus the static CORS and security headers)', async () => {
    const res = await rawRequest(port, { path: '/api/x', headers: { Origin: 'http://127.0.0.1:9' } });
    assert.equal(res.status, 200);
    const allowed = new Set([
      ...RELAY_RESPONSE_HEADERS.map(([, t]) => t.toLowerCase()),
      ...RELAY_CORS_HEADERS.map(([n]) => n.toLowerCase()),
      ...Object.keys(SECURITY_HEADERS).map((h) => h.toLowerCase()),
    ]);
    const extra = lowerNames(res.headers).filter((h) => !FRAMING.has(h) && !allowed.has(h));
    assert.deepEqual(extra, []);
    for (const dropped of ['set-cookie', 'x-leak', 'vary', 'x-request-id', 'access-control-allow-origin', 'strict-transport-security'])
      assert.equal(res.headers[dropped], undefined, dropped);
    for (const [, target] of RELAY_RESPONSE_HEADERS) assert.ok(res.headers[target.toLowerCase()], target);
  });

  test('echoes Access-Control-Allow-Origin only for the relay origins', async () => {
    const prod = await rawRequest(port, { path: '/api/x', headers: { Origin: 'https://mayaos.ru' } });
    assert.equal(prod.headers['access-control-allow-origin'], 'https://mayaos.ru');
    const local = await rawRequest(port, { path: '/api/x', headers: { Origin: 'http://127.0.0.1:8787' } });
    assert.equal(local.headers['access-control-allow-origin'], undefined);
  });

  test('path, method and header refusals answer as the relay does, without reaching upstream', async () => {
    received.length = 0;
    const bare = await rawRequest(port, { path: '/api' });
    assert.equal(received.at(-1).url, '/api/health');
    assert.equal(bare.status, 200);
    received.length = 0;
    const options = await rawRequest(port, { method: 'OPTIONS', path: '/api/ai/chat' });
    assert.equal(options.status, 204);
    const propfind = await rawRequest(port, { method: 'PROPFIND', path: '/api/ai/chat' });
    assert.equal(propfind.status, 405);
    assert.deepEqual(propfind.json, { message: 'Method not allowed' });
    const dots = await rawRequest(port, { path: '/api/a/%2e%2e/b' });
    assert.equal(dots.status, 400);
    assert.deepEqual(dots.json, { message: 'Invalid path' });
    const nul = await rawRequest(port, { path: '/api/a%00b' });
    assert.equal(nul.status, 400);
    const idem = await rawRequest(port, { path: '/api/x', headers: { 'Idempotency-Key': '' } });
    assert.equal(idem.status, 400);
    assert.deepEqual(idem.json, { error: { code: 'invalid_idempotency_key' } });
    assert.equal(received.length, 0);
  });

  test('HEAD and 304 carry no body; a body without a content type gets curl form encoding', async () => {
    const head = await rawRequest(port, { method: 'HEAD', path: '/api/x' });
    assert.equal(head.text, '');
    const notModified = await rawRequest(port, { path: '/api/not-modified' });
    assert.equal(notModified.status, 304);
    assert.equal(notModified.text, '');
    received.length = 0;
    await rawRequest(port, { method: 'POST', path: '/api/x', body: 'a=1' });
    assert.equal(received[0].headers['content-type'], 'application/x-www-form-urlencoded');
  });

  test('timeout and unreachable upstream → 502 with the relay body', async () => {
    const hang = await rawRequest(port, { path: '/api/hang' });
    assert.equal(hang.status, 502);
    assert.equal(hang.text, RELAY_UNAVAILABLE_BODY);
    const closed = http.createServer();
    await new Promise((r) => closed.listen(0, '127.0.0.1', r));
    const deadPort = closed.address().port;
    await new Promise((r) => closed.close(r));
    const dead = createDevServer({ root, api: `http://127.0.0.1:${deadPort}/api`, upstreamPorts: [String(deadPort)] });
    const { port: p } = await dead.listen(0);
    try {
      const res = await rawRequest(p, { path: '/api/health' });
      assert.equal(res.status, 502);
      assert.equal(res.text, RELAY_UNAVAILABLE_BODY);
      assert.match(res.headers['content-type'], /^application\/json/);
    } finally {
      await dead.close();
    }
  });

  test('/__dev/ does not exist in --api mode', async () => {
    const res = await rawRequest(port, { path: '/__dev/scenario' });
    assert.equal(res.status, 404);
  });
});

describe('--api refuses non-local upstreams', () => {
  test('assertLocalUpstream', () => {
    assert.equal(assertLocalUpstream('http://127.0.0.1:3310/api').hostname, '127.0.0.1');
    assert.equal(assertLocalUpstream('http://localhost:3310/api').hostname, 'localhost');
    for (const bad of ['https://mayaos.ru/api', 'https://maya.111.88.148.206.nip.io/api', 'http://10.0.0.2:3310/api', 'https://127.0.0.1:3310/api', 'http://127.0.0.1.nip.io/api', 'http://u:p@127.0.0.1/api', 'nope'])
      assert.throws(() => assertLocalUpstream(bad), /refused|must|not a URL/, bad);
  });

  test('assertLocalUpstream admits only the backend port: never the shared cluster 5432, the proof DB 55611, a default port or any other (integration finding)', () => {
    assert.equal(assertLocalUpstream('http://127.0.0.1:3310/api').port, '3310');
    for (const bad of ['http://127.0.0.1:5432/api', 'http://localhost:5432/', 'http://127.0.0.1:55611/api', 'http://127.0.0.1/api', 'http://localhost/api', 'http://127.0.0.1:3311/api', 'http://127.0.0.1:8787/api'])
      assert.throws(() => assertLocalUpstream(bad), /port/, bad);
    // A test's fake upstream is admitted only by naming its port; the two database ports never are.
    assert.equal(assertLocalUpstream('http://127.0.0.1:40123/api', { ports: ['40123'] }).port, '40123');
    for (const db of ['5432', '55611']) assert.throws(() => assertLocalUpstream(`http://127.0.0.1:${db}/api`, { ports: [db] }), /port/, db);
    assert.throws(() => createDevServer({ root: os.tmpdir(), api: 'http://127.0.0.1:5432/api' }), /port/);
  });

  test('the CLI refuses the shared cluster port before listening', () => {
    const run = spawnSync(process.execPath, [path.join(SH, 'dev', 'serve.mjs'), '--root=dist/web', '--port=0', '--api=http://127.0.0.1:5432/api'], { encoding: 'utf8', timeout: 10_000 });
    assert.equal(run.status, 2);
    assert.match(run.stderr, /port/);
    assert.doesNotMatch(run.stdout, /http:\/\/127\.0\.0\.1:/);
  });

  test('the CLI exits 2 before listening', () => {
    const run = spawnSync(process.execPath, [path.join(SH, 'dev', 'serve.mjs'), '--root=dist/web', '--port=0', '--api=https://mayaos.ru/api'], { encoding: 'utf8', timeout: 10_000 });
    assert.equal(run.status, 2);
    assert.match(run.stderr, /only 127\.0\.0\.1 or localhost|must be http/);
    assert.doesNotMatch(run.stdout, /http:\/\/127\.0\.0\.1:/);
  });
});

// ── 3. static files and the header/meta CSP split (D10) ────────────────────────────────────────

describe('static serving and CSP (D10)', () => {
  let dev;
  let port;
  let root;
  before(async () => {
    root = tempRoot();
    dev = createDevServer({ root, mock: { scenario: 'happy' } });
    ({ port } = await dev.listen(0));
  });
  after(async () => {
    await dev.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('header CSP carries frame-ancestors none; the other security headers are set', async () => {
    const res = await rawRequest(port, { path: '/' });
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-security-policy'], HEADER_CSP);
    assert.match(res.headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.equal(res.headers['x-frame-options'], 'DENY');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['referrer-policy'], 'no-referrer');
    assert.equal(res.headers['permissions-policy'], 'microphone=(self)');
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.deepEqual(cspSplitProblems(res.headers['content-security-policy'], res.text), []);
  });

  test('Trusted Types are required for script sinks in the header and the meta CSP (runtime fence behind the build gates)', () => {
    assert.ok(CSP_DIRECTIVES.includes("require-trusted-types-for 'script'"));
    assert.match(HEADER_CSP, /require-trusted-types-for 'script'/);
    assert.match(META_CSP, /require-trusted-types-for 'script'/);
    const page = (content) => `<meta http-equiv="Content-Security-Policy" content="${content}">`;
    assert.ok(cspSplitProblems(HEADER_CSP, page(META_CSP.replace("; require-trusted-types-for 'script'", ''))).length > 0, 'a meta copy without it is drift');
  });

  test('the split check refuses frame-ancestors, report-uri or sandbox in meta, and a drifted directive', () => {
    const page = (content) => `<meta http-equiv="Content-Security-Policy" content="${content}">`;
    assert.deepEqual(cspSplitProblems(HEADER_CSP, page(META_CSP)), []);
    assert.ok(cspSplitProblems(HEADER_CSP, page(HEADER_CSP)).includes('meta CSP carries frame-ancestors'));
    assert.ok(cspSplitProblems(HEADER_CSP, page(`${META_CSP}; report-uri /r`)).includes('meta CSP carries report-uri'));
    assert.ok(cspSplitProblems(HEADER_CSP, page(`${META_CSP}; sandbox`)).includes('meta CSP carries sandbox'));
    assert.ok(cspSplitProblems(HEADER_CSP, page(META_CSP.replace("img-src 'self' data:", "img-src *"))).some((p) => p.startsWith('meta img-src')));
    assert.deepEqual(cspSplitProblems(HEADER_CSP, page(META_CSP.replace("connect-src 'self'", "connect-src 'self' https://mayaos.ru"))), []);
    assert.ok(cspSplitProblems("default-src 'self'", page(META_CSP)).includes("header CSP lacks frame-ancestors 'none'"));
    assert.equal(metaCspOf('<meta charset="utf-8">').length, 0);
    assert.deepEqual(CSP_DIRECTIVES.join('; '), META_CSP);
  });

  test('entry/index.html meta CSP (S5) satisfies the split', (t) => {
    const file = path.join(SH, 'entry', 'index.html');
    if (!fs.existsSync(file)) return t.skip('entry/index.html NOT YET PRESENT (S5) — not a PASS');
    assert.deepEqual(cspSplitProblems(HEADER_CSP, fs.readFileSync(file, 'utf8')), []);
  });

  test('the built dist/web/index.html served with the header CSP satisfies the split', async (t) => {
    const built = path.join(SH, 'dist', 'web', 'index.html');
    if (!fs.existsSync(built)) return t.skip('dist/web/index.html NOT YET BUILT (entry/ absent until S5) — not a PASS');
    const served = createDevServer({ root: path.join(SH, 'dist', 'web'), mock: { scenario: 'happy' } });
    const { port: p } = await served.listen(0);
    try {
      const res = await rawRequest(p, { path: '/' });
      assert.equal(res.status, 200);
      assert.deepEqual(cspSplitProblems(res.headers['content-security-policy'], res.text), []);
    } finally {
      await served.close();
    }
  });

  test('traversal 400, asset miss 404, extension-less fallback, MIME types, immutable module paths', async () => {
    for (const bad of ['/%2e%2e/etc/passwd', '/..%2f..%2fetc', '/../etc/passwd', '/a%5c..%5cb.js', '/%00.js'])
      assert.equal((await rawRequest(port, { path: bad })).status, 400, bad);
    assert.equal((await rawRequest(port, { path: '/missing.js' })).status, 404);
    const fallback = await rawRequest(port, { path: '/shell/route' });
    assert.equal(fallback.status, 200);
    assert.match(fallback.headers['content-type'], /^text\/html/);
    const mod = await rawRequest(port, { path: '/m/0123456789abcdef/entry/main.js' });
    assert.match(mod.headers['content-type'], /^text\/javascript/);
    assert.match(mod.headers['cache-control'], /immutable/);
    assert.match((await rawRequest(port, { path: '/styles.css' })).headers['content-type'], /^text\/css/);
  });

  test('/__dev/ routes exist only under --mock and never inside dist/web', async () => {
    const scenario = await rawRequest(port, { path: '/__dev/scenario' });
    assert.equal(scenario.status, 200);
    assert.equal(scenario.json.scenario, 'happy');
    const web = path.join(SH, 'dist', 'web');
    const walk = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : []);
    for (const file of walk(web)) {
      assert.doesNotMatch(path.relative(web, file), /__dev|fixture-host|h7-parity|scenarios/);
      if (/\.(js|html|css)$/.test(file)) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /__dev/, file);
    }
  });
});

// ── 4. DTO enforcement (D6), including LoginDto ────────────────────────────────────────────────

describe('mocks enforce the real DTOs', () => {
  test('recorded 400 bodies (observed on the local binary) for AiCoreChatDto and LoginDto', () => {
    const extra = validateDto({ surface: 'web', requestId: 'abcdefgh', messages: [{ role: 'user', content: 'x' }], tenant: 'x' }, AI_CORE_CHAT_DTO);
    assert.deepEqual(extra, { message: 'property tenant should not exist', error: { code: 'validation', message: 'property tenant should not exist', field: 'tenant', details: [{ field: 'tenant', message: 'property tenant should not exist' }] } });
    const long = validateDto({ surface: 'web', requestId: 'abcdefgh', messages: [{ role: 'user', content: 'x'.repeat(2001) }] }, AI_CORE_CHAT_DTO);
    assert.equal(long.error.field, 'messages.0.content');
    assert.equal(long.message, 'content must be shorter than or equal to 2000 characters');
    assert.equal(validateDto({ surface: 'web', requestId: 'abcdefgh', messages: Array.from({ length: 13 }, () => ({ role: 'user', content: 'x' })) }, AI_CORE_CHAT_DTO).message, 'messages must contain no more than 12 elements');
    assert.equal(validateDto({ surface: 'voice', requestId: 'abcdefgh', messages: [{ role: 'user', content: 'x' }] }, AI_CORE_CHAT_DTO), null, 'the DTO admits voice; the shell bans it at build time');
    assert.equal(validateDto({ surface: 'web', requestId: 'short', messages: [{ role: 'user', content: 'x' }] }, AI_CORE_CHAT_DTO).message, 'requestId must match /^[A-Za-z0-9_-]{8,128}$/ regular expression');
    const login = validateDto({ tenantSlug: 'x', email: 'nope', password: '1' }, LOGIN_DTO);
    assert.deepEqual(login.error.details, [
      { field: 'email', message: 'email must be an email' },
      { field: 'password', message: 'password must be longer than or equal to 8 characters' },
    ]);
    assert.equal(validateDto({ tenantSlug: '', email: 'a@b.ru', password: '12345678' }, LOGIN_DTO), null, 'an empty tenantSlug passes the DTO and routes to the platform-owner path');
    assert.equal(validateDto({ email: 'a@b.ru', code: '12a' }, VERIFY_EMAIL_AUTH_DTO).message, 'code must match /^\\d+$/ regular expression');
    assert.equal(validateDto({ refreshToken: 'x' }, REFRESH_SESSION_DTO).message, 'refreshToken must be longer than or equal to 64 characters');
    assert.equal(validateDto({}, START_EMAIL_AUTH_DTO).message, 'email must be shorter than or equal to 254 characters');
  });

  test('length checks count as class-validator does (code points, variation selectors excluded)', () => {
    const base = { surface: 'web', requestId: 'abcdefgh' };
    assert.equal(validateDto({ ...base, messages: [{ role: 'user', content: 'x'.repeat(1999) + '\u{1F600}' }] }, AI_CORE_CHAT_DTO), null, '2001 UTF-16 units, 2000 code points');
    assert.notEqual(validateDto({ ...base, messages: [{ role: 'user', content: 'x'.repeat(2000) + '\u{1F600}' }] }, AI_CORE_CHAT_DTO), null);
  });

  test('JSON parser failures match body-parser strict mode', () => {
    assert.equal(jsonParseFailure('{"email":'), 'Unexpected end of JSON input');
    assert.equal(jsonParseFailure('null'), 'Unexpected token \'n\', "null" is not valid JSON');
    assert.equal(jsonParseFailure('"x"'), 'Unexpected token \'"\', ""x"" is not valid JSON');
    assert.equal(jsonParseFailure('{"a":1}'), null);
  });

  test('parity with the backend ValidationPipe (dist, read-only) over a corpus', (t) => {
    const pipeFile = path.join(BE, 'dist', 'src', 'bootstrap', 'configure-http-app.js');
    if (!fs.existsSync(pipeFile)) return t.skip('maya-saas-backend/dist is not built here — parity not exercised (not a PASS)');
    const requireBE = createRequire(path.join(BE, 'package.json'));
    requireBE('reflect-metadata');
    const { configureHttpApp } = requireBE(pipeFile);
    let pipe;
    configureHttpApp({ use() {}, setGlobalPrefix() {}, useGlobalPipes(p) { pipe = p; } });
    const dto = (rel, name) => requireBE(path.join(BE, 'dist', 'src', rel))[name];
    const classes = new Map([
      [AI_CORE_CHAT_DTO, dto('ai-tools/dto/ai-core-chat.dto.js', 'AiCoreChatDto')],
      [LOGIN_DTO, dto('auth/dto/login.dto.js', 'LoginDto')],
      [START_EMAIL_AUTH_DTO, dto('auth/dto/start-email-auth.dto.js', 'StartEmailAuthDto')],
      [VERIFY_EMAIL_AUTH_DTO, dto('auth/dto/verify-email-auth.dto.js', 'VerifyEmailAuthDto')],
      [REFRESH_SESSION_DTO, dto('auth/dto/refresh-session.dto.js', 'RefreshSessionDto')],
    ]);
    const ok = { surface: 'web', requestId: 'abcdefgh' };
    const m = (content, role = 'user') => ({ role, content });
    const corpus = [
      [AI_CORE_CHAT_DTO, { ...ok, messages: [m('x')] }],
      [AI_CORE_CHAT_DTO, {}],
      [AI_CORE_CHAT_DTO, { ...ok, messages: [m('x')], tenant: 'x' }],
      [AI_CORE_CHAT_DTO, { ...ok, messages: [m('x'.repeat(2001))] }],
      [AI_CORE_CHAT_DTO, { ...ok, messages: [m('x'.repeat(1999) + '\u{1F600}')] }],
      [AI_CORE_CHAT_DTO, { ...ok, messages: [m('x'.repeat(2000) + '️')] }],
      [AI_CORE_CHAT_DTO, { ...ok, messages: [m('x'.repeat(2000) + '\uD83D')] }],
      [AI_CORE_CHAT_DTO, { ...ok, messages: Array.from({ length: 13 }, () => m('x')) }],
      [AI_CORE_CHAT_DTO, { ...ok, messages: [] }],
      [AI_CORE_CHAT_DTO, { ...ok, messages: [m('', 'system')] }],
      [AI_CORE_CHAT_DTO, { ...ok, messages: [{ role: 'user', content: 'a', name: 'x' }] }],
      [AI_CORE_CHAT_DTO, { surface: 'desktop', requestId: 'ab', messages: 'x' }],
      [AI_CORE_CHAT_DTO, { ...ok, messages: null }],
      [AI_CORE_CHAT_DTO, { ...ok, messages: {} }],
      [AI_CORE_CHAT_DTO, { ...ok, messages: { role: 'user', content: 'a' } }],
      [AI_CORE_CHAT_DTO, { ...ok, messages: [null, 'x', m('a')] }],
      [AI_CORE_CHAT_DTO, { ...ok, messages: [m(5)] }],
      [AI_CORE_CHAT_DTO, { ...ok, audience: 'owner', messages: [m('a')] }],
      [AI_CORE_CHAT_DTO, { ...ok, audience: 'boss', messages: [m('a')] }],
      [AI_CORE_CHAT_DTO, { zz: 1, ...ok, aa: 2, messages: [{ x: 1, role: 'user', content: 'a', y: 2 }, m('', 'bot')] }],
      [AI_CORE_CHAT_DTO, { surface: 1, requestId: 12345678, messages: [m('a')] }],
      [AI_CORE_CHAT_DTO, [1]],
      [LOGIN_DTO, { tenantSlug: 'shell', email: 'a@b.ru', password: '12345678' }],
      [LOGIN_DTO, {}],
      [LOGIN_DTO, { tenantSlug: 5, email: 'nope', password: 12345678 }],
      [LOGIN_DTO, { tenantSlug: 's', email: 'a@b.ru', password: '12345678', remember: true }],
      [LOGIN_DTO, { tenantSlug: '', email: 'a@b.ru', password: '12345678' }],
      [LOGIN_DTO, { tenantSlug: null, email: ' a@b.ru', password: '1234567' }],
      [LOGIN_DTO, { tenantSlug: 's', email: 'a@b.ru', password: '\u{1F600}'.repeat(7) + 'a' }],
      [START_EMAIL_AUTH_DTO, {}],
      [START_EMAIL_AUTH_DTO, { email: `${'a'.repeat(250)}@b.ru` }],
      [START_EMAIL_AUTH_DTO, { email: 'anna@example.test', tenantSlug: 'x', extra: 1 }],
      [VERIFY_EMAIL_AUTH_DTO, {}],
      [VERIFY_EMAIL_AUTH_DTO, { email: 'a@b.ru', code: '12a' }],
      [VERIFY_EMAIL_AUTH_DTO, { email: 'a@b.ru', code: '123456789' }],
      [VERIFY_EMAIL_AUTH_DTO, { email: 'a@b.ru', code: '246810', tenantSlug: 'severny-veter' }],
      [REFRESH_SESSION_DTO, {}],
      [REFRESH_SESSION_DTO, { refreshToken: 'x' }],
      [REFRESH_SESSION_DTO, { refreshToken: 'x'.repeat(513) }],
      [REFRESH_SESSION_DTO, { refreshToken: 'x'.repeat(64) }],
    ];
    return (async () => {
      let compared = 0;
      for (const [schema, body] of corpus) {
        let real = null;
        try {
          await pipe.transform(structuredClone(body), { type: 'body', metatype: classes.get(schema) });
        } catch (error) {
          real = error.getResponse();
        }
        assert.deepEqual(validateDto(structuredClone(body), schema), real, `${schema.name} ${JSON.stringify(body).slice(0, 120)}`);
        compared += 1;
      }
      assert.equal(compared, corpus.length);
    })();
  });
});

// ── 5. the mock API through the relay: flows, scenarios, sign-in rows ──────────────────────────

describe('mock API through the relay (--mock)', () => {
  let dev;
  let port;
  let root;
  before(async () => {
    root = tempRoot();
    dev = createDevServer({ root, mock: { scenario: 'happy' }, upstreamTimeoutMs: 400 });
    ({ port } = await dev.listen(0));
  });
  after(async () => {
    await dev.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const scenario = async (name) => {
    const res = await postJson(port, '/__dev/scenario', { name });
    assert.equal(res.status, 200, JSON.stringify(res.json));
  };
  const reset = async (name = 'happy') => {
    await postJson(port, '/__dev/reset', {});
    await scenario(name);
  };
  const login = async (slug = MOCK_TENANTS[0].slug) => postJson(port, '/api/auth/login', { tenantSlug: slug, email: MOCK_ACCOUNT.email, password: MOCK_ACCOUNT.password });
  const chat = (token, requestId, messages = [{ role: 'user', content: 'Привет' }]) =>
    postJson(port, '/api/ai/chat', { surface: 'web', requestId, messages }, { Authorization: `Bearer ${token}` });

  test('every fixture cites an existing backend source and fills without a missing placeholder', () => {
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    const files = walk(API_FIXTURES_DIR);
    assert.ok(files.length >= 40, `${files.length} fixtures`);
    for (const file of files) {
      const fixture = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.ok(Array.isArray(fixture.source) && fixture.source.length, file);
      for (const cite of fixture.source) {
        const m = /^(maya-saas-backend\/[^:]+):(\d+)(?:-\d+)? @ [0-9a-f]{8}$/.exec(cite);
        if (m) assert.ok(fs.existsSync(path.join(CANON, m[1])), `${file}: ${m[1]}`);
      }
      assert.equal(typeof fixture.status, 'number');
    }
    const long = loadApiFixture('ai/chat.201.long-reply.json').body.reply;
    assert.equal(long.length, 3500);
    assert.ok(long.charCodeAt(1999) >= 0xd800 && long.charCodeAt(1999) <= 0xdbff, 'unit 1999 is a high surrogate');
  });

  test('happy: password sign-in with a business address, turn, refresh rotation, logout', async () => {
    await reset();
    const slugless = await postJson(port, '/api/auth/login', { email: MOCK_ACCOUNT.email, password: MOCK_ACCOUNT.password });
    assert.equal(slugless.status, 401, 'a slug-less login is the platform-owner path (V2-6)');
    const signed = await login();
    assert.equal(signed.status, 201);
    assert.equal(signed.json.user.tenant.name, MOCK_TENANTS[0].name, 'login nests the tenant at user.tenant');
    assert.equal(signed.json.tenant, undefined, 'login has no top-level tenant');
    const turn = await chat(signed.json.access_token, 'req-happy-0001');
    assert.equal(turn.status, 201);
    assert.equal(turn.json.request_id, 'req-happy-0001');
    assert.equal(turn.json.action, null);
    const refreshed = await postJson(port, '/api/auth/refresh', { refreshToken: signed.json.refresh_token });
    assert.equal(refreshed.status, 201);
    assert.deepEqual(Object.keys(refreshed.json).sort(), ['access_token', 'expires_in', 'refresh_expires_at', 'refresh_token', 'session', 'token_type']);
    const reused = await postJson(port, '/api/auth/refresh', { refreshToken: signed.json.refresh_token });
    assert.equal(reused.json.error.code, 'refresh_token_reused');
    const unauth = await rawRequest(port, { method: 'POST', path: '/api/ai/chat', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.deepEqual(unauth.json, { message: 'Unauthorized', statusCode: 401 }, 'guards run before validation');
  });

  test('happy: email OTP with one business; select_business with two and the re-verify', async () => {
    await reset();
    const start = await postJson(port, '/api/auth/email/start', { email: MOCK_ACCOUNT.email });
    assert.equal(start.status, 201);
    assert.equal(start.json.next_step, 'verify_email_code');
    const wrong = await postJson(port, '/api/auth/email/verify', { email: MOCK_ACCOUNT.email, code: '000000' });
    assert.equal(wrong.json.error.code, 'email_code_invalid');
    const verified = await postJson(port, '/api/auth/email/verify', { email: MOCK_ACCOUNT.email, code: start.json.debug_code });
    assert.equal(verified.status, 201);
    assert.equal(verified.json.tenant.name, MOCK_TENANTS[0].name, 'email verify carries a top-level tenant');
    await reset('select_business');
    const start2 = await postJson(port, '/api/auth/email/start', { email: MOCK_ACCOUNT.email });
    const select = await postJson(port, '/api/auth/email/verify', { email: MOCK_ACCOUNT.email, code: start2.json.debug_code });
    assert.equal(select.json.next_step, 'select_business');
    assert.deepEqual(select.json.businesses.map((b) => Object.keys(b).sort()), [['name', 'role', 'slug'], ['name', 'role', 'slug']]);
    const reverify = await postJson(port, '/api/auth/email/verify', { email: MOCK_ACCOUNT.email, code: start2.json.debug_code, tenantSlug: select.json.businesses[1].slug });
    assert.equal(reverify.status, 201);
    assert.equal(reverify.json.tenant.slug, MOCK_TENANTS[1].slug);
  });

  test('DTO violations get the backend 400 body through the relay; the body parser answers 413 and syntax 400s', async () => {
    await reset();
    const token = (await login()).json.access_token;
    const bad = await chat(token, 'req-bad-0001', [{ role: 'user', content: 'x' }]).then(() =>
      postJson(port, '/api/ai/chat', { surface: 'web', requestId: 'req-bad-0002', messages: [{ role: 'user', content: 'x' }], audience: 'owner', tenant: 'x' }, { Authorization: `Bearer ${token}` }),
    );
    assert.equal(bad.status, 400);
    assert.equal(bad.json.message, 'property tenant should not exist');
    const shortPassword = await postJson(port, '/api/auth/login', { tenantSlug: 'severny-veter', email: MOCK_ACCOUNT.email, password: '1234567' });
    assert.equal(shortPassword.status, 400);
    assert.equal(shortPassword.json.error.field, 'password');
    const big = await postJson(port, '/api/auth/login', JSON.stringify({ email: 'a@b.ru', password: 'x'.repeat(110_000) }));
    assert.deepEqual([big.status, big.json], [413, { statusCode: 413, message: 'request entity too large' }]);
    const syntax = await postJson(port, '/api/auth/login', '{"email":');
    assert.deepEqual(syntax.json, { message: 'Unexpected end of JSON input', error: 'Bad Request', statusCode: 400 });
    const notFound = await postJson(port, '/api/nope', {});
    assert.deepEqual(notFound.json, { message: 'Cannot POST /api/nope', error: 'Not Found', statusCode: 404 });
  });

  test('transcribe: JSON {audioBase64} ≤ 2 MB, the WAV checks, and the mock transcript', async () => {
    await reset();
    const token = (await login()).json.access_token;
    const auth = { Authorization: `Bearer ${token}` };
    const header = Buffer.alloc(44);
    header.write('RIFF', 0, 'ascii');
    header.writeUInt32LE(36 + 3200, 4);
    header.write('WAVEfmt ', 8, 'ascii');
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(16000, 24);
    header.writeUInt32LE(32000, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36, 'ascii');
    header.writeUInt32LE(3200, 40);
    const wav = Buffer.concat([header, Buffer.alloc(3200)]);
    const ok = await postJson(port, '/api/ai/transcribe', { audioBase64: `data:audio/wav;base64,${wav.toString('base64')}` }, auth);
    assert.deepEqual([ok.status, ok.json], [201, { transcript: MOCK_TRANSCRIPT }]);
    const stereo = Buffer.from(wav);
    stereo.writeUInt16LE(2, 22);
    const refused = await postJson(port, '/api/ai/transcribe', { audioBase64: stereo.toString('base64') }, auth);
    assert.deepEqual(refused.json, { message: 'Нужна запись WAV: 16 кГц, mono, PCM16.', error: { code: 'invalid_speech_audio' } });
    const tooBig = await postJson(port, '/api/ai/transcribe', JSON.stringify({ audioBase64: 'A'.repeat(2 * 1024 * 1024 + 10) }), auth);
    assert.equal(tooBig.status, 413);
    await scenario('transcribe_provider_unavailable');
    const unavailable = await postJson(port, '/api/ai/transcribe', { audioBase64: wav.toString('base64') }, auth);
    assert.equal(unavailable.json.error.code, 'speech_provider_unavailable');
  });

  test('approval_required: reply plus action.status and approval; the next turn is an ordinary reply (V2-5)', async () => {
    await reset('approval_required');
    const token = (await login()).json.access_token;
    const first = await chat(token, 'req-appr-0001', [{ role: 'user', content: 'Запиши меня на стрижку завтра в 12:00' }]);
    assert.equal(first.status, 201);
    assert.equal(first.json.reply, 'Действие подготовлено и ждёт вашего подтверждения.');
    assert.equal(first.json.action.status, 'approval_required');
    assert.equal(first.json.action.approval.tool_name, 'appointments.own.create');
    assert.equal(first.json.request_id, 'req-appr-0001');
    const second = await chat(token, 'req-appr-0002', [
      { role: 'user', content: 'Запиши меня на стрижку завтра в 12:00' },
      { role: 'assistant', content: first.json.reply },
      { role: 'user', content: 'Спасибо' },
    ]);
    assert.equal(second.status, 201);
    assert.equal(second.json.action, null);
  });

  test('long_reply: untruncated history is refused, the 2 000-unit cut at a code-point boundary is admitted (D6)', async () => {
    await reset('long_reply');
    const token = (await login()).json.access_token;
    const first = await chat(token, 'req-long-0001');
    assert.equal(first.json.reply.length, 3500);
    const untruncated = await chat(token, 'req-long-0002', [{ role: 'user', content: 'Привет' }, { role: 'assistant', content: first.json.reply }, { role: 'user', content: 'Дальше' }]);
    assert.equal(untruncated.status, 400);
    assert.equal(untruncated.json.error.field, 'messages.1.content');
    let cut = first.json.reply.slice(0, 2000);
    if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
    assert.equal(cut.length, 1999, 'the fixture puts a surrogate pair across the boundary');
    const truncated = await chat(token, 'req-long-0003', [{ role: 'user', content: 'Привет' }, { role: 'assistant', content: cut }, { role: 'user', content: 'Дальше' }]);
    assert.equal(truncated.status, 201);
  });

  test('turn failures: 502 and 503 then the same-requestId retry succeeds; 429 keeps Retry-After; 402, 403, 409, 400', async () => {
    await reset('chat_502');
    const token = (await login()).json.access_token;
    const relayFail = await chat(token, 'req-502-0001');
    assert.deepEqual([relayFail.status, relayFail.text], [502, RELAY_UNAVAILABLE_BODY]);
    assert.equal((await chat(token, 'req-502-0001')).status, 201);
    await scenario('chat_503_model_failure');
    assert.equal((await chat(token, 'req-503-0001')).json.error.code, 'ai_model_tool_step_limit');
    assert.equal((await chat(token, 'req-503-0001')).status, 201);
    await scenario('chat_429');
    const limited = await chat(token, 'req-429-0001');
    assert.deepEqual([limited.status, limited.headers['retry-after'], limited.json.error.code], [429, '20', 'auth_rate_limited']);
    await scenario('chat_402');
    const invalidButGuarded = await postJson(port, '/api/ai/chat', {}, { Authorization: `Bearer ${token}` });
    assert.equal(invalidButGuarded.status, 402, 'the subscription guard answers before validation');
    assert.equal(invalidButGuarded.json.error.code, 'subscription_required');
    await scenario('chat_403_feature_locked');
    assert.equal((await chat(token, 'req-403-0001')).json.error.code, 'feature_locked');
    await scenario('chat_409_conflict');
    const conflict = await chat(token, 'req-409-0001');
    assert.deepEqual([conflict.status, conflict.json.error.code], [409, 'ai_approval_idempotency_conflict']);
    assert.equal((await chat(token, 'req-409-0001')).status, 409, 'terminal for that requestId');
    await scenario('chat_400_validation');
    assert.equal((await chat(token, 'req-400-0001')).json.error.code, 'validation');
    await scenario('chat_hang');
    assert.equal((await chat(token, 'req-hang-0001')).status, 502, 'the relay timeout answers 502');
  });

  test('access_rejected_once: parallel 401s, one refresh, then a second refresh with the rotated token is reuse', async () => {
    await reset('access_rejected_once');
    const signed = (await login()).json;
    const [a, b] = await Promise.all([chat(signed.access_token, 'req-par-0001'), chat(signed.access_token, 'req-par-0002')]);
    assert.deepEqual([a.status, b.status], [401, 401]);
    const refreshed = await postJson(port, '/api/auth/refresh', { refreshToken: signed.refresh_token });
    assert.equal(refreshed.status, 201);
    assert.equal((await chat(refreshed.json.access_token, 'req-par-0001')).status, 201);
    const second = await postJson(port, '/api/auth/refresh', { refreshToken: signed.refresh_token });
    assert.equal(second.json.error.code, 'refresh_token_reused');
    const log = await rawRequest(port, { path: '/__dev/requests' });
    assert.equal(log.json.requests.filter((r) => r.path === '/auth/refresh').length, 2);
    for (const r of log.json.requests) assert.ok(r.headerNames.every((h) => ['accept', 'authorization', 'content-type', 'user-agent', 'idempotency-key', 'if-none-match', 'x-session-token', 'x-telegram-initdata'].includes(h)), r.headerNames.join());
  });

  test('refresh terminal codes: reused, invalid, expired, revoked', async () => {
    for (const [name, code] of [['refresh_token_reused', 'refresh_token_reused'], ['refresh_token_invalid', 'refresh_token_invalid'], ['session_expired', 'session_expired'], ['session_revoked', 'session_revoked']]) {
      await reset();
      const signed = (await login()).json;
      await scenario(name);
      assert.equal((await chat(signed.access_token, 'req-rt-00001')).status, 401, name);
      const refresh = await postJson(port, '/api/auth/refresh', { refreshToken: signed.refresh_token });
      assert.deepEqual([refresh.status, refresh.json.error.code], [401, code], name);
    }
  });

  test('one scenario per §1.4 sign-in failure row, each mapped to a frozen SignInFailure state (V2-16)', async () => {
    const types = fs.readFileSync(path.join(SH, 'src', 'net', 'types.ts'), 'utf8');
    const signInUnion = /export type SignInFailure =([\s\S]*?);\n/.exec(types)[1];
    const chatUnion = /export type ChatFailure =([\s\S]*?);\n/.exec(types)[1];
    assert.deepEqual(SIGN_IN_FAILURE_ROWS.map((r) => r.row), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    for (const row of SIGN_IN_FAILURE_ROWS) {
      if (row.state.startsWith('chat:')) assert.match(chatUnion, new RegExp(`reason: '${row.state.slice(5)}'`), row.state);
      else assert.match(signInUnion, new RegExp(`state: '${row.state}'`), row.state);
      for (const s of row.scenarios) assert.equal(SCENARIOS[s].signInRow, row.row, s);
    }
    const expectations = {
      signin_rate_limited: ['/api/auth/login', 429, 'auth_rate_limited'],
      signin_code_attempts_exhausted: ['/api/auth/email/verify', 429, 'email_too_many_attempts'],
      signin_email_login_unavailable: ['/api/auth/email/start', 503, 'email_login_unavailable'],
      signin_email_delivery_unavailable: ['/api/auth/email/start', 503, 'email_delivery_unavailable'],
      signin_email_delivery_failed: ['/api/auth/email/start', 503, 'email_delivery_failed'],
      signin_code_invalid: ['/api/auth/email/verify', 400, 'email_code_invalid'],
      signin_code_expired: ['/api/auth/email/verify', 400, 'email_code_expired'],
      signin_code_missing: ['/api/auth/email/verify', 400, 'email_code_missing'],
      signin_credentials_invalid: ['/api/auth/login', 401, null],
      signin_account_unavailable: ['/api/auth/login', 403, null],
      signin_tenant_not_accepting: ['/api/auth/login', 403, null],
      signin_field_invalid: ['/api/auth/login', 400, 'validation'],
      signin_no_connection: ['/api/auth/login', 502, null],
      signin_unknown_business: ['/api/auth/login', 404, null],
    };
    const bodies = {
      '/api/auth/login': { tenantSlug: 'severny-veter', email: MOCK_ACCOUNT.email, password: MOCK_ACCOUNT.password },
      '/api/auth/email/start': { email: MOCK_ACCOUNT.email },
      '/api/auth/email/verify': { email: MOCK_ACCOUNT.email, code: MOCK_ACCOUNT.debugCode },
    };
    for (const [name, [endpoint, status, code]] of Object.entries(expectations)) {
      await reset(name);
      if (endpoint === '/api/auth/email/verify') await postJson(port, '/api/auth/email/start', { email: MOCK_ACCOUNT.email });
      const res = await postJson(port, endpoint, bodies[endpoint]);
      assert.equal(res.status, status, `${name}: ${res.text}`);
      if (code) assert.equal(res.json.error.code, code, name);
      if (status === 429 && code === 'auth_rate_limited') assert.equal(res.headers['retry-after'], '42');
    }
    // row 6 is reached only through the select_business re-verify
    await reset('signin_email_not_linked');
    await postJson(port, '/api/auth/email/start', { email: MOCK_ACCOUNT.email });
    const select = await postJson(port, '/api/auth/email/verify', bodies['/api/auth/email/verify']);
    assert.equal(select.json.next_step, 'select_business');
    const notLinked = await postJson(port, '/api/auth/email/verify', { ...bodies['/api/auth/email/verify'], tenantSlug: MOCK_TENANTS[1].slug });
    assert.deepEqual([notLinked.status, notLinked.json.error.code], [401, 'email_login_invalid']);
    // row 11
    await reset('chat_tenant_required');
    const token = (await login()).json.access_token;
    const tenantRequired = await chat(token, 'req-tr-00001');
    assert.deepEqual([tenantRequired.status, tenantRequired.json.error.code], [403, 'tenant_required']);
  });

  test('reflow and envelope scenarios; the dev pages and the emitted-file descriptor', async () => {
    await reset('unbroken_token');
    const token = (await login()).json.access_token;
    assert.match((await chat(token, 'req-unbr-0001')).json.reply, /Z{200}/);
    await scenario('chat_with_envelopes');
    const withEnvelopes = await chat(token, 'req-env-00001');
    assert.equal(withEnvelopes.status, 201);
    assert.ok(Array.isArray(withEnvelopes.json.envelopes));
    const host = await rawRequest(port, { path: '/__dev/fixture-host.html' });
    assert.equal(host.status, 200);
    assert.equal(host.headers['content-security-policy'], HEADER_CSP);
    assert.deepEqual(cspSplitProblems(host.headers['content-security-policy'], host.text), []);
    const web = await rawRequest(port, { path: '/__dev/web.json' });
    assert.deepEqual([web.json.modulePath, web.json.files, web.json.index, web.json.styles], ['m/0123456789abcdef/', ['entry/main.js'], true, true]);
    assert.equal((await rawRequest(port, { path: '/__dev/serve.mjs' })).status, 404, 'only the listed dev pages are served');
    assert.equal((await rawRequest(port, { path: '/__dev/fixtures/../scenarios.mjs' })).status, 400);
  });

  test('scenario switching refuses unknown names; every scenario is described', async () => {
    const res = await postJson(port, '/__dev/scenario', { name: 'no_such' });
    assert.equal(res.status, 400);
    for (const [name, def] of Object.entries(SCENARIOS)) assert.ok(def.description.length > 10, name);
    const listed = await rawRequest(port, { path: '/__dev/scenario' });
    assert.deepEqual(Object.keys(listed.json.scenarios).sort(), Object.keys(SCENARIOS).sort());
  });
});
