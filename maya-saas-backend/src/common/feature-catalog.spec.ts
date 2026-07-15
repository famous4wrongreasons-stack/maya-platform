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
    expect(new Set(MAYA_PLAN_FEATURES.pro)).toEqual(
      new Set([...MAYA_PLAN_FEATURES.start, ...MAYA_PLAN_FEATURES.pro]),
    );
    expect(new Set(MAYA_PLAN_FEATURES.max)).toEqual(
      new Set([...MAYA_PLAN_FEATURES.pro, ...MAYA_PLAN_FEATURES.max]),
    );
  });
});
