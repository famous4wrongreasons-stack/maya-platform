import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { TenantsService } from './tenants.service';

type TenantRecord = {
  id: string;
  name: string;
  slug: string;
  status: string;
  planId: string | null;
  trialEndsAt: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  pastDueAt: Date | null;
  graceEndsAt: Date | null;
  billingMethodId: string | null;
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
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const baseTenant = (): TenantRecord => ({
    id: 'tenant-1',
    name: 'Demo Salon',
    slug: 'demo-salon',
    status: 'active',
    planId: 'plan-pro',
    trialEndsAt: new Date('2026-07-19T12:00:00.000Z'),
    currentPeriodStart: new Date('2026-07-01T00:00:00.000Z'),
    currentPeriodEnd: new Date('2026-07-31T23:59:59.000Z'),
    pastDueAt: null,
    graceEndsAt: null,
    billingMethodId: null,
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
    expect(result.billing).toMatchObject({
      trial_ends_at: baseTenant().trialEndsAt,
      current_period_start: baseTenant().currentPeriodStart,
      current_period_end: baseTenant().currentPeriodEnd,
      billing_method_attached: false,
    });
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

  it('persists manual billing dates and billing method id through tenant update', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T12:00:00.000Z'));
    const updatedTenant = {
      ...baseTenant(),
      status: 'past_due',
      trialEndsAt: new Date('2026-07-19T12:00:00.000Z'),
      currentPeriodStart: new Date('2026-07-20T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-08-19T23:59:59.000Z'),
      pastDueAt: new Date('2026-07-17T12:00:00.000Z'),
      graceEndsAt: new Date('2026-07-20T12:00:00.000Z'),
      billingMethodId: 'pm_yookassa_saved_card_123',
    };
    const tenantUpdateMock: jest.MockedFunction<
      (args: {
        where: { id: string };
        data: {
          status?: string;
          currentPeriodStart?: Date | null;
          currentPeriodEnd?: Date | null;
          pastDueAt?: Date | null;
          graceEndsAt?: Date | null;
          billingMethodId?: string | null;
        };
      }) => Promise<void>
    > = jest.fn().mockResolvedValue(undefined);
    const tenantFindFirstMock = jest.fn().mockResolvedValue(null);
    const tenantFindUniqueMock = jest
      .fn()
      .mockResolvedValueOnce(baseTenant())
      .mockResolvedValueOnce(updatedTenant);
    const transactionMock = jest
      .fn()
      .mockImplementation((callback: (tx: unknown) => unknown) =>
        Promise.resolve(
          callback({
            tenant: {
              update: tenantUpdateMock,
            },
            brandingSettings: {
              upsert: jest.fn(),
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
      status: 'past_due' as TenantRecord['status'],
      currentPeriodStart: '2026-07-20T00:00:00.000Z',
      currentPeriodEnd: '2026-08-19T23:59:59.000Z',
      billingMethodId: 'pm_yookassa_saved_card_123',
    });

    const [tenantUpdateArgs] = tenantUpdateMock.mock.calls[0] ?? [];

    expect(tenantUpdateArgs.where).toEqual({ id: 'tenant-1' });
    expect(tenantUpdateArgs.data.status).toBe('past_due');
    expect(tenantUpdateArgs.data.currentPeriodStart).toEqual(
      new Date('2026-07-20T00:00:00.000Z'),
    );
    expect(tenantUpdateArgs.data.currentPeriodEnd).toEqual(
      new Date('2026-08-19T23:59:59.000Z'),
    );
    expect(tenantUpdateArgs.data.pastDueAt).toEqual(
      new Date('2026-07-17T12:00:00.000Z'),
    );
    expect(tenantUpdateArgs.data.graceEndsAt).toEqual(
      new Date('2026-07-20T12:00:00.000Z'),
    );
    expect(tenantUpdateArgs.data.billingMethodId).toBe(
      'pm_yookassa_saved_card_123',
    );
    expect(result.billing).toMatchObject({
      current_period_start: new Date('2026-07-20T00:00:00.000Z'),
      current_period_end: new Date('2026-08-19T23:59:59.000Z'),
      billing_method_attached: true,
      billing_method_id: 'pm_yookassa_saved_card_123',
    });
    expect(result.billing.grace_ends_at).toEqual(
      new Date('2026-07-20T12:00:00.000Z'),
    );
  });

  it('clears manual billing dates and billing method id when empty strings are supplied', async () => {
    const clearedTenant = {
      ...baseTenant(),
      trialEndsAt: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      billingMethodId: null,
    };
    const tenantUpdateMock: jest.MockedFunction<
      (args: {
        where: { id: string };
        data: {
          trialEndsAt?: Date | null;
          currentPeriodStart?: Date | null;
          currentPeriodEnd?: Date | null;
          billingMethodId?: string | null;
        };
      }) => Promise<void>
    > = jest.fn().mockResolvedValue(undefined);
    const tenantFindFirstMock = jest.fn().mockResolvedValue(null);
    const tenantFindUniqueMock = jest
      .fn()
      .mockResolvedValueOnce(baseTenant())
      .mockResolvedValueOnce(clearedTenant);
    const transactionMock = jest
      .fn()
      .mockImplementation((callback: (tx: unknown) => unknown) =>
        Promise.resolve(
          callback({
            tenant: {
              update: tenantUpdateMock,
            },
            brandingSettings: {
              upsert: jest.fn(),
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
      trialEndsAt: '',
      currentPeriodStart: '',
      currentPeriodEnd: '',
      billingMethodId: '',
    });

    const [tenantUpdateArgs] = tenantUpdateMock.mock.calls[0] ?? [];

    expect(tenantUpdateArgs.where).toEqual({ id: 'tenant-1' });
    expect(tenantUpdateArgs.data.trialEndsAt).toBeNull();
    expect(tenantUpdateArgs.data.currentPeriodStart).toBeNull();
    expect(tenantUpdateArgs.data.currentPeriodEnd).toBeNull();
    expect(tenantUpdateArgs.data.billingMethodId).toBeNull();
    expect(result.billing).toMatchObject({
      trial_ends_at: null,
      current_period_start: null,
      current_period_end: null,
      billing_method_attached: false,
      billing_method_id: null,
    });
  });
});
