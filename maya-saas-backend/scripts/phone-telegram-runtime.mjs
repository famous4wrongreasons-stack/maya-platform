// Restrictive transport around the existing compiled A23/login/Client owners.
// No identity/session writer, phone matching or cryptographic verifier here.
import assert from 'node:assert/strict';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { verifyOwnerChatDatabase } from './local-owner-scope.mjs';
import { createOwnerTelegramTransport } from './local-owner-telegram-transport.mjs';
import { telegramProviderRoute } from './local-owner-telegram-policy.mjs';
import {
  PHONE_TELEGRAM_ORIGIN as origin,
  PHONE_TELEGRAM_CLIENT_ID as clientId,
  PHONE_TELEGRAM_SENTINEL,
  assertPhoneTelegramActor,
} from './phone-telegram-scope.mjs';

export async function installPhoneTelegram({
  app,
  require,
  backend,
  scope,
  assertCurrent,
  nativeFetch,
  relay,
  trace,
}) {
  const load = (file) => require(path.join(backend, 'dist/src', file));
  const { ConfigService } = require('@nestjs/config'),
    { ForbiddenException } = require('@nestjs/common');
  const prisma = app.get(load('prisma/prisma.service.js').PrismaService);
  const social = app.get(load('auth/social-auth.service.js').SocialAuthService);
  const identities = app.get(
    load('auth/tenant-auth.repository.js').TenantAuthRepository,
  );
  const sessions = app.get(
    load('auth/auth-session.service.js').AuthSessionService,
  );
  const config = app.get(ConfigService),
    starts = { link: 0, login: 0 },
    states = new Map(),
    undo = [];
  const startContext = new AsyncLocalStorage(),
    requests = new AsyncLocalStorage();
  let stopped = false;
  const refuse = () => {
    throw new ForbiddenException({
      error: { code: 'phone_telegram_scope_refused' },
    });
  };
  const current = async () => {
    try {
      assert.ok(!stopped && !requests.getStore()?.aborted);
      assertCurrent();
      await verifyOwnerChatDatabase(prisma, scope);
      assertCurrent();
      assert.ok(!requests.getStore()?.aborted);
    } catch {
      return refuse();
    }
  };
  const actor = async (user) => {
    await current();
    try {
      assertPhoneTelegramActor(user, scope);
    } catch {
      return refuse();
    }
  };
  const forOwner = (user) =>
    user?.id === scope.userId &&
    user.tenantId === scope.tenantId &&
    user.role === 'tenant_owner' &&
    user.status === 'active';
  const patch = (object, name, wrap) => {
    assert.equal(typeof object[name], 'function');
    const original = object[name];
    object[name] = wrap(original.bind(object));
    undo.push(() => {
      object[name] = original;
    });
  };
  const transport = createOwnerTelegramTransport({
    clientId,
    companyId: scope.companyId,
    assertCurrent,
    verifyCurrent: current,
    trace,
    nativeFetch: async (raw, init) => {
      const op = transport.operation();
      const route = telegramProviderRoute(
        raw,
        init,
        op,
        clientId,
        scope.companyId,
      );
      if (!route || !op?.relayId) return refuse();
      const response = await relay(
        route,
        {
          operationId: op.relayId,
          ...(route === 'telegram_token'
            ? { body: init.body.toString() }
            : route === 'client_registry'
              ? { body: init.body }
              : {}),
        },
        init,
      );
      // The separately checked relay owns fixed official-source validation.
      // Its private HTTP hop is not an upstream redirect or a provider URL.
      return new Response(response.body, {
        status: response.status,
        headers: response.headers,
      });
    },
  });
  await current();
  try {
    patch(
      social,
      'startTelegramLink',
      (original) =>
        async (dto, user, ...rest) => {
          await actor(user);
          return startContext.run('link', () => original(dto, user, ...rest));
        },
    );
    patch(social, 'startTelegramLogin', (original) => async (dto, ...rest) => {
      await current();
      const purpose = startContext.getStore() === 'link' ? 'link' : 'login';
      if (
        dto.tenantSlug !== scope.tenantSlug ||
        dto.platform !== 'web' ||
        dto.redirectUri !== origin + '/oauth-callback.html'
      )
        return refuse();
      if (
        purpose === 'login' &&
        !(await prisma.authIdentity.findFirst({
          where: {
            provider: 'telegram',
            tenantId: scope.tenantId,
            userId: scope.userId,
          },
          select: { id: true },
        }))
      )
        return refuse();
      if (starts[purpose] >= (purpose === 'link' ? 1 : 3)) return refuse();
      starts[purpose]++; // Reserve synchronously after awaits, even if start fails.
      const result = await original(dto, ...rest);
      await current();
      states.set(result.state, purpose);
      return result;
    });
    for (const [method, purpose] of [
      ['completeTelegramLink', 'link'],
      ['completeTelegramLogin', 'login'],
    ]) {
      patch(social, method, (original) => async (dto, ...rest) => {
        await current();
        if (purpose === 'link') await actor(rest[0]);
        if (states.get(dto.state) !== purpose) return refuse();
        states.delete(dto.state);
        const flow = await social.getValidAuthFlowState(dto.state, 'telegram');
        if (
          flow.tenant.id !== scope.tenantId ||
          flow.redirectUri !== origin + '/oauth-callback.html'
        )
          return refuse();
        const signal = requests.getStore();
        if (!signal || signal.aborted) return refuse();
        const relayId = randomUUID();
        return transport.run(
          {
            purpose,
            code: dto.code,
            verifier: flow.codeVerifier,
            redirectUri: flow.redirectUri,
            signal,
            relayId,
          },
          async () => {
            const begin = await relay(
              'begin',
              { operationId: relayId, purpose },
              { signal },
            );
            if (!begin.ok) return refuse();
            try {
              return await original(dto, ...rest);
            } finally {
              await relay(
                'end',
                { operationId: relayId },
                { signal: AbortSignal.timeout(2000) },
              ).catch(() => {});
            }
          },
        );
      });
    }
    patch(social, 'exchangeTelegramCode', (original) => async (...args) => {
      const op = transport.operation();
      if (!op) return refuse();
      const profile = await original(...args);
      await current();
      const identity = await identities.findIdentity(
        'telegram',
        profile.providerUserId,
      );
      if (
        profile.provider !== 'telegram' ||
        (identity && !forOwner(identity.user)) ||
        (op.purpose === 'login' && !identity)
      )
        return refuse();
      op.verifiedProfile = profile;
      op.verifiedOwner = op.purpose === 'login';
      if (op.verifiedOwner) {
        const response = await relay(
          'verified',
          { operationId: op.relayId },
          { signal: op.signal },
        );
        if (!response.ok) return refuse();
      }
      return profile;
    });
    patch(social, 'resolveOrCreateUser', (original) => async (params) => {
      const op = transport.operation();
      await current();
      if (
        !op?.verifiedOwner ||
        op.verifiedProfile !== params.profile ||
        params.tenant.id !== scope.tenantId
      )
        return refuse();
      const identity = await identities.findIdentity(
        'telegram',
        params.profile.providerUserId,
      );
      if (!identity || !forOwner(identity.user)) return refuse();
      return original(params);
    });
    // Ordinary password sessions and the independently admitted AI stay intact.
    patch(sessions, 'issueSession', (original) => async (user, ...rest) => {
      if (transport.operation()) {
        await current();
        if (!forOwner(user)) return refuse();
      }
      return original(user, ...rest);
    });
    // The finder shares a product flag with tenant-install endpoints. Admit
    // only this exact search; never enable installation or an open directory.
    app.useGlobalInterceptors({
      async intercept(execution, next) {
        const req = execution.switchToHttp().getRequest();
        if (req.originalUrl?.startsWith('/api/mobile/pwa')) {
          await current();
          if (
            req.method !== 'GET' ||
            req.originalUrl !== '/api/mobile/pwa/search?q=' + scope.tenantSlug
          )
            return refuse();
        }
        return next.handle();
      },
    });
    for (const [key, value] of Object.entries({
      PWA_TENANT_INSTALL_ENABLED: 'true',
      TELEGRAM_LOGIN_ENABLED: 'true',
      TELEGRAM_CLIENT_ID: clientId,
      TELEGRAM_CLIENT_SECRET: PHONE_TELEGRAM_SENTINEL,
      TELEGRAM_JWKS_URL: 'https://oauth.telegram.org/.well-known/jwks.json',
      TELEGRAM_OAUTH_PROXY_URL: '',
      OAUTH_ALLOWED_REDIRECT_URIS: origin + '/oauth-callback.html',
    })) {
      const previous = config.get(key);
      undo.push(() => config.set(key, previous));
      config.set(key, value);
    }
    return {
      runRequest(req, res, next) {
        const controller = new AbortController();
        const abort = () => controller.abort();
        req.once('aborted', abort);
        res.once('finish', abort);
        res.once('close', abort);
        return requests.run(controller.signal, next);
      },
      fetch(raw, init) {
        let url;
        try {
          url = new URL(String(raw));
        } catch {
          return nativeFetch(raw, init);
        }
        // Only canonical signed-login work may use registry reads. Other CRM
        // reads continue through the original separately bounded catalogue.
        const registry =
          url.origin === 'http://catalog-egress:8080' &&
          url.pathname ===
            `/api/v1/company/${scope.companyId}/clients/search` &&
          !url.search &&
          !url.hash;
        if (registry)
          return transport.fetch(
            'https://api.yclients.com' + url.pathname,
            init,
          );
        if (
          url.hostname === 'oauth.telegram.org' ||
          url.hostname === 'api.yclients.com'
        )
          return transport.fetch(raw, init);
        return nativeFetch(raw, init);
      },
      snapshot: () => ({
        starts: { ...starts },
        provider: structuredClone(transport.counters),
        stopped,
      }),
      stop() {
        if (stopped) return;
        stopped = true;
        transport.stop();
        states.clear();
        for (const restore of undo.reverse()) restore();
      },
    };
  } catch (error) {
    transport.stop();
    for (const restore of undo.reverse()) restore();
    throw error;
  }
}
