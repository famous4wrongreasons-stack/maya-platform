import { Module } from '@nestjs/common';

import { CrmModule } from '../crm/crm.module';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';

@Module({
  imports: [CrmModule],
  controllers: [ServicesController],
  providers: [ServicesService],
})
export class ServicesModule {}
