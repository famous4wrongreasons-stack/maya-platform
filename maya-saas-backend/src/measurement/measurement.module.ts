import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { MeasurementSources } from './measurement.sources';
import { MeasurementService } from './measurement.service';
@Module({
  imports: [PrismaModule, TenancyModule],
  providers: [MeasurementSources, MeasurementService],
  exports: [MeasurementService],
})
export class MeasurementModule {}
