import { MAYA_FEATURE_KEYS } from '../common/feature-catalog';
import { FeatureRegistryService } from './feature-registry.service';

describe('FeatureRegistryService', () => {
  const service = new FeatureRegistryService();

  it('publishes readiness for every registered feature', () => {
    const features = service.list();

    expect(features).toHaveLength(MAYA_FEATURE_KEYS.length);
    expect(
      features.every(
        (feature) =>
          Boolean(feature.implementationStatus) &&
          Array.isArray(feature.availableIn),
      ),
    ).toBe(true);
  });

  it('does not present planned flags as platform-ready modules', () => {
    expect(service.get('video_analytics')).toMatchObject({
      implementationStatus: 'planned',
      availableIn: [],
    });
    expect(service.get('domain.custom')).toMatchObject({
      implementationStatus: 'planned',
      availableIn: [],
    });
    expect(service.platformReady('video_analytics')).toBe(false);
  });

  it('publishes backend AI without overstating frontend readiness', () => {
    expect(service.get('client_app')).toMatchObject({
      implementationStatus: 'partial',
    });
    expect(service.platformReady('client_app')).toBe(false);
    expect(service.get('ai.owner')).toMatchObject({
      implementationStatus: 'partial',
      availableIn: ['current_maya', 'platform_backend'],
    });
    expect(service.platformReady('ai.owner')).toBe(false);
    expect(service.platformReady('calendar.internal')).toBe(true);
  });
});
