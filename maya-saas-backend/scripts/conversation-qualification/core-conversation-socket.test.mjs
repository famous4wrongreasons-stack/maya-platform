// Authored local mechanics only. No model, credentials, TCP listener or paid
// traffic. Root executes these finite Unix socket tests in the serial slot.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  assertCoreSocket,
  socketRequest,
} from './core-conversation-socket.mjs';

function fixture(t) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'c9sock-')),
  );
  const directory = path.join(root, 'channel');
  fs.mkdirSync(directory);
  fs.chmodSync(directory, 0o2710);
  const target = {
    brokerUid: process.getuid(),
    runnerUid: process.getuid() + 1,
    brokerSocket: {
      path: path.join(directory, 'b.sock'),
      gid: fs.lstatSync(directory).gid,
    },
  };
  const servers = [];
  t.after(async () => {
    for (const server of servers) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    root,
    directory,
    target,
    async serve(handler) {
      assertCoreSocket(target, { beforeListen: true });
      const server = http.createServer((req, res) => {
        res.on('error', () => {});
        handler(req, res);
      });
      servers.push(server);
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(target.brokerSocket.path, resolve);
      });
      fs.chmodSync(target.brokerSocket.path, 0o660);
      assertCoreSocket(target);
      return server;
    },
  };
}
const denied = (fn) =>
  assert.throws(fn, { message: 'core_socket_metadata_refused' });

