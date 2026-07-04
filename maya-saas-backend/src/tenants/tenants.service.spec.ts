import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { TenantsService } from './tenants.service';

type PublicTenantRecord = {
  id: string;
  name: string;
  slug: string;
  status: string;
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
    address: string | null;
    phone: string | null;
  }>;
  crmIntegration: {
    provider: string | null;
    status: string | null;
  } | null;
};

describe('TenantsService', () => {
  const baseTenant = (): PublicTenantRecord => ({
    id: 'tenant-1',
    name: 'Demo Salon',
    slug: 'demo-salon',
    status: 'active',
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
        address: 'Moscow, Tverskaya 1',
        phone: '+79990000000',
      },
    ],
    crmIntegration: {
      provider: 'mock',
      status: 'active',
    },
  });

  const createService = () => {
    const tenantFindUniqueMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<PublicTenantRecord | null>
    > = jest.fn().mockResolvedValue(baseTenant());

    const prisma: Pick<PrismaService, 'tenant'> = {
      tenant: {
        findUnique: tenantFindUniqueMock,
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
      },
    };
  };

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
      booking_mode: 'preview',
      booking_live_enabled: false,
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
    expect(result.booking_mode).toBe('preview');
    expect(result.booking_live_enabled).toBe(false);
  });
});
