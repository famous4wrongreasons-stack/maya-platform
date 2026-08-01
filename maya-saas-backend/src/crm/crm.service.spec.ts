import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';

import {
  CrmIntegrationStatus,
  CrmProvider,
  UserRole,
} from '../common/domain.enums';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CrmAdapterFactory } from './crm-adapter.factory';
import { CrmService } from './crm.service';

describe('CrmService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('discovers tenant-visible companies without persisting the token', async () => {
    const discoverCompanies = jest.fn().mockResolvedValue([
      {
        id: '42',
        title: 'Main branch',
        address: 'Central street',
      },
    ]);
    const create = jest.fn().mockReturnValue({ discoverCompanies });
    const tenantContext = new TenantContextService();
    const service = new CrmService(
      {} as PrismaService,
      {} as EncryptionService,
      { create },
      tenantContext,
    );

    const result = await tenantContext.runAsSystemTenant('tenant-1', () =>
      service.discoverCompanies('tenant-1', {
        provider: CrmProvider.YCLIENTS,
        apiToken: 'tenant-secret',
      }),
    );

    expect(create).toHaveBeenCalledWith(CrmProvider.YCLIENTS, {
      provider: CrmProvider.YCLIENTS,
      apiToken: 'tenant-secret',
      settings: {},
    });
    expect(discoverCompanies).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      provider: CrmProvider.YCLIENTS,
      companies: [
        {
          id: '42',
          title: 'Main branch',
          address: 'Central street',
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('tenant-secret');
  });

  it('allows provider mock without an explicit apiToken', async () => {
    const checkedAt = new Date('2026-07-16T12:00:00.000Z');
    jest.useFakeTimers({ now: checkedAt });
    const crmFindUniqueMock = jest.fn().mockResolvedValue(null);
    const crmCreateMock = jest.fn().mockResolvedValue({
      id: 'crm-1',
      tenantId: 'tenant-1',
      provider: CrmProvider.MOCK,
      encryptedApiToken: 'enc:mock',
      baseUrl: null,
      status: CrmIntegrationStatus.ACTIVE,
      settingsJson: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const encryptMock = jest.fn().mockReturnValue('enc:mock');

    const prisma = {
      crmIntegration: {
        findUnique: crmFindUniqueMock,
        create: crmCreateMock,
      },
    } as unknown as PrismaService;
    const encryptionService = {
      encrypt: encryptMock,
      decrypt: jest.fn(),
    } as unknown as EncryptionService;
    const adapterFactory = {} as CrmAdapterFactory;
    const tenantContext = new TenantContextService();

    const service = new CrmService(
      prisma,
      encryptionService,
      adapterFactory,
      tenantContext,
    );
    const result = await tenantContext.runAsSystemTenant('tenant-1', () =>
      service.createOrUpdateIntegration('tenant-1', {
        provider: CrmProvider.MOCK,
      }),
    );

    expect(encryptMock).toHaveBeenCalledWith('mock');
    expect(crmCreateMock).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-1',
        provider: CrmProvider.MOCK,
        encryptedApiToken: 'enc:mock',
        baseUrl: undefined,
        status: CrmIntegrationStatus.ACTIVE,
        settingsJson: {},
        verifiedAt: checkedAt,
        lastCheckedAt: checkedAt,
        lastSyncAt: checkedAt,
      },
    });
    expect(result).toMatchObject({
      tenant_id: 'tenant-1',
      provider: CrmProvider.MOCK,
      status: CrmIntegrationStatus.ACTIVE,
    });
  });

  it('rejects a CRM tenant argument that conflicts with request context', async () => {
    const crmFindUniqueMock = jest.fn();
    const prisma = {
      crmIntegration: {
        findUnique: crmFindUniqueMock,
      },
    } as unknown as PrismaService;
    const tenantContext = new TenantContextService();
    const service = new CrmService(
      prisma,
      {} as EncryptionService,
      {} as CrmAdapterFactory,
      tenantContext,
    );

    await expect(
      tenantContext.runAsSystemTenant('tenant-a', () =>
        service.getServices('tenant-b'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(crmFindUniqueMock).not.toHaveBeenCalled();
  });

  it('requires a fresh token when switching from mock to a real provider', async () => {
    const crmUpdateMock = jest.fn();
    const prisma = {
      crmIntegration: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'crm-1',
          tenantId: 'tenant-1',
          provider: CrmProvider.MOCK,
          encryptedApiToken: 'enc:mock',
          baseUrl: null,
          status: CrmIntegrationStatus.ACTIVE,
          settingsJson: {},
        }),
        update: crmUpdateMock,
      },
    } as unknown as PrismaService;
    const encryptMock = jest.fn();
    const encryptionService = {
      encrypt: encryptMock,
      decrypt: jest.fn(),
    } as unknown as EncryptionService;
    const tenantContext = new TenantContextService();
    const service = new CrmService(
      prisma,
      encryptionService,
      {} as CrmAdapterFactory,
      tenantContext,
    );

    await expect(
      tenantContext.runAsSystemTenant('tenant-1', () =>
        service.createOrUpdateIntegration('tenant-1', {
          provider: CrmProvider.YCLIENTS,
          settingsJson: { companyId: 42 },
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(encryptMock).not.toHaveBeenCalled();
    expect(crmUpdateMock).not.toHaveBeenCalled();
  });

  it('fails closed before loading CRM credentials without tenant context', async () => {
    const crmFindUniqueMock = jest.fn();
    const prisma = {
      crmIntegration: {
        findUnique: crmFindUniqueMock,
      },
    } as unknown as PrismaService;
    const service = new CrmService(
      prisma,
      {} as EncryptionService,
      {} as CrmAdapterFactory,
      new TenantContextService(),
    );

    await expect(service.getServices('tenant-a')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(crmFindUniqueMock).not.toHaveBeenCalled();
  });

  it('rejects a scaffolded provider before storing its credentials', async () => {
    const crmCreateMock = jest.fn();
    const encryptMock = jest.fn();
    const prisma = {
      crmIntegration: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: crmCreateMock,
      },
    } as unknown as PrismaService;
    const tenantContext = new TenantContextService();
    const service = new CrmService(
      prisma,
      {
        encrypt: encryptMock,
        decrypt: jest.fn(),
      } as unknown as EncryptionService,
      {} as CrmAdapterFactory,
      tenantContext,
    );

    await expect(
      tenantContext.runAsSystemTenant('tenant-1', () =>
        service.createOrUpdateIntegration('tenant-1', {
          provider: CrmProvider.DIKIDI,
          apiToken: 'must-not-be-stored',
        }),
      ),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: 'crm_provider_not_available',
          provider: CrmProvider.DIKIDI,
          implementation_status: 'planned',
          selectable_provider_keys: [
            CrmProvider.YCLIENTS,
            CrmProvider.ALTEGIO,
            CrmProvider.MOCK,
          ],
        },
      },
    });
    expect(encryptMock).not.toHaveBeenCalled();
    expect(crmCreateMock).not.toHaveBeenCalled();
  });

  it('fails closed for a previously stored scaffold before decrypting it', async () => {
    const decryptMock = jest.fn();
    const adapterCreateMock = jest.fn();
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          calendarSource: 'external',
        }),
      },
      crmIntegration: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'crm-planned',
          tenantId: 'tenant-1',
          provider: CrmProvider.WHITELINES,
          encryptedApiToken: 'encrypted-secret',
          baseUrl: null,
          settingsJson: {},
        }),
      },
    } as unknown as PrismaService;
    const tenantContext = new TenantContextService();
    const service = new CrmService(
      prisma,
      {
        encrypt: jest.fn(),
        decrypt: decryptMock,
      } as unknown as EncryptionService,
      { create: adapterCreateMock },
      tenantContext,
    );

    await expect(
      tenantContext.runAsSystemTenant('tenant-1', () =>
        service.getServices('tenant-1'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(decryptMock).not.toHaveBeenCalled();
    expect(adapterCreateMock).not.toHaveBeenCalled();
  });

  it('does not encrypt or persist credentials rejected by the provider', async () => {
    const upsertMock = jest.fn();
    const encryptMock = jest.fn();
    const tenantContext = new TenantContextService();
    const service = new CrmService(
      {
        crmIntegration: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: upsertMock,
        },
      } as unknown as PrismaService,
      {
        encrypt: encryptMock,
        decrypt: jest.fn(),
      } as unknown as EncryptionService,
      {
        create: jest.fn().mockReturnValue({
          testConnection: jest.fn().mockRejectedValue(new Error('401 token')),
        }),
      },
      tenantContext,
    );

    await expect(
      tenantContext.runAsSystemTenant('tenant-1', () =>
        service.stageIntegration('tenant-1', {
          provider: CrmProvider.YCLIENTS,
          apiToken: 'rejected-token',
          settingsJson: { companyId: 42 },
        }),
      ),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: 'crm_credentials_rejected',
          provider: CrmProvider.YCLIENTS,
        },
      },
    });
    expect(encryptMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('distinguishes a missing platform connector secret from a bad tenant token', async () => {
    const upsertMock = jest.fn();
    const tenantContext = new TenantContextService();
    const service = new CrmService(
      {
        crmIntegration: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: upsertMock,
        },
      } as unknown as PrismaService,
      {
        encrypt: jest.fn(),
        decrypt: jest.fn(),
      } as unknown as EncryptionService,
      {
        create: jest.fn(() => {
          throw new Error('YCLIENTS_PARTNER_TOKEN is not configured');
        }),
      },
      tenantContext,
    );

    await expect(
      tenantContext.runAsSystemTenant('tenant-1', () =>
        service.stageIntegration('tenant-1', {
          provider: CrmProvider.YCLIENTS,
          apiToken: 'tenant-token',
          settingsJson: { companyId: 42 },
        }),
      ),
    ).rejects.toMatchObject({
      response: {
        error: { code: 'crm_platform_configuration_error' },
      },
    });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('stores a verified connection as pending and never returns its token', async () => {
    const now = new Date('2026-07-16T12:00:00.000Z');
    const pendingIntegration = {
      id: 'crm-verified',
      tenantId: 'tenant-1',
      provider: CrmProvider.YCLIENTS,
      encryptedApiToken: 'enc:tenant-token',
      baseUrl: null,
      status: CrmIntegrationStatus.PENDING_ACTIVATION,
      settingsJson: {
        companyId: 42,
        apiToken: 'must-never-be-returned',
      },
      verifiedAt: now,
      lastCheckedAt: now,
      lastSyncAt: now,
      lastErrorCode: null,
      lastErrorAt: null,
      createdAt: now,
      updatedAt: now,
    };
    type UpsertArgs = {
      create: {
        status: string;
        encryptedApiToken: string;
      };
    };
    let capturedUpsertArgs: UpsertArgs | undefined;
    const upsertMock = jest.fn((args: UpsertArgs) => {
      capturedUpsertArgs = args;
      return Promise.resolve(pendingIntegration);
    });
    const tenantContext = new TenantContextService();
    const service = new CrmService(
      {
        crmIntegration: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: upsertMock,
        },
      } as unknown as PrismaService,
      {
        encrypt: jest.fn().mockReturnValue('enc:tenant-token'),
        decrypt: jest.fn(),
      } as unknown as EncryptionService,
      {
        create: jest.fn().mockReturnValue({
          testConnection: jest.fn().mockResolvedValue({
            ok: true,
            provider: CrmProvider.YCLIENTS,
            message: 'ok',
          }),
          getServices: jest.fn().mockResolvedValue([
            {
              id: 'service-1',
              name: 'Haircut',
              price: 2000,
              duration_minutes: 60,
              currency: 'RUB',
            },
          ]),
          getStaff: jest
            .fn()
            .mockResolvedValue([{ id: 'staff-1', name: 'Alex' }]),
        }),
      },
      tenantContext,
    );

    const result = await tenantContext.runAsSystemTenant('tenant-1', () =>
      service.stageIntegration('tenant-1', {
        provider: CrmProvider.YCLIENTS,
        apiToken: 'tenant-token',
        settingsJson: { companyId: 42 },
      }),
    );

    expect(capturedUpsertArgs?.create.status).toBe(
      CrmIntegrationStatus.PENDING_ACTIVATION,
    );
    expect(capturedUpsertArgs?.create.encryptedApiToken).toBe(
      'enc:tenant-token',
    );
    expect(result.preview).toMatchObject({
      company_id: 42,
      services: { count: 1 },
      staff: { count: 1 },
    });
    expect(JSON.stringify(result)).not.toContain('tenant-token');
    expect(result.connection.settings_json).toEqual({ companyId: 42 });
  });

  it('activates only a verified staged connection and switches the tenant source', async () => {
    const now = new Date('2026-07-16T12:00:00.000Z');
    const pendingIntegration = {
      id: 'crm-verified',
      tenantId: 'tenant-1',
      provider: CrmProvider.YCLIENTS,
      encryptedApiToken: 'enc:tenant-token',
      baseUrl: null,
      status: CrmIntegrationStatus.PENDING_ACTIVATION,
      settingsJson: { companyId: 42 },
      verifiedAt: now,
      lastCheckedAt: now,
      lastSyncAt: now,
      lastErrorCode: null,
      lastErrorAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const activeIntegration = {
      ...pendingIntegration,
      status: CrmIntegrationStatus.ACTIVE,
    };
    const crmUpdateMock = jest.fn().mockResolvedValue(activeIntegration);
    const tenantUpdateMock = jest.fn().mockResolvedValue({ id: 'tenant-1' });
    const brandingFindMock = jest.fn().mockResolvedValue({
      themeJson: {
        booking: { mode: 'preview' },
        custom: { retained: true },
      },
    });
    const brandingUpsertMock = jest.fn().mockResolvedValue({
      tenantId: 'tenant-1',
    });
    const transactionMock = jest
      .fn()
      .mockImplementation((callback: (tx: unknown) => unknown) =>
        Promise.resolve(
          callback({
            crmIntegration: { update: crmUpdateMock },
            tenant: { update: tenantUpdateMock },
            brandingSettings: {
              findUnique: brandingFindMock,
              upsert: brandingUpsertMock,
            },
          }),
        ),
      );
    const tenantContext = new TenantContextService();
    const service = new CrmService(
      {
        crmIntegration: {
          findUnique: jest
            .fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(pendingIntegration),
          upsert: jest.fn().mockResolvedValue(pendingIntegration),
        },
        $transaction: transactionMock,
      } as unknown as PrismaService,
      {
        encrypt: jest.fn().mockReturnValue('enc:tenant-token'),
        decrypt: jest.fn(),
      } as unknown as EncryptionService,
      {
        create: jest.fn().mockReturnValue({
          testConnection: jest.fn().mockResolvedValue({ ok: true }),
          getServices: jest.fn().mockResolvedValue([]),
          getStaff: jest.fn().mockResolvedValue([]),
        }),
      },
      tenantContext,
    );

    const result = await tenantContext.runAsSystemTenant('tenant-1', () =>
      service.connectAndActivateIntegration('tenant-1', {
        provider: CrmProvider.YCLIENTS,
        apiToken: 'tenant-token',
        settingsJson: { companyId: 42 },
      }),
    );

    expect(crmUpdateMock).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      data: {
        status: CrmIntegrationStatus.ACTIVE,
        lastErrorCode: null,
        lastErrorAt: null,
      },
    });
    expect(tenantUpdateMock).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      data: { calendarSource: 'external' },
    });
    expect(brandingUpsertMock).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      create: {
        tenantId: 'tenant-1',
        themeJson: {
          booking: { mode: 'live' },
          custom: { retained: true },
        },
      },
      update: {
        themeJson: {
          booking: { mode: 'live' },
          custom: { retained: true },
        },
      },
    });
    expect(result.status).toBe(CrmIntegrationStatus.ACTIVE);
  });

  it('does not use a pending connection for operational CRM reads', async () => {
    const adapterCreateMock = jest.fn();
    const tenantContext = new TenantContextService();
    const service = new CrmService(
      {
        tenant: {
          findUnique: jest.fn().mockResolvedValue({
            calendarSource: 'external',
          }),
        },
        crmIntegration: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'crm-pending',
            tenantId: 'tenant-1',
            provider: CrmProvider.YCLIENTS,
            encryptedApiToken: 'encrypted',
            baseUrl: null,
            status: CrmIntegrationStatus.PENDING_ACTIVATION,
            settingsJson: { companyId: 42 },
          }),
        },
      } as unknown as PrismaService,
      { decrypt: jest.fn() } as unknown as EncryptionService,
      { create: adapterCreateMock },
      tenantContext,
    );

    await expect(
      tenantContext.runAsSystemTenant('tenant-1', () =>
        service.getServices('tenant-1'),
      ),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: 'crm_integration_not_active',
          next_action: 'activate',
        },
      },
    });
    expect(adapterCreateMock).not.toHaveBeenCalled();
  });

  it('revokes tenant access when an assigned employee disappears from the active CRM team', async () => {
    const accessFindFirst = jest
      .fn()
      .mockResolvedValueOnce({
        externalStaffId: 'crm-fired',
        role: UserRole.STAFF,
        status: 'active',
      })
      .mockResolvedValueOnce({ status: 'disabled' });
    const accessUpdate = jest.fn().mockResolvedValue({});
    const membershipUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    type SessionUpdateArgs = {
      where: { tenantId: string; userId: string; revokedAt: null };
      data: { revokedAt: Date; revokeReason: string };
    };
    const sessionUpdateMany: jest.MockedFunction<
      (args: SessionUpdateArgs) => Promise<{ count: number }>
    > = jest.fn().mockResolvedValue({ count: 2 });
    const transaction = jest.fn(
      async (run: (tx: Record<string, unknown>) => Promise<void>) =>
        run({
          crmStaffAccess: { update: accessUpdate },
          membership: { updateMany: membershipUpdateMany },
          authSession: { updateMany: sessionUpdateMany },
        }),
    );
    const integration = {
      id: 'crm-1',
      tenantId: 'tenant-1',
      provider: CrmProvider.YCLIENTS,
      encryptedApiToken: 'encrypted',
      baseUrl: null,
      status: CrmIntegrationStatus.ACTIVE,
      settingsJson: { companyId: 42 },
      verifiedAt: new Date(),
      lastCheckedAt: new Date(),
      lastSyncAt: new Date(),
      lastErrorCode: null,
      lastErrorAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const tenantContext = new TenantContextService();
    const service = new CrmService(
      {
        crmStaffAccess: {
          findFirst: accessFindFirst,
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'access-1',
              externalStaffId: 'crm-fired',
              userId: 'user-1',
              role: UserRole.STAFF,
              status: 'active',
            },
          ]),
        },
        crmIntegration: {
          findUnique: jest.fn().mockResolvedValue(integration),
        },
        $transaction: transaction,
      } as unknown as PrismaService,
      {
        decrypt: jest.fn().mockReturnValue('tenant-token'),
      } as unknown as EncryptionService,
      {
        create: jest.fn().mockReturnValue({
          getTeamMembers: jest.fn().mockResolvedValue([
            {
              id: 'crm-active',
              name: 'Active master',
              bookable: true,
              suggested_role: 'staff',
            },
          ]),
        }),
      },
      tenantContext,
      {} as never,
    );

    await expect(
      tenantContext.runAsSystemTenant('tenant-1', () =>
        service.assertCrmStaffAccessActive('tenant-1', 'user-1'),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(accessUpdate).toHaveBeenCalledWith({
      where: { id: 'access-1' },
      data: { status: 'disabled' },
    });
    expect(membershipUpdateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        userId: 'user-1',
        status: 'active',
      },
      data: { status: 'suspended' },
    });
    const revokeArgs = sessionUpdateMany.mock.calls[0]?.[0];
    if (!revokeArgs) throw new Error('Expected active sessions to be revoked');
    expect(revokeArgs.where).toEqual({
      tenantId: 'tenant-1',
      userId: 'user-1',
      revokedAt: null,
    });
    expect(revokeArgs.data.revokeReason).toBe('crm_staff_inactive');
    expect(revokeArgs.data.revokedAt).toBeInstanceOf(Date);
  });

  it('does not undo an unrelated manual membership suspension during CRM reconciliation', async () => {
    const membershipUpdateMany = jest.fn();
    const tenantContext = new TenantContextService();
    const service = new CrmService(
      {
        crmStaffAccess: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce({
              externalStaffId: 'crm-active',
              role: UserRole.STAFF,
              status: 'active',
            })
            .mockResolvedValueOnce({ status: 'active' }),
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'access-1',
              externalStaffId: 'crm-active',
              userId: 'user-1',
              role: UserRole.STAFF,
              status: 'active',
            },
          ]),
        },
        crmIntegration: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'crm-1',
            tenantId: 'tenant-1',
            provider: CrmProvider.YCLIENTS,
            encryptedApiToken: 'encrypted',
            baseUrl: null,
            status: CrmIntegrationStatus.ACTIVE,
            settingsJson: { companyId: 42 },
          }),
        },
        $transaction: jest.fn(
          async (run: (tx: Record<string, unknown>) => Promise<void>) =>
            run({
              crmStaffAccess: { update: jest.fn() },
              membership: { updateMany: membershipUpdateMany },
              authSession: { updateMany: jest.fn() },
            }),
        ),
      } as unknown as PrismaService,
      {
        decrypt: jest.fn().mockReturnValue('tenant-token'),
      } as unknown as EncryptionService,
      {
        create: jest.fn().mockReturnValue({
          getTeamMembers: jest.fn().mockResolvedValue([
            {
              id: 'crm-active',
              name: 'Active master',
              bookable: true,
              suggested_role: 'staff',
            },
          ]),
        }),
      },
      tenantContext,
      {} as never,
    );

    await tenantContext.runAsSystemTenant('tenant-1', () =>
      service.assertCrmStaffAccessActive('tenant-1', 'user-1'),
    );

    expect(membershipUpdateMany).not.toHaveBeenCalled();
  });
});
