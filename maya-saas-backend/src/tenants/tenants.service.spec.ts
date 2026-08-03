import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { TenantsService } from './tenants.service';

type PublicTenantRecord = {
  id: string;
  name: string;
  slug: string;
  status: string;
  trialEndsAt: Date | null;
  trialFullAccess: boolean;
  currentPeriodEnd: Date | null;
  pastDueAt: Date | null;
  graceEndsAt: Date | null;
  updatedAt: Date;
  calendarSource: string;
  industryPresetId: string | null;
  allowSelfRegistration: boolean;
  plan: {
    featuresJson: Record<string, unknown> | null;
  } | null;
  brandingSettings: {
    appName: string | null;
    logoUrl: string | null;
    primaryColor: string | null;
    secondaryColor: string | null;
    backgroundImageUrl: string | null;
    fontFamily: string | null;
    buttonRadius: number | null;
    themeJson: Record<string, unknown> | null;
  } | null;
  branches: Array<{
    name?: string;
    address: string | null;
    phone: string | null;
  }>;
  crmIntegration: {
    provider: string | null;
    status: string | null;
  } | null;
  _count: {
    internalServices: number;
    internalProviders: number;
    availabilityRules: number;
  };
};

describe('TenantsService', () => {
  const baseTenant = (): PublicTenantRecord => ({
    id: 'tenant-1',
    name: 'Demo Salon',
    slug: 'demo-salon',
    status: 'active',
    trialEndsAt: null,
    trialFullAccess: false,
    currentPeriodEnd: null,
    pastDueAt: null,
    graceEndsAt: null,
    updatedAt: new Date('2026-07-13T12:00:00.000Z'),
    calendarSource: 'external',
    industryPresetId: 'beauty_salon',
    allowSelfRegistration: true,
    plan: {
      featuresJson: {
        booking: true,
      },
    },
    brandingSettings: {
      appName: 'Грива',
      logoUrl: null,
      primaryColor: '#111111',
      secondaryColor: '#C6A86A',
      backgroundImageUrl: null,
      fontFamily: 'Manrope',
      buttonRadius: 18,
      themeJson: {
        city: 'Moscow',
        tagline: 'Свои мастера. Свой ритм.',
        content: {
          hero_tag: 'Добро пожаловать в «Гриву»',
          hero_title: [
            'Грива.',
            'Стрижём так,',
            'что оборачиваются',
            'лишняя строка',
          ],
          stats: [
            ['3', 'года'],
            ['4', 'мастера'],
            ['4.9', 'рейтинг'],
            [' ', 'невалидно'],
          ],
          about: ['Первый абзац', 'Второй абзац', '   '],
          ratings: [
            ['Яндекс', '4.9'],
            ['2ГИС', '4.8'],
            ['Пусто', ' '],
          ],
          socials: ['Telegram', 'TikTok', '  '],
        },
      },
    },
    branches: [
      {
        name: 'Основной филиал',
        address: 'Moscow, Tverskaya 1',
        phone: '+79990000000',
      },
    ],
    crmIntegration: {
      provider: 'yclients',
      status: 'active',
    },
    _count: {
      internalServices: 0,
      internalProviders: 0,
      availabilityRules: 0,
    },
  });

  const createService = () => {
    const tenantFindUniqueMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<PublicTenantRecord | null>
    > = jest.fn().mockResolvedValue(baseTenant());

    const tenantUpdateManyMock = jest.fn().mockResolvedValue({ count: 1 });
    const tenantFindManyMock = jest.fn().mockResolvedValue([
      {
        slug: 'demo-salon',
        name: 'Demo Salon',
        brandingSettings: {
          appName: 'Грива',
          themeJson: { city: 'Moscow' },
        },
        branches: [
          {
            name: 'Основной филиал',
            address: 'Moscow, Tverskaya 1',
          },
        ],
      },
    ]);
    const prisma: Pick<PrismaService, 'tenant'> = {
      tenant: {
        findUnique: tenantFindUniqueMock,
        findMany: tenantFindManyMock,
        updateMany: tenantUpdateManyMock,
      } as PrismaService['tenant'],
    };
    const subscriptionsService: Pick<
      SubscriptionsService,
      'getPlanByIdOrThrow'
    > = {
      getPlanByIdOrThrow:
        jest.fn() as SubscriptionsService['getPlanByIdOrThrow'],
    };

    return {
      service: new TenantsService(
        prisma as PrismaService,
        subscriptionsService as SubscriptionsService,
      ),
      mocks: {
        tenantFindUniqueMock,
        tenantFindManyMock,
        tenantUpdateManyMock,
      },
    };
  };

  it('finds only client-ready businesses by name and city', async () => {
    const { service, mocks } = createService();

    const result = await service.searchPublicMobileConfigs('Грива', 'Moscow');

    expect(mocks.tenantFindManyMock).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      slug: 'demo-salon',
      guest_access_ready: true,
    });
  });

  it('rejects empty public business searches', async () => {
    const { service } = createService();

    await expect(service.searchPublicMobileConfigs(' ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('promotes normalized tenant content into top-level mobile config', async () => {
    const { service } = createService();

    const result = await service.getPublicMobileConfig('demo-salon');

    expect(result).toMatchObject({
      slug: 'demo-salon',
      brand: {
        name: 'Грива',
        address: 'Moscow, Tverskaya 1',
        phone: '+79990000000',
      },
      tenant_status: 'active',
      allow_self_registration: true,
      client_registration_enabled: true,
      guest_access_ready: true,
      guest_access_blockers: [],
      booking_mode: 'preview',
      booking_live_enabled: false,
      industry_preset: {
        id: 'beauty_salon',
        terminology: {
          providerSingular: 'Мастер',
          locationSingular: 'Салон',
        },
      },
      content: {
        hero_tag: 'Добро пожаловать в «Гриву»',
        hero_title: ['Грива.', 'Стрижём так,', 'что оборачиваются'],
        stats: [
          ['3', 'года'],
          ['4', 'мастера'],
          ['4.9', 'рейтинг'],
        ],
        about: ['Первый абзац', 'Второй абзац'],
        ratings: [
          ['Яндекс', '4.9'],
          ['2ГИС', '4.8'],
        ],
        socials: ['Telegram', 'TikTok'],
      },
      branding: {
        theme_json: {
          content: {
            hero_tag: 'Добро пожаловать в «Гриву»',
          },
        },
      },
    });
  });

  it('returns null content when tenant theme has no usable content layer', async () => {
    const {
      service,
      mocks: { tenantFindUniqueMock },
    } = createService();
    const tenant = baseTenant();

    tenantFindUniqueMock.mockResolvedValue({
      ...tenant,
      brandingSettings: {
        ...tenant.brandingSettings,
        themeJson: {
          city: 'Moscow',
          content: {
            hero_title: ['   '],
            stats: [['', '']],
          },
        },
      },
    });

    const result = await service.getPublicMobileConfig('demo-salon');

    expect(result.content).toBeNull();
  });

  it('exposes live booking mode only when the tenant is fully eligible', async () => {
    const {
      service,
      mocks: { tenantFindUniqueMock },
    } = createService();
    const tenant = baseTenant();

    tenantFindUniqueMock.mockResolvedValue({
      ...tenant,
      brandingSettings: {
        ...tenant.brandingSettings,
        themeJson: {
          ...(tenant.brandingSettings?.themeJson ?? {}),
          booking: {
            mode: 'live',
          },
        },
      },
    });

    const result = await service.getPublicMobileConfig('demo-salon');

    expect(result.booking_mode).toBe('live');
    expect(result.booking_live_enabled).toBe(true);
  });

  it('exposes live booking for a ready internal calendar without a CRM', async () => {
    const {
      service,
      mocks: { tenantFindUniqueMock },
    } = createService();
    const tenant = baseTenant();

    tenantFindUniqueMock.mockResolvedValue({
      ...tenant,
      calendarSource: 'internal',
      crmIntegration: null,
      _count: {
        internalServices: 1,
        internalProviders: 1,
        availabilityRules: 5,
      },
      brandingSettings: {
        ...tenant.brandingSettings,
        themeJson: {
          ...(tenant.brandingSettings?.themeJson ?? {}),
          booking: {
            mode: 'live',
          },
        },
      },
    });

    const result = await service.getPublicMobileConfig('demo-salon');

    expect(result.calendar_source).toBe('internal');
    expect(result.booking_mode).toBe('live');
    expect(result.booking_live_enabled).toBe(true);
  });

  it('keeps an incomplete internal calendar in preview mode', async () => {
    const {
      service,
      mocks: { tenantFindUniqueMock },
    } = createService();
    const tenant = baseTenant();

    tenantFindUniqueMock.mockResolvedValue({
      ...tenant,
      calendarSource: 'internal',
      crmIntegration: null,
      _count: {
        internalServices: 1,
        internalProviders: 0,
        availabilityRules: 1,
      },
      brandingSettings: {
        ...tenant.brandingSettings,
        themeJson: {
          ...(tenant.brandingSettings?.themeJson ?? {}),
          booking: {
            mode: 'live',
          },
        },
      },
    });

    const result = await service.getPublicMobileConfig('demo-salon');

    expect(result.booking_mode).toBe('preview');
    expect(result.booking_live_enabled).toBe(false);
    expect(result.guest_access_ready).toBe(false);
    expect(result.guest_access_blockers).toContain(
      'internal_calendar_not_ready',
    );
  });

  it('keeps client registration disabled for trial tenants even if self-registration is on', async () => {
    const {
      service,
      mocks: { tenantFindUniqueMock },
    } = createService();
    const tenant = baseTenant();

    tenantFindUniqueMock.mockResolvedValue({
      ...tenant,
      status: 'trial',
      brandingSettings: {
        ...tenant.brandingSettings,
        themeJson: {
          ...(tenant.brandingSettings?.themeJson ?? {}),
          booking: {
            mode: 'live',
          },
        },
      },
    });

    const result = await service.getPublicMobileConfig('demo-salon');

    expect(result.client_registration_enabled).toBe(false);
    expect(result.guest_access_ready).toBe(false);
    expect(result.booking_mode).toBe('preview');
    expect(result.booking_live_enabled).toBe(false);
  });

  it('marks the neutral MAYA OS tenant as a platform bootstrap', async () => {
    const {
      service,
      mocks: { tenantFindUniqueMock },
    } = createService();
    const tenant = baseTenant();

    tenantFindUniqueMock.mockResolvedValue({
      ...tenant,
      slug: 'maya-os',
      allowSelfRegistration: false,
      brandingSettings: {
        ...tenant.brandingSettings,
        themeJson: {
          ...(tenant.brandingSettings?.themeJson ?? {}),
          platform_bootstrap: true,
        },
      },
    });

    const result = await service.getPublicMobileConfig('maya-os');

    expect(result.platform_bootstrap).toBe(true);
    expect(result.client_registration_enabled).toBe(false);
    expect(result.guest_access_ready).toBe(false);
  });

  it('opens client registration and internal live booking for a verified trial', async () => {
    const {
      service,
      mocks: { tenantFindUniqueMock },
    } = createService();
    const tenant = baseTenant();

    tenantFindUniqueMock.mockResolvedValue({
      ...tenant,
      status: 'trial',
      trialFullAccess: true,
      trialEndsAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      calendarSource: 'internal',
      crmIntegration: null,
      _count: {
        internalServices: 1,
        internalProviders: 1,
        availabilityRules: 5,
      },
      brandingSettings: {
        ...tenant.brandingSettings,
        themeJson: {
          ...(tenant.brandingSettings?.themeJson ?? {}),
          booking: { mode: 'live' },
        },
      },
    });

    const result = await service.getPublicMobileConfig('demo-salon');

    expect(result.access_state).toBe('trial_active');
    expect(result.client_registration_enabled).toBe(true);
    expect(result.guest_access_ready).toBe(true);
    expect(result.booking_mode).toBe('live');
    expect(result.trial_full_access).toBe(true);
  });

  it('keeps public features available during the three-day grace period', async () => {
    const {
      service,
      mocks: { tenantFindUniqueMock, tenantUpdateManyMock },
    } = createService();
    const tenant = baseTenant();

    tenantFindUniqueMock.mockResolvedValue({
      ...tenant,
      status: 'trial',
      trialFullAccess: true,
      trialEndsAt: new Date(Date.now() - 60_000),
    });

    const result = await service.getPublicMobileConfig('demo-salon');

    expect(result).toMatchObject({
      active: true,
      tenant_status: 'past_due',
      access_state: 'past_due_grace',
      subscription_required: false,
      client_registration_enabled: true,
      guest_access_ready: true,
      booking_mode: 'preview',
      subscription_cta: null,
    });
    expect(tenantUpdateManyMock).toHaveBeenCalledWith({
      where: {
        id: tenant.id,
        status: 'trial',
        updatedAt: tenant.updatedAt,
      },
      data: {
        status: 'past_due',
        trialFullAccess: false,
        pastDueAt: expect.any(Date) as Date,
        graceEndsAt: expect.any(Date) as Date,
      },
    });
  });

  it('returns a subscription CTA after the persisted grace period', async () => {
    const {
      service,
      mocks: { tenantFindUniqueMock },
    } = createService();
    const tenant = baseTenant();
    const now = Date.now();

    tenantFindUniqueMock.mockResolvedValue({
      ...tenant,
      status: 'past_due',
      trialFullAccess: false,
      trialEndsAt: new Date(now - 4 * 24 * 60 * 60 * 1000),
      pastDueAt: new Date(now - 4 * 24 * 60 * 60 * 1000),
      graceEndsAt: new Date(now - 24 * 60 * 60 * 1000),
    });

    const result = await service.getPublicMobileConfig('demo-salon');

    expect(result).toMatchObject({
      active: false,
      tenant_status: 'past_due',
      access_state: 'subscription_required',
      subscription_required: true,
      client_registration_enabled: false,
      guest_access_ready: false,
      booking_mode: 'preview',
      subscription_cta: {
        plans_path: '/api/billing/plans',
      },
    });
  });

  it('keeps requested live booking in preview while only mock CRM is connected', async () => {
    const {
      service,
      mocks: { tenantFindUniqueMock },
    } = createService();
    const tenant = baseTenant();

    tenantFindUniqueMock.mockResolvedValue({
      ...tenant,
      crmIntegration: {
        provider: 'mock',
        status: 'active',
      },
      brandingSettings: {
        ...tenant.brandingSettings,
        themeJson: {
          ...(tenant.brandingSettings?.themeJson ?? {}),
          booking: {
            mode: 'live',
          },
        },
      },
    });

    const result = await service.getPublicMobileConfig('demo-salon');

    expect(result.booking_mode).toBe('preview');
    expect(result.booking_live_enabled).toBe(false);
    expect(result.guest_access_ready).toBe(false);
    expect(result.guest_access_blockers).toContain('mock_crm_only');
  });

  it('allows server-side live booking only for an eligible tenant', async () => {
    const {
      service,
      mocks: { tenantFindUniqueMock },
    } = createService();
    const tenant = baseTenant();

    tenantFindUniqueMock.mockResolvedValue({
      ...tenant,
      brandingSettings: {
        ...tenant.brandingSettings,
        themeJson: {
          ...(tenant.brandingSettings?.themeJson ?? {}),
          booking: {
            mode: 'live',
          },
        },
      },
    });

    await expect(
      service.assertLiveBookingEnabled('tenant-1'),
    ).resolves.toMatchObject({
      effectiveMode: 'live',
      liveEligible: true,
    });
  });

  it('rejects direct live booking while the effective mode is preview', async () => {
    const {
      service,
      mocks: { tenantFindUniqueMock },
    } = createService();
    const tenant = baseTenant();

    tenantFindUniqueMock.mockResolvedValue({
      ...tenant,
      crmIntegration: {
        provider: 'mock',
        status: 'active',
      },
      brandingSettings: {
        ...tenant.brandingSettings,
        themeJson: {
          ...(tenant.brandingSettings?.themeJson ?? {}),
          booking: {
            mode: 'live',
          },
        },
      },
    });

    await expect(
      service.assertLiveBookingEnabled('tenant-1'),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: 'live_booking_disabled',
          mode: 'preview',
        },
      },
    });
    await expect(
      service.assertLiveBookingEnabled('tenant-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
