import { Module } from '@nestjs/common';

import { AuditLogModule } from '../audit-log/audit-log.module';
import { EncryptionModule } from '../encryption/encryption.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { UsersModule } from '../users/users.module';
import { CrmModule } from '../crm/crm.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [
    UsersModule,
    EncryptionModule,
    AuditLogModule,
    LoyaltyModule,
    CrmModule,
  ],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
