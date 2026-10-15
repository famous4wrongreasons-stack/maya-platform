// Compose a temporary identity restriction with the existing AI entry. Keep the
// same image/main/bootstrap and the independent AI scope/ledger unchanged.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  readPhoneTelegramScope,
  claimPhoneTelegramProcess,
} from './phone-telegram-scope.mjs';
import { installPhoneTelegram } from './phone-telegram-runtime.mjs';
const require = createRequire(import.meta.url);
try {
  assert.equal(process.cwd(), '/app');
  const file = '/run/maya-telegram-admission/scope.json',
    pin = process.env.MAYA_PHONE_TELEGRAM_SCOPE_SHA256;
  const scope = readPhoneTelegramScope(file, pin);
  assert.equal(process.env.MAYA_RELEASE, scope.candidate);
  claimPhoneTelegramProcess('/var/lib/maya-telegram', 'backend', pin);
  const wire = globalThis.fetch,
    { NestFactory } = require('@nestjs/core'),
    create = NestFactory.create.bind(NestFactory);
  let once = false;
  // AI entry wraps this constructor. Install Telegram after AI installs its
  // fetch adapter by scheduling at app.init (before accepting any HTTP input).
  NestFactory.create = async (...args) => {
    assert.equal(once, false);
    once = true;
    const app = await create(...args);
    const init = app.init.bind(app);
    app.init = async (...initArgs) => {
      const installed = await installPhoneTelegram({
        app,
        require,
        backend: '/app',
        scope,
        assertCurrent: () => readPhoneTelegramScope(file, pin),
        nativeFetch: globalThis.fetch,
        relay: (route, body, options = {}) =>
          wire('http://telegram-egress:8082/' + route, {
            method: 'POST',
            body: JSON.stringify(body),
            redirect: 'error',
            signal: options.signal,
            headers: {
              'content-type': 'application/json',
              'x-maya-scope': pin,
              'x-maya-tenant': scope.tenantId,
              'x-maya-user': scope.userId,
              ...(route === 'client_registry'
                ? {
                    'x-maya-crm-authorization': new Headers(
                      options.headers,
                    ).get('authorization'),
                  }
                : {}),
            },
          }),
      });
      globalThis.fetch = installed.fetch;
      app.use((req, res, next) => installed.runRequest(req, res, next));
      const timer = setInterval(() => {
        try {
          readPhoneTelegramScope(file, pin);
        } catch {
          installed.stop();
          clearInterval(timer);
        }
      }, 1000);
      timer.unref();
      for (const event of ['SIGTERM', 'SIGINT'])
        process.once(event, () => {
          clearInterval(timer);
          installed.stop();
        });
      app.init = init;
      return init(...initArgs);
    };
    return app;
  };
  await import('./phone-ai-entry.mjs');
} catch {
  console.error('PHONE TELEGRAM BACKEND STARTUP REFUSED');
  process.exitCode = 1;
}
