// Synthetic signed Telegram issuer + synthetic CRM snapshot; real HTTP/PG owners.
// No network to Telegram/YCLIENTS/SMS, no customer data, no production credentials.
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  createHash,
  createSign,
  generateKeyPairSync,
  randomUUID,
} from 'node:crypto';
import request from 'supertest';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import {
  TelegramClientBindingService,
  type VerifiedTelegramClientLogin,
} from '../../src/auth/telegram-client-binding.service';
import { CrmService } from '../../src/crm/crm.service';
import { ClientIdentityService } from '../../src/crm/client-identity.service';
import { ClientChannelLinkService } from '../../src/crm/client-channel-link.service';
import { ClientProfileReadService } from '../../src/crm/client-profile-read.service';
import { ClientAppointmentReadService } from '../../src/crm/client-appointment-read.service';
import { PersonalClientContextService } from '../../src/appointments/personal-client-context.service';
import { AppointmentReconciliationService } from '../../src/crm/appointment-reconciliation.service';
import { ClientChannelRuntimeService } from '../../src/crm/client-channel-runtime.service';
import type { CrmJournalAppointment } from '../../src/crm/crm-adapter.interface';
import { AiToolHandlerService } from '../../src/ai-tools/ai-tool-handler.service';
import { personalHistoryReply } from '../../src/ai-tools/personal-history-presentation';
import { GovernedSettingsReadService } from '../../src/package5-wave1/governed-settings.read';
import { Package5Wave1CanonicalCutoverService } from '../../src/package5-wave1/package5-wave1-canonical-cutover.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TenantContextService } from '../../src/tenancy/tenant-context.service';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import { type Fixtures } from './support/fixtures';
import {
  OAUTH_START_IP_PREFLIGHT_POLICY,
  resetLoopbackOauthPreflight,
} from './support/login-rate-limit';

