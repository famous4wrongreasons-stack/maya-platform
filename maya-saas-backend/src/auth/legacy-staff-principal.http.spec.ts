import type { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { UserRole } from '../common/domain.enums';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { TenantAccessGuard } from '../guards/tenant-access.guard';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { MembershipsService } from '../tenancy/memberships.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantResolverService } from '../tenancy/tenant-resolver.service';
import { UsersService } from '../users/users.service';
import { AuthSessionService } from './auth-session.service';
import { JwtStrategy } from './jwt.strategy';
import { LegacyStaffPrincipalController } from './legacy-staff-principal.controller';

describe('R02 canonical principal through actual Nest JWT/tenant/role guards', () => {
  const secret = 'r02-local-only-jwt-signing-secret';
  const bridgeSecret = 'r02-local-only-bridge-secret-24-characters';
  const jwt = new JwtService({ secret });
  let app: INestApplication;
  let state: ReturnType<typeof fixture>;
  const context = new TenantContextService();
  const keys = [
    'MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN',
    'MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_PROVIDER',
    'MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_COMPANY_ID',
  ];
  const old = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const write = jest.fn(() => {
    throw new Error('No authority read may mutate');
  });

  function fixture() {
    return {
      user: {
        id: 'user-a',
        status: 'active',
        role: 'tenant_owner',
        tenantId: 'tenant-a',
        email: null,
      },
      session: {
        userId: 'user-a',
        tenantId: 'tenant-a' as string | null,
        expiresAt: new Date(Date.now() + 60000),
        revokedAt: null as Date | null,
      },
      membership: {
        id: 'membership-a',
        userId: 'user-a',
        tenantId: 'tenant-a',
        status: 'active',
        role: 'tenant_owner',
        tenant: { status: 'active' },
        branchId: null,
      },
      access: null as null | {
        id: string;
        role: string;
        status: string;
        staffId: string | null;
        externalStaffId: string;
      },
      identities: [{ id: 'identity-a', providerUserId: '100' }],
      staffLinks: [{ externalId: 'external-a' }],
    };
  }
  const prisma = {
    user: { findUnique: jest.fn(() => Promise.resolve(state.user)) },
    authSession: { findUnique: jest.fn(() => Promise.resolve(state.session)) },
    membership: {
      findUnique: jest.fn(() => Promise.resolve(state.membership)),
    },
    crmStaffAccess: {
      findUnique: jest.fn(() => Promise.resolve(state.access)),
      update: write,
    },
    authIdentity: {
      findMany: jest.fn(() => Promise.resolve(state.identities)),
    },
    staffProviderLink: {
      findMany: jest.fn(() => Promise.resolve(state.staffLinks)),
    },
    crmIntegration: {
      findMany: jest.fn(() =>
        Promise.resolve([
          {
            tenantId: 'tenant-a',
            settingsJson: { companyId: 'company-a' },
            tenant: { slug: 'tenant-a', status: 'active' },
          },
        ]),
      ),
    },
    actionExecution: { create: write },
    $transaction: async <T>(work: (tx: unknown) => Promise<T>) => work(prisma),
  };

  beforeAll(async () => {
    process.env[keys[0]] = bridgeSecret;
    process.env[keys[1]] = 'yclients';
    process.env[keys[2]] = 'company-a';
    const sessionReader = {
      systemGateway: {
        findAccessSessionById: () => Promise.resolve(state.session),
      },
    } as unknown as AuthSessionService;
    const module = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [LegacyStaffPrincipalController],
      providers: [
        JwtStrategy,
        MembershipsService,
        BridgeSourceService,
        TenantResolverService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => (key === 'JWT_SECRET' ? secret : undefined),
          },
        },
        { provide: TenantContextService, useValue: context },
        { provide: PrismaService, useValue: prisma },
        {
          provide: UsersService,
          useValue: { getUserOrThrow: () => Promise.resolve(state.user) },
        },
        {
          provide: AuthSessionService,
          useValue: {
            assertAccessSession:
              AuthSessionService.prototype.assertAccessSession.bind(
                sessionReader,
              ),
          },
        },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: TenantAccessGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      context.run('r02-http-test', next),
    );
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    for (const key of keys) {
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    }
  });
  beforeEach(() => {
    state = fixture();
    jest.clearAllMocks();
  });
  afterEach(() => {
    expect(write).not.toHaveBeenCalled();
  });

  function token(overrides = {}) {
    return jwt.sign(
      {
        user_id: state.user.id,
        tenant_id: state.session.tenantId,
        session_id: 'session-a',
        role: UserRole.TENANT_OWNER,
        ...overrides,
      },
      { expiresIn: 60 },
    );
  }
  const read = (
    credential?: string,
    body = { provider: 'yclients', externalCompanyId: 'company-a' },
  ) => {
    const call = request(app.getHttpServer() as Server)
      .post('/api/internal/legacy/staff-principal')
      .set('x-maya-legacy-bridge', bridgeSecret);
    if (credential) call.set('Authorization', 'Bearer ' + credential);
    return call.send(body);
  };

  it('requires a real signed session; raw channel identity is not authentication', async () => {
    await read().expect(401);
    await read('not-a-jwt').expect(401);
    await read(
      new JwtService({ secret: 'wrong' }).sign({ user_id: 'user-a' }),
    ).expect(401);
  });
  it('accepts exact active owner after all guards and exposes only its bound identity', async () => {
    const result = await read(token()).expect(201);
    expect(result.body).toMatchObject({
      userId: 'user-a',
      tenantId: 'tenant-a',
      role: 'tenant_owner',
      telegramId: '100',
      authIdentityId: 'identity-a',
      businessMutations: 0,
    });
    expect(prisma.authIdentity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-a', userId: 'user-a', provider: 'telegram' },
      }),
    );
  });
  it('rejects revoked session on the very next request', async () => {
    const credential = token();
    await read(credential).expect(201);
    state.session.revokedAt = new Date();
    await read(credential).expect(401);
  });
  it.each(['administrator', 'tenant_admin', 'business_owner'])(
    'accepts current %s membership without using the token role claim',
    async (role) => {
      state.membership.role = role;
      const result = await read(token({ role: 'client' })).expect(201);
      expect(result.body).toMatchObject({ role, platform: false });
    },
  );
  it('revalidates membership and identity changes on the next request', async () => {
    const credential = token();
    await read(credential).expect(201);
    state.membership.role = 'staff';
    await read(credential).expect(403);
    state.membership.role = 'tenant_owner';
    state.identities = [];
    const result = await read(credential).expect(201);
    expect(result.body).toMatchObject({
      telegramId: null,
      authIdentityId: null,
    });
  });
  it.each([
    'inactive-user',
    'suspended-membership',
    'expired-session',
    'wrong-session-user',
    'wrong-session-tenant',
  ])('rejects %s before read admission', async (kind) => {
    const credential = token();
    if (kind === 'inactive-user') state.user.status = 'suspended';
    if (kind === 'suspended-membership') state.membership.status = 'suspended';
    if (kind === 'expired-session') state.session.expiresAt = new Date(0);
    if (kind === 'wrong-session-user') state.session.userId = 'other-user';
    if (kind === 'wrong-session-tenant')
      state.session.tenantId = 'other-tenant';
    await read(credential).expect(401);
  });
  it('uses current membership role rather than a role supplied in signed claims', async () => {
    state.membership.role = 'client';
    await read(token({ role: 'platform_owner' })).expect(403);
  });
  it('rejects another installation and caller actor/tenant fields', async () => {
    await read(token(), {
      provider: 'yclients',
      externalCompanyId: 'other-company',
    }).expect(403);
    await read(token(), {
      provider: 'yclients',
      externalCompanyId: 'company-a',
      tenantId: 'other-tenant',
    } as never).expect(400);
  });
  it('rejects a valid JWT for a different tenant even with the bridge credential', async () => {
    state.session.tenantId = 'tenant-b';
    state.membership.tenantId = 'tenant-b';
    await read(token()).expect(403);
  });
  it('rejects staff without an active exact canonical staff access', async () => {
    state.membership.role = 'staff';
    await read(token()).expect(403);
    state.access = {
      id: 'access-a',
      role: 'staff',
      status: 'disabled',
      staffId: 'staff-a',
      externalStaffId: 'external-a',
    };
    await read(token()).expect(403);
    state.access.status = 'active';
    const result = await read(token()).expect(201);
    expect(result.body).toMatchObject({ role: 'staff', staffId: 'staff-a' });
  });
  it('does not synthesize a Telegram identity for a canonical account without one', async () => {
    state.identities = [];
    const result = await read(token()).expect(201);
    expect(result.body).toMatchObject({
      telegramId: null,
      authIdentityId: null,
    });
  });
  it('uses only the exact live provider link for legacy presentation after canonical access admission', async () => {
    state.membership.role = 'staff';
    state.access = {
      id: 'access-a',
      role: 'staff',
      status: 'active',
      staffId: 'staff-a',
      externalStaffId: 'stale-or-untrusted-reference',
    };
    const result = await read(token()).expect(201);
    expect(result.body).toMatchObject({
      role: 'staff',
      staffId: 'staff-a',
      externalStaffId: 'external-a',
    });
    expect(prisma.staffProviderLink.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        staffId: 'staff-a',
        provider: 'yclients',
        unlinkedAt: null,
        staff: { is: { tenantId: 'tenant-a', active: true } },
      },
      select: { externalId: true },
      take: 2,
    });
    expect(prisma.crmStaffAccess.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, role: true, status: true, staffId: true },
      }),
    );
  });
  it.each(['revoked', 'ambiguous'])(
    'does not fall back to a stale access reference for a %s provider binding',
    async (kind) => {
      state.membership.role = 'staff';
      state.access = {
        id: 'access-a',
        role: 'staff',
        status: 'active',
        staffId: 'staff-a',
        externalStaffId: 'stale-reference',
      };
      state.staffLinks =
        kind === 'revoked'
          ? []
          : [{ externalId: 'one' }, { externalId: 'two' }];
      const result = await read(token()).expect(201);
      expect(result.body).toMatchObject({
        role: 'staff',
        staffId: 'staff-a',
        externalStaffId: null,
      });
    },
  );
  it('accepts canonical tenantless platform role without requiring a fake membership', async () => {
    state.user.role = 'platform_owner';
    state.user.tenantId = null as unknown as string;
    state.session.tenantId = null;
    state.identities = [];
    const result = await read(token({ role: 'client' })).expect(201);
    expect(result.body).toMatchObject({
      platform: true,
      role: 'platform_owner',
      membershipId: null,
      telegramId: null,
    });
  });
});
