import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { MeasurementSources } from './measurement.sources';
import { MeasurementService } from './measurement.service';
import { CrmModule } from '../crm/crm.module';
import { MeasurementFinanceReader } from './measurement.finance';
import { MeasurementReputationReader } from './measurement.reputation';
@Module({
  imports: [PrismaModule, TenancyModule, CrmModule],
  providers: [
    MeasurementSources,
    MeasurementService,
    MeasurementFinanceReader,
    MeasurementReputationReader,
  ],
  exports: [MeasurementService],
})
export class MeasurementModule {}
