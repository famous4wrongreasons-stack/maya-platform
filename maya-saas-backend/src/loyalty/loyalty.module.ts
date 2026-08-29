import { Module } from '@nestjs/common';

import { ActionEngineModule } from '../action-engine';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { CrmModule } from '../crm/crm.module';
import { EncryptionModule } from '../encryption/encryption.module';
import { UsersModule } from '../users/users.module';
import {
  AdminLoyaltyController,
  LoyaltyController,
} from './loyalty.controller';
import { LegacyLoyaltyExpiryShadowController } from './legacy-loyalty-expiry-shadow.controller';
import { LegacyLoyaltyExpiryShadowService } from './legacy-loyalty-expiry-shadow.service';
import { LegacyLoyaltyShadowController } from './legacy-loyalty-shadow.controller';
import { LegacyLoyaltyShadowService } from './legacy-loyalty-shadow.service';
import { LoyaltyService } from './loyalty.service';

@Module({
  imports: [
    ActionEngineModule,
    CrmModule,
    UsersModule,
    EncryptionModule,
    AuditLogModule,
  ],
  controllers: [
    LoyaltyController,
    AdminLoyaltyController,
    LegacyLoyaltyShadowController,
    LegacyLoyaltyExpiryShadowController,
  ],
  providers: [
    LoyaltyService,
    LegacyLoyaltyShadowService,
    LegacyLoyaltyExpiryShadowService,
  ],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
