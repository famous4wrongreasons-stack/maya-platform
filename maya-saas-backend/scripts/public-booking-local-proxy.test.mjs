import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import {
  createLocalProxy,
  loopbackBase,
} from './public-booking-local-proxy.mjs';
const listen = (s) =>
  new Promise((resolve) =>
    s.listen(0, '127.0.0.1', () =>
      resolve(`http://127.0.0.1:${s.address().port}`),
    ),
  );
const close = (s) => new Promise((resolve) => s.close(resolve));
test('only explicit loopback targets are admitted', () => {
  for (const value of [
    'https://mayaos.ru',
    'http://example.com:80',
    'http://127.0.0.1:8000/private',
    'http://user:pass@localhost:9000',
  ])
    assert.throws(() => loopbackBase(value));
});
test('same-origin cookie/CSRF relay preserves security flags and rejects cross-origin writes', async () => {
  const seen = [];
  const backend = http.createServer((req, res) => {
    seen.push({ url: req.url, headers: req.headers });
    req.resume();
    req.on('end', () => {
      res.writeHead(200, {
        'Set-Cookie':
          '__Host-maya_guest_booking=synthetic; Path=/; HttpOnly; Secure; SameSite=Strict',
        'Content-Type': 'application/json',
      });
      res.end('{"ok":true}');
    });
  });
  const frontend = http.createServer((_req, res) => res.end('frontend'));
  let proxy;
  try {
    const b = await listen(backend),
      f = await listen(frontend);
    const reservation = http.createServer();
    const origin = await listen(reservation);
    await close(reservation);
    proxy = createLocalProxy({ backend: b, frontend: f, origin });
    await new Promise((resolve) =>
      proxy.listen(Number(new URL(origin).port), '127.0.0.1', resolve),
    );
    const response = await fetch(origin + '/api/public-booking/attempts', {
      method: 'POST',
      headers: {
        Origin: origin,
        Cookie: '__Host-maya_guest_booking=synthetic; other=private',
        Authorization: 'Bearer discard',
        'X-CSRF-Token': 'csrf',
        'Idempotency-Key': 'nonce',
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(
      response.headers.get('set-cookie'),
      /HttpOnly; Secure; SameSite=Strict/,
    );
    assert.equal(seen[0].headers.cookie, '__Host-maya_guest_booking=synthetic');
    assert.equal(seen[0].headers.authorization, undefined);
    assert.equal(seen[0].headers.origin, origin);
    assert.equal(seen[0].headers['x-csrf-token'], 'csrf');
    assert.equal(seen[0].headers['idempotency-key'], 'nonce');
    const get = await fetch(
      origin + '/api/public-booking/services?staffRef=opaque',
    );
    assert.equal(get.status, 200);
    assert.equal(seen[1].headers.origin, origin);
    const forbidden = await fetch(origin + '/api/public-booking/attempts', {
      method: 'POST',
      headers: { Origin: 'http://evil.test' },
      body: '{}',
    });
    assert.equal(forbidden.status, 403);
    assert.equal(seen.length, 2);
    const unknown = await fetch(origin + '/api/public-booking/erase', {
      method: 'POST',
      headers: { Origin: origin },
    });
    assert.equal(unknown.status, 404);
    assert.equal(await (await fetch(origin + '/booking')).text(), 'frontend');
  } finally {
    if (proxy) await close(proxy);
    await close(backend);
    await close(frontend);
  }
});
