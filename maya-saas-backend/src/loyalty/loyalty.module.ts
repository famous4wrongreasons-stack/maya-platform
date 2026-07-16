import { Module } from '@nestjs/common';

import { AuditLogModule } from '../audit-log/audit-log.module';
import { CrmModule } from '../crm/crm.module';
import { EncryptionModule } from '../encryption/encryption.module';
import { UsersModule } from '../users/users.module';
import {
  AdminLoyaltyController,
  LoyaltyController,
} from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';

@Module({
  imports: [CrmModule, UsersModule, EncryptionModule, AuditLogModule],
  controllers: [LoyaltyController, AdminLoyaltyController],
  providers: [LoyaltyService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
