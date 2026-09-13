import { C8EvaluationService } from './c8.evaluation';
import { C8LabelCollector } from './c8.labels';
import { C8OpportunityBridge } from './c8.opportunity';
import { C8Worker } from './c8.worker';
import { C8RankingService } from './c8.ranking';
import { C8Producer } from './c8.producer';
import { C8CaptureService } from './c8.capture';
import { MeasurementModule } from '../measurement/measurement.module';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { Package5Wave1Module } from '../package5-wave1/package5-wave1.module';
import { C8Store } from './c8.store';
import { C8Sources } from './c8.sources';
@Module({
  imports: [
    PrismaModule,
    TenancyModule,
    Package5Wave1Module,
    MeasurementModule,
  ],
  providers: [
    C8Store,
    C8Sources,
    C8CaptureService,
    C8Producer,
    C8RankingService,
    C8Worker,
    C8OpportunityBridge,
    C8LabelCollector,
    C8EvaluationService,
  ],
  exports: [
    C8Store,
    C8Sources,
    C8Producer,
    C8RankingService,
    C8Worker,
    C8OpportunityBridge,
    C8EvaluationService,
  ],
})
export class C8Module {}
