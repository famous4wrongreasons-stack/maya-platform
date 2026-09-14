import { Module } from '@nestjs/common';

import { QuotasModule } from '../quotas/quotas.module';
import { Package5Wave2Module } from '../package5-wave2/package5-wave2.module';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';

@Module({
  imports: [QuotasModule, Package5Wave2Module],
  controllers: [BranchesController],
  providers: [BranchesService],
  exports: [BranchesService],
})
export class BranchesModule {}
