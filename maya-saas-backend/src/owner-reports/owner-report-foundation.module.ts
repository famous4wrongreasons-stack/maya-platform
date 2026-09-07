import { Module } from '@nestjs/common';
import { ActionEngineModule } from '../action-engine';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { OwnerReportStore } from './owner-report.store';

/** Shared persistence/authorization support; OwnerReportsService owns admission. */
@Module({
  imports: [PrismaModule, TenancyModule, ActionEngineModule],
  providers: [OwnerReportStore],
  exports: [OwnerReportStore],
})
export class OwnerReportFoundationModule {}
