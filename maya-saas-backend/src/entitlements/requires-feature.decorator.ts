import { SetMetadata } from '@nestjs/common';

import type { MayaFeatureKey } from '../common/feature-catalog';

export const REQUIRED_FEATURES_KEY = 'requiredFeatures';
export const RequiresFeature = (...featureKeys: MayaFeatureKey[]) =>
  SetMetadata(REQUIRED_FEATURES_KEY, featureKeys);