test('fresh direct parent admits only an absent socket, without creating it', (t) => {
  const f = fixture(t);
  assertCoreSocket(f.target, { beforeListen: true });
  assert.equal(fs.existsSync(f.target.brokerSocket.path), false);
  denied(() => assertCoreSocket(f.target));
  fs.writeFileSync(f.target.brokerSocket.path, 'SYNTHETIC_NOT_SOCKET', {
    mode: 0o660,
  });
  denied(() => assertCoreSocket(f.target));
  denied(() => assertCoreSocket(f.target, { beforeListen: true }));
  assert.equal(
    fs.readFileSync(f.target.brokerSocket.path, 'utf8'),
    'SYNTHETIC_NOT_SOCKET',
  );
});
test('parent permission, owner, group, canonical path and reader UID are exact', (t) => {
  const f = fixture(t);
  for (const mode of [0o700, 0o710, 0o2750, 0o2770, 0o2711, 0o3710]) {
    fs.chmodSync(f.directory, mode);
    denied(() => assertCoreSocket(f.target, { beforeListen: true }));
  }
  fs.chmodSync(f.directory, 0o2710);
  denied(() =>
    assertCoreSocket(
      {
        ...f.target,
        brokerUid: f.target.brokerUid + 2,
        runnerUid: process.getuid(),
      },
      { beforeListen: true },
    ),
  );
  denied(() =>
    assertCoreSocket(
      {
        ...f.target,
        brokerSocket: {
          ...f.target.brokerSocket,
          gid: f.target.brokerSocket.gid + 1,
        },
      },
      { beforeListen: true },
    ),
  );
  fs.symlinkSync(f.directory, path.join(f.root, 'alias'));
  denied(() =>
    assertCoreSocket(
      {
        ...f.target,
        brokerSocket: {
          ...f.target.brokerSocket,
          path: path.join(f.root, 'alias', 'b.sock'),
        },
      },
      { beforeListen: true },
    ),
  );
  for (const file of [
    'relative.sock',
    f.directory + '/./b.sock',
    f.directory + '/b.sock\n',
  ])
    denied(() =>
      assertCoreSocket(
        { ...f.target, brokerSocket: { ...f.target.brokerSocket, path: file } },
        { beforeListen: true },
      ),
    );
  t.mock.method(process, 'getuid', () => f.target.runnerUid + 1);
  denied(() => assertCoreSocket(f.target, { beforeListen: true }));
});
test('existing socket refuses restart and requires exact socket mode and ownership', async (t) => {
  const f = fixture(t);
  await f.serve((_req, res) => res.end('ok'));
  denied(() => assertCoreSocket(f.target, { beforeListen: true }));
  fs.chmodSync(f.target.brokerSocket.path, 0o666);
  denied(() => assertCoreSocket(f.target));
  fs.chmodSync(f.target.brokerSocket.path, 0o660);
  const lstat = fs.lstatSync.bind(fs),
    stat = lstat(f.target.brokerSocket.path);
  for (const changed of [{ uid: stat.uid + 1 }, { gid: stat.gid + 1 }]) {
    const mock = t.mock.method(fs, 'lstatSync', (file, ...args) =>
      file === f.target.brokerSocket.path
        ? Object.assign(
            Object.create(Object.getPrototypeOf(stat)),
            stat,
            changed,
          )
        : lstat(file, ...args),
    );
    denied(() => assertCoreSocket(f.target));
    mock.mock.restore();
  }
  t.mock.method(process, 'getuid', () => f.target.runnerUid);
  assertCoreSocket(f.target); // Metadata permission; the OS still owns actual access.
});
test('a socket symlink is refused even when the target socket is correctly owned', async (t) => {
  const f = fixture(t);
  await f.serve((_req, res) => res.end('ok'));
  const link = path.join(f.directory, 'link.sock');
  fs.symlinkSync(f.target.brokerSocket.path, link);
  denied(() =>
    assertCoreSocket({
      ...f.target,
      brokerSocket: { ...f.target.brokerSocket, path: link },
    }),
  );
});
test('POST preserves exact serialized UTF8 bytes and status; GET and finish stay on the same Unix path', async (t) => {
  const f = fixture(t),
    seen = [];
  await f.serve((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      seen.push({
        method: req.method,
        url: req.url,
        body: Buffer.concat(chunks),
        length: req.headers['content-length'],
        marker: req.headers['x-candidate-manifest'],
      });
      res.writeHead(req.url === '/chat/completions' ? 201 : 200, {
        'content-type': 'application/json',
      });
      res.end('{"synthetic":true}');
    });
  });
  const body = '{ "messages" : [{"role":"user","content":"Привет 🧪"}] }\n';
  const response = await socketRequest(f.target, '/chat/completions', {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      'x-candidate-manifest': 'a'.repeat(64),
    },
    redirect: 'error',
  });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { synthetic: true });
  assert.deepEqual(seen[0].body, Buffer.from(body));
  assert.equal(seen[0].length, String(Buffer.byteLength(body)));
  assert.equal(seen[0].marker, 'a'.repeat(64));
  assert.equal((await socketRequest(f.target, '/status')).status, 200);
  assert.equal(
    (await socketRequest(f.target, '/finish', { method: 'POST', signal: null }))
      .status,
    200,
  );
  assert.deepEqual(
    seen.map((row) => [row.method, row.url]),
    [
      ['POST', '/chat/completions'],
      ['GET', '/status'],
      ['POST', '/finish'],
    ],
  );
});
test('finite route, request, timeout and credential-header refusals dispatch nothing', async (t) => {
  const f = fixture(t);
  let calls = 0;
  await f.serve((_req, res) => {
    calls++;
    res.end('ok');
  });
  for (const route of [
    '/status?x=1',
    'http://127.0.0.1/status',
    '/other',
    '/chat/completions/',
  ])
    await assert.rejects(
      socketRequest(f.target, route),
      /core_socket_route_refused/,
    );
  for (const init of [
    { method: 'PUT' },
    { method: 'get' },
    { method: 'GET', body: '{}' },
    { headers: { authorization: 'SYNTHETIC_NOT_CREDENTIAL' } },
    { headers: { cookie: 'SYNTHETIC' } },
    { headers: { 'content-length': '0' } },
    { redirect: 'follow' },
    { socketPath: '/elsewhere' },
  ])
    await assert.rejects(
      socketRequest(f.target, '/status', init),
      /core_socket_request_refused/,
    );
  for (const timeoutMs of [0, -1, 30001, 1.5, Infinity, '10'])
    await assert.rejects(
      socketRequest(f.target, '/status', { timeoutMs }),
      /core_socket_timeout_refused/,
    );
  for (const body of [undefined, null, {}, new Uint8Array([1])])
    await assert.rejects(
      socketRequest(f.target, '/chat/completions', { body }),
      /core_socket_request_refused/,
    );
  await assert.rejects(
    socketRequest(f.target, '/chat/completions', {
      body: 'x'.repeat(96 * 1024 + 1),
    }),
    /core_socket_request_limit/,
  );
  assert.equal(calls, 0);
});
test('redirect status is preserved without following Location', async (t) => {
  const f = fixture(t);
  let calls = 0;
  await f.serve((_req, res) => {
    calls++;
    res.writeHead(302, { location: 'https://NEVER-CONTACT.invalid/' });
    res.end('redirect');
  });
  const response = await socketRequest(f.target, '/status', {
    redirect: 'error',
  });
  assert.equal(response.status, 302);
  assert.equal(await response.text(), 'redirect');
  assert.equal(calls, 1);
});
test('response size limit covers chunked bytes and declared oversized length', async (t) => {
  const f = fixture(t);
  let count = 0;
  await f.serve((_req, res) => {
    if (count++ === 0) {
      res.writeHead(200);
      res.write(Buffer.alloc(1024 * 1024));
      res.end('x');
    } else {
      res.writeHead(200, { 'content-length': 1024 * 1024 + 1 });
      res.flushHeaders();
    }
  });
  await assert.rejects(
    socketRequest(f.target, '/status'),
    /core_socket_response_limit/,
  );
  await assert.rejects(
    socketRequest(f.target, '/status'),
    /core_socket_response_limit/,
  );
});
test('pre-aborted signal dispatches nothing; active abort closes its owned request', async (t) => {
  const f = fixture(t);
  let calls = 0;
  await f.serve((_req, res) => {
    calls++;
    res.writeHead(200);
    res.write('partial');
  });
  const before = new AbortController();
  before.abort('DO_NOT_ECHO_SYNTHETIC_REASON');
  await assert.rejects(
    socketRequest(f.target, '/status', { signal: before.signal }),
    { name: 'AbortError', message: 'core_socket_aborted' },
  );
  assert.equal(calls, 0);
  const active = new AbortController();
  const timer = setTimeout(() => active.abort(), 25);
  try {
    await assert.rejects(
      socketRequest(f.target, '/status', { signal: active.signal }),
      { name: 'AbortError', message: 'core_socket_aborted' },
    );
  } finally {
    clearTimeout(timer);
  }
});
test('absolute deadline covers unfinished response and clears the owned connection', async (t) => {
  const f = fixture(t);
  await f.serve((_req, res) => {
    res.writeHead(200);
    res.write('partial');
  });
  await assert.rejects(
    socketRequest(f.target, '/status', { timeoutMs: 30 }),
    /core_socket_timeout/,
  );
});
test('truncated response never becomes a completed WHATWG Response', async (t) => {
  const f = fixture(t);
  await f.serve((_req, res) => {
    res.writeHead(200, { 'content-length': 100 });
    res.write('short');
    res.socket.destroy();
  });
  await assert.rejects(
    socketRequest(f.target, '/status'),
    /core_socket_transport_failed/,
  );
});