type LoginBody = {
  client_binding: { status: string };
  user: { role: string };
  access_token: string;
};
type ChatProofBody = {
  reply: string;
  action: unknown;
  grounding: { status: string };
};
type ConversationProofBody = {
  conversationId: string | null;
  turns: Array<{ role: string; text: string }>;
};
const phone = '+12025550123';
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
describe('Telegram first Client link [HTTP] [PG] [synthetic issuer/source]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures;
  let crm: CrmService,
    context: TenantContextService,
    binding: TelegramClientBindingService;
  const cancelled: string[] = [];
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = pair.publicKey.export({ format: 'jwk' });
  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
    crm = http.app.get(CrmService);
    context = http.app.get(TenantContextService);
    binding = http.app.get(TelegramClientBindingService);
  });
  beforeEach(async () => {
    // Independent cases share one loopback IP. Keep the actual 30/10m policy
    // within each case; only the dedicated proof DB preflight bucket is reset.
    await resetLoopbackOauthPreflight(db.prisma);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    for (const id of cancelled.splice(0))
      await db.prisma.tenant.update({
        where: { id },
        data: { status: 'cancelled' },
      });
  });
  afterAll(async () => {
    await http?.close();
    await db?.close();
  });

  async function fixture(role = UserRole.CLIENT, linkedIdentity = true) {
    const tenant = await fx.tenant(
      'Telegram initial binding',
      CalendarSource.EXTERNAL,
    );
    cancelled.push(tenant.id);
    const user = await fx.user(tenant, role);
    await db.prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        currentPeriodEnd: new Date('2099-01-01'),
        allowSelfRegistration: true,
      },
    });
    const providerUserId = randomUUID();
    if (linkedIdentity)
      await db.prisma.authIdentity.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          provider: 'telegram',
          providerUserId,
          phone,
        },
      });
    if (linkedIdentity)
      await db.prisma.user.update({ where: { id: user.id }, data: { phone } });
    const actor = await fx.actor(tenant, user);
    await db.prisma.crmIntegration.create({
      data: {
        tenantId: tenant.id,
        provider: 'yclients',
        encryptedApiToken: db.encryption.encrypt('synthetic-token-not-used'),
        settingsJson: { companyId: 12345 },
        status: 'active',
      },
    });
    const flow = await db.prisma.authFlowState.create({
      data: {
        tenantId: tenant.id,
        provider: 'telegram',
        state: randomUUID(),
        redirectUri: 'https://maya.example/oauth-callback.html',
        codeVerifier: 'synthetic-pkce',
        consumedAt: new Date(),
        expiresAt: new Date(Date.now() + 600_000),
      },
    });
    const proof: VerifiedTelegramClientLogin = {
      tenantId: tenant.id,
      userId: user.id,
      sessionId: actor.sessionId,
      flowId: flow.id,
      providerUserId,
      phone,
      tokenHash: digest(randomUUID()),
      issuedAt: Date.now(),
      expiresAt: Date.now() + 600_000,
    };
    const registry = {
      provider: 'yclients',
      complete: true as const,
      generated_at: new Date().toISOString(),
      clients: [
        {
          external_id: randomUUID(),
          phone,
          name: 'Synthetic Client',
          visits_count: 2,
          sold_amount: 0,
          last_visit_date: null,
        },
      ],
    };
    const source = jest.spyOn(crm, 'getClientRegistry').mockImplementation(() =>
      Promise.resolve({
        ...registry,
        generated_at: new Date().toISOString(),
      }),
    );
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('External network forbidden'));
    const run = (overrides: Partial<VerifiedTelegramClientLogin> = {}) =>
      context.runAsAuthPrincipal(actor, () =>
        binding.afterLogin({ ...proof, ...overrides }),
      );
    const count = () =>
      db.prisma.clientChannelLink.count({ where: { tenantId: tenant.id } });
    const register = () =>
      context.runAsSystemTenant(tenant.id, () =>
        http.app.get(ClientIdentityService).registerCrmClient({
          tenantId: tenant.id,
          provider: 'yclients',
          externalId: registry.clients[0].external_id,
        }),
      );
    return {
      tenant,
      user,
      actor,
      proof,
      registry,
      source,
      run,
      count,
      register,
    };
  }

  function installSignedIssuer(
    f: Awaited<ReturnType<typeof fixture>>,
    claims: Record<string, unknown> = {},
    forgedSignature = false,
  ) {
    const config = http.app.get(ConfigService),
      get = ConfigService.prototype.get.bind(config);
    const values: Record<string, unknown> = {
      TELEGRAM_LOGIN_ENABLED: 'true',
      TELEGRAM_CLIENT_ID: 'synthetic-telegram-client',
      TELEGRAM_CLIENT_SECRET: 'synthetic-secret',
      OAUTH_ALLOWED_REDIRECT_URIS: 'https://maya.example/oauth-callback.html',
      TELEGRAM_JWKS_URL: 'https://oauth.telegram.org/.well-known/jwks.json',
    };
    jest
      .spyOn(config, 'get')
      .mockImplementation((key: string) =>
        key in values ? values[key] : get(key),
      );
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: 'https://oauth.telegram.org',
      aud: values.TELEGRAM_CLIENT_ID,
      sub: f.proof.providerUserId,
      phone_number: phone.slice(1),
      phone_number_verified: true,
      iat: now,
      exp: now + 600,
      ...claims,
    };
    const body =
      Buffer.from(
        JSON.stringify({ alg: 'RS256', kid: 'synthetic-tg-key' }),
      ).toString('base64url') +
      '.' +
      Buffer.from(JSON.stringify(payload)).toString('base64url');
    const token =
      body +
      '.' +
      createSign('RSA-SHA256')
        .update(body)
        .end()
        .sign(pair.privateKey)
        .toString('base64url');
    (globalThis.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === 'https://oauth.telegram.org/.well-known/jwks.json')
        return Promise.resolve({
          ok: true,
          text: () =>
            Promise.resolve(
              JSON.stringify({ keys: [{ ...jwk, kid: 'synthetic-tg-key' }] }),
            ),
        });
      if (url === 'https://oauth.telegram.org/token')
        return Promise.resolve({
          ok: true,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                id_token: forgedSignature
                  ? token.slice(0, token.lastIndexOf('.') + 1) +
                    Buffer.alloc(256).toString('base64url')
                  : token,
              }),
            ),
        });
      return Promise.reject(new Error('Unexpected external request'));
    });
  }

  async function signedLogin(
    f: Awaited<ReturnType<typeof fixture>>,
    claims: Record<string, unknown> = {},
    forgedSignature = false,
  ) {
    installSignedIssuer(f, claims, forgedSignature);
    const start = await request(http.app.getHttpServer())
      .post('/api/auth/oauth/telegram/start')
      .send({
        tenantSlug: f.tenant.slug,
        redirectUri: 'https://maya.example/oauth-callback.html',
      });
    expect(start.status).toBe(201);
    const state = new URL(
      (start.body as { auth_url: string }).auth_url,
    ).searchParams.get('state')!;
    const complete = (extra: Record<string, unknown> = {}) =>
      request(http.app.getHttpServer())
        .post('/api/auth/oauth/telegram/complete')
        .send({ state, code: 'synthetic-code', ...extra });
    return { complete, state };
  }

  it.each(['active', 'trial'] as const)(
    'existing %s business owner with no phone/Telegram: authenticated A23 link, then fresh login creates personal Client without account duplication',
    async (status) => {
      const f = await fixture(UserRole.TENANT_OWNER, false);
      await db.prisma.tenant.update({
        where: { id: f.tenant.id },
        data: {
          status,
          trialFullAccess: status === 'trial',
          trialEndsAt:
            status === 'trial' ? new Date(Date.now() + 86400000) : null,
        },
      });
      const bearer = await http.login(
        f.tenant.slug,
        f.user.email,
        f.user.password,
      );
      installSignedIssuer(f);
      const start = await request(http.app.getHttpServer())
        .post('/api/auth/oauth/telegram/link/start')
        .set('Authorization', `Bearer ${bearer}`)
        .send({
          platform: 'web',
          redirectUri: 'https://maya.example/oauth-callback.html',
        });
      if (start.status !== 201) {
        const problem = start.body as {
          message?: string;
          error?: { code?: string };
        };
        throw new Error(
          `Authenticated link start: ${start.status} ${problem.error?.code ?? problem.message ?? 'unknown'}`,
        );
      }
      expect(start.status).toBe(201);
      expect((start.body as { tenant_slug: string }).tenant_slug).toBe(
        f.tenant.slug,
      );
      const flow = {
        state: new URL(
          (start.body as { auth_url: string }).auth_url,
        ).searchParams.get('state')!,
      };
      const link = () =>
        request(http.app.getHttpServer())
          .post('/api/auth/oauth/telegram/link/complete')
          .set('Authorization', `Bearer ${bearer}`)
          .send({ state: flow.state, code: 'synthetic-code' });
      const result = await link();
      expect(result.status).toBe(201);
      expect(result.body).toMatchObject({
        linked: true,
        provider: 'telegram',
        user: { id: f.user.id, role: UserRole.TENANT_OWNER },
      });
      expect(await f.count()).toBe(0);
      expect(f.source).not.toHaveBeenCalled();
      expect(
        await db.prisma.client.count({ where: { tenantId: f.tenant.id } }),
      ).toBe(0);
      expect(
        await db.prisma.authIdentity.count({
          where: {
            tenantId: f.tenant.id,
            userId: f.user.id,
            provider: 'telegram',
          },
        }),
      ).toBe(1);
      expect((await link()).status).toBeGreaterThanOrEqual(400);
      const login = await (await signedLogin(f)).complete();
      if (login.status !== 201) {
        const error = login.body as {
          error?: { code?: string };
          message?: string;
        };
        throw new Error(
          `Fresh post-link login refused: ${login.status} ${error.error?.code ?? error.message ?? 'unknown'}`,
        );
      }
      expect(login.status).toBe(201);
      expect(login.body).toMatchObject({
        is_new_user: false,
        user: { id: f.user.id, role: UserRole.TENANT_OWNER },
        client_binding: { status: 'linked' },
      });
      expect(await f.count()).toBe(1);
      expect(f.source).toHaveBeenCalledTimes(1);
      expect(
        await db.prisma.user.count({ where: { tenantId: f.tenant.id } }),
      ).toBe(1);
      expect(
        await db.prisma.membership.count({ where: { tenantId: f.tenant.id } }),
      ).toBe(1);
    },
  );

  it.each([
    'missing-session',
    'client-role',
    'tenantSlug',
    'userId',
    'clientId',
    'phone',
    'foreign-callback',
    'revoked-session',
  ] as const)(
    'authenticated Telegram link start refuses %s without issuing a flow',
    async (negative) => {
      const f = await fixture(
        negative === 'client-role' ? UserRole.CLIENT : UserRole.TENANT_OWNER,
        false,
      );
      installSignedIssuer(f);
      const bearer = await http.login(
        f.tenant.slug,
        f.user.email,
        f.user.password,
      );
      if (negative === 'revoked-session')
        await request(http.app.getHttpServer())
          .post('/api/auth/logout')
          .set('Authorization', `Bearer ${bearer}`)
          .send({})
          .expect(201);
      const before = await db.prisma.authFlowState.count({
        where: { tenantId: f.tenant.id },
      });
      const body: Record<string, unknown> = {
        platform: 'web',
        redirectUri:
          negative === 'foreign-callback'
            ? 'https://foreign.example/callback'
            : 'https://maya.example/oauth-callback.html',
      };
      if (['tenantSlug', 'userId', 'clientId', 'phone'].includes(negative))
        body[negative] = 'caller-selected';
      const call = request(http.app.getHttpServer()).post(
        '/api/auth/oauth/telegram/link/start',
      );
      if (negative !== 'missing-session')
        call.set('Authorization', `Bearer ${bearer}`);
      const result = await call.send(body);
      expect(result.status).toBeGreaterThanOrEqual(400);
      expect(result.status).toBeLessThan(500);
      expect(
        await db.prisma.authFlowState.count({
          where: { tenantId: f.tenant.id },
        }),
      ).toBe(before);
      expect(await f.count()).toBe(0);
      expect(f.source).not.toHaveBeenCalled();
    },
  );

  it.each(['missing-session', 'foreign-tenant', 'forged-signature'] as const)(
    'first business Telegram link refuses %s without creating an identity or Client',
    async (negative) => {
      const f = await fixture(UserRole.TENANT_OWNER, false);
      const other =
        negative === 'foreign-tenant'
          ? await fixture(UserRole.TENANT_OWNER, false)
          : f;
      const bearer =
        negative === 'missing-session'
          ? null
          : await http.login(
              other.tenant.slug,
              other.user.email,
              other.user.password,
            );
      const flow = await signedLogin(f, {}, negative === 'forged-signature');
      let call = request(http.app.getHttpServer()).post(
        '/api/auth/oauth/telegram/link/complete',
      );
      if (bearer) call = call.set('Authorization', `Bearer ${bearer}`);
      const result = await call.send({
        state: flow.state,
        code: 'synthetic-code',
      });
      expect(result.status).toBe(
        negative === 'missing-session'
          ? 401
          : negative === 'foreign-tenant'
            ? 403
            : 400,
      );
      expect(
        await db.prisma.authIdentity.count({
          where: { tenantId: f.tenant.id },
        }),
      ).toBe(0);
      expect(
        await db.prisma.client.count({ where: { tenantId: f.tenant.id } }),
      ).toBe(0);
      expect(await f.count()).toBe(0);
      expect(f.source).not.toHaveBeenCalled();
    },
  );

  it('OAuth fixture hygiene preserves the real 30-attempt refusal and all non-preflight buckets', async () => {
    const f = await fixture();
    await signedLogin(f);
    const start = () =>
      request(http.app.getHttpServer())
        .post('/api/auth/oauth/telegram/start')
        .send({
          tenantSlug: f.tenant.slug,
          redirectUri: 'https://maya.example/oauth-callback.html',
        });
    for (let i = 1; i < 30; i++) expect((await start()).status).toBe(201);
    expect((await start()).status).toBe(429);
    const buckets = await db.prisma.authRateLimitBucket.findMany({
      orderBy: { id: 'asc' },
    });
    const preflight = buckets.filter(
      (b) =>
        b.policyKey === OAUTH_START_IP_PREFLIGHT_POLICY && b.tenantId === null,
    );
    expect(preflight).toHaveLength(1);
    expect(await resetLoopbackOauthPreflight(db.prisma)).toBe(1);
    expect(
      await db.prisma.authRateLimitBucket.findMany({ orderBy: { id: 'asc' } }),
    ).toEqual(buckets.filter((b) => b.id !== preflight[0].id));
    expect(await resetLoopbackOauthPreflight(db.prisma)).toBe(0);
    expect((await start()).status).toBe(201);
  });

  it.each([UserRole.CLIENT, UserRole.TENANT_OWNER])(
    'signed login automatically links exact Client while retaining %s role',
    async (role) => {
      const f = await fixture(role),
        login = await signedLogin(f);
      const result = await login.complete();
      expect(result.status).toBe(201);
      expect((result.body as LoginBody).client_binding).toEqual({
        status: 'linked',
      });
      expect((result.body as LoginBody).user.role).toBe(role);
      expect(await f.count()).toBe(1);
      const link = await db.prisma.clientChannelLink.findFirstOrThrow({
        where: { tenantId: f.tenant.id },
      });
      const mapped = await db.prisma.crmClientLink.findFirstOrThrow({
        where: { tenantId: f.tenant.id },
      });
      expect(link.clientId).toBe(mapped.clientId);
      const audit = await db.prisma.auditLog.findMany({
        where: {
          tenantId: f.tenant.id,
          action: 'client.telegram_initial_link',
        },
      });
      expect(audit).toHaveLength(1);
      expect(audit[0].userId).toBe(f.user.id);
      expect(JSON.stringify([link, audit])).not.toContain(phone);
      expect(
        await db.prisma.clientConsentFact.count({
          where: { tenantId: f.tenant.id },
        }),
      ).toBe(0);
      const projection = await request(http.app.getHttpServer())
        .get('/api/client-channel/profile')
        .set(
          'Authorization',
          `Bearer ${(result.body as LoginBody).access_token}`,
        );
      expect(projection.status).toBe(200);
      const current = await request(http.app.getHttpServer())
        .get('/api/me')
        .set(
          'Authorization',
          `Bearer ${(result.body as LoginBody).access_token}`,
        );
      expect(current.status).toBe(200);
      expect(
        (current.body as { app_access: { available_modes: unknown[] } })
          .app_access.available_modes,
      ).toContainEqual(
        expect.objectContaining({
          mode: 'client',
          access: 'granted',
          profile_linked: true,
          role,
        }),
      );
      const replay = await login.complete();
      expect(replay.status).toBe(400);
      expect(await f.count()).toBe(1);
    },
  );

  it.each([false, undefined, 'true', 1])(
    'does not use an unverified phone claim (%s), including a stored matching phone',
    async (verified) => {
      const f = await fixture(),
        login = await signedLogin(f, { phone_number_verified: verified });
      const result = await login.complete();
      expect(result.status).toBe(201);
      expect((result.body as LoginBody).client_binding.status).toBe(
        'not_attempted',
      );
      expect(await f.count()).toBe(0);
      expect(f.source).not.toHaveBeenCalled();
    },
  );
  it('links a first-time Telegram registrant to the existing CRM card, without an existing Maya account', async () => {
    const f = await fixture();
    await db.prisma.authIdentity.deleteMany({
      where: { tenantId: f.tenant.id, userId: f.user.id },
    });
    await db.prisma.user.update({
      where: { id: f.user.id },
      data: { phone: null },
    });
    // Existing account registration remains Russia-only.
    f.registry.clients[0].phone = '+79990000001';
    const login = await signedLogin(f, { phone_number: '79990000001' });
    const result = await login.complete();
    expect(result.status).toBe(201);
    const body = result.body as LoginBody & {
      is_new_user: boolean;
      user: { id: string; role: string };
    };
    expect(body.is_new_user).toBe(true);
    expect(body.user.id).not.toBe(f.user.id);
    expect(body.client_binding).toEqual({ status: 'linked' });
    expect(await f.count()).toBe(1);
    expect(
      (
        await request(http.app.getHttpServer())
          .get('/api/client-channel/profile')
          .set('Authorization', `Bearer ${body.access_token}`)
      ).status,
    ).toBe(200);
  });
  it.each([
    { aud: 'foreign-client' },
    { iss: 'https://forged.example' },
    { exp: 1 },
  ])(
    'refuses forged/expired signed claims %j before binding',
    async (claims) => {
      const f = await fixture(),
        login = await signedLogin(f, claims);
      const result = await login.complete();
      expect(result.status).toBe(400);
      expect(await f.count()).toBe(0);
      expect(f.source).not.toHaveBeenCalled();
    },
  );
  it('refuses caller-selected Client, phone, tenant and channel in the login body', async () => {
    const f = await fixture(),
      login = await signedLogin(f);
    const result = await login.complete({
      clientId: 'chosen',
      tenantId: 'foreign',
      phone,
      channel: 'telegram',
    });
    expect(result.status).toBe(400);
    expect(await f.count()).toBe(0);
  });
  it('rejects a token with a forged signature before any Client lookup', async () => {
    const f = await fixture(),
      login = await signedLogin(f, {}, true);
    expect((await login.complete()).status).toBe(400);
    expect(await f.count()).toBe(0);
    expect(f.source).not.toHaveBeenCalled();
  });
  it('allows account login, but not Client binding, when CRM is unavailable', async () => {
    const f = await fixture(),
      login = await signedLogin(f);
    f.source.mockRejectedValue(new Error('Synthetic provider unavailable'));
    const result = await login.complete();
    expect(result.status).toBe(201);
    expect((result.body as LoginBody).client_binding.status).toBe('unlinked');
    expect(await f.count()).toBe(0);
  });
  it('matches the complete international number despite source formatting', async () => {
    const f = await fixture();
    f.registry.clients[0].phone = '+1 (202) 555-0123';
    expect((await f.run()).status).toBe('linked');
    expect(await f.count()).toBe(1);
  });
  it('retries a serializable CRM identity registration conflict through the same owner', async () => {
    const f = await fixture(),
      identities = http.app.get(ClientIdentityService);
    const original = identities.registerCrmClient.bind(identities);
    const register = jest
      .spyOn(identities, 'registerCrmClient')
      .mockImplementation(original)
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError(
          'Synthetic serialization conflict',
          { code: 'P2034', clientVersion: 'synthetic' },
        ),
      );
    expect((await f.run()).status).toBe('linked');
    expect(register).toHaveBeenCalledTimes(2);
    expect(await f.count()).toBe(1);
  });
  it('gives one concurrent callback winner, with one link and one audit', async () => {
    const f = await fixture(),
      login = await signedLogin(f);
    const results = await Promise.all([login.complete(), login.complete()]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(
      (results.find((r) => r.status === 201)!.body as LoginBody).client_binding
        .status,
    ).toBe('linked');
    expect(await f.count()).toBe(1);
  });
  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    'gives one initial writer under concurrent valid login contexts, run %s',
    async () => {
      const f = await fixture();
      const results = await Promise.all([f.run(), f.run(), f.run()]);
      expect(results.filter((r) => r.status === 'linked')).toHaveLength(1);
      expect(
        results.every((r) => ['linked', 'already_linked'].includes(r.status)),
      ).toBe(true);
      expect(await f.count()).toBe(1);
    },
  );
  it.each([
    'absent',
    'duplicate',
    'same-tail-foreign-country',
    'incomplete',
    'provider-mismatch',
    'stale',
  ])('refuses non-exact source: %s', async (mode) => {
    const f = await fixture();
    if (mode === 'absent') f.registry.clients = [];
    if (mode === 'duplicate')
      f.registry.clients.push({
        ...f.registry.clients[0],
        external_id: randomUUID(),
      });
    if (mode === 'same-tail-foreign-country')
      f.registry.clients[0].phone = '+442025550123';
    if (mode === 'provider-mismatch') f.registry.provider = 'foreign';
    if (mode === 'incomplete')
      f.source.mockResolvedValue({ ...f.registry, complete: false } as never);
    if (mode === 'stale')
      f.source.mockResolvedValue({
        ...f.registry,
        generated_at: new Date(0).toISOString(),
      });
    expect((await f.run()).status).toBe('unlinked');
    expect(await f.count()).toBe(0);
  });
  it.each([
    'expired-proof',
    'future-proof',
    'old-proof',
    'foreign-tenant',
    'foreign-user',
    'foreign-session',
    'unclaimed-flow',
    'revoked-session',
    'suspended-membership',
  ])('refuses stale/substituted login: %s', async (mode) => {
    const f = await fixture();
    let overrides: Partial<VerifiedTelegramClientLogin> = {};
    if (mode === 'expired-proof') overrides = { expiresAt: 1 };
    if (mode === 'future-proof') overrides = { issuedAt: Date.now() + 60_000 };
    if (mode === 'old-proof') overrides = { issuedAt: Date.now() - 700_000 };
    if (mode === 'foreign-tenant') overrides = { tenantId: 'foreign' };
    if (mode === 'foreign-user') overrides = { userId: 'foreign' };
    if (mode === 'foreign-session') overrides = { sessionId: 'foreign' };
    if (mode === 'unclaimed-flow')
      await db.prisma.authFlowState.update({
        where: { id: f.proof.flowId },
        data: { consumedAt: null },
      });
    if (mode === 'revoked-session')
      await db.prisma.authSession.update({
        where: { id: f.proof.sessionId },
        data: { revokedAt: new Date() },
      });
    if (mode === 'suspended-membership')
      await db.prisma.membership.update({
        where: {
          userId_tenantId: { userId: f.user.id, tenantId: f.tenant.id },
        },
        data: { status: 'suspended' },
      });
    expect((await f.run(overrides)).status).toBe('unlinked');
    expect(await f.count()).toBe(0);
    expect(f.source).not.toHaveBeenCalled();
  });
  it('refuses a source switch during CRM resolution', async () => {
    const f = await fixture();
    f.source.mockImplementation(async () => {
      await db.prisma.crmIntegration.update({
        where: { tenantId: f.tenant.id },
        data: { settingsJson: { companyId: 99999 } },
      });
      return { ...f.registry, generated_at: new Date().toISOString() };
    });
    expect((await f.run()).status).toBe('unlinked');
    expect(await f.count()).toBe(0);
  });
  it('rereads session revocation after CRM resolution', async () => {
    const f = await fixture();
    f.source.mockImplementation(async () => {
      await db.prisma.authSession.update({
        where: { id: f.proof.sessionId },
        data: { revokedAt: new Date() },
      });
      return { ...f.registry, generated_at: new Date().toISOString() };
    });
    expect((await f.run()).status).toBe('unlinked');
    expect(await f.count()).toBe(0);
  });
  it('leaves revoked historical verification byte-identical and denies automatic relink', async () => {
    const f = await fixture();
    expect((await f.run()).status).toBe('linked');
    const link = await db.prisma.clientChannelLink.findFirstOrThrow({
      where: { tenantId: f.tenant.id },
    });
    const writer = new ClientChannelLinkService(db.prisma, db.tenantContext, {
      verifyLink: () => Promise.reject(new Error('not used')),
      verifyRevocation: () =>
        Promise.resolve({
          tenantId: f.tenant.id,
          provider: 'maya_user',
          providerSubjectHash: link.providerSubjectHash,
          linkId: link.id,
          revocationIdentityHash: digest(randomUUID()),
          actorProofHash: digest('synthetic'),
          reason: 'test',
          validUntil: new Date(Date.now() + 60_000),
        }),
    });
    await db.tenantContext.runAsSystemTenant(f.tenant.id, () =>
      writer.revoke({ proof: 'synthetic-revocation' }),
    );
    const revoked = await db.prisma.clientChannelLink.findUniqueOrThrow({
      where: { id: link.id },
    });
    expect(await f.run()).toEqual({
      status: 'unlinked',
      reason: 'client_reverification_required',
    });
    expect(
      await db.prisma.clientChannelLink.findUniqueOrThrow({
        where: { id: link.id },
      }),
    ).toEqual(revoked);
    expect(await f.count()).toBe(1);
  });
  it('rolls back the link when its mandatory audit cannot be written', async () => {
    const f = await fixture(),
      appDb = http.app.get(PrismaService),
      transaction = appDb.$transaction.bind(appDb);
    const spy = jest
      .spyOn(appDb, '$transaction')
      .mockImplementation((fn: unknown, options: unknown) =>
        transaction(async (tx) => {
          const original = tx.auditLog.create.bind(tx.auditLog);
          tx.auditLog.create = (async (args) => {
            if (args.data.action === 'client.telegram_initial_link')
              throw new Error('Synthetic audit failure');
            return original(args);
          }) as typeof tx.auditLog.create;
          return (fn as (tx: unknown) => Promise<unknown>)(tx);
        }, options as never),
      );
    try {
      expect((await f.run()).status).toBe('unlinked');
      expect(await f.count()).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });
  it('refuses a CRM card already bound to a different account', async () => {
    const f = await fixture();
    const other = await fx.user(f.tenant, UserRole.CLIENT);
    const client = await fx.client(f.tenant, other);
    await db.prisma.crmClientLink.create({
      data: {
        tenantId: f.tenant.id,
        provider: 'yclients',
        externalId: f.registry.clients[0].external_id,
        clientId: client.clientId,
      },
    });
    expect((await f.run()).status).toBe('unlinked');
    expect(await f.count()).toBe(1);
  });
  it('profile/personal context resolve the exact linked Client without changing owner role or consent', async () => {
    const f = await fixture(UserRole.TENANT_OWNER);
    const registered = (await f.register())!;
    const other = await db.prisma.client.create({
      data: { tenantId: f.tenant.id },
    });
    const history = http.app.get(ClientAppointmentReadService);
    await context.runAsAuthPrincipal(f.actor, () =>
      expect(history.forAccount(f.tenant.id, f.user.id)).rejects.toThrow(
        'client_link_required',
      ),
    );
    const rows: Array<{ id: string }> = [];
    for (const clientId of [registered.clientId, other.id])
      rows.push(
        await db.prisma.appointment.create({
          data: {
            tenantId: f.tenant.id,
            mayaClientId: clientId,
            source: 'internal',
            staffExternalId: randomUUID(),
            serviceIds: [],
            startAt: new Date('2025-01-01T10:00:00Z'),
            endAt: new Date('2025-01-01T11:00:00Z'),
            blockedStartAt: new Date('2025-01-01T10:00:00Z'),
            blockedEndAt: new Date('2025-01-01T11:00:00Z'),
          },
        }),
      );
    jest.spyOn(crm, 'getServices').mockResolvedValue([]);
    jest.spyOn(crm, 'getStaff').mockResolvedValue([]);
    expect((await f.run()).status).toBe('linked');
    const link = await db.prisma.clientChannelLink.findFirstOrThrow({
      where: { tenantId: f.tenant.id },
    });
    await context.runAsAuthPrincipal(f.actor, async () => {
      const profile = await http.app
        .get(ClientProfileReadService)
        .forAccount(f.tenant.id, f.user.id);
      expect(profile.clientId).toBe(link.clientId);
      const personal = await http.app
        .get(PersonalClientContextService)
        .select(f.actor, 'personal_client');
      expect(personal.clientId).toBe(link.clientId);
      const own = await history.forAccount(f.tenant.id, f.user.id);
      expect(own.map((row) => row.id)).toEqual([rows[0].id]);
      expect(own[0].timeline).toBe('past');
      expect(own.map((row) => row.id)).not.toContain(rows[1].id);
    });
    expect(
      (
        await db.prisma.membership.findUniqueOrThrow({
          where: {
            userId_tenantId: { userId: f.user.id, tenantId: f.tenant.id },
          },
        })
      ).role,
    ).toBe(UserRole.TENANT_OWNER);
  });

  describe('existing CRM reconciliation → first login → private history', () => {
    async function historyFixture(
      role = UserRole.CLIENT,
      linkedIdentity = true,
    ) {
      const f = await fixture(role, linkedIdentity);
      await context.runAsSystemTenant(f.tenant.id, () =>
        http.app.get(ClientIdentityService).registerCrmClient({
          tenantId: f.tenant.id,
          provider: 'yclients',
          externalId: 'another-exact-crm-card',
        }),
      );
      const now = Date.now();
      const from = new Date(now - 4 * 86_400_000);
      const to = new Date(now + 4 * 86_400_000);
      const entry = (
        id: string,
        externalClientId: string,
        days: number,
      ): CrmJournalAppointment => ({
        id: `crm-${id}`,
        client: { id: externalClientId, name: 'Synthetic source-only name' },
        provider: { id: 'synthetic-staff', name: 'Synthetic staff' },
        branch: null,
        service_ids: ['synthetic-service'],
        services: [],
        start_at: new Date(now + days * 86_400_000).toISOString(),
        end_at: new Date(now + days * 86_400_000 + 3_600_000).toISOString(),
        status: days < 0 ? 'completed' : 'confirmed',
        attendance: days < 0 ? 'arrived' : 'awaiting',
        notes: 'Synthetic provider private note must not be exposed',
        total_price: 1700,
        currency: 'RUB',
      });
      const entries = [
        entry('own-past', f.registry.clients[0].external_id, -2),
        entry('own-upcoming', f.registry.clients[0].external_id, 2),
        entry('foreign-same-time', 'another-exact-crm-card', -2),
      ];
      // The source boundary is synthetic; all reconciliation/observation,
      // canonical writes, authentication, consent and private readers are real.
      const journal = jest.spyOn(crm, 'getJournal').mockImplementation(() =>
        Promise.resolve({
          calendar_source: 'external',
          completeness: 'complete',
          timezone: 'Europe/Moscow',
          range: { from: from.toISOString(), to: to.toISOString() },
          provider_id: null,
          count: entries.length,
          appointments: entries,
        }),
      );
      jest.spyOn(crm, 'resolveStaffIdForBooking').mockResolvedValue(null);
      jest.spyOn(crm, 'getServices').mockResolvedValue([]);
      jest.spyOn(crm, 'getStaff').mockResolvedValue([]);
      const sync = () =>
        context.runAsSystemTenant(f.tenant.id, () =>
          http.app.get(AppointmentReconciliationService).run({
            tenantId: f.tenant.id,
            from,
            to,
            holder: 'synthetic-first-client-history',
          }),
        );
      const state = () =>
        db.prisma.appointment.findMany({
          where: { tenantId: f.tenant.id },
          orderBy: { crmExternalId: 'asc' },
        });
      const login = async () => {
        const result = await (await signedLogin(f)).complete();
        expect(result.status).toBe(201);
        const body = result.body as LoginBody;
        expect(body.client_binding.status).toBe('linked');
        const actor = await fx.actorFromAccessToken(body.access_token);
        const proof = JSON.stringify({
          type: 'maya_jwt',
          credential: body.access_token,
        });
        return {
          actor,
          accessToken: body.access_token,
          read: () =>
            request(http.app.getHttpServer())
              .get('/api/client-channel/appointments')
              .set('Authorization', `Bearer ${body.access_token}`),
          cabinet: () =>
            context.runAsAuthPrincipal(actor, () =>
              http.app
                .get(ClientChannelRuntimeService)
                .cabinetProjection(proof),
            ),
          consent: (privacy: boolean) =>
            context.runAsAuthPrincipal(actor, () =>
              http.app.get(ClientChannelRuntimeService).submitConsent(proof, {
                privacy,
                marketing: false,
                idempotencyKey: randomUUID(),
              }),
            ),
        };
      };
      return { ...f, entries, journal, sync, state, login };
    }

    async function enableHistory(
      f: Awaited<ReturnType<typeof historyFixture>>,
    ) {
      const owner = await fx.user(f.tenant, UserRole.TENANT_OWNER);
      const actor = await fx.actor(f.tenant, owner);
      return context.runAsAuthPrincipal(actor, async () => {
        const current = await http.app
          .get(GovernedSettingsReadService)
          .read(f.tenant.id, owner.id, 'client_capabilities');
        return http.app
          .get(Package5Wave1CanonicalCutoverService)
          .updateGoverned(
            f.tenant.id,
            owner.id,
            'tenant_business_configuration',
            {
              confirmed: true,
              namespace: 'client_capabilities',
              expectedRevision: current.revision,
              previousRevisionId: current.previousRevisionId,
              content: { client_self_visit_history: true },
            },
            randomUUID(),
          );
      });
    }

    // Only the remote planner response is scripted. The real serializer, parser,
    // HTTP guards, AiCore, C9, tool owner, private reader and reply composer run.
    async function prepareChat(f: Awaited<ReturnType<typeof historyFixture>>) {
      for (const feature of [
        'ai.consultant',
        'ai.owner',
        'booking',
        'booking.customer_app',
        'crm.integration',
      ] as const)
        await fx.grantFeature(f.tenant, feature);
      const config = http.app.get(ConfigService);
      config.set('AI_CORE_PROVIDER', 'openai');
      config.set('OPENAI_API_KEY', 'synthetic-no-provider-credential');
      const questions = [
        'Покажи историю моих визитов',
        'Когда я был у вас последний раз?',
        'Какие у меня ближайшие записи?',
      ];
      const periods = ['past', 'last_visit', 'upcoming'];
      const wire: string[] = [];
      const issuerFetch = (
        globalThis.fetch as jest.MockedFunction<typeof fetch>
      ).getMockImplementation();
      (globalThis.fetch as jest.Mock).mockImplementation(
        (url: unknown, init?: RequestInit) => {
          if (
            url === 'https://oauth.telegram.org/token' ||
            url === 'https://oauth.telegram.org/.well-known/jwks.json'
          ) {
            if (!issuerFetch) throw new Error('Synthetic issuer required');
            return issuerFetch(url, init);
          }
          if (
            url !== 'https://api.openai.com/v1/responses' ||
            init?.method !== 'POST' ||
            typeof init.body !== 'string'
          )
            throw new Error('Unexpected external request');
          wire.push(init.body);
          const serialized = JSON.parse(init.body) as { input: string };
          const input = JSON.parse(serialized.input) as {
            phase: string;
            conversation: Array<{ role: string; content: string }>;
            tool_results: unknown[];
          };
          expect(input.phase).toBe('tool_planning');
          expect(input.tool_results).toEqual([]);
          expect(input.conversation.every((m) => m.role === 'user')).toBe(true);
          const question = input.conversation.at(-1)?.content;
          const index = questions.indexOf(question ?? '');
          expect(index).toBeGreaterThanOrEqual(0);
          const plan = {
            semantic_plan: {
              parent_request: question,
              language: 'ru',
              dialogue_act: 'question',
              tasks: [
                {
                  id: 'own',
                  intent: 'booking.list_own',
                  entities_json: JSON.stringify({ period: periods[index] }),
                  depends_on: [],
                  confidence: 1,
                  requires_clarification: false,
                  clarification_question: null,
                },
              ],
              context: {
                carried_slots: [],
                replaced_slots: [],
                unresolved_references: [],
              },
            },
            tool_call: { name: 'appointments.own.list', arguments_json: '{}' },
          };
          return Promise.resolve(
            new Response(
              JSON.stringify({
                output: [
                  {
                    content: [
                      { type: 'output_text', text: JSON.stringify(plan) },
                    ],
                  },
                ],
                usage: {},
              }),
              { status: 200 },
            ),
          );
        },
      );
      return { wire, questions };
    }

    async function chatFixture(f: Awaited<ReturnType<typeof historyFixture>>) {
      const login = await f.login();
      const { wire, questions } = await prepareChat(f);
      const ask = async (
        index: number,
        previous: Array<{ role: string; content: string }> = [],
        extra = {},
      ) => {
        const response = await request(http.app.getHttpServer())
          .post('/api/ai/chat')
          .set('Authorization', `Bearer ${login.accessToken}`)
          .send({
            surface: 'web',
            audience: 'client',
            requestId: randomUUID(),
            messages: [
              ...previous,
              { role: 'user', content: questions[index] },
            ],
            ...extra,
          });
        return {
          status: response.status,
          body: response.body as ChatProofBody,
        };
      };
      const conversation = async () => {
        const response = await request(http.app.getHttpServer())
          .get('/api/ai/conversation')
          .set('Authorization', `Bearer ${login.accessToken}`);
        return {
          status: response.status,
          body: response.body as ConversationProofBody,
        };
      };
      return { ...login, ask, wire, questions, conversation };
    }

    if (process.env.JEST_TELEGRAM_BROWSER_OUTPUT) {
      it.each([UserRole.CLIENT, UserRole.TENANT_OWNER])(
        'current React: %s account bootstrap → signed Telegram login → canonical sync → three history answers → relogin without duplicate turns',
        async (role) => {
          const f = await historyFixture(role, role !== UserRole.TENANT_OWNER);
          await enableHistory(f);
          installSignedIssuer(f);
          const chat = await prepareChat(f);
          let before: Awaited<ReturnType<typeof f.state>> = [];
          expect(await f.count()).toBe(0);
          const output = path.join(
            process.env.JEST_TELEGRAM_BROWSER_OUTPUT!,
            'browser-' + role,
          );
          const { name: tenantName } = await db.prisma.tenant.findUniqueOrThrow(
            {
              where: { id: f.tenant.id },
              select: { name: true },
            },
          );
          await new Promise<void>((resolve, reject) => {
            const child = spawn(
              process.execPath,
              [
                path.resolve(
                  '../maya-carrier-react/test/telegram-personal-browser-probe.mjs',
                ),
              ],
              {
                stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
              },
            );
            let failure: Error | undefined;
            let stage = 'child-start';
            let synchronized = false;
            const fail = (error: unknown) => {
              failure ??=
                error instanceof Error
                  ? error
                  : new Error('browser child failed');
              child.kill('SIGTERM');
            };
            const timer = setTimeout(
              () => fail(new Error('bounded personal browser timeout')),
              90000,
            );
            child.stderr?.resume(); // No credential-bearing protocol bodies to diagnostics.
            child.on('error', fail);
            child.on('message', (message: { type: string; stage?: string }) => {
              if (message.type === 'synchronize-canonical-source') {
                if (synchronized)
                  return fail(new Error('source sync replay refused'));
                synchronized = true;
                void (async () => {
                  expect(await f.count()).toBe(1);
                  expect(await f.state()).toEqual([]);
                  await f.sync();
                  before = await f.state();
                  expect(before).toHaveLength(3);
                  child.send({ type: 'source-ready' });
                })().catch(fail);
                return;
              }
              if (
                message.type === 'stage' &&
                [
                  'validate-backend',
                  'validate-output',
                  'verify-build',
                ].includes(message.stage ?? '')
              ) {
                stage = message.stage!;
                return;
              }
              if (message.type !== 'ready')
                return fail(new Error('unexpected child message'));
              void http
                .listenLoopback()
                .then((backendOrigin) =>
                  child.send({
                    type: 'start',
                    backendOrigin,
                    output,
                    tenantSlug: f.tenant.slug,
                    tenantName,
                    questions: chat.questions,
                    ...(role === UserRole.TENANT_OWNER
                      ? {
                          syntheticOwner: {
                            email: f.user.email,
                            password: f.user.password,
                          },
                        }
                      : {}),
                  }),
                )
                .catch(fail);
            });
            child.on('close', (code, signal) => {
              clearTimeout(timer);
              if (failure || code !== 0 || signal)
                reject(
                  failure ??
                    new Error(
                      `personal browser failed at ${stage}; exit ${code}; signal ${signal}; inspect safe browser.json`,
                    ),
                );
              else resolve();
            });
          });
          const report = JSON.parse(
            readFileSync(path.join(output, 'browser.json'), 'utf8'),
          ) as {
            status: string;
            browserStopped: boolean;
            chat: unknown[];
            starts: number;
            completes: number;
          };
          expect(report).toMatchObject({
            status: 'PASS',
            browserStopped: true,
            starts: 2,
            completes: 2,
            accountLinks: role === UserRole.TENANT_OWNER ? 1 : 0,
          });
          expect(report.chat).toHaveLength(3);
          expect(chat.wire).toHaveLength(3);
          for (const serialized of chat.wire) {
            for (const secret of [
              phone,
              f.user.id,
              f.user.email,
              f.tenant.id,
              f.registry.clients[0].external_id,
              'Synthetic Client',
              'Synthetic provider private note',
              'визит состоялся',
              ...before.map((row) => row.id),
            ])
              expect(serialized).not.toContain(secret);
          }
          const turns = await db.prisma.widgetTimelineTurn.findMany({
            where: { tenantId: f.tenant.id },
            orderBy: { turnIndex: 'asc' },
          });
          expect(turns.map((turn) => turn.role)).toEqual([
            'user',
            'assistant',
            'user',
            'assistant',
            'user',
            'assistant',
          ]);
          expect(new Set(turns.map((turn) => turn.conversationId)).size).toBe(
            1,
          );
          expect(await f.state()).toEqual(before);
          expect(f.journal).toHaveBeenCalledTimes(1);
          expect(await f.count()).toBe(1);
          expect(
            (
              await db.prisma.membership.findUniqueOrThrow({
                where: {
                  userId_tenantId: { userId: f.user.id, tenantId: f.tenant.id },
                },
              })
            ).role,
          ).toBe(role);
          expect(
            await db.prisma.actionExecution.count({
              where: {
                tenantId: f.tenant.id,
                actionClass: {
                  in: [
                    'create_appointment',
                    'reschedule_appointment',
                    'cancel_appointment',
                  ],
                },
              },
            }),
          ).toBe(0);
        },
      );
    }

    it.each([
      [UserRole.CLIENT, 'explicit-client'],
      [UserRole.TENANT_OWNER, 'explicit-client'],
      [UserRole.CLIENT, 'canonical-web'],
      [UserRole.TENANT_OWNER, 'canonical-web'],
    ] as const)(
      'signed %s login → %s request → canonical sync → three HTTP AChat replies, with no private model continuation',
      async (role, requestShape) => {
        const f = await historyFixture(role),
          chat = await chatFixture(f);
        await chat.consent(true);
        await f.sync();
        await enableHistory(f);
        const before = await f.state();
        const previous: Array<{ role: string; content: string }> = [];
        let conversationId: string | undefined;
        for (const index of [0, 1, 2]) {
          // The current React/headless carrier never sends audience, role,
          // tenant or Client id. Retain the historical explicit-client cases,
          // but also prove the actual web request shape for both real roles.
          const result = await chat.ask(index, previous, {
            conversationId,
            ...(requestShape === 'canonical-web'
              ? { audience: undefined }
              : {}),
          });
          expect(result.status).toBe(201);
          expect(result.body.grounding.status).toBe('verified');
          expect(result.body.action).toBeNull();
          expect(result.body.reply).toContain(
            index < 2 ? 'визит состоялся' : 'Предстоящих: 1',
          );
          expect(result.body.reply).not.toMatch(
            /foreign-same-time|Synthetic provider private note|Synthetic source-only name/,
          );
          previous.push(
            { role: 'user', content: chat.questions[index] },
            { role: 'assistant', content: result.body.reply },
          );
          const restored = await chat.conversation();
          expect(restored.status).toBe(200);
          expect(restored.body.conversationId).toEqual(expect.any(String));
          conversationId ??= restored.body.conversationId!;
          expect(restored.body.conversationId).toBe(conversationId);
          expect(
            restored.body.turns.map((turn: { role: string; text: string }) => ({
              role: turn.role,
              content: turn.text,
            })),
          ).toEqual(previous);
        }
        expect(chat.wire).toHaveLength(3);
        for (const serialized of chat.wire) {
          for (const secret of [
            phone,
            f.user.id,
            f.user.email,
            f.tenant.id,
            f.registry.clients[0].external_id,
            'Synthetic Client',
            'Synthetic provider private note',
            'визит состоялся',
            ...before.map((row) => row.id),
          ])
            expect(serialized).not.toContain(secret);
        }
        expect(await f.state()).toEqual(before);
        expect(f.journal).toHaveBeenCalledTimes(1);
        expect(await f.count()).toBe(1);
        expect(chat.actor.role).toBe(role);
        expect(
          await db.prisma.actionExecution.count({
            where: {
              tenantId: f.tenant.id,
              actionClass: {
                in: [
                  'create_appointment',
                  'reschedule_appointment',
                  'cancel_appointment',
                ],
              },
            },
          }),
        ).toBe(0);
      },
    );

    it('HTTP AChat explains disabled history; does not turn it into an empty or complete history', async () => {
      const f = await historyFixture(),
        chat = await chatFixture(f);
      await f.sync();
      const result = await chat.ask(0);
      expect(result.status).toBe(201);
      expect(result.body.grounding.status).toBe('blocked');
      expect(result.body.reply).toContain('Салон пока не открыл');
      expect(result.body.reply).not.toContain('визит состоялся');
      expect(chat.wire).toHaveLength(1);
      expect(f.journal).toHaveBeenCalledTimes(1);
    });

    it('HTTP AChat rereads revoked Client authority despite a successful previous turn', async () => {
      const f = await historyFixture(),
        chat = await chatFixture(f);
      await f.sync();
      await enableHistory(f);
      const first = await chat.ask(0);
      expect(first.body.grounding.status).toBe('verified');
      const link = await db.prisma.clientChannelLink.findFirstOrThrow({
        where: { tenantId: f.tenant.id },
      });
      const writer = new ClientChannelLinkService(db.prisma, db.tenantContext, {
        verifyLink: () => Promise.reject(new Error('not used')),
        verifyRevocation: () =>
          Promise.resolve({
            tenantId: f.tenant.id,
            provider: 'maya_user',
            providerSubjectHash: link.providerSubjectHash,
            linkId: link.id,
            revocationIdentityHash: digest(randomUUID()),
            actorProofHash: digest('synthetic-http-revocation'),
            reason: 'test',
            validUntil: new Date(Date.now() + 60_000),
          }),
      });
      await db.tenantContext.runAsSystemTenant(f.tenant.id, () =>
        writer.revoke({ proof: 'synthetic-revocation' }),
      );
      const revoked = await db.prisma.clientChannelLink.findUniqueOrThrow({
        where: { id: link.id },
      });
      const second = await chat.ask(1, [
        { role: 'user', content: chat.questions[0] },
        { role: 'assistant', content: first.body.reply },
      ]);
      expect(second.status).toBe(201);
      expect(second.body.grounding.status).toBe('blocked');
      expect(second.body.reply).not.toContain('визит состоялся');
      expect(chat.wire.join('')).not.toContain('визит состоялся');
      expect(
        await db.prisma.clientChannelLink.findUniqueOrThrow({
          where: { id: link.id },
        }),
      ).toEqual(revoked);
      expect(await f.count()).toBe(1);
      expect(f.journal).toHaveBeenCalledTimes(1);
    });

    it('revoked session cannot send another history turn or restore the private conversation', async () => {
      const f = await historyFixture(),
        chat = await chatFixture(f);
      await f.sync();
      await enableHistory(f);
      expect((await chat.ask(0)).body.grounding.status).toBe('verified');
      await db.prisma.authSession.update({
        where: { id: chat.actor.sessionId },
        data: { revokedAt: new Date() },
      });
      expect((await chat.ask(1)).status).toBe(401);
      expect((await chat.conversation()).status).toBe(401);
      expect(chat.wire).toHaveLength(1);
      expect(f.journal).toHaveBeenCalledTimes(1);
    });

    it.each(['same-tenant', 'foreign-tenant'])(
      'HTTP AChat refuses caller-selected Client and %s foreign conversation before private history disclosure',
      async (scope) => {
        const f = await historyFixture(),
          chat = await chatFixture(f);
        await f.sync();
        await enableHistory(f);
        const first = await chat.ask(0);
        expect(first.body.grounding.status).toBe('verified');
        const current = await chat.conversation();
        expect(current.body.conversationId).toEqual(expect.any(String));
        expect(
          (await chat.ask(0, [], { clientId: 'caller-client' })).status,
        ).toBe(400);
        const otherTenant =
          scope === 'same-tenant'
            ? f.tenant
            : await fx.tenant('Foreign private chat');
        if (scope === 'foreign-tenant') cancelled.push(otherTenant.id);
        for (const feature of [
          'ai.consultant',
          'booking',
          'booking.customer_app',
          'crm.integration',
        ] as const)
          await fx.grantFeature(otherTenant, feature);
        const other = await fx.user(otherTenant, UserRole.CLIENT);
        const token = await http.login(
          otherTenant.slug,
          other.email,
          other.password,
        );
        const foreign = await request(http.app.getHttpServer())
          .post('/api/ai/chat')
          .set('Authorization', `Bearer ${token}`)
          .send({
            surface: 'web',
            audience: 'client',
            requestId: randomUUID(),
            conversationId: current.body.conversationId,
            messages: [{ role: 'user', content: chat.questions[0] }],
          });
        // Existing timeline owner reports a foreign persisted reference as a
        // scope conflict (409), before planner/tool dispatch.
        expect(foreign.status).toBe(409);
        expect((foreign.body as { message: string }).message).toBe(
          'conversation_scope_conflict',
        );
        expect(JSON.stringify(foreign.body)).not.toContain('визит состоялся');
        expect(chat.wire).toHaveLength(1);
        expect(f.journal).toHaveBeenCalledTimes(1);
      },
    );

    it.each([UserRole.CLIENT, UserRole.TENANT_OWNER])(
      'source-to-card history uses exact Client after signed %s login, with explicit consent and no GET writes',
      async (role) => {
        const f = await historyFixture(role),
          login = await f.login();
        expect((await login.read()).body).toEqual([]);
        expect(f.journal).not.toHaveBeenCalled();
        expect(await f.state()).toEqual([]);
        expect(await login.cabinet()).toMatchObject({
          linked: true,
          needs_consent: true,
        });
        await login.consent(true);
        expect(await f.sync()).toMatchObject({
          status: 'ran',
          created: 3,
          events_emitted: 0,
          completeness: 'complete',
        });
        const before = await f.state();
        expect(before.every((row) => row.clientId === null)).toBe(true);
        const replies = await Promise.all(
          Array.from({ length: 5 }, () => login.read()),
        );
        for (const response of replies) {
          expect(response.status).toBe(200);
          expect(
            (response.body as Array<{ crm_external_id: string }>).map(
              (row) => row.crm_external_id,
            ),
          ).toEqual(['own-past', 'own-upcoming']);
          expect(JSON.stringify(response.body)).not.toMatch(
            /foreign-same-time|Synthetic provider private note|Synthetic source-only name/,
          );
          expect(
            (response.body as Array<{ attendance: string }>).map(
              (row) => row.attendance,
            ),
          ).toEqual(['arrived', 'awaiting']);
        }
        expect(await login.cabinet()).toMatchObject({
          linked: true,
          full_name: 'Synthetic Client',
          history: [{ record_id: 'own-past', attendance: 'arrived' }],
          upcoming: [{ record_id: 'own-upcoming' }],
          business_mutations: 0,
        });
        expect(await f.state()).toEqual(before);
        expect(f.journal).toHaveBeenCalledTimes(1);
        expect(await f.sync()).toMatchObject({
          created: 0,
          updated: 0,
          unchanged: 3,
          events_emitted: 0,
        });
        expect(await f.state()).toEqual(before);
        expect(login.actor.role).toBe(role);
        expect(
          await db.prisma.clientConsentFact.findMany({
            where: {
              tenantId: f.tenant.id,
              kind: 'marketing',
              decision: 'grant',
            },
          }),
        ).toEqual([]);
      },
    );

    it('late exact identity resolves the existing mirror rows only on reconciliation, never on login/GET', async () => {
      const f = await historyFixture();
      await f.sync();
      const before = await f.state();
      expect(
        before
          .filter((row) => row.crmExternalId?.startsWith('own-'))
          .every((row) => row.mayaClientId === null),
      ).toBe(true);
      expect(
        before.find((row) => row.crmExternalId === 'foreign-same-time')
          ?.mayaClientId,
      ).not.toBeNull();
      const login = await f.login();
      expect((await login.read()).body).toEqual([]);
      expect(await f.state()).toEqual(before);
      expect(f.journal).toHaveBeenCalledTimes(1);
      expect(await f.sync()).toMatchObject({
        created: 0,
        updated: 2,
        unchanged: 1,
        events_emitted: 0,
      });
      expect((await f.state()).map((row) => row.id)).toEqual(
        before.map((row) => row.id),
      );
      expect((await login.read()).body).toHaveLength(2);
    });

    it('canonical salon history setting admits only own saved history and withdrawal blocks the next read', async () => {
      const f = await historyFixture(),
        login = await f.login();
      await f.sync();
      const owner = await fx.user(f.tenant, UserRole.TENANT_OWNER);
      const ownerActor = await fx.actor(f.tenant, owner);
      const governed = http.app.get(GovernedSettingsReadService);
      const canonical = http.app.get(Package5Wave1CanonicalCutoverService);
      const handler = http.app.get(AiToolHandlerService);
      const read = () =>
        context.runAsAuthPrincipal(login.actor, () =>
          handler.execute(
            'appointments.own.list',
            { ...login.actor, tenantId: f.tenant.id, surface: 'native' },
            {},
            'synthetic-private-history',
          ),
        );
      const set = (enabled: boolean) =>
        context.runAsAuthPrincipal(ownerActor, async () => {
          const current = await governed.read(
            f.tenant.id,
            owner.id,
            'client_capabilities',
          );
          return canonical.updateGoverned(
            f.tenant.id,
            owner.id,
            'tenant_business_configuration',
            {
              confirmed: true,
              namespace: 'client_capabilities',
              expectedRevision: current.revision,
              previousRevisionId: current.previousRevisionId,
              content: { client_self_visit_history: enabled },
            },
            randomUUID(),
          );
        });
      expect(personalHistoryReply(await read(), false, 'past').status).toBe(
        'blocked',
      );
      await context.runAsAuthPrincipal(login.actor, () =>
        expect(
          canonical.updateGoverned(
            f.tenant.id,
            login.actor.userId,
            'tenant_business_configuration',
            {
              confirmed: true,
              namespace: 'client_capabilities',
              expectedRevision: 0,
              previousRevisionId: null,
              content: { client_self_visit_history: true },
            },
            randomUUID(),
          ),
        ).rejects.toThrow(),
      );
      await set(true);
      const source = await read();
      expect(source).toMatchObject({
        history_scope: { enabled: true, source: 'maya_canonical' },
      });
      const answer = personalHistoryReply(source, false, 'last_visit');
      expect(answer.status).toBe('verified');
      expect(answer.reply).toContain('визит состоялся');
      expect(JSON.stringify(source)).not.toMatch(
        /foreign-same-time|Synthetic provider private note/,
      );
      await set(false);
      expect(personalHistoryReply(await read(), false, 'past').status).toBe(
        'blocked',
      );
      expect(await f.state()).toHaveLength(3);
      expect(f.journal).toHaveBeenCalledTimes(1);
    });

    it('same provider record identifiers in two salons never cross the authenticated tenant', async () => {
      const first = await historyFixture(),
        a = await first.login();
      await first.sync();
      const second = await historyFixture();
      await db.prisma.crmIntegration.update({
        where: { tenantId: second.tenant.id },
        data: { settingsJson: { companyId: 67890 } },
      });
      const b = await second.login();
      await second.sync();
      const left = await a.read(),
        right = await b.read();
      expect(left.status).toBe(200);
      expect(right.status).toBe(200);
      type Row = { id: string; tenant_id: string; crm_external_id: string };
      const l = left.body as Row[],
        r = right.body as Row[];
      expect(l).toHaveLength(2);
      expect(r).toHaveLength(2);
      expect(l.every((row) => row.tenant_id === first.tenant.id)).toBe(true);
      expect(r.every((row) => row.tenant_id === second.tenant.id)).toBe(true);
      expect(l.map((row) => row.crm_external_id)).toEqual(
        r.map((row) => row.crm_external_id),
      );
      expect(l.some((row) => r.some((other) => row.id === other.id))).toBe(
        false,
      );
    });

    it('provider failure or a truncated refresh never erases the last synchronized personal history', async () => {
      const f = await historyFixture(),
        login = await f.login();
      await f.sync();
      const before = await f.state();
      f.journal.mockRejectedValueOnce(
        new Error('Synthetic provider unavailable'),
      );
      await expect(f.sync()).rejects.toThrow('Synthetic provider unavailable');
      expect(await f.state()).toEqual(before);
      f.journal.mockResolvedValueOnce({
        calendar_source: 'external',
        completeness: 'truncated',
        timezone: 'Europe/Moscow',
        range: { from: f.entries[0].start_at, to: f.entries[1].end_at },
        provider_id: null,
        count: 0,
        appointments: [],
      });
      expect(await f.sync()).toMatchObject({
        completeness: 'truncated',
        fetched: 0,
      });
      expect(await f.state()).toEqual(before);
      expect((await login.read()).body).toHaveLength(2);
      const runs = await db.prisma.reconciliationRun.findMany({
        where: { tenantId: f.tenant.id },
        orderBy: { startedAt: 'asc' },
      });
      expect(runs.map((run) => [run.completeness, run.failureCode])).toEqual([
        ['complete', null],
        [null, 'reconciliation_failed'],
        ['truncated', null],
      ]);
    });

    it('session revocation closes card and history while preserving the synchronized records', async () => {
      const f = await historyFixture(),
        login = await f.login();
      await login.consent(true);
      await f.sync();
      const before = await f.state();
      await db.prisma.authSession.update({
        where: { id: login.actor.sessionId },
        data: { revokedAt: new Date() },
      });
      expect((await login.read()).status).toBe(401);
      await expect(login.cabinet()).rejects.toThrow();
      expect(await f.state()).toEqual(before);
    });

    it('privacy withdrawal hides the card again without deleting canonical visit history', async () => {
      const f = await historyFixture(),
        login = await f.login();
      await login.consent(true);
      await f.sync();
      const before = await f.state();
      await login.consent(false);
      const card = await login.cabinet();
      expect(card).toMatchObject({ linked: true, needs_consent: true });
      expect(JSON.stringify(card)).not.toMatch(
        /own-past|own-upcoming|Synthetic Client/,
      );
      expect(await f.state()).toEqual(before);
    });
  });
});
