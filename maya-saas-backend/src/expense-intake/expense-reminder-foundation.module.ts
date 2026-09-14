import { Module } from '@nestjs/common';
import { ActionEngineModule } from '../action-engine';
import { AiToolPolicyModule } from '../ai-tools/ai-tool-policy.module';
import { EncryptionModule } from '../encryption/encryption.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { ExpenseReminderStore } from './expense-reminder.store';
@Module({
  imports: [
    ActionEngineModule,
    AiToolPolicyModule,
    EncryptionModule,
    PrismaModule,
    TenancyModule,
  ],
  providers: [ExpenseReminderStore],
  exports: [ExpenseReminderStore],
})
export class ExpenseReminderFoundationModule {}
