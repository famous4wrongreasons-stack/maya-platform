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
import { AuthSessionService } from '../auth/auth-session.service';
import { JwtStrategy } from '../auth/jwt.strategy';
import { OperationalWorkController } from './operational-work.controller';
import { Package5Wave1CanonicalCutoverService } from './package5-wave1-canonical-cutover.service';

describe('R04 A23 through actual Nest JWT/tenant/role guards', () => {
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
    operationalWorkItem: {
      findMany: jest.fn().mockResolvedValue([]),
      create: write,
      update: write,
    },
    actionExecution: { create: write },
    $transaction: async <T>(work: (tx: unknown) => Promise<T>) => work(prisma),
  };

  const canonical = {
    createTask: jest
      .fn()
      .mockResolvedValue({ result: { actionExecutionId: 'execution-a' } }),
    completeTask: jest
      .fn()
      .mockResolvedValue({ actionExecutionId: 'execution-b' }),
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
      controllers: [OperationalWorkController],
      providers: [
        { provide: Package5Wave1CanonicalCutoverService, useValue: canonical },
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
    // Keep one loopback listener for the suite. Supertest must not race
    // close/reopen of Nest's shared server between sequential requests.
    await app.listen(0, '127.0.0.1');
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

  function token() {
    return jwt.sign(
      {
        user_id: state.user.id,
        tenant_id: state.session.tenantId,
        session_id: 'session-a',
        role: UserRole.TENANT_OWNER,
      },
      { expiresIn: 60 },
    );
  }
  const command = {
    assigneeUserId: 'assignee-a',
    title: '  Verify stock  ',
    bodyText: '  Physical count  ',
    dueAt: null,
  };
  function post(
    path = 'create',
    body: unknown = command,
    credential: string | null = token(),
    key: string | null = 'intent-a',
  ) {
    const call = request(app.getHttpServer() as Server).post(
      '/api/operational-work/' + path,
    );
    if (credential) call.set('Authorization', 'Bearer ' + credential);
    if (key) call.set('Idempotency-Key', key);
    return call.send(body);
  }
  it('forwards exact normalized command and identity to A23 with current actor/tenant', async () => {
    await post().expect(201);
    expect(canonical.createTask).toHaveBeenCalledWith(
      'tenant-a',
      'user-a',
      {
        assigneeUserId: 'assignee-a',
        title: 'Verify stock',
        bodyText: 'Physical count',
        dueAt: null,
      },
      'intent-a',
    );
  });
  it('rejects missing/invalid signed sessions before admission', async () => {
    await post('create', command, null).expect(401);
    await post('create', command, 'not-a-token').expect(401);
    expect(canonical.createTask).not.toHaveBeenCalled();
  });
  it('revocation takes effect on next request', async () => {
    const credential = token();
    await post('create', command, credential).expect(201);
    state.session.revokedAt = new Date();
    await post('create', command, credential).expect(401);
    expect(canonical.createTask).toHaveBeenCalledTimes(1);
  });
  it('suspended membership cannot use stale role to promote itself', async () => {
    state.membership.status = 'suspended';
    await post().expect(401);
    expect(canonical.createTask).not.toHaveBeenCalled();
  });
  it('staff cannot create a management command; Client cannot read tasks', async () => {
    state.membership.role = 'staff';
    state.user.role = 'staff';
    await post().expect(403);
    state.membership.role = 'client';
    state.user.role = 'client';
    await request(app.getHttpServer() as Server)
      .get('/api/operational-work')
      .set('Authorization', 'Bearer ' + token())
      .expect(403);
    expect(canonical.createTask).not.toHaveBeenCalled();
  });
  it('rejects forged authority/unsupported semantics and missing identity', async () => {
    for (const field of [
      'tenantId',
      'actorUserId',
      'policyDecision',
      'safe_autocreate',
      'assigned_to',
    ])
      await post('create', { ...command, [field]: 'forged' }).expect(400);
    await post('create', command, token(), null).expect(400);
    expect(canonical.createTask).not.toHaveBeenCalled();
  });
  it('rejects invalid time and raw journal IDs before admission', async () => {
    await post('create', { ...command, dueAt: 'yesterday' }).expect(400);
    await post('complete', { inboxItemId: '123' }).expect(400);
    await post('complete', { inboxItemId: 123 }).expect(400);
    expect(canonical.createTask).not.toHaveBeenCalled();
    expect(canonical.completeTask).not.toHaveBeenCalled();
  });
  it('completion delegates existing Inbox binding with current actor/tenant', async () => {
    await post('complete', { inboxItemId: 'inbox-canonical-a' }).expect(201);
    expect(canonical.completeTask).toHaveBeenCalledWith(
      'tenant-a',
      'user-a',
      'inbox-canonical-a',
      'intent-a',
    );
  });
  it('repeated reads stay personal canonical projection without writes/admission', async () => {
    for (let i = 0; i < 2; i++) {
      const response = await request(app.getHttpServer() as Server)
        .get('/api/operational-work')
        .set('Authorization', 'Bearer ' + token())
        .expect(200);
      expect(response.body).toMatchObject({
        contract: 'maya.operational-work/1',
        current_user_id: 'user-a',
        read_only: true,
        tasks: [],
      });
    }
    expect(prisma.operationalWorkItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-a', assigneeUserId: 'user-a', kind: 'task' },
      }),
    );
    expect(canonical.createTask).not.toHaveBeenCalled();
    expect(canonical.completeTask).not.toHaveBeenCalled();
  });
});
