// Private pull client only: no listening port, arbitrary destination, product
// endpoint, signer, platform authority, retry or independent budget owner.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { forwardNativeOnce } from './phone-native-channel.mjs';
import { immutableNativeFile } from './phone-native-run-guard.mjs';
try {
  assert.equal(process.cwd(), '/app');
  assert.equal(process.env.MAYA_NATIVE_EXECUTION_ENABLED, 'signed-phone-test');
  const read = immutableNativeFile(
    '/run/maya-native/authorization',
    process.env.MAYA_NATIVE_AUTHORIZATION_SHA256,
  );
  const a = JSON.parse(read()).payload;
  assert.equal(a.contract, 'maya.phone-native-execution/1');
  const end = Date.parse(a.expiresAt),
    begin = Date.parse(a.notBefore);
  assert(begin <= Date.now() && Date.now() < end && end - begin <= 1800000);
  const socket = '/run/maya-native-ipc/dispatch.sock';
  while (Date.now() < end) {
    read();
    if (!fs.existsSync(socket)) {
      await new Promise((r) => setTimeout(r, 100));
      continue;
    }
    const s = fs.lstatSync(socket);
    assert(s.isSocket() && s.uid === 0 && (s.mode & 0o777) === 0o600);
    if (
      !(await forwardNativeOnce({
        socket,
        notAfter: end,
        assertLocal: () => read(),
      }))
    ) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
} catch {
  console.error('PHONE NATIVE FORWARDER CLOSED');
  process.exitCode = 1;
}
