import { Module } from '@nestjs/common';

import { QuotaGuard } from './quota.guard';
import { QuotaService } from './quota.service';
import { QuotasController } from './quotas.controller';

@Module({
  controllers: [QuotasController],
  providers: [QuotaService, QuotaGuard],
  exports: [QuotaService, QuotaGuard],
})
export class QuotasModule {}
