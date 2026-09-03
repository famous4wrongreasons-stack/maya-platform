import { Module } from '@nestjs/common';

import { CrmModule } from '../crm/crm.module';
import { Package5Wave5Module } from '../package5-wave5/package5-wave5.module';
import { RecoveryController } from './recovery.controller';
import { RecoveryService } from './recovery.service';

@Module({
  imports: [CrmModule, Package5Wave5Module],
  controllers: [RecoveryController],
  providers: [RecoveryService],
  exports: [RecoveryService],
})
export class RecoveryModule {}
