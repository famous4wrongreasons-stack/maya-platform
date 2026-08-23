import { Module } from '@nestjs/common';

import { CommunicationShadowModule } from '../communication-shadow';
import { PrismaModule } from '../prisma/prisma.module';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';

@Module({
  imports: [PrismaModule, CommunicationShadowModule],
  controllers: [InboxController],
  providers: [InboxService],
  exports: [InboxService],
})
export class InboxModule {}
