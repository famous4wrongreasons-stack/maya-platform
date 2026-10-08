// Synthetic Unix socket only; no TCP, provider, real credential or database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { test } from 'node:test';
import {
  assertCoreSocket,
  socketRequest,
} from './core-conversation-socket.mjs';
const local = { localStdin: true };
const before = { ...local, beforeListen: true };
const mac = { skip: process.platform !== 'darwin' };
const denied = (fn) =>
  assert.throws(fn, { message: 'core_socket_metadata_refused' });
function fixture(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'mcl-unit-'));
  const directory = path.join(root, 'channel');
  fs.mkdirSync(directory, { mode: 0o700 });
  fs.chownSync(directory, process.getuid(), process.getgid());
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    root,
    directory,
    target: {
      brokerUid: process.getuid(),
      runnerUid: process.getuid(),
      brokerSocket: {
        path: path.join(directory, 'b.sock'),
        gid: process.getgid(),
      },
    },
  };
}
test(
  'local private directories are explicit; default remote guard refuses them',
  mac,
  (t) => {
    const f = fixture(t);
    assertCoreSocket(f.target, before);
    denied(() => assertCoreSocket(f.target, { beforeListen: true }));
    denied(() => assertCoreSocket(f.target, local));
    fs.writeFileSync(f.target.brokerSocket.path, 'NOT_A_SOCKET');
    denied(() => assertCoreSocket(f.target, local));
  },
);
test(
  'local outer root, direct parent, owner, group and equal principals fail closed',
  mac,
  (t) => {
    const f = fixture(t);
    for (const directory of [f.root, f.directory]) {
      fs.chmodSync(directory, 0o710);
      denied(() => assertCoreSocket(f.target, before));
      fs.chmodSync(directory, 0o700);
    }
    denied(() =>
      assertCoreSocket(
        { ...f.target, runnerUid: f.target.runnerUid + 1 },
        before,
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
        before,
      ),
    );
    fs.renameSync(f.directory, f.directory + '-actual');
    fs.symlinkSync(f.directory + '-actual', f.directory);
    denied(() => assertCoreSocket(f.target, before));
  },
);
test(
  'explicit local socket carries only the finite broker routes and requires socket0600',
  mac,
  async (t) => {
    const f = fixture(t);
    let requests = 0;
    const server = http.createServer((req, res) => {
      requests++;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ synthetic: true, path: req.url }));
    });
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(f.target.brokerSocket.path, resolve);
      });
      fs.chmodSync(f.target.brokerSocket.path, 0o600);
      assertCoreSocket(f.target, local);
      assert.deepEqual(
        await (await socketRequest(f.target, '/status', {}, local)).json(),
        { synthetic: true, path: '/status' },
      );
      await assert.rejects(socketRequest(f.target, '/status'), {
        message: 'core_socket_metadata_refused',
      });
      await assert.rejects(socketRequest(f.target, '/not-allowed', {}, local), {
        message: 'core_socket_route_refused',
      });
      await assert.rejects(
        socketRequest(
          f.target,
          '/status',
          {},
          { localStdin: true, ignored: true },
        ),
        { message: 'core_socket_metadata_refused' },
      );
      fs.chmodSync(f.target.brokerSocket.path, 0o660);
      denied(() => assertCoreSocket(f.target, local));
      assert.equal(requests, 1);
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
test('local socket mode cannot be used on another platform', (t) => {
  const f = fixture(t);
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
  try {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    denied(() => assertCoreSocket(f.target, before));
  } finally {
    Object.defineProperty(process, 'platform', descriptor);
  }
});
