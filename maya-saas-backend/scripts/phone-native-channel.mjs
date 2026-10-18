// Private pull-only IPC. The externally connected forwarder exposes no listener;
// only the ordinary backend's admitted transport can enqueue a request. This is
// not an authority issuer: dequeue must await the same current signed verifier.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
export const CHANNEL_LIMITS = Object.freeze({
  requestBytes: 98304,
  responseBytes: 2097152,
  inFlight: 4,
  timeoutMs: 20000,
});
const encode = (v) => JSON.stringify(v),
  error = () => new Error('phone_native_channel_refused');
function privateDirectory(directory, uid) {
  const s = fs.lstatSync(directory);
  assert(
    path.isAbsolute(directory) &&
      fs.realpathSync(directory) === directory &&
      s.isDirectory() &&
      !s.isSymbolicLink() &&
      s.uid === uid &&
      (s.mode & 0o777) === 0o700,
  );
  return [s.dev, s.ino, s.mode, s.uid, s.gid].join(':');
}
export function assertNativeDestination(raw, init) {
  const u = new URL(raw);
  assert.equal(u.href, raw);
  assert(!u.username && !u.password && !u.hash);
  const model = [
    'https://api.deepseek.com/chat/completions',
    'https://api.deepseek.com/v1/chat/completions',
  ].includes(raw);
  assert(
    model ||
      (u.origin === 'https://api.yclients.com' &&
        u.pathname.startsWith('/api/v1/') &&
        !/[\\%]/.test(u.pathname)),
  );
  assert(
    model
      ? init.method === 'POST'
      : ['GET', 'POST', 'PUT', 'DELETE'].includes(init.method),
  );
  assert(
    init.body === undefined ||
      typeof init.body === 'string' ||
      Buffer.isBuffer(init.body),
  );
  const requestBody = Buffer.isBuffer(init.body)
    ? init.body.toString('utf8')
    : init.body;
  if (Buffer.isBuffer(init.body))
    assert(Buffer.from(requestBody).equals(init.body));
  assert(Buffer.byteLength(requestBody ?? '') <= CHANNEL_LIMITS.requestBytes);
  const h = new Headers(init.headers),
    headers = {};
  for (const [k, v] of h) {
    assert(['authorization', 'accept', 'content-type'].includes(k));
    assert(!/[\r\n]/.test(v));
    headers[k] = v;
  }
  assert(
    headers.authorization && headers['content-type'] === 'application/json',
  );
  if (model) assert(headers.authorization.startsWith('Bearer '));
  else assert(headers.accept === 'application/vnd.yclients.v2+json');
  return { url: raw, method: init.method, body: requestBody, headers };
}
async function body(req, max) {
  let n = 0;
  const a = [];
  for await (const c of req) {
    n += c.length;
    assert(n <= max);
    a.push(c);
  }
  return Buffer.concat(a);
}
export async function openNativeChannel({
  directory,
  operatorUid = 0,
  assertCurrent,
}) {
  assert(typeof assertCurrent === 'function');
  const identity = privateDirectory(directory, operatorUid),
    socket = path.join(directory, 'dispatch.sock');
  assert(Buffer.byteLength(socket) < 100, 'unix_socket_path_too_long');
  assert(!fs.existsSync(socket));
  let closed = false,
    polling = false;
  const pending = new Map();
  let wake;
  const check = async () => {
    assert(!closed);
    assert.equal(privateDirectory(directory, operatorUid), identity);
    assert.equal(await assertCurrent(), true);
    assert(!closed);
  };
  const finish = (job, err, value) => {
    if (!pending.delete(job.id)) return;
    clearTimeout(job.timer);
    job.signal?.removeEventListener('abort', job.abort);
    err ? job.reject(error()) : job.resolve(value);
  };
  const server = http.createServer((req, res) => {
    void (async () => {
      assert(req.method === 'POST');
      if (req.url === '/next') {
        assert(!polling);
        assert.equal((await body(req, 0)).length, 0);
        polling = true;
        try {
          if (![...pending.values()].some((x) => !x.dispatched))
            await new Promise((r) => {
              const timer = setTimeout(() => {
                wake = null;
                r();
              }, 250);
              wake = () => {
                clearTimeout(timer);
                wake = null;
                r();
              };
            });
          // Idle polling carries no request and grants no authority. Avoid
          // repeatedly hashing the whole installed build when there is no work.
          if (![...pending.values()].some((x) => !x.dispatched)) {
            res.writeHead(204).end();
            return;
          }
          await check();
          const job = [...pending.values()].find((x) => !x.dispatched);
          if (!job) {
            res.writeHead(204).end();
            return;
          }
          // Never requeue on socket loss: a retrieved job may already have effected.
          job.dispatched = true;
          assert(!job.signal?.aborted && Date.now() < job.deadline);
          res
            .writeHead(200, { 'content-type': 'application/json' })
            .end(
              encode({ id: job.id, deadline: job.deadline, ...job.request }),
            );
        } finally {
          polling = false;
        }
      } else {
        assert(/^\/result\/[a-f0-9-]{36}$/.test(req.url));
        const id = req.url.slice('/result/'.length),
          job = pending.get(id);
        assert(job?.dispatched);
        const value = JSON.parse(
          (await body(req, CHANNEL_LIMITS.responseBytes * 2)).toString('utf8'),
        );
        await check();
        assert(Date.now() < job.deadline);
        if (value.failed === true) {
          assert.deepEqual(Object.keys(value), ['failed']);
          finish(job, true);
        } else {
          assert.deepEqual(Object.keys(value).sort(), ['body', 'status']);
          assert(
            Number.isInteger(value.status) &&
              value.status >= 200 &&
              value.status <= 599 &&
              typeof value.body === 'string',
          );
          const bytes = Buffer.from(value.body, 'base64');
          assert.equal(bytes.toString('base64'), value.body);
          assert(bytes.length <= CHANNEL_LIMITS.responseBytes);
          const noBody = [204, 205, 304].includes(value.status);
          assert(!noBody || bytes.length === 0);
          finish(
            job,
            false,
            new Response(noBody ? null : bytes, {
              status: value.status,
              headers: { 'content-type': 'application/json' },
            }),
          );
        }
        res.writeHead(204).end();
      }
    })().catch(() => {
      res.writeHead(403).end();
    });
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(socket, resolve);
    });
    fs.chmodSync(socket, 0o600);
  } catch (failure) {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    throw failure;
  }
  return {
    socket,
    async fetch(raw, init = {}) {
      const request = assertNativeDestination(String(raw), init);
      await check();
      assert(pending.size < CHANNEL_LIMITS.inFlight && !init.signal?.aborted);
      return new Promise((resolve, reject) => {
        const job = {
          id: randomUUID(),
          request,
          resolve,
          reject,
          deadline: Date.now() + CHANNEL_LIMITS.timeoutMs,
          signal: init.signal,
          dispatched: false,
        };
        job.abort = () => finish(job, true);
        job.timer = setTimeout(job.abort, CHANNEL_LIMITS.timeoutMs);
        pending.set(job.id, job);
        job.signal?.addEventListener('abort', job.abort, { once: true });
        wake?.();
      });
    },
    async close() {
      if (closed) return;
      closed = true;
      wake?.();
      for (const j of [...pending.values()]) finish(j, true);
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    },
    snapshot() {
      return { closed, pending: pending.size };
    },
  };
}
export function channelRequest(socket, route, value) {
  return new Promise((resolve, reject) => {
    const bytes = value === undefined ? null : Buffer.from(encode(value));
    const req = http.request(
      {
        socketPath: socket,
        path: route,
        method: 'POST',
        headers: { 'Content-Length': bytes?.length ?? 0 },
        timeout: CHANNEL_LIMITS.timeoutMs + 2000,
      },
      (res) => {
        void body(res, CHANNEL_LIMITS.responseBytes * 2).then(
          (b) => resolve({ status: res.statusCode, body: b }),
          reject,
        );
      },
    );
    req.on('error', () => reject(error()));
    req.on('timeout', () => req.destroy(error()));
    req.end(bytes);
  });
}
export async function forwardNativeOnce({
  socket,
  nativeFetch = fetch,
  clock = Date.now,
  notAfter = Number.MAX_SAFE_INTEGER,
  assertLocal = () => {},
}) {
  const response = await channelRequest(socket, '/next');
  if (response.status === 204) return false;
  assert.equal(response.status, 200);
  const job = JSON.parse(response.body.toString('utf8'));
  assert(
    /^[a-f0-9-]{36}$/.test(job.id) &&
      Number.isSafeInteger(job.deadline) &&
      job.deadline > clock() &&
      job.deadline - clock() <= CHANNEL_LIMITS.timeoutMs,
  );
  assert.deepEqual(
    Object.keys(job).sort(),
    [
      ...(job.body === undefined ? [] : ['body']),
      'deadline',
      'headers',
      'id',
      'method',
      'url',
    ].sort(),
  );
  const request = assertNativeDestination(job.url, job);
  let result;
  try {
    assertLocal();
    assert(clock() < notAfter);
    const r = await nativeFetch(request.url, {
      method: request.method,
      headers: request.headers,
      ...(request.body === undefined ? {} : { body: request.body }),
      redirect: 'error',
      signal: AbortSignal.timeout(Math.min(job.deadline, notAfter) - clock()),
    });
    assert(!r.redirected && (!r.url || r.url === request.url));
    const bytes = await body(r.body ?? [], CHANNEL_LIMITS.responseBytes);
    assert(clock() < job.deadline);
    result = { status: r.status, body: bytes.toString('base64') };
  } catch {
    result = { failed: true };
  }
  assert.equal(
    (await channelRequest(socket, '/result/' + job.id, result)).status,
    204,
  );
  return true;
}
