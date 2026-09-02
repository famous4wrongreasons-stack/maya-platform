import { Module } from '@nestjs/common';

import { AuditLogModule } from '../audit-log/audit-log.module';
import { EncryptionModule } from '../encryption/encryption.module';
import { TenantsModule } from '../tenants/tenants.module';
import { ExpensesController } from './expenses.controller';
import { ExpenseCanonicalShadowController } from './expense-canonical-shadow.controller';
import { ExpenseCanonicalShadowService } from './expense-canonical-shadow.service';
import { ExpensesService } from './expenses.service';
import {
  ActionEngineKernel,
  ActionEngineModule,
  CanonicalActionIngressService,
} from '../action-engine';
import { PrismaService } from '../prisma/prisma.service';
import { P407ExpenseCanonicalCutoverService } from './p4-07-expense-canonical-cutover.service';
import { P407ExpenseExecutableService } from './p4-07-expense-executable.service';

@Module({
  imports: [
    ActionEngineModule,
    AuditLogModule,
    EncryptionModule,
    TenantsModule,
  ],
  controllers: [ExpensesController, ExpenseCanonicalShadowController],
  providers: [
    ExpensesService,
    ExpenseCanonicalShadowService,
    P407ExpenseCanonicalCutoverService,
    {
      provide: P407ExpenseExecutableService,
      useFactory: (
        prisma: PrismaService,
        ingress: CanonicalActionIngressService,
        kernel: ActionEngineKernel,
      ) => new P407ExpenseExecutableService(prisma, ingress, kernel),
      inject: [
        PrismaService,
        CanonicalActionIngressService,
        ActionEngineKernel,
      ],
    },
  ],
  exports: [ExpensesService],
})
export class ExpensesModule {}
