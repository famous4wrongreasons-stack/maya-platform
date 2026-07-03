import { Module } from '@nestjs/common';

import { CrmAdapterFactory } from './crm-adapter.factory';
import { CrmService } from './crm.service';

@Module({
  providers: [CrmAdapterFactory, CrmService],
  exports: [CrmService],
})
export class CrmModule {}
