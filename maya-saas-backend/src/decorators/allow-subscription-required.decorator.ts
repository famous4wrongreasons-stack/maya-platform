import { SetMetadata } from '@nestjs/common';

export const ALLOW_SUBSCRIPTION_REQUIRED_KEY =
  'maya:allow-subscription-required';

export const AllowSubscriptionRequired = () =>
  SetMetadata(ALLOW_SUBSCRIPTION_REQUIRED_KEY, true);
