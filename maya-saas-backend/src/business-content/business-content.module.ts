import { MeasurementModule } from '../measurement/measurement.module';
import { Module } from '@nestjs/common';

import {
  ActionEngineKernel,
  ActionEngineModule,
  CanonicalActionIngressService,
} from '../action-engine';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { Package5Wave4Module } from '../package5-wave4/package5-wave4.module';
import { BusinessContentController } from './business-content.controller';
import { BusinessContentService } from './business-content.service';
import { PrismaService } from '../prisma/prisma.service';
import { P409CanonicalOfferAuthorityService } from './p4-09-canonical-offer-authority.service';
import { P409ValueConfigurationExecutableService } from './p4-09-value-configuration-executable.service';
import { P409ValueConfigurationShadowService } from './p4-09-value-configuration-shadow.service';
import { P409ValueConfigurationCanonicalCutoverService } from './p4-09-value-configuration-canonical-cutover.service';

@Module({
  imports: [
    MeasurementModule,
    ActionEngineModule,
    AuditLogModule,
    Package5Wave4Module,
  ],
  controllers: [BusinessContentController],
  providers: [
    BusinessContentService,
    P409CanonicalOfferAuthorityService,
    P409ValueConfigurationShadowService,
    P409ValueConfigurationCanonicalCutoverService,
    {
      provide: P409ValueConfigurationExecutableService,
      useFactory: (
        prisma: PrismaService,
        ingress: CanonicalActionIngressService,
        kernel: ActionEngineKernel,
      ) => new P409ValueConfigurationExecutableService(prisma, ingress, kernel),
      inject: [
        PrismaService,
        CanonicalActionIngressService,
        ActionEngineKernel,
      ],
    },
  ],
  exports: [BusinessContentService, P409CanonicalOfferAuthorityService],
})
export class BusinessContentModule {}
