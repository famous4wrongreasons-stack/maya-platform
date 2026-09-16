import { Injectable, NotFoundException } from '@nestjs/common';

import {
  MAYA_FEATURE_KEYS,
  MAYA_ADD_ON_CATALOG,
  MAYA_FEATURE_READINESS,
  MAYA_FEATURE_REGISTRY,
  MayaFeatureKey,
  isMayaFeatureKey,
} from '../common/feature-catalog';

@Injectable()
export class FeatureRegistryService {
  listAddOns() {
    return MAYA_ADD_ON_CATALOG.map((addOn) => ({
      ...addOn,
      feature_keys: [...addOn.feature_keys],
    }));
  }

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

  /**
   * What a verified full-access trial may switch on: a feature the platform backend offers AND has
   * implemented. A `planned` feature is not implemented, so a trial never grants it.
   *
   * This closes a real gap. `widgets.runtime` is `planned` and offered in `platform_backend`, and it
   * is described as "granted to no plan … reachable only where it is switched on deliberately".
   * Trial expansion used `platformAvailable` alone, so every live full-access trial tenant would
   * have received the widget runtime the moment its tables existed. An explicit per-tenant
   * entitlement is the deliberate switch, and it still grants.
   */
  trialGrantable(featureKey: MayaFeatureKey): boolean {
    return (
      this.platformAvailable(featureKey) &&
      MAYA_FEATURE_READINESS[featureKey].implementationStatus !== 'planned'
    );
  }

  dependencies(featureKey: MayaFeatureKey): readonly MayaFeatureKey[] {
    return MAYA_FEATURE_REGISTRY[featureKey].dependencies ?? [];
  }
}
