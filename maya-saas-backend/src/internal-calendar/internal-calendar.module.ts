import { Module } from '@nestjs/common';

import { UsersModule } from '../users/users.module';
import { InternalCalendarController } from './internal-calendar.controller';
import { InternalCalendarService } from './internal-calendar.service';

@Module({
  imports: [UsersModule],
  controllers: [InternalCalendarController],
  providers: [InternalCalendarService],
  exports: [InternalCalendarService],
})
export class InternalCalendarModule {}
