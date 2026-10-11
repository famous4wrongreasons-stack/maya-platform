import assert from 'node:assert/strict';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { assertOwnerChatActor } from './local-owner-scope.mjs';
import { verifyOwnerChatDatabase } from './local-owner-scope.mjs';
import { createOwnerTelegramTransport } from './local-owner-telegram-transport.mjs';
import { TELEGRAM_LIMITS } from './local-owner-telegram-policy.mjs';

// Restrictions around existing owners, installed only by the separately
// admitted local mode. No fake sessions, identity writer or fixture injection.
export async function installOwnerTelegram({ app, prisma, require, backend, launch, nativeFetch, trace }) {
  const scope = launch.plan.scope, origin = launch.plan.origin;
  const load = p => require(path.join(backend, 'dist/src', p));
  const { ConfigService } = require('@nestjs/config');
  const { ForbiddenException } = require('@nestjs/common');
  const { SocialAuthService } = load('auth/social-auth.service.js');
  const { AuthSessionService } = load('auth/auth-session.service.js');
  const { AuthService } = load('auth/auth.service.js');
  const { TenantAuthRepository } = load('auth/tenant-auth.repository.js');
  const social = app.get(SocialAuthService), sessions = app.get(AuthSessionService);
  const auth = app.get(AuthService), identities = app.get(TenantAuthRepository);
  const config = app.get(ConfigService), undo = [], states = new Map(), startContext = new AsyncLocalStorage(), requestContext = new AsyncLocalStorage();
  let starts = 0, stopped = false;
  const refuse = () => { throw new ForbiddenException({ error: { code: 'local_owner_telegram_scope_refused' } }); };
  const current = async () => {
    if (stopped || requestContext.getStore()?.aborted) return refuse();
    try { launch.assertCurrent(); await verifyOwnerChatDatabase(prisma, scope); launch.assertCurrent(); }
    catch { return refuse(); }
    if (requestContext.getStore()?.aborted) return refuse();
  };
  const actor = async user => { await current(); try { assertOwnerChatActor(user, scope); } catch { return refuse(); } };
  await current();
  const transport = createOwnerTelegramTransport({ nativeFetch, clientId: launch.plan.clientId,
    companyId: scope.companyId, assertCurrent: launch.assertCurrent, verifyCurrent: current, trace });
  const patch = (object, name, wrapper) => {
    assert.equal(typeof object[name], 'function', 'local_telegram_canonical_owner_missing');
    const original = object[name]; object[name] = wrapper(original.bind(object)); undo.push(() => { object[name] = original; });
  };
  const forOwner = user => user?.id === scope.userId && user.tenantId === scope.tenantId && user.role === 'tenant_owner' && user.status === 'active';
  try {
    patch(auth, 'login', original => async (dto, ...rest) => {
      await current();
      const selected = await prisma.user.findUnique({ where: { id: scope.userId }, select: { email: true } });
      if (dto.tenantSlug !== scope.tenantSlug || typeof dto.email !== 'string'
        || dto.email.trim().toLowerCase() !== selected?.email?.trim().toLowerCase()) return refuse();
      return original(dto, ...rest);
    });
    patch(sessions, 'issueSession', original => async (user, ...rest) => {
      await current(); if (!forOwner(user)) return refuse(); return original(user, ...rest);
    });
    patch(social, 'startTelegramLink', original => async (dto, user, ...rest) => {
      await actor(user); return startContext.run('link', () => original(dto, user, ...rest));
    });
    patch(social, 'startTelegramLogin', original => async (dto, ...rest) => {
      await current();
      if (dto.tenantSlug !== scope.tenantSlug || dto.platform !== 'web' || dto.redirectUri !== origin + '/oauth-callback.html'
        || starts >= TELEGRAM_LIMITS.starts) return refuse();
      const purpose = startContext.getStore() === 'link' ? 'link' : 'login';
      // Starting a fresh sign-in is allowed only after the canonical A23 link
      // exists for this selected account. Stored phone alone never qualifies.
      if (purpose === 'login' && !await prisma.authIdentity.findFirst({ where: { provider: 'telegram', userId: scope.userId }, select: { id: true } })) return refuse();
      starts++;
      const result = await original(dto, ...rest); await current();
      states.set(result.state, purpose); return result;
    });
    for (const [method, purpose] of [['completeTelegramLink', 'link'], ['completeTelegramLogin', 'login']])
      patch(social, method, original => async (dto, ...rest) => {
        await current(); if (purpose === 'link') await actor(rest[0]);
        if (states.get(dto.state) !== purpose) return refuse();
        states.delete(dto.state); // No replay, concurrent winner or purpose substitution.
        const flow = await social.getValidAuthFlowState(dto.state, 'telegram');
        if (flow.tenant.id !== scope.tenantId || flow.redirectUri !== origin + '/oauth-callback.html') return refuse();
        const signal = requestContext.getStore(); if (!signal || signal.aborted) return refuse();
        return transport.run({ purpose, code: dto.code, verifier: flow.codeVerifier, redirectUri: flow.redirectUri, signal }, () => original(dto, ...rest));
      });
    patch(social, 'exchangeTelegramCode', original => async (...args) => {
      const op = transport.operation(); if (!op) return refuse();
      const profile = await original(...args); // Canonical signature/issuer/phone verification first.
      await current();
      const identity = await identities.findIdentity('telegram', profile.providerUserId);
      if (profile.provider !== 'telegram' || (identity && !forOwner(identity.user)) || (op.purpose === 'login' && !identity)) return refuse();
      op.verifiedProfile = profile; op.verifiedOwner = op.purpose === 'login'; return profile;
    });
    patch(social, 'resolveOrCreateUser', original => async params => {
      const op = transport.operation(); await current();
      if (!op?.verifiedOwner || op.verifiedProfile !== params.profile || params.tenant.id !== scope.tenantId) return refuse();
      const identity = await identities.findIdentity('telegram', params.profile.providerUserId);
      if (!identity || !forOwner(identity.user)) return refuse();
      return original(params); // Existing identity only: never create/reassign a different account.
    });
    app.useGlobalInterceptors({ async intercept(execution, next) {
      const req = execution.switchToHttp().getRequest();
      await current();
      const publicRoutes = ['/api/health', '/api/health/ready', '/api/auth/login',
        '/api/auth/oauth/telegram/start', '/api/auth/oauth/telegram/complete'];
      if (!publicRoutes.includes(req.originalUrl) && req.originalUrl !== '/api/mobile/pwa/search?q=' + encodeURIComponent(scope.tenantSlug)) await actor(req.user);
      return next.handle();
    } });
    // The canonical finder shares this switch with tenant PWA installation.
    // Only the exact saved-slug search is admitted by the local ingress above;
    // install/manifest/QR and other searches remain refused. Readiness is still
    // decided by the unchanged canonical finder, never by this local setting.
    const priorPwaInstall = config.get('PWA_TENANT_INSTALL_ENABLED');
    undo.push(() => config.set('PWA_TENANT_INSTALL_ENABLED', priorPwaInstall));
    config.set('PWA_TENANT_INSTALL_ENABLED', 'true');
    config.set('TELEGRAM_LOGIN_ENABLED', 'true');
    config.set('TELEGRAM_CLIENT_ID', launch.plan.clientId);
    config.set('TELEGRAM_JWKS_URL', 'https://oauth.telegram.org/.well-known/jwks.json');
    config.set('TELEGRAM_OAUTH_PROXY_URL', '');
    config.set('OAUTH_ALLOWED_REDIRECT_URIS', origin + '/oauth-callback.html');
    // Secret is present in the child-only environment; no new files or DB secrets.
    assert.ok(typeof config.get('TELEGRAM_CLIENT_SECRET') === 'string' && config.get('TELEGRAM_CLIENT_SECRET').length >= 16, 'local_telegram_secret_required');
    return { fetch: transport.fetch, counters: transport.counters,
      runRequest(request, response, next) {
        const controller = new AbortController();
        const close = () => controller.abort();
        request.once('aborted', close); response.once('finish', close); response.once('close', close);
        return requestContext.run(controller.signal, next);
      },
      stop() { stopped = true; transport.stop(); states.clear(); for (const restore of undo.reverse()) restore(); config.set('TELEGRAM_LOGIN_ENABLED', 'false'); config.set('TELEGRAM_CLIENT_SECRET', ''); } };
  } catch (error) { transport.stop(); for (const restore of undo.reverse()) restore(); throw error; }
}
