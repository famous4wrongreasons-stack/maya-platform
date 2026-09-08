import { Module } from '@nestjs/common';
import { ActionEngineModule } from '../action-engine/action-engine.module';
import { PrismaModule } from '../prisma/prisma.module';
import { EncryptionModule } from '../encryption/encryption.module';
import { PublicCommunityGatewayService } from './public-community-gateway.service';
import { PublicCommunityService } from './public-community.service';
import { PublicCommunityModerationController, PublicCommunitySourceController } from './public-community.controller';
@Module({ imports: [PrismaModule, EncryptionModule, ActionEngineModule], providers: [PublicCommunityGatewayService, PublicCommunityService], controllers: [PublicCommunityModerationController, PublicCommunitySourceController], exports: [PublicCommunityService] })
export class PublicCommunityModule {}
