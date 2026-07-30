import {
  MAYA_PLAN_FEATURES,
  buildFeatureFlags,
  featureKeysFromFlags,
  normalizeFeatureFlags,
} from './feature-catalog';

describe('feature catalog helpers', () => {
  it('builds normalized feature flags from known keys only', () => {
    expect(buildFeatureFlags(['booking', 'analytics', 'unknown'])).toEqual({
      booking: true,
      analytics: true,
    });
  });

  it('normalizes array and object inputs into feature flags', () => {
    expect(normalizeFeatureFlags(['booking', 'shop'])).toEqual({
      booking: true,
      shop: true,
    });
    expect(
      normalizeFeatureFlags({
        booking: true,
        analytics: true,
        unknown: true,
        shop: false,
      }),
    ).toEqual({
      booking: true,
      analytics: true,
    });
  });

  it('extracts canonical feature keys from normalized flags', () => {
    expect(featureKeysFromFlags({ analytics: true, booking: true })).toEqual([
      'booking',
      'analytics',
    ]);
  });

  it('keeps paid plan upgrades monotonic', () => {
    expect(new Set(MAYA_PLAN_FEATURES.business)).toEqual(
      new Set([...MAYA_PLAN_FEATURES.solo, ...MAYA_PLAN_FEATURES.business]),
    );
    expect(new Set(MAYA_PLAN_FEATURES.business_plus)).toEqual(
      new Set([
        ...MAYA_PLAN_FEATURES.business,
        ...MAYA_PLAN_FEATURES.business_plus,
      ]),
    );
  });
});
