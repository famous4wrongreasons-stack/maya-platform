import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { CrmIntegrationStatus, CrmProvider } from '../common/domain.enums';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CrmAdapterFactory } from './crm-adapter.factory';
import { CrmService } from './crm.service';

describe('CrmService', () => {
  it('allows provider mock without an explicit apiToken', async () => {
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
        settingsJson: undefined,
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
    ).rejects.toBeInstanceOf(NotFoundException);
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
});
