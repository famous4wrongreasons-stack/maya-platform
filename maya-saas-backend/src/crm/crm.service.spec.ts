import { CrmIntegrationStatus, CrmProvider } from '../common/domain.enums';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
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

    const service = new CrmService(prisma, encryptionService, adapterFactory);
    const result = await service.createOrUpdateIntegration('tenant-1', {
      provider: CrmProvider.MOCK,
    });

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
});
