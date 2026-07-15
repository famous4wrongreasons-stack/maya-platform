import { Injectable, NotFoundException } from '@nestjs/common';

import {
  MAYA_FEATURE_KEYS,
  MAYA_FEATURE_READINESS,
  MAYA_FEATURE_REGISTRY,
  MayaFeatureKey,
  isMayaFeatureKey,
} from '../common/feature-catalog';

@Injectable()
export class FeatureRegistryService {
  list() {
    return MAYA_FEATURE_KEYS.map((key) => ({
      key,
      ...MAYA_FEATURE_REGISTRY[key],
      ...MAYA_FEATURE_READINESS[key],
    }));
  }

  get(featureKey: string) {
    if (!isMayaFeatureKey(featureKey)) {
      throw new NotFoundException(`Unknown feature: ${featureKey}`);
    }

    return {
      key: featureKey,
      ...MAYA_FEATURE_REGISTRY[featureKey],
      ...MAYA_FEATURE_READINESS[featureKey],
    };
  }

  platformReady(featureKey: MayaFeatureKey): boolean {
    return (
      MAYA_FEATURE_READINESS[featureKey].implementationStatus ===
      'platform_ready'
    );
  }

  platformAvailable(featureKey: MayaFeatureKey): boolean {
    return MAYA_FEATURE_READINESS[featureKey].availableIn.includes(
      'platform_backend',
    );
  }

  dependencies(featureKey: MayaFeatureKey): readonly MayaFeatureKey[] {
    return MAYA_FEATURE_REGISTRY[featureKey].dependencies ?? [];
  }
}
