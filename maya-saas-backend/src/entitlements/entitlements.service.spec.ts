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

  it('temporarily grants every implemented platform feature during a verified trial', async () => {
    const service = buildService({
      id: 'tenant-a',
      status: 'trial',
      trialFullAccess: true,
      trialEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
      planId: 'plan-start',
      plan: {
        featuresJson: { booking: true },
        entitlements: [{ featureKey: 'booking', enabled: true }],
      },
      entitlements: [],
    });

    const result = await service.getEffectiveEntitlements('tenant-a');

    expect(result.features['ai.owner']).toBe(true);
    expect(result.features['ai.admin']).toBe(true);
    expect(result.features['ai.consultant']).toBe(true);
    expect(result.features['analytics.business']).toBe(true);
    expect(result.features['expenses.core']).toBe(true);
    expect(result.features.shop).toBeUndefined();
    expect(result.features.video_analytics).toBeUndefined();
  });

  it('does not extend full access after the verified trial expires', async () => {
    const service = buildService({
      id: 'tenant-a',
      status: 'trial',
      trialFullAccess: true,
      trialEndsAt: new Date(Date.now() - 1_000),
      planId: 'plan-start',
      plan: {
        featuresJson: { booking: true },
        entitlements: [{ featureKey: 'booking', enabled: true }],
      },
      entitlements: [],
    });

    const result = await service.getEffectiveEntitlements('tenant-a');

    expect(result.features.booking).toBe(true);
    expect(result.features['ai.owner']).toBeUndefined();
    expect(result.features['ai.consultant']).toBeUndefined();
  });

  it('keeps an explicit tenant deny authoritative during a full trial', async () => {
    const service = buildService({
      id: 'tenant-a',
      status: 'trial',
      trialFullAccess: true,
      trialEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
      planId: 'plan-start',
      plan: { featuresJson: {}, entitlements: [] },
      entitlements: [
        {
          featureKey: 'ai.consultant',
          enabled: false,
          expiresAt: null,
        },
      ],
    });

    const result = await service.getEffectiveEntitlements('tenant-a');

    expect(result.features['ai.owner']).toBe(true);
    expect(result.features['ai.consultant']).toBeUndefined();
  });

  it('returns a server-derived feature decision with the earliest validity horizon', async () => {
    const evaluatedAt = new Date('2026-08-29T12:00:00.000Z');
    const overrideExpiresAt = new Date('2026-08-29T12:02:00.000Z');
    const service = buildService({
      id: 'tenant-a',
      status: 'active',
      trialFullAccess: false,
      trialEndsAt: null,
      planId: 'plan-a',
      plan: {
        featuresJson: {},
        entitlements: [{ featureKey: 'crm.integration', enabled: true }],
      },
      entitlements: [
        {
          featureKey: 'notifications.core',
          enabled: true,
          expiresAt: overrideExpiresAt,
        },
      ],
    });

    await expect(
      service.resolveFeatureRequirements(
        'tenant-a',
        ['crm.integration', 'notifications.core'],
        evaluatedAt,
      ),
    ).resolves.toEqual({
      contract: 'maya.feature-requirement-decision/1',
      tenantId: 'tenant-a',
      planId: 'plan-a',
      requiredFeatures: [
        { featureKey: 'crm.integration', enabled: true },
        { featureKey: 'notifications.core', enabled: true },
      ],
      allowed: true,
      evaluatedAt,
      validUntil: overrideExpiresAt,
    });
  });

  it('fails closed for an unregistered feature requirement', async () => {
    const service = buildService({
      id: 'tenant-a',
      planId: null,
      plan: null,
      entitlements: [],
    });

    await expect(
      service.resolveFeatureRequirements('tenant-a', [
        'caller.selected' as 'crm.integration',
      ]),
    ).rejects.toThrow('Unknown feature requirement');
  });
});
