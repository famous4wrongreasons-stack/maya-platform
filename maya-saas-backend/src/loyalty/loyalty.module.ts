import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ActionEngineModule,
  ActionEngineRuntimeService,
} from '../action-engine';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { CrmModule } from '../crm/crm.module';
import { EncryptionModule } from '../encryption/encryption.module';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersModule } from '../users/users.module';
import {
  AdminLoyaltyController,
  LoyaltyController,
} from './loyalty.controller';
import { LegacyLoyaltyExpiryShadowController } from './legacy-loyalty-expiry-shadow.controller';
import { LegacyLoyaltyExpiryShadowService } from './legacy-loyalty-expiry-shadow.service';
import { LegacyLoyaltyRedemptionShadowController } from './legacy-loyalty-redemption-shadow.controller';
import { LegacyLoyaltyRedemptionShadowService } from './legacy-loyalty-redemption-shadow.service';
import { LegacyLoyaltyRefundShadowController } from './legacy-loyalty-refund-shadow.controller';
import { LegacyLoyaltyRefundShadowService } from './legacy-loyalty-refund-shadow.service';
import { LegacyLoyaltyImportShadowController } from './legacy-loyalty-import-shadow.controller';
import { LegacyLoyaltyImportShadowService } from './legacy-loyalty-import-shadow.service';
import { LegacyLoyaltyBackfillShadowController } from './legacy-loyalty-backfill-shadow.controller';
import { LegacyLoyaltyBackfillShadowService } from './legacy-loyalty-backfill-shadow.service';
import { LegacyLoyaltyGrantIssueShadowController } from './legacy-loyalty-grant-issue-shadow.controller';
import { LegacyLoyaltyGrantIssueShadowService } from './legacy-loyalty-grant-issue-shadow.service';
import { LegacyLoyaltyGrantConsumeShadowController } from './legacy-loyalty-grant-consume-shadow.controller';
import { LegacyLoyaltyGrantConsumeShadowService } from './legacy-loyalty-grant-consume-shadow.service';
import { LegacyLoyaltyShadowController } from './legacy-loyalty-shadow.controller';
import { LegacyLoyaltyShadowService } from './legacy-loyalty-shadow.service';
import { LoyaltyService } from './loyalty.service';
import { P403LegacyLoyaltyExecutableService } from './p4-03-legacy-loyalty-executable.service';

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
    LegacyLoyaltyRedemptionShadowController,
    LegacyLoyaltyRefundShadowController,
    LegacyLoyaltyImportShadowController,
    LegacyLoyaltyBackfillShadowController,
    LegacyLoyaltyGrantIssueShadowController,
    LegacyLoyaltyGrantConsumeShadowController,
  ],
  providers: [
    LoyaltyService,
    LegacyLoyaltyShadowService,
    LegacyLoyaltyExpiryShadowService,
    LegacyLoyaltyRedemptionShadowService,
    LegacyLoyaltyRefundShadowService,
    LegacyLoyaltyImportShadowService,
    LegacyLoyaltyBackfillShadowService,
    LegacyLoyaltyGrantIssueShadowService,
    LegacyLoyaltyGrantConsumeShadowService,
    {
      provide: P403LegacyLoyaltyExecutableService,
      useFactory: (
        prisma: PrismaService,
        actionEngine: ActionEngineRuntimeService,
        encryption: EncryptionService,
        config: ConfigService,
      ) =>
        new P403LegacyLoyaltyExecutableService(
          prisma,
          actionEngine,
          encryption,
          {
            redemptionCodePepper: requiredRedemptionCodePepper(config),
          },
        ),
      inject: [
        PrismaService,
        ActionEngineRuntimeService,
        EncryptionService,
        ConfigService,
      ],
    },
  ],
  exports: [LoyaltyService, P403LegacyLoyaltyExecutableService],
})
export class LoyaltyModule {}

function requiredRedemptionCodePepper(config: ConfigService): string {
  const value = config
    .get<string>('MAYA_LOYALTY_REDEMPTION_CODE_PEPPER')
    ?.trim();
  if (!value || value.length < 32) {
    throw new Error(
      'MAYA_LOYALTY_REDEMPTION_CODE_PEPPER must contain at least 32 characters',
    );
  }
  return value;
}
