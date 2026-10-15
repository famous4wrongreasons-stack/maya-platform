// Private, finite wire transport. The backend remains the sole verifier and
// identity owner. No caller-selected URL, credential destination or CRM action.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { telegramProviderRoute } from './local-owner-telegram-policy.mjs';
import {
  PHONE_TELEGRAM_ORIGIN as origin,
  PHONE_TELEGRAM_CLIENT_ID as clientId,
  PHONE_TELEGRAM_CONTRACT,
  validatePhoneTelegramScope,
  readPhoneTelegramScope,
  claimPhoneTelegramProcess,
} from './phone-telegram-scope.mjs';
const REFUSED = '{"error":"phone_telegram_egress_refused"}';
const exact = (value, keys) =>
  value &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const oauthErrors = new Set([
  'invalid_client',
  'invalid_grant',
  'invalid_request',
  'unauthorized_client',
  'unsupported_grant_type',
  'invalid_scope',
  'access_denied',
  'server_error',
  'temporarily_unavailable',
]);

export function phoneTelegramEgress({
  scope: input,
  pin,
  secret,
  assertCurrent,
  nativeFetch = fetch,
  clock = Date.now,
}) {
  const scope = validatePhoneTelegramScope(input, clock());
  assert.match(pin, /^[a-f0-9]{64}$/);
  assert.ok(
    typeof secret === 'string' && /^[\x21-\x7e]{16,4096}$/.test(secret),
    'phone_telegram_secret_shape',
  );
  let stopped = false,
    active = null,
    inFlight = false;
  const used = new Set(),
    counts = {
      link: 0,
      login: 0,
      calls: 0,
      completed: 0,
      rows: 0,
      refused: 0,
      tokenOutcome: null,
    };
  const controllers = new Set();
  const current = () => {
    assert.ok(!stopped);
    assertCurrent();
    validatePhoneTelegramScope(scope, clock());
  };
  const revoke = () => {
    stopped = true;
    secret = '';
    active = null;
    for (const c of controllers) c.abort();
  };
  const server = http.createServer(
    { maxHeaderSize: 12288, headersTimeout: 10000, requestTimeout: 25000 },
    async (req, res) => {
      let controller,
        reserved = false;
      const refuse = (status = 403) => {
        counts.refused++;
        if (!res.destroyed && !res.headersSent)
          res
            .writeHead(status, {
              'content-type': 'application/json',
              'cache-control': 'no-store',
              Connection: 'close',
            })
            .end(REFUSED);
      };
      const ok = () =>
        res
          .writeHead(200, {
            'content-type': 'application/json',
            'cache-control': 'no-store',
          })
          .end('{}');
      try {
        current();
        assert.equal(req.headers['x-maya-scope'], pin);
        assert.equal(req.headers['x-maya-tenant'], scope.tenantId);
        assert.equal(req.headers['x-maya-user'], scope.userId);
        assert.equal(req.method, 'POST');
        assert.equal(req.headers['content-type'], 'application/json');
        assert.ok(
          [
            '/begin',
            '/end',
            '/verified',
            '/telegram_token',
            '/telegram_jwks',
            '/client_registry',
          ].includes(req.url),
        );
        assert.equal(req.headers.expect, undefined);
        assert.ok(!inFlight, 'phone_telegram_busy');
        inFlight = true;
        reserved = true;
        const chunks = [];
        let size = 0;
        try {
          for await (const b of req) {
            size += b.length;
            assert.ok(size <= 16384);
            chunks.push(b);
          }
        } catch {
          for (const b of chunks) b.fill(0);
          throw Error('phone_telegram_body');
        }
        let body;
        const bytes = Buffer.concat(chunks);
        try {
          body = JSON.parse(bytes.toString('utf8'));
        } finally {
          bytes.fill(0);
          for (const b of chunks) b.fill(0);
        }
        current();
        assert.match(body?.operationId, uuid);
        if (req.url === '/begin') {
          assert.ok(
            exact(body, ['operationId', 'purpose']) &&
              ['link', 'login'].includes(body.purpose),
          );
          assert.ok(
            (!active || active.deadline <= clock()) &&
              !used.has(body.operationId),
          );
          assert.ok(counts[body.purpose] < (body.purpose === 'link' ? 1 : 3));
          used.add(body.operationId);
          counts[body.purpose]++;
          active = {
            id: body.operationId,
            purpose: body.purpose,
            deadline: Math.min(clock() + 120000, Date.parse(scope.expiresAt)),
            tokenSent: false,
            verifiedOwner: false,
            page: 0,
            jwks: 0,
          };
          return ok();
        }
        const op = active;
        assert.ok(op && op.id === body.operationId && clock() < op.deadline);
        if (req.url === '/end') {
          assert.ok(exact(body, ['operationId']));
          active = null;
          return ok();
        }
        if (req.url === '/verified') {
          assert.ok(
            exact(body, ['operationId']) &&
              op.tokenSent &&
              op.purpose === 'login' &&
              !op.verifiedOwner,
          );
          op.verifiedOwner = true;
          return ok();
        }
        const route = req.url.slice(1);
        let url, init;
        if (route === 'telegram_token') {
          assert.ok(
            exact(body, ['operationId', 'body']) &&
              typeof body.body === 'string' &&
              !op.tokenSent,
          );
          const params = new URLSearchParams(body.body);
          assert.ok(
            params.get('code') &&
              params.get('code').length <= 2048 &&
              /^[A-Za-z0-9_-]{32,128}$/.test(params.get('code_verifier') ?? ''),
          );
          Object.assign(op, {
            code: params.get('code'),
            verifier: params.get('code_verifier'),
            redirectUri: origin + '/oauth-callback.html',
          });
          url = 'https://oauth.telegram.org/token';
          init = {
            method: 'POST',
            body: params,
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
              Authorization:
                'Basic ' +
                Buffer.from(clientId + ':' + secret).toString('base64'),
            },
          };
          op.tokenSent = true; // Failed dispatch is consumed too.
        } else if (route === 'telegram_jwks') {
          assert.ok(
            exact(body, ['operationId']) && op.tokenSent && op.jwks < 2,
          );
          op.jwks++;
          url = 'https://oauth.telegram.org/.well-known/jwks.json';
          init = { method: 'GET', headers: { Accept: 'application/json' } };
        } else {
          assert.ok(
            exact(body, ['operationId', 'body']) &&
              typeof body.body === 'string' &&
              op.verifiedOwner,
          );
          const parsed = JSON.parse(body.body);
          assert.equal(parsed.page, op.page + 1);
          const auth = req.headers['x-maya-crm-authorization'];
          assert.ok(
            typeof auth === 'string' &&
              /^Bearer [A-Za-z0-9_-]{16,4096}, User [A-Za-z0-9_-]{16,4096}$/.test(
                auth,
              ),
          );
          url = `https://api.yclients.com/api/v1/company/${scope.companyId}/clients/search`;
          init = {
            method: 'POST',
            body: body.body,
            headers: {
              Authorization: auth,
              Accept: 'application/vnd.yclients.v2+json',
              'Content-Type': 'application/json',
            },
          };
          op.page = parsed.page;
        }
        assert.equal(
          telegramProviderRoute(url, init, op, clientId, scope.companyId),
          route,
        );
        assert.ok(counts.calls < 128);
        counts.calls++;
        controller = new AbortController();
        controllers.add(controller);
        res.once('close', () => controller.abort());
        const response = await nativeFetch(url, {
          ...init,
          redirect: 'error',
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(
              Math.max(1, Math.min(20000, op.deadline - clock())),
            ),
          ]),
        });
        current();
        assert.ok(
          active === op &&
            clock() < op.deadline &&
            !response.redirected &&
            (!response.url || response.url === url),
        );
        if (!response.ok) {
          // Preserve only a closed OAuth diagnostic, never provider text/secrets.
          if (route === 'telegram_token')
            counts.tokenOutcome = 'provider_http_' + response.status;
          await response.body?.cancel();
          active = null;
          return refuse(
            response.status >= 400 && response.status <= 599
              ? response.status
              : 502,
          );
        }
        const parts = [];
        let total = 0;
        const reader = response.body?.getReader();
        assert.ok(reader);
        try {
          for (;;) {
            const p = await reader.read();
            current();
            assert.ok(clock() < op.deadline);
            if (p.done) break;
            total += p.value.length;
            assert.ok(total <= (route === 'client_registry' ? 2097152 : 65536));
            parts.push(Buffer.from(p.value));
          }
          const data = Buffer.concat(parts);
          try {
            const json = JSON.parse(data.toString('utf8'));
            if (route === 'client_registry') {
              assert.ok(Array.isArray(json.data) && json.data.length <= 200);
              counts.rows += json.data.length;
            }
            if (route === 'telegram_token') {
              counts.tokenOutcome =
                typeof json.id_token === 'string' && json.id_token
                  ? 'id_token_present'
                  : oauthErrors.has(json.error)
                    ? 'oauth_' + json.error
                    : 'missing_id_token';
              assert.ok(
                typeof json.id_token === 'string' &&
                  json.id_token &&
                  !json.error,
                'phone_telegram_token_shape',
              );
            }
            current();
            assert.ok(active === op && clock() < op.deadline && !res.destroyed);
            res.writeHead(response.status, {
              'content-type': 'application/json',
              'cache-control': 'no-store',
            });
            // Copy into Node's outgoing buffer before zeroing transient data.
            res.end(Buffer.from(data));
            counts.completed++;
          } finally {
            data.fill(0);
          }
        } finally {
          await reader.cancel().catch(() => {});
          for (const b of parts) b.fill(0);
        }
      } catch {
        controller?.abort();
        if (reserved) active = null;
        refuse();
      } finally {
        controllers.delete(controller);
        if (reserved) inFlight = false;
      }
    },
  );
  for (const name of ['checkContinue', 'checkExpectation'])
    server.on(name, (_req, res) =>
      res.writeHead(403, { Connection: 'close' }).end(REFUSED),
    );
  for (const name of ['connect', 'upgrade'])
    server.on(name, (_req, socket) =>
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'),
    );
  server.on('clientError', (_error, socket) =>
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'),
  );
  return {
    server,
    revoke,
    snapshot: () => ({
      contract: PHONE_TELEGRAM_CONTRACT,
      ...counts,
      stopped,
      active: !!active,
    }),
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  let relay, timer;
  const secretPath = '/run/maya-telegram-secret/client-secret';
  const finish = () => {
    clearInterval(timer);
    relay?.revoke();
    relay?.server.close();
    relay?.server.closeAllConnections();
    fs.rmSync(secretPath, { force: true });
    if (relay)
      fs.writeFileSync(
        '/var/lib/maya-telegram/egress-status.json',
        JSON.stringify(relay.snapshot()),
        { mode: 0o600 },
      );
  };
  try {
    const file = '/run/maya-telegram-admission/scope.json',
      pin = process.env.MAYA_PHONE_TELEGRAM_SCOPE_SHA256;
    const scope = readPhoneTelegramScope(file, pin);
    const stat = fs.lstatSync(secretPath);
    assert.ok(
      stat.isFile() &&
        !stat.isSymbolicLink() &&
        stat.uid === 0 &&
        !(stat.mode & 0o077) &&
        stat.size <= 4096,
    );
    claimPhoneTelegramProcess('/var/lib/maya-telegram', 'egress', pin);
    relay = phoneTelegramEgress({
      scope,
      pin,
      secret: fs.readFileSync(secretPath, 'utf8'),
      assertCurrent: () => readPhoneTelegramScope(file, pin),
    });
    relay.server.listen(8082, '0.0.0.0');
    timer = setInterval(() => {
      try {
        readPhoneTelegramScope(file, pin);
        fs.writeFileSync(
          '/var/lib/maya-telegram/egress-status.json',
          JSON.stringify(relay.snapshot()),
          { mode: 0o600 },
        );
      } catch {
        finish();
      }
    }, 1000);
    for (const event of ['SIGTERM', 'SIGINT']) process.once(event, finish);
  } catch {
    finish();
    console.error('PHONE TELEGRAM EGRESS STARTUP REFUSED');
    process.exitCode = 1;
  }
}
