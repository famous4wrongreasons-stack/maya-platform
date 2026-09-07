import { Module } from '@nestjs/common';
import { ActionEngineModule } from '../action-engine';
import { PrismaModule } from '../prisma/prisma.module';
import { CommunicationDeliveryModule } from '../communication-delivery/communication-delivery.module';
import { ClientChannelAuthenticatorService } from '../crm/client-channel-authenticator.service';
import { CanonicalBulkService } from './canonical-bulk.service';
import {
  CanonicalBulkController,
  LegacyCanonicalBulkController,
} from './canonical-bulk.controller';

@Module({
  imports: [PrismaModule, ActionEngineModule, CommunicationDeliveryModule],
  controllers: [CanonicalBulkController, LegacyCanonicalBulkController],
  providers: [CanonicalBulkService, ClientChannelAuthenticatorService],
  exports: [CanonicalBulkService],
})
export class MarketingModule {}
