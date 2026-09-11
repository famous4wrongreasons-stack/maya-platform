import type { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { TenantAccessGuard } from '../guards/tenant-access.guard';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TelegramStaffPrincipalController } from './telegram-staff-principal.controller';

describe('canonical staff authority from a trusted Telegram bot update', () => {
  const bridgeSecret = 'telegram-owner-bridge-secret-24-characters';
  const context = new TenantContextService();
  let app: INestApplication;
  let state: ReturnType<typeof fixture>;
  const write = jest.fn(() => {
    throw new Error('Authority resolution must remain read-only');
  });

  function fixture() {
    return {
      identity: { id: 'identity-a', userId: 'user-a' } as null | {
        id: string;
        userId: string;
      },
      user: { id: 'user-a', status: 'active' },
      membership: {
        id: 'membership-a',
        role: 'tenant_owner',
        status: 'active',
      },
      access: null,
    };
  }
  const prisma = {
    authIdentity: {
      findUnique: jest.fn(() => Promise.resolve(state.identity)),
      create: write,
    },
    user: { findUnique: jest.fn(() => Promise.resolve(state.user)) },
    membership: {
      findUnique: jest.fn(() => Promise.resolve(state.membership)),
    },
    crmStaffAccess: {
      findUnique: jest.fn(() => Promise.resolve(state.access)),
      update: write,
    },
    staffProviderLink: { findMany: jest.fn(() => Promise.resolve([])) },
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
  const keys = [
    'MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN',
    'MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_PROVIDER',
    'MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_COMPANY_ID',
  ];
  const old = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  beforeAll(async () => {
    process.env[keys[0]] = bridgeSecret;
    process.env[keys[1]] = 'yclients';
    process.env[keys[2]] = 'company-a';
    const module = await Test.createTestingModule({
      controllers: [TelegramStaffPrincipalController],
      providers: [
        BridgeSourceService,
        { provide: TenantContextService, useValue: context },
        { provide: PrismaService, useValue: prisma },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: TenantAccessGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      context.run('telegram-owner-http-test', next),
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
  afterEach(() => expect(write).not.toHaveBeenCalled());

  const read = (providerUserId: unknown = '100', secret = bridgeSecret) =>
    request(app.getHttpServer() as Server)
      .post('/api/internal/legacy/telegram-staff-principal')
      .set('x-maya-legacy-bridge', secret)
      .send({
        provider: 'yclients',
        externalCompanyId: 'company-a',
        providerUserId,
      });

  it('resolves the exact active AuthIdentity and membership without a JWT', async () => {
    const result = await read().expect(201);
    expect(result.body).toMatchObject({
      contract: 'maya.canonical-telegram-staff-principal/1',
      userId: 'user-a',
      tenantId: 'tenant-a',
      membershipId: 'membership-a',
      role: 'tenant_owner',
      telegramId: '100',
      authIdentityId: 'identity-a',
      businessMutations: 0,
    });
    expect(prisma.authIdentity.findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_provider_providerUserId: {
          tenantId: 'tenant-a',
          provider: 'telegram',
          providerUserId: '100',
        },
      },
      select: { id: true, userId: true },
    });
  });

  it.each([
    ['missing identity', () => (state.identity = null)],
    ['inactive user', () => (state.user.status = 'suspended')],
    ['inactive membership', () => (state.membership.status = 'suspended')],
    ['client membership', () => (state.membership.role = 'client')],
  ])('fails closed for %s', async (_name, mutate) => {
    mutate();
    const result = await read().expect(201);
    expect(result.body).toEqual({
      contract: 'maya.canonical-telegram-staff-principal/1',
      principal: null,
      businessMutations: 0,
    });
  });

  it('rejects forged installation, malformed subject, and wrong bridge secret', async () => {
    await read('100', 'wrong').expect(401);
    await read('not-a-telegram-subject').expect(400);
    await request(app.getHttpServer() as Server)
      .post('/api/internal/legacy/telegram-staff-principal')
      .set('x-maya-legacy-bridge', bridgeSecret)
      .send({
        provider: 'yclients',
        externalCompanyId: 'other-company',
        providerUserId: '100',
      })
      .expect(403);
  });
});
