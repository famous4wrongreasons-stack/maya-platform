import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  openNativeChannel,
  forwardNativeOnce,
  channelRequest,
  assertNativeDestination,
} from './phone-native-channel.mjs';
const url = 'https://api.deepseek.com/chat/completions';
const init = () => ({
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: 'Bearer SYNTHETIC_ONLY',
  },
  body: '{"synthetic":true}',
});
async function fixture(t) {
  const directory = fs.mkdtempSync(
    path.join(fs.realpathSync('/tmp'), 'maya-native-channel-'),
  );
  fs.chmodSync(directory, 0o700);
  let current = true;
  const channel = await openNativeChannel({
    directory,
    operatorUid: process.getuid(),
    assertCurrent: async () => current,
  });
  t.after(async () => {
    await channel.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return {
    channel,
    directory,
    revoke: () => {
      current = false;
    },
  };
}
test('private pull-only channel carries immutable admitted request and response', async (t) => {
  const f = await fixture(t),
    input = init();
  const response = f.channel.fetch(url, input);
  input.body = 'changed';
  let calls = 0;
  await forwardNativeOnce({
    socket: f.channel.socket,
    nativeFetch: async (raw, request) => {
      calls++;
      assert.equal(raw, url);
      assert.equal(request.body, '{"synthetic":true}');
      assert.equal(request.redirect, 'error');
      return new Response('{"ok":true}');
    },
  });
  assert.equal(await (await response).text(), '{"ok":true}');
  assert.equal(calls, 1);
  assert.equal(f.channel.snapshot().pending, 0);
  assert.equal(fs.statSync(f.channel.socket).mode & 0o777, 0o600);
});
test('empty private channel cannot manufacture an external request', async (t) => {
  const f = await fixture(t);
  assert.equal(
    await forwardNativeOnce({
      socket: f.channel.socket,
      nativeFetch: () => {
        assert.fail('external dispatch');
      },
    }),
    false,
  );
});
test('current refusal before enqueue creates no pending dispatch', async (t) => {
  const f = await fixture(t);
  f.revoke();
  await assert.rejects(f.channel.fetch(url, init()));
  assert.equal(f.channel.snapshot().pending, 0);
});
test('revocation after enqueue is rechecked before network dispatch', async (t) => {
  const f = await fixture(t);
  const result = assert.rejects(f.channel.fetch(url, init()));
  await new Promise((r) => setImmediate(r));
  f.revoke();
  let calls = 0;
  await assert.rejects(
    forwardNativeOnce({
      socket: f.channel.socket,
      nativeFetch: async () => {
        calls++;
        return new Response('{}');
      },
    }),
  );
  await f.channel.close();
  await result;
  assert.equal(calls, 0);
});
test('unknown IPC route cannot enqueue or grant network authority', async (t) => {
  const f = await fixture(t);
  assert.equal(
    (await channelRequest(f.channel.socket, '/enqueue', init())).status,
    403,
  );
  assert.equal(f.channel.snapshot().pending, 0);
});
test('forged result cannot replace a response', async (t) => {
  const f = await fixture(t);
  assert.equal(
    (
      await channelRequest(
        f.channel.socket,
        '/result/00000000-0000-0000-0000-000000000000',
        { status: 200, body: '' },
      )
    ).status,
    403,
  );
});
test('delivered job is single-use; result replay is refused', async (t) => {
  const f = await fixture(t),
    response = f.channel.fetch(url, init());
  const next = await channelRequest(f.channel.socket, '/next'),
    job = JSON.parse(next.body);
  assert.equal(
    (
      await channelRequest(f.channel.socket, '/result/' + job.id, {
        status: 200,
        body: 'e30=',
      })
    ).status,
    204,
  );
  assert.equal(await (await response).text(), '{}');
  assert.equal(
    (
      await channelRequest(f.channel.socket, '/result/' + job.id, {
        status: 200,
        body: 'e30=',
      })
    ).status,
    403,
  );
});
test('external socket loss propagates uncertainty without a second dispatch', async (t) => {
  const f = await fixture(t),
    response = assert.rejects(f.channel.fetch(url, init()));
  let calls = 0;
  await forwardNativeOnce({
    socket: f.channel.socket,
    nativeFetch: async () => {
      calls++;
      throw Error('synthetic lost response');
    },
  });
  await response;
  assert.equal(
    await forwardNativeOnce({
      socket: f.channel.socket,
      nativeFetch: () => {
        calls++;
      },
    }),
    false,
  );
  assert.equal(calls, 1);
});
test('abort removes queued job without dispatch', async (t) => {
  const f = await fixture(t),
    controller = new AbortController();
  const response = assert.rejects(
    f.channel.fetch(url, { ...init(), signal: controller.signal }),
  );
  await new Promise((r) => setImmediate(r));
  controller.abort();
  await response;
  assert.equal(
    await forwardNativeOnce({
      socket: f.channel.socket,
      nativeFetch: () => assert.fail('dispatch'),
    }),
    false,
  );
});
test('signed window expiry between dequeue and dispatch refuses the network call', async (t) => {
  const f = await fixture(t);
  const response = assert.rejects(f.channel.fetch(url, init()));
  let calls = 0;
  await forwardNativeOnce({
    socket: f.channel.socket,
    notAfter: Date.now() - 1,
    nativeFetch: async () => {
      calls++;
      return new Response('{}');
    },
  });
  await response;
  assert.equal(calls, 0);
  assert.equal(f.channel.snapshot().pending, 0);
});
test('changed authorization at forwarder dispatch refuses the network call', async (t) => {
  const f = await fixture(t);
  const response = assert.rejects(f.channel.fetch(url, init()));
  let calls = 0;
  await forwardNativeOnce({
    socket: f.channel.socket,
    assertLocal: () => {
      throw Error('synthetic authorization replaced');
    },
    nativeFetch: async () => {
      calls++;
      return new Response('{}');
    },
  });
  await response;
  assert.equal(calls, 0);
  assert.equal(f.channel.snapshot().pending, 0);
});
test('directory permission change refuses admission', async (t) => {
  const f = await fixture(t);
  fs.chmodSync(f.directory, 0o755);
  await assert.rejects(f.channel.fetch(url, init()));
});
for (const [name, raw, patch] of [
  ['arbitrary origin', 'https://other.invalid/chat/completions', {}],
  ['userinfo', 'https://x@api.deepseek.com/chat/completions', {}],
  ['model query', url + '?destination=other', {}],
  ['redirect path', 'https://api.deepseek.com/other', {}],
  ['unsupported verb', url, { method: 'CONNECT' }],
  ['encoded provider route', 'https://api.yclients.com/api/v1/%2frecord', {}],
  [
    'caller authority header',
    url,
    { headers: { ...init().headers, 'x-maya-user': 'fake' } },
  ],
])
  test('forwarder refuses ' + name, () =>
    assert.throws(() => assertNativeDestination(raw, { ...init(), ...patch })),
  );
