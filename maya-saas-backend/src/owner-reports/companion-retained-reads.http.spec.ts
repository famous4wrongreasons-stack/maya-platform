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
import { InboxController } from '../inbox/inbox.controller';
import { InboxService } from '../inbox/inbox.service';
import { OwnerReportSnapshotsController } from './owner-report-snapshots.controller';
import { OwnerReportStore } from './owner-report.store';
import { OwnerReportDownloadService } from './owner-report-download.service';
import {
  normalizeCanonicalOwnerReportPlan,
  ownerReportFingerprint,
  OWNER_REPORT_ACTION,
  OWNER_REPORT_CONTRACT,
  OWNER_REPORT_ORDER,
  type OwnerReportPlan,
} from './owner-report.contract';

describe('Companion retained reads through actual Nest JWT/tenant/role guards and source owners', () => {
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

  const acknowledge = jest.fn();

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
      findFirst: jest.fn(() =>
        Promise.resolve(
          state.membership.status === 'active' &&
            [
              'tenant_owner',
              'business_owner',
              'tenant_admin',
              'administrator',
              'platform_owner',
            ].includes(state.membership.role)
            ? { id: state.membership.id }
            : null,
        ),
      ),
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
    inboxItem: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: acknowledge,
      create: write,
    },
    ownerReportRun: {
      findMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: write,
      create: write,
    },
    operationalWorkItem: {
      findMany: jest.fn().mockResolvedValue([]),
      create: write,
      update: write,
    },
    actionExecution: { create: write },
    $transaction: async <T>(work: (tx: unknown) => Promise<T>) => work(prisma),
  };

  const reportId = '10000000-0000-4000-8000-000000000001';
  const config = {
    get: (key: string) => (key === 'JWT_SECRET' ? secret : undefined),
    getOrThrow: () => 'synthetic-companion-report-encryption-key',
  };
  const store = new OwnerReportStore(
    prisma as never,
    context,
    { admit: write } as never,
    config as never,
  );
  const inbox = new InboxService(prisma as never, context, undefined as never);
  let plan: OwnerReportPlan, run: Record<string, unknown>;
  function retain() {
    const canonical = normalizeCanonicalOwnerReportPlan(plan);
    run = {
      id: reportId,
      tenantId: plan.tenantId,
      reportType: plan.reportType,
      periodLocalDate: plan.periodLocalDate,
      reportVersion: plan.reportVersion,
      timezone: plan.timezone,
      expiresAt: new Date(plan.expiresAt),
      payloadRetentionUntil: new Date('2099-01-01T00:00:00.000Z'),
      intentHash: ownerReportFingerprint(store.identity, canonical),
      intentEncrypted: store.identity.encryptNormalizedPayload(
        JSON.stringify(canonical),
      ),
    };
    prisma.ownerReportRun.findMany.mockImplementation(() =>
      Promise.resolve([run]),
    );
    prisma.ownerReportRun.findUniqueOrThrow.mockImplementation(() =>
      Promise.resolve(run),
    );
  }
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
      controllers: [InboxController, OwnerReportSnapshotsController],
      providers: [
        { provide: InboxService, useValue: inbox },
        { provide: OwnerReportStore, useValue: store },
        {
          provide: OwnerReportDownloadService,
          useValue: { snapshot: write, staticHelp: write },
        },
        JwtStrategy,
        MembershipsService,
        BridgeSourceService,
        TenantResolverService,
        { provide: ConfigService, useValue: config },
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
    acknowledge.mockReset().mockImplementation(() => {
      throw new Error('Unexpected Inbox acknowledgement');
    });
    plan = {
      contract: OWNER_REPORT_CONTRACT,
      tenantId: 'tenant-a',
      reportType: 'daily_report',
      periodLocalDate: '2026-10-12',
      reportVersion: 1,
      timezone: 'Europe/Moscow',
      periodStart: '2026-10-11T21:00:00.000Z',
      periodEnd: '2026-10-12T21:00:00.000Z',
      expiresAt: '2026-10-19T21:00:00.000Z',
      classification: 'operational_single',
      channelOrder: OWNER_REPORT_ORDER,
      policy: {
        action: OWNER_REPORT_ACTION,
        key: 'production.deliver_report_briefing.proven-cutover',
        version: 1,
        preference: 'daily_brief',
      },
      content: {
        title: 'Synthetic daily report',
        bodyText: 'Synthetic retained facts',
        payload: { count: 1 },
        deepLink: '/app/?panel=chat',
      },
      recipients: [
        {
          userId: 'user-a',
          membershipId: 'membership-a',
          role: 'tenant_owner',
          slots: [
            store.slot('tenant-a', 'user-a', 'inbox', 'membership-a', 'user-a'),
          ],
        },
      ],
    };
    retain();
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
  const paths = [
    '/api/inbox',
    '/api/owner-reports',
    '/api/owner-reports/' + reportId + '/snapshot',
  ];
  const get = (path: string, credential: string | null = token()) => {
    const call = request(app.getHttpServer() as Server).get(path);
    if (credential) call.set('Authorization', 'Bearer ' + credential);
    return call;
  };
  it('reads Inbox scoped by current user and tenant, default cap 50; ignores caller-selected query authority', async () => {
    const row = {
      id: 'item-a',
      type: 'owner_alert',
      sourceEventId: 'source-a',
      title: 'Synthetic event',
      bodyText: 'Synthetic text',
      payloadJson: null,
      deepLink: null,
      createdAt: new Date('2026-10-13T09:00:00Z'),
      readAt: null,
    };
    prisma.inboxItem.findMany.mockResolvedValue([row] as never);
    const response = await get(
      paths[0] + '?tenantId=tenant-b&userId=other',
    ).expect(200);
    expect((response.body as { items: unknown[] }).items[0]).toMatchObject({
      title: row.title,
      read_at: null,
    });
    expect(prisma.inboxItem.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', userId: 'user-a', deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  });
  it('lists only retained recipient summaries and opens the exact immutable server snapshot', async () => {
    const list = await get(paths[1]).expect(200);
    expect(list.body).toEqual({
      reports: [
        {
          runId: reportId,
          reportType: 'daily_report',
          periodLocalDate: '2026-10-12',
          title: plan.content.title,
        },
      ],
    });
    expect(prisma.ownerReportRun.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        intentEncrypted: { not: null },
        payloadRetentionUntil: { gt: expect.any(Date) as unknown },
      },
      orderBy: [{ periodLocalDate: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    const read = await get(paths[2]).expect(200);
    expect(read.body).toEqual({
      contract: 'maya.owner-report-snapshot/1',
      runId: reportId,
      reportType: plan.reportType,
      periodLocalDate: plan.periodLocalDate,
      timezone: plan.timezone,
      content: plan.content,
    });
    expect(prisma.ownerReportRun.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id_tenantId: { id: reportId, tenantId: 'tenant-a' } },
    });
    expect(prisma.membership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'membership-a',
          tenantId: 'tenant-a',
          userId: 'user-a',
          status: 'active',
          user: { status: 'active' },
        }) as unknown,
      }),
    );
  });
  it('foreign recipient is absent from list and cannot read a known run id', async () => {
    plan.recipients = [
      {
        userId: 'user-b',
        membershipId: 'membership-b',
        role: 'tenant_owner',
        slots: [
          store.slot('tenant-a', 'user-b', 'inbox', 'membership-b', 'user-b'),
        ],
      },
    ];
    retain();
    expect((await get(paths[1]).expect(200)).body).toEqual({ reports: [] });
    await get(paths[2]).expect(403);
    expect(prisma.membership.findFirst).not.toHaveBeenCalled();
  });
  it('membership authority is freshly checked for each snapshot after list', async () => {
    await get(paths[1]).expect(200);
    prisma.membership.findFirst.mockResolvedValueOnce(null);
    await get(paths[2]).expect(403);
  });
  it('retention expiry and manifest substitution are refused by the existing source owner', async () => {
    for (const mutate of [
      () => {
        run.payloadRetentionUntil = new Date(0);
      },
      () => {
        run.intentHash = '0'.repeat(64);
      },
      () => {
        run.tenantId = 'tenant-b';
      },
    ]) {
      retain();
      mutate();
      await expect(
        context.runAsSystemTenant('tenant-a', () =>
          store.snapshot('tenant-a', 'user-a', reportId),
        ),
      ).rejects.toThrow();
    }
  });
  it.each(paths)(
    'missing, invalid, revoked and tenant-substituted session cannot read %s',
    async (path) => {
      await get(path, null).expect(401);
      await get(path, 'invalid').expect(401);
      const credential = token();
      state.session.revokedAt = new Date();
      await get(path, credential).expect(401);
      state.session.revokedAt = null;
      const foreign = jwt.sign(
        {
          user_id: 'user-a',
          tenant_id: 'tenant-b',
          session_id: 'session-a',
          role: UserRole.TENANT_OWNER,
        },
        { expiresIn: 60 },
      );
      await get(path, foreign).expect(401);
    },
  );
  it.each(paths)(
    'personal Client role does not inherit business feed/report access: %s',
    async (path) => {
      state.user.role = 'client';
      state.membership.role = 'client';
      await get(path).expect(403);
    },
  );

  // Same canonical Inbox owner; synthetic persistence only. No Action Engine, task or delivery write.
  function acknowledgementFixture() {
    const rows = [
      {
        id: 'own-item',
        tenantId: 'tenant-a',
        userId: 'user-a',
        deletedAt: null,
        readAt: null,
      },
      {
        id: 'other-user',
        tenantId: 'tenant-a',
        userId: 'user-b',
        deletedAt: null,
        readAt: null,
      },
      {
        id: 'other-tenant',
        tenantId: 'tenant-b',
        userId: 'user-a',
        deletedAt: null,
        readAt: null,
      },
      {
        id: 'deleted-item',
        tenantId: 'tenant-a',
        userId: 'user-a',
        deletedAt: new Date(0),
        readAt: null,
      },
    ] as Array<{
      id: string;
      tenantId: string;
      userId: string;
      deletedAt: Date | null;
      readAt: Date | null;
    }>;
    acknowledge.mockImplementation(
      ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: { readAt: Date };
      }) => {
        expect(where).toEqual({
          id: expect.any(String) as unknown,
          tenantId: 'tenant-a',
          userId: 'user-a',
          deletedAt: null,
        });
        expect(Object.keys(data)).toEqual(['readAt']);
        expect(data.readAt).toBeInstanceOf(Date);
        const selected = rows.filter(
          (row) =>
            row.id === where.id &&
            row.tenantId === where.tenantId &&
            row.userId === where.userId &&
            row.deletedAt === where.deletedAt,
        );
        for (const row of selected) row.readAt = data.readAt;
        return Promise.resolve({ count: selected.length });
      },
    );
    prisma.inboxItem.findMany.mockImplementation(() =>
      Promise.resolve(
        rows
          .filter(
            (row) =>
              row.tenantId === 'tenant-a' &&
              row.userId === 'user-a' &&
              row.deletedAt === null,
          )
          .map((row) => ({
            ...row,
            type: 'owner_alert',
            title: 'Synthetic notification',
            bodyText: 'Synthetic text',
            createdAt: new Date('2026-10-14T09:00:00Z'),
          })),
      ),
    );
    return rows;
  }
  const mark = (id: string, credential: string | null = token()) => {
    const call = request(app.getHttpServer() as Server).post(
      '/api/inbox/' + id + '/read',
    );
    if (credential) call.set('Authorization', 'Bearer ' + credential);
    return call;
  };
  it('explicit Inbox acknowledgement updates only readAt for the current tenant/user and fresh GET confirms it', async () => {
    const rows = acknowledgementFixture();
    expect(
      (
        (await get('/api/inbox').expect(200)).body as {
          items: Array<{ read_at: string | null }>;
        }
      ).items[0].read_at,
    ).toBeNull();
    expect(
      (
        await mark('own-item')
          .send({ tenantId: 'tenant-b', userId: 'user-b', readAt: 'forged' })
          .expect(201)
      ).body,
    ).toEqual({ ok: true });
    expect(rows[0].readAt).toBeInstanceOf(Date);
    expect(rows.slice(1).every((row) => row.readAt === null)).toBe(true);
    expect(
      (
        (await get('/api/inbox').expect(200)).body as {
          items: Array<{ read_at: string | null }>;
        }
      ).items[0].read_at,
    ).toBe(rows[0].readAt!.toISOString());
    expect(acknowledge).toHaveBeenCalledTimes(1);
  });
  it.each(['other-user', 'other-tenant', 'deleted-item', 'missing-item'])(
    'ok is deliberately non-disclosing: marking %s changes no row and does not prove read state',
    async (id) => {
      const rows = acknowledgementFixture();
      expect((await mark(id).send({}).expect(201)).body).toEqual({ ok: true });
      expect(rows.every((row) => row.readAt === null)).toBe(true);
      expect(
        (
          (await get('/api/inbox').expect(200)).body as {
            items: Array<{ read_at: string | null }>;
          }
        ).items[0].read_at,
      ).toBeNull();
    },
  );
  it('repeated and concurrent acknowledgements never create a second item or task/delivery effect', async () => {
    const rows = acknowledgementFixture();
    await mark('own-item').send({}).expect(201);
    await Promise.all([
      mark('own-item').send({}).expect(201),
      mark('own-item').send({}).expect(201),
    ]);
    expect(rows).toHaveLength(4);
    expect(rows[0].readAt).toBeInstanceOf(Date);
    expect(rows.slice(1).every((row) => row.readAt === null)).toBe(true);
    expect(acknowledge).toHaveBeenCalledTimes(3);
  });
  it('anonymous invalid revoked and tenant-substituted sessions cannot mark read', async () => {
    acknowledgementFixture();
    await mark('own-item', null).send({}).expect(401);
    await mark('own-item', 'invalid').send({}).expect(401);
    const credential = token();
    state.session.revokedAt = new Date();
    await mark('own-item', credential).send({}).expect(401);
    state.session.revokedAt = null;
    const foreign = jwt.sign(
      {
        user_id: 'user-a',
        tenant_id: 'tenant-b',
        session_id: 'session-a',
        role: UserRole.TENANT_OWNER,
      },
      { expiresIn: 60 },
    );
    await mark('own-item', foreign).send({}).expect(401);
    expect(acknowledge).not.toHaveBeenCalled();
  });
  it('revoked membership and client role are not notification-owner authority', async () => {
    acknowledgementFixture();
    const credential = token();
    state.membership.status = 'revoked';
    await mark('own-item', credential).send({}).expect(401);
    state.membership.status = 'active';
    state.membership.role = 'client';
    state.user.role = 'client';
    await mark('own-item', credential).send({}).expect(403);
    expect(acknowledge).not.toHaveBeenCalled();
  });
});
