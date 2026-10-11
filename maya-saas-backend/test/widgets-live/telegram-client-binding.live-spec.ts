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

  describe('existing CRM reconciliation → first login → private history', () => {
    async function historyFixture(role = UserRole.CLIENT) {
      const f = await fixture(role);
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
