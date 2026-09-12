import { MeasurementReportReader } from './measurement.report';
import { MeasurementReadService } from './measurement.read.service';
import { MeasurementController } from './measurement.controller';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { MeasurementSources } from './measurement.sources';
import { MeasurementService } from './measurement.service';
import { CrmModule } from '../crm/crm.module';
import { MeasurementFinanceReader } from './measurement.finance';
import { MeasurementReputationReader } from './measurement.reputation';
import { MeasurementOutcomesReader } from './measurement.outcomes';
import { MeasurementStaffGoalReader } from './measurement.staff-goal';
import { ActionEngineModule } from '../action-engine/action-engine.module';
import { ActionEngineKernel } from '../action-engine/action-engine.kernel';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
@Module({
  controllers: [MeasurementController],
  imports: [
    PrismaModule,
    TenancyModule,
    CrmModule,
    ActionEngineModule,
    EntitlementsModule,
  ],
  providers: [
    MeasurementSources,
    MeasurementService,
    MeasurementReadService,
    MeasurementReportReader,
    MeasurementFinanceReader,
    MeasurementReputationReader,
    MeasurementStaffGoalReader,
    {
      provide: MeasurementOutcomesReader,
      inject: [PrismaService, TenantContextService, ActionEngineKernel],
      // Only the existing verified input reader crosses this boundary. The
      // measurement reader receives no executor, registry, cipher or gateway.
      useFactory: (
        prisma: PrismaService,
        context: TenantContextService,
        kernel: ActionEngineKernel,
      ) =>
        new MeasurementOutcomesReader(
          prisma,
          context,
          Object.freeze({
            readTrustedNormalizedInput: (
              tenantId: string,
              executionId: string,
              tx?: Parameters<
                ActionEngineKernel['readTrustedNormalizedInput']
              >[2],
            ) => kernel.readTrustedNormalizedInput(tenantId, executionId, tx),
          }),
        ),
    },
  ],
  exports: [
    MeasurementService,
    MeasurementReadService,
    MeasurementReportReader,
  ],
})
export class MeasurementModule {}
