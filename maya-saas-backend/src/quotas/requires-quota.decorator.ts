import { SetMetadata } from '@nestjs/common';

import { QuotaResource } from './quota-resource';

export const REQUIRED_QUOTA_KEY = 'maya:required_quota';

export const RequiresQuota = (resource: QuotaResource, amount = 1) =>
  SetMetadata(REQUIRED_QUOTA_KEY, { resource, amount });
