import { Module } from '@nestjs/common';
import { ActionEngineModule } from '../action-engine';
import { PrismaModule } from '../prisma/prisma.module';
import { EncryptionModule } from '../encryption/encryption.module';
import { Package5Wave4FileObjectStore } from '../package5-wave4/package5-wave4-object-store.service';
import { TeamMessageStore } from './team-message.store';
import { TeamCommunicationsService } from './team-communications.service';
@Module({
  imports: [PrismaModule, EncryptionModule, ActionEngineModule],
  providers: [
    TeamMessageStore,
    TeamCommunicationsService,
    Package5Wave4FileObjectStore,
  ],
  exports: [
    TeamMessageStore,
    TeamCommunicationsService,
    Package5Wave4FileObjectStore,
  ],
})
export class TeamCommunicationsFoundationModule {}
