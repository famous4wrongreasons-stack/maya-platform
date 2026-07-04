import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { TenantsService } from './tenants.service';

type TenantRecord = {
  id: string;
  name: string;
  slug: string;
  status: string;
  planId: string | null;
  allowSelfRegistration: boolean;
  createdAt: Date;
  updatedAt: Date;
  plan: {
    id: string;
    name: string;
    priceMonthly: number;
    maxBranches: number;
    maxStaff: number;
    featuresJson: Record<string, unknown> | null;
    isWhiteLabelEnabled: boolean;
  } | null;
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
  crmIntegration: {
    id: string;
    provider: string;
    baseUrl: string | null;
    status: string;
    settingsJson: Record<string, unknown> | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
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

type BrandingUpsertArgs = {
  where: {
    tenantId: string;
  };
  create: {
    tenantId: string;
    themeJson: unknown;
  };
  update: {
    themeJson: unknown;
  };
};

describe('TenantsService.updateTenant', () => {
  const baseTenant = (): TenantRecord => ({
    id: 'tenant-1',
    name: 'Demo Salon',
    slug: 'demo-salon',
    status: 'active',
    planId: 'plan-pro',
    allowSelfRegistration: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    plan: {
      id: 'plan-pro',
      name: 'Pro',
      priceMonthly: 2490,
      maxBranches: 3,
      maxStaff: 20,
      featuresJson: {
        booking: true,
      },
      isWhiteLabelEnabled: true,
    },
    brandingSettings: {
      id: 'branding-1',
      logoUrl: null,
      appName: 'Demo Salon',
      primaryColor: '#111111',
      secondaryColor: '#C6A86A',
      backgroundImageUrl: null,
      fontFamily: 'Manrope',
      buttonRadius: 18,
      themeJson: {
        content: {
          hero_tag: 'Привет',
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    crmIntegration: {
      id: 'crm-1',
      provider: 'yclients',
      baseUrl: null,
      status: 'active',
      settingsJson: {
        companyId: 503759,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    branches: [
      {
        id: 'branch-1',
        name: 'Main',
        address: 'Moscow, Tverskaya 1',
        phone: '+79990000000',
        timezone: 'Europe/Moscow',
      },
    ],
    _count: {
      users: 1,
      branches: 1,
    },
  });

  it('persists requested booking mode and exposes effective live mode in admin payload', async () => {
    const tenantUpdateMock = jest.fn().mockResolvedValue(undefined);
    const brandingUpsertMock: jest.MockedFunction<
      (args: BrandingUpsertArgs) => Promise<void>
    > = jest.fn().mockResolvedValue(undefined);
    const tenantFindFirstMock = jest.fn().mockResolvedValue(null);
    const tenantFindUniqueMock = jest
      .fn()
      .mockResolvedValueOnce(baseTenant())
      .mockResolvedValueOnce({
        ...baseTenant(),
        brandingSettings: {
          ...baseTenant().brandingSettings!,
          themeJson: {
            content: {
              hero_tag: 'Привет',
            },
            booking: {
              mode: 'live',
            },
          },
        },
      });
    const transactionMock = jest
      .fn()
      .mockImplementation((callback: (tx: unknown) => unknown) =>
        Promise.resolve(
          callback({
            tenant: {
              update: tenantUpdateMock,
            },
            brandingSettings: {
              upsert: brandingUpsertMock,
            },
          }),
        ),
      );

    const prisma = {
      tenant: {
        findUnique: tenantFindUniqueMock,
        findFirst: tenantFindFirstMock,
      },
      $transaction: transactionMock,
    } as unknown as PrismaService;
    const subscriptionsService = {
      getPlanByIdOrThrow: jest.fn(),
    } as unknown as SubscriptionsService;

    const service = new TenantsService(prisma, subscriptionsService);
    const result = await service.updateTenant('tenant-1', {
      bookingMode: 'live',
    });

    expect(transactionMock).toHaveBeenCalled();
    const upsertArg = brandingUpsertMock.mock.calls[0]?.[0];

    expect(upsertArg).toBeDefined();
    expect(upsertArg?.where.tenantId).toBe('tenant-1');
    expect(upsertArg?.create.tenantId).toBe('tenant-1');
    expect(upsertArg?.create.themeJson).toBeDefined();
    expect(upsertArg?.update.themeJson).toBeDefined();

    const updateArg = upsertArg?.update.themeJson as {
      booking: { mode: string };
      content: { hero_tag: string };
    };
    expect(updateArg.booking.mode).toBe('live');
    expect(updateArg.content.hero_tag).toBe('Привет');
    expect(result.booking_mode_requested).toBe('live');
    expect(result.booking_mode_effective).toBe('live');
    expect(result.booking_live_enabled).toBe(true);
    expect(result.booking_live_eligible).toBe(true);
    expect(result.booking_live_blockers).toEqual([]);
  });

  it('reports blockers when live is requested but only mock CRM is connected', () => {
    const prisma = {
      tenant: {
        findUnique: jest.fn(),
      },
    } as unknown as PrismaService;
    const subscriptionsService = {
      getPlanByIdOrThrow: jest.fn(),
    } as unknown as SubscriptionsService;
    const service = new TenantsService(prisma, subscriptionsService);

    const result = service.serializeTenant({
      ...baseTenant(),
      crmIntegration: {
        ...baseTenant().crmIntegration!,
        provider: 'mock',
      },
      brandingSettings: {
        ...baseTenant().brandingSettings!,
        themeJson: {
          booking: {
            mode: 'live',
          },
        },
      },
    } as Awaited<ReturnType<TenantsService['getTenantByIdOrThrow']>>);

    expect(result.booking_mode_requested).toBe('live');
    expect(result.booking_mode_effective).toBe('preview');
    expect(result.booking_live_enabled).toBe(false);
    expect(result.booking_live_eligible).toBe(false);
    expect(result.booking_live_blockers).toContain('mock_crm_only');
  });
});
