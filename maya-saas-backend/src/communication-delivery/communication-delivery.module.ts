import { Module } from '@nestjs/common';

import { ActionEngineModule } from '../action-engine';
import { PrismaModule } from '../prisma/prisma.module';
import { CommunicationDeliveryService } from './communication-delivery.service';

@Module({
  imports: [PrismaModule, ActionEngineModule],
  providers: [CommunicationDeliveryService],
  exports: [CommunicationDeliveryService],
})
export class CommunicationDeliveryModule {}
