import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { TenantsService } from './tenants.service';

type SerializedTenantRecord = {
  id: string;
  name: string;
  slug: string;
  status: string;
  planId: string | null;
  allowSelfRegistration: boolean;
  createdAt: Date;
  updatedAt: Date;
  plan: null;
  brandingSettings: {
    id: string;
    logoUrl: string | null;
    appName: string | null;
    primaryColor: string | null;
    secondaryColor: string | null;
    backgroundImageUrl: string | null;
    fontFamily: string | null;
    buttonRadius: number | null;
    themeJson: Record<string, unknown> | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  crmIntegration: null;
  branches: Array<{
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
    timezone: string | null;
  }>;
  _count: {
    users: number;
    branches: number;
  };
};

describe('TenantsService.createTenant', () => {
  const serializedTenant = (): SerializedTenantRecord => ({
    id: 'tenant-1',
    name: 'Barbershop Griva',
    slug: 'griva',
    status: 'trial',
    planId: null,
    allowSelfRegistration: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    plan: null,
    brandingSettings: {
      id: 'branding-1',
      logoUrl: null,
      appName: 'Barbershop Griva',
      primaryColor: null,
      secondaryColor: null,
      backgroundImageUrl: null,
      fontFamily: null,
      buttonRadius: null,
      themeJson: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    crmIntegration: null,
    branches: [
      {
        id: 'branch-1',
        name: 'Barbershop Griva',
        address: null,
        phone: null,
        timezone: 'Europe/Moscow',
      },
    ],
    _count: {
      users: 0,
      branches: 1,
    },
  });

  it('creates a default branch for every new tenant', async () => {
    const tenantFindUniqueMock = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(serializedTenant());
    const tenantCreateMock = jest.fn().mockResolvedValue({ id: 'tenant-1' });
    const brandingCreateMock = jest.fn().mockResolvedValue(undefined);
    const branchCreateMock = jest.fn().mockResolvedValue(undefined);
    const transactionClient = {
      tenant: {
        create: tenantCreateMock,
      },
      brandingSettings: {
        create: brandingCreateMock,
      },
      branch: {
        create: branchCreateMock,
      },
    };
    const transactionMock = jest
      .fn()
      .mockImplementation((callback: (tx: unknown) => unknown) =>
        Promise.resolve(
          callback({
            tenant: transactionClient.tenant,
            brandingSettings: transactionClient.brandingSettings,
            branch: transactionClient.branch,
          }),
        ),
      );

    const prisma = {
      tenant: {
        findUnique: tenantFindUniqueMock,
      },
      $transaction: transactionMock,
    } as unknown as PrismaService;
    const subscriptionsService = {
      getPlanByIdOrThrow: jest.fn(),
    } as unknown as SubscriptionsService;

    const service = new TenantsService(prisma, subscriptionsService);
    const result = await service.createTenant({
      name: 'Barbershop Griva',
      slug: 'griva',
    });

    expect(transactionMock).toHaveBeenCalled();
    expect(branchCreateMock).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-1',
        name: 'Barbershop Griva',
        address: null,
        phone: null,
        timezone: 'Europe/Moscow',
      },
    });
    expect(result).toMatchObject({
      id: 'tenant-1',
      slug: 'griva',
      branch_count: 1,
      branches: [
        {
          name: 'Barbershop Griva',
          timezone: 'Europe/Moscow',
        },
      ],
    });
  });
});
