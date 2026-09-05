import { Module } from '@nestjs/common';

import { ActionEngineModule } from '../action-engine';
import { PrismaModule } from '../prisma/prisma.module';
import { CommunicationDeliveryService } from './communication-delivery.service';
import { ClientWebPushModule } from '../crm/client-web-push.module';
import { CommunicationWebPushService } from './communication-web-push.service';
import { CommunicationWebPushTransport } from './communication-web-push.transport';

@Module({
  imports: [PrismaModule, ActionEngineModule, ClientWebPushModule],
  providers: [
    CommunicationDeliveryService,
    CommunicationWebPushService,
    CommunicationWebPushTransport,
  ],
  exports: [CommunicationDeliveryService],
})
export class CommunicationDeliveryModule {}
