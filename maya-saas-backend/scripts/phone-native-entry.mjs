// No default execution. Operator supplies already signed, root-private files.
// Running this entry is itself a separately authorized operational action.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { installNativeExecution } from './phone-native-runtime.mjs';
import { openNativeChannel } from './phone-native-channel.mjs';
const require = createRequire(import.meta.url);
try {
  assert.equal(process.cwd(), '/app');
  assert.equal(process.env.MAYA_NATIVE_EXECUTION_ENABLED, 'signed-phone-test');
  const installed = Object.fromEntries(
    [
      'authorization',
      'pricing',
      'session',
      'scope',
      'modelCredential',
      'partnerCredential',
    ].map((name) => [
      name,
      {
        file: '/run/maya-native/' + name,
        sha256: process.env['MAYA_NATIVE_' + name.toUpperCase() + '_SHA256'],
      },
    ]),
  );
  const nativeFetch = globalThis.fetch,
    { NestFactory } = require('@nestjs/core');
  const original = NestFactory.create.bind(NestFactory);
  let once = false;
  NestFactory.create = async (...args) => {
    assert(!once);
    once = true;
    const app = await original(...args);
    let channel;
    const runtime = await installNativeExecution({
      app,
      backend: '/app',
      installed,
      stateDirectory: '/var/lib/maya-native',
      nativeFetch: (raw, init) => {
        const url = new URL(String(raw));
        // The existing in-process provider limiter uses its private loopback
        // HTTP owner. External requests can only enter the pull-only channel.
        if (url.protocol === 'http:' && url.hostname === '127.0.0.1')
          return nativeFetch(raw, init);
        assert(channel);
        return channel.fetch(raw, init);
      },
    });
    try {
      channel = await openNativeChannel({
        directory: '/run/maya-native-ipc',
        assertCurrent: () => runtime.checkCurrent(),
      });
    } catch (error) {
      await runtime.close();
      throw error;
    }
    globalThis.fetch = runtime.fetch;
    for (const event of ['SIGTERM', 'SIGINT'])
      process.once(event, () => {
        void runtime.close();
        void channel.close();
      });
    return app;
  };
  require('/app/dist/src/main.js');
} catch {
  console.error('PHONE NATIVE EXECUTION REFUSED');
  process.exitCode = 1;
}
