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
import { PrismaService } from '../../src/prisma/prisma.service';
import { TenantContextService } from '../../src/tenancy/tenant-context.service';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import { type Fixtures } from './support/fixtures';

type LoginBody = {
  client_binding: { status: string };
  user: { role: string };
  access_token: string;
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

  async function fixture(role = UserRole.CLIENT) {
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
    await db.prisma.authIdentity.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        provider: 'telegram',
        providerUserId,
        phone,
      },
    });
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

  async function signedLogin(
    f: Awaited<ReturnType<typeof fixture>>,
    claims: Record<string, unknown> = {},
    forgedSignature = false,
  ) {
    const config = http.app.get(ConfigService),
      get = config.get.bind(config);
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
});
