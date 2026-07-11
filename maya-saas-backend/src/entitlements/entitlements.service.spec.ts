import { PrismaService } from '../prisma/prisma.service';
import { EntitlementsService } from './entitlements.service';
import { FeatureRegistryService } from './feature-registry.service';

describe('EntitlementsService', () => {
  const buildService = (tenant: Record<string, unknown>) => {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue(tenant),
      },
    } as unknown as PrismaService;

    return new EntitlementsService(prisma, new FeatureRegistryService());
  };

  it('expands legacy plan flags into canonical feature keys', async () => {
    const service = buildService({
      id: 'tenant-a',
      planId: 'plan-a',
      plan: {
        featuresJson: { booking: true },
        entitlements: [{ featureKey: 'booking', enabled: true }],
      },
      entitlements: [],
    });

    await expect(
      service.getEffectiveEntitlements('tenant-a'),
    ).resolves.toMatchObject({
      features: {
        booking: true,
        'booking.public': true,
        'booking.customer_app': true,
      },
    });
  });

  it('applies an explicit tenant deny to legacy and canonical aliases', async () => {
    const service = buildService({
      id: 'tenant-a',
      planId: 'plan-a',
      plan: {
        featuresJson: { booking: true },
        entitlements: [{ featureKey: 'booking', enabled: true }],
      },
      entitlements: [
        {
          featureKey: 'booking',
          enabled: false,
          expiresAt: null,
        },
      ],
    });

    const result = await service.getEffectiveEntitlements('tenant-a');

    expect(result.features.booking).toBeUndefined();
    expect(result.features['booking.public']).toBeUndefined();
    expect(result.features['booking.customer_app']).toBeUndefined();
  });

  it('disables a feature when its dependency is missing', async () => {
    const service = buildService({
      id: 'tenant-a',
      planId: 'plan-a',
      plan: {
        featuresJson: {},
        entitlements: [{ featureKey: 'calendar.external', enabled: true }],
      },
      entitlements: [],
    });

    const result = await service.getEffectiveEntitlements('tenant-a');
    expect(result.features['calendar.external']).toBeUndefined();
  });
});
