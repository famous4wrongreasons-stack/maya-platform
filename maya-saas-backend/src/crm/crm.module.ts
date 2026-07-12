import { Module } from '@nestjs/common';

import { InternalCalendarModule } from '../internal-calendar/internal-calendar.module';
import { CrmAdapterFactory } from './crm-adapter.factory';
import { CrmService } from './crm.service';

@Module({
  imports: [InternalCalendarModule],
  providers: [CrmAdapterFactory, CrmService],
  exports: [CrmService],
})
export class CrmModule {}
