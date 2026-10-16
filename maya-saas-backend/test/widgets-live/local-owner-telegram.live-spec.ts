// Isolated AppModule/PG. Real canonical auth, A23, initial Client binding and
// real YCLIENTS adapter; only the remote Telegram/YCLIENTS wire is synthetic.
import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { createRequire } from 'node:module';
import { createSign, generateKeyPairSync } from 'node:crypto';
import path from 'node:path';
import type { Request, Response as ExpressResponse } from 'express';
import request from 'supertest';
import { SocialAuthService } from '../../src/auth/social-auth.service';
import { AuthService } from '../../src/auth/auth.service';
import { AuthSessionService } from '../../src/auth/auth-session.service';
import { TenantAuthRepository } from '../../src/auth/tenant-auth.repository';
import { PrismaService } from '../../src/prisma/prisma.service';
import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import { bootHttp, type HttpHarness } from './support/http-bootstrap';
import { Fixtures } from './support/fixtures';
import { EvidenceWriter } from './support/evidence';
import {
  resetLoopbackLoginPreflight,
  resetLoopbackOauthPreflight,
  resetLoopbackOauthCompletionPreflight,
} from './support/login-rate-limit';

const nativeRequire = createRequire(__filename);
const { installOwnerTelegram } = nativeRequire(
  path.resolve('scripts/local-owner-telegram-runtime.mjs'),
) as typeof import('../../scripts/local-owner-telegram-runtime.mjs');
const {
  ownerTelegramIngress,
  OWNER_TELEGRAM_PROFILE,
  OWNER_TELEGRAM_BATCH_PROFILE,
} = nativeRequire(
  path.resolve('scripts/local-owner-telegram-policy.mjs'),
) as typeof import('../../scripts/local-owner-telegram-policy.mjs');
type LocalReadEvent = {
  surface: string;
  route: string;
  stage: string;
  status: number | null;
  code: string | null;
  telegramBindingOutcome?: string;
};
const { createReadTrace, traceHttpRequest } = nativeRequire(
  path.resolve('scripts/local-yclients-read-status.mjs'),
) as {
  createReadTrace: (
    send: (event: LocalReadEvent) => void,
  ) => (event: LocalReadEvent) => void;
  traceHttpRequest: (
    req: Request,
    res: ExpressResponse,
    emit: (event: LocalReadEvent) => void,
    refusal: string | null,
  ) => void;
};
const ownerModules: Record<string, unknown> = {
  '@nestjs/config': { ConfigService },
  '@nestjs/common': { ForbiddenException },
  'auth/social-auth.service.js': { SocialAuthService },
  'auth/auth.service.js': { AuthService },
  'auth/auth-session.service.js': { AuthSessionService },
  'auth/tenant-auth.repository.js': { TenantAuthRepository },
};
const currentClassLoader = (id: string) => {
  const key = id.includes('/dist/src/') ? id.split('/dist/src/')[1] : id;
  if (!ownerModules[key])
    throw new Error('Proof requires an existing canonical class');
  return ownerModules[key];
};
const origin = 'http://127.0.0.1:56151',
  clientId = '123456789';
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = pair.publicKey.export({ format: 'jwk' });

