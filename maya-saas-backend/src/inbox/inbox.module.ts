import { ActionEngineModule } from '../action-engine';
import { OwnerReportFoundationModule } from '../owner-reports/owner-report-foundation.module';
import { CanonicalInboxProjectionService } from './canonical-inbox-projection.service';
import { Module } from '@nestjs/common';

import { CommunicationDeliveryModule } from '../communication-delivery';
import { CommunicationShadowModule } from '../communication-shadow';
import { PrismaModule } from '../prisma/prisma.module';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';

@Module({
  imports: [
    PrismaModule,
    ActionEngineModule,
    OwnerReportFoundationModule,
    CommunicationShadowModule,
    CommunicationDeliveryModule,
  ],
  controllers: [InboxController],
  providers: [InboxService, CanonicalInboxProjectionService],
  exports: [InboxService, CanonicalInboxProjectionService],
})
export class InboxModule {}
