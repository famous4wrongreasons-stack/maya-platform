import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ClientChannelAuthenticatorService } from './client-channel-authenticator.service';
import { ClientWebPushService } from './client-web-push.service';
import {
  ClientWebPushController,
  LegacyClientWebPushController,
} from './client-web-push.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ClientWebPushController, LegacyClientWebPushController],
  providers: [ClientChannelAuthenticatorService, ClientWebPushService],
  exports: [ClientWebPushService],
})
export class ClientWebPushModule {}
