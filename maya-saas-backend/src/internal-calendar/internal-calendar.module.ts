import { Module } from '@nestjs/common';

import { Package5Wave4Module } from '../package5-wave4/package5-wave4.module';
import { QuotasModule } from '../quotas/quotas.module';
import { UsersModule } from '../users/users.module';
import { InternalCalendarController } from './internal-calendar.controller';
import { InternalCalendarService } from './internal-calendar.service';

@Module({
  imports: [UsersModule, QuotasModule, Package5Wave4Module],
  controllers: [InternalCalendarController],
  providers: [InternalCalendarService],
  exports: [InternalCalendarService],
})
export class InternalCalendarModule {}
