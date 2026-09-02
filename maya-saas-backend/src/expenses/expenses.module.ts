import { Module } from '@nestjs/common';

import { AuditLogModule } from '../audit-log/audit-log.module';
import { EncryptionModule } from '../encryption/encryption.module';
import { TenantsModule } from '../tenants/tenants.module';
import { ExpensesController } from './expenses.controller';
import { ExpenseCanonicalShadowController } from './expense-canonical-shadow.controller';
import { ExpenseCanonicalShadowService } from './expense-canonical-shadow.service';
import { ExpensesService } from './expenses.service';
import { ActionEngineModule } from '../action-engine';

@Module({
  imports: [
    ActionEngineModule,
    AuditLogModule,
    EncryptionModule,
    TenantsModule,
  ],
  controllers: [ExpensesController, ExpenseCanonicalShadowController],
  providers: [ExpensesService, ExpenseCanonicalShadowService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