describe('retained-owner Telegram restriction [HTTP] [PG] [synthetic wire]', () => {
  let launchContract = OWNER_TELEGRAM_PROFILE;
  let db: FixtureContext, http: HttpHarness, fx: Fixtures;
  let runtime: Awaited<ReturnType<typeof installOwnerTelegram>>;
  let tenant: Awaited<ReturnType<Fixtures['tenant']>>;
  let fixtureTenantId: string | null = null;
  const retainedFixtureTenantIds: string[] = [];
  let owner: Awaited<ReturnType<Fixtures['user']>>, foreign: typeof owner;
  let expired = false,
    subject = 'synthetic-owner-telegram',
    dispatches = 0;
  let tokenReply:
    | 'signed'
    | 'http401'
    | 'missing'
    | 'malformed'
    | 'invalid_client'
    | 'invalid_grant';
  let registryReply: 'unique' | 'missing' | 'ambiguous';
  let httpTrace: LocalReadEvent[];
  let trace: Array<{
    route: string;
    stage: string;
    status: number | null;
    code: string | null;
  }>;
  beforeEach(async () => {
    fixtureTenantId = null;
    expired = false;
    subject = 'synthetic-owner-telegram';
    dispatches = 0;
    tokenReply = 'signed';
    registryReply = 'unique';
    httpTrace = [];
    trace = [];
    db = await bootFixtureContext();
    fx = new Fixtures(db, null);
    tenant = await fx.tenant('bounded Telegram owner', CalendarSource.EXTERNAL);
    fixtureTenantId = tenant.id;
    retainedFixtureTenantIds.push(tenant.id);
    owner = await fx.user(tenant, UserRole.TENANT_OWNER);
    foreign = await fx.user(tenant, UserRole.CLIENT);
    await db.prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        currentPeriodEnd: new Date('2099-01-01'),
        allowSelfRegistration: true,
      },
    });
    const branch = await db.prisma.branch.create({
      data: {
        tenantId: tenant.id,
        name: 'Synthetic branch',
        timezone: 'Europe/Moscow',
      },
    });
    await db.prisma.crmIntegration.create({
      data: {
        tenantId: tenant.id,
        provider: 'yclients',
        status: 'active',
        verifiedAt: new Date(),
        encryptedApiToken: db.encryption.encrypt(
          'synthetic-client-token-not-real',
        ),
        settingsJson: {
          companyId: 12345,
          branchBinding: {
            contract: 'maya.crm-branch-binding/1',
            companyId: 12345,
            branchId: branch.id,
          },
          acceptedImportSnapshotHash: 'a'.repeat(64),
        },
      },
    });
    for (const feature of [
      'crm.integration',
      'booking',
      'booking.customer_app',
    ] as const)
      await fx.grantFeature(tenant, feature);
    // Independent cases share localhost; preserve every rate check within a case.
    await resetLoopbackLoginPreflight(db.prisma);
    await resetLoopbackOauthPreflight(db.prisma);
    await resetLoopbackOauthCompletionPreflight(db.prisma);
    const scope = {
      stateDirectory: '/private/tmp/synthetic-telegram-state',
      initialManifestSha256: '1'.repeat(64),
      privateStateSha256: '2'.repeat(64),
      restartReceiptPath: '/private/tmp/synthetic-telegram-proof/restart.json',
      restartReceiptSha256: '3'.repeat(64),
      tenantId: tenant.id,
      userId: owner.id,
      branchId: branch.id,
      tenantSlug: tenant.slug,
      companyId: '12345',
    };
    const wireReply = (raw: string | URL) => {
      dispatches++;
      if (String(raw) === 'https://oauth.telegram.org/.well-known/jwks.json')
        return Response.json({ keys: [{ ...jwk, kid: 'synthetic-key' }] });
      if (String(raw) === 'https://oauth.telegram.org/token') {
        if (tokenReply === 'http401')
          return Response.json(
            { error: 'synthetic-private-provider-error' },
            { status: 401 },
          );
        if (tokenReply === 'missing') return Response.json({});
        if (tokenReply === 'invalid_client' || tokenReply === 'invalid_grant')
          return Response.json({
            error: tokenReply,
            error_description: 'synthetic-private-provider-description',
          });
        if (tokenReply === 'malformed')
          return Response.json({
            id_token: 'synthetic-private-malformed-token',
          });
        const now = Math.floor(Date.now() / 1000);
        const body =
          Buffer.from(
            JSON.stringify({ alg: 'RS256', kid: 'synthetic-key' }),
          ).toString('base64url') +
          '.' +
          Buffer.from(
            JSON.stringify({
              iss: 'https://oauth.telegram.org',
              aud: clientId,
              sub: subject,
              phone_number: '12025550123',
              phone_number_verified: true,
              iat: now,
              exp: now + 600,
            }),
          ).toString('base64url');
        const id_token =
          body +
          '.' +
          createSign('RSA-SHA256')
            .update(body)
            .end()
            .sign(pair.privateKey)
            .toString('base64url');
        return Response.json({ id_token });
      }
      if (
        String(raw) ===
        'https://api.yclients.com/api/v1/company/12345/clients/search'
      )
        return Response.json({
          success: true,
          data:
            registryReply === 'missing'
              ? []
              : [
                  {
                    id: 123,
                    name: 'Synthetic client',
                    phone: '+12025550123',
                    visits_count: 1,
                    sold_amount: 0,
                    last_visit_date: null,
                  },
                  ...(registryReply === 'ambiguous'
                    ? [
                        {
                          id: 124,
                          name: 'Synthetic duplicate',
                          phone: '+12025550123',
                          visits_count: 0,
                          sold_amount: 0,
                          last_visit_date: null,
                        },
                      ]
                    : []),
                ],
        });
      throw new Error('Unlisted external wire request');
    };
    if (launchContract === OWNER_TELEGRAM_BATCH_PROFILE)
      await db.prisma.authIdentity.create({
        data: {
          tenantId: tenant.id,
          userId: owner.id,
          provider: 'telegram',
          providerUserId: subject,
        },
      });
    // This synthetic local-session middleware is diagnostic, never clause evidence.
    const diagnostic = new EvidenceWriter(Object.freeze({}));
    http = await bootHttp(diagnostic, async (app) => {
      // Match the retained stage-0 environment; a generic test default would
      // hide the real finder refusal observed after a successful owner link.
      app.get(ConfigService).set('PWA_TENANT_INSTALL_ENABLED', 'false');
      app
        .get(ConfigService)
        .set('TELEGRAM_CLIENT_SECRET', 'synthetic-client-secret-not-real');
      app
        .get(ConfigService)
        .set('YCLIENTS_PARTNER_TOKEN', 'synthetic-partner-token-not-real');
      runtime = await installOwnerTelegram({
        app,
        prisma: app.get(PrismaService),
        require: currentClassLoader,
        backend: process.cwd(),
        launch: {
          plan: { scope, origin, clientId, contract: launchContract },
          assertCurrent() {
            if (expired)
              throw new ForbiddenException('Synthetic execution window closed');
          },
        },
        nativeFetch: (raw) => Promise.resolve(wireReply(raw)),
        trace: (event) => {
          trace.push(event);
        },
      });
      jest
        .spyOn(globalThis, 'fetch')
        .mockImplementation(runtime.fetch.bind(runtime));
      const emitHttp = createReadTrace((event) => httpTrace.push(event));
      app.use((req: Request, res: ExpressResponse, next: () => void) => {
        const reason = ownerTelegramIngress(
          req.method,
          req.originalUrl,
          req.headers,
          req.body,
          origin,
          scope,
          launchContract,
        );
        traceHttpRequest(req, res, emitHttp, reason);
        if (reason) {
          res.status(403).json({ error: { code: reason } });
          return;
        }
        runtime.runRequest(req, res, next);
      });
    });
  });
  afterEach(async () => {
    runtime?.stop();
    jest.restoreAllMocks();
    try {
      await http?.close();
    } finally {
      try {
        // Repeated mutation runs share a proof DB. Retain identity/audit history,
        // but keep this completed fixture out of the public tenant search.
        if (fixtureTenantId)
          await db.prisma.tenant.update({
            where: { id: fixtureTenantId },
            data: { status: 'cancelled' },
          });
      } finally {
        await db?.close();
      }
    }
  });
  afterAll(async () => {
    const verification = await bootFixtureContext();
    try {
      // Independent reread catches a removed cleanup without deleting retained
      // episodes, changing search behavior, or touching another suite's tenants.
      const retained = await verification.prisma.tenant.findMany({
        where: { id: { in: retainedFixtureTenantIds } },
        select: { status: true },
      });
      expect(retained).toHaveLength(retainedFixtureTenantIds.length);
      expect(retained.every((row) => row.status === 'cancelled')).toBe(true);
    } finally {
      await verification.close();
    }
  });
  const post = (route: string, body: object, token?: string) => {
    const r = request(http.app.getHttpServer()).post('/api/' + route);
    if (token) r.set('Authorization', `Bearer ${token}`);
    return r.send(body);
  };
  async function ownerToken() {
    const r = await post('auth/login', {
      tenantSlug: tenant.slug,
      email: owner.email,
      password: owner.password,
    });
    expect(r.status).toBe(201);
    return (r.body as { access_token: string }).access_token;
  }
  async function start(link: boolean, token?: string) {
    const r = await post(
      'auth/oauth/telegram/' + (link ? 'link/start' : 'start'),
      {
        ...(link ? {} : { tenantSlug: tenant.slug }),
        platform: 'web',
        redirectUri: origin + '/oauth-callback.html',
      },
      token,
    );
    expect(r.status).toBe(201);
    return (r.body as { state: string }).state;
  }
  async function linked() {
    const token = await ownerToken(),
      state = await start(true, token);
    const r = await post(
      'auth/oauth/telegram/link/complete',
      { state, code: 'synthetic-code' },
      token,
    );
    expect(r.status).toBe(201);
    return token;
  }
  describe('approved saved-login batch', () => {
    beforeAll(() => {
      launchContract = OWNER_TELEGRAM_BATCH_PROFILE;
    });
    afterAll(() => {
      launchContract = OWNER_TELEGRAM_PROFILE;
    });
    it('two failures then a fresh login bind once with the same in-memory provider setup; fourth start refused', async () => {
      tokenReply = 'http401';
      for (let attempt = 0; attempt < 2; attempt++) {
        const state = await start(false);
        const failed = await post('auth/oauth/telegram/complete', {
          state,
          code: 'synthetic-code',
        });
        expect(failed.status).toBe(400);
      }
      tokenReply = 'signed';
      const state = await start(false);
      const result = await post('auth/oauth/telegram/complete', {
        state,
        code: 'synthetic-code',
      });
      expect(result.status).toBe(201);
      expect(
        (result.body as { client_binding: { status: string } }).client_binding
          .status,
      ).toBe('linked');
      expect(runtime.counters.routes.telegram_token).toBe(3);
      expect(runtime.counters.routes.client_registry).toBe(1);
      expect(
        await db.prisma.clientChannelLink.count({
          where: { tenantId: tenant.id },
        }),
      ).toBe(1);
      expect(
        await db.prisma.authIdentity.count({ where: { tenantId: tenant.id } }),
      ).toBe(1);
      const fourth = await post('auth/oauth/telegram/start', {
        tenantSlug: tenant.slug,
        platform: 'web',
        redirectUri: origin + '/oauth-callback.html',
      });
      expect(fourth.status).toBe(403);
    });
    it('concurrent and replayed completion never reuse an exchange or create a second binding', async () => {
      const state = await start(false),
        body = { state, code: 'synthetic-code' };
      const results = await Promise.all([
        post('auth/oauth/telegram/complete', body),
        post('auth/oauth/telegram/complete', body),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 403]);
      expect((await post('auth/oauth/telegram/complete', body)).status).toBe(
        403,
      );
      expect(runtime.counters.routes.telegram_token).toBe(1);
      expect(
        await db.prisma.clientChannelLink.count({
          where: { tenantId: tenant.id },
        }),
      ).toBe(1);
    });
    it('re-linking, foreign tenant and expired permit remain refused', async () => {
      const token = await ownerToken();
      const relink = await post(
        'auth/oauth/telegram/link/start',
        { platform: 'web', redirectUri: origin + '/oauth-callback.html' },
        token,
      );
      expect(relink.status).toBe(403);
      expect(
        (
          await post('auth/oauth/telegram/start', {
            tenantSlug: 'foreign',
            platform: 'web',
            redirectUri: origin + '/oauth-callback.html',
          })
        ).status,
      ).toBe(403);
      expired = true;
      expect(
        (
          await post('auth/oauth/telegram/start', {
            tenantSlug: tenant.slug,
            platform: 'web',
            redirectUri: origin + '/oauth-callback.html',
          })
        ).status,
      ).toBe(403);
      expect(dispatches).toBe(0);
    });
    it('saved identity is mandatory and no account is silently re-linked', async () => {
      await db.prisma.authIdentity.deleteMany({
        where: { tenantId: tenant.id },
      });
      expect(
        (
          await post('auth/oauth/telegram/start', {
            tenantSlug: tenant.slug,
            platform: 'web',
            redirectUri: origin + '/oauth-callback.html',
          })
        ).status,
      ).toBe(403);
      expect(dispatches).toBe(0);
    });
    it('four simultaneous starts can reserve only three attempts', async () => {
      const identities = http.app.get(PrismaService).authIdentity;
      const original = identities.findFirst.bind(identities);
      let entered = 0,
        release!: () => void;
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      // This barrier only models the awaited lookup, not Prisma's fluent relations.
      const lookup: {
        findFirst: (
          args?: Parameters<typeof original>[0],
        ) => PromiseLike<Awaited<ReturnType<typeof original>>>;
      } = identities;
      jest.spyOn(lookup, 'findFirst').mockImplementation(async (args) => {
        entered++;
        if (entered === 4) release();
        await barrier;
        return original(args);
      });
      const body = {
        tenantSlug: tenant.slug,
        platform: 'web',
        redirectUri: origin + '/oauth-callback.html',
      };
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          post('auth/oauth/telegram/start', body),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 201, 201, 403]);
      expect(dispatches).toBe(0);
    });
  });
  it.each([
    ['http401', 401, 'social_exchange_failed', undefined],
    ['missing', 200, 'social_exchange_failed', 'missing_id_token'],
    ['malformed', 200, 'social_token_invalid', 'id_token_present'],
    ['invalid_client', 200, 'social_exchange_failed', 'oauth_invalid_client'],
    ['invalid_grant', 200, 'social_exchange_failed', 'oauth_invalid_grant'],
  ] as const)(
    'safe status distinguishes %s while canonical completion refuses and consumes once',
    async (reply, status, code, outcome) => {
      tokenReply = reply;
      const token = await ownerToken(),
        state = await start(true, token);
      const r = await post(
        'auth/oauth/telegram/link/complete',
        { state, code: 'synthetic-code' },
        token,
      );
      expect(r.status).toBe(400);
      expect((r.body as { error: { code: string } }).error.code).toBe(code);
      expect(trace).toEqual([
        {
          surface: 'provider',
          route: 'telegram_token',
          method: 'POST',
          stage: 'entered',
          status: null,
          code: null,
        },
        {
          surface: 'provider',
          route: 'telegram_token',
          method: 'POST',
          stage: status === 401 ? 'refused' : 'completed',
          status,
          code:
            status === 401 ? 'provider_http_error' : 'provider_response_read',
          ...(outcome ? { telegramTokenOutcome: outcome } : {}),
        },
      ]);
      expect(JSON.stringify(trace)).not.toContain('synthetic-private');
      expect(runtime.counters.routes).toEqual({ telegram_token: 1 });
      expect(
        await db.prisma.authIdentity.count({ where: { tenantId: tenant.id } }),
      ).toBe(0);
      expect(
        await db.prisma.clientChannelLink.count({
          where: { tenantId: tenant.id },
        }),
      ).toBe(0);
      const replay = await post(
        'auth/oauth/telegram/link/complete',
        { state, code: 'synthetic-code' },
        token,
      );
      expect(replay.status).toBe(403);
      expect(dispatches).toBe(1);
    },
  );
  it('real A23 link then fresh signed login creates one verified personal Client, no import or role change', async () => {
    await linked();
    expect(
      await db.prisma.clientChannelLink.count({
        where: { tenantId: tenant.id },
      }),
    ).toBe(0);
    const found = await request(http.app.getHttpServer())
      .get('/api/mobile/pwa/search')
      .query({ q: tenant.slug });
    expect(found.status).toBe(200);
    expect(
      (found.body as { items: { tenant_slug: string }[] }).items.map(
        (item) => item.tenant_slug,
      ),
    ).toEqual([tenant.slug]);
    expect(runtime.counters.routes.client_registry ?? 0).toBe(0);
    const state = await start(false);
    const r = await post('auth/oauth/telegram/complete', {
      state,
      code: 'synthetic-code',
    });
    expect(r.status).toBe(201);
    expect(
      (r.body as { client_binding: { status: string }; user: { role: string } })
        .client_binding.status,
    ).toBe('linked');
    expect(
      httpTrace.find(
        (e) => e.route === 'telegram_login_complete' && e.stage === 'completed',
      )?.telegramBindingOutcome,
    ).toBe('linked');
    expect(JSON.stringify(httpTrace)).not.toContain('+12025550123');
    expect(JSON.stringify(httpTrace)).not.toContain('access_token');
    expect((r.body as { user: { role: string } }).user.role).toBe(
      UserRole.TENANT_OWNER,
    );
    expect(
      await db.prisma.clientChannelLink.count({
        where: { tenantId: tenant.id, provider: 'maya_user', revokedAt: null },
      }),
    ).toBe(1);
    expect(
      await db.prisma.appointment.count({ where: { tenantId: tenant.id } }),
    ).toBe(0);
    expect(runtime.counters.routes.client_registry).toBe(1);
    const beforeRead = dispatches;
    const session = (r.body as { access_token: string }).access_token;
    const profile = await request(http.app.getHttpServer())
      .get('/api/client-channel/profile')
      .set('Authorization', `Bearer ${session}`);
    expect(profile.status).toBe(200);
    expect(profile.body).toEqual({
      profile_id: null,
      preferred_locale: null,
      privacy_consent_at: null,
      marketing_consent_at: null,
      updated_at: null,
    });
    const history = await request(http.app.getHttpServer())
      .get('/api/client-channel/appointments')
      .set('Authorization', `Bearer ${session}`);
    expect(history.status).toBe(200);
    expect(history.body).toEqual([]);
    expect(dispatches).toBe(beforeRead);
    const replay = await post('auth/oauth/telegram/complete', {
      state,
      code: 'synthetic-code',
    });
    expect(replay.status).toBe(403);
    for (const route of [
      'client-channel/consent',
      'client-channel/challenges',
      'ai/chat',
      'widgets/intent',
      'integrations/crm/activate',
    ])
      expect(
        (
          await post(
            route,
            {},
            (r.body as { access_token: string }).access_token,
          )
        ).status,
      ).toBe(403);
  });
  it.each(['missing', 'ambiguous'] as const)(
    'canonical %s match remains unlinked and emits only a safe diagnostic reason',
    async (mode) => {
      await linked();
      registryReply = mode;
      const state = await start(false);
      const r = await post('auth/oauth/telegram/complete', {
        state,
        code: 'synthetic-code',
      });
      const reason =
        mode === 'missing' ? 'client_not_found' : 'client_phone_ambiguous';
      expect(r.status).toBe(201);
      expect((r.body as { client_binding: unknown }).client_binding).toEqual({
        status: 'unlinked',
        reason,
      });
      expect(
        httpTrace.find(
          (e) =>
            e.route === 'telegram_login_complete' && e.stage === 'completed',
        )?.telegramBindingOutcome,
      ).toBe(reason);
      expect(
        await db.prisma.clientChannelLink.count({
          where: { tenantId: tenant.id },
        }),
      ).toBe(0);
      expect(runtime.counters.routes.client_registry).toBe(1);
      expect(JSON.stringify(httpTrace)).not.toContain('+12025550123');
      expect(JSON.stringify(httpTrace)).not.toContain('access_token');
    },
  );
  it('finder remains bounded and hides a tenant that is not client-ready', async () => {
    for (const route of [
      '/api/mobile/pwa/search?q=other',
      '/api/mobile/pwa/search?q=' + tenant.slug.slice(0, 3),
      '/api/mobile/pwa/search?q=' + tenant.slug + '&city=other',
      '/api/mobile/pwa/' + tenant.slug + '/install',
      '/api/mobile/pwa/' + tenant.slug + '/manifest.webmanifest',
      '/api/mobile/pwa/' + tenant.slug + '/qr.svg',
    ])
      expect((await request(http.app.getHttpServer()).get(route)).status).toBe(
        403,
      );
    await db.prisma.tenant.update({
      where: { id: tenant.id },
      data: { allowSelfRegistration: false },
    });
    const hidden = await request(http.app.getHttpServer())
      .get('/api/mobile/pwa/search')
      .query({ q: tenant.slug });
    expect(hidden.status).toBe(200);
    expect((hidden.body as { items: unknown[] }).items).toEqual([]);
    expect(dispatches).toBe(0);
    expect(
      await db.prisma.authIdentity.count({ where: { tenantId: tenant.id } }),
    ).toBe(0);
    expect(
      await db.prisma.clientChannelLink.count({
        where: { tenantId: tenant.id },
      }),
    ).toBe(0);
  });
  it('expired scope refuses the exact finder and stop restores the prior disabled setting', async () => {
    expired = true;
    const refused = await request(http.app.getHttpServer())
      .get('/api/mobile/pwa/search')
      .query({ q: tenant.slug });
    expect(refused.status).toBe(403);
    expect(dispatches).toBe(0);
    runtime.stop();
    expect(http.app.get(ConfigService).get('PWA_TENANT_INSTALL_ENABLED')).toBe(
      'false',
    );
  });
  it('wrong account/password tenant and link-purpose substitution fail before a provider call', async () => {
    expect(
      (
        await post('auth/login', {
          tenantSlug: tenant.slug,
          email: foreign.email,
          password: foreign.password,
        })
      ).status,
    ).toBe(403);
    const token = await ownerToken(),
      state = await start(true, token);
    expect(
      (
        await post('auth/oauth/telegram/complete', {
          state,
          code: 'synthetic-code',
        })
      ).status,
    ).toBe(403);
    expect(dispatches).toBe(0);
    expect(
      await db.prisma.authIdentity.count({ where: { tenantId: tenant.id } }),
    ).toBe(0);
  });
  it('unlinked verified Telegram subject cannot create a second account during fresh login', async () => {
    await linked();
    subject = 'different-valid-signed-subject';
    const users = await db.prisma.user.count({
        where: { tenantId: tenant.id },
      }),
      state = await start(false);
    expect(
      (
        await post('auth/oauth/telegram/complete', {
          state,
          code: 'synthetic-code',
        })
      ).status,
    ).toBe(403);
    expect(await db.prisma.user.count({ where: { tenantId: tenant.id } })).toBe(
      users,
    );
    expect(
      await db.prisma.clientChannelLink.count({
        where: { tenantId: tenant.id },
      }),
    ).toBe(0);
    expect(runtime.counters.routes.client_registry ?? 0).toBe(0);
  });
  it('concurrent completion has one winner; expired scope cannot read or reach provider', async () => {
    const token = await ownerToken(),
      state = await start(true, token);
    const results = await Promise.all(
      [1, 2].map(() =>
        post(
          'auth/oauth/telegram/link/complete',
          { state, code: 'synthetic-code' },
          token,
        ),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 403]);
    expect(
      await db.prisma.authIdentity.count({ where: { tenantId: tenant.id } }),
    ).toBe(1);
    expired = true;
    const before = dispatches;
    expect(
      (
        await request(http.app.getHttpServer())
          .get('/api/client-channel/status')
          .set('Authorization', `Bearer ${token}`)
      ).status,
    ).toBe(403);
    expect(dispatches).toBe(before);
  });
  it('current membership withdrawal refuses a previously issued session before provider dispatch', async () => {
    const token = await ownerToken();
    await db.prisma.membership.updateMany({
      where: { tenantId: tenant.id, userId: owner.id },
      data: { status: 'suspended' },
    });
    expect(
      (
        await post(
          'auth/oauth/telegram/link/start',
          { platform: 'web', redirectUri: origin + '/oauth-callback.html' },
          token,
        )
      ).status,
    ).toBe(401); // Canonical JWT current-membership guard refuses first.
    expect(dispatches).toBe(0);
    expect(
      await db.prisma.authIdentity.count({ where: { tenantId: tenant.id } }),
    ).toBe(0);
  });
  it('foreign tenant credentials cannot replace the exact selected owner scope', async () => {
    const otherTenant = await fx.tenant('foreign Telegram scope');
    const otherOwner = await fx.user(otherTenant, UserRole.TENANT_OWNER);
    expect(
      (
        await post('auth/login', {
          tenantSlug: otherTenant.slug,
          email: otherOwner.email,
          password: otherOwner.password,
        })
      ).status,
    ).toBe(403);
    expect(dispatches).toBe(0);
  });
  it('signed Telegram identity belonging to another account cannot be reassigned by A23', async () => {
    await db.prisma.authIdentity.create({
      data: {
        tenantId: tenant.id,
        userId: foreign.id,
        provider: 'telegram',
        providerUserId: subject,
      },
    });
    const token = await ownerToken(),
      state = await start(true, token);
    expect(
      (
        await post(
          'auth/oauth/telegram/link/complete',
          { state, code: 'synthetic-code' },
          token,
        )
      ).status,
    ).toBe(403);
    expect(
      await db.prisma.authIdentity.findFirst({
        where: { tenantId: tenant.id, providerUserId: subject },
      }),
    ).toEqual(expect.objectContaining({ userId: foreign.id }));
    expect(
      await db.prisma.clientChannelLink.count({
        where: { tenantId: tenant.id },
      }),
    ).toBe(0);
    expect(runtime.counters.routes.client_registry ?? 0).toBe(0);
  });
});
