import { Module } from '@nestjs/common';

import { InternalCalendarModule } from '../internal-calendar/internal-calendar.module';
import { CrmAdapterFactory } from './crm-adapter.factory';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';

@Module({
  imports: [InternalCalendarModule],
  controllers: [CrmController],
  providers: [CrmAdapterFactory, CrmService],
  exports: [CrmService],
})
export class CrmModule {}
