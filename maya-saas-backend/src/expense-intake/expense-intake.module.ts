import { ExpensesModule } from '../expenses/expenses.module';
import { Module } from '@nestjs/common';
import { AiToolsModule } from '../ai-tools/ai-tools.module';
import { CommunicationDeliveryModule } from '../communication-delivery';
import { EncryptionModule } from '../encryption/encryption.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { ExpenseReminderFoundationModule } from './expense-reminder-foundation.module';
import { ExpenseIntakeSourceService } from './expense-intake-source.service';
import { ExpenseIntakeService } from './expense-intake.service';
import { ExpenseIntakeController,ExpenseIntakeSourceController } from './expense-intake.controller';
import { ExpenseReminderScheduler } from './expense-reminder.scheduler';
@Module({imports:[ExpensesModule,AiToolsModule,CommunicationDeliveryModule,EncryptionModule,PrismaModule,TenancyModule,ExpenseReminderFoundationModule],controllers:[ExpenseIntakeController,ExpenseIntakeSourceController],providers:[ExpenseIntakeSourceService,ExpenseIntakeService,ExpenseReminderScheduler]})
export class ExpenseIntakeModule {}
